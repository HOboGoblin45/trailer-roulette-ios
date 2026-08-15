---
name: Trailer Roulette code scaffold inventory
description: "HISTORICAL (2026-04-25): what was in the original app/ scaffold. Many components listed here were deleted in the 2026-06-29 two-button pivot."
type: project
---
NOTE 2026-07-13: This is the ORIGINAL scaffold inventory. The 2026-06-29 pivot deleted
SwipeCard/SwipeOverlay, Watchlist, Onboarding, Filters, UpNext, Header, tasteProfile and
the `app/ios-native/` stubs. Kept for archaeology; the live map is in `CLAUDE.md`.

The `app/` folder contains a complete Capacitor + React 18 + Vite 5 scaffold.

**Components (original)**: TrailerRoulette.jsx (main shell), Header.jsx, Player.jsx
(platform router), Player.web.jsx (iframe embed), Player.ios.jsx, SwipeOverlay.jsx,
Watchlist.jsx, Filters.jsx, UpNext.jsx, CastButton.jsx, AboutScreen.jsx.

**Lib**: storage.js (Preferences/localStorage abstraction; KEYS enum), tasteProfile.js
(deleted), shuffleWeighting.js, haptics.js, dialog.js, airplay.js, tmdb.js, youtube.js.

**Native**: `app/ios-native/` AVRoutePlugin stubs (deprecated, deleted) — replaced by the
local Capacitor plugins `app/local-plugins/airplay-plugin/` and `trailer-player/`.

**How to apply**: for the CURRENT file map, use `CLAUDE.md` at the repo root. This file
answers "why does git history mention X" questions.
