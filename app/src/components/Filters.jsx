/**
 * Filters — era + genre + decade selectors. Trailer Roulette's default
 * catalog spans every era of cinema; users can narrow to "Classic" (pre-2010)
 * or "Modern" (2010+) if they want. Decade chips below the era toggle are
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

// All eras by default; Classic = pre-2010, Modern = 2010s/2020s.
const CLASSIC_DECADES = ['1970', '1980', '1990', '2000'];
const MODERN_DECADES = ['2010', '2020'];
const ALL_DECADES = ['1970', '1980', '1990', '2000', '2010', '2020'];

function decadesForEra(era) {
  if (era === 'classic') return CLASSIC_DECADES;
  if (era === 'modern') return MODERN_DECADES;
  return ALL_DECADES;
}

export default function Filters({ value, onChange }) {
  const era = ['classic', 'modern', 'all'].includes(value.era) ? value.era : 'all';
  const availableDecades = decadesForEra(era);
  const selectedDecades = Array.isArray(value.decades) ? value.decades : [];

  const setGenre = (id) => {
    haptics.selection();
    onChange({ ...value, genre: value.genre === id ? null : id });
  };
  const setDecade = (decade) => {
    haptics.selection();
    // Multi-select: toggle this decade in/out of the set so several can combine.
    const next = selectedDecades.includes(decade)
      ? selectedDecades.filter((d) => d !== decade)
      : [...selectedDecades, decade];
    onChange({ ...value, decades: next });
  };
  const setEra = (nextEra) => {
    if (era === nextEra) return;
    haptics.medium();
    // Swapping era invalidates the decade picks (they're scoped to the era). Keep genre.
    onChange({ ...value, era: nextEra, decades: [] });
  };
  const clear = () => {
    haptics.light();
    onChange({ ...value, genre: null, decades: [] });
  };

  return (
    <div className="filters">
      {/* Era toggle — segmented control, iOS-style */}
      <div className="era-toggle" role="tablist" aria-label="Era">
        <button
          className={`era-segment ${era === 'all' ? 'active' : ''}`}
          onClick={() => setEra('all')}
          role="tab"
          aria-selected={era === 'all'}
        >
          All
        </button>
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
        {availableDecades.map((d) => (
          <button
            key={d}
            className={`chip ${selectedDecades.includes(d) ? 'active' : ''}`}
            onClick={() => setDecade(d)}
            role="button"
            aria-pressed={selectedDecades.includes(d)}
          >
            {d}s
          </button>
        ))}
        {(value.genre || selectedDecades.length > 0) && (
          <button className="chip chip-clear" onClick={clear}>Clear</button>
        )}
      </div>
    </div>
  );
}
