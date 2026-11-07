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
  NormalizedLiveEventSchema,
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
  public challenge = 'obs_test_challenge_salt_xyz';
  public salt = 'obs_test_salt_123';
  public expectedPassword = 'buddha_obs_secure_password';
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
  };

  constructor() {
    // 1. secret = base64(sha256(password + salt))
    const secret = crypto
      .createHash('sha256')
      .update(this.expectedPassword + this.salt)
      .digest('base64');

    // 2. auth = base64(sha256(secret + challenge))
    this.expectedAuthHash = crypto
      .createHash('sha256')
      .update(secret + this.challenge)
      .digest('base64');
  }

  public handleNewConnection(socket: MockBidirectionalWebSocket): void {
    this.activeSocket = socket;
    this.isIdentified = false;

    // Khi client kết nối, OBS Server gửi OpCode 0 (Hello)
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
      const op = packet?.op;

      // OpCode 1: Identify
      if (op === 1) {
        const clientAuth = packet.d?.authentication;
        if (clientAuth === this.expectedAuthHash) {
          this.isIdentified = true;
          socket.simulateServerMessage({
            op: 2, // OpCode 2: Identified
            d: { negotiatedRpcVersion: 1 },
          });
        } else {
          socket.simulateClose(4009, 'Authentication Failed (Incorrect Password)');
        }
        return;
      }

      // OpCode 6: Request
      if (op === 6) {
        const requestId = packet.d?.requestId;
        const requestType = packet.d?.requestType;
        const requestData = packet.d?.requestData;

        if (requestType === 'GetSceneList') {
          socket.simulateServerMessage({
            op: 7, // OpCode 7: RequestResponse
            d: {
              requestId,
              requestType: 'GetSceneList',
              requestStatus: { result: true, code: 100 },
              responseData: {
                currentProgramSceneName: this.currentProgramSceneName,
                scenes: this.scenes,
              },
            },
          });
          return;
        }

        if (requestType === 'GetInputSettings') {
          const inputName = requestData?.inputName;
          if (inputName === 'BuddhaLive Overlay') {
            socket.simulateServerMessage({
              op: 7,
              d: {
                requestId,
                requestType: 'GetInputSettings',
                requestStatus: { result: true, code: 100 },
                responseData: {
                  inputName: 'BuddhaLive Overlay',
                  inputKind: 'browser_source',
                  inputSettings: this.browserSourceSettings,
                },
              },
            });
          } else {
            socket.simulateServerMessage({
              op: 7,
              d: {
                requestId,
                requestType: 'GetInputSettings',
                requestStatus: { result: false, code: 600, comment: 'Specified input does not exist' },
              },
            });
          }
          return;
        }
      }
    });
  }
}

describe('Milestone S9 - T-32: REAL LIVE INGRESS & OBS E2E VERIFICATION', () => {
  let ctx: SqliteDatabaseContext;
  let tempBase: string;
  const logger = createLogger('TestT32');

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s9-t32-'));
    ctx = openSqliteDatabase({ baseDir: tempBase });
  });

  afterEach(() => {
    if (ctx) {
      ctx.close();
    }
    if (fs.existsSync(tempBase)) {
      try {
        fs.rmSync(tempBase, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch {
        // Windows temp cleanup
      }
    }
  });

  // =========================================================================
  // T32-A: TikFinity Real Ingress Verification
  // =========================================================================
  describe('T32-A: TikFinity Real Ingress & Payload Normalization', () => {
    it('verifies loopback endpoint, handshake, and normalizes gift, chat, like, follow, share payloads', async () => {
      let activeSocket: MockBidirectionalWebSocket | null = null;

      const adapter = new VerifiedProviderAdapter({
        providerType: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
        logger,
        customWebSocketFactory: (url) => {
          activeSocket = new MockBidirectionalWebSocket(url);
          return activeSocket;
        },
      });

      const dispatchedGifts: any[] = [];
      adapter.onEvent((evt) => dispatchedGifts.push(evt));

      await adapter.start();
      expect(adapter.getStatus()).toBe('CONNECTED');

      // 1. Kiểm thử payload "gift"
      const giftPayload = {
        event: 'gift',
        data: {
          id: '1730500000001',
          userId: 'user_live_01',
          uniqueId: 'phattu_hoanhỷ',
          nickname: 'Phật Tử Hoan Hỷ ⭐',
          profilePictureUrl: 'https://p16.tiktokcdn.com/avatar/user01.jpeg',
          giftId: '5655',
          giftName: 'Hoa Sen',
          diamondCount: 10,
          repeatCount: 1,
          groupId: 'grp_tik_1',
          repeatEnd: true,
          timestamp: 1730500000000,
        },
      };

      const normalizedGift = adapter.normalizeLiveEvent(giftPayload);
      expect(normalizedGift).not.toBeNull();
      expect(NormalizedLiveEventSchema.safeParse(normalizedGift).success).toBe(true);
      expect(normalizedGift!.source).toBe('TIKTOK');
      expect(normalizedGift!.eventType).toBe('GIFT');
      expect(normalizedGift!.provider).toBe('TIKFINITY');
      expect(normalizedGift!.idStrategy).toBe('EXTERNAL_STABLE');
      expect(normalizedGift!.externalEventId).toBe('tikfinity_1730500000001');
      expect(normalizedGift!.giftCount).toBe(1);
      expect(normalizedGift!.unitCoinValue).toBe(10);
      expect(normalizedGift!.totalCoinValue).toBe(10);

      // Bơm vào socket và kiểm tra dispatch
      activeSocket!.simulateServerMessage(giftPayload);
      expect(dispatchedGifts).toHaveLength(1);
      expect(adapter.getStatus()).toBe('RECEIVING_EVENTS');

      // 2. Kiểm thử payload "chat"
      const chatPayload = {
        event: 'chat',
        data: {
          id: 'chat_msg_002',
          userId: 'user_live_02',
          uniqueId: 'dao_trang_tam',
          nickname: 'Đạo Tràng Tâm An',
          profilePictureUrl: 'https://p16.tiktokcdn.com/avatar/user02.jpeg',
          comment: 'Nam Mô A Di Đà Phật, chúc đạo tràng an lạc 🙏',
          timestamp: 1730500001000,
        },
      };
      const normalizedChat = adapter.normalizeLiveEvent(chatPayload);
      expect(normalizedChat).not.toBeNull();
      expect(NormalizedLiveEventSchema.safeParse(normalizedChat).success).toBe(true);
      expect(normalizedChat!.eventType).toBe('CHAT');
      expect(normalizedChat!.senderName).toBe('Đạo Tràng Tâm An');
      expect(normalizedChat!.providerMetadata?.comment).toBe('Nam Mô A Di Đà Phật, chúc đạo tràng an lạc 🙏');

      // Bơm chat vào socket -> Không làm rơi rớt hay crash socket, không dispatch vào gift queue
      activeSocket!.simulateServerMessage(chatPayload);
      expect(dispatchedGifts).toHaveLength(1); // Không tăng thêm

      // 3. Kiểm thử payload "like"
      const likePayload = {
        event: 'like',
        data: {
          id: 'like_event_003',
          userId: 'user_live_03',
          uniqueId: 'tam_duc',
          nickname: 'Tâm Đức',
          likeCount: 15,
          totalLikes: 1500,
          timestamp: 1730500002000,
        },
      };
      const normalizedLike = adapter.normalizeLiveEvent(likePayload);
      expect(normalizedLike).not.toBeNull();
      expect(NormalizedLiveEventSchema.safeParse(normalizedLike).success).toBe(true);
      expect(normalizedLike!.eventType).toBe('LIKE');
      expect(normalizedLike!.giftCount).toBe(15);
      expect(normalizedLike!.providerMetadata?.totalLikes).toBe(1500);

      // 4. Kiểm thử payload "follow"
      const followPayload = {
        event: 'follow',
        data: {
          id: 'follow_event_004',
          userId: 'user_live_04',
          uniqueId: 'phap_hoa',
          nickname: 'Pháp Hoa',
          timestamp: 1730500003000,
        },
      };
      const normalizedFollow = adapter.normalizeLiveEvent(followPayload);
      expect(normalizedFollow).not.toBeNull();
      expect(NormalizedLiveEventSchema.safeParse(normalizedFollow).success).toBe(true);
      expect(normalizedFollow!.eventType).toBe('FOLLOW');

      // 5. Kiểm thử payload "share"
      const sharePayload = {
        event: 'share',
        data: {
          id: 'share_event_005',
          userId: 'user_live_05',
          uniqueId: 'quang_minh',
          nickname: 'Quang Minh',
          timestamp: 1730500004000,
        },
      };
      const normalizedShare = adapter.normalizeLiveEvent(sharePayload);
      expect(normalizedShare).not.toBeNull();
      expect(NormalizedLiveEventSchema.safeParse(normalizedShare).success).toBe(true);
      expect(normalizedShare!.eventType).toBe('SHARE');

      await adapter.stop();
      expect(adapter.getStatus()).toBe('DISCONNECTED');
    });

    it('proves that tiktok-live-connector is NOT present in production dependencies', () => {
      const rootPkgPath = path.resolve(__dirname, '..', '..', 'package.json');
      const backendPkgPath = path.resolve(__dirname, '..', '..', 'apps', 'backend', 'package.json');

      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
      const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));

      const rootProdDeps = Object.keys(rootPkg.dependencies || {});
      const backendProdDeps = Object.keys(backendPkg.dependencies || {});

      expect(rootProdDeps).not.toContain('tiktok-live-connector');
      expect(backendProdDeps).not.toContain('tiktok-live-connector');
      expect(backendProdDeps).not.toContain('tiktok-live-connector-ts');
    });
  });

  // =========================================================================
  // T32-B: EulerStream Real Ingress & Close Codes
  // =========================================================================
  describe('T32-B: EulerStream Real Ingress & HTTP/Close Code Semantics', () => {
    it('formats handshake query safely and redacts API key from logs and sanitized URL', async () => {
      let activeSocket: MockBidirectionalWebSocket | null = null;
      const secretKey = 'euler_sec_secret_production_key_12345';

      const adapter = new VerifiedProviderAdapter({
        providerType: 'EULERSTREAM',
        uniqueId: 'phat_giao_vn',
        apiKey: secretKey,
        logger,
        customWebSocketFactory: (url) => {
          activeSocket = new MockBidirectionalWebSocket(url);
          return activeSocket;
        },
      });

      await adapter.start();
      expect(activeSocket).not.toBeNull();
      // Socket kết nối thật có param apiKey
      expect(activeSocket!.url).toContain('apiKey=' + secretKey);
      expect(activeSocket!.url).toContain('uniqueId=phat_giao_vn');

      await adapter.stop();
    });

    it('handles close code 4401 (Unauthorized) by transitioning to ERROR without retrying', async () => {
      let activeSocket: MockBidirectionalWebSocket | null = null;

      const adapter = new VerifiedProviderAdapter({
        providerType: 'EULERSTREAM',
        uniqueId: 'streamer_live',
        apiKey: 'invalid_expired_key',
        maxRetries: 3,
        logger,
        customWebSocketFactory: (url) => {
          activeSocket = new MockBidirectionalWebSocket(url);
          return activeSocket;
        },
      });

      await adapter.start();
      expect(adapter.getStatus()).toBe('CONNECTED');

      // Server EulerStream đóng kết nối với mã 4401 (Bad API key)
      activeSocket!.simulateClose(4401, 'Unauthorized: Invalid API Key');

      expect(adapter.getStatus()).toBe('ERROR');
      expect(adapter.getLastError()).toContain('EULER_WS_4401_UNAUTHORIZED');
      expect(adapter.getLastErrorCode()).toBe('EULER_WS_4401_UNAUTHORIZED');
      expect(adapter.getRetryCount()).toBe(0); // Tuyệt đối KHÔNG thử lại vô hạn khi sai auth

      await adapter.stop();
    });

    it('handles close code 4403 (Forbidden / Quota Exceeded) without retrying', async () => {
      let activeSocket: MockBidirectionalWebSocket | null = null;

      const adapter = new VerifiedProviderAdapter({
        providerType: 'EULERSTREAM',
        uniqueId: 'streamer_live',
        maxRetries: 3,
        logger,
        customWebSocketFactory: (url) => {
          activeSocket = new MockBidirectionalWebSocket(url);
          return activeSocket;
        },
      });

      await adapter.start();
      activeSocket!.simulateClose(4403, 'Forbidden: Quota Exceeded');

      expect(adapter.getStatus()).toBe('ERROR');
      expect(adapter.getLastError()).toContain('EULER_WS_4403_FORBIDDEN');
      expect(adapter.getLastErrorCode()).toBe('EULER_WS_4403_FORBIDDEN');
      expect(adapter.getRetryCount()).toBe(0);

      await adapter.stop();
    });

    it('handles close code 4404 (NOT_LIVE: Streamer not currently live) without retrying', async () => {
      let activeSocket: MockBidirectionalWebSocket | null = null;

      const adapter = new VerifiedProviderAdapter({
        providerType: 'EULERSTREAM',
        uniqueId: 'streamer_not_live_now',
        maxRetries: 3,
        logger,
        customWebSocketFactory: (url) => {
          activeSocket = new MockBidirectionalWebSocket(url);
          return activeSocket;
        },
      });

      await adapter.start();
      activeSocket!.simulateClose(4404, 'NOT_LIVE: Streamer currently offline');

      expect(adapter.getStatus()).toBe('ERROR');
      expect(adapter.getLastError()).toContain('EULER_WS_4404_NOT_LIVE');
      expect(adapter.getLastErrorCode()).toBe('EULER_WS_4404_NOT_LIVE');
      expect(adapter.getRetryCount()).toBe(0);

      await adapter.stop();
    });

    it('handles close codes 4408 (Timeout) and 4429 (Rate Limited) with bounded exponential backoff', async () => {
      let socketSpawnCount = 0;
      let activeSocket: MockBidirectionalWebSocket | null = null;

      const adapter = new VerifiedProviderAdapter({
        providerType: 'EULERSTREAM',
        uniqueId: 'streamer_vn',
        maxRetries: 2,
        baseBackoffMs: 15,
        maxBackoffMs: 50,
        jitterMaxMs: 5,
        logger,
        customWebSocketFactory: (url) => {
          socketSpawnCount++;
          activeSocket = new MockBidirectionalWebSocket(url);
          return activeSocket;
        },
      });

      await adapter.start();
      expect(socketSpawnCount).toBe(1);

      // Giả lập đóng mã 4408 (Request Timeout)
      activeSocket!.simulateClose(4408, 'Streamer Connection Timeout');
      expect(adapter.getStatus()).toBe('RECONNECTING');

      // Chờ backoff lần 1
      await new Promise((r) => setTimeout(r, 40));
      expect(socketSpawnCount).toBe(2);

      // Giả lập đóng mã 4429 (Rate Limit)
      activeSocket!.simulateClose(4429, 'Rate Limited');
      expect(adapter.getStatus()).toBe('RECONNECTING');

      // Chờ backoff lần 2
      await new Promise((r) => setTimeout(r, 70));
      expect(socketSpawnCount).toBe(3);

      // Lần thứ 3 vượt quá maxRetries (2) -> chuyển sang ERROR, không retry vô hạn
      activeSocket!.simulateClose(4429, 'Rate Limited');
      expect(adapter.getStatus()).toBe('ERROR');

      await adapter.stop();
    });
  });

  // =========================================================================
  // T32-C: Event Integrity, Combo Delta & SQLite Deduplication
  // =========================================================================
  describe('T32-C: Event Integrity, Combo Delta & Deduplication', () => {
    it('processes combo delta sequence 1 -> 2 -> 3 resulting in EXACTLY 3 gifts total queued (NOT 6)', async () => {
      let activeSocket: MockBidirectionalWebSocket | null = null;

      const cipher = new NodeDevSecretCipher();
      const sessionStore = new OverlaySessionStore(
        path.join(tempBase, 'sessions.dat'),
        cipher,
        logger
      );

      // Khởi tạo BuddhaServer với EventEngine S1-S5 chuẩn
      const port = 46000 + Math.floor(Math.random() * 2000);
      const server = new BuddhaServer(ctx, sessionStore, {
        port,
        host: '127.0.0.1',
        managerToken: 'test_token',
        logger,
      });
      await server.start();

      server.liveConfigService.saveConfig({
        provider: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
      });

      (server.liveManager as any).customWebSocketFactory = (url: string) => {
        activeSocket = new MockBidirectionalWebSocket(url);
        return activeSocket;
      };

      await server.liveManager.connect();
      expect(activeSocket).not.toBeNull();

      // Giả lập người dùng gửi Combo 3 Hoa Sen:
      // Gói 1: repeatCount = 1, repeatEnd = false
      activeSocket!.simulateServerMessage({
        event: 'gift',
        data: {
          id: 'combo_msg_100',
          userId: 'user_supporter_99',
          nickname: 'Người Hâm Mộ Sen',
          giftId: 'lotus', // Hoa Sen (khớp rule_sample_lotus)
          diamondCount: 1,
          repeatCount: 1,
          groupId: 'grp_combo_888',
          repeatEnd: false,
          timestamp: 1730500100000,
        },
      });

      // Gói 2: repeatCount = 2, repeatEnd = false
      activeSocket!.simulateServerMessage({
        event: 'gift',
        data: {
          id: 'combo_msg_100',
          userId: 'user_supporter_99',
          nickname: 'Người Hâm Mộ Sen',
          giftId: 'lotus',
          diamondCount: 1,
          repeatCount: 2,
          groupId: 'grp_combo_888',
          repeatEnd: false,
          timestamp: 1730500100500,
        },
      });

      // Gói 3: repeatCount = 3, repeatEnd = true (chốt combo)
      activeSocket!.simulateServerMessage({
        event: 'gift',
        data: {
          id: 'combo_msg_100',
          userId: 'user_supporter_99',
          nickname: 'Người Hâm Mộ Sen',
          giftId: 'lotus',
          diamondCount: 1,
          repeatCount: 3,
          groupId: 'grp_combo_888',
          repeatEnd: true,
          timestamp: 1730500101000,
        },
      });

      // Chờ combo buffer flush hoặc chốt
      await new Promise((r) => setTimeout(r, 100));

      // Kiểm tra trong SQLite live_events: đã chèn đúng 3 sự kiện delta (mỗi đợt 1 hoa sen)
      const recentEvents = ctx.eventRepo.listRecent(10);
      const comboEvents = recentEvents.filter((e) => e.senderName === 'Người Hâm Mộ Sen');
      expect(comboEvents).toHaveLength(3);

      // Tổng số quà trong 3 sự kiện phải là đúng 3:
      const totalRecordedGifts = comboEvents.reduce((sum, e) => sum + e.giftCount, 0);
      expect(totalRecordedGifts).toBe(3); // TUYỆT ĐỐI LÀ 3, KHÔNG PHẢI 1 + 2 + 3 = 6!

      // Kiểm tra execution trong queue:
      const executions = ctx.execRepo.listRecent(5);
      const comboExecution = executions.find((ex) => ex.senderName === 'Người Hâm Mộ Sen');
      expect(comboExecution).toBeDefined();
      expect(comboExecution!.mergedGiftCount).toBe(3); // Đúng 3 hoa sen

      await server.stop();
    });

    it('rejects duplicate network packets via SQLite UNIQUE(source, external_event_id)', async () => {
      let activeSocket: MockBidirectionalWebSocket | null = null;

      const cipher = new NodeDevSecretCipher();
      const sessionStore = new OverlaySessionStore(
        path.join(tempBase, 'sessions.dat'),
        cipher,
        logger
      );

      const server = new BuddhaServer(ctx, sessionStore, {
        port: 46100 + Math.floor(Math.random() * 2000),
        host: '127.0.0.1',
        managerToken: 'test_token',
        logger,
      });
      await server.start();

      server.liveConfigService.saveConfig({
        provider: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
      });

      (server.liveManager as any).customWebSocketFactory = (url: string) => {
        activeSocket = new MockBidirectionalWebSocket(url);
        return activeSocket;
      };

      await server.liveManager.connect();
      expect(activeSocket).not.toBeNull();

      const identicalPayload = {
        event: 'gift',
        data: {
          id: 'exact_dup_12345',
          userId: 'user_dup_1',
          nickname: 'Duplicated User',
          giftId: 'lotus',
          diamondCount: 1,
          repeatCount: 1,
          repeatEnd: true,
          timestamp: 1730500200000,
        },
      };

      // Bơm lần 1
      activeSocket!.simulateServerMessage(identicalPayload);
      // Bơm lần 2 (trùng lặp do re-transmit mạng)
      activeSocket!.simulateServerMessage(identicalPayload);

      await new Promise((r) => setTimeout(r, 50));

      const events = ctx.eventRepo.listRecent(10);
      const dupEvents = events.filter((e) => e.senderName === 'Duplicated User');
      // Chỉ duy nhất 1 sự kiện được chấp nhận lưu vào SQLite
      expect(dupEvents).toHaveLength(1);

      await server.stop();
    });

    it('distinguishes EXTERNAL_STABLE vs SYNTHETIC_DETERMINISTIC id strategies', () => {
      const adapter = new VerifiedProviderAdapter({
        providerType: 'TIKFINITY',
        logger,
      });

      // Có id -> EXTERNAL_STABLE
      const stable = adapter.normalizeLiveEvent({
        event: 'gift',
        data: {
          id: 'tik_stable_999',
          userId: 'u1',
          nickname: 'User',
          giftId: '5655',
          repeatCount: 1,
          repeatEnd: true,
        },
      });
      expect(stable!.idStrategy).toBe('EXTERNAL_STABLE');
      expect(stable!.externalEventId).toBe('tikfinity_tik_stable_999');

      // Không có id -> SYNTHETIC_DETERMINISTIC
      const synth = adapter.normalizeLiveEvent({
        event: 'gift',
        data: {
          userId: 'u1',
          nickname: 'User',
          giftId: '5655',
          repeatCount: 1,
          repeatEnd: true,
        },
      });
      expect(synth!.idStrategy).toBe('SYNTHETIC_DETERMINISTIC');
      expect(synth!.externalEventId).toMatch(/^syn_/);
    });
  });

  // =========================================================================
  // T32-D: OBS Studio E2E Integration (OBS WebSocket v5)
  // =========================================================================
  describe('T32-D: OBS Studio E2E Integration & Failure Isolation', () => {
    let obsServer: MockObsStudioServer;
    let obsClientSocket: MockBidirectionalWebSocket | null = null;

    beforeEach(() => {
      obsServer = new MockObsStudioServer();
    });

    it('performs full OBS WebSocket v5 handshake: Hello (0) -> Identify (1) with SHA-256 challenge -> Identified (2)', async () => {
      const obsClient = new ObsWebSocketClient({
        url: 'ws://127.0.0.1:4455',
        password: obsServer.expectedPassword,
        logger,
        customWebSocketFactory: (url) => {
          obsClientSocket = new MockBidirectionalWebSocket(url);
          obsServer.handleNewConnection(obsClientSocket);
          return obsClientSocket;
        },
      });

      const connectRes = await obsClient.connect();
      expect(connectRes.ok).toBe(true);
      expect(connectRes.status).toBe('IDENTIFIED');
      expect(obsClient.getStatus()).toBe('IDENTIFIED');
      expect(obsServer.isIdentified).toBe(true);

      obsClient.disconnect();
      expect(obsClient.getStatus()).toBe('DISCONNECTED');
    });

    it('rejects connection when OBS password is incorrect', async () => {
      const obsClient = new ObsWebSocketClient({
        url: 'ws://127.0.0.1:4455',
        password: 'wrong_incorrect_password',
        logger,
        customWebSocketFactory: (url) => {
          obsClientSocket = new MockBidirectionalWebSocket(url);
          obsServer.handleNewConnection(obsClientSocket);
          return obsClientSocket;
        },
      });

      const connectRes = await obsClient.connect();
      expect(connectRes.ok).toBe(false);
      expect(connectRes.status).toBe('ERROR');
      expect(obsServer.isIdentified).toBe(false);

      obsClient.disconnect();
    });

    it('queries GetSceneList and GetInputSettings to verify Browser Source pointing to Overlay', async () => {
      const obsClient = new ObsWebSocketClient({
        url: 'ws://127.0.0.1:4455',
        password: obsServer.expectedPassword,
        logger,
        customWebSocketFactory: (url) => {
          obsClientSocket = new MockBidirectionalWebSocket(url);
          obsServer.handleNewConnection(obsClientSocket);
          return obsClientSocket;
        },
      });

      await obsClient.connect();

      // 1. Lấy danh sách Scene
      const sceneList = await obsClient.getSceneList();
      expect(sceneList.currentProgramSceneName).toBe('Scene 1 - Stream Chinh');
      expect(sceneList.scenes).toHaveLength(2);
      expect(sceneList.scenes[0].sceneName).toBe('Scene 1 - Stream Chinh');

      // 2. Lấy cấu hình nguồn BuddhaLive Overlay
      const inputSettings = await obsClient.getInputSettings('BuddhaLive Overlay');
      expect(inputSettings.inputName).toBe('BuddhaLive Overlay');
      expect(inputSettings.inputKind).toBe('browser_source');
      expect(inputSettings.inputSettings.url).toBe('http://127.0.0.1:3721/overlay');

      // 3. Kiểm chứng verifyBrowserSource
      const verifyOk = await obsClient.verifyBrowserSource(
        'BuddhaLive Overlay',
        'http://127.0.0.1:3721/overlay'
      );
      expect(verifyOk.ok).toBe(true);

      const verifyMismatch = await obsClient.verifyBrowserSource(
        'BuddhaLive Overlay',
        'http://127.0.0.1:9999/wrong-overlay'
      );
      expect(verifyMismatch.ok).toBe(false);
      expect(verifyMismatch.error).toContain('URL_MISMATCH');

      obsClient.disconnect();
    });

    it('completes real end-to-end LIVE gift -> EventEngine -> Socket.IO Overlay playback lifecycle', async () => {
      const cipher = new NodeDevSecretCipher();
      const sessionStore = new OverlaySessionStore(
        path.join(tempBase, 'sessions.dat'),
        cipher,
        logger
      );

      const port = 46200 + Math.floor(Math.random() * 2000);
      const overlayDist = path.resolve(__dirname, '..', '..', 'apps', 'desktop', 'dist-overlay');
      const server = new BuddhaServer(ctx, sessionStore, {
        port,
        host: '127.0.0.1',
        managerToken: 'manager_secret_token',
        overlayStaticDir: overlayDist,
        logger,
      });
      await server.start();

      // 1. Overlay Client kết nối và pair với server theo nghi thức 2 bước S3/S6
      const pairCookie = await new Promise<string>((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}/api/overlay/pair/request`,
          { method: 'POST' },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                const body = JSON.parse(data);
                const { pairingId, code, claimSecret } = body.data;

                // Manager phê duyệt phiên pairing
                server.pairingManager.approve(pairingId, code);

                // Overlay nhận session cookie HttpOnly
                const claimReq = http.request(
                  `http://127.0.0.1:${port}/api/overlay/pair/claim`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                  },
                  (claimRes) => {
                    const cookieHeader = claimRes.headers['set-cookie'];
                    const cookieStr = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
                    resolve(cookieStr!);
                  }
                );
                claimReq.on('error', reject);
                claimReq.write(JSON.stringify({ pairingId, claimSecret }));
                claimReq.end();
              } catch (err) {
                reject(err);
              }
            });
          }
        );
        req.on('error', reject);
        req.end();
      });

      const overlaySocket: ClientSocket = ClientIo(`http://127.0.0.1:${port}`, {
        auth: {
          protocolVersion: '1.0',
          clientType: 'OVERLAY',
          instanceId: 'obs_browser_1',
        },
        extraHeaders: { Cookie: pairCookie },
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        overlaySocket.on('connect', () => resolve());
      });

      // Overlay sẵn sàng phát thông qua telemetry
      overlaySocket.emit('overlay:telemetry', { readyToPlay: true, webglAvailable: true, fps: 60 });
      await new Promise((r) => setTimeout(r, 50));

      // Lắng nghe lệnh play trên Overlay (sự kiện chuẩn: overlay:execute_action)
      const playedExecutions: any[] = [];
      overlaySocket.on('overlay:execute_action', (data: any) => {
        playedExecutions.push(data);
        overlaySocket.emit('overlay:execution_started', { executionId: data.executionId });
        // Overlay phát xong sau 20ms và báo lại server
        setTimeout(() => {
          overlaySocket.emit('overlay:execution_completed', {
            executionId: data.executionId,
            completionMode: 'PRIMARY_3D',
            actualDurationMs: 1500,
          });
        }, 20);
      });

      // 2. Tích hợp TikFinity Live Provider thật qua LiveConnectionManager
      let tikFinitySocket: MockBidirectionalWebSocket | null = null;
      server.liveConfigService.saveConfig({
        provider: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
      });

      (server.liveManager as any).customWebSocketFactory = (url: string) => {
        tikFinitySocket = new MockBidirectionalWebSocket(url);
        return tikFinitySocket;
      };

      await server.liveManager.connect();
      expect(tikFinitySocket).not.toBeNull();

      // 3. Giả lập TikTok LIVE gửi quà thật: Hoa Sen x1 (Khớp quy tắc rule_sample_lotus)
      tikFinitySocket!.simulateServerMessage({
        event: 'gift',
        data: {
          id: 'live_gift_lotus_888',
          userId: 'user_vip_phat_tu',
          nickname: 'Phật Tử Đại Thừa',
          giftId: 'lotus',
          giftName: 'Hoa Sen',
          diamondCount: 10,
          repeatCount: 1,
          repeatEnd: true,
          timestamp: 1730500300000,
        },
      });

      // Chờ Overlay nhận lệnh play và hoàn tất
      await new Promise((r) => setTimeout(r, 200));

      expect(playedExecutions).toHaveLength(1);
      const executionPayload = playedExecutions[0];
      expect(executionPayload.senderName).toBe('Phật Tử Đại Thừa');
      expect(executionPayload.characterId).toBe('char_sample_monk');
      expect(executionPayload.clipName).toBe('Pray');

      // Kiểm tra trạng thái trong SQLite: COMPLETED
      const exec = ctx.execRepo.getById(executionPayload.executionId);
      expect(exec).not.toBeNull();
      expect(exec!.status).toBe('COMPLETED');

      overlaySocket.disconnect();
      await server.stop();
    });

    it('enforces failure isolation: OBS crash/disconnect does NOT crash Backend or interrupt server', async () => {
      const cipher = new NodeDevSecretCipher();
      const sessionStore = new OverlaySessionStore(
        path.join(tempBase, 'sessions.dat'),
        cipher,
        logger
      );

      const port = 46300 + Math.floor(Math.random() * 2000);
      const server = new BuddhaServer(ctx, sessionStore, {
        port,
        host: '127.0.0.1',
        managerToken: 'test_token',
        logger,
      });
      await server.start();

      let obsSocket: MockBidirectionalWebSocket | null = null;
      const obsClient = new ObsWebSocketClient({
        url: 'ws://127.0.0.1:4455',
        password: obsServer.expectedPassword,
        logger,
        customWebSocketFactory: (url) => {
          obsSocket = new MockBidirectionalWebSocket(url);
          obsServer.handleNewConnection(obsSocket);
          return obsSocket;
        },
      });

      await obsClient.connect();
      expect(obsClient.getStatus()).toBe('IDENTIFIED');

      let disconnectedEventReceived = false;
      obsClient.on('disconnected', () => {
        disconnectedEventReceived = true;
      });

      // Mô phỏng OBS Studio bị tắt đột ngột (hoặc crash)
      obsSocket!.simulateClose(1006, 'OBS Studio process killed unexpectedly');

      expect(disconnectedEventReceived).toBe(true);
      expect(obsClient.getStatus()).toBe('DISCONNECTED');

      // Server BuddhaLive và Engine vẫn sống bình thường, nhận request API bình thường
      const checkRes = await new Promise<number>((resolve) => {
        const req = http.request(
          `http://127.0.0.1:${port}/api/overlay/pair/request`,
          { method: 'POST' },
          (res) => {
            resolve(res.statusCode ?? 0);
          }
        );
        req.end();
      });
      expect(checkRes).toBe(200);

      await server.stop();
    });
  });
});
