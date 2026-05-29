param(
    [string]$OutputPath = ".\output\daily-briefing.html",
    [string]$ThesisPath = ".\data\thesis.md",
    [string]$WatchlistPath = ".\data\watchlist.json",
    [string]$CalendarPath = ".\data\macro-calendar.json",
    [string]$FeedbackPath = ".\data\feedback.json",
    [int]$MaxItemsPerSection = 8
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Escape-Html([string]$Text) {
    if ($null -eq $Text) { return "" }
    return [System.Net.WebUtility]::HtmlEncode($Text)
}

function Strip-Html([string]$Text) {
    if ($null -eq $Text) { return "" }
    $clean = $Text -replace '<[^>]+>', ' '
    $clean = [System.Net.WebUtility]::HtmlDecode($clean)
    return ($clean -replace '\s+', ' ').Trim()
}

function Convert-MarkdownToSimpleHtml([string]$Markdown) {
    if ([string]::IsNullOrWhiteSpace($Markdown)) { return "<p>Add your current investment view here.</p>" }
    $html = @()
    $inList = $false
    foreach ($line in ($Markdown -split "`r?`n")) {
        if ($line -match '^#\s+(.+)$') { if ($inList) { $html += "</ul>"; $inList = $false }; $html += "<h2>$(Escape-Html $Matches[1])</h2>"; continue }
        if ($line -match '^##\s+(.+)$') { if ($inList) { $html += "</ul>"; $inList = $false }; $html += "<h3>$(Escape-Html $Matches[1])</h3>"; continue }
        if ($line -match '^\-\s+(.+)$') { if (-not $inList) { $html += "<ul>"; $inList = $true }; $html += "<li>$(Escape-Html $Matches[1])</li>"; continue }
        if ([string]::IsNullOrWhiteSpace($line)) { if ($inList) { $html += "</ul>"; $inList = $false }; continue }
        if ($inList) { $html += "</ul>"; $inList = $false }
        $html += "<p>$(Escape-Html $line)</p>"
    }
    if ($inList) { $html += "</ul>" }
    return ($html -join "`n")
}

function Load-JsonFile($Path, $DefaultValue) {
    if (-not (Test-Path $Path)) { return $DefaultValue }
    try { return (Get-Content $Path -Raw | ConvertFrom-Json | ForEach-Object { $_ }) } catch { return $DefaultValue }
}

function Get-FeedItems($FeedUrl, $SourceName, $Theme) {
    try {
        $headers = @{ "User-Agent" = "Mozilla/5.0 DailyMacroBrief/1.0"; "Accept" = "application/rss+xml, application/xml, text/xml, */*" }
        $response = Invoke-WebRequest -Uri $FeedUrl -Headers $headers -TimeoutSec 25 -UseBasicParsing
        [xml]$feed = $response.Content
    } catch {
        Write-Warning "Could not fetch $SourceName - $($_.Exception.Message)"
        return @()
    }

    $items = @()
    foreach ($entry in @($feed.rss.channel.item)) {
        $published = $null
        try { $published = [datetime]::Parse([string]$entry.pubDate) } catch {}
        $title = Strip-Html ([string]$entry.title)
        $desc = Strip-Html ([string]$entry.description)
        $link = [string]$entry.link
        if ($title -and $link) {
            $items += [pscustomobject]@{
                Title = $title
                Link = $link
                Source = $SourceName
                Theme = $Theme
                Published = $published
                Description = $desc
                SearchText = ("$title $desc $SourceName $Theme").ToLowerInvariant()
            }
        }
    }
    return $items
}

function Get-RelevanceScore($Item) {
    $score = 0
    $text = $Item.SearchText
    $weights = @{
        "fed" = 16; "federal reserve" = 16; "inflation" = 16; "rates" = 12; "treasury" = 12; "yield" = 12;
        "consumer" = 14; "retail" = 12; "jobs" = 12; "labor" = 12; "wages" = 10; "housing" = 10;
        "ai" = 14; "chip" = 14; "semiconductor" = 14; "data center" = 12; "nvidia" = 12; "cloud" = 10;
        "china" = 12; "tariff" = 14; "sanction" = 12; "oil" = 12; "ukraine" = 10; "iran" = 10; "shipping" = 10;
        "defense" = 14; "aerospace" = 12; "industrial" = 12; "manufacturing" = 12; "backlog" = 10;
        "earnings" = 8; "guidance" = 8; "margin" = 8; "capex" = 10
    }
    foreach ($k in $weights.Keys) { if ($text.Contains($k)) { $score += $weights[$k] } }
    if ($Item.Source -match "Reuters|Financial Times|Wall Street Journal|Barron") { $score += 12 }
    if ($Item.Published) {
        $ageHours = ((Get-Date) - $Item.Published).TotalHours
        if ($ageHours -le 24) { $score += 20 } elseif ($ageHours -le 72) { $score += 12 } elseif ($ageHours -le 168) { $score += 6 }
    }
    return $score
}

function New-Impact($Item) {
    $text = $Item.SearchText
    if ($text -match "inflation|cpi|ppi|tariff|oil|shipping") { return "Inflation channel: this matters because persistent cost pressure can keep rates higher for longer and compress equity multiples, especially in long-duration growth names." }
    if ($text -match "fed|rate|yield|treasury") { return "Policy channel: rate expectations are the hinge between macro data and equity valuation. Watch whether this supports easing, patience, or renewed tightening risk." }
    if ($text -match "consumer|retail|jobs|wages|housing|credit") { return "Growth channel: consumer and labor data show whether the soft-landing base case is broadening or becoming more dependent on high-income households." }
    if ($text -match "ai|chip|semiconductor|data center|capex|cloud") { return "AI cycle channel: this affects the durability of hyperscaler capex, semiconductor demand, power demand, and the timeline for AI monetization." }
    if ($text -match "china|russia|ukraine|iran|middle east|sanction|defense") { return "Geopolitical channel: this can alter energy prices, defense budgets, trade flows, and supply-chain risk premia." }
    if ($text -match "industrial|manufacturing|aerospace|backlog") { return "Industrial cycle channel: this informs whether order books and reshoring demand can offset slower rate-sensitive activity." }
    return "Market signal: map this headline to growth, inflation, policy, or risk appetite, then decide whether it confirms or challenges your prior thesis."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
New-Item -ItemType Directory -Path "output","archive","data" -Force | Out-Null

$feeds = @(
    @{ Theme="Macro and Markets"; Source="Reuters/FT/WSJ/Barron's via Google News"; Url="https://news.google.com/rss/search?q=(site:reuters.com+OR+site:ft.com+OR+site:wsj.com+OR+site:barrons.com)+(markets+OR+economy+OR+Federal+Reserve)+when:7d&hl=en-US&gl=US&ceid=US:en" },
    @{ Theme="AI and Semiconductors"; Source="AI Markets via Google News"; Url="https://news.google.com/rss/search?q=(AI+OR+artificial+intelligence+OR+semiconductor+OR+Nvidia+OR+data+center+OR+hyperscaler)+markets+when:7d&hl=en-US&gl=US&ceid=US:en" },
    @{ Theme="Consumer"; Source="Consumer Macro via Google News"; Url="https://news.google.com/rss/search?q=(consumer+OR+retail+OR+spending+OR+jobs+OR+wages+OR+housing+OR+credit)+US+economy+when:7d&hl=en-US&gl=US&ceid=US:en" },
    @{ Theme="Geopolitics"; Source="Geopolitics via Google News"; Url="https://news.google.com/rss/search?q=(China+OR+tariffs+OR+sanctions+OR+oil+OR+Ukraine+OR+Middle+East+OR+shipping)+markets+when:7d&hl=en-US&gl=US&ceid=US:en" },
    @{ Theme="Industrials and Defense"; Source="Industrials/Defense via Google News"; Url="https://news.google.com/rss/search?q=(industrial+OR+manufacturing+OR+aerospace+OR+defense+OR+Lockheed+OR+Boeing)+markets+when:7d&hl=en-US&gl=US&ceid=US:en" }
)

$cutoff = (Get-Date).AddDays(-7)
$all = @()
foreach ($feed in $feeds) { $all += Get-FeedItems $feed.Url $feed.Source $feed.Theme }
$items = $all |
    Where-Object { $_.Title -and $_.Link -and ((-not $_.Published) -or $_.Published -ge $cutoff) } |
    Sort-Object Link -Unique |
    ForEach-Object {
        $_ | Add-Member -NotePropertyName Score -NotePropertyValue (Get-RelevanceScore $_) -Force
        $_ | Add-Member -NotePropertyName Impact -NotePropertyValue (New-Impact $_) -Force
        $_
    } |
    Sort-Object Score -Descending

if (-not $items -or @($items).Count -eq 0) {
    $manualPath = Join-Path $projectRoot "data\manual-news.json"
    $manual = @(Load-JsonFile $manualPath @())
    $items = $manual |
        Where-Object { $_.Title -and $_.Link } |
        ForEach-Object {
            $published = $null
            try { $published = [datetime]::Parse([string]$_.Published) } catch {}
            $obj = [pscustomobject]@{
                Title = [string]$_.Title
                Link = [string]$_.Link
                Source = [string]$_.Source
                Theme = [string]$_.Theme
                Published = $published
                Description = [string]$_.Description
                SearchText = ("$($_.Title) $($_.Description) $($_.Source) $($_.Theme)").ToLowerInvariant()
                Impact = [string]$_.Impact
            }
            $obj | Add-Member -NotePropertyName Score -NotePropertyValue (Get-RelevanceScore $obj) -Force
            if ([string]::IsNullOrWhiteSpace($obj.Impact)) { $obj.Impact = New-Impact $obj }
            $obj
        } |
        Where-Object { (-not $_.Published) -or $_.Published -ge $cutoff } |
        Sort-Object Score -Descending
    if (-not $items -or @($items).Count -eq 0) { throw "No recent news items were fetched and data/manual-news.json had no usable last-week items." }
    Write-Warning "Live RSS fetch failed; generated briefing from data/manual-news.json fallback."
}

$top = @($items | Select-Object -First 7)
$themeNames = @("Macro and Markets","AI and Semiconductors","Consumer","Geopolitics","Industrials and Defense")
$themeSections = @()
foreach ($theme in $themeNames) {
    $themeSections += [pscustomobject]@{ Name=$theme; Items=@($items | Where-Object { $_.Theme -eq $theme } | Select-Object -First $MaxItemsPerSection) }
}

$thesisMarkdown = if (Test-Path $ThesisPath) { Get-Content $ThesisPath -Raw } else { "# My Macro Thesis`n- Add your current view." }
$thesisHtml = Convert-MarkdownToSimpleHtml $thesisMarkdown
$watchlist = @(Load-JsonFile $WatchlistPath @())
$calendar = @(Load-JsonFile $CalendarPath @())
$feedback = @(Load-JsonFile $FeedbackPath @())
$recentFeedback = @($feedback | Select-Object -Last 5)

$aiCount = @($items | Where-Object { $_.SearchText -match "ai|semiconductor|chip|data center|nvidia|cloud" }).Count
$consumerCount = @($items | Where-Object { $_.SearchText -match "consumer|retail|jobs|wages|housing|credit" }).Count
$geoCount = @($items | Where-Object { $_.SearchText -match "china|tariff|sanction|ukraine|iran|oil|shipping" }).Count
$policyCount = @($items | Where-Object { $_.SearchText -match "fed|rate|inflation|treasury|yield" }).Count

$briefParagraphs = @(
    "Today`s briefing points to a market still organized around four linked questions: whether inflation is cooling enough to let policy ease, whether the consumer can keep spending without leaning too hard on credit, whether AI capital spending remains durable, and whether geopolitical shocks are raising the floor under defense, energy, and supply-chain risk.",
    "The policy mix is the first-order macro variable. I found $policyCount policy or inflation-sensitive headlines in the last-week source set. That matters because rate expectations are still the transmission mechanism from economic data into equity multiples. A cleaner disinflation path would broaden market leadership; renewed inflation pressure would likely favor quality balance sheets, pricing power, and cash-flow visibility.",
    "AI remains a structural growth theme, with $aiCount relevant headlines in the feed set. The differentiated question is no longer whether AI is important; it is whether capex, power availability, chip supply, and enterprise monetization all progress at the same time. If the buildout stays synchronized, the AI trade can broaden from semiconductors into power, cooling, networking, software, and industrial infrastructure. If monetization lags capex, valuation risk rises first in the highest-expectation names.",
    "The consumer picture is still bifurcated, with $consumerCount relevant items. For an investment process, this argues against treating the consumer as one simple variable. Staples, value retail, premium brands, travel, housing, and credit-sensitive discretionary categories can all send different signals at once. The practical thesis is selective consumer resilience rather than blanket strength.",
    "Geopolitical and industrial coverage remains meaningful, with $geoCount geopolitics-linked headlines. The broad macro implication is that globalization is less efficient than it was in the 2010s. That can support defense budgets, domestic manufacturing, inventory buffers, and commodity optionality, but it can also keep inflation volatility higher than investors expect.",
    "Base case for the living thesis: moderate U.S. growth, uneven but positive disinflation, durable AI infrastructure spending, and higher strategic demand for defense and industrial capacity. The key risk is not one bad headline; it is a cluster of data showing sticky inflation, weakening labor income, or AI capex discipline arriving before AI revenue visibility."
)

if ($recentFeedback.Count -gt 0) {
    $likes = ($recentFeedback | ForEach-Object { $_.liked } | Where-Object { $_ } | Select-Object -Last 3) -join "; "
    $dislikes = ($recentFeedback | ForEach-Object { $_.disliked } | Where-Object { $_ } | Select-Object -Last 3) -join "; "
    if ($likes -or $dislikes) { $briefParagraphs += "Reader feedback memory: keep emphasizing what worked ($likes) and reduce what did not ($dislikes)." }
}

function List-NewsHtml($NewsItems) {
    $out = @()
    foreach ($i in @($NewsItems)) {
        $date = if ($i.Published) { $i.Published.ToString("MMM d, h:mm tt") } else { "Recent" }
        $out += "<article class='story'><h3><a href='$(Escape-Html $i.Link)' target='_blank'>$(Escape-Html $i.Title)</a></h3><p class='meta'>$(Escape-Html $i.Theme) | $(Escape-Html $i.Source) | $date | Relevance $($i.Score)</p><p>$(Escape-Html $i.Description)</p><p><strong>Why it matters:</strong> $(Escape-Html $i.Impact)</p></article>"
    }
    if ($out.Count -eq 0) { $out += "<p>No recent items found for this section.</p>" }
    return ($out -join "`n")
}

$topHtml = List-NewsHtml $top
$themeHtml = ($themeSections | ForEach-Object { "<section class='theme'><h2>$($_.Name)</h2>$(List-NewsHtml $_.Items)</section>" }) -join "`n"
$briefHtml = ($briefParagraphs | ForEach-Object { "<p>$(Escape-Html $_)</p>" }) -join "`n"
$watchHtml = if ($watchlist.Count) { ($watchlist | ForEach-Object { "<li><strong>$(Escape-Html $_.ticker)</strong> - $(Escape-Html $_.theme): $(Escape-Html $_.thesis)</li>" }) -join "`n" } else { "<li>Add tickers and themes in data/watchlist.json.</li>" }
$calendarHtml = if ($calendar.Count) { ($calendar | Select-Object -Last 8 | ForEach-Object { "<li><strong>$(Escape-Html $_.date)</strong> - $(Escape-Html $_.event) <span class='muted'>Actual: $(Escape-Html $_.actual) | Consensus: $(Escape-Html $_.consensus) | Prior: $(Escape-Html $_.prior)</span><br><span>$(Escape-Html $_.impact)</span></li>" }) -join "`n" } else { "<li>Add events in data/macro-calendar.json.</li>" }
$sourceHtml = ($items | Select-Object -First 35 | ForEach-Object { "<li><a href='$(Escape-Html $_.Link)' target='_blank'>$(Escape-Html $_.Title)</a> <span class='muted'>$(Escape-Html $_.Source)</span></li>" }) -join "`n"
$feedbackJson = ($feedback | ConvertTo-Json -Depth 5 -Compress)
$generatedAt = (Get-Date).ToString("dddd, MMMM d, yyyy h:mm tt")
$dateStamp = (Get-Date).ToString("yyyy-MM-dd")

$html = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Kelley Macro Brief</title>
<style>
:root { --paper:#f4f0e8; --ink:#141414; --muted:#666158; --line:#cfc5b6; --panel:#fffdf8; --accent:#7b1f1f; --blue:#12395f; }
* { box-sizing:border-box; }
body { margin:0; background:var(--paper); color:var(--ink); font-family:Georgia, 'Times New Roman', serif; }
.page { max-width:1180px; margin:0 auto; padding:24px 22px 56px; }
.masthead { border-top:5px solid var(--ink); border-bottom:2px solid var(--ink); padding:16px 0 14px; display:grid; grid-template-columns:1fr auto; gap:16px; align-items:end; }
.kicker { font:700 12px/1.2 Arial, sans-serif; letter-spacing:.18em; text-transform:uppercase; color:var(--accent); }
h1 { margin:4px 0 0; font-size:42px; line-height:1; font-weight:500; letter-spacing:0; }
.date { font:13px/1.4 Arial, sans-serif; color:var(--muted); text-align:right; }
.tabs { display:flex; gap:8px; flex-wrap:wrap; border-bottom:1px solid var(--line); padding:14px 0 10px; }
.tab { border:1px solid var(--line); background:var(--panel); padding:9px 12px; font:700 13px Arial, sans-serif; cursor:pointer; color:var(--ink); }
.tab.active { background:var(--ink); color:white; border-color:var(--ink); }
.panel { display:none; padding-top:18px; }
.panel.active { display:block; }
.grid { display:grid; grid-template-columns:minmax(0,2fr) minmax(280px,1fr); gap:22px; align-items:start; }
.box { background:var(--panel); border:1px solid var(--line); padding:18px; }
h2 { font:700 22px/1.15 Arial, sans-serif; margin:0 0 12px; border-bottom:1px solid var(--line); padding-bottom:8px; }
h3 { font-size:20px; line-height:1.2; margin:0 0 6px; }
p, li { font-size:16px; line-height:1.62; }
a { color:var(--blue); text-decoration:none; }
a:hover { text-decoration:underline; }
.meta, .muted { color:var(--muted); font:13px/1.45 Arial, sans-serif; }
.story { border-bottom:1px solid var(--line); padding:14px 0; }
.story:first-child { padding-top:0; }
.story:last-child { border-bottom:0; }
.theme { margin-bottom:24px; }
.editable { min-height:240px; padding:14px; background:white; border:1px dashed #938777; }
textarea, input { width:100%; border:1px solid var(--line); background:white; color:var(--ink); padding:10px; font:14px Arial, sans-serif; }
label { display:block; font:700 13px Arial, sans-serif; margin:12px 0 5px; }
button.action { border:0; background:var(--ink); color:white; padding:10px 13px; font:700 13px Arial, sans-serif; cursor:pointer; margin-top:12px; }
button.secondary { background:#56514a; }
.source-list { columns:2; column-gap:28px; }
.source-list li { break-inside:avoid; margin-bottom:8px; }
.badge-row { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:0 0 18px; }
.badge { background:var(--panel); border:1px solid var(--line); padding:12px; font:13px Arial, sans-serif; }
.badge strong { display:block; font-size:22px; font-family:Georgia, 'Times New Roman', serif; }
@media (max-width:900px) { .grid, .masthead { grid-template-columns:1fr; } .date { text-align:left; } h1 { font-size:34px; } .source-list { columns:1; } .badge-row { grid-template-columns:repeat(2,1fr); } }
</style>
</head>
<body>
<main class="page">
<header class="masthead">
  <div><div class="kicker">Investment Management Daily Intelligence</div><h1>The Kelley Macro Brief</h1></div>
  <div class="date">$generatedAt<br>Freshman IMW preparation edition</div>
</header>
<nav class="tabs">
  <button class="tab active" data-tab="brief">Daily Briefing</button>
  <button class="tab" data-tab="thesis">Living Thesis</button>
  <button class="tab" data-tab="feedback">Feedback Loop</button>
  <button class="tab" data-tab="calendar">Macro Calendar</button>
  <button class="tab" data-tab="sources">Sources</button>
</nav>
<section id="brief" class="panel active">
  <div class="badge-row"><div class="badge"><strong>$policyCount</strong>Policy/inflation signals</div><div class="badge"><strong>$aiCount</strong>AI cycle signals</div><div class="badge"><strong>$consumerCount</strong>Consumer signals</div><div class="badge"><strong>$geoCount</strong>Geopolitical signals</div></div>
  <div class="grid"><article class="box"><h2>Executive Macro Thesis</h2>$briefHtml</article><aside class="box"><h2>Watchlist</h2><ul>$watchHtml</ul></aside></div>
  <div class="box" style="margin-top:22px"><h2>Top Must-Read Headlines</h2>$topHtml</div>
  <div class="box" style="margin-top:22px"><h2>Theme Breakdown</h2>$themeHtml</div>
</section>
<section id="thesis" class="panel">
  <div class="grid"><article class="box"><h2>Editable Macro Thesis</h2><div id="thesisBox" class="editable" contenteditable="true">$thesisHtml</div><button class="action" onclick="saveThesis()">Save in this browser</button> <button class="action secondary" onclick="resetThesis()">Reset</button><p class="meta">Browser edits are instant for your own review. Durable daily-email edits live in data/thesis.md.</p></article><aside class="box"><h2>Differentiated View Builder</h2><p>Each day, write one sentence for what changed, one sentence for what it means, and one sentence for what would change your mind.</p><ul><li>Growth: broadening or narrowing?</li><li>Inflation: cooling, sticky, or re-accelerating?</li><li>Policy: easier, patient, or tighter?</li><li>AI: capex durable or expectations stretched?</li><li>Geopolitics: temporary shock or structural risk premium?</li></ul></aside></div>
</section>
<section id="feedback" class="panel">
  <div class="grid"><article class="box"><h2>Daily Feedback</h2><label>What was most useful?</label><textarea id="liked" rows="4"></textarea><label>What was missing or too shallow?</label><textarea id="disliked" rows="4"></textarea><label>Topics to emphasize tomorrow</label><input id="topics" placeholder="Example: uranium, defense primes, credit stress, private AI infra"><button class="action" onclick="saveFeedback()">Save feedback</button> <button class="action secondary" onclick="downloadFeedback()">Export feedback file</button><p class="meta">To fully internalize feedback in tomorrow's generated email, export and place it at data/feedback.json. I created the file so this can become part of the daily generation loop.</p></article><aside class="box"><h2>Stored Feedback Memory</h2><div id="feedbackLog"></div></aside></div>
</section>
<section id="calendar" class="panel"><div class="box"><h2>Macro Calendar Notes</h2><ul>$calendarHtml</ul></div></section>
<section id="sources" class="panel"><div class="box"><h2>News Sources Used</h2><p class="meta">All listed items were filtered to the last seven days when publication timestamps were available.</p><ol class="source-list">$sourceHtml</ol></div></section>
</main>
<script>
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
tabs.forEach(btn => btn.addEventListener('click', () => { tabs.forEach(b => b.classList.remove('active')); panels.forEach(p => p.classList.remove('active')); btn.classList.add('active'); document.getElementById(btn.dataset.tab).classList.add('active'); }));
const thesisKey = 'kelley_macro_thesis_v2';
const thesisBox = document.getElementById('thesisBox');
if (localStorage.getItem(thesisKey)) thesisBox.innerHTML = localStorage.getItem(thesisKey);
function saveThesis(){ localStorage.setItem(thesisKey, thesisBox.innerHTML); alert('Saved in this browser.'); }
function resetThesis(){ localStorage.removeItem(thesisKey); location.reload(); }
let feedback = $feedbackJson;
if (!Array.isArray(feedback)) feedback = [];
const feedbackKey = 'kelley_macro_feedback_v2';
const localFeedback = JSON.parse(localStorage.getItem(feedbackKey) || '[]');
feedback = feedback.concat(localFeedback);
function renderFeedback(){ const log = document.getElementById('feedbackLog'); if (!feedback.length) { log.innerHTML = '<p class="meta">No feedback saved yet.</p>'; return; } log.innerHTML = feedback.slice(-8).reverse().map(f => `<div class="story"><p><strong>${f.date || 'Saved'}</strong></p><p><strong>Liked:</strong> ${f.liked || ''}</p><p><strong>Improve:</strong> ${f.disliked || ''}</p><p><strong>Next:</strong> ${f.topics || ''}</p></div>`).join(''); }
function saveFeedback(){ const entry = { date:new Date().toISOString(), liked:document.getElementById('liked').value, disliked:document.getElementById('disliked').value, topics:document.getElementById('topics').value }; const arr = JSON.parse(localStorage.getItem(feedbackKey) || '[]'); arr.push(entry); localStorage.setItem(feedbackKey, JSON.stringify(arr, null, 2)); feedback.push(entry); renderFeedback(); alert('Feedback saved in this browser. Export it when you want it included in future generated briefings.'); }
function downloadFeedback(){ const blob = new Blob([JSON.stringify(feedback, null, 2)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'feedback.json'; a.click(); URL.revokeObjectURL(a.href); }
renderFeedback();
</script>
</body>
</html>
"@

$outputParent = Split-Path $OutputPath -Parent
if (-not (Test-Path $outputParent)) { New-Item -ItemType Directory -Path $outputParent -Force | Out-Null }
Set-Content -Path $OutputPath -Value $html -Encoding utf8
$archiveHtmlPath = Join-Path "archive" "$dateStamp.html"
Set-Content -Path $archiveHtmlPath -Value $html -Encoding utf8
$items | Select-Object Title,Link,Source,Theme,Published,Score,Description,Impact | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path "archive" "$dateStamp.json") -Encoding utf8
if (-not (Test-Path $FeedbackPath)) { "[]" | Set-Content -Path $FeedbackPath -Encoding utf8 }
Write-Host "Briefing generated at: $OutputPath"
Write-Host "Archive snapshot: $archiveHtmlPath"




