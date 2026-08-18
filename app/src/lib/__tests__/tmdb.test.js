import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pickDiscoverPage, TMDB_MAX_DISCOVER_PAGE, discoverMovies,
  discoverRandomMix, eraStrata, CATALOG_START_YEAR, filtersQuery, catalogDecades,
} from '../tmdb.js';

describe('pickDiscoverPage', () => {
  it('returns page 1 when there is only one page (or fewer)', () => {
    expect(pickDiscoverPage(1)).toBe(1);
    expect(pickDiscoverPage(0)).toBe(1);
    expect(pickDiscoverPage(undefined)).toBe(1);
    expect(pickDiscoverPage(null)).toBe(1);
  });

  it('never returns a page outside [1, totalPages]', () => {
    for (let i = 0; i < 500; i += 1) {
      const page = pickDiscoverPage(37);
      expect(page).toBeGreaterThanOrEqual(1);
      expect(page).toBeLessThanOrEqual(37);
      expect(Number.isInteger(page)).toBe(true);
    }
  });

  it('caps at TMDB 500-page limit even when the catalog reports more', () => {
    for (let i = 0; i < 500; i += 1) {
      const page = pickDiscoverPage(9999);
      expect(page).toBeGreaterThanOrEqual(1);
      expect(page).toBeLessThanOrEqual(TMDB_MAX_DISCOVER_PAGE);
    }
  });

  it('actually draws from deep in the catalog, not just page 1', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) seen.add(pickDiscoverPage(100));
    expect(seen.size).toBeGreaterThan(10);
    expect([...seen].some((p) => p > 1)).toBe(true);
  });

  it('floors non-integer page counts', () => {
    for (let i = 0; i < 100; i += 1) {
      const page = pickDiscoverPage(5.9);
      expect(page).toBeGreaterThanOrEqual(1);
      expect(page).toBeLessThanOrEqual(5);
    }
  });
});

describe('discoverMovies era windows', () => {
  let lastUrl;
  beforeEach(() => {
    lastUrl = null;
    global.fetch = vi.fn(async (url) => {
      lastUrl = url;
      return { ok: true, json: async () => ({ results: [], total_pages: 1 }) };
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const params = () => new URL(lastUrl).searchParams;

  it('defaults to all eras — no lower bound, capped at today (no unreleased films)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await discoverMovies({});
    expect(params().get('primary_release_date.gte')).toBeNull();
    expect(params().get('primary_release_date.lte')).toBe(today);
  });

  it('classic era caps results at 2009', async () => {
    await discoverMovies({ era: 'classic' });
    expect(params().get('primary_release_date.lte')).toBe('2009-12-31');
    expect(params().get('primary_release_date.gte')).toBeNull();
  });

  it('modern era spans 2010 through today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await discoverMovies({ era: 'modern' });
    expect(params().get('primary_release_date.gte')).toBe('2010-01-01');
    expect(params().get('primary_release_date.lte')).toBe(today);
  });

  it('a decade filter bounds both ends regardless of era', async () => {
    await discoverMovies({ era: 'all', decade: '1990' });
    expect(params().get('primary_release_date.gte')).toBe('1990-01-01');
    expect(params().get('primary_release_date.lte')).toBe('1999-12-31');
  });

  it('passes the page param through for deep pagination', async () => {
    await discoverMovies({ page: 7 });
    expect(params().get('page')).toBe('7');
  });
});

describe('eraStrata', () => {
  it('covers the whole catalog with no gaps from the start year to now', () => {
    const now = 2026;
    const bands = eraStrata(now);
    expect(bands[0].lo).toBe(CATALOG_START_YEAR);
    expect(bands[bands.length - 1].hi).toBe(now);
    for (let i = 1; i < bands.length; i += 1) {
      // contiguous: each band starts right after the previous one ends
      expect(bands[i].lo).toBe(bands[i - 1].hi + 1);
    }
  });

  it('relaxes the vote floor for older bands (fewer ratings exist)', () => {
    const bands = eraStrata(2026);
    expect(bands[0].voteFloor).toBeLessThan(bands[bands.length - 1].voteFloor);
  });
});

describe('catalogDecades — the filter sheet decade options', () => {
  it('offers every decade from the catalog start through the current year', () => {
    expect(catalogDecades(2026)).toEqual([1970, 1980, 1990, 2000, 2010, 2020]);
  });

  it('starts at the catalog start year even for a partial current decade', () => {
    expect(catalogDecades(1970)).toEqual([1970]);
    expect(catalogDecades(1975)).toEqual([1970]);
  });
});

describe('discoverRandomMix — era-diverse sampling', () => {
  let calls;
  beforeEach(() => {
    calls = [];
    let id = 0;
    global.fetch = vi.fn(async (url) => {
      calls.push(new URL(url).searchParams);
      const results = [{ id: (id += 1) }, { id: (id += 1) }];
      return { ok: true, json: async () => ({ results, total_pages: 50 }) };
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('queries one random year per era band and pins each to a year (not a date cap)', async () => {
    const bands = eraStrata(2026);
    await discoverRandomMix();
    expect(calls.length).toBe(bands.length);
    calls.forEach((p, i) => {
      expect(p.get('sort_by')).toBe('popularity.desc');
      const year = Number(p.get('primary_release_year'));
      expect(year).toBeGreaterThanOrEqual(bands[i].lo);
      expect(year).toBeLessThanOrEqual(bands[i].hi);
      const page = Number(p.get('page'));
      expect(page).toBeGreaterThanOrEqual(1);
      expect(page).toBeLessThanOrEqual(bands[i].maxPage);
    });
  });

  it('merges all bands and de-dupes by id', async () => {
    const merged = await discoverRandomMix();
    const ids = merged.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(merged.length).toBeGreaterThan(0);
  });

  it('degrades gracefully when a band request fails', async () => {
    let n = 0;
    global.fetch = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error('network');
      return { ok: true, json: async () => ({ results: [{ id: n }], total_pages: 5 }) };
    });
    const merged = await discoverRandomMix();
    // first band threw → still get the other bands, no rejection
    expect(Array.isArray(merged)).toBe(true);
    expect(merged.length).toBeGreaterThan(0);
  });
});

describe('filtersQuery — decade + genre filter params (v3.4.3)', () => {
  it('returns no constraints when nothing is selected', () => {
    expect(filtersQuery({})).toEqual({});
    expect(filtersQuery({ decades: [], genres: [] })).toEqual({});
    expect(filtersQuery({ decades: undefined, genres: undefined })).toEqual({});
  });

  it('maps a single decade to its year range', () => {
    const q = filtersQuery({ decades: [1980] });
    expect(q['primary_release_date.gte']).toBe('1980-01-01');
    expect(q['primary_release_date.lte']).toBe('1989-12-31');
  });

  it('collapses multiple decades to the span between earliest and latest', () => {
    const q = filtersQuery({ decades: [1980, 1990] });
    expect(q['primary_release_date.gte']).toBe('1980-01-01');
    expect(q['primary_release_date.lte']).toBe('1999-12-31');
  });

  it('joins multiple genres into with_genres (OR semantics)', () => {
    const q = filtersQuery({ genres: [28, 35, 18] });
    expect(q.with_genres).toBe('28,35,18');
  });

  it('combines decades and genres into one query', () => {
    const q = filtersQuery({ decades: [1970, 2000], genres: [27] });
    expect(q.with_genres).toBe('27');
    expect(q['primary_release_date.gte']).toBe('1970-01-01');
    expect(q['primary_release_date.lte']).toBe('2009-12-31');
  });

  it('ignores non-numeric genre ids instead of emitting NaN', () => {
    const q = filtersQuery({ genres: [28, 'bogus', 35] });
    expect(q.with_genres).toBe('28,35');
  });
});

describe('discoverMovies filter params (v3.4.3)', () => {
  let lastUrl;
  beforeEach(() => {
    lastUrl = null;
    global.fetch = vi.fn(async (url) => {
      lastUrl = url;
      return { ok: true, json: async () => ({ results: [], total_pages: 1 }) };
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const params = () => new URL(lastUrl).searchParams;

  it('passes genre and decade arrays into the discover URL', async () => {
    await discoverMovies({ genres: [27, 53], decades: [1980] });
    expect(params().get('with_genres')).toBe('27,53');
    expect(params().get('primary_release_date.gte')).toBe('1980-01-01');
    expect(params().get('primary_release_date.lte')).toBe('1989-12-31');
  });

  it('lowers the vote floor when a filter is applied (niche is thinner)', async () => {
    await discoverMovies({ genres: [27], decades: [1970] });
    expect(params().get('vote_count.gte')).toBe('50');
  });

  it('keeps the unfiltered vote floors unchanged', async () => {
    await discoverMovies({});
    expect(params().get('vote_count.gte')).toBe('200');
    await discoverMovies({ era: 'modern' });
    expect(params().get('vote_count.gte')).toBe('100');
  });

  it('prefers an explicit single decade over a decade array', async () => {
    await discoverMovies({ decade: '1990', decades: [1980] });
    expect(params().get('primary_release_date.gte')).toBe('1990-01-01');
    expect(params().get('primary_release_date.lte')).toBe('1999-12-31');
  });

  it('does not apply an era window when a filter decade is set', async () => {
    await discoverMovies({ era: 'classic', decades: [2000, 2010] });
    expect(params().get('primary_release_date.gte')).toBe('2000-01-01');
    expect(params().get('primary_release_date.lte')).toBe('2019-12-31');
  });
});
