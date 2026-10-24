// The UCDP API needs the token in the x-ucdp-access-token header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsFromApi } from '../scripts/fetch-ucdp.mjs';

test('UCDP API requests send the token in the x-ucdp-access-token header', async (t) => {
  const seen = [];
  const page = { TotalCount: 1, NextPageUrl: null, Result: [{ id: 1, date_start: '2026-09-01', type_of_violence: 1, best: 3, country: 'Sudan', latitude: 15, longitude: 30 }] };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    seen.push({ url: String(url), token: init.headers['x-ucdp-access-token'] });
    return new Response(JSON.stringify(page), { status: 200 });
  });
  const events = await eventsFromApi('test-token', '26.0.9', 2026);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].token, 'test-token');
  assert.match(seen[0].url, /^https:\/\/ucdpapi\.pcr\.uu\.se\/api\/gedevents\/26\.0\.9\?pagesize=1000&StartDate=2026-01-01$/);
  assert.equal(events[0].deaths, 3);
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
