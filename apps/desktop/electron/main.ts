import {
  AssetService,
  BackupService,
  BuddhaServer,
  createLogger,
  DiagnosticsService,
  ElectronSafeStorageCipher,
  generateSecretToken,
  LiveConfigService,
  NodeDevSecretCipher,
  openSqliteDatabase,
  OverlaySessionStore,
  toExecutionSummary,
  type SecretCipher,
  type SqliteDatabaseContext,
} from '@buddhalive/backend';
import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

let dbContext: SqliteDatabaseContext | null = null;
let buddhaServer: BuddhaServer | null = null;
let mainWindow: BrowserWindow | null = null;

function resolveDesktopBaseDir(): string {
  const envOverride = process.env.BUDDHALIVE_USER_DATA_DIR?.trim();
  if (envOverride) {
    return path.resolve(envOverride);
  }
  return path.join(app.getPath('appData'), 'BuddhaLiveStudio');
}

const baseDir = resolveDesktopBaseDir();
const logDir = path.join(baseDir, 'logs');
try {
  fs.mkdirSync(logDir, { recursive: true });
} catch {}
const logFilePath = path.join(logDir, 'electron-main.log');

const fileAndConsoleSink: (record: any) => void = (rec) => {
  const payload = rec.data !== undefined ? ` ${JSON.stringify(rec.data)}` : '';
  const line = `[${rec.time}] ${rec.level.toUpperCase()} ${rec.scope}: ${rec.message}${payload}\n`;
  try {
    fs.appendFileSync(logFilePath, line, 'utf-8');
  } catch {}
  console.log(line.trimEnd());
};

const logger = createLogger('ElectronMain', fileAndConsoleSink);

process.on('uncaughtException', (err) => {
  logger.error('CRITICAL UNCAUGHT EXCEPTION:', err instanceof Error ? { message: err.message, stack: err.stack } : String(err));
});
process.on('unhandledRejection', (reason) => {
  logger.error('CRITICAL UNHANDLED REJECTION:', reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason));
});

function resolveOverlayStaticDir(): string {
  // 1. In packaged or build folder
  const localDist = path.join(__dirname, '..', 'dist-overlay');
  if (fs.existsSync(localDist)) return localDist;

  // 2. In monorepo dev workspace
  const workspaceDist = path.resolve(__dirname, '..', '..', 'overlay', 'dist');
  if (fs.existsSync(workspaceDist)) return workspaceDist;

  return localDist;
}

function createCipher(): SecretCipher {
  const devCipher = new NodeDevSecretCipher();
  const canUseDpapi = safeStorage && safeStorage.isEncryptionAvailable();

  if (canUseDpapi) {
    return new ElectronSafeStorageCipher(
      (plain: Buffer) => safeStorage.encryptString(plain.toString('utf8')),
      (encrypted: Buffer) => Buffer.from(safeStorage.decryptString(encrypted), 'utf8')
    );
  }
  return devCipher;
}

function registerIpcHandlers(
  ctx: SqliteDatabaseContext,
  server: BuddhaServer,
  verifyOutPath: string | undefined
): void {
  // S1 IPC
  ipcMain.handle('s1:get-storage-health', () => {
    return ctx.runStorageHealthCheck({
      isPackaged: app.isPackaged,
      electronVersion: process.versions.electron ?? null,
    });
  });

  ipcMain.handle('s1:update-fps-limit', (_event, fps: unknown) => {
    if (fps !== 30 && fps !== 60) {
      throw new Error('INVALID_FPS_LIMIT: Only 30 or 60 is allowed');
    }
    return ctx.settingsRepo.updateValue('overlay.fps_limit', JSON.stringify(fps));
  });

  ipcMain.handle('s1:verification-complete', (_event, payload: unknown) => {
    if (verifyOutPath) {
      fs.mkdirSync(path.dirname(verifyOutPath), { recursive: true });
      fs.writeFileSync(
        verifyOutPath,
        JSON.stringify(
          {
            verifiedAt: new Date().toISOString(),
            isPackaged: app.isPackaged,
            execPath: process.execPath,
            payload,
          },
          null,
          2
        ),
        'utf-8'
      );
      setTimeout(() => {
        app.quit();
      }, 50);
    }
  });

  // S2 IPC
  ipcMain.handle('s2:get-server-info', () => {
    return {
      overlayUrl: 'http://127.0.0.1:3721/overlay',
      port: 3721,
    };
  });

  ipcMain.handle('s2:get-manager-state', () => {
    return server.buildManagerStateSnapshot();
  });

  ipcMain.handle('s2:trigger-demo-gift', (_event, params: {
    senderName: string;
    giftCount?: number;
    externalEventId?: string | null;
  }) => {
    if (server.liveManager.isLiveActive()) {
      throw new Error('DEMO_BLOCKED_DURING_LIVE_SESSION: Không thể phát sự kiện Demo khi phiên kết nối LIVE đang hoạt động.');
    }
    return server.engine.triggerDemoGift(params);
  });

  ipcMain.handle('s2:approve-overlay-pair', (_event, params: { pairingId: string; code: string }) => {
    const ok = server.pairingManager.approve(params.pairingId, params.code);
    return { ok };
  });

  ipcMain.handle('s2:revoke-overlay-sessions', () => {
    const count = server.sessionStore.revokeAll();
    return { ok: true, count };
  });

  // S4 IPC: Multi-Character Management, Animation & Gift Rules
  const assetService = new AssetService(ctx.paths.assetsDir);

  // Characters
  ipcMain.handle('s4:list-characters', () => {
    return ctx.charRepo.listAll();
  });

  ipcMain.handle('s4:create-character', (_event, params: any) => {
    return ctx.charRepo.create(params);
  });

  ipcMain.handle('s4:update-character', (_event, { id, data }: { id: string; data: any }) => {
    return ctx.charRepo.update(id, data);
  });

  ipcMain.handle('s4:set-active-character', (_event, id: string) => {
    return ctx.charRepo.setActive(id);
  });

  ipcMain.handle('s4:delete-character', (_event, id: string) => {
    return ctx.charRepo.delete(id);
  });

  // Assets & GLB
  ipcMain.handle(
    's4:import-glb-asset',
    (_event, params: { filePath?: string; fileBufferBase64?: string; originalName?: string }) => {
      let buffer: Buffer;
      let origName = params.originalName;
      if (params.fileBufferBase64) {
        buffer = Buffer.from(params.fileBufferBase64, 'base64');
      } else if (params.filePath) {
        buffer = fs.readFileSync(params.filePath);
        if (!origName) origName = path.basename(params.filePath);
      } else {
        return { ok: false, clipNames: [], error: 'NO_FILE_OR_BUFFER_PROVIDED' };
      }
      return assetService.saveGlbAsset(buffer, origName);
    }
  );

  ipcMain.handle('s4:pick-glb-file', async () => {
    const dialogRes = await dialog.showOpenDialog({
      title: 'Chọn mô hình 3D GLB',
      properties: ['openFile'],
      filters: [{ name: 'glTF 2.0 Binary (*.glb)', extensions: ['glb'] }],
    });

    if (dialogRes.canceled || dialogRes.filePaths.length === 0) {
      return null;
    }

    const selectedPath = dialogRes.filePaths[0];
    if (!selectedPath) return null;
    const buffer = fs.readFileSync(selectedPath);
    return assetService.saveGlbAsset(buffer, path.basename(selectedPath));
  });

  ipcMain.handle('s4:inspect-glb-asset', (_event, fileName: string) => {
    return assetService.inspectGlbAsset(fileName);
  });

  // Animations
  ipcMain.handle('s4:list-animations', (_event, characterId: string) => {
    return ctx.animRepo.listByCharacterId(characterId);
  });

  ipcMain.handle('s4:create-animation', (_event, params: any) => {
    return ctx.animRepo.create(params);
  });

  ipcMain.handle('s4:update-animation', (_event, { id, data }: { id: string; data: any }) => {
    return ctx.animRepo.update(id, data);
  });

  ipcMain.handle('s4:toggle-animation', (_event, { id, isEnabled }: { id: string; isEnabled?: boolean }) => {
    return ctx.animRepo.toggle(id, isEnabled);
  });

  ipcMain.handle('s4:delete-animation', (_event, id: string) => {
    return ctx.animRepo.delete(id);
  });

  // Gift Rules
  ipcMain.handle('s4:list-gift-rules', (_event, characterId?: string) => {
    return characterId ? ctx.ruleRepo.listByCharacterId(characterId) : ctx.ruleRepo.listAll();
  });

  ipcMain.handle('s4:create-gift-rule', (_event, params: any) => {
    return ctx.ruleRepo.create(params);
  });

  ipcMain.handle('s4:update-gift-rule', (_event, { id, data }: { id: string; data: any }) => {
    return ctx.ruleRepo.update(id, data);
  });

  ipcMain.handle('s4:toggle-gift-rule', (_event, { id, isEnabled }: { id: string; isEnabled?: boolean }) => {
    return ctx.ruleRepo.toggle(id, isEnabled);
  });

  ipcMain.handle('s4:delete-gift-rule', (_event, id: string) => {
    const ok = ctx.ruleRepo.delete(id);
    return { ok };
  });

  // S5 IPC: Queue Controls & Multi-Scenario Demo Simulator (T-14, T-15)
  ipcMain.handle(
    's5:queue-control',
    (_event, params: { action: 'PAUSE' | 'RESUME' | 'SKIP' | 'CLEAR'; reason?: string }) => {
      const { action, reason } = params;
      let result;
      if (action === 'PAUSE') {
        server.engine.pauseQueue();
        result = { action, success: true, affectedCount: 0, engineStatus: server.engine.getEngineStatus(), isPaused: true };
      } else if (action === 'RESUME') {
        server.engine.resumeQueue();
        result = { action, success: true, affectedCount: 0, engineStatus: server.engine.getEngineStatus(), isPaused: false };
      } else if (action === 'SKIP') {
        const res = server.engine.skipCurrent(reason, { barrierMs: 150 });
        result = {
          action,
          success: res.success,
          affectedCount: res.success ? 1 : 0,
          engineStatus: server.engine.getEngineStatus(),
          isPaused: server.engine.getIsPaused(),
          message: res.success ? `Skipped execution ${res.skippedId}` : 'No active execution to skip',
        };
      } else {
        const res = server.engine.clearQueue(reason);
        result = {
          action,
          success: true,
          affectedCount: res.clearedCount,
          engineStatus: server.engine.getEngineStatus(),
          isPaused: server.engine.getIsPaused(),
          message: `Cleared ${res.clearedCount} executions from queue`,
        };
      }
      server.broadcastManagerState();
      return result;
    }
  );

  ipcMain.handle('s5:run-demo-scenario', async (_event, scenario: any) => {
    if (server.liveManager.isLiveActive()) {
      throw new Error('DEMO_BLOCKED_DURING_LIVE_SESSION: Không thể khởi chạy kịch bản Demo khi phiên kết nối LIVE đang hoạt động.');
    }
    const res = await server.demoSimulator.runScenario(scenario);
    server.broadcastManagerState();
    return res;
  });

  ipcMain.handle('s5:stop-demo-scenario', () => {
    server.demoSimulator.stopScenario();
    server.broadcastManagerState();
    return { ok: true };
  });

  ipcMain.handle('s5:get-queue-metrics', () => {
    return {
      metrics: server.engine.getQueueMetrics(),
      engineStatus: server.engine.getEngineStatus(),
      isPaused: server.engine.getIsPaused(),
      queued: ctx.execRepo.listQueued(30).map(toExecutionSummary),
    };
  });

  // S6 IPC: Backup, Restore & Diagnostics (T-18)
  const backupService = new BackupService(logger.child('BackupService'));
  const diagnosticsService = new DiagnosticsService();

  ipcMain.handle('s6:create-backup', async (_event, params?: { scope?: 'DATABASE_ONLY' | 'FULL_DATA_BUNDLE' }) => {
    const scope = params?.scope ?? 'DATABASE_ONLY';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultBackupsDir = path.join(ctx.paths.baseDir, 'backups');
    fs.mkdirSync(defaultBackupsDir, { recursive: true });

    if (scope === 'FULL_DATA_BUNDLE') {
      const targetDir = path.join(defaultBackupsDir, `buddhalive-bundle-${timestamp}`);
      return backupService.createFullBackup(ctx, targetDir);
    } else {
      const targetFile = path.join(defaultBackupsDir, `buddhalive-db-${timestamp}.bak`);
      return backupService.createDatabaseBackup(ctx, targetFile);
    }
  });

  ipcMain.handle('s6:pick-and-restore-backup', async () => {
    const dialogRes = await dialog.showOpenDialog({
      title: 'Chọn tệp sao lưu SQLite (.bak)',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Backup (*.bak;*.db)', extensions: ['bak', 'db'] }],
    });

    if (dialogRes.canceled || dialogRes.filePaths.length === 0) {
      return { canceled: true };
    }

    const selectedFile = dialogRes.filePaths[0];
    if (!selectedFile) return { canceled: true };

    const restoreRes = backupService.safeRestore(ctx, selectedFile, (newCtx) => {
      ctx = newCtx;
      server.replaceDbContext(newCtx);
    });

    return { canceled: false, result: restoreRes };
  });

  ipcMain.handle('s6:get-diagnostics', () => {
    return diagnosticsService.generateReport(ctx, server.engine, server.sessionStore);
  });

  ipcMain.handle('s6:export-diagnostics', async () => {
    const report = diagnosticsService.generateReport(ctx, server.engine, server.sessionStore);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultPath = path.join(ctx.paths.baseDir, `diagnostics-report-${timestamp}.json`);

    const dialogRes = await dialog.showSaveDialog({
      title: 'Lưu báo cáo chẩn đoán',
      defaultPath,
      filters: [{ name: 'JSON Document (*.json)', extensions: ['json'] }],
    });

    if (dialogRes.canceled || !dialogRes.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(dialogRes.filePath, JSON.stringify(report, null, 2), 'utf8');
    return { canceled: false, savedPath: dialogRes.filePath };
  });

  // S9 IPC: Live Provider Configuration & Status (T-30 & T-31)
  ipcMain.handle('s9:get-live-config', () => {
    return server.liveConfigService.getConfig();
  });

  ipcMain.handle('s9:save-live-config', (_event, config: unknown) => {
    const res = server.liveConfigService.saveConfig(config);
    server.broadcastManagerState();
    return res;
  });

  ipcMain.handle('s9:save-live-api-key', (_event, payload: unknown) => {
    return server.liveConfigService.saveApiKey(payload);
  });

  ipcMain.handle('s9:clear-live-api-key', (_event, provider: 'EULERSTREAM') => {
    return server.liveConfigService.clearApiKey(provider);
  });

  ipcMain.handle('s9:get-live-connection-summary', () => {
    return server.liveManager.getSummary();
  });

  ipcMain.handle('s9:connect-live', async () => {
    const res = await server.liveManager.connect();
    server.broadcastManagerState();
    return res;
  });

  ipcMain.handle('s9:disconnect-live', async () => {
    const res = await server.liveManager.disconnect();
    server.broadcastManagerState();
    return res;
  });

  ipcMain.handle('s9:get-live-diagnostics', () => {
    return server.liveManager.getDiagnostics(server.getObsStatus());
  });

  ipcMain.handle('s9:export-live-diagnostics', (_event, format?: 'markdown' | 'json') => {
    return server.liveManager.exportDiagnosticsReport(format ?? 'markdown', server.getObsStatus());
  });

  ipcMain.handle('s9:get-live-traces', () => {
    return server.liveManager.getRecentTraces();
  });
}

function createMainWindow(isVerifyMode: boolean): BrowserWindow {
  const preloadPath = path.join(__dirname, 'preload.cjs');
  const win = new BrowserWindow({
    width: 1040,
    height: 720,
    show: false,
    title: 'BuddhaLive Studio — Desktop Manager (Windows 11)',
    backgroundColor: '#090d16',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      additionalArguments: isVerifyMode ? ['--bls-s1-verify', '--bls-s2-verify'] : [],
    },
  });

  win.once('ready-to-show', () => {
    if (!isVerifyMode) {
      win.show();
      win.focus();
    }
  });

  if (!isVerifyMode) {
    setTimeout(() => {
      if (!win.isDestroyed() && !win.isVisible()) {
        win.show();
        win.focus();
      }
    }, 800);
  }

  win.on('closed', () => {
    logger.info('MainWindow closed');
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  win.on('close', () => {
    logger.info('MainWindow close event triggered');
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error(`Renderer did-fail-load: ${validatedURL} [${errorCode}] ${errorDescription}`);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer process gone:', details);
  });

  // Security Layer 5: Block external navigation and popup windows
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const indexHtmlPath = path.join(__dirname, '..', 'dist-renderer', 'index.html');
  void win.loadFile(indexHtmlPath);

  return win;
}

const verifyOutPath =
  process.env.BUDDHALIVE_S2_VERIFY_OUT?.trim() ||
  process.env.BUDDHALIVE_S1_VERIFY_OUT?.trim();
const isVerifyMode = Boolean(verifyOutPath);

if (isVerifyMode) {
  app.commandLine.appendSwitch('headless');
  app.commandLine.appendSwitch('disable-gpu');
}

const gotTheLock = isVerifyMode || app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.warn('Another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (!isVerifyMode) {
      mainWindow = createMainWindow(isVerifyMode);
    }
  });

  void app
    .whenReady()
    .then(async () => {
      const baseDir = resolveDesktopBaseDir();
      dbContext = openSqliteDatabase({ baseDir });

      // Khởi tạo DPAPI Cipher và Session Store
      const cipher = createCipher();
      const sessionFile = path.join(dbContext.paths.securityDir, 'overlay-sessions.dat');
      const sessionStore = new OverlaySessionStore(
        sessionFile,
        cipher,
        logger.child('OverlaySessions')
      );

      // Sinh managerToken ngẫu nhiên trong RAM (architecture.md §3 — Lớp 2)
      const managerToken = generateSecretToken();

      // Khởi tạo BuddhaServer trên 127.0.0.1:3721
      buddhaServer = new BuddhaServer(dbContext, sessionStore, {
        port: 3721,
        host: '127.0.0.1',
        managerToken,
        overlayStaticDir: resolveOverlayStaticDir(),
        cipher,
        logger: logger.child('HttpServer'),
      });

      // Start BuddhaServer with retry logic for port release resilience
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          await buddhaServer.start();
          break;
        } catch (err: any) {
          const msg = err?.message || String(err);
          if (msg.includes('EADDRINUSE') && attempt < 5) {
            logger.warn(`Port 3721 busy (attempt ${attempt}/5), waiting 1.2s for socket release...`);
            await new Promise((r) => setTimeout(r, 1200));
          } else {
            throw err;
          }
        }
      }

      registerIpcHandlers(dbContext, buddhaServer, verifyOutPath);
      mainWindow = createMainWindow(isVerifyMode);

      if (isVerifyMode) {
        setTimeout(() => {
          logger.error('Verification timed out waiting for renderer IPC');
          app.exit(2);
        }, 45000).unref();
      }
    })
    .catch((error: unknown) => {
      logger.error('Failed to bootstrap BuddhaLive Desktop:', error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('EADDRINUSE')) {
        dialog.showErrorBox(
          'Cổng 3721 Đang Bị Chiếm Dụng',
          'Cổng mạng 3721 đang được sử dụng bởi một tiến trình khác (EADDRINUSE).\nVui lòng kiểm tra lại Task Manager hoặc khởi động lại máy để giải phóng cổng.'
        );
      } else {
        dialog.showErrorBox('Lỗi Khởi Động BuddhaLive Studio', msg);
      }
      app.exit(1);
    });
}

let isCleanQuitting = false;

app.on('before-quit', (event) => {
  if (isCleanQuitting) return;
  event.preventDefault();
  isCleanQuitting = true;

  void (async () => {
    try {
      if (buddhaServer) {
        await Promise.race([
          buddhaServer.stop(),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
        buddhaServer = null;
      }
    } catch (err) {
      logger.error('Error during shutdown stop:', err);
    } finally {
      if (dbContext) {
        try {
          dbContext.close();
        } catch {}
        dbContext = null;
      }
      logger.info('Clean shutdown completed. Terminating process.');
      app.exit(0);
    }
  })();
});

app.on('will-quit', () => {
  logger.info('app will-quit event');
});

app.on('quit', (_e, code) => {
  logger.info(`app quit event with code ${code}`);
});

app.on('window-all-closed', () => {
  logger.info('app window-all-closed event');
  app.quit();
});
