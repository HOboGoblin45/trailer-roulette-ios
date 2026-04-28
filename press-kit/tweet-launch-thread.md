# Tweet/X launch thread

Schedule for the same day as Product Hunt, ~30 minutes after launch goes live.

## Thread (each line is a separate tweet; max 280 chars each)

**1/**
```
Six weeks ago I had a React web app called Trailer Roulette.

Today it's live in the App Store. 🎬

A slot machine for movie trailers. Shuffle, swipe, save. Your taste, your phone.

🔗 https://trailerroulette.app
```

**2/**
```
The premise: choosing a movie has gotten harder, not easier. Streaming services know what's new — they don't know what's *you*.

So Trailer Roulette spins through curated trailers, you swipe right on what you loved, and the app builds a taste profile right on your phone.

Nothing leaves the device.
```

**3/**
```
The hard part wasn't the code. It was Apple.

App Review rejects pure trailer apps under 4.2 (Minimum Functionality) and 5.2 (Intellectual Property). YouTube's ToS forbids modifying their player.

Solution: build a real product around the playback. Watchlist + Seen-it/Skip-it + smart shuffle.

That's the originality story.
```

**4/**
```
Stack: Capacitor + React. Same codebase as the web build, plus a custom Swift plugin around AVRoutePickerView for AirPlay.

iOS plays trailers via SFSafariViewController hosting YouTube's official embed. ToS-clean, App-Store-safe.

Cycle timer (90s) handles auto-advance.
```

**5/**
```
Privacy: "Data Not Collected" — Apple's strictest nutrition label.

No accounts. No backend. No analytics SDKs. The only network calls are TMDB (metadata) and YouTube (the player, when you tap play).

It's wild how rare this is in 2026.
```

**6/**
```
Cost to get here: $99 (Apple Developer Program), $30/mo (cloud Mac for ~2 months), $0 for everything else.

Time: 6 weeks wall-clock from roadmap → live.

Solo dev. No funding. Built between day-job hours.
```

**7/**
```
What's next:
- v1.1: Couple's Mode (two people swipe; show movies you both loved)
- v1.2: Stats screen + custom playlists
- v2: rewrite native if v1 lands

If you'd use this, grab it free → https://apps.apple.com/app/trailer-roulette

Feedback always welcome. 🙏
```

## Posting tips
- Include 1 image per tweet for engagement (screenshots from `assets/screenshots/6.7-inch/`)
- Tweet 1 needs the hero image; the rest can use individual feature screenshots
- Don't link in tweet 1 (X downranks tweets with links); use the App Store URL in the bio for the launch day, then post the link in tweet 7
- Pin the thread for at least a week post-launch
