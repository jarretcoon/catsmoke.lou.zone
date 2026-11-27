import * as THREE from 'three';
import { viewer, type WorldBuilder } from './builder';
import { mat, signalLamps, trafficSignal } from './props';
import { letters, placed } from './signKit';
import { Merger, canvasTex, palmInto, v3 } from './southKit';
import { streetBlade } from './stripSigns';
import { cobraPoleInto, getCarGeos, lightPoolMat } from './westKit';

/**
 * Kit for the real cross streets off the Boulevard (crossRoads.ts and the per-road files): a road ribbon
 * along any polyline with painted lanes, curbs, flat concrete sidewalks with joints, a raised median with
 * palms or a painted one, crosswalks and stop bars, cobra-head street lights with night pools, mast-arm
 * signals on a phase clock, and cheap instanced traffic that stops at the signals and is culled by
 * distance. Everything static merges per material (one shared material per kind across every road).
 *
 * Coordinates as everywhere: x = east, z = south. A road's "right" is the right-hand side of its first
 * point → last point direction (facing +x, right is +z).
 */

export type P = [number, number];
export type Phase = 'go' | 'yellow' | 'stop';

/** Road surface y (just over the Strip's cross-street stubs) and sidewalk y. */
export const ROAD_Y = 0.036;
export const WALK_Y = 0.042;

export interface Frame {
  x: number;
  z: number;
  /** unit tangent */
  tx: number;
  tz: number;
  /** right-hand normal, miter-scaled at joints */
  rx: number;
  rz: number;
  s: number;
}

/** Arc-length frames along a polyline (miter normals at the joints so ribbons don't gap). */
export function frames(pts: P[]): Frame[] {
  const out: Frame[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    if (i > 0) s += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)];
    const c = pts[Math.min(pts.length - 1, i + 1)];
    const segT = (p: P, q: P): P => {
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    };
    const t0 = i > 0 ? segT(pts[i - 1], pts[i]) : segT(pts[i], c);
    const t1 = i < pts.length - 1 ? segT(pts[i], pts[i + 1]) : segT(a, pts[i]);
    let tx = t0[0] + t1[0];
    let tz = t0[1] + t1[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    // miter: scale the normal so the offset edges stay parallel to both segments
    const cosHalf = Math.max(0.5, tx * t1[0] + tz * t1[1]);
    out.push({ x, z, tx, tz, rx: -tz / cosHalf, rz: tx / cosHalf, s });
  }
  return out;
}

/** Point and heading at arc length s along frames (straight interpolation between frames). */
export function at(fr: Frame[], s: number): { x: number; z: number; tx: number; tz: number; rx: number; rz: number } {
  let i = 0;
  while (i < fr.length - 2 && fr[i + 1].s < s) i++;
  const a = fr[i];
  const c = fr[i + 1] ?? a;
  const k = c.s > a.s ? THREE.MathUtils.clamp((s - a.s) / (c.s - a.s), 0, 1) : 0;
  const dx = c.x - a.x;
  const dz = c.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: a.x + dx * k, z: a.z + dz * k, tx: dx / l, tz: dz / l, rx: -dz / l, rz: dx / l };
}

/**
 * A flat band between lateral offsets o0..o1 (along the right normal) over arc length s0..s1.
 * u runs across (0..1 over the band, or metres / uTile), v along (metres / vTile).
 */
export function ribbon(fr: Frame[], o0: number, o1: number, y: number, vTile: number, uTile = 0, s0 = 0, s1 = Infinity): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const end = Math.min(s1, fr[fr.length - 1].s);
  // the frames inside [s0, s1], plus interpolated end frames
  const list: Array<{ x: number; z: number; rx: number; rz: number; s: number }> = [];
  const push = (s: number) => {
    const p = at(fr, s);
    list.push({ x: p.x, z: p.z, rx: p.rx, rz: p.rz, s });
  };
  push(Math.max(0, s0));
  for (const f of fr) if (f.s > s0 + 0.01 && f.s < end - 0.01) list.push(f);
  push(end);
  for (const f of list) {
    for (const o of [o0, o1]) {
      pos.push(f.x + f.rx * o, y, f.z + f.rz * o);
      nor.push(0, 1, 0);
      uv.push(uTile > 0 ? o / uTile : (o - o0) / (o1 - o0), f.s / vTile);
    }
  }
  for (let i = 0; i < list.length - 1; i++) {
    const a = i * 2;
    // winding so the face points up (+y)
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // make sure it faces up whatever the polyline direction
  const p = g.attributes.position as THREE.BufferAttribute;
  if (p.count >= 3) {
    const ax = p.getX(1) - p.getX(0);
    const az = p.getZ(1) - p.getZ(0);
    const bx = p.getX(2) - p.getX(0);
    const bz = p.getZ(2) - p.getZ(0);
    // y of (P2 − P0) × (P1 − P0) for the first triangle (0,2,1): negative = facing down, so flip them all
    const cy = bz * ax - bx * az;
    if (cy < 0) {
      const ix = g.index!.array as Uint16Array | Uint32Array;
      for (let i = 0; i < ix.length; i += 3) {
        const t = ix[i + 1];
        ix[i + 1] = ix[i + 2];
        ix[i + 2] = t;
      }
    }
  }
  return g;
}

// ---------------------------------------------------------------- shared materials
export interface LaneLayout {
  /** lanes in each direction */
  each: number;
  laneW?: number;
  /** centre treatment: raised landscaped median, double yellow, or a two-way left-turn lane */
  median: 'raised' | 'paint' | 'twltl' | 'oneway';
  medianW?: number;
}

export function roadWidth(l: LaneLayout): number {
  return l.each * 2 * (l.laneW ?? 3.3) + (l.median === 'oneway' ? 0 : l.medianW ?? (l.median === 'paint' ? 0.6 : l.median === 'twltl' ? 3.6 : 2.4));
}

const roadMats = new Map<string, THREE.MeshStandardMaterial>();
/** Asphalt with the lane paint for a layout: u across the full curb-to-curb width, v = 12 m per tile. */
export function laneMaterial(l: LaneLayout): THREE.MeshStandardMaterial {
  const key = `${l.each}|${l.laneW ?? 3.3}|${l.median}|${l.medianW ?? ''}`;
  let m = roadMats.get(key);
  if (m) return m;
  const W = roadWidth(l);
  const laneW = l.laneW ?? 3.3;
  const medW = W - l.each * 2 * laneW;
  const PX = 1024;
  const sx = PX / W;
  const tex = canvasTex(PX, 256, (ctx, w, h) => {
    ctx.fillStyle = '#35373d';
    ctx.fillRect(0, 0, w, h);
    let seed = 7 + l.each * 13;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 5200; i++) {
      const v = 40 + Math.floor(r() * 30);
      ctx.fillStyle = `rgb(${v},${v + 1},${v + 4})`;
      ctx.fillRect(r() * w, r() * h, 2, 2);
    }
    // tyre-polished wheel paths, darker oil drip down each lane centre
    const laneX = (k: number, side: -1 | 1) => (side < 0 ? (k + 0.5) * laneW : W - (k + 0.5) * laneW);
    for (let k = 0; k < l.each; k++) {
      for (const side of [-1, 1] as const) {
        const cx = laneX(k, side) * sx;
        ctx.fillStyle = 'rgba(20,20,24,0.22)';
        ctx.fillRect(cx - 0.25 * sx, 0, 0.5 * sx, h);
        ctx.fillStyle = 'rgba(90,92,98,0.10)';
        ctx.fillRect(cx - 1.05 * sx, 0, 0.5 * sx, h);
        ctx.fillRect(cx + 0.55 * sx, 0, 0.5 * sx, h);
      }
    }
    // gutter pans (concrete) at both curbs
    ctx.fillStyle = '#8f8b82';
    ctx.fillRect(0, 0, 0.45 * sx, h);
    ctx.fillRect(w - 0.45 * sx, 0, 0.45 * sx, h);
    // edge lines
    ctx.fillStyle = '#d8d6cf';
    ctx.fillRect(0.6 * sx, 0, 0.12 * sx, h);
    ctx.fillRect(w - 0.72 * sx, 0, 0.12 * sx, h);
    // lane dashes: 3 m dash, 9 m gap (the tile is 12 m)
    for (let k = 1; k < l.each; k++) {
      for (const side of [-1, 1] as const) {
        const x = (side < 0 ? k * laneW : W - k * laneW) * sx;
        ctx.fillRect(x - 0.06 * sx, 0, 0.12 * sx, h * 0.25);
      }
    }
    const m0 = l.each * laneW * sx;
    const m1 = (W - l.each * laneW) * sx;
    ctx.fillStyle = '#d6a634';
    if (l.median === 'paint' || l.median === 'raised') {
      const mid = (m0 + m1) / 2;
      if (l.median === 'paint') {
        ctx.fillRect(mid - 0.2 * sx, 0, 0.11 * sx, h);
        ctx.fillRect(mid + 0.09 * sx, 0, 0.11 * sx, h);
      } else {
        // yellow edge lines along the median curb
        ctx.fillRect(m0 + 0.05 * sx, 0, 0.11 * sx, h);
        ctx.fillRect(m1 - 0.16 * sx, 0, 0.11 * sx, h);
      }
    } else if (l.median === 'twltl') {
      ctx.fillRect(m0 + 0.05 * sx, 0, 0.11 * sx, h);
      ctx.fillRect(m1 - 0.16 * sx, 0, 0.11 * sx, h);
      for (let y = 0; y < h; y += h / 2) {
        ctx.fillRect(m0 + 0.3 * sx, y, 0.11 * sx, h * 0.25);
        ctx.fillRect(m1 - 0.41 * sx, y, 0.11 * sx, h * 0.25);
      }
    }
    // a few patch seams and cracks
    ctx.strokeStyle = 'rgba(22,22,26,0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      let x = r() * w;
      let y = r() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (r() - 0.5) * 40;
        y += r() * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.86, metalness: 0.02 });
  roadMats.set(key, m);
  return m;
}

let walkMat: THREE.MeshStandardMaterial | null = null;
/** Brushed concrete sidewalk with saw-cut joints every 1.5 m (u/v in metres / 3). */
export function sidewalkMaterial(): THREE.MeshStandardMaterial {
  if (walkMat) return walkMat;
  const tex = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#bdb6aa';
    ctx.fillRect(0, 0, w, h);
    let seed = 99;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const v = 160 + Math.floor(r() * 40);
      ctx.fillStyle = `rgba(${v},${v - 6},${v - 14},0.5)`;
      ctx.fillRect(r() * w, r() * h, 2, 2);
    }
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(60,55,50,${0.05 + r() * 0.06})`;
      ctx.beginPath();
      ctx.ellipse(r() * w, r() * h, 6 + r() * 14, 4 + r() * 10, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(70,64,58,0.55)';
    for (const p of [0, w / 2]) {
      ctx.fillRect(p, 0, 2, h);
      ctx.fillRect(0, p, w, 2);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  walkMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  return walkMat;
}

let paintMat: THREE.MeshStandardMaterial | null = null;
export function roadPaint(): THREE.MeshStandardMaterial {
  return (paintMat ??= new THREE.MeshStandardMaterial({ color: 0xdedcd4, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
}

let gravelMat: THREE.MeshStandardMaterial | null = null;
function medianTop(): THREE.MeshStandardMaterial {
  if (gravelMat) return gravelMat;
  const tex = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#a08a6e';
    ctx.fillRect(0, 0, w, h);
    let seed = 3;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1800; i++) {
      const v = 110 + Math.floor(r() * 80);
      ctx.fillStyle = `rgb(${v},${v - 16},${v - 34})`;
      ctx.fillRect(r() * w, r() * h, 2, 2);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return (gravelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.97 }));
}

// ---------------------------------------------------------------- a road
export interface RoadSpec {
  name: string;
  pts: P[];
  lanes: LaneLayout;
  /** sidewalk widths [left, right] (0 = none) */
  walk: [number, number];
  /** arc-length ranges with no sidewalk/curb on a side (cross streets, driveways): [s0, s1, side] (side −1 left, 1 right) */
  gaps?: Array<[number, number, -1 | 1]>;
  /** arc-length ranges where the raised median is cut (left-turn openings, the ends) */
  medianCuts?: Array<[number, number]>;
  /** street lights every n metres (alternating sides), from s = first */
  lights?: { every: number; first?: number; h?: number };
  /** palms on the raised median every n metres */
  palms?: number;
  zone?: string;
  mapLabel?: string;
}

export interface BuiltRoad {
  fr: Frame[];
  W: number;
  len: number;
  /** lateral offset of lane k (0 = curb lane… ) on a side: side 1 = right half (travelling first → last), −1 = left half */
  laneOffset: (side: -1 | 1, k: number) => number;
}

function inGap(spec: RoadSpec, s: number, side: -1 | 1): boolean {
  return (spec.gaps ?? []).some(([a, c, sd]) => sd === side && s > a && s < c);
}

/** Lay one road: surface, gutters/curbs, sidewalks, median, lights. Static pieces go into `mg`. */
export function layRoad(b: WorldBuilder, mg: Merger, spec: RoadSpec): BuiltRoad {
  const fr = frames(spec.pts);
  const len = fr[fr.length - 1].s;
  const W = roadWidth(spec.lanes);
  const half = W / 2;
  const laneW = spec.lanes.laneW ?? 3.3;
  // surface
  const surf = new THREE.Mesh(ribbon(fr, -half, half, 0, 12), laneMaterial(spec.lanes));
  surf.position.y = 0.036;
  surf.receiveShadow = true;
  b.add(surf);
  // curbs + sidewalks, in runs between the gaps
  const curb = mat(0xb4ada1, 0.8);
  const curbTop = mat(0xd4cec2, 0.75);
  const walk = sidewalkMaterial();
  for (const side of [-1, 1] as const) {
    const ww = side < 0 ? spec.walk[0] : spec.walk[1];
    const cuts = (spec.gaps ?? []).filter((g) => g[2] === side).sort((a, c) => a[0] - c[0]);
    const runs: Array<[number, number]> = [];
    let cur = 0;
    for (const [a, c] of cuts) {
      if (a > cur) runs.push([cur, a]);
      cur = Math.max(cur, c);
    }
    if (cur < len) runs.push([cur, len]);
    for (const [r0, r1] of runs) {
      if (r1 - r0 < 0.5) continue;
      const o = side * (half + 0.15);
      // curb as boxes per segment
      for (let i = 0; i < fr.length - 1; i++) {
        const a = Math.max(r0, fr[i].s);
        const c = Math.min(r1, fr[i + 1].s);
        if (c - a < 0.05) continue;
        const pa = at(fr, a);
        const pc = at(fr, c);
        const mx = (pa.x + pc.x) / 2 + pa.rx * o;
        const mz = (pa.z + pc.z) / 2 + pa.rz * o;
        const yaw = Math.atan2(pa.tx, pa.tz);
        mg.box(curb, mx, 0.08, mz, 0.3, 0.16, c - a, yaw);
        mg.box(curbTop, mx + pa.rx * side * 0.02, 0.165, mz + pa.rz * side * 0.02, 0.36, 0.025, c - a, yaw);
      }
      if (ww > 0) {
        const g = side > 0 ? ribbon(fr, half + 0.3, half + ww, WALK_Y, 3, 3, r0, r1) : ribbon(fr, -half - ww, -half - 0.3, WALK_Y, 3, 3, r0, r1);
        mg.add(g, walk);
      }
    }
  }
  // median
  if (spec.lanes.median === 'raised') {
    const mw = W - spec.lanes.each * 2 * laneW;
    const cuts = (spec.medianCuts ?? []).slice().sort((a, c) => a[0] - c[0]);
    const runs: Array<[number, number]> = [];
    let cur = 0;
    for (const [a, c] of cuts) {
      if (a > cur) runs.push([cur, a]);
      cur = Math.max(cur, c);
    }
    if (cur < len) runs.push([cur, len]);
    const edge = mat(0xb8ad9c, 0.85);
    let palmI = 0;
    for (const [r0, r1] of runs) {
      if (r1 - r0 < 3) continue;
      for (let i = 0; i < fr.length - 1; i++) {
        const a = Math.max(r0, fr[i].s);
        const c = Math.min(r1, fr[i + 1].s);
        if (c - a < 0.2) continue;
        const pa = at(fr, a);
        const pc = at(fr, c);
        const mx = (pa.x + pc.x) / 2;
        const mz = (pa.z + pc.z) / 2;
        const yaw = Math.atan2(pa.tx, pa.tz);
        mg.box(edge, mx, 0.11, mz, mw, 0.22, c - a, yaw);
        // collider: an axis-aligned box per segment (segments are near axis-aligned)
        const hx = Math.abs(pa.tx) * (c - a) / 2 + Math.abs(pa.rx) * mw / 2;
        const hz = Math.abs(pa.tz) * (c - a) / 2 + Math.abs(pa.rz) * mw / 2;
        b.collider(mx - hx, mx + hx, mz - hz, mz + hz, 0, 0.22);
      }
      mg.add(ribbon(fr, -mw / 2 + 0.25, mw / 2 - 0.25, 0.225, 2, 2, r0, r1), medianTop());
      if (spec.palms) {
        for (let s = r0 + spec.palms / 2; s < r1 - 2; s += spec.palms) {
          const p = at(fr, s);
          palmInto(mg, p.x, p.z, 7.5 + (palmI % 3) * 0.9, 41 + palmI++, 0.22);
        }
      }
    }
  }
  // street lights (cobra heads over the curb lanes) + night pools
  if (spec.lights) {
    const pool = lightPoolMat(true);
    let k = 0;
    for (let s = spec.lights.first ?? 8; s < len - 4; s += spec.lights.every) {
      const side = (k++ % 2 === 0 ? 1 : -1) as -1 | 1;
      if (inGap(spec, s, side)) continue;
      const p = at(fr, s);
      const o = side * (half + 0.8);
      const x = p.x + p.rx * o;
      const z = p.z + p.rz * o;
      cobraPoleInto(mg, b, x, z, Math.atan2(-p.rx * side, -p.rz * side), spec.lights.h ?? 9.5, 2.6);
      const pl = new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2);
      pl.translate(x - p.rx * side * 2.6, 0.07, z - p.rz * side * 2.6);
      mg.add(pl, pool);
    }
  }
  // map + zone
  const xs = fr.map((f) => f.x);
  const zs = fr.map((f) => f.z);
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i];
    const c = fr[i + 1];
    const minX = Math.min(a.x, c.x) - (Math.abs(a.rx) * half);
    const maxX = Math.max(a.x, c.x) + (Math.abs(a.rx) * half);
    const minZ = Math.min(a.z, c.z) - (Math.abs(a.rz) * half);
    const maxZ = Math.max(a.z, c.z) + (Math.abs(a.rz) * half);
    b.feature({ kind: 'road', x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: Math.max(1, maxX - minX), d: Math.max(1, maxZ - minZ), color: '#3b3a40', label: i === 0 ? spec.mapLabel : undefined });
    if (spec.zone) {
      const wl = Math.max(spec.walk[0], spec.walk[1]);
      b.zone(spec.zone, minX - Math.abs(a.rx) * wl, maxX + Math.abs(a.rx) * wl, minZ - Math.abs(a.rz) * wl, maxZ + Math.abs(a.rz) * wl);
    }
  }
  void xs;
  void zs;
  const medW = W - spec.lanes.each * 2 * laneW;
  return {
    fr,
    W,
    len,
    laneOffset: (side, k) => side * (medW / 2 + (spec.lanes.each - 1 - k + 0.5) * laneW),
  };
}

// ---------------------------------------------------------------- paint
/** A white bar across lateral offsets o0..o1 at arc s, `d` deep along the road. */
export function stopBar(mg: Merger, road: BuiltRoad, s: number, o0: number, o1: number, d = 0.5): void {
  const p = at(road.fr, s);
  // PlaneGeometry after rotateX: width along x, depth along z; the yaw turns depth to run along the road
  const yaw = Math.atan2(p.tx, p.tz);
  const om = (o0 + o1) / 2;
  const g = new THREE.PlaneGeometry(Math.abs(o1 - o0), d).rotateX(-Math.PI / 2).rotateY(yaw);
  g.translate(p.x + p.rx * om, ROAD_Y + 0.008, p.z + p.rz * om);
  mg.add(g, roadPaint());
}

/** Continental crosswalk across the whole road at arc s: 0.6 m bars every 1.2 m, `len` m long along the road. */
export function crosswalk(mg: Merger, road: BuiltRoad, s: number, len = 3.2): void {
  const p = at(road.fr, s);
  const yaw = Math.atan2(p.tx, p.tz);
  const half = road.W / 2 - 0.6;
  for (let o = -half + 0.3; o <= half - 0.3; o += 1.2) {
    const g = new THREE.PlaneGeometry(0.6, len).rotateX(-Math.PI / 2).rotateY(yaw);
    g.translate(p.x + p.rx * o, ROAD_Y + 0.008, p.z + p.rz * o);
    mg.add(g, roadPaint());
  }
}

/** Painted turn arrows (simple straight/left glyph) in a lane at arc s, pointing along `dir` (±1). */
export function laneArrow(mg: Merger, road: BuiltRoad, s: number, o: number, dir: 1 | -1, kind: 'straight' | 'left' | 'right' = 'straight'): void {
  const p = at(road.fr, s);
  const yaw = Math.atan2(p.tx * dir, p.tz * dir);
  const shape = new THREE.Shape();
  shape.moveTo(-0.12, -1.6);
  shape.lineTo(0.12, -1.6);
  shape.lineTo(0.12, 0.6);
  shape.lineTo(0.38, 0.6);
  shape.lineTo(0, 1.6);
  shape.lineTo(-0.38, 0.6);
  shape.lineTo(-0.12, 0.6);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  // ShapeGeometry's +y (arrow tip) becomes −z after rotateX(−π/2): flip so the tip points along +z, then yaw
  g.rotateY(Math.PI);
  if (kind !== 'straight') {
    const bend = new THREE.ShapeGeometry(
      (() => {
        const s2 = new THREE.Shape();
        const sx = kind === 'left' ? 1 : -1;
        s2.moveTo(0, 0.2);
        s2.lineTo(sx * 0.9, 0.2);
        s2.lineTo(sx * 0.9, 0.45);
        s2.lineTo(sx * 1.3, 0.05);
        s2.lineTo(sx * 0.9, -0.35);
        s2.lineTo(sx * 0.9, -0.1);
        s2.lineTo(0, -0.1);
        s2.closePath();
        return s2;
      })()
    ).rotateX(-Math.PI / 2);
    bend.rotateY(Math.PI);
    mg.add(bend.rotateY(yaw).translate(p.x + p.rx * o, ROAD_Y + 0.009, p.z + p.rz * o), roadPaint());
  }
  g.rotateY(yaw);
  g.translate(p.x + p.rx * o, ROAD_Y + 0.009, p.z + p.rz * o);
  mg.add(g, roadPaint());
}

/** A plain asphalt patch (intersection box) over x0..x1, z0..z1 (covers the lane paint). */
export function junctionBox(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number): void {
  const g =new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, ROAD_Y + 0.003, (z0 + z1) / 2);
  const me = new THREE.Mesh(g, plainAsphalt());
  me.receiveShadow = true;
  b.add(me);
}

let plainMat: THREE.MeshStandardMaterial | null = null;
function plainAsphalt(): THREE.MeshStandardMaterial {
  if (plainMat) return plainMat;
  const tex = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#35373d';
    ctx.fillRect(0, 0, w, h);
    let seed = 5;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2400; i++) {
      const v = 40 + Math.floor(r() * 30);
      ctx.fillStyle = `rgb(${v},${v + 1},${v + 4})`;
      ctx.fillRect(r() * w, r() * h, 2, 2);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return (plainMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.86, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
}

// ---------------------------------------------------------------- signals
type LampSet = Record<'red' | 'yellow' | 'green', THREE.MeshBasicMaterial>;
interface SignalReg {
  lamps: LampSet;
  phase: (t: number) => Phase;
  set: (p: Phase) => void;
}
const regs = new WeakMap<WorldBuilder, SignalReg[]>();
const lampCache = new WeakMap<(t: number) => Phase, SignalReg>();

/** Lamp materials shared by every head on the same phase clock (registered once, driven by one updater). */
function lampsFor(b: WorldBuilder, phase: (t: number) => Phase): LampSet {
  const hit = lampCache.get(phase);
  if (hit) return hit.lamps;
  let list = regs.get(b);
  if (!list) {
    list = [];
    regs.set(b, list);
    const l = list;
    b.every(() => {
      const t = performance.now() / 1000;
      for (const r of l) r.set(r.phase(t));
    });
  }
  const lamps = signalLamps();
  const on = { red: 0xff2a1a, yellow: 0xffc21a, green: 0x2bff7a };
  const off = { red: 0x3a0d0a, yellow: 0x3a2c0a, green: 0x0a3a1e };
  let last: Phase | null = null;
  const reg: SignalReg = {
    lamps,
    phase,
    set: (p) => {
      if (p === last) return;
      last = p;
      const lit = p === 'go' ? 'green' : p === 'yellow' ? 'yellow' : 'red';
      for (const k of ['red', 'yellow', 'green'] as const) lamps[k].color.setHex(k === lit ? on[k] : off[k]);
    },
  };
  list.push(reg);
  lampCache.set(phase, reg);
  return lamps;
}

/**
 * Mast-arm signal standing at (x, z) with its arm reaching `arm` metres toward (dirX, dirZ) over the
 * lanes it controls; `blade` = the lit street-name sign on the arm (the street being crossed).
 */
export function signal(b: WorldBuilder, x: number, z: number, dirX: number, dirZ: number, arm: number, phase: (t: number) => Phase, blade?: string): void {
  const sig = trafficSignal(arm, lampsFor(b, phase));
  if (blade) sig.group.add(placed(streetBlade(b, blade), Math.min(2.1, arm * 0.3), 7.35, 0));
  // local +x → (dirX, dirZ): rotation about y by θ maps +x to (cos θ, −sin θ)
  b.add(sig.group, x, 0, z, Math.atan2(-dirZ, dirX));
  b.collider(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 7, true);
}

/** Cross-street phase at a Strip mid-block crossing: green while the Boulevard holds (strip.ts crosswalkPhase). */
export function stripSidePhase(offset: number): (t: number) => Phase {
  return (t) => {
    const c = (((t + offset) % 30) + 30) % 30;
    if (c < 22.5) return 'stop';
    if (c < 28) return 'go';
    if (c < 29.5) return 'yellow';
    return 'stop';
  };
}

/** A plain two-phase intersection clock: `main` green for the first part of the cycle, `cross` after. */
export function twoPhase(cycle: number, mainGreen: number, offset: number): { main: (t: number) => Phase; cross: (t: number) => Phase } {
  const c = (t: number) => (((t + offset) % cycle) + cycle) % cycle;
  return {
    main: (t) => {
      const k = c(t);
      return k < mainGreen ? 'go' : k < mainGreen + 3 ? 'yellow' : 'stop';
    },
    cross: (t) => {
      const k = c(t);
      return k < mainGreen + 4 ? 'stop' : k < cycle - 3.5 ? 'go' : k < cycle - 0.5 ? 'yellow' : 'stop';
    },
  };
}

// ---------------------------------------------------------------- traffic
export interface TrafficPath {
  /** the path cars follow (sample curves finely); they appear at the start and leave at the end */
  pts: P[];
  count: number;
  speed: number;
  /** stop lines: arc length along this path and the phase that governs it */
  stops?: Array<{ s: number; phase: (t: number) => Phase }>;
}

/** Quarter-ish turn from (x0,z0) heading (t0) to (x1,z1) heading (t1), sampled as a quadratic Bézier. */
export function turn(x0: number, z0: number, cx: number, cz: number, x1: number, z1: number, n = 8): P[] {
  const out: P[] = [];
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const a = (1 - k) * (1 - k);
    const m = 2 * (1 - k) * k;
    const c = k * k;
    out.push([a * x0 + m * cx + c * x1, a * z0 + m * cz + c * z1]);
  }
  return out;
}

const CAR_COLORS = [0xe8eaed, 0x48505c, 0x7b828c, 0xa8242c, 0x244e86, 0xc9b48a, 0x1b1d22, 0x3b6e52, 0xf2c230, 0xd9d9d9];

/**
 * Instanced cars along paths: they keep their distance, stop for a red at each stop line, and are only
 * simulated and drawn while the camera is within `radius` of `center`. A car that reaches the end comes
 * back at the start once nobody is standing near the start (so nothing pops in in front of the player).
 */
export function pathTraffic(b: WorldBuilder, paths: TrafficPath[], center: P, radius: number, seed = 1): void {
  interface Lane {
    fr: Frame[];
    len: number;
    path: TrafficPath;
    cars: Car[];
  }
  interface Car {
    lane: Lane;
    s: number;
    v: number;
    kind: number;
    batchIdx: number;
    hidden: boolean;
  }
  let sd = seed * 7919 + 1;
  const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const lanes: Lane[] = [];
  const all: Car[] = [];
  const kindLists: Car[][] = [[], [], []];
  const colors: number[][] = [[], [], []];
  for (const path of paths) {
    const fr = frames(path.pts);
    const lane: Lane = { fr, len: fr[fr.length - 1].s, path, cars: [] };
    lanes.push(lane);
    for (let i = 0; i < path.count; i++) {
      const kind = R() < 0.12 ? 2 : R() < 0.45 ? 1 : 0;
      const c: Car = { lane, s: ((i + 0.3 + R() * 0.4) / path.count) * lane.len, v: path.speed, kind, batchIdx: kindLists[kind].length, hidden: false };
      kindLists[kind].push(c);
      colors[kind].push(R() < 0.14 ? 0xf2c230 : CAR_COLORS[Math.floor(R() * CAR_COLORS.length)]);
      lane.cars.push(c);
      all.push(c);
    }
  }
  if (!all.length) return;
  const geos = getCarGeos();
  const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.72, metalness: 0.1 });
  const head = new THREE.MeshBasicMaterial({ color: 0xfff2cc });
  const tail = new THREE.MeshBasicMaterial({ color: 0xff2c22 });
  const grp = new THREE.Group();
  const batches: Array<{ pm: THREE.InstancedMesh; tm: THREE.InstancedMesh }> = [];
  const col = new THREE.Color();
  for (let k = 0; k < 3; k++) {
    const n = Math.max(1, kindLists[k].length);
    const pm = new THREE.InstancedMesh(geos.paint[k], paint, n);
    const tm = new THREE.InstancedMesh(geos.trim[k], trim, n);
    pm.count = kindLists[k].length;
    tm.count = kindLists[k].length;
    pm.frustumCulled = false;
    tm.frustumCulled = false;
    kindLists[k].forEach((_c, i) => pm.setColorAt(i, col.setHex(colors[k][i])));
    if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
    grp.add(pm, tm);
    batches.push({ pm, tm });
  }
  const hm = new THREE.InstancedMesh(geos.lights, head, all.length);
  const rm = new THREE.InstancedMesh(geos.lights, tail, all.length);
  hm.frustumCulled = false;
  rm.frustumCulled = false;
  grp.add(hm, rm);
  b.scene.add(grp);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const pv = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);
  const r2 = radius * radius;
  const UP = THREE.Object3D.DEFAULT_UP;
  b.every((dt, _t, night) => {
    const dx = viewer.cam.x - center[0];
    const dz = viewer.cam.z - center[1];
    const vis = dx * dx + dz * dz < r2;
    grp.visible = vis;
    if (!vis) return;
    const t = performance.now() / 1000;
    const step = Math.min(dt, 0.1);
    for (const lane of lanes) {
      lane.cars.sort((a, c) => a.s - c.s);
      const n = lane.cars.length;
      for (let i = n - 1; i >= 0; i--) {
        const c = lane.cars[i];
        if (c.hidden) {
          // waiting to come back at the start: only when the start is out of the player's way and clear
          const p0 = lane.fr[0];
          const ex = viewer.cam.x - p0.x;
          const ez = viewer.cam.z - p0.z;
          const clear = lane.cars.every((o) => o === c || o.hidden || o.s > 12);
          if (ex * ex + ez * ez > 45 * 45 && clear) {
            c.hidden = false;
            c.s = 0;
            c.v = lane.path.speed * 0.8;
          }
          continue;
        }
        let target = lane.path.speed;
        for (const st of lane.path.stops ?? []) {
          const d = st.s - c.s;
          if (d <= 0 || d > 34) continue;
          const ph = st.phase(t);
          if (ph === 'go' || (ph === 'yellow' && d < 7)) continue;
          target = Math.min(target, Math.max(0, (d - 2.6) * 0.9));
        }
        // the car ahead (next in s order that isn't hidden)
        for (let j = i + 1; j < n; j++) {
          const o = lane.cars[j];
          if (o.hidden) continue;
          const gap = o.s - c.s - 5.2;
          target = Math.min(target, Math.max(0, (gap - 2.2) * 1.2));
          break;
        }
        c.v = THREE.MathUtils.lerp(c.v, target, Math.min(1, step * 2.2));
        c.s += c.v * step;
        if (c.s >= lane.len) {
          c.s = lane.len;
          c.hidden = true;
        }
      }
    }
    const lampOn = night > 0.25;
    hm.visible = lampOn;
    rm.visible = lampOn;
    let li = 0;
    for (let k = 0; k < 3; k++) {
      const bt = batches[k];
      kindLists[k].forEach((c, i) => {
        if (c.hidden) {
          m4.compose(pv.set(0, -50, 0), q, zero);
          bt.pm.setMatrixAt(i, m4);
          bt.tm.setMatrixAt(i, m4);
          if (lampOn) {
            hm.setMatrixAt(li, m4);
            rm.setMatrixAt(li, m4);
          }
          li++;
          return;
        }
        const p = at(c.lane.fr, c.s);
        const yaw = Math.atan2(p.tx, p.tz);
        q.setFromAxisAngle(UP, yaw);
        m4.compose(pv.set(p.x, ROAD_Y, p.z), q, one);
        bt.pm.setMatrixAt(i, m4);
        bt.tm.setMatrixAt(i, m4);
        if (lampOn) {
          hm.setMatrixAt(li, m4);
          q2.setFromAxisAngle(UP, yaw + Math.PI);
          m4.compose(pv, q2, one);
          rm.setMatrixAt(li, m4);
        }
        li++;
      });
      bt.pm.instanceMatrix.needsUpdate = true;
      bt.tm.instanceMatrix.needsUpdate = true;
    }
    if (lampOn) {
      hm.instanceMatrix.needsUpdate = true;
      rm.instanceMatrix.needsUpdate = true;
    }
  });
}

/** Offset a polyline sideways by `o` (right-hand positive), e.g. to get a lane path from a road centreline. */
export function offsetLine(pts: P[], o: number, reverse = false): P[] {
  const fr = frames(pts);
  const out = fr.map((f) => [f.x + f.rx * o, f.z + f.rz * o] as P);
  return reverse ? out.reverse() : out;
}

export { v3 };

// ---------------------------------------------------------------- a cross street meeting the Boulevard
/** Arc length of the point on a polyline closest to (x, z). */
export function sOn(pts: P[], x: number, z: number): number {
  const fr = frames(pts);
  let best = Infinity;
  let bs = 0;
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i];
    const c = fr[i + 1];
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const L2 = dx * dx + dz * dz || 1;
    const k = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
    const d = Math.hypot(x - (a.x + dx * k), z - (a.z + dz * k));
    if (d < best) {
      best = d;
      bs = a.s + k * Math.sqrt(L2);
    }
  }
  return bs;
}

const STRIP_CURB = 11.6;
const STRIP_LANES = [3.1, 6.5, 9.9];

export interface StripRoad {
  /** +1 east of the Boulevard, −1 west */
  sgn: 1 | -1;
  /** the outward centreline, first point at the Boulevard curb */
  pts: P[];
  road: BuiltRoad;
  /** the Boulevard's own phase for its lanes here, and the side street's */
  stripPhase: (t: number) => Phase;
  sidePhase: (t: number) => Phase;
  /** Boulevard stop lines (southbound z, northbound z) */
  stop: [number, number];
  /** signals further out: arc length along the road and the phase, for the outbound / inbound lanes */
  outStops?: Array<[number, (t: number) => Phase]>;
  inStops?: Array<[number, (t: number) => Phase]>;
  counts?: [number, number, number, number];
  speed?: number;
  /** blade on the side street's signal arm */
  blade?: string;
}

/**
 * The Boulevard end of a cross street: the crosswalk across its mouth, the inbound stop bar and turn
 * arrows, its signal on the inbound corner, and traffic turning in from (and out onto) the Boulevard.
 */
export function stripEnd(b: WorldBuilder, mg: Merger, o: StripRoad, cull: [P, number], seed: number): void {
  const { road, sgn } = o;
  const half = road.W / 2;
  crosswalk(mg, road, 3.2);
  stopBar(mg, road, 5.6, -half + 0.4, road.laneOffset(-1, 1) + 1.5);
  laneArrow(mg, road, 12, road.laneOffset(-1, 0), -1, 'right');
  laneArrow(mg, road, 12, road.laneOffset(-1, 1), -1, 'left');
  const p = at(road.fr, 6.2);
  const po = -(half + 0.9);
  const reach = half + 0.4 - Math.abs(road.laneOffset(-1, 1)) + 3.4;
  signal(b, p.x + p.rx * po, p.z + p.rz * po, p.rx, p.rz, Math.max(4.4, Math.min(7.2, reach + 2.2)), o.sidePhase, o.blade ?? 'Las Vegas Blvd S');

  const L = STRIP_LANES;
  const sp = o.speed ?? 11;
  const [cOut0, cOut1, cIn0, cIn1] = o.counts ?? [4, 3, 4, 3];
  const outC = offsetLine(o.pts, road.laneOffset(1, 0));
  const outI = offsetLine(o.pts, road.laneOffset(1, 1));
  const inC = offsetLine(o.pts, road.laneOffset(-1, 0), true);
  const inI = offsetLine(o.pts, road.laneOffset(-1, 1), true);
  const zc = o.pts[0][1];
  const paths: TrafficPath[] = [];
  const mk = (pts: P[], count: number, stops: Array<[number, number, (t: number) => Phase]>) => paths.push({ pts, count, speed: sp, stops: stops.map(([x, z, ph]) => ({ s: sOn(pts, x, z), phase: ph })) });
  const roadPt = (s: number, off: number): [number, number] => {
    const q = at(road.fr, s);
    return [q.x + q.rx * off, q.z + q.rz * off];
  };
  const outward = (line: P[], from: number) => line.filter((q) => (q[0] - from) * sgn > 0);
  const xIn = sgn * (STRIP_CURB + 6);
  // outbound curb lane: a right turn in from the Boulevard's curb lane (northbound for east roads, southbound for west)
  const dzR = -sgn; // that lane's heading in z
  const zO0 = outC[0][1];
  mk(
    [[sgn * L[2], zc - dzR * 45], [sgn * L[2], zc - dzR * 9], ...turn(sgn * L[2], zc - dzR * 9, sgn * L[2], zO0, xIn, zO0), ...outward(outC, xIn - sgn * 0.5)],
    cOut0,
    (o.outStops ?? []).map(([s, ph]) => [...roadPt(s, road.laneOffset(1, 0)), ph])
  );
  // outbound inner lane: a left turn in from the opposite inner lane, held by the Boulevard's signal
  const dzL = sgn; // the opposite direction's heading
  const zO1 = outI[0][1];
  const xI1 = -sgn * L[1];
  const stopZ = sgn > 0 ? o.stop[0] : o.stop[1];
  mk(
    [[xI1, zc - dzL * 50], [xI1, stopZ + dzL * 1.5], ...turn(xI1, stopZ + dzL * 1.5, xI1 + sgn * 2, zO1, sgn * (STRIP_CURB + 2), zO1), ...outward(outI, sgn * (STRIP_CURB + 1.5))],
    cOut1,
    [[xI1, stopZ, o.stripPhase], ...(o.outStops ?? []).map(([s, ph]) => [...roadPt(s, road.laneOffset(1, 1)), ph] as [number, number, (t: number) => Phase])]
  );
  // inbound curb lane: a right turn out onto the Boulevard's curb lane
  const zI0 = inC[inC.length - 1][1];
  const sideStop = (x: number, z: number): [number, number, (t: number) => Phase] => [x, z, o.sidePhase];
  mk(
    [...inC.filter((q) => (q[0] - xIn) * sgn > 0), [xIn, zI0], ...turn(xIn, zI0, sgn * L[2], zI0, sgn * L[2], zI0 + dzR * 9), [sgn * L[2], zI0 + dzR * 9], [sgn * L[2], zI0 + dzR * 90]],
    cIn0,
    [...(o.inStops ?? []).map(([s, ph]) => [...roadPt(s, road.laneOffset(-1, 0)), ph] as [number, number, (t: number) => Phase]), sideStop(sgn * (STRIP_CURB + 5.4), zI0)]
  );
  // inbound inner lane: a left turn out onto the far side of the Boulevard
  const zI1 = inI[inI.length - 1][1];
  const xo = sgn * (STRIP_CURB + 5.4);
  mk(
    [...inI.filter((q) => (q[0] - xo) * sgn > 0), [xo, zI1], ...turn(xo, zI1, -sgn * L[1], zI1, -sgn * L[1], zI1 + dzL * 12), [-sgn * L[1], zI1 + dzL * 12], [-sgn * L[1], zI1 + dzL * 95]],
    cIn1,
    [...(o.inStops ?? []).map(([s, ph]) => [...roadPt(s, road.laneOffset(-1, 1)), ph] as [number, number, (t: number) => Phase]), sideStop(xo, zI1)]
  );
  pathTraffic(b, paths, cull[0], cull[1], seed);
}

/**
 * A parking garage seen from the street: concrete decks with open bays (dark slots between the slabs),
 * stair towers at the corners, a sign on the street face. Solid to walk into.
 */
export function streetGarage(b: WorldBuilder, mg: Merger, x0: number, x1: number, z0: number, z1: number, levels: number, label: string, face: 'n' | 's' | 'e' | 'w', signText?: string, signBg = '#1d2a4a'): void {
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const H = 3.2;
  const h = levels * H + 1.1;
  const slab = mat(0xbab4aa, 0.85);
  const gap = mat(0x22252a, 0.9);
  const core = mat(0xa8a196, 0.8);
  mg.box(gap, cx, h / 2, cz, w - 0.4, h, d - 0.4, 0, true);
  for (let k = 0; k <= levels; k++) mg.box(slab, cx, k * H + 0.55, cz, w, 1.1, d);
  for (const [px, pz] of [
    [x0 + 1.6, z0 + 1.6],
    [x1 - 1.6, z1 - 1.6],
  ]) mg.box(core, px, h / 2 + 0.6, pz, 3.2, h + 1.2, 3.2, 0, true);
  // columns on the long faces
  for (let x = x0 + 4; x < x1 - 2; x += 8) for (const z of [z0 + 0.15, z1 - 0.15]) mg.box(slab, x, h / 2, z, 0.5, h, 0.3);
  for (let z = z0 + 4; z < z1 - 2; z += 8) for (const x of [x0 + 0.15, x1 - 0.15]) mg.box(slab, x, h / 2, z, 0.3, h, 0.5);
  b.collider(x0, x1, z0, z1, 0, h, true);
  b.building(cx, cz, w, d, '#9a958c', label);
  if (signText) {
    const fx = face === 'e' ? x1 + 0.08 : face === 'w' ? x0 - 0.08 : cx;
    const fz = face === 's' ? z1 + 0.08 : face === 'n' ? z0 - 0.08 : cz;
    const rot = face === 's' ? 0 : face === 'n' ? Math.PI : face === 'e' ? Math.PI / 2 : -Math.PI / 2;
    const len = face === 'n' || face === 's' ? w : d;
    b.add(letters(b, signText, Math.min(len * 0.6, signText.length * 0.62), 1.0, { style: 'sans', fill: '#ffffff', bg: signBg, rule: '#ffffff', scale: 0.62 }), fx, h - 1.4, fz, rot);
  }
}
