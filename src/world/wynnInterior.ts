import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { buildCasinoFloor } from './casinos';
import { GUEST_SHIRTS, Kit, buildPeople, chandelier, glowMat, vcMat, type DressLook, type PeopleLists } from './interiorKit';
import { mat, mesh } from './props';
import { wynnSignature } from './stripSigns';
import { canvasTex, lazyInterior, mapLit, prng } from './themedKit';
import { SignSheet, cable, ceilRect, drumPendant, flowerBall, flowerBed, flowerTex, floorRect, gateOf, hallShell, islandBar, lightPool, paintFlower, paintMarble, parasol, pile, pottedTree, storefront, wrapDraw } from './walkinKit';
import './walkinCatalogs';

/*
 * Wynn Las Vegas, walk-in (build 5). Reference: Wikimedia Commons photos of the casino floor, the
 * atrium and the Parasol bars (2005-2026). What a visitor sees and what this recreates:
 * - From the Strip you walk across the Wynn | Encore plaza to the bronze porte-cochère; the doors lead
 *   into the ATRIUM: cream marble with flower-and-butterfly mosaics, a glass roof, flower beds, and
 *   flower balls (and a flower hot-air balloon) hanging overhead. The Wynn Signature Shop and the
 *   Esplanade boutiques line one side.
 * - The atrium opens into the CASINO: a deep-red carpet scattered with bright flowers, cream marble
 *   walkways inlaid with mosaics, a gold coffered ceiling, tall gold lantern chandeliers along the
 *   aisles and Wynn's red crystal chandeliers over the tables, cream slot chairs.
 * - PARASOL UP: the round bar under a canopy of coloured parasols hanging from the ceiling.
 * - A side door on Sands Ave (toward the self-park), as in real life.
 * The game's Wynn tower stands well back from the Strip, so the low-rise casino sits beside it, behind
 * the Lake of Dreams, and the atrium runs between the Wynn and Encore towers.
 */

// Atrium: between the two towers, from the porte-cochère east to the casino
const AX0 = 53;
const AX1 = 77.4;
const AZ0 = -495.6;
const AZ1 = -486.6;
const AZC = (AZ0 + AZ1) / 2;
const AH = 10;
// Casino floor: east of the Wynn tower, Sands Ave door on the south side
const CX0 = 78;
const CX1 = 99.5;
const CZ0 = -497;
const CZ1 = -423;
const CH = 10;
const CY = CH - 1.6;
const AISLE: [number, number, number, number] = [86.5, 90.5, CZ0 + 0.6, CZ1 - 0.6];
const ENTRY: [number, number, number, number] = [CX0 + 0.6, 91, AZC - 3.3, AZC + 3.3];
const PARASOL: [number, number, number, number] = [91.6, CX1 - 0.6, CZ0 + 0.6, -484.2];
const BAR = { x: 95.3, z: -489.6, r: 2.1 };
type Row = { x: number; z: number; count: number; along: 'x' | 'z'; facing: number };
type Table = { game: 'blackjack' | 'roulette' | 'craps'; x: number; z: number; rot?: number; label: string; vipOnly?: boolean };
// West: the table pit; east: back-to-back slot banks and a wall row; south-west: slot rows by Sands Ave
const TABLES: Table[] = [
  { game: 'blackjack', x: 82.3, z: -479, label: 'Wynn Blackjack' },
  { game: 'roulette', x: 82.3, z: -469, label: 'Wynn Roulette (Single Zero)' },
  { game: 'craps', x: 82.3, z: -458, rot: Math.PI / 2, label: 'Wynn Craps' },
  { game: 'blackjack', x: 82.3, z: -447.5, label: 'Wynn Blackjack ($100)' },
  { game: 'blackjack', x: 95.4, z: -436.5, label: 'Wynn Salon Privé Blackjack', vipOnly: true },
  { game: 'roulette', x: 95.4, z: -428, label: 'Wynn Roulette' },
];
const SLOT_ROWS: Row[] = [];
for (const z of [-478, -470.4, -462.8, -455.2, -447.6]) {
  SLOT_ROWS.push({ x: 93.2, z, count: 6, along: 'z', facing: -Math.PI / 2 }, { x: 94.3, z, count: 6, along: 'z', facing: Math.PI / 2 }, { x: 98.25, z, count: 6, along: 'z', facing: -Math.PI / 2 });
}
for (const z of [-439.2, -431.4]) SLOT_ROWS.push({ x: 82.3, z, count: 6, along: 'x', facing: 0 }, { x: 82.3, z: z - 1.1, count: 6, along: 'x', facing: Math.PI });
SLOT_ROWS.push({ x: 82.3, z: -425.0, count: 6, along: 'x', facing: Math.PI });

export const WYNN = { AX0, AX1, AZ0, AZ1, AZC, CX0, CX1, CZ0, CZ1 };

// ---------------------------------------------------------------- textures
let _carpet: THREE.CanvasTexture | null = null;
/** Wynn's casino carpet: deep red with bright flowers, vines and dots (tile = 4 m). */
function wynnCarpet(): THREE.CanvasTexture {
  return (_carpet ??= canvasTex(
    512,
    512,
    (ctx, w, h) => {
      const rnd = prng(41);
      ctx.fillStyle = '#8c0b17';
      ctx.fillRect(0, 0, w, h);
      // darker red damask scrolls
      ctx.strokeStyle = '#5e0610';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      for (let i = 0; i < 18; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 22 + rnd() * 26;
        wrapDraw(w, h, x, y, r + 8, (px, py) => {
          ctx.beginPath();
          ctx.arc(px, py, r, rnd() * 6, rnd() * 6 + 3.6);
          ctx.stroke();
        });
      }
      // vines with leaves
      for (let i = 0; i < 26; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const a = rnd() * Math.PI * 2;
        wrapDraw(w, h, x, y, 40, (px, py) => {
          ctx.strokeStyle = '#2f8a4a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.quadraticCurveTo(px + Math.cos(a) * 30, py + Math.sin(a) * 30, px + Math.cos(a + 0.8) * 40, py + Math.sin(a + 0.8) * 40);
          ctx.stroke();
          ctx.fillStyle = '#3aa05a';
          ctx.beginPath();
          ctx.ellipse(px + Math.cos(a) * 20, py + Math.sin(a) * 20, 9, 4, a + 1, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      // big bright flowers (the mosaic look of the real carpet)
      const petals = ['#f2c22a', '#2a5ad8', '#e85a9a', '#f2862a', '#6a3ab8', '#38b8d8'];
      for (let i = 0; i < 30; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 10 + rnd() * 18;
        const c = petals[Math.floor(rnd() * petals.length)];
        const ctr = c === '#f2c22a' ? '#d8301a' : '#f6d84a';
        const rot = rnd() * 3;
        const np = 5 + Math.floor(rnd() * 3);
        wrapDraw(w, h, x, y, r + 2, (px, py) => paintFlower(ctx, px, py, r, c, ctr, rot, np, '#3a0408'));
      }
      // gold dots
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = rnd() < 0.7 ? '#e8b84a' : '#f4f0e0';
        const x = rnd() * w;
        const y = rnd() * h;
        ctx.beginPath();
        ctx.arc(x, y, 1.6 + rnd() * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      pile(ctx, w, h, 42);
    },
    true
  ));
}

let _walk: THREE.CanvasTexture | null = null;
/**
 * Cream marble walkway (tile = the walkway's width across, twice that along): purple, red and gold
 * border bands, a small mosaic medallion once per tile and flower inlays between.
 */
function wynnWalkway(): THREE.CanvasTexture {
  return (_walk ??= canvasTex(
    512,
    1024,
    (ctx, w, h) => {
      paintMarble(ctx, w, h, '#efe3cc', '#cdb594', 43, 22);
      ctx.fillStyle = '#3a2a8a';
      ctx.fillRect(0, 0, 18, h);
      ctx.fillRect(w - 18, 0, 18, h);
      ctx.fillStyle = '#b0122a';
      ctx.fillRect(18, 0, 8, h);
      ctx.fillRect(w - 26, 0, 8, h);
      ctx.fillStyle = '#d8b04a';
      ctx.fillRect(26, 0, 3, h);
      ctx.fillRect(w - 29, 0, 3, h);
      // medallion: gold ring, a red eight-point star, a mosaic flower
      const cx = w / 2;
      const cy = h * 0.25;
      ctx.strokeStyle = '#c8a050';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, 118, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 108, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#b01a2a';
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const r = i % 2 ? 52 : 100;
        const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#5a0a14';
      ctx.lineWidth = 3;
      ctx.stroke();
      paintFlower(ctx, cx, cy, 50, '#e8862a', '#2a4ab8', 0.3, 6, '#5a0a14');
      paintFlower(ctx, cx, cy, 20, '#f6d84a', '#3aa05a', 0, 5, '#5a0a14');
      // two smaller flower-and-leaf inlays down the other half
      for (const [y, c] of [
        [h * 0.62, '#e85a9a'],
        [h * 0.86, '#2a6ad8'],
      ] as Array<[number, string]>) {
        ctx.strokeStyle = '#2a7a4a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - 60, y + 20);
        ctx.quadraticCurveTo(cx, y - 10, cx + 60, y + 20);
        ctx.stroke();
        for (const s of [-1, 1]) {
          ctx.fillStyle = '#3aa05a';
          ctx.beginPath();
          ctx.ellipse(cx + s * 44, y + 8, 14, 6, s * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        paintFlower(ctx, cx, y, 26, c, '#f6d84a', 0.2, 5, '#3a0a14');
      }
      const rnd = prng(44);
      for (let i = 0; i < 3500; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
    },
    true
  ));
}

let _atrium: THREE.CanvasTexture | null = null;
/** The atrium floor: cream marble, a pale green diagonal lattice and big mosaic flowers (tile = 5 m). */
function atriumFloor(): THREE.CanvasTexture {
  return (_atrium ??= canvasTex(
    512,
    512,
    (ctx, w, h) => {
      paintMarble(ctx, w, h, '#f2e8d6', '#c8ae88', 45, 10);
      ctx.strokeStyle = '#9ac8a0';
      ctx.lineWidth = 5;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * w * 0.5, 0);
        ctx.lineTo(i * w * 0.5 + w, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i * w * 0.5 + w, 0);
        ctx.lineTo(i * w * 0.5, h);
        ctx.stroke();
      }
      // a big red mosaic flower with a starred centre, a blue-green fern, a butterfly-ish bloom
      paintFlower(ctx, w * 0.27, h * 0.3, 92, '#c8303a', '#3a3a9a', 0.2, 5, '#5a0a14');
      paintFlower(ctx, w * 0.27, h * 0.3, 34, '#e8a03a', '#5ac8c8', 0, 6, '#5a0a14');
      ctx.strokeStyle = '#2a7a5a';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(w * 0.62, h * 0.95);
      ctx.quadraticCurveTo(w * 0.7, h * 0.7, w * 0.88, h * 0.62);
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const t = i / 7;
        const x = w * (0.64 + t * 0.22);
        const y = h * (0.9 - t * 0.27);
        ctx.fillStyle = i % 2 ? '#3a9a6a' : '#5ab88a';
        ctx.beginPath();
        ctx.ellipse(x, y - 14, 7, 20, -0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      paintFlower(ctx, w * 0.8, h * 0.22, 40, '#e85a9a', '#f6d84a', 0.5, 5, '#5a0a14');
      paintFlower(ctx, w * 0.12, h * 0.82, 30, '#f2c22a', '#c8303a', 0.1, 5, '#5a0a14');
      const rnd = prng(46);
      for (let i = 0; i < 2500; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
    },
    true
  ));
}

// ---------------------------------------------------------------- build
export function buildWynnWalkIn(b: WorldBuilder): void {
  // ======== the atrium shell (bronze glass outside, between the towers) ========
  const bronzeGlass = mat(0x6e4a2c, 0.25, 0.6);
  const atriumGate = hallShell(b, {
    x0: AX0,
    x1: AX1,
    z0: AZ0,
    z1: AZ1,
    h: AH,
    wall: bronzeGlass,
    roof: mat(0xc8b494, 0.8),
    doors: [{ side: 'west', at: AZC, width: 5.6, h: 5 }],
    open: ['east'],
  });
  b.zone('Wynn Atrium', AX0, AX1, AZ0, AZ1);
  b.light(0xfff0d8, 16, 30, 65, 7.5, AZC, 0.8);
  // Entrance: bronze portal, the Wynn signature over the doors, warm glow in the opening
  const bronze = mat(0x8a5a32, 0.35, 0.75);
  for (const s of [-1, 1]) b.add(mesh(new THREE.BoxGeometry(0.5, 5.6, 0.5), bronze, AX0 - 0.7, 2.8, AZC + s * 3.05, true));
  b.add(mesh(new THREE.BoxGeometry(0.6, 0.5, 6.6), bronze, AX0 - 0.7, 5.3, AZC));
  b.add(mesh(new THREE.BoxGeometry(2.2, 0.25, 7.4), bronze, AX0 - 1.5, 5.7, AZC, true));
  b.add(mesh(new THREE.BoxGeometry(2.0, 0.04, 7.0), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }), AX0 - 1.5, 5.56, AZC));
  const sig = wynnSignature(b, 'Wynn', 4.6, 1.6);
  sig.position.set(AX0 - 0.68, 6.9, AZC);
  sig.rotation.y = -Math.PI / 2;
  b.add(sig);

  // ======== the casino floor (games, walls, the kit's slots/tables/cashier/sportsbook) ========
  buildCasinoFloor(b, {
    id: 'wynn',
    casinoName: 'Wynn Las Vegas',
    minX: CX0,
    maxX: CX1,
    minZ: CZ0,
    maxZ: CZ1,
    height: CH,
    entrance: { side: 'south', at: 88.5, width: 6 },
    extraEntrances: [{ side: 'west', at: AZC, width: 6.6, inner: true }],
    interior: {
      chandeliers: false,
      bar: false,
      fill: 0.6,
      trim: 0xd8b060,
      cove: 0xffd8a0,
      wainscot: 0x4a2414,
      upperWall: 0xead8b4,
      columnWrap: 0xe8d4ac,
      seat: 0xf0e2c8,
      slotThemes: [1, 0, 4, 2, 6, 7],
      paths: [AISLE, ENTRY],
      keepOut: [PARASOL, [AISLE[0] - 1.6, AISLE[1] + 1.6, -486.5, -481.5]],
    },
    carpet: ['#8c0b17', '#e8b84a', '#2a5ad8'],
    wall: 0x7a5434,
    ceiling: 0xf2dcae,
    ceilingGlow: 0x5a3a10,
    light: 0xffc890,
    slots: { accent: '#ffd27a', topper: 0xffc34d, rows: SLOT_ROWS },
    slotLabel: 'Wynn Slots',
    tables: TABLES,
    felt: 0x1d5a3a,
    guard: { kick: [47, -484] },
    pickups: [
      { x: BAR.x + 2.05, y: 1.25, z: BAR.z + 0.6, amount: 4, label: 'Parasol Up Bar-Top Pack!' },
      { x: 82.3, z: -469, y: 1.35, amount: 3, label: 'Wynn Roulette Rail Pack' },
    ],
    tourists: [
      { pts: [[88.5, -426], [88.5, -492], [60, AZC]], prop: 'camera' },
      { pts: [[89.6, -440], [89.6, -484], [92.5, -484]], prop: 'yard-drink' },
    ],
  });
  // Outside: bronze-glass window bands on the Sands Ave and golf-course faces, the Wynn signature
  const winMat = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x3a2814, roughness: 0.15, metalness: 0.7, emissive: 0xffb060, emissiveIntensity: 0.05 }), 0.05, 0.75);
  b.add(mesh(new THREE.BoxGeometry(0.1, 2.0, CZ1 - CZ0 - 3), winMat, CX1 + 0.66, 6.9, (CZ0 + CZ1) / 2));
  for (const [x0, x1] of [
    [CX0 + 1, 84.2],
    [92.8, CX1 - 1],
  ]) b.add(mesh(new THREE.BoxGeometry(x1 - x0, 2.0, 0.1), winMat, (x0 + x1) / 2, 6.9, CZ1 + 0.66));
  for (const [x, z, ry] of [
    [88.5, CZ1 + 1.1, 0],
    [CX1 + 1.1, -462, Math.PI / 2],
  ]) {
    const w = wynnSignature(b, 'Wynn', 5.2, 1.8);
    w.position.set(x, 7.0, z);
    w.rotation.y = ry;
    b.add(w);
  }
  b.zone('Parasol Up Lounge (Wynn Casino)', PARASOL[0], PARASOL[1], PARASOL[2], PARASOL[3]);
  b.collider(BAR.x - BAR.r, BAR.x + BAR.r, BAR.z - BAR.r, BAR.z + BAR.r, 0, 1.15, true);
  b.shopSpots.push({ kind: 'store', catalog: 'wynn-parasol-up', position: new THREE.Vector3(BAR.x - 0.6, 0, BAR.z + BAR.r + 1.2), radius: 2.2, label: 'Parasol Up', hint: 'cocktails, champagne, truffle fries' });

  // Atrium planting + shop colliders (the dressing itself is lazy)
  const bedD = 1.3;
  b.collider(AX0 + 1.4, AX1 - 0.4, AZ1 - 0.6 - bedD, AZ1 - 0.6, 0, 0.7, true);
  const shopZ = AZ0 + 0.6;
  b.shopSpots.push({ kind: 'store', catalog: 'wynn-signature', position: new THREE.Vector3(65.2, 0, shopZ + 1.6), radius: 2.0, label: 'Wynn Signature Shop', hint: 'robes, candles, keepsakes' });
  b.pickup(58.2, 1.05, AZ1 - 1.2, 2, 'Atrium Flower Bed Pack', true);

  // ======== dressing (lazy, door-gated) ========
  const sheet = new SignSheet([1024, 512]);
  const sLV = sheet.text(512, 96, 'LOUIS VUITTON', '#f2ead8', '#3a2a1e', 'Georgia, serif', undefined, '#c8a050');
  const sWynn = sheet.text(512, 96, 'Wynn Signature Shop', '#5a2a10', '#f2e6cc', '"Brush Script MT", "Segoe Script", cursive', undefined, '#b08a4a');
  const sChanel = sheet.text(512, 96, 'CHANEL', '#111111', '#f4f2ee', '"Futura", "Century Gothic", sans-serif', undefined, '#1a1a1a');
  const sParasol = sheet.text(512, 110, 'Parasol Up', '#ffe8c0', '#3a0a10', '"Brush Script MT", "Segoe Script", cursive', undefined, '#d8a850');
  const sCasino = sheet.text(512, 96, 'CASINO', '#f2dca8', '#2a1208', 'Georgia, serif', 'WYNN LAS VEGAS', '#c8a050');
  const sAtrium = sheet.text(512, 96, 'ATRIUM • ESPLANADE', '#f2dca8', '#2a1208', 'Georgia, serif', 'LOBBY • ENCORE • LAKE OF DREAMS', '#c8a050');

  const dress: DressLook = { trim: 0xd8b060, wood: 0x4a2414, dark: 0x1a1008, accent: 0xc8102e, seat: 0xf0e2c8, cove: 0xffd8a0 };
  const flowersRed = flowerTex(['#d8182e', '#f04050', '#b0102a', '#ff6a7a'], '#2a5a2a', 5);
  const flowersMix = flowerTex(['#f2c22a', '#e85a9a', '#f2862a', '#ffffff', '#c8182e'], '#2f5f2a', 6);
  const flowersPink = flowerTex(['#ff8ab8', '#f05a9a', '#ffd0e0', '#ffffff'], '#2a5a2a', 7);

  // ---------------- the atrium ----------------
  lazyInterior(b, 'interior:wynn-atrium', atriumGate, (group) => {
    const k = new Kit();
    const ppl: PeopleLists = { seated: [], standing: [] };
    const ix0 = AX0 + 0.6;
    const ix1 = AX1;
    const iz0 = AZ0 + 0.6;
    const iz1 = AZ1 - 0.6;
    const top = AH - 0.6;
    floorRect(k, mapLit(atriumFloor(), 0.25), ix0, ix1, iz0, iz1, 0.04, 5);
    // cream walls with gold trim and a deep red base
    for (const [z, ry] of [
      [iz0 + 0.01, 0],
      [iz1 - 0.01, Math.PI],
    ] as Array<[number, number]>) {
      k.at((ix0 + ix1) / 2, 0, z, ry, () => {
        k.quad(vcMat(0.8), 0xf0e2c8, 0, top / 2, 0, ix1 - ix0, top);
        k.box(vcMat(0.6), 0x6a1420, 0, 0.35, 0.03, ix1 - ix0, 0.7, 0.06);
        k.box(vcMat(0.3, 0.8), 0xd8b060, 0, 0.72, 0.05, ix1 - ix0, 0.05, 0.06);
        k.box(vcMat(0.3, 0.8), 0xd8b060, 0, top - 0.5, 0.05, ix1 - ix0, 0.12, 0.08);
        k.box(glowMat(), 0xffdca8, 0, top - 0.62, 0.1, ix1 - ix0, 0.04, 0.04);
      });
    }
    k.at(ix0 + 0.01, 0, AZC, Math.PI / 2, () => {
      for (const s of [-1, 1]) k.quad(vcMat(0.8), 0xf0e2c8, s * 3.5, top / 2, 0, 1.4, top);
      k.quad(vcMat(0.8), 0xf0e2c8, 0, (5 + top) / 2, 0, 5.6, top - 5);
    });
    // glass roof: a bronze lattice over a sky-lit glow
    ceilRect(k, glowMat(), ix0, ix1, iz0, iz1, top + 0.3, 1, 0xdce8f0);
    for (let x = ix0 + 1.5; x < ix1; x += 1.5) k.box(vcMat(0.35, 0.7), 0x7a5a36, x, top + 0.2, AZC, 0.08, 0.18, iz1 - iz0);
    for (let z = iz0 + 1.3; z < iz1; z += 1.3) k.box(vcMat(0.35, 0.7), 0x7a5a36, (ix0 + ix1) / 2, top + 0.2, z, ix1 - ix0, 0.18, 0.08);
    k.box(vcMat(0.4, 0.6), 0xd8b060, (ix0 + ix1) / 2, top, AZC, ix1 - ix0, 0.15, iz1 - iz0 - 0.1);
    k.box(vcMat(0.4, 0.6), 0xf0e2c8, (ix0 + ix1) / 2, top - 0.05, AZC, ix1 - ix0, 0.1, iz1 - iz0);
    k.box(glowMat(), 0xdce8f0, (ix0 + ix1) / 2, top - 0.1, AZC, ix1 - ix0 - 1.0, 0.02, iz1 - iz0 - 1.0);

    // south side: one long flower bed with trees and topiary
    const bedZ = iz1 - bedD / 2;
    flowerBed(k, (ix0 + 0.8 + ix1 - 0.4) / 2 + 0.4, bedZ, ix1 - ix0 - 1.6, bedD, flowersRed, 0xe8dcc4, 0.6);
    for (let x = ix0 + 3; x < ix1 - 1; x += 5.2) {
      pottedTree(k, x, bedZ, 3.6);
      flowerBall(k, x + 2.6, 1.55, bedZ, 0.55, flowersPink);
      k.cyl(vcMat(0.8), 0x5a4030, x + 2.6, 1.0, bedZ, 0.05, 0.06, 0.6, 5);
    }
    // north side: the boutiques
    const fronts: Array<[typeof sLV, number, number, number]> = [
      [sLV, 58.4, 0x3a2a1e, 0xfff0d8],
      [sWynn, 65.2, 0xc8a878, 0xfff4e0],
      [sChanel, 72.0, 0xf2f0ea, 0xfff8f0],
    ];
    for (const [r, x, frame, glow] of fronts) storefront(k, sheet, r, x, iz0, 0, 6.4, 5.6, frame, glow);
    // hanging flower balls down the middle, and a flower hot-air balloon
    const balls: Array<[number, number, number, THREE.CanvasTexture]> = [
      [57.5, 6.2, 0.75, flowersMix],
      [61, 7.0, 0.55, flowersPink],
      [70, 6.8, 0.6, flowersPink],
      [74, 6.0, 0.8, flowersMix],
    ];
    for (const [x, y, r, tex] of balls) {
      flowerBall(k, x, y, AZC, r, tex);
      cable(k, x, y + r, AZC, top, 0x8a7a5a);
    }
    {
      const bx = 65.6;
      const by = 6.4;
      flowerBall(k, bx, by, AZC, 1.5, flowersRed);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const g = new THREE.SphereGeometry(1.52, 4, 10, a, 0.12);
        k.add(g, vcMat(0.6), 0xf6d84a, bx, by, AZC);
      }
      for (const [dx, dz] of [
        [-0.35, -0.35],
        [0.35, -0.35],
        [-0.35, 0.35],
        [0.35, 0.35],
      ]) k.cyl(vcMat(0.5, 0.6), 0x6a4a2a, bx + dx, by - 1.85, AZC + dz, 0.015, 0.015, 1.0, 4);
      k.box(vcMat(0.8), 0x9a6a3a, bx, by - 2.55, AZC, 0.85, 0.5, 0.85);
      flowerBall(k, bx, by - 2.25, AZC, 0.38, flowersMix);
      cable(k, bx, by + 1.5, AZC, top, 0x8a7a5a);
      lightPool(k, bx, AZC, 2.8, 0x2a1a08);
    }
    // wayfinding
    const signY = 4.6;
    k.box(vcMat(0.4, 0.5), 0x2a1208, AX1 - 3, signY, AZC, 0.1, 0.9, 4.2);
    sheet.quad(k, sCasino, AX1 - 3.06, signY, AZC, 4, 0.75, -Math.PI / 2);
    sheet.quad(k, sAtrium, AX1 - 2.94, signY, AZC, 4, 0.75, Math.PI / 2);
    for (const s of [-1, 1]) cable(k, AX1 - 3, signY + 0.45, AZC + s * 1.6, top, 0xd8b060);
    // a few guests
    const rnd = prng(77);
    for (let i = 0; i < 6; i++) {
      const x = ix0 + 2 + rnd() * (ix1 - ix0 - 4);
      const z = AZC + (rnd() - 0.5) * 3.5;
      ppl.standing.push({ x, z, rot: rnd() * Math.PI * 2, shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
    }
    k.flush(group);
    buildPeople(group, 'sit', ppl.seated);
    buildPeople(group, 'stand', ppl.standing);
    return [];
  });

  // ---------------- the casino's own look (over the kit's floor) ----------------
  const casinoGate = gateOf(CX0, CX1, CZ0, CZ1, CH, [
    { side: 'south', at: 88.5, width: 6 },
    { side: 'west', at: AZC, width: 6.6 },
  ]);
  lazyInterior(b, 'interior:wynn-look', casinoGate, (group) => {
    const k = new Kit();
    const ppl: PeopleLists = { seated: [], standing: [] };
    const ix0 = CX0 + 0.6;
    const ix1 = CX1 - 0.6;
    const iz0 = CZ0 + 0.6;
    const iz1 = CZ1 - 0.6;
    // red flowered carpet over the kit's base carpet, then the marble walkways on top
    floorRect(k, mapLit(wynnCarpet(), 0.92), ix0, ix1, iz0, iz1, 0.036, 4);
    const walk = mapLit(wynnWalkway(), 0.22);
    {
      const [a, c, d, e] = AISLE;
      const g = new THREE.PlaneGeometry(c - a, e - d);
      g.rotateX(-Math.PI / 2);
      // the walkway tile is square across the aisle; repeat along it
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * ((e - d) / (c - a) / 2));
      k.add(g, walk, 0xffffff, (a + c) / 2, 0.042, (d + e) / 2);
    }
    {
      const [a, c, d, e] = ENTRY;
      const g = new THREE.PlaneGeometry(e - d, c - a);
      g.rotateX(-Math.PI / 2);
      g.rotateY(Math.PI / 2);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * ((c - a) / (e - d) / 2));
      k.add(g, walk, 0xffffff, (a + c) / 2, 0.041, (d + e) / 2);
    }
    // red silk panels in gilded frames between the wall pilasters (west and south walls)
    const panel = (x: number, z: number, ry: number, w: number) =>
      k.at(x, 0, z, ry, () => {
        k.quad(vcMat(0.9), 0x7a1020, 0, 4.1, 0.03, w, 3.6);
        k.box(vcMat(0.3, 0.85), 0xd8b060, 0, 5.95, 0.05, w + 0.2, 0.12, 0.06);
        k.box(vcMat(0.3, 0.85), 0xd8b060, 0, 2.25, 0.05, w + 0.2, 0.12, 0.06);
        for (const s of [-1, 1]) k.box(vcMat(0.3, 0.85), 0xd8b060, s * (w / 2 + 0.04), 4.1, 0.05, 0.1, 3.8, 0.06);
        k.box(glowMat(), 0xffd8a0, 0, 6.1, 0.09, w, 0.03, 0.03);
      });
    for (let z = iz0 + 5; z < iz1 - 2; z += 5) if (Math.abs(z - AZC) > 4.5) panel(ix0 + 0.01, z, Math.PI / 2, 3.4);
    for (let x = ix0 + 5; x < ix1 - 2; x += 5) if (Math.abs(x - 88.5) > 4.5) panel(x, iz1 - 0.01, Math.PI, 3.4);
    // gold lantern chandeliers down both sides of the aisle, light pools under them
    for (let z = iz0 + 5; z < iz1 - 2; z += 6.5) {
      for (const x of [AISLE[0] - 0.9, AISLE[1] + 0.9]) {
        if (x > PARASOL[0] && z < PARASOL[3]) continue;
        drumPendant(k, x, CY - 2.0, z, 0.5, 1.0, 0xffc26a, 0xc89a48, CY);
        lightPool(k, x, z, 1.8, 0x2a1808);
      }
    }
    // Wynn's red crystal chandeliers over the tables
    for (const { x, z } of TABLES) {
      chandelier(k, x, CY, z, 1.25, dress, 0xff3a4a);
      lightPool(k, x, z, 2.6, 0x30080c);
    }
    // a gilded "tented" dome over the aisle crossing at the atrium
    {
      const x = (AISLE[0] + AISLE[1]) / 2;
      const z = AZC;
      for (const [r, c] of [
        [3.0, 0xd8b060],
        [2.4, 0xd8b060],
      ] as Array<[number, number]>) {
        const ring = new THREE.TorusGeometry(r, 0.09, 6, 36);
        ring.rotateX(Math.PI / 2);
        k.add(ring, vcMat(0.3, 0.85), c, x, CY - 0.15, z);
      }
      const disc = new THREE.CircleGeometry(2.4, 36);
      disc.rotateX(Math.PI / 2);
      k.add(disc, glowMat(), 0xe8903a, x, CY - 0.08, z);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        k.box(vcMat(0.5, 0.4), 0xb86a2a, x + Math.cos(a) * 1.5, CY - 0.1, z + Math.sin(a) * 1.5, 0.05, 0.04, 1.8, -a + Math.PI / 2);
      }
      const ocu = new THREE.CircleGeometry(0.6, 24);
      ocu.rotateX(Math.PI / 2);
      k.add(ocu, glowMat(), 0xfff6e0, x, CY - 0.1, z);
      drumPendant(k, x, CY - 2.2, z, 0.75, 1.3, 0xffc26a, 0xc89a48, CY - 0.1);
    }
    // a red flower urn at the head of the aisle
    {
      const x = (AISLE[0] + AISLE[1]) / 2;
      const z = -484;
      k.cyl(vcMat(0.5, 0.4), 0xe8d4ac, x, 0.5, z, 1.0, 0.7, 1.0, 18);
      k.cyl(vcMat(0.3, 0.85), 0xd8b060, x, 1.02, z, 1.05, 1.05, 0.06, 18);
      flowerBall(k, x, 1.6, z, 1.0, flowersRed);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        flowerBall(k, x + Math.cos(a) * 0.9, 1.35, z + Math.sin(a) * 0.9, 0.35, flowersMix);
      }
    }
    // Parasol Up: the round bar under a ceiling of parasols
    {
      const [a, c, d, e] = PARASOL;
      floorRect(k, mapLit(atriumFloor(), 0.25), a, c, d, e, 0.045, 5);
      islandBar(k, BAR.x, BAR.z, BAR.r * 2, BAR.r * 2, { top: 0x1a0e08, front: 0x6a1420, trim: 0x3a2414, stool: 0xc8102e, glow: 0xffc070, bartender: [0xf4f4f0, 0x6a1420] }, ppl, 91, true);
      sheet.quad(k, sParasol, (a + c) / 2, 3.6, e + 0.02, 3.2, 0.7, 0);
      k.box(vcMat(0.4, 0.5), 0x3a0a10, (a + c) / 2, 3.6, e - 0.04, 3.4, 0.8, 0.08);
      for (const s of [-1, 1]) cable(k, (a + c) / 2 + s * 1.4, 4.0, e, CY, 0xd8b060);
      const cols = [0xd8182e, 0xf2862a, 0xf2c22a, 0x3a9a5a, 0x2a6ad8, 0xe85a9a, 0x8a3ab8, 0xf4ead8];
      const rnd = prng(88);
      let i = 0;
      for (let x = a + 1.0; x < c - 0.6; x += 1.7) {
        for (let z = d + 1.0; z < e - 0.6; z += 1.7) {
          const y = 5.0 + rnd() * 2.2;
          const r = 0.75 + rnd() * 0.35;
          parasol(k, x + (rnd() - 0.5) * 0.5, y, z + (rnd() - 0.5) * 0.5, r, cols[i++ % cols.length], (rnd() - 0.5) * 0.5, rnd() * 6);
          cable(k, x, y + 0.2, z, CY, 0xd8c8a0);
        }
      }
      // warm lamps on low cocktail tables round the edge
      for (const [tx, tz] of [
        [a + 1.0, d + 1.2],
        [a + 1.0, e - 1.3],
        [c - 0.9, e - 1.3],
      ]) {
        k.cyl(vcMat(0.3, 0.4), 0x1a0e08, tx, 0.5, tz, 0.4, 0.4, 0.05, 14);
        k.cyl(vcMat(0.4, 0.6), 0xd8b060, tx, 0.25, tz, 0.05, 0.08, 0.5, 6);
        for (const s of [-1, 1]) {
          k.box(vcMat(0.7), 0xc8102e, tx + s * 0.7, 0.25, tz, 0.55, 0.5, 0.55);
          ppl.seated.push({ x: tx + s * 0.7, y: 0.05, z: tz, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2, shirt: GUEST_SHIRTS[(i++ * 3) % GUEST_SHIRTS.length] });
        }
      }
      lightPool(k, BAR.x, BAR.z, 4.2, 0x2a1408);
    }
    k.flush(group);
    buildPeople(group, 'sit', ppl.seated);
    buildPeople(group, 'stand', ppl.standing);
    return [];
  });
}
