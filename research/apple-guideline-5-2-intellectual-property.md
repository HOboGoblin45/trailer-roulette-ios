# Apple App Store Review Guideline 5.2 — Intellectual Property

**Source**: https://developer.apple.com/app-store/review/guidelines/#intellectual-property
**Pulled**: 2026-04-25

## Key official language

> "Make sure your app only includes content that you created or that you have a license to use. Your app may be removed if you've stepped over the line and used content without permission."

> "Apps should be submitted by the person or legal entity that owns or has licensed the intellectual property and other relevant rights."

> "If your app is impersonating another app or service, or otherwise misleading users, it will be removed."

Apple has tightened 5.2 scrutiny in recent guideline updates aimed specifically at copycat apps that wrap or aggregate other services' content.

## What this means for us
- We display **TMDB metadata** (titles, posters, descriptions). Covered by TMDB's API ToS for non-commercial / attribution use. Required attribution will appear in the in-app About screen and as a footer line in the App Store description.
- We display **YouTube trailer playback** only via the official embeddable player inside `SFSafariViewController`. We do not download, cache, or reformat their video. See `research/youtube-tos-embedding.md`.
- We do not redistribute studio assets ourselves. Metadata flows through TMDB; video flows through YouTube's player. We add a layer of curation, persistence, and original interaction on top.

## TMDB attribution requirement
TMDB requires a specific attribution line plus (in many surfaces) their logo:

> *"This product uses the TMDB API but is not endorsed or certified by TMDB."*

Will be placed in:
- App Store description (footer line)
- In-app About / Settings screen
- (Optional) splash screen credit

## YouTube usage compliance
- Embed via official player only — see `research/youtube-tos-embedding.md`
- Do not separate / isolate / modify
- Default link back to youtube.com is preserved in the embed
- Trailer playback originates from the publicly available YouTube watch URL, not from any downloaded asset

## Documentation we may need at submission
- Statement that we do not host or redistribute video content
- Confirmation we are using YouTube's official embeddable player
- Confirmation we are using TMDB's public API under attribution terms
- "Why this app is original" memo if reviewer flags 5.2 → see `research/why-this-app-is-original.md`

## Risk register
| Risk | Mitigation |
|------|------------|
| Reviewer treats us as a "YouTube aggregator" | Lead with discovery/personalization in description; subordinate trailer playback |
| Reviewer asks for studio licensing | Point to TMDB + YouTube's public surfaces; explain we display, don't redistribute |
| Reviewer flags impersonation of another trailer app | App is original; no copied UI/branding from competitors |

## References
- Apple guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple's tightened copycat rules (news): https://www.idropnews.com/news/apples-new-app-store-rules-aim-to-stamp-out-copycat-apps/255514/
- TMDB API terms: https://www.themoviedb.org/documentation/api/terms-of-use
- YouTube ToS / Embeddable Player rules: https://www.youtube.com/static?template=terms
