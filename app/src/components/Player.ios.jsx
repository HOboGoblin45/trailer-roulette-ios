import { useEffect, useRef, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { backdropUrl, posterUrl } from '../lib/tmdb.js';
import { watchUrl } from '../lib/youtube.js';
import * as haptics from '../lib/haptics.js';

/**
 * iOS player (v1.4.0) — SFSafariViewController via @capacitor/browser.
 *
 * Story so far: v1.0.x used SFSafariViewController, but we couldn't confirm
 * Browser.open was firing reliably so we pivoted to inline iframe (v1.1.0)
 * → IFrame Player API (v1.2.0) → tried iosScheme=https (v1.3.2). YouTube's
 * embed validates the WKWebView's parent origin and rejects every variant
 * of localhost we threw at it ("Video player configuration error 153").
 *
 * SFSafariViewController is a real Safari context — YouTube treats it like
 * any other Safari tab and plays without complaint. It's also the path
 * Apple's HIG recommends for third-party web content, so this is App-Store-
 * compliant by design.
 *
 * Flow:
 *   1. User sees the trailer card (poster backdrop + Play button + meta).
 *   2. Tap Play → Browser.open(watchUrl) → SFSafariViewController slides in.
 *   3. User watches as long as they want.
 *   4. User dismisses → browserFinished listener fires → parent advances
 *      to the next trailer (the dismiss IS the advance signal).
 *
 * No background cycle timer — on iOS the user controls pacing. The 90s
 * cycle is a web-only behavior driven by the IFrame API. iOS users get
 * the swipe gestures (Seen it / Skip it) and the Watchlist heart for
 * the same control surface.
 */
export default function PlayerIOS({
  trailer,
  isPlaying,
  onPlay,
  onPause,
  onEnded,
  // onDurationKnown intentionally unused on iOS — no in-app cycle.
}) {
  const browserOpenRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(null);

  // Stable callback refs (parent re-renders shouldn't churn the listener).
  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  // Listen for Safari dismiss exactly once.
  useEffect(() => {
    let listener;
    let cancelled = false;
    (async () => {
      try {
        listener = await Browser.addListener('browserFinished', () => {
          browserOpenRef.current = false;
          onPauseRef.current?.();
          // Treat the dismiss as the user telling us they're done with
          // this trailer → advance the queue. They can always swipe back
          // in a future version, but for v1 dismiss = "next, please."
          onEndedRef.current?.();
        });
      } catch (e) {
        if (!cancelled) setError(`browser listener: ${e?.message || e}`);
      }
    })();
    return () => {
      cancelled = true;
      try { listener?.remove(); } catch { /* noop */ }
    };
  }, []);

  // If parent flips isPlaying off (e.g. background pause), close Safari.
  useEffect(() => {
    if (!isPlaying && browserOpenRef.current) {
      Browser.close().catch(() => {});
      browserOpenRef.current = false;
    }
  }, [isPlaying]);

  const handlePlay = async () => {
    if (!trailer?.youtubeKey || opening) return;
    haptics.medium();
    setOpening(true);
    setError(null);
    try {
      await Browser.open({
        url: watchUrl(trailer.youtubeKey),
        presentationStyle: 'fullscreen',
      });
      browserOpenRef.current = true;
      onPlay?.();
    } catch (e) {
      const msg = e?.message || String(e);
      console.warn('[PlayerIOS] Browser.open failed', e);
      setError(`Couldn't open trailer: ${msg}`);
    } finally {
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
        className="player-play-button"
        onClick={handlePlay}
        disabled={!hasTrailer || opening}
        aria-label={hasTrailer ? 'Play trailer' : 'No trailer available'}
        style={{ opacity: hasTrailer ? 1 : 0.5 }}
      >
        <span className="play-icon" aria-hidden="true">▶</span>
        <span className="play-label">
          {opening ? 'Opening…' : (hasTrailer ? 'Play' : 'No trailer')}
        </span>
      </button>

      {!hasTrailer && (
        <p className="player-hint">No trailer available — swipe to skip.</p>
      )}

      {error && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            background: 'rgba(226, 109, 92, 0.92)',
            color: '#fff',
            padding: 8,
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'monospace',
            wordBreak: 'break-all',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
