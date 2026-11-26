import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeGroup } from '../meshBake';
import type { WorldBuilder } from './builder';
import { facadeMaterial, stairs, tower } from './buildings';
import { buildCasinoFloor } from './casinos';
import { LedBoard, makePaverTexture } from './textures';
import type { FacadeSpec } from './textures';
import { basic, car, mat, mesh, neonSign, planter } from './props';
import type { CarKind } from './props';
import { palmPieces } from './props';
import { beamMaterial } from './skyLife';
import { buildLuxorAtrium, luxorColliders, luxorSkinGeometry } from './grandLuxor';
import { xFromO, zFromS } from './strip';

/**
 * South Strip, north → south: Park MGM & The Park · New York-New York (Big Apple Coaster) ·
 * [Tropicana Ave] · Excalibur · the Mandalay Bay Tram · Luxor · Mandalay Bay / W / Four Seasons ·
 * Allegiant Stadium (backdrop) — and on the east side Showcase Mall (M&M'S, Coca-Cola) · MGM Grand ·
 * the A's ballpark site · OYO · the vacant lots · Pinball Hall of Fame · Dream (stalled) · Harry Reid
 * airport — ending at the "Welcome to Fabulous Las Vegas" sign in the median.
 * Real positions go through zFromS / xFromO (1:4.5 south of Park MGM).
 */
export function buildSouthStrip(b: WorldBuilder): void {
  buildParkMGM(b);
  buildNYNY(b);
  buildExcalibur(b);
  buildTram(b);
  buildLuxor(b);
  buildMandalay(b);
  buildWestSouth(b);
  buildAllegiant(b);
  buildShowcase(b);
  buildMGMGrand(b);
  buildBallpark(b);
  buildOYO(b);
  buildEastLots(b);
  buildPinballAndDream(b);
  buildAirport(b);
  buildBaliHai(b);
  buildWelcomeSign(b);
  buildSidewalkLife(b);
}

// ---------------------------------------------------------------- reserved edges
const TROP_Z = zFromS(-1542); // 442.2 — Tropicana Ave
const TROP_N = TROP_Z - 17.2; // corridor |z − TROP_Z| < 17 is the main session's
const TROP_S = TROP_Z + 17.2;
const RING_N = TROP_Z - 30.2; // skybridge ring: |x| < 30 inside ±30 of Tropicana
const RING_S = TROP_Z + 30.2;
const RUSSELL_Z = zFromS(-3182); // 806.7
const RUSSELL_N = RUSSELL_Z - 12.2;
const RUSSELL_S = RUSSELL_Z + 12.2;
/** Ground-level half-width of the Welcome sign median island (inner-lane cars run from |x| ≈ 2.17). */
const ISLAND = 2.1;

// Floor layers (keep a few cm apart so distant floors do not z-fight)
const L0 = 0.014;
const L1 = 0.034;
const L2 = 0.05;

// ---------------------------------------------------------------- helpers
const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function prepGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
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
function beamGeo(a: THREE.Vector3, c: THREE.Vector3, r: number, seg = 6, rTop = r): THREE.BufferGeometry {
  _dir.subVectors(c, a);
  const len = Math.max(0.001, _dir.length());
  const g = new THREE.CylinderGeometry(rTop, r, len, seg, 1);
  _q.setFromUnitVectors(UP, _dir.divideScalar(len));
  g.applyQuaternion(_q);
  g.translate((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
  return g;
}

/** Collects many small pieces and emits one merged mesh per material (keeps the mesh count low). */
class Merger {
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
function paving(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, base = '#cdbfa6', joint = '#a99a82', tile = 4, y = L0): void {
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

function ground(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, color: number, y = L0, rough = 0.95): void {
  b.floor((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(z1 - z0), mat(color, rough), y);
}

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Strip-side LED marquee: the board faces ±z (Boulevard traffic), spanning `w` along x. */
function ledPylon(b: WorldBuilder, led: LedBoard, x: number, z: number, w: number, h: number, poleH: number, frame = 0x18181c): void {
  const face = new THREE.MeshBasicMaterial({ map: led.tex });
  const dark = mat(frame, 0.5, 0.4);
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.9), [dark, dark, dark, dark, face, face]);
  board.position.set(x, poleH + h / 2, z);
  b.add(board);
  b.add(mesh(new THREE.BoxGeometry(w + 0.6, 0.6, 1.3), dark, x, poleH + h + 0.3, z));
  b.add(mesh(new THREE.BoxGeometry(w + 0.6, 0.4, 1.3), dark, x, poleH - 0.2, z));
  b.add(mesh(new THREE.BoxGeometry(1.4, poleH, 1.4), dark, x, poleH / 2, z, true));
  b.collider(x - 0.8, x + 0.8, z - 0.8, z + 0.8, 0, poleH + h, true);
  b.every((_dt, t) => led.draw(t));
}

/** A palm into a merger (shared palm pieces: ringed trunk, alpha-tested frond crown, dates). */
function palmInto(mg: Merger, x: number, z: number, h: number, seed: number, y0 = 0): void {
  for (const p of palmPieces(h, false, seed)) {
    const g = p.geo.clone().applyMatrix4(p.matrix);
    g.translate(x, y0, z);
    mg.add(g, p.mat, p.cast);
  }
}

/** Raised gravel bed with agave rosettes (desert landscaping). */
function agaveBed(mg: Merger, x: number, z: number, w: number, d: number, seed = 0): void {
  mg.box(mat(0x9a8d78, 0.85), x, 0.3, z, w, 0.6, d);
  mg.box(mat(0xb9a98a, 0.98), x, 0.62, z, w - 0.2, 0.05, d - 0.2);
  const leaf = mat(0x7a9a7a, 0.7);
  const n = Math.max(2, Math.floor((w * d) / 2.5));
  for (let i = 0; i < n; i++) {
    const px = x + (((i * 0.618 + seed * 0.13) % 1) - 0.5) * (w - 0.8);
    const pz = z + (((i * 0.382 + seed * 0.29) % 1) - 0.5) * (d - 0.8);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + i;
      mg.beam(leaf, v3(px, 0.62, pz), v3(px + Math.cos(a) * 0.45, 1.25, pz + Math.sin(a) * 0.45), 0.07, 4, 0.01);
    }
  }
}

/** Palo-verde style desert tree. */
function desertTreeInto(mg: Merger, x: number, z: number, h = 4.2, seed = 0): void {
  const bark = mat(0x7a8a4a, 0.9);
  const leaves = mat(0x9ab04a, 0.9);
  mg.beam(bark, v3(x, 0, z), v3(x, h * 0.55, z), 0.12, 6, 0.09);
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + seed;
    const c = v3(x + Math.cos(a) * 1.1, h * 0.78 + (k % 2) * 0.3, z + Math.sin(a) * 1.1);
    mg.beam(bark, v3(x, h * 0.55, z), c, 0.07, 5, 0.05);
    const blob = new THREE.IcosahedronGeometry(1.15, 0);
    blob.scale(1, 0.62, 1);
    mg.at(leaves, blob, c.x, c.y + 0.25, c.z);
  }
}

/** Chain-link fence run between two points (posts, rails, translucent mesh) + an isWall collider. */
const linkMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, transparent: true, opacity: 0.32, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide, depthWrite: false });
function chainLink(b: WorldBuilder, mg: Merger, x0: number, z0: number, x1: number, z1: number, h = 2.6, barbed = false): void {
  const post = mat(0x8c9196, 0.45, 0.7);
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ang = Math.atan2(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const px = x0 + (x1 - x0) * k;
    const pz = z0 + (z1 - z0) * k;
    mg.beam(post, v3(px, 0, pz), v3(px, h + (barbed ? 0.5 : 0), pz), 0.05, 5);
  }
  mg.beam(post, v3(x0, h, z0), v3(x1, h, z1), 0.035, 4);
  mg.beam(post, v3(x0, 0.15, z0), v3(x1, 0.15, z1), 0.025, 4);
  if (barbed) for (const dy of [0.2, 0.35, 0.5]) mg.beam(mat(0x3a3a3a, 0.6, 0.6), v3(x0, h + dy, z0), v3(x1, h + dy, z1), 0.012, 3);
  const panel = new THREE.PlaneGeometry(len, h);
  panel.translate(0, h / 2, 0);
  panel.rotateY(ang + Math.PI / 2);
  panel.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  mg.add(panel, linkMat);
  b.collider(Math.min(x0, x1) - 0.12, Math.max(x0, x1) + 0.12, Math.min(z0, z1) - 0.12, Math.max(z0, z1) + 0.12, 0, h + 0.4, true);
}

function sign(b: WorldBuilder, text: string, bg: string, fg: string, w: number, h: number, x: number, y: number, z: number, rotY: number, sub?: string, depth = 0.28): THREE.Mesh {
  return b.add(neonSign(text, bg, fg, w, h, sub, depth), x, y, z, rotY);
}

/** Smoothly-interpolated frames of a closed spline sampled at equal arc length. */
function nearestIndex(pts: THREE.Vector3[], p: THREE.Vector3): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = pts[i].distanceToSquared(p);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// ================================================================ Park MGM + The Park
function buildParkMGM(b: WorldBuilder): void {
  const z0 = zFromS(-1100); // 344
  const zEnd = 370.6;
  const mg = new Merger();
  const cream: FacadeSpec = { wall: '#e8dcc4', mullion: '#f4ead6', glass: '#6c757c', lit: '#ffe6b0', cols: 10, rows: 20, style: 0, seed: 301 };
  tower(b, { x: -70, z: 355, w: 13, d: 22, h: 38, facade: cream, accent: 0xa8f0c0 });
  sign(b, 'PARK MGM', '#0d1f16', '#e9f7e4', 11, 2.2, -63.25, 27.4, 355, Math.PI / 2);
  sign(b, 'NoMad', '#0d0d0d', '#f4ead6', 5, 1.3, -63.25, 24.4, 355, Math.PI / 2, 'LAS VEGAS', 0.2);
  b.building(-70, 355, 13, 22, '#e8dcc4', 'Park MGM');

  // The Park: shaded walkway between Park MGM and NYNY toward T-Mobile Arena
  paving(b, -19, -63.5, z0, zEnd, '#cbb89c', '#a8957a');
  b.feature({ kind: 'park', x: -41.2, z: (z0 + zEnd) / 2, w: 44.5, d: zEnd - z0, color: '#c2ad8c', label: 'The Park' });
  buildBlissDance(b, -37, 356.5);

  // Weathered-steel shade "trees" with perforated canopies
  const steel = mat(0x7a5a40, 0.8, 0.4);
  const perf = mat(0x8a6a4a, 0.75, 0.35, { side: THREE.DoubleSide });
  for (const [tx, tz] of [
    [-26, 349],
    [-27, 364],
    [-50, 349],
    [-55.5, 361],
  ]) {
    mg.beam(steel, v3(tx, 0, tz), v3(tx, 6.2, tz), 0.26, 8, 0.18, true);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + 0.4;
      mg.beam(steel, v3(tx, 4.4, tz), v3(tx + Math.cos(a) * 2.4, 6.5, tz + Math.sin(a) * 2.4), 0.09, 6);
    }
    for (let k = 0; k < 5; k++) {
      const a = k * 1.256 + 0.2;
      const g = new THREE.CylinderGeometry(1.75, 1.75, 0.08, 6);
      g.rotateX(0.18 * Math.cos(a * 2));
      g.rotateZ(0.15 * Math.sin(a * 3));
      mg.at(perf, g, tx + Math.cos(a) * 1.6, 6.5 + (k % 2) * 0.35, tz + Math.sin(a) * 1.6, 0, true);
    }
    b.collider(tx - 0.3, tx + 0.3, tz - 0.3, tz + 0.3, 0, 6.2, true);
  }

  // Basalt water wall along the north edge
  b.box(-41, 0, 346.2, 30, 1.5, 0.8, mat(0x2b2a2e, 0.55, 0.1), true);
  const sheet = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.3, emissive: 0x2a6a9a, emissiveIntensity: 0.4 });
  b.add(mesh(new THREE.PlaneGeometry(29.6, 1.4), sheet, -41, 0.75, 346.62));

  // Desert beds + palo verdes along the frontage
  for (const [pz, i] of [
    [349.5, 0],
    [358, 1],
    [366.5, 2],
  ]) agaveBed(mg, -22.6, pz, 2.6, 4.4, i);
  desertTreeInto(mg, -31, 368, 4.4, 1);
  desertTreeInto(mg, -45, 365, 4.0, 2);
  desertTreeInto(mg, -60, 350, 4.6, 3);
  for (const bx of [-30, -44]) b.add(benchSeat(), bx, 0, 352.8);

  // Monument sign at the sidewalk
  b.box(-21.3, 0, 353.8, 1.0, 1.7, 7.2, mat(0x3a3530, 0.6), true);
  sign(b, 'THE PARK', '#141210', '#e8d6b0', 6.4, 1.25, -20.72, 0.95, 353.8, Math.PI / 2, 'PARK MGM • NYNY • T-MOBILE ARENA', 0.1);
  mg.flush(b);

  b.pickup(-35.2, 1.35, 356.5, 2, 'Bliss Dance Pedestal Pack', false);
  b.zone('The Park • Bliss Dance', -63.5, -19, z0, zEnd);
  b.zone('Park MGM', -80, -63.5, z0, 368);
  b.crowd.tourists.push(
    { pts: [[-24, 350.5], [-57, 350.5]], prop: 'camera' },
    { pts: [[-56, 363], [-24, 362]], prop: 'cig' },
    { pts: [[-33, 352], [-41, 352], [-41, 361], [-33, 361]], prop: 'camera' }
  );
}

function benchSeat(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x8a6a48, 0.8);
  const metal = mat(0x2a2c30, 0.4, 0.7);
  g.add(mesh(new THREE.BoxGeometry(2.0, 0.08, 0.55), wood, 0, 0.46, 0));
  g.add(mesh(new THREE.BoxGeometry(2.0, 0.42, 0.06), wood, 0, 0.72, -0.25));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.45, 0.5), metal, s * 0.9, 0.22, 0));
  return g;
}

/** Bliss Dance (Marco Cochrane, 40 ft): faceted steel-mesh dancer whose skin cycles colour after dark. */
function buildBlissDance(b: WorldBuilder, x: number, z: number): void {
  const stone = mat(0x3a3632, 0.6, 0.2);
  b.add(mesh(new THREE.CylinderGeometry(2.5, 2.7, 0.9, 24), stone, x, 0.45, z, true));
  b.add(mesh(new THREE.TorusGeometry(2.62, 0.06, 6, 40), basic(0xffd9a0), x, 0.88, z).rotateX(Math.PI / 2));
  b.collider(x - 2.4, x + 2.4, z - 2.4, z + 2.4, 0, 0.9);
  const skin = new THREE.MeshStandardMaterial({ color: 0xbcc4cc, metalness: 0.85, roughness: 0.32, flatShading: true, emissive: 0xff66cc, emissiveIntensity: 0.05 });
  const mg = new Merger();
  const Y = 0.9;
  const P = (px: number, py: number, pz: number) => v3(px, py + Y, pz);
  const hip = P(0, 5.0, 0);
  const lHip = P(0, 4.9, -0.45);
  const rHip = P(0, 4.9, 0.45);
  const lKnee = P(0.35, 2.6, -0.6);
  const lAnk = P(0.15, 0.35, -0.7);
  const lToe = P(0.75, 0.05, -0.75);
  const rKnee = P(0.95, 3.4, 0.95);
  const rAnk = P(-0.25, 2.1, 1.75);
  const rToe = P(-0.55, 1.6, 2.1);
  const waist = P(-0.05, 6.1, 0.05);
  const chest = P(-0.2, 7.4, 0.1);
  const neck = P(-0.35, 8.45, 0.15);
  const head = P(-0.45, 9.05, 0.2);
  const lSh = P(-0.3, 8.15, -0.75);
  const lEl = P(-0.15, 9.6, -1.45);
  const lWr = P(0.15, 11.1, -0.75);
  const lHa = P(0.25, 11.6, -0.35);
  const rSh = P(-0.3, 8.15, 0.85);
  const rEl = P(-0.05, 9.85, 1.55);
  const rWr = P(0.2, 11.25, 0.7);
  const rHa = P(0.22, 11.7, 0.25);
  const parts: Array<[THREE.Vector3, THREE.Vector3, number, number]> = [
    [lHip, lKnee, 0.46, 0.33],
    [lKnee, lAnk, 0.31, 0.14],
    [lAnk, lToe, 0.14, 0.07],
    [rHip, rKnee, 0.46, 0.33],
    [rKnee, rAnk, 0.31, 0.14],
    [rAnk, rToe, 0.14, 0.07],
    [lHip, rHip, 0.55, 0.55],
    [hip, waist, 0.62, 0.48],
    [waist, chest, 0.48, 0.62],
    [chest, neck, 0.58, 0.2],
    [lSh, rSh, 0.26, 0.26],
    [lSh, lEl, 0.2, 0.16],
    [lEl, lWr, 0.16, 0.1],
    [lWr, lHa, 0.1, 0.05],
    [rSh, rEl, 0.2, 0.16],
    [rEl, rWr, 0.16, 0.1],
    [rWr, rHa, 0.1, 0.05],
  ];
  for (const [a, c, r0, r1] of parts) mg.beam(skin, a, c, r0, 7, r1);
  const joint = (p: THREE.Vector3, r: number) => mg.add(new THREE.IcosahedronGeometry(r, 1).translate(p.x, p.y, p.z), skin);
  joint(hip, 0.7);
  joint(lKnee, 0.33);
  joint(rKnee, 0.33);
  joint(lEl, 0.17);
  joint(rEl, 0.17);
  joint(lSh, 0.26);
  joint(rSh, 0.26);
  joint(head, 0.52);
  joint(P(0.12, 7.3, -0.28), 0.34);
  joint(P(0.12, 7.3, 0.42), 0.34);
  joint(P(-0.75, 9.25, 0.25), 0.3); // hair bun
  const meshes = mg.flush(b, true);
  for (const m of meshes) {
    m.position.set(x, 0, z);
    m.rotation.y = 0.35;
  }
  b.collider(x - 0.9, x + 0.9, z - 1.2, z + 1.2, 0.9, 12.6, true);
  b.every((_dt, t, night) => {
    skin.emissive.setHSL((t * 0.03) % 1, 0.85, 0.55);
    skin.emissiveIntensity = 0.03 + night * 1.15;
  });
  b.staticMarkers.push({ x, z, color: '#ff8ad8', glyph: '✦', size: 2.6 });
}

// ================================================================ New York-New York
function buildNYNY(b: WorldBuilder): void {
  const zN = zFromS(-1220); // 370.7
  paving(b, -19, -44, zN, RING_N, '#b9ada0', '#958978');
  paving(b, -30, -44, RING_N, TROP_N, '#b9ada0', '#958978');

  // Casino podium: brownstone street-front of Manhattan
  const brown = facadeMaterial(b, { wall: '#9a6a52', mullion: '#d8c8a8', glass: '#28303a', lit: '#ffd9a0', cols: 4, rows: 3, style: 0, seed: 311 }, 47, 10);
  const roofM = mat(0x4a4038, 0.8);
  const pod = new THREE.Mesh(new THREE.BoxGeometry(42, 10, 47), [brown, brown, roofM, roofM, brown, brown]);
  pod.position.set(-65, 5, 400.5);
  pod.castShadow = true;
  pod.receiveShadow = true;
  b.add(pod);
  b.collider(-86, -44, 377, 424, 0, 10, true);
  const podium = { x0: -86, x1: -44, z0: 377, z1: 424, top: 10 };

  const mg = new Merger();
  // Street-front storefront awnings and cornice
  const awnings = [0x1f5a3a, 0xa8261e, 0x1f3a6a, 0x2a2a2a, 0xa8261e, 0x1f5a3a];
  awnings.forEach((c, i) => mg.box(mat(c, 0.7), -43.2, 3.6, 380 + i * 7.3, 1.6, 0.25, 4.6));
  mg.box(mat(0xd8c8a8, 0.6), -43.8, 9.6, 400.5, 0.6, 0.8, 47.4);
  b.add(mesh(new THREE.BoxGeometry(0.2, 2.4, 6), basic(0xffd9a0), -43.9, 1.5, 400.5)); // main doors
  mg.box(mat(0x1a1a20, 0.4, 0.6), -41.8, 4.4, 400.5, 4.4, 0.45, 9);
  b.add(mesh(new THREE.BoxGeometry(4.0, 0.06, 8.6), basic(0xfff0c8), -41.8, 4.15, 400.5));
  sign(b, 'NEW YORK-NEW YORK', '#0b1730', '#ffffff', 15, 2.3, -43.6, 7.2, 400.5, Math.PI / 2, 'HOTEL & CASINO');
  sign(b, 'NEW YORK', '#101010', '#ffcf3a', 4.4, 0.9, -43.6, 2.7, 386, Math.PI / 2, 'PIZZA • DELI • BAR', 0.1);

  // Manhattan skyline cluster on the podium roof
  const skin = (wall: string, seed: number, glass = '#5a5f66'): FacadeSpec => ({ wall, mullion: '#e8dcc4', glass, lit: '#ffe6b0', cols: 4, rows: 14, style: 0, seed });
  const stack = (x: number, z: number, levels: Array<[number, number, number]>, spec: FacadeSpec, y0: number): number => {
    let y = y0;
    for (const [w, d, h] of levels) {
      tower(b, { x, z, w, d, h, y, facade: spec, minimal: true, accent: new THREE.Color(spec.lit).getHex() });
      y += h + 0.8;
    }
    return y;
  };
  const gold = mat(0xd4a640, 0.3, 0.85);
  const silver = mat(0xd8dde4, 0.22, 0.9);
  const copper = mat(0x5f9e8a, 0.6, 0.3);
  const crownGlow = new THREE.MeshStandardMaterial({ color: 0xf4ead6, emissive: 0xfff0c8, emissiveIntensity: 0.1, roughness: 0.4 });
  b.nightGlow(crownGlow, 0.1, 2.2);
  // Empire State (47 floors)
  let top = stack(-64, 398, [[11, 11, 28], [8.4, 8.4, 6], [6.2, 6.2, 4]], skin('#d9c6a6', 312), podium.top);
  mg.box(crownGlow, -64, top + 1.2, 398, 4.4, 2.4, 4.4);
  mg.beam(silver, v3(-64, top + 2.4, 398), v3(-64, top + 7.5, 398), 1.1, 8, 0.5);
  mg.beam(silver, v3(-64, top + 7.5, 398), v3(-64, top + 12.5, 398), 0.22, 6, 0.06);
  b.add(mesh(new THREE.SphereGeometry(0.25, 8, 6), basic(0xff2020), -64, top + 12.6, 398));
  // Chrysler: tiered stainless crown + spire
  top = stack(-52, 386, [[8, 8, 26]], skin('#c9c2b8', 313), podium.top);
  for (let i = 0; i < 5; i++) {
    const r0 = 3.9 - i * 0.62;
    const g = new THREE.CylinderGeometry(r0 - 0.5, r0, 1.9, 4, 1);
    g.rotateY(Math.PI / 4);
    mg.at(silver, g, -52, top + 0.95 + i * 1.9, 386);
    mg.box(crownGlow, -52, top + 1.7 + i * 1.9, 386, (r0 - 0.3) * 1.42, 0.18, (r0 - 0.3) * 1.42);
  }
  mg.beam(silver, v3(-52, top + 9.5, 386), v3(-52, top + 17, 386), 0.45, 6, 0.04);
  // New York Life: gold pyramid roof
  top = stack(-76, 387, [[9, 9, 28]], skin('#b9a88e', 314), podium.top);
  mg.at(gold, new THREE.ConeGeometry(6.2, 5.6, 4).rotateY(Math.PI / 4), -76, top + 2.8, 387);
  mg.beam(gold, v3(-76, top + 5.6, 387), v3(-76, top + 7.4, 387), 0.12, 5, 0.03);
  // Century: copper hip roof
  top = stack(-79, 410, [[8, 8, 22]], skin('#a8977c', 315), podium.top);
  mg.at(copper, new THREE.ConeGeometry(5.4, 3.6, 4).rotateY(Math.PI / 4), -79, top + 1.8, 410);
  // Seagram: dark bronze glass slab
  stack(-66, 411, [[9, 7, 24]], { wall: '#4a3a2c', mullion: '#6a5440', glass: '#2a2018', lit: '#ffd9a0', cols: 5, rows: 14, style: 2, seed: 316 }, podium.top);
  // Lower tower with a copper lantern
  top = stack(-51, 408, [[8, 8, 18]], skin('#d0c0a4', 317), podium.top);
  mg.at(copper, new THREE.CylinderGeometry(1.6, 2.4, 3, 8), -51, top + 1.5, 408);
  mg.at(gold, new THREE.ConeGeometry(1.6, 2.2, 8), -51, top + 4.1, 408);
  // Municipal building (from the ground, west of the podium) with its wedding-cake lantern
  tower(b, { x: -92, z: 384, w: 9, d: 9, h: 36, facade: skin('#cfc2a8', 318), minimal: true });
  b.add(mesh(new THREE.BoxGeometry(9.8, 3.8, 9.8), mat(0x6a5a48, 0.6, 0.2), -92, 1.9, 384, true));
  for (let i = 0; i < 3; i++) mg.at(i % 2 ? gold : mat(0xe8dcc4, 0.6), new THREE.CylinderGeometry(2.6 - i * 0.7, 3.0 - i * 0.7, 2.2, 10), -92, 37 + i * 2.2, 384);
  mg.beam(gold, v3(-92, 43.6, 384), v3(-92, 46.5, 384), 0.25, 6, 0.08);
  b.building(-65, 400.5, 42, 47, '#9a6a52', 'NYNY');
  b.building(-92, 384, 9, 9, '#cfc2a8');

  buildBrooklynBridge(b, mg);
  buildLiberty(b, mg, -33, 409);
  mg.flush(b);
  buildBigAppleCoaster(b, podium);

  b.zone('New York-New York', -115, -19, zN, TROP_N);
  b.zone('Brooklyn Bridge (NYNY)', -26, -19, 390.5, 410.5);
  b.zone('Statue of Liberty (NYNY)', -37, -29, 405.5, 412.5);
  b.crowd.tourists.push(
    { pts: [[-27.5, 374], [-27.5, 403], [-30.5, 403], [-30.5, 374]], prop: 'camera' },
    { pts: [[-31, 414], [-42, 419], [-31, 423.5]], prop: 'yard-drink' }
  );
  b.crowd.performers.push({ kind: 'showgirl', x: -28, z: 400.5, facing: Math.PI / 2 });
}

function buildBrooklynBridge(b: WorldBuilder, mg: Merger): void {
  const bx = xFromO(-35); // −22.6
  const zA = zFromS(-1316); // 392.0
  const zB = zFromS(-1392); // 408.9
  const halfW = 2.1;
  const granite = mat(0xb9ab92, 0.85);
  const plank = mat(0x8a6a48, 0.85);
  const iron = mat(0x4a4038, 0.6, 0.5);
  const cable = mat(0x5a5048, 0.5, 0.6);
  const nSeg = 20;
  const segL = (zB - zA) / nSeg;
  const deckY = (zz: number) => 0.18 + 1.45 * Math.sin((Math.PI * (zz - zA)) / (zB - zA));
  for (let i = 0; i < nSeg; i++) {
    const zc = zA + (i + 0.5) * segL;
    const h = deckY(zc);
    mg.box(plank, bx, h - 0.06, zc, halfW * 2, 0.12, segL + 0.02);
    mg.box(granite, bx, (h - 0.12) / 2, zc, halfW * 2 - 0.2, Math.max(0.05, h - 0.12), segL + 0.02);
    b.collider(bx - halfW, bx + halfW, zc - segL / 2, zc + segL / 2, 0, h);
  }
  // Railings following the arch
  for (const s of [-1, 1]) {
    const rx = bx + s * (halfW - 0.06);
    for (let i = 0; i <= nSeg; i++) {
      const zz = zA + i * segL;
      const h = deckY(zz);
      mg.beam(iron, v3(rx, h, zz), v3(rx, h + 1.05, zz), 0.035, 4);
      if (i < nSeg) {
        const zz2 = zz + segL;
        const h2 = deckY(zz2);
        mg.beam(iron, v3(rx, h + 1.05, zz), v3(rx, h2 + 1.05, zz2), 0.04, 4);
        mg.beam(iron, v3(rx, h + 0.5, zz), v3(rx, h2 + 0.5, zz2), 0.025, 4);
      }
    }
    b.collider(rx - 0.1, rx + 0.1, zA, zB, 0, 2.8, true);
  }
  // Gothic towers
  const towersZ = [zA + 4.2, zB - 4.2];
  for (const tz of towersZ) {
    for (const s of [-1, 1]) {
      const px = bx + s * (halfW + 0.62);
      mg.box(granite, px, 4.6, tz, 1.1, 9.2, 1.9, 0, true);
      mg.box(granite, px, 9.35, tz, 1.3, 0.3, 2.1);
      b.collider(px - 0.55, px + 0.55, tz - 0.95, tz + 0.95, 0, 9.2, true);
    }
    mg.box(granite, bx, 7.6, tz, halfW * 2 + 2.3, 3.2, 1.9, 0, true);
    mg.box(granite, bx, 9.35, tz, halfW * 2 + 2.6, 0.35, 2.1);
    // pointed arch infill under the band
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(1.7, 0.7, 1.85);
      g.rotateZ(s * -0.75);
      mg.at(granite, g, bx + s * 1.25, 5.85, tz);
    }
    b.collider(bx - halfW - 1.2, bx + halfW + 1.2, tz - 0.95, tz + 0.95, 6.0, 9.5, true);
  }
  // Main cables, suspenders and the diagonal stays
  const topY = 9.1;
  const cableY = (zz: number): number => {
    const [t1, t2] = towersZ;
    if (zz <= t1) return deckY(zA) + 0.9 + ((zz - zA) / (t1 - zA)) ** 1.6 * (topY - deckY(zA) - 0.9);
    if (zz >= t2) return deckY(zB) + 0.9 + ((zB - zz) / (zB - t2)) ** 1.6 * (topY - deckY(zB) - 0.9);
    const k = (zz - (t1 + t2) / 2) / ((t2 - t1) / 2);
    return 4.4 + (topY - 4.4) * k * k;
  };
  for (const s of [-1, 1]) {
    const cx = bx + s * (halfW - 0.06);
    let prev = v3(cx, cableY(zA), zA);
    for (let i = 1; i <= 34; i++) {
      const zz = zA + ((zB - zA) * i) / 34;
      const p = v3(cx, cableY(zz), zz);
      mg.beam(cable, prev, p, 0.07, 5);
      if (i % 2 === 0 && i < 34) mg.beam(cable, p, v3(cx, deckY(zz) + 1.05, zz), 0.015, 3);
      prev = p;
    }
    for (const tz of towersZ) {
      for (const dz of [-3.2, -2.1, -1.1, 1.1, 2.1, 3.2]) {
        const zz = tz + dz;
        if (zz < zA || zz > zB) continue;
        mg.beam(cable, v3(cx, topY - 0.3, tz), v3(cx, deckY(zz) + 1.05, zz), 0.018, 3);
      }
    }
  }
  b.pickup(bx, deckY((zA + zB) / 2) + 0.45, (zA + zB) / 2, 2, 'Brooklyn Bridge Pack', false);
}

/** NYNY's Statue of Liberty replica (faces the Boulevard). */
function buildLiberty(b: WorldBuilder, mg: Merger, x: number, z: number): void {
  const ped = mat(0xc9bba0, 0.8);
  const patina = mat(0x6fa898, 0.6, 0.25);
  b.box(x, 0, z, 5.0, 1.0, 5.0, ped, true);
  b.box(x, 1.0, z, 3.8, 2.6, 3.8, ped, true);
  mg.box(ped, x, 3.78, z, 4.3, 0.36, 4.3);
  mg.box(mat(0xb9ab90, 0.8), x, 2.3, z, 4.0, 0.2, 4.0);
  const Y = 3.96;
  mg.add(new THREE.CylinderGeometry(0.78, 1.12, 6.0, 14).translate(x, Y + 3.0, z), patina, true);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + 0.4;
    mg.beam(patina, v3(x + Math.cos(a) * 0.95, Y, z + Math.sin(a) * 0.95), v3(x + Math.cos(a) * 0.55, Y + 5.6, z + Math.sin(a) * 0.55), 0.22, 6, 0.1);
  }
  const sh = new THREE.SphereGeometry(0.85, 12, 8);
  sh.scale(0.9, 0.55, 1.05);
  mg.at(patina, sh, x, Y + 6.0, z);
  mg.beam(patina, v3(x, Y + 6.2, z), v3(x + 0.05, Y + 6.65, z), 0.25, 8, 0.22);
  mg.add(new THREE.SphereGeometry(0.42, 12, 10).translate(x + 0.06, Y + 6.95, z), patina);
  mg.add(new THREE.CylinderGeometry(0.44, 0.44, 0.16, 12).translate(x + 0.04, Y + 7.18, z), patina);
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + (i / 6) * 2.4;
    const base = v3(x + 0.04 + Math.cos(a) * 0.4, Y + 7.2, z + Math.sin(a) * 0.4);
    mg.beam(patina, base, base.clone().add(v3(Math.cos(a) * 0.42, 0.55, Math.sin(a) * 0.42)), 0.06, 4, 0.01);
  }
  // Right arm raised with the torch (her right is +z when facing east)
  const rSh = v3(x, Y + 6.05, z + 0.68);
  const rEl = v3(x + 0.08, Y + 7.6, z + 0.92);
  const rHa = v3(x + 0.08, Y + 8.9, z + 0.98);
  mg.beam(patina, rSh, rEl, 0.2, 6, 0.17);
  mg.beam(patina, rEl, rHa, 0.17, 6, 0.13);
  mg.add(new THREE.CylinderGeometry(0.2, 0.09, 0.5, 8).translate(rHa.x, rHa.y + 0.3, rHa.z), mat(0xd4a640, 0.3, 0.85));
  mg.add(new THREE.ConeGeometry(0.2, 0.62, 8).translate(rHa.x, rHa.y + 0.85, rHa.z), basic(0xffb83a));
  // Left arm cradling the tablet
  const lSh = v3(x, Y + 6.0, z - 0.68);
  const lEl = v3(x + 0.38, Y + 5.2, z - 0.86);
  const lHa = v3(x + 0.58, Y + 5.7, z - 0.6);
  mg.beam(patina, lSh, lEl, 0.2, 6, 0.17);
  mg.beam(patina, lEl, lHa, 0.17, 6, 0.12);
  const tab = new THREE.BoxGeometry(0.26, 1.5, 0.9);
  tab.rotateX(0.28);
  mg.at(patina, tab, x + 0.52, Y + 5.95, z - 0.62);
  b.collider(x - 1.0, x + 1.0, z - 1.0, z + 1.2, Y, Y + 9.6, true);
}

/** The Big Apple Coaster: a yellow-cab train on a closed Catmull-Rom spline around the towers. */
function buildBigAppleCoaster(b: WorldBuilder, podium: { x0: number; x1: number; z0: number; z1: number; top: number }): void {
  const CP: Array<[number, number, number]> = [
    [-46, 1.2, 371],
    [-56, 1.2, 371],
    [-63, 1.25, 371],
    [-70, 2.6, 371],
    [-86, 20, 371],
    [-100, 37, 371],
    [-107, 41, 373.5],
    [-111.5, 37.5, 381.5],
    [-109, 18, 392],
    [-102, 7, 400.5],
    [-94, 14, 410],
    [-84, 24, 419.5],
    [-70, 20.5, 420.5],
    [-57, 16.5, 420],
    [-47, 15, 416.5],
    [-42.5, 13, 408],
    [-40.5, 10, 399],
    [-38.5, 9, 391],
    [-36.5, 7.5, 384],
    [-33.5, 4.6, 378.2],
    [-34, 2.4, 373.4],
    [-38.5, 1.4, 371.3],
  ];
  const curve = new THREE.CatmullRomCurve3(
    CP.map(([x, y, z]) => v3(x, y, z)),
    true,
    'centripetal'
  );
  const L = curve.getLength();
  const N = Math.ceil(L / 0.5);
  const ds = L / N;
  const pos: THREE.Vector3[] = [];
  const fwd: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    pos.push(curve.getPointAt(i / N));
    fwd.push(curve.getTangentAt(i / N).normalize());
  }
  // Bank into the turns from lateral curvature, plus one heartline roll on the front run
  const raw: number[] = new Array(N).fill(0);
  const r = new THREE.Vector3();
  const dT = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    dT.subVectors(fwd[(i + 3) % N], fwd[(i - 3 + N) % N]).divideScalar(6 * ds);
    r.crossVectors(fwd[i], UP).normalize();
    raw[i] = THREE.MathUtils.clamp(Math.atan((dT.dot(r) * 120) / 9.81), -1.05, 1.05);
  }
  const bank = raw.map((_, i) => {
    let s = 0;
    for (let k = -8; k <= 8; k++) s += raw[(i + k + N) % N];
    return s / 17;
  });
  const iR0 = nearestIndex(pos, v3(...CP[16]));
  const iR1 = nearestIndex(pos, v3(...CP[18]));
  for (let i = iR0; i <= iR1; i++) {
    const k = (i - iR0) / Math.max(1, iR1 - iR0);
    bank[i] += Math.PI * 2 * (k * k * (3 - 2 * k));
  }
  const upv: THREE.Vector3[] = [];
  const lft: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const rr = new THREE.Vector3().crossVectors(fwd[i], UP).normalize();
    const u0 = new THREE.Vector3().crossVectors(rr, fwd[i]).normalize();
    const u = u0.multiplyScalar(Math.cos(bank[i])).addScaledVector(rr, Math.sin(bank[i])).normalize();
    upv.push(u);
    lft.push(new THREE.Vector3().crossVectors(u, fwd[i]).normalize());
  }

  // Track: two rails + a red box spine, ties, connectors, support columns
  const railMat = mat(0xc4c8cf, 0.3, 0.85);
  const spineMat = mat(0xc4232c, 0.45, 0.5);
  const tieMat = mat(0x5a5e66, 0.5, 0.6);
  const supMat = mat(0xd8d6cc, 0.6, 0.3);
  const offsetCurve = (side: number, upOff: number) =>
    new THREE.CatmullRomCurve3(
      pos.filter((_, i) => i % 2 === 0).map((p, j) => p.clone().addScaledVector(lft[j * 2], side).addScaledVector(upv[j * 2], upOff)),
      true
    );
  for (const side of [-0.56, 0.56]) b.add(new THREE.Mesh(new THREE.TubeGeometry(offsetCurve(side, 0), N, 0.075, 6, true), railMat));
  b.add(new THREE.Mesh(new THREE.TubeGeometry(offsetCurve(0, -0.48), N, 0.23, 8, true), spineMat));
  const mg = new Merger();
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < N; i += 3) {
    const g = new THREE.BoxGeometry(1.3, 0.1, 0.2);
    m4.makeBasis(lft[i], upv[i], fwd[i]).setPosition(pos[i].clone().addScaledVector(upv[i], -0.08));
    g.applyMatrix4(m4);
    mg.add(g, tieMat);
    const c = new THREE.BoxGeometry(0.12, 0.42, 0.12);
    m4.makeBasis(lft[i], upv[i], fwd[i]).setPosition(pos[i].clone().addScaledVector(upv[i], -0.3));
    c.applyMatrix4(m4);
    mg.add(c, tieMat);
  }
  const inPodium = (x: number, z: number) => x > podium.x0 && x < podium.x1 && z > podium.z0 && z < podium.z1;
  for (let i = 0; i < N; i += 13) {
    const p = pos[i];
    const top = p.clone().addScaledVector(upv[i], -0.68);
    if (top.y < 3 || upv[i].y < 0.2) continue;
    const footY = inPodium(p.x, p.z) ? podium.top : 0;
    if (top.y - footY < 2) continue;
    mg.beam(supMat, v3(top.x, footY, top.z), top, 0.2, 8, 0.16, true);
    mg.box(supMat, top.x, footY + 0.2, top.z, 0.8, 0.4, 0.8);
    b.collider(top.x - 0.25, top.x + 0.25, top.z - 0.25, top.z + 0.25, footY, top.y, true);
  }
  // Station: platform on the Park side, canopy, sign, queue rail, track bed
  const platMat = mat(0x6a5a4a, 0.8);
  b.box(-53, 0, 368.55, 18, 1.0, 2.7, platMat, false, false);
  b.box(-53, 0, 366.75, 18, 0.5, 0.9, platMat, false, false);
  mg.box(mat(0x8a8a86, 0.85), -51, 0.3, 371, 24, 0.6, 1.5);
  b.collider(-63, -39, 370.25, 371.75, 0, 0.6);
  b.box(-53, 4.6, 370.1, 22, 0.35, 7.6, mat(0x1c2230, 0.5, 0.5), false, false);
  for (const cx of [-42.5, -53, -63.5]) {
    for (const cz of [366.6, 373.7]) {
      mg.beam(mat(0x2a2e36, 0.4, 0.7), v3(cx, 0, cz), v3(cx, 4.6, cz), 0.12, 6);
      b.collider(cx - 0.15, cx + 0.15, cz - 0.15, cz + 0.15, 0, 4.6, true);
    }
  }
  const rail = mat(0xb8bcc6, 0.3, 0.8);
  mg.beam(rail, v3(-44.2, 2.0, 367.3), v3(-61.8, 2.0, 367.3), 0.04, 4);
  mg.beam(rail, v3(-44.2, 2.0, 369.8), v3(-61.8, 2.0, 369.8), 0.04, 4);
  sign(b, 'BIG APPLE COASTER', '#1a0a0a', '#ffd23a', 9, 1.3, -53, 5.55, 366.2, Math.PI, 'RIDE THE CAB • 67 MPH', 0.12);
  mg.flush(b);

  // Train: five yellow cab cars
  const checker = canvasTex(256, 32, (ctx, w, h) => {
    for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) {
      ctx.fillStyle = ((x + y) / 16) % 2 ? '#111111' : '#f4f4f0';
      ctx.fillRect(x, y, 16, 16);
    }
  });
  const cars: THREE.Group[] = [];
  const nCars = 5;
  const gap = 2.75;
  for (let i = 0; i < nCars; i++) {
    const c = coasterCar(i === 0, checker);
    b.scene.add(c);
    cars.push(c);
  }
  const iStop = nearestIndex(pos, v3(-57, 1.2, 371));
  const sStop = iStop * ds;
  const relOf = (i: number) => ((((i - iStop) % N) + N) % N) * ds;
  const liftStart = relOf(nearestIndex(pos, v3(...CP[3])));
  const liftEnd = relOf(nearestIndex(pos, v3(...CP[6])));
  const yTop = Math.max(...pos.map((p) => p.y));
  let state: 'dwell' | 'run' = 'dwell';
  let dwell = 8;
  let traveled = 0;
  let speed = 0;
  let riding = false;
  let done = false;
  const P = new THREE.Vector3();
  const F = new THREE.Vector3();
  const U = new THREE.Vector3();
  const Lf = new THREE.Vector3();
  const frameAt = (s: number) => {
    const ss = ((s % L) + L) % L;
    const f = ss / ds;
    const i0 = Math.floor(f) % N;
    const i1 = (i0 + 1) % N;
    const k = f - Math.floor(f);
    P.lerpVectors(pos[i0], pos[i1], k);
    F.lerpVectors(fwd[i0], fwd[i1], k).normalize();
    U.lerpVectors(upv[i0], upv[i1], k).normalize();
    Lf.crossVectors(U, F).normalize();
    U.crossVectors(F, Lf).normalize();
  };
  const head = { p: new THREE.Vector3(), f: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(0, 1, 0) };
  const placeCars = () => {
    for (let i = 0; i < nCars; i++) {
      frameAt(sStop + traveled - i * gap);
      m4.makeBasis(Lf, U, F);
      cars[i].quaternion.setFromRotationMatrix(m4);
      cars[i].position.copy(P).addScaledVector(U, 0.06);
      if (i === 0) {
        head.p.copy(P);
        head.f.copy(F);
        head.u.copy(U);
      }
    }
  };
  placeCars();
  b.every((dt) => {
    if (state === 'dwell') {
      dwell -= dt;
      speed = 0;
      if (dwell <= 0) {
        state = 'run';
        traveled = 0;
      }
    } else {
      frameAt(sStop + traveled);
      let v: number;
      if (traveled < liftStart) v = 2.6;
      else if (traveled < liftEnd) v = 3.6;
      else v = Math.max(4, Math.sqrt(Math.max(0, 13 + 2 * 9.81 * (yTop - P.y) - 1.7 * (traveled - liftEnd))));
      const remain = L - traveled;
      if (remain < 32) v = Math.min(v, 1.6 + remain * 0.32);
      speed = THREE.MathUtils.lerp(speed, v, Math.min(1, dt * 3));
      traveled += speed * dt;
      if (traveled >= L) {
        traveled = 0;
        state = 'dwell';
        dwell = 11;
        if (riding) done = true;
      }
    }
    placeCars();
  });
  const tmp = new THREE.Vector3();
  b.rideables.push({
    id: 'big-apple-coaster',
    kind: 'coaster',
    label: 'The Big Apple Coaster',
    boardRadius: 7,
    boardPoint: (out) => out.set(-53, 1.0, 368.6),
    seat: (out) => out.copy(head.p).addScaledVector(head.u, 0.72).addScaledVector(head.f, -0.35),
    yaw: () => Math.atan2(head.f.x, head.f.z),
    exitPoint: (out) => out.set(-53, 1.05, 368.4),
    canBoard: () => (state === 'dwell' && dwell > 1.5 ? { ok: true } : { ok: false, reason: 'The cab is out on the track — wait for it to roll back into the station' }),
    onBoard: () => {
      riding = true;
      done = false;
    },
    onExit: () => {
      riding = false;
      done = false;
    },
    wantsExit: () => done,
    boardPrompt: 'Press [G] to ride the Big Apple Coaster (one lap in a yellow cab)',
    ridingPrompt: 'BIG APPLE COASTER — hang on to that cigarette! [G] bail out at the station',
    status: () => {
      if (state === 'dwell') return 'Lap bars down… departing shortly';
      if (traveled < liftEnd) return 'Clack-clack-clack… up the lift hill';
      tmp.copy(head.u);
      if (tmp.y < 0) return 'HEARTLINE ROLL!';
      return `${Math.round(speed * 2.237)} mph past the Manhattan skyline`;
    },
  });
  b.zone('Big Apple Coaster Station', -64, -42, 365.8, 374.2);
  b.staticMarkers.push({ x: -53, z: 369, color: '#ffd23a', glyph: '⛟', size: 2.6 });
  b.pickup(-60.5, 1.4, 368.4, 3, 'Big Apple Coaster Queue Pack', false);
}

function coasterCar(front: boolean, checker: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const yellow = mat(0xf4c21b, 0.35, 0.3);
  const black = mat(0x15161a, 0.5, 0.3);
  const seat = mat(0x6a1018, 0.7);
  const chrome = mat(0xd8dce4, 0.2, 0.9);
  g.add(mesh(new THREE.BoxGeometry(1.4, 0.22, 2.2), black, 0, 0.2, 0));
  for (const sx of [-0.62, 0.62]) for (const sz of [-0.8, 0.8]) {
    const w = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 10), black, sx, 0.12, sz);
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }
  g.add(mesh(new THREE.BoxGeometry(1.7, 0.55, 2.4), yellow, 0, 0.6, 0, true));
  g.add(mesh(new THREE.BoxGeometry(1.74, 0.14, 2.3), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.5 }), 0, 0.82, 0));
  g.add(mesh(new THREE.BoxGeometry(1.7, 0.3, 0.3), yellow, 0, 1.0, -1.05));
  for (const sz of [-0.5, 0.45]) {
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.22, 0.55), seat, 0, 0.95, sz));
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.55, 0.12), seat, 0, 1.2, sz - 0.3));
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), chrome, 0, 1.25, sz + 0.25));
  }
  if (front) {
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.35, 0.8), yellow, 0, 0.98, 1.0));
    g.add(mesh(new THREE.BoxGeometry(1.76, 0.16, 0.14), chrome, 0, 0.42, 1.25));
    for (const hx of [-0.55, 0.55]) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10), basic(0xfff5cc), hx, 0.8, 1.22).rotateX(Math.PI / 2));
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.22, 0.24), basic(0xfff3c4), 0, 1.28, 0.95));
  }
  bakeGroup(g);
  return g;
}

// ================================================================ Excalibur
function turret(b: WorldBuilder, mg: Merger, x: number, z: number, r: number, h: number, roof: THREE.Material, y0 = 0): void {
  const white = mat(0xf4f1ea, 0.7);
  const slit = mat(0x1a1a22, 0.6);
  mg.add(new THREE.CylinderGeometry(r, r * 1.04, h, 16).translate(x, y0 + h / 2, z), white, true);
  mg.add(new THREE.CylinderGeometry(r * 1.16, r * 1.04, 0.9, 16).translate(x, y0 + h + 0.45, z), white);
  mg.add(new THREE.ConeGeometry(r * 1.28, r * 2.5, 16).translate(x, y0 + h + 0.9 + r * 1.25, z), roof, true);
  mg.add(new THREE.SphereGeometry(0.22, 8, 6).translate(x, y0 + h + 0.95 + r * 2.5, z), mat(0xe8b93a, 0.3, 0.8));
  for (let k = 0; k < 3; k++) mg.box(slit, x + r * 0.98, y0 + h * (0.35 + k * 0.2), z, 0.1, 0.9, 0.22);
  b.collider(x - r, x + r, z - r, z + r, y0, y0 + h + 1, true);
}

function buildExcalibur(b: WorldBuilder): void {
  const zS = zFromS(-1935); // 529.6
  paving(b, -30, -48, TROP_S, RING_S, '#d8cdb8', '#b7a98f');
  paving(b, -19, -48, RING_S, zS - 0.3, '#d8cdb8', '#b7a98f');
  const mg = new Merger();
  buildCasinoFloor(b, {
    id: 'excalibur',
    casinoName: 'Excalibur',
    minX: -78,
    maxX: -50,
    minZ: 472,
    maxZ: 516,
    height: 10,
    entrance: { side: 'east', at: 482, width: 8 },
    carpet: ['#4a1016', '#d4a640', '#1f3f86'],
    wall: 0xf2efe6,
    ceiling: 0x2a2030,
    ceilingGlow: 0x3a1a10,
    light: 0xffc98a,
    slots: {
      accent: '#ffcf4a',
      topper: 0xd9362b,
      rows: [
        { x: -64, z: 507, count: 9, along: 'x', facing: Math.PI },
        { x: -75.4, z: 494, count: 7, along: 'z', facing: Math.PI / 2 },
      ],
    },
    slotLabel: "Excalibur 'Sword in the Stone' Slots",
    tables: [
      { game: 'craps', x: -63, z: 490, label: 'Excalibur Craps' },
      { game: 'roulette', x: -63, z: 499, label: "King Arthur's Roulette" },
      { game: 'blackjack', x: -71, z: 478, rot: Math.PI / 2, label: 'Round Table Blackjack' },
    ],
    felt: 0x7a1414,
    guard: { kick: [-38, 482] },
    pickups: [
      { x: -76, z: 474.5, amount: 3, label: 'Round Table Lounge Pack' },
      { x: -63, z: 490, y: 1.3, amount: 4, label: 'Excalibur Craps Rail Pack!' },
    ],
    tourists: [
      { pts: [[-54, 484.5], [-73, 484.5], [-73, 503], [-54, 503]], prop: 'yard-drink' },
      { pts: [[-57, 476], [-57, 513]], prop: 'cig' },
    ],
  });

  const red = mat(0xc8202e, 0.45, 0.25);
  const blue = mat(0x2a5cc4, 0.45, 0.25);
  const goldR = mat(0xe8b93a, 0.4, 0.4);
  const white = mat(0xf4f1ea, 0.7);
  // Front turrets (the castle's Strip face) and the gatehouse over the drawbridge
  for (const [tz, r, h, roof] of [
    [472.6, 2.8, 15, red],
    [475.8, 2.0, 12, blue],
    [488.2, 2.0, 12, goldR],
    [496, 2.4, 13.5, red],
    [504, 2.0, 11, blue],
    [511.5, 2.4, 13, goldR],
    [515.8, 2.8, 15.5, red],
  ] as Array<[number, number, number, THREE.Material]>) turret(b, mg, -49.2, tz, r, h, roof);
  b.box(-50, 10, 482, 3.5, 5.2, 11, white, true);
  for (let z = 477; z <= 487; z += 1.6) mg.box(white, -48.5, 15.75, z, 0.8, 1.1, 0.8);
  for (const tz of [477, 487]) turret(b, mg, -50.5, tz, 1.5, 6.5, blue, 10);
  // Crenellations on the casino walls
  for (let z = 473; z <= 515; z += 1.6) if (z < 476 || z > 488) mg.box(white, -50.1, 11.35, z, 0.9, 1.1, 0.8);
  for (let x = -77; x <= -51; x += 1.6) for (const z of [472, 516]) mg.box(white, x, 11.35, z, 0.8, 1.1, 0.9);
  // Rooftop turret cluster
  for (const [tx, tz, r, h, roof] of [
    [-58, 482, 2.6, 8, red],
    [-61, 494, 3.2, 12, blue],
    [-58, 506, 2.6, 8, goldR],
    [-68, 486, 2.2, 10, goldR],
    [-68, 502, 2.2, 10, red],
    [-72, 494, 2.8, 14, blue],
  ] as Array<[number, number, number, number, THREE.Material]>) turret(b, mg, tx, tz, r, h, roof, 10.8);
  sign(b, 'EXCALIBUR', '#2a0a0a', '#ffd24d', 10, 2.1, -48.1, 12.9, 482, Math.PI / 2);

  // Moat + drawbridge
  const water = new THREE.MeshStandardMaterial({ color: 0x2a7a9a, roughness: 0.06, metalness: 0.5, emissive: 0x0a3040, emissiveIntensity: 0.35 });
  const stone = mat(0xd8d0c0, 0.8);
  for (const [a, c] of [
    [472, 478],
    [486, 516],
  ]) {
    b.floor(-44.15, (a + c) / 2, 5.3, c - a, water, 0.06);
    b.waterZones.push({ name: 'Excalibur Moat', minX: -46.8, maxX: -41.5, minZ: a, maxZ: c, y: 0.06 });
    b.box(-41.25, 0, (a + c) / 2, 0.5, 0.5, c - a, stone);
    b.box(-47.05, 0, (a + c) / 2, 0.5, 0.5, c - a, stone);
  }
  b.feature({ kind: 'water', x: -44.15, z: 494, w: 5.3, d: 44, color: '#2a7a9a' });
  const plank = mat(0x6b4a2a, 0.85);
  b.box(-44.15, 0, 482, 6.4, 0.4, 8, plank, false, false);
  for (let z = 478.5; z <= 485.5; z += 1) mg.box(mat(0x4a3220, 0.9), -44.15, 0.41, z, 6.3, 0.03, 0.08);
  const chain = mat(0x2a2a30, 0.5, 0.8);
  for (const z of [478.4, 485.6]) mg.beam(chain, v3(-48.3, 8.5, z), v3(-41.2, 0.45, z), 0.06, 4);

  // Hotel towers: two white slabs in a V behind the castle, red hip roofs + corner turrets
  const exSkin: FacadeSpec = { wall: '#f2efe6', mullion: '#ffffff', glass: '#7a2a2a', lit: '#ffe6b0', cols: 10, rows: 18, style: 0, seed: 331 };
  const roofRed = mat(0xa8161e, 0.5, 0.2);
  for (const [tz, ry] of [
    [481, -0.45],
    [508, 0.45],
  ]) {
    tower(b, { x: -92, z: tz, w: 11, d: 30, h: 34, facade: { ...exSkin, seed: 331 + tz }, rotY: ry, minimal: true, roof: 0x8a1a1a, accent: 0xff5a3a });
    const rg = new THREE.ConeGeometry(Math.SQRT2, 5, 4);
    rg.rotateY(Math.PI / 4);
    rg.scale(5.9, 1, 15.6);
    rg.rotateY(ry);
    rg.translate(-92, 34.8 + 2.5, tz);
    mg.add(rg, roofRed, true);
    for (const s of [-1, 1]) {
      const ex = -92 + Math.sin(ry) * 15 * s;
      const ez = tz + Math.cos(ry) * 15 * s;
      turret(b, mg, ex, ez, 1.5, 3, roofRed, 34.8);
    }
  }
  // On the north tower's Strip-facing face (normal = local +x rotated by −0.45)
  b.add(neonSign('EXCALIBUR', '#2a0a0a', '#ffd24d', 9, 1.8), -92 + Math.cos(0.45) * 5.85, 30, 481 + Math.sin(0.45) * 5.85, Math.PI / 2 - 0.45);

  // Frontage: LED marquee, palms, planters
  ledPylon(
    b,
    new LedBoard('EXCALIBUR', ['TOURNAMENT OF KINGS', 'THUNDER FROM DOWN UNDER', 'FUN DUNGEON MIDWAY', 'ROUND TABLE BUFFET'], ['#b3121f', '#1f3f86', '#d4a640', '#2a7a3a']),
    -23.4,
    476,
    7.2,
    11,
    7
  );
  turret(b, mg, -23.4, 476, 1.0, 1.2, red, 18.6);
  let seed = 40;
  for (const z of [482, 496, 506, 516, 526]) palmInto(mg, -23.2, z, 7 + (seed % 3) * 0.6, seed++);
  for (const z of [477, 497, 509, 521]) palmInto(mg, -31.5, z, 6.5, seed++);
  mg.flush(b);

  b.building(-64, 494, 28, 44, '#f2efe6', 'Excalibur');
  b.building(-92, 494, 22, 60, '#f2efe6');
  b.zone('Excalibur', -105, -19, TROP_S, zS);
  b.zone('Excalibur Drawbridge', -48, -40, 477.5, 486.5);
  b.crowd.tourists.push(
    { pts: [[-35, 474], [-35, 527]], prop: 'camera' },
    { pts: [[-30, 482], [-40, 482], [-30, 482.5]], prop: 'bag' }
  );
}

// ================================================================ Mandalay Bay Tram
function buildTram(b: WorldBuilder): void {
  const cx = -40;
  const deckTop = 6.8;
  const z0 = 488;
  const z1 = 651.5;
  const zc = (z0 + z1) / 2;
  const len = z1 - z0;
  const stations = [
    { name: 'EXCALIBUR', z: zFromS(-1819) },
    { name: 'LUXOR', z: zFromS(-2144) },
    { name: 'MANDALAY BAY', z: zFromS(-2408) },
  ];
  const conc = mat(0xd6d2c8, 0.8);
  const conc2 = mat(0xbdb8ae, 0.85);
  const mg = new Merger();
  b.box(cx, 6.0, zc, 8, 0.8, len, conc, false, false);
  mg.box(conc2, cx, 5.3, zc, 3.2, 1.4, len);
  b.collider(cx - 1.6, cx + 1.6, z0, z1, 4.6, 6.0);
  for (let z = z0 + 7; z < z1 - 3; z += 13) {
    mg.add(new THREE.CylinderGeometry(0.75, 0.9, 4.6, 12).translate(cx, 2.3, z), conc2, true);
    mg.box(conc2, cx, 4.3, z, 6.2, 0.6, 2.2);
    b.collider(cx - 0.9, cx + 0.9, z - 0.9, z + 0.9, 0, 4.6, true);
  }
  const guide = mat(0xa8a49a, 0.8);
  for (const tx of [-38.2, -41.8]) for (const s of [-1, 1]) mg.box(guide, tx + s * 1.55, deckTop + 0.15, zc, 0.25, 0.3, len);
  const fascia = new THREE.MeshStandardMaterial({ color: 0x2a3a44, emissive: 0x3ad8ff, emissiveIntensity: 0.1, roughness: 0.4 });
  b.nightGlow(fascia, 0.05, 1.6);
  for (const s of [-1, 1]) mg.box(fascia, cx + s * 4.02, 6.35, zc, 0.06, 0.18, len);

  const platMat = mat(0x8a8f96, 0.7, 0.2);
  const roofMat = mat(0x24303a, 0.5, 0.5);
  const colMat = mat(0x3a4048, 0.4, 0.7);
  const stairMat = mat(0x9a968c, 0.8);
  const glass = new THREE.MeshStandardMaterial({ color: 0xa8e4ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2 });
  for (const st of stations) {
    const zs = st.z;
    b.box(-34.5, 6.0, zs, 3, 0.8, 30, platMat, false, false);
    b.box(-45.5, 6.0, zs, 3, 0.8, 30, platMat, false, false);
    b.box(cx, 11.6, zs, 15.6, 0.35, 31, roofMat, false, true);
    // Canopy columns (kept clear of the stair landing at the north end)
    for (const px of [-33.25, -46.75]) for (const dz of [-10.5, -3.5, 3.5, 10.5, 14.6]) {
      mg.box(colMat, px, (deckTop + 11.6) / 2, zs + dz, 0.3, 11.6 - deckTop, 0.3);
      b.collider(px - 0.2, px + 0.2, zs + dz - 0.2, zs + dz + 0.2, deckTop, 11.6, true);
    }
    b.box(-33.08, deckTop, zs + 1.5, 0.08, 2.4, 27, glass, true, false);
    b.box(-46.92, deckTop, zs, 0.08, 2.4, 30, glass, true, false);
    sign(b, st.name, '#081a26', '#9fe8ff', 7, 1.1, -32.25, 10.75, zs, Math.PI / 2, 'MANDALAY BAY TRAM • FREE', 0.1);
    sign(b, st.name, '#081a26', '#9fe8ff', 5, 0.8, cx, 10.9, zs - 15.4, Math.PI, 'TRAM STATION', 0.1);
    stairs(b, -20.6, zs - 13.7, '-x', 2.6, deckTop, 12.4, stairMat);
    for (const s of [-1, 1]) mg.beam(colMat, v3(-20.8, 1.0, zs - 13.7 + s * 1.35), v3(-33, deckTop + 1.0, zs - 13.7 + s * 1.35), 0.04, 4);
    b.zone(`${st.name === 'MANDALAY BAY' ? 'Mandalay Bay' : st.name === 'LUXOR' ? 'Luxor' : 'Excalibur'} Tram Station`, -47, -20.6, zs - 15.5, zs + 15.5);
    b.staticMarkers.push({ x: -40, z: zs, color: '#9fe8ff', glyph: 'T', size: 2.4 });
  }
  mg.flush(b);

  // Trains: Local (east track, every station) and Express (west track, Mandalay ↔ Excalibur)
  const winMat = new THREE.MeshStandardMaterial({ color: 0x1a2632, roughness: 0.1, metalness: 0.6, emissive: 0xfff0d0, emissiveIntensity: 0.05 });
  b.nightGlow(winMat, 0.04, 0.9);
  interface TramTrain {
    g: THREE.Group;
    x: number;
    platX: number;
    seq: number[];
    k: number;
    z: number;
    from: number;
    to: number;
    t: number;
    dur: number;
    dwell: number;
    riding: boolean;
    boardStop: number;
    done: boolean;
    name: string;
  }
  const trains: TramTrain[] = [
    { x: -38.2, platX: -34.5, seq: [0, 1, 2, 1], k: 0, name: 'Local', dwell: 8 },
    { x: -41.8, platX: -45.5, seq: [0, 2], k: 1, name: 'Express', dwell: 3 },
  ].map((d) => {
    const g = tramTrain(winMat);
    b.scene.add(g);
    const z = stations[d.seq[d.k]].z;
    g.position.set(d.x, deckTop, z);
    return { ...d, g, z, from: z, to: z, t: 0, dur: 1, riding: false, boardStop: -1, done: false };
  });
  b.every((dt) => {
    for (const tr of trains) {
      if (tr.dwell > 0) {
        tr.dwell -= dt;
        if (tr.dwell <= 0) {
          tr.from = tr.z;
          tr.k = (tr.k + 1) % tr.seq.length;
          tr.to = stations[tr.seq[tr.k]].z;
          tr.dur = Math.abs(tr.to - tr.from) / 7.5 + 4;
          tr.t = 0;
        }
      } else {
        tr.t += dt;
        const u = Math.min(1, tr.t / tr.dur);
        tr.z = tr.from + (tr.to - tr.from) * (0.5 - 0.5 * Math.cos(Math.PI * u));
        if (u >= 1) {
          tr.z = tr.to;
          tr.dwell = 15;
          if (tr.riding && tr.seq[tr.k] !== tr.boardStop) tr.done = true;
        }
      }
      tr.g.position.z = tr.z;
    }
  });
  for (const tr of trains) {
    b.rideables.push({
      id: `tram-${tr.name.toLowerCase()}`,
      kind: 'tram',
      label: `Mandalay Bay Tram (${tr.name})`,
      boardRadius: 6.5,
      boardPoint: (out) => out.set(tr.platX, deckTop, tr.z),
      seat: (out) => out.set(tr.x, deckTop + 3.02, tr.z + 3),
      yaw: () => (tr.to >= tr.from ? 0 : Math.PI),
      exitPoint: (out) => out.set(tr.platX, deckTop + 0.05, tr.z),
      canBoard: () => (tr.dwell > 1.5 ? { ok: true } : { ok: false, reason: 'Doors are closed — catch it at the next station' }),
      onBoard: () => {
        tr.riding = true;
        tr.done = false;
        tr.boardStop = tr.seq[tr.k];
      },
      onExit: () => {
        tr.riding = false;
        tr.done = false;
      },
      wantsExit: () => tr.done,
      boardPrompt: `Press [G] to surf the ${tr.name} Mandalay Bay Tram (free, station to station)`,
      ridingPrompt: 'Tram-surfing on the Mandalay Bay Tram roof — [E] smoke • [G] hop off',
      status: () => (tr.dwell > 0 ? `Doors open — ${stations[tr.seq[tr.k]].name}` : `Next station: ${stations[tr.seq[tr.k]].name}`),
    });
  }
  b.pickup(-34.6, deckTop + 0.45, stations[2].z + 9, 2, 'Tram Platform Pack', false);
  b.feature({ kind: 'road', x: cx, z: zc, w: 8, d: len, color: '#bdb8ae', label: 'Tram' });
  b.zone('Mandalay Bay Tram Guideway', -44, -36, z0, z1);
}

function tramTrain(winMat: THREE.MeshStandardMaterial): THREE.Group {
  const train = new THREE.Group();
  const shell = mat(0xeceef0, 0.3, 0.55);
  const stripe = mat(0xc9a04a, 0.35, 0.6);
  const dark = mat(0x22262c, 0.6, 0.3);
  const door = mat(0xa8aeb6, 0.4, 0.5);
  for (const cz of [-9.2, 0, 9.2]) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(2.5, 0.35, 8.2), dark, 0, 0.3, 0));
    g.add(mesh(new THREE.BoxGeometry(2.7, 1.2, 8.8), shell, 0, 1.05, 0, true));
    g.add(mesh(new THREE.BoxGeometry(2.72, 1.0, 8.4), winMat, 0, 2.15, 0));
    g.add(mesh(new THREE.BoxGeometry(2.7, 0.35, 8.8), shell, 0, 2.82, 0));
    g.add(mesh(new THREE.BoxGeometry(2.74, 0.12, 8.82), stripe, 0, 1.55, 0));
    for (let z = -3.5; z <= 3.5; z += 1.75) for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.06, 1.0, 0.16), shell, s * 1.37, 2.15, z));
    for (const s of [-1, 1]) for (const dz of [-2.2, 2.2]) g.add(mesh(new THREE.BoxGeometry(0.05, 2.0, 1.3), door, s * 1.37, 1.5, dz));
    bakeGroup(g, (m) => m.material === winMat);
    g.position.z = cz;
    train.add(g);
  }
  for (const s of [-1, 1]) {
    const cap = mesh(new THREE.BoxGeometry(2.6, 1.1, 0.3), mat(0x0f1820, 0.1, 0.7), 0, 2.1, s * 13.55);
    cap.rotation.x = s * 0.2;
    train.add(cap);
    for (const hx of [-0.8, 0.8]) train.add(mesh(new THREE.BoxGeometry(0.3, 0.18, 0.06), basic(s > 0 ? 0xfff6d8 : 0xff3030), hx, 0.9, s * 13.62));
  }
  for (const cz of [-4.6, 4.6]) train.add(mesh(new THREE.BoxGeometry(1.6, 2.2, 0.5), dark, 0, 1.5, cz));
  return train;
}

// ================================================================ Luxor
/** Four triangular faces with planar UVs (u across the base, v up the slope) so window rows stay level. */
function pyramidGeometry(half: number, h: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const corners: Array<[number, number]> = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  const apex = v3(0, h, 0);
  for (let i = 0; i < 4; i++) {
    let A = v3(corners[i][0], 0, corners[i][1]);
    let C = v3(corners[(i + 1) % 4][0], 0, corners[(i + 1) % 4][1]);
    const n = new THREE.Vector3().subVectors(C, A).cross(new THREE.Vector3().subVectors(apex, A)).normalize();
    const mid = v3((A.x + C.x) / 2, 0, (A.z + C.z) / 2);
    if (n.dot(mid) < 0) {
      const t = A;
      A = C;
      C = t;
      n.negate();
    }
    for (const p of [A, C, apex]) {
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
    }
    uv.push(0, 0, 1, 0, 0.5, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  return g;
}

function buildLuxor(b: WorldBuilder): void {
  const zN = zFromS(-1935); // 529.6
  const zS = zFromS(-2347); // 621.1
  const px = -78;
  const pz = zFromS(-2138); // 574.7
  const half = 28;
  const h = 34;
  paving(b, -19, -50, zN + 0.3, zS - 0.3, '#d9c6a0', '#b8a47e');
  const mg = new Merger();

  // Black-glass pyramid
  const skin = facadeMaterial(b, { wall: '#0d1116', mullion: '#1a2129', glass: '#0a0d12', lit: '#ffcf8a', cols: 16, rows: 14, style: 2, seed: 401 }, half * 2, Math.hypot(h, half), { metal: 0.85, rough: 0.12, glow: 1.0 });
  // Skin with a doorway notch on the east face; hollow inside (the atrium, grandLuxor.ts)
  const pyr = new THREE.Mesh(luxorSkinGeometry(half, h), skin);
  pyr.position.set(px, 0, pz);
  pyr.receiveShadow = true;
  pyr.castShadow = true; // shades the atrium floor so it reads as indoors
  b.add(pyr);
  luxorColliders(b, px, pz, half, h);
  buildLuxorAtrium(b, px, pz, half, h);
  const edgeGlow = new THREE.MeshStandardMaterial({ color: 0x2a2e36, emissive: 0xfff2d8, emissiveIntensity: 0.05, roughness: 0.3 });
  b.nightGlow(edgeGlow, 0.02, 1.4);
  for (const [cxx, czz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) mg.beam(edgeGlow, v3(px + cxx * half, 0.1, pz + czz * half), v3(px, h, pz), 0.12, 4);
  mg.at(mat(0x3a4250, 0.1, 0.9), new THREE.ConeGeometry(2.2 * Math.SQRT2, 2.6, 4).rotateY(Math.PI / 4), px, h - 1.1, pz);
  // LUXOR letters lying on the east face
  const luxSign = neonSign('LUXOR', '#05060a', '#ffe9b0', 13, 2.6, undefined, 0.2);
  luxSign.rotation.y = Math.PI / 2;
  luxSign.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(half, h)));
  const fy = 15;
  b.add(luxSign, px + half - (fy / h) * half + 0.22, fy + 0.16, pz);

  // The Sky Beam
  const beamMat = beamMaterial(0xfff6dc, 0.7);
  const beam = mesh(new THREE.CylinderGeometry(2.6, 2.2, 900, 18, 1, true), beamMat, px, h + 450, pz);
  beam.frustumCulled = false;
  b.scene.add(beam); // outside the static bake: it's a shader light shaft, not geometry to merge
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  b.add(mesh(new THREE.SphereGeometry(3.2, 12, 8), coreMat, px, h + 0.6, pz));
  b.every((_dt, t, night) => {
    beamMat.uniforms.opacity.value = night * (1.15 + 0.08 * Math.sin(t * 0.7));
    beam.visible = night > 0.02;
    coreMat.opacity = night * 0.55;
  });

  // Entrance pavilion on the east face (under the tram's west platform)
  const sand = mat(0xd2b48a, 0.85);
  const sandDark = mat(0xb39669, 0.85);
  // Walk-in doorway through the pavilion into the pyramid (z pz ± 3.1, 4.6 m tall)
  b.box(-49, 0, pz - 5.05, 6, 5.4, 3.9, sand, true);
  b.box(-49, 0, pz + 5.05, 6, 5.4, 3.9, sand, true);
  b.box(-49, 4.6, pz, 6, 0.8, 6.2, sand, true);
  for (let z = pz - 6; z <= pz + 6; z += 3) {
    if (Math.abs(z - pz) < 1) continue;
    mg.add(new THREE.CylinderGeometry(0.42, 0.5, 4.8, 10).translate(-45.6, 2.4, z), sand, true);
    mg.add(new THREE.CylinderGeometry(0.7, 0.42, 0.6, 10).translate(-45.6, 5.1, z), mat(0xe8c060, 0.5, 0.4));
  }
  mg.box(sandDark, -45.6, 5.55, pz, 1.4, 0.5, 14.5);
  b.add(mesh(new THREE.BoxGeometry(0.2, 0.25, 6.4), basic(0xffd9a0), -45.95, 4.5, pz));

  buildSphinx(b, mg, -28.6, zFromS(-2173));
  // Obelisk with glowing hieroglyphs
  const glyphs = canvasTex(256, 1024, (ctx, w, hh) => {
    ctx.fillStyle = '#c9ad7e';
    ctx.fillRect(0, 0, w, hh);
    ctx.fillStyle = '#5a4428';
    for (let col = 0; col < 8; col++) {
      for (let row = 0; row < 32; row++) {
        const x = col * 32 + 8;
        const y = row * 32 + 6;
        const k = (col * 7 + row * 13) % 5;
        if (k === 0) ctx.fillRect(x, y, 16, 20);
        else if (k === 1) {
          ctx.beginPath();
          ctx.arc(x + 8, y + 10, 8, 0, Math.PI * 2);
          ctx.fill();
        } else if (k === 2) {
          ctx.fillRect(x + 6, y, 4, 22);
          ctx.fillRect(x, y + 4, 16, 4);
        } else if (k === 3) {
          ctx.beginPath();
          ctx.moveTo(x, y + 20);
          ctx.lineTo(x + 8, y);
          ctx.lineTo(x + 16, y + 20);
          ctx.fill();
        } else ctx.fillRect(x, y + 8, 16, 6);
      }
    }
  });
  const obMat = new THREE.MeshStandardMaterial({ map: glyphs, emissiveMap: glyphs, emissive: 0xffd9a0, emissiveIntensity: 0.0, roughness: 0.8 });
  b.nightGlow(obMat, 0.0, 0.55);
  const obZ = 547;
  b.box(-26, 0, obZ, 4.4, 1.4, 4.4, sandDark, true);
  const shaft = new THREE.CylinderGeometry(1.25 * Math.SQRT2, 1.6 * Math.SQRT2, 17, 4, 1);
  shaft.rotateY(Math.PI / 4);
  b.add(mesh(shaft, obMat, -26, 1.4 + 8.5, obZ, true));
  mg.at(mat(0xe8b93a, 0.3, 0.85), new THREE.ConeGeometry(1.25 * Math.SQRT2, 2.4, 4).rotateY(Math.PI / 4), -26, 1.4 + 17 + 1.2, obZ);
  b.collider(-27.7, -24.3, obZ - 1.7, obZ + 1.7, 1.4, 20.6, true);

  ledPylon(
    b,
    new LedBoard('LUXOR', ['CARROT TOP LIVE', 'TITANIC: THE ARTIFACT EXHIBITION', 'FANTASY • 18+', 'THE SKY BEAM IS ON'], ['#1f3f86', '#c9a04a', '#7a1c6a', '#0a6a7a']),
    -23.4,
    604,
    7,
    11,
    6.5
  );
  let seed = 60;
  for (const z of [534, 554, 569, 595, 613]) palmInto(mg, -23.2, z, 7.2, seed++);
  for (const z of [556, 596]) palmInto(mg, -36, z, 6.6, seed++);
  mg.flush(b);

  b.building(px, pz, half * 2, half * 2, '#14181e', 'Luxor');
  b.staticMarkers.push({ x: px, z: pz, color: '#fff2c0', glyph: '▲', size: 3.2 });
  b.zone('Luxor', -110, -19, zN, zS);
  b.zone('Luxor Obelisk', -29, -23, obZ - 3, obZ + 3);
  b.crowd.tourists.push(
    { pts: [[-22, 536], [-22, 574], [-38, 574]], prop: 'camera' },
    { pts: [[-38, 592], [-22, 592], [-22, 616]], prop: 'cig' }
  );
}

/** Luxor's sandstone Sphinx facing the Boulevard (walkable plinth and paws). */
function buildSphinx(b: WorldBuilder, mg: Merger, x: number, z: number): void {
  const sand = mat(0xd2b48a, 0.85);
  const sandDark = mat(0xb39669, 0.85);
  const stripes = canvasTex(64, 64, (ctx, w, h) => {
    for (let y = 0; y < h; y += 8) {
      ctx.fillStyle = (y / 8) % 2 ? '#d8b04a' : '#2a4f9e';
      ctx.fillRect(0, y, w, 8);
    }
  });
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping;
  stripes.repeat.set(1, 3);
  const nemes = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 });
  const dark = mat(0x2a2218, 0.7);
  const P = (lx: number, ly: number, lz: number) => [x + lx, ly, z + lz] as const;
  const box = (m: THREE.Material, lx: number, ly: number, lz: number, w: number, h: number, d: number) => {
    const [wx, wy, wz] = P(lx, ly, lz);
    mg.box(m, wx, wy, wz, w, h, d, 0, true);
  };
  box(sandDark, 0, 0.6, 0, 16.4, 1.2, 7.6);
  b.collider(x - 8.2, x + 8.2, z - 3.8, z + 3.8, 0, 1.2);
  box(sand, -3.6, 2.9, 0, 8.4, 3.4, 5.4);
  const back = new THREE.CylinderGeometry(2.7, 2.7, 8.4, 16);
  back.rotateZ(Math.PI / 2);
  back.scale(1, 0.45, 1);
  mg.at(sand, back, x - 3.6, 4.6, z);
  for (const s of [-1, 1]) mg.add(new THREE.SphereGeometry(1.6, 12, 8).scale(1.3, 0.9, 0.6).translate(x - 5.6, 2.8, z + s * 2.5), sand);
  box(sand, 1.2, 3.3, 0, 2.6, 4.2, 5.0);
  for (const s of [-1, 1]) {
    box(sand, 4.2, 1.85, s * 1.75, 6.6, 1.3, 1.5);
    box(sand, 7.6, 1.7, s * 1.75, 1.2, 1.0, 1.6);
  }
  box(sand, 2.0, 6.6, 0, 2.3, 2.5, 2.3);
  box(nemes, 1.8, 8.1, 0, 2.7, 0.6, 2.9);
  box(nemes, 0.9, 6.2, 0, 1.2, 2.6, 2.7);
  for (const s of [-1, 1]) box(nemes, 2.55, 5.6, s * 1.42, 0.6, 2.6, 0.62);
  box(sand, 3.3, 6.55, 0, 0.36, 0.52, 0.36);
  for (const s of [-1, 1]) box(dark, 3.17, 7.1, s * 0.45, 0.06, 0.18, 0.42);
  box(dark, 3.17, 6.05, 0, 0.06, 0.08, 0.6);
  box(nemes, 3.0, 4.9, 0, 0.45, 1.1, 0.5);
  box(mat(0xe8b93a, 0.3, 0.85), 3.17, 7.85, 0, 0.12, 0.5, 0.22);
  mg.beam(sand, v3(x - 7.8, 1.6, z + 2.6), v3(x - 1, 1.4, z + 2.85), 0.18, 6);
  b.collider(x - 7.8, x + 2.5, z - 2.7, z + 2.7, 1.2, 5.8, true);
  b.collider(x + 0.7, x + 3.2, z - 1.5, z + 1.5, 5.4, 8.4, true);
  for (const s of [-1, 1]) b.collider(x + 0.9, x + 8.2, z + s * 1.75 - 0.8, z + s * 1.75 + 0.8, 1.2, 2.5);
  b.pickup(x + 7.4, 2.95, z - 1.75, 3, 'Sphinx Paw Offering Pack', false);
  b.zone('Great Sphinx of Luxor', x - 8.2, x + 8.2, z - 3.8, z + 3.8);
}

// ================================================================ Mandalay Bay / W / Four Seasons
function buildMandalay(b: WorldBuilder): void {
  const zN = zFromS(-2347); // 621.1
  const zS = zFromS(-2775); // 716.2
  paving(b, -19, -46, zN + 0.3, zS - 0.3, '#d8c8a8', '#b7a584');
  const mg = new Merger();

  // Casino base
  const baseMat = facadeMaterial(b, { wall: '#c9a26a', mullion: '#e8c98a', glass: '#3a2a18', lit: '#ffd9a0', cols: 6, rows: 3, style: 1, seed: 411 }, 50, 12);
  const roofM = mat(0x4a4038, 0.8);
  const base = new THREE.Mesh(new THREE.BoxGeometry(38, 12, 50), [baseMat, baseMat, roofM, roofM, baseMat, baseMat]);
  base.position.set(-65, 6, 673);
  base.castShadow = true;
  base.receiveShadow = true;
  b.add(base);
  b.collider(-84, -46, 648, 698, 0, 12, true);
  mg.box(mat(0xd4a640, 0.3, 0.8), -65, 11.8, 673, 38.6, 0.6, 50.6);

  // Gold Y tower (stepped wings)
  const gold: FacadeSpec = { wall: '#d4a640', mullion: '#f2c46a', glass: '#b88a2a', lit: '#fff0c0', cols: 10, rows: 26, style: 2, seed: 412 };
  const tcx = -66;
  const tcz = 671;
  const angs = [Math.PI / 3 - 0.25, Math.PI - 0.25, (5 * Math.PI) / 3 - 0.25];
  angs.forEach((a, i) => {
    for (const [r0, r1, hh] of [
      [0, 15, 46],
      [13, 22, 40],
      [20, 28, 32],
    ]) {
      const rm = (r0 + r1) / 2;
      tower(b, { x: tcx + Math.cos(a) * rm, z: tcz + Math.sin(a) * rm, w: r1 - r0, d: 11, h: hh, facade: { ...gold, seed: 412 + i * 3 + r0 }, rotY: -a, metal: 0.85, rough: 0.18, minimal: true, accent: 0xffe6a0 });
    }
    if (i !== 1) {
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      sign(b, 'MANDALAY BAY', '#2a1a06', '#fff6dc', 9.5, 2.2, tcx + dx * 22.35, 36, tcz + dz * 22.35, Math.atan2(dx, dz));
    }
  });

  // Entrance + porte-cochère
  mg.box(mat(0x2a2016, 0.4, 0.6), -43, 4.8, 662, 6, 0.5, 14);
  b.add(mesh(new THREE.BoxGeometry(5.6, 0.06, 13.6), basic(0xfff0c8), -43, 4.52, 662));
  for (const z of [656, 668]) {
    mg.add(new THREE.CylinderGeometry(0.35, 0.35, 4.6, 10).translate(-40.4, 2.3, z), mat(0xd4a640, 0.3, 0.8));
    b.collider(-40.8, -40, z - 0.4, z + 0.4, 0, 4.6, true);
  }
  b.add(mesh(new THREE.BoxGeometry(0.15, 3.4, 8), basic(0xffd9a0), -45.95, 1.7, 662));
  ground(b, -24, -40, 655, 669, 0x2b2b30, L1, 0.85);
  ledPylon(
    b,
    new LedBoard('MANDALAY BAY', ['MICHELOB ULTRA ARENA', 'SHARK REEF AQUARIUM', 'MANDALAY BAY BEACH', 'HOUSE OF BLUES'], ['#c9a04a', '#0f6a7a', '#d0502a', '#2a3a8a']),
    -23.4,
    650,
    7,
    11,
    7
  );

  // Tropical lagoon + waterfall on the frontage
  const water = new THREE.MeshStandardMaterial({ color: 0x1f8a9a, roughness: 0.05, metalness: 0.4, emissive: 0x0a4050, emissiveIntensity: 0.4 });
  b.floor(-28.25, 680, 11.5, 20, water, 0.06);
  b.waterZones.push({ name: 'Mandalay Lagoon', minX: -34, maxX: -22.5, minZ: 670, maxZ: 690, y: 0.06 });
  b.feature({ kind: 'water', x: -28.25, z: 680, w: 11.5, d: 20, color: '#1f8a9a' });
  const rock = mat(0x6a5a4a, 0.95);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rx = -28.25 + Math.cos(a) * 6.3;
    const rz = 680 + Math.sin(a) * 10.6;
    mg.add(new THREE.DodecahedronGeometry(0.8 + (i % 3) * 0.25, 0).translate(rx, 0.4, rz), rock);
  }
  b.box(-35.4, 0, 680, 1.8, 4.4, 14, rock, true);
  const fall = new THREE.MeshStandardMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.6, emissive: 0x8fdfff, emissiveIntensity: 0.25, roughness: 0.1, depthWrite: false });
  b.add(mesh(new THREE.PlaneGeometry(10, 4.2), fall, -34.45, 2.15, 680).rotateY(Math.PI / 2));
  b.add(mesh(new THREE.PlaneGeometry(1.2, 10).rotateX(-Math.PI / 2), basic(0xf4fdff, { transparent: true, opacity: 0.55 }), -33.6, 0.08, 680));
  let seed = 80;
  for (const [x, z] of [
    [-23.2, 626],
    [-23.2, 640],
    [-23.2, 667.5],
    [-23.2, 692.5],
    [-24, 697.5],
    [-36.5, 671],
    [-37, 690],
    [-31, 694],
    [-24.5, 667],
    [-45, 640],
    [-45, 702],
  ]) palmInto(mg, x, z, 7 + (seed % 4) * 0.7, seed++);

  // Four Seasons (own lobby + porte-cochère at the south end)
  b.box(-36, 0, 706.5, 16, 8, 13, mat(0xe8dcc4, 0.7), true);
  mg.box(mat(0xcab896, 0.6), -36, 8.2, 706.5, 16.6, 0.5, 13.6);
  mg.box(mat(0x2a2620, 0.4, 0.5), -24, 4.6, 706.5, 8, 0.4, 9);
  b.add(mesh(new THREE.BoxGeometry(7.6, 0.06, 8.6), basic(0xfff0d8), -24, 4.38, 706.5));
  for (const cxx of [-21, -27]) for (const czz of [702.5, 710.5]) {
    mg.add(new THREE.CylinderGeometry(0.25, 0.25, 4.4, 10).translate(cxx, 2.2, czz), mat(0xe8dcc4, 0.6));
    b.collider(cxx - 0.3, cxx + 0.3, czz - 0.3, czz + 0.3, 0, 4.4, true);
  }
  sign(b, 'FOUR SEASONS', '#1a1612', '#e8dcc0', 7.6, 1.1, -19.95, 4.6, 706.5, Math.PI / 2, 'HOTEL LAS VEGAS', 0.12);
  b.add(planter(2, 2, 0xffffff), -28, 0, 700.5);
  b.add(planter(2, 2, 0xffffff), -28, 0, 712.5);

  // W Las Vegas (ex-Delano) — bronze-gold slab
  tower(b, { x: -102, z: 636, w: 12, d: 30, h: 46, facade: { wall: '#9a7638', mullion: '#c09a50', glass: '#5a4022', lit: '#ffe0a8', cols: 10, rows: 28, style: 2, seed: 420 }, rotY: 0.12, metal: 0.75, rough: 0.2, accent: 0xffd27a });
  sign(b, 'W', '#000000', '#ffffff', 4, 4, -95.75, 33, 636, Math.PI / 2 + 0.12, undefined, 0.3);

  // Mandalay Bay Beach (wave pool + sand) behind the tower
  ground(b, -95, -140, 676, 714, 0xe2cfa4, L0, 0.98);
  const pool = new THREE.MeshStandardMaterial({ color: 0x2bb6d9, roughness: 0.05, metalness: 0.2, emissive: 0x0b4a66, emissiveIntensity: 0.5 });
  b.floor(-118, 695, 28, 24, pool, 0.06);
  b.waterZones.push({ name: 'Mandalay Bay Beach Wave Pool', minX: -132, maxX: -104, minZ: 683, maxZ: 707, y: 0.06 });
  b.feature({ kind: 'water', x: -118, z: 695, w: 28, d: 24, color: '#2bb6d9' });
  const lounger = mat(0xf4f1ea, 0.6);
  const umb = mat(0xe8541a, 0.7, 0, { side: THREE.DoubleSide });
  for (let z = 680; z <= 710; z += 3.4) {
    for (const lx of [-99, -136]) {
      mg.box(lounger, lx, 0.3, z, 1.8, 0.3, 0.8);
      if (Math.round(z) % 2 === 0) {
        mg.beam(mat(0xdddddd, 0.4, 0.5), v3(lx + 1.2, 0, z), v3(lx + 1.2, 2.4, z), 0.04, 4);
        mg.add(new THREE.ConeGeometry(1.4, 0.5, 8, 1, true).translate(lx + 1.2, 2.5, z), umb);
      }
    }
  }
  for (const [x, z] of [
    [-97, 678],
    [-97, 712],
    [-138, 678],
    [-138, 712],
    [-118, 711],
  ]) palmInto(mg, x, z, 6.6, seed++);
  sign(b, 'MANDALAY BAY BEACH', '#0a2a30', '#ffd27a', 7, 1.1, -118, 2.6, 676.4, Math.PI, 'WAVE POOL • LAZY RIVER', 0.12);
  mg.flush(b);

  b.building(tcx, tcz, 56, 56, '#d4a640', 'Mandalay Bay');
  b.building(-65, 673, 38, 50, '#c9a26a');
  b.building(-102, 636, 12, 30, '#9a7638', 'W');
  b.building(-36, 706.5, 16, 13, '#e8dcc4', 'Four Seasons');
  b.zone('Mandalay Bay', -145, -19, zN, zS);
  b.zone('W Las Vegas', -110, -94, 620, 652);
  b.zone('Four Seasons Las Vegas', -44, -19, 699, zS);
  b.zone('Mandalay Bay Beach', -140, -95, 676, 714);
  b.crowd.tourists.push({ pts: [[-38, 652], [-38, 666], [-26, 666], [-26, 652]], prop: 'yard-drink' }, { pts: [[-110, 680], [-128, 680], [-128, 710], [-110, 710]], prop: 'yard-drink' });
}

/** West side between Four Seasons Dr and Russell Rd: desert-landscaped berm + billboard. */
function buildWestSouth(b: WorldBuilder): void {
  const z0 = zFromS(-2775) + 0.4;
  const z1 = RUSSELL_N - 0.2;
  ground(b, -19, -118, z0, z1, 0xb8a27e, L0, 0.98);
  const mg = new Merger();
  let seed = 120;
  for (let z = z0 + 6; z < z1 - 3; z += 10) palmInto(mg, -23.3, z, 7.4, seed++);
  for (let i = 0; i < 6; i++) agaveBed(mg, -32 - (i % 2) * 14, z0 + 8 + i * 12, 4, 3, i);
  for (let i = 0; i < 8; i++) mg.add(new THREE.DodecahedronGeometry(0.6 + (i % 3) * 0.4, 0).translate(-45 - (i * 7) % 40, 0.3, z0 + 5 + i * 9), mat(0x8a6a4a, 0.95));
  billboard(b, mg, -32, 752, 'INJURED? CALL 702-555-0188', 'THE CAT LAWYERS • WE FIGHT FOR YOU', '#f2c230', '#111111');
  mg.flush(b);
  b.zone('Mandalay Bay South Lawn', -118, -19, z0, z1);
}

function billboard(b: WorldBuilder, mg: Merger, x: number, z: number, text: string, sub: string, bg: string, fg: string): void {
  const steel = mat(0x5a5e66, 0.5, 0.6);
  mg.add(new THREE.CylinderGeometry(0.5, 0.6, 10, 10).translate(x, 5, z), steel, true);
  mg.box(steel, x, 10.1, z, 14.6, 0.3, 1.2);
  mg.box(steel, x, 10.1, z - 0.9, 14.6, 0.08, 0.6);
  b.add(neonSign(text, bg, fg, 14, 4.6, sub, 0.5), x, 12.6, z);
  b.collider(x - 0.6, x + 0.6, z - 0.6, z + 0.6, 0, 10, true);
}

// ================================================================ Allegiant Stadium (decorative, west of I-15)
function buildAllegiant(b: WorldBuilder): void {
  const x = -285;
  const z = zFromS(-2681); // 695.3
  const mg = new Merger();
  const shell = mat(0x0b0c10, 0.22, 0.85);
  const body = mesh(new THREE.CylinderGeometry(34, 30, 24, 56, 1), shell, x, 12, z);
  body.scale.set(1.12, 1, 1);
  b.add(body);
  const rib = mat(0x2a2d33, 0.4, 0.8);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    mg.beam(rib, v3(x + Math.cos(a) * 30.2 * 1.12, 0, z + Math.sin(a) * 30.2), v3(x + Math.cos(a) * 34.2 * 1.12, 24, z + Math.sin(a) * 34.2), 0.3, 4);
  }
  const band = new THREE.MeshStandardMaterial({ color: 0x1a1d22, emissive: 0xe8f0ff, emissiveIntensity: 0.05, roughness: 0.3 });
  b.nightGlow(band, 0.02, 1.4);
  const ring = new THREE.TorusGeometry(34.1, 0.35, 6, 72);
  ring.rotateX(Math.PI / 2);
  ring.scale(1.12, 1, 1);
  mg.at(band, ring, x, 23.6, z);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xd8dde4, transparent: true, opacity: 0.88, roughness: 0.3, metalness: 0.2, emissive: 0xf4f8ff, emissiveIntensity: 0.05 });
  b.nightGlow(roofMat, 0.03, 1.3);
  const roof = new THREE.SphereGeometry(38, 56, 12, 0, Math.PI * 2, 0, 1.1);
  roof.scale(1.12, 0.3, 1);
  b.add(mesh(roof, roofMat, x, 24 - 38 * Math.cos(1.1) * 0.3, z));
  const lanai = new THREE.MeshStandardMaterial({ color: 0x141820, emissive: 0xffd9a0, emissiveIntensity: 0.05, roughness: 0.1, metalness: 0.6 });
  b.nightGlow(lanai, 0.05, 1.5);
  b.add(mesh(new THREE.PlaneGeometry(28, 15), lanai, x + 33.4 * 1.12, 9, z).rotateY(Math.PI / 2));
  sign(b, 'ALLEGIANT STADIUM', '#050505', '#f2f2f2', 22, 2.6, x + 34.5 * 1.12, 20.5, z, Math.PI / 2);
  // Al Davis Memorial Torch
  mg.add(new THREE.CylinderGeometry(0.7, 1.5, 12, 12).translate(x + 44, 6, z + 26), mat(0xf2f2f0, 0.4, 0.3));
  mg.flush(b);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.85 });
  const flame = mesh(new THREE.ConeGeometry(1.0, 3.2, 10), flameMat, x + 44, 13.6, z + 26);
  b.scene.add(flame);
  b.every((_dt, t) => {
    flame.scale.set(1 + Math.sin(t * 9) * 0.08, 1 + Math.sin(t * 6.3) * 0.15, 1 + Math.cos(t * 8) * 0.08);
  });
}

// ================================================================ Showcase Mall: M&M'S World + Coca-Cola
function buildShowcase(b: WorldBuilder): void {
  const zN = zFromS(-1095); // 342.2
  const zS = zFromS(-1376); // 405.3
  // NB: ABC Store slot x 19…46, z 348…374 belongs to the main session.
  const fac = facadeMaterial(b, { wall: '#6f7c86', mullion: '#9aa6b0', glass: '#2a3640', lit: '#e8f2ff', cols: 6, rows: 4, style: 2, seed: 421 }, 30, 16, { metal: 0.6, rough: 0.25 });
  const roof = mat(0x3a3d44, 0.7);
  const blockA = new THREE.Mesh(new THREE.BoxGeometry(22, 16, 31), [fac, fac, roof, roof, fac, fac]);
  blockA.position.set(57, 8, 359.5);
  b.add(blockA);
  b.collider(46, 68, 344, 375, 0, 16, true);
  const blockB = new THREE.Mesh(new THREE.BoxGeometry(38, 16, 29.8), [fac, fac, roof, roof, fac, fac]);
  blockB.position.set(49, 8, 390.1);
  b.add(blockB);
  b.collider(30, 68, 375.2, 405, 0, 16, true);
  paving(b, 19, 30, 375, zS, '#c8c0b0', '#a59c8a');
  const mg = new Merger();

  // M&M'S World façade: candy-coloured glass fins + giant characters on the canopy
  const candy = [0xc8202e, 0xf2781e, 0xf4c21b, 0x2a9a4a, 0x1f5fc4, 0x5a3a22];
  candy.forEach((c, i) => {
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.1, roughness: 0.3, metalness: 0.2 });
    b.nightGlow(m, 0.1, 1.2);
    b.add(mesh(new THREE.PlaneGeometry(2.6, 9.5), m, 29.9, 5.6 + (i % 2) * 0.4, 386 + i * 3.2).rotateY(-Math.PI / 2));
  });
  sign(b, "M&M'S WORLD", '#3a1a0a', '#ffd400', 12, 2.6, 29.7, 13.2, 394, -Math.PI / 2, 'LAS VEGAS • 4 FLOORS OF CHOCOLATE');
  mg.box(mat(0x2a1a10, 0.4, 0.5), 28.6, 4.6, 394, 2.8, 0.4, 18);
  b.collider(27.2, 30, 385, 403, 4.4, 4.8);
  b.add(mesh(new THREE.BoxGeometry(0.15, 3.0, 6), basic(0xffe9a0), 29.95, 1.5, 394));
  for (const [c, zc, ry] of [
    [0xc8202e, 389, -0.25],
    [0xf4c21b, 399, 0.25],
  ] as Array<[number, number, number]>) {
    const g = mmCharacter(c);
    g.position.set(28.3, 4.8, zc);
    g.rotation.y = ry;
    bakeHierarchy(g);
    b.add(g);
  }

  // The giant Coca-Cola bottle
  const bx = 24.6;
  const bz = 379.4;
  const profile = [
    [0.01, 0],
    [1.2, 0],
    [1.28, 0.3],
    [1.3, 1.2],
    [1.18, 2.4],
    [1.05, 3.4],
    [1.15, 4.6],
    [1.3, 5.8],
    [1.3, 6.8],
    [1.12, 7.8],
    [0.8, 8.9],
    [0.55, 9.9],
    [0.46, 10.8],
    [0.48, 11.2],
    [0.44, 11.5],
    [0.01, 11.52],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x7fcf9f, transparent: true, opacity: 0.62, roughness: 0.08, metalness: 0.3, emissive: 0x2a8a5a, emissiveIntensity: 0.05 });
  b.nightGlow(glassMat, 0.04, 0.6);
  b.add(mesh(new THREE.LatheGeometry(profile, 40), glassMat, bx, 0.5, bz));
  const label = canvasTex(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d0101e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic bold 84px "Brush Script MT", "Segoe Script", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Coca-Cola', w * 0.25, h / 2);
    ctx.fillText('Coca-Cola', w * 0.75, h / 2);
  });
  const labelMat = new THREE.MeshStandardMaterial({ map: label, emissiveMap: label, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.5 });
  b.nightGlow(labelMat, 0.05, 0.8);
  b.add(mesh(new THREE.CylinderGeometry(1.315, 1.315, 1.0, 40, 1, true), labelMat, bx, 0.5 + 6.3, bz));
  mg.add(new THREE.CylinderGeometry(0.5, 0.5, 0.45, 24).translate(bx, 0.5 + 11.7, bz), mat(0xd0101e, 0.4, 0.4));
  mg.add(new THREE.CylinderGeometry(1.8, 1.95, 0.5, 24).translate(bx, 0.25, bz), mat(0x6a0a10, 0.6));
  b.collider(bx - 1.9, bx + 1.9, bz - 1.9, bz + 1.9, 0, 0.5);
  b.collider(bx - 1.3, bx + 1.3, bz - 1.3, bz + 1.3, 0.5, 12.5, true);
  sign(b, 'Coca-Cola STORE', '#c8102e', '#ffffff', 6.6, 1.5, 29.75, 8.6, 379.8, -Math.PI / 2, 'EVERYTHING COCA-COLA');
  mg.box(mat(0x8a0a12, 0.5, 0.3), 28.8, 4.2, 379.8, 2.4, 0.35, 6.5);
  b.add(mesh(new THREE.BoxGeometry(0.15, 2.8, 3.6), basic(0xffe0d8), 29.95, 1.4, 379.8));
  mg.flush(b);

  b.building(57, 359.5, 22, 31, '#6f7c86', 'Showcase');
  b.building(49, 390, 38, 30, '#6f7c86', "M&M'S");
  b.zone("Showcase Mall • M&M'S World", 19, 68, zN, zS);
  b.zone('Coca-Cola Store', 19, 30, 375, 384.5);
  b.crowd.tourists.push({ pts: [[21, 376.5], [27, 386], [21, 402]], prop: 'camera' });
}

function bakeHierarchy(root: THREE.Object3D): void {
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh && o.children.length > 0) groups.push(o);
  });
  for (const g of groups) bakeGroup(g);
}

/** Giant M&M'S spokescandy (faces −x, toward the Boulevard). */
function mmCharacter(color: number): THREE.Group {
  const g = new THREE.Group();
  const shell = mat(color, 0.25, 0.1);
  const white = mat(0xffffff, 0.5);
  const black = mat(0x111111, 0.4);
  const body = mesh(new THREE.SphereGeometry(1.55, 20, 14), shell, 0, 2.1, 0, true);
  body.scale.set(0.55, 1, 0.92);
  g.add(body);
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.34, 12, 10), white, -0.72, 2.75, s * 0.42));
    g.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), black, -0.98, 2.72, s * 0.4));
    g.add(mesh(beamGeo(v3(-0.2, 2.0, s * 1.3), v3(-0.5, 1.4, s * 1.85), 0.08, 6), white));
    g.add(mesh(new THREE.SphereGeometry(0.24, 10, 8), white, -0.55, 1.35, s * 1.9));
    g.add(mesh(beamGeo(v3(0, 0.75, s * 0.45), v3(0, 0, s * 0.5), 0.08, 6), black));
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.3, 0.42), white, -0.15, 0.12, s * 0.52));
  }
  const smile = mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 16, Math.PI), black, -0.84, 2.15, 0);
  smile.rotation.set(0, Math.PI / 2, Math.PI);
  g.add(smile);
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.55, 0.62), white, -0.86, 1.6, 0));
  return g;
}

// ================================================================ MGM Grand
function buildMGMGrand(b: WorldBuilder): void {
  const zN = zFromS(-1376); // 405.3
  paving(b, 19, 44, zN, RING_N, '#cfc6b4', '#aea38e');
  paving(b, 30, 44, RING_N, TROP_N, '#cfc6b4', '#aea38e');
  const mg = new Merger();
  const emer = facadeMaterial(b, { wall: '#1f7a52', mullion: '#e0c27a', glass: '#0f4a32', lit: '#d8ffe8', cols: 6, rows: 3, style: 1, seed: 431 }, 48, 13);
  const roofM = mat(0x2a3a30, 0.8);
  const pod = new THREE.Mesh(new THREE.BoxGeometry(48, 13, 19), [emer, emer, roofM, roofM, emer, emer]);
  pod.position.set(68, 6.5, 415.1);
  pod.castShadow = true;
  pod.receiveShadow = true;
  b.add(pod);
  b.collider(44, 92, 405.6, 424.6, 0, 13, true);
  const goldM = mat(0xd4a640, 0.3, 0.85);
  mg.box(goldM, 68, 12.7, 415.1, 48.6, 0.8, 19.6);
  mg.box(goldM, 68, 5.0, 415.1, 48.4, 0.3, 19.4);

  // Emerald-glass X tower
  const em: FacadeSpec = { wall: '#2f9e6a', mullion: '#5fd29a', glass: '#1d5e40', lit: '#d8ffe8', cols: 10, rows: 22, style: 2, seed: 432 };
  const tx = 97;
  const tz = 400;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    tower(b, { x: tx + Math.cos(a) * 10, z: tz + Math.sin(a) * 10, w: 24, d: 12, h: 38, facade: { ...em, seed: 432 + k }, rotY: -a, metal: 0.55, rough: 0.2, minimal: true, accent: 0x7dffb8 });
    if (k === 1 || k === 2) {
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      sign(b, 'MGM GRAND', '#05200f', '#eafff0', 11, 2.2, tx + dx * 22.35, 33, tz + dz * 22.35, Math.atan2(dx, dz));
    }
  }

  // Main entrance canopy facing the Boulevard
  mg.box(mat(0x0f2a1c, 0.4, 0.6), 41, 5.1, 409.4, 6, 0.5, 7.4);
  b.add(mesh(new THREE.BoxGeometry(5.6, 0.06, 7.0), basic(0xfff0c8), 41, 4.82, 409.4));
  b.add(mesh(new THREE.BoxGeometry(0.15, 3.4, 6), basic(0xffe9b0), 43.95, 1.7, 409.4));
  sign(b, 'MGM GRAND', '#05200f', '#ffe9a0', 9, 1.6, 43.7, 8.8, 415, -Math.PI / 2, 'THE CITY OF ENTERTAINMENT');

  // Bronze lion on its pedestal at the Tropicana corner
  const lx = 36.5;
  const lz = 418;
  b.box(lx, 0, lz, 6.2, 3.2, 4.6, mat(0x8a7a62, 0.7), true);
  mg.box(mat(0xa8977a, 0.6), lx, 3.3, lz, 6.6, 0.2, 5.0);
  mg.box(mat(0xa8977a, 0.6), lx, 0.25, lz, 7.0, 0.5, 5.4);
  buildLion(mg, lx, 3.4, lz);
  b.collider(lx - 3.6, lx + 3.6, lz - 2.6, lz + 2.6, 3.2, 7.8, true);
  b.add(planter(1.6, 1.6, 0xff4d7a), lx - 4.2, 0, lz - 3.2);
  b.add(planter(1.6, 1.6, 0xffd34d), lx - 4.2, 0, lz + 3.2);

  ledPylon(
    b,
    new LedBoard('MGM GRAND', ['DAVID COPPERFIELD', 'KÀ • CIRQUE DU SOLEIL', 'MGM GRAND GARDEN ARENA', 'BETMGM SPORTSBOOK'], ['#1f7a52', '#c9a04a', '#7a1c2a', '#1a3a8a']),
    23.6,
    408.4,
    8,
    12,
    7
  );
  mg.flush(b);
  b.building(97, 400, 32, 32, '#2f9e6a', 'MGM Grand');
  b.building(68, 415, 48, 19, '#1f7a52');
  b.zone('MGM Grand', 19, 122, zN, TROP_N);
  b.zone('MGM Grand Lion', 32, 41, 414.5, 421.5);
  b.crowd.performers.push({ kind: 'slapper', x: 16, z: 398, facing: -Math.PI / 2 });
}

function buildLion(mg: Merger, x: number, y: number, z: number): void {
  const bronze = mat(0xb38a3e, 0.35, 0.85);
  const S = (r: number, sx: number, sy: number, sz: number, px: number, py: number, pz: number) =>
    mg.add(new THREE.SphereGeometry(r, 14, 10).scale(sx, sy, sz).translate(x + px, y + py, z + pz), bronze, true);
  S(1, 2.2, 1.05, 1.0, 0.3, 1.9, 0);
  S(1.25, 1.0, 1.25, 1.1, -1.5, 2.5, 0);
  S(0.75, 1, 1, 1, -2.25, 3.2, 0);
  S(0.42, 1.2, 0.8, 1, -2.95, 2.95, 0);
  for (const s of [-1, 1]) {
    mg.add(new THREE.ConeGeometry(0.2, 0.4, 6).translate(x - 2.0, y + 3.9, z + s * 0.45), bronze);
    mg.beam(bronze, v3(x - 1.6, y + 1.8, z + s * 0.55), v3(x - 1.9, y + 0.1, z + s * 0.55), 0.34, 8, 0.28);
    S(0.3, 1.4, 0.6, 1, -2.05, 0.15, s * 0.55);
    S(0.85, 1.2, 1, 0.7, 1.6, 1.6, s * 0.55);
    mg.beam(bronze, v3(x + 1.8, y + 1.3, z + s * 0.6), v3(x + 1.6, y + 0.1, z + s * 0.6), 0.3, 8, 0.25);
    S(0.28, 1.4, 0.6, 1, 1.4, 0.15, s * 0.6);
  }
  mg.beam(bronze, v3(x + 2.4, y + 1.9, z), v3(x + 3.2, y + 1.2, z + 0.3), 0.1, 6, 0.08);
  mg.beam(bronze, v3(x + 3.2, y + 1.2, z + 0.3), v3(x + 3.5, y + 0.4, z + 0.5), 0.08, 6, 0.07);
  S(0.2, 1, 1, 1, 3.55, 0.3, 0.5);
}

// ================================================================ Athletics ballpark (under construction)
function trussArch(mg: Merger, m: THREE.Material, x: number, zc: number, span: number, rise: number, depth: number, width: number, segs: number): void {
  const pt = (t: number, inner: boolean, side: number) => {
    const th = Math.PI * t;
    const a = span / 2 - (inner ? depth : 0);
    const r = rise - (inner ? depth : 0);
    return v3(x + (side * width) / 2, Math.sin(th) * r, zc - Math.cos(th) * a);
  };
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    for (const side of [-1, 1]) {
      mg.beam(m, pt(t0, false, side), pt(t1, false, side), 0.24, 6, 0.24, true);
      mg.beam(m, pt(t0, true, side), pt(t1, true, side), 0.2, 6);
      mg.beam(m, pt(t0, i % 2 === 0, side), pt(t1, i % 2 !== 0, side), 0.1, 5);
      mg.beam(m, pt(t0, true, side), pt(t0, false, side), 0.1, 5);
    }
    mg.beam(m, pt(t0, false, -1), pt(t0, false, 1), 0.08, 4);
    mg.beam(m, pt(t0, true, -1), pt(t1, true, 1), 0.07, 4);
  }
}

function towerCrane(b: WorldBuilder, mgStatic: Merger, x: number, z: number, mastH: number, jibL: number, color: number, phase: number, speed: number): void {
  const paint = mat(color, 0.5, 0.4);
  for (const [cx, cz] of [
    [-0.9, -0.9],
    [0.9, -0.9],
    [-0.9, 0.9],
    [0.9, 0.9],
  ]) mgStatic.box(paint, x + cx, mastH / 2, z + cz, 0.2, mastH, 0.2, 0, true);
  for (let y = 0; y < mastH; y += 3) {
    for (const [ax, az, bx, bz] of [
      [-0.9, -0.9, 0.9, -0.9],
      [0.9, -0.9, 0.9, 0.9],
      [0.9, 0.9, -0.9, 0.9],
      [-0.9, 0.9, -0.9, -0.9],
    ]) {
      mgStatic.beam(paint, v3(x + ax, y, z + az), v3(x + bx, y, z + bz), 0.06, 4);
      mgStatic.beam(paint, v3(x + ax, y, z + az), v3(x + bx, y + 3, z + bz), 0.05, 4);
    }
  }
  mgStatic.box(mat(0x8a8a86, 0.8), x, 0.5, z, 4, 1, 4);
  b.collider(x - 1.1, x + 1.1, z - 1.1, z + 1.1, 0, mastH, true);
  const jib = new THREE.Group();
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => jib.add(new THREE.Mesh(g, m));
  add(beamGeo(v3(-1, 0, 0), v3(jibL, 0, 0), 0.12, 4), paint);
  for (const s of [-0.7, 0.7]) add(beamGeo(v3(-1, -1.2, s), v3(jibL, -1.2, s), 0.1, 4), paint);
  for (let k = 0; k < jibL; k += 2.5) {
    add(beamGeo(v3(k, 0, 0), v3(k + 2.5, -1.2, 0.7), 0.05, 4), paint);
    add(beamGeo(v3(k, 0, 0), v3(k + 2.5, -1.2, -0.7), 0.05, 4), paint);
    add(beamGeo(v3(k, -1.2, -0.7), v3(k, -1.2, 0.7), 0.05, 4), paint);
  }
  add(beamGeo(v3(0, -1.2, 0), v3(-jibL * 0.32, -1.2, 0), 0.25, 4), paint);
  add(new THREE.BoxGeometry(4, 2.6, 2.4).translate(-jibL * 0.3, -2, 0), mat(0x777777, 0.6));
  add(new THREE.BoxGeometry(2.2, 2.2, 2.2).translate(0.6, -2.4, 1.6), mat(0xe8e8e8, 0.5));
  add(beamGeo(v3(0, -1.2, 0), v3(0, 6, 0), 0.25, 4), paint);
  add(beamGeo(v3(0, 6, 0), v3(jibL * 0.7, 0, 0), 0.04, 3), mat(0x222222, 0.5));
  add(beamGeo(v3(0, 6, 0), v3(-jibL * 0.3, -1, 0), 0.04, 3), mat(0x222222, 0.5));
  add(new THREE.BoxGeometry(1.2, 0.5, 1.6).translate(jibL * 0.62, -1.5, 0), mat(0x333333, 0.6));
  add(beamGeo(v3(jibL * 0.62, -1.7, 0), v3(jibL * 0.62, -mastH * 0.55, 0), 0.03, 3), mat(0x222222, 0.5));
  add(new THREE.BoxGeometry(0.8, 0.9, 0.8).translate(jibL * 0.62, -mastH * 0.55 - 0.4, 0), mat(0xf2c230, 0.5));
  bakeGroup(jib);
  jib.add(mesh(new THREE.SphereGeometry(0.25, 6, 4), basic(0xff2a2a), jibL, 0.3, 0));
  jib.add(mesh(new THREE.SphereGeometry(0.25, 6, 4), basic(0xff2a2a), 0, 6.3, 0));
  jib.position.set(x, mastH + 1.2, z);
  b.scene.add(jib);
  b.every((_dt, t) => {
    jib.rotation.y = phase + Math.sin(t * speed) * 1.1;
  });
}

function buildBallpark(b: WorldBuilder): void {
  const x0 = 20.5;
  const x1 = xFromO(417) - 0.6; // 106.8
  const z0 = TROP_S + 0.6;
  const z1 = zFromS(-1978) - 0.4; // 538.7
  // The NW corner (|x| < 30 near Tropicana) is the skybridge ring's: the site notches around it.
  const xr = 30.3;
  const zr = RING_S + 0.3;
  ground(b, xr, x1, z0, zr, 0x8f7454);
  ground(b, x0, x1, zr, z1, 0x8f7454);
  ground(b, 24, 80, 474, 524, 0x6e5238, L1);
  const mg = new Merger();

  // Perimeter fence with windscreen + banners (gate gap on the Boulevard)
  const screen = mat(0x24402e, 0.9);
  const fenceRuns: Array<[number, number, number, number]> = [
    [x0, zr, x0, 497],
    [x0, 503, x0, z1],
    [xr, z0, x1, z0],
    [xr, z0, xr, zr],
    [x0, zr, xr, zr],
    [x0, z1, x1, z1],
    [x1, z0, x1, z1],
  ];
  for (const [ax, az, cx, cz] of fenceRuns) {
    const alongX = Math.abs(cx - ax) > Math.abs(cz - az);
    const len = alongX ? Math.abs(cx - ax) : Math.abs(cz - az);
    b.box((ax + cx) / 2, 0, (az + cz) / 2, alongX ? len : 0.15, 2.5, alongX ? 0.15 : len, screen, true, false);
  }
  for (const z of [484, 516, 532]) sign(b, 'ATHLETICS', '#0b3d2e', '#f2c230', 8, 1.5, x0 - 0.12, 1.3, z, -Math.PI / 2, 'LAS VEGAS BALLPARK • COMING 2028', 0.06);
  for (let x = 38; x < x1 - 5; x += 20) sign(b, 'COMING 2028', '#0b3d2e', '#ffffff', 8, 1.5, x, 1.3, z0 - 0.12, Math.PI, 'FUTURE HOME OF THE ATHLETICS', 0.06);
  for (const z of [497, 503]) mg.box(mat(0x8c8f94, 0.4, 0.6), x0, 1.6, z, 0.3, 3.2, 0.3);
  sign(b, 'HARD HAT AREA', '#f2c230', '#111111', 3.4, 0.9, x0 - 0.2, 2.9, 500, -Math.PI / 2, 'AUTHORIZED PERSONNEL ONLY', 0.06);

  // Seating bowl (concrete, horseshoe around home plate, one section still open)
  const hp = { x: 78, z: 499 };
  const conc = mat(0xb5b2aa, 0.9, 0, { side: THREE.DoubleSide });
  const prof = [
    [13, 0],
    [13, 1.2],
    [16, 1.2],
    [16, 2.6],
    [19, 2.6],
    [19, 4.0],
    [22, 4.0],
    [22, 5.4],
    [25, 5.4],
    [25, 6.8],
    [26.5, 6.8],
    [26.5, 0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  for (const [p0, p1] of [
    [-0.3, 1.25],
    [1.75, Math.PI + 0.3],
  ]) {
    mg.at(conc, new THREE.LatheGeometry(prof, 22, p0, p1 - p0), hp.x, 0, hp.z, 0, true);
    for (let p = p0 + 0.12; p < p1; p += 0.26) {
      const rx = hp.x + Math.sin(p) * 20;
      const rz = hp.z + Math.cos(p) * 20;
      b.collider(rx - 2.6, rx + 2.6, rz - 2.6, rz + 2.6, 0, 3.4);
    }
  }
  const steelBlue = mat(0x6b7480, 0.5, 0.6);
  for (const p of [-0.2, 0.3, 0.8, 1.32, 1.5, 1.68, 2.2, 2.7, 3.2]) {
    const ox = Math.sin(p);
    const oz = Math.cos(p);
    const c0 = v3(hp.x + ox * 27.6, 0, hp.z + oz * 27.6);
    mg.beam(steelBlue, c0, v3(c0.x, 16, c0.z), 0.32, 6, 0.32, true);
    mg.beam(steelBlue, v3(hp.x + ox * 21, 7, hp.z + oz * 21), v3(hp.x + ox * 30, 15.5, hp.z + oz * 30), 0.28, 6);
    b.collider(c0.x - 0.35, c0.x + 0.35, c0.z - 0.35, c0.z + 0.35, 0, 16, true);
  }

  // Two big steel truss arches + the first roof trusses and panels between them
  const steel = mat(0x8a929c, 0.45, 0.75);
  const archX = [48, 74];
  const span = 70;
  const rise = 30;
  const zc = 499;
  for (const ax of archX) {
    trussArch(mg, steel, ax, zc, span, rise, 2.6, 2.2, 22);
    for (const s of [-1, 1]) b.box(ax, 0, zc + s * (span / 2 - 1.3), 4, 1.6, 4, mat(0x9a968c, 0.85), true);
  }
  const archPt = (t: number) => v3(0, Math.sin(Math.PI * t) * rise, zc - Math.cos(Math.PI * t) * (span / 2));
  const tVals = [0.36, 0.44, 0.5, 0.56, 0.64];
  for (const t of tVals) {
    const p = archPt(t);
    const xa = archX[0] + 1.1;
    const xb = archX[1] - 1.1;
    mg.beam(steel, v3(xa, p.y, p.z), v3(xb, p.y, p.z), 0.16, 5);
    mg.beam(steel, v3(xa, p.y - 1.8, p.z), v3(xb, p.y - 1.8, p.z), 0.13, 5);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const xx0 = xa + ((xb - xa) * i) / n;
      const xx1 = xa + ((xb - xa) * (i + 1)) / n;
      mg.beam(steel, v3(xx0, i % 2 ? p.y : p.y - 1.8, p.z), v3(xx1, i % 2 ? p.y - 1.8 : p.y, p.z), 0.07, 4);
    }
  }
  for (let i = 0; i < tVals.length - 1; i++) {
    const pa = archPt(tVals[i]);
    const pb = archPt(tVals[i + 1]);
    for (const px of [54, 61, 68]) mg.beam(steel, v3(px, pa.y + 0.1, pa.z), v3(px, pb.y + 0.1, pb.z), 0.08, 4);
    if (i === 1 || i === 2) {
      const lenP = pa.distanceTo(pb);
      const g = new THREE.BoxGeometry(archX[1] - archX[0] - 2, 0.12, lenP);
      g.rotateX(-Math.atan2(pb.y - pa.y, pb.z - pa.z));
      mg.at(mat(0xe8ecef, 0.4, 0.2), g, (archX[0] + archX[1]) / 2, (pa.y + pb.y) / 2 + 0.25, (pa.z + pb.z) / 2, 0, true);
    }
  }

  // Cranes: two slewing tower cranes and a crawler crane lifting a truss segment
  towerCrane(b, mg, 36, 472, 52, 44, 0xf2c230, 0.4, 0.045);
  towerCrane(b, mg, 100, 530, 46, 38, 0xd8302a, 2.4, 0.06);
  const crawler = mat(0xe86a1a, 0.5, 0.4);
  mg.box(mat(0x2a2a2a, 0.8), 60, 0.6, 520, 4.2, 1.2, 6.2);
  mg.box(crawler, 60, 2.2, 520, 3.4, 2.0, 4.4, 0, true);
  const boomA = v3(60, 3.2, 518);
  const boomB = v3(54, 30, 508);
  for (const s of [-0.6, 0.6]) mg.beam(crawler, boomA.clone().add(v3(s, 0, 0)), boomB.clone().add(v3(s * 0.4, 0, 0)), 0.12, 4);
  for (let k = 0; k < 10; k++) mg.beam(crawler, boomA.clone().lerp(boomB, k / 10).add(v3(-0.6, 0, 0)), boomA.clone().lerp(boomB, (k + 1) / 10).add(v3(0.6, 0, 0)), 0.05, 3);
  mg.beam(mat(0x222222, 0.5), boomB, v3(54, 14, 508), 0.03, 3);
  mg.beam(steel, v3(48.6, 13.4, 508), v3(59.4, 13.4, 508), 0.2, 5);
  b.collider(57.5, 62.5, 516.5, 523.5, 0, 3.2, true);

  // Site dressing: trailers, porta-johns, steel stacks, light towers, cones
  b.box(30, 0, 530, 10, 3.2, 3.4, mat(0xeeeeee, 0.6), true);
  sign(b, 'FIELD OFFICE', '#ffffff', '#1a1a1a', 3.4, 0.6, 30, 2.4, 528.2, Math.PI, undefined, 0.05);
  b.box(30, 0, 524.5, 10, 3.2, 3.4, mat(0xd8d8d0, 0.6), true);
  for (let i = 0; i < 4; i++) mg.box(mat(0x2a66cc, 0.6), 96 - i * 1.4, 1.15, 464, 1.2, 2.3, 1.2, 0, true);
  b.collider(91, 97, 463.2, 464.8, 0, 2.3, true);
  for (let i = 0; i < 6; i++) mg.box(mat(0x6b7480, 0.5, 0.6), 40, 0.2 + i * 0.36, 528 + (i % 2) * 0.25, 7, 0.32, 0.5);
  b.collider(36.4, 43.6, 527.5, 528.8, 0, 2.2);
  b.pickup(40, 2.6, 528.1, 4, "Ironworker's Lunch-Break Pack", false);
  for (let i = 0; i < 8; i++) mg.box(mat(0x7a4a2a, 0.8, 0.4), 88, 0.12 + i * 0.13, 470 + i * 0.3, 6, 0.1, 0.1);
  const lamp = new THREE.MeshStandardMaterial({ color: 0xf4f4e8, emissive: 0xfff4d0, emissiveIntensity: 0.05 });
  b.nightGlow(lamp, 0.02, 2.4);
  for (const [lx, lz] of [
    [46, 464],
    [26, 534],
    [100, 476],
    [66, 464],
  ]) {
    mg.beam(mat(0x8a8f94, 0.4, 0.6), v3(lx, 0, lz), v3(lx, 9, lz), 0.12, 6);
    mg.box(lamp, lx, 9.3, lz, 2.0, 0.9, 0.4);
    mg.box(mat(0xf2c230, 0.6), lx, 0.5, lz, 2.4, 1, 1.4);
  }
  for (let i = 0; i < 8; i++) {
    const cone = new THREE.Group();
    cone.add(mesh(new THREE.ConeGeometry(0.2, 0.7, 8), mat(0xff6a00, 0.6), 0, 0.35, 0));
    cone.add(mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), mat(0x222222, 0.7), 0, 0.02, 0));
    b.prop(cone, 23 + (i % 4) * 1.6, 495 + Math.floor(i / 4) * 10, 0.22, 0.7, 'cone');
  }
  mg.flush(b);

  b.feature({ kind: 'plaza', x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, color: '#6b5238', label: "A's Ballpark" });
  b.building(hp.x, hp.z, 50, 53, '#b5b2aa');
  b.zone('Athletics Ballpark Construction Site', 19, x1 + 0.6, TROP_S, z1 + 0.4);
  b.staticMarkers.push({ x: 60, z: 499, color: '#f2c230', glyph: '⚾', size: 2.8 });
}

// ================================================================ OYO (ex-Hooters) — facing Tropicana Ave
function buildOYO(b: WorldBuilder): void {
  const ox = 124;
  const zS = zFromS(-1736); // 485.3
  const mg = new Merger();
  b.box(ox, 0, 465.8, 28, 6, 7.4, mat(0xe8e2d6, 0.7), true);
  mg.box(mat(0xff7a1a, 0.5, 0.2), ox, 5.6, 465.8, 28.4, 0.6, 7.8);
  mg.box(mat(0x2a2420, 0.4, 0.5), ox, 4.1, 461, 12, 0.4, 2.2);
  b.add(mesh(new THREE.BoxGeometry(11.6, 0.06, 1.9), basic(0xfff0c8), ox, 3.88, 461));
  b.add(mesh(new THREE.BoxGeometry(6, 2.8, 0.15), basic(0xffe0b0), ox, 1.4, 462.05));
  sign(b, 'CASINO', '#1a0a00', '#ff9a3a', 5, 1.1, ox, 4.9, 461.9, Math.PI, undefined, 0.1);
  tower(b, { x: ox, z: 476.5, w: 26, d: 12, h: 24, facade: { wall: '#f2efe8', mullion: '#ffffff', glass: '#5a6a78', lit: '#ffe6b0', cols: 10, rows: 16, style: 0, seed: 430 }, accent: 0xff7a1a, noSetback: true });
  sign(b, 'OYO', '#ffffff', '#ee2e24', 6, 3, ox, 20.6, 470.25, Math.PI, undefined, 0.2);
  sign(b, 'OYO', '#ffffff', '#ee2e24', 5, 2.5, ox - 13.15, 20.6, 476.5, -Math.PI / 2, undefined, 0.2);
  // The still-lit oval sign out front (now reading PALETTE)
  const ovalTex = canvasTex(512, 320, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2 - 6, h / 2 - 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ff7a1a';
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;
    ctx.font = 'bold 104px Georgia, serif';
    ctx.fillText('PALETTE', w / 2, h * 0.44, w * 0.8);
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText('LAS VEGAS', w / 2, h * 0.72);
  });
  const ovalMat = new THREE.MeshBasicMaterial({ map: ovalTex, transparent: true, alphaTest: 0.05 });
  const sx = 111.2;
  const sz = 462.6;
  const ry = -2.36;
  for (const flip of [0, Math.PI]) {
    const p = mesh(new THREE.PlaneGeometry(6, 3.75), ovalMat, 0, 0, 0);
    p.rotation.y = ry + flip;
    p.position.set(sx + Math.sin(ry + flip) * 0.06, 8.2, sz + Math.cos(ry + flip) * 0.06);
    b.add(p);
  }
  for (const s of [-1, 1]) {
    const ox2 = sx + Math.cos(ry) * s * 1.6;
    const oz2 = sz - Math.sin(ry) * s * 1.6;
    mg.add(new THREE.CylinderGeometry(0.18, 0.22, 6.4, 8).translate(ox2, 3.2, oz2), mat(0x3a3a40, 0.5, 0.6));
    b.collider(ox2 - 0.25, ox2 + 0.25, oz2 - 0.25, oz2 + 0.25, 0, 6.4, true);
  }
  mg.flush(b);
  b.building(ox, 471, 28, 22, '#f2efe8', 'OYO');
  b.zone('OYO Hotel • Palette Las Vegas', 107.4, 140, TROP_S, zS);
}

// ================================================================ East-side lots: Reno Ave lot, the Diamond lot, the Hacienda lot
function buildEastLots(b: WorldBuilder): void {
  const xE = 107;
  const mg = new Merger();
  const scrub = mat(0x7a8a5a, 0.95);
  const scatter = (z0: number, z1: number, n: number, seed: number) => {
    for (let i = 0; i < n; i++) {
      const x = 24 + (((i * 0.618 + seed) % 1) * (xE - 30));
      const z = z0 + 3 + (((i * 0.382 + seed * 1.7) % 1) * (z1 - z0 - 6));
      mg.add(new THREE.IcosahedronGeometry(0.45 + (i % 3) * 0.2, 0).scale(1, 0.6, 1).translate(x, 0.25, z), scrub);
    }
  };
  // Reno Ave lot (across from Luxor)
  const a0 = zFromS(-1978) + 0.4;
  const a1 = zFromS(-2364) - 0.4;
  ground(b, 19.4, xE, a0, a1, 0xa89272);
  scatter(a0, a1, 40, 0.11);
  chainLink(b, mg, 19.7, a0 + 2, 19.7, 574);
  chainLink(b, mg, 19.7, 582, 19.7, a1 - 2);
  billboard(b, mg, 32, 560, 'INJURED? CALL 702-555-0188', 'THE CAT LAWYERS • WE FIGHT FOR YOU', '#f2c230', '#111111');
  billboard(b, mg, 32, 604, 'ALL-YOU-CAN-EAT CRAB LEGS', 'BUFFET • OPEN 24 HOURS', '#7a1414', '#ffe9a0');
  b.zone('Vacant Lot (Reno Ave)', 19, xE, a0, a1);

  // The Diamond lot across from Mandalay Bay: dirt, fences, event tents
  const d0 = zFromS(-2364); // 624.9
  const d1 = zFromS(-2770); // 715.1
  ground(b, 19.4, xFromO(414), d0, d1, 0x8f7656);
  chainLink(b, mg, 19.7, d0 + 1, 19.7, 660);
  chainLink(b, mg, 19.7, 672, 19.7, d1 - 1);
  chainLink(b, mg, 19.7, d1 - 1, xE - 1, d1 - 1);
  const fabric = mat(0xf4f4f0, 0.7, 0, { side: THREE.DoubleSide });
  for (const [tx, tz] of [
    [50, 648],
    [72, 668],
    [50, 692],
  ]) {
    for (const [wx, wz, ww, wd] of [
      [0, -6, 12, 0.1],
      [-6, 0, 0.1, 12],
      [6, 0, 0.1, 12],
    ]) mg.box(fabric, tx + wx, 1.5, tz + wz, ww, 3, wd, 0, true);
    mg.at(fabric, new THREE.ConeGeometry(8.9, 3.4, 4).rotateY(Math.PI / 4), tx, 4.7, tz, 0, true);
    for (const [cx, cz] of [
      [-6, -6],
      [6, -6],
      [-6, 6],
      [6, 6],
    ]) mg.beam(mat(0xcccccc, 0.4, 0.6), v3(tx + cx, 0, tz + cz), v3(tx + cx, 3.1, tz + cz), 0.06, 4);
    b.collider(tx - 6.1, tx + 6.1, tz - 6.1, tz - 5.9, 0, 3, true);
    b.collider(tx - 6.1, tx - 5.9, tz - 6.1, tz + 6.1, 0, 3, true);
    b.collider(tx + 5.9, tx + 6.1, tz - 6.1, tz + 6.1, 0, 3, true);
  }
  const lampM = new THREE.MeshStandardMaterial({ color: 0xf4f4e8, emissive: 0xfff4d0, emissiveIntensity: 0.05 });
  b.nightGlow(lampM, 0.02, 2.2);
  for (const [lx, lz] of [
    [30, 640],
    [90, 700],
  ]) {
    mg.beam(mat(0x8a8f94, 0.4, 0.6), v3(lx, 0, lz), v3(lx, 8, lz), 0.12, 6);
    mg.box(lampM, lx, 8.3, lz, 2.0, 0.9, 0.4);
  }
  for (let i = 0; i < 3; i++) mg.box(mat(0x2a66cc, 0.6), 30 + i * 1.4, 1.15, 704, 1.2, 2.3, 1.2);
  sign(b, 'EVENT PARKING', '#0a2a5a', '#ffffff', 5, 1.2, 20.6, 2.2, 666, -Math.PI / 2, 'ENTER HERE', 0.08);
  const parked: Array<[CarKind, number, number]> = [
    ['suv', 0x1d1f24, 640],
    ['sedan', 0xd9d9d9, 646],
    ['taxi', 0xf4c430, 652],
  ];
  for (const [k, c, z] of parked) {
    const cc = car(k, c);
    bakeGroup(cc.group);
    b.add(cc.group, 28, 0, z, Math.PI / 2);
    b.collider(25.5, 30.5, z - 1.1, z + 1.1, 0, 1.6);
  }
  b.zone('Diamond Lot (vacant)', 19, xE, d0, d1);

  // Hacienda lot (Four Seasons Dr → Russell Rd)
  const c0 = zFromS(-2770) + 1.2;
  const c1 = RUSSELL_N - 0.2;
  ground(b, 19.4, xE, c0, c1, 0xa89272);
  scatter(c0, c1, 34, 0.53);
  chainLink(b, mg, 19.7, c0 + 1, 19.7, c1 - 1);
  billboard(b, mg, 32, 756, 'FOR LEASE', 'STRIP FRONTAGE • 27 ACRES', '#ffffff', '#c8202e');
  b.zone('Vacant Lot (Hacienda)', 19, xE, c0, c1);
  mg.flush(b);
}

// ================================================================ Pinball Hall of Fame + Dream (stalled)
function buildPinballAndDream(b: WorldBuilder): void {
  const mg = new Merger();
  ground(b, 19.2, 70, RUSSELL_S, 869.5, 0x9a8c74);
  // Pinball Hall of Fame
  const pz = zFromS(-3325); // 838.4
  b.box(52, 0, pz, 24, 7.5, 17, mat(0x4a5f8a, 0.6, 0.4), true);
  mg.box(mat(0xff4fd8, 0.5, 0.2), 52, 6.8, pz, 24.3, 0.5, 17.3);
  mg.box(mat(0x2a2a30, 0.7), 52, 7.6, pz, 24.4, 0.25, 17.4);
  sign(b, 'PINBALL HALL OF FAME', '#120a2a', '#ff4fd8', 15, 2.0, 39.85, 5.2, pz, -Math.PI / 2, 'FREE ADMISSION • PLAY THE CLASSICS');
  b.add(mesh(new THREE.BoxGeometry(0.15, 2.6, 4), basic(0xffe9a0), 39.95, 1.3, pz));
  mg.box(mat(0x1a1a20, 0.4, 0.6), 38.6, 3.1, pz, 2.8, 0.3, 6);
  ground(b, 22, 39.6, 828, 848.5, 0x2e2e33, L1, 0.85);
  for (let z = 830; z <= 847; z += 3.4) b.floor(30.8, z, 7.4, 0.12, basic(0xf2f0ea), L2);
  const lotCars: Array<[CarKind, number, number]> = [
    ['sedan', 0x2d4f8c, 831.7],
    ['suv', 0xf2f2f0, 838.5],
    ['sport', 0xc4161c, 845.3],
  ];
  for (const [k, c, z] of lotCars) {
    const cc = car(k, c);
    bakeGroup(cc.group);
    b.add(cc.group, 31, 0, z, Math.PI / 2);
    b.collider(28.4, 33.6, z - 1.1, z + 1.1, 0, 1.6);
  }
  // Fun pylon sign with a bouncing chrome ball
  const pinTex = canvasTex(512, 340, (ctx, w, h) => {
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a0a4a');
    gr.addColorStop(1, '#0a0418');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    const cols = ['#ff3b3b', '#ff9a2a', '#ffe23a', '#3bff7a', '#3ad8ff', '#b06cff', '#ff4fd8'];
    ctx.font = 'bold 92px "Arial Black", Impact, sans-serif';
    ctx.textBaseline = 'middle';
    let x = 34;
    'PINBALL'.split('').forEach((ch, i) => {
      ctx.fillStyle = cols[i % cols.length];
      ctx.shadowColor = cols[i % cols.length];
      ctx.shadowBlur = 16;
      ctx.fillText(ch, x, 110);
      x += ctx.measureText(ch).width + 4;
    });
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffe23a';
    ctx.shadowColor = '#ffe23a';
    ctx.font = 'bold 50px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('HALL OF FAME', w / 2, 200);
    ctx.fillStyle = '#ffffff';
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(w / 2 + s * 90, 280);
      ctx.rotate(s * -0.35);
      ctx.beginPath();
      ctx.ellipse(0, 0, 70, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
  const pinMat = new THREE.MeshBasicMaterial({ map: pinTex });
  const dark = mat(0x18181c, 0.5, 0.4);
  const signX = 26;
  const signZ = 827.4;
  const board = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.6), [dark, dark, dark, dark, pinMat, pinMat]);
  board.position.set(signX, 8, signZ);
  b.add(board);
  mg.box(dark, signX, 3, signZ, 0.8, 6, 0.8, 0, true);
  b.collider(signX - 0.5, signX + 0.5, signZ - 0.5, signZ + 0.5, 0, 10, true);
  const ball = mesh(new THREE.SphereGeometry(0.85, 20, 14), mat(0xe8ecf2, 0.05, 1), signX, 10.9, signZ);
  b.scene.add(ball);
  b.every((_dt, t) => {
    ball.position.y = 10.9 + Math.abs(Math.sin(t * 2.4)) * 1.8;
    ball.position.x = signX + Math.sin(t * 0.9) * 1.6;
  });
  b.pickup(39.2, 0.45, pz + 3, 2, 'Pinball Wizard Pack', false);
  b.building(52, pz, 24, 17, '#4a5f8a', 'Pinball HoF');
  b.zone('Pinball Hall of Fame', 19, 66, 826, 848.5);

  // Dream Las Vegas — stalled steel skeleton
  const rust = mat(0x7a3e22, 0.92, 0.35);
  const slab = mat(0x9a968e, 0.9);
  const dz = zFromS(-3408); // 856.9
  const xs = [25, 31, 37, 43, 49, 55, 61];
  const zs = [dz - 6.5, dz - 2.2, dz + 2.2, dz + 6.5];
  const floors = (i: number, j: number) => 2 + ((i * 3 + j * 5) % 4) - (i === 0 || i === 6 ? 1 : 0);
  const FL = 4.2;
  xs.forEach((x, i) =>
    zs.forEach((z, j) => {
      const hgt = floors(i, j) * FL;
      mg.box(rust, x, hgt / 2, z, 0.45, hgt, 0.45, 0, true);
      b.collider(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, hgt, true);
      for (let k = 0; k < 4; k++) mg.beam(mat(0x4a2a1a, 0.9, 0.3), v3(x - 0.15 + (k % 2) * 0.3, hgt, z - 0.15 + (k >> 1) * 0.3), v3(x - 0.15 + (k % 2) * 0.3, hgt + 1.1, z - 0.15 + (k >> 1) * 0.3), 0.02, 3);
    })
  );
  for (let lvl = 1; lvl <= 4; lvl++) {
    const y = lvl * FL;
    xs.forEach((x, i) =>
      zs.forEach((z, j) => {
        if (i < xs.length - 1 && floors(i, j) >= lvl && floors(i + 1, j) >= lvl) mg.box(rust, (x + xs[i + 1]) / 2, y - 0.25, z, 6, 0.5, 0.3);
        if (j < zs.length - 1 && floors(i, j) >= lvl && floors(i, j + 1) >= lvl) mg.box(rust, x, y - 0.25, (z + zs[j + 1]) / 2, 0.3, 0.5, zs[j + 1] - z);
      })
    );
  }
  b.box(43.5, FL, dz, 38.5, 0.3, 13.4, slab, false, true);
  b.box(37, FL * 2, dz - 2.2, 12.5, 0.3, 9, slab, false, true);
  stairs(b, 64.6, dz - 7.5, '+z', 2.4, FL + 0.3, 9, slab);
  b.box(63.2, FL, dz + 1.9, 1.6, 0.3, 3.2, slab, false, false);
  // Rusty, idle tower crane
  const idle = mat(0x8a5a2a, 0.9, 0.3);
  for (const [cx, cz] of [
    [-0.9, -0.9],
    [0.9, -0.9],
    [-0.9, 0.9],
    [0.9, 0.9],
  ]) mg.box(idle, 33 + cx, 15, dz + 9.5 + cz, 0.2, 30, 0.2);
  for (let y = 0; y < 30; y += 3) mg.box(idle, 33, y, dz + 9.5, 2, 0.12, 2);
  mg.box(idle, 45, 31, dz + 9.5, 34, 1.0, 1.0);
  mg.box(mat(0x555555, 0.8), 25, 30.4, dz + 9.5, 4, 2.4, 2.2);
  b.collider(32, 34, dz + 8.5, dz + 10.5, 0, 30, true);
  chainLink(b, mg, 21.4, dz - 8.4, 21.4, dz - 1);
  chainLink(b, mg, 21.4, dz + 1.5, 21.4, dz + 8.4);
  for (const z of [dz - 5, dz + 5]) sign(b, 'DREAM', '#4a4a48', '#d8d0c0', 5, 1.2, 21.25, 1.4, z, -Math.PI / 2, 'LAS VEGAS • COMING SOON', 0.05);
  mg.flush(b);
  b.building(43, dz, 38, 14, '#7a3e22', 'Dream (stalled)');
  b.zone('Dream Las Vegas (stalled construction)', 19, 66, 848.5, 869.5);
}

// ================================================================ Harry Reid International Airport
function airliner(livery: number, blink: THREE.MeshBasicMaterial[]): { g: THREE.Group; gear: THREE.Group } {
  const g = new THREE.Group();
  const white = mat(0xf2f4f6, 0.35, 0.3);
  const tailM = mat(livery, 0.4, 0.3);
  const dark = mat(0x222831, 0.4, 0.5);
  const grey = mat(0xb9bec6, 0.4, 0.5);
  const fus = new THREE.CylinderGeometry(1, 1, 13, 16);
  fus.rotateX(Math.PI / 2);
  g.add(new THREE.Mesh(fus, white));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10).scale(1, 0.96, 1.9).translate(0, 0, 6.5), white));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(1, 4.4, 16).rotateX(-Math.PI / 2).translate(0, 0.25, -8.7), white));
  for (const s of [1, -1]) {
    const wing = new THREE.BoxGeometry(8.4, 0.24, 2.9);
    wing.rotateY(s * 0.42);
    wing.translate(s * (0.8 + 4.2 * Math.cos(0.42)), -0.45, 0.7 - 4.2 * Math.sin(0.42));
    g.add(new THREE.Mesh(wing, grey));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.9).translate(s * 8.5, 0.05, -2.85), tailM));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 2.6, 14).rotateX(Math.PI / 2).translate(s * 3.4, -1.15, 1.4), grey));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 1.2).translate(s * 3.4, -0.7, 1.0), grey));
    const stab = new THREE.BoxGeometry(3.4, 0.14, 1.6);
    stab.rotateY(s * 0.5);
    stab.translate(s * 2.1, 0.55, -9.3);
    g.add(new THREE.Mesh(stab, white));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 10.5).translate(s * 0.99, 0.32, 0.4), dark));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 13).translate(s * 1.0, -0.12, 0), tailM));
  }
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.8, 3.0).rotateX(-0.55).translate(0, 2.6, -8.3), tailM));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.32, 0.5).translate(0, 0.55, 7.25), dark));
  bakeGroup(g);
  const [strobe, beacon] = blink;
  g.add(mesh(new THREE.SphereGeometry(0.16, 6, 4), basic(0xff2020), 8.55, -0.4, -2.75));
  g.add(mesh(new THREE.SphereGeometry(0.16, 6, 4), basic(0x20ff40), -8.55, -0.4, -2.75));
  for (const s of [1, -1]) g.add(mesh(new THREE.SphereGeometry(0.14, 6, 4), strobe, s * 8.6, -0.3, -2.9));
  g.add(mesh(new THREE.SphereGeometry(0.16, 6, 4), beacon, 0, 1.05, -1));
  g.add(mesh(new THREE.SphereGeometry(0.16, 6, 4), beacon, 0, -1.05, 0));
  for (const s of [1, -1]) g.add(mesh(new THREE.SphereGeometry(0.22, 6, 4), basic(0xfff8e0), s * 1.6, -0.6, 2.0));
  const gear = new THREE.Group();
  const tyre = mat(0x111216, 0.85);
  for (const [gx, gz] of [
    [0, 5],
    [1.5, -0.6],
    [-1.5, -0.6],
  ]) {
    gear.add(new THREE.Mesh(beamGeo(v3(gx, -0.8, gz), v3(gx, -1.9, gz), 0.08, 5), grey));
    gear.add(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.4, 10).rotateZ(Math.PI / 2).translate(gx, -1.95, gz), tyre));
  }
  bakeGroup(gear);
  g.add(gear);
  return { g, gear };
}

function runwayTextures(): { strip: THREE.CanvasTexture; threshold: (num: string) => THREE.CanvasTexture } {
  const strip = canvasTex(128, 512, (ctx, w, h) => {
    ctx.fillStyle = '#34353a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const v = 44 + ((i * 37) % 22);
      ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
      ctx.fillRect((i * 53) % w, (i * 97) % h, 2, 2);
    }
    ctx.fillStyle = 'rgba(20,20,22,0.35)';
    ctx.fillRect(w / 2 - 14, 0, 28, h);
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(4, 0, 4, h);
    ctx.fillRect(w - 8, 0, 4, h);
    ctx.fillRect(w / 2 - 3, 40, 6, 170);
    ctx.fillRect(w / 2 - 3, 296, 6, 170);
  });
  strip.wrapS = strip.wrapT = THREE.RepeatWrapping;
  const threshold = (num: string) =>
    canvasTex(128, 160, (ctx, w, h) => {
      ctx.fillStyle = '#34353a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f2f2ee';
      for (let i = 0; i < 8; i++) ctx.fillRect(10 + i * 14 + (i >= 4 ? 4 : 0), h - 46, 8, 40);
      ctx.font = 'bold 54px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(num, w / 2, 60);
    });
  return { strip, threshold };
}

function buildAirport(b: WorldBuilder): void {
  const mg = new Merger();
  // Perimeter fence: along Russell Rd east of the parcels, around Pinball/Dream, then down the Boulevard
  const fx = 21.2;
  const back = 70;
  const fz0 = RUSSELL_S + 0.6;
  const fz1 = 869.5;
  chainLink(b, mg, back, fz0, 204, fz0, 3, true);
  chainLink(b, mg, back, fz0, back, fz1, 3, true);
  chainLink(b, mg, back, fz1, fx, fz1, 3, true);
  chainLink(b, mg, fx, fz1, fx, 959.5, 3, true);
  for (let z = 885; z < 955; z += 30) sign(b, 'HARRY REID INTERNATIONAL AIRPORT', '#0a1a3a', '#ffffff', 7.4, 1.0, fx - 0.08, 1.6, z, -Math.PI / 2, 'AIR OPERATIONS AREA • NO TRESPASSING', 0.05);
  const airGround = new THREE.MeshStandardMaterial({ color: 0xa8976f, roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  b.floor((back + 205) / 2, (fz0 + fz1) / 2, 205 - back, fz1 - fz0, airGround, 0.008);
  b.floor((fx + 205) / 2, (fz1 + 960) / 2, 205 - fx, 960 - fz1, airGround, 0.008);
  b.floor(410, 1100, 780, 280, airGround, 0.0);
  ground(b, fx + 2.5, fx + 7, fz1 + 1, 960, 0x45464c, L1, 0.85);
  b.feature({ kind: 'plaza', x: 140, z: 900, w: 130, d: 140, color: '#8a7c5c', label: 'Harry Reid Intl (LAS)' });

  // Runways 1L/19R and 1R/19L (heading ~020°), 8L/26R (east-west), plus parallel taxiway
  const { strip, threshold } = runwayTextures();
  const d1 = v3(0.342, 0, -0.94).normalize();
  const perp = v3(0.94, 0, 0.342).normalize();
  const S1 = v3(xFromO(204), 0, zFromS(-4380)); // 1L threshold
  const S2 = S1.clone().addScaledVector(perp, 38); // 1R threshold
  const W8 = v3(xFromO(218), 0, zFromS(-4267)); // 8L threshold
  const d8 = v3(0.999, 0, 0.026).normalize();
  const lights = {
    edge: new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.2, depthWrite: false }),
    green: new THREE.MeshBasicMaterial({ color: 0x30ff70, transparent: true, opacity: 0.2, depthWrite: false }),
    red: new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.2, depthWrite: false }),
    blue: new THREE.MeshBasicMaterial({ color: 0x3a6aff, transparent: true, opacity: 0.2, depthWrite: false }),
  };
  const lamp = (m: THREE.Material, p: THREE.Vector3, r = 0.24) => mg.add(new THREE.SphereGeometry(r, 6, 4).translate(p.x, p.y, p.z), m);
  const runway = (start: THREE.Vector3, dir: THREE.Vector3, length: number, width: number, y: number, num?: string, edgeMat = lights.edge) => {
    const g = new THREE.PlaneGeometry(width, length);
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.atan2(-dir.x, -dir.z));
    const c = start.clone().addScaledVector(dir, length / 2);
    g.translate(c.x, y, c.z);
    const t = strip.clone();
    t.needsUpdate = true;
    t.repeat.set(1, length / 64);
    b.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 })));
    const side = v3(-dir.z, 0, dir.x);
    if (num) {
      const tg = new THREE.PlaneGeometry(width, width * 1.25);
      tg.rotateX(-Math.PI / 2);
      tg.rotateY(Math.atan2(-dir.x, -dir.z));
      const tc = start.clone().addScaledVector(dir, width * 0.65);
      tg.translate(tc.x, y + 0.012, tc.z);
      b.add(new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: threshold(num), roughness: 0.9 })));
      for (let k = -3; k <= 3; k++) lamp(lights.green, start.clone().addScaledVector(side, (k * width) / 7).setY(0.25));
    }
    for (let s = 0; s <= length; s += 15) for (const sd of [-1, 1]) lamp(edgeMat, start.clone().addScaledVector(dir, s).addScaledVector(side, sd * (width / 2 + 0.5)).setY(0.25));
  };
  const lenTo = (start: THREE.Vector3, zEnd: number) => (start.z - zEnd) / -d1.z;
  runway(S1, d1, lenTo(S1, RUSSELL_S + 3), 16, 0.07, '1L');
  runway(S2, d1, lenTo(S2, RUSSELL_S + 3), 15, 0.08, '1R');
  runway(W8, d8, 720, 15, 0.1, '8L');
  const T0 = S1.clone().addScaledVector(perp, -24).addScaledVector(d1, 10);
  runway(T0, d1, lenTo(T0, RUSSELL_S + 3), 9, 0.045, undefined, lights.blue);
  // Approach-light bars south of 1L + the sequenced flasher ("rabbit")
  for (let k = 1; k <= 10; k++) {
    const p = S1.clone().addScaledVector(d1, -k * 18);
    for (let j = -2; j <= 2; j++) lamp(lights.edge, p.clone().addScaledVector(perp, j * 1.2).setY(0.6 + k * 0.05), 0.2);
  }
  const rabbitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const rabbit = mesh(new THREE.SphereGeometry(0.7, 8, 6), rabbitMat, 0, 0, 0);
  b.scene.add(rabbit);
  // Windsock near the 1L end, inside the fence
  const sockPos = S1.clone().addScaledVector(d1, 140).addScaledVector(perp, -14);
  mg.beam(mat(0xdddddd, 0.4, 0.6), v3(sockPos.x, 0, sockPos.z), v3(sockPos.x, 6, sockPos.z), 0.08, 6);
  const sock = mesh(new THREE.ConeGeometry(0.45, 2.4, 10, 1, true).rotateZ(-Math.PI / 2).translate(1.2, 0, 0), mat(0xff6a00, 0.7, 0, { side: THREE.DoubleSide }), sockPos.x, 5.8, sockPos.z);
  b.scene.add(sock);
  mg.flush(b);
  b.every((_dt, t, night) => {
    const op = 0.12 + night * 0.88;
    for (const m of Object.values(lights)) m.opacity = op;
    const k = (t * 2.5) % 1;
    rabbit.position.copy(S1).addScaledVector(d1, -180 * (1 - k)).setY(0.9);
    rabbitMat.opacity = night * 0.95;
    sock.rotation.y = Math.sin(t * 0.3) * 0.4;
  });

  // Jets: one landing on 1L and rolling out, one taking off from 1R
  const strobe = basic(0xffffff).clone();
  const beacon = basic(0xff2020).clone();
  const jetA = airliner(0x2b4fa8, [strobe, beacon]);
  const jetB = airliner(0xc8202e, [strobe, beacon]);
  b.scene.add(jetA.g, jetB.g);
  const TD = S1.clone().addScaledVector(d1, 40);
  const tgt = new THREE.Vector3();
  const setPose = (j: { g: THREE.Group; gear: THREE.Group }, p: THREE.Vector3, dir: THREE.Vector3, pitch: number) => {
    j.g.position.copy(p);
    tgt.copy(p).addScaledVector(dir, 10);
    tgt.y += pitch * 10;
    j.g.lookAt(tgt);
    j.gear.visible = p.y < 40;
  };
  const P = new THREE.Vector3();
  const D = new THREE.Vector3();
  b.every((_dt, t) => {
    strobe.color.setHex(t % 1.1 < 0.08 ? 0xffffff : 0x222222);
    beacon.color.setHex(t % 1.4 < 0.5 ? 0xff2020 : 0x330808);
    // Landing (cycle 64 s)
    const ta = t % 64;
    if (ta < 16) {
      const dist = 640 * (1 - ta / 16);
      P.copy(TD).addScaledVector(d1, -dist);
      P.y = 1.95 + dist * 0.11 - (dist < 30 ? (30 - dist) * 0.02 : 0);
      jetA.g.visible = true;
      setPose(jetA, P, d1, dist < 40 ? 0.06 : 0.02);
    } else if (ta < 24.4) {
      const tau = ta - 16;
      const s = 40 * tau - 1.785 * tau * tau;
      P.copy(TD).addScaledVector(d1, s);
      P.y = 1.95;
      jetA.g.visible = true;
      setPose(jetA, P, d1, 0);
    } else if (ta < 31) {
      const tau = ta - 24.4;
      const end = TD.clone().addScaledVector(d1, 210);
      const th = Math.min(Math.PI / 2, (tau * 9) / 25);
      const C = end.clone().addScaledVector(perp, 25);
      P.copy(C).addScaledVector(perp, -25 * Math.cos(th)).addScaledVector(d1, 25 * Math.sin(th));
      if (th >= Math.PI / 2) P.addScaledVector(perp, (tau - (25 * Math.PI) / 2 / 9) * 9);
      P.y = 1.95;
      D.copy(perp).multiplyScalar(Math.sin(th)).addScaledVector(d1, Math.cos(th)).normalize();
      jetA.g.visible = true;
      setPose(jetA, P, D, 0);
    } else jetA.g.visible = false;
    // Takeoff (offset half a cycle)
    const tb = (t + 32) % 64;
    const lineup = S2.clone().addScaledVector(d1, 15);
    if (tb < 4) {
      P.copy(lineup).setY(1.95);
      jetB.g.visible = true;
      setPose(jetB, P, d1, 0);
    } else if (tb < 12.5) {
      const tau = tb - 4;
      P.copy(lineup).addScaledVector(d1, 3.2 * tau * tau).setY(1.95);
      jetB.g.visible = true;
      setPose(jetB, P, d1, tau > 7.5 ? 0.12 : 0);
    } else if (tb < 40) {
      const tau = tb - 12.5;
      const s = 231 + 54.4 * tau + tau * tau;
      P.copy(lineup).addScaledVector(d1, s);
      P.y = 1.95 + (s - 231) * 0.17;
      jetB.g.visible = true;
      setPose(jetB, P, d1, 0.21);
    } else jetB.g.visible = false;
  });
  b.zone('Harry Reid International Airport', back, 205, fz0, 960);
  b.zone('Harry Reid International Airport', fx, 205, fz1, 960);
}

// ================================================================ Bali Hai Golf Club (west side, Russell → the sign)
function buildBaliHai(b: WorldBuilder): void {
  const x0 = -116;
  const x1 = -19.4;
  const z0 = RUSSELL_S + 0.2;
  const z1 = 959.5;
  ground(b, x0, x1, z0, z1, 0x5f8a3a, L0, 0.95);
  ground(b, -100, -28, 828, 952, 0x7fb04a, L1, 0.9);
  b.floor(-48, 940, 14, 12, mat(0x95cc5e, 0.85), L2);
  const mg = new Merger();
  const sandM = mat(0xe8d8b0, 0.98);
  for (const [sx, sz, r] of [
    [-40, 930, 2.6],
    [-58, 946, 2.2],
    [-80, 908, 3.0],
  ]) mg.add(new THREE.CircleGeometry(r, 16).rotateX(-Math.PI / 2).translate(sx, L2 + 0.012, sz), sandM);
  mg.beam(mat(0xf4f4f4, 0.4), v3(-48, 0, 938), v3(-48, 2.4, 938), 0.03, 4);
  mg.add(new THREE.PlaneGeometry(0.9, 0.55).translate(-47.55, 2.1, 938), mat(0xd8202e, 0.7, 0, { side: THREE.DoubleSide }));
  // Lagoon with a palm island
  const water = new THREE.MeshStandardMaterial({ color: 0x2e8b9a, roughness: 0.06, metalness: 0.5, emissive: 0x0a3040, emissiveIntensity: 0.3 });
  b.floor(-76, 877, 28, 34, water, 0.07);
  b.waterZones.push({ name: 'Bali Hai Lagoon', minX: -90, maxX: -62, minZ: 860, maxZ: 894, y: 0.07 });
  b.feature({ kind: 'water', x: -76, z: 877, w: 28, d: 34, color: '#2e8b9a' });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    mg.add(new THREE.DodecahedronGeometry(0.7 + (i % 3) * 0.3, 0).translate(-76 + Math.cos(a) * 14.6, 0.3, 877 + Math.sin(a) * 17.6), mat(0x5a4a3a, 0.95));
  }
  let seed = 200;
  for (const [x, z] of [
    [-23.6, 824],
    [-23.6, 842],
    [-23.6, 858],
    [-23.6, 874],
    [-23.6, 890],
    [-23.6, 906],
    [-23.6, 922],
    [-23.6, 938],
    [-23.6, 954],
    [-58, 858],
    [-94, 860],
    [-60, 897],
    [-92, 896],
    [-34, 912],
    [-66, 930],
    [-104, 930],
  ]) palmInto(mg, x, z, 7 + (seed % 4) * 0.8, seed++);
  // Clubhouse with a tiki hip roof
  b.box(-104, 0, 834, 16, 5.5, 14, mat(0xd8c8a8, 0.8), true);
  mg.at(mat(0x6a4a2a, 0.9), new THREE.ConeGeometry(13, 5, 4).rotateY(Math.PI / 4).scale(1.05, 1, 0.92), -104, 8.0, 834, 0, true);
  mg.box(mat(0x8a5a2a, 0.8), -101, 0.8, 841.5, 2.4, 1.2, 1.4);
  sign(b, 'BALI HAI', '#1a2a10', '#ffe9a0', 6, 1.4, -95.85, 4.2, 834, Math.PI / 2, 'GOLF CLUB', 0.15);
  // Strip-side monument + hedge
  b.box(-21.4, 0, 832, 1.2, 1.8, 7, mat(0x5a4a3a, 0.8), true);
  sign(b, 'BALI HAI GOLF CLUB', '#1a2a10', '#ffe9a0', 6.4, 1.3, -20.72, 1.0, 832, Math.PI / 2, 'PUBLIC TEE TIMES • SOUTH SEAS STYLE', 0.1);
  const hedge = mat(0x2f5a2a, 0.95);
  for (const [a, c] of [
    [z0 + 9, 870],
    [876, 958],
  ]) b.box(-20.4, 0, (a + c) / 2, 0.9, 1.0, c - a, hedge, false, false);
  // Golf cart
  const cart = new THREE.Group();
  cart.add(mesh(new THREE.BoxGeometry(1.2, 0.5, 2.2), mat(0xf4f4f0, 0.5), 0, 0.6, 0, true));
  cart.add(mesh(new THREE.BoxGeometry(1.25, 0.06, 2.0), mat(0xf4f4f0, 0.5), 0, 1.9, -0.1));
  for (const cz of [-0.9, 0.7]) for (const cx of [-0.55, 0.55]) cart.add(mesh(new THREE.BoxGeometry(0.05, 1.3, 0.05), mat(0x222222, 0.5), cx, 1.25, cz));
  bakeGroup(cart);
  b.add(cart, -90, 0, 844, 0.5);
  b.collider(-91, -89, 842.8, 845.2, 0, 1.2);
  mg.flush(b);
  b.building(-104, 834, 16, 14, '#d8c8a8', 'Bali Hai');
  b.feature({ kind: 'park', x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, color: '#5f8a3a', label: 'Bali Hai Golf' });
  b.zone('Bali Hai Golf Club', x0, x1, z0, z1);
}

// ================================================================ Welcome to Fabulous Las Vegas sign
function welcomeFace(back: boolean): THREE.CanvasTexture {
  return canvasTex(1024, 688, (ctx, w, h) => {
    const hex = (inset: number) => {
      ctx.beginPath();
      ctx.moveTo(inset * 1.6, h * 0.25 + inset * 0.4);
      ctx.lineTo(w / 2, inset);
      ctx.lineTo(w - inset * 1.6, h * 0.25 + inset * 0.4);
      ctx.lineTo(w - inset * 1.6, h * 0.75 - inset * 0.4);
      ctx.lineTo(w / 2, h - inset);
      ctx.lineTo(inset * 1.6, h * 0.75 - inset * 0.4);
      ctx.closePath();
    };
    ctx.clearRect(0, 0, w, h);
    hex(0);
    ctx.fillStyle = '#d7262e';
    ctx.fill();
    hex(30);
    ctx.fillStyle = '#f6f1e4';
    ctx.fill();
    hex(38);
    ctx.strokeStyle = '#d7262e';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!back) {
      const letters = 'WELCOME';
      for (let i = 0; i < 7; i++) {
        const cx = w / 2 + (i - 3) * w * 0.106;
        const cy = h * 0.205 + Math.abs(i - 3) * h * 0.032;
        const r = w * 0.047;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#b9bcc4';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.fillStyle = '#d7262e';
        ctx.font = `bold ${Math.round(r * 1.25)}px Georgia, serif`;
        ctx.fillText(letters[i], cx, cy + 3);
      }
      ctx.fillStyle = '#1f5fae';
      ctx.font = 'italic bold 76px "Brush Script MT", "Segoe Script", cursive';
      ctx.fillText('to Fabulous', w / 2, h * 0.405);
      ctx.font = 'bold 172px "Arial Black", Impact, sans-serif';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText('LAS VEGAS', w / 2, h * 0.6, w * 0.86);
      ctx.fillStyle = '#d7262e';
      ctx.shadowColor = 'rgba(80,0,0,0.5)';
      ctx.shadowBlur = 6;
      ctx.fillText('LAS VEGAS', w / 2, h * 0.6, w * 0.86);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1f5fae';
      ctx.font = 'bold 52px Georgia, serif';
      ctx.fillText('NEVADA', w / 2, h * 0.815);
    } else {
      ctx.fillStyle = '#1f5fae';
      ctx.font = 'italic bold 118px "Brush Script MT", "Segoe Script", cursive';
      ctx.fillText('Drive Carefully', w / 2, h * 0.37, w * 0.8);
      ctx.fillStyle = '#d7262e';
      ctx.font = 'bold 104px "Arial Black", Impact, sans-serif';
      ctx.fillText('Come Back Soon', w / 2, h * 0.63, w * 0.84);
    }
  });
}

function buildWelcomeSign(b: WorldBuilder): void {
  const zSign = zFromS(-3635); // 907.3
  const zLot0 = zFromS(-3687); // 918.9
  const zLot1 = zFromS(-3804); // 944.9
  const zIsl0 = 890.6;
  const zIsl1 = 951.4;
  const mg = new Merger();

  // Island: raised curbs, paved photo plaza, the small median lot, a planted tip
  const curb = mat(0xd8d2c4, 0.8);
  for (const s of [-1, 1]) {
    for (const [a, c] of s < 0
      ? [
          [zIsl0, zLot1 - 5],
          [zLot1 + 0.6, zIsl1],
        ]
      : [[zIsl0, zIsl1]]) b.box(s * (ISLAND - 0.12), 0, (a + c) / 2, 0.24, 0.2, c - a, curb, false, false);
  }
  b.box(0, 0, zIsl0 + 0.12, ISLAND * 2, 0.2, 0.24, curb, false, false);
  b.box(0, 0, zIsl1 - 0.12, ISLAND * 2, 0.2, 0.24, curb, false, false);
  b.box(0, 0, zLot0 - 1.2, ISLAND * 2 - 0.4, 0.15, 0.24, curb, false, false);
  paving(b, -ISLAND + 0.24, ISLAND - 0.24, zIsl0 + 0.24, zLot0 - 1.3, '#e2d8c4', '#bfb39c', 2, L1);
  ground(b, -ISLAND + 0.24, ISLAND - 0.24, zLot0 - 1.1, zLot1 + 0.4, 0x2e2e33, L1, 0.85);
  ground(b, -ISLAND + 0.24, ISLAND - 0.24, zLot1 + 0.6, zIsl1 - 0.24, 0x5f7d45, L1, 0.95);
  for (let z = zLot0 + 1; z <= zLot1; z += 6.2) b.floor(-0.2, z, ISLAND * 2 - 0.8, 0.12, mat(0xdedcd4, 0.85), L2);
  sign(b, 'WELCOME SIGN PARKING', '#0a2a5a', '#ffffff', 3.2, 0.7, 0, 1.4, zLot1 + 1.6, 0, '15 MIN • PHOTO STOP', 0.06);
  mg.beam(mat(0x8c8f94, 0.4, 0.6), v3(0, 0, zLot1 + 1.65), v3(0, 1.05, zLot1 + 1.65), 0.04, 4);
  const parked: Array<[CarKind, number, number]> = [
    ['sedan', 0xe8e8ea, zLot0 + 4],
    ['suv', 0x1d1f24, zLot0 + 10.2],
    ['limo', 0xf4f4f4, zLot0 + 17.6],
  ];
  for (const [k, c, z] of parked) {
    const cc = car(k, c);
    bakeGroup(cc.group);
    b.add(cc.group, -0.25, 0, z, 0);
    b.collider(-1.2, 0.7, z - cc.length / 2, z + cc.length / 2, 0, 1.55);
  }
  palmInto(mg, 0, 893.6, 6.4, 301);
  palmInto(mg, 0, 899.6, 7.2, 302);
  palmInto(mg, 0, zIsl1 - 2.2, 6.8, 303);

  // The sign (life-size): lozenge face, silver dollars, star, chaser bulbs, two poles
  const W = 5.8;
  const H = 3.9;
  const cy = 4.45;
  const outline: Array<[number, number]> = [
    [0, 0.25],
    [0.5, 0],
    [1, 0.25],
    [1, 0.75],
    [0.5, 1],
    [0, 0.75],
  ];
  const toLocal = ([u, vv]: [number, number]) => new THREE.Vector2((u - 0.5) * W, (0.5 - vv) * H);
  const shape = new THREE.Shape(outline.map(toLocal));
  const remapUV = (g: THREE.BufferGeometry) => {
    const p = g.attributes.position;
    const uvs = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uvs[i * 2] = p.getX(i) / W + 0.5;
      uvs[i * 2 + 1] = p.getY(i) / H + 0.5;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    return g;
  };
  const faceMat = (back: boolean) => {
    const t = welcomeFace(back);
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.5 });
    b.nightGlow(m, 0.0, 0.5);
    return m;
  };
  const signG = new THREE.Group();
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
  body.translate(0, 0, -0.15);
  signG.add(mesh(body, mat(0xc81e28, 0.5, 0.2), 0, 0, 0, true));
  const front = remapUV(new THREE.ShapeGeometry(shape));
  signG.add(mesh(front, faceMat(false), 0, 0, 0.16));
  const backG = remapUV(new THREE.ShapeGeometry(shape));
  const backM = mesh(backG, faceMat(true), 0, 0, -0.16);
  backM.rotation.y = Math.PI;
  signG.add(backM);
  // Eight-point star on a post
  const star = (R: number, r: number) => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < 16; i++) {
      const a = Math.PI / 2 + (i / 16) * Math.PI * 2;
      const rr = i % 2 ? r : R;
      pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
    }
    return new THREE.Shape(pts);
  };
  const starY = H / 2 + 1.15;
  const sy = new THREE.ExtrudeGeometry(star(0.86, 0.46), { depth: 0.1, bevelEnabled: false });
  sy.translate(0, starY, -0.05);
  signG.add(mesh(sy, mat(0xf2c230, 0.4, 0.4)));
  const sr = new THREE.ExtrudeGeometry(star(0.72, 0.38), { depth: 0.16, bevelEnabled: false });
  sr.translate(0, starY, -0.08);
  signG.add(mesh(sr, mat(0xd7262e, 0.4, 0.2)));
  signG.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8), mat(0xe8e4da, 0.5, 0.3), 0, H / 2 + 0.3, 0));
  b.add(signG, 0, cy, zSign);
  for (const s of [-1, 1]) {
    mg.add(new THREE.CylinderGeometry(0.16, 0.18, 3.2, 12).translate(s * 1.45, 1.6, zSign), mat(0xe8e4da, 0.5, 0.3), true);
    b.collider(s * 1.45 - 0.2, s * 1.45 + 0.2, zSign - 0.2, zSign + 0.2, 0, 3.2, true);
    b.add(planter(1.1, 1.1, 0xff3b5c), s * 1.45, 0, zSign + 0.8);
    mg.box(mat(0x2a2a30, 0.5, 0.6), s * 1.5, 0.25, zSign + 3.4, 0.45, 0.5, 0.45);
  }
  b.collider(-W / 2, W / 2, zSign - 0.2, zSign + 0.2, cy - H / 2, cy + H / 2 + 2, true);

  // Chaser bulbs around the rim on both faces + the star tips
  const bulbMats = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: 0xe8dcc0 }));
  const verts = outline.map(([u, vv]) => {
    const p = toLocal([u, vv]);
    return p.multiplyScalar(0.955);
  });
  let bi = 0;
  for (let e = 0; e < verts.length; e++) {
    const a = verts[e];
    const c = verts[(e + 1) % verts.length];
    const n = Math.max(2, Math.round(a.distanceTo(c) / 0.3));
    for (let k = 0; k < n; k++) {
      const p = a.clone().lerp(c, k / n);
      for (const fz of [0.19, -0.19]) mg.add(new THREE.SphereGeometry(0.065, 6, 4).translate(p.x, cy + p.y, zSign + fz), bulbMats[bi % 3]);
      bi++;
    }
  }
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 2 + (i / 8) * Math.PI * 2;
    for (const fz of [0.12, -0.12]) mg.add(new THREE.SphereGeometry(0.06, 6, 4).translate(Math.cos(a) * 0.8, cy + starY + Math.sin(a) * 0.8, zSign + fz), bulbMats[i % 3]);
  }
  const on = new THREE.Color(0xfff1b8);
  const off = new THREE.Color(0x6a5a30);
  const dim = new THREE.Color(0xe8dcc0);
  b.every((_dt, t, night) => {
    const k = Math.floor(t * 7) % 3;
    bulbMats.forEach((m, i) => {
      if (night < 0.3) m.color.copy(dim);
      else m.color.copy(i === k ? off : on);
    });
  });
  // Ground floods aimed up at the face (low and close, so the photo line is not blown out under bloom)
  b.light(0xfff2d8, 9, 12, 0, 0.4, zSign + 2.2, 0);
  mg.flush(b);

  b.zone('Welcome to Fabulous Las Vegas Sign', -ISLAND - 0.6, ISLAND + 0.6, zIsl0, zLot0 - 1.2);
  b.zone('Welcome Sign Parking Lot', -ISLAND - 0.6, ISLAND + 0.6, zLot0 - 1.2, zIsl1);
  b.staticMarkers.push({ x: 0, z: zSign, color: '#ff3b3b', glyph: '★', size: 3.2 });
  b.pickup(1.45, 1.05, zSign + 0.8, 3, 'Welcome Sign Selfie Pack', false);
  // The photo line + the regulars posing out front
  b.crowd.performers.push({ kind: 'elvis', x: -1.0, z: zSign + 1.9, facing: 0 }, { kind: 'showgirl', x: 1.0, z: zSign + 1.7, facing: 0 });
  const queue: Array<'camera' | 'cig' | 'yard-drink' | 'bag'> = ['camera', 'camera', 'yard-drink', 'cig', 'camera', 'bag'];
  queue.forEach((prop, i) => {
    const x = i % 2 ? 0.55 : -0.45;
    const z = zSign + 5.2 + i * 1.05;
    b.crowd.tourists.push({ pts: [[x, z], [x + 0.12, z + 0.3]], prop });
  });
}

// ================================================================ Sidewalk crowds
function buildSidewalkLife(b: WorldBuilder): void {
  const runs: Array<[number, number, number, 'camera' | 'cig' | 'yard-drink' | 'bag' | 'none']> = [
    // [x, z0, z1, prop] — split at the reserved Tropicana / Russell corridors
    [-16, 346, 423, 'camera'],
    [-14.5, 422, 348, 'yard-drink'],
    [-17, 461, 619, 'bag'],
    [-14, 617, 463, 'cig'],
    [-16, 624, 792, 'camera'],
    [-15, 790, 626, 'none'],
    [-16, 821, 956, 'camera'],
    [-14, 955, 823, 'yard-drink'],
    [16, 346, 423, 'bag'],
    [14.5, 423, 348, 'camera'],
    [16, 461, 619, 'yard-drink'],
    [14, 618, 462, 'camera'],
    [16, 624, 792, 'cig'],
    [17, 790, 626, 'camera'],
    [16, 821, 956, 'camera'],
    [14, 955, 822, 'bag'],
  ];
  for (const [x, a, c, prop] of runs) b.crowd.tourists.push({ pts: [[x, a], [x, c]], prop });
}
