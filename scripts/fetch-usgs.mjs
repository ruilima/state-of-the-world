// USGS earthquake GeoJSON feeds. Updated every minute upstream, no key.
import { runSource, http } from './lib/io.mjs';
import { assertSchema } from './lib/schema.mjs';
import { URLS, RAW } from './lib/upstream.mjs';

const simplify = (f) => {
  const [lon, lat, depth] = f.geometry.coordinates;
  const p = f.properties;
  return {
    id: f.id,
    mag: p.mag,
    place: p.place,
    time: new Date(p.time).toISOString(),
    lon: round(lon, 2),
    lat: round(lat, 2),
    depthKm: round(depth, 1),
    alert: p.alert,
    tsunami: p.tsunami === 1,
    url: p.url,
  };
};
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

export const run = () =>
  runSource({
    id: 'usgs',
    source: { name: 'USGS Earthquake Hazards Program', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php', license: 'Public domain (U.S. Government)' },
    async fetchData() {
      const week = assertSchema('usgs', RAW.usgs, await http(URLS.usgs('4.5_week')));
      const significant = assertSchema('usgs', RAW.usgs, await http(URLS.usgs('significant_month')));
      const quakes = week.features.map(simplify).sort((a, b) => b.mag - a.mag);
      const weekAgo = Date.now() - 7 * 864e5;
      const sigWeek = significant.features.filter((f) => f.properties.time >= weekAgo);
      return {
        data: {
          upstreamGeneratedAt: new Date(week.metadata.generated).toISOString(),
          counts: {
            m45Week: week.features.length,
            m6Week: quakes.filter((q) => q.mag >= 6).length,
            significantWeek: sigWeek.length,
            significantMonth: significant.features.length,
          },
          strongest: quakes[0] ?? null,
          significant: significant.features.map(simplify),
          quakes,
        },
      };
    },
  });

if (import.meta.url === `file://${process.argv[1]}`) await run();
