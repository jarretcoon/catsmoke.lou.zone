import * as THREE from 'three';

/**
 * Smooth swept geometry for bridges and flyover ramps: a centreline (points with a level "right" vector),
 * from which decks, parapets, sidewalks and fills are swept as continuous strips. No stair steps, no
 * zig-zag joints between straight boxes.
 */
export interface PathPt {
  p: THREE.Vector3;
  /** Horizontal unit vector pointing to the path's right-hand side. */
  r: THREE.Vector3;
}

/** Build a path from points, with level right vectors from the local direction. */
export function pathFrom(points: THREE.Vector3[]): PathPt[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const c = points[Math.min(points.length - 1, i + 1)];
    const t = new THREE.Vector3(c.x - a.x, 0, c.z - a.z).normalize();
    return { p: p.clone(), r: new THREE.Vector3(-t.z, 0, t.x) };
  });
}

/** Resample a smooth curve through `pts` every ~`step` metres. */
export function smoothPath(pts: THREE.Vector3[], step: number): PathPt[] {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return pathFrom(curve.getSpacedPoints(n));
}

const off = (q: PathPt, lat: number, up: number) => new THREE.Vector3(q.p.x + q.r.x * lat, q.p.y + up, q.p.z + q.r.z * lat);

/** One strip between two edge curves. u runs 0 → 1 from edge A to edge B, v 0 → 1 along the path. */
export function ribbon(path: PathPt[], fa: (q: PathPt) => THREE.Vector3, fb: (q: PathPt) => THREE.Vector3): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + path[i].p.distanceTo(path[i - 1].p));
  const total = lens[lens.length - 1] || 1;
  path.forEach((q, i) => {
    const a = fa(q);
    const c = fb(q);
    pos.push(a.x, a.y, a.z, c.x, c.y, c.z);
    uv.push(0, lens[i] / total, 1, lens[i] / total);
    if (i) {
      const k = (i - 1) * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

type Num = number | ((q: PathPt) => number);
const val = (n: Num, q: PathPt) => (typeof n === 'number' ? n : n(q));

/** A box cross-section swept along the path: lateral l0..l1, vertical v0..v1 (relative to the path). */
export function sweepBox(path: PathPt[], l0: number, l1: number, v0: Num, v1: Num, faces: { top?: boolean; bottom?: boolean } = {}): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  if (faces.top !== false) out.push(ribbon(path, (q) => off(q, l0, val(v1, q)), (q) => off(q, l1, val(v1, q))));
  if (faces.bottom) out.push(ribbon(path, (q) => off(q, l0, val(v0, q)), (q) => off(q, l1, val(v0, q))));
  out.push(ribbon(path, (q) => off(q, l0, val(v0, q)), (q) => off(q, l0, val(v1, q))));
  out.push(ribbon(path, (q) => off(q, l1, val(v0, q)), (q) => off(q, l1, val(v1, q))));
  return out;
}

/** The deck's top surface (for the road texture): lateral -half..half, `up` above the path. */
export function deckTop(path: PathPt[], half: number, up: number): THREE.BufferGeometry {
  return ribbon(path, (q) => off(q, -half, up), (q) => off(q, half, up));
}

/** Double-sided standard material, for swept strips whose winding isn't guaranteed. */
export function sweptMat(color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide });
}

/**
 * Bridge approach height: flat `h` over the span, easing (cosine) down to 0 at both abutments, so cars
 * and the cat get a smooth ramp instead of a kinked wedge.
 */
export function easedProfile(x: number, eBase: number, eSpan: number, wSpan: number, wBase: number, h: number): number {
  if (x >= eBase || x <= wBase) return 0;
  if (x > eSpan) return (h * (1 - Math.cos((Math.PI * (eBase - x)) / (eBase - eSpan)))) / 2;
  if (x < wSpan) return (h * (1 - Math.cos((Math.PI * (x - wBase)) / (wSpan - wBase)))) / 2;
  return h;
}
