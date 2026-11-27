import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { buildCasinoFloor } from './casinos';
import { GUEST_SHIRTS, Kit, buildPeople, glowMat, vcMat, type PeopleLists } from './interiorKit';
import { canvasTex, lazyInterior, mapLit, prng } from './themedKit';
import { SignSheet, cable, floorRect, gateOf, glowDouble, lightPool, paintMarble, pile, wrapDraw } from './walkinKit';
import './walkinCatalogs';

/*
 * Harrah's Las Vegas, walk-in (build 5). References: Caesars' June 2021 renovation press photos (the
 * redesigned casino floor and lobby) and Wikimedia Commons street photos of the Mardi Gras facade.
 * - In under the striped arch from Carnaval Court (its glass doors now open), or by the north door.
 * - The 2021 floor: purple carpet with pink-and-lavender starbursts, white tiered ceilings edged in
 *   purple LED, white columns, curved-screen slots with black chairs.
 * - The lobby: the front desk lit purple under the big purple, pink and teal "ombré" coral artwork.
 * - Mardi Gras touches: gold crown chandeliers with purple jewels, bead strands, jester masks.
 * - The Piano Bar (dueling pianos) and the Fulton Street Food Hall counter.
 * The low-rise in front of the tower (formerly a solid box) is the casino now.
 */

const CX0 = 44.6;
const CX1 = 60.4;
const CZ0 = -185;
const CZ1 = -143;
const CH = 12;
const CY = 6.8; // the casino's own ceiling (the low-rise is 12 m tall outside)
const ix0 = CX0 + 0.6;
const ix1 = CX1 - 0.6;
const iz0 = CZ0 + 0.6;
const iz1 = CZ1 - 0.6;
const ARCH_Z = -153;
const NORTH_Z = -176;
const AISLE: [number, number, number, number] = [50.6, 53.4, iz0 + 4.4, iz1];
const ARCH_PATH: [number, number, number, number] = [ix0, 53.4, ARCH_Z - 4, ARCH_Z + 4];
const NORTH_PATH: [number, number, number, number] = [ix0, 53.4, NORTH_Z - 2.6, NORTH_Z + 2.6];
const LOBBY: [number, number, number, number] = [ix0, ix1, iz0, iz0 + 4.4];
const PIANO: [number, number, number, number] = [53.4, ix1, -152, iz1];
const FOOD: [number, number, number, number] = [ix0, 50.6, -148.4, iz1];

type Row = { x: number; z: number; count: number; along: 'x' | 'z'; facing: number };
type Table = { game: 'blackjack' | 'roulette' | 'craps'; x: number; z: number; rot?: number; label: string; vipOnly?: boolean };
const TABLES: Table[] = [
  { game: 'blackjack', x: 56.6, z: -175.5, label: "Harrah's Blackjack" },
  { game: 'roulette', x: 56.6, z: -167, label: "Harrah's Roulette" },
  { game: 'craps', x: 56.6, z: -158.5, rot: Math.PI / 2, label: "Harrah's Craps" },
];
const SLOT_ROWS: Row[] = [
  { x: 47.0, z: -167.2, count: 6, along: 'z', facing: -Math.PI / 2 },
  { x: 48.1, z: -167.2, count: 6, along: 'z', facing: Math.PI / 2 },
  { x: 46.1, z: -159.4, count: 3, along: 'z', facing: Math.PI / 2 },
];

// ---------------------------------------------------------------- textures
let _carpet: THREE.CanvasTexture | null = null;
/** The 2021 carpet: deep purple with pink/lavender starbursts and rings (tile = 4 m). */
function harrahsCarpet(): THREE.CanvasTexture {
  return (_carpet ??= canvasTex(
    512,
    512,
    (ctx, w, h) => {
      const rnd = prng(81);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#3a1466');
      g.addColorStop(0.5, '#4a1a7a');
      g.addColorStop(1, '#3a1466');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // starbursts: thin rays round a ring
      const cols = ['#e86ad8', '#b89aff', '#ff8ac8', '#8a6aff'];
      for (let i = 0; i < 7; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 40 + rnd() * 60;
        const c = cols[i % cols.length];
        wrapDraw(w, h, x, y, r + 4, (px, py) => {
          ctx.strokeStyle = c;
          ctx.globalAlpha = 0.75;
          ctx.lineWidth = 1.6;
          const n = 36;
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(px + Math.cos(a) * r * 0.25, py + Math.sin(a) * r * 0.25);
            ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
            ctx.stroke();
          }
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py, r * 0.22, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        });
      }
      // little rings and dots
      for (let i = 0; i < 60; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 4 + rnd() * 10;
        ctx.strokeStyle = rnd() < 0.5 ? '#c88aff' : '#ff9ad8';
        ctx.lineWidth = 2;
        wrapDraw(w, h, x, y, r + 2, (px, py) => {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
      pile(ctx, w, h, 82);
    },
    true
  ));
}

let _marble: THREE.CanvasTexture | null = null;
/** White-and-grey marble tiles with a purple inlay line (walkways, the lobby). Tile = 2 m. */
function harrahsMarble(): THREE.CanvasTexture {
  return (_marble ??= canvasTex(
    512,
    512,
    (ctx, w, h) => {
      paintMarble(ctx, w, h, '#eeecef', '#b8b4c0', 83, 12);
      ctx.strokeStyle = 'rgba(120,110,130,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w / 2 - 2, h / 2 - 2);
      ctx.strokeRect(w / 2 + 1, h / 2 + 1, w / 2 - 2, h / 2 - 2);
      ctx.strokeRect(w / 2 + 1, 1, w / 2 - 2, h / 2 - 2);
      ctx.strokeRect(1, h / 2 + 1, w / 2 - 2, h / 2 - 2);
      ctx.fillStyle = '#6a2aa8';
      ctx.fillRect(w / 2 - 3, 0, 6, h);
    },
    true
  ));
}

let _ombre: THREE.CanvasTexture | null = null;
/** The lobby's big ombré artwork: a reef of purple, magenta and teal blooms on white. */
function ombreArt(): THREE.CanvasTexture {
  return (_ombre ??= canvasTex(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f2eef0';
    ctx.fillRect(0, 0, w, h);
    const rnd = prng(84);
    for (let i = 0; i < 1600; i++) {
      const x = rnd() * w;
      const t = rnd();
      // a lumpy horizon: purple on top, magenta in the middle, teal at the bottom
      const top = h * (0.2 + 0.15 * Math.sin(x * 0.012) + 0.1 * Math.sin(x * 0.031 + 1));
      const bot = h * (0.85 - 0.08 * Math.sin(x * 0.02 + 2));
      const y = top + t * (bot - top);
      const c = t < 0.35 ? ['#6a3aa8', '#8a4ac8', '#5a2a8a'] : t < 0.7 ? ['#d8307a', '#e84a9a', '#b82a8a'] : ['#2ab8c8', '#3ad8d8', '#1a8aa8'];
      ctx.fillStyle = c[Math.floor(rnd() * 3)];
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x, y, 4 + rnd() * 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }));
}

// ---------------------------------------------------------------- pieces
/** A Mardi Gras crown chandelier: a gold crown ring with points and purple/green jewels, lit inside. */
function crownChandelier(k: Kit, x: number, z: number, y: number, r: number, cy: number): void {
  cable(k, x, y + 0.7, z, cy, 0xd8b060);
  k.add(new THREE.CylinderGeometry(r, r * 0.9, 0.5, 20, 1, true), vcMat(0.3, 0.85), 0xd8a83a, x, y, z);
  k.add(new THREE.CylinderGeometry(r * 0.96, r * 0.86, 0.48, 20, 1, true), glowDouble(), 0xb070ff, x, y, z);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const pt = new THREE.ConeGeometry(0.14, 0.55, 4);
    k.add(pt, vcMat(0.3, 0.85), 0xd8a83a, px, y + 0.5, pz);
    k.add(new THREE.SphereGeometry(0.09, 6, 4), glowMat(), i % 2 ? 0x9a3aff : 0x3ad86a, px, y + 0.82, pz);
    k.add(new THREE.SphereGeometry(0.07, 6, 4), glowMat(), i % 2 ? 0x3ad86a : 0xffc23a, x + Math.cos(a + 0.4) * r * 1.01, y, z + Math.sin(a + 0.4) * r * 1.01);
  }
  // bead strands hanging from the rim
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.cyl(glowMat(), [0x9a3aff, 0x3ad86a, 0xffc23a][i % 3], x + Math.cos(a) * r * 0.92, y - 0.42, z + Math.sin(a) * r * 0.92, 0.015, 0.015, 0.36, 4);
  }
}

/** A grand piano (lid up) facing +z in local space. */
function grandPiano(k: Kit, x: number, z: number, ry: number): void {
  k.at(x, 0.4, z, ry, () => {
    const body = new THREE.CylinderGeometry(0.85, 0.85, 0.32, 18, 1, false, 0, Math.PI);
    body.rotateY(Math.PI / 2);
    k.add(body, vcMat(0.15, 0.3), 0x0a0a0c, 0, 0.65, -0.1);
    k.box(vcMat(0.15, 0.3), 0x0a0a0c, 0, 0.65, 0.35, 1.7, 0.32, 0.9);
    k.box(vcMat(0.4), 0xf4f4ee, 0, 0.84, 0.85, 1.4, 0.03, 0.18);
    k.box(vcMat(0.15, 0.3), 0x0a0a0c, 0, 1.05, -0.05, 1.5, 0.03, 1.4, 0, -0.55);
    for (const s of [-0.7, 0.7]) k.box(vcMat(0.2, 0.3), 0x0a0a0c, s, 0.25, 0.35, 0.1, 0.5, 0.1);
    k.box(vcMat(0.2, 0.3), 0x0a0a0c, 0, 0.25, -0.65, 0.1, 0.5, 0.1);
    k.box(vcMat(0.5), 0x1a1a1a, 0, 0.1, 1.3, 0.8, 0.2, 0.4);
  });
}

// ---------------------------------------------------------------- build
export function buildHarrahsWalkIn(b: WorldBuilder): void {
  buildCasinoFloor(b, {
    id: 'harrahs',
    casinoName: "Harrah's",
    minX: CX0,
    maxX: CX1,
    minZ: CZ0,
    maxZ: CZ1,
    height: CH,
    entrance: { side: 'west', at: NORTH_Z, width: 6 },
    extraEntrances: [{ side: 'west', at: ARCH_Z, width: 9.8, inner: true }],
    interior: {
      ceiling: 'tray',
      ceilingY: CY,
      chandeliers: false,
      bar: false,
      columns: false,
      cashier: false,
      sportsbook: false,
      highLimit: false,
      fill: 0.4,
      trim: 0xc8b8e0,
      cove: 0xa050ff,
      wainscot: 0x2a1048,
      upperWall: 0xece8f0,
      seat: 0x16141a,
      slotThemes: [4, 2, 0, 7, 1, 6],
      paths: [AISLE, ARCH_PATH, NORTH_PATH],
      keepOut: [LOBBY, PIANO, FOOD],
    },
    carpet: ['#3a1466', '#e86ad8', '#b89aff'],
    wall: 0xdcc8a6,
    ceiling: 0xf4f2f6,
    ceilingGlow: 0x3a2a5a,
    light: 0xd8b8ff,
    slots: { accent: '#c88aff', topper: 0xa050ff, rows: SLOT_ROWS },
    slotLabel: "Harrah's Slots",
    tables: TABLES,
    felt: 0x3a1a6a,
    guard: { kick: [30, -170] },
    pickups: [
      { x: 56.6, z: -167, y: 1.35, amount: 3, label: "Harrah's Roulette Rail Pack" },
      { x: 57.6, y: 1.5, z: -149.2, amount: 4, label: 'Piano-Top Tip Jar Pack!' },
    ],
    tourists: [
      { pts: [[38, ARCH_Z], [52, ARCH_Z], [52, -180], [48, NORTH_Z], [38, NORTH_Z]], prop: 'yard-drink' },
      { pts: [[52, -146], [52, -178]], prop: 'camera' },
    ],
  });
  b.zone("Piano Bar (Harrah's Casino)", PIANO[0], PIANO[1], PIANO[2], PIANO[3]);
  b.zone("Harrah's Hotel Lobby", LOBBY[0], LOBBY[1], LOBBY[2], LOBBY[3]);
  // Piano Bar: the stage (walkable), the pianos, the bar counter along the south wall
  const stage: [number, number, number, number] = [PIANO[1] - 3.4, PIANO[1], PIANO[2] + 0.4, PIANO[2] + 6.4];
  b.collider(stage[0], stage[1], stage[2], stage[3], 0, 0.4);
  b.collider(stage[0] + 0.8, stage[1] - 0.2, stage[2] + 0.6, stage[2] + 2.4, 0.4, 1.4, true);
  b.collider(stage[0] + 0.8, stage[1] - 0.2, stage[3] - 2.4, stage[3] - 0.6, 0.4, 1.4, true);
  b.collider(PIANO[0] + 0.4, PIANO[1] - 3.6, iz1 - 1.1, iz1 - 0.2, 0, 1.15, true);
  b.shopSpots.push({ kind: 'store', catalog: 'harrahs-piano-bar', position: new THREE.Vector3(PIANO[0] + 2.2, 0, iz1 - 2.4), radius: 2.2, label: 'Piano Bar', hint: 'dueling pianos, cocktails, a request' });
  // Fulton Street Food Hall: the counter across the south-west corner
  b.collider(FOOD[0], FOOD[1] - 0.6, iz1 - 1.6, iz1 - 0.9, 0, 1.15, true);
  b.shopSpots.push({ kind: 'store', catalog: 'harrahs-fulton', position: new THREE.Vector3((FOOD[0] + FOOD[1]) / 2, 0, iz1 - 3.0), radius: 2.0, label: 'Fulton Street Food Hall', hint: 'pizza, bao, ice cream, coffee' });
  // the lobby front desk
  b.collider(LOBBY[0] + 2.4, LOBBY[1] - 2.4, iz0 + 1.6, iz0 + 2.6, 0, 1.2, true);

  // ---- dressing (lazy, door-gated) ----
  const sheet = new SignSheet([1024, 512]);
  const sPiano = sheet.text(512, 110, 'PIANO BAR', '#f4e8ff', '#2a0a48', 'Georgia, serif', 'DUELING PIANOS NIGHTLY', '#c8a0ff');
  const sFulton = sheet.text(512, 110, 'FULTON STREET', '#1a1a1a', '#e8d8b0', '"Arial Black", Impact, sans-serif', 'FOOD HALL', '#3a2a1a');
  const sLobby = sheet.text(512, 96, "HARRAH'S HOTEL", '#f4e8ff', '#2a1048', 'Georgia, serif', 'REGISTRATION • CAESARS FORUM →', '#c8a0ff');
  const gate = gateOf(CX0, CX1, CZ0, CZ1, CH, [
    { side: 'west', at: NORTH_Z, width: 6 },
    { side: 'west', at: ARCH_Z, width: 9.8 },
  ]);
  lazyInterior(b, 'interior:harrahs-look', gate, (group) => {
    const k = new Kit();
    const ppl: PeopleLists = { seated: [], standing: [] };
    floorRect(k, mapLit(harrahsCarpet(), 0.92), ix0, ix1, iz0, iz1, 0.036, 4);
    const marble = mapLit(harrahsMarble(), 0.2);
    for (const r of [AISLE, ARCH_PATH, NORTH_PATH, LOBBY]) floorRect(k, marble, r[0], r[1], r[2], r[3], r === LOBBY ? 0.045 : 0.042, 2);
    // purple LED edge strips along the walkways
    for (const r of [AISLE]) for (const x of [r[0], r[1]]) k.box(glowMat(), 0xa050ff, x, 0.05, (r[2] + r[3]) / 2, 0.05, 0.02, r[3] - r[2]);

    // white columns with purple glow bands (the 2021 floor), on the aisle edges
    for (let z = iz0 + 7; z < iz1 - 2; z += 8) {
      if (Math.abs(z - ARCH_Z) < 4.5 || Math.abs(z - NORTH_Z) < 3) continue;
      for (const x of [AISLE[0] - 0.5, AISLE[1] + 0.5]) {
        k.box(vcMat(0.5), 0xf4f2f6, x, CY / 2, z, 0.8, CY, 0.8);
        k.box(glowMat(), 0xa050ff, x, 3.4, z, 0.84, 0.08, 0.84);
        k.box(glowMat(), 0xa050ff, x, CY - 0.6, z, 0.84, 0.08, 0.84);
      }
    }
    // gold crown chandeliers over the tables and down the aisle
    for (const t of TABLES) {
      crownChandelier(k, t.x, t.z, CY - 1.9, 1.0, CY - 0.3);
      lightPool(k, t.x, t.z, 2.5, 0x200a34);
    }
    for (let z = iz0 + 8; z < iz1 - 3; z += 8) {
      crownChandelier(k, (AISLE[0] + AISLE[1]) / 2, z + 4, CY - 2.0, 0.7, CY - 0.3);
    }
    // Mardi Gras masks on the west wall either side of the arch
    for (const z of [ARCH_Z - 6.2, ARCH_Z + 6.2]) {
      k.at(ix0 + 0.06, 4.6, z, Math.PI / 2, () => {
        const face = new THREE.SphereGeometry(0.9, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        face.rotateX(Math.PI / 2);
        face.scale(1.25, 0.7, 0.4);
        k.add(face, vcMat(0.3, 0.6), 0xd8a83a, 0, 0, 0.1);
        for (const s of [-1, 1]) k.add(new THREE.SphereGeometry(0.2, 10, 8), glowMat(), 0x2a0a48, s * 0.42, 0.05, 0.42);
        for (let i = 0; i < 5; i++) {
          const a = -0.8 + i * 0.4;
          const f = new THREE.ConeGeometry(0.16, 1.3, 6);
          f.translate(0, 0.65, 0);
          f.rotateZ(-a);
          k.add(f, vcMat(0.6), [0x9a3aff, 0x3ad86a, 0xffc23a, 0xe83a9a, 0x9a3aff][i], 0, 0.45, 0.05);
        }
      });
    }

    // ---- the lobby: front desk under the ombré reef ----
    {
      const [a, c] = [LOBBY[0], LOBBY[1]];
      const z = iz0;
      const g = new THREE.PlaneGeometry(c - a - 1.2, 3.4);
      k.add(g, mapLit(ombreArt(), 0.8), 0xffffff, (a + c) / 2, 3.7, z + 0.05);
      k.box(vcMat(0.6), 0xf2eef0, (a + c) / 2, 5.9, z + 0.04, c - a, 1.8, 0.06);
      const dx0 = a + 2.4;
      const dx1 = c - 2.4;
      k.box(vcMat(0.15), 0xd8d4dc, (dx0 + dx1) / 2, 0.6, iz0 + 2.1, dx1 - dx0, 1.2, 1.0);
      k.box(glowMat(), 0x8a4aff, (dx0 + dx1) / 2, 0.55, iz0 + 2.62, dx1 - dx0 - 0.2, 0.9, 0.02);
      k.box(vcMat(0.2, 0.3), 0x2a2a30, (dx0 + dx1) / 2, 1.22, iz0 + 2.1, dx1 - dx0 + 0.1, 0.05, 1.1);
      for (let x = dx0 + 1; x < dx1; x += 2.4) {
        ppl.standing.push({ x, z: iz0 + 1.2, rot: 0, shirt: 0xf4f4f0, vest: 0x2a1048 });
        k.cyl(glowMat(), 0xfff4e0, x + 0.6, 1.45, iz0 + 2.0, 0.09, 0.12, 0.22, 10);
      }
      sheet.quad(k, sLobby, (a + c) / 2, 6.0, z + 0.09, 4.2, 0.78);
      // two hanging screens over the desk
      for (const sx of [-3, 3]) {
        k.box(vcMat(0.3, 0.4), 0x0a0a0e, (a + c) / 2 + sx, 5.2, iz0 + 2.0, 1.6, 0.9, 0.08);
        k.box(glowMat(), 0x4a2a8a, (a + c) / 2 + sx, 5.2, iz0 + 2.05, 1.5, 0.8, 0.02);
        cable(k, (a + c) / 2 + sx, 5.65, iz0 + 2.0, CY, 0x2a2a30);
      }
    }

    // ---- the Piano Bar ----
    {
      const [a, c, d, e] = PIANO;
      floorRect(k, mapLit(harrahsMarble(), 0.2), a, c, d, e, 0.045, 2);
      k.box(vcMat(0.4), 0x1a0a2a, (stage[0] + stage[1]) / 2, 0.2, (stage[2] + stage[3]) / 2, stage[1] - stage[0], 0.4, stage[3] - stage[2]);
      k.box(glowMat(), 0xa050ff, stage[0] - 0.01, 0.2, (stage[2] + stage[3]) / 2, 0.02, 0.06, stage[3] - stage[2]);
      grandPiano(k, (stage[0] + stage[1]) / 2 + 0.2, stage[2] + 1.5, -Math.PI / 2);
      grandPiano(k, (stage[0] + stage[1]) / 2 + 0.2, stage[3] - 1.5, -Math.PI / 2);
      for (const pz of [stage[2] + 1.5, stage[3] - 1.5]) ppl.seated.push({ x: (stage[0] + stage[1]) / 2 + 1.0, y: 0.55, z: pz, rot: -Math.PI / 2, shirt: 0x1a1a1a });
      // purple velvet back wall with the sign
      k.box(vcMat(0.9), 0x3a0a5a, c - 0.05, 3.0, (d + e) / 2, 0.06, 5.6, e - d);
      sheet.quad(k, sPiano, c - 0.1, 4.6, (stage[2] + stage[3]) / 2, 3.4, 0.74, -Math.PI / 2);
      // spotlights onto the pianos
      for (const pz of [stage[2] + 1.5, stage[3] - 1.5]) lightPool(k, (stage[0] + stage[1]) / 2, pz, 1.6, 0x3a2a4a, 0.42);
      // the bar counter along the south wall + bottles
      const bx0 = a + 0.4;
      const bx1 = c - 3.6;
      k.box(vcMat(0.5), 0x2a1048, (bx0 + bx1) / 2, 0.55, iz1 - 0.65, bx1 - bx0, 1.1, 0.7);
      k.box(vcMat(0.2, 0.3), 0x0a0a0e, (bx0 + bx1) / 2, 1.12, iz1 - 0.65, bx1 - bx0 + 0.1, 0.05, 0.85);
      k.box(glowMat(), 0xa050ff, (bx0 + bx1) / 2, 0.08, iz1 - 1.01, bx1 - bx0, 0.05, 0.02);
      const rnd = prng(85);
      for (let x = bx0 + 0.2; x < bx1; x += 0.18) k.cyl(glowMat(), [0x3aa85a, 0xc8783a, 0xe8d8a8, 0x6ab8e8, 0xc8203a][Math.floor(rnd() * 5)], x, 1.55, iz1 - 0.1, 0.025, 0.04, 0.3, 5);
      k.box(vcMat(0.4), 0x1a0a2a, (bx0 + bx1) / 2, 1.38, iz1 - 0.12, bx1 - bx0, 0.04, 0.2);
      // cocktail tables facing the stage
      for (const [tx, tz] of [
        [a + 1.2, d + 2.0],
        [a + 1.2, d + 4.4],
        [a + 2.8, d + 3.2],
      ]) {
        k.cyl(vcMat(0.2, 0.4), 0x0a0a0e, tx, 1.0, tz, 0.35, 0.35, 0.04, 14);
        k.cyl(vcMat(0.3, 0.8), 0xc8b8e0, tx, 0.5, tz, 0.04, 0.06, 1.0, 6);
        for (const s of [-1, 1]) ppl.standing.push({ x: tx + s * 0.55, z: tz, rot: Math.PI / 2, shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
      }
      ppl.standing.push({ x: (bx0 + bx1) / 2, z: iz1 - 0.25, rot: Math.PI, shirt: 0x1a1a1a, vest: 0x6a2aa8 });
    }

    // ---- Fulton Street Food Hall counter ----
    {
      const [a, c] = [FOOD[0], FOOD[1]];
      k.box(vcMat(0.5), 0x3a2a1a, (a + c) / 2, 0.55, iz1 - 1.25, c - a - 0.6, 1.1, 0.7);
      k.box(vcMat(0.25), 0xe8e4dc, (a + c) / 2, 1.12, iz1 - 1.25, c - a - 0.5, 0.05, 0.85);
      k.box(vcMat(0.8), 0xd8c8a0, (a + c) / 2, 3.0, iz1 - 0.05, c - a, 5.6, 0.06);
      // subway-tile back wall and menu boards
      for (let i = 0; i < 3; i++) {
        const x = a + 1 + i * ((c - a - 2) / 2);
        k.box(vcMat(0.4), 0x0a0a0e, x, 2.6, iz1 - 0.1, 1.5, 0.9, 0.04);
        k.box(glowMat(), [0xffd23a, 0xff8a3a, 0xf4f4ee][i], x, 2.6, iz1 - 0.13, 1.4, 0.8, 0.02);
      }
      sheet.quad(k, sFulton, (a + c) / 2, 3.9, iz1 - 0.12, 4.4, 0.95, Math.PI);
      for (let x = a + 0.8; x < c - 0.6; x += 1.6) ppl.standing.push({ x, z: iz1 - 0.6, rot: Math.PI, shirt: 0xf4f4f0, vest: 0x3a2a1a });
    }

    // a few strollers
    const rnd = prng(86);
    for (let i = 0; i < 5; i++) ppl.standing.push({ x: AISLE[0] + 0.4 + rnd() * 2, z: iz0 + 6 + rnd() * 30, rot: rnd() < 0.5 ? 0 : Math.PI, shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
    k.flush(group);
    buildPeople(group, 'sit', ppl.seated);
    buildPeople(group, 'stand', ppl.standing);
    return [];
  });
}
