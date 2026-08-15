/**
 * TMDB API wrapper — minimal surface for the iOS port.
 *
 * Auth strategy: prefer v4 Bearer token via Authorization header (the modern
 * TMDB recommendation, and more reliable through Capacitor's native iOS HTTP
 * layer than v3 query-string auth which the WKWebView CORS layer was mangling).
 *
 * Falls back to v3 ?api_key= for local dev where only that's configured.
 */
const API_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY || '';
const BEARER = import.meta.env.VITE_TMDB_BEARER_TOKEN || '';

if (!API_KEY && !BEARER) {
  console.warn('[tmdb] Neither VITE_TMDB_API_KEY nor VITE_TMDB_BEARER_TOKEN is set');
}

// Small in-memory cache for per-movie lookups so re-surfacing a movie or
// re-rendering doesn't re-hit TMDB. Cleared on app restart; no persistence.
const _cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
async function cached(key, fn) {
  const hit = _cache.get(key);
  if (hit && (Date.now() - hit.t) < CACHE_TTL_MS) return hit.v;
  const v = await fn();
  _cache.set(key, { v, t: Date.now() });
  return v;
}

async function call(path, params = {}) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  const headers = { Accept: 'application/json' };
  if (BEARER) {
    headers.Authorization = `Bearer ${BEARER}`;
  } else if (API_KEY) {
    url.searchParams.set('api_key', API_KEY);
  }
  let r;
  try {
    r = await fetch(url.toString(), { headers });
  } catch (e) {
    const err = new Error(`TMDB network error: ${e.message || e}`);
    err.cause = e;
    throw err;
  }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const err = new Error(`TMDB ${r.status} ${r.statusText} @ ${path} :: ${body.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

/**
 * Upper bound for the optional 'classic' era filter (pre-2010). The app's
 * default catalog spans ALL eras of cinema; selecting Classic caps results
 * at this date, while Modern starts at 2010.
 */
export const DEFAULT_ERA_END = '2009-12-31';

export async function discoverMovies({ genre, decade, era = 'all', page = 1 } = {}) {
  // Vote-count floor keeps the queue anchored to recognizable films even as
  // we page deep into the catalog. The default 'all' era spans the entire
  // history of cinema; 'classic' caps at 2009 and 'modern' starts at 2010 for
  // users who want to narrow the window.
  const params = {
    sort_by: 'popularity.desc',
    page,
    include_adult: false,
    'vote_count.gte': era === 'modern' ? 100 : 200,
  };
  const today = new Date().toISOString().slice(0, 10);
  if (genre) params.with_genres = genre;
  if (decade) {
    params['primary_release_date.gte'] = `${decade}-01-01`;
    params['primary_release_date.lte'] = `${Number(decade) + 9}-12-31`;
  } else if (era === 'classic') {
    // Classic: released up to and including 2009.
    params['primary_release_date.lte'] = DEFAULT_ERA_END;
  } else if (era === 'modern') {
    // Modern: 2010 through today. Capping at today excludes unreleased/future
    // titles so the queue isn't dominated by hyped upcoming releases.
    params['primary_release_date.gte'] = '2010-01-01';
    params['primary_release_date.lte'] = today;
  } else {
    // 'all' (default): everything released up to today — the cap keeps the
    // catalog from over-indexing on not-yet-released hype.
    params['primary_release_date.lte'] = today;
  }
  return call('/discover/movie', params);
}

// TMDB's /discover endpoint paginates the full catalog (20 results per page)
// but only exposes the first 500 pages. We pick a random page within the
// known range so the queue keeps drawing fresh movies from deep in the
// catalog instead of replaying page 1's ~20 most-popular titles forever.
export const TMDB_MAX_DISCOVER_PAGE = 500;

export function pickDiscoverPage(totalPages, max = TMDB_MAX_DISCOVER_PAGE) {
  const cap = Math.min(Math.max(1, Math.floor(totalPages || 1)), max);
  if (cap <= 1) return 1;
  return Math.floor(Math.random() * cap) + 1;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * The era bands we sample from. The whole point: `sort_by=popularity.desc`
 * collapses the catalog onto recent blockbusters, so a random *page* is still
 * mostly modern. Instead we sample a random *year* from each band and pull a
 * random page within that year — guaranteeing every batch spans old, mid, and
 * recent cinema rather than over-indexing on the last few years.
 *
 * Vote floors fall off for older bands (fewer ratings exist for old films) but
 * stay high enough to keep titles recognizable. Page ranges are wider for
 * recent years (deeper catalogs) than for sparse early ones.
 */
export const CATALOG_START_YEAR = 1970;

/**
 * One band per decade. Sampling a random year from EACH decade (rather than one
 * year across a huge band) means a single batch spans ~6 different decades with
 * no two movies clumped on the same year — the feed feels random across all of
 * cinema. Vote floors rise for newer decades (more films, more ratings) so older
 * picks stay recognizable without demanding modern vote counts.
 */
export function eraStrata(currentYear = new Date().getFullYear()) {
  return [
    { lo: CATALOG_START_YEAR, hi: 1979, voteFloor: 40, maxPage: 2 },
    { lo: 1980, hi: 1989, voteFloor: 60, maxPage: 3 },
    { lo: 1990, hi: 1999, voteFloor: 90, maxPage: 3 },
    { lo: 2000, hi: 2009, voteFloor: 130, maxPage: 4 },
    { lo: 2010, hi: 2019, voteFloor: 180, maxPage: 5 },
    { lo: 2020, hi: currentYear, voteFloor: 150, maxPage: 5 },
  ];
}

/**
 * Build a genuinely era-diverse batch of candidate movies. Pulls one random
 * year from each era band (in parallel), merges, and de-dupes. A single failed
 * band degrades gracefully — the others still fill the batch. If everything
 * comes back thin, the caller can fall back to plain discoverMovies.
 */
export async function discoverRandomMix({ strata } = {}) {
  const bands = strata || eraStrata();
  const groups = await Promise.all(
    bands.map((s) => {
      const year = randInt(s.lo, s.hi);
      const page = randInt(1, s.maxPage);
      return call('/discover/movie', {
        sort_by: 'popularity.desc',
        page,
        include_adult: false,
        'vote_count.gte': s.voteFloor,
        primary_release_year: year,
      })
        .then((d) => d.results || [])
        .catch(() => []);
    })
  );
  const seen = new Set();
  return [].concat(...groups).filter((m) => m && !seen.has(m.id) && seen.add(m.id));
}

/**
 * Discover popular movies released in a specific year (used by Time Machine and
 * other year-based fun modes). Returns the raw TMDB discover payload.
 */
export async function discoverByYear(year, { page = 1, voteFloor = 50 } = {}) {
  return call('/discover/movie', {
    sort_by: 'popularity.desc',
    page,
    include_adult: false,
    'vote_count.gte': voteFloor,
    primary_release_year: year,
  });
}

/**
 * Title search (used by Theater Mode to match a theater's programme titles to
 * TMDB movies). Optional year pins remakes ("Moana (2026)" vs 2016). Cached.
 */
export async function searchMovie(query, { year, page = 1 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  return cached(`search:${q.toLowerCase()}:${year || ''}:${page}`, async () => {
    const params = { query: q, page, include_adult: false };
    if (year) params.primary_release_year = year;
    const data = await call('/search/movie', params);
    return data.results || [];
  });
}

export async function getTrailer(movieId) {
  return cached(`trailer:${movieId}`, async () => {
    const data = await call(`/movie/${movieId}/videos`);
    const youtubeVideos = (data.results || []).filter((v) => v.site === 'YouTube');
    // Prefer official Trailer → Teaser → Clip → anything YouTube
    const order = ['Trailer', 'Teaser', 'Clip', 'Featurette', 'Behind the Scenes'];
    for (const t of order) {
      const found = youtubeVideos.find((v) => v.type === t);
      if (found) return found;
    }
    return youtubeVideos[0] || null;
  });
}

export async function getMovieDetails(movieId) {
  return cached(`details:${movieId}`, async () => {
    return call(`/movie/${movieId}`);
  });
}

// Full TMDB movie-genre id → name map (used for genre tags on the card).
export const MOVIE_GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

export function genreNames(ids = []) {
  return (ids || []).map((id) => MOVIE_GENRES[id]).filter(Boolean);
}

/**
 * Normalize a raw TMDB movie object into the app's trailer-candidate shape.
 * Used by discover, search, recommendations, and person credits so the
 * queue is uniform regardless of which endpoint produced the movie.
 */
export function toTrailerCandidate(m) {
  return {
    id: m.id,
    title: m.title || m.name || '',
    overview: m.overview || '',
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    runtime: null,
    genre_ids: m.genre_ids || [],
    poster_path: m.poster_path || null,
    backdrop_path: m.backdrop_path || null,
    vote_average: typeof m.vote_average === 'number' ? m.vote_average : null,
    youtubeKey: null,
  };
}

/**
 * Streaming / rent / buy availability for a movie in a region (default US).
 * Data is sourced by TMDB from JustWatch (attribution required in-app).
 * Returns null when no providers are listed for the region.
 */
export async function getWatchProviders(movieId, region = 'US') {
  return cached(`providers:${movieId}:${region}`, async () => {
    const data = await call(`/movie/${movieId}/watch/providers`);
    const r = (data.results && data.results[region]) || null;
    if (!r) return null;
    const names = (list) => (list || []).map((p) => p.provider_name);
    return {
      link: r.link || null,
      flatrate: names(r.flatrate),
      rent: names(r.rent),
      buy: names(r.buy),
    };
  });
}

export function posterUrl(path, size = 'w500') {
  if (!path) return null;
  return `${IMG_BASE}/${size}${path}`;
}

export function backdropUrl(path, size = 'w1280') {
  if (!path) return null;
  return `${IMG_BASE}/${size}${path}`;
}

/**
 * Trailer object shape used throughout the app:
 * {
 *   id: number              // TMDB movie id
 *   title: string
 *   overview: string
 *   year: number
 *   runtime: number | null  // populated lazily on demand
 *   genre_ids: number[]
 *   poster_path: string | null
 *   backdrop_path: string | null
 *   youtubeKey: string      // YouTube video id; built from getTrailer()
 * }
 */
