import { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import Player from './Player.jsx';
import AboutScreen from './AboutScreen.jsx';
import TheaterSheet from './TheaterSheet.jsx';
import FiltersSheet from './FiltersSheet.jsx';
import MovieSheet from './MovieSheet.jsx';
import FunSheet from '../features/FunSheet.jsx';
import { FEATURES } from '../features/index.js';
import { useOverlay } from '../features/overlay.js';
import {
  discoverMovies, discoverRandomMix, getTrailer, pickDiscoverPage,
  toTrailerCandidate, genreNames, backdropUrl, posterUrl,
} from '../lib/tmdb.js';
import { getTheaterQueue, monthLabel } from '../lib/theaters.js';
import { uniformShuffle } from '../lib/shuffleWeighting.js';
import * as storage from '../lib/storage.js';
import * as airplay from '../lib/airplay.js';
import * as haptics from '../lib/haptics.js';

const MAX_TRAILER_SECONDS = 180;
const DEFAULT_CYCLE_SECONDS = 90;
// The web cycle timer is a BACKSTOP, not the advance mechanism — the ad-aware
// end detector advances at the real end. The countdown ticks through pre-roll
// ad time too (content hasn't started yet), so the backstop must leave
// headroom for ads or it would cut the trailer short (v3.1.0 cut trailers at
// ad-length seconds when the ad's duration poisoned this timer).
const AD_ALLOWANCE_SECONDS = 45;
// v3.4.0: deeper. YouTube's player is handed this queue and sequences it
// itself, so every key ready at open time is one more trailer that plays with
// no gap. TMDB responses are cached, so the extra reach is nearly free.
const PREFETCH_LOOKAHEAD = 8;

// 1987 → "1980s". A small, fun reminder that the feed spans every decade.
function decadeLabel(year) {
  if (!Number.isFinite(year) || year <= 0) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

/**
 * First-run hint — the one screen this app shows before it starts playing.
 *
 * Autoplay (below) means a brand new user is thrown straight into a
 * full-screen native player and never sees the home stage, so they never
 * learn that Theaters, Modes and AirPlay exist. On the very first launch we
 * hold autoplay back and show this instead; dismissing it is what starts
 * playback. Every launch after that goes straight to the trailer.
 *
 * Dialog semantics, focus trapping and the exit animation all come from
 * useOverlay — same contract as FunSheet, TheaterSheet and the six modes, so
 * this closes the way everything else in the app closes.
 */
function FirstRunHint({ open, onClose }) {
  const { mounted, closing, close, dialogProps } = useOverlay({
    open,
    onClose,
    label: 'How Trailer Roulette works',
  });
  if (!mounted) return null;

  return (
    <div className={`tr-hint-backdrop${closing ? ' is-closing' : ''}`} onClick={close}>
      <div
        className={`tr-hint${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        {...dialogProps}
      >
        <p className="tr-hint-eyebrow">First time here</p>
        <h2 className="tr-hint-title">Trailer Roulette</h2>
        <p className="tr-hint-lede">A random trailer channel. Nothing to set up.</p>

        <ul className="tr-hint-list">
          <li>
            <span className="tr-hint-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M9 6v12l9-6z" fill="currentColor" />
              </svg>
            </span>
            <span><strong>Play</strong> spins a fresh random trailer. Press it again for another.</span>
          </li>
          <li>
            <span className="tr-hint-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
                <polygon points="12 15 17 21 7 21 12 15" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <span><strong>AirPlay</strong> throws whatever is playing to a TV.</span>
          </li>
          <li>
            <span className="tr-hint-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {/* Film-strip glyph — same mark as the Theaters pill. */}
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="4" x2="7" y2="20" />
                <line x1="17" y1="4" x2="17" y2="20" />
                <line x1="3" y1="9" x2="7" y2="9" /><line x1="3" y1="15" x2="7" y2="15" />
                <line x1="17" y1="9" x2="21" y2="9" /><line x1="17" y1="15" x2="21" y2="15" />
              </svg>
            </span>
            <span>
              <strong>Theaters</strong>, top left, tunes the channel to one real cinema and
              what it is showing this month.
            </span>
          </li>
          <li>
            <span className="tr-hint-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l2.1 5.5L20 9.3l-4.3 3.7L17 19l-5-3-5 3 1.3-6L4 9.3l5.9-.8z" />
              </svg>
            </span>
            <span><strong>Modes</strong>, top right, holds the other ways to watch.</span>
          </li>
        </ul>

        <button type="button" className="tr-hint-go" onClick={close}>
          Start watching
        </button>
      </div>
    </div>
  );
}

/**
 * Trailer Roulette — the whole app, kept deliberately tiny.
 *
 * A random, never-ending feed of movie trailers from every genre and every
 * decade. Two buttons: Play (spin a fresh random trailer) and AirPlay (throw
 * it on the TV). Optional filters (v3.4.3) narrow the feed by decade and
 * genre; no accounts, no algorithm — just press play and see what comes up.
 * Trailers auto-advance, so it also runs as a hands-free
 * channel you can leave going.
 *
 * Theater Mode (v3.2.0): tune the channel to an independent theater. Pick a
 * theater (sorted by distance if you allow location) and the roulette spins
 * ONLY what that theater is showing this month — its real, live programme:
 * new releases, repertory classics, festival picks. "Everything" restores the
 * classic all-of-cinema channel. The two-button design is untouched.
 */
export default function TrailerRoulette() {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_CYCLE_SECONDS);
  const [cycleSeconds, setCycleSeconds] = useState(DEFAULT_CYCLE_SECONDS);
  const [isPlaying, setIsPlaying] = useState(false);

  const [loadError, setLoadError] = useState(false); // flag only — see loadQueue
  const [retrying, setRetrying] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [playSignal, setPlaySignal] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState(null);
  const [source, setSource] = useState(null); // null = Everything; { marketSlug, marketName } = Theater Mode
  const [theaterOpen, setTheaterOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [muted, setMuted] = useState(false); // restored from storage on boot
  const [hintOpen, setHintOpen] = useState(false); // first launch only
  // Filters (v3.4.3): { decades: number[], genres: number[] }, both empty =
  // Everything. Lives here (not in a mode) because it shapes the core feed.
  const [filters, setFilters] = useState({ decades: [], genres: [] });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const timerRef = useRef(null);
  const prefetchedRef = useRef(new Set());
  const unplayableKeysRef = useRef(new Set());
  const retryRef = useRef({ timer: null, attempt: 0 });
  const toppingRef = useRef(false);
  const loadQueueRef = useRef(null);
  const sourceRef = useRef(null); // mirrors `source` for use inside stable callbacks
  const filtersRef = useRef({ decades: [], genres: [] }); // mirrors `filters` for loadQueue

  // Build the queue for the active source.
  //  - Everything: an era-diverse random batch (old + mid + recent), shuffled
  //    uniformly. Falls back to a plain deep-page pull if the mix comes thin.
  //    With a decade/genre filter applied (v3.4.3) the feed instead draws a
  //    deep random page from the FILTERED discover catalog — three pages in
  //    parallel so a sparse niche still fills the batch. A filter that would
  //    return nothing falls back to the unfiltered mix rather than stranding
  //    the channel; the Filter pill stays lit so the user can widen it.
  //  - Theater: the selected theater's live "Now Showing" for this month,
  //    matched to TMDB and shuffled. Finite by nature, so when it runs dry we
  //    reshuffle and loop — a cinema lobby reel, not an endless feed.
  const loadQueue = useCallback(async ({ append = false } = {}) => {
    try {
      if (!append) setLoadError(false);
      const src = sourceRef.current;
      let candidates;
      if (src?.marketSlug) {
        candidates = await getTheaterQueue(src.marketSlug);
      } else {
        const flt = filtersRef.current;
        const filtered = flt && (flt.decades?.length || flt.genres?.length);
        let results = [];
        if (filtered) {
          const pages = await Promise.all([
            discoverMovies({ genres: flt.genres, decades: flt.decades, page: pickDiscoverPage(500) }),
            discoverMovies({ genres: flt.genres, decades: flt.decades, page: pickDiscoverPage(500) }),
            discoverMovies({ genres: flt.genres, decades: flt.decades, page: pickDiscoverPage(500) }),
          ]);
          const seen = new Set();
          results = [].concat(...pages.map((d) => d.results || []))
            .filter((m) => m && !seen.has(m.id) && seen.add(m.id));
        }
        if (!results.length) {
          // No filter, or the filter came back empty — the unfiltered mix.
          results = await discoverRandomMix();
          if (!results || results.length < 8) {
            const data = await discoverMovies({ era: 'all', page: pickDiscoverPage(500) });
            results = [...(results || []), ...(data.results || [])];
          }
        }
        candidates = results.map(toTrailerCandidate);
      }
      const ordered = uniformShuffle(candidates);
      retryRef.current.attempt = 0;
      clearTimeout(retryRef.current.timer);

      if (append) {
        setQueue((q) => {
          const have = new Set(q.map((m) => m.id));
          let fresh = ordered.filter((m) => !have.has(m.id));
          if (!fresh.length && src?.marketSlug) {
            // Theater lineups are finite — loop the reel (skip an immediate
            // repeat of the tail so back-to-back duplicates can't happen).
            const tailId = q[q.length - 1]?.id;
            fresh = uniformShuffle(candidates.filter((m) => m.id !== tailId));
          }
          return [...q, ...fresh];
        });
      } else {
        prefetchedRef.current = new Set();
        setQueue(ordered);
        if (ordered.length > 0) await selectAsCurrent(ordered[0]);
      }
    } catch (err) {
      console.error('[TrailerRoulette] loadQueue failed', err);
      // A flag, not the message: `err` is whatever TMDB, the network stack or
      // a parser threw, and the banner is the first thing a new user may see.
      if (!append) setLoadError(true);
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

  // Boot: restore the saved source (theater or Everything), start the queue,
  // then restore the remembered preferences and decide how this launch opens
  // — straight into a trailer, or on the one-time hint.
  useEffect(() => {
    (async () => {
      try {
        const saved = await storage.get(storage.KEYS.SOURCE);
        if (saved?.marketSlug) {
          sourceRef.current = saved;
          setSource(saved);
        }
      } catch { /* default to Everything */ }
      // Filters restore before the first queue build so the opening feed is
      // already shaped by the user's last choices.
      try {
        const saved = await storage.get(storage.KEYS.FILTERS);
        if (saved?.decades?.length || saved?.genres?.length) {
          filtersRef.current = {
            decades: saved.decades.filter(Number.isFinite) || [],
            genres: saved.genres.filter(Number.isFinite) || [],
          };
          setFilters(filtersRef.current);
        }
      } catch { /* default to Everything */ }
      loadQueue();

      // Sound is the user's last choice, not ours. Default unmuted: a silent
      // trailer is not a trailer. Restored BEFORE autoplay is armed so the
      // first openTrailer already carries the right value rather than
      // starting loud and correcting itself a frame later.
      try {
        setMuted((await storage.get(storage.KEYS.MUTED)) === true);
      } catch { /* default unmuted */ }

      // First launch shows the hint and lets its dismissal start playback;
      // every launch after that arms autoplay immediately. A failed read
      // counts as "already seen" — skipping the hint once is far better than
      // showing it on every launch of a device where persistence is broken.
      let seenHint = true;
      try {
        seenHint = (await storage.get(storage.KEYS.ONBOARDED)) === true;
      } catch { seenHint = true; }
      if (!seenHint) setHintOpen(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The hint is dismissed: remember that, and hand off to autoplay.
  const onDismissHint = useCallback(() => {
    setHintOpen(false);
    storage.set(storage.KEYS.ONBOARDED, true).catch(() => { /* best-effort */ });
  }, []);




  // Switch source (theater picked, or back to Everything) and rebuild the
  // queue from scratch. Persisted so the app reopens on the same channel.
  const onPickSource = useCallback((picked) => {
    setTheaterOpen(false);
    const next = picked?.marketSlug ? picked : null;
    const prev = sourceRef.current;
    if ((next?.marketSlug || null) === (prev?.marketSlug || null)) return;
    sourceRef.current = next;
    setSource(next);
    (async () => {
      try {
        if (next) await storage.set(storage.KEYS.SOURCE, next);
        else await storage.remove(storage.KEYS.SOURCE);
      } catch { /* persistence is best-effort */ }
    })();
    setIsPlaying(false); // ends any native session; Play starts the new channel
    setCurrent(null);
    setQueue([]);
    prefetchedRef.current = new Set();
    loadQueue();
  }, [loadQueue]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try { await loadQueue(); }
    finally { setRetrying(false); }
  }, [loadQueue]);

  // Apply decade/genre filters and rebuild the feed from scratch. Persisted
  // so the channel reopens filtered. Filters shape the Everything channel
  // only — a tuned theater keeps its own finite lineup, and the fun modes
  // bring their own selectors.
  const onApplyFilters = useCallback((next) => {
    setFiltersOpen(false);
    const clean = {
      decades: (next?.decades || []).filter(Number.isFinite),
      genres: (next?.genres || []).filter(Number.isFinite),
    };
    const prev = filtersRef.current;
    if (JSON.stringify(clean) === JSON.stringify(prev)) return;
    filtersRef.current = clean;
    setFilters(clean);
    (async () => {
      try {
        if (clean.decades.length || clean.genres.length) {
          await storage.set(storage.KEYS.FILTERS, clean);
        } else {
          await storage.remove(storage.KEYS.FILTERS);
        }
      } catch { /* persistence is best-effort */ }
    })();
    setIsPlaying(false); // ends any native session; Play starts the new channel
    setCurrent(null);
    setQueue([]);
    prefetchedRef.current = new Set();
    loadQueue();
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

  // Pause on background (iOS). On return we deliberately stay paused: the
  // native session is over, so flipping isPlaying back to true would only lie
  // to the Play button ("Spin") and make the next press skip a trailer the
  // user never saw. One tap on Play resumes exactly where they left off.
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'ios') return undefined;
    let sub;
    let cancelled = false;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        if (cancelled) return;
        sub = await App.addListener('appStateChange', (state) => {
          if (!state.isActive) setIsPlaying(false);
        });
      } catch (e) {
        console.warn('[TrailerRoulette] @capacitor/app unavailable', e);
      }
    })();
    return () => { cancelled = true; try { sub?.remove?.(); } catch { /* noop */ } };
  }, []);

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

  // Native auto-skipped a dead video id mid-session — blocklist it so it
  // never resurfaces from a later queue pull.
  const onUnplayable = useCallback((key) => {
    if (key) unplayableKeysRef.current.add(key);
  }, []);

  const onTrailerDurationKnown = useCallback((duration) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    // Trusted content duration (the player never reports an ad's duration
    // since v3.2.0) + ad headroom, so the backstop can't fire mid-trailer
    // while a pre-roll ad is eating wall-clock time. Latest report wins —
    // the player refines the value once real playback is confirmed.
    const s = Math.min(Math.ceil(duration), MAX_TRAILER_SECONDS) + AD_ALLOWANCE_SECONDS;
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

  // The user hit the mute toggle inside the native player. Mirror it into
  // state (so the next openTrailer opens the same way) and remember it for
  // the next launch.
  const onMuteChanged = useCallback((next) => {
    const value = !!next;
    setMuted(value);
    storage.set(storage.KEYS.MUTED, value).catch(() => { /* best-effort */ });
  }, []);

  // The now-playing card opens the details sheet. Autoplay lands the user in
  // the player first, so the route here is: swipe the player down, tap the
  // card on the stage.
  const onOpenDetails = useCallback(() => {
    haptics.light();
    setSheetOpen(true);
  }, []);

  // role="button" carries no implicit keyboard activation — Enter and Space
  // have to be wired by hand, or the card is mouse/touch only.
  const onCardKeyDown = useCallback((e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    onOpenDetails();
  }, [onOpenDetails]);

  const currentArt = current ? (backdropUrl(current.backdrop_path) || posterUrl(current.poster_path)) : null;
  const next = queue[1];
  const nextArt = next ? (backdropUrl(next.backdrop_path) || posterUrl(next.poster_path)) : null;
  const progress = Math.max(0, Math.min(1, (cycleSeconds - secondsLeft) / cycleSeconds));
  const era = current ? decadeLabel(current.year) : null;
  const filterCount = (filters.decades?.length || 0) + (filters.genres?.length || 0);
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
          {/* ONE Play affordance on this screen: the bottom pill below.
              The player used to render its own 88px on-stage Play as well —
              two controls doing the same job, the smaller of which sat right
              on top of the artwork. The pill is the app's identity (Play +
              AirPlay, the two-button thesis), it is bigger, it is where the
              thumb already is, and it is the only one that can also spin to a
              fresh trailer. So the stage keeps no button and is free to show
              state instead: artwork, then spinner + caption while the native
              player opens. The fun modes have no pill, so they keep the
              on-stage button (Player.ios.jsx defaults showPlayButton to true).
              Both routes start playback through the same playSignal bump. */}
          <Player
            trailer={current}
            nextTrailer={queue[1]}
            playlist={queue}
            isPlaying={isPlaying}
            muted={muted}
            playSignal={playSignal}
            showPlayButton={false}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={onTrailerEnded}
            onAdvanceInPlace={onAdvanceInPlace}
            onUnplayable={onUnplayable}
            onMuteChanged={onMuteChanged}
            onDurationKnown={onTrailerDurationKnown}
          />
        </div>
      )}

      {/* Top bar. Left: the Theater pill (Theater Mode entry point — shows
          the tuned theater's name). Right: Modes pill + info button. */}
      <div className="tr-topbar">
        <div className="tr-topbar-left">
          <button
            className={`tr-pill tr-pill-filter${filterCount ? ' is-filtered' : ''}`}
            onClick={() => { haptics.light(); setFiltersOpen(true); }}
            aria-label={filterCount ? `Filters active (${filterCount}). Change filters` : 'Filter by decade and genre'}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {/* Funnel glyph */}
              <path d="M3 5h18l-7 8v6l-4 2v-8z" />
            </svg>
            <span>{filterCount ? `Filters · ${filterCount}` : 'Filter'}</span>
          </button>
          <button
            className={`tr-pill tr-pill-theater${source ? ' is-tuned' : ''}`}
            onClick={() => { haptics.light(); setTheaterOpen(true); }}
            aria-label={source ? `Theater: ${source.marketName}. Change theater` : 'Pick a theater'}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {/* Film-strip glyph */}
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="7" y1="4" x2="7" y2="20" />
              <line x1="17" y1="4" x2="17" y2="20" />
              <line x1="3" y1="9" x2="7" y2="9" /><line x1="3" y1="15" x2="7" y2="15" />
              <line x1="17" y1="9" x2="21" y2="9" /><line x1="17" y1="15" x2="21" y2="15" />
            </svg>
            <span className="tr-pill-theater-label">{source ? source.marketName : 'Theaters'}</span>
          </button>
        </div>
        <div className="tr-topbar-right">
          <button className="tr-pill" onClick={() => { haptics.light(); setMenuOpen(true); }} aria-label="Open fun modes">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l2.1 5.5L20 9.3l-4.3 3.7L17 19l-5-3-5 3 1.3-6L4 9.3l5.9-.8z" />
            </svg>
            <span>Modes</span>
          </button>
          <button className="tr-glyph" onClick={() => { haptics.light(); setShowAbout(true); }} aria-label="About">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Minimal now-playing: title, year, a genre + decade badge — plus the
          live "Now Showing" badge when the channel is tuned to a theater.
          The whole block is the entry point to the details sheet, so it is a
          real control: button role, keyboard activation, a 44pt floor and a
          disclosure chevron so it does not read as inert caption text. It
          stays a div wearing role="button" rather than a <button> because it
          contains an <h2> — heading content is not valid inside a button. */}
      {current && (
        <div className="tr-cardinfo" key={current.id}>
          <div
            className="tr-cardinfo-btn"
            role="button"
            tabIndex={0}
            aria-label={`About ${current.title}`}
            onClick={onOpenDetails}
            onKeyDown={onCardKeyDown}
          >
            <div className="tr-cardinfo-text">
              <h2>{current.title}{current.year ? <span className="tr-year"> {current.year}</span> : null}</h2>
              <div className="tr-badges">
                {source ? (
                  <span className="tr-badge tr-badge-live">
                    Now Showing · {source.marketName} · {monthLabel()}
                  </span>
                ) : null}
                {genreNames(current.genre_ids).slice(0, 2).map((g) => (
                  <span className="tr-badge" key={g}>{g}</span>
                ))}
                {era ? <span className="tr-badge tr-badge-era">{era}</span> : null}
              </div>
            </div>
            <span className="tr-cardinfo-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 5 16 12 9 19" />
              </svg>
            </span>
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
        <div className="tmdb-error-banner" role="alert">
          <div><strong>Couldn&apos;t load trailers.</strong></div>
          {/* Fixed copy: the raw failure (TMDB body text, DNS errors, HTTP
              codes) went to the console in loadQueue. What the user needs is
              the cause they can act on and the fact that we keep trying. */}
          <div>Check your connection — the channel comes back on its own once you are online.</div>
          <button onClick={handleRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      )}

      <AboutScreen open={showAbout} onClose={() => setShowAbout(false)} />

      <TheaterSheet
        open={theaterOpen}
        current={source}
        onPick={onPickSource}
        onClose={() => setTheaterOpen(false)}
      />

      <FiltersSheet
        open={filtersOpen}
        filters={filters}
        onApply={onApplyFilters}
        onClose={() => setFiltersOpen(false)}
      />

      <MovieSheet
        open={sheetOpen}
        movie={current}
        source={source}
        onClose={() => setSheetOpen(false)}
      />

      <FunSheet
        open={menuOpen}
        features={FEATURES}
        onPick={(f) => {
          haptics.medium();
          setMenuOpen(false);
          setIsPlaying(false);
          // A mode unmounts the roulette's Player, so a playSignal bump fired
          // while it is open would be spent on a component that is not there
          // and re-applied on mount when the mode closes. Autoplay must not
          // ambush the user on their way back to the stage.
          setActiveFeature(f);
        }}
        onClose={() => setMenuOpen(false)}
      />
      {ActiveComp && <ActiveComp onClose={() => setActiveFeature(null)} />}

      {/* Last in the tree so it sits above the stage chrome it points at. */}
      <FirstRunHint open={hintOpen} onClose={onDismissHint} />
    </div>
  );
}
