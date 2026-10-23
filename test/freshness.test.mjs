import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLate } from '../public/freshness.js';

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
