import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { buildCasinoFloor } from './casinos';
import { GUEST_SHIRTS, Kit, buildPeople, chandelier, glowMat, vcMat, type DressLook, type PeopleLists } from './interiorKit';
import { mat, mesh } from './props';
import { canvasTex, lazyInterior, mapLit, prng } from './themedKit';
import { SignSheet, archFacade, cable, ceilRect, facadePlane, flowerBed, flowerTex, floorRect, gateOf, glowDouble, hallShell, islandBar, lightPool, paintMarble, pile, pottedTree, storefront, wrapDraw } from './walkinKit';
import './walkinCatalogs';

/*
 * The Palazzo, walk-in (build 5). Reference: Wikimedia Commons photos of the Palazzo casino (a gold
 * crystal chandelier in a domed coffer), the Waterfall Atrium (a tall cascade between escalators, an
 * octagonal glass dome, cream-and-gold balconies, seasonal flower displays and hanging lanterns), the
 * marble entry halls and the Shoppes at the Palazzo.
 * - The podium on the Strip (formerly solid) holds the casino and, at its north end, the Waterfall
 *   Atrium with the Shoppes. Doors: the Strip arch (now open), the porte-cochère side facing the tower,
 *   and the atrium's north door toward Sands Ave.
 * - Casino: warm gold-and-brown scroll carpet, cream marble walkways, cream columns, a gold coffered
 *   ceiling with three domed recesses and big crystal chandeliers, LAVO Lounge (a working bar).
 */

const CX0 = 21.6;
const CX1 = 47;
const CZ0 = -366;
const CZ1 = -318;
const CH = 9;
const CY = CH - 1.6;
const AX0 = 21.6;
const AX1 = 47;
const AZ0 = -390;
const AZ1 = -366;
const AH = 9;
const STRIP_Z = -337.7; // palazzoFront's door bay
const EW: [number, number, number, number] = [CX0 + 0.6, CX1 - 0.6, STRIP_Z - 2.5, STRIP_Z + 2.5];
const NS: [number, number, number, number] = [32.3, 36.3, CZ0 + 0.6, STRIP_Z - 2.5];
const LAVO: [number, number, number, number] = [37.6, CX1 - 0.6, -333.4, CZ1 - 0.6];
const BAR = { x: 42.4, z: -326.6, w: 6.4, d: 4.0 };
const DOME = { x: 34.3, z: -378, r: 6.2 };

type Row = { x: number; z: number; count: number; along: 'x' | 'z'; facing: number };
type Table = { game: 'blackjack' | 'roulette' | 'craps'; x: number; z: number; rot?: number; label: string; vipOnly?: boolean };
const TABLES: Table[] = [
  { game: 'blackjack', x: 27.2, z: -359.5, label: 'Palazzo Blackjack' },
  { game: 'roulette', x: 27.2, z: -349.5, label: 'Palazzo Roulette' },
  { game: 'craps', x: 41.4, z: -359.5, rot: Math.PI / 2, label: 'Palazzo Craps' },
  { game: 'blackjack', x: 41.4, z: -349.5, label: 'Palazzo Blackjack ($50)' },
  { game: 'blackjack', x: 33.6, z: -325.6, label: 'Palazzo Salon Blackjack', vipOnly: true },
];
const SLOT_ROWS: Row[] = [
  { x: 26.0, z: -331.4, count: 6, along: 'x', facing: Math.PI },
  { x: 26.0, z: -330.3, count: 6, along: 'x', facing: 0 },
  { x: 26.0, z: -323.9, count: 6, along: 'x', facing: Math.PI },
  { x: 26.0, z: -322.8, count: 6, along: 'x', facing: 0 },
];

// ---------------------------------------------------------------- textures
let _carpet: THREE.CanvasTexture | null = null;
/** Palazzo carpet: warm brown with gold acanthus scrolls, cream rosettes and red accents (tile = 4 m). */
function palazzoCarpet(): THREE.CanvasTexture {
  return (_carpet ??= canvasTex(
    512,
    512,
    (ctx, w, h) => {
      const rnd = prng(91);
      ctx.fillStyle = '#5a3218';
      ctx.fillRect(0, 0, w, h);
      // a large medallion lattice
      for (const [cx, cy] of [
        [0, 0],
        [w / 2, h / 2],
      ]) {
        wrapDraw(w, h, cx, cy, 140, (px, py) => {
          ctx.strokeStyle = '#c89a48';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(px, py, 120, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 3;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(px + Math.cos(a) * 70, py + Math.sin(a) * 70, 34, 14, a, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.fillStyle = '#8a1a1a';
          ctx.beginPath();
          ctx.arc(px, py, 26, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#f0dcb0';
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + 0.2;
            ctx.beginPath();
            ctx.ellipse(px + Math.cos(a) * 14, py + Math.sin(a) * 14, 9, 5, a, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }
      // acanthus scrolls between the medallions
      ctx.strokeStyle = '#b08038';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 16 + rnd() * 20;
        const a0 = rnd() * 6;
        wrapDraw(w, h, x, y, r + 4, (px, py) => {
          ctx.beginPath();
          ctx.arc(px, py, r, a0, a0 + 4.2);
          ctx.stroke();
        });
      }
      pile(ctx, w, h, 92);
    },
    true
  ));
}

let _marble: THREE.CanvasTexture | null = null;
/** Cream marble in big squares with a gold-brown border and a star inlay (tile = 3 m). */
function palazzoMarble(): THREE.CanvasTexture {
  return (_marble ??= canvasTex(
    512,
    512,
    (ctx, w, h) => {
      paintMarble(ctx, w, h, '#efe4cc', '#cbb48e', 93, 14);
      ctx.strokeStyle = '#a07a48';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = '#b8945a';
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const r = i % 2 ? 34 : 90;
        const a = (i / 16) * Math.PI * 2;
        ctx.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#7a2a1a';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 18, 0, Math.PI * 2);
      ctx.fill();
    },
    true
  ));
}

let _falls: THREE.CanvasTexture | null = null;
/** Falling water over dark stone: streaks that scroll down. */
function fallsTex(): THREE.CanvasTexture {
  return (_falls ??= canvasTex(
    128,
    256,
    (ctx, w, h) => {
      const rnd = prng(94);
      ctx.fillStyle = '#3a4a52';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 220; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const l = 20 + rnd() * 60;
        ctx.strokeStyle = `rgba(${200 + rnd() * 55},${230 + rnd() * 25},255,${0.25 + rnd() * 0.5})`;
        ctx.lineWidth = 1 + rnd() * 2.5;
        for (const oy of [-h, 0, h]) {
          ctx.beginPath();
          ctx.moveTo(x, y + oy);
          ctx.lineTo(x + (rnd() - 0.5) * 2, y + l + oy);
          ctx.stroke();
        }
      }
    },
    true
  ));
}

// ---------------------------------------------------------------- pieces
/** A paper lantern (Palazzo's hanging lanterns): a glowing squashed sphere with gold caps and a tassel. */
function lantern(k: Kit, x: number, y: number, z: number, r: number, color: number, cy: number): void {
  cable(k, x, y + r * 0.8, z, cy, 0x2a1a10);
  const g = new THREE.SphereGeometry(r, 12, 8);
  g.scale(1, 0.85, 1);
  k.add(g, glowMat(), color, x, y, z);
  for (const s of [-1, 1]) k.cyl(vcMat(0.3, 0.85), 0xd8a83a, x, y + s * r * 0.8, z, r * 0.45, r * 0.45, 0.08, 10);
  k.cyl(glowMat(), color, x, y - r - 0.25, z, 0.02, 0.05, 0.4, 5);
}

// ---------------------------------------------------------------- build
export function buildPalazzoWalkIn(b: WorldBuilder): void {
  // ======== the Waterfall Atrium (north end of the podium) ========
  const stone = mat(0xd9c39a, 0.7);
  const atriumGate = hallShell(b, {
    x0: AX0,
    x1: AX1,
    z0: AZ0,
    z1: AZ1,
    h: AH,
    wall: stone,
    doors: [{ side: 'north', at: DOME.x, width: 6, h: 5 }],
    open: ['south'],
    noRoof: true,
  });
  // roof round the octagonal skylight, then the drum and the glass dome on top
  const hole = DOME.r + 0.2;
  const roofM = mat(0xc9b08e, 0.85);
  b.box((AX0 + DOME.x - hole) / 2, AH, (AZ0 + AZ1) / 2, DOME.x - hole - AX0 + 1.2, 0.6, AZ1 - AZ0 + 1.2, roofM, false, true);
  b.box((DOME.x + hole + AX1) / 2, AH, (AZ0 + AZ1) / 2, AX1 - DOME.x - hole + 1.2, 0.6, AZ1 - AZ0 + 1.2, roofM, false, true);
  b.box(DOME.x, AH, (AZ0 + DOME.z - hole) / 2, hole * 2, 0.6, DOME.z - hole - AZ0 + 0.6, roofM, false, true);
  b.box(DOME.x, AH, (DOME.z + hole + AZ1) / 2, hole * 2, 0.6, AZ1 - DOME.z - hole + 0.6, roofM, false, true);
  {
    const drumM = new THREE.MeshStandardMaterial({ color: 0xefe2c4, roughness: 0.7, side: THREE.DoubleSide });
    const drum = new THREE.CylinderGeometry(DOME.r, DOME.r, 2.4, 8, 1, true);
    b.add(mesh(drum, drumM, DOME.x, AH + 0.3 + 1.2, DOME.z, true));
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfe0ea, roughness: 0.1, metalness: 0.3, emissive: 0xb8d0e0, emissiveIntensity: 0.25, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    b.nightGlow(glass, 0.25, 0.6);
    const dome = new THREE.SphereGeometry(DOME.r, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.45, 1);
    b.add(mesh(dome, glass, DOME.x, AH + 2.7, DOME.z));
    const ribM = mat(0xb08a4a, 0.4, 0.6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const rib = new THREE.TorusGeometry(DOME.r, 0.08, 4, 12, Math.PI / 2);
      rib.scale(1, 0.45, 1);
      rib.rotateY(-a);
      b.add(mesh(rib, ribM, DOME.x, AH + 2.7, DOME.z));
    }
    const cap = mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.6, 8), ribM, DOME.x, AH + 2.7 + DOME.r * 0.45, DOME.z);
    b.add(cap);
  }
  b.zone('Palazzo Waterfall Atrium', AX0, AX1, AZ0, AZ1);
  b.light(0xfff0d8, 16, 30, DOME.x, 7, DOME.z, 0.8);
  // bronze canopy over the north door
  const bronze = mat(0x4a3420, 0.45, 0.75);
  b.add(mesh(new THREE.BoxGeometry(8, 0.3, 2.6), bronze, DOME.x, 5.3, AZ0 - 1.9, true));
  b.add(mesh(new THREE.BoxGeometry(7.6, 0.05, 2.3), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }), DOME.x, 5.13, AZ0 - 1.9));
  // waterfall pool + escalator colliders + flower bed ring (dressing is lazy)
  const pool: [number, number, number, number] = [DOME.x - 3, DOME.x + 3, AZ0 + 0.6, AZ0 + 3.2];
  b.collider(pool[0] - 0.3, pool[1] + 0.3, pool[3] - 0.15, pool[3] + 0.15, 0, 0.55, true);
  b.collider(pool[0] - 0.3, pool[0], pool[2], pool[3], 0, 0.55, true);
  b.collider(pool[1], pool[1] + 0.3, pool[2], pool[3], 0, 0.55, true);
  b.waterZones.push({ name: 'Palazzo Waterfall Pool', minX: pool[0], maxX: pool[1], minZ: pool[2], maxZ: pool[3] - 0.15, y: 0.4 });
  const escX = [DOME.x - 5.0, DOME.x + 5.0];
  for (const ex of escX) b.collider(ex - 0.75, ex + 0.75, AZ0 + 2.6, AZ0 + 10.4, 0, 1.2, true);
  const bed = { x: DOME.x, z: DOME.z + 2.5, r: 3.2 };
  b.collider(bed.x - bed.r, bed.x + bed.r, bed.z - bed.r, bed.z + bed.r, 0, 0.7, true);
  b.shopSpots.push({ kind: 'store', catalog: 'palazzo-shop', position: new THREE.Vector3(AX0 + 2.6, 0, -372.4), radius: 2.0, label: 'The Palazzo Shop', hint: 'Venetian glass, perfume, gelato' });
  b.pickup(bed.x + bed.r - 0.4, 1.05, bed.z, 2, 'Atrium Flower Bed Pack', true);

  // ======== the casino ========
  buildCasinoFloor(b, {
    id: 'palazzo',
    casinoName: 'The Palazzo',
    minX: CX0,
    maxX: CX1,
    minZ: CZ0,
    maxZ: CZ1,
    height: CH,
    entrance: { side: 'east', at: STRIP_Z, width: 6 },
    bare: ['west'],
    extraEntrances: [
      { side: 'west', at: STRIP_Z, width: 4, inner: true },
      { side: 'north', at: DOME.x, width: 14, inner: true },
    ],
    interior: {
      chandeliers: false,
      bar: false,
      sportsbook: true,
      highLimit: false,
      fill: 0.5,
      trim: 0xd8b060,
      cove: 0xffd8a0,
      wainscot: 0x5a3a20,
      upperWall: 0xefe2c4,
      columnWrap: 0xefe2c4,
      seat: 0x7a2a1a,
      slotThemes: [1, 4, 0, 6, 2, 7],
      paths: [EW, NS],
      keepOut: [LAVO],
    },
    carpet: ['#5a3218', '#c89a48', '#8a1a1a'],
    wall: 0xd9c39a,
    ceiling: 0xf2dcae,
    ceilingGlow: 0x5a3a10,
    light: 0xffdcaa,
    slots: { accent: '#ffd27a', topper: 0xffc34d, rows: SLOT_ROWS },
    slotLabel: 'Palazzo Slots',
    tables: TABLES,
    felt: 0x1d4a3a,
    guard: { kick: [52, STRIP_Z] },
    pickups: [
      { x: 27.2, z: -349.5, y: 1.35, amount: 3, label: 'Palazzo Roulette Rail Pack' },
      { x: BAR.x, y: 1.25, z: BAR.z - BAR.d / 2 + 0.3, amount: 4, label: 'LAVO Lounge Bar-Top Pack!' },
    ],
    tourists: [
      { pts: [[16, STRIP_Z], [52, STRIP_Z]], prop: 'camera' },
      { pts: [[DOME.x, -340], [DOME.x, -372], [26, -380]], prop: 'bag' },
    ],
  });
  // ---- the podium's other faces: arched shop windows between pilasters, a cornice (the Strip face is palazzoFront) ----
  {
    const fm = archFacade(b, '#e6d3ab', '#f0e3c6', '#ffe2a8', '#ffc880');
    const corn = mat(0xf0e3c6, 0.65);
    const out = 0.62;
    facadePlane(b, fm, (AX0 - 0.6 + DOME.x - 4.2) / 2, AZ0 - out, DOME.x - 4.2 - AX0 + 0.6, Math.PI);
    facadePlane(b, fm, (DOME.x + 4.2 + AX1 + 0.6) / 2, AZ0 - out, AX1 + 0.6 - DOME.x - 4.2, Math.PI);
    facadePlane(b, fm, AX1 + out, (AZ0 + AZ1) / 2, AZ1 - AZ0, Math.PI / 2);
    facadePlane(b, fm, CX1 + out, (CZ0 + STRIP_Z - 5.2) / 2, STRIP_Z - 5.2 - CZ0, Math.PI / 2);
    facadePlane(b, fm, CX1 + out, (STRIP_Z + 5.2 + CZ1) / 2, CZ1 - STRIP_Z - 5.2, Math.PI / 2);
    b.add(mesh(new THREE.BoxGeometry(AX1 - AX0 + 2, 0.5, 1.2), corn, (AX0 + AX1) / 2, AH - 0.5, AZ0 - 0.3));
    b.add(mesh(new THREE.BoxGeometry(1.2, 0.5, CZ1 - AZ0 + 1), corn, AX1 + 0.3, AH - 0.5, (AZ0 + CZ1) / 2));
  }
  b.zone('LAVO Lounge (Palazzo Casino)', LAVO[0], LAVO[1], LAVO[2], LAVO[3]);
  b.collider(BAR.x - BAR.w / 2, BAR.x + BAR.w / 2, BAR.z - BAR.d / 2, BAR.z + BAR.d / 2, 0, 1.15, true);
  b.shopSpots.push({ kind: 'store', catalog: 'palazzo-lavo', position: new THREE.Vector3(BAR.x - BAR.w / 2 - 1.1, 0, BAR.z), radius: 2.2, label: 'LAVO Lounge', hint: 'Italian cocktails, meatball sliders' });

  // ======== dressing (lazy, door-gated) ========
  const sheet = new SignSheet([1024, 512]);
  const sShoppes = sheet.text(640, 110, 'THE SHOPPES AT THE PALAZZO', '#f4e8d0', '#8a1a1a', 'Georgia, serif', 'GRAND CANAL SHOPPES', '#d8b060');
  const sShop = sheet.text(512, 96, 'The Palazzo Shop', '#3a2410', '#f2e6cc', 'Georgia, serif', undefined, '#b08a4a');
  const sKors = sheet.text(512, 96, 'MICHAEL KORS', '#f4f0e8', '#1a1a1a', '"Futura", "Century Gothic", sans-serif');
  const sTory = sheet.text(512, 96, 'TORY BURCH', '#f2a24a', '#14284a', 'Georgia, serif');
  const sKate = sheet.text(512, 96, 'kate spade', '#1a1a1a', '#f6f2ec', 'Georgia, serif');
  const sLavo = sheet.text(512, 110, 'LAVO', '#f2e6cc', '#1a1410', 'Georgia, serif', 'ITALIAN RESTAURANT • LOUNGE', '#c8a050');
  const dress: DressLook = { trim: 0xd8b060, wood: 0x5a3a20, dark: 0x1a1008, accent: 0x8a1a1a, seat: 0x7a2a1a, cove: 0xffd8a0 };
  const flowersRed = flowerTex(['#c8182e', '#f04050', '#ffd23a', '#ff8a3a'], '#2a5a2a', 9);

  // ---------------- the atrium ----------------
  lazyInterior(b, 'interior:palazzo-atrium', atriumGate, (group) => {
    const k = new Kit();
    const ppl: PeopleLists = { seated: [], standing: [] };
    const anim: Array<(t: number, dt: number) => void> = [];
    const ix0 = AX0 + 0.6;
    const ix1 = AX1 - 0.6;
    const iz0 = AZ0 + 0.6;
    const iz1 = AZ1;
    floorRect(k, mapLit(palazzoMarble(), 0.2), ix0, ix1, iz0, iz1, 0.04, 3);
    // cream walls with gold-trimmed arches on two storeys and a coffered sky ceiling
    const wallRun = (x: number, z: number, ry: number, len: number) =>
      k.at(x, 0, z, ry, () => {
        k.quad(vcMat(0.8), 0xf0e4c8, 0, (AH - 0.6) / 2, 0, len, AH - 0.6);
        k.box(vcMat(0.6), 0x8a6a40, 0, 0.3, 0.03, len, 0.6, 0.06);
        k.box(vcMat(0.3, 0.85), 0xd8b060, 0, 4.4, 0.08, len, 0.16, 0.16);
        for (let u = -len / 2 + 2; u < len / 2 - 1; u += 4) {
          // upper-storey arches (the balconies of the real atrium)
          const arch = new THREE.CircleGeometry(1.2, 14, 0, Math.PI);
          k.add(arch, glowMat(), 0x6a5a48, u, 6.6, 0.04);
          k.box(glowMat(), 0x6a5a48, u, 5.6, 0.04, 2.4, 2.0, 0.01);
          k.box(vcMat(0.6), 0xf4ead4, u, 5.0, 0.2, 2.6, 0.12, 0.35);
          for (let i = -4; i <= 4; i++) k.cyl(vcMat(0.6), 0xf4ead4, u + i * 0.28, 5.3, 0.3, 0.04, 0.05, 0.5, 5);
          k.box(vcMat(0.6), 0xf4ead4, u, 5.58, 0.3, 2.6, 0.06, 0.12);
          const ring = new THREE.TorusGeometry(1.25, 0.07, 4, 14, Math.PI);
          k.add(ring, vcMat(0.3, 0.85), 0xd8b060, u, 6.6, 0.06);
        }
      });
    wallRun((ix0 + ix1) / 2, iz0 + 0.01, 0, ix1 - ix0);
    wallRun(ix0 + 0.01, (iz0 + iz1) / 2, Math.PI / 2, iz1 - iz0);
    wallRun(ix1 - 0.01, (iz0 + iz1) / 2, -Math.PI / 2, iz1 - iz0);
    // ceiling: coffered cream with a painted-sky field, the octagonal opening into the dome
    const top = AH - 0.05;
    for (const [a, c, d, e] of [
      [ix0, DOME.x - hole, iz0, iz1],
      [DOME.x + hole, ix1, iz0, iz1],
      [DOME.x - hole, DOME.x + hole, iz0, DOME.z - hole],
      [DOME.x - hole, DOME.x + hole, DOME.z + hole, iz1],
    ] as Array<[number, number, number, number]>) {
      if (c - a < 0.1 || e - d < 0.1) continue;
      ceilRect(k, vcMat(0.7), a, c, d, e, top, 1, 0xf2e6cc);
      for (let x = a + 1.5; x < c - 0.3; x += 3) for (let z = d + 1.5; z < e - 0.3; z += 3) {
        const g = new THREE.PlaneGeometry(2.2, 2.2);
        g.rotateX(Math.PI / 2);
        k.add(g, glowMat(), 0xb8d0e0, x, top - 0.02, z);
        k.box(vcMat(0.3, 0.85), 0xd8b060, x, top - 0.08, z, 2.4, 0.1, 0.08);
        k.box(vcMat(0.3, 0.85), 0xd8b060, x, top - 0.08, z, 0.08, 0.1, 2.4);
      }
    }
    // the dome opening: gilded octagon ring and the drum's inner glow band
    const oct = new THREE.TorusGeometry(DOME.r, 0.18, 4, 8);
    oct.rotateX(Math.PI / 2);
    oct.rotateY(Math.PI / 8);
    k.add(oct, vcMat(0.3, 0.85), 0xd8b060, DOME.x, top - 0.1, DOME.z);
    k.cyl(glowDouble(), 0xfff0d0, DOME.x, AH + 1.0, DOME.z, DOME.r - 0.1, DOME.r - 0.1, 0.12, 8);

    // ---- the waterfall wall between the escalators ----
    {
      const falls = fallsTex();
      const fm = new THREE.MeshBasicMaterial({ map: falls, color: 0xd8e8f0 });
      const g = new THREE.PlaneGeometry(5.6, 7.8);
      k.add(g, fm, 0xffffff, DOME.x, 4.45, iz0 + 0.12);
      anim.push((_t, dt) => {
        falls.offset.y = (falls.offset.y + dt * 0.6) % 1;
      });
      for (const s of [-1, 1]) k.box(vcMat(0.7), 0x6a5a48, DOME.x + s * 2.95, 4.45, iz0 + 0.3, 0.3, 7.9, 0.5);
      k.box(vcMat(0.7), 0x6a5a48, DOME.x, 8.45, iz0 + 0.3, 6.2, 0.3, 0.6);
      // the pool: rim, water, foam where the fall lands
      const [p0, p1, p2, p3] = pool;
      k.box(vcMat(0.6), 0xe8dcc4, (p0 + p1) / 2, 0.27, p3, p1 - p0 + 0.6, 0.55, 0.3);
      for (const x of [p0 - 0.15, p1 + 0.15]) k.box(vcMat(0.6), 0xe8dcc4, x, 0.27, (p2 + p3) / 2, 0.3, 0.55, p3 - p2);
      const water = new THREE.PlaneGeometry(p1 - p0, p3 - p2);
      water.rotateX(-Math.PI / 2);
      k.add(water, glowMat(), 0x2a6a7a, (p0 + p1) / 2, 0.42, (p2 + p3) / 2);
      k.box(glowMat(), 0xe8f4f8, DOME.x, 0.45, iz0 + 0.5, 5.4, 0.08, 0.5);
    }
    // escalators up to the mezzanine on both sides of the falls, and the mezzanine balconies
    for (const ex of escX) {
      k.at(ex, 0, AZ0 + 6.5, 0, () => {
        const len = 8.6;
        const rise = 4.4;
        const ang = Math.atan2(rise, len);
        k.box(vcMat(0.4, 0.6), 0x8a8e96, 0, rise / 2, 0, 1.3, 0.5, Math.hypot(len, rise), 0, ang);
        for (const s of [-1, 1]) {
          k.box(glassMat2(), 0xffffff, s * 0.65, rise / 2 + 0.6, 0, 0.04, 0.9, Math.hypot(len, rise), 0, ang);
          k.box(vcMat(0.3), 0x1a1a1a, s * 0.65, rise / 2 + 1.05, 0, 0.08, 0.08, Math.hypot(len, rise), 0, ang);
        }
      });
    }
    for (const [a, c] of [
      [ix0, escX[0] - 0.8],
      [escX[1] + 0.8, ix1],
    ]) {
      k.box(vcMat(0.6), 0xf0e4c8, (a + c) / 2, 4.35, iz0 + 1.3, c - a, 0.3, 2.6);
      k.box(vcMat(0.6), 0xf4ead4, (a + c) / 2, 5.2, iz0 + 2.55, c - a, 0.08, 0.14);
      for (let x = a + 0.2; x < c; x += 0.3) k.cyl(vcMat(0.6), 0xf4ead4, x, 4.85, iz0 + 2.55, 0.04, 0.05, 0.7, 5);
    }
    // the central flower display: a round bed with a blossoming tree, hanging lanterns overhead
    {
      const g = new THREE.CylinderGeometry(bed.r, bed.r + 0.1, 0.6, 24);
      k.add(g, vcMat(0.6), 0xe8dcc4, bed.x, 0.3, bed.z);
      const top2 = new THREE.CylinderGeometry(bed.r - 0.15, bed.r - 0.15, 0.4, 24);
      k.add(top2, mapLit(flowersRed, 0.85), 0xffffff, bed.x, 0.65, bed.z);
      pottedTree(k, bed.x, bed.z, 4.2, 0xd8a83a, 0x3a7a3a);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        k.add(new THREE.SphereGeometry(0.32, 8, 6), mapLit(flowersRed, 0.85), 0xffffff, bed.x + Math.cos(a) * (bed.r - 0.5), 0.9, bed.z + Math.sin(a) * (bed.r - 0.5));
      }
      for (const [x, z] of [
        [ix0 + 3, iz1 - 3],
        [ix1 - 3, iz1 - 3],
      ]) flowerBed(k, x, z, 3, 1.6, flowersRed, 0xe8dcc4, 0.55);
      const rnd = prng(95);
      const cols = [0xd8182e, 0xffc23a, 0xd8182e, 0xff8a2a];
      for (let i = 0; i < 26; i++) {
        const x = ix0 + 2 + rnd() * (ix1 - ix0 - 4);
        const z = iz0 + 4 + rnd() * (iz1 - iz0 - 6);
        lantern(k, x, 5.6 + rnd() * 2.2, z, 0.35 + rnd() * 0.25, cols[i % cols.length], top - 0.1);
      }
    }
    // the Shoppes: storefronts on the east and west walls
    sheet.quad(k, sShoppes, DOME.x, 7.6, iz1 - 0.3, 6.4, 1.1, Math.PI);
    k.box(vcMat(0.4, 0.5), 0x8a1a1a, DOME.x, 7.6, iz1 - 0.24, 6.6, 1.2, 0.06);
    for (const s of [-1, 1]) cable(k, DOME.x + s * 3, 8.2, iz1 - 0.27, top, 0xd8b060);
    const fronts: Array<[typeof sShop, number, number, number, number]> = [
      [sShop, ix0, -372.4, Math.PI / 2, 0xc8a878],
      [sKors, ix0, -383.2, Math.PI / 2, 0x1a1a1a],
      [sTory, ix1, -383.2, -Math.PI / 2, 0x14284a],
      [sKate, ix1, -372.4, -Math.PI / 2, 0xf2eee8],
    ];
    for (const [r, x, z, ry, frame] of fronts) storefront(k, sheet, r, x, z, ry, 6.6, 4.2, frame, 0xfff2dc);
    // shoppers
    const rnd = prng(96);
    for (let i = 0; i < 8; i++) ppl.standing.push({ x: ix0 + 3 + rnd() * (ix1 - ix0 - 6), z: iz0 + 9 + rnd() * (iz1 - iz0 - 10), rot: rnd() * 6.28, shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
    k.flush(group);
    buildPeople(group, 'sit', ppl.seated);
    buildPeople(group, 'stand', ppl.standing);
    return anim;
  });

  // ---------------- the casino's own look ----------------
  const casinoGate = gateOf(CX0, CX1, CZ0, CZ1, CH, [
    { side: 'east', at: STRIP_Z, width: 6 },
    { side: 'west', at: STRIP_Z, width: 4 },
    { side: 'north', at: DOME.x, width: 14 },
  ]);
  lazyInterior(b, 'interior:palazzo-look', casinoGate, (group) => {
    const k = new Kit();
    const ppl: PeopleLists = { seated: [], standing: [] };
    const ix0 = CX0 + 0.6;
    const ix1 = CX1 - 0.6;
    const iz0 = CZ0 + 0.6;
    const iz1 = CZ1 - 0.6;
    floorRect(k, mapLit(palazzoCarpet(), 0.92), ix0, ix1, iz0, iz1, 0.036, 4);
    const marble = mapLit(palazzoMarble(), 0.2);
    for (const r of [EW, NS]) floorRect(k, marble, r[0], r[1], r[2], r[3], 0.042, 3);
    // three domed coffers down the N-S walk, each with a big gold crystal chandelier
    for (const z of [-359, -348]) {
      const x = DOME.x;
      const ring = new THREE.TorusGeometry(3.2, 0.16, 6, 36);
      ring.rotateX(Math.PI / 2);
      k.add(ring, vcMat(0.3, 0.85), 0xd8b060, x, CY - 0.35, z);
      const sky = new THREE.CircleGeometry(3.05, 36);
      sky.rotateX(Math.PI / 2);
      k.add(sky, glowMat(), 0xa8c4dc, x, CY - 0.2, z);
      chandelier(k, x, CY - 0.2, z, 1.7, dress, 0xffe2a8);
      lightPool(k, x, z, 3.4, 0x30200c);
    }
    {
      const x = (EW[0] + EW[1]) / 2;
      const z = STRIP_Z;
      const ring = new THREE.TorusGeometry(2.6, 0.14, 6, 32);
      ring.rotateX(Math.PI / 2);
      k.add(ring, vcMat(0.3, 0.85), 0xd8b060, x, CY - 0.35, z);
      const sky = new THREE.CircleGeometry(2.45, 32);
      sky.rotateX(Math.PI / 2);
      k.add(sky, glowMat(), 0xa8c4dc, x, CY - 0.2, z);
      chandelier(k, x, CY - 0.2, z, 1.4, dress, 0xffe2a8);
    }
    for (const t of TABLES) {
      chandelier(k, t.x, CY, t.z, 1.0, dress, 0xfff0d0);
      lightPool(k, t.x, t.z, 2.4, 0x2a1a08);
    }
    // LAVO Lounge: a dark island bar, the LAVO sign, low leather chairs
    {
      const [a, c, d, e] = LAVO;
      floorRect(k, mapLit(palazzoMarble(), 0.2), a, c, d, e, 0.045, 3);
      islandBar(k, BAR.x, BAR.z, BAR.w, BAR.d, { top: 0x0e0c0a, front: 0x2a1a10, trim: 0x3a2414, stool: 0x6a3a1a, glow: 0xffb870, bartender: [0x1a1a1a, 0x1a1a1a] }, ppl, 97);
      k.box(vcMat(0.5), 0x1a1410, c - 0.05, 3.0, (d + e) / 2, 0.08, 5.6, e - d);
      sheet.quad(k, sLavo, c - 0.1, 4.6, (d + e) / 2, 3.4, 0.74, -Math.PI / 2);
      for (let z = d + 1; z < e - 0.5; z += 1.5) k.box(glowMat(), 0xffb060, c - 0.12, 2.6, z, 0.02, 3.0, 0.08);
      lightPool(k, BAR.x, BAR.z, 4, 0x2a1408);
    }
    const rnd = prng(98);
    for (let i = 0; i < 5; i++) ppl.standing.push({ x: NS[0] + 0.5 + rnd() * 3, z: CZ0 + 3 + rnd() * 20, rot: rnd() < 0.5 ? 0 : Math.PI, shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
    k.flush(group);
    buildPeople(group, 'sit', ppl.seated);
    buildPeople(group, 'stand', ppl.standing);
    return [];
  });
}

let _glass2: THREE.MeshStandardMaterial | null = null;
function glassMat2(): THREE.MeshStandardMaterial {
  return (_glass2 ??= new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xcfe4ee, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
}
