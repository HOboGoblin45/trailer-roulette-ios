/**
 * YouTube URL helpers. We never download or modify YouTube content — we only
 * construct URLs that point at the official watch page or embeddable player.
 *
 * On iOS, watch URLs open in SFSafariViewController via @capacitor/browser.
 * On web, the embed URL is loaded into an <iframe> by Player.web.jsx.
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
