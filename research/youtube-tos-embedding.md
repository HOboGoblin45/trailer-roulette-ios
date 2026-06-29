# YouTube ToS — Embedding & player rules

**Sources**:
- https://www.youtube.com/static?template=terms
- https://developers.google.com/youtube/terms/api-services-terms-of-service
- https://developers.google.com/youtube/terms/developer-policies

**Pulled**: 2026-04-25 · **Architecture updated**: 2026-06-28

> The implementation changed since this was first pulled. iOS no longer uses
> `SFSafariViewController`. Trailers now play in YouTube's official IFrame player
> hosted on a first-party https page (our `/embed`) inside a native WKWebView,
> and auto-advance uses the official IFrame Player API's `onStateChange` event.
> The sections below reflect the current build.

## Permitted
- Show YouTube videos through the **official embeddable YouTube player**.
- Open YouTube content in `SFSafariViewController` / Custom Tabs / equivalent — these surfaces host YouTube's player as YouTube serves it, without modification.

## Forbidden (verbatim from policies)

> "You may not modify, build upon, or block any portion or functionality of the Embeddable Player, including but not limited to links back to the YouTube website."

> "You must not separate, isolate, or modify the audio or video components of any YouTube audiovisual content made available as part of, or in connection with, YouTube API Services."

> "You agree not to alter or modify any part of the Service."

## What we do
- iOS plays trailers in YouTube's **official IFrame embedded player**, hosted on a first-party https page (our `/embed` page) loaded in a native WKWebView. The video streams directly from YouTube to its own player, intact — ads, controls, and the link back to YouTube included. The page exists only to supply a valid https referrer (a documented WebKit limitation, Bug 169846, strips it otherwise); we do **not** proxy, cache, or touch the video stream.
- Web plays via the official IFrame embed without modification.
- We do **not** rip, cache, download, or reformat YouTube content.
- We do **not** modify, skin, overlay, or block the player. We read **only** the official IFrame Player API's published `onStateChange` events — to know when a trailer ends so we can queue the next one. That is a documented, sanctioned use of YouTube's own API, not an inspection or modification of the player internals.

## What we don't do
- No mp3-style audio extraction
- No background-only playback (would require modifying the player)
- No skipping ads (we don't touch the player UI)
- No custom skin/overlay over the player
- No repackaging trailer URLs as our own URL scheme

## How auto-advance is compliant
Trailers advance when the **official IFrame Player API reports the video has ended** (`onStateChange` → ENDED) — the documented, intended way to detect the end of an embedded video. We then load the next trailer in the same official player. We do not modify, skin, or block the player, and we do not extract or proxy the video. A short watchdog timeout only guards against a trailer that never loads (it dismisses the view); it does not alter playback. The web build uses the same official IFrame Player API.

## Risk register
| Risk | Mitigation |
|------|------------|
| Detecting "trailer ended" | Uses the official IFrame Player API's `onStateChange` (ENDED) event, forwarded from the first-party embed page to native. Sanctioned API use; no player modification. |
| AirPlay output | Routes the player's video natively via AVRoutePickerView. Does not modify the player. Compliant. |
| Background playback | Disabled. Would require modifying the player. |
| Picture-in-picture | Out of scope for v1. PiP would require the iOS AVPlayer, which would mean downloading or proxying YouTube content. Don't do it. |
