import { openSqliteDatabase } from '@buddhalive/backend';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');
const DESKTOP_DIR = path.join(WORKSPACE_ROOT, 'apps', 'desktop');
const PACKAGED_EXE_PATH = path.join(
  DESKTOP_DIR,
  'release',
  'win-unpacked',
  'BuddhaLive Studio.exe'
);

interface VerificationReportFile {
  verifiedAt: string;
  isPackaged: boolean;
  execPath: string;
  payload: {
    rendererIsolationOk: boolean;
    updatedFpsJson: string;
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

describe('S1 Real Electron & Packaged Windows .exe SQLite Verification', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('opens better-sqlite3, runs migrations, and writes/reads inside real Electron runtime', () => {
    const electronBinary = require('electron') as string;
    const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s1-elec-dev-'));
    tempDirs.push(tempBase);

    const userDataDir = path.join(tempBase, 'appdata');
    const verifyJsonPath = path.join(tempBase, 'verify-dev.json');

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    env.BUDDHALIVE_USER_DATA_DIR = userDataDir;
    env.BUDDHALIVE_S1_VERIFY_OUT = verifyJsonPath;

    const proc = spawnSync(electronBinary, [DESKTOP_DIR], {
      cwd: DESKTOP_DIR,
      env,
      encoding: 'utf-8',
      timeout: 90000,
    });

    expect(proc.status, `Electron stderr: ${proc.stderr}`).toBe(0);
    expect(fs.existsSync(verifyJsonPath)).toBe(true);

    const report = JSON.parse(
      fs.readFileSync(verifyJsonPath, 'utf-8')
    ) as VerificationReportFile;

    expect(report.isPackaged).toBe(false);
    expect(report.payload.rendererIsolationOk).toBe(true);
    expect(report.payload.health.ok).toBe(true);
    expect(report.payload.health.journalMode).toBe('wal');
    expect(report.payload.health.foreignKeysEnabled).toBe(true);
    expect(report.payload.health.appliedMigrations).toContain(
      '001_bootstrap_app_settings'
    );
    expect(report.payload.health.readWriteProbeOk).toBe(true);
    expect(report.payload.updatedFpsJson).toBe('30');

    // Reopen the SQLite DB created by Electron to confirm durable write on disk
    const checkCtx = openSqliteDatabase({ baseDir: userDataDir });
    const saved = checkCtx.settingsRepo.get('overlay.fps_limit');
    expect(saved?.valueJson).toBe('30');
    checkCtx.close();
  }, 120000);

  it('opens better-sqlite3 from app.asar.unpacked and persists writes inside packaged Windows .exe', () => {
    expect(
      fs.existsSync(PACKAGED_EXE_PATH),
      `Expected packaged Windows executable at ${PACKAGED_EXE_PATH}. Run "pnpm pack:win-dir" first.`
    ).toBe(true);

    const asarPath = path.join(
      DESKTOP_DIR,
      'release',
      'win-unpacked',
      'resources',
      'app.asar'
    );
    const unpackedSqliteDir = path.join(
      DESKTOP_DIR,
      'release',
      'win-unpacked',
      'resources',
      'app.asar.unpacked',
      'node_modules',
      'better-sqlite3'
    );
    expect(fs.existsSync(asarPath)).toBe(true);
    expect(fs.existsSync(unpackedSqliteDir)).toBe(true);

    const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s1-elec-pkg-'));
    tempDirs.push(tempBase);

    const userDataDir = path.join(tempBase, 'appdata');
    const verifyJsonPath = path.join(tempBase, 'verify-packaged.json');

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    env.BUDDHALIVE_USER_DATA_DIR = userDataDir;
    env.BUDDHALIVE_S1_VERIFY_OUT = verifyJsonPath;

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
    ) as VerificationReportFile;

    expect(report.isPackaged).toBe(true);
    expect(report.payload.health.isPackaged).toBe(true);
    expect(report.payload.rendererIsolationOk).toBe(true);
    expect(report.payload.health.ok).toBe(true);
    expect(report.payload.health.journalMode).toBe('wal');
    expect(report.payload.health.foreignKeysEnabled).toBe(true);
    expect(report.payload.health.appliedMigrations).toContain(
      '001_bootstrap_app_settings'
    );
    expect(report.payload.health.settingsCount).toBeGreaterThanOrEqual(12);
    expect(report.payload.health.readWriteProbeOk).toBe(true);
    expect(report.payload.updatedFpsJson).toBe('30');

    // Reopen the SQLite DB written by the packaged Windows .exe to prove durable persistence
    const checkCtx = openSqliteDatabase({ baseDir: userDataDir });
    const saved = checkCtx.settingsRepo.get('overlay.fps_limit');
    expect(saved?.valueJson).toBe('30');
    checkCtx.close();
  }, 120000);
});
