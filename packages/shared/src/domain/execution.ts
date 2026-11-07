import { z } from 'zod';

/** 12 trạng thái chuẩn của EventExecution (data-model.md §3.5, event-flow.md §4). */
export const EXECUTION_STATUSES = [
  'QUEUED',
  'DISPATCHED',
  'PLAYING',
  'COMPLETED',
  'COMPLETED_WITH_FALLBACK',
  'PREEMPTED',
  'EVICTED_BY_PRIORITY',
  'TIMED_OUT',
  'FAILED',
  'CANCELLED',
  'SKIPPED_BY_MANAGER',
  'CLEARED_BY_MANAGER',
] as const;

export const ExecutionStatusSchema = z.enum(EXECUTION_STATUSES);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const TERMINAL_EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  'COMPLETED',
  'COMPLETED_WITH_FALLBACK',
  'PREEMPTED',
  'EVICTED_BY_PRIORITY',
  'TIMED_OUT',
  'FAILED',
  'CANCELLED',
  'SKIPPED_BY_MANAGER',
  'CLEARED_BY_MANAGER',
];

export const ACTIVE_EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  'DISPATCHED',
  'PLAYING',
];

export const EVENT_SOURCES = ['DEMO', 'TIKTOK', 'SYSTEM'] as const;
export const EventSourceSchema = z.enum(EVENT_SOURCES);
export type EventSource = z.infer<typeof EventSourceSchema>;

export const LIVE_EVENT_PROCESS_STATUSES = [
  'RECEIVED',
  'MATCHED',
  'COALESCED_INTO_QUEUE',
  'IGNORED_COMBO_BUFFERING',
  'IGNORED_NO_RULE',
  'IGNORED_COOLDOWN',
  'DROPPED_BUSY',
  'DROPPED_QUEUE_FULL',
] as const;
export type LiveEventProcessStatus = (typeof LIVE_EVENT_PROCESS_STATUSES)[number];

export const EXECUTION_ERROR_CODES = [
  'MODEL_LOAD_FAILED',
  'CLIP_NOT_FOUND',
  'WEBGL_LOST',
  'OVERLAY_RELOADED',
  'ACK_TIMEOUT',
  'COMPLETION_TIMEOUT',
  'SERVER_RESTARTED',
  'FALLBACK_DISABLED',
  'FALLBACK_RENDER_FAILED',
] as const;
export type ExecutionErrorCode = (typeof EXECUTION_ERROR_CODES)[number];

/**
 * Chuẩn hóa external_event_id: undefined / null / "" / chuỗi toàn khoảng trắng → null.
 * (data-model.md §3.4 — Quy tắc chống trùng & xử lý external_event_id NULL)
 */
export function normalizeExternalEventId(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}
