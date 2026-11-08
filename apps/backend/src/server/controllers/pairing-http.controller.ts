import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApproveOverlayPairPayloadSchema } from '@buddhalive/shared';
import type { Logger } from '../../config/logger';
import { registerSecretForRedaction } from '../../config/logger';
import { extractBearerToken } from '../../security/http-guard';
import type { OverlaySessionStore } from '../../security/overlay-session-store';
import type { PairingManager } from '../../security/pairing';
import { AuthorizationPolicy } from '../../security/policies/authorization.policy';
import type { RateLimiter } from '../../security/rate-limiter';
import { readJsonBody, sendJson, sendJsonError } from './controller-utils';

export interface PairingHttpControllerOptions {
  managerToken: string;
  pairingManager: PairingManager;
  sessionStore: OverlaySessionStore;
  pairingReqLimiter: RateLimiter;
  pairingClaimLimiter: RateLimiter;
  logger: Logger;
  onSessionChanged?: () => void;
}

export class PairingHttpController {
  constructor(private readonly options: PairingHttpControllerOptions) {}

  public handlePairRequest(req: IncomingMessage, res: ServerResponse): void {
    const clientIp = req.socket.remoteAddress || 'local';
    if (!this.options.pairingReqLimiter.consume(clientIp)) {
      sendJsonError(res, 429, 'RATE_LIMITED', 'Too many pair requests');
      return;
    }

    const pair = this.options.pairingManager.request();
    registerSecretForRedaction(pair.claimSecret);

    sendJson(res, 200, { ok: true, data: pair });
  }

  public async handlePairApprove(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    const bearer = extractBearerToken(authHeader);
    const actor = AuthorizationPolicy.authenticateManager(bearer, this.options.managerToken);
    if (!actor || !AuthorizationPolicy.can(actor, 'security:approve_overlay_pair')) {
      sendJsonError(res, 401, 'UNAUTHORIZED', 'Invalid manager token');
      return;
    }

    const body = await readJsonBody(req);
    const parsed = ApproveOverlayPairPayloadSchema.safeParse(body);
    if (!parsed.success) {
      sendJsonError(res, 400, 'VALIDATION_ERROR', parsed.error.message);
      return;
    }

    const success = this.options.pairingManager.approve(parsed.data.pairingId, parsed.data.code);
    if (!success) {
      sendJsonError(res, 400, 'PAIR_FAILED', 'Invalid pairing ID or code');
      return;
    }

    this.options.logger.info('Approved overlay pair request', { pairingId: parsed.data.pairingId });
    sendJson(res, 200, { ok: true });
  }

  public async handlePairClaim(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const clientIp = req.socket.remoteAddress || 'local';
    if (!this.options.pairingClaimLimiter.consume(clientIp)) {
      sendJsonError(res, 429, 'RATE_LIMITED', 'Too many claim attempts');
      return;
    }

    const body = await readJsonBody(req);
    const pairingId = typeof body?.pairingId === 'string' ? body.pairingId : '';
    const claimSecret = typeof body?.claimSecret === 'string' ? body.claimSecret : '';

    if (!pairingId || !claimSecret) {
      sendJsonError(res, 400, 'VALIDATION_ERROR', 'Missing pairing credentials');
      return;
    }

    const claimResult = this.options.pairingManager.claim(pairingId, claimSecret);
    if (claimResult === 'PENDING') {
      sendJsonError(res, 202, 'PAIRING_PENDING', 'Pairing awaits operator approval');
      return;
    }
    if (claimResult !== 'APPROVED') {
      sendJsonError(res, 400, 'PAIRING_INVALID', `Pairing ${claimResult.toLowerCase()}`);
      return;
    }

    const token = this.options.sessionStore.issue();
    registerSecretForRedaction(token);

    this.options.logger.info('Successfully paired new overlay session and issued cookie');
    if (this.options.onSessionChanged) {
      this.options.onSessionChanged();
    }

    sendJson(
      res,
      200,
      { ok: true, data: { status: 'PAIRED' } },
      { 'Set-Cookie': `bls_overlay_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` }
    );
  }
}
