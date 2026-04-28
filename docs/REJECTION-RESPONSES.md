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

Trailer Roulette is a personalized movie-discovery product, not a YouTube player. Trailer playback is one feature within a larger experience that includes:

1. **Watchlist** — users save trailers locally; persisted across launches via @capacitor/preferences. No backend; user-owned data.
2. **Seen it / Skip it gestures** — left/right swipes during/after playback record reactions; this is a mobile-native gesture model not present in any web alternative.
3. **On-device taste profile** — each reaction updates local affinity buckets (genre, decade, runtime). The data never leaves the user's iPhone.
4. **Weighted shuffle algorithm** — once a user has reacted to ≥10 trailers, future shuffles bias toward their taste profile while preserving exploration. The surfacing logic is original IP.
5. **Filter-driven curation** — genre + decade + runtime filters shape the trailer queue, producing a shaped feed rather than a flat list.
6. **Cycle/shuffle UX** — a 90-second auto-advance creates a "TV channel" experience unique to this app.

Trailers play exclusively via YouTube's official embeddable player inside Apple's SFSafariViewController. We do not host, modify, or redistribute trailer content. We comply fully with YouTube's Terms of Service.

Removing YouTube would not eliminate Trailer Roulette. The discovery loop, watchlist, taste profile, weighted shuffle, and curation UI all run on-device and are independent of any external service.

The About screen displays the required TMDB attribution. The privacy nutrition label is "Data Not Collected."

Please reconsider. Happy to provide a video walkthrough of the original features if helpful.
```

**Additionally**: if the reviewer asks for a video, record a 60-second screen recording on TestFlight showing the swipe-to-update-taste-profile loop. That's the most legible demonstration of original IP.

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
- The "shuffle / 90-second cycle" UX is unique to Trailer Roulette; we are aware of no other app with this interaction model.
- The on-device taste profile + weighted shuffle algorithm is our original IP, implemented entirely in the JS layer (visible at app/src/lib/tasteProfile.js and shuffleWeighting.js in our source repository if helpful for review).
- The Watchlist + Seen-it/Skip-it pairing is a novel combination not present in JustWatch, Reelgood, MovieFone, or any other app we are aware of.
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

2. **YouTube** — Trailers play through YouTube's official embeddable player inside SFSafariViewController. We do not download, modify, separate audio from video, or otherwise alter YouTube content. Our usage complies with YouTube's Terms of Service (https://www.youtube.com/static?template=terms).

We do not host, redistribute, or claim ownership of any third-party content. Trailer Roulette adds value through curation, personalization (on-device taste profile), and discovery UX.

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
3. Tap Play to open a trailer
4. Swipe right or left to react
5. Tap the heart icon to save to watchlist
6. Tap the heart icon in the header to view watchlist

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
