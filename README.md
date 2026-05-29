# Kelley Daily Macro Briefing

This folder now contains a daily briefing system for market, macro, AI, consumer, geopolitics, industrials, and defense news.

## Main files

- `output/daily-briefing.html` - the briefing page you can open any time.
- `archive/YYYY-MM-DD.html` - daily snapshots.
- `data/thesis.md` - your durable living macro thesis. Edit this when you want the next email to reflect your view.
- `data/feedback.json` - feedback memory used by future briefings.
- `data/manual-news.json` - fallback news snapshot if Windows blocks RSS fetching.
- `scripts/generate-briefing.ps1` - builds the page and archive.
- `scripts/send-briefing-email.ps1` - sends the page by SMTP.
- `run-daily-briefing.ps1` - daily job entry point.
- `setup-scheduled-task.ps1` - creates the Windows 9:00 AM scheduled task when enabled.

## Email setup

The sender expects these user environment variables:

```powershell
[Environment]::SetEnvironmentVariable('BRIEFING_SMTP_HOST','smtp.gmail.com','User')
[Environment]::SetEnvironmentVariable('BRIEFING_SMTP_PORT','587','User')
[Environment]::SetEnvironmentVariable('BRIEFING_SMTP_USER','your-email@gmail.com','User')
[Environment]::SetEnvironmentVariable('BRIEFING_SMTP_PASS','your-google-app-password','User')
[Environment]::SetEnvironmentVariable('BRIEFING_EMAIL_FROM','your-email@gmail.com','User')
```

For Gmail, this usually must be a Google App Password, not your normal password. After setting it, open a new PowerShell window and run:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\send-briefing-email.ps1 -BriefingPath .\output\daily-briefing.html -To jtalbans@iu.edu -Subject "Daily Macro Briefing Test" -Test
```

## Daily schedule

After email works, enable the 9:00 AM local scheduled task:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\setup-scheduled-task.ps1 -EnableScheduling -DailyTime 09:00
```

The current Windows timezone should be Eastern Time for this to fire at 9:00 AM ET.

## Current note

RSS fetching from this Windows session is currently failing during TLS handshake, so the generator falls back to `data/manual-news.json`. Once the Windows web stack can fetch HTTPS RSS feeds, live Google News RSS feeds will be used automatically.
