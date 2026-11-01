// Regenerates src/data/planning-areas.json from the URA Master Plan 2025 planning area
// boundaries on data.gov.sg. Run with: yarn workspace @rent-lens/web build:map
//
// The output is a small SVG-ready file (about 12 KB): each area's outline projected to
// an 820-wide viewBox and simplified with Douglas-Peucker, plus its centroid for labels.
// Shipping this instead of a tile map means no API key, no tile requests and a map
// that works offline.
import { writeFile } from 'node:fs/promises';
import polylabel from 'polylabel';

const DATASET = 'd_2cc750190544007400b2cfd5d7f53209';
const OUT = new URL('../src/data/planning-areas.json', import.meta.url);
const WIDTH = 820;
const TOLERANCE = 1.8; // px in the output viewBox
const SKIP = new Set(['WESTERN ISLANDS']); // far south, no housing, stretches the frame

const poll = await (await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET}/poll-download`)).json();
const geo = await (await fetch(poll.data.url)).json();
const features = geo.features.filter((f) => !SKIP.has(f.properties.PLN_AREA_N));

const outerRings = (g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]));
const all = features.flatMap((f) => outerRings(f.geometry).flat());
const k = Math.cos((1.35 * Math.PI) / 180); // equirectangular at Singapore's latitude
const minX = Math.min(...all.map((p) => p[0] * k));
const maxX = Math.max(...all.map((p) => p[0] * k));
const minY = Math.min(...all.map((p) => p[1]));
const maxY = Math.max(...all.map((p) => p[1]));
const scale = (WIDTH - 20) / (maxX - minX);
const height = Math.round((maxY - minY) * scale + 20);
const project = ([lon, lat]) => [(lon * k - minX) * scale + 10, (maxY - lat) * scale + 10];

function simplify(pts) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1e-9;
  let index = 0;
  let max = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > max) [index, max] = [i, d];
  }
  if (max <= TOLERANCE) return [a, b];
  return [...simplify(pts.slice(0, index + 1)).slice(0, -1), ...simplify(pts.slice(index))];
}

const ringArea = (pts) => Math.abs(pts.reduce((a, [x0, y0], i) => a + x0 * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y0, 0)) / 2;

const areas = features.map((f) => {
  let d = '';
  let largest = [];
  for (const ring of outerRings(f.geometry)) {
    const pts = ring.map(project);
    // A closed ring starts and ends on the same point, so split it in two before simplifying.
    const mid = Math.floor(pts.length / 2);
    const s = [...simplify(pts.slice(0, mid + 1)).slice(0, -1), ...simplify(pts.slice(mid))];
    if (s.length < 4) continue;
    d += `M${s.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join('L')}Z`;
    if (ringArea(pts) > ringArea(largest)) largest = pts;
  }
  // Label point: the "pole of inaccessibility" of the largest island, the interior point farthest
  // from every edge. Unlike a vertex average it stays inside concave shapes and is not pulled
  // toward detailed coastlines. `r` is that distance, the room a label has before it hits a border.
  const pole = polylabel([largest], 0.5);
  return { name: f.properties.PLN_AREA_N, d, x: Math.round(pole[0]), y: Math.round(pole[1]), r: Math.round(pole.distance * 10) / 10 };
});

await writeFile(OUT, `${JSON.stringify({ width: WIDTH, height, source: `data.gov.sg ${DATASET}`, areas })}\n`);
console.log(`wrote ${areas.length} areas, ${height}px high`);
