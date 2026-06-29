/**
 * YouTube URL helpers. We never download or modify YouTube content — we only
 * construct URLs that point at the official watch page or embeddable player.
 *
 * Playback note: iOS does NOT use these helpers — the native `trailer-player`
 * plugin builds and loads the Vercel /embed proxy URL itself (see
 * Player.ios.jsx). Web uses `embedUrl` directly (the IFrame API in
 * Player.web.jsx), since browsers send a proper referrer natively. These
 * helpers remain for the web embed and for share/watch URLs.
 */

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
