# 05-create-github-repo.ps1
# Creates the GitHub repo, pushes the scaffold, sets all 9 secrets + 1 variable.
# Requires `gh` (GitHub CLI) installed and authenticated: gh auth login.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Step 5 — Create GitHub repo + push + set secrets" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check for gh CLI
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "  ✗ GitHub CLI (gh) not installed." -ForegroundColor Red
    Write-Host "    Install: winget install GitHub.cli  (or https://cli.github.com)" -ForegroundColor Yellow
    Write-Host "    Then: gh auth login" -ForegroundColor Yellow
    exit 1
}

# Check auth
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ gh CLI not authenticated. Run: gh auth login" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ gh CLI authenticated" -ForegroundColor Green

# Load cached secrets
$certDir = Join-Path $HOME "trailer-roulette-certs"
$configPath = Join-Path $certDir ".secrets-cache.json"
if (-not (Test-Path $configPath)) {
    Write-Host "  ✗ No secrets cache found at $configPath. Run 04-encode-secrets.ps1 first." -ForegroundColor Red
    exit 1
}
$config = Get-Content $configPath -Raw | ConvertFrom-Json -AsHashtable

# Inputs
$repoName = Read-Host "Repository name [trailer-roulette-ios]"
if (-not $repoName) { $repoName = "trailer-roulette-ios" }

$visibility = Read-Host "Visibility [private/public] (default: private)"
if (-not $visibility) { $visibility = "private" }

# Resolve to the app/ folder
$root = $PSScriptRoot | Split-Path -Parent
$appDir = Join-Path $root "app"

Push-Location $appDir
try {
    # Initialize git if needed
    if (-not (Test-Path ".git")) {
        Write-Host ""
        Write-Host "Initializing git..."
        git init | Out-Null
        git branch -M main | Out-Null
        Write-Host "  ✓ git initialized" -ForegroundColor Green
    }

    # Stage and commit if there are changes
    git add . | Out-Null
    $hasChanges = git diff --staged --name-only
    if ($hasChanges) {
        Write-Host "Creating initial commit..."
        git commit -m "Initial scaffold: Capacitor + React + Vite for Trailer Roulette iOS

- Complete component tree (TrailerRoulette, Player web/iOS split, SwipeOverlay, Watchlist, Filters, UpNext, AboutScreen)
- Lib modules (storage, haptics, dialog, airplay, tasteProfile, weighted shuffle)
- Native AirPlay Capacitor plugin (Swift + Obj-C)
- capacitor.config.ts, vite.config.js, package.json + package-lock.json
- Pre-rendered app icons (1024 + 12 iOS sizes) with Contents.json
- ESLint flat config, Vitest tests (storage, taste profile, shuffle weighting, youtube)
- Pre-staged from production roadmap (2026-04-25)" 2>&1 | Out-Null
        Write-Host "  ✓ Initial commit created" -ForegroundColor Green
    }

    # Create the repo
    Write-Host ""
    Write-Host "Creating GitHub repo $repoName..."
    $existingRepo = gh repo view $repoName 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ! Repo $repoName already exists — using existing" -ForegroundColor Yellow
    } else {
        gh repo create $repoName --$visibility --source . --description "Trailer Roulette iOS app — Capacitor + React" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "gh repo create failed"
        }
        Write-Host "  ✓ Repo created: $visibility" -ForegroundColor Green
    }

    # Push (gh repo create with --source . may have already done this, but be safe)
    Write-Host "Pushing main branch..."
    git push -u origin main 2>&1 | Out-Null
    Write-Host "  ✓ Pushed" -ForegroundColor Green

} finally {
    Pop-Location
}

# Get the repo identifier (handle/name)
$repoFull = (gh repo view $repoName --json nameWithOwner -q .nameWithOwner)
Write-Host ""
Write-Host "Repo: https://github.com/$repoFull" -ForegroundColor Cyan
Write-Host ""

# Enable workflow write permissions (needed for ios-bootstrap.yml to commit back)
Write-Host "Configuring workflow permissions..."
gh api -X PUT "repos/$repoFull/actions/permissions/workflow" `
    -f default_workflow_permissions='write' `
    -F can_approve_pull_request_reviews=true 2>&1 | Out-Null
Write-Host "  ✓ Workflow has write permissions (required for ios-bootstrap)" -ForegroundColor Green

# Set secrets
Write-Host ""
Write-Host "Setting GitHub Secrets..."
$secretKeys = @(
    "BUILD_CERTIFICATE_BASE64",
    "P12_PASSWORD",
    "BUILD_PROVISION_PROFILE_BASE64",
    "KEYCHAIN_PASSWORD",
    "APP_STORE_CONNECT_API_KEY_BASE64",
    "APP_STORE_CONNECT_API_KEY_ID",
    "APP_STORE_CONNECT_API_KEY_ISSUER_ID",
    "APPLE_TEAM_ID",
    "VITE_TMDB_API_KEY"
)

foreach ($k in $secretKeys) {
    $val = $config[$k]
    if (-not $val) {
        Write-Host "  ✗ $k missing from secrets cache" -ForegroundColor Red
        continue
    }
    $val | gh secret set $k --repo $repoFull 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ $k" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $k failed to set" -ForegroundColor Red
    }
}

# Set repo variables
Write-Host ""
$privacyUrl = $config.VITE_PRIVACY_POLICY_URL
if (-not $privacyUrl) {
    $privacyUrl = Read-Host "Vercel privacy policy URL (or press Enter to set later)"
}
if ($privacyUrl) {
    $privacyUrl | gh variable set VITE_PRIVACY_POLICY_URL --repo $repoFull 2>&1 | Out-Null
    Write-Host "  ✓ VITE_PRIVACY_POLICY_URL set as repo variable" -ForegroundColor Green
    $config["VITE_PRIVACY_POLICY_URL"] = $privacyUrl
    $config | ConvertTo-Json | Set-Content $configPath
}

Write-Host ""
Write-Host "✅ Repo created, pushed, and configured." -ForegroundColor Green
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1. Watch the CI workflow: https://github.com/$repoFull/actions" -ForegroundColor White
Write-Host "     The first ci.yml run should pass within 5 minutes." -ForegroundColor White
Write-Host ""
Write-Host "  2. Manually trigger ios-bootstrap.yml (one-time):" -ForegroundColor White
Write-Host "     https://github.com/$repoFull/actions/workflows/ios-bootstrap.yml" -ForegroundColor White
Write-Host "     → Run workflow → main → wait ~15 minutes" -ForegroundColor White
Write-Host "     This commits the iOS Xcode project back to your repo." -ForegroundColor White
Write-Host ""
Write-Host "  3. Then: scripts/06-deploy-vercel.ps1 (if not done) and scripts/07-release.ps1" -ForegroundColor White
Write-Host ""
