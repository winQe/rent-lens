// Regenerates src/data/planning-areas.json from the URA Master Plan 2025 planning area
// boundaries on data.gov.sg. Run with: yarn workspace @rent-lens/web build:map
//
// The output is a small SVG-ready file (about 12 KB): each area's outline projected to
// an 820-wide viewBox and simplified, plus a label point. Shipping this instead of a tile
// map means no API key, no tile requests and a map that works offline.
import { writeFile } from 'node:fs/promises';
import { geoIdentity, geoPath } from 'd3-geo';
import { geoProject } from 'd3-geo-projection';
import polylabel from 'polylabel';
import { feature } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';

const DATASET = 'd_2cc750190544007400b2cfd5d7f53209';
const OUT = new URL('../src/data/planning-areas.json', import.meta.url);
const WIDTH = 820;
const PAD = 10;
const MIN_AREA = 16; // px² in the output viewBox: Visvalingam drops points whose triangle is smaller
const SKIP = new Set(['WESTERN ISLANDS']); // far south, no housing, stretches the frame

const poll = await (await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET}/poll-download`)).json();
const geo = await (await fetch(poll.data.url)).json();
const areas = { type: 'FeatureCollection', features: geo.features.filter((f) => !SKIP.has(f.properties.PLN_AREA_N)) };

// Planar, not spherical: the source rings wind counter-clockwise (RFC 7946), which d3's spherical
// projections read as "the whole globe minus this area". At 1.35°N a degree of longitude is 0.9997
// of a degree of latitude, so treating lon/lat as flat x/y distorts nothing visible.
const projection = geoIdentity()
  .reflectY(true)
  .fitWidth(WIDTH - 2 * PAD, areas);
const [[, top], [, bottom]] = geoPath(projection).bounds(areas);
const height = Math.round(bottom - top + 2 * PAD);
projection.fitExtent(
  [
    [PAD, PAD],
    [WIDTH - PAD, height - PAD],
  ],
  areas,
);
const projected = geoProject(areas, projection);

// Simplify the shared topology, not each area alone: a border between two areas is one arc,
// simplified once, so neighbours keep the same edge and no gaps or overlaps open between them.
const topo = simplify(presimplify(topology({ areas: projected })), MIN_AREA);
const simplified = feature(topo, topo.objects.areas).features;
const toPath = geoPath().digits(0);
const area = (coordinates) => geoPath().area({ type: 'Polygon', coordinates });

const out = projected.features.map((f, i) => {
  // Label point: the "pole of inaccessibility" of the largest island, the interior point farthest
  // from every edge. Unlike a vertex average it stays inside concave shapes and is not pulled
  // toward detailed coastlines. `r` is that distance, the room a label has before it hits a border.
  const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const largest = polygons.reduce((a, b) => (area(b) > area(a) ? b : a));
  const pole = polylabel(largest, 0.5);
  return {
    name: f.properties.PLN_AREA_N,
    d: toPath(simplified[i]),
    x: Math.round(pole[0]),
    y: Math.round(pole[1]),
    r: Math.round(pole.distance * 10) / 10,
  };
});

await writeFile(OUT, `${JSON.stringify({ width: WIDTH, height, source: `data.gov.sg ${DATASET}`, areas: out })}\n`);
console.log(`wrote ${out.length} areas, ${height}px high`);
