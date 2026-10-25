// The fonts are served from this site (public/assets/fonts/), with their
// SIL Open Font License files. No page asks Google Fonts for anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');
const exists = (p) => existsSync(new URL(`../public/${p.replace(/^\//, '').replace(/\?.*$/, '')}`, import.meta.url));
const pages = ['index.html', 'how-the-index-works.html', '404.html'];
const css = read('styles.css');

test('no page or stylesheet loads Google Fonts', () => {
  for (const p of [...pages.map(read), css]) assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(p));
});

test('every font in the stylesheet and every preload exists, and the italic face is gone', () => {
  const urls = [...css.matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => m[1]);
  assert.equal(urls.length, 6);
  for (const u of urls) assert.ok(exists(u), u);
  assert.ok(!/italic/.test(css.match(/@font-face[\s\S]*?:root/)[0]));
  for (const p of pages) {
    const preloads = [...read(p).matchAll(/<link rel="preload" as="font"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(preloads.map((u) => u.split('/').pop()), ['big-shoulders-display-800-latin.woff2', 'courier-prime-400-latin.woff2'], p);
    for (const u of preloads) assert.ok(exists(u), u);
  }
});

test('the web fonts swap in and the fallbacks are sized to them', () => {
  assert.equal(css.match(/font-display: swap/g).length, 6);
  for (const name of ['Courier Prime Fallback', 'Big Shoulders Fallback', 'Big Shoulders Fallback Arial']) assert.match(css, new RegExp(`font-family: "${name}"; src: local\\([^;]+; size-adjust: [\\d.]+%; ascent-override`));
});

test('each family ships its SIL Open Font License and the footer credits it', () => {
  for (const f of ['bigshouldersdisplay', 'bigshouldersstencildisplay', 'courierprime']) {
    assert.match(read(`assets/fonts/licenses/${f}-OFL.txt`), /SIL OPEN FONT LICENSE Version 1\.1/);
    assert.ok(read('index.html').includes(`assets/fonts/licenses/${f}-OFL.txt`));
  }
});
