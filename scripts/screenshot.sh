#!/usr/bin/env bash
#
# screenshot.sh — drive a booted iOS Simulator through the 5 required screens
# and save labeled screenshots into ../assets/screenshots/<size>/.
#
# Usage:
#   ./scripts/screenshot.sh                  # uses currently booted simulator
#   ./scripts/screenshot.sh "iPhone 15 Pro Max"
#
# Requires:
#   - macOS with Xcode + xcrun
#   - The app installed on the target simulator (Cmd+R from Xcode at least once)

set -euo pipefail

SIM_NAME="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Boot the requested simulator if a name was provided
if [[ -n "$SIM_NAME" ]]; then
  echo "→ Booting $SIM_NAME …"
  xcrun simctl boot "$SIM_NAME" 2>/dev/null || true
  open -a Simulator
  sleep 4
fi

# Derive a folder name from the simulator's screen size class
SIZE_DIR=$(xcrun simctl list devices booted -j | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime in data['devices'].values():
    for d in runtime:
        if d.get('state') == 'Booted':
            n = d['name']
            if 'Pro Max' in n: print('6.7-inch')
            elif 'iPad' in n: print('ipad')
            elif 'SE' in n: print('5.5-inch')
            else: print('6.5-inch')
            break
")

OUT="$ROOT/assets/screenshots/$SIZE_DIR"
mkdir -p "$OUT"

echo "→ Output: $OUT"

# Screen 1 — shuffle player (default boot)
echo "→ Screen 1: Shuffle"
xcrun simctl io booted screenshot "$OUT/01-shuffle.png"
sleep 1

# Screen 2 — Watchlist
# Caller is responsible for navigating; this script just captures.
echo "→ Tap the watchlist icon in the header, then press Enter…"
read -r
xcrun simctl io booted screenshot "$OUT/02-watchlist.png"

# Screen 3 — About
echo "→ Tap the info icon (left side of header), then press Enter…"
read -r
xcrun simctl io booted screenshot "$OUT/03-about.png"

# Screen 4 — Filters active (Action + 2010s)
echo "→ Back to shuffle, tap Action chip + 2010s chip, then press Enter…"
read -r
xcrun simctl io booted screenshot "$OUT/04-filters.png"

# Screen 5 — Up Next expanded
echo "→ Drag the Up Next handle up to expand, then press Enter…"
read -r
xcrun simctl io booted screenshot "$OUT/05-upnext.png"

echo "✓ All 5 screenshots saved to $OUT"
ls -1 "$OUT"
