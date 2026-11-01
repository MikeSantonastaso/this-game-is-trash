// First-person hands and the picker tool, parented to the camera.
// Right hand holds the picker angled down at the ground; it jabs and the claw
// snaps shut on each pick. Left hand reaches out while you're holding something.
import * as THREE from 'three';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

function capsule(radius, length, material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), material);
  m.castShadow = false;
  return m;
}

export class Viewmodel {
  constructor(camera) {
    this.root = new THREE.Group();
    camera.add(this.root);

    const sleeve = mat(0x5a5a3c);     // work-shirt olive, matches the Worker model
    const glove = mat(0xe8b322);      // yellow work gloves
    const vest = mat(0xff7a1a, { emissive: 0x331100 });

    // ---- Right arm + picker ----
    this.right = new THREE.Group();
    this.right.position.set(0.24, -0.26, -0.5);
    this.root.add(this.right);

    const forearm = capsule(0.055, 0.32, sleeve);
    forearm.rotation.x = Math.PI / 2 - 0.5;
    forearm.position.set(0.04, -0.1, 0.22);
    const cuff = capsule(0.05, 0.03, vest);
    cuff.rotation.copy(forearm.rotation);
    cuff.position.set(0.03, -0.035, 0.07);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.09), glove);
    this.right.add(forearm, cuff, hand);

    // Picker: grip with trigger, long shaft angled toward the ground, two jaws.
    this.tool = new THREE.Group();
    this.tool.rotation.x = 1.15;
    this.right.add(this.tool);
    this.grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.05), mat(0x222222));
    this.grip.position.set(0, 0.02, 0);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.03), mat(0xd64545));
    trigger.position.set(0, 0.0, 0.04);
    this.shaftMat = mat(0x9aa0a6, { metalness: 0.6, roughness: 0.35 });
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 8), this.shaftMat);
    this.jaws = new THREE.Group();
    const jawMat = mat(0x333333);
    this.jawL = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.12, 0.035), jawMat);
    this.jawR = this.jawL.clone();
    this.jawL.position.set(-0.035, -0.05, 0);
    this.jawR.position.set(0.035, -0.05, 0);
    const cup = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.03), jawMat);
    cup.position.set(-0.035, -0.11, 0);
    const cup2 = cup.clone();
    cup2.position.x = 0.035;
    this.jawL.add(cup); cup.position.set(0, -0.06, 0);
    this.jawR.add(cup2); cup2.position.set(0, -0.06, 0);
    this.jaws.add(this.jawL, this.jawR);
    this.tool.add(this.grip, trigger, this.shaft, this.jaws);
    this.setToolLength(1);

    // ---- Left arm (only while holding something) ----
    this.left = new THREE.Group();
    this.left.position.set(-0.3, -0.32, -0.62);
    const lForearm = capsule(0.045, 0.3, sleeve);
    lForearm.rotation.x = Math.PI / 2 - 0.25;
    lForearm.position.set(-0.02, -0.05, 0.19);
    const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.09), glove);
    this.left.add(lForearm, lHand);
    this.left.visible = false;
    this.root.add(this.left);

    this.clackT = 0;
    this.swayT = 0;
    this.holdT = 0;
    this.jawTip = new THREE.Object3D();
    this.jaws.add(this.jawTip);
    this.jawTip.position.y = -0.12;
  }

  setTool(tool) {
    this.shaftMat.color.setHex(tool.color);
    this.setToolLength(0.75 + tool.reach * 0.12);
  }

  setToolLength(len) {
    this.shaft.scale.y = len;
    this.shaft.position.y = -len / 2 - 0.06;
    this.jaws.position.y = -len - 0.06;
  }

  clack() { this.clackT = 1; }

  tipWorldPosition(out = new THREE.Vector3()) { return this.jawTip.getWorldPosition(out); }

  update(dt, { speed = 0, grounded = true, holding = false, visible = true }) {
    this.root.visible = visible;
    if (!visible) return;
    this.swayT += dt * (grounded ? speed : 0) * 1.9;
    const amp = Math.min(speed / 5, 1);
    this.root.position.set(Math.cos(this.swayT) * 0.012 * amp, Math.abs(Math.sin(this.swayT)) * -0.018 * amp, 0);

    this.clackT = Math.max(0, this.clackT - dt * 5);
    const jab = Math.sin(this.clackT * Math.PI);
    this.right.position.z = -0.5 - jab * 0.12;
    this.tool.rotation.x = 1.15 + jab * 0.12;
    const open = 0.35 * (1 - jab);
    this.jawL.rotation.z = -open;
    this.jawR.rotation.z = open;

    this.holdT += ((holding ? 1 : 0) - this.holdT) * Math.min(1, dt * 12);
    this.left.visible = this.holdT > 0.02;
    this.left.position.y = -0.6 + this.holdT * 0.32;
    // Tuck the picker down a bit while carrying something.
    this.right.position.y = -0.26 - this.holdT * 0.14;
  }
}
