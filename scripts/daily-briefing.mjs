import fs from 'node:fs/promises'
import path from 'node:path'
import Parser from 'rss-parser'

const parser = new Parser({ timeout: 15000 })
const root = process.cwd()
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const generatedAt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' })

const feeds = [
  { theme: 'Macro and Markets', url: 'https://news.google.com/rss/search?q=(site:reuters.com+OR+site:ft.com+OR+site:wsj.com+OR+site:barrons.com)+(markets+OR+economy+OR+Federal+Reserve)+when:7d&hl=en-US&gl=US&ceid=US:en' },
  { theme: 'AI and Semiconductors', url: 'https://news.google.com/rss/search?q=(AI+OR+artificial+intelligence+OR+semiconductor+OR+Nvidia+OR+data+center+OR+hyperscaler)+markets+when:7d&hl=en-US&gl=US&ceid=US:en' },
  { theme: 'Consumer', url: 'https://news.google.com/rss/search?q=(consumer+OR+retail+OR+spending+OR+jobs+OR+wages+OR+housing+OR+credit)+US+economy+when:7d&hl=en-US&gl=US&ceid=US:en' },
  { theme: 'Geopolitics', url: 'https://news.google.com/rss/search?q=(China+OR+tariffs+OR+sanctions+OR+oil+OR+Ukraine+OR+Middle+East+OR+shipping)+markets+when:7d&hl=en-US&gl=US&ceid=US:en' },
  { theme: 'Industrials and Defense', url: 'https://news.google.com/rss/search?q=(industrial+OR+manufacturing+OR+aerospace+OR+defense+OR+Lockheed+OR+Boeing)+markets+when:7d&hl=en-US&gl=US&ceid=US:en' },
]

function clean(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function impact(item) {
  const text = `${item.title} ${item.summary} ${item.theme}`.toLowerCase()
  if (/inflation|cpi|ppi|tariff|oil|shipping/.test(text)) return 'Inflation channel: watch rate expectations, margins, and valuation pressure.'
  if (/fed|rate|yield|treasury/.test(text)) return 'Policy channel: this affects discount rates and market leadership.'
  if (/consumer|retail|jobs|wages|housing|credit/.test(text)) return 'Growth channel: this tests consumer resilience and bifurcation.'
  if (/ai|chip|semiconductor|data center|capex|cloud|nvidia/.test(text)) return 'AI cycle channel: this affects hyperscaler capex, chips, power demand, and AI monetization.'
  if (/china|ukraine|iran|middle east|sanction|defense/.test(text)) return 'Geopolitical channel: this can move energy, trade, defense budgets, and risk premia.'
  return 'Market signal: map this to growth, inflation, policy, earnings, or risk appetite.'
}

function score(item) {
  const text = `${item.title} ${item.summary} ${item.theme}`.toLowerCase()
  const words = ['fed','inflation','rates','treasury','yield','consumer','retail','jobs','wages','housing','credit','ai','chip','semiconductor','nvidia','cloud','capex','data center','china','tariff','sanction','oil','ukraine','iran','defense','aerospace','industrial','manufacturing','earnings','guidance']
  let s = words.reduce((sum, w) => sum + (text.includes(w) ? 10 : 0), 0)
  if (item.pubDate) {
    const hours = (Date.now() - new Date(item.pubDate).getTime()) / 36e5
    if (hours <= 24) s += 20
    else if (hours <= 72) s += 12
    else if (hours <= 168) s += 6
  }
  return s
}

async function fetchItems() {
  const all = []
  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.url)
      for (const raw of parsed.items || []) {
        const item = { ...raw, theme: feed.theme, source: parsed.title || feed.theme, title: clean(raw.title), summary: clean(raw.contentSnippet || raw.content || '') }
        all.push({ ...item, score: score(item), impact: impact(item) })
      }
    } catch (error) {
      console.warn(`Feed failed: ${feed.theme}: ${error.message}`)
    }
  }
  const seen = new Set()
  return all.filter((i) => i.title && i.link && !seen.has(i.link) && seen.add(i.link)).sort((a, b) => b.score - a.score).slice(0, 35)
}

function counts(items) {
  const test = (re) => items.filter((i) => re.test(`${i.title} ${i.summary} ${i.theme}`)).length
  return {
    policy: test(/fed|rate|inflation|treasury|yield/i),
    ai: test(/ai|semiconductor|chip|data center|nvidia|cloud|capex/i),
    consumer: test(/consumer|retail|jobs|wages|housing|credit/i),
    geo: test(/china|tariff|sanction|ukraine|iran|oil|shipping|middle east/i),
    industrial: test(/industrial|manufacturing|aerospace|defense|boeing|lockheed/i),
  }
}

function buildMarkdown(items) {
  const c = counts(items)
  const lines = [
    '---', `date: ${today}`, 'type: daily-briefing', 'tags: [daily-briefing, markets, macro, ai, consumer, geopolitics, defense, imw]', '---',
    `# ${today} Daily Macro Briefing`, '', `Generated: ${generatedAt}`, '',
    '## Executive Macro Thesis', '',
    `Today’s briefing is organized around policy/inflation (${c.policy} signals), AI infrastructure (${c.ai}), the consumer (${c.consumer}), geopolitics (${c.geo}), and industrials/defense (${c.industrial}). The core question is whether AI-led capital spending and consumer resilience can keep growth durable while inflation, rates, oil, and geopolitical risk keep pressure on valuations.`, '',
    'Base case: the economy remains resilient but more selective. AI infrastructure, defense, power, and high-quality companies with pricing power should remain more attractive than broad cyclical beta if rates stay higher for longer.', '',
    'Differentiated angle: AI is becoming a fixed-investment cycle, not just a software story. The winners may include chips, networking, power, cooling, data centers, grid equipment, secure cloud, and defense software.', '',
    '## Top Must-Read Headlines'
  ]
  for (const item of items.slice(0, 10)) lines.push('', `### ${item.title}`, `- Source: [${clean(item.source)}](${item.link})`, `- Theme: ${item.theme}`, `- Date: ${item.pubDate ? new Date(item.pubDate).toLocaleString('en-US', { timeZone: 'America/New_York' }) : 'Recent'}`, `- Summary: ${item.summary}`, `- Why it matters: ${item.impact}`)
  lines.push('', '## Theme Breakdown')
  for (const feed of feeds) {
    lines.push('', `### ${feed.theme}`)
    for (const item of items.filter((i) => i.theme === feed.theme).slice(0, 7)) lines.push(`- [${item.title}](${item.link}) - ${item.impact}`)
  }
  lines.push('', '## Thesis Update Prompts', '- What changed today: ', '- What it implies over the next 1-3 months: ', '- What would change my mind: ', '- Companies/themes to research next: ', '', '## Source Links')
  for (const item of items) lines.push(`- [${item.title}](${item.link}) - ${clean(item.source)} / ${item.theme}`)
  return lines.join('\n')
}

function articleHtml(item) {
  return `<article style="border-top:1px solid #d8d2c9;padding:16px 0"><h3 style="margin:0 0 6px"><a href="${esc(item.link)}" style="color:#12395f;text-decoration:none">${esc(item.title)}</a></h3><p style="font:13px Arial;color:#665f55;margin:0 0 8px">${esc(item.theme)} | ${esc(clean(item.source))}</p><p>${esc(item.summary)}</p><p><strong>Why it matters:</strong> ${esc(item.impact)}</p></article>`
}

function buildHtml(items) {
  const c = counts(items)
  return `<!doctype html><html><body style="margin:0;background:#f4f0e8;color:#151515;font-family:Georgia,'Times New Roman',serif"><main style="max-width:920px;margin:0 auto;padding:28px 20px;background:#fffdf8"><div style="border-top:5px solid #151515;border-bottom:2px solid #151515;padding:14px 0;margin-bottom:20px"><p style="font:700 12px Arial;letter-spacing:.16em;text-transform:uppercase;color:#7b1f1f;margin:0">Investment Management Daily Intelligence</p><h1 style="font-size:38px;font-weight:500;margin:6px 0">Daily Macro Briefing</h1><p style="font:14px Arial;color:#665f55;margin:0">${esc(generatedAt)}</p></div><section style="background:#fff;border:1px solid #d8d2c9;padding:18px;margin-bottom:20px"><h2>Executive Macro Thesis</h2><p>Today’s briefing is organized around policy/inflation (${c.policy} signals), AI infrastructure (${c.ai}), the consumer (${c.consumer}), geopolitics (${c.geo}), and industrials/defense (${c.industrial}).</p><p><strong>Differentiated angle:</strong> AI is becoming a fixed-investment cycle. Watch chips, networking, power, cooling, data centers, grid equipment, secure cloud, and defense software.</p></section><h2>Top Must-Read Headlines</h2>${items.slice(0, 10).map(articleHtml).join('')}<p style="font:13px Arial;color:#665f55">Markdown was generated for Obsidian in Latest Daily Briefing and Daily Briefings.</p></main></body></html>`
}

const items = await fetchItems()
if (!items.length) throw new Error('No feed items were fetched.')
const markdown = buildMarkdown(items)
const html = buildHtml(items)
await fs.mkdir(path.join(root, 'dist'), { recursive: true })
await fs.mkdir(path.join(root, '00 - Home'), { recursive: true })
await fs.mkdir(path.join(root, '01 - Daily Briefings'), { recursive: true })
await fs.writeFile(path.join(root, 'dist', 'email.html'), html, 'utf8')
await fs.writeFile(path.join(root, 'dist', 'briefing.md'), markdown, 'utf8')
await fs.writeFile(path.join(root, '00 - Home', 'Latest Daily Briefing.md'), markdown, 'utf8')
await fs.writeFile(path.join(root, '01 - Daily Briefings', `${today} Daily Macro Briefing.md`), markdown, 'utf8')
console.log(`Generated enriched briefing with ${items.length} items.`)
