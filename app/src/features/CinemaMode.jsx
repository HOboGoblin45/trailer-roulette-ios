import './cinema-mode.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { discoverRandomMix, getTrailer, toTrailerCandidate, genreNames } from '../lib/tmdb.js';
import * as airplay from '../lib/airplay.js';
import Player from '../components/Player.jsx';
import * as haptics from '../lib/haptics.js';

/**
 * Cinema Mode — a hands-free, muted-by-default "lean-back" channel built for
 * casting to a TV. On open it starts streaming a continuous, era-diverse feed
 * of random trailers and NEVER stops on its own:
 *
 *  - A small queue is kept topped up from `discoverRandomMix()`; each candidate's
 *    YouTube key is resolved via `getTrailer()` and ones without a trailer are
 *    dropped. A `nextTrailer` is always prefetched so advancing is seamless.
 *  - On `onEnded` / `onAdvanceInPlace` we advance to the next item; if the queue
 *    runs low we fetch another batch. Fetch failures retry shortly and the
 *    channel keeps playing.
 *  - Chrome (title pill + bottom controls) auto-hides after ~4s of no
 *    interaction and reappears on tap anywhere.
 */

const HIDE_DELAY_MS = 4000;       // idle time before chrome fades
const QUEUE_LOW_WATER = 3;        // refill when fewer than this remain queued
const QUEUE_TARGET = 6;           // stop pulling batches once we have this many
const RETRY_DELAY_MS = 2500;      // backoff after a failed/empty fetch
const MAX_RESOLVE_PER_BATCH = 12; // cap trailer lookups per batch (latency guard)

export default function CinemaMode({ onClose }) {
  // --- playback state ---
  const [current, setCurrent] = useState(null);   // movie w/ .youtubeKey
  const [next, setNext] = useState(null);         // prefetched next movie
  const [playSignal, setPlaySignal] = useState(0);
  const [muted, setMuted] = useState(true);       // ambient by default
  const [status, setStatus] = useState('loading'); // loading | playing | error
  const [chromeVisible, setChromeVisible] = useState(true);

  // --- refs (avoid stale closures inside async loops / event handlers) ---
  const queueRef = useRef([]);            // resolved movies waiting to play
  const seenIdsRef = useRef(new Set());   // de-dupe across batches
  const fetchingRef = useRef(false);      // a batch fetch is in flight
  const mountedRef = useRef(true);
  const currentRef = useRef(null);
  const nextRef = useRef(null);
  const hideTimerRef = useRef(null);
  const retryTimerRef = useRef(null);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  // ----- Fetch & resolve a fresh batch of trailers into the queue -----
  const fillQueue = useCallback(async () => {
    if (fetchingRef.current) return;
    if (queueRef.current.length >= QUEUE_TARGET) return;
    fetchingRef.current = true;
    try {
      const raw = await discoverRandomMix();
      if (!mountedRef.current) return;

      // Shuffle so the era-banded batch doesn't always play oldest-first.
      const candidates = (raw || [])
        .map(toTrailerCandidate)
        .filter((m) => m && m.id && !seenIdsRef.current.has(m.id));
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }

      let resolved = 0;
      let added = 0;
      for (const cand of candidates) {
        if (!mountedRef.current) return;
        if (resolved >= MAX_RESOLVE_PER_BATCH) break;
        if (queueRef.current.length >= QUEUE_TARGET) break;
        resolved += 1;
        seenIdsRef.current.add(cand.id);
        try {
          const video = await getTrailer(cand.id);
          if (video && video.key) {
            queueRef.current.push({ ...cand, youtubeKey: video.key });
            added += 1;
          }
        } catch {
          // skip this one; keep going
        }
      }

      if (added === 0) {
        // Nothing playable surfaced — back off briefly, then try again so the
        // channel still comes alive without hammering the API.
        scheduleRetry();
      }
    } catch {
      if (mountedRef.current) scheduleRetry();
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) primeFromQueue();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (mountedRef.current) fillQueue();
    }, RETRY_DELAY_MS);
  }, [fillQueue]);

  // ----- Pull from queue to fill `current` (first load) and `next` (prefetch) -----
  const primeFromQueue = useCallback(() => {
    let changed = false;

    if (!currentRef.current && queueRef.current.length > 0) {
      const first = queueRef.current.shift();
      currentRef.current = first;
      setCurrent(first);
      setStatus('playing');
      setPlaySignal((s) => s + 1);
      changed = true;
    }

    if (currentRef.current && !nextRef.current && queueRef.current.length > 0) {
      const n = queueRef.current.shift();
      nextRef.current = n;
      setNext(n);
      changed = true;
    }

    // Keep the buffer healthy.
    if (queueRef.current.length < QUEUE_LOW_WATER && !fetchingRef.current) {
      fillQueue();
    }
    return changed;
  }, [fillQueue]);

  // ----- Advance to the next trailer (end of video, or user pressed Next) -----
  const advance = useCallback(() => {
    const upcoming = nextRef.current;
    if (upcoming) {
      currentRef.current = upcoming;
      setCurrent(upcoming);
      nextRef.current = null;
      setNext(null);
      setStatus('playing');
      setPlaySignal((s) => s + 1);
      // Refill next slot (and top up the queue if needed).
      primeFromQueue();
    } else {
      // Queue starved — show a brief buffering state and pull more. As soon as
      // the queue lands, primeFromQueue() promotes it into `current` again.
      currentRef.current = null;
      setCurrent(null);
      setStatus('loading');
      fillQueue();
    }
  }, [fillQueue, primeFromQueue]);

  // ----- Kick everything off on mount -----
  useEffect(() => {
    mountedRef.current = true;
    fillQueue();
    return () => {
      mountedRef.current = false;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [fillQueue]);

  // ----- Auto-hiding chrome -----
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setChromeVisible(false);
    }, HIDE_DELAY_MS);
  }, []);

  const wakeChrome = useCallback(() => {
    setChromeVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // Start the hide countdown whenever chrome becomes visible / something changes.
  useEffect(() => {
    if (chromeVisible) scheduleHide();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [chromeVisible, scheduleHide, current]);

  // ----- Control handlers -----
  const handleTapStage = useCallback(() => {
    // Tapping the stage toggles chrome: if hidden, reveal; if shown, keep alive.
    if (!chromeVisible) {
      setChromeVisible(true);
      scheduleHide();
    } else {
      scheduleHide();
    }
  }, [chromeVisible, scheduleHide]);

  const handleNext = useCallback(() => {
    haptics.medium();
    wakeChrome();
    advance();
  }, [advance, wakeChrome]);

  const handleToggleMute = useCallback(() => {
    haptics.light();
    wakeChrome();
    setMuted((m) => !m);
  }, [wakeChrome]);

  const handleAirplay = useCallback(() => {
    haptics.light();
    wakeChrome();
    try {
      airplay.presentRoutePicker();
    } catch {
      /* no-op on web */
    }
  }, [wakeChrome]);

  const handleClose = useCallback(() => {
    haptics.light();
    onClose && onClose();
  }, [onClose]);

  // ----- Derived display values -----
  const title = current?.title || '';
  const year = current?.year || null;
  const genres = current ? genreNames(current.genre_ids) : [];
  const primaryGenre = genres[0] || null;

  return (
    <div className={`feat feat-cinema cinema-root ${chromeVisible ? 'cinema-awake' : 'cinema-asleep'}`}>
      <button className="feat-close cinema-close" onClick={handleClose} aria-label="Close">✕</button>

      {/* Full-bleed video stage. The tap layer wakes/holds the chrome. */}
      <div className="cinema-stage">
        {current ? (
          <div className="cinema-player">
            <Player
              trailer={current}
              nextTrailer={next}
              isPlaying
              muted={muted}
              playSignal={playSignal}
              onEnded={advance}
              onAdvanceInPlace={advance}
            />
          </div>
        ) : null}

        {/* Tap-to-wake overlay sits above the video, below the chrome. */}
        <div
          className="cinema-tap"
          onClick={handleTapStage}
          role="presentation"
          aria-hidden="true"
        />

        {/* Cinematic gradients top & bottom for legible chrome over any frame. */}
        <div className="cinema-grad cinema-grad-top" aria-hidden="true" />
        <div className="cinema-grad cinema-grad-bottom" aria-hidden="true" />

        {/* First-load / buffering state. */}
        {status === 'loading' && !current ? (
          <div className="cinema-loading" role="status" aria-live="polite">
            <div className="cinema-spinner" aria-hidden="true" />
            <div className="cinema-loading-text">Tuning the channel…</div>
          </div>
        ) : null}

        {status === 'error' && !current ? (
          <div className="cinema-loading" role="status" aria-live="polite">
            <div className="cinema-loading-text">Reconnecting…</div>
          </div>
        ) : null}

        {/* ===== Top chrome: LIVE pill + now-playing title ===== */}
        <div className="cinema-top">
          <div className="cinema-pill">
            <span className="cinema-dot" aria-hidden="true" />
            <span className="cinema-pill-label">LIVE</span>
          </div>
          {title ? (
            <div className="cinema-nowplaying">
              <span className="cinema-eyebrow">NOW PLAYING</span>
              <h1 className="cinema-title" title={title}>{title}</h1>
              <div className="cinema-meta">
                {year ? <span className="cinema-year">{year}</span> : null}
                {year && primaryGenre ? <span className="cinema-sep" aria-hidden="true">•</span> : null}
                {primaryGenre ? <span className="cinema-genre">{primaryGenre}</span> : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* ===== Bottom chrome: Mute · Next · AirPlay ===== */}
        <div className="cinema-bottom">
          <div className="cinema-controls">
            <button
              type="button"
              className={`cinema-btn cinema-btn-circle ${muted ? '' : 'cinema-btn-active'}`}
              onClick={handleToggleMute}
              aria-pressed={!muted}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MuteIcon /> : <SoundIcon />}
            </button>

            <button
              type="button"
              className="cinema-btn cinema-btn-next"
              onClick={handleNext}
              aria-label="Skip to next trailer"
            >
              <NextIcon />
              <span className="cinema-next-label">Next</span>
            </button>

            <button
              type="button"
              className="cinema-btn cinema-btn-circle"
              onClick={handleAirplay}
              aria-label="AirPlay to a TV"
            >
              <AirplayIcon />
            </button>
          </div>
          <div className="cinema-hint">
            {muted ? 'Muted · tap unmute for sound' : 'Sound on'}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Inline icons (no external deps) ---------------- */

function MuteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"
      stroke="currentColor" strokeWidth="1" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4l10 8-10 8V4z" />
      <rect x="17" y="4" width="2.4" height="16" rx="1" stroke="none" />
    </svg>
  );
}

function AirplayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
      <path d="M12 15l5 6H7l5-6z" fill="currentColor" stroke="none" />
    </svg>
  );
}
