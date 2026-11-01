// How other players look: their rigged character with a cheap procedural
// animation (arms down from the T-pose, legs and arms swinging with speed,
// right arm up while carrying something, a jab when punching, a drunken sway),
// a picker in the right hand, a trash bag in the left that grows as it fills,
// tied bags on the belt, and a name tag.
//
// No animation clips needed, so any Quaternius-rigged character works.
import * as THREE from 'three';
import { nameTag } from '../ui/nameTag.js';

const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _a = new THREE.Quaternion();

export class Avatar {
  constructor(game, { id, name, model, color = '#ffd23f' }) {
    this.game = game;
    this.id = id;
    this.root = new THREE.Group();
    this.model = game.assets.instance(model);
    this.model.rotation.y = Math.PI; // model faces +Z, our yaw 0 faces -Z
    this.root.add(this.model);
    game.scene.add(this.root);

    const bones = {};
    this.model.updateMatrixWorld(true);
    this.model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    this.bones = bones;
    // Model-space rest rotation of each animated bone's parent, so we can
    // rotate bones about model-space axes whatever the rig's local axes are.
    const inv = new THREE.Quaternion().copy(this.model.getWorldQuaternion(new THREE.Quaternion())).invert();
    this.rig = {};
    for (const name of ['UpperArmL', 'UpperArmR', 'UpperLegL', 'UpperLegR', 'LowerArmR', 'LowerArmL', 'LowerLegL', 'LowerLegR', 'Torso', 'Neck']) {
      const b = bones[name];
      if (!b) continue;
      const parentQ = inv.clone().multiply(b.parent.getWorldQuaternion(new THREE.Quaternion()));
      this.rig[name] = { bone: b, rest: b.quaternion.clone(), parentQ, parentInv: parentQ.clone().invert() };
    }

    // Picker in the right hand
    const stick = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 8), new THREE.MeshStandardMaterial({ color: 0xc7ccd2, metalness: 0.8, roughness: 0.35 }));
    shaft.position.y = -0.45;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0xf26b1d }));
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.04), new THREE.MeshStandardMaterial({ color: 0x2b2e33 }));
    jaw.position.y = -0.95;
    stick.add(shaft, grip, jaw);
    this.stick = stick;
    this.attach('HandR', stick);

    // Trash bag in the left hand
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.35, metalness: 0.1 }));
    bag.geometry.translate(0, -0.22, 0);
    bag.geometry.scale(1, 1.25, 1);
    this.bag = bag;
    this.attach('HandL', bag);

    // Tied bags on the belt
    this.belt = [];
    const beltGeo = new THREE.SphereGeometry(0.11, 8, 6);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(beltGeo, bag.material);
      const a = -1.2 + i * 0.5;
      m.position.set(Math.sin(a) * 0.24, 0.92, -Math.cos(a) * 0.18 + 0.05);
      m.visible = false;
      this.root.add(m);
      this.belt.push(m);
    }

    this.tag = nameTag(name);
    this.tag.material.color.set(color);
    this.root.add(this.tag);
    this.tag.position.y = 2.15;

    this.phase = 0;
    this.time = Math.random() * 10;
    this.punchT = 0;
    this.lastPunch = 0;
    this.holdK = 0;
    this.visible = true;
  }

  // Parent a prop to a bone, undoing the rig's scale so sizes stay in meters.
  attach(boneName, obj) {
    const bone = this.bones[boneName];
    obj.userData.base = 1;
    if (!bone) { obj.visible = false; return; }
    const ws = bone.getWorldScale(new THREE.Vector3());
    obj.userData.base = 1 / (ws.x || 1);
    obj.scale.setScalar(obj.userData.base);
    bone.add(obj);
  }

  // Rotate a bone by model-space rotation R on top of its rest pose.
  pose(name, R) {
    const r = this.rig[name];
    if (!r) return;
    // local = parentQ^-1 * R * parentQ * rest
    _q.copy(r.parentInv).multiply(R).multiply(r.parentQ).multiply(r.rest);
    r.bone.quaternion.copy(_q);
  }

  setVisible(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.root.visible = v;
  }

  // s = { p: [x,y,z] capsule center, yaw, speed, state, drunk, fill (0..100), holding, tied, punch }
  update(dt, s) {
    if (!s) return;
    const show = s.state === 0;
    this.setVisible(show);
    // The name tag rides along with the truck / ragdoll when the body is hidden.
    if (!show) return;
    this.root.position.set(s.p[0], s.p[1] - 0.8, s.p[2]);
    this.root.rotation.y = s.yaw;
    this.time += dt;

    const speed = Math.min(s.speed, 9);
    const walk = Math.min(speed / 4.5, 1.4);
    this.phase += dt * (3 + speed * 1.6) * (speed > 0.3 ? 1 : 0);
    const swing = Math.sin(this.phase) * 0.55 * walk;

    const drunk = s.drunk ?? 0;
    this.model.rotation.z = Math.sin(this.time * 1.7) * 0.05 * drunk;
    this.model.rotation.x = Math.sin(this.time * 1.1) * 0.03 * drunk;

    if (s.punch !== this.lastPunch) { this.lastPunch = s.punch; this.punchT = 1; }
    this.punchT = Math.max(0, this.punchT - dt * 4);
    const jab = Math.sin(this.punchT * Math.PI);
    this.holdK += ((s.holding ? 1 : 0) - this.holdK) * Math.min(1, dt * 8);

    // Legs
    this.pose('UpperLegL', _r.setFromAxisAngle(X, -swing));
    this.pose('UpperLegR', _r.setFromAxisAngle(X, swing));
    this.pose('LowerLegL', _r.setFromAxisAngle(X, Math.max(0, swing) * 0.9));
    this.pose('LowerLegR', _r.setFromAxisAngle(X, Math.max(0, -swing) * 0.9));

    // Arms: down from the T-pose, then swing. Right arm reaches forward when
    // carrying (it's holding the picker), jabs when punching.
    const downL = _a.setFromAxisAngle(Z, -1.25);
    this.pose('UpperArmL', _r.setFromAxisAngle(X, swing * 0.7 - this.holdK * 1.2).multiply(downL));
    const downR = new THREE.Quaternion().setFromAxisAngle(Z, 1.25 - jab * 1.0);
    this.pose('UpperArmR', _r.setFromAxisAngle(X, -swing * 0.7 - this.holdK * 1.3 - jab * 1.4).multiply(downR));
    this.pose('LowerArmR', _r.setFromAxisAngle(X, -0.3 - (1 - jab) * 0.2));

    // Bag in hand grows as it fills; tied bags hang on the belt.
    const fill = (s.fill ?? 0) / 100;
    this.bag.visible = fill > 0.01;
    this.bag.scale.setScalar((0.4 + fill * 0.8) * this.bag.userData.base);
    this.belt.forEach((m, i) => { m.visible = i < (s.tied ?? 0); });
    this.stick.visible = !s.holding;
  }

  dispose() {
    this.game.scene.remove(this.root);
  }
}
