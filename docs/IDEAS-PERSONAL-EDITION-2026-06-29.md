# Trailer Roulette — the version you'd actually want to own

**Date:** 2026-06-29 · A second brainstorm, reframed.

## The reframe

You don't want to market this. You want it **for yourself and your friends**, parked on the App Store so it's easy to install. That's liberating: we stop caring about ASO, "moats," and what ReelMatch does, and start caring about one question —

> **What would make *you* open this instead of just typing a movie into YouTube?**

The answer isn't "more features." It's **personality**: the things a big app would never ship because they don't scale, but that make a personal app a joy. Lean-back, playful, a little chaotic, great with friends in the room. Below, grouped by the feeling they create. (The earlier marketing-oriented doc still has the "channels/game/wrapped" mechanics — this one is the personal cut, and it reprioritizes hard.)

---

## A. Lean-back — "put it on and leave it"

1. **Ambient / Lobby Mode** *(building now)* — a muted-by-default, auto-advancing trailer wall. Cast it to the TV at a party, leave it on while you cook, let it run as a moving movie poster. This is the single most "for me" feature and it's why I'm building it first.
2. **Time Machine** — "take me to a random Friday night, 1987." The feed pretends you're browsing that week's new releases — trailers, needle-drops, and all. A genuinely magical, nostalgic way to channel-surf an era. *(S–M; reuses the era engine.)*
3. **Double Feature / "Program my night"** — pick a vibe (heist night, '90s rom-coms, "scare me"), get a hand-sequenced run of 3–4 trailers that builds like a real theater pre-show. Press play, lean back. *(M.)*

## B. With friends — small group, no accounts, in the room

4. **Pass-the-phone party mode** — everyone takes a turn; each rates a few trailers; the app spits out a **"tonight's shortlist"** everyone had a hand in. No logins, no sync — it's just the one phone going around the couch. *(S–M.)*
5. **Couch Vote** — the channel's on the TV (AirPlay); everyone opens the app, joins with a 4-letter room code, and **votes keep/skip** on what's playing. The crowd steers the channel. The most "my friends will love this" idea here. *(L — needs local/peer networking.)*
6. **Send-a-reel** — share a movie (or a whole little themed list) to a friend via a link or AirDrop; they open it straight into the app. Friends-spread without a social network. *(S.)*

## C. Just for you — taste & memory

7. **Year-in-Trailers ("Wrapped")** — a private, on-device retrospective: "612 trailers, 41 saved, your taste ran 1971→2025, your most-skipped genre is musicals." Shareable as one image if you want. Pure personal delight. *(S–M.)*
8. **Trailer journal** — a one-tap reaction ("🔥 / 😴 / 🤔") and an optional private note per movie. Over time it becomes *your* film diary, built from trailers. *(S.)*
9. **Rabbit-hole** — from any trailer, "more from this director / this cast / this energy." Turn a 2-minute watch into a 40-minute happy spiral. *(M; note: this would re-add the `getRecommendations`/`getPersonMovies` calls I just pruned — easy to bring back for a real feature.)*

## D. The roulette soul — surprise & mischief

10. **The actual Roulette Wheel** — a tactile, haptic **spin** that lands on a decade/genre/runtime and fires off a matching trailer. Lean into the name. Spinning it should feel *good*. *(S–M.)*
11. **Blind Date with a Movie** — title and poster hidden; you commit to Save or Skip on the trailer's vibe alone, then it reveals. Great for breaking out of your usual taste. *(S.)*
12. **Trailer Russian Roulette** *(party)* — six trailers, one "chamber" is a glorious stinker you're honor-bound to watch to the end. Dumb, hilarious, very shareable with friends. *(S.)*
13. **Trope Bingo** *(party)* — a bingo card of trailer clichés ("record-scratch freeze-frame," "the BWAAAM," "in a world…"); play along during an ambient session. *(M.)*

## E. For the film nerd in you

14. **Guess-the-Decade / Name-That-Trailer** — hide the title, guess the era or the film, reveal. A great solo time-killer and a fun pass-the-phone game. *(M.)*
15. **"Why this?" one-liners** — a single curated hook under a film ("flopped in '82, now a cult classic"). Your own little editorial layer; could even be notes you write yourself. *(M, content.)*

---

## What I'd actually build (personal-use order)

1. **Ambient / Lobby Mode** — *(in progress)* the core lean-back experience; everything else can ride on top of it.
2. **The Roulette Wheel** + **Blind Date** — cheap, pure personality, on-brand. Make the app *feel* like roulette.
3. **Time Machine** — the "whoa" feature; uses the engine you already have.
4. **Wrapped + Trailer journal** — quietly the most rewarding over months of personal use.
5. **A friends feature** — start with **Pass-the-phone** (easy) before the ambitious **Couch Vote** (peer networking).

## What to drop (given you're not marketing)

- ASO/keyword tuning, competitive positioning, "couples mode as differentiator" — none of it matters for a personal app. Keep just enough store copy to pass review (done).
- Anything that needs accounts or a backend. The whole charm here is that it's local and yours.

> Everything above runs on-device with no accounts, consistent with the app's privacy posture — and conveniently, each of these *also* deepens the "this is an original product, not a YouTube wrapper" case for App Review. Fun and defensibility happen to point the same direction.
