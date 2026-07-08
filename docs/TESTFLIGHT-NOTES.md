# TestFlight — "What to Test" notes

Pasted into the TestFlight Build Notes field for each beta. Tells testers what's new in this build and what specifically needs attention.

## v3.1.0 (current build) — paste this one

> **Trailer Roulette v3.1.0**
>
> **The fix in this build:** trailers used to stop after ~15 seconds and jump
> to the next one. That was a YouTube pre-roll ad ending being mistaken for the
> trailer ending. Trailers now play all the way through.
>
> **Please test**
> 1. **Cold launch** loads to the shuffle screen within ~2s.
> 2. **Tap Play** — the trailer opens and plays. Let several run end-to-end and
>    confirm each plays in full (not ~15s) before it auto-advances to the next.
>    Try a mix of new blockbusters and older titles (ads are more common on
>    popular ones — those were the worst-hit before).
> 3. **Tap Play again while one is playing** ("Spin") — it should jump to a
>    fresh random trailer.
> 4. **AirPlay** — with an Apple TV/HomePod nearby, tap AirPlay; the system
>    picker appears and playback moves to the TV.
> 5. **Modes** (top-right pill) — open a fun mode, watch a trailer, come back.
> 6. **Done** inside the player ends the session; Play resumes.
> 7. **Background + return** — leave the app mid-trailer and come back; one tap
>    on Play resumes on the same trailer (it should not silently skip one).
>
> **Known limitations**
> - AirPlay only works on a real device, not the simulator.
> - First load may be slightly slower while the first trailer key is fetched.
>
> **Report bugs:** in-app TestFlight feedback (screenshot + note), or email
> crescicharles@gmail.com with steps to reproduce.

> NOTE: the v1.0 note below is historical — that build had swipe/watchlist/
> filters/SFSafariViewController, all removed in the 2026-06 pivot to the
> two-button roulette. Kept for reference only; do not paste it.

## v1.0 build 1 (first internal upload)

> Welcome to the first build of Trailer Roulette for iOS! Before tapping around, please:
>
> **What's new in this build**
> - Everything. This is the initial port from the web app.
> - iOS-specific features: SFSafariViewController playback, swipe gestures, haptics, AirPlay.
>
> **Please test**
> 1. **Cold launch**: app loads to the shuffle screen within ~2s. Trailer queue populates.
> 2. **Tap Play**: trailer opens in the in-app browser, plays YouTube's player. Tap "Done" or wait 90s; the app should auto-advance to the next trailer.
> 3. **Swipe**: drag right on the player area = "Seen it"; drag left = "Skip it". You should feel haptic feedback.
> 4. **Watchlist**: tap the heart icon to save a trailer. Tap the heart in the header to view/manage your watchlist.
> 5. **Filters**: scroll the genre and decade chips. Tap to filter. Tap again to clear.
> 6. **Up Next**: tap the bottom handle to see the next 5 trailers.
> 7. **Force quit + relaunch**: your watchlist and taste profile should still be there.
> 8. **AirPlay**: with an Apple TV or HomePod nearby, tap the cast button. The system AirPlay picker should appear.
> 9. **Rotate**: landscape should expand the player to full-bleed.
>
> **Known limitations**
> - Auto-advance after a trailer ends is timer-based (90s), not detected from YouTube's player. We can't read player state from SFSafariViewController by design.
> - AirPlay only works on a real device, not the simulator.
> - First load may be slower while the trailer key is fetched.
>
> **Report bugs**
> Use the in-app TestFlight feedback (screenshot + your note). Or email crescicharles@gmail.com with steps to reproduce.

## Subsequent builds — template

> **v1.0 build N**
>
> What's fixed since build N-1:
> - …
>
> Please regression-test:
> - Cold launch
> - One trailer playback
> - One swipe + one watchlist add
>
> New things to bash on:
> - …

## Internal vs external testing

- **Internal group** (TestFlight, up to 100 users, no Apple review needed): Charlie + girlfriend + 1–2 trusted friends. Iterate fast on the first 2–3 builds here.
- **External group** (up to 10,000 users, Apple does a beta review which is faster than full review): 10–20 friends, family, indie-iOS-Twitter folks. Use this once internal builds are stable for ~3 days.

## Beta review tips
- The first external build goes through a lighter Apple review. They may ask the same 4.2/5.2 questions as the full review — have `research/why-this-app-is-original.md` ready.
- Keep the public link (TestFlight invite URL) easy to share. Don't publish it on Reddit until the app is ready for full submission — TestFlight reviews are not a substitute for App Store review.
