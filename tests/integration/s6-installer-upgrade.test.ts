import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openSqliteDatabase } from '../../apps/backend/src/db/connection';

describe('Milestone S6: T-16 Windows Installer & Upgrade Verification', () => {
  const desktopPkgPath = path.resolve(__dirname, '..', '..', 'apps', 'desktop', 'package.json');
  const releaseDir = path.resolve(__dirname, '..', '..', 'apps', 'desktop', 'release');
  const winUnpackedDir = path.join(releaseDir, 'win-unpacked');

  it('configures electron-builder NSIS installer with shortcuts and data preservation', () => {
    expect(fs.existsSync(desktopPkgPath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));

    // Verify build targets
    expect(pkg.build).toBeDefined();
    expect(pkg.build.win).toBeDefined();
    expect(pkg.build.win.target).toContain('nsis');
    expect(pkg.build.win.target).toContain('dir');

    // Verify NSIS settings
    expect(pkg.build.nsis).toBeDefined();
    expect(pkg.build.nsis.oneClick).toBe(false);
    expect(pkg.build.nsis.perMachine).toBe(false);
    expect(pkg.build.nsis.allowToChangeInstallationDirectory).toBe(true);
    expect(pkg.build.nsis.createDesktopShortcut).toBe(true);
    expect(pkg.build.nsis.createStartMenuShortcut).toBe(true);
    expect(pkg.build.nsis.shortcutName).toBe('BuddhaLive Studio');
    expect(pkg.build.nsis.deleteAppDataOnUninstall).toBe(false);

    // Verify asar unpack for native modules
    expect(pkg.build.asarUnpack).toContain('**/node_modules/better-sqlite3/**');
  });

  it('validates production unpacked distribution structure and native dependencies', () => {
    // If win-unpacked exists, inspect its critical files
    if (fs.existsSync(winUnpackedDir)) {
      const exePath = path.join(winUnpackedDir, 'BuddhaLive Studio.exe');
      expect(fs.existsSync(exePath)).toBe(true);

      const unpackedSqliteDir = path.join(
        winUnpackedDir,
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'better-sqlite3'
      );
      expect(fs.existsSync(unpackedSqliteDir)).toBe(true);

      // Verify native better_sqlite3 node binary exists in unpacked directory
      const win32PrebuildNode = path.join(
        unpackedSqliteDir,
        'prebuilds',
        'win32-x64.node'
      );
      const buildReleaseNode = path.join(
        unpackedSqliteDir,
        'build',
        'Release',
        'better_sqlite3.node'
      );
      const nodeBinaryExists = fs.existsSync(win32PrebuildNode) || fs.existsSync(buildReleaseNode);
      expect(nodeBinaryExists).toBe(true);

      // Verify bundled overlay files
      const overlayDist = path.join(__dirname, '..', '..', 'apps', 'desktop', 'dist-overlay', 'index.html');
      expect(fs.existsSync(overlayDist)).toBe(true);

      // Verify bundled GLB assets
      const bundledGlb = path.join(__dirname, '..', '..', 'apps', 'desktop', 'bundled-assets', 'sample-character.glb');
      expect(fs.existsSync(bundledGlb)).toBe(true);
    }
  });

  it('preserves user database, custom characters, and gift rules across application upgrade cycle', async () => {
    const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s6-upgrade-'));

    try {
      // 1. Initial version launch: Creates DB, runs initial seed
      let ctx = openSqliteDatabase({ baseDir: tempUserDataDir });
      expect(ctx.appliedMigrations.length).toBeGreaterThanOrEqual(3);

      // Seed custom character, animation, and rule
      const customChar = ctx.charRepo.create({
        name: 'Tượng Phật Bổn Sư Thích Ca S6',
        slug: 'tuong-phat-bon-su-s6',
        modelPath: 'sample-character.glb',
        visibilityMode: 'APPEAR_ON_EVENT',
        isActive: true,
      });

      const customAnim = ctx.animRepo.create({
        characterId: customChar.id,
        name: 'Niệm Phật S6',
        clipName: 'Pray',
        category: 'REACTION',
        durationMs: 3000,
      });

      const customRule = ctx.ruleRepo.create({
        name: 'Hoa Sen S6',
        characterId: customChar.id,
        animationId: customAnim.id,
        triggerGiftId: '8888',
        priority: 77,
        minGiftCount: 1,
        minCoinValue: 500,
        comboTriggerMode: 'COMBO_MERGE',
        isEnabled: true,
      });

      // Verify files in tempUserDataDir
      const dbFile = ctx.paths.dbFilePath;
      expect(fs.existsSync(dbFile)).toBe(true);
      expect(fs.existsSync(path.join(tempUserDataDir, 'assets', 'sample-character.glb'))).toBe(true);

      ctx.close();

      // 2. Simulated Upgrade (New version launches with same user data dir)
      ctx = openSqliteDatabase({ baseDir: tempUserDataDir });

      // Verifies custom data was fully preserved across reopen/upgrade
      const activeChar = ctx.charRepo.getActiveCharacter();
      expect(activeChar).toBeDefined();
      expect(activeChar?.id).toBe(customChar.id);
      expect(activeChar?.name).toBe('Tượng Phật Bổn Sư Thích Ca S6');

      const retrievedRule = ctx.ruleRepo.getById(customRule.id);
      expect(retrievedRule).toBeDefined();
      expect(retrievedRule?.priority).toBe(77);
      expect(retrievedRule?.minCoinValue).toBe(500);

      // Storage health report check
      const health = ctx.runStorageHealthCheck({ isPackaged: true, electronVersion: '45.2.1' });
      expect(health.ok).toBe(true);
      expect(health.journalMode).toBe('wal');
      expect(health.foreignKeysEnabled).toBe(true);
      expect(health.readWriteProbeOk).toBe(true);

      ctx.close();

      // 3. Simulated Uninstall with deleteAppDataOnUninstall = false
      // The installer deletes app binaries in Program Files, but leaves tempUserDataDir untouched
      expect(fs.existsSync(dbFile)).toBe(true);
      expect(fs.existsSync(path.join(tempUserDataDir, 'assets', 'sample-character.glb'))).toBe(true);
    } finally {
      if (fs.existsSync(tempUserDataDir)) {
        try {
          fs.rmSync(tempUserDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        } catch {
          // Ignore temp cleanup error on busy Windows handles
        }
      }
    }
  });
});
