import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { buildCasinoFloor } from './casinos';
import { GUEST_SHIRTS, Kit, buildPeople, glowMat, vcMat, type PeopleLists } from './interiorKit';
import { canvasTex, lazyInterior, mapLit, prng } from './themedKit';
import { SignSheet, archFacade, cable, facadePlane, floorRect, gateOf, islandBar, lightPool, pile, pottedPalm, storefront, vcDouble, wrapDraw } from './walkinKit';
import './walkinCatalogs';

/*
 * Treasure Island, walk-in (build 5). References: TI's own casino photos (warm amber coffered
 * ceilings, tan columns, red chairs, a tan carpet with rings; the high-limit room's dark wood
 * screens) and Wikimedia Commons photos of the Caribbean village front, Sirens' Cove, the ships and
 * Señor Frog's. The pirate show is gone (2013) but the ships and the village stay, so inside keeps a
 * light nautical touch: teak-deck walkways, ship's-wheel chandeliers, brass lanterns.
 * - In from Sirens' Cove: cross the plank bridge, turn left along the village front to the door; or
 *   from the Spring Mountain side by the TI sign (north door).
 * - Inside: Caribbean village murals over the wainscot, the Breeze Bar under a palm-thatch canopy
 *   (working bar) and the Mystère box office (working shop).
 * The game's TI tower wings cut through the old low-rise, so the casino is its north part.
 */

const CX0 = -98;
const CX1 = -73.6;
const CZ0 = -391;
const CZ1 = -370;
const CH = 10;
const CY = 7.2;
const ix0 = CX0 + 0.6;
const ix1 = CX1 - 0.6;
const iz0 = CZ0 + 0.6;
const iz1 = CZ1 - 0.6;
const NORTH_X = -86;
const COVE_Z = -374;
const NS: [number, number, number, number] = [-88, -84, iz0, COVE_Z + 2];
const EW: [number, number, number, number] = [-88, ix1, COVE_Z - 2, COVE_Z + 2];
const BAR = { x: -80.5, z: -384.5, w: 5.6, d: 4.0 };
const KEEP_BAR: [number, number, number, number] = [-84, -76.8, iz0, -380.2];
const BOX: [number, number, number, number] = [ix0, -95, -385, -378];

type Row = { x: number; z: number; count: number; along: 'x' | 'z'; facing: number };
type Table = { game: 'blackjack' | 'roulette' | 'craps'; x: number; z: number; rot?: number; label: string; vipOnly?: boolean };
const TABLES: Table[] = [
  { game: 'blackjack', x: -91.6, z: -387.8, label: 'TI Blackjack' },
  { game: 'roulette', x: -91.6, z: -381.2, label: 'TI Roulette' },
  { game: 'craps', x: -91.6, z: -374.4, rot: Math.PI / 2, label: 'TI Craps' },
];
const SLOT_ROWS: Row[] = [
  { x: -74.9, z: -385, count: 5, along: 'z', facing: -Math.PI / 2 },
  // a row with its back to the Breeze Bar, facing the deck walk
  { x: -79.6, z: -379.4, count: 7, along: 'x', facing: 0 },
  // a row along the west wall south of the box office
  { x: -96.7, z: -374.2, count: 4, along: 'z', facing: Math.PI / 2 },
];

// ---------------------------------------------------------------- textures
let _carpet: THREE.CanvasTexture | null = null;
/** TI's carpet: tan with brown and cream rings, the odd gold compass rose (tile = 4 m). */
function tiCarpet(): THREE.CanvasTexture {
  return (_carpet ??= canvasTex(
    512,
    512,
    (ctx, w, h) => {
      const rnd = prng(101);
      ctx.fillStyle = '#a07a50';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 46; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 10 + rnd() * 34;
        const c = rnd() < 0.5 ? '#5a3a22' : rnd() < 0.5 ? '#e8d4b0' : '#7a2a1a';
        wrapDraw(w, h, x, y, r + 4, (px, py) => {
          ctx.strokeStyle = c;
          ctx.lineWidth = 3 + rnd() * 4;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
      for (const [cx, cy] of [
        [w * 0.3, h * 0.3],
        [w * 0.8, h * 0.75],
      ]) {
        wrapDraw(w, h, cx, cy, 60, (px, py) => {
          ctx.fillStyle = '#d8a84a';
          ctx.beginPath();
          for (let i = 0; i < 16; i++) {
            const r = i % 2 ? 12 : i % 4 === 0 ? 56 : 30;
            const a = (i / 16) * Math.PI * 2;
            ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#5a3a22';
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }
      pile(ctx, w, h, 102);
    },
    true
  ));
}

let _deck: THREE.CanvasTexture | null = null;
/** Teak deck planks with dark caulking and brass nails (tile = 2 m). */
function deckTex(): THREE.CanvasTexture {
  return (_deck ??= canvasTex(
    256,
    256,
    (ctx, w, h) => {
      const rnd = prng(103);
      const n = 8;
      for (let i = 0; i < n; i++) {
        const shade = 0.85 + rnd() * 0.25;
        ctx.fillStyle = `rgb(${Math.round(150 * shade)},${Math.round(100 * shade)},${Math.round(58 * shade)})`;
        ctx.fillRect((i * w) / n, 0, w / n, h);
        for (let k = 0; k < 14; k++) {
          ctx.strokeStyle = 'rgba(60,35,15,0.18)';
          ctx.lineWidth = 1;
          const x = (i * w) / n + rnd() * (w / n);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + (rnd() - 0.5) * 4, h);
          ctx.stroke();
        }
        ctx.fillStyle = '#2a1a0e';
        ctx.fillRect((i * w) / n, 0, 2, h);
        const joint = rnd() * h;
        ctx.fillRect((i * w) / n, joint, w / n, 2);
        ctx.fillStyle = '#d8b060';
        for (const y of [joint - 6, joint + 8]) {
          ctx.fillRect((i * w) / n + 6, (y + h) % h, 2, 2);
          ctx.fillRect(((i + 1) * w) / n - 8, (y + h) % h, 2, 2);
        }
      }
    },
    true
  ));
}

let _mural: THREE.CanvasTexture | null = null;
/** A Caribbean harbour mural: pastel houses, palms, a blue sky and the sea (one 8 m panel). */
function muralTex(): THREE.CanvasTexture {
  return (_mural ??= canvasTex(
    512,
    192,
    (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
      sky.addColorStop(0, '#5ab0e8');
      sky.addColorStop(1, '#bfe4f4');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2a8ab0';
      ctx.fillRect(0, h * 0.78, w, h * 0.22);
      const houses = ['#e98a6a', '#f2cf6a', '#6cbcb4', '#e0a35a', '#d9746a', '#8fc2d9', '#efe0b8'];
      let x = 6;
      let k = 0;
      while (x < w - 10) {
        const hw = 44 + ((k * 31) % 4) * 10;
        const top = h * (0.32 + ((k * 17) % 4) * 0.05);
        ctx.fillStyle = houses[k % houses.length];
        ctx.fillRect(x, top, hw, h * 0.78 - top);
        ctx.fillStyle = '#9a4a32';
        ctx.beginPath();
        ctx.moveTo(x - 4, top);
        ctx.lineTo(x + hw / 2, top - 16);
        ctx.lineTo(x + hw + 4, top);
        ctx.fill();
        ctx.fillStyle = '#3a2a22';
        for (let i = 0; i < 2; i++) ctx.fillRect(x + 8 + i * (hw / 2), top + 12, hw / 2 - 16, 14);
        ctx.fillStyle = '#2f6f5a';
        ctx.fillRect(x + 4, top + 12, 4, 14);
        x += hw + 8;
        k++;
      }
      // palms
      for (const px of [w * 0.12, w * 0.47, w * 0.83]) {
        ctx.strokeStyle = '#6a4a2a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(px, h * 0.82);
        ctx.quadraticCurveTo(px + 8, h * 0.45, px + 2, h * 0.18);
        ctx.stroke();
        ctx.fillStyle = '#2f7a3a';
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(px + 2 + Math.cos(a) * 16, h * 0.18 + Math.sin(a) * 8, 18, 5, a, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = '#6a4a2a';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
    },
    false
  ));
}

let _poster: THREE.CanvasTexture | null = null;
/** An original night-blue show poster for the box office (no real artwork copied). */
function posterTex(): THREE.CanvasTexture {
  return (_poster ??= canvasTex(256, 384, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1a4a');
    g.addColorStop(1, '#1a3a8a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4f0d8';
    ctx.beginPath();
    ctx.arc(w * 0.62, h * 0.28, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a1a4a';
    ctx.beginPath();
    ctx.arc(w * 0.68, h * 0.25, 44, 0, Math.PI * 2);
    ctx.fill();
    // a leaping acrobat silhouette and stars
    ctx.fillStyle = '#e8c04a';
    ctx.beginPath();
    ctx.ellipse(w * 0.4, h * 0.55, 60, 12, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w * 0.62, h * 0.43, 10, 0, Math.PI * 2);
    ctx.fill();
    const rnd = prng(104);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + rnd() * 0.6) + ')';
      ctx.fillRect(rnd() * w, rnd() * h * 0.7, 2, 2);
    }
    ctx.fillStyle = '#f4f0d8';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('MYSTÈRE', w / 2, h * 0.82);
    ctx.font = '18px Georgia, serif';
    ctx.fillText('CIRQUE DU SOLEIL', w / 2, h * 0.9);
  }));
}

// ---------------------------------------------------------------- pieces
/** A ship's wheel hung flat as a chandelier: wooden rim, spokes, handles, candle bulbs round the rim. */
function wheelChandelier(k: Kit, x: number, z: number, y: number, r: number, cy: number): void {
  for (const s of [-1, 1]) cable(k, x + s * r * 0.7, y, z, cy, 0x3a2a1a);
  const rim = new THREE.TorusGeometry(r, 0.07, 6, 28);
  rim.rotateX(Math.PI / 2);
  k.add(rim, vcMat(0.6), 0x6a4024, x, y, z);
  const hub = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12);
  k.add(hub, vcMat(0.4, 0.6), 0xc8a040, x, y, z);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.box(vcMat(0.6), 0x6a4024, x + Math.cos(a) * r * 0.62, y, z + Math.sin(a) * r * 0.62, r * 1.5, 0.06, 0.06, -a);
    k.cyl(glowMat(), 0xffd890, x + Math.cos(a) * r, y + 0.16, z + Math.sin(a) * r, 0.04, 0.05, 0.2, 6);
    k.add(new THREE.SphereGeometry(0.06, 6, 4), glowMat(), 0xffe8b0, x + Math.cos(a) * r, y + 0.3, z + Math.sin(a) * r);
  }
}

/** A brass ship's lantern on a chain: cage, glowing glass, a cap and a ring. */
function shipLantern(k: Kit, x: number, y: number, z: number, cy: number): void {
  cable(k, x, y + 0.35, z, cy, 0x3a2a1a);
  k.cyl(glowMat(), 0xffc870, x, y, z, 0.16, 0.16, 0.4, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.box(vcMat(0.35, 0.8), 0xb08a3a, x + Math.cos(a) * 0.17, y, z + Math.sin(a) * 0.17, 0.03, 0.44, 0.03);
  }
  k.cyl(vcMat(0.35, 0.8), 0xb08a3a, x, y + 0.26, z, 0.08, 0.2, 0.12, 8);
  k.cyl(vcMat(0.35, 0.8), 0xb08a3a, x, y - 0.23, z, 0.2, 0.2, 0.05, 8);
}

// ---------------------------------------------------------------- build
export function buildTIWalkIn(b: WorldBuilder): void {
  buildCasinoFloor(b, {
    id: 'ti',
    casinoName: 'Treasure Island',
    minX: CX0,
    maxX: CX1,
    minZ: CZ0,
    maxZ: CZ1,
    height: CH,
    entrance: { side: 'north', at: NORTH_X, width: 6 },
    extraEntrances: [{ side: 'east', at: COVE_Z, width: 5, inner: true }],
    bare: ['east'],
    interior: {
      ceilingY: CY,
      chandeliers: false,
      bar: false,
      cashier: true,
      sportsbook: false,
      highLimit: false,
      fill: 0.8,
      trim: 0xc8a040,
      cove: 0xffc070,
      wainscot: 0x4a2a18,
      upperWall: 0xe8cfa0,
      columnWrap: 0x5a3a22,
      seat: 0x8a1a1a,
      slotThemes: [2, 0, 6, 7, 1, 4],
      paths: [NS, EW],
      keepOut: [KEEP_BAR, BOX],
    },
    carpet: ['#a07a50', '#5a3a22', '#e8d4b0'],
    wall: 0xb26a4c,
    ceiling: 0xd8a860,
    ceilingGlow: 0x5a3a10,
    light: 0xffc890,
    slots: { accent: '#ffc040', topper: 0xffb030, rows: SLOT_ROWS },
    slotLabel: 'Treasure Island Slots',
    tables: TABLES,
    felt: 0x1a5a3a,
    guard: { kick: [-62, -365] },
    pickups: [
      { x: -91.6, z: -381.2, y: 1.35, amount: 3, label: 'TI Roulette Rail Pack' },
      { x: BAR.x, y: 1.25, z: BAR.z + BAR.d / 2 - 0.3, amount: 4, label: 'Breeze Bar Treasure Chest Pack!' },
    ],
    tourists: [{ pts: [[-66, -365], [-68, COVE_Z], [-86, COVE_Z], [-86, -396]], prop: 'yard-drink' }],
  });
  b.zone('Breeze Bar (Treasure Island Casino)', KEEP_BAR[0], KEEP_BAR[1], KEEP_BAR[2], KEEP_BAR[3]);
  b.collider(BAR.x - BAR.w / 2, BAR.x + BAR.w / 2, BAR.z - BAR.d / 2, BAR.z + BAR.d / 2, 0, 1.15, true);
  b.shopSpots.push({ kind: 'store', catalog: 'ti-breeze', position: new THREE.Vector3(BAR.x, 0, BAR.z + BAR.d / 2 + 1.2), radius: 2.2, label: 'Breeze Bar', hint: 'rum punch, Mai Tai, coconut shrimp' });
  b.collider(BOX[0], BOX[0] + 1.2, BOX[2], BOX[3], 0, 1.2, true);
  b.shopSpots.push({ kind: 'store', catalog: 'ti-mystere', position: new THREE.Vector3(BOX[0] + 2.4, 0, (BOX[2] + BOX[3]) / 2), radius: 2.0, label: 'Mystère Box Office', hint: 'show tickets, souvenirs' });
  // outside: the west and south faces get stucco arches (the east face is the village front, tiFront.ts)
  const fm = archFacade(b, '#c98a64', '#efdcc2', '#ffd9a0', '#ffc070');
  facadePlane(b, fm, CX0 - 0.62, (CZ0 + CZ1) / 2, CZ1 - CZ0, -Math.PI / 2, 0.4, 6.2, 4.2);
  facadePlane(b, fm, (CX0 + NORTH_X - 5) / 2, CZ0 - 0.62, NORTH_X - 5 - CX0, Math.PI, 0.4, 6.2, 4.2);
  facadePlane(b, fm, (NORTH_X + 5 + CX1) / 2, CZ0 - 0.62, CX1 - NORTH_X - 5, Math.PI, 0.4, 6.2, 4.2);

  // ---- dressing (lazy, door-gated) ----
  const sheet = new SignSheet([1024, 512]);
  const sBreeze = sheet.text(512, 110, 'Breeze Bar', '#fff4d8', '#1a5a6a', '"Trebuchet MS", "Segoe UI", sans-serif', undefined, '#f2c23a');
  const sBox = sheet.text(512, 110, 'MYSTÈRE', '#f4f0d8', '#0a1a4a', 'Georgia, serif', 'CIRQUE DU SOLEIL • BOX OFFICE', '#e8c04a');
  const gate = gateOf(CX0, CX1, CZ0, CZ1, CH, [
    { side: 'north', at: NORTH_X, width: 6 },
    { side: 'east', at: COVE_Z, width: 5 },
  ]);
  lazyInterior(b, 'interior:ti-look', gate, (group) => {
    const k = new Kit();
    const ppl: PeopleLists = { seated: [], standing: [] };
    floorRect(k, mapLit(tiCarpet(), 0.92), ix0, ix1, iz0, iz1, 0.036, 4);
    const deck = mapLit(deckTex(), 0.6);
    for (const r of [NS, EW]) floorRect(k, deck, r[0], r[1], r[2], r[3], 0.042, 2);
    // brass rails along the deck walkways
    for (const z of [EW[2], EW[3]]) k.box(vcMat(0.35, 0.8), 0xb08a3a, (EW[0] + EW[1]) / 2, 0.06, z, EW[1] - EW[0], 0.04, 0.06);
    for (const x of [NS[0], NS[1]]) k.box(vcMat(0.35, 0.8), 0xb08a3a, x, 0.06, (NS[2] + NS[3]) / 2, 0.06, 0.04, NS[3] - NS[2]);
    // Caribbean harbour murals over the wainscot on the long walls
    const mural = mapLit(muralTex(), 0.8);
    const muralAt = (x: number, z: number, ry: number, w: number) => {
      const g = new THREE.PlaneGeometry(w, w * 0.375);
      k.add(g, mural, 0xffffff, x, 4.4, z, ry);
    };
    muralAt((ix0 + ix1) / 2 + 5, iz0 + 0.06, 0, 7.5);
    muralAt((ix0 + ix1) / 2 - 7, iz1 - 0.06, Math.PI, 7.5);
    muralAt(ix0 + 0.06, iz0 + 4.5, Math.PI / 2, 6.0);
    // ship's-wheel chandeliers over the tables, brass lanterns down the deck walks
    for (const t of TABLES) {
      wheelChandelier(k, t.x, t.z, CY - 1.6, 1.0, CY - 0.3);
      lightPool(k, t.x, t.z, 2.4, 0x2a1a08);
    }
    for (let z = NS[2] + 2.5; z < NS[3]; z += 4) shipLantern(k, (NS[0] + NS[1]) / 2, CY - 1.9, z, CY - 0.3);
    for (let x = EW[0] + 4; x < EW[1]; x += 4) shipLantern(k, x, CY - 1.9, COVE_Z, CY - 0.3);
    // rope coils + a treasure chest by the cove door
    {
      const x = ix1 - 1.4;
      const z = COVE_Z + 3.4;
      k.box(vcMat(0.6), 0x6a4024, x, 0.35, z, 1.2, 0.7, 0.8);
      const lid = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12, 1, false, 0, Math.PI);
      lid.rotateZ(Math.PI / 2);
      k.add(lid, vcMat(0.6), 0x5a3418, x, 0.7, z);
      for (const s of [-0.45, 0, 0.45]) k.box(vcMat(0.35, 0.8), 0xc8a040, x + s, 0.5, z, 0.06, 0.95, 0.84);
      k.add(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), glowMat(), 0xffd040, x, 0.72, z);
      for (let i = 0; i < 3; i++) {
        const t = new THREE.TorusGeometry(0.35 - i * 0.08, 0.05, 5, 16);
        t.rotateX(Math.PI / 2);
        k.add(t, vcMat(0.9), 0xc8a878, x - 1.4, 0.05 + i * 0.1, z);
      }
    }
    // Breeze Bar: an island bar under a palm-thatch canopy on four timber posts
    {
      islandBar(k, BAR.x, BAR.z, BAR.w, BAR.d, { top: 0x2a1a0e, front: 0x6a4024, trim: 0x3a2414, stool: 0x1a5a6a, glow: 0x6ae8e8, bartender: [0xf4f4f0, 0x1a5a6a] }, ppl, 105);
      const top = 4.2;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) k.cyl(vcMat(0.8), 0x7a5232, BAR.x + sx * (BAR.w / 2 + 0.4), top / 2, BAR.z + sz * (BAR.d / 2 + 0.4), 0.12, 0.14, top, 8);
      const roof = new THREE.ConeGeometry(Math.hypot(BAR.w, BAR.d) / 2 + 1.4, 1.6, 4, 1, true);
      roof.rotateY(Math.PI / 4);
      roof.scale(1, 1, BAR.d / BAR.w + 0.25);
      k.add(roof, vcDouble(0.95), 0xb89a5a, BAR.x, top + 0.75, BAR.z);
      // thatch fringe
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const rx = (BAR.w / 2 + 1.25) * Math.cos(a);
        const rz = (BAR.d / 2 + 1.25) * Math.sin(a);
        k.box(vcMat(0.95), i % 2 ? 0xa88a4a : 0xc8a868, BAR.x + rx, top - 0.15, BAR.z + rz, 0.35, 0.5, 0.06, -a + Math.PI / 2);
      }
      sheet.quad(k, sBreeze, BAR.x, top - 0.7, BAR.z + BAR.d / 2 + 0.42, 2.6, 0.56, 0);
      sheet.quad(k, sBreeze, BAR.x, top - 0.7, BAR.z - BAR.d / 2 - 0.42, 2.6, 0.56, Math.PI);
      for (const s of [-1, 1]) k.box(vcMat(0.6), 0x1a5a6a, BAR.x, top - 0.7, BAR.z + s * (BAR.d / 2 + 0.4), 2.8, 0.66, 0.04);
      lightPool(k, BAR.x, BAR.z, 4, 0x0a2a2a);
      pottedPalm(k, KEEP_BAR[1] - 0.4, KEEP_BAR[3] - 0.4, 2.2, 0x8a6a4a);
    }
    // the Mystère box office on the west wall
    storefront(k, sheet, sBox, BOX[0], (BOX[2] + BOX[3]) / 2, Math.PI / 2, BOX[3] - BOX[2], 5.4, 0x0a1a4a, 0xbcd0ff);
    {
      const pz = (BOX[2] + BOX[3]) / 2;
      const g = new THREE.PlaneGeometry(1.6, 2.4);
      for (const s of [-1, 1]) k.add(g.clone(), mapLit(posterTex(), 0.6), 0xffffff, BOX[0] + 0.5, 1.7, pz + s * 2.4, Math.PI / 2);
      k.box(vcMat(0.4), 0x0a1a4a, BOX[0] + 0.7, 0.55, pz, 0.8, 1.1, 2.0);
      ppl.standing.push({ x: BOX[0] + 0.4, z: pz, rot: Math.PI / 2, shirt: 0x0a1a4a });
    }
    // a few guests on the deck walks
    const rnd = prng(106);
    for (let i = 0; i < 5; i++) ppl.standing.push({ x: NS[0] + 0.6 + rnd() * 2.8, z: iz0 + 2 + rnd() * 14, rot: rnd() < 0.5 ? 0 : Math.PI, shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
    k.flush(group);
    buildPeople(group, 'sit', ppl.seated);
    buildPeople(group, 'stand', ppl.standing);
    return [];
  });
}
