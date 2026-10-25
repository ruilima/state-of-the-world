// Adds ?v=<content hash> to every local script, stylesheet and font the
// deployed pages load, including the imports between modules, so a new
// deploy is always a new address and no browser or edge cache can mix an
// old app.js with new HTML. Runs on build/ (scripts/prerender.mjs).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, posix } from 'node:path';

export const shortHash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 10);

const local = (url) => !/^(?:[a-z]+:)?\/\//i.test(url) && !url.startsWith('data:') && !url.startsWith('#');
const bare = (url) => url.replace(/[?#].*$/, '');

/** Relative module specifiers (./x.js, ../x.js) in static and dynamic imports, versioned by `versionOf(spec)`. */
export function rewriteImports(code, versionOf) {
  return code.replace(/(\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)(['"])(\.{1,2}\/[^'"?#]+\.js)\2/gm, (m, pre, q, spec) => `${pre}${q}${spec}?v=${versionOf(spec)}${q}`);
}

/** Local file url(...) references in a stylesheet (fonts, images); data: URLs are left alone. */
export function rewriteCssUrls(css, versionOf) {
  return css.replace(/url\((['"]?)(\/?[\w./-]+\.(?:woff2?|ttf|png|jpe?g|svg|gif|webp))\1\)/g, (m, q, url) => `url(${q}${url}?v=${versionOf(url)}${q})`);
}

/** Local <script src>, stylesheet and preload hrefs in a page. */
export function rewriteHtmlRefs(html, versionOf) {
  return html
    .replace(/(<script\b[^>]*\bsrc=")([^"]+\.js)(")/g, (m, a, url, b) => (local(url) ? `${a}${bare(url)}?v=${versionOf(bare(url))}${b}` : m))
    .replace(/(<link\b[^>]*\brel="(?:stylesheet|preload)"[^>]*\bhref=")([^"]+\.(?:css|woff2))(")/g, (m, a, url, b) => (local(url) ? `${a}${bare(url)}?v=${versionOf(bare(url))}${b}` : m));
}

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

/** Version everything under `dir` in place; returns { file: hash } for the report and the tests. */
export function versionBuild(dir) {
  const hashes = new Map();
  const toRel = (abs) => relative(dir, abs).split('\\').join('/');
  // Modules: each one's hash covers its imports' hashes, so a change deep
  // down gives every importer a new address too.
  const visiting = new Set();
  const jsVersion = (rel) => {
    if (hashes.has(rel)) return hashes.get(rel);
    if (visiting.has(rel)) throw new Error(`version-assets: import cycle at ${rel}`);
    visiting.add(rel);
    const abs = join(dir, rel);
    const code = rewriteImports(readFileSync(abs, 'utf8'), (spec) => jsVersion(posix.normalize(posix.join(posix.dirname(rel), spec))));
    writeFileSync(abs, code);
    const h = shortHash(code);
    hashes.set(rel, h);
    visiting.delete(rel);
    return h;
  };
  const fileVersion = (rel) => hashes.get(rel) ?? (hashes.set(rel, shortHash(readFileSync(join(dir, rel)))), hashes.get(rel));
  const all = walk(dir).map(toRel).filter((rel) => !rel.startsWith('data/'));
  for (const rel of all.filter((r) => r.endsWith('.js'))) jsVersion(rel);
  for (const rel of all.filter((r) => r.endsWith('.css'))) {
    const abs = join(dir, rel);
    writeFileSync(abs, rewriteCssUrls(readFileSync(abs, 'utf8'), (url) => fileVersion(posix.normalize(posix.join(posix.dirname(rel), url.replace(/^\//, ''))))));
    hashes.set(rel, shortHash(readFileSync(abs)));
  }
  for (const rel of all.filter((r) => r.endsWith('.html'))) {
    const abs = join(dir, rel);
    const resolve = (url) => posix.normalize(url.startsWith('/') ? url.slice(1) : posix.join(posix.dirname(rel), url));
    writeFileSync(abs, rewriteHtmlRefs(readFileSync(abs, 'utf8'), (url) => (url.endsWith('.js') ? jsVersion(resolve(url)) : fileVersion(resolve(url)))));
  }
  return Object.fromEntries(hashes);
}

