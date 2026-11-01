// One camera, several modes sharing the same yaw/pitch from the mouse:
//   'first'  - on foot, eyes of the player (default)
//   'chase'  - orbit behind a target. Used while you're a ragdoll and while
//              driving (where it swings back behind the truck on its own).
import * as THREE from 'three';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'first';
    this.yaw = 0;
    this.pitch = -0.15;
    this.sensitivity = 0.0022;
    this.chaseDistance = 4.5;
    this.smoothed = new THREE.Vector3();
    this.initialized = false;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._offset = new THREE.Vector3();
    this.bobPhase = 0;
  }

  look(dx, dy) {
    if (dx || dy) this.lastLook = performance.now();
    this.yaw -= dx * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * this.sensitivity, -1.45, 1.35);
  }

  // Driving: swing back behind the vehicle unless the mouse moved recently.
  follow(dt, yaw) {
    if (performance.now() - (this.lastLook ?? 0) < 1500) return;
    let d = yaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const k = 1 - Math.exp(-2.5 * dt);
    this.yaw += d * k;
    this.pitch += (-0.22 - this.pitch) * k;
  }

  zoom(dir) { this.chaseDistance = THREE.MathUtils.clamp(this.chaseDistance + dir * 0.6, 2.5, 16); }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.initialized = false;
  }

  // target: eye position in first person, focus point in chase mode.
  // walkSpeed: horizontal speed for a subtle head bob.
  update(dt, target, walkSpeed = 0) {
    this._euler.set(this.pitch, this.yaw, this.roll ?? 0);
    this.camera.quaternion.setFromEuler(this._euler);
    if (this.mode === 'first') {
      this.bobPhase += dt * walkSpeed * 1.9;
      const bob = Math.sin(this.bobPhase) * 0.035 * Math.min(walkSpeed / 5, 1);
      this.camera.position.set(target.x, target.y + bob, target.z);
      return;
    }
    if (!this.initialized) { this.smoothed.copy(target); this.initialized = true; }
    this.smoothed.lerp(target, 1 - Math.exp(-10 * dt));
    this._offset.set(0, 0, this.chaseDistance).applyQuaternion(this.camera.quaternion);
    this.camera.position.copy(this.smoothed).add(this._offset);
    if (this.camera.position.y < 0.4) this.camera.position.y = 0.4;
  }

  forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); }
  right() { return new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion); }
  flatForward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  flatRight() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
}
