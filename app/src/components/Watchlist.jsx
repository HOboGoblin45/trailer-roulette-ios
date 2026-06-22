import { useEffect, useState } from 'react';
import { get, set, KEYS } from '../lib/storage.js';
import { posterUrl } from '../lib/tmdb.js';
import * as haptics from '../lib/haptics.js';

/**
 * Watchlist screen — saved trailers, sorted newest-first.
 * Empty state guides the user back to the shuffle screen.
 */
export default function Watchlist({ onClose, onCountChange, onOpenAbout }) {
  const [items, setItems] = useState([]);
  const [sort, setSort] = useState('added-desc');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = (await get(KEYS.WATCHLIST)) || [];
      if (!cancelled) { setItems(list); onCountChange?.(list.length); }
    })();
    return () => { cancelled = true; };
  }, [onCountChange]);

  const remove = async (id) => {
    haptics.medium();
    const list = (await get(KEYS.WATCHLIST)) || [];
    const next = list.filter((w) => w.id !== id);
    await set(KEYS.WATCHLIST, next);
    setItems(next);
    onCountChange?.(next.length);
  };

  // Derived, sorted view of the raw (chronological) list.
  const sorted = (() => {
    const arr = items.slice();
    switch (sort) {
      case 'added-asc':
        return arr;
      case 'title':
        return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'year-desc':
        return arr.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
      case 'year-asc':
        return arr.sort((a, b) => (Number(a.year) || 0) - (Number(b.year) || 0));
      case 'added-desc':
      default:
        return arr.reverse();
    }
  })();

  return (
    <div className="screen watchlist-screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onClose} aria-label="Back">
          ◂
        </button>
        <h1>Watchlist</h1>
        {onOpenAbout ? (
          <button className="back-btn" onClick={onOpenAbout} aria-label="About" style={{ fontSize: 15 }}>
            About
          </button>
        ) : (
          <span className="count" aria-label={`${items.length} items`}>{items.length}</span>
        )}
      </header>

      {items.length > 1 && (
        <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="watchlist-sort" style={{ color: 'var(--fg-2)', fontSize: 14 }}>Sort</label>
          <select
            id="watchlist-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort watchlist"
            style={{
              background: 'var(--bg-2)',
              color: 'var(--fg)',
              border: '1px solid var(--hairline)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 14,
            }}
          >
            <option value="added-desc">Recently added</option>
            <option value="added-asc">Oldest first</option>
            <option value="title">Title A–Z</option>
            <option value="year-desc">Newest releases first</option>
            <option value="year-asc">Oldest releases first</option>
          </select>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <p>Nothing saved yet.</p>
          <p className="hint">
            Tap <span className="heart">♡</span> on the player to save a trailer for later.
          </p>
          <button className="cta" onClick={onClose}>Back to Shuffle</button>
        </div>
      ) : (
        <ul className="watchlist-grid">
          {sorted.map((w) => (
            <li key={w.id}>
              <article className="watchlist-card">
                {w.poster_path && (
                  <img
                    src={posterUrl(w.poster_path, 'w342')}
                    alt={`Poster for ${w.title}`}
                    loading="lazy"
                  />
                )}
                <div className="watchlist-meta">
                  <h2>{w.title}</h2>
                  {w.year && <p className="year">{w.year}</p>}
                  <button
                    className="remove-btn"
                    onClick={() => remove(w.id)}
                    aria-label={`Remove ${w.title} from watchlist`}
                  >
                    Remove
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
