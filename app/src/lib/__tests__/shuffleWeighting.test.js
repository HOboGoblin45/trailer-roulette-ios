import { describe, it, expect } from 'vitest';
import { weightedShuffle, uniformShuffle } from '../shuffleWeighting.js';
import { emptyProfile } from '../tasteProfile.js';

describe('uniformShuffle', () => {
  it('returns an array of the same length', () => {
    const input = [1, 2, 3, 4, 5];
    const out = uniformShuffle(input);
    expect(out).toHaveLength(input.length);
  });

  it('contains the same elements as input', () => {
    const input = ['a', 'b', 'c', 'd'];
    const out = uniformShuffle(input);
    expect(out.sort()).toEqual([...input].sort());
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    const copy = [...input];
    uniformShuffle(input);
    expect(input).toEqual(copy);
  });

  it('handles empty array', () => {
    expect(uniformShuffle([])).toEqual([]);
  });

  it('handles single-element array', () => {
    expect(uniformShuffle([42])).toEqual([42]);
  });
});

describe('weightedShuffle', () => {
  const trailers = [
    { id: 1, title: 'Action 2020s', genre_ids: [28], year: 2024, runtime: 120 },
    { id: 2, title: 'Romance 2010s', genre_ids: [10749], year: 2014, runtime: 95 },
    { id: 3, title: 'Horror 2020s', genre_ids: [27], year: 2023, runtime: 85 },
    { id: 4, title: 'Sci-Fi 2010s', genre_ids: [878], year: 2016, runtime: 150 },
    { id: 5, title: 'Action 2010s', genre_ids: [28], year: 2018, runtime: 130 },
  ];

  it('returns empty array on empty input', () => {
    expect(weightedShuffle([], emptyProfile())).toEqual([]);
  });

  it('handles null candidates', () => {
    expect(weightedShuffle(null, emptyProfile())).toEqual([]);
  });

  it('returns same length as input', () => {
    const out = weightedShuffle(trailers, emptyProfile());
    expect(out).toHaveLength(trailers.length);
  });

  it('contains the same trailers as input', () => {
    const out = weightedShuffle(trailers, emptyProfile());
    expect(out.map((t) => t.id).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('uses uniform shuffle when profile is below ready threshold', () => {
    const profile = emptyProfile();
    profile.totalReactions = 5; // below READY_THRESHOLD=10

    // Run many trials; each trailer should appear at the front a roughly
    // uniform fraction of the time (1/5 = 20%).
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const trials = 5000;
    for (let i = 0; i < trials; i += 1) {
      const out = weightedShuffle(trailers, profile);
      counts[out[0].id] += 1;
    }
    // Each should land between ~12% and ~28% of the time (allowing wide
    // variance for randomness; 5000 trials is sufficient).
    Object.values(counts).forEach((c) => {
      const pct = c / trials;
      expect(pct).toBeGreaterThan(0.12);
      expect(pct).toBeLessThan(0.28);
    });
  });

  it('biases toward high-affinity buckets when profile has data', () => {
    const profile = emptyProfile();
    profile.totalReactions = 50;
    // Strong positive signal for action (genre 28) and 2020s decade
    profile.genre['28'] = { totalScore: 40, count: 40 };
    profile.decade['2020'] = { totalScore: 30, count: 30 };

    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const trials = 2000;
    for (let i = 0; i < trials; i += 1) {
      const out = weightedShuffle(trailers, profile, 0.95); // strong bias
      counts[out[0].id] += 1;
    }
    // Trailer 1 (Action 2020s) should win the front position more often
    // than Trailer 2 (Romance 2010s) by a clear margin.
    expect(counts[1]).toBeGreaterThan(counts[2]);
  });

  it('respects strength=0 (pure uniform even with strong profile)', () => {
    const profile = emptyProfile();
    profile.totalReactions = 50;
    profile.genre['28'] = { totalScore: 100, count: 100 };

    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const trials = 5000;
    for (let i = 0; i < trials; i += 1) {
      const out = weightedShuffle(trailers, profile, 0); // pure uniform
      counts[out[0].id] += 1;
    }
    // All trailers should appear roughly equally
    Object.values(counts).forEach((c) => {
      const pct = c / trials;
      expect(pct).toBeGreaterThan(0.12);
      expect(pct).toBeLessThan(0.28);
    });
  });
});
