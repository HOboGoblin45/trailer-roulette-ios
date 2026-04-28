# scripts/

Helper scripts. Mix of Windows and macOS — read each header before running.

| Script | Where to run | What it does |
|--------|--------------|--------------|
| `preflight.ps1` | Windows (PowerShell) | Validates the scaffold before your first git push. Checks Node version, JSON validity, file presence, and runs lint+test+build if `node_modules` exists. **Run this BEFORE git init.** |
| `build-ios.sh` | macOS (fallback only — CI handles this normally) | npm install → vite build → cap sync → pod install → xcodebuild archive. Produces `build/TrailerRoulette.xcarchive`. |
| `screenshot.sh` | macOS (with iOS Simulator) | Drives a booted simulator through the 5 required screens; saves PNGs into `assets/screenshots/<size>/`. Interactive. |

## Make the .sh scripts executable (only relevant on macOS)
```bash
chmod +x scripts/*.sh
```

## When to run them

| Phase | Script | Where |
|-------|--------|-------|
| 0 — Pre-push | `preflight.ps1` | Windows |
| 5 — Testing (only if you have Mac access) | `screenshot.sh` per simulator | macOS |
| 6 — Submission (only if Mac path) | `screenshot.sh` for App Store assets | macOS |

## On Windows
- `preflight.ps1` is the main script you'll use
- The `.sh` scripts are macOS-only (xcrun, xcodebuild, pod) — but you don't need them; GitHub Actions handles iOS builds automatically
