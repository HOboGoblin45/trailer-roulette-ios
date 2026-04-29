import { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import Header from './Header.jsx';
import Player from './Player.jsx';
import Filters from './Filters.jsx';
import UpNext from './UpNext.jsx';
import SwipeOverlay from './SwipeOverlay.jsx';
import CastButton from './CastButton.jsx';
import { discoverMovies, getTrailer, getMovieDetails } from '../lib/tmdb.js';
import { weightedShuffle } from '../lib/shuffleWeighting.js';
import { loadProfile, recordReaction, decay, saveProfile } from '../lib/tasteProfile.js';
import { get, set, KEYS } from '../lib/storage.js';
import * as haptics from '../lib/haptics.js';

// Maximum we'll show a single trailer before auto-advancing — used as a
// safety cap when YouTube hasn't reported real duration yet, and as a
// fallback if onEnded never fires (e.g. on the static-iframe fallback path).
const MAX_TRAILER_SECONDS = 180;
const DEFAULT_CYCLE_SECONDS = 90;

// How many upcoming queue entries to prefetch trailer keys for. Two is
// enough to cover the gap between cycles even if the user is rapid-skipping.
const PREFETCH_LOOKAHEAD = 2;

export default function TrailerRoulette({ onOpenWatchlist, onOpenAbout }) {
  const [filters, setFilters] = useState({ genre: null, decade: null });
  const [queue, setQueue] = useState([]);            // upcoming trailers
  const [current, setCurrent] = useState(null);
  const [profile, setProfile] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_CYCLE_SECONDS);
  const [cycleSeconds, setCycleSeconds] = useState(DEFAULT_CYCLE_SECONDS);
  const [isPlaying, setIsPlaying] = useState(false);

  // Watchlist set, kept in memory for fast lookup; persisted on changes.
  const [watchlistIds, setWatchlistIds] = useState(new Set());
  const [loadError, setLoadError] = useState(null);
  const [retrying, setRetrying] = useState(false);

  const timerRef = useRef(null);
  const prefetchedRef = useRef(new Set()); // ids whose trailer key has been resolved
  // Set of YouTube keys that we've confirmed are unplayable (embed disabled
  // by the uploader / region-locked / removed). We record these from the
  // iOS player's onEnded({ unplayable: true, youtubeKey }) callback and
  // skip any movie whose resolved key is in here.
  const unplayableKeysRef = useRef(new Set());

  // Boot: load profile, filters, watchlist; fetch initial queue.
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const [storedFilters, storedProfileRaw, watchlist] = await Promise.all([
        get(KEYS.FILTERS),
        loadProfile(),
        get(KEYS.WATCHLIST),
      ]);
      if (cancelled) return;

      const storedProfile = decay(storedProfileRaw);
      await saveProfile(storedProfile);

      setProfile(storedProfile);
      if (storedFilters) setFilters(storedFilters);
      setWatchlistIds(new Set((watchlist || []).map((w) => w.id)));
      await loadQueue(storedFilters || filters, storedProfile);
    }
    boot();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load queue whenever filters change.
  const loadQueue = useCallback(async (f, p) => {
    try {
      setLoadError(null);
      const data = await discoverMovies({ genre: f.genre, decade: f.decade });
      const candidates = (data.results || []).map((m) => ({
        id: m.id,
        title: m.title,
        overview: m.overview,
        year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
        runtime: null,
        genre_ids: m.genre_ids || [],
        poster_path: m.poster_path,
        backdrop_path: m.backdrop_path,
        youtubeKey: null,
      }));
      const ordered = weightedShuffle(candidates, p);
      prefetchedRef.current = new Set(); // queue replaced, reset cache
      setQueue(ordered);
      // Auto-select the first as current; trailer key fetched lazily
      if (ordered.length > 0) {
        await selectAsCurrent(ordered[0]);
      }
    } catch (err) {
      console.error('[TrailerRoulette] loadQueue failed', err);
      const msg = err?.message || String(err);
      const apiKeyHint = (typeof import.meta.env.VITE_TMDB_API_KEY === 'string' && import.meta.env.VITE_TMDB_API_KEY.length > 20)
        ? 'API key bundled (' + import.meta.env.VITE_TMDB_API_KEY.length + ' chars)'
        : 'API key MISSING from build (' + (import.meta.env.VITE_TMDB_API_KEY || 'undefined') + ')';
      setLoadError(msg + ' | ' + apiKeyHint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await loadQueue(filters, profile);
    } finally {
      setRetrying(false);
    }
  }, [filters, profile, loadQueue]);

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
    // Skip if we have no key OR if we know this key is unplayable
    // (embed disabled by the uploader). Auto-skip up to 5 movies deep
    // before giving up so the user never sees a dead trailer card.
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

  // Prefetch the next N entries' YouTube keys in the background so when
  // the cycle advances we don't pay TMDB latency in the gap.
  useEffect(() => {
    if (queue.length < 2) return;
    const lookahead = queue.slice(1, 1 + PREFETCH_LOOKAHEAD);
    let cancelled = false;
    (async () => {
      for (const m of lookahead) {
        if (cancelled) return;
        if (m.youtubeKey) continue;
        if (prefetchedRef.current.has(m.id)) continue;
        prefetchedRef.current.add(m.id);
        try {
          const yt = await getTrailer(m.id);
          if (cancelled) return;
          if (yt) {
            setQueue((q) =>
              q.map((entry) => (entry.id === m.id ? { ...entry, youtubeKey: yt.key } : entry)),
            );
          }
        } catch (e) {
          // Non-fatal — selectAsCurrent will retry when this entry surfaces.
          console.debug('[TrailerRoulette] prefetch failed', m.id, e);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [queue]);

  // Cycle timer — drives auto-advance with the dynamic cycleSeconds.
  useEffect(() => {
    if (!isPlaying || !current) return undefined;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          haptics.light();
          advance('skip');
          return cycleSeconds;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, current, cycleSeconds]);

  // Pause when app is backgrounded, resume on foreground. iOS only — on
  // web the document visibility events handle this naturally.
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'ios') return undefined;
    let sub;
    let cancelled = false;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        if (cancelled) return;
        sub = await App.addListener('appStateChange', (state) => {
          if (state.isActive) {
            // Resume: restart cycle if there's a trailer loaded.
            if (current?.youtubeKey) setIsPlaying(true);
          } else {
            setIsPlaying(false);
          }
        });
      } catch (e) {
        console.warn('[TrailerRoulette] @capacitor/app unavailable', e);
      }
    })();
    return () => {
      cancelled = true;
      try { sub?.remove?.(); } catch { /* noop */ }
    };
  }, [current?.youtubeKey]);

  const advance = useCallback(async (reaction = null) => {
    if (current && reaction) {
      const updated = await recordReaction(current, reaction);
      setProfile(updated);
    }
    setQueue((q) => {
      const [, ...rest] = q;
      const next = rest[0];
      if (next) selectAsCurrent(next);
      else {
        // Queue exhausted — re-fetch
        loadQueue(filters, profile).catch(() => {});
      }
      return rest;
    });
  }, [current, filters, profile, loadQueue, selectAsCurrent]);

  // iOS player → trailer finished OR dismissed OR was unplayable → advance.
  // Payload shape: { unplayable, youtubeKey, reason }
  //   reason 'ended'         — trailer played through → 'seen' (positive)
  //   reason 'user'          — user tapped Done early → null (neutral)
  //   reason 'unplayable:NN' — embed-disabled / removed → mark + skip
  //   reason 'replaced'      — internal handoff → null
  const onTrailerEnded = useCallback((payload) => {
    haptics.light();
    if (payload?.unplayable && payload?.youtubeKey) {
      unplayableKeysRef.current.add(payload.youtubeKey);
      console.warn(
        '[TrailerRoulette] Marking unplayable key',
        payload.youtubeKey,
        'reason:', payload.reason,
      );
      advance(null);
      return;
    }
    const reaction = payload?.reason === 'ended' ? 'seen' : null;
    advance(reaction);
  }, [advance]);

  // YouTube IFrame Player reports the real duration on ready — use it to
  // time the cycle precisely instead of the 90s default. Cap at MAX so a
  // 4-minute behind-the-scenes doesn't trap the viewer.
  const onTrailerDurationKnown = useCallback((duration) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    const s = Math.min(Math.ceil(duration), MAX_TRAILER_SECONDS);
    setCycleSeconds(s);
    setSecondsLeft(s);
  }, []);

  const onSeen = useCallback(() => {
    haptics.medium();
    advance('seen');
  }, [advance]);

  const onSkip = useCallback(() => {
    haptics.medium();
    advance('skip');
  }, [advance]);

  const onShuffle = useCallback(() => {
    haptics.heavy();
    if (queue.length > 0 && profile) {
      const reshuffled = weightedShuffle(queue, profile);
      setQueue(reshuffled);
      if (reshuffled[0]) selectAsCurrent(reshuffled[0]);
    }
  }, [queue, profile, selectAsCurrent]);

  const onFiltersChange = useCallback(async (next) => {
    setFilters(next);
    await set(KEYS.FILTERS, next);
    await loadQueue(next, profile);
  }, [profile, loadQueue]);

  const toggleWatchlist = useCallback(async () => {
    if (!current) return;
    const inList = watchlistIds.has(current.id);
    haptics.medium();
    const watchlist = (await get(KEYS.WATCHLIST)) || [];
    let nextList;
    if (inList) {
      nextList = watchlist.filter((w) => w.id !== current.id);
    } else {
      nextList = [...watchlist, {
        id: current.id,
        title: current.title,
        year: current.year,
        poster_path: current.poster_path,
        addedAt: new Date().toISOString(),
      }];
    }
    await set(KEYS.WATCHLIST, nextList);
    setWatchlistIds(new Set(nextList.map((w) => w.id)));
  }, [current, watchlistIds]);

  return (
    <div className="trailer-roulette">
      <Header
        onOpenWatchlist={onOpenWatchlist}
        onOpenAbout={onOpenAbout}
        watchlistCount={watchlistIds.size}
        cycleProgress={(cycleSeconds - secondsLeft) / cycleSeconds}
      />

      {loadError && (
        <div className="tmdb-error-banner">
          <div><strong>Couldn't load trailers.</strong></div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{loadError}</div>
          <button onClick={handleRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      )}

      <div className="player-wrap">
        {/* SwipeOverlay first in DOM, below Player in z-stack for taps. */}
        <SwipeOverlay onSeen={onSeen} onSkip={onSkip} disabled={!current} />
        <Player
          trailer={current}
          isPlaying={isPlaying}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={onTrailerEnded}
          onDurationKnown={onTrailerDurationKnown}
        />
        <div className="player-overlay-controls">
          <button
            className="control-btn"
            onClick={toggleWatchlist}
            aria-label={watchlistIds.has(current?.id) ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {watchlistIds.has(current?.id) ? '♥' : '♡'}
          </button>
          <CastButton />
          <button className="control-btn shuffle" onClick={onShuffle} aria-label="Shuffle">
            ⇄
          </button>
        </div>
      </div>

      <div className="meta">
        {current && (
          <>
            <h2>{current.title} {current.year ? <span className="year">({current.year})</span> : null}</h2>
            <p className="overview">{current.overview}</p>
            <div className="cycle-counter" aria-label={`${secondsLeft} seconds left`}>
              {secondsLeft}s
            </div>
          </>
        )}
      </div>

      <Filters value={filters} onChange={onFiltersChange} />
      <UpNext queue={queue.slice(1, 6)} onSelect={selectAsCurrent} />
    </div>
  );
}
