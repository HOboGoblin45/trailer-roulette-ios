import { describe, it, expect } from 'vitest';
import {
  emptyProfile,
  bucketsForTrailer,
  affinityFor,
  decay,
  READY_THRESHOLD,
} from '../tasteProfile.js';

describe('emptyProfile', () => {
  it('returns an object with empty bucket maps', () => {
    const p = emptyProfile();
    expect(p.genre).toEqual({});
    expect(p.decade).toEqual({});
    expect(p.runtime).toEqual({});
    expect(p.totalReactions).toBe(0);
    expect(p.updatedAt).toBeNull();
  });
});

describe('bucketsForTrailer', () => {
  it('extracts genre IDs as strings', () => {
    const trailer = { genre_ids: [28, 12], year: 2020, runtime: 100 };
    const buckets = bucketsForTrailer(trailer);
    expect(buckets.genre).toEqual(['28', '12']);
  });

  it('floors year into decade', () => {
    expect(bucketsForTrailer({ year: 1995 }).decade).toBe('1990');
    expect(bucketsForTrailer({ year: 2024 }).decade).toBe('2020');
    expect(bucketsForTrailer({ year: 2000 }).decade).toBe('2000');
    expect(bucketsForTrailer({ year: 1979 }).decade).toBe('1970');
  });

  it('classifies runtime correctly', () => {
    expect(bucketsForTrailer({ runtime: 75 }).runtime).toBe('short');
    expect(bucketsForTrailer({ runtime: 89 }).runtime).toBe('short');
    expect(bucketsForTrailer({ runtime: 90 }).runtime).toBe('standard');
    expect(bucketsForTrailer({ runtime: 119 }).runtime).toBe('standard');
    expect(bucketsForTrailer({ runtime: 120 }).runtime).toBe('long');
    expect(bucketsForTrailer({ runtime: 149 }).runtime).toBe('long');
    expect(bucketsForTrailer({ runtime: 150 }).runtime).toBe('epic');
    expect(bucketsForTrailer({ runtime: 200 }).runtime).toBe('epic');
  });

  it('handles missing fields gracefully', () => {
    const buckets = bucketsForTrailer({});
    expect(buckets.genre).toEqual([]);
    expect(buckets.decade).toBeNull();
    expect(buckets.runtime).toBeNull();
  });

  it('handles missing runtime as null (not "short")', () => {
    const buckets = bucketsForTrailer({ year: 2020, genre_ids: [28] });
    expect(buckets.runtime).toBeNull();
  });
});

describe('affinityFor', () => {
  it('returns 0 for empty profile', () => {
    const trailer = { genre_ids: [28], year: 2020, runtime: 100 };
    expect(affinityFor(trailer, emptyProfile())).toBe(0);
  });

  it('returns positive affinity when buckets have positive scores', () => {
    const profile = emptyProfile();
    profile.genre['28'] = { totalScore: 5, count: 5 };
    const trailer = { genre_ids: [28], year: 2020, runtime: 100 };
    expect(affinityFor(trailer, profile)).toBeGreaterThan(0);
  });

  it('returns negative affinity when buckets have negative scores', () => {
    const profile = emptyProfile();
    profile.genre['27'] = { totalScore: -5, count: 5 };
    const trailer = { genre_ids: [27], year: 2020, runtime: 100 };
    expect(affinityFor(trailer, profile)).toBeLessThan(0);
  });

  it('sums across all buckets', () => {
    const profile = emptyProfile();
    profile.genre['28'] = { totalScore: 5, count: 5 };
    profile.decade['2020'] = { totalScore: 3, count: 3 };
    profile.runtime['standard'] = { totalScore: 2, count: 2 };
    const trailer = { genre_ids: [28], year: 2024, runtime: 100 };
    const score = affinityFor(trailer, profile);
    // tanh(1) + tanh(1) + tanh(1) = ~2.28
    expect(score).toBeGreaterThan(2);
    expect(score).toBeLessThan(3);
  });

  it('clamps individual contributions via tanh', () => {
    const profile = emptyProfile();
    // Extreme score; tanh(100/100) = tanh(1) ≈ 0.76, NOT 100
    profile.genre['28'] = { totalScore: 100, count: 100 };
    const trailer = { genre_ids: [28], year: 2020, runtime: 100 };
    const score = affinityFor(trailer, profile);
    expect(score).toBeLessThan(1); // bounded
  });

  it('handles trailers with multiple genres', () => {
    const profile = emptyProfile();
    profile.genre['28'] = { totalScore: 5, count: 5 };
    profile.genre['12'] = { totalScore: 5, count: 5 };
    const trailer = { genre_ids: [28, 12], year: 2020, runtime: 100 };
    const score = affinityFor(trailer, profile);
    // Each genre contributes tanh(1) ≈ 0.76, total ≈ 1.52
    expect(score).toBeGreaterThan(1.4);
    expect(score).toBeLessThan(1.7);
  });
});

describe('decay', () => {
  it('shrinks scores toward zero by ~0.5%', () => {
    const profile = emptyProfile();
    profile.genre['28'] = { totalScore: 100, count: 10 };
    profile.decade['2020'] = { totalScore: -50, count: 20 };
    decay(profile);
    expect(profile.genre['28'].totalScore).toBeCloseTo(99.5, 1);
    expect(profile.decade['2020'].totalScore).toBeCloseTo(-49.75, 1);
  });

  it('does not change count', () => {
    const profile = emptyProfile();
    profile.genre['28'] = { totalScore: 10, count: 5 };
    decay(profile);
    expect(profile.genre['28'].count).toBe(5);
  });

  it('handles empty profile', () => {
    const profile = emptyProfile();
    expect(() => decay(profile)).not.toThrow();
  });

  it('returns the same profile object (mutation)', () => {
    const profile = emptyProfile();
    profile.genre['28'] = { totalScore: 10, count: 1 };
    const result = decay(profile);
    expect(result).toBe(profile);
  });
});

describe('READY_THRESHOLD', () => {
  it('is exported as a numeric constant', () => {
    expect(typeof READY_THRESHOLD).toBe('number');
    expect(READY_THRESHOLD).toBeGreaterThan(0);
  });
});
