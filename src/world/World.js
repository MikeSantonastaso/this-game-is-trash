// Builds the whole map: terrain, streets, every zone's set dressing, zone
// borders, and the forest/hills beyond the edge. Returns the layout the game
// systems need (spawn, sell points, shops, curb bins, gates, trash regions).
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';
import { createSurfaces, planarUV } from '../render/Surfaces.js';
import { WORLD, GATES, getZone, onRoad } from '../data/zones.js';
import { createKit } from './kit.js';
import { buildRoads } from './builders/roads.js';
import { buildPark } from './builders/park.js';
import { buildNeighborhood } from './builders/neighborhood.js';
import { buildDowntown } from './builders/downtown.js';
import { buildBorders } from './builders/borders.js';
import { buildDumpster, buildShop } from './builders/structures.js';

// How far outside the world rect a point is (0 inside).
const outside = (x, z) => Math.hypot(Math.max(WORLD.minX - x, 0, x - WORLD.maxX), Math.max(WORLD.minZ - z, 0, z - WORLD.maxZ));

function buildGround({ scene, physics }, surf) {
  const cx = (WORLD.minX + WORLD.maxX) / 2, cz = (WORLD.minZ + WORLD.maxZ) / 2;
  const geo = new THREE.PlaneGeometry(1800, 1800, 180, 180);
  geo.rotateX(-Math.PI / 2);
  geo.translate(cx, 0, cz);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const k = THREE.MathUtils.smoothstep(outside(x, z), 25, 170);
    const h = (Math.sin(x * 0.021) * Math.cos(z * 0.017) * 0.5 + 0.5) * 45 + Math.sin(x * 0.05 + z * 0.03) * 9;
    pos.setY(i, k * h);
  }
  geo.computeVertexNormals();
  planarUV(geo, 3.5);
  const ground = new THREE.Mesh(geo, surf.grass);
  ground.receiveShadow = true;
  scene.add(ground);
  const body = new CANNON.Body({ mass: 0, material: physics.materials.ground, collisionFilterGroup: GROUP.GROUND, collisionFilterMask: MASK_ALL });
  body.addShape(new CANNON.Plane());
  body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physics.add(body);
}

export function buildWorld(ctx) {
  const surf = createSurfaces();
  ctx.lod = [];
  const c = { ...ctx, surf };
  const kit = createKit(ctx, 1337);
  buildGround(ctx, surf);
  buildRoads(kit, surf);

  // Zone 1
  const park = buildPark(kit, c);
  // Borders before neighborhoods so houses keep clear of booths and billboards.
  const borders = buildBorders(kit, ctx);
  const gateClear = GATES.map((g) => ({ x: g.x, z: g.z, r: 16 }));

  // Zone 2: Maple Court. Dumpster on Elm Rd, facing the street.
  const mapleDump = buildDumpster(kit, c, new THREE.Vector3(8, 0, -139.5));
  const maple = buildNeighborhood(kit, getZone('maple'), { assets: ctx.assets, surf, reserved: gateClear });

  // Zone 3: Oakridge Heights. Dumpster + Trash Mart outlet on Park Ave.
  const oakDump = buildDumpster(kit, c, new THREE.Vector3(222, 0, -51.5));
  const oakShop = buildShop(kit, c, new THREE.Vector3(185, 0, -55), { x: 0, z: 1 }, 'TRASH MART OUTLET');
  const oak = buildNeighborhood(kit, getZone('oakridge'), { assets: ctx.assets, surf, reserved: gateClear });

  // Zone 4: Downtown skyline (fenced, coming soon).
  buildDowntown(kit, c);

  // ---- Forest beyond the edge of the map ----
  const pines = [];
  for (let i = 0; i < 2200 && pines.length < 380; i++) {
    const x = kit.rand(WORLD.minX - 260, WORLD.maxX + 260), z = kit.rand(WORLD.minZ - 260, WORLD.maxZ + 260);
    const d = outside(x, z);
    if (d < 8 || d > 240) continue;
    const m = kit.placement(x, 0, z, kit.rand(0, Math.PI * 2), kit.rand(1, 1.8));
    // Sit on the hills.
    const k = THREE.MathUtils.smoothstep(d, 25, 170);
    m.elements[13] = k * ((Math.sin(x * 0.021) * Math.cos(z * 0.017) * 0.5 + 0.5) * 45 + Math.sin(x * 0.05 + z * 0.03) * 9) - 0.3;
    m.id = kit.pick(['pine1', 'pine2', 'pine3', 'pine1', 'tree1', 'tree3']);
    pines.push(m);
  }
  kit.instanced(pines, { castShadow: false, far: 420 });

  kit.flush();

  return {
    spawn: park.spawn,
    spawnYaw: park.spawnYaw,
    garySpawn: park.garySpawn,
    dynamicProps: park.dynamicProps,
    motorPool: park.motorPool,
    obstacles: kit.obstacles,
    dropOffs: [
      park.dropOff,
      { ...mapleDump, zone: 'maple', name: 'Maple Court dumpster' },
      { ...oakDump, zone: 'oakridge', name: 'Oakridge dumpster' },
    ],
    shops: [park.shop, { ...oakShop, zone: 'oakridge' }],
    bins: [...maple.bins, ...oak.bins],
    trashRegions: { park: park.trashRegion, maple: maple.trashRegion, oakridge: oak.trashRegion },
    borders,
    lod: ctx.lod,
    houses: maple.houses + oak.houses,
    onRoad,
  };
}
