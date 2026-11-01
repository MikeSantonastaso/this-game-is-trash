// Shared helpers for world builders: deterministic randomness, static
// colliders, model placement, batched flat ground pieces (one draw call per
// material for every road, sidewalk and driveway), and chunked instancing so
// hundreds of houses and trees stay cheap and still frustum-cull.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';
import { planarUV } from '../render/Surfaces.js';

export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UP = new THREE.Vector3(0, 1, 0);
const CHUNK = 110;

export function createKit(ctx, seed = 1337) {
  const { scene, physics, assets } = ctx;
  const lod = ctx.lod ?? [];
  const rng = mulberry32(seed);
  const flats = new Map(); // material -> geometries
  const obstacles = []; // { x, z, r } circles trash should not spawn inside

  const kit = {
    rng,
    obstacles,
    lod,
    rand: (a, b) => a + rng() * (b - a),
    pick: (arr) => arr[Math.floor(rng() * arr.length)],
    chance: (p) => rng() < p,
    mat: (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra }),

    placement(x, y, z, rotY, s = 1) {
      const q = new THREE.Quaternion().setFromAxisAngle(UP, rotY);
      return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
    },

    staticBox(size, pos, rotY = 0, group = GROUP.PROP, add = true) {
      const body = new CANNON.Body({ mass: 0, material: physics.materials.ground, collisionFilterGroup: group, collisionFilterMask: MASK_ALL });
      body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
      body.position.set(pos[0], pos[1], pos[2]);
      body.quaternion.setFromEuler(0, rotY, 0);
      if (add) physics.add(body);
      return body;
    },

    staticCylinder(radius, height, x, z) {
      const body = new CANNON.Body({ mass: 0, material: physics.materials.ground, collisionFilterGroup: GROUP.PROP, collisionFilterMask: MASK_ALL });
      body.addShape(new CANNON.Cylinder(radius, radius, height, 8));
      body.position.set(x, height / 2, z);
      physics.add(body);
      return body;
    },

    place(id, x, z, rotY = 0, y = 0) {
      const m = assets.instance(id);
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      scene.add(m);
      return m;
    },

    tintModel(model, tint, amount = 0.18) {
      model.traverse((o) => {
        if (o.isMesh && o.material) {
          const one = (m) => { const c = m.clone(); c.color.lerp(new THREE.Color(tint), amount); return c; };
          o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
        }
      });
    },

    // Flat ground piece (w along X, d along Z before rotation). Batched: call flush() at the end.
    flat(w, d, x, z, material, y = 0.01, tile = 4, rotY = 0) {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      if (rotY) g.rotateY(rotY);
      g.translate(x, y, z);
      kit.addFlat(g, material, tile);
    },

    disc(rInner, rOuter, x, z, material, y = 0.01, tile = 4) {
      const g = rInner > 0 ? new THREE.RingGeometry(rInner, rOuter, 40) : new THREE.CircleGeometry(rOuter, 40);
      g.rotateX(-Math.PI / 2);
      g.translate(x, y, z);
      kit.addFlat(g, material, tile);
    },

    addFlat(g, material, tile) {
      if (material.map) planarUV(g, tile);
      else if (!g.attributes.uv) planarUV(g, 1);
      if (!flats.has(material)) flats.set(material, []);
      flats.get(material).push(g.index ? g.toNonIndexed() : g);
    },

    flush() {
      for (const [material, geos] of flats) {
        const mesh = new THREE.Mesh(mergeGeometries(geos), material);
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
      flats.clear();
    },

    // matrices: Matrix4[] each tagged with .id (model id) and optionally .color (THREE.Color).
    // Grouped by model and by map chunk so off-screen chunks are frustum culled,
    // and chunks farther than `far` meters are hidden (see Game.updateLod).
    instanced(list, { castShadow = true, far = 260 } = {}) {
      const groups = new Map();
      for (const m of list) {
        const key = `${m.id}|${Math.floor(m.elements[12] / CHUNK)}|${Math.floor(m.elements[14] / CHUNK)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(m);
      }
      for (const mats of groups.values()) {
        const group = assets.instanced(mats[0].id, mats, { castShadow });
        scene.add(group);
        const c = new THREE.Vector3();
        for (const m of mats) { c.x += m.elements[12]; c.z += m.elements[14]; }
        c.divideScalar(mats.length);
        lod.push({ object: group, center: c, far: far + CHUNK * 0.5 });
      }
    },

    blocked: (x, z, pad = 0) => obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + pad),
  };
  return kit;
}
