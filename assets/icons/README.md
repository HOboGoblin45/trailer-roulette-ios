# Icons — pre-rendered PNG set

Generated 2026-04-25 from `assets/icon-master-1024.svg` via ImageMagick. Drop-in replacement for the Capacitor-default app icon.

## Files
13 PNGs covering every iOS size Apple requires:
| File | Size | Used for |
|------|------|----------|
| `icon-1024.png` | 1024×1024 | App Store marketing |
| `icon-180.png` | 180×180 | iPhone 60pt @3x |
| `icon-167.png` | 167×167 | iPad Pro 83.5pt @2x |
| `icon-152.png` | 152×152 | iPad 76pt @2x |
| `icon-120.png` | 120×120 | iPhone 60pt @2x, iPhone 40pt @3x |
| `icon-87.png` | 87×87 | iPhone 29pt @3x |
| `icon-80.png` | 80×80 | iPhone 40pt @2x, iPad 40pt @2x |
| `icon-76.png` | 76×76 | iPad 76pt @1x (legacy) |
| `icon-60.png` | 60×60 | iPhone 20pt @3x |
| `icon-58.png` | 58×58 | iPhone 29pt @2x, iPad 29pt @2x |
| `icon-40.png` | 40×40 | iPhone 20pt @2x, iPad 40pt @1x, iPad 20pt @2x |
| `icon-29.png` | 29×29 | iPad 29pt @1x |
| `icon-20.png` | 20×20 | iPad 20pt @1x |

`Contents.json` is the iOS Asset Catalog manifest mapping each PNG to its idiom+scale combination.

## How to wire them into the Xcode project (CI does this)

The `ios-bootstrap.yml` GitHub Action workflow includes a step that copies this folder into `ios/App/App/Assets.xcassets/AppIcon.appiconset/` and overwrites Capacitor's default icons. **No manual Xcode work needed.**

If you ever want to regenerate (e.g., updated icon design):
```bash
# From a machine with ImageMagick installed:
cd "<workspace>/Trailer Roulette"
for SIZE in 20 29 40 58 60 76 80 87 120 152 167 180 1024; do
  convert -background none -resize ${SIZE}x${SIZE} \
    assets/icon-master-1024.svg \
    assets/icons/icon-${SIZE}.png
done
```

## Verify before submission
- [ ] Open `icon-1024.png` in any image viewer; it should look crisp
- [ ] Open `icon-29.png` at 100% zoom; the reel + sprocket holes should still be legible (this is the Settings-app size — easy to mess up)
- [ ] Confirm no transparency in any icon (Apple rejects transparent app icons; ours are all on solid navy)
