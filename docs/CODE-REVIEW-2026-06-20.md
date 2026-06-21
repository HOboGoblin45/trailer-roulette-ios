# Trailer Roulette — Full Code Review

**Date:** 2026-06-20 · **Reviewed at:** tag `v2.0.0` (HEAD `65dc44d`) · **Reviewer:** Claude

## Verdict

This is **not** a half-finished scaffold. It's a complete, well-architected Capacitor 7 + React 18 app
that builds clean, passes its full test suite, has a live load-bearing playback proxy, a committed Xcode
project, and a fully automated TestFlight/App Store release pipeline. "Getting it into a working app" is
mostly about confirming the GitHub/Apple credentials are wired up and doing the final manual App Store
submission — plus a short list of code nits, the trivial ones of which I already fixed.

## What I verified works (right now)

- **Tests:** `npm test` → **47/47 passing** (taste profile, shuffle weighting, storage, youtube helpers).
- **Build:** `vite build` → 65 modules transformed, ~177 KB JS bundle, no errors.
- **Live proxy:** `https://trailer-roulette.vercel.app/embed?v=…` returns the correct server-rendered
  YouTube iframe with the right third-party origin. The single most important runtime dependency for
  trailer playback is **up**.
- **iOS project:** committed (24 tracked files), Capacitor 7, deployment target 14.0, bundle
  `app.trailerroulette.ios`, dark UI, portrait+landscape, `ITSAppUsesNonExemptEncryption=false`.
- **Native plugin:** `TrailerPlayer.swift` matches the documented working architecture — fresh WKWebView →
  direct HTTPS nav to the proxy → `webkit.messageHandlers.trailerEvent` bridge → watchdog + YT-error-code
  detection (2/5/100/101/150/152) → reports `unplayable:*` back to React, which blacklists the key for the
  session. ID is validated/sanitized; navigation is host-allowlisted; escape-to-youtube links intercepted.
- **Release pipeline (`ios-release.yml`):** complete and correct — cert import, provisioning profile, manual
  signing, archive, export with `app-store` method, upload via App Store Connect API key. Marketing version
  is set from the git tag; build number from the run number.

## What I fixed in this review

1. **ESLint was failing (3 errors) — this turns `ci.yml` red**, because CI runs `npm run lint` *before*
   test and build. Fixed:
   - `src/components/Player.ios.jsx` — unescaped `'` in JSX text → `&apos;`.
   - `src/components/TrailerRoulette.jsx` — unescaped `'` in the error banner → `&apos;`.
   - `local-plugins/trailer-player/src/index.js` — `window` flagged as undefined. Added a `local-plugins/**`
     block to `eslint.config.js` granting browser+node globals (the plugin's web fallback legitimately uses
     `window`).
2. **`AboutScreen.jsx` showed `v1.8.0`** while the app is 2.0.0 — bumped to `2.0.0`. (Better long-term: inject
   the version at build time so it can't drift again — see below.)

> Note: `ios-release.yml` does **not** run lint or tests, so the broken lint never blocked a *release* — but
> it did make the fast `ci.yml` check red, contradicting the "CI green" status. It will go green on next push.

## What still needs to happen to ship (your action / can't verify from here)

1. **GitHub Actions secrets must be configured**, or no signed build is produced. The release workflow needs:
   `VITE_TMDB_API_KEY`, `VITE_TMDB_BEARER_TOKEN`, `BUILD_CERTIFICATE_BASE64`, `P12_PASSWORD`,
   `KEYCHAIN_PASSWORD`, `BUILD_PROVISION_PROFILE_BASE64`, `APPLE_TEAM_ID`,
   `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_API_KEY_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY_BASE64`,
   plus the repo **variable** `VITE_PRIVACY_POLICY_URL`. Your local `.env.local` has the TMDB key + a privacy
   URL, but that file is git-ignored, so CI relies entirely on these secrets.
2. **Privacy policy URL must be live.** AboutScreen links `VITE_PRIVACY_POLICY_URL` (falls back to `#` if
   unset). Apple requires a reachable policy URL on the listing.
3. **App Store submission** — the remaining ~45-minute manual step documented in `docs/SHIP-IT.md`.

## Code-quality issues worth addressing (not release blockers)

- **iOS cycle-timer / native-modal desync (highest priority of this list).** In `TrailerRoulette.jsx` the
  JS cycle timer keeps ticking while the native full-screen player modal is open. After `cycleSeconds`
  (default 90s) it fires `advance('skip')`, mutating the queue *underneath* the open modal; when the user
  then dismisses, `onEnded` fires `advance()` again → possible double-advance / "current" desync. On iOS the
  native player should own timing. Suggest gating the interval on a "modal open" flag (pause the cycle while
  `opening`/presented, resume on dismiss). Needs on-device testing to confirm the symptom.
- **Stale comment in `Player.ios.jsx`.** The header block describes an old SFSafariViewController approach;
  the actual implementation is the WKWebView + Vercel-proxy plugin. Doc rot that will mislead the next
  debugging session — update it to match `TrailerPlayer.swift`.
- **Diagnostic leak in the error banner.** `loadQueue`'s catch appends the TMDB API-key length / presence to
  a *user-visible* string. Fine for TestFlight triage; strip it before public release.
- **`Player.web.jsx` `onError`** handles codes 100/101/150 but not **152** (the 2025 variant the iOS side
  already handles). Add 152 so the web player also auto-skips those.
- **Verbose key diagnostics in `ios-release.yml`** echo the first/last 4 chars and length of the TMDB key into
  the build log. Remove that step before the repo is public so no key fragments are printed. (The step name
  also contains a stray mojibake byte — clean it while you're there.)
- **`Info.plist` `UIRequiredDeviceCapabilities = armv7`** (legacy 32-bit; Capacitor's default). Modern value
  is `arm64`. Cosmetic.
- **Version drift fix (optional, recommended).** Inject the app version via Vite `define` from
  `package.json` so `AboutScreen` can't fall out of sync again.

## Housekeeping

- Untracked junk in the working tree: `app/*.timestamp-*.mjs` (Vite/Vitest temp files) and
  `test-results/*.png`. Add to `.gitignore` or delete.
- Working tree has **uncommitted modifications** to several `app/ios/*` files and `.env.local.template`.
  Review and commit or discard so a tagged release build is reproducible from a clean checkout.
- `node_modules` in the folder was installed on Windows; running the suite in a Linux sandbox needed the
  platform rollup/esbuild binaries. This does **not** affect CI (fresh `npm ci`) — environment-only.

## Bottom line

The app itself is in good shape and the engineering is solid. The path to "in the App Store" is: (1) confirm
the GitHub secrets + privacy URL are set, (2) push a `v*.*.*` tag to trigger the release workflow, (3) do the
manual submission per SHIP-IT.md. The cycle-timer/modal interaction is the one functional issue I'd test on
a device and fix before a wider release.
