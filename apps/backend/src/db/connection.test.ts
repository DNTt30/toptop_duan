import { DEFAULT_APP_SETTINGS } from '@buddhalive/shared';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openSqliteDatabase, type SqliteDatabaseContext } from './connection';

describe('S1 SQLite WAL Connection, Migrations & Read/Write Persistence', () => {
  const tempDirs: string[] = [];
  const openContexts: SqliteDatabaseContext[] = [];

  afterEach(() => {
    while (openContexts.length > 0) {
      const ctx = openContexts.pop();
      ctx?.close();
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('initializes WAL mode, foreign_keys=ON, runs migrations, and persists writes across reopen', () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s1-db-'));
    tempDirs.push(tmpBase);

    const ctx1 = openSqliteDatabase({ baseDir: tmpBase });
    openContexts.push(ctx1);

    expect(fs.existsSync(ctx1.paths.dbFilePath)).toBe(true);
    const health = ctx1.runStorageHealthCheck({ isPackaged: false });
    expect(health.ok).toBe(true);
    expect(health.journalMode).toBe('wal');
    expect(health.foreignKeysEnabled).toBe(true);
    expect(health.appliedMigrations).toContain('001_bootstrap_app_settings');
    expect(health.settingsCount).toBe(DEFAULT_APP_SETTINGS.length);
    expect(health.readWriteProbeOk).toBe(true);

    // Persist a real setting update, close DB, and reopen from disk
    ctx1.settingsRepo.updateValue('overlay.fps_limit', '30');
    ctx1.close();

    const ctx2 = openSqliteDatabase({ baseDir: tmpBase });
    openContexts.push(ctx2);

    const persisted = ctx2.settingsRepo.get('overlay.fps_limit');
    expect(persisted?.valueJson).toBe('30');

    // Reject sensitive setting keys
    expect(() =>
      ctx2.settingsRepo.updateValue('security.overlayToken', '"secret"')
    ).toThrow(/FORBIDDEN_SENSITIVE_SETTING_KEY/);

    ctx2.close();
  });
});
