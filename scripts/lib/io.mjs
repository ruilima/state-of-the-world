import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT_DIR = join(ROOT, 'public', 'data');
export const UA = 'world-vitals/1.0 (+https://worldvitals.org)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  // Write-then-rename so a crash never leaves a half-written file behind.
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 1) + '\n');
  await rename(tmp, path);
}

export async function http(url, { headers = {}, timeout = 30000, as = 'json', retries = 1, retryDelay = 5000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(retryDelay * attempt);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, ...headers },
        signal: AbortSignal.timeout(timeout),
        redirect: 'follow',
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 160).replace(/\s+/g, ' ');
        const err = new Error(`HTTP ${res.status} from ${new URL(url).host}: ${body}`);
        err.status = res.status;
        throw err;
      }
      if (as === 'json') return JSON.parse(await res.text());
      if (as === 'text') return await res.text();
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      // Client errors other than rate limiting will not fix themselves.
      if (err.status && err.status < 500 && err.status !== 429) break;
    }
  }
  throw lastErr;
}

/**
 * Run one source and write public/data/<id>.json.
 * On failure the last good payload is kept and marked status "stale",
 * so the site never goes blank because one upstream had a bad minute.
 */
export async function runSource({ id, source, fetchData }) {
  const path = join(OUT_DIR, `${id}.json`);
  const prev = await readJson(path);
  const now = new Date().toISOString();
  try {
    const { data, meta = {} } = await fetchData({ prev });
    // meta may override status with "partial" when some sub-requests failed.
    const out = { id, source, status: 'ok', fetchedAt: now, lastSuccessAt: now, error: null, ...meta, data };
    await writeJson(path, out);
    console.log(`${out.status.padEnd(6)} ${id}`);
    return out;
  } catch (err) {
    const message = String(err?.message || err).slice(0, 400);
    const out = prev?.data
      ? { ...prev, status: 'stale', fetchedAt: now, error: message, schemaChanged: err?.name === 'SchemaError' }
      : { id, source, status: 'error', fetchedAt: now, lastSuccessAt: null, error: message, schemaChanged: err?.name === 'SchemaError', data: null };
    await writeJson(path, out);
    console.error(`${out.status.padEnd(6)} ${id}: ${message}`);
    return out;
  }
}

/** RFC 4180 CSV parser (quoted fields, embedded commas and newlines). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}
