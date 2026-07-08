import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2]; const size = 1024;
const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage','--force-color-profile=srgb'] });
const ctx = await b.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
for (const f of readdirSync(dir).filter(f => f.endsWith('.svg'))) {
  const svg = readFileSync(join(dir, f), 'utf8');
  await p.setContent(`<!doctype html><html><body style="margin:0;padding:0">${svg}</body></html>`);
  await p.waitForTimeout(120);
  await p.screenshot({ path: join(dir, f.replace('.svg', '.png')) });
  console.log('rendered', f.replace('.svg','.png'));
}
await b.close();
