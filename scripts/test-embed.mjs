#!/usr/bin/env node
/**
 * Test the YouTube embed proxy in actual WebKit (Apple's engine).
 * Renders our /embed?v=ID URL and screenshots it after waiting for the
 * inner YouTube iframe to load. If the screenshot shows the YT player
 * (not a black screen), the proxy works in WebKit and the bug we're
 * fighting is iOS-WKWebView-specific (different network stack).
 */
import { webkit } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const URL = 'https://trailer-roulette.vercel.app/embed?v=dQw4w9WgXcQ';

async function main() {
  console.log('Launching webkit headless…');
  const browser = await webkit.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, // iPhone 15 logical viewport
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });

    // Capture every network request so we can prove the YT iframe load was attempted.
    const reqs = [];
    ctx.on('request', (r) => {
      const u = r.url();
      if (u.includes('youtube') || u.includes('youtu.be') || u.includes('vercel.app')) {
        reqs.push({ method: r.method(), url: u, headers: r.headers() });
      }
    });

    const page = await ctx.newPage();
    console.log(`Navigating to ${URL}`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait for the YT iframe element to actually render.
    await page.waitForSelector('iframe', { timeout: 15_000 });
    console.log('iframe element found');

    // Give YouTube a few seconds to load its player UI.
    await page.waitForTimeout(7000);

    const out = join(ROOT, 'test-results', 'embed-webkit.png');
    await mkdir(dirname(out), { recursive: true });
    await page.screenshot({ path: out, fullPage: false });
    console.log(`Screenshot → ${out}`);

    // Dump the iframe's referrer-related context.
    const iframeInfo = await page.evaluate(() => {
      const f = document.querySelector('iframe');
      return f ? {
        src: f.src,
        referrerPolicy: f.referrerPolicy,
        loading: f.loading,
        title: f.title,
      } : null;
    });
    console.log('Iframe attrs:', iframeInfo);

    console.log('\nNetwork requests to YT/Vercel:');
    for (const r of reqs.slice(0, 25)) {
      const ref = r.headers.referer || '(none)';
      console.log(`  ${r.method} ${r.url}\n    Referer: ${ref}`);
    }
    if (reqs.length > 25) console.log(`  …${reqs.length - 25} more`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
