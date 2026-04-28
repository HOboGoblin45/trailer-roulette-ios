# 06-deploy-vercel.ps1
# Deploys the landing-page/ folder to Vercel. Captures the live URL and updates
# both your local secrets cache and the GitHub repo variable.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Step 6 — Deploy landing page to Vercel" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check for vercel CLI
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Vercel CLI..."
    npm install -g vercel 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Failed to install vercel CLI" -ForegroundColor Red
        exit 1
    }
}

$root = $PSScriptRoot | Split-Path -Parent
$landingDir = Join-Path $root "landing-page"
if (-not (Test-Path $landingDir)) {
    throw "landing-page/ folder not found at $landingDir"
}

Push-Location $landingDir
try {
    # Auth check
    Write-Host "Checking Vercel auth..."
    $whoami = vercel whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Not authenticated. Running vercel login..." -ForegroundColor Yellow
        vercel login
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ✗ vercel login failed" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host "  ✓ Authenticated" -ForegroundColor Green

    # Deploy
    Write-Host ""
    Write-Host "Deploying to production..."
    $output = vercel --prod --yes 2>&1
    $output | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }

    # Extract the URL — Vercel prints it on a line starting with "https://"
    $url = $output | Where-Object { $_ -match '^https://[\w\-]+\.vercel\.app' } | Select-Object -First 1
    if (-not $url) {
        Write-Host "  ! Could not auto-detect URL from output." -ForegroundColor Yellow
        $url = Read-Host "Paste the production URL Vercel printed above"
    } else {
        $url = $url.Trim()
    }

    $privacyUrl = "$url/privacy"

    Write-Host ""
    Write-Host "  ✓ Live URL: $url" -ForegroundColor Green
    Write-Host "  ✓ Privacy:  $privacyUrl" -ForegroundColor Green

    # Cache + update GitHub repo variable
    $certDir = Join-Path $HOME "trailer-roulette-certs"
    $configPath = Join-Path $certDir ".secrets-cache.json"
    $config = @{}
    if (Test-Path $configPath) {
        $config = Get-Content $configPath -Raw | ConvertFrom-Json -AsHashtable
    }
    $config["VITE_PRIVACY_POLICY_URL"] = $privacyUrl
    $config["VERCEL_LANDING_URL"] = $url
    $config | ConvertTo-Json | Set-Content $configPath
    Write-Host "  ✓ Cached in $configPath" -ForegroundColor Green

    # Update GitHub repo variable if we have gh + a repo
    if (Get-Command gh -ErrorAction SilentlyContinue) {
        $repoFull = $null
        Push-Location (Join-Path $root "app")
        try {
            if (Test-Path ".git") {
                $remote = git remote get-url origin 2>$null
                if ($remote -match 'github\.com[:/]([\w\-]+/[\w\-]+?)(\.git)?$') {
                    $repoFull = $matches[1]
                }
            }
        } finally {
            Pop-Location
        }
        if ($repoFull) {
            Write-Host "Updating GitHub repo variable VITE_PRIVACY_POLICY_URL..."
            $privacyUrl | gh variable set VITE_PRIVACY_POLICY_URL --repo $repoFull 2>&1 | Out-Null
            Write-Host "  ✓ GitHub variable updated" -ForegroundColor Green
        }
    }

} finally {
    Pop-Location
}

Write-Host ""
Write-Host "✅ Landing page deployed." -ForegroundColor Green
Write-Host ""
Write-Host "Now do this manually:" -ForegroundColor Cyan
Write-Host "  - Go to App Store Connect → Trailer Roulette → App Privacy" -ForegroundColor White
Write-Host "  - Paste this URL into the Privacy Policy URL field:" -ForegroundColor White
Write-Host "      $privacyUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  - Manually trigger ios-bootstrap.yml on GitHub Actions (one-time)" -ForegroundColor White
Write-Host "  - Then: scripts/07-release.ps1 to cut your first TestFlight build" -ForegroundColor White
Write-Host ""
