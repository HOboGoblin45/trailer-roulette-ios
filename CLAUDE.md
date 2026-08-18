# CLAUDE.md — Trailer Roulette (hardwired project context)

This file is loaded automatically whenever an AI session works in this folder. It is the
single source of truth for what this project is, what is in flight, and the rules of the
road. Deep detail lives in `docs/PROJECT-PROMPT.md`; session-learned history lives in
`docs/ai-memory/`. Keep all three updated when the project moves.

## What this app is

**Trailer Roulette** — an iOS app (Capacitor 7 + React 18 + Vite 5) that shuffles movie
trailers like a TV channel. Two buttons: **Play** (spin a random trailer) and **AirPlay**
(throw it on the TV). Trailers auto-advance forever. No accounts, no filters, no algorithm.
Six optional "fun modes" live behind the top-right **Modes** pill. As of v3.2.0 there is a
second channel type: **Theater Mode** — tune the roulette to a real independent theater
(Alamo Drafthouse's 23 markets) and it spins only what that theater is showing this month.

- Bundle ID `app.trailerroulette.ios` · Apple ID 6764209094 · repo `github.com/HOboGoblin45/trailer-roulette-ios`
- v1.0 (build 2.11.0) was submitted to App Review 2026-07-03 (manual release). Latest
  release: **v3.4.2** (2026-08-16) — the auto-advance root-cause fix. v3.4.1 fixed the
  unregistered native plugins (`CAPBridgedPlugin`); v3.4.2 fixes the proxy's missing
  player-event subscription and disables the v3.4.0 playlist handoff. See CHANGELOG.

## Current objective (as of 2026-08-16)

Ship **v3.4.2** and confirm it on a device. Two parts (full detail:
`docs/bugs.md` B4, `docs/HANDOFF.md` §6–7):

1. **The missing event — the actual root cause of "trailer never auto-advances".**
   Proven live against real YouTube (2026-08-16): the proxy page
   (`landing-page/api/embed.js`) only ever sent the IFrame API's
   `{ event:'listening' }` message, which arms the player but never subscribes to
   its state. `onStateChange`/`onError` are delivered only after an explicit
   `addEventListener` command; without it the widget's state channel is silent
   for the whole clip (while `infoDelivery` keeps streaming, so every liveness
   timer believed the page was healthy) and the `ENDED` every end-detection
   mirror waits on never arrives. B1–B3 all tuned consumers of that absent
   event. The proxy now sends `addEventListener('onStateChange')` +
   `addEventListener('onError')` on load with one 2.5s retry; the subscription
   is player-level and survives `trLoad` swaps (no double-subscribe).
2. **Native playlist handoff disabled** (`TrailerPlayer.swift`). v3.4.0 handed
   the queue to YouTube via `loadPlaylist`; live observation showed the widget
   advances items itself but fires **no ENDED between items** (`-1 → 3 → 1`), so
   `playlistDidAdvance()` could never run and the queue/chrome desyncs. Gated
   off (call site documented); the proven end-detection → `advanceInPlace`
   (`trLoad`) path now has its input event.

**To ship (Charlie must do; AI has no push creds / no Mac here):**
1. **Redeploy the Vercel proxy FIRST — this is the step that fixes the live
   app**, with no App Review round trip: `cd landing-page` then `npx vercel
   --prod` (interactive browser login). The currently deployed page is v1.9.0
   (verified byte-identical 2026-08-16) and has never subscribed to player
   events, so NO installed build can auto-advance until this lands. It also
   fixes the v3.4.1 build already in TestFlight.
2. `git add -A; git commit -m "release: v3.4.2 - ..."; git tag v3.4.2; git push origin main; git push origin v3.4.2`
   (paste as separate lines — his PowerShell is 5.1, don't use `&&` chains).
3. The tag push triggers `.github/workflows/ios-release.yml` → TestFlight.
4. On device: About screen must show `Native player: active · AirPlay: active`
   (P0), then Play and watch three trailers auto-advance with zero taps (P1).

**Ordering rule for this class of bug:** the proxy is the only layer that reaches
already-installed builds. Any playback fix must be expressible in the message vocabulary
those builds already understand (`stateChange`, `error`), or it cannot ship without App
Review. New message kinds are an enhancement, never the fix itself.

## Hard rules (never violate)

- **NO EMOJIS anywhere** — not in app UI, not in chat, not in docs. Use text, SVG glyphs,
  or letter monograms. (Typographic glyphs like ▸ ✓ ∞ · are fine.)
- **Deliver finished work, not plans** ("Boil the Ocean"). Complete implementation, tests,
  docs, version bump, changelog.
- **The three playback mirrors change together**: `app/src/lib/endDetection.js` (web),
  `app/local-plugins/trailer-player/ios/Plugin/TrailerPlayer.swift` (native),
  `landing-page/api/embed.js` (Vercel proxy). A fix applied to one will look fixed and
  regress on another path.
- **Never fake theater data.** If a lineup feed fails, error out; never substitute a
  generic "now playing" list or mismatched TMDB titles.
- **Don't touch the proven playback architecture** (WKWebView → real HTTPS nav to
  `https://trailer-roulette.vercel.app/embed?v=ID`). Every alternative failed; the
  post-mortems are in `docs/ai-memory/trailer-roulette-project.md`.
- Charlie is Windows-only with PowerShell 5.1: no `??` operator, no `&&` chains in
  suggested PS commands; give plain multi-line blocks.

## Environment gotchas (sandbox sessions)

- **OneDrive mount staleness**: the Linux sandbox's view of this folder serves stale or
  truncated copies of files edited minutes ago (new files sync fast; edits lag). The
  Windows-side file (Read/Write/Edit tools) is always authoritative. To build/test:
  rsync to /tmp, then re-materialize freshly-edited files from context (heredoc) or from
  `git show HEAD:<file>` + patches; `npm install` works in /tmp (registry reachable).
- `node_modules/` here holds Windows binaries — never run vite/vitest against the mount.
- drafthouse.com blocks non-browser user agents (sandbox fetches return empty); use
  browser-based verification. The API itself is public and CORS-open from real origins.
- No Swift compiler preinstalled — but one can be fetched: `download.swift.org` is
  reachable, and the Linux 5.10 toolchain gives `swiftc -frontend -parse` (syntax-checks
  the whole plugin) plus real compile-and-run of any Foundation-only logic extracted from
  it. See the harness pattern used for v3.2.1: copy the pure functions out verbatim, diff
  the copy back against the source to prove fidelity, shim `Timer` via a typealias, run
  scenarios. CI (macOS runner) is still the only gate for UIKit/WebKit typechecking.
- youtube.com and trailer-roulette.vercel.app are NOT reachable from the sandbox
  (connection reset), so live playback cannot be observed here. Test the proxy by importing
  its Edge Function, lifting the `<script>` out of the rendered HTML and running it in a
  `node:vm` sandbox — see `app/src/lib/__tests__/embedProxy.test.js`.
- In Cowork sessions the device bridge (`device_stage_files` / `device_commit_files`) round-
  trips files byte-identically; verify with `md5sum` on both sides rather than assuming the
  OneDrive staleness above applies.
- **`device_bash` cannot unlink files.** A plain `git status` on the mount takes
  `.git/index.lock` for its opportunistic index refresh, fails to remove it, and leaves a
  stale lock that blocks Charlie's next `git add`/`git commit`. Always use
  `git --no-optional-locks status`. If a lock is already stranded, `mv` it aside — deleting
  it is not possible from that tool.

## Key file map

| Area | Files |
| --- | --- |
| Main screen (two buttons + queue engine) | `app/src/components/TrailerRoulette.jsx` |
| Player router / web / iOS | `app/src/components/Player.jsx`, `Player.web.jsx`, `Player.ios.jsx` |
| Native player plugin (modal WKWebView, watchdog, ad logic) | `app/local-plugins/trailer-player/ios/Plugin/TrailerPlayer.swift` |
| Embed proxy (load-bearing for playback) | `landing-page/api/embed.js` → deployed at trailer-roulette.vercel.app |
| Ad-aware end detection (shared brain + tests) | `app/src/lib/endDetection.js`, `__tests__/endDetection.test.js` |
| Proxy behaviour tests (runs the real Edge Function's script) | `app/src/lib/__tests__/embedProxy.test.js` |
| Theater Mode service + tests | `app/src/lib/theaters.js`, `__tests__/theaters.test.js`, `docs/THEATER-MODE.md` |
| Theater picker UI | `app/src/components/TheaterSheet.jsx` + `theater-sheet.css` |
| TMDB wrapper | `app/src/lib/tmdb.js` (discoverRandomMix, searchMovie, getTrailer) |
| Fun modes | `app/src/features/` (registry in `index.js`) |
| Storage keys | `app/src/lib/storage.js` (`KEYS.SOURCE` = active channel) |
| Bug history | `docs/bugs.md` (B1 ~15s ad ENDED, B2 ~13s watchdog, B3 the actual cure) |
| AI session memory (hardwired) | `docs/ai-memory/` |

## Verification status of the current tree (2026-08-14)

95/95 vitest (22 endDetection, 17 embedProxy, 17 theaters), eslint clean, `vite build`
green. The v3.2.2 UI work is verified by those same gates plus a re-run of the native
logic harness; it is NOT verified visually — no simulator here, so every layout value
is reasoned, not seen. Check the six fun modes and the player chrome on a device. `app/src/lib/__tests__/embedProxy.test.js` renders the real Edge Function, lifts its
`<script>` out verbatim and drives it through a fake DOM + virtual clock, so the deployed
artefact is what gets asserted; all seven B3 defects reproduce as failures against the
v3.2.0 page. The native end-detection logic was extracted verbatim (a script diffs the copy
back against `TrailerPlayer.swift`) and compiled and run under Linux Swift 5.10 — 6 checks
fail on v3.2.0's logic, all pass on v3.2.1; the full plugin is syntax-checked only, since
UIKit/WebKit cannot be typechecked off a Mac. **Not verified on a device or against live
YouTube** — the sandbox has no route to youtube.com or the Vercel host, so ad behaviour
(does `infoDelivery` stream during a pre-roll? does `initialDelivery` carry the content
duration?) is inferred from this repo's own recorded observations, not re-measured. First
thing to confirm on the phone after the proxy redeploy.

Earlier, still current: live-verified Alamo markets feed (23), Austin July lineup (63
films), TMDB matching 17/17 real programme titles including remake disambiguation
(Moana 2026 vs 2016).

## Open threads / next steps

1. Redeploy the proxy, then verify on-device that trailers play past 13s on the build
   already installed. Then ship v3.2.1 (steps above). If skipping persists after the
   redeploy, capture what the page actually receives before changing more code: open
   `https://trailer-roulette.vercel.app/embed?v=<id>` in desktop Chrome with a console
   listener on `message` and log every `initialDelivery`/`infoDelivery`/`onStateChange`
   through a real pre-roll. Two assumptions in this fix are inferred from this repo's
   history, not measured: that `infoDelivery` streams during a pre-roll ad (the whole
   synthetic-PLAYING path depends on it) and that `initialDelivery` carries the content
   duration (the pin depends on it). If the first is false, an unpinned fallback is needed
   for the watchdog; if the second is false, every trailer ends 5s late and the pin needs
   a different source.
2. Charlie's own local indie theaters: his city is still unknown — ask, then add
   adapters (Eventive / Agile / Veezi guide in `docs/THEATER-MODE.md`).
3. Regenerate stale App Store screenshots; refresh `store-listing/description.md` to
   mention Theater Mode before the next submission.
4. App icon: 6 concepts were presented (2026-07-07); Charlie hasn't picked yet.
5. Privacy nutrition label: add Location (App Functionality, not linked) for "Near me".
6. Watch the first TestFlight build for `UIGlassEffect` (needs Xcode 26 on CI).
