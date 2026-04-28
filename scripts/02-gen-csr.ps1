# 02-gen-csr.ps1
# Generates the private key + CSR (Certificate Signing Request) you upload to
# developer.apple.com to get your distribution certificate.
#
# Run this BEFORE step 3 (which uses the cert Apple gives you back).

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Step 2 — Generate iOS code-signing CSR" -ForegroundColor Cyan
Write-Host "═════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Find openssl
$openssl = (Get-Command openssl -ErrorAction SilentlyContinue).Path
if (-not $openssl) {
    $openssl = "C:\Program Files\Git\usr\bin\openssl.exe"
    if (-not (Test-Path $openssl)) {
        Write-Host "  ✗ openssl not found. Install Git for Windows from https://git-scm.com" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  Using openssl at: $openssl" -ForegroundColor Gray

# Pick a working directory
$certDir = Join-Path $HOME "trailer-roulette-certs"
if (-not (Test-Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir | Out-Null
}
Write-Host "  Working directory: $certDir"
Write-Host ""

if (Test-Path (Join-Path $certDir "private.key")) {
    Write-Host "  ! private.key already exists. Overwrite? [y/N]" -ForegroundColor Yellow
    $resp = Read-Host
    if ($resp -ne "y") {
        Write-Host "  Skipping. (Re-run with overwrite if you really need a new key.)" -ForegroundColor Gray
        exit 0
    }
}

# Inputs
$email = Read-Host "Apple ID email [crescicharles@gmail.com]"
if (-not $email) { $email = "crescicharles@gmail.com" }

$name = Read-Host "Your full name [Charlie Cresci]"
if (-not $name) { $name = "Charlie Cresci" }

$country = Read-Host "Country code (2 letters) [US]"
if (-not $country) { $country = "US" }

$subject = "/CN=Trailer Roulette Distribution/O=$name/C=$country/emailAddress=$email"

# Generate
Push-Location $certDir
try {
    Write-Host ""
    Write-Host "Generating 2048-bit RSA private key..."
    & $openssl genrsa -out private.key 2048 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "openssl genrsa failed" }
    Write-Host "  ✓ private.key written" -ForegroundColor Green

    Write-Host "Generating CSR..."
    & $openssl req -new -key private.key -out request.csr -subj $subject 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "openssl req failed" }
    Write-Host "  ✓ request.csr written" -ForegroundColor Green

} finally {
    Pop-Location
}

Write-Host ""
Write-Host "✅ CSR generated." -ForegroundColor Green
Write-Host ""
Write-Host "Now do this in your browser:" -ForegroundColor Cyan
Write-Host "  1. Go to: https://developer.apple.com/account/resources/certificates/list" -ForegroundColor White
Write-Host "  2. Click the blue + → Software → Apple Distribution → Continue" -ForegroundColor White
Write-Host "  3. Upload: $certDir\request.csr" -ForegroundColor White
Write-Host "  4. Download the resulting distribution.cer file" -ForegroundColor White
Write-Host "  5. Move distribution.cer into $certDir" -ForegroundColor White
Write-Host "  6. Run scripts/03-build-p12.ps1" -ForegroundColor White
Write-Host ""
