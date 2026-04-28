# App Store Connect setup — Safari-only, no Mac required

15–20 minutes, all in your browser. Do this **before** the cloud Mac is ready so the app record exists when the first build is uploaded.

## Prerequisites
- ✅ Apple Developer Program membership (you have this)
- A modern browser (Safari recommended; Chrome works)
- Your Apple ID password

---

## Step 1 — Sign in
1. Go to https://developer.apple.com/account/
2. Sign in with your Apple ID
3. You should see the **Account** page with sections for **Certificates, Identifiers & Profiles** and **App Store Connect**

If you see "Pending Approval," your enrollment hasn't fully landed yet — wait until it shows **Apple Developer Program** as your membership type.

---

## Step 2 — Note your Team ID

You'll need this when configuring Xcode later.

1. On the Account page, top right, find **Membership details**
2. Copy the **Team ID** (10 characters, e.g. `ABC1234DEF`) — paste it somewhere safe (1Password, Bitwarden, Notes app)
3. Also note the **App ID Prefix** if listed separately — usually same as Team ID

---

## Step 3 — Register the App ID

This is the unique identifier Apple uses for your app across all their systems.

1. Go to **Certificates, Identifiers & Profiles**: https://developer.apple.com/account/resources/identifiers/list
2. Click the blue **+** next to "Identifiers"
3. Select **App IDs** → Continue
4. Type: **App** → Continue
5. Fill in:
   - **Description**: `Trailer Roulette iOS`
   - **Bundle ID**: select **Explicit** and enter `app.trailerroulette.ios`
6. **Capabilities**: ⚠️ leave everything UNCHECKED. We don't need Push, IAP, Sign In with Apple, App Groups, etc., for v1. (Adding capabilities you don't actually use can trigger 4.2 review patterns.)
7. **App Services**: leave defaults
8. → **Continue** → **Register**

You should now see `app.trailerroulette.ios` in your Identifiers list.

---

## Step 4 — Create the App Store Connect app record

This is the metadata "shell" that holds your app on the App Store.

1. Go to App Store Connect: https://appstoreconnect.apple.com/apps
2. Click the blue **+** → **New App**
3. Fill in the dialog:
   - **Platforms**: ✅ iOS
   - **Name**: `Trailer Roulette`
     - If Apple says it's taken, fall back to: `Trailer Roulette: Reel`
     - Apple checks uniqueness across all of App Store. If neither works, ping me and I'll generate alternatives.
   - **Primary Language**: English (U.S.)
   - **Bundle ID**: select `app.trailerroulette.ios — Trailer Roulette iOS` from the dropdown
   - **SKU**: `trailerroulette-ios-v1` (this is your internal ID; Apple shows it nowhere user-visible)
   - **User Access**: Full Access
4. → **Create**

You should land on the app's main page in App Store Connect.

---

## Step 5 — Set the app's basics (won't be visible until submission)

While you're in App Store Connect, fill in the items that don't depend on a build:

### App Information (left sidebar)
- **Subtitle**: `Shuffle. Discover. Save.`
- **Bundle ID**: confirm `app.trailerroulette.ios`
- **Primary category**: **Entertainment**
- **Secondary category**: **Lifestyle**
- **Content Rights**: ✅ "Does this app contain, display, or access third-party content?" → **Yes** (we use TMDB metadata and YouTube playback)
  - Then check: ✅ "I have all necessary rights to that third-party content, or it is being used in a manner permitted by the third party."

### Pricing and Availability
- **Price**: Free (USD 0)
- **Availability**: leave as "All countries and regions" for now — we'll narrow to soft-launch country (Canada or Australia) at submission time
- **Pre-orders**: Off

### App Privacy
This is the nutrition label. Walk through it now so you don't have to remember at submission:

1. Click **Get Started** under "App Privacy"
2. **Does this app collect data from this app?** → **No, we do not collect data from this app**
3. → Save

That's it. You're declared as "Data Not Collected" — Apple's strictest posture, the one that matches our codebase reality.

---

## Step 6 — Skip these for now (do at submission time)

These need a build attached or other later inputs:
- Version 1.0 details (description, keywords, screenshots, what's new)
- App Review Information (the reviewer notes paste — already drafted in `docs/SUBMISSION-CHECKLIST.md`)
- Privacy policy URL (we'll add the Vercel subdomain after deploying the landing page)

---

## Step 7 — Save your credentials

In your password manager, create a "Trailer Roulette" entry with:
- Apple ID: `crescicharles@gmail.com`
- Team ID: (from Step 2)
- App Store Connect app ID: shown at the top of the app's page in App Store Connect (a 10-digit number)
- Bundle ID: `app.trailerroulette.ios`
- App SKU: `trailerroulette-ios-v1`

You'll paste these into Xcode's Signing & Capabilities tab on the cloud Mac.

---

## Done with App Store Connect setup when…
- [ ] Team ID saved in password manager
- [ ] `app.trailerroulette.ios` shows in your Identifiers list
- [ ] App "Trailer Roulette" exists in App Store Connect → Apps
- [ ] App Information filled (subtitle, categories, content rights)
- [ ] Pricing set to Free
- [ ] App Privacy declared as "Data Not Collected"

→ When this is done **and** the cloud Mac is provisioned, open `docs/PHASE-2-LAUNCH.md` (Day 2 onward) on the Mac.

---

## Troubleshooting

**"Bundle ID is already registered"** — someone else (or a prior account of yours) registered it. Try `app.trailerroulette.tr` or `app.trailerroulette.movie` and update `docs/INTEGRATION-GUIDE.md` references.

**"App Name is already in use"** — fall back to `Trailer Roulette: Reel` or `Trailer Roulette: Cinema`. Update `store-listing/description.md` to match.

**"Pending Agreements" banner at the top of App Store Connect** — go to **Agreements, Tax, and Banking** in the left sidebar and accept the latest Free Apps agreement. Apple updates these 1–2x/year and you have to re-accept.
