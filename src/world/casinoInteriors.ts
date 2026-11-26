import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import type { CasinoSpec } from './casinos';
import { R, ceilingTileTexture, cobbleTexture, latticeTexture, parisFacadeTexture, skyTexture, slateTexture, stoneTexture, tickerTexture, type Rect } from './interiorAtlas';
import {
  GUEST_SHIRTS,
  Kit,
  Walkers,
  additiveMat,
  atlasGlow,
  atlasLit,
  atms,
  blackjack,
  buildFx,
  buildPeople,
  buildSlots,
  cameraDome,
  cashierCage,
  catDistance,
  chandelier,
  column,
  craps,
  ensureClock,
  gateOpen,
  glassMat,
  glowMat,
  hangingSign,
  pokerTable,
  ropeLine,
  roulette,
  sportsbook,
  texMat,
  tileUV,
  toRegion,
  vcMat,
  wallBar,
  type DressLook,
  type FxPlacement,
  type GateBox,
  type PeopleLists,
  type Person,
  type SlotPlacement,
  type TableLook,
} from './interiorKit';

export type InteriorTheme = 'classic' | 'paris' | 'horseshoe' | 'flamingo' | 'excalibur' | 'slotsafun' | 'circus' | 'mgm';
export type CeilingStyle = 'coffer' | 'tray' | 'sky' | 'drop' | 'vault' | 'deco' | 'horseshoe' | 'tent';

/** Optional interior settings on a CasinoSpec (every field has a sensible default). */
export interface InteriorOptions {
  ceiling?: CeilingStyle;
  /** Underside of the decorative ceiling (default: height − 1.6). */
  ceilingY?: number;
  trim?: number;
  cove?: number;
  columnWrap?: number;
  wainscot?: number;
  upperWall?: number;
  seat?: number;
  /** Slot game themes used for the auto-filled banks (0..7). */
  slotThemes?: number[];
  /** 0..1 how densely free floor gets slot banks (default 1). */
  fill?: number;
  /** Floor rectangles [minX, maxX, minZ, maxZ] kept clear of auto-placed dressing. */
  keepOut?: Array<[number, number, number, number]>;
  cashier?: boolean;
  bar?: boolean;
  sportsbook?: boolean;
  highLimit?: boolean;
  columns?: boolean;
  chandeliers?: boolean;
  /** Horseshoe: the WSOP poker room rectangle. */
  pokerRoom?: [number, number, number, number];
  /** Paris: cobblestone paths [minX, maxX, minZ, maxZ] (also kept clear). */
  paths?: Array<[number, number, number, number]>;
  /** Paris: where the Eiffel Tower's legs come down inside the casino. */
  eiffelLegs?: Array<[number, number]>;
  /** Slots-A-Fun: the giant novelty slot machine (centre x, z, facing). */
  giantSlot?: [number, number, number];
}

interface Look extends DressLook, TableLook {
  ceiling: CeilingStyle;
  ceil: number;
  wainscot: number;
  upper: number;
  columnWrap: number;
  can: number;
  slotThemes: number[];
  slotAccents: number[];
  chandTint: number;
}

function lerpHex(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

function themeLook(s: CasinoSpec): Look {
  const io = s.interior ?? {};
  const base: Look = {
    ceiling: 'coffer',
    ceil: lerpHex(s.ceiling, 0x1a1410, 0.4),
    trim: 0xd4a640,
    cove: s.light,
    wainscot: lerpHex(s.wall, 0x1a1008, 0.55),
    upper: lerpHex(s.wall, 0x2a2420, 0.25),
    columnWrap: lerpHex(s.wall, 0x101010, 0.4),
    can: 0xfff0d0,
    seat: 0x6a1420,
    wood: 0x3b2116,
    dark: 0x141418,
    accent: s.slots.topper,
    felt: s.felt,
    rail: 0x1a1210,
    dealerShirt: 0xf4f4f0,
    dealerVest: 0x141414,
    slotThemes: [0, 1, 2, 3, 4, 6, 7],
    slotAccents: [s.slots.topper, 0xffc040, 0x40c8ff, 0xff4a8a],
    chandTint: 0xfff4dc,
  };
  const th = s.theme ?? 'classic';
  const over: Partial<Look> =
    th === 'paris'
      ? { ceiling: 'sky', trim: 0xc8a050, cove: 0xffd9a0, wainscot: 0x3a2a24, upper: 0x8ec0e8, seat: 0x7a1a2a, wood: 0x4a2a18, slotThemes: [0, 1, 4, 5, 6, 7], slotAccents: [0xffd27a, 0x63e8ff, 0xff7aa8], chandTint: 0xfff0d0 }
      : th === 'horseshoe'
        ? { ceiling: 'horseshoe', ceil: 0x0c0a0a, trim: 0xd9a63a, cove: 0xffb040, wainscot: 0x5a0a10, upper: 0x3a2224, columnWrap: 0x8a0a14, seat: 0x8a0a14, rail: 0x0a0a0a, wood: 0x1a0e0a, slotThemes: [0, 2, 1, 6, 7], slotAccents: [0xffcc33, 0xff3a2a, 0xffd27a], dealerVest: 0x8a0a14 }
        : th === 'flamingo'
          ? { ceiling: 'deco', ceil: 0x2a0e24, trim: 0xf0c8e0, cove: 0xff4fb8, wainscot: 0x0f5a5a, upper: 0xe890b8, columnWrap: 0xf4eef0, seat: 0xff4fa8, wood: 0x2a1a24, accent: 0xff4fc6, slotThemes: [5, 0, 1, 6, 7, 3], slotAccents: [0xff4fc6, 0x3ae8d8, 0xffa040], dealerVest: 0xff3a9a, chandTint: 0xffd0ec }
          : th === 'excalibur'
            ? { ceiling: 'vault', ceil: 0x2a1c14, trim: 0x6a4a2a, cove: 0xffa040, wainscot: 0x5a4a3a, upper: 0x7a6a5a, columnWrap: 0x8a7a68, seat: 0x8a1a1a, wood: 0x3a2414, rail: 0x2a0a0a, slotThemes: [2, 4, 0, 6, 1], slotAccents: [0xffcf4a, 0xd9362b, 0x2a5ad8], dealerVest: 0x8a1414, chandTint: 0xffc070, can: 0xffd8a0 }
            : th === 'slotsafun'
              ? { ceiling: 'drop', ceil: 0xd8d2c4, trim: 0xffd23a, cove: 0xff3a2a, wainscot: 0x5a0c10, upper: 0xb3161e, seat: 0xc8141e, slotThemes: [0, 7, 5, 6, 0, 2], slotAccents: [0xffcc33, 0xff2a2a, 0x2a7aff, 0x3aff6a], dealerVest: 0xc8141e }
              : th === 'circus'
                ? { ceiling: 'tent', ceil: 0xffffff, trim: 0xffd23a, cove: 0xff4fa8, wainscot: 0x2a5ad8, upper: 0xff5fa2, columnWrap: 0xff4f98, seat: 0x2a5ad8, slotThemes: [5, 0, 6, 7, 1], slotAccents: [0xff4fa8, 0xffd23a, 0x3ad8ff] }
                : th === 'mgm'
                  ? { ceiling: 'tray', ceil: 0x0c1a12, trim: 0xd4a640, cove: 0x7dffb8, wainscot: 0x0f3a24, upper: 0x1f5a3a, columnWrap: 0x1f7a52, seat: 0x1f5a3a, slotThemes: [1, 2, 6, 4, 0], slotAccents: [0x7dffb8, 0xffd27a], dealerVest: 0x0f4a2a }
                  : {};
  const look = { ...base, ...over };
  if (io.ceiling) look.ceiling = io.ceiling;
  if (io.trim !== undefined) look.trim = io.trim;
  if (io.cove !== undefined) look.cove = io.cove;
  if (io.columnWrap !== undefined) look.columnWrap = io.columnWrap;
  if (io.wainscot !== undefined) look.wainscot = io.wainscot;
  if (io.upperWall !== undefined) look.upper = io.upperWall;
  if (io.seat !== undefined) look.seat = io.seat;
  if (io.slotThemes?.length) look.slotThemes = io.slotThemes;
  return look;
}

// ---------------------------------------------------------------- floor occupancy
class Occ {
  readonly nx: number;
  readonly nz: number;
  readonly cells: Uint8Array;
  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly x1: number,
    readonly z1: number,
    readonly res = 0.5
  ) {
    this.nx = Math.ceil((x1 - x0) / res);
    this.nz = Math.ceil((z1 - z0) / res);
    this.cells = new Uint8Array(this.nx * this.nz);
  }
  mark(ax: number, bx: number, az: number, bz: number): void {
    const i0 = Math.max(0, Math.floor((ax - this.x0) / this.res));
    const i1 = Math.min(this.nx - 1, Math.floor((bx - this.x0 - 1e-4) / this.res));
    const j0 = Math.max(0, Math.floor((az - this.z0) / this.res));
    const j1 = Math.min(this.nz - 1, Math.floor((bz - this.z0 - 1e-4) / this.res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.cells[j * this.nx + i] = 1;
  }
  free(ax: number, bx: number, az: number, bz: number): boolean {
    if (ax < this.x0 || bx > this.x1 || az < this.z0 || bz > this.z1) return false;
    const i0 = Math.floor((ax - this.x0) / this.res);
    const i1 = Math.min(this.nx - 1, Math.floor((bx - this.x0 - 1e-4) / this.res));
    const j0 = Math.floor((az - this.z0) / this.res);
    const j1 = Math.min(this.nz - 1, Math.floor((bz - this.z0 - 1e-4) / this.res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (this.cells[j * this.nx + i]) return false;
    return true;
  }
  seg(ax: number, az: number, bx: number, bz: number, r: number): void {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / (this.res * 0.8)));
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n;
      const z = az + ((bz - az) * i) / n;
      this.mark(x - r, x + r, z - r, z + r);
    }
  }
}

type Side = 'north' | 'south' | 'east' | 'west';
interface Frame {
  side: Side;
  rot: number; // local +z points into the room
  fixed: number; // interior wall face coordinate
  lo: number;
  hi: number;
  along: 'x' | 'z';
}

// ---------------------------------------------------------------- entry point
/**
 * Furnishes a casino floor. The heavy work (layout, geometry) happens the first time the cat comes
 * within ~80 m, so it can see every collider, pickup and NPC route other code put on the floor.
 */
export function furnishCasino(b: WorldBuilder, s: CasinoSpec): void {
  ensureClock(b);
  const group = new THREE.Group();
  group.name = `interior:${s.id}`;
  group.visible = false;
  b.scene.add(group);
  const entrances = [s.entrance, ...(s.extraEntrances ?? [])];
  const gate: GateBox = {
    minX: s.minX,
    maxX: s.maxX,
    minZ: s.minZ,
    maxZ: s.maxZ,
    height: s.height,
    doors: entrances.map((e) =>
      e.side === 'east'
        ? { x: s.maxX, z: e.at, nx: 1, nz: 0, half: e.width / 2 }
        : e.side === 'west'
          ? { x: s.minX, z: e.at, nx: -1, nz: 0, half: e.width / 2 }
          : e.side === 'north'
            ? { x: e.at, z: s.minZ, nx: 0, nz: -1, half: e.width / 2 }
            : { x: e.at, z: s.maxZ, nx: 0, nz: 1, half: e.width / 2 }
    ),
  };
  let anim: Array<(t: number, dt: number) => void> | null = null;
  b.every((dt, t) => {
    if (!anim && catDistance(gate) < 80) anim = layout(b, s, group);
    const vis = !!anim && gateOpen(gate);
    group.visible = vis;
    if (vis) for (const f of anim!) f(t, dt);
  });
}

function layout(b: WorldBuilder, s: CasinoSpec, group: THREE.Group): Array<(t: number, dt: number) => void> {
  const io = s.interior ?? {};
  const th = s.theme ?? 'classic';
  const look = themeLook(s);
  const k = new Kit();
  const ppl: PeopleLists = { seated: [], standing: [] };
  const slots: SlotPlacement[] = [];
  const fx: FxPlacement[] = [];
  const anim: Array<(t: number, dt: number) => void> = [];
  const wheels: Array<{ x: number; y: number; z: number }> = [];
  const T = 0.6; // half wall thickness
  const ix0 = s.minX + T;
  const ix1 = s.maxX - T;
  const iz0 = s.minZ + T;
  const iz1 = s.maxZ - T;
  const cy = io.ceilingY ?? (th === 'slotsafun' ? 4.2 : s.height - 1.6);
  const entrances = [s.entrance, ...(s.extraEntrances ?? [])];
  const seed = Array.from(s.id).reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  let rs = seed || 1;
  const rnd = () => {
    rs ^= rs << 13;
    rs >>>= 0;
    rs ^= rs >>> 17;
    rs ^= rs << 5;
    rs >>>= 0;
    return rs / 4294967296;
  };

  // ---------- occupancy: hard = things nothing may overlap, soft = walkways kept clear of slot banks
  const hard = new Occ(ix0, iz0, ix1, iz1);
  const soft = new Occ(ix0, iz0, ix1, iz1);
  const both = (ax: number, bx: number, az: number, bz: number) => {
    hard.mark(ax, bx, az, bz);
    soft.mark(ax, bx, az, bz);
  };
  const inside = (x: number, z: number, m = 0) => x > s.minX - m && x < s.maxX + m && z > s.minZ - m && z < s.maxZ + m;
  for (const c of b.colliders) {
    if (c.maxX < ix0 || c.minX > ix1 || c.maxZ < iz0 || c.minZ > iz1) continue;
    if (c.minY > 2.2 || c.topY < 0.15) continue;
    if (c.maxX - c.minX > (ix1 - ix0) * 0.9 && c.maxZ - c.minZ > (iz1 - iz0) * 0.9) continue; // the floor/roof slab itself
    both(c.minX - 0.9, c.maxX + 0.9, c.minZ - 0.9, c.maxZ + 0.9);
  }
  for (const tb of s.tables) both(tb.x - 3.2, tb.x + 3.2, tb.z - 3.2, tb.z + 3.2);
  for (const row of s.slots.rows) {
    const half = (row.count * 1.1) / 2 + 0.4;
    const fx2 = Math.sin(row.facing) * 1.5;
    const fz2 = Math.cos(row.facing) * 1.5;
    if (row.along === 'x') both(row.x - half, row.x + half, row.z - 1 + Math.min(0, fz2), row.z + 1 + Math.max(0, fz2));
    else both(row.x - 1 + Math.min(0, fx2), row.x + 1 + Math.max(0, fx2), row.z - half, row.z + half);
  }
  for (const e of entrances) {
    const d = 9;
    const hw = e.width / 2 + 1.2;
    if (e.side === 'east') both(ix1 - d, ix1, e.at - hw, e.at + hw);
    else if (e.side === 'west') both(ix0, ix0 + d, e.at - hw, e.at + hw);
    else if (e.side === 'north') both(e.at - hw, e.at + hw, iz0, iz0 + d);
    else both(e.at - hw, e.at + hw, iz1 - d, iz1);
  }
  for (const p of b.cigPickups) if (inside(p.position.x, p.position.z)) both(p.position.x - 1.4, p.position.x + 1.4, p.position.z - 1.4, p.position.z + 1.4);
  for (const sp of b.shopSpots) if (inside(sp.position.x, sp.position.z, 2)) both(sp.position.x - sp.radius - 0.8, sp.position.x + sp.radius + 0.8, sp.position.z - sp.radius - 0.8, sp.position.z + sp.radius + 0.8);
  for (const gs of b.gamblingSpots) if (gs.casinoName === s.casinoName) both(gs.position.x - 1.3, gs.position.x + 1.3, gs.position.z - 1.3, gs.position.z + 1.3);
  const bp = new THREE.Vector3();
  for (const r of b.rideables) {
    r.boardPoint(bp);
    if (inside(bp.x, bp.z, 2)) both(bp.x - 2.5, bp.x + 2.5, bp.z - 2.5, bp.z + 2.5);
  }
  for (const tr of b.crowd.tourists) {
    for (let i = 0; i < tr.pts.length; i++) {
      const [ax, az] = tr.pts[i];
      const [cx, cz] = tr.pts[(i + 1) % tr.pts.length];
      if (!inside(ax, az, 3) && !inside(cx, cz, 3)) continue;
      both(Math.min(ax, cx), Math.max(ax, cx), Math.min(az, cz), Math.max(az, cz));
      hard.seg(ax, az, cx, cz, 1.0);
      soft.seg(ax, az, cx, cz, 1.4);
    }
  }
  const gm = 3;
  const loop: Array<[number, number]> = [
    [s.minX + gm, s.minZ + gm],
    [s.maxX - gm, s.minZ + gm],
    [s.maxX - gm, s.maxZ - gm],
    [s.minX + gm, s.maxZ - gm],
  ];
  for (let i = 0; i < 4; i++) soft.seg(loop[i][0], loop[i][1], loop[(i + 1) % 4][0], loop[(i + 1) % 4][1], 1.0);
  for (const r of io.keepOut ?? []) both(r[0], r[1], r[2], r[3]);
  for (const r of io.paths ?? []) both(r[0], r[1], r[2], r[3]);
  if (io.pokerRoom) both(io.pokerRoom[0], io.pokerRoom[1], io.pokerRoom[2], io.pokerRoom[3]);
  for (const [lx, lz] of io.eiffelLegs ?? []) both(lx - 2.2, lx + 2.2, lz - 2.2, lz + 2.2);
  if (io.giantSlot) both(io.giantSlot[0] - 1.6, io.giantSlot[0] + 1.6, io.giantSlot[1] - 1.8, io.giantSlot[1] + 1.8);

  // ---------- walls (interior dressing)
  const frames: Frame[] = [
    { side: 'north', rot: 0, fixed: iz0, lo: ix0, hi: ix1, along: 'x' },
    { side: 'south', rot: Math.PI, fixed: iz1, lo: ix0, hi: ix1, along: 'x' },
    { side: 'west', rot: Math.PI / 2, fixed: ix0, lo: iz0, hi: iz1, along: 'z' },
    { side: 'east', rot: -Math.PI / 2, fixed: ix1, lo: iz0, hi: iz1, along: 'z' },
  ];
  const gaps = (side: Side) =>
    entrances
      .filter((e) => e.side === side)
      .map((e) => [e.at - e.width / 2, e.at + e.width / 2] as [number, number])
      .sort((a, c) => a[0] - c[0]);
  const segsOf = (f: Frame): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    let cur = f.lo;
    for (const [g0, g1] of gaps(f.side)) {
      if (g0 > cur) out.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (cur < f.hi) out.push([cur, f.hi]);
    return out;
  };
  /** Place a local-frame builder at `u` along a wall (u = world x for north/south, world z for east/west). */
  const onWall = (f: Frame, u: number, fn: (lx: number) => void) => {
    // local x axis direction for each wall (so local +z faces the room)
    const wx = f.along === 'x' ? u : f.fixed;
    const wz = f.along === 'x' ? f.fixed : u;
    k.at(wx, 0, wz, f.rot, () => fn(0));
  };
  const wallRect = (f: Frame, u0: number, u1: number, depth: number): [number, number, number, number] => {
    if (f.side === 'north') return [u0, u1, f.fixed, f.fixed + depth];
    if (f.side === 'south') return [u0, u1, f.fixed - depth, f.fixed];
    if (f.side === 'west') return [f.fixed, f.fixed + depth, u0, u1];
    return [f.fixed - depth, f.fixed, u0, u1];
  };
  const decorate = th !== 'excalibur' && th !== 'paris';
  for (const f of frames) {
    for (const [a, c] of segsOf(f)) {
      const len = c - a;
      if (len < 0.3) continue;
      const mid = (a + c) / 2;
      onWall(f, mid, () => {
        if (decorate) {
          k.box(vcMat(0.6), look.wainscot, 0, 0.6, 0.04, len, 1.2, 0.08);
          k.box(vcMat(0.3, 0.8), look.trim, 0, 1.22, 0.06, len, 0.06, 0.1);
          k.quad(vcMat(0.8), look.upper, 0, (1.25 + cy) / 2, 0.012, len, cy - 1.25);
          k.box(vcMat(0.3, 0.8), look.trim, 0, 0.04, 0.09, len, 0.08, 0.04);
        }
        // cove light along the top of the wall
        k.box(glowMat(), look.cove, 0, cy - 0.35, 0.25, len, 0.05, 0.05);
        k.box(vcMat(0.6), look.ceil, 0, cy - 0.28, 0.2, len, 0.12, 0.4);
      });
      if (decorate) {
        for (let u = a + 2.5; u < c - 1.5; u += 5) {
          onWall(f, u, () => {
            k.box(vcMat(0.4), look.wainscot, 0, (cy - 0.6) / 2, 0.12, 0.5, cy - 0.6, 0.2);
            k.box(glowMat(), look.cove, 0, 3.2, 0.24, 0.3, 0.5, 0.06);
            k.box(vcMat(0.3, 0.8), look.trim, 0, 3.2, 0.22, 0.4, 0.62, 0.04);
          });
        }
      }
    }
  }

  // ---------- spec slot rows
  const accentOf = (i: number) => look.slotAccents[i % look.slotAccents.length];
  const themeOf = (i: number) => look.slotThemes[i % look.slotThemes.length];
  s.slots.rows.forEach((row, ri) => {
    const theme = themeOf(ri + 1);
    for (let i = 0; i < row.count; i++) {
      const off = (i - (row.count - 1) / 2) * 1.1;
      const x = row.along === 'x' ? row.x + off : row.x;
      const z = row.along === 'z' ? row.z + off : row.z;
      const played = rnd() < 0.4;
      slots.push({ x, z, rot: row.facing, theme, style: 'video', accent: accentOf(ri), played });
      if (played) seatPlayer(x, z, row.facing);
    }
    const len = row.count * 1.1;
    const signW = Math.min(len - 0.4, 2.6);
    const sr = row.along === 'x' ? 0 : Math.PI / 2;
    k.sign(bankRegion(theme), row.x, 3.5, row.z, signW, signW * 0.42, sr, 0x0a0a0e);
    k.cyl(vcMat(0.3, 0.8), look.trim, row.x, 2.75, row.z, 0.04, 0.04, 0.8, 6);
  });
  function seatPlayer(x: number, z: number, rot: number): void {
    const px = x + Math.sin(rot) * 0.86;
    const pz = z + Math.cos(rot) * 0.86;
    ppl.seated.push({ x: px, z: pz, rot: rot + Math.PI, shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
  }

  // ---------- spec tables
  const limits: Rect[] = [R.limit15, R.limit25, R.limit100];
  s.tables.forEach((tb, i) => {
    const tl: TableLook = { ...look, felt: tb.vipOnly ? 0x1b2a6b : s.felt };
    const lim = tb.vipOnly ? R.limit100 : limits[i % 2];
    const rot = tb.rot ?? 0;
    if (tb.game === 'blackjack') blackjack(k, tb.x, tb.z, rot, tl, ppl, seed + i * 13, lim);
    else if (tb.game === 'roulette') wheels.push(roulette(k, tb.x, tb.z, rot, tl, ppl, seed + i * 13, lim));
    else craps(k, tb.x, tb.z, rot, tl, ppl, seed + i * 13, lim);
    if (tb.vipOnly) {
      const r = 3.4;
      ropeLine(k, tb.x - r, tb.z - r, tb.x + r, tb.z - r, look.trim);
      ropeLine(k, tb.x + r, tb.z + r, tb.x - r, tb.z + r, look.trim);
    }
  });

  // ---------- wall dressing (cashier, bar, sportsbook, ATMs, restrooms)
  const mainSide = s.entrance.side;
  const opposite: Record<Side, Side> = { north: 'south', south: 'north', east: 'west', west: 'east' };
  const order: Side[] = [opposite[mainSide], ...(['north', 'east', 'south', 'west'] as Side[]).filter((x) => x !== opposite[mainSide] && x !== mainSide), mainSide];
  const place = (w: number, depth: number, fn: (f: Frame, u: number) => void, prefer?: Side[]): boolean => {
    for (const side of prefer ?? order) {
      const f = frames.find((x) => x.side === side)!;
      const len = f.hi - f.lo;
      if (len < w + 1) continue;
      // try from the middle outward
      const mid = (f.lo + f.hi) / 2;
      for (let d = 0; d < len / 2; d += 0.5) {
        for (const u of [mid + d, mid - d]) {
          const u0 = u - w / 2 - 0.4;
          const u1 = u + w / 2 + 0.4;
          if (u0 < f.lo + 0.5 || u1 > f.hi - 0.5) continue;
          const [ax, bx, az, bz] = wallRect(f, u0, u1, depth);
          if (!hard.free(ax, bx, az, bz)) continue;
          both(ax, bx, az, bz);
          fn(f, u);
          return true;
        }
      }
    }
    return false;
  };
  const W = ix1 - ix0;
  const D = iz1 - iz0;
  const big = W * D > 900;
  const dress = (opt: boolean | undefined, dflt: boolean) => (opt === undefined ? dflt : opt);
  if (dress(io.cashier, big)) {
    const w = Math.min(9, Math.max(5, Math.max(W, D) * 0.2));
    place(w, 2.0, (f, u) => onWall(f, u, () => cashierCage(k, 0, 0, 0, w, look, ppl)));
    place(2.4, 1.0, (f, u) => onWall(f, u, () => atms(k, 0, 0, 0)));
  }
  if (dress(io.sportsbook, big && th !== 'slotsafun')) {
    const w = Math.min(12, Math.max(7, Math.max(W, D) * 0.28));
    place(w, 2.4, (f, u) => onWall(f, u, () => sportsbook(k, 0, 0, 0, w, look, ppl, seed)));
  }
  let barPlaced = th === 'flamingo';
  if (!barPlaced && dress(io.bar, th !== 'slotsafun')) {
    const w = Math.min(10, Math.max(6, Math.max(W, D) * 0.22));
    barPlaced = place(w, 2.6, (f, u) => onWall(f, u, () => wallBar(k, 0, 0, 0, w, look, ppl, seed)));
  }
  place(2.6, 0.6, (f, u) =>
    onWall(f, u, () => {
      k.box(vcMat(0.8), 0x0c0c10, 0, 1.3, 0.03, 2.2, 2.6, 0.06);
      k.box(vcMat(0.3, 0.8), look.trim, 0, 2.66, 0.08, 2.4, 0.12, 0.1);
      k.sign(R.restrooms, 0, 3.4, 0.12, 1.8, 0.68, 0, 0x14161c, 0xffffff, 0.06);
    })
  );

  // ---------- themed set pieces (before the slot fill so they claim their floor)
  if (th === 'paris') parisSet(b, s, k, look, cy, ppl, hard, soft);
  else if (th === 'excalibur') excaliburSet(s, k, look, cy, frames, segsOf, onWall);
  else if (th === 'flamingo') flamingoBar(b, s, k, look, ppl, hard, soft);
  else if (th === 'horseshoe') horseshoeRoom(b, s, k, look, ppl);
  else if (th === 'slotsafun') slotsAFunSet(b, s, k, look);

  // ---------- high-limit room: a roped carousel with a glass partition, far from the main door
  const door = { x: s.entrance.side === 'east' ? s.maxX : s.entrance.side === 'west' ? s.minX : s.entrance.at, z: s.entrance.side === 'north' ? s.minZ : s.entrance.side === 'south' ? s.maxZ : s.entrance.at };
  const freeBoth = (ax: number, bx: number, az: number, bz: number) => hard.free(ax, bx, az, bz) && soft.free(ax, bx, az, bz);
  const carousel = (cx: number, cz: number, theme: number, accent: number, style: 'video' | 'wheel', n = 8) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.sin(a) * 1.3;
      const z = cz + Math.cos(a) * 1.3;
      const played = rnd() < 0.35;
      slots.push({ x, z, rot: a, theme, style, accent, played });
      if (played) seatPlayer(x, z, a);
    }
    k.cyl(vcMat(0.4, 0.5), 0x101014, cx, 1.4, cz, 0.85, 0.95, 2.8, 16);
    k.cyl(vcMat(0.25, 0.85), look.trim, cx, 2.95, cz, 0.6, 0.6, 0.3, 16);
    for (let q = 0; q < 4; q++) {
      const a = (q / 4) * Math.PI * 2 + Math.PI / 4;
      k.at(cx, 0, cz, a, () => k.quad(atlasGlow(), 0xffffff, 0, 3.55, 0.62, 1.6, 0.72, 0, bankRegion(theme)));
    }
    k.box(vcMat(0.4, 0.5), 0x101014, cx, 3.55, cz, 1.2, 0.8, 1.2);
    for (let q = 0; q < 2; q++) fx.push({ kind: 'meter', x: cx, y: 4.15, z: cz, rot: q * Math.PI, w: 1.15, h: 0.3 });
    b.collider(cx - 1.25, cx + 1.25, cz - 1.25, cz + 1.25, 0, 2.2, true);
  };
  if (dress(io.highLimit, big)) {
    let best: [number, number] | null = null;
    let bestD = -1;
    const R2 = 4.4;
    for (let x = ix0 + R2 + 2.6; x < ix1 - R2 - 2.6; x += 1) {
      for (let z = iz0 + R2 + 2.6; z < iz1 - R2 - 2.6; z += 1) {
        if (!freeBoth(x - R2, x + R2, z - R2, z + R2)) continue;
        const d = Math.hypot(x - door.x, z - door.z);
        if (d > bestD) {
          bestD = d;
          best = [x, z];
        }
      }
    }
    if (best) {
      const [hx, hz] = best;
      both(hx - R2, hx + R2, hz - R2, hz + R2);
      carousel(hx, hz, 1, 0xffd27a, 'video', 8);
      const r = R2 - 0.4;
      ropeLine(k, hx - r, hz - r, hx + r, hz - r, look.trim);
      ropeLine(k, hx - r, hz + r, hx + r, hz + r, look.trim);
      ropeLine(k, hx - r, hz - r, hx - r, hz + r - 2.4, look.trim);
      for (const sx of [-1, 1]) {
        k.box(glassMat(), 0xffffff, hx + sx * r, 1.4, hz + 0.6, 0.05, 2.4, r * 1.2);
        k.box(vcMat(0.25, 0.85), look.trim, hx + sx * r, 2.62, hz + 0.6, 0.08, 0.06, r * 1.2);
      }
      hangingSign(k, R.highLimit, hx, 4.6, hz - r, 3.2, 0.7, 0, cy, look.trim);
      const carpet = new THREE.PlaneGeometry(r * 2, r * 2);
      carpet.rotateX(-Math.PI / 2);
      k.add(carpet, vcMat(0.95), lerpHex(look.seat, 0x000000, 0.35), hx, 0.04, hz);
    }
  }

  // ---------- auto-fill slot banks
  const fill = io.fill ?? 1;
  let blocks = 0;
  const maxBlocks = Math.floor(((W * D) / 30) * fill);
  const tryBank = (x: number, z: number, alongX: boolean, n: number, wheel: boolean): boolean => {
    const L = n * 0.95;
    const hl = L / 2 + 0.6;
    const hd = 2.4;
    const [ax, bx, az, bz] = alongX ? [x - hl, x + hl, z - hd, z + hd] : [x - hd, x + hd, z - hl, z + hl];
    if (!freeBoth(ax, bx, az, bz)) return false;
    both(ax - 0.5, bx + 0.5, az, bz);
    const rot0 = alongX ? 0 : Math.PI / 2;
    const theme = wheel ? 6 : themeOf(blocks);
    const accent = accentOf(blocks);
    k.at(x, 0, z, rot0, () => {
      for (let i = 0; i < n; i++) {
        const lx = (i - (n - 1) / 2) * 0.95;
        for (const side of [1, -1]) {
          const w = k.world(lx, 0, side * 0.36);
          const r = k.worldRot(side > 0 ? 0 : Math.PI);
          const played = rnd() < 0.33;
          slots.push({ x: w.x, z: w.z, rot: r, theme, style: wheel ? 'wheel' : 'video', accent, played });
          if (played) seatPlayer(w.x, w.z, r);
        }
      }
      // end caps + overhead bank sign
      for (const sx of [-1, 1]) k.box(vcMat(0.35, 0.6), 0x16161c, sx * (L / 2 + 0.08), 1.1, 0, 0.16, 2.2, 0.8);
      k.box(glowMat(), accent, 0, 0.05, 0, L, 0.04, 0.78);
      if (wheel) {
        k.cyl(vcMat(0.3, 0.7), look.trim, 0, 2.9, 0, 0.05, 0.05, 1.0, 6);
        const w = k.world(0, 0, 0);
        for (const sd of [0, Math.PI]) {
          fx.push({ kind: 'wheel', x: w.x, y: 3.9, z: w.z, rot: k.worldRot(sd), w: 1.8, h: 1.8 });
          fx.push({ kind: 'meter', x: w.x + Math.sin(k.worldRot(sd)) * 0.02, y: 2.75, z: w.z + Math.cos(k.worldRot(sd)) * 0.02, rot: k.worldRot(sd), w: Math.min(L, 2.6), h: 0.36 });
        }
        k.box(vcMat(0.4, 0.5), 0x101014, 0, 2.75, 0, Math.min(L, 2.6) + 0.1, 0.42, 0.02);
      } else {
        k.cyl(vcMat(0.3, 0.8), look.trim, 0, 2.75, 0, 0.04, 0.04, 0.8, 6);
        k.sign(bankRegion(theme), 0, 3.55, 0, Math.min(L - 0.4, 2.2), Math.min(L - 0.4, 2.2) * 0.42, 0, 0x0a0a0e);
      }
    });
    if (alongX) b.collider(x - L / 2 - 0.15, x + L / 2 + 0.15, z - 0.72, z + 0.72, 0, 2.0, true);
    else b.collider(x - 0.72, x + 0.72, z - L / 2 - 0.15, z + L / 2 + 0.15, 0, 2.0, true);
    blocks++;
    return true;
  };
  const tryCarousel = (x: number, z: number): boolean => {
    const r = 3.4;
    if (!freeBoth(x - r, x + r, z - r, z + r)) return false;
    both(x - r, x + r, z - r, z + r);
    carousel(x, z, themeOf(blocks + 2), accentOf(blocks + 1), 'video', 8);
    blocks++;
    return true;
  };
  for (let z = iz0 + 3; z < iz1 - 2.5 && blocks < maxBlocks; z += 0.5) {
    for (let x = ix0 + 3; x < ix1 - 2.5 && blocks < maxBlocks; x += 0.5) {
      const pick = (blocks + Math.floor(x / 7) + Math.floor(z / 9)) % 5;
      if (pick === 0 && tryCarousel(x + 3.4, z + 3.4)) continue;
      if (tryBank(x + 3, z + 2.4, W >= D, pick === 3 ? 4 : pick === 4 ? 3 : 5, pick === 2 && blocks % 3 === 0)) continue;
      tryBank(x + 2.4, z + 3, W < D, 3, false);
    }
  }

  // ---------- columns on a loose grid
  if (dress(io.columns, th !== 'slotsafun' && th !== 'paris')) {
    const step = th === 'excalibur' ? 8 : 10;
    for (let x = ix0 + step * 0.75; x < ix1 - 3; x += step) {
      for (let z = iz0 + step * 0.75; z < iz1 - 3; z += step) {
        if (!freeBoth(x - 1.2, x + 1.2, z - 1.2, z + 1.2)) continue;
        both(x - 0.8, x + 0.8, z - 0.8, z + 0.8);
        if (th === 'excalibur') stonePillar(k, x, z, cy, look);
        else column(k, x, z, cy, look, look.columnWrap);
        if (th === 'flamingo') palmTop(k, x, z, cy);
        b.collider(x - 0.5, x + 0.5, z - 0.5, z + 0.5, 0, cy, true);
      }
    }
  }

  // ---------- ceiling
  ceiling(k, s, look, cy, ix0, ix1, iz0, iz1, rnd);
  if (dress(io.chandeliers, th !== 'slotsafun' && th !== 'horseshoe' && th !== 'excalibur')) {
    for (const tb of s.tables) chandelier(k, tb.x, cy, tb.z, th === 'paris' ? 1.1 : 1.3, look, look.chandTint);
  }
  if (th === 'excalibur') for (const tb of s.tables) ironChandelier(k, tb.x, cy, tb.z);
  // security domes + wayfinding
  for (let x = ix0 + 6; x < ix1 - 3; x += 12) for (let z = iz0 + 6; z < iz1 - 3; z += 11) cameraDome(k, x + 1.3, cy - (th === 'excalibur' ? 0.75 : 0.02), z - 1.1);
  const ways: Rect[] = [R.lobby, R.pool, R.shows];
  entrances.forEach((e, i) => {
    if (th === 'slotsafun') return;
    const inward = 6.5;
    const [x, z, ry] = e.side === 'east' ? [ix1 - inward, e.at, Math.PI / 2] : e.side === 'west' ? [ix0 + inward, e.at, Math.PI / 2] : e.side === 'north' ? [e.at, iz0 + inward, 0] : [e.at, iz1 - inward, 0];
    hangingSign(k, ways[i % 3], x, Math.min(4.8, cy - 1.2), z, 3.2, 0.8, ry, cy, look.trim);
  });
  // ceiling collider slab keeps the camera under the decorative ceiling
  const low = look.ceiling === 'vault' ? cy - 0.9 : look.ceiling === 'deco' ? cy - 1.9 : look.ceiling === 'tray' ? cy - 0.9 : cy - 0.6;
  b.collider(s.minX, s.maxX, s.minZ, s.maxZ, low, low + 0.4);

  // ---------- life: cocktail servers + strolling guests on the guard loop
  const walkers: Array<Person & { speed: number; phase: number }> = [];
  const servers: Array<Person & { speed: number; phase: number }> = [];
  const serverOutfit = th === 'paris' ? [0x1a1a1a, 0xf4f0e8] : th === 'excalibur' ? [0x8a1a1a, 0xd4a640] : th === 'flamingo' ? [0xff4fb8, 0x1a1a1a] : th === 'horseshoe' ? [0x1a1a1a, 0xc8141e] : [0x1a1a1a, look.accent];
  const nServers = big ? 2 : 1;
  for (let i = 0; i < nServers; i++) servers.push({ x: 0, z: 0, rot: 0, shirt: serverOutfit[0], vest: serverOutfit[1], speed: 0.9 + i * 0.15, phase: i / nServers });
  for (let i = 0; i < (big ? 3 : 1); i++) walkers.push({ x: 0, z: 0, rot: 0, shirt: GUEST_SHIRTS[(i * 4 + 3) % GUEST_SHIRTS.length], speed: i % 2 ? -1.1 : 1.2, phase: 0.2 + i * 0.29 });
  const inner: Array<[number, number]> = loop.map(([x, z]) => [x + (x < (s.minX + s.maxX) / 2 ? 0.5 : -0.5), z + (z < (s.minZ + s.maxZ) / 2 ? 0.5 : -0.5)]);
  const w1 = new Walkers(group, 'server', servers, inner);
  const w2 = new Walkers(group, 'stand', walkers, loop);
  anim.push((t) => {
    w1.update(t);
    w2.update(t);
  });

  // ---------- emit
  const dbg = ((window as unknown as { __interiors?: Record<string, unknown> }).__interiors ??= {});
  dbg[s.id] = { slots: slots.length, blocks, seated: ppl.seated.length, standing: ppl.standing.length };
  k.flush(group);
  buildSlots(group, slots, look.seat);
  buildFx(group, fx);
  buildPeople(group, 'sit', ppl.seated);
  buildPeople(group, 'stand', ppl.standing);
  if (wheels.length) {
    const g = new THREE.CircleGeometry(0.5, 32);
    g.rotateX(-Math.PI / 2);
    toRegion(g, R.wheel);
    const kw = new Kit();
    kw.add(g, atlasLit(), 0xffffff);
    const geo = (kw.flush(new THREE.Group())[0] as THREE.Mesh).geometry;
    const im = new THREE.InstancedMesh(geo, atlasLit(), wheels.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3(1, 1, 1);
    group.add(im);
    anim.push((t) => {
      wheels.forEach((w, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t * 1.6 + i);
        m.compose(p.set(w.x, w.y, w.z), q, sc);
        im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
    });
  }
  const ticker = tickerTexture();
  anim.push((_t, dt) => {
    ticker.offset.x = (ticker.offset.x + dt * 0.05) % 1;
  });
  return anim;
}

function bankRegion(theme: number): Rect {
  return [R.bankSign[0] + theme * 256, R.bankSign[1], R.bankSign[2], R.bankSign[3]];
}

// ---------------------------------------------------------------- ceilings
function ceiling(k: Kit, s: CasinoSpec, look: Look, cy: number, x0: number, x1: number, z0: number, z1: number, rnd: () => number): void {
  const W = x1 - x0;
  const D = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const plane = (m: THREE.Material, color: number, y: number, uvScale?: [number, number]) => {
    const g = new THREE.PlaneGeometry(W, D);
    g.rotateX(Math.PI / 2);
    if (uvScale) tileUV(g, uvScale[0], uvScale[1]);
    k.add(g, m, color, cx, y, cz);
  };
  const cans = (y: number, step: number, skip?: (x: number, z: number) => boolean) => {
    for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) if (!skip?.(x, z)) k.can(x, y - 0.01, z, 0.12, look.can);
  };
  switch (look.ceiling) {
    case 'sky': {
      const g = new THREE.PlaneGeometry(W, D);
      g.rotateX(Math.PI / 2);
      k.add(g, texMat(skyTexture(), 'glow'), 0xffffff, cx, cy, cz);
      (texMat(skyTexture(), 'glow') as THREE.MeshBasicMaterial).color.setHex(0xa8b4c4);
      break;
    }
    case 'drop': {
      plane(texMat(ceilingTileTexture(), 'lit', 0.95), 0xffffff, cy, [W / 1.2, D / 1.2]);
      for (let x = x0 + 1.8; x < x1 - 0.6; x += 3.6) for (let z = z0 + 1.5; z < z1 - 0.6; z += 3) k.box(glowMat(), rnd() < 0.08 ? 0x5a5a54 : 0xb4b8c0, x, cy - 0.02, z, 1.2, 0.03, 0.6);
      break;
    }
    case 'vault': {
      plane(vcMat(0.9), look.ceil, cy);
      for (let x = x0 + 2; x < x1; x += 4) k.box(vcMat(0.85), 0x3a2414, x, cy - 0.35, cz, 0.5, 0.7, D);
      for (let z = z0 + 3; z < z1; z += 6) k.box(vcMat(0.85), 0x2a1a0e, cx, cy - 0.2, z, W, 0.35, 0.35);
      break;
    }
    case 'deco': {
      plane(vcMat(0.8), look.ceil, cy);
      const tiers = 3;
      for (let t = 0; t < tiers; t++) {
        const inset = 1.2 + t * Math.min(W, D) * 0.12;
        const y = cy - 0.55 * (tiers - t);
        const ww = W - inset * 2;
        const dd = D - inset * 2;
        for (const [ox, oz, w, d] of [
          [0, -(dd / 2), ww, 0.9],
          [0, dd / 2, ww, 0.9],
          [-(ww / 2), 0, 0.9, dd],
          [ww / 2, 0, 0.9, dd],
        ]) {
          k.box(vcMat(0.6), t % 2 ? 0x0f5a5a : 0xf4e8ee, cx + ox, y, cz + oz, w, 0.5, d);
        }
        for (const [ox, oz, w, d] of [
          [0, -(dd / 2) + 0.47, ww - 0.9, 0.05],
          [0, dd / 2 - 0.47, ww - 0.9, 0.05],
          [-(ww / 2) + 0.47, 0, 0.05, dd - 0.9],
          [ww / 2 - 0.47, 0, 0.05, dd - 0.9],
        ]) k.box(glowMat(), t % 2 ? 0x3ae8d8 : look.cove, cx + ox, y - 0.2, cz + oz, w, 0.06, d);
      }
      cans(cy - 0.02, 4.5);
      break;
    }
    case 'horseshoe': {
      plane(vcMat(0.7), look.ceil, cy);
      for (let x = x0 + 2.5; x < x1; x += 5) k.box(vcMat(0.4, 0.7), 0x2a1a0a, x, cy - 0.15, cz, 0.12, 0.3, D);
      for (const tb of s.tables) {
        const ring = new THREE.TorusGeometry(3.3, 0.12, 6, 30, Math.PI * 1.55);
        ring.rotateX(Math.PI / 2);
        ring.rotateY(-Math.PI * 0.5 - Math.PI * 0.225);
        k.add(ring, glowMat(), 0xffc040, tb.x, cy - 0.35, tb.z);
        const ring2 = new THREE.TorusGeometry(3.7, 0.22, 6, 30, Math.PI * 1.55);
        ring2.rotateX(Math.PI / 2);
        ring2.rotateY(-Math.PI * 0.5 - Math.PI * 0.225);
        k.add(ring2, vcMat(0.25, 0.9), look.trim, tb.x, cy - 0.3, tb.z);
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI * 0.725 + (i / 6) * Math.PI * 1.45 + Math.PI / 2;
          k.box(glowMat(), 0xffe8b0, tb.x + Math.cos(a) * 3.7, cy - 0.55, tb.z + Math.sin(a) * 3.7, 0.18, 0.12, 0.18);
        }
      }
      cans(cy - 0.02, 3.2);
      break;
    }
    case 'tent': {
      const g = new THREE.ConeGeometry(Math.max(W, D) * 0.72, 3.5, 24, 1, true);
      g.rotateY(Math.PI / 24);
      k.add(g, vcMat(0.7), 0xfbf2f6, cx, cy + 1.6, cz);
      for (let i = 0; i < 24; i += 2) {
        const a = (i / 24) * Math.PI * 2;
        const gg = new THREE.PlaneGeometry(1.6, Math.max(W, D) * 0.75);
        gg.rotateX(Math.PI / 2 + 0.17);
        gg.translate(0, 0, Math.max(W, D) * 0.36);
        gg.rotateY(a);
        k.add(gg, vcMat(0.7), 0xff4f98, cx, cy + 0.3, cz);
      }
      plane(vcMat(0.8), 0x2a1a2a, cy + 3.4);
      break;
    }
    case 'tray': {
      plane(vcMat(0.7), lerpHex(look.ceil, 0x000000, 0.2), cy + 0.6);
      const band = Math.min(4.5, Math.min(W, D) * 0.18);
      for (const [ox, oz, w, d] of [
        [0, -(D / 2 - band / 2), W, band],
        [0, D / 2 - band / 2, W, band],
        [-(W / 2 - band / 2), 0, band, D - band * 2],
        [W / 2 - band / 2, 0, band, D - band * 2],
      ]) k.box(vcMat(0.7), look.ceil, cx + ox, cy - 0.3, cz + oz, w, 0.6, d);
      for (const [ox, oz, w, d] of [
        [0, -(D / 2 - band), W - band * 2, 0.06],
        [0, D / 2 - band, W - band * 2, 0.06],
        [-(W / 2 - band), 0, 0.06, D - band * 2],
        [W / 2 - band, 0, 0.06, D - band * 2],
      ]) k.box(glowMat(), look.cove, cx + ox, cy - 0.05, cz + oz, w, 0.08, d);
      cans(cy - 0.62, 3, (x, z) => Math.abs(x - cx) < W / 2 - band && Math.abs(z - cz) < D / 2 - band);
      break;
    }
    default: {
      // coffered: beam grid, a can light in every coffer, glowing coffer edges
      plane(vcMat(0.7), look.ceil, cy);
      const step = 4.6;
      for (let x = x0 + step; x < x1 - 0.5; x += step) k.box(vcMat(0.5, 0.2), look.trim === 0xd4a640 ? lerpHex(look.ceil, 0xd4a640, 0.25) : look.ceil, x, cy - 0.3, cz, 0.5, 0.6, D);
      for (let z = z0 + step; z < z1 - 0.5; z += step) k.box(vcMat(0.5, 0.2), lerpHex(look.ceil, 0xd4a640, 0.25), cx, cy - 0.3, z, W, 0.6, 0.5);
      for (let x = x0 + step / 2; x < x1; x += step) {
        for (let z = z0 + step / 2; z < z1; z += step) {
          k.can(x, cy - 0.02, z, 0.14, look.can);
          const halo = new THREE.PlaneGeometry(step - 0.6, step - 0.6);
          halo.rotateX(Math.PI / 2);
          k.add(halo, additiveMat(), lerpHex(look.cove, 0x000000, 0.86), x, cy - 0.03, z);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- theme set pieces
function parisSet(b: WorldBuilder, s: CasinoSpec, k: Kit, look: Look, cy: number, ppl: PeopleLists, hard: Occ, soft: Occ): void {
  const io = s.interior ?? {};
  const ix0 = s.minX + 0.6;
  const ix1 = s.maxX - 0.6;
  const iz0 = s.minZ + 0.6;
  const iz1 = s.maxZ - 0.6;
  // Sky painted down the upper walls to the rooflines
  const skyM = texMat(skyTexture(), 'glow');
  const roofTop = 9.6;
  for (const [x, z, w, ry] of [
    [(ix0 + ix1) / 2, iz0 + 0.01, ix1 - ix0, 0],
    [(ix0 + ix1) / 2, iz1 - 0.01, ix1 - ix0, Math.PI],
    [ix0 + 0.01, (iz0 + iz1) / 2, iz1 - iz0, Math.PI / 2],
    [ix1 - 0.01, (iz0 + iz1) / 2, iz1 - iz0, -Math.PI / 2],
  ]) {
    const g = new THREE.PlaneGeometry(w, cy - 4.2);
    tileUV(g, w / 60, 0.25);
    k.add(g, skyM, 0xd8e8ff, x, (cy + 4.2) / 2, z, ry);
  }
  // Cobblestone paths + iron street lamps along them
  const cob = texMat(cobbleTexture(), 'lit', 0.8);
  for (const [a, c, d, e] of io.paths ?? []) {
    const g = new THREE.PlaneGeometry(c - a, e - d);
    g.rotateX(-Math.PI / 2);
    tileUV(g, (c - a) / 2, (e - d) / 2);
    k.add(g, cob, 0xffffff, (a + c) / 2, 0.036, (d + e) / 2);
    const alongX = c - a > e - d;
    const len = alongX ? c - a : e - d;
    for (let u = 3; u < len - 1; u += 7) {
      for (const side of [-1, 1]) {
        if ((Math.round(u / 7) + (side > 0 ? 1 : 0)) % 2) continue;
        const x = alongX ? a + u : side < 0 ? a + 0.25 : c - 0.25;
        const z = alongX ? (side < 0 ? d + 0.25 : e - 0.25) : d + u;
        streetLamp(k, x, z);
      }
    }
  }
  // Eiffel Tower legs landing on the casino floor (the tower outside stands on them)
  const latM = texMat(latticeTexture(), 'cutout');
  const iron = 0x6e4f34;
  for (const [lx, lz] of io.eiffelLegs ?? []) {
    k.box(vcMat(0.85), 0xcfc2a8, lx, 0.7, lz, 3.0, 1.4, 3.0);
    k.box(vcMat(0.85), 0xb8a88c, lx, 1.45, lz, 3.3, 0.12, 3.3);
    const lean = -0.18; // leans west toward the tower's centre
    const h = cy + 0.4;
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      k.box(vcMat(0.55, 0.6), iron, lx + dx * 0.9 + Math.tan(lean) * (h / 2), 1.5 + h / 2, lz + dz * 0.9, 0.22, h + 0.3, 0.22, 0, 0, -lean);
    }
    for (const [ox, oz, ry] of [
      [0, 0.9, 0],
      [0, -0.9, Math.PI],
      [0.9, 0, Math.PI / 2],
      [-0.9, 0, -Math.PI / 2],
    ]) {
      const g = new THREE.PlaneGeometry(1.8, h);
      tileUV(g, 1.5, h / 1.2);
      k.add(g, latM, 0xffffff, lx + ox + Math.tan(lean) * (h / 2), 1.5 + h / 2, lz + oz, ry, 0, -lean);
    }
    b.collider(lx - 1.5, lx + 1.5, lz - 1.5, lz + 1.5, 0, 1.5, true);
  }
  // Le Boulevard: village house fronts with shopfronts, awnings and mansard roofs along the walls
  const facadeM = texMat(parisFacadeTexture(), 'lit', 0.8);
  const slateM = texMat(slateTexture(), 'lit', 0.7);
  const shops: Rect[] = [R.boulangerie, R.cafe, R.brasserie, R.chocolat, R.fleurs, R.laCave];
  const awn = [0x1f3a6a, 0x8a1a2a, 0x1f5a3a, 0x5a2a14, 0x6a2a6a, 0x7a1a1a];
  const entrances = [s.entrance, ...(s.extraEntrances ?? [])];
  let n = 0;
  const walls: Array<{ side: 'north' | 'south' | 'east' | 'west'; fixed: number; lo: number; hi: number; rot: number }> = [
    { side: 'north', fixed: iz0, lo: ix0, hi: ix1, rot: 0 },
    { side: 'east', fixed: ix1, lo: iz0, hi: iz1, rot: -Math.PI / 2 },
    { side: 'south', fixed: iz1, lo: ix0, hi: ix1, rot: Math.PI },
    { side: 'west', fixed: ix0, lo: iz0, hi: iz1, rot: Math.PI / 2 },
  ];
  for (const wl of walls) {
    const gaps = entrances.filter((e) => e.side === wl.side).map((e) => [e.at - e.width / 2 - 0.4, e.at + e.width / 2 + 0.4]);
    const legs = (io.eiffelLegs ?? []).filter(() => wl.side === 'west').map(([, lz]) => [lz - 2.6, lz + 2.6]);
    const block = [...gaps, ...legs];
    for (let u = wl.lo + 0.2; u + 6 <= wl.hi - 0.2; u += 6) {
      if (block.some(([g0, g1]) => u < g1 && u + 6 > g0)) continue;
      const mid = u + 3;
      const wx = wl.side === 'north' || wl.side === 'south' ? mid : wl.fixed;
      const wz = wl.side === 'north' || wl.side === 'south' ? wl.fixed : mid;
      const i = n++;
      const tone = [0xffffff, 0xf4ecdc, 0xfff6e8, 0xece0cc][i % 4];
      k.at(wx, 0, wz, wl.rot, () => {
        const g = new THREE.PlaneGeometry(6, 7.4);
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let q = 0; q < uv.count; q++) uv.setX(q, uv.getX(q) * 0.5 + (i % 2) * 0.5);
        k.add(g, facadeM, tone, 0, 3.7, 0.08);
        k.box(vcMat(0.7), 0xcbb898, 0, 7.45, 0.2, 6.1, 0.18, 0.4);
        // mansard roof + dormers + chimney
        k.box(slateM, 0xffffff, 0, 8.25, -0.3, 6.1, 1.6, 1.4, 0, -0.5);
        for (const dx of [-1.6, 1.6]) {
          k.box(vcMat(0.8), 0xe8dcc4, dx, 8.35, 0.32, 0.8, 0.9, 0.4);
          k.box(glowMat(), 0xffd99a, dx, 8.3, 0.53, 0.45, 0.55, 0.02);
          k.box(vcMat(0.7), 0x3a4250, dx, 8.9, 0.32, 0.95, 0.12, 0.5, 0, -0.3);
        }
        if (i % 2) k.box(vcMat(0.8), 0xb07a5a, 2.3, 9.3, -0.4, 0.5, 1.1, 0.4);
        // awning (striped, tinted) + shop sign
        const ag = new THREE.PlaneGeometry(5.2, 1.5);
        toRegion(ag, R.stripes);
        k.add(ag, atlasLit(), awn[i % awn.length], 0, 3.05, 0.75, 0, -1.0);
        k.box(vcMat(0.4, 0.6), 0x1a1a1a, 0, 2.62, 1.37, 5.2, 0.05, 0.05);
        k.quad(atlasGlow(), 0xe8e8e8, 0, 3.85, 0.1, 3.4, 0.62, 0, shops[i % shops.length]);
        // wall lanterns either side
        for (const dx of [-2.75, 2.75]) {
          k.box(vcMat(0.4, 0.6), 0x1a1a1a, dx, 2.9, 0.3, 0.06, 0.06, 0.45);
          k.box(glowMat(), 0xffd690, dx, 2.75, 0.5, 0.18, 0.28, 0.18);
        }
        // flower boxes on the first-floor balconies
        for (const dx of [-1.95, 0, 1.95]) k.box(vcMat(0.8), [0xd83a5a, 0xf2c23a, 0xc84ad8][(i + Math.round(dx)) & 3 ? 0 : 1], dx, 4.55, 0.18, 0.7, 0.14, 0.16);
      });
      // café terrace: a bistro table and two chairs if the floor is free
      if (i % 3 === 1) {
        const off = 1.7;
        const tx = wl.side === 'north' || wl.side === 'south' ? mid - 1.5 : wl.fixed + (wl.side === 'west' ? off : -off);
        const tz = wl.side === 'north' ? wl.fixed + off : wl.side === 'south' ? wl.fixed - off : mid - 1.5;
        if (hard.free(tx - 1, tx + 1, tz - 1, tz + 1)) {
          hard.mark(tx - 1, tx + 1, tz - 1, tz + 1);
          soft.mark(tx - 1, tx + 1, tz - 1, tz + 1);
          k.cyl(vcMat(0.3, 0.8), 0x1a1a1a, tx, 0.37, tz, 0.03, 0.04, 0.74, 6);
          k.cyl(vcMat(0.3), 0xf4f1ea, tx, 0.75, tz, 0.36, 0.36, 0.03, 14);
          for (const sx of [-1, 1]) {
            k.cyl(vcMat(0.5), 0x8a5a2a, tx + sx * 0.6, 0.45, tz, 0.2, 0.2, 0.04, 10);
            k.box(vcMat(0.5), 0x8a5a2a, tx + sx * 0.78, 0.7, tz, 0.04, 0.5, 0.36);
          }
          ppl.seated.push({ x: tx + 0.62, y: -0.22, z: tz, rot: -Math.PI / 2, shirt: GUEST_SHIRTS[i % GUEST_SHIRTS.length] });
        }
      }
    }
  }
}
function streetLamp(k: Kit, x: number, z: number): void {
  const iron = 0x15161a;
  k.cyl(vcMat(0.5, 0.6), iron, x, 0.15, z, 0.2, 0.24, 0.3, 8);
  k.cyl(vcMat(0.5, 0.6), iron, x, 1.9, z, 0.05, 0.08, 3.5, 8);
  k.cyl(vcMat(0.5, 0.6), iron, x, 3.6, z, 0.12, 0.06, 0.25, 8);
  const lan = (dx: number) => {
    k.cyl(vcMat(0.5, 0.6), iron, x + dx * 0.32, 3.72, z, 0.02, 0.02, 0.66, 5, 0, 0, Math.PI / 2);
    k.cyl(glowMat(), 0xffd690, x + dx * 0.62, 3.5, z, 0.16, 0.11, 0.36, 6);
    k.cyl(vcMat(0.5, 0.6), iron, x + dx * 0.62, 3.76, z, 0.02, 0.22, 0.16, 6);
  };
  lan(1);
  lan(-1);
  const halo = new THREE.CircleGeometry(1.6, 16);
  halo.rotateX(-Math.PI / 2);
  k.add(halo, additiveMat(), 0x2a2010, x, 0.045, z);
}

type OnWall = (f: { side: 'north' | 'south' | 'east' | 'west'; rot: number; fixed: number; lo: number; hi: number; along: 'x' | 'z' }, u: number, fn: (lx: number) => void) => void;
function excaliburSet(
  s: CasinoSpec,
  k: Kit,
  look: Look,
  cy: number,
  frames: Array<{ side: 'north' | 'south' | 'east' | 'west'; rot: number; fixed: number; lo: number; hi: number; along: 'x' | 'z' }>,
  segsOf: (f: (typeof frames)[number]) => Array<[number, number]>,
  onWall: OnWall
): void {
  const stone = texMat(stoneTexture(), 'lit', 0.9);
  const banners = [0xb3121f, 0x1f3f86, 0xd4a640, 0x2a6a2a];
  let n = 0;
  for (const f of frames) {
    for (const [a, c] of segsOf(f)) {
      const len = c - a;
      if (len < 0.3) continue;
      onWall(f, (a + c) / 2, () => {
        const g = new THREE.PlaneGeometry(len, cy);
        tileUV(g, len / 4, cy / 4);
        k.add(g, stone, 0xffffff, 0, cy / 2, 0.02);
        k.box(vcMat(0.9), 0x5a4a3a, 0, 0.3, 0.1, len, 0.6, 0.2);
        k.box(glowMat(), look.cove, 0, cy - 0.35, 0.25, len, 0.05, 0.05);
      });
      // gothic arches with banners and torches between them
      for (let u = a + 3; u < c - 2; u += 6) {
        const i = n++;
        onWall(f, u, () => {
          for (const sx of [-1.5, 1.5]) k.box(vcMat(0.9), 0x8a7a68, sx, 3.0, 0.25, 0.6, 6.0, 0.4);
          for (const sx of [-1, 1]) {
            const arc = new THREE.TorusGeometry(3.0, 0.22, 6, 10, Math.PI / 3);
            arc.rotateZ(sx > 0 ? Math.PI * (2 / 3) : 0);
            arc.translate(sx * -1.5, 0, 0);
            k.add(arc, vcMat(0.9), 0x8a7a68, 0, 6.0, 0.25);
          }
          const bh = 3.0;
          const shape = new THREE.Shape();
          shape.moveTo(-0.6, 0);
          shape.lineTo(0.6, 0);
          shape.lineTo(0.6, -bh);
          shape.lineTo(0, -bh + 0.5);
          shape.lineTo(-0.6, -bh);
          shape.closePath();
          const bg = new THREE.ShapeGeometry(shape);
          remapPlanarXY(bg, R.banner, -0.6, 0.6, -bh, 0);
          k.add(bg, atlasLit(), banners[i % banners.length], 0, 6.4, 0.32);
          k.cyl(vcMat(0.5, 0.6), 0x1a1a1a, 0, 6.45, 0.34, 0.03, 0.03, 1.5, 6, 0, 0, Math.PI / 2);
          const sh = new THREE.PlaneGeometry(1.1, 1.4);
          toRegion(sh, R.shield);
          k.add(sh, atlasLit(), banners[(i + 1) % banners.length], 0, 7.6, 0.3);
          for (const sx of [-1.5, 1.5]) {
            k.box(vcMat(0.5, 0.6), 0x1a1a1a, sx, 3.6, 0.55, 0.08, 0.08, 0.5);
            k.cyl(vcMat(0.5, 0.6), 0x1a1a1a, sx, 3.8, 0.75, 0.12, 0.06, 0.25, 6);
            k.add(new THREE.ConeGeometry(0.1, 0.32, 6), glowMat(), 0xffa030, sx, 4.08, 0.75);
          }
        });
      }
    }
  }
  void look;
}
function remapPlanarXY(g: THREE.BufferGeometry, r: Rect, x0: number, x1: number, y0: number, y1: number): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x0) / (x1 - x0), (pos.getY(i) - y0) / (y1 - y0));
  toRegion(g, r);
}

function stonePillar(k: Kit, x: number, z: number, cy: number, look: Look): void {
  k.cyl(vcMat(0.9), 0x8a7a68, x, cy / 2, z, 0.5, 0.55, cy, 10);
  k.box(vcMat(0.9), 0x6a5a4a, x, 0.3, z, 1.3, 0.6, 1.3);
  k.box(vcMat(0.9), 0x6a5a4a, x, cy - 0.5, z, 1.3, 0.4, 1.3);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    k.box(vcMat(0.5, 0.6), 0x1a1a1a, x + Math.sin(a) * 0.62, 3.4, z + Math.cos(a) * 0.62, 0.08, 0.08, 0.3, a);
    k.add(new THREE.ConeGeometry(0.09, 0.28, 6), glowMat(), 0xffa030, x + Math.sin(a) * 0.72, 3.65, z + Math.cos(a) * 0.72);
  }
  void look;
}

function ironChandelier(k: Kit, x: number, cy: number, z: number): void {
  const y = cy - 2.6;
  const iron = 0x17161a;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ax = x + Math.cos(a) * 1.6;
    const az = z + Math.sin(a) * 1.6;
    const len = Math.hypot(1.6, cy - y);
    k.cyl(vcMat(0.5, 0.7), iron, (ax + x) / 2, (y + cy - 0.6) / 2, (az + z) / 2, 0.015, 0.015, len, 4, -a + Math.PI / 2, Math.atan2(1.6, cy - 0.6 - y));
  }
  for (const r of [1.6, 1.0]) {
    const ring = new THREE.TorusGeometry(r, 0.06, 6, 24);
    ring.rotateX(Math.PI / 2);
    k.add(ring, vcMat(0.5, 0.7), iron, x, y + (r < 1.2 ? 0.35 : 0), z);
    const n = r > 1.2 ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = x + Math.cos(a) * r;
      const cz = z + Math.sin(a) * r;
      const by = y + (r < 1.2 ? 0.35 : 0);
      k.cyl(vcMat(0.6), 0xf2ead0, cx, by + 0.17, cz, 0.045, 0.045, 0.3, 6);
      k.add(new THREE.ConeGeometry(0.05, 0.16, 6), glowMat(), 0xffb040, cx, by + 0.4, cz);
    }
  }
  const halo = new THREE.CircleGeometry(2.6, 16);
  halo.rotateX(-Math.PI / 2);
  k.add(halo, additiveMat(), 0x2a1a08, x, 0.05, z);
}

function palmTop(k: Kit, x: number, z: number, cy: number): void {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const g = new THREE.ConeGeometry(0.32, 2.2, 4);
    g.rotateX(Math.PI / 2 + 0.5);
    g.translate(0, 0, 1.0);
    g.rotateY(a);
    k.add(g, vcMat(0.7), i % 2 ? 0x2a8a4a : 0x3aa85a, x, cy - 1.2, z);
  }
  k.box(glowMat(), 0xff4fb8, x, 2.6, z, 0.94, 0.08, 0.94);
}

function flamingoBar(b: WorldBuilder, s: CasinoSpec, k: Kit, look: Look, ppl: PeopleLists, hard: Occ, soft: Occ): void {
  // A curved island bar (open ring) with a pink neon under-rail and a lit back-bar round the middle
  const r = 3.3;
  const span = 6.0;
  let at: [number, number] | null = null;
  const cx0 = (s.minX + s.maxX) / 2;
  const cz0 = (s.minZ + s.maxZ) / 2;
  let bestD = 1e9;
  for (let x = s.minX + 6; x < s.maxX - 6; x += 0.5) {
    for (let z = s.minZ + 6; z < s.maxZ - 6; z += 0.5) {
      if (!hard.free(x - span, x + span, z - span, z + span) || !soft.free(x - span, x + span, z - span, z + span)) continue;
      const d = Math.hypot(x - cx0, z - cz0);
      if (d < bestD) {
        bestD = d;
        at = [x, z];
      }
    }
  }
  if (!at) return;
  const [x, z] = at;
  hard.mark(x - span, x + span, z - span, z + span);
  soft.mark(x - span, x + span, z - span, z + span);
  const n = 20;
  const gap = 3; // opening for the bartenders
  for (let i = 0; i < n; i++) {
    if (i < gap) continue;
    const a = (i / n) * Math.PI * 2;
    const px = x + Math.sin(a) * r;
    const pz = z + Math.cos(a) * r;
    const segW = (2 * Math.PI * r) / n + 0.05;
    k.box(vcMat(0.5), 0x2a1a24, px, 0.55, pz, segW, 1.1, 0.6, a);
    k.box(vcMat(0.15, 0.3), 0xf4e8ee, x + Math.sin(a) * (r + 0.05), 1.13, z + Math.cos(a) * (r + 0.05), segW, 0.06, 0.8, a);
    k.box(glowMat(), look.cove, x + Math.sin(a) * (r + 0.32), 0.12, z + Math.cos(a) * (r + 0.32), segW, 0.06, 0.04, a);
    k.at(px, 0, pz, a, () => k.quad(atlasGlow(), 0xd0d0d0, 0, 1.17, 0.15, 0.34, 0.26, 0, R.videoPoker, -1.2));
    const sx = x + Math.sin(a) * (r + 0.9);
    const sz = z + Math.cos(a) * (r + 0.9);
    k.cyl(vcMat(0.3, 0.8), 0xc8ccd4, sx, 0.4, sz, 0.035, 0.05, 0.8, 8);
    k.cyl(vcMat(0.6), look.seat, sx, 0.82, sz, 0.22, 0.2, 0.1, 12);
    if (i % 3 === 1) ppl.seated.push({ x: sx, y: 0.15, z: sz, rot: a + Math.PI, shirt: GUEST_SHIRTS[i % GUEST_SHIRTS.length] });
  }
  // back-bar drum with bottles and the flamingo neon on top
  k.cyl(vcMat(0.4), 0x1a0e18, x, 1.1, z, 1.1, 1.2, 2.2, 20);
  for (let t = 0; t < 3; t++) {
    const y = 0.8 + t * 0.5;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      k.cyl(glowMat(), [0xff6ac0, 0x3ae8d8, 0xffd27a, 0xff8a4a, 0x8a5aff][(i + t) % 5], x + Math.sin(a) * 1.18, y + 0.15, z + Math.cos(a) * 1.18, 0.025, 0.04, 0.28, 6);
    }
    const ring = new THREE.TorusGeometry(1.2, 0.02, 4, 24);
    ring.rotateX(Math.PI / 2);
    k.add(ring, glowMat(), look.cove, x, y, z);
  }
  for (let q = 0; q < 3; q++) {
    const a = (q / 3) * Math.PI * 2;
    k.at(x, 0, z, a, () => k.quad(atlasGlow(), 0xffffff, 0, 3.3, 0.95, 1.7, 1.7, 0, R.flamingoNeon));
  }
  k.cyl(vcMat(0.4), 0x1a0e18, x, 3.3, z, 1.0, 1.0, 1.8, 3);
  k.cyl(vcMat(0.4), 0x1a0e18, x, 2.3, z, 0.25, 0.25, 0.4, 8);
  const halo = new THREE.RingGeometry(r - 0.4, r + 1.6, 32);
  halo.rotateX(-Math.PI / 2);
  k.add(halo, additiveMat(), 0x3a0a28, x, 0.05, z);
  ppl.standing.push({ x: x + 1.9, z: z + 0.5, rot: -Math.PI / 2, shirt: 0x101010, vest: 0xff4fb8 });
  ppl.standing.push({ x: x - 1.6, z: z - 1.2, rot: Math.PI * 0.75, shirt: 0x101010, vest: 0xff4fb8 });
  b.collider(x - r - 0.35, x + r + 0.35, z - 0.5, z + 0.5, 0, 1.15, true);
  b.collider(x - 0.5, x + 0.5, z - r - 0.35, z + r + 0.35, 0, 1.15, true);
  b.collider(x - r * 0.75, x + r * 0.75, z - r * 0.75, z + r * 0.75, 0, 1.15, true);
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(x, 0, z + r + 1.4), radius: 2.4, label: 'Flamingo Bird Bar' });
  // wall neon flamingos
  for (const [wx, wz, ry] of [
    [s.minX + 0.72, (s.minZ + s.maxZ) / 2 - 12, Math.PI / 2],
    [s.maxX - 0.72, (s.minZ + s.maxZ) / 2 + 12, -Math.PI / 2],
    [s.maxX - 0.72, (s.minZ + s.maxZ) / 2 - 12, -Math.PI / 2],
  ] as Array<[number, number, number]>) k.at(wx, 0, wz, ry, () => k.quad(atlasGlow(), 0xffffff, 0, 5.2, 0.05, 2.8, 2.8, 0, R.flamingoNeon));
}

function horseshoeRoom(b: WorldBuilder, s: CasinoSpec, k: Kit, look: Look, ppl: PeopleLists): void {
  const pr = s.interior?.pokerRoom;
  const sign = (x: number, z: number, ry: number) => k.at(x, 0, z, ry, () => k.quad(atlasGlow(), 0xffffff, 0, 6.2, 0.05, 4.4, 2.6, 0, R.horseshoe));
  sign(s.maxX - 0.7, (s.minZ + s.maxZ) / 2 + 9, -Math.PI / 2);
  sign((s.minX + s.maxX) / 2 + 6, s.minZ + 0.7, 0);
  if (!pr) return;
  const [x0, x1, z0, z1] = pr;
  const tl: TableLook = { ...look, felt: 0x0f4a2a, rail: 0x0a0a0a };
  const n = Math.max(1, Math.floor((x1 - x0) / 6.5));
  for (let i = 0; i < n; i++) {
    const tx = x0 + (x1 - x0) * ((i + 0.5) / n);
    const tz = (z0 + z1) / 2 + 0.4;
    pokerTable(k, tx, tz, 0, tl, ppl, i * 7);
    b.collider(tx - 1.5, tx + 1.5, tz - 0.85, tz + 0.85, 0, 0.95);
  }
  // glass partition with a gap toward the floor + WSOP signs
  const cz = z0 + 0.1;
  k.box(glassMat(), 0xffffff, (x0 + x1) / 2 - 1.5, 1.2, cz, x1 - x0 - 3, 2.4, 0.05);
  k.box(vcMat(0.3, 0.8), look.trim, (x0 + x1) / 2 - 1.5, 2.42, cz, x1 - x0 - 3, 0.06, 0.08);
  k.box(vcMat(0.6), 0x5a0a10, (x0 + x1) / 2 - 1.5, 0.15, cz, x1 - x0 - 3, 0.3, 0.12);
  hangingSign(k, R.wsop, (x0 + x1) / 2, 4.3, cz, 5.0, 1.1, 0, s.height - 1.6, look.trim);
  k.sign(R.pokerRoom, x1 - 1.4, 3.0, cz, 2.4, 0.7, 0, 0x1a0204);
  const carpet = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  carpet.rotateX(-Math.PI / 2);
  k.add(carpet, vcMat(0.95), 0x2a0608, (x0 + x1) / 2, 0.04, (z0 + z1) / 2);
}

function slotsAFunSet(b: WorldBuilder, s: CasinoSpec, k: Kit, look: Look): void {
  const g = s.interior?.giantSlot;
  if (g) {
    const [x, z, ry] = g;
    k.at(x, 0, z, ry, () => {
      k.box(vcMat(0.35, 0.3), 0xc8141e, 0, 1.0, 0, 2.6, 2.0, 0.9);
      k.box(vcMat(0.35, 0.3), 0xc8141e, 0, 2.55, -0.1, 2.6, 1.1, 0.7);
      k.box(vcMat(0.2, 0.9), 0xd8dce2, 0, 2.02, 0.05, 2.7, 0.1, 1.0);
      k.box(vcMat(0.2, 0.9), 0xd8dce2, 0, 3.12, -0.1, 2.7, 0.08, 0.8);
      k.quad(atlasGlow(), 0xffffff, 0, 2.55, 0.26, 2.2, 0.9, 0, R.giantReels);
      k.quad(atlasGlow(), 0xffffff, 0, 1.2, 0.46, 2.3, 0.7, 0, R.freePull);
      k.box(vcMat(0.4), 0x1a1a1a, 0, 3.45, -0.15, 2.4, 0.6, 0.5);
      k.quad(atlasGlow(), 0xffffff, 0, 3.45, 0.11, 2.3, 0.55, 0, R.looseSlots);
      // the pull handle
      k.cyl(vcMat(0.2, 0.9), 0xd8dce2, 1.45, 2.0, 0, 0.12, 0.12, 0.3, 10, 0, 0, Math.PI / 2);
      k.cyl(vcMat(0.2, 0.9), 0xd8dce2, 1.62, 2.7, 0, 0.05, 0.05, 1.4, 8);
      k.add(new THREE.SphereGeometry(0.2, 12, 8), vcMat(0.3), 0xe0101a, 1.62, 3.45, 0);
      for (let i = 0; i < 14; i++) k.add(new THREE.SphereGeometry(0.05, 6, 4), glowMat(), i % 2 ? 0xffe08a : 0xffffff, -1.25 + (i / 13) * 2.5, 3.08, 0.27);
    });
    const turned = Math.abs(Math.sin(ry)) > 0.5;
    b.collider(x - (turned ? 0.5 : 1.35), x + (turned ? 0.5 : 1.35), z - (turned ? 1.35 : 0.5), z + (turned ? 1.35 : 0.5), 0, 3.2, true);
  }
  // cheap bright signs + pennant strings under the drop ceiling
  const cy = s.interior?.ceilingY ?? 4.2;
  const midX = (s.minX + s.maxX) / 2;
  const midZ = (s.minZ + s.maxZ) / 2;
  k.sign(R.looseSlots, midX - 3, cy - 0.7, midZ - 0.5, 3.0, 0.88, Math.PI / 2, 0xffe000);
  k.sign(R.hotdogs, s.maxX - 3.1, 3.45, s.minZ + 1.0, 2.4, 0.45, 0, 0xffe000);
  k.sign(R.freePull, midX + 4, cy - 0.7, midZ - 0.5, 2.4, 0.84, Math.PI / 2, 0xd80010);
  const pc = [0xff2a2a, 0xffd23a, 0x2a7aff, 0x3aff6a, 0xffffff];
  for (const z of [midZ - 3.6, midZ + 3.6]) {
    for (let x = s.minX + 1; x < s.maxX - 1; x += 0.55) {
      const tri = new THREE.ConeGeometry(0.16, 0.32, 3);
      tri.rotateX(Math.PI);
      k.add(tri, glowMat(), pc[Math.floor(Math.abs(x) * 1.8) % pc.length], x, cy - 0.35 - Math.sin(((x - s.minX) / (s.maxX - s.minX)) * Math.PI * 3) * 0.1, z);
    }
    k.box(vcMat(0.8), 0x222222, (s.minX + s.maxX) / 2, cy - 0.2, z, s.maxX - s.minX - 2, 0.02, 0.02);
  }
  // Lou's machine
  k.sign(R.reserved, s.minX + 6.4, 2.75, s.maxZ - 2.1, 1.6, 0.24, 0, 0x14060a, 0xffffff, 0.04);
  void look;
}
