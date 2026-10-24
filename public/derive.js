// Small pure calculations the page shows as text. Kept apart from app.js so
// the tests can import them.

/** Points each signal adds to the index: score × effective weight. */
export function contributions(index) {
  return (index?.signals ?? [])
    .filter((s) => s.score != null && s.effectiveWeight)
    .map((s) => ({ id: s.id, name: s.name, points: (s.score * s.effectiveWeight) / 100 }))
    .sort((a, b) => b.points - a.points);
}

/** "Deaths in organised violence (15.5 of 37.6 points)", or null. */
export function biggestContribution(index) {
  const top = contributions(index)[0];
  if (!top || index?.value == null) return null;
  const one = (n) => (Math.round(n * 10) / 10).toFixed(1);
  return `${top.name} (${one(top.points)} of ${one(index.value)} points)`;
}

// "Sep 2026" from "2026-09"; en-GB writes "Sept", every other month has three letters.
const monthShort = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
export const monthYear = (ym) => (ym ? `${monthShort.format(new Date(`${ym}-01T00:00:00Z`)).replace(/\bSept\b/, 'Sep')} ${ym.slice(0, 4)}` : null);

/** The period each record's main data covers, shown before the check time. */
export function dataPeriod(id, f) {
  switch (id) {
    case 'conflict': return monthYear(f.ucdp?.data?.monthly?.at(-1)?.month);
    case 'work': return monthYear(f.curated?.data?.layoffs?.monthly?.map((r) => r.month).sort().at(-1));
    case 'planet': return f.usgs?.data ? 'last 7 days' : null;
    case 'economy': {
      const years = (f.worldbank?.data?.indicators ?? []).flatMap((i) => i.series.map((s) => s.latest?.year).filter(Boolean));
      return years.length ? String(Math.max(...years)) : null;
    }
    case 'ahead': return monthYear(f.curated?.data?.doomsday?.current?.setAt?.slice(0, 7));
    default: return null;
  }
}

/** True when the current Doomsday Clock setting is the closest to midnight in its history. */
export function closestEver(doomsday) {
  const all = (doomsday?.history ?? []).map((r) => r.seconds);
  return all.length > 0 && doomsday.current.seconds <= Math.min(...all);
}

/** "7 minutes", "2.5 minutes", "100 seconds": how the Bulletin writes each setting. */
export const clockReading = (seconds) => (seconds >= 120 && seconds % 30 === 0 ? `${seconds / 60} minutes` : `${seconds} seconds`);

/** Planet lede counts, from the fields the USGS file already has. */
export function quakeSummary(counts) {
  const n = (x) => new Intl.NumberFormat('en-GB').format(x);
  const parts = [`${n(counts.m45Week)} earthquakes of magnitude 4.5 or more in the last 7 days`];
  if (counts.m6Week != null) parts[0] += `, ${n(counts.m6Week)} of magnitude 6 or more`;
  const out = [`${parts[0]}.`];
  if (counts.significantWeek != null) out.push(`USGS classed ${n(counts.significantWeek)} as significant, the number the Condition Index uses.`);
  return out.join(' ');
}

// Short names for the phone version of the monitor line ("Main driver: …").
export const SHORT_NAME = { conflictDeaths: 'conflict deaths', conflictNews: 'conflict news', quakes: 'earthquakes', naturalEvents: 'storms and volcanoes', aiLayoffs: 'job cuts citing AI' };

/** "conflict deaths": the signal with the most points, by its short name. */
export function mainDriver(index) {
  const top = contributions(index)[0];
  return top ? SHORT_NAME[top.id] ?? top.name : null;
}
