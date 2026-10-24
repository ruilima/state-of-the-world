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

test('the hold note shows only while the margin keeps a state, on both sides', async () => {
  const { holdNote } = await import('../public/derive.js');
  const t = { caution: 40, danger: 65, hysteresis: 3 };
  // Holding a higher state on the way down.
  assert.equal(holdNote(39, 'caution', t), 'holding CAUTION until below 37');
  assert.equal(holdNote(63, 'danger', t), 'holding DANGER until below 62');
  // Holding a lower state on the way up.
  assert.equal(holdNote(41, 'stable', t), 'holding STABLE until 43');
  assert.equal(holdNote(66, 'caution', t), 'holding CAUTION until 68');
  // The state matches the index: no note.
  assert.equal(holdNote(45, 'caution', t), null);
  assert.equal(holdNote(36.9, 'stable', t), null);
  assert.equal(holdNote(null, 'caution', t), null);
});

test('on narrow screens the thresholds line turns into the hold note, and back', async () => {
  const { scaleLine } = await import('../public/derive.js');
  const t = { caution: 40, danger: 65, hysteresis: 3 };
  assert.deepEqual(scaleLine(39, 'caution', t), { text: 'CAUTION held until <37', holding: true });
  assert.deepEqual(scaleLine(63, 'danger', t), { text: 'DANGER held until <62', holding: true });
  assert.deepEqual(scaleLine(41, 'stable', t), { text: 'STABLE held until 43', holding: true });
  assert.deepEqual(scaleLine(66, 'caution', t), { text: 'CAUTION held until 68', holding: true });
  assert.deepEqual(scaleLine(45, 'caution', t), { text: 'caution ≥40, danger ≥65', holding: false });
  // Never wider than the thresholds line it replaces (same font, monospace).
  for (const [v, s] of [[39, 'caution'], [63, 'danger'], [41, 'stable'], [66, 'caution']]) assert.ok(scaleLine(v, s, t).text.length <= 'caution ≥40, danger ≥65'.length);
});

test('the temperature lede is written from the data', async () => {
  const { climateLede } = await import('../public/derive.js');
  const months = Array.from({ length: 24 }, (_, i) => ({ month: `2026-${String((i % 9) + 1).padStart(2, '0')}`, anomaly: 1.4, absolute: 15 }));
  months[23] = { month: '2026-09', anomaly: 1.634, absolute: 16.27 };
  const c = { months, twelveMonth: { value: 1.5, from: '2025-10', to: '2026-09', basis: 'bulletin text' }, rank: { position: 2, of: 87, since: '1940', warmerYears: ['2023'] } };
  assert.equal(climateLede(c), 'September 2026 was 1.63\u00a0°C above the 1850–1900 average, the second-warmest September on record (after 2023). Average of the last 12 months: 1.50\u00a0°C (C3S).');
  assert.match(climateLede({ ...c, rank: { position: 1, warmerYears: [] } }), /, the warmest September on record\. /);
  // Without C3S's 12-month figure the sentence is left out; our own mean is never used.
  assert.equal(climateLede({ ...c, twelveMonth: null }), 'September 2026 was 1.63\u00a0°C above the 1850–1900 average, the second-warmest September on record (after 2023).');
  assert.match(climateLede({ ...c, rank: { position: 3, warmerYears: ['2023', '2024'] } }), /the third-warmest September on record \(after 2023 and 2024\)/);
  assert.match(climateLede({ ...c, rank: { position: 12, warmerYears: Array(11).fill('x') } }), /the 12th-warmest September on record\. /);
});
