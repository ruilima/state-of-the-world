// Tech pulse for the work-and-AI dossier: what the tech community
// (Hacker News) and researchers (arXiv) are posting about AI and jobs.
// Titles, dates and links only.
import { runSource, http, sleep } from './lib/io.mjs';
import { assertSchema, SchemaError } from './lib/schema.mjs';
import { URLS, RAW } from './lib/upstream.mjs';

const HN_QUERIES = ['AI layoffs', 'automation jobs', 'AI replacing workers'];
// A title must mention both work and AI/automation to count.
const WORK = /\b(layoffs?|job cuts?|workers?|employment|hiring|labou?r|workforce|careers?|unemploy\w*|jobs)\b/i;
const AI = /\b(AI|A\.I\.|artificial intelligence|automation|automated|LLMs?|GPT|chatbots?|agents?|robots?)\b/;
const RELEVANT = { test: (t) => WORK.test(t) && AI.test(t) && !/scheduled jobs|cron/i.test(t) };

async function hn() {
  const seen = new Map();
  const titles = new Set();
  for (const q of HN_QUERIES) {
    const body = assertSchema('pulse', RAW.hnSearch, await http(URLS.hnSearch(q)));
    for (const h of body.hits) {
      if (!RELEVANT.test(h.title) || seen.has(h.objectID) || titles.has(h.title)) continue;
      titles.add(h.title);
      seen.set(h.objectID, {
        title: h.title,
        date: h.created_at,
        points: h.points ?? 0,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
      });
    }
    await sleep(500);
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
}

// arXiv returns Atom XML; the fields we need are simple enough for regexes.
async function arxiv() {
  const xml = await http(URLS.arxiv, { as: 'text', timeout: 45000 });
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  if (!xml.includes('<feed')) throw new SchemaError('pulse', ['arXiv response is not an Atom feed']);
  const tag = (s, t) => s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1]?.replace(/\s+/g, ' ').trim();
  return entries.map((e) => {
    const out = { title: tag(e, 'title'), date: tag(e, 'published'), url: tag(e, 'id')?.replace(/^http:/, 'https:') };
    if (!out.title || !out.date || !out.url) throw new SchemaError('pulse', ['arXiv entry missing title/published/id']);
    return out;
  });
}

export const run = () =>
  runSource({
    id: 'pulse',
    source: { name: 'Hacker News (Algolia) and arXiv', url: 'https://hn.algolia.com/api', license: 'Titles and links only. Thank you to arXiv for use of its open access interoperability.' },
    async fetchData() {
      const [hnItems, papers] = [await hn(), await arxiv()];
      return { data: { hn: hnItems, arxiv: papers } };
    },
  });

if (import.meta.url === `file://${process.argv[1]}`) await run();
