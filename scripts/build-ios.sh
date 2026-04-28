#!/usr/bin/env bash
#
# build-ios.sh — single-command pipeline from clean source to a TestFlight-ready
# .xcarchive. Run this on the Mac after Phase 2 setup is complete.
#
# Usage:
#   ./scripts/build-ios.sh
#
# Requires Apple Developer Team ID set in env or auto-detected by Xcode.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"

cd "$APP_DIR"

echo "→ Installing JS deps"
npm install

echo "→ Building web bundle"
npm run build

echo "→ Syncing iOS"
npx cap sync ios

echo "→ Resolving CocoaPods"
(cd ios/App && pod install)

echo "→ Archiving"
mkdir -p "$ROOT/build"
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ROOT/build/TrailerRoulette.xcarchive" \
  archive

echo "✓ Archive at $ROOT/build/TrailerRoulette.xcarchive"
echo
echo "Next: open Xcode → Window → Organizer → select the archive → Distribute App"
echo "Choose: App Store Connect → Upload"
