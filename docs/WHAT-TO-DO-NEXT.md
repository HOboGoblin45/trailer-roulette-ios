# What to do next — your 7 commands to v1.0

Updated: each step is now a single PowerShell script. Total active time: ~30 min on your side; the rest is browser actions you alone can do.

## ✅ Done (no action)
- [x] Apple Developer Program enrolled
- [x] All workspace artifacts staged
- [x] App icon PNGs pre-rendered (13 sizes + Asset Catalog Contents.json)
- [x] Splash SVG ready
- [x] Landing page + privacy policy ready
- [x] All App Store metadata final
- [x] GitHub Actions workflows + cert-from-Windows guide ready
- [x] Automation scripts for every mechanical step

## ⏳ Action needed (in this order)

### Setup (one-time, do these once before script 1)
- [ ] Get a TMDB API key — `docs/TMDB-API-KEY-SETUP.md` (5 min)
- [ ] Install GitHub CLI: `winget install GitHub.cli`, then `gh auth login` (3 min)
- [ ] Install Vercel CLI: `npm install -g vercel`, then `vercel login` (2 min)
- [ ] Browser: Set up App Store Connect — `docs/APP-STORE-CONNECT-SETUP.md` (20 min)

### The 7 commands

```powershell
cd "C:\Users\ccres\OneDrive\Documents\Claude\Projects\Trailer Roulette"

# 1. Local setup: npm install + lint + test + build smoke
.\scripts\01-setup-local.ps1

# 2. Generate the iOS code-signing CSR
.\scripts\02-gen-csr.ps1
# → upload the resulting CSR to developer.apple.com (browser)
# → download the distribution.cer to ~/trailer-roulette-certs/

# 3. Build the P12 from the downloaded cert
.\scripts\03-build-p12.ps1
# → create a provisioning profile + ASC API key in your browser
# → download both into ~/trailer-roulette-certs/

# 4. Base64-encode all secrets
.\scripts\04-encode-secrets.ps1

# 5. Create GitHub repo, push, set all 9 secrets + 1 variable
.\scripts\05-create-github-repo.ps1

# Manual: Trigger ios-bootstrap.yml on GitHub Actions (1 click)
# (creates the iOS Xcode project and commits it back)

# 6. Deploy landing page to Vercel; auto-update privacy URL in GitHub
.\scripts\06-deploy-vercel.ps1

# 7. Cut your first release
.\scripts\07-release.ps1 1.0.0
# → ios-release.yml fires, ~15-20 min to TestFlight
```

That's the entire critical path. Each script is idempotent and tells you the next step.

## Stuck somewhere?

| Symptom | Fix |
|---------|-----|
| `npm install` fails on script 1 | Check Node version (`node -v`) — must be ≥20. Re-install from https://nodejs.org |
| openssl not found on script 2 | Install Git for Windows — https://git-scm.com/download/win — it includes openssl |
| Cert download from Apple gives a weird format | It should be a `.cer` file. If you got `.pem` or `.crt`, rename to `.cer` and try script 3 again |
| `gh` says not authenticated on script 5 | Run `gh auth login` first |
| `vercel` says not authenticated on script 6 | Run `vercel login` first |
| `ios-release.yml` fails on signing | Most likely P12 password mismatch or profile-not-App-Store. Re-run script 4 to confirm the secrets cache, then `gh secret list --repo <yours>` to verify they're set |

For deeper troubleshooting, see `scripts/SCRIPTS-OVERVIEW.md`.

## Time budget

| Phase | Active time (your hands on keyboard) | Wall time |
|-------|---------------------------------------|-----------|
| Pre-flight setup (TMDB, gh, vercel install) | 10 min | 10 min |
| Browser: App Store Connect | 20 min | 20 min |
| Browser: Apple Developer (cert + profile + API key) | 15 min | 30 min (clicking around) |
| Scripts 1–7 | 13 min | 60 min (npm + GitHub Actions runtime) |
| Bug bash on real iPhone (TestFlight) | 1–2 hrs | 1–2 weeks (multiple sessions) |
| Apple review wait | 0 | 1–2 weeks |
| **Total to "v1.0 live in App Store"** | ~3 hrs | 4–8 weeks |

## After v1.0 ships
- `docs/POST-LAUNCH-30-DAYS.md` — day-by-day post-launch playbook
- `docs/V1.1-SPEC.md` — Couple's Mode + Stats screen, ~6 weeks after v1.0
- `docs/CERT-RENEWAL.md` — annual cert refresh
