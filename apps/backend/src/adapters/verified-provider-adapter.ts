import {
  NormalizedLiveEventSchema,
  type LiveProvider,
  type NormalizedLiveEvent,
} from '@buddhalive/shared';
import crypto from 'node:crypto';
import { createLogger, registerSecretForRedaction, type Logger } from '../config/logger';
import type {
  IncomingPlatformEvent,
  LivePlatformAdapter,
  PlatformAdapterStatus,
  PlatformEventListener,
} from './live-platform-adapter';

export type VerifiedProviderType = 'TIKFINITY' | 'EULERSTREAM';

export interface VerifiedProviderAdapterOptions {
  providerType: VerifiedProviderType;
  endpointUrl?: string; // Mặc định: ws://127.0.0.1:21213 cho TikFinity
  apiKey?: string;
  uniqueId?: string; // Tên streamer @uniqueId
  logger?: Logger;
  maxRetries?: number; // Mặc định 5
  baseBackoffMs?: number; // Mặc định 1000ms
  maxBackoffMs?: number; // Mặc định 30000ms
  jitterMaxMs?: number; // Mặc định 500ms
  // Cho phép inject WebSocket client trong unit/integration tests
  customWebSocketFactory?: (url: string) => any;
}

/**
 * Adapter nền tảng kết nối đến các Provider đã được xác minh (TikFinity hoặc EulerStream).
 * Tuân thủ nghiêm ngặt hợp đồng LivePlatformAdapter:
 * - KHÔNG truy cập trực tiếp vào EventEngine hoặc Repository CSDL.
 * - KHÔNG tự động chuyển sang chế độ DEMO khi rớt kết nối.
 * - Khử khuẩn và xác thực toàn bộ payload bằng NormalizedLiveEventSchema.
 * - Tự động kết nối lại (Exponential Backoff with Jitter) có chặn trần an toàn.
 */
export class VerifiedProviderAdapter implements LivePlatformAdapter {
  public readonly name: string;
  public readonly platform = 'TIKTOK' as const;
  public readonly providerType: VerifiedProviderType;

  private status: PlatformAdapterStatus = 'DISCONNECTED';
  private readonly logger: Logger;
  private readonly listeners = new Set<PlatformEventListener>();
  private readonly statusListeners = new Set<(status: PlatformAdapterStatus, error?: string | null, errorCode?: string | null) => void>();
  private readonly endpointUrl: string;
  private readonly apiKey?: string;
  private readonly uniqueId?: string;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly jitterMaxMs: number;
  private readonly customWebSocketFactory?: (url: string) => any;

  private socket: any = null;
  private retryCount = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stableConnectionTimer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;
  private lastErrorCode: string | null = null;
  private isExplicitlyStopped = false;
  private comboTracker = new Map<string, { lastRepeatCount: number; lastSeenAt: number }>();

  constructor(options: VerifiedProviderAdapterOptions) {
    this.providerType = options.providerType;
    this.name = `VerifiedProviderAdapter:${options.providerType}`;
    this.logger = options.logger ?? createLogger(this.name);
    this.apiKey = options.apiKey;
    this.uniqueId = options.uniqueId;
    this.maxRetries = options.maxRetries ?? 5;
    this.baseBackoffMs = options.baseBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30000;
    this.jitterMaxMs = options.jitterMaxMs ?? 500;
    this.customWebSocketFactory = options.customWebSocketFactory;

    if (options.apiKey) {
      registerSecretForRedaction(options.apiKey);
    }

    if (options.providerType === 'EULERSTREAM') {
      const base = options.endpointUrl || 'wss://ws.eulerstream.com';
      try {
        const parsed = new URL(base);
        if (options.uniqueId && !parsed.searchParams.has('uniqueId')) {
          parsed.searchParams.set('uniqueId', options.uniqueId.replace(/^@/, ''));
        }
        if (options.apiKey && !parsed.searchParams.has('apiKey')) {
          parsed.searchParams.set('apiKey', options.apiKey);
        }
        this.endpointUrl = parsed.toString();
      } catch {
        this.endpointUrl = base;
      }
    } else if (options.endpointUrl) {
      this.endpointUrl = options.endpointUrl;
    } else {
      this.endpointUrl = 'ws://127.0.0.1:21213';
    }
  }

  public getStatus(): PlatformAdapterStatus {
    return this.status;
  }

  public getRetryCount(): number {
    return this.retryCount;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public getLastErrorCode(): string | null {
    return this.lastErrorCode;
  }

  public onStatusChange(
    listener: (status: PlatformAdapterStatus, error?: string | null, errorCode?: string | null) => void
  ): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(newStatus: PlatformAdapterStatus, error?: string | null, errorCode?: string | null): void {
    this.status = newStatus;
    if (error !== undefined) {
      this.lastError = error;
    }
    if (errorCode !== undefined) {
      this.lastErrorCode = errorCode;
    }
    if (newStatus === 'CONNECTED') {
      this.lastErrorCode = null;
    }
    for (const listener of this.statusListeners) {
      try {
        listener(newStatus, this.lastError, this.lastErrorCode);
      } catch (err) {
        this.logger.error('Error in status change listener', { error: (err as Error).message });
      }
    }
  }

  private sanitizeUrl(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      if (parsed.searchParams.has('apiKey')) {
        parsed.searchParams.set('apiKey', '[REDACTED]');
      }
      return parsed.toString();
    } catch {
      return urlStr;
    }
  }

  /**
   * Bắt đầu kết nối tới Provider.
   * Chống mở trùng lặp kết nối nếu đang CONNECTING hoặc CONNECTED.
   */
  public async start(): Promise<void> {
    if (this.status === 'CONNECTED' || this.status === 'CONNECTING') {
      this.logger.warn(`Connection already in state ${this.status}, ignoring duplicate start() call`);
      return;
    }

    this.isExplicitlyStopped = false;
    this.retryCount = 0;
    this.lastError = null;
    this.connect();
  }

  /**
   * Dừng kết nối chủ động bởi streamer / manager.
   */
  public async stop(): Promise<void> {
    this.isExplicitlyStopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stableConnectionTimer) {
      clearTimeout(this.stableConnectionTimer);
      this.stableConnectionTimer = null;
    }

    if (this.socket) {
      try {
        if (typeof this.socket.close === 'function') {
          this.socket.close();
        }
      } catch (err) {
        this.logger.warn('Error while closing socket', { error: (err as Error).message });
      }
      this.socket = null;
    }

    this.setStatus('DISCONNECTED');
    this.comboTracker.clear();
    this.logger.info(`Stopped ${this.name} connection`);
  }

  public onEvent(listener: PlatformEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Thiết lập kết nối Socket nội bộ
   */
  private connect(): void {
    if (this.isExplicitlyStopped) return;

    this.setStatus('CONNECTING');
    this.logger.info(`Connecting to ${this.providerType} at ${this.sanitizeUrl(this.endpointUrl)}`);

    try {
      if (this.customWebSocketFactory) {
        this.socket = this.customWebSocketFactory(this.endpointUrl);
      } else if (typeof globalThis.WebSocket !== 'undefined') {
        this.socket = new globalThis.WebSocket(this.endpointUrl);
      } else {
        throw new Error('No WebSocket implementation available in environment');
      }

      this.setupSocketHandlers();
    } catch (err) {
      this.handleSocketError((err as Error).message);
    }
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      this.setStatus('CONNECTED', null);
      this.logger.info(`Successfully connected to ${this.providerType}`);
      // Chỉ reset retryCount sau khi duy trì kết nối ổn định ít nhất 3000ms (chống flapping)
      if (this.stableConnectionTimer) {
        clearTimeout(this.stableConnectionTimer);
      }
      this.stableConnectionTimer = setTimeout(() => {
        this.retryCount = 0;
        this.stableConnectionTimer = null;
      }, 3000);
    };

    this.socket.onmessage = (event: { data: string }) => {
      this.handleIncomingRawMessage(event.data);
    };

    this.socket.onerror = (err: any) => {
      const errMsg = err?.message || 'WebSocket encountered network error';
      this.handleSocketError(errMsg);
    };

    this.socket.onclose = (event: any) => {
      if (this.isExplicitlyStopped) {
        this.setStatus('DISCONNECTED');
        return;
      }
      this.logger.warn(`Connection to ${this.providerType} closed unexpectedly`, {
        code: event?.code,
        reason: event?.reason,
      });

      const code = Number(event?.code);

      // 4401 / 4001: WebSocket Unauthorized (Bad API key / expired token)
      if (code === 4401 || code === 4001) {
        this.setStatus(
          'ERROR',
          'EULER_WS_4401_UNAUTHORIZED: 4401 Unauthorized: API Key EulerStream không hợp lệ hoặc đã hết hạn',
          'EULER_WS_4401_UNAUTHORIZED'
        );
        return;
      }

      // 4403: Forbidden (Quota / plan exceeded)
      if (code === 4403 || code === 403) {
        this.setStatus(
          'ERROR',
          'EULER_WS_4403_FORBIDDEN: 4403 Forbidden: Tài khoản EulerStream đã vượt quá hạn mức hoặc bị giới hạn gói cước',
          'EULER_WS_4403_FORBIDDEN'
        );
        return;
      }

      // 4404: NOT_LIVE (Streamer not currently live) - RÀNG BUỘC T-33: 4404 = NOT_LIVE
      if (code === 4404 || code === 404) {
        this.setStatus(
          'ERROR',
          'EULER_WS_4404_NOT_LIVE: Kênh TikTok hiện chưa phát trực tiếp (LIVE / NOT_LIVE) hoặc phòng livestream đã kết thúc',
          'EULER_WS_4404_NOT_LIVE'
        );
        return;
      }

      // 4408: Request Timeout (Streamer connection timeout) -> reconnect có backoff
      if (code === 4408) {
        this.lastErrorCode = 'EULER_WS_4408_TIMEOUT';
        this.lastError = 'EULER_WS_4408_TIMEOUT: Hết thời gian chờ kết nối stream TikTok (Stream Timeout)';
        this.logger.warn('EulerStream closed with 4408 Request Timeout (EULER_WS_4408_TIMEOUT); scheduling reconnect...');
      }

      // 4429: Too Many Requests (Rate limited) -> reconnect có backoff
      if (code === 4429) {
        this.lastErrorCode = 'EULER_WS_4429_RATE_LIMITED';
        this.lastError = 'EULER_WS_4429_RATE_LIMITED: Đã vượt quá giới hạn yêu cầu EulerStream API (Rate Limit)';
        this.logger.warn('EulerStream closed with 4429 Rate Limited (EULER_WS_4429_RATE_LIMITED); scheduling reconnect...');
      }

      this.scheduleReconnect();
    };
  }

  private handleSocketError(errorMessage: string): void {
    this.lastError = errorMessage;
    this.logger.error(`Error in ${this.name}: ${errorMessage}`);

    // Phân biệt WebSocket 4401 với HTTP 401 Handshake
    if (errorMessage.includes('4401')) {
      this.setStatus(
        'ERROR',
        'EULER_WS_4401_UNAUTHORIZED: 4401 Unauthorized: API Key không hợp lệ hoặc đã hết hạn',
        'EULER_WS_4401_UNAUTHORIZED'
      );
      return;
    }
    if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
      this.setStatus(
        'ERROR',
        'HTTP_401_UNAUTHORIZED: Xác thực HTTP Handshake thất bại (401 Unauthorized)',
        'HTTP_401_UNAUTHORIZED'
      );
      return;
    }
    if (errorMessage.includes('4403') || errorMessage.toLowerCase().includes('forbidden')) {
      this.setStatus(
        'ERROR',
        'EULER_WS_4403_FORBIDDEN: 4403 Forbidden: Tài khoản đã vượt quá hạn mức',
        'EULER_WS_4403_FORBIDDEN'
      );
      return;
    }
    if (
      errorMessage.includes('4404') ||
      errorMessage.toLowerCase().includes('not live') ||
      errorMessage.toLowerCase().includes('not_live') ||
      errorMessage.toLowerCase().includes('offline')
    ) {
      this.setStatus(
        'ERROR',
        'EULER_WS_4404_NOT_LIVE: Kênh TikTok hiện chưa phát trực tiếp (LIVE / NOT_LIVE)',
        'EULER_WS_4404_NOT_LIVE'
      );
      return;
    }
    this.scheduleReconnect();
  }

  /**
   * Lên lịch tự động kết nối lại theo thuật toán Exponential Backoff có Jitter
   */
  private scheduleReconnect(): void {
    if (this.isExplicitlyStopped) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stableConnectionTimer) {
      clearTimeout(this.stableConnectionTimer);
      this.stableConnectionTimer = null;
    }

    if (this.retryCount >= this.maxRetries) {
      const maxErr = `Max reconnect attempts (${this.maxRetries}) exceeded for ${this.providerType}`;
      this.setStatus('ERROR', maxErr, 'MAX_RETRY_EXCEEDED');
      this.logger.error(`${maxErr}. Transitioning to ERROR state.`);
      // RÀNG BUỘC S8/S9: TUYỆT ĐỐI KHÔNG TỰ ĐỘNG CHUYỂN SANG DEMO KHI LỖI KẾT NỐI!
      return;
    }

    this.setStatus('RECONNECTING');
    const exp = Math.min(
      this.maxBackoffMs,
      this.baseBackoffMs * Math.pow(2, this.retryCount)
    );
    const jitter = this.jitterMaxMs > 0 ? Math.floor(Math.random() * this.jitterMaxMs) : 0;
    const delayMs = exp + jitter;
    this.retryCount++;

    this.logger.info(
      `Scheduling reconnect attempt ${this.retryCount}/${this.maxRetries} in ${delayMs}ms`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  /**
   * Xử lý gói tin thô nhận từ Provider, xác thực và chuẩn hóa
   */
  public handleIncomingRawMessage(rawData: string): void {
    let parsed: any;
    try {
      parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    } catch {
      this.logger.warn('Failed to parse incoming WebSocket message as JSON');
      return;
    }

    const normalized = this.parseAndNormalize(parsed);
    if (!normalized) {
      return; // Không phải sự kiện hợp lệ hoặc không phải sự kiện quà tặng được hỗ trợ
    }

    // Xác thực bằng Zod schema
    const validation = NormalizedLiveEventSchema.safeParse(normalized);
    if (!validation.success) {
      this.logger.warn('Incoming event failed NormalizedLiveEvent validation', {
        errors: validation.error.format(),
      });
      return;
    }

    const validEvent = validation.data;

    // Chỉ phát sự kiện GIFT tới platform listeners phục vụ Engine/Overlay
    if (validEvent.eventType !== 'GIFT') {
      return;
    }

    // Chuyển sang trạng thái RECEIVING_EVENTS khi nhận sự kiện quà tặng hợp lệ đầu tiên
    if (this.status === 'CONNECTED') {
      this.setStatus('RECEIVING_EVENTS');
    }

    // Chuyển đổi thành IncomingPlatformEvent để phát qua LivePlatformAdapter
    const platformEvent: IncomingPlatformEvent = {
      source: 'TIKTOK',
      eventType: validEvent.eventType,
      senderId: validEvent.senderId,
      senderName: validEvent.senderName,
      senderAvatarUrl: validEvent.senderAvatarUrl,
      giftId: validEvent.giftId,
      giftName: validEvent.giftName,
      giftCount: validEvent.giftCount,
      unitCoinValue: validEvent.unitCoinValue,
      comboGroupId: validEvent.comboGroupId,
      isComboEnd: validEvent.isComboEnd,
      externalEventId: validEvent.externalEventId,
      rawPayloadJson: JSON.stringify(validEvent.rawPayload),
    };

    // Phát sự kiện đến tất cả các listeners đã đăng ký
    for (const listener of this.listeners) {
      try {
        listener(platformEvent);
      } catch (err) {
        this.logger.error('Error invoking platform event listener', {
          error: (err as Error).message,
        });
      }
    }
  }

  /**
   * Phương thức công khai phục vụ kiểm thử và chuẩn hóa sự kiện độc lập
   */
  public normalizeLiveEvent(payload: any): NormalizedLiveEvent | null {
    return this.parseAndNormalize(payload);
  }

  /**
   * Chuẩn hóa dữ liệu thô tùy theo loại Provider
   */
  private parseAndNormalize(payload: any): NormalizedLiveEvent | null {
    if (!payload || typeof payload !== 'object') return null;

    if (this.providerType === 'TIKFINITY') {
      return this.normalizeTikFinity(payload);
    }
    if (this.providerType === 'EULERSTREAM') {
      return this.normalizeEulerStream(payload);
    }
    return null;
  }

  private normalizeTikFinity(payload: any): NormalizedLiveEvent | null {
    const eventType = payload.event;
    const d = payload.data;
    if (!eventType || !d) return null;

    const senderId = String(d.userId || d.uniqueId || d.user?.uniqueId || d.user?.userId || 'unknown_user');
    const senderName = String(
      d.nickname || d.uniqueId || d.user?.nickname || d.user?.uniqueId || 'Khách Ẩn Danh'
    );
    const senderAvatarUrl = d.profilePictureUrl || null;
    const timestamp = Number(d.timestamp || Date.now());

    if (eventType === 'gift') {
      const rawRepeat = Number(d.repeatCount || 1);
      const isEnd = d.repeatEnd === true;
      const giftId = String(d.giftId || '0');
      const diamondCount = Number(d.diamondCount || 0);
      const comboKey = `tikfinity_${senderId}_${giftId}_${d.groupId || 'single'}`;

      const prev = this.comboTracker.get(comboKey)?.lastRepeatCount ?? 0;
      let deltaCount = 1;

      if (rawRepeat > 1 || d.groupId) {
        if (rawRepeat <= prev) {
          // Gói tin combo bị trùng lặp hoặc lùi số lượng -> Bỏ qua
          return null;
        }
        deltaCount = rawRepeat - prev;
        this.comboTracker.set(comboKey, {
          lastRepeatCount: rawRepeat,
          lastSeenAt: Date.now(),
        });
        if (isEnd) {
          this.comboTracker.delete(comboKey);
        }
      } else {
        deltaCount = rawRepeat;
        if (isEnd) {
          this.comboTracker.delete(comboKey);
        }
      }

      const stableBase = d.id ? `tikfinity_${d.id}` : null;
      let externalEventId: string;
      let idStrategy: 'EXTERNAL_STABLE' | 'SYNTHETIC_DETERMINISTIC';

      if (stableBase) {
        idStrategy = 'EXTERNAL_STABLE';
        externalEventId = rawRepeat > 1 ? `${stableBase}_r${rawRepeat}` : stableBase;
      } else {
        idStrategy = 'SYNTHETIC_DETERMINISTIC';
        externalEventId = `syn_${crypto.randomUUID()}`;
      }

      return {
        source: 'TIKTOK',
        eventType: 'GIFT',
        provider: 'TIKFINITY',
        externalEventId,
        idStrategy,
        providerEventId: d.id ? String(d.id) : null,
        senderId,
        senderName,
        senderAvatarUrl,
        giftId,
        giftName: String(d.giftName || d.name || 'TikTok Gift'),
        giftCount: deltaCount,
        unitCoinValue: diamondCount,
        totalCoinValue: diamondCount * deltaCount,
        comboGroupId: d.groupId ? String(d.groupId) : null,
        isComboEnd: isEnd,
        platformTimestamp: timestamp,
        providerMetadata: {
          uniqueId: d.uniqueId,
          rawRepeatCount: rawRepeat,
        },
        rawPayload: payload,
      };
    }

    if (eventType === 'chat') {
      const stableBase = d.id ? `tikfinity_${d.id}` : null;
      return {
        source: 'TIKTOK',
        eventType: 'CHAT',
        provider: 'TIKFINITY',
        externalEventId: stableBase || `syn_${crypto.randomUUID()}`,
        idStrategy: stableBase ? 'EXTERNAL_STABLE' : 'SYNTHETIC_DETERMINISTIC',
        providerEventId: d.id ? String(d.id) : null,
        senderId,
        senderName,
        senderAvatarUrl,
        giftId: null,
        giftName: null,
        giftCount: 1,
        unitCoinValue: 0,
        totalCoinValue: 0,
        comboGroupId: null,
        isComboEnd: true,
        platformTimestamp: timestamp,
        providerMetadata: {
          comment: d.comment,
        },
        rawPayload: payload,
      };
    }

    if (eventType === 'like') {
      const stableBase = d.id ? `tikfinity_${d.id}` : null;
      return {
        source: 'TIKTOK',
        eventType: 'LIKE',
        provider: 'TIKFINITY',
        externalEventId: stableBase || `syn_${crypto.randomUUID()}`,
        idStrategy: stableBase ? 'EXTERNAL_STABLE' : 'SYNTHETIC_DETERMINISTIC',
        providerEventId: d.id ? String(d.id) : null,
        senderId,
        senderName,
        senderAvatarUrl,
        giftId: null,
        giftName: null,
        giftCount: Number(d.likeCount || 1),
        unitCoinValue: 0,
        totalCoinValue: 0,
        comboGroupId: null,
        isComboEnd: true,
        platformTimestamp: timestamp,
        providerMetadata: {
          totalLikes: d.totalLikes,
        },
        rawPayload: payload,
      };
    }

    if (eventType === 'follow') {
      const stableBase = d.id ? `tikfinity_${d.id}` : null;
      return {
        source: 'TIKTOK',
        eventType: 'FOLLOW',
        provider: 'TIKFINITY',
        externalEventId: stableBase || `syn_${crypto.randomUUID()}`,
        idStrategy: stableBase ? 'EXTERNAL_STABLE' : 'SYNTHETIC_DETERMINISTIC',
        providerEventId: d.id ? String(d.id) : null,
        senderId,
        senderName,
        senderAvatarUrl,
        giftId: null,
        giftName: null,
        giftCount: 1,
        unitCoinValue: 0,
        totalCoinValue: 0,
        comboGroupId: null,
        isComboEnd: true,
        platformTimestamp: timestamp,
        providerMetadata: {},
        rawPayload: payload,
      };
    }

    if (eventType === 'share') {
      const stableBase = d.id ? `tikfinity_${d.id}` : null;
      return {
        source: 'TIKTOK',
        eventType: 'SHARE',
        provider: 'TIKFINITY',
        externalEventId: stableBase || `syn_${crypto.randomUUID()}`,
        idStrategy: stableBase ? 'EXTERNAL_STABLE' : 'SYNTHETIC_DETERMINISTIC',
        providerEventId: d.id ? String(d.id) : null,
        senderId,
        senderName,
        senderAvatarUrl,
        giftId: null,
        giftName: null,
        giftCount: 1,
        unitCoinValue: 0,
        totalCoinValue: 0,
        comboGroupId: null,
        isComboEnd: true,
        platformTimestamp: timestamp,
        providerMetadata: {},
        rawPayload: payload,
      };
    }

    return null;
  }

  private normalizeEulerStream(payload: any): NormalizedLiveEvent | null {
    if (payload.type !== 'gift' || !payload.gift) {
      return null;
    }
    const g = payload.gift;
    const u = payload.user || {};
    const senderId = String(u.user_id || u.unique_id || 'unknown_user');
    const giftId = String(g.gift_id || '0');
    const diamondCount = Number(g.diamond_count || 0);
    const rawRepeat = Number(g.repeat_count || 1);
    const isRepeating = g.is_repeating === true;
    const isComboEnd = !isRepeating;
    const comboKey = `euler_${senderId}_${giftId}_${payload.room_id || 'single'}`;

    const prev = this.comboTracker.get(comboKey)?.lastRepeatCount ?? 0;
    let deltaCount = 1;

    if (rawRepeat > 1 || isRepeating) {
      if (rawRepeat <= prev) {
        return null;
      }
      deltaCount = rawRepeat - prev;
      this.comboTracker.set(comboKey, {
        lastRepeatCount: rawRepeat,
        lastSeenAt: Date.now(),
      });
      if (isComboEnd) {
        this.comboTracker.delete(comboKey);
      }
    } else {
      deltaCount = rawRepeat;
      if (isComboEnd) {
        this.comboTracker.delete(comboKey);
      }
    }

    const stableBase = payload.msg_id ? `euler_${payload.msg_id}` : null;
    let externalEventId: string;
    let idStrategy: 'EXTERNAL_STABLE' | 'SYNTHETIC_DETERMINISTIC';

    if (stableBase) {
      idStrategy = 'EXTERNAL_STABLE';
      externalEventId = rawRepeat > 1 ? `${stableBase}_r${rawRepeat}` : stableBase;
    } else {
      idStrategy = 'SYNTHETIC_DETERMINISTIC';
      externalEventId = `syn_${crypto.randomUUID()}`;
    }

    return {
      source: 'TIKTOK',
      eventType: 'GIFT',
      provider: 'EULERSTREAM',
      externalEventId,
      idStrategy,
      providerEventId: payload.msg_id ? String(payload.msg_id) : null,
      senderId,
      senderName: String(u.nickname || u.unique_id || 'Khách Ẩn Danh'),
      senderAvatarUrl: u.avatar_url || null,
      giftId,
      giftName: String(g.gift_name || 'TikTok Gift'),
      giftCount: deltaCount,
      unitCoinValue: diamondCount,
      totalCoinValue: diamondCount * deltaCount,
      comboGroupId: null,
      isComboEnd,
      platformTimestamp: Number(payload.timestamp || Date.now()),
      providerMetadata: {
        roomId: payload.room_id,
        uniqueId: u.unique_id,
        rawRepeatCount: rawRepeat,
      },
      rawPayload: payload,
    };
  }
}
