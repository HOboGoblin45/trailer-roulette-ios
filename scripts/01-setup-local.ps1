# 01-setup-local.ps1
# Local Windows setup: validate tools, npm install, prepare .env.local.
# Run this FIRST. Run from the workspace root or the app/ folder; the script figures out the rest.

$ErrorActionPreference = "Stop"

# Resolve to the app/ folder regardless of where you ran from
$root = $PSScriptRoot | Split-Path -Parent
$appDir = Join-Path $root "app"
if (-not (Test-Path $appDir)) {
    throw "Could not locate app/ folder at $appDir. Run from the workspace root."
}

Write-Host ""
Write-Host "Step 1 — Local setup" -ForegroundColor Cyan
Write-Host "════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Tool checks
$tools = @{
    "node"    = "https://nodejs.org/en/download (v20+ LTS)"
    "npm"     = "Comes with Node"
    "git"     = "https://git-scm.com/download/win"
    "openssl" = "Comes with Git for Windows"
}
$missing = @()
foreach ($t in $tools.Keys) {
    if (Get-Command $t -ErrorAction SilentlyContinue) {
        Write-Host "  ✓ $t" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $t — install from $($tools[$t])" -ForegroundColor Red
        $missing += $t
    }
}
if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Install the missing tools, then re-run." -ForegroundColor Yellow
    exit 1
}

# Optional but recommended
Write-Host ""
Write-Host "Optional tools:"
$optional = @("gh", "vercel")
foreach ($t in $optional) {
    if (Get-Command $t -ErrorAction SilentlyContinue) {
        Write-Host "  ✓ $t (will use for automated steps)" -ForegroundColor Green
    } else {
        Write-Host "  ! $t not installed (recommended for 05- and 06- scripts)" -ForegroundColor Yellow
    }
}

# .env.local
Write-Host ""
Write-Host "Configuring .env.local..."
Push-Location $appDir
try {
    if (-not (Test-Path ".env.local")) {
        Copy-Item ".env.local.template" ".env.local"
        Write-Host "  Created .env.local from template." -ForegroundColor Green

        $tmdbKey = Read-Host "Paste your TMDB v3 API key (or press Enter to fill in later)"
        if ($tmdbKey) {
            (Get-Content ".env.local") -replace 'VITE_TMDB_API_KEY=.*', "VITE_TMDB_API_KEY=$tmdbKey" | Set-Content ".env.local"
            Write-Host "  ✓ TMDB key written to .env.local" -ForegroundColor Green
        } else {
            Write-Host "  ! Remember to add VITE_TMDB_API_KEY before npm run dev" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  .env.local already exists; skipping." -ForegroundColor Gray
    }

    # npm install
    Write-Host ""
    Write-Host "Running npm install (this may take 1-2 minutes)..."
    npm install --no-audit --no-fund 2>&1 | Tee-Object -Variable installOutput | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ npm install failed" -ForegroundColor Red
        $installOutput | Select-Object -Last 20 | ForEach-Object { Write-Host "    $_" }
        exit 1
    }
    Write-Host "  ✓ npm install complete" -ForegroundColor Green

    # Confirm package-lock.json was generated
    if (Test-Path "package-lock.json") {
        Write-Host "  ✓ package-lock.json present (CI ready)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ package-lock.json missing — investigate" -ForegroundColor Red
        exit 1
    }

    # Smoke-test
    Write-Host ""
    Write-Host "Smoke testing..."
    npm run lint --silent 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "  ✓ Lint passes" -ForegroundColor Green }
    else { Write-Host "  ✗ Lint fails — run 'npm run lint' for details" -ForegroundColor Red }

    npm run test --silent 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "  ✓ Tests pass" -ForegroundColor Green }
    else { Write-Host "  ✗ Tests fail — run 'npm run test' for details" -ForegroundColor Red }

    npm run build --silent 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "  ✓ Build succeeds" -ForegroundColor Green }
    else { Write-Host "  ✗ Build fails — run 'npm run build' for details" -ForegroundColor Red }

} finally {
    Pop-Location
}

Write-Host ""
Write-Host "✅ Local setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  - Run scripts/02-gen-csr.ps1 to generate the iOS code-signing CSR" -ForegroundColor White
Write-Host "  - OR run npm run dev (in app/) to preview the app on web first" -ForegroundColor White
Write-Host ""
