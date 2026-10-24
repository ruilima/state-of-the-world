// Measures contrast on the rendered page, not on the hex values: grain and
// vignette shift the real background. For each surface, blank strips are
// screenshotted, and the worst background pixel (the one closest in
// luminance to the text colour) is compared with each text colour used on it.
//   node scripts/measure-contrast.mjs [baseUrl]   (needs scripts/serve.mjs running)
import { chromium } from 'playwright-core';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/io.mjs';

const base = process.argv[2] ?? 'http://localhost:8080/';
const palette = JSON.parse(readFileSync(join(ROOT, 'config', 'palette.json'), 'utf8')).colors;

// Minimal PNG decoder for Chrome screenshots (8-bit RGB/RGBA, no interlace).
function decodePng(buf) {
  let pos = 8, width, height, channels;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = data[9] === 6 ? 4 : 3; }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y ? out[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, channels, pixels: out };
}

const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

// Surface -> text colours drawn on it, and how to find blank strips of it.
const SURFACES = [
  { name: 'room (header)', fg: ['tube', 'tube-low'], rect: () => { const a = document.querySelector('.masthead__name').getBoundingClientRect(), b = document.querySelector('.masthead__time').getBoundingClientRect(); return { x: a.right + 20, y: a.top, width: b.left - a.right - 40, height: a.height }; } },
  { name: 'room (records column)', fg: ['tube', 'tube-low'], rect: () => { const s = [...document.querySelectorAll('.rec')].at(-1).getBoundingClientRect(), r = document.querySelector('.records').getBoundingClientRect(); return { x: s.left, y: s.bottom + 20, width: s.width, height: Math.min(400, r.bottom - s.bottom - 40) }; } },
  { name: 'open record', fg: ['tube', 'tube-low'], rect: () => { const s = document.querySelector('.rec[aria-selected="true"]').getBoundingClientRect(); return { x: s.left + 6, y: s.bottom - 6, width: s.width - 12, height: 4 }; } },
  { name: 'headline strip', fg: ['tube', 'tube-low'], rect: () => { const s = document.querySelector('.ticker__bar').getBoundingClientRect(), t = document.querySelector('.ticker__title').getBoundingClientRect(); return { x: t.right + 4, y: s.top + 2, width: 4, height: s.height - 4 }; } },
  { name: 'room (footer)', fg: ['tube', 'tube-low'], rect: () => { const f = document.querySelector('.footer').getBoundingClientRect(); return { x: f.left, y: f.bottom - 30, width: f.width, height: 24 }; } },
  { name: 'monitor', fg: ['tube', 'tube-low', 'stable', 'caution', 'danger-light'], rect: () => { const m = document.querySelector('.monitor').getBoundingClientRect(); return { x: m.left + 4, y: m.bottom - 18, width: m.width - 8, height: 14 }; } },
  { name: 'paper', fg: ['ink', 'ink-faded', 'stable-ink', 'caution-ink', 'danger-ink'], rect: () => { const p = document.querySelector('.dossier:not([hidden]) .paper').getBoundingClientRect(); return { x: p.left + 4, y: p.bottom - 22, width: p.width - 8, height: 18 }; } },
];

// COMPARE=1 also measures the state colours on the bare room header, where
// the page never uses them, to compare against the darker monitor surface.
if (process.env.COMPARE) SURFACES[0].fg.push('stable', 'caution', 'danger-light');

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const rows = [];
let failed = false;
for (const s of SURFACES) {
  // Scroll the strip into the viewport first: the texture layer is
  // position: fixed, so a full-page capture would miss it below the fold.
  await page.evaluate(`(() => { const r = (${s.rect})(); scrollBy(0, r.y - innerHeight / 2); })()`);
  await page.waitForTimeout(100);
  const rect = await page.evaluate(`(${s.rect})()`);
  const png = decodePng(await page.screenshot({ clip: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } }));
  const lums = [];
  for (let i = 0; i < png.pixels.length; i += png.channels) lums.push(lum([png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]]));
  lums.sort((a, b) => a - b);
  for (const name of s.fg) {
    const fl = lum(hexRgb(palette[name]));
    // Worst case: the background pixel closest to the text luminance.
    const worstBg = fl > lums.at(-1) ? lums.at(-1) : lums[0];
    const worst = ratio(fl, worstBg);
    const ok = worst >= 4.5;
    if (!ok) failed = true;
    rows.push({ surface: s.name, text: name, 'worst ratio': worst.toFixed(2), 'median ratio': ratio(fl, lums[lums.length >> 1]).toFixed(2), pass: ok ? 'yes' : 'NO' });
  }
}
await browser.close();
console.table(rows);
process.exit(failed ? 1 : 0);
