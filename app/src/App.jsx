import TrailerRoulette from './components/TrailerRoulette.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

/**
 * The whole app is one screen: a random trailer roulette with two buttons,
 * Play and AirPlay. No tabs, no accounts, no onboarding — press play and go.
 */
export default function App() {
  return (
    <div className="app-shell">
      <ErrorBoundary>
        <TrailerRoulette />
      </ErrorBoundary>
    </div>
  );
}
