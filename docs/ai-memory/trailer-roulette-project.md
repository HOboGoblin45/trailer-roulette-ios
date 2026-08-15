---
name: Trailer Roulette iOS project
description: iOS app on Capacitor 7. Two-button roulette + 6 fun modes + Theater Mode (v3.2.0). v1.0 (2.11.0) submitted to App Review 2026-07-03, manual release, Apple ID 6764209094. Running chronology of every release and the playback architecture that actually works.
type: project
---
Charlie's iOS port of Trailer Roulette — movie-trailer shuffler. As of v2.0.0 (April 2026) it works end-to-end on his iPhone via TestFlight.

**Project workspace**: `C:\Users\ccres\OneDrive\Documents\Claude\Projects\Trailer Roulette\`
**Repo**: `https://github.com/HOboGoblin45/trailer-roulette-ios` (public)
**Vercel proxy**: `https://trailer-roulette.vercel.app/embed?v=ID` (Edge Function in `landing-page/api/embed.js` — load-bearing for trailer playback)
**Submission cheat sheet**: `docs/SHIP-IT.md`

## The working trailer playback architecture

After 14 versions of speculative fixes, this is what actually works in iOS Capacitor WKWebView for YouTube playback in 2026:

1. App user taps Play → React calls `TrailerPlayer.openTrailer({ youtubeKey })`
2. Local Capacitor plugin (`app/local-plugins/trailer-player/`) opens a fullscreen UIViewController hosting a fresh WKWebView
3. WKWebView does a normal HTTPS navigation (`webView.load(URLRequest)`) to `https://trailer-roulette.vercel.app/embed?v=ID` — NOT loadHTMLString
4. Vercel Edge Function returns HTML with a YouTube iframe embedded statically (server-rendered). YouTube sees Referer=`https://trailer-roulette.vercel.app/` (a real third-party https origin) and accepts the embed
5. Page-level JS catches YT IFrame Player postMessages and forwards them to native via `webkit.messageHandlers.trailerEvent`
6. Plugin's `WKUserContentController` receives events — liveness watchdog (v3.2.0), ad-aware confirmed ends, unplayable on error codes 2/5/100/101/150/152
7. React side records bad youtubeKey in a session Set so unplayable trailers never surface twice

## Why every other approach failed (don't go down these paths again)

- **loadHTMLString with baseURL=youtube.com** → YT rejects as "youtube.com embedding youtube.com", error 152
- **loadHTMLString with baseURL=about:blank** → no Referer, postMessage handshake fragile
- **Direct main-frame load of youtube.com/embed with manual Referer** → WebKit Bug 169846 strips the header
- **Iframe nested inside the main Capacitor WebView** → same Bug 169846
- **SFSafariViewController via @capacitor/browser** → silent fail in scene-based apps (ionic-team/capacitor#5969)
- **@capgo/capacitor-youtube-player** → iOS Swift code is echo stubs
- **Cap-go's "patches @capacitor/ios"** claim → not present in the published package

## Tech stack pinned

- Capacitor 7.6.2; iOS deployment target 15.0 (raised from 14 for Liquid Glass)
- React 18.3, Vite 5.4
- Local Capacitor plugins: `trailer-player` (modal WKWebView player), `airplay-plugin` (route picker)
- Vercel Edge Function embed proxy (deploy: `cd landing-page; npx vercel --prod`)
- GitHub Actions macos runner for iOS build + TestFlight upload (tag push `v*.*.*` → `ios-release.yml`)

## Chronology

### 2026-06-28 — UI redesign to immersive swipe cards (v2.9.0) + code review
Full-bleed swipe-card UI; fixed off-center play glyph, stale watchlist badge. Review: `docs/CODE-REVIEW-2026-06-28.md`. Competitive research found the "Tinder for trailers" category CROWDED (ReelMatch, Cineswipe, FlickFind, many more; couples-mode now table stakes). White space Trailer Roulette can own: lean-back, privacy-first, no-account **ambient trailer channel for the living room (AirPlay), spanning all cinema history**. Defensibility docs resynced to the shipped app.

### 2026-06-29 — MAJOR PIVOT to a pure two-button roulette (v3.0 design)
Charlie reframed: fun personal app, dead simple — random trailers, **two buttons only (Play + AirPlay)**, auto-advancing channel. Deleted SwipeCard/Watchlist/Onboarding/etc. Thin app raises App Review 4.2 risk → add creative features. Same day: built the **fun-modes framework** (`app/src/features/`, FunSheet bottom sheet, one file-pair per mode) with 6 modes: RouletteWheel, BlindDate, GuessYear, TimeMachine, TropeBingo, CinemaMode. NO-EMOJI rule established; letter-monogram tiles instead.

### 2026-06-29 — v2.10.0/2.10.1 shipped to TestFlight
Two-button core + 6 modes. 2.10.1 fixed play-glyph centering (flex column without justify-content) and double-inset clipping (`contentInset: 'never'`, `scrollEnabled: false` — CSS owns safe areas). `scripts/07-release.ps1` fails on PowerShell 5.1 (uses `??`); give pasteable git blocks instead.

### 2026-07-02 — v2.11.0: review pass + Liquid Glass redesign
Fixed: Cinema Mode mute no-op on iOS (native setMuted via IFrame postMessage injected from proxy-page context), closeTrailer leaving the keepAlive'd call hanging (routes through finish()), web pause treated as terminal in game modes (added onClosed(reason)), resume-from-background pretending to play, unplayable ids from in-place skips now blocklisted. index.css rewritten on Apple Liquid Glass tokens; star button → labeled "Modes" pill. Verification recipe for the sandbox established (rsync to /tmp + re-materialize fresh edits + npm install there).

### 2026-07-03 — v1.0 SUBMITTED to App Review (build 2.11.0(60), Waiting for Review, manual release)
Blocker was the missing 13" iPad screenshot (universal build) — built `scripts/capture-ipad-screenshots.mjs` (Playwright at 2048x2732, backdrop-filled frames, one pinned movie per shot), uploaded 6, submitted. Playwright-in-sandbox notes: `apt-get download libxdamage1` + `dpkg-deb -x` + LD_LIBRARY_PATH (no root needed).

### 2026-07-03 — v3.0.0 prepared: Liquid Glass player chrome (native-only integration)
iOS 26 `UIGlassEffect` header over full-bleed video (blur fallback 15–25). Dispatch-folder web overlay was API-incompatible + used emojis → skipped. Deployment target 14→15. Proxy forwards `controls`/`iv_load_policy`/`fs` with back-compat defaults.

### 2026-07-07 — v3.1.0: fix "trailers only play ~15s" (ad-aware end detection)
Root cause: YouTube pre-roll ads fire onStateChange ENDED(0) when the AD ends. Fix: `createEndDetector` (progress fast-path: currentTime≈duration on clip ≥32s; else 1.2s resume-confirm), mirrored in Player.web.jsx, TrailerPlayer.swift, embed.js. Web also got dead-video parity + real-duration reporting. Committed/tagged v3.1.0 (d29f1ae). Also presented 6 app-icon concepts — Charlie hasn't picked.

### 2026-07-13 — v3.2.0: the ~13s fix + THEATER MODE (in working tree, NOT yet committed)
Charlie reported trailers STILL stopping at ~13s, and pivoted the product toward independent movie theaters (friend's suggestion; Alamo Drafthouse the model). Both delivered:

**Fix (B2 in docs/bugs.md):** the ad-blind native 12s watchdog was skipping live trailers as "unplayable" during silent pre-roll ads (content player stays UNSTARTED → no PLAYING within 12s). Now: liveness watchdog (dead page 12s / silent player 20s / 75s hard cap) fed by a 1s proxy heartbeat; dual confirm window (5s pre-content / 1.2s after); pinned content duration gating the fast-path; epoch tokens dropping stale cross-load messages; web duration-poisoning fixed (+45s backstop ad headroom); WKUserContentController retain leak fixed. All three mirrors updated together. See [[trailer-roulette-ad-end-fix]].

**Theater Mode:** Theaters pill (top-left) → glass picker (search + one-shot "Near me") → roulette spins only that theater's live monthly Now Showing with a "Now Showing · Market · Month" badge; Everything restores the classic channel; selection persists. Data: Alamo's public JSON (23 markets; schedule per market; verified CORS-open). `theaters.js`: title cleanup (series prefixes, anniversary/format decorations, year hints), conservative TMDB matching (17/17 live match rate incl. Moana 2026 vs 2016), 6h caches, no fake data ever. See [[trailer-roulette-theater-mode]] + `docs/THEATER-MODE.md`.

**Verified:** 75/75 vitest, eslint clean, vite build green, Swift adversarially reviewed (0 blockers; review's 2 risks fixed). **To ship:** commit + tag v3.2.0 + push (PS 5.1 block), redeploy Vercel proxy, watch ios-release.yml, verify on device. Hardwired context added: `CLAUDE.md`, `docs/PROJECT-PROMPT.md`, `docs/ai-memory/`.

## How to apply this memory

- Trailer playback issues → DO NOT speculate. Architecture above is proven. Debug path: `scripts/test-vercel-direct.mjs` (headless WebKit vs live proxy) → plugin code → WKWebView config. Ad-related skips → [[trailer-roulette-ad-end-fix]] first.
- New features → add via React; the player layer is settled; fun modes are one file-pair + a registry line.
- App Store rejections → `docs/REJECTION-RESPONSES.md`; 4.2 thin-app is the standing risk and Theater Mode is the counter.
- Sandbox verification → /tmp copy + re-materialize fresh edits (OneDrive mount staleness) + npm install there; CI is the real gate.
