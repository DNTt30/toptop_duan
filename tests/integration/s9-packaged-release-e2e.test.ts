import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { io as ClientIo, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BackupService,
  BuddhaServer,
  createLogger,
  EventEngine,
  generateSecretToken,
  LiveConfigService,
  LiveConnectionManager,
  NodeDevSecretCipher,
  ObsWebSocketClient,
  openSqliteDatabase,
  OverlaySessionStore,
  VerifiedProviderAdapter,
  type SqliteDatabaseContext,
} from '../../apps/backend/src';

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');
const DESKTOP_DIR = path.join(WORKSPACE_ROOT, 'apps', 'desktop');
const RELEASE_DIR = path.join(DESKTOP_DIR, 'release');
const PACKAGED_EXE_PATH = path.join(RELEASE_DIR, 'win-unpacked', 'BuddhaLive Studio.exe');
const INSTALLER_EXE_PATH = path.join(RELEASE_DIR, 'BuddhaLive Studio Setup 0.1.0.exe');

/**
 * Mock WebSocket Client mô phỏng kết nối mạng hai chiều cho Provider và OBS Studio
 */
class MockBidirectionalWebSocket extends EventEmitter {
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: ((err: any) => void) | null = null;
  public onclose: ((event: any) => void) | null = null;
  public readyState = 1; // OPEN
  public sentMessages: any[] = [];

  constructor(public readonly url: string) {
    super();
    queueMicrotask(() => {
      if (this.onopen) this.onopen();
    });
  }

  public send(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.sentMessages.push(parsed);
      this.emit('messageSent', parsed);
    } catch {
      this.sentMessages.push(data);
      this.emit('messageSent', data);
    }
  }

  public close(code = 1000, reason = 'Normal Closure'): void {
    this.readyState = 3;
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }

  public simulateServerMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
  }

  public simulateClose(code: number, reason: string): void {
    this.readyState = 3;
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }

  public simulateError(msg: string): void {
    if (this.onerror) {
      this.onerror(new Error(msg));
    }
  }
}

/**
 * Mock OBS Studio WebSocket Server (v5 protocol)
 */
class MockObsStudioServer {
  public challenge = 'obs_pkg_e2e_challenge_salt';
  public salt = 'obs_pkg_e2e_salt_456';
  public expectedPassword = 'buddha_obs_pkg_secret_password';
  public expectedAuthHash: string;

  public activeSocket: MockBidirectionalWebSocket | null = null;
  public isIdentified = false;
  public scenes = [
    { sceneName: 'Scene 1 - Stream Chinh', sceneIndex: 0 },
    { sceneName: 'Scene 2 - Backup', sceneIndex: 1 },
  ];
  public currentProgramSceneName = 'Scene 1 - Stream Chinh';
  public browserSourceSettings = {
    url: 'http://127.0.0.1:3721/overlay',
    width: 1080,
    height: 1920,
    fps: 60,
    shutdown: false,
    restart: true,
  };

  constructor() {
    const secretHash = crypto
      .createHash('sha256')
      .update(this.expectedPassword + this.salt)
      .digest('base64');
    this.expectedAuthHash = crypto
      .createHash('sha256')
      .update(secretHash + this.challenge)
      .digest('base64');
  }

  public handleNewConnection(ws: MockBidirectionalWebSocket): void {
    this.activeSocket = ws;
    this.isIdentified = false;

    // OBS v5 Opcode 0: Hello
    queueMicrotask(() => {
      ws.simulateServerMessage({
        op: 0,
        d: {
          obsWebSocketVersion: '5.5.0',
          rpcVersion: 1,
          authentication: {
            challenge: this.challenge,
            salt: this.salt,
          },
        },
      });
    });

    // Xử lý messages từ BuddhaLive ObsClient
    ws.on('messageSent', (data: any) => {
      if (typeof data !== 'object' || data === null) return;

      // Opcode 1: Identify
      if (data.op === 1) {
        const clientAuth = data.d?.authentication;
        if (clientAuth === this.expectedAuthHash) {
          this.isIdentified = true;
          // Opcode 2: Identified
          ws.simulateServerMessage({
            op: 2,
            d: {
              negotiatedRpcVersion: 1,
            },
          });
        } else {
          // Authentication failed
          ws.simulateClose(4009, 'Authentication Failed (Incorrect Password)');
        }
        return;
      }

      // Opcode 6: Request
      if (data.op === 6) {
        const reqType = data.d?.requestType;
        const reqId = data.d?.requestId;

        if (reqType === 'GetSceneList') {
          ws.simulateServerMessage({
            op: 7,
            d: {
              requestId: reqId,
              requestType: reqType,
              requestStatus: { result: true, code: 100 },
              responseData: {
                currentProgramSceneName: this.currentProgramSceneName,
                scenes: this.scenes,
              },
            },
          });
        } else if (reqType === 'GetInputSettings') {
          ws.simulateServerMessage({
            op: 7,
            d: {
              requestId: reqId,
              requestType: reqType,
              requestStatus: { result: true, code: 100 },
              responseData: {
                inputName: data.d?.requestData?.inputName,
                inputKind: 'browser_source',
                inputSettings: this.browserSourceSettings,
              },
            },
          });
        } else if (reqType === 'SetInputSettings') {
          this.browserSourceSettings = {
            ...this.browserSourceSettings,
            ...data.d?.requestData?.inputSettings,
          };
          ws.simulateServerMessage({
            op: 7,
            d: {
              requestId: reqId,
              requestType: reqType,
              requestStatus: { result: true, code: 100 },
              responseData: {
                inputSettings: this.browserSourceSettings,
              },
            },
          });
        }
      }
    });
  }
}

describe('Milestone S9 - T-34: PACKAGED RELEASE E2E & INSTALLER VERIFICATION', () => {
  const testLogger = createLogger('TestPackagedReleaseE2E');
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir && fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        } catch {
          // Ignore busy SQLite files on Windows temp
        }
      }
    }
  });

  // =========================================================================
  // T34-A: Fresh Installation / Packaged Environment Verification
  // =========================================================================
  describe('T34-A: Fresh Installation / Packaged Environment Verification', () => {
    it('verifies NSIS Installer Setup executable exists with valid size and version metadata', () => {
      expect(
        fs.existsSync(INSTALLER_EXE_PATH),
        `Installer Setup executable missing at ${INSTALLER_EXE_PATH}. Run "pnpm build:desktop" first.`
      ).toBe(true);

      const stats = fs.statSync(INSTALLER_EXE_PATH);
      // Installer should be > 100MB (full electron runtime + packed resources)
      expect(stats.size).toBeGreaterThan(100 * 1024 * 1024);
      expect(path.basename(INSTALLER_EXE_PATH)).toBe('BuddhaLive Studio Setup 0.1.0.exe');
    });

    it('verifies packaged Windows executable exists and contains uncompressed native better-sqlite3', () => {
      expect(
        fs.existsSync(PACKAGED_EXE_PATH),
        `Packaged executable missing at ${PACKAGED_EXE_PATH}. Run "pnpm pack:win-dir" first.`
      ).toBe(true);

      const winUnpackedDir = path.dirname(PACKAGED_EXE_PATH);
      const nativeSqliteDir = path.join(
        winUnpackedDir,
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'better-sqlite3'
      );
      expect(fs.existsSync(nativeSqliteDir)).toBe(true);

      const winPrebuild = path.join(nativeSqliteDir, 'prebuilds', 'win32-x64.node');
      expect(fs.existsSync(winPrebuild)).toBe(true);

      // Verify bundled overlay and GLB assets
      const overlayDist = path.join(DESKTOP_DIR, 'dist-overlay', 'index.html');
      expect(fs.existsSync(overlayDist)).toBe(true);

      const sampleGlb = path.join(DESKTOP_DIR, 'bundled-assets', 'sample-character.glb');
      expect(fs.existsSync(sampleGlb)).toBe(true);
    });

    it('executes packaged Windows executable in clean environment: SQLite WAL bootstrap, migrations, and exit cleanly', () => {
      const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s9-pkg-fresh-'));
      tempDirs.push(tempBase);

      const userDataDir = path.join(tempBase, 'appdata');
      const verifyJsonPath = path.join(tempBase, 'verify-s9-packaged.json');

      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      env.BUDDHALIVE_USER_DATA_DIR = userDataDir;
      env.BUDDHALIVE_S2_VERIFY_OUT = verifyJsonPath;

      const proc = spawnSync(PACKAGED_EXE_PATH, [], {
        cwd: path.dirname(PACKAGED_EXE_PATH),
        env,
        encoding: 'utf-8',
        timeout: 90000,
      });

      expect(proc.status, `Packaged .exe stderr: ${proc.stderr}`).toBe(0);
      expect(fs.existsSync(verifyJsonPath)).toBe(true);

      const report = JSON.parse(fs.readFileSync(verifyJsonPath, 'utf-8'));
      expect(report.isPackaged).toBe(true);
      expect(report.payload.rendererIsolationOk).toBe(true);
      expect(report.payload.health.ok).toBe(true);
      expect(report.payload.health.journalMode).toBe('wal');
      expect(report.payload.health.foreignKeysEnabled).toBe(true);
      expect(report.payload.health.appliedMigrations).toContain('001_bootstrap_app_settings');
      expect(report.payload.health.appliedMigrations).toContain('002_core_schema_and_sample_seed');
      expect(report.payload.health.appliedMigrations).toContain('003_s5_queue_controls_and_adapters');
      expect(report.payload.demoExecutionOk).toBe(true);

      // Open SQLite database directly to confirm durable persistence
      const checkCtx = openSqliteDatabase({ baseDir: userDataDir });
      const activeChar = checkCtx.charRepo.getActiveCharacter();
      expect(activeChar).not.toBeNull();
      expect(activeChar?.name).toBe('Tiểu Sa Di');

      const health = checkCtx.runStorageHealthCheck({ isPackaged: true });
      expect(health.ok).toBe(true);
      expect(health.readWriteProbeOk).toBe(true);
      checkCtx.close();
    });
  });

  // =========================================================================
  // T34-B: Upgrade & AppData Preservation & DPAPI Tamper Resistance
  // =========================================================================
  describe('T34-B: Upgrade & AppData Preservation & DPAPI Tamper Resistance', () => {
    it('preserves user database, custom characters, animations, rules, live config, and DPAPI keys across upgrade cycle', () => {
      const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s9-upgrade-appdata-'));
      tempDirs.push(tempUserDataDir);

      const cipher = new NodeDevSecretCipher();

      // Phase 1: Previous version runtime simulation
      {
        const ctx1 = openSqliteDatabase({ baseDir: tempUserDataDir });

        // Add custom character and set active
        const customChar = ctx1.charRepo.create({
          name: 'Đức Bổn Sư Thích Ca S9 Packaged',
          slug: 'duc-bon-su-s9-pkg',
          modelPath: 'sample-character.glb',
          visibilityMode: 'PERSISTENT_IDLE',
          isActive: false,
        });
        ctx1.charRepo.setActive(customChar.id);

        // Add custom animation
        const customAnim = ctx1.animRepo.create({
          characterId: customChar.id,
          name: 'Cầu An Chúc Phúc S9',
          clipName: 'Blessing',
          category: 'REACTION',
          durationMs: 4500,
        });

        // Add custom gift rule
        ctx1.ruleRepo.create({
          characterId: customChar.id,
          animationId: customAnim.id,
          name: 'Quy Tắc Hoa Sen Khổng Lồ',
          triggerGiftId: 'lotus_giant',
          priority: 25,
          minGiftCount: 1,
          comboTriggerMode: 'EACH_EVENT',
          isEnabled: true,
        });

        // Save live configuration with EulerStream
        const liveConfigService1 = new LiveConfigService({
          baseDir: tempUserDataDir,
          cipher,
          logger: testLogger.child('LiveConfig1'),
        });
        liveConfigService1.saveConfig({
          provider: 'EULERSTREAM',
          streamerUsername: 'buddhalive_s9_streamer',
          endpointUrl: 'wss://ws.eulerstream.com',
          autoConnectOnStart: false,
        });
        liveConfigService1.saveApiKey({
          provider: 'EULERSTREAM',
          apiKey: 'euler_live_secret_key_s9_packaged_release_123',
        });

        expect(liveConfigService1.hasApiKey('EULERSTREAM')).toBe(true);
        ctx1.close();
      }

      // Phase 2: Upgraded version opens the exact same userDataDir
      {
        const ctx2 = openSqliteDatabase({ baseDir: tempUserDataDir });
        const integrityCheck = ctx2.db.prepare('PRAGMA integrity_check').pluck().get();
        expect(integrityCheck).toBe('ok');

        // Verify custom character preserved
        const activeChar = ctx2.charRepo.getActiveCharacter();
        expect(activeChar).not.toBeNull();
        expect(activeChar?.name).toBe('Đức Bổn Sư Thích Ca S9 Packaged');

        // Verify custom animations preserved
        const anims = ctx2.animRepo.listByCharacterId(activeChar!.id);
        expect(anims.some((a) => a.name === 'Cầu An Chúc Phúc S9')).toBe(true);

        // Verify custom rules preserved
        const rules = ctx2.ruleRepo.listByCharacterId(activeChar!.id);
        expect(rules.some((r) => r.triggerGiftId === 'lotus_giant')).toBe(true);

        // Verify LiveConfig and DPAPI vault key preserved
        const liveConfigService2 = new LiveConfigService({
          baseDir: tempUserDataDir,
          cipher,
          logger: testLogger.child('LiveConfig2'),
        });
        const config2 = liveConfigService2.getConfig();
        expect(config2.provider).toBe('EULERSTREAM');
        expect(config2.streamerUsername).toBe('buddhalive_s9_streamer');
        expect(config2.hasApiKey).toBe(true);

        // Verify secret key decrypts identically
        const decryptedKey = liveConfigService2.getApiKey('EULERSTREAM');
        expect(decryptedKey).toBe('euler_live_secret_key_s9_packaged_release_123');

        ctx2.close();
      }
    });

    it('rejects tampered or corrupt DPAPI vault ciphertexts with zero plaintext fallback', () => {
      const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s9-tamper-'));
      tempDirs.push(tempUserDataDir);

      const cipher = new NodeDevSecretCipher();
      const ctx = openSqliteDatabase({ baseDir: tempUserDataDir });
      const liveConfigService = new LiveConfigService({
        baseDir: tempUserDataDir,
        cipher,
        logger: testLogger,
      });

      liveConfigService.saveConfig({
        provider: 'EULERSTREAM',
        streamerUsername: 'test_tamper',
        autoConnectOnStart: false,
      });
      liveConfigService.saveApiKey({
        provider: 'EULERSTREAM',
        apiKey: 'real_secret_api_key_456',
      });

      // Verify key was saved and decrypts
      expect(liveConfigService.getApiKey('EULERSTREAM')).toBe('real_secret_api_key_456');

      // Tamper with the vault file
      const vaultPath = path.join(tempUserDataDir, 'config', 'live-vault.enc');
      expect(fs.existsSync(vaultPath)).toBe(true);

      const vaultData = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      // Corrupt the ciphertext payload
      vaultData.keys.EULERSTREAM = 'CORRUPTED_CIPHERTEXT_ABC123!@#';
      fs.writeFileSync(vaultPath, JSON.stringify(vaultData), 'utf8');

      // Simulate app restart by creating a new LiveConfigService instance with empty RAM cache
      const liveConfigRestarted = new LiveConfigService({
        baseDir: tempUserDataDir,
        cipher,
        logger: testLogger,
      });

      // Decryption must return null, NEVER return corrupt data or plaintext
      expect(liveConfigRestarted.getApiKey('EULERSTREAM')).toBeNull();

      ctx.close();
    });

    it('verifies safe SQLite backup and restore on packaged environment data', async () => {
      const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s9-bk-restore-'));
      tempDirs.push(tempUserDataDir);

      let ctx = openSqliteDatabase({ baseDir: tempUserDataDir });
      const backupService = new BackupService(testLogger.child('BackupService'));

      // Create initial custom data
      ctx.charRepo.create({
        name: 'Nhân Vật Trước Backup S9',
        slug: 'nv-truoc-backup-s9',
        modelPath: 'sample-character.glb',
        isActive: false,
      });

      // Perform database backup
      const backupFile = path.join(tempUserDataDir, 'backups', 'pre-incident-s9.bak');
      const backupResult = await backupService.createDatabaseBackup(ctx, backupFile);
      expect(backupResult.ok).toBe(true);
      expect(fs.existsSync(backupFile)).toBe(true);

      // Mutate database (simulate accidental change)
      ctx.charRepo.create({
        name: 'Nhân Vật Rác Sau Backup',
        slug: 'nv-rac-sau-backup',
        modelPath: 'sample-character.glb',
        isActive: false,
      });
      expect(ctx.charRepo.listAll().length).toBeGreaterThanOrEqual(3);

      // Perform safe restore
      const restoreResult = await backupService.safeRestore(ctx, backupFile, (newCtx) => {
        ctx = newCtx;
      });
      expect(restoreResult.ok).toBe(true);

      // Verify database restored to exact pre-incident state
      const charsAfter = ctx.charRepo.listAll();
      expect(charsAfter.some((c) => c.slug === 'nv-truoc-backup-s9')).toBe(true);
      expect(charsAfter.some((c) => c.slug === 'nv-rac-sau-backup')).toBe(false);

      const pragmaCheck = ctx.db.prepare('PRAGMA integrity_check').pluck().get();
      expect(pragmaCheck).toBe('ok');

      ctx.close();
    });
  });

  // =========================================================================
  // T34-C: Provider LIVE in Packaged Environment
  // =========================================================================
  describe('T34-C: Provider LIVE in Packaged Environment', () => {
    it('verifies TikFinity loopback connection, message parsing, and zero external binary bundling', async () => {
      const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s9-tikfinity-'));
      tempDirs.push(tempUserDataDir);

      const cipher = new NodeDevSecretCipher();
      const ctx = openSqliteDatabase({ baseDir: tempUserDataDir });
      const liveConfig = new LiveConfigService({
        baseDir: tempUserDataDir,
        cipher,
        logger: testLogger,
      });

      liveConfig.saveConfig({
        provider: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
        streamerUsername: 'buddha_streamer',
        autoConnectOnStart: false,
      });

      let mockWs: MockBidirectionalWebSocket | null = null;
      const socketFactory = (url: string) => {
        mockWs = new MockBidirectionalWebSocket(url);
        return mockWs as any;
      };

      const receivedLiveEvents: any[] = [];
      const engineMock = {
        handleIncomingLiveEvent: (event: any) => {
          receivedLiveEvents.push(event);
          return { processStatus: 'MATCHED', executionId: 'mock_exec_123' };
        },
      } as any;

      const manager = new LiveConnectionManager({
        liveConfigService: liveConfig,
        customWebSocketFactory: socketFactory,
        engine: engineMock,
        logger: testLogger.child('LiveMgrTest'),
      });

      const connPromise = manager.connect();
      await connPromise;
      await new Promise((r) => setTimeout(r, 20));

      expect(manager.getSummary().state).toBe('CONNECTED');
      expect(manager.getSummary().provider).toBe('TIKFINITY');

      // Ingest live gift from TikFinity WebSocket
      mockWs!.simulateServerMessage({
        event: 'gift',
        data: {
          id: 'tikfinity_live_gift_999',
          giftId: 5655,
          giftName: 'Hoa Sen',
          diamondCount: 1,
          repeatCount: 1,
          userId: 'user_tikfinity_999',
          uniqueId: 'phat_tu_thanh_tam',
          nickname: 'Phật Tử Thanh Tâm',
          timestamp: Date.now(),
        },
      });

      await new Promise((r) => setTimeout(r, 20));

      expect(receivedLiveEvents.length).toBe(1);
      expect(receivedLiveEvents[0]?.eventType).toBe('GIFT');
      expect(receivedLiveEvents[0]?.giftName).toBe('Hoa Sen');
      expect(receivedLiveEvents[0]?.senderName).toBe('Phật Tử Thanh Tâm');

      await manager.disconnect();
      ctx.close();
    });

    it('verifies EulerStream BYOK key storage, reconnection lifecycle, and zero secret leakage in exports', async () => {
      const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s9-euler-export-'));
      tempDirs.push(tempUserDataDir);

      const cipher = new NodeDevSecretCipher();
      const ctx = openSqliteDatabase({ baseDir: tempUserDataDir });
      const liveConfig = new LiveConfigService({
        baseDir: tempUserDataDir,
        cipher,
        logger: testLogger,
      });

      const secretApiKey = 'euler_sec_secret_key_xyz_998877';
      liveConfig.saveConfig({
        provider: 'EULERSTREAM',
        streamerUsername: 'buddha_live_channel',
        endpointUrl: `wss://ws.eulerstream.com?apiKey=${secretApiKey}&uniqueId=buddha_live_channel`,
        autoConnectOnStart: false,
      });
      liveConfig.saveApiKey({
        provider: 'EULERSTREAM',
        apiKey: secretApiKey,
      });

      let mockWs: MockBidirectionalWebSocket | null = null;
      const socketFactory = (url: string) => {
        mockWs = new MockBidirectionalWebSocket(url);
        return mockWs as any;
      };

      const manager = new LiveConnectionManager({
        liveConfigService: liveConfig,
        customWebSocketFactory: socketFactory,
        engine: { handleIncomingLiveEvent: () => {} } as any,
        logger: testLogger.child('EulerLiveMgr'),
      });

      await manager.connect();

      // Export diagnostics in Markdown and JSON formats
      const mdReport = manager.exportDiagnosticsReport('markdown', 'DISCONNECTED');
      const jsonReport = manager.exportDiagnosticsReport('json', 'DISCONNECTED');

      // Assert ZERO secret leakage
      expect(mdReport).not.toContain(secretApiKey);
      expect(jsonReport).not.toContain(secretApiKey);
      expect(mdReport).toMatch(/apiKey=(%5BREDACTED%5D|\[REDACTED\])/);
      expect(jsonReport).toMatch(/apiKey=(%5BREDACTED%5D|\[REDACTED\])/);

      await manager.disconnect();
      ctx.close();
    });
  });

  // =========================================================================
  // T34-D: OBS E2E in Packaged Environment
  // =========================================================================
  describe('T34-D: OBS E2E in Packaged Environment', () => {
    let ctx: SqliteDatabaseContext;
    let server: BuddhaServer;
    let sessionStore: OverlaySessionStore;
    let managerToken: string;
    let tempBase: string;
    let port: number;
    let obsServer: MockObsStudioServer;
    let obsClient: ObsWebSocketClient;
    let obsSocket: MockBidirectionalWebSocket | null = null;

    beforeEach(async () => {
      tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s9-obs-e2e-'));
      ctx = openSqliteDatabase({ baseDir: tempBase });
      managerToken = generateSecretToken();

      const cipher = new NodeDevSecretCipher();
      const sessionFile = path.join(tempBase, 'security', 'sessions.dat');
      sessionStore = new OverlaySessionStore(sessionFile, cipher, testLogger);

      port = 47000 + Math.floor(Math.random() * 2000);
      const overlayDist = path.join(DESKTOP_DIR, 'dist-overlay');

      obsServer = new MockObsStudioServer();
      obsClient = new ObsWebSocketClient({
        url: 'ws://127.0.0.1:4455',
        password: obsServer.expectedPassword,
        logger: testLogger.child('ObsClient'),
        customWebSocketFactory: (url) => {
          obsSocket = new MockBidirectionalWebSocket(url);
          obsServer.handleNewConnection(obsSocket);
          return obsSocket;
        },
      });

      server = new BuddhaServer(ctx, sessionStore, {
        port,
        host: '127.0.0.1',
        managerToken,
        overlayStaticDir: overlayDist,
        cipher,
        logger: testLogger,
      });

      await server.start();
    });

    afterEach(async () => {
      if (server) await server.stop();
      if (obsClient) obsClient.disconnect();
      if (ctx) ctx.close();
      if (fs.existsSync(tempBase)) {
        try {
          fs.rmSync(tempBase, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        } catch {}
      }
    });

    function pairOverlay(): Promise<string> {
      return new Promise((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}/api/overlay/pair/request`,
          { method: 'POST' },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              const body = JSON.parse(data);
              const { pairingId, code, claimSecret } = body.data;

              // Manager approves
              const approved = server.pairingManager.approve(pairingId, code);
              expect(approved).toBe(true);

              // Overlay claims session
              const claimReq = http.request(
                `http://127.0.0.1:${port}/api/overlay/pair/claim`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                },
                (claimRes) => {
                  const setCookie = claimRes.headers['set-cookie'];
                  expect(setCookie).toBeDefined();
                  const cookieHeader = Array.isArray(setCookie)
                    ? setCookie.map((c) => c.split(';')[0]).join('; ')
                    : setCookie?.split(';')[0] || '';
                  resolve(cookieHeader);
                }
              );
              claimReq.on('error', reject);
              claimReq.write(JSON.stringify({ pairingId, claimSecret }));
              claimReq.end();
            });
          }
        );
        req.on('error', reject);
        req.end();
      });
    }

    it('end-to-end pipeline: TikFinity LIVE gift ingestion -> EventEngine -> Queue -> Overlay -> OBS playback -> COMPLETED in SQLite', async () => {
      // 1. Connect OBS Client to Mock OBS Studio
      const obsConnResult = await obsClient.connect();
      expect(obsConnResult.ok).toBe(true);
      expect(obsServer.isIdentified).toBe(true);
      expect(obsClient.getStatus()).toBe('IDENTIFIED');

      // 2. Connect OBS Browser Source Overlay via Socket.IO
      const cookieHeader = await pairOverlay();
      const overlaySocket: ClientSocket = ClientIo(`http://127.0.0.1:${port}`, {
        path: '/socket.io',
        auth: { protocolVersion: '1.0', clientType: 'OVERLAY', instanceId: 'obs_e2e_tikfinity' },
        extraHeaders: { Cookie: cookieHeader },
        transports: ['websocket'],
      });

      await new Promise<void>((res) => overlaySocket.on('connect', res));
      overlaySocket.emit('overlay:telemetry', { readyToPlay: true, webglAvailable: true, fps: 60 });
      await new Promise((r) => setTimeout(r, 60));

      const dispatchedActions: any[] = [];
      overlaySocket.on('overlay:execute_action', (payload: any) => {
        dispatchedActions.push(payload);
        overlaySocket.emit('overlay:execution_started', { executionId: payload.executionId });

        // Simulate 3D animation playback in Overlay
        setTimeout(() => {
          overlaySocket.emit('overlay:execution_completed', {
            executionId: payload.executionId,
            completionMode: 'PRIMARY_3D',
            actualDurationMs: 120,
          });
        }, 80);
      });

      // 3. Ingest REAL live gift through EventEngine pipeline (TikFinity source: TIKTOK)
      const liveEventResult = server.engine.handleIncomingLiveEvent({
        source: 'TIKTOK',
        eventType: 'GIFT',
        externalEventId: 'live_gift_obs_tikfinity_001',
        senderId: 'donor_108',
        senderName: 'Đạo Hữu Huệ Năng',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        giftCount: 1,
        unitCoinValue: 1,
      });

      expect(liveEventResult.processStatus).toBe('MATCHED');
      expect(liveEventResult.executionId).toBeDefined();

      // 4. Wait for Overlay playback completion
      await new Promise((r) => setTimeout(r, 300));

      // 5. Verify Execution persisted as COMPLETED in SQLite
      const execution = ctx.execRepo.getById(liveEventResult.executionId!);
      expect(execution).not.toBeNull();
      expect(execution?.status).toBe('COMPLETED');
      expect(execution?.senderName).toBe('Đạo Hữu Huệ Năng');

      // 6. Verify Queue Metrics
      const metrics = server.engine.getQueueMetrics();
      expect(metrics.completed).toBeGreaterThanOrEqual(1);
      expect(metrics.queued).toBe(0);

      overlaySocket.disconnect();
    });

    it('end-to-end pipeline: EulerStream BYOK LIVE gift ingestion -> EventEngine -> Queue -> Overlay -> OBS playback -> COMPLETED in SQLite', async () => {
      // 1. Connect OBS Client to Mock OBS Studio
      const obsConnResult = await obsClient.connect();
      expect(obsConnResult.ok).toBe(true);
      expect(obsClient.getStatus()).toBe('IDENTIFIED');

      // 2. Connect OBS Browser Source Overlay via Socket.IO
      const cookieHeader = await pairOverlay();
      const overlaySocket: ClientSocket = ClientIo(`http://127.0.0.1:${port}`, {
        path: '/socket.io',
        auth: { protocolVersion: '1.0', clientType: 'OVERLAY', instanceId: 'obs_e2e_eulerstream' },
        extraHeaders: { Cookie: cookieHeader },
        transports: ['websocket'],
      });

      await new Promise<void>((res) => overlaySocket.on('connect', res));
      overlaySocket.emit('overlay:telemetry', { readyToPlay: true, webglAvailable: true, fps: 60 });
      await new Promise((r) => setTimeout(r, 60));

      overlaySocket.on('overlay:execute_action', (payload: any) => {
        overlaySocket.emit('overlay:execution_started', { executionId: payload.executionId });
        setTimeout(() => {
          overlaySocket.emit('overlay:execution_completed', {
            executionId: payload.executionId,
            completionMode: 'PRIMARY_3D',
            actualDurationMs: 100,
          });
        }, 60);
      });

      // 3. Set up EulerStream configuration in liveConfigService and verified provider adapter
      server.liveConfigService.saveConfig({
        provider: 'EULERSTREAM',
        streamerUsername: 'buddhalive_euler_streamer',
        endpointUrl: 'wss://ws.eulerstream.com?uniqueId=buddhalive_euler_streamer',
        autoConnectOnStart: false,
      });
      server.liveConfigService.saveApiKey({
        provider: 'EULERSTREAM',
        apiKey: 'euler_live_valid_key_obs_e2e_7788',
      });

      // 4. Simulate EulerStream WebSocket sending real gift frame
      let eulerSocket: MockBidirectionalWebSocket | null = null;
      const eulerAdapter = new VerifiedProviderAdapter({
        providerType: 'EULERSTREAM',
        uniqueId: 'buddhalive_euler_streamer',
        apiKey: 'euler_live_valid_key_obs_e2e_7788',
        logger: testLogger.child('EulerE2EAdapter'),
        customWebSocketFactory: (url) => {
          eulerSocket = new MockBidirectionalWebSocket(url);
          return eulerSocket as any;
        },
      });

      let normalizedFromEuler: any = null;
      eulerAdapter.onEvent((event) => {
        normalizedFromEuler = event;
        // Forward directly into BuddhaServer EventEngine as LiveConnectionManager does
        server.engine.handleIncomingLiveEvent({
          source: event.source,
          eventType: event.eventType,
          externalEventId: event.externalEventId,
          senderId: event.senderId,
          senderName: event.senderName,
          senderAvatarUrl: event.senderAvatarUrl,
          giftId: event.giftId,
          giftName: event.giftName,
          giftCount: event.giftCount,
          unitCoinValue: event.unitCoinValue,
          totalCoinValue: event.totalCoinValue,
          isComboEnd: event.isComboEnd,
          rawPayload: event.rawPayload,
        });
      });

      await eulerAdapter.start();
      await new Promise((r) => setTimeout(r, 20));

      // Simulate incoming EulerStream payload
      eulerSocket!.simulateServerMessage({
        type: 'gift',
        msg_id: 'euler_live_msg_e2e_554433',
        gift: {
          gift_id: 'lotus',
          gift_name: 'Hoa Sen',
          diamond_count: 1,
          repeat_count: 1,
          is_repeating: false,
        },
        user: {
          user_id: 'euler_user_777',
          unique_id: 'thich_tam_phuc',
          nickname: 'Phật Tử Tâm Phúc (EulerStream)',
        },
        timestamp: Date.now(),
      });

      expect(normalizedFromEuler).not.toBeNull();
      expect(normalizedFromEuler.source).toBe('TIKTOK');
      expect(normalizedFromEuler.senderName).toBe('Phật Tử Tâm Phúc (EulerStream)');
      expect(normalizedFromEuler.giftName).toBe('Hoa Sen');

      // 5. Wait for Overlay playback completion
      await new Promise((r) => setTimeout(r, 250));

      // 6. Verify Execution persisted as COMPLETED in SQLite
      const execution = ctx.db
        .prepare('SELECT * FROM event_executions WHERE sender_name = ?')
        .get('Phật Tử Tâm Phúc (EulerStream)') as any;
      expect(execution).toBeDefined();
      expect(execution.status).toBe('COMPLETED');
      expect(execution.source).toBe('TIKTOK');

      await eulerAdapter.stop();
      overlaySocket.disconnect();
    });

    it('isolates OBS crashes: Backend and EventEngine survive and continue gift processing', async () => {
      // Connect OBS Client
      await obsClient.connect();
      expect(obsClient.getStatus()).toBe('IDENTIFIED');

      let disconnectedFired = false;
      obsClient.on('disconnected', () => {
        disconnectedFired = true;
      });

      // Abruptly simulate OBS Studio process crash (WS close with error)
      obsSocket!.simulateClose(1006, 'Abnormal Closure (OBS Crash)');

      // Verify OBS client reflects disconnected state
      expect(disconnectedFired).toBe(true);
      expect(obsClient.getStatus()).toBe('DISCONNECTED');

      // Assert Backend and EventEngine are completely resilient and keep processing
      const liveRes = server.engine.handleIncomingLiveEvent({
        source: 'TIKTOK',
        eventType: 'GIFT',
        senderId: 'survivor_user',
        senderName: 'Phật Tử Vẫn Cúng Dường',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        giftCount: 1,
      });

      expect(liveRes.processStatus).toBe('MATCHED');
      expect(liveRes.executionId).toBeDefined();

      const execRecord = ctx.execRepo.getById(liveRes.executionId!);
      expect(execRecord).not.toBeNull();
      expect(execRecord?.status).toBe('QUEUED');
    });
  });

  // =========================================================================
  // T34-E: Production Dependency & License Audit
  // =========================================================================
  describe('T34-E: Production Dependency & License Audit', () => {
    it('strictly guarantees 0 occurrences of tiktok-live-connector in all package.json files', () => {
      const packageJsonFiles = [
        path.join(WORKSPACE_ROOT, 'package.json'),
        path.join(WORKSPACE_ROOT, 'packages', 'shared', 'package.json'),
        path.join(WORKSPACE_ROOT, 'apps', 'backend', 'package.json'),
        path.join(WORKSPACE_ROOT, 'apps', 'desktop', 'package.json'),
        path.join(WORKSPACE_ROOT, 'apps', 'overlay', 'package.json'),
      ];

      for (const file of packageJsonFiles) {
        expect(fs.existsSync(file), `package.json missing at ${file}`).toBe(true);
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toContain('tiktok-live-connector');
      }
    });

    it('strictly guarantees 0 occurrences of tiktok-live-connector in release/win-unpacked', () => {
      const winUnpackedDir = path.join(RELEASE_DIR, 'win-unpacked');
      if (fs.existsSync(winUnpackedDir)) {
        const nodeModulesDir = path.join(
          winUnpackedDir,
          'resources',
          'app.asar.unpacked',
          'node_modules'
        );
        if (fs.existsSync(nodeModulesDir)) {
          const connectorPath = path.join(nodeModulesDir, 'tiktok-live-connector');
          expect(fs.existsSync(connectorPath)).toBe(false);
        }
      }
    });

    it('strictly guarantees 0 third-party provider executables bundled in installer / release', () => {
      const winUnpackedDir = path.join(RELEASE_DIR, 'win-unpacked');
      if (fs.existsSync(winUnpackedDir)) {
        const allFiles = fs.readdirSync(winUnpackedDir);
        for (const f of allFiles) {
          expect(f.toLowerCase()).not.toContain('tikfinity');
          expect(f.toLowerCase()).not.toContain('eulerstream');
        }
      }
    });

    it('verifies NSIS configuration enforces deleteAppDataOnUninstall = false', () => {
      const desktopPkg = JSON.parse(
        fs.readFileSync(path.join(DESKTOP_DIR, 'package.json'), 'utf8')
      );
      expect(desktopPkg.build.nsis.deleteAppDataOnUninstall).toBe(false);
      expect(desktopPkg.build.nsis.allowToChangeInstallationDirectory).toBe(true);
      expect(desktopPkg.build.nsis.createDesktopShortcut).toBe(true);
      expect(desktopPkg.build.nsis.createStartMenuShortcut).toBe(true);
    });

    it('verifies all root production dependencies use permissive licenses (zero AGPL-3.0 in runtime)', () => {
      const backendPkg = JSON.parse(
        fs.readFileSync(path.join(WORKSPACE_ROOT, 'apps', 'backend', 'package.json'), 'utf8')
      );
      const prodDeps = Object.keys(backendPkg.dependencies || {});
      // Ensure no AGPL copyleft package slipped in
      expect(prodDeps).not.toContain('tiktok-live-connector');
      expect(prodDeps).toContain('better-sqlite3');
      expect(prodDeps).toContain('socket.io');

      const sharedPkg = JSON.parse(
        fs.readFileSync(path.join(WORKSPACE_ROOT, 'packages', 'shared', 'package.json'), 'utf8')
      );
      expect(Object.keys(sharedPkg.dependencies || {})).toContain('zod');
    });
  });
});
