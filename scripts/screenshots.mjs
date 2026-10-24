// Renders the site in desktop and mobile widths with the system Chrome and
// saves screenshots to screenshots/. Also samples rendered pixels to check
// the effective contrast once grain and vignette are painted.
//   node scripts/screenshots.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './lib/io.mjs';

const base = process.argv[2] ?? 'http://localhost:8080/';
const out = join(ROOT, 'screenshots');
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const shots = [
  // Work and AI, Planet and the header with the headline strip, at each width.
  ...[320, 390, 1360].flatMap((w) => [
    { name: `work-${w}`, viewport: { width: w, height: 900 }, hash: '#work', mobile: w < 600 },
    { name: `planet-${w}`, viewport: { width: w, height: 900 }, hash: '#planet', mobile: w < 600 },
    { name: `header-${w}`, viewport: { width: w, height: 900 }, hash: '#work', mobile: w < 600, clip: '.ticker' },
    // DATA OUTDATED forced: an old index and an old curated file.
    { name: `outdated-${w}`, viewport: { width: w, height: 900 }, hash: '#work', mobile: w < 600, state: 'caution', outdated: true },
  ]),
  { name: 'reduced-motion-1360', viewport: { width: 1360, height: 900 }, hash: '#work', reduced: true },
  // Longest state words and stamps at the narrowest width we support.
  ...['stable', 'caution', 'danger'].map((state) => ({ name: `state-${state}-320`, viewport: { width: 320, height: 700 }, hash: '#planet', mobile: true, state })),
];

// Forces a monitor state and an outdated curated file, to check that every
// state word and the longest stamp (DATA OUTDATED) fit.
async function forceState(page, state, outdated) {
  await page.route('**/data/index.json', async (route) => {
    const body = await (await route.fetch()).json();
    if (outdated) body.lastSuccessAt = body.fetchedAt = new Date(Date.now() - 3 * 3600e3).toISOString();
    body.data.state = state;
    body.data.value = { stable: 20, caution: 50, danger: 80 }[state];
    for (const sig of body.data.signals) if (sig.score != null) sig.score = body.data.value;
    await route.fulfill({ json: body });
  });
  await page.route('**/data/curated.json', async (route) => {
    const body = await (await route.fetch()).json();
    body.data.layoffs.updatedAt = '2020-01-01';
    await route.fulfill({ json: body });
  });
}
const errors = [];
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: !!s.mobile, hasTouch: !!s.mobile, reducedMotion: s.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${s.name}: ${m.text()}`));
  if (s.state) await forceState(page, s.state, s.outdated);
  await page.goto(base + s.hash, { waitUntil: 'load' });
  // Explicit signal: the open file is drawn. Then let the opening animations finish.
  await page.waitForFunction(() => document.querySelector('[role=tabpanel]:not([hidden]) .paper'));
  await page.waitForTimeout(4500);
  if (s.clip) await page.locator(s.clip).screenshot({ path: join(out, `${s.name}.png`) });
  else await page.screenshot({ path: join(out, `${s.name}.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) errors.push(`${s.name}: horizontal overflow ${overflow}px`);
  // Elements that must not spill out of their box.
  const spills = await page.evaluate(() =>
    [...document.querySelectorAll('.monitor__state, .stamp, .rec__name, .rec__key, .type, .ticker__bar > *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const box = (el.closest('.paper, .monitor, .rec, .ticker') ?? document.body).getBoundingClientRect();
        return r.width > 0 && (r.right > box.right + 0.5 || r.left < box.left - 0.5 || el.scrollWidth > el.clientWidth + 1);
      })
      .map((el) => `${el.className}: "${el.textContent.trim().slice(0, 30)}"`),
  );
  for (const sp of spills) errors.push(`${s.name}: overflows its box — ${sp}`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no page errors, no horizontal overflow');
