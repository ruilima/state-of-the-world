import { mountEcg } from './ecg.js';
import { isLate, stampFreshness, delayedNote, SIGNAL_SOURCE } from './freshness.js';
import { mountTicker } from './ticker.js';
import { biggestContribution, dataPeriod, closestEver, clockReading } from './derive.js';
import { barChart as bar, lineChart as line, dotMap, tableDetails } from './charts.js';

// Narrow screens get a narrower chart box so axis text stays legible
// instead of shrinking with the SVG.
const CHART_W = matchMedia('(max-width: 560px)').matches ? 380 : 640;
const barChart = (items, o) => bar(items, { width: CHART_W, ...o });
const lineChart = (series, o) => line(series, { width: CHART_W, ...o });

// ---------- helpers ----------

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}
// Only http(s) URLs become links; anything else (javascript:, data:…) is
// shown as plain text. Link text is always inserted as text, never as HTML.
const link = (href, text) => (/^https?:\/\//i.test(href ?? '') ? h('a', { href, rel: 'noopener' }, text) : h('span', {}, text));

// English formats: 24 Oct 2026, 14:39 UTC (one format everywhere), 13,286.
const LOCALE = 'en-GB';
const nf = (d = 0) => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: d, minimumFractionDigits: d });
const num = (n, d = 0) => nf(d).format(n);
const compact = (n) => (Math.abs(n) >= 100000 ? `${num(n / 1000)}k` : Math.abs(n) >= 10000 ? `${num(n / 1000, n % 1000 ? 1 : 0)}k` : num(n));
const pct = (n, d = 1) => `${num(n, d)}%`;
const utc = { timeZone: 'UTC', hourCycle: 'h23' };
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const clock = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', ...utc });
const monthFmt = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' });
// en-GB writes "Sept"; use the shorter "Sep" like every other month, and keep
// day and month together on one line.
const tidy = (s) => s.replace(/\bSept\b/, 'Sep').replace(/ /g, '\u00a0');
const fmtDate = (iso) => tidy(dateFmt.format(new Date(iso)));
const fmtTime = (iso) => `${clock.format(new Date(iso))} UTC`;
const fmtDayTime = (iso) => `${fmtDate(iso)}, ${fmtTime(iso)}`;
const fmtMonth = (ym) => monthFmt.format(new Date(`${ym}-01T00:00:00Z`));

function ago(iso) {
  if (!iso) return 'never';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

const STATE_LABEL = { stable: 'STABLE', caution: 'CAUTION', danger: 'DANGER', stale: 'DATA OUTDATED' };

// Every state also has a shape, so it never depends on colour alone.
function shape(state) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const shapes = {
    stable: '<circle cx="10" cy="10" r="8" fill="currentColor"/>',
    caution: '<path d="M10 2 19 18H1Z" fill="currentColor"/>',
    danger: '<path d="M10 1 19 10 10 19 1 10Z" fill="currentColor"/><path d="M6.5 6.5l7 7M13.5 6.5l-7 7" stroke="var(--paper)" stroke-width="2"/>',
    stale: '<rect x="2" y="2" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4 3"/>',
    fail: '<path d="M3 3l14 14M17 3 3 17" stroke="currentColor" stroke-width="3"/>',
  };
  svg.innerHTML = shapes[state];
  return svg;
}

const stateFromScore = (score, t) => (score >= t.danger ? 'danger' : score >= t.caution ? 'caution' : 'stable');

// ---------- data ----------

const FILES = ['manifest', 'index', 'usgs', 'eonet', 'gdelt-events', 'gdelt-doc', 'pulse', 'worldbank', 'ucdp', 'curated', 'digest'];

async function load() {
  const entries = await Promise.all(
    FILES.map(async (f) => {
      try {
        const res = await fetch(`data/${f}.json`, { cache: 'no-cache' });
        return [f, res.ok ? await res.json() : null];
      } catch {
        return [f, null];
      }
    }),
  );
  return Object.fromEntries(entries);
}

const SOURCE_NAME = {
  usgs: 'USGS (earthquakes)', eonet: 'NASA EONET', 'gdelt-events': 'GDELT (event files)', 'gdelt-doc': 'GDELT (headlines)', pulse: 'Hacker News and arXiv',
  worldbank: 'World Bank', ucdp: 'UCDP', curated: 'Hand-curated figures', digest: 'AI summary',
};

// Plain-English source states. Technical errors stay in the data files and
// the run logs; the page only says what the visitor needs to know.
// Sources that publish yearly or by hand are "checked", not "up to date".
const CHECKED_ONLY = new Set(['worldbank', 'curated']);
function health(id, file) {
  if (!file) return { state: 'fail', text: 'no data yet' };
  if (file.status === 'disabled') return { state: 'stale', text: 'off' };
  if (file.status === 'error') return { state: 'fail', text: 'did not answer; no earlier data to show' };
  if (isLate(id, file)) return { state: 'stale', text: `delayed: last good data ${ago(file.lastSuccessAt)}` };
  if (CHECKED_ONLY.has(id)) return { state: 'stable', text: `checked ${ago(file.lastSuccessAt)}` };
  return { state: 'stable', text: `up to date${file.status === 'partial' ? ' (partial)' : ''}: ${ago(file.lastSuccessAt)}` };
}

// ---------- monitor ----------

function renderMonitor(index, files) {
  const d = index?.data;
  const state = d?.state ?? 'stable';
  const stateEl = document.getElementById('monitor-state');
  stateEl.className = `monitor__state is-${state}`;
  stateEl.replaceChildren(shape(state), d?.value == null ? 'NO SIGNAL' : STATE_LABEL[state]);
  document.getElementById('monitor-index').textContent = d?.value == null ? '—' : `${num(d.value, 0)} of 100`;
  if (d?.thresholds) {
    const t = d.thresholds;
    document.getElementById('monitor-scale').replaceChildren(h('span', { 'aria-hidden': 'true' }, `caution ≥${t.caution}, danger ≥${t.danger}`), h('span', { class: 'visually-hidden' }, `caution from ${t.caution}, danger from ${t.danger}`));
  }
  document.getElementById('monitor-bpm').replaceChildren(...(d?.bpm == null ? ['—'] : [`${d.bpm} bpm`, h('span', { class: 'visually-hidden' }, ' (visual only: it follows the Condition Index, it is not a measurement)')]));
  // Outdated when the index itself is older than 3× its 30-minute refresh, or
  // when every source behind its signals is outside its window. When only
  // some are, the state stays and a note names them.
  const fresh = stampFreshness([...new Set((d?.signals ?? []).filter((s) => s.score != null).map((s) => SIGNAL_SOURCE[s.id]).filter(Boolean))], files);
  const outdated = d?.value != null && (isLate('index', index) || fresh.outdated);
  const figures = document.querySelector('.monitor__figures');
  // After the figures, so it lands under the state word and the figures keep their row.
  if (outdated) figures.after(h('p', { class: 'stamp stamp--stale' }, shape('stale'), STATE_LABEL.stale));
  else if (d?.value != null && fresh.late.length) figures.after(h('p', { class: 'monitor__note monitor__delayed' }, delayedNote(fresh.late)));
  const lead = biggestContribution(d);
  if (lead) Object.assign(document.getElementById('monitor-lead'), { textContent: `Biggest contribution now: ${lead}`, hidden: false });
  mountEcg(document.getElementById('trace'), { state, bpm: d?.bpm ?? 60, still: outdated });
}

// ---------- files (dossiers) ----------

function headlineList(items, emptyText) {
  if (!items?.length) return h('p', { class: 'notice' }, emptyText);
  return h(
    'ul',
    { class: 'list' },
    items.map((a) => h('li', {}, link(a.url, a.title), h('span', { class: 'meta' }, `${a.domain ?? a.source ?? ''}${a.date ? `, ${fmtDayTime(a.date)}` : ''}`))),
  );
}

function unverified(flag, kind = 'pending') {
  if (!flag) return null;
  if (kind === 'secondary') return h('span', { class: 'unverified', title: 'Backed only by secondary reporting, not by the primary source' }, 'secondary source');
  return h('span', { class: 'unverified', title: 'Not yet confirmed in the primary source' }, 'to be confirmed');
}

// What to say when a GDELT DOC query has nothing fresh to show.
function docEmpty(q, what) {
  if (!q || q.status === 'error') return `No ${what} right now. GDELT did not answer the last request. We try again every 30 minutes.`;
  return `No ${what} in this time window.`;
}

// GDELT DOC refuses requests often. When a query shows its last good
// result, say so right under it, with the time that result was fetched.
function lastGoodNote(q) {
  if (q?.status !== 'stale' || !q.fetchedAt || !q.items?.length) return null;
  return h('p', { class: 'notice small' }, `Last good list, from ${fmtDayTime(q.fetchedAt)}. GDELT did not answer the last request. We try again every 30 minutes.`);
}

// Notes on single months whose figure needs context, shown under the bars
// while that month is in the series.
const UCDP_MONTH_NOTES = {
  '2026-01': 'January includes about 19,900 deaths UCDP records as one-sided violence by the Government of Iran against civilians (8–10 Jan). The estimate is uncertain.',
};

function renderConflict(files) {
  const u = files.ucdp?.data;
  const g = files['gdelt-events']?.data;
  const doc = files['gdelt-doc']?.data?.queries ?? {};
  const out = [];
  if (u?.monthly?.length) {
    const last = u.monthly.at(-1);
    out.push(h('p', { class: 'lede' }, `In ${fmtMonth(last.month)}, UCDP recorded ${num(last.deaths)} deaths (provisional) in organised violence, across ${num(last.events)} events.`));
    out.push(h('p', { class: 'small faded' }, 'Candidate events: UCDP’s first monthly count, revised in the next annual release.'));

    const over = (cell) => cell.deaths >= 1000;
    const top = u.topCountries.slice(0, 3).map((c) => `${c.country} (${num(c.deaths)})`).join(', ');
    out.push(h('h3', {}, 'Where'));
    out.push(
      h(
        'figure',
        { class: 'figure' },
        dotMap({
          label: `Map of deaths in organised violence in ${fmtMonth(last.month)}. Most deaths: ${top}.`,
          dots: u.points.map((p) => ({ lat: p.lat, lon: p.lon, r: Math.min(9, 0.6 + Math.sqrt(p.deaths) * 0.11), over: over(p), hover: `${p.country}: ${num(p.deaths)} deaths, ${p.events} events` })),
        }),
        h('figcaption', {}, 'Each circle groups the events in a 1° grid cell and grows with the number of deaths. Red marks cells with 1,000 or more deaths in the month, a threshold we chose.'),
      ),
    );
    out.push(
      h(
        'table',
        { class: 'data' },
        h('caption', { class: 'data__caption' }, `Most deaths, ${tidy(monthShort.format(new Date(`${last.month}-01T00:00:00Z`)))} ${last.month.slice(0, 4)}`),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Country'), h('th', { scope: 'col', class: 'num' }, 'Deaths (provisional)'))),
        h('tbody', {}, u.topCountries.map((c) => h('tr', {}, h('td', {}, c.country), h('td', { class: 'num' }, num(c.deaths))))),
      ),
    );

    const alarm = files.index?.data?.signals?.find((s) => s.id === 'conflictDeaths')?.alarm ?? 25000;
    out.push(h('h3', {}, `Month by month, ${last.month.slice(0, 4)}`));
    out.push(
      h(
        'figure',
        { class: 'figure' },
        barChart(
          u.monthly.map((m) => ({ label: tidy(monthShort.format(new Date(`${m.month}-01T00:00:00Z`))), value: m.deaths, hover: `${fmtMonth(m.month)}: ${num(m.deaths)} deaths` })),
          { label: `Deaths per month in ${last.month.slice(0, 4)}, from UCDP candidate events.`, format: compact, over: (v) => v >= alarm },
        ),
        h('figcaption', {}, `Deaths per month (provisional). Red bars: months above ${num(alarm)} deaths, the alarm value we set for the Condition Index.`, ...u.monthly.filter((m) => UCDP_MONTH_NOTES[m.month]).map((m) => ` ${UCDP_MONTH_NOTES[m.month]}`)),
        tableDetails('Deaths per month', ['Month', 'Deaths (provisional)', 'Events'], u.monthly.map((m) => [fmtMonth(m.month), num(m.deaths), num(m.events)]), [1, 2]),
      ),
    );
  }
  if (u?.annual?.length) {
    const a = u.annual;
    out.push(h('h3', {}, `Since ${a[0].year}`));
    out.push(
      h(
        'figure',
        { class: 'figure' },
        lineChart([{ name: 'Battle deaths', points: a.map((r) => ({ x: r.year, y: r.deaths })) }], {
          label: `Battle deaths per year, ${a[0].year}–${a.at(-1).year}. In ${a.at(-1).year}: ${num(a.at(-1).deaths)}.`,
          formatY: compact,
          formatX: String,
          xTicks: [a[0].year, 2000, 2010, 2020, a.at(-1).year],
        }),
        h('figcaption', {}, `${u.annualNote} UCDP Battle-Related Deaths, version ${u.annualVersion}. This line counts only conflicts where one side is a state, so it is not comparable with the monthly figures above.`),
        tableDetails('Battle deaths per year', ['Year', 'Deaths', 'Conflicts'], a.map((r) => [r.year, num(r.deaths), r.conflicts]), [1, 2]),
      ),
    );
  }

  out.push(h('h3', {}, 'In the news'));
  if (g?.daily?.length) {
    out.push(h('p', {}, `In the last 24 hours, ${pct(g.materialShare24h * 100)} of the ${num(g.events24h)} events coded by GDELT were material conflict (fighting, assaults, mass violence); 7-day average: ${pct(g.materialShare7d * 100)}.`));
    out.push(
      h(
        'figure',
        { class: 'figure' },
        lineChart([{ name: 'Material conflict', points: g.daily.map((d) => ({ x: Date.parse(d.date), y: d.materialShare * 100 })) }], {
          label: 'Daily share of material-conflict events in GDELT, last 7 days.',
          height: 150,
          formatY: (v) => pct(v, 0),
          formatX: (x) => tidy(dayMonth.format(new Date(x))),
          yMin: 0,
        }),
        h('figcaption', {}, 'GDELT codes news from around the world automatically. This measures media attention, not casualties. Only this measure feeds the Condition Index.'),
      ),
    );
  }
  const covKeys = ['coverageArmedConflict', 'coverageCeasefire', 'coverageSanctions'];
  const cov = covKeys.map((k) => doc[k]).filter((q) => q?.items?.length);
  if (cov.length) {
    const dashes = [null, '6 4', '2 3'];
    const styles = ['solid', 'dashed', 'dotted'];
    out.push(
      h(
        'figure',
        { class: 'figure' },
        lineChart(
          cov.map((q, i) => ({ name: q.label, dash: dashes[i], points: q.items.map((p) => ({ x: Date.parse(p.date), y: p.value })) })),
          { label: `Coverage volume over the last 30 days: ${cov.map((q) => q.label).join(', ')}.`, formatY: (v) => pct(v, 2), formatX: (x) => tidy(dayMonth.format(new Date(x))), yMin: 0 },
        ),
        h('figcaption', {}, `Share of all coverage monitored by GDELT that mentions each topic. Lines: ${cov.map((q, i) => `${styles[i]}, ${q.label}`).join('; ')}.`),
      ),
    );
    const missingCov = covKeys.map((k) => doc[k]).filter((q) => q && !q.items?.length);
    if (missingCov.length) out.push(h('p', { class: 'notice small' }, `No curve for ${missingCov.map((q) => q.label).join(', ')} right now. GDELT did not answer the last request. We try again every 30 minutes.`));
    const staleCov = cov.filter((q) => q.status === 'stale');
    if (staleCov.length) out.push(h('p', { class: 'notice small' }, `Last good curve for ${staleCov.map((q) => `${q.label} (from ${fmtDayTime(q.fetchedAt)})`).join(', ')}. GDELT did not answer the last request. We try again every 30 minutes.`));
  } else {
    out.push(h('p', { class: 'notice' }, docEmpty(doc.coverageArmedConflict, 'coverage curves by topic')));
  }
  out.push(h('h3', {}, 'Recent headlines'));
  out.push(headlineList(doc.conflictHeadlines?.items, docEmpty(doc.conflictHeadlines, 'headlines')));
  out.push(lastGoodNote(doc.conflictHeadlines));

  if (files.ucdp) {
    out.push(
      h(
        'p',
        { class: 'colophon' },
        'Data: ',
        link('https://ucdp.uu.se/', 'UCDP'),
        ', Uppsala University, CC BY 4.0.',
      ),
    );
  }
  return out;
}

function renderWork(files) {
  const c = files.curated?.data?.layoffs;
  const doc = files['gdelt-doc']?.data?.queries ?? {};
  const pulse = files.pulse?.data;
  const out = [];
  if (c) {
    out.push(h('p', { class: 'lede' }, 'How many jobs are being cut, and how often do companies say AI is the reason? The numbers depend on who counts. Each one is shown with its source.'));
    if (c.trend) {
      out.push(h('p', { class: 'notice' }, c.trend.text, ' ', h('span', { class: 'meta' }, 'Source: ', link(c.trend.source.url, c.trend.source.name), '.'), ' ', unverified(!c.trend.verified)));
    }
    // Figures are grouped by tracker, each with its scope, because the
    // trackers count different things and must not read as comparable.
    const figureItem = (f) => {
      const value = f.high && f.high !== f.low ? `${num(f.low)} to ${num(f.high)}` : f.high == null ? `over ${num(f.low)}` : num(f.low);
      return h(
        'li',
        {},
        h('span', { class: 'big-number' }, value),
        ' ',
        unverified(!f.verified),
        h('br'),
        `${f.label}, ${f.period}${f.detail ? ` (${f.detail})` : ''}.`,
        h(
          'span',
          { class: 'meta' },
          'Source: ',
          link(f.source.url, f.source.name),
          f.via ? `, via ${f.via.name}` : '',
          f.publishedAt ? `, published ${fmtDate(f.publishedAt)}` : '',
          f.readAt ? `, counter read on ${fmtDate(f.readAt)}` : '',
        ),
        f.comparisons?.length
          ? h(
              'span',
              { class: 'meta' },
              'For reference: ',
              ...f.comparisons.flatMap((cmp, i) => [
                i ? '; ' : '',
                `${num(cmp.value)} people${cmp.companies ? ` at ${num(cmp.companies)} companies` : ''} in ${cmp.label}`,
              ]),
              ' (',
              ...[...new Map(f.comparisons.flatMap((cmp) => [cmp.source, cmp.alsoIn]).filter(Boolean).map((s) => [s.name, s])).values()].flatMap((s, i) => [i ? '; ' : '', link(s.url, s.name)]),
              ') ',
              unverified(f.comparisons.some((cmp) => cmp.evidence === 'secondary'), 'secondary'),
            )
          : null,
      );
    };
    out.push(h('h3', {}, 'Reference figures'));
    const groups = c.scopes ? Object.keys(c.scopes) : [null];
    for (const g of groups) {
      const figs = c.figures.filter((f) => !g || f.group === g);
      if (!figs.length) continue;
      if (g) out.push(h('p', { class: 'small' }, h('strong', {}, `${c.scopes[g].name}. `), c.scopes[g].scope));
      out.push(h('ul', { class: 'list' }, figs.map(figureItem)));
    }
    if (c.scopeNote) out.push(h('p', { class: 'small faded' }, c.scopeNote));

    out.push(h('h3', {}, 'Job cuts citing AI, month by month'));
    if (c.monthly.length) {
      const rows = [...c.monthly].sort((a, b) => a.month.localeCompare(b.month));
      out.push(
        h(
          'figure',
          { class: 'figure' },
          barChart(rows.map((r) => ({ label: tidy(monthShort.format(new Date(`${r.month}-01T00:00:00Z`))), value: r.aiCited, hover: `${fmtMonth(r.month)}: ${num(r.aiCited)} cuts where the company cited AI, of ${num(r.total)} announced` })), {
            label: `US job cuts where companies cited AI, per month in ${rows[0].month.slice(0, 4)}. Highest: ${(() => { const m = rows.reduce((a, b) => (b.aiCited > a.aiCited ? b : a)); return `${fmtMonth(m.month)}, ${num(m.aiCited)}`; })()}. Latest: ${fmtMonth(rows.at(-1).month)}, ${num(rows.at(-1).aiCited)}.`,
            format: compact,
          }),
          h('figcaption', {}, `Cuts where the company cited AI, from each monthly Challenger report. The table also shows all announced cuts per month.`),
          tableDetails(
            'Job cuts per month',
            ['Month', 'Citing AI', 'All announced', 'AI share', 'Report'],
            rows.map((r) => [fmtMonth(r.month), num(r.aiCited), num(r.total), pct((r.aiCited / r.total) * 100, 0), r.verified ? `published ${fmtDate(r.publishedAt)}` : 'to be confirmed']),
            [1, 2, 3],
          ),
        ),
      );
    } else {
      out.push(
        h(
          'p',
          { class: 'notice' },
          'The monthly series is not filled in yet. Its source will be the monthly report from ',
          link('https://www.challengergray.com/blog/category/job-cuts/', 'Challenger, Gray & Christmas'),
          '. Until then, this signal stays out of the Condition Index.',
        ),
      );
    }

    out.push(h('h3', {}, 'Two readings'));
    out.push(
      h(
        'div',
        { class: 'two-col' },
        h('div', { class: 'side' }, h('p', {}, h('strong', {}, 'What companies say. '), c.attributionNote.claim)),
        h(
          'div',
          { class: 'side' },
          h('p', {}, h('strong', {}, 'What sceptics say. '), c.attributionNote.counter),
          h('ul', { class: 'list small' }, c.attributionNote.sources.map((s) => h('li', {}, link(s.url, s.name), ' ', unverified(!s.verified)))),
        ),
      ),
    );
  }
  out.push(h('h3', {}, 'Recent headlines'));
  out.push(headlineList(doc.aiLayoffHeadlines?.items, docEmpty(doc.aiLayoffHeadlines, 'headlines')));
  out.push(lastGoodNote(doc.aiLayoffHeadlines));
  if (pulse) {
    out.push(
      h(
        'div',
        { class: 'two-col' },
        h('div', {}, h('h3', {}, 'Posts on Hacker News'), headlineList(pulse.hn.slice(0, 6).map((x) => ({ ...x, url: x.discussion ?? x.url, source: 'Hacker News discussion' })), 'No recent posts.')),
        h('div', {}, h('h3', {}, 'Recent preprints (arXiv, not peer-reviewed)'), headlineList(pulse.arxiv.slice(0, 6).map((x) => ({ ...x, source: 'arXiv' })), 'No recent preprints.')),
      ),
    );
  }
  return out;
}

// EONET's own label for this category reads as dated English.
const CATEGORY_NAME = { manmade: 'Human-caused' };

function renderPlanet(files) {
  const q = files.usgs?.data;
  const e = files.eonet?.data;
  const out = [];
  if (q) {
    const s = q.strongest;
    out.push(h('p', { class: 'lede' }, `${num(q.counts.m45Week)} earthquakes of magnitude 4.5 or more in the last 7 days. The strongest: M${num(s.mag, 1)}, ${s.place}.`));
  }
  if (q || e) {
    const quakeOver = (x) => x.mag >= 7 || x.alert === 'red' || x.alert === 'orange';
    out.push(
      h(
        'figure',
        { class: 'figure' },
        dotMap({
          label: `Map of ${q?.quakes.length ?? 0} earthquakes of magnitude 4.5 or more in the last week and ${e?.events.length ?? 0} open natural events.`,
          dots: (q?.quakes ?? []).map((x) => ({ lat: x.lat, lon: x.lon, r: 0.6 + 0.45 * Math.max(0, x.mag - 4.5) ** 1.5, over: quakeOver(x), ring: Date.now() - Date.parse(x.time) < 864e5, hover: `M${num(x.mag, 1)}, ${x.place}, ${fmtDayTime(x.time)}` })),
          crosses: (e?.events ?? []).map((x) => ({ lat: x.lat, lon: x.lon, hover: `${CATEGORY_NAME[x.category] ?? x.categoryName}: ${x.title}` })),
        }),
        h('figcaption', {}, 'Circles: earthquakes, sized by magnitude. Red marks magnitude 7 or more, or an orange or red PAGER impact alert. A ring marks an earthquake in the last 24 hours. Crosses: open natural events in NASA EONET.'),
      ),
    );
  }
  const cols = [];
  if (q) {
    cols.push(
      h(
        'div',
        {},
        h('h3', {}, 'Strongest earthquakes'),
        h(
          'ol',
          { class: 'list' },
          q.quakes.slice(0, 8).map((x) => h('li', {}, link(x.url, `M${num(x.mag, 1)} ${x.place ?? ''}`), h('span', { class: 'meta' }, `${fmtDayTime(x.time)}, ${num(x.depthKm)} km deep${x.tsunami ? ', large quake at sea' : ''}`))),
        ),
        q.quakes.slice(0, 8).some((x) => x.tsunami) ? h('p', { class: 'small faded' }, 'USGS flags large quakes at sea. It does not mean a tsunami occurred or will occur.') : null,
      ),
    );
  }
  if (e) {
    const rows = Object.entries(e.byCategory).sort((a, b) => b[1] - a[1]);
    cols.push(
      h(
        'div',
        {},
        h('h3', {}, 'Open natural events'),
        h(
          'table',
          { class: 'data' },
          h('caption', { class: 'visually-hidden' }, 'Open natural events by category'),
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Category'), h('th', { scope: 'col', class: 'num' }, 'Open'))),
          h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('td', {}, CATEGORY_NAME[k] ?? e.categoryNames[k] ?? k), h('td', { class: 'num' }, num(v))))),
        ),
        h('p', { class: 'small faded' }, 'Events active in the last 30 days that NASA has not closed yet.'),
      ),
    );
  }
  out.push(h('div', { class: 'two-col' }, cols));
  return out;
}

function renderEconomy(files) {
  const wb = files.worldbank?.data;
  if (!wb) return [];
  const latest = Math.max(...wb.indicators.flatMap((i) => i.series.flatMap((s) => s.points.map((p) => p.year))));
  const out = [
    h('p', { class: 'lede' }, `Annual figures from the World Bank. The latest year with data is ${latest}.`),
    h('p', { class: 'small faded' }, 'Not part of the Condition Index. Portugal is shown as a local reference.'),
  ];
  const dashes = { WLD: null, EUU: '6 4', PRT: '2 3' };
  for (const ind of wb.indicators) {
    const years = ind.series.flatMap((s) => s.points.map((p) => p.year));
    const lastYear = Math.max(...years);
    const firstYear = Math.min(...years);
    out.push(h('h3', {}, `${ind.name}, ${ind.unit}`));
    out.push(
      h(
        'figure',
        { class: 'figure' },
        lineChart(
          ind.series.map((s) => ({ name: s.countryName, dash: dashes[s.country], points: s.points.map((p) => ({ x: p.year, y: p.value })) })),
          {
            label: `${ind.name} from ${firstYear} to ${lastYear}: ${ind.series.map((s) => `${s.countryName} ${s.latest ? `${pct(s.latest.value)} in ${s.latest.year}` : 'no data'}`).join('; ')}.`,
            height: 180,
            formatY: (v) => pct(v, 0),
            formatLabel: (v) => pct(v, 1),
            formatX: String,
            xTicks: [firstYear, lastYear],
          },
        ),
        h('figcaption', {}, `Solid line: World; dashed: European Union; dotted: Portugal. Latest year with data: ${lastYear}. Updated by the World Bank on ${ind.lastUpdated ? fmtDate(ind.lastUpdated) : 'an unknown date'}.`),
        tableDetails(
          ind.name,
          ['Year', ...ind.series.map((s) => s.countryName)],
          [...new Set(years)].sort().map((y) => [y, ...ind.series.map((s) => { const p = s.points.find((pp) => pp.year === y); return p ? pct(p.value) : '—'; })]),
          [1, 2, 3],
        ),
      ),
    );
  }
  out.push(h('p', { class: 'colophon' }, 'Data: ', link('https://data.worldbank.org/', 'World Bank Open Data'), ', licensed CC BY 4.0.'));
  return out;
}

function renderAhead(files) {
  const c = files.curated?.data;
  const dg = files.digest;
  const out = [];
  if (c) {
    const dd = c.doomsday;
    // "The closest it has ever been" only while the data says so.
    out.push(h('p', { class: 'lede' }, h('span', { class: 'big-number' }, `${dd.current.seconds} seconds`), ` to midnight on the Doomsday Clock${closestEver(dd) ? ', the closest it has ever been' : ''}.`));
    out.push(h('p', { class: 'small' }, 'An expert panel’s judgement of global risk, set once a year. Shown as context: it is not part of the Condition Index. ', `Set on ${fmtDate(dd.current.setAt)} by the `, link(dd.source.url, dd.source.name), '. ', unverified(!dd.current.verified)));
    out.push(h('h3', {}, 'Recent years'));
    out.push(h('ol', { class: 'seq' }, dd.history.slice(-5).map((r) => h('li', {}, `${r.year}: ${clockReading(r.seconds)}${r.unchanged ? ' (unchanged)' : ''} `, unverified(!r.verified, r.evidence === 'secondary' ? 'secondary' : 'pending')))));
    if (dd.historySource) {
      out.push(
        tableDetails(`Every setting since ${dd.history[0].year}`, ['Year', 'Setting'], dd.history.map((r) => [r.year, `${clockReading(r.seconds)}${r.unchanged ? ' (unchanged)' : ''}`]), []),
        h('p', { class: 'small faded' }, 'Source: ', link(dd.historySource.url, dd.historySource.name), '. Years without an entry kept the previous setting.'),
      );
    }

    out.push(h('h3', {}, 'Horizons'));
    out.push(h('p', { class: 'small faded' }, c.horizons.rule ?? 'Only claims from a named institution, with a primary source.'));
    const items = [...c.horizons.items].sort((a, b) => a.horizon.localeCompare(b.horizon));
    out.push(
      h(
        'ol',
        { class: 'seq' },
        items.map((it) => h('li', {}, h('strong', {}, `${it.horizon}. `), it.claim, h('span', { class: 'meta', style: 'display:block' }, link(it.url, it.who), `, ${fmtDate(it.date)}${it.dateNote ? ` (date ${it.dateNote})` : ''} `, unverified(!it.verified)))),
      ),
    );
  }
  if (dg?.status === 'ok' || (dg?.status === 'stale' && dg.data)) {
    out.push(h('h3', {}, 'AI summary ', h('span', { class: 'ai-label' }, 'AI-generated')));
    out.push(h('p', { class: 'small faded' }, `Written by a language model from the headlines on this page, ${ago(dg.lastSuccessAt)}. It may contain mistakes: check the sources.`));
    for (const p of dg.data.paragraphs) {
      out.push(h('p', {}, p.text));
      if (p.sources.length) out.push(h('p', { class: 'small' }, 'Sources: ', ...p.sources.flatMap((s, i) => [i ? '; ' : '', link(s.url, s.source || s.title)])));
    }
  }
  return out;
}

// Each file: its sources, the index signals behind its stamp, the typed
// "Subject" line, and the key figure shown under its name in Records.
// key() returns null when there is no reliable number; Records then shows
// the state of `keySource` instead.
const FILES_LIST = [
  {
    id: 'conflict', name: 'Armed conflict', subject: 'armed conflict and organised violence',
    sources: ['ucdp', 'gdelt-events', 'gdelt-doc'], signals: ['conflictNews', 'conflictDeaths'], stampSources: ['gdelt-events', 'ucdp'], render: renderConflict,
    keySource: 'ucdp',
    key: (f) => { const m = f.ucdp?.data?.monthly?.at(-1); return m ? `${num(m.deaths)} deaths in ${fmtMonth(m.month)} (provisional)` : null; },
  },
  {
    id: 'work', name: 'Work and AI', subject: 'work and artificial intelligence',
    sources: ['curated', 'gdelt-doc', 'pulse'], signals: ['aiLayoffs'], stampSources: ['layoffs'], render: renderWork,
    keySource: 'curated',
    key: (f) => {
      const rows = f.curated?.data?.layoffs?.monthly ?? [];
      if (!rows.length) return null;
      const months = rows.map((r) => r.month).sort();
      const year = months.at(-1).slice(0, 4);
      const inYear = months.filter((m) => m.startsWith(year));
      const short = (m) => tidy(monthShort.format(new Date(`${m}-01T00:00:00Z`)));
      return `${num(rows.filter((r) => r.month.startsWith(year)).reduce((a, r) => a + r.aiCited, 0))} US job cuts citing AI, ${short(inYear[0])}–${short(inYear.at(-1))} ${year}`;
    },
  },
  {
    id: 'planet', name: 'Planet', subject: 'earthquakes and natural events',
    sources: ['usgs', 'eonet'], signals: ['quakes', 'naturalEvents'], stampSources: ['usgs', 'eonet'], render: renderPlanet,
    keySource: 'usgs',
    key: (f) => { const q = f.usgs?.data?.strongest; return q ? `Strongest this week: M${num(q.mag, 1)}, ${q.place}` : null; },
  },
  {
    id: 'economy', name: 'Economy', subject: 'inflation, unemployment and growth',
    sources: ['worldbank'], signals: [], stampSources: ['worldbank'], render: renderEconomy,
    keySource: 'worldbank',
    key: (f) => {
      const l = f.worldbank?.data?.indicators?.find((i) => i.id === 'FP.CPI.TOTL.ZG')?.series.find((s) => s.country === 'WLD')?.latest;
      return l ? `World inflation ${pct(l.value)} in ${l.year}` : null;
    },
  },
  {
    id: 'ahead', name: 'What lies ahead', subject: 'warnings about the years ahead',
    sources: ['curated', 'digest'], signals: [], stampSources: ['doomsday'], render: renderAhead,
    keySource: 'curated',
    key: (f) => { const c = f.curated?.data?.doomsday?.current; return c ? `${c.seconds} seconds to midnight` : null; },
  },
];

// The stamp and, when only some of its sources are delayed, a note naming them.
function fileStamp(d, files) {
  const fresh = stampFreshness(d.stampSources, files);
  if (fresh.outdated) return { stamp: 'stale', note: null };
  const t = files.index?.data?.thresholds ?? { caution: 40, danger: 65 };
  const scores = (files.index?.data?.signals ?? []).filter((s) => d.signals.includes(s.id) && s.score != null).map((s) => s.score);
  return { stamp: scores.length ? stateFromScore(Math.max(...scores), t) : null, note: fresh.late.length ? delayedNote(fresh.late) : null };
}

// The "Subject" and "Data" lines are typed out once when a record opens.
// Every character is its own span that fades in (opacity only), so the line
// wraps like ordinary text and is never cut at narrow widths. Screen
// readers get the whole line from a hidden copy.
const TYPE_MS = 28;
function typed(text, cls, delayMs) {
  return h(
    'p',
    { class: `type ${cls}`, style: `--type-delay: ${delayMs}ms` },
    h('span', { class: 'visually-hidden' }, text),
    h('span', { 'aria-hidden': 'true' }, [...text].map((c, i) => h('span', { class: 'type__ch', style: `--i: ${i}` }, c))),
  );
}

function renderRecords(files) {
  const root = document.getElementById('records');
  const list = document.getElementById('records-list');
  const slots = [];
  for (const d of FILES_LIST) {
    const hs = d.sources.map((id) => ({ id, ...health(id, files[id]) })).filter((x) => !(x.id === 'digest' && x.text === 'off'));
    const live = hs.filter((x) => x.state === 'stable').length;
    const lastOk = d.sources.map((id) => files[id]?.lastSuccessAt).filter(Boolean).sort().at(-1);
    const panelId = `file-${d.id}`;
    const tabId = `tab-${d.id}`;

    let key = null;
    try {
      key = d.key(files);
    } catch (err) {
      console.error(d.id, err);
    }
    const keyHealth = health(d.keySource, files[d.keySource]);
    const keyText = key ?? `${SOURCE_NAME[d.keySource]}: ${keyHealth.text}`;
    // The period the data covers comes first; the check time second.
    let period = null;
    try {
      period = dataPeriod(d.id, files);
    } catch (err) {
      console.error(d.id, err);
    }
    const checked = lastOk ? `checked ${fmtDayTime(lastOk)}` : 'not checked yet';
    const updated = `Data: ${period ?? '—'} · ${checked}`;

    const tab = h(
      'button',
      { class: 'rec', type: 'button', role: 'tab', id: tabId, 'aria-selected': 'false', 'aria-controls': panelId, tabindex: '-1' },
      h('span', { class: 'rec__name' }, d.name),
      h('span', { class: `rec__key${key ? '' : ' rec__key--state'}` }, keyText),
      h('span', { class: 'rec__meta' }, live === hs.length ? updated : `${updated}, ${live} of ${hs.length} sources up to date`),
    );

    const { stamp, note } = fileStamp(d, files);
    let body;
    try {
      body = d.render(files);
    } catch (err) {
      console.error(d.id, err);
      body = [h('p', { class: 'notice' }, 'This record could not be drawn from the current data. The source list below shows the state of each source.')];
    }
    body = body.filter(Boolean);
    if (!body.length) body = [h('p', { class: 'notice' }, 'No data saved for this record yet. The source list below says why.')];

    const subject = `Subject: ${d.subject}`;
    const filed = updated;
    const filedDelay = subject.length * TYPE_MS + 200;
    const stampDelay = filedDelay + filed.length * TYPE_MS + 150;
    const paper = h(
      'article',
      { class: 'paper', 'aria-labelledby': `title-${d.id}` },
      h(
        'div',
        { class: 'paper__head' },
        h('div', { class: 'paper__lines' }, typed(subject, 'type--subject', 0), typed(filed, 'type--filed', filedDelay), note ? h('p', { class: 'small paper__note' }, note) : null),
        stamp ? h('p', { class: `stamp stamp--${stamp}`, style: `--stamp-delay: ${stampDelay}ms` }, shape(stamp), STATE_LABEL[stamp]) : null,
      ),
      ...body,
      h(
        'ul',
        { class: 'health', 'aria-label': 'Source status' },
        hs.map((x) => h('li', { class: x.state === 'fail' ? 'danger-value' : '' }, shape(x.state), h('span', { class: 'h-name' }, SOURCE_NAME[x.id] ?? x.id), h('span', { class: 'h-state' }, x.text))),
      ),
    );
    // Bars ink in one after another when the file opens.
    paper.querySelectorAll('.chart .bar').forEach((b, i) => b.style.setProperty('--i', i));
    const panel = h(
      'section',
      { class: 'dossier', id: panelId, role: 'tabpanel', 'aria-labelledby': tabId, tabindex: '0', hidden: true },
      h('div', { class: 'tab' }, h('h2', { id: `title-${d.id}` }, d.name)),
      paper,
    );
    list.append(tab);
    root.append(panel);
    slots.push({ d, tab, panel });
  }

  let current = null;
  // Opens one file. The opening animations (typing, stamp, ink) restart
  // only when a different file opens, never on the same one again.
  const select = (id, { focus = false } = {}) => {
    const target = slots.find((s) => s.d.id === id) ?? slots[0];
    if (focus) target.tab.focus();
    if (current === target) return;
    current = target;
    for (const s of slots) {
      const on = s === target;
      s.tab.setAttribute('aria-selected', String(on));
      s.tab.tabIndex = on ? 0 : -1;
      s.panel.hidden = !on;
      s.panel.classList.remove('is-opening');
    }
    void target.panel.offsetWidth; // restart the CSS animations
    target.panel.classList.add('is-opening');
  };
  const choose = (s, opts) => {
    select(s.d.id, opts);
    history.replaceState(null, '', `#${s.d.id}`);
  };

  for (const s of slots) s.tab.addEventListener('click', () => choose(s));
  // Tabs pattern: arrows move and open (automatic activation), Home/End jump.
  list.addEventListener('keydown', (e) => {
    const i = slots.findIndex((s) => s.tab === document.activeElement);
    if (i < 0) return;
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: slots.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    choose(slots[(next + slots.length) % slots.length], { focus: true });
  });

  const fromHash = () => {
    const id = location.hash.slice(1);
    if (!FILES_LIST.some((d) => d.id === id)) return false;
    select(id);
    return true;
  };
  window.addEventListener('hashchange', () => {
    if (fromHash()) root.scrollIntoView({ block: 'start' });
  });
  // A known hash opens that file; anything else opens the first one.
  if (!fromHash()) select(FILES_LIST[0].id);
}

// ---------- boot ----------

const files = await load();
const gen = files.manifest?.generatedAt;
document.getElementById('updated').textContent = gen ? `Updated ${fmtDayTime(gen)}` : 'No update recorded yet';
renderMonitor(files.index, files);
try {
  const doc = files['gdelt-doc']?.data?.queries ?? {};
  mountTicker(document.getElementById('ticker'), [doc.conflictHeadlines, doc.aiLayoffHeadlines], fmtDayTime);
} catch (err) {
  console.error('ticker', err);
}
renderRecords(files);
