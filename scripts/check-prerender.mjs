// Checks the prerendered HTML (build/) against what the page draws with
// JavaScript: the same words in the masthead, the monitor, the headline
// strip, each record's key line and lede, and the method table. Also loads
// the page with JavaScript off and checks it still says the state and the
// five records. Serve build/ first, then:
//   node scripts/check-prerender.mjs [baseUrl]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:8092/';
const browser = await chromium.launch({ channel: 'chrome' });
const problems = [];
const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

const MONITOR = ['#updated', '#monitor-state', '#monitor-index', '#monitor-scale', '#monitor-hold', '#monitor-bpm', '#monitor-lead'];

async function snapshot(js, path) {
  const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${js ? 'js' : 'no-js'} ${path}: ${e.message}`));
  await page.goto(base + path, { waitUntil: 'load' });
  if (js && path === '') await page.waitForFunction(() => document.querySelector('[role=tabpanel]:not([hidden]) .paper'), null, { timeout: 120000 });
  if (js && path !== '') await page.waitForFunction(() => document.querySelector('#signals table'), null, { timeout: 60000 });
  const out = await page.evaluate((MONITOR) => {
    const text = (sel) => document.querySelector(sel)?.textContent ?? null;
    return {
      monitor: Object.fromEntries(MONITOR.map((s) => [s, text(s)])),
      ticker: text('.ticker__list'),
      tickerHidden: document.getElementById('ticker')?.hidden ?? null,
      // Prerendered summary, or the drawn records.
      keys: [...document.querySelectorAll('.records__static-list .rec__key, .records__list[role=tablist] .rec__key')].map((e) => e.textContent),
      ledes: [...document.querySelectorAll('.records__static .paper section p:last-child, .dossier:not(.records__static) .paper .lede')].map((e) => e.textContent),
      signals: text('#signals'),
      prerendered: document.querySelectorAll('[data-prerendered]').length,
      liveRegions: document.querySelectorAll('[aria-live]').length,
      stateShapes: document.querySelectorAll('#monitor-state svg').length,
    };
  }, MONITOR);
  await ctx.close();
  return out;
}

const [pre, drawn] = [await snapshot(false, ''), await snapshot(true, '')];
for (const sel of MONITOR) if (norm(pre.monitor[sel]) !== norm(drawn.monitor[sel])) problems.push(`${sel}: build "${norm(pre.monitor[sel])}" ≠ page "${norm(drawn.monitor[sel])}"`);
if (norm(pre.ticker) !== norm(drawn.ticker)) problems.push('headline strip text differs');
if (pre.tickerHidden !== drawn.tickerHidden) problems.push('headline strip shown in one and hidden in the other');
if (pre.keys.join('|') !== drawn.keys.join('|')) problems.push(`record key lines differ:\n  build ${pre.keys.join(' | ')}\n  page  ${drawn.keys.join(' | ')}`);
if (pre.ledes.map(norm).join('|') !== drawn.ledes.map(norm).join('|')) problems.push(`ledes differ:\n  build ${pre.ledes.map(norm).join(' | ')}\n  page  ${drawn.ledes.map(norm).join(' | ')}`);
if (drawn.prerendered) problems.push(`${drawn.prerendered} prerendered elements left after the script ran`);
if (drawn.stateShapes !== 1) problems.push(`the state word has ${drawn.stateShapes} shapes`);
if (pre.keys.length !== 5 || !norm(pre.monitor['#monitor-state'])) problems.push('without JavaScript the page does not show the state and five records');

const [mPre, mDrawn] = [await snapshot(false, 'how-the-index-works.html'), await snapshot(true, 'how-the-index-works.html')];
if (norm(mPre.signals) !== norm(mDrawn.signals)) problems.push('method table differs between the build and the page');

await browser.close();
console.log(`without JS: state "${norm(pre.monitor['#monitor-state'])}", index "${norm(pre.monitor['#monitor-index'])}", ${pre.keys.length} records`);
console.log(problems.length ? problems.join('\n') : 'prerendered text matches the page');
process.exitCode = problems.length ? 1 : 0;
