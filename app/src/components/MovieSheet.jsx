import { useEffect, useMemo, useState } from 'react';
import './movie-sheet.css';
import { useOverlay } from '../features/overlay.js';
import { buildFacts } from '../lib/movieFacts.js';
import { isSaved, toggleSaved } from '../lib/watchlist.js';
import {
  getMovieDetails, getWatchProviders, posterUrl, genreNames,
} from '../lib/tmdb.js';
import * as haptics from '../lib/haptics.js';

/**
 * MovieSheet — the "About this movie" X-Ray for the trailer currently on
 * screen: poster + title, Save/Share, a ticket search when the roulette is
 * tuned to a real theater, a fact sheet built from TMDB credits and
 * keywords, and where to stream/rent/buy it.
 *
 * Liquid-glass bottom sheet — same material and mount/exit contract as
 * TheaterSheet. Accessibility rides on useOverlay (src/features/overlay.js),
 * the same hook the six fun modes and FunSheet use: dialog role, focus into
 * the panel on open, Tab trapped inside it, Escape to close. It wraps
 * useDismissAnimation internally, so `close()` still plays the shared
 * .fun-backdrop/.fun-sheet exit before the parent's onClose fires.
 *
 * Two independent fetches run only while the sheet is open: movie details
 * (credits + keywords, feeding buildFacts) and watch providers. Each is
 * request-scoped to the open movie — closing the sheet or switching movies
 * cancels the previous fetch's effect on state via the usual `cancelled`
 * flag, and neither ever sets state after unmount.
 */

// Ticket affiliate / partner id. PASTE THE ID HERE the moment a ticketing
// affiliate programme (Fandango, Atom, or similar) is signed up for — the
// search link below appends it automatically once this is non-empty, so
// wiring it in later is this one line and nothing else.
export const TICKET_AFFILIATE_ID = '';

const TICKET_SEARCH_BASE = 'https://www.fandango.com/search';

function buildTicketSearchUrl(title) {
  const params = new URLSearchParams({ q: title || '' });
  if (TICKET_AFFILIATE_ID) params.set('aid', TICKET_AFFILIATE_ID);
  return `${TICKET_SEARCH_BASE}?${params.toString()}`;
}

// buildFacts() kinds, grouped in a fixed, sensible reading order: what it is
// and when, who made it, how, how it landed, then trivia last as a bonus. A
// kind outside this known set still renders — grouped under its own raw kind
// string — so an unexpected value from the data layer never silently drops
// content.
const FACT_KIND_LABELS = {
  release: 'Release',
  credit: 'Cast & Crew',
  production: 'Production',
  reception: 'Reception',
  trivia: 'Trivia',
};
const FACT_KIND_ORDER = ['release', 'credit', 'production', 'reception', 'trivia'];

function groupFacts(facts) {
  const byKind = new Map();
  for (const fact of facts) {
    const list = byKind.get(fact.kind) || [];
    list.push(fact);
    byKind.set(fact.kind, list);
  }
  const known = FACT_KIND_ORDER.filter((k) => byKind.has(k));
  const rest = [...byKind.keys()].filter((k) => !FACT_KIND_ORDER.includes(k));
  return [...known, ...rest].map((kind) => ({
    kind,
    heading: FACT_KIND_LABELS[kind] || kind,
    items: byKind.get(kind),
  }));
}

/** Placeholder shape for the loading skeleton — two groups of three rows. */
const FACT_SKELETON_GROUPS = 2;
const FACT_SKELETON_ROWS = 3;

export default function MovieSheet({
  open, movie, source, onClose,
}) {
  const { mounted, closing, close, dialogProps } = useOverlay({
    open,
    onClose,
    label: movie?.title || 'Movie details',
  });

  const [details, setDetails] = useState({ status: 'loading', data: null });
  const [providers, setProviders] = useState({ status: 'loading', data: null });
  const [saved, setSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const movieId = movie?.id;

  // Movie details -> facts. Its own effect and status so a slow credits
  // lookup never blocks the header, actions, or the watch-providers section.
  useEffect(() => {
    if (!open || !movieId) return undefined;
    let cancelled = false;
    setDetails({ status: 'loading', data: null });
    getMovieDetails(movieId)
      .then((data) => { if (!cancelled) setDetails({ status: 'ready', data }); })
      .catch(() => { if (!cancelled) setDetails({ status: 'error', data: null }); });
    return () => { cancelled = true; };
  }, [open, movieId, reloadToken]);

  // Watch providers. TMDB returns null for "nothing licensed here", which is
  // indistinguishable in the UI from any other reason this bonus section has
  // nothing to show — a network error folds into that same "ready, nothing"
  // state rather than a scary banner for what is not the centrepiece.
  useEffect(() => {
    if (!open || !movieId) return undefined;
    let cancelled = false;
    setProviders({ status: 'loading', data: null });
    getWatchProviders(movieId)
      .then((data) => { if (!cancelled) setProviders({ status: 'ready', data: data || null }); })
      .catch(() => { if (!cancelled) setProviders({ status: 'ready', data: null }); });
    return () => { cancelled = true; };
  }, [open, movieId]);

  useEffect(() => {
    if (!open || !movieId) return undefined;
    let cancelled = false;
    isSaved(movieId)
      .then((v) => { if (!cancelled) setSaved(!!v); })
      .catch(() => { /* leave the last-known state on a failed lookup */ });
    return () => { cancelled = true; };
  }, [open, movieId]);

  // buildFacts is owned by another agent and still being built — never let a
  // shape surprise there crash the whole sheet (or the app: nothing here has
  // its own error boundary).
  const facts = useMemo(() => {
    if (details.status !== 'ready' || !details.data) return [];
    try {
      return buildFacts(details.data) || [];
    } catch (e) {
      console.warn('[MovieSheet] buildFacts failed', e);
      return [];
    }
  }, [details]);
  const factGroups = useMemo(() => groupFacts(facts), [facts]);

  const providersData = providers.data;
  const hasProviders = !!providersData && (
    (providersData.flatrate && providersData.flatrate.length > 0)
    || (providersData.rent && providersData.rent.length > 0)
    || (providersData.buy && providersData.buy.length > 0)
    || !!providersData.link
  );

  const retryDetails = () => setReloadToken((n) => n + 1);

  const onToggleSave = async () => {
    if (!movie || saveBusy) return;
    haptics.medium();
    setSaveBusy(true);
    try {
      const next = await toggleSaved(movie);
      setSaved(!!next);
    } catch {
      /* best-effort; leave the shown state as it was */
    } finally {
      setSaveBusy(false);
    }
  };

  const onShare = async () => {
    if (!movie?.youtubeKey) return;
    haptics.light();
    const url = `https://www.youtube.com/watch?v=${movie.youtubeKey}`;
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title: movie.title,
        text: movie.title,
        url,
        dialogTitle: 'Share trailer',
      });
    } catch {
      /* plugin unavailable on a web build, or the user cancelled — either
         way there is nothing useful to tell them */
    }
  };

  if (!mounted) return null;

  const genres = genreNames(movie?.genre_ids);
  const posterSrc = posterUrl(movie?.poster_path, 'w185');

  return (
    <div className={`fun-backdrop${closing ? ' is-closing' : ''}`} onClick={close}>
      <div
        className={`fun-sheet movie-sheet${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        {...dialogProps}
      >
        <div className="fun-handle" aria-hidden="true" />

        <header className="ms-header">
          {posterSrc && (
            <img className="ms-poster" src={posterSrc} alt="" width="64" height="96" />
          )}
          <div className="ms-header-meta">
            <h2 className="ms-title">
              {movie?.title}
              {movie?.year ? <span className="ms-year"> {movie.year}</span> : null}
            </h2>
            {genres.length > 0 && (
              <div className="ms-badges">
                {genres.map((g) => <span className="ms-badge" key={g}>{g}</span>)}
              </div>
            )}
          </div>
        </header>

        <div className="ms-actions">
          <button
            type="button"
            className={`ms-action${saved ? ' is-active' : ''}`}
            onClick={onToggleSave}
            disabled={saveBusy || !movie}
            aria-pressed={saved}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17l-6-4-6 4V4z" />
            </svg>
            <span>{saved ? 'Saved' : 'Save'}</span>
          </button>
          <button
            type="button"
            className="ms-action"
            onClick={onShare}
            disabled={!movie?.youtubeKey}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
              <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            </svg>
            <span>Share</span>
          </button>
        </div>

        {source && (
          <a
            className="ms-tickets"
            href={buildTicketSearchUrl(movie?.title)}
            target="_blank"
            rel="noreferrer"
            onClick={() => haptics.light()}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
              <line x1="13" y1="6" x2="13" y2="18" strokeDasharray="2.5 2.5" />
            </svg>
            <span>Get tickets</span>
          </a>
        )}

        <div className="ms-scroll">
          {(details.status === 'loading' || details.status === 'error' || factGroups.length > 0) && (
            <section className="ms-section" aria-busy={details.status === 'loading' || undefined}>
              <h3 className="ms-section-title">About this movie</h3>

              {details.status === 'loading' && (
                <div className="ms-facts" aria-hidden="true">
                  {Array.from({ length: FACT_SKELETON_GROUPS }, (_, g) => (
                    <div className="ms-fact-group" key={`fs-${g}`}>
                      <span className="ms-skel ms-skel-group-title" />
                      <div className="ms-fact-list">
                        {Array.from({ length: FACT_SKELETON_ROWS }, (_, i) => (
                          <div className="ms-fact-row" key={`fs-${g}-${i}`}>
                            <span className="ms-skel ms-skel-label" />
                            <span className="ms-skel ms-skel-value" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {details.status === 'error' && (
                <>
                  <p className="ms-error">Couldn&apos;t load details for this movie.</p>
                  <button type="button" className="ms-retry" onClick={retryDetails}>Try again</button>
                </>
              )}

              {details.status === 'ready' && factGroups.length > 0 && (
                <div className="ms-facts">
                  {factGroups.map((group) => (
                    <div className="ms-fact-group" key={group.kind}>
                      <h4 className="ms-fact-group-title">{group.heading}</h4>
                      <dl className="ms-fact-list">
                        {group.items.map((fact) => (
                          <div className="ms-fact-row" key={fact.id}>
                            <dt className="ms-fact-label">{fact.label}</dt>
                            <dd className="ms-fact-value">{fact.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {(providers.status === 'loading' || hasProviders) && (
            <section className="ms-section" aria-busy={providers.status === 'loading' || undefined}>
              <h3 className="ms-section-title">Where to watch</h3>

              {providers.status === 'loading' && (
                <div className="ms-providers" aria-hidden="true">
                  <div className="ms-provider-row">
                    <span className="ms-skel ms-skel-ptag" />
                    <span className="ms-skel ms-skel-pnames" />
                  </div>
                  <div className="ms-provider-row">
                    <span className="ms-skel ms-skel-ptag" />
                    <span className="ms-skel ms-skel-pnames" />
                  </div>
                </div>
              )}

              {providers.status === 'ready' && hasProviders && (
                <div className="ms-providers">
                  {providersData.flatrate?.length > 0 && (
                    <div className="ms-provider-row">
                      <span className="ms-provider-tag">Stream</span>
                      <span className="ms-provider-names">{providersData.flatrate.join(', ')}</span>
                    </div>
                  )}
                  {providersData.rent?.length > 0 && (
                    <div className="ms-provider-row">
                      <span className="ms-provider-tag">Rent</span>
                      <span className="ms-provider-names">{providersData.rent.join(', ')}</span>
                    </div>
                  )}
                  {providersData.buy?.length > 0 && (
                    <div className="ms-provider-row">
                      <span className="ms-provider-tag">Buy</span>
                      <span className="ms-provider-names">{providersData.buy.join(', ')}</span>
                    </div>
                  )}
                  {providersData.link && (
                    <a className="ms-provider-link" href={providersData.link} target="_blank" rel="noreferrer">
                      See all options
                    </a>
                  )}
                  <p className="ms-attribution">
                    Data provided by <a href="https://www.justwatch.com/" target="_blank" rel="noreferrer">JustWatch</a>.
                  </p>
                </div>
              )}
            </section>
          )}
        </div>

        <button type="button" className="fun-close" onClick={close}>Close</button>
      </div>
    </div>
  );
}
