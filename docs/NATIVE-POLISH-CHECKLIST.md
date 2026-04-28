# Phase 4 — Native polish checklist

Items to complete in Xcode after Phase 3 code is in place. Strike through as done.

## App icon
- [ ] `assets/icon-master-1024.svg` exported to PNG at 1024×1024
- [ ] PNG placed at `app/resources/icon.png`
- [ ] `npx @capacitor/assets generate --ios` run; all 18 icon sizes generated
- [ ] Verify in Xcode: Assets → AppIcon shows all slots filled
- [ ] Visual check: icon at 29pt (Settings size) is still legible

## Launch screen
- [ ] `assets/launch-screen.svg` rendered to PNG at 2x and 3x for the largest iPhone
- [ ] Xcode → `LaunchScreen.storyboard` updated to show the rendered image, centered
- [ ] Background color matches `#0E1726` (the icon background) so there's no flash
- [ ] Tested on cold launch: no white flash, no jump to first screen

## Info.plist
Merge the keys from `app/ios-native/Info.plist.additions.xml`:
- [ ] `CFBundleDisplayName` = `Trailer Roulette`
- [ ] `UISupportedInterfaceOrientations` = portrait + both landscape
- [ ] `UISupportedInterfaceOrientations~ipad` = all four
- [ ] `UIUserInterfaceStyle` = Dark
- [ ] `UIStatusBarStyle` = Light content
- [ ] `WKAppBoundDomains` = youtube.com, themoviedb.org, image.tmdb.org, api.themoviedb.org, youtube-nocookie.com, youtu.be
- [ ] **No** unused NSCameraUsageDescription / NSMicrophoneUsageDescription / NSLocation* / NSPhotoLibrary* keys

## Signing & Capabilities
- [ ] Team selected (Apple Developer Program enrollment confirmed)
- [ ] Bundle Identifier: `app.trailerroulette.ios`
- [ ] Provisioning profile: automatic for development
- [ ] Capabilities: none beyond Capacitor defaults
- [ ] **Skip Sign In with Apple, Push, In-App Purchase, App Groups, Background Modes** for v1

## AirPlay plugin (already documented in `app/ios-native/README.md`)
- [ ] `AVRoutePlugin.swift` and `AVRoutePlugin.m` added to App target
- [ ] Bridging header generated and accepted
- [ ] App builds with no warnings related to the plugin
- [ ] On a real device, Cast button presents the AirPlay picker

## Build settings
- [ ] Deployment target: iOS 16.0 minimum (gives us SwiftUI / SF Symbols access if we use them later; Capacitor 6 requires 13+ but 16 is the right modern floor)
- [ ] Swift version: 5.9+
- [ ] Architectures: standard (arm64 only for App Store; simulator includes x86_64)

## Privacy nutrition label (form lives in App Store Connect, see PRIVACY-NUTRITION-LABEL.md)
- [ ] All data categories declared as "Not collected"
- [ ] "Tracking" answered No
- [ ] Privacy policy URL filled in

## Visual QA on simulators
Run each, eyeball the screens, fix issues:
- [ ] iPhone SE (3rd gen) — narrowest current device; chip rows must scroll, no clipping
- [ ] iPhone 15 — common case
- [ ] iPhone 15 Pro Max — Dynamic Island; safe-area top should clear it
- [ ] iPad Pro 12.9" — desktop layout (`@media (min-width: 900px)`) kicks in, Up Next becomes a sidebar

## Performance pass
- [ ] Cold launch < 2 seconds to first render on iPhone 15 Simulator
- [ ] Memory footprint < 200 MB during steady-state shuffling (Instruments → Activity Monitor)
- [ ] No retain cycles in the JS-Capacitor bridge listeners (Browser.addListener cleanup)

## Final sanity check
- [ ] `npx cap doctor` shows no issues
- [ ] Archive builds without warnings (`npm run ios:archive`)
- [ ] Archive validates against App Store Connect (Xcode → Organizer → Validate App)
