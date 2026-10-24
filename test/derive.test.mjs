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
