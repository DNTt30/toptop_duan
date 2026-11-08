import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApproveOverlayPairPayloadSchema } from '@buddhalive/shared';
import type { Logger } from '../../config/logger';
import { registerSecretForRedaction } from '../../config/logger';
import { extractBearerToken } from '../../security/http-guard';
import type { OverlaySessionStore } from '../../security/overlay-session-store';
import type { PairingManager } from '../../security/pairing';
import { AuthorizationPolicy } from '../../security/policies/authorization.policy';
import type { RateLimiter } from '../../security/rate-limiter';

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
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many pair requests' } })
      );
      return;
    }

    const pair = this.options.pairingManager.request();
    registerSecretForRedaction(pair.claimSecret);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, data: pair }));
  }

  public async handlePairApprove(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    const bearer = extractBearerToken(authHeader);
    const actor = AuthorizationPolicy.authenticateManager(bearer, this.options.managerToken);
    if (!actor || !AuthorizationPolicy.can(actor, 'security:approve_overlay_pair')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid manager token' } })
      );
      return;
    }

    const body = await this.readJsonBody(req);
    const parsed = ApproveOverlayPairPayloadSchema.safeParse(body);
    if (!parsed.success) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      );
      return;
    }

    const success = this.options.pairingManager.approve(parsed.data.pairingId, parsed.data.code);
    if (!success) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ ok: false, error: { code: 'PAIR_FAILED', message: 'Invalid pairing ID or code' } })
      );
      return;
    }

    this.options.logger.info('Approved overlay pair request', { pairingId: parsed.data.pairingId });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }

  public async handlePairClaim(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const clientIp = req.socket.remoteAddress || 'local';
    if (!this.options.pairingClaimLimiter.consume(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many claim attempts' } })
      );
      return;
    }

    const body = await this.readJsonBody(req);
    const pairingId = typeof body?.pairingId === 'string' ? body.pairingId : '';
    const claimSecret = typeof body?.claimSecret === 'string' ? body.claimSecret : '';

    if (!pairingId || !claimSecret) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Missing pairing credentials' } })
      );
      return;
    }

    const claimResult = this.options.pairingManager.claim(pairingId, claimSecret);
    if (claimResult === 'PENDING') {
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ ok: false, error: { code: 'PAIRING_PENDING', message: 'Pairing awaits operator approval' } })
      );
      return;
    }
    if (claimResult !== 'APPROVED') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: false,
          error: { code: 'PAIRING_INVALID', message: `Pairing ${claimResult.toLowerCase()}` },
        })
      );
      return;
    }

    const token = this.options.sessionStore.issue();
    registerSecretForRedaction(token);

    this.options.logger.info('Successfully paired new overlay session and issued cookie');
    if (this.options.onSessionChanged) {
      this.options.onSessionChanged();
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `bls_overlay_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
    });
    res.end(JSON.stringify({ ok: true, data: { status: 'PAIRED' } }));
  }

  private readJsonBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 64 * 1024) {
          req.destroy();
          resolve(null);
        }
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve(null);
        }
      });
      req.on('error', () => resolve(null));
    });
  }
}
