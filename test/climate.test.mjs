// C3S monthly bulletin data (ERA5 global surface air temperature vs 1850–1900).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBulletinCsv, summariseClimate, pickCsvLink, pick12mLink, parse12mCsv, twelveMonthSentence, chooseTwelveMonth, publishedOn, candidateMonths, bulletinUrl, HEADER } from '../scripts/fetch-climate.mjs';
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

test('the 12-month mean from the unrounded values: 17.9357 / 12 = 1.4946, shown as 1.49', () => {
  // ano_pi, October 2025 to September 2026, as in the September 2026 bulletin file.
  const values = [1.5454, 1.5392, 1.4165, 1.4709, 1.4907, 1.4803, 1.433, 1.4203, 1.3886, 1.4711, 1.6457, 1.634];
  const rows = parseBulletinCsv(csv).rows.slice(-12);
  assert.deepEqual(rows.map((r) => r.anomaly), values);
  const sum = values.reduce((a, v) => a + v, 0);
  assert.equal(Math.round(sum * 1e4) / 1e4, 17.9357);
  assert.equal(Math.round((sum / 12) * 1e4) / 1e4, 1.4946);
  // Close to 1.495, so our own mean is not shown: the page uses C3S's
  // 12-month figure (1.50) instead, and the data file carries no mean of ours.
  assert.equal(summariseClimate(parseBulletinCsv(csv).rows).mean12, undefined);
});

// The September 2026 bulletin's 12-month file (vs 1991–2020), header and last rows.
const csv12 = [
  'Twelve-month average surface air temperature anomalies',
  'Data source: ERA5',
  'Reference period: 1991-2020',
  '',
  'Month,Global,European',
  '202607,0.5717,0.8011',
  '202608,0.6018,0.8689',
  '202609,0.6151,0.8943',
].join('\n');
const sentenceHtml = '<p>The average global temperature for the last 12 months (October 2025 to September 2026) was 0.62&#176;C above the 1991-2020 average, and 1.50&#176;C above the 1850-1900 pre-industrial average .</p>';

test('the 12-month file: 0.6151 vs 1991–2020 + 0.88 = 1.4951, shown as 1.50', () => {
  assert.equal(parse12mCsv(csv12, '2026-09'), 0.6151);
  assert.deepEqual(chooseTwelveMonth(null, 0.6151, '2026-09'), { value: 1.5, from: '2025-10', to: '2026-09', basis: '12-month file' });
  assert.throws(() => parse12mCsv(csv12.replace('Month,Global,European', 'Month,World'), '2026-09'), /header/);
  assert.throws(() => parse12mCsv(csv12, '2026-10'), /no global value/);
  assert.equal(pick12mLink('<a href="https://climate.copernicus.eu/sites/default/files/2026-10/C3S_Bulletin_temp_202609_FigSupp1b_timeseries_era5_monthly_2t_anomaly_ref19912020_global_12month_average_DATA.csv">x</a>'), 'https://climate.copernicus.eu/sites/default/files/2026-10/C3S_Bulletin_temp_202609_FigSupp1b_timeseries_era5_monthly_2t_anomaly_ref19912020_global_12month_average_DATA.csv');
  assert.equal(pick12mLink('<a href="https://example.com/x_global_12month_average_DATA.csv">x</a>'), null);
});

test("the bulletin's 12-month sentence is read and preferred", () => {
  assert.deepEqual(twelveMonthSentence(sentenceHtml), { from: '2025-10', to: '2026-09', value: 1.5 });
  const warnings = [];
  assert.deepEqual(chooseTwelveMonth(twelveMonthSentence(sentenceHtml), 0.6151, '2026-09', (w) => warnings.push(w)), { value: 1.5, from: '2025-10', to: '2026-09', basis: 'bulletin text' });
  assert.deepEqual(warnings, []);
});

test('when the sentence and the file disagree, the sentence wins and the run logs it', () => {
  const warnings = [];
  const r = chooseTwelveMonth(twelveMonthSentence(sentenceHtml), 0.58, '2026-09', (w) => warnings.push(w));
  assert.equal(r.value, 1.5);
  assert.equal(r.basis, 'bulletin text');
  assert.match(warnings[0], /differs: bulletin text 1.5, 12-month file 1.46/);
  // A sentence about another period does not count.
  assert.equal(chooseTwelveMonth(twelveMonthSentence(sentenceHtml), null, '2026-10'), null);
});

test('with neither the sentence nor the file there is no 12-month line', () => {
  assert.equal(twelveMonthSentence('<p>No such sentence.</p>'), null);
  assert.equal(chooseTwelveMonth(null, null, '2026-09'), null);
});
