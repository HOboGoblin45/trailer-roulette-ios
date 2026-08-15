---
name: Trailer Roulette locked decisions
description: Locked Phase 1+2 decisions for the Trailer Roulette iOS port — stack, App Store strategy, bundle ID, v1 features, build pipeline.
type: project
---
Locked 2026-04-25 (Phase 1):
- **Stack**: Capacitor (wrap React). ADR-0001.
- **App Store strategy**: Path C (original product) + Path A playback. ADR-0002. (Playback later evolved to the WKWebView + Vercel proxy architecture — see trailer-roulette-project.md.)
- **Bundle ID**: `app.trailerroulette.ios`. ADR-0004.
- **v1 features**: Watchlist + Seen it/Skip it swipes. ADR-0003. (Superseded 2026-06-29 by the two-button pivot; swipe/watchlist deleted.)
- **No accounts in v1** — saves dev time + avoids Sign In with Apple.
- **TMDB attribution required** in About.

Locked 2026-04-25 (Phase 2 path):
- **Apple Developer Program**: paid and approved.
- **Mac access**: NOT NEEDED. Building via GitHub Actions macOS runners. Charlie pushed back on the $30/mo cloud Mac and was right — the no-Mac path is genuinely viable.
- **Codebase**: workspace scaffold IS v1. Pushed from Windows to GitHub (`HOboGoblin45/trailer-roulette-ios`).
- **Domain**: deferred; Vercel subdomain hosts privacy policy + landing + the embed proxy.
- **Native plugin structure**: local Capacitor plugins under `app/local-plugins/` (CI-auto-discoverable).

Build pipeline:
- `.github/workflows/ci.yml` — lint + test + build on every push (Ubuntu)
- `.github/workflows/ios-bootstrap.yml` — manual one-time `cap add ios`
- `.github/workflows/ios-release.yml` — on tag push (`v*.*.*`); builds + signs + uploads to TestFlight via App Store Connect API
- Cert setup from Windows via openssl; guide in `docs/IOS-CERT-SETUP-WINDOWS.md`

**How to apply**: Don't suggest paying for a Mac unless GitHub Actions definitively fails. Version tags drive releases; manual App Store release is ON.
