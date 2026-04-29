#!/usr/bin/env node
/**
 * Test: load https://trailer-roulette.vercel.app/embed?v=ID directly as
 * the WKWebView's main frame (NOT inside an iframe in another WebView,
 * NOT via loadHTMLString:baseURL:). This is a full HTTPS navigation,
 * which is the most "real browser-like" path.
 *
 * If this reaches state=PLAYING in headless WebKit with iOS UA, the
 * iOS implementation can do the same thing with a one-line change:
 *   webView.load(URLRequest(url: URL(string: "https://trailer-roulette.vercel.app/embed?v=ID")!))
 *
 * Also injects an event-listener script to detect YT.Player events
 * inside the embed page (since we're not loading our own HTML this
 * time, we listen via postMessage).
 */
import { webkit } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VIDEO_ID = process.argv[2] || 'dQw4w9WgXcQ';
const URL = `https://trailer-roulette.vercel.app/embed?v=${VIDEO_ID}`;

async function main() {
  console.log(`Testing direct navigation to ${URL}`);
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  const requests = [];
  ctx.on('request', (r) => {
    const u = r.url();
    if (u.includes('youtube') || u.includes('googlevideo') || u.includes('vercel.app')) {
      requests.push({ method: r.method(), url: u, referer: r.headers().referer || '(none)' });
    }
  });

  const page = await ctx.newPage();
  const events = [];
  page.on('console', (m) => events.push('[' + m.type() + '] ' + m.text()));
  page.on('pageerror', (e) => events.push('[err] ' + e.message));

  // Inject a postMessage listener BEFORE the page loads so we can capture
  // YT IFrame Player events via the official postMessage protocol.
  await ctx.addInitScript(() => {
    window.__ytEvents = [];
    window.addEventListener('message', (e) => {
      try {
        let data = (typeof e.data === 'string') ? JSON.parse(e.data) : e.data;
        if (data && (data.event === 'onStateChange' || data.event === 'onError' || data.event === 'onReady')) {
          window.__ytEvents.push(data);
          console.log('[YT EVENT] ' + JSON.stringify(data));
        }
      } catch (err) {}
    });
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Wait up to 20s for state=PLAYING (info: 1) or onError.
  let outcome = 'timeout';
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const evts = await page.evaluate(() => window.__ytEvents || []);
    const playing = evts.find((e) => e.event === 'onStateChange' && e.info === 1);
    const error = evts.find((e) => e.event === 'onError');
    if (playing) { outcome = 'PLAYING'; break; }
    if (error) { outcome = 'ERROR ' + error.info; break; }
    await page.waitForTimeout(500);
  }

  const out = join(ROOT, 'test-results', 'vercel-direct.png');
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: false });

  // Final: check the iframe was created
  const iframeInfo = await page.evaluate(() => {
    const f = document.querySelector('iframe');
    return f ? { src: f.src, contentVisible: !!f.offsetWidth } : null;
  });

  console.log('\n=== OUTCOME ===');
  console.log('  ' + outcome);
  console.log('\n=== EVENTS CAPTURED ===');
  const evts = await page.evaluate(() => window.__ytEvents || []);
  for (const e of evts.slice(0, 20)) console.log('  ' + JSON.stringify(e));
  console.log('\n=== IFRAME ===');
  console.log('  ' + JSON.stringify(iframeInfo));
  console.log('\n=== KEY REFERER VALUES (first 8) ===');
  for (const r of requests.slice(0, 8)) {
    console.log(`  ${r.method} ${r.url.slice(0, 110)}`);
    console.log(`    Referer: ${r.referer}`);
  }
  console.log(`\n  Screenshot → ${out}`);
  console.log(outcome === 'PLAYING' ? '\nRESULT: ✅ PLAYING' : `\nRESULT: ❌ ${outcome}`);

  await browser.close();
  process.exit(outcome === 'PLAYING' ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
