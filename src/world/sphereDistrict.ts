import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BX, CY, K, chainFence, cobraLight, dumpster, jersey, lampGlow, lightPool, loadingDock, lotLight, oleander, parkedCar, boxTruck, part, transformerBox } from './backOfHouse';
import { viewer, type WorldBuilder } from './builder';
import { tower } from './buildings';
import { bakeStatic } from './staticBatch';
import { bench, desertPlantKit, mat, mesh, palmTree, signalLamps, trafficSignal, trashCan } from './props';
import { CX, CZ } from './sphere';
import { fitFont, letterFace, letters, placed } from './signKit';
import { streetBlade } from './stripSigns';
import { parkingLotMaterial, worldPlane } from './streetTextures';
import { makeGravelTexture, makeRoadPaintTexture, rng } from './textures';

/**
 * The Sphere district: everything round the Sphere, laid out from OpenStreetMap (late 2026) at the game's scale
 * (the Sphere is 1 : 3; the streets and cars stay life size).
 *
 * - Sands Ave: from the Strip it runs east past the Palazzo, then curves south-east round the Venetian Expo and
 *   straightens out along the Sphere's north side: six lanes with a planted median, signals at Koval Ln and
 *   Manhattan St. Across it, the Wynn Golf Club's wall, hedge and pines.
 * - Koval Ln starts at that T and runs south between the Venetian Expo and the Sphere, under the Venetian-Sphere
 *   footbridge (the "Venetian Bridge stairway" drops to its east sidewalk).
 * - The Venetian Expo (ex-Sands Expo): a long beige hall whose north face follows the Sands curve, a glass lobby on
 *   the Koval corner, receiving docks on its south side under the bridge.
 * - The Sphere site: Wynn's employee garage on Koval (it really sits between Koval and the Sphere), the west plaza
 *   (sphere.ts), the VIP entry on Sands, the east Plaza Entry with its security tents, Lot A between the Sphere and
 *   Manhattan St, the rideshare zone at Manhattan & Westchester (the real pick-up / drop-off), the service yard
 *   behind black gates on Westchester Dr, and the Sphere's surface lot south of Westchester.
 * - South of that the Desert Club Resort's low timeshare blocks; east of Manhattan the Hughes Center garage and
 *   office towers (backdrop past the edge).
 *
 * Static pieces go through the world's static bake; parked and moving cars are instanced (a handful of draws for
 * every car in the district) and hidden when the camera is far away.
 */

// ---------------------------------------------------------------- layout (game metres)
const KOVAL_X = 186;
const SANDS_Z = -282;
const SANDS_HALF = 12;
const MAN_X = 330;
const WEST_Z = -155;
const MINOR_HALF = 6;
const BAY = { x0: 203, x1: 372, z0: -425, z1: -55 };
const BRIDGE = { y: 8, z0: -231.8, z1: -228.2 };

type V2 = [number, number];

// ---------------------------------------------------------------- small helpers
const geoBank: THREE.BufferGeometry[] = [];
function flatShape(pts: V2[], y: number): THREE.BufferGeometry {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  // world-metre UVs
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 8, p.getZ(i) / 8);
  return g;
}

/** Points along a centreline with tangents and left (+n = right-hand side looking along the road... here: south of an eastbound road) normals. */
interface Line {
  p: V2[];
  n: V2[];
  s: number[];
  len: number;
}
function makeLine(pts: V2[]): Line {
  const n: V2[] = [];
  const s: number[] = [0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const c = pts[Math.min(pts.length - 1, i + 1)];
    const tx = c[0] - a[0];
    const tz = c[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    n.push([-tz / l, tx / l]);
    if (i > 0) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { p: pts, n, s, len: s[s.length - 1] };
}
function lineAt(L: Line, d: number): { p: V2; n: V2 } {
  d = THREE.MathUtils.clamp(d, 0, L.len);
  let i = 1;
  while (i < L.s.length - 1 && L.s[i] < d) i++;
  const t = (d - L.s[i - 1]) / Math.max(1e-6, L.s[i] - L.s[i - 1]);
  const a = L.p[i - 1];
  const c = L.p[i];
  const na = L.n[i - 1];
  const nc = L.n[i];
  const nx = na[0] + (nc[0] - na[0]) * t;
  const nz = na[1] + (nc[1] - na[1]) * t;
  const nl = Math.hypot(nx, nz) || 1;
  return { p: [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t], n: [nx / nl, nz / nl] };
}
/** A flat ribbon between offsets o0..o1 (along the normal) of a centreline; u spans the full road width `uw`. */
function ribbon(L: Line, o0: (s: number) => number, o1: (s: number) => number, y: number, uw: number, vLen: number, s0 = 0, s1 = L.len): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const step = 2;
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let i = 0; i <= n; i++) {
    const d = s0 + ((s1 - s0) * i) / n;
    const { p, n: nn } = lineAt(L, d);
    for (const o of [o0(d), o1(d)]) {
      pos.push(p[0] + nn[0] * o, y, p[1] + nn[1] * o);
      nor.push(0, 1, 0);
      uv.push(0.5 + o / uw, d / vLen);
    }
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // make sure the faces point up whichever way the normal turned
  const a = new THREE.Vector3().fromArray(pos, 0);
  const b = new THREE.Vector3().fromArray(pos, 3);
  const c = new THREE.Vector3().fromArray(pos, 6);
  const up = new THREE.Vector3().crossVectors(c.sub(a), b.sub(a)).y;
  if (up < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
  }
  return g;
}
/** A vertical strip (curb face, wall) along an offset of a centreline. */
function wallStrip(L: Line, o: number, y0: number, y1: number, s0 = 0, s1 = L.len, thick = 0.3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const step = 3;
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let i = 0; i < n; i++) {
    const da = s0 + ((s1 - s0) * i) / n;
    const db = s0 + ((s1 - s0) * (i + 1)) / n;
    const A = lineAt(L, da);
    const B = lineAt(L, db);
    const ax = A.p[0] + A.n[0] * o;
    const az = A.p[1] + A.n[1] * o;
    const bx = B.p[0] + B.n[0] * o;
    const bz = B.p[1] + B.n[1] * o;
    const len = Math.hypot(bx - ax, bz - az) + 0.05;
    const g = new THREE.BoxGeometry(len, y1 - y0, thick);
    g.rotateY(-Math.atan2(bz - az, bx - ax));
    g.translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
    parts.push(g);
  }
  const m = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return m;
}

/** Ground layers merged per material (one draw each for the whole district). */
const layers = new Map<THREE.Material, THREE.BufferGeometry[]>();
function layer(m: THREE.Material, g: THREE.BufferGeometry): void {
  let l = layers.get(m);
  if (!l) layers.set(m, (l = []));
  l.push(g);
}
function flushLayers(b: WorldBuilder): void {
  for (const [m, geos] of layers) {
    const ok = geos.filter((g) => g.index);
    const merged = mergeGeometries(ok.map((g) => (g.attributes.uv ? g : g)), false);
    if (!merged) continue;
    const me = new THREE.Mesh(merged, m);
    me.receiveShadow = true;
    b.add(me);
  }
  layers.clear();
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
function tex(c: HTMLCanvasElement, wrap = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function noise(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, lo: number, hi: number, a: number, seed: number): void {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = lo + R() * (hi - lo);
    ctx.fillStyle = `rgba(${v},${v},${v + 2},${a})`;
    ctx.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2);
  }
}

// ---------------------------------------------------------------- materials (shared)
let M: ReturnType<typeof makeMaterials> | null = null;
function makeMaterials(b: WorldBuilder) {
  // Six-lane arterial: 24 m across (u), 16 m per v repeat. Median under the raised island; dashed lane lines.
  const arterial = (() => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#4a4a4e';
    ctx.fillRect(0, 0, 256, 256);
    noise(ctx, 256, 256, 3000, 55, 95, 0.4, 41);
    const px = (m: number) => 128 + (m / 24) * 256;
    ctx.fillStyle = 'rgba(30,30,32,0.35)'; // tyre tracks
    for (const m of [-9.9, -6.5, -3.1, 3.1, 6.5, 9.9]) for (const d of [-0.75, 0.75]) ctx.fillRect(px(m + d) - 3, 0, 6, 256);
    ctx.fillStyle = '#d8d6cf';
    for (const m of [-8.2, -4.8, 4.8, 8.2]) ctx.fillRect(px(m) - 1.2, 0, 2.4, 64); // 4 m dash of every 16 m
    for (const m of [-11.3, 11.3]) ctx.fillRect(px(m) - 1.2, 0, 2.4, 256);
    ctx.fillStyle = '#d9b23a';
    for (const m of [-1.55, 1.55]) ctx.fillRect(px(m) - 1, 0, 2, 256);
    ctx.fillStyle = '#7b776f'; // gutter pans
    ctx.fillRect(0, 0, px(-11.55), 256);
    ctx.fillRect(px(11.55), 0, 256 - px(11.55), 256);
    const t = tex(c);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  })();
  // Two-lane collector with parking lanes (Manhattan St, Westchester Dr): 12 m across.
  const collector = (() => {
    const [c, ctx] = canvas(128, 256);
    ctx.fillStyle = '#4c4c50';
    ctx.fillRect(0, 0, 128, 256);
    noise(ctx, 128, 256, 1600, 55, 95, 0.4, 43);
    const px = (m: number) => 64 + (m / 12) * 128;
    ctx.fillStyle = '#d9b23a';
    for (const m of [-0.12, 0.12]) ctx.fillRect(px(m) - 1, 0, 1.6, 256);
    ctx.fillStyle = '#d8d6cf';
    for (const m of [-3.7, 3.7]) ctx.fillRect(px(m) - 1, 0, 1.8, 256);
    for (let v = 0; v < 256; v += 64) for (const m of [-4.8, 4.8]) ctx.fillRect(px(m) - 6, v, 12, 1.5); // stall ticks
    ctx.fillStyle = '#7b776f';
    ctx.fillRect(0, 0, px(-5.7), 256);
    ctx.fillRect(px(5.7), 0, 128 - px(5.7), 256);
    return new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  })();
  // Concrete sidewalk: 1.5 m scored squares (world uvs, 8 m tile)
  const walk = (() => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#b9b2a6';
    ctx.fillRect(0, 0, 256, 256);
    noise(ctx, 256, 256, 2500, 150, 200, 0.35, 47);
    ctx.strokeStyle = 'rgba(80,74,66,0.55)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 256; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
    return new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5 });
  })();
  // Mown golf turf with stripes
  const turf = (() => {
    const [c, ctx] = canvas(256, 256);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#5f8a3e' : '#6b9a46';
      ctx.fillRect(0, i * 32, 256, 32);
    }
    const R = rng(51);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(${40 + R() * 40},${80 + R() * 50},${30 + R() * 20},0.35)`;
      ctx.fillRect(R() * 256, R() * 256, 1, 2);
    }
    return new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.95 });
  })();
  // Decomposed-granite desert landscaping
  const dg = (() => {
    const g = makeGravelTexture();
    g.wrapS = g.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: g, color: 0xd9c7a8, roughness: 0.97, polygonOffset: true, polygonOffsetFactor: -0.7, polygonOffsetUnits: -0.7 });
  })();
  const paint = new THREE.MeshStandardMaterial({ map: makeRoadPaintTexture(), color: 0xd8d6cf, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // Venetian Expo facade: beige panels, reveal lines, a ribbon of dark glass at the upper level (v = metres)
  const expo = (() => {
    const [c, ctx] = canvas(512, 512);
    const H = 512 / 16; // px per metre (16 m tall, 16 m wide tile)
    ctx.fillStyle = '#d6c19e';
    ctx.fillRect(0, 0, 512, 512);
    noise(ctx, 512, 512, 5000, 180, 225, 0.25, 53);
    ctx.fillStyle = '#b9a27e';
    for (const y of [1.0, 5.6, 6.0]) ctx.fillRect(0, 512 - y * H, 512, 0.18 * H);
    ctx.fillStyle = '#c7b08c';
    ctx.fillRect(0, 0, 512, 1.4 * H); // parapet band
    ctx.fillStyle = '#a58e6c';
    ctx.fillRect(0, 1.4 * H, 512, 0.25 * H);
    // upper ribbon window band 9.5..12.5 m
    ctx.fillStyle = '#26303a';
    ctx.fillRect(0, 512 - 12.5 * H, 512, 3 * H);
    ctx.fillStyle = '#c9b38f';
    for (let x = 0; x < 512; x += 4 * H) ctx.fillRect(x, 512 - 12.5 * H, 0.35 * H, 3 * H);
    // panel joints
    ctx.strokeStyle = 'rgba(120,100,76,0.45)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= 512; x += 4 * H) {
      ctx.beginPath();
      ctx.moveTo(x, 512 - 9.5 * H);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    const map = tex(c);
    const [e, ex] = canvas(512, 512);
    ex.fillStyle = '#000';
    ex.fillRect(0, 0, 512, 512);
    const R = rng(55);
    for (let x = 0; x < 512; x += 4 * H) {
      const on = R();
      ex.fillStyle = on > 0.35 ? `rgba(255,${200 + R() * 40},${140 + R() * 50},${0.5 + R() * 0.5})` : 'rgba(60,70,90,0.5)';
      ex.fillRect(x + 0.35 * H, 512 - 12.3 * H, 4 * H - 0.4 * H, 2.6 * H);
    }
    // a warm uplight wash on the lower wall
    const g = ex.createLinearGradient(0, 512, 0, 512 - 6 * H);
    g.addColorStop(0, 'rgba(255,200,140,0.35)');
    g.addColorStop(1, 'rgba(255,200,140,0)');
    ex.fillStyle = g;
    ex.fillRect(0, 512 - 6 * H, 512, 6 * H);
    const em = tex(e);
    em.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.85 });
    m.map!.repeat.set(1 / 16, 1 / 16);
    m.emissiveMap!.repeat.set(1 / 16, 1 / 16);
    return b.nightGlow(m, 0.02, 0.9);
  })();
  // Open garage deck faces: concrete spandrels with dark openings and a lit ceiling stripe at night (v = metres)
  const garage = (() => {
    const [c, ctx] = canvas(256, 256);
    const H = 256 / 6.4; // two 3.2 m levels per tile
    for (let k = 0; k < 2; k++) {
      const y0 = 256 - (k + 1) * 3.2 * H;
      ctx.fillStyle = '#15171a';
      ctx.fillRect(0, y0, 256, 3.2 * H);
      ctx.fillStyle = '#c9c3b6';
      ctx.fillRect(0, y0 + 2.1 * H, 256, 1.1 * H); // spandrel
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y0 + 2.1 * H, 256, 0.08 * H);
      ctx.fillStyle = '#bdb6a8';
      for (let x = 0; x < 256; x += 64) ctx.fillRect(x, y0, 9, 2.1 * H); // columns
      ctx.fillStyle = '#3a3f46';
      ctx.fillRect(0, y0 + 0.2 * H, 256, 0.12 * H); // ceiling tubes line
    }
    noise(ctx, 256, 256, 1500, 120, 200, 0.2, 57);
    const map = tex(c);
    const [e, ex] = canvas(256, 256);
    ex.fillStyle = '#000';
    ex.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 2; k++) {
      const y0 = 256 - (k + 1) * 3.2 * H;
      const g = ex.createLinearGradient(0, y0, 0, y0 + 2.1 * H);
      g.addColorStop(0, 'rgba(220,235,255,0.9)');
      g.addColorStop(0.25, 'rgba(160,180,200,0.35)');
      g.addColorStop(1, 'rgba(60,70,80,0.15)');
      ex.fillStyle = g;
      ex.fillRect(0, y0, 256, 2.1 * H);
    }
    const em = tex(e);
    const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.02, roughness: 0.9 });
    m.map!.repeat.set(1 / 16, 1 / 6.4);
    m.emissiveMap!.repeat.set(1 / 16, 1 / 6.4);
    return b.nightGlow(m, 0.02, 0.85);
  })();
  // Timeshare stucco blocks: sand stucco, balconies, warm windows (v = metres, 3 floors of 3 m)
  const resort = (() => {
    const [c, ctx] = canvas(256, 256);
    const H = 256 / 9;
    ctx.fillStyle = '#d9b48c';
    ctx.fillRect(0, 0, 256, 256);
    noise(ctx, 256, 256, 2000, 170, 220, 0.25, 59);
    for (let f = 0; f < 3; f++) {
      const y0 = 256 - (f + 1) * 3 * H;
      for (let x = 10; x < 256; x += 64) {
        ctx.fillStyle = '#3b4652';
        ctx.fillRect(x, y0 + 0.7 * H, 40, 1.6 * H);
        ctx.fillStyle = '#efe6d6';
        ctx.fillRect(x - 4, y0 + 2.35 * H, 48, 0.14 * H); // balcony rail
        ctx.fillStyle = '#8c5a3c';
        ctx.fillRect(x + 44, y0 + 0.7 * H, 6, 1.6 * H); // shutter
      }
      ctx.fillStyle = '#c49a72';
      ctx.fillRect(0, y0 + 2.9 * H, 256, 0.1 * H);
    }
    const map = tex(c);
    const [e, ex] = canvas(256, 256);
    ex.fillStyle = '#000';
    ex.fillRect(0, 0, 256, 256);
    const R = rng(61);
    for (let f = 0; f < 3; f++) {
      const y0 = 256 - (f + 1) * 3 * H;
      for (let x = 10; x < 256; x += 64) if (R() > 0.4) {
        ex.fillStyle = `rgba(255,${190 + R() * 50},${120 + R() * 60},0.85)`;
        ex.fillRect(x, y0 + 0.7 * H, 40, 1.6 * H);
      }
    }
    const m = new THREE.MeshStandardMaterial({ map, emissiveMap: tex(e), emissive: 0xffffff, emissiveIntensity: 0.02, roughness: 0.9 });
    m.map!.repeat.set(1 / 16, 1 / 9);
    m.emissiveMap!.repeat.set(1 / 16, 1 / 9);
    return b.nightGlow(m, 0.02, 0.8);
  })();
  const blackSteel = mat(0x15171b, 0.5, 0.5);
  const glassLobby = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x1d2a36, roughness: 0.08, metalness: 0.6, emissive: 0xffd9a8, emissiveIntensity: 0.05 }), 0.05, 0.5);
  const ledViolet = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x2a2440, emissive: 0xb07dff, emissiveIntensity: 0.2, roughness: 0.4 }), 0.2, 1.7);
  const tentWhite = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8, emissive: 0xfff4e0, emissiveIntensity: 0.0, side: THREE.DoubleSide }), 0, 0.35);
  // the same concrete pushed back in depth: the base under lots and plazas, which must never win over them
  const base = walk.clone();
  base.polygonOffsetFactor = 3;
  base.polygonOffsetUnits = 3;
  const dgBase = dg.clone();
  dgBase.polygonOffsetFactor = 3;
  dgBase.polygonOffsetUnits = 3;
  return { arterial, collector, walk, base, dgBase, turf, dg, paint, expo, garage, resort, blackSteel, glassLobby, ledViolet, tentWhite };
}

// ---------------------------------------------------------------- instanced cars
const CAR_COLORS = [0xd9dadc, 0x1b1d21, 0x8d9197, 0xe6e6e2, 0x24272c, 0x5d6168, 0x2c4a7c, 0x9a1a1e, 0xb4b7bb, 0x3d4148, 0x6e5a48, 0x1f3d2c, 0xcfd0d2, 0x15161a];
interface CarKit {
  paint: THREE.BufferGeometry[];
  trim: THREE.BufferGeometry[];
  len: number[];
}
let carKit: CarKit | null = null;
const TRIM_MATS = new Set<THREE.Material>([K.glass, K.rubber, K.white, K.red, K.darkSteel]);
/** Bake the back-of-house car models (sedan, SUV, pickup) into a paint part (tinted per instance) and a trim part. */
function getCarKit(): CarKit {
  if (carKit) return carKit;
  const kit: CarKit = { paint: [], trim: [], len: [4.5, 4.8, 5.4] };
  for (const seed of [0, 3, 4]) {
    const g = parkedCar(seed);
    g.updateMatrixWorld(true);
    const paint: THREE.BufferGeometry[] = [];
    const trim: THREE.BufferGeometry[] = [];
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      let geo = m.geometry.clone();
      geo = geo.index ? geo.toNonIndexed() : geo;
      geo.applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      const mm = m.material as THREE.MeshStandardMaterial;
      if (TRIM_MATS.has(mm)) {
        const n = geo.attributes.position.count;
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) mm.color.toArray(col, i * 3);
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        trim.push(geo);
      } else paint.push(geo);
    });
    kit.paint.push(mergeGeometries(paint, false)!);
    kit.trim.push(mergeGeometries(trim, false)!);
  }
  carKit = kit;
  return kit;
}
const paintMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.3 });
const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2 });

/** Parked cars collected per lot / garage, then drawn as 6 instanced meshes (3 shapes × paint/trim). */
class CarLot {
  readonly cars: Array<{ x: number; y: number; z: number; r: number; seed: number }> = [];
  add(x: number, y: number, z: number, r: number, seed: number): void {
    this.cars.push({ x, y, z, r, seed });
  }
  flush(b: WorldBuilder, cull = 300): void {
    if (!this.cars.length) return;
    const kit = getCarKit();
    const meshes: THREE.InstancedMesh[] = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    let cx = 0;
    let cz = 0;
    for (const c of this.cars) {
      cx += c.x / this.cars.length;
      cz += c.z / this.cars.length;
    }
    let radius = 0;
    for (const c of this.cars) radius = Math.max(radius, Math.hypot(c.x - cx, c.z - cz));
    for (let k = 0; k < 3; k++) {
      const list = this.cars.filter((c) => [0, 0, 0, 1, 2][Math.abs(c.seed) % 5] === k);
      if (!list.length) continue;
      const pm = new THREE.InstancedMesh(kit.paint[k], paintMat, list.length);
      const tm = new THREE.InstancedMesh(kit.trim[k], trimMat, list.length);
      list.forEach((c, i) => {
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, c.r);
        m4.compose(new THREE.Vector3(c.x, c.y, c.z), q, one);
        pm.setMatrixAt(i, m4);
        tm.setMatrixAt(i, m4);
        const n = Math.abs(c.seed);
        pm.setColorAt(i, col.setHex(CAR_COLORS[(n * 7 + (n >> 3)) % CAR_COLORS.length]));
      });
      for (const im of [pm, tm]) {
        im.castShadow = false;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        im.userData.dynamic = true;
        b.scene.add(im);
        meshes.push(im);
      }
    }
    b.every(() => {
      const d = Math.hypot(viewer.cam.x - cx, viewer.cam.z - cz) - radius;
      const v = d < cull && !camInSphere();
      for (const im of meshes) im.visible = v;
    });
  }
}

// ---------------------------------------------------------------- moving traffic (instanced, culled)
interface Mover {
  lane: Line;
  off: number;
  d: number;
  v: number;
  cruise: number;
  kind: number;
  color: number;
  /** stop lines (distance along lane) and the phase that lets the car through */
  stops: Array<{ d: number; go: () => boolean }>;
}
function buildTraffic(b: WorldBuilder, lanes: Array<{ line: Line; off: number; n: number; stops: Array<{ d: number; go: () => boolean }> }>): void {
  const kit = getCarKit();
  const R = rng(733);
  const movers: Mover[] = [];
  for (const l of lanes) {
    for (let i = 0; i < l.n; i++) {
      const kind = R() < 0.55 ? 0 : R() < 0.6 ? 1 : 2;
      movers.push({ lane: l.line, off: l.off, d: ((i + R() * 0.5) / l.n) * l.line.len, v: 10, cruise: 10 + R() * 4, kind, color: CAR_COLORS[Math.floor(R() * CAR_COLORS.length)], stops: l.stops });
    }
  }
  const meshes: THREE.InstancedMesh[][] = [0, 1, 2].map((k) => {
    const n = Math.max(1, movers.filter((m) => m.kind === k).length);
    const pm = new THREE.InstancedMesh(kit.paint[k], paintMat, n);
    const tm = new THREE.InstancedMesh(kit.trim[k], trimMat, n);
    for (const im of [pm, tm]) {
      im.frustumCulled = false;
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      b.scene.add(im);
    }
    return [pm, tm];
  });
  const col = new THREE.Color();
  for (let k = 0; k < 3; k++) {
    let i = 0;
    for (const m of movers) if (m.kind === k) meshes[k][0].setColorAt(i++, col.setHex(m.color));
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const centre = new THREE.Vector3(250, 0, -250);
  b.every((dt) => {
    const far = viewer.cam.distanceTo(centre) > 520 || camInSphere();
    for (const ms of meshes) for (const im of ms) im.visible = !far;
    if (far) return;
    dt = Math.min(dt, 0.1);
    // advance: keep a gap to the car ahead in the same lane, stop at red lines
    for (const m of movers) {
      let limit = m.cruise;
      for (const o of movers) {
        if (o === m || o.lane !== m.lane || o.off !== m.off) continue;
        const gap = o.d - m.d;
        if (gap > 0 && gap < 14) limit = Math.min(limit, Math.max(0, (gap - 7) * 1.2));
      }
      for (const s of m.stops) {
        const to = s.d - m.d;
        if (to > 0 && to < 30 && !s.go()) limit = Math.min(limit, Math.max(0, (to - 2) * 0.8));
      }
      m.v += THREE.MathUtils.clamp(limit - m.v, -9 * dt, 3 * dt);
      m.d += m.v * dt;
      if (m.d > m.lane.len) m.d -= m.lane.len;
    }
    const idx = [0, 0, 0];
    for (const m of movers) {
      const a = lineAt(m.lane, m.d);
      // pop in / out at the far ends rather than sliding back along the street
      const s = m.d < 3 || m.d > m.lane.len - 3 ? 0.0001 : 1;
      one.setScalar(s);
      const c = lineAt(m.lane, m.d + 1);
      pos.set(a.p[0] + a.n[0] * m.off, 0, a.p[1] + a.n[1] * m.off);
      const yaw = Math.atan2(c.p[0] - a.p[0], c.p[1] - a.p[1]);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      m4.compose(pos, q, one);
      const i = idx[m.kind]++;
      meshes[m.kind][0].setMatrixAt(i, m4);
      meshes[m.kind][1].setMatrixAt(i, m4);
    }
    for (const ms of meshes) for (const im of ms) im.instanceMatrix.needsUpdate = true;
  });
}

// ---------------------------------------------------------------- build
/** True while the camera is inside the Sphere's bowl or atrium: the district behind the screen isn't drawn then. */
function camInSphere(): boolean {
  const c = viewer.cam;
  return Math.hypot(c.x - CX, c.z - CZ) < 24 && c.y < 34;
}

export function buildSphereDistrict(b: WorldBuilder): void {
  M ??= makeMaterials(b);
  const n0 = b.root.children.length;
  const R = rng(4255);
  const sands = sandsLine();
  const signals = buildRoads(b, sands, R);
  buildGolfClub(b, sands, R);
  buildExpo(b, sands, R);
  buildBridge(b);
  buildSphereSite(b, R);
  buildSouth(b, R);
  buildEast(b, R);
  buildEdges(b);
  flushLayers(b);
  // The district bakes and culls on its own (coarser cells than the Strip's, and it hides while the camera is in
  // the Sphere: the screen is opaque but the GPU would still draw the streets behind it)
  const group = new THREE.Group();
  for (const o of b.root.children.slice(n0)) group.add(o);
  b.scene.add(group);
  bakeStatic(group, 192, new Set<THREE.Material>(b.nightMaterials.map((n) => n.mat)));
  const culls: Array<{ m: THREE.Object3D; c: THREE.Vector3; r: number; limit: number }> = [];
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const bs = m.geometry.boundingSphere!;
    const c = bs.center.clone().applyMatrix4(m.matrixWorld);
    const r = bs.radius * m.matrixWorld.getMaxScaleOnAxis();
    if (r > 140) return;
    culls.push({ m, c, r, limit: m.userData.lod === 'small' ? 230 : m.userData.lod === 'big' ? 700 : r > 18 ? 650 : 380 });
  });
  let cullT = 1;
  b.every((dt) => {
    const inside = camInSphere();
    group.visible = !inside;
    if (inside) return;
    cullT += dt;
    if (cullT < 0.25) return;
    cullT = 0;
    const cam = viewer.cam;
    for (const k of culls) k.m.visible = cam.distanceTo(k.c) - k.r < k.limit;
  });

  // Traffic: Sands both ways (the Strip ↔ past Manhattan), Koval and Manhattan one lane each way
  const rev = (L: Line) => makeLine([...L.p].reverse());
  const sandsW = rev(sands);
  const dKoval = nearestD(sands, KOVAL_X, SANDS_Z);
  const dMan = nearestD(sands, MAN_X, SANDS_Z);
  const kovalN = makeLine([[KOVAL_X, -90], [KOVAL_X, SANDS_Z + 6]]);
  const kovalS = makeLine([[KOVAL_X, SANDS_Z + 6], [KOVAL_X, -90]]);
  const manN = makeLine([[MAN_X, -60], [MAN_X, SANDS_Z + 6]]);
  const manS = makeLine([[MAN_X, SANDS_Z + 6], [MAN_X, -60]]);
  const sandsGo = () => signals.sandsGo();
  const sideGo = () => !signals.sandsGo();
  buildTraffic(b, [
    { line: sands, off: 3.1, n: 4, stops: [{ d: dKoval - 14, go: sandsGo }, { d: dMan - 10, go: sandsGo }] },
    { line: sands, off: 6.5, n: 3, stops: [{ d: dKoval - 14, go: sandsGo }, { d: dMan - 10, go: sandsGo }] },
    { line: sandsW, off: 3.1, n: 4, stops: [{ d: sandsW.len - dMan - 10, go: sandsGo }, { d: sandsW.len - dKoval - 10, go: sandsGo }] },
    { line: sandsW, off: 6.5, n: 3, stops: [{ d: sandsW.len - dMan - 10, go: sandsGo }, { d: sandsW.len - dKoval - 10, go: sandsGo }] },
    { line: kovalN, off: 2.2, n: 3, stops: [{ d: kovalN.len - 8, go: sideGo }] },
    { line: kovalS, off: 2.2, n: 2, stops: [] },
    { line: manN, off: 2.0, n: 2, stops: [{ d: manN.len - 8, go: sideGo }] },
    { line: manS, off: 2.0, n: 2, stops: [] },
  ]);
}

function nearestD(L: Line, x: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < L.p.length; i++) {
    const d = Math.hypot(L.p[i][0] - x, L.p[i][1] - z);
    if (d < bd) {
      bd = d;
      best = L.s[i];
    }
  }
  return best;
}

/** Sands Ave's centreline: east from the Strip along the Palazzo, round the Expo, then straight past the Sphere. */
function sandsLine(): Line {
  const ctrl = [
    new THREE.Vector3(40, 0, -407),
    new THREE.Vector3(96, 0, -407),
    new THREE.Vector3(126, 0, -405),
    new THREE.Vector3(148, 0, -396),
    new THREE.Vector3(161, 0, -377),
    new THREE.Vector3(168, 0, -350),
    new THREE.Vector3(172.5, 0, -322),
    new THREE.Vector3(177.5, 0, -301),
    new THREE.Vector3(186, 0, -288),
    new THREE.Vector3(200, 0, -282.3),
    new THREE.Vector3(225, 0, SANDS_Z),
    new THREE.Vector3(BAY.x1 + 80, 0, SANDS_Z),
  ];
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  const pts: V2[] = [];
  const N = Math.ceil(curve.getLength() / 2);
  for (let i = 0; i <= N; i++) {
    const p = curve.getPointAt(i / N);
    pts.push([p.x, p.z]);
  }
  return makeLine(pts);
}
/** z of the road's south (+normal) edge at a given x along the curve (the edge runs west → east monotonically). */
function edgeZ(L: Line, off: number, x: number): number {
  let prev: V2 | null = null;
  for (let d = 0; d <= L.len; d += 1) {
    const a = lineAt(L, d);
    const q: V2 = [a.p[0] + a.n[0] * off, a.p[1] + a.n[1] * off];
    if (prev && ((prev[0] <= x && q[0] >= x) || (prev[0] >= x && q[0] <= x))) {
      const t = (x - prev[0]) / (q[0] - prev[0] || 1);
      return prev[1] + (q[1] - prev[1]) * t;
    }
    prev = q;
  }
  return SANDS_Z + off;
}

// ---------------------------------------------------------------- roads
function buildRoads(b: WorldBuilder, sands: Line, R: () => number): { sandsGo: () => boolean } {
  const m = M!;
  // Sands Ave widens from the Strip's 14 m mouth to six lanes, then holds that past the Sphere
  const half = (d: number) => THREE.MathUtils.lerp(7, SANDS_HALF, THREE.MathUtils.smoothstep(d, 0, 34));
  layer(m.arterial, ribbon(sands, (d) => -half(d), (d) => half(d), 0.036, SANDS_HALF * 2, 16));
  // sidewalks, 4 m, both sides (the south one stops where Koval and Manhattan cross it)
  const walk = (o0: number, o1: number, s0: number, s1: number) => layer(m.walk, ribbon(sands, (d) => Math.sign(o0) * half(d) + (o0 - Math.sign(o0) * SANDS_HALF), (d) => Math.sign(o1) * half(d) + (o1 - Math.sign(o1) * SANDS_HALF), 0.03, 8, 8, s0, s1));
  const dK = nearestD(sands, KOVAL_X, SANDS_Z);
  const dM = nearestD(sands, MAN_X, SANDS_Z);
  const dEnd = nearestD(sands, BAY.x1 + 2, SANDS_Z);
  walk(-SANDS_HALF - 4, -SANDS_HALF, 0, dEnd);
  walk(SANDS_HALF, SANDS_HALF + 4, 0, dK - 6);
  walk(SANDS_HALF, SANDS_HALF + 4, dK + 6, dM - 7);
  walk(SANDS_HALF, SANDS_HALF + 4, dM + 7, dEnd);
  // curbs (thin raised strips) both sides
  const curb = K.concrete;
  for (const [s0, s1, side] of [
    [0, dEnd, -1],
    [0, dK - 5.5, 1],
    [dK + 5.5, dM - 6.5, 1],
    [dM + 6.5, dEnd, 1],
  ] as Array<[number, number, number]>) {
    b.add(new THREE.Mesh(wallStrip(sands, side * (SANDS_HALF + 0.15), 0, 0.16, Math.max(s0, 30), s1), curb));
  }
  // raised median: curb faces, a gravel top, palms and desert shrubs; cut for the Koval and Manhattan turns
  const medGeo: THREE.BufferGeometry[] = [];
  const medRuns: Array<[number, number]> = [
    [44, dK - 16],
    [dK + 12, dM - 14],
    [dM + 10, dEnd],
  ];
  const kitP = desertPlantKit();
  const gravelMat = M!.dg;
  for (const [s0, s1] of medRuns) {
    if (s1 - s0 < 4) continue;
    for (const o of [-1.4, 1.4]) medGeo.push(wallStrip(sands, o, 0, 0.22, s0, s1, 0.25));
    layer(gravelMat, ribbon(sands, () => -1.3, () => 1.3, 0.22, 8, 8, s0, s1));
    for (let d = s0 + 6; d < s1 - 4; d += 16) {
      const { p } = lineAt(sands, d);
      b.add(palmTree(8.5 + R() * 2, false, Math.floor(d)), p[0], 0.22, p[1]);
      for (const k of [-5, 5]) {
        const q = lineAt(sands, d + k).p;
        const sh = mesh(kitP.shrub[Math.floor(R() * 2)], R() < 0.5 ? K.leaf : mat(0x7f8460, 0.92), q[0], 0.24, q[1]);
        sh.scale.setScalar(0.8 + R() * 0.3);
        sh.userData.clutter = true;
        b.add(sh);
      }
    }
  }
  b.add(new THREE.Mesh(mergeGeometries(medGeo, false)!, mat(0xb8ad9c, 0.85)));

  // Manhattan St and Westchester Dr (two lanes + parking), Koval stays back-of-house's
  const man = makeLine([[MAN_X, SANDS_Z + SANDS_HALF], [MAN_X, BAY.z1]]);
  layer(m.collector, ribbon(man, () => -MINOR_HALF, () => MINOR_HALF, 0.035, MINOR_HALF * 2, 16));
  const wes = makeLine([[KOVAL_X + 4.6, WEST_Z], [MAN_X - MINOR_HALF, WEST_Z]]);
  layer(m.collector, ribbon(wes, () => -MINOR_HALF, () => MINOR_HALF, 0.035, MINOR_HALF * 2, 16));
  for (const s of [-1, 1]) {
    b.add(mesh(BX(0.3, 0.16, BAY.z1 - (SANDS_Z + SANDS_HALF)), curb, MAN_X + s * (MINOR_HALF + 0.15), 0.08, (BAY.z1 + SANDS_Z + SANDS_HALF) / 2));
    b.add(mesh(BX(MAN_X - MINOR_HALF - KOVAL_X - 4.8, 0.16, 0.3), curb, (MAN_X - MINOR_HALF + KOVAL_X + 4.8) / 2, 0.08, WEST_Z + s * (MINOR_HALF + 0.15)));
  }
  // sidewalks along Manhattan (both) and Westchester (both)
  layer(m.walk, worldPlane(4, BAY.z1 - (SANDS_Z + SANDS_HALF), MAN_X - MINOR_HALF - 2, 0.03, (BAY.z1 + SANDS_Z + SANDS_HALF) / 2, 8, 8));
  layer(m.walk, worldPlane(4, BAY.z1 - (SANDS_Z + SANDS_HALF), MAN_X + MINOR_HALF + 2, 0.03, (BAY.z1 + SANDS_Z + SANDS_HALF) / 2, 8, 8));
  for (const s of [-1, 1]) layer(m.walk, worldPlane(MAN_X - MINOR_HALF - KOVAL_X - 4.8, 3.5, (MAN_X - MINOR_HALF + KOVAL_X + 4.8) / 2, 0.03, WEST_Z + s * (MINOR_HALF + 1.75), 8, 8));
  // Koval's east sidewalk (the west one is the Expo's apron)
  layer(m.walk, worldPlane(3.6, -40 - (SANDS_Z + SANDS_HALF), KOVAL_X + 6.5, 0.03, (-40 + SANDS_Z + SANDS_HALF) / 2, 8, 8));
  layer(m.walk, worldPlane(4.6, BRIDGE.z0 - 6 - (SANDS_Z + SANDS_HALF), KOVAL_X - 7, 0.03, (BRIDGE.z0 - 6 + SANDS_Z + SANDS_HALF) / 2, 8, 8));

  // crosswalks: across Sands west of Koval and east of Manhattan, across Koval and Manhattan at the T, Westchester
  const bars = (x: number, z: number, along: 'x' | 'z', span: number) => {
    const n = Math.floor(span / 1.2);
    for (let i = -n / 2; i <= n / 2; i++) {
      const g = new THREE.PlaneGeometry(along === 'x' ? 0.6 : 3.2, along === 'x' ? 3.2 : 0.6);
      g.rotateX(-Math.PI / 2);
      g.translate(along === 'x' ? x + i * 1.2 : x, 0.058, along === 'x' ? z : z + i * 1.2);
      layer(m.paint, g);
    }
  };
  bars(KOVAL_X, SANDS_Z + SANDS_HALF + 2.5, 'x', 8.4); // across Koval at Sands
  bars(KOVAL_X - 7.5, SANDS_Z - 1.6, 'z', 22); // across Sands, west leg
  bars(MAN_X, SANDS_Z + SANDS_HALF + 2.5, 'x', 10.8); // across Manhattan
  bars(MAN_X + 9.5, SANDS_Z, 'z', 22); // across Sands, east leg
  bars(KOVAL_X + 7.4, WEST_Z, 'z', 10.8); // across Westchester at Koval
  bars(MAN_X - 9.5, WEST_Z, 'z', 10.8); // across Westchester at Manhattan (the rideshare corner)
  // stop bars
  for (const [x, z, w, d] of [
    [KOVAL_X + 2.2, SANDS_Z + SANDS_HALF + 5, 4.4, 0.45],
    [MAN_X + 3, SANDS_Z + SANDS_HALF + 5, 6, 0.45],
    [KOVAL_X + 10, WEST_Z - 3, 0.45, 6],
    [MAN_X - 12, WEST_Z + 3, 0.45, 6],
  ]) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.058, z);
    layer(m.paint, g);
  }

  // signals at Sands/Koval and Sands/Manhattan (one plan: Sands green 0–20 s, yellow 20–23, the side street after)
  const lampsMain = signalLamps();
  const lampsSide = signalLamps();
  const cyc = 34;
  const phase = (t: number): { main: 'green' | 'yellow' | 'red'; side: 'green' | 'yellow' | 'red' } => {
    const c = t % cyc;
    if (c < 20) return { main: 'green', side: 'red' };
    if (c < 23) return { main: 'yellow', side: 'red' };
    if (c < 31) return { main: 'red', side: 'green' };
    return { main: 'red', side: 'yellow' };
  };
  const clock = () => performance.now() / 1000;
  const mainSigs: Array<ReturnType<typeof trafficSignal>> = [];
  const sideSigs: Array<ReturnType<typeof trafficSignal>> = [];
  const pole = (x: number, z: number, rot: number, arm: number, main: boolean, blade: string) => {
    const s = trafficSignal(arm, main ? lampsMain : lampsSide);
    s.group.add(placed(streetBlade(b, blade), 2.1, 7.35, 0));
    b.add(s.group, x, 0, z, rot);
    b.collider(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 7, true);
    (main ? mainSigs : sideSigs).push(s);
  };
  // mast arms over Sands (from the north side, reaching south) and over the side street (from its east corner)
  pole(KOVAL_X + 9, SANDS_Z - SANDS_HALF - 1.2, -Math.PI / 2, 11, true, 'Koval Ln');
  pole(KOVAL_X + 6.2, SANDS_Z + SANDS_HALF + 1.4, Math.PI, 6.5, false, 'Sands Ave');
  pole(MAN_X - 9, SANDS_Z - SANDS_HALF - 1.2, -Math.PI / 2, 11, true, 'Manhattan St');
  pole(MAN_X + MINOR_HALF + 1.4, SANDS_Z + SANDS_HALF + 1.4, Math.PI, 7, false, 'Sands Ave');
  let last = '';
  b.every(() => {
    const p = phase(clock());
    const k = p.main + p.side;
    if (k === last) return;
    last = k;
    mainSigs[0]?.setState(p.main);
    sideSigs[0]?.setState(p.side);
  });
  // Westchester: stop signs (all-way at Koval)
  for (const [x, z, r] of [
    [KOVAL_X + 10.5, WEST_Z - 7, Math.PI / 2],
    [MAN_X - 12.5, WEST_Z + 7, -Math.PI / 2],
  ]) b.add(stopSign(b), x, 0, z, r);
  // street-name blades on posts
  for (const [name, x, z, r] of [
    ['Westchester Dr', KOVAL_X + 6.8, WEST_Z - 7.5, 0],
    ['Westchester Dr', MAN_X - 8.5, WEST_Z + 7.5, 0],
    ['Manhattan St', MAN_X + 8.4, WEST_Z - 7.5, Math.PI / 2],
  ] as Array<[string, number, number, number]>) {
    const g = new THREE.Group();
    part(g, CY(0.05, 0.05, 3.4, 6), K.galv, 0, 1.7, 0);
    g.add(placed(streetBlade(b, name, 2.4), 0, 3.2, 0));
    b.add(g, x, 0, z, r);
  }

  // street lights: tall poles both sides of Sands every ~34 m, lit pools under them
  for (let d = 50; d < dEnd; d += 34) {
    if (Math.abs(d - dK) < 10 || Math.abs(d - dM) < 10) continue;
    for (const side of [-1, 1]) {
      const { p, n } = lineAt(sands, d + side * 8);
      const o = side * (SANDS_HALF + 1.0);
      const x = p[0] + n[0] * o;
      const z = p[1] + n[1] * o;
      const l = cobraLight(b);
      l.position.set(x, 0, z);
      l.rotation.y = Math.atan2(n[1] * side, -n[0] * side);
      b.add(l);
      b.collider(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 0, 9, true);
      lightPool(b, x - n[0] * side * 3, z - n[1] * side * 3, 14);
    }
  }
  for (let z = SANDS_Z + 30; z < BAY.z1 - 5; z += 34) {
    const l = cobraLight(b);
    l.position.set(MAN_X + MINOR_HALF + 0.8, 0, z);
    l.rotation.y = Math.PI;
    b.add(l);
    lightPool(b, MAN_X + 2, z, 12);
  }
  for (let x = KOVAL_X + 20; x < MAN_X - 10; x += 34) {
    const l = cobraLight(b);
    l.position.set(x, 0, WEST_Z + MINOR_HALF + 0.8);
    l.rotation.y = Math.PI / 2;
    b.add(l);
    lightPool(b, x, WEST_Z + 2, 12);
  }
  // RTC bus stops: "Eastbound Sands after Koval" and "Southbound Koval after Sands" (real stop names)
  busStop(b, 203, SANDS_Z + SANDS_HALF + 2.2, Math.PI, 'SANDS AV & KOVAL LN', R);
  busStop(b, KOVAL_X + 6.4, -170, -Math.PI / 2, 'KOVAL LN & WESTCHESTER DR', R);

  b.zone('Sands Ave', 40, BAY.x1, SANDS_Z - SANDS_HALF - 4, SANDS_Z + SANDS_HALF + 4);
  b.zone('Sands Ave', 40, 180, -419, -395);
  b.zone('Manhattan St', MAN_X - 10, MAN_X + 10, SANDS_Z + SANDS_HALF, BAY.z1);
  b.zone('Westchester Dr', KOVAL_X + 5, MAN_X - 6, WEST_Z - 9, WEST_Z + 9);
  b.feature({ kind: 'road', x: (225 + BAY.x1) / 2, z: SANDS_Z, w: BAY.x1 - 225, d: SANDS_HALF * 2, color: '#3b3a40', label: 'Sands Ave' });
  for (let d = 0; d < nearestD(sands, 225, SANDS_Z); d += 14) {
    const { p } = lineAt(sands, d + 7);
    b.feature({ kind: 'road', x: p[0], z: p[1], w: 16, d: 16, color: '#3b3a40' });
  }
  b.feature({ kind: 'road', x: MAN_X, z: (SANDS_Z + BAY.z1) / 2, w: MINOR_HALF * 2, d: BAY.z1 - SANDS_Z, color: '#3b3a40', label: 'Manhattan St' });
  b.feature({ kind: 'road', x: (KOVAL_X + MAN_X) / 2, z: WEST_Z, w: MAN_X - KOVAL_X, d: MINOR_HALF * 2, color: '#3b3a40', label: 'Westchester Dr' });
  return { sandsGo: () => phase(clock()).main !== 'red' };
}

function stopSign(b: WorldBuilder): THREE.Group {
  const g = new THREE.Group();
  part(g, CY(0.04, 0.04, 2.5, 6), K.galv, 0, 1.25, 0);
  const face = letterFace(b, 0.76, 0.76, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      ctx.lineTo(w / 2 + Math.cos(a) * w * 0.5, h / 2 + Math.sin(a) * h * 0.5);
    }
    ctx.fill();
    ctx.fillStyle = '#c4161c';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      ctx.lineTo(w / 2 + Math.cos(a) * w * 0.46, h / 2 + Math.sin(a) * h * 0.46);
    }
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, 'STOP', 'sans', w * 0.74, h * 0.34);
    ctx.fillText('STOP', w / 2, h / 2);
  }, 0.03);
  g.add(placed(face, 0, 2.3, 0.03));
  return g;
}

function busStop(b: WorldBuilder, x: number, z: number, rot: number, name: string, R: () => number): void {
  const g = new THREE.Group();
  part(g, BX(4.2, 0.08, 1.6), K.darkSteel, 0, 2.6, 0);
  for (const s of [-1, 1]) part(g, BX(0.08, 2.6, 0.08), K.darkSteel, s * 2, 1.3, -0.7);
  part(g, BX(4.0, 2.2, 0.04), mat(0x9fc3d6, 0.1, 0.2, { transparent: true, opacity: 0.35 }), 0, 1.4, -0.72);
  g.add(placed(letters(b, 'RTC', 0.9, 0.3, { style: 'sans', fill: '#ffffff', bg: '#c8102e' }), -1.4, 2.4, 0.82));
  g.add(placed(letters(b, name, 2.4, 0.22, { style: 'sans', fill: '#ffffff', bg: '#1d2b3a' }), 0.6, 2.42, 0.82));
  g.add(bench().translateZ(-0.2));
  b.add(g, x, 0, z, rot);
  b.crowd.tourists.push({ pts: [[x - 1.5, z], [x + 1.5, z]], prop: R() < 0.5 ? 'bag' : 'none' });
}

// ---------------------------------------------------------------- Wynn Golf Club (north side of Sands)
function buildGolfClub(b: WorldBuilder, sands: Line, R: () => number): void {
  const m = M!;
  // the club's ground: everything north of Sands' north sidewalk, from the Palazzo garage's end to the edge
  const edge: V2[] = [];
  for (let d = 70; d <= nearestD(sands, BAY.x1, SANDS_Z); d += 4) {
    const { p, n } = lineAt(sands, d);
    edge.push([p[0] - n[0] * (SANDS_HALF + 4), p[1] - n[1] * (SANDS_HALF + 4)]);
  }
  const poly: V2[] = [[edge[0][0], BAY.z0], [BAY.x1, BAY.z0], [BAY.x1, edge[edge.length - 1][1]], ...[...edge].reverse()];
  layer(m.turf, flatShape(poly, 0.01));
  // wall + oleander hedge along the sidewalk, pines and palms behind
  const wallLine = makeLine(edge);
  b.add(new THREE.Mesh(wallStrip(wallLine, -0.6, 0, 1.6, 0, wallLine.len, 0.4), mat(0xcdb894, 0.85)));
  b.add(new THREE.Mesh(wallStrip(wallLine, -0.6, 1.6, 1.72, 0, wallLine.len, 0.55), mat(0xe2d4b8, 0.8)));
  for (let d = 0; d < wallLine.len; d += 6) {
    const { p, n } = lineAt(wallLine, d);
    const o = oleander(R, R() < 0.3);
    o.position.set(p[0] - n[0] * 2.2, 0, p[1] - n[1] * 2.2);
    o.scale.setScalar(1.3 + R() * 0.3);
    b.add(o);
  }
  // colliders: the wall, in short pieces
  for (let d = 0; d < wallLine.len; d += 6) {
    const a = lineAt(wallLine, d).p;
    const c = lineAt(wallLine, d + 6).p;
    b.collider(Math.min(a[0], c[0]) - 0.4, Math.max(a[0], c[0]) + 0.4, Math.min(a[1], c[1]) - 0.4, Math.max(a[1], c[1]) + 0.4, 0, 1.7, true);
  }
  // Aleppo pines (two stacked cones on a trunk) and date palms over the hedge
  const trunk = mat(0x5a4636, 0.9);
  const needles = [mat(0x2f4a2c, 0.9), mat(0x3a5532, 0.9)];
  const pine = (x: number, z: number, h: number) => {
    const g = new THREE.Group();
    part(g, CY(0.22, 0.32, h * 0.55, 6), trunk, 0, h * 0.275, 0, 0, 0, 0, true);
    const k = Math.floor(R() * 2);
    part(g, new THREE.ConeGeometry(h * 0.32, h * 0.5, 7), needles[k], 0, h * 0.62, 0, R() * 3, 0, 0, true);
    part(g, new THREE.ConeGeometry(h * 0.24, h * 0.38, 7), needles[1 - k], 0, h * 0.88, 0, R() * 3, 0, 0, true);
    b.add(g, x, 0, z);
  };
  for (let d = 4; d < wallLine.len; d += 13) {
    const { p, n } = lineAt(wallLine, d);
    const back = 7 + R() * 6;
    if (R() < 0.6) pine(p[0] - n[0] * back, p[1] - n[1] * back, 10 + R() * 5);
    else b.add(palmTree(11 + R() * 3, false, Math.floor(d) + 7), p[0] - n[0] * back, 0, p[1] - n[1] * back);
  }
  // a fairway's worth of trees further in, a lake, a cart path
  for (let i = 0; i < 16; i++) pine(215 + R() * 120, -405 + R() * 70, 9 + R() * 6);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 28), mat(0x2f6f86, 0.08, 0.3, { emissive: 0x0b2a36, emissiveIntensity: 0.4 }));
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(22, 12, 1);
  lake.position.set(275, 0.025, -385);
  b.add(lake);
  b.waterZones.push({ name: 'Wynn Golf Club lake', minX: 255, maxX: 295, minZ: -395, maxZ: -375, y: 0.05 });
  layer(m.walk, worldPlane(70, 2.4, 262, 0.02, -360, 8, 8));
  // the club's monument sign at the Manhattan corner
  const mono = new THREE.Group();
  part(mono, BX(7, 1.6, 0.9), mat(0x3a2a20, 0.6, 0.2), 0, 0.8, 0);
  mono.add(placed(letters(b, 'Wynn GOLF CLUB', 6.4, 1.1, { style: 'script', fill: 'bronze', edge: '#2a1a10', sub: 'LAS VEGAS', subFill: '#d9c39a' }), 0, 0.85, 0.46));
  b.add(mono, MAN_X - 4, 0, SANDS_Z - SANDS_HALF - 8, 0);
  b.collider(MAN_X - 7.5, MAN_X - 0.5, SANDS_Z - SANDS_HALF - 8.45, SANDS_Z - SANDS_HALF - 7.55, 0, 1.6, true);
  b.zone('Wynn Golf Club', 128, BAY.x1, BAY.z0, -300);
  b.feature({ kind: 'park', x: 270, z: -360, w: 150, d: 120, color: '#3d6a35', label: 'Wynn Golf Club' });
}

// ---------------------------------------------------------------- the Venetian Expo
function buildExpo(b: WorldBuilder, sands: Line, R: () => number): void {
  const m = M!;
  const X0 = 142;
  const X1 = 176;
  const Z1 = -240;
  const H = 16;
  // north face follows the Sands curve, 4 m back from the curb
  const north: V2[] = [];
  for (let x = X0; x <= X1 + 0.01; x += 3) north.push([x, edgeZ(sands, SANDS_HALF + 4, x)]);
  const outline: V2[] = [...north, [X1, Z1], [X0, Z1]];
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false, curveSegments: 1 });
  // side walls: v = height in metres, upright (the generator counts it down from the top)
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const euv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < euv.count; i++) if (Math.abs(nrm.getZ(i)) < 0.5) euv.setY(i, 1 - euv.getY(i));
  geo.rotateX(-Math.PI / 2); // shape y (= −z) → world −z…; extrusion → +y
  const hall = new THREE.Mesh(geo, [mat(0x8f8a80, 0.9), m.expo]);
  hall.castShadow = true;
  hall.receiveShadow = true;
  b.add(hall);
  // colliders: slices following the curve
  for (let i = 0; i < north.length - 1; i++) b.collider(north[i][0], north[i + 1][0], Math.max(north[i][1], north[i + 1][1]), Z1, 0, H, true);
  // rooftop air handlers and exhaust stacks (the real hall's roof is a field of them)
  for (let i = 0; i < 9; i++) {
    const x = X0 + 5 + (i % 3) * 11 + R() * 3;
    const z = -262 - Math.floor(i / 3) * 24 - R() * 4;
    if (z < edgeZ(sands, SANDS_HALF + 8, x)) continue;
    b.add(mesh(BX(5 + R() * 3, 1.8, 3), mat(0xb9bcc0, 0.5, 0.4)), x, H + 0.9, z);
    b.add(mesh(CY(0.5, 0.5, 1.2, 10), K.galv), x + 3.5, H + 0.6, z);
  }
  // glass lobby on the Koval corner with a canopy and the name
  const lz0 = edgeZ(sands, SANDS_HALF + 4, X1) + 1;
  const lz1 = lz0 + 20;
  b.box(X1 - 3, 0, (lz0 + lz1) / 2, 8, 11, lz1 - lz0, m.glassLobby, true);
  b.add(mesh(BX(10, 0.5, lz1 - lz0 + 4), mat(0xe8e2d6, 0.5, 0.2)), X1 + 1, 11.2, (lz0 + lz1) / 2);
  b.add(mesh(BX(4, 0.25, lz1 - lz0 - 4), K.darkSteel), X1 + 2.6, 4.2, (lz0 + lz1) / 2);
  for (const z of [lz0 + 3, lz1 - 3]) b.add(mesh(CY(0.15, 0.15, 4.2, 8), K.darkSteel), X1 + 4.3, 2.1, z);
  b.add(placed(letters(b, 'VENETIAN EXPO', 15, 1.9, { style: 'roman', fill: '#f4ead4', edge: '#3a2a1a' }), X1 + 1.02, 13.6, (lz0 + lz1) / 2, Math.PI / 2));
  // the name again on the curved Sands face, square to the wall
  {
    const d = nearestD(sands, 157, edgeZ(sands, SANDS_HALF, 157)) ;
    const { p, n } = lineAt(sands, d);
    const o = SANDS_HALF + 4 - 0.6;
    b.add(placed(letters(b, 'VENETIAN EXPO', 18, 2.2, { style: 'roman', fill: '#f4ead4', edge: '#3a2a1a' }), p[0] + n[0] * o, 12.6, p[1] + n[1] * o, Math.atan2(-n[0], -n[1])));
  }
  b.add(placed(letters(b, 'THE VENETIAN RESORT • LAS VEGAS', 7.6, 0.55, { style: 'roman', fill: 'gold' }), X1 + 1.06, 9.8, (lz0 + lz1) / 2, Math.PI / 2));
  // receiving docks on the south side, under the bridge, trucks backed in
  loadingDock(b, 144, 172, Z1, Z1 + 2, '+z', 6, [0, 2, 3, 5], R);
  for (let i = 0; i < 3; i++) b.add(dumpster([0x2a5a3a, 0x2a4a8a, 0x5a5a5a][i]), 132 - i * 0.1, 0, -250 + i * 2.1, Math.PI / 2);
  b.add(transformerBox(), 131.5, 0, -262);
  // cab and rideshare stands on the Koval apron (the Expo's real one is on the west side; this is its curb)
  for (let z = -276; z < -244; z += 8) {
    const lp = lotLight(b);
    lp.position.set(X1 + 2.6, 0, z);
    b.add(lp);
  }
  b.zone('Venetian Expo', X0, X1 + 5, edgeZ(sands, SANDS_HALF + 4, (X0 + X1) / 2), Z1 + 10);
  b.building((X0 + X1) / 2, (Z1 - 300) / 2, X1 - X0, Z1 + 300, '#d6c19e', 'Venetian Expo');
}

// ---------------------------------------------------------------- the footbridge over Koval
function buildBridge(b: WorldBuilder): void {
  // eastSide.ts carries the deck to x 151; this carries it over Koval Ln to the Sphere landing (sphere.ts, x CX−30)
  const x0 = 151;
  const x1 = CX - 30;
  const deck = mat(0xb8b2a8, 0.7, 0.15);
  b.box((x0 + x1) / 2, BRIDGE.y, (BRIDGE.z0 + BRIDGE.z1) / 2, x1 - x0, 0.4, BRIDGE.z1 - BRIDGE.z0, deck);
  // the real bridge's white box girder with a violet LED strip along both fascias
  b.add(mesh(BX(x1 - x0, 1.0, BRIDGE.z1 - BRIDGE.z0 + 0.6), mat(0xe9e9e6, 0.5, 0.1)), (x0 + x1) / 2, BRIDGE.y - 0.5, (BRIDGE.z0 + BRIDGE.z1) / 2);
  for (const z of [BRIDGE.z0 - 0.32, BRIDGE.z1 + 0.32]) b.add(mesh(BX(x1 - x0, 0.12, 0.05), M!.ledViolet), (x0 + x1) / 2, BRIDGE.y - 0.75, z);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.3 });
  for (const s of [-1, 1]) b.box((x0 + x1) / 2, BRIDGE.y + 0.4, -230 + s * 1.7, x1 - x0, 1.1, 0.12, glass, true, false);
  // piers: both sides of Koval and between the Venetian and the Expo
  for (const x of [100, 126, 152, 178, 194]) b.box(x, 0, -230, 1.2, BRIDGE.y - 1.0, 1.2, mat(0xdcdad4, 0.6), true);
  // clearance sign over Koval
  b.add(placed(letters(b, 'CLEARANCE 14\'-6"', 3, 0.45, { style: 'road', fill: '#111111', bg: '#f2c230' }), KOVAL_X, BRIDGE.y - 1.25, BRIDGE.z1 + 0.34));
  b.add(placed(letters(b, 'SPHERE  ◀  THE VENETIAN', 5, 0.55, { style: 'sans', fill: '#ffffff', bg: '#141820' }), KOVAL_X, BRIDGE.y - 0.5, BRIDGE.z1 + 0.33));
  b.zone('Venetian ↔ Sphere Footbridge', x0, x1, -232, -228);
  b.feature({ kind: 'plaza', x: (83 + x1) / 2, z: -230, w: x1 - 83, d: 3.6, color: '#d8d0c0', label: 'Footbridge' });
}

// ---------------------------------------------------------------- the Sphere's own site
function buildSphereSite(b: WorldBuilder, R: () => number): void {
  const m = M!;
  const cars = new CarLot();
  // ---- Wynn's employee garage between Koval and the Sphere (real: 4–8 decks, open sides; Wynn | Encore team members)
  deckGarage(b, cars, KOVAL_X + 9, CX - 25, SANDS_Z + SANDS_HALF + 4.5, -239.5, 4, 'WYNN | ENCORE', 'TEAM MEMBER PARKING', R);
  // ---- West VIP entry on Sands: a black canopy, a gate, a red carpet strip, two hosts
  const vx = CX - 6;
  const vz = SANDS_Z + SANDS_HALF + 4.5;
  b.add(mesh(BX(9, 0.3, 4.2), m.blackSteel), vx, 3.6, vz + 2.1);
  for (const s of [-1, 1]) b.add(mesh(CY(0.12, 0.12, 3.6, 8), m.blackSteel), vx + s * 4.2, 1.8, vz + 4);
  b.add(mesh(BX(8.6, 0.06, 0.06), m.ledViolet), vx, 3.42, vz + 4.21);
  b.add(placed(letters(b, 'SPHERE  VIP ENTRY', 7, 0.6, { style: 'thin', fill: '#ffffff', bg: '#05060a', spacing: 0.2 }), vx, 4.15, vz - 0.06, Math.PI));
  layer(mat(0x5a1622, 0.8), worldPlane(2.2, 9, vx, 0.03, vz + 5, 4, 4));
  // ---- black steel perimeter fence with gates: Sands frontage and the Manhattan side
  blackFence(b, [[CX - 24.5, vz], [vx - 4.6, vz]]);
  blackFence(b, [[vx + 4.6, vz], [MAN_X - MINOR_HALF - 4.5, vz]]);
  // landscaping strip between the fence and the Sphere: desert beds, palms in lit planters
  layer(m.dg, worldPlane(MAN_X - CX - 32, 7, (CX + 22 + MAN_X - 10) / 2, 0.02, vz + 4, 8, 8));
  for (let x = CX + 6; x < MAN_X - 14; x += 9) {
    b.add(palmTree(8 + R() * 2.5, false, Math.floor(x)), x, 0, vz + 4.5);
    lightPool(b, x, vz + 4.5, 5);
  }

  // ---- the east Plaza Entry (real: "Follow directions to the Plaza Entry on the East side of the building")
  const ex = CX + 26;
  layer(mat(0x2b2d33, 0.5, 0.1), worldPlane(20, 64, ex + 9, 0.014, CZ + 2, 6, 6));
  const ring = mesh(new THREE.RingGeometry(33.6, 33.8, 64, 1, -0.75, 1.5), m.ledViolet);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(CX, 0.03, CZ);
  b.add(ring);
  // entrance pavilion: a glass box against the base with a cantilevered white canopy and the word SPHERE
  b.box(ex - 2.5, 0, CZ, 6, 4.6, 16, m.glassLobby, true);
  for (let z = -8; z <= 8; z += 2) b.add(mesh(BX(0.12, 4.6, 0.1), K.darkSteel), ex + 0.52, 2.3, CZ + z);
  b.add(mesh(BX(0.14, 0.14, 16), K.darkSteel), ex + 0.52, 3.3, CZ);
  b.add(mesh(BX(12, 0.5, 22), mat(0xeceef2, 0.35, 0.2)), ex + 1.5, 4.85, CZ);
  b.add(mesh(BX(0.06, 0.32, 22), m.ledViolet), ex + 7.53, 4.85, CZ);
  for (const z of [-8, 8]) b.add(mesh(CY(0.14, 0.18, 4.6, 8), K.darkSteel), ex + 6.5, 2.3, CZ + z);
  b.add(placed(letters(b, 'SPHERE', 9, 1.5, { style: 'thin', fill: '#ffffff', spacing: 0.35 }), ex + 7.6, 6.1, CZ, Math.PI / 2));
  b.add(placed(letters(b, 'PLAZA ENTRY', 6, 0.5, { style: 'thin', fill: '#d9c8ff', spacing: 0.3 }), ex + 0.55, 3.6, CZ, Math.PI / 2));
  // security: white screening tents with walk-through magnetometers, stanchion lanes, staff
  for (const z of [-14, 14]) {
    const t = new THREE.Group();
    part(t, BX(6, 0.08, 6), m.tentWhite, 0, 3.1, 0);
    part(t, new THREE.ConeGeometry(4.3, 1.4, 4), m.tentWhite, 0, 3.8, 0, Math.PI / 4);
    for (const sx of [-2.9, 2.9]) for (const sz of [-2.9, 2.9]) part(t, CY(0.05, 0.05, 3.1, 6), K.galv, sx, 1.55, sz);
    for (const dz of [-1.4, 1.4]) {
      part(t, BX(0.2, 2.2, 0.15), mat(0x3a3d44, 0.5, 0.3), 0, 1.1, dz - 0.5);
      part(t, BX(0.2, 2.2, 0.15), mat(0x3a3d44, 0.5, 0.3), 0, 1.1, dz + 0.5);
      part(t, BX(0.2, 0.2, 1.15), mat(0x3a3d44, 0.5, 0.3), 0, 2.2, dz);
    }
    part(t, BX(0.7, 0.85, 2.0), mat(0x1c1e22, 0.6), -1.6, 0.42, 0);
    b.add(t, ex + 14, 0, CZ + z);
    b.collider(ex + 13.8, ex + 14.2, CZ + z - 3, CZ + z + 3, 0, 2.2, true);
  }
  for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) {
    const x = ex + 18 + i * 1.8;
    const z = CZ - 6 + k * 4;
    const p = mesh(CY(0.04, 0.05, 0.95, 6), mat(0xc9ccd2, 0.25, 0.85), x, 0.475, z);
    p.userData.clutter = true;
    b.add(p);
    if (i < 5) {
      const bl = mesh(BX(1.8, 0.06, 0.02), mat(0x5b2a8a, 0.6), x + 0.9, 0.88, z);
      bl.userData.clutter = true;
      b.add(bl);
    }
  }
  // the line of guests heading in, and staff in the tents
  b.crowd.tourists.push(
    { pts: [[ex + 30, CZ - 4], [ex + 19, CZ - 4], [ex + 8, CZ - 2]], prop: 'camera' },
    { pts: [[ex + 30, CZ], [ex + 19, CZ], [ex + 8, CZ + 1]], prop: 'bag' },
    { pts: [[MAN_X - 14, -175], [ex + 24, CZ + 18], [ex + 10, CZ + 6]], prop: 'yard-drink' },
    { pts: [[ex + 9, CZ - 7], [ex + 26, -262], [MAN_X - 16, -262]], prop: 'bag' },
    { pts: [[ex + 14, CZ - 12], [ex + 14, CZ - 16]], prop: 'none' }
  );

  // ---- Lot A: between the Sphere and Manhattan St (the real "Sphere Parking Lot A")
  const ax0 = ex + 28;
  const ax1 = MAN_X - MINOR_HALF - 4.5;
  const az0 = -262;
  const az1 = -201;
  surfaceLotI(b, cars, ax0, ax1, az0, az1, R, 0.72);
  lotSign(b, ax0 + 1, az1 + 1.2, 0, 'SPHERE', 'PARKING  LOT A', '#b07dff');
  b.add(payStation(), ax1 - 2, 0, az1 - 2);
  b.zone('Sphere Parking Lot A', ax0, ax1, az0, az1);
  b.zone('Sphere Plaza Entry', CX + 22, ax0, az0, az1 + 4);
  b.feature({ kind: 'road', x: (ax0 + ax1) / 2, z: (az0 + az1) / 2, w: ax1 - ax0, d: az1 - az0, color: '#4a4a52', label: 'Lot A' });

  // ---- rideshare pick-up / drop-off at Manhattan & Westchester (the real one)
  const rx0 = CX + 22;
  const rx1 = MAN_X - MINOR_HALF - 4.5;
  const rz0 = -197;
  const rz1 = WEST_Z - MINOR_HALF - 3.5;
  layer(parkingLotMaterial(), worldPlane(rx1 - rx0, rz1 - rz0, (rx0 + rx1) / 2, 0.027, (rz0 + rz1) / 2, 10.8, 11, rx0, rz0));
  // two loading lanes with an island and shade canopies, queued cars, waiting guests
  b.add(mesh(BX(rx1 - rx0 - 12, 0.18, 2.4), K.concrete), (rx0 + rx1) / 2, 0.09, (rz0 + rz1) / 2);
  for (let x = rx0 + 9; x < rx1 - 6; x += 9) {
    const c = new THREE.Group();
    part(c, BX(7.5, 0.18, 3.4), m.blackSteel, 0, 3.4, 0);
    part(c, BX(7.6, 0.06, 3.5), mat(0xe9e9e4, 0.6), 0, 3.52, 0); // white roof membrane
    part(c, BX(7.3, 0.04, 3.2), lampGlow(b), 0, 3.29, 0);
    part(c, CY(0.1, 0.1, 3.4, 8), m.blackSteel, 0, 1.7, 0);
    b.add(c, x, 0, (rz0 + rz1) / 2);
    lightPool(b, x, (rz0 + rz1) / 2, 8);
  }
  const lane0 = (rz0 + rz1) / 2 - 4;
  const lane1 = (rz0 + rz1) / 2 + 4;
  for (let i = 0; i < 6; i++) {
    const x = rx1 - 6 - i * 6.2;
    if (R() < 0.85) cars.add(x, 0, lane0, -Math.PI / 2, 100 + i * 7);
    if (R() < 0.65) cars.add(x - 2, 0, lane1, -Math.PI / 2, 201 + i * 11);
  }
  for (const [x, z, r] of [
    [rx0 + 3, rz0 - 0.8, 0],
    [rx1 - 1.5, rz1 + 0.8, Math.PI],
  ] as Array<[number, number, number]>) b.add(rideshareBoard(b), x, 0, z, r);
  b.crowd.tourists.push(
    { pts: [[rx0 + 10, (rz0 + rz1) / 2 + 0.3], [rx1 - 10, (rz0 + rz1) / 2 + 0.3]], prop: 'bag' },
    { pts: [[rx1 - 14, (rz0 + rz1) / 2 - 0.4], [rx0 + 14, (rz0 + rz1) / 2 - 0.4]], prop: 'camera' }
  );
  b.zone('Sphere Rideshare (Manhattan St & Westchester Dr)', rx0, rx1, rz0, rz1);
  b.feature({ kind: 'road', x: (rx0 + rx1) / 2, z: (rz0 + rz1) / 2, w: rx1 - rx0, d: rz1 - rz0, color: '#4a4a52', label: 'Rideshare' });

  // ---- service yard behind black gates on Westchester: the Sphere's outbuilding, generators, show trucks
  const sx0 = KOVAL_X + 9;
  const sx1 = rx0 - 2;
  const sz0 = CZ + 41;
  const sz1 = WEST_Z - MINOR_HALF - 3.5;
  layer(parkingLotMaterial(), worldPlane(sx1 - sx0, sz1 - sz0, (sx0 + sx1) / 2, 0.026, (sz0 + sz1) / 2, 10.8, 11, sx0, sz0));
  b.box(CX + 8, 0, sz1 - 9, 22, 7.5, 13, mat(0x3a3d44, 0.7, 0.2), true);
  b.add(mesh(BX(22.4, 0.5, 13.4), mat(0x22252a, 0.6, 0.3)), CX + 8, 7.75, sz1 - 9);
  for (let i = 0; i < 4; i++) b.add(mesh(BX(3, 3.2, 0.1), K.galv), CX + 0.5 + i * 5, 1.6, sz1 - 2.45);
  for (let i = 0; i < 6; i++) b.add(mesh(BX(2.4, 0.9, 0.08), K.steel), CX - 1 + i * 3.6, 5.6, sz1 - 2.46); // louvres
  for (let i = 0; i < 3; i++) b.add(mesh(BX(3.2, 1.6, 2.4), mat(0xb9bcc0, 0.5, 0.4)), CX + 2 + i * 6, 8.8, sz1 - 10);
  b.add(placed(letters(b, 'SPHERE ENTERTAINMENT CO.', 9, 0.5, { style: 'thin', fill: '#ffffff', spacing: 0.25 }), CX + 8, 6.6, sz1 - 2.43));
  for (const [x, z] of [[CX - 2.6, sz1 - 2.3], [CX + 18.6, sz1 - 2.3]]) b.add(mesh(BX(0.4, 0.25, 0.3), lampGlow(b)), x, 4.2, z);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    part(g, BX(2.4, 2.6, 6), mat(0xd8d6cf, 0.6, 0.2), 0, 1.5, 0, 0, 0, 0, true);
    part(g, BX(2.42, 0.4, 6.02), K.green, 0, 0.5, 0);
    part(g, CY(0.2, 0.2, 1.2, 8), K.darkSteel, 0.6, 3.4, -2);
    b.add(g, sx0 + 4 + i * 3.6, 0, sz0 + 7);
    b.collider(sx0 + 2.8 + i * 3.6, sx0 + 5.2 + i * 3.6, sz0 + 4, sz0 + 10, 0, 2.8, true);
  }
  for (let i = 0; i < 2; i++) {
    const t = boxTruck(0x16171b, 0x6a3cc8);
    t.position.set(CX - 22 + i * 5, 0, sz1 - 8);
    b.add(t);
    b.collider(CX - 23.3 + i * 5, CX - 20.7 + i * 5, sz1 - 13, sz1 - 3, 0, 3.9, true);
  }
  b.add(transformerBox(), sx0 + 2, 0, sz1 - 3);
  for (let i = 0; i < 3; i++) b.add(jersey(), CX - 12 + i * 3.1, 0, sz0 + 1, Math.PI / 2);
  blackFence(b, [[sx0, sz1], [CX - 6, sz1]]);
  blackFence(b, [[CX + 6, sz1], [sx1, sz1]]);
  // the black gates (rolling, parked open a crack) and the guard booth
  for (const s of [-1, 1]) b.add(mesh(BX(5.6, 2.6, 0.12), m.blackSteel), CX + s * 3.2, 1.3, sz1 + 0.1);
  b.box(CX + 8.5 - 15, 0, sz1 - 2.5, 2.4, 2.8, 2.4, mat(0xe6e4de, 0.6), true);
  b.add(mesh(BX(2.5, 0.12, 2.5), m.blackSteel), CX + 8.5 - 15, 2.86, sz1 - 2.5);
  b.add(placed(letters(b, 'SPHERE • DELIVERIES & CREW • CHECKPOINT', 6, 0.35, { style: 'sans', fill: '#ffffff', bg: '#05060a' }), CX, 2.85, sz1 + 0.2));
  b.zone('Sphere Service Yard', sx0, sx1, sz0, sz1);

  // ---- Sphere's surface lot south of Westchester (OSM: a big lot between Koval and the timeshare resort)
  surfaceLotI(b, cars, KOVAL_X + 12, MAN_X - MINOR_HALF - 26, WEST_Z + MINOR_HALF + 4, -120, R, 0.6);
  lotSign(b, KOVAL_X + 13, WEST_Z + MINOR_HALF + 4.5, 0, 'SPHERE', 'EVENT PARKING  LOT D', '#b07dff');
  b.zone('Sphere Event Parking', KOVAL_X + 12, MAN_X - 32, WEST_Z + MINOR_HALF + 4, -120);

  cars.flush(b);
  // plaza ground under the whole site so nothing shows the desert through the gaps
  layer(m.base, worldPlane(MAN_X - MINOR_HALF - (KOVAL_X + 4.8) - 4, WEST_Z - MINOR_HALF - (SANDS_Z + SANDS_HALF) - 3.5, (MAN_X - MINOR_HALF + KOVAL_X + 4.8) / 2 - 2, 0.008, (WEST_Z - MINOR_HALF + SANDS_Z + SANDS_HALF - 3.5) / 2 + 2, 8, 8));
}

/** Open-sided parking deck: slabs, columns, spandrel faces, a ramp, lit decks, instanced cars, a crown sign. */
function deckGarage(b: WorldBuilder, cars: CarLot, x0: number, x1: number, z0: number, z1: number, levels: number, title: string, sub: string, R: () => number): void {
  const H = 3.2;
  const top = levels * H;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  // the four faces with the deck texture (u, v in metres)
  const face = (fw: number) => {
    const g = new THREE.PlaneGeometry(fw, top + 1.1);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * fw, uv.getY(i) * (top + 1.1));
    return g;
  };
  for (const [px, pz, ry, fw] of [
    [cx, z0, Math.PI, w],
    [cx, z1, 0, w],
    [x0, cz, -Math.PI / 2, d],
    [x1, cz, Math.PI / 2, d],
  ] as Array<[number, number, number, number]>) {
    const f = new THREE.Mesh(face(fw), M!.garage);
    f.position.set(px, (top + 1.1) / 2, pz);
    f.rotation.y = ry;
    b.add(f);
  }
  // decks you can stand on (roof) + slabs, columns
  for (let k = 1; k <= levels; k++) b.box(cx, k * H - 0.3, cz, w - 0.2, 0.3, d - 0.2, K.concrete);
  b.box(cx, top, cz, w, 1.1, 0.25, K.concreteDark, true);
  b.collider(x0, x1, z0, z1, 0, top - 0.3, true);
  // roof: lot lights, parked cars, stair tower with the sign
  for (const [lx, lz] of [
    [x0 + 3, z0 + 4],
    [x1 - 3, z1 - 4],
  ]) {
    const l = lotLight(b);
    l.position.set(lx, top, lz);
    b.add(l);
  }
  for (let k = 0; k <= levels; k++) {
    for (let z = z0 + 3; z < z1 - 2; z += 2.7) {
      for (const [x, r] of [
        [x0 + 3, Math.PI / 2],
        [x1 - 3, -Math.PI / 2],
      ] as Array<[number, number]>) if (R() < (k === levels ? 0.45 : 0.8)) cars.add(x, k * H + 0.02, z, r, Math.floor(x * 7 + z * 3 + k * 13));
    }
  }
  b.box(x1 - 2.4, 0, z0 + 2.4, 4.8, top + 3.4, 4.8, mat(0xd2ccbf, 0.8), true);
  b.add(placed(letters(b, title, 4.4, 0.9, { style: 'sans', fill: '#ffffff', bg: '#1a1a1e', sub, subFill: '#d9c39a' }), x1 - 2.4, top + 1.6, z0 - 0.02, Math.PI));
  b.zone(`${title} ${sub}`.replace('|', '•'), x0, x1, z0, z1);
  b.building(cx, cz, w, d, '#9a958c', title === 'HUGHES CENTER' ? 'Hughes Center Garage' : 'Wynn Employee Garage');
}

/** Surface lot: stalls in double rows (instanced cars), lot lights with pools, landscaped end islands. */
function surfaceLotI(b: WorldBuilder, cars: CarLot, x0: number, x1: number, z0: number, z1: number, R: () => number, fill: number): void {
  layer(parkingLotMaterial(), worldPlane(x1 - x0, z1 - z0, (x0 + x1) / 2, 0.028, (z0 + z1) / 2, 10.8, 11, x0, z0));
  for (let z = z0 + 2.75; z < z1 - 2; z += 11) {
    for (const [dz, r] of [
      [0, Math.PI],
      [5.5, 0],
    ] as Array<[number, number]>) {
      if (z + dz > z1 - 2) continue;
      for (let x = x0 + 1.35; x < x1 - 1; x += 2.7) {
        if (R() > fill) continue;
        cars.add(x, 0, z + dz, r + (R() - 0.5) * 0.08, Math.floor(x * 5 + z * 3));
      }
    }
  }
  for (let x = x0 + 10; x < x1 - 4; x += 22) {
    for (let z = z0 + 8.25; z < z1 - 4; z += 22) {
      const l = lotLight(b);
      l.position.set(x, 0, z);
      b.add(l);
      b.collider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0, 10, true);
      lightPool(b, x, z, 15);
    }
  }
}

function lotSign(b: WorldBuilder, x: number, z: number, rot: number, title: string, sub: string, accent: string): void {
  const g = new THREE.Group();
  part(g, BX(0.2, 3.2, 0.2), K.darkSteel, -1.4, 1.6, 0);
  part(g, BX(0.2, 3.2, 0.2), K.darkSteel, 1.4, 1.6, 0);
  g.add(
    placed(
      letterFace(b, 3.2, 1.5, (ctx, w, h) => {
        ctx.fillStyle = '#07080c';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = accent;
        ctx.fillRect(0, h * 0.62, w, h * 0.04);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        fitFont(ctx, title, 'thin', w * 0.8, h * 0.42, 0.3);
        ctx.fillText(title, w / 2, h * 0.34);
        fitFont(ctx, sub, 'sans', w * 0.86, h * 0.2, 0.1);
        ctx.fillText(sub, w / 2, h * 0.82);
      }, 0.12),
      0,
      2.5,
      0
    )
  );
  b.add(g, x, 0, z, rot);
}

function payStation(): THREE.Group {
  const g = new THREE.Group();
  part(g, BX(0.6, 1.6, 0.5), mat(0x1d2128, 0.5, 0.4), 0, 0.8, 0);
  part(g, BX(0.4, 0.3, 0.02), mat(0x5ab4ff, 0.3, 0, { emissive: 0x2a7ad8, emissiveIntensity: 0.6 }), 0, 1.25, 0.26);
  return g;
}

function rideshareBoard(b: WorldBuilder): THREE.Group {
  const g = new THREE.Group();
  part(g, CY(0.06, 0.06, 3.2, 8), K.darkSteel, 0, 1.6, 0);
  g.add(
    placed(
      letterFace(b, 2.2, 1.3, (ctx, w, h) => {
        ctx.fillStyle = '#07080c';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#b07dff';
        ctx.fillRect(0, 0, w, h * 0.06);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        fitFont(ctx, 'RIDESHARE', 'sans', w * 0.86, h * 0.26, 0.12);
        ctx.fillText('RIDESHARE', w / 2, h * 0.3);
        fitFont(ctx, 'PICK UP • DROP OFF', 'sans', w * 0.86, h * 0.14, 0.08);
        ctx.fillText('PICK UP • DROP OFF', w / 2, h * 0.56);
        ctx.fillStyle = '#d9c8ff';
        fitFont(ctx, 'UBER • LYFT • WAYMO', 'sans', w * 0.8, h * 0.13, 0.08);
        ctx.fillText('UBER • LYFT • WAYMO', w / 2, h * 0.8);
      }, 0.1),
      0,
      2.8,
      0
    )
  );
  return g;
}

function blackFence(b: WorldBuilder, pts: V2[]): void {
  const m = M!.blackSteel;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [cx, cz] = pts[i + 1];
    const len = Math.hypot(cx - ax, cz - az);
    const ry = -Math.atan2(cz - az, cx - ax);
    const mx = (ax + cx) / 2;
    const mz = (az + cz) / 2;
    const rail = (y: number, h: number) => {
      const r = mesh(BX(len, h, 0.06), m, mx, y, mz);
      r.rotation.y = ry;
      r.userData.clutter = true;
      b.add(r);
    };
    rail(0.15, 0.08);
    rail(2.2, 0.08);
    // pickets as a see-through slatted panel: thin boxes every 0.5 m merged by the bake
    const n = Math.floor(len / 0.5);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const p = mesh(BX(0.04, 2.2, 0.04), m, ax + (cx - ax) * t, 1.15, az + (cz - az) * t);
      p.userData.clutter = true;
      b.add(p);
    }
    b.collider(Math.min(ax, cx) - 0.1, Math.max(ax, cx) + 0.1, Math.min(az, cz) - 0.1, Math.max(az, cz) + 0.1, 0, 2.2, true);
  }
}

// ---------------------------------------------------------------- south: the Desert Club Resort
function buildSouth(b: WorldBuilder, R: () => number): void {
  const m = M!;
  const z0 = -116;
  const z1 = BAY.z1 - 2;
  layer(m.dgBase, worldPlane(MAN_X - MINOR_HALF - (KOVAL_X + 5), z1 - (WEST_Z + MINOR_HALF), (MAN_X - MINOR_HALF + KOVAL_X + 5) / 2, 0.006, (z1 + WEST_Z + MINOR_HALF) / 2, 8, 8));
  // three-storey stucco blocks round a pool court (the real resort is ~20 of them on Koval)
  const blocks: Array<[number, number, number, number]> = [
    [200, 226, z0, z0 + 8],
    [232, 262, z0, z0 + 8],
    [200, 208, z0 + 14, z1 - 6],
    [270, 280, z0 + 2, z1 - 6],
    [216, 262, z1 - 14, z1 - 6],
  ];
  for (const [x0, x1, a, c] of blocks) {
    const w = x1 - x0;
    const d = c - a;
    const g = new THREE.BoxGeometry(w, 9, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const side = Math.abs(nrm.getX(i)) > 0.5 ? d : w;
      uv.setXY(i, uv.getX(i) * side, uv.getY(i) * 9);
    }
    const me = new THREE.Mesh(g, m.resort);
    me.position.set((x0 + x1) / 2, 4.5, (a + c) / 2);
    me.castShadow = true;
    me.receiveShadow = true;
    b.add(me);
    b.collider(x0, x1, a, c, 0, 9, true);
    // terracotta tile roof
    const roof = mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2, 2.4, 4), mat(0xa4553a, 0.85), (x0 + x1) / 2, 10.2, (a + c) / 2);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(w / Math.hypot(w, d) * 1.414, 1, d / Math.hypot(w, d) * 1.414);
    b.add(roof);
  }
  // pool court
  const pool = mesh(BX(16, 0.1, 7), K.water, 238, 0.06, z0 + 24);
  b.add(pool);
  b.add(mesh(BX(17, 0.12, 8), K.coping), 238, 0.03, z0 + 24);
  b.waterZones.push({ name: 'Desert Club pool', minX: 230, maxX: 246, minZ: z0 + 20.5, maxZ: z0 + 27.5, y: 0.05 });
  for (let i = 0; i < 8; i++) b.add(palmTree(7 + R() * 3, false, 300 + i), 214 + (i % 4) * 14, 0, z0 + 14 + Math.floor(i / 4) * 22);
  for (let i = 0; i < 6; i++) b.add(bench(), 226 + i * 4, 0, z0 + 31, Math.PI);
  // the sign on Westchester / Koval
  const sg = new THREE.Group();
  part(sg, BX(6, 2.0, 0.8), mat(0xd9b48c, 0.85), 0, 1.0, 0);
  sg.add(placed(letters(b, 'Holiday Inn Club Vacations', 5.4, 0.9, { style: 'sans', fill: '#1d6a3a', bg: '#f3eee4', sub: 'LAS VEGAS DESERT CLUB RESORT', subFill: '#7a4a2a' }), 0, 1.1, 0.42));
  b.add(sg, 214, 0, WEST_Z + MINOR_HALF + 2.2);
  b.zone('Las Vegas Desert Club Resort', KOVAL_X + 5, MAN_X - 6, z0 - 2, z1);
  b.feature({ kind: 'building', x: 240, z: (z0 + z1) / 2, w: 80, d: z1 - z0, color: '#d9b48c', label: 'Desert Club Resort' });
  b.crowd.tourists.push({ pts: [[212, z0 + 12], [262, z0 + 12], [262, z0 + 36]], prop: 'yard-drink' });
}

// ---------------------------------------------------------------- east: Hughes Center
function buildEast(b: WorldBuilder, R: () => number): void {
  const cars = new CarLot();
  // the Hughes Center garage east of Manhattan (OSM: a long multi-storey deck along Manhattan St)
  deckGarage(b, cars, MAN_X + MINOR_HALF + 4.5, BAY.x1 - 3, SANDS_Z + SANDS_HALF + 8, -150, 5, 'HUGHES CENTER', 'PUBLIC PARKING', R);
  cars.flush(b);
  layer(M!.base, worldPlane(BAY.x1 - (MAN_X + MINOR_HALF + 4), BAY.z1 - (SANDS_Z + SANDS_HALF + 4), (BAY.x1 + MAN_X + MINOR_HALF + 4) / 2, 0.008, (BAY.z1 + SANDS_Z + SANDS_HALF + 4) / 2, 8, 8));
  // office towers beyond the edge (Wells Fargo Tower, 3800 Howard Hughes Pkwy and their neighbours) — looks only
  const glassA = { wall: '#5f6f7e', mullion: '#c9d2da', glass: '#24384a', lit: '#e8f0ff', cols: 10, rows: 18, style: 2 as const, seed: 811 };
  const glassB = { wall: '#b9ab94', mullion: '#e0d6c4', glass: '#3a4048', lit: '#ffe6c0', cols: 8, rows: 14, style: 0 as const, seed: 813 };
  tower(b, { x: 395, z: -205, w: 26, d: 20, h: 40, facade: glassA, collide: false, cast: false, crownGlow: 0.6 });
  tower(b, { x: 380, z: -120, w: 22, d: 22, h: 26, facade: glassB, collide: false, cast: false, crownGlow: 0.3 });
  tower(b, { x: 420, z: -300, w: 30, d: 18, h: 22, facade: glassB, collide: false, cast: false, crownGlow: 0.3 });
  b.add(placed(letters(b, 'WELLS FARGO', 12, 1.6, { style: 'sans', fill: '#ffd24a' }), 381.9, 36, -205, -Math.PI / 2));
  for (let i = 0; i < 8; i++) b.add(palmTree(9 + R() * 3, false, 500 + i), BAY.x1 + 8 + (i % 2) * 5, 0, -260 + i * 26);
  b.zone('Hughes Center', MAN_X + MINOR_HALF, BAY.x1, SANDS_Z + SANDS_HALF, BAY.z1);
}

// ---------------------------------------------------------------- the bay's edges
function buildEdges(b: WorldBuilder): void {
  const edgeMat = mat(0x6b5a46, 0.95);
  const { x0, x1, z0, z1 } = BAY;
  b.box((x0 + x1) / 2, 0, z0, x1 - x0, 0.8, 1.2, edgeMat, false, false);
  b.box((x0 + x1) / 2, 0, z1, x1 - x0, 0.8, 1.2, edgeMat, false, false);
  b.box(x1, 0, (z0 + z1) / 2, 1.2, 0.8, z1 - z0, edgeMat, false, false);
  b.collider(x0, x1 + 50, z0 - 50, z0 + 0.6, 0, 60, true);
  b.collider(x0, x1 + 50, z1 - 0.6, z1 + 50, 0, 60, true);
  b.collider(x1 - 0.6, x1 + 50, z0, z1, 0, 60, true);
  // the roads run on past the edge (looks only)
  layer(M!.collector, ribbon(makeLine([[MAN_X, BAY.z1], [MAN_X, 60]]), () => -MINOR_HALF, () => MINOR_HALF, 0.03, MINOR_HALF * 2, 16));
  void trashCan;
  void chainFence;
}
