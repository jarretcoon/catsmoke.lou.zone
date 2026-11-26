import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from './builder';
import { mat, palmPieces } from './props';
import { makePaverTexture } from './textures';

/** Shared helpers for the south Strip modules (southStrip.ts, welcomeSign.ts, southFronts.ts). */

// Floor layers (keep a few cm apart so distant floors do not z-fight)
export const L0 = 0.014;
export const L1 = 0.034;
export const L2 = 0.05;

export const UP = new THREE.Vector3(0, 1, 0);
export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function prepGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx: number[] = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(idx);
  }
  g.clearGroups();
  return g;
}

const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
/** Cylinder from a to c (radius r at a, rTop at c). */
export function beamGeo(a: THREE.Vector3, c: THREE.Vector3, r: number, seg = 6, rTop = r): THREE.BufferGeometry {
  _dir.subVectors(c, a);
  const len = Math.max(0.001, _dir.length());
  const g = new THREE.CylinderGeometry(rTop, r, len, seg, 1);
  _q.setFromUnitVectors(UP, _dir.divideScalar(len));
  g.applyQuaternion(_q);
  g.translate((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
  return g;
}

/** Collects many small pieces and emits one merged mesh per material (keeps the mesh count low). */
export class Merger {
  private readonly lists = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  add(g: THREE.BufferGeometry, m: THREE.Material, cast = false): void {
    let e = this.lists.get(m);
    if (!e) {
      e = { geos: [], cast: false };
      this.lists.set(m, e);
    }
    e.geos.push(prepGeo(g));
    e.cast ||= cast;
  }
  /** Box centred at (x, y, z). */
  box(m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, cast = false): void {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add(g, m, cast);
  }
  beam(m: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, r: number, seg = 6, rTop = r, cast = false): void {
    this.add(beamGeo(a, c, r, seg, rTop), m, cast);
  }
  at(m: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, cast = false): void {
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add(g, m, cast);
  }
  /** Emit into the static root (default) or straight into the scene (for animated materials). */
  flush(b: WorldBuilder, toScene = false): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [m, e] of this.lists) {
      if (!e.geos.length) continue;
      const merged = mergeGeometries(e.geos, false);
      for (const g of e.geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const me = new THREE.Mesh(merged, m);
      me.castShadow = e.cast;
      me.receiveShadow = true;
      if (toScene) b.scene.add(me);
      else b.add(me);
      out.push(me);
    }
    this.lists.clear();
    return out;
  }
}

const paverTex = new Map<string, THREE.CanvasTexture>();
export function paving(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, base = '#cdbfa6', joint = '#a99a82', tile = 4, y = L0): void {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  let t = paverTex.get(base + joint);
  if (!t) {
    t = makePaverTexture(base, joint, 4);
    paverTex.set(base + joint, t);
  }
  const tex = t.clone();
  tex.needsUpdate = true;
  tex.repeat.set(w / tile, d / tile);
  b.floor((x0 + x1) / 2, (z0 + z1) / 2, w, d, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), y);
}

export function ground(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, color: number, y = L0, rough = 0.95): void {
  b.floor((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(z1 - z0), mat(color, rough), y);
}

export function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A palm into a merger (shared palm pieces: ringed trunk, alpha-tested frond crown, dates). */
export function palmInto(mg: Merger, x: number, z: number, h: number, seed: number, y0 = 0): void {
  for (const p of palmPieces(h, false, seed)) {
    const g = p.geo.clone().applyMatrix4(p.matrix);
    g.translate(x, y0, z);
    mg.add(g, p.mat, p.cast);
  }
}
