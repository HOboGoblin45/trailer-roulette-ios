# Setup — Phase 2 & 3 reproducible build

Get from "Apple Developer enrolled" to "Xcode builds the iOS Simulator." Every command is scripted so the build is reproducible.

## Prerequisites
- Apple Developer Program membership ($99/yr) — enroll at https://developer.apple.com/programs/enroll/
- Mac access (local or cloud — MacStencil / MacinCloud ~$30/mo)
- Xcode (latest stable) installed from the Mac App Store
- Node.js LTS + npm
- Existing Trailer Roulette web codebase repo URL handy

## App Store Connect setup
1. Sign in at https://appstoreconnect.apple.com/
2. **Certificates, Identifiers & Profiles** → Identifiers → +
   - Bundle ID: `app.trailerroulette.ios` (Explicit)
   - Capabilities (v1): none beyond default. (No Push, no In-App Purchase, no Sign In with Apple.)
3. **Apps → +** → New App
   - Platform: iOS
   - Name: **Trailer Roulette** (fallback: "Trailer Roulette: Cinema Reel")
   - Primary language: English (U.S.)
   - Bundle ID: `app.trailerroulette.ios`
   - SKU: `trailerroulette-ios-v1`

## Local environment
On the Mac:

```bash
mkdir -p ~/Projects/trailer-roulette-ios
cd ~/Projects/trailer-roulette-ios

# Clone existing web project
git clone <existing-trailer-roulette-repo> app
cd app
npm install
npm run dev   # verify web build still works at localhost
# Ctrl-C when verified

# Add Capacitor core + plugins we need for Phases 3-4
npm i @capacitor/core @capacitor/ios @capacitor/cli
npm i @capacitor/browser @capacitor/preferences @capacitor/haptics @capacitor/dialog
npm i -D @capacitor/assets

# Initialize Capacitor with our bundle ID
npx cap init "Trailer Roulette" app.trailerroulette.ios --web-dir=dist

# Build web first (Capacitor needs the dist/ output), then add iOS
npm run build
npx cap add ios
npx cap sync ios

# Open in Xcode
open ios/App/App.xcworkspace
```

In Xcode:
1. Select the `App` target → **Signing & Capabilities** tab
2. Team: select your Apple Developer team
3. Bundle Identifier: confirm `app.trailerroulette.ios`
4. Hit **Cmd+R** to build to the iPhone 15 Simulator

## Verification gates (don't proceed to Phase 3 work until all green)
- [ ] `npm run dev` serves the web app at localhost
- [ ] `npm run build` produces `dist/` without errors
- [ ] `npx cap sync ios` reports zero issues
- [ ] `ios/App/App.xcworkspace` opens cleanly in Xcode
- [ ] Xcode builds to iPhone 15 Simulator without errors
- [ ] App icon and launch screen show (placeholder is fine for now)
- [ ] Existing app loads in the WebView
- [ ] TMDB API call succeeds inside the simulator
- [ ] Cast SDK code is **not** present in the iOS bundle (verify with build size diff or grep)

## Phase 3 code-change checklist (high level)
Detailed acceptance criteria are in `decisions/0003-v1-feature-set.md`. Order:

1. **Player split**: `Player.jsx` → `Player.web.jsx` + `Player.ios.jsx`; switch via `Capacitor.getPlatform()`
2. **Auto-advance timer**: lift state into `TrailerRoulette` parent so it survives the playback-implementation swap
3. **Native dialogs**: replace every `alert()` with `@capacitor/dialog`
4. **Safe-area CSS** for iPhone notch / Dynamic Island in `Header.jsx`
5. **Filters → horizontal scroll** at mobile breakpoints
6. **UpNext → bottom sheet** at mobile breakpoints
7. **Haptics** on shuffle, skip, swipe
8. **Watchlist** screen + persistence
9. **Seen it / Skip it** swipe gestures + taste-profile state
10. **Shuffle weighting** against the taste profile
11. **AirPlay plugin** wrapping `AVRoutePickerView` (Swift)

## Useful commands during dev

```bash
# After a JS-only change
npm run build && npx cap sync ios

# Live reload during dev (iOS pulls from your dev server)
npx cap run ios -l --external

# Production archive for TestFlight (Phase 5)
xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -archivePath build/TrailerRoulette.xcarchive \
  archive

# Then in Xcode: Window → Organizer → Distribute App → App Store Connect
```

## When something breaks
- "No such module 'Capacitor'" → run `pod install` inside `ios/App/` (or `npx cap sync ios` again).
- White screen on launch → check `npm run build` actually wrote to `dist/` and Capacitor's `webDir` matches.
- Bundle ID mismatch error → double-check the value in `capacitor.config.ts`, Xcode signing tab, and App Store Connect all match exactly.
- TMDB calls fail → confirm `NSAppTransportSecurity` doesn't need an exception (TMDB is HTTPS, so it shouldn't).
