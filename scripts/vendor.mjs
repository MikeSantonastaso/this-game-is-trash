// Copies the runtime libraries from node_modules into /vendor so the game runs
// as a plain static site (GitHub Pages) with no build step and no CDN.
// three.js addons are copied together with everything they import.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const files = [
  ['node_modules/three/build/three.module.min.js', 'vendor/three.module.min.js'],
  ['node_modules/three/LICENSE', 'vendor/three.LICENSE'],
  ['node_modules/cannon-es/dist/cannon-es.js', 'vendor/cannon-es.js'],
  ['node_modules/cannon-es/LICENSE', 'vendor/cannon-es.LICENSE'],
];
for (const [from, to] of files) { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); console.log(`${from} -> ${to}`); }

const ADDONS = [
  'loaders/GLTFLoader.js',
  'utils/SkeletonUtils.js',
  'objects/Sky.js',
  'geometries/RoundedBoxGeometry.js',
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/OutputPass.js',
  'postprocessing/GTAOPass.js',
  'postprocessing/UnrealBloomPass.js',
];
const SRC = 'node_modules/three/examples/jsm/';
const seen = new Set();
const visit = (rel) => {
  rel = normalize(rel);
  if (seen.has(rel)) return;
  seen.add(rel);
  const code = readFileSync(join(SRC, rel), 'utf8');
  mkdirSync(dirname(join('vendor/three-addons', rel)), { recursive: true });
  copyFileSync(join(SRC, rel), join('vendor/three-addons', rel));
  for (const m of code.matchAll(/from\s+'(\.[^']+)'/g)) visit(join(dirname(rel), m[1]));
};
ADDONS.forEach(visit);
console.log(`three addons: ${[...seen].join(', ')}`);
