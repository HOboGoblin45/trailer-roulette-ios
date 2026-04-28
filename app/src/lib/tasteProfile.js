/**
 * Taste profile — local affinity buckets for genre, decade, runtime.
 *
 * Each bucket holds a "score" (positive = liked, negative = disliked). Scores
 * decay slowly over many sessions so old reactions don't permanently dominate.
 * Reactions update buckets on the trailer's metadata.
 *
 * Bucketing rules:
 *   - genre:   each TMDB genre id is its own bucket
 *   - decade:  Math.floor(year / 10) * 10  (e.g. 1990, 2000, 2010, 2020)
 *   - runtime: 'short' < 90, 'standard' 90-119, 'long' 120-149, 'epic' 150+
 *
 * Scores are stored as { totalScore, count } so future shuffles can compute
 * a normalized affinity per bucket without losing the original signal density.
 */
import { get, set, KEYS } from './storage.js';

const SEEN_DELTA = 1;
const SKIP_DELTA = -1;
const DECAY = 0.995; // applied per session start; gentle pull toward 0

const BUCKET_TYPES = ['genre', 'decade', 'runtime'];

export async function loadProfile() {
  const profile = await get(KEYS.TASTE_PROFILE);
  return profile || emptyProfile();
}

export async function saveProfile(profile) {
  await set(KEYS.TASTE_PROFILE, profile);
}

export function emptyProfile() {
  return {
    genre: {},
    decade: {},
    runtime: {},
    totalReactions: 0,
    updatedAt: null,
  };
}

export function bucketsForTrailer(trailer) {
  const buckets = { genre: [], decade: null, runtime: null };

  if (Array.isArray(trailer.genre_ids)) {
    buckets.genre = trailer.genre_ids.map(String);
  }
  if (trailer.year) {
    buckets.decade = String(Math.floor(trailer.year / 10) * 10);
  }
  if (typeof trailer.runtime === 'number') {
    if (trailer.runtime < 90) buckets.runtime = 'short';
    else if (trailer.runtime < 120) buckets.runtime = 'standard';
    else if (trailer.runtime < 150) buckets.runtime = 'long';
    else buckets.runtime = 'epic';
  }
  return buckets;
}

function applyDelta(profile, type, key, delta) {
  if (!key) return;
  const slot = profile[type][key] || { totalScore: 0, count: 0 };
  slot.totalScore += delta;
  slot.count += 1;
  profile[type][key] = slot;
}

export async function recordReaction(trailer, reaction /* 'seen' | 'skip' */) {
  const profile = await loadProfile();
  const delta = reaction === 'seen' ? SEEN_DELTA : SKIP_DELTA;
  const buckets = bucketsForTrailer(trailer);

  buckets.genre.forEach((g) => applyDelta(profile, 'genre', g, delta));
  applyDelta(profile, 'decade', buckets.decade, delta);
  applyDelta(profile, 'runtime', buckets.runtime, delta);

  profile.totalReactions += 1;
  profile.updatedAt = new Date().toISOString();
  await saveProfile(profile);
  return profile;
}

export function decay(profile) {
  for (const type of BUCKET_TYPES) {
    for (const key of Object.keys(profile[type] || {})) {
      profile[type][key].totalScore *= DECAY;
    }
  }
  return profile;
}

/**
 * Returns the affinity score for a trailer (sum of normalized bucket scores).
 * Used by `shuffleWeighting.js` to bias the queue.
 */
export function affinityFor(trailer, profile) {
  const buckets = bucketsForTrailer(trailer);
  let score = 0;
  buckets.genre.forEach((g) => {
    score += normalized(profile.genre?.[g]);
  });
  score += normalized(profile.decade?.[buckets.decade]);
  score += normalized(profile.runtime?.[buckets.runtime]);
  return score;
}

function normalized(slot) {
  if (!slot || slot.count === 0) return 0;
  // Keep the score bounded so a few strong signals don't dominate
  return Math.tanh(slot.totalScore / Math.max(1, slot.count));
}

export const READY_THRESHOLD = 10; // shuffle weighting kicks in after this many reactions
