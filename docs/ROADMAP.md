# Trailer Roulette iOS — Roadmap

Current canonical state of the project. Updated 2026-04-25 for Apple Developer ✅, no-Mac path via GitHub Actions, scaffold-as-v1, no custom domain.

## Status grid

| # | Phase | Status | Walkthrough |
|---|-------|--------|-------------|
| 1 | Strategy & Risk Mitigation | ✅ Complete | docs/APP-STORE-STRATEGY.md |
| 2 | Apple Dev Account & Project Setup | ⏳ External actions pending | docs/PHASE-2-LAUNCH.md |
| 3 | Mobile-First Code Adaptation | 📦 Scaffold delivered | docs/INTEGRATION-GUIDE.md (only if merging) |
| 4 | Native Polish & Configuration | 📦 Pre-staged | docs/NATIVE-POLISH-CHECKLIST.md |
| 5 | Testing & Build (TestFlight) | 📋 Materials ready | docs/TEST-PLAN.md, BUG-BASH-CHECKLIST.md |
| 6 | App Store Submission | 📦 Final copy + checklist | docs/SUBMISSION-CHECKLIST.md |
| 7 | Launch & Post-Launch | 📦 Press kit + 30-day playbook | press-kit/, docs/POST-LAUNCH-30-DAYS.md |

**Realistic ship window**: 5–8 weeks from 2026-04-25 → **2026-05-30 to 2026-06-20**.

## Critical path forward (Charlie's actions)

```
[Phase 2 — your browser + Windows]

   App Store Connect setup ─┐
                             ├──> GitHub Actions iOS Bootstrap ──> First TestFlight build
   GitHub repo push ─────────┤                                       │
                             │                                       ▼
   Vercel deploy ────────────┤                                   Real-iPhone bug bash
                             │                                       │
   Cert generation ──────────┘                                       ▼
                                                                   Submit v1.0
                                                                       │
                                                                       ▼
                                                              [Phase 6 — Apple review wait]
                                                                       │
                                                                       ▼
                                                                  Approved + Released
                                                                       │
                                                                       ▼
                                                              [Phase 7 — soft launch + scale]
```

## Phase 1 — Strategy ✅
All artifacts in `decisions/` and `research/`.

## Phase 2 — Setup (Mac-free path)

External (you):
- [x] Apple Developer Program ($99) ✅
- [ ] App Store Connect: create app record (`docs/APP-STORE-CONNECT-SETUP.md`)
- [ ] GitHub: push scaffold (`docs/SCAFFOLD-TO-GITHUB.md`)
- [ ] Vercel: deploy landing page (`landing-page/README.md`)
- [ ] Apple Developer: generate certs from Windows (`docs/IOS-CERT-SETUP-WINDOWS.md`)
- [ ] GitHub Secrets: add 9 secrets + 1 variable

Automated (GitHub Actions):
- [ ] `ci.yml` runs lint + test + build on every push
- [ ] `ios-bootstrap.yml` (manual one-time) — runs `cap add ios`, commits result
- [ ] `ios-release.yml` (on tag push) — builds + signs + uploads to TestFlight

## Phase 3 — Code adaptation 📦
Complete scaffold delivered. No work needed unless merging with an existing codebase (in which case see `docs/INTEGRATION-GUIDE.md`).

## Phase 4 — Native polish
Mostly pre-staged in CI:
- [x] App icon SVG → `assets/icon-master-1024.svg`
- [x] Launch screen → `assets/launch-screen.svg`
- [x] Info.plist additions (auto-merged by `ios-bootstrap.yml`)
- [x] Privacy nutrition label spec → `docs/PRIVACY-NUTRITION-LABEL.md`
- [ ] Generate icon set: CI does this on first build
- [ ] Visual QA on iPhone Simulator (in CI logs / TestFlight on real device)

## Phase 5 — TestFlight
- [ ] First build uploaded via `ios-release.yml`
- [ ] Internal testing group seeded (you + girlfriend)
- [ ] `BUG-BASH-CHECKLIST.md` end-to-end on real iPhone
- [ ] 3+ days stability before promoting to external group
- [ ] External testers (10–20)

## Phase 6 — Submission
- [x] Final App Store copy in `store-listing/`
- [x] Reviewer notes drafted in `docs/SUBMISSION-CHECKLIST.md`
- [x] Originality memo ready as PDF attachment
- [x] Rejection response templates ready (`docs/REJECTION-RESPONSES.md`)
- [ ] Screenshots captured per device size (after first TestFlight build is stable)
- [ ] Privacy policy URL pasted (Vercel)
- [ ] Submit for Review

## Phase 7 — Launch
- [x] Landing page (`landing-page/`)
- [x] Privacy policy hostable HTML (`landing-page/privacy.html`)
- [x] Press kit drafts (`press-kit/`)
- [x] 30-day post-launch playbook (`docs/POST-LAUNCH-30-DAYS.md`)
- [ ] Soft launch in Canada or Australia
- [ ] Day 7 expand to global
- [ ] Tweet thread, Product Hunt, Reddit, friends-and-family email

## v1.1+ (post-launch)
- `docs/V1.1-SPEC.md` — Couple's Mode + Stats screen, ~6 weeks after v1.0 lands
- v1.2 candidates: custom playlists, localization, Multipeer Connectivity for couple's mode
- v2 candidate: native Swift rewrite if traction warrants

## Continuous (post-launch)
- [ ] Daily App Store Connect crash + review monitoring
- [ ] Weekly metrics review against `docs/POST-LAUNCH-30-DAYS.md`
- [ ] Monthly review of v1.1 progress
- [ ] Annual: renew code-signing cert + provisioning profile (calendar reminder set for 2027-04-25)
