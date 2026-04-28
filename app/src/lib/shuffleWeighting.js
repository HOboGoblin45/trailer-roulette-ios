/**
 * Shuffle weighting — biases the trailer queue toward the user's taste profile.
 *
 * Strategy:
 *   - Below READY_THRESHOLD reactions: uniform random (cold start)
 *   - At/above:                        weighted random with a tunable strength
 *
 * Strength interpretation:
 *   - 0.0 = pure uniform
 *   - 0.6 = default (taste-biased but still surprises)
 *   - 1.0 = always pick the highest-affinity available trailer (boring)
 *
 * Implementation: softmax over affinity scores, mixed with a uniform distribution
 * by `strength`. We never zero a candidate's probability — exploration is a
 * feature, not a bug.
 */
import { affinityFor, READY_THRESHOLD } from './tasteProfile.js';

const DEFAULT_STRENGTH = 0.6;

export function weightedShuffle(candidates, profile, strength = DEFAULT_STRENGTH) {
  if (!candidates || candidates.length === 0) return [];
  if (!profile || profile.totalReactions < READY_THRESHOLD) {
    return uniformShuffle(candidates);
  }

  const scored = candidates.map((trailer) => ({
    trailer,
    affinity: affinityFor(trailer, profile),
  }));

  const result = [];
  const pool = [...scored];

  while (pool.length > 0) {
    const idx = pickWeightedIndex(pool, strength);
    result.push(pool[idx].trailer);
    pool.splice(idx, 1);
  }
  return result;
}

function pickWeightedIndex(pool, strength) {
  const max = Math.max(...pool.map((p) => p.affinity));
  const min = Math.min(...pool.map((p) => p.affinity));
  const range = max - min || 1;

  // softmax-ish: exp((affinity - min) / range * 4)
  const expScores = pool.map((p) => Math.exp(((p.affinity - min) / range) * 4));
  const sum = expScores.reduce((a, b) => a + b, 0);
  const weighted = expScores.map((s) => s / sum);

  // Mix with uniform by strength
  const uniform = 1 / pool.length;
  const final = weighted.map((w) => strength * w + (1 - strength) * uniform);

  // Sample
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < final.length; i += 1) {
    acc += final[i];
    if (r <= acc) return i;
  }
  return final.length - 1;
}

export function uniformShuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
