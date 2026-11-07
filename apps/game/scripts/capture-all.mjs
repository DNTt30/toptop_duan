import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, '..');
const screenshotsDir = path.resolve(gameRoot, 'screenshots');
const distHtml = path.resolve(gameRoot, 'dist', 'index.html');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function run() {
  console.log('🚀 Bắt đầu chụp ảnh tự động 1280x720 và 720x1280 cho 6 Kỷ Nguyên...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--allow-file-access-from-files', '--disable-web-security'],
  });

  const fileUrl = 'file:///' + distHtml.replace(/\\/g, '/');

  // --- 1. CHỤP CHẾ ĐỘ 16:9 (1280x720) ---
  console.log('\n--- 1. Chụp màn hình 16:9 (1280x720) ---');
  const page16_9 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page16_9.goto(fileUrl, { waitUntil: 'load' });
  await page16_9.waitForTimeout(2000);

  // Nhấn [1], [2], [3] để gọi quân chiến đấu
  await page16_9.keyboard.press('1');
  await page16_9.keyboard.press('2');
  await page16_9.waitForTimeout(1000);

  // Chụp Kỷ Nguyên 1 (Tiền Sử)
  const pathAge1 = path.join(screenshotsDir, 'age1_prehistoric_1280x720.png');
  await page16_9.screenshot({ path: pathAge1 });
  console.log('✓ Đã chụp Kỷ Nguyên 1 (16:9):', pathAge1);

  // Chuyển sang các kỷ nguyên tiếp theo qua window evaluation
  for (const ageId of [2, 3, 4, 5, 6]) {
    await page16_9.evaluate((targetAge) => {
      // @ts-ignore
      const w = window.__world || window.world;
      if (w) {
        w.playerAge.setAge(targetAge);
        w.botAge.setAge(targetAge);
      }
    }, ageId);
    await page16_9.waitForTimeout(1500);

    const pathAge = path.join(screenshotsDir, `age${ageId}_1280x720.png`);
    await page16_9.screenshot({ path: pathAge });
    console.log(`✓ Đã chụp Kỷ Nguyên ${ageId} (16:9):`, pathAge);
  }
  await page16_9.close();

  // --- 2. CHỤP CHẾ ĐỘ 9:16 PORTRAIT (720x1280 - TIKTOK LIVE) ---
  console.log('\n--- 2. Chụp màn hình 9:16 Portrait (720x1280) ---');
  const page9_16 = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  await page9_16.goto(fileUrl, { waitUntil: 'load' });
  await page9_16.waitForTimeout(2000);

  await page9_16.keyboard.press('1');
  await page9_16.keyboard.press('2');
  await page9_16.waitForTimeout(1000);

  const pathPortraitAge1 = path.join(screenshotsDir, 'age1_portrait_720x1280.png');
  await page9_16.screenshot({ path: pathPortraitAge1 });
  console.log('✓ Đã chụp Kỷ Nguyên 1 (9:16):', pathPortraitAge1);

  // Chụp Kỷ Nguyên 6 AI trên màn hình dọc
  await page9_16.evaluate(() => {
    // @ts-ignore
    const w = window.__world || window.world;
    if (w) {
      w.playerAge.setAge(6);
      w.botAge.setAge(6);
    }
  });
  await page9_16.waitForTimeout(1500);

  const pathPortraitAge6 = path.join(screenshotsDir, 'age6_ai_portrait_720x1280.png');
  await page9_16.screenshot({ path: pathPortraitAge6 });
  console.log('✓ Đã chụp Kỷ Nguyên 6 AI (9:16):', pathPortraitAge6);
  await page9_16.close();

  // --- 3. CHỤP TRANG SHOWCASE PREVIEW ---
  console.log('\n--- 3. Chụp Trang Showcase Preview (/preview) ---');
  const pagePreview = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await pagePreview.goto(fileUrl + '?mode=preview', { waitUntil: 'load' });
  await pagePreview.waitForTimeout(1500);

  const pathPreview = path.join(screenshotsDir, 'preview_showcase_1280x720.png');
  await pagePreview.screenshot({ path: pathPreview });
  console.log('✓ Đã chụp Showcase Preview:', pathPreview);
  await pagePreview.close();

  await browser.close();
  console.log('\n🎉 TOÀN BỘ ẢNH CHỤP ĐÃ ĐƯỢC LƯU TẠI:', screenshotsDir);
}

run().catch(console.error);
