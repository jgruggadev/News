# Vercel + GitHub Deployment Guide

Repo: `jgruggadev/news`

Goal: Vercel hosts the briefing endpoint. A cron scheduler calls the endpoint every day at 9:00 AM Eastern. The endpoint sends the email through Gmail SMTP and commits the daily markdown briefing back into this Obsidian vault repo.

## Step 0 - Security First

Because the Gmail app password was pasted into chat, create a fresh Gmail App Password before deployment and use the new one in Vercel.

Do not commit SMTP passwords or GitHub tokens into this repo.

## Step 1 - Make Sure GitHub Has The Cloud Folder

The repo `jgruggadev/news` needs these files:

- `package.json`\r\n- `vercel.json`\r\n- `api/daily-briefing.js`\r\n- `cloud/.env.example` as a reference only

Vercel is deploying the repo root `news`, so the live endpoint files must also exist at the repo root.

## Step 2 - Create A GitHub Token For Obsidian Updates

Only needed if the Vercel endpoint should update markdown files in the repo.

1. Open GitHub.
2. Go to Settings.
3. Go to Developer settings.
4. Go to Personal access tokens.
5. Choose Fine-grained tokens.
6. Create a new token.
7. Repository access: select only `jgruggadev/news`.
8. Permissions: set `Contents` to `Read and write`.
9. Generate the token and save it securely.

This becomes the Vercel environment variable `GITHUB_TOKEN`.

## Step 3 - Import The Repo Into Vercel

1. Go to `https://vercel.com`.
2. Sign in with GitHub.
3. Click `Add New`.
4. Click `Project`.
5. Find `jgruggadev/news`.
6. Click `Import`.
7. In project configuration, set:
   - Framework Preset: `Other`
   - Root Directory: `news` / repo root
   - Build Command: leave blank
   - Install Command: `npm install`
   - Output Directory: leave blank
8. Do not deploy yet if Vercel lets you add environment variables first. If it deploys immediately, that is fine; you will redeploy after variables are added.

## Step 4 - Add Vercel Environment Variables

In Vercel:

1. Open the project.
2. Go to Settings.
3. Go to Environment Variables.
4. Add these for Production.

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=jtalbans@gmail.com
SMTP_PASS=NEW_GMAIL_APP_PASSWORD_HERE
SMTP_FROM=jtalbans@gmail.com
BRIEFING_TO=jtalbans@iu.edu
CRON_SECRET=kelley-news-briefing-2026-private-trigger
GITHUB_TOKEN=YOUR_FINE_GRAINED_GITHUB_TOKEN
GITHUB_OWNER=jgruggadev
GITHUB_REPO=news
GITHUB_BRANCH=main
OBSIDIAN_DAILY_PATH=01 - Daily Briefings
OBSIDIAN_LATEST_PATH=00 - Home/Latest Daily Briefing.md
```

If you are not ready to update Obsidian through GitHub yet, omit these for now:

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
OBSIDIAN_DAILY_PATH
OBSIDIAN_LATEST_PATH
```

The email will still work, but the vault will not update from the cloud endpoint.

## Step 5 - Redeploy

After environment variables are saved:

1. Go to the Vercel project Deployments tab.
2. Click the latest deployment menu.
3. Click Redeploy.
4. Wait for the deployment to finish.

Environment variable changes apply only to new deployments.

## Step 6 - Test The Endpoint In Your Browser

After deployment, Vercel will give you a domain like:

```text
https://your-project-name.vercel.app
```

Test this URL:

```text
https://your-project-name.vercel.app/api/daily-briefing?key=kelley-news-briefing-2026-private-trigger
```

Expected response:

```json
{
  "ok": true,
  "date": "YYYY-MM-DD",
  "items": 25
}
```

You should also receive the email at `jtalbans@iu.edu`.

## Step 7 - Cron Scheduler Inputs

Use these exact cron settings after the endpoint test works.

```text
URL: https://your-project-name.vercel.app/api/daily-briefing?key=kelley-news-briefing-2026-private-trigger
Method: GET
Schedule: Every day at 9:00 AM
Timezone: America/New_York
```

If the scheduler only accepts UTC:

```text
13:00 UTC during daylight saving time
14:00 UTC during standard time
```

Prefer a scheduler that supports `America/New_York` so you do not need to change it manually.

## Step 8 - Confirm Obsidian Sync

If GitHub variables are configured:

1. Run the endpoint once.
2. Open `jgruggadev/news` on GitHub.
3. Confirm these files updated:
   - `00 - Home/Latest Daily Briefing.md`
   - `01 - Daily Briefings/YYYY-MM-DD Daily Macro Briefing.md`
4. Pull/sync the repo locally so Obsidian sees the newest files.

## What Codex Needs If You Want It To Push The Files

I need GitHub write access to `jgruggadev/news` or you can push the local folder yourself.

Files that must be pushed:\r\n\r\n- `api/daily-briefing.js`\r\n- `package.json`\r\n- `vercel.json`\r\n- `cloud/` optional reference copy
- `05 - Setup/Cron URL Scheduler Setup.md`
- `05 - Setup/Vercel GitHub Deployment Guide.md`

## Current Recommended Cron URL Template

```text
https://YOUR-VERCEL-PROJECT.vercel.app/api/daily-briefing?key=kelley-news-briefing-2026-private-trigger
```

## Fix For "Invalid vercel.json file provided"

If Vercel only lets you select the repo root `news`, use this exact root-level `vercel.json`:

```json
{
  "functions": {
    "api/daily-briefing.js": {
      "maxDuration": 10
    }
  }
}
```

Do not use `version`, `routes`, or a `cloud/api/...` function path when the root directory is `news`.

The endpoint must be here:

```text
api/daily-briefing.js
```

Not only here:

```text
cloud/api/daily-briefing.js
```

## Current Fix: Delete `vercel.json`

If Vercel says `Invalid vercel.json file provided`, remove `vercel.json` entirely and redeploy. This endpoint does not need a Vercel config file.

The deployment root that Vercel selected must contain exactly these required files:

```text
api/daily-briefing.js
package.json
```

There should be no `vercel.json` file while debugging this error.

### If Vercel Root Directory Is `news`

Then GitHub must look like this:

```text
jgruggadev/news
└── news
    ├── api
    │   └── daily-briefing.js
    └── package.json
```

### If Vercel Root Directory Is Repository Root

Then GitHub must look like this:

```text
jgruggadev/news
├── api
│   └── daily-briefing.js
└── package.json
```

The key rule: whichever folder Vercel calls the Root Directory must directly contain `api/daily-briefing.js` and `package.json`.

After pushing this change, in Vercel click Redeploy and choose the option to use the latest commit.

## Post-Deploy Test Sequence

If the base Vercel URL shows `404: NOT_FOUND`, that usually means you visited the homepage, not the API endpoint. This project is primarily an API.

After pushing `index.html` and `api/health.js`, test in this order:

1. Homepage:

```text
https://YOUR-VERCEL-PROJECT.vercel.app/
```

Expected: Kelley News Briefing Endpoint status page.

2. Health check:

```text
https://YOUR-VERCEL-PROJECT.vercel.app/api/health
```

Expected:

```json
{
  "ok": true,
  "service": "kelley-news-briefing"
}
```

3. Briefing trigger:

```text
https://YOUR-VERCEL-PROJECT.vercel.app/api/daily-briefing?key=kelley-news-briefing-2026-private-trigger
```

Expected:

```json
{
  "ok": true,
  "date": "YYYY-MM-DD",
  "items": 25
}
```

Only add the cron job after step 3 works.
