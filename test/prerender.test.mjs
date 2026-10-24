// The build writes the essential text into the deployed HTML (scripts/prerender.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prerenderIndex, prerenderMethod, sitemapXml } from '../scripts/prerender.mjs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const methodHtml = readFileSync(new URL('../public/how-the-index-works.html', import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-24T21:00:00Z');
const fresh = (min) => new Date(NOW - min * 60000).toISOString();

const index = {
  id: 'index', status: 'ok', fetchedAt: fresh(10), lastSuccessAt: fresh(10),
  data: {
    value: 38.8, state: 'caution', bpm: 79, thresholds: { caution: 40, danger: 65, hysteresis: 3 }, weightTotal: 80,
    signals: [
      { id: 'conflictDeaths', name: 'Deaths in organised violence', explain: 'x', value: 13588, calm: 5000, alarm: 25000, score: 42.9, weight: 30, effectiveWeight: 37.5, missing: null },
      { id: 'conflictNews', name: 'Conflict in the news', explain: 'y', value: 0.14, calm: 0.1, alarm: 0.16, score: 54, weight: 20, effectiveWeight: 25, missing: null },
    ],
  },
};
const files = (over = {}) => ({
  manifest: { generatedAt: '2026-10-24T20:39:52Z' },
  index,
  ucdp: { status: 'ok', lastSuccessAt: fresh(60), data: { monthly: [{ month: '2026-09', deaths: 13588, events: 1984 }] } },
  'gdelt-events': { status: 'ok', lastSuccessAt: fresh(10), data: {} },
  'gdelt-doc': { status: 'ok', data: { queries: { conflictHeadlines: { status: 'ok', items: [{ title: 'Talks <b>resume</b> & "hold"', url: 'https://example.com/a', domain: 'example.com', date: '2026-10-24T14:15:00Z' }] }, aiLayoffHeadlines: { status: 'ok', items: [{ title: 'No link', url: 'javascript:alert(1)', domain: 'x.org' }] } } } },
  usgs: { status: 'ok', lastSuccessAt: fresh(10), data: { counts: { m45Week: 175, m6Week: 5, significantWeek: 4 }, strongest: { mag: 7, place: '191 km ENE of Nagqu, China' } } },
  worldbank: { status: 'ok', lastSuccessAt: fresh(600), data: { indicators: [{ id: 'FP.CPI.TOTL.ZG', series: [{ country: 'WLD', latest: { year: 2025, value: 3.04 }, points: [{ year: 2025, value: 3.04 }] }] }] } },
  curated: { status: 'ok', lastSuccessAt: fresh(10), data: { layoffs: { monthly: [{ month: '2026-09', aiCited: 3961 }, { month: '2026-01', aiCited: 7624 }] }, doomsday: { current: { seconds: 85, setAt: '2026-01-27' }, history: [{ seconds: 90 }, { seconds: 85 }] } } },
  ...over,
});

test('the build writes the state, the index, the time and the five records', () => {
  const out = prerenderIndex(html, files(), NOW);
  assert.match(out, /id="updated">Updated 24\u00a0Oct\u00a02026, 20:39 UTC</);
  assert.match(out, /<p class="monitor__state is-caution" id="monitor-state" aria-live="polite" title="Holding CAUTION until below 37"><svg[^>]*>.*<\/svg>CAUTION<\/p>/);
  assert.match(out, /<dd id="monitor-index">39 of 100<\/dd>/);
  assert.match(out, /class="monitor__scale is-holding".*CAUTION held until &lt;37/);
  assert.match(out, /<dd class="monitor__hold" id="monitor-hold">holding CAUTION until below 37<\/dd>/);
  assert.match(out, /<section class="monitor has-lead"/);
  assert.match(out, /Biggest contribution now: Deaths in organised violence \(16\.1 of 38\.8 points\)/);
  for (const name of ['Armed conflict', 'Work and AI', 'Planet', 'Economy', 'What lies ahead']) assert.ok(out.includes(`<span class="rec__name">${name}</span>`), name);
  assert.ok(out.includes('13,588 deaths in September 2026 (provisional)'));
  assert.ok(out.includes('In September 2026, UCDP recorded 13,588 deaths (provisional) in organised violence, across 1,984 events.'));
  assert.ok(out.includes('<span class="big-number">85 seconds</span> to midnight on the Doomsday Clock, the closest it has ever been.'));
  // One live region, and the tablist stays empty for the script.
  assert.equal(out.split('aria-live').length - 1, 1);
  assert.match(out, /id="records-list"><\/div>/);
});

test('headline text is escaped and only http(s) links become links', () => {
  const out = prerenderIndex(html, files(), NOW);
  assert.ok(out.includes('Talks &lt;b&gt;resume&lt;/b&gt; &amp; &quot;hold&quot;'));
  assert.ok(!out.includes('<b>resume</b>'));
  assert.ok(!out.includes('javascript:alert'));
  assert.match(out, /<section class="ticker" id="ticker" aria-labelledby="ticker-title">/);
  // The loop copy is left for the script: headlines are written once.
  assert.match(out, /<ul class="ticker__list" aria-hidden="true"><\/ul>/);
});

test('no headlines: the strip stays hidden', () => {
  const out = prerenderIndex(html, files({ 'gdelt-doc': { status: 'error', data: null } }), NOW);
  assert.match(out, /<section class="ticker" id="ticker" aria-labelledby="ticker-title" hidden>/);
});

test('an outdated index gets the DATA OUTDATED stamp, marked for the script to replace, and no contribution line', () => {
  const old = { ...index, lastSuccessAt: new Date(NOW - 4 * 3600e3).toISOString() };
  const out = prerenderIndex(html, files({ index: old }), NOW);
  assert.match(out, /<p class="stamp stamp--stale" data-prerendered>/);
  assert.ok(!out.includes('Biggest contribution now'));
});

test('the method page gets the signals table and the thresholds', () => {
  const out = prerenderMethod(methodHtml, { fetchedAt: fresh(10), data: { ...index.data } });
  assert.match(out, /<div id="signals">\s*<p>Current index: <strong>38\.8<\/strong>/);
  assert.match(out, /<span data-t="caution">40<\/span>/);
});

test('the sitemap has dates only and no changefreq', () => {
  const xml = sitemapXml([{ loc: 'https://worldvitals.org/', lastmod: '2026-10-24' }, { loc: 'https://worldvitals.org/how-the-index-works', lastmod: null }]);
  assert.match(xml, /<loc>https:\/\/worldvitals\.org\/<\/loc>\n    <lastmod>2026-10-24<\/lastmod>/);
  assert.ok(!/changefreq|T\d\d:/.test(xml));
  assert.equal(xml.split('<lastmod>').length - 1, 1);
});
