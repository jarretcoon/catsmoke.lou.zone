import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { facadeMaterial } from './buildings';
import { buildCasinoFloor } from './casinos';
import { GUEST_SHIRTS, Kit, buildPeople, chandelier, glowMat, vcMat, type DressLook, type PeopleLists } from './interiorKit';
import { canvasTex, lazyInterior, mapLit, prng } from './themedKit';
import { SignSheet, cable, drumPendant, flowerBed, flowerTex, floorRect, gateOf, islandBar, lightPool, paintMarble, pile, pottedPalm, storefront, wrapDraw } from './walkinKit';
import './walkinCatalogs';

/*
 * Mandalay Bay, walk-in (build 5). References: Wikimedia Commons photos of the entrance hall (cream
 * walls, red-brown marble pilasters with gold capitals, escalators, blue-and-gold railings, a tropical
 * garden with a waterfall), the hotel entrance with the MANDALAY BAY lettering, Mandalay Place and
 * the Shark Reef Aquarium entrance.
 * - The tower now stands on the casino (its wings start on the 12 m roof), so the whole base is a floor:
 *   in from the porte-cochère (east), from the Luxor side (north) and from the beach side (south).
 * - Inside: a teal-and-gold tropical carpet with palm leaves and lotus flowers, cream marble walks,
 *   red marble columns with gold capitals, gold lantern pendants, a tropical garden with a little
 *   waterfall by the porte-cochère, the hotel desk under a big glowing aquarium, House of Blues,
 *   the Shark Reef entrance (working ticket counter) and Rhythm & Riffs (working bar).
 */

const CX0 = -84;
const CX1 = -46;
const CZ0 = 648;
const CZ1 = 698;
const CH = 12;
const CY = 7.6;
const ix0 = CX0 + 0.6;
const ix1 = CX1 - 0.6;
const iz0 = CZ0 + 0.6;
const iz1 = CZ1 - 0.6;
const EAST_Z = 662;
const SOUTH_X = -66;
const NORTH_X = -76;
const EW: [number, number, number, number] = [ix0, ix1, EAST_Z - 3, EAST_Z + 3];
const NS: [number, number, number, number] = [SOUTH_X - 2, SOUTH_X + 2, EAST_Z + 3, iz1];
const NPATH: [number, number, number, number] = [NORTH_X - 2, NORTH_X + 2, iz0, EAST_Z - 3];
const LOBBY: [number, number, number, number] = [-62, ix1, iz0, 654.4];
const GARDEN: [number, number, number, number] = [-53, ix1, EAST_Z + 3, 672];
const BAR = { x: -53, z: 688.5, w: 6, d: 4.4 };
const KEEP_BAR: [number, number, number, number] = [-58.6, ix1, 683.2, iz1];
const REEF: [number, number, number, number] = [-81, -71, 694, iz1];
const HOB: [number, number, number, number] = [ix0, -80, 649.5, 658.5];

type Row = { x: number; z: number; count: number; along: 'x' | 'z'; facing: number };
type Table = { game: 'blackjack' | 'roulette' | 'craps'; x: number; z: number; rot?: number; label: string; vipOnly?: boolean };
const TABLES: Table[] = [
  { game: 'blackjack', x: -78, z: 670, label: 'Mandalay Bay Blackjack' },
  { game: 'roulette', x: -78, z: 679, label: 'Mandalay Bay Roulette' },
  { game: 'craps', x: -78, z: 688, rot: Math.PI / 2, label: 'Mandalay Bay Craps' },
  { game: 'blackjack', x: -59.5, z: 672, label: 'Mandalay Bay Blackjack ($25)' },
  { game: 'blackjack', x: -59.5, z: 679.5, label: 'Mandalay Bay High Limit Blackjack', vipOnly: true },
];
const SLOT_ROWS: Row[] = [
  { x: -47.4, z: 677.6, count: 6, along: 'z', facing: -Math.PI / 2 },
  { x: -52.0, z: 677.6, count: 6, along: 'z', facing: Math.PI / 2 },
  { x: -53.1, z: 677.6, count: 6, along: 'z', facing: -Math.PI / 2 },
];

// ---------------------------------------------------------------- textures
let _carpet: THREE.CanvasTexture | null = null;
/** Tropical carpet: deep teal with gold palm fronds, rust lotus flowers and little gold diamonds (tile = 4 m). */
function mandalayCarpet(): THREE.CanvasTexture {
  return (_carpet ??= canvasTex(
    512,
    512,
    (ctx, w, h) => {
      const rnd = prng(111);
      ctx.fillStyle = '#123a3a';
      ctx.fillRect(0, 0, w, h);
      // palm fronds
      for (let i = 0; i < 14; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const a = rnd() * Math.PI * 2;
        const len = 50 + rnd() * 40;
        wrapDraw(w, h, x, y, len + 10, (px, py) => {
          ctx.strokeStyle = '#c89a3a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
          ctx.stroke();
          for (let k = 1; k < 9; k++) {
            const t = k / 9;
            const bx = px + Math.cos(a) * len * t;
            const by = py + Math.sin(a) * len * t;
            for (const s of [-1, 1]) {
              ctx.beginPath();
              ctx.moveTo(bx, by);
              ctx.lineTo(bx + Math.cos(a + s * 1.0) * 16 * (1 - t * 0.6), by + Math.sin(a + s * 1.0) * 16 * (1 - t * 0.6));
              ctx.stroke();
            }
          }
        });
      }
      // lotus flowers
      for (let i = 0; i < 12; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 12 + rnd() * 10;
        wrapDraw(w, h, x, y, r + 4, (px, py) => {
          for (let k = 0; k < 7; k++) {
            const a = -Math.PI / 2 + (k - 3) * 0.38;
            ctx.fillStyle = k % 2 ? '#c8582a' : '#e07a3a';
            ctx.beginPath();
            ctx.ellipse(px + Math.cos(a) * r * 0.5, py + Math.sin(a) * r * 0.5, r * 0.22, r * 0.55, a + Math.PI / 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#f2c23a';
          ctx.beginPath();
          ctx.arc(px, py + r * 0.1, r * 0.18, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      ctx.fillStyle = '#d8a83a';
      for (let i = 0; i < 160; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        ctx.beginPath();
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x + 3, y);
        ctx.lineTo(x, y + 3);
        ctx.lineTo(x - 3, y);
        ctx.fill();
      }
      pile(ctx, w, h, 112);
    },
    true
  ));
}

let _marble: THREE.CanvasTexture | null = null;
/** Cream marble squares with a rust-red border band (tile = 3 m). */
function mandalayMarble(): THREE.CanvasTexture {
  return (_marble ??= canvasTex(
    512,
    512,
    (ctx, w, h) => {
      paintMarble(ctx, w, h, '#efe6d4', '#c8b494', 113, 12);
      ctx.strokeStyle = 'rgba(120,90,60,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#8a3a22';
      ctx.fillRect(w * 0.47, 0, w * 0.06, h);
      ctx.fillStyle = '#d8a83a';
      ctx.fillRect(w * 0.495, 0, w * 0.01, h);
    },
    true
  ));
}

let _fish: THREE.CanvasTexture | null = null;
/** Aquarium: blue water, coral and rock at the bottom, fish (the fish layer scrolls). */
function aquariumTex(): THREE.CanvasTexture {
  return (_fish ??= canvasTex(
    1024,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#3ab8e0');
      g.addColorStop(1, '#0a4a7a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const rnd = prng(114);
      // light rays
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        const x = rnd() * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 40, 0);
        ctx.lineTo(x + 120, h);
        ctx.lineTo(x + 60, h);
        ctx.fill();
      }
      // reef
      for (let i = 0; i < 60; i++) {
        const x = rnd() * w;
        const r = 10 + rnd() * 26;
        ctx.fillStyle = ['#e86a5a', '#f2a03a', '#c84a8a', '#6a5a4a', '#e8d8a8'][Math.floor(rnd() * 5)];
        ctx.beginPath();
        ctx.ellipse(x, h - rnd() * 24, r, r * (0.6 + rnd()), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // fish
      for (let i = 0; i < 46; i++) {
        const x = rnd() * w;
        const y = 20 + rnd() * (h - 80);
        const s = 6 + rnd() * 12;
        const c = ['#ffd23a', '#ff7a2a', '#3ae8ff', '#ffffff', '#c8ff3a', '#ff4a8a'][Math.floor(rnd() * 6)];
        const dir = rnd() < 0.5 ? 1 : -1;
        wrapDraw(w, h, x, y, s * 2, (px, py) => {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.ellipse(px, py, s, s * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(px - dir * s * 0.8, py);
          ctx.lineTo(px - dir * s * 1.5, py - s * 0.45);
          ctx.lineTo(px - dir * s * 1.5, py + s * 0.45);
          ctx.fill();
          ctx.fillStyle = '#0a0a0a';
          ctx.beginPath();
          ctx.arc(px + dir * s * 0.55, py - s * 0.08, s * 0.1, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      // a shark, of course
      ctx.fillStyle = '#7a8a9a';
      ctx.beginPath();
      ctx.ellipse(w * 0.62, h * 0.35, 70, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.62 - 10, h * 0.35 - 14);
      ctx.lineTo(w * 0.62 + 6, h * 0.35 - 40);
      ctx.lineTo(w * 0.62 + 20, h * 0.35 - 12);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.62 - 66, h * 0.35);
      ctx.lineTo(w * 0.62 - 96, h * 0.35 - 22);
      ctx.lineTo(w * 0.62 - 92, h * 0.35 + 18);
      ctx.fill();
    },
    true
  ));
}

// ---------------------------------------------------------------- pieces
/** Red-brown marble column with a gold capital and base (the Mandalay entrance hall's pilasters). */
function marbleColumn(k: Kit, x: number, z: number, h: number): void {
  k.cyl(vcMat(0.25), 0x8a3a22, x, h / 2, z, 0.45, 0.48, h, 16);
  k.cyl(vcMat(0.3, 0.85), 0xd8a83a, x, h - 0.25, z, 0.7, 0.5, 0.5, 16);
  k.box(vcMat(0.3, 0.85), 0xd8a83a, x, h - 0.05, z, 1.5, 0.12, 1.5);
  k.cyl(vcMat(0.3, 0.85), 0xd8a83a, x, 0.15, z, 0.6, 0.65, 0.3, 16);
  for (const y of [1.1, 2.6]) {
    const ring = new THREE.TorusGeometry(0.47, 0.035, 4, 18);
    ring.rotateX(Math.PI / 2);
    k.add(ring, vcMat(0.3, 0.85), 0xd8a83a, x, y, z);
  }
}

/** A blue-and-gold ornamental railing (local frame along +x, length L). */
function ornateRail(k: Kit, x: number, z: number, ry: number, L: number): void {
  k.at(x, 0, z, ry, () => {
    k.box(vcMat(0.3, 0.85), 0xd8a83a, 0, 1.0, 0, L, 0.08, 0.1);
    k.box(vcMat(0.3, 0.85), 0xd8a83a, 0, 0.1, 0, L, 0.06, 0.08);
    for (let u = -L / 2 + 0.5; u < L / 2; u += 1.0) {
      const ring = new THREE.TorusGeometry(0.34, 0.04, 4, 14);
      k.add(ring, vcMat(0.4, 0.5), 0x1a3a8a, u, 0.55, 0);
      k.add(new THREE.SphereGeometry(0.08, 6, 4), vcMat(0.3, 0.85), 0xd8a83a, u, 0.55, 0);
      k.box(vcMat(0.3, 0.85), 0xd8a83a, u + 0.5, 0.55, 0, 0.04, 0.9, 0.04);
    }
  });
}

// ---------------------------------------------------------------- build
export function buildMandalayWalkIn(b: WorldBuilder): void {
  buildCasinoFloor(b, {
    id: 'mandalay',
    casinoName: 'Mandalay Bay',
    minX: CX0,
    maxX: CX1,
    minZ: CZ0,
    maxZ: CZ1,
    height: CH,
    entrance: { side: 'south', at: SOUTH_X, width: 6 },
    extraEntrances: [
      { side: 'east', at: EAST_Z, width: 6, inner: true },
      { side: 'north', at: NORTH_X, width: 5 },
    ],
    bare: ['east', 'west', 'north', 'south'],
    interior: {
      ceilingY: CY,
      chandeliers: false,
      bar: false,
      columns: false,
      highLimit: false,
      fill: 0.75,
      trim: 0xd8a83a,
      cove: 0xffc880,
      wainscot: 0x5a2a18,
      upperWall: 0xefe4cc,
      seat: 0x8a3a22,
      slotThemes: [6, 1, 2, 0, 4, 7],
      paths: [EW, NS, NPATH],
      keepOut: [LOBBY, GARDEN, KEEP_BAR, REEF, HOB],
    },
    carpet: ['#123a3a', '#c89a3a', '#c8582a'],
    wall: 0xc9a26a,
    ceiling: 0xe8d4a8,
    ceilingGlow: 0x5a3a10,
    light: 0xffd8a0,
    slots: { accent: '#ffd27a', topper: 0xffc34d, rows: SLOT_ROWS },
    slotLabel: 'Mandalay Bay Slots',
    tables: TABLES,
    felt: 0x1a4a4a,
    guard: { kick: [-38, 662] },
    pickups: [
      { x: -78, z: 679, y: 1.35, amount: 3, label: 'Mandalay Roulette Rail Pack' },
      { x: BAR.x, y: 1.25, z: BAR.z - BAR.d / 2 + 0.3, amount: 4, label: 'Rhythm & Riffs Bar-Top Pack!' },
      { x: -49.5, y: 0.95, z: 668, amount: 2, label: 'Tropical Garden Pack' },
    ],
    tourists: [
      { pts: [[-40, EAST_Z], [-66, EAST_Z], [-66, 702]], prop: 'camera' },
      { pts: [[-76, 644], [-76, EAST_Z], [-56, EAST_Z]], prop: 'yard-drink' },
    ],
  });
  // outside: the old base's warm window grid on every face (the tower stands on top), skipping the doors
  {
    const fm = facadeMaterial(b, { wall: '#c9a26a', mullion: '#e8c98a', glass: '#3a2a18', lit: '#ffd9a0', cols: 6, rows: 3, style: 1, seed: 411 }, 50, 12);
    const face = (x: number, z: number, len: number, ry: number) => {
      if (len < 0.5) return;
      const g = new THREE.PlaneGeometry(len, 12);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 50);
      const m = new THREE.Mesh(g, fm);
      m.position.set(x, 6, z);
      m.rotation.y = ry;
      b.add(m);
    };
    const o = 0.62;
    face(CX1 + o, (CZ0 + EAST_Z - 3) / 2, EAST_Z - 3 - CZ0, Math.PI / 2);
    face(CX1 + o, (EAST_Z + 3 + CZ1) / 2, CZ1 - EAST_Z - 3, Math.PI / 2);
    face(CX0 - o, (CZ0 + CZ1) / 2, CZ1 - CZ0, -Math.PI / 2);
    face((CX0 + NORTH_X - 2.5) / 2, CZ0 - o, NORTH_X - 2.5 - CX0, Math.PI);
    face((NORTH_X + 2.5 + CX1) / 2, CZ0 - o, CX1 - NORTH_X - 2.5, Math.PI);
    face((CX0 + SOUTH_X - 5) / 2, CZ1 + o, SOUTH_X - 5 - CX0, 0);
    face((SOUTH_X + 5 + CX1) / 2, CZ1 + o, CX1 - SOUTH_X - 5, 0);
    // the porte-cochère doors: a warm glass surround and the MANDALAY BAY lettering over them
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4a640, roughness: 0.3, metalness: 0.8 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4, 0.4), gold);
      p.position.set(CX1 + 0.6, 2.2, EAST_Z + s * 3.1);
      b.add(p);
    }
  }
  b.zone('Mandalay Bay Hotel Lobby', LOBBY[0], LOBBY[1], LOBBY[2], LOBBY[3]);
  b.zone('Rhythm & Riffs Lounge (Mandalay Bay Casino)', KEEP_BAR[0], KEEP_BAR[1], KEEP_BAR[2], KEEP_BAR[3]);
  b.collider(BAR.x - BAR.w / 2, BAR.x + BAR.w / 2, BAR.z - BAR.d / 2, BAR.z + BAR.d / 2, 0, 1.15, true);
  b.shopSpots.push({ kind: 'store', catalog: 'mandalay-rhythm', position: new THREE.Vector3(BAR.x - BAR.w / 2 - 1.1, 0, BAR.z), radius: 2.2, label: 'Rhythm & Riffs', hint: 'live music, cocktails, wings' });
  b.collider(REEF[0], REEF[1], iz1 - 1.6, iz1, 0, 1.2, true);
  b.shopSpots.push({ kind: 'store', catalog: 'mandalay-shark-reef', position: new THREE.Vector3((REEF[0] + REEF[1]) / 2, 0, iz1 - 3.0), radius: 2.2, label: 'Shark Reef Aquarium', hint: 'tickets, shark plush' });
  b.collider(LOBBY[0] + 1.5, LOBBY[1] - 1.5, iz0 + 2.0, iz0 + 3.0, 0, 1.2, true);
  b.collider(GARDEN[0], GARDEN[1], GARDEN[2] + 0.4, GARDEN[3] - 0.4, 0, 0.7, true);
  // columns down the promenade edges (colliders now, dressing lazy)
  const cols: Array<[number, number]> = [];
  for (let x = ix0 + 6; x < ix1 - 4; x += 7.5) for (const z of [EW[2] - 0.6, EW[3] + 0.6]) if (Math.abs(x - SOUTH_X) > 3 && Math.abs(x - NORTH_X) > 3) cols.push([x, z]);
  for (const [x, z] of cols) b.collider(x - 0.48, x + 0.48, z - 0.48, z + 0.48, 0, CY, true);

  // ---- dressing (lazy, door-gated) ----
  const sheet = new SignSheet([1024, 512]);
  const sMB = sheet.text(640, 96, 'MANDALAY BAY', '#f2d28a', '#2a1a10', 'Georgia, serif', undefined, '#d8a83a');
  const sReef = sheet.add(640, 160, (ctx, w, h) => {
    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b0202a';
    ctx.font = 'bold 72px Georgia, serif';
    ctx.fillText('SHARK REEF', w / 2, h * 0.5);
    ctx.fillStyle = '#1a3a8a';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText('AQUARIUM', w / 2, h * 0.86);
  });
  const sHob = sheet.text(512, 110, 'HOUSE OF BLUES', '#f4e8c8', '#1a2a4a', '"Arial Black", Impact, sans-serif', 'RESTAURANT & BAR • MUSIC HALL', '#c83a2a');
  const sRhythm = sheet.text(512, 110, 'Rhythm & Riffs', '#ffe8c0', '#1a3a3a', '"Brush Script MT", "Segoe Script", cursive', undefined, '#d8a83a');
  const sDesk = sheet.text(512, 96, 'HOTEL REGISTRATION', '#f2d28a', '#2a1a10', 'Georgia, serif', 'MANDALAY BAY • W • FOUR SEASONS', '#d8a83a');
  const dress: DressLook = { trim: 0xd8a83a, wood: 0x5a2a18, dark: 0x1a1008, accent: 0xc8582a, seat: 0x8a3a22, cove: 0xffc880 };
  const flowersTrop = flowerTex(['#ff6a3a', '#ffd23a', '#e83a8a', '#ffffff'], '#1f5a2a', 12);
  const gate = gateOf(CX0, CX1, CZ0, CZ1, CH, [
    { side: 'south', at: SOUTH_X, width: 6 },
    { side: 'east', at: EAST_Z, width: 6 },
    { side: 'north', at: NORTH_X, width: 5 },
  ]);
  lazyInterior(b, 'interior:mandalay-look', gate, (group) => {
    const k = new Kit();
    const ppl: PeopleLists = { seated: [], standing: [] };
    const anim: Array<(t: number, dt: number) => void> = [];
    floorRect(k, mapLit(mandalayCarpet(), 0.92), ix0, ix1, iz0, iz1, 0.036, 4);
    const marble = mapLit(mandalayMarble(), 0.2);
    for (const r of [EW, NS, NPATH, LOBBY]) floorRect(k, marble, r[0], r[1], r[2], r[3], r === LOBBY ? 0.045 : 0.042, 3);
    for (const [x, z] of cols) marbleColumn(k, x, z, CY);
    // gold lantern pendants down the promenade, gold chandeliers over the tables
    for (let x = ix0 + 2.5; x < ix1 - 1; x += 5) {
      drumPendant(k, x, CY - 1.7, EAST_Z, 0.42, 0.8, 0xffc070, 0xd8a83a, CY);
      lightPool(k, x, EAST_Z, 1.6, 0x2a1a08);
    }
    for (const t of TABLES) {
      chandelier(k, t.x, CY, t.z, 1.1, dress, 0xffe0a0);
      lightPool(k, t.x, t.z, 2.4, 0x2a1a08);
    }
    // ---- the hotel desk under the aquarium ----
    {
      const [a, c] = [LOBBY[0], LOBBY[1]];
      const aq = aquariumTex();
      const aqM = new THREE.MeshBasicMaterial({ map: aq });
      const W = c - a - 1.4;
      const g = new THREE.PlaneGeometry(W, 3.2);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * W) / 12);
      k.add(g, aqM, 0xffffff, (a + c) / 2, 3.4, iz0 + 0.06);
      anim.push((_t, dt) => {
        aq.offset.x = (aq.offset.x + dt * 0.02) % 1;
      });
      // gold frame round the tank, cream wall above, the desk in front
      k.box(vcMat(0.3, 0.85), 0xd8a83a, (a + c) / 2, 5.08, iz0 + 0.1, W + 0.3, 0.16, 0.12);
      k.box(vcMat(0.3, 0.85), 0xd8a83a, (a + c) / 2, 1.72, iz0 + 0.1, W + 0.3, 0.16, 0.12);
      for (const s of [-1, 1]) k.box(vcMat(0.3, 0.85), 0xd8a83a, (a + c) / 2 + s * (W / 2 + 0.08), 3.4, iz0 + 0.1, 0.16, 3.5, 0.12);
      k.box(vcMat(0.25), 0x8a3a22, (a + c) / 2, 0.6, iz0 + 2.5, c - a - 3, 1.2, 1.0);
      k.box(vcMat(0.3, 0.85), 0xd8a83a, (a + c) / 2, 1.22, iz0 + 2.5, c - a - 2.9, 0.06, 1.1);
      for (let x = a + 2.5; x < c - 1.5; x += 2.4) ppl.standing.push({ x, z: iz0 + 1.6, rot: 0, shirt: 0xf4f4f0, vest: 0x2a1a10 });
      sheet.quad(k, sDesk, (a + c) / 2, 6.0, iz0 + 0.08, 4.4, 0.82);
      sheet.quad(k, sMB, (a + c) / 2, 6.95, iz0 + 0.08, 5.6, 0.84);
      lightPool(k, (a + c) / 2, iz0 + 3, 4, 0x08202a);
    }
    // ---- the tropical garden + little waterfall by the porte-cochère ----
    {
      const [a, c, d, e] = GARDEN;
      flowerBed(k, (a + c) / 2, (d + e) / 2, c - a, e - d - 0.8, flowersTrop, 0x6a5a4a, 0.6);
      for (const [x, z] of [
        [a + 1.2, d + 1.4],
        [c - 1.2, e - 1.6],
        [c - 1.4, d + 1.6],
      ]) pottedPalm(k, x, z, 2.8, 0x6a5a4a);
      // rockwork + a short cascade on the east wall
      for (let i = 0; i < 6; i++) k.add(new THREE.DodecahedronGeometry(0.5 + (i % 3) * 0.2, 0), vcMat(0.95), 0x6a5a4a, c - 0.6, 0.9 + (i % 2) * 0.4, d + 1 + i * 0.9);
      const fall = new THREE.PlaneGeometry(3.2, 2.6);
      k.add(fall, glowMat(), 0xbfe8f4, c - 0.03, 1.9, (d + e) / 2, -Math.PI / 2);
      ornateRail(k, (a + c) / 2, d + 0.2, 0, c - a);
      ornateRail(k, a + 0.1, (d + e) / 2, Math.PI / 2, e - d - 0.6);
    }
    // ---- Rhythm & Riffs: island bar, a small band stage ----
    {
      const [a, c, d, e] = KEEP_BAR;
      floorRect(k, marble, a, c, d, e, 0.045, 3);
      islandBar(k, BAR.x, BAR.z, BAR.w, BAR.d, { top: 0x1a0e08, front: 0x1a3a3a, trim: 0x3a2414, stool: 0xd8a83a, glow: 0x6ae8c8, bartender: [0x1a1a1a, 0x1a3a3a] }, ppl, 115);
      sheet.quad(k, sRhythm, BAR.x, 3.6, BAR.z - BAR.d / 2 - 0.05, 3, 0.66, Math.PI);
      k.box(vcMat(0.4, 0.5), 0x1a3a3a, BAR.x, 3.6, BAR.z - BAR.d / 2, 3.2, 0.76, 0.04);
      for (const s of [-1, 1]) cable(k, BAR.x + s * 1.3, 4.0, BAR.z - BAR.d / 2, CY, 0xd8a83a);
      // band riser in the corner with a drum kit and two amps
      k.box(vcMat(0.6), 0x2a1a10, c - 1.2, 0.2, e - 1.4, 2.2, 0.4, 2.6);
      k.cyl(vcMat(0.4), 0xc83a2a, c - 1.2, 0.65, e - 1.2, 0.35, 0.35, 0.5, 14);
      for (const s of [-1, 1]) k.box(vcMat(0.6), 0x0a0a0a, c - 0.5, 0.85, e - 1.4 + s * 0.9, 0.5, 0.9, 0.5);
      lightPool(k, BAR.x, BAR.z, 4, 0x0a2a2a);
    }
    // ---- Shark Reef entrance + House of Blues front ----
    storefront(k, sheet, sReef, (REEF[0] + REEF[1]) / 2, iz1, Math.PI, REEF[1] - REEF[0], 6.0, 0xe8dcc4, 0x3ab8e0);
    storefront(k, sheet, sHob, HOB[0], (HOB[2] + HOB[3]) / 2, Math.PI / 2, HOB[3] - HOB[2], 5.6, 0x3a2a1a, 0xffb870);
    // cream walls with red marble pilasters between the kit's (the entrance hall look) — upper frieze
    for (const [x, z, ry, len] of [
      [(ix0 + ix1) / 2, iz1 - 0.05, Math.PI, ix1 - ix0],
      [ix0 + 0.05, (iz0 + iz1) / 2, Math.PI / 2, iz1 - iz0],
    ] as Array<[number, number, number, number]>) {
      k.at(x, 0, z, ry, () => {
        k.box(vcMat(0.3, 0.85), 0xd8a83a, 0, CY - 0.9, 0.05, len, 0.12, 0.08);
        k.box(vcMat(0.6), 0x8a3a22, 0, CY - 0.6, 0.04, len, 0.5, 0.06);
      });
    }
    const rnd = prng(116);
    for (let i = 0; i < 6; i++) ppl.standing.push({ x: ix0 + 4 + rnd() * (ix1 - ix0 - 8), z: EAST_Z + (rnd() - 0.5) * 4, rot: rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2, shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
    k.flush(group);
    buildPeople(group, 'sit', ppl.seated);
    buildPeople(group, 'stand', ppl.standing);
    return anim;
  });
}
