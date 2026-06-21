/**
 * Header — fixed top bar with safe-area inset for the iPhone notch / Dynamic Island.
 * Cycle progress is rendered as a thin gold line at the bottom of the header.
 */
export default function Header({ onOpenWatchlist, onOpenAbout, onOpenSearch, watchlistCount, cycleProgress }) {
  return (
    <header className="app-header">
      <div className="app-header-row">
        <button
          className="header-btn"
          onClick={onOpenAbout}
          aria-label="About"
        >
          ⓘ
        </button>
        <h1 className="app-title">
          Trailer <span className="accent">Roulette</span>
        </h1>
        <div className="header-right">
          <button
            className="header-btn"
            onClick={onOpenSearch}
            aria-label="Search movies or actors"
          >
            🔍
          </button>
          <button
            className="header-btn watchlist-btn"
            onClick={onOpenWatchlist}
            aria-label={`Watchlist (${watchlistCount} items)`}
          >
            ♥
            {watchlistCount > 0 && <span className="badge">{watchlistCount}</span>}
          </button>
        </div>
      </div>
      <div
        className="cycle-bar"
        style={{ transform: `scaleX(${Math.min(1, Math.max(0, cycleProgress || 0))})` }}
      />
    </header>
  );
}
