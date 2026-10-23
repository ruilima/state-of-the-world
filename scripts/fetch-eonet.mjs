// NASA EONET v3: open natural events (wildfires, storms, volcanoes...), no key.
import { runSource, http } from './lib/io.mjs';
import { assertSchema } from './lib/schema.mjs';
import { URLS, RAW } from './lib/upstream.mjs';

const CATEGORY_PT = {
  wildfires: 'Incêndios',
  severeStorms: 'Tempestades',
  volcanoes: 'Vulcões',
  seaLakeIce: 'Gelo marinho e lacustre',
  floods: 'Cheias',
  drought: 'Seca',
  dustHaze: 'Poeira e neblina',
  earthquakes: 'Sismos',
  landslides: 'Deslizamentos',
  manmade: 'Origem humana',
  snow: 'Neve',
  tempExtremes: 'Temperaturas extremas',
  waterColor: 'Cor da água',
};

// Point geometries are used as-is; polygons collapse to the average vertex.
function lastPoint(geometry) {
  const g = geometry[geometry.length - 1];
  if (g.type === 'Point') return { lon: g.coordinates[0], lat: g.coordinates[1], date: g.date };
  const ring = g.coordinates?.[0] ?? [];
  const n = ring.length || 1;
  const sum = ring.reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
  return { lon: sum[0] / n, lat: sum[1] / n, date: g.date };
}

export const run = () =>
  runSource({
    id: 'eonet',
    source: { name: 'NASA EONET v3', url: 'https://eonet.gsfc.nasa.gov/', license: 'Domínio público (NASA)' },
    async fetchData() {
      const raw = assertSchema('eonet', RAW.eonet, await http(URLS.eonet, { timeout: 45000 }));
      const events = raw.events.map((e) => {
        const p = lastPoint(e.geometry);
        const cat = e.categories[0].id;
        return {
          id: e.id,
          title: e.title,
          category: cat,
          categoryPt: CATEGORY_PT[cat] ?? e.categories[0].title,
          date: p.date,
          lon: Math.round(p.lon * 100) / 100,
          lat: Math.round(p.lat * 100) / 100,
          url: e.sources[0]?.url ?? `https://eonet.gsfc.nasa.gov/api/v3/events/${e.id}`,
        };
      });
      const byCategory = {};
      for (const e of events) byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
      return { data: { open: events.length, byCategory, categoryNames: CATEGORY_PT, events } };
    },
  });

if (import.meta.url === `file://${process.argv[1]}`) await run();
