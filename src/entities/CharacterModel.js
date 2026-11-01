// Blocky trash-collector visual for the controllable (non-ragdoll) state.
// Faces -Z. Swaps to a Ragdoll when the player flops.
import * as THREE from 'three';

export class CharacterModel {
  constructor(colors) {
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
    this.root = new THREE.Group();
    const skin = mat(colors.skin), shirt = mat(colors.shirt), pants = mat(colors.pants);

    const limb = (w, h, d, m, x, y) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.y = -h / 2;
      mesh.castShadow = true;
      pivot.add(mesh);
      this.root.add(pivot);
      return pivot;
    };
    this.legL = limb(0.2, 0.8, 0.2, pants, -0.13, 0.8);
    this.legR = limb(0.2, 0.8, 0.2, pants, 0.13, 0.8);
    this.armL = limb(0.16, 0.6, 0.16, skin, -0.35, 1.45);
    this.armR = limb(0.16, 0.6, 0.16, skin, 0.35, 1.45);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), shirt);
    torso.position.y = 1.15;
    torso.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.06, 0.31), new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0x333333 }));
    stripe.position.y = 0.05;
    torso.add(stripe);
    this.root.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin);
    head.position.y = 1.7;
    head.castShadow = true;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const x of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeMat);
      eye.position.set(x, 0.04, -0.19);
      head.add(eye);
    }
    if (colors.hat != null) {
      const hatMat = mat(colors.hat);
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.12, 16), hatMat);
      hat.position.y = 0.11;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.18), hatMat);
      brim.position.set(0, -0.04, -0.2);
      hat.add(brim);
      head.add(hat);
    }
    this.root.add(head);

    // Picker tool in the right hand.
    this.tool = new THREE.Group();
    this.toolShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), mat(0x9aa0a6));
    this.toolShaft.position.y = -0.5;
    this.claw = new THREE.Group();
    this.claw.position.y = -1.0;
    const clawMat = mat(0x333333);
    for (const s of [-1, 1]) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), clawMat);
      finger.position.set(s * 0.04, -0.05, 0);
      finger.rotation.z = -s * 0.3;
      this.claw.add(finger);
    }
    this.tool.add(this.toolShaft, this.claw);
    this.tool.position.set(0, -0.55, 0);
    this.armR.add(this.tool);

    // Belt bags (shown as you tie them off).
    this.beltBags = [];
    const bagGeo = new THREE.SphereGeometry(0.17, 10, 8);
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.35 });
    const spots = [[-0.3, 0.75, 0.12], [0.3, 0.75, 0.12], [0, 0.85, 0.28], [-0.22, 0.95, 0.28], [0.22, 0.95, 0.28], [0, 1.1, 0.3]];
    for (const [x, y, z] of spots) {
      const b = new THREE.Mesh(bagGeo, bagMat);
      b.position.set(x, y, z);
      b.visible = false;
      b.castShadow = true;
      this.root.add(b);
      this.beltBags.push(b);
    }

    this.phase = 0;
    this.clackT = 0;
  }

  setTool(tool) {
    this.toolShaft.material.color.setHex(tool.color);
    const len = 0.6 + tool.reach * 0.2;
    this.toolShaft.scale.y = len;
    this.toolShaft.position.y = -len / 2;
    this.claw.position.y = -len;
  }

  setBeltBags(n) { this.beltBags.forEach((b, i) => { b.visible = i < n; }); }

  clack() { this.clackT = 1; }

  handWorldPosition(out = new THREE.Vector3()) { return this.claw.getWorldPosition(out); }

  animate(dt, speed, grounded, holding) {
    this.phase += dt * speed * 2.2;
    const swing = grounded ? Math.sin(this.phase) * Math.min(speed / 5, 1) * 0.7 : 0.4;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = holding ? 1.5 : -swing * 0.8;
    this.clackT = Math.max(0, this.clackT - dt * 6);
    // Right arm holds the picker out in front; jabs forward on each pick.
    this.armR.rotation.x = holding ? 1.5 : 0.7 + Math.sin(this.clackT * Math.PI) * 0.5;
    this.claw.scale.x = 1 - Math.sin(this.clackT * Math.PI) * 0.7;
  }
}
