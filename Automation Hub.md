# Automation Hub

This project no longer depends on Vercel.

## Recommended System

**GitHub Actions** runs the daily briefing at 9:00 AM Eastern, generates markdown, commits the briefing back into the Obsidian vault, and sends the email through Gmail SMTP.

```mermaid
flowchart LR
  A[GitHub Actions schedule] --> B[Fetch market/news RSS]
  B --> C[Generate markdown briefing]
  C --> D[Commit to Obsidian vault repo]
  C --> E[Send Gmail SMTP email]
  D --> F[Open in Obsidian]
  E --> G[jtalbans@iu.edu]
```

## Why Not Cron-job.org Alone?

Cron-job.org is excellent for calling URLs on a schedule, custom HTTP methods, headers, and bodies. It also has failure/recovery notifications. But it does not run your research code or send a custom Gmail SMTP briefing by itself. It needs to call some endpoint that does the work.

## Best Options

| Option | Best Use | Pros | Tradeoff |
|---|---|---|---|
| GitHub Actions | Main daily briefing engine | Free, no server, commits markdown, sends email | Schedule is UTC, so daylight saving time needs attention |
| cron-job.org | Monitor or trigger a hosted endpoint | Simple URL scheduler, good failure alerts | Needs an endpoint; does not replace the briefing engine |
| Make/Zapier | No-code automation | Easy integrations | Less flexible, can cost money, weaker markdown workflow |
| Local scheduler | Laptop-only system | Directly updates local Obsidian | Laptop must be awake and online |

## Current Build Choice

Use GitHub Actions as the core system.

Files:

- `.github/workflows/daily-briefing.yml`
- `automation/github-actions/daily-briefing.mjs`

## Required GitHub Secrets

Add these in GitHub repo settings:

```text
SMTP_USER=jtalbans@gmail.com
SMTP_PASS=your-new-gmail-app-password
SMTP_FROM=jtalbans@gmail.com
BRIEFING_TO=jtalbans@iu.edu
```

Because the old app password was pasted in chat, regenerate it before using it.

## How To Test

1. Push the workflow files to GitHub.
2. Open the repo on GitHub.
3. Go to Actions.
4. Select `Daily Macro Briefing`.
5. Click `Run workflow`.
6. Confirm that:
   - An email arrives at `jtalbans@iu.edu`.
   - `00 - Home/Latest Daily Briefing.md` updates.
   - `01 - Daily Briefings/YYYY-MM-DD Daily Macro Briefing.md` is created.

## Cron-job.org Role After This

Optional: create a cron-job.org monitor that checks GitHub Actions status or a lightweight status page. Do not use it as the main briefing sender unless we add a separate hosted endpoint again.
