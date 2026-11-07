import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from '../config/logger';
import { constantTimeEquals, generateSecretToken, sha256Hex } from './tokens';

/**
 * Bộ mã hóa dữ liệu bí mật khi lưu đĩa.
 * - Trên Electron: hiện thực bằng `safeStorage` (Windows DPAPI) trong Main Process.
 * - Trong kiểm thử Node thuần: dùng cipher kiểm thử riêng (không dùng cho bản phát hành).
 */
export interface SecretCipher {
  readonly kind: string;
  encrypt: (plain: Buffer) => Buffer;
  decrypt: (encrypted: Buffer) => Buffer;
}

interface PersistedSessionFile {
  version: 1;
  sessions: Array<{ hash: string; createdAt: string }>;
}

const MAX_SESSIONS = 20;

/**
 * Kho phiên Overlay: chỉ giữ SHA-256(overlayToken), không bao giờ giữ/ghi plain-text token.
 * Tệp `security/overlay-sessions.dat` được mã hóa bằng SecretCipher (DPAPI trên Windows).
 */
export class OverlaySessionStore {
  private sessions: Array<{ hash: string; createdAt: string }> = [];

  constructor(
    private readonly filePath: string,
    private readonly cipher: SecretCipher,
    private readonly logger: Logger
  ) {}

  public load(): void {
    if (!fs.existsSync(this.filePath)) {
      this.sessions = [];
      return;
    }
    try {
      const decrypted = this.cipher.decrypt(fs.readFileSync(this.filePath));
      const parsed = JSON.parse(decrypted.toString('utf8')) as PersistedSessionFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
        throw new Error('Unsupported session file format');
      }
      this.sessions = parsed.sessions.filter(
        (entry) => typeof entry.hash === 'string' && /^[a-f0-9]{64}$/.test(entry.hash)
      );
      this.logger.info('Loaded overlay session hashes', { count: this.sessions.length });
    } catch (error) {
      // Tệp hỏng hoặc không giải mã được (khác user Windows) → yêu cầu ghép nối lại.
      this.logger.warn('Overlay session store unreadable; pairing will be required again', {
        error,
      });
      this.sessions = [];
    }
  }

  public get count(): number {
    return this.sessions.length;
  }

  /** Cấp overlayToken mới. Trả plain-text duy nhất 1 lần để đặt vào cookie HttpOnly. */
  public issue(nowIso: string = new Date().toISOString()): string {
    const token = generateSecretToken();
    this.sessions.push({ hash: sha256Hex(token), createdAt: nowIso });
    if (this.sessions.length > MAX_SESSIONS) {
      this.sessions = this.sessions.slice(-MAX_SESSIONS);
    }
    this.persist();
    return token;
  }

  public isValid(token: string | undefined | null): boolean {
    if (!token || token.length < 32 || token.length > 128) {
      return false;
    }
    const candidate = sha256Hex(token);
    let matched = false;
    for (const entry of this.sessions) {
      if (constantTimeEquals(entry.hash, candidate)) {
        matched = true;
      }
    }
    return matched;
  }

  public revokeAll(): number {
    const revoked = this.sessions.length;
    this.sessions = [];
    this.persist();
    return revoked;
  }

  private persist(): void {
    const payload: PersistedSessionFile = { version: 1, sessions: this.sessions };
    const encrypted = this.cipher.encrypt(Buffer.from(JSON.stringify(payload), 'utf8'));
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, encrypted);
    fs.renameSync(tmpPath, this.filePath);
  }
}
