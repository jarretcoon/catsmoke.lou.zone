import * as THREE from 'three';

/**
 * Night light on the Boulevard's own surfaces (asphalt, curb band, sidewalk pavers), done in the
 * material shader instead of with real lights so it costs no draw calls and no per-light shading.
 *
 * The real Strip after dark is never a black road between lamp pools: the resort frontages (marquees,
 * LED walls, porte-cochère soffits, uplit facades) pour light onto the sidewalk and across all six
 * lanes, and the asphalt carries a soft coloured sheen of every sign it faces, strongest at grazing
 * angles down the road. Three terms, all scaled by `night`:
 *  - fill: the frontage glow on each side (a colour per metre of frontage, blurred over ~25 m),
 *    falling off with distance from that frontage;
 *  - pools: the street lights, as cos³ pools under the lantern heads of each curb pole;
 *  - sheen: the frontage glow reflected in the road. The reflected view ray is traced to each frontage
 *    plane, and the sign colour where it lands is looked up (sharp near, blurred far and on rough
 *    asphalt), weighted by a Schlick Fresnel term and the road's own roughness map, so polished wheel
 *    paths and oil stains shine more than fresh aggregate. Lantern heads reflect as soft streaks.
 * Everything stays well under the bloom threshold: the road glows, it never flares.
 */

/** Frontage glow along the Boulevard, game z (north = −z). side −1 = west, +1 = east. Colour × strength. */
interface Front {
  z0: number;
  z1: number;
  side: -1 | 1;
  color: number;
  k: number;
}

/**
 * What each resort frontage throws onto the street at night (from night photos and video of the real
 * Strip at street level): Caesars and Bellagio warm white-gold, the Cosmopolitan's violet-blue LED
 * marquee, Planet Hollywood's magenta screens, Paris gold with its blue-white marquee, the Flamingo's
 * hot pink and orange neon, the LINQ's cool white-blue, Harrah's red and gold, MGM Grand's emerald,
 * NYNY's red-orange, the dark Hard Rock (ex-Mirage) construction fence. Positions follow the game's zones.
 */
const FRONTS: Front[] = [
  // ---- west side, north → south
  { z0: -470, z1: -412, side: -1, color: 0xa8c8ff, k: 0.7 }, // Fashion Show: white LED + The Cloud screen
  { z0: -404, z1: -330, side: -1, color: 0xffb04a, k: 0.85 }, // Treasure Island: amber sign, Sirens' Cove
  { z0: -326, z1: -186, side: -1, color: 0xc89070, k: 0.18 }, // Hard Rock site (ex-Mirage): mostly dark
  { z0: -182, z1: -138, side: -1, color: 0xffd49a, k: 0.9 }, // Forum Shops portico
  { z0: -136, z1: -14, side: -1, color: 0xffcc86, k: 1.0 }, // Caesars Palace: warm gold, blue fountains
  { z0: 12, z1: 120, side: -1, color: 0xffe0b0, k: 0.8 }, // Bellagio + the fountain lake
  { z0: 124, z1: 154, side: -1, color: 0xffd8a0, k: 0.55 }, // Bellagio south end
  { z0: 156, z1: 206, side: -1, color: 0x9a7cff, k: 1.1 }, // The Cosmopolitan: violet/blue LED marquee
  { z0: 208, z1: 252, side: -1, color: 0xc0d4ff, k: 0.7 }, // Crystals / CityCenter: cool white
  { z0: 254, z1: 292, side: -1, color: 0xffd2a0, k: 0.6 }, // Diamond Row shop windows
  { z0: 292, z1: 312, side: -1, color: 0xff9a40, k: 0.75 }, // Whataburger orange
  { z0: 314, z1: 346, side: -1, color: 0xffc890, k: 0.6 }, // Park MGM street shops
  { z0: 348, z1: 370, side: -1, color: 0xffb070, k: 0.5 }, // The Park
  { z0: 372, z1: 428, side: -1, color: 0xff7a52, k: 0.9 }, // New York-New York
  { z0: 456, z1: 560, side: -1, color: 0xff6a5a, k: 0.85 }, // Excalibur
  // ---- east side, north → south
  { z0: -470, z1: -424, side: 1, color: 0xffb878, k: 0.45 }, // Wynn (behind its mountain)
  { z0: -404, z1: -306, side: 1, color: 0xffd8a0, k: 0.8 }, // The Palazzo
  { z0: -304, z1: -226, side: 1, color: 0xffc070, k: 0.95 }, // The Venetian
  { z0: -224, z1: -166, side: 1, color: 0xff4a6a, k: 0.95 }, // Casino Royale + Walgreens neon
  { z0: -164, z1: -138, side: 1, color: 0xff6a3a, k: 1.0 }, // Harrah's / Carnaval Court
  { z0: -136, z1: -98, side: 1, color: 0x6ac8ff, k: 0.9 }, // The LINQ: cool white-blue LED
  { z0: -96, z1: -36, side: 1, color: 0xff52b4, k: 1.15 }, // Flamingo: hot pink + orange neon
  { z0: -34, z1: -14, side: 1, color: 0xff86b8, k: 0.75 }, // The Vanderpump (Drai's)
  { z0: 16, z1: 58, side: 1, color: 0xffc860, k: 0.9 }, // Horseshoe / Grand Bazaar
  { z0: 60, z1: 114, side: 1, color: 0xffbe6a, k: 1.0 }, // Paris: gold, Eiffel legs, marquee
  { z0: 116, z1: 210, side: 1, color: 0x8a6cff, k: 1.05 }, // Planet Hollywood / Miracle Mile: blue-violet LED wall
  { z0: 214, z1: 304, side: 1, color: 0x9ad0ff, k: 0.85 }, // BLVD + the Harmon LED wall
  { z0: 306, z1: 350, side: 1, color: 0xff7040, k: 0.9 }, // Showcase: M&M's, Coca-Cola
  { z0: 352, z1: 406, side: 1, color: 0xffb860, k: 0.75 }, // Showcase south / ABC
  { z0: 408, z1: 430, side: 1, color: 0x40ff96, k: 1.0 }, // MGM Grand emerald
  { z0: 456, z1: 520, side: 1, color: 0xc8a080, k: 0.2 }, // ballpark construction site
];

const ROWS = 4; // 0 west sharp, 1 east sharp, 2 west blurred, 3 east blurred (alpha of 0/1 = a lamp pole stands here)
const W = 1024;

export interface StreetGlowOptions {
  /** Frontage light spilled onto the surface. */
  fill: number;
  /** Strength of the street-lamp pools. */
  pools: number;
  /** Strength of the reflected neon sheen. */
  sheen: number;
  /** Extra diffuse response added to the albedo (dark asphalt still shows light it receives). */
  lift?: number;
}

export class StreetGlow {
  readonly tex: THREE.DataTexture;
  private readonly data = new Uint8Array(W * ROWS * 4);
  private readonly shared = {
    uSgTex: { value: null as THREE.Texture | null },
    uSgNight: { value: 0 },
    uSgZ0: { value: 0 },
    uSgZLen: { value: 1 },
    uSgPole0: { value: 0 },
    uSgPoleStep: { value: 24 },
    uSgPoleX: { value: 12.6 },
    uSgFront: { value: 21 },
  };

  constructor(
    private readonly z0: number,
    private readonly z1: number,
    poleX: number
  ) {
    this.tex = new THREE.DataTexture(this.data, W, ROWS, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = THREE.ClampToEdgeWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.colorSpace = THREE.NoColorSpace; // linear light values, not sRGB colours
    this.shared.uSgTex.value = this.tex;
    this.shared.uSgZ0.value = z0;
    this.shared.uSgZLen.value = z1 - z0;
    this.shared.uSgPoleX.value = poleX;
  }

  /** Curb poles stand on a regular grid (first at `z0`, every `step` m) with some skipped near crossings. */
  setPoles(first: number, step: number, present: number[]): void {
    this.shared.uSgPole0.value = first;
    this.shared.uSgPoleStep.value = step;
    this.poles = present;
  }
  private poles: number[] = [];

  /** Fill the glow texture (call once after setPoles). */
  finish(): void {
    const texelM = (this.z1 - this.z0) / W;
    const toTex = (z: number) => (z - this.z0) / texelM;
    const base = new THREE.Color(0xffc690);
    const c = new THREE.Color();
    for (const side of [-1, 1] as const) {
      const r = new Float32Array(W);
      const g = new Float32Array(W);
      const bl = new Float32Array(W);
      // A low warm base everywhere (other people's signs, headlights, the general city glow)
      for (let i = 0; i < W; i++) {
        r[i] = base.r * 0.32;
        g[i] = base.g * 0.32;
        bl[i] = base.b * 0.32;
      }
      let seed = side > 0 ? 977 : 331;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      for (const f of FRONTS) {
        if (f.side !== side) continue;
        c.setHex(f.color); // linear (three's colour management converts hex from sRGB)
        const a = toTex(f.z0);
        const b2 = toTex(f.z1);
        for (let i = Math.max(0, Math.floor(a - 4)); i < Math.min(W, Math.ceil(b2 + 4)); i++) {
          // soft 4-texel (~7 m) edges so frontages blend into each other
          const w = Math.min(1, Math.max(0, (i - a + 4) / 8), Math.max(0, (b2 + 4 - i) / 8));
          r[i] = r[i] * (1 - w) + c.r * f.k * w;
          g[i] = g[i] * (1 - w) + c.g * f.k * w;
          bl[i] = bl[i] * (1 - w) + c.b * f.k * w;
        }
      }
      // Sharp rows: real frontages are discrete signs and dark gaps, so break the colour into ~4–9 m blocks
      const sr = new Float32Array(W);
      const sg = new Float32Array(W);
      const sb = new Float32Array(W);
      for (let i = 0; i < W; ) {
        const n = 2 + Math.floor(rand() * 4);
        const m = 0.35 + rand() * 1.0;
        for (let k = 0; k < n && i < W; k++, i++) {
          sr[i] = r[i] * m;
          sg[i] = g[i] * m;
          sb[i] = bl[i] * m;
        }
      }
      // Blurred rows: box blur ±7 texels (~13 m), twice (≈ a gaussian over ~25 m)
      const blur = (src: Float32Array) => {
        let out = src;
        for (let pass = 0; pass < 2; pass++) {
          const o = new Float32Array(W);
          for (let i = 0; i < W; i++) {
            let s = 0;
            let n = 0;
            for (let k = -7; k <= 7; k++) {
              const j = i + k;
              if (j < 0 || j >= W) continue;
              s += out[j];
              n++;
            }
            o[i] = s / n;
          }
          out = o;
        }
        return out;
      };
      const br = blur(r);
      const bg = blur(g);
      const bb = blur(bl);
      const rowSharp = side < 0 ? 0 : 1;
      const rowBlur = side < 0 ? 2 : 3;
      const put = (row: number, i: number, x: number, y: number, z: number, al: number) => {
        const o = (row * W + i) * 4;
        // stored at half scale so values up to 2.0 fit a byte
        this.data[o] = Math.min(255, Math.round(x * 127.5));
        this.data[o + 1] = Math.min(255, Math.round(y * 127.5));
        this.data[o + 2] = Math.min(255, Math.round(z * 127.5));
        this.data[o + 3] = Math.min(255, Math.round(al * 255));
      };
      for (let i = 0; i < W; i++) {
        const z = this.z0 + (i + 0.5) * texelM;
        const pole = this.poles.some((p) => Math.abs(p - z) < 3) ? 1 : 0;
        put(rowSharp, i, sr[i], sg[i], sb[i], pole);
        put(rowBlur, i, br[i], bg[i], bb[i], 1);
      }
    }
    this.tex.needsUpdate = true;
  }

  update(night: number): void {
    this.shared.uSgNight.value = night;
  }

  /** Add the night glow to a ground material (its geometry must lie flat, world-space y up). */
  apply(mat: THREE.MeshStandardMaterial, opts: StreetGlowOptions): void {
    const own = {
      uSgFill: { value: opts.fill },
      uSgPools: { value: opts.pools },
      uSgSheen: { value: opts.sheen },
      uSgLift: { value: opts.lift ?? 0 },
    };
    const shared = this.shared;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared, own);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSgWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n\tvSgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GLOW_PARS}`)
        .replace('#include <opaque_fragment>', `${GLOW_MAIN}\n#include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'street-glow-1';
    mat.needsUpdate = true;
  }
}

const GLOW_PARS = /* glsl */ `
varying vec3 vSgWorld;
uniform sampler2D uSgTex;
uniform float uSgNight, uSgZ0, uSgZLen, uSgPole0, uSgPoleStep, uSgPoleX, uSgFront;
uniform float uSgFill, uSgPools, uSgSheen, uSgLift;
vec3 sgRow(float z, float row) {
  return texture2D(uSgTex, vec2(clamp((z - uSgZ0) / uSgZLen, 0.0, 1.0), (row + 0.5) / 4.0)).rgb * 2.0;
}
float sgPole(float z, float row) {
  return texture2D(uSgTex, vec2(clamp((z - uSgZ0) / uSgZLen, 0.0, 1.0), (row + 0.5) / 4.0)).a;
}
// cos^3 pool under a lantern 8 m up, normalised to 1 straight below it
float sgPool(vec2 d) {
  float q = 64.0 / (64.0 + dot(d, d));
  return q * sqrt(q);
}
// Frontage colour seen in the road along reflected ray R from p, for the frontage plane at x = fx.
vec3 sgReflect(vec3 p, vec3 R, float fx, float rowSharp, float rowBlur, float rough) {
  float t = (fx - p.x) / R.x;
  if (t <= 0.0) return vec3(0.0);
  float y = R.y * t;
  float band = smoothstep(0.3, 3.0, y) * (1.0 - smoothstep(16.0, 55.0, y));
  float zh = p.z + R.z * t;
  float spread = clamp(t * (0.15 + rough) / 30.0, 0.0, 1.0);
  return mix(sgRow(zh, rowSharp), sgRow(zh, rowBlur), spread) * band;
}
`;

const GLOW_MAIN = /* glsl */ `
if (uSgNight > 0.001) {
  vec3 sgP = vSgWorld;
  // frontage spill: blurred frontage colour, falling off away from each side
  float dW = abs(sgP.x + uSgFront);
  float dE = abs(uSgFront - sgP.x);
  vec3 sgFill = sgRow(sgP.z, 2.0) / (1.0 + dW * dW * 0.006) + sgRow(sgP.z, 3.0) / (1.0 + dE * dE * 0.006);
  // street-lamp pools: the two nearest pole rows on each curb (twin lanterns 1.55 m either side of the pole)
  float sgK = floor((sgP.z - uSgPole0) / uSgPoleStep + 0.5);
  float sgPools = 0.0;
  for (int k = -1; k <= 1; k++) {
    float zp = uSgPole0 + (sgK + float(k)) * uSgPoleStep;
    float dz = sgP.z - zp;
    if (abs(dz) > 20.0) continue;
    float pw = sgPole(zp, 0.0);
    float pe = sgPole(zp, 1.0);
    vec2 lw = vec2(sgP.x + uSgPoleX, dz);
    vec2 le = vec2(sgP.x - uSgPoleX, dz);
    sgPools += pw * (sgPool(lw - vec2(0.0, 1.55)) + sgPool(lw + vec2(0.0, 1.55)));
    sgPools += pe * (sgPool(le - vec2(0.0, 1.55)) + sgPool(le + vec2(0.0, 1.55)));
  }
  vec3 sgLight = sgFill * uSgFill + vec3(1.0, 0.82, 0.6) * sgPools * uSgPools;
  outgoingLight += (diffuseColor.rgb + uSgLift) * sgLight * uSgNight;
  // reflected neon + lantern sheen
  if (uSgSheen > 0.0) {
    vec3 V = normalize(cameraPosition - sgP);
    vec3 R = vec3(-V.x, V.y, -V.z);
    float rough = clamp(roughnessFactor, 0.05, 1.0);
    float fres = 0.04 + 0.96 * pow(clamp(1.0 - V.y, 0.0, 1.0), 5.0);
    float gloss = 1.25 - rough;
    vec3 sgRefl = vec3(0.0);
    if (R.x < -0.002) sgRefl += sgReflect(sgP, R, -uSgFront, 0.0, 2.0, rough);
    if (R.x > 0.002) sgRefl += sgReflect(sgP, R, uSgFront, 1.0, 3.0, rough);
    // lanterns (8 m up on the curb poles) reflect as soft streaks running toward the viewer
    for (int s = 0; s < 2; s++) {
      if (abs(R.x) < 0.002) continue;
      float fx = s == 0 ? -uSgPoleX : uSgPoleX;
      float t = (fx - sgP.x) / R.x;
      if (t <= 0.0) continue;
      float y = R.y * t;
      float zh = sgP.z + R.z * t;
      float zp = uSgPole0 + floor((zh - uSgPole0) / uSgPoleStep + 0.5) * uSgPoleStep;
      float pres = sgPole(zp, float(s));
      float sy = 0.35 + t * 0.06 * rough;
      float dy = (y - 8.0) / sy;
      float dz = (abs(zh - zp) - 1.55) / (0.45 + t * 0.012);
      sgRefl += vec3(1.0, 0.8, 0.55) * 0.85 * pres * exp(-dy * dy - dz * dz);
    }
    outgoingLight += sgRefl * fres * gloss * uSgSheen * uSgNight;
  }
}
`;
