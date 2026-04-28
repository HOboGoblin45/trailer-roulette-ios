# TMDB API key setup

Trailer Roulette fetches movie metadata from TMDB (The Movie Database). You need a free API key to run the app.

## 5 minutes; one-time

1. Go to https://www.themoviedb.org/signup and create an account
2. Confirm your email
3. Go to https://www.themoviedb.org/settings/api
4. Click **Create** under "Request an API Key"
5. Choose **Developer** (free; the alternative is paid commercial use)
6. Fill the form:
   - **Application Name**: `Trailer Roulette`
   - **Application URL**: leave blank or use the eventual Vercel URL
   - **Application Summary**: "Mobile app for personalized movie discovery via trailer shuffling. Uses TMDB metadata under attribution."
   - Personal info: yours
7. Accept the terms of use
8. Submit. TMDB approves Developer keys instantly (sometimes within seconds).

You'll see two values on the API page:
- **API Key (v3 auth)** — a 32-character hex string. **This is what we use.** Save it.
- **API Read Access Token (v4 auth)** — longer JWT. Not used by Trailer Roulette v1.

## Where the key goes

Two places:

**1. Local development on Windows** — in `app/.env.local`:
```
VITE_TMDB_API_KEY=<paste your 32-char v3 key>
VITE_PRIVACY_POLICY_URL=https://your-vercel-url.vercel.app/privacy
```

**2. GitHub Secrets** (used by CI builds) — at https://github.com/<your-handle>/trailer-roulette-ios/settings/secrets/actions:
- Name: `VITE_TMDB_API_KEY`
- Value: same 32-char hex string

The `app/.env.local` file is gitignored. The GitHub Secret is encrypted at rest and only injected into CI runs.

## TMDB attribution requirement

TMDB requires an attribution line in any app that uses their data:

> *"This product uses the TMDB API but is not endorsed or certified by TMDB."*

Already included in:
- `app/src/components/AboutScreen.jsx` — visible on the About screen in the app
- `store-listing/description.md` — in the App Store listing
- `landing-page/index.html` — in the website footer

Don't remove these.

## Rate limits

TMDB allows 50 requests / 10 seconds per IP for the public API. Our app is well under this — typical session makes ~5–10 calls (queue + a few details fetches). Even pathological shuffling won't hit the limit.

If we ever do hit it, the app catches errors in `app/src/lib/tmdb.js`'s `call()` and the queue gracefully empties; user sees the empty state.

## Rotation

Rotate the API key if:
- You committed it to a public repo (it happens — TMDB's keys are easy to grep for)
- A team member leaves and had access
- TMDB emails about suspicious activity

To rotate: regenerate at https://www.themoviedb.org/settings/api, update `app/.env.local` and the `VITE_TMDB_API_KEY` GitHub Secret, then push a new build.

## What if TMDB shuts down or changes terms?

The taste profile, watchlist, and shuffle logic are all on-device and survive any TMDB outage. Trailer playback is via YouTube, which is independent. The only thing TMDB shutdown breaks is the trailer queue (we couldn't fetch new titles).

Plan B: switch to **OMDb** (a similar movie metadata API) or **JustWatch** (which also has paid feeds). Both would require code changes in `app/src/lib/tmdb.js` but the trailer object shape is intentionally narrow so the swap is mechanical.
