# 04-encode-secrets.ps1
# Base64-encodes all the artifacts (P12, provisioning profile, .p8 API key)
# and saves them to a single JSON file you can feed into 05-create-github-repo.ps1
# (or copy/paste into GitHub Secrets manually).

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Step 4 — Base64-encode secrets" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$certDir = Join-Path $HOME "trailer-roulette-certs"
if (-not (Test-Path $certDir)) {
    Write-Host "  ✗ $certDir not found — run earlier scripts first" -ForegroundColor Red
    exit 1
}

# Load any cached values
$configPath = Join-Path $certDir ".secrets-cache.json"
$config = @{}
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json -AsHashtable
}

# Helper: base64 a binary file
function Encode-Base64 {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    $bytes = [IO.File]::ReadAllBytes($Path)
    return [Convert]::ToBase64String($bytes)
}

# Helper: prompt with default
function Read-WithDefault {
    param([string]$Prompt, [string]$Default = "")
    $hint = if ($Default) { " [$Default]" } else { "" }
    $val = Read-Host "$Prompt$hint"
    if (-not $val -and $Default) { $val = $Default }
    return $val
}

# ── BUILD_CERTIFICATE_BASE64 ─────────────────────
$p12Path = Join-Path $certDir "distribution.p12"
if (Test-Path $p12Path) {
    $config["BUILD_CERTIFICATE_BASE64"] = Encode-Base64 $p12Path
    Write-Host "  ✓ BUILD_CERTIFICATE_BASE64 ready ($($config.BUILD_CERTIFICATE_BASE64.Length) chars)" -ForegroundColor Green
} else {
    Write-Host "  ✗ distribution.p12 not found — run 03-build-p12.ps1" -ForegroundColor Red
    exit 1
}

# ── BUILD_PROVISION_PROFILE_BASE64 ────────────────
$profile = Get-ChildItem -Path $certDir -Filter "*.mobileprovision" | Select-Object -First 1
if ($profile) {
    $config["BUILD_PROVISION_PROFILE_BASE64"] = Encode-Base64 $profile.FullName
    Write-Host "  ✓ BUILD_PROVISION_PROFILE_BASE64 ready (from $($profile.Name))" -ForegroundColor Green
} else {
    Write-Host "  ✗ No .mobileprovision file found in $certDir" -ForegroundColor Red
    Write-Host "    Create one at https://developer.apple.com/account/resources/profiles/list" -ForegroundColor Yellow
    Write-Host "    Distribution → App Store → app.trailerroulette.ios → use your distribution cert" -ForegroundColor Yellow
    exit 1
}

# ── APP_STORE_CONNECT_API_KEY_BASE64 ──────────────
$apiKeyFile = Get-ChildItem -Path $certDir -Filter "AuthKey_*.p8" | Select-Object -First 1
if ($apiKeyFile) {
    $config["APP_STORE_CONNECT_API_KEY_BASE64"] = Encode-Base64 $apiKeyFile.FullName
    # Extract the Key ID from the filename: AuthKey_ABC1234DEF.p8 → ABC1234DEF
    $extractedKeyId = $apiKeyFile.BaseName -replace '^AuthKey_',''
    if (-not $config.ContainsKey("APP_STORE_CONNECT_API_KEY_ID") -or -not $config["APP_STORE_CONNECT_API_KEY_ID"]) {
        $config["APP_STORE_CONNECT_API_KEY_ID"] = $extractedKeyId
    }
    Write-Host "  ✓ APP_STORE_CONNECT_API_KEY_BASE64 ready (key ID: $extractedKeyId)" -ForegroundColor Green
} else {
    Write-Host "  ✗ No AuthKey_*.p8 file found in $certDir" -ForegroundColor Red
    Write-Host "    Create one at https://appstoreconnect.apple.com/access/api" -ForegroundColor Yellow
    Write-Host "    Generate API Key, Access: App Manager → download → move to $certDir" -ForegroundColor Yellow
    exit 1
}

# ── APP_STORE_CONNECT_API_KEY_ISSUER_ID ──────────
if (-not $config.APP_STORE_CONNECT_API_KEY_ISSUER_ID) {
    $config["APP_STORE_CONNECT_API_KEY_ISSUER_ID"] = Read-WithDefault "App Store Connect API Issuer ID (UUID, top of the API Keys page)"
}

# ── APPLE_TEAM_ID ─────────────────────────────────
if (-not $config.APPLE_TEAM_ID) {
    $config["APPLE_TEAM_ID"] = Read-WithDefault "Apple Team ID (10 chars, top right of developer.apple.com membership)"
}

# ── KEYCHAIN_PASSWORD (any string; only used during a single CI run) ─
if (-not $config.KEYCHAIN_PASSWORD) {
    $config["KEYCHAIN_PASSWORD"] = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
    Write-Host "  ✓ KEYCHAIN_PASSWORD generated (random 24 chars)" -ForegroundColor Green
}

# ── VITE_TMDB_API_KEY ────────────────────────────
if (-not $config.VITE_TMDB_API_KEY) {
    $envFile = Join-Path $PSScriptRoot "..\app\.env.local"
    if (Test-Path $envFile) {
        $envContent = Get-Content $envFile -Raw
        if ($envContent -match 'VITE_TMDB_API_KEY=(\S+)') {
            $config["VITE_TMDB_API_KEY"] = $matches[1]
            Write-Host "  ✓ VITE_TMDB_API_KEY copied from app/.env.local" -ForegroundColor Green
        }
    }
    if (-not $config.VITE_TMDB_API_KEY) {
        $config["VITE_TMDB_API_KEY"] = Read-WithDefault "TMDB v3 API Key"
    }
}

# Save updated cache
$config | ConvertTo-Json | Set-Content $configPath

Write-Host ""
Write-Host "✅ All secrets encoded and cached." -ForegroundColor Green
Write-Host ""
Write-Host "Cached at: $configPath" -ForegroundColor Gray
Write-Host "(This file is in your home dir, not the repo — safe.)" -ForegroundColor Gray
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  - Run scripts/05-create-github-repo.ps1 to push the scaffold and set" -ForegroundColor White
Write-Host "    all GitHub Secrets in one command (requires gh CLI)" -ForegroundColor White
Write-Host "  - OR copy values manually from $configPath into GitHub UI" -ForegroundColor White
Write-Host ""
