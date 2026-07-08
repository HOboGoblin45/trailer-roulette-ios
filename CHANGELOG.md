# Changelog

All notable changes to Trailer Roulette. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [3.1.0] — 2026-07-07

Playback fix: trailers were cut off after ~15 seconds.

### Fixed
- **Trailers only played for ~15 seconds, then auto-advanced.** YouTube serves
  a pre-roll ad on many trailers, and the IFrame Player fires `onStateChange`
  → `ENDED` (0) when the *ad* finishes — before the real trailer plays. Every
  playback path treated that as "trailer over" and skipped to the next one.
  Now all three paths confirm a real end before advancing: they accept an
  `ENDED` immediately only when playback reached the video's true end
  (`currentTime ≈ duration` on a clip ≥ 32s), otherwise they wait ~1.2s — a
  pre-roll ad boundary resumes playback (state PLAYING/BUFFERING) and cancels
  the pending end, while a genuine end resumes nothing.
  - New `src/lib/endDetection.js` — a pure, unit-tested `createEndDetector`
    (progress fast-path + resume-confirm), with 10 tests covering pre-roll
    ads, ad pods, short teasers, and the no-progress fallback.
  - `Player.web.jsx` routes every state through the detector and now also
    reports each trailer's real duration (so the web backstop timer matches
    the clip instead of the old fixed 90s, which would clip long trailers).
  - `TrailerPlayer.swift` confirms the end natively (works even against an
    un-redeployed proxy), reading optional `t`/`d` progress from the proxy.
  - `landing-page/api/embed.js` tracks `infoDelivery` progress and only
    forwards a real end; backward compatible, so builds already in review get
    the fix once the proxy is redeployed.

### Deploy notes
- Redeploy the Vercel `landing-page` so the embed proxy carries the fix
  (`scripts/06-deploy-vercel.ps1`). The iOS fix does **not** depend on it — the
  native confirm covers a stale proxy — but redeploying makes real ends instant
  and fixes already-shipped TestFlight builds too.

## [3.0.0] — 2026-07-03

### Added
- **Liquid Glass player chrome (iOS 26).** The trailer player header is now
  Apple's Liquid Glass material (`UIGlassEffect`) with specular highlights and
  device-motion response on iOS 26+, and a dark frosted-blur fallback
  (`.systemChromeMaterialDark`) on iOS 15–25. Video plays full-bleed behind
  the translucent header, with a 32pt gradient fade smoothing the edge.

### Changed
- The native player now requests `controls=0`, `iv_load_policy=3`, `fs=0` on the
  embed so the glass chrome owns all controls (no double YouTube UI). The Vercel
  embed proxy forwards these params, with backward-compatible defaults so the
  in-review 2.11.0 build is unaffected.
- **Minimum iOS raised to 15.0** (was 14.0) — required by the Liquid Glass
  chrome and its blur fallback.

### Build
- Requires **Xcode 26 / iOS 26 SDK** to compile `UIGlassEffect` (runtime-guarded
  by `if #available(iOS 26.0, *)`).


## [2.11.0] — 2026-07-02

Liquid Glass redesign + a full-codebase bug-fix pass.

### Added
- **Native mute support** in the trailer player: `openTrailer({ muted })` now
  actually mutes (proxy `?mute=1`), a speaker toggle in the player chrome, and
  a `setMuted` plugin method + `muteChanged` event. Cinema Mode's ambient
  muted channel now works on iOS.
- `onClosed(reason)` player callback — modes react to "modal dismissed"
  without hijacking web pause events.
- Native `advanced` events carry a `cause` (`ended`/`unplayable`/`user`);
  auto-skipped dead video ids are blocklisted for the session.
- Roulette Wheel: "Done watching" control for the inline (web) player.

### Changed
- **UI rebuilt on the Apple 2026 Liquid Glass design language**: one
  translucent glass material (blur + saturation + inner highlight + hairline)
  across all chrome; concentric radii; capsule controls; tinted-glass Play
  hero; glass About sheet with grouped-inset sections; glass fun-modes sheet.
- `styles/index.css` rewritten from scratch — eight generations of layered
  overrides (v1.6→v3.1) and ~600 lines of dead rules removed.
- Fun-modes entry is now a labeled "Modes" capsule (the bare star read as a
  bookmark, not a menu).

### Fixed
- `closeTrailer` left the pending `openTrailer` promise (and a keepAlive'd
  plugin call) hanging forever; external dismissals now resolve via a
  `viewDidDisappear` safety net too.
- Pausing a trailer on web no longer instantly spoils Blind Date's reveal,
  ends a Guess-the-Year round, or kicks the Roulette Wheel to its result.
- Returning from the background no longer mislabels Play as "Spin" and no
  longer skips an unseen trailer on the next press.
- Stale `2.9.0` version fallback in About.

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
