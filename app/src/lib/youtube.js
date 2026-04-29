/**
 * YouTube URL helpers. We never download or modify YouTube content — we only
 * construct URLs that point at the official watch page or embeddable player.
 *
 * As of v1.5.0, iOS uses `proxiedEmbedUrl` to load YouTube via our Vercel-
 * hosted /embed proxy page (works around WebKit Bug 169846 + YouTube's
 * July 2025 referer-required embedder check). Web uses the regular
 * `embedUrl` directly because browsers send the proper referrer natively.
 */

// Where the proxy page is hosted. The proxy is just an HTML file at
// landing-page/embed.html that loads YouTube's official iframe with a
// real https origin in the referrer. See landing-page/embed.html for the
// full rationale.
const PROXY_BASE =
  // Read at build time so a self-hosted/forked deployment can override.
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_EMBED_PROXY_URL) ||
  'https://trailer-roulette.vercel.app/embed';

export function watchUrl(youtubeKey) {
  // The canonical watch URL — used by share sheets, AirPlay, fallbacks.
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeKey)}`;
}

export function embedUrl(youtubeKey, { autoplay = true, mute = false } = {}) {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    mute: mute ? '1' : '0',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeKey)}?${params}`;
}

/**
 * Proxied embed URL — for iOS Capacitor where direct YouTube iframes
 * fail with "Error 153 Video player configuration error" because
 * WKWebView strips the HTTP Referer header. The proxy page at
 * https://trailer-roulette.vercel.app/embed loads the actual YouTube
 * iframe with a normal https referrer YouTube accepts.
 */
export function proxiedEmbedUrl(youtubeKey, { autoplay = true, mute = false, controls = true } = {}) {
  const params = new URLSearchParams({
    v: youtubeKey,
    autoplay: autoplay ? '1' : '0',
    mute: mute ? '1' : '0',
    controls: controls ? '1' : '0',
  });
  return `${PROXY_BASE}?${params}`;
}
