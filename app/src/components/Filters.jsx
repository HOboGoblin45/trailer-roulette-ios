/**
 * Filters — era + genre + decade selectors. Trailer Roulette's default
 * catalog is pre-2010 cinema; users can flip to "Modern" if they want
 * the current Hollywood window. Decade chips below the era toggle are
 * scoped to the active era so the user always sees a coherent set.
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

// Pre-2010 leads, in chronological order. Modern era surfaces 2010s/2020s.
const CLASSIC_DECADES = ['1970', '1980', '1990', '2000'];
const MODERN_DECADES = ['2010', '2020'];

export default function Filters({ value, onChange }) {
  const era = value.era === 'modern' ? 'modern' : 'classic';
  const decades = era === 'classic' ? CLASSIC_DECADES : MODERN_DECADES;

  const setGenre = (id) => {
    haptics.selection();
    onChange({ ...value, genre: value.genre === id ? null : id });
  };
  const setDecade = (decade) => {
    haptics.selection();
    onChange({ ...value, decade: value.decade === decade ? null : decade });
  };
  const setEra = (nextEra) => {
    if (era === nextEra) return;
    haptics.medium();
    // Swapping era invalidates the decade pick (modern decades aren't valid
    // in classic era and vice versa). Keep genre.
    onChange({ ...value, era: nextEra, decade: null });
  };
  const clear = () => {
    haptics.light();
    onChange({ ...value, genre: null, decade: null });
  };

  return (
    <div className="filters">
      {/* Era toggle — segmented control, iOS-style */}
      <div className="era-toggle" role="tablist" aria-label="Era">
        <button
          className={`era-segment ${era === 'classic' ? 'active' : ''}`}
          onClick={() => setEra('classic')}
          role="tab"
          aria-selected={era === 'classic'}
        >
          Classic
        </button>
        <button
          className={`era-segment ${era === 'modern' ? 'active' : ''}`}
          onClick={() => setEra('modern')}
          role="tab"
          aria-selected={era === 'modern'}
        >
          Modern
        </button>
      </div>

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
        {decades.map((d) => (
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
