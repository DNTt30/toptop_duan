import type { EventSource } from '@buddhalive/shared';
import type { Logger } from '../config/logger';
import type { GiftRuleEntity } from '../db/repositories/gift-rule.repository';
import type { LiveEventEntity } from '../db/repositories/live-event.repository';

export interface BufferedCombo {
  readonly key: string;
  readonly source: EventSource;
  readonly senderId: string;
  readonly senderName: string;
  readonly giftId: string | null;
  readonly giftName: string | null;
  readonly matchedRule: GiftRuleEntity;
  readonly characterId: string;
  readonly animationId: string;
  readonly firstEvent: LiveEventEntity;
  readonly eventIds: string[];
  totalGiftCount: number;
  totalCoinValue: number;
  readonly windowStartedAt: number;
  readonly windowExpiresAt: number;
  timer: NodeJS.Timeout | null;
}

export interface FlushedComboData {
  firstEvent: LiveEventEntity;
  eventIds: string[];
  matchedRule: GiftRuleEntity;
  characterId: string;
  animationId: string;
  source: EventSource;
  senderId: string;
  senderName: string;
  giftId: string | null;
  giftName: string | null;
  totalGiftCount: number;
  totalCoinValue: number;
}

export type OnComboFlushedCallback = (combo: FlushedComboData) => void;

export interface ComboBufferOptions {
  windowMs?: number; // Mặc định 1500ms theo thiết kế v1.2.0
  logger?: Logger;
  onComboFlushed: OnComboFlushedCallback;
}

export type PushComboResultStatus =
  | 'BUFFERED_FIRST'
  | 'BUFFERED_SUBSEQUENT'
  | 'FLUSHED_IMMEDIATELY'
  | 'FLUSHED_ON_COMBO_END';

export interface PushComboResult {
  status: PushComboResultStatus;
  key: string;
  totalGiftCount: number;
  windowExpiresAt?: number;
}

/**
 * Sinh khóa gộp combo gồm đúng 4 trường: (source, sender_id, gift_id, matched_rule_id).
 * (event-flow.md §2 Tình huống 1)
 */
export function buildComboKey(
  source: EventSource,
  senderId: string,
  giftId: string | null,
  matchedRuleId: string
): string {
  return `${source}::${senderId}::${giftId ?? '__null__'}::${matchedRuleId}`;
}

export class ComboBufferService {
  public readonly windowMs: number;
  private readonly activeBuffers = new Map<string, BufferedCombo>();
  private readonly onComboFlushed: OnComboFlushedCallback;
  private readonly logger?: Logger;
  private isDestroyed = false;

  constructor(options: ComboBufferOptions) {
    this.windowMs = options.windowMs ?? 1500;
    this.onComboFlushed = options.onComboFlushed;
    this.logger = options.logger;
  }

  /**
   * Đưa một LiveEvent vào bộ đệm combo theo cửa sổ cố định 1500ms tính từ event đầu tiên.
   */
  public pushEvent(
    event: LiveEventEntity,
    matchedRule: GiftRuleEntity,
    characterId: string,
    animationId: string
  ): PushComboResult {
    if (this.isDestroyed) {
      throw new Error('ComboBufferService is destroyed');
    }

    const key = buildComboKey(
      event.source,
      event.senderId,
      event.giftId,
      matchedRule.id
    );

    const existing = this.activeBuffers.get(key);

    if (!existing) {
      const now = Date.now();

      // Nếu sự kiện đầu tiên đã báo chốt combo (isComboEnd = true)
      if (event.isComboEnd) {
        this.onComboFlushed({
          firstEvent: event,
          eventIds: [event.id],
          matchedRule,
          characterId,
          animationId,
          source: event.source,
          senderId: event.senderId,
          senderName: event.senderName,
          giftId: event.giftId,
          giftName: event.giftName,
          totalGiftCount: event.giftCount,
          totalCoinValue: event.totalCoinValue,
        });

        return {
          status: 'FLUSHED_IMMEDIATELY',
          key,
          totalGiftCount: event.giftCount,
        };
      }

      // Mở cửa sổ mới 1500ms cố định tính từ event đầu tiên
      const windowExpiresAt = now + this.windowMs;
      const bufferEntry: BufferedCombo = {
        key,
        source: event.source,
        senderId: event.senderId,
        senderName: event.senderName,
        giftId: event.giftId,
        giftName: event.giftName,
        matchedRule,
        characterId,
        animationId,
        firstEvent: event,
        eventIds: [event.id],
        totalGiftCount: event.giftCount,
        totalCoinValue: event.totalCoinValue,
        windowStartedAt: now,
        windowExpiresAt,
        timer: null,
      };

      bufferEntry.timer = setTimeout(() => {
        this.flushCombo(key);
      }, this.windowMs);

      this.activeBuffers.set(key, bufferEntry);
      this.logger?.info('Opened new fixed 1500ms combo window', {
        key,
        senderName: event.senderName,
        windowExpiresAt,
      });

      return {
        status: 'BUFFERED_FIRST',
        key,
        totalGiftCount: event.giftCount,
        windowExpiresAt,
      };
    }

    // Đã có bộ đệm đang mở: tích lũy số lượng và xu, TUYỆT ĐỐI không reset hay gia hạn timer
    existing.eventIds.push(event.id);
    existing.totalGiftCount += event.giftCount;
    existing.totalCoinValue += event.totalCoinValue;

    // Chốt sớm nếu sự kiện tiếp theo có cờ isComboEnd
    if (event.isComboEnd) {
      const finalCount = existing.totalGiftCount;
      this.flushCombo(key);
      return {
        status: 'FLUSHED_ON_COMBO_END',
        key,
        totalGiftCount: finalCount,
      };
    }

    return {
      status: 'BUFFERED_SUBSEQUENT',
      key,
      totalGiftCount: existing.totalGiftCount,
      windowExpiresAt: existing.windowExpiresAt,
    };
  }

  /**
   * Chốt bộ đệm combo và kích hoạt callback thực thi
   */
  public flushCombo(key: string): void {
    const buffer = this.activeBuffers.get(key);
    if (!buffer) return;

    this.activeBuffers.delete(key);
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }

    const { matchedRule, totalGiftCount, totalCoinValue } = buffer;

    // Kiểm tra ngưỡng tối thiểu của quy tắc
    if (
      totalGiftCount < matchedRule.minGiftCount ||
      totalCoinValue < matchedRule.minCoinValue
    ) {
      this.logger?.warn('Combo flushed but fell below rule thresholds', {
        key,
        totalGiftCount,
        minGiftCount: matchedRule.minGiftCount,
        totalCoinValue,
        minCoinValue: matchedRule.minCoinValue,
      });
      return;
    }

    this.logger?.info('Combo window closed - flushing aggregated execution', {
      key,
      totalGiftCount,
      totalCoinValue,
      eventCount: buffer.eventIds.length,
    });

    this.onComboFlushed({
      firstEvent: buffer.firstEvent,
      eventIds: buffer.eventIds,
      matchedRule: buffer.matchedRule,
      characterId: buffer.characterId,
      animationId: buffer.animationId,
      source: buffer.source,
      senderId: buffer.senderId,
      senderName: buffer.senderName,
      giftId: buffer.giftId,
      giftName: buffer.giftName,
      totalGiftCount: buffer.totalGiftCount,
      totalCoinValue: buffer.totalCoinValue,
    });
  }

  public getActiveBuffer(key: string): BufferedCombo | null {
    return this.activeBuffers.get(key) ?? null;
  }

  public getActiveBufferCount(): number {
    return this.activeBuffers.size;
  }

  public destroy(): void {
    this.isDestroyed = true;
    for (const buffer of this.activeBuffers.values()) {
      if (buffer.timer) {
        clearTimeout(buffer.timer);
        buffer.timer = null;
      }
    }
    this.activeBuffers.clear();
  }
}
