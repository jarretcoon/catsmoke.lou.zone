import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * People, shared by the Strip's NPCs (npcs.ts, skinned: one draw call per person) and the instanced sidewalk crowd
 * (streetCrowd.ts: one draw call per level of detail for everyone, posed in the vertex shader).
 *
 * One body recipe in real proportions (a 1.76 m adult, about 7.5 heads tall): a shaped head with a jaw, nose and
 * ears; hair styles and hats; torso, hips and limbs from lathe profiles (calves, forearms, a waist), hands with a
 * thumb, real shoes. Faces are painted in the fragment shader from the head's rest-pose position (eyes with irises,
 * brows in the hair colour, a mouth, sunglasses, stubble, lipstick), so they stay sharp up close and cost no
 * geometry. Shirts can carry a procedural print (Hawaiian flowers, stripes, plaid, sequins, a sash, a chest logo).
 *
 * Two levels of detail: LOD 0 (near, within ~20 m) and LOD 1 (far, about a fifth of the triangles).
 */

// ---------------------------------------------------------------- skeleton
export const BONE = { hips: 0, spine: 1, head: 2, armL: 3, foreL: 4, armR: 5, foreR: 6, legL: 7, shinL: 8, legR: 9, shinR: 10 } as const;
export const BONE_COUNT = 11;
/** Rest-pose joints (model space, facing +z, his/her left is +x). */
export const JOINT: Array<[number, number, number]> = [
  [0, 0.96, 0], // hips
  [0, 1.04, 0], // spine (waist)
  [0, 1.5, 0], // head (base of the neck)
  [0.19, 1.405, 0], // left shoulder
  [0.205, 1.115, -0.01], // left elbow
  [-0.19, 1.405, 0],
  [-0.205, 1.115, -0.01],
  [0.092, 0.9, 0], // left hip joint
  [0.095, 0.49, 0.008], // left knee
  [-0.092, 0.9, 0],
  [-0.095, 0.49, 0.008],
];
export const PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9];
/** The head shape the face painter works in (centre and radii). */
export const HEAD_C: [number, number, number] = [0, 1.638, 0.012];
export const HEAD_R: [number, number, number] = [0.084, 0.117, 0.101];

// ---------------------------------------------------------------- colour slots, part flags, crowd options
/** 0 = fixed colour (the part's own), else the person's colour for that slot. leg/sleeve: crowd only (trousers or skin, sleeve or skin, by the shader). */
export const SLOT = { fixed: 0, skin: 1, top: 2, bottom: 3, shoe: 4, hair: 5, acc: 6, screen: 7, leg: 8, sleeve: 9 } as const;
export const FLAG = { none: 0, face: 1, print: 2 } as const;
/** Optional parts of the crowd body: each person turns a set of these on (bit = id - 1). */
export const OPT = {
  torsoM: 1,
  torsoF: 2,
  legPants: 3,
  legShorts: 4,
  legBare: 5,
  skirt: 6,
  dress: 7,
  armShort: 8,
  armLong: 9,
  armBare: 10,
  hShort: 11,
  hLong: 12,
  hPony: 13,
  hBun: 14,
  hCurly: 15,
  hBuzz: 16,
  capHat: 17,
  wideHat: 18,
  phone: 19,
  bag: 20,
  backpack: 21,
  jacket: 22,
  collar: 23,
  fanny: 24,
} as const;
export const bit = (id: number) => 1 << (id - 1);

/** Prints a shirt can carry (FLAG.print parts). */
export const PRINT = { plain: 0, floral: 1, stripes: 2, plaid: 3, sequins: 4, sash: 5, logo: 6 } as const;
/** Face style bits. */
export const FACE = { shades: 1, lipstick: 2, stubble: 4, blueEyes: 8, lashes: 16 } as const;

export type HairStyle = 'short' | 'side' | 'long' | 'pony' | 'bun' | 'bald' | 'curly' | 'buzz';
export type Hat = 'none' | 'cap' | 'wide';
export type LegWear = 'pants' | 'shorts' | 'bare';
export type ArmWear = 'short' | 'long' | 'bare';

/** A person's build as a recipe (NPCs pick one; the crowd geometry carries every option). */
export interface Recipe {
  female: boolean;
  legs: LegWear;
  arms: ArmWear;
  skirt: 'none' | 'skirt' | 'dress';
  hair: HairStyle;
  hat: Hat;
  collar: boolean;
  jacket: boolean;
  bag: 'none' | 'shoulder' | 'backpack' | 'fanny';
  phone: boolean;
  /** 0.9 slim … 1.25 heavy */
  heft: number;
  shoe: Shoe;
}
export type Shoe = 'sneaker' | 'heel' | 'boot' | 'sandal';

// ---------------------------------------------------------------- primitives (indexed, position + normal only)
const primCache = new Map<string, THREE.BufferGeometry>();
function prim(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = primCache.get(key);
  if (!g) {
    g = make();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    if (!g.index) {
      const idx: number[] = [];
      for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
      g.setIndex(idx);
    }
    primCache.set(key, g);
  }
  return g;
}
const ell = (rx: number, ry: number, rz: number, ws = 10, hs = 7, tl = Math.PI) =>
  prim(`el${rx}|${ry}|${rz}|${ws}|${hs}|${tl}`, () => new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, tl).scale(rx, ry, rz));
const box = (w: number, h: number, d: number) => prim(`bx${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt: number, rb: number, h: number, seg = 10, open = false) => prim(`cy${rt}|${rb}|${h}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
const lathe = (key: string, pts: Array<[number, number]>, seg: number) => prim(`la${key}|${seg}`, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg));
const torus = (r: number, t: number, arc: number, rs = 5, ts = 12) => prim(`to${r}|${t}|${arc}|${rs}|${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
/** A limb hanging down from y = 0: radius r1 at the top through rm at `mid` (0..1) to r2 at length len, round ends. */
const limb = (r1: number, rm: number, r2: number, len: number, mid: number, seg: number) =>
  prim(`lb${r1}|${rm}|${r2}|${len}|${mid}|${seg}`, () => {
    const pts: THREE.Vector2[] = [new THREE.Vector2(1e-4, -len - r2 * 0.6)];
    if (seg > 4) pts.push(new THREE.Vector2(r2 * 0.75, -len - r2 * 0.35));
    pts.push(new THREE.Vector2(r2, -len));
    pts.push(new THREE.Vector2(rm, -len * mid));
    if (seg > 4) pts.push(new THREE.Vector2((rm + r1) / 2, -len * mid * 0.45));
    pts.push(new THREE.Vector2(r1, 0));
    if (seg > 4) pts.push(new THREE.Vector2(r1 * 0.7, r1 * 0.55));
    pts.push(new THREE.Vector2(1e-4, r1 * 0.75));
    return new THREE.LatheGeometry(pts, seg);
  });
/** Pick by level of detail: near, mid, far. */
const Q = (b: Body, near: number, mid: number, far: number) => (b.lod === 0 ? near : b.lod === 1 ? mid : far);

/** The head: a sphere shaped into a skull with a narrower jaw, a chin, a flatter face and a fuller back. */
function headGeo(lod: number): THREE.BufferGeometry {
  return prim(`head${lod}`, () => {
    const g = new THREE.SphereGeometry(1, [26, 12, 8][lod], [18, 9, 6][lod]);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      const y = p.getY(i);
      let z = p.getZ(i);
      if (y < 0) {
        const t = -y;
        x *= 1 - 0.3 * t * t;
        z *= 1 - 0.1 * t * t;
        if (z > 0) z += 0.1 * t * t * z; // the chin comes forward
      }
      if (z < 0) z *= 1.1 - 0.12 * Math.max(0, -y); // fuller back of the skull, a nape
      if (z > 0.55) z = 0.55 + (z - 0.55) * 0.72; // a flatter face
      if (Math.abs(x) > 0.75) x = Math.sign(x) * (0.75 + (Math.abs(x) - 0.75) * 0.8); // flatter temples
      p.setXYZ(i, x * HEAD_R[0], y * HEAD_R[1], z * HEAD_R[2]);
    }
    g.computeVertexNormals();
    g.translate(HEAD_C[0], HEAD_C[1], HEAD_C[2]);
    return g;
  });
}
/** A hair cap that follows the head, cut at a hairline (front high, low at the nape). */
function hairCap(lod: number, puff: number, line: number): THREE.BufferGeometry {
  return prim(`cap${lod}|${puff}|${line}`, () => {
    const g = new THREE.SphereGeometry(1, [24, 11, 8][lod], [12, 5, 3][lod], 0, Math.PI * 2, 0, Math.PI * line);
    g.rotateX(-0.42);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      const y = p.getY(i);
      let z = p.getZ(i);
      if (z < 0) z *= 1.1;
      if (Math.abs(x) > 0.75) x = Math.sign(x) * (0.75 + (Math.abs(x) - 0.75) * 0.8);
      p.setXYZ(i, x * HEAD_R[0] * puff, y * HEAD_R[1] * (puff * 0.5 + 0.5), z * HEAD_R[2] * puff);
    }
    g.computeVertexNormals();
    g.translate(HEAD_C[0], HEAD_C[1] + 0.006, HEAD_C[2] - 0.006);
    return g;
  });
}

// ---------------------------------------------------------------- the part collector
export interface Part {
  g: THREE.BufferGeometry;
  bone: number;
  slot: number;
  /** fixed colour, or a tint multiplied into the slot colour */
  col: number;
  flag: number;
  /** crowd: the option bits that switch this part on (0 = always there) */
  opt: number;
  m: THREE.Matrix4;
}
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Body {
  readonly parts: Part[] = [];
  opt = 0;
  constructor(readonly lod: number) {}
  add(g: THREE.BufferGeometry, bone: number, slot: number, col: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, flag = 0): void {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    this.parts.push({ g, bone, slot, col, flag, opt: this.opt, m: _m.clone() });
  }
  /** Shorthand for fixed-colour parts. */
  fixed(g: THREE.BufferGeometry, bone: number, col: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
    this.add(g, bone, SLOT.fixed, col, x, y, z, rx, ry, rz, sx, sy, sz);
  }
  /** Run `fn` with every part it adds switched on by any of the crowd options in `ids`. */
  option(ids: number | number[], fn: () => void): void {
    const was = this.opt;
    this.opt = (Array.isArray(ids) ? ids : [ids]).reduce((m, id) => m | bit(id), 0);
    fn();
    this.opt = was;
  }
}

const WHITE = 0xffffff;

// ---------------------------------------------------------------- the body recipe
const TORSO_M: Array<[number, number]> = [[0.173, 0.895], [0.169, 0.93], [0.164, 0.97], [0.158, 1.03], [0.156, 1.08], [0.166, 1.16], [0.18, 1.25], [0.184, 1.31], [0.176, 1.37], [0.15, 1.42], [0.1, 1.46], [0.06, 1.48], [0, 1.49]];
const TORSO_F: Array<[number, number]> = [[0.179, 0.895], [0.173, 0.93], [0.158, 0.98], [0.142, 1.035], [0.132, 1.09], [0.142, 1.16], [0.158, 1.24], [0.16, 1.3], [0.152, 1.36], [0.13, 1.41], [0.09, 1.45], [0.055, 1.47], [0, 1.48]];
// The pelvis stops at the crotch line (0.885), where the thigh tops meet: nothing of it shows below or in front of
// the thighs in any pose, and it stays inside the shirt hem (narrower and shallower than the hem), so trousers,
// shorts and skirts keep a clean, neutral shape.
const PELVIS_M: Array<[number, number]> = [[0, 0.885], [0.06, 0.888], [0.115, 0.9], [0.148, 0.93], [0.152, 0.97], [0.14, 1.02]];
const PELVIS_F: Array<[number, number]> = [[0, 0.885], [0.065, 0.888], [0.13, 0.9], [0.16, 0.93], [0.16, 0.97], [0.13, 1.02]];
const lowRes = (pts: Array<[number, number]>) => pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1);

/** Torso (with print flag) and pelvis: one gender's core. */
function core(b: Body, female: boolean): void {
  const seg = Q(b, 16, 8, 6);
  const far = b.lod === 2;
  const t = female ? TORSO_F : TORSO_M;
  const pv = female ? PELVIS_F : PELVIS_M;
  b.add(lathe(`t${female}${far}`, far ? lowRes(t) : t, seg), BONE.spine, SLOT.top, WHITE, 0, 0, 0, 0, 0, 0, 1, 1, 0.64, FLAG.print);
  b.add(lathe(`p${female}${far}`, far ? lowRes(pv) : pv, seg), BONE.hips, SLOT.bottom, WHITE, 0, 0, 0, 0, 0, 0, 1, 1, 0.62);
  if (female && !far) for (const s of [-1, 1]) b.add(ell(0.075, 0.068, 0.024, Q(b, 10, 6, 4), Q(b, 7, 4, 3)), BONE.spine, SLOT.top, WHITE, s * 0.05, 1.256, 0.078, 0, s * 0.25, 0, 1, 1, 1, FLAG.print);
}

function neckAndHead(b: Body): void {
  b.add(cyl(0.047, 0.054, 0.13, Q(b, 10, 6, 5), true), BONE.head, SLOT.skin, WHITE, 0, 1.51, 0.004);
  b.add(headGeo(b.lod), BONE.head, SLOT.skin, WHITE, 0, 0, 0, 0, 0, 0, 1, 1, 1, FLAG.face);
  if (b.lod === 0) {
    // nose: bridge and tip; ears
    b.add(ell(0.013, 0.03, 0.016, 8, 6), BONE.head, SLOT.skin, WHITE, 0, HEAD_C[1] - 0.012, HEAD_C[2] + HEAD_R[2] * 0.66, -0.32);
    b.add(ell(0.017, 0.012, 0.014, 8, 5), BONE.head, SLOT.skin, 0xf2e2dc, 0, HEAD_C[1] - 0.04, HEAD_C[2] + HEAD_R[2] * 0.74);
    for (const s of [-1, 1]) b.add(ell(0.011, 0.027, 0.019, 8, 6), BONE.head, SLOT.skin, 0xf0dcd4, s * 0.083, HEAD_C[1] - 0.008, HEAD_C[2] - 0.012, 0, s * 0.35, 0);
  } else if (b.lod === 1) b.add(ell(0.014, 0.03, 0.02, 5, 4), BONE.head, SLOT.skin, WHITE, 0, HEAD_C[1] - 0.02, HEAD_C[2] + HEAD_R[2] * 0.68, -0.32);
}

const capOf = (style: HairStyle) => (style === 'buzz' ? [1.035, 0.5] : [1.085, 0.56]);
/** The cap of hair most styles share. */
function hairBase(b: Body, style: HairStyle): void {
  if (style === 'bald') {
    b.add(torus(0.082, 0.016, Math.PI, Q(b, 5, 3, 3), Q(b, 12, 6, 5)), BONE.head, SLOT.hair, WHITE, 0, HEAD_C[1] - 0.005, HEAD_C[2] - 0.01, -Math.PI / 2, 0, 0, 1, 1.18, 1);
    return;
  }
  if (style === 'curly') {
    b.add(prim(`ico${b.lod}`, () => new THREE.IcosahedronGeometry(1, Q(b, 2, 1, 0))), BONE.head, SLOT.hair, WHITE, 0, HEAD_C[1] + 0.035, HEAD_C[2] - 0.022, 0, 0, 0, HEAD_R[0] * 1.32, HEAD_R[1] * 0.98, HEAD_R[2] * 1.28);
    return;
  }
  const [puff, line] = capOf(style);
  b.add(hairCap(b.lod, puff, line), BONE.head, SLOT.hair, WHITE, 0, 0, 0);
}
/** What a style adds on top of the cap: a fringe, long hair, a ponytail, a bun. */
function hairStyle(b: Body, style: HairStyle): void {
  const near = b.lod === 0;
  const H = SLOT.hair;
  const [cx, cy, cz] = HEAD_C;
  if (style === 'side') b.add(ell(0.07, 0.025, 0.05, Q(b, 10, 5, 4), Q(b, 6, 3, 3)), BONE.head, H, WHITE, 0.02, cy + 0.095, cz + 0.06, -0.5, 0, -0.25);
  else if (style === 'short' && near) b.add(ell(0.06, 0.02, 0.04, 10, 5), BONE.head, H, WHITE, -0.01, cy + 0.098, cz + 0.055, -0.6, 0, 0.1);
  else if (style === 'long') {
    b.add(ell(HEAD_R[0] * 1.12, 0.15, 0.06, Q(b, 14, 7, 5), Q(b, 8, 4, 3)), BONE.head, H, WHITE, cx, cy - 0.05, cz - 0.06);
    if (b.lod < 2) for (const s of [-1, 1]) b.add(ell(0.022, 0.1, 0.05, Q(b, 8, 5, 4), Q(b, 6, 3, 3)), BONE.head, H, WHITE, s * 0.08, cy - 0.06, cz - 0.01, 0, 0, s * 0.08);
  } else if (style === 'pony') {
    b.add(ell(0.035, 0.1, 0.038, Q(b, 10, 5, 4), Q(b, 7, 4, 3)), BONE.head, H, WHITE, 0, cy - 0.04, cz - 0.13, 0.35);
    if (near) b.fixed(torus(0.022, 0.007, Math.PI * 2, 4, 10), BONE.head, 0xe84a7a, 0, cy + 0.03, cz - 0.112, 1.2);
  } else if (style === 'bun') b.add(ell(0.045, 0.04, 0.045, Q(b, 10, 5, 4), Q(b, 7, 4, 3)), BONE.head, H, WHITE, 0, cy + 0.1, cz - 0.075);
}
function hair(b: Body, style: HairStyle): void {
  hairBase(b, style);
  hairStyle(b, style);
}

function hat(b: Body, kind: Hat, slot: number, col: number): void {
  const [, cy, cz] = HEAD_C;
  if (kind === 'cap') {
    b.add(ell(HEAD_R[0] * 1.14, HEAD_R[1] * 0.9, HEAD_R[2] * 1.14, Q(b, 16, 8, 6), Q(b, 6, 3, 2), Math.PI * 0.5), BONE.head, slot, col, 0, cy + 0.03, cz - 0.004, -0.12);
    b.add(ell(0.075, 0.008, 0.075, Q(b, 12, 6, 5), Q(b, 3, 3, 2)), BONE.head, slot, col === WHITE ? 0xd8d8d8 : col, 0, cy + 0.04, cz + 0.1, 0.16, 0, 0, 1, 1, 1);
    if (b.lod === 0) b.add(ell(0.012, 0.006, 0.012, 6, 3), BONE.head, slot, col, 0, cy + 0.133, cz - 0.01);
  } else if (kind === 'wide') {
    b.add(cyl(0.2, 0.2, 0.014, Q(b, 20, 10, 7)), BONE.head, slot, col, 0, cy + 0.075, cz, -0.06, 0, 0, 1, 1, 0.86);
    b.add(cyl(0.078, 0.095, 0.11, Q(b, 14, 7, 6)), BONE.head, slot, col, 0, cy + 0.13, cz - 0.005, -0.06, 0, 0, 1, 1, 1.15);
    if (b.lod < 2) b.fixed(cyl(0.097, 0.097, 0.022, Q(b, 14, 7, 6), true), BONE.head, 0x4a2a16, 0, cy + 0.09, cz - 0.003, -0.06, 0, 0, 1, 1, 1.15);
  }
}

/**
 * One leg (thigh on the hip bone, knee, shin and foot on the knee). `wear` 'crowd' paints it with the crowd's
 * leg slot, which the shader turns into trousers, shorts or bare legs per person.
 */
function leg(b: Body, side: number, wear: LegWear | 'crowd', shoe: Shoe = 'sneaker'): void {
  const near = b.lod === 0;
  const seg = Q(b, 10, 6, 4);
  const thigh = side > 0 ? BONE.legL : BONE.legR;
  const shin = side > 0 ? BONE.shinL : BONE.shinR;
  const [hx, hy, hz] = JOINT[thigh];
  const [kx, ky, kz] = JOINT[shin];
  const crowd = wear === 'crowd';
  const thighSlot = crowd ? SLOT.leg : wear === 'bare' ? SLOT.skin : SLOT.bottom;
  const shinSlot = crowd ? SLOT.leg : wear === 'pants' ? SLOT.bottom : SLOT.skin;
  const loose = wear === 'pants' ? 1.06 : 1;
  b.add(limb(0.084 * loose, 0.07 * loose, 0.057 * loose, hy - ky, 0.5, seg), thigh, thighSlot, WHITE, hx, hy, hz, 0, 0, side * -0.01);
  if (wear === 'shorts') b.add(limb(0.06, 0.062, 0.058, 0.06, 0.5, seg), thigh, SLOT.skin, WHITE, kx, ky + 0.1, kz - 0.002); // bare knee above the joint
  if (b.lod < 2) b.add(ell(0.047 * loose, 0.05, 0.048 * loose, seg, Q(b, 6, 3, 3)), shin, shinSlot, WHITE, kx, ky, kz);
  b.add(limb(0.056 * loose, 0.06 * loose, 0.037 * loose, ky - 0.1, 0.3, seg), shin, shinSlot, WHITE, kx, ky, kz, 0, 0, 0);
  if (wear === 'pants' && near) b.add(cyl(0.05, 0.052, 0.05, seg, true), shin, SLOT.bottom, 0xe0e0e0, kx, 0.14, kz - 0.004);
  // the foot
  const fz = kz + 0.045;
  if (b.lod === 2) {
    b.add(box(0.09, 0.07, 0.25), shin, SLOT.shoe, WHITE, kx, 0.035, fz);
    return;
  }
  if (shoe === 'heel') {
    b.add(ell(0.036, 0.03, 0.105, seg, Q(b, 6, 3, 3), Math.PI / 2), shin, SLOT.shoe, WHITE, kx, 0.06, fz, -0.25);
    b.add(box(0.022, 0.07, 0.022), shin, SLOT.shoe, WHITE, kx, 0.035, fz - 0.075);
    return;
  }
  const big = shoe === 'boot' ? 1.08 : 1;
  b.add(ell(0.047 * big, 0.05 * big, 0.13, seg, Q(b, 7, 4, 3), Math.PI / 2), shin, SLOT.shoe, WHITE, kx, 0.034, fz, 0, 0, 0);
  if (shoe === 'boot') b.add(cyl(0.05, 0.052, 0.16, seg), shin, SLOT.shoe, WHITE, kx, 0.1, kz - 0.005);
  if (shoe === 'sandal') b.fixed(box(0.09, 0.018, 0.26), shin, 0x3a2a1e, kx, 0.009, fz);
  else b.fixed(prim(`sole${b.lod}`, () => new THREE.CylinderGeometry(1, 1, 1, Q(b, 14, 7, 5))), shin, shoe === 'boot' ? 0x2a1a10 : 0xeeeeea, kx, 0.012, fz, 0, 0, 0, 0.05 * big, 0.024, 0.135);
}

/** One arm: deltoid + upper arm on the shoulder, elbow + forearm + hand on the elbow ('crowd': sleeves by shader). */
function arm(b: Body, side: number, wear: ArmWear | 'crowd'): void {
  const near = b.lod === 0;
  const seg = Q(b, 9, 6, 4);
  const up = side > 0 ? BONE.armL : BONE.armR;
  const fore = side > 0 ? BONE.foreL : BONE.foreR;
  const [sx, sy, sz] = JOINT[up];
  const [ex, ey, ez] = JOINT[fore];
  const crowd = wear === 'crowd';
  const upSlot = crowd ? SLOT.sleeve : wear === 'bare' ? SLOT.skin : SLOT.top;
  const foreSlot = crowd ? SLOT.sleeve : wear === 'long' ? SLOT.top : SLOT.skin;
  const upFlag = upSlot === SLOT.skin ? 0 : FLAG.print;
  if (b.lod < 2) b.add(ell(0.05, 0.058, 0.052, seg, Q(b, 6, 4, 3)), up, upSlot, WHITE, sx - side * 0.012, sy - 0.016, sz, 0, 0, 0, 1, 1, 1, upFlag);
  if (wear === 'short') {
    b.add(limb(0.056, 0.056, 0.05, 0.13, 0.5, seg), up, SLOT.top, WHITE, sx, sy - 0.02, sz, 0, 0, side * 0.06, 1, 1, 1, FLAG.print);
    b.add(limb(0.046, 0.044, 0.04, sy - ey - 0.02, 0.5, seg), up, SLOT.skin, WHITE, sx, sy - 0.04, sz, 0, 0, side * 0.05);
  } else b.add(limb(wear === 'long' ? 0.054 : 0.05, 0.048, 0.042, sy - ey, 0.4, seg), up, upSlot, WHITE, sx, sy - 0.01, sz, 0, 0, side * 0.05, 1, 1, 1, upFlag);
  const loose = wear === 'long' ? 1.12 : 1;
  if (b.lod < 2) b.add(ell(0.035 * loose, 0.04, 0.035 * loose, seg, Q(b, 5, 3, 3)), fore, foreSlot, WHITE, ex, ey, ez);
  b.add(limb(0.041 * loose, 0.039 * loose, 0.029 * loose, 0.235, 0.3, seg), fore, foreSlot, WHITE, ex, ey, ez, 0, 0, 0, 1, 1, 1, foreSlot === SLOT.skin ? 0 : FLAG.print);
  if (wear === 'long' && near) b.add(cyl(0.034, 0.033, 0.035, seg, true), fore, SLOT.top, 0xdadada, ex, ey - 0.225, ez);
  // the hand: palm (thin toward the body), fingers curled a little forward, a thumb in front
  const hx = ex + side * 0.006;
  const hy = ey - 0.265;
  if (near) {
    b.add(ell(0.02, 0.045, 0.04, 10, 7), fore, SLOT.skin, WHITE, hx, hy - 0.03, ez + 0.004);
    b.add(ell(0.018, 0.04, 0.036, 10, 6), fore, SLOT.skin, WHITE, hx - side * 0.002, hy - 0.08, ez + 0.012, 0.25);
    b.add(ell(0.012, 0.03, 0.012, 7, 5), fore, SLOT.skin, WHITE, hx - side * 0.012, hy - 0.035, ez + 0.038, 0.4, 0, side * 0.35);
  } else if (b.lod === 1) b.add(ell(0.022, 0.065, 0.04, 6, 4), fore, SLOT.skin, WHITE, hx, hy - 0.05, ez + 0.006);
  else b.add(box(0.035, 0.11, 0.07), fore, SLOT.skin, WHITE, hx, hy - 0.04, ez + 0.006);
}

/** Everything else a passer-by might carry or wear (crowd options and NPC choices). */
function extras(b: Body, r: Pick<Recipe, 'collar' | 'jacket' | 'bag' | 'phone' | 'skirt' | 'female'>, accSlot: number, accCol: number): void {
  const near = b.lod === 0;
  if (r.collar && b.lod < 2) b.add(torus(0.062, 0.016, Math.PI * 2, Q(b, 4, 3, 3), Q(b, 14, 7, 6)), BONE.spine, SLOT.top, 0xe8e8e8, 0, 1.465, 0.012, Math.PI / 2 - 0.25, 0, 0, 1, 1.05, 1);
  if (r.jacket) {
    // an open jacket: the shirt shows down the front, lapels turned back
    b.add(ell(0.072, 0.19, 0.03, Q(b, 10, 5, 4), Q(b, 7, 4, 3)), BONE.spine, accSlot, accCol, 0, 1.24, 0.1);
    if (near) for (const s of [-1, 1]) b.add(box(0.035, 0.2, 0.012), BONE.spine, SLOT.top, 0xb8b8b8, s * 0.068, 1.33, 0.1, -0.12, 0, s * 0.3);
  }
  if (r.skirt !== 'none') {
    const dress = r.skirt === 'dress';
    b.add(cyl(0.155, dress ? 0.235 : 0.22, dress ? 0.46 : 0.34, Q(b, 16, 8, 6), true), BONE.hips, dress ? SLOT.top : SLOT.bottom, WHITE, 0, dress ? 0.79 : 0.84, 0, 0, 0, 0, 1, 1, 0.78, dress ? FLAG.print : 0);
    if (near) b.add(prim('skirtIn', () => new THREE.CylinderGeometry(0.15, 0.215, 0.33, 16, 1, true).scale(-1, 1, 1)), BONE.hips, dress ? SLOT.top : SLOT.bottom, 0x9a9a9a, 0, dress ? 0.79 : 0.84, 0, 0, 0, 0, 1, dress ? 1.38 : 1, 0.76);
  }
  if (r.bag === 'shoulder') {
    b.add(box(0.026, 0.5, 0.01), BONE.spine, accSlot, 0x7a7a7a, 0.0, 1.21, r.female ? 0.116 : 0.114, 0, 0, 0.62);
    b.add(box(0.2, 0.16, 0.07), BONE.hips, accSlot, accCol, -0.205, 0.95, 0.04, 0, 0.3, 0);
  } else if (r.bag === 'backpack') {
    b.add(box(0.27, 0.36, 0.13), BONE.spine, accSlot, accCol, 0, 1.22, -0.165);
    if (near) b.add(box(0.2, 0.15, 0.04), BONE.spine, accSlot, 0xb0b0b0, 0, 1.13, -0.24);
    if (b.lod < 2) for (const s of [-1, 1]) b.add(box(0.032, 0.24, 0.016), BONE.spine, accSlot, 0x6a6a6a, s * 0.095, 1.27, r.female ? 0.108 : 0.112, -0.3, 0, 0);
  } else if (r.bag === 'fanny') {
    b.add(ell(0.1, 0.045, 0.04, Q(b, 10, 6, 4), Q(b, 6, 3, 2)), BONE.hips, accSlot, accCol, 0.03, 0.99, 0.12, 0, 0.1, 0);
  }
  if (r.phone && b.lod < 2) {
    // in the right hand, screen toward the face when the arm comes up
    const [ex, ey, ez] = JOINT[BONE.foreR];
    b.fixed(box(0.072, 0.145, 0.011), BONE.foreR, 0x15171c, ex + 0.012, ey - 0.3, ez + 0.045, 0.25);
    b.add(box(0.062, 0.128, 0.002), BONE.foreR, SLOT.screen, WHITE, ex + 0.012, ey - 0.3 + 0.0015, ez + 0.0512 + 0.0013, 0.25);
  }
}

/** A whole person to a recipe (NPCs). `acc` is the accessory colour (bags, the shirt under a jacket). */
export function recipeBody(lod: number, r: Recipe, hatCol: number, acc: number): Body {
  const b = new Body(lod);
  core(b, r.female);
  neckAndHead(b);
  hair(b, r.hat !== 'none' && (r.hair === 'bun' || r.hair === 'curly') ? 'short' : r.hair);
  hat(b, r.hat, SLOT.fixed, hatCol);
  for (const s of [-1, 1]) {
    leg(b, s, r.skirt !== 'none' ? 'bare' : r.legs, r.shoe);
    arm(b, s, r.arms);
  }
  extras(b, r, SLOT.fixed, acc);
  if (r.heft > 1.06) b.add(ell(0.13, 0.13, 0.08, Q(b, 12, 6, 5), Q(b, 8, 4, 3)), BONE.spine, SLOT.top, WHITE, 0, 1.13, 0.05 + (r.heft - 1) * 0.12, 0, 0, 0, 1, 1, 1, FLAG.print);
  return b;
}

/** How far a bone's joint moves sideways for a heavier build (and a woman's narrower shoulders). */
export function boneShift(bone: number, heft: number, female: boolean): number {
  if (bone >= BONE.armL && bone <= BONE.foreR) return (bone <= BONE.foreL ? 1 : -1) * ((heft - 1) * 0.14 - (female ? 0.016 : 0));
  if (bone >= BONE.legL) return (bone <= BONE.shinL ? 1 : -1) * (heft - 1) * 0.05;
  return 0;
}
const _h = new THREE.Matrix4();
const _h2 = new THREE.Matrix4();
/** Bake a build into an NPC body (the crowd shader does the same per person; keep the two in step). */
export function applyHeft(b: Body, heft: number, female: boolean): void {
  if (heft === 1 && !female) return;
  for (const p of b.parts) {
    if (p.bone === BONE.head) continue;
    if (p.bone <= BONE.spine) _h.makeScale(heft, 1, 0.3 + 0.7 * heft);
    else {
      const g = 1 + (heft - 1) * 0.75;
      const [jx, , jz] = JOINT[p.bone];
      _h.makeTranslation(-jx, 0, -jz).premultiply(_h2.makeScale(g, 1, g)).premultiply(_h2.makeTranslation(jx + boneShift(p.bone, heft, female), 0, jz));
    }
    p.m.premultiply(_h);
  }
}

/**
 * The crowd body for one level of detail (0 near, 1 mid, 2 far): every option, each part tagged with the
 * option bits that switch it on, so the vertex shader can dress each person differently from one geometry.
 * Legs and sleeves are drawn once and coloured by the shader (trousers / shorts / bare, long / short / none).
 */
export function crowdBody(lod: number): Body {
  const b = new Body(lod);
  b.option(OPT.torsoM, () => core(b, false));
  b.option(OPT.torsoF, () => core(b, true));
  neckAndHead(b);
  // one cap for every capped style (the buzz cut is tighter), then what each style adds
  b.option([OPT.hShort, OPT.hLong, OPT.hPony, OPT.hBun], () => hairBase(b, 'short'));
  b.option(OPT.hBuzz, () => hairBase(b, b.lod === 2 ? 'short' : 'buzz'));
  b.option(OPT.hCurly, () => hairBase(b, 'curly'));
  b.option(OPT.hShort, () => hairStyle(b, 'short'));
  b.option(OPT.hLong, () => hairStyle(b, 'long'));
  b.option(OPT.hPony, () => hairStyle(b, 'pony'));
  b.option(OPT.hBun, () => hairStyle(b, 'bun'));
  b.option(OPT.capHat, () => hat(b, 'cap', SLOT.acc, WHITE));
  b.option(OPT.wideHat, () => hat(b, 'wide', SLOT.acc, WHITE));
  for (const s of [-1, 1]) {
    leg(b, s, 'crowd');
    arm(b, s, 'crowd');
  }
  const none = { collar: false, jacket: false, bag: 'none' as const, phone: false, skirt: 'none' as const, female: false };
  b.option(OPT.skirt, () => extras(b, { ...none, skirt: 'skirt' }, SLOT.acc, WHITE));
  b.option(OPT.dress, () => extras(b, { ...none, skirt: 'dress' }, SLOT.acc, WHITE));
  b.option(OPT.collar, () => extras(b, { ...none, collar: true }, SLOT.acc, WHITE));
  b.option(OPT.jacket, () => extras(b, { ...none, jacket: true }, SLOT.acc, WHITE));
  b.option(OPT.bag, () => extras(b, { ...none, bag: 'shoulder' }, SLOT.acc, WHITE));
  b.option(OPT.backpack, () => extras(b, { ...none, bag: 'backpack' }, SLOT.acc, WHITE));
  b.option(OPT.fanny, () => extras(b, { ...none, bag: 'fanny' }, SLOT.acc, WHITE));
  b.option(OPT.phone, () => extras(b, { ...none, phone: true }, SLOT.acc, WHITE));
  return b;
}

// ---------------------------------------------------------------- geometry out
export interface Palette {
  skin: number;
  top: number;
  bottom: number;
  shoe: number;
  hair: number;
  acc: number;
}
const _c = new THREE.Color();
const _c2 = new THREE.Color();

/**
 * Merge a body into one indexed geometry. With a palette (NPCs): colours baked, skinIndex/skinWeight for a
 * SkinnedMesh, `aPaint` = (flag, face style or print kind, …) and `aAlt` = brow colour or print accent.
 * Without (crowd): `color` is the tint, `aPart` = (bone, slot, option, flag) for the crowd shader.
 */
export function bodyGeometry(b: Body, pal?: Palette, paint?: { face: number; print: number; brow: number; printAcc: number }): THREE.BufferGeometry {
  const list = b.parts.map((p) => {
    const g = p.g.clone().applyMatrix4(p.m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const slotHex = pal ? [p.col, pal.skin, pal.top, pal.bottom, pal.shoe, pal.hair, pal.acc, 0x9ab8d8][p.slot] : 0xffffff;
    _c.setHex(p.col);
    if (pal) {
      if (p.slot !== SLOT.fixed) _c.multiply(_c2.setHex(slotHex));
    }
    for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (pal) {
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      const pa = new Float32Array(n * 4);
      const alt = new Float32Array(n * 3);
      const isFace = p.flag === FLAG.face;
      const isPrint = p.flag === FLAG.print && p.slot === SLOT.top && (paint?.print ?? 0) > 0;
      _c2.setHex(isFace ? (paint?.brow ?? 0x2a1a10) : (paint?.printAcc ?? 0xffffff));
      for (let i = 0; i < n; i++) {
        si[i * 4] = p.bone;
        sw[i * 4] = 1;
        pa[i * 4] = isFace ? 1 : isPrint ? 2 : 0;
        pa[i * 4 + 1] = isFace ? (paint?.face ?? 0) : isPrint ? paint!.print : 0;
        alt.set([_c2.r, _c2.g, _c2.b], i * 3);
      }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      g.setAttribute('aPaint', new THREE.BufferAttribute(pa, 4));
      g.setAttribute('aAlt', new THREE.BufferAttribute(alt, 3));
    } else {
      const part = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) part.set([p.bone, p.slot, p.opt, p.flag], i * 4);
      g.setAttribute('aPart', new THREE.BufferAttribute(part, 4));
    }
    return g;
  });
  const out = mergeGeometries(list, false)!;
  for (const g of list) g.dispose();
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------- shading shared by both materials
/** GLSL: sRGB unpacking, the painted face and shirt prints. Expects `vRest` (rest-pose model position). */
export const PEOPLE_GLSL = /* glsl */ `
float pplHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pplAA(float d) { float w = max(fwidth(d), 1e-4); return 1.0 - smoothstep(-w, w, d); }
// d < 0 inside an ellipse of radii r around c
float pplEll(vec2 p, vec2 c, vec2 r) { vec2 q = (p - c) / r; return (length(q) - 1.0) * min(r.x, r.y); }
vec3 pplFace(vec3 base, vec3 rest, vec3 brow, float style) {
  vec3 q = (rest - vec3(${HEAD_C.join(', ')})) / vec3(${HEAD_R.join(', ')});
  if (q.z < 0.2) return base;
  float sx = abs(q.x);
  vec2 p = vec2(sx, q.y);
  float st = floor(style + 0.5);
  bool shades = mod(st, 2.0) > 0.5;
  bool lipstick = mod(floor(st / 2.0), 2.0) > 0.5;
  bool stubble = mod(floor(st / 4.0), 2.0) > 0.5;
  bool blue = mod(floor(st / 8.0), 2.0) > 0.5;
  bool lashes = mod(floor(st / 16.0), 2.0) > 0.5;
  vec3 c = base;
  // soft shading: sockets under the brow, cheeks, a shadow under the nose and the lower lip
  c *= 1.0 - 0.13 * pplAA(pplEll(p, vec2(0.36, 0.1), vec2(0.24, 0.14)) + 0.04);
  c *= 1.0 - 0.18 * pplAA(pplEll(vec2(q.x, q.y), vec2(0.0, -0.29), vec2(0.13, 0.045)));
  c = mix(c, c * vec3(1.06, 0.95, 0.93), 0.5 * pplAA(pplEll(p, vec2(0.5, -0.22), vec2(0.2, 0.13))));
  if (stubble) c = mix(c, brow * 0.9 + base * 0.1, 0.42 * smoothstep(-0.12, -0.32, q.y) * smoothstep(0.98, 0.7, sx * 1.1) * (1.0 - pplAA(pplEll(vec2(q.x, q.y), vec2(0.0, -0.46), vec2(0.28, 0.08)))));
  // the mouth: a dark line, the lips around it
  vec2 mq = vec2(q.x, q.y + 0.46);
  float lipW = 0.27;
  float lips = pplAA(pplEll(mq, vec2(0.0, -0.005), vec2(lipW, lipstick ? 0.085 : 0.06)));
  c = mix(c, lipstick ? vec3(0.42, 0.04, 0.08) : c * vec3(0.78, 0.58, 0.55), lips * (lipstick ? 0.92 : 0.75));
  c = mix(c, vec3(0.12, 0.03, 0.03), pplAA(abs(mq.y + 0.003 * (1.0 - mq.x * mq.x * 12.0)) - 0.012 * (1.0 - smoothstep(0.17, lipW, abs(mq.x)))) * 0.9);
  // brows in the hair colour, arched
  float bx = (sx - 0.37) / 0.23;
  float by = 0.3 + 0.045 * (1.0 - bx * bx) - 0.03 * smoothstep(-0.6, -1.0, bx);
  float browD = max(abs(q.y - by) - 0.032 * (1.0 - 0.45 * max(bx, 0.0)), abs(bx) - 1.0);
  c = mix(c, brow * 0.85, pplAA(browD * 0.25) * 0.95);
  if (shades) {
    vec2 lq = (p - vec2(0.37, 0.1)) / vec2(0.27, 0.15);
    float lens = (pow(clamp(abs(lq.x), 0.0, 4.0), 3.0) + pow(clamp(abs(lq.y), 0.0, 4.0), 3.0)) - 1.0;
    float rim = pplAA(lens * 0.12 - 0.012);
    c = mix(c, vec3(0.025, 0.025, 0.03), rim);
    c = mix(c, vec3(0.06, 0.07, 0.09) + 0.25 * smoothstep(0.2, -0.6, lq.x - lq.y), pplAA(lens * 0.12));
    c = mix(c, vec3(0.025), pplAA(max(abs(q.y - 0.16) - 0.022, sx - 0.12)));
    return c;
  }
  // eyes: the white, an iris, a pupil, the lid line on top
  vec2 eq = p - vec2(0.37, 0.085);
  float eye = pplEll(eq, vec2(0.0), vec2(0.13, 0.056));
  float inEye = pplAA(eye);
  c = mix(c, mix(base, vec3(0.8, 0.77, 0.72), 0.8), inEye);
  vec3 iris = blue ? vec3(0.16, 0.3, 0.46) : vec3(0.2, 0.11, 0.05);
  c = mix(c, iris, inEye * pplAA(length(eq - vec2(-0.01, -0.004)) - 0.052));
  c = mix(c, vec3(0.02), inEye * pplAA(length(eq - vec2(-0.01, -0.004)) - 0.024));
  c = mix(c, vec3(0.95), inEye * pplAA(length(eq - vec2(-0.028, 0.016)) - 0.01) * 0.7);
  float lid = abs(eye + 0.004) - (lashes ? 0.011 : 0.006);
  c = mix(c, vec3(0.05, 0.03, 0.03), pplAA(lid) * step(-0.012, eq.y) * 0.95);
  if (lashes) c = mix(c, vec3(0.04, 0.02, 0.02), pplAA(max(abs(eq.y - 0.03 - eq.x * 0.25) - 0.012, abs(eq.x - 0.15) - 0.025)) * 0.9);
  return c;
}
vec3 pplPrint(vec3 base, vec3 acc, vec3 rest, float kind) {
  float k = floor(kind + 0.5);
  if (k < 0.5) return base;
  float ang = atan(rest.x, rest.z);
  vec2 uv = vec2(ang * 0.17, rest.y);
  if (k < 1.5) {
    // Hawaiian: hibiscus flowers and leaves
    vec2 g = uv * vec2(12.0, 12.0) + vec2(0.0, floor(uv.x * 12.0) * 0.5);
    vec2 id = floor(g);
    float h = pplHash(id);
    vec2 f = fract(g) - 0.5 + (vec2(h, pplHash(id + 3.1)) - 0.5) * 0.3;
    float a = atan(f.y, f.x);
    float r = length(f) / (0.65 + 0.5 * h);
    float petal = 0.27 + 0.1 * cos(5.0 * a + h * 6.0);
    float show = step(0.3, h);
    vec3 c = mix(base, mix(acc, acc * vec3(0.8, 0.65, 0.7), step(0.7, h)), pplAA(r - petal) * show);
    c = mix(c, vec3(1.0, 0.92, 0.5), pplAA(r - 0.06) * show);
    vec2 lf = fract(g + 0.5) - 0.5;
    float leaf = pplAA(pplEll(lf, vec2(0.0), vec2(0.28, 0.09)));
    return mix(c, base * vec3(0.45, 0.9, 0.55), leaf * (1.0 - pplAA(r - petal - 0.04) * show) * 0.8);
  }
  if (k < 2.5) return mix(base, acc, pplAA(abs(fract(rest.y * 13.0) - 0.5) - 0.17));
  if (k < 3.5) {
    float a = pplAA(abs(fract(uv.x * 8.0) - 0.5) - 0.14);
    float b = pplAA(abs(fract(uv.y * 8.0) - 0.5) - 0.14);
    return mix(base, acc, clamp(a * 0.55 + b * 0.55, 0.0, 0.85));
  }
  if (k < 4.5) {
    vec2 g = uv * 70.0;
    float s = pplHash(floor(g));
    return base * (0.75 + 0.7 * step(0.55, s)) + acc * 0.25 * step(0.85, s);
  }
  if (k < 5.5) {
    // a sash from the left shoulder to the right hip, across the front
    float d = abs(rest.x * 0.95 - (rest.y - 1.2) * 0.9);
    return mix(base, acc, pplAA(d - 0.035) * step(0.0, rest.z));
  }
  // a chest logo
  float box = max(abs(rest.x) - 0.075, abs(rest.y - 1.29) - 0.05);
  return mix(base, acc, pplAA(box) * step(0.05, rest.z));
}
`;

// ---------------------------------------------------------------- NPC material (skinned, colours baked)
let npcMat: THREE.MeshStandardMaterial | null = null;
/** The one material every skinned NPC shares: vertex colours, painted faces and prints. */
export function npcMaterial(): THREE.MeshStandardMaterial {
  if (npcMat) return npcMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aPaint;\nattribute vec3 aAlt;\nvarying vec3 vRest;\nvarying vec4 vPaint;\nvarying vec3 vAlt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;\nvPaint = aPaint;\nvAlt = aAlt;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;\nvarying vec4 vPaint;\nvarying vec3 vAlt;\n' + PEOPLE_GLSL)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vPaint.x > 0.5 && vPaint.x < 1.5) diffuseColor.rgb = pplFace(diffuseColor.rgb, vRest, vAlt, vPaint.y);
        else if (vPaint.x > 1.5) diffuseColor.rgb = pplPrint(diffuseColor.rgb, vAlt, vRest, vPaint.y);`
      );
  };
  m.customProgramCacheKey = () => 'pplNpc';
  npcMat = m;
  return m;
}

// ---------------------------------------------------------------- crowd material (instanced, posed in the vertex shader)
const J = (i: number) => `vec3(${JOINT[i].map((v) => v.toFixed(4)).join(', ')})`;
/**
 * Per-instance attributes the crowd material reads:
 * - iColA (skin, top, bottom, hair) and iColB.xy (accessory, shoes): sRGB hex packed into floats (`packHex`);
 * - iColB.z = build (0.9 slim … 1.3 heavy), iColB.w = shirt print (PRINT);
 * - iStyle.x = option bits (OPT), iStyle.y = face style bits (FACE);
 * - iAnim = (stride phase, walk amount 0 = standing … 1 = a stroll … 2 = a run, pose, seed).
 *   Poses: 0 arms free, 1 looking at a phone, 2 filming with the phone up, 3 hands in pockets.
 * The pose math matches `poseRig` in npcs.ts.
 */
const CROWD_VERT_HEAD = /* glsl */ `
attribute vec4 aPart;
attribute vec4 iColA;
attribute vec4 iColB;
attribute vec4 iStyle;
attribute vec4 iAnim;
uniform float uTime;
varying vec3 vRest;
varying vec4 vPaint;
varying vec3 vAlt;
varying float vEmit;
varying float vCut;
varying vec3 vSkin;
vec3 pplUnpack(float f) {
  float v = floor(f + 0.5);
  vec3 s = vec3(floor(v / 65536.0), mod(floor(v / 256.0), 256.0), mod(v, 256.0)) / 255.0;
  return mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(0.04045, s));
}
mat3 pplRX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 pplRY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 pplRZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
bool pplOn(float id) { int b = int(id + 0.5) - 1; return ((int(iStyle.x + 0.5) >> b) & 1) == 1; }
void pplPose(inout vec3 p, inout vec3 n) {
  int bi = int(aPart.x + 0.5);
  int pm = int(aPart.z + 0.5);
  if (pm != 0 && (pm & int(iStyle.x + 0.5)) == 0) { p = vec3(0.0, -50.0, 0.0); return; }
  float heft = iColB.z;
  bool fem = pplOn(${OPT.torsoF}.0);
  // the build: girth and how far apart the limbs hang (as applyHeft does for NPCs)
  float side = (bi == 3 || bi == 4 || bi == 7 || bi == 8) ? 1.0 : -1.0;
  float shift = 0.0;
  if (bi >= 3 && bi <= 6) shift = side * ((heft - 1.0) * 0.14 - (fem ? 0.016 : 0.0));
  else if (bi >= 7) shift = side * (heft - 1.0) * 0.05;
  if (bi <= 1) { p.x *= heft; p.z *= 0.3 + 0.7 * heft; }
  else if (bi >= 3) {
    float g = 1.0 + (heft - 1.0) * 0.75;
    vec3 j = bi == 3 ? ${J(3)} : bi == 4 ? ${J(4)} : bi == 5 ? ${J(5)} : bi == 6 ? ${J(6)} : bi == 7 ? ${J(7)} : bi == 8 ? ${J(8)} : bi == 9 ? ${J(9)} : ${J(10)};
    p.xz = j.xz + (p.xz - j.xz) * g;
    p.x += shift;
  }
  // the stride (phase, amount) and the idle weight shift
  float ph = iAnim.x;
  float w = iAnim.y;
  float pose = iAnim.z;
  float seed = iAnim.w;
  float s = sin(ph);
  float c = cos(ph);
  float idle = 1.0 - clamp(w * 3.0, 0.0, 1.0);
  float ws = sin(uTime * 0.5 + seed * 17.0);
  float tL = -0.44 * w * s;
  float tR = 0.44 * w * s;
  float kL = w * (0.06 + 0.8 * pow(max(c, 0.0), 2.0)) + idle * 0.16 * max(-ws, 0.0);
  float kR = w * (0.06 + 0.8 * pow(max(-c, 0.0), 2.0)) + idle * 0.16 * max(ws, 0.0);
  tL -= idle * 0.08 * max(-ws, 0.0);
  tR -= idle * 0.08 * max(ws, 0.0);
  float aLx = 0.36 * w * s;
  float aRx = -0.36 * w * s;
  float aLz = 0.07 + idle * 0.02;
  float aRz = -0.07 - idle * 0.02;
  float fL = -0.15 - 0.32 * w * max(-s, 0.0);
  float fR = -0.15 - 0.32 * w * max(s, 0.0);
  float twist = -0.1 * w * s;
  float roll = -0.045 * w * c + idle * 0.05 * ws;
  float sway = idle * 0.022 * ws;
  float bob = w * (0.022 * abs(c) - 0.011);
  float lean = 0.05 * w + 0.06 * max(w - 1.2, 0.0);
  float ctw = 0.17 * w * s;
  float croll = 0.035 * w * c - idle * 0.035 * ws;
  float hy = -0.08 * w * s + idle * 0.5 * sin(uTime * 0.21 + seed * 9.0) * smoothstep(0.1, 0.7, sin(uTime * 0.13 + seed * 3.0));
  float hx = 0.0;
  if (pose > 0.5 && pose < 1.5) { aRx = -0.62; aRz = -0.14; fR = -1.45; hx = 0.38; hy *= 0.2; aLx *= 0.6; }
  else if (pose > 1.5 && pose < 2.5) { aRx = -1.3; aRz = -0.18; fR = -0.5; hx = -0.06; hy *= 0.2; }
  else if (pose > 2.5 && pose < 3.5) { aLx = 0.12 + aLx * 0.3; aRx = 0.12 + aRx * 0.3; fL = -0.45; fR = -0.45; aLz = 0.05; aRz = -0.05; }
  else if (pose > 3.5) {
    // seated at a slot or a table: thighs forward, shins down, hands out in front, a little lower and leaning in
    tL = -1.5; tR = -1.5; kL = 1.45; kR = 1.5; aLx = -0.5; aRx = -0.55; fL = -0.8; fR = -0.7; aLz = 0.1; aRz = -0.1;
    roll *= 0.3; sway = 0.0; bob = -0.15; lean = 0.12; croll *= 0.4;
  }
  // the chain, leaf to root
  if (bi == 4 || bi == 6) {
    vec3 j = (bi == 4 ? ${J(4)} : ${J(6)}) + vec3(shift, 0.0, 0.0);
    mat3 R = pplRX(bi == 4 ? fL : fR);
    p = R * (p - j) + j; n = R * n;
  }
  if (bi >= 3 && bi <= 6) {
    bool L = bi <= 4;
    vec3 j = (L ? ${J(3)} : ${J(5)}) + vec3(shift, 0.0, 0.0);
    mat3 R = pplRX(L ? aLx : aRx) * pplRZ(L ? aLz : aRz);
    p = R * (p - j) + j; n = R * n;
  }
  if (bi == 2) { vec3 j = ${J(2)}; mat3 R = pplRX(hx) * pplRY(hy); p = R * (p - j) + j; n = R * n; }
  if (bi >= 1 && bi <= 6) { vec3 j = ${J(1)}; mat3 R = pplRX(lean) * pplRY(ctw) * pplRZ(croll); p = R * (p - j) + j; n = R * n; }
  if (bi == 8 || bi == 10) {
    vec3 j = (bi == 8 ? ${J(8)} : ${J(10)}) + vec3(shift, 0.0, 0.0);
    mat3 R = pplRX(bi == 8 ? kL : kR);
    p = R * (p - j) + j; n = R * n;
  }
  if (bi >= 7) {
    vec3 j = (bi <= 8 ? ${J(7)} : ${J(9)}) + vec3(shift, 0.0, 0.0);
    mat3 R = pplRX(bi <= 8 ? tL : tR);
    p = R * (p - j) + j; n = R * n;
  }
  vec3 jh = ${J(0)};
  mat3 Rh = pplRY(twist) * pplRZ(roll);
  p = Rh * (p - jh) + jh + vec3(sway, bob, 0.0); n = Rh * n;
}
`;

export interface CrowdMaterial {
  mat: THREE.MeshStandardMaterial;
  time: { value: number };
  screen: { value: THREE.Color };
}
let crowdMat: CrowdMaterial | null = null;
/** The one material both crowd levels of detail share. */
export function crowdMaterial(): CrowdMaterial {
  if (crowdMat) return crowdMat;
  const time = { value: 0 };
  const screen = { value: new THREE.Color(0x10141a) };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.uniforms.uScreen = screen;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + CROWD_VERT_HEAD)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normal;\nvec3 pplPos = position;\npplPose(pplPos, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = pplPos;')
      .replace(
        '#include <color_vertex>',
        `vColor = vec4(1.0);
        float pslot = aPart.y;
        vec3 sc = vec3(1.0);
        if (pslot > 0.5 && pslot < 1.5) sc = pplUnpack(iColA.x);
        else if (pslot > 1.5 && pslot < 2.5) sc = pplUnpack(iColA.y);
        else if (pslot > 2.5 && pslot < 3.5) sc = pplUnpack(iColA.z);
        else if (pslot > 3.5 && pslot < 4.5) sc = pplUnpack(iColB.y);
        else if (pslot > 4.5 && pslot < 5.5) sc = pplUnpack(iColA.w);
        else if (pslot > 5.5 && pslot < 6.5) sc = pplUnpack(iColB.x);
        else if (pslot > 6.5 && pslot < 7.5) sc = vec3(0.04);
        // legs and sleeves: cloth above the cut, skin below (trousers / shorts / bare; long / short / no sleeves)
        float cut = -10.0;
        if (pslot > 7.5 && pslot < 8.5) { sc = pplUnpack(iColA.z); cut = pplOn(${OPT.legPants}.0) ? -10.0 : pplOn(${OPT.legShorts}.0) ? 0.56 : 10.0; }
        else if (pslot > 8.5) { sc = pplUnpack(iColA.y); cut = pplOn(${OPT.armLong}.0) ? -10.0 : pplOn(${OPT.armShort}.0) ? 1.25 : 10.0; }
        vCut = cut;
        vSkin = pplUnpack(iColA.x);
        vColor.rgb = color.rgb * sc;
        vEmit = pslot > 6.5 && pslot < 7.5 ? 1.0 : 0.0;
        vRest = position;
        bool pface = aPart.w > 0.5 && aPart.w < 1.5;
        bool pprint = aPart.w > 1.5 && ((pslot > 1.5 && pslot < 2.5) || pslot > 8.5);
        vPaint = vec4(pface ? 1.0 : pprint ? 2.0 : 0.0, pface ? iStyle.y : iColB.w, 0.0, 0.0);
        vAlt = pface ? pplUnpack(iColA.w) : pplUnpack(iColB.x);`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uScreen;\nvarying float vCut;\nvarying vec3 vSkin;\nvarying vec3 vRest;\nvarying vec4 vPaint;\nvarying vec3 vAlt;\nvarying float vEmit;\n' + PEOPLE_GLSL)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vRest.y < vCut) diffuseColor.rgb = vSkin;
        else {
          diffuseColor.rgb *= 1.0 - 0.22 * smoothstep(0.025, 0.0, vRest.y - vCut);
          if (vPaint.x > 0.5 && vPaint.x < 1.5) diffuseColor.rgb = pplFace(diffuseColor.rgb, vRest, vAlt, vPaint.y);
          else if (vPaint.x > 1.5) diffuseColor.rgb = pplPrint(diffuseColor.rgb, vAlt, vRest, vPaint.y);
        }`
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit * uScreen;');
  };
  m.customProgramCacheKey = () => 'pplCrowd';
  crowdMat = { mat: m, time, screen };
  return crowdMat;
}

/** sRGB hex → a float the crowd shader unpacks (exact in a float32: 24 bits). */
export const packHex = (hex: number) => hex & 0xffffff;

// ---------------------------------------------------------------- looks
const CROWD_SKIN = [0xf6d3b8, 0xf2c8a8, 0xe2ae88, 0xd09a70, 0xc88c64, 0xb87a52, 0x9b6342, 0x7a4a2e, 0x6b412a, 0x4e2e1c];
const CROWD_HAIR = [0x1c1512, 0x2a1a10, 0x4a2e1b, 0x6b4426, 0x9c6b30, 0xd8b158, 0xe6cf8a, 0x7b2c25, 0x8e939e, 0x111111, 0x3a2414];
const CROWD_TOP = [0xff5a7a, 0x2ec4ff, 0xffc83d, 0x4de088, 0xb874ff, 0xff7b3b, 0xf2f0eb, 0x26354d, 0x111111, 0xd8352b, 0xf4f4f4, 0x1e8c5a, 0x0f0f12, 0xe8486b, 0xf4e04a, 0x6a2a8a, 0x7fb8e0, 0x8a5a3a, 0x2b3c5c, 0xc8c0a8];
const CROWD_BOTTOM = [0x2b3c5c, 0x3b4d6b, 0x5a6f8a, 0x1a1a1e, 0x2c2b30, 0xd6cbb8, 0x8a7a5a, 0x453b31, 0x111114, 0x6a6a70, 0xf2f0eb];
const CROWD_SHOE = [0xe9e6de, 0xf4f4f4, 0x2a2b30, 0x111111, 0x8a5a34, 0xd23b3b, 0x3a5a9a];
const CROWD_ACC = [0x2b2b33, 0xe8486b, 0x2e7bd8, 0xc8a070, 0x1a1a1e, 0xf2efe6, 0xd9362b, 0x28995a, 0xffffff];

/** Overrides for people in uniform (casino dealers, cocktail servers) or with a given shirt. */
export interface LookOverride {
  top?: number;
  /** a waistcoat over the shirt: the vest becomes the top, the shirt shows down the front */
  vest?: number;
  skin?: number;
  hair?: number;
}
/** One passer-by's look: 12 floats (colours A, colours B + build + print, option bits, face bits, two spare). */
export function crowdLook(R: () => number, o: LookOverride = {}): number[] {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length) % a.length];
  const female = R() < 0.5;
  let opts = bit(female ? OPT.torsoF : OPT.torsoM);
  let skin = pick(CROWD_SKIN);
  let hair = pick(CROWD_HAIR);
  let top = pick(CROWD_TOP);
  let bottom = pick(CROWD_BOTTOM);
  let acc = pick(CROWD_ACC);
  let print: number = PRINT.plain;
  let face = 0;
  const heft = pick([0.9, 0.95, 1, 1, 1, 1.06, 1.12, 1.2, 1.28]);
  const k = R();
  // what they're wearing below the waist, and the sleeves
  let legs: number = OPT.legPants;
  let arms: number = OPT.armShort;
  if (female) {
    if (k < 0.18) {
      opts |= bit(OPT.dress);
      legs = OPT.legBare;
      arms = OPT.armBare;
      if (R() < 0.35) {
        print = PRINT.sequins;
        top = pick([0x111111, 0xc8c8d0, 0xd4af37, 0xb0103a, 0x2a1a6a]);
        acc = 0xffffff;
      } else if (R() < 0.4) print = PRINT.floral;
    } else if (k < 0.32) {
      opts |= bit(OPT.skirt);
      legs = OPT.legBare;
      arms = R() < 0.5 ? OPT.armBare : OPT.armShort;
    } else if (k < 0.62) {
      legs = OPT.legShorts;
      arms = R() < 0.45 ? OPT.armBare : OPT.armShort;
    } else arms = R() < 0.25 ? OPT.armLong : OPT.armShort;
    opts |= bit(pick([OPT.hLong, OPT.hLong, OPT.hPony, OPT.hBun, OPT.hCurly, OPT.hShort]));
    face = FACE.lashes | (R() < 0.55 ? FACE.lipstick : 0);
    if (R() < 0.1) {
      print = PRINT.sash;
      acc = pick([0xffffff, 0xff7ac8]);
    }
    if (R() < 0.25) opts |= bit(OPT.bag);
  } else {
    if (k < 0.42) legs = OPT.legShorts;
    arms = R() < 0.1 ? OPT.armBare : OPT.armShort;
    if (R() < 0.13) {
      opts |= bit(OPT.jacket);
      arms = OPT.armLong;
      legs = OPT.legPants;
      acc = pick([0xf2f0eb, 0x111111, 0x9ab8d8]);
    } else if (R() < 0.22) opts |= bit(OPT.collar);
    const hb = R(); // one in ten: bald
    if (hb < 0.9) opts |= bit(pick([OPT.hShort, OPT.hShort, OPT.hBuzz, OPT.hCurly, OPT.hShort]));
    if (R() < 0.4) face |= FACE.stubble;
  }
  if (!print) {
    const pr = R();
    if (pr < 0.2) {
      print = PRINT.floral; // Hawaiian shirts, a Strip staple
      acc = pick([0xffe066, 0xff6b9e, 0x63f5b8, 0xffffff]);
      if (arms === OPT.armBare) arms = OPT.armShort;
    } else if (pr < 0.3) {
      print = PRINT.stripes;
      acc = pick([0xffffff, 0x111111, 0x26354d]);
    } else if (pr < 0.36 && !female) {
      print = PRINT.plaid;
      acc = pick([0x111111, 0xd8352b, 0xf2f0eb]);
    } else if (pr < 0.5) {
      print = PRINT.logo;
      acc = pick([0xffffff, 0x111111, 0xffc83d, 0xd8352b]);
    }
  }
  opts |= bit(legs) | bit(arms);
  // hats: ball caps, cowboy hats (rodeo week), sun hats
  const hr = R();
  if (hr < 0.17) opts |= bit(OPT.capHat);
  else if (hr < 0.24) opts |= bit(OPT.wideHat);
  if (opts & (bit(OPT.capHat) | bit(OPT.wideHat))) {
    if (opts & (bit(OPT.hBun) | bit(OPT.hCurly))) opts = (opts & ~(bit(OPT.hBun) | bit(OPT.hCurly))) | bit(OPT.hShort);
    if (!(opts & bit(OPT.bag))) acc = pick(opts & bit(OPT.wideHat) ? [0xd8c49a, 0x2a2018, 0xf2efe6, 0xe6cf98] : CROWD_ACC);
  }
  if (R() < 0.22) face |= FACE.shades;
  if (R() < 0.15 && skin === 0xf6d3b8) face |= FACE.blueEyes;
  const br = R();
  if (br < 0.1) opts |= bit(OPT.backpack);
  else if (br < 0.16) opts |= bit(OPT.fanny);
  if (legs === OPT.legShorts && R() < 0.3) bottom = pick([0xd6cbb8, 0x5a6f8a, 0x2b3c5c, 0x8a7a5a]);
  if (top === bottom) top = 0xf2f0eb;
  if (o.top !== undefined) top = o.top;
  if (o.skin !== undefined) skin = o.skin;
  if (o.hair !== undefined) hair = o.hair;
  if (o.vest !== undefined && o.vest !== o.top) {
    // the uniform: waistcoat, the shirt showing down the front, long sleeves, dark trousers, no hat or bag
    acc = top;
    top = o.vest;
    print = PRINT.plain;
    bottom = 0x16171b;
    const off = bit(OPT.legShorts) | bit(OPT.legBare) | bit(OPT.armShort) | bit(OPT.armBare) | bit(OPT.skirt) | bit(OPT.dress) | bit(OPT.capHat) | bit(OPT.wideHat) | bit(OPT.backpack) | bit(OPT.fanny) | bit(OPT.bag) | bit(OPT.collar);
    opts = (opts | off) ^ off;
    opts |= bit(OPT.legPants) | bit(OPT.armLong) | bit(OPT.jacket);
    face = (face | FACE.shades) ^ FACE.shades;
  }
  return [packHex(skin), packHex(top), packHex(bottom), packHex(hair), packHex(acc), packHex(pick(CROWD_SHOE)), heft, print, opts, face, 0, 0];
}

// ---------------------------------------------------------------- a batch of crowd people (one draw call)
const crowdGeoCache = new Map<number, THREE.BufferGeometry>();
/** Poses the crowd shader knows (iAnim.z). */
export const POSE = { free: 0, phone: 1, film: 2, pockets: 3, sit: 4 } as const;
/** An instanced batch of crowd-material people at one level of detail: set each one's look, place and pose. */
export class CrowdBatch {
  readonly mesh: THREE.InstancedMesh;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  constructor(lod: number, cap: number) {
    let base = crowdGeoCache.get(lod);
    if (!base) crowdGeoCache.set(lod, (base = bodyGeometry(crowdBody(lod))));
    const g = base.clone();
    this.attrs = ['iColA', 'iColB', 'iStyle', 'iAnim'].map((n) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      g.setAttribute(n, a);
      return a;
    });
    this.mesh = new THREE.InstancedMesh(g, crowdMaterial().mat, cap);
  }
  /** A look from crowdLook (12 floats). */
  setLook(k: number, look: ArrayLike<number>): void {
    for (let a = 0; a < 3; a++) for (let j = 0; j < 4; j++) (this.attrs[a].array as Float32Array)[k * 4 + j] = look[a * 4 + j];
  }
  setAnim(k: number, phase: number, walk: number, pose: number, seed: number): void {
    (this.attrs[3].array as Float32Array).set([phase, walk, pose, seed], k * 4);
  }
  /** Mark the first n people as changed (just the stride and pose when looks is false). */
  touch(n: number, looks = true): void {
    for (const a of looks ? this.attrs : [this.attrs[3]]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 4);
      a.needsUpdate = true;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
