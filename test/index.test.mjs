import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextState, scale, getPath, computeIndex } from '../scripts/compute-index.mjs';

const cfg = { caution: 40, danger: 65, hysteresis: 3 };

test('scale clamps between calm and alarm, also when alarm < calm', () => {
  assert.equal(scale(5, 0, 10), 50);
  assert.equal(scale(-1, 0, 10), 0);
  assert.equal(scale(99, 0, 10), 100);
  assert.equal(scale(85, 420, 60), 93.1);
});

test('hysteresis keeps the state inside the band', () => {
  assert.equal(nextState(null, 41, cfg), 'caution');
  assert.equal(nextState('stable', 41, cfg), 'stable'); // needs 43 to go up
  assert.equal(nextState('stable', 43, cfg), 'caution');
  assert.equal(nextState('caution', 38, cfg), 'caution'); // needs < 37 to go down
  assert.equal(nextState('caution', 36.9, cfg), 'stable');
  assert.equal(nextState('caution', 67, cfg), 'caution'); // needs 68 to go up
  assert.equal(nextState('caution', 68, cfg), 'danger');
  assert.equal(nextState('danger', 63, cfg), 'danger');
  assert.equal(nextState('danger', 61, cfg), 'caution');
  assert.equal(nextState('danger', 30, cfg), 'stable');
});

test('getPath supports negative array indices', () => {
  assert.equal(getPath({ data: { m: [{ v: 1 }, { v: 2 }] } }, 'data.m[-1].v'), 2);
});

test('missing signals are dropped and weights rescaled', () => {
  const config = JSON.parse(readFileSync(new URL('../config/index.json', import.meta.url)));
  const now = Date.now();
  const fresh = new Date(now).toISOString();
  const r = computeIndex(config, { usgs: { lastSuccessAt: fresh, data: { counts: { significantWeek: 8 } } } }, now);
  assert.equal(r.value, 100);
  assert.equal(r.signals.find((s) => s.id === 'quakes').effectiveWeight, 100);
});

test('the conflict signal comes only from the GDELT 15-minute event files, never the DOC API', () => {
  const config = JSON.parse(readFileSync(new URL('../config/index.json', import.meta.url)));
  assert.equal(config.signals.find((s) => s.id === 'conflictNews').source, 'gdelt-events');
  assert.ok(config.signals.every((s) => s.source !== 'gdelt-doc'), 'no index signal may read gdelt-doc');
});
