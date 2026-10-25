// Writes the essential text into the HTML that is deployed, so search engines,
// link previews and readers without JavaScript see the state, the index and
// the five records. Runs in the workflow after the fetch and the tests,
// on the data of that same run:
//
//   node scripts/prerender.mjs        public/ → build/ (deployed); public/ stays as it is
//
// The texts come from public/text.js, public/derive.js, public/ticker.js and
// public/method-table.js, the same functions the page uses, so the script
// only replaces what the build wrote with the same words. Anything the build
// adds that the script redraws is marked data-prerendered and removed first.
// If the HTML no longer has the expected anchors, the run stops with an
// error (the unit test checks the same against public/index.html).
import { cp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, OUT_DIR, readJson } from './lib/io.mjs';
import { RECORDS, SHAPES, STATE_LABEL, monitorModel, recordKey, recordLede, updatedLine, fmtDate, fmtDayTime } from '../public/text.js';
import { tickerTopics, pickHeadlines, staleNote, itemHtml } from '../public/ticker.js';
import { signalsHtml } from '../public/method-table.js';
import { versionBuild } from './lib/version-assets.mjs';

export const BUILD_DIR = join(ROOT, 'build');
const SITE = 'https://worldvitals.org/';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const shapeSvg = (state) => `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">${SHAPES[state]}</svg>`;

/** Replace exactly one occurrence of `from`; throws if it is missing or repeated. */
function swap(html, from, to, what) {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error(`prerender: expected one ${what} in the HTML, found ${n}`);
  return html.replace(from, () => to);
}

/** public/index.html with the monitor, the headline strip and a summary of the records filled in. */
export function prerenderIndex(html, files, now = Date.now()) {
  const m = monitorModel(files.index, files, now);
  html = swap(html, '<p class="masthead__time" id="updated">Loading…</p>', `<p class="masthead__time" id="updated">${esc(updatedLine(files.manifest))}</p>`, 'masthead time');

  // Headline strip: shown only when there are headlines, as the script does.
  const topics = tickerTopics(files);
  const items = pickHeadlines(topics);
  if (items.length) {
    html = swap(html, '<section class="ticker" id="ticker" aria-labelledby="ticker-title" hidden>', '<section class="ticker" id="ticker" aria-labelledby="ticker-title">', 'ticker section');
    const note = staleNote(topics, fmtDayTime);
    if (note) html = swap(html, '<p class="ticker__note" hidden></p>', `<p class="ticker__note">${esc(note)}</p>`, 'ticker note');
    // Only the first list: the loop copy is for the animation, and the
    // script adds it, so the headlines are not written twice in the HTML.
    const list = items.map((a) => itemHtml(a, fmtDate)).join('');
    html = swap(html, '<ul class="ticker__list"></ul>\n', `<ul class="ticker__list">${list}</ul>\n`, 'ticker list');
  }

  // Monitor readout.
  html = swap(html, '<p class="monitor__state" id="monitor-state" aria-live="polite">—</p>', `<p class="monitor__state is-${m.state}" id="monitor-state" aria-live="polite"${m.holdTitle ? ` title="${esc(m.holdTitle)}"` : ''}>${shapeSvg(m.state)}${esc(m.stateLabel)}</p>`, 'monitor state');
  html = swap(html, '<dd id="monitor-index">—</dd>', `<dd id="monitor-index">${esc(m.indexText)}</dd>`, 'monitor index');
  if (m.thresholds) {
    const scale = `<span class="monitor__scale-thresholds" aria-hidden="true">${esc(m.thresholds.visible)}</span>${m.scaleHold.holding ? `<span class="monitor__scale-hold" aria-hidden="true">${esc(m.scaleHold.text)}</span>` : ''}<span class="visually-hidden">${esc(m.thresholds.spoken)}</span>`;
    html = swap(html, '<dd class="monitor__scale" id="monitor-scale"><span aria-hidden="true">caution ≥40, danger ≥65</span><span class="visually-hidden">caution from 40, danger from 65</span></dd>', `<dd class="monitor__scale${m.scaleHold.holding ? ' is-holding' : ''}" id="monitor-scale">${scale}</dd>`, 'monitor scale');
  }
  if (m.hold) html = swap(html, '<dd class="monitor__hold" id="monitor-hold" hidden></dd>', `<dd class="monitor__hold" id="monitor-hold">${esc(m.hold)}</dd>`, 'monitor hold');
  if (m.bpm) html = swap(html, '<dd id="monitor-bpm" title="Visual only: the pulse follows the Condition Index; it is not a measurement.">—</dd>', `<dd id="monitor-bpm" title="Visual only: the pulse follows the Condition Index; it is not a measurement.">${esc(m.bpm)}<span class="visually-hidden">${esc(m.bpmSpoken)}</span></dd>`, 'monitor pulse');
  const extra = m.outdated ? `<p class="stamp stamp--stale" data-prerendered>${shapeSvg('stale')}${esc(STATE_LABEL.stale)}</p>` : m.delayed ? `<p class="monitor__note monitor__delayed" data-prerendered>${esc(m.delayed)}</p>` : '';
  if (extra) html = swap(html, '          </dl>\n', `          </dl>${extra}\n`, 'end of monitor figures');
  if (m.leadLong) {
    html = swap(html, '<p class="monitor__note monitor__lead" id="monitor-lead" hidden></p>', `<p class="monitor__note monitor__lead" id="monitor-lead"><span class="monitor__lead-long">${esc(m.leadLong)}</span><span class="monitor__lead-short">${esc(m.leadShort)}</span></p>`, 'monitor lead');
    html = swap(html, '<section class="monitor" aria-labelledby', '<section class="monitor has-lead" aria-labelledby', 'monitor section');
  }

  // Records: the list and a summary sheet, in the place of the tabs and the open record.
  const rows = RECORDS.map((r) => ({ ...r, key: recordKey(r.id, files), lede: recordLede(r.id, files) }));
  const list = rows.map((r) => `<li class="rec"><span class="rec__name">${esc(r.name)}</span>${r.key ? `<span class="rec__key">${esc(r.key)}</span>` : ''}</li>`).join('');
  const sheet = rows
    .map((r) => `<section><h3>${esc(r.name)}</h3>${r.key ? `<p class="rec__key">${esc(r.key)}</p>` : ''}${r.lede ? `<p>${r.lede.big ? `<span class="big-number">${esc(r.lede.big)}</span>` : ''}${esc(r.lede.text)}</p>` : ''}</section>`)
    .join('');
  const summary = `<ul class="records__list records__static-list" data-prerendered>${list}</ul><section class="dossier records__static" data-prerendered><div class="tab"><h2>At a glance</h2></div><article class="paper">${sheet}</article></section>`;
  html = swap(html, '<div class="records__list" role="tablist" aria-labelledby="records-title" aria-orientation="vertical" id="records-list"></div>', `<div class="records__list" role="tablist" aria-labelledby="records-title" aria-orientation="vertical" id="records-list"></div>${summary}`, 'records list');
  return html;
}

/** public/how-the-index-works.html with the signals table filled in. */
export function prerenderMethod(html, index) {
  if (!index?.data) return html;
  const t = index.data.thresholds;
  for (const k of ['caution', 'danger', 'hysteresis']) html = html.replace(new RegExp(`(<span data-t="${k}">)[^<]*(</span>)`, 'g'), `$1${esc(t[k])}$2`);
  return swap(html, '<div id="signals"><p class="notice">Reading the configuration and data…</p></div>', `<div id="signals">${signalsHtml(index)}</div>`, 'signals box');
}

/** sitemap.xml with true dates (YYYY-MM-DD), no changefreq. */
export function sitemapXml(entries) {
  const urls = entries.map((e) => `  <url>\n    <loc>${esc(e.loc)}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * Date (YYYY-MM-DD) of the last commit that touched any of `paths`, or null
 * when there is no reliable date. A repository can be marked shallow just
 * because one other branch was fetched with --depth=1 (the workflow does that
 * for the data branch), so that mark alone says nothing. What makes a date
 * unreliable is the commit found being a boundary of a truncated history
 * (listed in .git/shallow): git then reports it as touching every file, and
 * its date is not when these files changed. Never the build date.
 */
export function lastChanged(paths, cwd = ROOT) {
  try {
    const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } }).trim();
    // The commit date in UTC, like every other date on the site.
    const [hash, date] = git('log', '-1', '--format=%H %cd', '--date=format-local:%Y-%m-%d', 'HEAD', '--', ...paths).split(' ');
    if (!hash || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return null;
    const shallowFile = join(cwd, git('rev-parse', '--git-path', 'shallow'));
    const boundaries = existsSync(shallowFile) ? readFileSync(shallowFile, 'utf8').split('\n').filter(Boolean) : [];
    return boundaries.includes(hash) ? null : date;
  } catch {
    return null;
  }
}

export async function run() {
  const t0 = Date.now();
  const names = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.json'));
  const files = Object.fromEntries(await Promise.all(names.map(async (f) => [f.replace(/\.json$/, ''), await readJson(join(OUT_DIR, f))])));
  await rm(BUILD_DIR, { recursive: true, force: true });
  // public/data holds a .git folder in CI (the data branch); it is not part of the site.
  await cp(join(ROOT, 'public'), BUILD_DIR, { recursive: true, filter: (src) => !src.split('/').includes('.git') });
  const index = await readFile(join(ROOT, 'public', 'index.html'), 'utf8');
  await writeFile(join(BUILD_DIR, 'index.html'), prerenderIndex(index, files));
  const method = await readFile(join(ROOT, 'public', 'how-the-index-works.html'), 'utf8');
  await writeFile(join(BUILD_DIR, 'how-the-index-works.html'), prerenderMethod(method, files.index));
  const home = files.manifest?.generatedAt?.slice(0, 10) ?? null;
  await writeFile(
    join(BUILD_DIR, 'sitemap.xml'),
    sitemapXml([
      { loc: SITE, lastmod: home },
      { loc: `${SITE}how-the-index-works`, lastmod: lastChanged(['public/how-the-index-works.html', 'config/index.json']) },
    ]),
  );
  // Every local script, stylesheet and font gets ?v=<content hash>.
  const versions = versionBuild(BUILD_DIR);
  console.log(`prerender: build/ written in ${Date.now() - t0} ms (state ${files.index?.data?.state ?? 'none'}, data of ${home ?? 'unknown date'}, ${Object.keys(versions).length} files versioned)`);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
