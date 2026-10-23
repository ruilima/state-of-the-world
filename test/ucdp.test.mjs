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
