import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { FacadeSpec, makeFacadeTextures, rng } from './textures';
import { mat, mesh } from './props';
import { beaconShader, installInteriors, ledWrapMaterial, soffitMaterial } from './facadeShader';

type FacadeTex = ReturnType<typeof makeFacadeTextures>;
const facadeCache = new Map<string, FacadeTex>();

function facadeTextures(spec: FacadeSpec): FacadeTex {
  const key = JSON.stringify(spec);
  let t = facadeCache.get(key);
  if (!t) {
    t = makeFacadeTextures(spec);
    facadeCache.set(key, t);
  }
  return t;
}

/**
 * Night strength of the lit hotel-room windows. Kept just under the bloom threshold (look.ts) so a
 * tower at night is a crisp grid of warm and cool rooms, not a glowing slab: neon, bulbs and the
 * crown/wash lighting carry the glow. (At 1.25 every lit window bloomed and whole towers hazed over.)
 */
const WINDOW_GLOW = 0.9;
/** Podium storefront band and canopy fascia: warm shop light, also under the bloom threshold (it runs the full width of the tower at eye level, so at 1.1 it flooded the sidewalk view). */
const STOREFRONT_GLOW = 0.75;

/** Glass reads glossy and a bit metallic; `metal`/`rough` scale the per-texel roughness/metalness map. */
function facadeParams(spec: FacadeSpec, opts: { metal?: number; rough?: number }): THREE.MeshStandardMaterialParameters {
  const metal = opts.metal ?? 0.1;
  const rough = opts.rough ?? 0.6;
  const lit = new THREE.Color(spec.lit);
  return {
    emissive: new THREE.Color(0xffffff).lerp(lit, 0.35),
    emissiveIntensity: 0.05,
    roughness: THREE.MathUtils.clamp(rough / 0.6, 0.35, 1.2),
    metalness: THREE.MathUtils.clamp(0.35 + metal * 0.75, 0, 1),
  };
}

/** Tower skin material whose windows glow at night, with rooms behind the glass. Texture repeats follow real floor sizes. */
export function facadeMaterial(b: WorldBuilder, spec: FacadeSpec, w: number, h: number, opts: { metal?: number; rough?: number; glow?: number } = {}): THREE.MeshStandardMaterial {
  const t = facadeTextures(spec);
  const map = t.map.clone();
  const em = t.emissiveMap.clone();
  const rmap = t.roughnessMap.clone();
  // ~3.2 m per floor and ~3.6 m per window bay
  const rx = Math.max(1, (w / 3.6) / spec.cols);
  const ry = Math.max(1, (h / 3.2) / spec.rows);
  for (const tx of [map, em, rmap]) {
    tx.repeat.set(rx, ry);
    tx.needsUpdate = true;
  }
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, roughnessMap: rmap, metalnessMap: rmap, ...facadeParams(spec, opts) });
  b.nightGlow(m, 0.04, opts.glow ?? WINDOW_GLOW);
  installInteriors(b, m, { cols: spec.cols, rows: spec.rows });
  return m;
}

export interface WashOpts {
  /** Crown up-light colour (defaults to the tower accent). */
  wash?: number;
  washStrength?: number;
  /** How far down from the roof the crown wash reaches (m). */
  washZone?: number;
}

/**
 * Shared skin for tower walls whose UVs are already in facade-tile units (see towerWalls), so every
 * tower with the same skin uses ONE material and the static batcher can merge them.
 */
const sharedFacades = new WeakMap<WorldBuilder, Map<string, THREE.MeshStandardMaterial>>();
function sharedFacade(b: WorldBuilder, spec: FacadeSpec, opts: { metal?: number; rough?: number } & WashOpts): THREE.MeshStandardMaterial {
  let cache = sharedFacades.get(b);
  if (!cache) {
    cache = new Map();
    sharedFacades.set(b, cache);
  }
  const key = `${JSON.stringify(spec)}|${opts.metal ?? ''}|${opts.rough ?? ''}|${opts.wash ?? ''}|${opts.washStrength ?? ''}|${opts.washZone ?? ''}`;
  let m = cache.get(key);
  if (!m) {
    const t = facadeTextures(spec);
    m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, roughnessMap: t.roughnessMap, metalnessMap: t.roughnessMap, ...facadeParams(spec, opts) });
    b.nightGlow(m, 0.04, WINDOW_GLOW);
    installInteriors(b, m, { cols: spec.cols, rows: spec.rows, topRef: true, wash: opts.wash ?? new THREE.Color(spec.lit).getHex(), washStrength: opts.washStrength, washZone: opts.washZone });
    cache.set(key, m);
  }
  return m;
}

/**
 * Four tower walls (no top/bottom) with UVs in facade tiles: u runs along each face from its left edge,
 * v is measured from the tower roof (`vTop`) downward, so floors line up across a setback and the
 * facade shader knows how far below the crown each pixel is.
 */
function towerWalls(w: number, h: number, d: number, y0: number, vFrom: number, cols: number, rows: number, uJitter: number, vTop: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const su = 1 / (3.6 * cols);
  const sv = 1 / (3.2 * rows);
  const faces: Array<[number, number, number]> = [
    [0, 1, w],
    [1, 0, d],
    [0, -1, w],
    [-1, 0, d],
  ];
  faces.forEach(([nx, nz, len], fi) => {
    const half = nx !== 0 ? w / 2 : d / 2;
    const rx = nz;
    const rz = -nx;
    const sx = nx * half - rx * (len / 2);
    const sz = nz * half - rz * (len / 2);
    const base = pos.length / 3;
    // Whole-bay shifts so each face shows different rooms lit while windows stay on the bay grid
    const u0 = Math.floor(uJitter * cols * (fi + 1)) / cols;
    const corners: Array<[number, number, number, number]> = [
      [sx, y0, sz, 0],
      [sx + rx * len, y0, sz + rz * len, 1],
      [sx + rx * len, y0 + h, sz + rz * len, 1],
      [sx, y0 + h, sz, 0],
    ];
    corners.forEach(([x, y, z, along], k) => {
      pos.push(x, y, z);
      nor.push(nx, 0, nz);
      uv.push(u0 + along * len * su, (vFrom + (k < 2 ? 0 : h) - vTop) * sv);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export interface TowerOpts {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  facade: FacadeSpec;
  rotY?: number;
  y?: number;
  roof?: number;
  metal?: number;
  rough?: number;
  collide?: boolean;
  cast?: boolean;
  /** Crown/podium LED accent (defaults to the lit-window colour). */
  accent?: number;
  /** Curved-tower segments etc.: skip podium, fins and roof clutter. */
  minimal?: boolean;
  noSetback?: boolean;
  /** Crown up-light wash after dark: colour (defaults to the accent), reach down from the roof (m), strength. */
  wash?: number;
  washZone?: number;
  washStrength?: number;
  /** Crown LED band strength at night (default 1.6; 0 = no band, just the cornice). */
  crownGlow?: number;
  /** Glowing accent fins mid-face (default: modern glass towers). */
  ledFins?: boolean;
  /** LED strips up the four corners, in this colour. */
  edgeLed?: number;
  /** Vertical sunshade fins every `every` bays across the long faces (ARIA's sawtooth edges). */
  fins?: { color?: number; every?: number; depth?: number };
  /** Balcony slabs with LED-lit edges every floor on the long faces (Cosmopolitan). */
  balconies?: { color: number; every?: number };
  /** A building-wrap LED screen on one long face from y0 to y1 m ('back' = local −z, the concave side of a curvedTower). */
  ledWrap?: { y0: number; y1: number; face?: 'front' | 'back'; palette?: number[]; dir?: [number, number] };
  /** Full-height corner fins (default true; curved-tower segments skip them so joints don't read as stripes). */
  cornerFins?: boolean;
}

const glowMats = new Map<string, THREE.MeshStandardMaterial>();
function glowMaterial(b: WorldBuilder, color: number, base: number, day: number, night: number): THREE.MeshStandardMaterial {
  const key = `${color}|${base}|${day}|${night}`;
  let m = glowMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: day, roughness: 0.35, metalness: 0.4 });
    b.nightGlow(m, day, night);
    glowMats.set(key, m);
  }
  return m;
}

/** Blinking red aviation-obstruction light material shared by every rooftop on the Strip (each tower on its own clock). */
const beacons = new WeakMap<WorldBuilder, THREE.MeshBasicMaterial>();
export function beaconMaterial(b: WorldBuilder): THREE.MeshBasicMaterial {
  let m = beacons.get(b);
  if (!m) {
    m = beaconShader(b);
    beacons.set(b, m);
  }
  return m;
}

const ledWraps = new Map<string, THREE.MeshBasicMaterial>();
function ledWrapFor(b: WorldBuilder, palette: number[], dir: [number, number]): THREE.MeshBasicMaterial {
  const key = `${palette.join(',')}|${dir.join(',')}`;
  let m = ledWraps.get(key);
  if (!m) {
    m = ledWrapMaterial(b, palette, dir);
    ledWraps.set(key, m);
  }
  return m;
}

/** Downward-facing panel whose UVs count 2.4 m soffit panels, so every canopy shares one material. */
function soffitPanel(w: number, d: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 2.4, (uv.getY(i) * d) / 2.4);
  return g;
}

/**
 * A hotel tower: storefront podium with a downlit canopy, optional setback, floor ledges and cornices,
 * corner fins, a crown LED band and an up-light wash that glow after dark, a parapet, and a rooftop of
 * penthouse, HVAC, water tank, antennas and blinking aviation lights — so nothing reads as a plain box.
 * The glass has rooms behind it (see facadeShader.ts).
 */
export function tower(b: WorldBuilder, o: TowerOpts): THREE.Group {
  const g = new THREE.Group();
  const y = o.y ?? 0;
  const style = o.facade.style ?? 0;
  const R = rng((o.facade.seed ?? 7) * 97 + Math.round(o.x * 13 + o.z * 7 + o.h));
  const roofMat = mat(o.roof ?? 0x3a3a40, 0.7);
  const accent = o.accent ?? new THREE.Color(o.facade.lit).getHex();
  const wallColor = new THREE.Color(o.facade.wall);
  const finColor = new THREE.Color(o.facade.mullion).getHex();
  const trim = mat(wallColor.clone().lerp(new THREE.Color(0xffffff), 0.28).getHex(), 0.65, 0.05);
  const modern = style === 2 || (o.metal ?? 0) >= 0.5;
  const skin = sharedFacade(b, o.facade, { metal: o.metal, rough: o.rough, wash: o.wash ?? accent, washZone: o.washZone, washStrength: o.washStrength });
  const cast = o.cast ?? true;

  // Podium: darker plinth + glowing storefront band + canopy ledge with a downlit soffit
  if (!o.minimal && y === 0) {
    const podH = Math.min(6, Math.max(3.4, o.h * 0.1));
    g.add(mesh(new THREE.BoxGeometry(o.w + 0.8, podH, o.d + 0.8), mat(wallColor.clone().multiplyScalar(0.5).getHex(), 0.6, 0.2), 0, podH / 2, 0, true));
    g.add(mesh(new THREE.BoxGeometry(o.w + 0.86, podH * 0.42, o.d + 0.86), glowMaterial(b, 0xffd9a0, 0x1c2430, 0.08, STOREFRONT_GLOW), 0, podH * 0.36, 0));
    g.add(mesh(new THREE.BoxGeometry(o.w + 2.2, 0.28, o.d + 2.2), roofMat, 0, podH + 0.14, 0));
    g.add(mesh(soffitPanel(o.w + 2.1, o.d + 2.1), soffitMaterial(b), 0, podH - 0.015, 0));
    // Thin lit fascia on the canopy edge (same material as the storefront band, so it costs no draw call)
    g.add(mesh(new THREE.BoxGeometry(o.w + 2.26, 0.07, o.d + 2.26), glowMaterial(b, 0xffd9a0, 0x1c2430, 0.08, STOREFRONT_GLOW), 0, podH + 0.02, 0));
  }

  // Body, with a setback crown on the tall ones
  const setback = !o.noSetback && !o.minimal && o.h > 30;
  const h1 = setback ? o.h * 0.8 : o.h;
  const uJ = R();
  g.add(mesh(towerWalls(o.w, h1, o.d, y, 0, o.facade.cols, o.facade.rows, uJ, o.h), skin, 0, 0, 0, cast));
  const tw = setback ? o.w * 0.82 : o.w;
  const td = setback ? o.d * 0.82 : o.d;
  if (setback) {
    // Cornice at the setback + the upper block
    g.add(mesh(new THREE.BoxGeometry(o.w + 0.9, 0.55, o.d + 0.9), trim, 0, y + h1 + 0.1, 0));
    g.add(mesh(new THREE.BoxGeometry(o.w - 0.2, 0.3, o.d - 0.2), roofMat, 0, y + h1 - 0.1, 0));
    g.add(mesh(towerWalls(tw, o.h - h1, td, y + h1, h1, o.facade.cols, o.facade.rows, uJ, o.h), skin, 0, 0, 0, cast));
  }
  // Roof slab
  g.add(mesh(new THREE.BoxGeometry(tw - 0.05, 0.3, td - 0.05), roofMat, 0, y + o.h - 0.15, 0));

  // Floor ledges every few floors (masonry towers) / slab edges (ribbon towers)
  if (!o.minimal && style !== 2 && !o.balconies) {
    const every = style === 1 ? 4 : 6 + Math.floor(R() * 5);
    const step = every * 3.2;
    let n = 0;
    for (let ly = step; ly < h1 - 4 && n < 8; ly += step, n++) {
      g.add(mesh(new THREE.BoxGeometry(o.w + 0.36, 0.22, o.d + 0.36), trim, 0, y + ly, 0));
    }
  }

  // Corner fins run the full height of the lower body (LED strips where the real tower has them);
  // modern towers get LED fins mid-face too
  if ((!o.minimal && o.cornerFins !== false) || o.edgeLed !== undefined) {
    const fin = o.edgeLed !== undefined ? glowMaterial(b, o.edgeLed, 0x1a1c22, 0.05, 2.2) : mat(finColor, 0.4, 0.5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.4, h1, 0.4), fin, (sx * o.w) / 2, y + h1 / 2, (sz * o.d) / 2));
  }
  if (!o.minimal && (o.ledFins ?? modern)) {
    const led = glowMaterial(b, accent, 0x1a1c22, 0.04, 1.9);
    const nW = o.w > 20 ? 2 : 1;
    for (const sz of [-1, 1]) {
      for (let k = 1; k <= nW; k++) {
        const fx = -o.w / 2 + (o.w * k) / (nW + 1);
        g.add(mesh(new THREE.BoxGeometry(0.22, h1 * 0.92, 0.3), led, fx, y + h1 * 0.5, sz * (o.d / 2 + 0.12)));
      }
    }
  }

  // Sunshade fins across the long faces (every few bays), full height, catching the podium floodlights
  if (o.fins) {
    const every = o.fins.every ?? 2;
    const depth = o.fins.depth ?? 0.7;
    const fm = mat(o.fins.color ?? new THREE.Color(o.facade.mullion).lerp(new THREE.Color(0xffffff), 0.2).getHex(), 0.3, 0.75);
    const pitch = 3.6 * every;
    const n = Math.max(1, Math.floor(o.w / pitch));
    const off = (o.w - n * pitch) / 2;
    for (const sz of [-1, 1]) {
      for (let k = 0; k <= n; k++) {
        const fx = -o.w / 2 + off + k * pitch;
        if (Math.abs(fx) > o.w / 2 - 0.3) continue;
        g.add(mesh(new THREE.BoxGeometry(0.16, h1 - 0.6, depth), fm, fx, y + h1 / 2, sz * (o.d / 2 + depth / 2)));
      }
    }
  }

  // Balconies: a slab per floor on both long faces, with an LED strip along each slab's lip
  if (o.balconies) {
    const every = o.balconies.every ?? 1;
    const slab = mat(0xd8dce0, 0.6, 0.2);
    const lip = glowMaterial(b, o.balconies.color, 0x2a2a30, 0.06, 2.2);
    const rail = mat(0x9aa4ae, 0.15, 0.6);
    for (let ly = 3.2 * 2, f = 0; ly < h1 - 1.5; ly += 3.2 * every, f++) {
      const deep = f % 2 === 0 ? 1.3 : 1.0; // fretted: alternating depths
      for (const sz of [-1, 1]) {
        const zc = sz * (o.d / 2 + deep / 2);
        g.add(mesh(new THREE.BoxGeometry(o.w - 0.5, 0.2, deep), slab, 0, y + ly, zc));
        g.add(mesh(new THREE.BoxGeometry(o.w - 0.4, 0.07, 0.07), lip, 0, y + ly - 0.06, sz * (o.d / 2 + deep + 0.02)));
        g.add(mesh(new THREE.BoxGeometry(o.w - 0.5, 0.05, 0.05), rail, 0, y + ly + 1.05, sz * (o.d / 2 + deep - 0.05)));
      }
    }
  }

  // Building-wrap LED screen on one long face
  if (o.ledWrap) {
    const lw = o.ledWrap;
    const sz = (lw.face ?? 'back') === 'back' ? -1 : 1;
    const hh = Math.min(lw.y1, h1) - lw.y0;
    if (hh > 1) {
      const m = ledWrapFor(b, lw.palette ?? [0xff1a2a, 0xff7a10, 0xc0004a], lw.dir ?? [0, 1]);
      const p = mesh(new THREE.PlaneGeometry(o.w + 0.3, hh), m, 0, y + lw.y0 + hh / 2, sz * (o.d / 2 + 0.14));
      if (sz < 0) p.rotation.y = Math.PI;
      g.add(p);
      // Black frame bands top and bottom
      for (const yy of [lw.y0, lw.y0 + hh]) g.add(mesh(new THREE.BoxGeometry(o.w + 0.5, 0.5, 0.3), mat(0x0c0c0e, 0.5, 0.4), 0, y + yy, sz * (o.d / 2 + 0.15)));
    }
  }

  // Crown: LED band + projecting cornice cap + parapet
  const top = y + o.h;
  const crownGlow = o.crownGlow ?? 1.05;
  g.add(mesh(new THREE.BoxGeometry(tw + 0.35, 1.3, td + 0.35), crownGlow > 0 ? glowMaterial(b, accent, wallColor.getHex(), 0.06, crownGlow) : trim, 0, top - 0.65, 0));
  g.add(mesh(new THREE.BoxGeometry(tw + 0.7, 0.5, td + 0.7), trim, 0, top + 0.25, 0));
  const parH = 1.1;
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(tw + 0.3, parH, 0.25), roofMat, 0, top + 0.5 + parH / 2, s * (td / 2 + 0.02)));
    g.add(mesh(new THREE.BoxGeometry(0.25, parH, td + 0.3), roofMat, s * (tw / 2 + 0.02), top + 0.5 + parH / 2, 0));
  }

  // Rooftop: penthouse + louvres, HVAC units, a water tank on the older towers, antennas + beacons
  const beacon = beaconMaterial(b);
  const beaconGeo = new THREE.SphereGeometry(0.32, 8, 6);
  if (!o.minimal) {
    const mech = mat(0x8a8d93, 0.6, 0.3);
    const dark = mat(0x4a4d52, 0.7, 0.2);
    const phW = tw * (0.3 + R() * 0.15);
    const phD = td * (0.28 + R() * 0.12);
    const phX = (R() - 0.5) * tw * 0.3;
    const phZ = (R() - 0.5) * td * 0.25;
    const phH = 3 + R() * 1.6;
    g.add(mesh(new THREE.BoxGeometry(phW, phH, phD), mech, phX, top + 0.5 + phH / 2, phZ, true));
    g.add(mesh(new THREE.BoxGeometry(phW + 0.3, 0.25, phD + 0.3), dark, phX, top + 0.5 + phH + 0.12, phZ));
    for (let k = 0; k < 3; k++) g.add(mesh(new THREE.BoxGeometry(phW * 0.8, 0.12, 0.06), dark, phX, top + 1.2 + k * 0.5, phZ + phD / 2 + 0.03));
    const units = 2 + Math.floor(R() * 3);
    for (let k = 0; k < units; k++) {
      const ux = (R() - 0.5) * (tw - 3);
      const uz = (R() - 0.5) * (td - 3);
      if (Math.abs(ux - phX) < phW / 2 + 1 && Math.abs(uz - phZ) < phD / 2 + 1) continue;
      const uw = 1.4 + R() * 1.6;
      g.add(mesh(new THREE.BoxGeometry(uw, 1.1, uw * 0.8), mech, ux, top + 1.05, uz));
      g.add(mesh(new THREE.CylinderGeometry(uw * 0.28, uw * 0.28, 0.12, 10), dark, ux, top + 1.66, uz));
    }
    if (style === 0 && R() < 0.75) {
      // Timber-style water tank on legs with a conical lid
      const tx = tw * (R() < 0.5 ? -0.3 : 0.3);
      const tz = td * (R() < 0.5 ? -0.25 : 0.25);
      const tank = mat(0x6a5444, 0.85);
      for (const lx of [-0.7, 0.7]) for (const lz of [-0.7, 0.7]) g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 5), dark, tx + lx, top + 1.3, tz + lz));
      g.add(mesh(new THREE.CylinderGeometry(1.15, 1.15, 2.4, 12), tank, tx, top + 3.3, tz, true));
      g.add(mesh(new THREE.ConeGeometry(1.3, 0.9, 12), dark, tx, top + 4.95, tz));
    }
    if (o.h > 25) {
      const steel = mat(0xb8bcc6, 0.3, 0.8);
      const mastH = 6 + R() * 6;
      const ax = phX + phW * 0.25;
      const az = phZ;
      const base = top + 0.5 + phH;
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.13, mastH, 6), steel, ax, base + mastH / 2, az));
      for (let k = 1; k <= 2; k++) g.add(mesh(new THREE.BoxGeometry(1.2 - k * 0.3, 0.05, 0.05), steel, ax, base + mastH * (0.4 + k * 0.2), az));
      g.add(mesh(beaconGeo, beacon, ax, base + mastH + 0.2, az));
      if (R() < 0.6) {
        const m2 = 3 + R() * 3;
        g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, m2, 5), steel, phX - phW * 0.3, base + m2 / 2, phZ + phD * 0.2));
      }
    }
  }
  // Corner beacons on tall towers (also on the curved segments that skip the clutter)
  if (o.h > 40) {
    for (const [cx, cz] of [
      [-1, -1],
      [1, 1],
    ]) {
      g.add(mesh(beaconGeo, beacon, (cx * tw) / 2, top + 1.85, (cz * td) / 2));
    }
  }
  g.position.set(o.x, 0, o.z);
  g.rotation.y = o.rotY ?? 0;
  b.add(g);
  if (o.collide !== false) {
    // Axis-aligned bounds of the (possibly rotated) footprint
    const c = Math.abs(Math.cos(o.rotY ?? 0));
    const s = Math.abs(Math.sin(o.rotY ?? 0));
    const hx = (o.w * c + o.d * s) / 2;
    const hz = (o.w * s + o.d * c) / 2;
    b.collider(o.x - hx, o.x + hx, o.z - hz, o.z + hz, y, y + o.h, true);
  }
  return g;
}

/**
 * Walkable staircase from (x, z) climbing `rise` meters while running `run` meters along
 * `dir` ('+x' | '-x' | '+z' | '-z'). Each step stays under the 0.56 m step-up limit.
 */
export function stairs(b: WorldBuilder, x: number, z: number, dir: '+x' | '-x' | '+z' | '-z', width: number, rise: number, run: number, material: THREE.Material, y0 = 0): void {
  const steps = Math.max(2, Math.ceil(rise / 0.45));
  const stepRise = rise / steps;
  const stepRun = run / steps;
  for (let i = 0; i < steps; i++) {
    const top = y0 + (i + 1) * stepRise;
    const along = (i + 0.5) * stepRun;
    const px = dir === '+x' ? x + along : dir === '-x' ? x - along : x;
    const pz = dir === '+z' ? z + along : dir === '-z' ? z - along : z;
    const alongX = dir === '+x' || dir === '-x';
    b.box(px, y0, pz, alongX ? stepRun : width, top - y0, alongX ? width : stepRun, material, false, false);
  }
}

/** Extra per-segment options for curvedTower; `crescent` tapers the ends low and thin (Vdara). */
export type CurvedExtra = Partial<Omit<TowerOpts, 'x' | 'z' | 'w' | 'd' | 'h' | 'facade' | 'rotY'>> & { crescent?: boolean };

/** Several tower blocks along an arc — reads as a curved tower (Bellagio, ARIA, Wynn). */
export function curvedTower(b: WorldBuilder, cx: number, cz: number, radius: number, a0: number, a1: number, segments: number, depth: number, h: number, facade: FacadeSpec, metal = 0.1, extra: CurvedExtra = {}): void {
  // LED edge strips go on the two ends of the arc only
  const { crescent, edgeLed, ...rest } = extra;
  const segLen = (radius * Math.abs(a1 - a0)) / segments;
  for (let i = 0; i < segments; i++) {
    const k = (i + 0.5) / segments;
    const a = a0 + k * (a1 - a0);
    const sk = Math.sin(k * Math.PI);
    const stepH = crescent ? h * (0.66 + 0.34 * sk) : h * (0.86 + 0.14 * sk);
    const dd = crescent ? depth * (0.55 + 0.45 * sk) : depth;
    // A crescent keeps its convex back on the arc and thins toward the concave side
    const r = crescent ? radius + (depth - dd) / 2 : radius;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    tower(b, { metal, minimal: i % 2 === 1, noSetback: true, cornerFins: false, ...rest, edgeLed: i === 0 || i === segments - 1 ? edgeLed : undefined, x, z, w: segLen * 1.04, d: dd, h: stepH, facade, rotY: -a + Math.PI / 2 });
  }
}
