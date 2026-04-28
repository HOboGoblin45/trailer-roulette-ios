# ADR-0003 — v1 feature set

**Date**: 2026-04-25
**Status**: Accepted

## Decision
v1 ships with **Watchlist** and **Seen it / Skip it swipes** as the original features that justify approval under Path C.

## Rationale
- **Watchlist** is the most universally legible "this is a real app" feature. Every reviewer understands "save for later." Easy to demo. Persisted via `@capacitor/preferences` — no backend, no accounts, no Sign In with Apple required.
- **Seen it / Skip it swipes** are the original IP. Left swipe = skip; right swipe = seen it (and queue for rewatch suggestions). Each swipe feeds a local taste profile (genre, decade, runtime affinity). Future shuffle weights toward likely-loved buckets. **This is the part Apple cannot dismiss as a YouTube wrapper — the surfacing logic is ours and runs on-device.**
- Together they create the product loop: shuffle → react → better shuffle. That loop is the differentiator.

## Out of v1 (deferred)
- **Couple's Mode** — strong differentiator but requires either device-pairing UX or accounts. Pulled in if v1 gets rejected and we need to escalate originality.
- **Custom playlists** — nice-to-have on local storage; not core to the value prop. v1.1.
- **Stats screen** — emerges naturally once Seen it/Skip it data accumulates. v1.1.
- **Backend / accounts / cross-device sync** — explicit non-goal. Saves ~3 days of dev and avoids the Sign In with Apple requirement.

## Acceptance criteria for v1

### Watchlist
- [ ] Heart-icon (or equivalent) on the player saves the current trailer to watchlist
- [ ] Watchlist screen shows saved trailers with poster, title, genre/year
- [ ] Tap a saved trailer → opens player on that trailer
- [ ] Long-press or swipe-left to remove
- [ ] Persists across app restarts via `@capacitor/preferences`
- [ ] Empty state with helpful copy

### Seen it / Skip it
- [ ] Swipe-left during/after playback → marks "Skip" → loads next trailer
- [ ] Swipe-right → marks "Seen it" → adds to a Seen list and increments taste signals
- [ ] Visible swipe affordance (subtle UI hint)
- [ ] Haptic feedback on each swipe (`@capacitor/haptics`)
- [ ] Seen list viewable; can be exported (later)

### Taste profile (state)
- [ ] Tracks affinity per genre, decade, runtime bucket
- [ ] Increments on Seen it; decrements on Skip
- [ ] Persists locally via `@capacitor/preferences`
- [ ] Inspectable from Settings (debug toggle for v1; user-facing in v1.1)

### Shuffle weighting
- [ ] Default shuffle = uniform random
- [ ] Once profile has ≥10 signals, shuffle biases toward higher-affinity buckets
- [ ] Configurable strength (default 60% biased / 40% exploration)
- [ ] Verifiable with a debug log (no telemetry leaves device)

### General
- [ ] All features work offline once trailer metadata is loaded
- [ ] No accounts, no login, no sign-up
- [ ] No analytics, no tracking, no third-party SDKs beyond TMDB and Capacitor's bundled ones
