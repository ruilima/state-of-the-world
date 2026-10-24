// Text the page shows, as plain strings: formats, the monitor readout, and
// each record's key line and lede. Shared by app.js (in the browser) and
// scripts/prerender.mjs (at build time), so the HTML written by the build
// and the page drawn by the script say exactly the same thing.
import { isLate, stampFreshness, delayedNote, SIGNAL_SOURCE } from './freshness.js';
import { holdNote, scaleLine, biggestContribution, mainDriver, closestEver, quakeSummary } from './derive.js';

// English formats: 24 Oct 2026, 14:39 UTC (one format everywhere), 13,286.
export const LOCALE = 'en-GB';
const formats = new Map();
const nf = (d) => formats.get(d) ?? formats.set(d, new Intl.NumberFormat(LOCALE, { maximumFractionDigits: d, minimumFractionDigits: d })).get(d);
export const num = (n, d = 0) => nf(d).format(n);
export const compact = (n) => (Math.abs(n) >= 100000 ? `${num(n / 1000)}k` : Math.abs(n) >= 10000 ? `${num(n / 1000, n % 1000 ? 1 : 0)}k` : num(n));
export const pct = (n, d = 1) => `${num(n, d)}%`;
const utc = { timeZone: 'UTC', hourCycle: 'h23' };
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const clock = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', ...utc });
const monthFmt = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const monthShort = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' });
// en-GB writes "Sept"; use the shorter "Sep" like every other month, and keep
// day and month together on one line.
export const tidy = (s) => s.replace(/\bSept\b/, 'Sep').replace(/ /g, ' ');
export const fmtDate = (iso) => tidy(dateFmt.format(new Date(iso)));
export const fmtTime = (iso) => `${clock.format(new Date(iso))} UTC`;
export const fmtDayTime = (iso) => `${fmtDate(iso)}, ${fmtTime(iso)}`;
export const fmtMonth = (ym) => monthFmt.format(new Date(`${ym}-01T00:00:00Z`));

export const STATE_LABEL = { stable: 'STABLE', caution: 'CAUTION', danger: 'DANGER', stale: 'DATA OUTDATED' };

// The shape drawn with each state (inner SVG markup, 20×20 view box).
export const SHAPES = {
  stable: '<circle cx="10" cy="10" r="8" fill="currentColor"/>',
  caution: '<path d="M10 2 19 18H1Z" fill="currentColor"/>',
  danger: '<path d="M10 1 19 10 10 19 1 10Z" fill="currentColor"/><path d="M6.5 6.5l7 7M13.5 6.5l-7 7" stroke="var(--paper)" stroke-width="2"/>',
  stale: '<rect x="2" y="2" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4 3"/>',
  fail: '<path d="M3 3l14 14M17 3 3 17" stroke="currentColor" stroke-width="3"/>',
};

/** "Updated 24 Oct 2026, 19:17 UTC" for the masthead. */
export const updatedLine = (manifest) => (manifest?.generatedAt ? `Updated ${fmtDayTime(manifest.generatedAt)}` : 'No update recorded yet');

/** Everything the monitor readout says, from the index and the source files. */
export function monitorModel(index, files, now = Date.now()) {
  const d = index?.data;
  const state = d?.state ?? 'stable';
  const t = d?.thresholds ?? null;
  const fresh = stampFreshness([...new Set((d?.signals ?? []).filter((s) => s.score != null).map((s) => SIGNAL_SOURCE[s.id]).filter(Boolean))], files, now);
  const outdated = d?.value != null && (isLate('index', index, now) || fresh.outdated);
  const hold = t ? holdNote(d.value, state, t) : null;
  const lead = biggestContribution(d);
  return {
    state,
    stateLabel: d?.value == null ? 'NO SIGNAL' : STATE_LABEL[state],
    indexText: d?.value == null ? '—' : `${num(d.value, 0)} of 100`,
    thresholds: t ? { visible: `caution ≥${t.caution}, danger ≥${t.danger}`, spoken: `caution from ${t.caution}, danger from ${t.danger}` } : null,
    scaleHold: t ? scaleLine(d.value, state, t) : null,
    bpm: d?.bpm == null ? null : `${d.bpm} bpm`,
    bpmSpoken: ' (visual only: it follows the Condition Index, it is not a measurement)',
    outdated,
    delayed: !outdated && d?.value != null && fresh.late.length ? delayedNote(fresh.late) : null,
    hold,
    holdTitle: hold ? hold.replace(/^h/, 'H') : null,
    // An outdated index has no "now": the contribution line only shows with fresh data.
    leadLong: lead && !outdated ? `Biggest contribution now: ${lead}` : null,
    leadShort: lead && !outdated ? `Main driver: ${mainDriver(d)}` : null,
  };
}

/** Each record's key line (under its name in Records), or null without a reliable number. */
export function recordKey(id, f) {
  switch (id) {
    case 'conflict': {
      const m = f.ucdp?.data?.monthly?.at(-1);
      return m ? `${num(m.deaths)} deaths in ${fmtMonth(m.month)} (provisional)` : null;
    }
    case 'work': {
      const rows = f.curated?.data?.layoffs?.monthly ?? [];
      if (!rows.length) return null;
      const months = rows.map((r) => r.month).sort();
      const year = months.at(-1).slice(0, 4);
      const inYear = months.filter((m) => m.startsWith(year));
      const short = (m) => tidy(monthShort.format(new Date(`${m}-01T00:00:00Z`)));
      return `${num(rows.filter((r) => r.month.startsWith(year)).reduce((a, r) => a + r.aiCited, 0))} US job cuts citing AI, ${short(inYear[0])}–${short(inYear.at(-1))} ${year}`;
    }
    case 'planet': {
      const q = f.usgs?.data?.strongest;
      return q ? `Strongest this week: M${num(q.mag, 1)}, ${q.place}` : null;
    }
    case 'economy': {
      const l = f.worldbank?.data?.indicators?.find((i) => i.id === 'FP.CPI.TOTL.ZG')?.series.find((s) => s.country === 'WLD')?.latest;
      return l ? `World inflation ${pct(l.value)} in ${l.year}` : null;
    }
    case 'ahead': {
      const c = f.curated?.data?.doomsday?.current;
      return c ? `${c.seconds} seconds to midnight` : null;
    }
    default:
      return null;
  }
}

/**
 * Each record's opening sentence: { big, text }, where `big` (if any) is
 * set in large type before the text. Null when the data is missing.
 */
export function recordLede(id, f) {
  switch (id) {
    case 'conflict': {
      const last = f.ucdp?.data?.monthly?.at(-1);
      return last ? { big: null, text: `In ${fmtMonth(last.month)}, UCDP recorded ${num(last.deaths)} deaths (provisional) in organised violence, across ${num(last.events)} events.` } : null;
    }
    case 'work':
      return f.curated?.data?.layoffs ? { big: null, text: 'How many jobs are being cut, and how often do companies say AI is the reason? The numbers depend on who counts. Each one is shown with its source.' } : null;
    case 'planet': {
      const q = f.usgs?.data;
      return q ? { big: null, text: `${quakeSummary(q.counts)} The strongest: M${num(q.strongest.mag, 1)}, ${q.strongest.place}.` } : null;
    }
    case 'economy': {
      const wb = f.worldbank?.data;
      if (!wb) return null;
      const latest = Math.max(...wb.indicators.flatMap((i) => i.series.flatMap((s) => s.points.map((p) => p.year))));
      return { big: null, text: `Annual figures from the World Bank. The latest year with data is ${latest}.` };
    }
    case 'ahead': {
      const dd = f.curated?.data?.doomsday;
      return dd ? { big: `${dd.current.seconds} seconds`, text: ` to midnight on the Doomsday Clock${closestEver(dd) ? ', the closest it has ever been' : ''}.` } : null;
    }
    default:
      return null;
  }
}

export const RECORDS = [
  { id: 'conflict', name: 'Armed conflict' },
  { id: 'work', name: 'Work and AI' },
  { id: 'planet', name: 'Planet' },
  { id: 'economy', name: 'Economy' },
  { id: 'ahead', name: 'What lies ahead' },
];
