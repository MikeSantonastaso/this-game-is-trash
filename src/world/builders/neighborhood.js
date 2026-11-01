// A neighborhood zone: houses lining every street that runs through the zone
// (facing the road, with driveways and front-yard trees), houses around
// cul-de-sacs, and a curbside bin in front of most houses.
//
// Only the street data and a few style options differ between the small and
// the big neighborhood, so new suburbs are a data change.
import * as THREE from 'three';
import { ROADS, ROAD_HALF, WALK, CUL_DE_SAC_R, culDeSacCenter, inRect, onRoad } from '../../data/zones.js';

const STYLES = {
  maple: { houses: ['house1', 'house6', 'house3', 'house2', 'house1'], setback: [6, 8], gap: [3, 6], trees: 0.45, seed: 202 },
  oakridge: { houses: ['house2', 'house3', 'house4', 'house5', 'house7', 'house1'], setback: [5, 7], gap: [2.5, 5], trees: 0.35, seed: 303 },
};
// House paint (applies to walls only).
const PAINTS = [0xf3e3c3, 0xb9d3ee, 0xf0b9a6, 0xcfe5b8, 0xd9c8ee, 0xfbe7a1, 0xdedad2, 0xa9cbbd, 0xe6b58c, 0xf6f3ec, 0x9fb6cf];

export function buildNeighborhood(kit, zone, { assets, surf, reserved = [] }) {
  const style = STYLES[zone.id];
  const { rand, pick } = kit;
  const rect = zone.rect;
  const houseMats = [], treeMats = [], binMats = [], bushMats = [];
  const bins = [];
  let houses = 0;

  const fits = (cx, cz, hw, hd, rotY) => {
    // Footprint corners (rotated) must be inside the zone, off every road, and clear of other stuff.
    const c = Math.cos(rotY), s = Math.sin(rotY);
    for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, 0]]) {
      const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
      if (!inRect(rect, x, z, -2.5)) return false;
      if (onRoad(x, z, 0.8)) return false;
    }
    if (reserved.some((r) => Math.hypot(r.x - cx, r.z - cz) < r.r + Math.max(hw, hd))) return false;
    return !kit.blocked(cx, cz, Math.max(hw, hd) * 0.85);
  };

  // Place one house whose front faces direction f (unit, toward the street).
  const addHouse = (id, cx, cz, f) => {
    const size = assets.size(id);
    const rotY = Math.atan2(f.x, f.z);
    if (!fits(cx, cz, size.x / 2, size.z / 2, rotY)) return false;
    const m = kit.placement(cx, 0, cz, rotY, 1);
    m.id = id;
    m.color = new THREE.Color(pick(PAINTS));
    houseMats.push(m);
    kit.staticBox([size.x, size.y, size.z], [cx, size.y / 2, cz], rotY);
    kit.obstacles.push({ x: cx, z: cz, r: Math.max(size.x, size.z) * 0.62 });
    houses++;
    return true;
  };

  // Curbside bin + driveway + yard tree for a house fronting a straight street.
  const frontYard = (road, side, alongC, width, setback) => {
    const n = road.axis === 'x' ? { x: 0, z: side } : { x: side, z: 0 };
    const t = road.axis === 'x' ? { x: 1, z: 0 } : { x: 0, z: 1 };
    const edge = ROAD_HALF + WALK;
    const base = road.axis === 'x' ? { x: alongC, z: road.at } : { x: road.at, z: alongC };
    const at = (lat, dist) => ({ x: base.x + t.x * lat + n.x * dist, z: base.z + t.z * lat + n.z * dist });
    // Driveway
    const dw = at(width * 0.28, edge + setback / 2);
    if (road.axis === 'x') kit.flat(3.2, setback, dw.x, dw.z, surf.concrete, 0.042, 4);
    else kit.flat(setback, 3.2, dw.x, dw.z, surf.concrete, 0.042, 4);
    // Curb bin on the lawn by the sidewalk
    if (kit.chance(zone.bins.chance)) {
      const b = at(-width * 0.3, edge + 0.9);
      const rotY = Math.atan2(-n.x, -n.z);
      const m = kit.placement(b.x, 0, b.z, rotY, 1.05);
      m.id = 'trashcanGreen';
      binMats.push(m);
      bins.push({ x: b.x, z: b.z, rotY, zone: zone.id });
      kit.obstacles.push({ x: b.x, z: b.z, r: 0.8 });
    }
    // Yard tree or bushes
    if (kit.chance(style.trees)) {
      const p = at(-width * 0.15 + rand(-1, 1), edge + setback * 0.55);
      if (!kit.blocked(p.x, p.z, 1)) {
        const s = rand(0.7, 1.0);
        const m = kit.placement(p.x, 0, p.z, rand(0, Math.PI * 2), s);
        m.id = pick(['tree1', 'tree2', 'tree4', 'tree5']);
        treeMats.push(m);
        kit.staticCylinder(0.3 * s, 3, p.x, p.z);
        kit.obstacles.push({ x: p.x, z: p.z, r: 1 });
      }
    } else {
      for (const lat of [-0.45, 0.05]) {
        const p = at(width * lat, edge + setback - 0.6);
        const m = kit.placement(p.x, 0, p.z, rand(0, Math.PI * 2), rand(0.7, 1.1));
        m.id = pick(['bush1', 'bush2']);
        bushMats.push(m);
      }
    }
  };

  // ---- Straight streets ----
  for (const road of ROADS) {
    const lo0 = Math.min(road.from, road.to), hi0 = Math.max(road.from, road.to);
    // The part of this road inside the zone.
    const [zLo, zHi] = road.axis === 'x' ? [rect.minX, rect.maxX] : [rect.minZ, rect.maxZ];
    // Roads just outside the zone (Park Ave) still get houses on the zone's side.
    const P = 30;
    const crossIn = road.axis === 'x' ? road.at > rect.minZ - P && road.at < rect.maxZ + P : road.at > rect.minX - P && road.at < rect.maxX + P;
    if (!crossIn) continue;
    const lo = Math.max(lo0, zLo), hi = Math.min(hi0, zHi);
    if (hi - lo < 10) continue;
    for (const side of [-1, 1]) {
      const n = road.axis === 'x' ? { x: 0, z: side } : { x: side, z: 0 };
      let cursor = lo + 3;
      while (cursor < hi - 6) {
        const id = pick(style.houses);
        const size = assets.size(id);
        const setback = rand(...style.setback);
        const alongC = cursor + size.x / 2;
        const dist = ROAD_HALF + WALK + setback + size.z / 2;
        const cx = road.axis === 'x' ? alongC : road.at + n.x * dist;
        const cz = road.axis === 'x' ? road.at + n.z * dist : alongC;
        if (alongC + size.x / 2 < hi && addHouse(id, cx, cz, { x: -n.x, z: -n.z })) {
          frontYard(road, side, alongC, size.x, setback);
          cursor += size.x + rand(...style.gap);
        } else cursor += 3;
      }
    }

    // ---- Cul-de-sac ring ----
    if (road.culDeSac) {
      const c = culDeSacCenter(road);
      if (!inRect(rect, c.x, c.z)) continue;
      const sign = road.culDeSac === 'from' ? 1 : -1;
      const roadAngle = road.axis === 'z' ? (sign > 0 ? 0 : Math.PI) : (sign > 0 ? Math.PI / 2 : -Math.PI / 2);
      for (const da of [Math.PI, Math.PI * 0.62, -Math.PI * 0.62, Math.PI * 0.82, -Math.PI * 0.82]) {
        const a = roadAngle + da;
        const dir = { x: Math.sin(a), z: Math.cos(a) };
        const id = pick(style.houses);
        const size = assets.size(id);
        const dist = CUL_DE_SAC_R + WALK + 5 + size.z / 2;
        if (addHouse(id, c.x + dir.x * dist, c.z + dir.z * dist, { x: -dir.x, z: -dir.z })) {
          const bx = c.x + dir.x * (CUL_DE_SAC_R + WALK + 0.9) + dir.z * 2.2, bz = c.z + dir.z * (CUL_DE_SAC_R + WALK + 0.9) - dir.x * 2.2;
          const m = kit.placement(bx, 0, bz, a + Math.PI, 1.05);
          m.id = 'trashcanGreen';
          binMats.push(m);
          bins.push({ x: bx, z: bz, rotY: a + Math.PI, zone: zone.id });
        }
      }
    }
  }

  kit.instanced(houseMats);
  kit.instanced(treeMats);
  kit.instanced(binMats, { far: 140 });
  kit.instanced(bushMats, { castShadow: false, far: 120 });

  // Trash: along streets and front yards, not deep in back yards.
  const roadsHere = ROADS.filter((r) => {
    const rr = r.axis === 'x' ? { minX: Math.min(r.from, r.to), maxX: Math.max(r.from, r.to), minZ: r.at, maxZ: r.at } : { minX: r.at, maxX: r.at, minZ: Math.min(r.from, r.to), maxZ: Math.max(r.from, r.to) };
    return rr.maxX > rect.minX && rr.minX < rect.maxX && rr.maxZ > rect.minZ && rr.minZ < rect.maxZ;
  });
  const nearRoad = (x, z, d) => roadsHere.some((r) => {
    const lo = Math.min(r.from, r.to), hi = Math.max(r.from, r.to);
    return r.axis === 'x' ? Math.abs(z - r.at) < d && x > lo - 2 && x < hi + 2 : Math.abs(x - r.at) < d && z > lo - 2 && z < hi + 2;
  });
  return {
    houses,
    bins,
    trashRegion: { rect: { minX: rect.minX + 2, maxX: rect.maxX - 2, minZ: rect.minZ + 2, maxZ: rect.maxZ - 2 }, accept: (x, z) => nearRoad(x, z, 15) },
  };
}
