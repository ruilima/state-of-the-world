// C3S monthly bulletin data (ERA5 global surface air temperature vs 1850–1900).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBulletinCsv, summariseClimate, pickCsvLink, publishedOn, candidateMonths, bulletinUrl, HEADER } from '../scripts/fetch-climate.mjs';
import { http } from '../scripts/lib/io.mjs';

// The real file linked from the September 2026 bulletin.
const csv = readFileSync(new URL('./fixtures/c3s-bulletin-202609.csv', import.meta.url), 'utf8');

test('September 2026: 1.6340 above 1850–1900 reads as 1.63', () => {
  const { rows, updated } = parseBulletinCsv(csv);
  const sep = rows.find((r) => r.month === '2026-09');
  assert.equal(sep.anomaly, 1.634);
  assert.equal(sep.absolute, 16.2696);
  assert.equal(updated, '03 Oct 2026');
  const s = summariseClimate(rows);
  assert.equal(s.months.at(-1).anomaly, 1.63);
  assert.equal(s.months.at(-1).absolute, 16.27);
  assert.equal(s.months.length, 24);
  assert.equal(s.months[0].month, '2024-10');
});

test('the latest month is ranked against the same month of every year', () => {
  const s = summariseClimate(parseBulletinCsv(csv).rows);
  assert.deepEqual(s.rank, { position: 2, of: 87, since: '1940', warmerYears: ['2023'] });
});

test('the 12-month value is the mean of the last 12 monthly anomalies', () => {
  assert.equal(summariseClimate(parseBulletinCsv(csv).rows).mean12, 1.49);
});

test('a changed header fails loudly', () => {
  const changed = csv.replace(HEADER.join(','), 'month,2t,clim_91-20,ano_91-20,ano_pi');
  assert.throws(() => parseBulletinCsv(changed), (e) => e.name === 'SchemaError' && /expected header/.test(e.message + (e.errors ?? []).join()));
});

test('the 1850–1900 all-months link is picked whatever the figure number', () => {
  const base = 'https://climate.copernicus.eu/sites/default/files';
  const page = (...hrefs) => hrefs.map((h) => `<a href="${h}">x</a>`).join('');
  const fig1 = `${base}/2026-10/C3S_Bulletin_temp_202609_Fig1_timeseries_anomalies_ref1991-2020_global_September_DATA.csv`;
  const fig2b = `${base}/2026-09/C3S_Bulletin_temp_202608_Fig2b_timeseries_anomalies_ref1850-1900_global_allmonths_DATA.csv`;
  const supp = `${base}/2026-10/C3S_Bulletin_temp_202609_FigSupp2a_timeseries_anomalies_ref1850-1900_global_allmonths_DATA.csv`;
  const suffixed = `${base}/2026-10/C3S_Bulletin_temp_202609_Fig2_timeseries_anomalies_ref1850-1900_global_allmonths_DATA_0.csv`;
  const preind = `${base}/2026-10/C3S_Bulletin_temp_202609_Fig2_timeseries_era5_2t_anomalies_preindustrial_global_allmonths_DATA_0.csv`;
  assert.equal(pickCsvLink(page(fig1, fig2b)), fig2b);
  assert.equal(pickCsvLink(page(fig1, supp)), supp);
  assert.equal(pickCsvLink(page(fig1, suffixed)), suffixed);
  assert.equal(pickCsvLink(page(fig1, preind)), preind);
  // Relative links resolve on the C3S site; other hosts never count.
  assert.equal(pickCsvLink(page('/sites/default/files/2026-10/x_ref1850-1900_global_allmonths_DATA.csv')), 'https://climate.copernicus.eu/sites/default/files/2026-10/x_ref1850-1900_global_allmonths_DATA.csv');
  assert.equal(pickCsvLink(page('https://example.com/x_ref1850-1900_global_allmonths_DATA.csv', 'http://climate.copernicus.eu/y_ref1850-1900_global_allmonths_DATA.csv')), null);
  assert.equal(pickCsvLink(page(fig1)), null);
});

test('the publication date is read from the bulletins index', () => {
  const html = '<p><span style="color:red">12 October 2026</span></p><p><span>September 2026 highlights:</span></p>';
  assert.equal(publishedOn(html, '2026-09'), '2026-10-12');
  assert.equal(publishedOn(html, '2026-08'), null);
});

test('the bulletin tried is last month, then the month before', () => {
  assert.deepEqual(candidateMonths(new Date('2026-11-03T00:00:00Z')), ['2026-10', '2026-09']);
  assert.deepEqual(candidateMonths(new Date('2026-01-20T00:00:00Z')), ['2025-12', '2025-11']);
  assert.equal(bulletinUrl('2026-09'), 'https://climate.copernicus.eu/surface-air-temperature-september-2026');
});

const live = process.env.LIVE ? test : test.skip;
live('live: the latest C3S bulletin links a 1850–1900 CSV with the expected header', async () => {
  let page = null;
  for (const m of candidateMonths()) {
    try {
      page = await http(bulletinUrl(m), { as: 'text', timeout: 60000 });
      break;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  assert.ok(page, 'no bulletin page for the last two months');
  const url = pickCsvLink(page);
  assert.ok(url, 'no 1850-1900 CSV link');
  parseBulletinCsv(await http(url, { as: 'text', timeout: 60000 }));
});
