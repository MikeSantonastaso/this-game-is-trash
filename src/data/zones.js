// The world map: one continuous map split into zones that unlock with
// requirements. Pure data (no Three.js), so it ports to engine resources and
// is shared by the world builders, the zone system, the minimap and tests.
//
// Coordinates are meters. -Z is north. Rects are { minX, maxX, minZ, maxZ }.
//
// Zone fields:
//   rect            - the zone's footprint on the map
//   requirements    - [{ type: 'money'|'tool'|'property'|'stat', ... }] (see core/requirements.js)
//   comingSoon      - visible and fenced, but not unlockable yet
//   trashMax        - loose trash on the ground at once
//   respawnSeconds  - one new piece every N seconds until trashMax
//   valueMultiplier - every item picked here is worth this much more
//   trashWeights    - spawn table for TRASH_TYPES
//   bins            - curbside bins: items per bin and refill time
//   color           - map / sign color
export const WORLD = { minX: -170, maxX: 330, minZ: -345, maxZ: 80 };

export const ZONES = [
  {
    id: 'park', order: 1, name: 'Dumpy Park', tagline: 'Where it all begins',
    rect: { minX: -170, maxX: 75, minZ: -48.5, maxZ: 80 },
    requirements: [],
    trashMax: 60, respawnSeconds: 1.2, valueMultiplier: 1,
    trashWeights: { wrapper: 6, can: 5, cup: 4, bottle: 4, pizzaBox: 1.2, tire: 0.25 },
    color: '#4f9d3a',
  },
  {
    id: 'maple', order: 2, name: 'Maple Court', tagline: 'Small neighborhood',
    description: 'Cul-de-sacs and curbside bins. Empty a whole bin into your bag.',
    rect: { minX: -170, maxX: 75, minZ: -215, maxZ: -48.5 },
    requirements: [
      { type: 'money', amount: 1000 },
      { type: 'tool', id: 'picker_extendo' },
      { type: 'stat', stat: 'bagsSold', amount: 20, label: 'bags sold' },
    ],
    trashMax: 80, respawnSeconds: 1.0, valueMultiplier: 1.6,
    trashWeights: { wrapper: 4, can: 5, cup: 3, bottle: 5, pizzaBox: 3, tire: 0.5 },
    bins: { chance: 0.75, items: 5, refillSeconds: 75 },
    color: '#d9822b',
  },
  {
    id: 'oakridge', order: 3, name: 'Oakridge Heights', tagline: 'Big neighborhood',
    description: 'Whole blocks of curbside cans. Long routes: bring the truck.',
    rect: { minX: 75, maxX: 330, minZ: -215, maxZ: 80 },
    requirements: [
      { type: 'money', amount: 6000 },
      { type: 'property', id: 'pickup' },
      { type: 'tool', id: 'picker_double' },
    ],
    trashMax: 110, respawnSeconds: 0.7, valueMultiplier: 2.5,
    trashWeights: { wrapper: 3, can: 5, cup: 3, bottle: 5, pizzaBox: 4, tire: 1 },
    bins: { chance: 0.85, items: 7, refillSeconds: 90 },
    color: '#3b7dd8',
  },
  {
    id: 'downtown', order: 4, name: 'Downtown', tagline: 'The City',
    description: 'Alleys, commercial dumpsters and a fleet of trucks.',
    rect: { minX: -170, maxX: 330, minZ: -345, maxZ: -215 },
    requirements: [
      { type: 'money', amount: 50000 },
      { type: 'property', id: 'garbage_truck' },
      { type: 'tool', id: 'trash_magnet' },
    ],
    comingSoon: true,
    trashMax: 0, respawnSeconds: 1, valueMultiplier: 4,
    trashWeights: { wrapper: 3, can: 6, cup: 4, bottle: 5, pizzaBox: 5, tire: 1.5 },
    color: '#8e5bd1',
  },
];

// Streets. axis 'x' runs east-west at z = at; axis 'z' runs north-south at x = at.
// culDeSac: which end gets a turning circle.
export const ROAD_HALF = 4;
export const WALK = 2.5;
export const ROADS = [
  { id: 'parkAve', name: 'Park Ave', axis: 'x', at: -42, from: -170, to: 330 },
  { id: 'mapleSt', name: 'Maple St', axis: 'z', at: 34, from: -345, to: -42 },
  { id: 'birchLn', name: 'Birch Ln', axis: 'z', at: -60, from: -185, to: -42, culDeSac: 'from' },
  { id: 'elmRd', name: 'Elm Rd / Oak St', axis: 'x', at: -130, from: -140, to: 330, culDeSac: 'from' },
  { id: 'oakAve1', name: 'Acorn Ave', axis: 'z', at: 135, from: -196, to: 20, culDeSac: 'from' },
  { id: 'oakAve2', name: 'Ridge Ave', axis: 'z', at: 205, from: -345, to: 20 },
  { id: 'oakAve3', name: 'Summit Ave', axis: 'z', at: 275, from: -196, to: 20, culDeSac: 'from' },
  { id: 'oakSouth', name: 'Hollow Rd', axis: 'x', at: 20, from: 135, to: 330 },
  { id: 'dtMain', name: 'Broadway', axis: 'x', at: -268, from: -170, to: 330 },
];

// Where roads cross a zone border. A gate is open when the zones on both
// sides are unlocked; until then its billboard shows the requirements of
// `leadsTo` (or of the other side, if that is the locked one).
export const GATES = [
  { id: 'maple_main', between: ['park', 'maple'], leadsTo: 'maple', x: 34, z: -48.5, across: 'x' },
  { id: 'maple_birch', between: ['park', 'maple'], leadsTo: 'maple', x: -60, z: -48.5, across: 'x' },
  { id: 'oak_parkave', between: ['park', 'oakridge'], leadsTo: 'oakridge', x: 75, z: -42, across: 'z' },
  { id: 'oak_elm', between: ['maple', 'oakridge'], leadsTo: 'oakridge', x: 75, z: -130, across: 'z' },
  { id: 'dt_maple', between: ['maple', 'downtown'], leadsTo: 'downtown', x: 34, z: -215, across: 'x' },
  { id: 'dt_ridge', between: ['oakridge', 'downtown'], leadsTo: 'downtown', x: 205, z: -215, across: 'x' },
];
export const GATE_HALF = ROAD_HALF + WALK; // the gap a gate leaves in the fence

// Fences along zone borders, solid until both sides are unlocked.
export const BORDERS = [
  { between: ['park', 'maple'], from: [-170, -48.5], to: [75, -48.5] },
  { between: ['park', 'oakridge'], from: [75, -48.5], to: [75, 80] },
  { between: ['maple', 'oakridge'], from: [75, -215], to: [75, -48.5] },
  { between: ['maple', 'downtown'], from: [-170, -215], to: [75, -215] },
  { between: ['oakridge', 'downtown'], from: [75, -215], to: [330, -215] },
];

export const getZone = (id) => ZONES.find((z) => z.id === id);

export const inRect = (r, x, z, pad = 0) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;

// Which zone a point is in. Later zones win on shared edges.
export function zoneAt(x, z) {
  for (let i = ZONES.length - 1; i >= 0; i--) if (inRect(ZONES[i].rect, x, z)) return ZONES[i];
  return ZONES[0];
}

// Road footprint as a rect (asphalt + sidewalks with optional padding).
export function roadRect(road, pad = 0) {
  const h = ROAD_HALF + WALK + pad;
  const lo = Math.min(road.from, road.to), hi = Math.max(road.from, road.to);
  return road.axis === 'x'
    ? { minX: lo - pad, maxX: hi + pad, minZ: road.at - h, maxZ: road.at + h }
    : { minX: road.at - h, maxX: road.at + h, minZ: lo - pad, maxZ: hi + pad };
}

export const CUL_DE_SAC_R = 11;
export function culDeSacCenter(road) {
  const end = road.culDeSac === 'from' ? road.from : road.to;
  return road.axis === 'x' ? { x: end, z: road.at } : { x: road.at, z: end };
}

export function onRoad(x, z, pad = 0) {
  for (const r of ROADS) {
    if (inRect(roadRect(r, 0), x, z, pad)) return r;
    if (r.culDeSac) {
      const c = culDeSacCenter(r);
      if (Math.hypot(x - c.x, z - c.z) < CUL_DE_SAC_R + WALK + pad) return r;
    }
  }
  return null;
}
