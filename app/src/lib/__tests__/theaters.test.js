import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Capacitor (web path — CapacitorHttp never used) and storage (in-memory)
// so theaters.js is testable in the node environment.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  CapacitorHttp: { get: vi.fn() },
}));

const mem = new Map();
vi.mock('../storage.js', () => ({
  get: vi.fn(async (k) => (mem.has(k) ? mem.get(k) : null)),
  set: vi.fn(async (k, v) => { mem.set(k, v); }),
  remove: vi.fn(async (k) => { mem.delete(k); }),
  KEYS: {
    SOURCE: 'src',
    THEATER_DIRECTORY: 'dir',
    THEATER_LINEUP_PREFIX: 'lineup.',
  },
}));

vi.mock('../tmdb.js', () => ({
  searchMovie: vi.fn(async () => []),
  toTrailerCandidate: (m) => ({
    id: m.id, title: m.title || '', overview: m.overview || '',
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    runtime: null, genre_ids: m.genre_ids || [],
    poster_path: m.poster_path || null, backdrop_path: m.backdrop_path || null,
    vote_average: typeof m.vote_average === 'number' ? m.vote_average : null,
    youtubeKey: null,
  }),
}));

import { searchMovie } from '../tmdb.js';
import {
  cleanFilmTitle, getLineup, matchFilmToTmdb, getTheaterQueue,
  getTheaterDirectory, ALAMO_MARKETS, distanceMiles, monthLabel,
} from '../theaters.js';

beforeEach(() => {
  mem.clear();
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe('cleanFilmTitle', () => {
  it('extracts a trailing year into the hint', () => {
    expect(cleanFilmTitle('Moana (2026)')).toEqual({ cleanTitle: 'Moana', yearHint: 2026 });
    expect(cleanFilmTitle('Jaws (1975)')).toEqual({ cleanTitle: 'Jaws', yearHint: 1975 });
  });

  it('strips known programming-series prefixes but keeps real title colons', () => {
    expect(cleanFilmTitle('Terror Tuesday: Deadbeat at Dawn').cleanTitle).toBe('Deadbeat at Dawn');
    expect(cleanFilmTitle('Weird Wednesday: Miami Connection').cleanTitle).toBe('Miami Connection');
    expect(cleanFilmTitle('Mission: Impossible').cleanTitle).toBe('Mission: Impossible');
    expect(cleanFilmTitle('2001: A Space Odyssey').cleanTitle).toBe('2001: A Space Odyssey');
  });

  it('strips presentation decorations', () => {
    expect(cleanFilmTitle('The Goonies Movie Party').cleanTitle).toBe('The Goonies');
    expect(cleanFilmTitle('Jaws — 50th Anniversary').cleanTitle).toBe('Jaws');
    expect(cleanFilmTitle('Halloween (35mm)').cleanTitle).toBe('Halloween');
    expect(cleanFilmTitle('The Room (Movie Party)').cleanTitle).toBe('The Room');
    expect(cleanFilmTitle('Suspiria in 4K').cleanTitle).toBe('Suspiria');
  });

  it('handles year + decoration together', () => {
    const r = cleanFilmTitle('Alien — 45th Anniversary (1979)');
    expect(r.cleanTitle).toBe('Alien');
    expect(r.yearHint).toBe(1979);
  });

  it('never returns junk for empty/odd input', () => {
    expect(cleanFilmTitle('').cleanTitle).toBe('');
    expect(cleanFilmTitle(null).cleanTitle).toBe('');
  });
});

describe('getLineup', () => {
  const NOW = new Date();
  const mk = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`;

  function scheduleFixture() {
    return {
      data: {
        presentations: [
          { slug: 'the-odyssey', isHidden: false, show: { title: 'The Odyssey' } },
          { slug: 'jaws-50', isHidden: false, show: { title: 'Jaws — 50th Anniversary (1975)' } },
          { slug: 'hidden-thing', isHidden: true, show: { title: 'Hidden Thing' } },
          { slug: 'next-month-film', isHidden: false, show: { title: 'Next Month Film' } },
          { slug: 'odyssey-70mm', isHidden: false, show: { title: 'The Odyssey' } }, // dupe title
        ],
        sessions: [
          { presentationSlug: 'the-odyssey', businessDateClt: `${mk}-19`, status: 'ONSALE' },
          { presentationSlug: 'the-odyssey', businessDateClt: `${mk}-20`, status: 'ONSALE' },
          { presentationSlug: 'the-odyssey', businessDateClt: `${mk}-21`, status: 'ONSALE' },
          { presentationSlug: 'jaws-50', businessDateClt: `${mk}-15`, status: 'ONSALE' },
          { presentationSlug: 'hidden-thing', businessDateClt: `${mk}-16`, status: 'ONSALE' },
          { presentationSlug: 'next-month-film', businessDateClt: '2099-01-01', status: 'ONSALE' },
          { presentationSlug: 'odyssey-70mm', businessDateClt: `${mk}-22`, status: 'ONSALE' },
        ],
      },
    };
  }

  it('returns this month\'s films, deduped, sorted by programming weight', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => scheduleFixture() });
    const lineup = await getLineup('austin');
    expect(lineup.map((f) => f.cleanTitle)).toEqual(['The Odyssey', 'Jaws']);
    expect(lineup[0].sessionCount).toBe(3);
    expect(lineup[1].yearHint).toBe(1975);
    // hidden + out-of-month films excluded
    expect(lineup.find((f) => f.cleanTitle === 'Hidden Thing')).toBeUndefined();
    expect(lineup.find((f) => f.cleanTitle === 'Next Month Film')).toBeUndefined();
  });

  it('caches per market+month', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => scheduleFixture() });
    await getLineup('austin');
    await getLineup('austin');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws (never fakes) when the month has no lineup', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { presentations: [], sessions: [] } }) });
    await expect(getLineup('austin')).rejects.toThrow(/lineup/i);
  });
});

describe('matchFilmToTmdb', () => {
  it('prefers an exact title in the hinted year (remake disambiguation)', async () => {
    searchMovie.mockImplementation(async (q, { year } = {}) => {
      if (year === 2026) return [{ id: 2, title: 'Moana', release_date: '2026-07-10', popularity: 50 }];
      return [{ id: 1, title: 'Moana', release_date: '2016-11-23', popularity: 90 }];
    });
    const m = await matchFilmToTmdb({ cleanTitle: 'Moana', yearHint: 2026 });
    expect(m.id).toBe(2);
  });

  it('falls back to an unconstrained search when the year attempt misses', async () => {
    searchMovie.mockImplementation(async (q, { year } = {}) => {
      if (year) return [];
      return [{ id: 7, title: 'Deadbeat at Dawn', release_date: '1988-05-01', popularity: 3 }];
    });
    const m = await matchFilmToTmdb({ cleanTitle: 'Deadbeat at Dawn', yearHint: 1989 });
    expect(m.id).toBe(7);
  });

  it('accepts a containment match when nothing is exact', async () => {
    searchMovie.mockResolvedValue([
      { id: 3, title: 'The Lord of the Rings: The Fellowship of the Ring', popularity: 80 },
    ]);
    const m = await matchFilmToTmdb({ cleanTitle: 'The Fellowship of the Ring', yearHint: null });
    expect(m.id).toBe(3);
  });

  it('returns null (skip, never mismatch) when nothing plausible comes back', async () => {
    searchMovie.mockResolvedValue([{ id: 9, title: 'Completely Unrelated Movie', popularity: 99 }]);
    const m = await matchFilmToTmdb({ cleanTitle: 'Obscure Festival Documentary', yearHint: null });
    expect(m).toBeNull();
  });
});

describe('getTheaterQueue', () => {
  it('builds candidate-shaped entries with theater metadata, dropping unmatched films', async () => {
    const NOW = new Date();
    const mk = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`;
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          presentations: [
            { slug: 'a', isHidden: false, show: { title: 'The Odyssey' } },
            { slug: 'b', isHidden: false, show: { title: 'Totally Unmatchable Event Night' } },
          ],
          sessions: [
            { presentationSlug: 'a', businessDateClt: `${mk}-19`, status: 'ONSALE' },
            { presentationSlug: 'b', businessDateClt: `${mk}-20`, status: 'ONSALE' },
          ],
        },
      }),
    });
    searchMovie.mockImplementation(async (q) =>
      q === 'The Odyssey'
        ? [{ id: 42, title: 'The Odyssey', release_date: '2026-07-17', genre_ids: [12], popularity: 100 }]
        : []);
    const queue = await getTheaterQueue('austin');
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(42);
    expect(queue[0].youtubeKey).toBeNull(); // resolved lazily by the existing pipeline
    expect(queue[0].theater.sessionCount).toBe(1);
  });
});

describe('directory + geo', () => {
  it('falls back to the static market list when the live feed fails', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    const dir = await getTheaterDirectory();
    expect(dir).toHaveLength(ALAMO_MARKETS.length);
    expect(dir[0]).toMatchObject({ venue: 'Alamo Drafthouse' });
    expect(dir.every((t) => t.id.startsWith('alamo:'))).toBe(true);
  });

  it('uses the live market list when available', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          marketSummaries: [
            { slug: 'austin', name: 'Austin', marketStatus: 'OPEN' },
            { slug: 'closed-market', name: 'Closed', marketStatus: 'CLOSED' },
          ],
        },
      }),
    });
    const dir = await getTheaterDirectory();
    expect(dir).toHaveLength(1);
    expect(dir[0].slug).toBe('austin');
    expect(dir[0].lat).toBeCloseTo(30.27, 1); // coords merged from static list
  });

  it('haversine distance is sane (Austin to San Antonio ~74 mi)', () => {
    const d = distanceMiles(30.27, -97.74, 29.42, -98.49);
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThan(90);
  });

  it('monthLabel names the current month', () => {
    expect(monthLabel()).toBe(new Date().toLocaleString('en-US', { month: 'long' }));
  });
});
