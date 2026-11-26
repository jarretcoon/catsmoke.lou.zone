import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { viewer, type WorldBuilder } from './builder';
import { R, THEME_COUNT, THEME_W, ATLAS, interiorAtlas, tickerTexture, uvRect, type Rect } from './interiorAtlas';

/*
 * Casino interior kit. Everything here lives in one group per casino that is added straight to the
 * scene and shown only while the camera is inside the floor or looking in through a doorway, so a
 * furnished casino costs nothing from the street. Inside, the whole floor is ~20 draw calls:
 * static dressing is merged per shared material, slot cabinets / screens / people are InstancedMeshes,
 * and every screen, topper, light strip, jackpot meter and wheel animates in one shader.
 */

// ---------------------------------------------------------------- shared materials
const vcCache = new Map<string, THREE.MeshStandardMaterial>();
/** Vertex-coloured standard material (merged dressing). */
export function vcMat(rough: number, metal = 0): THREE.MeshStandardMaterial {
  const key = `${rough}|${metal}`;
  let m = vcCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal });
    vcCache.set(key, m);
  }
  return m;
}
let _glow: THREE.MeshBasicMaterial | null = null;
/** Unlit vertex-coloured glow (can lights, neon, bottles, coves). */
export function glowMat(): THREE.MeshBasicMaterial {
  return (_glow ??= new THREE.MeshBasicMaterial({ vertexColors: true }));
}
let _add: THREE.MeshBasicMaterial | null = null;
/** Additive soft glow (air curtains, light pools, cove wash). */
export function additiveMat(): THREE.MeshBasicMaterial {
  return (_add ??= new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1, side: THREE.DoubleSide }));
}
let _glass: THREE.MeshStandardMaterial | null = null;
export function glassMat(): THREE.MeshStandardMaterial {
  return (_glass ??= new THREE.MeshStandardMaterial({ color: 0xcfe4ee, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
}
let _atlasLit: THREE.MeshStandardMaterial | null = null;
/** Lit atlas material; opaque atlas pixels are tinted by vertex colour (felts, awnings, banners). */
export function atlasLit(): THREE.MeshStandardMaterial {
  if (_atlasLit) return _atlasLit;
  const m = new THREE.MeshStandardMaterial({ map: interiorAtlas(), vertexColors: true, roughness: 0.85 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#if defined( USE_COLOR ) && defined( USE_MAP )
        diffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, step( 0.8, sampledDiffuseColor.a ) );
        diffuseColor.a = 1.0;
      #endif`
    );
  };
  m.customProgramCacheKey = () => 'casinoAtlasLit';
  _atlasLit = m;
  return m;
}
let _atlasGlow: THREE.MeshBasicMaterial | null = null;
/** Unlit atlas material for signs and screens (vertex colour scales brightness). */
export function atlasGlow(): THREE.MeshBasicMaterial {
  return (_atlasGlow ??= new THREE.MeshBasicMaterial({ map: interiorAtlas(), vertexColors: true }));
}
const texMats = new Map<THREE.Texture, THREE.Material>();
/** One cached material per tiling texture (UVs carry the tiling). */
export function texMat(t: THREE.Texture, kind: 'lit' | 'glow' | 'cutout' = 'lit', rough = 0.85): THREE.Material {
  let m = texMats.get(t);
  if (!m) {
    if (kind === 'glow') m = new THREE.MeshBasicMaterial({ map: t });
    else if (kind === 'cutout') m = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 });
    else m = new THREE.MeshStandardMaterial({ map: t, roughness: rough });
    texMats.set(t, m);
  }
  return m;
}

// ---------------------------------------------------------------- geometry collector
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _v = new THREE.Vector3();

function prep(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.index) {
    const idx = new Array<number>(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(idx);
  }
  g.clearGroups();
  _c.setHex(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Remap a geometry's 0..1 UVs into an atlas rect (canvas px). */
export function toRegion(g: THREE.BufferGeometry, r: Rect, flipU = false): THREE.BufferGeometry {
  const [u0, v0, du, dv] = uvRect(r);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (flipU ? 1 - uv.getX(i) : uv.getX(i)) * du, v0 + uv.getY(i) * dv);
  return g;
}
/** Scale UVs so a tiling texture repeats every `tile` metres. */
export function tileUV(g: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

/** Collects many small pieces (with a flat colour each) and emits one merged mesh per material. */
export class Kit {
  private readonly lists = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private cur: THREE.Matrix4 | null = null;
  private curRot = 0;

  /** Run `fn` with a local frame at (x, y, z) rotated ry about Y. Nested frames compose. */
  at(x: number, y: number, z: number, ry: number, fn: () => void): void {
    const prev = this.cur;
    const prevRot = this.curRot;
    const local = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    this.cur = prev ? prev.clone().multiply(local) : local;
    this.curRot = prevRot + ry;
    fn();
    this.cur = prev;
    this.curRot = prevRot;
  }
  /** World position of a local point in the current frame. */
  world(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.set(x, y, z);
    if (this.cur) out.applyMatrix4(this.cur);
    return out;
  }
  worldRot(ry: number): number {
    return this.curRot + ry;
  }
  add(g: THREE.BufferGeometry, m: THREE.Material, color = 0xffffff, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0): void {
    prep(g, color);
    if (rx || ry || rz) g.applyMatrix4(_m.makeRotationFromEuler(_e.set(rx, ry, rz, 'YXZ')));
    if (x || y || z) g.translate(x, y, z);
    if (this.cur) g.applyMatrix4(this.cur);
    let l = this.lists.get(m);
    if (!l) {
      l = [];
      this.lists.set(m, l);
    }
    l.push(g);
  }
  /** Box centred at (x, y, z). */
  box(m: THREE.Material, color: number, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, rx = 0, rz = 0): void {
    this.add(new THREE.BoxGeometry(w, h, d), m, color, x, y, z, ry, rx, rz);
  }
  cyl(m: THREE.Material, color: number, x: number, y: number, z: number, rTop: number, rBot: number, h: number, seg = 10, ry = 0, rx = 0, rz = 0): void {
    this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), m, color, x, y, z, ry, rx, rz);
  }
  /** Flat quad facing +z (before rotation), optionally mapped to an atlas rect. */
  quad(m: THREE.Material, color: number, x: number, y: number, z: number, w: number, h: number, ry = 0, region?: Rect, rx = 0): void {
    const g = new THREE.PlaneGeometry(w, h);
    if (region) toRegion(g, region);
    this.add(g, m, color, x, y, z, ry, rx);
  }
  /** Double-sided sign: dark box with an atlas face on both sides. */
  sign(region: Rect, x: number, y: number, z: number, w: number, h: number, ry = 0, frame = 0x101014, bright = 0xc8c8c8, depth = 0.12): void {
    this.box(vcMat(0.5, 0.4), frame, x, y, z, w + 0.1, h + 0.1, depth, ry);
    this.at(x, y, z, ry, () => {
      this.quad(atlasGlow(), bright, 0, 0, depth / 2 + 0.006, w, h, 0, region);
      this.quad(atlasGlow(), bright, 0, 0, -depth / 2 - 0.006, w, h, Math.PI, region);
    });
  }
  /** Ceiling can light: a small glowing disc facing down. */
  can(x: number, y: number, z: number, r = 0.13, color = 0xfff2d6): void {
    const g = new THREE.CircleGeometry(r, 10);
    g.rotateX(Math.PI / 2);
    this.add(g, glowMat(), color, x, y, z);
    const ring = new THREE.RingGeometry(r, r * 1.45, 10);
    ring.rotateX(Math.PI / 2);
    this.add(ring, vcMat(0.3, 0.8), 0x8a8a90, x, y + 0.005, z);
  }
  isEmpty(): boolean {
    return this.lists.size === 0;
  }
  flush(parent: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [m, geos] of this.lists) {
      if (!geos.length) continue;
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (geos.length > 1) for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const me = new THREE.Mesh(merged, m);
      me.receiveShadow = false; // the roof blocks the sun; skip shadow-map sampling indoors
      me.matrixAutoUpdate = false;
      me.updateMatrix();
      parent.add(me);
      out.push(me);
    }
    this.lists.clear();
    return out;
  }
}

// ---------------------------------------------------------------- shared animation clock
const clock = { value: 0 };
const clocked = new WeakSet<WorldBuilder>();
function ensureClock(b: WorldBuilder): void {
  if (clocked.has(b)) return;
  clocked.add(b);
  b.every((_dt, t) => {
    clock.value = t % 7200;
  });
}

// ---------------------------------------------------------------- slot machines (instanced)
const SLOT_VS = /* glsl */ `
attribute vec4 aRegion;
attribute float aPart;
attribute vec4 aInfo;
attribute vec3 aAccent;
varying vec2 vUv;
varying vec4 vRegion;
varying float vPart;
varying vec4 vInfo;
varying vec3 vAccent;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vRegion = aRegion;
  vPart = aPart < 0.0 ? aInfo.w : aPart;
  vInfo = aInfo;
  vAccent = aAccent;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}`;

const SLOT_FS = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime;
uniform float uThemeDU;
uniform vec4 uReels;
uniform vec4 uDigits;
uniform vec4 uWheel;
varying vec2 vUv;
varying vec4 vRegion;
varying float vPart;
varying vec4 vInfo;
varying vec3 vAccent;
#include <common>
#include <logdepthbuf_pars_fragment>
float h1( float n ) { return fract( sin( n ) * 43758.5453123 ); }
void main() {
  #include <logdepthbuf_fragment>
  vec2 dUx = dFdx( vUv );
  vec2 dUy = dFdy( vUv );
  float theme = vInfo.x;
  float seed = vInfo.y;
  float played = vInfo.z;
  float part = floor( vPart + 0.5 );
  float shift = theme * uThemeDU;
  float period = 6.0 + seed * 6.0;
  float tt = uTime + seed * 97.0;
  float cyc = floor( tt / period );
  float tc = tt - cyc * period;
  float lastStop = 2.5;
  float win = played * step( 0.8, h1( cyc * 1.37 + seed * 11.0 ) ) * step( lastStop, tc ) * step( tc, lastStop + 2.6 );
  float flash = win * ( 0.5 + 0.5 * sin( uTime * 18.0 ) );
  vec3 col = vec3( 0.0 );
  if ( part < 0.5 ) {
    vec2 uv = vUv;
    if ( uv.x > 0.06 && uv.x < 0.94 && uv.y > 0.05 && uv.y < 0.47 ) {
      vec2 w = vec2( ( uv.x - 0.06 ) / 0.88, ( uv.y - 0.05 ) / 0.42 );
      float ci = floor( w.x * 5.0 );
      float lu = fract( w.x * 5.0 );
      float stopT = 1.3 + ci * 0.3;
      float stopPos = floor( h1( cyc * 7.1 + ci * 3.3 + seed * 17.0 ) * 16.0 );
      float spin = played > 0.5 ? max( 0.0, stopT - tc ) : 0.0;
      float s = ( win > 0.5 ? floor( h1( cyc + seed ) * 16.0 ) : stopPos ) - spin * 15.0;
      float sym = ( 1.0 - w.y ) * 3.0 + s;
      float idx = mod( floor( sym ) + ( win > 0.5 ? 0.0 : ci * 5.0 ), 16.0 );
      float ft = fract( sym );
      vec2 cell = vec2( mod( idx, 4.0 ), floor( idx / 4.0 ) );
      vec2 suv = vec2( uReels.x + shift + ( cell.x + lu ) * uReels.z * 0.25, uReels.y + ( 4.0 - cell.y - ft ) * uReels.w * 0.25 );
      vec2 kx = vec2( 5.0 * uReels.z * 0.25 / 0.88, 3.0 * uReels.w * 0.25 / 0.42 );
      col = textureGrad( uAtlas, suv, dUx * kx, dUy * kx ).rgb;
      col *= 0.55 + 0.45 * smoothstep( 0.0, 0.1, lu ) * smoothstep( 1.0, 0.9, lu );
      col *= 1.0 - 0.2 * step( 0.001, spin );
      col += flash * vec3( 1.0, 0.8, 0.2 ) * ( 0.3 + 0.7 * step( abs( w.y - 0.5 ), 0.03 ) );
    } else {
      col = texture2D( uAtlas, vRegion.xy + vec2( shift, 0.0 ) + uv * vRegion.zw ).rgb;
      col += flash * vec3( 0.35, 0.25, 0.05 );
    }
    float sw = fract( uTime * 0.17 + seed );
    col += vec3( 0.16 ) * smoothstep( 0.07, 0.0, abs( uv.x * 0.6 + uv.y * 0.4 - sw * 1.6 + 0.3 ) ) * ( 1.0 - played * 0.6 );
  } else if ( part < 1.5 ) {
    col = texture2D( uAtlas, vRegion.xy + vec2( shift, 0.0 ) + vUv * vRegion.zw ).rgb;
    col *= 0.85 + 0.15 * sin( uTime * 2.0 + seed * 9.0 );
    col += flash * vec3( 0.6, 0.5, 0.2 );
  } else if ( part < 2.5 ) {
    float chase = 0.55 + 0.45 * sin( vUv.y * 18.0 - uTime * 5.0 + seed * 7.0 );
    col = vAccent * chase + flash * vec3( 1.0, 0.9, 0.5 );
  } else if ( part < 3.5 ) {
    col = texture2D( uAtlas, vRegion.xy + vec2( shift, 0.0 ) + vUv * vRegion.zw ).rgb * 0.9;
  } else if ( part < 4.5 ) {
    vec2 p = vUv - 0.5;
    float r2 = dot( p, p );
    if ( r2 > 0.25 ) discard;
    float a = uTime * ( 0.3 + seed * 0.3 ) + seed * 6.28;
    float cs = cos( a );
    float sn = sin( a );
    vec2 q = vec2( cs * p.x - sn * p.y, sn * p.x + cs * p.y ) * 0.98 + 0.5;
    col = texture2D( uAtlas, uWheel.xy + q * uWheel.zw ).rgb;
    float r = sqrt( r2 );
    float bulbs = step( 0.455, r ) * step( 0.0, sin( atan( p.y, p.x + 1e-4 ) * 24.0 + uTime * 8.0 ) );
    col = mix( col, vec3( 1.0, 0.9, 0.55 ), bulbs );
  } else if ( part < 5.5 ) {
    float k = floor( vUv.x * 11.0 );
    float lu = fract( vUv.x * 11.0 );
    float v = floor( 1000000.0 * ( 0.4 + seed * 1.2 ) ) + floor( uTime * ( 2.0 + seed * 5.0 ) );
    float cents = mod( floor( uTime * 37.0 * ( 1.0 + seed ) ), 100.0 );
    float g = 10.0;
    if ( k > 0.5 && k < 7.5 ) g = mod( floor( v / pow( 10.0, 7.0 - k ) ), 10.0 );
    else if ( k > 7.5 && k < 8.5 ) g = 11.0;
    else if ( k > 8.5 && k < 9.5 ) g = floor( cents / 10.0 );
    else if ( k > 9.5 ) g = mod( cents, 10.0 );
    vec2 duv = vec2( uDigits.x + ( g + lu ) * uDigits.z / 12.0, uDigits.y + vUv.y * uDigits.w );
    col = texture2D( uAtlas, duv ).rgb * 1.15;
  } else {
    float bi = floor( vUv.x * 6.0 );
    float lu = fract( vUv.x * 6.0 );
    float m3 = mod( bi, 3.0 );
    vec3 bc = m3 < 0.5 ? vec3( 1.0, 0.3, 0.2 ) : ( m3 < 1.5 ? vec3( 1.0, 0.85, 0.2 ) : vec3( 0.3, 0.8, 1.0 ) );
    if ( bi > 4.5 ) bc = vec3( 0.2, 1.0, 0.4 );
    float on = step( 0.15, lu ) * step( lu, 0.85 ) * step( 0.2, vUv.y ) * step( vUv.y, 0.8 );
    col = mix( vec3( 0.04 ), bc * ( 0.55 + 0.45 * step( 0.5, fract( uTime * 1.3 + bi * 0.37 + seed ) ) ), on );
  }
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

let _slotGlow: THREE.ShaderMaterial | null = null;
function slotGlowMat(): THREE.ShaderMaterial {
  if (_slotGlow) return _slotGlow;
  const wheelR: Rect = [R.wheelBig[0] + 24, R.wheelBig[1], 208, 208];
  _slotGlow = new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: interiorAtlas() },
      uTime: clock,
      uThemeDU: { value: THEME_W / ATLAS },
      uReels: { value: new THREE.Vector4(...uvRect(R.reels)) },
      uDigits: { value: new THREE.Vector4(...uvRect(R.digits)) },
      uWheel: { value: new THREE.Vector4(...uvRect(wheelR)) },
    },
    vertexShader: SLOT_VS,
    fragmentShader: SLOT_FS,
  });
  return _slotGlow;
}

let _tintMat: THREE.MeshStandardMaterial | null = null;
/** Cabinet bodies: vertex colours, pure-white vertices take the per-instance accent colour. */
function tintBodyMat(): THREE.MeshStandardMaterial {
  if (_tintMat) return _tintMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.45 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace(
      '#include <color_vertex>',
      `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
        vColor = vec4( 1.0 );
      #endif
      #ifdef USE_COLOR
        vColor.rgb *= color.rgb;
      #endif
      #ifdef USE_INSTANCING_COLOR
        if ( color.r > 0.99 && color.g > 0.99 && color.b > 0.99 ) vColor.rgb = instanceColor.rgb;
      #endif`
    );
  };
  m.customProgramCacheKey = () => 'casinoTintBody';
  _tintMat = m;
  return m;
}

/** Builds a merged geometry (with vertex colours) from parts in a local frame. */
class Geo {
  readonly parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): void {
    prep(g, color);
    if (rx || ry || rz) g.applyMatrix4(_m.makeRotationFromEuler(_e.set(rx, ry, rz, 'YXZ')));
    g.translate(x, y, z);
    this.parts.push(g);
  }
  box(color: number, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0): void {
    this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
  }
  cyl(color: number, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 10, rx = 0, rz = 0): void {
    this.add(new THREE.CylinderGeometry(r0, r1, h, seg), color, x, y, z, rx, 0, rz);
  }
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    g.computeBoundingSphere();
    return g;
  }
}

/** Glow-geometry builder: quads/strips carrying an atlas rect + a part id for the slot shader. */
class GlowGeo {
  private pos: number[] = [];
  private uv: number[] = [];
  private region: number[] = [];
  private part: number[] = [];
  private idx: number[] = [];
  /** A strip of quads given bottom/top edge points per row (rows bottom→top), u across 0..1. */
  strip(rows: Array<[THREE.Vector3, THREE.Vector3]>, part: number, r?: Rect, v0 = 0, v1 = 1): void {
    const reg = r ? uvRect(r) : [0, 0, 0, 0];
    const base = this.pos.length / 3;
    rows.forEach(([a, c], i) => {
      const v = v0 + ((v1 - v0) * i) / (rows.length - 1);
      this.pos.push(a.x, a.y, a.z, c.x, c.y, c.z);
      this.uv.push(0, v, 1, v);
      for (let k = 0; k < 2; k++) {
        this.region.push(...reg);
        this.part.push(part);
      }
    });
    for (let i = 0; i < rows.length - 1; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  /** Axis quad in the XY plane at depth z, rotated rx about X around its centre. */
  quad(cx: number, cy: number, z: number, w: number, h: number, part: number, r?: Rect, rx = 0, v0 = 0, v1 = 1): void {
    const c = Math.cos(rx);
    const s = Math.sin(rx);
    const p = (dy: number) => new THREE.Vector3(0, cy + dy * c, z - dy * s);
    const lo = p(-h / 2);
    const hi = p(h / 2);
    this.strip(
      [
        [new THREE.Vector3(cx - w / 2, lo.y, lo.z), new THREE.Vector3(cx + w / 2, lo.y, lo.z)],
        [new THREE.Vector3(cx - w / 2, hi.y, hi.z), new THREE.Vector3(cx + w / 2, hi.y, hi.z)],
      ],
      part,
      r,
      v0,
      v1
    );
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aRegion', new THREE.Float32BufferAttribute(this.region, 4));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export type SlotStyle = 'video' | 'wheel';
export interface SlotPlacement {
  x: number;
  z: number;
  rot: number;
  theme: number;
  style: SlotStyle;
  accent: number;
  played: boolean;
  stool?: boolean;
}

const bodyGeos = new Map<string, THREE.BufferGeometry>();
function slotBodyGeo(style: SlotStyle, seat: number): THREE.BufferGeometry {
  const key = `${style}|${seat}`;
  let g = bodyGeos.get(key);
  if (g) return g;
  const b = new Geo();
  const black = 0x0e0f14;
  const deck = 0x24262e;
  const chrome = 0x9aa0aa;
  b.box(0x15161c, 0, 0.31, -0.02, 0.86, 0.62, 0.62);
  b.box(0xffffff, 0, 0.64, 0.29, 0.88, 0.04, 0.05); // accent rail
  b.box(deck, 0, 0.73, 0.2, 0.86, 0.1, 0.42, -0.18);
  b.box(0x2a2c34, 0.3, 0.97, 0.06, 0.14, 0.12, 0.08);
  if (style === 'video') {
    b.box(black, 0, 1.4, -0.17, 0.86, 1.3, 0.4);
    b.box(0x08090c, 0, 1.4, 0.045, 0.84, 1.16, 0.04);
    b.box(0xffffff, 0, 2.16, -0.1, 0.86, 0.36, 0.36);
    b.box(chrome, 0, 2.36, -0.1, 0.88, 0.04, 0.38);
  } else {
    b.box(black, 0, 1.25, -0.14, 0.86, 1.0, 0.4);
    b.box(0xffffff, 0, 1.82, -0.14, 0.88, 0.14, 0.42);
    b.cyl(0xffffff, 0, 2.3, -0.12, 0.47, 0.47, 0.22, 24, Math.PI / 2);
    b.cyl(chrome, 0, 1.92, -0.12, 0.08, 0.1, 0.2, 8);
  }
  // stool with a low back
  b.cyl(chrome, 0, 0.32, 0.86, 0.04, 0.05, 0.6, 8);
  b.cyl(0x2a2c30, 0, 0.02, 0.86, 0.22, 0.24, 0.04, 12);
  b.cyl(seat, 0, 0.66, 0.86, 0.25, 0.23, 0.12, 14);
  b.box(seat, 0, 0.92, 1.08, 0.4, 0.34, 0.07, 0.12);
  g = b.build();
  bodyGeos.set(key, g);
  return g;
}

const glowGeos = new Map<SlotStyle, THREE.BufferGeometry>();
function slotGlowGeo(style: SlotStyle): THREE.BufferGeometry {
  let g = glowGeos.get(style);
  if (g) return g;
  const q = new GlowGeo();
  if (style === 'video') {
    // tall screen that curves back at the top (J-curve cabinet)
    const rows: Array<[THREE.Vector3, THREE.Vector3]> = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const y = 0.86 + t * 1.08;
      const z = 0.135 - 0.06 * t * t;
      rows.push([new THREE.Vector3(-0.38, y, z), new THREE.Vector3(0.38, y, z)]);
    }
    q.strip(rows, 0, R.screen);
    q.quad(0, 2.16, 0.084, 0.8, 0.3, 1, R.topper);
    for (const sx of [-0.415, 0.415]) q.quad(sx, 1.4, 0.07, 0.025, 1.12, 2);
  } else {
    q.quad(0, 1.02 + 0.3, 0.1, 0.76, 0.52, 0, R.screen, -0.12, 0, 0.5);
    q.quad(0, 1.82, 0.215, 0.82, 0.08, 2);
    q.quad(0, 2.3, -0.005, 0.86, 0.86, 4);
  }
  q.quad(0, 0.36, 0.317, 0.78, 0.36, 3, R.bankSign);
  q.quad(0, 0.785, 0.31, 0.7, 0.12, 6, undefined, -Math.PI / 2 + 0.18);
  q.quad(0.3, 0.97, 0.104, 0.1, 0.03, 2);
  g = q.build();
  glowGeos.set(style, g);
  return g;
}

let fxGeo: THREE.BufferGeometry | null = null;
/** Unit quad whose part comes from the instance (jackpot meters, big wheels). */
function fxQuadGeo(): THREE.BufferGeometry {
  if (fxGeo) return fxGeo;
  const q = new GlowGeo();
  q.quad(0, 0, 0, 1, 1, -1);
  fxGeo = q.build();
  return fxGeo;
}

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);

function setInfo(geo: THREE.InstancedBufferAttribute, i: number, x: number, y: number, z: number, w: number): void {
  geo.setXYZW(i, x, y, z, w);
}

/** Builds the instanced cabinets + glow for a list of slot placements (two meshes per style). */
export function buildSlots(group: THREE.Group, list: SlotPlacement[], seat: number): void {
  for (const style of ['video', 'wheel'] as SlotStyle[]) {
    const items = list.filter((s) => s.style === style);
    if (!items.length) continue;
    const body = new THREE.InstancedMesh(slotBodyGeo(style, seat), tintBodyMat(), items.length);
    const glowGeo = slotGlowGeo(style).clone();
    const info = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 4), 4);
    const acc = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 3), 3);
    glowGeo.setAttribute('aInfo', info);
    glowGeo.setAttribute('aAccent', acc);
    const glow = new THREE.InstancedMesh(glowGeo, slotGlowMat(), items.length);
    items.forEach((s, i) => {
      _q.setFromAxisAngle(_y, s.rot);
      _m.compose(_p.set(s.x, 0, s.z), _q, _s);
      body.setMatrixAt(i, _m);
      glow.setMatrixAt(i, _m);
      _c.setHex(s.accent);
      body.setColorAt(i, _c);
      setInfo(info, i, s.theme % THEME_COUNT, ((i * 0.618034 + s.x * 0.13 + s.z * 0.07) % 1 + 1) % 1, s.played ? 1 : 0, 0);
      acc.setXYZ(i, _c.r * 1.6, _c.g * 1.6, _c.b * 1.6);
    });
    body.computeBoundingSphere();
    glow.computeBoundingSphere();
    body.receiveShadow = false;
    group.add(body, glow);
  }
}

export interface FxPlacement {
  kind: 'meter' | 'wheel';
  x: number;
  y: number;
  z: number;
  rot: number;
  w: number;
  h: number;
}
export function buildFx(group: THREE.Group, list: FxPlacement[]): void {
  if (!list.length) return;
  const geo = fxQuadGeo().clone();
  const info = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4);
  const acc = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
  geo.setAttribute('aInfo', info);
  geo.setAttribute('aAccent', acc);
  const mesh = new THREE.InstancedMesh(geo, slotGlowMat(), list.length);
  list.forEach((f, i) => {
    _q.setFromAxisAngle(_y, f.rot);
    _m.compose(_p.set(f.x, f.y, f.z), _q, _v.set(f.w, f.h, 1));
    mesh.setMatrixAt(i, _m);
    setInfo(info, i, 0, (i * 0.37 + 0.11) % 1, 1, f.kind === 'meter' ? 5 : 4);
  });
  mesh.computeBoundingSphere();
  group.add(mesh);
}

// ---------------------------------------------------------------- people (instanced)
const SHIRT = 0xffffff;
const SKIN = 0xff00ff;
const HAIR = 0x00ffff;
const VEST = 0xffff00;

let _figMat: THREE.MeshStandardMaterial | null = null;
function figureMat(): THREE.MeshStandardMaterial {
  if (_figMat) return _figMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSkin;\nattribute vec3 aHair;\nattribute vec3 aVest;')
      .replace(
        '#include <color_vertex>',
        `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor = vec4( 1.0 );
        #endif
        #ifdef USE_COLOR
          vColor.rgb *= color.rgb;
        #endif
        #ifdef USE_INSTANCING_COLOR
          bool hiR = color.r > 0.99; bool hiG = color.g > 0.99; bool hiB = color.b > 0.99;
          bool loR = color.r < 0.01; bool loG = color.g < 0.01; bool loB = color.b < 0.01;
          if ( hiR && hiG && hiB ) vColor.rgb = instanceColor.rgb;
          else if ( hiR && loG && hiB ) vColor.rgb = aSkin;
          else if ( loR && hiG && hiB ) vColor.rgb = aHair;
          else if ( hiR && hiG && loB ) vColor.rgb = aVest;
        #endif`
      );
  };
  m.customProgramCacheKey = () => 'casinoFigure';
  _figMat = m;
  return m;
}

export type Pose = 'stand' | 'sit' | 'server';
const figGeos = new Map<Pose, THREE.BufferGeometry>();
function figureGeo(pose: Pose): THREE.BufferGeometry {
  let g = figGeos.get(pose);
  if (g) return g;
  const b = new Geo();
  const pants = 0x22252c;
  const shoe = 0x121316;
  const head = (y: number, z: number) => {
    b.cyl(SKIN, 0, y - 0.15, z, 0.055, 0.06, 0.09, 6);
    const hg = new THREE.SphereGeometry(0.125, 8, 6);
    hg.scale(1, 1.15, 1.05);
    b.add(hg, SKIN, 0, y, z);
    const hair = new THREE.SphereGeometry(0.135, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55);
    hair.scale(1, 1.05, 1.08);
    b.add(hair, HAIR, 0, y + 0.03, z - 0.012);
  };
  if (pose === 'sit') {
    for (const s of [-1, 1]) {
      b.box(shoe, s * 0.1, 0.04, 0.48, 0.12, 0.08, 0.25);
      b.box(pants, s * 0.1, 0.33, 0.42, 0.13, 0.5, 0.14);
      b.box(pants, s * 0.1, 0.73, 0.2, 0.15, 0.15, 0.46);
      b.box(SHIRT, s * 0.27, 1.12, 0.04, 0.11, 0.32, 0.13, -0.5);
      b.box(SHIRT, s * 0.24, 0.98, 0.24, 0.1, 0.1, 0.3);
      b.box(SKIN, s * 0.22, 0.97, 0.43, 0.09, 0.09, 0.1);
    }
    b.box(pants, 0, 0.74, -0.04, 0.38, 0.14, 0.24);
    b.box(SHIRT, 0, 1.06, -0.02, 0.42, 0.56, 0.23, 0.08);
    b.box(VEST, 0, 1.06, 0.1, 0.36, 0.42, 0.02, 0.08);
    head(1.48, 0.04);
  } else {
    for (const s of [-1, 1]) {
      b.box(shoe, s * 0.1, 0.04, 0.03, 0.13, 0.08, 0.27);
      b.box(pants, s * 0.1, 0.47, 0, 0.15, 0.78, 0.17);
      if (pose === 'server' && s > 0) {
        b.box(SHIRT, 0.29, 1.32, 0.12, 0.11, 0.11, 0.36);
        b.box(SKIN, 0.29, 1.35, 0.32, 0.09, 0.1, 0.1);
      } else {
        b.box(SHIRT, s * 0.27, 1.2, 0, 0.11, 0.56, 0.13);
        b.box(SKIN, s * 0.27, 0.87, 0, 0.09, 0.11, 0.1);
      }
    }
    b.box(pants, 0, 0.88, 0, 0.38, 0.14, 0.2);
    b.box(SHIRT, 0, 1.22, 0, 0.42, 0.56, 0.23);
    b.box(VEST, 0, 1.2, 0.118, 0.36, 0.42, 0.02);
    head(1.68, 0);
    if (pose === 'server') {
      b.cyl(0xc8ccd4, 0.3, 1.41, 0.34, 0.2, 0.2, 0.025, 14);
      b.cyl(0xff5a8a, 0.24, 1.5, 0.3, 0.035, 0.03, 0.14, 8);
      b.cyl(0xffcf5a, 0.36, 1.5, 0.4, 0.035, 0.03, 0.14, 8);
      b.cyl(0x8ad8ff, 0.3, 1.49, 0.44, 0.03, 0.03, 0.12, 8);
    }
  }
  g = b.build();
  figGeos.set(pose, g);
  return g;
}

export interface Person {
  x: number;
  y?: number;
  z: number;
  rot: number;
  shirt: number;
  vest?: number;
  skin?: number;
  hair?: number;
}
const SKINS = [0xf2c7a5, 0xe0ac86, 0xc68a62, 0x9a6440, 0x6e4a32, 0xf6d8c0];
const HAIRS = [0x1a1410, 0x3a2614, 0x6a4424, 0xc89a5a, 0x8a8a8a, 0x2a1a10, 0xa04a1a];
export const GUEST_SHIRTS = [0x2a5ad8, 0xd83a3a, 0x2a9a5a, 0xf2f2f2, 0x1a1a1a, 0xe8a02a, 0x8a3ad8, 0x3ab8c8, 0xd86aa8, 0x5a6a3a, 0xc8c0a8];

function fillPeople(mesh: THREE.InstancedMesh, list: Person[]): void {
  const geo = mesh.geometry;
  const skin = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
  const hair = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
  const vest = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
  geo.setAttribute('aSkin', skin);
  geo.setAttribute('aHair', hair);
  geo.setAttribute('aVest', vest);
  list.forEach((p, i) => {
    _q.setFromAxisAngle(_y, p.rot);
    _m.compose(_p.set(p.x, p.y ?? 0, p.z), _q, _s);
    mesh.setMatrixAt(i, _m);
    _c.setHex(p.shirt);
    mesh.setColorAt(i, _c);
    _c.setHex(p.skin ?? SKINS[(i * 7 + Math.round(p.x * 3)) % SKINS.length]);
    skin.setXYZ(i, _c.r, _c.g, _c.b);
    _c.setHex(p.hair ?? HAIRS[(i * 5 + Math.round(p.z * 3)) % HAIRS.length]);
    hair.setXYZ(i, _c.r, _c.g, _c.b);
    _c.setHex(p.vest ?? p.shirt);
    vest.setXYZ(i, _c.r, _c.g, _c.b);
  });
}

export function buildPeople(group: THREE.Group, pose: Pose, list: Person[]): THREE.InstancedMesh | null {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(figureGeo(pose).clone(), figureMat(), list.length);
  fillPeople(mesh, list);
  mesh.computeBoundingSphere();
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

/** People walking a closed loop (cocktail servers, strolling guests). */
export class Walkers {
  readonly mesh: THREE.InstancedMesh;
  private readonly seg: Array<{ ax: number; az: number; dx: number; dz: number; len: number; at: number }> = [];
  private readonly total: number;
  constructor(
    group: THREE.Group,
    pose: Pose,
    private readonly people: Array<Person & { speed: number; phase: number }>,
    loop: Array<[number, number]>
  ) {
    this.mesh = new THREE.InstancedMesh(figureGeo(pose).clone(), figureMat(), people.length);
    fillPeople(this.mesh, people);
    let acc = 0;
    for (let i = 0; i < loop.length; i++) {
      const [ax, az] = loop[i];
      const [bx, bz] = loop[(i + 1) % loop.length];
      const len = Math.hypot(bx - ax, bz - az);
      this.seg.push({ ax, az, dx: (bx - ax) / (len || 1), dz: (bz - az) / (len || 1), len, at: acc });
      acc += len;
    }
    this.total = Math.max(1, acc);
    this.mesh.frustumCulled = false;
    group.add(this.mesh);
  }
  update(t: number): void {
    this.people.forEach((p, i) => {
      let d = (p.phase * this.total + t * p.speed) % this.total;
      if (p.speed < 0) d = (d + this.total) % this.total;
      let s = this.seg[this.seg.length - 1];
      for (const sg of this.seg) {
        if (d >= sg.at && d < sg.at + sg.len) {
          s = sg;
          break;
        }
      }
      const k = d - s.at;
      const dir = p.speed < 0 ? -1 : 1;
      _q.setFromAxisAngle(_y, Math.atan2(s.dx * dir, s.dz * dir));
      _m.compose(_p.set(s.ax + s.dx * k, Math.abs(Math.sin(t * 7 + i)) * 0.03, s.az + s.dz * k), _q, _s);
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- tables
export interface TableLook {
  felt: number;
  rail: number;
  wood: number;
  trim: number;
  seat: number;
  dealerShirt: number;
  dealerVest: number;
}

const CHIP_COLS = [0xd8202a, 0x2a5ad8, 0x2a9a3a, 0x111111, 0xf2f2f2, 0x8a3ad8, 0xf2c23a];
function chipStacks(k: Kit, x: number, y: number, z: number, n: number, seed: number): void {
  for (let i = 0; i < n; i++) {
    const h = 0.03 + ((i * 7 + seed) % 5) * 0.025;
    k.cyl(vcMat(0.4), CHIP_COLS[(i + seed) % CHIP_COLS.length], x + (i % 6) * 0.085 - 0.21, y + h / 2, z + Math.floor(i / 6) * 0.09, 0.038, 0.038, h, 10);
  }
}
function chair(k: Kit, x: number, z: number, ry: number, seat: number): void {
  k.at(x, 0, z, ry, () => {
    k.cyl(vcMat(0.3, 0.8), 0x8a8e96, 0, 0.32, 0, 0.04, 0.05, 0.62, 8);
    k.cyl(vcMat(0.6), seat, 0, 0.68, 0, 0.26, 0.24, 0.12, 12);
    k.box(vcMat(0.6), seat, 0, 0.98, -0.24, 0.46, 0.46, 0.08, 0, -0.1);
    k.cyl(vcMat(0.4), 0x2a2a30, 0, 0.02, 0, 0.24, 0.26, 0.04, 12);
  });
}

export interface PeopleLists {
  seated: Person[];
  standing: Person[];
}

function rngFrom(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 7;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Blackjack: arc toward +z (players), dealer on the flat side. */
export function blackjack(k: Kit, x: number, z: number, rot: number, look: TableLook, ppl: PeopleLists, seed: number, limit: Rect): void {
  const rnd = rngFrom(seed);
  k.at(x, 0, z, rot, () => {
    k.box(vcMat(0.5), look.wood, 0, 0.38, 0.35, 1.9, 0.76, 0.7);
    const top = new THREE.CircleGeometry(1.55, 28, Math.PI, Math.PI);
    top.rotateX(-Math.PI / 2);
    remapPlanar(top, R.feltBJ, -1.55, 1.55, 0, 1.55);
    k.add(top, atlasLit(), look.felt, 0, 0.83, 0);
    const rail = new THREE.TorusGeometry(1.58, 0.085, 6, 28, Math.PI);
    rail.rotateX(Math.PI / 2);
    k.add(rail, vcMat(0.55), look.rail, 0, 0.83, 0);
    const edge = new THREE.CylinderGeometry(1.5, 1.5, 0.06, 28, 1, true, -Math.PI / 2, Math.PI);
    k.add(edge, vcMat(0.4, 0.6), look.trim, 0, 0.79, 0);
    k.box(vcMat(0.5), look.wood, 0, 0.8, -0.03, 3.2, 0.1, 0.08);
    k.box(vcMat(0.35, 0.5), 0x18181c, 0, 0.87, 0.16, 0.66, 0.05, 0.24);
    chipStacks(k, 0, 0.9, 0.08, 12, seed);
    k.box(vcMat(0.4), 0x7a1a1a, 0.62, 0.9, 0.25, 0.16, 0.1, 0.34, 0.5);
    k.box(vcMat(0.4), 0x2a2a30, -0.62, 0.9, 0.24, 0.14, 0.14, 0.14);
    k.cyl(vcMat(0.3, 0.8), look.trim, -0.95, 1.15, 0.05, 0.02, 0.02, 0.6, 6);
    k.sign(limit, -0.95, 1.55, 0.05, 0.32, 0.24, 0, 0x101010, 0xffffff, 0.04);
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + ((i + 0.5) / 6) * Math.PI;
      const cx = Math.sin(a) * 2.05;
      const cz = Math.cos(a) * 2.05;
      chair(k, cx, cz, a + Math.PI, look.seat);
      if (rnd() < 0.5) {
        const w = k.world(cx, 0, cz);
        ppl.seated.push({ x: w.x, z: w.z, rot: k.worldRot(a + Math.PI), shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
        // the player's chips
        chipStacks(k, Math.sin(a) * 1.25, 0.86, Math.cos(a) * 1.25, 3, i + seed);
      }
    }
    const d = k.world(0, 0, -0.45);
    ppl.standing.push({ x: d.x, z: d.z, rot: k.worldRot(0), shirt: look.dealerShirt, vest: look.dealerVest });
  });
}

/** Roulette: layout along x, wheel at −x. Returns the wheel head's world position for spinning. */
export function roulette(k: Kit, x: number, z: number, rot: number, look: TableLook, ppl: PeopleLists, seed: number, limit: Rect): { x: number; y: number; z: number } {
  const rnd = rngFrom(seed + 11);
  let wheel = { x: 0, y: 0, z: 0 };
  k.at(x, 0, z, rot, () => {
    k.box(vcMat(0.5), look.wood, 0.2, 0.4, 0, 3.0, 0.8, 1.2);
    const top = new THREE.PlaneGeometry(2.5, 1.3);
    top.rotateX(-Math.PI / 2);
    toRegion(top, R.feltRoulette);
    k.add(top, atlasLit(), look.felt, 0.45, 0.86, 0);
    k.box(vcMat(0.55), look.rail, 0.45, 0.9, 0.72, 2.6, 0.1, 0.16);
    k.box(vcMat(0.55), look.rail, 1.78, 0.9, 0, 0.16, 0.1, 1.5);
    k.box(vcMat(0.5), look.wood, 0.45, 0.83, -0.7, 2.6, 0.06, 0.1);
    k.cyl(vcMat(0.4), look.wood, -1.25, 0.47, 0, 0.62, 0.55, 0.94, 24);
    k.cyl(vcMat(0.35, 0.3), 0x3a2414, -1.25, 0.97, 0, 0.62, 0.62, 0.06, 24);
    wheel = k.world(-1.25, 1.0, 0);
    chipStacks(k, 0.2, 0.86, -0.55, 8, seed);
    k.cyl(vcMat(0.3, 0.8), look.trim, 1.6, 1.15, -0.5, 0.02, 0.02, 0.6, 6);
    k.sign(limit, 1.6, 1.55, -0.5, 0.32, 0.24, 0, 0x101010, 0xffffff, 0.04);
    for (let i = 0; i < 5; i++) {
      const cx = -0.35 + i * 0.55;
      chair(k, cx, 1.25, Math.PI, look.seat);
      if (rnd() < 0.5) {
        const w = k.world(cx, 0, 1.25);
        ppl.seated.push({ x: w.x, z: w.z, rot: k.worldRot(Math.PI), shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
      }
    }
    const d = k.world(-0.5, 0, -1.0);
    ppl.standing.push({ x: d.x, z: d.z, rot: k.worldRot(0.3), shirt: look.dealerShirt, vest: look.dealerVest });
  });
  return wheel;
}

/** Craps: long tub along x with high padded rails; stickman + boxman on −z, players around. */
export function craps(k: Kit, x: number, z: number, rot: number, look: TableLook, ppl: PeopleLists, seed: number, limit: Rect): void {
  const rnd = rngFrom(seed + 23);
  k.at(x, 0, z, rot, () => {
    k.box(vcMat(0.5), look.wood, 0, 0.38, 0, 4.1, 0.76, 1.6);
    const top = new THREE.PlaneGeometry(4.2, 1.7);
    top.rotateX(-Math.PI / 2);
    toRegion(top, R.feltCraps);
    k.add(top, atlasLit(), look.felt, 0, 0.8, 0);
    for (const s of [-1, 1]) {
      k.box(vcMat(0.5), look.wood, 0, 0.98, s * 0.98, 4.6, 0.4, 0.22);
      k.box(vcMat(0.6), look.rail, 0, 1.2, s * 1.02, 4.6, 0.08, 0.3);
      k.box(vcMat(0.5), look.wood, s * 2.25, 0.98, 0, 0.22, 0.4, 2.2);
      k.box(vcMat(0.6), look.rail, s * 2.3, 1.2, 0, 0.3, 0.08, 2.2);
      k.box(vcMat(0.3, 0.6), look.trim, 0, 1.12, s * 0.9, 4.4, 0.03, 0.08);
    }
    chipStacks(k, 0, 0.84, -0.7, 14, seed);
    const die = (dx: number, dz: number, r: number) => k.box(vcMat(0.25), 0xd8202e, dx, 0.86, dz, 0.1, 0.1, 0.1, r, 0.2);
    die(0.6, 0.1, 0.4);
    die(0.75, -0.05, 1.1);
    k.cyl(vcMat(0.4), 0xc8a46a, 0.2, 1.3, -0.55, 0.012, 0.012, 1.1, 5, 0, 0.9);
    k.cyl(vcMat(0.3, 0.8), look.trim, -2.5, 1.2, -0.9, 0.02, 0.02, 0.6, 6);
    k.sign(limit, -2.5, 1.6, -0.9, 0.32, 0.24, 0, 0x101010, 0xffffff, 0.04);
    for (const [dx, dz, r] of [
      [0, -1.4, 0],
      [-0.8, -1.4, 0],
      [0.8, -1.4, 0],
    ]) {
      const d = k.world(dx, 0, dz);
      ppl.standing.push({ x: d.x, z: d.z, rot: k.worldRot(r), shirt: look.dealerShirt, vest: look.dealerVest });
    }
    for (let i = 0; i < 8; i++) {
      if (rnd() < 0.45) continue;
      const side = i < 5 ? 1 : 0;
      const dx = side ? -1.8 + i * 0.9 : (i - 5) % 2 ? 2.7 : -2.7;
      const dz = side ? 1.5 : (i - 5) * 0.6 - 0.3;
      const w = k.world(dx, 0, dz);
      const r = side ? Math.PI : dx > 0 ? -Math.PI / 2 : Math.PI / 2;
      ppl.standing.push({ x: w.x, z: w.z, rot: k.worldRot(r), shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
    }
  });
}

/** Poker table (WSOP room dressing): oval, 9 seats, dealer in the middle of a long side. */
export function pokerTable(k: Kit, x: number, z: number, rot: number, look: TableLook, ppl: PeopleLists, seed: number): void {
  const rnd = rngFrom(seed + 41);
  k.at(x, 0, z, rot, () => {
    k.cyl(vcMat(0.5), look.wood, 0, 0.38, 0, 0.5, 0.6, 0.76, 12);
    const top = new THREE.CircleGeometry(1, 32);
    top.rotateX(-Math.PI / 2);
    top.scale(1.45, 1, 0.82);
    remapPlanar(top, R.feltPoker, -1.45, 1.45, -0.82, 0.82);
    k.add(top, atlasLit(), look.felt, 0, 0.8, 0);
    const rail = new THREE.TorusGeometry(1, 0.1, 6, 32);
    rail.rotateX(Math.PI / 2);
    rail.scale(1.5, 1, 0.88);
    k.add(rail, vcMat(0.55), look.rail, 0, 0.82, 0);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const cx = Math.sin(a) * 1.95;
      const cz = Math.cos(a) * 1.3;
      if (i === 5) {
        const d = k.world(cx * 0.82, 0, cz * 0.82);
        ppl.standing.push({ x: d.x, z: d.z, rot: k.worldRot(a + Math.PI), shirt: look.dealerShirt, vest: look.dealerVest });
        continue;
      }
      chair(k, cx, cz, a + Math.PI, look.seat);
      if (rnd() < 0.75) {
        const w = k.world(cx, 0, cz);
        ppl.seated.push({ x: w.x, z: w.z, rot: k.worldRot(a + Math.PI), shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
        chipStacks(k, Math.sin(a) * 1.1, 0.83, Math.cos(a) * 0.62, 4, i + seed);
      }
    }
  });
}

/** Map XZ positions to an atlas rect (x → u, z → canvas-down). */
export function remapPlanar(g: THREE.BufferGeometry, r: Rect, x0: number, x1: number, z0: number, z1: number): THREE.BufferGeometry {
  const [u0, v0, du, dv] = uvRect(r);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - x0) / (x1 - x0);
    const v = 1 - (pos.getZ(i) - z0) / (z1 - z0);
    uv.setXY(i, u0 + u * du, v0 + v * dv);
  }
  return g;
}

// ---------------------------------------------------------------- dressing pieces
export interface DressLook {
  trim: number;
  wood: number;
  dark: number;
  accent: number;
  seat: number;
  cove: number;
}

/** Cashier cage against a wall (local: wall at z = 0, room toward +z), `w` wide. */
export function cashierCage(k: Kit, x: number, z: number, rot: number, w: number, look: DressLook, ppl: PeopleLists): void {
  k.at(x, 0, z, rot, () => {
    k.box(vcMat(0.6), look.dark, 0, 2.2, 0.15, w, 4.4, 0.3);
    k.box(vcMat(0.45), look.wood, 0, 0.55, 1.35, w, 1.1, 0.5);
    k.box(vcMat(0.2, 0.1), 0xe8e0d0, 0, 1.13, 1.38, w + 0.1, 0.06, 0.62);
    k.box(vcMat(0.45), look.wood, 0, 2.75, 1.35, w, 0.3, 0.5);
    for (let bx = -w / 2 + 0.1; bx <= w / 2 - 0.05; bx += 0.14) k.cyl(vcMat(0.25, 0.9), look.trim, bx, 1.92, 1.5, 0.012, 0.012, 1.5, 5);
    k.box(vcMat(0.25, 0.9), look.trim, 0, 1.17, 1.52, w, 0.04, 0.04);
    k.box(vcMat(0.25, 0.9), look.trim, 0, 2.62, 1.52, w, 0.04, 0.04);
    k.sign(R.cashier, 0, 3.35, 1.4, Math.min(w - 0.4, 3.6), 0.8, 0, 0x0a0806);
    for (let i = 0; i < Math.floor(w / 2.2); i++) {
      const cx = -w / 2 + 1.1 + i * 2.2;
      k.box(glowMat(), 0xfff0c8, cx, 2.55, 1.0, 0.8, 0.04, 0.3);
      const p = k.world(cx, 0, 0.7);
      ppl.standing.push({ x: p.x, z: p.z, rot: k.worldRot(0), shirt: 0xf4f4f0, vest: 0x1a2a4a });
    }
    k.box(glowMat(), look.cove, 0, 0.05, 1.62, w, 0.06, 0.04);
  });
}

/** Wall bar with a lit back-bar of bottles; video-poker bar tops; stools. */
export function wallBar(k: Kit, x: number, z: number, rot: number, w: number, look: DressLook, ppl: PeopleLists, seed: number): void {
  const rnd = rngFrom(seed + 5);
  k.at(x, 0, z, rot, () => {
    k.box(vcMat(0.15, 0.8), 0x9aa4b0, 0, 2.0, 0.08, w, 2.2, 0.04); // mirror
    k.box(vcMat(0.5), look.wood, 0, 0.5, 0.25, w, 1.0, 0.5);
    for (const sy of [1.25, 1.75, 2.25]) {
      k.box(vcMat(0.4), look.wood, 0, sy, 0.22, w, 0.04, 0.3);
      k.box(glowMat(), look.cove, 0, sy + 0.025, 0.36, w, 0.015, 0.02);
      for (let bx = -w / 2 + 0.15; bx < w / 2 - 0.1; bx += 0.17) {
        const c = [0x3aa85a, 0xc8783a, 0xe8d8a8, 0x6ab8e8, 0xc8203a, 0xf2c23a, 0x8a5a2a][Math.floor(rnd() * 7)];
        k.cyl(glowMat(), c, bx, sy + 0.17, 0.2, 0.025, 0.04, 0.3, 6);
      }
    }
    k.sign(R.bar, 0, 3.05, 0.25, Math.min(w - 0.5, 4), 0.85, 0, 0x100614);
    k.box(vcMat(0.5), look.wood, 0, 0.55, 1.45, w, 1.1, 0.6);
    k.box(vcMat(0.15, 0.3), look.dark, 0, 1.12, 1.5, w + 0.2, 0.06, 0.8);
    k.box(glowMat(), look.cove, 0, 0.08, 1.77, w, 0.05, 0.03);
    for (let i = 0; i < Math.floor(w / 0.9); i++) {
      const cx = -w / 2 + 0.45 + i * 0.9;
      k.quad(atlasGlow(), 0xd8d8d8, cx, 1.16, 1.62, 0.34, 0.26, 0, R.videoPoker, -1.2);
      k.cyl(vcMat(0.3, 0.8), 0x8a8e96, cx, 0.4, 2.15, 0.035, 0.05, 0.8, 8);
      k.cyl(vcMat(0.6), look.seat, cx, 0.82, 2.15, 0.22, 0.2, 0.1, 12);
      if (rnd() < 0.4) {
        const p = k.world(cx, 0.15, 2.12);
        ppl.seated.push({ x: p.x, y: 0.15, z: p.z, rot: k.worldRot(Math.PI), shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
      }
    }
    const b0 = k.world(-w * 0.2, 0, 0.85);
    ppl.standing.push({ x: b0.x, z: b0.z, rot: k.worldRot(0), shirt: 0x101010, vest: look.accent });
  });
}

/** Sportsbook: a giant LED wall high on a wall + ticker + lounge seats. */
export function sportsbook(k: Kit, x: number, z: number, rot: number, w: number, look: DressLook, ppl: PeopleLists, seed: number): void {
  const rnd = rngFrom(seed + 9);
  k.at(x, 0, z, rot, () => {
    const h = Math.min(4.2, w * 0.3);
    k.box(vcMat(0.5, 0.4), 0x0a0a0e, 0, 3.0 + h / 2, 0.15, w + 0.4, h + 0.4, 0.3);
    k.quad(atlasGlow(), 0xf0f0f0, 0, 3.0 + h / 2, 0.31, w, h, 0, R.led);
    k.sign(R.sportsbook, 0, 3.0 + h + 0.75, 0.3, Math.min(w * 0.6, 5), 1.0, 0, 0x050a1a);
    const tk = new THREE.PlaneGeometry(w, 0.4);
    tileUV(tk, w / 6, 1);
    k.add(tk, texMat(tickerTexture(), 'glow'), 0xffffff, 0, 2.62, 0.32);
    k.box(vcMat(0.5, 0.4), 0x0a0a0e, 0, 2.62, 0.2, w + 0.2, 0.5, 0.2);
    for (let i = 0; i < Math.floor(w / 1.3); i++) {
      const cx = -w / 2 + 0.65 + i * 1.3;
      k.at(cx, 0, 1.6, 0, () => {
        k.box(vcMat(0.7), look.seat, 0, 0.25, 0, 0.75, 0.5, 0.7);
        k.box(vcMat(0.7), look.seat, 0, 0.7, 0.3, 0.75, 0.6, 0.15);
        k.box(vcMat(0.4), look.dark, 0, 0.75, -0.55, 0.9, 0.05, 0.3);
      });
      if (rnd() < 0.45) {
        const p = k.world(cx, -0.15, 1.62);
        ppl.seated.push({ x: p.x, y: -0.15, z: p.z, rot: k.worldRot(Math.PI), shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
      }
    }
  });
}

/** ATM pair against a wall. */
export function atms(k: Kit, x: number, z: number, rot: number): void {
  k.at(x, 0, z, rot, () => {
    for (const s of [-0.55, 0.55]) {
      k.box(vcMat(0.4, 0.5), 0x2a2e36, s, 0.85, 0.3, 0.9, 1.7, 0.6);
      k.quad(atlasGlow(), 0xffffff, s, 1.95, 0.32, 0.9, 0.5, 0, R.atm);
      k.box(vcMat(0.3), 0x0a0a0e, s, 1.3, 0.55, 0.5, 0.35, 0.12, 0, -0.3);
      k.quad(glowMat(), 0x5ab8ff, s, 1.31, 0.62, 0.38, 0.24, 0, undefined, -0.3);
    }
  });
}

/** Square column with a lit wrap and brass bands; returns nothing (caller adds the collider). */
export function column(k: Kit, x: number, z: number, h: number, look: DressLook, wrap: number): void {
  k.box(vcMat(0.5), wrap, x, h / 2, z, 0.9, h, 0.9);
  k.box(vcMat(0.25, 0.85), look.trim, x, 0.08, z, 1.0, 0.16, 1.0);
  k.box(vcMat(0.25, 0.85), look.trim, x, 2.4, z, 0.96, 0.08, 0.96);
  k.box(vcMat(0.25, 0.85), look.trim, x, h - 0.3, z, 1.1, 0.25, 1.1);
  for (const [dx, dz, ry] of [
    [0, 0.456, 0],
    [0, -0.456, Math.PI],
    [0.456, 0, Math.PI / 2],
    [-0.456, 0, -Math.PI / 2],
  ]) k.quad(glowMat(), look.cove, x + dx, 3.4, z + dz, 0.5, 0.06, ry);
}

/** Crystal chandelier: tiers of glowing drops + a glass skirt. */
export function chandelier(k: Kit, x: number, top: number, z: number, r: number, look: DressLook, tint = 0xfff4dc): void {
  k.cyl(vcMat(0.3, 0.8), look.trim, x, top - 0.4, z, 0.03, 0.03, 0.8, 6);
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const rr = r * (1 - t * 0.28);
    const y = top - 0.9 - t * 0.45;
    const ring = new THREE.TorusGeometry(rr, 0.035, 5, 20);
    ring.rotateX(Math.PI / 2);
    k.add(ring, vcMat(0.25, 0.85), look.trim, x, y, z);
    const n = Math.max(8, Math.round(rr * 14));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const len = 0.25 + ((i * 7) % 3) * 0.08;
      k.cyl(glowMat(), tint, x + Math.cos(a) * rr, y - len / 2, z + Math.sin(a) * rr, 0.018, 0.03, len, 4);
    }
  }
  const bowl = new THREE.SphereGeometry(r * 0.45, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  k.add(bowl, glowMat(), tint, x, top - 0.9 - tiers * 0.45 + 0.3, z);
  const halo = new THREE.CircleGeometry(r * 1.8, 16);
  halo.rotateX(Math.PI / 2);
  k.add(halo, additiveMat(), 0x3a3020, x, top - 0.05, z);
}

/** Security camera dome on the ceiling. */
export function cameraDome(k: Kit, x: number, y: number, z: number): void {
  const g = new THREE.SphereGeometry(0.22, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  k.add(g, vcMat(0.08, 0.6), 0x0c0c10, x, y, z);
  k.cyl(vcMat(0.4), 0x2a2a30, x, y + 0.02, z, 0.25, 0.25, 0.04, 12);
}

/** Hanging double-sided wayfinding sign on two rods. */
export function hangingSign(k: Kit, region: Rect, x: number, y: number, z: number, w: number, h: number, ry: number, ceilY: number, trim: number): void {
  k.sign(region, x, y, z, w, h, ry, 0x14161a, 0xb0b0b0, 0.1);
  k.at(x, 0, z, ry, () => {
    for (const s of [-1, 1]) k.cyl(vcMat(0.3, 0.8), trim, s * w * 0.4, (y + h / 2 + ceilY) / 2, 0, 0.015, 0.015, ceilY - y - h / 2, 5);
  });
}

/** Rope-and-stanchion line from a to c. */
export function ropeLine(k: Kit, ax: number, az: number, cx: number, cz: number, trim: number, rope = 0x8a0a1a): void {
  const len = Math.hypot(cx - ax, cz - az);
  const n = Math.max(1, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) {
    const x = ax + ((cx - ax) * i) / n;
    const z = az + ((cz - az) * i) / n;
    k.cyl(vcMat(0.25, 0.9), trim, x, 0.48, z, 0.03, 0.03, 0.96, 6);
    k.cyl(vcMat(0.25, 0.9), trim, x, 0.02, z, 0.16, 0.18, 0.04, 10);
    k.add(new THREE.SphereGeometry(0.06, 8, 6), vcMat(0.25, 0.9), trim, x, 0.98, z);
    if (i < n) {
      const nx = ax + ((cx - ax) * (i + 1)) / n;
      const nz = az + ((cz - az) * (i + 1)) / n;
      const mx = (x + nx) / 2;
      const mz = (z + nz) / 2;
      const seg = Math.hypot(nx - x, nz - z);
      k.cyl(vcMat(0.8), rope, mx, 0.8, mz, 0.025, 0.025, seg, 6, Math.atan2(nx - x, nz - z), Math.PI / 2);
    }
  }
}

// ---------------------------------------------------------------- visibility gate
export interface GateBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  doors: Array<{ x: number; z: number; nx: number; nz: number; half: number }>;
}
/** True while the camera is inside the floor, or outside a doorway looking in. */
export function gateOpen(g: GateBox): boolean {
  const c = viewer.cam;
  const cat = viewer.cat;
  if (cat.x > g.minX && cat.x < g.maxX && cat.z > g.minZ && cat.z < g.maxZ && cat.y < g.height) return true;
  if (c.x > g.minX - 1.5 && c.x < g.maxX + 1.5 && c.z > g.minZ - 1.5 && c.z < g.maxZ + 1.5 && c.y < g.height + 1) return true;
  let lx = cat.x - c.x;
  let lz = cat.z - c.z;
  const ll = Math.hypot(lx, lz) || 1;
  lx /= ll;
  lz /= ll;
  for (const d of g.doors) {
    const rx = c.x - d.x;
    const rz = c.z - d.z;
    const dist = rx * d.nx + rz * d.nz;
    if (dist <= -0.5 || dist > 40) continue;
    const lat = Math.abs(rx * -d.nz + rz * d.nx);
    if (lat > d.half + 1 + Math.max(0, dist) * 0.4) continue;
    const td = Math.hypot(rx, rz) || 1;
    if ((-rx / td) * lx + (-rz / td) * lz < 0.5) continue;
    return true;
  }
  return false;
}

/** Distance from the cat to the box (0 inside). */
export function catDistance(g: GateBox): number {
  const c = viewer.cat;
  const dx = Math.max(g.minX - c.x, 0, c.x - g.maxX);
  const dz = Math.max(g.minZ - c.z, 0, c.z - g.maxZ);
  return Math.hypot(dx, dz);
}

export { ensureClock };
