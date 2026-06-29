# App Review rejection — response playbook

Pre-drafted Resolution Center replies for the 5 most likely rejection scenarios. Paste-ready. Each is rooted in the originality posture from `research/why-this-app-is-original.md`.

## How to respond in general

Keep replies:
- **Concise** (3–5 short paragraphs max)
- **Specific** (point at exact features, exact screens, exact code paths if relevant)
- **Calm** (Apple reviewers are humans doing a rote job; defensive tone hurts you)
- **Bring evidence** (attach screenshots, link to the app's About screen, reference the App Store description)

Apple's Resolution Center is a slow asynchronous medium — every reply costs 24–48h of review time. Make each one count.

---

## Scenario 1 — "App is primarily a YouTube player" (Guideline 4.2 / 5.2)

This is the single most likely rejection. Lead with this one.

**Response (paste into Resolution Center):**

```
Thank you for the review.

Trailer Roulette is a movie-discovery product, not a YouTube player. Trailer playback is one feature within a larger experience that includes:

1. **Era-spanning curation** — the feed samples a random year from each decade band (1970s–today) with per-era quality floors, then shuffles, so a single session spans the whole history of cinema. This stratified surfacing logic is original IP (app/src/lib/tmdb.js).
2. **Continuous "channel" playback** — a custom native plugin chains trailer→trailer in place, creating a lean-back TV-channel experience with no flash between videos (app/local-plugins/trailer-player/).
3. **Swipe-card discovery** — a draggable card (drag right to save, left to skip, tap to play) with fling physics and SAVE/SKIP stamps; a mobile-native interaction model built from scratch (app/src/components/SwipeCard.jsx).
4. **Watchlist** — users save movies locally, persisted across launches via @capacitor/preferences. No backend; user-owned data.
5. **Where to watch** — per-movie streaming availability turns a trailer into an actionable next step.
6. **One-tap AirPlay** — beams the feed to a TV via a native route picker.

Trailers play exclusively through YouTube's official IFrame embedded player, unmodified, hosted on a first-party https page in a native web view; the video streams directly from YouTube. We do not host, modify, separate, or redistribute trailer content, and we use only the player API's official events. We comply fully with YouTube's Terms of Service.

Removing YouTube would not eliminate Trailer Roulette. The curation engine, channel playback, swipe interface, watchlist, and where-to-watch all run on-device and are independent of any external service.

The About screen displays the required TMDB attribution. The privacy nutrition label is "Data Not Collected."

Please reconsider. Happy to provide a video walkthrough of the original features if helpful.
```

**Additionally**: if the reviewer asks for a video, record a 60-second screen recording on TestFlight showing the era-spanning shuffle (old + new trailers back to back), the swipe-card save/skip, continuous in-place "channel" playback, and one-tap AirPlay. That's the most legible demonstration of original IP.

---

## Scenario 2 — "Privacy policy not accessible" or "Data collection unclear"

Often this is just a broken URL or a confused reviewer.

**Response:**

```
Thank you for flagging this. Our privacy policy is accessible at:

https://<your-vercel-url>.vercel.app/privacy

The policy is current and confirms that Trailer Roulette does not collect any user data. All app state (watchlist, taste profile, settings) is stored locally on the device using Apple's standard Preferences API.

The privacy nutrition label has been declared as "Data Not Collected" across all data categories. We have no backend, no analytics SDKs, no advertising IDs, and no third-party tracking.

Please let us know if there's a specific data point or category you'd like more clarity on.
```

If the URL is genuinely broken, fix Vercel deployment first, THEN reply with the working URL.

---

## Scenario 3 — "App is impersonating another app" or "Confusingly similar to another app"

Less likely, but possible if Apple's matching algorithm flags us against an existing trailer app.

**Response:**

```
Thank you for the review. Trailer Roulette is an original product not affiliated with any other app on the App Store.

Differentiation:
- The era-spanning "channel" experience — stratified sampling across every decade of cinema with continuous in-place playback — is the core of Trailer Roulette and is implemented entirely in our own code (app/src/lib/tmdb.js, app/local-plugins/trailer-player/).
- The swipe-card discovery interface (drag to save/skip, tap to play) with our own fling physics is original (app/src/components/SwipeCard.jsx).
- The combination of an all-eras trailer channel, a local Watchlist, where-to-watch, and one-tap AirPlay — with no account and no tracking — is our own product surface.
- Branding (name, logo, color palette) is unique. The icon is a custom-designed gold film reel on a dark navy background.

If the reviewer can identify the specific app the listing is being compared to, we'd be happy to provide a side-by-side differentiation document.
```

---

## Scenario 4 — "Crashes on launch" / "App doesn't function as expected"

Almost always a real bug, not a strategy problem.

**Response:**

```
Thank you for the report. We've investigated and identified the crash; a fix is in build [N+1], which we'll submit shortly. The crash was caused by [specific cause based on the symbolicated stack from App Store Connect → Analytics → Crashes].

We've also added regression tests for the failure mode to our CI pipeline.

The new build will be available for review within 24 hours. Apologies for the inconvenience.
```

**Action**: don't argue. Symbolicate the crash, fix it, increment build, resubmit. Most v1 first-builds have at least one crash.

---

## Scenario 5 — "Need more information about content rights"

Apple sometimes pulls this when an app uses third-party APIs.

**Response:**

```
Thank you for the inquiry.

Trailer Roulette uses two external services, both via their public APIs and within their respective terms of service:

1. **TMDB (The Movie Database)** — https://www.themoviedb.org. Movie metadata (titles, posters, descriptions) is fetched via TMDB's public API. The required attribution is displayed in our App Store description footer and in-app on the About screen: "This product uses the TMDB API but is not endorsed or certified by TMDB."

2. **YouTube** — Trailers play through YouTube's official IFrame embedded player, hosted on a first-party https page in a native web view; the video streams directly from YouTube to its own player. We do not download, modify, separate audio from video, strip ads, or otherwise alter YouTube content. Our usage complies with YouTube's Terms of Service (https://www.youtube.com/static?template=terms).

We do not host, redistribute, or claim ownership of any third-party content. Trailer Roulette adds value through original curation (era-spanning stratified sampling), continuous channel playback, a swipe-card discovery interface, and a local watchlist.

If specific documentation would be helpful, we can provide:
- TMDB API terms acceptance
- A statement that we do not host video content
- Source code excerpts showing the embedded-player-only playback path
```

---

## Scenario 6 (bonus) — "Demo account credentials missing"

For apps with auth, Apple wants test creds. We have no auth.

**Response:**

```
Trailer Roulette does not require any account, login, or credentials. The app launches directly into the shuffle screen and is fully usable without any authentication.

To test:
1. Tap the app icon
2. Wait for the trailer queue to populate (~2 seconds)
3. Tap the card to play the trailer; it opens fullscreen and auto-advances to the next when it ends
4. Swipe the card right to save, left to skip (or use the ♥ / ✕ buttons)
5. Tap the AirPlay button to beam the feed to a TV
6. Tap the bookmark icon in the top bar to view your watchlist

No demo account is necessary. The app contains no auth flow.
```

---

## What NOT to do in any response

- Don't quote Apple's guidelines back at them. They wrote the guidelines; pointing at them looks combative.
- Don't say "we've already passed review on a similar app." Each app is reviewed independently.
- Don't bring up other apps that "got approved with worse content." This is the most counterproductive move.
- Don't make legal threats or invoke lawyers. The Resolution Center is not a legal venue.
- Don't reply 5 times. One thoughtful reply per round; if rejected again, escalate via the contact-us form ONCE for human review.

## When to escalate to a human reviewer

If you've been rejected twice with the same boilerplate:
1. Reply once more with a comprehensive response (combine relevant scenarios above)
2. If rejected a third time: use App Store Connect → Resolution Center → Request Phone Call. Apple will schedule a 20-minute call with a real person. This usually clears confusion that text exchanges can't.

Phone calls require ~3-day lead time; only escalate when text is genuinely failing.

## Track every rejection

Maintain `docs/review-history.md` with:

| Date | Build | Rejection citation | Response template used | Outcome |
|------|-------|--------------------|-----------------------|---------|
| TBD | 1.0.0 build 1 | | | |

Two reasons:
1. If a future submission gets the same rejection, you'll have a paper trail of resolutions.
2. If a pattern emerges across builds, it's a product issue, not a review issue.
