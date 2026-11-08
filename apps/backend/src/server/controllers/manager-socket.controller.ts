import {
  ApproveOverlayPairPayloadSchema,
  DemoRunScenarioPayloadSchema,
  DemoTriggerGiftPayloadSchema,
  QueueControlPayloadSchema,
  type QueueControlResult,
} from '@buddhalive/shared';
import type { Socket } from 'socket.io';
import type { Logger } from '../../config/logger';
import type { LiveConnectionManager } from '../../adapters/live-connection-manager';
import type { ObsConnectionStatus } from '../../adapters/obs-websocket-client';
import type { DemoSimulator } from '../../engine/demo-simulator';
import type { EventEngine } from '../../engine/event-engine';
import type { OverlaySessionStore } from '../../security/overlay-session-store';
import type { PairingManager } from '../../security/pairing';
import { AuthorizationPolicy } from '../../security/policies/authorization.policy';
import type { RateLimiter } from '../../security/rate-limiter';
import { parseSocketPayload } from './controller-utils';

export interface ManagerSocketControllerOptions {
  engine: EventEngine;
  demoSimulator: DemoSimulator;
  liveManager: LiveConnectionManager;
  pairingManager: PairingManager;
  sessionStore: OverlaySessionStore;
  managerCommandLimiter: RateLimiter;
  logger: Logger;
  getObsStatus: () => ObsConnectionStatus;
  onStateChanged?: () => void;
  onRevokeOverlays?: () => void;
}

/**
 * Thin Socket Controller quản lý các sự kiện từ Desktop Manager.
 */
export class ManagerSocketController {
  constructor(private readonly options: ManagerSocketControllerOptions) {}

  public attach(socket: Socket): void {
    socket.onAny((eventName, ...args) => {
      const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;

      // 1. Kiểm tra allowlist qua AuthorizationPolicy (Single Source of Truth)
      if (!AuthorizationPolicy.isManagerEvent(eventName)) {
        this.options.logger.warn('Blocked disallowed manager event', { eventName });
        if (ack) {
          ack({
            ok: false,
            error: { code: 'FORBIDDEN_ROLE', message: `Event ${eventName} not permitted for MANAGER` },
          });
        }
        return;
      }

      // 2. Rate limit
      if (!this.options.managerCommandLimiter.consume(socket.id)) {
        if (ack) {
          ack({ ok: false, error: { code: 'RATE_LIMITED', message: 'Manager command rate limit exceeded' } });
        }
        return;
      }

      // 3. Phân phối sự kiện và validate qua Zod Schema (DRY pattern)
      if (eventName === 'demo:trigger_gift') {
        if (!this.ensureNotLive(ack)) return;
        const payload = parseSocketPayload(DemoTriggerGiftPayloadSchema, args[0], ack);
        if (!payload) return;

        const result = this.options.engine.triggerDemoGift(payload);
        if (ack) ack({ ok: true, data: result });
        this.notifyState();
      } else if (eventName === 'security:approve_overlay_pair') {
        const payload = parseSocketPayload(ApproveOverlayPairPayloadSchema, args[0], ack);
        if (!payload) return;

        const ok = this.options.pairingManager.approve(payload.pairingId, payload.code);
        if (ack) {
          ack(ok ? { ok: true } : { ok: false, error: { code: 'NOT_FOUND', message: 'Pairing entry not found' } });
        }
        this.notifyState();
      } else if (eventName === 'security:revoke_overlay_sessions') {
        const revoked = this.options.sessionStore.revokeAll();
        this.options.logger.warn('Revoked all overlay sessions', { revoked });
        if (this.options.onRevokeOverlays) {
          this.options.onRevokeOverlays();
        }
        if (ack) ack({ ok: true, data: { revokedCount: revoked } });
        this.notifyState();
      } else if (eventName === 'queue:control') {
        const payload = parseSocketPayload(QueueControlPayloadSchema, args[0], ack);
        if (!payload) return;

        const controlResult = this.handleQueueControl(payload.action, payload.reason);
        if (ack) ack({ ok: true, data: controlResult });
        this.notifyState();
      } else if (eventName === 'demo:run_scenario') {
        if (!this.ensureNotLive(ack)) return;
        const payload = parseSocketPayload(DemoRunScenarioPayloadSchema, args[0], ack);
        if (!payload) return;

        void this.options.demoSimulator.runScenario(payload.scenario).then((scenarioRes) => {
          if (ack) ack({ ok: true, data: scenarioRes });
          this.notifyState();
        });
      } else if (eventName === 'demo:stop_scenario') {
        this.options.demoSimulator.stopScenario();
        if (ack) ack({ ok: true });
        this.notifyState();
      } else if (eventName === 'live:connect') {
        void this.options.liveManager.connect().then((connectResult) => {
          if (ack) ack({ ok: connectResult.ok, data: connectResult });
          this.notifyState();
        });
      } else if (eventName === 'live:disconnect') {
        void this.options.liveManager.disconnect().then((disconnectResult) => {
          if (ack) ack({ ok: disconnectResult.ok, data: disconnectResult });
          this.notifyState();
        });
      } else if (eventName === 'live:get_diagnostics') {
        const diagnostics = this.options.liveManager.getDiagnostics(this.options.getObsStatus());
        if (ack) ack({ ok: true, data: diagnostics });
      } else if (eventName === 'live:export_diagnostics') {
        const format = args[0]?.format === 'json' ? 'json' : 'markdown';
        const report = this.options.liveManager.exportDiagnosticsReport(format, this.options.getObsStatus());
        if (ack) ack({ ok: true, data: { report, format } });
      }
    });
  }

  /**
   * Helper kiểm tra không cho phép Demo khi phiên Live đang chạy.
   */
  private ensureNotLive(ack?: (res: any) => void): boolean {
    if (this.options.liveManager.isLiveActive()) {
      if (ack) {
        ack({
          ok: false,
          error: {
            code: 'FORBIDDEN_ROLE',
            message:
              'DEMO_BLOCKED_DURING_LIVE_SESSION: Không thể phát sự kiện Demo khi phiên kết nối LIVE đang hoạt động.',
          },
        });
      }
      return false;
    }
    return true;
  }

  /**
   * Helper xử lý nghiệp vụ điều khiển hàng đợi (PAUSE, RESUME, SKIP, CLEAR).
   */
  private handleQueueControl(action: 'PAUSE' | 'RESUME' | 'SKIP' | 'CLEAR', reason?: string): QueueControlResult {
    const engine = this.options.engine;
    if (action === 'PAUSE') {
      engine.pauseQueue();
      return {
        action,
        success: true,
        affectedCount: 0,
        engineStatus: engine.getEngineStatus(),
        isPaused: true,
        message: 'Queue dispatch paused',
      };
    }
    if (action === 'RESUME') {
      engine.resumeQueue();
      return {
        action,
        success: true,
        affectedCount: 0,
        engineStatus: engine.getEngineStatus(),
        isPaused: false,
        message: 'Queue dispatch resumed',
      };
    }
    if (action === 'SKIP') {
      const skipRes = engine.skipCurrent(reason, { barrierMs: 150 });
      return {
        action,
        success: skipRes.success,
        affectedCount: skipRes.success ? 1 : 0,
        engineStatus: engine.getEngineStatus(),
        isPaused: engine.getIsPaused(),
        message: skipRes.success ? `Skipped active execution ${skipRes.skippedId}` : 'No active execution to skip',
      };
    }
    // CLEAR
    const clearRes = engine.clearQueue(reason);
    return {
      action,
      success: true,
      affectedCount: clearRes.clearedCount,
      engineStatus: engine.getEngineStatus(),
      isPaused: engine.getIsPaused(),
      message: `Cleared ${clearRes.clearedCount} executions from queue`,
    };
  }

  private notifyState(): void {
    if (this.options.onStateChanged) {
      this.options.onStateChanged();
    }
  }
}
