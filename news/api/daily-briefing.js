import nodemailer from 'nodemailer';
import Parser from 'rss-parser';
import { Octokit } from '@octokit/rest';

const parser = new Parser({ timeout: 12000 });

const feeds = [
  {
    theme: 'Macro and Markets',
    url: 'https://news.google.com/rss/search?q=(site:reuters.com+OR+site:ft.com+OR+site:wsj.com+OR+site:barrons.com)+(markets+OR+economy+OR+Federal+Reserve)+when:7d&hl=en-US&gl=US&ceid=US:en'
  },
  {
    theme: 'AI and Semiconductors',
    url: 'https://news.google.com/rss/search?q=(AI+OR+artificial+intelligence+OR+semiconductor+OR+Nvidia+OR+data+center+OR+hyperscaler)+markets+when:7d&hl=en-US&gl=US&ceid=US:en'
  },
  {
    theme: 'Consumer',
    url: 'https://news.google.com/rss/search?q=(consumer+OR+retail+OR+spending+OR+jobs+OR+wages+OR+housing+OR+credit)+US+economy+when:7d&hl=en-US&gl=US&ceid=US:en'
  },
  {
    theme: 'Geopolitics',
    url: 'https://news.google.com/rss/search?q=(China+OR+tariffs+OR+sanctions+OR+oil+OR+Ukraine+OR+Middle+East+OR+shipping)+markets+when:7d&hl=en-US&gl=US&ceid=US:en'
  },
  {
    theme: 'Industrials and Defense',
    url: 'https://news.google.com/rss/search?q=(industrial+OR+manufacturing+OR+aerospace+OR+defense+OR+Lockheed+OR+Boeing)+markets+when:7d&hl=en-US&gl=US&ceid=US:en'
  }
];

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function clean(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function score(item) {
  const text = `${item.title} ${item.contentSnippet || ''} ${item.theme}`.toLowerCase();
  const weights = {
    fed: 16, inflation: 16, rates: 12, treasury: 12, yield: 12,
    consumer: 14, retail: 12, jobs: 12, labor: 12, wages: 10, housing: 10,
    ai: 14, chip: 14, semiconductor: 14, nvidia: 12, cloud: 10,
    china: 12, tariff: 14, sanction: 12, oil: 12, ukraine: 10, iran: 10,
    defense: 14, aerospace: 12, industrial: 12, manufacturing: 12,
    earnings: 8, guidance: 8, margin: 8, capex: 10
  };
  let total = 0;
  for (const [word, value] of Object.entries(weights)) if (text.includes(word)) total += value;
  if (item.pubDate) {
    const hours = (Date.now() - new Date(item.pubDate).getTime()) / 36e5;
    if (hours <= 24) total += 20;
    else if (hours <= 72) total += 12;
    else if (hours <= 168) total += 6;
  }
  return total;
}

function impact(item) {
  const text = `${item.title} ${item.contentSnippet || ''} ${item.theme}`.toLowerCase();
  if (/inflation|cpi|ppi|tariff|oil|shipping/.test(text)) return 'Inflation channel: this can keep rates higher for longer and pressure equity multiples, especially long-duration growth.';
  if (/fed|rate|yield|treasury/.test(text)) return 'Policy channel: rate expectations are the bridge between macro data and valuation.';
  if (/consumer|retail|jobs|wages|housing|credit/.test(text)) return 'Growth channel: this helps judge whether the consumer is broadening or becoming more bifurcated.';
  if (/ai|chip|semiconductor|data center|capex|cloud|nvidia/.test(text)) return 'AI cycle channel: this affects hyperscaler capex, semiconductor demand, power demand, and monetization expectations.';
  if (/china|russia|ukraine|iran|middle east|sanction|defense/.test(text)) return 'Geopolitical channel: this can move energy, defense budgets, supply chains, and risk premia.';
  return 'Market signal: map this to growth, inflation, policy, earnings, or risk appetite before changing the thesis.';
}

async function fetchItems() {
  const all = [];
  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items || []) all.push({ ...item, theme: feed.theme, source: parsed.title || feed.theme });
    } catch (err) {
      console.warn(`Feed failed: ${feed.theme}: ${err.message}`);
    }
  }
  const seen = new Set();
  return all
    .filter((item) => item.title && item.link && !seen.has(item.link) && seen.add(item.link))
    .map((item) => ({ ...item, score: score(item), impact: impact(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}

function buildMarkdown(items) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const top = items.slice(0, 8);
  const counts = {
    policy: items.filter((i) => /fed|rate|inflation|treasury|yield/i.test(`${i.title} ${i.contentSnippet}`)).length,
    ai: items.filter((i) => /ai|semiconductor|chip|data center|nvidia|cloud/i.test(`${i.title} ${i.contentSnippet} ${i.theme}`)).length,
    consumer: items.filter((i) => /consumer|retail|jobs|wages|housing|credit/i.test(`${i.title} ${i.contentSnippet} ${i.theme}`)).length,
    geo: items.filter((i) => /china|tariff|sanction|ukraine|iran|oil|shipping/i.test(`${i.title} ${i.contentSnippet} ${i.theme}`)).length
  };
  const lines = [
    '---',
    `date: ${today}`,
    'type: daily-briefing',
    'tags: [daily-briefing, markets, macro, ai, consumer, geopolitics, defense, imw]',
    '---',
    `# ${today} Daily Macro Briefing`,
    '',
    '> Hub links: [[News Operating System]] | [[Living Macro Thesis]] | [[Feedback Log]] | [[SMTP Email Setup]]',
    '',
    '## Executive Macro Thesis',
    `Today\'s briefing is organized around policy/inflation (${counts.policy} signals), AI infrastructure (${counts.ai}), the consumer (${counts.consumer}), and geopolitics (${counts.geo}). The core question is whether AI capex and consumer spending can keep growth resilient while energy, tariffs, and geopolitical risk keep inflation volatility elevated.`,
    '',
    'Differentiated view to build: AI is becoming a real fixed-investment cycle, but the cost of that cycle increasingly runs through power, chips, cooling, memory, and capital intensity. That means the best opportunities may sit in the infrastructure chain and companies with pricing power, not every company with an AI label.',
    '',
    '## Top Must-Read Headlines'
  ];
  for (const item of top) {
    lines.push('', `### ${clean(item.title)}`, `- Source: [${clean(item.source)}](${item.link})`, `- Theme: ${item.theme}`, `- Date: ${item.pubDate ? new Date(item.pubDate).toLocaleString('en-US', { timeZone: 'America/New_York' }) : 'Recent'}`, `- Summary: ${clean(item.contentSnippet || item.content || '')}`, `- Why it matters: ${item.impact}`);
  }
  lines.push('', '## Theme Breakdown');
  for (const theme of [...new Set(feeds.map((f) => f.theme))]) {
    lines.push('', `### ${theme}`);
    const themeItems = items.filter((i) => i.theme === theme).slice(0, 6);
    if (!themeItems.length) lines.push('- No major item captured today.');
    for (const item of themeItems) lines.push(`- [${clean(item.title)}](${item.link}) - ${item.impact}`);
  }
  lines.push('', '## What To Update In The Thesis', '- What changed today: ', '- What it implies over the next 1-3 months: ', '- What would change my mind: ', '- Companies/themes to research next: ', '', '## Source Links');
  for (const item of items) lines.push(`- [${clean(item.title)}](${item.link}) - ${clean(item.source)} / ${item.theme}`);
  return { today, markdown: lines.join('\n') };
}

function markdownToHtml(md) {
  const body = md
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .split('\n\n')
    .map((block) => block.startsWith('<h') || block.startsWith('<li>') ? block : `<p>${block}</p>`)
    .join('\n');
  return `<!doctype html><html><body style="font-family:Georgia,serif;max-width:880px;margin:24px auto;line-height:1.55;color:#151515">${body}</body></html>`;
}

async function commitToGithub({ today, markdown }) {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH = 'main' } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) return { skipped: true };
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const files = [
    { path: `${process.env.OBSIDIAN_DAILY_PATH || '01 - Daily Briefings'}/${today} Daily Macro Briefing.md`, content: markdown },
    { path: process.env.OBSIDIAN_LATEST_PATH || '00 - Home/Latest Daily Briefing.md', content: markdown }
  ];
  for (const file of files) {
    let sha;
    try {
      const current = await octokit.repos.getContent({ owner: GITHUB_OWNER, repo: GITHUB_REPO, path: file.path, ref: GITHUB_BRANCH });
      sha = current.data.sha;
    } catch {}
    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      branch: GITHUB_BRANCH,
      path: file.path,
      message: `Update daily briefing ${today}`,
      content: Buffer.from(file.content).toString('base64'),
      sha
    });
  }
  return { skipped: false };
}

async function sendEmail({ today, markdown }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.BRIEFING_TO || 'jtalbans@iu.edu',
    subject: `Daily Macro Briefing - ${today}`,
    text: markdown,
    html: markdownToHtml(esc(markdown)),
    attachments: [{ filename: `${today} Daily Macro Briefing.md`, content: markdown }]
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = req.query.key || req.headers['x-cron-secret'];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return res.status(500).json({ error: 'SMTP env vars missing' });

  const items = await fetchItems();
  if (!items.length) return res.status(502).json({ error: 'No news items fetched' });
  const briefing = buildMarkdown(items);
  const github = await commitToGithub(briefing);
  await sendEmail(briefing);
  return res.status(200).json({ ok: true, date: briefing.today, items: items.length, github });
}
