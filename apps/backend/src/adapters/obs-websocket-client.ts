import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import { createLogger, registerSecretForRedaction, type Logger } from '../config/logger';

export interface ObsWebSocketClientOptions {
  url?: string;
  password?: string;
  logger?: Logger;
  customWebSocketFactory?: (url: string) => any;
}

export interface ObsSceneItem {
  sceneName: string;
  sceneIndex: number;
}

export interface ObsSceneListResult {
  currentProgramSceneName: string;
  scenes: ObsSceneItem[];
}

export interface ObsInputSettingsResult {
  inputName: string;
  inputKind: string;
  inputSettings: Record<string, unknown>;
}

export type ObsConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'IDENTIFYING'
  | 'IDENTIFIED'
  | 'ERROR';

/**
 * ObsWebSocketClient tích hợp với OBS Studio thông qua giao thức OBS WebSocket v5 (cổng mặc định 4455).
 *
 * Tiêu chuẩn & Nguyên tắc an toàn:
 * 1. Hoàn tất quy trình bắt tay: Hello (op: 0) -> Identify (op: 1) -> Identified (op: 2).
 * 2. Xác thực an toàn bằng SHA-256 challenge response khi OBS yêu cầu mật khẩu.
 * 3. Tuyệt đối không rò rỉ mật khẩu OBS ra log hệ thống.
 * 4. Cô lập lỗi (Failure Isolation): Lỗi mạng, sai mật khẩu hoặc OBS tắt không bao giờ làm crash Backend.
 * 5. Cung cấp API truy vấn Scene, Source, và kiểm chứng nguồn Browser Source phục vụ Overlay.
 */
export class ObsWebSocketClient extends EventEmitter {
  private status: ObsConnectionStatus = 'DISCONNECTED';
  private readonly url: string;
  private readonly password?: string;
  private readonly logger: Logger;
  private readonly customWebSocketFactory?: (url: string) => any;

  private socket: any = null;
  private pendingRequests = new Map<
    string,
    { resolve: (data: any) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  private lastError: string | null = null;
  private isExplicitlyClosed = false;

  constructor(options: ObsWebSocketClientOptions = {}) {
    super();
    this.url = options.url || 'ws://127.0.0.1:4455';
    this.password = options.password;
    this.logger = options.logger ?? createLogger('ObsWebSocketClient');
    this.customWebSocketFactory = options.customWebSocketFactory;

    if (this.password) {
      registerSecretForRedaction(this.password);
    }
  }

  public getStatus(): ObsConnectionStatus {
    return this.status;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Kết nối tới OBS Studio WebSocket Server (v5)
   */
  public async connect(): Promise<{ ok: boolean; status: ObsConnectionStatus; error?: string }> {
    if (this.status === 'IDENTIFIED' || this.status === 'CONNECTING' || this.status === 'IDENTIFYING') {
      return { ok: true, status: this.status };
    }

    this.isExplicitlyClosed = false;
    this.lastError = null;
    this.status = 'CONNECTING';
    this.logger.info(`Connecting to OBS WebSocket v5 at ${this.url}...`);

    return new Promise((resolve) => {
      try {
        if (this.customWebSocketFactory) {
          this.socket = this.customWebSocketFactory(this.url);
        } else if (typeof globalThis.WebSocket !== 'undefined') {
          this.socket = new globalThis.WebSocket(this.url);
        } else {
          throw new Error('No WebSocket implementation available in runtime');
        }

        const connectTimeout = setTimeout(() => {
          if (this.status !== 'IDENTIFIED') {
            const timeoutErr = 'OBS_TIMEOUT: Kết nối tới OBS WebSocket quá thời gian chờ (10s)';
            this.handleFailure(timeoutErr);
            resolve({ ok: false, status: 'ERROR', error: timeoutErr });
          }
        }, 10000);

        this.setupSocketHandlers({
          onIdentified: () => {
            clearTimeout(connectTimeout);
            resolve({ ok: true, status: 'IDENTIFIED' });
          },
          onFail: (err) => {
            clearTimeout(connectTimeout);
            resolve({ ok: false, status: 'ERROR', error: err });
          },
        });
      } catch (err) {
        const msg = (err as Error).message;
        this.handleFailure(msg);
        resolve({ ok: false, status: 'ERROR', error: msg });
      }
    });
  }

  /**
   * Thiết lập các sự kiện của WebSocket client
   */
  private setupSocketHandlers(callbacks: {
    onIdentified: () => void;
    onFail: (err: string) => void;
  }): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      this.logger.info('OBS WebSocket socket opened, awaiting Hello (OpCode 0)...');
    };

    this.socket.onmessage = (event: any) => {
      try {
        const raw = typeof event?.data === 'string' ? event.data : String(event?.data ?? '');
        const packet = JSON.parse(raw);
        this.handleIncomingPacket(packet, callbacks);
      } catch (err) {
        this.logger.warn('Failed to parse incoming OBS WebSocket packet', {
          error: (err as Error).message,
        });
      }
    };

    this.socket.onerror = (err: any) => {
      const errMsg = err?.message || 'OBS WebSocket network error';
      this.handleFailure(errMsg);
      callbacks.onFail(errMsg);
    };

    this.socket.onclose = (event: any) => {
      const reason = event?.reason || 'Connection closed';
      const code = event?.code || 1000;
      this.logger.info(`OBS WebSocket connection closed (code: ${code}, reason: ${reason})`);
      this.cleanupPendingRequests('OBS connection closed');

      if (this.status === 'CONNECTING' || this.status === 'IDENTIFYING') {
        const failureReason =
          code === 4009
            ? 'OBS_AUTH_FAILED: Mật khẩu xác thực OBS Studio không chính xác'
            : `OBS_CLOSED_BEFORE_IDENTIFIED: Code ${code} (${reason})`;
        this.handleFailure(failureReason);
        callbacks.onFail(failureReason);
      } else if (!this.isExplicitlyClosed) {
        this.status = 'DISCONNECTED';
      }
      this.emit('disconnected', { code, reason });
    };
  }

  /**
   * Xử lý gói tin giao thức OBS WebSocket v5
   */
  private handleIncomingPacket(
    packet: any,
    callbacks: { onIdentified: () => void; onFail: (err: string) => void }
  ): void {
    const op = Number(packet?.op);

    // OpCode 0: Hello từ OBS
    if (op === 0) {
      this.handleHelloPacket(packet.d, callbacks);
      return;
    }

    // OpCode 2: Identified từ OBS (Xác thực thành công)
    if (op === 2) {
      this.status = 'IDENTIFIED';
      this.lastError = null;
      this.logger.info('OBS WebSocket Handshake completed: Identified successfully (OpCode 2)');
      this.emit('identified', packet.d);
      callbacks.onIdentified();
      return;
    }

    // OpCode 5: Event từ OBS
    if (op === 5) {
      const eventType = packet.d?.eventType;
      const eventData = packet.d?.eventData;
      this.emit('obsEvent', { eventType, eventData });
      return;
    }

    // OpCode 7: RequestResponse từ OBS
    if (op === 7) {
      const requestId = packet.d?.requestId;
      const requestStatus = packet.d?.requestStatus;
      const responseData = packet.d?.responseData;

      if (requestId && this.pendingRequests.has(requestId)) {
        const pending = this.pendingRequests.get(requestId)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(requestId);

        if (requestStatus?.result === true) {
          pending.resolve(responseData);
        } else {
          pending.reject(
            new Error(
              `OBS_REQUEST_FAILED: ${requestStatus?.comment || 'Request returned error code ' + requestStatus?.code}`
            )
          );
        }
      }
      return;
    }
  }

  /**
   * Xử lý Hello (OpCode 0) và gửi Identify (OpCode 1)
   */
  private handleHelloPacket(
    helloData: any,
    callbacks: { onIdentified: () => void; onFail: (err: string) => void }
  ): void {
    this.status = 'IDENTIFYING';
    const authConfig = helloData?.authentication;

    let authString: string | undefined;

    if (authConfig) {
      if (!this.password) {
        const errMsg = 'OBS_AUTH_REQUIRED: OBS Studio yêu cầu mật khẩu xác thực nhưng chưa được cung cấp.';
        this.handleFailure(errMsg);
        callbacks.onFail(errMsg);
        this.disconnect();
        return;
      }

      try {
        // Tính toán phản hồi xác thực OBS v5 SHA-256
        // 1. secret = base64(sha256(password + salt))
        const secret = crypto
          .createHash('sha256')
          .update(this.password + authConfig.salt)
          .digest('base64');

        // 2. auth = base64(sha256(secret + challenge))
        authString = crypto
          .createHash('sha256')
          .update(secret + authConfig.challenge)
          .digest('base64');
      } catch (err) {
        const errMsg = `OBS_AUTH_COMPUTATION_FAILED: ${(err as Error).message}`;
        this.handleFailure(errMsg);
        callbacks.onFail(errMsg);
        return;
      }
    }

    // Gửi OpCode 1: Identify
    const identifyPacket = {
      op: 1,
      d: {
        rpcVersion: 1,
        ...(authString ? { authentication: authString } : {}),
        eventSubscriptions: 33, // General + Scenes
      },
    };

    try {
      this.socket.send(JSON.stringify(identifyPacket));
      this.logger.info('Sent Identify (OpCode 1) to OBS');
    } catch (err) {
      const errMsg = `Failed to send Identify packet: ${(err as Error).message}`;
      this.handleFailure(errMsg);
      callbacks.onFail(errMsg);
    }
  }

  /**
   * Gửi một request tới OBS WebSocket v5 (OpCode 6) và đợi RequestResponse (OpCode 7)
   */
  public async callRequest<T = any>(requestType: string, requestData?: Record<string, unknown>): Promise<T> {
    if (this.status !== 'IDENTIFIED' || !this.socket) {
      throw new Error(`OBS_NOT_CONNECTED: Cannot send request "${requestType}" in state ${this.status}`);
    }

    const requestId = crypto.randomUUID();
    const packet = {
      op: 6,
      d: {
        requestType,
        requestId,
        requestData,
      },
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`OBS_REQUEST_TIMEOUT: Request "${requestType}" timed out after 5000ms`));
        }
      }, 5000);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timer,
      });

      try {
        this.socket.send(JSON.stringify(packet));
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(err);
      }
    });
  }

  /**
   * Lấy danh sách Scene hiện có trong OBS (GetSceneList)
   */
  public async getSceneList(): Promise<ObsSceneListResult> {
    const res = await this.callRequest('GetSceneList');
    return {
      currentProgramSceneName: res.currentProgramSceneName,
      scenes: res.scenes.map((s: any) => ({
        sceneName: s.sceneName,
        sceneIndex: s.sceneIndex,
      })),
    };
  }

  /**
   * Lấy cấu hình của một Input/Source (GetInputSettings)
   */
  public async getInputSettings(inputName: string): Promise<ObsInputSettingsResult> {
    const res = await this.callRequest('GetInputSettings', { inputName });
    return {
      inputName: res.inputName,
      inputKind: res.inputKind,
      inputSettings: res.inputSettings || {},
    };
  }

  /**
   * Kiểm chứng nguồn Browser Source phục vụ Overlay BuddhaLive Studio
   */
  public async verifyBrowserSource(
    sourceName: string,
    expectedUrl: string
  ): Promise<{ ok: boolean; url?: string; error?: string }> {
    try {
      const res = await this.getInputSettings(sourceName);
      const actualUrl = String(res.inputSettings.url || '');
      const matches = actualUrl.includes(expectedUrl) || expectedUrl.includes(actualUrl);

      return {
        ok: matches,
        url: actualUrl,
        ...(!matches
          ? {
              error: `URL_MISMATCH: Nguồn "${sourceName}" đang trỏ tới "${actualUrl}", không khớp với "${expectedUrl}"`,
            }
          : {}),
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private handleFailure(errorMsg: string): void {
    this.status = 'ERROR';
    this.lastError = errorMsg;
    this.logger.error(`OBS WebSocket error: ${errorMsg}`);
  }

  private cleanupPendingRequests(reason: string): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`OBS_REQUEST_ABORTED: ${reason}`));
    }
    this.pendingRequests.clear();
  }

  /**
   * Ngắt kết nối OBS Studio
   */
  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.cleanupPendingRequests('Client disconnect requested');

    if (this.socket) {
      try {
        if (typeof this.socket.close === 'function') {
          this.socket.close();
        }
      } catch {
        // Bỏ qua lỗi đóng
      }
      this.socket = null;
    }

    this.status = 'DISCONNECTED';
    this.logger.info('Disconnected from OBS Studio WebSocket');
  }
}
