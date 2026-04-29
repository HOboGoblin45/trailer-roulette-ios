import { useEffect, useState } from 'react';
import { backdropUrl, posterUrl } from '../lib/tmdb.js';
import { proxiedEmbedUrl } from '../lib/youtube.js';
import * as haptics from '../lib/haptics.js';

/**
 * iOS player (v1.5.0) — proxied YouTube embed via our Vercel-hosted page.
 *
 * The full saga: WKWebView strips the HTTP Referer header from cross-
 * origin requests to injected iframes (WebKit Bug 169846). YouTube's
 * July 2025 embedder-identity update made that referer mandatory and
 * started returning "Error 153 Video player configuration error" for
 * any embed without one. We hit this whether we used the IFrame Player
 * API or a static youtube-nocookie iframe, with capacitor:// or custom
 * scheme or https://localhost — none of those origins are valid public-
 * DNS https origins that YouTube will accept.
 *
 * The accepted community fix is to proxy the embed: load a tiny page on
 * a real public-DNS https origin (we already have https://trailer-
 * roulette.vercel.app/embed) and let *that* page embed the YouTube
 * iframe. YouTube sees a normal referrer from the proxy page and plays
 * the trailer. Our app's WebView just shows the proxy page in an iframe.
 *
 * This restores the inline UX of v1.1.0/v1.2.0 (no app-switching, no
 * Browser plugin, no Safari modal) while sidestepping the WebKit/YouTube
 * incompatibility entirely.
 */
export default function PlayerIOS({ trailer, isPlaying, onPlay, onPause }) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Reset load state when the trailer changes.
  useEffect(() => {
    setIframeLoaded(false);
  }, [trailer?.youtubeKey]);

  // Notify parent that we're playing as soon as we have a trailer with
  // a key. This kicks off the auto-advance cycle timer in TrailerRoulette.
  useEffect(() => {
    if (trailer?.youtubeKey) {
      onPlay?.();
      haptics.light();
    }
    return () => {
      onPause?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailer?.youtubeKey]);

  if (!trailer) {
    return (
      <div className="player player-empty" aria-busy="true">
        <div className="player-spinner" />
      </div>
    );
  }

  // No YouTube key — show backdrop with hint, no iframe.
  if (!trailer.youtubeKey) {
    const bg = backdropUrl(trailer.backdrop_path) || posterUrl(trailer.poster_path);
    return (
      <div className="player player-ios">
        {bg && (
          <div
            className="player-backdrop"
            style={{ backgroundImage: `url("${bg}")` }}
            aria-hidden="true"
          />
        )}
        <p className="player-hint">No trailer available — swipe to skip.</p>
      </div>
    );
  }

  // The proxy URL hides the YouTube iframe behind our public-DNS domain
  // so YouTube's referrer check passes.
  const src = proxiedEmbedUrl(trailer.youtubeKey, { autoplay: true, mute: false });

  return (
    <div className="player player-ios">
      {!iframeLoaded && (
        <div
          className="player-backdrop"
          style={{
            backgroundImage: `url("${backdropUrl(trailer.backdrop_path) || posterUrl(trailer.poster_path) || ''}")`,
          }}
          aria-hidden="true"
        />
      )}

      <iframe
        key={trailer.youtubeKey}
        title={trailer.title || 'Trailer'}
        src={src}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setIframeLoaded(true)}
        style={{
          width: '100%',
          height: '100%',
          border: 0,
          background: '#000',
        }}
      />
    </div>
  );
}
