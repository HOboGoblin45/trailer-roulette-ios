import './guess-year.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { discoverRandomMix, getTrailer, toTrailerCandidate, genreNames, posterUrl } from '../lib/tmdb.js';
import Player from '../components/Player.jsx';
import * as haptics from '../lib/haptics.js';

/**
 * Guess the Year — watch a trailer, then pin its exact release year on a slider.
 * Closer guesses score more; an exact hit is a bullseye. Strictly SEQUENTIAL
 * (watch -> guess -> reveal) so it works on iOS where native playback covers
 * this UI. The player only renders while watching, so the poster/era never
 * leaks before the guess.
 */

const MIN_YEAR = 1970;
const MAX_YEAR = new Date().getFullYear();
const MID_YEAR = Math.round((MIN_YEAR + MAX_YEAR) / 2);
const MAX_TRIES = 16;

const STAGE = {
  LOADING: 'loading',
  ERROR: 'error',
  WATCHING: 'watching',
  GUESSING: 'guessing',
  REVEALED: 'revealed',
};

// Points fall off smoothly with distance, with a small consolation floor.
function scoreFor(diff) {
  if (diff <= 0) return 100;
  return Math.max(5, Math.round(100 * Math.exp(-diff / 4)));
}

function verdictFor(diff) {
  if (diff === 0) return 'Bullseye';
  if (diff <= 1) return 'Nailed it';
  if (diff <= 3) return 'So close';
  if (diff <= 7) return 'Not bad';
  return 'Way off';
}

export default function GuessYear({ onClose }) {
  const [stage, setStage] = useState(STAGE.LOADING);
  const [movie, setMovie] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSignal, setPlaySignal] = useState(0);
  const [guess, setGuess] = useState(MID_YEAR);
  const [result, setResult] = useState(null); // { actual, guess, diff, points, verdict }
  const [totalPoints, setTotalPoints] = useState(0);
  const [rounds, setRounds] = useState(0);
  const [streak, setStreak] = useState(0);     // consecutive within-1 hits
  const [bestStreak, setBestStreak] = useState(0);

  const usedIds = useRef(new Set());
  const alive = useRef(true);
  const token = useRef(0);

  useEffect(() => () => { alive.current = false; }, []);

  // Find a random, unseen, playable movie that has a real release year.
  const loadRound = useCallback(async () => {
    const my = ++token.current;
    setResult(null);
    setMovie(null);
    setIsPlaying(false);
    setStage(STAGE.LOADING);

    let tries = 0;
    for (let batch = 0; batch < 4 && tries < MAX_TRIES; batch++) {
      let raw;
      try { raw = await discoverRandomMix(); } catch { raw = []; }
      if (!alive.current || my !== token.current) return;

      const pool = (raw || [])
        .map(toTrailerCandidate)
        .filter((m) => m && Number.isFinite(m.year) && m.year > 0 && !usedIds.current.has(m.id));
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      for (const cand of pool) {
        if (tries >= MAX_TRIES) break;
        tries++;
        usedIds.current.add(cand.id);
        let vid = null;
        try { vid = await getTrailer(cand.id); } catch { vid = null; }
        if (!alive.current || my !== token.current) return;
        if (vid && vid.key) {
          cand.youtubeKey = vid.key;
          setMovie(cand);
          setGuess(MID_YEAR);
          setStage(STAGE.WATCHING);
          setIsPlaying(true);
          setPlaySignal((s) => s + 1);
          return;
        }
      }
      if (usedIds.current.size > 400) usedIds.current.clear();
    }

    if (!alive.current || my !== token.current) return;
    setStage(STAGE.ERROR);
  }, []);

  useEffect(() => { loadRound(); }, [loadRound]);

  // Done watching -> show the slider. Idempotent and stage-guarded.
  const toGuessing = useCallback(() => {
    setIsPlaying(false);
    setStage((s) => (s === STAGE.WATCHING ? STAGE.GUESSING : s));
  }, []);

  const lockIn = useCallback(() => {
    if (!movie || !Number.isFinite(movie.year)) return;
    haptics.medium();
    const actual = movie.year;
    const diff = Math.abs(actual - guess);
    const points = scoreFor(diff);
    setResult({ actual, guess, diff, points, verdict: verdictFor(diff) });
    setTotalPoints((t) => t + points);
    setRounds((r) => r + 1);
    if (diff <= 1) {
      setStreak((st) => {
        const n = st + 1;
        setBestStreak((b) => Math.max(b, n));
        return n;
      });
      haptics.heavy();
    } else {
      setStreak(0);
      haptics.light();
    }
    setStage(STAGE.REVEALED);
  }, [movie, guess]);

  const next = useCallback(() => { haptics.light(); loadRound(); }, [loadRound]);

  // Position (0-100%) on the reveal timeline, clamped to the slider range.
  const pct = (y) => {
    const c = Math.max(MIN_YEAR, Math.min(MAX_YEAR, y));
    return ((c - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
  };

  const genres = movie ? genreNames(movie.genre_ids).slice(0, 2) : [];

  return (
    <div className="feat feat-year">
      <button className="feat-close" onClick={onClose} aria-label="Close">✕</button>

      <header className="year-scorebar">
        <div className="year-score">
          <span className="year-score-num">{totalPoints}</span>
          <span className="year-score-label">points</span>
        </div>
        <div className="year-stat">
          <span className="year-stat-num">{rounds}</span>
          <span className="year-stat-label">rounds</span>
        </div>
        <div className="year-stat">
          <span className="year-stat-num">{streak}</span>
          <span className="year-stat-label">streak</span>
        </div>
        <div className="year-stat">
          <span className="year-stat-num">{bestStreak}</span>
          <span className="year-stat-label">best</span>
        </div>
      </header>

      <h1 className="year-heading">Guess the Year</h1>

      {stage === STAGE.LOADING && (
        <div className="year-center">
          <div className="year-spinner" aria-hidden="true" />
          <p className="year-dim">Cueing up a trailer...</p>
        </div>
      )}

      {stage === STAGE.ERROR && (
        <div className="year-center">
          <p className="year-dim">Couldn&apos;t load a trailer right now.</p>
          <button className="year-btn year-btn-primary" onClick={next}>Try again</button>
        </div>
      )}

      {stage === STAGE.WATCHING && movie && (
        <div className="year-watch">
          <div className="year-player">
            <Player
              key={movie.id}
              trailer={movie}
              isPlaying={isPlaying}
              playSignal={playSignal}
              onPlay={() => setIsPlaying(true)}
              onPause={() => { setIsPlaying(false); toGuessing(); }}
              onEnded={toGuessing}
              onAdvanceInPlace={toGuessing}
              onDurationKnown={() => {}}
            />
          </div>
          <p className="year-dim">Watch the trailer, then guess its year.</p>
          <button className="year-btn" onClick={toGuessing}>I have a guess</button>
        </div>
      )}

      {stage === STAGE.GUESSING && (
        <div className="year-guesser">
          <div className="year-bigyear">{guess}</div>
          <input
            className="year-slider"
            type="range"
            min={MIN_YEAR}
            max={MAX_YEAR}
            step={1}
            value={guess}
            onChange={(e) => setGuess(Number(e.target.value))}
            aria-label="Pick a year"
          />
          <div className="year-ends">
            <span>{MIN_YEAR}</span>
            <span>{MAX_YEAR}</span>
          </div>
          <button className="year-btn year-btn-primary" onClick={lockIn}>Lock it in</button>
        </div>
      )}

      {stage === STAGE.REVEALED && result && movie && (
        <div className="year-reveal">
          <div className={`year-verdict${result.diff === 0 ? ' is-bullseye' : ''}`}>{result.verdict}</div>
          <div className="year-actual">
            <span className="year-actual-num">{result.actual}</span>
            <span className="year-actual-cap">actual year</span>
          </div>
          <div className="year-timeline" aria-hidden="true">
            <span className="year-tl-fill" />
            <span className="year-tl-guess" style={{ left: `${pct(result.guess)}%` }} />
            <span className="year-tl-actual" style={{ left: `${pct(result.actual)}%` }} />
          </div>
          <p className="year-delta">
            You said {result.guess} &mdash; {result.diff === 0
              ? 'exactly right'
              : `off by ${result.diff} ${result.diff === 1 ? 'year' : 'years'}`}. <span className="year-pts">+{result.points}</span>
          </p>
          <div className="year-movie">
            {posterUrl(movie.poster_path) ? (
              <img className="year-poster" src={posterUrl(movie.poster_path)} alt="" />
            ) : (
              <div className="year-poster year-poster-empty">No poster</div>
            )}
            <div className="year-movie-meta">
              <h2 className="year-movie-title">{movie.title}</h2>
              <p className="year-movie-sub">
                {movie.year}{genres.length ? ` · ${genres.join(', ')}` : ''}
              </p>
            </div>
          </div>
          <button className="year-btn year-btn-primary" onClick={next}>Next trailer</button>
        </div>
      )}
    </div>
  );
}
