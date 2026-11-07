import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { SqliteDatabaseContext } from '../db/connection';
import type { EventEngine } from '../engine/event-engine';
import type { OverlaySessionStore } from '../security/overlay-session-store';

export interface DiagnosticsReport {
  reportVersion: '1.0.0';
  generatedAt: string;
  system: {
    platform: string;
    release: string;
    arch: string;
    cpuCores: number;
    totalMemoryMb: number;
    freeMemoryMb: number;
    nodeVersion: string;
  };
  storage: {
    dbFilePath: string;
    journalMode: string;
    integrityCheck: string;
    foreignKeys: boolean;
    appliedMigrations: string[];
    dbSizeBytes: number;
    walSizeBytes: number;
    totalSettings: number;
  };
  engine: {
    status: 'IDLE' | 'PROCESSING' | 'PAUSED';
    isPaused: boolean;
    queueMetrics: {
      queued: number;
      playing: number;
      completed: number;
      failed: number;
    };
  };
  overlay: {
    activeSessionsCount: number;
    pairingActive: boolean;
  };
  recentErrors: Array<{
    id: string;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
    finishedAt: string | null;
    senderName: string;
    giftName: string | null;
  }>;
}

export function sanitizePath(rawPath: string): string {
  const username = os.userInfo().username;
  if (!username) return rawPath;
  const regex = new RegExp(username, 'gi');
  return rawPath.replace(regex, '<REDACTED_USER>');
}

export class DiagnosticsService {
  /**
   * Tạo báo cáo chẩn đoán toàn diện, che chắn 100% token, cookie, và thông tin nhạy cảm.
   */
  public generateReport(
    ctx: SqliteDatabaseContext,
    engine: EventEngine,
    sessionStore?: OverlaySessionStore
  ): DiagnosticsReport {
    const dbPath = ctx.paths.dbFilePath;
    const walPath = `${dbPath}-wal`;

    let dbSizeBytes = 0;
    let walSizeBytes = 0;
    try {
      if (fs.existsSync(dbPath)) dbSizeBytes = fs.statSync(dbPath).size;
      if (fs.existsSync(walPath)) walSizeBytes = fs.statSync(walPath).size;
    } catch {
      // Ignore stat error
    }

    const journalMode = String(ctx.db.pragma('journal_mode', { simple: true }));
    const integrityCheck = String(ctx.db.pragma('quick_check', { simple: true }));
    const foreignKeys = Boolean(ctx.db.pragma('foreign_keys', { simple: true }));

    // Lấy 50 lỗi gần nhất từ bảng event_executions
    const errorRows = ctx.db
      .prepare(`
        SELECT id, status, error_code, error_message, finished_at, sender_name, gift_name
        FROM event_executions
        WHERE status IN ('FAILED', 'TIMED_OUT', 'CANCELLED', 'EVICTED_BY_PRIORITY', 'SKIPPED_BY_MANAGER')
           OR error_code IS NOT NULL
        ORDER BY queued_at DESC
        LIMIT 50
      `)
      .all() as Array<{
        id: string;
        status: string;
        error_code: string | null;
        error_message: string | null;
        finished_at: string | null;
        sender_name: string;
        gift_name: string | null;
      }>;

    const sanitizedErrors = errorRows.map((row) => ({
      id: row.id,
      status: row.status,
      errorCode: row.error_code,
      errorMessage: row.error_message ? sanitizePath(row.error_message) : null,
      finishedAt: row.finished_at,
      senderName: row.sender_name,
      giftName: row.gift_name,
    }));

    const activeSessions = sessionStore ? sessionStore.count : 0;

    return {
      reportVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      system: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpuCores: os.cpus().length,
        totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
        freeMemoryMb: Math.round(os.freemem() / (1024 * 1024)),
        nodeVersion: process.version,
      },
      storage: {
        dbFilePath: sanitizePath(dbPath),
        journalMode,
        integrityCheck,
        foreignKeys,
        appliedMigrations: ctx.appliedMigrations,
        dbSizeBytes,
        walSizeBytes,
        totalSettings: ctx.settingsRepo.listAll().length,
      },
      engine: {
        status: engine.getEngineStatus(),
        isPaused: engine.getIsPaused(),
        queueMetrics: engine.getQueueMetrics(),
      },
      overlay: {
        activeSessionsCount: activeSessions,
        pairingActive: true,
      },
      recentErrors: sanitizedErrors,
    };
  }
}
