/**
 * YouTube URL helpers. We never download or modify YouTube content — we only
 * construct URLs that point at the official watch page or embeddable player.
 *
 * Since v1.2.0 both iOS and web use the YouTube IFrame Player API
 * (see ytIframeApi.js + Player.{ios,web}.jsx). The embed URL below is
 * still the static-iframe fallback path for when the IFrame API can't
 * load (offline first-run, blocked CDN, etc.).
 */

export function watchUrl(youtubeKey) {
  // The canonical watch URL. SFSafariViewController loads this; YouTube serves
  // its own native player intact, ToS-compliant.
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
