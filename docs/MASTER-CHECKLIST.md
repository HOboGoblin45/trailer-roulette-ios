# Master checklist — soup to nuts

Single source of truth for everything that has to happen between now and "Trailer Roulette is in the App Store." Strike through as you complete.

## Phase 1 — Strategy & Risk Mitigation ✅ COMPLETE
- [x] Folder structure
- [x] App Store strategy (Path C + Path A playback)
- [x] Apple 4.2 / 5.2 research
- [x] YouTube ToS research
- [x] Originality memo
- [x] Tech stack ADR (Capacitor)
- [x] Bundle ID ADR (`app.trailerroulette.ios`)
- [x] v1 feature set ADR (Watchlist + Seen-it/Skip-it)
- [x] Privacy policy seed
- [x] Setup outline

## Phase 2 — Apple Developer + Project Setup (Mac-free path)
**Primary walkthrough**: `docs/PHASE-2-LAUNCH.md` (overview)
**Sub-walkthroughs**:
- `docs/APP-STORE-CONNECT-SETUP.md` — Safari
- `docs/SCAFFOLD-TO-GITHUB.md` — push from Windows
- `docs/IOS-CERT-SETUP-WINDOWS.md` — generate signing certs from Windows
- `landing-page/README.md` — Vercel deploy
- `.github/workflows/README.md` — CI/CD overview

External dependencies:
- [x] Pay $99 → Apple Developer Program enrollment ✅ (done 2026-04-25)
- ~~Mac~~ — **not needed**; using GitHub Actions macOS runners
- ~~Domain~~ — **deferred to post-launch**; using Vercel default subdomain for v1

Browser-based App Store Connect (~20 min):
- [ ] App ID `app.trailerroulette.ios` registered
- [ ] App record created
- [ ] App name "Trailer Roulette" reserved
- [ ] Categories set (Entertainment + Lifestyle)
- [ ] Pricing set to Free
- [ ] App Privacy declared as "Data Not Collected"
- [ ] Team ID saved in password manager

GitHub setup (~10 min):
- [ ] Private repo `trailer-roulette-ios` created
- [ ] `app/` folder pushed from Windows
- [ ] `ci.yml` workflow passes (Actions tab green)
- [ ] `.env.local` confirmed gitignored

Vercel deploy (~5 min):
- [ ] `landing-page/` deployed
- [ ] Live `https://*.vercel.app/privacy` URL noted
- [ ] URL pasted into App Store Connect → App Privacy → Privacy Policy URL
- [ ] Same URL added as GitHub Variable `VITE_PRIVACY_POLICY_URL`

iOS code-signing artifacts from Windows (~30 min):
- [ ] Distribution cert generated (openssl in Git Bash)
- [ ] Cert downloaded from Apple Developer
- [ ] P12 built locally
- [ ] Provisioning profile created at developer.apple.com
- [ ] App Store Connect API key generated + .p8 downloaded
- [ ] All 9 secrets added to GitHub repo (see `IOS-CERT-SETUP-WINDOWS.md` Step 9)

iOS bootstrap (one-time, automated, ~15 min):
- [ ] Manually trigger `ios-bootstrap.yml`
- [ ] Workflow commits `app/ios/` back to repo
- [ ] `git pull` to fetch the bot's commit

First release to TestFlight (~20 min, automated):
- [ ] `git tag v1.0.0 && git push --tags`
- [ ] `ios-release.yml` runs and uploads to TestFlight
- [ ] Apple emails "Ready to Test"
- [ ] Install on iPhone via TestFlight app
- [ ] Run `BUG-BASH-CHECKLIST.md` Cold Launch + Player sections

## Phase 3 — Code adaptation ✅ PRE-STAGED
All new source files written in the workspace folder. Just merge with existing repo per `INTEGRATION-GUIDE.md`.
- [ ] `app/capacitor.config.ts` in repo
- [ ] All `app/src/lib/*.js` in repo
- [ ] All `app/src/components/*.jsx` in repo
- [ ] `app/src/styles/*.css` in repo
- [ ] `app/ios-native/*` files in repo
- [ ] Existing Player.jsx renamed → Player.web.jsx
- [ ] Existing TrailerRoulette.jsx merged with scaffold version

## Phase 4 — Native polish
**Checklist**: `docs/NATIVE-POLISH-CHECKLIST.md`
- [ ] App icon generated (`@capacitor/assets`)
- [ ] Launch screen set in Xcode
- [ ] Info.plist keys all merged
- [ ] Privacy nutrition label declared (see `docs/PRIVACY-NUTRITION-LABEL.md`)
- [ ] Visual QA passes on SE / 15 / 15 Pro Max / iPad Pro

## Phase 5 — Testing & Build
**Plan**: `docs/TEST-PLAN.md` · **Bash**: `docs/BUG-BASH-CHECKLIST.md`
- [ ] First `./scripts/build-ios.sh` produces an .xcarchive
- [ ] First TestFlight upload (internal group)
- [ ] Bug-bash checklist green on at least one real device
- [ ] 3+ days of stability without internal-tester crashes
- [ ] External TestFlight group seeded with 10–20 testers

## Phase 6 — App Store Submission
**Checklist**: `docs/SUBMISSION-CHECKLIST.md`
- [ ] All metadata filled in App Store Connect
- [ ] Screenshots in all required sizes (`assets/screenshots/specs.md`)
- [ ] Privacy policy hosted at `https://trailerroulette.app/privacy`
- [ ] App Review Information notes pasted
- [ ] Originality memo (`research/why-this-app-is-original.md`) exported as PDF and attached
- [ ] **Submit for Review**

## Phase 7 — Launch & Post-Launch
- [ ] Soft launch in Canada or Australia
- [ ] Day 1 stability check
- [ ] Day 7 expand to all territories
- [ ] Landing page deployed at `https://trailerroulette.app`
- [ ] Privacy policy live at `/privacy`
- [ ] Product Hunt launch (`press-kit/product-hunt-assets.md`)
- [ ] Reddit posts (`press-kit/reddit-post-drafts.md`)
- [ ] Twitter thread (`press-kit/tweet-launch-thread.md`)
- [ ] Email blast (`press-kit/email-friends-and-family.md`)

## Continuous (post-launch)
- [ ] Daily App Store Connect crash + review monitoring
- [ ] Weekly download summary
- [ ] Monthly v1.x roadmap review
- [ ] v1.1: Couple's Mode + Stats screen

## Hard cost summary (updated 2026-04-25 for GitHub Actions path)
| Item | Cost | Recurring | Status |
|------|------|-----------|--------|
| Apple Developer Program | $99 | Annual | ✅ Paid |
| GitHub Actions macOS minutes | $0 | Free within 2,000 min/mo for private repos (way more than needed) | ⏳ Pending |
| Vercel hosting (landing page) | $0 | Free tier indefinitely | ⏳ Pending |
| GitHub (private repo) | $0 | Free for private repos | ⏳ Pending |
| ~~Cloud Mac~~ | $0 | Not needed (fallback only) | ⏭️ Skipped |
| Domain (post-launch only) | ~$15 | Annual | ⏭️ Deferred |
| Icon designer (optional) | $0 (we have an SVG icon) | One-time | ✅ Have one |
| Music license for app preview (optional) | $0–50 | One-time | ⏭️ Optional |
| **Total to ship v1** | **$99** | | |

## Time budget summary
| Phase | Wall time | Active hours |
|-------|-----------|--------------|
| 1 | 2–3 days | 4–6 ✅ done |
| 2 | 3–7 days (Apple wait) | 2–3 |
| 3 | 1–2 weeks | 30–50 (mostly merging the pre-staged scaffold) |
| 4 | 3–5 days | 10–15 |
| 5 | 1–2 weeks | 15–25 |
| 6 | 2–3 weeks (review) | 10–15 |
| 7 | ongoing | varies |
| **Total** | **6–10 weeks** | **~70–110 active hours** |

Phase 3 active-hours estimate is on the high end of the 30–50 range from the original roadmap because we shipped a complete scaffold; the merge should land closer to 15–20 hours if the existing repo is in good shape.
