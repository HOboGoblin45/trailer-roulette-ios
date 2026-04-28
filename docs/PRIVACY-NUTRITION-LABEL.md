# Privacy Nutrition Label — App Store Connect spec

Apple requires a per-app privacy disclosure (the "nutrition label") at submission. Below is the exact form, mapped to App Store Connect's taxonomy, that v1 of Trailer Roulette will declare.

## Top-level question
**Does this app collect data from this app?**
→ **No, we do not collect data from this app.**

That single declaration is sufficient because Trailer Roulette has:
- No accounts, no login, no email collection
- No analytics SDK
- No advertising SDK / IDFA usage
- No location, camera, microphone, contacts, photos, health, or financial data access
- No backend that holds user data

## What we *do* contact and why (NOT "data collection" by Apple's definition)

Apple distinguishes "collection" (data linked to identity / shared with you) from "data sent to a third party for the user's benefit." None of the items below count as collection:

| Service | What's sent | Why |
|---------|-------------|-----|
| TMDB API | API key (yours, not user's), search/filter parameters | fetch movie metadata |
| YouTube (via SFSafariViewController) | the trailer URL the user tapped | YouTube serves the player and ad |
| Apple App Store / TestFlight | crash reports (Apple-mediated) | per Apple's own privacy policy |

These are user-initiated network requests, not background or behavior-tracking calls.

## App Store Connect form walkthrough

When you fill out the privacy questionnaire at submission:

1. **Data Types** → tick **None of the data types listed in this section are collected.** (Repeat for every category — Contact Info, Health & Fitness, Financial Info, Location, Sensitive Info, Contacts, User Content, Browsing History, Search History, Identifiers, Purchases, Usage Data, Diagnostics, Other Data.)

2. **Tracking** → "Does this app track users?" → **No.** ("Tracking" in Apple's sense means linking user/device data with data from other apps/sites for ads or sharing with data brokers — neither happens here.)

3. **Privacy policy URL** → the hosted URL of `privacy-policy-hosted/index.html`. Set to `https://trailerroulette.app/privacy` once domain is live.

## If we ever add features that change this

| Feature | Disclosure delta |
|---------|------------------|
| Sign in with Apple (cross-device sync) | Add **Email Address** under "Contact Info — Linked to user" |
| Crash analytics SDK (e.g. Sentry) | Add **Crash Data, Performance Data — Not linked** under "Diagnostics" |
| Push notifications | Add **Device ID — Linked** if registering with our own backend |
| Couple's Mode with shared backend | Reconsider entire posture; likely needs full disclosure |

**v1 strategy: keep the label at "Data Not Collected."** It's the most legible, lowest-friction posture and matches the codebase reality.

## Verification checklist before submission

- [ ] No third-party SDKs in `package.json` beyond Capacitor's official ones and React
- [ ] No analytics calls anywhere in `src/`
- [ ] `Capacitor.getPlatform()` is the only device-property read
- [ ] Crashes go through TestFlight/App Store Connect only (Apple-mediated)
- [ ] Privacy policy hosted URL is reachable and accurate
- [ ] About screen surfaces the same disclosures
