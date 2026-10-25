// GDELT DOC 2.0 API: recent headlines and coverage-volume curves.
// The API asks for one request every 5 seconds and in practice also sheds
// load with HTTP 429, so queries run in series with a long pause, and each
// query keeps its own last good result: one refused query does not throw
// away the others.
import { join } from 'node:path';
import { runSource, http, sleep, OUT_DIR, readJson } from './lib/io.mjs';
import { assertSchema } from './lib/schema.mjs';
import { URLS, RAW } from './lib/upstream.mjs';

const PAUSE_MS = Number(process.env.GDELT_PAUSE_MS ?? 12000);

export const QUERIES = [
  { key: 'conflictHeadlines', mode: 'artlist', q: '("armed conflict" OR airstrike OR shelling) sourcelang:english', timespan: '24h', max: 40,
    // Full-text matches often have unrelated titles; keep titles that say it.
    titleFilter: /\b(strikes?|airstrikes?|attack|attacks|killed|shelling|missile|drone|troops|ceasefire|truce|militia|rebels|army|offensive|bombing|clashes|conflict)\b/i },
  { key: 'aiLayoffHeadlines', mode: 'artlist', q: '(layoffs OR "job cuts") ("artificial intelligence" OR automation) sourcelang:english', timespan: '72h', max: 40,
    titleFilter: /\b(layoffs?|job cuts?|cuts? \d[\d,]* jobs|jobs|workforce|redundanc(y|ies)|fired|replac\w+ workers)\b/i },
  { key: 'coverageArmedConflict', mode: 'timelinevol', q: '"armed conflict"', timespan: '30d', label: 'armed conflict' },
  { key: 'coverageCeasefire', mode: 'timelinevol', q: 'ceasefire', timespan: '30d', label: 'ceasefire' },
  { key: 'coverageSanctions', mode: 'timelinevol', q: 'sanctions', timespan: '30d', label: 'sanctions' },
];

const urlFor = ({ mode, q, timespan, max }) => {
  const p = new URLSearchParams({ query: q, mode, format: 'json', timespan });
  if (max) p.set('maxrecords', String(max));
  if (mode === 'artlist') p.set('sort', 'datedesc');
  return `${URLS.gdeltDoc}?${p}`;
};

// GDELT tokenises titles ("cut 5 , 000 jobs", "word , word", "AI - driven",
// "28 %"); undo the spacing it adds around commas, full stops, hyphens inside
// words and percent signs. A hyphen is joined only between a letter and a
// lower-case letter, so "Yemen - Xinhua", "A - B", "5 - 10" and dashes stay.
export const cleanTitle = (t) =>
  t
    .trim()
    .replace(/(\d) , (\d{3})\b/g, '$1,$2')
    .replace(/ ([,.;:!?])(?=\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/(?<=\p{L}) - (?=\p{Ll})/gu, '-')
    .replace(/(\d) %/g, '$1%');

// "20261023T120000Z" -> ISO
const gdeltDate = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:00Z`;

async function runQuery(def) {
  // No retry: a refused query keeps its last good result, and a retry
  // would only add minutes to every CI run.
  const raw = await http(urlFor(def), { retries: 0, timeout: 30000 });
  if (def.mode === 'artlist') {
    const body = assertSchema('gdelt-doc', RAW.gdeltArtList, raw);
    // Title, source, date and link only: never article bodies.
    const seen = new Set();
    return (body.articles ?? [])
      .filter((a) => (!def.titleFilter || def.titleFilter.test(a.title)) && !seen.has(a.title) && seen.add(a.title))
      .slice(0, 10)
      .map((a) => ({ title: cleanTitle(a.title), domain: a.domain, language: a.language, date: gdeltDate(a.seendate), url: a.url }));
  }
  const body = assertSchema('gdelt-doc', RAW.gdeltTimeline, raw);
  // timelinevol: share of all monitored coverage (%), hourly or daily points.
  const days = new Map();
  for (const p of body.timeline[0]?.data ?? []) {
    const d = p.date.slice(0, 4) + '-' + p.date.slice(4, 6) + '-' + p.date.slice(6, 8);
    const acc = days.get(d) ?? { date: d, sum: 0, n: 0 };
    acc.sum += p.value; acc.n++;
    days.set(d, acc);
  }
  return [...days.values()].map((d) => ({ date: d.date, value: Math.round((d.sum / d.n) * 10000) / 10000 }));
}

export const run = () =>
  runSource({
    id: 'gdelt-doc',
    source: { name: 'GDELT Project — DOC 2.0 API', url: 'https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/', license: 'Free to use with attribution to the GDELT Project' },
    async fetchData() {
      const prev = (await readJson(join(OUT_DIR, 'gdelt-doc.json')))?.data?.queries ?? {};
      const queries = {};
      let ok = 0;
      for (const [i, def] of QUERIES.entries()) {
        if (i) await sleep(PAUSE_MS);
        const base = { key: def.key, mode: def.mode, query: def.q, timespan: def.timespan, label: def.label ?? null };
        try {
          const items = await runQuery(def);
          queries[def.key] = { ...base, status: 'ok', fetchedAt: new Date().toISOString(), error: null, items };
          ok++;
        } catch (err) {
          if (err.name === 'SchemaError') throw err;
          const old = prev[def.key];
          queries[def.key] = old?.items?.length
            ? { ...old, status: 'stale', error: String(err.message).slice(0, 200), items: def.mode === 'artlist' ? old.items.filter((a) => !def.titleFilter || def.titleFilter.test(a.title)).map((a) => ({ ...a, title: cleanTitle(a.title) })) : old.items }
            : { ...base, status: 'error', fetchedAt: null, error: String(err.message).slice(0, 200), items: [] };
        }
      }
      // If every query was refused and we had nothing before, report failure.
      if (!ok && !Object.values(queries).some((q) => q.items.length)) throw new Error('GDELT DOC refused every query (rate limited)');
      return {
        meta: { queriesOk: ok, queriesTotal: QUERIES.length, ...(ok < QUERIES.length && { status: 'partial' }) },
        data: { queries },
      };
    },
  });

if (import.meta.url === `file://${process.argv[1]}`) await run();
