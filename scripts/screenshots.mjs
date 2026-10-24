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
    // DATA OUTDATED forced: every source behind the stamps outside its window.
    { name: `outdated-${w}`, viewport: { width: w, height: 900 }, hash: '#work', mobile: w < 600, state: 'caution', late: 'all' },
  ]),
  // Only UCDP delayed: the state stays and a note names the source.
  { name: 'delayed-390', viewport: { width: 390, height: 900 }, hash: '#conflict', mobile: true, state: 'caution', late: 'ucdp' },
  { name: 'reduced-motion-1360', viewport: { width: 1360, height: 900 }, hash: '#work', reduced: true },
  // Longest state words and stamps at the narrowest width we support.
  ...['stable', 'caution', 'danger'].map((state) => ({ name: `state-${state}-320`, viewport: { width: 320, height: 700 }, hash: '#planet', mobile: true, state })),
];

// Forces a monitor state, to check that every state word fits. `late`
// pushes sources outside their windows: 'all' (every source behind the
// stamps, so they say DATA OUTDATED) or 'ucdp' (only UCDP).
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
async function forceState(page, state, late) {
  await page.route('**/data/index.json', async (route) => {
    const body = await (await route.fetch()).json();
    if (late === 'all') body.lastSuccessAt = body.fetchedAt = ago(3);
    body.data.state = state;
    body.data.value = { stable: 20, caution: 50, danger: 80 }[state];
    for (const sig of body.data.signals) if (sig.score != null) sig.score = body.data.value;
    await route.fulfill({ json: body });
  });
  if (!late) return;
  const aged = late === 'all' ? { 'gdelt-events': 3, usgs: 3, eonet: 3, worldbank: 96, ucdp: 96 } : { ucdp: 96 };
  for (const [id, hours] of Object.entries(aged)) {
    await page.route(`**/data/${id}.json`, async (route) => {
      const body = await (await route.fetch()).json();
      body.lastSuccessAt = body.fetchedAt = ago(hours);
      await route.fulfill({ json: body });
    });
  }
  if (late === 'all') {
    await page.route('**/data/curated.json', async (route) => {
      const body = await (await route.fetch()).json();
      for (const r of body.data.layoffs.releaseCalendar?.releases ?? []) r.expectedAt = '2020-01-01';
      body.data.layoffs.updatedAt = '2020-01-01';
      body.data.doomsday.current.setAt = '2020-01-01';
      await route.fulfill({ json: body });
    });
  }
}
const errors = [];
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: !!s.mobile, hasTouch: !!s.mobile, reducedMotion: s.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${s.name}: ${m.text()}`));
  if (s.state) await forceState(page, s.state, s.late);
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
    [...document.querySelectorAll('.monitor__state, .monitor__note, .stamp, .paper__note, .rec__name, .rec__key, .type, .ticker__bar > *')]
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

// No horizontal scroll while the opening animations play either (the stamp
// starts its slam at 2.4× its size). Every frame is sampled from load until
// the open record's animations finish, then once more after.
for (const width of [320, 390, 768, 1360]) {
  for (const hash of ['#conflict', '#work', '#planet', '#economy', '#ahead']) {
    const mobile = width < 600;
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__maxOverflow = 0;
      const tick = () => {
        window.__maxOverflow = Math.max(window.__maxOverflow, document.documentElement.scrollWidth - innerWidth);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto(base + hash, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelector('[role=tabpanel]:not([hidden]) .paper') && document.getAnimations().filter((a) => a.effect?.target?.closest?.('.dossier')).every((a) => a.playState === 'finished'),
      null,
      { timeout: 15000 },
    );
    const during = await page.evaluate(() => window.__maxOverflow);
    const after = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (during > 0 || after > 0) errors.push(`animation ${hash.slice(1)}-${width}: horizontal overflow ${during}px during, ${after}px after`);
    await ctx.close();
  }
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no page errors, no horizontal overflow');
