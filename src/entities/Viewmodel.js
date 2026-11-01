// First-person hands and the picker tool, parented to the camera.
// Right hand grips a reacher-grabber: pistol grip with an orange trigger, an
// aluminium shaft angled toward the ground, and rubber-tipped jaws that snap
// shut on each pick. The left hand reaches out while you're carrying something.
// All built from primitives so tool tiers can recolor/resize it from data.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
const MAT = {
  glove: std(0xd9921c, { roughness: 0.9 }),
  gloveDark: std(0x8a5a14, { roughness: 0.95 }),
  sleeve: std(0x2c3b4d, { roughness: 0.9 }),
  reflect: std(0x9aa3ab, { roughness: 0.4 }),
  rubber: std(0x1d1f22, { roughness: 0.95 }),
  plasticOrange: std(0xf26b1d, { roughness: 0.45 }),
  plasticDark: std(0x2b2e33, { roughness: 0.5 }),
  rubberGrey: std(0x5d6168, { roughness: 0.9 }),
};

const rbox = (w, h, d, r, mat) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  return m;
};
const cyl = (rt, rb, h, mat, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
const capsule = (r, len, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat);

// A gloved hand. closed = wrapped around a vertical grip; open = reaching.
function buildHand({ closed = true, mirror = 1 } = {}) {
  const hand = new THREE.Group();
  const palm = rbox(0.085, 0.095, 0.045, 0.018, MAT.glove);
  hand.add(palm);
  // Four fingers.
  for (let i = 0; i < 4; i++) {
    const f = capsule(0.0125, closed ? 0.035 : 0.05, i % 2 ? MAT.glove : MAT.gloveDark);
    const y = 0.033 - i * 0.022;
    if (closed) {
      f.rotation.z = Math.PI / 2;
      f.position.set(-0.012 * mirror, y, -0.035);
    } else {
      f.rotation.x = Math.PI / 2;
      f.position.set((0.03 - i * 0.02) * mirror, 0.0, -0.06);
    }
    hand.add(f);
  }
  const thumb = capsule(0.014, 0.035, MAT.glove);
  thumb.rotation.set(closed ? 0.6 : 1.2, 0, -0.7 * mirror);
  thumb.position.set(0.045 * mirror, 0.03, -0.02);
  hand.add(thumb);
  // Cuff, sleeve and a reflective hi-vis band.
  const cuff = cyl(0.045, 0.048, 0.05, MAT.gloveDark);
  cuff.rotation.x = Math.PI / 2 - 0.3;
  cuff.position.set(0, -0.025, 0.045);
  const sleeve = cyl(0.05, 0.058, 0.3, MAT.sleeve);
  sleeve.rotation.x = Math.PI / 2 - 0.3;
  sleeve.position.set(0, -0.07, 0.2);
  const band = cyl(0.052, 0.052, 0.025, MAT.reflect);
  band.rotation.copy(sleeve.rotation);
  band.position.set(0, -0.05, 0.13);
  hand.add(cuff, sleeve, band);
  hand.traverse((o) => { o.castShadow = false; });
  return hand;
}

function buildPicker() {
  const tool = new THREE.Group();
  // Pistol grip (in the hand, pointing down from the shaft)
  const grip = rbox(0.032, 0.12, 0.04, 0.012, MAT.rubber);
  grip.position.set(0, -0.06, 0.012);
  grip.rotation.x = -0.25;
  for (let i = 0; i < 4; i++) {
    const ridge = rbox(0.034, 0.008, 0.042, 0.003, MAT.plasticDark);
    ridge.position.set(0, 0.03 - i * 0.025, 0);
    grip.add(ridge);
  }
  const housing = rbox(0.045, 0.05, 0.13, 0.015, MAT.plasticOrange);
  housing.position.set(0, 0.0, -0.03);
  const trigger = rbox(0.016, 0.055, 0.022, 0.006, MAT.plasticOrange);
  trigger.position.set(0, -0.045, -0.05);
  trigger.rotation.x = 0.3;
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 16, Math.PI), MAT.plasticDark);
  guard.rotation.set(0, Math.PI / 2, Math.PI / 2);
  guard.position.set(0, -0.03, -0.045);
  tool.add(grip, housing, trigger, guard);

  // Shaft along -Z
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xc7ccd2, metalness: 0.9, roughness: 0.32 });
  const shaft = cyl(0.011, 0.011, 1, shaftMat, 12);
  shaft.rotation.x = Math.PI / 2;
  const collar = cyl(0.017, 0.017, 0.03, MAT.plasticDark);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = -0.1;
  tool.add(shaft, collar);

  // Jaw head
  const head = new THREE.Group();
  const block = rbox(0.04, 0.03, 0.06, 0.01, MAT.plasticDark);
  head.add(block);
  const jaws = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.015, 0, -0.02);
    const arm = rbox(0.012, 0.022, 0.11, 0.005, MAT.plasticDark);
    arm.position.set(0, 0, -0.055);
    const pad = cyl(0.022, 0.022, 0.012, MAT.rubberGrey, 14);
    pad.rotation.z = Math.PI / 2;
    pad.position.set(-side * 0.008, 0, -0.105);
    pivot.add(arm, pad);
    head.add(pivot);
    jaws.push({ pivot, side });
  }
  const tip = new THREE.Object3D();
  tip.position.set(0, 0, -0.11);
  head.add(tip);
  head.scale.setScalar(1.6);
  tool.add(head);

  tool.traverse((o) => { o.castShadow = false; });
  return { tool, shaft, shaftMat, collar, head, jaws, tip };
}

export class Viewmodel {
  constructor(camera) {
    this.root = new THREE.Group();
    camera.add(this.root);

    // ---- Right hand + picker ----
    this.right = new THREE.Group();
    this.root.add(this.right);
    this.picker = buildPicker();
    this.aim = new THREE.Group(); // tilts the whole tool toward the ground
    this.aim.rotation.set(-0.5, 0.16, 0);
    this.aim.add(this.picker.tool);
    const hand = buildHand({ closed: true, mirror: 1 });
    hand.position.set(0.004, -0.06, 0.02);
    hand.rotation.x = -0.25;
    this.picker.tool.add(hand);
    this.right.add(this.aim);
    this.setToolLength(1);

    // ---- Left hand (only while holding something) ----
    this.left = buildHand({ closed: false, mirror: -1 });
    this.left.visible = false;
    this.root.add(this.left);

    // ---- Left hand holding your trash bag (fills up as you pick) ----
    this.bagHand = new THREE.Group();
    const bagHandMesh = buildHand({ closed: true, mirror: -1 });
    bagHandMesh.rotation.set(0.2, 0, 0.1);
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x1d1e22, roughness: 0.3, metalness: 0.15 });
    const bagGeo = new THREE.SphereGeometry(0.14, 16, 12);
    bagGeo.scale(1, 1.25, 1);
    // Squash the top into a gathered neck.
    const pos = bagGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0.05) { const k = 1 - (y - 0.05) * 3.2; pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
    }
    bagGeo.computeVertexNormals();
    this.bag = new THREE.Mesh(bagGeo, bagMat);
    this.bag.position.set(0, -0.2, 0);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.08, 8), bagMat);
    neck.position.set(0, -0.06, 0);
    this.bagHand.add(bagHandMesh, this.bag, neck);
    this.bagHand.traverse((o) => { o.castShadow = false; });
    this.root.add(this.bagHand);
    this.bagFill = 0;
    this.bagPulse = 0;
    this.punchT = 0;

    this.clackT = 0;
    this.swayT = 0;
    this.holdT = 0;
    this.lookLag = new THREE.Vector2();
  }

  setTool(tool) {
    this.picker.shaftMat.color.setHex(tool.color).lerp(new THREE.Color(0xc7ccd2), 0.45);
    this.setToolLength(0.75 + tool.reach * 0.12);
  }

  setToolLength(len) {
    const p = this.picker;
    p.shaft.scale.y = len;
    p.shaft.position.z = -0.08 - len / 2;
    p.head.position.z = -0.08 - len - 0.02;
  }

  clack() { this.clackT = 1; }
  punch() { this.punchT = 1; }
  pulseBag() { this.bagPulse = 1; }
  bagWorldPosition(out = new THREE.Vector3()) { return this.bag.getWorldPosition(out); }

  tipWorldPosition(out = new THREE.Vector3()) { return this.picker.tip.getWorldPosition(out); }

  update(dt, { speed = 0, grounded = true, holding = false, visible = true, fill = 0, drunk = 0 }) {
    this.root.visible = visible;
    if (!visible) return;
    // Bag: grows with fill, wobbles when something goes in.
    this.bagFill += (Math.min(1, fill) - this.bagFill) * Math.min(1, dt * 10);
    this.bagPulse = Math.max(0, this.bagPulse - dt * 4);
    const wob = Math.sin(this.bagPulse * Math.PI * 3) * this.bagPulse * 0.15;
    const bs = 0.55 + this.bagFill * 0.75;
    this.bag.scale.set(bs * (1 + wob), bs * (1 - wob), bs * (1 + wob));
    this.bag.position.y = -0.12 - bs * 0.16;
    this.punchT = Math.max(0, this.punchT - dt * 5);
    const punch = Math.sin(this.punchT * Math.PI);
    this.swayT += dt * (grounded ? speed : 0) * 1.8;
    const amp = Math.min(speed / 5, 1);
    this.root.position.set(Math.cos(this.swayT) * 0.01 * amp, -Math.abs(Math.sin(this.swayT)) * 0.014 * amp, 0);

    this.clackT = Math.max(0, this.clackT - dt * 5);
    const jab = Math.sin(this.clackT * Math.PI);
    this.holdT += ((holding ? 1 : 0) - this.holdT) * Math.min(1, dt * 12);

    this.right.position.set(0.17 - punch * 0.12, -0.15 - this.holdT * 0.12 + punch * 0.08, -0.34 - jab * 0.1 - punch * 0.28);
    this.aim.rotation.x = -0.5 - jab * 0.12 - this.holdT * 0.3;
    const open = 0.32 * (1 - jab);
    for (const { pivot, side } of this.picker.jaws) pivot.rotation.y = -side * open;

    this.left.visible = this.holdT > 0.02;
    this.bagHand.visible = this.holdT < 0.9;
    const bob = Math.sin(this.swayT * 0.5) * 0.01 * amp + Math.sin(performance.now() / 600) * 0.01 * drunk;
    this.bagHand.position.set(-0.26, -0.3 - this.holdT * 0.3 + bob, -0.44);
    this.bagHand.rotation.set(0.1, 0.25, 0.15 + wob * 0.5);
    this.left.position.set(-0.24, -0.42 + this.holdT * 0.22, -0.42);
    this.left.rotation.set(0.25, 0, 0.2);
  }
}
