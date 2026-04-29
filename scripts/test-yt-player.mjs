#!/usr/bin/env node
/**
 * Test the EXACT HTML our Swift plugin generates, in headless WebKit
 * (Apple's actual rendering engine on Windows/Linux). This is the closest
 * we can get to iOS WKWebView without an iPhone.
 *
 * What we verify:
 *   1. The IFrame API script loads
 *   2. YT global appears
 *   3. YT.Player constructs without throwing
 *   4. onReady fires
 *   5. State reaches PLAYING (1)
 *
 * If all five happen in WebKit, the HTML logic is structurally correct.
 * Any iOS-specific failure must then be the WebKit Bug 169846 referer
 * stripping or a similar iOS-only behavior.
 *
 * If anything fails IN WebKit, the HTML has a bug and we fix that first.
 *
 * Usage:
 *   node scripts/test-yt-player.mjs [VIDEO_ID]
 */

import { webkit } from 'playwright';
import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VIDEO_ID = process.argv[2] || 'dQw4w9WgXcQ'; // Rick Astley, known embeddable

// === The EXACT HTML our Swift plugin generates (mirroring v1.8.4) ======
const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="initial-scale=1.0, user-scalable=no">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>
  body { margin: 0; width: 100%; height: 100%; background-color: #000000; color: #fff; font-family: -apple-system, sans-serif; }
  html { width: 100%; height: 100%; background-color: #000000; }
  .embed-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  .embed-container iframe,
  .embed-container object,
  .embed-container embed {
    position: absolute;
    top: 0;
    left: 0;
    width: 100% !important;
    height: 100% !important;
  }
  #diag {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 9999;
    background: rgba(0,0,0,0.85);
    color: #9CFF9C;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 11px;
    line-height: 1.35;
    padding: 6px 8px;
    max-height: 50%;
    overflow-y: auto;
    word-break: break-all;
    pointer-events: none;
  }
  #diag .err { color: #FFA08A; }
  #diag .ok { color: #9CFF9C; }
  #diag .info { color: #C9D9FF; }
</style>
</head>
<body>
<div class="embed-container">
  <div id="player"></div>
</div>

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
    window.__diagLog('JS ERROR: ' + (e.message || e) + ' @ ' + (e.filename || '?') + ':' + (e.lineno || '?'), 'err');
  });
  window.__diagLog('1. page loaded · ua=' + navigator.userAgent.slice(0, 60), 'info');
  window.__diagLog('2. location=' + window.location.href, 'info');
  window.__diagLog('3. videoId=${VIDEO_ID}', 'info');
})();
</script>

<script src="https://www.youtube.com/iframe_api"
        onload="window.__diagLog('4a. iframe_api SCRIPT LOADED · YT=' + (typeof YT), 'ok')"
        onerror="window.__diagLog('4b. iframe_api SCRIPT FAILED', 'err')"></script>

<script>
var player;
var error = false;

setTimeout(function () {
  if (typeof YT === 'undefined' || !YT.ready) {
    window.__diagLog('5x. YT global STILL UNDEFINED after 6s', 'err');
  }
}, 6000);

function bootPlayer() {
  try {
    window.__diagLog('6. YT.ready fired · creating player…', 'ok');
    player = new YT.Player('player', {
      videoId: '${VIDEO_ID}',
      playerVars: {
        autoplay: 1,
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        controls: 1,
        fs: 1,
        origin: 'https://www.youtube.com'
      },
      events: {
        onReady: 'onReady',
        onStateChange: 'onStateChange',
        onPlaybackQualityChange: 'onPlaybackQualityChange',
        onError: 'onPlayerError'
      }
    });
    try { player.setSize(window.innerWidth, window.innerHeight); } catch (e) {}
    window.__diagLog('7. new YT.Player constructed', 'ok');
  } catch (e) {
    window.__diagLog('7x. YT.Player threw: ' + (e && e.message), 'err');
  }
}

(function waitForYT(tries) {
  if (typeof YT !== 'undefined' && YT.ready) {
    window.__diagLog('5. YT global ready (' + tries + ' polls)', 'ok');
    YT.ready(bootPlayer);
    return;
  }
  if (tries > 60) {
    window.__diagLog('5x. YT.ready not available after 6s polling', 'err');
    return;
  }
  setTimeout(function () { waitForYT(tries + 1); }, 100);
})(0);

function onReady(event) {
  window.__diagLog('8. onReady', 'ok');
  try { event.target.playVideo(); window.__diagLog('8a. playVideo() called', 'ok'); }
  catch (e) { window.__diagLog('8x. playVideo threw: ' + e.message, 'err'); }
}

function onStateChange(event) {
  var stateNames = { '-1': 'UNSTARTED', 0: 'ENDED', 1: 'PLAYING', 2: 'PAUSED', 3: 'BUFFERING', 5: 'CUED' };
  window.__diagLog('9. state=' + (stateNames[event.data] || event.data), 'info');
  if (!error) { /* would post to native */ }
  else { error = false; }
}

function onPlaybackQualityChange(event) { /* noop in test */ }

function onPlayerError(event) {
  window.__diagLog('!! onError code=' + event.data, 'err');
  if (event.data == 100) error = true;
}

window.onresize = function () {
  if (player) { try { player.setSize(window.innerWidth, window.innerHeight); } catch (e) {} }
};
</script>
</body>
</html>`;

// === Run the test ====================================================
async function main() {
  // Spin up a tiny local server that serves our HTML.
  // We use a real http origin (http://localhost:PORT) so YouTube sees a
  // proper Referer when the iframe loads.
  const PORT = 4477;
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.end(html);
  });
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Test server running at http://localhost:${PORT}/`);

  console.log('Launching headless WebKit (Apple engine) with iOS UA…');
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
    const url = r.url();
    if (url.includes('youtube') || url.includes('googlevideo') || url.includes('ytimg') || url.includes('localhost:' + PORT)) {
      requests.push({ method: r.method(), url, referer: r.headers().referer || '(none)' });
    }
  });

  const page = await ctx.newPage();
  const consoleLines = [];
  page.on('console', (msg) => {
    consoleLines.push('[' + msg.type() + '] ' + msg.text());
  });
  page.on('pageerror', (err) => {
    consoleLines.push('[pageerror] ' + (err.message || err));
  });

  console.log(`Navigating to http://localhost:${PORT}/`);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });

  // Give the player up to 20 seconds to reach PLAYING.
  let reachedPlaying = false;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const diag = await page.locator('#diag').innerText().catch(() => '');
    if (diag.includes('state=PLAYING')) { reachedPlaying = true; break; }
    if (diag.includes('!! onError')) break;
    await page.waitForTimeout(500);
  }

  const diagFinal = await page.locator('#diag').innerText().catch(() => '(no diag)');
  const out = join(ROOT, 'test-results', 'yt-player-headless.png');
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: false });

  console.log('\n=== DIAGNOSTIC STRIP ===');
  console.log(diagFinal);
  console.log('\n=== CONSOLE / ERRORS ===');
  for (const l of consoleLines.slice(0, 40)) console.log(l);
  console.log('\n=== KEY NETWORK REQUESTS (first 20) ===');
  for (const r of requests.slice(0, 20)) {
    console.log(`  ${r.method} ${r.url.slice(0, 120)}`);
    console.log(`    Referer: ${r.referer}`);
  }
  console.log(`\nSCREENSHOT: ${out}`);
  console.log(reachedPlaying ? '\nRESULT: ✅ PLAYING REACHED' : '\nRESULT: ❌ DID NOT REACH PLAYING');

  await browser.close();
  server.close();
  process.exit(reachedPlaying ? 0 : 1);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
