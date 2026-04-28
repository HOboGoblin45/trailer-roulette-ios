# Test plan — Trailer Roulette v1

Three layers, in order of cost and yield.

## 1. Manual smoke (every commit)

After any change to React or capacitor.config.ts:
```bash
cd app
npm run dev
# verify on web at localhost
npm run build
npx cap sync ios
# Build on Mac, smoke-test on iPhone Simulator
```

Acceptance: `BUG-BASH-CHECKLIST.md` "Cold-launch path" + "Player" sections all green.

## 2. Snapshot QA (per device size, per build)

Use `scripts/screenshot.sh` to capture the same 5 screens on each required simulator size, compare visually against the previous build. Diff manually until v1.1, when we can wire visual regression tooling.

Required simulators:
- iPhone 15 Pro Max (6.7-inch)
- iPhone 11 Pro Max (6.5-inch — yes, still required for the App Store)
- iPhone SE (3rd gen) (5.5-inch class — narrow stress test)
- iPad Pro 12.9" (4th gen)

Required screens:
1. Shuffle (player + meta + filters)
2. Watchlist with 6+ items
3. About / Settings
4. Filters interaction (Action + 2010s active)
5. Up Next sheet expanded

## 3. Real-device acceptance (TestFlight internal group)

Run `BUG-BASH-CHECKLIST.md` end-to-end on each tester's primary device. Required signoffs before external rollout:
- Charlie's daily-driver iPhone
- Girlfriend's iPhone
- One small iPhone (SE or mini if available)
- One iPad if iPad support is on by submission

## What we explicitly don't test in v1

- **Voice control / Switch Control** — accessibility audit deferred to v1.1; HIG compliance for tap targets is enforced (44pt min) but full a11y review is a v1.1 task.
- **Localized content** — v1 is en-US only; the UI strings are in components, ready to extract into a localization pass for v1.2.
- **Push notifications** — not in v1.
- **In-app purchases** — not in v1; Apple won't ask if we don't declare the capability.

## Crash & error reporting strategy

v1 uses Apple's built-in crash reporting (TestFlight + App Store Connect). No third-party SDK. After Phase 6 launch, monitor App Store Connect → Apps → Trailer Roulette → Analytics → Crashes daily for the first 2 weeks.

If we see a recurring crash pattern, file in `docs/bugs.md` with the symbolicated stack and ship a hotfix.
