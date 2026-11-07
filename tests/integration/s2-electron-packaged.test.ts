import { openSqliteDatabase } from '@buddhalive/backend';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');
const DESKTOP_DIR = path.join(WORKSPACE_ROOT, 'apps', 'desktop');
const PACKAGED_EXE_PATH = path.join(
  DESKTOP_DIR,
  'release',
  'win-unpacked',
  'BuddhaLive Studio.exe'
);

interface S2VerificationReportFile {
  verifiedAt: string;
  isPackaged: boolean;
  execPath: string;
  payload: {
    rendererIsolationOk: boolean;
    updatedFpsJson: string;
    demoExecutionOk: boolean;
    health: {
      ok: boolean;
      dbFilePath: string;
      journalMode: string;
      foreignKeysEnabled: boolean;
      appliedMigrations: string[];
      settingsCount: number;
      readWriteProbeOk: boolean;
      isPackaged: boolean;
      electronVersion: string | null;
    };
  };
}

describe('S2 Packaged Windows .exe Walking Skeleton & Demo Verification', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('runs packaged Windows .exe: boots BuddhaServer, triggers demo gift, and persists in SQLite', () => {
    expect(
      fs.existsSync(PACKAGED_EXE_PATH),
      `Expected packaged Windows executable at ${PACKAGED_EXE_PATH}. Run "pnpm pack:win-dir" first.`
    ).toBe(true);

    const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s2-pkg-'));
    tempDirs.push(tempBase);

    const userDataDir = path.join(tempBase, 'appdata');
    const verifyJsonPath = path.join(tempBase, 'verify-s2-packaged.json');

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    env.BUDDHALIVE_USER_DATA_DIR = userDataDir;
    env.BUDDHALIVE_S2_VERIFY_OUT = verifyJsonPath;

    const proc = spawnSync(PACKAGED_EXE_PATH, [], {
      cwd: path.dirname(PACKAGED_EXE_PATH),
      env,
      encoding: 'utf-8',
      timeout: 90000,
    });

    expect(proc.status, `Packaged .exe stderr: ${proc.stderr}`).toBe(0);
    expect(fs.existsSync(verifyJsonPath)).toBe(true);

    const report = JSON.parse(
      fs.readFileSync(verifyJsonPath, 'utf-8')
    ) as S2VerificationReportFile;

    expect(report.isPackaged).toBe(true);
    expect(report.payload.health.isPackaged).toBe(true);
    expect(report.payload.rendererIsolationOk).toBe(true);
    expect(report.payload.health.ok).toBe(true);
    expect(report.payload.health.journalMode).toBe('wal');
    expect(report.payload.health.foreignKeysEnabled).toBe(true);
    expect(report.payload.health.appliedMigrations).toContain('001_bootstrap_app_settings');
    expect(report.payload.health.appliedMigrations).toContain('002_core_schema_and_sample_seed');
    expect(report.payload.demoExecutionOk).toBe(true);
    expect(report.payload.updatedFpsJson).toBe('30');

    // Mở lại DB được tạo bởi file .exe đã đóng gói để xác nhận dữ liệu bền vững
    const checkCtx = openSqliteDatabase({ baseDir: userDataDir });
    const liveEvents = checkCtx.db.prepare('SELECT * FROM live_events WHERE source = ?').all('DEMO');
    expect(liveEvents.length).toBeGreaterThanOrEqual(1);

    const executions = checkCtx.db.prepare('SELECT * FROM event_executions WHERE source = ?').all('DEMO');
    expect(executions.length).toBeGreaterThanOrEqual(1);

    const activeChar = checkCtx.charRepo.getActiveCharacter();
    expect(activeChar?.slug).toBe('tieu-sa-di');

    checkCtx.close();
  }, 120000);
});
