import { z } from 'zod';

export const APP_SETTING_KEYS = [
  'server.host',
  'server.port',
  'engine.combo_window_ms',
  'engine.min_display_protection_ms',
  'engine.max_queue_size',
  'engine.start_ack_timeout_ms',
  'engine.completion_buffer_ms',
  'engine.queue_paused',
  'overlay.fps_limit',
  'overlay.fallback_2d_alert',
  'overlay.show_demo_badge',
  'audio.master_volume',
  'retention.events_days',
] as const;

export const AppSettingKeySchema = z.enum(APP_SETTING_KEYS);
export type AppSettingKey = z.infer<typeof AppSettingKeySchema>;

export const AppSettingValueTypeSchema = z.enum([
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'JSON',
]);
export type AppSettingValueType = z.infer<typeof AppSettingValueTypeSchema>;

export const AppSettingCategorySchema = z.enum([
  'SERVER',
  'OVERLAY',
  'ENGINE',
  'AUDIO',
  'DEMO',
  'RETENTION',
]);
export type AppSettingCategory = z.infer<typeof AppSettingCategorySchema>;

const FORBIDDEN_SECRET_KEY_PATTERN = /(password|secret|token|cookie|api_key|apikey)/i;

export function assertNonSensitiveSettingKey(rawKey: string): AppSettingKey {
  if (FORBIDDEN_SECRET_KEY_PATTERN.test(rawKey)) {
    throw new Error(`FORBIDDEN_SENSITIVE_SETTING_KEY: Key "${rawKey}" is prohibited in SQLite AppSetting`);
  }
  const parsed = AppSettingKeySchema.safeParse(rawKey);
  if (!parsed.success) {
    throw new Error(`UNKNOWN_SETTING_KEY: Key "${rawKey}" is not in AppSetting allowlist`);
  }
  return parsed.data;
}

export const AppSettingSchema = z
  .object({
    key: AppSettingKeySchema,
    valueJson: z.string().min(1),
    valueType: AppSettingValueTypeSchema,
    category: AppSettingCategorySchema,
    description: z.string().min(1).max(500),
    isRestartRequired: z.boolean(),
    updatedAt: z.string().min(1),
  })
  .strict();

export type AppSetting = z.infer<typeof AppSettingSchema>;

export interface DefaultAppSettingSeed {
  key: AppSettingKey;
  valueJson: string;
  valueType: AppSettingValueType;
  category: AppSettingCategory;
  description: string;
  isRestartRequired: boolean;
}

export const DEFAULT_APP_SETTINGS: readonly DefaultAppSettingSeed[] = [
  {
    key: 'server.host',
    valueJson: JSON.stringify('127.0.0.1'),
    valueType: 'STRING',
    category: 'SERVER',
    description: 'Địa chỉ lắng nghe loopback an toàn trên máy cục bộ.',
    isRestartRequired: true,
  },
  {
    key: 'server.port',
    valueJson: JSON.stringify(3721),
    valueType: 'NUMBER',
    category: 'SERVER',
    description: 'Cổng HTTP và Socket.IO nội bộ của Backend.',
    isRestartRequired: true,
  },
  {
    key: 'engine.combo_window_ms',
    valueJson: JSON.stringify(1500),
    valueType: 'NUMBER',
    category: 'ENGINE',
    description: 'Cửa sổ cố định 1500ms tính từ Event đầu tiên cho chế độ COMBO_MERGE.',
    isRestartRequired: false,
  },
  {
    key: 'engine.min_display_protection_ms',
    valueJson: JSON.stringify(1000),
    valueType: 'NUMBER',
    category: 'ENGINE',
    description: 'Thời gian hiển thị tối thiểu trước khi cho phép quà VIP thay thế.',
    isRestartRequired: false,
  },
  {
    key: 'engine.max_queue_size',
    valueJson: JSON.stringify(30),
    valueType: 'NUMBER',
    category: 'ENGINE',
    description: 'Số lượng bản ghi QUEUED tối đa trong hàng đợi thực thi.',
    isRestartRequired: false,
  },
  {
    key: 'engine.start_ack_timeout_ms',
    valueJson: JSON.stringify(2000),
    valueType: 'NUMBER',
    category: 'ENGINE',
    description: 'Hạn chờ xác nhận bắt đầu phát từ Live Overlay.',
    isRestartRequired: false,
  },
  {
    key: 'engine.completion_buffer_ms',
    valueJson: JSON.stringify(3000),
    valueType: 'NUMBER',
    category: 'ENGINE',
    description: 'Khoảng đệm cộng thêm trước khi Watchdog đánh dấu TIMED_OUT.',
    isRestartRequired: false,
  },
  {
    key: 'engine.queue_paused',
    valueJson: JSON.stringify(false),
    valueType: 'BOOLEAN',
    category: 'ENGINE',
    description: 'Trạng thái tạm dừng điều phối hàng đợi (PAUSE / RESUME).',
    isRestartRequired: false,
  },
  {
    key: 'overlay.fps_limit',
    valueJson: JSON.stringify(60),
    valueType: 'NUMBER',
    category: 'OVERLAY',
    description: 'Giới hạn FPS khung hình 3D trên OBS Browser Source.',
    isRestartRequired: false,
  },
  {
    key: 'overlay.fallback_2d_alert',
    valueJson: JSON.stringify(true),
    valueType: 'BOOLEAN',
    category: 'OVERLAY',
    description: 'Hiển thị bảng cảm ơn 2D khi model 3D lỗi (COMPLETED_WITH_FALLBACK).',
    isRestartRequired: false,
  },
  {
    key: 'overlay.show_demo_badge',
    valueJson: JSON.stringify(true),
    valueType: 'BOOLEAN',
    category: 'DEMO',
    description: 'Hiển thị nhãn DEMO góc nhỏ khi chạy sự kiện mô phỏng.',
    isRestartRequired: false,
  },
  {
    key: 'audio.master_volume',
    valueJson: JSON.stringify(0.85),
    valueType: 'NUMBER',
    category: 'AUDIO',
    description: 'Âm lượng tổng trên Live Overlay (0.0 đến 1.0).',
    isRestartRequired: false,
  },
  {
    key: 'retention.events_days',
    valueJson: JSON.stringify(14),
    valueType: 'NUMBER',
    category: 'RETENTION',
    description: 'Số ngày lưu lịch sử sự kiện trước khi tự động dọn dẹp.',
    isRestartRequired: false,
  },
] as const;
