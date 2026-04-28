# Apple App Store Review Guideline 4.2 — Minimum Functionality

**Source**: https://developer.apple.com/app-store/review/guidelines/#minimum-functionality
**Pulled**: 2026-04-25

## Why this matters for us
Apps that look like a thin wrapper around web content (especially video) get rejected here. WebView-heavy Capacitor apps are at elevated risk. Our defense is in `research/why-this-app-is-original.md`.

## Key official language

> "Your app should include features, content, and UI that elevate it beyond a repackaged website. If your app is not particularly useful, unique, or 'app-like,' it doesn't belong on the App Store."

> "Your app provides a limited user experience as it is not sufficiently different from a mobile browsing experience. As such, the experience it provides is similar to the general experience of using Safari. Including iOS features such as push notifications, Core Location, and sharing do not provide a robust enough experience to be appropriate for the App Store."

## What this means in practice
- **Adding iOS APIs is not by itself enough.** Push notifications, location, share sheet, etc., do not on their own pass 4.2. The bar is higher.
- **"App-like" means** original UI, persisted user state, gestures and flows that wouldn't make sense in a browser tab.
- Apple has historically accepted Capacitor / Cordova / React Native apps when they offer:
  - Offline functionality (the app works without network for at least some core flows)
  - Native gestures (swipes, long-press, haptics)
  - Original product loops not present on the underlying website
  - User-owned data the app holds independent of any external service
- Apps that *look like* a website-in-a-WebView and *are* a website-in-a-WebView reliably fail.

## Common 4.2 rejection patterns (from forum threads)
- "App is essentially a website" → rebut with originality of UI flows
- "App content is the same as your website" → ship features not on the web
- "App functionality could be better delivered as a Safari bookmark" → ship native gestures and persistence
- "App lacks sufficient differentiation from existing apps" → adjacent to 5.2 territory; rebut with feature inventory

## Our mitigations (mapped to v1 features)
| Mitigation | Implementation |
|-----------|----------------|
| Persisted user state | Watchlist via `@capacitor/preferences` |
| Gesture-based interaction native to mobile | Seen it / Skip it swipes |
| App-only feature absent from web | Local taste profile + biased shuffle |
| Tactile feedback Safari can't deliver | `@capacitor/haptics` on shuffle / skip / swipe |
| Native dialogs vs. browser `alert()` | `@capacitor/dialog` |
| Safe-area awareness (notch / Dynamic Island) | `Header.jsx` updated |
| Smaller attack surface for "thin wrapper" | No login flow, no account, no payments |

## References
- Official guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple Developer Forums precedent threads on 4.2 rejection: https://developer.apple.com/forums/tags/app-store-connect/4-2
- General review tips: https://www.brilworks.com/blog/apple-app-store-review-guidelines/
