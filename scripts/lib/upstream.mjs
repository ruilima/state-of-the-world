// Endpoints and the expected shape of each raw upstream response.
// If an upstream changes format, assertSchema throws SchemaError, the fetch
// script keeps the last good file (status "stale", schemaChanged: true) and
// `npm run test:live` fails.
import { s } from './schema.mjs';

export const URLS = {
  gdeltDoc: 'https://api.gdeltproject.org/api/v2/doc/doc',
  gdeltLastUpdate: 'https://data.gdeltproject.org/gdeltv2/lastupdate.txt',
  gdeltExport: (stamp) => `https://data.gdeltproject.org/gdeltv2/${stamp}.export.CSV.zip`,
  usgs: (feed) => `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`,
  eonet: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30',
  worldBank: (country, indicator) =>
    `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=80`,
  ucdpDownloads: 'https://ucdp.uu.se/downloads/',
  ucdpApi: 'https://ucdpapi.pcr.uu.se/api',
  // Official HN search API (Algolia); the Firebase API has no search.
  hnSearch: (q) => `https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=40&query=${encodeURIComponent(q)}`,
  arxiv:
    'https://export.arxiv.org/api/query?search_query=' +
    encodeURIComponent('(abs:"labor market" OR abs:"labour market" OR abs:unemployment OR abs:"job displacement") AND (abs:"artificial intelligence" OR abs:"large language model")') +
    '&sortBy=submittedDate&sortOrder=descending&max_results=8',
};

export const RAW = {
  usgs: s.obj({
    type: s.str,
    metadata: s.obj({ generated: s.num, count: s.num, title: s.str }),
    features: s.arr(
      s.obj({
        id: s.str,
        properties: s.obj({
          mag: s.nullable(s.num),
          place: s.nullable(s.str),
          time: s.num,
          url: s.str,
          sig: s.num,
          alert: s.nullable(s.str),
          tsunami: s.num,
        }),
        geometry: s.obj({ coordinates: s.arr(s.num, { min: 3 }) }),
      }),
    ),
  }),

  eonet: s.obj({
    events: s.arr(
      s.obj({
        id: s.str,
        title: s.str,
        closed: s.nullable(s.str),
        categories: s.arr(s.obj({ id: s.str, title: s.str }), { min: 1 }),
        sources: s.arr(s.obj({ url: s.str })),
        geometry: s.arr(s.obj({ date: s.str, type: s.str, coordinates: s.any }), { min: 1 }),
      }),
    ),
  }),

  worldBankMeta: s.obj({ page: s.num, total: s.num, lastupdated: s.str }),
  worldBankRows: s.arr(
    s.obj({ date: s.str, value: s.nullable(s.num), countryiso3code: s.str, indicator: s.obj({ id: s.str, value: s.str }) }),
    { min: 1 },
  ),

  // GDELT returns {} (no "articles" key) when a query has no matches.
  gdeltArtList: s.obj(
    { articles: s.arr(s.obj({ url: s.str, title: s.str, seendate: s.str, domain: s.str, language: s.str })) },
    { optional: ['articles'] },
  ),
  gdeltTimeline: s.obj({
    timeline: s.arr(s.obj({ series: s.str, data: s.arr(s.obj({ date: s.str, value: s.num })) })),
  }),

  ucdpGedRow: s.obj({
    id: s.str,
    date_start: s.str,
    type_of_violence: s.oneOf('1', '2', '3'),
    best: s.str,
    country: s.str,
    latitude: s.str,
    longitude: s.str,
  }),
  ucdpBrdRow: s.obj({ year: s.str, bd_best: s.str, conflict_id: s.str, type_of_conflict: s.str }),
  ucdpApiPage: s.obj({
    TotalCount: s.num,
    NextPageUrl: s.nullable(s.str),
    Result: s.arr(s.obj({ id: s.num, date_start: s.str, type_of_violence: s.num, best: s.num, country: s.str, latitude: s.num, longitude: s.num })),
  }),

  hnSearch: s.obj({
    nbHits: s.num,
    hits: s.arr(s.obj({ objectID: s.str, title: s.str, created_at: s.str, url: s.nullable(s.str), points: s.nullable(s.num) }, { optional: ['url'] })),
  }),
};

// GDELT 2.0 event export: tab-separated, 61 columns, no header.
export const GDELT_COLS = {
  count: 61,
  isRootEvent: 25,
  quadClass: 29,
  goldstein: 30,
  numArticles: 33,
  avgTone: 34,
  actionGeoName: 52,
  actionGeoCountry: 53,
  lat: 56,
  lon: 57,
};
