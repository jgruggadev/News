# GitHub Actions Setup

This is the recommended replacement for Vercel.

## What It Does

Every day, GitHub Actions will:

1. Fetch recent market and macro news.
2. Generate an Obsidian markdown briefing.
3. Commit the briefing back to the repo.
4. Send the briefing to `jtalbans@iu.edu` through Gmail SMTP.

## Files To Push

```text
.github/workflows/daily-briefing.yml
automation/github-actions/daily-briefing.mjs
```

## Required GitHub Secrets

Go to:

```text
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Add:

```text
SMTP_USER=jtalbans@gmail.com
SMTP_PASS=your-new-gmail-app-password
SMTP_FROM=jtalbans@gmail.com
BRIEFING_TO=jtalbans@iu.edu
```

Regenerate the Gmail app password before using it.

## Test Manually

1. Go to the repo on GitHub.
2. Click `Actions`.
3. Select `Daily Macro Briefing`.
4. Click `Run workflow`.
5. Check your email and the updated Obsidian notes.

## Schedule

The workflow currently uses:

```yaml
- cron: '0 13 * * *'
```

That is 9:00 AM Eastern during daylight saving time. During standard time, use:

```yaml
- cron: '0 14 * * *'
```
