/**
 * Trailer Roulette YouTube embed proxy — server-rendered.
 *
 * v1.9.0: this is the proxy that the iOS TrailerPlayer plugin navigates
 * to directly as the WKWebView's main frame. Verified in headless WebKit
 * with iOS UA — Rick Astley plays in 2-3 seconds.
 *
 * v3.1.0: ad-aware end detection. YouTube fires onStateChange ENDED (0) when
 * a pre-roll AD finishes, before the real video plays; forwarding that raw
 * event cut trailers off after ~15s. The page now tracks playback progress
 * (infoDelivery currentTime/duration) and only forwards a real end — one that
 * reached the video's true end, or that stays ended without an ad boundary
 * resuming playback within a short window. Backward compatible: the forwarded
 * event still carries { kind:'stateChange', state } (now plus t/d), which older
 * native builds ignore, so already-shipped builds get the fix too.
 *
 * Why this works where every other approach failed:
 *   - The page is at https://trailer-roulette.vercel.app/embed (a real
 *     third-party https origin from YouTube's perspective)
 *   - The YouTube iframe inside this page sees a normal Referer of
 *     https://trailer-roulette.vercel.app/ — not youtube.com (which
 *     YT rejects as a self-embed) and not capacitor:// (which YT rejects
 *     as not a real origin)
 *   - enablejsapi=1 lets us listen for player events via postMessage
 *   - The page's own script forwards events to native via
 *     webkit.messageHandlers.trailerEvent, which the iOS plugin's
 *     userContentController is wired to
 *
 * Test scripts that verify this works:
 *   scripts/test-vercel-direct.mjs (headless WebKit, iOS UA)
 *
 * Endpoint:  GET https://trailer-roulette.vercel.app/api/embed?v=KEY
 * Rewrite:   /embed → /api/embed (configured in vercel.json)
 */

export const config = {
  runtime: 'edge',
};

const VALID_ID = /^[A-Za-z0-9_-]{6,20}$/;

function safeText(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export default async function handler(request) {
  const url = new URL(request.url);
  const v = url.searchParams.get('v') || '';
  const autoplay = url.searchParams.get('autoplay') === '0' ? '0' : '1';
  const mute = url.searchParams.get('mute') === '1' ? '1' : '0';
  const controls = url.searchParams.get('controls') === '0' ? '0' : '1';
  const ivLoadPolicy = url.searchParams.get('iv_load_policy') === '3' ? '3' : '1';
  const fs = url.searchParams.get('fs') === '0' ? '0' : '1';

  if (!VALID_ID.test(v)) {
    return new Response(`<!doctype html><meta charset=utf-8><title>Trailer</title><body style="margin:0;background:#000;color:#aaa;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">Invalid or missing video id.</body>`, {
      status: 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  // The IFRAME src must include `enablejsapi=1` for postMessage events
  // to fire. `origin` should match the page hosting the iframe so YT's
  // origin-validation passes; that's our Vercel host.
  const ytSrc =
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}` +
    `?autoplay=${autoplay}` +
    `&mute=${mute}` +
    `&controls=${controls}` +
    `&iv_load_policy=${ivLoadPolicy}` +
    `&fs=${fs}` +
    `&playsinline=1` +
    `&rel=0` +
    `&modestbranding=1` +
    `&enablejsapi=1` +
    `&origin=${encodeURIComponent('https://trailer-roulette.vercel.app')}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>Trailer</title>
<style>
  html, body { margin:0; padding:0; height:100%; background:#000; overflow:hidden; }
  iframe { border:0; width:100%; height:100%; display:block; }
</style>
</head>
<body>
<iframe
  id="yt"
  src="${safeText(ytSrc)}"
  title="Trailer ${safeText(v)}"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowfullscreen
  referrerpolicy="strict-origin-when-cross-origin"
  loading="eager"
></iframe>
<script>
(function () {
  // Bridge to native (iOS WKWebView). webkit.messageHandlers.trailerEvent
  // is set up by the TrailerPlayer.swift plugin's userContentController.
  // On desktop browsers, this is a no-op — the page still plays normally.
  function toNative(event) {
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.trailerEvent) {
        window.webkit.messageHandlers.trailerEvent.postMessage(event);
      }
    } catch (e) {}
  }

  // Tell the YT iframe we're listening. Must be done after the iframe
  // loads. We send the message a few times in case the first attempts
  // race the iframe's own bootstrap.
  var iframe = document.getElementById('yt');
  function sendListening() {
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'listening', id: '${v}', channel: 'widget' }),
        'https://www.youtube-nocookie.com'
      );
    } catch (e) {}
  }
  iframe.addEventListener('load', function () {
    sendListening();
    setTimeout(sendListening, 500);
    setTimeout(sendListening, 1500);
    toNative({ kind: 'iframeLoaded' });
  });

  // Ad-aware end detection (v3.1.0) -------------------------------------
  // YouTube fires onStateChange ENDED (0) when a PRE-ROLL AD finishes, before
  // the real video plays. Forwarding that as "ended" cut the trailer off after
  // ~15s. We only forward a real end: either playback reached the end of a
  // plausibly-long video, or the player stays ended without resuming within a
  // short confirm window (an ad boundary resumes playback and cancels it). The
  // native plugin (TrailerPlayer.swift) and the web player (endDetection.js)
  // mirror this exact logic, so the fix holds even on older app builds and
  // even if a build ships before this proxy is redeployed.
  var CONFIRM_MS = 1200, MIN_CONTENT = 32, END_EPS = 1.5;
  var lastTime = 0, lastDuration = 0, endTimer = null;
  function clearEndTimer() { if (endTimer) { clearTimeout(endTimer); endTimer = null; } }
  function forwardEnded() { clearEndTimer(); toNative({ kind: 'stateChange', state: 0, t: lastTime, d: lastDuration }); }
  function resetProgress() { lastTime = 0; lastDuration = 0; clearEndTimer(); }

  // Gapless swap (v2.9.0): swap the playing video WITHOUT reloading the page.
  // The native player calls window.trLoad('NEWID') instead of navigating to a
  // fresh /embed?v=NEWID — the YT player is already initialized, so this is a
  // ~0.5s in-player swap rather than a 2-3s cold page load. Older app builds
  // that don't call this are unaffected (the page still autoplays ?v= on load).
  var VALID = /^[A-Za-z0-9_-]{6,20}$/;
  window.trLoad = function (id) {
    if (!VALID.test(id || '')) return false;
    try {
      resetProgress(); // new video — forget the previous clip's progress
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'loadVideoById', args: [String(id)] }),
        'https://www.youtube-nocookie.com'
      );
      // Re-assert our event listener against the freshly-loaded video.
      setTimeout(sendListening, 200);
      setTimeout(sendListening, 800);
      return true;
    } catch (e) { return false; }
  };

  // Listen for postMessages from the YT iframe and forward to native.
  // YT IFrame API messages are JSON-encoded strings with shape:
  //   { event: 'onStateChange', info: 1 }   // 1 = PLAYING, 0 = ENDED, etc.
  //   { event: 'onError', info: 101 }
  //   { event: 'onReady' }
  //   { event: 'initialDelivery', info: { currentTime, duration, ... } }
  //   { event: 'infoDelivery', info: { currentTime, duration, ... } }
  window.addEventListener('message', function (e) {
    if (!e || !e.data) return;
    if (e.origin !== 'https://www.youtube-nocookie.com' && e.origin !== 'https://www.youtube.com') return;
    var data = e.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (err) { return; }
    }
    if (!data || !data.event) return;

    if (data.event === 'infoDelivery' || data.event === 'initialDelivery') {
      // Track playback progress so we can tell a real end from an ad boundary.
      var info = data.info || {};
      if (typeof info.currentTime === 'number' && isFinite(info.currentTime)) lastTime = info.currentTime;
      if (typeof info.duration === 'number' && isFinite(info.duration) && info.duration > 0) lastDuration = info.duration;
      return;
    }

    if (data.event === 'onStateChange') {
      var state = data.info;
      if (state === 1 || state === 3) {
        // PLAYING / BUFFERING — playback (re)started, so any pending "ended"
        // was a pre-roll ad boundary. Cancel it and forward the live state.
        clearEndTimer();
        toNative({ kind: 'stateChange', state: state, t: lastTime, d: lastDuration });
      } else if (state === 0) {
        // ENDED — real end or ad boundary. Fast-path only if playback reached
        // the end of a plausibly-long clip; otherwise wait to confirm.
        if (lastDuration > 0 && lastTime >= lastDuration - END_EPS && lastTime >= MIN_CONTENT) {
          forwardEnded();
        } else {
          clearEndTimer();
          endTimer = setTimeout(forwardEnded, CONFIRM_MS);
        }
      } else {
        // PAUSED (2), CUED (5), UNSTARTED (-1) — forward unchanged.
        toNative({ kind: 'stateChange', state: state, t: lastTime, d: lastDuration });
      }
    } else if (data.event === 'onError') {
      toNative({ kind: 'error', code: data.info });
    } else if (data.event === 'onReady') {
      toNative({ kind: 'ready' });
    }
  });

  toNative({ kind: 'pageLoaded' });
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'Content-Security-Policy': "frame-ancestors *",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
