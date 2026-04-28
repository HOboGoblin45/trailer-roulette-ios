# GitHub Actions workflows — overview

Three workflows. **You don't need a Mac.**

| Workflow | Trigger | What it does | Runner | Uses secrets? |
|---------|---------|--------------|--------|---------------|
| `ci.yml` | Every push + PR | Lint, test, build the web bundle | Ubuntu | Just `VITE_TMDB_API_KEY` (optional; uses dummy if missing) |
| `ios-bootstrap.yml` | Manual (one-time) | `cap add ios`, merge Info.plist additions, commit results | macOS | None |
| `ios-release.yml` | Tag push (`v*.*.*`) or manual | Build, code-sign, archive, upload to TestFlight | macOS | All signing + ASC API secrets |

## Order of operations (first time)

1. **Push the scaffold to GitHub** (`docs/SCAFFOLD-TO-GITHUB.md`)
2. **`ci.yml` runs automatically** — should pass green within 5 minutes; confirms the JS layer is healthy
3. **Add all the iOS secrets** to GitHub → Settings → Secrets and variables → Actions (`docs/IOS-CERT-SETUP-WINDOWS.md` walks through generating each one)
4. **Manually run `ios-bootstrap.yml` ONCE** — it creates the iOS Xcode project and commits it back. This is the moment you'd otherwise need a Mac for. The bot pushes a commit; pull it down on your Windows machine.
5. **Tag a release** (`git tag v1.0.0 && git push --tags`) — `ios-release.yml` builds, signs, uploads to TestFlight. Watch the Actions tab; if it fails, check the logs.

## Order of operations (subsequent releases)

```bash
# from Windows, after coding changes
git add -A
git commit -m "v1.0.1: fix watchlist sort"
git push
# (ci.yml runs in the background)

# Bump the version
# Edit app/package.json's "version" → "1.0.1"
# (Optionally edit other files)
git add -A
git commit -m "Bump to 1.0.1"
git push

# Tag and push the tag
git tag v1.0.1
git push --tags
# ios-release.yml fires automatically; ~15-20 min to TestFlight
```

## What if `ios-bootstrap` fails?

The workflow checks out, runs `npx cap add ios`, then tries to push. The most likely failure is the `git push` step if the repo is protected. In that case:
- Settings → Actions → General → Workflow permissions → ✅ "Read and write permissions"

If the workflow itself errors during `cap add ios`, copy the logs and ping me — there are a few known edge cases (missing CocoaPods, network blip, etc.).

## What if `ios-release` fails on signing?

99% of the time it's a secret problem. Check:
- `BUILD_CERTIFICATE_BASE64` — is the P12 actually distribution (not development)?
- `BUILD_PROVISION_PROFILE_BASE64` — is the profile **App Store** distribution, not Ad Hoc?
- `APPLE_TEAM_ID` — exactly 10 characters
- The bundle ID inside the provisioning profile must match `app.trailerroulette.ios`

The first run of `ios-release.yml` is the highest-risk step in the entire project. Budget 1–2 hours for cert troubleshooting.

## Cost

- **Public repo**: unlimited macOS minutes (free)
- **Private repo**: 2,000 minutes/month free, then $0.08/min for macOS
  - Each `ios-release.yml` run is ~15-20 min → 100+ free releases per month
  - Easily within free tier for solo dev

If you go over, switch the repo to public (it's just a private app, not a secret) or move to a Mac mini ($300 one-time).
