# Apple Search Ads — paid acquisition for v1.1+

Optional. **Don't do this for v1.0.** Wait until:
- App is approved + live
- Organic acquisition is measurable (3+ days of data)
- v1.0 has a clean rating (≥4.0★)

Then consider Apple Search Ads as a controlled experiment.

## Why Apple Search Ads (vs other channels)

- High intent: people searching for "movie trailers" in the App Store are 5–10x more likely to install than people scrolling social
- Low cost-per-tap: ~$0.50–$2.00 in our category
- No setup tax: same Apple ID, immediate billing
- Self-service: you control budget, can cap at $5/day to start

## Setup

1. Go to https://searchads.apple.com
2. Sign in with your Apple ID
3. Create a campaign with **Search Ads Basic** (recommended for solo devs):
   - Budget: $5–10/day to start
   - Cost-per-install (CPI) bid: $1.50 (Apple suggests; can adjust)
   - Targeting: USA initially; expand once you have data
   - Apple chooses the keywords automatically — you can't pick them in Basic

If you want full control, use **Search Ads Advanced** (more setup; better long-term).

## What to advertise

Apple Search Ads uses your existing App Store listing. The keywords you set in `store-listing/keywords.md` matter; the screenshots matter; the description's first 2 lines matter.

**Before turning on ads**, make sure:
- [ ] App Store listing is final (no typos, screenshots are sharp)
- [ ] Keywords are tuned (use AppTweak or Sensor Tower for keyword research)
- [ ] First 3 lines of the description are punchy
- [ ] First screenshot is the hero shot

## Budget recommendation

| Phase | Budget | Goal |
|-------|--------|------|
| Week 1 (test) | $5/day | Establish baseline CPI, test which keywords convert |
| Week 2–4 (validate) | $10/day if Week 1 was healthy | Verify the funnel scales |
| Month 2+ (scale) | $25–50/day if LTV > CPI | Scale aggressively |

If you can't measure LTV (because the app is free with no in-app purchases), use **install volume + retention** as a proxy:
- Day 1 retention > 40% → product is sticky; keep paying
- Day 1 retention < 25% → ads are wasted; pause and improve the app

## When to pause

- Average rating drops below 4.0
- Ad-driven users uninstall faster than organic (signal of bad fit)
- You hit a budget cap that's higher than you're comfortable with
- v1.1 is shipping and you want to wait for the post-launch lift

## Tracking

Apple Search Ads provides:
- Impressions, taps, installs (the basics)
- Cost-per-install per keyword
- Retention curves (Day 1, Day 7, Day 30) for ad-acquired users vs organic

Cross-reference with App Store Connect → Analytics → Acquisition. The `Sources of installs` view shows ASA (App Search Ads) separately.

## Don't burn money on this

If you're solo and pre-revenue, **$50/week is plenty**. Bigger budgets without a measurable goal just enrich Apple. Set a spend cap at the campaign level; check it weekly.

## Alternative: don't run ads at all

For v1.0, the safer move is:
- Lean on the press kit (PH, Reddit, friends-and-family)
- Optimize for organic ASO (keywords, screenshots)
- Build retention through Watchlist / Seen-it loop
- Reach $0 cost / month

Ads are a multiplier, not a starter. Multiply something that works; don't multiply nothing.
