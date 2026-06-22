import { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import Header from './Header.jsx';
import Player from './Player.jsx';
import SwipeOverlay from './SwipeOverlay.jsx';
import Watchlist from './Watchlist.jsx';
import AboutScreen from './AboutScreen.jsx';
import {
  discoverMovies, getTrailer, getMovieDetails, pickDiscoverPage,
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
  const [profile, setProfile] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_CYCLE_SECONDS);
  const [cycleSeconds, setCycleSeconds] = useState(DEFAULT_CYCLE_SECONDS);
  const [isPlaying, setIsPlaying] = useState(false);

  const [watchlistIds, setWatchlistIds] = useState(new Set());
  const [loadError, setLoadError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [currentProviders, setCurrentProviders] = useState(null);

  const timerRef = useRef(null);
  const prefetchedRef = useRef(new Set());
  const unplayableKeysRef = useRef(new Set());
  const totalPagesRef = useRef(1);

  // Pull a page of every-era movies and shuffle uniformly (pure random order).
  const loadQueue = useCallback(async (p, { fresh = false } = {}) => {
    try {
      setLoadError(null);
      if (fresh) totalPagesRef.current = 1;
      const page = fresh ? 1 : pickDiscoverPage(totalPagesRef.current);
      const data = await discoverMovies({ era: 'all', page });
      if (Number.isFinite(data.total_pages)) totalPagesRef.current = data.total_pages;
      const candidates = (data.results || []).map(toTrailerCandidate);
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
      const storedProfile = decay(storedProfileRaw);
      await saveProfile(storedProfile);
      setProfile(storedProfile);
      setWatchlistIds(new Set((watchlist || []).map((w) => w.id)));
      await loadQueue(storedProfile, { fresh: true });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try { await loadQueue(profile, { fresh: true }); }
    finally { setRetrying(false); }
  }, [profile, loadQueue]);

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
      const updated = await recordReaction(current, reaction);
      setProfile(updated);
    }
    setQueue((q) => {
      const [, ...rest] = q;
      if (rest[0]) selectAsCurrent(rest[0]);
      else loadQueue(profile).catch(() => {}); // exhausted → fetch more
      return rest;
    });
  }, [current, profile, loadQueue, selectAsCurrent]);

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

  const onSeen = useCallback(() => { haptics.medium(); advance('seen'); }, [advance]);
  const onSkip = useCallback(() => { haptics.medium(); advance('skip'); }, [advance]);

  const onAirPlay = useCallback(async () => {
    haptics.medium();
    try { await airplay.presentRoutePicker(); } catch { /* noop */ }
  }, []);

  const onShare = useCallback(() => {
    if (!current?.youtubeKey) return;
    haptics.light();
    shareTrailer({ title: current.title, youtubeKey: current.youtubeKey });
  }, [current]);

  const toggleWatchlist = useCallback(async () => {
    if (!current) return;
    haptics.medium();
    const watchlist = (await get(KEYS.WATCHLIST)) || [];
    const inList = watchlist.some((w) => w.id === current.id);
    const nextList = inList
      ? watchlist.filter((w) => w.id !== current.id)
      : [...watchlist, {
          id: current.id, title: current.title, year: current.year,
          poster_path: current.poster_path, addedAt: new Date().toISOString(),
        }];
    await set(KEYS.WATCHLIST, nextList);
    setWatchlistIds(new Set(nextList.map((w) => w.id)));
  }, [current]);

  const saved = current ? watchlistIds.has(current.id) : false;

  return (
    <div className="trailer-roulette">
      <Header
        onOpenWatchlist={() => { haptics.light(); setShowWatchlist(true); }}
        onOpenAbout={() => { haptics.light(); setShowAbout(true); }}
        watchlistCount={watchlistIds.size}
        cycleProgress={(cycleSeconds - secondsLeft) / cycleSeconds}
      />

      {loadError && (
        <div className="tmdb-error-banner">
          <div><strong>Couldn&apos;t load trailers.</strong></div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{loadError}</div>
          <button onClick={handleRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      )}

      <div className="player-wrap">
        <SwipeOverlay onSeen={onSeen} onSkip={onSkip} disabled={!current} />
        <Player
          trailer={current}
          nextTrailer={queue[1]}
          isPlaying={isPlaying}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={onTrailerEnded}
          onAdvanceInPlace={onAdvanceInPlace}
          onDurationKnown={onTrailerDurationKnown}
        />
      </div>

      {/* Primary actions — AirPlay and Skip are the heroes; save/share are quiet. */}
      <div className="trailer-actions">
        <button className="ta-icon" onClick={toggleWatchlist} aria-label={saved ? 'Remove from watchlist' : 'Save to watchlist'} disabled={!current}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{saved ? '♥' : '♡'}</span>
        </button>

        <button className="ta-big ta-airplay" onClick={onAirPlay} aria-label="AirPlay to TV">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
            <polygon points="12 15 17 21 7 21 12 15" />
          </svg>
          <span>AirPlay</span>
        </button>

        <button className="ta-big ta-skip" onClick={onSkip} aria-label="Skip to next trailer" disabled={!current}>
          <span>Skip</span>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" />
            <line x1="19" y1="5" x2="19" y2="19" />
          </svg>
        </button>

        <button className="ta-icon" onClick={onShare} aria-label="Share trailer" disabled={!current?.youtubeKey}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <path d="M16 6l-4-4-4 4" /><path d="M12 2v13" />
          </svg>
        </button>
      </div>

      <div className="meta">
        {current && (
          <>
            <h2>{current.title} {current.year ? <span className="year">({current.year})</span> : null}</h2>
            <div className="meta-badges">
              {Number.isFinite(current.vote_average) && current.vote_average > 0 && (
                <span className="badge badge-rating">★ {current.vote_average.toFixed(1)}</span>
              )}
              {current.runtime ? <span className="badge badge-runtime">{formatRuntime(current.runtime)}</span> : null}
              {genreNames(current.genre_ids).slice(0, 3).map((g) => (
                <span className="badge badge-genre" key={g}>{g}</span>
              ))}
            </div>
            <p className="overview">{current.overview}</p>
            {currentProviders && (currentProviders.flatrate.length > 0 || currentProviders.link) && (
              <p className="where-to-watch">
                {currentProviders.flatrate.length > 0
                  ? `Streaming on ${currentProviders.flatrate.slice(0, 3).join(', ')}`
                  : 'Where to watch'}
                {currentProviders.link && (
                  <>{' · '}<a href={currentProviders.link} target="_blank" rel="noreferrer">all options →</a></>
                )}
              </p>
            )}
          </>
        )}
      </div>

      {showWatchlist && <Watchlist onClose={() => setShowWatchlist(false)} />}
      {showAbout && <AboutScreen onClose={() => setShowAbout(false)} />}
    </div>
  );
}
