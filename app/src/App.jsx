import { useState, useCallback, useEffect } from 'react';
import TrailerRoulette from './components/TrailerRoulette.jsx';
import Watchlist from './components/Watchlist.jsx';
import AboutScreen from './components/AboutScreen.jsx';
import Onboarding from './components/Onboarding.jsx';
import Stats from './components/Stats.jsx';
import { get, KEYS } from './lib/storage.js';

/**
 * Top-level router — three screens, no library because the app is small enough.
 * Persisting the screen selection isn't needed; the app always boots on the shuffle screen.
 *
 * On first launch, an Onboarding overlay covers the trailer screen until the
 * user finishes or skips it. We render the trailer screen behind it so the
 * queue starts loading immediately — no boot delay regardless of which path
 * the user takes through onboarding.
 */
const SCREENS = {
  shuffle: 'shuffle',
  watchlist: 'watchlist',
  about: 'about',
  stats: 'stats',
};

export default function App() {
  const [screen, setScreen] = useState(SCREENS.shuffle);
  // null while we read storage; false = show onboarding; true = skip it.
  const [onboarded, setOnboarded] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const flag = await get(KEYS.ONBOARDED);
        if (!cancelled) setOnboarded(Boolean(flag));
      } catch {
        if (!cancelled) setOnboarded(true); // fail-open — never block the user
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const goShuffle = useCallback(() => setScreen(SCREENS.shuffle), []);
  const goWatchlist = useCallback(() => setScreen(SCREENS.watchlist), []);
  const goAbout = useCallback(() => setScreen(SCREENS.about), []);
  const goStats = useCallback(() => setScreen(SCREENS.stats), []);
  const finishOnboarding = useCallback(() => setOnboarded(true), []);

  return (
    <div className="app-shell">
      {screen === SCREENS.shuffle && (
        <TrailerRoulette onOpenWatchlist={goWatchlist} onOpenAbout={goAbout} />
      )}
      {screen === SCREENS.watchlist && <Watchlist onClose={goShuffle} />}
      {screen === SCREENS.about && <AboutScreen onClose={goShuffle} onOpenStats={goStats} />}
      {screen === SCREENS.stats && <Stats onClose={goShuffle} />}

      {/* Onboarding overlays the shuffle screen on first launch only. */}
      {onboarded === false && <Onboarding onDone={finishOnboarding} />}
    </div>
  );
}
