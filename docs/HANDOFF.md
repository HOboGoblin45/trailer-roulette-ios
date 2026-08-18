# Trailer Roulette — engineering handoff

Written 2026-08-14 for a fresh model or developer picking this up cold.
Everything here is verified against the repo unless marked otherwise.

---

## 1. Where the project lives

**Local path (Windows):**
```
C:\Users\ccres\OneDrive\Documents\Claude\Projects\Trailer Roulette
```

**Git remote:** `https://github.com/HOboGoblin45/trailer-roulette-ios`
**Current branch/tag:** `main` at `d8b753c`, tagged `v3.4.2` (the auto-advance
root-cause fix; see sections 5–7).
**Apple:** bundle id `app.trailerroulette.ios`, Apple ID `6764209094`

Owner is on **Windows with PowerShell 5.1 and has no Mac**. Do not suggest
`&&` chains, the `??` operator, Xcode, or any local iOS build. All iOS builds
happen on a GitHub Actions macOS runner.

---

## 2. What the app is

An iOS app that shuffles movie trailers like a TV channel. Two buttons: **Play**
(spin a random trailer) and **AirPlay** (throw it to a TV). Trailers are meant to
auto-advance forever. No accounts, no algorithm. Optional **filters** (v3.4.3)
narrow the Everything feed by decade and genre (Filter pill, top bar).

Secondary features: **Theater Mode** (tune the channel to one real cinema's
monthly programme, via Alamo Drafthouse's public JSON API), six optional "fun
modes", and an "About this movie" sheet.

Movie metadata comes from **TMDB**. Trailer video comes from **YouTube**.

---

## 3. Stack

| Layer | Tech |
| --- | --- |
| App shell | Capacitor **7** |
| UI | React 18.3 + Vite 5.4, plain CSS (no framework) |
| Tests | Vitest (167 passing), ESLint 9 |
| Native | Swift, two local Capacitor plugins |
| Serverless | Vercel Edge Function (the YouTube embed proxy) |
| CI/CD | GitHub Actions, macOS runner, tag-triggered |

---

## 4. The playback architecture — read this before changing anything

This is the part that matters, and it is easy to "simplify" into a broken state.
Several alternatives were tried and failed; post-mortems are in
`docs/ai-memory/trailer-roulette-project.md`.

```
React app (Capacitor WKWebView)
  └─ Player.jsx                 picks by platform
      └─ Player.ios.jsx         calls the native plugin
          └─ TrailerPlayer (Swift)
              └─ modal UIViewController hosting a FRESH WKWebView
                  └─ real HTTPS navigation to
                     https://trailer-roulette.vercel.app/embed?v=<id>
                      └─ that page hosts the YouTube <iframe>
                          └─ postMessage bridge back to Swift
```

**Why the Vercel proxy exists and must not be removed.** YouTube refuses to play
embeds whose origin is `capacitor://` or `youtube.com` itself. The proxy is a
real third-party HTTPS origin that YouTube accepts as a legitimate embedder. It
also has `enablejsapi=1`, which is what lets the page relay player events to
Swift via `webkit.messageHandlers.trailerEvent`.

**Do not** replace this with `AVPlayer` and direct video URLs. That violates
YouTube's Terms of Service and will get the API key revoked.

### The three mirrors rule

Ad-aware end-detection logic is **duplicated in three places that must change
together**, or a fix will look correct and regress on another path:

1. `app/src/lib/endDetection.js` — web player
2. `app/local-plugins/trailer-player/ios/Plugin/TrailerPlayer.swift` — native
3. `landing-page/api/embed.js` — the Vercel proxy page

---

## 5. Current state, honestly

### What just changed (v3.4.1) and why it is the important one

**Both local Capacitor plugins were never registered on iOS.** They were written
in the Capacitor 5 shape — `@objc(Name)` on a plain `CAPPlugin` subclass.
Capacitor 6 removed automatic plugin registration; the bridge now binds only
classes conforming to `CAPBridgedPlugin`. Confirm it yourself in
`app/node_modules/@capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift`:

```swift
internal typealias CapacitorPlugin = CAPPlugin & CAPBridgedPlugin
// ...
⚡️  Plugin \(pluginInstance.classForCoder) must conform to CAPBridgedPlugin.
```

Consequence: `registerPlugin('TrailerPlayer')` silently resolved to its **web
fallback**, which does `window.open('https://www.youtube.com/watch?v=...')`. So
on a real device the app opened YouTube's own watch page. The native modal, the
custom chrome, end detection, chaining and the Vercel proxy **never ran at all**.
`AirplayPlugin` fell back to a no-op, so the AirPlay button did nothing either.

v3.4.1 adds `CAPBridgedPlugin` conformance plus `identifier`, `jsName` and
`pluginMethods` to both, and makes the iOS web fallback **throw** instead of
degrading silently.

### The critical unknown

**v3.4.1 has not been confirmed working on a device yet.** Everything native
from v3.2.1 through v3.4.0 reaches hardware for the first time in that build. It
all compiles and its pure logic is unit-tested, but none of it has ever executed
on a phone. Treat v3.4.1 as the first real test of a large batch, not a small
patch on tested work.

### Also true

- **The Vercel proxy is NOT deployed — and what IS live is older than this
  doc claimed.** Verified 2026-08-16: the deployed
  `https://trailer-roulette.vercel.app/embed` page is byte-for-byte the
  **v1.9.0** proxy (no `t`/`d` timing on stateChange, no trLoad, no
  heartbeat, no pin, no epoch). This doc originally said live was v3.1.0 —
  wrong. Deploying needs `cd landing-page`, `vercel login` (interactive
  browser auth), `vercel --prod`. **Since v3.4.2 this is a REQUIREMENT, not
  an enhancement**: the deployed page is the thing that fixes (or keeps
  breaking) every installed build, including the v3.4.1 build already in
  TestFlight. See section 6.
- The **UI work in v3.2.2** (poster stage, swipe-to-dismiss, progress bar,
  exit animations, token conformance across the six fun modes) has never been
  seen running.

---

## 6. Bug history worth knowing, so it is not repeated

The user's complaint has been the same the whole way through: **trailers do not
advance to the next one by themselves.** Five attempts, each wrong in an
instructive way:

| Version | Theory | Why it failed |
| --- | --- | --- |
| 3.1.0 | Pre-roll ads fire a spurious `ENDED` | Correct, but incomplete |
| 3.2.0 | Native 12s watchdog needed a PLAYING event ads never send | Fix used a new message kind (`hb`) that no shipped build understood |
| 3.2.1 | Proxy must speak old builds' vocabulary | Right idea; but required a content-duration "pin" that only the undeployed proxy sends, so end detection was permanently disabled on device |
| 3.3.x | Continuous playback was edge-triggered | Made it level-triggered; still no effect |
| 3.4.0 | Stop hand-rolling it; let YouTube's `loadPlaylist` sequence the queue | Architecturally right, still no effect |

**None of them could have worked**, because the native plugin was never
registered. Every native line was unreachable. The lesson: *verify your code is
reachable before debugging its logic.* One call to
`Capacitor.isPluginAvailable('TrailerPlayer')` would have found this immediately.

### v3.4.2 — the actual root cause (2026-08-16, proven live)

With the bridge fixed, the REAL reason no trailer has ever auto-advanced was
found and proven against real YouTube: **the proxy page never subscribes to
player events.** The IFrame API only delivers `onStateChange`/`onError` after
an explicit `addEventListener` command; the page only ever sent
`{ event:'listening' }` (which arms the player but doesn't subscribe to its
state). A/B test on the same page and port: a listening-only frame delivered
ZERO state events across a full video while `infoDelivery` kept streaming
(so every liveness timer believed the page was healthy); the identical page
plus one `addEventListener('onStateChange')` delivered PLAYING at ~1.4s and
ENDED at the end. Five releases retuned end detection against an event that
never arrived. v3.4.2 fixes the proxy (subscribe + one 2.5s retry, player-level
so trLoad swaps don't double-subscribe) and gates off the v3.4.0 playlist
handoff (no ENDED fires between playlist items — sequence `-1→3→1` — so
`playlistDidAdvance()` could never run). See `docs/bugs.md` B4.

---

## 7. Roadmap

### P0 — Confirm the plugin bridge actually works
Nothing else can be judged until this is known. **v3.4.2 is the build to test**
(it contains the bridge fix AND the playback fix; v3.4.1 is in TestFlight too
but predates the fix).

1. Install **v3.4.2** from TestFlight (wait for it to appear; processing takes
   5-15 min after upload, and the version shown must read 3.4.2).
2. Open **About** — the version block now shows a plugin status line:
   `Native player: active · AirPlay: active`. Both must read `active` on
   device. If either says `MISSING`, the registration fix did not take and
   everything below is blocked.
3. Confirm by eye: tapping Play should open a **full-screen modal with the app's
   own glass header** (Done, Skip, mute). If you instead see YouTube's title bar,
   channel name and wordmark, the native plugin is still not bound.

**Acceptance:** the app's own player chrome is visible during playback.

### P1 — Deploy the proxy FIRST, then verify continuous playback
**The proxy deploy is now the fix, not an enhancement** — the deployed page is
v1.9.0 and has never subscribed to player events, so no installed build can
auto-advance until it is redeployed. This is also the only step that can fix a
phone without a new app build.

```
cd landing-page
vercel login
vercel --prod
```
Verify the new page is live:
```
curl -s "https://trailer-roulette.vercel.app/embed?v=dQw4w9WgXcQ" | grep announcePlaying
```
A match means the v3.4.2 page is live. (v1.9.0's page has no
`announcePlaying`; it also has no heartbeat, pin, epoch or trLoad.)

Then press Play once and watch three trailers end to end without touching
anything. Expected: each ends and the next starts with no replay button and no
tap. v3.4.2 advances via end detection → `advanceInPlace` (`trLoad` swap);
the v3.4.0 `loadPlaylist` handoff is disabled (see section 6 / bugs.md B4).
If the first trailer still stops on YouTube's replay screen, check the
Xcode/console log for `playlist handed to YouTube` (should NOT appear in
v3.4.2) and the native `handleEndCandidate` path.

**Acceptance:** three consecutive trailers with zero taps.

### P2 — Device pass on the unverified UI
Every layout value in v3.2.2/3.3.0 is reasoned, never seen. Check on a real
phone: the six fun modes, the About-this-movie sheet, the theater picker, and
landscape (presentation changed to `.overFullScreen`, and UIKit only consults a
*fullscreen* presented controller for orientation, so landscape may have been
lost).

### P3 — Deferred, non-blocking
- Affiliate id for "Get tickets": paste into `TICKET_AFFILIATE_ID` at the top of
  `app/src/components/MovieSheet.jsx`. One line.
- App Store screenshots are pre-3.x and stale.
- If monetising, check TMDB's terms for commercial use.

---

## 8. Key file map

| Area | Path |
| --- | --- |
| Main screen, queue engine | `app/src/components/TrailerRoulette.jsx` |
| Player router / iOS / web | `app/src/components/Player.jsx`, `Player.ios.jsx`, `Player.web.jsx` |
| Native player plugin | `app/local-plugins/trailer-player/ios/Plugin/TrailerPlayer.swift` |
| Native plugin JS side | `app/local-plugins/trailer-player/src/index.js` |
| AirPlay plugin | `app/local-plugins/airplay-plugin/ios/Plugin/AirplayPlugin.swift` |
| Vercel embed proxy | `landing-page/api/embed.js` |
| Shared end-detection logic | `app/src/lib/endDetection.js` |
| Proxy behaviour tests | `app/src/lib/__tests__/embedProxy.test.js` |
| TMDB wrapper | `app/src/lib/tmdb.js` |
| Theater Mode | `app/src/lib/theaters.js`, `docs/THEATER-MODE.md` |
| Fun modes | `app/src/features/` (registry in `index.js`) |
| Design tokens, global CSS | `app/src/styles/index.css` |
| Bug log | `docs/bugs.md` |
| Long-form context | `docs/PROJECT-PROMPT.md`, `docs/ai-memory/` |
| Project rules for AI | `CLAUDE.md` (repo root) |

---

## 9. Build, test, release

```
cd app
npm install
npm test          # vitest, 167 tests
npm run lint      # eslint
npm run build     # vite
```

**Release to TestFlight** — push a tag; that is the whole mechanism:
```
git add -A
git commit -m "release: v3.4.2 - summary"
git tag -a v3.4.2 -m "v3.4.2"
git push origin main
git push origin v3.4.2
```
The tag triggers `.github/workflows/ios-release.yml`, which builds on a macOS
runner and uploads to App Store Connect. Marketing version comes from the tag;
the build number is set by CI.

**A green workflow is not proof of upload.** Check the run's job steps and
confirm `Build archive` and `Upload to App Store Connect` both succeeded by
name, then allow 5-15 minutes for App Store Connect processing.

**No Mac? You can still check Swift.** The Linux toolchain from
`download.swift.org` gives `swiftc -frontend -parse` for a real syntax check.
For pure Foundation logic, extract it into a small harness and compile and run
it — `/tmp/swifttest` used this pattern, with a script diffing the extracted copy
back against the source to prove the real code was tested. UIKit and WebKit
cannot be typechecked off a Mac; CI is the only gate for those.

---

## 10. Hard rules

- **No emojis anywhere** — not in the app UI, not in code, not in docs, not in
  chat. Typographic glyphs are fine.
- **The three playback mirrors change together** (see section 4).
- **Never fake theater data.** If a lineup feed fails, error out; never
  substitute a generic "now playing" list or mismatched TMDB titles.
- **Never fabricate movie facts.** `app/src/lib/movieFacts.js` derives facts only
  from real TMDB fields, and tests assert the output can never claim shooting
  locations, cast reunions, or a computed profit figure, because the data does
  not support any of them.
- **YouTube ads may not be blocked, replaced or overlaid.** Developer Policies
  §III.G.1.c and §III.I.5. This is why the loading poster retires the instant
  anything plays, including a pre-roll ad.
- **Do not ship logic that depends on a manual step the owner has not done.**
  That mistake caused two of the failures in section 6.
