param(
    [Parameter(Mandatory = $true)][string]$BriefingPath,
    [string]$To = "jtalbans@iu.edu",
    [string]$Subject = "Daily Macro Briefing",
    [switch]$Test
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not (Test-Path $BriefingPath)) { throw "Briefing file not found: $BriefingPath" }

$smtpHost = $env:BRIEFING_SMTP_HOST
$smtpPort = if ($env:BRIEFING_SMTP_PORT) { [int]$env:BRIEFING_SMTP_PORT } else { 587 }
$smtpUser = $env:BRIEFING_SMTP_USER
$smtpPass = $env:BRIEFING_SMTP_PASS
$from = if ($env:BRIEFING_EMAIL_FROM) { $env:BRIEFING_EMAIL_FROM } elseif ($smtpUser) { $smtpUser } else { "daily-briefing@localhost" }
$enableSsl = if ($env:BRIEFING_SMTP_SSL -eq "false") { $false } else { $true }

$html = Get-Content $BriefingPath -Raw
$plain = "Your Daily Macro Briefing is attached and included below. Open the HTML file for the full interactive version."
$outDir = Split-Path -Parent $BriefingPath
$previewPath = Join-Path $outDir "last-email-preview.html"
Set-Content -Path $previewPath -Value $html -Encoding utf8

if ([string]::IsNullOrWhiteSpace($smtpHost) -or [string]::IsNullOrWhiteSpace($smtpUser) -or [string]::IsNullOrWhiteSpace($smtpPass)) {
    $needed = @(
        "BRIEFING_SMTP_HOST=smtp.gmail.com",
        "BRIEFING_SMTP_PORT=587",
        "BRIEFING_SMTP_USER=your-email@domain.com",
        "BRIEFING_SMTP_PASS=your-app-password",
        "BRIEFING_EMAIL_FROM=your-email@domain.com"
    ) -join "`n"
    throw "SMTP settings are missing, so no email was sent. Set these user environment variables:`n$needed`nA preview was written to $previewPath"
}

$message = New-Object System.Net.Mail.MailMessage
$message.From = $from
$message.To.Add($To)
$message.Subject = if ($Test) { "TEST - $Subject" } else { $Subject }
$message.Body = $html
$message.IsBodyHtml = $true
$message.AlternateViews.Add([System.Net.Mail.AlternateView]::CreateAlternateViewFromString($plain, $null, "text/plain"))
$message.Attachments.Add((New-Object System.Net.Mail.Attachment($BriefingPath)))
$vaultRoot = Split-Path -Parent (Split-Path -Parent $BriefingPath)
$latestMd = Join-Path $vaultRoot "00 - Home\Latest Daily Briefing.md"
if (Test-Path $latestMd) { $message.Attachments.Add((New-Object System.Net.Mail.Attachment($latestMd))) }

$client = New-Object System.Net.Mail.SmtpClient($smtpHost, $smtpPort)
$client.EnableSsl = $enableSsl
$client.Credentials = New-Object System.Net.NetworkCredential($smtpUser, $smtpPass)
$tryHost = "$smtpHost`:$smtpPort"
try {
    $client.Send($message)
} catch {
    $detail = $_.Exception.Message
    if ($_.Exception -is [System.Net.Mail.SmtpException]) { $detail += " | Status: " + $_.Exception.StatusCode }
    if ($_.Exception.InnerException) { $detail += " | Inner: " + $_.Exception.InnerException.Message }
    throw "Email send failed via $tryHost as $smtpUser. $detail"
} finally {
    $message.Dispose()
    $client.Dispose()
}

Write-Host "Email sent to $To via $smtpHost."


