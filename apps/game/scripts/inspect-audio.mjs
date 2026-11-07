import { chromium } from 'playwright';
import fs from 'node:fs';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const networkRequests = [];
  page.on('response', async (res) => {
    const url = res.url();
    const contentType = res.headers()['content-type'] || '';
    if (url.includes('audio') || contentType.includes('audio') || url.includes('.mp3') || url.includes('.wav') || url.includes('googleusercontent') || url.includes('blob:') || url.includes('media')) {
      networkRequests.push({ url, contentType, status: res.status() });
    }
  });

  console.log('Navigating...');
  await page.goto('https://gemini.google.com/share/5b4d8ea5d7ef', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);

  // Click any play button or inspect elements
  const details = await page.evaluate(() => {
    const allElements = Array.from(document.querySelectorAll('*')).map(el => {
      const tag = el.tagName.toLowerCase();
      const attrs = {};
      for (const attr of el.attributes) {
        if (attr.name.includes('src') || attr.name.includes('url') || attr.name.includes('data') || attr.name.includes('href') || attr.name.includes('audio')) {
          attrs[attr.name] = attr.value;
        }
      }
      return {
        tag,
        className: el.className,
        attrs,
        id: el.id
      };
    }).filter(x => Object.keys(x.attrs).length > 0 || x.tag === 'audio' || x.tag === 'video' || x.tag.includes('audio') || x.tag.includes('player'));

    return {
      html: document.documentElement.outerHTML.slice(0, 50000),
      interestingElements: allElements.slice(0, 50)
    };
  });

  fs.writeFileSync('apps/game/scripts/page_html.html', details.html, 'utf-8');
  fs.writeFileSync('apps/game/scripts/page_media.json', JSON.stringify({
    requests: networkRequests,
    elements: details.interestingElements
  }, null, 2), 'utf-8');

  console.log('Network media requests found:', networkRequests.length);
  console.log(JSON.stringify(networkRequests, null, 2));

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
