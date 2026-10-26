// UCDP: the API path (token in the x-ucdp-access-token header, cumulative
// candidate version, every page), the fallback to the download files, and
// the token kept out of logs and output. No real token: fetch is simulated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { eventsFromApi, fetchUcdp, apiReason, PAGE_SIZE } from '../scripts/fetch-ucdp.mjs';

const TOKEN = 'fake-token-7f3a9c';
const N = 1500; // two API pages
const rows = Array.from({ length: N }, (_, i) => ({
  id: 600000 + i,
  date_start: `2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, '0')}`,
  date_end: `2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, '0')}`,
  type_of_violence: 1 + (i % 3),
  best: i % 7,
  low: i % 7,
  high: i % 7,
  country: i % 2 ? 'Sudan' : 'Ukraine',
  latitude: 10 + (i % 5),
  longitude: 30 + (i % 4),
}));
const COLS = ['id', 'date_start', 'date_end', 'type_of_violence', 'best', 'low', 'high', 'country', 'latitude', 'longitude'];
const csv = [COLS.join(','), ...rows.map((r) => COLS.map((c) => r[c]).join(','))].join('\n') + '\n';
const brdCsv = ['year,bd_best,conflict_id,type_of_conflict', ...Array.from({ length: 120 }, (_, i) => `${1989 + (i % 37)},${10 + i},${i % 40},3`)].join('\n') + '\n';
const downloadsHtml = '<a href="candidateged/GEDEvent_v26_01_26_09.csv">2026</a> <a href="candidateged/GEDEvent_v26_0_9.csv">Sep</a> <a href="brd/ucdp-brd-dyadic-261-csv.zip">BRD</a>';

/** Simulated upstreams. `api` answers API requests: (url, page) => Response. */
function upstream(t, api) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ url: String(url), token: init.headers?.['x-ucdp-access-token'] ?? null });
    if (u.host === 'ucdpapi.pcr.uu.se') return api(u, Number(u.searchParams.get('page')));
    if (u.pathname === '/downloads/') return new Response(downloadsHtml);
    if (u.pathname.endsWith('.zip')) return new Response(zipSync({ 'ucdp-brd-dyadic-261.csv': strToU8(brdCsv) }));
    if (u.pathname.endsWith('GEDEvent_v26_01_26_09.csv')) return new Response(csv);
    return new Response('not found', { status: 404 });
  });
  return calls;
}
const pageOf = (p) => new Response(JSON.stringify({ TotalCount: N, TotalPages: Math.ceil(N / PAGE_SIZE), NextPageUrl: null, Result: rows.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE) }));

/** Everything written to the console while `fn` runs. */
async function logged(t, fn) {
  const lines = [];
  for (const m of ['log', 'error', 'warn']) t.mock.method(console, m, (...a) => lines.push(a.join(' ')));
  const result = await fn();
  for (const m of ['log', 'error', 'warn']) console[m].mock.restore();
  return { result, lines };
}

test('API path: cumulative version, every page, token only in the header and only to the API host', async (t) => {
  const calls = upstream(t, (u, p) => pageOf(p));
  const { result, lines } = await logged(t, () => fetchUcdp(TOKEN));
  const api = calls.filter((c) => c.url.startsWith('https://ucdpapi.pcr.uu.se/'));
  assert.deepEqual(api.map((c) => c.url), [0, 1].map((p) => `https://ucdpapi.pcr.uu.se/api/gedevents/26.01.26.09?pagesize=${PAGE_SIZE}&page=${p}`));
  assert.ok(api.every((c) => c.token === TOKEN));
  assert.ok(calls.filter((c) => !c.url.startsWith('https://ucdpapi.pcr.uu.se/')).every((c) => c.token === null), 'token sent to another host');
  assert.ok(!calls.some((c) => c.url.endsWith('.csv')), 'the CSV is not downloaded in API mode');
  assert.equal(result.meta.mode, 'api');
  assert.equal(result.meta.apiRequests, 2);
  assert.equal(result.meta.apiError, null);
  assert.equal(result.data.candidateVersion, '26.01.26.09');
  assert.match(result.meta.modeNote, /^Candidate events from the UCDP API \(version 26\.01\.26\.09\)/);
  assert.ok(!JSON.stringify(result).includes(TOKEN) && !lines.join('\n').includes(TOKEN));
});

test('API and download files give the same summary for the same events', async (t) => {
  upstream(t, (u, p) => pageOf(p));
  const { result: api } = await logged(t, () => fetchUcdp(TOKEN));
  const { result: files } = await logged(t, () => fetchUcdp(undefined));
  assert.equal(files.meta.mode, 'downloads');
  const strip = ({ candidateMode, candidateFile, ...d }) => d;
  assert.deepEqual(strip(api.data), strip(files.data));
});

for (const [status, reason] of [
  [401, 'The UCDP API refused the access token (HTTP 401).'],
  [403, 'The UCDP API refused the access token (HTTP 403).'],
  [429, 'The UCDP API daily request limit was reached (HTTP 429).'],
  [500, 'The UCDP API returned an error (HTTP 500).'],
]) {
  test(`HTTP ${status} from the API: one request, fall back to the download files, plain reason, no token`, async (t) => {
    // The error body echoes the token, as a careless server might.
    const calls = upstream(t, () => new Response(`denied for ${TOKEN}`, { status }));
    const { result, lines } = await logged(t, () => fetchUcdp(TOKEN));
    assert.equal(calls.filter((c) => c.url.startsWith('https://ucdpapi.pcr.uu.se/')).length, 1, 'no retry');
    assert.equal(result.meta.mode, 'downloads');
    assert.equal(result.meta.apiError, reason);
    assert.match(result.meta.modeNote, new RegExp(`^${reason.replace(/[().]/g, '\\$&')} Candidate events were read from UCDP's download file instead`));
    assert.equal(result.data.monthly.reduce((a, m) => a + m.events, 0), N);
    assert.ok(!JSON.stringify(result).includes(TOKEN), 'token in output');
    assert.ok(!lines.join('\n').includes(TOKEN), 'token in log');
    assert.ok(lines.some((l) => l.includes(reason)));
  });
}

test('no token: no API request, download files, and the page says why', async (t) => {
  const calls = upstream(t, () => assert.fail('API called without a token'));
  const { result } = await logged(t, () => fetchUcdp(''));
  assert.equal(calls.filter((c) => c.url.startsWith('https://ucdpapi.pcr.uu.se/')).length, 0);
  assert.equal(result.meta.mode, 'downloads');
  assert.equal(result.meta.apiError, null);
  assert.match(result.meta.modeNote, /because no API token is set/);
});

test('an incomplete or unexpected API answer falls back too', async (t) => {
  // Page 1 repeats page 0: fewer distinct events than TotalCount.
  upstream(t, () => pageOf(0));
  const { result } = await logged(t, () => fetchUcdp(TOKEN));
  assert.equal(result.meta.mode, 'downloads');
  assert.match(result.meta.apiError, /^The UCDP API answer was incomplete \(received 1000 distinct events of 1500\)\.$/);
  t.mock.restoreAll();
  upstream(t, () => new Response(JSON.stringify({ unexpected: true })));
  const { result: r2 } = await logged(t, () => fetchUcdp(TOKEN));
  assert.equal(r2.meta.apiError, 'The UCDP API answer had an unexpected format.');
});

test('apiReason never repeats the error message or body', () => {
  const err = Object.assign(new Error(`HTTP 401 from ucdpapi.pcr.uu.se: bad token ${TOKEN}`), { status: 401 });
  assert.ok(!apiReason(err).includes(TOKEN));
  assert.equal(apiReason(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'The UCDP API did not answer in time.');
  assert.equal(apiReason(new TypeError('fetch failed')), 'The UCDP API could not be reached.');
});

test('eventsFromApi stops before an oversized download', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ TotalCount: 100000, NextPageUrl: null, Result: [] })));
  await assert.rejects(eventsFromApi(TOKEN, '26.01.26.09'), /would take 100 requests/);
});

import { splitByMonth, summarise, toEvent } from '../scripts/fetch-ucdp.mjs';

test('a long event spreads its deaths over its months by days', () => {
  const parts = splitByMonth('2026-01-01', '2026-06-30');
  assert.deepEqual(parts.map((p) => p.month), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
  assert.equal(Math.round(parts[0].share * 181), 31);
  assert.equal(Math.round(parts[1].share * 181), 28);
  assert.equal(Math.round(parts.reduce((a, p) => a + p.share, 0) * 1e9) / 1e9, 1);
  assert.deepEqual(splitByMonth('2026-03-05', '2026-03-05'), [{ month: '2026-03', share: 1 }]);
  assert.deepEqual(splitByMonth('2026-03-05', '2026-03-01'), [{ month: '2026-03', share: 1 }]);
});

test('monthly totals keep every death; shares after the last covered month stay in it', () => {
  const ev = (date, end, deaths) => ({ date, end, deaths, type: 1, country: 'X', lat: 1, lon: 1 });
  const r = summarise([ev('2026-01-01', '2026-06-30', 181), ev('2026-02-10', '2026-02-10', 5), ev('2026-02-20', '2026-03-31', 0)]);
  // The file's newest start is in February: March–June shares stay in February.
  assert.deepEqual(r.monthly.map((m) => [m.month, m.deaths, m.events]), [['2026-01', 31, 1], ['2026-02', 155, 2]]);
  assert.equal(r.latestMonth, '2026-02');
});

test('deaths are always the best estimate, even when low is above high', () => {
  const e = toEvent({ date_start: '2026-01-08 00:00:00.000', date_end: '2026-01-10 00:00:00.000', type_of_violence: '3', best: '13280', low: '13280', high: '10680', country: 'Iran', latitude: '32', longitude: '53' });
  assert.equal(e.deaths, 13280);
  assert.equal(e.end, '2026-01-10');
});

test('the summary does not depend on event order; a border cell takes the country with most deaths', () => {
  const ev = (country, deaths, lat = 50.2) => ({ date: '2026-09-01', end: '2026-09-01', type: 1, deaths, country, lat, lon: 36.1 });
  const list = [ev('Russia', 2), ev('Ukraine', 9), ev('Russia', 3), ev('Sudan', 4, 15)];
  const a = summarise(list), b = summarise([...list].reverse());
  assert.deepEqual(a, b);
  assert.deepEqual(a.points.map((p) => [p.country, p.deaths, p.events]), [['Ukraine', 14, 3], ['Sudan', 4, 1]]);
  assert.equal(summarise([ev('Niger', 4), ev('Nigeria', 4)]).points[0].country, 'Niger');
});
