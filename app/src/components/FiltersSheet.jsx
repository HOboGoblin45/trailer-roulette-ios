import { useState, useEffect } from 'react';
import { MOVIE_GENRES, catalogDecades } from '../lib/tmdb.js';
import { useDismissAnimation } from '../lib/useDismissAnimation.js';
import * as haptics from '../lib/haptics.js';

/**
 * FiltersSheet — narrow the Everything roulette to chosen decades and genres.
 *
 * Pure draft sheet: edits land in local state and only reach the app when
 * the user hits Apply. This matters because the parent rebuilds the whole
 * queue (a fresh TMDB pull) on apply — tapping chips must not churn the
 * feed behind a half-edited draft.
 *
 * Semantics (mirrored by filtersQuery in tmdb.js):
 *   - Decades are a range: picks collapse to the span between the earliest
 *     and latest selected decade ("the 80s and 90s" plays 1980–1999).
 *   - Genres are OR (with_genres).
 *   - Empty both → Everything, the unfiltered feed.
 */
const EMPTY = { decades: [], genres: [] };

export default function FiltersSheet({ open, filters = EMPTY, onApply, onClose }) {
  const { mounted, closing, close } = useDismissAnimation(open, onClose);
  const [decades, setDecades] = useState([]);
  const [genres, setGenres] = useState([]);

  // Re-seed the draft from the applied filters every time the sheet opens,
  // so an abandoned edit never leaks back into the feed.
  useEffect(() => {
    if (!open) return;
    setDecades([...(filters?.decades || [])]);
    setGenres([...(filters?.genres || [])]);
  }, [open, filters]);

  if (!mounted) return null;

  const decadeList = catalogDecades();
  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const span = decades.length === 1
    ? `${decades[0]}s`
    : decades.length > 1
      ? `${Math.min(...decades)}s – ${Math.max(...decades)}s`
      : null;
  const genreLabels = genres.map((id) => MOVIE_GENRES[id]).filter(Boolean);
  const summary = [span, genreLabels.join(' · ')].filter(Boolean).join(' + ') || 'Everything';
  const hasDraft = decades.length > 0 || genres.length > 0;

  const onDone = () => {
    haptics.medium();
    onApply({ decades, genres });
    close();
  };
  const onClear = () => {
    haptics.light();
    setDecades([]);
    setGenres([]);
  };
  const onBack = () => {
    haptics.light();
    close();
  };

  return (
    <div className={`screen filters-screen${closing ? ' is-closing' : ''}`}>
      <header className="screen-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">◂</button>
        <h1>Filters</h1>
        <span />
      </header>

      <section className="about-section">
        <h2>Decades</h2>
        <p className="filters-hint">
          Pick any number of decades — they play as one range, oldest to newest.
        </p>
        <div className="filters-chips" role="group" aria-label="Decades">
          {decadeList.map((y) => (
            <button
              key={y}
              type="button"
              className={`filters-chip${decades.includes(y) ? ' is-on' : ''}`}
              aria-pressed={decades.includes(y)}
              onClick={() => { haptics.light(); toggle(decades, setDecades, y); }}
            >
              {y}s
            </button>
          ))}
        </div>
      </section>

      <section className="about-section">
        <h2>Genres</h2>
        <p className="filters-hint">
          Any number of genres, treated as “or”. Leave both sections empty to
          play everything.
        </p>
        <div className="filters-chips" role="group" aria-label="Genres">
          {Object.entries(MOVIE_GENRES).map(([id, name]) => {
            const gid = Number(id);
            return (
              <button
                key={id}
                type="button"
                className={`filters-chip${genres.includes(gid) ? ' is-on' : ''}`}
                aria-pressed={genres.includes(gid)}
                onClick={() => { haptics.light(); toggle(genres, setGenres, gid); }}
              >
                {name}
              </button>
            );
          })}
        </div>
      </section>

      <section className="about-section filters-summary">
        <p className="filters-summary-label">Your roulette now draws from</p>
        <p className="filters-summary-value" role="status">{summary}</p>
      </section>

      <div className="filters-actions">
        <button type="button" className="tr-pill" onClick={onClear} disabled={!hasDraft}>
          Clear
        </button>
        <button type="button" className="tr-pill filters-done" onClick={onDone}>
          {hasDraft ? 'Apply filters' : 'Play everything'}
        </button>
      </div>
    </div>
  );
}