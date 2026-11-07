import { z } from 'zod';

/**
 * Danh sách Live Provider được hỗ trợ chính thức trong hệ thống LIVE.
 * DEMO là chế độ mô phỏng độc lập, không phải Live Provider.
 */
export const LIVE_SUPPORTED_PROVIDERS = ['TIKFINITY', 'EULERSTREAM'] as const;
export const LiveSupportedProviderSchema = z.enum(LIVE_SUPPORTED_PROVIDERS);
export type LiveSupportedProvider = z.infer<typeof LiveSupportedProviderSchema>;

/**
 * 7 trạng thái chuẩn của vòng đời kết nối Live Provider:
 * - DISCONNECTED: Chưa có cấu hình hoặc đã ngắt và không có cấu hình hợp lệ
 * - CONFIGURED: Cấu hình hợp lệ đã được lưu thành công
 * - CONNECTING: Đang bắt tay WebSocket
 * - CONNECTED: Socket đã mở và Provider xác nhận kết nối
 * - RECEIVING_EVENTS: Đã nhận và chuẩn hóa ít nhất một sự kiện LIVE hợp lệ trong phiên
 * - RECONNECTING: Đang thử kết nối lại theo exponential backoff
 * - ERROR: Thử lại thất bại hoặc gặp lỗi cần dừng
 */
export const LIVE_CONNECTION_STATES = [
  'DISCONNECTED',
  'CONFIGURED',
  'CONNECTING',
  'CONNECTED',
  'RECEIVING_EVENTS',
  'RECONNECTING',
  'ERROR',
] as const;

export const LiveConnectionStateSchema = z.enum(LIVE_CONNECTION_STATES);
export type LiveConnectionState = z.infer<typeof LiveConnectionStateSchema>;

/**
 * Danh sách host loopback được phép đối với TikFinity Local WebSocket
 */
const ALLOWED_LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);

/**
 * Kiểm tra URL WebSocket loopback cho TikFinity:
 * - Giao thức bắt buộc là ws: hoặc wss:
 * - Host bắt buộc phải là localhost hoặc loopback IP (127.0.0.1 / ::1)
 */
export const TikFinityLoopbackUrlSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        const protocolOk = parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
        const hostname = parsed.hostname.toLowerCase();
        const hostOk = ALLOWED_LOOPBACK_HOSTS.has(hostname);
        return protocolOk && hostOk;
      } catch {
        return false;
      }
    },
    {
      message:
        'INVALID_TIKFINITY_ENDPOINT: TikFinity endpoint must be a WebSocket URL targeting loopback host (e.g. ws://127.0.0.1:21213 or ws://localhost:21213)',
    }
  );

/**
 * Kiểm tra URL WebSocket cloud cho EulerStream:
 * - Giao thức bắt buộc là wss: hoặc ws:
 * - Domain phải hợp lệ, không chứa ký tự lạ
 */
export const EulerStreamCloudUrlSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        const protocolOk = parsed.protocol === 'wss:' || parsed.protocol === 'ws:';
        const hostnameOk = parsed.hostname.length > 0;
        return protocolOk && hostnameOk;
      } catch {
        return false;
      }
    },
    {
      message:
        'INVALID_EULERSTREAM_ENDPOINT: EulerStream endpoint must be a valid WebSocket URL (e.g. wss://ws.eulerstream.com)',
    }
  );

/**
 * Cấu hình riêng cho TikFinity Local WebSocket:
 * - Mặc định ws://127.0.0.1:21213/
 * - Chỉ cho phép loopback, không yêu cầu API key
 */
export const TikFinityConfigSchema = z
  .object({
    provider: z.literal('TIKFINITY'),
    endpointUrl: TikFinityLoopbackUrlSchema.default('ws://127.0.0.1:21213'),
    streamerUsername: z.string().max(128).default(''),
    autoConnectOnStart: z.boolean().default(false),
    hasApiKey: z.boolean().default(false),
  })
  .strict();

export type TikFinityConfig = z.infer<typeof TikFinityConfigSchema>;

/**
 * Cấu hình riêng cho EulerStream Cloud WebSocket:
 * - Bắt buộc nhập streamerUsername
 * - Mặc định wss://ws.eulerstream.com
 * - Không lưu plaintext apiKey trong cấu hình này (tách biệt bí mật)
 */
export const EulerStreamConfigSchema = z
  .object({
    provider: z.literal('EULERSTREAM'),
    endpointUrl: EulerStreamCloudUrlSchema.default('wss://ws.eulerstream.com'),
    streamerUsername: z
      .string()
      .min(1, 'Streamer username is required for EulerStream')
      .max(128),
    autoConnectOnStart: z.boolean().default(false),
    hasApiKey: z.boolean().default(false),
  })
  .strict();

export type EulerStreamConfig = z.infer<typeof EulerStreamConfigSchema>;

/**
 * Hợp đồng cấu hình Live Provider chuẩn (Discriminated Union theo 'provider').
 * Đảm bảo TikFinity và EulerStream có schema riêng biệt, không dùng chung mặc định.
 */
export const LiveProviderConfigSchema = z.discriminatedUnion('provider', [
  TikFinityConfigSchema,
  EulerStreamConfigSchema,
]);

export type LiveProviderConfig = z.infer<typeof LiveProviderConfigSchema>;

/**
 * Schema riêng biệt để tiếp nhận API Key từ UI / Manager:
 * - Tuyệt đối không nằm trong LiveProviderConfig thông thường
 * - Gửi trực tiếp tới ProviderKeyVault để mã hóa DPAPI
 * - Không trả về UI, không ghi vào log
 */
export const LiveProviderApiKeyPayloadSchema = z
  .object({
    provider: z.literal('EULERSTREAM'),
    apiKey: z
      .string()
      .min(8, 'API Key must be at least 8 characters')
      .max(256),
  })
  .strict();

export type LiveProviderApiKeyPayload = z.infer<
  typeof LiveProviderApiKeyPayloadSchema
>;

/**
 * Cấu trúc tóm tắt trạng thái kết nối LIVE phát qua Socket.IO tới Manager UI.
 * Không bao giờ chứa token, cookie hoặc API key.
 */
export const LiveConnectionSummarySchema = z
  .object({
    provider: z.enum(['TIKFINITY', 'EULERSTREAM', 'NONE']),
    state: LiveConnectionStateSchema,
    streamerUsername: z.string(),
    endpointUrl: z.string(),
    hasApiKey: z.boolean(),
    eventsReceived: z.number().int().min(0),
    lastEventAt: z.string().nullable(),
    lastError: z.string().nullable(),
  })
  .strict();

export type LiveConnectionSummary = z.infer<typeof LiveConnectionSummarySchema>;

/**
 * Mục lịch sử thay đổi trạng thái kết nối Live Provider
 */
export const LiveConnectionHistoryItemSchema = z
  .object({
    timestamp: z.string(),
    provider: z.enum(['TIKFINITY', 'EULERSTREAM', 'NONE']),
    state: LiveConnectionStateSchema,
    reason: z.string().nullable().optional(),
    errorCode: z.string().nullable().optional(),
  })
  .strict();

export type LiveConnectionHistoryItem = z.infer<
  typeof LiveConnectionHistoryItemSchema
>;

/**
 * Các bước trong vòng đời vết sự kiện (Event Trace Lifecycle)
 */
export const LiveEventTraceStepSchema = z
  .object({
    step: z.enum([
      'INGRESS',
      'ENGINE',
      'QUEUE',
      'DISPATCH',
      'OBS_PLAYBACK',
      'PERSISTED',
    ]),
    timestamp: z.string(),
    details: z.record(z.unknown()).optional(),
  })
  .strict();

export type LiveEventTraceStep = z.infer<typeof LiveEventTraceStepSchema>;

/**
 * Vết sự kiện trực tiếp theo Correlation ID từ Provider đến OBS Studio
 */
export const LiveEventTraceSchema = z
  .object({
    correlationId: z.string(),
    externalEventId: z.string(),
    provider: z.enum(['TIKFINITY', 'EULERSTREAM']),
    senderName: z.string(),
    giftName: z.string(),
    giftCount: z.number().int().min(1),
    status: z.enum(['PROCESSING', 'COMPLETED', 'DROPPED', 'FAILED']),
    steps: z.array(LiveEventTraceStepSchema),
  })
  .strict();

export type LiveEventTrace = z.infer<typeof LiveEventTraceSchema>;

/**
 * Báo cáo chẩn đoán toàn diện kết nối Live Provider & OBS Studio (T33-A, T33-C).
 * Tuyệt đối không chứa bất kỳ secret, API key hoặc URL thô chưa khử khuẩn.
 */
export const LiveDiagnosticsReportSchema = z
  .object({
    timestamp: z.string(),
    provider: z.enum(['TIKFINITY', 'EULERSTREAM', 'NONE']),
    providerStatus: LiveConnectionStateSchema,
    obsStatus: z.enum([
      'DISCONNECTED',
      'CONNECTING',
      'IDENTIFYING',
      'IDENTIFIED',
      'ERROR',
    ]),
    streamerUsername: z.string(),
    endpointUrl: z.string(),
    hasApiKey: z.boolean(),
    lastConnectedAt: z.string().nullable(),
    lastEventAt: z.string().nullable(),
    eventsReceived: z.number().int().min(0),
    reconnectCount: z.number().int().min(0),
    lastErrorCode: z.string().nullable(),
    lastErrorMessage: z.string().nullable(),
    connectionHistory: z.array(LiveConnectionHistoryItemSchema),
    recentTraces: z.array(LiveEventTraceSchema).optional(),
    systemHealth: z
      .object({
        sqliteWalActive: z.boolean(),
        overlayReadyCount: z.number().int().min(0),
        activeCharacterId: z.string().nullable(),
        queueLength: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export type LiveDiagnosticsReport = z.infer<typeof LiveDiagnosticsReportSchema>;
