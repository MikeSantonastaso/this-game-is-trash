// PBR ground materials from the CC0 ambientCG textures in assets/textures.
// Surfaces use world-space UVs (see planarUV) so every road, path and lawn tiles
// at a consistent real-world scale, and the big ground gets a slow "macro"
// color variation so the texture repeat isn't obvious at a distance.
import * as THREE from 'three';

const DIR = 'assets/textures/';
const loader = new THREE.TextureLoader();

function tex(file, { srgb = false, anisotropy = 8 } = {}) {
  const t = loader.load(DIR + file);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function pbr(name, { color = 0xffffff, normalScale = 1, roughness = 1, envMapIntensity = 0.6, roughnessMap = true } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    map: tex(`${name}_color.jpg`, { srgb: true }),
    normalMap: tex(`${name}_normal.jpg`),
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: roughnessMap ? tex(`${name}_rough.jpg`) : null,
    roughness,
    envMapIntensity,
  });
}

// Breaks up texture tiling with low-frequency world-space noise.
function addMacroVariation(material, { scale = 0.035, strength = 0.22, tint = new THREE.Color(0.9, 1.0, 0.75) } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.macroScale = { value: scale };
    shader.uniforms.macroStrength = { value: strength };
    shader.uniforms.macroTint = { value: tint };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMacroPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMacroPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vMacroPos; uniform float macroScale, macroStrength; uniform vec3 macroTint;
        float mHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float mNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mHash(i), mHash(i + vec2(1, 0)), f.x), mix(mHash(i + vec2(0, 1)), mHash(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float mn = mNoise(vMacroPos.xz * macroScale) * 0.65 + mNoise(vMacroPos.xz * macroScale * 3.7) * 0.35;
        diffuseColor.rgb *= mix(vec3(1.0), macroTint, mn * macroStrength * 2.0) * (1.0 - macroStrength * 0.5 + mn * macroStrength);`);
  };
  return material;
}

export function createSurfaces() {
  return {
    // Grass: no roughness map (it made the lawn glitter); fully rough, little sky reflection.
    grass: addMacroVariation(pbr('Grass004', { color: 0xb8d890, normalScale: 0.7, roughnessMap: false, envMapIntensity: 0.35 })),
    dirt: addMacroVariation(pbr('Ground054', { color: 0xb89a78, normalScale: 1.3, envMapIntensity: 0.4 }), { scale: 0.08, strength: 0.18, tint: new THREE.Color(0.8, 0.72, 0.6) }),
    asphalt: pbr('Asphalt010', { color: 0x9a9a9a, normalScale: 0.8 }),
    concrete: pbr('Concrete034', { color: 0xd6d2ca, normalScale: 0.6 }),
    paving: pbr('PavingStones070', { color: 0xe8e2d8, normalScale: 1.0 }),
  };
}

// Bake world-space UVs into a geometry that's already been transformed into
// world space (rotated/translated). tile = meters per texture repeat.
export function planarUV(geometry, tile) {
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / tile;
    uv[i * 2 + 1] = pos.getZ(i) / tile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}
