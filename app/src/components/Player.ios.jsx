import { useEffect, useRef, useState } from 'react';
import TrailerPlayer from 'trailer-player';
import { backdropUrl, posterUrl } from '../lib/tmdb.js';
import * as haptics from '../lib/haptics.js';

/**
 * iOS player (v1.6.0) — local TrailerPlayer Capacitor plugin.
 *
 * The plugin opens YouTube watch URLs in SFSafariViewController, which is
 * a real Safari context. This sidesteps:
 *   - WKWebView Referer-stripping bug (WebKit Bug 169846) that blocks
 *     every iframe-based approach with YouTube error 153
 *   - @capacitor/browser SceneDelegate fullscreen silent-fail bug
 *     (ionic-team/capacitor#5969)
 *
 * UX: tap Play → fullscreen Safari modal slides up → user watches →
 * dismiss → app advances to next trailer. The dismiss is the advance
 * signal; matches Apple's HIG for video content (TV+, Music videos,
 * etc. all use the same modal-fullscreen pattern).
 */
export default function PlayerIOS({ trailer, isPlaying, onPlay, onPause, onEnded }) {
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(null);

  // Reset error when trailer changes.
  useEffect(() => { setError(null); }, [trailer?.youtubeKey]);

  // If parent flips isPlaying off (e.g. background pause), close Safari.
  useEffect(() => {
    if (!isPlaying && openingRef.current) {
      TrailerPlayer.closeTrailer().catch(() => {});
      openingRef.current = false;
    }
  }, [isPlaying]);

  const handlePlay = async () => {
    if (!trailer?.youtubeKey || opening) return;
    haptics.medium();
    setOpening(true);
    setError(null);
    onPlay?.();
    openingRef.current = true;
    try {
      // Resolves when the user dismisses Safari. The plugin's resolve
      // shape is { dismissed: true, reason: 'user' | 'replaced' | ... }.
      await TrailerPlayer.openTrailer({ youtubeKey: trailer.youtubeKey });
      // Treat dismiss as "I'm done with this one, next" — matches the
      // app's channel-flipping intent. Reaction is null so we don't bias
      // the taste profile from a passive dismiss.
      onPause?.();
      onEnded?.();
    } catch (e) {
      const msg = e?.message || String(e);
      console.warn('[PlayerIOS] openTrailer failed', e);
      setError(`Couldn't open trailer: ${msg}`);
      onPause?.();
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };

  if (!trailer) {
    return (
      <div className="player player-empty" aria-busy="true">
        <div className="player-spinner" />
      </div>
    );
  }

  const bg = backdropUrl(trailer.backdrop_path) || posterUrl(trailer.poster_path);
  const hasTrailer = Boolean(trailer.youtubeKey);

  return (
    <div className="player player-ios">
      {bg && (
        <div
          className="player-backdrop"
          style={{ backgroundImage: `url("${bg}")` }}
          aria-hidden="true"
        />
      )}

      <button
        type="button"
        className="player-play-button"
        onClick={handlePlay}
        disabled={!hasTrailer || opening}
        aria-label={hasTrailer ? `Play ${trailer.title || 'trailer'}` : 'No trailer available'}
      >
        <span className="play-icon" aria-hidden="true">▶</span>
        <span className="play-label">
          {opening ? 'Opening…' : (hasTrailer ? 'Play trailer' : 'No trailer')}
        </span>
      </button>

      {!hasTrailer && (
        <p className="player-hint">Swipe to skip — we'll find another.</p>
      )}

      {error && (
        <div role="alert" className="player-error">
          {error}
        </div>
      )}
    </div>
  );
}
