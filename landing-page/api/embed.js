/**
 * Trailer Roulette YouTube embed proxy — server-rendered.
 *
 * v1.9.0: this is the proxy that the iOS TrailerPlayer plugin navigates
 * to directly as the WKWebView's main frame. Verified in headless WebKit
 * with iOS UA — Rick Astley plays in 2-3 seconds.
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

  // Listen for postMessages from the YT iframe and forward to native.
  // YT IFrame API messages are JSON-encoded strings with shape:
  //   { event: 'onStateChange', info: 1 }   // 1 = PLAYING, 0 = ENDED, etc.
  //   { event: 'onError', info: 101 }
  //   { event: 'onReady' }
  //   { event: 'initialDelivery', ... }
  //   { event: 'infoDelivery', info: { ... } }
  window.addEventListener('message', function (e) {
    if (!e || !e.data) return;
    if (e.origin !== 'https://www.youtube-nocookie.com' && e.origin !== 'https://www.youtube.com') return;
    var data = e.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (err) { return; }
    }
    if (!data || !data.event) return;
    if (data.event === 'onStateChange') {
      toNative({ kind: 'stateChange', state: data.info });
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
