// Publishes the hand-maintained files in data/curated/ as public/data/curated.json.
// They are validated here, so a typo in a curated file fails the run instead
// of breaking the page.
import { join } from 'node:path';
import { runSource, readJson, ROOT } from './lib/io.mjs';
import { assertSchema } from './lib/schema.mjs';
import { CURATED } from './lib/curated-schema.mjs';
import { missingCalendarYear } from '../public/freshness.js';

const dir = join(ROOT, 'data', 'curated');

export const run = () =>
  runSource({
    id: 'curated',
    source: { name: 'Hand-curated files (data/curated/)', url: null, license: 'See the source of each value' },
    async fetchData() {
      const out = {};
      for (const name of ['layoffs', 'doomsday', 'horizons']) {
        const value = await readJson(join(dir, `${name}.json`));
        if (!value) throw new Error(`data/curated/${name}.json is missing or not valid JSON`);
        out[name] = assertSchema(`curated/${name}`, CURATED[name], value);
      }
      const year = missingCalendarYear(out.layoffs);
      if (year) console.warn(`curated: release calendar for ${year} missing (data/curated/layoffs.json, releaseCalendar)`);
      return { data: out };
    },
  });

if (import.meta.url === `file://${process.argv[1]}`) await run();
