# PROJECT PROMPT — Trailer Roulette

This document is a complete, self-contained briefing. Handed to any engineer or AI
session with zero prior context, it should be enough to understand the product, the
architecture, the current mission, and how to continue the work without breaking what
already works. Written 2026-07-13 at v3.2.0 (working tree, not yet committed).

---

## 1. The mission right now

Two goals, both COMPLETE in this working tree and awaiting Charlie's commit/tag/push:

**Goal A — kill the 13-second bug for good.** YouTube trailers were stopping and
auto-advancing to the next trailer after about 13 seconds. This was the second wave of an
ad-related family of bugs: v3.1.0 fixed the first wave (~15s: pre-roll ads fire a spurious
ENDED event) but the symptom returned at ~13s because the native watchdog was still
ad-blind. The v3.2.0 fix is layered and mirrored across every playback path (detail in
section 4).

**Goal B — pivot the product toward independent movie theaters.** A friend's suggestion
Charlie adopted: pick an indie theater by location (think Alamo Drafthouse and its wide,
weird programming) and the roulette plays trailers for what that theater is actually
showing this month. Shipped as **Theater Mode** (detail in section 5). This also serves an
App Store strategy purpose: the two-button app is thin, and guideline 4.2 ("minimum
functionality") is the biggest rejection risk — a live local-theater trailer channel is
the creative differentiator no competitor has.

Charlie's decisions for this pivot (asked and answered 2026-07-13): build fully, not spec;
Alamo Drafthouse first plus the adapter framework for local/broad indie coverage next;
keep the two-button UI (theater picked once via a small pill, main screen unchanged);
target the App Store, not just personal use.

## 2. The product

Trailer Roulette is a TV channel made of movie trailers. Open the app, press **Play**, and
a random trailer starts; when it ends, the next random trailer plays, forever. Press Play
again mid-trailer to spin to a fresh one. Press **AirPlay** to route it to the TV. That is
the whole core loop — deliberately no accounts, no search, no filters, no recommendation
algorithm, no watchlist. A small **Modes** pill (top-right) opens six self-contained fun
modes: Roulette Wheel (spin for a decade), Blind Date (watch first, reveal after), Guess
the Year, Time Machine (a random year's channel), Trope Bingo (party card), and Cinema
Mode (muted hands-free channel for the TV).

**Theater Mode (v3.2.0)** adds a second kind of channel. A **Theaters** pill (top-left)
opens a liquid-glass sheet listing supported theaters — searchable, and sortable by
distance via a one-shot location request. Pick one and the roulette spins ONLY films from
that theater's live "Now Showing" for the current calendar month, with a
"Now Showing · {Market} · {Month}" badge on each card. Theater channels are finite, so the
reel reshuffles and loops like a lobby screen. "Everything" returns to the classic
all-of-cinema random channel. The choice persists across launches.

The feel throughout: full-bleed backdrop art, Apple Liquid Glass chrome (iOS 26
`UIGlassEffect` with a blur fallback on 15–25), era/genre badges, and a strict no-emoji
design language (text, SVG glyphs, letter monograms only).

## 3. Architecture

**Stack**: Capacitor 7.6 wrapping React 18 + Vite 5. iOS-only target (deployment target
15.0). Two local Capacitor plugins: `trailer-player` (native fullscreen player) and
`airplay-plugin` (route picker). No backend of our own except a Vercel Edge Function used
as an embed proxy. Data sources: TMDB (movie discovery + trailer YouTube keys; v4 bearer
in `app/.env.local`, never committed) and Alamo Drafthouse's public schedule API. CI:
GitHub Actions — `ci.yml` (lint+test+build), `ios-release.yml` (tag push → build, sign,
TestFlight upload on a macOS runner; no local Mac exists in this workflow).

**The playback pipeline (iOS)** — settled after 14 failed alternatives; do not redesign:

1. React calls `TrailerPlayer.openTrailer({ youtubeKey, nextYoutubeKey, muted })`.
2. The plugin presents a fullscreen `TrailerPlayerViewController` hosting a fresh
   WKWebView, which performs a REAL HTTPS main-frame navigation to
   `https://trailer-roulette.vercel.app/embed?v=<id>&controls=0&iv_load_policy=3&fs=0&e=<epoch>`.
   (Real third-party https origin = the only thing YouTube's embed accepts from a
   Capacitor app. `loadHTMLString`, manual Referer headers, nested iframes, and
   SFSafariViewController all fail — post-mortems in `docs/ai-memory/`.)
3. The proxy page (`landing-page/api/embed.js`, server-rendered) hosts the YouTube
   iframe (youtube-nocookie, `enablejsapi=1`), listens to the IFrame API's postMessages,
   runs ad-aware end detection, and forwards events to native via
   `webkit.messageHandlers.trailerEvent`: `ready`, `stateChange {state,t,d}`, `error`,
   plus (v3.2.0) a 1-second heartbeat `hb {state,t,d,yt,cc}` and `meta {pin}`. Every
   message echoes the epoch token `e`.
4. Native chains trailer→trailer IN PLACE: JS keeps the next key primed via
   `enqueueNext`; on a confirmed end the plugin calls the page's `window.trLoad(id, e)`
   (gapless, ~0.5s) or reloads the URL on older proxies. The modal never flickers.
   Skip/Done buttons and a mute toggle live in the glass header.
5. The web build (dev/preview) mirrors the same brain using the YT IFrame API directly
   in `Player.web.jsx` + `endDetection.js`, with the parent's cycle timer as a backstop.

**The queue engine** (`TrailerRoulette.jsx`): era-stratified random discovery
(`discoverRandomMix` samples one random year per decade so batches span all of cinema),
uniform shuffle, lazy YouTube-key prefetch 3 ahead, dead-video blocklist per session,
self-healing backoff on network failure, top-up when the queue runs low. Theater Mode
swaps the candidate source (`getTheaterQueue`) and loops instead of refetching; everything
downstream is unchanged.

## 4. Goal A in depth — the 13-second bug and its fix

**History.** B1 (v3.1.0, closed 2026-07-07): YouTube serves pre-roll ads on many trailers;
the IFrame player fires `onStateChange → ENDED(0)` when the AD finishes, before the
content plays. Every path advanced on the raw ENDED → trailers "played" ~15s. Fix:
`createEndDetector` — a progress fast-path (advance instantly only if
`currentTime ≈ duration` on a clip ≥ 32s) plus a resume-confirm window (~1.2s; an ad
boundary resumes PLAYING/BUFFERING which cancels the pending end; a real end resumes
nothing). Mirrored in web, native, and proxy.

**B2 (v3.2.0, closed 2026-07-13): the symptom persisted at ~13s.** The end detector was
working. The killer was the native **watchdog**: "if no PLAYING within 12s, treat the
video as unplayable and skip." Several 2026 ad variants keep the CONTENT player in
UNSTARTED for the whole ad — no PLAYING event fires until the ad finishes — so any trailer
whose pre-roll outlasted ~12s was skipped as dead at 12s + ~1s load ≈ 13s. Consistent
timing, every ad-backed trailer. (YouTube A/B tests ad implementations, which is why v3.1.0
testing looked clean and the field regressed.)

**The v3.2.0 fix, layer by layer:**

- **Liveness watchdog (Swift).** Silence, not "no PLAYING", is the evidence of death.
  Repeating 2s timer with three verdicts: dead page (no proxy messages at all within
  12s), silent player (page alive but the YT iframe never spoke within 20s), hard cap
  (no content playback within 75s). A live page serving a long ad heartbeats through all
  of them. Dead video IDs still skip instantly via the `error` event. Old-proxy fallback:
  `ready`/`stateChange` traffic counts as liveness.
- **Proxy heartbeat + pin (embed.js).** 1s `hb {state, t, d, yt, cc}` gives native its
  liveness and progress signal even when YouTube is silent. `meta {pin}` captures the
  CONTENT's duration from `initialDelivery` metadata BEFORE any ad plays — ground truth
  that ads can't fake.
- **Hardened end detection (all three mirrors).** (a) Dual confirm window: 5s until
  content playback is CONFIRMED (≥ 3s of observed forward progress on a clip whose
  duration matches the pin, else ≥ 32s duration), then the snappy 1.2s — slow ad-pod
  gaps can no longer fake an end. (b) The fast-path additionally requires content
  confirmation AND a pin match — a ≥ 32s unskippable ad ending at its own duration can't
  fast-path a false advance. Legacy callers without progress feeds keep exact v3.1.0
  behavior (backward compatible; 19 unit tests).
- **Epoch token.** postMessage delivery is async, so a message from the PREVIOUS video
  can land after state resets for the next one (found in adversarial review). Each
  load/swap increments a token (`?e=` on cold loads, `trLoad(id, e)` on swaps); the proxy
  echoes it on every message; native drops mismatches. No echo (older proxy) = accepted.
- **Web-specific poisoning fix.** `Player.web.jsx` used to report `getDuration()` at the
  first PLAYING — during an ad that's the AD's duration, which set the parent's backstop
  cycle timer to ~12s and hard-advanced mid-trailer. Now: pin from pre-playback metadata,
  1s progress poll into the detector, only confirmed content durations reported, and the
  backstop adds 45s of ad headroom (`AD_ALLOWANCE_SECONDS`) since its countdown ticks
  through ad time.
- **Bonus from review:** fixed a pre-existing retain leak — `WKUserContentController`
  holds its message handler strongly, so every session leaked the VC + WKWebView;
  `removeScriptMessageHandler` now runs in `finish()`/`viewDidDisappear`.

**Compatibility matrix:** new native + old proxy degrades gracefully (liveness from
ready/state traffic, 75s cap, no pin); old native + new proxy ignores the new fields.
Redeploying the proxy is what turns on precise behavior — and improves already-shipped
builds too.

## 5. Goal B in depth — Theater Mode

**Data source (verified live 2026-07-13; public JSON, no auth, CORS-permissive):**

- Markets: `GET https://drafthouse.com/s/mother/v1/page/cclamp` →
  `data.marketSummaries[] {id, slug, name, marketStatus}` — 23 OPEN metro markets
  (Austin, Boston, Charlottesville, Chicago, Corpus Christi, DC, DFW, Denver,
  Indianapolis, Laredo, LA, Naples FL, NYC, Northern Virginia, Omaha, Raleigh,
  San Antonio, SF Bay Area, Springfield MO, St. Louis, Twin Cities, Winchester VA,
  Yonkers).
- Schedule: `GET https://drafthouse.com/s/mother/v2/schedule/market/{slug}` →
  `data.presentations[] {slug, show.title, isHidden}` +
  `data.sessions[] {presentationSlug, businessDateClt "YYYY-MM-DD", status, isHidden}` +
  `data.market[0].cinemas[]`. Austin's July 2026 feed: 90 presentations, 63 distinct
  films this month — The Odyssey and Toy Story 5 next to Rashomon, Lawrence of Arabia,
  Carlito's Way, My Man Godfrey. Exactly the concept.
- Caveat: drafthouse.com rejects non-browser user agents (server-side fetches return
  empty). From the app (WKWebView/browser origins) it works; `CapacitorHttp` (native
  URLSession) is the fallback path if CORS ever tightens.

**Pipeline** (`app/src/lib/theaters.js`, 17 tests):

1. `getTheaterDirectory()` — live market list merged with a static fallback list that
   carries metro coordinates (for distance sort); 24h cache.
2. `getLineup(marketSlug)` — sessions filtered to the current calendar month
   (`businessDateClt` prefix), films deduped (a 35mm presentation and a regular one are
   the same film), sorted by how heavily they're programmed; 6h cache per market+month.
   Throws on an empty month — never fabricates.
3. `cleanFilmTitle(raw)` — strips programming decorations while preserving real titles:
   trailing year → a year HINT ("Moana (2026)"), known series prefixes only
   ("Terror Tuesday: X" strips; "Mission: Impossible" and "2001: A Space Odyssey" keep
   their colons), suffix/parenthetical decorations ("50th Anniversary", "Movie Party",
   "(35mm)", "in 4K").
4. `matchFilmToTmdb(film)` — conservative: exact normalized-title match in the hinted
   year first (disambiguates Moana 2026 from Moana 2016), then unconstrained exact, then
   containment-by-popularity; **null = the film is dropped, never mismatched**. Live
   match rate on real July titles: 17/17.
5. `getTheaterQueue()` — composes the above into the app's standard candidate shape;
   YouTube keys resolve lazily through the existing `getTrailer` pipeline, so prefetch,
   blocklists, and ad-aware end detection all apply unchanged.

**UI**: `TheaterSheet.jsx` (picker: Everything row, search, "Near me" via one-shot
`navigator.geolocation` with silent fallback, letter-monogram rows, active checkmark);
Theaters pill top-left showing the tuned market; Now Showing badge on the card;
`KEYS.SOURCE` persistence; queue looping. `NSLocationWhenInUseUsageDescription` is in
Info.plist; nothing is stored or transmitted.

**Extending coverage** (the plan for "my local theaters" + "broad indie directory"):
one directory entry + one lineup adapter per venue platform — Eventive, Agile WebSales,
and Veezi notes are in `docs/THEATER-MODE.md`. Charlie's own city/local theaters are
still unknown — ask him, then add those adapters first.

## 6. State of the tree and how it was verified

Everything above is implemented, on disk, and verified (2026-07-13): 75/75 vitest across
6 suites (19 endDetection incl. 9 new ad-hardened cases; 17 theaters), eslint clean,
`vite build` green (78 modules), Swift changes adversarially reviewed (zero compile
blockers; the two flagged risks — stale cross-epoch messages and the handler retain leak
— were fixed, see section 4), and live checks against the real world: markets feed,
Austin July lineup, TMDB matching including remakes, CORS from a foreign origin.
Version bumped to 3.2.0; CHANGELOG, `docs/bugs.md` B2, `docs/THEATER-MODE.md`,
`store-listing/whats-new-v3.2.0.md` all written. NOT yet committed (AI sessions have no
push credentials).

**Ship checklist** (Charlie, ~5 minutes): commit + tag `v3.2.0` + push (PowerShell 5.1:
plain multi-line git commands, not `scripts/07-release.ps1`), redeploy the Vercel proxy
(`cd landing-page; npx vercel --prod`), watch the `ios-release.yml` run, then verify on
device: an ad-backed trailer must play past 13s and through to its real end.

## 7. Constraints, conventions, lessons learned

- **No emojis, ever** (UI, chat, docs). SVG glyphs and letter monograms instead.
- **Deliver complete work** — implementation + tests + docs + changelog, not plans.
- **Mirrored playback logic** must change in all three places at once (web lib, Swift,
  proxy); unit tests live web-side, the proxy inlines the same rules, Swift mirrors them
  natively so a stale proxy never breaks the app.
- **YouTube ad behavior is a moving target** — they A/B test ad delivery. Any future
  "trailer skips early" report: start from ad variants, check the watchdog and the
  detector's assumptions, reproduce timing patterns before coding (~13s constant = a
  fixed timer somewhere; variable = ad-length dependent).
- **Never trust `getDuration()`/`getCurrentTime()` during ads** — they describe the ad.
  Only pre-playback metadata (onReady / initialDelivery) describes the content.
- **The OneDrive/sandbox staleness trap**: in AI sandbox sessions, the Linux mount of
  this folder serves stale/truncated views of files edited minutes ago. Windows-side
  file tools are authoritative. Verify with host-side greps; build/test from a /tmp copy
  re-materialized from context or `git show`.
- **App Review posture**: 4.2 thin-app risk is the standing threat; Theater Mode is the
  answer — keep it real (no placeholder venues, no fake lineups). Manual release is ON.
  Two versions can't sit in review simultaneously.
- **Do not** suggest paid Mac rentals (GitHub Actions macOS runners are the build path),
  and don't propose ad-blocking hacks (App Review + ToS).

## 8. Roadmap after v3.2.0

1. On-device verification of the 13s fix; watch for any remaining early-skip pattern
   (if seen: which timing? constant ≈ a timer; ad-length ≈ detection).
2. Add Charlie's local theaters + first non-Alamo adapters (Eventive/Agile/Veezi).
3. Regenerate App Store screenshots (still pre-3.x); refresh store description to lead
   with Theater Mode; update privacy label with Location (App Functionality, not linked).
4. App icon decision (6 concepts presented 2026-07-07, none picked).
5. Possible Theater Mode v2: cinema-level (not market-level) selection, next-month
   lineup preview, "what's playing tonight" sort.
