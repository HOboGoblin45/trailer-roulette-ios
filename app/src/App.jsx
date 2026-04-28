import { useState, useCallback } from 'react';
import TrailerRoulette from './components/TrailerRoulette.jsx';
import Watchlist from './components/Watchlist.jsx';
import AboutScreen from './components/AboutScreen.jsx';

/**
 * Top-level router — three screens, no library because the app is small enough.
 * Persisting the screen selection isn't needed; the app always boots on the shuffle screen.
 */
const SCREENS = {
  shuffle: 'shuffle',
  watchlist: 'watchlist',
  about: 'about',
};

export default function App() {
  const [screen, setScreen] = useState(SCREENS.shuffle);

  const goShuffle = useCallback(() => setScreen(SCREENS.shuffle), []);
  const goWatchlist = useCallback(() => setScreen(SCREENS.watchlist), []);
  const goAbout = useCallback(() => setScreen(SCREENS.about), []);

  return (
    <div className="app-shell">
      {screen === SCREENS.shuffle && (
        <TrailerRoulette onOpenWatchlist={goWatchlist} onOpenAbout={goAbout} />
      )}
      {screen === SCREENS.watchlist && <Watchlist onClose={goShuffle} />}
      {screen === SCREENS.about && <AboutScreen onClose={goShuffle} />}
    </div>
  );
}
