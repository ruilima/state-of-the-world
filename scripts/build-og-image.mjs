// One-off: renders the Open Graph share image (1200×630) to
// public/assets/og-image.png with the system Chrome. Original artwork only:
// the site's insignia, its name and a static monitor trace, in the palette
// from config/palette.json and the site's own fonts.
// Run again after a brand change: node scripts/build-og-image.mjs
import { chromium } from 'playwright-core';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/io.mjs';

const c = JSON.parse(readFileSync(join(ROOT, 'config', 'palette.json'), 'utf8')).colors;
const OUT = join(ROOT, 'public', 'assets', 'og-image.png');

// Same beat shape as public/ecg.js, drawn once at a steady rhythm.
const gauss = (x, mu, sd) => Math.exp(-((x - mu) ** 2) / (2 * sd * sd));
const beat = (p) => 0.12 * gauss(p, 0.15, 0.025) - 0.12 * gauss(p, 0.27, 0.008) + gauss(p, 0.3, 0.01) - 0.25 * gauss(p, 0.325, 0.01) + 0.28 * gauss(p, 0.5, 0.045);
const W = 1064, H = 220, MID = 140, AMP = 100, PERIOD = 250;
let d = '';
for (let x = 0; x <= W; x++) d += `${x ? 'L' : 'M'}${x} ${(MID - beat((x % PERIOD) / PERIOD) * AMP).toFixed(1)}`;
let grid = '';
for (let x = 0; x <= W; x += 38) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
for (let y = 0; y <= H; y += 44) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&family=Courier+Prime&display=block">
<style>
  html, body { margin: 0; }
  body { width: 1200px; height: 630px; background: ${c.tile}; color: ${c.tube}; position: relative; overflow: hidden; font-family: 'Courier Prime', monospace; }
  .brand { position: absolute; left: 68px; top: 56px; display: flex; align-items: center; gap: 28px; }
  .brand svg { width: 112px; height: 112px; }
  h1 { margin: 0; font: 800 124px/0.9 'Big Shoulders Display', sans-serif; letter-spacing: 0.01em; }
  p { margin: 14px 0 0; font-size: 34px; color: ${c['tube-low']}; }
  .monitor { position: absolute; left: 66px; right: 66px; bottom: 56px; height: 236px; border: 3px solid ${c['tube-low']}; background: rgb(14 16 11 / 0.55); }
  .monitor svg { position: absolute; left: 0; top: 6px; width: 100%; height: 220px; }
  .grid line { stroke: ${c['tube-low']}; stroke-opacity: 0.18; stroke-width: 1; }
</style></head><body>
  <div class="brand">
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="20" cy="20" r="17" stroke-width="2.5"/>
      <ellipse cx="20" cy="20" rx="7.5" ry="17" stroke-width="1.2" opacity=".55"/>
      <path d="M3 20h9l3-7 4 14 3-10 2 3h13" stroke-width="2.5"/>
    </svg>
    <div><h1>World Vitals</h1><p>Signs of a world in transition</p></div>
  </div>
  <div class="monitor">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <g class="grid">${grid}</g>
      <path d="${d}" fill="none" stroke="${c.tube}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
  </div>
</body></html>`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();
console.log(`og-image.png: 1200×630, ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
