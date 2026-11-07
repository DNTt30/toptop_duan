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

describe('S4 Packaged Windows .exe Multi-Character & Overlay Production Verification', () => {
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

  it('runs packaged Windows 11 BuddhaLive Studio.exe and validates production assets & SQLite integrity', () => {
    expect(
      fs.existsSync(PACKAGED_EXE_PATH),
      `Expected packaged Windows executable at ${PACKAGED_EXE_PATH}. Run "pnpm pack:win-dir" first.`
    ).toBe(true);

    const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s4-pkg-'));
    tempDirs.push(tempBase);

    const userDataDir = path.join(tempBase, 'appdata');
    const verifyJsonPath = path.join(tempBase, 'verify-s4-packaged.json');

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    env.BUDDHALIVE_USER_DATA_DIR = userDataDir;
    env.BUDDHALIVE_S2_VERIFY_OUT = verifyJsonPath;

    // Khởi động bản đóng gói BuddhaLive Studio.exe
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

    // Mở lại DB được tạo bởi ứng dụng đóng gói
    const checkCtx = openSqliteDatabase({ baseDir: userDataDir });

    // 1. Kiểm tra nhân vật mặc định
    const activeChar = checkCtx.charRepo.getActiveCharacter();
    expect(activeChar).not.toBeNull();
    expect(activeChar?.isActive).toBe(true);

    // 2. Thêm nhân vật mới và kích hoạt trong môi trường packaged
    const newChar = checkCtx.charRepo.create({
      name: 'Phật Dược Sư',
      slug: 'duoc-su',
      modelPath: 'sample-character.glb',
      scale: 1.1,
      isActive: false,
    });
    expect(newChar.id).toBeDefined();

    checkCtx.charRepo.setActive(newChar.id);
    expect(checkCtx.charRepo.getActiveCharacter()?.id).toBe(newChar.id);

    // 3. Tạo hoạt ảnh và quy tắc quà
    const anim = checkCtx.animRepo.create({
      characterId: newChar.id,
      name: 'Dâng Thuốc Cứu Khổ',
      clipName: 'Pray',
      durationMs: 3000,
    });
    expect(anim.id).toBeDefined();

    const rule = checkCtx.ruleRepo.create({
      name: 'Quy tắc Quà Dược Sư',
      characterId: newChar.id,
      animationId: anim.id,
      triggerGiftId: 'healing_lotus',
      minGiftCount: 2,
      priority: 35,
    });
    expect(rule.id).toBeDefined();

    // 4. Kiểm tra xóa hoạt ảnh bị chặn bởi Foreign Key RESTRICT
    const deleteAnimRes = checkCtx.animRepo.delete(anim.id);
    expect(deleteAnimRes.ok).toBe(false);
    expect(deleteAnimRes.error).toBe('ANIMATION_REFERENCED_BY_GIFT_RULES');

    // 5. Kiểm tra tài nguyên mẫu sample-character.glb tồn tại trong assetsDir của packaged app
    const assetFile = path.join(checkCtx.paths.assetsDir, 'sample-character.glb');
    expect(fs.existsSync(assetFile)).toBe(true);

    checkCtx.close();
  }, 120000);
});
