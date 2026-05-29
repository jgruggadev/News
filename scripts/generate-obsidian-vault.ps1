param(
    [string]$ArchiveJsonPath,
    [string]$VaultRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$ThesisPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "data\thesis.md"),
    [string]$WatchlistPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "data\watchlist.json"),
    [string]$CalendarPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "data\macro-calendar.json"),
    [string]$FeedbackPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "data\feedback.json")
)

$ErrorActionPreference = "Stop"

function Ensure-Folder([string]$Path) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
function Load-Json($Path, $Default) { if (Test-Path $Path) { try { return (Get-Content $Path -Raw | ConvertFrom-Json | ForEach-Object { $_ }) } catch { return $Default } } return $Default }
function Clean([string]$Text) { if ($null -eq $Text) { return "" } return (($Text -replace "`r?`n", " ") -replace "\s+", " ").Trim() }
function MdLink([string]$Title, [string]$Url) { if ([string]::IsNullOrWhiteSpace($Url)) { return $Title } return "[$Title]($Url)" }

$dateStamp = (Get-Date).ToString("yyyy-MM-dd")
if ([string]::IsNullOrWhiteSpace($ArchiveJsonPath)) { $ArchiveJsonPath = Join-Path $VaultRoot "archive\$dateStamp.json" }
if (-not (Test-Path $ArchiveJsonPath)) { $ArchiveJsonPath = Join-Path $VaultRoot "data\manual-news.json" }

$folders = @("00 - Home","01 - Daily Briefings","02 - Thesis","03 - Sources","04 - Feedback","05 - Setup","06 - Dashboards","07 - Learning","08 - Data","09 - Templates")
foreach ($folder in $folders) { Ensure-Folder (Join-Path $VaultRoot $folder) }

$items = @(Load-Json $ArchiveJsonPath @()) | Where-Object { $_.Title -and $_.Link }
$items = @($items | Sort-Object @{Expression={$_.Score};Descending=$true}, Title)
$top = @($items | Select-Object -First 7)
$themes = @("Macro and Markets","AI and Semiconductors","Consumer","Geopolitics","Industrials and Defense")
$watchlist = @(Load-Json $WatchlistPath @())
$calendar = @(Load-Json $CalendarPath @())
$feedback = @(Load-Json $FeedbackPath @())
$thesis = if (Test-Path $ThesisPath) { Get-Content $ThesisPath -Raw } else { "# My Macro Thesis`n- Add your current view." }

$aiCount = @($items | Where-Object { (Clean $_.SearchText) -match "ai|semiconductor|chip|data center|nvidia|cloud" -or $_.Theme -match "AI" }).Count
$consumerCount = @($items | Where-Object { (Clean $_.SearchText) -match "consumer|retail|jobs|wages|housing|credit" -or $_.Theme -match "Consumer" }).Count
$geoCount = @($items | Where-Object { (Clean $_.SearchText) -match "china|tariff|sanction|ukraine|iran|oil|shipping" -or $_.Theme -match "Geo" }).Count
$policyCount = @($items | Where-Object { (Clean $_.SearchText) -match "fed|rate|inflation|treasury|yield" -or $_.Theme -match "Macro" }).Count

$briefPath = Join-Path $VaultRoot "01 - Daily Briefings\$dateStamp Daily Macro Briefing.md"
$latestPath = Join-Path $VaultRoot "00 - Home\Latest Daily Briefing.md"

$lines = @()
$lines += "---"
$lines += "date: $dateStamp"
$lines += "type: daily-briefing"
$lines += "tags: [daily-briefing, markets, macro, ai, consumer, geopolitics, defense, imw]"
$lines += "source_file: $ArchiveJsonPath"
$lines += "---"
$lines += "# $dateStamp Daily Macro Briefing"
$lines += ""
$lines += "> Hub links: [[News Operating System]] | [[Living Macro Thesis]] | [[Feedback Log]] | [[SMTP Email Setup]]"
$lines += ""
$lines += "## Executive Macro Thesis"
$lines += "Today's briefing centers on a concentrated but powerful growth mix: AI capital spending, resilient but uneven consumer demand, and geopolitical pressure that can feed into oil, defense, and inflation expectations. The useful investment question is not whether the economy is strong or weak in a broad sense; it is which growth engines are carrying the cycle and which shocks could interrupt them."
$lines += ""
$lines += "Policy remains the translation layer from news to markets. I counted **$policyCount** policy or inflation-sensitive signals, **$aiCount** AI-cycle signals, **$consumerCount** consumer signals, and **$geoCount** geopolitical signals in this source set. If inflation stays contained, equity leadership can broaden. If oil, tariffs, or wage pressure reaccelerate inflation, quality companies with pricing power and visible cash flow should matter more."
$lines += ""
$lines += "The differentiated thesis to develop: **AI capex and consumer spending can keep the U.S. expansion alive, but the same energy and supply-chain constraints that support industrial and defense demand can also raise the cost of that expansion.** This creates a market where sector selection and second-order thinking matter more than simple bullish or bearish labels."
$lines += ""
$lines += "## Top Must-Read Headlines"
foreach ($item in $top) {
    $published = if ($item.Published) { try { ([datetime]$item.Published).ToString("MMM d, yyyy") } catch { "Recent" } } else { "Recent" }
    $impact = if ($item.Impact) { Clean $item.Impact } else { "Map this headline to growth, inflation, policy, or risk appetite." }
    $desc = Clean $item.Description
    $lines += "### $(Clean $item.Title)"
    $lines += "- Source: $(MdLink (Clean $item.Source) $item.Link)"
    $lines += "- Date: $published"
    $lines += "- Theme: $(Clean $item.Theme)"
    if ($desc) { $lines += "- Summary: $desc" }
    $lines += "- Why it matters: $impact"
    $lines += ""
}
$lines += "## Theme Breakdown"
foreach ($theme in $themes) {
    $lines += "### $theme"
    $themeItems = @($items | Where-Object { $_.Theme -eq $theme } | Select-Object -First 8)
    if ($themeItems.Count -eq 0) { $lines += "- No items captured for this theme today." } else {
        foreach ($item in $themeItems) { $lines += "- $(MdLink (Clean $item.Title) $item.Link) - $(Clean $item.Source). $(Clean $item.Impact)" }
    }
    $lines += ""
}
$lines += "## What To Update In The Thesis"
$lines += "- What changed today: "
$lines += "- What it implies over the next 1-3 months: "
$lines += "- What would change my mind: "
$lines += "- Companies/themes to research next: "
$lines += ""
$lines += "## Source Links"
foreach ($item in ($items | Select-Object -First 35)) { $lines += "- $(MdLink (Clean $item.Title) $item.Link) - $(Clean $item.Source)" }
Set-Content -Path $briefPath -Value ($lines -join "`r`n") -Encoding utf8
Copy-Item -Path $briefPath -Destination $latestPath -Force

$homeText = @"
# News Second Brain

Welcome to your Obsidian hub for markets, macro, AI, consumer, geopolitics, industrials, and defense research.

## Start Here

- [[Latest Daily Briefing]]
- [[News Operating System]]
- [[Living Macro Thesis]]
- [[Feedback Log]]
- [[SMTP Email Setup]]
- [[Daily Workflow]]
- [[Market Learning Playbook]]
- [[Source Library]]

## Daily Rule

Every morning, turn the briefing into one sentence of differentiated judgment: what changed, why it matters, and what would change your mind.
"@
Set-Content -Path (Join-Path $VaultRoot "00 - Home\Start Here.md") -Value $homeText -Encoding utf8

$dashboard = @"
# News Operating System

## Morning Flow

1. Open [[Latest Daily Briefing]].
2. Read the Executive Macro Thesis before opening source links.
3. Add one update to [[Living Macro Thesis]].
4. Record what worked or missed in [[Feedback Log]].
5. Pick one topic for deeper research in [[Market Learning Playbook]].

## Current Research Lanes

- AI infrastructure: semiconductors, data centers, power, memory, cooling, cloud margins.
- Consumer: bifurcation by income cohort, retail mix, services vs goods, credit stress.
- Geopolitics: oil, shipping, China, Middle East, sanctions, tariffs.
- Industrials and defense: backlog, budgets, reshoring, aerospace supply chains.
- Macro policy: inflation, labor, rates, Treasury yields, Fed reaction function.

## Core Notes

- [[Living Macro Thesis]]
- [[Source Library]]
- [[Macro Calendar]]
- [[Watchlist]]
- [[Feedback Log]]
"@
Set-Content -Path (Join-Path $VaultRoot "06 - Dashboards\News Operating System.md") -Value $dashboard -Encoding utf8

Set-Content -Path (Join-Path $VaultRoot "02 - Thesis\Living Macro Thesis.md") -Value ($thesis + "`r`n`r`n## Daily Thesis Updates`r`n- ${dateStamp}: Add today's one-sentence update here.`r`n") -Encoding utf8

$sourceLines = @("# Source Library", "", "Use this as the approved reading map. Prefer primary reporting and market-moving publications, then use summaries only as pointers.", "", "## Core Sources", "- [Reuters](https://www.reuters.com/)", "- [Financial Times](https://www.ft.com/)", "- [Wall Street Journal](https://www.wsj.com/)", "- [Barron's](https://www.barrons.com/)", "- [Bloomberg](https://www.bloomberg.com/)", "- [Federal Reserve](https://www.federalreserve.gov/)", "- [BLS](https://www.bls.gov/)", "- [BEA](https://www.bea.gov/)", "", "## Today's Captured Sources")
foreach ($item in ($items | Select-Object -First 50)) { $sourceLines += "- $(MdLink (Clean $item.Title) $item.Link) - $(Clean $item.Source)" }
Set-Content -Path (Join-Path $VaultRoot "03 - Sources\Source Library.md") -Value ($sourceLines -join "`r`n") -Encoding utf8

$feedbackLines = @("# Feedback Log", "", "Use this to teach the system what to emphasize tomorrow.", "", "## Today's Feedback", "", "### What was useful?", "- ", "", "### What was missing, shallow, or noisy?", "- ", "", "### Topics to emphasize tomorrow", "- ", "", "## Stored Feedback")
foreach ($f in ($feedback | Select-Object -Last 10)) { $feedbackLines += "- $($f.date): liked=$($f.liked); improve=$($f.disliked); next=$($f.topics)" }
Set-Content -Path (Join-Path $VaultRoot "04 - Feedback\Feedback Log.md") -Value ($feedbackLines -join "`r`n") -Encoding utf8

$setup = @"
# SMTP Email Setup

Goal: send the daily briefing to `jtalbans@iu.edu` every day at 9:00 AM Eastern.

## Information Needed

Fill in these six items:

1. SMTP provider: usually Gmail or Google Workspace.
2. SMTP host: for Gmail, `smtp.gmail.com`.
3. SMTP port: for Gmail, `587`.
4. SMTP username: the sending email address, for example `yourname@gmail.com`.
5. SMTP password: use a Google App Password, not your normal Google password.
6. From address: usually the same as the SMTP username.

## Gmail App Password Steps

1. Open your Google Account.
2. Turn on 2-Step Verification if it is not already enabled.
3. Search Google Account settings for App passwords.
4. Create an app password for Mail on Windows.
5. Save the generated 16-character password somewhere secure.
6. Use that app password as `BRIEFING_SMTP_PASS`.

## Set The Variables In PowerShell

Replace the placeholders and run these in a new PowerShell window:

````powershell
[Environment]::SetEnvironmentVariable('BRIEFING_SMTP_HOST','smtp.gmail.com','User')
[Environment]::SetEnvironmentVariable('BRIEFING_SMTP_PORT','587','User')
[Environment]::SetEnvironmentVariable('BRIEFING_SMTP_USER','your-email@gmail.com','User')
[Environment]::SetEnvironmentVariable('BRIEFING_SMTP_PASS','your-google-app-password','User')
[Environment]::SetEnvironmentVariable('BRIEFING_EMAIL_FROM','your-email@gmail.com','User')
````

Close PowerShell, open a new PowerShell window, then test:

````powershell
cd "C:\Users\jtalb\OneDrive\News"
powershell.exe -ExecutionPolicy Bypass -File .\scripts\send-briefing-email.ps1 -BriefingPath .\output\daily-briefing.html -To jtalbans@iu.edu -Subject "Daily Macro Briefing Test" -Test
````

## Enable The 9:00 AM Schedule

Only do this after the test email works:

````powershell
cd "C:\Users\jtalb\OneDrive\News"
powershell.exe -ExecutionPolicy Bypass -File .\setup-scheduled-task.ps1 -EnableScheduling -DailyTime 09:00
````

Make sure Windows is set to Eastern Time.

## What I Still Need From You

- Confirm the email address that should send the briefing.
- Confirm whether you want Gmail, IU Google Workspace, or another SMTP provider.
- Provide or set the app password locally. Do not paste the app password into chat unless you explicitly want me to configure it for this machine.
"@
Set-Content -Path (Join-Path $VaultRoot "05 - Setup\SMTP Email Setup.md") -Value $setup -Encoding utf8

$workflow = @"
# Daily Workflow

## 9:00 AM Briefing Routine

1. Open Obsidian to this vault: `C:\Users\jtalb\OneDrive\News`.
2. Read [[Latest Daily Briefing]].
3. Open two or three source links that matter most.
4. Update [[Living Macro Thesis]].
5. Add process feedback to [[Feedback Log]].
6. Pick one topic to research deeper.

## Manual Run

````powershell
cd "C:\Users\jtalb\OneDrive\News"
powershell.exe -ExecutionPolicy Bypass -File .\run-daily-briefing.ps1 -Force
````

## Generate Without Email

````powershell
cd "C:\Users\jtalb\OneDrive\News"
powershell.exe -ExecutionPolicy Bypass -File .\run-daily-briefing.ps1 -Force -SkipEmail
````
"@
Set-Content -Path (Join-Path $VaultRoot "05 - Setup\Daily Workflow.md") -Value $workflow -Encoding utf8

$learning = @"
# Market Learning Playbook

## How To Follow Markets Better

- Start with macro data, not opinions: inflation, labor, growth, rates, credit, and earnings revisions.
- Translate every headline into one channel: growth, inflation, policy, liquidity, valuation, earnings, or risk premium.
- Track second-order effects. Example: AI data centers raise chip demand, but also power demand, utility capex, cooling demand, and local grid constraints.
- Write forecasts in falsifiable language. Avoid "AI is big"; prefer "AI capex remains durable if hyperscaler revenue growth and backlog continue to support spending."
- Separate cyclical from structural. Oil spikes can be cyclical; defense budget repricing may be structural.

## Weekly Deep Dives

- One company: business model, revenue drivers, margin structure, valuation, risks.
- One macro release: what it measures, consensus, surprise, market reaction.
- One theme: AI power demand, consumer credit, tariffs, reshoring, defense procurement.

## IMW Prep Habit

Every week, write one one-page memo with: thesis, variant perception, catalyst, risk, and what would change your mind.
"@
Set-Content -Path (Join-Path $VaultRoot "07 - Learning\Market Learning Playbook.md") -Value $learning -Encoding utf8

$watchLines = @("# Watchlist", "")
foreach ($w in $watchlist) { $watchLines += "- **$($w.ticker)** - $($w.theme): $($w.thesis)" }
Set-Content -Path (Join-Path $VaultRoot "08 - Data\Watchlist.md") -Value ($watchLines -join "`r`n") -Encoding utf8

$calLines = @("# Macro Calendar", "")
foreach ($c in $calendar) { $calLines += "- **$($c.date) $($c.time_et)** - $($c.event): actual $($c.actual), consensus $($c.consensus), prior $($c.prior). $($c.impact)" }
Set-Content -Path (Join-Path $VaultRoot "08 - Data\Macro Calendar.md") -Value ($calLines -join "`r`n") -Encoding utf8

$template = @"
---
date: {{date}}
type: daily-briefing
tags: [daily-briefing, markets, macro]
---
# {{date}} Daily Macro Briefing

## Executive Thesis

## Top Headlines

## Theme Breakdown

## Thesis Update

## Feedback
"@
Set-Content -Path (Join-Path $VaultRoot "09 - Templates\Daily Briefing Template.md") -Value $template -Encoding utf8

Write-Host "Obsidian briefing written to: $briefPath"
Write-Host "Vault home written to: 00 - Home\Start Here.md"



