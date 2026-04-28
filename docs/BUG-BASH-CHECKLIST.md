# Bug bash — internal beta acceptance

Run before promoting any TestFlight build from internal → external. Walk this list end-to-end on at least one real device per supported size.

## Cold-launch path
- [ ] Tap app icon → splash → first frame within 2.5s
- [ ] No white flash between splash and React mount (background color matches)
- [ ] Splash shows for at least 600ms (so "instant" feels intentional, not glitchy)
- [ ] Header renders below the Dynamic Island / notch with safe-area inset respected
- [ ] First trailer queue populates within 4s of mount

## Player
- [ ] Tap Play → SFSafariViewController opens YouTube
- [ ] Trailer plays without errors
- [ ] Tapping "Done" closes the browser; app marks as paused
- [ ] After 90s, browser auto-closes; next trailer auto-loads
- [ ] If no trailer is available for a movie, the empty state hint shows; shuffle works
- [ ] Player controls (heart, cast, shuffle) are tappable and respond with haptic

## Swipe gestures
- [ ] Right swipe shows "♥ Seen it" indicator at threshold; releases → trailer advances
- [ ] Left swipe shows "✕ Skip it" indicator at threshold; releases → trailer advances
- [ ] Swipe under threshold doesn't advance
- [ ] Vertical scroll over the player still works (gesture doesn't capture vertical)
- [ ] Haptics fire on each successful swipe

## Watchlist
- [ ] Tap heart on player → it fills, badge increments in header
- [ ] Tap watchlist button in header → screen pushes
- [ ] List shows poster, title, year
- [ ] Remove button works; list updates immediately
- [ ] Empty state shows when last item is removed
- [ ] Force quit + relaunch: watchlist state persists

## Taste profile + weighted shuffle
- [ ] Swipe right on 10 action movies (genre 28)
- [ ] Force quit + relaunch + tap shuffle → next 5 trailers should skew action
- [ ] Set a debug toggle (or just inspect via Settings storage screen) to verify
      affinity buckets exist for genre 28

## Filters
- [ ] Genre chips: tap Action → queue refetches with action movies
- [ ] Decade chips: tap 2010s → queue refetches in range
- [ ] Both at once: Action + 2010s → narrow queue, no errors
- [ ] Clear button appears when any filter active
- [ ] Clear clears both filters and refetches

## Up Next
- [ ] Handle visible at bottom in default state
- [ ] Tap or drag handle → sheet expands, list visible
- [ ] Tapping an item plays it now
- [ ] Sheet collapses cleanly on second tap

## Settings / About
- [ ] Version string shows correctly
- [ ] TMDB attribution visible
- [ ] Privacy policy link opens in SFSafariViewController
- [ ] Email link opens Mail composer

## Edge cases
- [ ] Airplane mode: shows graceful error, doesn't crash; on reconnect, refetches
- [ ] TMDB rate limit (429): retries with backoff; shows toast or no-op silently
- [ ] Movie has no trailer: skips to next on shuffle; no error visible
- [ ] Very long movie title: truncates gracefully in card and meta
- [ ] User backgrounds during playback, returns: app state preserved, cycle timer resumes accurately
- [ ] User locks device during playback, unlocks: similar

## Device matrix
At minimum:
- [ ] iPhone SE (3rd gen) — narrow, no Dynamic Island, A15
- [ ] iPhone 15 — modern baseline
- [ ] iPhone 15 Pro Max — Dynamic Island, largest viewport
- [ ] iPad (10th gen) or iPad Air — landscape layout sanity

## Performance
- [ ] No frame drops during chip-row scroll
- [ ] No frame drops during Up Next sheet expand/collapse
- [ ] Memory < 200 MB after 10 minutes of shuffling
- [ ] Battery drain < 6% over 30 minutes of use (Settings → Battery)

## Crash-free
- [ ] Zero crashes during 30-minute soak test
- [ ] No symbolicated crashes in App Store Connect for the build
