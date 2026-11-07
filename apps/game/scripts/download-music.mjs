import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to share URL...');
  await page.goto('https://gemini.google.com/share/5b4d8ea5d7ef', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Get the video/audio src
  const mediaSrc = await page.evaluate(() => {
    const video = document.querySelector('video');
    return video ? video.src : null;
  });

  console.log('Media src from DOM:', mediaSrc);

  if (!mediaSrc) {
    throw new Error('No media src found');
  }

  // Ensure public/audio directory exists
  fs.mkdirSync('apps/game/public/audio', { recursive: true });

  // Download the buffer using page context to preserve any cookies or session
  const response = await context.request.get(mediaSrc);
  console.log('Status:', response.status());
  console.log('Headers:', response.headers());

  const buffer = await response.body();
  console.log('Downloaded bytes:', buffer.length);

  const outputPath = 'apps/game/public/audio/theme.mp3';
  fs.writeFileSync(outputPath, buffer);
  console.log('Saved to:', outputPath);

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
