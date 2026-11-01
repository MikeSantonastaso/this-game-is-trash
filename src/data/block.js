// The whole map: one small, hand-built block. Everything is placed by hand in
// meters so it can be tuned here (and later rebuilt 1:1 in Godot/Unity).
//
// Axes: +X east, +Z south, y up. Rubbish Road runs east-west through z = 0.
// North side: five houses with an alley behind them.
// South side: Trash Mart (corner store), junk-lawn house, the block party
// house, another house, and the Dump-n-Go yard with the dumpster and truck.

export const BOUNDS = { minX: -50, maxX: 50, minZ: -36, maxZ: 34 };

export const ROAD = { halfWidth: 4.2, sidewalk: 2.4, minX: -50, maxX: 50 };

// Houses: model id from data/models.js, lot center x, side (-1 north, +1 south),
// setback (house center distance from the road center), paint tint.
export const HOUSES = [
  { model: 'house3', x: -36, side: -1, setback: 16, tint: 0xf3e3c3 },
  { model: 'house2', x: -18, side: -1, setback: 16, tint: 0xc9dbe8 },
  { model: 'house4', x: 0, side: -1, setback: 16, tint: 0xf0c9b8 },
  { model: 'house1', x: 18, side: -1, setback: 15, tint: 0xd8e6c8 },
  { model: 'house5', x: 36, side: -1, setback: 16, tint: 0xe9e1f0 },
  { model: 'house6', x: -18, side: 1, setback: 17, tint: 0xd9c7a8, noTree: true }, // junk lawn
  { model: 'house2', x: 0, side: 1, setback: 19, tint: 0xf6d77c, noTree: true }, // party house
  { model: 'house3', x: 18, side: 1, setback: 17, tint: 0xb9d3c3 },
];

export const SHOP = { x: -36, z: 17, facing: -1, label: 'TRASH MART' }; // door faces north (the road)

export const DUMPSTERS = [{ x: 38, z: 17, label: 'SELL TRASH HERE' }];

// The Dump-n-Go yard: fenced gravel lot east of the party house.
export const YARD = { minX: 27, maxX: 49, minZ: 8, maxZ: 32 };

export const TRUCK_SPAWN = { x: 35, z: 24, yaw: 0 }; // nose pointing north, toward the street

// A plywood ramp in the street. Drive west from the yard and send it.
export const RAMP = { x: 10, z: -1.2, length: 7, width: 4, height: 1.7, yaw: Math.PI / 2 }; // rises toward -X

export const ALLEY = { minX: -50, maxX: 50, minZ: -31, maxZ: -27 };

export const PLAYER_SPAWNS = [
  { x: 2, z: 6.5, yaw: 0 }, { x: -2, z: 6.5, yaw: 0 }, { x: 4, z: 8.5, yaw: 0.3 }, { x: -4, z: 8.5, yaw: -0.3 },
];

export const GARY_SPAWN = { x: 6, z: 12 };

// Interaction spots (press F).
export const COOLER = { x: -4.5, z: 11.5 }; // beer fridge at the block party
export const SCRATCH = { x: -31.5, z: 9.6 }; // scratch-off machine outside Trash Mart

// Dynamic props: physics objects you can grab, throw, knock over and crash into.
// kind maps to PROP_TYPES below.
export const PROPS = [
  // Curb bins, one in front of each house. Knock one over and it spills.
  { kind: 'bin', x: -40, z: -7.6 }, { kind: 'bin', x: -22, z: -7.6 }, { kind: 'bin', x: -4, z: -7.6 },
  { kind: 'bin', x: 14, z: -7.6 }, { kind: 'bin', x: 32, z: -7.6 },
  { kind: 'bin', x: -22, z: 7.6 }, { kind: 'bin', x: 4.5, z: 7.6 }, { kind: 'bin', x: 14, z: 7.6 },
  // Junk lawn
  { kind: 'couch', x: -19, z: 12.5, yaw: 0.25 },
  { kind: 'toilet', x: -13.5, z: 11, yaw: -0.6 },
  { kind: 'fridge', x: -23.5, z: 11.5, yaw: 0.2 },
  { kind: 'barrel', x: -12.5, z: 14 },
  // Block party
  { kind: 'table', x: 0, z: 11.5 },
  { kind: 'table', x: 3.8, z: 13 },
  { kind: 'chair', x: -1.6, z: 10.4, yaw: 0.6 }, { kind: 'chair', x: 1.6, z: 10.2, yaw: -0.5 },
  { kind: 'chair', x: 0.3, z: 13.3, yaw: 3.1 }, { kind: 'chair', x: 2.4, z: 12.4, yaw: 1.2 },
  { kind: 'chair', x: 5.3, z: 11.7, yaw: -2.2 }, { kind: 'stool', x: -3, z: 12.6 },
  // Dump-n-Go yard
  { kind: 'barrel', x: 30, z: 12 }, { kind: 'barrel', x: 31, z: 12.6 }, { kind: 'barrel', x: 30.4, z: 13.5 },
  { kind: 'crate', x: 44, z: 26 }, { kind: 'crate', x: 44, z: 27.3 }, { kind: 'crate', x: 44.2, z: 26.6, y: 1.3 },
  { kind: 'box', x: 41, z: 29 }, { kind: 'box', x: 42, z: 29.4 }, { kind: 'box', x: 41.6, z: 30.3 },
  { kind: 'propane', x: 46.5, z: 12 }, { kind: 'propane', x: 47.2, z: 12.4 },
  // Street
  { kind: 'cone', x: 5, z: -2.5 }, { kind: 'cone', x: 5, z: 0 }, { kind: 'cone', x: 5, z: 2.5 },
  { kind: 'cone', x: -45, z: -2 }, { kind: 'cone', x: -45, z: 2 },
  // Alley
  { kind: 'bin', x: -30, z: -29.5 }, { kind: 'bin', x: -8, z: -29.5 }, { kind: 'bin', x: 10, z: -29.5 }, { kind: 'bin', x: 27, z: -29.5 },
  { kind: 'box', x: -26, z: -28.5 }, { kind: 'box', x: 20, z: -29.8 },
  { kind: 'crate', x: 0, z: -29.6 },
];

// Physics + look for each prop kind. size is the collision box in meters (x, y, z).
// model ids are from data/models.js; 'cone' is built from primitives.
export const PROP_TYPES = {
  bin: { model: 'curbBin', mass: 14, name: 'trash can', spills: true },
  couch: { model: 'couch', mass: 45, name: 'couch' },
  toilet: { model: 'toilet', mass: 25, name: 'lawn toilet' },
  fridge: { model: 'fridge', mass: 60, name: 'dead fridge' },
  barrel: { model: 'barrel', mass: 22, name: 'barrel' },
  crate: { model: 'crate', mass: 10, name: 'crate' },
  box: { model: 'box', mass: 3, name: 'cardboard box' },
  table: { model: 'table', mass: 12, name: 'table' },
  chair: { model: 'chair', mass: 4, name: 'lawn chair' },
  stool: { model: 'stool', mass: 3, name: 'stool' },
  propane: { model: 'propane', mass: 9, name: 'propane tank' },
  cone: { model: null, mass: 2, name: 'traffic cone' },
};

// Where litter spawns. weight = share of the trash, types = weighted table.
const STREET = { wrapper: 4, can: 4, cup: 3, bottle: 3, pizzaBox: 1, tire: 0.4 };
const YARDS = { wrapper: 3, can: 3, cup: 2, bottle: 3, pizzaBox: 1.5 };
const PARTY = { cup: 5, can: 5, beer: 4, bottle: 2, pizzaBox: 3 };
const ALLEY_MIX = { wrapper: 2, can: 2, bottle: 2, pizzaBox: 2, tire: 1, gasCan: 1 };

export const TRASH_REGIONS = [
  { name: 'street', weight: 3, rect: { minX: -46, maxX: 46, minZ: -6.4, maxZ: 6.4 }, types: STREET },
  { name: 'north lawns', weight: 2.5, rect: { minX: -46, maxX: 46, minZ: -11, maxZ: -7 }, types: YARDS },
  { name: 'south lawns', weight: 2, rect: { minX: -26, maxX: 26, minZ: 7, maxZ: 10 }, types: YARDS },
  { name: 'party', weight: 2, rect: { minX: -7, maxX: 8, minZ: 9.5, maxZ: 15 }, types: PARTY },
  { name: 'junk lawn', weight: 1, rect: { minX: -26, maxX: -11, minZ: 9.5, maxZ: 14.5 }, types: ALLEY_MIX },
  { name: 'alley', weight: 3, rect: { minX: -46, maxX: 46, minZ: -31, maxZ: -27 }, types: ALLEY_MIX },
  { name: 'yard', weight: 1, rect: { minX: 28, maxX: 47, minZ: 21, maxZ: 31 }, types: ALLEY_MIX },
];

export const TRASH_TARGET = 75; // items on the ground at once
export const TRASH_RESPAWN_SECONDS = 1.6;
