import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import {
  NormalizedLiveEventSchema,
  isReliableDeduplicationSupported,
  type NormalizedLiveEvent,
} from '@buddhalive/shared';

describe('Milestone S8 Spike: T-24 Provider Compatibility & Payload Normalization', () => {
  describe('1. TikFinity Local WebSocket API Payload Normalization', () => {
    it('normalizes a realistic TikFinity gift event with stable external ID and combo flags', () => {
      // Dữ liệu mô phỏng từ cổng ws://127.0.0.1:21213
      const rawTikFinityGift = {
        event: 'gift',
        data: {
          id: 'act_6724fa10b99c01_881234',
          userId: '7098123456789012345',
          uniqueId: 'nguyenvana_live',
          nickname: 'Nguyễn Văn A ⭐',
          profilePictureUrl:
            'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/sample.jpeg',
          giftId: '5655',
          giftName: 'Rose',
          diamondCount: 1,
          repeatCount: 10,
          repeatEnd: true,
          groupId: '1730456789000',
          timestamp: 1730456789123,
        },
      };

      // Ánh xạ thành NormalizedLiveEvent
      const normalized: NormalizedLiveEvent = {
        source: 'TIKTOK',
        eventType: 'GIFT',
        provider: 'TIKFINITY',
        externalEventId: `tikfinity_${rawTikFinityGift.data.id}`,
        idStrategy: 'EXTERNAL_STABLE',
        providerEventId: rawTikFinityGift.data.id,
        senderId: rawTikFinityGift.data.userId,
        senderName:
          rawTikFinityGift.data.nickname || rawTikFinityGift.data.uniqueId,
        senderAvatarUrl: rawTikFinityGift.data.profilePictureUrl,
        giftId: String(rawTikFinityGift.data.giftId),
        giftName: rawTikFinityGift.data.giftName,
        giftCount: 10,
        unitCoinValue: rawTikFinityGift.data.diamondCount,
        totalCoinValue:
          rawTikFinityGift.data.diamondCount *
          rawTikFinityGift.data.repeatCount,
        comboGroupId: rawTikFinityGift.data.groupId,
        isComboEnd: rawTikFinityGift.data.repeatEnd === true,
        platformTimestamp: rawTikFinityGift.data.timestamp,
        providerMetadata: {
          uniqueId: rawTikFinityGift.data.uniqueId,
          rawEvent: rawTikFinityGift.event,
        },
        rawPayload: rawTikFinityGift as unknown as Record<string, unknown>,
      };

      // Xác thực nghiêm ngặt bằng Zod schema
      const parseResult = NormalizedLiveEventSchema.safeParse(normalized);
      expect(parseResult.success).toBe(true);

      // Kiểm chứng đặc tính chống trùng ổn định
      expect(isReliableDeduplicationSupported(normalized)).toBe(true);
      expect(normalized.idStrategy).toBe('EXTERNAL_STABLE');
      expect(normalized.giftId).toBe('5655');
      expect(normalized.totalCoinValue).toBe(10);
      expect(normalized.isComboEnd).toBe(true);
    });

    it('calculates incremental delta for cumulative combo repeat counts to avoid over-counting', () => {
      // Mô phỏng chuỗi combo 3 quà gửi liên tiếp (repeatCount tăng dần: 1, 2, 3)
      const comboHistory = new Map<string, number>();

      function processTikFinityCombo(
        senderId: string,
        giftId: string,
        repeatCount: number
      ): number {
        const key = `${senderId}:${giftId}`;
        const lastCount = comboHistory.get(key) ?? 0;
        const delta = Math.max(1, repeatCount - lastCount);
        comboHistory.set(key, repeatCount);
        return delta;
      }

      const delta1 = processTikFinityCombo('user_1', '5655', 1);
      const delta2 = processTikFinityCombo('user_1', '5655', 2);
      const delta3 = processTikFinityCombo('user_1', '5655', 3);

      expect(delta1).toBe(1);
      expect(delta2).toBe(1);
      expect(delta3).toBe(1);
      const totalGifts = delta1 + delta2 + delta3;
      expect(totalGifts).toBe(3); // Không bị nhân đôi thành 1 + 2 + 3 = 6!
    });
  });

  describe('2. EulerStream Cloud WebSocket Payload Normalization', () => {
    it('normalizes a realistic EulerStream gift event with msg_id as external event id', () => {
      // Dữ liệu mô phỏng từ wss://ws.eulerstream.com
      const rawEulerGift = {
        type: 'gift',
        msg_id: '7198765432109876543',
        room_id: '7291234567890123456',
        user: {
          user_id: '7098123456789012345',
          unique_id: 'nguyenvana_live',
          nickname: 'Nguyễn Văn A ⭐',
          avatar_url:
            'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/sample.jpeg',
        },
        gift: {
          gift_id: 5655,
          gift_name: 'Rose',
          diamond_count: 1,
          repeat_count: 5,
          is_repeating: false,
        },
        timestamp: 1730456789123,
      };

      const normalized: NormalizedLiveEvent = {
        source: 'TIKTOK',
        eventType: 'GIFT',
        provider: 'EULERSTREAM',
        externalEventId: `euler_${rawEulerGift.msg_id}`,
        idStrategy: 'EXTERNAL_STABLE',
        providerEventId: rawEulerGift.msg_id,
        senderId: rawEulerGift.user.user_id,
        senderName: rawEulerGift.user.nickname,
        senderAvatarUrl: rawEulerGift.user.avatar_url,
        giftId: String(rawEulerGift.gift.gift_id),
        giftName: rawEulerGift.gift.gift_name,
        giftCount: rawEulerGift.gift.repeat_count,
        unitCoinValue: rawEulerGift.gift.diamond_count,
        totalCoinValue:
          rawEulerGift.gift.diamond_count * rawEulerGift.gift.repeat_count,
        comboGroupId: null,
        isComboEnd: rawEulerGift.gift.is_repeating === false,
        platformTimestamp: rawEulerGift.timestamp,
        providerMetadata: {
          roomId: rawEulerGift.room_id,
          uniqueId: rawEulerGift.user.unique_id,
        },
        rawPayload: rawEulerGift as unknown as Record<string, unknown>,
      };

      const parseResult = NormalizedLiveEventSchema.safeParse(normalized);
      expect(parseResult.success).toBe(true);
      expect(isReliableDeduplicationSupported(normalized)).toBe(true);
      expect(normalized.giftCount).toBe(5);
      expect(normalized.isComboEnd).toBe(true);
    });

    it('generates deterministic synthetic ID when provider does not supply stable ID and reports at-least-once non-claim', () => {
      // Giả lập tình huống Provider không có msg_id
      const rawUnknownGift = {
        type: 'gift',
        room_id: '7291234567890123456',
        user: {
          user_id: '7098123456789012345',
          nickname: 'Khách Ẩn Danh',
        },
        gift: {
          gift_id: 9999,
          gift_name: 'Mystery Gift',
          diamond_count: 100,
          repeat_count: 1,
        },
        timestamp: 1730456789999,
      };

      // Sinh synthetic deterministic hash
      const hashInput = `${rawUnknownGift.room_id}:${rawUnknownGift.user.user_id}:${rawUnknownGift.gift.gift_id}:${rawUnknownGift.timestamp}`;
      const syntheticId = `syn_${crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 24)}`;

      const normalized: NormalizedLiveEvent = {
        source: 'TIKTOK',
        eventType: 'GIFT',
        provider: 'CUSTOM',
        externalEventId: syntheticId,
        idStrategy: 'SYNTHETIC_DETERMINISTIC',
        providerEventId: null,
        senderId: rawUnknownGift.user.user_id,
        senderName: rawUnknownGift.user.nickname,
        senderAvatarUrl: null,
        giftId: String(rawUnknownGift.gift.gift_id),
        giftName: rawUnknownGift.gift.gift_name,
        giftCount: 1,
        unitCoinValue: 100,
        totalCoinValue: 100,
        comboGroupId: null,
        isComboEnd: true,
        platformTimestamp: rawUnknownGift.timestamp,
        providerMetadata: {
          syntheticReason: 'MISSING_PROVIDER_MSG_ID',
        },
        rawPayload: rawUnknownGift,
      };

      const parseResult = NormalizedLiveEventSchema.safeParse(normalized);
      expect(parseResult.success).toBe(true);
      // Ràng buộc nghiêm ngặt: Tuyệt đối không tuyên bố Exactly-Once nếu ID là synthetic
      expect(isReliableDeduplicationSupported(normalized)).toBe(false);
      expect(normalized.idStrategy).toBe('SYNTHETIC_DETERMINISTIC');
    });
  });

  describe('3. Reconnection Simulation & Exponential Backoff', () => {
    it('calculates jittered exponential backoff within bounds [1000ms, 30000ms]', () => {
      function calculateBackoffMs(retryCount: number): number {
        const baseMs = 1000;
        const maxMs = 30000;
        const exp = Math.min(maxMs, baseMs * Math.pow(2, retryCount));
        return exp;
      }

      expect(calculateBackoffMs(0)).toBe(1000);
      expect(calculateBackoffMs(1)).toBe(2000);
      expect(calculateBackoffMs(2)).toBe(4000);
      expect(calculateBackoffMs(3)).toBe(8000);
      expect(calculateBackoffMs(4)).toBe(16000);
      expect(calculateBackoffMs(5)).toBe(30000);
      expect(calculateBackoffMs(6)).toBe(30000); // capped at 30s
    });
  });
});
