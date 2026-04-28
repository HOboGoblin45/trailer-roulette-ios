# ADR-0002 — App Store path: C with A playback

**Date**: 2026-04-25
**Status**: Accepted

## Context
Apple's review rejects pure YouTube-wrapper apps under:
- **4.2 (Minimum Functionality)** — too thin a wrapper around web content
- **5.2 (Intellectual Property)** — using YouTube content without sufficient added value

YouTube's ToS additionally prohibits "separating, isolating, or modifying" their player.

Three paths were evaluated:
- **A** — Curator/discovery only; trailers open in YouTube
- **B** — License from JustWatch / Reelgood / TVML
- **C** — Add original functionality so trailer playback is one feature among many

## Decision
**Path C (original product) + Path A playback (`SFSafariViewController` on iOS).**

## Rationale
- Path A alone is reliably approved but doesn't justify a standalone product over the YouTube app itself
- Path B costs money and timeline; not appropriate for v1
- Path C builds genuine product value AND survives review
- Using `SFSafariViewController` for playback keeps us inside YouTube's ToS (we host their player intact, not extract their content) and inside Apple's HIG (sanctioned in-app browser surface)

## Consequences
- **Positive**: a real product worth keeping. Approval probability rises sharply. The "product" survives even if YouTube removed embedding tomorrow.
- **Negative**: loss of programmatic "trailer ended" detection on iOS. Mitigated by the existing 90-second cycle timer.
- **Negative**: cannot implement features that require modifying the player (background audio, ad skipping). Acceptable.
- **Operational**: must ship Watchlist + Seen it/Skip it before submission, not as v1.1.

## See also
- `docs/APP-STORE-STRATEGY.md`
- `research/why-this-app-is-original.md`
- `research/youtube-tos-embedding.md`

## Revisit if
- Apple rejects despite the originality memo → escalate to Plan B (Couple's Mode + Stats) or Path B (licensed feeds)
