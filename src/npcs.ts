import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type TouristProp = 'yard-drink' | 'camera' | 'cig' | 'bag' | 'none';
export type Outfit = 'tourist' | 'guard' | 'elvis' | 'showgirl' | 'slapper' | 'officer' | 'animal-control' | 'worker' | 'robot' | 'statue' | 'water';
/** Street performers. robot/statue are generic costumed acts; water = a bottled-water seller with a cooler. */
export type PerformerKind = 'elvis' | 'showgirl' | 'slapper' | 'robot' | 'statue' | 'water';

export interface TouristRoute {
  pts: Array<[number, number]>;
  prop: TouristProp;
}
export interface PerformerSpot {
  kind: PerformerKind;
  x: number;
  z: number;
  facing: number;
  /** Standing height (living statues stand on a pedestal). */
  y?: number;
}
export interface GuardRoute {
  name: string;
  pts: Array<[number, number]>;
  kick: [number, number];
  /** Casino floor rectangle the guard protects (chases end when the cat leaves it). */
  zone: { minX: number; maxX: number; minZ: number; maxZ: number };
}
export interface CrowdConfig {
  tourists: TouristRoute[];
  performers: PerformerSpot[];
  guards: GuardRoute[];
}

/** Knocked-over state (Goat-Simulator style): fall, slide, lie there, get back up. */
export interface KnockState {
  t: number;
  vx: number;
  vz: number;
  yaw: number;
  y0: number;
}

export interface Rig {
  knock?: KnockState | null;
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  head: THREE.Group;
  cigMesh: THREE.Object3D | null;
}

export interface TouristNPC extends Rig {
  id: number;
  mesh: THREE.Group;
  waypoints: THREE.Vector3[];
  wpIndex: number;
  speed: number;
  pauseTimer: number;
  begCooldown: number;
  reactCooldown: number;
  hasCig: boolean;
  hasCamera: boolean;
  cigStolen: boolean;
  speechSprite: THREE.Sprite | null;
  speechTimer: number;
  walkPhase: number;
  lookAtCat: number;
}

export interface PerformerNPC extends Rig {
  id: number;
  kind: PerformerKind;
  mesh: THREE.Group;
  begCooldown: number;
  speechSprite: THREE.Sprite | null;
  speechTimer: number;
  chatterTimer: number;
}

export interface GuardNPC extends Rig {
  id: number;
  mesh: THREE.Group;
  waypoints: THREE.Vector3[];
  wpIndex: number;
  casinoName: string;
  kickPoint: THREE.Vector3;
  zone: GuardRoute['zone'];
  walkPhase: number;
  mode: 'patrol' | 'chase' | 'return';
  lostTimer: number;
  flashMat: THREE.MeshBasicMaterial | null;
  speechSprite: THREE.Sprite | null;
  speechTimer: number;
}

export interface PursuerNPC extends Rig {
  id: number;
  kind: 'ac' | 'cop';
  mesh: THREE.Group;
  speed: number;
  walkPhase: number;
  speechSprite: THREE.Sprite | null;
  speechTimer: number;
  shoutTimer: number;
}

const PURSUER_LINES: Record<'ac' | 'cop', string[]> = {
  ac: ['Animal Control! Drop the cigarette!', 'Here kitty kitty… GOTCHA— no.', 'That cat is NOT chipped!', 'Get the net! The NET!', 'Suspect is a large brown tabby!'],
  cop: ['LVMPD! Stop right there… cat!', 'Dispatch, it’s the smoking cat again', 'Freeze! …Do cats freeze?', 'Suspect fleeing on four legs!'],
};

const SKIN_TONES = [0xf2c8a8, 0xe2ae88, 0xc88c64, 0x9b6342, 0x6b412a];
const HAIR_COLORS = [0x1c1512, 0x4a2e1b, 0x9c6b30, 0xd8b158, 0x7b2c25, 0x8e939e];
const SHIRT_COLORS = [0xff5a7a, 0x2ec4ff, 0xffc83d, 0x4de088, 0xb874ff, 0xff7b3b, 0xf2f0eb, 0x26354d];
const PANTS_COLORS = [0x212c42, 0x2c2b30, 0x453b31, 0x3b4d6b, 0xd6cbb8];

const PERFORMER_LINES: Record<PerformerKind, string[]> = {
  elvis: ['Thank you, thank you very much', 'Photo with the King? $20!', 'Viva Las Vegas, baby!', 'Ain’t nothin’ but a hound cat'],
  showgirl: ['Photos with the showgirls!', 'Tips appreciated, darling', 'Strike a pose, kitty!', 'Feathers out!'],
  slapper: ['*slap slap* Free entry tonight!', 'VIP list, VIP list!', 'Club promos here!', '*slap* *slap*'],
  robot: ['*beep boop* PHOTO: $5', 'DANCE MODE: ENGAGED', 'I AM NOT A ROBOT. TIPS.', '*servo whirr*'],
  statue: ['…', '*blinks*', '(does not move)', '*winks at the cat*'],
  water: ['Water! One dollar! Ice cold!', 'Stay hydrated, kitty', 'Water, water, water!', 'Gatorade three bucks!'],
};

const hawaiianTextures = new Map<number, THREE.CanvasTexture>();
function makeHawaiianTexture(baseHex: number): THREE.CanvasTexture {
  const cached = hawaiianTextures.get(baseHex);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = `#${new THREE.Color(baseHex).getHexString()}`;
    ctx.fillRect(0, 0, 128, 128);
    const accents = ['#ffe066', '#ff6b9e', '#63f5b8', '#ffffff'];
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = accents[i % accents.length];
      const x = (i * 37) % 128;
      const y = (i * 59) % 128;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 8, y - 2, 16, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  hawaiianTextures.set(baseHex, tex);
  return tex;
}

function makeSpeechTexture(text: string, accent = '#ffd25a'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(18, 22, 36, 0.94)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(14, 14, 484, 108, 28);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(234, 120);
    ctx.lineTo(256, 150);
    ctx.lineTo(278, 120);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff5e0';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68, 456);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- people
// Every person is six moving pieces (body, head, two arms, two legs). Each piece is ONE mesh: its parts are
// merged into a vertex-coloured geometry that is cached by recipe and shared by everyone who looks the same,
// all drawn with one shared material. Only special bits (Hawaiian print, glowing yard cups, the cigarette,
// the guard's torch beam) add their own small meshes.
let humanMat: THREE.MeshStandardMaterial | null = null;
const HUMAN_MAT = () => (humanMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.02 }));
const primCache = new Map<string, THREE.BufferGeometry>();
const pieceCache = new Map<string, THREE.BufferGeometry>();
const hMat4 = new THREE.Matrix4();
const hQuat = new THREE.Quaternion();
const hEuler = new THREE.Euler();
const hPos = new THREE.Vector3();
const hScale = new THREE.Vector3();

/** Cached primitive, stripped to position + normal (no index) so pieces merge cleanly. */
function prim(key: string, make: () => THREE.BufferGeometry): [string, THREE.BufferGeometry] {
  let g = primCache.get(key);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    primCache.set(key, g);
  }
  return [key, g];
}
/** Tapered capsule hanging down from y = 0 (radius r1 at the top, r2 at the bottom, total length len). */
const taper = (r1: number, r2: number, len: number) =>
  prim(`tp${r1}|${r2}|${len}`, () => {
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, -len)];
    for (let i = 1; i <= 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * (Math.PI / 2);
      pts.push(new THREE.Vector2(r2 * Math.cos(a), -len + r2 + r2 * Math.sin(a)));
    }
    for (let i = 0; i <= 3; i++) {
      const a = (i / 3) * (Math.PI / 2);
      pts.push(new THREE.Vector2(r1 * Math.cos(a) + 1e-4, -r1 + r1 * Math.sin(a)));
    }
    pts[pts.length - 1].x = 0;
    return new THREE.LatheGeometry(pts, 8);
  });
const sphere = (r: number, ws = 8, hs = 6, thetaLen = Math.PI) => prim(`sp${r}|${ws}|${hs}|${thetaLen}`, () => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, thetaLen));
const box = (w: number, h: number, d: number) => prim(`bx${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt: number, rb: number, h: number, seg = 8, open = false) => prim(`cy${rt}|${rb}|${h}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
const cone = (r: number, h: number, seg = 5) => prim(`co${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const lathe = (key: string, pts: Array<[number, number]>, seg = 12) => prim(`la${key}`, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
const torus = (r: number, t: number, arc: number) => prim(`to${r}|${t}|${arc}`, () => new THREE.TorusGeometry(r, t, 4, 8, arc));

const TORSO_M: Array<[number, number]> = [[0.176, 0.93], [0.17, 1.0], [0.182, 1.1], [0.204, 1.22], [0.214, 1.31], [0.204, 1.385], [0.165, 1.435], [0.09, 1.47], [0, 1.48]];
const TORSO_F: Array<[number, number]> = [[0.172, 0.94], [0.15, 1.03], [0.163, 1.12], [0.19, 1.22], [0.19, 1.29], [0.178, 1.36], [0.148, 1.42], [0.08, 1.46], [0, 1.47]];
const HIPS_M: Array<[number, number]> = [[0, 0.79], [0.12, 0.79], [0.172, 0.83], [0.185, 0.89], [0.178, 0.95]];
const HIPS_F: Array<[number, number]> = [[0, 0.79], [0.13, 0.79], [0.19, 0.84], [0.2, 0.9], [0.174, 0.96]];

/** Collects coloured parts for one moving piece, then builds (or reuses) its merged geometry. */
class Piece {
  private key = '';
  private readonly parts: Array<{ g: THREE.BufferGeometry; c: number; m: THREE.Matrix4 }> = [];
  add([k, g]: [string, THREE.BufferGeometry], c: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
    this.key += `${k}#${c}#${[x, y, z, rx, ry, rz, sx, sy, sz].map((v) => Math.round(v * 1000)).join(',')};`;
    hMat4.compose(hPos.set(x, y, z), hQuat.setFromEuler(hEuler.set(rx, ry, rz)), hScale.set(sx, sy, sz));
    this.parts.push({ g, c, m: hMat4.clone() });
  }
  mesh(cast = true): THREE.Mesh {
    let geo = pieceCache.get(this.key);
    if (!geo) {
      const col = new THREE.Color();
      const list = this.parts.map(({ g, c, m }) => {
        const out = g.clone().applyMatrix4(m);
        col.setHex(c);
        const n = out.attributes.position.count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          arr[i * 3] = col.r;
          arr[i * 3 + 1] = col.g;
          arr[i * 3 + 2] = col.b;
        }
        out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        return out;
      });
      geo = mergeGeometries(list, false)!;
      for (const g of list) g.dispose();
      geo.computeBoundingSphere();
      pieceCache.set(this.key, geo);
    }
    const m = new THREE.Mesh(geo, HUMAN_MAT());
    m.castShadow = cast;
    return m;
  }
}

const hawaiianMats = new Map<number, THREE.MeshStandardMaterial>();
const cupMats = new Map<number, THREE.MeshStandardMaterial>();
let cigParts: { paper: THREE.BufferGeometry; ember: THREE.BufferGeometry; paperMat: THREE.Material; emberMat: THREE.Material } | null = null;

type HairStyle = 'short' | 'side' | 'long' | 'pony' | 'bun' | 'bald' | 'curly' | 'buzz';
const MALE_HAIR: HairStyle[] = ['short', 'side', 'buzz', 'bald', 'curly', 'short', 'side'];
const FEMALE_HAIR: HairStyle[] = ['long', 'pony', 'bun', 'curly', 'long', 'side'];

export function buildHuman(seed: number, outfit: Outfit, prop: TouristProp): Rig & { flashMat: THREE.MeshBasicMaterial | null } {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const isGuard = outfit === 'guard' || outfit === 'officer';
  const isAC = outfit === 'animal-control';
  const tourist = outfit === 'tourist';
  const female = outfit === 'showgirl' || (tourist && seed % 2 === 1);

  const painted = outfit === 'robot' ? 0xc4c8d0 : outfit === 'statue' ? 0xc8a24a : 0;
  const skin = painted || SKIN_TONES[seed % SKIN_TONES.length];
  const hair = painted || (outfit === 'elvis' ? 0x0b0b10 : HAIR_COLORS[(seed * 3) % HAIR_COLORS.length]);
  const shirt = painted ? painted : outfit === 'water' ? 0xf4f4f0 :
    outfit === 'guard' ? 0x162038 : outfit === 'officer' ? 0x1b2433 : isAC ? 0xc2a878 : outfit === 'worker' ? 0xf4f4f4 : outfit === 'elvis' ? 0xf4f1ea : outfit === 'showgirl' ? 0xff3fa4 : outfit === 'slapper' ? 0x8cff3a : SHIRT_COLORS[(seed * 5) % SHIRT_COLORS.length];
  const pants = painted ? painted : outfit === 'water' ? 0x2a3a5a :
    outfit === 'guard' ? 0x0e1320 : outfit === 'officer' ? 0x141a26 : isAC ? 0x4a4f36 : outfit === 'worker' ? 0x2a2a2e : outfit === 'elvis' ? 0xf4f1ea : outfit === 'showgirl' ? 0xe0a080 : outfit === 'slapper' ? 0x1c1f2a : PANTS_COLORS[(seed * 7) % PANTS_COLORS.length];
  const shoe = painted ? painted : isGuard || outfit === 'slapper' ? 0x0c0d12 : outfit === 'showgirl' ? 0xffd34d : outfit === 'elvis' ? 0xf4f1ea : [0xe9e6de, 0x2a2b30, 0x8a5a34, 0xd23b3b][(seed * 11) % 4];
  const sole = 0xf2f2f0;
  const gold = 0xf4c44e;
  const dark = 0x15171d;
  const isHawaiian = tourist && seed % 3 === 0;
  const skirt = tourist && female && seed % 3 === 2;
  const shorts = tourist && !skirt && (seed >> 1) % 3 === 0;
  const longSleeves = isGuard || isAC || outfit === 'elvis';
  const torso = female ? TORSO_F : TORSO_M;
  const tKey = female ? 'F' : 'M';

  // ---------------- body: hips, torso, shoulders, neck, outfit
  const body = new Piece();
  body.add(lathe(`hip${tKey}`, female ? HIPS_F : HIPS_M), skirt ? skin : pants, 0, 0, 0, 0, 0, 0, 1, 1, 0.68);
  if (!isHawaiian) body.add(lathe(`tor${tKey}`, torso), shirt, 0, 0, 0, 0, 0, 0, 1, 1, 0.66);
  for (const s of [-1, 1]) body.add(sphere(0.074, 8, 6), shirt, s * 0.2, 1.385, 0);
  body.add(cyl(0.052, 0.058, 0.16, 8, true), skin, 0, 1.52, 0);
  const beltCol = outfit === 'elvis' ? gold : isGuard || isAC ? 0x111111 : 0x2a211b;
  if (outfit !== 'showgirl') {
    body.add(cyl(0.183, 0.183, 0.045, 12, true), beltCol, 0, 0.945, 0, 0, 0, 0, 1, 1, 0.69);
    body.add(box(outfit === 'elvis' ? 0.16 : 0.06, 0.05, 0.02), gold, 0, 0.945, 0.128);
  }
  if (skirt) body.add(cyl(0.18, 0.27, 0.36, 12, true), pants, 0, 0.78, 0, 0, 0, 0, 1, 1, 0.76);
  if (isGuard) {
    body.add(box(0.05, 0.27, 0.02), outfit === 'officer' ? 0x0c0f16 : 0x5a1018, 0, 1.25, 0.136);
    body.add(box(0.1, 0.06, 0.02), 0xf2f2f2, 0, 1.42, 0.12, 0.3);
    body.add(cyl(0.034, 0.034, 0.012, 8), gold, 0.1, 1.3, 0.142, Math.PI / 2);
    if (outfit === 'officer') {
      body.add(cyl(0.21, 0.195, 0.4, 12, true), 0x22262e, 0, 1.22, 0, 0, 0, 0, 1, 1, 0.74);
      body.add(cyl(0.2, 0.2, 0.08, 12, true), 0x111111, 0, 0.93, 0, 0, 0, 0, 1, 1, 0.72);
      body.add(box(0.07, 0.17, 0.11), 0x111111, -0.2, 0.88, 0.02);
      body.add(box(0.08, 0.06, 0.03), 0x9fb4d0, 0.12, 1.34, 0.15);
    }
  } else if (isAC) {
    body.add(box(0.1, 0.07, 0.02), 0x2d5a2d, -0.1, 1.3, 0.138);
    body.add(box(0.08, 0.05, 0.02), 0x2d5a2d, 0.1, 1.3, 0.138);
  } else if (outfit === 'worker') {
    body.add(box(0.32, 0.5, 0.015), 0xffffff, 0, 1.0, 0.132);
    body.add(box(0.33, 0.035, 0.016), 0xd81e2a, 0, 1.25, 0.133);
  } else if (outfit === 'elvis') {
    for (const s of [-1, 1]) body.add(box(0.12, 0.17, 0.03), shirt, s * 0.085, 1.47, 0.06, 0, 0, s * 0.35);
    body.add(cyl(0.05, 0.005, 0.2, 3), skin, 0, 1.36, 0.128, 0, 0, 0, 1, 1, 0.25);
    for (let i = 0; i < 8; i++) body.add(sphere(0.013, 5, 4), gold, (i % 2 ? 1 : -1) * (0.07 + (i % 4) * 0.01), 1.06 + i * 0.045, 0.13);
    body.add(box(0.46, 0.62, 0.02), 0xf4f1ea, 0, 1.12, -0.14, 0.08);
    body.add(box(0.48, 0.03, 0.025), gold, 0, 1.43, -0.13);
  } else if (outfit === 'showgirl') {
    for (let i = 0; i < 9; i++) {
      const a = -1.1 + i * 0.275;
      body.add(cone(0.09, 0.95, 5), i % 2 ? 0xff5fb6 : 0xfff0f8, Math.sin(a) * 0.45, 1.45 + Math.cos(a) * 0.42, -0.2, 0, 0, -a);
    }
    for (let i = 0; i < 7; i++) body.add(sphere(0.014, 5, 4), 0xfff6c0, (i - 3) * 0.045, 1.2 + Math.abs(i - 3) * 0.02, 0.122);
    body.add(cyl(0.195, 0.195, 0.05, 12, true), gold, 0, 0.95, 0, 0, 0, 0, 1, 1, 0.7);
  } else if (outfit === 'slapper') {
    body.add(box(0.36, 0.06, 0.2), 0xf2f2f2, 0, 1.3, 0.04);
  } else if (tourist && seed % 6 === 5) {
    body.add(box(0.16, 0.08, 0.06), [0x2b2b33, 0xe8486b, 0x2e7bd8][seed % 3], 0.06, 0.9, 0.13); // fanny pack
  }
  if (tourist && prop === 'camera') {
    body.add(box(0.14, 0.09, 0.07), 0x1c1f28, 0, 1.18, 0.17);
    body.add(cyl(0.032, 0.035, 0.06, 10), 0x0b0e14, 0, 1.18, 0.22, Math.PI / 2);
    body.add(box(0.012, 0.3, 0.012), 0x1c1f28, 0.06, 1.33, 0.11, 0.4);
  }
  g.add(body.mesh());
  if (isHawaiian) {
    let hm = hawaiianMats.get(shirt);
    if (!hm) hawaiianMats.set(shirt, (hm = new THREE.MeshStandardMaterial({ map: makeHawaiianTexture(shirt), roughness: 0.72 })));
    const tor = new THREE.Mesh(new THREE.LatheGeometry(torso.map(([r, y]) => new THREE.Vector2(r, y)), 12), hm);
    tor.scale.set(1, 1, 0.66);
    tor.castShadow = true;
    g.add(tor);
  }

  // ---------------- head: face, hair, hats
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  g.add(head);
  const h = new Piece();
  h.add(sphere(0.128, 14, 10), skin, 0, 0.01, 0, 0, 0, 0, 0.94, 1.04, 1.0);
  h.add(sphere(0.104, 12, 8), skin, 0, -0.045, 0.012, 0, 0, 0, 0.95, 0.9, 1.0);
  for (const s of [-1, 1]) h.add(sphere(0.03, 6, 5), skin, s * 0.12, -0.005, -0.005, 0, 0, 0, 0.45, 1, 0.75);
  h.add(sphere(0.022, 6, 5), skin, 0, -0.022, 0.124, 0, 0, 0, 0.85, 1.05, 1.15);
  h.add(torus(0.026, 0.0055, Math.PI), 0x7a2a2a, 0, -0.058, 0.111, 0, 0, Math.PI);
  const hasShades = isGuard || isAC || outfit === 'elvis' || (tourist && seed % 4 === 0);
  if (hasShades) {
    const frame = outfit === 'elvis' ? gold : 0x12141c;
    const lens = isGuard ? 0x090b10 : outfit === 'elvis' ? 0x5a3a12 : [0x261436, 0x10202e, 0x3a1a10][seed % 3];
    h.add(box(0.19, 0.016, 0.02), frame, 0, 0.03, 0.124);
    for (const s of [-1, 1]) h.add(box(0.066, 0.046, 0.016), lens, s * 0.046, 0.016, 0.127);
  } else {
    for (const s of [-1, 1]) {
      h.add(sphere(0.024, 8, 6), 0xfbfbf6, s * 0.044, 0.018, 0.112, 0, 0, 0, 1, 1.2, 0.55);
      h.add(sphere(0.014, 6, 5), 0x1d1610, s * 0.044, 0.016, 0.122, 0, 0, 0, 1, 1.15, 0.6);
    }
  }
  for (const s of [-1, 1]) h.add(box(0.044, 0.011, 0.012), hair === 0x8e939e ? 0x6b6f78 : hair, s * 0.046, hasShades ? 0.06 : 0.052, 0.117, 0, 0, -s * 0.12);

  const style: HairStyle = outfit === 'elvis' ? 'short' : isGuard || isAC ? 'buzz' : outfit === 'showgirl' ? 'bun' : outfit === 'worker' ? (female ? 'pony' : 'short') : (female ? FEMALE_HAIR : MALE_HAIR)[(seed * 7 + 3) % (female ? FEMALE_HAIR.length : MALE_HAIR.length)];
  const cap = (r: number, tilt: number, y = 0.018) => h.add(sphere(r, 12, 6, Math.PI * 0.52), hair, 0, y, -0.008, tilt, 0, 0, 0.97, 1.04, 1.02);
  if (style === 'short') cap(0.136, -0.42);
  else if (style === 'buzz') cap(0.131, -0.45);
  else if (style === 'side') {
    cap(0.137, -0.4);
    h.add(box(0.16, 0.035, 0.06), hair, 0.025, 0.088, 0.098, -0.45, 0, -0.28);
  } else if (style === 'long') {
    cap(0.138, -0.38);
    h.add(sphere(0.135, 10, 8), hair, 0, -0.1, -0.06, 0, 0, 0, 1.03, 1.55, 0.62);
    for (const s of [-1, 1]) h.add(box(0.035, 0.2, 0.08), hair, s * 0.118, -0.07, -0.01);
  } else if (style === 'pony') {
    cap(0.137, -0.4);
    h.add(sphere(0.06, 8, 6), hair, 0, -0.04, -0.155, 0.3, 0, 0, 0.8, 1.6, 0.8);
    h.add(sphere(0.022, 6, 4), 0xff5e8e, 0, 0.03, -0.14);
  } else if (style === 'bun') {
    cap(0.137, -0.4);
    h.add(sphere(0.062, 8, 6), hair, 0, 0.11, -0.1);
  } else if (style === 'bald') {
    h.add(torus(0.121, 0.022, Math.PI), hair, 0, -0.004, -0.004, -Math.PI / 2);
  } else if (style === 'curly') {
    h.add(prim('ico0.146', () => new THREE.IcosahedronGeometry(0.146, 1)), hair, 0, 0.062, -0.036, 0, seed, 0, 1.05, 0.92, 1.02);
  }

  if (isGuard || isAC) {
    if (isAC) {
      h.add(sphere(0.142, 12, 5, Math.PI * 0.45), 0x4a4f36, 0, 0.035, 0);
      h.add(box(0.17, 0.016, 0.13), 0x4a4f36, 0, 0.068, 0.14, 0.12);
    } else {
      h.add(cyl(0.143, 0.135, 0.08, 12), 0x13192b, 0, 0.11, 0);
      h.add(cyl(0.162, 0.15, 0.035, 12), 0x13192b, 0, 0.16, 0.01);
      h.add(box(0.2, 0.018, 0.11), 0x090b12, 0, 0.075, 0.125, 0.15);
      h.add(box(0.04, 0.04, 0.01), gold, 0, 0.13, 0.145);
    }
  } else if (outfit === 'worker') {
    h.add(box(0.3, 0.09, 0.14), 0xffffff, 0, 0.12, 0);
    h.add(box(0.31, 0.025, 0.145), 0xd81e2a, 0, 0.09, 0);
  } else if (outfit === 'elvis') {
    h.add(sphere(0.1, 10, 8), hair, 0, 0.13, 0.05, 0, 0, 0, 1.2, 0.72, 1.15);
    for (const s of [-1, 1]) h.add(box(0.025, 0.1, 0.045), hair, s * 0.122, -0.035, 0.045);
  } else if (outfit === 'showgirl') {
    h.add(cyl(0.16, 0.15, 0.06, 14), gold, 0, 0.1, 0, -0.15);
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + i * 0.3;
      h.add(cone(0.035, 0.55, 5), i % 2 ? 0xff5fb6 : 0xfff0f8, Math.sin(a) * 0.22, 0.36 + Math.cos(a) * 0.12, -0.02, 0, 0, -a * 0.8);
    }
  } else if (outfit === 'robot') {
    h.add(box(0.3, 0.3, 0.3), 0xb8bcc6, 0, 0.02, 0);
    h.add(box(0.22, 0.07, 0.02), 0x30e0ff, 0, 0.03, 0.155);
    h.add(cyl(0.012, 0.012, 0.18, 5), 0x9aa0aa, 0, 0.25, 0);
    h.add(sphere(0.03, 6, 4), 0xff3030, 0, 0.35, 0);
  } else if (outfit === 'statue') {
    h.add(torus(0.13, 0.02, Math.PI * 2), 0xa8822a, 0, 0.06, 0, Math.PI / 2);
  } else if (outfit === 'slapper' || outfit === 'water' || (tourist && seed % 4 === 1)) {
    const capCol = outfit === 'slapper' ? 0x111111 : outfit === 'water' ? 0x1e5fb8 : [0xd9362b, 0x2665d8, 0x28995a, 0xf2f2f0][seed % 4];
    h.add(sphere(0.143, 12, 5, Math.PI * 0.45), capCol, 0, 0.035, 0, -0.1);
    h.add(box(0.17, 0.016, 0.14), capCol, 0, 0.07, 0.145, 0.15);
  } else if (tourist && seed % 9 === 4) {
    const hatCol = [0xd8c49a, 0x2a2018, 0xf2efe6][seed % 3];
    h.add(cyl(0.25, 0.25, 0.02, 14), hatCol, 0, 0.09, 0, 0.06, 0, 0, 1, 1, 0.82);
    h.add(cyl(0.1, 0.128, 0.13, 10), hatCol, 0, 0.16, 0, 0.06, 0, 0, 1, 1, 1.12);
    h.add(cyl(0.129, 0.129, 0.025, 10, true), 0x5a2a14, 0, 0.11, 0.004, 0.06, 0, 0, 1, 1, 1.12);
  } else if (tourist && female && seed % 5 === 3) {
    h.add(cyl(0.24, 0.24, 0.012, 16), 0xe6cf98, 0, 0.085, 0, -0.08);
    h.add(sphere(0.135, 12, 5, Math.PI * 0.5), 0xe6cf98, 0, 0.07, -0.01, -0.08);
    h.add(cyl(0.137, 0.137, 0.03, 12, true), 0xd8362b, 0, 0.09, -0.008, -0.08);
  }
  head.add(h.mesh());

  // ---------------- legs (pivot at the hip)
  const legSkin = outfit === 'showgirl' ? 0xd49a7a : skin;
  const buildLeg = (side: number): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.105, 0.8, 0);
    const p = new Piece();
    if (skirt || outfit === 'showgirl') {
      p.add(taper(0.08, 0.064, 0.42), legSkin, 0, 0.03, 0);
      p.add(taper(0.062, 0.046, 0.36), legSkin, 0, -0.37, 0);
    } else if (shorts) {
      p.add(taper(0.094, 0.086, 0.27), pants, 0, 0.04, 0);
      p.add(taper(0.07, 0.064, 0.2), skin, 0, -0.2, 0);
      p.add(taper(0.064, 0.048, 0.36), skin, 0, -0.37, 0);
      p.add(cyl(0.05, 0.052, 0.07, 8, true), 0xf4f4f2, 0, -0.69, 0);
    } else {
      p.add(taper(0.088, 0.068, 0.43), pants, 0, 0.04, 0);
      p.add(taper(0.066, 0.052, 0.38), pants, 0, -0.37, 0);
      if (outfit === 'elvis') p.add(cyl(0.065, 0.112, 0.2, 10, true), pants, 0, -0.64, 0);
    }
    if (outfit === 'showgirl') {
      p.add(sphere(0.055, 8, 5, Math.PI / 2), shoe, 0, -0.75, 0.05, 0, 0, 0, 0.8, 0.6, 1.5);
      p.add(box(0.03, 0.07, 0.03), shoe, 0, -0.765, -0.03);
    } else {
      p.add(sphere(0.07, 8, 5, Math.PI / 2), shoe, 0, -0.77, 0.045, 0, 0, 0, 0.82, 0.78, 1.7);
      p.add(cyl(0.07, 0.07, 0.03, 8), sole, 0, -0.783, 0.045, 0, 0, 0, 0.82, 1, 1.7);
    }
    leg.add(p.mesh());
    return leg;
  };
  const leftLeg = buildLeg(1);
  const rightLeg = buildLeg(-1);
  g.add(leftLeg, rightLeg);

  // ---------------- arms (pivot at the shoulder) + held props
  let flashMat: THREE.MeshBasicMaterial | null = null;
  let cigMesh: THREE.Object3D | null = null;
  const sleeve = shirt;
  const buildArm = (side: number): THREE.Group => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.245, 1.38, 0);
    const p = new Piece();
    if (longSleeves) {
      p.add(taper(0.064, 0.052, 0.31), sleeve, 0, 0.03, 0);
      p.add(taper(0.05, 0.042, 0.26), sleeve, 0, -0.25, 0);
    } else {
      p.add(taper(0.07, 0.064, 0.16), outfit === 'showgirl' ? skin : sleeve, 0, 0.035, 0);
      p.add(taper(0.052, 0.045, 0.27), skin, 0, -0.03, 0);
      p.add(taper(0.046, 0.038, 0.26), skin, 0, -0.26, 0);
    }
    if (outfit === 'showgirl') p.add(cyl(0.05, 0.05, 0.04, 8, true), gold, 0, -0.46, 0);
    p.add(sphere(0.044, 8, 6), skin, 0, -0.545, 0.005, 0, 0, 0, 0.78, 1.2, 0.62);
    p.add(sphere(0.018, 5, 4), skin, -side * 0.022, -0.515, 0.032, 0, 0, 0, 1, 1.6, 1);
    const right = side < 0;
    if (right && isAC) {
      p.add(cyl(0.02, 0.02, 1.9, 6), 0xb8bcc6, 0, -0.5, 0.9, Math.PI / 2);
      p.add(torus(0.13, 0.012, Math.PI * 2), 0x222222, 0, -0.5, 1.88, 0, Math.PI / 2);
    }
    if (right && isGuard) p.add(cyl(0.032, 0.028, 0.22, 8), 0x1a1e26, 0, -0.5, 0.1, Math.PI / 2);
    if (right && outfit === 'slapper') p.add(box(0.09, 0.012, 0.13), 0xffffff, 0, -0.55, 0.05, 0.4);
    if (right && outfit === 'water') p.add(cyl(0.035, 0.035, 0.22, 6), 0xdff2ff, 0, -0.58, 0.06);
    if (outfit === 'robot') p.add(box(0.12, 0.12, 0.12), 0x9aa0aa, 0, -0.1, 0);
    if (right && tourist && prop === 'yard-drink') p.add(cyl(0.008, 0.008, 0.18, 6), 0xffffff, 0, -0.06, 0.16);
    if (!right && tourist && prop === 'bag') {
      p.add(box(0.24, 0.28, 0.1), [0xe8486b, 0xf2efe6, 0x2b2b33][seed % 3], 0.04, -0.66, 0);
      p.add(torus(0.07, 0.008, Math.PI), 0x2b2b33, 0.04, -0.52, 0);
    }
    arm.add(p.mesh());
    if (right && isGuard) {
      flashMat = new THREE.MeshBasicMaterial({ color: 0xffe69c, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
      const beam = new THREE.Mesh(prim('beam', () => new THREE.ConeGeometry(1.4, 4.4, 14, 1, true))[1], flashMat);
      beam.position.set(0, -0.5, 2.35);
      beam.rotation.x = -Math.PI / 2;
      arm.add(beam);
    }
    if (right && tourist && prop === 'yard-drink') {
      const k = seed % 3;
      let cm = cupMats.get(k);
      if (!cm) cupMats.set(k, (cm = new THREE.MeshStandardMaterial({ color: [0xff33a6, 0x2de2ff, 0x7aff47][k], roughness: 0.15, emissive: [0xff1e8a, 0x00b7ff, 0x45d618][k], emissiveIntensity: 0.4 })));
      const cup = new THREE.Mesh(cyl(0.055, 0.032, 0.44, 10)[1], cm);
      cup.position.set(0, -0.34, 0.16);
      arm.add(cup);
    }
    if (right && tourist && prop === 'cig') {
      cigParts ??= {
        paper: new THREE.CylinderGeometry(0.01, 0.01, 0.11, 8).rotateX(Math.PI / 2),
        ember: new THREE.CylinderGeometry(0.0105, 0.008, 0.018, 8).rotateX(Math.PI / 2).translate(0, 0, 0.06),
        paperMat: new THREE.MeshStandardMaterial({ color: 0xf7f5f0, roughness: 0.7 }),
        emberMat: new THREE.MeshBasicMaterial({ color: 0xff5a1f }),
      };
      const cigGroup = new THREE.Group();
      cigGroup.add(new THREE.Mesh(cigParts.paper, cigParts.paperMat), new THREE.Mesh(cigParts.ember, cigParts.emberMat));
      cigGroup.position.set(0, -0.53, 0.09);
      arm.add(cigGroup);
      cigMesh = cigGroup;
    }
    return arm;
  };
  const leftArm = buildArm(1);
  const rightArm = buildArm(-1);
  g.add(leftArm, rightArm);
  if (tourist && prop === 'yard-drink') rightArm.rotation.x = -0.55;
  if (tourist && prop === 'cig') rightArm.rotation.x = -0.45;

  return { group: g, leftArm, rightArm, leftLeg, rightLeg, head, cigMesh, flashMat };
}

const tmpV = new THREE.Vector3();
/** How close a chaser comes while Lou's on his phone (catching is 0.95 m): near enough to feel the heat. */
const HOLD_DIST = 2.6;

export class StripCrowdSystem {
  public readonly tourists: TouristNPC[] = [];
  public readonly performers: PerformerNPC[] = [];
  public readonly guards: GuardNPC[] = [];
  public readonly pursuers: PursuerNPC[] = [];
  /**
   * Lou has his phone out (main.ts sets this): he can't run with it in his paws, so whoever's after him can't
   * grab him. They still come, but stop at arm's length ({@link HOLD_DIST}) and wait for him to put it away.
   */
  public hold = false;
  private pursuerSeq = 0;
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene, config: CrowdConfig) {
    this.scene = scene;

    config.tourists.forEach((r, idx) => {
      const built = buildHuman(idx + 3, 'tourist', r.prop);
      const waypoints = r.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
      built.group.position.copy(waypoints[0]);
      scene.add(built.group);
      this.tourists.push({
        ...built,
        id: idx,
        mesh: built.group,
        waypoints,
        wpIndex: 1 % waypoints.length,
        speed: 1.35 + (idx % 4) * 0.25,
        pauseTimer: 0,
        begCooldown: 0,
        reactCooldown: 0,
        hasCig: r.prop === 'cig',
        hasCamera: r.prop === 'camera',
        cigStolen: false,
        speechSprite: null,
        speechTimer: 0,
        walkPhase: idx * 1.1,
        lookAtCat: 0,
      });
    });

    config.performers.forEach((p, idx) => {
      const built = buildHuman(idx * 7 + 2, p.kind, 'none');
      built.group.position.set(p.x, p.y ?? 0, p.z);
      built.group.rotation.y = p.facing;
      scene.add(built.group);
      this.performers.push({
        ...built,
        id: idx,
        kind: p.kind,
        mesh: built.group,
        begCooldown: 0,
        speechSprite: null,
        speechTimer: 0,
        chatterTimer: 3 + idx * 2.3,
      });
    });

    config.guards.forEach((gr, idx) => {
      const built = buildHuman(idx + 1, 'guard', 'none');
      const waypoints = gr.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
      built.group.position.copy(waypoints[0]);
      scene.add(built.group);
      this.guards.push({
        ...built,
        id: idx,
        mesh: built.group,
        waypoints,
        wpIndex: 1,
        casinoName: gr.name,
        kickPoint: new THREE.Vector3(gr.kick[0], 0, gr.kick[1]),
        zone: gr.zone,
        walkPhase: idx * 2.0,
        mode: 'patrol',
        lostTimer: 0,
        speechSprite: null,
        speechTimer: 0,
      });
    });
  }

  private setSpeech(holder: { mesh: THREE.Group; speechSprite: THREE.Sprite | null; speechTimer: number }, text: string, duration: number, accent?: string): void {
    if (holder.speechSprite) {
      holder.mesh.remove(holder.speechSprite);
      holder.speechSprite.material.map?.dispose();
      holder.speechSprite.material.dispose();
    }
    const mat = new THREE.SpriteMaterial({ map: makeSpeechTexture(text, accent), transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(0, 2.32, 0);
    sprite.scale.set(2.3, 0.72, 1);
    holder.mesh.add(sprite);
    holder.speechSprite = sprite;
    holder.speechTimer = duration;
  }

  public tickSpeech(holder: { mesh: THREE.Group; speechSprite: THREE.Sprite | null; speechTimer: number }, dt: number): void {
    if (holder.speechTimer <= 0) return;
    holder.speechTimer -= dt;
    if (holder.speechTimer <= 0 && holder.speechSprite) {
      holder.mesh.remove(holder.speechSprite);
      holder.speechSprite.material.map?.dispose();
      holder.speechSprite.material.dispose();
      holder.speechSprite = null;
    }
  }

  public spawnPursuer(kind: 'ac' | 'cop', x: number, z: number): PursuerNPC {
    const built = buildHuman(40 + this.pursuerSeq, kind === 'ac' ? 'animal-control' : 'officer', 'none');
    built.group.position.set(x, 0, z);
    this.scene.add(built.group);
    const p: PursuerNPC = {
      ...built,
      id: this.pursuerSeq++,
      kind,
      mesh: built.group,
      speed: kind === 'ac' ? 6.0 : 6.7,
      walkPhase: 0,
      speechSprite: null,
      speechTimer: 0,
      shoutTimer: 1 + Math.random() * 2,
    };
    this.pursuers.push(p);
    return p;
  }

  /** A one-off pedestrian (e.g. the driver Lou just yanked out of their car). */
  public spawnBystander(x: number, z: number, toX: number, toZ: number, line: string, knockDir?: [number, number]): TouristNPC {
    const idx = this.tourists.length;
    const built = buildHuman(idx + 77, 'tourist', 'none');
    built.group.position.set(x, 0, z);
    this.scene.add(built.group);
    const t: TouristNPC = {
      ...built,
      id: idx,
      mesh: built.group,
      waypoints: [new THREE.Vector3(toX, 0, toZ), new THREE.Vector3(toX + 6, 0, toZ + 6)],
      wpIndex: 0,
      speed: 2.6,
      pauseTimer: 0,
      begCooldown: 30,
      reactCooldown: 20,
      hasCig: false,
      hasCamera: false,
      cigStolen: false,
      speechSprite: null,
      speechTimer: 0,
      walkPhase: 0,
      lookAtCat: 0,
    };
    this.tourists.push(t);
    if (knockDir) this.knockdown(t, knockDir[0], knockDir[1], 3.5);
    this.setSpeech(t, line, 3.2, '#ff8a3d');
    return t;
  }

  public removePursuer(p: PursuerNPC): void {
    this.scene.remove(p.mesh);
    const i = this.pursuers.indexOf(p);
    if (i >= 0) this.pursuers.splice(i, 1);
  }

  /** Move pursuers toward the cat (or its last known spot). Returns the pursuer that caught it, if any. */
  public updatePursuers(dt: number, target: THREE.Vector3, chasing: boolean, canCatch: boolean): PursuerNPC | null {
    let caught: PursuerNPC | null = null;
    for (const p of this.pursuers) {
      this.tickSpeech(p, dt);
      if (this.tickKnock(p, dt)) continue;
      tmpV.copy(target).sub(p.mesh.position);
      tmpV.y = 0;
      const d = tmpV.length();
      if (this.hold && chasing && d < HOLD_DIST) {
        this.standOff(p, tmpV);
        continue;
      }
      if (canCatch && chasing && d < 0.95) caught = p;
      if (d < 0.6) continue;
      tmpV.normalize();
      const speed = chasing ? p.speed : 2.4;
      p.mesh.position.addScaledVector(tmpV, speed * dt);
      p.mesh.rotation.y = Math.atan2(tmpV.x, tmpV.z);
      p.walkPhase += dt * (chasing ? 12 : 7);
      const swing = Math.sin(p.walkPhase) * (chasing ? 0.85 : 0.5);
      p.leftLeg.rotation.x = swing;
      p.rightLeg.rotation.x = -swing;
      p.leftArm.rotation.x = -swing * 0.7;
      p.rightArm.rotation.x = p.kind === 'ac' ? -1.1 : -swing * 0.7;
      p.shoutTimer -= dt;
      if (chasing && p.shoutTimer <= 0 && d < 30) {
        p.shoutTimer = 5 + Math.random() * 4;
        const lines = PURSUER_LINES[p.kind];
        this.setSpeech(p, lines[Math.floor(Math.random() * lines.length)], 2.4, p.kind === 'ac' ? '#9fd46a' : '#5a8cff');
      }
    }
    return caught;
  }

  /** A chaser waiting at arm's length while Lou's on his phone: stands square to him, arms out, feet planted. */
  private standOff(npc: Rig & { mesh: THREE.Group }, toCat: THREE.Vector3): void {
    npc.mesh.rotation.y = Math.atan2(toCat.x, toCat.z);
    npc.mesh.position.y = 0;
    npc.leftLeg.rotation.x = 0;
    npc.rightLeg.rotation.x = 0;
    npc.leftArm.rotation.x = -0.5;
    npc.rightArm.rotation.x = -0.9;
  }

  /** Everyone on foot the cat can bowl over. */
  public allPeople(): Array<TouristNPC | PerformerNPC | GuardNPC | PursuerNPC> {
    return [...this.tourists, ...this.performers, ...this.guards, ...this.pursuers];
  }

  /** Knock someone over, pushed away along (dx, dz). */
  public knockdown(npc: Rig & { mesh: THREE.Group }, dx: number, dz: number, power: number): void {
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    npc.mesh.rotation.y = Math.atan2(-dx, -dz);
    npc.knock = { t: 0, vx: dx * power, vz: dz * power, yaw: npc.mesh.rotation.y, y0: Math.max(0, npc.mesh.position.y) };
  }

  public say(npc: { mesh: THREE.Group; speechSprite: THREE.Sprite | null; speechTimer: number }, text: string, duration = 2.6, accent?: string): void {
    this.setSpeech(npc, text, duration, accent);
  }

  /** Returns true while the person is down (callers skip their normal behaviour). */
  public tickKnock(npc: Rig & { mesh: THREE.Group }, dt: number): boolean {
    const k = npc.knock;
    if (!k) return false;
    k.t += dt;
    const m = npc.mesh;
    m.rotation.y = k.yaw;
    if (k.t < 0.35) m.rotation.x = (-Math.PI / 2) * (k.t / 0.35);
    else if (k.t < 3.2) m.rotation.x = -Math.PI / 2;
    else if (k.t < 3.8) m.rotation.x = (-Math.PI / 2) * (1 - (k.t - 3.2) / 0.6);
    else {
      m.rotation.x = 0;
      m.position.y = k.y0 < 0.2 ? 0 : k.y0;
      npc.knock = null;
      return false;
    }
    m.position.x += k.vx * dt;
    m.position.z += k.vz * dt;
    const damp = Math.max(0, 1 - dt * 3.5);
    k.vx *= damp;
    k.vz *= damp;
    m.position.y = k.y0 + (k.t < 0.3 ? Math.sin((k.t / 0.3) * Math.PI) * 0.35 : 0.05);
    const flail = k.t < 3.2 ? Math.sin(k.t * 18) * (k.t < 0.8 ? 1.2 : 0.25) : 0;
    npc.leftArm.rotation.x = -1.4 + flail;
    npc.rightArm.rotation.x = -1.4 - flail;
    npc.leftLeg.rotation.x = 0.3 + flail * 0.5;
    npc.rightLeg.rotation.x = -0.3 - flail * 0.5;
    return true;
  }

  public showTouristSpeech(tourist: TouristNPC, text: string, duration = 3.0): void {
    this.setSpeech(tourist, text, duration);
  }

  public showPerformerSpeech(p: PerformerNPC, text: string, duration = 3.0): void {
    this.setSpeech(p, text, duration, '#ff7ac8');
  }

  public nearestPerformer(pos: THREE.Vector3, maxDist: number): PerformerNPC | null {
    let best: PerformerNPC | null = null;
    let bestD = maxDist;
    for (const p of this.performers) {
      const d = p.mesh.position.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Tourists near a big vape cloud react. Returns how many cheered and the tips they threw. */
  public reactToCloud(origin: THREE.Vector3, tipMult: number): { cheers: number; tips: number; coughs: number } {
    let cheers = 0;
    let tips = 0;
    let coughs = 0;
    for (const t of this.tourists) {
      if (t.reactCooldown > 0) continue;
      const d = t.mesh.position.distanceTo(origin);
      if (d > 7.5) continue;
      t.reactCooldown = 14;
      t.lookAtCat = 2.5;
      const roll = Math.random();
      if (roll < 0.42 + Math.min(0.25, tipMult * 0.05)) {
        const tip = Math.round((2 + Math.floor(Math.random() * 6)) * tipMult);
        tips += tip;
        cheers += 1;
        this.setSpeech(t, ['Sick clouds!! +$' + tip, 'Do an O-ring! +$' + tip, 'Cloud chaser kitty! +$' + tip][Math.floor(Math.random() * 3)], 2.8);
      } else if (roll < 0.8) {
        coughs += 1;
        this.setSpeech(t, ['*cough* Ugh, kitty!', 'Not in my face!', 'Is that… cotton candy?'][Math.floor(Math.random() * 3)], 2.4);
      } else {
        this.setSpeech(t, 'Filming this for my story', 2.4);
      }
    }
    return { cheers, tips, coughs };
  }

  /** Tourists near a dancing cat film it, cheer, and sometimes tip. Elvises take it personally. */
  public reactToDance(origin: THREE.Vector3, tipMult: number): { cheers: number; tips: number } {
    let cheers = 0;
    let tips = 0;
    for (const t of this.tourists) {
      if (t.reactCooldown > 0 || t.knock) continue;
      if (t.mesh.position.distanceTo(origin) > 9) continue;
      t.reactCooldown = 18;
      t.lookAtCat = 3.2;
      if (Math.random() < 0.38 + Math.min(0.2, tipMult * 0.04)) {
        const tip = Math.max(1, Math.round((1 + Math.floor(Math.random() * 5)) * tipMult));
        tips += tip;
        cheers += 1;
        this.setSpeech(t, [`IT'S DANCING +$${tip}`, `Get it, kitty! +$${tip}`, `Main character energy +$${tip}`, `Vegas has everything +$${tip}`][Math.floor(Math.random() * 4)], 2.8);
      } else {
        this.setSpeech(t, ['📱 recording', 'Is this a show?', 'Somebody call Cirque', 'He has better moves than my husband'][Math.floor(Math.random() * 4)], 2.4);
      }
    }
    for (const p of this.performers) {
      if (p.mesh.position.distanceTo(origin) < 10 && Math.random() < 0.6) this.say(p, 'Thank you. Thank you very much.', 2.6);
    }
    return { cheers, tips };
  }

  /** Guards in the casino the cat is standing in, who can see it, start chasing. */
  public alertGuards(catPos: THREE.Vector3, radius: number): GuardNPC[] {
    const alerted: GuardNPC[] = [];
    for (const g of this.guards) {
      const z = g.zone;
      if (catPos.x < z.minX || catPos.x > z.maxX || catPos.z < z.minZ || catPos.z > z.maxZ) continue;
      if (g.mesh.position.distanceTo(catPos) > radius) continue;
      if (g.mode !== 'chase') {
        g.mode = 'chase';
        g.lostTimer = 0;
        this.setSpeech(g, ['HEY! Stop that cat!', 'Security! Freeze, kitty!', 'You can’t swipe in here!'][g.id % 3], 2.6, '#ff4d4d');
      }
      alerted.push(g);
    }
    return alerted;
  }

  public anyChasing(): boolean {
    return this.guards.some((g) => g.mode === 'chase');
  }

  /** How close the nearest chasing guard is, 0 (far) → 1 (on you). */
  public heat(catPos: THREE.Vector3): number {
    let h = 0;
    for (const g of this.guards) {
      if (g.mode !== 'chase') continue;
      const d = g.mesh.position.distanceTo(catPos);
      h = Math.max(h, THREE.MathUtils.clamp(1 - (d - 1) / 16, 0.15, 1));
    }
    return h;
  }

  public update(
    dt: number,
    elapsed: number,
    catPos: THREE.Vector3,
    events: { onCaught: (g: GuardNPC) => void; onEscaped: (g: GuardNPC) => void }
  ): void {
    for (const t of this.tourists) {
      if (t.begCooldown > 0) t.begCooldown = Math.max(0, t.begCooldown - dt);
      if (t.reactCooldown > 0) t.reactCooldown = Math.max(0, t.reactCooldown - dt);
      this.tickSpeech(t, dt);
      if (this.tickKnock(t, dt)) continue;

      const far = t.mesh.position.distanceToSquared(catPos) > 110 * 110;
      t.mesh.visible = !far;

      if (t.lookAtCat > 0) {
        t.lookAtCat -= dt;
        tmpV.copy(catPos).sub(t.mesh.position);
        t.mesh.rotation.y = Math.atan2(tmpV.x, tmpV.z);
        t.leftLeg.rotation.x = THREE.MathUtils.lerp(t.leftLeg.rotation.x, 0, dt * 8);
        t.rightLeg.rotation.x = THREE.MathUtils.lerp(t.rightLeg.rotation.x, 0, dt * 8);
        continue;
      }

      if (t.pauseTimer > 0) {
        t.pauseTimer -= dt;
        t.leftLeg.rotation.x = THREE.MathUtils.lerp(t.leftLeg.rotation.x, 0, dt * 8);
        t.rightLeg.rotation.x = THREE.MathUtils.lerp(t.rightLeg.rotation.x, 0, dt * 8);
        t.head.rotation.y = Math.sin(elapsed * 2 + t.id) * 0.25;
        continue;
      }

      const target = t.waypoints[t.wpIndex];
      tmpV.copy(target).sub(t.mesh.position);
      tmpV.y = 0;
      const dist = tmpV.length();
      if (dist < 0.35) {
        t.wpIndex = (t.wpIndex + 1) % t.waypoints.length;
        if (t.id % 3 === 0) t.pauseTimer = 1.6 + (t.id % 4);
      } else {
        tmpV.normalize();
        t.mesh.position.addScaledVector(tmpV, t.speed * dt);
        t.mesh.rotation.y = Math.atan2(tmpV.x, tmpV.z);
        if (far) continue;
        t.walkPhase += dt * t.speed * 3.8;
        const swing = Math.sin(t.walkPhase) * 0.55;
        t.leftLeg.rotation.x = swing;
        t.rightLeg.rotation.x = -swing;
        t.leftArm.rotation.x = -swing * 0.65;
        if (!t.hasCig || t.cigStolen) {
          t.rightArm.rotation.x = t.hasCamera ? -0.3 : swing * 0.65;
        } else {
          const drag = Math.max(0, Math.sin(elapsed * 1.1 + t.id));
          t.rightArm.rotation.x = -0.45 - drag * 0.65;
        }
        t.mesh.position.y = Math.abs(Math.sin(t.walkPhase)) * 0.035;
      }
    }

    for (const p of this.performers) {
      if (p.begCooldown > 0) p.begCooldown = Math.max(0, p.begCooldown - dt);
      this.tickSpeech(p, dt);
      if (this.tickKnock(p, dt)) continue;
      const near = p.mesh.position.distanceToSquared(catPos) < 90 * 90;
      p.mesh.visible = near;
      if (!near) continue;
      // Idle performance loops
      if (p.kind === 'elvis') {
        p.rightArm.rotation.x = -1.4 + Math.sin(elapsed * 3 + p.id) * 0.5;
        p.rightArm.rotation.z = -0.3;
        p.leftLeg.rotation.z = Math.max(0, Math.sin(elapsed * 6 + p.id)) * 0.25;
        p.mesh.position.y = Math.abs(Math.sin(elapsed * 6)) * 0.02;
      } else if (p.kind === 'showgirl') {
        p.leftArm.rotation.z = 0.9 + Math.sin(elapsed * 1.6 + p.id) * 0.15;
        p.rightArm.rotation.z = -0.9 - Math.sin(elapsed * 1.6 + p.id) * 0.15;
        p.head.rotation.y = Math.sin(elapsed * 0.8 + p.id) * 0.3;
      } else if (p.kind === 'robot') {
        // jerky robot dance: arms snap between poses on a beat
        const beat = Math.floor(elapsed * 2.5 + p.id) % 4;
        p.leftArm.rotation.x = [-1.5, 0, -1.5, -0.8][beat];
        p.rightArm.rotation.x = [0, -1.5, -1.5, -0.8][beat];
        p.leftArm.rotation.z = beat === 3 ? 0.6 : 0;
        p.rightArm.rotation.z = beat === 3 ? -0.6 : 0;
        p.head.rotation.y = [0.4, -0.4, 0, 0][beat];
      } else if (p.kind === 'statue') {
        // frozen pose; every ~9 s a tiny bow
        p.rightArm.rotation.x = -1.2;
        p.leftArm.rotation.z = 0.3;
        const c = (elapsed + p.id * 3) % 9;
        p.head.rotation.x = c < 0.8 ? Math.sin((c / 0.8) * Math.PI) * 0.35 : 0;
      } else if (p.kind === 'water') {
        p.rightArm.rotation.x = -1.2 - Math.max(0, Math.sin(elapsed * 2.2 + p.id)) * 1.1;
        p.head.rotation.y = Math.sin(elapsed * 0.9 + p.id) * 0.6;
      } else {
        const slap = Math.max(0, Math.sin(elapsed * 7 + p.id * 3));
        p.rightArm.rotation.x = -0.9 + slap * 0.5;
        p.head.rotation.y = Math.sin(elapsed * 1.3 + p.id) * 0.5;
      }
      p.chatterTimer -= dt;
      if (p.chatterTimer <= 0 && p.mesh.position.distanceTo(catPos) < 26) {
        p.chatterTimer = 9 + Math.random() * 8;
        const lines = PERFORMER_LINES[p.kind];
        this.setSpeech(p, lines[Math.floor(Math.random() * lines.length)], 2.8, '#ff7ac8');
      }
    }

    for (const g of this.guards) {
      this.tickSpeech(g, dt);
      if (this.tickKnock(g, dt)) continue;
      const z = g.zone;
      const catInZone = catPos.x > z.minX - 2 && catPos.x < z.maxX + 2 && catPos.z > z.minZ - 2 && catPos.z < z.maxZ + 2;
      let speed = 2.2;
      let target: THREE.Vector3;

      if (g.mode === 'chase') {
        speed = 5.9; // faster than a prowl (5.2), slower than a sprint (9)
        target = catPos;
        const d = g.mesh.position.distanceTo(catPos);
        if (this.hold && d < HOLD_DIST) {
          g.lostTimer = 0;
          this.standOff(g, tmpV.copy(catPos).sub(g.mesh.position));
          continue;
        }
        if (d < 0.95) {
          g.mode = 'return';
          events.onCaught(g);
        } else if (!catInZone || d > 20) {
          g.lostTimer += dt;
          if (g.lostTimer > (catInZone ? 2.5 : 0.8)) {
            g.mode = 'return';
            this.setSpeech(g, 'Lost the cat… back to my post.', 2.2);
            events.onEscaped(g);
          }
        } else {
          g.lostTimer = 0;
        }
      } else if (g.mode === 'return') {
        target = g.waypoints[g.wpIndex];
        if (g.mesh.position.distanceTo(target) < 0.6) g.mode = 'patrol';
      } else {
        target = g.waypoints[g.wpIndex];
      }

      if (g.flashMat) {
        g.flashMat.color.setHex(g.mode === 'chase' ? (Math.floor(elapsed * 6) % 2 ? 0xff3030 : 0x3060ff) : 0xffe69c);
        g.flashMat.opacity = g.mode === 'chase' ? 0.22 : 0.12;
      }

      tmpV.copy(target).sub(g.mesh.position);
      tmpV.y = 0;
      if (g.mode === 'patrol' && tmpV.length() < 0.4) {
        g.wpIndex = (g.wpIndex + 1) % g.waypoints.length;
        continue;
      }
      if (tmpV.lengthSq() < 1e-4) continue;
      tmpV.normalize();
      g.mesh.position.addScaledVector(tmpV, speed * dt);
      g.mesh.rotation.y = Math.atan2(tmpV.x, tmpV.z);
      g.walkPhase += dt * (g.mode === 'chase' ? 12 : 7.2);
      const swing = Math.sin(g.walkPhase) * (g.mode === 'chase' ? 0.8 : 0.5);
      g.leftLeg.rotation.x = swing;
      g.rightLeg.rotation.x = -swing;
      g.leftArm.rotation.x = -swing * 0.6;
      g.rightArm.rotation.x = g.mode === 'chase' ? -1.2 : -0.35;
    }
  }
}
