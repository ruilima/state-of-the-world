import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contributions, biggestContribution } from '../public/derive.js';

const index = {
  value: 37.6,
  signals: [
    { id: 'conflictDeaths', name: 'Deaths in organised violence', score: 41.4, effectiveWeight: 37.5 },
    { id: 'conflictNews', name: 'Conflict in the news', score: 54, effectiveWeight: 25 },
    { id: 'aiLayoffs', name: 'Pace of job cuts citing AI', score: 0, effectiveWeight: 12.5 },
    { id: 'quakes', name: 'Significant earthquakes', score: null, effectiveWeight: 0 },
  ],
};

test('points are score × effective weight and add up to the index', () => {
  const c = contributions(index);
  assert.deepEqual(c.map((x) => x.id), ['conflictDeaths', 'conflictNews', 'aiLayoffs']);
  assert.equal(Math.round(c[0].points * 100) / 100, 15.53);
  assert.equal(biggestContribution(index), 'Deaths in organised violence (15.5 of 37.6 points)');
});

test('no contribution line without a value', () => {
  assert.equal(biggestContribution({ value: null, signals: [] }), null);
});

test('each record names the period its data covers', async () => {
  const { dataPeriod } = await import('../public/derive.js');
  const f = {
    ucdp: { data: { monthly: [{ month: '2026-08' }, { month: '2026-09' }] } },
    curated: { data: { layoffs: { monthly: [{ month: '2026-09' }, { month: '2026-01' }] }, doomsday: { current: { setAt: '2026-01-27' } } } },
    usgs: { data: {} },
    worldbank: { data: { indicators: [{ series: [{ latest: { year: 2024 } }, { latest: { year: 2025 } }] }] } },
  };
  assert.equal(dataPeriod('conflict', f), 'Sep 2026');
  assert.equal(dataPeriod('work', f), 'Sep 2026');
  assert.equal(dataPeriod('planet', f), 'last 7 days');
  assert.equal(dataPeriod('economy', f), '2025');
  assert.equal(dataPeriod('ahead', f), 'Jan 2026');
  assert.equal(dataPeriod('conflict', {}), null);
});

test('"the closest it has ever been" only when the current setting is the minimum', async () => {
  const { closestEver, clockReading } = await import('../public/derive.js');
  const { readFileSync } = await import('node:fs');
  const dd = JSON.parse(readFileSync(new URL('../data/curated/doomsday.json', import.meta.url)));
  assert.equal(dd.history[0].year, 1947);
  assert.equal(dd.history[0].seconds, 420);
  assert.equal(closestEver(dd), true); // 85 s in 2026
  assert.equal(closestEver({ ...dd, current: { ...dd.current, seconds: 90 } }), false);
  assert.equal(clockReading(420), '7 minutes');
  assert.equal(clockReading(150), '2.5 minutes');
  assert.equal(clockReading(100), '100 seconds');
});

test('the Planet lede names the M4.5+, M6+ and significant counts', async () => {
  const { quakeSummary } = await import('../public/derive.js');
  assert.equal(
    quakeSummary({ m45Week: 1167, m6Week: 5, significantWeek: 4, significantMonth: 18 }),
    '1,167 earthquakes of magnitude 4.5 or more in the last 7 days, 5 of magnitude 6 or more. USGS classed 4 as significant, the number the Condition Index uses.',
  );
});

test('the phone line names the main driver by its short name', async () => {
  const { mainDriver } = await import('../public/derive.js');
  assert.equal(mainDriver(index), 'conflict deaths');
  assert.equal(mainDriver({ value: null, signals: [] }), null);
});
