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

test('the Doomsday Clock is context only, not an index signal', () => {
  const config = JSON.parse(readFileSync(new URL('../config/index.json', import.meta.url)));
  assert.ok(config.signals.every((s) => s.id !== 'doomsday' && !/doomsday/.test(s.path ?? '')));
});

test('the conflict signal comes only from the GDELT 15-minute event files, never the DOC API', () => {
  const config = JSON.parse(readFileSync(new URL('../config/index.json', import.meta.url)));
  assert.equal(config.signals.find((s) => s.id === 'conflictNews').source, 'gdelt-events');
  assert.ok(config.signals.every((s) => s.source !== 'gdelt-doc'), 'no index signal may read gdelt-doc');
});

test('the Challenger signal is left out 3 days after the next report was due, not by file age', () => {
  const config = JSON.parse(readFileSync(new URL('../config/index.json', import.meta.url)));
  const monthly = Array.from({ length: 9 }, (_, i) => ({ month: `2026-0${i + 1}`, aiCited: 1000, publishedAt: '2026-10-01' }));
  const curated = (now) => ({
    lastSuccessAt: new Date(now).toISOString(), // rebuilt every run: always fresh
    data: { layoffs: { monthly, releaseCalendar: { releases: [{ month: '2026-10', expectedAt: '2026-11-05' }] } } },
  });
  const sig = (now) => computeIndex(config, { curated: curated(now) }, now).signals.find((s) => s.id === 'aiLayoffs');
  const inTime = Date.parse('2026-11-07T23:00:00Z');
  const late = Date.parse('2026-11-08T00:00:01Z');
  assert.equal(sig(inTime).score, 16.7); // ratio 1: (1 - 0.8) / (2.0 - 0.8)
  assert.equal(sig(inTime).ageBasis, 'report');
  assert.equal(sig(inTime).dueAt, '2026-11-05');
  assert.equal(sig(late).score, null);
  assert.match(sig(late).missing, /due on 2026-11-05/);
});
