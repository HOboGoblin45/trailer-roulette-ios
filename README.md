# Trailer Roulette · iOS

<!-- Once you push, replace <your-handle> with your GitHub username; badges go live -->
<!-- ![CI](https://github.com/<your-handle>/trailer-roulette-ios/actions/workflows/ci.yml/badge.svg) -->
<!-- ![iOS Release](https://github.com/<your-handle>/trailer-roulette-ios/actions/workflows/ios-release.yml/badge.svg) -->

End-to-end production workspace for taking Trailer Roulette to the iOS App Store **without owning a Mac**.

**Target ship**: 5–8 weeks from 2026-04-25.
**Hard cost**: $99 (Apple Developer Program). Everything else is free.

## 🎯 If you're starting today
Open [`docs/WHAT-TO-DO-NEXT.md`](docs/WHAT-TO-DO-NEXT.md) — it's the single ordered list of 7 actions, ~90 minutes of work, the rest is automated waiting.

Run `scripts/preflight.ps1` from PowerShell before your first push to catch any setup issues.

## What's true today
- ✅ Apple Developer Program approved
- 📦 Complete Capacitor + React scaffold delivered (`app/`)
- 📦 GitHub Actions iOS build pipeline ready (`.github/workflows/`)
- 📦 All App Store metadata, originality memo, rejection-response templates ready
- 📋 4 walkthroughs ready for you to execute (App Store Connect, GitHub push, cert setup, Vercel deploy)

## Workspace map

```
Trailer Roulette/
├── README.md ……………………………………… you are here
├── CONTRIBUTING.md, CODE_OF_CONDUCT.md, LICENSE
├── docs/  (18 docs)
│   ├── MASTER-CHECKLIST.md ………… single source of truth, top to bottom
│   ├── PHASE-2-LAUNCH.md ………… Mac-free pipeline overview
│   ├── APP-STORE-CONNECT-SETUP.md  Safari-only walkthrough
│   ├── SCAFFOLD-TO-GITHUB.md ……… push from Windows
│   ├── IOS-CERT-SETUP-WINDOWS.md   ⭐ generate signing certs without a Mac
│   ├── ROADMAP.md, SETUP.md, PRIVACY-POLICY.md
│   ├── PRIVACY-NUTRITION-LABEL.md, NATIVE-POLISH-CHECKLIST.md
│   ├── BUG-BASH-CHECKLIST.md, TEST-PLAN.md, TESTFLIGHT-NOTES.md
│   ├── SUBMISSION-CHECKLIST.md
│   ├── REJECTION-RESPONSES.md ……… 6 paste-ready replies for likely rejections
│   ├── V1.1-SPEC.md ……………………… Couple's Mode + Stats screen
│   ├── POST-LAUNCH-30-DAYS.md ………… day-by-day playbook
│   ├── INTEGRATION-GUIDE.md ……… (only if merging into existing repo)
│   ├── CLOUD-MAC-SETUP.md ………… (fallback only — not the primary path)
│   └── bugs.md ………………………………… active bug log starting Phase 5
├── decisions/ ………………………………… 4 ADRs (stack, path, features, bundle ID)
├── research/ ……………………………………… 5 docs (Apple 4.2/5.2, YouTube ToS, competitors, originality memo)
├── app/ ……………………………………………… complete Capacitor + React + Vite scaffold
│   ├── package.json, capacitor.config.ts, vite.config.js
│   ├── eslint.config.js, vitest.config.js
│   ├── src/ (App + components + lib + styles + __tests__)
│   ├── local-plugins/airplay-plugin/ … custom Capacitor plugin (Swift+ObjC)
│   └── ios-native/ ……………………… (deprecated; use local-plugins/ instead)
├── assets/  (icon SVG, launch screen SVG, screenshot specs)
├── store-listing/ ……………………… final App Store copy
├── landing-page/ ……………………… single-folder Vercel-deployable site
├── press-kit/ …………………………… PH, Reddit, X, friends-and-family launch text
├── scripts/ ………………………………… build-ios.sh + screenshot.sh (run on Mac if you have one)
└── .github/
    ├── workflows/   ………… 3 GitHub Actions pipelines
    ├── ISSUE_TEMPLATE/   … bug + feature request
    └── PULL_REQUEST_TEMPLATE.md
```

## The Mac-free pipeline

```
You (Windows) → push code → GitHub repo
                                ↓
                  GitHub Actions macOS runner (free)
                       ↓        ↓        ↓
                    cap sync   pod    archive + sign
                       ↓
                  upload to TestFlight via App Store Connect API
                       ↓
                  Apple emails you → install on iPhone via TestFlight
```

You never see Xcode. Apple's CI runs Xcode for you, ~15 minutes per build, free within GitHub's monthly limits (2,000 min/mo for private repos).

## Locked decisions
| # | Decision | ADR |
|---|----------|-----|
| 1 | Stack: **Capacitor** (wrap React) | [decisions/0001-tech-stack.md](decisions/0001-tech-stack.md) |
| 2 | Strategy: **Path C + Path A playback** | [decisions/0002-app-store-path.md](decisions/0002-app-store-path.md) |
| 3 | v1 features: **Watchlist + Seen it/Skip it** | [decisions/0003-v1-feature-set.md](decisions/0003-v1-feature-set.md) |
| 4 | Bundle ID: **`app.trailerroulette.ios`** | [decisions/0004-bundle-id.md](decisions/0004-bundle-id.md) |
| 5 | Build path: **GitHub Actions macOS runners** (no Mac needed) | [docs/PHASE-2-LAUNCH.md](docs/PHASE-2-LAUNCH.md) |
| 6 | Hosting: **Vercel default subdomain** for v1; custom domain post-launch | [landing-page/README.md](landing-page/README.md) |

## Where to start

Walk these in order. Each one runs in your browser or PowerShell on Windows.

1. **[`docs/APP-STORE-CONNECT-SETUP.md`](docs/APP-STORE-CONNECT-SETUP.md)** (~20 min) — register App ID, create app record
2. **[`docs/SCAFFOLD-TO-GITHUB.md`](docs/SCAFFOLD-TO-GITHUB.md)** (~10 min) — push the workspace to GitHub
3. **[`landing-page/README.md`](landing-page/README.md)** (~5 min) — `vercel --prod` from Windows
4. **[`docs/IOS-CERT-SETUP-WINDOWS.md`](docs/IOS-CERT-SETUP-WINDOWS.md)** (~30 min) — generate signing certs from Windows
5. **GitHub → Actions → "iOS Bootstrap" → Run workflow** (~15 min, automated)
6. **`git tag v1.0.0 && git push --tags`** (~20 min, automated) — first TestFlight build

Total time-to-first-build: ~100 minutes of your work + ~35 minutes of Apple/Vercel/GitHub Actions automation.

## What I cannot do for you
- Pay Apple
- Type your phone number for Apple's identity verification (already done ✅)
- Decide what features ship in v1.1 (you have my recommendation in `docs/V1.1-SPEC.md`)
- Hold the line when Apple rejects (you have my templates in `docs/REJECTION-RESPONSES.md`)
- Test on a real iPhone (you'll need TestFlight on your own iPhone)

## Verifications already done
- [x] All 23 React/JS source files parse via Babel (no syntax errors)
- [x] All XML/SVG well-formed
- [x] Bash scripts pass `bash -n` syntax check
- [x] JSON files valid
- [x] Swift / Obj-C brace balance (10/10 in plugin)
- [x] ESLint flat config in place
- [x] Vitest config + tests for `shuffleWeighting`, `tasteProfile`, `youtube`

## When something breaks
Check `docs/MASTER-CHECKLIST.md` for the canonical order. If you hit a wall, ping me with the error and what you were trying to do.
