// Dumpy Park, the starting zone: lawns, paths, trees, benches with tippable
// bins, a launch ramp, the first dumpster, the Trash Mart, and the motor pool
// where the Rusty Pickup waits. Park Ave runs along its north edge, with
// Maple Court's fence and gates across the street.
import * as THREE from 'three';
import { createGrassField } from '../../render/GrassField.js';
import { onRoad, getZone } from '../../data/zones.js';
import { buildDumpster, buildShop, signBoard } from './structures.js';
import { signTexture } from '../textures.js';

const PARK = { minX: -40, maxX: 40, minZ: -34, maxZ: 40 };

export function buildPark(kit, ctx) {
  const { scene, graphics, surf } = ctx;
  const { rand, pick, obstacles } = kit;
  const zoneRect = getZone('park').rect;

  const onPath = (x, z, pad = 0) => {
    if (x < PARK.minX - 2 || x > PARK.maxX + 2 || z < PARK.minZ - 6 || z > PARK.maxZ + 2) return false;
    const ring = Math.hypot(x, z - 4);
    return Math.abs(x) < 2 + pad || Math.abs(z - 4) < 2 + pad || (ring > 16.5 - pad && ring < 20.5 + pad);
  };

  // ---- Paths ----
  kit.flat(3, PARK.maxZ - PARK.minZ + 8, 0, (PARK.minZ + PARK.maxZ) / 2 - 4, surf.dirt);
  kit.flat(PARK.maxX - PARK.minX, 3, 0, 4, surf.dirt);
  kit.disc(17, 20, 0, 4, surf.dirt, 0.012);

  // ---- Dumpster + Trash Mart ----
  const dropOff = buildDumpster(kit, ctx, new THREE.Vector3(-10, 0, -30));
  const shop = buildShop(kit, ctx, new THREE.Vector3(20, 0, 14), { x: -1, z: 0 });

  // ---- Motor pool: where the Rusty Pickup is sold and parked ----
  const lot = new THREE.Vector3(58, 0, -22);
  kit.flat(16, 20, lot.x, lot.z, surf.asphalt, 0.03);
  kit.flat(5, 3, lot.x, -34, surf.asphalt, 0.031);
  const stripe = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
  for (const sx of [-3.5, 3.5]) kit.flat(0.15, 7, lot.x + sx, lot.z + 1, stripe, 0.035, 1);
  const motorSign = signBoard(kit, scene, { x: lot.x + 6.5, z: -31, rotY: 0, w: 4.2, h: 1.1, y: 1.4,
    texture: signTexture('TRASH CO. MOTOR POOL', { bg: '#b5562b', w: 1024, h: 256, font: 'bold 84px sans-serif' }) });
  obstacles.push({ x: lot.x, z: lot.z, r: 9 });

  // ---- Launch ramp (for science) ----
  const rampBody = kit.staticBox([3, 0.3, 6], [-26, 1.1, -14], 0);
  rampBody.quaternion.setFromEuler(0.38, 0, 0);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 6), kit.mat(0xb08850));
  ramp.position.copy(rampBody.position);
  ramp.quaternion.copy(rampBody.quaternion);
  ramp.castShadow = ramp.receiveShadow = true;
  scene.add(ramp);
  obstacles.push({ x: -26, z: -14, r: 4 });

  // ---- Benches with bins and lamps along the paths ----
  for (const [x, z] of [[-3, -12], [3, 20], [-22, 2], [22, 6], [-3, 32]]) {
    kit.place('streetlight2', x, z, 0);
    kit.staticCylinder(0.15, 5.5, x, z);
    obstacles.push({ x, z, r: 0.8 });
  }
  const dynamicProps = [];
  for (const [x, z, rot] of [[4.5, -6, -Math.PI / 2], [-4.5, 12, Math.PI / 2], [14, 1.4, 0], [-14, 6.6, Math.PI], [4.5, 28, -Math.PI / 2], [-28, 1.4, 0]]) {
    kit.place(pick(['bench1', 'bench2']), x, z, rot);
    const swap = Math.abs(Math.sin(rot)) > 0.5;
    kit.staticBox([swap ? 0.6 : 2, 0.9, swap ? 2 : 0.6], [x, 0.45, z]);
    obstacles.push({ x, z, r: 1.6 });
    const off = new THREE.Vector3(1.6, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    dynamicProps.push({ id: pick(['trashcanLarge', 'trashcanCyl']), x: x + off.x, z: z + off.z });
  }

  // ---- Trees, bushes, rocks inside the park (with colliders) ----
  const spawn = new THREE.Vector3(0, 0, 12);
  const trees = [];
  for (let attempt = 0; trees.length < 34 && attempt < 3000; attempt++) {
    const x = rand(PARK.minX, PARK.maxX), z = rand(PARK.minZ, PARK.maxZ);
    if (Math.abs(x) < 3 || Math.abs(z - 4) < 3) continue;
    const rr = Math.hypot(x, z - 4);
    if (rr > 15.5 && rr < 21.5) continue;
    if (kit.blocked(x, z, 3) || Math.hypot(x - spawn.x, z - spawn.z) < 8) continue;
    const s = rand(0.8, 1.15);
    const m = kit.placement(x, 0, z, rand(0, Math.PI * 2), s);
    m.id = pick(['tree1', 'tree2', 'tree3', 'tree4', 'tree5']);
    trees.push(m);
    kit.staticCylinder(0.32 * s, 3, x, z);
    obstacles.push({ x, z, r: 1 });
  }
  kit.instanced(trees);

  const scatter = (ids, count, region, { pad = 0.5, scale = [0.8, 1.3], collide = 0, shadow = true, far = 260 } = {}) => {
    const list = [];
    for (let attempt = 0; list.length < count && attempt < count * 20; attempt++) {
      const x = rand(region.minX, region.maxX), z = rand(region.minZ, region.maxZ);
      if (region.minR && Math.hypot(x, z) < region.minR) continue;
      if (onRoad(x, z, 2) || onPath(x, z, pad) || kit.blocked(x, z, pad)) continue;
      const m = kit.placement(x, 0, z, rand(0, Math.PI * 2), rand(scale[0], scale[1]));
      m.id = pick(ids);
      list.push(m);
      if (collide) { kit.staticCylinder(collide, 1, x, z); obstacles.push({ x, z, r: collide + 0.4 }); }
    }
    kit.instanced(list, { castShadow: shadow, far });
  };
  scatter(['bush1', 'bush2'], 40, PARK, { pad: 1, collide: 0.5 });
  scatter(['rock1', 'rock2', 'rock3'], 14, PARK, { pad: 1, collide: 0.4 });
  scatter(['stump', 'log'], 5, PARK, { pad: 1.5, collide: 0.5 });
  scatter(['flowers', 'plant1', 'plant2'], 120, PARK, { pad: 0.2, shadow: false, far: 110 });
  // Meadow around the park, out to the edges of the zone.
  const meadow = { minX: zoneRect.minX + 3, maxX: zoneRect.maxX - 3, minZ: -34, maxZ: zoneRect.maxZ - 2, minR: 50 };
  scatter(['grass1', 'grass2', 'plant1'], 160, meadow, { pad: 0, shadow: false, far: 110 });
  scatter(['tree1', 'tree2', 'tree3', 'tree4', 'tree5'], 85, { ...meadow, minR: 60 }, { pad: 2, collide: 0.4, scale: [0.9, 1.4] });

  // ---- Grass blades: a mowed lawn in the park, longer meadow grass around it ----
  const clear = (x, z, pad) => !onRoad(x, z, 0.3) && !onPath(x, z, pad) && !kit.blocked(x, z, -0.6);
  const inPark = (x, z) => x > PARK.minX && x < PARK.maxX && z > PARK.minZ && z < PARK.maxZ;
  const grass = createGrassField([
    { region: PARK, density: 8, height: [0.1, 0.2], accept: (x, z) => clear(x, z, -0.4) },
    { region: { minX: -85, maxX: 72, minZ: -34, maxZ: 78 }, density: 1.6, height: [0.25, 0.5],
      accept: (x, z) => !inPark(x, z) && clear(x, z, 0) && Math.hypot(x, z) < 90 },
  ], { time: graphics.time, densityScale: graphics.lowQuality ? 0.3 : 1, rng: kit.rng });
  scene.add(grass);
  // Grass chunks far from the camera aren't worth drawing.
  for (const chunk of grass.children) kit.lod.push({ object: chunk, center: chunk.boundingSphere.center, far: 110 });

  return {
    spawn,
    spawnYaw: 0, // looking north toward the dumpster and the street
    dynamicProps,
    dropOff: { ...dropOff, zone: 'park', name: 'Park dumpster' },
    shop: { ...shop, zone: 'park' },
    garySpawn: new THREE.Vector3(-5, 0, 6),
    motorPool: { position: lot, truckSpawn: new THREE.Vector3(lot.x, 0, lot.z + 1), truckYaw: 0, sign: motorSign },
    trashRegion: { rect: { minX: PARK.minX + 1, maxX: PARK.maxX - 1, minZ: PARK.minZ + 1, maxZ: PARK.maxZ - 1 } },
  };
}
