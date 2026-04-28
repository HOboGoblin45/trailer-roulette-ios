# ADR-0001 — Tech stack: Capacitor

**Date**: 2026-04-25
**Status**: Accepted
**Decider**: Charlie Cresci

## Context
Trailer Roulette exists as a working React web app. We need an iOS App Store presence. Three viable stacks were evaluated:

| Stack | Pros | Cons |
|-------|------|------|
| **Capacitor** (wrap existing React) | Reuses ~95–100% of code; ships in days | WebView-based; under more 4.2 scrutiny |
| **Expo / React Native** | Same React mental model; truer native | 2–3 week UI rewrite |
| **Native Swift** | Best perf; App Review favorite | 6–8 week full rewrite |

## Decision
**Capacitor.**

## Rationale
- Reuses ~95–100% of existing React code as the iOS shell
- Time-to-store is days, not weeks
- Charlie is solo dev on Windows; minimizing rewrite is critical
- Cast SDK / AirPlay was already going to be platform-conditional, so per-platform playback abstraction was inevitable
- If the app succeeds, a native rewrite is a v2 problem worth having

## Consequences
- **Positive**: single React codebase across web, casting build, and iOS. Faster iteration. Bug fixes apply everywhere.
- **Negative**: Apple reviewers scrutinize WebView-heavy apps under 4.2. Mitigated by `decisions/0003-v1-feature-set.md` (Watchlist + Seen it/Skip it as native-feeling original IP) and `docs/APP-STORE-STRATEGY.md`.
- **Negative**: performance ceiling lower than native. Trailer-shuffle UX is light, so unlikely to hit it.

## Revisit if
- App is approved and gains traction → consider Swift rewrite for v2
- WebView itself causes specific App Review rejection (rather than a feature gap) → reconsider React Native
