/**
 * Watchlist — the "save this one for later" list, persisted through the same
 * storage layer as the rest of the app (Capacitor Preferences on device,
 * localStorage on web).
 *
 * Stored shape is deliberately narrow: just enough to draw a saved row and to
 * reopen the trailer. No overview, no genre ids, no cached artwork — a saved
 * movie should cost a couple hundred bytes, and anything richer is a TMDB
 * lookup away.
 *
 * Reads are total: a corrupt, half-written, or hand-edited value recovers to an
 * empty list rather than throwing into a render.
 */
import * as storage from './storage.js';

/**
 * Upper bound on saved movies. The list lives in a single Preferences value
 * that is read and rewritten whole, so it must not grow without limit. Oldest
 * entries fall off the end.
 */
export const MAX_WATCHLIST = 300;

/** Newest first. Always an array. */
export async function listWatchlist() {
  return readList();
}

export async function isSaved(movieId) {
  const id = normalizeId(movieId);
  if (id == null) return false;
  const list = await readList();
  return list.some((m) => m.id === id);
}

/**
 * Save if absent, unsave if present.
 * @returns {Promise<boolean>} the NEW saved state — true means it is now saved.
 */
export async function toggleSaved(movie) {
  const entry = toEntry(movie);
  if (!entry) return false; // nothing identifiable to save
  const list = await readList();
  const at = list.findIndex((m) => m.id === entry.id);
  if (at >= 0) {
    list.splice(at, 1);
    await writeList(list);
    return false;
  }
  list.unshift(entry);
  await writeList(list);
  return true;
}

export async function removeSaved(movieId) {
  const id = normalizeId(movieId);
  if (id == null) return;
  const list = await readList();
  const next = list.filter((m) => m.id !== id);
  if (next.length !== list.length) await writeList(next);
}

/* ---------------------------------------------------------------- internal - */

async function readList() {
  let raw;
  try {
    raw = await storage.get(storage.KEYS.WATCHLIST);
  } catch {
    return [];
  }
  // storage.get hands back the raw string when JSON.parse fails, so anything
  // that is not an array — null, a truncated string, an object from an older
  // shape — means "no usable watchlist" rather than an error.
  if (!Array.isArray(raw)) return [];
  return sanitize(raw);
}

async function writeList(list) {
  try {
    await storage.set(storage.KEYS.WATCHLIST, sanitize(list));
  } catch {
    // Storage is unavailable (private mode, quota). Losing a save is better
    // than throwing out of a tap handler; the in-memory UI state still matches
    // what the user asked for.
  }
}

/** Drop unusable rows, de-duplicate by id (first wins, i.e. newest), cap. */
function sanitize(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const entry = toEntry(item);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
    if (out.length >= MAX_WATCHLIST) break;
  }
  return out;
}

/** Project any movie-ish object down to exactly the fields a saved row needs. */
function toEntry(movie) {
  if (!movie || typeof movie !== 'object' || Array.isArray(movie)) return null;
  const id = normalizeId(movie.id);
  if (id == null) return null;
  return {
    id,
    title: text(movie.title),
    year: normalizeYear(movie),
    poster_path: text(movie.poster_path) || null,
    youtubeKey: text(movie.youtubeKey) || null,
  };
}

function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/** Prefer the candidate shape's `year`; fall back to a TMDB release_date. */
function normalizeYear(movie) {
  if (typeof movie.year === 'number' && Number.isFinite(movie.year)) return movie.year;
  const fromDate = Number(text(movie.release_date).slice(0, 4));
  return Number.isFinite(fromDate) && fromDate > 0 ? fromDate : null;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}
