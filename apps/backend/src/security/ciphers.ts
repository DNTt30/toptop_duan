import crypto from 'node:crypto';
import type { SecretCipher } from './overlay-session-store';

/**
 * Cipher dùng cho môi trường kiểm thử Vitest hoặc Node không có DPAPI của Electron.
 * Dùng AES-256-GCM với khóa cố định theo máy chạy test.
 */
export class NodeDevSecretCipher implements SecretCipher {
  public readonly kind = 'NODE_DEV_AES';
  private readonly key: Buffer;

  constructor(seed = 'buddhalive-dev-secret-key-32b!') {
    this.key = crypto.createHash('sha256').update(seed).digest();
  }

  public encrypt(plain: Buffer): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Layout: [iv(12)] [tag(16)] [ciphertext]
    return Buffer.concat([iv, tag, encrypted]);
  }

  public decrypt(encrypted: Buffer): Buffer {
    if (encrypted.length < 28) {
      throw new Error('Ciphertext too short');
    }
    const iv = encrypted.subarray(0, 12);
    const tag = encrypted.subarray(12, 28);
    const data = encrypted.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }
}

/**
 * Adapter nhận hàm DPAPI từ electron.safeStorage trong Electron Main process.
 */
export class ElectronSafeStorageCipher implements SecretCipher {
  public readonly kind = 'ELECTRON_SAFE_STORAGE_DPAPI';

  constructor(
    private readonly encryptFn: (plain: Buffer) => Buffer,
    private readonly decryptFn: (encrypted: Buffer) => Buffer
  ) {}

  public encrypt(plain: Buffer): Buffer {
    return this.encryptFn(plain);
  }

  public decrypt(encrypted: Buffer): Buffer {
    return this.decryptFn(encrypted);
  }
}
