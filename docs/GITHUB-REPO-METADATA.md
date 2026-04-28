# GitHub repository metadata — what to fill in

When you create the GitHub repo (or after it exists), fill in these fields. They're easy to forget but they make the repo look polished and help future-you find context.

## Repository description (top of the repo page)
Paste this:
```
A movie-discovery slot machine for iOS. Shuffle through trailers, save what you love, swipe past what you don't. Built with Capacitor + React. No accounts, no tracking, no Mac required to ship it.
```
(279 chars; GitHub allows 350.)

## Repository topics (the colored tags)
Add all of these:
- `ios`
- `capacitor`
- `react`
- `vite`
- `mobile-app`
- `movie-app`
- `trailer`
- `swift-plugin`
- `github-actions`
- `solo-dev`

Topics matter for GitHub search and connect your project to interest communities.

## About section (right sidebar)
- **Website**: paste the Vercel URL once it's deployed (e.g., `https://trailer-roulette-landing.vercel.app`)
- **Topics**: as above
- **Releases / Packages / Deployments**: leave defaults; auto-populates from CI

## Repository settings to flip

Settings → General:
- ✅ Issues
- ✅ Discussions (optional but useful for v1.1+ feedback)
- ❌ Wiki (use docs/ in the repo instead — easier to keep in sync)
- ❌ Projects (overkill for solo)

Settings → Pull Requests:
- ✅ Allow squash merging (default)
- ✅ Always suggest updating pull request branches
- ✅ Automatically delete head branches

Settings → Branches:
- Set `main` as the default branch
- (Optional) Add a branch protection rule on `main`:
  - Require status checks before merging: `CI / ci`
  - Don't require PRs from yourself if you're solo

Settings → Actions → General:
- Workflow permissions: ✅ **Read and write permissions** (required for `ios-bootstrap.yml` to commit back)
- ✅ Allow GitHub Actions to create and approve pull requests

## README badges (already in README.md)

Replace `<your-handle>` once you know your GitHub handle:

```markdown
[![CI](https://github.com/<your-handle>/trailer-roulette-ios/actions/workflows/ci.yml/badge.svg)](https://github.com/<your-handle>/trailer-roulette-ios/actions/workflows/ci.yml)
[![iOS Release](https://github.com/<your-handle>/trailer-roulette-ios/actions/workflows/ios-release.yml/badge.svg)](https://github.com/<your-handle>/trailer-roulette-ios/actions/workflows/ios-release.yml)
```

These show green/red status badges for the CI and iOS release workflows. Useful for spotting silent failures in your peripheral vision.

## Pinning the repo on your GitHub profile (optional)

GitHub → Your profile → Customize your pins → add `trailer-roulette-ios`. Visitors to your profile see it first.

## When to make the repo public

Stay private for v1.0. After v1.0 is in the App Store and stable for ~30 days, consider going public:

**Pros of going public:**
- Free unlimited GitHub Actions macOS minutes (vs 2,000/mo private)
- Inbound interest from indie iOS dev community
- Attracts contributors if you want help

**Cons:**
- Anyone can read the source (acceptable for a non-secret consumer app)
- Have to rotate the TMDB key out of git history (use `git filter-branch` or BFG Repo-Cleaner) — actually we never committed it; it's in GitHub Secrets only, so this is fine
- Open issues from strangers may add noise

I'd recommend going public ~1 month after launch unless there's a specific reason to stay closed.
