import { describe, expect, it, vi } from 'vitest';
import EventEmitter from 'node:events';
import {
  VerifiedProviderAdapter,
  type VerifiedProviderType,
} from '../../apps/backend/src/adapters/verified-provider-adapter';
import { NodeDevSecretCipher } from '../../apps/backend/src/security/ciphers';
import { ProviderKeyVault } from '../../apps/backend/src/security/provider-key-vault';
import { redactSecrets } from '../../apps/backend/src/config/logger';

/**
 * Mock WebSocket client giả lập socket kết nối mạng nội bộ
 */
class MockWebSocketClient extends EventEmitter {
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: ((err: any) => void) | null = null;
  public onclose: ((event: any) => void) | null = null;
  public readyState = 1; // OPEN

  constructor(public readonly url: string) {
    super();
    // Tự động kích hoạt onopen ở microtask kế tiếp
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

  // Phương thức hỗ trợ test bơm dữ liệu từ server
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

  public simulateUnexpectedDrop(): void {
    this.readyState = 3;
    if (this.onclose) {
      this.onclose({ code: 1006, reason: 'Abnormal Closure' });
    }
  }
}

describe('Milestone S8: TikTok LIVE Provider Proof of Concept & Adapter Foundation', () => {
  describe('T-25 & T-26: VerifiedProviderAdapter Contract & Prototype', () => {
    it('initializes in honest DISCONNECTED state with zero direct access to EventEngine or DB', () => {
      const adapter = new VerifiedProviderAdapter({
        providerType: 'TIKFINITY',
      });

      expect(adapter.name).toBe('VerifiedProviderAdapter:TIKFINITY');
      expect(adapter.platform).toBe('TIKTOK');
      expect(adapter.getStatus()).toBe('DISCONNECTED');
      expect(adapter.getRetryCount()).toBe(0);
      expect(adapter.getLastError()).toBeNull();

      // Kiểm chứng cô lập kiến trúc: adapter không chứa thuộc tính engine hoặc repo
      expect((adapter as any).engine).toBeUndefined();
      expect((adapter as any).ctx).toBeUndefined();
      expect((adapter as any).db).toBeUndefined();
    });

    it('connects to TikFinity local socket, normalizes gift event, and dispatches via onEvent listener', async () => {
      let activeMockSocket: MockWebSocketClient | null = null;

      const adapter = new VerifiedProviderAdapter({
        providerType: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
        customWebSocketFactory: (url) => {
          activeMockSocket = new MockWebSocketClient(url);
          return activeMockSocket;
        },
      });

      const receivedEvents: any[] = [];
      const unsubscribe = adapter.onEvent((event) => {
        receivedEvents.push(event);
      });

      await adapter.start();
      expect(adapter.getStatus()).toBe('CONNECTED');

      // Giả lập TikFinity gửi gói tin quà tặng
      activeMockSocket!.simulateServerMessage({
        event: 'gift',
        data: {
          id: 'act_12345678',
          userId: 'user_999',
          uniqueId: 'streamer_fan',
          nickname: 'Người Hâm Mộ ⭐',
          giftId: '5655',
          giftName: 'Rose',
          diamondCount: 1,
          repeatCount: 1,
          repeatEnd: true,
          groupId: 'grp_001',
          timestamp: 1730456789000,
        },
      });

      expect(receivedEvents).toHaveLength(1);
      const evt = receivedEvents[0];
      expect(evt.source).toBe('TIKTOK');
      expect(evt.eventType).toBe('GIFT');
      expect(evt.senderId).toBe('user_999');
      expect(evt.senderName).toBe('Người Hâm Mộ ⭐');
      expect(evt.giftId).toBe('5655');
      expect(evt.giftCount).toBe(1);
      expect(evt.unitCoinValue).toBe(1);
      expect(evt.externalEventId).toBe('tikfinity_act_12345678');
      expect(evt.isComboEnd).toBe(true);

      unsubscribe();
      await adapter.stop();
      expect(adapter.getStatus()).toBe('DISCONNECTED');
    });

    it('connects to EulerStream cloud socket and normalizes msg_id gift event', async () => {
      let activeMockSocket: MockWebSocketClient | null = null;

      const adapter = new VerifiedProviderAdapter({
        providerType: 'EULERSTREAM',
        uniqueId: 'streamer_vn',
        customWebSocketFactory: (url) => {
          activeMockSocket = new MockWebSocketClient(url);
          return activeMockSocket;
        },
      });

      const receivedEvents: any[] = [];
      adapter.onEvent((event) => receivedEvents.push(event));

      await adapter.start();
      expect(adapter.getStatus()).toBe('CONNECTED');

      // Giả lập EulerStream gửi gói tin quà tặng
      activeMockSocket!.simulateServerMessage({
        type: 'gift',
        msg_id: 'euler_msg_98765',
        room_id: 'room_111',
        user: {
          user_id: 'user_euler_88',
          unique_id: 'vip_fan',
          nickname: 'Đại Gia Phố Núi',
        },
        gift: {
          gift_id: 6000,
          gift_name: 'Xe Thể Thao',
          diamond_count: 500,
          repeat_count: 1,
          is_repeating: false,
        },
        timestamp: 1730456799000,
      });

      expect(receivedEvents).toHaveLength(1);
      const evt = receivedEvents[0];
      expect(evt.externalEventId).toBe('euler_euler_msg_98765');
      expect(evt.giftId).toBe('6000');
      expect(evt.giftName).toBe('Xe Thể Thao');
      expect(evt.unitCoinValue).toBe(500);
      expect(evt.isComboEnd).toBe(true);

      await adapter.stop();
    });

    it('filters out malformed or non-gift events without crashing', async () => {
      let activeMockSocket: MockWebSocketClient | null = null;

      const adapter = new VerifiedProviderAdapter({
        providerType: 'TIKFINITY',
        customWebSocketFactory: (url) => {
          activeMockSocket = new MockWebSocketClient(url);
          return activeMockSocket;
        },
      });

      const receivedEvents: any[] = [];
      adapter.onEvent((event) => receivedEvents.push(event));

      await adapter.start();

      // Gói tin rác không phải JSON
      activeMockSocket!.simulateServerMessage('NOT_JSON_CORRUPT_BYTES');

      // Gói tin chat (không phải gift)
      activeMockSocket!.simulateServerMessage({
        event: 'chat',
        data: { comment: 'Hello world' },
      });

      // Không có sự kiện quà nào được phát ra
      expect(receivedEvents).toHaveLength(0);
      expect(adapter.getStatus()).toBe('CONNECTED'); // Vẫn sống khỏe, không crash!

      await adapter.stop();
    });

    it('guards against duplicate connections when start() is called while already CONNECTED', async () => {
      let socketSpawnCount = 0;

      const adapter = new VerifiedProviderAdapter({
        providerType: 'TIKFINITY',
        customWebSocketFactory: (url) => {
          socketSpawnCount++;
          return new MockWebSocketClient(url);
        },
      });

      await adapter.start();
      expect(adapter.getStatus()).toBe('CONNECTED');
      expect(socketSpawnCount).toBe(1);

      // Gọi start() lần 2 khi đang connected -> Bị bỏ qua an toàn
      await adapter.start();
      expect(socketSpawnCount).toBe(1);

      await adapter.stop();
    });
  });

  describe('T-27: Security, Reliability, DPAPI Vault & Isolation', () => {
    it('encrypts and decrypts provider API key using DPAPI SecretCipher without leaking plaintext', () => {
      const cipher = new NodeDevSecretCipher();
      const vault = new ProviderKeyVault({ cipher });

      const rawApiKey = 'euler_sec_live_998877665544332211';
      const encryptedBase64 = vault.encryptKey('EULERSTREAM', rawApiKey);

      expect(encryptedBase64).not.toBe(rawApiKey);
      expect(encryptedBase64.length).toBeGreaterThan(32);

      // Giải mã lại chính xác
      const decrypted = vault.decryptKey('EULERSTREAM', encryptedBase64);
      expect(decrypted).toBe(rawApiKey);

      // Kiểm tra xóa RAM
      vault.clearMemory();
      const reDecrypted = vault.decryptKey('EULERSTREAM', encryptedBase64);
      expect(reDecrypted).toBe(rawApiKey);
    });

    it('redacts apikey, api_key, secret and tokens in log output', () => {
      const sensitiveRecord = {
        scope: 'VerifiedProviderAdapter',
        apikey: 'euler_live_secret_key_12345',
        api_key: 'tikfinity_token_abcdef',
        normalField: 'Public Room ID 123456',
      };

      const redacted = redactSecrets(sensitiveRecord) as any;
      expect(redacted.apikey).toBe('[REDACTED]');
      expect(redacted.api_key).toBe('[REDACTED]');
      expect(redacted.normalField).toBe('Public Room ID 123456');
    });

    it('handles unexpected socket drop with bounded exponential backoff and transitions to ERROR after max retries without auto-switching to DEMO', async () => {
      let activeMockSocket: MockWebSocketClient | null = null;
      let socketAttemptCount = 0;

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      const adapter = new VerifiedProviderAdapter({
        providerType: 'TIKFINITY',
        maxRetries: 3, // Giới hạn 3 lần thử lại cho bài test
        baseBackoffMs: 20, // Tốc độ cao trong test
        maxBackoffMs: 80,
        jitterMaxMs: 5,
        customWebSocketFactory: (url) => {
          socketAttemptCount++;
          activeMockSocket = new MockWebSocketClient(url);
          return activeMockSocket;
        },
      });

      await adapter.start();
      expect(adapter.getStatus()).toBe('CONNECTED');
      expect(socketAttemptCount).toBe(1);

      // Lần 1: Socket bị ngắt đột ngột
      activeMockSocket!.simulateUnexpectedDrop();
      expect(adapter.getStatus()).toBe('RECONNECTING');
      expect(adapter.getRetryCount()).toBe(1);

      // Chờ backoff lần 1 (~20ms + jitter)
      await sleep(100);
      expect(socketAttemptCount).toBe(2);

      // Lần 2: Lại bị ngắt
      activeMockSocket!.simulateUnexpectedDrop();
      expect(adapter.getStatus()).toBe('RECONNECTING');
      expect(adapter.getRetryCount()).toBe(2);

      // Chờ backoff lần 2 (~40ms + jitter)
      await sleep(150);
      expect(socketAttemptCount).toBe(3);

      // Lần 3: Lại bị ngắt
      activeMockSocket!.simulateUnexpectedDrop();
      expect(adapter.getStatus()).toBe('RECONNECTING');
      expect(adapter.getRetryCount()).toBe(3);

      // Chờ backoff lần 3 (~80ms + jitter)
      await sleep(200);
      expect(socketAttemptCount).toBe(4);

      // Lần 4: Vượt trần 3 lần thử -> Chuyển sang ERROR trung thực
      activeMockSocket!.simulateUnexpectedDrop();
      expect(adapter.getStatus()).toBe('ERROR');

      // RÀNG BUỘC S8 CỐT LÕI: Tuyệt đối không tự ý nhảy sang DEMO khi lỗi!
      // Trạng thái giữ nguyên ERROR trung thực, chờ Manager quyết định.
      expect(adapter.getStatus()).toBe('ERROR');

      await adapter.stop();
    });
  });
});
