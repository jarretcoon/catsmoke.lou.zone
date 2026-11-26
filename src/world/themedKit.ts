import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { catDistance, gateOpen, type GateBox } from './interiorKit';
import { gated } from './grandInteriors';

/*
 * Small shared helpers for the MGM Grand and New York-New York interiors: canvas textures, atlas
 * rects, cached map materials, one animation clock, and a lazy interior group that is built the first
 * time the cat comes near and shown only while the camera is inside or looking in through a door
 * (the same gate the casino-interior kit uses). Pickups inside the box are moved into the group.
 */

export type Px = [number, number, number, number]; // canvas px: x, y, w, h (y down)

export function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

/** Remap a geometry's 0..1 UVs into a canvas-pixel rect of a `size` texture. */
export function uvTo<T extends THREE.BufferGeometry>(g: T, r: Px, size: [number, number], flipU = false): T {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const u0 = r[0] / size[0];
  const du = r[2] / size[0];
  const v0 = 1 - (r[1] + r[3]) / size[1];
  const dv = r[3] / size[1];
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (flipU ? 1 - uv.getX(i) : uv.getX(i)) * du, v0 + uv.getY(i) * dv);
  return g;
}

/** Scale UVs (tiling textures). */
export function uvScale<T extends THREE.BufferGeometry>(g: T, su: number, sv: number): T {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

const glowCache = new Map<THREE.Texture, THREE.MeshBasicMaterial>();
const litCache = new Map<string, THREE.MeshStandardMaterial>();
/** Unlit textured material; vertex colour scales brightness (signs, screens, painted skies). */
export function mapGlow(t: THREE.Texture): THREE.MeshBasicMaterial {
  let m = glowCache.get(t);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: t, vertexColors: true });
    glowCache.set(t, m);
  }
  return m;
}
/** Lit textured material; vertex colour tints. */
export function mapLit(t: THREE.Texture, rough = 0.8, metal = 0): THREE.MeshStandardMaterial {
  const key = `${t.uuid}|${rough}|${metal}`;
  let m = litCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: rough, metalness: metal });
    litCache.set(key, m);
  }
  return m;
}

/** One shared animation clock for the themed interiors and signs (seconds, wrapped). */
export const themeClock = { value: 0 };
const clocked = new WeakSet<WorldBuilder>();
export function tickTheme(b: WorldBuilder): void {
  if (clocked.has(b)) return;
  clocked.add(b);
  b.every((_dt, t) => {
    themeClock.value = t % 3600;
  });
}

/**
 * An interior dressing group added straight to the scene: built the first time the cat comes within
 * 80 m, visible only while the gate is open (camera inside, or outside a door looking in). Also
 * registers the box so tourists strolling inside aren't drawn from the street.
 */
export function lazyInterior(b: WorldBuilder, name: string, gate: GateBox, build: (group: THREE.Group) => Array<(t: number, dt: number) => void>): void {
  tickTheme(b);
  const group = new THREE.Group();
  group.name = name;
  group.visible = false;
  b.scene.add(group);
  gated(b, new THREE.Group(), gate.minX, gate.maxX, gate.minZ, gate.maxZ, 14);
  // Cigarette packs on this floor ride in the group, so they cost nothing from the street
  for (const p of b.cigPickups) {
    const q = p.position;
    if (q.x > gate.minX && q.x < gate.maxX && q.z > gate.minZ && q.z < gate.maxZ && q.y < gate.height && p.mesh.parent === b.scene) group.add(p.mesh);
  }
  let anim: Array<(t: number, dt: number) => void> | null = null;
  b.every((dt, t) => {
    if (!anim && catDistance(gate) < 80) anim = build(group);
    const vis = !!anim && gateOpen(gate);
    group.visible = vis;
    if (vis) for (const f of anim!) f(t, dt);
  });
}

/** Text helper: fits `s` into maxW (shrinking the font), centred at (x, y). */
export function fitText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, maxW: number, family = '"Arial Black", Impact, sans-serif', weight = 'bold'): void {
  let size = px;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(s).width > maxW && size > 8) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

export function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Outdoor LED "puck" lettering: a mask texture (white letters on black) is sampled once per puck on a
 * uGrid lattice. By day the letters read as gold/coloured cabinet faces; after dark every puck glows
 * and a chase sweeps across. Fogged like the rest of the street. Shared per mask.
 */
export function puckMaterial(b: WorldBuilder, mask: THREE.Texture, grid: [number, number], day: number, lit: number, bg = 0x0a0a0c, chase = 1): THREE.ShaderMaterial {
  tickTheme(b);
  const night = { value: 0 };
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uMask: { value: mask },
      uTime: themeClock,
      uNight: night,
      uGrid: { value: new THREE.Vector2(...grid) },
      uDay: { value: new THREE.Color(day) },
      uLit: { value: new THREE.Color(lit) },
      uBg: { value: new THREE.Color(bg) },
      uChase: { value: chase },
    },
    fog: true,
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uMask;
      uniform float uTime;
      uniform float uNight;
      uniform vec2 uGrid;
      uniform vec3 uDay;
      uniform vec3 uLit;
      uniform vec3 uBg;
      uniform float uChase;
      varying vec2 vUv;
      void main() {
        vec2 g = vUv * uGrid;
        vec2 cell = floor( g );
        vec2 f = fract( g ) - 0.5;
        vec2 cuv = ( cell + 0.5 ) / uGrid;
        vec4 mk = texture2D( uMask, cuv );
        float m = mk.r;
        float puck = 1.0 - smoothstep( 0.3, 0.44, length( f ) );
        float wave = 0.5 + 0.5 * sin( cell.x * 0.45 + cell.y * 0.25 - uTime * 5.0 );
        float chase = mix( 1.0, 0.55 + 0.75 * wave, uChase );
        vec3 dayCol = uDay * ( 0.72 + 0.28 * puck );
        vec3 nightCol = uLit * ( 0.12 + puck * chase * 1.35 );
        vec3 face = mix( dayCol, nightCol, uNight );
        // a second colour channel in the mask (green) = outline/accent pucks in white
        vec3 accent = mix( vec3( 0.85 ), vec3( 1.0, 0.97, 0.9 ) * puck * ( 0.6 + 0.8 * wave ), uNight );
        vec3 col = mix( uBg * ( 1.0 - 0.6 * uNight ), face, m );
        col = mix( col, accent, mk.g * ( 1.0 - m ) );
        gl_FragColor = vec4( col, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  b.every((_dt, _t, n) => {
    night.value = n;
  });
  return m;
}
