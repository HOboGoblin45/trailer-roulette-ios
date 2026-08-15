# Theater Mode

Tune the roulette to a real independent theater: pick a venue (by location) and the app spins only what that theater is actually showing this month — its live programme of new releases, repertory classics, and festival picks. This is the app's signature creative feature (and the strongest answer to App Review guideline 4.2 "minimum functionality": no other trailer app is a window into your local art house's calendar).

## How it works

1. **Directory** — `getTheaterDirectory()` in `app/src/lib/theaters.js` returns every supported venue: `{ id, slug, name, region, venue, lat, lon }`. Live-refreshed from the venue's feed, static fallback baked in, 24h cache.
2. **Lineup** — `getLineup(marketSlug, { monthOffset })` returns the month's films: `[{ rawTitle, cleanTitle, yearHint, sessionCount, firstShowDate }]`, sorted by how heavily each film is programmed. 6h cache per market+month.
3. **Matching** — `matchFilmToTmdb(film)` maps a programme title to a TMDB movie. Conservative: exact normalized-title match (year-hinted first for remakes), then a containment match by popularity, else **null — the film is skipped, never mismatched or faked**.
4. **Queue** — `getTheaterQueue(marketSlug)` composes the above into the app's standard trailer-candidate shape. The existing pipeline (lazy `getTrailer` key resolution, prefetch, unplayable blocklist, ad-aware end detection) is reused untouched. Theater queues are finite, so `TrailerRoulette` reshuffles and loops the reel when it runs dry.

Selection persists in storage under `KEYS.SOURCE` (`{ marketSlug, marketName }`, absent = Everything).

## Data source: Alamo Drafthouse (v1)

Verified 2026-07-13 — public JSON, CORS-permissive, no auth:

| What | Endpoint |
| --- | --- |
| Market directory | `GET https://drafthouse.com/s/mother/v1/page/cclamp` → `data.marketSummaries[] { id, slug, name, marketStatus }` |
| Market schedule | `GET https://drafthouse.com/s/mother/v2/schedule/market/{slug}` → `data.presentations[] { slug, show.title, isHidden }`, `data.sessions[] { presentationSlug, businessDateClt, status, isHidden }`, `data.market[0].cinemas[]` |

23 open markets as of 2026-07-13 (Austin ... Yonkers — full list with coordinates in `ALAMO_MARKETS`). Sessions carry `businessDateClt` (`YYYY-MM-DD`), which is what the month filter uses. Fetching is `fetch()` first with a `CapacitorHttp` (native URLSession) fallback on iOS, so a future CORS tightening can't break the app.

### Programme-title cleanup

Alamo titles carry programming decorations. `cleanFilmTitle()` handles:

- `"Moana (2026)"` → title `Moana`, year hint `2026` (disambiguates remakes)
- `"Terror Tuesday: Deadbeat at Dawn"` → strips known series prefixes only — `"Mission: Impossible"` and `"2001: A Space Odyssey"` keep their colons
- `"Jaws — 50th Anniversary"`, `"The Goonies Movie Party"`, `"(35mm)"`, `"in 4K"` etc. → stripped

Series prefixes and decoration patterns live in `SERIES_PREFIXES` / `SUFFIX_DECORATIONS`; extend them when a market invents a new programme name.

## Adding a theater (the adapter contract)

One directory entry + one lineup function:

1. Add the venue to the directory source (or a new static list) with `slug`, `name`, `region`, `venue`, `lat`, `lon`.
2. Write an adapter that returns the same lineup shape `getLineup` produces. Route on the directory entry's `id` prefix (`alamo:` today).
3. Everything downstream (TMDB matching, queue, UI) is already generic.

Platform notes for common indie-ticketing stacks, in rough order of feasibility:

- **Eventive** (many art houses and festivals): per-venue public API buckets — `api.eventive.org` — JSON, needs the venue's event-bucket id from its site source.
- **Agile WebSales / agiletix** (many regional indies): calendar endpoints return JSON-ish feeds per `guid`; inspect the venue's "showtimes" page network tab.
- **Veezi** (small cinemas): public sites usually render server-side; a per-venue HTML scrape or their partner API (needs a key from the cinema).
- Anything else: most indie sites are calendar pages; a per-venue scraper is fine but treat it as fragile and keep the no-fake-data rule — if the feed breaks, the theater errors out rather than showing wrong films.

## Privacy / App Review posture

- "Near me" uses one-shot WKWebView geolocation (`NSLocationWhenInUseUsageDescription` is in `Info.plist`); denial silently falls back to the alphabetical list. Nothing is stored or transmitted.
- Update the Privacy Nutrition Label only if that changes: location is used ephemerally on-device, which under current rules is still declared as "Location — App Functionality, not linked to identity". Check `docs/PRIVACY-NUTRITION-LABEL.md` before the next submission.
- The theater feeds are public endpoints serving the venues' own marketing data (their public showtimes); the app displays factual "what's playing" information with no scraping of gated content. Trailer playback itself is unchanged (YouTube IFrame embeds via the verified proxy).
- No "coming soon" placeholder venues are shown in-app (guideline 2.1 completeness): the picker lists only theaters whose live lineups actually work.
