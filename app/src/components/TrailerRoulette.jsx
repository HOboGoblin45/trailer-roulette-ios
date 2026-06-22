import { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import Player from './Player.jsx';
import SwipeCard from './SwipeCard.jsx';
import Watchlist from './Watchlist.jsx';
import AboutScreen from './AboutScreen.jsx';
import {
  discoverMovies, discoverRandomMix, getTrailer, getMovieDetails, pickDiscoverPage,
  getWatchProviders, toTrailerCandidate, genreNames,
} from '../lib/tmdb.js';
import { uniformShuffle } from '../lib/shuffleWeighting.js';
import { loadProfile, recordReaction, decay, saveProfile } from '../lib/tasteProfile.js';
import { get, set, KEYS } from '../lib/storage.js';
import { shareTrailer } from '../lib/share.js';
import * as airplay from '../lib/airplay.js';
import * as haptics from '../lib/haptics.js';

// "128" → "2h 8m"; "95" → "1h 35m"; "47" → "47m".
function formatRuntime(mins) {
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

const MAX_TRAILER_SECONDS = 180;
const DEFAULT_CYCLE_SECONDS = 90;
const PREFETCH_LOOKAHEAD = 3;

/**
 * The whole app: a randomized, instant feed of every reachable movie trailer.
 * No filters, no accounts. Tap to play, big Skip, one-tap AirPlay. Watchlist
 * and About are lightweight overlays so nothing stands between you and the video.
 */
export default function TrailerRoulette() {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_CYCLE_SECONDS);
  const [cycleSeconds, setCycleSeconds] = useState(DEFAULT_CYCLE_SECONDS);
  const [isPlaying, setIsPlaying] = useState(false);

  const [watchlistIds, setWatchlistIds] = useState(new Set());
  const [loadError, setLoadError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [currentProviders, setCurrentProviders] = useState(null);
  const [playSignal, setPlaySignal] = useState(0);

  const swipeRef = useRef(null);
  const timerRef = useRef(null);
  const prefetchedRef = useRef(new Set());
  const unplayableKeysRef = useRef(new Set());

  // Build an era-diverse batch (old + mid + recent), then shuffle uniformly so
  // the order is pure random. Stratified sampling is what keeps the feed from
  // over-indexing on recent blockbusters. Falls back to a plain deep-page pull
  // if the mix comes back thin.
  const loadQueue = useCallback(async () => {
    try {
      setLoadError(null);
      let results = await discoverRandomMix();
      if (!results || results.length < 8) {
        const data = await discoverMovies({ era: 'all', page: pickDiscoverPage(500) });
        results = [...(results || []), ...(data.results || [])];
      }
      const candidates = results.map(toTrailerCandidate);
      const ordered = uniformShuffle(candidates);
      prefetchedRef.current = new Set();
      setQueue(ordered);
      if (ordered.length > 0) await selectAsCurrent(ordered[0]);
    } catch (err) {
      console.error('[TrailerRoulette] loadQueue failed', err);
      setLoadError(err?.message || String(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Boot: load taste profile (for swipe history) + watchlist, then the queue.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedProfileRaw, watchlist] = await Promise.all([
        loadProfile(),
        get(KEYS.WATCHLIST),
      ]);
      if (cancelled) return;
      // Decay the stored taste profile and persist it (swipe history is still
      // recorded for the About → reset control), but the feed itself is now
      // pure-random, so nothing reads the profile into render state.
      await saveProfile(decay(storedProfileRaw));
      setWatchlistIds(new Set((watchlist || []).map((w) => w.id)));
      await loadQueue();
    })();
    return () => { cancelled = true; };
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
    // Skip movies with no trailer or a known-unplayable key (auto-skip up to 5
    // deep) so the user never lands on a dead card.
    const keyKnownBad = next.youtubeKey && unplayableKeysRef.current.has(next.youtubeKey);
    if ((!next.youtubeKey || keyKnownBad) && depth < 5) {
      setQueue((q) => {
        const rest = q.slice(1);
        if (rest[0]) selectAsCurrent(rest[0], depth + 1);
        return rest;
      });
      return;
    }
    if (next.runtime == null) {
      try {
        const details = await getMovieDetails(trailer.id);
        next = { ...next, runtime: details.runtime };
      } catch { /* runtime is optional */ }
    }
    setCurrent(next);
    setCycleSeconds(DEFAULT_CYCLE_SECONDS);
    setSecondsLeft(DEFAULT_CYCLE_SECONDS);
  }, []);

  // "Where to watch" for the current movie (non-blocking; JustWatch via TMDB).
  useEffect(() => {
    setCurrentProviders(null);
    if (!current?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const p = await getWatchProviders(current.id);
        if (!cancelled) setCurrentProviders(p);
      } catch { /* optional */ }
    })();
    return () => { cancelled = true; };
  }, [current?.id]);

  // Prefetch upcoming trailer keys so Skip is instant.
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

  // Web auto-advance timer (iOS native player owns its own lifecycle).
  useEffect(() => {
    if (Capacitor.getPlatform() === 'ios') return undefined;
    if (!isPlaying || !current) return undefined;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { haptics.light(); advance('skip'); return cycleSeconds; }
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

  const advance = useCallback(async (reaction = null) => {
    if (current && reaction) {
      await recordReaction(current, reaction); // persists swipe history
    }
    setQueue((q) => {
      const [, ...rest] = q;
      if (rest[0]) selectAsCurrent(rest[0]);
      else loadQueue().catch(() => {}); // exhausted → fetch more
      return rest;
    });
  }, [current, loadQueue, selectAsCurrent]);

  const onTrailerEnded = useCallback((payload) => {
    haptics.light();
    if (payload?.unplayable && payload?.youtubeKey) {
      unplayableKeysRef.current.add(payload.youtubeKey);
      advance(null);
      return;
    }
    const reason = String(payload?.reason || '');
    if (reason === 'ended') advance('seen');
    else if (reason === 'skip') advance('skip');
    else advance(null);
  }, [advance]);

  // Native chained to the next trailer in place (continuous playback). Keep
  // the JS queue + metadata panel in sync without reopening the player.
  const onAdvanceInPlace = useCallback((reaction) => {
    haptics.light();
    advance(reaction);
  }, [advance]);

  const onTrailerDurationKnown = useCallback((duration) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    const s = Math.min(Math.ceil(duration), MAX_TRAILER_SECONDS);
    setCycleSeconds(s);
    setSecondsLeft(s);
  }, []);

  // Idempotently add the current movie to the watchlist (swipe-right / ♥).
  const saveCurrent = useCallback(async () => {
    if (!current) return;
    const watchlist = (await get(KEYS.WATCHLIST)) || [];
    if (watchlist.some((w) => w.id === current.id)) return;
    const nextList = [...watchlist, {
      id: current.id, title: current.title, year: current.year,
      poster_path: current.poster_path, addedAt: new Date().toISOString(),
    }];
    await set(KEYS.WATCHLIST, nextList);
    setWatchlistIds(new Set(nextList.map((w) => w.id)));
  }, [current]);

  // Tinder gestures: swipe right = save + next, swipe left = skip.
  const onLike = useCallback(() => { haptics.medium(); saveCurrent(); advance('seen'); }, [saveCurrent, advance]);
  const onNope = useCallback(() => { haptics.medium(); advance('skip'); }, [advance]);
  const onTapPlay = useCallback(() => { setPlaySignal((n) => n + 1); }, []);

  // Keyboard parity for web QA: ← skip, → save.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (e.key === 'ArrowRight') swipeRef.current?.fling('like');
      else if (e.key === 'ArrowLeft') swipeRef.current?.fling('nope');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onAirPlay = useCallback(async () => {
    haptics.medium();
    try { await airplay.presentRoutePicker(); } catch { /* noop */ }
  }, []);

  const onShare = useCallback(() => {
    if (!current?.youtubeKey) return;
    haptics.light();
    shareTrailer({ title: current.title, youtubeKey: current.youtubeKey });
  }, [current]);

  const saved = current ? watchlistIds.has(current.id) : false;
  const providers = currentProviders;
  const hasWhereToWatch = providers && (providers.flatrate.length > 0 || providers.link);

  return (
    <div className="tr-stage">
      {/* Thin progress line for the current trailer (web cycle timer). */}
      <div className="tr-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, (cycleSeconds - secondsLeft) / cycleSeconds))})` }} />
      </div>

      {/* The swipeable trailer card: full-bleed video + its info. Drag it like
          a dating-app card — left to skip, right to save. */}
      <SwipeCard
        ref={swipeRef}
        disabled={!current}
        onLike={onLike}
        onNope={onNope}
        onTap={onTapPlay}
        resetKey={current?.id ?? 'empty'}
      >
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

        {current && (
          <div className="tr-cardinfo" key={current.id}>
            <h2>{current.title}{current.year ? <span className="tr-year"> {current.year}</span> : null}</h2>
            <div className="tr-badges">
              {Number.isFinite(current.vote_average) && current.vote_average > 0 && (
                <span className="tr-badge tr-badge-rating">★ {current.vote_average.toFixed(1)}</span>
              )}
              {current.runtime ? <span className="tr-badge">{formatRuntime(current.runtime)}</span> : null}
              {genreNames(current.genre_ids).slice(0, 3).map((g) => (
                <span className="tr-badge" key={g}>{g}</span>
              ))}
            </div>
            <p className="tr-overview">{current.overview}</p>
            {hasWhereToWatch && (
              <p className="tr-watch">
                {providers.flatrate.length > 0
                  ? `Streaming on ${providers.flatrate.slice(0, 3).join(', ')}`
                  : 'Where to watch'}
                {providers.link && (
                  <>{' · '}<a href={providers.link} target="_blank" rel="noreferrer">all options →</a></>
                )}
              </p>
            )}
          </div>
        )}
      </SwipeCard>

      {/* Floating top bar. */}
      <div className="tr-topbar">
        <button className="tr-glyph" onClick={() => { haptics.light(); setShowAbout(true); }} aria-label="About">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <span className="tr-brand">Trailer&nbsp;<b>Roulette</b></span>
        <div className="tr-topbar-right">
          <button className="tr-glyph" onClick={onShare} aria-label="Share" disabled={!current?.youtubeKey}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <path d="M16 6l-4-4-4 4" /><path d="M12 2v13" />
            </svg>
          </button>
          <button className="tr-glyph" onClick={() => { haptics.light(); setShowWatchlist(true); }} aria-label="Watchlist">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            {watchlistIds.size > 0 && <span className="tr-glyph-badge">{watchlistIds.size}</span>}
          </button>
        </div>
      </div>

      {/* Dating-app action row: ✕ skip · AirPlay · ♥ save. The swipe gesture
          does the same; these are the tap-to-decide shortcuts. */}
      <div className="tr-actions">
        <button className="tr-act tr-act-nope" onClick={() => swipeRef.current?.fling('nope')} aria-label="Skip" disabled={!current}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
        <button className="tr-act tr-act-air" onClick={onAirPlay} aria-label="AirPlay to TV">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
            <polygon points="12 15 17 21 7 21 12 15" fill="currentColor" stroke="none" />
          </svg>
          <span>AirPlay</span>
        </button>
        <button className={`tr-act tr-act-like${saved ? ' is-on' : ''}`} onClick={() => swipeRef.current?.fling('like')} aria-label="Save" disabled={!current}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
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

      {showWatchlist && <Watchlist onClose={() => setShowWatchlist(false)} />}
      {showAbout && <AboutScreen onClose={() => setShowAbout(false)} />}
    </div>
  );
}
