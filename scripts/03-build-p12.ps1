# 03-build-p12.ps1
# Combines the distribution cert (downloaded from Apple) with your private key
# into a P12 file. Then base64-encodes it for GitHub Secrets.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Step 3 — Build distribution P12" -ForegroundColor Cyan
Write-Host "═════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$certDir = Join-Path $HOME "trailer-roulette-certs"
if (-not (Test-Path $certDir)) {
    Write-Host "  ✗ $certDir not found — run 02-gen-csr.ps1 first" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $certDir "private.key"))) {
    Write-Host "  ✗ private.key not found in $certDir — run 02-gen-csr.ps1 first" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $certDir "distribution.cer"))) {
    Write-Host "  ✗ distribution.cer not found in $certDir" -ForegroundColor Red
    Write-Host "    Download it from https://developer.apple.com/account/resources/certificates/list" -ForegroundColor Yellow
    Write-Host "    (after uploading the request.csr from step 02)" -ForegroundColor Yellow
    exit 1
}

# Find openssl
$openssl = (Get-Command openssl -ErrorAction SilentlyContinue).Path
if (-not $openssl) { $openssl = "C:\Program Files\Git\usr\bin\openssl.exe" }
if (-not (Test-Path $openssl)) {
    Write-Host "  ✗ openssl not found" -ForegroundColor Red
    exit 1
}

# Get a strong P12 password
$p12Password = Read-Host "Enter a strong password for the P12 (you'll save this in GitHub Secrets as P12_PASSWORD)" -AsSecureString
$p12PasswordPlain = [System.Net.NetworkCredential]::new("", $p12Password).Password
if ($p12PasswordPlain.Length -lt 8) {
    Write-Host "  ! Password is short; consider using something longer for production" -ForegroundColor Yellow
}

Push-Location $certDir
try {
    Write-Host "Converting .cer (DER) to .pem..."
    & $openssl x509 -inform DER -in distribution.cer -out distribution.pem 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "x509 conversion failed" }
    Write-Host "  ✓ distribution.pem" -ForegroundColor Green

    Write-Host "Building P12..."
    & $openssl pkcs12 -export -out distribution.p12 -inkey private.key -in distribution.pem `
        -name "iPhone Distribution: Charlie Cresci" -password "pass:$p12PasswordPlain" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "P12 export failed" }
    Write-Host "  ✓ distribution.p12" -ForegroundColor Green

} finally {
    Pop-Location
}

# Save the password to a config file (gitignored, in the cert dir)
$configPath = Join-Path $certDir ".secrets-cache.json"
$config = @{}
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json -AsHashtable
}
$config["P12_PASSWORD"] = $p12PasswordPlain
$config | ConvertTo-Json | Set-Content $configPath
Write-Host "  ✓ P12 password cached in $configPath (used by step 04)" -ForegroundColor Green

Write-Host ""
Write-Host "✅ P12 built." -ForegroundColor Green
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1. Create a provisioning profile at https://developer.apple.com/account/resources/profiles/list" -ForegroundColor White
Write-Host "     - Distribution → App Store" -ForegroundColor White
Write-Host "     - App ID: app.trailerroulette.ios" -ForegroundColor White
Write-Host "     - Certificate: pick the one you just created" -ForegroundColor White
Write-Host "     - Download the .mobileprovision file into $certDir" -ForegroundColor White
Write-Host ""
Write-Host "  2. Create an App Store Connect API Key at https://appstoreconnect.apple.com/access/api" -ForegroundColor White
Write-Host "     - Generate API Key, Access: App Manager" -ForegroundColor White
Write-Host "     - Download the .p8 file into $certDir" -ForegroundColor White
Write-Host "     - Note the Key ID (10 chars) and Issuer ID (UUID)" -ForegroundColor White
Write-Host ""
Write-Host "  3. Run scripts/04-encode-secrets.ps1" -ForegroundColor White
Write-Host ""
