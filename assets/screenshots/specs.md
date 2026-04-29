# App Store Screenshots

Captured by `scripts/capture-screenshots.mjs` against a local Vite preview of
the React build, at exact iPhone pixel dimensions. Apple validates dimensions,
not provenance — these are accepted directly in App Store Connect. Charlie
can swap in real iPhone screenshots later if he wants (same filenames, same
dimensions, drop-in replacement).

## Sizes

| Folder | Pixels (W × H) | Device class | Required? |
|---|---|---|---|
| `6.9-inch/` | 1320 × 2868 | iPhone 16 Pro Max | **Required** (Apple's current default) |
| `6.7-inch/` | 1290 × 2796 | iPhone 15/14 Pro Max | Auto-derived from 6.9" if omitted |
| `6.5-inch/` | 1242 × 2688 | iPhone XS Max | Optional |
| `5.5-inch/` | 1242 × 2208 | iPhone 8 Plus | Optional (legacy) |

Apple's policy as of 2025: only the 6.9-inch set is strictly required —
older sizes are auto-scaled from it. We supply all four anyway because (a)
the older device classes still exist in the wild and (b) our ASO traction
analysis will be cleaner if the legacy phones see screenshots that fit
without rescaling artifacts.

## Frames

| Frame | Caption (use as Apple-ASC overlay text) |
|---|---|
| `01-shuffle.png` | Shuffle through trailers like channels |
| `02-up-next.png` | See what's coming up next |
| `03-filters.png` | Filter by genre and decade |
| `04-watchlist.png` | Save what you love to your Watchlist |
| `05-about.png` | No accounts. No tracking. Your data stays yours. |

App Store Connect lets you add caption text in a separate panel that overlays
each screenshot at upload time — don't bake captions into the PNGs themselves
or they're harder to localize later.

## Regenerate

Whenever the player UI changes, captions become stale, or a new frame is
added to the script:

```powershell
# 1. Build the app and start a preview server
cd app
npm run build
npx vite preview --port 4173 --host 127.0.0.1

# 2. From repo root in another shell
node scripts/capture-screenshots.mjs --url=http://127.0.0.1:4173/

# 3. Stop the preview server
```

## Real-iPhone replacements (optional)

To swap in real iPhone screenshots:

1. On the device, take screenshots normally (Side + Volume Up)
2. AirDrop to a Mac, or Files → "Save to Files" → sync via iCloud
3. Confirm dimensions match the table above (iPhone screenshots come out at
   the right size natively for that device's class)
4. Drop the PNGs into the matching folder, keeping the `01-`/`02-`/etc.
   naming so submission tooling continues to work
