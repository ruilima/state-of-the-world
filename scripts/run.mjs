// Entry point for CI and local runs:
//   node scripts/run.mjs fast   — every 30 min: GDELT, USGS, EONET, pulse, curated, index
//   node scripts/run.mjs slow   — daily: World Bank, UCDP, digest, then index
//   node scripts/run.mjs all
// Sources run one after another (GDELT asks for serial requests) and a
// failing source never stops the others. The process exits non-zero only
// when an upstream format changed, so CI flags it without blocking deploys.
import * as gdeltEvents from './fetch-gdelt-events.mjs';
import * as gdeltDoc from './fetch-gdelt-doc.mjs';
import * as usgs from './fetch-usgs.mjs';
import * as eonet from './fetch-eonet.mjs';
import * as pulse from './fetch-pulse.mjs';
import * as worldbank from './fetch-worldbank.mjs';
import * as ucdp from './fetch-ucdp.mjs';
import * as digest from './fetch-digest.mjs';
import * as curated from './build-curated.mjs';
import * as index from './compute-index.mjs';
import { writeJson, readJson, OUT_DIR } from './lib/io.mjs';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';

const GROUPS = {
  fast: [usgs, eonet, gdeltEvents, gdeltDoc, pulse, curated],
  slow: [worldbank, ucdp, curated, digest],
};
// Fast first: the AI summary (slow group) reads the headlines the fast group fetches.
GROUPS.all = [...new Set([...GROUPS.fast, ...GROUPS.slow])];

const group = process.argv[2] ?? 'fast';
if (!GROUPS[group]) {
  console.error(`unknown group "${group}" (use fast, slow or all)`);
  process.exit(2);
}

const results = [];
for (const mod of GROUPS[group]) results.push(await mod.run());
await index.run();

// Manifest: one small file the browser reads first to show per-source health.
const manifest = {};
for (const f of (await readdir(OUT_DIR)).filter((f) => f.endsWith('.json') && f !== 'manifest.json')) {
  const d = await readJson(join(OUT_DIR, f));
  if (!d?.id) continue;
  manifest[d.id] = { status: d.status, fetchedAt: d.fetchedAt, lastSuccessAt: d.lastSuccessAt, error: d.error ?? null, mode: d.mode ?? null };
}
await writeJson(join(OUT_DIR, 'manifest.json'), { generatedAt: new Date().toISOString(), sources: manifest });

const schemaChanged = results.filter((r) => r?.schemaChanged);
if (schemaChanged.length) {
  console.error(`upstream format changed: ${schemaChanged.map((r) => r.id).join(', ')}`);
  process.exit(1);
}
