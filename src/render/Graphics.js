// Renderer, lighting and post-processing. Everything about "how it looks" that
// isn't a model or a texture lives here, so it's one place to tune.
//
// High quality: physically based sky + image-based lighting from it, soft
// shadows that follow the player, ambient occlusion (GTAO), a touch of bloom,
// and a warm color grade with a light vignette.
// Low quality (?quality=low): same sky and lighting, no shadows, no post.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Applied after tone mapping: gentle saturation/contrast lift, warm tint, vignette.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1.12 }, contrast: { value: 1.06 }, warmth: { value: 0.03 }, vignette: { value: 0.28 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float saturation, contrast, warmth, vignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      c.rgb += vec3(warmth, warmth * 0.4, -warmth);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
    }`,
};

// The stock Sky shader is very bright at midday; scale it so the sky reads blue
// and the image-based lighting it produces doesn't wash everything out.
function makeSky(scale, intensity) {
  const sky = new Sky();
  sky.scale.setScalar(scale);
  sky.material.uniforms.skyIntensity = { value: intensity };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float skyIntensity;')
    .replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * skyIntensity, 1.0 );');
  return sky;
}

export class Graphics {
  constructor(canvas, { lowQuality = false } = {}) {
    this.lowQuality = lowQuality;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: lowQuality, powerPreference: 'high-performance' });
    r.setPixelRatio(lowQuality ? 1 : Math.min(window.devicePixelRatio, 1.75));
    r.shadowMap.enabled = !lowQuality;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.8;
    r.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 2500);
    this.scene.add(this.camera); // first-person hands are parented to it
    this.time = { value: 0 }; // shared uniform for wind etc.

    // ---- Sky + sun ----
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 40), THREE.MathUtils.degToRad(30));
    const sky = this.sky = makeSky(2000, 0.42);
    const u = sky.material.uniforms;
    u.turbidity.value = 2;
    u.rayleigh.value = 2.6;
    u.mieCoefficient.value = 0.0025;
    u.mieDirectionalG.value = 0.85;
    u.sunPosition.value.copy(this.sunDir);
    this.scene.add(sky);

    // Image-based lighting from the same sky: soft blue fill + warm bounce for free.
    const pmrem = new THREE.PMREMGenerator(r);
    const envScene = new THREE.Scene();
    const envSky = makeSky(1000, 0.42);
    Object.entries(u).forEach(([k, v]) => { if (k !== 'skyIntensity') envSky.material.uniforms[k].value = v.value?.clone?.() ?? v.value; });
    envScene.add(envSky);
    // A green "ground" hemisphere so the bottom of objects picks up grass bounce.
    const groundBounce = new THREE.Mesh(new THREE.SphereGeometry(500, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x4f6b2a, side: THREE.BackSide }));
    envScene.add(groundBounce);
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.9;
    pmrem.dispose();

    this.scene.fog = new THREE.Fog(0xb9d6ee, 120, 520);

    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.castShadow = !lowQuality;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 160 });
    this.scene.add(sun, sun.target);
    this.scene.add(new THREE.HemisphereLight(0xbfdcff, 0x5b6b35, 0.35));

    // ---- Post-processing ----
    if (!lowQuality) {
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
      const composer = this.composer = new EffectComposer(r, target);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const ao = this.ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      ao.blendIntensity = 0.85;
      composer.addPass(ao);
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.08, 0.3, 1.1));
      composer.addPass(new OutputPass());
      composer.addPass(new ShaderPass(GradeShader));
    }
  }

  // Keep the shadow map centered on whoever we're looking at.
  follow(focus) {
    const t = this.sun.target.position;
    t.set(Math.round(focus.x), 0, Math.round(focus.z));
    this.sun.position.copy(t).addScaledVector(this.sunDir, 80);
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.composer.setSize(w, h);
    }
  }

  render(dt) {
    this.time.value += dt;
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
