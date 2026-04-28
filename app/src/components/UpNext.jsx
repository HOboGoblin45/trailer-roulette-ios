import { useState } from 'react';
import { posterUrl } from '../lib/tmdb.js';

/**
 * UpNext — shows the next 5 in the queue. On mobile, presented as a bottom
 * sheet with a drag-handle; on desktop, just a sidebar (CSS-driven).
 */
export default function UpNext({ queue, onSelect }) {
  const [expanded, setExpanded] = useState(false);

  if (!queue?.length) return null;

  return (
    <aside className={`up-next ${expanded ? 'expanded' : ''}`}>
      <button
        className="up-next-handle"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse Up Next' : 'Expand Up Next'}
      >
        <span className="handle-bar" />
        <span className="handle-label">Up Next</span>
      </button>
      <ul className="up-next-list" hidden={!expanded}>
        {queue.map((t) => (
          <li key={t.id}>
            <button className="up-next-item" onClick={() => onSelect(t)}>
              {t.poster_path && (
                <img
                  src={posterUrl(t.poster_path, 'w185')}
                  alt=""
                  loading="lazy"
                />
              )}
              <span className="up-next-title">
                {t.title} {t.year ? <small>({t.year})</small> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
