# RSS To Email Setup

This note is the exact setup checklist for the news briefing automation.

## Recommended Architecture

Use GitHub Actions as the scheduler, generator, committer, and email sender.

```mermaid
flowchart LR
  A[GitHub Actions 9 AM ET] --> B[Fetch RSS feeds]
  B --> C[Generate Markdown Briefing]
  C --> D[Commit to Obsidian Vault]
  C --> E[Send Email via Gmail SMTP]
  D --> F[Obsidian]
  E --> G[jtalbans@iu.edu]
```

## Files Required In The Repo

Push these exact files and folders:

```text
.github/workflows/daily-briefing.yml
automation/github-actions/daily-briefing.mjs
00 - Home/Start Here.md
06 - Dashboards/News Operating System.md
10 - Automation/Automation Hub.md
10 - Automation/GitHub Actions Setup.md
10 - Automation/RSS To Email Setup.md
```

## GitHub Secrets Required

Go to:

```text
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Add:

```text
SMTP_USER=jtalbans@gmail.com
SMTP_PASS=NEW_GMAIL_APP_PASSWORD
SMTP_FROM=jtalbans@gmail.com
BRIEFING_TO=jtalbans@iu.edu
```

Important: regenerate the Gmail app password because an older one was pasted into chat.

## Gmail App Password Steps

1. Go to your Google Account.
2. Make sure 2-Step Verification is on.
3. Search settings for `App passwords`.
4. Create a new app password for Mail.
5. Copy the generated 16-character password.
6. Paste it only into GitHub Actions secret `SMTP_PASS`.

## How To Test

1. Push the files to GitHub.
2. Open the repo on GitHub.
3. Go to `Actions`.
4. Select `Daily Macro Briefing`.
5. Click `Run workflow`.
6. Confirm three things:
   - Email arrives at `jtalbans@iu.edu`.
   - `00 - Home/Latest Daily Briefing.md` updates.
   - `01 - Daily Briefings/YYYY-MM-DD Daily Macro Briefing.md` is created.

## If The Email Fails

Check:

- `SMTP_USER` is the Gmail address.
- `SMTP_PASS` is the app password, not the normal Gmail password.
- `SMTP_FROM` matches the sending Gmail account.
- Gmail app password has no spaces when pasted.

## If The Markdown Does Not Commit

Check:

- Repository settings allow GitHub Actions write access.
- Go to `Settings -> Actions -> General -> Workflow permissions`.
- Choose `Read and write permissions`.
- Save.

## Schedule

The workflow currently uses:

```yaml
- cron: '0 13 * * *'
```

That is 9:00 AM Eastern during daylight saving time. During standard time, change to:

```yaml
- cron: '0 14 * * *'
```

## RSS Feeds Currently Covered

- Macro and Markets
- AI and Semiconductors
- Consumer
- Geopolitics
- Industrials and Defense

Update feeds in:

```text
automation/github-actions/daily-briefing.mjs
```
