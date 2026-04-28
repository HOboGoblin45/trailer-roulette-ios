/**
 * Filters — genre + decade selectors. Horizontal-scroll on mobile for narrow
 * screens; wraps on desktop.
 *
 * Genre IDs come from TMDB's standard list; we hard-code the popular ones to
 * avoid an extra API call at boot.
 */
import * as haptics from '../lib/haptics.js';

const GENRES = [
  { id: 28, label: 'Action' },
  { id: 12, label: 'Adventure' },
  { id: 16, label: 'Animation' },
  { id: 35, label: 'Comedy' },
  { id: 80, label: 'Crime' },
  { id: 99, label: 'Documentary' },
  { id: 18, label: 'Drama' },
  { id: 10751, label: 'Family' },
  { id: 14, label: 'Fantasy' },
  { id: 36, label: 'History' },
  { id: 27, label: 'Horror' },
  { id: 10402, label: 'Music' },
  { id: 9648, label: 'Mystery' },
  { id: 10749, label: 'Romance' },
  { id: 878, label: 'Sci-Fi' },
  { id: 53, label: 'Thriller' },
  { id: 10752, label: 'War' },
  { id: 37, label: 'Western' },
];

const DECADES = ['1970', '1980', '1990', '2000', '2010', '2020'];

export default function Filters({ value, onChange }) {
  const setGenre = (id) => {
    haptics.selection();
    onChange({ ...value, genre: value.genre === id ? null : id });
  };
  const setDecade = (decade) => {
    haptics.selection();
    onChange({ ...value, decade: value.decade === decade ? null : decade });
  };
  const clear = () => {
    haptics.light();
    onChange({ genre: null, decade: null });
  };

  return (
    <div className="filters">
      <div className="filters-row" role="tablist" aria-label="Genre filter">
        {GENRES.map((g) => (
          <button
            key={g.id}
            className={`chip ${value.genre === g.id ? 'active' : ''}`}
            onClick={() => setGenre(g.id)}
            role="tab"
            aria-selected={value.genre === g.id}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="filters-row" role="tablist" aria-label="Decade filter">
        {DECADES.map((d) => (
          <button
            key={d}
            className={`chip ${value.decade === d ? 'active' : ''}`}
            onClick={() => setDecade(d)}
            role="tab"
            aria-selected={value.decade === d}
          >
            {d}s
          </button>
        ))}
        {(value.genre || value.decade) && (
          <button className="chip chip-clear" onClick={clear}>Clear</button>
        )}
      </div>
    </div>
  );
}
