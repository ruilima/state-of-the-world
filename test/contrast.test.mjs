// Fails the build if any colour pair used on the page drops below WCAG
// thresholds (4.5:1 text, 3:1 graphics), or if the CSS tokens drift from
// config/palette.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const palette = JSON.parse(readFileSync(new URL('../config/palette.json', import.meta.url)));
const THRESHOLD = { text: 4.5, graphic: 3 };

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('WCAG ratio helper matches known values', () => {
  assert.equal(ratio('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(ratio('#777777', '#FFFFFF').toFixed(2), '4.48');
});

for (const p of palette.pairs) {
  test(`${p.fg} on ${p.bg} (${p.use}) ≥ ${THRESHOLD[p.kind]}:1`, () => {
    const fg = palette.colors[p.fg];
    const bg = palette.colors[p.bg];
    assert.ok(fg && bg, `unknown colour in pair ${p.fg}/${p.bg}`);
    const r = ratio(fg, bg);
    assert.ok(r >= THRESHOLD[p.kind], `${p.fg} ${fg} on ${p.bg} ${bg} is ${r.toFixed(2)}:1`);
  });
}

// Pairs the dossier redesign depends on: they must stay listed (and so tested).
test('redesign pairs are listed', () => {
  const has = (fg, bg, kind) => palette.pairs.some((p) => p.fg === fg && p.bg === bg && p.kind === kind);
  for (const [fg, bg, kind] of [
    ['tube', 'tile', 'text'],
    ['tube-low', 'tile', 'text'],
    ['caution', 'tile', 'graphic'],
    ['paper', 'tile', 'graphic'],
    ['ink', 'paper', 'graphic'],
    ['danger-ink', 'paper', 'graphic'],
    ['caution-ink', 'paper', 'graphic'],
  ]) assert.ok(has(fg, bg, kind), `missing pair ${fg} on ${bg} (${kind})`);
});

test('CSS tokens match config/palette.json', () => {
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  for (const [name, hex] of Object.entries(palette.colors)) {
    const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(m, `--${name} is not defined in styles.css`);
    assert.equal(m[1].toUpperCase(), hex.toUpperCase(), `--${name} drifted from palette.json`);
  }
});
