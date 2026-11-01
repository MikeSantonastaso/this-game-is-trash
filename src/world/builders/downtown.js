// Downtown: a skyline behind the last fence. Not walkable yet; it exists so
// the end goal is on the horizon from the very first minute.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getZone, onRoad } from '../../data/zones.js';

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d4cc'; g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const lit = Math.random() < 0.18;
      g.fillStyle = lit ? '#f6e3a1' : `hsl(210, 30%, ${18 + Math.random() * 14}%)`;
      g.fillRect(col * 64 + 10, row * 64 + 12, 44, 40);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const PALETTE = [0xc9c3b8, 0xa9b4c2, 0xd8c7a8, 0x9fa8a3, 0xb7a59a, 0xe0dcd4, 0x8f9bb0];

export function buildDowntown(kit, { scene }) {
  const rect = getZone('downtown').rect;
  const geos = [];
  const color = new THREE.Color();
  for (let x = rect.minX + 10; x < rect.maxX - 8; x += kit.rand(20, 28)) {
    for (let z = rect.minZ + 12; z < rect.maxZ - 8; z += kit.rand(20, 28)) {
      const w = kit.rand(12, 19), d = kit.rand(12, 19);
      if (onRoad(x, z, Math.max(w, d) / 2 + 1)) continue;
      // Taller toward the middle of downtown.
      const centrality = 1 - Math.min(1, Math.abs(x - 80) / 260);
      const h = kit.rand(14, 30) + centrality * kit.rand(10, 60);
      const g = new THREE.BoxGeometry(w, h, d);
      // Windows tile every 16 m across and 14 m up; roofs map to plain wall color.
      const uv = g.attributes.uv, n = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const ny = Math.abs(n.getY(i)) > 0.5;
        if (ny) { uv.setXY(i, 0.01, 0.01); continue; }
        const across = Math.abs(n.getX(i)) > 0.5 ? d : w;
        uv.setXY(i, uv.getX(i) * across / 16, uv.getY(i) * h / 14);
      }
      g.translate(x, h / 2, z);
      color.setHex(kit.pick(PALETTE));
      const cols = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < cols.length; i += 3) { cols[i] = color.r; cols[i + 1] = color.g; cols[i + 2] = color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geos.push(g);
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: windowTexture(), vertexColors: true, roughness: 0.7, metalness: 0.1 }));
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { buildings: geos.length };
}
