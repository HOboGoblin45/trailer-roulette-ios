# App Store Strategy — Trailer Roulette

**Date**: 2026-04-25
**Decision**: Path C (original product) + Path A playback (SFSafariViewController on iOS)
**Status**: Locked

## The risk

Apple's App Review reliably rejects pure trailer-streaming and YouTube-wrapper apps under:
- **Guideline 4.2 — Minimum Functionality** ("limited user experience … not sufficiently different from a mobile browsing experience")
- **Guideline 5.2 — Intellectual Property** ("only include content that you created or that you have a license to use")

YouTube's ToS additionally prohibits "separating, isolating, or modifying" their video player.

A naive port of the existing web app would land squarely in this trap.

## The strategy

### Path C — original product
Build genuine app value beyond trailer playback. v1 ships:

1. **Watchlist** — mark trailers as "want to see"; persisted locally via `@capacitor/preferences`. Owned-by-user data the app holds independent of YouTube.
2. **Seen it / Skip it swipes** — left/right gesture during/after playback feeds a personal taste profile. Each swipe updates local affinity buckets (genre, decade, runtime). Future shuffles bias toward high-affinity buckets. **This surfacing logic is original IP that survives without YouTube.**

Plus the existing differentiators:
- Cycle/shuffle UX with the 90-second timer (a curated "TV-channel" feel — no competitor ships this)
- TMDB-driven metadata, genre/decade/runtime filters
- Cast/AirPlay integration

### Path A — playback mechanism
On iOS, tapping play opens the trailer in `SFSafariViewController` (via `@capacitor/browser`):
- Hosts YouTube's native player intact (compliant with ToS — no separation/isolation/modification)
- Returns the user to the app on dismiss
- Auto-closes after the 90-second cycle timer expires → next trailer loads

The web/casting build keeps the embedded iframe player. Apple doesn't review web.

## Why this passes review

- App's core value proposition is **personalized discovery**, not video hosting.
- Trailer playback is **one feature among many**, served through Apple's sanctioned in-app browser.
- Watchlist + taste profile + shuffle logic + curation UI are **original product** that survives without YouTube.
- Removing YouTube would change *one* feature (playback). The discovery loop, persisted user state, gesture model, and shuffle weighting all remain.
- See `research/why-this-app-is-original.md` for the paste-ready rebuttal memo if Apple pushes back.

## Tradeoffs accepted

- **Loss of programmatic "trailer ended" detection** on iOS (cross-origin limit inside `SFSafariViewController`). Worked around with the 90-second cycle timer + countdown UI. This is arguably better mobile UX since most users don't watch full trailers.
- **Cast SDK code is excluded** from the iOS bundle. iOS uses AirPlay via a custom Capacitor wrapper around `AVRoutePickerView`.
- **No accounts in v1**. Watchlist and taste profile live on-device only. Saves ~3 days of dev and avoids the Sign In with Apple requirement.

## Submission posture

When submitting, lead the description with:
1. Watchlist (legible to every reviewer)
2. Seen it/Skip it swipes + learned shuffle (original IP)
3. Filter/curation UX
4. *Then* trailer playback as a feature, not the headline

Avoid the words "YouTube," "free trailers," "watch movies free," "stream trailers" in the App Store listing — they trigger 5.2 review patterns.

Include TMDB attribution: *"This product uses the TMDB API but is not endorsed or certified by TMDB."*

## Plan B if rejected

Ordered by cost:
1. Add **Couple's Mode** — second swipe-overlay; "movies you both liked." ~3 days dev.
2. Add **Stats screen** — visualizes the taste profile. ~1 day.
3. Pivot to **Path B** — license JustWatch or Reelgood metadata feeds. ~2 weeks + ongoing cost.

See `research/why-this-app-is-original.md` for the rebuttal memo to send first before resorting to plan B.
