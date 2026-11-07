import {
  normalizeExternalEventId,
  type DemoTriggerGiftPayload,
  type DemoTriggerGiftResult,
  type EventSource,
  type FallbackReasonCode,
  type LiveEventProcessStatus,
  type OverlayCancelActionPayload,
  type OverlayExecuteActionPayload,
  type OverlayExecutionCompletedPayload,
  type OverlayExecutionFailedPayload,
  type OverlayExecutionStartedPayload,
  type OverlayTelemetryPayload,
  type Vector3Json,
} from '@buddhalive/shared';
import crypto from 'node:crypto';
import type { Logger } from '../config/logger';
import type { SqliteDatabaseContext } from '../db/connection';
import {
  toExecutionSummary,
  type EventExecutionEntity,
} from '../db/repositories/event-execution.repository';
import type { GiftRuleEntity } from '../db/repositories/gift-rule.repository';
import type { LiveEventEntity } from '../db/repositories/live-event.repository';
import {
  ComboBufferService,
  type FlushedComboData,
} from './combo-buffer';

export interface EventEngineBroadcaster {
  emitToOverlays: (event: string, payload: unknown) => void;
  emitToManagers: (event: string, payload: unknown) => void;
  getReadyOverlayCount: () => number;
}

export interface EventEngineOptions {
  comboWindowMs?: number; // Mặc định 1500ms
  starvationThresholdMs?: number; // Mặc định 30_000ms
  maxConsecutiveHighPriority?: number; // Mặc định 3 lượt
  highPriorityThreshold?: number; // Mặc định 20
  maxQueueSize?: number; // Mặc định 30 lượt QUEUED
}

export interface EnqueueExecutionParams {
  liveEvent: LiveEventEntity;
  giftRule: GiftRuleEntity;
  characterId: string;
  animationId: string;
  mergedGiftCount: number;
}

export interface EnqueueExecutionResult {
  action: 'QUEUED' | 'COALESCED' | 'DROPPED_RULE_LIMIT' | 'DROPPED_QUEUE_FULL';
  execution: EventExecutionEntity | null;
  evictedExecution?: EventExecutionEntity | null;
}

export interface IngestLiveEventParams {
  source: EventSource;
  eventType?: 'GIFT' | 'LIKE' | 'CHAT' | 'FOLLOW' | 'SHARE';
  externalEventId?: string | null;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string | null;
  giftId?: string | null;
  giftName?: string | null;
  giftCount?: number;
  unitCoinValue?: number;
  totalCoinValue?: number;
  comboGroupId?: string | null;
  isComboEnd?: boolean;
  rawPayload?: Record<string, unknown>;
}

export interface IngestLiveEventResult {
  liveEventId: string | null;
  executionId: string | null;
  duplicate: boolean;
  processStatus: LiveEventProcessStatus;
}

export class EventEngine {
  private startWatchdogTimer: NodeJS.Timeout | null = null;
  private completionWatchdogTimer: NodeJS.Timeout | null = null;
  private currentDispatchedId: string | null = null;
  private overlayReadyToPlay = false;
  private cancellationBarrierActive = false;
  private cancellationBarrierTimer: NodeJS.Timeout | null = null;

  public readonly comboBuffer: ComboBufferService;
  public consecutiveHighPriorityDispatches = 0;
  public starvationThresholdMs: number;
  public maxConsecutiveHighPriority: number;
  public highPriorityThreshold: number;
  public maxQueueSize: number;

  private lastEnqueuedExecutionId: string | null = null;
  private isPaused = false;

  constructor(
    private readonly ctx: SqliteDatabaseContext,
    private readonly broadcaster: EventEngineBroadcaster,
    private readonly logger: Logger,
    options?: EventEngineOptions
  ) {
    this.starvationThresholdMs = options?.starvationThresholdMs ?? 30_000;
    this.maxConsecutiveHighPriority = options?.maxConsecutiveHighPriority ?? 3;
    this.highPriorityThreshold = options?.highPriorityThreshold ?? 20;
    this.maxQueueSize = options?.maxQueueSize ?? 30;

    const pausedSetting = this.ctx.settingsRepo.get('engine.queue_paused');
    if (pausedSetting) {
      try {
        this.isPaused = JSON.parse(pausedSetting.valueJson) === true;
      } catch {
        this.isPaused = false;
      }
    }

    this.comboBuffer = new ComboBufferService({
      windowMs: options?.comboWindowMs ?? 1500,
      logger: this.logger,
      onComboFlushed: (flushed: FlushedComboData) => {
        const result = this.enqueueExecution({
          liveEvent: flushed.firstEvent,
          giftRule: flushed.matchedRule,
          characterId: flushed.characterId,
          animationId: flushed.animationId,
          mergedGiftCount: flushed.totalGiftCount,
        });
        if (result.execution) {
          this.lastEnqueuedExecutionId = result.execution.id;
        }
      },
    });
  }

  public setOverlayReady(ready: boolean): void {
    this.overlayReadyToPlay = ready;
    if (ready) {
      this.tryDispatchNext();
    }
  }

  public isOverlayReady(): boolean {
    return this.overlayReadyToPlay && this.broadcaster.getReadyOverlayCount() > 0;
  }

  /**
   * Điểm tiếp nhận sự kiện chuẩn cho toàn bộ hệ thống (Demo, TikTok LIVE adapter, v.v.)
   */
  public handleIncomingLiveEvent(params: IngestLiveEventParams): IngestLiveEventResult {
    const senderName = params.senderName.trim();
    const giftCount = params.giftCount ?? 1;
    const unitCoinValue = params.unitCoinValue ?? 10;
    const totalCoinValue = params.totalCoinValue ?? unitCoinValue * giftCount;
    const externalEventId = normalizeExternalEventId(params.externalEventId);
    const nowIso = new Date().toISOString();
    const isComboEnd = params.isComboEnd !== false;

    // 1. Chèn vào live_events (SQLite UNIQUE(source, external_event_id) là phán quyết cuối cùng)
    const insertResult = this.ctx.eventRepo.insert({
      externalEventId,
      source: params.source,
      eventType: params.eventType ?? 'GIFT',
      senderId: params.senderId,
      senderName,
      senderAvatarUrl: params.senderAvatarUrl ?? null,
      giftId: params.giftId ?? null,
      giftName: params.giftName ?? null,
      giftCount,
      unitCoinValue,
      totalCoinValue,
      comboGroupId: params.comboGroupId ?? null,
      isComboEnd,
      processStatus: 'RECEIVED',
      rawPayload: params.rawPayload ?? { senderName, giftCount },
      receivedAt: nowIso,
    });

    if (insertResult.duplicate) {
      this.logger.warn('Ignored duplicate live event by SQLite UNIQUE check', {
        source: params.source,
        externalEventId,
      });
      return {
        liveEventId: insertResult.event.id,
        executionId: null,
        duplicate: true,
        processStatus: insertResult.event.processStatus,
      };
    }

    // 2. Tìm nhân vật đang hoạt động
    const activeChar = this.ctx.charRepo.getActiveCharacter();
    if (!activeChar) {
      this.logger.error('No active character configured');
      this.ctx.eventRepo.updateProcessStatus(insertResult.event.id, 'IGNORED_NO_RULE');
      return {
        liveEventId: insertResult.event.id,
        executionId: null,
        duplicate: false,
        processStatus: 'IGNORED_NO_RULE',
      };
    }

    // 3. Khớp quy tắc quà tặng
    const matchedRule = this.ctx.ruleRepo.findMatchingRule(
      activeChar.id,
      params.giftId ?? null,
      giftCount,
      totalCoinValue
    );

    if (!matchedRule) {
      this.logger.warn('No matching gift rule found for incoming gift', {
        giftId: params.giftId,
        giftCount,
      });
      this.ctx.eventRepo.updateProcessStatus(insertResult.event.id, 'IGNORED_NO_RULE');
      return {
        liveEventId: insertResult.event.id,
        executionId: null,
        duplicate: false,
        processStatus: 'IGNORED_NO_RULE',
      };
    }

    const anim = this.ctx.charRepo.getAnimationById(matchedRule.animationId);
    if (!anim) {
      this.logger.error('Animation referenced by rule not found', {
        animationId: matchedRule.animationId,
      });
      this.ctx.eventRepo.updateProcessStatus(insertResult.event.id, 'IGNORED_NO_RULE');
      return {
        liveEventId: insertResult.event.id,
        executionId: null,
        duplicate: false,
        processStatus: 'IGNORED_NO_RULE',
      };
    }

    // 4. Xử lý theo combo_trigger_mode
    if (matchedRule.comboTriggerMode === 'COMBO_MERGE') {
      this.lastEnqueuedExecutionId = null;
      const comboPushResult = this.comboBuffer.pushEvent(
        insertResult.event,
        matchedRule,
        activeChar.id,
        anim.id
      );

      if (comboPushResult.status === 'BUFFERED_FIRST') {
        return {
          liveEventId: insertResult.event.id,
          executionId: null,
          duplicate: false,
          processStatus: 'RECEIVED',
        };
      }

      if (comboPushResult.status === 'BUFFERED_SUBSEQUENT') {
        this.ctx.eventRepo.updateProcessStatus(
          insertResult.event.id,
          'IGNORED_COMBO_BUFFERING'
        );
        return {
          liveEventId: insertResult.event.id,
          executionId: null,
          duplicate: false,
          processStatus: 'IGNORED_COMBO_BUFFERING',
        };
      }

      // Đã flush (FLUSHED_IMMEDIATELY hoặc FLUSHED_ON_COMBO_END)
      return {
        liveEventId: insertResult.event.id,
        executionId: this.lastEnqueuedExecutionId,
        duplicate: false,
        processStatus: 'MATCHED',
      };
    }

    // Nếu comboTriggerMode !== 'COMBO_MERGE', enqueue trực tiếp
    const enqueueRes = this.enqueueExecution({
      liveEvent: insertResult.event,
      giftRule: matchedRule,
      characterId: activeChar.id,
      animationId: anim.id,
      mergedGiftCount: giftCount,
    });

    let finalProcessStatus: LiveEventProcessStatus = 'MATCHED';
    if (enqueueRes.action === 'COALESCED') {
      finalProcessStatus = 'COALESCED_INTO_QUEUE';
    } else if (enqueueRes.action === 'DROPPED_QUEUE_FULL' || enqueueRes.action === 'DROPPED_RULE_LIMIT') {
      finalProcessStatus = 'DROPPED_QUEUE_FULL';
    }

    return {
      liveEventId: insertResult.event.id,
      executionId: enqueueRes.execution ? enqueueRes.execution.id : null,
      duplicate: false,
      processStatus: finalProcessStatus,
    };
  }

  /**
   * Trigger demo gift (tương thích hoàn toàn API S2)
   */
  public triggerDemoGift(payload: DemoTriggerGiftPayload): DemoTriggerGiftResult {
    const senderName = payload.senderName.trim();
    const giftCount = payload.giftCount ?? 1;
    const externalEventId = payload.externalEventId ?? `demo_${crypto.randomUUID()}`;
    const isComboEnd = payload.isComboEnd !== undefined ? payload.isComboEnd : true;

    return this.handleIncomingLiveEvent({
      source: 'DEMO',
      eventType: 'GIFT',
      externalEventId,
      senderId: `demo_user_${senderName.toLowerCase().replace(/\s+/g, '_')}`,
      senderName,
      giftId: 'lotus',
      giftName: 'Hoa Sen',
      giftCount,
      unitCoinValue: 10,
      totalCoinValue: 10 * giftCount,
      isComboEnd,
      rawPayload: { trigger: 'demo_button', senderName, giftCount },
    });
  }

  /**
   * Đưa một lượt thực thi vào hàng đợi EventExecution theo quy định trần 30, trần 5/rule,
   * COALESCE và EVICTED_BY_PRIORITY trong transaction SQLite nguyên tử.
   */
  public enqueueExecution(params: EnqueueExecutionParams): EnqueueExecutionResult {
    const { liveEvent, giftRule, characterId, animationId, mergedGiftCount } = params;
    const nowIso = new Date().toISOString();

    const tx = this.ctx.db.transaction(() => {
      const totalQueued = this.ctx.execRepo.getQueuedCount();
      const ruleQueued = this.ctx.execRepo.getQueuedCountByRule(giftRule.id);
      const shouldCheckCoalesce =
        totalQueued >= this.maxQueueSize || ruleQueued >= giftRule.maxQueuePerRule;

      // 1. Kiểm tra COALESCE vào bản ghi đang QUEUED khớp khóa 4 trường
      if (shouldCheckCoalesce) {
        const coalesceTarget = this.ctx.execRepo.findQueuedByCoalesceKey(
          giftRule.id,
          liveEvent.source,
          liveEvent.senderId,
          liveEvent.giftId
        );

        if (coalesceTarget) {
          const newMergedCount = coalesceTarget.mergedGiftCount + mergedGiftCount;
          const newCaption = giftRule.overlayTextTemplate
            .replace('{senderName}', liveEvent.senderName)
            .replace('{giftCount}', String(newMergedCount))
            .replace('{giftName}', liveEvent.giftName ?? 'Quà tặng');

          const updatedTarget = this.ctx.execRepo.coalesceIntoQueued(
            coalesceTarget.id,
            mergedGiftCount,
            newCaption
          );

          this.ctx.eventRepo.updateProcessStatus(
            liveEvent.id,
            'COALESCED_INTO_QUEUE'
          );

          return {
            action: 'COALESCED' as const,
            execution: updatedTarget,
            evictedExecution: null,
          };
        }
      }

      // 2. Nếu không khớp COALESCE:
      // 2a. Nếu quy tắc này đã đủ trần (5) -> từ chối
      if (ruleQueued >= giftRule.maxQueuePerRule) {
        this.ctx.eventRepo.updateProcessStatus(liveEvent.id, 'DROPPED_QUEUE_FULL');
        return {
          action: 'DROPPED_RULE_LIMIT' as const,
          execution: null,
          evictedExecution: null,
        };
      }

      // 2b. Nếu tổng hàng đợi QUEUED đã đủ trần (30) -> xét VIP Eviction
      let evictedExecution: EventExecutionEntity | null = null;
      if (totalQueued >= this.maxQueueSize) {
        const lowest = this.ctx.execRepo.findLowestPriorityQueued();
        if (!lowest || giftRule.priority <= lowest.priority) {
          // Quà mới có ưu tiên <= phần tử thấp nhất trong hàng đợi -> từ chối
          this.ctx.eventRepo.updateProcessStatus(liveEvent.id, 'DROPPED_QUEUE_FULL');
          return {
            action: 'DROPPED_QUEUE_FULL' as const,
            execution: null,
            evictedExecution: null,
          };
        }

        // Quà mới là VIP (ưu tiên cao hơn phần tử thấp nhất) -> Đẩy lùi phần tử thấp nhất
        evictedExecution = this.ctx.execRepo.evictByPriority(
          lowest.id,
          nowIso,
          'Evicted by higher priority VIP execution'
        );
      }

      // 3. Chèn bản ghi EventExecution mới vào trạng thái QUEUED
      const anim = this.ctx.charRepo.getAnimationById(animationId);
      const expectedDurationMs = anim ? anim.durationMs : 3000;
      const caption = giftRule.overlayTextTemplate
        .replace('{senderName}', liveEvent.senderName)
        .replace('{giftCount}', String(mergedGiftCount))
        .replace('{giftName}', liveEvent.giftName ?? 'Quà tặng');

      const execution = this.ctx.execRepo.insertQueued({
        liveEventId: liveEvent.id,
        giftRuleId: giftRule.id,
        characterId,
        animationId,
        source: liveEvent.source,
        senderId: liveEvent.senderId,
        senderName: liveEvent.senderName,
        giftId: liveEvent.giftId,
        giftName: liveEvent.giftName,
        mergedGiftCount,
        priority: giftRule.priority,
        renderedCaption: caption,
        expectedDurationMs,
        queuedAt: nowIso,
      });

      this.ctx.eventRepo.updateProcessStatus(liveEvent.id, 'MATCHED');

      return {
        action: 'QUEUED' as const,
        execution,
        evictedExecution,
      };
    });

    const result = tx();

    if (result.action === 'COALESCED' && result.execution) {
      this.logger.info('Coalesced gift into existing queued execution', {
        targetExecutionId: result.execution.id,
        newMergedCount: result.execution.mergedGiftCount,
      });
      this.broadcaster.emitToManagers(
        'execution:status_changed',
        toExecutionSummary(result.execution)
      );
    } else if (result.action === 'QUEUED' && result.execution) {
      if (result.evictedExecution) {
        this.logger.warn('Evicted lower priority execution for incoming VIP', {
          evictedId: result.evictedExecution.id,
          evictedPriority: result.evictedExecution.priority,
          newVipPriority: result.execution.priority,
        });
        this.broadcaster.emitToManagers(
          'execution:status_changed',
          toExecutionSummary(result.evictedExecution)
        );
      }

      this.logger.info('Enqueued new execution', {
        executionId: result.execution.id,
        priority: result.execution.priority,
        senderName: result.execution.senderName,
      });
      this.broadcaster.emitToManagers(
        'execution:status_changed',
        toExecutionSummary(result.execution)
      );

      this.tryDispatchNext();
    } else if (result.action === 'DROPPED_QUEUE_FULL' || result.action === 'DROPPED_RULE_LIMIT') {
      this.logger.warn('Dropped gift event because queue limit was reached without eviction', {
        action: result.action,
        liveEventId: liveEvent.id,
      });
    }

    return result;
  }

  /**
   * Thử rút phần tử tiếp theo trong hàng đợi QUEUED ra phát:
   * Áp dụng quy tắc Chống đói (Anti-starvation) sau 3 lượt ưu tiên cao liên tiếp
   * nếu có bản ghi QUEUED đã chờ >= 30s.
   */
  public tryDispatchNext(): void {
    if (this.isPaused) {
      this.logger.debug('Skipping dispatchNext: Queue processing is PAUSED');
      return;
    }

    if (this.cancellationBarrierActive) {
      this.logger.debug('Skipping dispatchNext: Cancellation barrier is active');
      return;
    }

    // Nếu đang có lượt DISPATCHED hoặc PLAYING -> giữ trong QUEUED
    const active = this.ctx.execRepo.getActiveExecution();
    if (active) {
      return;
    }

    // Nếu không có overlay nào sẵn sàng -> chờ
    if (!this.isOverlayReady()) {
      return;
    }

    let next: EventExecutionEntity | null = null;
    let isStarvationDispatch = false;

    // Kiểm tra quy tắc chống đói trên các bản ghi QUEUED
    if (this.consecutiveHighPriorityDispatches >= this.maxConsecutiveHighPriority) {
      const cutoffTime = new Date(Date.now() - this.starvationThresholdMs).toISOString();
      const starvedCandidates = this.ctx.execRepo.getQueuedOlderThan(cutoffTime);
      const candidate = starvedCandidates[0];
      if (candidate) {
        // Rút bản ghi QUEUED chờ lâu nhất ra phát để giải tỏa đói
        next = candidate;
        isStarvationDispatch = true;
        this.consecutiveHighPriorityDispatches = 0;
        this.logger.info('Anti-starvation rule triggered: dispatching oldest queued execution', {
          executionId: candidate.id,
          priority: candidate.priority,
          queuedAt: candidate.queuedAt,
        });
      }
    }

    // Nếu không kích hoạt chống đói, lấy theo thứ tự ưu tiên chuẩn (priority DESC, queued_at ASC)
    if (!next) {
      next = this.ctx.execRepo.getNextQueued();
      if (!next) {
        return;
      }

      if (next.priority >= this.highPriorityThreshold) {
        this.consecutiveHighPriorityDispatches++;
      } else {
        this.consecutiveHighPriorityDispatches = 0;
      }
    }

    const char = this.ctx.charRepo.getActiveCharacter();
    const anim = next.animationId
      ? this.ctx.charRepo.getAnimationById(next.animationId)
      : null;

    if (!char || !anim) {
      this.ctx.execRepo.updateStatus(next.id, 'FAILED', {
        finishedAt: new Date().toISOString(),
        errorCode: 'MODEL_LOAD_FAILED',
        errorMessage: 'Character or animation missing at dispatch time',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    this.ctx.execRepo.updateStatus(next.id, 'DISPATCHED', {
      dispatchedAt: nowIso,
    });

    this.currentDispatchedId = next.id;

    let pos: Vector3Json = { x: 0, y: -0.5, z: 0 };
    let rot: Vector3Json = { x: 0, y: 0, z: 0 };
    try {
      pos = JSON.parse(char.positionJson);
      rot = JSON.parse(char.rotationJson);
    } catch {
      // Dùng mặc định
    }

    const fallbackAlertSetting = this.ctx.settingsRepo.get('overlay.fallback_2d_alert');
    const demoBadgeSetting = this.ctx.settingsRepo.get('overlay.show_demo_badge');

    const actionPayload: OverlayExecuteActionPayload = {
      executionId: next.id,
      source: next.source,
      characterId: char.id,
      characterName: char.name,
      modelUrl: `/assets/${char.modelPath}`,
      scale: char.scale,
      position: pos,
      rotation: rot,
      clipName: anim.clipName,
      loopMode: anim.loopMode,
      repeatCount: anim.repeatCount,
      senderName: next.senderName,
      giftName: next.giftName ?? 'Quà tặng',
      giftCount: next.mergedGiftCount,
      caption: next.renderedCaption,
      expectedDurationMs: next.expectedDurationMs,
      fallback2dEnabled: fallbackAlertSetting?.valueJson === 'true',
      showDemoBadge: demoBadgeSetting?.valueJson === 'true',
    };

    this.logger.info('Dispatching action to overlay', {
      executionId: next.id,
      clipName: anim.clipName,
      senderName: next.senderName,
      priority: next.priority,
      isStarvationDispatch,
    });

    this.broadcaster.emitToOverlays('overlay:execute_action', actionPayload);

    const updated = this.ctx.execRepo.getById(next.id);
    if (updated) {
      this.broadcaster.emitToManagers(
        'execution:status_changed',
        toExecutionSummary(updated)
      );
    }

    // Bật Start Watchdog (2000ms): nếu overlay không gửi Started -> TIMED_OUT
    this.clearWatchdogs();
    const startTimeoutSetting = this.ctx.settingsRepo.get('engine.start_ack_timeout_ms');
    const startTimeoutMs = startTimeoutSetting ? Number(startTimeoutSetting.valueJson) : 2000;

    this.startWatchdogTimer = setTimeout(() => {
      this.handleStartWatchdogTimeout(next.id);
    }, startTimeoutMs);
  }

  public handleExecutionStarted(payload: OverlayExecutionStartedPayload): void {
    const execution = this.ctx.execRepo.getById(payload.executionId);
    if (!execution || execution.status !== 'DISPATCHED') {
      return;
    }

    this.clearStartWatchdog();
    const nowIso = new Date().toISOString();
    const updated = this.ctx.execRepo.updateStatus(execution.id, 'PLAYING', {
      startedAt: nowIso,
    });

    this.logger.info('Execution started on overlay', { executionId: execution.id });
    if (updated) {
      this.broadcaster.emitToManagers(
        'execution:status_changed',
        toExecutionSummary(updated)
      );
    }

    // Bật Completion Watchdog (expectedDurationMs + 3000ms buffer)
    const bufferSetting = this.ctx.settingsRepo.get('engine.completion_buffer_ms');
    const bufferMs = bufferSetting ? Number(bufferSetting.valueJson) : 3000;
    const totalMs = execution.expectedDurationMs + bufferMs;

    this.completionWatchdogTimer = setTimeout(() => {
      this.handleCompletionWatchdogTimeout(execution.id);
    }, totalMs);
  }

  public handleExecutionCompleted(payload: OverlayExecutionCompletedPayload): void {
    const execution = this.ctx.execRepo.getById(payload.executionId);
    if (!execution || (execution.status !== 'DISPATCHED' && execution.status !== 'PLAYING')) {
      return;
    }

    this.clearWatchdogs();
    const nowIso = new Date().toISOString();

    let targetStatus: 'COMPLETED' | 'COMPLETED_WITH_FALLBACK' = 'COMPLETED';
    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    if (payload.completionMode === 'FALLBACK_2D') {
      targetStatus = 'COMPLETED_WITH_FALLBACK';
      errorCode = payload.fallbackReasonCode ?? 'MODEL_LOAD_FAILED';
      errorMessage =
        payload.fallbackReasonMessage ?? 'Rendered via 2D Fallback Alert';
      this.logger.warn('Execution completed with 2D fallback', {
        executionId: execution.id,
        reason: errorCode,
      });
    } else {
      this.logger.info('Execution completed cleanly in 3D', {
        executionId: execution.id,
      });
    }

    const updated = this.ctx.execRepo.updateStatus(execution.id, targetStatus, {
      finishedAt: nowIso,
      errorCode,
      errorMessage,
    });

    if (updated) {
      this.broadcaster.emitToManagers(
        'execution:status_changed',
        toExecutionSummary(updated)
      );
    }

    // Xét lượt QUEUED tiếp theo
    this.tryDispatchNext();
  }

  public handleExecutionFailed(payload: OverlayExecutionFailedPayload): void {
    const execution = this.ctx.execRepo.getById(payload.executionId);
    if (!execution || (execution.status !== 'DISPATCHED' && execution.status !== 'PLAYING')) {
      return;
    }

    this.clearWatchdogs();
    const nowIso = new Date().toISOString();

    const updated = this.ctx.execRepo.updateStatus(execution.id, 'FAILED', {
      finishedAt: nowIso,
      errorCode: payload.errorCode,
      errorMessage: payload.errorMessage ?? 'Execution failed on overlay',
    });

    this.logger.error('Execution failed on overlay', {
      executionId: execution.id,
      errorCode: payload.errorCode,
    });

    if (updated) {
      this.broadcaster.emitToManagers(
        'execution:status_changed',
        toExecutionSummary(updated)
      );
    }

    this.tryDispatchNext();
  }

  public handleOverlayReloadOrDisconnect(): void {
    this.clearWatchdogs();
    const cancelled = this.ctx.execRepo.cancelActiveOnReload();
    for (const c of cancelled) {
      this.logger.warn('Cancelled active execution due to overlay reload/disconnect', {
        executionId: c.id,
      });
      const current = this.ctx.execRepo.getById(c.id);
      if (current) {
        this.broadcaster.emitToManagers(
          'execution:status_changed',
          toExecutionSummary(current)
        );
      }
    }
  }

  private handleStartWatchdogTimeout(executionId: string): void {
    const execution = this.ctx.execRepo.getById(executionId);
    if (!execution || execution.status !== 'DISPATCHED') return;

    this.logger.error('Start ACK watchdog timed out', { executionId });
    const updated = this.ctx.execRepo.updateStatus(executionId, 'TIMED_OUT', {
      finishedAt: new Date().toISOString(),
      errorCode: 'ACK_TIMEOUT',
      errorMessage: 'Overlay failed to send started ACK within timeout',
    });

    if (updated) {
      this.broadcaster.emitToManagers(
        'execution:status_changed',
        toExecutionSummary(updated)
      );
    }
    this.tryDispatchNext();
  }

  private handleCompletionWatchdogTimeout(executionId: string): void {
    const execution = this.ctx.execRepo.getById(executionId);
    if (!execution || execution.status !== 'PLAYING') return;

    this.logger.error('Completion watchdog timed out', { executionId });
    const updated = this.ctx.execRepo.updateStatus(executionId, 'TIMED_OUT', {
      finishedAt: new Date().toISOString(),
      errorCode: 'COMPLETION_TIMEOUT',
      errorMessage: 'Overlay failed to complete animation within expected duration',
    });

    if (updated) {
      this.broadcaster.emitToManagers(
        'execution:status_changed',
        toExecutionSummary(updated)
      );
    }
    this.tryDispatchNext();
  }

  private clearStartWatchdog(): void {
    if (this.startWatchdogTimer) {
      clearTimeout(this.startWatchdogTimer);
      this.startWatchdogTimer = null;
    }
  }

  private clearWatchdogs(): void {
    this.clearStartWatchdog();
    if (this.completionWatchdogTimer) {
      clearTimeout(this.completionWatchdogTimer);
      this.completionWatchdogTimer = null;
    }
  }

  /* -------------------------------------------------------------------------- */
  /* S5: Queue Controls (T-14)                                                  */
  /* -------------------------------------------------------------------------- */

  public pauseQueue(): boolean {
    this.isPaused = true;
    this.ctx.settingsRepo.set('engine.queue_paused', true);
    this.logger.info('Queue processing PAUSED by operator');
    this.broadcaster.emitToManagers('engine:status_changed', {
      engineStatus: this.getEngineStatus(),
      isPaused: true,
    });
    return true;
  }

  public resumeQueue(): boolean {
    this.isPaused = false;
    this.ctx.settingsRepo.set('engine.queue_paused', false);
    this.logger.info('Queue processing RESUMED by operator');
    this.broadcaster.emitToManagers('engine:status_changed', {
      engineStatus: this.getEngineStatus(),
      isPaused: false,
    });
    this.tryDispatchNext();
    return true;
  }

  public skipCurrent(
    reason = 'Skipped by operator',
    options: { barrierMs?: number } = {}
  ): { success: boolean; skippedId?: string } {
    const active = this.ctx.execRepo.getActiveExecution();
    if (!active) {
      this.logger.warn('Skip rejected: No active execution currently playing/dispatched');
      return { success: false };
    }

    this.clearWatchdogs();
    const updated = this.ctx.execRepo.skipActiveExecution(active.id, reason);

    this.broadcaster.emitToOverlays('overlay:cancel_action', {
      executionId: active.id,
      reason: 'SKIPPED_BY_MANAGER',
    });

    if (updated) {
      this.broadcaster.emitToManagers(
        'execution:status_changed',
        toExecutionSummary(updated)
      );
    }

    this.logger.info('Skipped active execution', { executionId: active.id, reason });

    const barrierMs = options.barrierMs !== undefined ? options.barrierMs : 0;
    if (!this.isPaused) {
      if (barrierMs > 0 && this.isOverlayReady()) {
        this.cancellationBarrierActive = true;
        this.cancellationBarrierTimer = setTimeout(() => {
          this.clearCancellationBarrier();
          if (!this.isPaused) {
            this.tryDispatchNext();
          }
        }, barrierMs);
      } else {
        this.tryDispatchNext();
      }
    }

    return { success: true, skippedId: active.id };
  }

  public handleActionCancelled(_executionId?: string): void {
    if (this.cancellationBarrierActive) {
      this.logger.info('Received action cancelled ACK from overlay, clearing cancellation barrier');
      this.clearCancellationBarrier();
      if (!this.isPaused) {
        this.tryDispatchNext();
      }
    }
  }

  private clearCancellationBarrier(): void {
    this.cancellationBarrierActive = false;
    if (this.cancellationBarrierTimer) {
      clearTimeout(this.cancellationBarrierTimer);
      this.cancellationBarrierTimer = null;
    }
  }

  public clearQueue(reason = 'Cleared by operator'): {
    success: boolean;
    clearedCount: number;
    clearedIds: string[];
  } {
    const res = this.ctx.execRepo.clearQueuedExecutions(reason);
    this.logger.info('Cleared queued executions from queue', {
      clearedCount: res.clearedCount,
      reason,
    });
    return {
      success: true,
      clearedCount: res.clearedCount,
      clearedIds: res.clearedIds,
    };
  }

  public replaceDbContext(newCtx: SqliteDatabaseContext): void {
    (this as any).ctx = newCtx;
    this.logger.info('EventEngine database context replaced after restore');
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  public getActiveExecution(): EventExecutionEntity | null {
    return this.ctx.execRepo.getActiveExecution();
  }

  public getEngineStatus(): 'IDLE' | 'PROCESSING' | 'PAUSED' {
    if (this.isPaused) return 'PAUSED';
    const active = this.ctx.execRepo.getActiveExecution();
    return active ? 'PROCESSING' : 'IDLE';
  }

  public getQueueMetrics(): {
    queued: number;
    playing: number;
    completed: number;
    failed: number;
  } {
    return this.ctx.execRepo.getQueueMetrics();
  }

  public destroy(): void {
    this.clearWatchdogs();
    this.clearCancellationBarrier();
    this.comboBuffer.destroy();
  }
}
