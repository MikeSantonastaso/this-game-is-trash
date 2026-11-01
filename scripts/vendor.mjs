// Copies the runtime libraries from node_modules into /vendor so the game runs
// as a plain static site (GitHub Pages) with no build step and no CDN.
import { copyFileSync, mkdirSync } from 'node:fs';
const files = [
  ['node_modules/three/build/three.module.min.js', 'vendor/three.module.min.js'],
  ['node_modules/three/LICENSE', 'vendor/three.LICENSE'],
  ['node_modules/cannon-es/dist/cannon-es.js', 'vendor/cannon-es.js'],
  ['node_modules/cannon-es/LICENSE', 'vendor/cannon-es.LICENSE'],
];
mkdirSync('vendor', { recursive: true });
for (const [from, to] of files) { copyFileSync(from, to); console.log(`${from} -> ${to}`); }
