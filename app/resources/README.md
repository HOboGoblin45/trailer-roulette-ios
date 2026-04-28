# app/resources/

Source images for `npx capacitor-assets generate`. The Capacitor tool reads from this folder and produces all the platform-specific icon and splash sizes.

## Files
- `icon.png` (1024×1024) — the master app icon. **NOT committed** — copy from `../assets/icons/icon-1024.png` before running `capacitor-assets generate`.
- `splash.svg` (2732×2732) — the splash/launch source. The CI workflow rasterizes this to PNG before running capacitor-assets.

## Generate locally (if you ever need to regenerate)
```bash
# From app/
cp ../assets/icons/icon-1024.png resources/icon.png
# Convert splash SVG → PNG (requires ImageMagick or rsvg-convert):
convert -background none -resize 2732x2732 resources/splash.svg resources/splash.png

npx capacitor-assets generate --ios
```

This produces:
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/` — auto-populated with all icon sizes
- `ios/App/App/Assets.xcassets/Splash.imageset/` — auto-populated with splash variants

## In CI
The `ios-bootstrap.yml` workflow:
1. Copies the pre-rendered icons from `assets/icons/` directly (skips capacitor-assets for icons; we have the exact sizes already)
2. Renders `splash.svg` → `splash.png` and runs `capacitor-assets generate --ios --assetPath resources` for the splash

Result: app icon + splash screen are baked into every iOS build automatically.
