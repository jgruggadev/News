import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import nodemailer from 'nodemailer';
import Parser from 'rss-parser';
import { getInterestingSection } from './interesting-headlines.mjs';

const parser = new Parser({ timeout: 15000 });
const root = process.cwd();
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const todayReadable = new Date().toLocaleDateString('en-US', {
  timeZone: 'America/New_York',
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

// ─── 1. RSS FEEDS ─────────────────────────────────────────────────────────────
// Primary: direct source feeds (Reuters, MarketWatch, Barron's, CNBC, FT, WSJ)
// Secondary: targeted Google News for paywalled sources (gets headlines)
// Philosophy: source quality > theme buckets. Score by relevance, not category.

const feeds = [
  // Direct source feeds — highest quality, fewest intermediaries
  { name: 'Reuters Business',  url: 'https://feeds.reuters.com/reuters/businessNews',                                                        priority: 3 },
  { name: 'Reuters Markets',   url: 'https://feeds.reuters.com/reuters/USmarketsnews',                                                       priority: 3 },
  { name: 'MarketWatch',       url: 'https://feeds.marketwatch.com/marketwatch/topstories/',                                                  priority: 2 },
  { name: "Barron's",          url: 'https://www.barrons.com/xml/rss/3_7621.xml',                                                            priority: 3 },
  { name: 'CNBC Markets',      url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839135',                   priority: 2 },
  { name: 'CNBC Economy',      url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664',                   priority: 2 },
  { name: 'Seeking Alpha',     url: 'https://seekingalpha.com/market-news/index.rss',                                                        priority: 1 },
  // Google News — pulls headlines from WSJ, FT, Bloomberg even when paywalled
  { name: 'WSJ',               url: 'https://news.google.com/rss/search?q=site:wsj.com+(markets+OR+economy+OR+Fed+OR+inflation+OR+earnings)+when:2d&hl=en-US&gl=US&ceid=US:en',         priority: 3 },
  { name: 'Financial Times',   url: 'https://news.google.com/rss/search?q=site:ft.com+(markets+OR+economy+OR+inflation+OR+Fed+OR+China)+when:2d&hl=en-US&gl=US&ceid=US:en',            priority: 3 },
  { name: 'Bloomberg',         url: 'https://news.google.com/rss/search?q=site:bloomberg.com+(markets+OR+economy+OR+Fed+OR+inflation)+when:2d&hl=en-US&gl=US&ceid=US:en',              priority: 2 },
  // Broad market-moving news — not bound by theme
  { name: 'Google News Markets','url': 'https://news.google.com/rss/search?q=(markets+OR+stocks+OR+S%26P+500+OR+Fed+OR+earnings+OR+CPI+OR+tariffs)+when:1d&hl=en-US&gl=US&ceid=US:en', priority: 2 },
  // Economic data releases — dedicated feed for official releases
  { name: 'Econ Data Releases', url: 'https://news.google.com/rss/search?q=(CPI+OR+PPI+OR+"nonfarm+payroll"+OR+"jobs+report"+OR+GDP+OR+"retail+sales"+OR+PCE+OR+ISM+OR+PMI+OR+JOLTS+OR+"jobless+claims"+OR+"housing+starts"+OR+"consumer+confidence"+OR+"consumer+sentiment"+OR+"durable+goods"+OR+"trade+balance"+OR+FOMC+OR+"Fed+decision"+OR+"interest+rate+decision")+when:1d&hl=en-US&gl=US&ceid=US:en', priority: 3 },
];

// ─── 2. FETCH & SCORE ─────────────────────────────────────────────────────────

function clean(v = '') {
  return String(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function score(item, feedPriority = 1) {
  const text = `${item.title} ${item.contentSnippet || ''}`.toLowerCase();

  // Market-moving keyword weights — theme-agnostic
  const weights = {
    // Policy & rates (highest impact)
    'federal reserve': 20, fomc: 20, 'interest rate': 18, 'rate cut': 18, 'rate hike': 18,
    inflation: 18, cpi: 18, pce: 16, 'consumer price': 16, 'core inflation': 16,
    treasury: 14, yield: 14, 'bond market': 14, 'jerome powell': 16,
    // Growth signals
    gdp: 16, recession: 16, 'jobs report': 16, 'nonfarm payroll': 16, unemployment: 14,
    'retail sales': 14, 'consumer spending': 14, 'economic growth': 12,
    // Earnings & companies
    earnings: 14, 'beat estimates': 14, 'missed estimates': 14, guidance: 12,
    nvidia: 14, microsoft: 12, apple: 12, amazon: 12, alphabet: 12, meta: 12, tesla: 12,
    // AI & tech capex
    'artificial intelligence': 14, 'ai capex': 16, 'data center': 14, semiconductor: 14,
    hyperscaler: 14, 'chips act': 12, nvda: 14,
    // Geopolitics & macro risk
    tariff: 16, 'trade war': 16, china: 14, 'us-china': 16, sanctions: 12, oil: 14,
    opec: 14, ukraine: 12, iran: 12, 'middle east': 12, 'geopolit': 12,
    // Markets
    'stock market': 12, 's&p 500': 14, 'dow jones': 12, nasdaq: 12,
    selloff: 16, rally: 12, 'market drop': 16, correction: 14,
    // Watchlist names
    walmart: 14, wmt: 14, lockheed: 14, lmt: 14, defense: 12,
    // Consumer
    'consumer confidence': 14, 'consumer sentiment': 14, credit: 10, housing: 10,
  };

  let total = 0;
  for (const [word, val] of Object.entries(weights)) {
    if (text.includes(word)) total += val;
  }

  // Source quality multiplier
  total = Math.round(total * (0.7 + feedPriority * 0.3));

  // Recency bonus — most important factor after content
  if (item.pubDate) {
    const h = (Date.now() - new Date(item.pubDate).getTime()) / 3.6e6;
    total += h <= 6 ? 40 : h <= 12 ? 30 : h <= 24 ? 20 : h <= 48 ? 8 : 0;
  }

  return total;
}

async function fetchItems() {
  const all = [];
  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items || []) {
        all.push({ ...item, source: feed.name, feedPriority: feed.priority });
      }
    } catch (err) {
      console.warn(`Feed failed [${feed.name}]: ${err.message}`);
    }
  }
  const seen = new Set();
  const scored = all
    .filter(item => item.title && item.link && !seen.has(item.link) && seen.add(item.link))
    .map(item => ({ ...item, score: score(item, item.feedPriority) }))
    .sort((a, b) => b.score - a.score);

  const now = Date.now();
  const hoursAgo = h => now - h * 3.6e6;

  // Overnight: published in the last 14 hours
  const overnightItems = scored
    .filter(item => item.pubDate && new Date(item.pubDate).getTime() >= hoursAgo(14))
    .slice(0, 10);

  // Economic data releases: keyword match on known release names
  const dataKeywords = /\b(CPI|PPI|PCE|GDP|NFP|nonfarm payroll|jobs report|retail sales|ISM|PMI|JOLTS|jobless claims|initial claims|housing starts|consumer confidence|consumer sentiment|durable goods|trade balance|FOMC|rate decision|Fed funds|unemployment rate|ADP employment)\b/i;
  const dataItems = scored
    .filter(item => dataKeywords.test(`${item.title} ${item.contentSnippet || ''}`))
    .slice(0, 10);

  return { items: scored.slice(0, 30), overnightItems, dataItems };
}

// ─── 3. AI SYNTHESIS via GROQ ─────────────────────────────────────────────────

async function synthesizeWithAI(items, overnightItems, dataItems) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY secret is missing. Add it at github.com/jgruggadev/News/settings/secrets/actions');

  const fmtItem = (item, i) =>
    `${i + 1}. ${clean(item.title)}\n   Source: ${clean(item.source)} | ${item.pubDate ? new Date(item.pubDate).toLocaleString('en-US', {timeZone:'America/New_York', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Recent'}\n   ${clean(item.contentSnippet || '').slice(0, 150)}`; // 150 chars is enough context; 250 wastes tokens

  // Build overnight and data contexts first, track which links appear in them
  const overnightContext = overnightItems.length
    ? overnightItems.map(fmtItem).join('\n\n')
    : 'No headlines detected from the past 14 hours.';
  const dataContext = dataItems.length
    ? dataItems.map(fmtItem).join('\n\n')
    : 'No economic data releases detected in the feed today.';

  // Exclude items already sent in overnight/data sections to avoid sending
  // the same headline 2-3x (which wastes Groq tokens with no added value)
  const specialLinks = new Set([
    ...overnightItems.map(i => i.link),
    ...dataItems.map(i => i.link),
  ]);
  const remainingItems = items.filter(i => !specialLinks.has(i.link));
  const headlineContext = remainingItems.slice(0, 20).map(fmtItem).join('\n\n');

  const systemPrompt = `You are a senior macro analyst writing a daily morning briefing for John Albans — a Kelley School of Business finance student with a 3.99 GPA preparing for the Investment Management Workshop (IMW). John is highly intelligent but wants the briefing to be clear, concrete, and immediately useful — not filled with Wall Street jargon.

John's investment framework has three pillars:
- The Consumer: Is the U.S. consumer holding up? Focus on real wages, credit stress, housing, and whether spending is concentrated at the top or broad-based.
- The Federal Reserve: Where is inflation going and what will the Fed do about it? Focus on CPI, PCE, employment, and rate expectations.
- AI: Is the AI capex cycle real and sustainable? Focus on hyperscaler spending (Microsoft, Google, Amazon, Meta), chip demand (NVDA), power infrastructure, and whether revenue is materializing to justify the investment.

John's watchlist: NVDA (AI infrastructure proxy), WMT (low-end consumer health), LMT (defense spending and geopolitical risk).

WRITING RULES — follow these strictly:
1. Write like a smart human, not a financial robot. No jargon. Say "investors are worried inflation will stay high" not "heightened inflationary expectations weigh on risk sentiment."
2. Be concrete. Use actual numbers when available. Say "CPI came in at 3.4%, above the 3.1% expected" not "inflation surprised to the upside."
3. Explain cause and effect clearly. Tell the reader WHY something matters, not just that it happened.
4. Take a clear position. Don't hedge everything with "it could go either way." Tell John what you actually think the data means.
5. The executive view should read like the most important conversation John will have today — clear, substantive, and worth 10 minutes of his time.

ANTI-REPETITION RULES — this is critical:
6. Every field must reflect what is GENUINELY NEW today. Do not recycle background context or restate known macro conditions as if they are news. If the biggest story is a continuation of something ongoing, find the specific new development within it — the number that changed, the person who spoke, the country that moved.
7. Lead with surprise. The most interesting line in the briefing should be the thing a smart analyst would pause on. Boring = useless.
8. Banned phrases (do not write these, ever): "markets are navigating uncertainty", "investors are watching closely", "amid ongoing concerns", "remains to be seen", "heightened volatility", "risk sentiment", "market participants". Use specific language instead.
9. The overnight_events and data_releases sections must pull from the actual headlines provided — do not fabricate or generalize. If there is no relevant overnight event, say so plainly. Same for data releases.
10. The executive_view paragraphs must each reference at least one specific headline, data point, number, or named entity from today's feed. No paragraph should be able to run in yesterday's briefing unchanged.

You MUST respond with ONLY a valid JSON object. No markdown fences, no explanation outside the JSON.`;

  const userPrompt = `Today is ${todayReadable}.

OVERNIGHT HEADLINES (past 14 hours — use these for overnight_events):
${overnightContext}

ECONOMIC DATA RELEASE HEADLINES (use these for data_releases):
${dataContext}

ALL TOP HEADLINES (sorted by relevance and recency):
${headlineContext}

Return exactly this JSON structure with real, substantive analysis:
{
  "overnight_events": [
    {
      "headline": "Exact or close paraphrase of the most important overnight headline",
      "what_happened": "2-3 sentences of what actually occurred — specific names, numbers, decisions",
      "impact": "1-2 sentences on what this means for markets, rates, earnings, or the macro thesis"
    }
  ],

  "data_releases": [
    {
      "release": "Name of the data release (e.g. 'April CPI', 'Weekly Jobless Claims')",
      "reading": "Actual reported figure with units (e.g. '3.4% YoY')",
      "vs_expected": "How it compared to consensus (e.g. 'above 3.1% expected' or 'in line')",
      "prior": "Prior period reading if available",
      "impact": "What does this number change about the macro picture? Be specific — name rate cut odds, Fed language, sector implications."
    }
  ],

  "executive_view": "A tight synopsis of what matters most today — 3 short paragraphs separated by \\n\\n, each <=55 words. The reader already understands the macro backdrop, so SKIP the basics, do not re-explain known conditions, and lead with what is NEW and what it means. Each paragraph must cite a specific headline, number, or named entity from today's feed. Paragraph 1: the single most important development today and why it matters. Paragraph 2: the read-through for the Fed/rates and for AI/tech. Paragraph 3: the consumer plus the one non-obvious insight worth acting on — take a real position.",

  "what_changed": [
    "5-6 specific things that are different today vs yesterday. Each must include a specific number, name, or event — no vague statements."
  ],

  "forward_look": [
    "List 4-6 specific upcoming events, data releases, or developing situations to watch over the next 3-7 days. For each: name the event, when it happens (specific date or day if known), what to look for, and why it matters. Format: 'EVENT (DATE/TIMING): What to watch and why it matters.'"
  ]
}`;

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
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    })
  });

  const responseText = await res.text();
  if (!res.ok) throw new Error(`Groq API error ${res.status}: ${responseText.slice(0, 500)}`);

  const data = JSON.parse(responseText);
  const raw = data.choices?.[0]?.message?.content ?? '';
  if (!raw) throw new Error(`Groq returned empty content.`);

  // Log token usage on every run — visible in GitHub Actions logs.
  // Watch these numbers: input > 6000 or output > 3000 means the prompt is bloated.
  const usage = data.usage;
  if (usage) {
    console.log(`Groq token usage — input: ${usage.prompt_tokens}, output: ${usage.completion_tokens}, total: ${usage.total_tokens}`);
  }

  try {
    const parsed = JSON.parse(raw);
    console.log('AI synthesis complete.');
    return parsed;
  } catch (e) {
    throw new Error(`Invalid JSON from Groq: ${e.message}\nRaw: ${raw.slice(0, 500)}`);
  }
}

// ─── 4. BUILD OBSIDIAN MARKDOWN ───────────────────────────────────────────────

function buildMarkdown(items, a, interestingMd = '') {
  const overnightLines = [];
  if (a.overnight_events && a.overnight_events.length) {
    for (const ev of a.overnight_events) {
      overnightLines.push(`### ${ev.headline}`, `**What happened:** ${ev.what_happened}`, `**Impact:** ${ev.impact}`, '');
    }
  } else {
    overnightLines.push('*No major overnight events detected.*', '');
  }

  const dataLines = [];
  if (a.data_releases && a.data_releases.length) {
    for (const dr of a.data_releases) {
      const releaseLines = [
        `### ${dr.release}`,
        `- **Reading:** ${dr.reading}${dr.vs_expected ? ` (${dr.vs_expected})` : ''}`,
        dr.prior ? `- **Prior:** ${dr.prior}` : null,
        `- **Impact:** ${dr.impact}`,
        ''
      ].filter(line => line != null);
      dataLines.push(...releaseLines);
    }
  } else {
    dataLines.push('*No major economic data releases today.*', '');
  }

  return [
    '---',
    `date: ${today}`,
    'type: daily-briefing',
    'tags: [daily-briefing, markets, macro, ai, consumer, geopolitics, defense, imw]',
    '---',
    `# ${today} Daily Macro Briefing`,
    '',
    '> [[Latest Daily Briefing]] | [[Living Macro Thesis]] | [[Feedback Log]] | [[IMW Prep Hub]]',
    '',
    '---',
    '',
    '## Daily Briefings',
    '',
    '- [FT News Briefing](https://www.ft.com/ft-news-briefing)',
    "- [The Barron's Daily](https://www.barrons.com/topics/the-barrons-daily?mod=article_flashline)",
    '',
    '---',
    '',
    '## Overnight & Breaking',
    '',
    ...overnightLines,
    '---',
    '',
    '## Economic Data Releases',
    '',
    ...dataLines,
    '---',
    '',
    '## Executive View',
    '',
    a.executive_view,
    '',
    "**Today's key stories:**",
    '',
    ...items.slice(0, 6).map(item => `- [${clean(item.title)}](${item.link}) — *${clean(item.source)}*`),
    '',
    '---',
    '',
    '## What Changed Today',
    '',
    ...a.what_changed.map(c => `- ${c}`),
    '',
    '---',
    '',
    '## Forward Look — What to Monitor',
    '',
    ...a.forward_look.map(e => `- ${e}`),
    '',
    '---',
    '',
    ...(interestingMd ? [interestingMd, '---', ''] : []),
    '## Source Headlines',
    '',
    ...items.slice(0, 25).map(item =>
      `- [${clean(item.title)}](${item.link}) — *${clean(item.source)}*`
    ),
    '',
    '---',
    '',
    `*Generated ${todayReadable} · Llama 3.3 70B via Groq · Sources: Reuters, WSJ, FT, Barron's, MarketWatch, Bloomberg, CNBC*`
  ].join('\n');
}

// ─── 5. BUILD HTML EMAIL ──────────────────────────────────────────────────────

function buildHtml(items, a, interestingHtml = '') {
  // Source color map — color-code by source for quick scanning
  const sourceColors = {
    'WSJ': '#004B87', 'Wall Street Journal': '#004B87',
    'Financial Times': '#FCD000', 'FT': '#FCD000',
    "Barron's": '#C41230',
    'Reuters Business': '#FF8000', 'Reuters Markets': '#FF8000', 'Reuters': '#FF8000',
    'Bloomberg': '#000000',
    'MarketWatch': '#0b2f7c',
    'CNBC Markets': '#004080', 'CNBC Economy': '#004080', 'CNBC': '#004080',
  };
  const getSourceColor = name => {
    for (const [k, v] of Object.entries(sourceColors)) if (name.includes(k)) return v;
    return '#888';
  };

  // Overnight events HTML
  const overnightHtml = (a.overnight_events && a.overnight_events.length)
    ? a.overnight_events.map(ev => `
      <div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #ede9e2;">
        <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#1a1a1a;line-height:1.5;font-family:Arial,sans-serif;">${ev.headline}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#444;line-height:1.6;font-family:Arial,sans-serif;">${ev.what_happened}</p>
        <p style="margin:0;font-size:12px;color:#777;line-height:1.5;font-family:Arial,sans-serif;font-style:italic;">→ ${ev.impact}</p>
      </div>`).join('')
    : `<p style="margin:0;font-size:13px;color:#888;font-family:Arial,sans-serif;font-style:italic;">No major overnight events detected.</p>`;

  // Economic data releases HTML
  const dataHtml = (a.data_releases && a.data_releases.length)
    ? a.data_releases.map(dr => `
      <div style="margin-bottom:16px;padding:14px 16px;background:#f7f4ef;border-radius:4px;border-left:3px solid #004B87;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#004B87;font-family:Arial,sans-serif;">${dr.release}</p>
        <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1a1a1a;font-family:Arial,sans-serif;">${dr.reading}${dr.vs_expected ? ` <span style="font-size:12px;font-weight:400;color:#666;">(${dr.vs_expected})</span>` : ''}</p>
        ${dr.prior ? `<p style="margin:0 0 4px;font-size:12px;color:#888;font-family:Arial,sans-serif;">Prior: ${dr.prior}</p>` : ''}
        <p style="margin:0;font-size:13px;color:#444;line-height:1.5;font-family:Arial,sans-serif;">${dr.impact}</p>
      </div>`).join('')
    : `<p style="margin:0;font-size:13px;color:#888;font-family:Arial,sans-serif;font-style:italic;">No major economic data releases today.</p>`;

  const execParas = a.executive_view.split('\n\n')
    .map(p => `<p style="margin:0 0 16px;font-size:15px;color:#1a1a1a;line-height:1.7;font-family:Georgia,serif;">${p.trim()}</p>`)
    .join('');

  // Linked key headlines shown inside the Executive View.
  const keyStoriesHtml =
    `<p style="margin:18px 0 8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#999;font-family:Arial,sans-serif;">Today's Key Stories</p><ul style="margin:0;padding:0 0 0 18px;">` +
    items.slice(0, 6).map(item =>
      `<li style="margin:6px 0;font-size:13px;line-height:1.5;font-family:Arial,sans-serif;"><a href="${item.link}" style="color:#1a1a1a;text-decoration:none;">${clean(item.title)}</a> <span style="color:#999;">— ${clean(item.source)}</span></li>`
    ).join('') + '</ul>';

  const changedBullets = a.what_changed
    .map(c => `<li style="margin:8px 0;font-size:14px;color:#333;line-height:1.6;font-family:Arial,sans-serif;">${c}</li>`)
    .join('');

  const forwardItems = (a.forward_look || [])
    .map(e => `<li style="margin:9px 0;font-size:14px;color:#1a1a1a;line-height:1.6;font-family:Arial,sans-serif;">${e}</li>`)
    .join('');

  // Group sources and show top items
  const topSources = {};
  for (const item of items.slice(0, 25)) {
    const src = clean(item.source);
    if (!topSources[src]) topSources[src] = [];
    if (topSources[src].length < 3) topSources[src].push(item);
  }
  const sourceBlocks = Object.entries(topSources)
    .sort(([a],[b]) => {
      const priority = ['WSJ','Financial Times','Barron','Reuters','Bloomberg','MarketWatch','CNBC'];
      const ai = priority.findIndex(p => a.includes(p));
      const bi = priority.findIndex(p => b.includes(p));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(([src, srcItems]) => {
      const color = getSourceColor(src);
      const links = srcItems.map(item =>
        `<li style="margin:5px 0;"><a href="${item.link}" style="color:#1a1a1a;font-size:13px;text-decoration:none;font-family:Arial,sans-serif;">${clean(item.title)}</a></li>`
      ).join('');
      return `<div style="margin-bottom:20px;padding-left:12px;border-left:3px solid ${color};">
        <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${color};font-family:Arial,sans-serif;">${src}</p>
        <ul style="margin:0;padding:0 0 0 14px;">${links}</ul>
      </div>`;
    }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Daily Macro Briefing — ${todayReadable}</title></head>
<body style="margin:0;padding:0;background:#f0ece4;">
<div style="max-width:700px;margin:32px auto 48px;background:#fff;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <!-- HEADER -->
  <div style="background:#111;padding:32px 44px 28px;">
    <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#666;font-family:Arial,sans-serif;">${todayReadable}</p>
    <h1 style="margin:0 0 6px;font-size:28px;font-weight:400;color:#fff;font-family:Georgia,serif;letter-spacing:-.02em;">Daily Macro Briefing</h1>
    <p style="margin:0;font-size:12px;color:#555;font-family:Arial,sans-serif;">John Albans · Kelley School of Business · IMW Candidate</p>
  </div>

  <div style="padding:40px 44px;">

    <!-- DAILY BRIEFINGS -->
    <div style="margin-bottom:36px;padding:14px 18px;background:#f7f4ef;border-radius:4px;border-left:4px solid #111;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#999;font-family:Arial,sans-serif;">Your Daily Briefings</p>
      <p style="margin:0;font-size:14px;font-family:Arial,sans-serif;line-height:1.7;">
        <a href="https://www.ft.com/ft-news-briefing" style="color:#004B87;text-decoration:none;font-weight:700;">FT News Briefing</a>
        &nbsp;·&nbsp;
        <a href="https://www.barrons.com/topics/the-barrons-daily?mod=article_flashline" style="color:#C41230;text-decoration:none;font-weight:700;">The Barron's Daily</a>
      </p>
    </div>

    <!-- OVERNIGHT & BREAKING -->
    <div style="margin-bottom:40px;">
      <p style="margin:0 0 20px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#999;font-family:Arial,sans-serif;padding-bottom:12px;border-bottom:2px solid #111;">Overnight &amp; Breaking</p>
      ${overnightHtml}
    </div>

    <!-- ECONOMIC DATA RELEASES -->
    <div style="margin-bottom:40px;">
      <p style="margin:0 0 16px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#004B87;font-family:Arial,sans-serif;padding-bottom:12px;border-bottom:2px solid #004B87;">Economic Data Releases</p>
      ${dataHtml}
    </div>

    <!-- EXECUTIVE VIEW -->
    <div style="margin-bottom:40px;">
      <p style="margin:0 0 20px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#999;font-family:Arial,sans-serif;padding-bottom:12px;border-bottom:2px solid #111;">Executive View</p>
      ${execParas}
      ${keyStoriesHtml}
    </div>

    <!-- WHAT CHANGED -->
    <div style="margin-bottom:40px;background:#f7f4ef;border-radius:4px;padding:24px 28px;">
      <p style="margin:0 0 14px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#999;font-family:Arial,sans-serif;">What Changed Today</p>
      <ul style="margin:0;padding:0 0 0 18px;">${changedBullets}</ul>
    </div>

    <!-- FORWARD LOOK -->
    <div style="margin-bottom:40px;background:#f0f4f8;border-radius:4px;padding:24px 28px;border-left:4px solid #004B87;">
      <p style="margin:0 0 14px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#004B87;font-family:Arial,sans-serif;">Forward Look — Watch This Week</p>
      <ul style="margin:0;padding:0 0 0 18px;">${forwardItems}</ul>
    </div>

    ${interestingHtml}

    <!-- SOURCES -->
    <div style="border-top:1px solid #e8e3da;padding-top:32px;">
      <p style="margin:0 0 20px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#999;font-family:Arial,sans-serif;">Source Headlines</p>
      ${sourceBlocks}
    </div>

  </div>

  <!-- FOOTER -->
  <div style="background:#f0ece4;padding:20px 44px;border-top:1px solid #e8e3da;">
    <p style="margin:0;font-size:11px;color:#aaa;font-family:Arial,sans-serif;">Generated ${todayReadable} at 9:00 AM ET · Llama 3.3 70B via Groq · Sources: Reuters, WSJ, FT, Barron's, Bloomberg, MarketWatch, CNBC</p>
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

const { items, overnightItems, dataItems } = await fetchItems();
if (!items.length) throw new Error('No RSS items fetched — check feed URLs.');
console.log(`Fetched ${items.length} items from ${new Set(items.map(i=>i.source)).size} sources. Overnight: ${overnightItems.length}, Data releases: ${dataItems.length}.`);

const analysis = await synthesizeWithAI(items, overnightItems, dataItems);

// Interesting Headlines — curated bottom section. Fail-soft: never blocks the briefing.
let interesting = { markdown: '', html: '' };
try {
  interesting = await getInterestingSection(process.env.GROQ_API_KEY);
  console.log(`Interesting Headlines: ${interesting.markdown ? 'included' : 'skipped (none fetched)'}.`);
} catch (err) {
  console.warn(`Interesting Headlines skipped (non-fatal): ${err.message}`);
}

const markdown = buildMarkdown(items, analysis, interesting.markdown);
const html     = buildHtml(items, analysis, interesting.html);

await writeBriefing(markdown);
await sendEmail(markdown, html);
console.log(`Done. ${today} briefing complete.`);
