# Why Trailer Roulette is original — App Review rebuttal memo

**Purpose**: paste-ready response if Apple rejects under 4.2 ("Minimum Functionality") or 5.2 ("YouTube wrapper" / IP). Drafted before submission so we don't have to write it under time pressure.

## Short version (for the App Store Connect resolution center reply box)

> Trailer Roulette is a personalized movie-discovery product. Trailer playback is a single feature within a larger experience that includes original curation logic, persisted user state (Watchlist), gesture-based reaction capture (Seen it / Skip it swipes), and a learned on-device taste profile that drives shuffle weighting. Trailers are played via Apple's `SFSafariViewController` hosting YouTube's official embeddable player — fully compliant with YouTube's Terms of Service and Apple's HIG. Removing YouTube would not eliminate the product; the discovery loop, watchlist, taste profile, and curation UI are independent IP that runs entirely on-device.

## What's original about Trailer Roulette

1. **Shuffle / cycle UX** — curated 90-second auto-advance creates a "TV channel" feel. No competitor (Reelgood, JustWatch, MovieFone) ships this. The cycle timer, countdown UI, and queue management are entirely our code.
2. **Watchlist with local persistence** — user-owned data via `@capacitor/preferences`. No backend. No tracking. The user maintains a personal "want to see" library that survives independent of any external service.
3. **Seen it / Skip it gestures** — left/right swipes during or after playback record the user's reaction. Each swipe updates a local taste profile (genre, decade, runtime affinity). The gesture interaction model is mobile-native and not present in the web build.
4. **Learned shuffle weighting** — once the user has provided ≥10 reactions, future shuffles are biased toward the user's high-affinity buckets while preserving a configurable exploration percentage. The surfacing algorithm is original and runs entirely on-device. No data leaves the user's iPhone.
5. **Filter and curation UI** — genre, decade, runtime, and year filters drive a shaped trailer queue, not a flat feed. The filter combination logic is our code.
6. **Haptic feedback** — shuffle, skip, and swipe each have distinct haptic signatures. Not possible on the web.

## What we do not do
- We do **not** host, cache, or redistribute YouTube content.
- We do **not** modify YouTube's embeddable player.
- We do **not** separate audio or video components.
- We do **not** display YouTube ads in unauthorized surfaces (the player handles its own ads).
- We do **not** have user accounts or transmit user data anywhere.
- We do **not** bypass any rate limit or geographic restriction.

## Compliance posture

| Area | Posture |
|------|---------|
| Apple HIG | Tap targets ≥ 44×44pt; safe-area insets respected; native dialogs and haptics; standard navigation patterns |
| Apple Privacy | No data collection; privacy nutrition label = "Data Not Collected"; privacy policy URL provided |
| YouTube ToS | Trailers play exclusively via YouTube's official embeddable player inside `SFSafariViewController`. See `research/youtube-tos-embedding.md` |
| TMDB ToS | Required attribution present in About screen and App Store description footer |

## Feature inventory (for the rebuttal table)

| Feature | Original to us? | Where it lives |
|--------|------------------|----------------|
| Shuffle / cycle UX with 90s timer | ✅ | App shell |
| Watchlist | ✅ | Local storage |
| Seen it / Skip it swipes | ✅ | Player overlay |
| Taste profile (genre/decade/runtime affinity) | ✅ | Local storage |
| Weighted shuffle algorithm | ✅ | App logic |
| Genre / decade / runtime / year filters | ✅ | App UI |
| Haptic feedback | ✅ | Native iOS |
| Trailer playback | ❌ — via YouTube's official player | SFSafariViewController |
| Movie metadata | ❌ — via TMDB API | TMDB |

The feature column shows the product is overwhelmingly ours; trailer playback is a single line, served through Apple's own sanctioned web view.

## If Apple still rejects (escalation ladder)

Ordered by cost and time:
1. **Add Couple's Mode** — second swipe-overlay; "movies you both liked" output. ~3 days dev.
2. **Add Stats screen** — visualizes the taste profile; visibly app-original. ~1 day.
3. **Pivot to Path B** — license JustWatch / Reelgood metadata feeds for legal cover and richer surfaces. ~2 weeks + ongoing cost.

Send this memo first before resorting to step 1.
