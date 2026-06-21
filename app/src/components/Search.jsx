import { useState, useEffect, useRef } from 'react';
import { searchMulti, posterUrl } from '../lib/tmdb.js';
import * as haptics from '../lib/haptics.js';

/**
 * Search overlay — find a specific movie or actor. Minimal: one input and a
 * combined results list. Selecting a movie plays its trailer; selecting a
 * person loads their filmography into the queue. Debounced 350ms.
 */
export default function Search({ onClose, onSelectMovie, onSelectPerson }) {
  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setMovies([]); setPeople([]); setLoading(false); return undefined; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { movies: m, people: p } = await searchMulti(q);
        if (cancelled) return;
        setMovies(m.slice(0, 20));
        setPeople(p.slice(0, 6));
      } catch {
        if (!cancelled) { setMovies([]); setPeople([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const pickMovie = (m) => { haptics.medium(); onSelectMovie?.(m); onClose?.(); };
  const pickPerson = (p) => { haptics.medium(); onSelectPerson?.(p); onClose?.(); };

  return (
    <div className="screen search-screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onClose} aria-label="Close search">◂</button>
        <input
          ref={inputRef}
          className="search-input"
          type="search"
          placeholder="Search movies or actors…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search movies or actors"
        />
      </header>

      {loading && <p className="search-hint">Searching…</p>}

      {!loading && query.trim() && movies.length === 0 && people.length === 0 && (
        <p className="search-hint">No results for “{query.trim()}”.</p>
      )}

      {people.length > 0 && (
        <section className="search-group">
          <h2 className="search-section">People</h2>
          <ul className="search-people">
            {people.map((p) => (
              <li key={p.id}>
                <button className="search-person" onClick={() => pickPerson(p)}>
                  {p.profile_path
                    ? <img src={posterUrl(p.profile_path, 'w185')} alt="" loading="lazy" />
                    : <span className="search-avatar-fallback" aria-hidden="true">★</span>}
                  <span className="search-person-name">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {movies.length > 0 && (
        <section className="search-group">
          <h2 className="search-section">Movies</h2>
          <ul className="search-movies">
            {movies.map((m) => (
              <li key={m.id}>
                <button className="search-movie" onClick={() => pickMovie(m)}>
                  {m.poster_path
                    ? <img src={posterUrl(m.poster_path, 'w185')} alt="" loading="lazy" />
                    : <span className="search-poster-fallback" aria-hidden="true">🎬</span>}
                  <span className="search-movie-meta">
                    <span className="search-movie-title">{m.title}</span>
                    {m.release_date && <small>{m.release_date.slice(0, 4)}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
