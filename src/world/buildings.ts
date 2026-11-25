import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { FacadeSpec, makeFacadeTextures } from './textures';
import { mat, mesh } from './props';

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
}

/** A hotel tower block with a lit-window facade and a roof cap. */
export function tower(b: WorldBuilder, o: TowerOpts): THREE.Group {
  const g = new THREE.Group();
  const y = o.y ?? 0;
  const side = facadeMaterial(b, o.facade, o.w, o.h, { metal: o.metal, rough: o.rough });
  const end = facadeMaterial(b, o.facade, o.d, o.h, { metal: o.metal, rough: o.rough });
  const roofMat = mat(o.roof ?? 0x3a3a40, 0.7);
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z
  const body = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), [end, end, roofMat, roofMat, side, side]);
  body.position.y = y + o.h / 2;
  body.castShadow = o.cast ?? true;
  body.receiveShadow = true;
  g.add(body);
  g.add(mesh(new THREE.BoxGeometry(o.w + 0.4, 0.8, o.d + 0.4), roofMat, 0, y + o.h + 0.4, 0));
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
    tower(b, { x, z, w: segLen * 1.04, d: depth, h: stepH, facade, rotY: -a + Math.PI / 2, metal });
  }
}
