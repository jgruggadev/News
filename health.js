export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: 'kelley-news-briefing',
    time: new Date().toISOString(),
    endpoints: {
      briefing: '/api/daily-briefing?key=YOUR_CRON_SECRET'
    }
  });
}
