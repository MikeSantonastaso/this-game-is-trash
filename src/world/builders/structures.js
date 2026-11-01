// Reusable set pieces: the dumpster (a sell point), a Trash Mart storefront,
// and signs on posts.
import * as THREE from 'three';
import { signTexture } from '../textures.js';

// Open-top steel dumpster on a concrete pad. The sign side faces +Z.
export function buildDumpster(kit, { scene, surf }, pos, label = 'SELL TRASH') {
  const W = 3.4, D = 2.2, H = 1.5, T = 0.12;
  kit.flat(7, 5, pos.x, pos.z, surf.paving, 0.05, 2.5);
  const dumpMat = kit.mat(0x2f7d4f, { metalness: 0.4, roughness: 0.55 });
  const box = (size, p, material = dumpMat) => {
    kit.staticBox(size, p);
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    m.position.set(...p);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };
  box([W, T, D], [pos.x, 0.25 + T / 2, pos.z]);
  box([W, H, T], [pos.x, 0.25 + H / 2, pos.z - D / 2]);
  box([W, H - 0.3, T], [pos.x, 0.25 + (H - 0.3) / 2, pos.z + D / 2]);
  box([T, H, D], [pos.x - W / 2, 0.25 + H / 2, pos.z]);
  box([T, H, D], [pos.x + W / 2, 0.25 + H / 2, pos.z]);
  const rim = kit.mat(0x1f5a38, { metalness: 0.4 });
  for (const s of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W + 0.12, 0.08, 0.12), rim);
    lip.position.set(pos.x, 0.25 + H - (s > 0 ? 0.3 : 0), pos.z + s * D / 2);
    scene.add(lip);
  }
  const wheelMat = kit.mat(0x222222);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 12), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(pos.x + sx * (W / 2 - 0.3), 0.13, pos.z + sz * (D / 2 - 0.3));
    scene.add(w);
  }
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D * 0.6), kit.mat(0x1f3d2b, { metalness: 0.3 }));
  lid.geometry.translate(0, 0, -D * 0.3);
  lid.position.set(pos.x, 0.25 + H, pos.z - D / 2);
  lid.rotation.x = 1.25;
  lid.castShadow = true;
  scene.add(lid);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.55), new THREE.MeshBasicMaterial({ map: signTexture(label, { bg: '#1f5a38' }) }));
  sign.position.set(pos.x, 0.9, pos.z + D / 2 + 0.07);
  scene.add(sign);
  kit.obstacles.push({ x: pos.x, z: pos.z, r: 3.8 });
  return {
    position: pos.clone(),
    interactRadius: 3.8,
    // Anything whose center ends up inside this box counts as "in the dumpster".
    trigger: new THREE.Box3(
      new THREE.Vector3(pos.x - W / 2 + T, 0.25, pos.z - D / 2 + T),
      new THREE.Vector3(pos.x + W / 2 - T, 0.25 + H + 0.3, pos.z + D / 2 - T),
    ),
  };
}

// Trash Mart storefront. facing: unit vector the door faces (axis aligned).
export function buildShop(kit, { scene, assets }, pos, facing, label = 'TRASH MART') {
  const rotY = Math.atan2(facing.x, facing.z);
  const size = assets.size('shop');
  const shop = kit.place('shop', pos.x, pos.z, rotY);
  kit.tintModel(shop, 0xf5e6d0);
  kit.staticBox([size.x, size.y, size.z], [pos.x, size.y / 2, pos.z], rotY);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: signTexture(label, { bg: '#d64545' }) }));
  sign.position.set(pos.x + facing.x * (size.z / 2 + 0.08), size.y * 0.78, pos.z + facing.z * (size.z / 2 + 0.08));
  sign.rotation.y = rotY;
  scene.add(sign);
  kit.obstacles.push({ x: pos.x, z: pos.z, r: 4.5 });
  return { position: new THREE.Vector3(pos.x + facing.x * (size.z / 2 + 1.6), 0, pos.z + facing.z * (size.z / 2 + 1.6)), interactRadius: 3.2, label };
}

// A sign board on two posts. Returns the board mesh (its material.map can be swapped).
export function signBoard(kit, scene, { x, z, rotY = 0, w = 3.6, h = 1, y = 1.6, texture, back = 0x2a3442 }) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
  board.position.set(0, y + h / 2, 0.03);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.05), kit.mat(back));
  rear.position.set(0, y + h / 2, 0);
  rear.castShadow = true;
  g.add(board, rear);
  const postMat = kit.mat(0x666a70, { metalness: 0.5, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, y + h), postMat);
    post.position.set(s * (w / 2 - 0.2), (y + h) / 2, -0.06);
    post.castShadow = true;
    g.add(post);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  return board;
}
