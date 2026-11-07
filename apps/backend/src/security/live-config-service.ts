import fs from 'node:fs';
import path from 'node:path';
import {
  LiveConnectionHistoryItem,
  LiveConnectionState,
  LiveConnectionSummary,
  LiveConnectionSummarySchema,
  LiveDiagnosticsReport,
  LiveDiagnosticsReportSchema,
  LiveEventTrace,
  LiveProviderApiKeyPayloadSchema,
  LiveProviderConfig,
  LiveProviderConfigSchema,
} from '@buddhalive/shared';
import { createLogger, registerSecretForRedaction, type Logger } from '../config/logger';
import type { SecretCipher } from './overlay-session-store';
import { ProviderKeyVault } from './provider-key-vault';

export interface LiveConfigServiceOptions {
  baseDir: string;
  cipher: SecretCipher;
  logger?: Logger;
}

interface EncryptedVaultFile {
  version: 1;
  keys: Record<string, string>; // provider -> base64 encrypted
  updatedAt: string;
}

/**
 * LiveConfigService quản lý cấu hình và bí mật kết nối Live Provider (TikFinity / EulerStream).
 *
 * Nguyên tắc bảo mật bắt buộc:
 * 1. Độc lập hoàn toàn khỏi SQLite schema S1–S5 (đóng băng lõi).
 * 2. API Key EulerStream bắt buộc được mã hóa bằng DPAPI (Windows safeStorage) qua ProviderKeyVault,
 *    không bao giờ lưu plaintext và không bao giờ xuất ra UI hoặc log.
 * 3. Cấu hình được lưu vào file JSON `${baseDir}/config/live-provider.json`.
 * 4. Xác thực nghiêm ngặt bằng Zod schemas từ @buddhalive/shared.
 */
export class LiveConfigService {
  private readonly configDir: string;
  private readonly configFilePath: string;
  private readonly vaultFilePath: string;
  private readonly vault: ProviderKeyVault;
  private readonly logger: Logger;

  private currentConfig: LiveProviderConfig | null = null;
  private connectionState: LiveConnectionState = 'DISCONNECTED';
  private eventsReceived = 0;
  private lastConnectedAt: string | null = null;
  private lastEventAt: string | null = null;
  private lastError: string | null = null;
  private lastErrorCode: string | null = null;
  private reconnectCount = 0;
  private connectionHistory: LiveConnectionHistoryItem[] = [];

  constructor(options: LiveConfigServiceOptions) {
    this.configDir = path.join(options.baseDir, 'config');
    this.configFilePath = path.join(this.configDir, 'live-provider.json');
    this.vaultFilePath = path.join(this.configDir, 'live-vault.enc');
    this.logger = options.logger ?? createLogger('LiveConfigService');
    this.vault = new ProviderKeyVault({
      cipher: options.cipher,
      logger: this.logger.child('KeyVault'),
    });

    this.ensureDirs();
    this.loadPersistedConfig();
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  /**
   * Đọc cấu hình đã lưu từ đĩa khi khởi động
   */
  private loadPersistedConfig(): void {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const rawJson = fs.readFileSync(this.configFilePath, 'utf8');
        const parsedJson = JSON.parse(rawJson);
        const validated = LiveProviderConfigSchema.parse(parsedJson);

        // Đồng bộ trường hasApiKey từ vault thực tế
        const hasKey = this.hasApiKey('EULERSTREAM');
        if (validated.provider === 'EULERSTREAM') {
          validated.hasApiKey = hasKey;
        }

        this.currentConfig = validated;
        this.connectionState = 'CONFIGURED';
        this.logger.info(`Loaded live provider configuration: provider=${validated.provider}`);
      } else {
        this.currentConfig = null;
        this.connectionState = 'DISCONNECTED';
      }
    } catch (err) {
      this.logger.error('Failed to parse persisted live provider configuration', {
        error: (err as Error).message,
      });
      this.currentConfig = null;
      this.connectionState = 'DISCONNECTED';
    }
  }

  /**
   * Đọc cấu hình hiện tại (không chứa API Key)
   */
  public getConfig(): LiveProviderConfig | null {
    if (!this.currentConfig) return null;
    return {
      ...this.currentConfig,
      hasApiKey: this.currentConfig.provider === 'EULERSTREAM' ? this.hasApiKey('EULERSTREAM') : false,
    };
  }

  /**
   * Lưu cấu hình Live Provider (TikFinity hoặc EulerStream)
   */
  public saveConfig(input: unknown): { ok: boolean; config?: LiveProviderConfig; error?: string } {
    try {
      const validated = LiveProviderConfigSchema.parse(input);

      // Đảm bảo hasApiKey phản ánh đúng trạng thái vault
      if (validated.provider === 'EULERSTREAM') {
        validated.hasApiKey = this.hasApiKey('EULERSTREAM');
      } else {
        validated.hasApiKey = false;
      }

      this.currentConfig = validated;
      this.connectionState = 'CONFIGURED';
      this.lastError = null;

      fs.writeFileSync(this.configFilePath, JSON.stringify(validated, null, 2), 'utf8');
      this.logger.info(`Live provider config saved successfully: provider=${validated.provider}`);

      return { ok: true, config: this.getConfig()! };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`Invalid live provider config: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  /**
   * Lưu an toàn API Key cho EulerStream
   * Bí mật được mã hóa bằng DPAPI và ghi vào file mã hóa, tuyệt đối không nằm trong config JSON
   */
  public saveApiKey(input: unknown): { ok: boolean; error?: string } {
    try {
      const payload = LiveProviderApiKeyPayloadSchema.parse(input);

      // Đăng ký bí mật vào logger để loại bỏ hoàn toàn khỏi log
      registerSecretForRedaction(payload.apiKey);

      // Mã hóa khóa bằng ProviderKeyVault
      const encryptedBase64 = this.vault.encryptKey(payload.provider, payload.apiKey);

      // Đọc file vault hiện tại nếu có
      let vaultData: EncryptedVaultFile = {
        version: 1,
        keys: {},
        updatedAt: new Date().toISOString(),
      };

      if (fs.existsSync(this.vaultFilePath)) {
        try {
          const raw = fs.readFileSync(this.vaultFilePath, 'utf8');
          vaultData = JSON.parse(raw);
        } catch {
          // Khởi tạo mới nếu file lỗi
        }
      }

      vaultData.keys[payload.provider] = encryptedBase64;
      vaultData.updatedAt = new Date().toISOString();

      fs.writeFileSync(this.vaultFilePath, JSON.stringify(vaultData, null, 2), 'utf8');
      this.logger.info(`Encrypted API Key saved for provider: ${payload.provider}`);

      // Cập nhật hasApiKey trong currentConfig nếu đang chọn EULERSTREAM
      if (this.currentConfig && this.currentConfig.provider === 'EULERSTREAM') {
        this.currentConfig.hasApiKey = true;
        fs.writeFileSync(this.configFilePath, JSON.stringify(this.currentConfig, null, 2), 'utf8');
      }

      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error('Failed to save live provider API Key', { error: msg });
      return { ok: false, error: msg };
    }
  }

  /**
   * Xóa API Key của Provider khỏi vault
   */
  public clearApiKey(provider: 'EULERSTREAM'): { ok: boolean } {
    try {
      this.vault.clearMemory(provider);

      if (fs.existsSync(this.vaultFilePath)) {
        try {
          const raw = fs.readFileSync(this.vaultFilePath, 'utf8');
          const vaultData = JSON.parse(raw) as EncryptedVaultFile;
          delete vaultData.keys[provider];
          vaultData.updatedAt = new Date().toISOString();
          fs.writeFileSync(this.vaultFilePath, JSON.stringify(vaultData, null, 2), 'utf8');
        } catch {
          // Bỏ qua lỗi xóa đĩa
        }
      }

      if (this.currentConfig && this.currentConfig.provider === 'EULERSTREAM') {
        this.currentConfig.hasApiKey = false;
        fs.writeFileSync(this.configFilePath, JSON.stringify(this.currentConfig, null, 2), 'utf8');
      }

      this.logger.info(`Cleared API Key for provider: ${provider}`);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Kiểm tra Provider đã có API Key trong vault chưa
   */
  public hasApiKey(provider: 'EULERSTREAM'): boolean {
    if (!fs.existsSync(this.vaultFilePath)) return false;
    try {
      const raw = fs.readFileSync(this.vaultFilePath, 'utf8');
      const vaultData = JSON.parse(raw) as EncryptedVaultFile;
      return typeof vaultData.keys[provider] === 'string' && vaultData.keys[provider].length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Giải mã và lấy API Key từ vault (chỉ dùng nội bộ Backend khi kết nối WebSocket)
   */
  public getApiKey(provider: 'EULERSTREAM'): string | null {
    if (!this.hasApiKey(provider)) return null;
    try {
      const raw = fs.readFileSync(this.vaultFilePath, 'utf8');
      const vaultData = JSON.parse(raw) as EncryptedVaultFile;
      const encryptedBase64 = vaultData.keys[provider];
      if (!encryptedBase64) return null;
      return this.vault.decryptKey(provider, encryptedBase64);
    } catch (err) {
      this.logger.error(`Unable to decrypt API key for provider ${provider}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Cập nhật trạng thái vòng đời kết nối và lưu trữ lịch sử chẩn đoán
   */
  public updateConnectionState(
    state: LiveConnectionState,
    errorMsg?: string | null,
    errorCode?: string | null
  ): void {
    this.connectionState = state;
    if (errorMsg !== undefined) {
      this.lastError = errorMsg;
    }
    if (errorCode !== undefined) {
      this.lastErrorCode = errorCode;
    }
    if (state === 'CONNECTED') {
      this.lastConnectedAt = new Date().toISOString();
      this.lastError = null;
      this.lastErrorCode = null;
    }
    if (state === 'RECONNECTING') {
      this.reconnectCount++;
    }

    // Ghi vào lịch sử kết nối (capped 50 mục)
    this.connectionHistory.unshift({
      timestamp: new Date().toISOString(),
      provider: this.currentConfig ? this.currentConfig.provider : 'NONE',
      state,
      reason: errorMsg ?? null,
      errorCode: errorCode ?? this.lastErrorCode,
    });
    if (this.connectionHistory.length > 50) {
      this.connectionHistory.pop();
    }

    this.logger.info(
      `Live connection state changed to: ${state}${errorMsg ? ` (${errorMsg})` : ''}`
    );
  }

  public getLastConnectedAt(): string | null {
    return this.lastConnectedAt;
  }

  public getReconnectCount(): number {
    return this.reconnectCount;
  }

  public getLastErrorCode(): string | null {
    return this.lastErrorCode;
  }

  public getConnectionHistory(): LiveConnectionHistoryItem[] {
    return [...this.connectionHistory];
  }

  /**
   * Ghi nhận một sự kiện livestream nhận được thành công
   */
  public recordIncomingEvent(): void {
    this.eventsReceived++;
    this.lastEventAt = new Date().toISOString();
    if (this.connectionState !== 'RECEIVING_EVENTS') {
      this.connectionState = 'RECEIVING_EVENTS';
    }
  }

  /**
   * Trích xuất báo cáo chẩn đoán toàn diện phục vụ Chẩn đoán & Hỗ trợ kỹ thuật (T33-A, T33-C).
   * 100% không bao giờ chứa API Key, secret hay URL chưa khử khuẩn.
   */
  public getDiagnostics(
    systemHealth: {
      sqliteWalActive: boolean;
      overlayReadyCount: number;
      activeCharacterId: string | null;
      queueLength: number;
    },
    obsStatus:
      | 'DISCONNECTED'
      | 'CONNECTING'
      | 'IDENTIFYING'
      | 'IDENTIFIED'
      | 'ERROR' = 'DISCONNECTED',
    recentTraces?: LiveEventTrace[]
  ): LiveDiagnosticsReport {
    const report: LiveDiagnosticsReport = {
      timestamp: new Date().toISOString(),
      provider: this.currentConfig ? this.currentConfig.provider : 'NONE',
      providerStatus: this.connectionState,
      obsStatus,
      streamerUsername: this.currentConfig
        ? this.currentConfig.streamerUsername
        : '',
      endpointUrl: this.currentConfig
        ? this.sanitizeUrl(this.currentConfig.endpointUrl)
        : '',
      hasApiKey:
        this.currentConfig?.provider === 'EULERSTREAM'
          ? this.hasApiKey('EULERSTREAM')
          : false,
      lastConnectedAt: this.lastConnectedAt,
      lastEventAt: this.lastEventAt,
      eventsReceived: this.eventsReceived,
      reconnectCount: this.reconnectCount,
      lastErrorCode: this.lastErrorCode,
      lastErrorMessage: this.lastError,
      connectionHistory: this.connectionHistory,
      recentTraces: recentTraces ? [...recentTraces] : undefined,
      systemHealth,
    };

    return LiveDiagnosticsReportSchema.parse(report);
  }

  private sanitizeUrl(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      if (parsed.searchParams.has('apiKey')) {
        parsed.searchParams.set('apiKey', '[REDACTED]');
      }
      return parsed.toString();
    } catch {
      return urlStr.replace(/(apiKey|api_key|token)=[^&]+/gi, '$1=[REDACTED]');
    }
  }

  /**
   * Trả về tóm tắt trạng thái kết nối LIVE phát tới UI (100% không chứa bí mật)
   */
  public getConnectionSummary(): LiveConnectionSummary {
    const summary: LiveConnectionSummary = {
      provider: this.currentConfig ? this.currentConfig.provider : 'NONE',
      state: this.connectionState,
      streamerUsername: this.currentConfig ? this.currentConfig.streamerUsername : '',
      endpointUrl: this.currentConfig ? this.currentConfig.endpointUrl : '',
      hasApiKey: this.currentConfig?.provider === 'EULERSTREAM' ? this.hasApiKey('EULERSTREAM') : false,
      eventsReceived: this.eventsReceived,
      lastEventAt: this.lastEventAt,
      lastError: this.lastError,
    };

    return LiveConnectionSummarySchema.parse(summary);
  }
}
