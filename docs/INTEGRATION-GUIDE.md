# Integration guide — merging the iOS scaffold with an existing web repo

> **Note (2026-04-25)**: For the current project, Charlie chose **"use the scaffold as v1"** — no merge needed. This guide is preserved for two future scenarios:
> 1. If you later port the existing web app's domain logic into this scaffold.
> 2. If anyone else uses this scaffold as a starting point on top of a different codebase.
>
> If you're following the current path, skip this file and go to `docs/SCAFFOLD-TO-GITHUB.md` instead.

---

The `app/` folder in this workspace is a complete iOS-ready scaffold. This guide explains how to combine it with an existing React codebase.

## Decision matrix

| Situation | Recommended approach |
|-----------|---------------------|
| Existing repo is React + Vite, similar structure | **Merge** — drop new files in, diff and reconcile shared files |
| Existing repo is React but uses Webpack / CRA / different bundler | **Migrate first** — switch to Vite (a few hours), then merge |
| Existing repo is React with a fundamentally different architecture | **Adopt the scaffold** — copy your business logic into the scaffold |
| Existing repo is in better shape than the scaffold | **Cherry-pick** — only take the iOS-specific files (lib/storage, lib/airplay, components/Player.ios, ios-native/, capacitor.config.ts) |

For this project, given the roadmap's description of the existing app (`Player.jsx`, `Header.jsx`, `Filters.jsx`, `UpNext.jsx`, `TrailerRoulette` parent), **Merge** is the most likely fit. Below is the merge guide.

## Merge strategy

### Files to add wholesale (no existing equivalent)

| New file | Purpose |
|---------|---------|
| `app/capacitor.config.ts` | Capacitor configuration |
| `app/.env.local.template` | env var template |
| `app/.gitignore` (if missing) | iOS / Capacitor ignores |
| `app/src/lib/storage.js` | Capacitor Preferences abstraction |
| `app/src/lib/haptics.js` | Haptic feedback wrapper |
| `app/src/lib/dialog.js` | Native dialog wrapper |
| `app/src/lib/airplay.js` | AirPlay plugin wrapper |
| `app/src/lib/tasteProfile.js` | Local affinity buckets |
| `app/src/lib/shuffleWeighting.js` | Weighted shuffle algorithm |
| `app/src/components/Player.ios.jsx` | iOS playback via SFSafariViewController |
| `app/src/components/Player.web.jsx` | (rename your existing Player → this) |
| `app/src/components/SwipeOverlay.jsx` | Seen it / Skip it gestures |
| `app/src/components/Watchlist.jsx` | Saved trailers screen |
| `app/src/components/AboutScreen.jsx` | Settings + attribution |
| `app/src/styles/safe-area.css` | iPhone notch CSS vars |
| `app/ios-native/AVRoutePlugin.swift` | AirPlay Swift plugin |
| `app/ios-native/AVRoutePlugin.m` | Capacitor plugin registration |
| `app/ios-native/Info.plist.additions.xml` | Info.plist merge content |

### Files to merge (existing equivalents likely present)

| File | Merge approach |
|------|----------------|
| `app/package.json` | Add the Capacitor deps (`@capacitor/*` packages) and ios scripts to your existing package.json. Don't overwrite. |
| `app/src/components/TrailerRoulette.jsx` | Diff against your existing main shell. Keep your queue/filter logic; pull in the watchlist toggle, swipe wiring, taste profile call, and CYCLE_SECONDS auto-advance lifted out of the player. |
| `app/src/components/Player.jsx` | Replace your existing `Player.jsx` with the **router** version, and rename your old Player to `Player.web.jsx`. |
| `app/src/components/Header.jsx` | Add the safe-area CSS class, watchlist button, info button. Keep your existing branding/markup. |
| `app/src/components/Filters.jsx` | Convert the chip row to horizontal scroll on mobile (CSS-only change in many cases). |
| `app/src/components/UpNext.jsx` | Convert sidebar → bottom sheet on mobile breakpoints. |
| `app/src/styles/index.css` | Most of the new CSS lives here. Diff carefully — keep your existing palette if you have one, or adopt the dark-navy/gold scheme. |
| `app/src/App.jsx` | Add the screen routing for Watchlist + About if your existing App.jsx is a single screen. |

### Files to ignore (don't carry your existing equivalents into the iOS build)
- Cast SDK code — Cast doesn't work on iOS Capacitor; iOS uses AirPlay. Wrap any Cast init in `if (Capacitor.getPlatform() === 'web')`.
- Service workers — irrelevant on iOS Capacitor.
- Analytics SDKs (if any) — strip for iOS to maintain "Data Not Collected" posture. If you must keep them on web, gate them behind `Capacitor.getPlatform() === 'web'`.

## Step-by-step merge

```bash
# 1. Create a feature branch off your existing repo
cd ~/Projects/trailer-roulette
git checkout -b ios-port

# 2. Copy the scaffold's app/ folder over your existing folder
# (do this carefully; back up first if your repo has substantial uncommitted work)
rsync -av --ignore-existing /path/to/this/workspace/app/ ./

# 3. Reconcile package.json (you'll see a conflict — it's just a merge)
# Open package.json in your editor, take both sets of scripts and deps

npm install

# 4. Diff the components — keep your domain logic, take the iOS-specific changes
git diff src/components/Player.jsx
git diff src/components/TrailerRoulette.jsx
# Use your editor's three-way merge tool here

# 5. Run the web build to confirm nothing broke
npm run dev

# 6. Add Capacitor
npx cap init "Trailer Roulette" app.trailerroulette.ios --web-dir=dist

# 7. Once on a Mac:
npm run build
npx cap add ios

# 8. Follow app/ios-native/README.md to add the Swift plugin
```

## Sanity checks after merge

- [ ] `npm run dev` boots the web app at localhost without errors
- [ ] All existing web features still work (especially Cast on web)
- [ ] `npm run build` produces a clean `dist/`
- [ ] `npx cap sync ios` reports no issues
- [ ] When opened in Xcode, the app builds without warnings
- [ ] `Capacitor.getPlatform()` returns `'web'` on dev server, `'ios'` in the simulator
- [ ] The platform branch in `Player.jsx` correctly routes to `Player.web.jsx` on web, `Player.ios.jsx` on iOS

## If something doesn't merge cleanly

The two areas most likely to conflict are:
1. **TrailerRoulette.jsx state shape** — your existing one likely has a different state model. Gradually move state pieces (queue, filters, current) into the scaffold's pattern, or vice versa. Don't try to rewrite both at once.
2. **CSS / palette** — if your existing app has a different visual language, keep yours. The scaffold's CSS is a baseline; aesthetics are negotiable.

When stuck, file the conflict in `docs/bugs.md` with `Severity: blocking-ios-build` and walk through it on a fresh session.
