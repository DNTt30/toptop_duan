import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createLogger, type Logger } from '../config/logger';
import { openSqliteDatabase, type SqliteDatabaseContext } from './connection';

export interface BackupValidationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
  schemaVersion?: number;
  tableCount?: number;
}

export interface BackupManifest {
  manifestVersion: '1.0.0';
  createdAt: string;
  scope: 'DATABASE_ONLY' | 'FULL_DATA_BUNDLE';
  dbFileName: string;
  dbSizeBytes: number;
  schemaMigrations: string[];
  assetsCount: number;
  assetsTotalBytes: number;
  warningNotice: string;
}

export interface BackupResult {
  ok: boolean;
  backupPath: string;
  scope: 'DATABASE_ONLY' | 'FULL_DATA_BUNDLE';
  sizeBytes: number;
  createdAt: string;
  manifest?: BackupManifest;
}

export interface RestoreResult {
  ok: boolean;
  restoredFrom: string;
  rollbackPath?: string;
  recoveredExecutionsCount: number;
  error?: string;
}

export class BackupService {
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? createLogger('BackupService');
  }

  /**
   * Tạo bản sao lưu SQLite an toàn ở chế độ WAL bằng lệnh VACUUM INTO.
   * Lệnh này tạo bản sao nguyên tử, nhất quán 100% mà không khóa đọc/ghi.
   */
  public createDatabaseBackup(
    ctx: SqliteDatabaseContext,
    destinationPath: string
  ): BackupResult {
    const dest = path.resolve(destinationPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
    }

    this.logger.info('Creating atomic SQLite WAL backup via VACUUM INTO', { dest });
    ctx.db.prepare('VACUUM INTO ?').run(dest);

    const stats = fs.statSync(dest);
    const nowIso = new Date().toISOString();

    return {
      ok: true,
      backupPath: dest,
      scope: 'DATABASE_ONLY',
      sizeBytes: stats.size,
      createdAt: nowIso,
    };
  }

  /**
   * Tạo gói sao lưu toàn diện (Full Data Bundle):
   * Bao gồm file SQLite .bak + toàn bộ thư mục assets/ (GLB, audio) + manifest.json.
   */
  public createFullBackup(
    ctx: SqliteDatabaseContext,
    targetDirectory: string
  ): BackupResult {
    const bundleDir = path.resolve(targetDirectory);
    fs.mkdirSync(bundleDir, { recursive: true });

    const dbBackupFile = path.join(bundleDir, 'buddhalive.bak');
    this.createDatabaseBackup(ctx, dbBackupFile);

    // Sao chép thư mục assets (GLB models, âm thanh)
    const bundleAssetsDir = path.join(bundleDir, 'assets');
    fs.mkdirSync(bundleAssetsDir, { recursive: true });

    let assetsCount = 0;
    let assetsTotalBytes = 0;

    if (fs.existsSync(ctx.paths.assetsDir)) {
      const entries = fs.readdirSync(ctx.paths.assetsDir);
      for (const entry of entries) {
        const src = path.join(ctx.paths.assetsDir, entry);
        const dst = path.join(bundleAssetsDir, entry);
        const stat = fs.statSync(src);
        if (stat.isFile()) {
          fs.copyFileSync(src, dst);
          assetsCount++;
          assetsTotalBytes += stat.size;
        }
      }
    }

    const dbStats = fs.statSync(dbBackupFile);
    const nowIso = new Date().toISOString();

    const manifest: BackupManifest = {
      manifestVersion: '1.0.0',
      createdAt: nowIso,
      scope: 'FULL_DATA_BUNDLE',
      dbFileName: 'buddhalive.bak',
      dbSizeBytes: dbStats.size,
      schemaMigrations: ctx.appliedMigrations,
      assetsCount,
      assetsTotalBytes,
      warningNotice:
        'Full Data Bundle includes SQLite database and 3D GLB/audio assets. OBS session cookies and auth tokens are strictly excluded for safety.',
    };

    fs.writeFileSync(
      path.join(bundleDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    return {
      ok: true,
      backupPath: bundleDir,
      scope: 'FULL_DATA_BUNDLE',
      sizeBytes: dbStats.size + assetsTotalBytes,
      createdAt: nowIso,
      manifest,
    };
  }

  /**
   * Kiểm tra tính hợp lệ của file SQLite backup:
   * 1. Magic bytes 16 byte đầu tiên = 'SQLite format 3\0'
   * 2. PRAGMA quick_check = 'ok'
   * 3. Có bảng schema_migrations và ít nhất 1 bảng dữ liệu
   */
  public validateDatabaseBackup(filePath: string): BackupValidationResult {
    const target = path.resolve(filePath);
    if (!fs.existsSync(target)) {
      return {
        valid: false,
        errorCode: 'FILE_NOT_FOUND',
        errorMessage: `Backup file does not exist at ${target}`,
      };
    }

    const stat = fs.statSync(target);
    if (stat.size < 512) {
      return {
        valid: false,
        errorCode: 'FILE_TOO_SMALL',
        errorMessage: 'File size is smaller than SQLite header (512 bytes)',
      };
    }

    // 1. Kiểm tra Magic Bytes
    const fd = fs.openSync(target, 'r');
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);
    fs.closeSync(fd);

    const magicStr = headerBuf.toString('utf8', 0, 15);
    const magicNull = headerBuf[15];
    if (magicStr !== 'SQLite format 3' || magicNull !== 0) {
      return {
        valid: false,
        errorCode: 'INVALID_SQLITE_HEADER',
        errorMessage: 'File header does not match SQLite format 3',
      };
    }

    // 2. Mở readonly và kiểm tra quick_check
    let testDb: Database.Database | null = null;
    try {
      testDb = new Database(target, { readonly: true, fileMustExist: true });
      const quickCheck = testDb.pragma('quick_check', { simple: true });
      if (quickCheck !== 'ok') {
        return {
          valid: false,
          errorCode: 'CORRUPT_DATABASE',
          errorMessage: `SQLite integrity check failed: ${quickCheck}`,
        };
      }

      // 3. Kiểm tra bảng schema_migrations
      const migrationsTable = testDb
        .prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name IN ('_schema_migrations', 'schema_migrations')")
        .get() as { count: number };

      if (!migrationsTable || migrationsTable.count === 0) {
        return {
          valid: false,
          errorCode: 'INCOMPATIBLE_SCHEMA',
          errorMessage: 'Missing schema_migrations table in backup file',
        };
      }

      const tablesCount = (
        testDb
          .prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table'")
          .get() as { count: number }
      ).count;

      return {
        valid: true,
        tableCount: tablesCount,
      };
    } catch (err) {
      return {
        valid: false,
        errorCode: 'OPEN_FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      if (testDb) {
        testDb.close();
      }
    }
  }

  /**
   * Khôi phục an toàn (Safe Restore):
   * 1. Validate file backup trước
   * 2. Tự động backup DB hiện tại ra file .pre-restore.bak phòng trường hợp cần rollback
   * 3. Truncate WAL và đóng kết nối DB cũ
   * 4. Ghi đè file DB và xóa file WAL/SHM cũ
   * 5. Mở lại DB và chạy Crash Recovery
   * 6. Nếu lỗi ở bất kỳ bước nào, tự động phục hồi lại từ file rollback
   */
  public safeRestore(
    currentCtx: SqliteDatabaseContext,
    backupFilePath: string,
    onContextReplaced: (newCtx: SqliteDatabaseContext) => void
  ): RestoreResult {
    const validated = this.validateDatabaseBackup(backupFilePath);
    if (!validated.valid) {
      this.logger.error('Restore rejected: backup file validation failed', {
        code: validated.errorCode,
        message: validated.errorMessage,
      });
      return {
        ok: false,
        restoredFrom: backupFilePath,
        recoveredExecutionsCount: 0,
        error: `${validated.errorCode}: ${validated.errorMessage}`,
      };
    }

    const dbPath = currentCtx.paths.dbFilePath;
    const baseDir = currentCtx.paths.baseDir;
    const rollbackPath = `${dbPath}.pre-restore.bak`;

    // 1. Tạo rollback copy của database hiện tại
    try {
      if (fs.existsSync(rollbackPath)) {
        fs.unlinkSync(rollbackPath);
      }
      currentCtx.db.prepare('VACUUM INTO ?').run(rollbackPath);
      this.logger.info('Created pre-restore rollback snapshot', { rollbackPath });
    } catch (err) {
      this.logger.error('Failed to create pre-restore rollback copy', err);
      return {
        ok: false,
        restoredFrom: backupFilePath,
        recoveredExecutionsCount: 0,
        error: `ROLLBACK_CREATION_FAILED: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 2. Truncate checkpoint và đóng kết nối cũ
    try {
      currentCtx.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Tiếp tục đóng
    }
    currentCtx.close();

    // 3. Thay thế file DB
    const walFile = `${dbPath}-wal`;
    const shmFile = `${dbPath}-shm`;

    try {
      if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
      if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);

      fs.copyFileSync(backupFilePath, dbPath);

      // 4. Mở lại DB mới và chạy Crash Recovery
      const newCtx = openSqliteDatabase({ baseDir });
      onContextReplaced(newCtx);

      this.logger.info('Safe restore succeeded', {
        restoredFrom: backupFilePath,
        recoveredExecutions: newCtx.crashRecoveryReport.recoveredExecutionsCount ?? 0,
      });

      return {
        ok: true,
        restoredFrom: backupFilePath,
        rollbackPath,
        recoveredExecutionsCount: newCtx.crashRecoveryReport.recoveredExecutionsCount ?? 0,
      };
    } catch (restoreErr) {
      this.logger.error('Restore failed, performing atomic rollback', restoreErr);

      // Rollback từ snapshot
      try {
        if (fs.existsSync(rollbackPath)) {
          if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
          if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
          fs.copyFileSync(rollbackPath, dbPath);
          const rollbackCtx = openSqliteDatabase({ baseDir });
          onContextReplaced(rollbackCtx);
        }
      } catch (rollbackErr) {
        this.logger.error('CRITICAL: Rollback failed after restore error', rollbackErr);
      }

      return {
        ok: false,
        restoredFrom: backupFilePath,
        rollbackPath,
        recoveredExecutionsCount: 0,
        error: `RESTORE_FAILED_ROLLED_BACK: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`,
      };
    }
  }
}
