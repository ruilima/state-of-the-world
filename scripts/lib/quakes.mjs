// Tsunami warning centres (PTWC "pt", NTWC "at") publish fast preliminary
// solutions that the USGS normally merges into the reviewed event (their ids
// then appear in that event's `ids`). Now and then one is left unmerged,
// sometimes with a wrong date: on 25 Oct 2026 the M6.5 Bonin Islands quake
// (us6000u4r9, 02:09:23 UTC) also appeared twice as "M7, 24 Oct 02:09"
// (pt26297050, pt26298050), 0.3° away. Counted as three quakes, they raised
// the index and made a duplicate "the strongest of the week".
//
// Rule (measured on a year of both catalogues: 122 events M5+, 2 unmerged,
// both duplicates):
//   - an entry whose sources are only tsunami centres is dropped when an
//     event with any other source lies within 36 h, 150 km and 1.0 magnitude
//     of it (36 h covers a date one day off);
//   - unmerged tsunami-centre entries that repeat each other (same minute,
//     same 0.1°, same magnitude) are kept once;
//   - anything else stays, including a genuine quake only a tsunami centre
//     has reported.
const TWC = new Set(['pt', 'at']);
const WINDOW_MS = 36 * 3600e3;
const MAX_KM = 150;
const MAX_MAG_DIFF = 1.0;

/** The networks behind a feed entry (its `sources`, or its own network). */
export const sourcesOf = (f) => {
  const list = String(f.properties.sources ?? '').split(',').filter(Boolean);
  return list.length ? list : [f.properties.net ?? f.id.slice(0, 2)];
};
export const tsunamiCentreOnly = (f) => sourcesOf(f).every((s) => TWC.has(s));

/** Great-circle distance in km between two [lon, lat] points. */
export function km([lon1, lat1], [lon2, lat2]) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Removes unmerged tsunami-centre duplicates from `features` (GeoJSON
 * features). `reference` is every feature known in this run (both feeds), so
 * a duplicate in one feed is matched against the reviewed event in either.
 * Returns { kept, dropped: [{ id, reason, duplicateOf }] }.
 */
export function dropTsunamiCentreDuplicates(features, reference = features) {
  const others = reference.filter((f) => !tsunamiCentreOnly(f));
  const dropped = [];
  const seen = new Map();
  const kept = [];
  for (const f of features) {
    if (!tsunamiCentreOnly(f)) {
      kept.push(f);
      continue;
    }
    const p = f.properties;
    const match = others.find((o) => {
      const dm = p.mag != null && o.properties.mag != null ? Math.abs(p.mag - o.properties.mag) : 0;
      return Math.abs(o.properties.time - p.time) <= WINDOW_MS && km(f.geometry.coordinates, o.geometry.coordinates) <= MAX_KM && dm <= MAX_MAG_DIFF;
    });
    if (match) {
      dropped.push({ id: f.id, reason: 'tsunami-centre duplicate of a reviewed event', duplicateOf: match.id });
      continue;
    }
    const [lon, lat] = f.geometry.coordinates;
    const key = `${Math.floor(p.time / 60000)}|${lat.toFixed(1)}|${lon.toFixed(1)}|${p.mag}`;
    if (seen.has(key)) {
      dropped.push({ id: f.id, reason: 'repeat of another tsunami-centre entry', duplicateOf: seen.get(key) });
      continue;
    }
    seen.set(key, f.id);
    kept.push(f);
  }
  return { kept, dropped };
}
