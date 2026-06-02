import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import nodemailer from 'nodemailer';
import Parser from 'rss-parser';

const parser = new Parser({ timeout: 15000 });
const root = process.cwd();
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const todayReadable = new Date().toLocaleDateString('en-US', {
  timeZone: 'America/New_York',
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

// ─── 1. RSS FEEDS ─────────────────────────────────────────────────────────────

const feeds = [
  ['Macro and Markets',       'https://news.google.com/rss/search?q=(site:reuters.com+OR+site:ft.com+OR+site:wsj.com+OR+site:barrons.com)+(markets+OR+economy+OR+Federal+Reserve)+when:2d&hl=en-US&gl=US&ceid=US:en'],
  ['Policy',                  'https://news.google.com/rss/search?q=(Federal+Reserve+OR+FOMC+OR+Treasury+OR+CPI+OR+PCE+OR+inflation+OR+"interest+rates")+when:2d&hl=en-US&gl=US&ceid=US:en'],
  ['AI and Semiconductors',   'https://news.google.com/rss/search?q=(AI+OR+"artificial+intelligence"+OR+semiconductor+OR+Nvidia+OR+"data+center"+OR+hyperscaler+OR+capex)+markets+when:2d&hl=en-US&gl=US&ceid=US:en'],
  ['Consumer',                'https://news.google.com/rss/search?q=(consumer+OR+retail+OR+spending+OR+jobs+OR+wages+OR+housing+OR+credit)+US+economy+when:2d&hl=en-US&gl=US&ceid=US:en'],
  ['Geopolitics',             'https://news.google.com/rss/search?q=(China+OR+tariffs+OR+sanctions+OR+oil+OR+Ukraine+OR+"Middle+East"+OR+shipping)+markets+when:2d&hl=en-US&gl=US&ceid=US:en'],
  ['Industrials and Defense', 'https://news.google.com/rss/search?q=(industrial+OR+manufacturing+OR+aerospace+OR+defense+OR+Lockheed+OR+Boeing+OR+reshoring)+markets+when:2d&hl=en-US&gl=US&ceid=US:en']
];

// ─── 2. FETCH & SCORE ─────────────────────────────────────────────────────────

function clean(v = '') {
  return String(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function score(item) {
  const text = `${item.title} ${item.contentSnippet || ''} ${item.theme}`.toLowerCase();
  const w = {
    fed:18, fomc:18, inflation:18, cpi:16, pce:16, rates:14, treasury:12, yield:12,
    consumer:14, retail:12, jobs:14, labor:13, wages:12, housing:10, credit:10,
    ai:16, chip:16, semiconductor:16, nvidia:14, hyperscaler:14, capex:13, cloud:10,
    china:14, tariff:16, sanction:12, oil:14, iran:12, ukraine:10, shipping:10,
    defense:14, aerospace:12, lockheed:10, boeing:10, reshoring:10,
    earnings:10, guidance:10, margin:8, gdp:14, recession:12
  };
  let total = 0;
  for (const [word, val] of Object.entries(w)) if (text.includes(word)) total += val;
  if (item.pubDate) {
    const h = (Date.now() - new Date(item.pubDate).getTime()) / 3.6e6;
    total += h <= 12 ? 30 : h <= 24 ? 20 : h <= 48 ? 10 : 0;
  }
  return total;
}

async function fetchItems() {
  const all = [];
  for (const [theme, url] of feeds) {
    try {
      const parsed = await parser.parseURL(url);
      for (const item of parsed.items || []) all.push({ ...item, theme, source: parsed.title || theme });
    } catch (err) { console.warn(`Feed failed [${theme}]: ${err.message}`); }
  }
  const seen = new Set();
  return all
    .filter(item => item.title && item.link && !seen.has(item.link) && seen.add(item.link))
    .map(item => ({ ...item, score: score(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}

// ─── 3. AI SYNTHESIS via GROQ ─────────────────────────────────────────────────
// Groq free tier: 100K tokens/day, 30 RPM, no credit card required.
// Get key at console.groq.com with jtalbans@gmail.com.
// Add as GROQ_API_KEY in GitHub repo secrets.
//
// NOTE: Gemini is NOT used. Both Gmail and IU Google Cloud projects have
// free-tier quota = 0 for all Gemini models. 429 on every call. Use Groq.

async function synthesizeWithAI(items) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY secret is missing. Add it at github.com/jgruggadev/News/settings/secrets/actions — get key at console.groq.com');

  const headlineContext = items.slice(0, 20).map((item, i) =>
    `${i + 1}. [${item.theme}] ${clean(item.title)}\n   Source: ${clean(item.source)} | ${item.pubDate ? new Date(item.pubDate).toLocaleDateString('en-US') : 'Recent'}\n   Summary: ${clean(item.contentSnippet || '').slice(0, 200)}`
  ).join('\n\n');

  const systemPrompt = `You are a senior sell-side macro analyst at Bernstein writing a daily morning note for John Albans, a Kelley School of Business finance student preparing for the Investment Management Workshop (IMW).

John's macro framework has three pillars:
- The Consumer: U.S. consumer resilient but bifurcated by income cohort. Watch real wages, credit quality, housing, discretionary vs. staples divergence.
- The Federal Reserve: Higher-for-longer baseline. Inflation re-acceleration is the key tail risk. Watch CPI, PCE, FOMC signals, rate-hike odds.
- AI: Real capex cycle anchored by hyperscaler spending. Wide valuation dispersion — separate infrastructure from unproven monetization.

John's watchlist: NVDA (AI infrastructure proxy), WMT (low-end consumer health), LMT (defense demand).

Write like Bernstein: precise, non-obvious, willing to take a position. No hedge language. Every sentence adds information.

You MUST respond with ONLY a valid JSON object. No markdown fences, no explanation, nothing outside the JSON.`;

  const userPrompt = `Today is ${todayReadable}.

Top market headlines (ranked by relevance):
${headlineContext}

Return exactly this JSON structure (fill in real analysis based on today's headlines):
{
  "executive_view": "3 substantive paragraphs separated by \\n\\n. Synthesize the ONE dominant market story, the tension within it, and the non-obvious implication a casual reader would miss. Full sentences, no bullets.",
  "what_changed": ["specific thing 1 that shifted since yesterday", "specific thing 2", "specific thing 3", "specific thing 4", "specific thing 5"],
  "thesis_test": {
    "consumer": {"signal": "CONFIRMING", "reasoning": "one precise sentence tying today's evidence to the consumer thesis"},
    "fed": {"signal": "NEUTRAL", "reasoning": "one precise sentence tying today's evidence to the Fed thesis"},
    "ai": {"signal": "CONFIRMING", "reasoning": "one precise sentence tying today's evidence to the AI thesis"}
  },
  "variant_perception": "2-3 sentences on where consensus is getting it wrong or what the market is mispricing right now.",
  "deep_dive_question": "One specific falsifiable research question to investigate today, tied to a company or data release.",
  "watchlist": {
    "NVDA": "one sentence on today's read-through for Nvidia",
    "WMT": "one sentence on today's read-through for Walmart",
    "LMT": "one sentence on today's read-through for Lockheed Martin"
  },
  "what_would_change_my_mind": ["specific falsifiable condition 1", "specific falsifiable condition 2", "specific falsifiable condition 3"]
}

Replace the placeholder signal values (CONFIRMING/NEUTRAL/CHALLENGING) with the correct assessment based on today's headlines.`;

  console.log('Calling Groq (llama-3.3-70b-versatile)...');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2048,
      response_format: { type: 'json_object' }
    })
  });

  const responseText = await res.text();
  if (!res.ok) throw new Error(`Groq API error ${res.status}: ${responseText.slice(0, 500)}`);

  const data = JSON.parse(responseText);
  const raw = data.choices?.[0]?.message?.content ?? '';
  if (!raw) throw new Error(`Groq returned empty content. Full response: ${responseText.slice(0, 500)}`);

  try {
    const parsed = JSON.parse(raw);
    console.log('AI synthesis complete.');
    return parsed;
  } catch (e) {
    throw new Error(`Groq returned invalid JSON.\nParse error: ${e.message}\nRaw: ${raw.slice(0, 500)}`);
  }
}

// ─── 4. BUILD OBSIDIAN MARKDOWN ───────────────────────────────────────────────

function buildMarkdown(items, a) {
  const icon = s => s === 'CONFIRMING' ? '🟢' : s === 'CHALLENGING' ? '🔴' : '🟡';
  return [
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
    `**The Consumer** ${icon(a.thesis_test.consumer.signal)} ${a.thesis_test.consumer.signal}`,
    `> ${a.thesis_test.consumer.reasoning}`,
    '',
    `**The Federal Reserve** ${icon(a.thesis_test.fed.signal)} ${a.thesis_test.fed.signal}`,
    `> ${a.thesis_test.fed.reasoning}`,
    '',
    `**AI** ${icon(a.thesis_test.ai.signal)} ${a.thesis_test.ai.signal}`,
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
    `*Synthesized by Llama 3.3 70B via Groq · GitHub Actions · ${todayReadable}*`,
    '',
    '*If any pillar is 🔴 CHALLENGING, open [[Living Macro Thesis]] and update.*'
  ].join('\n');
}

// ─── 5. BUILD HTML EMAIL ──────────────────────────────────────────────────────

function buildHtml(items, a) {
  const sigColor = s => s === 'CONFIRMING' ? '#1D9E75' : s === 'CHALLENGING' ? '#D85A30' : '#888780';
  const sigBg    = s => s === 'CONFIRMING' ? '#E1F5EE' : s === 'CHALLENGING' ? '#FAECE7' : '#F1EFE8';
  const themeColors = {
    'Macro and Markets':'#185FA5','Policy':'#993556','AI and Semiconductors':'#533AB7',
    'Consumer':'#1D9E75','Geopolitics':'#D85A30','Industrials and Defense':'#BA7517'
  };

  const execParas = a.executive_view.split('\n\n')
    .map(p => `<p style="margin:0 0 18px;font-size:16px;color:#151515;line-height:1.75;font-family:Georgia,serif;">${p.trim()}</p>`)
    .join('');

  const changedBullets = a.what_changed
    .map(c => `<li style="margin:7px 0;font-size:14px;color:#333;line-height:1.6;font-family:Arial,sans-serif;">${c}</li>`)
    .join('');

  const thesisRows = [
    {label:'The Consumer', d:a.thesis_test.consumer},
    {label:'The Federal Reserve', d:a.thesis_test.fed},
    {label:'AI', d:a.thesis_test.ai}
  ].map(({label,d}) => `
    <tr>
      <td style="padding:11px 0;border-bottom:1px solid #ede9e2;vertical-align:top;width:140px;font-size:13px;font-weight:700;color:#151515;font-family:Arial,sans-serif;">${label}</td>
      <td style="padding:11px 10px;border-bottom:1px solid #ede9e2;vertical-align:top;width:120px;">
        <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${sigBg(d.signal)};color:${sigColor(d.signal)};font-family:Arial,sans-serif;">${d.signal}</span>
      </td>
      <td style="padding:11px 0;border-bottom:1px solid #ede9e2;vertical-align:top;font-size:13px;color:#444;line-height:1.6;font-family:Arial,sans-serif;">${d.reasoning}</td>
    </tr>`).join('');

  const watchlistRows = [['NVDA',a.watchlist.NVDA],['WMT',a.watchlist.WMT],['LMT',a.watchlist.LMT]]
    .map(([t,txt]) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #ede9e2;vertical-align:top;width:60px;font-size:13px;font-weight:700;color:#185FA5;font-family:'Courier New',monospace;">${t}</td>
      <td style="padding:9px 0 9px 14px;border-bottom:1px solid #ede9e2;vertical-align:top;font-size:13px;color:#444;line-height:1.6;font-family:Arial,sans-serif;">${txt}</td>
    </tr>`).join('');

  const mindBullets = a.what_would_change_my_mind
    .map(c => `<li style="margin:7px 0;font-size:14px;color:#333;line-height:1.6;font-family:Arial,sans-serif;">${c}</li>`)
    .join('');

  const byTheme = {};
  for (const item of items.slice(0,20)) {
    if (!byTheme[item.theme]) byTheme[item.theme] = [];
    byTheme[item.theme].push(item);
  }
  const sourceBlocks = Object.entries(byTheme).map(([theme, themeItems]) => {
    const color = themeColors[theme] || '#666';
    const links = themeItems.slice(0,4).map(item =>
      `<li style="margin:4px 0;"><a href="${item.link}" style="color:${color};font-size:13px;text-decoration:none;font-family:Arial,sans-serif;">${clean(item.title)}</a> <span style="color:#aaa;font-size:11px;">— ${clean(item.source)}</span></li>`
    ).join('');
    return `<div style="margin-bottom:18px;"><p style="margin:0 0 7px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${color};font-family:Arial,sans-serif;">${theme}</p><ul style="margin:0;padding:0 0 0 14px;">${links}</ul></div>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Daily Macro Briefing — ${todayReadable}</title></head>
<body style="margin:0;padding:0;background:#f4f1ec;">
<div style="max-width:680px;margin:32px auto 48px;background:#fff;border-radius:3px;overflow:hidden;">

  <div style="background:#111;padding:30px 40px 28px;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#555;font-family:Arial,sans-serif;">Morning Note · ${todayReadable}</p>
    <h1 style="margin:0;font-size:26px;font-weight:400;color:#fff;font-family:Georgia,serif;">Daily Macro Briefing</h1>
    <p style="margin:8px 0 0;font-size:12px;color:#666;font-family:Arial,sans-serif;">Prepared for John Albans · Kelley School of Business · IMW Candidate</p>
  </div>

  <div style="padding:36px 40px;">

    <div style="margin-bottom:36px;">
      <p style="margin:0 0 18px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;padding-bottom:10px;border-bottom:2px solid #111;">Executive View</p>
      ${execParas}
    </div>

    <div style="margin-bottom:36px;background:#f7f4ef;border-radius:3px;padding:22px 26px;">
      <p style="margin:0 0 14px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;">What Changed Today</p>
      <ul style="margin:0;padding:0 0 0 16px;">${changedBullets}</ul>
    </div>

    <div style="margin-bottom:36px;">
      <p style="margin:0 0 16px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;padding-bottom:10px;border-bottom:1px solid #e8e3da;">Thesis Test</p>
      <table style="width:100%;border-collapse:collapse;">${thesisRows}</table>
    </div>

    <div style="margin-bottom:36px;border-left:3px solid #111;padding:4px 0 4px 22px;">
      <p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;">Variant Perception</p>
      <p style="margin:0;font-size:15px;color:#151515;line-height:1.75;font-style:italic;font-family:Georgia,serif;">${a.variant_perception}</p>
    </div>

    <div style="margin-bottom:36px;background:#111;border-radius:3px;padding:22px 26px;">
      <p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#555;font-family:Arial,sans-serif;">Today's Deep-Dive Question</p>
      <p style="margin:0;font-size:15px;color:#fff;line-height:1.7;font-family:Georgia,serif;">${a.deep_dive_question}</p>
    </div>

    <div style="margin-bottom:36px;">
      <p style="margin:0 0 16px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;padding-bottom:10px;border-bottom:1px solid #e8e3da;">Watchlist Read-Through</p>
      <table style="width:100%;border-collapse:collapse;">${watchlistRows}</table>
    </div>

    <div style="margin-bottom:36px;background:#f7f4ef;border-radius:3px;padding:22px 26px;">
      <p style="margin:0 0 14px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;">What Would Change My Mind</p>
      <ul style="margin:0;padding:0 0 0 16px;">${mindBullets}</ul>
    </div>

    <div style="border-top:1px solid #e8e3da;padding-top:28px;">
      <p style="margin:0 0 18px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;font-family:Arial,sans-serif;">Source Headlines</p>
      ${sourceBlocks}
    </div>

  </div>

  <div style="background:#f4f1ec;padding:18px 40px;border-top:1px solid #e8e3da;">
    <p style="margin:0;font-size:11px;color:#bbb;font-family:Arial,sans-serif;">Generated at 9:00 AM ET · Llama 3.3 70B via Groq · Committed to Obsidian vault via GitHub Actions</p>
  </div>

</div></body></html>`;
}

// ─── 6. WRITE TO OBSIDIAN VAULT ───────────────────────────────────────────────

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
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from:    `"Daily Macro Briefing" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to:      process.env.BRIEFING_TO || 'jtalbans@iu.edu',
    subject: `Macro Briefing — ${todayReadable}`,
    text:    markdown,
    html
  });
  console.log(`Email sent to ${process.env.BRIEFING_TO || 'jtalbans@iu.edu'}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

console.log(`Starting briefing for ${todayReadable}...`);

const items = await fetchItems();
if (!items.length) throw new Error('No RSS items fetched — check feed URLs.');
console.log(`Fetched ${items.length} items.`);

const analysis = await synthesizeWithAI(items);

const markdown = buildMarkdown(items, analysis);
const html     = buildHtml(items, analysis);

await writeBriefing(markdown);
await sendEmail(markdown, html);
console.log(`Done. ${today} briefing complete.`);
