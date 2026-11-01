// Model manifest. All models are CC0 (public domain); see assets/CREDITS.md.
// height / width = target size in meters after normalization.
const C = 'assets/models/characters/';
const N = 'assets/models/nature/';
const P = 'assets/models/props/';
const B = 'assets/models/buildings/';
const S = 'assets/models/street/';

export const MODELS = {
  // Characters (Quaternius Ultimate Modular Men/Women, rigged)
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
  rock1: { url: N + 'Rock_Moss_1.glb', height: 1.0 },
  rock2: { url: N + 'Rock_Moss_2.glb', height: 0.8 },
  rock3: { url: N + 'Rock_Moss_3.glb', height: 1.3 },
  flowers: { url: N + 'Flowers.glb', height: 0.45, castShadow: false },
  grass1: { url: N + 'Grass.glb', height: 0.5, castShadow: false },
  grass2: { url: N + 'Grass_2.glb', height: 0.45, castShadow: false },
  grass3: { url: N + 'Grass_Short.glb', height: 0.3, castShadow: false },
  plant1: { url: N + 'Plant_1.glb', height: 0.6, castShadow: false },
  plant2: { url: N + 'Plant_2.glb', height: 0.7, castShadow: false },
  stump: { url: N + 'TreeStump.glb', height: 0.6 },
  log: { url: N + 'WoodLog.glb', width: 2.4 },

  // Props
  bench1: { url: P + 'Bench_1.glb', width: 2.0 },
  bench2: { url: P + 'Bench_2.glb', width: 2.0 },
  fence: { url: P + 'Fence.glb', width: 2.5 },
  trashcanGreen: { url: P + 'Trashcan_Green.glb', height: 1.1 },
  trashcanLarge: { url: P + 'Trashcan_Large.glb', height: 1.0 },
  trashcanCyl: { url: P + 'Trashcan_Cylindric.glb', height: 0.9 },

  // Street (Quaternius Street pack)
  streetlight: { url: S + 'Streetlight_Single.glb', height: 5.5 },
  streetlight2: { url: S + 'Streetlight_Double.glb', height: 5.5 },
  stopSign: { url: S + 'Sign_Stop.glb', height: 2.4 },
  noParking: { url: S + 'Sign_NoParking.glb', height: 2.4 },

  // Buildings (Quaternius Buildings pack 3)
  shop: { url: B + '1Story_Sign_Mat.glb', height: 4.2 },
  house1: { url: B + '1Story_GableRoof_Mat.glb', height: 5.5 },
  house2: { url: B + '2Story_Mat.glb', height: 7 },
  house3: { url: B + '2Story_GableRoof_Mat.glb', height: 8 },
  house4: { url: B + '2Story_Balcony_Mat.glb', height: 7 },
  house5: { url: B + '2Story_Sidehouse_Mat.glb', height: 7 },
  house6: { url: B + '1Story_Mat.glb', height: 4.5 },
  house7: { url: B + '3Story_Slim_Mat.glb', height: 10 },
};
