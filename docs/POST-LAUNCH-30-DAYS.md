# Post-launch playbook — first 30 days

What to do, when to do it, and what triggers the kill switch. Day-by-day for week 1, week-by-week for weeks 2–4.

## Day 0 — Approved + Released

### Within 1 hour of release
- [ ] Verify the App Store listing renders correctly in your soft-launch country (Canada or Australia)
- [ ] Search "Trailer Roulette" in the App Store from your iPhone — confirm it appears
- [ ] Install on your iPhone (NOT via TestFlight; the real App Store version)
- [ ] Run the cold-launch path in `docs/BUG-BASH-CHECKLIST.md`
- [ ] Confirm trailers play, watchlist saves, swipes register

### Within 4 hours
- [ ] Tweet the launch thread (`press-kit/tweet-launch-thread.md`)
- [ ] Email friends and family (`press-kit/email-friends-and-family.md`)
- [ ] Post on Product Hunt if today is a launch day (Tuesday/Wednesday best); otherwise schedule for next launch window

### Within 24 hours
- [ ] Reply to every App Store review (good or bad) — gold standard for solo devs
- [ ] Check App Store Connect → Analytics → Crashes; if any, screenshot and file in `docs/bugs.md`
- [ ] Confirm Vercel landing page is still up
- [ ] Confirm privacy policy URL still resolves

## Day 1–3 — Stability watch

**Daily checklist** (5 min/day):
- [ ] App Store Connect → Apps → Trailer Roulette → Analytics → Crashes
- [ ] Reviews tab: respond to anything new
- [ ] App Store Connect → Sales and Trends → Downloads (just to know)

### Triggers
- **3+ crashes from different users with the same stack** → file as S1, hotfix in v1.0.1
- **Average rating drops below 3.5★ with 5+ reviews** → pause expansion plans; investigate sentiment
- **Single review describing data loss / missing watchlist** → investigate immediately, possible critical bug

## Day 4–7 — Light expansion

If Day 1–3 are clean (zero S1 bugs, average rating ≥4.0★ with ≥3 reviews):
- [ ] Expand availability to a second small country (e.g., New Zealand if you started in Canada)
- [ ] Run the soft-launch checks again at this country
- [ ] Continue daily monitoring

If Day 1–3 are NOT clean:
- [ ] Hold the soft launch
- [ ] Ship v1.0.1 hotfix
- [ ] Reset the 3-day clean window after the hotfix lands

## Week 2 — Global expansion (if all clean)

By Day 14, if no S1 bugs and rating ≥4.0★:
- [ ] Expand to **All countries** in App Store Connect
- [ ] Schedule the second wave of launch posts (Reddit if you held back, broader Twitter, blog post if you have one)
- [ ] Update App Store screenshots with whatever's working best (you'll have feedback by now on which features users actually use)

## Week 3 — Listen, learn, plan v1.1

### Sources of feedback to mine
- App Store reviews (the obvious one; respond to every one)
- TestFlight feedback (internal + external testers may still be active)
- Twitter mentions (set up a Google Alert or X search for "Trailer Roulette")
- Product Hunt comments (if you launched there)
- Reddit threads where you posted
- Email replies from friends-and-family blast

### Synthesize
By end of week 3, write `docs/feedback-week-3.md` with:
- Top 5 most-requested features
- Top 5 reported bugs
- Top 3 surprising delights ("I didn't think this would work but…")
- One-paragraph user-mood summary

This becomes the input to the v1.1 backlog (`docs/V1.1-SPEC.md` is the seed; revise based on actual feedback).

## Week 4 — Decide on v1.1 timing

Three branches:

### Branch A — v1.0 is doing great (≥1000 downloads, ≥4.5★, no critical bugs)
- [ ] Lock the v1.1 spec and start coding Week 5
- [ ] Keep v1.0 marketing momentum (post-launch tweets, blog posts)
- [ ] Plan v1.1 launch ~6 weeks out

### Branch B — v1.0 is okay (modest downloads, mixed reviews, no critical bugs)
- [ ] Pause v1.1; spend a week on ASO (App Store Optimization)
- [ ] A/B test the App Store description, keywords, screenshot ordering using the rotateable promo text
- [ ] Re-evaluate at end of week 5

### Branch C — v1.0 is rough (low ratings, recurring complaints)
- [ ] Triage the top 3 complaints
- [ ] Ship v1.0.x hotfixes (not v1.1) until the average rating clears 4.0
- [ ] Defer v1.1 until v1.0 is healthy

## Daily metrics to track

Log these in a Notion / Airtable / Google Sheet — don't trust your memory:

| Day | Downloads | Avg rating | Reviews count | Crashes | Notes |
|-----|-----------|-----------|---------------|---------|-------|
| D1 | | | | | |
| D2 | | | | | |
| ... | | | | | |

Build a tiny dashboard (you have the skills; or use App Store Connect's built-in analytics). Don't over-engineer this — 30 days of a spreadsheet is fine.

## Hotfix (v1.0.1) procedure
If a critical bug surfaces:
1. File in `docs/bugs.md` with severity S1
2. Reproduce on the simulator (you can do this from the GitHub Actions ios-bootstrap runner — or use your iPhone via TestFlight)
3. Fix on Windows; commit
4. Bump version to 1.0.1 in `app/package.json`
5. `git tag v1.0.1 && git push --tags`
6. Wait for `ios-release.yml` to upload
7. In App Store Connect: create a new version 1.0.1; attach the build; Submit for Review
8. Note: hotfix submissions sometimes get expedited review if you request it in the App Review Information field. Do this for genuine bugs, not for cosmetic tweaks.

Apple's expedited review for v1 hotfixes typically lands in 24h.

## Don't-do list (the boring discipline part)

- **Don't add features mid-launch.** Stay focused on v1.0 stability for the first 14 days.
- **Don't argue with reviewers.** Even when they're wrong. Address the feedback substantively or move on.
- **Don't promise features in App Store responses.** ("v1.1 will have X") locks you in publicly. Say "thanks, that's on the list."
- **Don't abandon TestFlight.** Even after launch, use it for v1.1 betas and hotfixes.
- **Don't change the bundle ID.** Ever. It's tied to your reviews and download history forever.
- **Don't delete reviews you don't like.** You can't, but also don't fixate on them.

## Day 30 retrospective

Write `docs/retro-day-30.md` answering:
- What worked (be specific — "the swipe gesture got 5 'this is genius' reviews" not "it was good")
- What didn't (what did you build that nobody used? What did people ask for that you didn't have?)
- What's next (v1.1 scope locked; or pivot to a different next thing)

Share it with whoever you trust. Solo dev gets lonely; outside perspective is fuel.

## Personal sustainability

You're going to want to refresh App Store Connect every 3 hours for 30 days. **Don't.** Set Notification rules at App Store Connect for crashes and serious rating drops; trust them. Check once per day, twice if something specific is happening.

The product is real and live. You did it. Don't burn out 4 weeks in.
