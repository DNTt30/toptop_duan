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
import { parseSocketPayload } from './controller-utils';

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

      // 3. Phân phối sự kiện và validate qua Zod Schema (DRY pattern)
      if (eventName === 'overlay:telemetry') {
        const payload = parseSocketPayload(OverlayTelemetryPayloadSchema, args[0], ack);
        if (!payload) return;
        this.options.engine.setOverlayReady(payload.readyToPlay);
        if (ack) ack({ ok: true });
        this.notifyState();
      } else if (eventName === 'overlay:execution_started') {
        const payload = parseSocketPayload(OverlayExecutionStartedPayloadSchema, args[0], ack);
        if (!payload) return;
        this.options.engine.handleExecutionStarted(payload);
        if (ack) ack({ ok: true });
        this.notifyState();
      } else if (eventName === 'overlay:execution_completed') {
        const payload = parseSocketPayload(OverlayExecutionCompletedPayloadSchema, args[0], ack);
        if (!payload) return;
        this.options.engine.handleExecutionCompleted(payload);
        if (ack) ack({ ok: true });
        this.notifyState();
      } else if (eventName === 'overlay:execution_failed') {
        const payload = parseSocketPayload(OverlayExecutionFailedPayloadSchema, args[0], ack);
        if (!payload) return;
        this.options.engine.handleExecutionFailed(payload);
        if (ack) ack({ ok: true });
        this.notifyState();
      } else if (eventName === 'overlay:action_cancelled') {
        const payload = parseSocketPayload(OverlayActionCancelledPayloadSchema, args[0], ack);
        if (!payload) return;
        this.options.engine.handleActionCancelled(payload.executionId);
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
