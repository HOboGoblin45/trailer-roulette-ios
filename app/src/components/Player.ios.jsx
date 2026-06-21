import { useEffect, useRef, useState } from 'react';
import TrailerPlayer from 'trailer-player';
import { backdropUrl, posterUrl } from '../lib/tmdb.js';
import * as haptics from '../lib/haptics.js';

/**
 * iOS player (v1.6.0) — local TrailerPlayer Capacitor plugin.
 *
 * This component calls the plugin's openTrailer({ youtubeKey, title }).
 * The plugin presents a fullscreen modal UIViewController hosting a fresh
 * WKWebView, which does a top-level HTTPS navigation to the Vercel proxy
 * page (https://trailer-roulette.vercel.app/embed?v=ID) — not loadHTMLString,
 * and not SFSafariViewController. The proxy page hosts YouTube's official
 * iframe under a real third-party https origin, then forwards YT IFrame
 * Player events to native via webkit.messageHandlers.trailerEvent. The
 * plugin resolves the openTrailer promise on ended / user-dismiss /
 * unplayable.
 *
 * Why prior approaches failed: serving the iframe via loadHTMLString gives
 * it an opaque/null origin, so YouTube's referer-required embedder check
 * rejects playback, and WebKit Bug 169846 strips the Referer header from
 * WKWebView iframe requests — both yield YouTube error 153. Loading a real
 * https proxy page gives the iframe a legitimate origin and Referer, which
 * is what makes embedded playback work inside the WKWebView.
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
      // Resolves when the user dismisses the in-app modal player or
      // when the trailer ends naturally / errors. Resolve shape:
      //   { dismissed: true, reason: 'user' | 'ended' | 'replaced'
      //                            | 'unplayable:<ytErrorCode>' }
      const result = await TrailerPlayer.openTrailer({
        youtubeKey: trailer.youtubeKey,
        title: trailer.title || '',
      });
      onPause?.();

      // Surface unplayable-due-to-YT-restriction so the parent can mark
      // this video id as bad and never try it again this session.
      const reason = String(result?.reason || '');
      const unplayable = reason.startsWith('unplayable');
      onEnded?.({ unplayable, youtubeKey: trailer.youtubeKey, reason });
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
        <p className="player-hint">Swipe to skip — we&apos;ll find another.</p>
      )}

      {error && (
        <div role="alert" className="player-error">
          {error}
        </div>
      )}
    </div>
  );
}
