import { useEffect, useState } from 'react';
import { embedUrl } from '../lib/youtube.js';
import { backdropUrl, posterUrl } from '../lib/tmdb.js';

/**
 * iOS player — inline YouTube iframe embed (v1.1.0).
 *
 * Earlier versions opened the canonical youtube.com/watch URL in
 * SFSafariViewController via @capacitor/browser. That plugin path proved
 * fragile in the WKWebView/Capacitor stack — silent failures with no
 * surfaced error meant the Play button looked broken. The fallback chain
 * (window.open, location.href) had similar issues.
 *
 * The fix is to drop the plugin entirely and use the same iframe embed
 * the web version uses. This is YouTube-ToS compliant (their official
 * iframe player, no modifications), keeps the user in-app (better UX),
 * and lets the auto-advance cycle timer cleanly swap videos by changing
 * the iframe src.
 *
 * Capacitor 6's WKWebView is configured with:
 *   - allowsInlineMediaPlayback = true
 *   - mediaTypesRequiringUserActionForPlayback = []
 * so autoplay + playsinline works without any extra native config.
 */
export default function PlayerIOS({ trailer, isPlaying, onPlay, onPause }) {
  // Track whether the iframe has loaded so we can show a fallback if it stalls.
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(null);

  // Reset load state when the trailer changes.
  useEffect(() => {
    setIframeLoaded(false);
    setIframeError(null);
  }, [trailer?.youtubeKey]);

  // Notify parent that we're playing as soon as we have a trailer with a key.
  // This kicks off the auto-advance cycle timer in TrailerRoulette.
  useEffect(() => {
    if (trailer?.youtubeKey) {
      onPlay?.();
    }
    return () => {
      onPause?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailer?.youtubeKey]);

  // Loading skeleton while the queue resolves.
  if (!trailer) {
    return (
      <div className="player player-empty" aria-busy="true">
        <div className="player-spinner" />
      </div>
    );
  }

  // No trailer available — show poster backdrop with hint.
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
        <p className="player-hint">No trailer available — try shuffle.</p>
      </div>
    );
  }

  // Build the embed URL. youtube-nocookie domain + playsinline=1 + autoplay=1.
  // Mute is false by default — Capacitor's WKWebView config allows this.
  const src = embedUrl(trailer.youtubeKey, { autoplay: true, mute: false });

  return (
    <div className="player player-ios">
      {/* Backdrop shown until iframe finishes loading */}
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
        onLoad={() => setIframeLoaded(true)}
        onError={(e) => setIframeError(e?.message || 'iframe error')}
        style={{
          width: '100%',
          height: '100%',
          border: 0,
          background: '#000',
        }}
      />

      {iframeError && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            background: 'rgba(226, 109, 92, 0.9)',
            color: '#fff',
            padding: 8,
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'monospace',
          }}
        >
          Trailer failed to load: {iframeError}
        </div>
      )}
    </div>
  );
}
