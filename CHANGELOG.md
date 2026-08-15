# Changelog

All notable changes to Trailer Roulette. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [3.3.1] — 2026-08-14

Fixes the bug 3.2.1 introduced: trailers stopped advancing at all.

### Fixed
- **Every trailer stalled on YouTube's replay screen at its end.** 3.2.1 made
  the native player require a pinned content duration before it would confirm a
  trailer or fast-path its end. That pin only arrives from the 3.2.1+ proxy —
  and the deployed proxy is still 3.1.0, so on real devices the answer was
  permanently "not confirmed". Every trailer therefore took the full 5s
  pre-content window at its end, and YouTube fills those five seconds with its
  own replay button, which is what users were tapping. The app looked like it
  needed a manual press for every single video.
  This is the same mistake 3.2.1 was written to fix, made in the other
  direction: shipping logic that depends on a deploy that has not happened.
  Refusing to decide is not the safe option when the cost of not deciding is
  the app visibly stalling on every trailer.
  There is now an unpinned fallback in all three mirrors, with a much higher
  bar than the one 3.2.1 removed: 65 seconds rather than 32. A clip whose own
  duration runs past a minute is not pre-roll — YouTube's inventory is 6s
  bumpers through 30s spots, and the long skippable ones get skipped at 5s. The
  45s ad that 3.2.1 was protecting against still fails this test and still gets
  the conservative window. Both halves are asserted by tests, and the native
  half was compiled and run.
- **The first-run hint could permanently block autoplay.** Dismissing it was
  the only path that armed autoplay on a first launch, so a hint that failed to
  render its close control would leave the app sitting there forever. It now
  gives up after 15 seconds. A hint that goes wrong should degrade to "no
  hint", never to "no playback".

### Note on the proxy
With this release the Vercel proxy redeploy is an enhancement rather than a
requirement — the app is correct against the 3.1.0 proxy that is live today.
Deploying still improves the liveness watchdog and lets the pin do its more
precise job.

## [3.3.0] — 2026-08-14

The app now starts playing on its own, and a trailer you like is no longer a
dead end. Deliberately a zero-Swift release: everything here is JavaScript, so
nothing shipped that could not be verified before it left the machine.

### Added
- **Autoplay on launch.** The app opens straight into the full-screen player
  once the first trailer has a real YouTube key. No tap between launching and
  watching.
  Three properties this had to hold, and does: it waits for an actual key (the
  queue loads before keys are prefetched, so `current` exists for a while
  carrying nothing); it fires exactly once per launch, via a ref that latches
  synchronously before any state update, so a re-render or React StrictMode's
  double-invoke cannot repeat it; and it can never reopen a player the user
  deliberately closed, because the latch is set before a player can exist and
  `cancelAutoplay()` covers the remaining window where someone taps Play before
  the first key lands. It routes through the existing `playSignal` rather than
  adding a second way in, so it cannot collide with the continuous-playback
  reopen path.
  Returning from the background is deliberately NOT symmetric: the app stays
  paused, because the native session is over and auto-resuming would make the
  Play button lie and skip a trailer that was never seen.
- **The mute setting is remembered** across launches, so autoplay never
  surprises you the same way twice. Defaults to unmuted; a silent trailer is
  not a trailer.
- **About this movie** — a new sheet off the now-playing card, built around
  facts drawn strictly from real TMDB fields: director and writers, top-billed
  cast, adaptation source, collection, runtime, rating with a vote floor so a
  10.0 from three votes cannot show up, original language and title, box office
  against budget, credits-scene stingers, tagline and themes.
  Nothing here is generated. Every fact traces to a field; when a field is
  absent the app says nothing rather than guessing. There is a test asserting
  the output can never contain reunion claims, "filmed in" language, or a
  computed profit figure, because none of those are supported by the data.
- **Save and Share.** The watchlist storage key had existed unused since v2.x
  and `@capacitor/share` had been a dependency that nothing imported. Both are
  now real.
- **Where to watch** — streaming, rent and buy availability, with the JustWatch
  attribution TMDB requires for that data.
- **Get tickets** on Theater Mode, where a real showing is known to exist. The
  affiliate id is a single exported constant, so switching from a plain search
  link to an earning one is a one-line change once the programme is signed up
  for.
- **First-run hint.** Autoplay means a new user never sees the home screen, so
  the first launch shows a short overlay naming the two buttons and pointing at
  the Theaters and Modes pills; dismissing it starts playback. Every launch
  after that goes straight to the trailer.

### Changed
- The now-playing card is a real control rather than inert text: button role,
  44pt target, accessible name, and a visible disclosure affordance.
- `getMovieDetails` fetches credits and keywords in the same request instead of
  three round trips. Signature and cache behaviour unchanged.

### Testing
164 vitest (69 new, covering the facts builder and the watchlist against empty
payloads, zero budgets, low vote counts, missing crew, corrupt stored JSON,
dedupe and the size cap), eslint clean, `vite build` green. Test fixtures use an
invented film so no assertion can accidentally state something false about a
real one. `TrailerPlayer.swift` is byte-identical to v3.2.2.

## [3.2.2] — 2026-08-14

A UI audit of the whole app, and a pass on making the native player feel like a
real Apple video player rather than a web view in a modal.

### Changed — the native player
- **The player no longer opens onto a black screen.** It presented onto pure
  black with a bare spinner for the 2-3s the proxy page takes to load, throwing
  away the artwork the user was already looking at. The movie's backdrop now
  sits over the player while it loads and dissolves away the instant anything
  starts playing. It retires on the FIRST playback of any kind, including a
  pre-roll ad — holding it over a running ad would be blocking an ad, which
  YouTube's Developer Policies §III.I.5 forbids. A 6s backstop covers the case
  where an old proxy reports no playback signal at all.
- **Swipe down to dismiss**, with rubber-banding, corner-radius growth and a
  velocity threshold — the single most universal signal that a full-screen
  video player is native. Presentation is now `.overFullScreen` with a
  cross-dissolve, so the drag reveals the roulette stage underneath instead of
  a void, and the player dissolves into the artwork it came from.
- **The chrome auto-hides** after 3s and returns on tap. It can never be both
  hidden and the only way out: the swipe gesture works regardless, and the
  chrome stays pinned while loading or showing an error.
- **A real progress bar**, fed by the `t`/`d` values the proxy heartbeat was
  already sending, animated between samples so it glides. It stays hidden until
  content is confirmed, so an ad's clock never drives it.
- Title cross-fades instead of snapping when chaining trailers; soft haptic on
  advance, light on Skip. Skip is now an SF Symbol matching the mute glyph.

### Fixed — clunky UI across the app
- **Every sheet and panel vanished with no exit animation** — they animated in
  over 340ms and then unmounted on the same frame as the tap, which contradicts
  the stylesheet's own stated rule that "nothing fades without moving". A
  shared `useDismissAnimation` hook now plays a real exit for the fun-mode
  sheet, all six modes, the theater picker and the About screen.
- **Cinema Mode could strand you.** Its error state was dead code — nothing
  ever set it — so a sustained TMDB failure left an infinite "Tuning the
  channel…" spinner, and the close button faded out after 4s idle, leaving no
  visible way out. The error state is now real with a working retry, and the
  close button is permanently exempt from the chrome fade.
- **The crash screen could loop forever.** `ErrorBoundary` auto-reset every
  2.5s with no counter, so a persistent fault cycled crash → black flash →
  crash indefinitely. Recovery is now budgeted (3 attempts / 60s) before
  offering a real dead end with a prefilled report. It is also styled in the
  app's own design language instead of looking like a different, broken app.
- **Reduce Motion was silently defeated app-wide.** A universal `!important`
  rule out-ranked every per-component override, so five of the six modes' tuned
  spinners were clobbered into a flicker. The rule now respects component
  intent via a `motion-safe-exempt` escape hatch and actually stops infinite
  animations.
- **Tapping Play gave no feedback** in an app whose entire UI is two buttons:
  the "Opening…" label was hidden by `display: none`. The stage now shows a
  spinner and caption on the tap frame.
- Removed the duplicate Play control on the main stage (the bottom pill is the
  app's identity). It is kept inside the fun modes, which have no pill and
  would otherwise have no way back into a dismissed player.
- Raw internal errors are no longer shown to users — `NSError` text and TMDB
  failure strings were rendered verbatim. Fixed copy, with a retry action.
- Theater picker: a clear button in search, keyboard dismissal, skeleton rows
  so the sheet stops ballooning mid-interaction, truncation on the subtitle
  line, honest "Near me" state, real swipe-to-dismiss on the grabber, and
  separate no-results and no-data states.
- Tap targets: `.feat-close` (the only exit from all six modes) and the Guess
  the Year slider thumb were both under the 44pt minimum the app itself
  defines. Fixed without changing their visual size.
- Six mode stylesheets converged on the shared radius and spacing tokens (they
  used none), and on the 0.25-0.35s spring motion budget (Cinema Mode ran every
  chrome transition at 480ms `ease`). Dead rules removed.
- Accessibility: focus-visible rings app-wide, `aria-modal` and focus trapping
  on all seven overlays, Escape to close, a valid ARIA structure for the bingo
  grid, and consistent poster alt text.

### Testing
95 vitest, eslint clean, `vite build` green. The native end-detection logic was
re-extracted verbatim and re-run under Linux Swift after the UI changes — all
checks still pass, including a new one asserting the poster backdrop cannot
outlive the first ad frame. `TrailerPlayer.swift` is syntax-checked only; CI is
the compile gate.

## [3.2.1] — 2026-08-14

Trailers were still being cut short. 3.2.0 identified the cause correctly but
its cure had three holes, all the same mistake: relying on `onStateChange` in a
bug whose defining symptom is that `onStateChange` does not fire. 3.2.0 was
never tagged or released, so 3.2.1 is the first release carrying either.

### Fixed
- **The 3.2.0 fix could not reach a single installed app.** The liveness signal
  it added is the `{kind:'hb'}` heartbeat, which only a 3.2.0+ native build
  understands. Every phone in the wild runs 2.11.0 (App Store) or 3.1.0
  (TestFlight), and those cancel their 12s "no PLAYING = unplayable" watchdog on
  exactly one message: a `stateChange:1`. During a silent pre-roll ad the proxy
  sent them nothing they understood, so redeploying it changed nothing — the
  fix needed a new build through App Review to have any effect.
  `landing-page/api/embed.js` now announces live playback as a `stateChange:1`
  (tagged `syn:true`) the moment playback demonstrably advances. That is the
  vocabulary every shipped build already speaks, so **`npx vercel --prod` now
  fixes phones that are already out there**. Having silenced that watchdog the
  proxy takes on its job: if nothing ever plays it emits `{kind:'error'}` at
  75s, so no build can hang on a black screen.
- **A silently-starting ad or trailer produced a false advance.** The
  resume-confirm timer could only be cancelled by a `stateChange` 1/3. When the
  next ad in a pod — or the trailer itself — started without one, nothing
  cancelled it, the page forwarded a false ENDED, and native skipped the trailer
  a few seconds in. Forward playback progress now cancels a pending end in all
  three mirrors. A genuinely ended video cannot: its `currentTime` stops
  advancing, which the new 0.25s progress epsilon tests for.
- **An ad's duration could be pinned as the content's.** The pin accepted any
  duration seen before a PLAYING state — which, for exactly the ad variants at
  issue, is the ad's own duration. A wrong pin is worse than no pin: it makes
  the ad look like the trailer and lets the ad's end fast-path a false advance.
  The proxy now pins only from `initialDelivery` and only before anything has
  played; `Player.web.jsx` additionally requires an untouched playhead and stops
  trying 2.5s after `onReady`.
- **"Long enough to be content" was not a safe test for content.** Confirmation
  and the end fast-path treated an unpinned clip past 32s as the trailer, which
  a 45s unskippable ad satisfies just as well — shortening the confirm window
  below a typical ad-pod gap and unlocking the fast-path at the ad's own end.
  Both now require a pin. Unpinned, a real end is reported via the 5s window
  instead of instantly: later rather than wrong.
- **The native 75s hard cap could dismiss a playing trailer.** It fired on
  elapsed time alone, so an ad variant that never reports PLAYING would have a
  visibly-playing trailer torn down mid-flight. It now also requires playback to
  have been frozen for 20s.

### Testing
- `app/src/lib/__tests__/embedProxy.test.js` (new, 17 tests) renders the real
  Edge Function, lifts its `<script>` out verbatim and runs it against a fake
  DOM, fake YouTube iframe and virtual clock — so the deployed artefact's
  behaviour is asserted, not a re-implementation of it. All 7 of the defects
  above reproduce as failures against the 3.2.0 page.
- 3 new detector tests (22 total); 95 vitest total, eslint clean, `vite build`
  green.
- The native end-detection logic was extracted verbatim and compiled and run on
  a Linux Swift 5.10 toolchain: 6 checks fail on the 3.2.0 logic and all pass on
  3.2.1. The full `TrailerPlayer.swift` is syntax-checked only — UIKit/WebKit
  cannot be typechecked off a Mac, so CI remains the compile gate.

## [3.2.0] — 2026-07-13

Theater Mode, plus the fix for trailers being cut off at ~13 seconds.

### Fixed
- **Trailers stopped and skipped to the next one after about 13 seconds.**
  Root cause: the native player's watchdog treated "no PLAYING event within
  12 seconds" as a dead video. Several YouTube pre-roll ad variants keep the
  *content* player in UNSTARTED while the ad runs — no PLAYING fires until the
  ad finishes — so every trailer whose ad outlasted ~12s was skipped at
  ~13s (12s watchdog + ~1s load). The v3.1.0 ad-end fix was working; the
  watchdog was the remaining ad-blind path.
  - `TrailerPlayer.swift`: the watchdog is now **liveness-based** — it skips
    on a dead page (no proxy messages within 12s), a silent player (page
    alive but YouTube never spoke within 20s), or a 75s hard cap; a live
    page serving a long ad is never mistaken for a dead video. Dead video
    IDs still skip instantly via the error event.
  - `landing-page/api/embed.js`: the proxy now emits a **1s heartbeat**
    (`{kind:'hb', state, t, d, yt, cc}`) so native can tell "alive, ad still
    rolling" from "actually dead", and pins the content's duration from
    `initialDelivery` metadata (`{kind:'meta', pin}`) before any ad plays.
  - **Hardened end detection in all three mirrors** (`endDetection.js`,
    proxy, Swift): the resume-confirm window is 5s until content playback is
    *confirmed* (≥ 3s of observed forward progress on a clip matching the
    pinned duration) then 1.2s, so slow ad-pod gaps can't fake an end; and
    the "reached the end" fast-path now also requires content confirmation +
    pin match, so a ≥ 32s unskippable ad ending at its own duration can't
    either. 9 new unit tests (19 total on the detector).
  - **Web:** the trailer-duration report to the backstop cycle timer could be
    poisoned by an *ad's* duration (first PLAYING sample), hard-advancing at
    ~13s on web too. `Player.web.jsx` now pins the content duration from
    pre-playback metadata, feeds a 1s progress poll into the detector, and
    only reports confirmed content durations; the backstop adds 45s of ad
    headroom (`TrailerRoulette.jsx`) since its countdown ticks through ads.

### Added
- **Theater Mode — tune the roulette to a real independent theater.** A new
  Theaters pill (top-left) opens a picker of Alamo Drafthouse's 23 metro
  markets, searchable and sortable by distance ("Near me", one-shot location,
  never stored). Pick one and the roulette spins ONLY that theater's live
  "Now Showing" for the current month — new releases, repertory classics,
  festival picks — with a "Now Showing · {market} · {month}" badge on every
  card. "Everything" restores the classic all-of-cinema channel. The
  two-button design is untouched.
  - `src/lib/theaters.js` — theater directory (live market feed + static
    fallback with coordinates), monthly lineup fetcher (sessions filtered to
    the calendar month, deduped, sorted by programming weight), programming-
    title cleanup ("Terror Tuesday: X", "(35mm)", "50th Anniversary" → the
    actual film), conservative TMDB matching (exact-title + year-hint first;
    unmatched films are *dropped, never faked*), 6h lineup cache. 17 tests.
  - `src/components/TheaterSheet.jsx` — liquid-glass picker sheet.
  - Queue integration: theater lineups are finite, so the reel reshuffles and
    loops when exhausted (a lobby reel, not an endless feed); the selection
    persists across launches (`SOURCE` storage key).
  - `NSLocationWhenInUseUsageDescription` added for the optional "Near me"
    sort (WKWebView geolocation; no plugin, no data retention).
  - Adding more theaters (Eventive/Agile/Veezi venues) = one directory entry
    + one lineup adapter. See `docs/THEATER-MODE.md`.

### Deploy notes
- **Redeploy the Vercel `landing-page`** (`scripts/06-deploy-vercel.ps1`) so
  the proxy carries the heartbeat + pin. The new native build degrades
  gracefully against a stale proxy (liveness falls back to ready/state
  traffic and the 75s cap), but the heartbeat makes ad handling precise —
  and the redeploy also improves ad handling for already-shipped builds.
- Alamo's schedule API is public and CORS-permissive (verified 2026-07-13);
  the app calls it directly from the device with a native-HTTP fallback. No
  server of ours in the data path, nothing to keep warm.

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
