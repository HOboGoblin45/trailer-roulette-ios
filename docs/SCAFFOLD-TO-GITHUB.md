# Push the scaffold to GitHub from Windows

Since you don't have an existing repo and you're using the workspace's `app/` folder as v1, the cleanest path is:

1. Create a fresh GitHub repo
2. Push the workspace's `app/` folder to it from Windows
3. GitHub Actions macOS runners take over for iOS builds (no Mac needed on your end)

**Total time: ~10 minutes.**

## Prerequisites
- A GitHub account
- Git installed on Windows (https://git-scm.com/download/win)
- Your TMDB API key handy (you'll add it to `.env.local` on the Mac, never commit it)

## Step 1 — Create the GitHub repo

1. Go to https://github.com/new
2. **Repository name**: `trailer-roulette-ios`
3. **Visibility**: **Private** (recommend; you can switch to Public after launch)
4. **Initialize this repository with**: leave ALL unchecked (we have our own scaffold)
5. → **Create repository**

GitHub will show you a "Quick setup" page with the repo URL. Copy the HTTPS URL — looks like `https://github.com/<your-handle>/trailer-roulette-ios.git`.

## Step 2 — Generate package-lock.json on Windows (CI needs it)

Before pushing, run `npm install` once locally so a `package-lock.json` exists. The CI workflow uses `npm ci`, which requires the lockfile.

```powershell
# Install Node.js 20 LTS first if you don't have it
# https://nodejs.org/en/download

cd "C:\Users\ccres\OneDrive\Documents\Claude\Projects\Trailer Roulette\app"
npm install
# Generates package-lock.json and node_modules/
# (node_modules/ is gitignored — it won't be committed.)
```

If `npm install` errors out, paste the error to me; the most common Windows issue is line endings on the Capacitor postinstall script — usually a re-run fixes it.

## Step 3 — Push the scaffold from Windows

```powershell
# (still in the same app/ folder)

# Initialize git
git init
git branch -M main

# Stage everything that isn't gitignored
git add .

# First commit
git commit -m "Initial scaffold: Capacitor + React + Vite for Trailer Roulette iOS

- Complete component tree (TrailerRoulette, Player web/iOS split, SwipeOverlay, Watchlist, Filters, UpNext, AboutScreen)
- Lib modules (storage, haptics, dialog, airplay, tasteProfile, weighted shuffle)
- Native AirPlay Capacitor plugin (Swift + Obj-C)
- capacitor.config.ts, vite.config.js, package.json + package-lock.json
- Pre-rendered app icons (1024 + 12 iOS sizes) with Contents.json
- Pre-staged from production roadmap (2026-04-25)"

# Connect to GitHub (replace URL with the one from Step 1)
git remote add origin https://github.com/<your-handle>/trailer-roulette-ios.git

# Push
git push -u origin main
```

If GitHub asks for credentials:
- **Username**: your GitHub handle
- **Password**: a Personal Access Token (NOT your password). Create one at https://github.com/settings/tokens?type=beta with **Contents: Read and Write** scope. Save the token; GitHub shows it only once.

## Step 3 — Verify the push

In your browser, visit `https://github.com/<your-handle>/trailer-roulette-ios`. You should see:
- `package.json`
- `capacitor.config.ts`
- `index.html`
- `src/` directory with `App.jsx`, `components/`, `lib/`, `styles/`
- `ios-native/` directory with the Swift plugin
- `.gitignore` (which should NOT be hiding `node_modules`, `dist/`, or `.env.local`)
- README.md

Confirm `.env.local` is NOT in the repo (it's in `.gitignore`). Confirm `.env.local.template` IS in the repo.

## Step 4 — Confirm GitHub Actions CI runs

Visit `https://github.com/<your-handle>/trailer-roulette-ios/actions`.

You should see `CI (lint + test + web build)` running automatically. It should complete green within ~5 minutes. If it fails, check:
- Did all the test files push? (Look for `app/src/lib/__tests__/` in the repo browser)
- Is the `app/package.json` "scripts" block intact?

A green CI confirms the JS layer is healthy and you're ready for iOS work.

## Step 5 — Continue with cert setup + iOS pipeline

Now that the repo is live, proceed with `docs/IOS-CERT-SETUP-WINDOWS.md`. **No Mac is involved at any point.** GitHub Actions macOS runners build the iOS app on your behalf.

After secrets are added to GitHub:
1. Manually run the **`iOS Bootstrap (one-time)`** workflow (Actions tab → Run workflow)
2. Pull the bot's commit (`git pull`) on your Windows machine
3. Tag a release: `git tag v1.0.0 && git push --tags`
4. **`iOS Release`** workflow auto-runs, uploads to TestFlight

## Why this matters

- The scaffold needs to be on GitHub so the cloud Mac can pull it without you copy-pasting files through VNC
- A private repo lets you commit your `.env.local` accidentally without leaking the TMDB key publicly (it's still a leak in your repo history; rotate the key if it happens)
- Once it's on GitHub, you can also pull on multiple machines, push from anywhere, and use GitHub Issues for the bug log later

## Branching strategy (later, post-v1)

For v1, just commit to `main`. Once you're shipping updates:
- `main` = whatever's on the App Store
- `dev` = active work
- `release/v1.1` = release branch when prepping a submission

Keep it simple. You're solo; don't over-engineer the workflow.
