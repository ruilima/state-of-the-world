// Condition Index: combines the signals listed in config/index.json into
// one 0–100 value and a state (stable / caution / danger) with hysteresis.
// Reads public/data/*.json, writes public/data/index.json.
import { join } from 'node:path';
import { readJson, writeJson, OUT_DIR, ROOT } from './lib/io.mjs';

const HISTORY_MAX = 7 * 48; // one week at one run every 30 minutes

// "data.monthly[-1].deaths" -> value. Negative indices count from the end.
export function getPath(obj, path) {
  return path.split('.').reduce((acc, part) => {
    if (acc == null) return undefined;
    const m = part.match(/^(\w+)\[(-?\d+)\]$/);
    if (!m) return acc[part];
    const arr = acc[m[1]];
    return Array.isArray(arr) ? arr.at(Number(m[2])) : undefined;
  }, obj);
}

export const scale = (value, calm, alarm) => {
  const t = (value - calm) / (alarm - calm);
  return Math.round(Math.min(1, Math.max(0, t)) * 1000) / 10;
};

// Latest Challenger month divided by the mean of the 12 months before it.
function layoffRatio(file) {
  const rows = [...(file?.data?.layoffs?.monthly ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  if (rows.length < 4) return { value: undefined, reason: 'monthly job-cut series not filled in yet (data/curated/layoffs.json)' };
  const last = rows.at(-1);
  const before = rows.slice(-13, -1);
  const mean = before.reduce((a, r) => a + r.aiCited, 0) / before.length;
  if (!mean) return { value: undefined, reason: 'average of the previous months is zero' };
  return { value: Math.round((last.aiCited / mean) * 100) / 100 };
}

/**
 * Hysteresis: moving up a state needs the index to pass threshold + h;
 * moving down needs it to fall below threshold - h. Prevents the monitor
 * flipping between states on every small update.
 */
export function nextState(prev, value, { caution, danger, hysteresis: h }) {
  if (!prev) return value >= danger ? 'danger' : value >= caution ? 'caution' : 'stable';
  const up = (t) => value >= t + h;
  const down = (t) => value < t - h;
  if (prev === 'stable') return up(danger) ? 'danger' : up(caution) ? 'caution' : 'stable';
  if (prev === 'caution') return up(danger) ? 'danger' : down(caution) ? 'stable' : 'caution';
  return down(caution) ? 'stable' : down(danger) ? 'caution' : 'danger';
}

export function computeIndex(config, files, now = Date.now()) {
  const signals = [];
  for (const sig of config.signals) {
    const file = files[sig.source];
    const base = { id: sig.id, name: sig.name, explain: sig.explain, unit: sig.unit, calm: sig.calm, alarm: sig.alarm, weight: sig.weight, source: sig.source };
    if (!file?.data) { signals.push({ ...base, value: null, score: null, missing: `no data from ${sig.source}` }); continue; }
    const ageH = file.lastSuccessAt ? (now - Date.parse(file.lastSuccessAt)) / 36e5 : Infinity;
    if (ageH > sig.maxAgeHours) { signals.push({ ...base, value: null, score: null, missing: `${sig.source} data older than ${sig.maxAgeHours} h` }); continue; }

    let value;
    let reason;
    if (sig.special === 'layoffRatio') ({ value, reason } = layoffRatio(file));
    else if (sig.sum) value = sig.sum.reduce((a, p) => a + (Number(getPath(file, p)) || 0), 0);
    else value = getPath(file, sig.path);

    if (typeof value !== 'number' || Number.isNaN(value)) { signals.push({ ...base, value: null, score: null, missing: reason ?? 'value unavailable' }); continue; }
    signals.push({ ...base, value, score: scale(value, sig.calm, sig.alarm), missing: null });
  }

  const used = signals.filter((s) => s.score !== null);
  const totalWeight = used.reduce((a, s) => a + s.weight, 0);
  const value = totalWeight ? Math.round((used.reduce((a, s) => a + s.score * s.weight, 0) / totalWeight) * 10) / 10 : null;
  for (const s of signals) s.effectiveWeight = s.score === null || !totalWeight ? 0 : Math.round((s.weight / totalWeight) * 1000) / 10;
  return { value, signals, weightCovered: totalWeight, weightTotal: config.signals.reduce((a, s) => a + s.weight, 0) };
}

export async function run() {
  const config = await readJson(join(ROOT, 'config', 'index.json'));
  const ids = [...new Set(config.signals.map((s) => s.source))];
  const files = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await readJson(join(OUT_DIR, `${id}.json`))])));
  const prev = await readJson(join(OUT_DIR, 'index.json'));
  const now = new Date();

  const { value, signals, weightCovered, weightTotal } = computeIndex(config, files, now.getTime());
  const state = value === null ? prev?.data?.state ?? 'stable' : nextState(prev?.data?.state, value, config.states);
  const bpm = value === null ? null : Math.round(config.pulse.minBpm + value * config.pulse.bpmPerPoint);
  const history = [...(prev?.data?.history ?? []), ...(value === null ? [] : [{ t: now.toISOString(), value, state }])].slice(-HISTORY_MAX);

  const out = {
    id: 'index',
    source: { name: 'Own calculation (config/index.json)', url: null, license: null },
    status: value === null ? 'error' : 'ok',
    fetchedAt: now.toISOString(),
    lastSuccessAt: value === null ? prev?.lastSuccessAt ?? null : now.toISOString(),
    error: value === null ? 'no signal available' : null,
    data: { value, state, bpm, thresholds: config.states, weightCovered, weightTotal, signals, history, description: config.description },
  };
  await writeJson(join(OUT_DIR, 'index.json'), out);
  console.log(`index  ${value} ${state} (${weightCovered}/${weightTotal} of weight covered)`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
