// Small SVG charts drawn in ink on the dossier paper. One ink colour;
// the danger ink only marks values over a stated threshold. Every chart
// carries a text alternative, native hover titles on its marks, and a
// table view (see tableDetails).
import { LAND } from './assets/land.js';

const NS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}
const title = (text) => el('title', {}, text);

function frame(width, height, label) {
  return el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label, class: 'chart' });
}

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p / 2) * 2 * p;
};

/** Vertical bars. items: [{label, value, hover}]; over(value) -> bool marks a breach. */
export function barChart(items, { label, height = 200, width = 640, format = String, over = () => false } = {}) {
  const W = width, H = height, L = 52, B = 26, T = 12;
  const svg = frame(W, H, label);
  const max = niceMax(Math.max(...items.map((d) => d.value)));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  for (const g of [0, max / 2, max]) {
    svg.append(el('line', { class: g ? 'gridline' : 'axis', x1: L, x2: W, y1: y(g), y2: y(g) }));
    svg.append(el('text', { x: L - 6, y: y(g) + 4, 'text-anchor': 'end' }, format(g)));
  }
  const slot = (W - L) / items.length;
  const bw = Math.min(36, slot - 6);
  items.forEach((d, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    const bar = el('rect', { class: `bar${over(d.value) ? ' over' : ''}`, x, y: y(d.value), width: bw, height: Math.max(1, y(0) - y(d.value)) }, title(d.hover ?? `${d.label}: ${format(d.value)}`));
    svg.append(bar);
    svg.append(el('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, d.label));
  });
  // Label the last bar so the latest value is readable without hovering.
  const last = items.at(-1);
  if (last) svg.append(el('text', { class: 'label', x: L + (items.length - 1) * slot + slot / 2, y: y(last.value) - 6, 'text-anchor': 'middle' }, format(last.value)));
  return svg;
}

/**
 * Lines on one shared y axis. series: [{name, points:[{x, y}], dash}]
 * x is numeric (year or timestamp). With more than one series each line
 * is labelled at its end and drawn in its own dash pattern.
 */
export function lineChart(series, { label, height = 200, width = 640, formatY = String, formatX = String, formatLabel = formatY, xTicks, yMin } = {}) {
  const W = width, H = height, L = 52, R = series.length > 1 ? 110 : 16, B = 26, T = 14;
  const svg = frame(W, H, label);
  const all = series.flatMap((s) => s.points);
  if (!all.length) return svg;
  const xs = all.map((p) => p.x), ysv = all.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const lo = yMin ?? Math.min(0, Math.floor(Math.min(...ysv)));
  const hi = Math.max(...ysv) <= 0 ? 1 : niceMax(Math.max(...ysv));
  const x = (v) => L + ((W - L - R) * (v - x0)) / (x1 - x0 || 1);
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));

  for (const g of [lo, (lo + hi) / 2, hi]) {
    svg.append(el('line', { class: g === lo ? 'axis' : 'gridline', x1: L, x2: W - R, y1: y(g), y2: y(g) }));
    svg.append(el('text', { x: L - 6, y: y(g) + 4, 'text-anchor': 'end' }, formatY(g)));
  }
  if (lo < 0) svg.append(el('line', { class: 'axis', x1: L, x2: W - R, y1: y(0), y2: y(0) }));
  for (const t of xTicks ?? [x0, x1]) svg.append(el('text', { x: x(t), y: H - 8, 'text-anchor': t === x0 ? 'start' : t === x1 ? 'end' : 'middle' }, formatX(t)));

  const endLabels = [];
  for (const s of series) {
    const pts = s.points;
    if (!pts.length) continue;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join('');
    svg.append(el('path', { class: 'line', d, 'stroke-dasharray': s.dash ?? null }));
    // Generous invisible hit targets carry the hover titles.
    for (const p of pts) svg.append(el('circle', { cx: x(p.x), cy: y(p.y), r: 7, fill: 'transparent' }, title(`${s.name ? s.name + ', ' : ''}${formatX(p.x)}: ${formatY(p.y)}`)));
    const end = pts.at(-1);
    svg.append(el('circle', { cx: x(end.x), cy: y(end.y), r: 3.5, fill: 'var(--ink)' }));
    if (series.length > 1) endLabels.push({ x: x(end.x) + 8, y: y(end.y) + 4, text: `${s.name} ${formatLabel(end.y)}` });
  }
  // Push end labels apart so lines ending close together stay readable.
  endLabels.sort((a, b) => a.y - b.y);
  endLabels.forEach((l, i) => { if (i && l.y - endLabels[i - 1].y < 13) l.y = endLabels[i - 1].y + 13; });
  for (const l of endLabels) svg.append(el('text', { class: 'label', x: l.x, y: l.y }, l.text));
  return svg;
}

// Equirectangular projection matching assets/land.js (360×180 box).
const px = (lon) => lon + 180;
const py = (lat) => 90 - lat;

/**
 * Dot map. dots: [{lat, lon, r, over, hover}], crosses: [{lat, lon, hover}].
 * Crops Antarctica: the view runs from 84°N to 60°S.
 */
export function dotMap({ dots = [], crosses = [], label }) {
  const svg = el('svg', { viewBox: '0 6 360 144', role: 'img', 'aria-label': label, class: 'map' });
  svg.append(el('path', { class: 'land', d: LAND }));
  for (const d of [...dots].sort((a, b) => b.r - a.r)) {
    svg.append(el('circle', { class: `dot${d.over ? ' over' : ''}`, cx: px(d.lon), cy: py(d.lat), r: d.r }, title(d.hover)));
  }
  for (const c of crosses) {
    const x = px(c.lon), y = py(c.lat), s = 1.6;
    svg.append(el('g', { class: 'cross' }, el('line', { x1: x - s, y1: y - s, x2: x + s, y2: y + s }), el('line', { x1: x - s, y1: y + s, x2: x + s, y2: y - s }), el('circle', { cx: x, cy: y, r: 3, fill: 'transparent', stroke: 'none' }), title(c.hover)));
  }
  return svg;
}

/** <details> with the chart's numbers as a table. rows: array of arrays. */
export function tableDetails(caption, head, rows, numericCols = []) {
  const details = document.createElement('details');
  details.className = 'small';
  const summary = document.createElement('summary');
  summary.textContent = 'Show the numbers';
  const table = document.createElement('table');
  table.className = 'data';
  const cap = document.createElement('caption');
  cap.className = 'visually-hidden';
  cap.textContent = caption;
  const thead = table.createTHead().insertRow();
  head.forEach((h, i) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    if (numericCols.includes(i)) th.className = 'num';
    thead.append(th);
  });
  const tbody = table.createTBody();
  for (const r of rows) {
    const tr = tbody.insertRow();
    r.forEach((v, i) => {
      const td = tr.insertCell();
      td.textContent = v;
      if (numericCols.includes(i)) td.className = 'num';
    });
  }
  table.prepend(cap);
  details.append(summary, table);
  return details;
}
