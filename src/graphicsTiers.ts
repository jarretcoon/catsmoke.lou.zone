import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { WebGLRenderTarget } from 'three';
import type { Quality } from './quality';

/**
 * What each graphics level draws. Low / Medium / High are what they always were (phones and the PR check's
 * postcards run on them); Ultra is the desktop's "max detail" level on top of High:
 * - a 4096 shadow map over a bigger area, fitted to what the camera looks at (not centred on Lou, where half of it
 *   lay behind the camera) and snapped to whole shadow texels so edges don't crawl as he walks, with a softer
 *   16-tap PCF filter;
 * - supersampling: the scene renders at 1.25x the screen's pixels in each direction (on top of the screen's own pixel
 *   ratio, up to 2) and is filtered down, on top of 4x MSAA, so thin things (palm fronds, whiskers, railings, wires,
 *   signs' letters) and specular sparkles stop shimmering (1.5x cost twice as much on Lou close up, for little more);
 * - ambient occlusion (GTAO from the scene's own depth): contact shadows under Lou, kerbs, bollards, kiosks, awnings;
 * - 60 % longer draw distance for street clutter and towers;
 * - more fur shells on Lou (28, High has 16), and finer, denser tufts;
 * - 16x anisotropic filtering on every texture (roads, pavers, facades stay sharp to the horizon);
 * - twice the resolution for the generated textures (roads, pavers, facades, signs), decided at load.
 */
export interface Tier {
  /** Device pixel ratio cap for the canvas. */
  maxPixelRatio: number;
  /** Extra render scale inside the post chain (1 = none): supersampling, filtered down at the end. */
  superSample: number;
  shadows: boolean;
  shadowSize: number;
  /** PCF filter radius in shadow texels; over 1.5 uses the 16-tap filter (softShadowFilter). */
  shadowRadius: number;
  /** Half the width of the sun's shadow box, metres. */
  shadowExtent: number;
  /** How far ahead of Lou, along the view, the shadow box centres (metres); 0 = on Lou (as High always did). */
  shadowAhead: number;
  /** MSAA samples of the post chain's target (0 = the post chain is off: Low). */
  msaa: number;
  drawDistance: number;
  /** Scales the distance culling of props, pickups, guards and vehicles. */
  dynCull: number;
  anisotropy: number;
  /** Ambient occlusion strength (0 = off): GTAO from the main pass's own depth, no second scene pass. */
  ao: number;
}

export const TIERS: Record<Quality, Tier> = {
  low: { maxPixelRatio: 1, superSample: 1, shadows: false, shadowSize: 1024, shadowRadius: 1, shadowExtent: 70, shadowAhead: 0, msaa: 0, drawDistance: 0.6, dynCull: 0.7, anisotropy: 0, ao: 0 },
  medium: { maxPixelRatio: 1.25, superSample: 1, shadows: true, shadowSize: 1024, shadowRadius: 1, shadowExtent: 70, shadowAhead: 0, msaa: 2, drawDistance: 0.85, dynCull: 1, anisotropy: 0, ao: 0 },
  high: { maxPixelRatio: 2, superSample: 1, shadows: true, shadowSize: 2048, shadowRadius: 1, shadowExtent: 70, shadowAhead: 0, msaa: 4, drawDistance: 1, dynCull: 1, anisotropy: 0, ao: 0 },
  ultra: { maxPixelRatio: 2, superSample: 1.25, shadows: true, shadowSize: 4096, shadowRadius: 2.2, shadowExtent: 95, shadowAhead: 40, msaa: 4, drawDistance: 1.6, dynCull: 1.4, anisotropy: 16, ao: 0.8 },
};

/** Dev/test: tweak Ultra's numbers live (`__tiers.ultra.superSample = 1`, then `__applyQuality()`). */
if (import.meta.env.DEV || import.meta.env.MODE === 'check') (window as unknown as { __tiers: typeof TIERS }).__tiers = TIERS;

/**
 * three's PCF shadow filter takes 5 taps of a rotated Vogel disk. A wider radius with 5 taps turns grainy, so with
 * a radius over 1.5 texels (Ultra) it takes 16: soft, smooth penumbrae. The branch is on a uniform, so the other
 * levels run the stock 5-tap code. Call before the first render.
 */
export function softShadowFilter(): void {
  const chunk = THREE.ShaderChunk as unknown as Record<string, string>;
  const src = chunk.shadowmap_pars_fragment;
  const re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \) \+[\s\S]*?\) \* 0\.2;/;
  const m = src.match(re);
  if (!m) {
    console.warn('softShadowFilter: three.js shadow chunk changed; Ultra keeps the 5-tap filter');
    return;
  }
  chunk.shadowmap_pars_fragment = src.replace(
    re,
    /* glsl */ `if ( shadowRadius > 1.5 ) {
					shadow = 0.0;
					for ( int i = 0; i < 16; i ++ ) {
						shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, 16, phi ) * radius, shadowCoord.z ) );
					}
					shadow *= 0.0625;
				} else {
					${m[0]}
				}`
  );
}

/**
 * The last pass of the post chain (tone mapping and sRGB out), which on Ultra also resolves the supersampled
 * image: four taps a quarter of a screen pixel apart (exactly the four source pixels at 2x, a tent over ~1.5 px at
 * 1.5x), each tone-mapped BEFORE they're averaged, so a bright neon edge resolves to a smooth line instead of a
 * jagged hot one. At 1x it's the stock OutputPass.
 */
export function makeOutputPass(superSample: number): OutputPass {
  const pass = new OutputPass();
  if (superSample <= 1) return pass;
  const mat = pass.material as THREE.RawShaderMaterial;
  const src = mat.fragmentShader;
  const read = 'gl_FragColor = texture2D( tDiffuse, vUv );';
  const end = '// color space';
  if (!src.includes(read) || !src.includes(end)) {
    console.warn('makeOutputPass: three.js OutputShader changed; supersampling resolves with one tap');
    return pass;
  }
  mat.uniforms.uTexel = { value: new THREE.Vector2(1 / window.innerWidth, 1 / window.innerHeight) };
  mat.fragmentShader = src
    .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform vec2 uTexel;')
    .replace(read, 'vec4 louSum = vec4( 0.0 );\nfor ( int k = 0; k < 4; k ++ ) {\nvec2 louO = vec2( ( k == 1 || k == 3 ) ? 0.25 : -0.25, k >= 2 ? 0.25 : -0.25 ) * uTexel;\ngl_FragColor = texture2D( tDiffuse, vUv + louO );')
    .replace(end, `louSum += clamp( gl_FragColor, 0.0, 1.0 );\n}\ngl_FragColor = louSum * 0.25;\n${end}`);
  return pass;
}

/** Keep the resolve's screen-pixel size in step with the window. */
export function resizeOutputPass(pass: OutputPass | null, width: number, height: number): void {
  const u = (pass?.material as THREE.RawShaderMaterial | undefined)?.uniforms.uTexel;
  if (u) (u.value as THREE.Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
}

/**
 * Fits the sun's shadow box to the view: centred `ahead` metres in front of Lou along the camera's heading (most of
 * the map then covers what's on screen), and snapped to whole shadow texels in the light's space so the shadow
 * edges hold still as the box follows him. Runs after the world has placed the sun for the frame.
 */
export class ShadowFit {
  private readonly dir = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private extent = 0;

  constructor(private readonly sun: THREE.DirectionalLight) {}

  /** Size the box for a level (every level; High's numbers are what it always used). */
  setTier(t: Tier): void {
    if (t.shadowExtent === this.extent) return;
    this.extent = t.shadowExtent;
    const c = this.sun.shadow.camera;
    c.left = -t.shadowExtent;
    c.right = t.shadowExtent;
    c.top = t.shadowExtent;
    c.bottom = -t.shadowExtent;
    // a taller box for the bigger one: the sun sits further back so towers at the far edge still cast
    c.far = 260 + (t.shadowExtent - 70) * 2;
    c.updateProjectionMatrix();
  }

  update(t: Tier, camera: THREE.Camera): void {
    if (!t.shadows || t.shadowAhead <= 0) return;
    const sun = this.sun;
    this.dir.subVectors(sun.position, sun.target.position);
    const dist = this.dir.length();
    if (dist < 1e-3) return;
    this.dir.divideScalar(dist);
    camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    this.centre.copy(sun.target.position).addScaledVector(this.fwd, t.shadowAhead);
    // light-space axes (any fixed pair perpendicular to the sun) and the texel size
    this.right.crossVectors(this.dir, THREE.Object3D.DEFAULT_UP);
    if (this.right.lengthSq() < 1e-6) this.right.set(1, 0, 0);
    this.right.normalize();
    this.up.crossVectors(this.right, this.dir).normalize();
    const texel = (t.shadowExtent * 2) / t.shadowSize;
    const a = this.centre.dot(this.right);
    const b = this.centre.dot(this.up);
    this.centre.addScaledVector(this.right, Math.round(a / texel) * texel - a).addScaledVector(this.up, Math.round(b / texel) * texel - b);
    sun.target.position.copy(this.centre);
    sun.position.copy(this.centre).addScaledVector(this.dir, dist + (t.shadowExtent - 70));
    sun.target.updateMatrixWorld();
  }
}

/**
 * Sets every texture's anisotropic filtering to `level` (or back to what it was made with) without uploading them
 * again: the GL sampler parameter is set on each live texture directly, and three's own record of it is updated so
 * it doesn't undo it. New textures made later pick up the level as they're first used (`watch`).
 */
export class Anisotropy {
  private level = 0;
  private readonly base = new WeakMap<THREE.Texture, number>();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene
  ) {}

  set(level: number): void {
    const max = this.renderer.capabilities.getMaxAnisotropy();
    this.level = Math.min(level, max);
    this.sweep();
  }

  private sinceSweep = 0;

  /** On Ultra, pick up textures made since the last sweep (lazy interiors, signs, shops) every few seconds. */
  tick(dt: number): void {
    if (this.level <= 1) return;
    this.sinceSweep += dt;
    if (this.sinceSweep < 4) return;
    this.sinceSweep = 0;
    this.sweep();
  }

  /** Re-check the scene for textures made since the last sweep (lazy interiors, signs). Cheap; call now and then. */
  sweep(): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const ext = this.renderer.extensions.get('EXT_texture_filter_anisotropic') as { TEXTURE_MAX_ANISOTROPY_EXT: number } | null;
    if (!ext) return;
    const seen = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
          if (v instanceof THREE.Texture && !seen.has(v)) seen.add(v);
        }
      }
    });
    for (const t of seen) {
      if (!this.base.has(t)) this.base.set(t, t.anisotropy);
      const want = Math.max(this.base.get(t) ?? 1, this.level || 1);
      if (t.anisotropy === want) continue;
      const props = this.renderer.properties.get(t) as { __webglTexture?: WebGLTexture; __currentAnisotropy?: number };
      t.anisotropy = want;
      if (!props.__webglTexture || t.minFilter === THREE.NearestFilter || t.minFilter === THREE.LinearFilter) continue;
      if ((t as THREE.Texture & { isCubeTexture?: boolean }).isCubeTexture || (t as THREE.Texture & { isData3DTexture?: boolean }).isData3DTexture) continue;
      const target = (t as THREE.Texture & { isDataArrayTexture?: boolean }).isDataArrayTexture ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
      this.renderer.state.bindTexture(target, props.__webglTexture);
      gl.texParameterf(target, ext.TEXTURE_MAX_ANISOTROPY_EXT, want);
      props.__currentAnisotropy = want;
    }
    this.renderer.state.bindTexture(gl.TEXTURE_2D, null as unknown as WebGLTexture);
  }
}

/**
 * Ambient occlusion for Ultra: three's GTAO, fed the depth the main scene pass already drew (the composer's
 * targets carry a depth texture on Ultra), with normals rebuilt from that depth. No second scene pass with a
 * normal material, so every custom shader (walking crowds, swaying palms, the facade windows, Lou's fur) shades
 * exactly what was drawn, and it costs only the AO itself. The composer's two targets take turns as the scene
 * target frame to frame, so the depth is picked up from whichever one the scene went into.
 */
export class DepthAOPass extends GTAOPass {
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, width: number, height: number, strength: number) {
    super(scene, camera, width, height, { depthTexture: new THREE.DepthTexture(1, 1) });
    // metres, for a street-scale world: creases under awnings, kerbs, wall feet, between parked cars and around Lou
    this.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.2, thickness: 1.2, scale: 1, samples: 12 });
    this.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.blendIntensity = strength;
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const depth = readBuffer.depthTexture;
    if (depth) {
      this.gtaoMaterial.uniforms.tDepth.value = depth;
      this.pdMaterial.uniforms.tDepth.value = depth;
      this.depthRenderMaterial.uniforms.tDepth.value = depth;
    }
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}
