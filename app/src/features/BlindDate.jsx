import { useState, useRef, useEffect, useCallback } from 'react';
import {
  discoverRandomMix,
  getTrailer,
  toTrailerCandidate,
  genreNames,
  posterUrl,
  backdropUrl,
} from '../lib/tmdb.js';
import Player from '../components/Player.jsx';
import * as haptics from '../lib/haptics.js';
import './blind-date.css';

// Stages of a single blind date.
const STAGE = {
  LOADING: 'loading',   // fetching a playable mystery movie
  ERROR: 'error',       // couldn't find one after several tries
  MYSTERY: 'mystery',   // moody "Play" card, nothing identifiable
  PLAYING: 'playing',   // trailer is on screen / native modal
  REVEAL: 'reveal',     // the big reveal
};

// How many movies we'll sample before giving up on finding a playable one.
const MAX_TRIES = 14;

// Cheeky one-liners for each verdict. Picked at random so it stays fresh.
const INTO_IT_LINES = [
  "Love at first trailer.",
  "Swipe right on the popcorn.",
  "A match made in the multiplex.",
  "You two are going to be inseparable.",
  "Cancel your evening. This one's a keeper.",
  "Sparks flying in 24 frames per second.",
];
const PASS_LINES = [
  "It's not you, it's the runtime.",
  "Plenty of films in the sea.",
  "Ghosted before the end credits.",
  "Some trailers just aren't your type.",
  "Swiped left. No hard feelings.",
  "You'll find 'the one' next reel.",
];

function pickLine(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export default function BlindDate({ onClose }) {
  const [stage, setStage] = useState(STAGE.LOADING);
  const [movie, setMovie] = useState(null);      // candidate with youtubeKey set
  const [playSignal, setPlaySignal] = useState(0);
  const [verdict, setVerdict] = useState(null);  // { kind: 'into'|'pass', line }
  const [revealShown, setRevealShown] = useState(false); // drives the reveal animation

  // Track which movies we've already shown so "Next" never repeats one.
  const usedIds = useRef(new Set());
  // Guard against state updates after the component unmounts mid-fetch.
  const alive = useRef(true);
  // Bumped on every fetch so a stale in-flight fetch can't clobber a newer one.
  const fetchToken = useRef(0);

  useEffect(() => {
    return () => {
      alive.current = false;
    };
  }, []);

  // Pull a random batch and find the first movie that (a) we haven't shown and
  // (b) actually has a YouTube trailer. Loops across multiple batches if needed.
  const findPlayableMovie = useCallback(async () => {
    const myToken = ++fetchToken.current;
    setVerdict(null);
    setRevealShown(false);
    setMovie(null);
    setStage(STAGE.LOADING);

    let tries = 0;
    // Re-batch a few times; each discoverRandomMix() is a fresh era-diverse pull.
    for (let batchAttempt = 0; batchAttempt < 4 && tries < MAX_TRIES; batchAttempt++) {
      let batch;
      try {
        batch = await discoverRandomMix();
      } catch {
        batch = [];
      }
      // Bail if a newer fetch superseded us or we unmounted.
      if (!alive.current || myToken !== fetchToken.current) return;

      // Shuffle the batch so we don't always probe the same order.
      const pool = (batch || []).filter((m) => m && !usedIds.current.has(m.id));
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      for (const raw of pool) {
        if (tries >= MAX_TRIES) break;
        tries++;
        // Mark as used up-front so a missing trailer doesn't get retried later.
        usedIds.current.add(raw.id);
        let trailer = null;
        try {
          trailer = await getTrailer(raw.id);
        } catch {
          trailer = null;
        }
        if (!alive.current || myToken !== fetchToken.current) return;
        if (trailer && trailer.key) {
          const candidate = toTrailerCandidate(raw);
          candidate.youtubeKey = trailer.key;
          setMovie(candidate);
          setStage(STAGE.MYSTERY);
          return;
        }
      }

      // If we've now seen a huge number of ids, clear the set so the app can
      // keep going indefinitely rather than starving on an exhausted catalog.
      if (usedIds.current.size > 400) usedIds.current.clear();
    }

    if (!alive.current || myToken !== fetchToken.current) return;
    setStage(STAGE.ERROR);
  }, []);

  // Kick off the first mystery on open.
  useEffect(() => {
    findPlayableMovie();
  }, [findPlayableMovie]);

  const startTrailer = useCallback(() => {
    if (!movie || !movie.youtubeKey) return;
    haptics.medium();
    setStage(STAGE.PLAYING);
    setPlaySignal((n) => n + 1);
  }, [movie]);

  const goReveal = useCallback(() => {
    haptics.heavy();
    setStage(STAGE.REVEAL);
    // Defer the "in" class one frame so the CSS transition actually runs.
    requestAnimationFrame(() => {
      if (alive.current) setRevealShown(true);
    });
  }, []);

  const castVerdict = useCallback((kind) => {
    haptics.light();
    setVerdict({
      kind,
      line: kind === 'into' ? pickLine(INTO_IT_LINES) : pickLine(PASS_LINES),
    });
  }, []);

  const nextDate = useCallback(() => {
    haptics.light();
    findPlayableMovie();
  }, [findPlayableMovie]);

  const backdrop = movie ? backdropUrl(movie.backdrop_path) : null;

  return (
    <div className="feat feat-blind">
      <button className="feat-close" onClick={onClose} aria-label="Close">✕</button>

      {/* Heavily blurred/darkened backdrop behind the mystery — nothing readable. */}
      {(stage === STAGE.MYSTERY || stage === STAGE.PLAYING) && backdrop && (
        <div
          className="blind-bg"
          style={{ backgroundImage: `url(${backdrop})` }}
          aria-hidden="true"
        />
      )}

      <div className="blind-stage">
        {stage === STAGE.LOADING && (
          <div className="blind-card blind-loading">
            <div className="blind-spinner" aria-hidden="true" />
            <p className="blind-loading-text">Setting up your blind date…</p>
            <p className="blind-sub">Finding a mystery worth your time.</p>
          </div>
        )}

        {stage === STAGE.ERROR && (
          <div className="blind-card blind-error">
            <h2 className="blind-title">No match right now</h2>
            <p className="blind-sub">
              Couldn&apos;t line up a trailer. The projector might be jammed — give it
              another spin.
            </p>
            <button className="blind-btn blind-btn-primary" onClick={nextDate}>
              Try again
            </button>
          </div>
        )}

        {stage === STAGE.MYSTERY && (
          <div className="blind-card blind-mystery">
            <div className="blind-mask" aria-hidden="true">
              <span className="blind-q">?</span>
              <span className="blind-q blind-q-2">?</span>
              <span className="blind-q blind-q-3">?</span>
            </div>
            <div className="blind-kicker">Blind Date</div>
            <h2 className="blind-title">Judge a movie by its trailer alone.</h2>
            <p className="blind-sub">No title. No poster. No spoilers.</p>

            <div className="blind-redactions" aria-hidden="true">
              <span className="blind-redact" style={{ width: '62%' }} />
              <span className="blind-redact" style={{ width: '44%' }} />
              <span className="blind-redact" style={{ width: '78%' }} />
            </div>

            <button className="blind-btn blind-btn-primary blind-play" onClick={startTrailer}>
              ▶ Play the trailer
            </button>
            <button className="blind-btn blind-btn-ghost" onClick={nextDate}>
              Shuffle a different mystery
            </button>
          </div>
        )}

        {stage === STAGE.PLAYING && movie && (
          <div className="blind-player-wrap">
            <div className="blind-player-box">
              <Player
                trailer={movie}
                isPlaying
                playSignal={playSignal}
                onEnded={goReveal}
                onClosed={goReveal}
              />
            </div>
            <p className="blind-watching">Watching blind… no peeking at the credits.</p>
            <button className="blind-btn blind-btn-primary blind-reveal-now" onClick={goReveal}>
              Reveal now
            </button>
          </div>
        )}

        {stage === STAGE.REVEAL && movie && (
          <RevealCard
            movie={movie}
            shown={revealShown}
            verdict={verdict}
            onVerdict={castVerdict}
            onNext={nextDate}
          />
        )}
      </div>
    </div>
  );
}

function RevealCard({ movie, shown, verdict, onVerdict, onNext }) {
  const bg = backdropUrl(movie.backdrop_path) || posterUrl(movie.poster_path);
  const poster = posterUrl(movie.poster_path);
  const genres = genreNames(movie.genre_ids);
  const rating =
    typeof movie.vote_average === 'number' && movie.vote_average > 0
      ? movie.vote_average.toFixed(1)
      : null;

  return (
    <div className={`blind-card blind-reveal ${shown ? 'is-in' : ''}`}>
      <div className="blind-reveal-hero">
        {bg ? (
          <div
            className="blind-reveal-bg"
            style={{ backgroundImage: `url(${bg})` }}
            aria-hidden="true"
          />
        ) : (
          <div className="blind-reveal-bg blind-reveal-bg-empty" aria-hidden="true" />
        )}
        {poster && (
          <img className="blind-reveal-poster" src={poster} alt={`${movie.title} poster`} />
        )}
        <div className="blind-reveal-flash" aria-hidden="true" />
      </div>

      <div className="blind-reveal-body">
        <div className="blind-reveal-tag">It was…</div>
        <h2 className="blind-reveal-title">
          {movie.title}
          {movie.year ? <span className="blind-reveal-year"> ({movie.year})</span> : null}
        </h2>

        <div className="blind-reveal-meta">
          {rating && <span className="blind-rating">★ {rating}</span>}
          {genres.length > 0 && (
            <span className="blind-genres">{genres.join(' · ')}</span>
          )}
        </div>

        {movie.overview ? (
          <p className="blind-overview">{movie.overview}</p>
        ) : (
          <p className="blind-overview blind-overview-empty">
            A film of few words — no synopsis on record.
          </p>
        )}

        {!verdict ? (
          <>
            <p className="blind-verdict-prompt">So… what&apos;s the verdict?</p>
            <div className="blind-verdict-row">
              <button
                className="blind-btn blind-btn-into"
                onClick={() => onVerdict('into')}
              >
                Into it
              </button>
              <button
                className="blind-btn blind-btn-pass"
                onClick={() => onVerdict('pass')}
              >
                Pass
              </button>
            </div>
          </>
        ) : (
          <div className={`blind-verdict-result blind-verdict-${verdict.kind}`}>
            <p className="blind-verdict-line">{verdict.line}</p>
          </div>
        )}

        <button className="blind-btn blind-btn-primary blind-next" onClick={onNext}>
          Next blind date →
        </button>
      </div>
    </div>
  );
}
