import { chromium } from 'playwright';
import fs from 'node:fs';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  console.log('Navigating to Gemini share URL...');
  await page.goto('https://gemini.google.com/share/5b4d8ea5d7ef', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('Waiting 8s for client-side rendering...');
  await page.waitForTimeout(8000);
  
  const result = await page.evaluate(() => {
    const text = document.body ? document.body.innerText : '';
    const codes = Array.from(document.querySelectorAll('pre, code')).map(c => c.textContent);
    const audioTags = Array.from(document.querySelectorAll('audio, source')).map(a => a.src || a.getAttribute('src'));
    const allLinks = Array.from(document.querySelectorAll('a')).map(a => ({ href: a.href, text: a.textContent?.trim() }));
    return {
      title: document.title,
      text,
      codes,
      audioTags,
      allLinks
    };
  });
  
  fs.writeFileSync('apps/game/scripts/share_result.json', JSON.stringify(result, null, 2), 'utf-8');
  console.log('Wrote apps/game/scripts/share_result.json successfully!');
  console.log('Title:', result.title);
  console.log('Text snippet:', result.text.slice(0, 500));
  
  await browser.close();
}

run().catch(err => {
  console.error('Fetch error:', err);
  process.exit(1);
});
