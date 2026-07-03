# Code review + Liquid Glass redesign — 2026-07-02 (v2.11.0)

Full-project review requested after v2.10.1 felt broken on device. Every file
in `app/src`, both local Capacitor plugins, the Vercel embed proxy, configs,
and CI were read end-to-end. This doc records what was actually wrong, what
was fixed, and what was deliberately left alone.

## Verified healthy before changing anything

- Vercel embed proxy is live and serving the YouTube iframe correctly
  (`https://trailer-roulette.vercel.app/embed?v=...`).
- v2.10.0 and v2.10.1 tags were pushed; both iOS Release workflow runs
  succeeded (TestFlight uploads went out). If the phone still shows the old
  layout, update the build in TestFlight first.
- TMDB auth (bearer token via CI secrets) wired correctly in the release
  workflow, with an empty-key guard.
- The playback architecture (native WKWebView → Vercel proxy → YT IFrame
  events) is untouched. Do not change it; see the project memory for the
  graveyard of approaches that don't work.

## Real bugs found and fixed

1. **Cinema Mode's mute was a no-op on iOS.** `Player.ios.jsx` passed
   `muted` to `TrailerPlayer.openTrailer`, but the Swift plugin never read
   it and built the proxy URL with only `?v=`. The "muted ambient channel"
   played at full volume and the JS mute toggle (hidden under the native
   modal anyway) did nothing.
   *Fix:* Swift reads `muted`, appends `&mute=1` (the proxy already
   supported it), a new `setMuted` plugin method drives the live player via
   the IFrame API command channel, a speaker toggle was added to the native
   chrome, and a `muteChanged` event keeps JS state in sync.

2. **`closeTrailer` never resolved the pending `openTrailer` promise.** The
   plugin dismissed the VC directly, so `onDismiss` never fired: the JS
   `await` hung forever and the keepAlive'd `CAPPluginCall` leaked every
   time the app backgrounded during playback.
   *Fix:* `closeTrailer` routes through `finish(reason:)`; a
   `viewDidDisappear` safety net resolves any dismissal path that skipped
   `finish()`.

3. **Web pause was treated as "done watching" by the game modes.** Blind
   Date revealed the movie the moment you paused (spoiling the game), Guess
   the Year ended the round, Roulette Wheel jumped to the result. The modes
   were using `onPause` to detect the iOS modal closing.
   *Fix:* `Player.ios.jsx` now emits a dedicated `onClosed(reason)`;
   modes bind their terminal transitions to `onClosed` + `onEnded`, and
   `onPause` is non-terminal everywhere. Roulette Wheel gained a "Done
   watching" button for the inline web player (on iOS the native Done
   covers it).

4. **Backgrounding corrupted main-screen state.** On foreground the app set
   `isPlaying=true` with no native session running, so the button lied
   ("Spin") and the next press called `advance()` — skipping a trailer the
   user never saw.
   *Fix:* stay paused on resume; one tap on Play resumes from the same
   trailer.

5. **Dead videos auto-skipped in place were never blocklisted.** Only the
   fallback (modal-closing) path recorded unplayable keys. Native `advanced`
   events now carry `cause: "unplayable"` and the key lands in the session
   blocklist.

6. **About screen version fallback said `2.9.0`** in non-Vite contexts.
   Neutralized to `dev` (real version is injected from package.json).

## Redesign (Apple 2026 — Liquid Glass)

`styles/index.css` was eight design generations deep (v1.6 HIG pass → v2.1
cinematic → v2.2 light theme → v2.3 → v2.5 immersive → v2.6 swipe → v2.8 →
v3.0/3.1), with ~600 lines of dead rules for deleted screens (watchlist,
filters, up-next, tab bar, swipe stamps, onboarding). It was rewritten from
scratch around one material system:

- **Liquid Glass material** — heavy backdrop blur + saturation, 1px inner
  top highlight ("lens" edge), hairline border, soft depth shadow. Exposed
  as tokens (`--glass-*`) and a `.glass` utility; three intensities
  (ultrathin / thin / regular). A `@supports` fallback covers engines
  without `backdrop-filter`.
- **Concentric geometry** — capsule controls, 22–30px sheets, nested radii.
- **SF typography** — tight, heavy display for titles; small uppercase
  tracked captions.
- **Spring feedback** — controls compress (`scale 0.96`) with the standard
  sheet spring curve.
- Play is a tinted-glass hero capsule; AirPlay a quiet glass capsule; the
  fun-modes entry is a **labeled "Modes" pill** (the bare star icon read as
  a bookmark — this was the "where are the features" confusion); About is a
  grouped-inset glass sheet; the FunSheet is a proper glass bottom sheet.
- Feature-mode CSS files consume the same tokens (`--gold` is preserved as
  an alias of `--accent`), so all six modes inherit the new palette without
  churn.

## Verification

Fresh Linux `npm install` + full pipeline in a clean environment:
`vite build` ✓ (74→ modules, clean), `vitest run` ✓ 39/39, `eslint` ✓ 0
problems. (The OneDrive-mounted sandbox serves truncated copies of
freshly-edited files — verification used exact reconstructions; Windows/CI
read the true files.)

## Deliberately left alone / known-acceptable

- Queue side effects inside `setState` updaters (`advance`,
  `selectAsCurrent`, TropeBingo's line detection) double-fire under
  StrictMode **in dev only**; prod is unaffected. Restructure only if dev
  behavior ever matters.
- On iOS the native modal covers mode UI during playback by design
  (sequential-play modes). The native chrome (Done / speaker / Skip) is the
  in-playback UI.
- `.tr-progress` only animates on web (iOS native player owns its
  lifecycle); it's invisible-at-zero on iOS, which is fine.
- App Store screenshots in `assets/screenshots/` are still the old UI —
  regenerate before any App Store submission (needs a Mac/device).

## Ship

Bump committed as v2.11.0. Tag + push triggers
`.github/workflows/ios-release.yml` (build, sign, TestFlight upload). The
Swift plugin changes ride through `cap sync` + `pod install` in that
workflow — no manual Xcode step.
