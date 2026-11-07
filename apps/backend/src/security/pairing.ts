import crypto from 'node:crypto';
import type { PendingPairRequest } from '@buddhalive/shared';
import { constantTimeEquals, generateSecretToken, randomSixDigitCode } from './tokens';

export const PAIRING_TTL_MS = 120_000;
const MAX_PENDING = 10;

interface PairingEntry {
  pairingId: string;
  code: string;
  claimSecret: string;
  createdAt: number;
  expiresAt: number;
  approved: boolean;
}

export type PairingClaimResult = 'PENDING' | 'APPROVED' | 'EXPIRED' | 'INVALID';

/**
 * Ghép nối Overlay 1 lần (architecture.md §3 — Lớp 2):
 * Overlay xin mã 6 số → Vận hành viên duyệt trên Desktop Manager (managerToken)
 * → Overlay đổi `claimSecret` (trong JSON body, không trên URL) lấy cookie HttpOnly.
 */
export class PairingManager {
  private readonly entries = new Map<string, PairingEntry>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly onChange: () => void = () => undefined
  ) {}

  public request(): { pairingId: string; code: string; claimSecret: string; expiresAt: string } {
    this.prune();
    while (this.entries.size >= MAX_PENDING) {
      const oldest = [...this.entries.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!oldest) break;
      this.entries.delete(oldest.pairingId);
    }
    const createdAt = this.now();
    const entry: PairingEntry = {
      pairingId: crypto.randomUUID(),
      code: randomSixDigitCode(),
      claimSecret: generateSecretToken(),
      createdAt,
      expiresAt: createdAt + PAIRING_TTL_MS,
      approved: false,
    };
    this.entries.set(entry.pairingId, entry);
    this.onChange();
    return {
      pairingId: entry.pairingId,
      code: entry.code,
      claimSecret: entry.claimSecret,
      expiresAt: new Date(entry.expiresAt).toISOString(),
    };
  }

  public approve(pairingId: string, code: string): boolean {
    this.prune();
    const entry = this.entries.get(pairingId);
    if (!entry || entry.approved || !constantTimeEquals(entry.code, code)) {
      return false;
    }
    entry.approved = true;
    this.onChange();
    return true;
  }

  /** Đổi claimSecret lấy quyền cấp cookie. Chỉ thành công đúng 1 lần (one-time). */
  public claim(pairingId: string, claimSecret: string): PairingClaimResult {
    const entry = this.entries.get(pairingId);
    if (!entry || !constantTimeEquals(entry.claimSecret, claimSecret)) {
      return 'INVALID';
    }
    if (this.now() > entry.expiresAt) {
      this.entries.delete(pairingId);
      this.onChange();
      return 'EXPIRED';
    }
    if (!entry.approved) {
      return 'PENDING';
    }
    this.entries.delete(pairingId);
    this.onChange();
    return 'APPROVED';
  }

  public listPending(): PendingPairRequest[] {
    this.prune();
    return [...this.entries.values()]
      .filter((entry) => !entry.approved)
      .map((entry) => ({
        pairingId: entry.pairingId,
        code: entry.code,
        expiresAt: new Date(entry.expiresAt).toISOString(),
      }));
  }

  private prune(): void {
    const now = this.now();
    let changed = false;
    for (const [id, entry] of this.entries) {
      if (now > entry.expiresAt) {
        this.entries.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.onChange();
    }
  }
}
