# YouTube ToS — Embedding & player rules

**Sources**:
- https://www.youtube.com/static?template=terms
- https://developers.google.com/youtube/terms/api-services-terms-of-service
- https://developers.google.com/youtube/terms/developer-policies

**Pulled**: 2026-04-25

## Permitted
- Show YouTube videos through the **official embeddable YouTube player**.
- Open YouTube content in `SFSafariViewController` / Custom Tabs / equivalent — these surfaces host YouTube's player as YouTube serves it, without modification.

## Forbidden (verbatim from policies)

> "You may not modify, build upon, or block any portion or functionality of the Embeddable Player, including but not limited to links back to the YouTube website."

> "You must not separate, isolate, or modify the audio or video components of any YouTube audiovisual content made available as part of, or in connection with, YouTube API Services."

> "You agree not to alter or modify any part of the Service."

## What we do
- iOS plays trailers in `SFSafariViewController` via `@capacitor/browser`. The browser loads the YouTube watch page, which serves YouTube's native player intact, including ads, controls, and the link back to YouTube.
- Web plays via the official `<iframe>` embed without modification.
- We do **not** rip, cache, or reformat YouTube content.
- We do **not** intercept the player or observe its DOM.

## What we don't do
- No mp3-style audio extraction
- No background-only playback (would require modifying the player)
- No skipping ads (we don't touch the player UI)
- No custom skin/overlay over the player
- No repackaging trailer URLs as our own URL scheme

## How our cycle timer is compliant
The 90-second auto-close-and-advance is implemented at the **app shell** layer, not the player layer. We start a timer when we open the SFSafariViewController and dismiss the view when it expires. We don't observe the player's playback state or modify its behavior — the timer fires on wall-clock time. From YouTube's perspective, the user simply navigated away.

## Risk register
| Risk | Mitigation |
|------|------------|
| Future feature wants "trailer ended" callback | Cannot use iframe API on iOS inside SFSafariViewController (cross-origin). Workaround: cycle timer. |
| AirPlay output | Routes the player's video natively via AVRoutePickerView. Does not modify the player. Compliant. |
| Background playback | Disabled. Would require modifying the player. |
| Picture-in-picture | Out of scope for v1. PiP would require the iOS AVPlayer, which would mean downloading or proxying YouTube content. Don't do it. |
