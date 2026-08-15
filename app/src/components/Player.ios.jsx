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
 *
 * Two surfaces host this component and they need different chrome:
 *   - the main roulette stage, where the bottom Play/AirPlay row is the app's
 *     signature affordance, so the stage carries NO play button of its own
 *     (`showPlayButton={false}`);
 *   - the five fun modes, which have no such row. They start playback for the
 *     user (each bumps playSignal), but if the native player is dismissed the
 *     on-stage glass Play is the only way back in — so it stays on by default.
 * Either way, the moment a play starts the stage becomes the progress
 * indicator: spinner + caption over the movie's own artwork.
 */

/** The artwork this movie shows on stage — and hands to the native player. */
function stageArt(movie) {
  return backdropUrl(movie?.backdrop_path) || posterUrl(movie?.poster_path) || '';
}

export default function PlayerIOS({
  trailer,
  nextTrailer,
  playlist = [],
  isPlaying,
  muted = false,
  playSignal,
  // The host tells us whether it already provides a Play control. Default true
  // so a surface that forgets keeps a way to start playing.
  showPlayButton = true,
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
  // A flag, never a message: whatever the native layer throws (NSError text,
  // WebKit navigation codes) is for the console, not for the stage.
  const [failed, setFailed] = useState(false);

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
  useEffect(() => { setFailed(false); }, [trailer?.youtubeKey]);

  // The host's own Play control (the roulette's bottom pill, a mode's start
  // button) bumps playSignal rather than calling in — one signal, so every
  // surface starts playback the same way.
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

  // Latest-value refs, so the safety net below never calls a stale closure.
  const trailerRef = useRef(trailer);
  const openTrailerRef = useRef(null);
  useEffect(() => { trailerRef.current = trailer; }, [trailer]);

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

  // CONTINUOUS PLAYBACK SAFETY NET.
  //
  // The effect above is the intended path, and it is edge-triggered: it only
  // runs when trailer.youtubeKey CHANGES. Every way that edge can be missed
  // ends the same way for the user — the player is closed, a session is still
  // active, and nothing reopens it, so they have to press Play again for the
  // next trailer. That is the single complaint that has outlived every other
  // fix in this app, and no amount of reasoning about the races has removed it.
  //
  // So stop relying on catching the edge. This polls the same three conditions
  // and reopens whenever they are all true: a session the user started, no
  // modal currently open or opening, and a real key to play. It cannot fight
  // the user, because deliberately closing the player clears sessionRef, and it
  // cannot double-open, because openTrailer bails while openingRef is set.
  //
  // Worst case it costs one reopen up to POLL_MS late; the alternative is a
  // dead stop that needs a tap.
  useEffect(() => {
    const POLL_MS = 1200;
    const t = setInterval(() => {
      if (!sessionRef.current) return;
      if (openingRef.current) return;
      if (!trailerRef.current?.youtubeKey) return;
      openTrailerRef.current?.();
    }, POLL_MS);
    return () => clearInterval(t);
  }, []);

  // The queue as YouTube will receive it: current trailer first, then every
  // upcoming one whose key is already known, de-duplicated and capped.
  const playablePlaylist = (() => {
    const seen = new Set();
    const out = [];
    const push = (m) => {
      if (!m?.youtubeKey || seen.has(m.youtubeKey)) return;
      seen.add(m.youtubeKey);
      out.push({ key: m.youtubeKey, title: m.title || '' });
    };
    push(trailer);
    for (const m of playlist) { if (out.length >= 25) break; push(m); }
    return out;
  })();
  const playlistKeys = playablePlaylist.map((m) => m.key);
  const playlistTitlesFor = (keys) => {
    const byKey = new Map(playablePlaylist.map((m) => [m.key, m.title]));
    return keys.map((k) => byKey.get(k) || '');
  };

  const openTrailer = async () => {
    if (!trailer?.youtubeKey || openingRef.current) return;
    haptics.medium();
    setOpening(true);
    setFailed(false);
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
        // Hand the stage's own artwork to the native player so the modal
        // dissolves onto this movie rather than onto 2-3s of black while the
        // proxy page loads. Empty string is a silent no-op natively, so a
        // movie with no art behaves exactly as before.
        posterUrl: stageArt(trailer),
        // v3.4.0: hand YouTube the queue so its own player sequences it. Only
        // entries that already have a key can go in - prefetch fills them a few
        // ahead - and the current trailer must lead. When the batch runs out
        // the old end-detection path takes over and reopens with a fresh one,
        // so this is seamless within a batch rather than forever.
        playlist: playlistKeys,
        playlistTitles: playlistTitlesFor(playlistKeys),
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
      // Diagnostics stay in the console (and in errorLog via the global
      // handlers); the stage only ever says something a person can act on.
      console.warn('[PlayerIOS] openTrailer failed', e);
      setFailed(true);
      openingRef.current = false;
      sessionRef.current = false;
      onPause?.();
    } finally {
      setOpening(false);
    }
  };

  // Keep the safety net pointed at the current closure.
  openTrailerRef.current = openTrailer;

  if (!trailer) {
    return (
      <div className="player player-empty" aria-busy="true">
        <div className="player-spinner" />
        <p className="player-empty-caption" role="status">Finding a trailer…</p>
      </div>
    );
  }

  const bg = stageArt(trailer);
  const hasTrailer = Boolean(trailer.youtubeKey);

  return (
    <div className={`player player-ios${opening ? ' player-empty' : ''}`} aria-busy={opening || undefined}>
      {bg && (
        <div
          className="player-backdrop"
          style={{ backgroundImage: `url("${bg}")` }}
          aria-hidden="true"
        />
      )}

      {/* One centre slot, three states — never two of them at once, so the
          stage always says exactly one thing. */}
      {failed ? (
        <div role="alert" className="player-error">
          <div>Couldn&apos;t start this trailer.</div>
          {/* The reason is in the console; the user gets a way out instead. */}
          <button type="button" className="tr-pill" onClick={openTrailer}>
            Try again
          </button>
        </div>
      ) : opening ? (
        /* The one moment the app most needs to speak: the native modal takes
           2-3s of network to appear, and before this the only cue was the
           button dimming, so people re-tapped or assumed a hang. The stage
           itself becomes the progress indicator — the app's own spinner over
           the movie's artwork, captioned, announced. */
        <>
          <div className="player-spinner" aria-hidden="true" />
          <p className="player-empty-caption" role="status">Opening trailer…</p>
        </>
      ) : showPlayButton ? (
        <button
          type="button"
          className="player-play-button"
          onClick={openTrailer}
          disabled={!hasTrailer}
          aria-label={hasTrailer ? `Play ${trailer.title || 'trailer'}` : 'No trailer available'}
        >
          <svg className="play-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {/* Centroid sits at the viewBox center (12,12), so flexbox centering =
                true optical centering — no per-font margin nudging required. */}
            <path d="M9 6v12l9-6z" fill="currentColor" />
          </svg>
          <span className="play-label">
            {hasTrailer ? 'Play trailer' : 'No trailer'}
          </span>
        </button>
      ) : null}

      {!hasTrailer && !opening && !failed && (
        <p className="player-hint">Finding another…</p>
      )}
    </div>
  );
}
