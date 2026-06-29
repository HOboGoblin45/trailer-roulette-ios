# Why Trailer Roulette is original — App Review rebuttal memo

**Purpose**: paste-ready response if Apple rejects under Guideline 4.2 ("Minimum Functionality") or 5.2 ("YouTube wrapper" / IP). Drafted before submission so it isn't written under time pressure.

> **Accuracy note (rewritten 2026-06-28).** This memo now reflects the **shipped app (v2.9.0, immersive swipe-card build)**. The earlier version cited a learned taste profile, a weighted shuffle, and genre/decade/runtime filters — those were **removed** in the v2.5 redesign and are **not in the current binary**. Do **not** claim them in any reviewer reply. Everything below is verifiable in the current build, which matters: a reviewer who asks to see a claimed feature that isn't there will reject harder. Every claim here maps to real, shipping code.

## Short version (for the Resolution Center reply box)

> Trailer Roulette is a movie-discovery product. Trailer playback is a single feature inside a larger original experience: a curation engine that samples across the entire history of cinema, a continuous "channel" playback system that chains trailers seamlessly, a gesture-driven swipe-card discovery interface, a locally-persisted Watchlist, "where to watch" streaming guidance, and one-tap AirPlay to a TV — all running on-device with no account and no tracking. Trailers play only through YouTube's official IFrame embedded player, unmodified. Removing YouTube would not eliminate the product: the curation, channel engine, swipe interface, watchlist, and discovery surfaces are independent original code that runs entirely on the device.

## What's original about Trailer Roulette (all verifiable in the current build)

1. **Era-spanning curation engine.** The feed isn't a flat list — `discoverRandomMix` / `eraStrata` sample a random year from *each* decade band (1970s → present) with per-era vote floors, then shuffle the merged result. A single session deliberately surfaces a 1979 trailer next to a 2024 one. This stratified sampling is original surfacing logic, not a YouTube search box. *(app/src/lib/tmdb.js, shuffleWeighting.js)*
2. **Continuous "channel" playback.** A custom native Capacitor plugin chains trailer→trailer **in place** (it pre-queues the next key via `enqueueNext` and emits `advanced`/`skipped` events), producing a lean-back, TV-channel feel with no dismiss/re-present flash between videos. This orchestration is entirely our code. *(app/local-plugins/trailer-player/)*
3. **Swipe-card discovery interface.** A Tinder-style draggable card with fling physics, rotation, and SAVE/SKIP stamps: drag right to save, left to skip, tap to play. A mobile-native interaction model implemented from scratch. *(app/src/components/SwipeCard.jsx)*
4. **Watchlist with local persistence.** Users build a personal "want to see" library saved on-device via `@capacitor/preferences`. It survives launches, has no backend, and is owned entirely by the user. *(app/src/components/Watchlist.jsx, lib/storage.js)*
5. **"Where to watch."** Per-movie streaming availability (TMDB-sourced, from JustWatch) turns a trailer into an actionable next step — discovery utility well beyond playback. *(app/src/lib/tmdb.js → getWatchProviders)*
6. **One-tap AirPlay.** A native route picker beams the feed to a TV. *(app/local-plugins/airplay-plugin/)*
7. **Resilience engineering.** A self-healing feed (capped exponential-backoff retry), an error boundary that auto-recovers, an on-device error log, look-ahead prefetch for instant skips, and automatic skipping of dead/unplayable trailers. All original code. *(app/src/components/TrailerRoulette.jsx, lib/errorLog.js)*
8. **Instant backdrop + next-card peek.** The stage never goes black: the current movie's backdrop and the *next* card's art are pre-staged so a swipe always reveals something already there. Original UX.
9. **Haptics.** Distinct light/medium/heavy signatures on swipe, save, and skip. Native-only.
10. **Privacy posture.** No accounts, no analytics, no advertising IDs, no third-party tracking. Everything is on-device.

## How trailers actually play (accurate architecture — read before replying to a reviewer)

- Trailers play **only through YouTube's official IFrame embedded player, unmodified.**
- On iOS, that official player is hosted inside a **first-party web page** (our `/embed` page on `trailer-roulette.vercel.app`) loaded in a native web view. **The video streams directly from YouTube to YouTube's own player; we never proxy, cache, download, or touch the video stream.** The page exists for one reason: to present a valid `https` referrer. Without it, a documented WebKit limitation (Bug 169846) strips the referrer and YouTube's embed refuses to load (error 153). Embedding YouTube's official player on a first-party https page is exactly the embed's intended use.
- We use **only the official IFrame Player API's published events** (`onStateChange`) to know when a trailer ends, so we can queue the next one. This is a documented, sanctioned use of YouTube's own API — not an observation or modification of the player internals.
- We do **not**: modify, skin, overlay, or block the player; extract audio; enable background-only playback; strip or skip ads; or repackage trailer URLs as our own scheme. Ads and the link back to YouTube serve exactly as YouTube delivers them.

## What we do not do

- We do **not** host, cache, download, or redistribute YouTube content.
- We do **not** modify, skin, or overlay YouTube's embeddable player.
- We do **not** separate audio from video.
- We do **not** strip, skip, or block ads (the official player handles its own ads).
- We do **not** have user accounts or transmit user data anywhere.
- We do **not** bypass any rate limit or geographic restriction.

## Compliance posture

| Area | Posture |
|------|---------|
| Apple HIG | Tap targets ≥ 44×44pt; safe-area insets respected; native dialogs and haptics; standard navigation |
| Apple Privacy | No data collection; privacy nutrition label = "Data Not Collected"; privacy policy URL provided |
| YouTube ToS | Trailers play exclusively via YouTube's official IFrame embedded player, hosted on a first-party https page in a native web view; only the official API's `onStateChange` events are used. See `research/youtube-tos-embedding.md` |
| TMDB ToS | Required attribution present in the About screen and the App Store description footer |

## Feature inventory (for the rebuttal table)

| Feature | Original to us? | Where it lives |
|---|---|---|
| Era-spanning stratified curation | ✅ | app/src/lib/tmdb.js (eraStrata, discoverRandomMix) |
| Continuous "channel" playback (in-place chaining) | ✅ | app/local-plugins/trailer-player/ |
| Swipe-card discovery (save/skip/tap, fling physics) | ✅ | app/src/components/SwipeCard.jsx |
| Watchlist (local persistence) | ✅ | Watchlist.jsx + lib/storage.js |
| Where to watch (streaming availability) | ✅ (UI/curation) | lib/tmdb.js → getWatchProviders |
| One-tap AirPlay to TV | ✅ | app/local-plugins/airplay-plugin/ |
| Self-healing feed + on-device error log | ✅ | TrailerRoulette.jsx, lib/errorLog.js |
| Haptics | ✅ | lib/haptics.js |
| Trailer playback | ❌ — via YouTube's official IFrame player | first-party /embed page in a native web view |
| Movie metadata | ❌ — via TMDB API | TMDB |

The feature column shows the product is overwhelmingly ours; trailer playback is a single line, served through YouTube's own unmodified player.

## If Apple still rejects (escalation ladder)

Ordered by cost and time. **Send the memo and the Scenario 1 reply in `docs/REJECTION-RESPONSES.md` first.** If a reviewer still insists the app is "primarily a player," the fastest way to deepen the original-IP surface is to ship one of the new mechanics in `docs/NOVELTY-AND-COMPETITIVE-2026-06-28.md`:

1. **Channels / Stations** (curated themed feeds) — visibly original curation IP. ~1–2 weeks.
2. **A game mode** (Guess-the-Decade / Trope Bingo) — original interactive logic; the single most legible answer to a 4.2 "minimum functionality" challenge. ~1–2 weeks.
3. **Year-in-Trailers "Wrapped"** — an on-device retrospective; visibly app-original. ~days.

> Note: the previously-listed "Couple's Mode" is **no longer a strong differentiator** — couples-matching is now common across the category (ReelMatch, Cineswipe, Matched, MatchaFilm, etc.). Prefer the options above.
