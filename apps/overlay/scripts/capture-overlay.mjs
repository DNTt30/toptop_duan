import { chromium } from 'playwright';
import path from 'path';

async function capture() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=default', '--enable-webgl'],
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });

  console.log('Navigating to http://127.0.0.1:3721/overlay/ ...');
  await page.goto('http://127.0.0.1:3721/overlay/', { waitUntil: 'networkidle' });

  // Wait 3 seconds for Three.js rendering
  await page.waitForTimeout(3500);

  // Take baseline screenshot
  const outPath1 = path.resolve('C:/Users/duong/.gemini/antigravity/brain/7e92f7aa-4cdd-457a-9d9b-503830ca0754/overlay-golden-lotus-live.png');
  await page.screenshot({ path: outPath1 });
  console.log('Saved baseline screenshot to:', outPath1);

  // Click "Thắp Hương" button in bottom nav bar to trigger gift animation and ribbon banner
  const incenseBtn = page.locator('text=Thắp Hương');
  if (await incenseBtn.isVisible()) {
    console.log('Clicking Thắp Hương...');
    await incenseBtn.click();
    await page.waitForTimeout(1500);
    const outPath2 = path.resolve('C:/Users/duong/.gemini/antigravity/brain/7e92f7aa-4cdd-457a-9d9b-503830ca0754/overlay-golden-lotus-action.png');
    await page.screenshot({ path: outPath2 });
    console.log('Saved action screenshot to:', outPath2);
  }

  await browser.close();
  console.log('Done.');
}

capture().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
