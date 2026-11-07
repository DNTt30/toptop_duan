import { chromium } from '@playwright/test';
import * as path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('Console error:', msg.text());
    }
  });

  console.log('Navigating to http://127.0.0.1:3721/overlay/ ...');
  await page.goto('http://127.0.0.1:3721/overlay/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const dir = 'C:/Users/duong/.gemini/antigravity/brain/d430af74-503a-41fc-a4d6-1162ee65b773';
  await page.screenshot({ path: path.join(dir, 'verify_golden_temple.png') });
  console.log('Captured verify_golden_temple.png');

  // Click 1: Switch to COMMUNAL_HALL
  const bgBtn1 = page.locator('button:has-text("Điện Phật Vàng")');
  await bgBtn1.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(dir, 'verify_communal_hall.png') });
  console.log('Captured verify_communal_hall.png');

  // Click 2: Switch to TEMPLE
  const bgBtn2 = page.locator('button:has-text("Sảnh Đình Làng")');
  await bgBtn2.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(dir, 'verify_temple_lotus.png') });
  console.log('Captured verify_temple_lotus.png');

  // Click 3: Switch to TRANSPARENT
  const bgBtn3 = page.locator('button:has-text("Bối Cảnh Chùa")');
  await bgBtn3.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(dir, 'verify_transparent.png') });
  console.log('Captured verify_transparent.png');

  await browser.close();
  console.log('All 4 environments captured successfully!');
}

main().catch((err) => {
  console.error('Error during verification:', err);
  process.exit(1);
});
