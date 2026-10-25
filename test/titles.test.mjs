// GDELT title spacing is undone in two cases only ("AI - driven", "28 %");
// earthquake magnitudes always carry one decimal ("M7.0").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanTitle } from '../scripts/fetch-gdelt-doc.mjs';
import { collectHeadlines, unsupportedNames } from '../scripts/fetch-digest.mjs';

test('cleanTitle joins a hyphen between a letter and a lower-case letter, and a number and %', () => {
  assert.equal(cleanTitle('Three killed in Saudi air strike on Sanaa, says Houthi - linked media'), 'Three killed in Saudi air strike on Sanaa, says Houthi-linked media');
  assert.equal(cleanTitle('Barclays to cut 5,000 jobs in AI - driven push to lower costs'), 'Barclays to cut 5,000 jobs in AI-driven push to lower costs');
  assert.equal(cleanTitle('NAB staff forced to re - apply for their own jobs'), 'NAB staff forced to re-apply for their own jobs');
  assert.equal(cleanTitle('a - b - c'), 'a-b-c');
  assert.equal(cleanTitle('American Express to cut 3,500 jobs despite 28 % profit surge'), 'American Express to cut 3,500 jobs despite 28% profit surge');
  assert.equal(cleanTitle('Profits up 12.5 % as jobs go'), 'Profits up 12.5% as jobs go');
  // GDELT's own tokenising, undone together.
  assert.equal(cleanTitle('cut 5 , 000 jobs , 28 % of staff in AI - led plan'), 'cut 5,000 jobs, 28% of staff in AI-led plan');
});

test('cleanTitle leaves dashes, separators, capitalised pairs, dates and ranges alone', () => {
  for (const t of [
    'One man killed following missile strike on Lozova – Synehubov',
    'Ceasefire holds — for now',
    'Houthis claim 7 attacks on Saudi targets as heavy airstrikes hit Yemen - Xinhua',
    'Talks between A - B resume',
    'Russia - Ukraine talks on 24 Oct 2026',
    'Strikes on Oct 24 - 25 kill 12',
    'Season 2025 - 2026 cut short',
    'Between 5 - 10 jobs a day',
    'Jobs cut by 5 - 10%',
    'Already-hyphenated words stay',
    '100% of staff',
    'Gaza - live updates',
    'Yemen - analysis',
    'Sudan war - latest news as RSF advances',
    'Strike on port - video',
    'Ceasefire talks - opinion',
    'Barclays cuts jobs - report',
  ]) assert.equal(cleanTitle(t), t, t);
  // A tail word inside a longer word does not block the join.
  assert.equal(cleanTitle('AI - livestreamed layoffs'), 'AI-livestreamed layoffs');
});

test('the name rule still matches cleaned titles', () => {
  const cited = [{ title: cleanTitle('Three killed in Saudi air strike on Sanaa, says Houthi - linked media'), source: 'middleeasteye.net', url: 'https://www.middleeasteye.net/c' }];
  assert.deepEqual(unsupportedNames('middleeasteye.net says Houthi-linked media report three killed in Sanaa.', cited), []);
  assert.deepEqual(unsupportedNames('middleeasteye.net says Houthi - linked media report three killed in Sanaa.', cited), []);
  assert.deepEqual(unsupportedNames('Anadolu says Houthi-linked media report three killed.', cited), ['Anadolu']);
});

test('the summary receives magnitudes with one decimal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'digest-'));
  writeFileSync(join(dir, 'usgs.json'), JSON.stringify({ data: { significant: [
    { mag: 7, place: '191 km ENE of Nagqu, China', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us6000u43g' },
    { mag: 6.5, place: 'Bonin Islands, Japan region', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us6000u4r9' },
    { mag: 6.25, place: 'off the coast', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/x' },
  ] } }));
  const titles = (await collectHeadlines(dir)).map((h) => h.title);
  assert.deepEqual(titles, ['M7.0 earthquake — 191 km ENE of Nagqu, China', 'M6.5 earthquake — Bonin Islands, Japan region', 'M6.3 earthquake — off the coast']);
});
