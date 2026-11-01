// Builds the block from data/block.js: ground, Rubbish Road, sidewalks,
// driveways, houses, fences, the alley, Trash Mart, the Dump-n-Go yard, the
// block party, the ramp, trees and grass. Static only: the physics props,
// trash, Gary and the truck are networked entities created by the host.
//
// Every machine builds the same static world, so it never goes over the network.
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';
import { createKit } from './kit.js';
import { createSurfaces } from '../render/Surfaces.js';
import { createGrassField } from '../render/GrassField.js';
import { buildDumpster, buildShop, signBoard } from './builders/structures.js';
import { signTexture } from './textures.js';
import * as B from '../data/block.js';

export function buildBlock(ctx) {
  const { scene, physics, assets, graphics } = ctx;
  const kit = createKit(ctx, 4242);
  const surf = createSurfaces();
  const rects = []; // footprints trash should not spawn in: {minX,maxX,minZ,maxZ}
  const block = (minX, maxX, minZ, maxZ) => rects.push({ minX, maxX, minZ, maxZ });
  const R = B.ROAD;

  // ---- Ground ----
  const groundBody = new CANNON.Body({ mass: 0, material: physics.materials.ground, collisionFilterGroup: GROUP.GROUND, collisionFilterMask: MASK_ALL });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physics.add(groundBody);
  kit.flat(260, 220, 0, 0, surf.grass, 0, 3);

  // ---- Rubbish Road + sidewalks ----
  const roadLen = R.maxX - R.minX;
  kit.flat(roadLen, R.halfWidth * 2, 0, 0, surf.asphalt, 0.02, 6);
  for (const s of [-1, 1]) {
    kit.flat(roadLen, R.sidewalk, 0, s * (R.halfWidth + R.sidewalk / 2), surf.concrete, 0.05, 3);
  }
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.7 });
  for (let x = R.minX + 2; x < R.maxX - 2; x += 5) kit.flat(2.6, 0.16, x, 0, lineMat, 0.03);
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xbdb8ae, roughness: 0.9 });
  for (const s of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(roadLen, 0.12, 0.18), curbMat);
    curb.position.set(0, 0.06, s * R.halfWidth);
    curb.receiveShadow = true;
    scene.add(curb);
  }

  // ---- Houses ----
  const sidewalkEdge = R.halfWidth + R.sidewalk;
  for (const h of B.HOUSES) {
    const size = assets.size(h.model);
    const z = h.side * h.setback;
    const rotY = h.side < 0 ? 0 : Math.PI; // models face +Z
    const m = kit.place(h.model, h.x, z, rotY);
    kit.tintModel(m, h.tint, 0.2);
    kit.staticBox([size.x, size.y, size.z], [h.x, size.y / 2, z], rotY);
    block(h.x - size.x / 2 - 0.5, h.x + size.x / 2 + 0.5, z - size.z / 2 - 0.5, z + size.z / 2 + 0.5);
    // Driveway + front path
    const front = z - h.side * (size.z / 2);
    const dLen = Math.abs(front - h.side * sidewalkEdge);
    kit.flat(1.6, dLen, h.x, h.side * sidewalkEdge + h.side * dLen / 2, surf.paving, 0.04, 2);
    kit.flat(3.2, dLen + 0.4, h.x + 5.5, h.side * sidewalkEdge + h.side * dLen / 2, surf.concrete, 0.035, 3);
    // A bush or two by the door, a tree in the front yard
    kit.place(kit.pick(['bush1', 'bush2']), h.x - 2.2, front + h.side * 0.9, kit.rand(0, 6));
    kit.place(kit.pick(['bush1', 'bush2']), h.x + 2.4, front + h.side * 0.9, kit.rand(0, 6));
    if (!h.noTree) {
      kit.staticCylinder(0.35, 4, h.x - 6.2, h.side * (sidewalkEdge + 3.2));
      kit.place(kit.pick(['tree1', 'tree2', 'tree4']), h.x - 6.2, h.side * (sidewalkEdge + 3.2), kit.rand(0, 6));
    }
  }

  // Lot-line fences between front yards (short picket runs)
  const fenceRun = (x0, z0, x1, z1, { collider = true } = {}) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.5));
    const rotY = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      kit.place('fence', x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, rotY);
    }
    if (collider) kit.staticBox([len, 1.2, 0.15], [(x0 + x1) / 2, 0.6, (z0 + z1) / 2], rotY);
  };
  for (const x of [-27, -9, 9, 27]) fenceRun(x, -sidewalkEdge - 1, x, -25.5);
  for (const x of [-27, -9, 9]) fenceRun(x, sidewalkEdge + 1, x, 26);

  // ---- Alley behind the north houses ----
  const A = B.ALLEY;
  kit.flat(A.maxX - A.minX, A.maxZ - A.minZ, (A.minX + A.maxX) / 2, (A.minZ + A.maxZ) / 2, surf.dirt, 0.03, 4);
  // Back fences with a gate-sized gap behind each house so you can reach the alley.
  for (let x = B.BOUNDS.minX; x < B.BOUNDS.maxX; x += 18) fenceRun(x, A.maxZ + 0.6, Math.min(x + 14, B.BOUNDS.maxX), A.maxZ + 0.6);

  // ---- Trash Mart (corner store) + scratch-off machine ----
  const shop = buildShop(kit, { scene, assets }, new THREE.Vector3(B.SHOP.x, 0, B.SHOP.z), new THREE.Vector3(0, 0, B.SHOP.facing), B.SHOP.label);
  const ss = assets.size('shop');
  block(B.SHOP.x - ss.x / 2 - 0.5, B.SHOP.x + ss.x / 2 + 0.5, B.SHOP.z - ss.z / 2 - 0.5, B.SHOP.z + ss.z / 2 + 0.5);
  kit.flat(14, 8, B.SHOP.x, sidewalkEdge + 4, surf.asphalt, 0.025, 6); // little parking lot
  const scratch = buildScratchMachine(kit, scene, B.SCRATCH);

  // ---- Dump-n-Go yard ----
  const Y = B.YARD;
  kit.flat(Y.maxX - Y.minX, Y.maxZ - Y.minZ, (Y.minX + Y.maxX) / 2, (Y.minZ + Y.maxZ) / 2, surf.dirt, 0.03, 5);
  fenceRun(Y.minX, Y.minZ + 6, Y.minX, Y.maxZ);
  fenceRun(Y.minX, Y.maxZ, Y.maxX, Y.maxZ);
  const dumpsters = B.DUMPSTERS.map((d) => buildDumpster(kit, { scene, surf }, new THREE.Vector3(d.x, 0, d.z), d.label));
  for (const d of B.DUMPSTERS) block(d.x - 3, d.x + 3, d.z - 2.5, d.z + 2.5);
  signBoard(kit, scene, { x: (Y.minX + Y.maxX) / 2 - 4, z: Y.minZ + 0.4, rotY: Math.PI, w: 5, h: 1.2, y: 2.4, texture: signTexture('DUMP-N-GO · WE BUY TRASH', { bg: '#1f5a38', w: 1024, h: 256, font: 'bold 72px sans-serif' }) });

  // ---- The ramp ----
  buildRamp(kit, scene, physics, B.RAMP);
  block(B.RAMP.x - 4, B.RAMP.x + 4, B.RAMP.z - 2.5, B.RAMP.z + 2.5);

  // ---- Block party ----
  const cooler = buildPartyDecor(kit, scene, B.COOLER);

  // ---- Street furniture ----
  for (const x of [-42, -24, -6, 12, 30, 46]) {
    for (const s of [-1, 1]) {
      if (s > 0 && x > 26) continue;
      kit.place('streetlight', x, s * (R.halfWidth + 0.7), s < 0 ? 0 : Math.PI);
      kit.staticCylinder(0.15, 5, x, s * (R.halfWidth + 0.7));
    }
  }
  kit.place('stopSign', -48, -R.halfWidth - 0.8, Math.PI / 2);
  kit.place('noParking', 26, R.halfWidth + 0.8, Math.PI);

  // ---- Edges of the world: road barriers, hedges, a ring of trees ----
  for (const s of [-1, 1]) {
    const x = s * (B.BOUNDS.maxX - 1);
    buildBarrier(kit, scene, x, R.halfWidth * 2 + R.sidewalk * 2);
  }
  const edge = [];
  for (let x = B.BOUNDS.minX; x <= B.BOUNDS.maxX; x += 3.2) { edge.push([x, B.BOUNDS.minZ]); edge.push([x, B.BOUNDS.maxZ]); }
  for (let z = B.BOUNDS.minZ; z <= B.BOUNDS.maxZ; z += 3.2) {
    if (Math.abs(z) < R.halfWidth + R.sidewalk + 0.5) continue;
    edge.push([B.BOUNDS.minX, z]); edge.push([B.BOUNDS.maxX, z]);
  }
  for (const [x, z] of edge) kit.place(kit.pick(['bush1', 'bush2']), x + kit.rand(-0.3, 0.3), z + kit.rand(-0.3, 0.3), kit.rand(0, 6), 0);
  // Invisible walls just inside the hedges
  const W = B.BOUNDS;
  kit.staticBox([W.maxX - W.minX, 6, 1], [(W.minX + W.maxX) / 2, 3, W.minZ - 0.3]);
  kit.staticBox([W.maxX - W.minX, 6, 1], [(W.minX + W.maxX) / 2, 3, W.maxZ + 0.3]);
  kit.staticBox([1, 6, W.maxZ - W.minZ], [W.minX - 0.3, 3, (W.minZ + W.maxZ) / 2]);
  kit.staticBox([1, 6, W.maxZ - W.minZ], [W.maxX + 0.3, 3, (W.minZ + W.maxZ) / 2]);
  const ring = [];
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + kit.rand(-0.03, 0.03);
    const rx = 62 + kit.rand(0, 25), rz = 50 + kit.rand(0, 25);
    ring.push(kit.placement(Math.cos(a) * rx, 0, Math.sin(a) * rz, kit.rand(0, 6), kit.rand(0.8, 1.3)));
    ring[ring.length - 1].id = kit.pick(['pine1', 'pine2', 'pine3', 'tree3', 'tree5']);
  }
  kit.instanced(ring, { far: 1000 });

  // Backyard trees
  for (const [x, z] of [[-40, -23], [-14, -24], [6, -23], [24, -23], [40, -24], [-30, 26], [-12, 28], [12, 28], [-44, 28]]) {
    kit.staticCylinder(0.4, 4, x, z);
    kit.place(kit.pick(['tree1', 'tree2', 'tree3', 'tree4', 'tree5']), x, z, kit.rand(0, 6));
  }

  // ---- Grass tufts on the lawns (skip pavement, footprints) ----
  const onPavement = (x, z) => Math.abs(z) < sidewalkEdge + 0.3
    || (z > A.minZ - 0.3 && z < A.maxZ + 0.3)
    || (x > Y.minX && z > Y.minZ - 0.5)
    || rects.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ);
  const density = ctx.lowQuality ? 1.2 : 5;
  const grass = createGrassField([
    { region: { minX: W.minX, maxX: W.maxX, minZ: W.minZ, maxZ: W.maxZ }, density, height: [0.12, 0.32], accept: (x, z) => !onPavement(x, z) },
  ], { time: graphics.time, rng: kit.rng });
  scene.add(grass);

  kit.flush();

  return {
    kit,
    rects,
    dumpsters,
    shop,
    scratch,
    cooler,
    isBlocked(x, z, pad = 0) {
      return rects.some((r) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad) || kit.blocked(x, z, pad);
    },
  };
}

// Scratch-off ticket machine: a glowing kiosk outside Trash Mart.
function buildScratchMachine(kit, scene, pos) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.6), kit.mat(0x6b2fb5, { roughness: 0.5, metalness: 0.2 }));
  body.position.y = 0.85;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.55), new THREE.MeshBasicMaterial({ map: signTexture('SCRATCH-ITS', { bg: '#ffd23f', fg: '#6b2fb5', w: 512, h: 384, font: 'bold 84px sans-serif' }) }));
  screen.position.set(0, 1.25, -0.305);
  screen.rotation.y = Math.PI;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), kit.mat(0x111111));
  slot.position.set(0, 0.8, -0.31);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 0.7), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: 0.6 }));
  top.position.y = 1.82;
  g.add(body, screen, slot, top);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(pos.x, 0, pos.z);
  scene.add(g);
  kit.staticBox([0.9, 1.9, 0.6], [pos.x, 0.95, pos.z]);
  kit.obstacles.push({ x: pos.x, z: pos.z, r: 1.2 });
  return { position: new THREE.Vector3(pos.x, 0, pos.z), interactRadius: 2.2, glow: top };
}

// Plywood launch ramp with hazard stripes.
function buildRamp(kit, scene, physics, r) {
  const angle = Math.atan2(r.height, r.length);
  const slope = Math.hypot(r.length, r.height);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.yaw, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0)));
  // Board: local -Z is the high end; with yaw = +90°, the high end points to -X.
  const center = new THREE.Vector3(r.x, r.height / 2 - 0.12, r.z);
  const mat = new THREE.MeshStandardMaterial({ color: 0xc89b5d, roughness: 0.85 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(r.width, 0.2, slope), mat);
  board.position.copy(center);
  board.quaternion.copy(q);
  board.castShadow = board.receiveShadow = true;
  scene.add(board);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(r.width, 0.5), new THREE.MeshBasicMaterial({ map: hazardTexture() }));
  stripe.position.set(0, 0.105, -slope / 2 + 0.3);
  stripe.rotation.x = -Math.PI / 2;
  board.add(stripe);
  // Support: a block under the high end
  const hi = new THREE.Vector3(0, 0, -slope / 2 + 0.4).applyQuaternion(q).add(center);
  const sup = new THREE.Mesh(new THREE.BoxGeometry(r.width * 0.9, hi.y, 0.5), kit.mat(0x7a5a35));
  sup.position.set(hi.x, hi.y / 2, hi.z);
  sup.rotation.y = r.yaw;
  scene.add(sup);
  const body = new CANNON.Body({ mass: 0, material: physics.materials.ground, collisionFilterGroup: GROUP.GROUND, collisionFilterMask: MASK_ALL });
  body.addShape(new CANNON.Box(new CANNON.Vec3(r.width / 2, 0.1, slope / 2)));
  body.position.set(center.x, center.y, center.z);
  body.quaternion.set(q.x, q.y, q.z, q.w);
  physics.add(body);
}

function hazardTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#ffcc00'; g.fillRect(0, 0, 256, 32);
  g.fillStyle = '#111';
  for (let x = -32; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, 32); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ROAD CLOSED barrier across the street at the edge of the map.
function buildBarrier(kit, scene, x, width) {
  const tex = hazardTexture();
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, width), [kit.mat(0xffcc00), kit.mat(0xffcc00), kit.mat(0xffcc00), kit.mat(0xffcc00), new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })]);
  board.position.y = 0.9;
  for (const z of [-width / 2 + 0.3, 0, width / 2 - 0.3]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), kit.mat(0xeeeeee));
    leg.position.set(0, 0.55, z);
    g.add(leg);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: signTexture('ROAD CLOSED', { bg: '#ff7a00', fg: '#111' }), side: THREE.DoubleSide }));
  sign.position.set(0, 1.45, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(board, sign);
  g.position.x = x;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
}

// String lights, a banner, a grill and the beer fridge (cooler) for the party.
function buildPartyDecor(kit, scene, cooler) {
  // Beer cooler: a big red cooler with a white lid.
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.6), kit.mat(0xc62828, { roughness: 0.5 }));
  box.position.y = 0.3;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.12, 0.64), kit.mat(0xf5f5f5, { roughness: 0.4 }));
  lid.position.y = 0.66;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('TRASH PANDA LAGER', { bg: '#c62828', w: 512, h: 128, font: 'bold 44px sans-serif' }) }));
  label.position.set(0, 0.32, 0.305);
  g.add(box, lid, label);
  g.position.set(cooler.x, 0, cooler.z);
  g.rotation.y = -0.4;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  kit.staticBox([1.1, 0.72, 0.6], [cooler.x, 0.36, cooler.z], -0.4);
  kit.obstacles.push({ x: cooler.x, z: cooler.z, r: 1 });

  // Grill
  const grill = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), kit.mat(0x222222, { metalness: 0.5, roughness: 0.5 }));
  bowl.position.y = 0.85;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), kit.mat(0x222222, { metalness: 0.5, roughness: 0.5 }));
  dome.position.set(0.25, 1.0, 0);
  dome.rotation.z = -1.2;
  grill.add(bowl, dome);
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.85), kit.mat(0x333333));
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.25, 0.42, Math.sin(a) * 0.25);
    grill.add(leg);
  }
  grill.position.set(7.5, 0, 11);
  grill.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(grill);
  kit.staticCylinder(0.4, 1.1, 7.5, 11);

  // Banner between two poles + string lights
  const poleMat = kit.mat(0x8a6a45);
  const poles = [[-6.5, 8.6], [8.5, 8.6], [8.5, 15.5], [-6.5, 15.5]];
  for (const [x, z] of poles) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.4), poleMat);
    p.position.set(x, 1.7, z);
    p.castShadow = true;
    scene.add(p);
    kit.staticCylinder(0.1, 3.4, x, z);
  }
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(9, 1), new THREE.MeshBasicMaterial({ map: signTexture('BLOCK PARTY!! BYOB (BRING YOUR OWN BAG)', { bg: '#2d9cdb', w: 2048, h: 228, font: 'bold 110px sans-serif' }), side: THREE.DoubleSide }));
  banner.position.set(1, 2.9, 8.6);
  banner.rotation.y = Math.PI; // face the street
  scene.add(banner);
  const bulbGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const colors = [0xff5a5a, 0xffd23f, 0x5ad1ff, 0x7dff6b, 0xff8ad8];
  const bulbMats = colors.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2 }));
  for (let i = 0; i < poles.length; i++) {
    const [x0, z0] = poles[i], [x1, z1] = poles[(i + 1) % poles.length];
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.8);
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const p = new THREE.Vector3(x0 + (x1 - x0) * t, 3.3 - Math.sin(t * Math.PI) * 0.6, z0 + (z1 - z0) * t);
      pts.push(p);
      if (k > 0 && k < n) {
        const b = new THREE.Mesh(bulbGeo, bulbMats[(i * 7 + k) % bulbMats.length]);
        b.position.copy(p).y -= 0.08;
        scene.add(b);
      }
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x222222 })));
  }
  return { position: new THREE.Vector3(cooler.x, 0, cooler.z), interactRadius: 2.2 };
}
