# Assets

## Icon
`icon-master-1024.svg` — single source. 1024×1024 with no transparency, no rounded corners.

To generate the iOS icon set after `npx cap add ios`:

```bash
cd app
mkdir -p resources
cp ../assets/icon-master-1024.svg resources/icon.svg
# Convert to PNG once with any tool — capacitor-assets prefers PNG input.
# Easiest:  use the macOS `qlmanage` or open in Preview > Export as PNG.

npx @capacitor/assets generate --ios
```

This produces all 18+ icon sizes Apple requires (29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024 — 1x/2x/3x variants).

## Launch screen
`launch-screen.svg` — designed at iPhone 15 Pro Max viewport (1290×2796). Use as the source for the Xcode launch storyboard, OR pass to `@capacitor/assets` which will generate the splash set.

## Screenshots
Populated in Phase 5/6 by `scripts/screenshot.sh`. Per-device folders mirror App Store Connect's required sizes:
- `screenshots/6.7-inch/` — iPhone 14/15 Pro Max
- `screenshots/6.5-inch/` — iPhone Xs Max / 11 Pro Max
- `screenshots/ipad/` — iPad Pro 12.9"

## App preview video
`preview-video/` — placeholder; recorded in Phase 6 with QuickTime + iPhone Mirroring or `xcrun simctl io booted recordVideo`. Trim with `ffmpeg`.
