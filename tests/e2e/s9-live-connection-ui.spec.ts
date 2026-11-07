import { expect, test } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

test.describe('S9 T-30: Live Connection Tab Desktop Manager UI & Verification', () => {
  let staticServer: http.Server;
  const PORT = 3940;
  const distDir = path.resolve(__dirname, '..', '..', 'apps', 'desktop', 'dist-renderer');
  const screenshotsDir = path.resolve(__dirname, 'screenshots');
  const artifactDir = 'C:\\Users\\duong\\.gemini\\antigravity\\brain\\7e92f7aa-4cdd-457a-9d9b-503830ca0754';

  test.beforeAll(async () => {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    if (fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }

    // Static HTTP Server serving built renderer bundle
    staticServer = http.createServer((req, res) => {
      let reqPath = req.url?.split('?')[0] || '/';
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(distDir, reqPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const contentType =
          ext === '.html'
            ? 'text/html'
            : ext === '.js'
            ? 'application/javascript'
            : ext === '.css'
            ? 'text/css'
            : 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
      } else {
        // Fallback SPA routing to index.html
        const indexPath = path.join(distDir, 'index.html');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(indexPath).pipe(res);
      }
    });

    await new Promise<void>((resolve, reject) => {
      staticServer.listen(PORT, '127.0.0.1', () => resolve());
      staticServer.on('error', reject);
    });
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => {
      staticServer.close(() => resolve());
    });
  });

  test('Render Live Connection Tab: TikFinity & EulerStream BYOK configurations with screenshots', async ({
    page,
  }) => {
    // Inject Mock DesktopBridge via addInitScript
    await page.addInitScript(() => {
      let savedConfig: any = {
        provider: 'TIKFINITY',
        endpointUrl: 'ws://127.0.0.1:21213',
        streamerUsername: '',
        autoConnectOnStart: false,
        hasApiKey: false,
      };

      let connectionSummary: any = {
        provider: 'TIKFINITY',
        state: 'CONFIGURED',
        streamerUsername: '',
        endpointUrl: 'ws://127.0.0.1:21213',
        hasApiKey: false,
        eventsReceived: 0,
        lastEventAt: null,
        lastError: null,
      };

      (window as any).buddhaDesktop = {
        getStorageHealth: async () => ({
          ok: true,
          journalMode: 'wal',
          foreignKeysEnabled: true,
          appliedMigrations: ['001_init.sql'],
          dbFilePath: 'C:\\Users\\User\\AppData\\Roaming\\BuddhaLiveStudio\\data\\buddhalive.db',
          error: null,
        }),
        getManagerState: async () => ({
          protocolVersion: '1.0',
          serverTime: new Date().toISOString(),
          overlayUrl: 'http://127.0.0.1:3721/overlay',
          connectedOverlays: 1,
          readyOverlays: 1,
          pairedOverlaySessions: 1,
          pendingPairRequests: [],
          activeExecution: null,
          queuedCount: 0,
          recentExecutions: [],
          sampleCharacter: { id: 'char-1', name: 'Đức Phật Thích Ca', giftName: 'Hoa Sen' },
          tiktokAdapterStatus: 'CONFIGURED (TikFinity)',
          engineStatus: 'IDLE',
          isPaused: false,
          queueMetrics: { queued: 0, playing: 0, completed: 5, failed: 0 },
          queuedExecutions: [],
        }),
        updateFpsLimit: async (fps: number) => ({
          key: 'overlay.fps_limit',
          valueJson: JSON.stringify(fps),
          valueType: 'NUMBER',
          category: 'OVERLAY',
          description: 'FPS limit',
          isRestartRequired: false,
          updatedAt: new Date().toISOString(),
        }),
        isAutomatedVerifyMode: () => false,
        listCharacters: async () => [
          { id: 'char-1', name: 'Đức Phật Thích Ca', slug: 'thich-ca', modelPath: 'sample.glb', scale: 1, isActive: true },
        ],
        // S9 IPC mocks
        getLiveConfig: async () => savedConfig,
        saveLiveConfig: async (cfg: any) => {
          savedConfig = { ...cfg };
          connectionSummary.provider = cfg.provider;
          connectionSummary.endpointUrl = cfg.endpointUrl;
          connectionSummary.streamerUsername = cfg.streamerUsername;
          connectionSummary.state = 'CONFIGURED';
          return { ok: true, config: savedConfig };
        },
        saveLiveApiKey: async (payload: any) => {
          savedConfig.hasApiKey = true;
          connectionSummary.hasApiKey = true;
          return { ok: true };
        },
        clearLiveApiKey: async () => {
          savedConfig.hasApiKey = false;
          connectionSummary.hasApiKey = false;
          return { ok: true };
        },
        getLiveConnectionSummary: async () => connectionSummary,
      };
    });

    // 1. Điều hướng tới Desktop Manager
    await page.setViewportSize({ width: 1040, height: 860 });
    await page.goto(`http://127.0.0.1:${PORT}`);

    // Đợi UI render xong và click Tab "📡 Kết Nối LIVE"
    const liveTabBtn = page.locator('[data-testid="tab-live-connection"]');
    await expect(liveTabBtn).toBeVisible({ timeout: 5000 });
    await liveTabBtn.click();

    // 2. Xác minh container giao diện Live Connection Tab xuất hiện
    const liveContainer = page.locator('[data-testid="live-connection-container"]');
    await expect(liveContainer).toBeVisible();

    // 3. Xác minh trạng thái kết nối từ Backend
    const badgeState = page.locator('[data-testid="badge-live-connection-state"]');
    await expect(badgeState).toContainText('ĐÃ LƯU CẤU HÌNH (SẴN SÀNG)');

    // 4. Kiểm tra form TikFinity
    const inputTikfinityEndpoint = page.locator('[data-testid="input-tikfinity-endpoint"]');
    await expect(inputTikfinityEndpoint).toHaveValue('ws://127.0.0.1:21213');

    // Điền tên kênh và tick autoconnect
    const inputTikfinityStreamer = page.locator('[data-testid="input-tikfinity-streamer"]');
    await inputTikfinityStreamer.fill('@buddhalive_vietnam');

    const checkboxTikfinityAuto = page.locator('[data-testid="checkbox-tikfinity-autoconnect"]');
    await checkboxTikfinityAuto.check();

    // Bấm lưu cấu hình TikFinity
    const btnSaveTikfinity = page.locator('[data-testid="btn-save-tikfinity-config"]');
    await btnSaveTikfinity.click();

    // Kiểm tra thông báo lưu thành công
    const feedbackAlert = page.locator('[data-testid="live-feedback-alert"]');
    await expect(feedbackAlert).toBeVisible();
    await expect(feedbackAlert).toContainText('Đã lưu cấu hình TikFinity thành công');

    // Chụp ảnh màn hình giao diện TikFinity
    const tikfinityScreenshotPath = path.join(screenshotsDir, 's9-live-connection-tikfinity.png');
    await page.screenshot({ path: tikfinityScreenshotPath, fullPage: true });
    expect(fs.existsSync(tikfinityScreenshotPath)).toBe(true);

    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(tikfinityScreenshotPath, path.join(artifactDir, 's9-live-connection-tikfinity.png'));
    }

    // 5. Chuyển sang EulerStream Cloud (BYOK)
    const cardEuler = page.locator('[data-testid="provider-card-eulerstream"]');
    await cardEuler.click();

    // Kiểm tra form EulerStream hiển thị
    const formEuler = page.locator('[data-testid="form-eulerstream"]');
    await expect(formEuler).toBeVisible();

    const inputEulerStreamer = page.locator('[data-testid="input-euler-streamer"]');
    await inputEulerStreamer.fill('@buddhalive_official');

    const inputEulerApiKey = page.locator('[data-testid="input-euler-apikey"]');
    await inputEulerApiKey.fill('euler_sec_live_998877665544332211');

    // Kiểm tra nút toggle ẩn/hiện mật khẩu
    const btnToggleEye = page.locator('[data-testid="btn-toggle-show-apikey"]');
    await btnToggleEye.click();
    await expect(inputEulerApiKey).toHaveAttribute('type', 'text');
    await btnToggleEye.click();
    await expect(inputEulerApiKey).toHaveAttribute('type', 'password');

    // Lưu cấu hình & Khóa EulerStream
    const btnSaveEuler = page.locator('[data-testid="btn-save-euler-config"]');
    await btnSaveEuler.click();

    // Kiểm tra thông báo bảo vệ DPAPI
    await expect(feedbackAlert).toBeVisible();
    await expect(feedbackAlert).toContainText('Đã lưu cấu hình EulerStream và mã hóa API Key bằng Windows DPAPI');

    // Kiểm tra API Key đã được che giấu masked và xuất hiện huy hiệu bảo vệ
    const maskedKeyInput = page.locator('[data-testid="input-euler-apikey-masked"]');
    await expect(maskedKeyInput).toBeVisible();
    await expect(maskedKeyInput).toHaveValue('••••••••••••••••••••••••••••••••');

    const dpapiBadge = page.locator('[data-testid="badge-api-key-dpapi"]');
    await expect(dpapiBadge).toBeVisible();
    await expect(dpapiBadge).toContainText('ĐÃ BẢO VỆ BỞI WINDOWS DPAPI');

    // Chụp ảnh màn hình giao diện EulerStream
    const eulerScreenshotPath = path.join(screenshotsDir, 's9-live-connection-eulerstream.png');
    await page.screenshot({ path: eulerScreenshotPath, fullPage: true });
    expect(fs.existsSync(eulerScreenshotPath)).toBe(true);

    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(eulerScreenshotPath, path.join(artifactDir, 's9-live-connection-eulerstream.png'));
    }
  });
});
