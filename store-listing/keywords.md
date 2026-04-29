# Keywords — v1.0 final

Apple's keyword field is one comma-separated string, no spaces around commas, max 100 characters total. Apple already indexes the app name, so don't repeat it.

## Final string (paste this into App Store Connect)

```
trailers,classic,vintage,80s,90s,cinephile,watchlist,movie picker,date night
```

**Character count: 76 / 100.** Twenty-four characters of headroom. The
classic/vintage/80s/90s tokens lean into the new pre-2010 positioning;
"shuffle" / "discover" / "roulette" come back via Apple's auto-indexing
of the app name and subtitle.

## Why these and not others

| Keyword | Reason |
|---------|--------|
| trailers | Primary search term; most direct intent match |
| shuffle | Differentiator — closest to our actual UX |
| discover | High-volume utility verb |
| watchlist | High-intent feature term |
| movie picker | Long-tail; matches "what should I watch" intent |
| roulette | Brand reinforcement; novel for this category |
| date night | Strong use-case keyword |
| cinephile | Identity keyword for the power user |

## Keywords intentionally excluded
- **"trailer"** (singular) — Apple matches singular/plural together; including both wastes characters.
- **"YouTube"** — 5.2 trigger.
- **"TMDB"** — attribution is required, but as a keyword it's both a 5.2 trigger and a wasted character (low search volume from end users).
- **"free"** — overused; ranking suppressed by Apple's algorithm.
- Competitor names (JustWatch, Reelgood, MovieFone) — App Review will flag.

## Reserve list (swap in if ASO data justifies)
- "what to watch"  (15 chars — could replace cinephile + roulette)
- "movie game"     (10 chars — replaces date night)
- "find movies"    (11 chars — replaces movie picker)

Run an ASO tool (AppTweak, Sensor Tower) after the first month and re-balance.
