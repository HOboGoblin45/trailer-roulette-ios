# Ship It — App Store submission cheat sheet (v2.0.0)

You have a working build on TestFlight. This doc is the literal sequence
of clicks to get it into the App Store. Plan ~45 minutes start to finish.

---

## 1. Open App Store Connect

[https://appstoreconnect.apple.com/apps](https://appstoreconnect.apple.com/apps) → **Trailer Roulette** → **App Store** tab in
the left sidebar → click the **+ Version** button if 2.0.0 isn't already
there, or open **2.0.0 Prepare for Submission**.

If ASC doesn't show 2.0.0 yet, click the version selector and pick
"Create New Version" → enter `2.0.0`.

## 2. Paste the description copy

Open `store-listing/description.md`. Copy the block under "App name" into
**Name** (`Trailer Roulette`). Paste the **Subtitle** block (`Trailers
from another era.`). Then paste the multi-paragraph block from the
"Description" section into the App Store **Description** field exactly
as written.

## 3. Paste keywords + promotional text

- **Keywords** field → paste the line from `store-listing/keywords.md`:
  `trailers,classic,vintage,80s,90s,cinephile,watchlist,movie picker,date night`
- **Promotional Text** field → paste from `store-listing/promotional-text.md`:
  `New: Watchlist + Seen it/Skip it swipes. The more you swipe, the smarter your shuffles get. No accounts. No tracking. Your taste, your phone.`
- **What's New in This Version** → paste from `store-listing/whats-new-v1.0.md`
  (this is the first public release, so use the v1.0.0 copy even though our
  internal build number is 2.0.0)

## 4. Upload screenshots

Apple requires a 6.9-inch set; older sizes are auto-derived but you might
as well upload them all since we have them.

In **App Previews and Screenshots** at the top of the version page:

- **iPhone 6.9"** → drag in all five files from `assets/screenshots/6.9-inch/`
- **iPhone 6.7"** → drag in all five from `assets/screenshots/6.7-inch/`
- **iPhone 6.5"** → optional, drag in from `assets/screenshots/6.5-inch/`
- **iPhone 5.5"** → optional, drag in from `assets/screenshots/5.5-inch/`

Apple will validate dimensions automatically. The order matters — they're
named `01-` through `05-` which is the order we want them displayed.

## 5. Age Rating

In the **General App Information** section (left sidebar) → **Age Rating**
→ click **Edit**. Answer the questionnaire:

- Frequent/Intense Cartoon or Fantasy Violence: **None**
- Frequent/Intense Realistic Violence: **None**
- Frequent/Intense Sexual Content or Nudity: **None**
- Profanity or Crude Humor: **Infrequent/Mild** (some trailers may include language)
- Alcohol, Tobacco, or Drug Use: **Infrequent/Mild** (some trailers depict these)
- Mature/Suggestive Themes: **Infrequent/Mild** (varies by trailer)
- Horror/Fear Themes: **Infrequent/Mild** (we surface horror trailers in the queue)
- Gambling: **None**
- Medical/Treatment Information: **None**
- Unrestricted Web Access: **No**
- Made for Kids: **No**

This produces a **12+** rating. Save.

## 6. Pricing & Availability

Left sidebar → **Pricing and Availability**:

- **Price**: USD 0 (Free)
- **Availability**: select all countries, OR start with United States only
  for a soft launch and expand after a few days
- **Pre-orders**: Off

## 7. App Privacy

Left sidebar → **App Privacy** → **Edit**.

Click **Get Started** → confirm "**Data Not Collected**". The whole
nutrition label is empty — we don't collect anything. Save.

If asked about tracking: **No**.

## 8. Attach the build

Back on the **2.0.0 Prepare for Submission** page → scroll to the **Build**
section → click **+** → select the latest TestFlight build of v2.0.0.

If it's not listed: TestFlight processing can take 5–60 minutes. Wait,
refresh, retry.

## 9. Reviewer Notes

Scroll to **App Review Information**. Paste this verbatim into the
**Notes** field:

```
Trailer Roulette is a personalized movie-discovery app focused on pre-2010 cinema. The default queue surfaces classics from the 70s, 80s, 90s and 2000s; users can flip an Era toggle to see modern trailers if they want.

Core features (these are what makes the app the app, not just trailer playback):
• Era + genre + decade filters that shape the queue
• Watchlist — saved movies, persisted locally with Capacitor Preferences (no accounts, no server)
• Seen it / Skip it swipes that feed an on-device taste profile
• Learned shuffle weighting that biases future queues toward the user's affinity (genre, decade, runtime)
• AirPlay routing to a TV via a custom local Capacitor plugin

Trailer playback:
Trailers play in an in-app fullscreen modal that hosts a WKWebView pointed at our own embed proxy page (https://trailer-roulette.vercel.app/embed?v=ID). The proxy page contains a YouTube IFrame Player API embed using YouTube's official embed code. We never host, copy, modify, or redistribute trailer content; we present YouTube's official embedded player in a third-party page that satisfies YouTube's embedded-player Terms of Service requirement for proper Referer-based embedder identification.

This is not a YouTube wrapper. The discovery loop, taste profile, watchlist, AirPlay routing, and curation logic all run on-device and are independent of YouTube. Trailers are one piece of content surfaced inside that loop.

Movie metadata from TMDB API; required attribution is shown on the About screen and in the description.

Privacy posture: no accounts, no tracking, no analytics SDKs. Privacy nutrition label = "Data Not Collected."

Test path:
1. Open the app — first trailer auto-loads (a pre-2010 movie based on default Classic era filter)
2. Tap the Play button — fullscreen branded modal opens with YouTube IFrame Player playing the trailer
3. Tap Done top-right — modal dismisses, app advances to the next trailer in the queue
4. Swipe right on the trailer card to mark "Seen it" — updates the on-device taste profile
5. Swipe left to "Skip it" — also updates the profile (negative signal)
6. Tap the heart icon to save the current movie to Watchlist
7. View Watchlist via the heart in the header
8. Toggle Era from Classic to Modern in the filter bar to switch the catalog window
9. About screen shows TMDB attribution and privacy posture

Contact: crescicharles@gmail.com
```

- **Sign-in required**: No
- **Demo account**: leave blank
- **Contact info**: Charlie Cresci, crescicharles@gmail.com, your phone optional

## 10. Submit

Top-right of the version page → **Add for Review** → confirm → **Submit**.

App Review takes 24–72h typically. You'll get an email when it's reviewed.

## If rejected

The most likely rejection vectors and how to respond are pre-written in
`docs/REJECTION-RESPONSES.md`. The most common is **4.2 Minimum
Functionality** ("this looks like a YouTube wrapper") — the rebuttal memo
is at `research/why-this-app-is-original.md` and you paste it into
Resolution Center verbatim.

## When approved

In ASC, the version goes to **Pending Developer Release** (we set manual
release earlier). Click **Release This Version** when you're ready for
the public.

Then:
1. Verify it's live by searching "Trailer Roulette" on the App Store
2. Respond to any incoming reviews within 24h
3. Track downloads / crashes for the first 7 days
4. Day 7 if clean, expand availability to all territories (if you started
   US-only)

---

**That's it. Ship it.**
