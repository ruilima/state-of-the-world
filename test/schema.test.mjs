// Schema tests.
//   npm test          — fixtures (raw upstream samples) and published files.
//   npm run test:live — also fetches every upstream now and fails if its
//                       format no longer matches what the scripts expect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { check } from '../scripts/lib/schema.mjs';
import { s } from '../scripts/lib/schema.mjs';
import { RAW, URLS } from '../scripts/lib/upstream.mjs';
import { OUTPUT } from '../scripts/lib/output-schema.mjs';
import { parseCsv, http, sleep } from '../scripts/lib/io.mjs';
import { parseExport } from '../scripts/fetch-gdelt-events.mjs';

const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const ok = (schema, value, label) => {
  const errors = check(schema, value);
  assert.deepEqual(errors, [], `${label}: ${errors.join('; ')}`);
};

test('fixture: USGS GeoJSON', () => ok(RAW.usgs, JSON.parse(fx('usgs.json')), 'usgs'));
test('fixture: NASA EONET v3', () => ok(RAW.eonet, JSON.parse(fx('eonet.json')), 'eonet'));
test('fixture: World Bank envelope', () => {
  const [meta, rows] = JSON.parse(fx('worldbank.json'));
  ok(RAW.worldBankMeta, meta, 'wb meta');
  ok(RAW.worldBankRows, rows, 'wb rows');
});
test('fixture: GDELT DOC artlist and timeline', () => {
  ok(RAW.gdeltArtList, JSON.parse(fx('gdelt-artlist.json')), 'artlist');
  ok(RAW.gdeltTimeline, JSON.parse(fx('gdelt-timeline.json')), 'timeline');
});
test('fixture: GDELT event export parses', () => {
  const b = parseExport(fx('gdelt-export.tsv'));
  assert.ok(b.total > 0);
});
test('fixture: UCDP candidate events and battle deaths CSV', () => {
  ok(s.arr(RAW.ucdpGedRow, { min: 1 }), parseCsv(fx('ucdp-ged.csv')), 'ged');
  ok(s.arr(RAW.ucdpBrdRow, { min: 1 }), parseCsv(fx('ucdp-brd.csv')), 'brd');
});
test('fixture: HN search', () => ok(RAW.hnSearch, JSON.parse(fx('hn.json')), 'hn'));

test('a renamed upstream field is detected', () => {
  const quake = JSON.parse(fx('usgs.json'));
  quake.features[0].properties.magnitude = quake.features[0].properties.mag;
  delete quake.features[0].properties.mag;
  assert.notDeepEqual(check(RAW.usgs, quake), []);
  assert.throws(() => parseExport('a\tb\tc\n'), /columns/);
});

test('published files in public/data match the output schemas', () => {
  const dir = new URL('../public/data/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
  assert.ok(files.length >= Object.keys(OUTPUT).length - 1, 'some data files are missing');
  for (const f of files) {
    const id = f.replace(/\.json$/, '');
    assert.ok(OUTPUT[id], `no output schema for ${f}`);
    ok(OUTPUT[id], JSON.parse(readFileSync(new URL(f, dir), 'utf8')), f);
  }
});

const live = process.env.LIVE ? test : test.skip;
const UA = { timeout: 60000, retries: 1 };

live('live: USGS', async () => ok(RAW.usgs, await http(URLS.usgs('significant_week'), UA), 'usgs'));
live('live: NASA EONET', async () => ok(RAW.eonet, await http(URLS.eonet, UA), 'eonet'));
live('live: World Bank', async () => {
  const [meta, rows] = await http(URLS.worldBank('WLD', 'FP.CPI.TOTL.ZG'), UA);
  ok(RAW.worldBankMeta, meta, 'wb meta');
  ok(RAW.worldBankRows, rows, 'wb rows');
});
live('live: HN search', async () => ok(RAW.hnSearch, await http(URLS.hnSearch('AI layoffs'), UA), 'hn'));
live('live: arXiv Atom feed', async () => {
  const xml = await http(URLS.arxiv, { ...UA, as: 'text' });
  assert.match(xml, /<feed[\s\S]*<entry>[\s\S]*<title>/);
});
live('live: GDELT event export', async () => {
  const line = (await http(URLS.gdeltLastUpdate, { ...UA, as: 'text' })).split('\n')[0];
  assert.match(line, /\d{14}\.export\.CSV\.zip/);
});
live('live: UCDP downloads page lists candidate GED and BRD files', async () => {
  const html = await http(URLS.ucdpDownloads, { ...UA, as: 'text' });
  assert.match(html, /candidateged\/GEDEvent_v\d+_01_\d+_\d+\.csv/);
  assert.match(html, /brd\/ucdp-brd-dyadic-\d+-csv\.zip/);
});
live('live: GDELT DOC (rate limits are tolerated, format changes are not)', async (t) => {
  try {
    await sleep(6000);
    const body = await http(`${URLS.gdeltDoc}?query=ceasefire&mode=artlist&format=json&timespan=24h&maxrecords=3`, { ...UA, retries: 0 });
    ok(RAW.gdeltArtList, body, 'gdelt doc');
  } catch (err) {
    if (err.status === 429 || /fetch failed|timeout/i.test(err.message)) return t.skip(`GDELT DOC unavailable: ${err.message.slice(0, 80)}`);
    throw err;
  }
});
