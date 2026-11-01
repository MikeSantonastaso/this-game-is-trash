// Thousands of individual grass blades as chunked InstancedMeshes, swaying in
// the wind. Chunks let the renderer frustum-cull what's behind you.
//
// patches: [{ region: {minX,maxX,minZ,maxZ}, density (blades/m²), height: [min,max], accept(x,z) }]
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CHUNK = 12;

// One instance = a tuft of a few blades, so we get dense-looking grass with
// fewer instances.
function tuftGeometry(blades = 4) {
  const parts = [];
  for (let b = 0; b < blades; b++) {
    const g = new THREE.PlaneGeometry(0.035, 1, 1, 2);
    g.translate(0, 0.5, 0);
    const pos = g.attributes.position;
    const lean = (Math.random() - 0.5) * 0.25;
    const hs = 0.7 + Math.random() * 0.45;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setX(i, pos.getX(i) * (1 - y * 0.9) + lean * y);
      pos.setY(i, y * hs);
      pos.setZ(i, y * y * 0.1);
    }
    g.rotateY((b / blades) * Math.PI + Math.random() * 0.6);
    g.translate((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.12);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); // light like the ground underneath
  return g;
}

function grassMaterial(time) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vBladeH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float bh = clamp(position.y, 0.0, 1.0);
        vBladeH = bh;
        vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        float gust = sin(uTime * 0.9 + ip.x * 0.06 + ip.y * 0.04) * 0.5 + 0.5;
        float sway = sin(uTime * 2.2 + ip.x * 0.7 + ip.y * 0.5) * (0.4 + gust * 0.8);
        transformed.x += sway * bh * bh * 0.25;
        transformed.z += (gust * 0.6 + sway * 0.3) * bh * bh * 0.2;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBladeH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.42, 1.08, vBladeH);');
  };
  return m;
}

export function createGrassField(patches, { time, densityScale = 1, rng = Math.random } = {}) {
  const group = new THREE.Group();
  const geo = tuftGeometry();
  const mat = grassMaterial(time);
  const chunks = new Map();
  const base = [new THREE.Color(0x5e8f2c), new THREE.Color(0x77a83a), new THREE.Color(0x8db446), new THREE.Color(0x6b9a30), new THREE.Color(0x9fae4c)];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  for (const patch of patches) {
    const { region, density, height, accept } = patch;
    const area = (region.maxX - region.minX) * (region.maxZ - region.minZ);
    const count = Math.round(area * density * densityScale);
    for (let i = 0; i < count; i++) {
      const x = region.minX + rng() * (region.maxX - region.minX);
      const z = region.minZ + rng() * (region.maxZ - region.minZ);
      if (accept && !accept(x, z)) continue;
      const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
      let c = chunks.get(key);
      if (!c) chunks.set(key, (c = []));
      const h = height[0] + rng() * (height[1] - height[0]);
      p.set(x, 0, z);
      q.setFromAxisAngle(UP, rng() * Math.PI * 2);
      s.set(0.8 + rng() * 0.5, h, 0.8 + rng() * 0.5);
      const col = base[Math.floor(rng() * base.length)].clone().multiplyScalar(0.85 + rng() * 0.3);
      c.push([m.compose(p, q, s).clone(), col]);
    }
  }

  for (const list of chunks.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([matrix, color], i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color); });
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  group.userData.blades = [...chunks.values()].reduce((n, l) => n + l.length, 0);
  return group;
}
