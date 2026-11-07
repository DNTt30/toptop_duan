import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { io as ClientIo, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BuddhaServer,
  createLogger,
  generateSecretToken,
  LiveConnectionManager,
  NodeDevSecretCipher,
  ObsWebSocketClient,
  openSqliteDatabase,
  OverlaySessionStore,
  VerifiedProviderAdapter,
  type SqliteDatabaseContext,
} from '../../apps/backend/src';
import {
  LiveDiagnosticsReportSchema,
  NormalizedLiveEventSchema,
  type LiveDiagnosticsReport,
  type LiveEventTrace,
  type NormalizedLiveEvent,
} from '../../packages/shared/src';

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
      if (this.onopen && this.readyState === 1) this.onopen();
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
 * Mock OBS Studio v5 WebSocket Server
 */
class MockObsStudioServer {
  public challenge = 'obs_diag_challenge_123';
  public salt = 'obs_diag_salt_456';
  public expectedPassword = 'test_obs_password';
  public expectedAuthHash: string;
  public activeSocket: MockBidirectionalWebSocket | null = null;
  public isIdentified = false;

  constructor() {
    const secret = crypto
      .createHash('sha256')
      .update(this.expectedPassword + this.salt)
      .digest('base64');
    this.expectedAuthHash = crypto
      .createHash('sha256')
      .update(secret + this.challenge)
      .digest('base64');
  }

  public handleNewConnection(socket: MockBidirectionalWebSocket): void {
    this.activeSocket = socket;
    this.isIdentified = false;

    queueMicrotask(() => {
      socket.simulateServerMessage({
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

    socket.on('messageSent', (packet: any) => {
      if (packet?.op === 1) {
        if (packet.d?.authentication === this.expectedAuthHash) {
          this.isIdentified = true;
          socket.simulateServerMessage({
            op: 2,
            d: { negotiatedRpcVersion: 1 },
          });
        } else {
          socket.simulateClose(4009, 'Authentication failed');
        }
      }
    });
  }

  public crashServer(): void {
    if (this.activeSocket) {
      this.activeSocket.simulateClose(1006, 'OBS Studio process crashed or terminated unexpectedly');
      this.activeSocket = null;
      this.isIdentified = false;
    }
  }
}

describe('S9 - T-33: Live Connection Diagnostics, Observability & Resiliency', () => {
  let tmpDir: string;
  let ctx: SqliteDatabaseContext;
  let server: BuddhaServer;
  let sessionStore: OverlaySessionStore;
  let serverPort: number;
  let managerToken: string;
  let cipher: NodeDevSecretCipher;
  let managerSocket: ClientSocket | null = null;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buddha-s9-t33-'));
    ctx = openSqliteDatabase({ baseDir: tmpDir });
    cipher = new NodeDevSecretCipher();
    sessionStore = new OverlaySessionStore({
      storeFilePath: path.join(tmpDir, 'sessions.json'),
      cipher,
    });
    managerToken = generateSecretToken('mgr');

    serverPort = 37000 + Math.floor(Math.random() * 2000);
    server = new BuddhaServer(ctx, sessionStore, {
      port: serverPort,
      host: '127.0.0.1',
      managerToken,
      cipher,
      logger: createLogger('TestServer'),
    });

    await server.start();
  });

  afterEach(async () => {
    if (managerSocket) {
      managerSocket.disconnect();
      managerSocket = null;
    }
    await server.stop();
    ctx.db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /* -------------------------------------------------------------------------- */
  /* Nhóm 1: EulerStream Error Classification & Code Differentiation            */
  /* -------------------------------------------------------------------------- */
  describe('EulerStream Error Classification & Close Codes', () => {
    it('Case 4404: strictly classifies 4404 as EULER_WS_4404_NOT_LIVE, NOT "Not Found"', async () => {
      let createdSocket: MockBidirectionalWebSocket | null = null;
      const adapter = new VerifiedProviderAdapter({
        providerType: 'EULERSTREAM',
        endpointUrl: 'wss://ws.eulerstream.com',
        uniqueId: 'streamer_offline',
        apiKey: 'secret_test_key_euler',
        customWebSocketFactory: (url: string) => {
          createdSocket = new MockBidirectionalWebSocket(url);
          return createdSocket;
        },
      });

      let capturedError: string | null = null;
      let capturedCode: string | null = null;
      adapter.onStatusChange((status, err, code) => {
        if (status === 'ERROR') {
          capturedError = err ?? null;
          capturedCode = code ?? null;
        }
      });

      await adapter.start();
      expect(createdSocket).toBeDefined();

      // Giả lập EulerStream đóng với mã 4404 (kênh chưa phát LIVE)
      createdSocket!.simulateClose(4404, 'Channel not currently live');

      expect(adapter.getStatus()).toBe('ERROR');
      expect(capturedCode).toBe('EULER_WS_4404_NOT_LIVE');
      expect(capturedError).toContain('Kênh TikTok hiện chưa phát trực tiếp (LIVE / NOT_LIVE)');
      expect(capturedError).not.toContain('Not Found');
      expect(adapter.getLastErrorCode()).toBe('EULER_WS_4404_NOT_LIVE');

      await adapter.stop();
    });

    it('Case 4401 vs HTTP 401: clearly distinguishes WS 4401 from HTTP 401 handshake error', async () => {
      // 1. Kiểm tra WebSocket close code 4401
      let socketWs4401: MockBidirectionalWebSocket | null = null;
      const adapterWs = new VerifiedProviderAdapter({
        providerType: 'EULERSTREAM',
        endpointUrl: 'wss://ws.eulerstream.com',
        uniqueId: 'streamer_auth_fail',
        apiKey: 'wrong_key',
        customWebSocketFactory: (url: string) => {
          socketWs4401 = new MockBidirectionalWebSocket(url);
          return socketWs4401;
        },
      });

      await adapterWs.start();
      socketWs4401!.simulateClose(4401, 'Unauthorized API Key');

      expect(adapterWs.getStatus()).toBe('ERROR');
      expect(adapterWs.getLastErrorCode()).toBe('EULER_WS_4401_UNAUTHORIZED');
      expect(adapterWs.getLastError()).toContain('EULER_WS_4401_UNAUTHORIZED');
      // Không reconnect khi lỗi xác thực 4401
      expect(adapterWs.getRetryCount()).toBe(0);
      await adapterWs.stop();

      // 2. Kiểm tra HTTP 401 handshake error
      let socketHttp401: MockBidirectionalWebSocket | null = null;
      const adapterHttp = new VerifiedProviderAdapter({
        providerType: 'EULERSTREAM',
        endpointUrl: 'wss://ws.eulerstream.com',
        uniqueId: 'streamer_auth_fail',
        apiKey: 'wrong_key',
        customWebSocketFactory: (url: string) => {
          socketHttp401 = new MockBidirectionalWebSocket(url);
          return socketHttp401;
        },
      });

      await adapterHttp.start();
      socketHttp401!.simulateError('Unexpected server response: 401 Unauthorized');

      expect(adapterHttp.getStatus()).toBe('ERROR');
      expect(adapterHttp.getLastErrorCode()).toBe('HTTP_401_UNAUTHORIZED');
      expect(adapterHttp.getLastError()).toContain('HTTP_401_UNAUTHORIZED');
      expect(adapterHttp.getRetryCount()).toBe(0);
      await adapterHttp.stop();
    });

    it('handles EulerStream error codes 4403, 4408, 4429 with exact semantics', async () => {
      const testCases = [
        {
          code: 4403,
          expectedErrorCode: 'EULER_WS_4403_FORBIDDEN',
          expectedMessageSnippet: 'bị giới hạn gói cước',
        },
        {
          code: 4408,
          expectedErrorCode: 'EULER_WS_4408_TIMEOUT',
          expectedMessageSnippet: 'Hết thời gian chờ kết nối stream TikTok',
        },
        {
          code: 4429,
          expectedErrorCode: 'EULER_WS_4429_RATE_LIMITED',
          expectedMessageSnippet: 'vượt quá giới hạn yêu cầu EulerStream API',
        },
      ];

      for (const tc of testCases) {
        let sock: MockBidirectionalWebSocket | null = null;
        const adapter = new VerifiedProviderAdapter({
          providerType: 'EULERSTREAM',
          endpointUrl: 'wss://ws.eulerstream.com',
          uniqueId: 'streamer_test',
          apiKey: 'key_123',
          customWebSocketFactory: (url: string) => {
            sock = new MockBidirectionalWebSocket(url);
            return sock;
          },
        });

        await adapter.start();
        sock!.simulateClose(tc.code, `Code ${tc.code}`);

        expect(adapter.getLastErrorCode()).toBe(tc.expectedErrorCode);
        expect(adapter.getLastError()).toContain(tc.expectedMessageSnippet);
        await adapter.stop();
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Nhóm 2: T33-A Diagnostics & State History                                  */
  /* -------------------------------------------------------------------------- */
  describe('T33-A: Live Diagnostics & State History', () => {
    it('returns a comprehensive LiveDiagnosticsReport adhering strictly to schema', async () => {
      // Cấu hình TikFinity
      server.liveConfigService.saveConfig({
        provider: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
        streamerUsername: 'phat_tai_streamer',
        autoConnectOnStart: false,
        hasApiKey: false,
      });

      const diagnostics = server.liveManager.getDiagnostics('IDENTIFIED');

      // Kiểm chứng toàn bộ schema Zod
      expect(() => LiveDiagnosticsReportSchema.parse(diagnostics)).not.toThrow();

      expect(diagnostics.provider).toBe('TIKFINITY');
      expect(diagnostics.providerStatus).toBe('CONFIGURED');
      expect(diagnostics.obsStatus).toBe('IDENTIFIED');
      expect(diagnostics.streamerUsername).toBe('phat_tai_streamer');
      expect(diagnostics.endpointUrl).toMatch(/^ws:\/\/127\.0\.0\.1:21213\/?$/);
      expect(diagnostics.eventsReceived).toBe(0);
      expect(diagnostics.reconnectCount).toBe(0);
      expect(diagnostics.lastErrorCode).toBeNull();
      expect(diagnostics.systemHealth.sqliteWalActive).toBe(true);
      expect(diagnostics.systemHealth.overlayReadyCount).toBe(0);
      expect(diagnostics.systemHealth.activeCharacterId).toBe('char_sample_monk');
    });

    it('records connection transitions in connectionHistory capped at 50 items', async () => {
      server.liveConfigService.saveConfig({
        provider: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
        streamerUsername: 'stress_streamer',
        autoConnectOnStart: false,
        hasApiKey: false,
      });

      // Tạo 60 lần cập nhật trạng thái liên tục
      for (let i = 1; i <= 60; i++) {
        server.liveConfigService.updateConnectionState(
          i % 2 === 0 ? 'RECONNECTING' : 'CONNECTING',
          `Transition #${i}`,
          `CODE_${i}`
        );
      }

      const history = server.liveConfigService.getConnectionHistory();
      expect(history.length).toBe(50);
      // Mục đầu tiên là lần chuyển đổi gần nhất (#60)
      expect(history[0].reason).toBe('Transition #60');
      expect(history[0].errorCode).toBe('CODE_60');
      // Reconnect count tăng đúng 30 lần (các bước chẵn)
      expect(server.liveConfigService.getReconnectCount()).toBe(30);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Nhóm 3: T33-B Resiliency & Failure Isolation                               */
  /* -------------------------------------------------------------------------- */
  describe('T33-B: Resiliency & Failure Isolation', () => {
    it('isolates OBS crash completely: Backend and Live Provider continue uninterrupted', async () => {
      const obsMock = new MockObsStudioServer();
      const obsClient = new ObsWebSocketClient({
        url: 'ws://127.0.0.1:4455',
        password: 'test_obs_password',
        customWebSocketFactory: (url: string) => {
          const s = new MockBidirectionalWebSocket(url);
          obsMock.handleNewConnection(s);
          return s;
        },
      });

      await obsClient.connect();
      expect(obsClient.getStatus()).toBe('IDENTIFIED');
      server.setObsClient(obsClient);
      expect(server.getObsStatus()).toBe('IDENTIFIED');

      // Giả lập kết nối TikFinity thành công
      let tikfinitySocket: MockBidirectionalWebSocket | null = null;
      server.liveConfigService.saveConfig({
        provider: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
        streamerUsername: 'resilience_streamer',
        autoConnectOnStart: false,
        hasApiKey: false,
      });

      const customLiveManager = new LiveConnectionManager({
        liveConfigService: server.liveConfigService,
        engine: server.engine,
        ctx,
        getObsStatus: () => server.getObsStatus(),
        customWebSocketFactory: (url: string) => {
          tikfinitySocket = new MockBidirectionalWebSocket(url);
          return tikfinitySocket;
        },
      });

      await customLiveManager.connect();
      expect(customLiveManager.getStatus()).toBe('CONNECTED');

      // Hành động: OBS Studio bị crash đột ngột (OpCode 1006)
      obsMock.crashServer();

      // Kiểm chứng OBS chuyển sang ERROR / DISCONNECTED
      expect(['DISCONNECTED', 'ERROR']).toContain(obsClient.getStatus());
      expect(['DISCONNECTED', 'ERROR']).toContain(server.getObsStatus());

      // Failure Isolation: Live Manager và Live Provider vẫn hoạt động bình thường!
      expect(customLiveManager.getStatus()).toBe('CONNECTED');
      expect(customLiveManager.isLiveActive()).toBe(true);

      // Ingress vẫn tiếp nhận sự kiện quà tặng từ TikFinity dù OBS đã sập
      tikfinitySocket!.simulateServerMessage({
        event: 'gift',
        data: {
          id: 'gift_during_obs_down',
          name: 'Hoa Sen',
          giftCount: 5,
          user: { uniqueId: 'devotee_obs_down', nickname: 'Phật Tử 1' },
        },
      });

      expect(server.liveConfigService.getConnectionSummary().eventsReceived).toBe(1);

      await customLiveManager.destroy();
      await obsClient.disconnect();
    });

    it('performs clean shutdown and releases all sockets and timers upon disconnect/destroy', async () => {
      let createdSocket: MockBidirectionalWebSocket | null = null;
      const customLiveManager = new LiveConnectionManager({
        liveConfigService: server.liveConfigService,
        engine: server.engine,
        ctx,
        customWebSocketFactory: (url: string) => {
          createdSocket = new MockBidirectionalWebSocket(url);
          return createdSocket;
        },
      });

      server.liveConfigService.saveConfig({
        provider: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
        streamerUsername: 'cleanup_test',
        autoConnectOnStart: false,
        hasApiKey: false,
      });

      await customLiveManager.connect();
      expect(createdSocket).toBeDefined();
      expect(createdSocket!.readyState).toBe(1);

      // Ngắt kết nối
      const discResult = await customLiveManager.disconnect('Test graceful shutdown');
      expect(discResult.ok).toBe(true);
      expect(discResult.state).toBe('CONFIGURED');
      expect(createdSocket!.readyState).toBe(3); // Socket CLOSED

      // Gọi destroy lần nữa bảo đảm an toàn idempotent
      await expect(customLiveManager.destroy()).resolves.toBeUndefined();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Nhóm 4: T33-C Observability & Event Tracing                                */
  /* -------------------------------------------------------------------------- */
  describe('T33-C: Correlation ID & Live Event Tracing Pipeline', () => {
    it('generates correlation IDs and records pipeline steps INGRESS -> ENGINE -> QUEUE', async () => {
      let tikfinitySocket: MockBidirectionalWebSocket | null = null;
      server.liveConfigService.saveConfig({
        provider: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
        streamerUsername: 'trace_streamer',
        autoConnectOnStart: false,
        hasApiKey: false,
      });

      const customLiveManager = new LiveConnectionManager({
        liveConfigService: server.liveConfigService,
        engine: server.engine,
        ctx,
        customWebSocketFactory: (url: string) => {
          tikfinitySocket = new MockBidirectionalWebSocket(url);
          return tikfinitySocket;
        },
      });

      await customLiveManager.connect();

      // Gửi sự kiện quà tặng (khớp rule_sample_lotus)
      tikfinitySocket!.simulateServerMessage({
        event: 'gift',
        data: {
          id: 'gift_trace_test_001',
          giftId: 'lotus',
          giftName: 'Hoa Sen',
          diamondCount: 10,
          repeatCount: 1,
          repeatEnd: true,
          user: { uniqueId: 'trace_user', nickname: 'Thí Chủ Hảo Tâm' },
        },
      });

      const traces = customLiveManager.getRecentTraces();
      expect(traces.length).toBe(1);

      const t = traces[0];
      // Correlation ID phải có định dạng chuẩn cor_${timestamp}_${uuid8}
      expect(t.correlationId).toMatch(/^cor_\d+_[a-f0-9]{8}$/);
      expect(t.externalEventId).toBe('tikfinity_gift_trace_test_001');
      expect(t.senderName).toBe('Thí Chủ Hảo Tâm');
      expect(t.giftName).toBe('Hoa Sen');
      expect(t.giftCount).toBe(1);

      // Kiểm chứng các bước trong trace
      const stepNames = t.steps.map((s) => s.step);
      expect(stepNames).toContain('INGRESS');
      expect(stepNames).toContain('ENGINE');
      expect(stepNames).toContain('QUEUE');

      // Kiểm chứng recordTraceStep cho các giai đoạn tiếp theo (DISPATCH, OBS_PLAYBACK, PERSISTED)
      customLiveManager.recordTraceStep(t.correlationId, 'DISPATCH', { overlayInstance: 'obs_1' });
      customLiveManager.recordTraceStep(t.correlationId, 'OBS_PLAYBACK', { anim: 'anim_bell' });
      customLiveManager.recordTraceStep(t.correlationId, 'PERSISTED', { status: 'COMPLETED' }, 'COMPLETED');

      const updatedTraces = customLiveManager.getRecentTraces();
      expect(updatedTraces[0].status).toBe('COMPLETED');
      expect(updatedTraces[0].steps.map((s) => s.step)).toEqual([
        'INGRESS',
        'ENGINE',
        'QUEUE',
        'DISPATCH',
        'OBS_PLAYBACK',
        'PERSISTED',
      ]);

      await customLiveManager.destroy();
    });

    it('exports Diagnostics Report in Markdown and JSON with 100% secret redaction', async () => {
      // Cấu hình EulerStream với API key bí mật
      server.liveConfigService.saveConfig({
        provider: 'EULERSTREAM',
        endpointUrl: 'wss://ws.eulerstream.com?apiKey=raw_super_secret_token_12345&uniqueId=buddha_live',
        streamerUsername: 'buddha_live',
        autoConnectOnStart: false,
        hasApiKey: true,
      });

      server.liveConfigService.saveApiKey({
        provider: 'EULERSTREAM',
        apiKey: 'raw_super_secret_token_12345',
      });

      // 1. Xuất Markdown
      const mdReport = server.liveManager.exportDiagnosticsReport('markdown', 'IDENTIFIED');
      expect(mdReport).toContain('# BuddhaLive Studio - Live Connection Diagnostics Report');
      expect(mdReport).toContain('**Operating System:** Windows 11 Desktop (x64)');
      expect(mdReport).toContain('**Active Provider:** EULERSTREAM');
      expect(mdReport).toContain('**OBS WebSocket Status:** `IDENTIFIED`');

      // TUYỆT ĐỐI KHÔNG chứa secret raw trong Markdown
      expect(mdReport).not.toContain('raw_super_secret_token_12345');
      expect(mdReport).toMatch(/apiKey=(%5BREDACTED%5D|\[REDACTED\])/);

      // 2. Xuất JSON
      const jsonStr = server.liveManager.exportDiagnosticsReport('json', 'IDENTIFIED');
      const parsed = JSON.parse(jsonStr);
      expect(parsed.diagnostics).toBeDefined();
      expect(parsed.diagnostics.endpointUrl).toMatch(/apiKey=(%5BREDACTED%5D|\[REDACTED\])/);
      expect(jsonStr).not.toContain('raw_super_secret_token_12345');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Nhóm 5: T33-D Security Assertions & Protocol Integrity                     */
  /* -------------------------------------------------------------------------- */
  describe('T33-D: Security Assertions & DEMO/LIVE Isolation', () => {
    it('requires authenticated Manager handshake to request diagnostics over Socket.IO', async () => {
      // 1. Thử kết nối với Token SAI -> bị từ chối
      const badSocket = ClientIo(`http://127.0.0.1:${serverPort}`, {
        auth: {
          protocolVersion: '1.0',
          clientType: 'MANAGER',
          instanceId: 'inst_bad_manager',
          token: 'invalid_malicious_token_of_length_greater_than_32_characters',
        },
        reconnection: false,
        timeout: 2000,
      });

      const connectErrorPromise = new Promise<Error>((resolve) => {
        badSocket.on('connect_error', (err) => resolve(err));
      });
      const connectErr = await connectErrorPromise;
      expect(connectErr.message).toContain('UNAUTHORIZED');
      badSocket.disconnect();

      // 2. Kết nối với Token ĐÚNG -> thành công
      managerSocket = ClientIo(`http://127.0.0.1:${serverPort}`, {
        auth: {
          protocolVersion: '1.0',
          clientType: 'MANAGER',
          instanceId: 'inst_valid_manager',
          token: managerToken,
        },
        reconnection: false,
      });

      const connectSuccessPromise = new Promise<void>((resolve) => {
        managerSocket!.on('connect', () => resolve());
      });
      await connectSuccessPromise;

      // 3. Yêu cầu diagnostics qua socket event 'live:get_diagnostics'
      const diagResponse: any = await new Promise((resolve) => {
        managerSocket!.emit('live:get_diagnostics', {}, (res: any) => resolve(res));
      });

      expect(diagResponse.ok).toBe(true);
      expect(diagResponse.data.provider).toBeDefined();
      expect(diagResponse.data.systemHealth).toBeDefined();

      // 4. Yêu cầu export diagnostics qua socket event 'live:export_diagnostics'
      const exportResponse: any = await new Promise((resolve) => {
        managerSocket!.emit('live:export_diagnostics', { format: 'markdown' }, (res: any) =>
          resolve(res)
        );
      });

      expect(exportResponse.ok).toBe(true);
      expect(exportResponse.data.report).toContain('# BuddhaLive Studio');
      expect(exportResponse.data.format).toBe('markdown');
    });

    it('strictly enforces DEMO_BLOCKED_DURING_LIVE_SESSION when live connection is active', async () => {
      let mockSock: MockBidirectionalWebSocket | null = null;
      server.liveConfigService.saveConfig({
        provider: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
        streamerUsername: 'demo_block_streamer',
        autoConnectOnStart: false,
        hasApiKey: false,
      });

      const customLiveManager = new LiveConnectionManager({
        liveConfigService: server.liveConfigService,
        engine: server.engine,
        ctx,
        customWebSocketFactory: (url: string) => {
          mockSock = new MockBidirectionalWebSocket(url);
          return mockSock;
        },
      });

      await customLiveManager.connect();
      expect(customLiveManager.isLiveActive()).toBe(true);

      // Server gán server.liveManager bằng customLiveManager để kiểm tra logic chặn
      (server as any).liveManager = customLiveManager;

      // Giả lập gọi trigger demo gift qua Manager socket
      managerSocket = ClientIo(`http://127.0.0.1:${serverPort}`, {
        auth: {
          protocolVersion: '1.0',
          clientType: 'MANAGER',
          instanceId: 'inst_demo_block_mgr',
          token: managerToken,
        },
        reconnection: false,
      });
      await new Promise<void>((resolve) => managerSocket!.on('connect', () => resolve()));

      const demoTriggerRes: any = await new Promise((resolve) => {
        managerSocket!.emit(
          'demo:trigger_gift',
          { senderName: 'Hacker Simulating Demo', giftCount: 1 },
          (ack: any) => resolve(ack)
        );
      });

      expect(demoTriggerRes.ok).toBe(false);
      expect(demoTriggerRes.error.message).toContain('DEMO_BLOCKED_DURING_LIVE_SESSION');

      await customLiveManager.destroy();
    });
  });
});
