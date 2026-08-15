import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory stand-in for the storage layer. `mem` holds already-parsed values,
// exactly like storage.get returns them — including the case where a corrupt
// value comes back as a raw string because JSON.parse failed inside safeParse.
const mem = new Map();
const KEY = 'wl';

vi.mock('../storage.js', () => ({
  get: vi.fn(async (k) => (mem.has(k) ? mem.get(k) : null)),
  set: vi.fn(async (k, v) => { mem.set(k, v); }),
  remove: vi.fn(async (k) => { mem.delete(k); }),
  KEYS: { WATCHLIST: 'wl' },
}));

import * as storage from '../storage.js';
import {
  listWatchlist, isSaved, toggleSaved, removeSaved, MAX_WATCHLIST,
} from '../watchlist.js';

const movie = (id, extra = {}) => ({
  id,
  title: `Movie ${id}`,
  year: 2000 + (id % 25),
  poster_path: `/p${id}.jpg`,
  youtubeKey: `key${id}`,
  ...extra,
});

beforeEach(() => {
  mem.clear();
  vi.clearAllMocks();
});

describe('toggleSaved', () => {
  it('saves on the first tap and unsaves on the second, returning the new state', async () => {
    expect(await toggleSaved(movie(1))).toBe(true);
    expect(await isSaved(1)).toBe(true);
    expect(await toggleSaved(movie(1))).toBe(false);
    expect(await isSaved(1)).toBe(false);
    expect(await listWatchlist()).toEqual([]);
  });

  it('keeps the list newest first', async () => {
    await toggleSaved(movie(1));
    await toggleSaved(movie(2));
    await toggleSaved(movie(3));
    expect((await listWatchlist()).map((m) => m.id)).toEqual([3, 2, 1]);
  });

  it('refuses to save something with no usable id', async () => {
    expect(await toggleSaved(null)).toBe(false);
    expect(await toggleSaved(undefined)).toBe(false);
    expect(await toggleSaved({})).toBe(false);
    expect(await toggleSaved({ title: 'No id' })).toBe(false);
    expect(await toggleSaved('not a movie')).toBe(false);
    expect(await toggleSaved([1, 2])).toBe(false);
    expect(await listWatchlist()).toEqual([]);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('stores only the fields a saved row needs', async () => {
    await toggleSaved(movie(7, {
      overview: 'a long synopsis we do not need',
      backdrop_path: '/b7.jpg',
      genre_ids: [28, 12],
      vote_average: 7.7,
    }));
    const [saved] = await listWatchlist();
    expect(saved).toEqual({
      id: 7,
      title: 'Movie 7',
      year: 2007,
      poster_path: '/p7.jpg',
      youtubeKey: 'key7',
    });
    expect(Object.keys(saved).sort()).toEqual(['id', 'poster_path', 'title', 'year', 'youtubeKey']);
  });

  it('falls back to release_date for the year and nulls out what is missing', async () => {
    await toggleSaved({ id: 8, title: 'Sparse', release_date: '1994-09-23' });
    expect((await listWatchlist())[0]).toEqual({
      id: 8,
      title: 'Sparse',
      year: 1994,
      poster_path: null,
      youtubeKey: null,
    });
  });

  it('leaves the year null when there is no date to read it from', async () => {
    await toggleSaved({ id: 9, title: 'Undated', release_date: '' });
    expect((await listWatchlist())[0].year).toBeNull();
  });
});

describe('isSaved', () => {
  it('is false for an empty list, an unknown id, and junk', async () => {
    expect(await isSaved(1)).toBe(false);
    await toggleSaved(movie(1));
    expect(await isSaved(2)).toBe(false);
    expect(await isSaved(null)).toBe(false);
    expect(await isSaved(undefined)).toBe(false);
    expect(await isSaved('abc')).toBe(false);
  });

  it('matches a numeric id passed as a string (route params arrive that way)', async () => {
    await toggleSaved(movie(42));
    expect(await isSaved('42')).toBe(true);
  });
});

describe('removeSaved', () => {
  it('removes one entry and leaves the rest in order', async () => {
    await toggleSaved(movie(1));
    await toggleSaved(movie(2));
    await toggleSaved(movie(3));
    await removeSaved(2);
    expect((await listWatchlist()).map((m) => m.id)).toEqual([3, 1]);
  });

  it('is a no-op for an unknown id or junk, and does not write', async () => {
    await toggleSaved(movie(1));
    vi.clearAllMocks();
    await removeSaved(999);
    await removeSaved(null);
    await removeSaved('nope');
    expect(storage.set).not.toHaveBeenCalled();
    expect((await listWatchlist()).map((m) => m.id)).toEqual([1]);
  });

  it('resolves without throwing on an empty list', async () => {
    await expect(removeSaved(1)).resolves.toBeUndefined();
  });
});

describe('corrupt or foreign stored values recover to an empty list', () => {
  const junk = [
    ['a truncated JSON string (storage hands back the raw text)', '[{"id":1,'],
    ['a plain string', 'not json at all'],
    ['an object from some older shape', { items: [{ id: 1 }] }],
    ['a number', 42],
    ['a boolean', true],
  ];

  junk.forEach(([label, value]) => {
    it(`recovers from ${label}`, async () => {
      mem.set(KEY, value);
      await expect(listWatchlist()).resolves.toEqual([]);
      await expect(isSaved(1)).resolves.toBe(false);
    });
  });

  it('drops unusable rows but keeps the good ones', async () => {
    mem.set(KEY, [null, { id: 1, title: 'Good' }, 'garbage', { title: 'No id' }, { id: 'x' }, [1]]);
    expect((await listWatchlist()).map((m) => m.id)).toEqual([1]);
  });

  it('rebuilds cleanly on the next write after corruption', async () => {
    mem.set(KEY, 'not json at all');
    expect(await toggleSaved(movie(5))).toBe(true);
    expect((await listWatchlist()).map((m) => m.id)).toEqual([5]);
  });

  it('never throws when the storage layer itself fails', async () => {
    storage.get.mockRejectedValueOnce(new Error('preferences unavailable'));
    await expect(listWatchlist()).resolves.toEqual([]);
    storage.set.mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(toggleSaved(movie(1))).resolves.toBe(true);
  });
});

describe('de-duplication', () => {
  it('does not save the same movie twice — a second toggle unsaves it', async () => {
    expect(await toggleSaved(movie(1))).toBe(true);
    expect(await toggleSaved(movie(1, { title: 'Movie 1 (re-fetched)' }))).toBe(false);
    expect(await listWatchlist()).toEqual([]);
  });

  it('collapses duplicate ids already sitting in storage, keeping the newest', async () => {
    mem.set(KEY, [
      { id: 1, title: 'Newest' },
      { id: 2, title: 'Other' },
      { id: 1, title: 'Stale duplicate' },
    ]);
    const list = await listWatchlist();
    expect(list.map((m) => m.id)).toEqual([1, 2]);
    expect(list[0].title).toBe('Newest');
  });

  it('treats a stored string id as the same movie as its number', async () => {
    mem.set(KEY, [{ id: '1', title: 'Stringly typed' }, { id: 1, title: 'Dupe' }]);
    expect((await listWatchlist()).map((m) => m.id)).toEqual([1]);
    expect(await isSaved(1)).toBe(true);
  });
});

describe('cap', () => {
  it('holds at MAX_WATCHLIST and drops the oldest saves', async () => {
    const overflow = 5;
    for (let i = 1; i <= MAX_WATCHLIST + overflow; i += 1) {
      await toggleSaved(movie(i));
    }
    const list = await listWatchlist();
    expect(list).toHaveLength(MAX_WATCHLIST);
    // newest first, and the first `overflow` saves have fallen off the end
    expect(list[0].id).toBe(MAX_WATCHLIST + overflow);
    expect(list[list.length - 1].id).toBe(overflow + 1);
    expect(await isSaved(1)).toBe(false);
    expect(await isSaved(overflow + 1)).toBe(true);
  });

  it('truncates an oversized list that is already in storage', async () => {
    mem.set(KEY, Array.from({ length: MAX_WATCHLIST + 50 }, (_, i) => movie(i + 1)));
    expect(await listWatchlist()).toHaveLength(MAX_WATCHLIST);
  });

  it('caps at a few hundred, not a few thousand', () => {
    expect(MAX_WATCHLIST).toBeGreaterThanOrEqual(100);
    expect(MAX_WATCHLIST).toBeLessThanOrEqual(1000);
  });
});
