import { z } from 'zod';
import { EventSourceSchema, type EventSource } from './execution';

/**
 * Danh sách nhà cung cấp luồng livestream được hỗ trợ hoặc thử nghiệm.
 */
export const LIVE_PROVIDERS = [
  'TIKFINITY',
  'EULERSTREAM',
  'DEMO',
  'CUSTOM',
] as const;

export const LiveProviderSchema = z.enum(LIVE_PROVIDERS);
export type LiveProvider = z.infer<typeof LiveProviderSchema>;

/**
 * Phân loại chiến lược định danh sự kiện:
 * - EXTERNAL_STABLE: ID duy nhất bền vững do Provider cấp (vd: TikFinity actionId, Webcast msgId)
 * - SYNTHETIC_DETERMINISTIC: ID tổng hợp xác định (Deterministic Hash) khi Provider không có ID gốc
 */
export const EVENT_ID_STRATEGIES = [
  'EXTERNAL_STABLE',
  'SYNTHETIC_DETERMINISTIC',
] as const;

export const EventIdStrategySchema = z.enum(EVENT_ID_STRATEGIES);
export type EventIdStrategy = z.infer<typeof EventIdStrategySchema>;

/**
 * Zod schema cho NormalizedLiveEvent - Hợp đồng dữ liệu chuẩn mực cho mọi Provider Livestream.
 */
export const NormalizedLiveEventSchema = z
  .object({
    /** Nguồn gốc sự kiện (DEMO / TIKTOK / SYSTEM) */
    source: EventSourceSchema,

    /** Loại sự kiện livestream */
    eventType: z.enum(['GIFT', 'LIKE', 'CHAT', 'FOLLOW', 'SHARE']),

    /** Nhà cung cấp tiếp nhận luồng sự kiện */
    provider: LiveProviderSchema,

    /** Mã sự kiện duy nhất ngoại vi phục vụ chống trùng */
    externalEventId: z.string().min(1).max(256),

    /** Chiến lược sinh mã định danh (Stable hay Synthetic) */
    idStrategy: EventIdStrategySchema,

    /** ID sự kiện nguyên bản do Provider cung cấp (nếu có) */
    providerEventId: z.string().max(256).nullable().optional(),

    /** Định danh người gửi (SecUID hoặc User ID số học) */
    senderId: z.string().min(1).max(128),

    /** Tên hiển thị công khai (Nickname) của người gửi */
    senderName: z.string().min(1).max(128),

    /** Đường dẫn ảnh đại diện người gửi */
    senderAvatarUrl: z.string().url().max(1024).nullable().optional(),

    /** Định danh quà tặng (chuỗi số học) */
    giftId: z.string().max(64).nullable().optional(),

    /** Tên quà tặng */
    giftName: z.string().max(128).nullable().optional(),

    /** Số lượng quà trong đợt gửi (>= 1) */
    giftCount: z.number().int().min(1).default(1),

    /** Đơn giá xu (Coins) của 1 phần quà (>= 0) */
    unitCoinValue: z.number().int().min(0).default(0),

    /** Tổng giá trị xu trong đợt gửi này */
    totalCoinValue: z.number().int().min(0).default(0),

    /** ID nhóm combo */
    comboGroupId: z.string().max(128).nullable().optional(),

    /** Cờ báo hiệu chuỗi combo từ người gửi này đã kết thúc */
    isComboEnd: z.boolean().default(false),

    /** Timestamp thời điểm sự kiện diễn ra trên nguồn gốc (Epoch ms) */
    platformTimestamp: z.number().int().positive(),

    /** Siêu dữ liệu bổ sung từ Provider (latency, socketId, roomId) */
    providerMetadata: z.record(z.unknown()).optional(),

    /** Bản tin gốc dạng JSON/Record phục vụ Audit Log và Debug */
    rawPayload: z.record(z.unknown()).default({}),
  })
  .strict();

export type NormalizedLiveEvent = z.infer<typeof NormalizedLiveEventSchema>;

/**
 * Hợp đồng phân phối sự kiện:
 * Nếu Provider cung cấp ID ổn định (EXTERNAL_STABLE) -> Đảm bảo At-Least-Once Delivery với Deduplication tin cậy.
 * Nếu ID là tổng hợp (SYNTHETIC_DETERMINISTIC) -> At-Least-Once Delivery với Best-Effort Deduplication.
 * Tuyệt đối không tuyên bố Exactly-Once nếu không có ID ổn định từ máy chủ gốc.
 */
export function isReliableDeduplicationSupported(
  event: NormalizedLiveEvent
): boolean {
  return event.idStrategy === 'EXTERNAL_STABLE';
}
