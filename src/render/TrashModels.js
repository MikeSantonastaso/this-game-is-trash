// Procedural trash models: printed soda cans (some crushed), clear plastic
// bottles with labels, coffee cups with sleeves and lids, crumpled foil
// wrappers, greasy pizza boxes and old tires. Each type has a few variants so
// the ground doesn't look copy-pasted. Sizes match data/trash.js, which the
// physics bodies are built from.
import * as THREE from 'three';
import { TRASH_TYPES } from '../data/trash.js';

const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// Revolve a profile of [radius, y] points around Y.
const lathe = (pts, segments = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segments);

function canLabel(bg, fg, text) {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, w, h); // aluminium ends
    g.fillStyle = bg; g.fillRect(0, h * 0.1, w, h * 0.76);
    g.fillStyle = fg; g.font = 'bold 44px sans-serif'; g.textBaseline = 'middle';
    g.fillText(text, 16, h * 0.5); g.fillText(text, 16 + w / 2, h * 0.5);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, h * 0.2, w, 6);
  });
}

function makeCan(def) {
  const r = def.mesh.radiusTop, h = def.mesh.height, y0 = -h / 2;
  const geo = lathe([[0, y0], [r * 0.8, y0], [r, y0 + h * 0.06], [r, y0 + h * 0.86], [r * 0.82, y0 + h * 0.97], [r * 0.82, y0 + h], [0, y0 + h]]);
  const brands = [['#d62f2f', '#ffffff', 'FIZZ'], ['#1f5fbf', '#ffd23f', 'ZAP!'], ['#2f9e44', '#ffffff', 'GLUG'], ['#f2a516', '#1b1b1b', 'BUBBLR'], ['#222', '#e94560', 'VOLT']];
  return brands.flatMap(([bg, fg, text], i) => {
    const mat = new THREE.MeshStandardMaterial({ map: canLabel(bg, fg, text), metalness: 0.6, roughness: 0.35 });
    const intact = new THREE.Mesh(geo, mat);
    const crushed = new THREE.Mesh(geo, mat);
    crushed.scale.set(1.15, 0.55 + (i % 3) * 0.1, 0.8);
    crushed.rotation.z = 0.15;
    return [intact, crushed];
  });
}

function makeBottle(def) {
  const rb = def.mesh.radiusBottom, h = def.mesh.height, y0 = -h / 2;
  const prof = [[0, y0], [rb * 0.9, y0], [rb, y0 + 0.02], [rb, y0 + h * 0.6], [rb * 0.6, y0 + h * 0.78], [rb * 0.36, y0 + h * 0.86], [rb * 0.36, y0 + h * 0.95]];
  const geo = lathe(prof, 20);
  const labelGeo = new THREE.CylinderGeometry(rb * 1.01, rb * 1.01, h * 0.22, 20, 1, true);
  labelGeo.translate(0, y0 + h * 0.35, 0);
  const capGeo = new THREE.CylinderGeometry(rb * 0.4, rb * 0.4, h * 0.06, 14);
  capGeo.translate(0, y0 + h * 0.97, 0);
  const tints = [[0xbfe6ff, '#2d6cdf', 0x2d6cdf], [0xc8f2d0, '#2f9e44', 0xf2f2f2], [0xe8f6ff, '#e94560', 0xe94560]];
  return tints.map(([glass, label, cap]) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: glass, transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0, envMapIntensity: 1.5, depthWrite: false })));
    const lab = canvasTex(128, 32, (c, w, hh) => { c.fillStyle = label; c.fillRect(0, 0, w, hh); c.fillStyle = '#fff'; c.font = 'bold 18px sans-serif'; c.fillText('AQUA', 8, 23); c.fillText('AQUA', 72, 23); });
    g.add(new THREE.Mesh(labelGeo, new THREE.MeshStandardMaterial({ map: lab, roughness: 0.6, side: THREE.DoubleSide })));
    g.add(new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: cap, roughness: 0.5 })));
    return g;
  });
}

function makeCup(def) {
  const { radiusTop: rt, radiusBottom: rb, height: h } = def.mesh, y0 = -h / 2;
  const geo = lathe([[0, y0], [rb, y0], [rt, y0 + h * 0.92], [rt * 1.04, y0 + h * 0.95], [0, y0 + h * 0.95]], 22);
  const paper = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.8 });
  const sleeveGeo = new THREE.CylinderGeometry(rb + (rt - rb) * 0.62, rb + (rt - rb) * 0.25, h * 0.34, 22, 1, true);
  sleeveGeo.translate(0, y0 + h * 0.42, 0);
  const lidGeo = new THREE.CylinderGeometry(rt * 0.95, rt * 1.06, h * 0.08, 22);
  lidGeo.translate(0, y0 + h * 0.99, 0);
  return ['#7b4a2a', '#2f6b3a', '#c0392b'].map((col) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, paper));
    const sl = canvasTex(128, 32, (c, w, hh) => { c.fillStyle = col; c.fillRect(0, 0, w, hh); c.fillStyle = '#f4efe6'; c.font = 'bold 16px sans-serif'; c.fillText("JOE'S", 10, 22); c.fillText("JOE'S", 74, 22); });
    g.add(new THREE.Mesh(sleeveGeo, new THREE.MeshStandardMaterial({ map: sl, roughness: 0.9, side: THREE.DoubleSide })));
    g.add(new THREE.Mesh(lidGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 })));
    return g;
  });
}

function makeWrapper(def) {
  const [sx, sy, sz] = def.mesh.size;
  const colors = [['#f2c94c', '#eb5757'], ['#bb6bd9', '#f2f2f2'], ['#27ae60', '#f2c94c'], ['#e74c3c', '#ffffff']];
  return colors.map(([a, b], i) => {
    const geo = new THREE.IcosahedronGeometry(0.5, 2);
    const pos = geo.attributes.position;
    let seed = i * 97 + 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < pos.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, k);
      v.multiplyScalar(0.75 + rnd() * 0.45);
      pos.setXYZ(k, v.x * sx, v.y * sy * 1.6, v.z * sz);
    }
    geo.computeVertexNormals();
    const tex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = a; c.fillRect(0, 0, w, h); c.fillStyle = b; for (let s = 0; s < 4; s++) c.fillRect(0, s * 16 + 4, w, 5); });
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, metalness: 0.55, roughness: 0.3, flatShading: true }));
  });
}

function makePizzaBox(def) {
  const [sx, sy, sz] = def.mesh.size;
  const top = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c8a165'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(120,70,20,0.35)';
    for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 22, 0, 7); g.fill(); }
    g.strokeStyle = '#b33a3a'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h / 2, 70, 0, 7); g.stroke();
    g.fillStyle = '#b33a3a'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('PIZZA', w / 2, h / 2 - 8); g.font = 'bold 20px sans-serif'; g.fillText('HOT & FRESH', w / 2, h / 2 + 28);
  });
  const card = new THREE.MeshStandardMaterial({ color: 0xc09a60, roughness: 0.95 });
  const topMat = new THREE.MeshStandardMaterial({ map: top, roughness: 0.95 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), [card, card, topMat, card, card, card]);
  const open = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(sx, sy * 0.6, sz), [card, card, new THREE.MeshStandardMaterial({ color: 0xd9b98a, roughness: 0.9 }), card, card, card]);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.012, sz), [card, card, topMat, card, card, card]);
  lid.geometry.translate(0, 0, -sz / 2);
  lid.position.set(0, sy * 0.3, sz / 2);
  lid.rotation.x = -1.9;
  const crust = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 12, 2), new THREE.MeshStandardMaterial({ color: 0xd9a35a }));
  crust.rotation.x = -Math.PI / 2;
  crust.position.set(0.08, sy * 0.32, 0.05);
  open.add(base, lid, crust);
  return [box, box, open];
}

function makeTire(def) {
  const { radius, tube } = def.mesh;
  const geo = new THREE.TorusGeometry(radius, tube, 10, 28);
  geo.rotateX(Math.PI / 2);
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.95 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, rubber));
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const tread = new THREE.Mesh(new THREE.BoxGeometry(0.05, tube * 1.7, 0.04), rubber);
    tread.position.set(Math.cos(a) * (radius + tube * 0.9), 0, Math.sin(a) * (radius + tube * 0.9));
    tread.rotation.y = -a;
    g.add(tread);
  }
  return [g];
}

const MAKERS = { can: makeCan, bottle: makeBottle, cup: makeCup, wrapper: makeWrapper, pizzaBox: makePizzaBox, tire: makeTire };

export function createTrashVisuals() {
  const out = {};
  for (const def of Object.values(TRASH_TYPES)) {
    const variants = (MAKERS[def.id] ?? (() => []))(def);
    variants.forEach((v) => v.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }));
    out[def.id] = variants;
  }
  return out;
}
