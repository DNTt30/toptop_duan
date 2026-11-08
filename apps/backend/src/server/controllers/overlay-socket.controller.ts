import {
  OverlayActionCancelledPayloadSchema,
  OverlayExecutionCompletedPayloadSchema,
  OverlayExecutionFailedPayloadSchema,
  OverlayExecutionStartedPayloadSchema,
  OverlayTelemetryPayloadSchema,
} from '@buddhalive/shared';
import type { Socket } from 'socket.io';
import type { Logger } from '../../config/logger';
import type { EventEngine } from '../../engine/event-engine';
import { AuthorizationPolicy } from '../../security/policies/authorization.policy';
import type { RateLimiter } from '../../security/rate-limiter';

export interface OverlaySocketControllerOptions {
  engine: EventEngine;
  overlayPacketLimiter: RateLimiter;
  logger: Logger;
  onStateChanged?: () => void;
}

/**
 * Thin Socket Controller quản lý sự kiện nhận từ Live Overlay.
 */
export class OverlaySocketController {
  constructor(private readonly options: OverlaySocketControllerOptions) {}

  public attach(socket: Socket): void {
    socket.onAny((eventName, ...args) => {
      const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;

      // 1. Kiểm tra allowlist qua AuthorizationPolicy (Single Source of Truth)
      if (!AuthorizationPolicy.isOverlayEvent(eventName)) {
        this.options.logger.warn('Blocked disallowed overlay event', { eventName });
        if (ack) {
          ack({
            ok: false,
            error: { code: 'FORBIDDEN_ROLE', message: `Event ${eventName} not permitted for OVERLAY` },
          });
        }
        return;
      }

      // 2. Rate limit gói tin
      if (!this.options.overlayPacketLimiter.consume(socket.id)) {
        if (ack) {
          ack({ ok: false, error: { code: 'RATE_LIMITED', message: 'Overlay packet rate limit exceeded' } });
        }
        return;
      }

      // 3. Phân phối sự kiện và validate qua Zod Schema
      if (eventName === 'overlay:telemetry') {
        const parsed = OverlayTelemetryPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }
        this.options.engine.setOverlayReady(parsed.data.readyToPlay);
        if (ack) ack({ ok: true });
        this.notifyState();
      } else if (eventName === 'overlay:execution_started') {
        const parsed = OverlayExecutionStartedPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }
        this.options.engine.handleExecutionStarted(parsed.data);
        if (ack) ack({ ok: true });
        this.notifyState();
      } else if (eventName === 'overlay:execution_completed') {
        const parsed = OverlayExecutionCompletedPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }
        this.options.engine.handleExecutionCompleted(parsed.data);
        if (ack) ack({ ok: true });
        this.notifyState();
      } else if (eventName === 'overlay:execution_failed') {
        const parsed = OverlayExecutionFailedPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }
        this.options.engine.handleExecutionFailed(parsed.data);
        if (ack) ack({ ok: true });
        this.notifyState();
      } else if (eventName === 'overlay:action_cancelled') {
        const parsed = OverlayActionCancelledPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }
        this.options.engine.handleActionCancelled(parsed.data.executionId);
        if (ack) ack({ ok: true });
        this.notifyState();
      }
    });
  }

  private notifyState(): void {
    if (this.options.onStateChanged) {
      this.options.onStateChanged();
    }
  }
}
