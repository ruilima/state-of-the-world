// UCDP — Uppsala Conflict Data Program (CC BY 4.0).
//
// Two modes, chosen automatically and written into the output as `mode`:
//   "api"       — UCDP_TOKEN is set: candidate events come from the UCDP API
//                 (https://ucdp.uu.se/apidocs/), resource gedevents, at the
//                 cumulative candidate version of the year (26.01.26.09 =
//                 January–September 2026, the same events as the file
//                 GEDEvent_v26_01_26_09.csv). Not 26.1: that is the annual GED,
//                 which ends in 2025. Not 26.0.9: that is September alone.
//   "downloads" — no token, or the API failed: the same candidate events come
//                 from the cumulative CSV on UCDP's downloads page.
// The version comes from the downloads page in both modes, so a new release
// is picked up the day it is listed. The long annual series comes from the
// Battle-Related Deaths file (published once a year) in both modes.
//
// The token is sent only in the x-ucdp-access-token header, only to
// ucdpapi.pcr.uu.se, and never written to the log or the output: error
// messages are replaced by plain reasons (see apiReason).
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
  // (-> API version 26.01.26.09).
  const cumulative = [...html.matchAll(/href="([^"]*candidateged\/GEDEvent_v(\d+)_01_(\d+)_(\d+)\.csv)"/gi)].map((m) => ({ url: abs(m[1]), yy: m[2], month: Number(m[4]), apiVersion: `${m[2]}.01.${m[3]}.${m[4]}` }));
  const brd = [...html.matchAll(/href="([^"]*brd\/ucdp-brd-dyadic-(\d+)-csv\.zip)"/gi)].map((m) => ({ url: abs(m[1]), version: m[2] }));
  if (!cumulative.length || !brd.length) throw new SchemaError('ucdp', ['downloads page no longer lists candidate GED or BRD CSV files']);
  const newest = (arr, key) => arr.sort((a, b) => String(b[key]).localeCompare(String(a[key]), undefined, { numeric: true }))[0];
  return { cumulative: newest(cumulative, 'month'), brd: newest(brd, 'version') };
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

// 1,000 rows a page (about 1.9 MB): 17 requests for January–September 2026.
// The limit is 5,000 requests a day, errors included; MAX_PAGES caps one run.
export const PAGE_SIZE = 1000;
export const MAX_PAGES = 40;

/**
 * Every event of one candidate version, page by page (pages start at 0).
 * No date filter: the API's StartDate works on date_end, and the file has
 * no filter either. Page URLs are built here rather than taken from
 * NextPageUrl, so the token only ever goes to URLS.ucdpApi. No retries: a
 * failure falls back to the downloads, and errors count against the quota.
 * Returns { events, requests }.
 */
export async function eventsFromApi(token, version) {
  const events = [];
  const ids = new Set();
  let total = null;
  let pages = 1;
  let requests = 0;
  for (let page = 0; page < pages; page++) {
    const url = `${URLS.ucdpApi}/gedevents/${version}?pagesize=${PAGE_SIZE}&page=${page}`;
    requests++;
    const body = assertSchema('ucdp', RAW.ucdpApiPage, await http(url, { headers: { 'x-ucdp-access-token': token }, retries: 0, timeout: 60000 }));
    if (total === null) {
      total = body.TotalCount;
      pages = Math.ceil(total / PAGE_SIZE);
      if (!total) throw new Error(`UCDP API: version ${version} has no events`);
      if (pages > MAX_PAGES) throw new Error(`UCDP API: ${total} events would take ${pages} requests (cap ${MAX_PAGES})`);
    }
    for (const r of body.Result) {
      if (ids.has(r.id)) continue;
      ids.add(r.id);
      events.push(toEvent(r));
    }
  }
  // Pages are only stable "within a session": check nothing was lost.
  if (events.length !== total) throw new Error(`UCDP API: received ${events.length} distinct events of ${total}`);
  return { events, requests };
}

/** Why the API was not used, in plain English, without the token or the response body. */
export function apiReason(err) {
  const st = err?.status;
  if (st === 401 || st === 403) return `The UCDP API refused the access token (HTTP ${st}).`;
  if (st === 429) return 'The UCDP API daily request limit was reached (HTTP 429).';
  if (st) return `The UCDP API returned an error (HTTP ${st}).`;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'The UCDP API did not answer in time.';
  if (/^UCDP API: /.test(err?.message ?? '')) return `The UCDP API answer was incomplete (${err.message.slice(10, 120)}).`;
  if (err?.name === 'SchemaError') return 'The UCDP API answer had an unexpected format.';
  return 'The UCDP API could not be reached.';
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
// Events are put in a fixed order first: the API and the file list them
// differently, and the order decides ties on the map and which country names
// a 1° cell that spans a border.
const eventKey = (e) => [e.date, e.end, e.country, e.lat, e.lon, e.type, e.deaths].join('|');
export function summarise(unordered) {
  const events = unordered.map((e) => [eventKey(e), e]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([, e]) => e);
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

  // Map: latest month, aggregated to 1° cells so the file stays small. A cell
  // on a border is named after the country with most deaths in it
  // (alphabetical on a tie).
  const cells = new Map();
  for (const e of latest) {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
    const k = `${Math.round(e.lat)},${Math.round(e.lon)}`;
    const c = cells.get(k) ?? { lat: Math.round(e.lat), lon: Math.round(e.lon), deaths: 0, events: 0, byCountry: new Map() };
    c.deaths += e.deaths; c.events++;
    c.byCountry.set(e.country, (c.byCountry.get(e.country) ?? 0) + e.deaths);
    cells.set(k, c);
  }
  const points = [...cells.values()].map(({ byCountry, ...c }) => ({
    ...c,
    deaths: Math.round(c.deaths),
    country: [...byCountry].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
  }));
  return { monthly, latestMonth, topCountries, points: points.sort((a, b) => b.deaths - a.deaths) };
}

/** The ucdp.json payload ({ meta, data }); the API is tried when `token` is set. */
export async function fetchUcdp(token = process.env.UCDP_TOKEN?.trim()) {
  const links = await findDownloadLinks();
  const annual = await annualSeries(links.brd);

  // With a token, try the API first. Any API failure (bad token, quota,
  // outage, incomplete answer) falls back to the official downloads, and
  // the output says which one was used and why.
  const version = links.cumulative.apiVersion;
  let mode = 'downloads';
  let events;
  let apiError = null;
  let apiRequests = 0;
  if (token) {
    try {
      const r = await eventsFromApi(token, version);
      events = r.events;
      apiRequests = r.requests;
      mode = 'api';
    } catch (err) {
      apiError = apiReason(err);
      console.error(`ucdp: using the download files instead of the API. ${apiError}`);
    }
  }
  if (!events) events = await eventsFromDownloads(links.cumulative);
  if (mode === 'api') console.log(`ucdp: ${events.length} candidate events from the API, version ${version}, ${apiRequests} requests`);
  const annualText = `Annual series: Battle-Related Deaths ${links.brd.version}.`;
  const modeNote =
    mode === 'api'
      ? `Candidate events from the UCDP API (version ${version}). ${annualText}`
      : apiError
        ? `${apiError} Candidate events were read from UCDP's download file instead (version ${version}). ${annualText}`
        : `Candidate events read from UCDP's download file (version ${version}), because no API token is set. ${annualText}`;
  return {
    meta: { mode, modeNote, apiError, apiRequests },
    data: {
      annual,
      annualVersion: links.brd.version,
      annualNote: 'Battle deaths in conflicts where at least one side is a state ("best" estimate).',
      candidateVersion: version,
      candidateMode: mode,
      candidateFile: mode === 'downloads' ? links.cumulative.url : null,
      violenceTypes: VIOLENCE,
      ...summarise(events),
    },
  };
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
    fetchData: () => fetchUcdp(),
  });

if (import.meta.url === `file://${process.argv[1]}`) await run();
