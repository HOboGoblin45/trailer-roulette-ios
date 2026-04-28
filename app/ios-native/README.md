# ⚠️ This folder is superseded by the local Capacitor plugin

The AirPlay plugin source lives at `app/local-plugins/airplay-plugin/` now.

## Why the move?
The original layout (raw Swift + Obj-C files in `ios-native/`, manually added to the Xcode target) only works when a human runs Xcode. For our **GitHub Actions Mac-free build path**, we need the plugin to be auto-discovered by `npx cap sync ios` — that requires the canonical Capacitor plugin structure (a sub-package with a `package.json` + podspec).

## What changed
- Source files moved to `app/local-plugins/airplay-plugin/ios/Plugin/`
- Renamed `AVRoutePlugin` → `AirplayPlugin` (matches the package name; no functional change)
- Plugin is now declared as a dependency in `app/package.json`: `"airplay-plugin": "file:./local-plugins/airplay-plugin"`
- `app/src/lib/airplay.js` imports from the local plugin name

## Integration
Nothing manual. `npx cap sync ios` does it.

## What's left in this folder
- `Info.plist.additions.xml` — still relevant; merged into `ios/App/App/Info.plist` after `cap add ios`. The GitHub Actions bootstrap workflow handles this merge automatically.
- This README, for future archaeologists.
