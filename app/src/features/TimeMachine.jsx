import './time-machine.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  discoverByYear,
  getTrailer,
  toTrailerCandidate,
  genreNames,
  posterUrl,
} from '../lib/tmdb.js';
import Player from '../components/Player.jsx';
import * as haptics from '../lib/haptics.js';
import { useOverlay, useStageEnter } from './overlay.js';

const TITLE = 'Time Machine';
const FLOOR_YEAR = 1972;
const CEIL_YEAR = new Date().getFullYear();

// --- phases ---------------------------------------------------------------
// 'idle'     : intro screen, big year readout + Travel button
// 'spinning' : year digits flicker rapidly before settling
// 'loading'  : fetching that year's movies + resolving trailers
// 'playing'  : channel is running; Player drives the trailers
// 'error'    : a year came back empty/broken too many times

function randomYear(exclude) {
  let y = Math.floor(Math.random() * (CEIL_YEAR - FLOOR_YEAR + 1)) + FLOOR_YEAR;
  // Avoid landing on the same year twice in a row when we can help it.
  if (exclude != null && CEIL_YEAR > FLOOR_YEAR) {
    let guard = 0;
    while (y === exclude && guard < 8) {
      y = Math.floor(Math.random() * (CEIL_YEAR - FLOOR_YEAR + 1)) + FLOOR_YEAR;
      guard += 1;
    }
  }
  return y;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clampYear(y) {
  return Math.max(FLOOR_YEAR, Math.min(CEIL_YEAR, y));
}

export default function TimeMachine({ onClose }) {
  const { closing, close, dialogProps } = useOverlay({ onClose, label: TITLE });
  const [phase, setPhase] = useState('idle');
  const [displayYear, setDisplayYear] = useState(CEIL_YEAR);
  const [landedYear, setLandedYear] = useState(null);
  const [queue, setQueue] = useState([]); // resolved candidates w/ youtubeKey for current year
  const [idx, setIdx] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');

  // Player wiring
  const [current, setCurrent] = useState(null); // movie WITH youtubeKey
  const [next, setNext] = useState(null); // peek of next movie (key may be pending)
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSignal, setPlaySignal] = useState(0);

  // Refs so async loops always read fresh values and we can cancel cleanly.
  const spinTimer = useRef(null);
  const runIdRef = useRef(0); // bumped on every travel; stale async work bails
  const prefetchRef = useRef(new Map()); // movieId -> youtubeKey (or null) cache
  const jumpsRef = useRef(0); // total auto-jumps this run; guards against TMDB-down loops

  // -- cleanup on unmount --------------------------------------------------
  useEffect(() => {
    return () => {
      if (spinTimer.current) clearInterval(spinTimer.current);
      runIdRef.current += 1; // invalidate any in-flight async
    };
  }, []);

  // -- resolve a single trailer key (memoized per run) ---------------------
  const resolveKey = useCallback(async (movieId) => {
    const cache = prefetchRef.current;
    if (cache.has(movieId)) return cache.get(movieId);
    let key = null;
    try {
      const t = await getTrailer(movieId);
      key = t && t.key ? t.key : null;
    } catch {
      key = null;
    }
    cache.set(movieId, key);
    return key;
  }, []);

  // -- build a playable channel for a given year ---------------------------
  // Returns array of candidates that have a youtubeKey. Tries page(s) and a
  // small ±1 year nudge before giving up, so most years yield a channel.
  const buildChannel = useCallback(
    async (year, runId) => {
      const wanted = 6; // enough to start; we keep resolving lazily after
      const minNeeded = 2;
      const collected = [];
      const seen = new Set();

      const yearsToTry = [year, year + 1, year - 1].filter(
        (y) => y >= FLOOR_YEAR && y <= CEIL_YEAR
      );

      for (const y of yearsToTry) {
        for (const page of [1, 2]) {
          if (runId !== runIdRef.current) return null; // cancelled
          let raw;
          try {
            const data = await discoverByYear(y, { page });
            raw = (data && data.results) || [];
          } catch {
            raw = [];
          }
          // Popularity-ranked already; keep a stable-ish but lively order.
          const candidates = shuffle(
            raw
              .map(toTrailerCandidate)
              .filter((m) => m && !seen.has(m.id) && seen.add(m.id))
          );

          // Resolve trailer keys in parallel for this batch.
          const withKeys = await Promise.all(
            candidates.map(async (c) => {
              const key = await resolveKey(c.id);
              return key ? { ...c, youtubeKey: key, _year: y } : null;
            })
          );
          if (runId !== runIdRef.current) return null;
          for (const m of withKeys) {
            if (m) collected.push(m);
          }
          if (collected.length >= wanted) return collected;
        }
        // If after both pages of the exact year we already have enough to
        // run a channel, don't bleed into neighbor years.
        if (y === year && collected.length >= minNeeded) return collected;
      }
      return collected;
    },
    [resolveKey]
  );

  // -- the dramatic spin, then land + load + play --------------------------
  const travel = useCallback(
    (excludeYear) => {
      // Invalidate prior async + reset playback.
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      prefetchRef.current = new Map();
      jumpsRef.current = 0;
      if (spinTimer.current) clearInterval(spinTimer.current);

      setStatusMsg('');
      setQueue([]);
      setIdx(0);
      setCurrent(null);
      setNext(null);
      setIsPlaying(false);
      setPhase('spinning');
      haptics.medium();

      const target = randomYear(excludeYear);
      const start = Date.now();
      const SPIN_MS = 1200;
      const TICK_MS = 50;
      let lastHaptic = 0;

      spinTimer.current = setInterval(() => {
        if (runId !== runIdRef.current) {
          clearInterval(spinTimer.current);
          return;
        }
        const elapsed = Date.now() - start;
        // Flicker through random years; tick haptics a few times.
        setDisplayYear(randomYear());
        if (elapsed - lastHaptic > 130) {
          haptics.light();
          lastHaptic = elapsed;
        }
        if (elapsed >= SPIN_MS) {
          clearInterval(spinTimer.current);
          spinTimer.current = null;
          if (runId !== runIdRef.current) return;
          // Arrive.
          setDisplayYear(target);
          setLandedYear(target);
          haptics.heavy();
          // Load the channel for this year.
          setPhase('loading');
          loadAndPlay(target, runId, 0);
        }
      }, TICK_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // -- fetch + start the channel; auto-retry thin years --------------------
  const loadAndPlay = useCallback(
    async (year, runId, attempt) => {
      const channel = await buildChannel(year, runId);
      if (runId !== runIdRef.current) return; // superseded
      if (channel === null) return; // cancelled mid-flight

      if (channel.length < 2) {
        // Too few playable trailers for a channel. Nudge the year and retry a
        // couple of times, then bounce to a brand-new random year.
        if (attempt < 2) {
          const nudged = clampYear(year + (attempt === 0 ? 1 : -1));
          setStatusMsg(
            `${year} was a quiet year for trailers — hopping to ${nudged}…`
          );
          setLandedYear(nudged);
          setDisplayYear(nudged);
          haptics.light();
          loadAndPlay(nudged, runId, attempt + 1);
          return;
        }
        if (channel.length === 1) {
          // We have exactly one — play it solo rather than fail.
          startChannel(channel, year);
          return;
        }
        // Still nothing playable: jump to a fresh random year automatically.
        // Bail to the error screen if we've bounced too many times (e.g. TMDB
        // is unreachable) so we never spin forever.
        jumpsRef.current += 1;
        if (jumpsRef.current > 5) {
          setStatusMsg(
            'Could not pick up a signal from that decade. Check your connection and try again.'
          );
          setPhase('error');
          return;
        }
        setStatusMsg('That era was hiding its trailers — spinning again…');
        const fresh = randomYear(year);
        setLandedYear(fresh);
        setDisplayYear(fresh);
        // Reuse the spin-less fast path: brief pause for the message, then load.
        setTimeout(() => {
          if (runId !== runIdRef.current) return;
          loadAndPlay(fresh, runId, 0);
        }, 700);
        return;
      }

      startChannel(channel, year);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildChannel]
  );

  // -- hand the channel to the Player and begin playback -------------------
  const startChannel = useCallback((channel, year) => {
    setStatusMsg('');
    setQueue(channel);
    setIdx(0);
    setLandedYear(year);
    setDisplayYear(year);
    const first = channel[0];
    const peek = channel[1] || null;
    setCurrent(first);
    setNext(peek);
    setIsPlaying(true);
    setPhase('playing');
    setPlaySignal((s) => s + 1);
    haptics.medium();
  }, []);

  // -- advance to the next movie in the year's channel ---------------------
  const advance = useCallback(() => {
    setIdx((prev) => {
      const nextIdx = prev + 1;
      if (nextIdx >= queue.length) {
        // Looped through everything we resolved for this year — wrap around so
        // it stays a continuous channel.
        if (queue.length === 0) return prev;
        const first = queue[0];
        const peek = queue[1] || null;
        setCurrent(first);
        setNext(peek);
        setIsPlaying(true);
        setPlaySignal((s) => s + 1);
        return 0;
      }
      const movie = queue[nextIdx];
      const peek = queue[nextIdx + 1] || queue[0] || null;
      setCurrent(movie);
      setNext(peek);
      setIsPlaying(true);
      setPlaySignal((s) => s + 1);
      return nextIdx;
    });
  }, [queue]);

  const handleEnded = useCallback(() => {
    haptics.light();
    advance();
  }, [advance]);

  const handleAdvanceInPlace = useCallback(() => {
    advance();
  }, [advance]);

  // ---- render helpers ----------------------------------------------------
  const yearDigits = String(displayYear);
  const upcoming = next || (queue.length > 1 ? queue[(idx + 1) % queue.length] : null);
  const currentGenre = current ? (genreNames(current.genre_ids)[0] || '') : '';
  // idle -> spinning -> loading -> playing all swapped instantly; each panel
  // now paints its out-state and transitions in.
  const entered = useStageEnter(phase);
  const enter = `feat-enter${entered ? ' is-in' : ''}`;

  return (
    <div className={`feat feat-time${closing ? ' is-closing' : ''}`} {...dialogProps}>
      <button type="button" className="feat-close" onClick={close} aria-label="Close">
        ✕
      </button>

      <h1 className="feat-title">{TITLE}</h1>

      {/* Scanline / glow atmosphere layer */}
      <div className="time-scanlines" aria-hidden="true" />

      {/* ---------- INTRO ---------- */}
      {phase === 'idle' && (
        <div className={`time-intro ${enter}`}>
          <div className="time-eyebrow">DESTINATION</div>
          <div className="time-readout" data-spinning="false">
            <span className="time-readout-glow" aria-hidden="true">
              {yearDigits}
            </span>
            <span className="time-readout-digits">{yearDigits}</span>
          </div>
          <p className="time-tagline">
            Drop into a random year of cinema and let its trailers play as a
            channel.
          </p>
          <button
            className="time-travel-btn"
            onClick={() => travel(null)}
            type="button"
          >
            <span className="time-travel-btn-label">▶ Travel</span>
            <span className="time-travel-btn-sub">{FLOOR_YEAR}–{CEIL_YEAR}</span>
          </button>
        </div>
      )}

      {/* ---------- SPINNING ---------- */}
      {phase === 'spinning' && (
        <div className={`time-intro ${enter}`} role="status" aria-live="polite">
          <div className="time-eyebrow time-eyebrow-live">SPINNING THE DIAL…</div>
          <div className="time-readout" data-spinning="true">
            <span className="time-readout-glow" aria-hidden="true">
              {yearDigits}
            </span>
            <span className="time-readout-digits time-flicker">{yearDigits}</span>
          </div>
          <p className="time-tagline">Charging the flux capacitor…</p>
        </div>
      )}

      {/* ---------- LOADING ---------- */}
      {phase === 'loading' && (
        <div className={`time-intro ${enter}`} role="status" aria-live="polite">
          <div className="time-eyebrow time-eyebrow-live">ARRIVED</div>
          <div className="time-readout" data-landed="true">
            <span className="time-readout-glow" aria-hidden="true">
              {yearDigits}
            </span>
            <span className="time-readout-digits">{yearDigits}</span>
          </div>
          <div className="time-loader" aria-label="Tuning the channel">
            <span className="time-loader-dot" />
            <span className="time-loader-dot" />
            <span className="time-loader-dot" />
          </div>
          <p className="time-tagline">
            {statusMsg || `Tuning into ${landedYear}…`}
          </p>
        </div>
      )}

      {/* ---------- PLAYING ---------- */}
      {phase === 'playing' && current && (
        <div className={`time-stage ${enter}`}>
          <div className="time-stage-player">
            <Player
              trailer={current}
              nextTrailer={next}
              isPlaying={isPlaying}
              playSignal={playSignal}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={handleEnded}
              onAdvanceInPlace={handleAdvanceInPlace}
              onDurationKnown={() => {}}
            />
          </div>

          <div className="time-overlay">
            <div className="time-badge">
              <span className="time-badge-star">★</span>
              <span className="time-badge-year">{landedYear}</span>
            </div>

            <div className="time-nowplaying">
              {/* Heading semantics without a UA-styled <h2>, so the overlay's
                  hand-tuned spacing stays exactly as it is. */}
              <div className="time-nowplaying-title" role="heading" aria-level={2}>
                {current.title}
              </div>
              <div className="time-nowplaying-meta">
                {currentGenre && <span className="time-chip">{currentGenre}</span>}
                {current._year && current._year !== landedYear && (
                  <span className="time-chip time-chip-dim">{current._year}</span>
                )}
              </div>
            </div>

            {upcoming && upcoming.id !== current.id && (
              <div className="time-upnext">
                {upcoming.poster_path && posterUrl(upcoming.poster_path) ? (
                  <img
                    className="time-upnext-poster"
                    src={posterUrl(upcoming.poster_path, 'w185')}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <div className="time-upnext-poster time-upnext-poster-empty">
                    ★
                  </div>
                )}
                <div className="time-upnext-text">
                  <div className="time-upnext-label">Up next from {landedYear}</div>
                  <div className="time-upnext-title">{upcoming.title}</div>
                </div>
              </div>
            )}

            <div className="time-controls">
              <button
                className="time-control-btn"
                type="button"
                onClick={handleEnded}
              >
                Skip
              </button>
              <button
                className="time-control-btn time-control-btn-primary"
                type="button"
                onClick={() => travel(landedYear)}
              >
                ⟳ Travel again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- ERROR ---------- */}
      {phase === 'error' && (
        <div className={`time-intro ${enter}`} role="alert">
          <div className="time-eyebrow">SIGNAL LOST</div>
          <p className="time-tagline">
            {statusMsg || 'The time circuits glitched. Try spinning again.'}
          </p>
          <button
            className="time-travel-btn"
            onClick={() => travel(landedYear)}
            type="button"
          >
            <span className="time-travel-btn-label">⟳ Travel again</span>
          </button>
        </div>
      )}
    </div>
  );
}
