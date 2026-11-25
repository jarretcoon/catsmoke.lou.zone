import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { FacadeSpec, makeFacadeTextures } from './textures';
import { basic, mat, mesh } from './props';

const facadeCache = new Map<string, { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture }>();

function facadeTextures(spec: FacadeSpec) {
  const key = JSON.stringify(spec);
  let t = facadeCache.get(key);
  if (!t) {
    t = makeFacadeTextures(spec);
    facadeCache.set(key, t);
  }
  return t;
}

/** Tower skin material whose windows glow at night. Texture repeats follow real floor sizes. */
export function facadeMaterial(b: WorldBuilder, spec: FacadeSpec, w: number, h: number, opts: { metal?: number; rough?: number; glow?: number } = {}): THREE.MeshStandardMaterial {
  const t = facadeTextures(spec);
  const map = t.map.clone();
  const em = t.emissiveMap.clone();
  // ~3.2 m per floor and ~3.6 m per window bay
  const rx = Math.max(1, (w / 3.6) / spec.cols);
  const ry = Math.max(1, (h / 3.2) / spec.rows);
  map.repeat.set(rx, ry);
  em.repeat.set(rx, ry);
  map.needsUpdate = true;
  em.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({
    map,
    emissiveMap: em,
    emissive: new THREE.Color(spec.lit),
    emissiveIntensity: 0.05,
    roughness: opts.rough ?? 0.6,
    metalness: opts.metal ?? 0.1,
  });
  b.nightGlow(m, 0.04, opts.glow ?? 1.25);
  return m;
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

function addBody(g: THREE.Group, b: WorldBuilder, o: TowerOpts, w: number, d: number, h: number, y: number, roofMat: THREE.Material): void {
  const side = facadeMaterial(b, o.facade, w, h, { metal: o.metal, rough: o.rough });
  const end = facadeMaterial(b, o.facade, d, h, { metal: o.metal, rough: o.rough });
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [end, end, roofMat, roofMat, side, side]);
  body.position.y = y + h / 2;
  body.castShadow = o.cast ?? true;
  body.receiveShadow = true;
  g.add(body);
}

/**
 * A hotel tower: storefront podium, optional setback, corner fins, a crown LED band that
 * glows after dark, and rooftop mechanicals — so nothing reads as a plain box.
 */
export function tower(b: WorldBuilder, o: TowerOpts): THREE.Group {
  const g = new THREE.Group();
  const y = o.y ?? 0;
  const roofMat = mat(o.roof ?? 0x3a3a40, 0.7);
  const accent = o.accent ?? new THREE.Color(o.facade.lit).getHex();
  const wallColor = new THREE.Color(o.facade.wall);
  const finColor = new THREE.Color(o.facade.mullion).getHex();

  // Podium: darker plinth + glowing storefront band + canopy ledge
  if (!o.minimal && y === 0) {
    const podH = Math.min(6, Math.max(3.4, o.h * 0.1));
    g.add(mesh(new THREE.BoxGeometry(o.w + 0.8, podH, o.d + 0.8), mat(wallColor.clone().multiplyScalar(0.5).getHex(), 0.6, 0.2), 0, podH / 2, 0, true));
    g.add(mesh(new THREE.BoxGeometry(o.w + 0.86, podH * 0.42, o.d + 0.86), glowMaterial(b, 0xffd9a0, 0x1c2430, 0.08, 1.1), 0, podH * 0.36, 0));
    g.add(mesh(new THREE.BoxGeometry(o.w + 2.2, 0.28, o.d + 2.2), roofMat, 0, podH + 0.14, 0));
  }

  // Body, with a setback crown on the tall ones
  const setback = !o.noSetback && !o.minimal && o.h > 30;
  const h1 = setback ? o.h * 0.8 : o.h;
  addBody(g, b, o, o.w, o.d, h1, y, roofMat);
  const tw = setback ? o.w * 0.82 : o.w;
  const td = setback ? o.d * 0.82 : o.d;
  if (setback) {
    g.add(mesh(new THREE.BoxGeometry(o.w + 0.3, 0.5, o.d + 0.3), roofMat, 0, y + h1 + 0.25, 0));
    addBody(g, b, o, tw, td, o.h - h1, y + h1, roofMat);
  }

  // Corner fins run the full height of the lower body
  if (!o.minimal) {
    const fin = mat(finColor, 0.4, 0.5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.4, h1, 0.4), fin, (sx * o.w) / 2, y + h1 / 2, (sz * o.d) / 2));
  }

  // Crown: LED band + cap
  const top = y + o.h;
  g.add(mesh(new THREE.BoxGeometry(tw + 0.35, 1.3, td + 0.35), glowMaterial(b, accent, wallColor.getHex(), 0.06, 2.4), 0, top - 0.65, 0));
  g.add(mesh(new THREE.BoxGeometry(tw + 0.5, 0.8, td + 0.5), roofMat, 0, top + 0.4, 0));

  // Rooftop mechanicals + antenna with a red aviation light
  if (!o.minimal) {
    const mech = mat(0x8a8d93, 0.6, 0.3);
    g.add(mesh(new THREE.BoxGeometry(tw * 0.35, 2.2, td * 0.3), mech, -tw * 0.15, top + 1.9, td * 0.1, true));
    g.add(mesh(new THREE.BoxGeometry(tw * 0.2, 1.4, td * 0.25), mech, tw * 0.25, top + 1.5, -td * 0.15));
    if (o.h > 25) {
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 6), mat(0xb8bcc6, 0.3, 0.8), tw * 0.3, top + 4.3, td * 0.2));
      g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), basic(0xff2020), tw * 0.3, top + 7.9, td * 0.2));
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

/** Several tower blocks along an arc — reads as a curved tower (Bellagio, ARIA, Wynn). */
export function curvedTower(b: WorldBuilder, cx: number, cz: number, radius: number, a0: number, a1: number, segments: number, depth: number, h: number, facade: FacadeSpec, metal = 0.1): void {
  const segLen = (radius * Math.abs(a1 - a0)) / segments;
  for (let i = 0; i < segments; i++) {
    const a = a0 + ((i + 0.5) / segments) * (a1 - a0);
    const x = cx + Math.cos(a) * radius;
    const z = cz + Math.sin(a) * radius;
    const stepH = h * (0.86 + 0.14 * Math.sin(((i + 0.5) / segments) * Math.PI));
    tower(b, { x, z, w: segLen * 1.04, d: depth, h: stepH, facade, rotY: -a + Math.PI / 2, metal, minimal: i % 2 === 1, noSetback: true });
  }
}
