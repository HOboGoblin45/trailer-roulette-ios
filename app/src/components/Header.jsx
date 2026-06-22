/**
 * Header — fixed top bar with safe-area inset for the iPhone notch / Dynamic Island.
 * Cycle progress is rendered as a thin gold line at the bottom of the header.
 */
export default function Header({ onOpenWatchlist, onOpenAbout, onOpenSearch, watchlistCount = 0, cycleProgress }) {
  return (
    <header className="app-header">
      <div className="app-header-row">
        <div className="header-side">
          {onOpenAbout && (
            <button className="header-btn" onClick={onOpenAbout} aria-label="About">ⓘ</button>
          )}
        </div>
        <h1 className="app-title">
          Trailer <span className="accent">Roulette</span>
        </h1>
        <div className="header-side header-right">
          {onOpenSearch && (
            <button className="header-btn" onClick={onOpenSearch} aria-label="Search movies or actors">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
              </svg>
            </button>
          )}
          {onOpenWatchlist && (
            <button
              className="header-btn watchlist-btn"
              onClick={onOpenWatchlist}
              aria-label={`Watchlist (${watchlistCount} items)`}
            >
              ♥
              {watchlistCount > 0 && <span className="badge">{watchlistCount}</span>}
            </button>
          )}
        </div>
      </div>
      <div
        className="cycle-bar"
        style={{ transform: `scaleX(${Math.min(1, Math.max(0, cycleProgress || 0))})` }}
      />
    </header>
  );
}
