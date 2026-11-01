// Zone borders: chain-link construction fence with gates where roads cross.
// Each gate has a boom barrier, a guard booth and a billboard whose texture
// the Zones system redraws with live requirement checkmarks.
//
// Nothing here is added to physics directly: the Zones system adds or removes
// the colliders as zones unlock.
import * as THREE from 'three';
import { BORDERS, GATES, GATE_HALF, getZone } from '../../data/zones.js';
import { CANNON, GROUP, MASK_ALL } from '../../systems/PhysicsWorld.js';
import { signTexture } from '../textures.js';

const FENCE_H = 2.4;
const samePair = (a, b) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

function chainLinkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(200,205,210,1)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(64, 64);
  g.moveTo(64, 0); g.lineTo(0, 64);
  g.moveTo(-32, 0); g.lineTo(32, 64);
  g.moveTo(32, 0); g.lineTo(96, 64);
  g.moveTo(32, 0); g.lineTo(-32, 64);
  g.moveTo(96, 0); g.lineTo(32, 64);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#d62f2f'; g.fillRect(i * 32, 0, 32, 32); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const staticBody = (physics, size, pos) => {
  const body = new CANNON.Body({ mass: 0, material: physics.materials.ground, collisionFilterGroup: GROUP.PROP, collisionFilterMask: MASK_ALL });
  body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
  body.position.set(...pos);
  return body;
};

export function buildBorders(kit, { scene, physics }) {
  const linkMat = new THREE.MeshStandardMaterial({ map: chainLinkTexture(), alphaTest: 0.35, side: THREE.DoubleSide, color: 0xb8bec4, metalness: 0.6, roughness: 0.45 });
  const postMat = kit.mat(0x8a9097, { metalness: 0.6, roughness: 0.4 });
  const bannerMat = new THREE.MeshBasicMaterial({ map: signTexture('ZONE CLOSED · SEE GATE', { bg: '#f28c28', fg: '#1b1b1b', w: 1024, h: 128, font: 'bold 72px sans-serif' }), side: THREE.DoubleSide });
  const postGeo = new THREE.CylinderGeometry(0.05, 0.05, FENCE_H + 0.1, 6);
  const fences = [];

  for (const border of BORDERS) {
    const [x1, z1] = border.from, [x2, z2] = border.to;
    const alongX = Math.abs(z2 - z1) < 0.01;
    const lo = alongX ? Math.min(x1, x2) : Math.min(z1, z2);
    const hi = alongX ? Math.max(x1, x2) : Math.max(z1, z2);
    const at = alongX ? z1 : x1;
    const gaps = GATES.filter((g) => samePair(g.between, border.between) && (alongX ? Math.abs(g.z - at) < 0.1 : Math.abs(g.x - at) < 0.1))
      .map((g) => (alongX ? g.x : g.z)).sort((a, b) => a - b);
    // Pieces between gates.
    const pieces = [];
    let start = lo;
    for (const c of gaps) { pieces.push([start, c - GATE_HALF]); start = c + GATE_HALF; }
    pieces.push([start, hi]);

    const group = new THREE.Group();
    const bodies = [];
    const posts = [];
    for (const [a, b] of pieces) {
      const len = b - a;
      if (len < 0.5) continue;
      const mid = (a + b) / 2;
      const geo = new THREE.PlaneGeometry(len, FENCE_H);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.9, uv.getY(i) * FENCE_H / 0.9);
      const panel = new THREE.Mesh(geo, linkMat);
      panel.position.set(alongX ? mid : at, FENCE_H / 2, alongX ? at : mid);
      if (!alongX) panel.rotation.y = Math.PI / 2;
      panel.castShadow = true;
      group.add(panel);
      for (let s = a; s <= b + 0.01; s += 3) posts.push(alongX ? [s, at] : [at, s]);
      // Banners every ~45 m so the fence reads as "closed", not "end of the world".
      for (let s = a + 12; s < b - 6; s += 45) {
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.55), bannerMat);
        banner.position.set(alongX ? s : at + 0.03, 1.6, alongX ? at + 0.03 : s);
        if (!alongX) banner.rotation.y = Math.PI / 2;
        group.add(banner);
      }
      const thick = 0.3;
      bodies.push(staticBody(physics, alongX ? [len, FENCE_H + 1, thick] : [thick, FENCE_H + 1, len], [alongX ? mid : at, (FENCE_H + 1) / 2, alongX ? at : mid]));
    }
    const postMesh = new THREE.InstancedMesh(postGeo, postMat, posts.length);
    posts.forEach(([x, z], i) => postMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, (FENCE_H + 0.1) / 2, z)));
    postMesh.castShadow = true;
    group.add(postMesh);
    scene.add(group);
    fences.push({ between: border.between, group, bodies, added: false });
  }

  // ---- Gates ----
  const stripes = stripeTexture();
  const armMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5 });
  const concrete = kit.mat(0xb9b5ad);
  const booth = kit.mat(0xf1efe9);
  const boothRoof = kit.mat(0x2d6cdf);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9cc7e6, roughness: 0.15, metalness: 0.3 });
  const gates = GATES.map((def) => {
    const target = getZone(def.leadsTo);
    // Unit vectors: `a` runs along the fence (across the road), `out` points away from leadsTo.
    const a = def.across === 'x' ? { x: 1, z: 0 } : { x: 0, z: 1 };
    const cx = (target.rect.minX + target.rect.maxX) / 2, cz = (target.rect.minZ + target.rect.maxZ) / 2;
    const out = def.across === 'x' ? { x: 0, z: Math.sign(def.z - cz) || 1 } : { x: Math.sign(def.x - cx) || 1, z: 0 };
    const P = (along, outward, y = 0) => new THREE.Vector3(def.x + a.x * along + out.x * outward, y, def.z + a.z * along + out.z * outward);
    const group = new THREE.Group();
    const yawA = Math.atan2(a.z, a.x) * -1; // rotation.y that maps local +X to `a`

    // Concrete bases at each side of the gap
    for (const s of [-1, 1]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.8), concrete);
      base.position.copy(P(s * (GATE_HALF - 0.2), 0, 0.55));
      base.castShadow = true;
      group.add(base);
    }
    // Boom arm: pivot on one side, lifts when open.
    const pivot = new THREE.Group();
    pivot.position.copy(P(-(GATE_HALF - 0.2), 0, 1.15));
    pivot.rotation.y = yawA;
    const lift = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(GATE_HALF * 2 - 0.4, 0.14, 0.14), armMat);
    arm.position.x = GATE_HALF - 0.2;
    arm.castShadow = true;
    lift.add(arm);
    pivot.add(lift);
    group.add(pivot);
    // Guard booth
    const boothPos = P(-(GATE_HALF + 1.6), 1.2);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 1.8), booth);
    b.position.set(boothPos.x, 1.2, boothPos.z);
    b.castShadow = b.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 2.2), boothRoof);
    roof.position.set(boothPos.x, 2.5, boothPos.z);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.8, 1.84), glass);
    win.position.set(boothPos.x, 1.6, boothPos.z);
    group.add(b, roof, win);
    kit.staticBox([1.8, 2.4, 1.8], [boothPos.x, 1.2, boothPos.z]);
    kit.obstacles.push({ x: boothPos.x, z: boothPos.z, r: 2 });

    // Billboard on the far side of the road, facing approaching players.
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 640;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const bbPos = P(GATE_HALF + 4.2, 1.2);
    const bb = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4), new THREE.MeshBasicMaterial({ map: texture }));
    face.position.set(0, 4.2, 0.06);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(6.6, 4.2, 0.1), kit.mat(0x2a3442));
    rear.position.set(0, 4.2, 0);
    rear.castShadow = true;
    bb.add(face, rear);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6.3), kit.mat(0x5d636a, { metalness: 0.5 }));
      post.position.set(s * 2.4, 3.15, -0.12);
      post.castShadow = true;
      bb.add(post);
    }
    bb.position.copy(bbPos);
    bb.rotation.y = Math.atan2(out.x, out.z);
    group.add(bb);
    kit.obstacles.push({ x: bbPos.x, z: bbPos.z, r: 3.5 });
    scene.add(group);

    const barrier = staticBody(physics, def.across === 'x' ? [GATE_HALF * 2, 3, 0.4] : [0.4, 3, GATE_HALF * 2], [def.x, 1.5, def.z]);
    return { ...def, group, lift, canvas, texture, body: barrier, added: false, open: false, liftAngle: 0, out };
  });

  return { fences, gates };
}
