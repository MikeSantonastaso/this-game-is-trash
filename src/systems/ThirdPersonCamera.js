// Over-the-shoulder orbit camera. yaw/pitch come from the mouse, the target is
// the player (or their ragdoll torso while flopped).
import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = -0.28;
    this.distance = 5;
    this.shoulder = 0.7;
    this.sensitivity = 0.0024;
    this.smoothed = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._offset = new THREE.Vector3();
    this.initialized = false;
  }

  look(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * this.sensitivity, -1.2, 0.7);
  }

  zoom(dir) { this.distance = THREE.MathUtils.clamp(this.distance + dir * 0.6, 2.5, 10); }

  update(dt, target) {
    if (!this.initialized) { this.smoothed.copy(target); this.initialized = true; }
    this.smoothed.lerp(target, 1 - Math.exp(-14 * dt));
    this._euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this._euler);
    this._offset.set(this.shoulder, 0, this.distance).applyQuaternion(this.camera.quaternion);
    this.camera.position.copy(this.smoothed).add(this._offset);
    if (this.camera.position.y < 0.4) this.camera.position.y = 0.4;
  }

  forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); }
  flatForward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  flatRight() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
}
