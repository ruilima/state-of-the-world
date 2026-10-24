// UCDP — Uppsala Conflict Data Program (CC BY 4.0).
//
// Two modes, chosen automatically and written into the output as `mode`:
//   "api"       — UCDP_TOKEN is set: candidate events come from the UCDP API.
//   "downloads" — no token: the same candidate events come from the monthly
//                 CSV that UCDP publishes on its downloads page.
// In both modes the long annual series comes from the Battle-Related
// Deaths dataset (published once a year).
//
// "Candidate" events are UCDP's preliminary monthly release: they are
// revised in the next annual dataset. The site says so.
import { unzipSync, strFromU8 } from 'fflate';
import { runSource, http, parseCsv } from './lib/io.mjs';
import { assertSchema, SchemaError } from './lib/schema.mjs';
import { URLS, RAW } from './lib/upstream.mjs';
import { s } from './lib/schema.mjs';

const VIOLENCE = { 1: 'State-based conflict', 2: 'Non-state conflict', 3: 'One-sided violence' };

async function findDownloadLinks() {
  const html = await http(URLS.ucdpDownloads, { as: 'text' });
  const abs = (p) => new URL(p, URLS.ucdpDownloads).href;
  // Cumulative candidate file for the current year, e.g. GEDEvent_v26_01_26_09.csv
  const cumulative = [...html.matchAll(/href="([^"]*candidateged\/GEDEvent_v(\d+)_01_\d+_(\d+)\.csv)"/gi)].map((m) => ({ url: abs(m[1]), yy: m[2], month: Number(m[3]) }));
  // Latest single-month candidate file, e.g. GEDEvent_v26_0_9.csv (-> API version 26.0.9)
  const monthly = [...html.matchAll(/href="([^"]*candidateged\/GEDEvent_v(\d+)_0_(\d+)\.csv)"/gi)].map((m) => ({ url: abs(m[1]), version: `${m[2]}.0.${m[3]}` }));
  const brd = [...html.matchAll(/href="([^"]*brd\/ucdp-brd-dyadic-(\d+)-csv\.zip)"/gi)].map((m) => ({ url: abs(m[1]), version: m[2] }));
  if (!cumulative.length || !brd.length) throw new SchemaError('ucdp', ['downloads page no longer lists candidate GED or BRD CSV files']);
  const newest = (arr, key) => arr.sort((a, b) => String(b[key]).localeCompare(String(a[key]), undefined, { numeric: true }))[0];
  return { cumulative: newest(cumulative, 'month'), monthly: monthly.length ? newest(monthly, 'version') : null, brd: newest(brd, 'version') };
}

async function annualSeries(brdLink) {
  const zip = unzipSync(await http(brdLink.url, { as: 'bytes', timeout: 60000 }));
  const csvName = Object.keys(zip).find((n) => n.endsWith('.csv'));
  const rows = parseCsv(strFromU8(zip[csvName]));
  assertSchema('ucdp', s.arr(RAW.ucdpBrdRow, { min: 100 }), rows);
  const byYear = new Map();
  for (const r of rows) {
    const y = Number(r.year);
    const acc = byYear.get(y) ?? { year: y, deaths: 0, conflicts: new Set() };
    acc.deaths += Number(r.bd_best) || 0;
    acc.conflicts.add(r.conflict_id);
    byYear.set(y, acc);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year).map((a) => ({ year: a.year, deaths: a.deaths, conflicts: a.conflicts.size }));
}

// Normalise CSV rows and API rows to one event shape. Numbers only:
// UCDP rows also carry source article text, which we never republish.
// Deaths are always the "best" estimate, never low or high: some rows have
// low > high, and best is the figure UCDP recommends.
export const toEvent = (r) => ({
  date: String(r.date_start).slice(0, 10),
  end: String(r.date_end || r.date_start).slice(0, 10),
  type: Number(r.type_of_violence),
  deaths: Number(r.best) || 0,
  country: String(r.country).replace(/\s*\(.*\)$/, ''),
  lat: Number(r.latitude),
  lon: Number(r.longitude),
});

async function eventsFromDownloads(link) {
  const rows = parseCsv(await http(link.url, { as: 'text', timeout: 90000 }));
  assertSchema('ucdp', s.arr(RAW.ucdpGedRow, { min: 1 }), rows);
  return rows.map(toEvent);
}

export async function eventsFromApi(token, version, year) {
  const events = [];
  let url = `${URLS.ucdpApi}/gedevents/${version}?pagesize=1000&StartDate=${year}-01-01`;
  for (let page = 0; url && page < 50; page++) {
    const body = assertSchema('ucdp', RAW.ucdpApiPage, await http(url, { headers: { 'x-ucdp-access-token': token } }));
    events.push(...body.Result.map(toEvent));
    url = body.NextPageUrl || null;
  }
  return events;
}

const DAY = 864e5;

/**
 * An event's share in each calendar month it covers, by days (UTC).
 * A 1 Jan–30 Jun event puts 31/181 of its deaths in January, 28/181 in
 * February and so on. A one-day event, or an end before the start, stays
 * whole in its start month.
 */
export function splitByMonth(start, end) {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Math.max(s, Date.parse(`${end}T00:00:00Z`) || s);
  const total = (e - s) / DAY + 1;
  const parts = [];
  for (let t = s; t <= e; ) {
    const d = new Date(t);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const days = (Math.min(next - DAY, e) - t) / DAY + 1;
    parts.push({ month: d.toISOString().slice(0, 7), share: days / total });
    t = next;
  }
  return parts;
}

// Each event counts once in `events` (in its start month); its deaths are
// spread over the months it covers. The file covers months up to the newest
// start date; a share that falls after that stays in the last covered month,
// so no deaths are lost and no half-covered month appears.
export function summarise(events) {
  const months = new Map();
  const slot = (m) => months.get(m) ?? months.set(m, { month: m, deaths: 0, events: 0, byType: { 1: 0, 2: 0, 3: 0 } }).get(m);
  const lastCovered = events.reduce((a, e) => (e.date.slice(0, 7) > a ? e.date.slice(0, 7) : a), '');
  const capped = (parts) => {
    const out = new Map();
    for (const p of parts) { const m = p.month > lastCovered ? lastCovered : p.month; out.set(m, (out.get(m) ?? 0) + p.share); }
    return [...out].map(([month, share]) => ({ month, share }));
  };
  const shares = events.map((e) => ({ e, parts: capped(splitByMonth(e.date, e.end ?? e.date)) }));
  for (const { e, parts } of shares) {
    slot(e.date.slice(0, 7)).events++;
    for (const p of parts) {
      const acc = slot(p.month);
      acc.deaths += e.deaths * p.share;
      acc.byType[e.type] += e.deaths * p.share;
    }
  }
  const monthly = [...months.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({ ...m, deaths: Math.round(m.deaths), byType: { 1: Math.round(m.byType[1]), 2: Math.round(m.byType[2]), 3: Math.round(m.byType[3]) } }));
  const latestMonth = monthly.at(-1)?.month ?? null;
  // Events with a share in the latest month, with that share of their deaths.
  const latest = shares
    .filter(({ parts }) => parts.some((p) => p.month === latestMonth))
    .map(({ e, parts }) => ({ ...e, deaths: e.deaths * parts.find((p) => p.month === latestMonth).share }));

  const byCountry = new Map();
  for (const e of latest) byCountry.set(e.country, (byCountry.get(e.country) ?? 0) + e.deaths);
  const topCountries = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([country, deaths]) => ({ country, deaths: Math.round(deaths) }));

  // Map: latest month, aggregated to 1° cells so the file stays small.
  const cells = new Map();
  for (const e of latest) {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
    const k = `${Math.round(e.lat)},${Math.round(e.lon)}`;
    const c = cells.get(k) ?? { lat: Math.round(e.lat), lon: Math.round(e.lon), deaths: 0, events: 0, country: e.country };
    c.deaths += e.deaths; c.events++;
    cells.set(k, c);
  }
  const points = [...cells.values()].map((c) => ({ ...c, deaths: Math.round(c.deaths) }));
  return { monthly, latestMonth, topCountries, points: points.sort((a, b) => b.deaths - a.deaths) };
}

export const run = () =>
  runSource({
    id: 'ucdp',
    source: {
      name: 'UCDP — Uppsala Conflict Data Program',
      url: 'https://ucdp.uu.se/',
      license: 'CC BY 4.0',
      // Dataset names only; UCDP's preferred article citations are listed at
      // https://ucdp.uu.se/downloads/ next to each dataset.
      citation: 'UCDP Candidate Events Dataset and UCDP Battle-Related Deaths Dataset, Department of Peace and Conflict Research, Uppsala University.',
    },
    async fetchData() {
      const token = process.env.UCDP_TOKEN?.trim();
      const links = await findDownloadLinks();
      const annual = await annualSeries(links.brd);
      const year = new Date().getUTCFullYear();

      // With a token, try the API first. Any API failure (bad token, new
      // version naming, outage) falls back to the official downloads, and
      // the page says which one was used.
      let mode = 'downloads';
      let events;
      let apiError = null;
      if (token && links.monthly) {
        try {
          events = await eventsFromApi(token, links.monthly.version, year);
          mode = 'api';
        } catch (err) {
          apiError = String(err.message).slice(0, 160);
          console.error(`ucdp: API failed, using downloads instead: ${apiError}`);
        }
      }
      if (!events) events = await eventsFromDownloads(links.cumulative);
      const annualText = `Annual series: Battle-Related Deaths ${links.brd.version}.`;
      const modeNote =
        mode === 'api'
          ? `Candidate events from the UCDP API (version ${links.monthly.version}). ${annualText}`
          : apiError
            ? `The UCDP API request failed, so candidate events were read from the official monthly download. ${annualText}`
            : `Official downloads: candidate events read from UCDP's monthly file, because no API token is set. ${annualText}`;
      return {
        meta: { mode, modeNote, apiError },
        data: {
          annual,
          annualVersion: links.brd.version,
          annualNote: 'Battle deaths in conflicts where at least one side is a state ("best" estimate).',
          candidateFile: mode === 'downloads' ? links.cumulative.url : null,
          violenceTypes: VIOLENCE,
          ...summarise(events),
        },
      };
    },
  });

if (import.meta.url === `file://${process.argv[1]}`) await run();
