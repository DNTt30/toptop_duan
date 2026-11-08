import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkHttpSafety } from '../../security/http-guard';
import type { Logger } from '../../config/logger';
import type { PairingHttpController } from './pairing-http.controller';
import type { StaticAssetController } from './static-asset.controller';

export interface HttpControllerOptions {
  port: number;
  host: string;
  logger: Logger;
  staticAssetController: StaticAssetController;
  pairingController: PairingHttpController;
}

/**
 * Thin HTTP Controller điều phối request tới các controller chuyên biệt.
 */
export class HttpController {
  constructor(private readonly options: HttpControllerOptions) {}

  public handleRequest(req: IncomingMessage, res: ServerResponse): void {
    if (!checkHttpSafety(req, res, { allowedPort: this.options.port }, this.options.logger)) {
      return;
    }

    const parsedUrl = new URL(req.url ?? '/', `http://${this.options.host}:${this.options.port}`);
    const pathname = parsedUrl.pathname;

    // 1. Phục vụ tài nguyên tĩnh Overlay (/overlay hoặc /overlay/* hoặc /backgrounds/*)
    if (pathname === '/overlay') {
      res.writeHead(302, { Location: '/overlay/' });
      res.end();
      return;
    }
    if (pathname.startsWith('/overlay/') || pathname.startsWith('/backgrounds/')) {
      this.options.staticAssetController.serveOverlayStatic(pathname, res);
      return;
    }

    // 2. Phục vụ assets an toàn (/assets/*)
    if (pathname.startsWith('/assets/')) {
      this.options.staticAssetController.serveAssetFile(pathname, res);
      return;
    }

    // 3. API Ghép nối Overlay (Pairing endpoints)
    if (pathname === '/api/overlay/pair/request' && req.method === 'POST') {
      this.options.pairingController.handlePairRequest(req, res);
      return;
    }

    if (pathname === '/api/overlay/pair/approve' && req.method === 'POST') {
      void this.options.pairingController.handlePairApprove(req, res);
      return;
    }

    if (pathname === '/api/overlay/pair/claim' && req.method === 'POST') {
      void this.options.pairingController.handlePairClaim(req, res);
      return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Not Found' } }));
  }
}
