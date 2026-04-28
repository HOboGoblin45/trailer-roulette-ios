# Phase 2 Launch Script (Mac-free path)

End-to-end walkthrough from "Apple Developer approved" to "first TestFlight build live" without ever touching a Mac. **GitHub Actions macOS runners do all the Mac work.**

Updated for: Apple Developer ✅ approved, no local Mac (using GitHub Actions runners), scaffold-as-v1 (no merge), no custom domain v1.

## The Mac-free pipeline at a glance

```
You (Windows) → push code → GitHub repo
                                ↓
                     GitHub Actions macOS runner
                       ↓        ↓        ↓
                    cap sync   pod    archive
                       ↓        ↓        ↓
                    code-sign with secrets you provided
                       ↓
                    upload to TestFlight via App Store Connect API
                       ↓
                    Apple emails you → install on iPhone via TestFlight app
```

You never see Xcode. Apple's CI runs Xcode for you, ~15 minutes per build, free within GitHub's monthly limits.

---

## Day 0 — All browser- and Windows-based (no Mac, no waiting)

Sequence matters. Each step blocks the next.

### A. App Store Connect setup (~20 min)
Walkthrough: [`docs/APP-STORE-CONNECT-SETUP.md`](APP-STORE-CONNECT-SETUP.md)
- [ ] Register App ID `app.trailerroulette.ios`
- [ ] Create app record in App Store Connect
- [ ] Reserve name "Trailer Roulette"
- [ ] Categories (Entertainment + Lifestyle), Free price, Data Not Collected privacy
- [ ] Save Team ID

### B. Push the scaffold to GitHub (~10 min)
Walkthrough: [`docs/SCAFFOLD-TO-GITHUB.md`](SCAFFOLD-TO-GITHUB.md)
- [ ] Create private repo `trailer-roulette-ios`
- [ ] `git push` from `app/` folder on Windows
- [ ] Confirm `ci.yml` runs and passes (Actions tab → green checkmark)

### C. Deploy landing page to Vercel (~5 min)
Walkthrough: [`landing-page/README.md`](../landing-page/README.md)
- [ ] `vercel --prod` from Windows
- [ ] Save the live URL → paste into App Store Connect → App Privacy → Privacy Policy URL

### D. Generate iOS code-signing artifacts from Windows (~30 min)
Walkthrough: [`docs/IOS-CERT-SETUP-WINDOWS.md`](IOS-CERT-SETUP-WINDOWS.md)
- [ ] Generate distribution cert + P12 with openssl
- [ ] Create provisioning profile at developer.apple.com
- [ ] Create App Store Connect API key
- [ ] Add 9 secrets + 1 variable to GitHub repo

### E. Bootstrap the iOS project (~15 min, automated)
- [ ] Go to GitHub → Actions → "iOS Bootstrap (one-time)" → **Run workflow**
- [ ] Wait for the macOS runner to complete (~10–15 min)
- [ ] Pull the bot's commit on Windows: `git pull`
- [ ] Verify: `app/ios/App/App.xcworkspace` now exists in your local clone

### F. First release to TestFlight (~20 min, automated)
- [ ] On Windows: bump version, then tag and push
  ```bash
  git tag v1.0.0
  git push --tags
  ```
- [ ] GitHub → Actions → "iOS Release" workflow runs automatically
- [ ] If it fails on signing, see `docs/IOS-CERT-SETUP-WINDOWS.md` § Troubleshooting (most common: P12 password wrong, or profile is Ad Hoc instead of App Store)
- [ ] On success: Apple emails you when the build is "Ready to Test"

---

## Day 1 — TestFlight on your iPhone

You need an iPhone for testing (any model running iOS 16+). The Mac is no longer in the picture.

1. Install the **TestFlight** app on your iPhone (free in the App Store)
2. App Store Connect → TestFlight → Internal Testing → Create Group → "Internal"
3. Add yourself as an internal tester (email = your Apple ID)
4. Apple emails you the TestFlight invite link
5. Open it on your iPhone → install Trailer Roulette → bash through `docs/BUG-BASH-CHECKLIST.md`

---

## Day 2+ — Iterate

```bash
# Code on Windows
# Push code; ci.yml runs (lint + test + build); ~2 min
git add -A
git commit -m "Fix watchlist sort"
git push

# When ready for a TestFlight build:
# Bump app/package.json version → 1.0.1 (or whatever)
git add -A
git commit -m "Bump to 1.0.1"
git push

# Tag to trigger ios-release.yml
git tag v1.0.1
git push --tags
# Watch the Actions tab; ~15-20 min to TestFlight
```

Each release is a single command. No manual Xcode steps.

---

## Done with Phase 2 when…
- [x] Apple Developer Program approved (already done)
- [ ] App Store Connect record created
- [ ] GitHub repo with scaffold pushed
- [ ] All 9 secrets + 1 variable in GitHub Settings → Secrets
- [ ] Vercel deployment of `landing-page/` working
- [ ] `ci.yml` workflow passing on every push
- [ ] `ios-bootstrap.yml` ran successfully (committed `app/ios/`)
- [ ] `ios-release.yml` produced your first TestFlight build
- [ ] App installed and running on your iPhone via TestFlight
- [ ] Cold-launch + Player + Watchlist sections of `BUG-BASH-CHECKLIST.md` all green

→ Proceed to **Phases 5 & 6** (`docs/SUBMISSION-CHECKLIST.md`).

---

## Fallback options if GitHub Actions doesn't work for you

If you hit a wall with cert setup or just want a more interactive experience:
- `docs/CLOUD-MAC-SETUP.md` — rent a cloud Mac for $29/mo (the previous recommended path)
- Or use Codemagic / Bitrise's free tier with a web UI for cert management

The scaffold and rest of the workspace work with any of these paths; only the build pipeline differs.
