// Cron trigger Worker: runs in Node with a mocked fetch, no network, no token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runScheduled, SCHEDULE } from '../src/index.js';

const TOKEN = 'github_pat_TEST_ONLY_1234567890';

function capture(t) {
  const lines = [];
  t.mock.method(console, 'log', (m) => lines.push(String(m)));
  t.mock.method(console, 'error', (m) => lines.push(String(m)));
  return lines;
}

test('the 30-minute cron dispatches the fast group on main, once', async (t) => {
  const logs = capture(t);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 204 });
  };
  const r = await runScheduled('7,37 * * * *', { GITHUB_TOKEN: TOKEN, DRY_RUN: 'false' }, fetchImpl);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/ruilima/state-of-the-world/actions/workflows/update.yml/dispatches');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(calls[0].init.headers['User-Agent']);
  assert.deepEqual(JSON.parse(calls[0].init.body), { ref: 'main', inputs: { group: 'fast' } });
  assert.deepEqual(r, { dryRun: false, group: 'fast', status: 204 });
  assert.ok(logs.some((l) => l.includes('"status":204')), 'logs the response status');
  assert.ok(!logs.join('\n').includes(TOKEN), 'never logs the token');
});

test('the daily cron dispatches the slow group (World Bank, UCDP, AI summary)', async (t) => {
  capture(t);
  let body;
  await runScheduled('23 5 * * *', { GITHUB_TOKEN: TOKEN }, async (_u, init) => {
    body = JSON.parse(init.body);
    return new Response(null, { status: 204 });
  });
  assert.deepEqual(body, { ref: 'main', inputs: { group: 'slow' } });
});

test('a GitHub error fails the run, logs the status, and still hides the token', async (t) => {
  const logs = capture(t);
  await assert.rejects(
    runScheduled('7,37 * * * *', { GITHUB_TOKEN: TOKEN }, async () => new Response('{"message":"Bad credentials"}', { status: 401 })),
    /401/,
  );
  assert.ok(logs.some((l) => l.includes('"status":401') && l.includes('Bad credentials')));
  assert.ok(!logs.join('\n').includes(TOKEN));
});

test('dry run logs the request and never calls GitHub', async (t) => {
  const logs = capture(t);
  const r = await runScheduled('7,37 * * * *', { DRY_RUN: 'true' }, async () => assert.fail('fetch must not be called'));
  assert.deepEqual(r, { dryRun: true, group: 'fast' });
  assert.ok(logs.some((l) => l.includes('"event":"dry-run"') && l.includes('"group":"fast"')));
});

test('a missing secret or an unknown cron is an error, not a silent no-op', async (t) => {
  capture(t);
  await assert.rejects(runScheduled('7,37 * * * *', {}, async () => assert.fail()), /GITHUB_TOKEN/);
  await assert.rejects(runScheduled('0 0 * * *', { GITHUB_TOKEN: TOKEN }, async () => assert.fail()), /no workflow group/);
});

test('wrangler.toml crons and workflow group options match the Worker schedule', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const crons = JSON.parse(toml.match(/crons\s*=\s*(\[.*\])/)[1]);
  assert.deepEqual([...crons].sort(), Object.keys(SCHEDULE).sort());
  const workflow = readFileSync(new URL('../../.github/workflows/update.yml', import.meta.url), 'utf8');
  const options = workflow.match(/options:\s*\[(.*?)\]/)[1].split(',').map((s) => s.trim());
  for (const group of Object.values(SCHEDULE)) assert.ok(options.includes(group), `workflow has no group "${group}"`);
  assert.match(workflow, /concurrency:\s*\n\s*group: data-update\s*\n\s*cancel-in-progress: false/);
  // The Worker is the only scheduler; a `schedule:` trigger would run every slot twice.
  assert.ok(!/^\s*schedule:/m.test(workflow), 'workflow must not have a schedule trigger');
  assert.ok(!/github_pat_|ghp_/.test(toml), 'no token in wrangler.toml');
});
