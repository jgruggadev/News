param(
    [switch]$Force,
    [switch]$SkipEmail
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$logPath = Join-Path $root "output\schedule-run.log"
$dayMarkerPath = Join-Path $root "output\.last-briefing-day"

function Write-RunLog([string]$Message) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" | Add-Content -Path $logPath -Encoding utf8
}

$today = (Get-Date).ToString("yyyy-MM-dd")
if (-not $Force -and (Test-Path $dayMarkerPath)) {
    $lastDay = (Get-Content $dayMarkerPath -Raw).Trim()
    if ($lastDay -eq $today) {
        Write-RunLog "SKIP (already completed today)"
        Write-Host "Daily briefing already completed today; skipping. Use -Force to regenerate."
        exit 0
    }
}

try {
    Write-RunLog "START"
    $briefingPath = Join-Path $root "output\daily-briefing.html"

    & "$root\scripts\generate-briefing.ps1" `
        -OutputPath $briefingPath `
        -ThesisPath (Join-Path $root "data\thesis.md") `
        -WatchlistPath (Join-Path $root "data\watchlist.json") `
        -CalendarPath (Join-Path $root "data\macro-calendar.json") `
        -FeedbackPath (Join-Path $root "data\feedback.json")

    & "$root\scripts\generate-obsidian-vault.ps1" `
        -ArchiveJsonPath (Join-Path $root "archive\$today.json") `
        -VaultRoot $root `
        -ThesisPath (Join-Path $root "data\thesis.md") `
        -WatchlistPath (Join-Path $root "data\watchlist.json") `
        -CalendarPath (Join-Path $root "data\macro-calendar.json") `
        -FeedbackPath (Join-Path $root "data\feedback.json")

    if (-not $SkipEmail) {
        & "$root\scripts\send-briefing-email.ps1" `
            -BriefingPath $briefingPath `
            -To "jtalbans@iu.edu" `
            -Subject "Daily Macro Briefing - $today"
    }

    Set-Content -Path $dayMarkerPath -Value $today -NoNewline -Encoding utf8
    Write-RunLog "OK"
    Write-Host "Daily briefing flow completed."
} catch {
    Write-RunLog "FAIL: $($_.Exception.Message)"
    throw
}

