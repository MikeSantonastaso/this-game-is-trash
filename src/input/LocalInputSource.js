// Keyboard/mouse -> PlayerIntent. A PlayerIntent is the only thing a Player
// reads each frame, which keeps Players engine- and network-agnostic:
//
// { move: {x, z} (world space, length <= 1), jump, sprint, pick, pickHeld,
//   grab, flop, interact, tie, throwBag, aimOrigin: Vector3, aimDir: Vector3 }
import * as THREE from 'three';

export class LocalInputSource {
  constructor(input, cameraRig) {
    this.input = input;
    this.cameraRig = cameraRig;
  }

  read(dt) {
    const i = this.input;
    const mouse = i.consumeMouse();
    if (i.enabled) {
      this.cameraRig.look(mouse.x, mouse.y);
      const keyLook = 2.2 * dt;
      if (i.down('ArrowLeft')) this.cameraRig.yaw += keyLook;
      if (i.down('ArrowRight')) this.cameraRig.yaw -= keyLook;
      if (i.down('ArrowUp')) this.cameraRig.pitch = Math.min(this.cameraRig.pitch + keyLook, 1.35);
      if (i.down('ArrowDown')) this.cameraRig.pitch = Math.max(this.cameraRig.pitch - keyLook, -1.45);
      if (mouse.wheel) this.cameraRig.zoom(mouse.wheel);
    }

    let fx = 0, fz = 0;
    if (i.down('KeyW')) fz += 1;
    if (i.down('KeyS')) fz -= 1;
    if (i.down('KeyD')) fx += 1;
    if (i.down('KeyA')) fx -= 1;
    const fwd = this.cameraRig.flatForward();
    const right = this.cameraRig.flatRight();
    const move = new THREE.Vector3().addScaledVector(fwd, fz).addScaledVector(right, fx);
    if (move.lengthSq() > 1) move.normalize();

    return {
      move: { x: move.x, z: move.z },
      jump: i.pressed('Space'),
      sprint: i.down('ShiftLeft') || i.down('ShiftRight'),
      pick: i.clicked(0),
      pickHeld: i.buttonDown(0),
      grab: i.pressed('KeyE') || i.clicked(2),
      flop: i.pressed('KeyR'),
      interact: i.pressed('KeyF'),
      tie: i.pressed('KeyB'),
      throwBag: i.pressed('KeyG'),
      aimOrigin: this.cameraRig.camera.position.clone(),
      aimDir: this.cameraRig.forward(),
      aimRight: this.cameraRig.right(),
      yaw: this.cameraRig.yaw,
    };
  }
}
