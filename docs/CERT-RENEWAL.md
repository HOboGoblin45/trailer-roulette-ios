# Certificate renewal — annual obligation

Apple's distribution certificate and provisioning profile each have a 1-year lifetime. **Set a calendar reminder for 2027-04-15** (10 days before the 2027-04-25 expiry of your initial cert).

If you let them expire, **builds stop working** but the live App Store listing stays up — users keep using whatever's currently installed. New TestFlight uploads will fail until you renew.

## What expires when

| Item | Expires | Impact if expired |
|------|---------|-------------------|
| Apple Developer Program membership | 2027-04-25 | Can't make ANY changes; app eventually pulled. Renewal: $99 to Apple. |
| Distribution certificate | 1 year from creation | New builds fail to sign; existing builds in TestFlight + App Store keep running |
| Provisioning profile | 1 year from creation | New builds fail; existing builds keep running |
| App Store Connect API key | Doesn't expire | — (revoke + regenerate only if leaked) |
| TMDB API key | Doesn't expire | — (rotate only if leaked) |

## Renewal procedure (annually)

### 1. Renew the Apple Developer Program
- Apple emails you ~30 days before expiry
- Sign in to https://developer.apple.com/account
- Pay $99 to extend for another year
- ~15 min total; usually instant

### 2. Generate new distribution cert + profile from Windows
Same flow as `docs/IOS-CERT-SETUP-WINDOWS.md`, but you can keep the same `private.key` if you still have it (you should — it's in your password manager).

```bash
cd ~/trailer-roulette-certs

# Reuse private.key + generate a new CSR
openssl req -new -key private.key \
  -out request-2027.csr \
  -subj "/CN=Trailer Roulette Distribution 2027/O=Charlie Cresci/C=US/emailAddress=crescicharles@gmail.com"
```

Upload the CSR to https://developer.apple.com/account/resources/certificates/list, download the new cert, build a new P12, base64-encode, **update the `BUILD_CERTIFICATE_BASE64` GitHub Secret**.

Then create a new provisioning profile (same App ID, new cert), download it, base64-encode, **update `BUILD_PROVISION_PROFILE_BASE64`**.

### 3. Verify with a tagged build
```bash
git tag v1.x.y-renewal-test
git push --tags
```

If the workflow uploads to TestFlight successfully, renewal worked. Untag if you don't want a real release.

### 4. Revoke the old cert
After confirming the new cert works:
1. https://developer.apple.com/account/resources/certificates/list
2. Find the old (now expired or about-to-expire) distribution cert
3. Click → Revoke

Always revoke after renewal. Lingering revokable certs are a leak liability.

## Don't forget

- You'll get **3 reminder emails** from Apple before expiry (60d, 30d, 7d). Treat these as non-optional.
- The renewal does NOT affect end users on the App Store. The app continues to function.
- TestFlight builds expire 90 days after upload regardless of cert status. Plan a refresh upload around active TestFlight cycles.

## Calendar reminder template

Set a recurring annual event for **April 15** with these notes:

```
Trailer Roulette: Renew Apple cert + provisioning profile
- Open docs/CERT-RENEWAL.md
- Pay Apple Developer Program ($99) if not auto-renewed
- Generate new CSR + cert + profile from Windows
- Update GitHub Secrets (BUILD_CERTIFICATE_BASE64, BUILD_PROVISION_PROFILE_BASE64)
- Tag a test build to verify
- Revoke old cert
- Total: ~45 min
```
