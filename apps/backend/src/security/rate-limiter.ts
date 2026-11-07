/**
 * Bộ giới hạn tốc độ cửa sổ cố định theo khóa (kết nối/IP) — Lớp 6.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  /** Trả về true nếu còn hạn mức, false nếu đã vượt ngưỡng (RATE_LIMITED). */
  public consume(key: string): boolean {
    const now = this.now();
    const current = this.windows.get(key);
    if (!current || now - current.startedAt >= this.windowMs) {
      this.windows.set(key, { startedAt: now, count: 1 });
      this.pruneIfLarge(now);
      return true;
    }
    current.count += 1;
    return current.count <= this.limit;
  }

  public reset(key: string): void {
    this.windows.delete(key);
  }

  private pruneIfLarge(now: number): void {
    if (this.windows.size < 1000) return;
    for (const [key, value] of this.windows) {
      if (now - value.startedAt >= this.windowMs) {
        this.windows.delete(key);
      }
    }
  }
}

/** Các nhóm hạn mức theo architecture.md §3 — Lớp 6. */
export const RATE_LIMITS = {
  pairingRequestPerMinute: 10,
  pairingExchangePerMinute: 40,
  managerCommandPerMinute: 30,
  managerSecurityPerMinute: 10,
  overlayPacketsPerSecond: 30,
} as const;
