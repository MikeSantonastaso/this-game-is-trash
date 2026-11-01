// Raw keyboard + mouse state with per-frame "just pressed" edges.
// Gameplay never reads this directly; LocalInputSource turns it into a
// PlayerIntent so a gamepad, a second local player or a network peer can
// drive a Player the same way.
export class Input {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.buttons = new Set();
    this.clickedButtons = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true; // false while a menu is open

    window.addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedKeys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });

    element.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) this.requestLock();
      this.buttons.add(e.button);
      this.clickedButtons.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    element.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === element;
    });
  }

  requestLock() {
    try { this.element.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not supported */ }
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.enabled && this.keys.has(code); }
  pressed(code) { return this.enabled && this.pressedKeys.has(code); }
  buttonDown(b) { return this.enabled && this.buttons.has(b); }
  clicked(b) { return this.enabled && this.clickedButtons.has(b); }

  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY, wheel: this.wheel };
    this.mouseDX = this.mouseDY = this.wheel = 0;
    return d;
  }

  endFrame() { this.pressedKeys.clear(); this.clickedButtons.clear(); }
}
