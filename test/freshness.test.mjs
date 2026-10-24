import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLate, stampFreshness, delayedNote, nextChallengerReport } from '../public/freshness.js';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const at = (min) => ({ status: 'ok', lastSuccessAt: new Date(NOW - min * 60000).toISOString() });

test('the monitor index is outdated after 90 minutes (3× its 30-minute refresh)', () => {
  assert.equal(isLate('index', at(30), NOW), false);
  assert.equal(isLate('index', at(90), NOW), false);
  assert.equal(isLate('index', at(91), NOW), true);
  assert.equal(isLate('index', { ...at(5), status: 'stale' }, NOW), true);
});

test('daily sources are delayed only after 3 days', () => {
  assert.equal(isLate('digest', at(2 * 1440), NOW), false);
  assert.equal(isLate('digest', at(3 * 1440 + 1), NOW), true);
});

// Files as the page loads them, all inside their windows at NOW.
const fresh = () => ({
  'gdelt-events': at(10),
  usgs: at(10),
  eonet: at(10),
  worldbank: at(1440),
  ucdp: { ...at(600), data: { monthly: [{ month: '2026-09', deaths: 1 }] } },
  curated: {
    ...at(10),
    data: {
      layoffs: {
        updatedAt: '2026-10-23',
        monthly: [{ month: '2026-09' }],
        releaseCalendar: { releases: [{ month: '2026-09', expectedAt: '2026-10-01' }, { month: '2026-10', expectedAt: '2026-11-05' }, { month: '2026-11', expectedAt: '2026-12-03' }] },
      },
      doomsday: { current: { setAt: '2026-01-27' } },
    },
  },
});

test('one delayed source keeps the state and names the source', () => {
  const f = fresh();
  f.ucdp = { ...at(4 * 1440), data: f.ucdp.data };
  const r = stampFreshness(['gdelt-events', 'ucdp'], f, NOW);
  assert.deepEqual(r, { outdated: false, late: ['UCDP'] });
  assert.equal(delayedNote(r.late), '1 source delayed: UCDP');
});

test('all delayed sources make the stamp DATA OUTDATED', () => {
  const f = fresh();
  assert.deepEqual(stampFreshness(['usgs', 'eonet'], f, NOW), { outdated: false, late: [] });
  f.usgs = at(91);
  f.eonet = { ...at(5), status: 'stale' };
  assert.deepEqual(stampFreshness(['usgs', 'eonet'], f, NOW), { outdated: true, late: ['USGS (earthquakes)', 'NASA EONET'] });
  assert.equal(delayedNote(['USGS (earthquakes)', 'NASA EONET']), '2 sources delayed: USGS (earthquakes) and NASA EONET');
});

test('the Challenger report is delayed 3 days after its release date', () => {
  const f = fresh();
  assert.equal(nextChallengerReport(f.curated.data.layoffs).expectedAt, '2026-11-05');
  assert.equal(stampFreshness(['layoffs'], f, Date.parse('2026-11-07T23:59:00Z')).outdated, false);
  assert.equal(stampFreshness(['layoffs'], f, Date.parse('2026-11-08T00:00:00Z')).outdated, true);
  // Adding the October row moves the due date to the December report.
  f.curated.data.layoffs.monthly.push({ month: '2026-10' });
  assert.equal(stampFreshness(['layoffs'], f, Date.parse('2026-11-08T00:00:00Z')).outdated, false);
  // A calendar with no report left is delayed.
  f.curated.data.layoffs.monthly.push({ month: '2026-11' });
  assert.equal(stampFreshness(['layoffs'], f, NOW).outdated, true);
});

test('UCDP is delayed when its newest month is more than 2 months old', () => {
  const f = fresh();
  f.ucdp.data.monthly = [{ month: '2026-08' }];
  assert.equal(stampFreshness(['ucdp'], f, NOW).outdated, false);
  f.ucdp.data.monthly = [{ month: '2026-07' }];
  assert.equal(stampFreshness(['ucdp'], f, NOW).outdated, true);
});

test('the Doomsday Clock is delayed 13 months after it was set', () => {
  const f = fresh();
  assert.equal(stampFreshness(['doomsday'], f, Date.parse('2027-02-26T00:00:00Z')).outdated, false);
  assert.equal(stampFreshness(['doomsday'], f, Date.parse('2027-02-28T00:00:00Z')).outdated, true);
});
