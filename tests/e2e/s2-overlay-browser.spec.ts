import {
  BuddhaServer,
  createLogger,
  generateSecretToken,
  NodeDevSecretCipher,
  openSqliteDatabase,
  OverlaySessionStore,
  type SqliteDatabaseContext,
} from '@buddhalive/backend';
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test.describe('S2 OBS Browser Source Simulation & Walking Skeleton E2E', () => {
  let tempBase: string;
  let ctx: SqliteDatabaseContext;
  let server: BuddhaServer;
  let managerToken: string;
  const screenshotsDir = path.resolve(__dirname, 'screenshots');

  test.beforeAll(async () => {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s2-pw-'));
    ctx = openSqliteDatabase({ baseDir: tempBase });
    managerToken = generateSecretToken();

    const cipher = new NodeDevSecretCipher();
    const sessionStore = new OverlaySessionStore(
      path.join(ctx.paths.securityDir, 'overlay-sessions.dat'),
      cipher,
      createLogger('TestSessionStore')
    );

    const overlayStaticDir = path.resolve(__dirname, '..', '..', 'apps', 'overlay', 'dist');

    server = new BuddhaServer(ctx, sessionStore, {
      port: 3721,
      host: '127.0.0.1',
      managerToken,
      overlayStaticDir,
      logger: createLogger('E2EServer'),
    });

    await server.start();
  });

  test.afterAll(async () => {
    await server.stop();
    ctx.close();
    if (fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  test('Walking Skeleton: Pairing -> Standby -> Demo Gift -> Appear & Animate -> Disappear', async ({
    page,
  }) => {
    // 1. OBS mở URL sạch http://127.0.0.1:3721/overlay (không token trên query)
    await page.goto('http://127.0.0.1:3721/overlay');

    // 2. Chưa có cookie -> Hiển thị hộp thoại ghép nối với mã 6 số
    await page.waitForSelector('[data-testid="pairing-dialog"]', { timeout: 10000 });
    const codeElement = page.locator('[data-testid="pairing-code"]');
    await expect(codeElement).toBeVisible();
    const pairingCode = (await codeElement.textContent())?.trim();
    expect(pairingCode).toMatch(/^\d{6}$/);

    // Chụp ảnh màn hình ghép nối OBS
    await page.screenshot({ path: path.join(screenshotsDir, '01-obs-overlay-pairing.png') });

    // 3. Desktop Manager duyệt ghép nối (Operator bấm nút trên Desktop Manager)
    const pending = server.pairingManager.listPending();
    const req = pending.find((p) => p.code === pairingCode);
    expect(req).toBeDefined();
    server.pairingManager.approve(req!.pairingId, pairingCode!);

    // 4. Overlay tự nhận cookie và chuyển về trạng thái HIDDEN_STANDBY sạch
    await page.waitForSelector('[data-overlay-state="HIDDEN_STANDBY"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="pairing-dialog"]')).toHaveCount(0);

    // Chụp ảnh màn hình trạng thái chờ trong suốt (HIDDEN_STANDBY)
    await page.screenshot({ path: path.join(screenshotsDir, '02-obs-overlay-standby.png') });

    // 5. Streamer bấm nút "Gửi Quà Demo" trên Desktop Manager (Minh Anh tặng 1x Hoa Sen)
    const demoRes = server.engine.triggerDemoGift({
      senderName: 'Minh Anh',
      giftCount: 1,
    });
    expect(demoRes.processStatus).toBe('MATCHED');
    expect(demoRes.executionId).toBeDefined();

    // 6. Overlay nhận sự kiện -> chuyển sang PLAYING -> hiện Banner & Nhân vật 3D
    await page.waitForSelector('[data-overlay-state="PLAYING"]', { timeout: 10000 });
    const banner = page.locator('[data-testid="sender-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Minh Anh đã tặng 1x Hoa Sen');
    await expect(page.locator('[data-active-clip="Pray"]')).toBeVisible();

    // Chụp ảnh màn hình khi nhân vật 3D và banner tên đang hiển thị (PLAYING)
    await page.screenshot({ path: path.join(screenshotsDir, '03-obs-overlay-3d-playing.png') });

    // 7. Hoạt ảnh kết thúc -> Nhân vật và banner tự động biến mất về nền trong suốt
    await page.waitForSelector('[data-overlay-state="HIDDEN_STANDBY"]', { timeout: 15000 });
    await expect(banner).toHaveCount(0);

    // Chụp ảnh màn hình sau khi nhân vật đã biến mất hoàn toàn
    await page.screenshot({ path: path.join(screenshotsDir, '04-obs-overlay-disappeared.png') });

    // Kiểm tra trong SQLite: lượt thực thi đã hoàn tất COMPLETED
    const exec = ctx.execRepo.getById(demoRes.executionId!);
    expect(exec?.status).toBe('COMPLETED');
  });

  test('Model 3D lỗi -> Hiển thị Fallback 2D thành công -> Ghi COMPLETED_WITH_FALLBACK', async ({
    page,
  }) => {
    // Cấp token hợp lệ và nạp vào cookie của browser context
    const overlayToken = server.sessionStore.issue();
    await page.context().addCookies([
      {
        name: 'bls_overlay_session',
        value: overlayToken,
        url: 'http://127.0.0.1:3721',
      },
    ]);

    // Mở overlay và đợi kết nối Socket.IO thành công
    await page.goto('http://127.0.0.1:3721/overlay');
    await page.waitForSelector('[data-overlay-state="HIDDEN_STANDBY"]', { timeout: 10000 });

    // Đảm bảo overlay đã gửi telemetry readyToPlay tới engine
    for (let i = 0; i < 50; i++) {
      if (server.engine.isOverlayReady()) break;
      await page.waitForTimeout(100);
    }

    // Cập nhật model_path của nhân vật trỏ tới file lỗi corrupt-character.glb
    const corruptGlbTarget = path.join(ctx.paths.assetsDir, 'corrupt-character.glb');
    fs.writeFileSync(corruptGlbTarget, 'CORRUPT_NOT_A_VALID_GLTF_HEADER');
    ctx.db.prepare("UPDATE characters SET model_path = 'corrupt-character.glb' WHERE id = 'char_sample_monk'").run();

    // Bấm Gửi Quà Demo
    const demoRes = server.engine.triggerDemoGift({
      senderName: 'Quang Linh',
      giftCount: 2,
    });
    expect(demoRes.processStatus).toBe('MATCHED');

    // Overlay phát hiện model lỗi -> Chuyển sang FALLBACK_2D
    await page.waitForSelector('[data-overlay-state="FALLBACK_2D"]', { timeout: 10000 });
    const fallbackAlert = page.locator('[data-testid="fallback-2d-alert"]');
    await expect(fallbackAlert).toBeVisible();
    await expect(fallbackAlert).toContainText('Quang Linh đã tặng 2x Hoa Sen');

    // Chụp ảnh màn hình chế độ dự phòng 2D Fallback
    await page.screenshot({ path: path.join(screenshotsDir, '05-obs-overlay-fallback-2d.png') });

    // Sau 3 giây, bảng 2D biến mất sạch về HIDDEN_STANDBY
    await page.waitForSelector('[data-overlay-state="HIDDEN_STANDBY"]', { timeout: 15000 });
    await expect(fallbackAlert).toHaveCount(0);

    // Kiểm tra trong SQLite: ghi COMPLETED_WITH_FALLBACK chứ KHÔNG ghi FAILED
    const exec = ctx.execRepo.getById(demoRes.executionId!);
    expect(exec?.status).toBe('COMPLETED_WITH_FALLBACK');
    expect(exec?.errorCode).toBe('MODEL_LOAD_FAILED');

    // Phục hồi lại model hợp lệ
    ctx.db.prepare("UPDATE characters SET model_path = 'sample-character.glb' WHERE id = 'char_sample_monk'").run();
  });
});
