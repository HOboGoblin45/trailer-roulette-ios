# Pre-flight check for the Trailer Roulette scaffold
#
# Run this on Windows BEFORE you do `git init && git push`. It catches the
# most common "first push fails in CI" issues so you don't have to debug them
# from CI logs.
#
# Usage:
#   cd "C:\Users\ccres\OneDrive\Documents\Claude\Projects\Trailer Roulette\app"
#   ..\scripts\preflight.ps1

$ErrorActionPreference = "Stop"
$Script:Failed = 0
$Script:Warned = 0

function Check-Pass($msg) {
    Write-Host "  [✓] $msg" -ForegroundColor Green
}
function Check-Fail($msg) {
    Write-Host "  [✗] $msg" -ForegroundColor Red
    $Script:Failed += 1
}
function Check-Warn($msg) {
    Write-Host "  [!] $msg" -ForegroundColor Yellow
    $Script:Warned += 1
}

Write-Host ""
Write-Host "Trailer Roulette — pre-flight check" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# 1. Working directory
Write-Host "1. Working directory"
if (Test-Path "package.json") {
    Check-Pass "Running from app/ folder (package.json found)"
} else {
    Check-Fail "Not in app/ folder. cd into the scaffold's app/ subdir first."
    exit 1
}

# 2. Node version
Write-Host ""
Write-Host "2. Node.js"
try {
    $nodeVer = (node --version) -replace '^v',''
    $major = [int]($nodeVer -split '\.')[0]
    if ($major -ge 20) {
        Check-Pass "Node $nodeVer (≥20 required)"
    } else {
        Check-Fail "Node $nodeVer is too old. Install Node 20+ from https://nodejs.org"
    }
} catch {
    Check-Fail "Node not installed. Install from https://nodejs.org"
}

# 3. npm version
try {
    $npmVer = npm --version
    Check-Pass "npm $npmVer"
} catch {
    Check-Fail "npm not on PATH"
}

# 4. Git
try {
    $gitVer = (git --version) -replace 'git version ',''
    Check-Pass "git $gitVer"
} catch {
    Check-Fail "git not on PATH. Install from https://git-scm.com"
}

# 5. Git config
try {
    $userName = git config --global user.name
    $userEmail = git config --global user.email
    if ($userName -and $userEmail) {
        Check-Pass "git config: $userName <$userEmail>"
    } else {
        Check-Warn "git config user.name / user.email not set (set before first commit)"
    }
} catch {
    Check-Warn "Could not read git config"
}

# 6. JSON files well-formed
Write-Host ""
Write-Host "6. JSON validity"
$jsonFiles = @("package.json", "..\assets\icons\Contents.json", "..\landing-page\vercel.json")
foreach ($f in $jsonFiles) {
    if (Test-Path $f) {
        try {
            Get-Content $f -Raw | ConvertFrom-Json | Out-Null
            Check-Pass "$f is valid JSON"
        } catch {
            Check-Fail "$f is not valid JSON: $($_.Exception.Message)"
        }
    } else {
        Check-Warn "$f not found (may be expected if you haven't generated it)"
    }
}

# 7. Required files
Write-Host ""
Write-Host "7. Required files"
$required = @(
    "package.json",
    "vite.config.js",
    "capacitor.config.ts",
    "eslint.config.js",
    "vitest.config.js",
    "index.html",
    ".gitignore",
    ".env.local.template",
    "src\main.jsx",
    "src\App.jsx",
    "src\components\TrailerRoulette.jsx",
    "src\components\Player.jsx",
    "src\components\Player.web.jsx",
    "src\components\Player.ios.jsx",
    "src\components\Watchlist.jsx",
    "src\components\SwipeOverlay.jsx",
    "src\lib\storage.js",
    "src\lib\tasteProfile.js",
    "src\lib\shuffleWeighting.js",
    "local-plugins\airplay-plugin\package.json",
    "local-plugins\airplay-plugin\AirplayPlugin.podspec",
    "local-plugins\airplay-plugin\ios\Plugin\AirplayPlugin.swift"
)
$missing = 0
foreach ($f in $required) {
    if (-not (Test-Path $f)) {
        Check-Fail "Missing: $f"
        $missing += 1
    }
}
if ($missing -eq 0) {
    Check-Pass "All $($required.Count) required files present"
}

# 8. .env.local (warn if missing; required for local dev)
Write-Host ""
Write-Host "8. Environment"
if (Test-Path ".env.local") {
    $envContent = Get-Content ".env.local" -Raw
    if ($envContent -match 'VITE_TMDB_API_KEY=\S{20,}') {
        Check-Pass ".env.local has VITE_TMDB_API_KEY set"
    } else {
        Check-Warn ".env.local exists but VITE_TMDB_API_KEY looks empty or short"
    }
} else {
    Check-Warn ".env.local missing — copy from .env.local.template and add your TMDB key"
}

# 9. node_modules / install
Write-Host ""
Write-Host "9. Dependencies"
if (Test-Path "node_modules") {
    Check-Pass "node_modules exists (npm install has been run)"
    if (Test-Path "package-lock.json") {
        Check-Pass "package-lock.json exists (CI can use npm ci)"
    } else {
        Check-Warn "package-lock.json missing — run 'npm install' to generate"
    }
} else {
    Check-Warn "node_modules missing — run 'npm install' before pushing"
}

# 10. Lint + test + build (if dependencies installed)
if (Test-Path "node_modules") {
    Write-Host ""
    Write-Host "10. Lint + test + build (this will take ~30 seconds)"

    Write-Host "    npm run lint..."
    npm run lint --silent 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Check-Pass "Lint passes" } else { Check-Fail "Lint fails — run 'npm run lint' for details" }

    Write-Host "    npm run test..."
    npm run test --silent 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Check-Pass "Tests pass" } else { Check-Fail "Tests fail — run 'npm run test' for details" }

    Write-Host "    npm run build..."
    npm run build --silent 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Check-Pass "Build succeeds" } else { Check-Fail "Build fails — run 'npm run build' for details" }
}

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════" -ForegroundColor Cyan
if ($Script:Failed -gt 0) {
    Write-Host "$Script:Failed failure(s), $Script:Warned warning(s) — fix before pushing." -ForegroundColor Red
    exit 1
} elseif ($Script:Warned -gt 0) {
    Write-Host "All checks pass with $Script:Warned warning(s) — proceed with caution." -ForegroundColor Yellow
} else {
    Write-Host "All checks pass. Safe to git init + git push." -ForegroundColor Green
}
Write-Host ""
