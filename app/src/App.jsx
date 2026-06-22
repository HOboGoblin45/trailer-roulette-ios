import { useState, useEffect, useCallback } from 'react';
import TrailerRoulette from './components/TrailerRoulette.jsx';
import Onboarding from './components/Onboarding.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { get, KEYS } from './lib/storage.js';

/**
 * The whole app is one screen: a randomized, instant trailer feed. No tabs,
 * no filters, no accounts. Watchlist and About are lightweight overlays the
 * trailer screen opens itself — nothing stands between the user and the video.
 */
export default function App() {
  const [onboarded, setOnboarded] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const flag = await get(KEYS.ONBOARDED);
        if (!cancelled) setOnboarded(Boolean(flag));
      } catch {
        if (!cancelled) setOnboarded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const finishOnboarding = useCallback(() => setOnboarded(true), []);

  return (
    <div className="app-shell">
      <ErrorBoundary>
        <TrailerRoulette />
      </ErrorBoundary>
      {onboarded === false && <Onboarding onDone={finishOnboarding} />}
    </div>
  );
}
