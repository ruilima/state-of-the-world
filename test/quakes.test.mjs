// Unmerged tsunami-centre duplicates are dropped where quakes enter (fetch-usgs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropTsunamiCentreDuplicates, tsunamiCentreOnly, km } from '../scripts/lib/quakes.mjs';

// The real case of 25 Oct 2026, as the significant_month feed gave it.
const feat = (id, iso, mag, magType, net, sources, lat, lon, depth) => ({
  id, properties: { time: Date.parse(iso), mag, magType, net, sources, ids: `,${id},` }, geometry: { coordinates: [lon, lat, depth] },
});
const bonin = feat('us6000u4r9', '2026-10-25T02:09:23.818Z', 6.5, 'mww', 'us', ',at,us,', 27.7953, 139.6184, 492.4);
const pt1 = feat('pt26297050', '2026-10-24T02:09:00Z', 7, 'Mi', 'pt', ',pt,', 28, 139.9, 473);
const pt2 = feat('pt26298050', '2026-10-24T02:09:00Z', 7, 'Mi', 'pt', ',pt,', 28, 139.9, 473);
const vanuatu = feat('us6000u4j2', '2026-10-24T02:31:28Z', 6.9, 'mww', 'us', ',us,at,', -14.0558, 165.5455, 10);

test('the Bonin case: both tsunami-centre copies go, the reviewed M6.5 stays', () => {
  const r = dropTsunamiCentreDuplicates([bonin, vanuatu, pt1, pt2]);
  assert.deepEqual(r.kept.map((f) => f.id), ['us6000u4r9', 'us6000u4j2']);
  assert.deepEqual(r.dropped.map((d) => [d.id, d.duplicateOf]), [['pt26297050', 'us6000u4r9'], ['pt26298050', 'us6000u4r9']]);
  assert.ok(km(pt1.geometry.coordinates, bonin.geometry.coordinates) < 40);
});

test('a reviewed event that merged a tsunami-centre solution is never dropped', () => {
  assert.equal(tsunamiCentreOnly(bonin), false); // sources ,at,us,
  assert.deepEqual(dropTsunamiCentreDuplicates([bonin]).kept.map((f) => f.id), ['us6000u4r9']);
});

test('a genuine quake reported only by a tsunami centre stays (kept once if repeated)', () => {
  const lone = feat('pt26300000', '2026-10-27T10:00:00Z', 6.2, 'Mi', 'pt', ',pt,', -20, -175, 30);
  const loneAgain = feat('pt26300001', '2026-10-27T10:00:20Z', 6.2, 'Mi', 'pt', ',pt,', -20.02, -175.01, 30);
  const r = dropTsunamiCentreDuplicates([bonin, lone, loneAgain]);
  assert.deepEqual(r.kept.map((f) => f.id), ['us6000u4r9', 'pt26300000']);
  assert.equal(r.dropped[0].reason, 'repeat of another tsunami-centre entry');
});

test('outside the window, the distance or the magnitude margin, a tsunami-centre entry stays', () => {
  const later = feat('pt1', '2026-10-26T15:00:00Z', 6.6, 'Mi', 'pt', ',pt,', 28, 139.9, 470); // 37 h after
  const far = feat('pt2', '2026-10-25T02:10:00Z', 6.6, 'Mi', 'pt', ',pt,', 30, 139.9, 470); // about 245 km away
  const bigger = feat('pt3', '2026-10-25T02:10:00Z', 7.8, 'Mi', 'pt', ',pt,', 28, 139.9, 470); // 1.3 above
  assert.deepEqual(dropTsunamiCentreDuplicates([bonin, later, far, bigger]).kept.map((f) => f.id), ['us6000u4r9', 'pt1', 'pt2', 'pt3']);
});

test('a duplicate in one feed is matched against the reviewed event in the other feed', () => {
  const r = dropTsunamiCentreDuplicates([pt1], [pt1, bonin]);
  assert.deepEqual(r.kept, []);
  assert.equal(r.dropped[0].duplicateOf, 'us6000u4r9');
});
