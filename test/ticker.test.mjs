import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickHeadlines } from '../public/ticker.js';

const q = (n, p) => ({ status: 'ok', items: Array.from({ length: n }, (_, i) => ({ title: `${p}${i}`, date: '2026-10-24T14:15:00Z' })) });

test('headlines alternate topics, carry their topic and stop at the limit', () => {
  const items = pickHeadlines([{ topic: 'Conflict', query: q(3, 'c') }, { topic: 'Work & AI', query: q(1, 'w') }], 16);
  assert.deepEqual(items.map((i) => `${i.topic}:${i.title}`), ['Conflict:c0', 'Work & AI:w0', 'Conflict:c1', 'Conflict:c2']);
  assert.equal(pickHeadlines([{ topic: 'Conflict', query: q(30, 'c') }], 16).length, 16);
  assert.equal(pickHeadlines([{ topic: 'Conflict', query: null }]).length, 0);
});
