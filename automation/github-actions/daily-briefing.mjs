import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import nodemailer from 'nodemailer';
import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';

const parser = new Parser({ timeout: 15000 });
const root = process.cwd();
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const todayReadable = new Date().toLocaleDateString('en-US', {
  timeZone: 'America/New_York',
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

// ─── 1. RSS FEEDS ─────────────────────────────────────────────────────────────
// Tightened to last 2 days so headlines are actually fresh at 9 AM.

const feeds = [
  ['Macro and Markets',      'https://news.google.com/rss/search?q=(site:reuters.com+OR+site:ft.com+OR+site:wsj.com+OR+site:barrons.com)+(markets+OR+economy+OR+Federal+Reserve)+when:2d&hl=en-US&gl=US&ceid=US:en'],
  ['Policy',                 'https://news.google.com/rss/search?q=(Federal+Reserve+OR+FOMC+OR+Treasury+OR+CPI+OR+PCE+OR+inflation+OR+"interest+rates")+when:2d&hl=en-US&gl=US&ceid=US:en'],
  ['AI and Semiconductors',  'https://news.google.com/rss/search?q=(AI+OR+"artificial+intelligence"+OR+semiconductor+OR+Nvidia+OR+"data+center"+OR+hyperscaler+OR+capex)+markets+when:2d&hl=en-US&gl=US&ceid=US:en'],
  ['Consumer',               'https://news.google.com/rss/search?q=(consumer+OR+retail+OR+spending+OR+jobs+OR+wages+OR+housing+OR+credit)+US+economy+when:2d&hl=en-US&gl=US&ceid=US:en'],
  ['Geopolitics',            'https://news.google.com/rss/search?q=(China+OR+tariffs+OR+sanctions+OR+oil+OR+Ukraine+OR+"Middle+East"+OR+shipping)+markets+when:2d&hl=en-US&gl=US&ceid=US:en'],
  ['Industrials and Defense','https://news.google.com/rss/search?q=(industrial+OR+manufacturing+OR+aerospace+OR+defense+OR+Lockheed+OR+Boeing+OR+reshoring)+markets+when:2d&hl=en-US&gl=US&ceid=US:en']
];

// ─── 2. FETCH & SCORE ─────────────────────────────────────────────────────────

function clean(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function score(item) {
  const text = `${item.title} ${item.contentSnippet || ''} ${item.theme}`.toLowerCase();
  const weights = {
    fed: 18, fomc: 18, inflation: 18, cpi: 16, pce: 16, rates: 14, treasury: 12, yield: 12,
    consumer: 14, retail: 12, jobs: 14, labor: 13, wages: 12, housing: 10, credit: 10,
    ai: 16, chip: 16, semiconductor: 16, nvidia: 14, hyperscaler: 14, capex: 13, cloud: 10,
    china: 14, tariff: 16, sanction: 12, oil: 14, iran: 12, ukraine: 10, shipping: 10,
    defense: 14, aerospace: 12, lockheed: 10, boeing: 10, reshoring: 10,
    earnings: 10, guidance: 10, margin: 8, gdp: 14, recession: 12
  };
  let total = 0;
  for (const [word, val] of Object.entries(weights)) {
    if (text.includes(word)) total += val;
  }
  if (item.pubDate) {
    const hours = (Date.now() - new Date(item.pubDate).getTime()) / 3.6e6;
    if (hours <= 12) total += 30;
    else if (hours <= 24) total += 20;
    else if (hours <= 48) total += 10;
  }
  return total;
}

async function fetchItems() {
  const all = [];
  for (const [theme, url] of feeds) {
    try {
      const parsed = await parser.parseURL(url);
      for (const item of parsed.items || []) {
        all.push({ ...item, theme, source: parsed.title || theme });
      }
    } catch (err) {
      console.warn(`Feed failed [${theme}]: ${err.message}`);
    }
  }
  const seen = new Set();
  return all
    .filter(item => item.title && item.link && !seen.has(item.link) && seen.add(item.link))
    .map(item => ({ ...item, score: score(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}

// ─── 3. GEMINI SYNTHESIS ──────────────────────────────────────────────────────
// Uses official @google/generative-ai SDK with responseMimeType: 'application/json'
// so Gemini returns clean JSON directly — no parsing hacks needed.

async function synthesizeWithGemini(items) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn('GOOGLE_AI_API_KEY not set — using fallback.');
    return buildFallbackAnalysis(items);
  }

  const headlineContext = items.slice(0, 20).map((item, i) =>
    `${i + 1}. [${item.theme}] ${clean(item.title)}\n   Source: ${clean(item.source)} | ${item.pubDate ? new Date(item.pubDate).toLocaleDateString('en-US') : 'Recent'}\n   Summary: ${clean(item.contentSnippet || '').slice(0, 220)}`
  ).join('\n\n');

  const prompt = `You are a senior sell-side macro analyst writing a morning note for one reader: John Albans, a Kelley School of Business finance student preparing for the Investment Management Workshop (IMW). Write like Bernstein: precise, non-obvious, willing to take a position. No hedge language. No filler. Every sentence must add information.

John's macro framework:
- The Consumer: U.S. consumer resilient but bifurcated by income cohort. Watch real wages, credit quality, housing, discretionary vs. staples divergence.
- The Federal Reserve: Higher-for-longer baseline. Inflation re-acceleration is the key tail risk. Watch CPI, PCE, FOMC signals, rate-hike odds.
- AI: Real capex cycle anchored by hyperscaler spending. Wide valuation dispersion — separate infrastructure from unproven monetization.

John's watchlist: NVDA (AI infrastructure proxy), WMT (low-end consumer health), LMT (defense demand).

Today's date: ${todayReadable}

Top market headlines:
${headlineContext}

Return a JSON object with these exact keys:
- executive_view: string — 3 paragraphs separated by \\n\\n. Genuine synthesis, not a list of headlines. Identify the dominant market story, the tension in it, and the non-obvious implication.
- what_changed: array of 4-5 strings — specific things that shifted since yesterday. Each names a concrete data point or event.
- thesis_test: object with keys consumer, fed, ai — each has signal (CONFIRMING/NEUTRAL/CHALLENGING) and reasoning (one sentence).
- variant_perception: string — 2-3 sentences on where consensus is wrong or what the market is mispricing.
- deep_dive_question: string — one specific falsifiable research question tied to a company or data release.
- watchlist: object with keys NVDA, WMT, LMT — each one sentence on today's read-through.
- what_would_change_my_mind: array of 3 strings — specific falsifiable conditions that would require revising the thesis.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);
    console.log('Gemini synthesis complete.');
    return parsed;
  } catch (err) {
    console.warn(`Gemini synthesis failed — using fallback.\nError: ${err.message}`);
    return buildFallbackAnalysis(items);
  }
}

// ─── FALLBACK: structured summary if Gemini is unavailable ────────────────────
function buildFallbackAnalysis(items) {
  const topByTheme = {};
  for (const item of items) {
    if (!topByTheme[item.theme]) topByTheme[item.theme] = item;
  }
  const top5 = items.slice(0, 5).map(i => clean(i.title)).join('; ');
  return {
    executive_view: `[Gemini unavailable — structured summary]\n\nToday's top signals across ${items.length} scored headlines: ${top5}.\n\nReview the source headlines below and update the Living Macro Thesis manually if any pillar is CHALLENGING.`,
    what_changed: items.slice(0, 5).map(i => `${clean(i.title)} — ${clean(i.source)}`),
    thesis_test: {
      consumer: { signal: 'NEUTRAL', reasoning: 'Manual review required — AI synthesis unavailable.' },
      fed:      { signal: 'NEUTRAL', reasoning: 'Manual review required — AI synthesis unavailable.' },
      ai:       { signal: 'NEUTRAL', reasoning: 'Manual review required — AI synthesis unavailable.' }
    },
    variant_perception: 'AI synthesis unavailable today. Review source headlines and apply the Market Learning Playbook framework manually.',
    deep_dive_question: 'Review the top headlines below and identify the one signal most likely to move your thesis.',
    watchlist: {
      NVDA: 'Manual review required.',
      WMT:  'Manual review required.',
      LMT:  'Manual review required.'
    },
    what_would_change_my_mind: [
      'Sustained deterioration in labor markets and real wage growth.',
      'Broad AI capex cuts from hyperscalers and enterprise software buyers.',
      'Durable de-escalation in geopolitical hotspots that materially lowers commodity and logistics risk premia.'
    ]
  };
}

// ─── 4. BUILD OBSIDIAN MARKDOWN ───────────────────────────────────────────────

function buildMarkdown(items, a) {
  const signalIcon = s => s === 'CONFIRMING' ? '🟢' : s === 'CHALLENGING' ? '🔴' : '🟡';

  const lines = [
    '---',
    `date: ${today}`,
    'type: daily-briefing',
    'tags: [daily-briefing, markets, macro, ai, consumer, geopolitics, defense, imw]',
    '---',
    `# ${today} Daily Macro Briefing`,
    '',
    '> [[Automation Hub]] | [[News Operating System]] | [[Living Macro Thesis]] | [[Feedback Log]] | [[IMW Prep Hub]]',
    '',
    '---',
    '',
    '## Executive View',
    '',
    a.executive_view,
    '',
    '---',
    '',
    '## What Changed Today',
    '',
    ...a.what_changed.map(c => `- ${c}`),
    '',
    '---',
    '',
    '## Thesis Test',
    '',
    `**The Consumer** ${signalIcon(a.thesis_test.consumer.signal)} ${a.thesis_test.consumer.signal}`,
    `> ${a.thesis_test.consumer.reasoning}`,
    '',
    `**The Federal Reserve** ${signalIcon(a.thesis_test.fed.signal)} ${a.thesis_test.fed.signal}`,
    `> ${a.thesis_test.fed.reasoning}`,
    '',
    `**AI** ${signalIcon(a.thesis_test.ai.signal)} ${a.thesis_test.ai.signal}`,
    `> ${a.thesis_test.ai.reasoning}`,
    '',
    '---',
    '',
    '## Variant Perception',
    '',
    a.variant_perception,
    '',
    '---',
    '',
    "## Today's Deep-Dive Question",
    '',
    `> ${a.deep_dive_question}`,
    '',
    '---',
    '',
    '## Watchlist Read-Through',
    '',
    `**NVDA** — ${a.watchlist.NVDA}`,
    '',
    `**WMT** — ${a.watchlist.WMT}`,
    '',
    `**LMT** — ${a.watchlist.LMT}`,
    '',
    '---',
    '',
    '## What Would Change My Mind',
    '',
    ...a.what_would_change_my_mind.map(c => `- ${c}`),
    '',
    '---',
    '',
    '## Source Headlines',
    '',
    ...items.slice(0, 20).map(item =>
      `- [${clean(item.title)}](${item.link}) — *${item.theme}* — ${clean(item.source)}`
    ),
    '',
    '---',
    '',
    '*Synthesized by Gemini 1.5 Flash · Committed automatically via GitHub Actions · 9:00 AM ET*',
    '',
    '*If any pillar shows CHALLENGING, open [[Living Macro Thesis]] and update before market open.*'
  ];

  return lines.join('\n');
}

// ─── 5. BUILD HTML EMAIL ──────────────────────────────────────────────────────

function buildHtml(items, a) {
  const signalColor = s => s === 'CONFIRMING' ? '#1D9E75' : s === 'CHALLENGING' ? '#D85A30' : '#888780';
  const signalBg   = s => s === 'CONFIRMING' ? '#E1F5EE' : s === 'CHALLENGING' ? '#FAECE7' : '#F1EFE8';

  const themeColors = {
    'Macro and Markets':       '#185FA5',
    'Policy':                  '#993556',
    'AI and Semiconductors':   '#533AB7',
    'Consumer':                '#1D9E75',
    'Geopolitics':             '#D85A30',
    'Industrials and Defense': '#BA7517'
  };

  const execParas = a.executive_view
    .split('\n\n')
    .map(p => `<p style="margin:0 0 18px;font-size:16px;color:#151515;line-height:1.75;font-family:Georgia,serif;">${p.trim()}</p>`)
    .join('');

  const changedBullets = a.what_changed
    .map(c => `<li style="margin:7px 0;font-size:14px;color:#333;line-height:1.6;font-family:Arial,sans-serif;">${c}</li>`)
    .join('');

  const thesisRows = [
    { label: 'The Consumer',       data: a.thesis_test.consumer },
    { label: 'The Federal Reserve', data: a.thesis_test.fed },
    { label: 'AI',                  data: a.thesis_test.ai }
  ].map(({ label, data }) => `
    <tr>
      <td style="padding:11px 0;border-bottom:1px solid #ede9e2;vertical-align:top;width:140px;">
        <span style="font-size:13px;font-weight:700;color:#151515;font-family:Arial,sans-serif;">${label}</span>
      </td>
      <td style="padding:11px 10px;border-bottom:1px solid #ede9e2;vertical-align:top;width:120px;">
        <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${signalBg(data.signal)};color:${signalColor(data.signal)};font-family:Arial,sans-serif;letter-spacing:.03em;">${data.signal}</span>
      </td>
      <td style="padding:11px 0;border-bottom:1px solid #ede9e2;vertical-align:top;">
        <span style="font-size:13px;color:#444;line-height:1.6;font-family:Arial,sans-serif;">${data.reasoning}</span>
      </td>
    </tr>`).join('');

  const watchlistRows = [['NVDA', a.watchlist.NVDA], ['WMT', a.watchlist.WMT], ['LMT', a.watchlist.LMT]]
    .map(([ticker, text]) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #ede9e2;vertical-align:top;width:60px;">
        <span style="font-size:13px;font-weight:700;color:#185FA5;font-family:'Courier New',monospace;">${ticker}</span>
      </td>
      <td style="padding:9px 0 9px 14px;border-bottom:1px solid #ede9e2;vertical-align:top;">
        <span style="font-size:13px;color:#444;line-height:1.6;font-family:Arial,sans-serif;">${text}</span>
      </td>
    </tr>`).join('');

  const mindBullets = a.what_would_change_my_mind
    .map(c => `<li style="margin:7px 0;font-size:14px;color:#333;line-height:1.6;font-family:Arial,sans-serif;">${c}</li>`)
    .join('');

  const byTheme = {};
  for (const item of items.slice(0, 20)) {
    if (!byTheme[item.theme]) byTheme[item.theme] = [];
    byTheme[item.theme].push(item);
  }
  const sourceBlocks = Object.entries(byTheme).map(([theme, themeItems]) => {
    const color = themeColors[theme] || '#666';
    const linkList = themeItems.slice(0, 4).map(item =>
      `<li style="margin:4px 0;"><a href="${item.link}" style="color:${color};font-size:13px;text-decoration:none;font-family:Arial,sans-serif;">${clean(item.title)}</a> <span style="color:#aaa;font-size:11px;">— ${clean(item.source)}</span></li>`
    ).join('');
    return `
      <div style="margin-bottom:18px;">
        <p style="margin:0 0 7px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${color};font-family:Arial,sans-serif;">${theme}</p>
        <ul style="margin:0;padding:0 0 0 14px;">${linkList}</ul>
      </div>`;
  }).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Daily Macro Briefing — ${todayReadable}</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ec;">
<div style="max-width:680px;margin:32px auto 48px;background:#ffffff;border-radius:3px;overflow:hidden;">

  <!-- HEADER -->
  <div style="background:#111111;padding:30px 40px 28px;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#555;font-family:Arial,sans-serif;">Morning Note · ${todayReadable}</p>
    <h1 style="margin:0;font-size:26px;font-weight:400;color:#ffffff;font-family:Georgia,serif;letter-spacing:-.01em;">Daily Macro Briefing</h1>
    <p style="margin:8px 0 0;font-size:12px;color:#666;font-family:Arial,sans-serif;">Prepared for John Albans · Kelley School of Business · IMW Candidate</p>
  </div>

  <div style="padding:36px 40px;">

    <!-- EXECUTIVE VIEW -->
    <div style="margin-bottom:36px;">
      <p style="margin:0 0 18px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;padding-bottom:10px;border-bottom:2px solid #111111;">Executive View</p>
      ${execParas}
    </div>

    <!-- WHAT CHANGED -->
    <div style="margin-bottom:36px;background:#f7f4ef;border-radius:3px;padding:22px 26px;">
      <p style="margin:0 0 14px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;">What Changed Today</p>
      <ul style="margin:0;padding:0 0 0 16px;">${changedBullets}</ul>
    </div>

    <!-- THESIS TEST -->
    <div style="margin-bottom:36px;">
      <p style="margin:0 0 16px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;padding-bottom:10px;border-bottom:1px solid #e8e3da;">Thesis Test</p>
      <table style="width:100%;border-collapse:collapse;">${thesisRows}</table>
    </div>

    <!-- VARIANT PERCEPTION -->
    <div style="margin-bottom:36px;border-left:3px solid #111111;padding:4px 0 4px 22px;">
      <p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;">Variant Perception</p>
      <p style="margin:0;font-size:15px;color:#151515;line-height:1.75;font-style:italic;font-family:Georgia,serif;">${a.variant_perception}</p>
    </div>

    <!-- DEEP DIVE -->
    <div style="margin-bottom:36px;background:#111111;border-radius:3px;padding:22px 26px;">
      <p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#555;font-family:Arial,sans-serif;">Today's Deep-Dive Question</p>
      <p style="margin:0;font-size:15px;color:#ffffff;line-height:1.7;font-family:Georgia,serif;">${a.deep_dive_question}</p>
    </div>

    <!-- WATCHLIST -->
    <div style="margin-bottom:36px;">
      <p style="margin:0 0 16px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;padding-bottom:10px;border-bottom:1px solid #e8e3da;">Watchlist Read-Through</p>
      <table style="width:100%;border-collapse:collapse;">${watchlistRows}</table>
    </div>

    <!-- WHAT WOULD CHANGE MY MIND -->
    <div style="margin-bottom:36px;background:#f7f4ef;border-radius:3px;padding:22px 26px;">
      <p style="margin:0 0 14px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;">What Would Change My Mind</p>
      <ul style="margin:0;padding:0 0 0 16px;">${mindBullets}</ul>
    </div>

    <!-- SOURCES -->
    <div style="border-top:1px solid #e8e3da;padding-top:28px;">
      <p style="margin:0 0 18px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;">Source Headlines</p>
      ${sourceBlocks}
    </div>

  </div>

  <!-- FOOTER -->
  <div style="background:#f4f1ec;padding:18px 40px;border-top:1px solid #e8e3da;">
    <p style="margin:0;font-size:11px;color:#bbb;font-family:Arial,sans-serif;">Generated at 9:00 AM ET · Gemini 1.5 Flash synthesis · Committed to Obsidian vault via GitHub Actions</p>
  </div>

</div>
</body>
</html>`;
}

// ─── 6. WRITE OBSIDIAN FILES ──────────────────────────────────────────────────

async function writeBriefing(markdown) {
  const dailyDir = path.join(root, '01 - Daily Briefings');
  const homeDir  = path.join(root, '00 - Home');
  await fs.mkdir(dailyDir, { recursive: true });
  await fs.mkdir(homeDir,  { recursive: true });
  await fs.writeFile(path.join(dailyDir, `${today} Daily Macro Briefing.md`), markdown, 'utf8');
  await fs.writeFile(path.join(homeDir,  'Latest Daily Briefing.md'),         markdown, 'utf8');
  console.log(`Vault updated: ${today} Daily Macro Briefing.md`);
}

// ─── 7. SEND EMAIL ────────────────────────────────────────────────────────────

async function sendEmail(markdown, html) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_USER and SMTP_PASS secrets are required.');
  }
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from:    `"Daily Macro Briefing" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to:      process.env.BRIEFING_TO || 'jtalbans@iu.edu',
    subject: `Macro Briefing — ${todayReadable}`,
    text:    markdown,
    html
  });
  console.log(`Email dispatched to ${process.env.BRIEFING_TO || 'jtalbans@iu.edu'}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

console.log(`Starting briefing for ${todayReadable}...`);
const items = await fetchItems();
if (!items.length) throw new Error('No items fetched — all RSS feeds failed. Check feed URLs.');
console.log(`Fetched ${items.length} scored items. Sending to Gemini...`);

const analysis = await synthesizeWithGemini(items);
console.log('Synthesis complete.');

const markdown = buildMarkdown(items, analysis);
const html     = buildHtml(items, analysis);

await writeBriefing(markdown);
await sendEmail(markdown, html);
console.log(`Done. ${today} briefing complete.`);
