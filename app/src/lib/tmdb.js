/**
 * TMDB API wrapper — minimal surface for the iOS port.
 *
 * The API key is intentionally read from import.meta.env at build time so it can
 * differ per environment. For App Store compliance we attribute TMDB in About.
 *
 * If your existing web app already has a more sophisticated TMDB module, replace
 * this file with that module — the rest of the app only depends on the shape
 * of the trailer object documented at the bottom of this file.
 */
const API_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY || '';

if (!API_KEY) {
  console.warn(
    '[tmdb] VITE_TMDB_API_KEY is not set. Configure it in .env.local before running.',
  );
}

async function call(path, params = {}) {
  const url = new URL(API_BASE + path);
  url.searchParams.set('api_key', API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`TMDB ${r.status}: ${r.statusText}`);
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
  const trailer = (data.results || []).find(
    (v) => v.site === 'YouTube' && v.type === 'Trailer',
  );
  return trailer || null;
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
