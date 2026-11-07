import { z } from 'zod';
import {
  ExecutionStatusSchema,
  EventSourceSchema,
  type ExecutionStatus,
  type EventSource,
} from '../domain/execution';
import type { LiveConnectionSummary } from '../domain/live-provider-config';

export const PROTOCOL_VERSION = '1.0' as const;

/* -------------------------------------------------------------------------- */
/* Lớp 6 — Message Allowlist cứng theo vai trò (event-flow.md §1.2)             */
/* -------------------------------------------------------------------------- */

export const MANAGER_EVENT_ALLOWLIST = [
  'demo:trigger_gift',
  'demo:run_scenario',
  'demo:stop_scenario',
  'queue:control',
  'character:upsert',
  'character:set_active',
  'character:delete',
  'animation:upsert',
  'animation:delete',
  'animation:preview',
  'rule:upsert',
  'rule:toggle',
  'rule:delete',
  'settings:update',
  'security:approve_overlay_pair',
  'security:revoke_overlay_sessions',
  'live:connect',
  'live:disconnect',
  'live:get_diagnostics',
  'live:export_diagnostics',
] as const;

export const OVERLAY_EVENT_ALLOWLIST = [
  'overlay:telemetry',
  'overlay:execution_started',
  'overlay:execution_completed',
  'overlay:execution_failed',
  'overlay:action_cancelled',
] as const;

export type ManagerInboundEvent = (typeof MANAGER_EVENT_ALLOWLIST)[number];
export type OverlayInboundEvent = (typeof OVERLAY_EVENT_ALLOWLIST)[number];

/** Các sự kiện Manager được hiện thực trong Cột mốc S2 (phần còn lại thuộc S3+). */
export const S2_IMPLEMENTED_MANAGER_EVENTS: readonly ManagerInboundEvent[] = [
  'demo:trigger_gift',
  'security:approve_overlay_pair',
  'security:revoke_overlay_sessions',
];

export type ClientRole = 'MANAGER' | 'OVERLAY';

/* -------------------------------------------------------------------------- */
/* Ack & mã lỗi chuẩn                                                          */
/* -------------------------------------------------------------------------- */

export const SOCKET_ERROR_CODES = [
  'UNAUTHORIZED',
  'OVERLAY_PAIRING_REQUIRED',
  'FORBIDDEN_ROLE',
  'EVENT_NOT_ALLOWED',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const;
export type SocketErrorCode = (typeof SOCKET_ERROR_CODES)[number];

export type SocketAck<TData = void> =
  | { ok: true; data: TData }
  | { ok: false; error: { code: SocketErrorCode; message: string } };

/* -------------------------------------------------------------------------- */
/* Handshake                                                                    */
/* -------------------------------------------------------------------------- */

const InstanceIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const ManagerHandshakeAuthSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    clientType: z.literal('MANAGER'),
    token: z.string().min(32).max(128),
    instanceId: InstanceIdSchema,
  })
  .strict();

export const OverlayHandshakeAuthSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    clientType: z.literal('OVERLAY'),
    instanceId: InstanceIdSchema,
  })
  .strict();

export type ManagerHandshakeAuth = z.infer<typeof ManagerHandshakeAuthSchema>;
export type OverlayHandshakeAuth = z.infer<typeof OverlayHandshakeAuthSchema>;

/* -------------------------------------------------------------------------- */
/* Payload Manager → Backend                                                   */
/* -------------------------------------------------------------------------- */

// Chặn ký tự điều khiển và ký tự đánh dấu HTML trong tên hiển thị.
// eslint-disable-next-line no-control-regex
const UNSAFE_DISPLAY_TEXT = /[<>\u0000-\u001F\u007F]/;

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .refine((value) => !UNSAFE_DISPLAY_TEXT.test(value), {
    message: 'Display name contains forbidden characters',
  });

export const DemoTriggerGiftPayloadSchema = z
  .object({
    senderName: DisplayNameSchema,
    giftCount: z.number().int().min(1).max(99).optional(),
    externalEventId: z.string().max(128).nullable().optional(),
    isComboEnd: z.boolean().optional(),
  })
  .strict();
export type DemoTriggerGiftPayload = z.infer<typeof DemoTriggerGiftPayloadSchema>;

export interface DemoTriggerGiftResult {
  liveEventId: string | null;
  executionId: string | null;
  duplicate: boolean;
  processStatus: string;
}

export const ApproveOverlayPairPayloadSchema = z
  .object({
    pairingId: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();
export type ApproveOverlayPairPayload = z.infer<typeof ApproveOverlayPairPayloadSchema>;

export const RevokeOverlaySessionsPayloadSchema = z.object({}).strict();

/* -------------------------------------------------------------------------- */
/* S5: Queue Control & Demo Scenarios (T-14, T-15)                             */
/* -------------------------------------------------------------------------- */

export const QUEUE_CONTROL_ACTIONS = ['PAUSE', 'RESUME', 'SKIP', 'CLEAR'] as const;
export const QueueControlActionSchema = z.enum(QUEUE_CONTROL_ACTIONS);
export type QueueControlAction = z.infer<typeof QueueControlActionSchema>;

export const QueueControlPayloadSchema = z
  .object({
    action: QueueControlActionSchema,
    reason: z.string().max(200).optional(),
  })
  .strict();
export type QueueControlPayload = z.infer<typeof QueueControlPayloadSchema>;

export interface QueueControlResult {
  action: QueueControlAction;
  success: boolean;
  affectedCount: number;
  engineStatus: EngineStatus;
  isPaused: boolean;
  message?: string;
}

export const DEMO_SCENARIOS = [
  'SINGLE_BURST',
  'CONCURRENT_SENDERS',
  'VIP_INTERRUPT',
  'QUEUE_OVERLOAD',
] as const;
export const DemoScenarioSchema = z.enum(DEMO_SCENARIOS);
export type DemoScenario = z.infer<typeof DemoScenarioSchema>;

export const DemoRunScenarioPayloadSchema = z
  .object({
    scenario: DemoScenarioSchema,
  })
  .strict();
export type DemoRunScenarioPayload = z.infer<typeof DemoRunScenarioPayloadSchema>;

export const DemoStopScenarioPayloadSchema = z.object({}).strict();

export interface DemoScenarioResult {
  scenario: DemoScenario;
  started: boolean;
  eventCount: number;
  description: string;
}

/* -------------------------------------------------------------------------- */
/* Payload Overlay → Backend                                                   */
/* -------------------------------------------------------------------------- */

export const OverlayTelemetryPayloadSchema = z
  .object({
    readyToPlay: z.boolean(),
    webglAvailable: z.boolean(),
    fps: z.number().min(0).max(240).optional(),
  })
  .strict();
export type OverlayTelemetryPayload = z.infer<typeof OverlayTelemetryPayloadSchema>;

export const OverlayExecutionStartedPayloadSchema = z
  .object({
    executionId: z.string().uuid(),
  })
  .strict();
export type OverlayExecutionStartedPayload = z.infer<
  typeof OverlayExecutionStartedPayloadSchema
>;

export const FALLBACK_REASON_CODES = [
  'MODEL_LOAD_FAILED',
  'CLIP_NOT_FOUND',
  'WEBGL_LOST',
] as const;
export const FallbackReasonCodeSchema = z.enum(FALLBACK_REASON_CODES);
export type FallbackReasonCode = z.infer<typeof FallbackReasonCodeSchema>;

export const OverlayExecutionCompletedPayloadSchema = z
  .object({
    executionId: z.string().uuid(),
    completionMode: z.enum(['PRIMARY_3D', 'FALLBACK_2D']),
    actualDurationMs: z.number().int().min(0).max(600_000),
    fallbackReasonCode: FallbackReasonCodeSchema.optional(),
    fallbackReasonMessage: z.string().max(300).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.completionMode === 'PRIMARY_3D'
        ? value.fallbackReasonCode === undefined
        : value.fallbackReasonCode !== undefined,
    { message: 'fallbackReasonCode is required only for FALLBACK_2D' }
  );
export type OverlayExecutionCompletedPayload = z.infer<
  typeof OverlayExecutionCompletedPayloadSchema
>;

export const OverlayExecutionFailedPayloadSchema = z
  .object({
    executionId: z.string().uuid(),
    errorCode: z.enum([
      'MODEL_LOAD_FAILED',
      'CLIP_NOT_FOUND',
      'WEBGL_LOST',
      'FALLBACK_DISABLED',
      'FALLBACK_RENDER_FAILED',
    ]),
    errorMessage: z.string().max(300).optional(),
  })
  .strict();
export type OverlayExecutionFailedPayload = z.infer<
  typeof OverlayExecutionFailedPayloadSchema
>;

export const OverlayActionCancelledPayloadSchema = z
  .object({
    executionId: z.string().uuid(),
  })
  .strict();
export type OverlayActionCancelledPayload = z.infer<
  typeof OverlayActionCancelledPayloadSchema
>;

/* -------------------------------------------------------------------------- */
/* Payload Backend → Client (không cần allowlist inbound)                      */
/* -------------------------------------------------------------------------- */

export interface Vector3Json {
  x: number;
  y: number;
  z: number;
}

export interface OverlayExecuteActionPayload {
  executionId: string;
  source: EventSource;
  characterId: string;
  characterName: string;
  modelUrl: string;
  scale: number;
  position: Vector3Json;
  rotation: Vector3Json;
  clipName: string;
  loopMode: 'ONCE' | 'LOOP' | 'REPEAT_N';
  repeatCount: number;
  senderName: string;
  giftName: string;
  giftCount: number;
  caption: string;
  expectedDurationMs: number;
  fallback2dEnabled: boolean;
  showDemoBadge: boolean;
}

export interface OverlayCancelActionPayload {
  executionId: string;
  reason: string;
}

export type OverlayVisualState =
  | 'HIDDEN_STANDBY'
  | 'APPEARING'
  | 'PLAYING'
  | 'DISAPPEARING'
  | 'FALLBACK_2D';

export interface OverlayStateSnapshot {
  protocolVersion: typeof PROTOCOL_VERSION;
  overlayState: 'HIDDEN_STANDBY';
  serverTime: string;
  queuedCount: number;
  settings: {
    fpsLimit: number;
    fallback2dEnabled: boolean;
    showDemoBadge: boolean;
  };
}

export interface ExecutionSummary {
  id: string;
  liveEventId: string;
  source: EventSource;
  senderName: string;
  giftName: string | null;
  mergedGiftCount: number;
  status: ExecutionStatus;
  caption: string;
  queuedAt: string;
  finishedAt: string | null;
  errorCode: string | null;
}

export const ExecutionSummarySchema = z
  .object({
    id: z.string(),
    liveEventId: z.string(),
    source: EventSourceSchema,
    senderName: z.string(),
    giftName: z.string().nullable(),
    mergedGiftCount: z.number().int(),
    status: ExecutionStatusSchema,
    caption: z.string(),
    queuedAt: z.string(),
    finishedAt: z.string().nullable(),
    errorCode: z.string().nullable(),
  })
  .strict();

export interface PendingPairRequest {
  pairingId: string;
  code: string;
  expiresAt: string;
}

export interface QueueMetrics {
  queued: number;
  playing: number;
  completed: number;
  failed: number;
}

export type EngineStatus = 'IDLE' | 'PROCESSING' | 'PAUSED';

export interface ManagerStateSnapshot {
  protocolVersion: typeof PROTOCOL_VERSION;
  serverTime: string;
  overlayUrl: string;
  connectedOverlays: number;
  readyOverlays: number;
  pairedOverlaySessions: number;
  pendingPairRequests: PendingPairRequest[];
  activeExecution: ExecutionSummary | null;
  queuedCount: number;
  recentExecutions: ExecutionSummary[];
  sampleCharacter: { id: string; name: string; giftName: string } | null;
  tiktokAdapterStatus: string;
  // S5 enhancements
  engineStatus: EngineStatus;
  isPaused: boolean;
  queueMetrics: QueueMetrics;
  queuedExecutions: ExecutionSummary[];
  // S9 enhancements (Live Provider)
  liveConnection?: LiveConnectionSummary;
}

/** Tên sự kiện Backend → Client. */
export const SERVER_EVENTS = {
  stateSnapshot: 'system:state_snapshot',
  executeAction: 'overlay:execute_action',
  cancelAction: 'overlay:cancel_action',
  executionStatusChanged: 'execution:status_changed',
} as const;
