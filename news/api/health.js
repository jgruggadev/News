export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: 'kelley-news-briefing',
    time: new Date().toISOString(),
    env: {
      CRON_SECRET_configured: Boolean(process.env.CRON_SECRET),
      SMTP_HOST_configured: Boolean(process.env.SMTP_HOST),
      SMTP_USER_configured: Boolean(process.env.SMTP_USER),
      SMTP_PASS_configured: Boolean(process.env.SMTP_PASS),
      SMTP_FROM_configured: Boolean(process.env.SMTP_FROM),
      BRIEFING_TO_configured: Boolean(process.env.BRIEFING_TO),
      GITHUB_TOKEN_configured: Boolean(process.env.GITHUB_TOKEN),
      GITHUB_OWNER: process.env.GITHUB_OWNER || null,
      GITHUB_REPO: process.env.GITHUB_REPO || null,
      GITHUB_BRANCH: process.env.GITHUB_BRANCH || null
    },
    endpoints: {
      briefing: '/api/daily-briefing?key=YOUR_CRON_SECRET'
    }
  });
}
