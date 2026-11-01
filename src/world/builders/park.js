// Layout for "Dumpy Park", the starting area. Each area gets a builder like
// this; it creates meshes + static colliders and returns the points of interest
// the game needs (spawn, dumpster, shop, trash spawn bounds).
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from '../../systems/PhysicsWorld.js';
import { signTexture, grassTexture } from '../textures.js';

// Deterministic RNG so the park looks the same every visit.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildPark(ctx, area) {
  const { scene, physics } = ctx;
  const half = area.size / 2;
  const rng = mulberry32(1337);
  const obstacles = []; // { x, z, r } circles trash should not spawn inside
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

  const staticBox = (size, pos, material, { rotY = 0, rotX = 0, mesh = true, cast = true } = {}) => {
    const body = new CANNON.Body({
      mass: 0, material: physics.materials.ground,
      collisionFilterGroup: GROUP.PROP, collisionFilterMask: MASK_ALL,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
    body.position.set(pos[0], pos[1], pos[2]);
    body.quaternion.setFromEuler(rotX, rotY, 0, 'YXZ');
    physics.add(body);
    if (!mesh) return { body };
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    m.position.copy(body.position);
    m.quaternion.copy(body.quaternion);
    m.castShadow = cast;
    m.receiveShadow = true;
    scene.add(m);
    return { body, mesh: m };
  };

  // ---- Ground ----
  const grass = grassTexture();
  grass.repeat.set((area.size + 80) / 4, (area.size + 80) / 4);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(area.size + 80, area.size + 80), mat(0xffffff, { map: grass }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const groundBody = new CANNON.Body({ mass: 0, material: physics.materials.ground, collisionFilterGroup: GROUP.GROUND, collisionFilterMask: MASK_ALL });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physics.add(groundBody);

  // ---- Paths (visual only) ----
  const pathMat = mat(0xcdb893);
  for (const [w, d, x, z] of [[3, area.size - 4, 0, 0], [area.size - 4, 3, 0, 2]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.01, z);
    p.receiveShadow = true;
    scene.add(p);
  }

  // ---- Fence around the edge ----
  const fenceMat = mat(0x8a5a3b);
  for (const [w, d, x, z] of [
    [area.size, 0.2, 0, -half], [area.size, 0.2, 0, half],
    [0.2, area.size, -half, 0], [0.2, area.size, half, 0],
  ]) {
    staticBox([w, 1.2, d], [x, 0.6, z], fenceMat);
    staticBox([w, 6, d], [x, 3, z], null, { mesh: false }); // invisible tall wall keeps thrown stuff in
  }

  // ---- Dumpster (the drop-off). Open-top box you can throw bags, trash and Gary into. ----
  const dumpPos = new THREE.Vector3(0, 0, -18);
  const dumpMat = mat(0x2f7d4f, { metalness: 0.3 });
  const W = 3.4, D = 2.2, H = 1.5, T = 0.12;
  staticBox([W, T, D], [dumpPos.x, T / 2, dumpPos.z], dumpMat);
  staticBox([W, H, T], [dumpPos.x, H / 2, dumpPos.z - D / 2], dumpMat);
  staticBox([W, H, T], [dumpPos.x, H / 2, dumpPos.z + D / 2], dumpMat);
  staticBox([T, H, D], [dumpPos.x - W / 2, H / 2, dumpPos.z], dumpMat);
  staticBox([T, H, D], [dumpPos.x + W / 2, H / 2, dumpPos.z], dumpMat);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, D), mat(0x1f5a38));
  lid.position.set(dumpPos.x, H + 0.6, dumpPos.z - D / 2 - 0.45);
  lid.rotation.x = -1.1;
  lid.castShadow = true;
  scene.add(lid);
  const dumpSign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: signTexture('SELL TRASH', { bg: '#1f5a38' }) }));
  dumpSign.position.set(dumpPos.x, 0.85, dumpPos.z + D / 2 + 0.07);
  scene.add(dumpSign);
  obstacles.push({ x: dumpPos.x, z: dumpPos.z, r: 3.5 });

  // ---- Shop kiosk ----
  const shopPos = new THREE.Vector3(9, 0, 9);
  staticBox([3, 2.4, 2], [shopPos.x, 1.2, shopPos.z], mat(0xf2f2f2));
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.15, 1.2), mat(0xd64545));
  awning.position.set(shopPos.x, 2.3, shopPos.z + 1.3);
  awning.rotation.x = 0.25;
  awning.castShadow = true;
  scene.add(awning);
  const shopSign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), new THREE.MeshBasicMaterial({ map: signTexture('TRASH MART', { bg: '#d64545' }) }));
  shopSign.position.set(shopPos.x, 1.6, shopPos.z + 1.01);
  scene.add(shopSign);
  obstacles.push({ x: shopPos.x, z: shopPos.z, r: 3 });

  // ---- Launch ramp (for science) ----
  staticBox([3, 0.3, 6], [-10, 1.1, -6], mat(0xb08850), { rotX: 0.38 });
  obstacles.push({ x: -10, z: -6, r: 4 });

  // ---- Benches ----
  const benchMat = mat(0x7a4b2a);
  for (const [x, z, ry] of [[4, -4, 0], [-5, 7, Math.PI], [16, 5, Math.PI / 2], [-16, -2, -Math.PI / 2]]) {
    staticBox([2, 0.12, 0.6], [x, 0.55, z], benchMat, { rotY: ry });
    for (const side of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), benchMat);
      leg.position.set(x + Math.cos(ry) * side, 0.25, z - Math.sin(ry) * side);
      leg.rotation.y = ry;
      scene.add(leg);
    }
    obstacles.push({ x, z, r: 1.5 });
  }

  // ---- Trees ----
  const trunkMat = mat(0x6b4226);
  const leafMats = [mat(0x2e8b3a), mat(0x3a9e48), mat(0x257030)];
  const spawn = new THREE.Vector3(0, 0, 6);
  let placed = 0;
  for (let attempt = 0; placed < 26 && attempt < 2000; attempt++) {
    const x = (rng() * 2 - 1) * (half - 3);
    const z = (rng() * 2 - 1) * (half - 3);
    if (Math.abs(x) < 2.5 || Math.abs(z - 2) < 2.5) continue; // keep paths clear
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 2)) continue;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 6) continue;
    const s = 0.8 + rng() * 0.7;
    const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUP.PROP, collisionFilterMask: MASK_ALL });
    body.addShape(new CANNON.Cylinder(0.25 * s, 0.3 * s, 2.2 * s, 8));
    body.position.set(x, 1.1 * s, z);
    physics.add(body);
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.3 * s, 2.2 * s, 8), trunkMat);
    trunk.position.y = 1.1 * s;
    trunk.castShadow = true;
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 * s, 0), leafMats[placed % 3]);
    leaves.position.y = 2.9 * s;
    leaves.castShadow = true;
    tree.add(trunk, leaves);
    tree.position.set(x, 0, z);
    scene.add(tree);
    obstacles.push({ x, z, r: 0.8 * s });
    placed++;
  }

  return {
    spawn,
    spawnYaw: 0,
    bounds: { minX: -half + 1.5, maxX: half - 1.5, minZ: -half + 1.5, maxZ: half - 1.5 },
    obstacles,
    dropOff: {
      position: dumpPos,
      interactRadius: 3.6,
      // Anything whose center ends up inside this box counts as "in the dumpster".
      trigger: new THREE.Box3(
        new THREE.Vector3(dumpPos.x - W / 2 + T, 0, dumpPos.z - D / 2 + T),
        new THREE.Vector3(dumpPos.x + W / 2 - T, H + 0.3, dumpPos.z + D / 2 - T),
      ),
    },
    shop: { position: shopPos, interactRadius: 3.4 },
    garySpawn: new THREE.Vector3(-3, 0, 2),
  };
}
