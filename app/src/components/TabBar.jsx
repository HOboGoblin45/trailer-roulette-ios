import * as haptics from '../lib/haptics.js';

/**
 * Bottom tab bar — iOS standard pattern. Persistent across the app so the
 * trailers stay the hero and filters/watchlist/more are one tap away.
 * SVG icons (not glyphs) so they always render on iOS.
 */
const ICONS = {
  trailers: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M7 4v5M17 4v5M7 20v-5M17 20v-5" />
      <path d="M11 12.5l3 1.8-3 1.8v-3.6z" fill="currentColor" stroke="none" />
    </svg>
  ),
  filters: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" />
      <circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="13" cy="18" r="2" />
    </svg>
  ),
  watchlist: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
};

const TABS = [
  { id: 'trailers', label: 'Trailers' },
  { id: 'filters', label: 'Filters' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'more', label: 'More' },
];

export default function TabBar({ tab, onChange, watchlistCount = 0 }) {
  return (
    <nav className="tab-bar" role="tablist" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tab-bar-item ${tab === t.id ? 'active' : ''}`}
          role="tab"
          aria-selected={tab === t.id}
          aria-label={t.label}
          onClick={() => { if (tab !== t.id) haptics.selection(); onChange(t.id); }}
        >
          <span className="tab-bar-icon">
            {ICONS[t.id]}
            {t.id === 'watchlist' && watchlistCount > 0 && (
              <span className="tab-bar-badge">{watchlistCount}</span>
            )}
          </span>
          <span className="tab-bar-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
