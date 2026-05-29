# Cron URL Scheduler Setup

Goal: use a URL-based cron scheduler to trigger the daily briefing email at 9:00 AM Eastern, without using PowerShell.

## Important Architecture

A cron URL scheduler does not send email by itself. It only visits a URL on a schedule.

So the setup is:

1. Cron scheduler calls a private URL.
2. The private URL runs the briefing endpoint.
3. The endpoint fetches news, creates markdown, sends the email through Gmail SMTP, and optionally updates the Obsidian vault through GitHub.

## Exact Cron Job Inputs

Use these settings in your cron job scheduler after the endpoint is deployed.

### URL

```text
https://YOUR-DEPLOYED-ENDPOINT.vercel.app/api/daily-briefing?key=YOUR_CRON_SECRET
```

You will replace:

- `YOUR-DEPLOYED-ENDPOINT.vercel.app` with the URL from Vercel.
- `YOUR_CRON_SECRET` with the same secret you set as the `CRON_SECRET` environment variable.

Example format:

```text
https://kelley-news-briefing.vercel.app/api/daily-briefing?key=long-random-secret-here
```

### Method

```text
GET
```

### Schedule

```text
Every day at 9:00 AM
```

### Time Zone

```text
America/New_York
```

If the cron scheduler does not support time zones, use UTC time:

- During Eastern Standard Time: `14:00 UTC`
- During Eastern Daylight Time: `13:00 UTC`

Most of the school year uses both, so choose a scheduler that supports `America/New_York` if possible.

### Expected Successful Response

```json
{
  "ok": true,
  "date": "YYYY-MM-DD",
  "items": 25
}
```

### Failure Alerts

Turn on email alerts for failures if the cron service supports it.

## SMTP Environment Variables For The Endpoint

Set these in the deployment host, not in the cron scheduler URL and not in GitHub files.

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=jtalbans@gmail.com
SMTP_PASS=the Gmail app password you generated
SMTP_FROM=jtalbans@gmail.com
BRIEFING_TO=jtalbans@iu.edu
CRON_SECRET=make-a-long-random-secret
```

The Gmail app password should go only into the host's encrypted environment variable settings.

## GitHub Variables For Obsidian Updates

If you want the cloud endpoint to update Obsidian markdown in real time, yes, I need GitHub connected.

Set these only after your `News` vault is in a GitHub repo:

```text
GITHUB_TOKEN=github-token-with-repo-contents-access
GITHUB_OWNER=your-github-username
GITHUB_REPO=your-news-vault-repo-name
GITHUB_BRANCH=main
OBSIDIAN_DAILY_PATH=01 - Daily Briefings
OBSIDIAN_LATEST_PATH=00 - Home/Latest Daily Briefing.md
```

Without GitHub, the cloud endpoint can still email you every morning, but it cannot directly write into your local OneDrive Obsidian vault because a public web endpoint cannot access your laptop files.

## Recommended Deployment Path

Use Vercel for the endpoint and cron-job.org for scheduling.

1. Put the `cloud` folder in a GitHub repo.
2. Import the repo into Vercel.
3. Set the environment variables in Vercel.
4. Deploy.
5. Copy the deployed URL.
6. Create the cron job with the URL format above.

## Files Created For This

- `cloud/api/daily-briefing.js` - URL endpoint that fetches news, sends Gmail SMTP email, and optionally updates GitHub markdown.
- `cloud/package.json` - endpoint dependencies.
- `cloud/vercel.json` - Vercel deployment config.
- `cloud/.env.example` - safe example environment variables.

## Fixing `401 Unauthorized`

A `401 Unauthorized` response means the endpoint was reached, but the `key=` value in the URL did not match the Vercel environment variable `CRON_SECRET`.

Use this exact pair:

```text
Vercel environment variable:
CRON_SECRET=kelley-news-briefing-2026-private-trigger
```

```text
Cron URL key:
?key=kelley-news-briefing-2026-private-trigger
```

Do not include quotes. Do not add spaces before or after the value.

After changing environment variables in Vercel, redeploy. Environment variable changes do not reliably apply to already-built deployments.

### Diagnostic URL

After redeploying, open:

```text
https://YOUR-VERCEL-PROJECT.vercel.app/api/health
```

You want to see:

```json
"CRON_SECRET_configured": true
```

If it says `false`, the secret is not configured in the Vercel environment used by that deployment.
