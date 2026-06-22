import { useState, useCallback, useEffect } from 'react';
import TrailerRoulette from './components/TrailerRoulette.jsx';
import Watchlist from './components/Watchlist.jsx';
import AboutScreen from './components/AboutScreen.jsx';
import Onboarding from './components/Onboarding.jsx';
import Stats from './components/Stats.jsx';
import Filters from './components/Filters.jsx';
import TabBar from './components/TabBar.jsx';
import { get, set, KEYS } from './lib/storage.js';

/**
 * Top-level shell with a persistent bottom tab bar (iOS pattern).
 *
 * Tabs: Trailers (the hero — playback + swipe), Filters (its own tab so the
 * player stays uncluttered), Watchlist, and More (about / stats / data).
 *
 * Filter state lives here so it's shared between the Filters tab (edits it)
 * and the Trailers tab (loads the queue from it).
 */
const TABS = { trailers: 'trailers', filters: 'filters', watchlist: 'watchlist', more: 'more' };
const DEFAULT_FILTERS = { era: 'all', genre: null, decades: [] };

function migrateFilters(stored) {
  const f = { ...DEFAULT_FILTERS, ...(stored || {}) };
  if (f.decade && !(f.decades && f.decades.length)) f.decades = [f.decade];
  delete f.decade;
  if (!Array.isArray(f.decades)) f.decades = [];
  return f;
}

export default function App() {
  const [tab, setTab] = useState(TABS.trailers);
  const [moreScreen, setMoreScreen] = useState('about'); // 'about' | 'stats'
  const [onboarded, setOnboarded] = useState(null);
  const [filters, setFilters] = useState(null); // null until loaded
  const [watchlistCount, setWatchlistCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [flag, storedFilters, watchlist] = await Promise.all([
          get(KEYS.ONBOARDED), get(KEYS.FILTERS), get(KEYS.WATCHLIST),
        ]);
        if (cancelled) return;
        setOnboarded(Boolean(flag));
        setFilters(migrateFilters(storedFilters));
        setWatchlistCount((watchlist || []).length);
      } catch {
        if (!cancelled) { setOnboarded(true); setFilters({ ...DEFAULT_FILTERS }); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onFiltersChange = useCallback(async (next) => {
    setFilters(next);
    try { await set(KEYS.FILTERS, next); } catch { /* noop */ }
  }, []);

  // Let the Trailers screen report watchlist changes so the tab badge stays live.
  const onWatchlistCountChange = useCallback((n) => setWatchlistCount(n), []);
  const finishOnboarding = useCallback(() => setOnboarded(true), []);
  const goTrailers = useCallback(() => setTab(TABS.trailers), []);

  const ready = onboarded !== null && filters !== null;

  return (
    <div className="app-shell">
      <main className="tab-content">
        {ready && (
          <div style={{ display: tab === TABS.trailers ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            <TrailerRoulette filters={filters} onWatchlistCountChange={onWatchlistCountChange} />
          </div>
        )}

        {ready && tab === TABS.filters && (
          <div className="screen filters-screen">
            <header className="screen-header">
              <span />
              <h1>Filters</h1>
              <button className="back-btn" onClick={goTrailers} aria-label="Done">Done</button>
            </header>
            <Filters value={filters} onChange={onFiltersChange} />
          </div>
        )}

        {ready && tab === TABS.watchlist && (
          <Watchlist onClose={goTrailers} onCountChange={onWatchlistCountChange} />
        )}

        {ready && tab === TABS.more && moreScreen === 'about' && (
          <AboutScreen onClose={goTrailers} onOpenStats={() => setMoreScreen('stats')} />
        )}
        {ready && tab === TABS.more && moreScreen === 'stats' && (
          <Stats onClose={() => setMoreScreen('about')} />
        )}
      </main>

      {ready && (
        <TabBar
          tab={tab}
          watchlistCount={watchlistCount}
          onChange={(t) => { if (t === TABS.more) setMoreScreen('about'); setTab(t); }}
        />
      )}

      {/* Onboarding overlays everything on first launch only. */}
      {onboarded === false && <Onboarding onDone={finishOnboarding} />}
    </div>
  );
}
