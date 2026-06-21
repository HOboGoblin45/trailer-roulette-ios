import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pickDiscoverPage, TMDB_MAX_DISCOVER_PAGE, discoverMovies } from '../tmdb.js';

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

  it('defaults to all eras — no release-date bound', async () => {
    await discoverMovies({});
    expect(params().get('primary_release_date.lte')).toBeNull();
    expect(params().get('primary_release_date.gte')).toBeNull();
  });

  it('classic era caps results at 2009', async () => {
    await discoverMovies({ era: 'classic' });
    expect(params().get('primary_release_date.lte')).toBe('2009-12-31');
    expect(params().get('primary_release_date.gte')).toBeNull();
  });

  it('modern era starts at 2010', async () => {
    await discoverMovies({ era: 'modern' });
    expect(params().get('primary_release_date.gte')).toBe('2010-01-01');
    expect(params().get('primary_release_date.lte')).toBeNull();
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
