import {
  BackupService,
  createLogger,
  DiagnosticsService,
  openSqliteDatabase,
  type SqliteDatabaseContext,
} from '@buddhalive/backend';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Milestone S6: T-18 Backup, Restore & Diagnostics Verification', () => {
  let ctx: SqliteDatabaseContext;
  let tempBase: string;
  let backupService: BackupService;
  let diagnosticsService: DiagnosticsService;

  const testLogger = createLogger('TestS6Backup');

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s6-bk-'));
    ctx = openSqliteDatabase({ baseDir: tempBase });
    backupService = new BackupService(testLogger);
    diagnosticsService = new DiagnosticsService();
  });

  afterEach(() => {
    if (ctx) {
      ctx.close();
    }
    if (fs.existsSync(tempBase)) {
      try {
        fs.rmSync(tempBase, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch {
        // Ignore busy file
      }
    }
  });

  it('creates an atomic SQLite WAL database backup (.bak) using VACUUM INTO', () => {
    const backupFile = path.join(tempBase, 'backups', 'test-manual.bak');
    const result = backupService.createDatabaseBackup(ctx, backupFile);

    expect(result.ok).toBe(true);
    expect(result.scope).toBe('DATABASE_ONLY');
    expect(fs.existsSync(backupFile)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(1000);

    // Validate the created backup file
    const validation = backupService.validateDatabaseBackup(backupFile);
    expect(validation.valid).toBe(true);
    expect(validation.tableCount).toBeGreaterThanOrEqual(5);
  });

  it('creates a Full Data Bundle with .bak, assets, and manifest.json with token exclusion notice', () => {
    const bundleDir = path.join(tempBase, 'full-bundle');
    const result = backupService.createFullBackup(ctx, bundleDir);

    expect(result.ok).toBe(true);
    expect(result.scope).toBe('FULL_DATA_BUNDLE');
    expect(fs.existsSync(path.join(bundleDir, 'buddhalive.bak'))).toBe(true);
    expect(fs.existsSync(path.join(bundleDir, 'assets'))).toBe(true);
    expect(fs.existsSync(path.join(bundleDir, 'manifest.json'))).toBe(true);

    const manifestContent = JSON.parse(
      fs.readFileSync(path.join(bundleDir, 'manifest.json'), 'utf8')
    );
    expect(manifestContent.manifestVersion).toBe('1.0.0');
    expect(manifestContent.scope).toBe('FULL_DATA_BUNDLE');
    expect(manifestContent.warningNotice).toContain('excluded for safety');

    // Confirm no token or cookie files are included in the bundle
    expect(fs.existsSync(path.join(bundleDir, 'overlay-sessions.dat'))).toBe(false);
  });

  it('validates backup file header and rejects invalid or corrupted files', () => {
    const fakeFile = path.join(tempBase, 'corrupt.bak');
    const fakeData = Buffer.concat([
      Buffer.from('THIS_IS_NOT_AN_SQLITE_DATABASE_FILE_HEADER'),
      Buffer.alloc(1000),
    ]);
    fs.writeFileSync(fakeFile, fakeData);

    const res = backupService.validateDatabaseBackup(fakeFile);
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('INVALID_SQLITE_HEADER');

    const tinyFile = path.join(tempBase, 'tiny.bak');
    fs.writeFileSync(tinyFile, Buffer.alloc(100));
    const resTiny = backupService.validateDatabaseBackup(tinyFile);
    expect(resTiny.valid).toBe(false);
    expect(resTiny.errorCode).toBe('FILE_TOO_SMALL');
  });

  it('safely restores from backup with pre-restore rollback snapshot and Crash Recovery', () => {
    // 1. Seed initial data: Character "State A"
    const charA = ctx.charRepo.create({
      name: 'Nhân Vật State A',
      slug: 'char-state-a',
      modelPath: 'sample-character.glb',
      isActive: true,
    });
    expect(ctx.charRepo.getById(charA.id)).toBeDefined();

    // 2. Take backup of State A
    const backupA = path.join(tempBase, 'state-a.bak');
    backupService.createDatabaseBackup(ctx, backupA);

    // 3. Mutate live DB to "State B": delete State A or create State B
    ctx.charRepo.create({
      name: 'Nhân Vật State B',
      slug: 'char-state-b',
      modelPath: 'sample-character.glb',
      isActive: true,
    });
    expect(ctx.charRepo.getBySlug('char-state-b')).toBeDefined();

    // 4. Perform Safe Restore of State A
    const restoreResult = backupService.safeRestore(ctx, backupA, (newCtx) => {
      ctx = newCtx;
    });

    expect(restoreResult.ok).toBe(true);
    expect(restoreResult.rollbackPath).toBeDefined();
    expect(fs.existsSync(restoreResult.rollbackPath!)).toBe(true);

    // Verify State A character exists and State B character is gone
    const restoredA = ctx.charRepo.getById(charA.id);
    expect(restoredA).toBeDefined();
    expect(restoredA?.name).toBe('Nhân Vật State A');

    const charB = ctx.charRepo.getBySlug('char-state-b');
    expect(charB).toBeNull();
  });

  it('generates redacted diagnostics report without secrets, passwords, or personal usernames', () => {
    const dummyEngine = {
      getEngineStatus: () => 'PROCESSING' as const,
      getIsPaused: () => false,
      getQueueMetrics: () => ({ queued: 2, playing: 1, completed: 15, failed: 1 }),
    } as any;

    const report = diagnosticsService.generateReport(ctx, dummyEngine);

    expect(report.reportVersion).toBe('1.0.0');
    expect(report.system.platform).toBe(os.platform());
    expect(report.storage.journalMode).toBe('wal');
    expect(report.storage.integrityCheck).toBe('ok');
    expect(report.engine.status).toBe('PROCESSING');
    expect(report.engine.queueMetrics.queued).toBe(2);

    // Verify personal path redaction
    const username = os.userInfo().username;
    if (username) {
      expect(report.storage.dbFilePath.includes(username)).toBe(false);
    }
    expect(JSON.stringify(report)).not.toContain('managerToken');
    expect(JSON.stringify(report)).not.toContain('bls_overlay_session');
  });
});
