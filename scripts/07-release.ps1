# 07-release.ps1
# One-command release: bump version, commit, tag, push.
# Triggers ios-release.yml automatically.
#
# Usage:
#   ./scripts/07-release.ps1               # auto-bumps the patch version
#   ./scripts/07-release.ps1 1.0.0         # explicit version
#   ./scripts/07-release.ps1 1.1.0 -Major  # promotes the change to a major release in CHANGELOG

param(
    [Parameter(Position=0)]
    [string]$Version,
    [switch]$Major,
    [switch]$Minor,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Step 7 — Release to TestFlight" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$root = $PSScriptRoot | Split-Path -Parent
$appDir = Join-Path $root "app"
$pkgPath = Join-Path $appDir "package.json"
if (-not (Test-Path $pkgPath)) { throw "app/package.json not found" }

# Read current version
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$currentVersion = $pkg.version
Write-Host "Current version: $currentVersion"

# Determine new version
if (-not $Version) {
    $parts = $currentVersion -split '\.'
    if ($Major) {
        $newVer = "$([int]$parts[0]+1).0.0"
    } elseif ($Minor) {
        $newVer = "$($parts[0]).$([int]$parts[1]+1).0"
    } else {
        $newVer = "$($parts[0]).$($parts[1]).$([int]$parts[2]+1)"
    }
} else {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') {
        throw "Version must be SemVer (X.Y.Z). Got: $Version"
    }
    $newVer = $Version
}

Write-Host "New version: $newVer"

# Verify the working tree is clean (other than the version bump we're about to do)
Push-Location $appDir
try {
    $status = git status --porcelain
    if ($status) {
        Write-Host ""
        Write-Host "  ! Working tree has uncommitted changes:" -ForegroundColor Yellow
        $status | ForEach-Object { Write-Host "    $_" }
        Write-Host ""
        $resp = Read-Host "Proceed anyway? Uncommitted changes will be staged and committed with the version bump. [y/N]"
        if ($resp -ne "y") { exit 0 }
    }

    # Verify CI passed on the latest push
    if (Get-Command gh -ErrorAction SilentlyContinue) {
        Write-Host ""
        Write-Host "Checking latest CI status..."
        $repoFull = (git remote get-url origin) -replace '.*github\.com[:/](.*)\.git$','$1' -replace '.*github\.com[:/](.+?)$','$1'
        $latestRun = gh run list --repo $repoFull --workflow=ci.yml --limit 1 --json conclusion,headBranch -q '.[0]' | ConvertFrom-Json
        if ($latestRun.conclusion -eq "success") {
            Write-Host "  ✓ Latest CI run on $($latestRun.headBranch): success" -ForegroundColor Green
        } elseif ($latestRun.conclusion -eq "failure") {
            Write-Host "  ✗ Latest CI run failed. Fix before tagging." -ForegroundColor Red
            $resp = Read-Host "Override and tag anyway? [y/N]"
            if ($resp -ne "y") { exit 1 }
        } else {
            Write-Host "  ! CI status: $($latestRun.conclusion ?? 'in progress')" -ForegroundColor Yellow
        }
    }

    # Bump version
    Write-Host ""
    Write-Host "Bumping app/package.json version → $newVer"
    if ($DryRun) {
        Write-Host "  (dry run; no changes written)" -ForegroundColor Gray
    } else {
        $pkgRaw = Get-Content $pkgPath -Raw
        $pkgRaw = $pkgRaw -replace '"version":\s*"[^"]+"', "`"version`": `"$newVer`""
        Set-Content $pkgPath -Value $pkgRaw -NoNewline:$false

        # Stage, commit, tag, push
        git add . | Out-Null
        git commit -m "release: v$newVer" | Out-Null
        git tag "v$newVer" | Out-Null

        Write-Host "  ✓ Committed and tagged v$newVer" -ForegroundColor Green
        Write-Host ""
        Write-Host "Pushing branch + tag..."
        git push 2>&1 | Out-Null
        git push --tags 2>&1 | Out-Null
        Write-Host "  ✓ Pushed" -ForegroundColor Green
    }

} finally {
    Pop-Location
}

if ($DryRun) {
    Write-Host ""
    Write-Host "Dry run complete; no changes pushed. Re-run without -DryRun to release." -ForegroundColor Cyan
    exit 0
}

Write-Host ""
Write-Host "✅ v$newVer released." -ForegroundColor Green
Write-Host ""
Write-Host "iOS release workflow now running. Watch:" -ForegroundColor Cyan
if (Get-Command gh -ErrorAction SilentlyContinue) {
    $repoFull = (cd $appDir; git remote get-url origin) -replace '.*github\.com[:/](.*)\.git$','$1'
    Write-Host "  https://github.com/$repoFull/actions/workflows/ios-release.yml" -ForegroundColor White
} else {
    Write-Host "  GitHub → Actions → iOS Release" -ForegroundColor White
}
Write-Host ""
Write-Host "On success (~15 min), Apple emails you when the build is 'Ready to Test'." -ForegroundColor White
Write-Host "Install on iPhone via the TestFlight app, then bash through docs/BUG-BASH-CHECKLIST.md." -ForegroundColor White
Write-Host ""
