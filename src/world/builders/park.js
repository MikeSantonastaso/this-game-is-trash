// Layout for "Dumpy Park", the starting area, set in an open world: the park
// sits beside a street lined with houses (the Small Neighborhood, coming
// later), with meadows and forest rolling off to the horizon. No fences or
// walls box you in; Player.keepInWorld gently turns you around far out.
//
// Builders create meshes + static colliders and return the points of interest
// the game needs (spawn, dumpster, shop, trash spawn bounds, obstacles).
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from '../../systems/PhysicsWorld.js';
import { signTexture, grassTexture } from '../textures.js';

// Deterministic RNG so the world looks the same every visit.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARK = { minX: -40, maxX: 40, minZ: -34, maxZ: 40 };
const ROAD_Z = -42;          // center line of the main street
const ROAD_HALF = 4;         // asphalt half width
const WALK_HALF = 2.5;       // sidewalk width
const CROSS_X = 34;          // side street heading into the neighborhood
const WALK_RADIUS = 125;

export function buildPark(ctx, area) {
  const { scene, physics, assets } = ctx;
  const rng = mulberry32(1337);
  const rand = (a, b) => a + rng() * (b - a);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const obstacles = []; // { x, z, r } circles trash should not spawn inside
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  const q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const placement = (x, y, z, rotY, s) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.clone().setFromAxisAngle(UP, rotY), new THREE.Vector3(s, s, s));

  const staticBox = (size, pos, rotY = 0, group = GROUP.PROP) => {
    const body = new CANNON.Body({ mass: 0, material: physics.materials.ground, collisionFilterGroup: group, collisionFilterMask: MASK_ALL });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
    body.position.set(pos[0], pos[1], pos[2]);
    body.quaternion.setFromEuler(0, rotY, 0);
    physics.add(body);
    return body;
  };
  const staticCylinder = (radius, height, x, z) => {
    const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUP.PROP, collisionFilterMask: MASK_ALL });
    body.addShape(new CANNON.Cylinder(radius, radius, height, 8));
    body.position.set(x, height / 2, z);
    physics.add(body);
  };
  const place = (id, x, z, rotY = 0, y = 0) => {
    const m = assets.instance(id);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    scene.add(m);
    return m;
  };
  const flat = (w, d, x, z, material, y = 0.01) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, y, z);
    p.receiveShadow = true;
    scene.add(p);
    return p;
  };
  const blocked = (x, z, pad = 0) => obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + pad);
  const onRoad = (x, z, pad = 0) =>
    Math.abs(z - ROAD_Z) < ROAD_HALF + WALK_HALF + pad || (z < ROAD_Z && Math.abs(x - CROSS_X) < ROAD_HALF + WALK_HALF + pad);

  const onPath = (x, z, pad = 0) => {
    if (x < PARK.minX - 2 || x > PARK.maxX + 2 || z < PARK.minZ - 6 || z > PARK.maxZ + 2) return false;
    const ring = Math.hypot(x, z - 4);
    return Math.abs(x) < 2 + pad || Math.abs(z - 4) < 2 + pad || (ring > 16.5 - pad && ring < 20.5 + pad);
  };

  // ---- Sky dome ----
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2; skyCanvas.height = 256;
  const sg = skyCanvas.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3f86d6'); grad.addColorStop(0.55, '#8cc4f0'); grad.addColorStop(1, '#dbeefa');
  sg.fillStyle = grad; sg.fillRect(0, 0, 2, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  scene.add(sky);

  // ---- Ground: flat where you play, rolling hills toward the horizon ----
  const grass = grassTexture();
  grass.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 90, 90), mat(0xffffff, { map: grass }));
  ground.rotation.x = -Math.PI / 2;
  const gpos = ground.geometry.attributes.position;
  for (let i = 0; i < gpos.count; i++) {
    const x = gpos.getX(i), y = gpos.getY(i);
    const r = Math.hypot(x, y);
    const k = THREE.MathUtils.smoothstep(r, 150, 260);
    const h = (Math.sin(x * 0.021) * Math.cos(y * 0.017) * 0.5 + 0.5) * 30 + Math.sin(x * 0.05 + y * 0.03) * 6;
    gpos.setZ(i, k * h);
  }
  ground.geometry.computeVertexNormals();
  ground.receiveShadow = true;
  scene.add(ground);
  const groundBody = new CANNON.Body({ mass: 0, material: physics.materials.ground, collisionFilterGroup: GROUP.GROUND, collisionFilterMask: MASK_ALL });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physics.add(groundBody);

  // ---- Streets ----
  const asphalt = mat(0x3b3d40);
  const sidewalk = mat(0xb9b5ad);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2d24b });
  flat(320, ROAD_HALF * 2, 0, ROAD_Z, asphalt, 0.02);
  flat(320, WALK_HALF, 0, ROAD_Z + ROAD_HALF + WALK_HALF / 2, sidewalk, 0.04);
  flat(320, WALK_HALF, 0, ROAD_Z - ROAD_HALF - WALK_HALF / 2, sidewalk, 0.04);
  for (let x = -158; x < 160; x += 6) if (Math.abs(x - CROSS_X) > 6) flat(3, 0.18, x + 1.5, ROAD_Z, lineMat, 0.03);
  const crossLen = 150, crossZ = ROAD_Z - ROAD_HALF - crossLen / 2;
  flat(ROAD_HALF * 2, crossLen, CROSS_X, crossZ, asphalt, 0.021);
  flat(WALK_HALF, crossLen, CROSS_X - ROAD_HALF - WALK_HALF / 2, crossZ - WALK_HALF, sidewalk, 0.041);
  flat(WALK_HALF, crossLen, CROSS_X + ROAD_HALF + WALK_HALF / 2, crossZ - WALK_HALF, sidewalk, 0.041);
  for (let z = ROAD_Z - 10; z > ROAD_Z - crossLen; z -= 6) flat(0.18, 3, CROSS_X, z, lineMat, 0.031);
  for (let x = -150; x <= 150; x += 22) {
    const side = (x / 22) % 2 === 0 ? 1 : -1;
    const z = ROAD_Z + side * (ROAD_HALF + WALK_HALF - 0.6);
    if (Math.abs(x - CROSS_X) < 8) continue;
    place('streetlight', x, z, side > 0 ? Math.PI : 0);
    staticCylinder(0.15, 5.5, x, z);
  }
  place('stopSign', CROSS_X - ROAD_HALF - 1, ROAD_Z - ROAD_HALF - WALK_HALF + 0.3, Math.PI / 2);
  // Sign at the mouth of the side street: the next area.
  const nextSign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1), new THREE.MeshBasicMaterial({ map: signTexture('SMALL NEIGHBORHOOD · COMING SOON', { bg: '#2d6cdf', w: 1024, h: 256, font: 'bold 74px sans-serif' }) }));
  nextSign.position.set(CROSS_X + ROAD_HALF + 2.2, 2.2, ROAD_Z - ROAD_HALF - WALK_HALF - 2);
  nextSign.rotation.y = -0.4;
  scene.add(nextSign);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), mat(0x666666));
  post.position.set(nextSign.position.x, 1.1, nextSign.position.z - 0.05);
  scene.add(post);

  // ---- Houses: the neighborhood across the street ----
  const houseIds = ['house1', 'house2', 'house3', 'house4', 'house5', 'house6', 'house7'];
  const tints = [0xf7f1e3, 0xf3d9b1, 0xc9dcf0, 0xf2c4b5, 0xd8ebc4, 0xe0d2f0, 0xfff3c4];
  const tintModel = (model, tint) => model.traverse((o) => {
    if (o.isMesh && o.material) {
      const tintOne = (m) => { const c = m.clone(); c.color.lerp(new THREE.Color(tint), 0.35).multiplyScalar(1.25); return c; };
      o.material = Array.isArray(o.material) ? o.material.map(tintOne) : tintOne(o.material);
    }
  });
  const addHouse = (x, z, rotY) => {
    const id = pick(houseIds);
    const size = assets.size(id);
    const m = place(id, x, z, rotY);
    tintModel(m, pick(tints));
    const swap = Math.abs(Math.sin(rotY)) > 0.5;
    staticBox([swap ? size.z : size.x, size.y, swap ? size.x : size.z], [x, size.y / 2, z], 0);
    // Front-yard trash can on the curb, a hint of the next job.
    if (rng() < 0.5) {
      const dir = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
      const can = place('trashcanGreen', x + dir.x * (size.z / 2 + 2.5) + rand(-1, 1), z + dir.z * (size.z / 2 + 2.5), rotY);
      can.scale.setScalar(1.1);
    }
  };
  for (let x = -138; x <= 140; x += 13) {
    if (Math.abs(x - CROSS_X) < 10) continue;
    addHouse(x + rand(-1, 1), ROAD_Z - ROAD_HALF - WALK_HALF - 7.5, 0);
  }
  for (let z = ROAD_Z - 22; z > ROAD_Z - 140; z -= 13) {
    addHouse(CROSS_X - ROAD_HALF - WALK_HALF - 7.5, z, Math.PI / 2);
    addHouse(CROSS_X + ROAD_HALF + WALK_HALF + 7.5, z, -Math.PI / 2);
  }

  // ---- Park paths ----
  const pathMat = mat(0xcdb893);
  flat(3, PARK.maxZ - PARK.minZ + 8, 0, (PARK.minZ + PARK.maxZ) / 2 - 4, pathMat);
  flat(PARK.maxX - PARK.minX, 3, 0, 4, pathMat);
  const loop = new THREE.Mesh(new THREE.RingGeometry(17, 20, 48), pathMat);
  loop.rotation.x = -Math.PI / 2;
  loop.position.set(0, 0.012, 4);
  loop.receiveShadow = true;
  scene.add(loop);

  // ---- Dumpster (the drop-off). Open-top steel bin on a concrete pad. ----
  const dumpPos = new THREE.Vector3(-10, 0, -30);
  flat(7, 5, dumpPos.x, dumpPos.z, mat(0x9a9a96), 0.03);
  const dumpMat = mat(0x2f7d4f, { metalness: 0.4, roughness: 0.55 });
  const W = 3.4, D = 2.2, H = 1.5, T = 0.12;
  const box = (size, pos, material = dumpMat) => {
    staticBox(size, pos);
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    m.position.set(...pos);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  box([W, T, D], [dumpPos.x, 0.25 + T / 2, dumpPos.z]);
  box([W, H, T], [dumpPos.x, 0.25 + H / 2, dumpPos.z - D / 2]);
  box([W, H - 0.3, T], [dumpPos.x, 0.25 + (H - 0.3) / 2, dumpPos.z + D / 2]);
  box([T, H, D], [dumpPos.x - W / 2, 0.25 + H / 2, dumpPos.z]);
  box([T, H, D], [dumpPos.x + W / 2, 0.25 + H / 2, dumpPos.z]);
  const rim = mat(0x1f5a38, { metalness: 0.4 });
  for (const s of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W + 0.12, 0.08, 0.12), rim);
    lip.position.set(dumpPos.x, 0.25 + H - (s > 0 ? 0.3 : 0), dumpPos.z + s * D / 2);
    scene.add(lip);
  }
  const wheelMat = mat(0x222222);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 12), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(dumpPos.x + sx * (W / 2 - 0.3), 0.13, dumpPos.z + sz * (D / 2 - 0.3));
    scene.add(w);
  }
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D * 0.6), mat(0x1f3d2b, { metalness: 0.3 }));
  lid.geometry.translate(0, 0, -D * 0.3);
  lid.position.set(dumpPos.x, 0.25 + H, dumpPos.z - D / 2);
  lid.rotation.x = 1.25;
  lid.castShadow = true;
  scene.add(lid);
  const dumpSign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.55), new THREE.MeshBasicMaterial({ map: signTexture('SELL TRASH', { bg: '#1f5a38' }) }));
  dumpSign.position.set(dumpPos.x, 0.9, dumpPos.z + D / 2 + 0.07);
  scene.add(dumpSign);
  obstacles.push({ x: dumpPos.x, z: dumpPos.z, r: 3.8 });

  // ---- Trash Mart (shop) ----
  const shopPos = new THREE.Vector3(20, 0, 14);
  const shopRot = -Math.PI / 2; // door faces -X, toward the park
  const shopSize = assets.size('shop');
  const shop = place('shop', shopPos.x, shopPos.z, shopRot);
  tintModel(shop, 0xf5e6d0);
  staticBox([shopSize.z, shopSize.y, shopSize.x], [shopPos.x, shopSize.y / 2, shopPos.z]);
  const shopSign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: signTexture('TRASH MART', { bg: '#d64545' }) }));
  shopSign.position.set(shopPos.x - shopSize.z / 2 - 0.08, shopSize.y * 0.78, shopPos.z);
  shopSign.rotation.y = -Math.PI / 2;
  scene.add(shopSign);
  const shopFront = new THREE.Vector3(shopPos.x - shopSize.z / 2 - 1.6, 0, shopPos.z);
  obstacles.push({ x: shopPos.x, z: shopPos.z, r: 4.5 });

  // ---- Launch ramp (for science) ----
  const rampBody = staticBox([3, 0.3, 6], [-26, 1.1, -14], 0);
  rampBody.quaternion.setFromEuler(0.38, 0, 0);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 6), mat(0xb08850));
  ramp.position.copy(rampBody.position);
  ramp.quaternion.copy(rampBody.quaternion);
  ramp.castShadow = ramp.receiveShadow = true;
  scene.add(ramp);
  obstacles.push({ x: -26, z: -14, r: 4 });

  // ---- Benches with bins and lamps along the paths ----
  const lamps = [[-3, -12], [3, 20], [-22, 2], [22, 6], [-3, 32]];
  for (const [x, z] of lamps) { place('streetlight2', x, z, 0); staticCylinder(0.15, 5.5, x, z); obstacles.push({ x, z, r: 0.8 }); }
  const benches = [[4.5, -6, -Math.PI / 2], [-4.5, 12, Math.PI / 2], [14, 1.4, 0], [-14, 6.6, Math.PI], [4.5, 28, -Math.PI / 2], [-28, 1.4, 0]];
  const dynamicProps = [];
  for (const [x, z, rot] of benches) {
    place(pick(['bench1', 'bench2']), x, z, rot);
    const swap = Math.abs(Math.sin(rot)) > 0.5;
    staticBox([swap ? 0.6 : 2, 0.9, swap ? 2 : 0.6], [x, 0.45, z]);
    obstacles.push({ x, z, r: 1.6 });
    // A tippable bin next to each bench.
    const off = new THREE.Vector3(1.6, 0, 0).applyAxisAngle(UP, rot);
    dynamicProps.push({ id: pick(['trashcanLarge', 'trashcanCyl']), x: x + off.x, z: z + off.z });
  }

  // ---- Trees, bushes, rocks inside the park (with colliders) ----
  const spawn = new THREE.Vector3(0, 0, 12);
  const parkTrees = [];
  for (let attempt = 0; parkTrees.length < 34 && attempt < 3000; attempt++) {
    const x = rand(PARK.minX, PARK.maxX), z = rand(PARK.minZ, PARK.maxZ);
    if (Math.abs(x) < 3 || Math.abs(z - 4) < 3) continue;
    const rr = Math.hypot(x, z - 4);
    if (rr > 15.5 && rr < 21.5) continue; // keep the loop path clear
    if (blocked(x, z, 3) || Math.hypot(x - spawn.x, z - spawn.z) < 8) continue;
    const id = pick(['tree1', 'tree2', 'tree3', 'tree4', 'tree5']);
    const s = rand(0.8, 1.15);
    parkTrees.push(placement(x, 0, z, rand(0, Math.PI * 2), s));
    const trunk = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUP.PROP, collisionFilterMask: MASK_ALL });
    trunk.addShape(new CANNON.Cylinder(0.3 * s, 0.35 * s, 3, 8));
    trunk.position.set(x, 1.5, z);
    physics.add(trunk);
    obstacles.push({ x, z, r: 1 });
    parkTrees[parkTrees.length - 1].id = id;
  }
  const byId = (list) => list.reduce((acc, m) => ((acc[m.id] ??= []).push(m), acc), {});
  for (const [id, mats] of Object.entries(byId(parkTrees))) scene.add(assets.instanced(id, mats));

  const scatter = (ids, count, region, { pad = 0.5, scale = [0.8, 1.3], collide = 0, shadow = true, avoidRoad = true } = {}) => {
    const list = [];
    for (let attempt = 0; list.length < count && attempt < count * 20; attempt++) {
      const x = rand(region.minX, region.maxX), z = rand(region.minZ, region.maxZ);
      if (region.minR && Math.hypot(x, z) < region.minR) continue;
      if (region.maxR && Math.hypot(x, z) > region.maxR) continue;
      if (avoidRoad && onRoad(x, z, 2)) continue;
      if (onPath(x, z, pad)) continue;
      if (blocked(x, z, pad)) continue;
      const m = placement(x, 0, z, rand(0, Math.PI * 2), rand(scale[0], scale[1]));
      m.id = pick(ids);
      list.push(m);
      if (collide) { staticCylinder(collide, 1, x, z); obstacles.push({ x, z, r: collide + 0.4 }); }
    }
    for (const [id, mats] of Object.entries(byId(list))) scene.add(assets.instanced(id, mats, { castShadow: shadow }));
  };
  const parkRegion = { ...PARK };
  scatter(['bush1', 'bush2'], 40, parkRegion, { pad: 1, collide: 0.5 });
  scatter(['rock1', 'rock2', 'rock3'], 14, parkRegion, { pad: 1, collide: 0.4 });
  scatter(['stump', 'log'], 5, parkRegion, { pad: 1.5, collide: 0.5 });
  scatter(['flowers', 'plant1', 'plant2'], 120, parkRegion, { pad: 0.2, shadow: false });
  scatter(['grass1', 'grass2', 'grass3'], 500, { minX: -110, maxX: 110, minZ: -36, maxZ: 110 }, { pad: 0, shadow: false });

  // ---- Meadow and forest out to the horizon (decor, no colliders needed past the walk radius) ----
  scatter(['tree1', 'tree2', 'tree3', 'tree4', 'tree5'], 70, { minX: -125, maxX: 125, minZ: -30, maxZ: 125, minR: 62 }, { pad: 2, collide: 0.4, scale: [0.9, 1.4] });
  // Far forest: no shadows (it's outside the shadow map anyway, and skipping it keeps the shadow pass cheap).
  scatter(['pine1', 'pine2', 'pine3'], 150, { minX: -260, maxX: 260, minZ: -260, maxZ: 260, minR: WALK_RADIUS + 5, maxR: 250 }, { pad: 2, scale: [1, 1.7], avoidRoad: false, shadow: false });
  scatter(['tree1', 'tree3', 'tree5'], 60, { minX: -260, maxX: 260, minZ: -260, maxZ: 260, minR: WALK_RADIUS - 5, maxR: 230 }, { pad: 2, scale: [1.1, 1.7], avoidRoad: false, shadow: false });

  return {
    spawn,
    spawnYaw: 0, // looking north toward the dumpster and the street
    walkRadius: WALK_RADIUS,
    bounds: { minX: PARK.minX + 1, maxX: PARK.maxX - 1, minZ: PARK.minZ + 1, maxZ: PARK.maxZ - 1 },
    obstacles,
    dynamicProps,
    dropOff: {
      position: dumpPos,
      interactRadius: 3.8,
      // Anything whose center ends up inside this box counts as "in the dumpster".
      trigger: new THREE.Box3(
        new THREE.Vector3(dumpPos.x - W / 2 + T, 0.25, dumpPos.z - D / 2 + T),
        new THREE.Vector3(dumpPos.x + W / 2 - T, 0.25 + H + 0.3, dumpPos.z + D / 2 - T),
      ),
    },
    shop: { position: shopFront, interactRadius: 3.2 },
    garySpawn: new THREE.Vector3(-5, 0, 6),
  };
}
