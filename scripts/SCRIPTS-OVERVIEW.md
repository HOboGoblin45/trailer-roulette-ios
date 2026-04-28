# Scripts overview — your runbook

Run these in order. Each script is idempotent (safe to re-run) and tells you the next step when it finishes.

| # | Script | What it does | Time | Auth needed |
|---|--------|--------------|------|-------------|
| 0 | `preflight.ps1` | Validates the scaffold before any push | 1 min | none |
| 1 | `01-setup-local.ps1` | npm install + .env.local + lint+test+build smoke | 3 min | TMDB key |
| 2 | `02-gen-csr.ps1` | openssl: private key + CSR for Apple | 1 min | none (you upload to Apple via browser) |
| 3 | `03-build-p12.ps1` | openssl: build P12 from downloaded cert | 1 min | P12 password (you choose) |
| 4 | `04-encode-secrets.ps1` | base64-encode P12, profile, API key | 2 min | Apple Team ID + ASC API key IDs |
| 5 | `05-create-github-repo.ps1` | gh: create repo, push, set 9 secrets | 3 min | gh auth login |
| 6 | `06-deploy-vercel.ps1` | vercel --prod, capture URL, update GitHub variable | 2 min | vercel login |
| 7 | `07-release.ps1 1.0.0` | bump, commit, tag, push → triggers iOS release | 1 min | git push perms |

**Total active time**: ~13 minutes if all tools are pre-installed and you have the inputs ready.
**Plus manual steps in the browser**: ~30 minutes (Apple Developer + App Store Connect, can't be automated — your identity is required).

## Manual steps you still must do (browser only)

| Manual step | Where | When |
|-------------|-------|------|
| Sign up for TMDB API key | https://www.themoviedb.org/signup | Before script 1 |
| Register App ID + create app record | https://appstoreconnect.apple.com | Before script 2 |
| Upload CSR, download distribution.cer | https://developer.apple.com/account/resources/certificates/list | Between scripts 2 and 3 |
| Create provisioning profile, download .mobileprovision | https://developer.apple.com/account/resources/profiles/list | Between scripts 3 and 4 |
| Create App Store Connect API key, download .p8 | https://appstoreconnect.apple.com/access/api | Between scripts 3 and 4 |
| Authenticate gh CLI | `gh auth login` | Before script 5 |
| Authenticate vercel CLI | `vercel login` | Before script 6 |
| Trigger iOS Bootstrap workflow | GitHub Actions tab | Between scripts 5 and 7 |
| Paste Vercel URL into App Store Connect → App Privacy | https://appstoreconnect.apple.com | After script 6 |

These exist because they require **your identity** (your Apple ID password, your GitHub login, your Vercel login). I can automate the work *between* them — but logging in for you would be impersonation.

## Required input checklist

Before script 1, have these in hand:
- [ ] TMDB v3 API key (from https://www.themoviedb.org/settings/api)
- [ ] Apple Team ID (10 chars; from https://developer.apple.com/account/ → Membership)
- [ ] Apple ID email
- [ ] App Store Connect API Key ID (10 chars; from the .p8 filename)
- [ ] App Store Connect API Issuer ID (UUID; top of the API Keys page)
- [ ] A GitHub account with PAT (Personal Access Token)
- [ ] A Vercel account

The scripts will prompt for missing values and cache them in `~/trailer-roulette-certs/.secrets-cache.json` so re-runs are fast.

## How to recover from a failed step

Each script is idempotent:
- **Script 1 fails on `npm install`**: re-run after fixing the underlying issue (network, Node version, etc.)
- **Script 2/3 already generated cert files**: prompts for confirmation before overwriting
- **Script 4 missing a secret**: re-run; it asks only for what's missing
- **Script 5 fails midway**: re-run; existing repo is detected and updated
- **Script 6 fails on Vercel**: run `vercel login` then re-run
- **Script 7 fails after push**: the tag is on the remote; just watch the GitHub Actions tab

If everything is in a weird state, delete `~/trailer-roulette-certs/.secrets-cache.json` and re-run from script 4.

## What if I don't have `gh` or `vercel` CLI?

You can do steps 5 and 6 manually:
- **Manual GitHub** — create the repo at https://github.com/new, then `git push`, then add secrets one-by-one at Settings → Secrets and variables → Actions
- **Manual Vercel** — drag-drop the `landing-page/` folder onto https://app.netlify.com or https://vercel.com (web UI)

The scripts just save you typing.

## Security notes

- `~/trailer-roulette-certs/` contains your private signing key + a base64-encoded copy of your P12. **Don't commit this folder anywhere.** Back it up to your password manager's encrypted attachments.
- The `.secrets-cache.json` includes plaintext copies of your TMDB key + the P12 password. It's in your home directory, not the repo, but treat it like sensitive data.
- After running script 5 (which uploads everything to GitHub Secrets), you can in principle delete `.secrets-cache.json` — but don't, because re-runs of subsequent scripts read from it.
