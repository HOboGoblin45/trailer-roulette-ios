#!/usr/bin/env node
/**
 * Higher-fidelity simulation of iOS WKWebView's
 *   webView.loadHTMLString(html, baseURL: URL("https://www.youtube.com"))
 *
 * Technique: route-intercept the GET to https://www.youtube.com/, return
 * our HTML body. The page is then *at* https://www.youtube.com from the
 * browser's perspective — same origin / referrer behavior as iOS sets up
 * with loadHTMLString:baseURL:.
 *
 * If PLAYING reaches in this configuration, the iOS approach is sound.
 * If it doesn't, we know baseURL=https://www.youtube.com isn't enough
 * and we need a different fix (e.g. real http origin).
 */

import { webkit } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VIDEO_ID = process.argv[2] || 'dQw4w9WgXcQ';

const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="initial-scale=1.0, user-scalable=no">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>
  body { margin: 0; width: 100%; height: 100%; background: #000; color: #fff; }
  html { width: 100%; height: 100%; background: #000; }
  .embed-container { position: absolute; inset: 0; }
  .embed-container iframe { position: absolute; inset: 0; width: 100% !important; height: 100% !important; border: 0; }
  #diag {
    position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
    background: rgba(0,0,0,0.85); color: #9CFF9C;
    font: 11px/1.35 ui-monospace, Menlo, monospace;
    padding: 6px 8px; max-height: 50%; overflow-y: auto;
    word-break: break-all; pointer-events: none;
  }
  #diag .err { color: #FFA08A; }
  #diag .ok { color: #9CFF9C; }
</style>
</head>
<body>
<div class="embed-container"><div id="player"></div></div>
<div id="diag">starting…</div>

<script>
(function () {
  var diag = document.getElementById('diag');
  var t0 = Date.now();
  function elapsed() { return ((Date.now() - t0) / 1000).toFixed(2) + 's'; }
  window.__diagLog = function (msg, level) {
    try {
      var line = document.createElement('div');
      line.className = level || 'info';
      line.textContent = elapsed() + ' ' + msg;
      diag.appendChild(line);
      console.log('[DIAG] ' + elapsed() + ' ' + msg);
    } catch (e) {}
  };
  window.addEventListener('error', function (e) {
    window.__diagLog('JS ERROR: ' + (e.message || e), 'err');
  });
  window.__diagLog('1. page loaded', 'info');
  window.__diagLog('2. location=' + window.location.href, 'info');
  window.__diagLog('3. videoId=${VIDEO_ID}', 'info');
})();
</script>

<script src="https://www.youtube.com/iframe_api"
        onload="window.__diagLog('4a. iframe_api LOADED · YT=' + (typeof YT), 'ok')"
        onerror="window.__diagLog('4b. iframe_api FAILED', 'err')"></script>

<script>
var player;
var error = false;
setTimeout(function () {
  if (typeof YT === 'undefined') window.__diagLog('5x. YT undefined after 6s', 'err');
}, 6000);

function bootPlayer() {
  try {
    window.__diagLog('6. YT.ready fired', 'ok');
    player = new YT.Player('player', {
      videoId: '${VIDEO_ID}',
      playerVars: {
        autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1,
        controls: 1, fs: 1, origin: 'https://www.youtube.com'
      },
      events: {
        onReady: 'onReady',
        onStateChange: 'onStateChange',
        onError: 'onPlayerError'
      }
    });
    try { player.setSize(window.innerWidth, window.innerHeight); } catch (e) {}
    window.__diagLog('7. YT.Player constructed', 'ok');
  } catch (e) {
    window.__diagLog('7x. YT.Player threw: ' + (e && e.message), 'err');
  }
}

(function waitForYT(tries) {
  if (typeof YT !== 'undefined' && YT.ready) {
    window.__diagLog('5. YT ready (' + tries + ' polls)', 'ok');
    YT.ready(bootPlayer);
    return;
  }
  if (tries > 60) { window.__diagLog('5x. YT.ready not avail', 'err'); return; }
  setTimeout(function () { waitForYT(tries + 1); }, 100);
})(0);

function onReady(event) {
  window.__diagLog('8. onReady', 'ok');
  try { event.target.playVideo(); } catch (e) {}
}
function onStateChange(event) {
  var names = { '-1': 'UNSTARTED', 0: 'ENDED', 1: 'PLAYING', 2: 'PAUSED', 3: 'BUFFERING', 5: 'CUED' };
  window.__diagLog('9. state=' + (names[event.data] || event.data), 'info');
}
function onPlayerError(event) {
  window.__diagLog('!! onError code=' + event.data, 'err');
}
</script>
</body>
</html>`;

async function main() {
  console.log('Launching headless WebKit with iOS UA…');
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  // Intercept the navigation request to https://www.youtube.com/ (our
  // simulated baseURL) and return the HTML body. Pass through everything
  // else (real YouTube assets, googlevideo, etc).
  await ctx.route('**/*', async (route, request) => {
    const url = request.url();
    if (url === 'https://trailer-roulette.vercel.app/' && request.method() === 'GET' && request.resourceType() === 'document') {
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'referrer-policy': 'strict-origin-when-cross-origin',
        },
        body: html,
      });
      return;
    }
    await route.continue();
  });

  const requests = [];
  ctx.on('request', (r) => {
    const u = r.url();
    if (u.includes('youtube') || u.includes('googlevideo') || u.includes('ytimg')) {
      requests.push({ method: r.method(), url: u, referer: r.headers().referer || '(none)' });
    }
  });

  const page = await ctx.newPage();
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push('[' + m.type() + '] ' + m.text()));
  page.on('pageerror', (e) => consoleLines.push('[err] ' + (e.message || e)));

  console.log('Navigating to https://www.youtube.com/ (intercepted, served as our HTML)');
  await page.goto('https://trailer-roulette.vercel.app/', { waitUntil: 'domcontentloaded' });

  let reachedPlaying = false;
  let hitError = false;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const diag = await page.locator('#diag').innerText().catch(() => '');
    if (diag.includes('state=PLAYING')) { reachedPlaying = true; break; }
    if (diag.includes('!! onError')) { hitError = true; break; }
    await page.waitForTimeout(500);
  }

  const diagFinal = await page.locator('#diag').innerText().catch(() => '(no diag)');
  const out = join(ROOT, 'test-results', 'yt-ios-sim.png');
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: false });

  console.log('\n=== DIAGNOSTIC STRIP ===');
  console.log(diagFinal);
  console.log('\n=== KEY REFERER VALUES ===');
  for (const r of requests.slice(0, 10)) {
    console.log(`${r.method} ${r.url.slice(0, 110)}`);
    console.log(`   Referer: ${r.referer}`);
  }

  console.log(`\nSCREENSHOT: ${out}`);
  if (reachedPlaying) console.log('\nRESULT: ✅ PLAYING REACHED — iOS baseURL=youtube.com approach works');
  else if (hitError) console.log('\nRESULT: ❌ ERROR FIRED — see diag above');
  else console.log('\nRESULT: ❌ TIMEOUT — never reached PLAYING');

  await browser.close();
  process.exit(reachedPlaying ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
