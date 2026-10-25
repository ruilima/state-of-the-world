// Every local script, stylesheet and font in the deployed pages gets ?v=<hash>.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rewriteImports, rewriteCssUrls, rewriteHtmlRefs, versionBuild } from '../scripts/lib/version-assets.mjs';

test('relative imports are versioned; packages and URLs are not', () => {
  const out = rewriteImports("import { a } from './a.js';\nimport('./b.js');\nimport x from 'pkg';\nimport y from 'https://x.org/y.js';", () => 'H');
  assert.equal(out, "import { a } from './a.js?v=H';\nimport('./b.js?v=H');\nimport x from 'pkg';\nimport y from 'https://x.org/y.js';");
});

test('stylesheet: font files are versioned, data: URLs are left alone', () => {
  const css = 'a{src:url(assets/fonts/x.woff2) format("woff2")} b{background:url("data:image/svg+xml,%3Csvg%20x=\'1\'%3E")}';
  assert.equal(rewriteCssUrls(css, () => 'H'), 'a{src:url(assets/fonts/x.woff2?v=H) format("woff2")} b{background:url("data:image/svg+xml,%3Csvg%20x=\'1\'%3E")}');
});

test('pages: local scripts, stylesheets and font preloads are versioned; other links are not', () => {
  const html = '<script type="module" src="app.js"></script><link rel="stylesheet" href="/styles.css"><link rel="preload" as="font" href="assets/fonts/x.woff2"><link rel="canonical" href="https://worldvitals.org/"><link rel="icon" href="assets/i.svg"><script src="https://cdn.x/y.js"></script>';
  assert.equal(rewriteHtmlRefs(html, (u) => `h(${u})`), '<script type="module" src="app.js?v=h(app.js)"></script><link rel="stylesheet" href="/styles.css?v=h(/styles.css)"><link rel="preload" as="font" href="assets/fonts/x.woff2?v=h(assets/fonts/x.woff2)"><link rel="canonical" href="https://worldvitals.org/"><link rel="icon" href="assets/i.svg"><script src="https://cdn.x/y.js"></script>');
});

test('a change deep in the module graph gives every importer, and the page, a new address', () => {
  const make = (leaf) => {
    const dir = mkdtempSync(join(tmpdir(), 'wv-build-'));
    mkdirSync(join(dir, 'assets', 'fonts'), { recursive: true });
    writeFileSync(join(dir, 'leaf.js'), leaf);
    writeFileSync(join(dir, 'mid.js'), "import { x } from './leaf.js';\nexport const y = x;");
    writeFileSync(join(dir, 'app.js'), "import { y } from './mid.js';");
    writeFileSync(join(dir, 'assets', 'fonts', 'f.woff2'), 'font');
    writeFileSync(join(dir, 'styles.css'), '@font-face{src:url(assets/fonts/f.woff2)}');
    writeFileSync(join(dir, 'index.html'), '<link rel="preload" as="font" href="assets/fonts/f.woff2"><link rel="stylesheet" href="styles.css"><script type="module" src="app.js"></script>');
    const v = versionBuild(dir);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const css = readFileSync(join(dir, 'styles.css'), 'utf8');
    rmSync(dir, { recursive: true });
    return { v, html, css };
  };
  const a = make('export const x = 1;');
  const b = make('export const x = 2;');
  assert.notEqual(a.v['leaf.js'], b.v['leaf.js']);
  assert.notEqual(a.v['mid.js'], b.v['mid.js']);
  assert.notEqual(a.v['app.js'], b.v['app.js']);
  assert.ok(a.html.includes(`src="app.js?v=${a.v['app.js']}"`));
  // The preload and the stylesheet ask for the same font address.
  assert.ok(a.html.includes(`href="assets/fonts/f.woff2?v=${a.v['assets/fonts/f.woff2']}"`));
  assert.ok(a.css.includes(`url(assets/fonts/f.woff2?v=${a.v['assets/fonts/f.woff2']})`));
  assert.equal(a.v['styles.css'], b.v['styles.css']); // unchanged file, same address
});
