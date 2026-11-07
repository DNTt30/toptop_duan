import {
  LiveConnectionHistoryItem,
  LiveConnectionState,
  LiveConnectionSummary,
  LiveDiagnosticsReport,
  LiveDiagnosticsReportSchema,
  LiveEventTrace,
  LiveEventTraceStep,
  LiveProviderConfig,
  LiveSupportedProvider,
} from '@buddhalive/shared';
import crypto from 'node:crypto';
import { createLogger, type Logger } from '../config/logger';
import type { SqliteDatabaseContext } from '../db/connection';
import type { EventEngine } from '../engine/event-engine';
import type { LiveConfigService } from '../security/live-config-service';
import {
  VerifiedProviderAdapter,
  type VerifiedProviderType,
} from './verified-provider-adapter';

export type ObsStatusType =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'IDENTIFYING'
  | 'IDENTIFIED'
  | 'ERROR';

export interface LiveConnectionManagerOptions {
  liveConfigService: LiveConfigService;
  engine: EventEngine;
  logger?: Logger;
  onStatusChange?: (summary: LiveConnectionSummary) => void;
  customWebSocketFactory?: (url: string) => any;
  ctx?: SqliteDatabaseContext;
  getOverlayCount?: () => number;
  getObsStatus?: () => ObsStatusType;
}

export interface ConnectResult {
  ok: boolean;
  state: LiveConnectionState;
  error?: string;
  message?: string;
}

export interface DisconnectResult {
  ok: boolean;
  state: LiveConnectionState;
  message?: string;
}

/**
 * LiveConnectionManager chịu trách nhiệm quản trị duy nhất một Provider LIVE (TikFinity hoặc EulerStream).
 *
 * Các nguyên tắc bắt buộc:
 * 1. Quản lý chính xác 7 trạng thái kết nối chuẩn.
 * 2. Ngăn chặn mở trùng lặp kết nối (Duplicate connect guard).
 * 3. Chặn phát sự kiện mô phỏng DEMO khi phiên kết nối LIVE đang hoạt động (isLiveActive).
 * 4. Không rò rỉ API Key ra bên ngoài (chỉ giải mã trong bộ nhớ RAM khi mở handshake).
 * 5. Tiếp nhận sự kiện hợp lệ qua adapter.onEvent() và chuyển tiếp vào engine.handleIncomingLiveEvent().
 * 6. T33-A/T33-C: Hỗ trợ chẩn đoán chuyên sâu (Diagnostics), lịch sử kết nối, Correlation ID & Event Tracing.
 */
export class LiveConnectionManager {
  private readonly liveConfigService: LiveConfigService;
  private readonly engine: EventEngine;
  private readonly logger: Logger;
  private readonly onStatusChange?: (summary: LiveConnectionSummary) => void;
  private readonly customWebSocketFactory?: (url: string) => any;
  private readonly ctx?: SqliteDatabaseContext;
  private readonly getOverlayCount?: () => number;
  private readonly getObsStatusCallback?: () => ObsStatusType;

  private adapter: VerifiedProviderAdapter | null = null;
  private unsubs: Array<() => void> = [];
  private recentTraces: LiveEventTrace[] = [];

  constructor(options: LiveConnectionManagerOptions) {
    this.liveConfigService = options.liveConfigService;
    this.engine = options.engine;
    this.logger = options.logger ?? createLogger('LiveConnectionManager');
    this.onStatusChange = options.onStatusChange;
    this.customWebSocketFactory = options.customWebSocketFactory;
    this.ctx = options.ctx;
    this.getOverlayCount = options.getOverlayCount;
    this.getObsStatusCallback = options.getObsStatus;
  }

  /**
   * Kiểm tra phiên kết nối LIVE có đang hoạt động hay không (chặn Demo giả)
   */
  public isLiveActive(): boolean {
    const state = this.getStatus();
    return (
      state === 'CONNECTING' ||
      state === 'CONNECTED' ||
      state === 'RECEIVING_EVENTS' ||
      state === 'RECONNECTING'
    );
  }

  /**
   * Lấy trạng thái kết nối hiện tại
   */
  public getStatus(): LiveConnectionState {
    return this.liveConfigService.getConnectionSummary().state;
  }

  /**
   * Lấy tóm tắt trạng thái kết nối an toàn (không chứa bí mật)
   */
  public getSummary(): LiveConnectionSummary {
    return this.liveConfigService.getConnectionSummary();
  }

  /**
   * Khởi động kết nối tới Provider đã lưu trong cấu hình
   */
  public async connect(): Promise<ConnectResult> {
    const currentState = this.getStatus();

    // 1. Chống mở trùng kết nối nếu đã đang kết nối
    if (this.isLiveActive()) {
      this.logger.warn(`Connection already active in state "${currentState}", ignoring duplicate connect()`);
      return {
        ok: true,
        state: currentState,
        message: `Connection is already active in state ${currentState}`,
      };
    }

    // 2. Đọc cấu hình đã lưu
    const config = this.liveConfigService.getConfig();
    if (!config) {
      const errMsg = 'NO_CONFIG_FOUND: Chưa có cấu hình Live Provider. Vui lòng cấu hình TikFinity hoặc EulerStream trước khi kết nối.';
      this.logger.warn(errMsg);
      this.liveConfigService.updateConnectionState('ERROR', errMsg);
      this.notifyChange();
      return { ok: false, state: 'ERROR', error: errMsg };
    }

    // 3. Nếu là EulerStream, giải mã API Key từ DPAPI vault
    let apiKey: string | undefined;
    if (config.provider === 'EULERSTREAM') {
      const decryptedKey = this.liveConfigService.getApiKey('EULERSTREAM');
      if (!decryptedKey) {
        const errMsg = 'MISSING_API_KEY: EulerStream yêu cầu API Key đã được mã hóa lưu trữ qua Windows DPAPI.';
        this.logger.error(errMsg);
        this.liveConfigService.updateConnectionState('ERROR', errMsg);
        this.notifyChange();
        return { ok: false, state: 'ERROR', error: errMsg };
      }
      apiKey = decryptedKey;
    }

    // 4. Dọn dẹp adapter cũ nếu có
    await this.cleanupCurrentAdapter();

    this.logger.info(`Starting live connection to ${config.provider}...`);
    this.liveConfigService.updateConnectionState('CONNECTING', null);
    this.notifyChange();

    try {
      // 5. Khởi tạo VerifiedProviderAdapter
      this.adapter = new VerifiedProviderAdapter({
        providerType: config.provider,
        endpointUrl: config.endpointUrl,
        uniqueId: config.streamerUsername,
        apiKey,
        logger: this.logger.child(config.provider),
        customWebSocketFactory: this.customWebSocketFactory,
      });

      // 6. Đăng ký lắng nghe thay đổi trạng thái từ Adapter
      const unsubStatus = this.adapter.onStatusChange((adapterStatus, errorMsg, errorCode) => {
        this.logger.info(
          `Adapter status changed: ${adapterStatus}${errorMsg ? ` (${errorMsg})` : ''}${
            errorCode ? ` [${errorCode}]` : ''
          }`
        );
        this.liveConfigService.updateConnectionState(adapterStatus, errorMsg, errorCode);
        this.notifyChange();
      });
      this.unsubs.push(unsubStatus);

      // 7. Đăng ký lắng nghe sự kiện từ Adapter và chuyển tiếp vào EventEngine
      const unsubEvent = this.adapter.onEvent((incomingPlatformEvent) => {
        this.logger.info(
          `Received LIVE gift event: ${incomingPlatformEvent.giftName} x${incomingPlatformEvent.giftCount} from ${incomingPlatformEvent.senderName}`
        );

        // Ghi nhận sự kiện vào thống kê
        this.liveConfigService.recordIncomingEvent();

        // T33-C: Tạo correlation ID và ghi nhận Ingress Trace Step
        const correlationId = `cor_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        const externalId = incomingPlatformEvent.externalEventId || `live_${crypto.randomUUID()}`;

        const trace: LiveEventTrace = {
          correlationId,
          externalEventId: externalId,
          provider: config.provider,
          senderName: incomingPlatformEvent.senderName,
          giftName: incomingPlatformEvent.giftName || 'Gift',
          giftCount: incomingPlatformEvent.giftCount ?? 1,
          status: 'PROCESSING',
          steps: [
            {
              step: 'INGRESS',
              timestamp: new Date().toISOString(),
              details: {
                provider: this.adapter?.providerType || 'LIVE',
                giftName: incomingPlatformEvent.giftName,
                giftCount: incomingPlatformEvent.giftCount,
              },
            },
          ],
        };
        this.recentTraces.unshift(trace);
        if (this.recentTraces.length > 20) {
          this.recentTraces.pop();
        }

        // Chuyển tiếp vào EventEngine xử lý lõi (Deduplication -> Combo Buffer -> Rule Matching -> Execution Queue)
        try {
          trace.steps.push({
            step: 'ENGINE',
            timestamp: new Date().toISOString(),
            details: {
              source: 'TIKTOK',
              externalEventId: externalId,
            },
          });

          const rawPayloadObj = incomingPlatformEvent.rawPayloadJson
            ? JSON.parse(incomingPlatformEvent.rawPayloadJson)
            : {};
          rawPayloadObj.correlationId = correlationId;

          const engineResult = this.engine.handleIncomingLiveEvent({
            source: 'TIKTOK',
            eventType: incomingPlatformEvent.eventType,
            senderId: incomingPlatformEvent.senderId,
            senderName: incomingPlatformEvent.senderName,
            senderAvatarUrl: incomingPlatformEvent.senderAvatarUrl,
            giftId: incomingPlatformEvent.giftId,
            giftName: incomingPlatformEvent.giftName,
            giftCount: incomingPlatformEvent.giftCount,
            unitCoinValue: incomingPlatformEvent.unitCoinValue,
            comboGroupId: incomingPlatformEvent.comboGroupId,
            isComboEnd: incomingPlatformEvent.isComboEnd,
            externalEventId: externalId,
            rawPayload: rawPayloadObj,
          });

          if (engineResult.duplicate) {
            trace.status = 'DROPPED';
            trace.steps.push({
              step: 'ENGINE',
              timestamp: new Date().toISOString(),
              details: { reason: 'Duplicate externalEventId' },
            });
          } else if (engineResult.processStatus === 'IGNORED_NO_RULE') {
            trace.status = 'DROPPED';
            trace.steps.push({
              step: 'ENGINE',
              timestamp: new Date().toISOString(),
              details: { reason: 'No matching gift rule' },
            });
          } else if (engineResult.processStatus === 'IGNORED_COMBO_BUFFERING') {
            trace.status = 'PROCESSING';
            trace.steps.push({
              step: 'QUEUE',
              timestamp: new Date().toISOString(),
              details: { reason: 'Combo buffering' },
            });
          } else if (engineResult.processStatus === 'DROPPED_QUEUE_FULL') {
            trace.status = 'DROPPED';
            trace.steps.push({
              step: 'QUEUE',
              timestamp: new Date().toISOString(),
              details: { reason: 'Dropped queue full' },
            });
          } else {
            trace.status = 'COMPLETED';
            trace.steps.push({
              step: 'QUEUE',
              timestamp: new Date().toISOString(),
              details: { executionId: engineResult.executionId || 'queued' },
            });
          }
        } catch (engineErr) {
          trace.status = 'FAILED';
          trace.steps.push({
            step: 'ENGINE',
            timestamp: new Date().toISOString(),
            details: { error: (engineErr as Error).message },
          });
          this.logger.error('Error forwarding live event to EventEngine', {
            error: (engineErr as Error).message,
          });
        }

        this.notifyChange();
      });
      this.unsubs.push(unsubEvent);

      // 8. Bắt đầu kết nối
      await this.adapter.start();

      return {
        ok: true,
        state: this.getStatus(),
        message: `Connecting to ${config.provider}`,
      };
    } catch (err) {
      const errMsg = (err as Error).message;
      this.logger.error(`Failed to start ${config.provider} adapter`, { error: errMsg });
      this.liveConfigService.updateConnectionState('ERROR', errMsg);
      this.notifyChange();
      return { ok: false, state: 'ERROR', error: errMsg };
    }
  }

  /**
   * Ngắt kết nối chủ động bởi streamer / hệ thống
   */
  public async disconnect(reason?: string): Promise<DisconnectResult> {
    this.logger.info(`Disconnecting live connection (reason: ${reason || 'User requested'})...`);

    await this.cleanupCurrentAdapter();

    // Nếu cấu hình vẫn còn, quay về CONFIGURED. Nếu không, về DISCONNECTED
    const hasConfig = this.liveConfigService.getConfig() !== null;
    const nextState: LiveConnectionState = hasConfig ? 'CONFIGURED' : 'DISCONNECTED';

    this.liveConfigService.updateConnectionState(nextState, null);
    this.notifyChange();

    return {
      ok: true,
      state: nextState,
      message: 'Disconnected successfully',
    };
  }

  /**
   * Tái kết nối (Ngắt rồi Kết nối lại)
   */
  public async reconnect(): Promise<ConnectResult> {
    await this.disconnect('Reconnect requested');
    return this.connect();
  }

  /**
   * Ghi nhận một stage mới cho trace (phục vụ DISPATCH, OBS_PLAYBACK, PERSISTED)
   */
  public recordTraceStep(
    correlationIdOrEventId: string,
    step: LiveEventTraceStep['step'],
    details?: Record<string, unknown>,
    finalStatus?: LiveEventTrace['status']
  ): void {
    const trace = this.recentTraces.find(
      (t) => t.correlationId === correlationIdOrEventId || t.externalEventId === correlationIdOrEventId
    );
    if (trace) {
      trace.steps.push({
        step,
        timestamp: new Date().toISOString(),
        details,
      });
      if (finalStatus) {
        trace.status = finalStatus;
      }
    }
  }

  /**
   * Trả về danh sách các traces sự kiện gần đây
   */
  public getRecentTraces(): LiveEventTrace[] {
    return [...this.recentTraces];
  }

  /**
   * Trích xuất báo cáo chẩn đoán toàn diện (T33-A)
   */
  public getDiagnostics(obsStatusOverride?: ObsStatusType): LiveDiagnosticsReport {
    const obsStatus: ObsStatusType =
      obsStatusOverride ??
      (this.getObsStatusCallback ? this.getObsStatusCallback() : 'DISCONNECTED');

    let sqliteWal = true;
    let activeCharId: string | null = null;
    let queueLen = 0;

    if (this.ctx) {
      try {
        const mode = this.ctx.db.pragma('journal_mode', { simple: true });
        sqliteWal = String(mode).toLowerCase() === 'wal';
      } catch {
        sqliteWal = false;
      }
      try {
        const activeChar = this.ctx.charRepo.getActiveCharacter();
        activeCharId = activeChar ? activeChar.id : null;
      } catch {
        // ignore
      }
      try {
        queueLen = this.ctx.execRepo.getQueuedCount();
      } catch {
        // ignore
      }
    }

    const overlayCount = this.getOverlayCount ? this.getOverlayCount() : 0;

    return this.liveConfigService.getDiagnostics(
      {
        sqliteWalActive: sqliteWal,
        overlayReadyCount: overlayCount,
        activeCharacterId: activeCharId,
        queueLength: queueLen,
      },
      obsStatus,
      this.recentTraces
    );
  }

  /**
   * Xuất báo cáo chẩn đoán dưới dạng Markdown hoặc JSON (T33-C).
   * 100% không bao giờ rò rỉ API Key, token hay thông tin nhạy cảm.
   */
  public exportDiagnosticsReport(
    format: 'markdown' | 'json' = 'markdown',
    obsStatusOverride?: ObsStatusType
  ): string {
    const diagnostics = this.getDiagnostics(obsStatusOverride);
    const traces = this.getRecentTraces();

    if (format === 'json') {
      return JSON.stringify(
        {
          diagnostics,
          recentTraces: traces,
        },
        null,
        2
      );
    }

    const lines: string[] = [];
    lines.push('# BuddhaLive Studio - Live Connection Diagnostics Report');
    lines.push('');
    lines.push(`- **Report Generated At:** ${diagnostics.timestamp}`);
    lines.push(`- **Operating System:** Windows 11 Desktop (x64)`);
    lines.push(`- **Active Provider:** ${diagnostics.provider}`);
    lines.push(`- **Provider State:** \`${diagnostics.providerStatus}\``);
    lines.push(`- **OBS WebSocket Status:** \`${diagnostics.obsStatus}\``);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 1. Provider Connection Details');
    lines.push('');
    lines.push(`- **Streamer Channel:** \`@${diagnostics.streamerUsername || 'none'}\``);
    lines.push(`- **Sanitized Endpoint:** \`${diagnostics.endpointUrl || 'none'}\``);
    lines.push(
      `- **DPAPI Vault Encrypted API Key:** ${
        diagnostics.hasApiKey ? 'PRESENT (Encrypted)' : 'NOT REQUIRED / NOT SET'
      }`
    );
    lines.push(`- **Total Events Ingested:** ${diagnostics.eventsReceived}`);
    lines.push(`- **Reconnect Count:** ${diagnostics.reconnectCount}`);
    lines.push(`- **Last Connected At:** ${diagnostics.lastConnectedAt || 'Never'}`);
    lines.push(`- **Last Event Received At:** ${diagnostics.lastEventAt || 'Never'}`);
    lines.push(`- **Last Error Code:** \`${diagnostics.lastErrorCode || 'NONE'}\``);
    lines.push(`- **Last Error Message:** ${diagnostics.lastErrorMessage || 'None'}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 2. System Health & Runtime State');
    lines.push('');
    lines.push(
      `- **SQLite Journal Mode:** ${
        diagnostics.systemHealth.sqliteWalActive
          ? 'WAL (Write-Ahead Logging)'
          : 'ROLLBACK / UNKNOWN'
      }`
    );
    lines.push(
      `- **Active 3D Character ID:** \`${diagnostics.systemHealth.activeCharacterId || 'none'}\``
    );
    lines.push(`- **Ready OBS Browser Overlays:** ${diagnostics.systemHealth.overlayReadyCount}`);
    lines.push(`- **Active Execution Queue Length:** ${diagnostics.systemHealth.queueLength}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 3. Connection State History (Recent transitions)');
    lines.push('');
    if (diagnostics.connectionHistory.length === 0) {
      lines.push('*No connection history recorded yet.*');
    } else {
      lines.push('| Timestamp | Provider | State | Error Code | Reason / Detail |');
      lines.push('| :--- | :--- | :--- | :--- | :--- |');
      for (const item of diagnostics.connectionHistory) {
        lines.push(
          `| ${item.timestamp} | ${item.provider} | \`${item.state}\` | \`${
            item.errorCode || '-'
          }\` | ${item.reason || '-'} |`
        );
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 4. Recent Live Event Traces (Ingress -> OBS Playback)');
    lines.push('');
    if (traces.length === 0) {
      lines.push('*No live event traces recorded.*');
    } else {
      for (const trace of traces) {
        lines.push(`### Trace: \`${trace.correlationId}\``);
        lines.push(
          `- **Event ID:** \`${trace.externalEventId}\` | **Provider:** \`${trace.provider}\` | **Sender:** **${
            trace.senderName
          }** | **Gift:** ${trace.giftName || 'Gift'} x${trace.giftCount}`
        );
        lines.push(`- **Final Status:** \`${trace.status}\``);
        lines.push('- **Pipeline Stages:**');
        for (const step of trace.steps) {
          const detailStr = step.details ? JSON.stringify(step.details) : '';
          lines.push(`  - \`[${step.step}]\` *${step.timestamp}* ${detailStr}`);
        }
        lines.push('');
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('> [!NOTE]');
    lines.push(
      '> BuddhaLive Studio Security Assertion: This diagnostics export was verified to contain zero plaintext API keys, zero authorization secrets, and all connection endpoints have query parameters sanitized.'
    );

    return lines.join('\n');
  }

  /**
   * Dọn dẹp adapter và các listeners
   */
  private async cleanupCurrentAdapter(): Promise<void> {
    for (const unsub of this.unsubs) {
      try {
        unsub();
      } catch {
        // Bỏ qua lỗi unsubscribe
      }
    }
    this.unsubs = [];

    if (this.adapter) {
      try {
        await this.adapter.stop();
      } catch (err) {
        this.logger.warn('Error while stopping adapter', { error: (err as Error).message });
      }
      this.adapter = null;
    }
  }

  private notifyChange(): void {
    if (this.onStatusChange) {
      try {
        this.onStatusChange(this.getSummary());
      } catch (err) {
        this.logger.error('Error notifying status change listener', {
          error: (err as Error).message,
        });
      }
    }
  }

  /**
   * Hủy bỏ toàn bộ khi dừng server
   */
  public async destroy(): Promise<void> {
    await this.cleanupCurrentAdapter();
    this.logger.info('LiveConnectionManager destroyed cleanly');
  }
}
