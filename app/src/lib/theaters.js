/**
 * Theater Mode — independent-theater directories and "Now Showing" lineups.
 *
 * The concept: pick a theater (by location), and the roulette spins ONLY the
 * films that theater is actually showing this month — new releases, repertory
 * classics, festival oddities — instead of the whole history of cinema. Think
 * of it as tuning the trailer channel to your local art house.
 *
 * v1 data source: Alamo Drafthouse (23 metro markets nationwide). Their site
 * is backed by an open JSON API (verified 2026-07-13, CORS-permissive):
 *
 *   Market directory:  GET https://drafthouse.com/s/mother/v1/page/cclamp
 *     -> { data: { marketSummaries: [{ id, slug, name, marketStatus }] } }
 *   Market schedule:   GET https://drafthouse.com/s/mother/v2/schedule/market/{slug}
 *     -> { data: { presentations: [{ slug, show: { title, ... }, isHidden }],
 *                  sessions: [{ presentationSlug, businessDateClt, status, isHidden }],
 *                  market: [{ cinemas: [...] }] } }
 *
 * Films come back as presentation titles ("Moana (2026)", "Terror Tuesday:
 * Deadbeat at Dawn"); we clean the programming decorations off, match against
 * TMDB, and reuse the app's existing trailer pipeline (getTrailer) untouched.
 *
 * Adding more theaters later = one directory entry + one lineup adapter that
 * returns [{ rawTitle, cleanTitle, yearHint, sessionCount, firstShowDate }].
 * See docs/THEATER-MODE.md for the adapter guide (Eventive, Agile, Veezi).
 *
 * No fake data, ever: if a theater's live feed can't be reached, the caller
 * sees the error — we never substitute a generic "now playing" list.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { searchMovie, toTrailerCandidate } from './tmdb.js';
import * as storage from './storage.js';

const ALAMO_BASE = 'https://drafthouse.com/s/mother';
const LINEUP_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — schedules change daily at most
const DIRECTORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Static fallback directory — the 23 open Alamo markets as of 2026-07-13,
 * with approximate metro-center coordinates for the "near me" sort. The live
 * cclamp feed refreshes names/status at runtime; this list only has to be
 * good enough to render the picker when the first fetch fails.
 */
export const ALAMO_MARKETS = [
  { slug: 'austin', name: 'Austin', region: 'TX', lat: 30.27, lon: -97.74 },
  { slug: 'boston', name: 'Boston', region: 'MA', lat: 42.36, lon: -71.06 },
  { slug: 'charlottesville', name: 'Charlottesville', region: 'VA', lat: 38.03, lon: -78.48 },
  { slug: 'chicago', name: 'Chicago', region: 'IL', lat: 41.88, lon: -87.63 },
  { slug: 'corpus-christi', name: 'Corpus Christi', region: 'TX', lat: 27.80, lon: -97.40 },
  { slug: 'dc-metro-area', name: 'DC Metro Area', region: 'DC', lat: 38.91, lon: -77.04 },
  { slug: 'dfw', name: 'Dallas/Fort Worth', region: 'TX', lat: 32.78, lon: -96.80 },
  { slug: 'denver', name: 'Denver Area', region: 'CO', lat: 39.74, lon: -104.99 },
  { slug: 'indianapolis', name: 'Indianapolis', region: 'IN', lat: 39.77, lon: -86.16 },
  { slug: 'laredo', name: 'Laredo', region: 'TX', lat: 27.51, lon: -99.51 },
  { slug: 'los-angeles', name: 'Los Angeles', region: 'CA', lat: 34.05, lon: -118.24 },
  { slug: 'southwest-florida', name: 'Naples, FL', region: 'FL', lat: 26.14, lon: -81.79 },
  { slug: 'nyc', name: 'New York City', region: 'NY', lat: 40.71, lon: -74.01 },
  { slug: 'northern-virginia', name: 'Northern Virginia', region: 'VA', lat: 38.88, lon: -77.30 },
  { slug: 'omaha', name: 'Omaha', region: 'NE', lat: 41.26, lon: -95.94 },
  { slug: 'raleigh', name: 'Raleigh', region: 'NC', lat: 35.78, lon: -78.64 },
  { slug: 'san-antonio', name: 'San Antonio', region: 'TX', lat: 29.42, lon: -98.49 },
  { slug: 'sf', name: 'San Francisco Bay Area', region: 'CA', lat: 37.77, lon: -122.42 },
  { slug: 'springfield', name: 'Springfield, MO', region: 'MO', lat: 37.21, lon: -93.29 },
  { slug: 'st-louis', name: 'St. Louis', region: 'MO', lat: 38.63, lon: -90.20 },
  { slug: 'twin-cities', name: 'Twin Cities', region: 'MN', lat: 44.98, lon: -93.27 },
  { slug: 'winchester', name: 'Winchester, VA', region: 'VA', lat: 39.19, lon: -78.16 },
  { slug: 'yonkers', name: 'Yonkers', region: 'NY', lat: 40.93, lon: -73.90 },
];

/**
 * Fetch JSON, surviving both worlds:
 *  - Browser/WKWebView fetch first (the Alamo API is CORS-permissive today).
 *  - On native, fall back to CapacitorHttp (native URLSession — immune to any
 *    future CORS tightening and to WKWebView fetch quirks).
 */
async function fetchJson(url) {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (r.ok) return await r.json();
    throw new Error(`HTTP ${r.status}`);
  } catch (err) {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url, headers: { Accept: 'application/json' } });
      if (res.status >= 200 && res.status < 300) {
        return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      }
      throw new Error(`HTTP ${res.status} (native)`);
    }
    throw err;
  }
}

async function cachedFetch(cacheKey, ttlMs, fn) {
  try {
    const hit = await storage.get(cacheKey);
    if (hit && hit.t && (Date.now() - hit.t) < ttlMs && hit.v) return hit.v;
  } catch { /* cache is best-effort */ }
  const v = await fn();
  try { await storage.set(cacheKey, { t: Date.now(), v }); } catch { /* noop */ }
  return v;
}

/**
 * The theater directory: every venue the app can tune to.
 * Live-refreshed from Alamo's market feed, coordinates merged from the static
 * list, static fallback if the network is down. Entries:
 *   { id, slug, name, region, venue, lat, lon }
 */
export async function getTheaterDirectory() {
  const staticBySlug = new Map(ALAMO_MARKETS.map((m) => [m.slug, m]));
  const toEntry = (m) => ({
    id: `alamo:${m.slug}`,
    slug: m.slug,
    name: m.name,
    region: m.region || staticBySlug.get(m.slug)?.region || '',
    venue: 'Alamo Drafthouse',
    lat: staticBySlug.get(m.slug)?.lat ?? null,
    lon: staticBySlug.get(m.slug)?.lon ?? null,
  });
  try {
    const data = await cachedFetch(storage.KEYS.THEATER_DIRECTORY, DIRECTORY_CACHE_TTL_MS, async () => {
      const j = await fetchJson(`${ALAMO_BASE}/v1/page/cclamp`);
      const list = (j?.data?.marketSummaries || [])
        .filter((m) => m && m.slug && m.marketStatus === 'OPEN')
        .map((m) => ({ slug: m.slug, name: m.name }));
      if (!list.length) throw new Error('empty market list');
      return list;
    });
    return data.map(toEntry);
  } catch (err) {
    console.warn('[theaters] live directory failed, using static fallback', err);
    return ALAMO_MARKETS.map(toEntry);
  }
}

// --- Title cleanup ----------------------------------------------------------

/** Programming-series prefixes Alamo puts before the actual film title. */
const SERIES_PREFIXES = [
  'terror tuesday', 'weird wednesday', 'video vortex', 'graveyard shift',
  'alamo time capsule', 'time capsule', 'big screen classics', 'champagne cinema',
  'alamo kids camp', 'kids camp', 'afternoon tea', 'cinema club', 'staff picks',
  'sunday brunch', 'only at the alamo', 'fangoria presents', 'alamo drafthouse presents',
];

/** Decorations appended to titles that would sabotage a TMDB search. */
const SUFFIX_DECORATIONS = new RegExp(
  '\\s*(?:[-–—:]\\s*)?(?:' + [
    '\\d+(?:st|nd|rd|th)\\s+anniversary(?:\\s+(?:screening|edition))?',
    'movie party', 'quote-along', 'sing-along', 'watch party',
    'q&a[^)]*', 'with live[^)]*', 'in 35mm', 'in 70mm', 'in 4k', 'in imax',
    '35mm', '70mm', '4k restoration', '4k remaster', 'restoration',
    'extended (?:cut|edition)', "director'?s cut", 'double feature', 'marathon',
    'early access', 'advance screening', 'sneak preview', 'fan event', 'encore',
  ].join('|') + ')\\s*$',
  'i'
);

/**
 * Turn an Alamo presentation title into { cleanTitle, yearHint } that TMDB
 * will actually match. "Moana (2026)" -> { "Moana", 2026 }.
 * "Terror Tuesday: Deadbeat at Dawn" -> { "Deadbeat at Dawn", null }.
 * Real colons survive: "Mission: Impossible" is not a series prefix.
 */
export function cleanFilmTitle(raw) {
  let title = String(raw || '').trim();
  let yearHint = null;

  // Trailing "(1975)" is a year hint, not part of the title.
  const yearMatch = title.match(/\s*\(((?:19|20)\d{2})\)\s*$/);
  if (yearMatch) {
    yearHint = Number(yearMatch[1]);
    title = title.slice(0, yearMatch.index).trim();
  }

  // Known programming-series prefixes (never legit title colons).
  const colonAt = title.indexOf(':');
  if (colonAt > 0) {
    const prefix = title.slice(0, colonAt).trim().toLowerCase();
    if (SERIES_PREFIXES.some((s) => prefix === s || prefix.startsWith(s))) {
      title = title.slice(colonAt + 1).trim();
    }
  }

  // Trailing parenthetical decorations: "(Movie Party)", "(35mm)", "(Q&A ...)".
  title = title.replace(/\s*\(([^)]*)\)\s*$/, (m, inner) =>
    SUFFIX_DECORATIONS.test(inner.trim()) || /^(movie party|q&a.*|35mm|70mm|4k.*|imax)$/i.test(inner.trim()) ? '' : m
  ).trim();

  // Trailing dash/colon decorations: "Jaws — 50th Anniversary".
  for (let i = 0; i < 2; i++) title = title.replace(SUFFIX_DECORATIONS, '').trim();

  return { cleanTitle: title, yearHint };
}

// --- Lineups ----------------------------------------------------------------

export function monthLabel(offset = 0, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return d.toLocaleString('en-US', { month: 'long' });
}

function monthKey(offset = 0, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * A theater's "Now Showing" for one calendar month, straight from the live
 * schedule. Returns films sorted by how heavily they're programmed:
 *   [{ rawTitle, cleanTitle, yearHint, sessionCount, firstShowDate }]
 */
export async function getLineup(marketSlug, { monthOffset = 0 } = {}) {
  const mk = monthKey(monthOffset);
  const cacheKey = `${storage.KEYS.THEATER_LINEUP_PREFIX}${marketSlug}:${mk}`;
  return cachedFetch(cacheKey, LINEUP_CACHE_TTL_MS, async () => {
    const j = await fetchJson(`${ALAMO_BASE}/v2/schedule/market/${encodeURIComponent(marketSlug)}`);
    const d = j?.data || {};
    const sessions = (d.sessions || []).filter((s) =>
      s && !s.isHidden && s.status !== 'CANCELLED' &&
      typeof s.businessDateClt === 'string' && s.businessDateClt.startsWith(mk)
    );
    const perFilm = new Map(); // presentationSlug -> { count, firstDate }
    for (const s of sessions) {
      const cur = perFilm.get(s.presentationSlug) || { count: 0, firstDate: s.businessDateClt };
      cur.count += 1;
      if (s.businessDateClt < cur.firstDate) cur.firstDate = s.businessDateClt;
      perFilm.set(s.presentationSlug, cur);
    }
    const films = [];
    const seenTitles = new Set();
    for (const p of d.presentations || []) {
      if (!p || p.isHidden || !p.show?.title) continue;
      const stat = perFilm.get(p.slug);
      if (!stat) continue; // not showing in this month's window
      const { cleanTitle, yearHint } = cleanFilmTitle(p.show.title);
      if (!cleanTitle) continue;
      const dedupe = `${cleanTitle.toLowerCase()}|${yearHint || ''}`;
      if (seenTitles.has(dedupe)) continue; // same film, multiple presentations (35mm etc.)
      seenTitles.add(dedupe);
      films.push({
        rawTitle: p.show.title,
        cleanTitle,
        yearHint,
        sessionCount: stat.count,
        firstShowDate: stat.firstDate,
      });
    }
    films.sort((a, b) => b.sessionCount - a.sessionCount);
    if (!films.length) throw new Error(`No ${monthLabel(monthOffset)} lineup for ${marketSlug}`);
    return films;
  });
}

// --- TMDB matching ----------------------------------------------------------

function normalizeTitle(s) {
  return String(s).toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match one lineup film to a TMDB movie. Conservative on purpose: an exact
 * normalized-title match wins (year-hinted first), otherwise the most popular
 * candidate whose title contains/is contained by ours. No match -> null —
 * the film is skipped rather than playing the wrong trailer.
 */
export async function matchFilmToTmdb(film) {
  const want = normalizeTitle(film.cleanTitle);
  if (!want) return null;
  const attempts = film.yearHint
    ? [{ year: film.yearHint }, {}] // year first, then unconstrained
    : [{}];
  for (let i = 0; i < attempts.length; i++) {
    const isLastAttempt = i === attempts.length - 1;
    let results;
    try {
      results = await searchMovie(film.cleanTitle, attempts[i]);
    } catch {
      continue;
    }
    const list = (results || []).filter((m) => m && m.title);
    if (!list.length) continue;
    const exact = list.filter((m) => normalizeTitle(m.title) === want);
    if (exact.length) {
      exact.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      // Year hint (when we have one) disambiguates remakes: Moana (2026)
      // must not match Moana (2016).
      if (film.yearHint) {
        const yr = exact.find((m) => (m.release_date || '').startsWith(String(film.yearHint)));
        if (yr) return yr;
        // No exact match in the hinted year: retry unconstrained, but on the
        // final attempt take the best exact TITLE match anyway — programme
        // year labels drift for re-releases; an exact title is still right.
        if (!isLastAttempt) continue;
      }
      return exact[0];
    }
    const loose = list.filter((m) => {
      const got = normalizeTitle(m.title);
      return got.includes(want) || want.includes(got);
    });
    if (loose.length) {
      loose.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      return loose[0];
    }
  }
  return null;
}

/**
 * Resolve a full month lineup into the app's standard trailer-candidate queue
 * (the same shape discover produces — youtubeKey resolves lazily through the
 * existing getTrailer pipeline). Matching runs in small parallel batches to
 * stay friendly to TMDB. Unmatched films are dropped, never faked.
 */
export async function getTheaterQueue(marketSlug, { monthOffset = 0 } = {}) {
  const lineup = await getLineup(marketSlug, { monthOffset });
  const out = [];
  const BATCH = 6;
  for (let i = 0; i < lineup.length; i += BATCH) {
    const batch = lineup.slice(i, i + BATCH);
    const matches = await Promise.all(batch.map((f) => matchFilmToTmdb(f).catch(() => null)));
    for (let k = 0; k < batch.length; k++) {
      const m = matches[k];
      if (!m) continue;
      out.push({
        ...toTrailerCandidate(m),
        theater: {
          rawTitle: batch[k].rawTitle,
          sessionCount: batch[k].sessionCount,
          firstShowDate: batch[k].firstShowDate,
        },
      });
    }
  }
  // De-dupe by TMDB id (two presentations can match one movie).
  const seen = new Set();
  return out.filter((m) => !seen.has(m.id) && seen.add(m.id));
}

// --- Geo --------------------------------------------------------------------

/** Great-circle distance in miles (haversine). */
export function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * One-shot device location (browser/WKWebView geolocation — no plugin, no
 * stored data). Resolves null on denial/timeout instead of throwing so the
 * picker can quietly fall back to the alphabetical list.
 */
export function getLocationOnce({ timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 }
    );
  });
}
