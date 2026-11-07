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

describe('S5 Packaged Windows .exe Queue Controls & SQLite WAL Verification', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir && fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {}
      }
    }
  });

  it('runs packaged Windows 11 BuddhaLive Studio.exe and validates S5 Queue Settings & SQLite WAL persistence', () => {
    expect(
      fs.existsSync(PACKAGED_EXE_PATH),
      `Expected packaged Windows executable at ${PACKAGED_EXE_PATH}. Run "pnpm pack:win-dir" first.`
    ).toBe(true);

    const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s5-pkg-'));
    tempDirs.push(tempBase);

    const userDataDir = path.join(tempBase, 'appdata');
    const verifyJsonPath = path.join(tempBase, 'verify-s5-packaged.json');

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    env.BUDDHALIVE_USER_DATA_DIR = userDataDir;
    env.BUDDHALIVE_S2_VERIFY_OUT = verifyJsonPath;

    // 1. Khởi động bản đóng gói BuddhaLive Studio.exe
    const proc = spawnSync(PACKAGED_EXE_PATH, [], {
      cwd: path.dirname(PACKAGED_EXE_PATH),
      env,
      encoding: 'utf-8',
      timeout: 90000,
    });

    expect(proc.status, `Packaged .exe stderr: ${proc.stderr}`).toBe(0);
    expect(fs.existsSync(verifyJsonPath)).toBe(true);

    const report = JSON.parse(fs.readFileSync(verifyJsonPath, 'utf-8'));
    expect(report.isPackaged).toBe(true);
    expect(report.payload.health.ok).toBe(true);
    expect(report.payload.health.journalMode).toBe('wal');
    expect(report.payload.health.foreignKeysEnabled).toBe(true);

    // 2. Mở cơ sở dữ liệu được tạo bởi ứng dụng đóng gói
    const checkCtx = openSqliteDatabase({ baseDir: userDataDir });

    // Kiểm tra cài đặt S5: engine.queue_paused
    const pauseSetting = checkCtx.settingsRepo.get('engine.queue_paused');
    expect(pauseSetting).toBeDefined();
    expect(pauseSetting?.valueJson).toBe('false');

    // Cập nhật giá trị sang true
    checkCtx.settingsRepo.set('engine.queue_paused', true);
    expect(checkCtx.settingsRepo.get('engine.queue_paused')?.valueJson).toBe('true');

    // Đóng và kiểm tra sức khỏe
    const health = checkCtx.runStorageHealthCheck({ isPackaged: true });
    expect(health.ok).toBe(true);
    expect(health.settingsCount).toBe(13);
    checkCtx.close();
  });
});
