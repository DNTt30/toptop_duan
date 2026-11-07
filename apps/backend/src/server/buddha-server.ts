import {
  ApproveOverlayPairPayloadSchema,
  DemoRunScenarioPayloadSchema,
  DemoStopScenarioPayloadSchema,
  DemoTriggerGiftPayloadSchema,
  MANAGER_EVENT_ALLOWLIST,
  ManagerHandshakeAuthSchema,
  OVERLAY_EVENT_ALLOWLIST,
  OverlayActionCancelledPayloadSchema,
  OverlayExecutionCompletedPayloadSchema,
  OverlayExecutionFailedPayloadSchema,
  OverlayExecutionStartedPayloadSchema,
  OverlayHandshakeAuthSchema,
  OverlayTelemetryPayloadSchema,
  PROTOCOL_VERSION,
  QueueControlPayloadSchema,
  type ClientRole,
  type ManagerStateSnapshot,
  type OverlayStateSnapshot,
  type QueueControlResult,
  type SocketAck,
} from '@buddhalive/shared';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { createLogger, registerSecretForRedaction, type Logger } from '../config/logger';
import type { SqliteDatabaseContext } from '../db/connection';
import { toExecutionSummary } from '../db/repositories/event-execution.repository';
import { EventEngine } from '../engine/event-engine';
import { DemoSimulator } from '../engine/demo-simulator';
import { TikTokDisconnectedAdapter } from '../adapters/tiktok-disconnected-adapter';
import { LiveConfigService } from '../security/live-config-service';
import { LiveConnectionManager } from '../adapters/live-connection-manager';
import { ObsWebSocketClient, type ObsConnectionStatus } from '../adapters/obs-websocket-client';
import { NodeDevSecretCipher } from '../security/ciphers';
import type { SecretCipher } from '../security/overlay-session-store';
import {
  checkHttpSafety,
  extractBearerToken,
  parseCookies,
} from '../security/http-guard';
import { OverlaySessionStore } from '../security/overlay-session-store';
import { PairingManager } from '../security/pairing';
import { RateLimiter, RATE_LIMITS } from '../security/rate-limiter';
import { constantTimeEquals } from '../security/tokens';

export interface BuddhaServerOptions {
  port?: number;
  host?: string;
  managerToken: string;
  overlayStaticDir?: string;
  logger?: Logger;
  cipher?: SecretCipher;
  liveConfigService?: LiveConfigService;
  customWebSocketFactory?: (url: string) => any;
}

export class BuddhaServer {
  private readonly port: number;
  private readonly host: string;
  public readonly managerToken: string;
  private readonly logger: Logger;
  private readonly httpServer: http.Server;
  private readonly io: SocketIOServer;
  public readonly pairingManager: PairingManager;
  public readonly sessionStore: OverlaySessionStore;
  public readonly engine: EventEngine;
  public readonly demoSimulator: DemoSimulator;
  public readonly tiktokAdapter: TikTokDisconnectedAdapter;
  public readonly liveConfigService: LiveConfigService;
  public readonly liveManager: LiveConnectionManager;
  public obsClient: ObsWebSocketClient | null = null;

  public setObsClient(client: ObsWebSocketClient | null): void {
    this.obsClient = client;
  }

  public getObsStatus(): ObsConnectionStatus {
    return this.obsClient ? this.obsClient.getStatus() : 'DISCONNECTED';
  }

  private readonly pairingReqLimiter = new RateLimiter(RATE_LIMITS.pairingRequestPerMinute, 60_000);
  private readonly pairingClaimLimiter = new RateLimiter(RATE_LIMITS.pairingExchangePerMinute, 60_000);
  private readonly managerCommandLimiter = new RateLimiter(RATE_LIMITS.managerCommandPerMinute, 60_000);
  private readonly overlayPacketLimiter = new RateLimiter(RATE_LIMITS.overlayPacketsPerSecond, 1000);

  private readonly overlayStaticDir: string;
  private isListening = false;

  constructor(
    private ctx: SqliteDatabaseContext,
    sessionStore: OverlaySessionStore,
    options: BuddhaServerOptions
  ) {
    this.port = options.port ?? 3721;
    this.host = options.host ?? '127.0.0.1';
    this.managerToken = options.managerToken;
    this.sessionStore = sessionStore;
    this.logger = options.logger ?? createLogger('Server');

    // Đăng ký managerToken vào bộ che dấu logger (architecture.md §3 — Lớp 2)
    registerSecretForRedaction(this.managerToken);

    this.pairingManager = new PairingManager(Date.now, () => {
      this.broadcastManagerState();
    });

    this.overlayStaticDir =
      options.overlayStaticDir ??
      path.resolve(__dirname, '..', '..', '..', 'overlay', 'dist');

    this.httpServer = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    this.io = new SocketIOServer(this.httpServer, {
      path: '/socket.io',
      maxHttpBufferSize: 64 * 1024, // 64KB max packet size (Lớp 6)
      cors: {
        origin: (requestOrigin, callback) => {
          // Cho phép loopback và file origin
          if (!requestOrigin) return callback(null, true);
          try {
            const u = new URL(requestOrigin);
            if (
              u.hostname === '127.0.0.1' ||
              u.hostname === 'localhost' ||
              u.protocol === 'file:' ||
              u.protocol === 'vscode-webview:'
            ) {
              return callback(null, true);
            }
          } catch {
            // Ignore
          }
          return callback(new Error('CORS origin forbidden'), false);
        },
        credentials: true,
      },
    });

    this.engine = new EventEngine(
      this.ctx,
      {
        emitToOverlays: (event, payload) => this.io.to('room:overlays').emit(event, payload),
        emitToManagers: (event, payload) => this.io.to('room:managers').emit(event, payload),
        getReadyOverlayCount: () => this.getReadyOverlayCount(),
      },
      this.logger.child('Engine')
    );

    this.demoSimulator = new DemoSimulator({
      logger: this.logger.child('DemoSimulator'),
      onEvent: (event) => {
        this.engine.handleIncomingLiveEvent(event);
        this.broadcastManagerState();
      },
    });

    this.tiktokAdapter = new TikTokDisconnectedAdapter(this.logger.child('TikTokAdapter'));
    this.tiktokAdapter.onEvent((event) => {
      this.engine.handleIncomingLiveEvent(event);
      this.broadcastManagerState();
    });

    this.liveConfigService =
      options.liveConfigService ??
      new LiveConfigService({
        baseDir: ctx.paths.baseDir,
        cipher: options.cipher ?? new NodeDevSecretCipher(),
        logger: this.logger.child('LiveConfigService'),
      });

    this.liveManager = new LiveConnectionManager({
      liveConfigService: this.liveConfigService,
      engine: this.engine,
      logger: this.logger.child('LiveManager'),
      onStatusChange: () => {
        this.broadcastManagerState();
      },
      customWebSocketFactory: options.customWebSocketFactory,
      ctx: this.ctx,
      getOverlayCount: () => this.getReadyOverlayCount(),
      getObsStatus: () => this.getObsStatus(),
    });

    this.setupSocketIo();
  }

  public getReadyOverlayCount(): number {
    const room = this.io.sockets.adapter.rooms.get('room:overlays');
    return room ? room.size : 0;
  }

  public replaceDbContext(newCtx: SqliteDatabaseContext): void {
    this.ctx = newCtx;
    this.engine.replaceDbContext(newCtx);
    this.logger.info('BuddhaServer database context replaced after restore');
    this.broadcastManagerState();
  }

  public async start(): Promise<void> {
    this.sessionStore.load();
    await this.demoSimulator.start();
    await this.tiktokAdapter.start();

    // Tự động kết nối nếu được streamer cấu hình autoConnectOnStart
    const liveConfig = this.liveConfigService.getConfig();
    if (liveConfig?.autoConnectOnStart) {
      this.logger.info(`Auto-connecting to ${liveConfig.provider} on server startup...`);
      void this.liveManager.connect();
    }

    await new Promise<void>((resolve, reject) => {
      this.httpServer.once('error', reject);
      this.httpServer.listen(this.port, this.host, () => {
        this.isListening = true;
        this.logger.info(`BuddhaLive Studio Server listening on http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    await this.liveManager.destroy();
    this.demoSimulator.stopScenario();
    await this.demoSimulator.stop();
    await this.tiktokAdapter.stop();
    this.engine.destroy();
    if (this.isListening) {
      if (typeof (this.httpServer as any).closeAllConnections === 'function') {
        try {
          (this.httpServer as any).closeAllConnections();
        } catch {
          // Ignore
        }
      }
      await new Promise<void>((resolve) => {
        this.io.close(() => {
          this.httpServer.close(() => {
            this.isListening = false;
            resolve();
          });
        });
      });
    }
  }

  /* -------------------------------------------------------------------------- */
  /* HTTP Request Handler                                                       */
  /* -------------------------------------------------------------------------- */

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    if (!checkHttpSafety(req, res, { allowedPort: this.port }, this.logger)) {
      return;
    }

    const parsedUrl = new URL(req.url ?? '/', `http://${this.host}:${this.port}`);
    const pathname = parsedUrl.pathname;

    // 1. Phục vụ tài nguyên tĩnh Overlay (/overlay hoặc /overlay/* hoặc /backgrounds/*)
    if (pathname === '/overlay') {
      res.writeHead(302, { Location: '/overlay/' });
      res.end();
      return;
    }
    if (pathname.startsWith('/overlay/') || pathname.startsWith('/backgrounds/')) {
      this.serveOverlayStatic(pathname, res);
      return;
    }

    // 2. Phục vụ assets an toàn (/assets/*)
    if (pathname.startsWith('/assets/')) {
      this.serveAssetFile(pathname, res);
      return;
    }

    // 3. API Ghép nối Overlay (Pairing endpoints)
    if (pathname === '/api/overlay/pair/request' && req.method === 'POST') {
      this.handlePairRequest(req, res);
      return;
    }

    if (pathname === '/api/overlay/pair/approve' && req.method === 'POST') {
      void this.handlePairApprove(req, res);
      return;
    }

    if (pathname === '/api/overlay/pair/claim' && req.method === 'POST') {
      void this.handlePairClaim(req, res);
      return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Not Found' } }));
  }

  private handlePairRequest(req: IncomingMessage, res: ServerResponse): void {
    const clientIp = req.socket.remoteAddress || 'local';
    if (!this.pairingReqLimiter.consume(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many pair requests' } })
      );
      return;
    }

    const pair = this.pairingManager.request();
    // Đăng ký claimSecret vào logger để tự động che chắn
    registerSecretForRedaction(pair.claimSecret);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, data: pair }));
  }

  private async handlePairApprove(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    const bearer = extractBearerToken(authHeader);
    if (!bearer || !constantTimeEquals(bearer, this.managerToken)) {
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

    const success = this.pairingManager.approve(parsed.data.pairingId, parsed.data.code);
    if (!success) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ ok: false, error: { code: 'PAIR_FAILED', message: 'Invalid pairing ID or code' } })
      );
      return;
    }

    this.logger.info('Approved overlay pair request', { pairingId: parsed.data.pairingId });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }

  private async handlePairClaim(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const clientIp = req.socket.remoteAddress || 'local';
    if (!this.pairingClaimLimiter.consume(clientIp)) {
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

    const claimResult = this.pairingManager.claim(pairingId, claimSecret);
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
        JSON.stringify({ ok: false, error: { code: 'PAIRING_INVALID', message: `Pairing ${claimResult.toLowerCase()}` } })
      );
      return;
    }

    // Cấp mới overlayToken và trả về qua Set-Cookie HttpOnly; SameSite=Strict
    const token = this.sessionStore.issue();
    registerSecretForRedaction(token);

    this.logger.info('Successfully paired new overlay session and issued cookie');
    this.broadcastManagerState();

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `bls_overlay_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
    });
    res.end(JSON.stringify({ ok: true, data: { status: 'PAIRED' } }));
  }

  private serveOverlayStatic(pathname: string, res: ServerResponse): void {
    const subPath = pathname.replace(/^\/overlay\/?/, '').replace(/^\/backgrounds\/?/, 'backgrounds/');
    const cleanSub = subPath ? path.normalize(subPath).replace(/^(\.\.(\/|\\|$))+/, '') : 'index.html';
    let target = path.join(this.overlayStaticDir, cleanSub);

    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      target = path.join(this.overlayStaticDir, 'index.html');
    }

    if (!fs.existsSync(target)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>BuddhaLive Live Overlay</title></head>
          <body style="background:transparent;color:#fff;font-family:sans-serif;padding:20px;">
            <div id="root">Overlay building in progress...</div>
          </body>
        </html>
      `);
      return;
    }

    const ext = path.extname(target).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(target).pipe(res);
  }

  private serveAssetFile(pathname: string, res: ServerResponse): void {
    const fileName = path.basename(pathname);
    let target = path.resolve(this.ctx.paths.assetsDir, fileName);

    // Chống Path Traversal (architecture.md §3 — Lớp 4)
    if (!target.startsWith(path.resolve(this.ctx.paths.assetsDir))) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'FORBIDDEN_PATH' } }));
      return;
    }

    if (!fs.existsSync(target)) {
      // Fallback kiểm tra trong thư mục assets của bundle overlay
      const overlayAsset = path.resolve(this.overlayStaticDir, 'assets', fileName);
      if (fs.existsSync(overlayAsset) && overlayAsset.startsWith(path.resolve(this.overlayStaticDir, 'assets'))) {
        target = overlayAsset;
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: { code: 'ASSET_NOT_FOUND' } }));
        return;
      }
    }

    const ext = path.extname(target).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.glb': 'model/gltf-binary',
      '.gltf': 'model/gltf+json',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(target).pipe(res);
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

  /* -------------------------------------------------------------------------- */
  /* Socket.IO Gateway & Phân quyền                                             */
  /* -------------------------------------------------------------------------- */

  private setupSocketIo(): void {
    // Middleware bắt tay (Handshake Authentication — Lớp 2 & Lớp 3)
    this.io.use((socket, next) => {
      const auth = socket.handshake.auth;

      if (auth.clientType === 'MANAGER') {
        const parsed = ManagerHandshakeAuthSchema.safeParse(auth);
        if (!parsed.success) {
          return next(new Error('INVALID_HANDSHAKE: Manager handshake schema mismatch'));
        }
        if (!constantTimeEquals(parsed.data.token, this.managerToken)) {
          return next(new Error('UNAUTHORIZED: Invalid manager token'));
        }
        (socket as any).clientRole = 'MANAGER' as ClientRole;
        return next();
      }

      if (auth.clientType === 'OVERLAY') {
        const parsed = OverlayHandshakeAuthSchema.safeParse(auth);
        if (!parsed.success) {
          return next(new Error('INVALID_HANDSHAKE: Overlay handshake schema mismatch'));
        }

        // Đọc cookie HttpOnly "bls_overlay_session" từ handshake headers
        const cookies = parseCookies(socket.handshake.headers.cookie);
        const overlayCookie = cookies['bls_overlay_session'];

        if (!this.sessionStore.isValid(overlayCookie)) {
          return next(new Error('OVERLAY_PAIRING_REQUIRED'));
        }

        (socket as any).clientRole = 'OVERLAY' as ClientRole;
        return next();
      }

      return next(new Error('UNAUTHORIZED_CLIENT_TYPE'));
    });

    this.io.on('connection', (socket: Socket) => {
      const role = (socket as any).clientRole as ClientRole;

      if (role === 'MANAGER') {
        void socket.join('room:managers');
        this.logger.info('Desktop Manager connected via Socket.IO', { socketId: socket.id });
        this.sendManagerState(socket);
        this.attachManagerEvents(socket);
      } else if (role === 'OVERLAY') {
        void socket.join('room:overlays');
        this.logger.info('Live Overlay connected via Socket.IO', { socketId: socket.id });
        this.sendOverlayState(socket);
        this.attachOverlayEvents(socket);
        this.broadcastManagerState();
      }

      socket.on('disconnect', (reason) => {
        this.logger.info(`Socket disconnected (${role})`, { socketId: socket.id, reason });
        if (role === 'OVERLAY') {
          // Bắt buộc xử lý hủy lượt dở theo Quy định 6
          this.engine.handleOverlayReloadOrDisconnect();
          this.broadcastManagerState();
        }
      });
    });
  }

  private attachManagerEvents(socket: Socket): void {
    // Cổng kiểm tra Allowlist & Rate Limit Lớp 6
    socket.onAny((eventName, ...args) => {
      const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;

      if (!(MANAGER_EVENT_ALLOWLIST as readonly string[]).includes(eventName)) {
        this.logger.warn('Blocked disallowed manager event', { eventName });
        if (ack) {
          ack({ ok: false, error: { code: 'FORBIDDEN_ROLE', message: `Event ${eventName} not permitted for MANAGER` } });
        }
        return;
      }

      if (!this.managerCommandLimiter.consume(socket.id)) {
        if (ack) {
          ack({ ok: false, error: { code: 'RATE_LIMITED', message: 'Manager command rate limit exceeded' } });
        }
        return;
      }

      if (eventName === 'demo:trigger_gift') {
        if (this.liveManager.isLiveActive()) {
          if (ack) {
            ack({
              ok: false,
              error: {
                code: 'FORBIDDEN_ROLE',
                message: 'DEMO_BLOCKED_DURING_LIVE_SESSION: Không thể phát sự kiện Demo khi phiên kết nối LIVE đang hoạt động.',
              },
            });
          }
          return;
        }

        const payload = args[0];
        const parsed = DemoTriggerGiftPayloadSchema.safeParse(payload);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }
        const result = this.engine.triggerDemoGift(parsed.data);
        if (ack) ack({ ok: true, data: result });
        this.broadcastManagerState();
      } else if (eventName === 'security:approve_overlay_pair') {
        const parsed = ApproveOverlayPairPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }
        const ok = this.pairingManager.approve(parsed.data.pairingId, parsed.data.code);
        if (ack) ack(ok ? { ok: true } : { ok: false, error: { code: 'NOT_FOUND', message: 'Pairing entry not found' } });
        this.broadcastManagerState();
      } else if (eventName === 'security:revoke_overlay_sessions') {
        const revoked = this.sessionStore.revokeAll();
        this.logger.warn('Revoked all overlay sessions', { revoked });
        // Ngắt kết nối tất cả socket trong room:overlays để buộc pairing lại
        this.io.to('room:overlays').disconnectSockets(true);
        if (ack) ack({ ok: true, data: { revokedCount: revoked } });
        this.broadcastManagerState();
      } else if (eventName === 'queue:control') {
        const parsed = QueueControlPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }

        const { action, reason } = parsed.data;
        let controlResult: QueueControlResult;

        if (action === 'PAUSE') {
          this.engine.pauseQueue();
          controlResult = {
            action,
            success: true,
            affectedCount: 0,
            engineStatus: this.engine.getEngineStatus(),
            isPaused: true,
            message: 'Queue dispatch paused',
          };
        } else if (action === 'RESUME') {
          this.engine.resumeQueue();
          controlResult = {
            action,
            success: true,
            affectedCount: 0,
            engineStatus: this.engine.getEngineStatus(),
            isPaused: false,
            message: 'Queue dispatch resumed',
          };
        } else if (action === 'SKIP') {
          const skipRes = this.engine.skipCurrent(reason, { barrierMs: 150 });
          controlResult = {
            action,
            success: skipRes.success,
            affectedCount: skipRes.success ? 1 : 0,
            engineStatus: this.engine.getEngineStatus(),
            isPaused: this.engine.getIsPaused(),
            message: skipRes.success
              ? `Skipped active execution ${skipRes.skippedId}`
              : 'No active execution to skip',
          };
        } else {
          // CLEAR
          const clearRes = this.engine.clearQueue(reason);
          controlResult = {
            action,
            success: true,
            affectedCount: clearRes.clearedCount,
            engineStatus: this.engine.getEngineStatus(),
            isPaused: this.engine.getIsPaused(),
            message: `Cleared ${clearRes.clearedCount} executions from queue`,
          };
        }

        if (ack) ack({ ok: true, data: controlResult });
        this.broadcastManagerState();
      } else if (eventName === 'demo:run_scenario') {
        if (this.liveManager.isLiveActive()) {
          if (ack) {
            ack({
              ok: false,
              error: {
                code: 'FORBIDDEN_ROLE',
                message: 'DEMO_BLOCKED_DURING_LIVE_SESSION: Không thể khởi chạy kịch bản Demo mô phỏng khi phiên kết nối LIVE đang hoạt động.',
              },
            });
          }
          return;
        }

        const parsed = DemoRunScenarioPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }

        void this.demoSimulator.runScenario(parsed.data.scenario).then((scenarioRes) => {
          if (ack) ack({ ok: true, data: scenarioRes });
          this.broadcastManagerState();
        });
      } else if (eventName === 'demo:stop_scenario') {
        this.demoSimulator.stopScenario();
        if (ack) ack({ ok: true });
        this.broadcastManagerState();
      } else if (eventName === 'live:connect') {
        void this.liveManager.connect().then((connectResult) => {
          if (ack) ack({ ok: connectResult.ok, data: connectResult });
          this.broadcastManagerState();
        });
      } else if (eventName === 'live:disconnect') {
        void this.liveManager.disconnect().then((disconnectResult) => {
          if (ack) ack({ ok: disconnectResult.ok, data: disconnectResult });
          this.broadcastManagerState();
        });
      } else if (eventName === 'live:get_diagnostics') {
        const diagnostics = this.liveManager.getDiagnostics(this.getObsStatus());
        if (ack) ack({ ok: true, data: diagnostics });
      } else if (eventName === 'live:export_diagnostics') {
        const format = args[0]?.format === 'json' ? 'json' : 'markdown';
        const report = this.liveManager.exportDiagnosticsReport(format, this.getObsStatus());
        if (ack) ack({ ok: true, data: { report, format } });
      }
    });
  }

  private attachOverlayEvents(socket: Socket): void {
    socket.onAny((eventName, ...args) => {
      const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;

      if (!(OVERLAY_EVENT_ALLOWLIST as readonly string[]).includes(eventName)) {
        this.logger.warn('Blocked disallowed overlay event', { eventName });
        if (ack) {
          ack({ ok: false, error: { code: 'FORBIDDEN_ROLE', message: `Event ${eventName} not permitted for OVERLAY` } });
        }
        return;
      }

      if (!this.overlayPacketLimiter.consume(socket.id)) {
        if (ack) {
          ack({ ok: false, error: { code: 'RATE_LIMITED', message: 'Overlay packet rate limit exceeded' } });
        }
        return;
      }

      if (eventName === 'overlay:telemetry') {
        const parsed = OverlayTelemetryPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }
        this.engine.setOverlayReady(parsed.data.readyToPlay);
        if (ack) ack({ ok: true });
        this.broadcastManagerState();
      } else if (eventName === 'overlay:execution_started') {
        const parsed = OverlayExecutionStartedPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }
        this.engine.handleExecutionStarted(parsed.data);
        if (ack) ack({ ok: true });
        this.broadcastManagerState();
      } else if (eventName === 'overlay:execution_completed') {
        const parsed = OverlayExecutionCompletedPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }
        this.engine.handleExecutionCompleted(parsed.data);
        if (ack) ack({ ok: true });
        this.broadcastManagerState();
      } else if (eventName === 'overlay:execution_failed') {
        const parsed = OverlayExecutionFailedPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }
        this.engine.handleExecutionFailed(parsed.data);
        if (ack) ack({ ok: true });
        this.broadcastManagerState();
      } else if (eventName === 'overlay:action_cancelled') {
        const parsed = OverlayActionCancelledPayloadSchema.safeParse(args[0]);
        if (!parsed.success) {
          if (ack) ack({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
          return;
        }
        this.engine.handleActionCancelled(parsed.data.executionId);
        if (ack) ack({ ok: true });
        this.broadcastManagerState();
      }
    });
  }

  public sendOverlayState(socket: Socket): void {
    const fps = this.ctx.settingsRepo.get('overlay.fps_limit');
    const fallback2d = this.ctx.settingsRepo.get('overlay.fallback_2d_alert');
    const demoBadge = this.ctx.settingsRepo.get('overlay.show_demo_badge');

    const snapshot: OverlayStateSnapshot = {
      protocolVersion: PROTOCOL_VERSION,
      overlayState: 'HIDDEN_STANDBY',
      serverTime: new Date().toISOString(),
      queuedCount: this.ctx.execRepo.getQueuedCount(),
      settings: {
        fpsLimit: fps ? Number(fps.valueJson) : 60,
        fallback2dEnabled: fallback2d ? fallback2d.valueJson === 'true' : true,
        showDemoBadge: demoBadge ? demoBadge.valueJson === 'true' : true,
      },
    };
    socket.emit('system:state_snapshot', snapshot);
  }

  public sendManagerState(socket: Socket): void {
    socket.emit('system:state_snapshot', this.buildManagerStateSnapshot());
  }

  public broadcastManagerState(): void {
    this.io.to('room:managers').emit('system:state_snapshot', this.buildManagerStateSnapshot());
  }

  public buildManagerStateSnapshot(): ManagerStateSnapshot {
    const active = this.ctx.execRepo.getActiveExecution();
    const recent = this.ctx.execRepo.listRecent(8).map(toExecutionSummary);
    const activeChar = this.ctx.charRepo.getActiveCharacter();
    const readyCount = this.getReadyOverlayCount();

    return {
      protocolVersion: PROTOCOL_VERSION,
      serverTime: new Date().toISOString(),
      overlayUrl: `http://${this.host}:${this.port}/overlay`,
      connectedOverlays: this.getReadyOverlayCount(),
      readyOverlays: readyCount,
      pairedOverlaySessions: this.sessionStore.count,
      pendingPairRequests: this.pairingManager.listPending(),
      activeExecution: active ? toExecutionSummary(active) : null,
      queuedCount: this.ctx.execRepo.getQueuedCount(),
      recentExecutions: recent,
      sampleCharacter: activeChar ? { id: activeChar.id, name: activeChar.name, giftName: 'Hoa Sen' } : null,
      tiktokAdapterStatus: this.liveManager.getStatus(),
      // S5 additions
      engineStatus: this.engine.getEngineStatus(),
      isPaused: this.engine.getIsPaused(),
      queueMetrics: this.engine.getQueueMetrics(),
      queuedExecutions: this.ctx.execRepo.listQueued(20).map(toExecutionSummary),
      // S9 additions
      liveConnection: this.liveManager.getSummary(),
    };
  }
}
