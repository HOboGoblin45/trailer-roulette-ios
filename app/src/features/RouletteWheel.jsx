import './roulette-wheel.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  discoverMovies,
  getTrailer,
  toTrailerCandidate,
  genreNames,
  posterUrl,
} from '../lib/tmdb.js';
import Player from '../components/Player.jsx';
import * as haptics from '../lib/haptics.js';

/**
 * Roulette Wheel — spin a colorful 6-segment wheel that lands on a decade,
 * then plays a random trailer from that decade.
 *
 * Flow (kept strictly SEQUENTIAL so it works on iOS where native playback
 * covers this UI): idle → spinning → fetching → playing → result → (re-spin).
 */

// Order matters: index 0 is the segment at the TOP (under the pointer) when
// rotation = 0. We render segments clockwise starting from the top.
const DECADES = [
  { decade: '1970', label: "70s", hue: 282 }, // violet
  { decade: '1980', label: "80s", hue: 330 }, // magenta/pink
  { decade: '1990', label: "90s", hue: 6 },   // red-orange
  { decade: '2000', label: "00s", hue: 35 },  // amber
  { decade: '2010', label: "10s", hue: 150 }, // green
  { decade: '2020', label: "20s", hue: 200 }, // light blue
];

const SEG = DECADES.length;
const SEG_DEG = 360 / SEG; // 60deg per segment
const WHEEL = 280;         // svg viewBox size
const R = WHEEL / 2;       // radius
const CX = R;
const CY = R;
const SPIN_MS = 4200;      // matches the CSS transition duration
const MAX_TRAILER_TRIES = 8;

const PHASE = {
  IDLE: 'idle',
  SPINNING: 'spinning',
  FETCHING: 'fetching',
  PLAYING: 'playing',
  RESULT: 'result',
};

// --- geometry helpers ------------------------------------------------------
function polar(cx, cy, radius, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180; // 0deg = 12 o'clock
  return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
}

// Wedge path for segment i, centered on the top so segment 0 straddles 12 o'clock.
function wedgePath(i) {
  const start = i * SEG_DEG - SEG_DEG / 2;
  const end = start + SEG_DEG;
  const p1 = polar(CX, CY, R, start);
  const p2 = polar(CX, CY, R, end);
  const large = SEG_DEG > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`;
}

function labelPos(i) {
  const angle = i * SEG_DEG; // center of segment i
  return polar(CX, CY, R * 0.66, angle);
}

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

export default function RouletteWheel({ onClose }) {
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [rotation, setRotation] = useState(0);          // accumulated degrees
  const [landedIndex, setLandedIndex] = useState(null); // which segment won
  const [trailer, setTrailer] = useState(null);         // candidate w/ youtubeKey
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSignal, setPlaySignal] = useState(0);
  const [status, setStatus] = useState('');             // transient message
  const [error, setError] = useState('');               // fatal-ish message

  const usedIds = useRef(new Set());
  const settleTimer = useRef(null);
  const liveRef = useRef(0); // incremented to cancel stale async fetches

  useEffect(() => {
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      liveRef.current++; // invalidate any in-flight fetch on unmount
    };
  }, []);

  const landedDecade = landedIndex == null ? null : DECADES[landedIndex];

  // Fetch a playable random trailer from the given decade. Tries several
  // movies until one has a YouTube video. Returns a candidate or null.
  const fetchTrailerForDecade = useCallback(async (decade, token) => {
    // Pull a couple of pages of candidates so we have variety + repeat-avoidance.
    const pages = [1, 2, 3].sort(() => Math.random() - 0.5).slice(0, 2);
    let pool = [];
    for (const page of pages) {
      if (token !== liveRef.current) return null;
      try {
        const data = await discoverMovies({ decade, page });
        if (Array.isArray(data?.results)) pool = pool.concat(data.results);
      } catch (e) {
        // Try the next page; only bail if we end up with nothing.
        // eslint-disable-next-line no-console
        console.warn('[wheel] discoverMovies failed', e);
      }
    }
    if (!pool.length) return null;

    // Prefer unseen movies; fall back to the full pool if we've burned through.
    let fresh = pool.filter((m) => m && !usedIds.current.has(m.id));
    if (!fresh.length) fresh = pool.slice();
    // Shuffle for randomness.
    fresh.sort(() => Math.random() - 0.5);

    const tries = Math.min(MAX_TRAILER_TRIES, fresh.length);
    for (let i = 0; i < tries; i++) {
      if (token !== liveRef.current) return null;
      const raw = fresh[i];
      try {
        const vid = await getTrailer(raw.id);
        if (vid?.key) {
          usedIds.current.add(raw.id);
          const cand = toTrailerCandidate(raw);
          cand.youtubeKey = vid.key;
          return cand;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[wheel] getTrailer failed', e);
      }
    }
    return null;
  }, []);

  // After the wheel settles, fetch + play. Recovers by re-picking if a decade
  // has nothing playable.
  const resolveAndPlay = useCallback(
    async (index) => {
      const token = ++liveRef.current;
      setError('');
      setPhase(PHASE.FETCHING);
      setStatus(`Finding a ${DECADES[index].decade}s trailer…`);

      // Try the landed decade first, then fall back to other decades so the
      // user is never stuck on an empty result.
      const tryOrder = [index, ...DECADES.map((_, i) => i).filter((i) => i !== index)];

      for (let attempt = 0; attempt < tryOrder.length; attempt++) {
        const di = tryOrder[attempt];
        if (token !== liveRef.current) return; // superseded by a newer spin
        if (attempt > 0) {
          setStatus("Couldn't find one — trying another decade…");
        }
        const cand = await fetchTrailerForDecade(DECADES[di].decade, token);
        if (token !== liveRef.current) return;
        if (cand) {
          setLandedIndex(di);
          setTrailer(cand);
          setStatus('');
          setPhase(PHASE.PLAYING);
          setIsPlaying(true);
          setPlaySignal((n) => n + 1);
          haptics.light();
          return;
        }
      }

      // Nothing anywhere — surface a recoverable error.
      if (token === liveRef.current) {
        setStatus('');
        setError("Couldn't find a trailer right now. Give it another spin.");
        setPhase(PHASE.IDLE);
      }
    },
    [fetchTrailerForDecade]
  );

  const spin = useCallback(() => {
    if (phase === PHASE.SPINNING || phase === PHASE.FETCHING) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    liveRef.current++; // cancel any pending fetch from a previous round

    setError('');
    setStatus('');
    setTrailer(null);
    setIsPlaying(false);
    setLandedIndex(null);
    setPhase(PHASE.SPINNING);
    haptics.medium();

    // Choose a winning segment, then compute the rotation that brings its
    // center under the top pointer. Add several full turns for drama.
    const winner = rand(SEG);
    const turns = 4 + rand(3); // 4..6 full rotations
    // Small jitter inside the segment so it doesn't always land dead-center.
    const jitter = (Math.random() - 0.5) * (SEG_DEG * 0.6);
    // To bring segment `winner` (currently centered at winner*SEG_DEG) to the
    // top (0deg) we must rotate by -(winner*SEG_DEG). We rotate the wheel
    // clockwise (positive) so add full turns and normalize off the *current*
    // rotation to keep the transition continuous.
    const targetMod = (360 - winner * SEG_DEG) % 360;
    const base = rotation - (rotation % 360); // floor to whole turns already done
    const next = base + turns * 360 + targetMod + jitter;

    setRotation(next);

    settleTimer.current = setTimeout(() => {
      setLandedIndex(winner);
      resolveAndPlay(winner);
    }, SPIN_MS + 60);
  }, [phase, rotation, resolveAndPlay]);

  // Player callbacks ---------------------------------------------------------
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setPhase(PHASE.RESULT);
    haptics.light();
  }, []);

  const handlePause = useCallback(() => {
    // On iOS this fires when the user taps Done. Treat it like "finished"
    // so we always land on the result panel rather than a blank wheel.
    setIsPlaying(false);
    setPhase((p) => (p === PHASE.PLAYING ? PHASE.RESULT : p));
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const segments = useMemo(
    () =>
      DECADES.map((d, i) => ({
        ...d,
        i,
        d: wedgePath(i),
        label: labelPos(i),
      })),
    []
  );

  const busy = phase === PHASE.SPINNING || phase === PHASE.FETCHING;
  const spinLabel =
    phase === PHASE.SPINNING
      ? 'Spinning…'
      : phase === PHASE.FETCHING
      ? 'Loading…'
      : phase === PHASE.RESULT
      ? 'Spin again'
      : 'SPIN';

  const resultGenres =
    trailer ? genreNames(trailer.genre_ids).slice(0, 2) : [];
  const resultPoster = trailer ? posterUrl(trailer.poster_path) : null;

  return (
    <div className="feat feat-wheel">
      <button className="feat-close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      <header className="wheel-head">
        <h2 className="wheel-title">Roulette Wheel</h2>
        <p className="wheel-sub">Spin to land on a decade, then watch a random trailer.</p>
      </header>

      <div className="wheel-stage">
        <div className="wheel-pointer" aria-hidden="true" />
        <div className="wheel-spinner">
          <svg
            className="wheel-svg"
            viewBox={`0 0 ${WHEEL} ${WHEEL}`}
            width="100%"
            height="100%"
            role="img"
            aria-label="Decade wheel"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition:
                phase === PHASE.SPINNING
                  ? `transform ${SPIN_MS}ms cubic-bezier(0.16, 0.84, 0.27, 1)`
                  : 'none',
            }}
          >
            <defs>
              <radialGradient id="wheelSheen" cx="50%" cy="38%" r="75%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                <stop offset="55%" stopColor="rgba(255,255,255,0.04)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.28)" />
              </radialGradient>
            </defs>

            {segments.map((s) => {
              const won = landedIndex === s.i && !busy;
              return (
                <g key={s.decade} className={won ? 'wheel-seg won' : 'wheel-seg'}>
                  <path
                    d={s.d}
                    fill={`hsl(${s.hue} 70% ${won ? 58 : 48}%)`}
                    stroke="rgba(7,8,11,0.55)"
                    strokeWidth="2"
                  />
                  <text
                    x={s.label.x}
                    y={s.label.y}
                    className="wheel-seg-label"
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${s.i * SEG_DEG} ${s.label.x} ${s.label.y})`}
                  >
                    {`'${s.decade.slice(2)}`}
                  </text>
                </g>
              );
            })}

            {/* glossy overlay */}
            <circle cx={CX} cy={CY} r={R - 1} fill="url(#wheelSheen)" pointerEvents="none" />
            {/* hub */}
            <circle cx={CX} cy={CY} r="26" fill="var(--bg-3)" stroke="var(--gold)" strokeWidth="3" />
            <circle cx={CX} cy={CY} r="9" fill="var(--gold)" />
          </svg>
        </div>
      </div>

      {/* Inline player box. On web it renders the video here; on iOS it opens
          a native modal. Only mounted when we actually have a trailer. */}
      {trailer && phase === PHASE.PLAYING && (
        <div className="wheel-player">
          <Player
            trailer={trailer}
            isPlaying={isPlaying}
            playSignal={playSignal}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleEnded}
            onAdvanceInPlace={() => {}}
            onDurationKnown={() => {}}
          />
        </div>
      )}

      <div className="wheel-controls">
        {phase === PHASE.FETCHING && (
          <div className="wheel-status" role="status">
            <span className="wheel-spinnerdot" aria-hidden="true" />
            {status || 'Loading…'}
          </div>
        )}

        {phase === PHASE.PLAYING && (
          <div className="wheel-status" role="status">
            Playing a {landedDecade?.decade}s trailer…
          </div>
        )}

        {!!error && phase !== PHASE.PLAYING && (
          <div className="wheel-error" role="alert">
            {error}
          </div>
        )}

        {phase === PHASE.RESULT && trailer && (
          <div className="wheel-result">
            {resultPoster ? (
              <img
                className="wheel-poster"
                src={resultPoster}
                alt={`${trailer.title} poster`}
                loading="lazy"
              />
            ) : (
              <div className="wheel-poster wheel-poster--empty">
                No poster
              </div>
            )}
            <div className="wheel-meta">
              <span className="wheel-decade-chip">
                {landedDecade?.decade}s
              </span>
              <h3 className="wheel-movie-title">
                {trailer.title}
                {trailer.year ? <span className="wheel-year"> ({trailer.year})</span> : null}
              </h3>
              {resultGenres.length > 0 && (
                <div className="wheel-genres">
                  {resultGenres.map((g) => (
                    <span className="wheel-genre" key={g}>
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {phase !== PHASE.PLAYING && (
          <button
            className="wheel-spin-btn"
            onClick={spin}
            disabled={busy}
            aria-busy={busy}
          >
            {spinLabel}
          </button>
        )}

        {phase === PHASE.RESULT && (
          <p className="wheel-hint">The wheel’s still hot — give it another spin.</p>
        )}
      </div>
    </div>
  );
}
