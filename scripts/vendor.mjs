// Copies the runtime libraries from node_modules into /vendor so the game runs
// as a plain static site (GitHub Pages) with no build step and no CDN.
import { copyFileSync, mkdirSync } from 'node:fs';
const files = [
  ['node_modules/three/build/three.module.min.js', 'vendor/three.module.min.js'],
  ['node_modules/three/LICENSE', 'vendor/three.LICENSE'],
  ['node_modules/cannon-es/dist/cannon-es.js', 'vendor/cannon-es.js'],
  ['node_modules/cannon-es/LICENSE', 'vendor/cannon-es.LICENSE'],
  ['node_modules/three/examples/jsm/loaders/GLTFLoader.js', 'vendor/three-addons/loaders/GLTFLoader.js'],
  ['node_modules/three/examples/jsm/utils/SkeletonUtils.js', 'vendor/three-addons/utils/SkeletonUtils.js'],
  ['node_modules/three/examples/jsm/utils/BufferGeometryUtils.js', 'vendor/three-addons/utils/BufferGeometryUtils.js'],
];
mkdirSync('vendor/three-addons/loaders', { recursive: true });
mkdirSync('vendor/three-addons/utils', { recursive: true });
for (const [from, to] of files) { copyFileSync(from, to); console.log(`${from} -> ${to}`); }
