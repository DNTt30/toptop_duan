const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to http://localhost:5173/?mode=preview...');
  await page.goto('http://localhost:5173/?mode=preview', { waitUntil: 'networkidle' });

  // Click on the Studio tab button
  console.log('Clicking Studio tab button...');
  const studioBtn = await page.locator('button:has-text("STUDIO CHỈNH TAY")');
  await studioBtn.click();

  await page.waitForTimeout(1500);

  const screenshotPath = 'C:\\Users\\duong\\.gemini\\antigravity\\brain\\d430af74-503a-41fc-a4d6-1162ee65b773\\studio_mouse_drag_verified.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  await browser.close();
})();
