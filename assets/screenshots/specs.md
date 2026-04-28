# Screenshot specs — App Store Connect required sizes

Apple requires screenshots in specific pixel sizes. Use the simulator with the matching device, capture via `scripts/screenshot.sh`, and verify the resolution before upload.

## Required sizes (v1)

| Display | Device | Pixel size | Folder |
|---------|--------|-----------|--------|
| 6.7-inch | iPhone 15 Pro Max | 1290 × 2796 | `6.7-inch/` |
| 6.5-inch | iPhone 11 Pro Max | 1242 × 2688 | `6.5-inch/` |
| 5.5-inch | iPhone 8 Plus | 1242 × 2208 | `5.5-inch/` (Apple still requires this) |
| 12.9-inch iPad Pro | iPad Pro 12.9" (6th gen) | 2048 × 2732 | `ipad/` (only if supporting iPad) |

Minimum 5 screenshots per size, max 10. Same five screens across all sizes.

## The 5 hero screens (in order)

1. **Shuffle / player** — current trailer playing, swipe indicators visible (mid-drag pose), heart + cast + shuffle controls visible
2. **Watchlist** — 6 saved items in the grid; show variety (different genres/eras)
3. **Filters in action** — Action genre + 2010s decade chips both lit; queue narrowed
4. **Up Next bottom sheet expanded** — five upcoming trailers visible
5. **About** — TMDB attribution and privacy posture visible

## Captioning (do this in Figma or any design tool)

Each screenshot should have a short caption above the device frame. Suggested copy:

| # | Caption (short, ≤6 words) |
|---|---------------------------|
| 1 | Shuffle through trailers like channels |
| 2 | Save anything for later |
| 3 | Filter by genre or decade |
| 4 | See what's up next |
| 5 | No accounts. No tracking. |

Use the dark navy palette for caption backgrounds (#0E1726) with gold (#D4AF37) for accent words. Match the in-app aesthetic — App Store visitors should feel the brand before they install.

## File naming convention

`NN-screen-name.png` — sortable, two-digit prefix.

```
6.7-inch/
  01-shuffle.png
  02-watchlist.png
  03-filters.png
  04-upnext.png
  05-about.png
```

## App Preview video (optional but recommended)

15–30s screen recording. Record with:
```bash
xcrun simctl io booted recordVideo --type=mp4 ~/Desktop/trailer-roulette-preview.mp4
# stop with Ctrl+C
```

Then trim with ffmpeg:
```bash
ffmpeg -i input.mp4 -ss 00:00:00 -to 00:00:25 -c copy output.mp4
```

Hero shots in order: cold launch → shuffle → swipe right → save to watchlist → filters → cycle advance.

Add background music license-cleared for commercial use (Epidemic Sound, Artlist, or royalty-free).
