import {
  StorageHealthReportSchema,
  type StorageHealthReport,
} from '@buddhalive/shared';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { resolveUserDataPaths, type UserDataPaths } from '../config/paths';
import { runMigrations } from './migrations';
import { AnimationRepository } from './repositories/animation.repository';
import { AppSettingRepository } from './repositories/app-setting.repository';
import { CharacterRepository } from './repositories/character.repository';
import { EventExecutionRepository } from './repositories/event-execution.repository';
import { GiftRuleRepository } from './repositories/gift-rule.repository';
import { LiveEventRepository } from './repositories/live-event.repository';

export interface OpenDatabaseOptions {
  baseDir?: string;
  copySeedAssets?: boolean;
}

export interface SqliteDatabaseContext {
  readonly db: Database.Database;
  readonly paths: UserDataPaths;
  readonly appliedMigrations: string[];
  readonly settingsRepo: AppSettingRepository;
  readonly charRepo: CharacterRepository;
  readonly animRepo: AnimationRepository;
  readonly ruleRepo: GiftRuleRepository;
  readonly eventRepo: LiveEventRepository;
  readonly execRepo: EventExecutionRepository;
  readonly crashRecoveryReport: {
    cancelledCount: number;
    cancelledIds: string[];
    queuedCount: number;
    recoveredEventsCount?: number;
    recoveredExecutionsCount?: number;
  };
  runStorageHealthCheck: (runtimeInfo?: {
    isPackaged?: boolean;
    electronVersion?: string | null;
  }) => StorageHealthReport;
  close: () => void;
}

function ensureSeedAssets(assetsDir: string): void {
  const targetGlb = path.join(assetsDir, 'sample-character.glb');
  if (!fs.existsSync(targetGlb)) {
    // Check known locations for fixture / bundled glb
    const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
    const candidates = [
      path.resolve(__dirname, '..', 'bundled-assets', 'sample-character.glb'),
      path.resolve(__dirname, '..', '..', 'bundled-assets', 'sample-character.glb'),
      path.resolve(process.cwd(), 'bundled-assets', 'sample-character.glb'),
      resourcesPath ? path.resolve(resourcesPath, 'bundled-assets', 'sample-character.glb') : '',
      resourcesPath ? path.resolve(resourcesPath, 'app.asar.unpacked', 'bundled-assets', 'sample-character.glb') : '',
      path.resolve(__dirname, '..', '..', '..', 'tests', 'fixtures', 'assets', 'sample-character.glb'),
      path.resolve(__dirname, '..', '..', 'fixtures', 'assets', 'sample-character.glb'),
      path.resolve(process.cwd(), 'tests', 'fixtures', 'assets', 'sample-character.glb'),
    ].filter(Boolean);
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        fs.mkdirSync(assetsDir, { recursive: true });
        fs.copyFileSync(cand, targetGlb);
        break;
      }
    }
  }
}

export function openSqliteDatabase(
  options: OpenDatabaseOptions = {}
): SqliteDatabaseContext {
  const paths = resolveUserDataPaths(options.baseDir);
  const db = new Database(paths.dbFilePath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const appliedMigrations = runMigrations(db);
  const settingsRepo = new AppSettingRepository(db);
  const charRepo = new CharacterRepository(db);
  const animRepo = new AnimationRepository(db);
  const ruleRepo = new GiftRuleRepository(db);
  const eventRepo = new LiveEventRepository(db);
  const execRepo = new EventExecutionRepository(db);

  // T-07: Chạy Crash Recovery trong transaction SQLite nguyên tử ngay khi mở database
  const crashRecoveryReport = execRepo.runStartupCrashRecovery();

  if (options.copySeedAssets !== false) {
    ensureSeedAssets(paths.assetsDir);
  }

  let isClosed = false;

  const runStorageHealthCheck = (
    runtimeInfo: {
      isPackaged?: boolean;
      electronVersion?: string | null;
    } = {}
  ): StorageHealthReport => {
    const journalMode = String(
      db.pragma('journal_mode', { simple: true })
    ).toLowerCase();
    const fkValue = Number(db.pragma('foreign_keys', { simple: true }));

    // Perform a real write + read-back + restore transaction on disk
    let readWriteProbeOk = false;
    let readWriteProbeValue = '';

    const probeTx = db.transaction(() => {
      const original = settingsRepo.get('overlay.fps_limit');
      if (!original) {
        throw new Error('Missing seed setting overlay.fps_limit');
      }
      const probeTarget = original.valueJson === '60' ? '30' : '60';
      settingsRepo.updateValue('overlay.fps_limit', probeTarget);
      const afterWrite = settingsRepo.get('overlay.fps_limit');
      if (!afterWrite || afterWrite.valueJson !== probeTarget) {
        throw new Error('Read-after-write mismatch on app_settings');
      }
      // Restore original setting cleanly
      const restored = settingsRepo.updateValue(
        'overlay.fps_limit',
        original.valueJson
      );
      readWriteProbeOk = restored.valueJson === original.valueJson;
      readWriteProbeValue = `wrote=${probeTarget},restored=${restored.valueJson}`;
    });
    probeTx();

    const settingsCount = settingsRepo.listAll().length;

    return StorageHealthReportSchema.parse({
      ok:
        journalMode === 'wal' &&
        fkValue === 1 &&
        appliedMigrations.length >= 2 &&
        readWriteProbeOk,
      dbFilePath: paths.dbFilePath,
      journalMode,
      foreignKeysEnabled: fkValue === 1,
      appliedMigrations,
      settingsCount,
      readWriteProbeOk,
      readWriteProbeValue,
      isPackaged: Boolean(runtimeInfo.isPackaged),
      electronVersion: runtimeInfo.electronVersion ?? process.versions.electron ?? null,
      nodeVersion: process.versions.node,
    });
  };

  const close = (): void => {
    if (!isClosed) {
      isClosed = true;
      db.close();
    }
  };

  return {
    db,
    paths,
    appliedMigrations,
    settingsRepo,
    charRepo,
    animRepo,
    ruleRepo,
    eventRepo,
    execRepo,
    crashRecoveryReport,
    runStorageHealthCheck,
    close,
  };
}
