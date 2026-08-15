---
name: trailer-roulette-theater-mode
description: v3.2.0 direction — Theater Mode (indie theaters, monthly Now Showing roulette); Alamo API endpoints, architecture, next adapters
type: project
---

2026-07-13: Charlie pivoted Trailer Roulette toward **independent movie theaters** (friend's suggestion, Alamo Drafthouse the reference). Shipped in v3.2.0 as Theater Mode: pick a theater (location-sorted picker, top-left Theaters pill) → the roulette spins only that theater's live "Now Showing" for the current month; "Everything" restores the classic random channel. Two-button design untouched. Charlie chose: fully built, App Store target (this is the creative differentiator against a 4.2 thin-app rejection), all three coverage tiers eventually (Alamo now, his local theaters + broad indie directory later — his city/local theaters still UNKNOWN, ask when relevant).

Data (verified live 2026-07-13, public JSON, CORS-permissive, no auth):
- Markets: `https://drafthouse.com/s/mother/v1/page/cclamp` → `data.marketSummaries[]` (23 OPEN markets).
- Schedule: `https://drafthouse.com/s/mother/v2/schedule/market/{slug}` → `data.presentations[].show.title`, `data.sessions[].businessDateClt` (month filter), `data.market[0].cinemas[]`. Austin July 2026 = 63 films (The Odyssey next to Rashomon/Lawrence of Arabia — exactly the concept).
- Note: drafthouse.com blocks non-browser UAs (server fetches return empty; browser/WKWebView fetch works). `CapacitorHttp` native fallback in place.

Architecture: `app/src/lib/theaters.js` (directory w/ static-fallback coords, monthly lineup, `cleanFilmTitle` strips programming decorations like "Terror Tuesday:" / "(35mm)" / "50th Anniversary" while preserving real colons, conservative TMDB matching — exact title + year-hint first, unmatched films dropped never faked, 6h cache), `TheaterSheet.jsx` picker, source persisted in storage `KEYS.SOURCE`, theater queues loop/reshuffle when exhausted. Live-verified TMDB match rate 17/17 on real July titles incl. remake disambiguation (Moana 2026 vs 2016). Geolocation = one-shot navigator.geolocation (`NSLocationWhenInUseUsageDescription` added).

Next adapters (per `docs/THEATER-MODE.md`): Eventive, Agile WebSales, Veezi venues — one directory entry + one lineup adapter each. Screenshots/store listing still pre-3.x. Privacy label needs Location (App Functionality, not linked) before next submission.
