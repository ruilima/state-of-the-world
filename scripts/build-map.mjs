// One-off: converts Natural Earth 110m land (public domain, via world-atlas)
// into one SVG path in an equirectangular 360×180 box (x = lon + 180,
// y = 90 − lat). Output is committed as public/assets/land.js.
// Run again only to change the outline: node scripts/build-map.mjs
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { http, ROOT } from './lib/io.mjs';

const topo = await http('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json');
const { scale, translate } = topo.transform;
// Decode delta-encoded, quantized arcs to [lon, lat].
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
});
const ring = (ids) => ids.flatMap((id, i) => {
  const pts = id < 0 ? [...arcs[~id]].reverse() : arcs[id];
  return i ? pts.slice(1) : pts;
});
const f = (n) => Math.round(n * 10) / 10;
let d = '';
const land = topo.objects.land;
const geoms = land.type === 'GeometryCollection' ? land.geometries : [land];
for (const g of geoms) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
  for (const poly of polys)
    for (const r of poly) {
      const pts = ring(r);
      // Skip Antarctica (the map view stops at 60°S).
      if (pts.every(([, lat]) => lat < -55)) continue;
      // Rings that cross the antimeridian jump from one edge to the other;
      // start a new subpath there instead of drawing a line across the map.
      let seg = '';
      pts.forEach(([lon, lat], i) => {
        const jump = i && Math.abs(lon - pts[i - 1][0]) > 180;
        seg += `${!i || jump ? 'M' : 'L'}${f(lon + 180)} ${f(90 - lat)}`;
      });
      d += seg + (pts.some(([lon], i) => i && Math.abs(lon - pts[i - 1][0]) > 180) ? '' : 'Z');
    }
}
await writeFile(join(ROOT, 'public', 'assets', 'land.js'), `// Natural Earth 110m land (public domain), equirectangular 360×180.\nexport const LAND = '${d}';\n`);
console.log(`land path: ${d.length} chars`);
