# Contributing to Trailer Roulette

Trailer Roulette is currently a solo project (Charlie Cresci). PRs from outside contributors are welcome but rare; this doc exists to make the workflow legible.

## Setup

```bash
git clone https://github.com/<your-handle>/trailer-roulette-ios.git
cd trailer-roulette-ios/app

cp .env.local.template .env.local
# Add your TMDB v3 API key to .env.local

npm install
npm run dev   # web preview at localhost:5173
```

## What runs where

| Layer | Where | How |
|-------|-------|-----|
| React/JS | Anywhere (Windows, Mac, Linux) | `npm run dev` |
| Lint | Anywhere | `npm run lint` |
| Tests | Anywhere | `npm run test` |
| Web build | Anywhere | `npm run build` |
| iOS build | GitHub Actions macOS runner | tagged release |

You don't need a Mac. The CI handles iOS builds.

## Branch model

- `main` — what's in TestFlight or the App Store
- `dev` — active work (default branch for PRs)
- Feature branches off `dev`: `feature/<short-name>`
- Bugfix branches off `main` for hotfixes: `hotfix/<issue-number>`

## Before opening a PR

- [ ] `npm run lint` clean
- [ ] `npm run test` clean
- [ ] `npm run build` produces a clean `dist/`
- [ ] If iOS-relevant: noted in the PR description
- [ ] Tests added or updated for new behavior
- [ ] CHANGELOG.md updated if user-visible

## Code style

- ESLint config (`app/eslint.config.js`) is the source of truth
- 2-space indent, single quotes for JS strings, double for JSX attributes
- Functional components only; hooks for state
- One-letter prop names are fine in tight components; verbose names in shared lib
- No external CSS framework — vanilla CSS in `src/styles/index.css`
- No external state management — `useState` and component-owned state only (Watchlist + taste profile use the storage abstraction)

## Architectural rules

- **Data stays on-device.** No analytics SDKs, no telemetry, no fingerprinting. The privacy nutrition label is "Data Not Collected" and we keep it that way.
- **Trailers play through YouTube's official player.** No content extraction, no custom player.
- **Capacitor abstractions live in `src/lib/`.** Components import from lib; never directly import `@capacitor/*` from a component.
- **Native code lives in `local-plugins/`.** Don't add Swift files directly to the iOS Xcode project; package them as Capacitor plugins.

## Commit messages

Use conventional commits-ish:
- `feat: ...` — new feature
- `fix: ...` — bug fix
- `refactor: ...` — code change that doesn't add or fix a feature
- `docs: ...` — documentation only
- `test: ...` — tests only
- `chore: ...` — tooling, deps, build config
- `release: vX.Y.Z` — version bumps

The body should answer: what did you change, why, and what's the user-visible impact?

## Releases

```bash
# After all changes are merged to main:
git checkout main && git pull

# Bump version in app/package.json (e.g. 1.0.0 → 1.0.1)
# Update store-listing/whats-new-v1.0.1.md (if user-visible changes)

git add -A
git commit -m "release: v1.0.1"
git push

git tag v1.0.1
git push --tags
# GitHub Actions ios-release.yml fires → uploads to TestFlight
```

## Reporting bugs

Use the issue templates. For security-sensitive reports (e.g., something that could leak user data), email crescicharles@gmail.com directly.

## License

This codebase is currently UNLICENSED (private to Charlie). If the app sees real adoption and the project becomes open-source, license details will be added here.
