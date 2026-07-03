import { useEffect, useRef, useState } from 'react';
import TrailerPlayer from 'trailer-player';
import { backdropUrl, posterUrl } from '../lib/tmdb.js';
import * as haptics from '../lib/haptics.js';

/**
 * iOS player (v2.0.0) — continuous, tap-free playback.
 *
 * The native TrailerPlayer plugin presents a fullscreen modal hosting a fresh
 * WKWebView that loads our Vercel proxy (https://trailer-roulette.vercel.app
 * /embed?v=ID) — a real third-party https origin YouTube accepts as an
 * embedder. (loadHTMLString gives an opaque origin, and WebKit Bug 169846
 * strips the Referer from WKWebView iframe requests — both yield YT error 153.
 * A real top-level https navigation is what makes embedded playback work.)
 *
 * Continuous model: the user taps Play once to begin a session. From then on
 * the native modal stays up and chains trailer→trailer in place — no
 * dismiss/re-present flash. We keep native primed with the upcoming key via
 * enqueueNext, and react to its 'advanced'/'skipped' events to keep the JS
 * queue and the metadata panel beneath the modal in sync.
 *
 * Fallback: if native isn't primed when a trailer ends (key not prefetched in
 * time) it resolves the openTrailer promise with reason 'ended'/'skip'; we
 * advance the queue and auto-reopen for the new current. So the session stays
 * continuous either way — the in-place path is just the seamless optimization.
 * Tapping Done ends the session (no advance, no reopen).
 */
export default function PlayerIOS({
  trailer,
  nextTrailer,
  isPlaying,
  muted = false,
  playSignal,
  onPlay,
  onPause,
  onEnded,
  onAdvanceInPlace,
  onClosed,        // (reason) => void — modal dismissed for ANY reason. Modes
                   // use this (not onPause) for their "done watching" step.
  onUnplayable,    // (youtubeKey) => void — a video id auto-skipped in place
  onMuteChanged,   // (muted) => void — user toggled sound inside the player
}) {
  const openingRef = useRef(false);   // true while the native modal is open
  const sessionRef = useRef(false);   // true once the user has started watching
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(null);

  // Latest callbacks without re-subscribing the native listener.
  const onAdvanceRef = useRef(onAdvanceInPlace);
  const onPlayRef = useRef(onPlay);
  const onUnplayableRef = useRef(onUnplayable);
  const onMuteChangedRef = useRef(onMuteChanged);
  useEffect(() => { onAdvanceRef.current = onAdvanceInPlace; }, [onAdvanceInPlace]);
  useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
  useEffect(() => { onUnplayableRef.current = onUnplayable; }, [onUnplayable]);
  useEffect(() => { onMuteChangedRef.current = onMuteChanged; }, [onMuteChanged]);

  // Reset error when the trailer changes.
  useEffect(() => { setError(null); }, [trailer?.youtubeKey]);

  // A tap on the swipe card bumps playSignal — start playback (the card
  // covers our own Play button, so taps are routed through here).
  useEffect(() => {
    if (!playSignal) return;
    if (openingRef.current || !trailer?.youtubeKey) return;
    openTrailer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSignal]);

  // Subscribe once to native in-place lifecycle events.
  useEffect(() => {
    let handle;
    let cancelled = false;
    (async () => {
      try {
        handle = await TrailerPlayer.addListener('trailerEvent', (evt) => {
          const event = evt?.event;
          if (event === 'started') {
            onPlayRef.current?.();
          } else if (event === 'advanced') {
            // Native chained to the next trailer in place. Advance the JS
            // queue (records "seen") so the metadata panel matches what's
            // now playing — the modal never closed, so we do NOT reopen.
            // If native skipped because the video was dead, record it so
            // that id never resurfaces this session.
            if (evt?.cause === 'unplayable' && evt?.from) {
              onUnplayableRef.current?.(evt.from);
            }
            onAdvanceRef.current?.('seen');
          } else if (event === 'skipped') {
            onAdvanceRef.current?.('skip');
          } else if (event === 'muteChanged') {
            onMuteChangedRef.current?.(!!evt?.muted);
          }
        });
      } catch {
        if (!cancelled) handle = undefined;
      }
    })();
    return () => { cancelled = true; try { handle?.remove?.(); } catch { /* noop */ } };
  }, []);

  // Keep native primed with the upcoming key while the modal is open, so it
  // can chain in place the instant the current trailer ends.
  useEffect(() => {
    if (!openingRef.current) return;
    if (!nextTrailer?.youtubeKey) return;
    TrailerPlayer.enqueueNext({
      youtubeKey: nextTrailer.youtubeKey,
      title: nextTrailer.title || '',
    }).catch(() => {});
  }, [nextTrailer?.youtubeKey, nextTrailer?.title]);

  // If the parent pauses (e.g. app backgrounded), close the native player.
  useEffect(() => {
    if (!isPlaying && openingRef.current) {
      TrailerPlayer.closeTrailer().catch(() => {});
      openingRef.current = false;
      sessionRef.current = false;
    }
  }, [isPlaying]);

  // Live mute/unmute while the modal is open (Cinema Mode's toggle, or any
  // parent flipping `muted` mid-session). The open call itself already
  // carries the initial value.
  useEffect(() => {
    if (!openingRef.current) return;
    TrailerPlayer.setMuted({ muted: !!muted }).catch(() => {});
  }, [muted]);

  // Continuous auto-reopen: when a new trailer becomes current while a
  // session is active and the modal is closed (the fallback path), reopen
  // automatically — no second tap. During in-place chaining the modal is
  // still open (openingRef true), so this stays out of the way.
  useEffect(() => {
    if (!sessionRef.current) return;
    if (openingRef.current) return;
    if (!trailer?.youtubeKey) return;
    openTrailer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailer?.youtubeKey]);

  const openTrailer = async () => {
    if (!trailer?.youtubeKey || openingRef.current) return;
    haptics.medium();
    setOpening(true);
    setError(null);
    sessionRef.current = true;
    openingRef.current = true;
    onPlay?.();
    try {
      const result = await TrailerPlayer.openTrailer({
        youtubeKey: trailer.youtubeKey,
        title: trailer.title || '',
        muted: !!muted,
        nextYoutubeKey: nextTrailer?.youtubeKey || '',
        nextTitle: nextTrailer?.title || '',
      });
      openingRef.current = false;
      onPause?.();

      const reason = String(result?.reason || '');
      if (reason === 'user' || reason === 'closed') {
        // User chose to stop (or the app closed the player). End the
        // session; stay on the current movie.
        sessionRef.current = false;
        onClosed?.(reason);
        return;
      }
      const unplayable = reason.startsWith('unplayable');
      // Fallback close (ended / skip / unplayable with nothing primed):
      // advance the queue; the auto-reopen effect plays the next one.
      onClosed?.(reason);
      onEnded?.({ unplayable, youtubeKey: result?.youtubeKey || trailer.youtubeKey, reason });
    } catch (e) {
      const msg = e?.message || String(e);
      console.warn('[PlayerIOS] openTrailer failed', e);
      setError(`Couldn't open trailer: ${msg}`);
      openingRef.current = false;
      sessionRef.current = false;
      onPause?.();
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
        type="button"
        className="player-play-button"
        onClick={openTrailer}
        disabled={!hasTrailer || opening}
        aria-label={hasTrailer ? `Play ${trailer.title || 'trailer'}` : 'No trailer available'}
      >
        <svg className="play-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {/* Centroid sits at the viewBox center (12,12), so flexbox centering =
              true optical centering — no per-font margin nudging required. */}
          <path d="M9 6v12l9-6z" fill="currentColor" />
        </svg>
        <span className="play-label">
          {opening ? 'Opening…' : (hasTrailer ? 'Play trailer' : 'No trailer')}
        </span>
      </button>

      {!hasTrailer && (
        <p className="player-hint">Finding another…</p>
      )}

      {error && (
        <div role="alert" className="player-error">
          {error}
        </div>
      )}
    </div>
  );
}
