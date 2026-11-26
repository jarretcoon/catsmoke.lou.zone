import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CarKind } from './props';

/*
 * Shaped traffic: sculpted car bodies, the Deuce double-decker and the chase vehicles.
 *
 * Every vehicle is a handful of meshes, one per material (paint, glass, bright trim, dark trim,
 * lamps), each a merged geometry that is cached per body type. Callers bake the plain-coloured
 * ones further (bakeGroup / bakeStatic), so a traffic car ends up as three draw calls:
 * shiny parts, matte parts and one lamp/plate mesh that samples a shared atlas.
 * Every geometry keeps exactly position / normal / uv so the static batcher can fold parked cars.
 */

// ---------------------------------------------------------------- materials
const matCache = new Map<string, THREE.Material>();
function std(color: number, roughness: number, metalness = 0): THREE.MeshStandardMaterial {
  const key = `v|${color}|${roughness}|${metalness}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    matCache.set(key, m);
  }
  return m;
}
const paintMat = (color: number) => std(color, 0.32, 0);
const GLASS = () => std(0x1a2330, 0.1, 0.8);
const BRIGHT = () => std(0xc9cdd4, 0.25, 0.85);
const TRIM = () => std(0x17181c, 0.85, 0);

// ---------------------------------------------------------------- lamp / sign atlas
type Rect = readonly [number, number, number, number]; // canvas px x0, y0, x1, y1
const ATLAS = 512;
const R = {
  head: [0, 0, 64, 32],
  tail: [64, 0, 128, 32],
  amber: [128, 0, 160, 32],
  brake: [160, 0, 224, 32],
  white: [224, 0, 256, 32],
  plate: [256, 0, 384, 64],
  taxi: [384, 0, 512, 64],
  dest: [0, 64, 512, 128],
  deuce: [0, 128, 512, 224],
  police: [0, 224, 512, 288],
  animal: [0, 288, 512, 352],
  rtc: [0, 352, 256, 416],
} as const satisfies Record<string, Rect>;

let atlasTex: THREE.CanvasTexture | null = null;
function atlas(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas');
  c.width = ATLAS;
  c.height = ATLAS;
  const ctx = c.getContext('2d')!;
  const fill = (r: Rect, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
  };
  const glow = (r: Rect, inner: string, outer: string) => {
    const cx = (r[0] + r[2]) / 2;
    const cy = (r[1] + r[3]) / 2;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(r[2] - r[0], r[3] - r[1]) * 0.6);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
  };
  const text = (r: Rect, s: string, col: string, font: string, dy = 0) => {
    ctx.fillStyle = col;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2 + dy, r[2] - r[0] - 8);
  };
  glow(R.head, '#ffffff', '#fff1c8');
  glow(R.tail, '#ff5a5a', '#c8101c');
  glow(R.amber, '#ffd27a', '#ff9418');
  glow(R.brake, '#ff4040', '#b00818');
  fill(R.white, '#f4f6ff');
  // Nevada plate: pale blue-grey sky, dark letters
  fill(R.plate, '#e9eef2');
  ctx.fillStyle = '#5b8ac2';
  ctx.fillRect(R.plate[0], R.plate[1] + 48, 128, 16);
  ctx.strokeStyle = '#33415a';
  ctx.lineWidth = 3;
  ctx.strokeRect(R.plate[0] + 2, R.plate[1] + 2, 124, 60);
  text(R.plate, 'LOU 777', '#1b2a52', 'bold 28px system-ui, sans-serif', -4);
  // Taxi roof topper
  fill(R.taxi, '#ffd21f');
  ctx.fillStyle = '#121212';
  ctx.fillRect(R.taxi[0], R.taxi[1] + 46, 128, 18);
  text(R.taxi, 'TAXI', '#121212', 'bold 40px system-ui, sans-serif', -8);
  // LED destination sign: amber dot-matrix on black
  fill(R.dest, '#07080a');
  text(R.dest, 'THE DEUCE  ⟶  ON THE STRIP', '#ffb21c', 'bold 40px "Courier New", monospace');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let x = R.dest[0]; x < R.dest[2]; x += 4) ctx.fillRect(x, R.dest[1], 1, 64);
  for (let y = R.dest[1]; y < R.dest[3]; y += 4) ctx.fillRect(R.dest[0], y, 512, 1);
  // Side branding (lit): gold script on black
  fill(R.deuce, '#101114');
  const gg = ctx.createLinearGradient(0, R.deuce[1], 0, R.deuce[3]);
  gg.addColorStop(0, '#fff0b0');
  gg.addColorStop(0.5, '#e5b54a');
  gg.addColorStop(1, '#9c6a1c');
  ctx.fillStyle = gg;
  ctx.font = 'italic bold 64px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('The Deuce', 22, R.deuce[1] + 44, 330);
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = '#f4f0e6';
  ctx.fillText('ON THE STRIP  •  24/7', 26, R.deuce[1] + 82, 320);
  ctx.fillStyle = '#c8202c';
  ctx.fillRect(380, R.deuce[1] + 14, 112, 68);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RTC', 436, R.deuce[1] + 50, 100);
  // Door decals
  fill(R.police, '#f4f4f2');
  ctx.fillStyle = '#c9a23a';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? 11 : 26;
    ctx.lineTo(48 + Math.cos(a) * rr, R.police[1] + 32 + Math.sin(a) * rr);
  }
  ctx.fill();
  text([96, R.police[1], 512, R.police[3]] as Rect, 'METRO POLICE', '#14213d', 'bold 46px system-ui, sans-serif', 2);
  fill(R.animal, '#f2f2ee');
  ctx.fillStyle = '#2d5a2d';
  ctx.fillRect(0, R.animal[1] + 52, 512, 12);
  text(R.animal, 'ANIMAL CONTROL', '#2d5a2d', 'bold 44px system-ui, sans-serif', -4);
  fill(R.rtc, '#101114');
  text(R.rtc, 'DEUCE', '#e5b54a', 'italic bold 44px Georgia, serif');
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 4;
  return atlasTex;
}
let lampMatShared: THREE.MeshBasicMaterial | null = null;
/** Unlit atlas material: head/tail lamps, plates, the taxi topper, the Deuce's LED sign. */
function lampMat(): THREE.MeshBasicMaterial {
  return (lampMatShared ??= new THREE.MeshBasicMaterial({ map: atlas() }));
}
let decalMatShared: THREE.MeshStandardMaterial | null = null;
/** Lit atlas material: painted-on livery (door decals, the Deuce side logo). */
function decalMat(): THREE.MeshStandardMaterial {
  return (decalMatShared ??= new THREE.MeshStandardMaterial({ map: atlas(), roughness: 0.4 }));
}

// ---------------------------------------------------------------- geometry helpers
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

/** Strip to position/normal/uv (adding a dummy uv if missing) and drop the index. */
function norm(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  out.clearGroups();
  return out;
}

/** Collects transformed part geometries per material, then merges each list into one mesh. */
class Parts {
  readonly lists = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(m: THREE.Material, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
    const g = norm(geo.clone());
    tmpM.compose(V(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), V(sx, sy, sz));
    g.applyMatrix4(tmpM);
    this.raw(m, g);
  }
  raw(m: THREE.Material, g: THREE.BufferGeometry): void {
    let l = this.lists.get(m);
    if (!l) this.lists.set(m, (l = []));
    l.push(norm(g));
  }
  merged(): Array<[THREE.Material, THREE.BufferGeometry]> {
    const out: Array<[THREE.Material, THREE.BufferGeometry]> = [];
    for (const [m, l] of this.lists) {
      const g = l.length === 1 ? l[0] : mergeGeometries(l, false);
      if (!g) continue;
      g.computeBoundingSphere();
      out.push([m, g]);
    }
    return out;
  }
}

function addMeshes(group: THREE.Group, list: Array<[THREE.Material, THREE.BufferGeometry]>, cast = true): void {
  for (const [m, g] of list) {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast && !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial && !m.transparent;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

/** Flat polygon (any winding) facing `n`; uv = planar coords. */
function planar(pts: THREE.Vector3[], n: THREE.Vector3): THREE.BufferGeometry {
  const nn = n.clone().normalize();
  const t = Math.abs(nn.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(t, nn).normalize();
  const v = new THREE.Vector3().crossVectors(nn, u);
  const c2 = pts.map((p) => new THREE.Vector2(p.dot(u), p.dot(v)));
  const faces = THREE.ShapeUtils.triangulateShape(c2, []);
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (const f of faces) {
    let [a, b, c] = f;
    e1.subVectors(pts[b], pts[a]);
    e2.subVectors(pts[c], pts[a]);
    if (e1.cross(e2).dot(nn) < 0) [b, c] = [c, b];
    for (const i of [a, b, c]) {
      pos.push(pts[i].x, pts[i].y, pts[i].z);
      nor.push(nn.x, nn.y, nn.z);
      uvs.push(c2[i].x, c2[i].y);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/** Atlas quad: centre, half-extent "right" and "up" vectors as seen by the viewer (normal = right × up). */
function aquad(c: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, r: Rect, inset = 1): THREE.BufferGeometry {
  const u0 = (r[0] + inset) / ATLAS;
  const u1 = (r[2] - inset) / ATLAS;
  const v1 = 1 - (r[1] + inset) / ATLAS;
  const v0 = 1 - (r[3] - inset) / ATLAS;
  const bl = c.clone().sub(right).sub(up);
  const br = c.clone().add(right).sub(up);
  const tr = c.clone().add(right).add(up);
  const tl = c.clone().sub(right).add(up);
  const n = new THREE.Vector3().crossVectors(right, up).normalize();
  const pos = [bl, br, tr, bl, tr, tl].flatMap((p) => [p.x, p.y, p.z]);
  const uv = [u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 2, 3, 4, 5].flatMap(() => [n.x, n.y, n.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// Facing helpers for aquad (half sizes w, h)
const FRONT = (w: number, h: number): [THREE.Vector3, THREE.Vector3] => [V(w, 0, 0), V(0, h, 0)];
const BACK = (w: number, h: number): [THREE.Vector3, THREE.Vector3] => [V(-w, 0, 0), V(0, h, 0)];
const SIDE = (s: number, w: number, h: number): [THREE.Vector3, THREE.Vector3] => [V(0, 0, -s * w), V(0, h, 0)];

/** Side-profile extrusion: shape x = car z, shape y = height; extruded across the car's width. */
function extrudeSide(shape: THREE.Shape, width: number, bevel: number, segs = 1, curveSegs = 3): THREE.BufferGeometry {
  const depth = Math.max(0.01, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: curveSegs, steps: 1 });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  return g;
}
const smooth = (g: THREE.BufferGeometry) => toCreasedNormals(g, 0.72);

/** Tyre (rounded section) + rim disc, axle along x, centred at the origin. */
function tyreGeo(r: number, w: number, seg = 12): THREE.BufferGeometry {
  const hw = w / 2;
  const pts = [V(r * 0.6, -hw, 0), V(r - 0.02, -hw, 0), V(r, -hw + 0.05, 0), V(r, hw - 0.05, 0), V(r - 0.02, hw, 0), V(r * 0.6, hw, 0)].map((p) => new THREE.Vector2(p.x, p.y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateZ(Math.PI / 2);
  return g;
}
function rimGeo(r: number, w: number, seg = 12): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r * 0.92, w, seg);
  g.rotateZ(Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------- car bodies
interface Spec {
  L: number;
  W: number;
  clear: number; // underside height
  nose: number; // top of the front face
  belt: number; // beltline (hood at the windshield, door tops)
  deck: number; // trunk lid height at the rear
  roof: number;
  ws0: number; // windshield base z
  ws1: number; // windshield top z
  rw1: number; // rear window top z
  rw0: number; // rear window base z
  wr: number; // wheel radius
  wf: number; // front axle z
  wb: number; // rear axle z
  tumble: number; // cabin inset per side
  posts: number[]; // window split positions (B / C / limo pillars)
  taper: number; // cabin narrows toward the roof
}

const SPECS: Record<CarKind | 'van' | 'cop', Spec> = {
  sedan: { L: 4.7, W: 1.85, clear: 0.3, nose: 0.8, belt: 0.98, deck: 1.0, roof: 1.46, ws0: 0.98, ws1: 0.2, rw1: -0.85, rw0: -1.42, wr: 0.34, wf: 1.45, wb: -1.42, tumble: 0.07, posts: [-0.3], taper: 0.13 },
  cop: { L: 4.9, W: 1.9, clear: 0.3, nose: 0.82, belt: 1.0, deck: 1.02, roof: 1.48, ws0: 1.0, ws1: 0.22, rw1: -0.88, rw0: -1.45, wr: 0.35, wf: 1.5, wb: -1.5, tumble: 0.07, posts: [-0.3], taper: 0.13 },
  taxi: { L: 4.75, W: 1.85, clear: 0.3, nose: 0.82, belt: 1.0, deck: 1.02, roof: 1.5, ws0: 0.98, ws1: 0.2, rw1: -0.9, rw0: -1.45, wr: 0.34, wf: 1.45, wb: -1.45, tumble: 0.07, posts: [-0.32], taper: 0.13 },
  limo: { L: 7.6, W: 1.92, clear: 0.3, nose: 0.82, belt: 1.0, deck: 1.02, roof: 1.48, ws0: 2.45, ws1: 1.72, rw1: -2.4, rw0: -2.95, wr: 0.35, wf: 2.9, wb: -2.85, tumble: 0.07, posts: [1.05, -0.35, -1.75], taper: 0.12 },
  suv: { L: 5.0, W: 2.0, clear: 0.4, nose: 1.06, belt: 1.18, deck: 1.18, roof: 1.88, ws0: 1.12, ws1: 0.52, rw1: -2.3, rw0: -2.38, wr: 0.4, wf: 1.62, wb: -1.58, tumble: 0.06, posts: [-0.25, -1.55], taper: 0.08 },
  sport: { L: 4.45, W: 1.92, clear: 0.24, nose: 0.6, belt: 0.84, deck: 0.86, roof: 1.2, ws0: 0.55, ws1: -0.3, rw1: -0.72, rw0: -1.72, wr: 0.34, wf: 1.42, wb: -1.36, tumble: 0.1, posts: [-0.62], taper: 0.16 },
  van: { L: 5.6, W: 2.05, clear: 0.42, nose: 1.08, belt: 1.2, deck: 1.2, roof: 2.0, ws0: 1.75, ws1: 1.25, rw1: 0.6, rw0: 0.6, wr: 0.4, wf: 1.95, wb: -1.85, tumble: 0.06, posts: [], taper: 0.06 },
};

const lerp = THREE.MathUtils.lerp;

function bodyShape(s: Spec): THREE.Shape {
  const fz = s.L / 2;
  const rz = -s.L / 2;
  const sh = new THREE.Shape();
  sh.moveTo(fz - 0.2, s.clear);
  sh.quadraticCurveTo(fz + 0.02, s.clear, fz + 0.02, s.clear + 0.18);
  sh.lineTo(fz, s.nose - 0.12);
  sh.quadraticCurveTo(fz - 0.02, s.nose, fz - 0.24, s.nose + 0.01);
  sh.quadraticCurveTo(lerp(fz, s.ws0, 0.55), s.belt + 0.02, s.ws0, s.belt);
  sh.lineTo(s.rw0, s.belt);
  if (s.rw0 > rz + 0.32) sh.lineTo(rz + 0.26, s.deck);
  sh.quadraticCurveTo(rz, s.deck, rz - 0.01, s.deck - 0.18);
  sh.lineTo(rz - 0.02, s.clear + 0.16);
  sh.quadraticCurveTo(rz - 0.02, s.clear, rz + 0.2, s.clear);
  const arch = (cz: number) => {
    const ra = s.wr + 0.07;
    sh.lineTo(cz - ra, s.clear);
    sh.lineTo(cz - ra, Math.max(s.clear, s.wr));
    for (let i = 1; i <= 7; i++) {
      const a = Math.PI - (i / 7) * Math.PI;
      sh.lineTo(cz + Math.cos(a) * ra, s.wr + Math.sin(a) * ra);
    }
    sh.lineTo(cz + ra, s.clear);
  };
  arch(s.wb);
  arch(s.wf);
  sh.closePath();
  return sh;
}

function cabinShape(s: Spec): THREE.Shape {
  const sh = new THREE.Shape();
  const b = s.belt - 0.04;
  sh.moveTo(s.ws0 + 0.04, b);
  sh.lineTo(lerp(s.ws0, s.ws1, 0.82), lerp(s.belt, s.roof, 0.82));
  sh.quadraticCurveTo(s.ws1, s.roof, s.ws1 - 0.2, s.roof);
  sh.lineTo(s.rw1 + 0.16, s.roof);
  if (s.rw1 - s.rw0 > 0.2) {
    sh.quadraticCurveTo(s.rw1, s.roof, lerp(s.rw1, s.rw0, 0.18), lerp(s.roof, s.belt, 0.18));
  } else {
    sh.quadraticCurveTo(s.rw1 - 0.02, s.roof, s.rw1 - 0.04, s.roof - 0.16);
  }
  sh.lineTo(s.rw0 - 0.04, b);
  sh.closePath();
  return sh;
}

/** x half-width of the tapered cabin side at height y. */
function cabinHalf(s: Spec, y: number): number {
  const k = THREE.MathUtils.clamp((y - s.belt) / (s.roof - s.belt), 0, 1);
  return (s.W / 2 - s.tumble) * (1 - s.taper * k);
}

interface CarGeo {
  paint: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  bright: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  lamps: THREE.BufferGeometry;
  /** Optional extra panels in a second paint colour (cop doors). */
  paint2?: THREE.BufferGeometry;
  decal?: THREE.BufferGeometry;
}

/** Shared body for every car type: body shell, cabin, glass, wheels, lamps, bumpers, mirrors. */
function buildBody(s: Spec, kind: CarKind | 'van' | 'cop'): Parts {
  const p = new Parts();
  const paint = paintMat(0xffffff); // placeholder key, swapped per car
  const glass = GLASS();
  const bright = BRIGHT();
  const trim = TRIM();
  const lamps = lampMat();
  const fz = s.L / 2;
  const rz = -s.L / 2;
  const hw = s.W / 2;

  // Body shell (with real wheel arches) and the cabin (tapered for tumblehome)
  p.raw(paint, smooth(extrudeSide(bodyShape(s), s.W, 0.07)));
  if (kind !== 'van') {
    const cab = extrudeSide(cabinShape(s), s.W - 2 * s.tumble, 0.07);
    const pos = cab.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = THREE.MathUtils.clamp((y - s.belt) / (s.roof - s.belt), 0, 1);
      pos.setX(i, pos.getX(i) * (1 - s.taper * k));
    }
    p.raw(paint, smooth(cab));
  } else {
    // Van: short cab greenhouse, upright back wall (the box hides it)
    const cab = extrudeSide(cabinShape(s), s.W - 2 * s.tumble, 0.08);
    p.raw(paint, smooth(cab));
  }

  // ---- glass: windshield, rear window, side windows split at the pillars
  const yb = s.belt + 0.05;
  const yt = s.roof - 0.09;
  const wsZ = (y: number) => lerp(s.ws0, s.ws1, (y - s.belt) / (s.roof - s.belt));
  const rwZ = (y: number) => lerp(s.rw0, s.rw1, (y - s.belt) / (s.roof - s.belt));
  {
    const n = V(0, s.ws0 - s.ws1, s.roof - s.belt).normalize();
    const off = n.clone().multiplyScalar(0.012);
    const y0 = s.belt + 0.03;
    const y1 = s.roof - 0.1;
    const pts = [V(-(cabinHalf(s, y0) - 0.05), y0, wsZ(y0)), V(cabinHalf(s, y0) - 0.05, y0, wsZ(y0)), V(cabinHalf(s, y1) - 0.1, y1, wsZ(y1)), V(-(cabinHalf(s, y1) - 0.1), y1, wsZ(y1))].map((q) => q.add(off));
    p.raw(glass, planar(pts, n));
    if (s.rw1 - s.rw0 > 0.05 || kind === 'suv') {
      const nr = V(0, s.rw1 - s.rw0, -(s.roof - s.belt)).normalize();
      const offr = nr.clone().multiplyScalar(0.012);
      const ry0 = kind === 'suv' ? s.belt + 0.1 : s.belt + 0.04;
      const ptsR = [V(-(cabinHalf(s, ry0) - 0.08), ry0, rwZ(ry0)), V(cabinHalf(s, ry0) - 0.08, ry0, rwZ(ry0)), V(cabinHalf(s, y1) - 0.12, y1, rwZ(y1)), V(-(cabinHalf(s, y1) - 0.12), y1, rwZ(y1))].map((q) => q.add(offr));
      p.raw(glass, planar(ptsR, nr));
    }
  }
  const frontEdge = (y: number) => wsZ(y) - 0.11;
  const rearEdge = (y: number) => (kind === 'van' ? s.rw0 + 0.12 : rwZ(y) + 0.11);
  const cuts = [-Infinity, ...s.posts, Infinity];
  for (const side of [-1, 1]) {
    const nx = V(side, 0, 0);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i] + (i === 0 ? 0 : 0.07);
      const b = cuts[i + 1] - (i === cuts.length - 2 ? 0 : 0.07);
      const zb0 = Math.max(a, rearEdge(yb));
      const zt0 = Math.max(a, rearEdge(yt));
      const zb1 = Math.min(b, frontEdge(yb));
      const zt1 = Math.min(b, frontEdge(yt));
      if (zb1 - zb0 < 0.15 || zt1 - zt0 < 0.1) continue;
      const x = (y: number) => side * (cabinHalf(s, y) + 0.006);
      const pts = [V(x(yb), yb, zb0), V(x(yb), yb, zb1), V(x(yt), yt, zt1), V(x(yt), yt, zt0)];
      const n = V(side, (cabinHalf(s, yb) - cabinHalf(s, yt)) / (yt - yb), 0).normalize();
      void nx;
      p.raw(glass, planar(pts, n));
    }
  }

  // ---- wheels (static: traffic never spins them)
  const tyre = tyreGeo(s.wr, 0.24, 10);
  const rimR = new THREE.CircleGeometry(s.wr * 0.62, 10).rotateY(Math.PI / 2);
  const rimL = new THREE.CircleGeometry(s.wr * 0.62, 10).rotateY(-Math.PI / 2);
  const hubR = new THREE.CircleGeometry(s.wr * 0.2, 6).rotateY(Math.PI / 2);
  const hubL = new THREE.CircleGeometry(s.wr * 0.2, 6).rotateY(-Math.PI / 2);
  for (const wz of [s.wf, s.wb]) {
    for (const side of [-1, 1]) {
      const wx = side * (hw - 0.14);
      p.add(trim, tyre, wx, s.wr, wz);
      p.add(bright, side > 0 ? rimR : rimL, wx + side * 0.09, s.wr, wz);
      p.add(trim, side > 0 ? hubR : hubL, wx + side * 0.1, s.wr, wz);
    }
  }

  // ---- bumpers, grille, sills, mirrors, handles
  const bumperH = 0.2;
  const bump = new RoundedBoxGeometry(s.W - 0.04, bumperH, 0.24, 1, 0.08);
  const sportish = kind === 'sport';
  p.add(kind === 'suv' || kind === 'van' ? trim : paint, bump, 0, s.clear + 0.1, fz - 0.06);
  p.add(kind === 'suv' || kind === 'van' ? trim : paint, bump, 0, s.clear + 0.1, rz + 0.06);
  // lower intake / diffuser
  p.add(trim, new THREE.BoxGeometry(s.W * 0.62, 0.08, 0.1), 0, s.clear + 0.05, fz + 0.04);
  p.add(trim, new THREE.BoxGeometry(s.W * 0.7, 0.07, 0.1), 0, s.clear + 0.04, rz - 0.04);
  // grille between the headlights
  const gy = s.nose - (sportish ? 0.2 : 0.24);
  const grilleW = sportish ? s.W * 0.42 : kind === 'suv' || kind === 'van' ? s.W * 0.5 : s.W * 0.4;
  p.add(trim, new THREE.BoxGeometry(grilleW, sportish ? 0.08 : 0.16, 0.06), 0, gy, fz + 0.012);
  if (!sportish) p.add(bright, new THREE.BoxGeometry(grilleW + 0.04, 0.025, 0.07), 0, gy + (kind === 'suv' || kind === 'van' ? 0.09 : 0.08), fz + 0.012);
  // dark sills between the arches
  p.add(trim, new THREE.BoxGeometry(0.05, 0.06, s.wf - s.wb - 2 * (s.wr + 0.08)), -hw + 0.02, s.clear + 0.03, (s.wf + s.wb) / 2);
  p.add(trim, new THREE.BoxGeometry(0.05, 0.06, s.wf - s.wb - 2 * (s.wr + 0.08)), hw - 0.02, s.clear + 0.03, (s.wf + s.wb) / 2);
  // mirrors at the A-pillar base
  const mir = new THREE.BoxGeometry(0.08, 0.11, 0.17);
  for (const side of [-1, 1]) {
    p.add(paint, mir, side * (hw + 0.07), s.belt + 0.08, s.ws0 - 0.12);
    p.add(trim, new THREE.BoxGeometry(0.1, 0.03, 0.05), side * (hw + 0.01), s.belt + 0.05, s.ws0 - 0.12);
  }
  // door shut lines + handles
  const doorLines = kind === 'van' ? [s.rw0 + 0.05, s.ws0 - 0.1] : kind === 'limo' ? [s.ws0 - 0.12, s.posts[0], s.posts[2], s.rw0 + 0.3] : kind === 'sport' ? [s.ws0 - 0.1, s.posts[0] - 0.05] : [s.ws0 - 0.12, s.posts[0] ?? 0, s.rw0 + 0.3];
  for (const side of [-1, 1]) {
    for (const z of doorLines) p.add(trim, new THREE.BoxGeometry(0.012, s.belt - s.clear - 0.2, 0.018), side * (hw + 0.002), (s.belt + s.clear) / 2 + 0.04, z);
  }

  // ---- lamps + plates (one atlas mesh)
  const hlY = s.nose - 0.15;
  const hlW = sportish ? 0.2 : 0.17;
  for (const side of [-1, 1]) {
    const hx = side * (hw - 0.3);
    p.raw(lamps, aquad(V(hx, hlY, fz + 0.018), ...FRONT(hlW, sportish ? 0.045 : 0.06), R.head));
    p.raw(lamps, aquad(V(side * (hw + 0.004), hlY - 0.02, fz - 0.24), ...SIDE(side, 0.07, 0.035), R.amber));
    const tlY = s.deck - 0.16;
    p.raw(lamps, aquad(V(side * (hw - 0.27), tlY, rz - 0.032), ...BACK(sportish ? 0.24 : 0.2, 0.06), R.tail));
    p.raw(lamps, aquad(V(side * (hw + 0.004), tlY, rz + 0.24), ...SIDE(side, 0.07, 0.045), R.tail));
    // lamp housings (dark lens rims), remain when parked cars drop their lamps
    p.add(trim, new THREE.BoxGeometry(hlW * 2 + 0.05, (sportish ? 0.09 : 0.12) + 0.04, 0.03), hx, hlY, fz - 0.005);
    p.add(trim, new THREE.BoxGeometry((sportish ? 0.48 : 0.4) + 0.04, 0.16, 0.03), side * (hw - 0.27), tlY, rz - 0.003);
  }
  p.raw(lamps, aquad(V(0, s.clear + 0.34, rz - 0.035), ...BACK(0.15, 0.075), R.plate));
  p.raw(lamps, aquad(V(0, s.clear + 0.1, fz + 0.075), ...FRONT(0.15, 0.075), R.plate));
  if (kind !== 'suv' && kind !== 'van') p.raw(lamps, aquad(V(0, s.roof - 0.06, rwZ(s.roof - 0.06) - 0.02), ...BACK(0.18, 0.018), R.brake));
  return p;
}

const carGeoCache = new Map<string, CarGeo>();

function geoFor(kind: CarKind | 'van' | 'cop'): CarGeo {
  const cached = carGeoCache.get(kind);
  if (cached) return cached;
  const s = SPECS[kind];
  const p = buildBody(s, kind);
  const extra = new Parts();
  const paint = paintMat(0xffffff);
  const trim = TRIM();
  const bright = BRIGHT();
  const lamps = lampMat();
  const fz = s.L / 2;
  const hw = s.W / 2;
  if (kind === 'taxi') {
    // Vegas cab: roof-top ad box and a checker stripe
    p.add(trim, new RoundedBoxGeometry(0.98, 0.06, 0.34, 1, 0.025), 0, s.roof + 0.03, -0.32);
    p.add(trim, new THREE.BoxGeometry(1.0, 0.32, 0.26), 0, s.roof + 0.22, -0.32);
    for (const side of [-1, 1]) p.raw(lamps, aquad(V(0, s.roof + 0.22, -0.32 + side * 0.132), ...(side > 0 ? FRONT(0.48, 0.15) : BACK(0.48, 0.15)), R.taxi));
    for (const side of [-1, 1]) {
      for (let i = 0; i < 16; i++) {
        const z = -1.5 + i * 0.19;
        p.add(trim, new THREE.BoxGeometry(0.012, 0.045, 0.095), side * (hw + 0.003), s.belt - 0.2 + (i % 2) * 0.045, z);
      }
    }
  } else if (kind === 'limo') {
    // chrome belt trim along the stretch
    for (const side of [-1, 1]) p.add(bright, new THREE.BoxGeometry(0.015, 0.025, s.L * 0.8), side * (hw + 0.004), s.belt - 0.06, -0.1);
  } else if (kind === 'suv') {
    // roof rails, black arch flares, a rear spoiler lip
    for (const side of [-1, 1]) {
      p.add(trim, new RoundedBoxGeometry(0.06, 0.06, 2.6, 1, 0.025), side * (cabinHalf(s, s.roof) - 0.12), s.roof + 0.05, -0.85);
      for (const wz of [s.wf, s.wb]) {
        const ring = new THREE.RingGeometry(s.wr + 0.06, s.wr + 0.15, 12, 1, 0, Math.PI);
        ring.rotateY((side * Math.PI) / 2);
        p.add(trim, ring, side * (hw + 0.004), s.wr, wz);
      }
    }
    p.add(trim, new RoundedBoxGeometry(s.W - 0.4, 0.05, 0.2, 1, 0.02), 0, s.roof - 0.02, s.rw1 - 0.08);
  } else if (kind === 'sport') {
    // rear wing, side intakes, quad exhaust
    for (const side of [-1, 1]) {
      p.add(trim, new THREE.BoxGeometry(0.06, 0.16, 0.06), side * 0.6, s.deck + 0.08, -s.L / 2 + 0.25);
      p.add(trim, new THREE.BoxGeometry(0.02, 0.12, 0.5), side * (hw + 0.003), s.clear + 0.3, -0.75);
      p.add(bright, new THREE.CylinderGeometry(0.04, 0.04, 0.08, 10), side * 0.42, s.clear + 0.06, -s.L / 2 - 0.02, Math.PI / 2);
    }
    p.add(paint, new RoundedBoxGeometry(1.5, 0.05, 0.3, 1, 0.02), 0, s.deck + 0.17, -s.L / 2 + 0.26);
  } else if (kind === 'cop') {
    // push bar, light-bar base, spotlight; white door panels (paint2) and METRO POLICE decals
    p.add(trim, new THREE.BoxGeometry(1.0, 0.07, 0.07), 0, s.clear + 0.42, fz + 0.2);
    for (const side of [-1, 1]) p.add(trim, new THREE.BoxGeometry(0.07, 0.45, 0.07), side * 0.38, s.clear + 0.22, fz + 0.2);
    p.add(trim, new RoundedBoxGeometry(1.4, 0.08, 0.34, 1, 0.03), 0, s.roof + 0.04, -0.2);
    p.add(bright, new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10), -(cabinHalf(s, s.belt + 0.1) + 0.06), s.belt + 0.14, s.ws0 - 0.18, 0, 0, Math.PI / 2);
    const z0 = s.rw0 + 0.3;
    const z1 = s.ws0 - 0.12;
    const y0 = s.clear + 0.18;
    const y1 = s.belt - 0.06;
    for (const side of [-1, 1]) {
      const x = side * (hw + 0.004);
      extra.raw(paint, planar([V(x, y0, z0), V(x, y0, z1), V(x, y1, z1), V(x, y1, z0)], V(side, 0, 0)));
      p.raw(decalMat(), aquad(V(side * (hw + 0.009), lerp(y0, y1, 0.55), (z0 + z1) / 2), ...SIDE(side, (z1 - z0) / 2 - 0.12, 0.13), R.police));
    }
    // white roof
    extra.add(paint, new RoundedBoxGeometry(cabinHalf(s, s.roof) * 2 - 0.1, 0.02, s.ws1 - s.rw1 - 0.1, 1, 0.01), 0, s.roof + 0.003, (s.ws1 + s.rw1) / 2);
  } else if (kind === 'van') {
    // Box body behind the cab, compartment doors with vents, ANIMAL CONTROL decals, light-bar base
    const bz0 = -s.L / 2 + 0.02;
    const bz1 = s.rw0 - 0.02;
    const bl = bz1 - bz0;
    p.add(paint, new RoundedBoxGeometry(s.W + 0.06, 1.62, bl, 2, 0.06), 0, 1.62, (bz0 + bz1) / 2);
    p.add(trim, new RoundedBoxGeometry(s.W + 0.1, 0.06, bl + 0.04, 1, 0.025), 0, 0.82, (bz0 + bz1) / 2);
    for (const side of [-1, 1]) {
      const x = side * (hw + 0.035);
      for (let i = 0; i < 3; i++) {
        const cz = bz0 + 0.55 + i * ((bl - 1.1) / 2);
        for (const [dz, dy, w, h] of [[0, 1.98, 0.92, 0.012], [0, 1.0, 0.92, 0.012], [-0.46, 1.49, 0.012, 1.0], [0.46, 1.49, 0.012, 1.0]] as const) {
          p.add(trim, new THREE.BoxGeometry(0.012, h, w || 0.012), x, dy, cz + dz);
        }
        for (let v = 0; v < 4; v++) p.add(trim, new THREE.BoxGeometry(0.014, 0.025, 0.36), x, 1.82 - v * 0.06, cz);
        p.add(bright, new THREE.BoxGeometry(0.025, 0.04, 0.12), x + side * 0.01, 1.3, cz + 0.32);
      }
      p.raw(decalMat(), aquad(V(side * (hw + 0.045), 1.45, (bz0 + bz1) / 2), ...SIDE(side, bl / 2 - 0.25, 0.16), R.animal));
    }
    p.add(trim, new RoundedBoxGeometry(1.4, 0.08, 0.34, 1, 0.03), 0, s.roof + 0.04, (s.ws1 + s.rw1) / 2);
    p.raw(lamps, aquad(V(0, 2.25, bz0 - 0.03), ...BACK(0.5, 0.08), R.animal));
  }
  const parts = new Map(p.merged());
  const ex = new Map(extra.merged());
  const geo: CarGeo = {
    paint: parts.get(paint)!,
    glass: parts.get(GLASS())!,
    bright: parts.get(bright)!,
    trim: parts.get(trim)!,
    lamps: parts.get(lamps)!,
    paint2: ex.get(paint),
    decal: parts.get(decalMat()),
  };
  carGeoCache.set(kind, geo);
  return geo;
}

function assemble(kind: CarKind | 'van' | 'cop', color: number, color2?: number): THREE.Group {
  const g = geoFor(kind);
  const group = new THREE.Group();
  const list: Array<[THREE.Material, THREE.BufferGeometry]> = [
    [paintMat(color), g.paint],
    [GLASS(), g.glass],
    [BRIGHT(), g.bright],
    [TRIM(), g.trim],
    [lampMat(), g.lamps],
  ];
  if (g.paint2 && color2 !== undefined) list.push([paintMat(color2), g.paint2]);
  if (g.decal) list.push([decalMat(), g.decal]);
  addMeshes(group, list);
  return group;
}

/** A traffic / parked car. Faces +z; wheels sit on y = 0. */
export function buildCar(kind: CarKind, color: number): { group: THREE.Group; length: number } {
  return { group: assemble(kind, color), length: SPECS[kind].L };
}

/** Metro cruiser (black & white, light bar) or the Animal Control truck; `lights` flash red / blue. */
export function buildChaseVehicle(kind: 'van' | 'cop'): { group: THREE.Group; lights: THREE.MeshBasicMaterial[] } {
  const s = SPECS[kind];
  const g = kind === 'cop' ? assemble('cop', 0x111318, 0xf4f4f2) : assemble('van', 0xf2f2f0);
  const lightA = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  const lightB = new THREE.MeshBasicMaterial({ color: 0x2050ff });
  const z = kind === 'cop' ? -0.2 : (s.ws1 + s.rw1) / 2;
  const bar = new RoundedBoxGeometry(0.62, 0.13, 0.28, 1, 0.04);
  for (const [m, x] of [[lightA, -0.34], [lightB, 0.34]] as const) {
    const mesh = new THREE.Mesh(bar, m);
    mesh.position.set(x, s.roof + 0.14, z);
    g.add(mesh);
  }
  return { group: g, lights: [lightA, lightB] };
}

// ---------------------------------------------------------------- the Deuce
let deuceCache: { lists: Array<[THREE.Material, THREE.BufferGeometry]>; axle: THREE.BufferGeometry; key: string } | null = null;
let wheelMat: THREE.MeshStandardMaterial | null = null;

function colored(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const out = norm(g);
  const c = new THREE.Color(hex);
  const n = out.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return out;
}

/** One axle (both wheels) as a single vertex-coloured mesh so a spinning axle is one draw call. */
function axleGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const x = side * 1.08;
    const t = tyreGeo(0.5, 0.3, 14);
    t.translate(x, 0, 0);
    parts.push(colored(t, 0x141518));
    const rim = rimGeo(0.3, 0.26, 12);
    rim.translate(x + side * 0.03, 0, 0);
    parts.push(colored(rim, 0xc9ccd2));
    const hub = rimGeo(0.11, 0.3, 8);
    hub.translate(x + side * 0.04, 0, 0);
    parts.push(colored(hub, 0x2a2c31));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const nut = new THREE.BoxGeometry(0.04, 0.05, 0.05);
      nut.translate(x + side * 0.165, Math.cos(a) * 0.19, Math.sin(a) * 0.19);
      parts.push(colored(nut, 0x55585e));
    }
  }
  return mergeGeometries(parts, false)!;
}

export function buildDeuceBus(livery: { body: number; band: number; accent: number }): { group: THREE.Group; wheels: THREE.Mesh[]; deckOffset: THREE.Vector3 } {
  const key = `${livery.body}|${livery.band}|${livery.accent}`;
  if (!deuceCache || deuceCache.key !== key) deuceCache = { key, ...buildDeuceGeo(livery) };
  const g = new THREE.Group();
  addMeshes(g, deuceCache.lists);
  const wheels: THREE.Mesh[] = [];
  wheelMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  for (const wz of [4.2, -3.1, -4.6]) {
    const w = new THREE.Mesh(deuceCache.axle, wheelMat);
    w.position.set(0, 0.5, wz);
    w.castShadow = true;
    w.userData.keep = true;
    g.add(w);
    wheels.push(w);
  }
  // Lou rides at the front of the upper deck, the best seat on the Strip.
  return { group: g, wheels, deckOffset: new THREE.Vector3(0, 2.56, 5.6) };
}

function buildDeuceGeo(livery: { body: number; band: number; accent: number }): { lists: Array<[THREE.Material, THREE.BufferGeometry]>; axle: THREE.BufferGeometry } {
  const p = new Parts();
  const body = std(livery.body, 0.3, 0);
  const band = std(livery.band, 0.45, 0);
  const accent = std(livery.accent, 0.4, 0);
  const trim = TRIM();
  const bright = BRIGHT();
  const seatMat = std(0x1c458c, 0.8, 0);
  const floorMat = std(0x3a3d44, 0.85, 0);
  const lamps = lampMat();
  const decal = decalMat();
  const glass = new THREE.MeshStandardMaterial({ color: 0x24384c, roughness: 0.06, metalness: 0.5, transparent: true, opacity: 0.42, depthWrite: false });
  const W = 2.55;
  const hw = W / 2;
  const F = 6.3;
  const lowY0 = 1.3;
  const lowY1 = 2.1;
  const upY0 = 2.5;
  const upY1 = 3.74;

  // ---- lower skirt with the wheel arches (front axle 4.2, tandem rear -3.1 / -4.6)
  const sk = new THREE.Shape();
  sk.moveTo(F - 0.25, 0.3);
  sk.quadraticCurveTo(F + 0.02, 0.3, F + 0.02, 0.55);
  sk.lineTo(F, lowY0);
  sk.lineTo(-F, lowY0);
  sk.lineTo(-F - 0.02, 0.5);
  sk.quadraticCurveTo(-F - 0.02, 0.3, -F + 0.25, 0.3);
  const arc = (cz: number, a0: number, a1: number, r = 0.6) => {
    for (let i = 0; i <= 8; i++) {
      const a = lerp(a0, a1, i / 8);
      sk.lineTo(cz + Math.cos(a) * r, 0.5 + Math.sin(a) * r);
    }
  };
  sk.lineTo(-5.2, 0.3);
  arc(-4.6, Math.PI, Math.PI / 2);
  arc(-3.1, Math.PI / 2, 0);
  sk.lineTo(-2.5, 0.3);
  sk.lineTo(3.6, 0.3);
  arc(4.2, Math.PI, 0);
  sk.lineTo(4.8, 0.3);
  sk.closePath();
  p.raw(body, smooth(extrudeSide(sk, W, 0.08, 2, 4)));
  // accent stripe + black skirt foot
  for (const side of [-1, 1]) {
    p.add(accent, new THREE.BoxGeometry(0.02, 0.07, 1.1), side * (hw + 0.003), 0.45, 5.45);
    p.add(accent, new THREE.BoxGeometry(0.02, 0.07, 6.0), side * (hw + 0.003), 0.45, 0.65);
    p.add(accent, new THREE.BoxGeometry(0.02, 0.07, 0.6), side * (hw + 0.003), 0.45, -5.75);
  }

  // ---- window bands: black pillars, glass, interior
  const pillar = (x: number, y0: number, y1: number, z: number, w = 0.12) => p.add(band, new THREE.BoxGeometry(0.07, y1 - y0, w), x, (y0 + y1) / 2, z);
  for (const side of [-1, 1]) {
    const x = side * (hw - 0.045);
    // lower deck: glass from behind the front door to the engine bay
    for (let z = -5.15; z <= 4.75; z += 1.65) pillar(x, lowY0, lowY1, z);
    // upper deck
    for (let z = -5.55; z <= 5.7; z += 1.4) pillar(x, upY0, upY1, z);
    // rear engine-bay panel (no lower window there)
    p.add(body, new THREE.BoxGeometry(0.09, lowY1 - lowY0, 1.1), x, (lowY0 + lowY1) / 2, -5.75);
    // glass sheets (one long pane per band and side)
    p.raw(glass, planar([V(x - side * 0.01, lowY0 + 0.03, -5.2), V(x - side * 0.01, lowY0 + 0.03, 4.8), V(x - side * 0.01, lowY1 - 0.03, 4.8), V(x - side * 0.01, lowY1 - 0.03, -5.2)], V(side, 0, 0)));
    p.raw(glass, planar([V(x - side * 0.01, upY0 + 0.03, -6.0), V(x - side * 0.01, upY0 + 0.03, 6.1), V(x - side * 0.01, upY1 - 0.03, 6.1), V(x - side * 0.01, upY1 - 0.03, -6.0)], V(side, 0, 0)));
  }
  // front door (curb side = -x) and the middle door: framed glass leaves
  for (const [z0, z1] of [[4.85, 5.95], [-0.2, 0.95]] as const) {
    const x = -(hw + 0.01);
    p.add(band, new THREE.BoxGeometry(0.03, 1.72, z1 - z0), x, 0.36 + 0.86, (z0 + z1) / 2);
    p.raw(glass, planar([V(x - 0.02, 0.5, z0 + 0.07), V(x - 0.02, 0.5, z1 - 0.07), V(x - 0.02, 2.0, z1 - 0.07), V(x - 0.02, 2.0, z0 + 0.07)], V(-1, 0, 0)));
    p.add(bright, new THREE.BoxGeometry(0.035, 1.5, 0.025), x - 0.012, 1.25, (z0 + z1) / 2);
  }
  // corner posts (rounded) front and rear, both decks
  const post = new RoundedBoxGeometry(0.2, upY1 - lowY0, 0.2, 1, 0.08);
  for (const side of [-1, 1]) {
    p.add(band, post, side * (hw - 0.1), (lowY0 + upY1) / 2, F - 0.1);
    p.add(body, post, side * (hw - 0.1), (lowY0 + upY1) / 2, -F + 0.1);
  }
  // between-deck band (gold) with the black destination panel up front
  p.add(body, new RoundedBoxGeometry(W, upY0 - lowY1, 2 * F, 1, 0.1), 0, (lowY1 + upY0) / 2, 0);
  p.add(band, new THREE.BoxGeometry(W - 0.3, upY0 - lowY1 - 0.04, 0.05), 0, (lowY1 + upY0) / 2, F + 0.005);
  p.raw(lamps, aquad(V(0, (lowY1 + upY0) / 2, F + 0.035), ...FRONT(1.02, 0.15), R.dest));
  p.raw(lamps, aquad(V(0, (lowY1 + upY0) / 2, -F - 0.012), ...BACK(0.98, 0.13), R.dest));
  for (const side of [-1, 1]) {
    p.add(accent, new THREE.BoxGeometry(0.02, 0.05, 2 * F - 0.5), side * (hw + 0.004), lowY1 + 0.05, 0);
    p.raw(decal, aquad(V(side * (hw + 0.006), (lowY1 + upY0) / 2 + 0.02, -0.6), ...SIDE(side, 0.95, 0.17), R.deuce));
  }
  // roof: rounded gold lid
  p.add(body, new RoundedBoxGeometry(W, 0.42, 2 * F, 2, 0.18), 0, upY1 + 0.17, 0);
  p.add(trim, new RoundedBoxGeometry(1.1, 0.12, 1.6, 1, 0.05), 0, upY1 + 0.42, -3.6);

  // ---- front: windscreens, LED sign, bumper, lamps, rabbit-ear mirrors
  p.raw(glass, planar([V(-hw + 0.18, lowY0 - 0.15, F + 0.02), V(hw - 0.18, lowY0 - 0.15, F + 0.02), V(hw - 0.18, lowY1 - 0.02, F + 0.02), V(-hw + 0.18, lowY1 - 0.02, F + 0.02)], V(0, 0, 1)));
  p.raw(glass, planar([V(-hw + 0.18, upY0 + 0.02, F + 0.02), V(hw - 0.18, upY0 + 0.02, F + 0.02), V(hw - 0.18, upY1 - 0.05, F + 0.02), V(-hw + 0.18, upY1 - 0.05, F + 0.02)], V(0, 0, 1)));
  p.add(band, new THREE.BoxGeometry(W - 0.3, 0.06, 0.06), 0, upY0, F);
  p.add(trim, new RoundedBoxGeometry(W + 0.04, 0.26, 0.24, 1, 0.08), 0, 0.42, F + 0.02);
  p.add(trim, new RoundedBoxGeometry(1.1, 0.22, 0.05, 1, 0.03), 0, 0.82, F + 0.02);
  p.raw(lamps, aquad(V(0, 0.62, F + 0.05), ...FRONT(0.17, 0.085), R.plate));
  for (const side of [-1, 1]) {
    p.add(trim, new RoundedBoxGeometry(0.5, 0.22, 0.05, 1, 0.04), side * 0.88, 0.78, F + 0.015);
    p.raw(lamps, aquad(V(side * 0.95, 0.78, F + 0.045), ...FRONT(0.11, 0.075), R.head));
    p.raw(lamps, aquad(V(side * 0.74, 0.78, F + 0.045), ...FRONT(0.08, 0.06), R.head));
    p.raw(lamps, aquad(V(side * 1.15, 0.6, F + 0.045), ...FRONT(0.06, 0.04), R.amber));
    // mirror arm sweeps forward from the roofline, head hangs by the windscreen
    p.add(trim, new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), side * (hw - 0.05), 2.32, F + 0.22, Math.PI / 2 - 0.35);
    p.add(trim, new RoundedBoxGeometry(0.1, 0.36, 0.16, 1, 0.04), side * (hw - 0.02), 2.05, F + 0.47);
    p.add(trim, new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6), side * (hw - 0.02), 2.3, F + 0.47);
  }

  // ---- rear: engine louvres, tail lamps, rear window, plate, logo
  p.add(trim, new RoundedBoxGeometry(1.5, 0.55, 0.05, 1, 0.03), 0, 0.85, -F - 0.01);
  for (let i = 0; i < 6; i++) p.add(band, new THREE.BoxGeometry(1.4, 0.03, 0.04), 0, 0.64 + i * 0.08, -F - 0.03);
  p.add(trim, new RoundedBoxGeometry(W + 0.04, 0.24, 0.22, 1, 0.08), 0, 0.42, -F - 0.02);
  p.add(body, new THREE.BoxGeometry(W - 0.3, lowY1 - lowY0, 0.05), 0, (lowY0 + lowY1) / 2, -F + 0.01);
  p.raw(decal, aquad(V(0, (lowY0 + lowY1) / 2 + 0.05, -F - 0.02), ...BACK(0.72, 0.18), R.rtc));
  p.raw(lamps, aquad(V(0, 0.4, -F - 0.135), ...BACK(0.17, 0.085), R.plate));
  p.raw(glass, planar([V(-0.95, upY0 + 0.15, -F - 0.02), V(0.95, upY0 + 0.15, -F - 0.02), V(0.95, upY1 - 0.12, -F - 0.02), V(-0.95, upY1 - 0.12, -F - 0.02)], V(0, 0, -1)));
  p.add(body, new THREE.BoxGeometry(W - 0.3, upY1 - upY0, 0.05), 0, (upY0 + upY1) / 2, -F + 0.02);
  for (const side of [-1, 1]) {
    p.raw(lamps, aquad(V(side * 1.08, 1.0, -F - 0.03), ...BACK(0.08, 0.3), R.tail));
    p.raw(lamps, aquad(V(side * 1.08, 0.62, -F - 0.03), ...BACK(0.08, 0.05), R.amber));
  }

  // ---- interior seen through the glass: floors, seats, stair rail
  p.add(floorMat, new THREE.BoxGeometry(W - 0.2, 0.06, 2 * F - 0.3), 0, upY0 - 0.025, 0);
  p.add(floorMat, new THREE.BoxGeometry(W - 0.2, 0.06, 2 * F - 0.6), 0, lowY0 - 0.025, -0.1);
  const cushion = new THREE.BoxGeometry(0.78, 0.16, 0.46);
  const back = new THREE.BoxGeometry(0.78, 0.5, 0.1);
  for (let z = -5.4; z <= 5.4; z += 0.95) {
    for (const sx of [-0.66, 0.66]) {
      p.add(seatMat, cushion, sx, upY0 + 0.38, z);
      p.add(seatMat, back, sx, upY0 + 0.62, z - 0.2);
    }
  }
  for (let z = -5.0; z <= 3.8; z += 0.95) {
    if (z > -0.5 && z < 1.3) continue; // middle door well
    for (const sx of [-0.66, 0.66]) p.add(seatMat, back, sx, lowY0 + 0.22, z - 0.2);
  }
  p.add(bright, new THREE.BoxGeometry(2.2, 0.04, 0.04), 0, upY0 + 0.75, F - 0.25);
  return { lists: p.merged(), axle: axleGeo() };
}
