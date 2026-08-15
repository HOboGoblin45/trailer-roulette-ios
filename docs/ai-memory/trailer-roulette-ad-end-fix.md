---
name: trailer-roulette-ad-end-fix
description: History of the trailers-cut-short bug — v3.1.0 spurious ad ENDED (~15s) and v3.2.0 ad-blind 12s watchdog (~13s); mirrored fix locations
type: project
---

Trailer Roulette's "trailers cut short" bug came in two waves, both caused by YouTube pre-roll ads. Ad-detection logic is MIRRORED in three places that must change together: `app/src/lib/endDetection.js` (web), `app/local-plugins/trailer-player/ios/Plugin/TrailerPlayer.swift` (native), `landing-page/api/embed.js` (Vercel proxy).

1. v3.1.0 (2026-07-07, ~15s symptom): ads fire a spurious onStateChange ENDED(0) at the ad boundary → app advanced on the raw event. Fix: progress fast-path + 1.2s resume-confirm (`createEndDetector`).

2. v3.2.0 (2026-07-13, ~13s symptom persisted): real cause was the native **12s watchdog**, which required a PLAYING event — but some ad variants keep the content player UNSTARTED during the ad (no PLAYING ever fires) → live trailers skipped as "unplayable" at 12s + ~1s load. Fix: liveness-based watchdog (dead page 12s / silent player 20s / hard cap 75s) fed by a 1s proxy heartbeat (`{kind:'hb'}`); dual confirm window (5s pre-content, 1.2s after content confirmed); pinned content duration (`{kind:'meta', pin}` from initialDelivery) gates the fast-path against long ads; epoch token (`?e=` on loads, `trLoad(id, e)` on swaps, echoed as `e` in every message) drops stale cross-load messages; web `Player.web.jsx` only reports confirmed content durations and the parent backstop adds 45s ad headroom. Also fixed a pre-existing WKUserContentController handler retain leak (removeScriptMessageHandler in finish()).

**Why:** any future "trailer skips early" report should start from ad-behavior variants (YouTube A/B tests them), and a fix applied to only one mirror will look fixed but regress on another path. Constant ~Ns timing = a fixed timer somewhere; ad-length-dependent timing = detection logic.

**How to apply:** redeploy the Vercel proxy (`cd landing-page; npx vercel --prod`) for heartbeat/pin/epoch to flow; new native builds degrade gracefully against a stale proxy. Detector tests: `endDetection.test.js` (19). Never trust getCurrentTime/getDuration during ads — only pre-playback metadata describes the content. Verified 2026-07-13: 75/75 vitest, eslint clean, vite build green.
