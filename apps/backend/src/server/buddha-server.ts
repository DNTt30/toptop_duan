import {
  ManagerHandshakeAuthSchema,
  OverlayHandshakeAuthSchema,
  PROTOCOL_VERSION,
  type ClientRole,
  type ManagerStateSnapshot,
  type OverlayStateSnapshot,
} from '@buddhalive/shared';
import http from 'node:http';
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
import { parseCookies } from '../security/http-guard';
import { OverlaySessionStore } from '../security/overlay-session-store';
import { PairingManager } from '../security/pairing';
import { RateLimiter, RATE_LIMITS } from '../security/rate-limiter';
import { AuthorizationPolicy } from '../security/policies/authorization.policy';
import { HttpController } from './controllers/http.controller';
import { PairingHttpController } from './controllers/pairing-http.controller';
import { StaticAssetController } from './controllers/static-asset.controller';
import { ManagerSocketController } from './controllers/manager-socket.controller';
import { OverlaySocketController } from './controllers/overlay-socket.controller';

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

/**
 * Server chính đóng vai trò Bootstrap và Wiring (nối kết các Controller và Engine).
 * Tuân thủ chuẩn Thin Controller (< 250 dòng).
 */
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

  // Controllers
  private readonly httpController: HttpController;
  private readonly managerSocketController: ManagerSocketController;
  private readonly overlaySocketController: OverlaySocketController;

  // Rate Limiters
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

    registerSecretForRedaction(this.managerToken);

    this.pairingManager = new PairingManager(Date.now, () => {
      this.broadcastManagerState();
    });

    this.overlayStaticDir =
      options.overlayStaticDir ??
      path.resolve(__dirname, '..', '..', '..', 'overlay', 'dist');

    // Khởi tạo Static Asset & Pairing Controller
    const staticAssetController = new StaticAssetController({
      overlayStaticDir: this.overlayStaticDir,
      assetsDir: this.ctx.paths.assetsDir,
    });

    const pairingController = new PairingHttpController({
      managerToken: this.managerToken,
      pairingManager: this.pairingManager,
      sessionStore: this.sessionStore,
      pairingReqLimiter: this.pairingReqLimiter,
      pairingClaimLimiter: this.pairingClaimLimiter,
      logger: this.logger.child('Pairing'),
      onSessionChanged: () => this.broadcastManagerState(),
    });

    this.httpController = new HttpController({
      port: this.port,
      host: this.host,
      logger: this.logger,
      staticAssetController,
      pairingController,
    });

    this.httpServer = http.createServer((req, res) => {
      this.httpController.handleRequest(req, res);
    });

    this.io = new SocketIOServer(this.httpServer, {
      path: '/socket.io',
      maxHttpBufferSize: 64 * 1024,
      cors: {
        origin: (requestOrigin, callback) => {
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

    // Khởi tạo Socket Controllers
    this.managerSocketController = new ManagerSocketController({
      engine: this.engine,
      demoSimulator: this.demoSimulator,
      liveManager: this.liveManager,
      pairingManager: this.pairingManager,
      sessionStore: this.sessionStore,
      managerCommandLimiter: this.managerCommandLimiter,
      logger: this.logger.child('ManagerSocket'),
      getObsStatus: () => this.getObsStatus(),
      onStateChanged: () => this.broadcastManagerState(),
      onRevokeOverlays: () => this.io.to('room:overlays').disconnectSockets(true),
    });

    this.overlaySocketController = new OverlaySocketController({
      engine: this.engine,
      overlayPacketLimiter: this.overlayPacketLimiter,
      logger: this.logger.child('OverlaySocket'),
      onStateChanged: () => this.broadcastManagerState(),
    });

    this.setupSocketIo();
  }

  public setObsClient(client: ObsWebSocketClient | null): void {
    this.obsClient = client;
  }

  public getObsStatus(): ObsConnectionStatus {
    return this.obsClient ? this.obsClient.getStatus() : 'DISCONNECTED';
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

  private setupSocketIo(): void {
    this.io.use((socket, next) => {
      const auth = socket.handshake.auth;
      if (!auth || typeof auth !== 'object') {
        return next(new Error('INVALID_HANDSHAKE: Missing authentication payload'));
      }

      if (auth.clientType === 'MANAGER') {
        const parsed = ManagerHandshakeAuthSchema.safeParse(auth);
        if (!parsed.success) {
          return next(new Error('INVALID_HANDSHAKE: Manager handshake schema mismatch'));
        }
        const actor = AuthorizationPolicy.authenticateManager(
          parsed.data.token,
          this.managerToken,
          parsed.data.instanceId
        );
        if (!actor) {
          return next(new Error('UNAUTHORIZED: Invalid manager token'));
        }
        (socket as any).authActor = actor;
        (socket as any).clientRole = actor.role as ClientRole;
        return next();
      }

      if (auth.clientType === 'OVERLAY') {
        const parsed = OverlayHandshakeAuthSchema.safeParse(auth);
        if (!parsed.success) {
          return next(new Error('INVALID_HANDSHAKE: Overlay handshake schema mismatch'));
        }

        const cookies = parseCookies(socket.handshake.headers.cookie);
        const overlayCookie = cookies['bls_overlay_session'];

        const actor = AuthorizationPolicy.authenticateOverlay(
          overlayCookie,
          this.sessionStore,
          parsed.data.instanceId
        );
        if (!actor) {
          return next(new Error('OVERLAY_PAIRING_REQUIRED'));
        }

        (socket as any).authActor = actor;
        (socket as any).clientRole = actor.role as ClientRole;
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
        this.managerSocketController.attach(socket);
      } else if (role === 'OVERLAY') {
        void socket.join('room:overlays');
        this.logger.info('Live Overlay connected via Socket.IO', { socketId: socket.id });
        this.sendOverlayState(socket);
        this.overlaySocketController.attach(socket);
        this.broadcastManagerState();
      }

      socket.on('disconnect', (reason) => {
        this.logger.info(`Socket disconnected (${role})`, { socketId: socket.id, reason });
        if (role === 'OVERLAY') {
          this.engine.handleOverlayReloadOrDisconnect();
          this.broadcastManagerState();
        }
      });
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
      engineStatus: this.engine.getEngineStatus(),
      isPaused: this.engine.getIsPaused(),
      queueMetrics: this.engine.getQueueMetrics(),
      queuedExecutions: this.ctx.execRepo.listQueued(20).map(toExecutionSummary),
      liveConnection: this.liveManager.getSummary(),
    };
  }
}
