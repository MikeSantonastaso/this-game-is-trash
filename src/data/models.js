// Model manifest. All models are CC0 (public domain); see assets/CREDITS.md.
// height / width = target size in meters after normalization.
const C = 'assets/models/characters/';
const N = 'assets/models/nature/';
const P = 'assets/models/props/';
const B = 'assets/models/buildings/';
const S = 'assets/models/street/';
const T = 'assets/models/trash/';
const Y = 'assets/models/party/';
const V = 'assets/models/vehicles/';

// Playable characters (Quaternius Ultimate Modular Men/Women, rigged).
export const CHARACTERS = [
  { id: 'worker', name: 'Hi-Vis Hank' },
  { id: 'workerF', name: 'Hi-Vis Hannah' },
  { id: 'punk', name: 'Punk' },
  { id: 'farmer', name: 'Farmer' },
  { id: 'casual2', name: 'Weekend Dad' },
];

export const MODELS = {
  // Characters
  worker: { url: C + 'Worker.glb', height: 1.8 },
  workerF: { url: C + 'WorkerF.glb', height: 1.75 },
  gary: { url: C + 'Casual.glb', height: 1.8 },
  casual2: { url: C + 'Casual2.glb', height: 1.8 },
  farmer: { url: C + 'Farmer.glb', height: 1.8 },
  punk: { url: C + 'Punk.glb', height: 1.8 },

  // Nature (Quaternius Ultimate Nature)
  tree1: { url: N + 'CommonTree_1.glb', height: 7 },
  tree2: { url: N + 'CommonTree_2.glb', height: 6.5 },
  tree3: { url: N + 'CommonTree_3.glb', height: 7.5 },
  tree4: { url: N + 'CommonTree_4.glb', height: 6 },
  tree5: { url: N + 'CommonTree_5.glb', height: 8 },
  pine1: { url: N + 'PineTree_1.glb', height: 10 },
  pine2: { url: N + 'PineTree_2.glb', height: 9 },
  pine3: { url: N + 'PineTree_3.glb', height: 11 },
  bush1: { url: N + 'Bush_1.glb', height: 1.2 },
  bush2: { url: N + 'Bush_2.glb', height: 1.1 },
  rock2: { url: N + 'Rock_Moss_2.glb', height: 0.8 },
  flowers: { url: N + 'Flowers.glb', height: 0.45, castShadow: false },
  plant1: { url: N + 'Plant_1.glb', height: 0.6, castShadow: false },
  stump: { url: N + 'TreeStump.glb', height: 0.6 },

  // Street + fences
  fence: { url: P + 'Fence.glb', width: 2.5 },
  streetlight: { url: S + 'Streetlight_Single.glb', height: 5.5 },
  stopSign: { url: S + 'Sign_Stop.glb', height: 2.4 },
  noParking: { url: S + 'Sign_NoParking.glb', height: 2.4 },
  bench: { url: P + 'Bench_1.glb', width: 2.0 },

  // Buildings (Quaternius Buildings pack 3)
  shop: { url: B + '1Story_Sign_Mat.glb', height: 4.6 },
  house1: { url: B + '1Story_GableRoof_Mat.glb', height: 5.5 },
  house2: { url: B + '2Story_Mat.glb', height: 7 },
  house3: { url: B + '2Story_GableRoof_Mat.glb', height: 8 },
  house4: { url: B + '2Story_Balcony_Mat.glb', height: 7 },
  house5: { url: B + '2Story_Sidehouse_Mat.glb', height: 7 },
  house6: { url: B + '1Story_Mat.glb', height: 4.5 },

  // Dynamic props (Quaternius house interior, medieval village, survival packs)
  curbBin: { url: P + 'Trashcan_Green.glb', height: 1.15 },
  couch: { url: Y + 'Couch_Medium1.glb', width: 2.1 },
  toilet: { url: Y + 'Bathroom_Toilet.glb', height: 0.8 },
  fridge: { url: Y + 'Kitchen_Fridge.glb', height: 1.8 },
  barrel: { url: Y + 'Barrel.glb', height: 1.0 },
  crate: { url: Y + 'Crate.glb', height: 0.9 },
  box: { url: Y + 'Package_1.glb', width: 0.7 },
  table: { url: Y + 'Table_RoundLarge.glb', width: 1.9 },
  chair: { url: Y + 'Chair_1.glb', height: 1.0 },
  stool: { url: Y + 'Stool.glb', height: 0.75 },
  propane: { url: T + 'PropaneTank.glb', height: 0.75 },
  coin: { url: P + 'Coin.glb', height: 0.3, castShadow: false },

  // Trash that uses real models (the rest is procedural, see render/TrashModels.js)
  beerCan: { url: T + 'Can_Red.glb', height: 0.2 },
  beerCanOpen: { url: T + 'Can_Open.glb', height: 0.2 },
  beerCanCrushed: { url: T + 'Can_Broken.glb', height: 0.16 },
  gasCan: { url: T + 'GasCan.glb', height: 0.42 },
  waterBottle1: { url: T + 'WaterBottle_1.glb', height: 0.3 },
  waterBottle2: { url: T + 'WaterBottle_2.glb', height: 0.34 },

  // Vehicles (Kenney Starter Kit Racing)
  pickup: { url: V + 'pickup.glb', width: 5.0 },
};
