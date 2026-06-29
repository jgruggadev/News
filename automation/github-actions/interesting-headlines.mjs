// ─── INTERESTING HEADLINES ────────────────────────────────────────────────────
// A curated "fun but useful" section for the bottom of the briefing: themed
// stories (AI, markets, weird business, energy/geopolitics, consumer, company
// stories, startups) each with a one-line "why it's interesting" hook.
//
// Fully self-contained and FAIL-SOFT: every network/LLM failure degrades to a
// sensible default and NEVER throws to the caller, so it can't break the main
// briefing. If nothing can be fetched, getInterestingSection() returns empty
// strings and the section is simply omitted.

import Parser from 'rss-parser';

const parser = new Parser({ timeout: 15000 });

// Themed Google News searches. Real links, refreshed daily — no hardcoding.
const THEMES = [
  { tag: 'AI & Automation',     q: '(AI agents OR automation OR robotics OR self-driving OR humanoid robot)' },
  { tag: 'Markets & Trading',   q: '(hedge fund OR short seller OR unusual options OR IPO OR insider buying OR stock surge)' },
  { tag: 'Weird Business',      q: '(bizarre OR surprising OR unusual OR scandal OR fraud OR bankruptcy) business' },
  { tag: 'Energy & Geopolitics',q: '(oil OR natural gas OR uranium OR copper OR OPEC OR sanctions OR shipping lane)' },
  { tag: 'Consumer Trends',     q: '(viral brand OR gen z OR consumer trend OR retail fad OR spending habits)' },
  { tag: 'Company Stories',     q: '(CEO OR turnaround OR earnings surprise OR product launch OR activist investor) company' },
  { tag: 'Startups & Tech',     q: '(startup funding OR venture capital OR founder OR Series A OR unicorn)' }
];

const MAX_TOTAL = 10;     // total stories shown
const PER_THEME = 2;      // cap per theme so the mix stays varied

function clean(v = '') {
  return String(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Google News titles look like "Headline - Source" — split off the source.
function splitTitle(title = '') {
  const t = clean(title);
  const parts = t.split(' - ');
  if (parts.length > 1) return { headline: parts.slice(0, -1).join(' - '), source: parts.at(-1) };
  return { headline: t, source: 'News' };
}

function feedUrl(q) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:3d&hl=en-US&gl=US&ceid=US:en`;
}

// Fetch a varied set of recent stories across the themes. Per-feed failures are
// logged and skipped (mirrors the main script's fetchItems behavior).
async function fetchInterestingHeadlines() {
  const picked = [];
  const seen = new Set();

  for (const theme of THEMES) {
    let added = 0;
    try {
      const parsed = await parser.parseURL(feedUrl(theme.q));
      for (const item of parsed.items || []) {
        if (added >= PER_THEME || picked.length >= MAX_TOTAL) break;
        if (!item.title || !item.link) continue;
        const { headline, source } = splitTitle(item.title);
        const key = headline.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        picked.push({ headline, source, link: item.link, tag: theme.tag });
        added++;
      }
    } catch (err) {
      console.warn(`Interesting feed failed [${theme.tag}]: ${err.message}`);
    }
    if (picked.length >= MAX_TOTAL) break;
  }
  return picked;
}

// Add a one-sentence "why interesting" hook to each story via Groq (one batched
// call). NEVER throws: on missing key or any error, falls back to a generic hook.
async function addHooks(headlines, apiKey) {
  const fallback = (h) =>
    `${h.tag} — worth a look; could spark an investing idea or a good conversation.`;

  if (!apiKey || !headlines.length) {
    return headlines.map((h) => ({ ...h, why: fallback(h) }));
  }

  try {
    const list = headlines.map((h, i) => `${i}. [${h.tag}] ${h.headline}`).join('\n');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.6,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You write one-sentence hooks for a sharp student investor who likes AI, markets, weird business stories, energy/geopolitics, consumer trends, startups, and fresh investing ideas. Each hook is <=20 words, concrete, and explains why the story is interesting or useful. Respond with JSON only: {"hooks":[{"i":<index>,"why":"<one sentence>"}]}.'
          },
          { role: 'user', content: `Headlines:\n${list}` }
        ]
      })
    });

    if (!res.ok) {
      console.warn(`Interesting hooks Groq error ${res.status}; using fallbacks.`);
      return headlines.map((h) => ({ ...h, why: fallback(h) }));
    }

    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
    const byIndex = {};
    for (const h of parsed.hooks || []) {
      if (Number.isInteger(h.i) && typeof h.why === 'string') byIndex[h.i] = clean(h.why);
    }
    return headlines.map((h, i) => ({ ...h, why: byIndex[i] || fallback(h) }));
  } catch (err) {
    console.warn(`Interesting hooks failed (${err.message}); using fallbacks.`);
    return headlines.map((h) => ({ ...h, why: fallback(h) }));
  }
}

// ─── RENDERERS ─────────────────────────────────────────────────────────────────

function renderMarkdown(headlines) {
  const lines = ['## Interesting Headlines', ''];
  for (const h of headlines) {
    lines.push(`- **[${h.headline}](${h.link})** _(${h.tag})_`);
    lines.push(`  ${h.why}`);
  }
  lines.push('');
  return lines.join('\n');
}

function esc(v = '') {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderHtml(headlines) {
  const items = headlines
    .map(
      (h) => `
      <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #ede9e2;">
        <a href="${esc(h.link)}" style="font-size:14px;font-weight:700;color:#1a1a1a;line-height:1.5;text-decoration:none;font-family:Arial,sans-serif;">${esc(h.headline)}</a>
        <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:#f1efe8;color:#888780;font-family:Arial,sans-serif;">${esc(h.tag)}</span>
        <p style="margin:6px 0 0;font-size:12px;color:#777;line-height:1.5;font-style:italic;font-family:Arial,sans-serif;">${esc(h.why)}</p>
      </div>`
    )
    .join('');

  return `
    <!-- INTERESTING HEADLINES -->
    <div style="margin-bottom:40px;">
      <p style="margin:0 0 20px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#999;font-family:Arial,sans-serif;padding-bottom:12px;border-bottom:2px solid #111;">Interesting Headlines</p>
      ${items}
    </div>`;
}

/**
 * Returns { markdown, html } for the Interesting Headlines section.
 * Always resolves; returns empty strings if nothing could be fetched.
 */
export async function getInterestingSection(apiKey) {
  let headlines = [];
  try {
    headlines = await fetchInterestingHeadlines();
  } catch (err) {
    console.warn(`Interesting Headlines fetch failed (non-fatal): ${err.message}`);
    return { markdown: '', html: '' };
  }
  if (!headlines.length) return { markdown: '', html: '' };

  headlines = await addHooks(headlines, apiKey);
  return { markdown: renderMarkdown(headlines), html: renderHtml(headlines) };
}
