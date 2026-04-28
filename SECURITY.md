# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in Trailer Roulette, please **email crescicharles@gmail.com directly**. Do NOT open a public GitHub issue — security reports should be private until a fix is in place.

Include:
- A description of the vulnerability
- Steps to reproduce
- Affected version(s) of the app
- Any potential impact you've identified

You'll get an acknowledgment within 48 hours and a fix timeline within 7 days for confirmed issues.

## What we consider in scope

- Code-execution vulnerabilities in the app
- Bypasses that expose user data (we don't have a server, so this is mostly local-storage attacks via SFSafariViewController)
- Supply-chain attacks against our npm dependencies
- Issues in our GitHub Actions workflows that could leak secrets

## What we don't consider in scope

- Bugs in YouTube's player (report to Google)
- Bugs in TMDB's API (report to TMDB)
- Bugs in iOS itself (report to Apple Security: https://security.apple.com)
- Issues that require physical device access AND the user's passcode

## Disclosure

After a fix ships:
- For exploitable bugs: published in the CHANGELOG with a CVE if assigned
- Reporters credited unless they request anonymity

## Cryptographic concerns

The app does not implement custom cryptography. All TLS is via iOS's standard libraries; our distribution certificate is the only cryptographic material in our control.

If our **distribution certificate is leaked**:
1. Revoke at https://developer.apple.com/account/resources/certificates/list
2. Generate a new cert (see `docs/IOS-CERT-SETUP-WINDOWS.md`)
3. Update GitHub Secrets
4. Cut a new patch release

Existing builds in the wild keep working until the cert reaches its 1-year expiry; new builds need the new cert.
