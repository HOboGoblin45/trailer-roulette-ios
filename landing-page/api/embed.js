/**
 * Trailer Roulette YouTube embed proxy — server-rendered.
 *
 * v1.5.0 used a static landing-page/embed.html that injected the YT
 * iframe via document.createElement. WKWebView still stripped the Refer
 * header on that injection (WebKit Bug 169846 fires for any cross-origin
 * iframe load that goes through the WebView's networking stack, even
 * inside nested iframes). Result: black screen.
 *
 * This Edge Function serves the iframe HTML statically — the YouTube
 * iframe element is in the parsed HTML before any JS runs, so the iframe
 * load is not "dynamically injected" and WKWebView sets the referrer
 * normally.
 *
 * Deployed at: GET https://trailer-roulette.vercel.app/api/embed?v=KEY
 * Vercel rewrite (vercel.json): /embed → /api/embed
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

  const ytSrc = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}?autoplay=${autoplay}&mute=${mute}&controls=${controls}&playsinline=1&rel=0&modestbranding=1`;

  // Static HTML with the iframe element ALREADY in the document body.
  // No document.createElement, no JS injection, no setTimeout. The
  // YouTube iframe load is part of the initial document parse, which
  // sidesteps the WebKit Bug 169846 referer-stripping pattern.
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
  .err { color:#aaa; font:14px -apple-system,sans-serif; padding:24px; text-align:center; }
</style>
</head>
<body>
<iframe
  src="${safeText(ytSrc)}"
  title="Trailer ${safeText(v)}"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowfullscreen
  referrerpolicy="strict-origin-when-cross-origin"
  loading="eager"
></iframe>
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
