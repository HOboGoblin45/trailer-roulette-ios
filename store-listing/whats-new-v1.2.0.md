# What's New — v1.2.0

Use for App Store Connect "What's New" field on the v1.2.0 update submission.
4000 char limit; we use ~400 to keep it skim-friendly.

## v1.2.0 (paste this)

```
Inline trailer playback — trailers now play right inside Trailer Roulette instead of opening a separate browser. Smoother, faster, no app-switching.

What's new under the hood:
• Real video-end detection — when a trailer finishes, the next one starts automatically (no more arbitrary 90-second cutoffs).
• Background-aware — playback pauses when you switch apps, resumes when you come back.
• Pre-fetching the next trailer in the queue eliminates the gap between videos.
• Recovery: if loading fails, tap "Try again" to retry without restarting.
```

(395 chars; well under the 4000 char limit.)

## Why this messaging

The biggest user-visible change is "trailers play in-app." Lead with that.
Everything else is a benefit framed in user terms — no plugin names, no
"@capacitor/browser", no IFrame Player API. The user sees a smoother
experience; that's the message.

Avoid:
- "Fixed bug" / "we squashed bugs" — suggests v1.0/v1.1 had bugs Apple's
  reviewer might dig into. Frame everything as additions.
- "Breaking change" / "removed Safari View Controller" — invisible to user.
- Tech jargon (IFrame, WKWebView, plugin) — doesn't sell.
