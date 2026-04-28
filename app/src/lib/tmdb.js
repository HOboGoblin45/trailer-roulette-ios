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

export async function discoverMovies({ genre, decade, page = 1 } = {}) {
  const params = {
    sort_by: 'popularity.desc',
    page,
    include_adult: false,
    'vote_count.gte': 100,
  };
  if (genre) params.with_genres = genre;
  if (decade) {
    params['primary_release_date.gte'] = `${decade}-01-01`;
    params['primary_release_date.lte'] = `${Number(decade) + 9}-12-31`;
  }
  return call('/discover/movie', params);
}

export async function getTrailer(movieId) {
  const data = await call(`/movie/${movieId}/videos`);
  const youtubeVideos = (data.results || []).filter((v) => v.site === 'YouTube');
  // Prefer official Trailer → Teaser → Clip → anything YouTube
  const order = ['Trailer', 'Teaser', 'Clip', 'Featurette', 'Behind the Scenes'];
  for (const t of order) {
    const found = youtubeVideos.find((v) => v.type === t);
    if (found) return found;
  }
  return youtubeVideos[0] || null;
}

export async function getMovieDetails(movieId) {
  return call(`/movie/${movieId}`);
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
