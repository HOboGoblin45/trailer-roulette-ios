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
- v1.0 (build 2.11.0) was submitted to App Review 2026-07-03 (manual release). v3.1.0 is
  committed/tagged. **v3.2.2 is complete in this working tree but NOT yet committed/pushed.**
  (v3.2.0 and v3.2.1 were never tagged; v3.2.2 carries all three.)

## Current objective (as of 2026-08-14)

Ship **v3.2.2**, which contains four things (full detail: `docs/PROJECT-PROMPT.md`):

1. **The ~13s cut-off fix.** Trailers skipped to the next one after ~13 seconds. Root
   cause: the native 12s watchdog required a PLAYING event, but several YouTube pre-roll
   ad variants keep the content player UNSTARTED while the ad runs — live trailers were
   skipped as "unplayable". Liveness-based watchdog, hardened end detection, in all three
   mirrors. See `docs/bugs.md` B2.
2. **The corrections that actually cure it (v3.2.1).** The v3.2.0 work was right about the
   cause and wrong about the cure in three ways, all the same mistake — trusting
   `onStateChange` in a bug defined by `onStateChange` not firing. See `docs/bugs.md` B3.
   The one that matters most operationally: **a proxy redeploy now fixes phones that are
   already out there.** Shipped builds only cancel their watchdog on a `stateChange:1`,
   so the proxy synthesises one (`syn:true`) as soon as playback demonstrably advances.
3. **UI audit + native player feel (v3.2.2).** Exit animations everywhere (`src/lib/useDismissAnimation.js`, `src/features/overlay.js`), a working Reduce Motion rule, 44pt tap targets, design-token conformance across the six modes, and a native player that opens on the movie's artwork instead of black, dismisses by swipe, auto-hides its chrome and shows a progress bar fed by the existing heartbeat. See CHANGELOG 3.2.2.
4. **Theater Mode.** Directory + picker + monthly live lineups from Alamo's public JSON
   API, matched to TMDB, spun through the existing roulette. See `docs/THEATER-MODE.md`.

**To ship (Charlie must do; AI has no push creds / no Mac here):**
1. **Redeploy the Vercel proxy FIRST — this is the step that fixes the live app**, with no
   App Review round trip: `cd landing-page` then `npx vercel --prod`. Then re-test on the
   phone before doing anything else; the currently-installed build should stop skipping.
2. `git add -A; git commit -m "release: v3.2.2 - Theater Mode + fix trailers cut short + UI/player-feel overhaul"; git tag v3.2.2; git push origin main; git push origin v3.2.2`
   (paste as separate lines — his PowerShell is 5.1, don't use `07-release.ps1`).
3. The tag push triggers `.github/workflows/ios-release.yml` → TestFlight.
4. App Store screenshots are still pre-3.x and stale; regenerate before the next
   marketing push (`scripts/capture-screenshots.mjs`, `capture-ipad-screenshots.mjs`).

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
