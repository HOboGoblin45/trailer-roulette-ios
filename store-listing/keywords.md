# Keywords — v2.0.1 (all-eras discovery)

Apple's keyword field is one comma-separated string, no spaces around commas,
max 100 characters. Apple already indexes the app name + subtitle, so don't
repeat "Trailer Roulette" or obvious tokens from them.

## Final string (live in App Store Connect)

```
movie trailers,trailers,films,what to watch,streaming,new movies,movie night,cinema,watchlist
```

**Character count: 93 / 100.**

## Why these
| Keyword | Reason |
|---------|--------|
| movie trailers / trailers | Primary intent; Apple matches singular/plural together |
| films | Broad category synonym |
| what to watch | High-volume "decide what to watch" intent — pairs with the where-to-watch feature |
| streaming | Matches the where-to-watch feature (which surfaces streaming availability) |
| new movies | Captures the now-included modern catalog |
| movie night | Strong use-case keyword |
| cinema | Category/identity term |
| watchlist | High-intent feature term |

## Notes / risk
- "streaming" is included because the app now has a genuine **Where to watch**
  feature (JustWatch-backed). It points to third-party services; the app does
  not stream movies itself. If App Review ever flags it, swap "streaming" for
  "where to watch".
- "YouTube" and "TMDB" remain excluded (5.2 trigger / wasted characters).
- JustWatch is required as **attribution** (in description + About), but is not
  used as a keyword.

## Reserve list (swap in after ASO data)
- "where to watch" (15) · "find movies" (11) · "movie game" (10)
