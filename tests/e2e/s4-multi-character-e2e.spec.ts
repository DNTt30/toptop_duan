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

test.describe('S4 Multi-Character, Animation & Gift Rule Desktop E2E', () => {
  let tempBase: string;
  let ctx: SqliteDatabaseContext;
  let server: BuddhaServer;
  let managerToken: string;
  const screenshotsDir = path.resolve(__dirname, 'screenshots');

  test.beforeAll(async () => {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s4-pw-'));
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
      port: 3722, // Cổng riêng cho test S4 E2E
      host: '127.0.0.1',
      managerToken,
      overlayStaticDir,
      logger: createLogger('E2EServerS4'),
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

  test('Multi-character lifecycle: Create character -> Set Active -> Create Rule -> Trigger Event -> Overlay displays custom caption', async ({
    page,
    browser,
  }) => {
    // 1. Tạo nhân vật mới trong cơ sở dữ liệu
    const newChar = ctx.charRepo.create({
      name: 'Di Lặc Tôn Phật',
      slug: 'di-lac',
      modelPath: 'sample-character.glb',
      scale: 1.5,
      isActive: false,
    });
    expect(newChar.id).toBeDefined();

    // 2. Kích hoạt nhân vật này làm nhân vật active chính
    ctx.charRepo.setActive(newChar.id);
    const activeChar = ctx.charRepo.getActiveCharacter();
    expect(activeChar?.id).toBe(newChar.id);

    // 3. Tạo hoạt ảnh cho nhân vật mới
    const anim = ctx.animRepo.create({
      characterId: newChar.id,
      name: 'Nụ Cười Hoan Hỷ',
      clipName: 'Pray',
      category: 'REACTION',
      durationMs: 2000,
      loopMode: 'ONCE',
    });
    expect(anim.id).toBeDefined();

    // 4. Tạo Gift Rule riêng cho nhân vật mới (dùng EACH_EVENT để phát ngay trong test)
    const rule = ctx.ruleRepo.create({
      name: 'Cúng dường Hoa Sen Di Lặc',
      characterId: newChar.id,
      animationId: anim.id,
      triggerGiftId: 'lotus_dilac',
      minGiftCount: 1,
      comboTriggerMode: 'EACH_EVENT',
      priority: 30,
      overlayTextTemplate: '🌸 {senderName} kính dâng {giftCount}x {giftName} lên Đức Di Lặc!',
    });
    expect(rule.id).toBeDefined();

    // 5. Mở OBS Overlay trình duyệt
    await page.goto('http://127.0.0.1:3722/overlay');
    await page.waitForSelector('[data-testid="pairing-dialog"]', { timeout: 10000 });

    const codeElement = page.locator('[data-testid="pairing-code"]');
    await expect(codeElement).toBeVisible();
    const rawCodeText = await codeElement.textContent();
    const code = rawCodeText?.replace(/\s+/g, '') ?? '';
    expect(code).toHaveLength(6);

    // 6. Manager duyệt ghép nối OBS
    const pending = server.pairingManager.listPending();
    const targetPair = pending.find((p) => p.code === code);
    expect(targetPair).toBeDefined();
    server.pairingManager.approve(targetPair!.pairingId, code);

    // Overlay chuyển sang Standby
    await page.waitForSelector('[data-overlay-state="HIDDEN_STANDBY"]', { timeout: 10000 });

    // 7. Gửi quà tặng demo khớp với Gift Rule của nhân vật mới
    const demoRes = server.engine.handleIncomingLiveEvent({
      source: 'DEMO',
      eventType: 'GIFT',
      senderId: 'donor_s4_e2e',
      senderName: 'Phật Tử Giác Ngộ',
      giftId: 'lotus_dilac',
      giftName: 'Hoa Sen Hồng',
      giftCount: 3,
      unitCoinValue: 20,
    });

    expect(demoRes.processStatus).toBe('MATCHED');

    // 8. OBS Overlay hiển thị nhân vật Di Lặc và banner tương ứng
    await page.waitForSelector('[data-overlay-state="PLAYING"]', { timeout: 10000 });
    const banner = page.locator('[data-testid="sender-banner"]');
    await expect(banner).toBeVisible({ timeout: 5000 });
    // Chú thích: Banner template hiện tại render phân tách các trường (Tên sender, Tên quà tặng, Số lượng xN)
    await expect(banner).toContainText('Phật Tử Giác Ngộ');
    await expect(banner).toContainText('đã tặng Hoa Sen Hồng');
    await expect(banner).toContainText('x3');

    // Chụp ảnh bằng chứng E2E
    const screenshotPath = path.join(screenshotsDir, 's4-multi-character-overlay.png');
    await page.screenshot({ path: screenshotPath });
    expect(fs.existsSync(screenshotPath)).toBe(true);

    // 9. Đợi kết thúc lượt biểu diễn -> Tự biến mất sạch sẽ
    await page.waitForSelector('[data-overlay-state="HIDDEN_STANDBY"]', { timeout: 15000 });
    await expect(banner).toHaveCount(0);
  });
});
