import crypto from 'node:crypto';

/** Sinh token ngẫu nhiên 256-bit dạng base64url (architecture.md §3 — Lớp 2). */
export function generateSecretToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/** So sánh hằng số thời gian, không lộ độ dài qua thời gian phản hồi. */
export function constantTimeEquals(a: string, b: string): boolean {
  const da = crypto.createHash('sha256').update(a, 'utf8').digest();
  const db = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(da, db) && a.length === b.length;
}

export function randomSixDigitCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}
