// GDELT 2.0 raw event exports (one zip every 15 minutes, no key, no rate
// limit). Used for the conflict signal: the share of coded events that are
// "material conflict" (QuadClass 4: assaults, fights, mass violence).
// We keep a rolling 7-day history of 15-minute buckets in the output file
// and only download buckets we don't have yet.
//
// Event locations are not mapped: GDELT geocodes where news mentions happen
// (Washington, New York...), not where fighting happens. The conflict map
// uses UCDP instead.
import { unzipSync, strFromU8 } from 'fflate';
import { join } from 'node:path';
import { runSource, http, OUT_DIR, readJson } from './lib/io.mjs';
import { SchemaError } from './lib/schema.mjs';
import { URLS, GDELT_COLS as C } from './lib/upstream.mjs';

const BUCKET_MS = 15 * 60 * 1000;
const KEEP_MS = 7 * 864e5;
const MAX_DOWNLOADS = Number(process.env.GDELT_MAX_DOWNLOADS ?? 24);

const stampToDate = (s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00Z`);
const dateToStamp = (d) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

export function parseExport(tsv) {
  const lines = tsv.split('\n').filter(Boolean);
  if (!lines.length) throw new SchemaError('gdelt-events', ['empty export file']);
  const bad = lines.slice(0, 20).filter((l) => l.split('\t').length !== C.count);
  if (bad.length) throw new SchemaError('gdelt-events', [`expected ${C.count} tab-separated columns, got ${bad[0].split('\t').length}`]);

  const bucket = { total: 0, verbal: 0, material: 0, goldsteinSum: 0 };
  for (const line of lines) {
    const f = line.split('\t');
    const quad = Number(f[C.quadClass]);
    if (!(quad >= 1 && quad <= 4)) continue;
    bucket.total++;
    bucket.goldsteinSum += Number(f[C.goldstein]) || 0;
    if (quad === 3) bucket.verbal++;
    if (quad === 4) bucket.material++;
  }
  return bucket;
}

export const run = () =>
  runSource({
    id: 'gdelt-events',
    source: { name: 'GDELT Project — Event Database 2.0', url: 'https://www.gdeltproject.org/', license: 'Uso livre com atribuição ao GDELT Project' },
    async fetchData() {
      const prev = await readJson(join(OUT_DIR, 'gdelt-events.json'));
      const latestLine = (await http(URLS.gdeltLastUpdate, { as: 'text' })).split('\n')[0];
      const m = latestLine.match(/(\d{14})\.export\.CSV\.zip/);
      if (!m) throw new SchemaError('gdelt-events', ['lastupdate.txt has no export file line']);
      const latest = stampToDate(m[1]).getTime();

      const have = new Map((prev?.data?.buckets ?? []).map((b) => [b.t, b]));

      // Newest first, so a capped run always fills the most recent gaps.
      const wanted = [];
      for (let t = latest; t > latest - KEEP_MS; t -= BUCKET_MS) {
        if (!have.has(new Date(t).toISOString())) wanted.push(t);
      }
      let downloaded = 0;
      let missing = 0;
      for (const t of wanted.slice(0, MAX_DOWNLOADS)) {
        let zip;
        try {
          zip = await http(URLS.gdeltExport(dateToStamp(new Date(t))), { as: 'bytes', timeout: 30000, retries: 0 });
        } catch (err) {
          // GDELT occasionally skips a 15-minute file; record and move on.
          if (err.status === 404) { missing++; continue; }
          throw err;
        }
        const files = unzipSync(zip);
        const b = parseExport(strFromU8(files[Object.keys(files)[0]]));
        const iso = new Date(t).toISOString();
        have.set(iso, { t: iso, total: b.total, verbal: b.verbal, material: b.material, goldsteinMean: round(b.goldsteinSum / (b.total || 1), 2) });
        downloaded++;
      }
      if (!have.size) throw new Error('no GDELT buckets available');

      const cutoff = latest - KEEP_MS;
      const buckets = [...have.values()].filter((b) => Date.parse(b.t) > cutoff).sort((a, b) => a.t.localeCompare(b.t));

      const dayAgo = latest - 864e5;
      const sum = (arr, k) => arr.reduce((a, b) => a + b[k], 0);
      const last24 = buckets.filter((b) => Date.parse(b.t) > dayAgo);
      const share = (arr) => (sum(arr, 'total') ? sum(arr, 'material') / sum(arr, 'total') : null);
      const share24h = share(last24);
      const share7d = share(buckets);

      // Daily series for the chart.
      const days = new Map();
      for (const b of buckets) {
        const d = b.t.slice(0, 10);
        const acc = days.get(d) ?? { date: d, total: 0, material: 0, verbal: 0 };
        acc.total += b.total; acc.material += b.material; acc.verbal += b.verbal;
        days.set(d, acc);
      }
      const daily = [...days.values()].map((d) => ({ ...d, materialShare: round(d.material / (d.total || 1), 4) }));

      return {
        meta: { coverage: { buckets: buckets.length, expected: KEEP_MS / BUCKET_MS, downloadedThisRun: downloaded, missingUpstream: missing } },
        data: {
          latestBucket: new Date(latest).toISOString(),
          materialShare24h: share24h === null ? null : round(share24h, 4),
          materialShare7d: share7d === null ? null : round(share7d, 4),
          ratio24hTo7d: share24h && share7d ? round(share24h / share7d, 3) : null,
          events24h: sum(last24, 'total'),
          material24h: sum(last24, 'material'),
          daily,
          buckets,
        },
      };
    },
  });

if (import.meta.url === `file://${process.argv[1]}`) await run();
