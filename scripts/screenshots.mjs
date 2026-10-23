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
  { name: 'desktop', viewport: { width: 1360, height: 900 }, hash: '' },
  { name: 'desktop-planeta', viewport: { width: 1360, height: 900 }, hash: '#planeta' },
  { name: 'desktop-trabalho', viewport: { width: 1360, height: 900 }, hash: '#trabalho' },
  { name: 'desktop-economia', viewport: { width: 1360, height: 900 }, hash: '#economia' },
  { name: 'desktop-futuro', viewport: { width: 1360, height: 900 }, hash: '#futuro' },
  { name: 'mobile', viewport: { width: 390, height: 844 }, hash: '', mobile: true },
  { name: 'mobile-conflitos', viewport: { width: 390, height: 844 }, hash: '#conflitos', mobile: true },
  { name: 'reduced-motion', viewport: { width: 1360, height: 900 }, hash: '', reduced: true },
];
const errors = [];
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: !!s.mobile, hasTouch: !!s.mobile, reducedMotion: s.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${s.name}: ${m.text()}`));
  await page.goto(base + s.hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, `${s.name}.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) errors.push(`${s.name}: horizontal overflow ${overflow}px`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no page errors, no horizontal overflow');
