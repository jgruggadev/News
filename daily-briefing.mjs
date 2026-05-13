import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import nodemailer from 'nodemailer';
import Parser from 'rss-parser';

const parser = new Parser({ timeout: 15000 });
const root = process.cwd();
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

const feeds = [
  ['Macro and Markets', 'https://news.google.com/rss/search?q=(site:reuters.com+OR+site:ft.com+OR+site:wsj.com+OR+site:barrons.com)+(markets+OR+economy+OR+Federal+Reserve)+when:7d&hl=en-US&gl=US&ceid=US:en'],
  ['AI and Semiconductors', 'https://news.google.com/rss/search?q=(AI+OR+artificial+intelligence+OR+semiconductor+OR+Nvidia+OR+data+center+OR+hyperscaler)+markets+when:7d&hl=en-US&gl=US&ceid=US:en'],
  ['Consumer', 'https://news.google.com/rss/search?q=(consumer+OR+retail+OR+spending+OR+jobs+OR+wages+OR+housing+OR+credit)+US+economy+when:7d&hl=en-US&gl=US&ceid=US:en'],
  ['Geopolitics', 'https://news.google.com/rss/search?q=(China+OR+tariffs+OR+sanctions+OR+oil+OR+Ukraine+OR+Middle+East+OR+shipping)+markets+when:7d&hl=en-US&gl=US&ceid=US:en'],
  ['Industrials and Defense', 'https://news.google.com/rss/search?q=(industrial+OR+manufacturing+OR+aerospace+OR+defense+OR+Lockheed+OR+Boeing)+markets+when:7d&hl=en-US&gl=US&ceid=US:en']
];

function clean(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function score(item) {
  const text = `${item.title} ${item.contentSnippet || ''} ${item.theme}`.toLowerCase();
  const weights = {
    fed: 16, inflation: 16, rates: 12, treasury: 12, yield: 12,
    consumer: 14, retail: 12, jobs: 12, labor: 12, wages: 10, housing: 10,
    ai: 14, chip: 14, semiconductor: 14, nvidia: 12, cloud: 10, capex: 10,
    china: 12, tariff: 14, sanction: 12, oil: 12, ukraine: 10, iran: 10,
    defense: 14, aerospace: 12, industrial: 12, manufacturing: 12,
    earnings: 8, guidance: 8, margin: 8
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
  if (/inflation|cpi|ppi|tariff|oil|shipping/.test(text)) return 'Inflation channel: watch whether this raises cost pressure, rate expectations, or margin risk.';
  if (/fed|rate|yield|treasury/.test(text)) return 'Policy channel: this matters because rate expectations translate macro data into valuation pressure or relief.';
  if (/consumer|retail|jobs|wages|housing|credit/.test(text)) return 'Growth channel: this helps test whether the consumer remains resilient or is becoming more bifurcated.';
  if (/ai|chip|semiconductor|data center|capex|cloud|nvidia/.test(text)) return 'AI cycle channel: this affects hyperscaler capex, semiconductor demand, power demand, and monetization expectations.';
  if (/china|russia|ukraine|iran|middle east|sanction|defense/.test(text)) return 'Geopolitical channel: this can move energy, defense budgets, supply chains, and risk premia.';
  return 'Market signal: map this headline to growth, inflation, policy, earnings, or risk appetite before changing the thesis.';
}

async function fetchItems() {
  const all = [];
  for (const [theme, url] of feeds) {
    try {
      const parsed = await parser.parseURL(url);
      for (const item of parsed.items || []) all.push({ ...item, theme, source: parsed.title || theme });
    } catch (error) {
      console.warn(`Feed failed: ${theme}: ${error.message}`);
    }
  }
  const seen = new Set();
  return all
    .filter((item) => item.title && item.link && !seen.has(item.link) && seen.add(item.link))
    .map((item) => ({ ...item, score: score(item), impact: impact(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 35);
}

function buildMarkdown(items) {
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
    '> [[Automation Hub]] | [[News Operating System]] | [[Living Macro Thesis]] | [[Feedback Log]]',
    '',
    '## Executive Macro Thesis',
    `Today\'s briefing is organized around policy/inflation (${counts.policy} signals), AI infrastructure (${counts.ai}), the consumer (${counts.consumer}), and geopolitics (${counts.geo}). The core question is whether AI capex and consumer spending can keep growth resilient while energy, tariffs, and geopolitical risk keep inflation volatility elevated.`,
    '',
    'Variant perception to build: AI is becoming a real fixed-investment cycle, but the cost of that cycle runs through power, chips, cooling, memory, and capital intensity. That means the best opportunities may sit in infrastructure chains and companies with pricing power, not every company with an AI label.',
    '',
    '## Top Must-Read Headlines'
  ];
  for (const item of items.slice(0, 10)) {
    lines.push('', `### ${clean(item.title)}`, `- Source: [${clean(item.source)}](${item.link})`, `- Theme: ${item.theme}`, `- Date: ${item.pubDate ? new Date(item.pubDate).toLocaleString('en-US', { timeZone: 'America/New_York' }) : 'Recent'}`, `- Summary: ${clean(item.contentSnippet || item.content || '')}`, `- Why it matters: ${item.impact}`);
  }
  lines.push('', '## Theme Breakdown');
  for (const [theme] of feeds) {
    lines.push('', `### ${theme}`);
    const themeItems = items.filter((i) => i.theme === theme).slice(0, 7);
    if (!themeItems.length) lines.push('- No major item captured today.');
    for (const item of themeItems) lines.push(`- [${clean(item.title)}](${item.link}) - ${item.impact}`);
  }
  lines.push('', '## Thesis Update', '- What changed today: ', '- What it implies over the next 1-3 months: ', '- What would change my mind: ', '- Companies/themes to research next: ', '', '## Source Links');
  for (const item of items) lines.push(`- [${clean(item.title)}](${item.link}) - ${clean(item.source)} / ${item.theme}`);
  return lines.join('\n');
}

function markdownToHtml(markdown) {
  return markdown
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .split('\n\n')
    .map((block) => block.startsWith('<') ? block : `<p>${block}</p>`)
    .join('\n');
}

async function writeBriefing(markdown) {
  const dailyDir = path.join(root, '01 - Daily Briefings');
  const homeDir = path.join(root, '00 - Home');
  await fs.mkdir(dailyDir, { recursive: true });
  await fs.mkdir(homeDir, { recursive: true });
  await fs.writeFile(path.join(dailyDir, `${today} Daily Macro Briefing.md`), markdown, 'utf8');
  await fs.writeFile(path.join(homeDir, 'Latest Daily Briefing.md'), markdown, 'utf8');
}

async function sendEmail(markdown) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_USER and SMTP_PASS repository secrets are required.');
  }
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
    html: `<!doctype html><html><body style="font-family:Georgia,serif;max-width:880px;margin:24px auto;line-height:1.55;color:#151515">${markdownToHtml(markdown)}</body></html>`,
    attachments: [{ filename: `${today} Daily Macro Briefing.md`, content: markdown }]
  });
}

const items = await fetchItems();
if (!items.length) throw new Error('No news items fetched.');
const markdown = buildMarkdown(items);
await writeBriefing(markdown);
await sendEmail(markdown);
console.log(`Generated and emailed ${today} briefing with ${items.length} items.`);
