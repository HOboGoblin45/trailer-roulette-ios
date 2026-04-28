# airplay-plugin

Local Capacitor 6 plugin that wraps `AVRoutePickerView` for AirPlay route selection.

This is a **local plugin** consumed via `npm install file:./local-plugins/airplay-plugin`. It is auto-discovered by `npx cap sync ios` and linked into the Xcode project's Pods. **No manual Xcode file-adding needed** — that's the whole point of structuring it this way (CI-friendly).

## Why local?
- Single private app, no need to publish to npm.
- Keeps the plugin source under version control with the app.
- `npx cap sync ios` picks it up automatically; works in GitHub Actions runners.

## Files
- `package.json` — declares this as a Capacitor plugin (the `capacitor.ios.src` field tells `cap sync` where to find native code)
- `AirplayPlugin.podspec` — CocoaPods spec for the iOS source
- `ios/Plugin/AirplayPlugin.swift` — the actual native logic
- `ios/Plugin/AirplayPlugin.m` — Capacitor registration macro
- `src/index.js` — JS interface; the rest of the app imports from here

## Usage from app code
```js
import Airplay from 'airplay-plugin';

await Airplay.presentRoutePicker();
const { active } = await Airplay.isAirPlayActive();
```

## Updating
- Bump `version` in `package.json` when changing the native code
- Run `npx cap sync ios` after any change in this folder
- iOS builds will pick up the new code via Pods

## API
| Method | Returns | Description |
|--------|---------|-------------|
| `presentRoutePicker()` | `{ presented: boolean, source: string }` | Shows the system AirPlay picker |
| `isAirPlayActive()` | `{ active: boolean }` | True if audio is currently routed via AirPlay |
