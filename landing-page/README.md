# landing-page/

Self-contained marketing site. Three files, no build step. Deploy anywhere static.

**For v1 you're skipping a custom domain** — we'll use the Vercel default subdomain (or GitHub Pages default URL) and update later if you want one.

## Files
- `index.html` — landing page (hero, features, privacy block, FAQ, footer)
- `privacy.html` — privacy policy (lives at /privacy on the deployed site; this is what App Store Connect requires)
- `favicon.svg` — small icon used in browser tabs

## Deploy in 5 minutes — Vercel (recommended)

Vercel gives you a free permanent URL like `trailer-roulette-landing.vercel.app` and TLS automatically. No domain needed.

```powershell
# Install the Vercel CLI globally (Windows / PowerShell)
npm install -g vercel

# Navigate to landing-page/
cd "C:\Users\ccres\OneDrive\Documents\Claude\Projects\Trailer Roulette\landing-page"

# First-time login + deploy
vercel login   # opens browser for auth
vercel --prod  # deploys; pick "create new project" when asked
```

Vercel will print URLs like:
```
✅ Production: https://trailer-roulette-landing-<hash>.vercel.app
```

Save that URL. The privacy policy is at `/privacy` — e.g. `https://trailer-roulette-landing-abc123.vercel.app/privacy`.

### Plug the URLs back into the app

In `app/.env.local`, set:
```
VITE_PRIVACY_POLICY_URL=https://trailer-roulette-landing-abc123.vercel.app/privacy
```

The About screen's "Privacy policy" link will now point at the live page.

In App Store Connect → App Privacy → Privacy Policy URL field, paste the same URL. App Store Connect requires the privacy URL to be reachable when you submit.

## Alternative: GitHub Pages

Free, also gets you HTTPS. Slightly more setup than Vercel but uses the GitHub repo you already have.

```powershell
cd "C:\Users\ccres\OneDrive\Documents\Claude\Projects\Trailer Roulette\landing-page"
git init
git add .
git commit -m "landing page"
git branch -M main
git remote add origin https://github.com/<your-handle>/trailer-roulette-landing.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source: Deploy from branch → main / / (root)**

Your URL will be `https://<your-handle>.github.io/trailer-roulette-landing/`. The privacy page is at `/privacy.html` (note: GitHub Pages doesn't auto-strip the `.html`; Vercel does).

## Pre-deployment cleanup

Search and replace these placeholders in `index.html` once you know the values:
- `apps.apple.com/app/trailer-roulette` → your real App Store URL (after launch)
- `og-cover.png` → real social preview image (use one of your 6.7-inch screenshots composited on a navy background, 1200×630 PNG, save as `og-cover.png` in this folder)
- Any reference to `trailerroulette.app` if you're not using a custom domain — replace with the Vercel/Pages URL

The references in `privacy.html` are already URL-agnostic (no hardcoded domain).

## When to add a custom domain (post-launch)

Once v1 is live and you have data:
1. Buy `trailerroulette.app` (~$15/yr at Cloudflare/Namecheap)
2. In Vercel project settings → Domains → Add → enter `trailerroulette.app`
3. Update DNS at your registrar to Vercel's nameservers (Vercel shows the values)
4. Update `VITE_PRIVACY_POLICY_URL` in your env, rebuild the app, push v1.0.1 to TestFlight, then to the App Store

It's intentional that this is post-launch. No domain in the critical path means one fewer external dependency.
