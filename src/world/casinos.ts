import * as THREE from 'three';
import type { GameType, WorldBuilder } from './builder';
import { makeCarpetTexture } from './textures';
import { basic, blackjackTable, crapsTable, mat, mesh, rouletteTable, slotMachine } from './props';

export interface CasinoTable {
  game: Exclude<GameType, 'slots'>;
  x: number;
  z: number;
  rot?: number;
  label: string;
  vipOnly?: boolean;
}

export interface CasinoSpec {
  id: string;
  casinoName: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  /** Which wall faces the Strip / gets the doors, and where along it the doorway is centered. */
  entrance: { side: 'east' | 'west' | 'north' | 'south'; at: number; width: number };
  /** Extra doorways (e.g. corner entrances). */
  extraEntrances?: Array<{ side: 'east' | 'west' | 'north' | 'south'; at: number; width: number }>;
  carpet: [string, string, string?];
  wall: number;
  ceiling: number;
  ceilingGlow?: number;
  light: number;
  slots: { accent: string; topper: number; rows: Array<{ x: number; z: number; count: number; along: 'x' | 'z'; facing: number }> };
  slotLabel: string;
  tables: CasinoTable[];
  felt: number;
  guard?: { kick: [number, number] };
  pickups: Array<{ x: number; z: number; y?: number; amount: number; label: string }>;
  tourists?: Array<{ pts: Array<[number, number]>; prop: 'cig' | 'yard-drink' | 'bag' | 'camera' }>;
}

/** Builds a walk-in casino floor and registers games, guard patrol, pickups and NPC routes. */
export function buildCasinoFloor(b: WorldBuilder, s: CasinoSpec): void {
  const w = s.maxX - s.minX;
  const d = s.maxZ - s.minZ;
  const cx = (s.minX + s.maxX) / 2;
  const cz = (s.minZ + s.maxZ) / 2;

  const carpet = new THREE.MeshStandardMaterial({ map: makeCarpetTexture(s.carpet[0], s.carpet[1], s.carpet[2]), roughness: 0.9 });
  carpet.map!.repeat.set(w / 3.2, d / 3.2);
  b.floor(cx, cz, w, d, carpet, 0.03);

  const wallMat = mat(s.wall, 0.75);
  const wallC = new THREE.Color(s.wall);
  const pilaster = mat(wallC.clone().lerp(new THREE.Color(0xffffff), 0.25).getHex(), 0.6, 0.1);
  const cornice = mat(wallC.clone().lerp(new THREE.Color(0xffffff), 0.4).getHex(), 0.55, 0.15);
  const accent = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: s.light, emissiveIntensity: 0.1, roughness: 0.4 });
  b.nightGlow(accent, 0.1, 2.2);
  const t = 1.2; // wall thickness
  const entrances = [s.entrance, ...(s.extraEntrances ?? [])];
  const wallSide = (side: 'east' | 'west' | 'north' | 'south') => {
    const along = side === 'east' || side === 'west' ? 'z' : 'x';
    const lo = along === 'z' ? s.minZ : s.minX;
    const hi = along === 'z' ? s.maxZ : s.maxX;
    const fixed = side === 'east' ? s.maxX : side === 'west' ? s.minX : side === 'north' ? s.minZ : s.maxZ;
    const gaps = entrances.filter((e) => e.side === side).map((e) => [e.at - e.width / 2, e.at + e.width / 2] as const).sort((a, c) => a[0] - c[0]);
    let cursor = lo;
    const segs: Array<[number, number]> = [];
    for (const [g0, g1] of gaps) {
      if (g0 > cursor) segs.push([cursor, g0]);
      cursor = Math.max(cursor, g1);
    }
    if (cursor < hi) segs.push([cursor, hi]);
    const out = side === 'east' || side === 'south' ? 1 : -1;
    for (const [a, c] of segs) {
      const len = c - a;
      const mid = (a + c) / 2;
      if (along === 'z') b.box(fixed, 0, mid, t, s.height, len, wallMat, true, false);
      else b.box(mid, 0, fixed, len, s.height, t, wallMat, true, false);
      // Pilasters on the outside face
      for (let u = a + 1.2; u < c - 0.6; u += 4.5) {
        if (along === 'z') b.add(mesh(new THREE.BoxGeometry(0.4, s.height, 0.7), pilaster, fixed + out * (t / 2 + 0.2), s.height / 2, u));
        else b.add(mesh(new THREE.BoxGeometry(0.7, s.height, 0.4), pilaster, u, s.height / 2, fixed + out * (t / 2 + 0.2)));
      }
    }
    // Cornice + glowing accent strip across the whole side
    const full = hi - lo;
    const mid2 = (lo + hi) / 2;
    if (along === 'z') {
      b.add(mesh(new THREE.BoxGeometry(t + 1, 0.8, full + 1), cornice, fixed + out * 0.25, s.height - 0.4, mid2));
      b.add(mesh(new THREE.BoxGeometry(t + 1.05, 0.22, full + 1), accent, fixed + out * 0.25, s.height - 1.0, mid2));
    } else {
      b.add(mesh(new THREE.BoxGeometry(full + 1, 0.8, t + 1), cornice, mid2, s.height - 0.4, fixed + out * 0.25));
      b.add(mesh(new THREE.BoxGeometry(full + 1, 0.22, t + 1.05), accent, mid2, s.height - 1.0, fixed + out * 0.25));
    }
    // Lintel over each doorway so the facade reads as one building
    for (const [g0, g1] of gaps) {
      const len = g1 - g0;
      const mid = (g0 + g1) / 2;
      const lintelY = 4.2;
      const m =
        along === 'z'
          ? mesh(new THREE.BoxGeometry(t, s.height - lintelY, len), wallMat, fixed, lintelY + (s.height - lintelY) / 2, mid)
          : mesh(new THREE.BoxGeometry(len, s.height - lintelY, t), wallMat, mid, lintelY + (s.height - lintelY) / 2, fixed);
      b.add(m);
      b.collider(
        along === 'z' ? fixed - t / 2 : g0,
        along === 'z' ? fixed + t / 2 : g1,
        along === 'z' ? g0 : fixed - t / 2,
        along === 'z' ? g1 : fixed + t / 2,
        lintelY,
        s.height,
        true
      );
      // Glowing door frame + a marquee canopy with a lit underside, like every Strip entrance
      const frame = basic(0xffd27a);
      const out = side === 'east' || side === 'south' ? 1 : -1;
      const canopy = mat(0x1c1a20, 0.4, 0.6);
      const under = basic(0xfff0c8);
      if (along === 'z') {
        b.add(mesh(new THREE.BoxGeometry(t + 0.1, 0.18, len), frame, fixed, lintelY, mid));
        b.add(mesh(new THREE.BoxGeometry(4.5, 0.45, len + 4), canopy, fixed + out * 2.6, lintelY + 0.5, mid, true));
        b.add(mesh(new THREE.BoxGeometry(4.2, 0.05, len + 3.6), under, fixed + out * 2.6, lintelY + 0.25, mid));
        b.add(mesh(new THREE.BoxGeometry(0.12, 0.6, len + 4.1), basic(0xffc040), fixed + out * 4.86, lintelY + 0.5, mid));
      } else {
        b.add(mesh(new THREE.BoxGeometry(len, 0.18, t + 0.1), frame, mid, lintelY, fixed));
        b.add(mesh(new THREE.BoxGeometry(len + 4, 0.45, 4.5), canopy, mid, lintelY + 0.5, fixed + out * 2.6, true));
        b.add(mesh(new THREE.BoxGeometry(len + 3.6, 0.05, 4.2), under, mid, lintelY + 0.25, fixed + out * 2.6));
        b.add(mesh(new THREE.BoxGeometry(len + 4.1, 0.6, 0.12), basic(0xffc040), mid, lintelY + 0.5, fixed + out * 4.86));
      }
    }
  };
  (['east', 'west', 'north', 'south'] as const).forEach(wallSide);

  // Ceiling slab (walkable roof) + recessed glow panels
  const ceilMat = mat(s.ceiling, 0.8, 0, s.ceilingGlow ? { emissive: s.ceilingGlow, emissiveIntensity: 0.35 } : {});
  b.box(cx, s.height, cz, w, 0.8, d, ceilMat, false, false);
  const panel = basic(0xfff1cf);
  for (let x = s.minX + 5; x < s.maxX - 3; x += 7) {
    for (let z = s.minZ + 5; z < s.maxZ - 3; z += 7) {
      const p = mesh(new THREE.PlaneGeometry(2.4, 2.4), panel, x, s.height - 0.02, z);
      p.rotation.x = Math.PI / 2;
      b.add(p);
    }
  }

  b.light(s.light, 26, Math.max(w, d) * 0.9, cx, s.height - 1.4, cz, 0.85);

  // Slot banks
  let first: THREE.Vector3 | null = null;
  for (const row of s.slots.rows) {
    for (let i = 0; i < row.count; i++) {
      const off = (i - (row.count - 1) / 2) * 1.1;
      const x = row.along === 'x' ? row.x + off : row.x;
      const z = row.along === 'z' ? row.z + off : row.z;
      const sm = slotMachine(s.slots.accent, s.slots.topper);
      b.add(sm, x, 0, z, row.facing);
      b.collider(x - 0.55, x + 0.55, z - 0.5, z + 0.5, 0, 1.75, true);
      if (!first) first = new THREE.Vector3(x + Math.sin(row.facing) * 1.6, 0, z + Math.cos(row.facing) * 1.6);
    }
  }
  if (first) {
    b.gamblingSpots.push({ id: `${s.id}-slots`, casinoName: s.casinoName, gameType: 'slots', position: first, label: s.slotLabel });
  }

  // Tables
  s.tables.forEach((tb, i) => {
    const felt = tb.vipOnly ? 0x1b2a6b : s.felt;
    const g = tb.game === 'roulette' ? rouletteTable(felt) : tb.game === 'blackjack' ? blackjackTable(felt) : crapsTable(felt);
    b.add(g, tb.x, 0, tb.z, tb.rot ?? 0);
    const hw = tb.game === 'craps' ? 2.4 : tb.game === 'roulette' ? 1.9 : 1.9;
    const hd = tb.game === 'craps' ? 1.1 : tb.game === 'roulette' ? 0.95 : 1.0;
    const rotated = Math.abs(Math.sin(tb.rot ?? 0)) > 0.5;
    const ex = rotated ? hd : hw;
    const ez = rotated ? hw : hd;
    b.collider(tb.x - ex, tb.x + ex, tb.z - ez, tb.z + ez, 0, 1.1);
    b.gamblingSpots.push({
      id: `${s.id}-${tb.game}-${i}`,
      casinoName: s.casinoName,
      gameType: tb.game,
      position: new THREE.Vector3(tb.x, 0, tb.z),
      label: tb.label,
      vipOnly: tb.vipOnly,
    });
  });

  for (const p of s.pickups) b.pickup(p.x, p.y ?? 0.45, p.z, p.amount, p.label, true);

  b.zone(`${s.casinoName} Casino`, s.minX, s.maxX, s.minZ, s.maxZ);
  if (s.guard) {
    const m = 3;
    b.crowd.guards.push({
      name: s.casinoName,
      pts: [
        [s.minX + m, s.minZ + m],
        [s.maxX - m, s.minZ + m],
        [s.maxX - m, s.maxZ - m],
        [s.minX + m, s.maxZ - m],
      ],
      kick: s.guard.kick,
      zone: { minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ },
    });
  }
  for (const tr of s.tourists ?? []) b.crowd.tourists.push(tr);
}
