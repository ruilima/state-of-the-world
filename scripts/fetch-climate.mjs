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
export const HEADER_12M = ['Month', 'Global', 'European'];
// C3S adds this standard offset to annual (12-month) anomalies against
// 1991–2020 to express them against 1850–1900 ("Annual global averages: A
// standard offset of 0.88°C is added…", climate-bulletin-about-data-and-analysis).
export const ANNUAL_OFFSET = 0.88;
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

// CSV links on a bulletin page; only https links on climate.copernicus.eu count.
function csvLinks(html, base) {
  return [...html.matchAll(/href="([^"]+\.csv)"/gi)].map((m) => {
    try {
      return new URL(m[1], base);
    } catch {
      return null;
    }
  }).filter((u) => u && u.protocol === 'https:' && u.hostname === HOST);
}

/** The link to the global 12-month average series (vs 1991–2020) on a bulletin page. */
export function pick12mLink(html, base = `https://${HOST}/`) {
  return csvLinks(html, base).find((u) => /global_12month_average_DATA(_\d+)?\.csv$/i.test(u.pathname))?.href ?? null;
}

/**
 * The link to the all-months 1850–1900 global series on a bulletin page.
 * Only links on climate.copernicus.eu count.
 */
export function pickCsvLink(html, base = `https://${HOST}/`) {
  const hrefs = csvLinks(html, base);
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

/** Summary the page uses: last 24 months and the rank of the latest. */
export function summariseClimate(rows) {
  return {
    month: rows.at(-1).month,
    rank: rankLatest(rows),
    months: rows.slice(-KEEP).map((r) => ({ month: r.month, anomaly: round2(r.anomaly), absolute: round2(r.absolute) })),
  };
}

/** The 12-month global anomaly (vs 1991–2020) ending in `ym`, from the 12-month CSV. */
export function parse12mCsv(text, ym) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l.split(',').map((h) => h.trim()).join(',') === HEADER_12M.join(','));
  if (at < 0) throw new SchemaError('climate', [`$: 12-month file has no ${HEADER_12M.join(',')} header`]);
  const row = lines.slice(at + 1).map((l) => l.split(',')).find((r) => r[0] === ym.replace('-', ''));
  const value = Number(row?.[1]);
  if (!row || !Number.isFinite(value)) throw new SchemaError('climate', [`$: 12-month file has no global value for ${ym}`]);
  return value;
}

const MONTH_NUM = Object.fromEntries(MONTHS.map((m, i) => [m, String(i + 1).padStart(2, '0')]));

/**
 * The bulletin's own sentence: "The average global temperature for the last 12
 * months (October 2025 to September 2026) was 0.62°C above the 1991-2020
 * average, and 1.50°C above the 1850-1900 pre-industrial average."
 */
export function twelveMonthSentence(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#176;|&deg;/g, '°').replace(/\s+/g, ' ');
  const m = text.match(/last 12 months \((\w+) (\d{4}) to (\w+) (\d{4})\) was (-?\d+(?:\.\d+)?) ?°C above the 1991-2020 average,? and (-?\d+(?:\.\d+)?) ?°C above the 1850-1900/i);
  if (!m || !MONTH_NUM[m[1].toLowerCase()] || !MONTH_NUM[m[3].toLowerCase()]) return null;
  return { from: `${m[2]}-${MONTH_NUM[m[1].toLowerCase()]}`, to: `${m[4]}-${MONTH_NUM[m[3].toLowerCase()]}`, value: Number(m[6]) };
}

/**
 * The 12-month average to show: the bulletin's sentence when readable,
 * otherwise the 12-month CSV plus the annual offset. A disagreement is
 * logged and the sentence wins. Null when neither is available.
 */
export function chooseTwelveMonth(sentence, csvValue, ym, warn = console.warn) {
  const fromSentence = sentence && sentence.to === ym ? sentence.value : null;
  const fromCsv = Number.isFinite(csvValue) ? round2(csvValue + ANNUAL_OFFSET) : null;
  if (fromSentence != null && fromCsv != null && fromSentence !== fromCsv) warn(`climate: 12-month average differs: bulletin text ${fromSentence}, 12-month file ${fromCsv}; using the text`);
  const value = fromSentence ?? fromCsv;
  if (value == null) return null;
  const [y, m] = ym.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 7);
  return { value, from, to: ym, basis: fromSentence != null ? 'bulletin text' : '12-month file' };
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
      // C3S's own 12-month average; missing it only drops that line.
      let csv12 = null;
      const link12 = pick12mLink(page);
      try {
        if (link12) csv12 = parse12mCsv(await textWithin(link12, MAX_CSV), ym);
      } catch (err) {
        console.warn(`climate: 12-month file unreadable: ${err.message}`);
      }
      const twelveMonth = chooseTwelveMonth(twelveMonthSentence(page), csv12, ym);
      const data = { ...summariseClimate(rows), twelveMonth, publishedAt, dataUpdated: updated, bulletinUrl: bulletinUrl(ym), csvUrl };
      return twelveMonth ? { data } : { data, meta: { status: 'partial', error: 'no 12-month average in the bulletin' } };
    },
  });

if (import.meta.url === `file://${process.argv[1]}`) await run();
