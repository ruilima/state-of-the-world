// World Bank Indicators API. No key, CC BY 4.0. Slow-moving annual data.
import { runSource, http, sleep } from './lib/io.mjs';
import { assertSchema, SchemaError } from './lib/schema.mjs';
import { URLS, RAW } from './lib/upstream.mjs';

const INDICATORS = [
  { id: 'FP.CPI.TOTL.ZG', name: 'Inflation', unit: '% per year' },
  { id: 'SL.UEM.TOTL.ZS', name: 'Unemployment', unit: '% of labour force' },
  { id: 'NY.GDP.MKTP.KD.ZG', name: 'GDP growth', unit: '% per year' },
];
const COUNTRIES = [
  { id: 'WLD', name: 'World' },
  { id: 'EUU', name: 'European Union' },
  { id: 'PRT', name: 'Portugal' },
];

export const run = () =>
  runSource({
    id: 'worldbank',
    source: { name: 'World Bank Open Data', url: 'https://data.worldbank.org/', license: 'CC BY 4.0' },
    async fetchData() {
      const indicators = [];
      for (const ind of INDICATORS) {
        const series = [];
        let lastUpdated = null;
        for (const c of COUNTRIES) {
          const body = await http(URLS.worldBank(c.id, ind.id));
          if (!Array.isArray(body) || body.length < 2) throw new SchemaError('worldbank', ['$: expected [metadata, rows] envelope']);
          const meta = assertSchema('worldbank', RAW.worldBankMeta, body[0]);
          const rows = assertSchema('worldbank', RAW.worldBankRows, body[1]);
          lastUpdated = meta.lastupdated;
          // Rows arrive newest first and include null years; keep real values only.
          const points = rows
            .filter((r) => r.value !== null)
            .map((r) => ({ year: Number(r.date), value: Math.round(r.value * 100) / 100 }))
            .sort((a, b) => a.year - b.year)
            .slice(-15);
          series.push({ country: c.id, countryName: c.name, latest: points.at(-1) ?? null, points });
          await sleep(300);
        }
        indicators.push({ ...ind, lastUpdated, series });
      }
      return { data: { indicators } };
    },
  });

if (import.meta.url === `file://${process.argv[1]}`) await run();
