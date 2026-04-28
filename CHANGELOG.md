# Changelog

All notable changes to Trailer Roulette. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Planned (v1.1)
- Couple's Mode (turn-taking on a single device)
- Stats screen visualizing taste profile
- See `docs/V1.1-SPEC.md`

## [1.0.0] — TBD (target 2026-05-30 to 2026-06-20)

Initial public release.

### Added
- **Trailer shuffle** with 90-second cycle timer (a "TV channel" experience)
- **Watchlist** — save trailers locally; persists via `@capacitor/preferences`
- **Seen it / Skip it** swipe gestures during/after playback
- **On-device taste profile** (genre + decade + runtime affinity buckets)
- **Weighted shuffle** that biases the queue toward the user's taste profile after 10+ reactions
- **Filter** chips for genre and decade
- **AirPlay** via custom Capacitor plugin wrapping `AVRoutePickerView`
- **Haptic feedback** on shuffle, skip, swipe
- **Native dialog** wrappers (replacing `alert()` and `confirm()`)
- **Safe-area aware** UI for iPhone notch / Dynamic Island
- **About screen** with TMDB attribution + privacy posture
- Trailer playback via YouTube's official embed inside `SFSafariViewController` (App Store-safe; ToS-compliant)
- Privacy nutrition label: **Data Not Collected**

### Pre-staged but not user-visible
- ESLint flat config + Vitest suite for `shuffleWeighting`, `tasteProfile`, `youtube`
- GitHub Actions CI for lint/test/build (Ubuntu)
- GitHub Actions iOS bootstrap (one-time `cap add ios` runner)
- GitHub Actions iOS release pipeline (build + sign + upload to TestFlight)
- 13-size pre-rendered app icon set with iOS Asset Catalog manifest
- Self-contained landing page deployable to Vercel

### Known limitations
- Auto-advance is timer-based (90s), not detected from YouTube's player. We can't programmatically read player state from `SFSafariViewController` — by design, for compliance.
- AirPlay only works on real devices, not the simulator.
- iPad is supported but landscape-first layout; may receive iPad-specific polish in v1.2.

### Compliance
- Apple App Store Review Guideline 4.2 (Minimum Functionality): addressed via Watchlist + Seen-it/Skip-it + weighted shuffle as native, persistent, gesture-driven features that distinguish the app from a web wrapper. Full memo: `research/why-this-app-is-original.md`.
- Apple App Store Review Guideline 5.2 (Intellectual Property): TMDB metadata used under public API ToS with required attribution; YouTube playback through official embeddable player only; no content extraction.
- YouTube Terms of Service: official player only; no separation/isolation/modification of player components.
