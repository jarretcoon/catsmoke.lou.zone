import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from './builder';
import { GUEST_SHIRTS, Kit, Walkers, buildPeople, glassMat, glowMat, vcMat, type GateBox, type Person } from './interiorKit';
import { gatedDoors } from './grandInteriors';

/**
 * Via Bellagio: the Bellagio's skylit luxury arcade. A long marble promenade under a glass barrel
 * vault on dark-green iron ribs, lined both sides with boutique fronts in a cream-stone frame —
 * lit windows you can see into (handbags on plinths, watches and jewels in glass cases, mannequins),
 * brass lamp posts, stone planters, benches and window shoppers.
 *
 * It sits along the south side of Bellagio Drive (x −124…−25, z 110.4…122): its west doors open under
 * the porte-cochère opposite the lobby doors, a second north door faces the Conservatory's south door
 * across the drive, a south door leads to the gardens and the Cosmopolitan, and the east end opens
 * onto the Strip. The shell, vault and floor are baked; the shop fittings, wares and people are
 * merged into one group that is only drawn while the camera is inside or looking in through a door.
 */

const X0 = -124;
const X1 = -25;
const ZN = 111.0; // interior face of the north wall
const ZS = 121.4; // interior face of the south wall
const ZC = (ZN + ZS) / 2;
const BAY_D = 2.0;
const WALL_H = 7.6;
const SPRING = 7.35;
const VAULT_H = 3.1;
const CEIL = 7.0;

const STONE = 0xe6d8bb;
const STONE_D = 0xcdbb98;
const BRONZE = 0x5a4428;
const GOLD = 0xc9a24a;
const IRON = 0x1f2a24;

type Wares = 'bags' | 'watches' | 'jewelry' | 'fashion';
interface Brand {
  name: string;
  font: string;
  spacing: number;
  bg: string;
  fg: string;
  wall: number;
  floor: number;
  frame: number;
  wares: Wares;
  goods: number[];
}
const SERIF = '"Times New Roman", Georgia, serif';
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const DIDOT = 'Didot, "Bodoni MT", "Times New Roman", serif';
// Real Via Bellagio / Strip luxury houses, as plain lettering on the shop signs (no logos)
const BRANDS: Brand[] = [
  { name: 'CHANEL', font: SANS, spacing: 22, bg: '#0b0b0b', fg: '#ffffff', wall: 0xe9e4da, floor: 0x1a1a1a, frame: 0x101010, wares: 'bags', goods: [0x111111, 0xf2efe6, 0xb3122a] },
  { name: 'GUCCI', font: SERIF, spacing: 18, bg: '#0e0e0e', fg: '#d8c08a', wall: 0xc8a87a, floor: 0x2a1a12, frame: 0x14100c, wares: 'bags', goods: [0x3a5a2a, 0x8a1a1a, 0xc8a06a] },
  { name: 'PRADA', font: SANS, spacing: 16, bg: '#101010', fg: '#f2f2f2', wall: 0xb8dcc8, floor: 0x2a2a2a, frame: 0x101010, wares: 'bags', goods: [0x111111, 0xd8d0c4, 0x3a3a6a] },
  { name: 'HERMÈS', font: SERIF, spacing: 14, bg: '#3a2a1c', fg: '#f3c07a', wall: 0xf08a3a, floor: 0x4a3020, frame: 0x3a2a1c, wares: 'bags', goods: [0xf07a1a, 0x8a4a1a, 0x1a3a6a] },
  { name: 'LOUIS VUITTON', font: SANS, spacing: 10, bg: '#2a1c12', fg: '#eadcb8', wall: 0xc8a87a, floor: 0x3a2418, frame: 0x2a1c12, wares: 'bags', goods: [0x6a4424, 0x3a2a1a, 0xe8d6b0] },
  { name: 'DIOR', font: DIDOT, spacing: 20, bg: '#e9e4dc', fg: '#202020', wall: 0xeeeae2, floor: 0xbab4aa, frame: 0xd8d2c8, wares: 'fashion', goods: [0xf2efe8, 0x1a1a1a, 0xd8b8c0] },
  { name: 'FENDI', font: SANS, spacing: 18, bg: '#141414', fg: '#f2c94c', wall: 0xf2d27a, floor: 0x2a2418, frame: 0x141414, wares: 'bags', goods: [0xf2c94c, 0x6a4a2a, 0x1a1a1a] },
  { name: 'BOTTEGA VENETA', font: SERIF, spacing: 8, bg: '#123a26', fg: '#ece4cc', wall: 0x3a8a5a, floor: 0x2a2a22, frame: 0x123a26, wares: 'bags', goods: [0x2f8a4a, 0x8a6a3a, 0xe8dcc0] },
  { name: 'TIFFANY & CO.', font: SERIF, spacing: 8, bg: '#81d8d0', fg: '#121212', wall: 0x9ae2da, floor: 0xe8e4dc, frame: 0x6ac8c0, wares: 'jewelry', goods: [0x81d8d0, 0xffffff, 0xd9d9e0] },
  { name: 'GIORGIO ARMANI', font: SANS, spacing: 10, bg: '#1a1a1a', fg: '#e6e6e6', wall: 0xb8b0a4, floor: 0x3a3632, frame: 0x1a1a1a, wares: 'fashion', goods: [0x4a4a52, 0x1a1a24, 0xc8c0b0] },
  { name: 'CARTIER', font: SERIF, spacing: 12, bg: '#7a0e1c', fg: '#e0c27a', wall: 0xa8222e, floor: 0x2a1414, frame: 0x7a0e1c, wares: 'watches', goods: [0xd9ae4a] },
  { name: 'OMEGA', font: SANS, spacing: 20, bg: '#141414', fg: '#e9e9e9', wall: 0x2a3a5a, floor: 0x1a1a1e, frame: 0x141414, wares: 'watches', goods: [0xd8d8e0] },
  { name: 'BVLGARI', font: SERIF, spacing: 16, bg: '#161616', fg: '#e0c27a', wall: 0xd8c8a8, floor: 0x2a221a, frame: 0x161616, wares: 'jewelry', goods: [0xd9ae4a, 0xffffff, 0xc8102e] },
  { name: 'VALENTINO', font: DIDOT, spacing: 14, bg: '#f2ede6', fg: '#1a1a1a', wall: 0xc4182e, floor: 0xd8d0c4, frame: 0xe8e2d8, wares: 'fashion', goods: [0xc4182e, 0xf2efe8, 0x1a1a1a] },
  { name: 'SAINT LAURENT', font: SANS, spacing: 12, bg: '#0a0a0a', fg: '#ffffff', wall: 0x2a2a2e, floor: 0x141414, frame: 0x0a0a0a, wares: 'fashion', goods: [0x111111, 0x3a1a2a, 0xe8e0d8] },
  { name: 'CELINE', font: SANS, spacing: 20, bg: '#ffffff', fg: '#111111', wall: 0xece8e0, floor: 0xc8c0b4, frame: 0xf2f2f2, wares: 'bags', goods: [0x8a5a2a, 0x111111, 0xe8dcc8] },
  { name: 'BALENCIAGA', font: SANS, spacing: 14, bg: '#2a2a2a', fg: '#f2f2f2', wall: 0x8a8a8e, floor: 0x3a3a3c, frame: 0x2a2a2a, wares: 'fashion', goods: [0x1a1a1a, 0x8a8a8e, 0xd8d8d8] },
  { name: 'LORO PIANA', font: SERIF, spacing: 12, bg: '#e8dcc8', fg: '#4a3420', wall: 0xd8c8a8, floor: 0x8a6a4a, frame: 0xd8ccb4, wares: 'fashion', goods: [0xc8b090, 0x8a6a4a, 0xf2ece0] },
  { name: 'CHOPARD', font: SERIF, spacing: 14, bg: '#0e1a3a', fg: '#e0c27a', wall: 0x1a2a5a, floor: 0x14141a, frame: 0x0e1a3a, wares: 'watches', goods: [0xd9ae4a] },
  { name: 'GRAFF', font: SERIF, spacing: 24, bg: '#101010', fg: '#f2f2f2', wall: 0xe8e4e0, floor: 0x1a1a1a, frame: 0x101010, wares: 'jewelry', goods: [0xffffff, 0xd9d9e0, 0xffd0e0] },
  { name: 'BRIONI', font: SERIF, spacing: 18, bg: '#1a1a24', fg: '#e8e0cc', wall: 0x6a6a7a, floor: 0x2a2a30, frame: 0x1a1a24, wares: 'fashion', goods: [0x2a2a3a, 0x4a4a5a, 0x1a1a1a] },
  { name: 'ROLEX', font: SERIF, spacing: 16, bg: '#0f4a2a', fg: '#e0c27a', wall: 0x1f6a3a, floor: 0x14201a, frame: 0x0f4a2a, wares: 'watches', goods: [0xd9ae4a] },
];

const ROW = 80;
let signTex: THREE.CanvasTexture | null = null;
function brandSigns(): THREE.CanvasTexture {
  if (signTex) return signTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 2048;
  const ctx = c.getContext('2d')!;
  BRANDS.forEach((br, i) => {
    const y = i * ROW;
    ctx.fillStyle = br.bg;
    ctx.fillRect(0, y, 1024, ROW);
    ctx.fillStyle = br.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = br.name.length > 11 ? 40 : 50;
    ctx.font = `${br.font === SANS ? '500' : 'bold'} ${size}px ${br.font}`;
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${br.spacing}px`;
    ctx.fillText(br.name, 512 + br.spacing / 2, y + ROW / 2 + 3, 940);
  });
  // last row: VIA BELLAGIO in bronze on stone (gable plaques)
  const y = BRANDS.length * ROW;
  ctx.fillStyle = '#e6d8bb';
  ctx.fillRect(0, y, 1024, ROW * 2);
  ctx.fillStyle = '#4a3418';
  ctx.font = `bold 86px ${SERIF}`;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = '26px';
  ctx.fillText('VIA BELLAGIO', 525, y + ROW + 6, 980);
  signTex = new THREE.CanvasTexture(c);
  signTex.colorSpace = THREE.SRGBColorSpace;
  signTex.anisotropy = 8;
  return signTex;
}
let signMatCache: THREE.MeshBasicMaterial | null = null;
function signMaterial(): THREE.MeshBasicMaterial {
  return (signMatCache ??= new THREE.MeshBasicMaterial({ map: brandSigns() }));
}
function signUV(g: THREE.PlaneGeometry, row: number, rows = 1): THREE.PlaneGeometry {
  const v1 = 1 - (row * ROW) / 2048;
  const v0 = 1 - ((row + rows) * ROW) / 2048;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? v1 : v0);
  return g;
}

let floorTex: THREE.CanvasTexture | null = null;
/** Via Bellagio's floor: cream marble with a harlequin of grey and rust diamonds and gold fillets (one tile = 3.2 m). */
function marbleFloor(): THREE.CanvasTexture {
  if (floorTex) return floorTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#efe6d4';
  ctx.fillRect(0, 0, 512, 512);
  let s = 9;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.strokeStyle = '#bba888';
  for (let i = 0; i < 50; i++) {
    ctx.globalAlpha = 0.15 + r() * 0.3;
    ctx.lineWidth = 0.6 + r() * 1.6;
    ctx.beginPath();
    let x = r() * 512;
    let y = r() * 512;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 120;
      y += (r() - 0.5) * 120;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const diamond = (cx: number, cy: number, rx: number, ry: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx + rx, cy);
    ctx.lineTo(cx, cy + ry);
    ctx.lineTo(cx - rx, cy);
    ctx.closePath();
    ctx.fill();
  };
  diamond(256, 256, 150, 150, '#8a8478');
  diamond(256, 256, 126, 126, '#efe6d4');
  diamond(256, 256, 70, 70, '#7a2e1e');
  diamond(256, 256, 18, 18, '#c9a24a');
  for (const [x, y] of [
    [0, 0],
    [512, 0],
    [0, 512],
    [512, 512],
  ]) {
    diamond(x, y, 60, 60, '#7a2e1e');
    diamond(x, y, 40, 40, '#efe6d4');
  }
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 509, 509);
  floorTex = new THREE.CanvasTexture(c);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.anisotropy = 8;
  return floorTex;
}

/** Elliptical barrel vault along x (glass), springing at y0, half-width R, rise H. */
function vaultGeometry(len: number, R: number, H: number, seg: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const p = (i / seg) * Math.PI;
    const z = -Math.cos(p) * R;
    const y = Math.sin(p) * H;
    pos.push(-len / 2, y, z, len / 2, y, z);
    uv.push(0, i / seg, 1, i / seg);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildViaBellagio(b: WorldBuilder): void {
  const stone = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.75 });
  const stoneD = new THREE.MeshStandardMaterial({ color: STONE_D, roughness: 0.8 });
  const iron = new THREE.MeshStandardMaterial({ color: IRON, roughness: 0.45, metalness: 0.6 });
  const T = 0.6;
  const northDoors: Array<[number, number]> = [
    [-122, -117],
    [-85, -80],
  ];
  const southDoors: Array<[number, number]> = [[-50.75, -45.75]];
  const eastDoor: [number, number] = [113.4, 119.0];
  const lintel = 4.4;

  // ---------------- shell (baked)
  const runWall = (fixed: number, lo: number, hi: number, gaps: Array<[number, number]>, alongX: boolean) => {
    let cur = lo;
    const segs: Array<[number, number]> = [];
    for (const [g0, g1] of gaps) {
      if (g0 > cur) segs.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (cur < hi) segs.push([cur, hi]);
    for (const [a, c] of segs) {
      if (alongX) b.box((a + c) / 2, 0, fixed, c - a, WALL_H, T, stone, true);
      else b.box(fixed, 0, (a + c) / 2, T, WALL_H, c - a, stone, true);
    }
    for (const [g0, g1] of gaps) {
      if (alongX) b.box((g0 + g1) / 2, lintel, fixed, g1 - g0, WALL_H - lintel, T, stone, true);
      else b.box(fixed, lintel, (g0 + g1) / 2, T, WALL_H - lintel, g1 - g0, stone, true);
    }
  };
  runWall(ZN - T / 2, X0 - T, X1 + T, northDoors, true);
  runWall(ZS + T / 2, X0 - T, X1 + T, southDoors, true);
  runWall(X0 - T / 2, ZN - T, ZS + T, [], false);
  runWall(X1 + T / 2, ZN - T, ZS + T, [eastDoor], false);
  // exterior pilasters, cornice and the parapet the vault rests on
  const ext: THREE.BufferGeometry[] = [];
  const extD: THREE.BufferGeometry[] = [];
  const bx = (list: THREE.BufferGeometry[], x: number, y: number, z: number, w: number, h: number, d: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    list.push(g);
  };
  const inGap = (u: number, gaps: Array<[number, number]>) => gaps.some(([a, c]) => u > a - 0.8 && u < c + 0.8);
  for (let x = X0 + 1; x < X1; x += 6) {
    if (!inGap(x, northDoors)) bx(ext, x, WALL_H / 2, ZN - T - 0.2, 0.7, WALL_H, 0.4);
    if (!inGap(x, southDoors)) bx(ext, x, WALL_H / 2, ZS + T + 0.2, 0.7, WALL_H, 0.4);
  }
  bx(extD, (X0 + X1) / 2, WALL_H - 0.2, ZN - T - 0.1, X1 - X0 + 1.6, 0.4, 0.9);
  bx(extD, (X0 + X1) / 2, WALL_H - 0.2, ZS + T + 0.1, X1 - X0 + 1.6, 0.4, 0.9);
  bx(extD, (X0 + X1) / 2, 0.3, ZN - T - 0.15, X1 - X0 + 1.4, 0.6, 0.5);
  bx(extD, (X0 + X1) / 2, 0.3, ZS + T + 0.15, X1 - X0 + 1.4, 0.6, 0.5);
  // door surrounds (stone architraves) on the outside
  for (const [a, c] of northDoors) {
    bx(extD, (a + c) / 2, lintel + 0.35, ZN - T - 0.25, c - a + 1.2, 0.7, 0.5);
    bx(extD, a - 0.35, lintel / 2, ZN - T - 0.25, 0.6, lintel, 0.5);
    bx(extD, c + 0.35, lintel / 2, ZN - T - 0.25, 0.6, lintel, 0.5);
  }
  for (const [a, c] of southDoors) bx(extD, (a + c) / 2, lintel + 0.35, ZS + T + 0.25, c - a + 1.2, 0.7, 0.5);
  b.add(new THREE.Mesh(mergeGeometries(ext, false)!, stone));
  b.add(new THREE.Mesh(mergeGeometries(extD, false)!, stoneD));

  // Glass barrel vault on iron ribs (baked: the skylight reads from the Strip and from the drive)
  const len = X1 - X0;
  const R = (ZS - ZN) / 2;
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfeee8, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide });
  const vault = new THREE.Mesh(vaultGeometry(len, R, VAULT_H, 20), glass);
  vault.position.set((X0 + X1) / 2, SPRING, ZC);
  vault.castShadow = false;
  b.add(vault);
  const ribs: THREE.BufferGeometry[] = [];
  const ribAt = (x: number, thick: number) => {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const p0 = (i / n) * Math.PI;
      const p1 = ((i + 1) / n) * Math.PI;
      const z0 = -Math.cos(p0) * R;
      const y0 = Math.sin(p0) * VAULT_H;
      const z1 = -Math.cos(p1) * R;
      const y1 = Math.sin(p1) * VAULT_H;
      const l = Math.hypot(z1 - z0, y1 - y0);
      const g = new THREE.BoxGeometry(thick, thick * 1.6, l + 0.02);
      g.rotateX(-Math.atan2(y1 - y0, z1 - z0));
      g.translate(x, SPRING + (y0 + y1) / 2 - 0.04, ZC + (z0 + z1) / 2);
      ribs.push(g);
    }
  };
  for (let x = X0; x <= X1 + 0.01; x += 4.125) ribAt(x, 0.12);
  for (let i = 1; i < 10; i++) {
    const p = (i / 10) * Math.PI;
    const g = new THREE.BoxGeometry(len, 0.07, 0.07);
    g.translate((X0 + X1) / 2, SPRING + Math.sin(p) * VAULT_H - 0.02, ZC - Math.cos(p) * R);
    ribs.push(g);
  }
  // gable fan-lights at both ends: radial glazing bars
  for (const gx of [X0, X1]) {
    for (let i = 1; i < 8; i++) {
      const p = (i / 8) * Math.PI;
      const zz = -Math.cos(p) * R;
      const yy = Math.sin(p) * VAULT_H;
      const l = Math.hypot(zz, yy);
      const g = new THREE.BoxGeometry(0.08, l, 0.08);
      g.translate(0, l / 2, 0);
      g.rotateX(Math.atan2(zz, yy));
      g.translate(gx, SPRING, ZC);
      ribs.push(g);
    }
  }
  const ribMesh = new THREE.Mesh(mergeGeometries(ribs, false)!, iron);
  ribMesh.castShadow = true;
  b.add(ribMesh);
  const fan = new THREE.Shape();
  for (let i = 0; i <= 20; i++) {
    const p = (i / 20) * Math.PI;
    const zz = -Math.cos(p) * R;
    const yy = Math.sin(p) * VAULT_H;
    if (i === 0) fan.moveTo(zz, yy);
    else fan.lineTo(zz, yy);
  }
  for (const gx of [X0, X1]) {
    const fg = new THREE.ShapeGeometry(fan);
    fg.rotateY(Math.PI / 2);
    const fm = new THREE.Mesh(fg, glass);
    fm.position.set(gx, SPRING, ZC);
    b.add(fm);
  }
  // marble floor (baked so it shows through the doors)
  const ft = marbleFloor().clone();
  ft.needsUpdate = true;
  ft.repeat.set(len / 3.2, (ZS - ZN) / 3.2);
  ft.offset.set(0, 0.5);
  b.floor((X0 + X1) / 2, ZC, len, ZS - ZN, new THREE.MeshStandardMaterial({ map: ft, roughness: 0.18, metalness: 0.05 }), 0.035);
  // ceiling slab keeps the camera under the vault; outdoors the roof edges are walkable parapets
  b.collider(X0, X1, ZN, ZS, CEIL, CEIL + 0.4);
  // "VIA BELLAGIO" plaques over the Strip doors and the porte-cochère doors
  const plaqueMat = b.nightGlow(new THREE.MeshStandardMaterial({ map: brandSigns(), roughness: 0.6, emissive: 0xffe2b0, emissiveIntensity: 0.1 }), 0.05, 0.55);
  const plaque = (x: number, y: number, z: number, ry: number, w: number) => {
    const g = signUV(new THREE.PlaneGeometry(w, w * 0.16), BRANDS.length, 2);
    const m = new THREE.Mesh(g, plaqueMat);
    m.rotation.y = ry;
    b.add(m, x, y, z);
  };
  plaque(X1 + T + 0.03, 5.9, ZC, Math.PI / 2, 7);
  plaque(-119.5, 5.6, ZN - T - 0.52, Math.PI, 5.6);
  plaque(-82.5, 5.6, ZN - T - 0.52, Math.PI, 5.6);
  plaque(-48.25, 5.6, ZS + T + 0.52, 0, 5.6);
  // Strip-side canopy over the east doors
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 7.6), new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.4, metalness: 0.7 }));
  b.add(canopy, X1 + T + 1.7, 4.75, ZC);
  const under = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 7.4), new THREE.MeshBasicMaterial({ color: 0xfff0cc }));
  b.add(under, X1 + T + 1.7, 4.58, ZC);
  b.building((X0 + X1) / 2, ZC, len + 1.2, ZS - ZN + 1.2, '#e6d8bb', 'Via Bellagio');

  // ---------------- interior (gated)
  const group = new THREE.Group();
  group.name = 'interior:via-bellagio';
  const k = new Kit();
  const r = rng(808);
  const people: Person[] = [];
  const seated: Person[] = [];
  const m6 = vcMat(0.6);
  const m8 = vcMat(0.8);
  const met = vcMat(0.3, 0.85);
  const glow = glowMat();
  const signMat = signMaterial();

  // bays: [x0, x1, side]
  const bays: Array<{ a: number; c: number; north: boolean }> = [];
  const split = (a: number, c: number, n: number, north: boolean) => {
    const w = (c - a) / n;
    for (let i = 0; i < n; i++) bays.push({ a: a + i * w, c: a + (i + 1) * w, north });
  };
  split(-116.6, -85.6, 4, true);
  split(-79.4, -25.6, 7, true);
  split(-116.6, -51.4, 8, false);
  split(-45.1, -25.6, 3, false);
  bays.forEach((bay, i) => {
    const br = BRANDS[i % BRANDS.length];
    const W = bay.c - bay.a;
    const xc = (bay.a + bay.c) / 2;
    const zf = bay.north ? ZN + BAY_D : ZS - BAY_D;
    k.at(xc, 0, zf, bay.north ? 0 : Math.PI, () => storefront(k, br, i, W, r));
    // the cat stops at the glass
    if (bay.north) b.collider(bay.a, bay.c, ZN, zf + 0.06, 0, CEIL, true);
    else b.collider(bay.a, bay.c, zf - 0.06, ZS, 0, CEIL, true);
    // window shoppers
    if (r() < 0.7) {
      const side = r() < 0.5 ? -1 : 1;
      const px = xc + side * (W / 4 + 0.2);
      people.push({ x: px, z: bay.north ? zf + 0.55 : zf - 0.55, rot: bay.north ? Math.PI : 0, shirt: GUEST_SHIRTS[Math.floor(r() * GUEST_SHIRTS.length)] });
    }
    // and a sales associate inside
    people.push({ x: xc + (r() - 0.5) * (W - 3), z: bay.north ? zf - 1.55 : zf + 1.55, rot: bay.north ? 0 : Math.PI, shirt: 0x141414, vest: 0x141414 });
  });
  // stone frame + frieze over the vestibules and doors (the parts without shops)
  const frieze = (a: number, c: number, north: boolean) => {
    const W = c - a;
    const xc = (a + c) / 2;
    k.at(xc, 0, north ? ZN : ZS, north ? 0 : Math.PI, () => {
      k.box(m8, STONE, 0, 6.1, 0.12, W, 2.4, 0.24);
      k.box(m6, STONE_D, 0, 5.0, 0.3, W, 0.2, 0.5);
      k.box(m6, STONE_D, 0, 7.15, 0.25, W, 0.2, 0.5);
      k.box(glow, 0xffe2b0, 0, 7.02, 0.47, W, 0.05, 0.05);
    });
  };
  frieze(X0, -116.6, true);
  frieze(-85.6, -79.4, true);
  frieze(X0, -116.6, false);
  frieze(-51.4, -45.1, false);
  // inside the door reveals: bronze door frames
  for (const [a, c] of northDoors) {
    k.box(met, BRONZE, a + 0.08, 2.2, ZN - 0.3, 0.16, 4.4, 0.62);
    k.box(met, BRONZE, c - 0.08, 2.2, ZN - 0.3, 0.16, 4.4, 0.62);
    k.box(met, BRONZE, (a + c) / 2, 4.35, ZN - 0.3, c - a, 0.14, 0.62);
  }
  for (const [a, c] of southDoors) {
    k.box(met, BRONZE, a + 0.08, 2.2, ZS + 0.3, 0.16, 4.4, 0.62);
    k.box(met, BRONZE, c - 0.08, 2.2, ZS + 0.3, 0.16, 4.4, 0.62);
    k.box(met, BRONZE, (a + c) / 2, 4.35, ZS + 0.3, c - a, 0.14, 0.62);
  }

  // west vestibule: the Bellagio's flowers in a gilded urn, and the name in bronze on the end wall
  const urnX = -120.5;
  const urnZ = 118.6;
  k.cyl(met, GOLD, urnX, 0.55, urnZ, 0.95, 0.6, 1.1, 16);
  k.cyl(met, GOLD, urnX, 1.16, urnZ, 1.05, 1.0, 0.12, 16);
  const petals = [0xff5e8e, 0xffffff, 0xffc63d, 0xff7b29, 0xd16bff, 0xff3a4a];
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2;
    const rr = r() * 1.25;
    const y = 1.4 + r() * 1.3 * (1 - rr / 1.5);
    k.add(new THREE.IcosahedronGeometry(0.12 + r() * 0.1, 0), m8, i % 4 === 0 ? 0x2f6b3a : petals[i % petals.length], urnX + Math.cos(a) * rr, y, urnZ + Math.sin(a) * rr);
  }
  b.collider(urnX - 1.05, urnX + 1.05, urnZ - 1.05, urnZ + 1.05, 0, 1.25, true);
  k.add(signUV(new THREE.PlaneGeometry(6.4, 1.02), BRANDS.length, 2), signMat, 0xffffff, X0 + 0.04, 5.9, ZC, Math.PI / 2);
  k.box(met, GOLD, X0 + 0.05, 5.25, ZC, 0.06, 0.06, 6.6);
  k.box(met, GOLD, X0 + 0.05, 6.55, ZC, 0.06, 0.06, 6.6);
  k.add(signUV(new THREE.PlaneGeometry(5.6, 0.9), BRANDS.length, 2), signMat, 0xffffff, X1 - 0.04, 5.9, ZC, -Math.PI / 2);

  // promenade: brass lamp posts, stone planters with topiary, benches
  const lampPost = (x: number, z: number) => {
    k.cyl(met, BRONZE, x, 0.25, z, 0.2, 0.26, 0.5, 10);
    k.cyl(met, BRONZE, x, 2.0, z, 0.06, 0.09, 3.0, 8);
    k.cyl(met, GOLD, x, 3.55, z, 0.1, 0.1, 0.12, 8);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const ax = x + Math.cos(a) * 0.42;
      const az = z + Math.sin(a) * 0.42;
      k.box(met, BRONZE, (x + ax) / 2, 3.62, (z + az) / 2, 0.42, 0.04, 0.04, -a);
      k.add(new THREE.SphereGeometry(0.15, 10, 8), glow, 0xffe6b0, ax, 3.82, az);
      k.cyl(met, GOLD, ax, 3.66, az, 0.07, 0.05, 0.06, 8);
    }
    k.add(new THREE.SphereGeometry(0.17, 10, 8), glow, 0xffe6b0, x, 4.0, z);
    b.collider(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 3.8, true);
  };
  const planterAt = (x: number, z: number) => {
    k.box(m8, STONE, x, 0.45, z, 1.6, 0.9, 1.6);
    k.box(m6, STONE_D, x, 0.93, z, 1.75, 0.1, 1.75);
    k.box(m8, 0x3a2a1a, x, 0.96, z, 1.4, 0.04, 1.4);
    k.cyl(m8, 0x4a3420, x, 1.25, z, 0.04, 0.05, 0.5, 6);
    k.add(new THREE.IcosahedronGeometry(0.42, 1), m8, 0x2f6b3a, x, 1.78, z);
    k.add(new THREE.IcosahedronGeometry(0.3, 1), m8, 0x3a7a44, x, 2.3, z);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + (i % 2) * 0.1;
      const rr = 0.5 + (i % 3) * 0.08;
      k.add(new THREE.IcosahedronGeometry(0.075, 0), m8, petals[i % petals.length], x + Math.cos(a) * rr, 1.04 + (i % 2) * 0.05, z + Math.sin(a) * rr);
    }
    b.collider(x - 0.85, x + 0.85, z - 0.85, z + 0.85, 0, 1.0, true);
  };
  const benchAt = (x: number, z: number, faceZ: number) => {
    k.box(m6, 0x5a3a22, x, 0.46, z, 2.0, 0.08, 0.5);
    k.box(m6, 0x5a3a22, x, 0.78, z + faceZ * -0.24, 2.0, 0.42, 0.06);
    for (const sx of [-0.85, 0.85]) {
      k.box(met, BRONZE, x + sx, 0.22, z, 0.08, 0.44, 0.46);
      k.box(met, BRONZE, x + sx, 0.62, z + faceZ * -0.22, 0.06, 0.4, 0.06);
    }
    b.collider(x - 1.0, x + 1.0, z - 0.28, z + 0.28, 0, 0.5);
  };
  let n = 0;
  for (let x = -111; x < -28; x += 10.5) {
    if (n % 2 === 0) {
      planterAt(x, ZC);
      benchAt(x - 2.0, ZC - 1.45, -1);
      benchAt(x + 2.0, ZC + 1.45, 1);
      if (r() < 0.6) seated.push({ x: x - 2.2, y: -0.12, z: ZC - 1.5, rot: Math.PI, shirt: GUEST_SHIRTS[Math.floor(r() * GUEST_SHIRTS.length)] });
      if (r() < 0.6) seated.push({ x: x + 1.7, y: -0.12, z: ZC + 1.5, rot: 0, shirt: GUEST_SHIRTS[Math.floor(r() * GUEST_SHIRTS.length)] });
    } else lampPost(x, ZC);
    n++;
  }
  // hanging lanterns from every other rib
  for (let x = X0 + 8.25; x < X1 - 2; x += 8.25) {
    k.cyl(met, IRON, x, 7.0, ZC, 0.02, 0.02, 1.0, 4);
    k.cyl(met, BRONZE, x, 6.42, ZC, 0.18, 0.26, 0.18, 8);
    k.cyl(glow, 0xffe2a8, x, 6.12, ZC, 0.22, 0.2, 0.44, 8);
    k.cyl(met, BRONZE, x, 5.86, ZC, 0.12, 0.24, 0.1, 8);
  }

  k.flush(group);
  buildPeople(group, 'stand', people);
  buildPeople(group, 'sit', seated);
  const strollers: Array<Person & { speed: number; phase: number }> = [];
  for (let i = 0; i < 6; i++) strollers.push({ x: 0, z: 0, rot: 0, shirt: GUEST_SHIRTS[(i * 3 + 2) % GUEST_SHIRTS.length], speed: 0.9 + (i % 3) * 0.18, phase: i / 6 });
  const loop: Array<[number, number]> = [
    [-118, ZC - 2.4],
    [-29, ZC - 2.4],
    [-29, ZC + 2.4],
    [-118, ZC + 2.4],
  ];
  const walkers = new Walkers(group, 'stand', strollers, loop);
  const gate: GateBox = {
    minX: X0,
    maxX: X1,
    minZ: ZN,
    maxZ: ZS,
    height: WALL_H,
    doors: [
      ...northDoors.map(([a, c]) => ({ x: (a + c) / 2, z: ZN - T, nx: 0, nz: -1, half: (c - a) / 2 })),
      ...southDoors.map(([a, c]) => ({ x: (a + c) / 2, z: ZS + T, nx: 0, nz: 1, half: (c - a) / 2 })),
      { x: X1 + T, z: ZC, nx: 1, nz: 0, half: (eastDoor[1] - eastDoor[0]) / 2 },
    ],
  };
  gatedDoors(b, group, gate, (t) => walkers.update(t));
  b.light(0xffe2b0, 14, 30, -95, 6.2, ZC, 0.2);
  b.light(0xffe2b0, 14, 30, -50, 6.2, ZC, 0.2);

  // ---------------- gameplay
  b.zone('Via Bellagio Shoppes', X0 - T, X1 + T, ZN - T, ZS + T);
  b.shopSpots.push({ kind: 'boutique', position: new THREE.Vector3((bays[0].a + bays[0].c) / 2, 0, ZN + BAY_D + 1.0), radius: 2.2, label: 'Via Bellagio Boutique' });
  b.shopSpots.push({ kind: 'boutique', position: new THREE.Vector3((bays[14].a + bays[14].c) / 2, 0, ZS - BAY_D - 1.0), radius: 2.2, label: 'Via Bellagio Boutique' });
  b.pickup(-89.5 - 2.0, 0.62, ZC - 1.45, 3, 'Via Bellagio Bench Smokes', true);
  b.pickup(-121.4, 0.5, 112.2, 2, 'Valet Tip-Jar Pack', true);
  b.crowd.tourists.push({ pts: [[-121, 115], [-30, 115]], prop: 'bag' }, { pts: [[-30, 117.6], [-120, 117.6]], prop: 'bag' });
  b.staticMarkers.push({ x: -74, z: ZC, color: '#e6c27a', glyph: '👜', size: 2.4 });
}

/** One boutique front in its local frame: storefront glass on z = 0, the shop behind it (z < 0). */
function storefront(k: Kit, br: Brand, row: number, W: number, r: () => number): void {
  const m6 = vcMat(0.6);
  const m8 = vcMat(0.8);
  const met = vcMat(0.3, 0.85);
  const glow = glowMat();
  const gls = glassMat();
  const D = BAY_D;
  const hw = W / 2;
  // shop shell: floor, lit back wall, side walls, ceiling with spots
  k.box(m6, br.floor, 0, 0.03, -D / 2, W - 0.3, 0.05, D);
  k.quad(glow, scale(br.wall, 0.72), 0, 2.05, -D + 0.03, W - 0.5, 3.9);
  for (const s of [-1, 1]) k.box(m8, scale(br.wall, 0.45), s * (hw - 0.25), 2.0, -D / 2, 0.12, 4.0, D);
  k.box(m8, 0x14120e, 0, 4.05, -D / 2, W - 0.3, 0.1, D);
  for (let x = -hw + 1.2; x < hw - 0.8; x += 1.6) k.can(x, 3.99, -D * 0.55, 0.09, 0xfff4e0);
  // storefront: riser, glass, bronze mullions, doors, fascia with the name
  k.box(m6, br.frame, 0, 0.16, 0.04, W - 0.5, 0.32, 0.12);
  k.quad(glassMat(), 0xffffff, 0, 2.15, 0.03, W - 0.6, 3.6);
  for (const x of [-0.95, 0.95, -hw + 0.4, hw - 0.4]) k.box(met, BRONZE, x, 2.1, 0.05, 0.07, 3.8, 0.1);
  for (const x of [-0.12, 0.12]) k.box(met, GOLD, x, 1.25, 0.1, 0.04, 0.7, 0.04);
  k.box(met, BRONZE, 0, 0.36, 0.05, W - 0.6, 0.06, 0.1);
  k.box(m6, br.frame, 0, 4.5, 0.09, W - 0.4, 1.0, 0.16);
  const sg = signUV(new THREE.PlaneGeometry(Math.min(W - 1.2, 6.0), 0.6), row % BRANDS.length);
  k.add(sg, signMaterial(), 0xffffff, 0, 4.5, 0.175);
  // stone frame: half pilasters at each edge, frieze, cornices and a cove light under the vault
  for (const s of [-1, 1]) {
    k.box(m8, STONE, s * (hw - 0.18), 3.6, 0.15, 0.36, 7.2, 0.5);
    k.box(met, GOLD, s * (hw - 0.18), 0.12, 0.42, 0.38, 0.24, 0.04);
    k.box(met, GOLD, s * (hw - 0.18), 4.98, 0.42, 0.38, 0.12, 0.04);
  }
  k.box(m8, STONE, 0, 6.1, 0.12, W, 2.4, 0.24);
  k.box(m6, STONE_D, 0, 5.05, 0.3, W, 0.2, 0.5);
  k.box(m6, STONE_D, 0, 7.15, 0.25, W, 0.2, 0.5);
  k.box(glow, 0xffe2b0, 0, 7.02, 0.47, W, 0.05, 0.05);
  // a little iron balconette in the frieze
  k.box(met, IRON, 0, 6.15, 0.42, W * 0.5, 0.05, 0.05);
  for (let x = -W * 0.25; x <= W * 0.25 + 0.01; x += 0.25) k.box(met, IRON, x, 5.9, 0.42, 0.03, 0.5, 0.03);
  k.box(glow, 0xfff1d6, 0, 5.62, 0.26, W * 0.5, 0.04, 0.04);
  // wares, either side of the doors
  const sides = [-1, 1];
  for (const s of sides) {
    const cx = s * (0.95 + (hw - 1.35) / 2);
    const span = hw - 1.35;
    if (br.wares === 'bags') {
      for (let i = 0; i < 2; i++) {
        const x = cx + (i - 0.5) * span * 0.5;
        const ph = 0.55 + ((i + row) % 3) * 0.2;
        k.box(m6, 0xf2efe8, x, ph / 2, -0.75 - i * 0.35, 0.5, ph, 0.5);
        bag(k, x, ph, -0.75 - i * 0.35, br.goods[(i + (s > 0 ? 1 : 0)) % br.goods.length]);
      }
      for (const sy of [1.6, 2.5]) {
        k.box(met, BRONZE, cx, sy, -D + 0.25, span, 0.04, 0.4);
        for (let j = 0; j < 3; j++) bag(k, cx + (j - 1) * span * 0.3, sy + 0.02, -D + 0.25, br.goods[(j + Math.round(sy)) % br.goods.length], 0.7);
      }
    } else if (br.wares === 'watches' || br.wares === 'jewelry') {
      const x = cx;
      k.box(m6, 0x1a120c, x, 0.47, -0.9, Math.min(span, 1.5), 0.94, 0.6);
      k.box(gls, 0xffffff, x, 1.1, -0.9, Math.min(span, 1.5), 0.32, 0.6);
      k.box(m8, 0xe8e2d4, x, 0.95, -0.9, Math.min(span, 1.5) - 0.1, 0.02, 0.5);
      for (let j = 0; j < 5; j++) {
        const px = x + (j - 2) * Math.min(span, 1.5) * 0.18;
        if (br.wares === 'watches') {
          k.cyl(met, br.goods[0], px, 0.975, -0.9, 0.055, 0.055, 0.025, 12);
          k.cyl(glow, 0xf4f4f8, px, 0.99, -0.9, 0.04, 0.04, 0.01, 12);
        } else {
          k.add(new THREE.OctahedronGeometry(0.035, 0), glow, 0xffffff, px, 0.99, -0.9);
          k.add(new THREE.TorusGeometry(0.06, 0.008, 4, 14).rotateX(Math.PI / 2), met, GOLD, px, 0.965, -0.82);
        }
      }
      // big lit clock face / necklace bust on the back wall
      if (br.wares === 'watches') {
        k.add(new THREE.RingGeometry(0.5, 0.6, 32), glow, scale(br.goods[0], 1.1), cx, 2.5, -D + 0.05);
        k.add(new THREE.CircleGeometry(0.5, 32), glow, 0xf4f0e4, cx, 2.5, -D + 0.045);
        k.box(m6, 0x1a1a1a, cx + 0.12, 2.55, -D + 0.07, 0.03, 0.4, 0.01, 0, 0, -0.5);
        k.box(m6, 0x1a1a1a, cx - 0.08, 2.48, -D + 0.07, 0.03, 0.3, 0.01, 0, 0, 1.0);
      } else {
        k.cyl(m8, 0x1a1a24, cx, 1.95, -D + 0.5, 0.16, 0.24, 0.6, 12);
        k.add(new THREE.SphereGeometry(0.15, 10, 8), m8, 0x1a1a24, cx, 2.35, -D + 0.5);
        k.add(new THREE.TorusGeometry(0.2, 0.025, 6, 20), glow, 0xffffff, cx, 2.08, -D + 0.62, 0, 0.5);
      }
    } else {
      for (let i = 0; i < 2; i++) {
        const x = cx + (i - 0.5) * span * 0.55;
        const z = -0.8 - i * 0.4;
        const dress = br.goods[(i + (s > 0 ? 1 : 0) + row) % br.goods.length];
        k.cyl(met, 0x2a2a2a, x, 0.04, z, 0.22, 0.22, 0.04, 12);
        k.cyl(met, 0x8a8a8a, x, 0.3, z, 0.02, 0.02, 0.5, 6);
        k.cyl(m8, dress, x, 0.98, z, 0.14, r() < 0.5 ? 0.36 : 0.22, 0.95, 12);
        k.cyl(m6, 0xe8e4dc, x, 1.62, z, 0.16, 0.12, 0.42, 10);
        k.cyl(m6, 0xe8e4dc, x, 1.88, z, 0.04, 0.04, 0.12, 6);
        k.add(new THREE.SphereGeometry(0.11, 10, 8), m6, 0xe8e4dc, x, 2.02, z);
      }
      k.box(met, BRONZE, cx, 2.2, -D + 0.35, span, 0.04, 0.04);
      for (let j = 0; j < 6; j++) k.box(m8, br.goods[j % br.goods.length], cx + (j - 2.5) * span * 0.15, 1.75, -D + 0.35, 0.08, 0.85, 0.42);
    }
  }
}

function bag(k: Kit, x: number, y: number, z: number, color: number, s = 1): void {
  const m = vcMat(0.45);
  k.box(m, color, x, y + 0.14 * s, z, 0.36 * s, 0.26 * s, 0.15 * s);
  k.box(m, scale(color, 0.7), x, y + 0.24 * s, z + 0.078 * s, 0.36 * s, 0.07 * s, 0.01);
  k.add(new THREE.TorusGeometry(0.1 * s, 0.012 * s, 4, 12, Math.PI), m, scale(color, 0.8), x, y + 0.27 * s, z);
  k.box(vcMat(0.3, 0.85), GOLD, x, y + 0.2 * s, z + 0.08 * s, 0.05 * s, 0.03 * s, 0.01);
}

function scale(hex: number, f: number): number {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c.getHex();
}
