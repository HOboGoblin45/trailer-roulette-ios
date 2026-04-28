# ADR-0004 — Bundle identifier

**Date**: 2026-04-25
**Status**: Accepted

## Decision
Bundle ID: **`app.trailerroulette.ios`**

## Rationale
- Domain-first format anticipates owning `trailerroulette.app` (the `.app` TLD already exists; reservation is part of Phase 1's "next 4 actions")
- Reads as "the iOS app at trailerroulette.app" — clean handoff for Universal Links / Apple App Site Association in v1.1+
- Avoids tying the app identity to a personal name (`com.cresci.*`) so the project can change ownership, take co-founders, or re-brand without identifier churn
- Future-proof for additional Apple platforms (see Companion identifiers)

## Companion identifiers
| Item | Value |
|------|-------|
| App Store name | "Trailer Roulette" (fallback: "Trailer Roulette: Cinema Reel") |
| App Store SKU | `trailerroulette-ios-v1` |
| Team ID | TBD — assigned at Apple Developer enrollment |
| Apple ID (App Store Connect) | `crescicharles@gmail.com` |
| Display name (Info.plist) | "Trailer Roulette" |

## Future-proofing
| Future build | Bundle ID |
|--------------|-----------|
| Mac Catalyst | `app.trailerroulette.macos` |
| iPad-only build | `app.trailerroulette.ipad` |
| watchOS extension | `app.trailerroulette.ios.watchkitapp` |
| tvOS | `app.trailerroulette.tvos` |

## Pre-flight
Before creating the App ID in Apple Developer:
- [ ] Confirm `app.trailerroulette.ios` is not already registered to another team (Apple will surface this on creation)
- [ ] Confirm the domain `trailerroulette.app` is owned (or purchase before Universal Links work in v1.1)
- [ ] Confirm App Store name "Trailer Roulette" is available on App Store Connect
