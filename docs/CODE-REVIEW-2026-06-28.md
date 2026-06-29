# Code Review — Trailer Roulette (2026-06-28)

Reviewer: Claude. Scope: full `app/` source (components, lib, styles, config, tests) plus repo hygiene. App version at review: **2.9.0**.

## Overall

The codebase is in good shape: clean separation (router → platform players → native plugins), thoughtful self-healing (retry backoff, error boundary, on-device error log), and 47 passing unit tests over the `lib/` layer. The issues below are refinements, not structural problems. The one user-reported bug (off-center play button) is fixed.

Three fixes were applied in this pass; the rest are documented for you to action.

---

## Fixed in this pass

### 1. Off-center play button (the reported bug) — FIXED

**Cause.** The play button was the only icon in the app still drawn with a Unicode text glyph (`▶`, U+25B6) instead of an SVG. A right-pointing triangle glyph's visual mass sits left-of-center inside its character box, and text sits high on its baseline — so flex-centering it looks shoved right-and-up. The code compensated with a hand-tuned `margin-left: 5px` (`index.css:1312`), but that nudge depends on which font actually renders (SF Pro on device vs. a fallback), so it never centers reliably.

**Fix.** Replaced the glyph with an inline SVG triangle whose centroid sits exactly at the viewBox center `(12,12)`, so plain flex-centering *is* optical centering — no per-font magic number.

- `app/src/components/Player.ios.jsx:187` — `<span>▶</span>` → `<svg viewBox="0 0 24 24"><path d="M9 6v12l9-6z"/></svg>`
- `app/src/styles/index.css:226` — `.play-icon` sized by `width/height` instead of `font-size`
- `app/src/styles/index.css:1312` — dropped `margin-left: 5px`; icon is now `34×34`

This matches how every other control (skip, save, AirPlay, watchlist) is already drawn. Web player is unaffected (it auto-plays and has no play button), so this was iOS-only.

### 2. Watchlist badge / saved-state going stale — FIXED

`TrailerRoulette` owned the watchlist count (topbar badge) and the current card's saved (♥) state in `watchlistIds`, but the Watchlist screen removed items directly from storage without telling the parent. Removing the current movie there left the badge count and heart out of sync until something on the main screen changed.

**Fix.** Added `refreshWatchlistIds()` and call it when the Watchlist screen closes (`app/src/components/TrailerRoulette.jsx`), re-syncing the set from storage authoritatively.

### 3. Stale version fallback in About — FIXED

`AboutScreen.jsx:12` fell back to `'2.0.0'` while the app is at 2.9.0. Vite injects the real version at build time so users never saw the wrong number, but the literal was stale (it only surfaces in unit tests). Updated to 2.9.0 with a comment explaining the injection.

---

## Findings to action

### High — App Store screenshots no longer match the app

`assets/screenshots/` (all four device sizes) show the **old light-theme, tabbed UI** with a Classic/Modern segmented toggle, genre chips, and an "Up Next" sheet. The shipping app is the immersive full-bleed swipe-card feed (v2.5+). Submitting these would misrepresent the product and risks a reviewer "screenshot doesn't match app" rejection. Regenerate with `scripts/capture-screenshots.mjs` before submitting.

### Medium — queue advance mutates state from inside a `setState` updater

`selectAsCurrent` (`TrailerRoulette.jsx` ~143–148) and `advance` (~233–238) call side-effecting functions *inside* a `setQueue(q => …)` updater. Updaters are supposed to be pure; under `StrictMode` (which `main.jsx` enables) React double-invokes them in dev, which can fire a second `selectAsCurrent`/detail fetch. It works today, but it's the kind of thing that produces "it occasionally skips two" heisenbugs. Cleaner: read the next item, then call `setQueue` and `selectAsCurrent` separately outside the updater.

### Medium — possible double-advance on the web cycle timer

The web auto-advance interval calls `advance('skip')` at zero (`TrailerRoulette.jsx` ~198–210) while the YouTube `ENDED` event also calls `onEnded → advance`. Because `cycleSeconds` is clamped to the trailer's real duration, both can land at nearly the same instant and skip two. Web is your QA-parity path (iOS owns its own native lifecycle), so impact is low, but a short guard (ignore one if the other just fired) would tidy it.

### Low — dead code / unused exports

Leftovers from the earlier multi-screen version (search, recommendations, tabs) that the single-screen redesign dropped. Harmless, but pruning reduces confusion:

- `lib/tmdb.js` — `searchMulti`, `getPersonMovies`, `getRecommendations` (no callers)
- `lib/youtube.js` — `proxiedEmbedUrl` (superseded by the native plugin's own URL build)
- `lib/haptics.js` — `selection`, `notify`; `lib/airplay.js` — `isAvailable`, `isAirPlayActive`; `lib/storage.js` — `keys`; `lib/dialog.js` — `prompt` (no callers)
- `lib/errorLog.js` — `getErrorLog` / `clearErrorLog` are unused, and the file comment claims the log is "surfaced read-only in the About screen" but `AboutScreen.jsx` never renders it (see Expand below)
- `advance(reason)` is always called with `'skip'`/`'seen'` but ignores the argument (vestigial from the removed taste-profile)

### Low — repo hygiene

- `app/ios-native/` (4 files: `AVRoutePlugin.*`, `Info.plist.additions.xml`, `README.md`) are deprecated stubs — the real native code lives in `app/local-plugins/`. They're still git-tracked, and `.gitignore:7-8` still says "keep `ios-native/`". Remove the folder and that comment.
- `capacitor.config.ts:7` — `bundledWebRuntime` was removed in Capacitor 7; it's silently ignored. Delete it.
- A stray `NVIDIA Corporation/` folder sits at the project root (driver artifact, not tracked). Safe to delete locally.
- `app/*.timestamp-*.mjs` (Vite/Vitest transients) are present locally but correctly gitignored — no action needed.

### Low — CSS carries its full version history

`styles/index.css` stacks every era of the design (v1.6 → v2.8) as additive override layers (~1500 lines). Whole blocks are now dead: the Search screen styles (`~749–818`), the bottom tab-bar (`~1138–1191`), and the v2.2/v2.3 light-card player layout are all overridden by the v2.5/v2.6 immersive rules. It renders fine, but a consolidation pass would cut the file substantially and make future styling far easier to reason about.

---

## Worth expanding (optional)

- **Surface the error log in About.** `errorLog.js` already records a capped ring buffer and the comment promises it's viewable in About — wiring a read-only "Diagnostics" list into `AboutScreen.jsx` would fulfill that and help debug field issues (still on-device, no backend).
- **Persist the Watchlist sort choice.** `Watchlist.jsx` resets `sort` to default every open; one `storage` key would remember it.
- **Component tests.** Coverage is solid on `lib/` but zero on components. The queue/advance logic in `TrailerRoulette` (the trickiest code) would benefit most — it's also where the Medium findings live.

---

## Verification

- Play-button fix verified visually: the SVG centroid lands exactly on the button's geometric center, font-independently.
- All edits confirmed complete and syntactically valid via direct file read.
- The 47-test unit suite covers `lib/*` only; this pass changed JSX/CSS exclusively, so that suite's result is unchanged. (It could not be re-run in the review sandbox: the cloud-synced `node_modules` lacks the Linux build of `rollup`, and the mount served half-synced file copies. Run `npm test` locally to confirm green.)
