// How old a data file may be before the page calls it delayed. Shared by the
// source health lines and the monitor, and imported by the tests.

// How often each source should refresh (minutes). Older than 3× → delayed.
export const EXPECT_MIN = { usgs: 30, eonet: 30, 'gdelt-events': 30, 'gdelt-doc': 30, pulse: 30, curated: 30, index: 30, ucdp: 1440, worldbank: 1440, digest: 1440 };

/** True when the file is marked stale or its last success is older than 3× its refresh. */
export function isLate(id, file, now = Date.now()) {
  const ageMin = (now - Date.parse(file.lastSuccessAt)) / 60000;
  return file.status === 'stale' || ageMin > 3 * (EXPECT_MIN[id] ?? 60);
}
