// Streets from data/zones.js ROADS: asphalt, sidewalks cut cleanly at
// junctions, dashed center lines, cul-de-sacs, and streetlights.
import * as THREE from 'three';
import { ROADS, ROAD_HALF, WALK, CUL_DE_SAC_R, culDeSacCenter, WORLD } from '../../data/zones.js';

const span = (r) => [Math.min(r.from, r.to), Math.max(r.from, r.to)];

// For road a, the cut ranges (along a) per side where another road joins.
function junctions(a) {
  const cuts = { '-1': [], '1': [], both: [] };
  const [aLo, aHi] = span(a);
  for (const b of ROADS) {
    if (b === a || b.axis === a.axis) continue;
    const [bLo, bHi] = span(b);
    if (b.at < aLo - ROAD_HALF || b.at > aHi + ROAD_HALF) continue;
    if (a.at < bLo - ROAD_HALF || a.at > bHi + ROAD_HALF) continue;
    const range = [b.at - ROAD_HALF - WALK, b.at + ROAD_HALF + WALK];
    if (bLo < a.at - ROAD_HALF) cuts['-1'].push(range);
    if (bHi > a.at + ROAD_HALF) cuts['1'].push(range);
    cuts.both.push(range);
  }
  return cuts;
}

// [lo, hi] minus a list of ranges.
function subtract(lo, hi, ranges) {
  let out = [[lo, hi]];
  for (const [c0, c1] of ranges) {
    out = out.flatMap(([a, b]) => (c1 <= a || c0 >= b) ? [[a, b]] : [[a, Math.min(b, c0)], [Math.max(a, c1), b]].filter(([x, y]) => y - x > 0.3));
  }
  return out;
}

export function buildRoads(kit, surf, { lights = true } = {}) {
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xe9c74a, roughness: 0.6 });
  const lightList = [];
  ROADS.forEach((road, i) => {
    const [lo, hi] = span(road);
    const y = 0.02 + i * 0.0015; // distinct heights so crossing asphalt never z-fights
    const along = (len, c, across, w, mat, yy, tile = 4) => road.axis === 'x'
      ? kit.flat(len, w, c, road.at + across, mat, yy, tile)
      : kit.flat(w, len, road.at + across, c, mat, yy, tile);
    along(hi - lo, (lo + hi) / 2, 0, ROAD_HALF * 2, surf.asphalt, y);

    const cuts = junctions(road);
    const cds = road.culDeSac ? (road.culDeSac === 'from' ? lo : hi) : null;
    const cdsCut = cds !== null ? [[cds - CUL_DE_SAC_R, cds + CUL_DE_SAC_R]] : [];
    for (const side of [-1, 1]) {
      for (const [a, b] of subtract(lo, hi, [...cuts[side], ...cdsCut])) {
        along(b - a, (a + b) / 2, side * (ROAD_HALF + WALK / 2), WALK, surf.concrete, 0.045);
      }
    }
    for (const [a, b] of subtract(lo + 3, hi - 3, [...cuts.both, ...cdsCut])) {
      for (let s = a; s + 3 < b; s += 6) along(3, s + 1.5, 0, 0.18, lineMat, y + 0.006, 1);
    }
    if (cds !== null) {
      const c = culDeSacCenter(road);
      kit.disc(0, CUL_DE_SAC_R, c.x, c.z, surf.asphalt, y + 0.0005);
      kit.disc(CUL_DE_SAC_R, CUL_DE_SAC_R + WALK, c.x, c.z, surf.concrete, 0.046);
      kit.obstacles.push({ x: c.x, z: c.z, r: 2 }); // keep the very center clean-ish
    }

    // Streetlights, alternating sides, skipping junctions.
    if (!lights) return;
    let n = 0;
    for (let s = lo + 12; s < hi - 6; s += 26, n++) {
      if (cuts.both.some(([c0, c1]) => s > c0 - 6 && s < c1 + 6)) continue;
      const side = n % 2 ? 1 : -1;
      const off = side * (ROAD_HALF + WALK - 0.6);
      const [x, z] = road.axis === 'x' ? [s, road.at + off] : [road.at + off, s];
      if (x < WORLD.minX + 2 || x > WORLD.maxX - 2 || z < WORLD.minZ + 2 || z > WORLD.maxZ - 2) continue;
      // Light model faces +Z by default; turn its arm over the road.
      const rot = road.axis === 'x' ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      const m = kit.placement(x, 0, z, rot, 1);
      m.id = 'streetlight';
      lightList.push(m);
      kit.staticCylinder(0.15, 5.5, x, z);
      kit.obstacles.push({ x, z, r: 0.6 });
    }
  });
  kit.instanced(lightList, { far: 180 });
}
