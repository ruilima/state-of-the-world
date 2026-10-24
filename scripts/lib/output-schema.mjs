// Shape of the files we publish in public/data/. The site relies on these;
// test/schema.test.mjs checks every published file against them.
import { s } from './schema.mjs';
import { CURATED } from './curated-schema.mjs';

const status = s.oneOf('ok', 'partial', 'stale', 'error', 'disabled');
export const envelope = (data) =>
  s.obj(
    { id: s.str, source: s.obj({ name: s.str }), status, fetchedAt: s.str, lastSuccessAt: s.nullable(s.str), error: s.nullable(s.str), data: s.nullable(data) },
  );
const point = { lat: s.num, lon: s.num };

export const OUTPUT = {
  usgs: envelope(
    s.obj({
      counts: s.obj({ m45Week: s.num, m6Week: s.num, significantWeek: s.num, significantMonth: s.num }),
      quakes: s.arr(s.obj({ id: s.str, mag: s.nullable(s.num), place: s.nullable(s.str), time: s.str, ...point, depthKm: s.num, url: s.str })),
      significant: s.arr(s.obj({ id: s.str, mag: s.nullable(s.num), time: s.str, url: s.str })),
    }),
  ),
  eonet: envelope(s.obj({ open: s.num, byCategory: s.map(s.num), events: s.arr(s.obj({ id: s.str, title: s.str, category: s.str, categoryName: s.str, ...point, url: s.str })) })),
  'gdelt-events': envelope(
    s.obj({
      latestBucket: s.str,
      materialShare24h: s.nullable(s.num),
      materialShare7d: s.nullable(s.num),
      daily: s.arr(s.obj({ date: s.str, total: s.num, material: s.num, materialShare: s.num }), { min: 1 }),
      buckets: s.arr(s.obj({ t: s.str, total: s.num, material: s.num }), { min: 1 }),
    }),
  ),
  'gdelt-doc': envelope(
    s.obj({
      queries: s.map(s.obj({ key: s.str, mode: s.oneOf('artlist', 'timelinevol'), status: s.oneOf('ok', 'stale', 'error'), items: s.arr(s.any) })),
    }),
  ),
  pulse: envelope(s.obj({ hn: s.arr(s.obj({ title: s.str, date: s.str, url: s.str })), arxiv: s.arr(s.obj({ title: s.str, date: s.str, url: s.str })) })),
  worldbank: envelope(
    s.obj({
      indicators: s.arr(
        s.obj({ id: s.str, name: s.str, unit: s.str, lastUpdated: s.nullable(s.str), series: s.arr(s.obj({ country: s.str, countryName: s.str, points: s.arr(s.obj({ year: s.num, value: s.num })) })) }),
        { min: 1 },
      ),
    }),
  ),
  ucdp: envelope(
    s.obj({
      annual: s.arr(s.obj({ year: s.num, deaths: s.num, conflicts: s.num }), { min: 10 }),
      monthly: s.arr(s.obj({ month: s.str, deaths: s.num, events: s.num, byType: s.map(s.num) })),
      latestMonth: s.nullable(s.str),
      topCountries: s.arr(s.obj({ country: s.str, deaths: s.num })),
      points: s.arr(s.obj({ ...point, deaths: s.num, events: s.num })),
    }),
  ),
  climate: envelope(
    s.obj({
      month: s.str,
      rank: s.obj({ position: s.num, of: s.num, since: s.str, warmerYears: s.arr(s.str) }),
      twelveMonth: s.nullable(s.obj({ value: s.num, from: s.str, to: s.str, basis: s.str })),
      months: s.arr(s.obj({ month: s.str, anomaly: s.num, absolute: s.num }), { min: 12 }),
      publishedAt: s.nullable(s.str),
      dataUpdated: s.nullable(s.str),
      bulletinUrl: s.str,
      csvUrl: s.str,
    }),
  ),
  curated: envelope(s.obj({ layoffs: CURATED.layoffs, doomsday: CURATED.doomsday, horizons: CURATED.horizons })),
  digest: envelope(s.obj({ label: s.str, paragraphs: s.arr(s.obj({ text: s.str, sources: s.arr(s.obj({ title: s.str, url: s.str })) })) })),
  index: envelope(
    s.obj({
      value: s.nullable(s.num),
      state: s.oneOf('stable', 'caution', 'danger'),
      bpm: s.nullable(s.num),
      signals: s.arr(s.obj({ id: s.str, name: s.str, value: s.nullable(s.num), score: s.nullable(s.num), weight: s.num, effectiveWeight: s.num, missing: s.nullable(s.str) }), { min: 1 }),
      history: s.arr(s.obj({ t: s.str, value: s.num, state: s.str })),
    }),
  ),
};
