import { useEffect, useState, useCallback, useRef } from 'react';
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

const CYCLE_SECONDS = 90;

export default function TrailerRoulette({ onOpenWatchlist, onOpenAbout }) {
  const [filters, setFilters] = useState({ genre: null, decade: null });
  const [queue, setQueue] = useState([]);            // upcoming trailers
  const [current, setCurrent] = useState(null);
  const [profile, setProfile] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(CYCLE_SECONDS);
  const [isPlaying, setIsPlaying] = useState(false);

  // Watchlist set, kept in memory for fast lookup; persisted on changes.
  const [watchlistIds, setWatchlistIds] = useState(new Set());

  const timerRef = useRef(null);

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
      setQueue(ordered);
      // Auto-select the first as current; trailer key fetched lazily
      if (ordered.length > 0) {
        await selectAsCurrent(ordered[0]);
      }
    } catch (err) {
      console.error('[TrailerRoulette] loadQueue failed', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectAsCurrent = useCallback(async (trailer) => {
    let next = trailer;
    if (!trailer.youtubeKey) {
      const yt = await getTrailer(trailer.id);
      if (yt) next = { ...trailer, youtubeKey: yt.key };
    }
    if (next.runtime == null) {
      try {
        const details = await getMovieDetails(trailer.id);
        next = { ...next, runtime: details.runtime };
      } catch { /* runtime is optional */ }
    }
    setCurrent(next);
    setSecondsLeft(CYCLE_SECONDS);
  }, []);

  // Cycle timer — drives auto-advance (replaces "trailer ended" detection on iOS).
  useEffect(() => {
    if (!isPlaying || !current) return undefined;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          haptics.light();
          advance('skip');
          return CYCLE_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, current]);

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
        cycleProgress={(CYCLE_SECONDS - secondsLeft) / CYCLE_SECONDS}
      />

      <div className="player-wrap">
        <Player
          trailer={current}
          isPlaying={isPlaying}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        <SwipeOverlay onSeen={onSeen} onSkip={onSkip} disabled={!current} />
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
