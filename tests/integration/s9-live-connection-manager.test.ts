import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BuddhaServer,
  createLogger,
  EventEngine,
  generateSecretToken,
  LiveConfigService,
  LiveConnectionManager,
  NodeDevSecretCipher,
  openSqliteDatabase,
  OverlaySessionStore,
  type SqliteDatabaseContext,
} from '../../apps/backend/src';
import { PROTOCOL_VERSION } from '../../packages/shared/src';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

/**
 * MockWebSocketClient giả lập socket cho TikFinity và EulerStream
 */
class MockWebSocketClient extends EventEmitter {
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: ((err: any) => void) | null = null;
  public onclose: ((event: any) => void) | null = null;
  public readyState = 1; // OPEN

  constructor(public readonly url: string) {
    super();
    queueMicrotask(() => {
      if (this.onopen) this.onopen();
    });
  }

  public send(data: string): void {
    this.emit('sent', data);
  }

  public close(): void {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose({ code: 1000, reason: 'Normal Closure' });
  }

  public simulateServerMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
  }

  public simulateServerError(errMsg: string): void {
    if (this.onerror) {
      this.onerror(new Error(errMsg));
    }
  }

  public simulateAbnormalDrop(code = 1006, reason = 'Abnormal Closure'): void {
    this.readyState = 3;
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }
}

describe('Milestone S9 - T-31: LiveConnectionManager & Real Backend LIVE Lifecycle', () => {
  let tempBase: string;
  let ctx: SqliteDatabaseContext;
  let cipher: NodeDevSecretCipher;
  let liveConfigService: LiveConfigService;
  let activeMockSocket: MockWebSocketClient | null = null;
  let socketSpawnCount = 0;

  const mockWsFactory = (url: string) => {
    socketSpawnCount++;
    activeMockSocket = new MockWebSocketClient(url);
    return activeMockSocket;
  };

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s9-mgr-'));
    ctx = openSqliteDatabase({ baseDir: tempBase });
    cipher = new NodeDevSecretCipher();
    liveConfigService = new LiveConfigService({
      baseDir: tempBase,
      cipher,
    });
    socketSpawnCount = 0;
    activeMockSocket = null;
  });

  afterEach(() => {
    ctx.close();
    if (fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  it('connects to TikFinity local loopback and ingests gift events into EventEngine queue', async () => {
    // 1. Lưu cấu hình TikFinity
    liveConfigService.saveConfig({
      provider: 'TIKFINITY',
      endpointUrl: 'ws://127.0.0.1:21213',
      streamerUsername: '@buddha_streamer',
      autoConnectOnStart: false,
      hasApiKey: false,
    });

    const engine = new EventEngine(
      ctx,
      {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      },
      createLogger('TestEngine')
    );

    const manager = new LiveConnectionManager({
      liveConfigService,
      engine,
      customWebSocketFactory: mockWsFactory,
    });

    expect(manager.getStatus()).toBe('CONFIGURED');
    expect(manager.isLiveActive()).toBe(false);

    // 2. Kết nối
    const connRes = await manager.connect();
    expect(connRes.ok).toBe(true);

    // Đợi microtask onopen
    await new Promise((r) => setTimeout(r, 20));
    expect(manager.getStatus()).toBe('CONNECTED');
    expect(manager.isLiveActive()).toBe(true);
    expect(socketSpawnCount).toBe(1);

    // 3. Giả lập TikFinity gửi gói tin quà tặng Hoa Sen
    activeMockSocket!.simulateServerMessage({
      event: 'gift',
      data: {
        id: 'gift_tikfinity_999111',
        userId: 'fan_123',
        nickname: 'Phật Tử Hoan Hỷ',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        diamondCount: 10,
        repeatCount: 2,
        repeatEnd: true,
        timestamp: Date.now(),
      },
    });

    // Chờ EventEngine xử lý
    await new Promise((r) => setTimeout(r, 50));

    // Xác nhận trạng thái chuyển sang RECEIVING_EVENTS
    expect(manager.getStatus()).toBe('RECEIVING_EVENTS');
    const summary = manager.getSummary();
    expect(summary.eventsReceived).toBe(1);
    expect(summary.lastEventAt).not.toBeNull();

    // Xác nhận EventEngine đã lưu vào bảng live_events của SQLite
    const recentLiveEvents = ctx.eventRepo.listRecent(5);
    expect(recentLiveEvents).toHaveLength(1);
    expect(recentLiveEvents[0]!.senderName).toBe('Phật Tử Hoan Hỷ');
    expect(recentLiveEvents[0]!.giftName).toBe('Hoa Sen');
    expect(recentLiveEvents[0]!.giftCount).toBe(2);
    expect(recentLiveEvents[0]!.source).toBe('TIKTOK');

    // 4. Ngắt kết nối
    const disconnRes = await manager.disconnect('Streamer ended session');
    expect(disconnRes.ok).toBe(true);
    expect(manager.getStatus()).toBe('CONFIGURED');
    expect(manager.isLiveActive()).toBe(false);

    await manager.destroy();
    engine.destroy();
  });

  it('guards against duplicate connect calls and does not spawn multiple WebSockets', async () => {
    liveConfigService.saveConfig({
      provider: 'TIKFINITY',
      endpointUrl: 'ws://127.0.0.1:21213',
      streamerUsername: '',
      autoConnectOnStart: false,
      hasApiKey: false,
    });

    const engine = new EventEngine(
      ctx,
      {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      },
      createLogger('TestEngine')
    );

    const manager = new LiveConnectionManager({
      liveConfigService,
      engine,
      customWebSocketFactory: mockWsFactory,
    });

    await manager.connect();
    await new Promise((r) => setTimeout(r, 20));
    expect(socketSpawnCount).toBe(1);
    expect(manager.getStatus()).toBe('CONNECTED');

    // Gọi connect lần 2 khi đã CONNECTED -> Bị chặn an toàn
    const dupRes = await manager.connect();
    expect(dupRes.ok).toBe(true);
    expect(socketSpawnCount).toBe(1); // Vẫn chỉ là 1 socket, không bị nhân đôi!

    await manager.destroy();
    engine.destroy();
  });

  it('guards against duplicate disconnect calls cleanly', async () => {
    liveConfigService.saveConfig({
      provider: 'TIKFINITY',
      endpointUrl: 'ws://127.0.0.1:21213',
      streamerUsername: '',
      autoConnectOnStart: false,
      hasApiKey: false,
    });

    const engine = new EventEngine(
      ctx,
      {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      },
      createLogger('TestEngine')
    );

    const manager = new LiveConnectionManager({
      liveConfigService,
      engine,
      customWebSocketFactory: mockWsFactory,
    });

    // Disconnect khi chưa connect
    const res1 = await manager.disconnect();
    expect(res1.ok).toBe(true);
    expect(manager.getStatus()).toBe('CONFIGURED');

    const res2 = await manager.disconnect();
    expect(res2.ok).toBe(true);
    expect(manager.getStatus()).toBe('CONFIGURED');

    await manager.destroy();
    engine.destroy();
  });

  it('connects to EulerStream using DPAPI decrypted key and redacts secrets in URL logs', async () => {
    // 1. Lưu config EulerStream & Key
    liveConfigService.saveConfig({
      provider: 'EULERSTREAM',
      endpointUrl: 'wss://ws.eulerstream.com',
      streamerUsername: '@buddha_channel',
      autoConnectOnStart: false,
      hasApiKey: false,
    });

    const rawApiKey = 'euler_live_super_secret_998877';
    liveConfigService.saveApiKey({
      provider: 'EULERSTREAM',
      apiKey: rawApiKey,
    });

    let connectedUrl = '';
    const customFactory = (url: string) => {
      connectedUrl = url;
      activeMockSocket = new MockWebSocketClient(url);
      return activeMockSocket;
    };

    const engine = new EventEngine(
      ctx,
      {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      },
      createLogger('TestEngine')
    );

    const manager = new LiveConnectionManager({
      liveConfigService,
      engine,
      customWebSocketFactory: customFactory,
    });

    await manager.connect();
    await new Promise((r) => setTimeout(r, 20));

    // URL kết nối chứa uniqueId và apiKey phục vụ bắt tay EulerStream
    expect(connectedUrl).toContain('uniqueId=buddha_channel');
    expect(connectedUrl).toContain(`apiKey=${rawApiKey}`);

    // Nhưng tóm tắt Summary trả về UI TUYỆT ĐỐI không chứa rawApiKey
    const summary = manager.getSummary();
    expect(JSON.stringify(summary)).not.toContain(rawApiKey);
    expect(summary.hasApiKey).toBe(true);

    await manager.destroy();
    engine.destroy();
  });

  it('fails safely and transitions to ERROR if EulerStream API Key is missing or DPAPI fails', async () => {
    // Lưu EulerStream config nhưng KHÔNG lưu API Key
    liveConfigService.saveConfig({
      provider: 'EULERSTREAM',
      endpointUrl: 'wss://ws.eulerstream.com',
      streamerUsername: '@buddha_channel',
      autoConnectOnStart: false,
      hasApiKey: false,
    });

    const engine = new EventEngine(
      ctx,
      {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      },
      createLogger('TestEngine')
    );

    const manager = new LiveConnectionManager({
      liveConfigService,
      engine,
      customWebSocketFactory: mockWsFactory,
    });

    const connRes = await manager.connect();
    expect(connRes.ok).toBe(false);
    expect(connRes.state).toBe('ERROR');
    expect(connRes.error).toContain('MISSING_API_KEY');
    expect(manager.getStatus()).toBe('ERROR');

    await manager.destroy();
    engine.destroy();
  });

  it('handles 401 Unauthorized from EulerStream and transitions to ERROR without crashing', async () => {
    liveConfigService.saveConfig({
      provider: 'EULERSTREAM',
      endpointUrl: 'wss://ws.eulerstream.com',
      streamerUsername: '@buddha_channel',
      autoConnectOnStart: false,
      hasApiKey: false,
    });
    liveConfigService.saveApiKey({
      provider: 'EULERSTREAM',
      apiKey: 'invalid_euler_key_123',
    });

    const engine = new EventEngine(
      ctx,
      {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      },
      createLogger('TestEngine')
    );

    const manager = new LiveConnectionManager({
      liveConfigService,
      engine,
      customWebSocketFactory: mockWsFactory,
    });

    await manager.connect();
    await new Promise((r) => setTimeout(r, 20));

    // EulerStream trả về mã đóng 4001 Unauthorized
    activeMockSocket!.simulateAbnormalDrop(4001, 'Unauthorized API Key');
    await new Promise((r) => setTimeout(r, 20));

    expect(manager.getStatus()).toBe('ERROR');
    expect(manager.getSummary().lastError).toContain('401 Unauthorized');

    await manager.destroy();
    engine.destroy();
  });

  it('handles abnormal drops, transitions to RECONNECTING, and does not crash Backend', async () => {
    liveConfigService.saveConfig({
      provider: 'TIKFINITY',
      endpointUrl: 'ws://127.0.0.1:21213',
      streamerUsername: '@buddha',
      autoConnectOnStart: false,
      hasApiKey: false,
    });

    const engine = new EventEngine(
      ctx,
      {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      },
      createLogger('TestEngine')
    );

    const manager = new LiveConnectionManager({
      liveConfigService,
      engine,
      customWebSocketFactory: mockWsFactory,
    });

    await manager.connect();
    await new Promise((r) => setTimeout(r, 20));
    expect(manager.getStatus()).toBe('CONNECTED');

    // Rớt mạng bất thường
    activeMockSocket!.simulateAbnormalDrop(1006, 'Connection reset by peer');
    await new Promise((r) => setTimeout(r, 20));

    // Trạng thái chuyển sang RECONNECTING
    expect(manager.getStatus()).toBe('RECONNECTING');

    await manager.destroy();
    engine.destroy();
  });

  it('BLOCKS fake Demo triggers in Backend during active LIVE session (DEMO_BLOCKED_DURING_LIVE_SESSION)', async () => {
    const sessionFile = path.join(ctx.paths.securityDir, 'overlay-sessions.dat');
    const sessionStore = new OverlaySessionStore(
      sessionFile,
      cipher,
      createLogger('TestOverlaySessions')
    );
    const managerToken = generateSecretToken();
    const TEST_PORT = 3795;

    // Cấu hình TikFinity
    liveConfigService.saveConfig({
      provider: 'TIKFINITY',
      endpointUrl: 'ws://127.0.0.1:21213',
      streamerUsername: '@buddha',
      autoConnectOnStart: false,
      hasApiKey: false,
    });

    const server = new BuddhaServer(ctx, sessionStore, {
      port: TEST_PORT,
      host: '127.0.0.1',
      managerToken,
      cipher,
      liveConfigService,
      customWebSocketFactory: mockWsFactory,
    });

    await server.start();

    // Kết nối Manager client qua Socket.IO
    const client = ioClient(`http://127.0.0.1:${TEST_PORT}`, {
      auth: {
        protocolVersion: PROTOCOL_VERSION,
        clientType: 'MANAGER',
        token: managerToken,
        instanceId: 'test_mgr_instance',
      },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => client.on('connect', resolve));

    // 1. Khi chưa kết nối LIVE (DISCONNECTED / CONFIGURED) -> Demo được phép hoạt động
    expect(server.liveManager.isLiveActive()).toBe(false);
    const demoBeforeLive = await new Promise<any>((resolve) => {
      client.emit('demo:trigger_gift', { senderName: 'Tester A', giftCount: 1 }, resolve);
    });
    expect(demoBeforeLive.ok).toBe(true);

    // 2. Kích hoạt phiên kết nối LIVE thực tế
    await server.liveManager.connect();
    await new Promise((r) => setTimeout(r, 20));
    expect(server.liveManager.isLiveActive()).toBe(true);

    // 3. THỬ PHÁT DEMO TRONG KHI ĐANG LIVE -> BỊ TỪ CHỐI 100%!
    const demoDuringLive = await new Promise<any>((resolve) => {
      client.emit('demo:trigger_gift', { senderName: 'Fake User', giftCount: 5 }, resolve);
    });
    expect(demoDuringLive.ok).toBe(false);
    expect(demoDuringLive.error.message).toContain('DEMO_BLOCKED_DURING_LIVE_SESSION');

    // Thử chạy Demo Scenario trong LIVE -> cũng BỊ TỪ CHỐI 100%!
    const scenarioDuringLive = await new Promise<any>((resolve) => {
      client.emit('demo:run_scenario', { scenario: 'VIP_INTERRUPT' }, resolve);
    });
    expect(scenarioDuringLive.ok).toBe(false);
    expect(scenarioDuringLive.error.message).toContain('DEMO_BLOCKED_DURING_LIVE_SESSION');

    // 4. Ngắt kết nối LIVE -> Demo lại được phép hoạt động
    await server.liveManager.disconnect('Finished live stream');
    expect(server.liveManager.isLiveActive()).toBe(false);

    const demoAfterDisconnect = await new Promise<any>((resolve) => {
      client.emit('demo:trigger_gift', { senderName: 'Tester B', giftCount: 1 }, resolve);
    });
    expect(demoAfterDisconnect.ok).toBe(true);

    client.disconnect();
    await server.stop();
  });
});
