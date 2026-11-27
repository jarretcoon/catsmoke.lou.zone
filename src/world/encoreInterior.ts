import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { buildCasinoFloor } from './casinos';
import { GUEST_SHIRTS, Kit, buildPeople, glowMat, vcMat, type PeopleLists } from './interiorKit';
import { basic, mat, mesh } from './props';
import { wynnSignature } from './stripSigns';
import { canvasTex, lazyInterior, mapGlow, mapLit, prng } from './themedKit';
import { SignSheet, cable, floorRect, gateOf, glowDouble, islandBar, latticeVault, lightPool, paintButterfly, paintMarble, pile, pottedPalm, storefront, wrapDraw } from './walkinKit';
import './walkinCatalogs';

/*
 * Encore Las Vegas, walk-in (build 5). Reference: Wikimedia Commons photos of the Encore lobby (red
 * carpet, red shade chandeliers, gold), the butterfly mosaic walkway at the Encore entrance, the
 * Esplanade (cream lattice vault, jewelled glass chandeliers, red runner with a blue border, boutiques)
 * and the Strip entrance arch with the Encore oval.
 * - The casino sits behind the Strip-side garden, in front of the tower: doors to the porte-cochère
 *   (north), a Strip entrance through the garden under the Encore arch (west), and the Esplanade door
 *   (south) that leads across to the Wynn atrium, as the real Esplanade joins the two.
 * - Inside: red carpet with butterflies, cream marble walkways with butterfly mosaics, clusters of red
 *   drum-shade chandeliers, tall garden windows, slot banks and a table pit, the Eastside Lounge.
 * - The Esplanade runs down the east side under a lattice vault with jewelled chandeliers and boutiques.
 */

const CX0 = 26;
const CX1 = 56.5;
const CZ0 = -546;
const CZ1 = -500;
const CH = 10;
const CY = CH - 1.6;
const ix0 = CX0 + 0.6;
const ix1 = CX1 - 0.6;
const iz0 = CZ0 + 0.6;
const iz1 = CZ1 - 0.6;
const ESP: [number, number, number, number] = [50.4, ix1, iz0, iz1];
const ESPX = (ESP[0] + ESP[1]) / 2;
const NORTH_DOOR = 40;
const WEST_DOOR = -510;
const AISLE: [number, number, number, number] = [38, 42, iz0, iz1];
const WEST_PATH: [number, number, number, number] = [ix0, 38, WEST_DOOR - 3, WEST_DOOR + 3];
const BAR = { x: 46.2, z: -523, w: 6.4, d: 4.4 };
const KEEP_BAR: [number, number, number, number] = [42.3, 50.3, -527.2, -518.8];

type Row = { x: number; z: number; count: number; along: 'x' | 'z'; facing: number };
type Table = { game: 'blackjack' | 'roulette' | 'craps'; x: number; z: number; rot?: number; label: string; vipOnly?: boolean };
const TABLES: Table[] = [
  { game: 'blackjack', x: 46.2, z: -540.5, label: 'Encore Blackjack' },
  { game: 'roulette', x: 46.2, z: -533, label: 'Encore Roulette' },
  { game: 'craps', x: 46.2, z: -513, rot: Math.PI / 2, label: 'Encore Craps' },
  { game: 'blackjack', x: 46.2, z: -505.5, label: 'Encore Salon Blackjack', vipOnly: true },
];
const SLOT_ROWS: Row[] = [];
for (const [z, n] of [
  [-541.5, 6],
  [-534.5, 6],
  [-527.5, 6],
  [-520.5, 6],
  [-503.6, 4],
] as Array<[number, number]>) {
  for (const x of [30.0, 34.4]) SLOT_ROWS.push({ x, z, count: n, along: 'z', facing: -Math.PI / 2 }, { x: x + 1.1, z, count: n, along: 'z', facing: Math.PI / 2 });
}

// ---------------------------------------------------------------- textures
let _carpet: THREE.CanvasTexture | null = null;
/** Encore's red carpet: red on red scrolls with butterflies in gold, coral and pink (tile = 4 m). */
function encoreCarpet(): THREE.CanvasTexture {
  return (_carpet ??= canvasTex(
    512,
    512,
    (ctx, w, h) => {
      const rnd = prng(61);
      ctx.fillStyle = '#a60e1c';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#7a0812';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (let i = 0; i < 22; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 18 + rnd() * 30;
        const a0 = rnd() * 6;
        wrapDraw(w, h, x, y, r + 6, (px, py) => {
          ctx.beginPath();
          ctx.arc(px, py, r, a0, a0 + 4);
          ctx.stroke();
        });
      }
      const wings = ['#f2b63a', '#ff7a4a', '#ff9ab8', '#ffd86a', '#c8203a', '#f4ead8'];
      for (let i = 0; i < 22; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 12 + rnd() * 16;
        const c = wings[Math.floor(rnd() * wings.length)];
        const rot = (rnd() - 0.5) * 1.6;
        wrapDraw(w, h, x, y, r + 2, (px, py) => paintButterfly(ctx, px, py, r, c, '#4a0408', rot, c === '#c8203a' ? '#f2b63a' : '#c8203a'));
      }
      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = rnd() < 0.6 ? '#e8b84a' : '#ff6a7a';
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * h, 1.4 + rnd() * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      pile(ctx, w, h, 62);
    },
    true
  ));
}

let _walk: THREE.CanvasTexture | null = null;
/** Cream marble with big mosaic butterflies (the Encore entrance walkway); tile = width × 2·width. */
function encoreWalkway(): THREE.CanvasTexture {
  return (_walk ??= canvasTex(
    512,
    1024,
    (ctx, w, h) => {
      paintMarble(ctx, w, h, '#f2e6cf', '#d2bc98', 63, 20);
      ctx.fillStyle = '#c8a050';
      ctx.fillRect(0, 0, 10, h);
      ctx.fillRect(w - 10, 0, 10, h);
      ctx.fillStyle = '#8a1420';
      ctx.fillRect(10, 0, 6, h);
      ctx.fillRect(w - 16, 0, 6, h);
      const rnd = prng(64);
      const wings = ['#e8862a', '#c8303a', '#f2c23a', '#e85a3a', '#3a6ad8'];
      const spots: Array<[number, number, number]> = [
        [0.3, 0.14, 95],
        [0.7, 0.36, 70],
        [0.35, 0.6, 85],
        [0.72, 0.84, 60],
      ];
      for (const [u, v, r] of spots) paintButterfly(ctx, u * w, v * h, r, wings[Math.floor(rnd() * wings.length)], '#3a1408', (rnd() - 0.5) * 1.4, wings[Math.floor(rnd() * wings.length)]);
      for (let i = 0; i < 3500; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
    },
    true
  ));
}

let _runner: THREE.CanvasTexture | null = null;
/** The Esplanade runner: red with a royal-blue border, gold scrolls; marble margins (tile = 5.5 × 5.5 m). */
function runnerTex(): THREE.CanvasTexture {
  return (_runner ??= canvasTex(
    512,
    512,
    (ctx, w, h) => {
      paintMarble(ctx, w, h, '#f2e8d6', '#d2bc98', 65, 10);
      const m = w * 0.16;
      ctx.fillStyle = '#2a3a9a';
      ctx.fillRect(m, 0, w - m * 2, h);
      ctx.fillStyle = '#9a0c18';
      ctx.fillRect(m + 16, 0, w - m * 2 - 32, h);
      ctx.strokeStyle = '#f2c23a';
      ctx.lineWidth = 3;
      ctx.strokeRect(m + 22, -4, w - m * 2 - 44, h + 8);
      const rnd = prng(66);
      for (let i = 0; i < 6; i++) {
        const y = (i + 0.5) * (h / 6);
        ctx.strokeStyle = '#e8a83a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(w / 2 - 30, y, 22, -0.4, 3.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(w / 2 + 30, y, 22, Math.PI - 3.6, Math.PI + 0.4);
        ctx.stroke();
        paintButterfly(ctx, w / 2, y, 12, '#f2c23a', '#6a0a12', 0);
      }
      pile(ctx, w, h, 67, 3000);
      void rnd;
    },
    true
  ));
}

let _jewel: THREE.CanvasTexture | null = null;
/** Coloured glass "jewels" for the Esplanade chandeliers. */
function jewelTex(): THREE.CanvasTexture {
  return (_jewel ??= canvasTex(
    256,
    256,
    (ctx, w, h) => {
      const rnd = prng(68);
      ctx.fillStyle = '#2a1430';
      ctx.fillRect(0, 0, w, h);
      const cols = ['#ff3a4a', '#3a7aff', '#3ad86a', '#ffc23a', '#c84aff', '#ffffff', '#ff7a2a', '#4ae8e8'];
      for (let i = 0; i < 420; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 4 + rnd() * 7;
        ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
        wrapDraw(w, h, x, y, r, (px, py) => {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    },
    true
  ));
}

let _win: THREE.CanvasTexture | null = null;
/** Outside wall bay (4.5 m): cream stucco, an arched window with a white lattice screen over red drapes. */
function encoreWindowsTex(): THREE.CanvasTexture {
  return (_win ??= canvasTex(
    256,
    320,
    (ctx, w, h) => {
      ctx.fillStyle = '#ece2d0';
      ctx.fillRect(0, 0, w, h);
      const x0 = w * 0.2;
      const x1 = w * 0.8;
      const yTop = h * 0.2;
      const yBot = h * 0.92;
      const arch = new Path2D();
      arch.moveTo(x0, yBot);
      arch.lineTo(x0, yTop + (x1 - x0) / 2);
      arch.arc((x0 + x1) / 2, yTop + (x1 - x0) / 2, (x1 - x0) / 2, Math.PI, 0);
      arch.lineTo(x1, yBot);
      arch.closePath();
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, '#5a0610');
      g.addColorStop(0.5, '#b0101e');
      g.addColorStop(1, '#5a0610');
      ctx.fillStyle = g;
      ctx.fill(arch);
      ctx.save();
      ctx.clip(arch);
      ctx.strokeStyle = '#f8f4ec';
      ctx.lineWidth = 3;
      for (let i = -12; i < 12; i++) {
        ctx.beginPath();
        ctx.moveTo(x0 + i * 16, yTop);
        ctx.lineTo(x0 + i * 16 + (yBot - yTop), yBot);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x1 - i * 16, yTop);
        ctx.lineTo(x1 - i * 16 - (yBot - yTop), yBot);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#c8a050';
      ctx.lineWidth = 6;
      ctx.stroke(arch);
      ctx.fillStyle = '#d8ccb4';
      ctx.fillRect(0, h * 0.94, w, h * 0.06);
    },
    true
  ));
}

let _winGlow: THREE.CanvasTexture | null = null;
/** Emissive mask for the outside windows: only the drape glows after dark. */
function encoreWindowsGlow(): THREE.CanvasTexture {
  return (_winGlow ??= canvasTex(
    256,
    320,
    (ctx, w, h) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const x0 = w * 0.2;
      const x1 = w * 0.8;
      const yTop = h * 0.2;
      const yBot = h * 0.92;
      ctx.beginPath();
      ctx.moveTo(x0, yBot);
      ctx.lineTo(x0, yTop + (x1 - x0) / 2);
      ctx.arc((x0 + x1) / 2, yTop + (x1 - x0) / 2, (x1 - x0) / 2, Math.PI, 0);
      ctx.lineTo(x1, yBot);
      ctx.closePath();
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, '#5a1408');
      g.addColorStop(0.5, '#e0503a');
      g.addColorStop(1, '#5a1408');
      ctx.fillStyle = g;
      ctx.fill();
    },
    true
  ));
}

// ---------------------------------------------------------------- pieces
/** Encore's red drum-shade chandelier: two rings of red shades round a gold stem (the lobby's). */
function redShadeChandelier(k: Kit, x: number, z: number, top: number, r: number): void {
  cable(k, x, top - 1.6, z, top, 0xc89a48);
  const disc = new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.06, 16);
  k.add(disc, vcMat(0.3, 0.85), 0xd8b060, x, top - 0.9, z);
  for (const [rr, n, y] of [
    [r, 10, top - 2.0],
    [r * 0.55, 6, top - 1.55],
  ] as Array<[number, number, number]>) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr;
      const sx = x + Math.cos(a) * rr;
      const sz = z + Math.sin(a) * rr;
      k.add(new THREE.CylinderGeometry(0.2, 0.26, 0.38, 12, 1, true), glowDouble(), 0xff2a3a, sx, y, sz);
      k.cyl(vcMat(0.3, 0.85), 0xd8b060, sx, (y + top - 0.9) / 2 + 0.1, sz, 0.01, 0.01, top - 0.9 - y, 4);
    }
  }
}

/** A jewelled glass chandelier (the Esplanade's): a coloured glass ellipsoid with a green leaf crown. */
function jewelChandelier(k: Kit, x: number, y: number, z: number, cy: number): void {
  cable(k, x, y + 0.9, z, cy, 0xc89a48);
  const g = new THREE.SphereGeometry(0.55, 16, 12);
  g.scale(1, 1.45, 1);
  k.add(g, mapGlow(jewelTex()), 0xffffff, x, y, z);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.PlaneGeometry(0.22, 0.6);
    leaf.translate(0, 0.3, 0);
    leaf.rotateX(-0.5);
    leaf.rotateY(a);
    k.add(leaf, glowDouble(), 0x2ab84a, x, y + 0.72, z);
  }
  const tass = new THREE.ConeGeometry(0.18, 0.45, 10);
  tass.rotateX(Math.PI);
  k.add(tass, glowMat(), 0xff4a5a, x, y - 1.0, z);
  const ring = new THREE.TorusGeometry(0.42, 0.03, 4, 18);
  ring.rotateX(Math.PI / 2);
  k.add(ring, vcMat(0.3, 0.85), 0xd8b060, x, y + 0.65, z);
}

// ---------------------------------------------------------------- build
export function buildEncoreWalkIn(b: WorldBuilder): void {
  buildCasinoFloor(b, {
    id: 'encore',
    casinoName: 'Encore Las Vegas',
    minX: CX0,
    maxX: CX1,
    minZ: CZ0,
    maxZ: CZ1,
    height: CH,
    entrance: { side: 'north', at: NORTH_DOOR, width: 6 },
    extraEntrances: [
      { side: 'west', at: WEST_DOOR, width: 6 },
      { side: 'south', at: ESPX, width: 4.6 },
    ],
    interior: {
      chandeliers: false,
      bar: false,
      columns: false,
      highLimit: false,
      fill: 0.5,
      trim: 0xd8b060,
      cove: 0xffb890,
      wainscot: 0x5a0c14,
      upperWall: 0xf0dcc0,
      seat: 0xb0101e,
      slotThemes: [0, 1, 6, 4, 7, 2],
      paths: [AISLE, WEST_PATH, ESP],
      keepOut: [KEEP_BAR],
    },
    carpet: ['#a60e1c', '#e8b84a', '#ff7a4a'],
    wall: 0xe8dcc8,
    ceiling: 0xf0d8b0,
    ceilingGlow: 0x5a2a10,
    light: 0xffb8a0,
    slots: { accent: '#ff6a7a', topper: 0xff3a4a, rows: SLOT_ROWS },
    slotLabel: 'Encore Slots',
    tables: TABLES,
    felt: 0x7a1020,
    guard: { kick: [40, -553] },
    pickups: [
      { x: BAR.x, y: 1.25, z: BAR.z - BAR.d / 2 + 0.3, amount: 4, label: 'Eastside Lounge Bar-Top Pack!' },
      { x: 46.2, z: -533, y: 1.35, amount: 3, label: 'Encore Roulette Rail Pack' },
    ],
    tourists: [
      { pts: [[ESPX, -502], [ESPX, -544]], prop: 'bag' },
      { pts: [[40, -544], [40, -512], [28, -510]], prop: 'camera' },
    ],
  });
  b.zone('Encore Esplanade', ESP[0], ESP[1], ESP[2], ESP[3]);
  b.zone('Eastside Lounge (Encore Casino)', KEEP_BAR[0], KEEP_BAR[1], KEEP_BAR[2], KEEP_BAR[3]);
  // bar counter ring and the Esplanade's columns (the dressing is lazy)
  b.collider(BAR.x - BAR.w / 2, BAR.x + BAR.w / 2, BAR.z - BAR.d / 2, BAR.z + BAR.d / 2, 0, 1.15, true);
  b.shopSpots.push({ kind: 'store', catalog: 'encore-eastside', position: new THREE.Vector3(BAR.x - BAR.w / 2 - 1.1, 0, BAR.z), radius: 2.2, label: 'Eastside Lounge', hint: 'cocktails, prosecco, sliders' });
  const colZ: number[] = [];
  for (let z = iz0 + 3; z < iz1 - 1; z += 4.5) colZ.push(z);
  for (const z of colZ) b.collider(ESP[0] - 0.3, ESP[0] + 0.3, z - 0.3, z + 0.3, 0, 5.6, true);
  const shopX = ix1 - 0.6;
  b.shopSpots.push({ kind: 'store', catalog: 'encore-boutique', position: new THREE.Vector3(shopX - 1.4, 0, -514.5), radius: 2.0, label: 'Encore Boutique', hint: 'aviators, glass butterflies, macarons' });
  b.pickup(ESPX, 0.45, -541, 2, 'Esplanade Bench Pack', true);

  // ---- outside: Strip face window band, the Encore signature, the Encore arch on the garden path ----
  // The Strip and plaza faces: arched windows with white lattice screens and red drapes (the real
  // Encore low-rise along the Strip), between the kit's pilasters
  const facade = b.nightGlow(new THREE.MeshStandardMaterial({ map: encoreWindowsTex(), roughness: 0.7, emissive: 0xffffff, emissiveMap: encoreWindowsGlow(), emissiveIntensity: 0 }), 0.05, 0.8);
  const face = (x: number, z: number, len: number, ry: number) => {
    const g = new THREE.PlaneGeometry(len, 5.4);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 4.5);
    const m = new THREE.Mesh(g, facade);
    m.position.set(x, 4.5, z);
    m.rotation.y = ry;
    b.add(m);
  };
  for (const [z0, z1] of [
    [CZ0 + 0.6, WEST_DOOR - 4.6],
    [WEST_DOOR + 4.6, CZ1 - 0.6],
  ]) face(CX0 - 0.62, (z0 + z1) / 2, z1 - z0, -Math.PI / 2);
  face((CX0 + 0.6 + ESPX - 4.6) / 2, CZ1 + 0.62, ESPX - 4.6 - CX0 - 0.6, 0);
  for (let z = CZ0 + 3; z < CZ1 - 2; z += 4.5) {
    if (Math.abs(z - WEST_DOOR) < 5.5) continue;
    b.add(mesh(new THREE.BoxGeometry(1.2, 0.12, 2.6), mat(0xb0101e, 0.8), CX0 - 1.2, 7.4, z));
  }
  for (const [x, z, ry, w] of [
    [CX0 - 1.1, -528, -Math.PI / 2, 6.4],
    [ESPX - 6, CZ1 + 1.1, 0, 4.8],
  ] as Array<[number, number, number, number]>) {
    const sg = wynnSignature(b, 'Encore', w, w * 0.34);
    sg.position.set(x, 7.1, z);
    sg.rotation.y = ry;
    b.add(sg);
  }
  {
    const iron = mat(0x1a1410, 0.45, 0.6);
    const ax = 21.6;
    for (const s of [-1, 1]) b.box(ax, 0, WEST_DOOR + s * 3.3, 0.5, 4.2, 0.5, iron, true);
    const arch = new THREE.TorusGeometry(3.3, 0.18, 6, 24, Math.PI);
    arch.rotateY(Math.PI / 2);
    b.add(mesh(arch, iron, ax, 4.2, WEST_DOOR));
    // filigree: a few curls inside the arch
    for (let i = 0; i < 5; i++) {
      const a = 0.35 + i * 0.6;
      const curl = new THREE.TorusGeometry(0.45, 0.05, 4, 12, Math.PI * 1.5);
      curl.rotateY(Math.PI / 2);
      b.add(mesh(curl, iron, ax, 4.2 + Math.sin(a) * 2.3, WEST_DOOR + Math.cos(a) * 2.3));
    }
    const oval = new THREE.CylinderGeometry(1.0, 1.0, 0.16, 24);
    oval.rotateZ(Math.PI / 2);
    oval.scale(1, 0.62, 1.55);
    b.add(mesh(oval, iron, ax, 7.3, WEST_DOOR));
    const sg = wynnSignature(b, 'Encore', 2.6, 0.9);
    sg.position.set(ax - 0.1, 7.3, WEST_DOOR);
    sg.rotation.y = -Math.PI / 2;
    b.add(sg);
    b.add(mesh(new THREE.BoxGeometry(CX0 - 19.6, 0.03, 4.4), mat(0xe8dcc4, 0.4), (19.6 + CX0) / 2, 0.03, WEST_DOOR));
    b.add(mesh(new THREE.BoxGeometry(0.08, 0.05, 4.6), basic(0xffd27a), 19.7, 0.04, WEST_DOOR));
  }

  // ---- dressing (lazy, door-gated) ----
  const sheet = new SignSheet([1024, 512]);
  const sBout = sheet.text(512, 96, 'Encore Boutique', '#6a0a12', '#f4e8d4', '"Brush Script MT", "Segoe Script", cursive', undefined, '#c8a050');
  const sHermes = sheet.text(512, 96, 'HERMÈS', '#f4e8d4', '#c8641e', 'Georgia, serif');
  const sCartier = sheet.text(512, 96, 'Cartier', '#f4e8d4', '#8a0a14', 'Georgia, serif', undefined, '#d8b060');
  const sRolex = sheet.text(512, 96, 'ROLEX', '#e8c870', '#0a4a2a', 'Georgia, serif', undefined, '#c8a050');
  const sDior = sheet.text(512, 96, 'DIOR', '#1a1a1a', '#ece6dc', 'Georgia, serif');
  const sLounge = sheet.text(512, 110, 'Eastside Lounge', '#ffe0c0', '#4a0610', '"Brush Script MT", "Segoe Script", cursive', undefined, '#d8a850');
  const sEsp = sheet.text(512, 96, 'ESPLANADE', '#f2dca8', '#2a1208', 'Georgia, serif', 'WYNN • ATRIUM • SHOPS', '#c8a050');
  const glassDay = new THREE.Color(0xe8eed0);
  const glassNight = new THREE.Color(0x182038);
  const winGlow = new THREE.MeshBasicMaterial({ vertexColors: true });
  b.every((_dt, _t, night) => {
    winGlow.color.lerpColors(glassDay, glassNight, night);
  });

  const gate = gateOf(CX0, CX1, CZ0, CZ1, CH, [
    { side: 'north', at: NORTH_DOOR, width: 6 },
    { side: 'west', at: WEST_DOOR, width: 6 },
    { side: 'south', at: ESPX, width: 4.6 },
  ]);
  lazyInterior(b, 'interior:encore-look', gate, (group) => {
    const k = new Kit();
    const ppl: PeopleLists = { seated: [], standing: [] };
    floorRect(k, mapLit(encoreCarpet(), 0.92), ix0, ESP[0], iz0, iz1, 0.036, 4);
    const walk = mapLit(encoreWalkway(), 0.22);
    const strip = (r: [number, number, number, number], alongZ: boolean, m: THREE.Material, y: number, tileAcross: number) => {
      const [a, c, d, e] = r;
      const across = alongZ ? c - a : e - d;
      const along = alongZ ? e - d : c - a;
      const g = new THREE.PlaneGeometry(across, along);
      g.rotateX(-Math.PI / 2);
      if (!alongZ) g.rotateY(Math.PI / 2);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * across) / tileAcross, (uv.getY(i) * along) / tileAcross / (m === walk ? 2 : 1));
      k.add(g, m, 0xffffff, (a + c) / 2, y, (d + e) / 2);
    };
    strip(AISLE, true, walk, 0.042, AISLE[1] - AISLE[0]);
    strip(WEST_PATH, false, walk, 0.041, WEST_PATH[3] - WEST_PATH[2]);
    strip(ESP, true, mapLit(runnerTex(), 0.6), 0.04, ESP[1] - ESP[0]);

    // tall garden windows on the Strip wall between the kit's pilasters
    for (let z = iz0 + 5; z < iz1 - 2; z += 5) {
      if (Math.abs(z - WEST_DOOR) < 4.5) continue;
      k.at(ix0 + 0.01, 0, z, Math.PI / 2, () => {
        k.quad(winGlow, 0xffffff, 0, 4.4, 0.03, 3.2, 4.6);
        const arch = new THREE.CircleGeometry(1.6, 16, 0, Math.PI);
        k.add(arch, winGlow, 0xffffff, 0, 6.7, 0.03);
        for (const s of [-1, 1]) k.box(vcMat(0.3, 0.85), 0xd8b060, s * 1.65, 4.4, 0.06, 0.1, 4.7, 0.06);
        k.box(vcMat(0.3, 0.85), 0xd8b060, 0, 2.08, 0.06, 3.4, 0.1, 0.08);
        for (let i = 1; i < 4; i++) k.box(vcMat(0.4, 0.6), 0xe8dcc4, -1.6 + i * 0.8, 4.4, 0.05, 0.05, 4.6, 0.04);
        // red silk drapes either side
        for (const s of [-1, 1]) k.box(vcMat(0.9), 0xb0101e, s * 2.0, 4.2, 0.12, 0.5, 6.4, 0.12);
      });
    }
    // red shade chandeliers over the tables and the lounge
    for (const t of TABLES) {
      redShadeChandelier(k, t.x, t.z, CY, 1.25);
      lightPool(k, t.x, t.z, 2.6, 0x34080c);
    }
    // gold drum lanterns down the aisle
    for (let z = iz0 + 4; z < iz1 - 2; z += 7) {
      for (const x of [AISLE[0] - 0.7, AISLE[1] + 0.7]) {
        k.cyl(glowDouble(), 0xffb27a, x, CY - 2.0, z, 0.42, 0.42, 0.8, 16);
        k.cyl(vcMat(0.3, 0.85), 0xd8b060, x, CY - 1.58, z, 0.46, 0.46, 0.05, 16);
        k.cyl(vcMat(0.3, 0.85), 0xd8b060, x, CY - 2.42, z, 0.46, 0.46, 0.05, 16);
        cable(k, x, CY - 1.6, z, CY, 0xd8b060);
        lightPool(k, x, z, 1.6, 0x2a100a);
      }
    }
    // Eastside Lounge: a red island bar under a big red-shade cluster, low velvet chairs
    islandBar(k, BAR.x, BAR.z, BAR.w, BAR.d, { top: 0x1a0a08, front: 0x8a0e18, trim: 0x3a1410, stool: 0xd8b060, glow: 0xff8a6a, bartender: [0x1a1a1a, 0xb0101e] }, ppl, 71);
    redShadeChandelier(k, BAR.x, BAR.z, CY, 2.0);
    lightPool(k, BAR.x, BAR.z, 4, 0x3a0a10);
    sheet.quad(k, sLounge, BAR.x, 3.5, BAR.z - BAR.d / 2 - 0.02, 3.0, 0.65, Math.PI);
    sheet.quad(k, sLounge, BAR.x, 3.5, BAR.z + BAR.d / 2 + 0.02, 3.0, 0.65, 0);
    for (const s of [-1, 1]) k.box(vcMat(0.4, 0.5), 0x4a0610, BAR.x, 3.5, BAR.z + s * (BAR.d / 2), 3.2, 0.75, 0.02);
    for (const s of [-1, 1]) for (const t of [-1, 1]) cable(k, BAR.x + t * 1.3, 3.9, BAR.z + s * (BAR.d / 2), CY, 0xd8b060);

    // ---- the Esplanade: partition columns, the lattice vault, jewelled chandeliers, boutiques ----
    const springY = 5.6;
    for (const z of colZ) {
      k.cyl(vcMat(0.5), 0xf0e4cc, ESP[0], springY / 2, z, 0.26, 0.3, springY, 14);
      k.box(vcMat(0.3, 0.85), 0xd8b060, ESP[0], springY - 0.15, z, 0.7, 0.3, 0.7);
      k.box(vcMat(0.3, 0.85), 0xd8b060, ESP[0], 0.1, z, 0.7, 0.2, 0.7);
    }
    k.box(vcMat(0.6), 0xf0e4cc, ESP[0], (springY + CY) / 2, (iz0 + iz1) / 2, 0.4, CY - springY, iz1 - iz0);
    k.box(vcMat(0.3, 0.85), 0xd8b060, ESP[0], springY, (iz0 + iz1) / 2, 0.6, 0.18, iz1 - iz0);
    k.box(vcMat(0.6), 0xf0e4cc, ix1 - 0.1, (springY + CY) / 2, (iz0 + iz1) / 2, 0.2, CY - springY, iz1 - iz0);
    latticeVault(k, ESPX, iz0, iz1, springY, (ESP[1] - ESP[0]) / 2 - 0.05, 0xf4f0e0, 0xe8dcc0, 0.85);
    for (let z = iz0 + 4.5; z < iz1 - 2; z += 9) {
      jewelChandelier(k, ESPX, 6.3, z, springY + (ESP[1] - ESP[0]) / 2 - 0.1);
      lightPool(k, ESPX, z, 2.2, 0x2a1a20);
    }
    // boutiques along the tower wall
    const fronts: Array<[typeof sBout, number, number, number]> = [
      [sHermes, -540.5, 0xc8641e, 0xfff0d8],
      [sCartier, -531.2, 0x8a0a14, 0xfff0e0],
      [sBout, -514.5, 0xd8c09a, 0xfff4e0],
      [sRolex, -523.4, 0x0a4a2a, 0xfff4d8],
      [sDior, -505.6, 0xece6dc, 0xfff8f0],
    ];
    for (const [r, z, frame, glow] of fronts) storefront(k, sheet, r, ix1 - 0.2, z, -Math.PI / 2, 6.6, 5.2, frame, glow);
    // benches + palms down the middle of the Esplanade
    for (let z = iz0 + 9; z < iz1 - 4; z += 9) {
      pottedPalm(k, ESPX - 1.2, z, 2.4, 0xe8dcc4);
      k.box(vcMat(0.6), 0x3a2414, ESPX + 1.1, 0.42, z, 0.5, 0.08, 1.6);
      k.box(vcMat(0.6), 0xb0101e, ESPX + 1.1, 0.48, z, 0.46, 0.06, 1.5);
      for (const s of [-1, 1]) k.box(vcMat(0.3, 0.85), 0xd8b060, ESPX + 1.1, 0.2, z + s * 0.7, 0.5, 0.4, 0.06);
    }
    // wayfinding at the south door
    k.box(vcMat(0.4, 0.5), 0x2a1208, ESPX, 4.6, iz1 - 4, 4.2, 0.9, 0.1);
    sheet.quad(k, sEsp, ESPX, 4.6, iz1 - 4.06, 4, 0.75, Math.PI);
    sheet.quad(k, sEsp, ESPX, 4.6, iz1 - 3.94, 4, 0.75, 0);
    for (const s of [-1, 1]) cable(k, ESPX + s * 1.6, 5.05, iz1 - 4, springY + 2.3, 0xd8b060);

    // shoppers
    const rnd = prng(72);
    for (let i = 0; i < 7; i++) ppl.standing.push({ x: ESPX + (rnd() - 0.5) * 3, z: iz0 + 3 + rnd() * (iz1 - iz0 - 6), rot: rnd() < 0.5 ? 0 : Math.PI, shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
    k.flush(group);
    buildPeople(group, 'sit', ppl.seated);
    buildPeople(group, 'stand', ppl.standing);
    return [];
  });
}
