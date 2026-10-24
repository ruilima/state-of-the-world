// How old a data file may be before the page calls it delayed. Shared by the
// source health lines and the monitor, and imported by the tests.

// How often each source should refresh (minutes). Older than 3× → delayed.
export const EXPECT_MIN = { usgs: 30, eonet: 30, 'gdelt-events': 30, 'gdelt-doc': 30, pulse: 30, curated: 30, index: 30, ucdp: 1440, worldbank: 1440, digest: 1440 };

/** True when the file is marked stale or its last success is older than 3× its refresh. */
export function isLate(id, file, now = Date.now()) {
  const ageMin = (now - Date.parse(file.lastSuccessAt)) / 60000;
  return file.status === 'stale' || ageMin > 3 * (EXPECT_MIN[id] ?? 60);
}

// ---------- state stamps ----------
// The sources behind each state stamp, each with a window that follows how
// often it really publishes. A stamp says DATA OUTDATED only when every
// source behind it is outside its window; when only some are, the page keeps
// the computed state and names the delayed ones.

const DAY = 864e5;
const monthNo = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + m - 1; };
const fileLate = (id, file, now) => !file?.lastSuccessAt || isLate(id, file, now);

/** The Challenger report expected after the newest month in `monthly`, or null. */
export function nextChallengerReport(layoffs) {
  const newest = layoffs.monthly.map((r) => r.month).sort().at(-1) ?? '';
  return layoffs.releaseCalendar?.releases.find((r) => r.month > newest) ?? null;
}

export const STAMP_SOURCES = {
  'gdelt-events': { name: 'GDELT (event files)', late: (f, now) => fileLate('gdelt-events', f['gdelt-events'], now) },
  usgs: { name: 'USGS (earthquakes)', late: (f, now) => fileLate('usgs', f.usgs, now) },
  eonet: { name: 'NASA EONET', late: (f, now) => fileLate('eonet', f.eonet, now) },
  worldbank: { name: 'World Bank', late: (f, now) => fileLate('worldbank', f.worldbank, now) },
  // Downloaded daily, but the data is monthly: also late when the newest
  // month is more than 2 months before the current one.
  ucdp: {
    name: 'UCDP',
    late: (f, now) => {
      const newest = f.ucdp?.data?.monthly?.at(-1)?.month;
      const d = new Date(now);
      return fileLate('ucdp', f.ucdp, now) || !newest || d.getUTCFullYear() * 12 + d.getUTCMonth() - monthNo(newest) > 2;
    },
  },
  // Monthly report on a published calendar: late 3 days after the date the
  // next report was due.
  layoffs: {
    name: 'Challenger report',
    late: (f, now) => {
      const l = f.curated?.data?.layoffs;
      if (!l) return true;
      if (!l.releaseCalendar) return (now - Date.parse(l.updatedAt)) / DAY > (l.maxAgeDays ?? 35);
      const next = nextChallengerReport(l);
      return !next || now >= Date.parse(next.expectedAt) + 3 * DAY;
    },
  },
  // Set once a year, in January: late 13 months after it was set.
  doomsday: {
    name: 'Doomsday Clock',
    late: (f, now) => {
      const set = f.curated?.data?.doomsday?.current?.setAt;
      if (!set) return true;
      const due = new Date(set);
      due.setUTCMonth(due.getUTCMonth() + 13);
      return now > due.getTime();
    },
  },
};

// Which stamp source each index signal comes from.
export const SIGNAL_SOURCE = { conflictNews: 'gdelt-events', conflictDeaths: 'ucdp', quakes: 'usgs', naturalEvents: 'eonet', aiLayoffs: 'layoffs', doomsday: 'doomsday' };

/** { outdated, late: [names] } for the stamp sources `ids`. */
export function stampFreshness(ids, files, now = Date.now()) {
  const late = ids.filter((id) => STAMP_SOURCES[id].late(files, now));
  return { outdated: ids.length > 0 && late.length === ids.length, late: late.map((id) => STAMP_SOURCES[id].name) };
}

/** "1 source delayed: UCDP" / "2 sources delayed: UCDP and NASA EONET". */
export function delayedNote(names) {
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `${names.length} source${names.length > 1 ? 's' : ''} delayed: ${list}`;
}
