import crypto from 'node:crypto';
import type { SecretCipher } from './overlay-session-store';
import { createLogger, type Logger } from '../config/logger';

export interface ProviderKeyVaultOptions {
  cipher: SecretCipher;
  logger?: Logger;
}

/**
 * Quản lý lưu trữ an toàn API Key / Token của Provider livestream (TikFinity / EulerStream).
 * Toàn bộ khóa lưu trữ bắt buộc phải được mã hóa bằng DPAPI (Windows safeStorage)
 * trước khi ghi đĩa hoặc ghi vào CSDL.
 */
export class ProviderKeyVault {
  private readonly cipher: SecretCipher;
  private readonly logger: Logger;
  private readonly memoryCache = new Map<string, string>(); // provider -> plaintext in RAM only

  constructor(options: ProviderKeyVaultOptions) {
    this.cipher = options.cipher;
    this.logger = options.logger ?? createLogger('ProviderKeyVault');
  }

  /**
   * Mã hóa API Key để lưu trữ bền vững (vào SQLite hoặc JSON file)
   */
  public encryptKey(provider: string, plainApiKey: string): string {
    if (!plainApiKey || plainApiKey.trim().length === 0) {
      throw new Error('API Key cannot be empty');
    }
    const plainBuf = Buffer.from(plainApiKey, 'utf8');
    const encryptedBuf = this.cipher.encrypt(plainBuf);
    this.memoryCache.set(provider, plainApiKey);
    this.logger.info(`Encrypted API Key for provider: ${provider} via ${this.cipher.kind}`);
    return encryptedBuf.toString('base64');
  }

  /**
   * Giải mã API Key từ chuỗi base64 đã mã hóa
   */
  public decryptKey(provider: string, encryptedBase64: string): string {
    if (this.memoryCache.has(provider)) {
      return this.memoryCache.get(provider)!;
    }
    try {
      const encryptedBuf = Buffer.from(encryptedBase64, 'base64');
      const decryptedBuf = this.cipher.decrypt(encryptedBuf);
      const plaintext = decryptedBuf.toString('utf8');
      this.memoryCache.set(provider, plaintext);
      return plaintext;
    } catch (err) {
      this.logger.error(`Failed to decrypt API Key for provider: ${provider}`, {
        error: (err as Error).message,
      });
      throw new Error(`DECRYPTION_FAILED: Unable to decrypt API key for ${provider}`);
    }
  }

  /**
   * Xóa khóa khỏi bộ nhớ RAM khi streamer đăng xuất hoặc ngắt kết nối
   */
  public clearMemory(provider?: string): void {
    if (provider) {
      this.memoryCache.delete(provider);
    } else {
      this.memoryCache.clear();
    }
  }
}
