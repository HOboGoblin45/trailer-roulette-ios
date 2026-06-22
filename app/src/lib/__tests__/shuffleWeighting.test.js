import { describe, it, expect } from 'vitest';
import { uniformShuffle } from '../shuffleWeighting.js';

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

  it('eventually produces a different order (not a no-op)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    let differed = false;
    for (let i = 0; i < 20 && !differed; i += 1) {
      if (uniformShuffle(input).some((v, idx) => v !== input[idx])) differed = true;
    }
    expect(differed).toBe(true);
  });
});
