// Canvas-drawn sign textures so the prototype has zero image assets.
import * as THREE from 'three';

export function signTexture(text, { bg = '#1e7d3a', fg = '#ffffff', w = 512, h = 128, font = 'bold 64px sans-serif' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#6fb04a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    const s = 40 + Math.random() * 40;
    g.fillStyle = `rgba(${s},${110 + Math.random() * 60},${30 + Math.random() * 20},0.35)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2 + Math.random() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
