# iOS code-signing setup — entirely from Windows (no Mac)

This is the doc that lets you publish to the App Store without a Mac. You'll generate a distribution certificate, a provisioning profile, and an App Store Connect API key — all from Windows — then paste them into GitHub Secrets so the `ios-release.yml` workflow can sign and upload your app.

**Time**: ~30 minutes.
**Tools**: Git for Windows (which includes `openssl` and Git Bash) + a browser.

---

## Prerequisites
- ✅ Apple Developer Program enrolled
- ✅ App ID `app.trailerroulette.ios` registered (per `docs/APP-STORE-CONNECT-SETUP.md`)
- ✅ App Store Connect app record created
- Git Bash installed: https://git-scm.com/download/win

Open Git Bash for everything below — these commands won't work in PowerShell or CMD.

---

## Step 1 — Generate the private key + CSR (Certificate Signing Request)

```bash
# Pick a working directory you'll come back to
mkdir -p ~/trailer-roulette-certs
cd ~/trailer-roulette-certs

# Generate a 2048-bit RSA private key
openssl genrsa -out private.key 2048

# Generate a CSR using the private key
openssl req -new -key private.key \
  -out request.csr \
  -subj "/CN=Trailer Roulette Distribution/O=Charlie Cresci/C=US/emailAddress=crescicharles@gmail.com"
```

You now have `private.key` (keep this safe — it's the secret half of the cert) and `request.csr` (you'll upload this to Apple).

---

## Step 2 — Get the distribution certificate from Apple Developer

1. Go to https://developer.apple.com/account/resources/certificates/list
2. Click the blue `+` next to "Certificates"
3. Software → **Apple Distribution** → Continue
4. Upload your `request.csr` file → Continue
5. Apple processes (instant) → Download the resulting `.cer` file (typically `distribution.cer`)
6. Move it to your working directory:
   ```bash
   mv ~/Downloads/distribution.cer ~/trailer-roulette-certs/
   cd ~/trailer-roulette-certs
   ```

---

## Step 3 — Build the P12 (combine cert + private key)

```bash
# Convert Apple's DER-encoded .cer to PEM
openssl x509 -inform DER -in distribution.cer -out distribution.pem

# Combine cert + private key into a P12, password-protected
# Pick a strong password (you'll need it as a GitHub Secret)
openssl pkcs12 -export \
  -out distribution.p12 \
  -inkey private.key \
  -in distribution.pem \
  -name "iPhone Distribution: Charlie Cresci" \
  -password pass:CHANGE_ME_TO_A_STRONG_PASSWORD
```

Replace `CHANGE_ME_TO_A_STRONG_PASSWORD` with a real password. Save it; you'll paste it as `P12_PASSWORD` in GitHub Secrets.

---

## Step 4 — Base64-encode the P12

GitHub Secrets only stores text. We need to encode the binary P12 as base64.

```bash
# Encode and save to a file
base64 -w0 distribution.p12 > distribution.p12.base64

# Or copy directly to clipboard (Windows)
cat distribution.p12.base64 | clip
```

You now have the base64 string in your clipboard. **Save** to `BUILD_CERTIFICATE_BASE64` in GitHub Secrets (Step 9 below).

---

## Step 5 — Create the provisioning profile

1. Go to https://developer.apple.com/account/resources/profiles/list
2. Click the blue `+` next to "Profiles"
3. Distribution → **App Store** → Continue
4. App ID: select `app.trailerroulette.ios — Trailer Roulette iOS` → Continue
5. Certificate: select the distribution cert you just created → Continue
6. Profile Name: `Trailer Roulette App Store` (or any name) → Generate
7. **Download** the resulting `.mobileprovision` file
8. Move it to your working directory:
   ```bash
   mv ~/Downloads/Trailer_Roulette_App_Store.mobileprovision ~/trailer-roulette-certs/
   ```

### Base64-encode the profile

```bash
cd ~/trailer-roulette-certs
base64 -w0 Trailer_Roulette_App_Store.mobileprovision > profile.base64
cat profile.base64 | clip
```

Save to `BUILD_PROVISION_PROFILE_BASE64` in GitHub Secrets.

---

## Step 6 — Create an App Store Connect API Key

This is what the workflow uses to upload the IPA.

1. Go to https://appstoreconnect.apple.com/access/api
2. Click **Generate API Key** (top right of the Keys tab)
3. Name: `GitHub Actions iOS Release`
4. Access: **App Manager** (allows uploading builds; doesn't give global admin)
5. → Generate
6. Apple shows a `.p8` file download — **download immediately** (one-shot; you cannot re-download)
7. Note the **Key ID** (10 characters, shown next to the key in the table)
8. Note the **Issuer ID** (UUID at the top of the Keys tab)

### Base64-encode the API key

```bash
mv ~/Downloads/AuthKey_*.p8 ~/trailer-roulette-certs/
cd ~/trailer-roulette-certs
base64 -w0 AuthKey_*.p8 > apikey.base64
cat apikey.base64 | clip
```

Save to `APP_STORE_CONNECT_API_KEY_BASE64` in GitHub Secrets.

---

## Step 7 — Find your Apple Team ID

1. Go to https://developer.apple.com/account/
2. Top right → **Membership details**
3. Copy the **Team ID** (10 characters, e.g. `ABC1234DEF`)

Save to `APPLE_TEAM_ID` in GitHub Secrets.

---

## Step 8 — Pick a keychain password

The CI workflow creates a temporary macOS keychain to hold the certificate during the build. Pick any password (it's only used during a single workflow run); it does NOT need to be the same as the P12 password.

Save to `KEYCHAIN_PASSWORD` in GitHub Secrets.

---

## Step 9 — Add all secrets to GitHub

1. Go to your repo at https://github.com/<your-handle>/trailer-roulette-ios
2. **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each:

| Secret name | Where it came from |
|-------------|-------------------|
| `BUILD_CERTIFICATE_BASE64` | Step 4 |
| `P12_PASSWORD` | Step 3 (the password you set) |
| `BUILD_PROVISION_PROFILE_BASE64` | Step 5 |
| `KEYCHAIN_PASSWORD` | Step 8 (any string) |
| `APP_STORE_CONNECT_API_KEY_BASE64` | Step 6 |
| `APP_STORE_CONNECT_API_KEY_ID` | Step 6 (the 10-char Key ID, NOT base64) |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID` | Step 6 (the UUID, NOT base64) |
| `APPLE_TEAM_ID` | Step 7 |
| `VITE_TMDB_API_KEY` | Your TMDB v3 API key (https://www.themoviedb.org/settings/api) |

4. Also add a **Repository variable** (not secret — these are visible in logs):
   - Settings → Secrets and variables → Actions → **Variables** tab
   - Name: `VITE_PRIVACY_POLICY_URL`
   - Value: the Vercel URL of your privacy policy (set this after Vercel deploy)

---

## Step 10 — Verify

Sanity-check the secrets list:

| ✅ Should be in Secrets | ❌ Should NOT be in Secrets |
|------------------------|---------------------------|
| `BUILD_CERTIFICATE_BASE64` | `private.key` (stays on your machine) |
| `P12_PASSWORD` | `distribution.cer` (Apple has it; not needed) |
| `BUILD_PROVISION_PROFILE_BASE64` | `request.csr` (one-time use; can delete) |
| `KEYCHAIN_PASSWORD` | `distribution.pem` (intermediate) |
| `APP_STORE_CONNECT_API_KEY_BASE64` | The raw `.p8` file (encoded version is in secrets) |
| `APP_STORE_CONNECT_API_KEY_ID` | |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID` | |
| `APPLE_TEAM_ID` | |
| `VITE_TMDB_API_KEY` | |

---

## Step 11 — Trigger the workflows

```bash
# In your repo
git push
# ci.yml runs on push; should pass

# Manually trigger the iOS bootstrap (one-time):
# GitHub → Actions → "iOS Bootstrap (one-time)" → Run workflow → main
# Wait ~15 minutes; it commits the iOS folder back to your repo.

# Pull the bot's commit
git pull

# Tag and push to trigger the first real release
git tag v1.0.0
git push --tags
# ios-release.yml fires; ~15-20 minutes to TestFlight.
```

Watch the Actions tab. The first release will probably surface 1–2 cert issues — common gotchas in Step 12.

---

## Step 12 — Troubleshooting

**"No matching certificate"** during xcodebuild → the P12 password is wrong, OR the cert is not Distribution (it's Development). Re-check Step 3.

**"No matching provisioning profile"** → the profile's bundle ID doesn't match `app.trailerroulette.ios`, OR the profile is Ad Hoc instead of App Store. Recreate per Step 5.

**"altool: error: Authentication failed"** → API Key ID, Issuer ID, or .p8 contents wrong. Re-do Step 6 carefully — the Key ID and Issuer ID are NOT base64-encoded; they're plain text strings.

**"Team ID is wrong"** → must be EXACTLY 10 characters with no spaces or quotes around it.

**Workflow failed but logs are confusing** → enable "Re-run all jobs" with debug logging:
- Repo Settings → Secrets → add a secret named `ACTIONS_STEP_DEBUG` with value `true`. Re-run the workflow; logs are now verbose.

---

## Important security notes

- The `private.key` from Step 1 is the most sensitive thing here. It can sign apps in your name. Keep it on your local Windows machine; do NOT commit it.
- Once the P12 is encoded into GitHub Secrets, you can in principle delete the local `distribution.p12` and `private.key` — but DON'T, because regenerating means going through this whole flow again. Back them up to a password-manager-attached file.
- If you ever suspect a leak, **revoke the certificate at developer.apple.com** and regenerate. Your existing TestFlight builds keep working until they expire; new builds need the new cert.
- The App Store Connect API key has "App Manager" scope — it can upload builds and manage TestFlight, but cannot change pricing or remove the app from sale. Good blast radius.

---

## What's saved on your Windows machine after this is done?

```
~/trailer-roulette-certs/
├── private.key                   ← keep safe, do not commit
├── request.csr                   ← can delete; one-time use
├── distribution.cer              ← Apple has it; can delete
├── distribution.pem              ← intermediate; can delete
├── distribution.p12              ← keep; backup to password manager
├── distribution.p12.base64       ← can delete; in GitHub Secrets now
├── Trailer_Roulette_App_Store.mobileprovision   ← keep; expires yearly
├── profile.base64                ← can delete
├── AuthKey_<KEYID>.p8            ← keep safe
└── apikey.base64                 ← can delete
```

Add `~/trailer-roulette-certs/` to your password manager's encrypted attachments. Don't push it to a repo, ever.

## Renewals

- **Distribution certificate**: expires in 1 year. Apple will email you before expiry; redo Steps 1–4 and update the GitHub Secret.
- **Provisioning profile**: expires in 1 year. Redo Step 5 and update the secret.
- **API key**: doesn't expire. Revoke + regenerate only if you suspect a leak.

Set a calendar reminder for **2027-04-25** (one year from your enrollment) to renew before expiry. If a cert expires, builds stop working but the App Store listing doesn't go down.
