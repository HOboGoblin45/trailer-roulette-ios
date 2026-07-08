# Code review + playback fix — 2026-07-07 (v3.1.0)

Reported symptom: "The app works, but YouTube trailers only play for about 15
seconds and then stop and begin playing the next one."

Full read of the playback pipeline (`TrailerRoulette.jsx`, `Player.web.jsx`,
`Player.ios.jsx`, `TrailerPlayer.swift`, `landing-page/api/embed.js`) to find
the cause, then a fix applied to every playback path.

## Root cause — pre-roll ads fire a spurious ENDED

YouTube serves a pre-roll **ad** on many trailers, even through the
`youtube-nocookie.com` embed. The IFrame Player fires `onStateChange` -> `ENDED`
(state `0`) when the **ad** finishes — *before* the real trailer starts. Every
path treated that as "trailer over" and advanced:

- **iOS** (`TrailerPlayer.swift`): the `stateChange` handler did
  `state == 0 -> advanceInPlace / finish` immediately.
- **Web** (`Player.web.jsx`): `onStateChange` did
  `data === ENDED -> onEnded()` immediately.

So the trailer was cut off the moment its pre-roll ad ended — commonly ~15s.
(A 12s native watchdog is a secondary contributor if `PLAYING` never reaches
native, but the universal cause is the ad-boundary `ENDED`; playback does reach
`PLAYING`, as verified in the 2026-07-02 review.)

Confirmed against YouTube's documented behavior: the IFrame API reports state
changes for ad content, and playlist/auto-advance code must "track whether the
video actually started playing" and "verify the current time to distinguish ad
completion from actual video completion."

## The fix — confirm a real end before advancing

New shared logic, mirrored on all three paths so the fix holds regardless of
which build/proxy is live:

1. **Progress fast-path** — at `ENDED`, if we know the video's duration and
   playback reached the end of a plausibly-long clip
   (`currentTime >= duration - 1.5s` AND `currentTime >= 32s`), it's a real end.
   Advance immediately.
2. **Resume-confirm** — otherwise wait ~1.2s. A pre-roll ad boundary resumes
   playback (`PLAYING`/`BUFFERING`) within ~1s, which cancels the pending end.
   A genuine end resumes nothing, so the timer fires and we advance. This path
   needs no duration data, so it works even on bare state numbers.

The 32s floor keeps a short ad that reports its *own* time/duration from
tripping the fast-path; the resume-confirm then catches it. The ~1.2s confirm
overlaps the next trailer's load, so it's imperceptible.

### Files

- **`app/src/lib/endDetection.js`** (new) — pure, timer-injectable
  `createEndDetector({ onEnd, getProgress })`. The single source of truth for
  the logic; unit-tested.
- **`app/src/lib/__tests__/endDetection.test.js`** (new) — 10 tests: real end,
  pre-roll ad, ad pod, BUFFERING resume, short teaser, no-progress timeout,
  reset/dispose.
- **`app/src/components/Player.web.jsx`** — routes every state through the
  detector; removed the raw `ENDED -> onEnded`. Also now reports each trailer's
  real duration on `PLAYING` (not just the first video at `onReady`, where
  `getDuration()` is usually 0), so the parent's backstop cycle timer matches
  the clip instead of clipping long trailers at the 90s default.
- **`app/local-plugins/trailer-player/ios/Plugin/TrailerPlayer.swift`** —
  `handleEndCandidate()` (fast-path + `endConfirmTimer`); `state 1/3` cancels a
  pending end; reads optional `t`/`d` progress from the proxy; timer torn down
  in `finish`, `viewDidDisappear`, `deinit`, and on every video (re)load. Works
  even against a not-yet-redeployed proxy (resume-confirm needs no `t`/`d`).
- **`landing-page/api/embed.js`** — tracks `infoDelivery` `currentTime`/
  `duration`, applies the same decision, and only forwards a real end. Forwarded
  event still carries `{ kind:'stateChange', state }` (now plus `t`/`d`), which
  older native builds ignore — so builds already in App Review get the fix once
  the proxy is redeployed.

## Verification

- `endDetection` unit tests: **10/10 pass** (clean isolated vitest).
- Existing `youtube` tests: **9/9 pass**.
- `eslint .` on the whole app: **0 problems**.
- `esbuild` bundle of `src/main.jsx` (packages external): **clean** — all JSX
  compiles and every relative import resolves (incl. the new module).
- `embed.js` parses as ESM (template literal balanced).
- Swift: symbol-consistency grep + manual review (no macOS toolchain here).

The full `vite build` and full `vitest` run are blocked in this sandbox only by
the platform-specific `@rollup/rollup-linux-x64-gnu` / esbuild binaries missing
from a Windows-installed `node_modules`. CI (GitHub Actions, Ubuntu) runs both
on a clean install and is the release gate.

## Ship

`app/package.json` bumped to **3.1.0**; About reads the version from it.
Tag + push triggers `.github/workflows/ios-release.yml` (build, sign, TestFlight
upload); the Swift change rides through `cap sync` + `pod install`. Redeploy the
Vercel `landing-page` (`scripts/06-deploy-vercel.ps1`) so the proxy carries the
fix — not required for the iOS fix, but it makes real ends instant and fixes
already-shipped builds.
