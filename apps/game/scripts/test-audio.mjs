import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';

async function testAudio() {
  console.log('Starting Vite server...');
  const server = await createServer({
    root: path.resolve('apps/game'),
    configFile: path.resolve('apps/game/vite.config.ts'),
    server: { port: 3344 }
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 3344;
  console.log(`Vite server listening on http://localhost:${port}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.error('Page error:', err));

  console.log('Navigating to game...');
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Dispatch click to unlock audio autoplay
  console.log('Dispatching user click to unlock autoplay...');
  await page.evaluate(() => {
    window.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    if (window.audioSynth) {
      window.audioSynth.playBGM();
    }
  });
  await page.waitForTimeout(2000);

  // Check audio element status
  const audioStatus = await page.evaluate(() => {
    const synth = window.audioSynth || null;
    const bgm = synth ? synth.bgm : null;
    return {
      synthExists: !!synth,
      synthMuted: synth ? synth.getMuted() : null,
      bgmExists: !!bgm,
      bgmPaused: bgm ? bgm.paused : null,
      bgmCurrentTime: bgm ? bgm.currentTime : null,
      bgmSrc: bgm ? bgm.src : null,
    };
  });

  console.log('Audio status in DOM/Synth:', JSON.stringify(audioStatus, null, 2));
  console.log('Console logs on page:', consoleLogs);

  // Find the mute button in the top bar
  const muteBtn = await page.$('button[title*="âm thanh"]');
  console.log('Found mute button:', !!muteBtn);

  if (muteBtn) {
    const textBefore = await muteBtn.textContent();
    console.log('Mute button text before click:', textBefore);
    await muteBtn.click();
    await page.waitForTimeout(500);
    const textAfter1 = await muteBtn.textContent();
    console.log('Mute button text after 1st click:', textAfter1);
    await muteBtn.click();
    await page.waitForTimeout(500);
    const textAfter2 = await muteBtn.textContent();
    console.log('Mute button text after 2nd click:', textAfter2);
  }

  // Take screenshot
  const screenshotPath = 'C:/Users/duong/.gemini/antigravity/brain/d430af74-503a-41fc-a4d6-1162ee65b773/audio_integration_verified.png';
  await page.screenshot({ path: screenshotPath });
  console.log(`Screenshot saved to ${screenshotPath}`);

  await browser.close();
  await server.close();
  console.log('Audio test completed successfully!');
}

testAudio().catch(err => {
  console.error('Audio test failed:', err);
  process.exit(1);
});
