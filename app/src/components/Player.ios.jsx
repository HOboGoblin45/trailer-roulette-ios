import { useEffect, useRef } from 'react';
import { Browser } from '@capacitor/browser';
import { backdropUrl, posterUrl } from '../lib/tmdb.js';
import { watchUrl } from '../lib/youtube.js';

/**
 * iOS player — SFSafariViewController via @capacitor/browser.
 *
 * We don't render the trailer inline; we render a "tap to play" poster with
 * blurred backdrop, and on tap we open the YouTube watch URL inside the secure
 * in-app browser. This is App-Store-safe and keeps us inside YouTube's ToS.
 *
 * The cycle timer in TrailerRoulette closes the browser at 90s and advances
 * to the next trailer. The user can also tap "Done" to dismiss early.
 */
export default function PlayerIOS({ trailer, isPlaying, onPlay, onPause }) {
  const browserOpen = useRef(false);

  // Listen for browser dismiss → mark paused so the cycle timer pauses too.
  useEffect(() => {
    const sub = Browser.addListener('browserFinished', () => {
      browserOpen.current = false;
      onPause?.();
    });
    return () => { sub?.then?.((s) => s?.remove?.()); };
  }, [onPause]);

  // If parent flips isPlaying off (e.g. cycle expired), close the browser.
  useEffect(() => {
    if (!isPlaying && browserOpen.current) {
      Browser.close().catch(() => {});
      browserOpen.current = false;
    }
  }, [isPlaying]);

  const open = async () => {
    if (!trailer?.youtubeKey) return;
    try {
      onPlay?.();
      browserOpen.current = true;
      await Browser.open({
        url: watchUrl(trailer.youtubeKey),
        presentationStyle: 'fullscreen',
      });
    } catch (err) {
      console.error('[PlayerIOS] Browser.open failed', err);
      browserOpen.current = false;
      onPause?.();
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

  return (
    <div className="player player-ios">
      {bg && (
        <div
          className="player-backdrop"
          style={{ backgroundImage: `url("${bg}")` }}
          aria-hidden="true"
        />
      )}
      <button className="player-play-button" onClick={open} aria-label="Play trailer">
        <span className="play-icon">▶</span>
        <span className="play-label">Play</span>
      </button>
      {!trailer.youtubeKey && (
        <p className="player-hint">No trailer available — try shuffle.</p>
      )}
    </div>
  );
}
