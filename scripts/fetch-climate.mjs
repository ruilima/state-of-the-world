// Copernicus Climate Change Service (C3S): monthly global surface air
// temperature from ERA5, as an anomaly against the 1850–1900 pre-industrial
// average. No key. Source: the data file that each monthly climate bulletin
// links ("Surface air temperature for <Month> <Year>").
//
// - The file name changes from month to month (Fig2b, FigSupp2a, a "_0"
//   suffix), so the link is picked from the bulletin page, never built.
// - ano_pi is C3S's own anomaly against 1850–1900 (it adds a different
//   offset for each calendar month); we use it as published.
// - If the page or the file changes shape, the run fails loudly (SchemaError)
//   and the last good file is kept as "stale".
import { runSource, http, parseCsv } from './lib/io.mjs';
import { SchemaError } from './lib/schema.mjs';
import { URLS } from './lib/upstream.mjs';

const HOST = 'climate.copernicus.eu';
const MAX_PAGE = 3_000_000; // bytes of HTML
const MAX_CSV = 1_000_000; // the file is about 51 KB
export const HEADER = ['month', '2t', 'clim_91-20', 'ano_91-20', 'offset_pi', 'ano_pi'];
const KEEP = 24;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const round2 = (n) => Math.round(n * 100) / 100;

/** Bulletin months to try, newest first: the month before `now`, then the one before. */
export function candidateMonths(now = new Date()) {
  const out = [];
  for (const back of [1, 2]) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export const bulletinUrl = (ym) => URLS.c3sBulletin(MONTHS[Number(ym.slice(5, 7)) - 1], ym.slice(0, 4));

/**
 * The link to the all-months 1850–1900 global series on a bulletin page.
 * Only links on climate.copernicus.eu count.
 */
export function pickCsvLink(html, base = `https://${HOST}/`) {
  const hrefs = [...html.matchAll(/href="([^"]+\.csv)"/gi)].map((m) => {
    try {
      return new URL(m[1], base);
    } catch {
      return null;
    }
  }).filter((u) => u && u.protocol === 'https:' && u.hostname === HOST);
  const pick = (re) => hrefs.find((u) => re.test(u.pathname));
  const url = pick(/ref1850-1900_global_allmonths_DATA(_\d+)?\.csv$/i) ?? pick(/preindustrial_global_allmonths_DATA(_\d+)?\.csv$/i);
  return url ? url.href : null;
}

/** Rows from the bulletin CSV, after checking the header. Throws SchemaError if it changed. */
export function parseBulletinCsv(text) {
  const lines = text.split(/\r?\n/);
  const updated = lines.find((l) => /^#\s*Last updated:/i.test(l))?.replace(/^#\s*Last updated:\s*/i, '').trim() ?? null;
  const body = lines.filter((l) => l && !l.startsWith('#'));
  const header = body[0]?.split(',').map((h) => h.trim()) ?? [];
  if (header.join(',') !== HEADER.join(',')) throw new SchemaError('climate', [`$: expected header ${HEADER.join(',')}, got ${header.join(',') || 'nothing'}`]);
  const rows = parseCsv(body.join('\n')).map((r) => ({ month: r.month.slice(0, 7), absolute: Number(r['2t']), anomaly9120: Number(r['ano_91-20']), offset: Number(r.offset_pi), anomaly: Number(r.ano_pi) }));
  const bad = rows.findIndex((r) => !/^\d{4}-\d{2}$/.test(r.month) || ![r.absolute, r.anomaly9120, r.offset, r.anomaly].every(Number.isFinite));
  if (!rows.length || bad >= 0) throw new SchemaError('climate', [`$: unreadable row ${bad >= 0 ? bad + 2 : 0}`]);
  return { rows: rows.sort((a, b) => a.month.localeCompare(b.month)), updated };
}

/** Rank of the newest month among the same calendar month in every year (1 = warmest). */
export function rankLatest(rows) {
  const last = rows.at(-1);
  const same = rows.filter((r) => r.month.slice(5) === last.month.slice(5)).sort((a, b) => b.anomaly - a.anomaly);
  const position = same.findIndex((r) => r.month === last.month) + 1;
  return { position, of: same.length, since: same.map((r) => r.month.slice(0, 4)).sort()[0], warmerYears: same.slice(0, position - 1).map((r) => r.month.slice(0, 4)) };
}

/** Summary the page uses: last 24 months, rank, mean of the last 12 monthly values. */
export function summariseClimate(rows) {
  const last12 = rows.slice(-12);
  return {
    month: rows.at(-1).month,
    rank: rankLatest(rows),
    mean12: round2(last12.reduce((a, r) => a + r.anomaly, 0) / last12.length),
    months: rows.slice(-KEEP).map((r) => ({ month: r.month, anomaly: round2(r.anomaly), absolute: round2(r.absolute) })),
  };
}

/** "12 October 2026" next to "<Month> <Year> highlights" on the bulletins index, as YYYY-MM-DD. */
export function publishedOn(indexHtml, ym) {
  const name = `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  const text = indexHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const m = text.match(new RegExp(`(\\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\\d{4}) ${name} highlights`, 'i'));
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

async function textWithin(url, max) {
  const text = await http(url, { as: 'text', timeout: 60000 });
  if (text.length > max) throw new SchemaError('climate', [`$: ${new URL(url).pathname} is ${text.length} bytes, over the ${max} limit`]);
  return text;
}

export const run = () =>
  runSource({
    id: 'climate',
    source: { name: 'Copernicus Climate Change Service (C3S), ERA5', url: 'https://climate.copernicus.eu/climate-bulletins', license: 'CC BY 4.0' },
    async fetchData() {
      let page = null;
      let ym = null;
      for (const m of candidateMonths()) {
        try {
          page = await textWithin(bulletinUrl(m), MAX_PAGE);
          ym = m;
          break;
        } catch (err) {
          if (err.status !== 404) throw err; // not published yet: try the month before
        }
      }
      if (!page) throw new Error('no C3S surface air temperature bulletin found for the last two months');
      const csvUrl = pickCsvLink(page);
      if (!csvUrl) throw new SchemaError('climate', ['$: no 1850-1900 all-months global CSV linked from the bulletin page']);
      const { rows, updated } = parseBulletinCsv(await textWithin(csvUrl, MAX_CSV));
      if (rows.at(-1).month !== ym) throw new SchemaError('climate', [`$: the ${ym} bulletin links data ending in ${rows.at(-1).month}`]);
      // The publication date is on the bulletins index; missing it is not fatal.
      let publishedAt = null;
      try {
        publishedAt = publishedOn(await textWithin(URLS.c3sBulletins, MAX_PAGE), ym);
      } catch {
        publishedAt = null;
      }
      return { data: { ...summariseClimate(rows), publishedAt, dataUpdated: updated, bulletinUrl: bulletinUrl(ym), csvUrl } };
    },
  });

if (import.meta.url === `file://${process.argv[1]}`) await run();
