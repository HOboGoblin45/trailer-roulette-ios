import { useEffect, useState } from 'react';
import { get, set, KEYS } from '../lib/storage.js';
import { posterUrl } from '../lib/tmdb.js';
import * as haptics from '../lib/haptics.js';

/**
 * Watchlist screen — saved trailers, sorted newest-first.
 * Empty state guides the user back to the shuffle screen.
 */
export default function Watchlist({ onClose }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = (await get(KEYS.WATCHLIST)) || [];
      if (!cancelled) setItems(list.slice().reverse());
    })();
    return () => { cancelled = true; };
  }, []);

  const remove = async (id) => {
    haptics.medium();
    const list = (await get(KEYS.WATCHLIST)) || [];
    const next = list.filter((w) => w.id !== id);
    await set(KEYS.WATCHLIST, next);
    setItems(next.slice().reverse());
  };

  return (
    <div className="screen watchlist-screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onClose} aria-label="Back">
          ◂
        </button>
        <h1>Watchlist</h1>
        <span className="count" aria-label={`${items.length} items`}>
          {items.length}
        </span>
      </header>

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
          {items.map((w) => (
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
