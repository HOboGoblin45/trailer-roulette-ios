import { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import Player from './Player.jsx';
import AboutScreen from './AboutScreen.jsx';
import FunSheet from '../features/FunSheet.jsx';
import { FEATURES } from '../features/index.js';
import {
  discoverMovies, discoverRandomMix, getTrailer, pickDiscoverPage,
  toTrailerCandidate, genreNames, backdropUrl, posterUrl,
} from '../lib/tmdb.js';
import { uniformShuffle } from '../lib/shuffleWeighting.js';
import * as airplay from '../lib/airplay.js';
import * as haptics from '../lib/haptics.js';

const MAX_TRAILER_SECONDS = 180;
const DEFAULT_CYCLE_SECONDS = 90;
const PREFETCH_LOOKAHEAD = 3;

// 1987 → "1980s". A small, fun reminder that the feed spans every decade.
function decadeLabel(year) {
  if (!Number.isFinite(year) || year <= 0) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

/**
 * Trailer Roulette — the whole app, kept deliberately tiny.
 *
 * A random, never-ending feed of movie trailers from every genre and every
 * decade. Two buttons: Play (spin a fresh random trailer) and AirPlay (throw
 * it on the TV). No filters, no accounts, no algorithm — just press play and
 * see what comes up. Trailers auto-advance, so it also runs as a hands-free
 * channel you can leave going.
 */
export default function TrailerRoulette() {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_CYCLE_SECONDS);
  const [cycleSeconds, setCycleSeconds] = useState(DEFAULT_CYCLE_SECONDS);
  const [isPlaying, setIsPlaying] = useState(false);

  const [loadError, setLoadError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [playSignal, setPlaySignal] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState(null);

  const timerRef = useRef(null);
  const prefetchedRef = useRef(new Set());
  const unplayableKeysRef = useRef(new Set());
  const retryRef = useRef({ timer: null, attempt: 0 });
  const toppingRef = useRef(false);
  const loadQueueRef = useRef(null);

  // Build an era-diverse batch (old + mid + recent), then shuffle uniformly so
  // the order is pure random across every decade. Falls back to a plain deep-page
  // pull if the mix comes back thin.
  const loadQueue = useCallback(async ({ append = false } = {}) => {
    try {
      if (!append) setLoadError(null);
      let results = await discoverRandomMix();
      if (!results || results.length < 8) {
        const data = await discoverMovies({ era: 'all', page: pickDiscoverPage(500) });
        results = [...(results || []), ...(data.results || [])];
      }
      const ordered = uniformShuffle(results.map(toTrailerCandidate));
      retryRef.current.attempt = 0;
      clearTimeout(retryRef.current.timer);

      if (append) {
        setQueue((q) => {
          const have = new Set(q.map((m) => m.id));
          return [...q, ...ordered.filter((m) => !have.has(m.id))];
        });
      } else {
        prefetchedRef.current = new Set();
        setQueue(ordered);
        if (ordered.length > 0) await selectAsCurrent(ordered[0]);
      }
    } catch (err) {
      console.error('[TrailerRoulette] loadQueue failed', err);
      if (!append) setLoadError(err?.message || String(err));
      // Self-heal: retry with capped exponential backoff so the feed comes back
      // on its own the moment the network does — no user action needed.
      const attempt = Math.min(retryRef.current.attempt + 1, 6);
      retryRef.current.attempt = attempt;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 30000);
      clearTimeout(retryRef.current.timer);
      retryRef.current.timer = setTimeout(() => loadQueueRef.current?.({ append }), delay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  loadQueueRef.current = loadQueue;

  useEffect(() => () => clearTimeout(retryRef.current.timer), []);

  // Keep the queue topped up so it never runs dry mid-session.
  useEffect(() => {
    if (!current || queue.length > 4 || toppingRef.current) return;
    toppingRef.current = true;
    loadQueue({ append: true }).finally(() => { toppingRef.current = false; });
  }, [queue.length, current, loadQueue]);

  // Boot.
  useEffect(() => {
    loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try { await loadQueue(); }
    finally { setRetrying(false); }
  }, [loadQueue]);

  const selectAsCurrent = useCallback(async (trailer, depth = 0) => {
    let next = trailer;
    if (!trailer.youtubeKey) {
      try {
        const yt = await getTrailer(trailer.id);
        if (yt) next = { ...trailer, youtubeKey: yt.key };
        prefetchedRef.current.add(trailer.id);
      } catch (e) {
        console.warn('[TrailerRoulette] getTrailer failed', e);
      }
    }
    // Skip movies with no trailer or a known-unplayable key (auto-skip up to 8
    // deep) so the feed never lands on a dead card.
    const keyKnownBad = next.youtubeKey && unplayableKeysRef.current.has(next.youtubeKey);
    if ((!next.youtubeKey || keyKnownBad) && depth < 8) {
      setQueue((q) => {
        const rest = q.slice(1);
        if (rest[0]) selectAsCurrent(rest[0], depth + 1);
        return rest;
      });
      return;
    }
    setCurrent(next);
    setCycleSeconds(DEFAULT_CYCLE_SECONDS);
    setSecondsLeft(DEFAULT_CYCLE_SECONDS);
  }, []);

  // Prefetch upcoming trailer keys so the next spin is instant.
  useEffect(() => {
    if (queue.length < 2) return;
    const lookahead = queue.slice(1, 1 + PREFETCH_LOOKAHEAD);
    let cancelled = false;
    (async () => {
      for (const m of lookahead) {
        if (cancelled) return;
        if (m.youtubeKey || prefetchedRef.current.has(m.id)) continue;
        prefetchedRef.current.add(m.id);
        try {
          const yt = await getTrailer(m.id);
          if (cancelled) return;
          if (yt) setQueue((q) => q.map((e) => (e.id === m.id ? { ...e, youtubeKey: yt.key } : e)));
        } catch (e) {
          console.debug('[TrailerRoulette] prefetch failed', m.id, e);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [queue]);

  // Web auto-advance timer (the iOS native player owns its own lifecycle).
  useEffect(() => {
    if (Capacitor.getPlatform() === 'ios') return undefined;
    if (!isPlaying || !current) return undefined;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { haptics.light(); advance(); return cycleSeconds; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, current, cycleSeconds]);

  // Pause on background / resume on foreground (iOS).
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'ios') return undefined;
    let sub;
    let cancelled = false;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        if (cancelled) return;
        sub = await App.addListener('appStateChange', (state) => {
          if (state.isActive) { if (current?.youtubeKey) setIsPlaying(true); }
          else setIsPlaying(false);
        });
      } catch (e) {
        console.warn('[TrailerRoulette] @capacitor/app unavailable', e);
      }
    })();
    return () => { cancelled = true; try { sub?.remove?.(); } catch { /* noop */ } };
  }, [current?.youtubeKey]);

  const advance = useCallback(() => {
    setQueue((q) => {
      const [, ...rest] = q;
      if (rest[0]) selectAsCurrent(rest[0]);
      else loadQueue().catch(() => {}); // exhausted → fetch more
      return rest;
    });
  }, [loadQueue, selectAsCurrent]);

  const onTrailerEnded = useCallback((payload) => {
    haptics.light();
    if (payload?.unplayable && payload?.youtubeKey) {
      unplayableKeysRef.current.add(payload.youtubeKey);
    }
    advance();
  }, [advance]);

  // Native chained to the next trailer in place (continuous playback).
  const onAdvanceInPlace = useCallback(() => { haptics.light(); advance(); }, [advance]);

  const onTrailerDurationKnown = useCallback((duration) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    const s = Math.min(Math.ceil(duration), MAX_TRAILER_SECONDS);
    setCycleSeconds(s);
    setSecondsLeft(s);
  }, []);

  // The Play button. First press starts the current (already-random) trailer;
  // press again while it's playing to spin to a fresh random one. Either way
  // trailers keep auto-advancing on their own.
  const onSpin = useCallback(() => {
    haptics.medium();
    if (isPlaying) advance();
    setIsPlaying(true);
    setPlaySignal((n) => n + 1);
  }, [isPlaying, advance]);

  const onAirPlay = useCallback(async () => {
    haptics.medium();
    try { await airplay.presentRoutePicker(); } catch { /* noop */ }
  }, []);

  const currentArt = current ? (backdropUrl(current.backdrop_path) || posterUrl(current.poster_path)) : null;
  const next = queue[1];
  const nextArt = next ? (backdropUrl(next.backdrop_path) || posterUrl(next.poster_path)) : null;
  const progress = Math.max(0, Math.min(1, (cycleSeconds - secondsLeft) / cycleSeconds));
  const era = current ? decadeLabel(current.year) : null;
  const ActiveComp = activeFeature?.Component;

  return (
    <div className="tr-stage tr-roulette">
      {/* Thin progress line for the current trailer (web cycle timer). */}
      <div className="tr-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>

      {/* Instant backdrop + a peek of the next, so the stage is never black. */}
      {currentArt && (
        <div className="tr-backdrop" aria-hidden="true" style={{ backgroundImage: `url("${currentArt}")` }} />
      )}
      {nextArt && (
        <div className="tr-next" aria-hidden="true" style={{ backgroundImage: `url("${nextArt}")` }} />
      )}

      {!activeFeature && (
        <div className="player-wrap">
          <Player
            trailer={current}
            nextTrailer={queue[1]}
            isPlaying={isPlaying}
            playSignal={playSignal}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={onTrailerEnded}
            onAdvanceInPlace={onAdvanceInPlace}
            onDurationKnown={onTrailerDurationKnown}
          />
        </div>
      )}

      {/* Top-right: fun-modes menu (✦) + a small info button (attribution). */}
      <div className="tr-topbar">
        <div className="tr-topbar-right">
          <button className="tr-glyph" onClick={() => { haptics.light(); setMenuOpen(true); }} aria-label="Fun modes">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l2.1 5.5L20 9.3l-4.3 3.7L17 19l-5-3-5 3 1.3-6L4 9.3l5.9-.8z" />
            </svg>
          </button>
          <button className="tr-glyph" onClick={() => { haptics.light(); setShowAbout(true); }} aria-label="About">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Minimal now-playing: title, year, a genre + decade badge. */}
      {current && (
        <div className="tr-cardinfo" key={current.id}>
          <h2>{current.title}{current.year ? <span className="tr-year"> {current.year}</span> : null}</h2>
          <div className="tr-badges">
            {genreNames(current.genre_ids).slice(0, 2).map((g) => (
              <span className="tr-badge" key={g}>{g}</span>
            ))}
            {era ? <span className="tr-badge tr-badge-era">{era}</span> : null}
          </div>
        </div>
      )}

      {/* The two buttons: Play (spin) + AirPlay. */}
      <div className="tr-roulette-actions">
        <button
          className={`tr-rbtn tr-rbtn-play${isPlaying ? ' is-playing' : ''}`}
          onClick={onSpin}
          disabled={!current}
          aria-label={isPlaying ? 'Spin a new random trailer' : 'Play'}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M9 6v12l9-6z" fill="currentColor" />
          </svg>
          <span>{isPlaying ? 'Spin' : 'Play'}</span>
        </button>
        <button className="tr-rbtn tr-rbtn-air" onClick={onAirPlay} aria-label="AirPlay to TV">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
            <polygon points="12 15 17 21 7 21 12 15" fill="currentColor" stroke="none" />
          </svg>
          <span>AirPlay</span>
        </button>
      </div>

      {loadError && (
        <div className="tmdb-error-banner">
          <div><strong>Couldn&apos;t load trailers.</strong></div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{loadError}</div>
          <button onClick={handleRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      )}

      {showAbout && <AboutScreen onClose={() => setShowAbout(false)} />}

      <FunSheet
        open={menuOpen}
        features={FEATURES}
        onPick={(f) => { haptics.medium(); setMenuOpen(false); setIsPlaying(false); setActiveFeature(f); }}
        onClose={() => setMenuOpen(false)}
      />
      {ActiveComp && <ActiveComp onClose={() => setActiveFeature(null)} />}
    </div>
  );
}
