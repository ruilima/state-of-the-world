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
const toEvent = (r) => ({
  date: String(r.date_start).slice(0, 10),
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

async function eventsFromApi(token, version, year) {
  const events = [];
  let url = `${URLS.ucdpApi}/gedevents/${version}?pagesize=1000&StartDate=${year}-01-01`;
  for (let page = 0; url && page < 50; page++) {
    const body = assertSchema('ucdp', RAW.ucdpApiPage, await http(url, { headers: { 'x-ucdp-access-token': token } }));
    events.push(...body.Result.map(toEvent));
    url = body.NextPageUrl || null;
  }
  return events;
}

function summarise(events) {
  const months = new Map();
  for (const e of events) {
    const m = e.date.slice(0, 7);
    const acc = months.get(m) ?? { month: m, deaths: 0, events: 0, byType: { 1: 0, 2: 0, 3: 0 } };
    acc.deaths += e.deaths; acc.events++; acc.byType[e.type] += e.deaths;
    months.set(m, acc);
  }
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  const latestMonth = monthly.at(-1)?.month ?? null;
  const latest = events.filter((e) => e.date.startsWith(latestMonth));

  const byCountry = new Map();
  for (const e of latest) byCountry.set(e.country, (byCountry.get(e.country) ?? 0) + e.deaths);
  const topCountries = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([country, deaths]) => ({ country, deaths }));

  // Map: latest month, aggregated to 1° cells so the file stays small.
  const cells = new Map();
  for (const e of latest) {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
    const k = `${Math.round(e.lat)},${Math.round(e.lon)}`;
    const c = cells.get(k) ?? { lat: Math.round(e.lat), lon: Math.round(e.lon), deaths: 0, events: 0, country: e.country };
    c.deaths += e.deaths; c.events++;
    cells.set(k, c);
  }
  return { monthly, latestMonth, topCountries, points: [...cells.values()].sort((a, b) => b.deaths - a.deaths) };
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

      let mode = 'downloads';
      let events;
      if (token && links.monthly) {
        mode = 'api';
        events = await eventsFromApi(token, links.monthly.version, year);
      } else {
        events = await eventsFromDownloads(links.cumulative);
      }
      return {
        meta: {
          mode,
          modeNote:
            mode === 'api'
              ? `Candidate events from the UCDP API (version ${links.monthly.version}). Annual series: Battle-Related Deaths ${links.brd.version}.`
              : `No UCDP_TOKEN: candidate events read from the official monthly download. Annual series: Battle-Related Deaths ${links.brd.version}.`,
        },
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
