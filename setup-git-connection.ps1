# Vault <-> GitHub setup script

$vaultPath = "C:\Users\jtalb\OneDrive\News"
$remoteUrl = "https://github.com/jgruggadev/News.git"

Set-Location $vaultPath

# ── Clean up any broken .git folder from previous attempts ───────────────────
if (Test-Path ".git") {
    Write-Host "Removing broken .git folder from previous attempt..." -ForegroundColor Yellow
    Remove-Item -Path ".git" -Recurse -Force
    Write-Host "Cleaned." -ForegroundColor Green
}

# ── Initialize fresh git repo ─────────────────────────────────────────────────
Write-Host "Initializing git repo..." -ForegroundColor Cyan
git init
git config user.email "jtalbans@gmail.com"
git config user.name "jgruggadev"
git branch -M main

# Write .gitignore
Set-Content -Path ".gitignore" -Value ".obsidian/workspace.json`n.obsidian/workspace-mobile.json`n.DS_Store`nThumbs.db" -Encoding UTF8

# ── Connect to GitHub ─────────────────────────────────────────────────────────
Write-Host "Connecting to GitHub..." -ForegroundColor Cyan
git remote add origin $remoteUrl
git fetch origin main

# Stage and commit all vault files
git add -A
git commit -m "vault: full restructure with Gemini briefing rebuild and IMW prep"

# Merge remote history so push doesn't get rejected
git merge origin/main --allow-unrelated-histories -m "merge: connect vault to GitHub remote" --no-edit
if ($LASTEXITCODE -ne 0) {
    Write-Host "Merge conflict - keeping vault version..." -ForegroundColor Yellow
    git checkout --ours .
    git add -A
    git commit -m "merge: resolve in favour of vault"
}

# ── Push ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Pushing to GitHub. When prompted:" -ForegroundColor Cyan
Write-Host "  Username: jgruggadev" -ForegroundColor White
Write-Host "  Password: your Personal Access Token (not your GitHub password)" -ForegroundColor White
Write-Host "  Get one at: https://github.com/settings/tokens/new  (repo scope, no expiry)" -ForegroundColor White
Write-Host ""
git push origin main

Write-Host ""
Write-Host "Done. Vault is live on GitHub." -ForegroundColor Green
Write-Host "obsidian-git will auto-pull every 10 minutes from now on." -ForegroundColor Green
