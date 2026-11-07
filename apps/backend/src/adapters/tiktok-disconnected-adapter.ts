import { createLogger, type Logger } from '../config/logger';
import type {
  IncomingPlatformEvent,
  LivePlatformAdapter,
  PlatformAdapterStatus,
  PlatformEventListener,
} from './live-platform-adapter';

/**
 * Adapter trung thực cho kết nối TikTok LIVE trong Giai đoạn S5.
 * Trạng thái luôn là DISCONNECTED. Tuyệt đối không kết nối mạng ra TikTok và không tạo dữ liệu giả lập TikTok.
 */
export class TikTokDisconnectedAdapter implements LivePlatformAdapter {
  public readonly name = 'TikTokDisconnectedAdapter';
  public readonly platform = 'TIKTOK' as const;

  private readonly logger: Logger;
  private readonly listeners = new Set<PlatformEventListener>();

  constructor(logger = createLogger('TikTokAdapter')) {
    this.logger = logger;
  }

  public getStatus(): PlatformAdapterStatus {
    return 'DISCONNECTED';
  }

  public async start(): Promise<void> {
    this.logger.info(
      'TikTok LIVE Adapter initialized in DISCONNECTED mode (real TikTok connection is intentionally disabled in S5)'
    );
  }

  public async stop(): Promise<void> {
    this.logger.info('TikTok LIVE Adapter stopped');
  }

  public onEvent(listener: PlatformEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Phương thức kiểm thử an toàn xác nhận adapter không tự sinh sự kiện TikTok
   */
  public getListenerCount(): number {
    return this.listeners.size;
  }
}
