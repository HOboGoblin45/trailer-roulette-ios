# Reddit post drafts

Reddit hates self-promotion. Each post must follow the subreddit's rules; some require posting only on specific days or in specific weekly threads.

## r/iosapps — Maker Monday or Showcase Saturday

**Title** (one of these):
- "I built Trailer Roulette — a slot machine for movie trailers. No accounts, no tracking, just spin and save."
- "[Showcase] Trailer Roulette: trailers like channels, swipe for taste, watchlist on-device"

**Body**:
```
Solo indie dev here. I just shipped Trailer Roulette — a small iOS app for finding movies by spinning through hand-picked trailers. The core loop:

- Tap shuffle, watch, decide
- Swipe right if you'd watch it, left if not
- After ~10 swipes, future shuffles start biasing toward what you've liked
- Heart anything to save to a local watchlist

Things I focused on:
- Privacy posture: no accounts, no backend, no analytics SDKs. Apple's "Data Not Collected" nutrition label.
- Native feel inside Capacitor: SFSafariViewController for trailer playback, haptics on every gesture, AirPlay through a custom Capacitor plugin around AVRoutePickerView.
- Cycle timer (90s) instead of trying to detect when a trailer ends — turns out you can't easily do that across SFSafariViewController for compliance reasons, and the timer is a better mobile UX anyway.

Free, no ads. Feedback welcome — especially on whether the 90s cycle feels right.

App Store: https://apps.apple.com/app/trailer-roulette
Landing: https://trailerroulette.app
```

**Posting rules**: r/iosapps allows showcase posts; tag with `[Showcase]` or post on the appropriate weekly thread day. Mods are strict — read the sidebar before posting.

## r/movies — Don't post here for promotion

r/movies has a no-promotion rule. Don't post directly. Instead:
- Engage in "what should I watch" threads naturally — if Trailer Roulette would help, mention it without a link in the comment, link only on direct ask
- Run a giveaway via the r/movies mods (paid sticky) only if v1 gains traction

## r/SideProject — solid fit

**Title**: "Trailer Roulette — I made a slot machine for movie trailers (iOS, free)"

**Body**:
```
What it is: Spin through trailers like channels. Save what you love. Swipe past what you don't. App builds a private, on-device taste profile and biases future shuffles toward what you'll likely love.

Stack: Capacitor + React, single React codebase across web and iOS. Custom Swift plugin for AirPlay. ~6 weeks from "I have a web app" to "App Store live."

What I learned:
- App Review and YouTube ToS will both reject a "trailer player" framing. You have to position as a discovery product where playback is one feature, not the headline.
- Capacitor scrutiny under 4.2 is real but manageable if the app does something a browser bookmark genuinely can't (gestures, persistence, on-device ML-ish).
- Cloud Macs are surprisingly fine for $30/mo if you don't have a local Mac.

Happy to answer anything about the build.

🔗 https://trailerroulette.app
```

## r/iOSProgramming

Less promo-friendly; post a technical writeup focused on how you solved a specific problem.

**Title**: "Custom Capacitor plugin around AVRoutePickerView — full source"

**Body**: write a how-to with the AVRoutePlugin.swift code from `app/ios-native/`, and link to the app at the bottom as the "this is what I built it for" reference. Subreddit values learning material; lead with that.

## What to do if downvoted
- Don't argue
- Don't delete (looks worse)
- Reply once acknowledging the criticism with a real takeaway
- Move on
