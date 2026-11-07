import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, '..');
const screenshotPath = 'C:\\Users\\duong\\.gemini\\antigravity\\brain\\d430af74-503a-41fc-a4d6-1162ee65b773\\screen_capture.png';

async function run() {
  const distHtml = path.resolve(gameRoot, 'dist', 'index.html');
  console.log('Loading dist HTML directly from file:', distHtml);

  console.log('Launching Playwright Chromium with file access flags...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--allow-file-access-from-files', '--disable-web-security'],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });

  const errors = [];
  const logs = [];

  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
    console.log(`PAGE_LOG [${msg.type()}]:`, msg.text());
  });

  page.on('pageerror', (err) => {
    errors.push(err.message + '\n' + (err.stack || ''));
    console.error('PAGE_ERROR:', err.message);
  });

  try {
    const fileUrl = 'file:///' + distHtml.replace(/\\/g, '/');
    console.log('Navigating to', fileUrl);
    await page.goto(fileUrl, { waitUntil: 'load' });

    console.log('Waiting 3 seconds for rendering...');
    await page.waitForTimeout(3000);

    const canvasInfo = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { found: false };
      const rect = canvas.getBoundingClientRect();
      return {
        found: true,
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        style: canvas.getAttribute('style'),
      };
    });
    console.log('Canvas Info:', JSON.stringify(canvasInfo, null, 2));

    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to:', screenshotPath);
  } catch (err) {
    console.error('Diagnostic error:', err);
  } finally {
    await browser.close();
  }

  console.log('\n--- SUMMARY ---');
  console.log('Total page errors:', errors.length);
  if (errors.length > 0) {
    console.log('Errors:', errors);
  }
}

run().catch(console.error);
