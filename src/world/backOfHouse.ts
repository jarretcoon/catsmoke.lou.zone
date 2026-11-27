import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from './builder';
import { stairs } from './buildings';
import { ashUrn, bench, desertPlantKit, mat, palmTree } from './props';
import { asphaltMaterial, lightPoolMaterial, litterGeometry, litterMaterial, parkingLotMaterial, registerStreetTick, roadStripGeometry, serviceRoadMaterial, signGeometry, signMaterial, worldPlane } from './streetTextures';
import { rng } from './textures';

/**
 * Back of house: what's behind the resorts on the real Strip.
 * - West: Frank Sinatra Dr between the resorts and the I-15 sound wall; Caesars' self-park garage and
 *   loading docks off the Forum Shops; Garden of the Gods pools; Hard Rock (ex-Mirage) chiller yard and docks;
 *   TI's back lot; the NYNY/Park MGM garage; surface lots behind Cosmopolitan.
 * - East: Koval Ln along the back edge; Linq Ln behind the LINQ/Flamingo with the LINQ garage and docks;
 *   Audrie St behind Paris/Horseshoe with a central-plant cooling yard and employee lot; Planet Hollywood's
 *   garage and a fenced development lot; MGM's pool complex; Venetian/Palazzo receiving.
 * Everything is plain shared materials (folded into the static bake), plus one glow, one sign atlas,
 * one chain-link and one water material.
 */

// ---------------------------------------------------------------- geometry + material kit
const geoCache = new Map<string, THREE.BufferGeometry>();
export const BX = (w: number, h: number, d: number): THREE.BufferGeometry => {
  const k = `b${w}|${h}|${d}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  return g;
};
export const CY = (rt: number, rb: number, h: number, seg = 8): THREE.BufferGeometry => {
  const k = `c${rt}|${rb}|${h}|${seg}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new THREE.CylinderGeometry(rt, rb, h, seg)));
  return g;
};
const IC = (r: number, detail = 0): THREE.BufferGeometry => {
  const k = `i${r}|${detail}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new THREE.IcosahedronGeometry(r, detail)));
  return g;
};

/** Add a mesh part to a group (or the builder root) at a local position/rotation. */
export function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, cast = false): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.rotation.set(rx, ry, rz);
  me.castShadow = cast;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}
function clutter<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) c.userData.clutter = true;
  });
  return o;
}

export const K = {
  concrete: mat(0xa9a398, 0.9),
  apron: mat(0x8f8b84, 0.92),
  deckUnder: mat(0x9c978e, 0.9),
  concreteDark: mat(0x8e8a82, 0.9),
  stucco: mat(0xcfc4b0, 0.85),
  steel: mat(0x7a7f86, 0.45, 0.6),
  galv: mat(0xa9aeb4, 0.42, 0.55),
  darkSteel: mat(0x2e3238, 0.5, 0.5),
  rubber: mat(0x16171a, 0.9),
  yellow: mat(0xe8b923, 0.6),
  red: mat(0xb8302a, 0.6),
  white: mat(0xeeece6, 0.6),
  glass: mat(0x1c2630, 0.12, 0.35),
  wood: mat(0x5e4630, 0.9),
  pallet: mat(0xb08a58, 0.9),
  wrap: mat(0xd8dade, 0.4),
  pipeBlue: mat(0x4f7598, 0.55, 0.3),
  pipeGreen: mat(0x4f7a52, 0.55, 0.3),
  green: mat(0x3e6a48, 0.6, 0.2),
  fabric: mat(0x24402e, 0.95),
  curbRed: mat(0xb8342c, 0.7),
  sand: mat(0xc9b48a, 0.95),
  gravel: mat(0x8c7a62, 0.95),
  turf: mat(0x5d7d3e, 0.95),
  leaf: mat(0x355e34, 0.85),
  leafDark: mat(0x2a4a2c, 0.85),
  bloomPink: mat(0xf07aa6, 0.7),
  bloomWhite: mat(0xf4efe8, 0.7),
  travertine: mat(0xe2d6c0, 0.8),
  coping: mat(0xf2ede2, 0.7),
  canvasWhite: mat(0xf7f4ec, 0.85, 0, { side: THREE.DoubleSide }),
  canvasStripe: mat(0xd8a43a, 0.85, 0, { side: THREE.DoubleSide }),
  water: mat(0x2bb6d9, 0.05, 0.2, { emissive: 0x0b4a66, emissiveIntensity: 0.5 }),
};

let glowMat: THREE.MeshStandardMaterial | null = null;
/** Warm lamp glass (wall packs, lot heads, dock lights, garage tubes): one night-glowing material. */
export function lampGlow(b: WorldBuilder): THREE.MeshStandardMaterial {
  if (glowMat) return glowMat;
  glowMat = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 0.1, roughness: 0.3 }), 0.08, 2.6);
  return glowMat;
}
let signGlowRegistered = false;
export function signs(b: WorldBuilder): THREE.MeshStandardMaterial {
  const m = signMaterial();
  if (!signGlowRegistered) {
    b.nightGlow(m, 0.3, 0.9); // shop fascias and shelter posters: bright, but no bloom halo up close
    signGlowRegistered = true;
  }
  return m;
}

let chainTex: THREE.CanvasTexture | null = null;
let chainMat: THREE.MeshStandardMaterial | null = null;
function chainLinkMaterial(): THREE.MeshStandardMaterial {
  if (chainMat) return chainMat;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(190,196,204,1)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, 32);
  ctx.lineTo(32, 0);
  ctx.lineTo(64, 32);
  ctx.lineTo(32, 64);
  ctx.closePath();
  ctx.stroke();
  chainTex = new THREE.CanvasTexture(c);
  chainTex.colorSpace = THREE.SRGBColorSpace;
  chainTex.wrapS = chainTex.wrapT = THREE.RepeatWrapping;
  chainMat = new THREE.MeshStandardMaterial({ map: chainTex, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 });
  return chainMat;
}

// ---------------------------------------------------------------- vehicles (low-poly, static)
// What's actually parked in a Vegas garage: lots of white, black and silver, a few colours.
const CAR_COLORS = [0xd9dadc, 0x1b1d21, 0x8d9197, 0xe6e6e2, 0x24272c, 0x5d6168, 0x2c4a7c, 0x9a1a1e, 0xb4b7bb, 0x3d4148, 0x6e5a48, 0x1f3d2c, 0xcfd0d2, 0x15161a];

/**
 * Side-profile extrusions so a parked car has a hood, a raked windshield, a roof and a trunk instead of
 * stacked boxes: a painted lower body with a slightly narrower glass greenhouse on top (tumblehome),
 * a thin painted roof skin, wheels and lamps. ~200 tris; shapes are cached and shared.
 */
type CarShape = { body: THREE.BufferGeometry; cabin: THREE.BufferGeometry; roof: [number, number, number, number]; L: number; bed?: number };
const carShapes = new Map<number, CarShape>();
function extrudeSide(pts: Array<[number, number]>, width: number): THREE.BufferGeometry {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2); // profile x → world z (front at +z), extrusion → world x
  geo.computeVertexNormals();
  return geo;
}
function carShape(kind: number): CarShape {
  let c = carShapes.get(kind);
  if (c) return c;
  if (kind === 3) {
    // SUV: tall, boxy, glass runs nearly to the tail
    const L = 4.8;
    c = {
      L,
      body: extrudeSide([[-2.4, 0.36], [2.4, 0.36], [2.4, 0.86], [2.25, 1.04], [1.25, 1.14], [-2.3, 1.16], [-2.4, 1.0]], 1.86),
      cabin: extrudeSide([[1.2, 1.13], [0.55, 1.7], [-2.05, 1.72], [-2.28, 1.15]], 1.68),
      roof: [1.56, 0.05, 2.5, -0.75],
    };
  } else if (kind === 4) {
    // Pickup: tall hood, short cab, open bed behind
    const L = 5.4;
    c = {
      L,
      bed: -1.55,
      body: extrudeSide([[-2.7, 0.38], [2.7, 0.38], [2.7, 0.9], [2.5, 1.08], [1.35, 1.12], [-2.7, 1.12]], 1.84),
      cabin: extrudeSide([[1.3, 1.1], [0.75, 1.68], [-0.35, 1.68], [-0.4, 1.1]], 1.7),
      roof: [1.58, 0.05, 1.0, 0.18],
    };
  } else {
    // Sedan: low hood, raked glass, short trunk deck
    const L = 4.5;
    c = {
      L,
      body: extrudeSide([[-2.25, 0.3], [2.25, 0.3], [2.25, 0.7], [2.02, 0.84], [0.95, 0.93], [-1.55, 0.97], [-2.18, 0.92], [-2.25, 0.74]], 1.8),
      cabin: extrudeSide([[0.94, 0.92], [0.22, 1.4], [-0.82, 1.4], [-1.52, 0.96]], 1.6),
      roof: [1.48, 0.05, 1.0, -0.3],
    };
  }
  carShapes.set(kind, c);
  return c;
}

/** Parked car facing +z: shaped body, glass greenhouse, roof skin, wheels, lamps (unlit). */
export function parkedCar(seed: number): THREE.Group {
  const g = new THREE.Group();
  // Seeds come from world coordinates and go negative on the west side: wrap them, or every car is white.
  const n = Math.abs(Math.floor(seed));
  const kind = n % 5; // 0-2 sedan, 3 suv, 4 pickup
  // Satin clearcoat, not chrome: a glossy metal box mirrors the whole bright desert sky and reads as white.
  const col = mat(CAR_COLORS[(n * 7 + (n >> 3)) % CAR_COLORS.length], 0.42, 0.3);
  const s = carShape(kind);
  part(g, s.body, col, 0, 0, 0);
  part(g, s.cabin, K.glass, 0, 0, 0);
  const [rw, rh, rl, rz] = s.roof;
  const roofY = kind === 3 ? 1.72 : kind === 4 ? 1.68 : 1.4;
  part(g, BX(rw, rh, rl), col, 0, roofY + rh / 2, rz);
  if (s.bed !== undefined) part(g, BX(1.6, 0.06, 2.0), K.darkSteel, 0, 1.08, s.bed); // bed floor seen over the sides
  const L = s.L;
  for (const sx of [-0.86, 0.86])
    for (const sz of [-L * 0.31, L * 0.31]) part(g, CY(0.34, 0.34, 0.24, 8), K.rubber, sx, 0.34, sz, 0, 0, Math.PI / 2);
  for (const sx of [-0.6, 0.6]) {
    part(g, BX(0.42, 0.11, 0.05), K.white, sx, 0.66, L / 2 + 0.01);
    part(g, BX(0.36, 0.13, 0.05), K.red, sx, kind < 3 ? 0.62 : 0.9, -L / 2 - 0.01);
  }
  part(g, BX(1.1, 0.16, 0.04), K.darkSteel, 0, 0.5, L / 2 + 0.01); // grille
  return clutter(g);
}

/** Box truck facing +z (cab forward), rear roll-up door at −z. `color` paints the box. */
export function boxTruck(color = 0xdcdad4, stripe = 0xd8352b): THREE.Group {
  const g = new THREE.Group();
  const box = mat(color, 0.55, 0.1);
  part(g, BX(2.5, 2.8, 6.2), box, 0, 2.55, -0.9, 0, 0, 0, true);
  part(g, BX(2.52, 0.35, 6.22), mat(stripe, 0.5), 0, 1.75, -0.9);
  // rear door + latch + bumper
  part(g, BX(2.3, 2.5, 0.05), K.galv, 0, 2.45, -4.02);
  for (let y = 1.5; y < 3.7; y += 0.42) part(g, BX(2.3, 0.04, 0.06), K.steel, 0, y, -4.04);
  part(g, BX(2.4, 0.22, 0.4), K.darkSteel, 0, 0.95, -4.15);
  part(g, BX(2.2, 0.08, 0.6), K.darkSteel, 0, 0.62, -4.3); // lift gate
  // chassis + cab
  part(g, BX(1.3, 0.35, 7.6), K.darkSteel, 0, 0.82, -0.3);
  part(g, BX(2.36, 1.75, 2.1), mat(0xd8d6d0, 0.4, 0.2), 0, 1.85, 3.25, 0, 0, 0, true);
  part(g, BX(2.3, 0.85, 0.06), K.glass, 0, 2.3, 4.31);
  part(g, BX(2.36, 0.9, 1.0), mat(0xd8d6d0, 0.4, 0.2), 0, 1.2, 4.55);
  part(g, BX(2.4, 0.3, 0.2), K.darkSteel, 0, 0.75, 5.1);
  for (const sx of [-1.0, 1.0]) {
    for (const sz of [3.7, -2.4, -3.3]) part(g, CY(0.48, 0.48, 0.34, 8), K.rubber, sx, 0.48, sz, 0, 0, Math.PI / 2);
    part(g, BX(0.06, 0.25, 0.2), K.darkSteel, sx * 1.25, 2.4, 4.1); // mirrors
  }
  return g;
}

// ---------------------------------------------------------------- BOH props
export function dumpster(color: number): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color, 0.7, 0.3);
  part(g, BX(2.0, 1.2, 1.5), m, 0, 0.75, 0, 0, 0, 0, true);
  part(g, BX(2.02, 0.12, 0.8), K.rubber, 0, 1.42, -0.34, 0, 0.12);
  part(g, BX(2.02, 0.12, 0.8), K.rubber, 0, 1.38, 0.38, 0, -0.08);
  for (const s of [-1, 1]) part(g, BX(0.14, 0.18, 1.3), m, s * 1.07, 1.05, 0);
  for (const sx of [-0.8, 0.8]) for (const sz of [-0.55, 0.55]) part(g, CY(0.08, 0.08, 0.15, 6), K.rubber, sx, 0.08, sz);
  return clutter(g);
}
function compactor(): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0x3f5a78, 0.6, 0.35);
  part(g, BX(2.4, 2.0, 5.0), m, 0, 1.15, 0, 0, 0, 0, true);
  part(g, BX(2.2, 0.15, 5.0), K.darkSteel, 0, 0.1, 0);
  part(g, BX(1.4, 1.2, 1.4), K.galv, 0.0, 0.8, 3.3); // power unit
  part(g, BX(2.0, 1.6, 1.0), m, 0, 1.6, -2.9); // charge box to the wall
  part(g, BX(0.6, 0.4, 0.06), K.yellow, 0, 1.6, 2.52);
  return g;
}
function palletStack(R: () => number): THREE.Group {
  const g = new THREE.Group();
  const n = 1 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) part(g, BX(1.2, 0.14, 1.0), K.pallet, (R() - 0.5) * 0.08, 0.07 + i * 0.15, 0, (R() - 0.5) * 0.1);
  if (R() < 0.5) part(g, BX(1.1, 0.9, 0.95), R() < 0.5 ? K.wrap : mat(0xb08a58, 0.8), 0, n * 0.15 + 0.45, 0);
  return clutter(g);
}
/** Field-erected cooling tower: galvanised casing, louvred sides, fan stacks on top. `cells` along x. */
function coolingTower(cells: number): THREE.Group {
  const g = new THREE.Group();
  const w = cells * 4.2;
  part(g, BX(w, 4.6, 4.6), K.galv, 0, 2.3, 0, 0, 0, 0, true);
  for (const s of [-1, 1]) for (let y = 0.6; y < 3.0; y += 0.32) part(g, BX(w - 0.3, 0.12, 0.08), K.darkSteel, 0, y, s * 2.33);
  for (let i = 0; i < cells; i++) {
    const x = -w / 2 + 2.1 + i * 4.2;
    part(g, CY(1.75, 1.85, 1.2, 14), K.galv, x, 5.2, 0);
    part(g, CY(1.65, 1.65, 0.05, 14), K.darkSteel, x, 5.82, 0);
    part(g, BX(3.2, 0.06, 0.12), K.steel, x, 5.86, 0, i * 0.7);
  }
  // basin + risers
  part(g, BX(w + 0.4, 0.5, 5.0), K.concreteDark, 0, 0.25, 0);
  for (let i = 0; i < cells; i++) part(g, CY(0.22, 0.22, 4.2, 8), K.pipeBlue, -w / 2 + 2.1 + i * 4.2, 2.6, -2.75);
  return g;
}
function chiller(): THREE.Group {
  const g = new THREE.Group();
  part(g, BX(2.2, 2.0, 5.6), mat(0xc8ccd0, 0.5, 0.4), 0, 1.0, 0, 0, 0, 0, true);
  for (let i = 0; i < 3; i++) {
    part(g, CY(0.8, 0.8, 0.3, 12), K.darkSteel, 0, 2.15, -1.8 + i * 1.8);
    part(g, BX(1.3, 0.04, 0.1), K.steel, 0, 2.32, -1.8 + i * 1.8, i);
  }
  for (let y = 0.3; y < 1.8; y += 0.22) part(g, BX(2.22, 0.05, 5.3), K.steel, 0, y, 0);
  return g;
}
export function transformerBox(): THREE.Group {
  const g = new THREE.Group();
  part(g, BX(1.8, 1.4, 1.6), K.green, 0, 0.75, 0, 0, 0, 0, true);
  part(g, BX(2.0, 0.1, 1.8), K.concrete, 0, 0.05, 0);
  for (let i = 0; i < 5; i++) part(g, BX(0.05, 1.0, 0.3), K.green, -0.92, 0.75, -0.6 + i * 0.3);
  part(g, BX(0.4, 0.25, 0.02), K.yellow, 0, 1.0, 0.81);
  return clutter(g);
}
function bollardY(): THREE.Group {
  const g = new THREE.Group();
  part(g, CY(0.12, 0.12, 1.0, 8), K.yellow, 0, 0.5, 0);
  return clutter(g);
}
export function jersey(): THREE.Group {
  const g = new THREE.Group();
  part(g, BX(0.6, 0.35, 3.0), K.concrete, 0, 0.18, 0);
  part(g, BX(0.25, 0.5, 3.0), K.concrete, 0, 0.6, 0);
  return clutter(g);
}
/** Cobra-head street light facing +x (arm reaches over the road). */
export function cobraLight(b: WorldBuilder): THREE.Group {
  const g = new THREE.Group();
  part(g, CY(0.1, 0.16, 9, 8), K.galv, 0, 4.5, 0);
  part(g, BX(2.6, 0.1, 0.1), K.galv, 1.3, 8.8, 0);
  part(g, BX(0.8, 0.22, 0.4), K.galv, 2.7, 8.75, 0);
  part(g, BX(0.6, 0.05, 0.3), lampGlow(b), 2.7, 8.62, 0);
  return g;
}
/** Parking-lot pole with two shoebox heads. */
export function lotLight(b: WorldBuilder): THREE.Group {
  const g = new THREE.Group();
  part(g, BX(0.6, 0.6, 0.6), K.concrete, 0, 0.3, 0);
  part(g, CY(0.09, 0.13, 9.4, 8), K.darkSteel, 0, 5.3, 0);
  for (const s of [-1, 1]) {
    part(g, BX(0.9, 0.08, 0.08), K.darkSteel, s * 0.45, 9.9, 0);
    part(g, BX(0.8, 0.22, 0.55), K.darkSteel, s * 1.0, 9.85, 0);
    part(g, BX(0.66, 0.04, 0.42), lampGlow(b), s * 1.0, 9.73, 0);
  }
  return g;
}
export function lightPool(b: WorldBuilder, x: number, z: number, s = 10, y = 0.07): void {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s), lightPoolMaterial());
  p.rotation.x = -Math.PI / 2;
  p.position.set(x, y, z);
  p.renderOrder = 1;
  p.userData.clutter = true;
  b.add(p);
}
/** Oleander shrub: green mounds dotted with pink or white blooms. */
export function oleander(R: () => number, white = false): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const a = R() * Math.PI * 2;
    const r = 0.6 + R() * 0.5;
    const m = part(g, IC(r, 0), i % 2 ? K.leaf : K.leafDark, Math.cos(a) * 0.7, 0.9 + R() * 0.7, Math.sin(a) * 0.7, R() * 3);
    m.scale.set(1, 1.3, 1);
  }
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2;
    part(g, IC(0.13, 0), white ? K.bloomWhite : K.bloomPink, Math.cos(a) * 1.05, 0.8 + R() * 1.4, Math.sin(a) * 1.05);
  }
  return clutter(g);
}
/** Chain-link fence run (axis-aligned) with posts, top rail and the shared mesh material. */
export function chainFence(b: WorldBuilder, x0: number, z0: number, x1: number, z1: number, h = 2.4): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const panel = new THREE.PlaneGeometry(len, h);
  const uv = panel.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 7, uv.getY(i) * h * 7);
  const pm = new THREE.Mesh(panel, chainLinkMaterial());
  pm.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
  pm.rotation.y = alongX ? 0 : Math.PI / 2;
  pm.userData.clutter = true;
  b.add(pm);
  const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const post = new THREE.Mesh(CY(0.04, 0.04, h + 0.1, 6), K.galv);
    post.position.set(x0 + (x1 - x0) * t, (h + 0.1) / 2, z0 + (z1 - z0) * t);
    post.userData.clutter = true;
    b.add(post);
  }
  const rail = new THREE.Mesh(BX(alongX ? len : 0.05, 0.05, alongX ? 0.05 : len), K.galv);
  rail.position.set((x0 + x1) / 2, h, (z0 + z1) / 2);
  rail.userData.clutter = true;
  b.add(rail);
  b.collider(Math.min(x0, x1) - (alongX ? 0 : 0.1), Math.max(x0, x1) + (alongX ? 0 : 0.1), Math.min(z0, z1) - (alongX ? 0.1 : 0), Math.max(z0, z1) + (alongX ? 0.1 : 0), 0, h, true);
}
/** Construction fence: posts and an opaque green privacy screen, with a few poster boards. */
function constructionFence(b: WorldBuilder, x0: number, z0: number, x1: number, z1: number, h = 2.6): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const scr = new THREE.Mesh(BX(alongX ? len : 0.06, h, alongX ? 0.06 : len), K.fabric);
  scr.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
  b.add(scr);
  const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const post = new THREE.Mesh(CY(0.05, 0.05, h + 0.2, 6), K.galv);
    post.position.set(x0 + (x1 - x0) * t, (h + 0.2) / 2, z0 + (z1 - z0) * t);
    post.userData.clutter = true;
    b.add(post);
  }
  b.collider(Math.min(x0, x1) - (alongX ? 0 : 0.1), Math.max(x0, x1) + (alongX ? 0 : 0.1), Math.min(z0, z1) - (alongX ? 0.1 : 0), Math.max(z0, z1) + (alongX ? 0.1 : 0), 0, h, true);
}
/** Wooden utility poles with crossarms and sagging three-wire spans, from (x,z0) to (x,z1). */
function utilityLine(b: WorldBuilder, x: number, z0: number, z1: number, span = 32): void {
  const zs: number[] = [];
  for (let z = z0; z <= z1 + 0.1; z += span) zs.push(z);
  const wire = K.rubber;
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    const g = new THREE.Group();
    part(g, CY(0.13, 0.17, 11, 7), K.wood, 0, 5.5, 0);
    part(g, BX(2.4, 0.12, 0.12), K.wood, 0, 10.2, 0);
    for (const s of [-1, 0, 1]) part(g, CY(0.05, 0.06, 0.2, 6), mat(0x6a8a5a, 0.4), s * 1.0, 10.38, 0);
    if (i % 3 === 1) part(g, CY(0.35, 0.35, 1.1, 8), K.galv, 0.35, 8.6, 0); // pole-top transformer can
    g.position.set(x, 0, z);
    b.add(g);
    b.collider(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 0, 11, true);
    if (i === 0) continue;
    const zPrev = zs[i - 1];
    for (const s of [-1, 0, 1]) {
      // 4-segment catenary approximation
      const sag = 0.9;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        pts.push(new THREE.Vector3(x + s * 1.0, 10.45 - sag * 4 * t * (1 - t), zPrev + (z - zPrev) * t));
      }
      for (let k = 0; k < 4; k++) {
        const a = pts[k];
        const c = pts[k + 1];
        const segLen = a.distanceTo(c);
        const m = new THREE.Mesh(BX(0.03, 0.03, segLen), wire);
        m.position.copy(a).add(c).multiplyScalar(0.5);
        m.rotation.x = Math.atan2(a.y - c.y, c.z - a.z) * -1;
        m.userData.clutter = true;
        b.add(m);
      }
    }
  }
}

// ---------------------------------------------------------------- roads
/** Ground layers (roads, asphalt, lots) are pre-merged map-wide: one draw call per material. */
const groundLayers = new Map<THREE.Material, THREE.BufferGeometry[]>();
function ground(m: THREE.Material, g: THREE.BufferGeometry): void {
  let l = groundLayers.get(m);
  if (!l) groundLayers.set(m, (l = []));
  l.push(g);
}
function flushGround(b: WorldBuilder): void {
  for (const [m, geos] of groundLayers) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const me = new THREE.Mesh(merged, m);
    me.receiveShadow = true;
    b.add(me);
  }
  groundLayers.clear();
}
function serviceRoad(b: WorldBuilder, x0: number, z0: number, x1: number, z1: number, label?: string): void {
  ground(serviceRoadMaterial(), roadStripGeometry(x0, z0, x1, z1, 0.031));
  const alongZ = Math.abs(z1 - z0) >= Math.abs(x1 - x0);
  const len = alongZ ? Math.abs(z1 - z0) : Math.abs(x1 - x0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  // curbs both sides
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(BX(alongZ ? 0.3 : len, 0.15, alongZ ? len : 0.3), K.concrete);
    c.position.set(alongZ ? cx + s * 4.65 : cx, 0.075, alongZ ? cz : cz + s * 4.65);
    c.userData.clutter = true;
    b.add(c);
  }
  b.feature({ kind: 'road', x: cx, z: cz, w: alongZ ? 9 : len, d: alongZ ? len : 9, color: '#3b3a40', label });
}
/** Green street-name blade on a post. */
export function streetName(b: WorldBuilder, key: string, x: number, z: number, rotY: number): void {
  const g = new THREE.Group();
  part(g, CY(0.05, 0.05, 3.2, 6), K.galv, 0, 1.6, 0);
  part(g, signGeometry(key, 1.6, 0.24, 0.03), signs(b), 0, 3.0, 0);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  b.add(clutter(g));
}

// ---------------------------------------------------------------- buildings: docks, garages, BOH walls
/**
 * Loading-dock enclosure against a building face. `face` is the direction the doors look ('+x','-x','+z','-z');
 * (x0..x1, z0..z1) is the enclosure footprint. Trucks are backed into some of the doors.
 */
export function loadingDock(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, face: '+x' | '-x' | '+z' | '-z', doors: number, trucks: number[], R: () => number): void {
  const h = 5.4;
  b.box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, h, z1 - z0, K.stucco, true);
  b.add(new THREE.Mesh(BX(x1 - x0 + 0.3, 0.4, z1 - z0 + 0.3), K.concreteDark), (x0 + x1) / 2, h + 0.2, (z0 + z1) / 2);
  const alongX = face === '+z' || face === '-z';
  const sgn = face === '+x' || face === '+z' ? 1 : -1;
  const faceC = face === '+x' ? x1 : face === '-x' ? x0 : face === '+z' ? z1 : z0;
  const a0 = alongX ? x0 : z0;
  const a1 = alongX ? x1 : z1;
  const step = (a1 - a0) / doors;
  const rot = face === '+z' ? 0 : face === '-z' ? Math.PI : face === '+x' ? Math.PI / 2 : -Math.PI / 2;
  // dock apron: raised 1.2 m platform edge is implied by the bumpers; concrete apron on the ground
  const apronDepth = 10;
  const apron = new THREE.Mesh(BX(alongX ? a1 - a0 : apronDepth, 0.04, alongX ? apronDepth : a1 - a0), K.apron);
  apron.position.set(alongX ? (a0 + a1) / 2 : faceC + sgn * apronDepth / 2, 0.025, alongX ? faceC + sgn * apronDepth / 2 : (a0 + a1) / 2);
  b.add(apron);
  for (let i = 0; i < doors; i++) {
    const a = a0 + step * (i + 0.5);
    const g = new THREE.Group();
    // roll-up door (corrugation lines), frame, bumpers, dock light, number plate, leveler
    part(g, BX(3.0, 3.2, 0.08), K.galv, 0, 2.0, 0.04);
    for (let y = 0.7; y < 3.5; y += 0.28) part(g, BX(3.0, 0.03, 0.04), K.steel, 0, y, 0.1);
    part(g, BX(3.4, 0.25, 0.2), K.yellow, 0, 3.7, 0.1);
    for (const s of [-1, 1]) {
      part(g, BX(0.12, 3.6, 0.18), K.yellow, s * 1.62, 1.8, 0.1);
      part(g, BX(0.28, 0.5, 0.22), K.rubber, s * 1.35, 1.05, 0.15);
    }
    part(g, BX(2.6, 0.08, 0.5), K.steel, 0, 1.22, 0.3);
    part(g, BX(0.4, 0.22, 0.2), lampGlow(b), 1.9, 3.6, 0.2);
    part(g, BX(0.6, 0.3, 0.03), K.white, -1.9, 3.3, 0.12);
    // canopy over the bay
    part(g, BX(3.4, 0.12, 1.6), K.darkSteel, 0, 4.4, 0.8);
    if (alongX) g.position.set(a, 0, faceC);
    else g.position.set(faceC, 0, a);
    g.rotation.y = rot;
    b.add(clutter(g));
    if (trucks.includes(i)) {
      const t = boxTruck([0xdcdad4, 0xd4d2cc, 0x2a4a8a, 0xd8d0bc][Math.floor(R() * 4)], [0xd8352b, 0x1e8c5a, 0xf2c230, 0x2a66cc][Math.floor(R() * 4)]);
      const off = 4.2 + 0.25;
      if (alongX) t.position.set(a, 0, faceC + sgn * off);
      else t.position.set(faceC + sgn * off, 0, a);
      t.rotation.y = rot;
      b.add(t);
      const c = new THREE.Vector3(alongX ? a : faceC + sgn * (off + 0.7), 0, alongX ? faceC + sgn * (off + 0.7) : a);
      const hw = 1.3;
      const hl = 4.6;
      b.collider(c.x - (alongX ? hw : hl), c.x + (alongX ? hw : hl), c.z - (alongX ? hl : hw), c.z + (alongX ? hl : hw), 0, 3.95);
    }
  }
  // the sign over the docks
  const sg = new THREE.Mesh(signGeometry('dock', 7, 0.84, 0.1), signs(b));
  const mid = (a0 + a1) / 2;
  if (alongX) sg.position.set(mid, h - 0.6, faceC + sgn * 0.08);
  else sg.position.set(faceC + sgn * 0.08, h - 0.6, mid);
  sg.rotation.y = rot;
  b.add(sg);
  // pipes + vents along the top of the wall
  bohWallDressing(b, alongX, faceC + sgn * 0.12, a0 + 0.5, a1 - 0.5, h - 1.2, rot, R);
}

/** Pipes, conduit, vents and wall packs along a wall face (run from a0..a1 along the wall). */
function bohWallDressing(b: WorldBuilder, alongX: boolean, face: number, a0: number, a1: number, y: number, rot: number, R: () => number): void {
  const len = a1 - a0;
  const mid = (a0 + a1) / 2;
  const put = (geo: THREE.BufferGeometry, m: THREE.Material, along: number, yy: number, out: number, ry = 0, rx = 0, rz = 0) => {
    const me = new THREE.Mesh(geo, m);
    const n = rot === 0 ? [0, 1] : rot === Math.PI ? [0, -1] : rot > 0 ? [1, 0] : [-1, 0];
    if (alongX) me.position.set(along, yy, face + n[1] * out);
    else me.position.set(face + n[0] * out, yy, along);
    me.rotation.set(rx, ry, rz);
    me.userData.clutter = true;
    b.add(me);
  };
  // two horizontal pipe runs + a conduit bundle
  const pipeH = (r: number, m: THREE.Material, yy: number, out: number) => {
    const g = CY(r, r, len, 8);
    if (alongX) put(g, m, mid, yy, out, 0, 0, Math.PI / 2);
    else put(g, m, mid, yy, out, 0, Math.PI / 2, 0);
  };
  pipeH(0.16, K.pipeBlue, y, 0.3);
  pipeH(0.12, K.red, y + 0.45, 0.25);
  pipeH(0.05, K.galv, y - 0.4, 0.12);
  pipeH(0.05, K.galv, y - 0.52, 0.12);
  for (let a = a0 + 2; a < a1 - 1; a += 6 + R() * 4) {
    // vertical drops, louvred vent, electrical panel, wall pack
    put(CY(0.1, 0.1, y, 6), K.pipeBlue, a, y / 2, 0.3);
    put(BX(1.2, 0.8, 0.15), K.galv, a + 1.6, y - 1.4, 0.08);
    put(BX(0.7, 1.0, 0.25), mat(0x8a9096, 0.6, 0.3), a + 3.0, 1.5, 0.13);
    put(BX(0.3, 0.2, 0.2), lampGlow(lampHolder!), a + 2.2, 3.4, 0.12);
  }
}
let lampHolder: WorldBuilder | null = null;

/** Employee entrance: door, canopy, time-clock sign, card reader + the smoking area (bench, urns, smokers). */
export function employeeEntrance(b: WorldBuilder, x: number, z: number, rot: number, smokeDx: number, smokeDz: number): void {
  const g = new THREE.Group();
  part(g, BX(2.2, 2.6, 0.12), K.darkSteel, 0, 1.3, 0.06);
  part(g, BX(1.0, 2.3, 0.06), K.glass, -0.45, 1.2, 0.13);
  part(g, BX(1.0, 2.3, 0.06), K.glass, 0.55, 1.2, 0.13);
  part(g, BX(3.6, 0.15, 2.0), K.darkSteel, 0, 3.0, 1.0);
  part(g, signGeometry('employees', 3.2, 0.38, 0.06), signs(b), 0, 3.5, 0.1);
  part(g, BX(0.18, 0.3, 0.08), K.darkSteel, 1.4, 1.3, 0.12); // card reader
  part(g, BX(0.08, 0.08, 0.02), mat(0x30ff60, 0.4, 0, { emissive: 0x30ff60, emissiveIntensity: 0.25 }), 1.4, 1.36, 0.17);
  part(g, BX(0.5, 0.2, 0.2), lampGlow(b), 0, 2.85, 0.6);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  b.add(clutter(g));
  lightPool(b, x + Math.sin(rot) * 2, z + Math.cos(rot) * 2, 6);
  // smoking area: concrete pad, bench, two urns, a sign, butts on the ground, two smokers pacing
  const sx = x + smokeDx;
  const sz = z + smokeDz;
  const pad = new THREE.Mesh(BX(5, 0.05, 4), K.concrete);
  pad.position.set(sx, 0.03, sz);
  b.add(pad);
  b.add(bench(), sx - 1, 0, sz - 1.2, rot);
  b.add(bench(), sx + 1.4, 0, sz + 0.6, rot + Math.PI / 2);
  b.prop(ashUrn(), sx + 0.4, sz - 1.6, 0.24, 0.85, 'urn');
  b.prop(ashUrn(), sx - 2.0, sz + 1.2, 0.24, 0.85, 'urn');
  const sg = new THREE.Group();
  part(sg, CY(0.05, 0.05, 2.4, 6), K.galv, 0, 1.2, 0);
  part(sg, signGeometry('smoking', 1.6, 0.2, 0.03), signs(b), 0, 2.2, 0);
  sg.position.set(sx + 2.3, 0, sz - 1.8);
  sg.rotation.y = rot;
  b.add(clutter(sg));
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(litterGeometry(3 + i * 4, 1.2), litterMaterial());
    d.position.set(sx - 1 + i * 0.9, 0.065, sz + (i - 1) * 0.7);
    d.userData.clutter = true;
    b.add(d);
  }
  b.crowd.tourists.push({ pts: [[sx - 1.5, sz], [sx + 1.2, sz - 0.3]], prop: 'cig' }, { pts: [[sx + 0.5, sz + 1.0], [sx - 0.8, sz + 1.2], [sx, sz - 0.5]], prop: 'cig' });
  b.pickup(sx, 0.4, sz, 3, 'Break-Room Pack', false);
}

/** Open parking garage with walkable decks, alternating ramps, stair tower, cars, lights and signage. */
function parkingGarage(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, levels: number, label: string, signFace: '+x' | '-x' | '+z' | '-z', seed: number): void {
  const H = 3.2;
  const run = 16;
  const zA = z0 + 6;
  const R = rng(seed);
  const bayW: [number, number] = [x0 + 1, x0 + 5];
  const bayE: [number, number] = [x1 - 5, x1 - 1];
  const deckMat = K.concrete;
  const deck = (y: number, hole: [number, number] | null) => {
    const t = 0.3;
    if (!hole) {
      b.box((x0 + x1) / 2, y - t, (z0 + z1) / 2, x1 - x0, t, z1 - z0, deckMat);
      return;
    }
    b.box((x0 + x1) / 2, y - t, (z0 + zA) / 2, x1 - x0, t, zA - z0, deckMat);
    b.box((x0 + x1) / 2, y - t, (zA + run + z1) / 2, x1 - x0, t, z1 - zA - run, deckMat);
    if (hole[0] > x0) b.box((x0 + hole[0]) / 2, y - t, zA + run / 2, hole[0] - x0, t, run, deckMat);
    if (hole[1] < x1) b.box((hole[1] + x1) / 2, y - t, zA + run / 2, x1 - hole[1], t, run, deckMat);
  };
  // ground slab
  b.add(new THREE.Mesh(BX(x1 - x0, 0.06, z1 - z0), K.concreteDark), (x0 + x1) / 2, 0.03, (z0 + z1) / 2);
  const cars: Array<[number, number, number, number]> = [];
  for (let k = 0; k <= levels; k++) {
    const y = k * H;
    const bay = k % 2 === 1 ? bayW : bayE;
    if (k >= 1) deck(y, bay);
    if (k < levels) {
      const rb = (k + 1) % 2 === 1 ? bayW : bayE;
      stairs(b, (rb[0] + rb[1]) / 2, zA, '+z', 4, H, run, deckMat, y);
      // columns + ceiling tubes
      for (let x = x0 + 0.4; x <= x1 - 0.3; x += (x1 - x0 - 0.8) / Math.max(1, Math.round((x1 - x0) / 9))) {
        for (let z = z0 + 0.4; z <= z1 - 0.3; z += (z1 - z0 - 0.8) / Math.max(1, Math.round((z1 - z0) / 8))) {
          const c = new THREE.Mesh(BX(0.5, H - 0.3, 0.5), K.concrete);
          c.position.set(x, y + (H - 0.3) / 2, z);
          c.userData.clutter = true;
          b.add(c);
        }
      }
      if (k > 0 || levels > 0) {
        for (let x = x0 + 6; x < x1 - 5; x += 8) for (let z = z0 + 4; z < z1 - 3; z += 9) part(b.root, BX(1.2, 0.06, 0.14), lampGlow(b), x, y + H - 0.33, z);
      }
    }
    // perimeter parapets (low, walkable-over for a cat) on the decks
    if (k >= 1) {
      for (const [px, pz, w, d] of [
        [(x0 + x1) / 2, z0 + 0.1, x1 - x0, 0.2],
        [(x0 + x1) / 2, z1 - 0.1, x1 - x0, 0.2],
        [x0 + 0.1, (z0 + z1) / 2, 0.2, z1 - z0],
        [x1 - 0.1, (z0 + z1) / 2, 0.2, z1 - z0],
      ] as Array<[number, number, number, number]>) {
        const m = new THREE.Mesh(BX(w, 1.0, d), K.concreteDark);
        m.position.set(px, y + 0.5, pz);
        m.castShadow = true;
        m.userData.clutter = true;
        b.add(m);
      }
    }
    // parked cars: rows across x behind the ramps, and in the middle band between the ramp bays
    const rows = [zA + run + 3.2, z1 - 3.2, zA + 2.8, zA + run - 2.8];
    rows.forEach((rz, ri) => {
      if (rz > z1 - 2.5 || rz < z0 + 2.5) return;
      const xa = ri !== 1 ? x0 + 7 : x0 + 2;
      const xb = ri !== 1 ? x1 - 7 : x1 - 2;
      for (let x = xa + 1.35; x < xb - 1; x += 2.7) {
        if (R() < (k === levels ? 0.45 : 0.72)) cars.push([x, y, rz, ri % 2 === 0 ? 0 : Math.PI]);
      }
    });
  }
  let ci = seed;
  for (const [x, y, z, r] of cars) {
    const c = parkedCar(ci++);
    c.position.set(x, y, z);
    c.rotation.y = r + (R() - 0.5) * 0.06;
    b.add(c);
  }
  // roof: lot lights
  const top = levels * H;
  for (const [lx, lz] of [
    [x0 + 6, z0 + 6],
    [x1 - 6, z1 - 6],
    [x0 + 6, z1 - 6],
    [x1 - 6, z0 + 6],
  ]) {
    const l = lotLight(b);
    l.position.set(lx, top, lz);
    b.add(l);
  }
  // stair/elevator tower at the far corner
  const sx = x1 - 2.5;
  const sz = z1 + 2.4;
  b.box(sx, 0, sz, 4.6, top + 3.2, 4.4, K.stucco, true);
  b.add(new THREE.Mesh(BX(1.2, top + 1.5, 0.08), lampGlow(b)), sx, (top + 1.5) / 2 + 0.6, sz + 2.22);
  // walkable stair up the outside of the tower is the ramps; a sign on the street face
  const sign = new THREE.Mesh(signGeometry('garage', 6, 0.72, 0.12), signs(b));
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  if (signFace === '+x') sign.position.set(x1 + 0.15, top - 0.8, cz);
  else if (signFace === '-x') sign.position.set(x0 - 0.15, top - 0.8, cz);
  else if (signFace === '+z') sign.position.set(cx, top - 0.8, z1 + 0.15);
  else sign.position.set(cx, top - 0.8, z0 - 0.15);
  sign.rotation.y = signFace === '+x' ? Math.PI / 2 : signFace === '-x' ? -Math.PI / 2 : signFace === '+z' ? 0 : Math.PI;
  b.add(sign);
  // entrance arm gate + ticket booth at the ramp foot
  const gate = new THREE.Group();
  part(gate, BX(0.5, 1.1, 0.5), K.yellow, 0, 0.55, 0);
  part(gate, BX(3.4, 0.08, 0.08), mat(0xf2f2f0, 0.5), 1.8, 1.0, 0);
  gate.position.set(bayW[0] - 0.1, 0, zA - 1.5);
  b.add(clutter(gate));
  b.building(cx, cz, x1 - x0, z1 - z0, '#9a958c', label);
  b.zone(label, x0, x1, z0, z1 + 4.6);
  b.pickup(x0 + 3, top + 0.4, z1 - 3, 3, `${label} Roof Pack`, false);
}

/** Resort pool deck: pools, coping, loungers in rows, umbrellas, cabanas, palms, a bar hut. */
function poolDeck(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, pools: Array<[number, number, number, number]>, name: string, seed: number): void {
  const R = rng(seed);
  b.add(new THREE.Mesh(worldPlane(x1 - x0, z1 - z0, (x0 + x1) / 2, 0.045, (z0 + z1) / 2, 1, 1), K.travertine));
  for (const [px, pz, w, d] of pools) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), K.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(px, 0.07, pz);
    b.add(water);
    for (const [cx, cz, cw, cd] of [
      [px, pz - d / 2 - 0.3, w + 1.2, 0.6],
      [px, pz + d / 2 + 0.3, w + 1.2, 0.6],
      [px - w / 2 - 0.3, pz, 0.6, d],
      [px + w / 2 + 0.3, pz, 0.6, d],
    ]) {
      const c = new THREE.Mesh(BX(cw, 0.12, cd), K.coping);
      c.position.set(cx, 0.08, cz);
      c.userData.clutter = true;
      b.add(c);
    }
    b.waterZones.push({ name, minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2, y: 0.07 });
    // loungers along both long sides + umbrellas between
    for (const s of [-1, 1]) {
      for (let x = px - w / 2 + 1; x < px + w / 2 - 0.5; x += 1.5) {
        const l = new THREE.Group();
        part(l, BX(0.75, 0.12, 1.9), K.white, 0, 0.35, 0);
        part(l, BX(0.75, 0.1, 0.7), K.white, 0, 0.62, -0.95, 0, -0.75);
        part(l, BX(0.7, 0.05, 1.5), R() < 0.5 ? K.canvasStripe : mat(0x2a66cc, 0.8), 0, 0.43, 0.15);
        for (const lx of [-0.3, 0.3]) for (const lz of [-0.8, 0.8]) part(l, BX(0.05, 0.3, 0.05), K.steel, lx, 0.15, lz);
        l.position.set(x, 0, pz + s * (d / 2 + 2.2));
        l.rotation.y = s > 0 ? Math.PI : 0;
        b.add(clutter(l));
        if (Math.round((x - px) / 1.5) % 3 === 0) {
          const u = new THREE.Group();
          part(u, CY(0.04, 0.04, 2.5, 6), K.steel, 0, 1.25, 0);
          part(u, new THREE.ConeGeometry(1.4, 0.5, 8), R() < 0.5 ? K.canvasWhite : K.canvasStripe, 0, 2.55, 0);
          u.position.set(x + 0.75, 0, pz + s * (d / 2 + 3.6));
          b.add(clutter(u));
        }
      }
    }
  }
  // cabanas along the deck edge (posts, roof, curtains)
  for (let x = x0 + 3; x < x1 - 3; x += 5) {
    const c = new THREE.Group();
    for (const cx of [-1.6, 1.6]) for (const cz of [-1.4, 1.4]) part(c, BX(0.12, 2.6, 0.12), K.white, cx, 1.3, cz);
    part(c, BX(3.6, 0.2, 3.2), K.canvasWhite, 0, 2.7, 0);
    part(c, BX(3.4, 2.3, 0.05), K.canvasWhite, 0, 1.35, -1.45);
    part(c, BX(2.6, 0.4, 1.2), mat(0xe8dcc8, 0.9), 0, 0.3, -0.6);
    c.position.set(x, 0, z0 + 2);
    b.add(clutter(c));
  }
  // palms around the edges
  for (let i = 0; i < 6; i++) b.add(palmTree(7 + R() * 2, false, seed + i), i % 2 ? x1 - 1.2 : x0 + 1.2, 0, z0 + 6 + (i >> 1) * ((z1 - z0 - 10) / 2));
  // pool bar hut
  b.box(x1 - 3, 0, z1 - 4, 4, 1.15, 2, mat(0x6a4a2e, 0.7), false);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.4, 4), mat(0xc8a46a, 0.95));
  roof.position.set(x1 - 3, 3.4, z1 - 4);
  roof.rotation.y = Math.PI / 4;
  b.add(roof);
  for (const [cx, cz] of [
    [-1.8, -0.8],
    [1.8, -0.8],
    [-1.8, 0.8],
    [1.8, 0.8],
  ])
    b.add(new THREE.Mesh(CY(0.08, 0.08, 2.7, 6), K.wood), x1 - 3 + cx, 1.35, z1 - 4 + cz);
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(x1 - 3, 0, z1 - 5.5), radius: 2.5, label: `${name} Bar` });
  b.zone(name, x0, x1, z0, z1);
  b.feature({ kind: 'plaza', x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, color: '#7fd4e8' });
}

/** Surface parking lot: striped asphalt, light poles (+ night pools), parked cars, curb islands with palms. */
function surfaceLot(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, seed: number, fill = 0.6, label?: string): void {
  const R = rng(seed);
  ground(parkingLotMaterial(), worldPlane(x1 - x0, z1 - z0, (x0 + x1) / 2, 0.028, (z0 + z1) / 2, 10.8, 11, x0, z0));
  // stall rows: every 11 m a double row (cars facing ±z), stalls every 2.7 m
  for (let z = z0 + 2.75; z < z1 - 2; z += 11) {
    for (const [dz, r] of [
      [0, Math.PI],
      [5.5, 0],
    ] as Array<[number, number]>) {
      for (let x = x0 + 1.35; x < x1 - 1; x += 2.7) {
        if (R() > fill) continue;
        const c = parkedCar(seed + Math.floor(x * 3 + z));
        c.position.set(x, 0, z + dz);
        c.rotation.y = r + (R() - 0.5) * 0.08;
        b.add(c);
      }
    }
  }
  // light poles on a grid + islands
  for (let x = x0 + 8; x < x1 - 4; x += 20) {
    for (let z = z0 + 8; z < z1 - 4; z += 22) {
      const l = lotLight(b);
      l.position.set(x, 0, z);
      b.add(l);
      b.collider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0, 10, true);
      lightPool(b, x, z, 15);
    }
  }
  b.feature({ kind: 'road', x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, color: '#4a4a52', label });
}

/** Landscaped berm along a road: a low gravel mound with oleanders and palms. */
function berm(b: WorldBuilder, x: number, z0: number, z1: number, seed: number, width = 3): void {
  const R = rng(seed);
  const len = z1 - z0;
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, len, 10, 1, false, 0, Math.PI), K.gravel);
  mound.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  mound.scale.set(1, 1, 0.35);
  mound.position.set(x, 0, (z0 + z1) / 2);
  b.add(mound);
  const kit = desertPlantKit();
  for (let z = z0 + 2; z < z1 - 1; z += 3.2 + R() * 1.5) {
    const o = oleander(R, R() < 0.3);
    o.position.set(x + (R() - 0.5) * width * 0.5, 0.15, z);
    o.scale.setScalar(0.8 + R() * 0.4);
    b.add(o);
    if (R() < 0.18) b.add(palmTree(8 + R() * 3, false, Math.floor(z)), x, 0.3, z + 1.5);
    else if (R() < 0.3) {
      const rock = new THREE.Mesh(kit.rocks[Math.floor(R() * 3)], mat(0x8a6e58, 0.95));
      rock.position.set(x + (R() - 0.5) * width * 0.6, 0.3, z + 1);
      rock.userData.clutter = true;
      b.add(rock);
    }
  }
}

// ================================================================ the districts
export function buildBackOfHouse(b: WorldBuilder): void {
  lampHolder = b;
  registerStreetTick(b);
  const R = rng(1515);
  buildWestBack(b, R);
  buildEastBack(b, R);
  flushGround(b);
}

/** Worn asphalt over the back-of-house ground (the resort plazas keep their pavers). */
function bohGround(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number): void {
  ground(asphaltMaterial(), worldPlane(x1 - x0, z1 - z0, (x0 + x1) / 2, 0.012, (z0 + z1) / 2, 12, 12));
}

function buildWestBack(b: WorldBuilder, R: () => number): void {
  bohGround(b, -173, -156, -400, -11);
  bohGround(b, -173, -156, 11, 354);
  bohGround(b, -156, -133, -400, -325);
  bohGround(b, -156, -140, -325, -186);
  // ---- Frank Sinatra Dr (behind the west-side resorts, along the I-15 sound wall; continued south in tmobileArena.ts)
  const X = -166.5;
  for (const [z0, z1] of [
    [-399, -11],
    [11, 354],
  ]) serviceRoad(b, X - 0.01, z0, X + 0.01, z1, z0 < 0 ? 'Frank Sinatra Dr' : undefined);
  b.zone('Frank Sinatra Dr', X - 5, X + 5, -399, 354);
  // east sidewalk + street lights over the road, west: sound wall with pilasters
  b.add(new THREE.Mesh(worldPlane(2.0, 388, X + 5.8, 0.04, -205, 1, 1), K.concrete));
  b.add(new THREE.Mesh(worldPlane(2.0, 343, X + 5.8, 0.04, 182.5, 1, 1), K.concrete));
  for (let z = -390; z < 350; z += 38) {
    if (Math.abs(z) < 16 || Math.abs(z - 221) < 14) continue;
    const l = cobraLight(b);
    l.position.set(X + 5.4, 0, z);
    l.rotation.y = Math.PI;
    b.add(l);
    b.collider(X + 5.2, X + 5.6, z - 0.2, z + 0.2, 0, 9, true);
    lightPool(b, X + 2.6, z, 12);
  }
  for (const [z0, z1] of [
    [-402, -18],
    [18, 210],
    [232, 353],
  ]) {
    const zc = (z0 + z1) / 2;
    b.box(-172.4, 0, zc, 0.5, 4.2, z1 - z0, mat(0xb4a48c, 0.9), true, false);
    for (let z = z0 + 2; z < z1; z += 6) b.add(new THREE.Mesh(BX(0.7, 4.4, 0.6), mat(0xa08e76, 0.9)), -172.3, 2.2, z);
  }
  streetName(b, 'sinatra', X + 5.2, -12.5, Math.PI / 2);
  streetName(b, 'sinatra', X + 5.2, 12.5, Math.PI / 2);
  streetName(b, 'sinatra', X + 5.2, -397, Math.PI / 2);
  // berms with oleanders where the resorts leave room
  berm(b, X + 7.7, -396, -335, 11);
  berm(b, X + 7.7, 125, 180, 13);
  berm(b, X + 7.7, 232, 298, 14);
  utilityLine(b, -171.6, -380, 380, 38);

  // ---- TI back lot
  surfaceLot(b, -156, -133, -398, -330, 101, 0.55, 'TI Self-Park');
  chainFence(b, -156, -398.5, -133, -398.5);
  b.add(transformerBox(), -136, 0, -327.5);
  b.collider(-137, -135, -328.5, -326.5, 0, 1.4, true);

  // ---- Hard Rock (ex-Mirage) back of house: central plant + docks + employee entrance
  b.add(new THREE.Mesh(BX(16, 0.1, 30), K.concrete), -152, 0.05, -307);
  const ct = coolingTower(3);
  ct.position.set(-152, 0, -316);
  b.add(ct);
  b.collider(-158.5, -145.5, -318.6, -313.4, 0, 5.9, true);
  for (let i = 0; i < 3; i++) {
    const ch = chiller();
    ch.position.set(-156 + i * 3.4, 0, -301);
    b.add(ch);
  }
  b.collider(-157.2, -148.2, -303.8, -298.2, 0, 2.3, true);
  for (const [a, c] of [
    [-160, -322],
    [-160, -292],
  ]) chainFence(b, a, c, -144, c);
  chainFence(b, -160, -322, -160, -292);
  chainFence(b, -144, -322, -144, -306);
  b.zone('Hard Rock Central Plant', -160, -144, -322, -292);
  loadingDock(b, -147, -140.2, -280, -246, '-x', 5, [0, 2, 3], R);
  for (let i = 0; i < 3; i++) b.add(dumpster([0x2a5a3a, 0x2a4a8a, 0x3a3a3a][i]), -150 + 0.2 * i, 0, -243 + i * 2.2, Math.PI / 2);
  b.collider(-150.8, -149.2, -244, -237.6, 0, 1.5, true);
  const comp = compactor();
  comp.position.set(-144, 0, -236);
  comp.rotation.y = -Math.PI / 2;
  b.add(comp);
  b.collider(-148, -140.3, -237.3, -234.7, 0, 2.2, true);
  for (let i = 0; i < 5; i++) b.add(palletStack(R), -155 + (i % 3) * 1.5, 0, -238 + Math.floor(i / 3) * 1.4, R());
  b.box(-142.6, 0, -224, 5, 5.2, 16, K.stucco, true);
  employeeEntrance(b, -145.2, -222, -Math.PI / 2, -6, -1);
  b.zone('Hard Rock Receiving', -160, -140, -282, -214);
  surfaceLot(b, -160, -142, -212, -188, 102, 0.75, 'Team Member Lot');

  // ---- Caesars: self-park garage (behind the Forum Shops), docks, service drive, Garden of the Gods
  parkingGarage(b, -158, -118, -178, -133, 4, 'Caesars Palace Self Parking', '-x', 201);
  serviceRoad(b, -161.5, -122.5, -100, -122.6, undefined);
  b.zone('Caesars Service Drive', -162, -100, -127, -118);
  // fire lane curb paint along the drive
  b.add(new THREE.Mesh(BX(56, 0.17, 0.32), K.curbRed), -131, 0.085, -118.1);
  const fl = new THREE.Group();
  part(fl, CY(0.05, 0.05, 2.4, 6), K.galv, 0, 1.2, 0);
  part(fl, signGeometry('fireLane', 1.4, 0.18, 0.03), signs(b), 0, 2.2, 0);
  for (const fx of [-150, -125]) b.add(clutter(fl.clone()), fx, 0, -117.6, 0);
  loadingDock(b, -104.6, -97.2, -176, -142, '-x', 4, [1, 2], R);
  for (let i = 0; i < 4; i++) b.add(dumpster([0x2a5a3a, 0x7a2a1a, 0x2a4a8a, 0x2a5a3a][i]), -107 - (i % 2) * 2.3, 0, -139 + Math.floor(i / 2) * 1.8, 0);
  const comp2 = compactor();
  comp2.position.set(-102, 0, -134);
  comp2.rotation.y = -Math.PI / 2;
  b.add(comp2);
  b.collider(-106, -98.3, -135.3, -132.7, 0, 2.2, true);
  for (let i = 0; i < 4; i++) b.add(palletStack(R), -113 + i * 1.5, 0, -131, R());
  employeeEntrance(b, -100.9, -176.1, Math.PI, -5, -3.5);
  b.zone('Caesars Loading Dock', -115, -97, -180, -128);
  poolDeck(b, -159, -131, -94, -59, [
    [-145, -80, 16, 7],
    [-146, -64, 10, 4],
  ], 'Garden of the Gods Pool', 301);

  // ---- behind Cosmopolitan / Vdara: surface lot + rideshare
  surfaceLot(b, -156, -104, 122, 178, 103, 0.62, 'Cosmopolitan Lot');
  chainFence(b, -156, 121.5, -104, 121.5);
  b.add(transformerBox(), -107, 0, 180.5);
  // ---- behind NYNY / Park MGM: garage (Arena & Toshiba Plaza built in tmobileArena.ts)
  parkingGarage(b, -158, -120, 304, 352, 4, 'Park MGM • NYNY Parking', '+x', 202);
}

function buildEastBack(b: WorldBuilder, R: () => number): void {
  // (north of z −256 and east of Koval is the Sphere district: sphereDistrict.ts lays its own ground)
  bohGround(b, 170, 191, -273, -92);
  bohGround(b, 147, 202, -92, -12);
  bohGround(b, 131, 202, 12, 436);
  // ---- Koval Ln along the back edge: it starts at Sands Ave (a T just north-west of the Sphere, sphereDistrict.ts)
  // and runs south between the Venetian Expo / the resorts' backs and the Sphere, under the Venetian bridge
  const X = 186;
  for (const [z0, z1] of [
    [-273, -11],
    [11, 432],
  ]) serviceRoad(b, X - 0.01, z0, X + 0.01, z1, z0 === -273 ? 'Koval Ln' : undefined);
  b.zone('Koval Ln', X - 5, X + 5, -273, 432);
  for (let z = -246; z < 430; z += 36) {
    if (Math.abs(z) < 14 || (z > -238 && z < -222)) continue;
    const l = cobraLight(b);
    l.position.set(X + 5.4, 0, z);
    l.rotation.y = Math.PI;
    b.add(l);
    b.collider(X + 5.2, X + 5.6, z - 0.2, z + 0.2, 0, 9, true);
    lightPool(b, X + 2.6, z, 12);
  }
  utilityLine(b, 199.5, -60, 428, 36);
  streetName(b, 'koval', X - 5.2, -12.5, -Math.PI / 2);
  streetName(b, 'koval', X - 5.2, 12.5, -Math.PI / 2);
  berm(b, 179.6, 46, 120, 21);
  berm(b, 179.6, 300, 428, 22);
  // Paradise Rd beyond the edge (looks only; the Sphere district's bay reaches past it at z −425…−55)
  ground(serviceRoadMaterial(), roadStripGeometry(222, -700, 222, -430, 0.0, 12));
  ground(serviceRoadMaterial(), roadStripGeometry(222, -50, 222, 900, 0.0, 12));

  // ---- Linq Ln behind the LINQ / Flamingo + the LINQ garage + docks
  const LX = 142;
  serviceRoad(b, LX - 0.01, -92, LX + 0.01, -11, 'Linq Ln');
  b.zone('Linq Ln', LX - 5, LX + 5, -92, -11);
  streetName(b, 'linqLn', LX - 5.2, -12.5, -Math.PI / 2);
  for (const dx of [-3, 0, 3]) b.add(bollardY(), LX + dx, 0, -93);
  parkingGarage(b, 150, 178, -88, -26, 5, 'The LINQ Self Parking', '+x', 203);
  loadingDock(b, 123.1, 126.5, -86, -50, '+x', 5, [0, 1, 3], R);
  for (let i = 0; i < 4; i++) b.add(dumpster([0x2a5a3a, 0x2a4a8a, 0x2a5a3a, 0x5a5a5a][i]), 130.2, 0, -47 + i * 2.0, Math.PI / 2);
  b.collider(129.4, 131, -48, -40, 0, 1.5, true);
  const comp = compactor();
  comp.position.set(126.8, 0, -36);
  comp.rotation.y = Math.PI / 2;
  b.add(comp);
  b.collider(123.4, 131, -37.3, -34.7, 0, 2.2, true);
  for (let i = 0; i < 6; i++) b.add(palletStack(R), 125 + (i % 2) * 1.5, 0, -30 + Math.floor(i / 2) * 1.4, R());
  b.box(125.4, 0, -20, 4.6, 5.2, 12, K.stucco, true);
  employeeEntrance(b, 127.8, -20, Math.PI / 2, 5.5, -2);
  b.zone('LINQ Receiving', 123, 136, -88, -12);

  // ---- Audrie St behind Paris / Horseshoe: central plant + employee lot
  serviceRoad(b, LX - 0.01, 11, LX + 0.01, 122, 'Audrie St');
  b.zone('Audrie St', LX - 5, LX + 5, 11, 122);
  streetName(b, 'audrie', LX - 5.2, 12.5, -Math.PI / 2);
  b.add(new THREE.Mesh(BX(30, 0.1, 24), K.concrete), 162, 0.05, 30);
  for (let i = 0; i < 2; i++) {
    const t = coolingTower(3);
    t.position.set(162, 0, 22 + i * 8);
    b.add(t);
  }
  b.collider(155.5, 168.5, 19.4, 32.6, 0, 5.9, true);
  for (let i = 0; i < 4; i++) {
    const ch = chiller();
    ch.position.set(150 + i * 3.2, 0, 37);
    b.add(ch);
  }
  b.collider(148.8, 160.8, 34.2, 39.8, 0, 2.3, true);
  chainFence(b, 148, 17, 177.5, 17);
  chainFence(b, 148, 43, 177.5, 43);
  chainFence(b, 148, 17, 148, 43);
  chainFence(b, 177.5, 17, 177.5, 43);
  // pipe rack from the plant toward the resorts
  for (let z = 20; z < 42; z += 4) {
    b.add(new THREE.Mesh(BX(0.25, 5, 0.25), K.steel), 148.6, 2.5, z);
  }
  for (const [y, m] of [
    [4.6, K.pipeBlue],
    [4.1, K.pipeGreen],
    [5.1, K.red],
  ] as Array<[number, THREE.Material]>) {
    const p = new THREE.Mesh(CY(0.2, 0.2, 24, 8), m);
    p.rotation.x = Math.PI / 2;
    p.position.set(148.6, y, 31);
    b.add(p);
    const q = new THREE.Mesh(CY(0.2, 0.2, 14, 8), m);
    q.rotation.z = Math.PI / 2;
    q.position.set(141.6, y, 21);
    b.add(q);
  }
  b.zone('Paris • Horseshoe Central Plant', 148, 178, 17, 43);
  for (let i = 0; i < 2; i++) b.add(transformerBox(), 150 + i * 3, 0, 46.5);
  surfaceLot(b, 147, 176, 50, 120, 105, 0.7, 'Team Member Lot');
  b.box(126.5, 0, 75, 9, 5, 18, K.stucco, true);
  b.add(new THREE.Mesh(BX(9.3, 0.4, 18.3), K.concreteDark), 126.5, 5.2, 75);
  employeeEntrance(b, 131.05, 75, Math.PI / 2, 2.4, 9);
  bohWallDressing(b, false, 131.1, 67, 83, 3.8, Math.PI / 2, R);

  // ---- Planet Hollywood: garage + valet storage lot; fenced development lot to the south
  parkingGarage(b, 134, 176, 212, 262, 4, 'Planet Hollywood Self Parking', '-x', 204);
  surfaceLot(b, 132, 176, 124, 170, 106, 0.66, 'PH Valet Storage');
  chainFence(b, 131.5, 123.5, 176.5, 123.5);
  loadingDock(b, 127.2, 132.4, 180, 206, '+x', 3, [1], R);
  constructionFence(b, 130, 300, 176, 300);
  constructionFence(b, 130, 300, 130, 360);
  constructionFence(b, 130, 360, 176, 360);
  b.add(new THREE.Mesh(BX(44, 0.06, 58), K.sand), 153, 0.03, 330);
  // equipment on the dirt: an excavator-ish block and spoil piles
  const ex = new THREE.Group();
  part(ex, BX(3.2, 1.2, 4.6), mat(0xe8b923, 0.6), 0, 1.2, 0, 0, 0, 0, true);
  part(ex, BX(2.4, 1.6, 2.2), mat(0xe8b923, 0.6), -0.3, 2.6, 0.6);
  part(ex, BX(0.5, 0.5, 5.5), mat(0xe8b923, 0.6), 0.9, 3.2, 3.0, 0, -0.5);
  part(ex, BX(3.6, 0.8, 5.0), K.rubber, 0, 0.4, 0);
  ex.position.set(150, 0, 322);
  ex.rotation.y = 0.6;
  b.add(ex);
  b.collider(147, 153, 318, 326, 0, 3.4, true);
  for (let i = 0; i < 4; i++) {
    const pile = new THREE.Mesh(new THREE.ConeGeometry(3 + i, 2 + i * 0.4, 9), mat(0xa88a62, 0.98));
    pile.position.set(140 + i * 8, 1 + i * 0.2, 345 - (i % 2) * 18);
    b.add(pile);
  }
  b.zone('Future Development Site', 130, 176, 300, 360);

  // ---- MGM Grand pool complex (behind the tower)
  poolDeck(b, 122, 176, 368, 431, [
    [146, 392, 24, 8],
    [150, 415, 14, 5],
  ], 'MGM Grand Pool Complex', 302);
  // ---- Venetian / Palazzo self parking behind the Palazzo, south of the Sands Ave curve
  // (the Venetian Expo, its docks on Koval Ln and the old Venetian Lot's ground are sphereDistrict.ts)
  parkingGarage(b, 104, 140, -392, -346, 5, 'Venetian • Palazzo Self Parking', '+x', 205);
}
