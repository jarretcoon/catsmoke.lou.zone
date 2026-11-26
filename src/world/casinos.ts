import * as THREE from 'three';
import type { GameType, WorldBuilder } from './builder';
import { makeCarpetTexture } from './textures';
import { basic, mat, mesh } from './props';
import { furnishCasino, type InteriorOptions, type InteriorTheme } from './casinoInteriors';

export type { InteriorOptions, InteriorTheme } from './casinoInteriors';

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
  /**
   * Interior look (optional). Every floor gets the furnished kit (modern slot banks and carousels,
   * dealt tables with dealers and players, coffered ceiling with can lights and chandeliers, cashier,
   * bar, sportsbook, high-limit room, columns, wayfinding). A theme swaps in a property's own look.
   */
  theme?: InteriorTheme;
  interior?: InteriorOptions;
}

// Shared doorway materials (one per look, so every casino's doors merge per map cell)
let doorMats: { glass: THREE.MeshStandardMaterial; curtain: THREE.MeshBasicMaterial } | null = null;
function doorMaterials(): { glass: THREE.MeshStandardMaterial; curtain: THREE.MeshBasicMaterial } {
  if (doorMats) return doorMats;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,210,150,0.0)');
  g.addColorStop(0.6, 'rgba(255,200,140,0.03)');
  g.addColorStop(1, 'rgba(255,214,160,0.13)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  doorMats = {
    glass: new THREE.MeshStandardMaterial({ color: 0xbfdcea, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    curtain: new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  return doorMats;
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
  const brass = mat(0xd4a640, 0.3, 0.85);
  const runnerRed = mat(0x7a0f1a, 0.95);
  const dm = doorMaterials();
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
      // Walls cast shadows now, so the desert sun no longer shines straight through onto the slots
      if (along === 'z') b.box(fixed, 0, mid, t, s.height, len, wallMat, true, true);
      else b.box(mid, 0, fixed, len, s.height, t, wallMat, true, true);
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
          ? mesh(new THREE.BoxGeometry(t, s.height - lintelY, len), wallMat, fixed, lintelY + (s.height - lintelY) / 2, mid, true)
          : mesh(new THREE.BoxGeometry(len, s.height - lintelY, t), wallMat, mid, lintelY + (s.height - lintelY) / 2, fixed, true);
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
      const canopy = mat(0x1c1a20, 0.4, 0.6);
      const under = basic(0xfff0c8);
      // Doorway dressing: glass doors swung open against the jambs, a warm air-curtain glow in the
      // opening and a red carpet runner with brass edges out onto the sidewalk.
      const P = (u: number, n: number, y: number, ww: number, hh: number, dd: number, material: THREE.Material) =>
        along === 'z' ? mesh(new THREE.BoxGeometry(dd, hh, ww), material, fixed + out * n, y, u) : mesh(new THREE.BoxGeometry(ww, hh, dd), material, u, y, fixed + out * n);
      const leaf = Math.min(1.5, len / 4);
      for (const sgn of [-1, 1]) {
        const edge = sgn < 0 ? g0 : g1;
        for (const k of [0, 1]) {
          const u = edge - sgn * 0.12;
          const n = t / 2 + 0.1 + leaf / 2 + k * 0.02;
          // a door leaf opened 90° outward, flat against the facade beside the jamb
          b.add(along === 'z' ? mesh(new THREE.BoxGeometry(leaf, 3.6, 0.05), dm.glass, fixed + out * n, 1.85, u + sgn * (0.05 + k * 0.08)) : mesh(new THREE.BoxGeometry(0.05, 3.6, leaf), dm.glass, u + sgn * (0.05 + k * 0.08), 1.85, fixed + out * n));
          b.add(along === 'z' ? mesh(new THREE.BoxGeometry(leaf, 0.08, 0.07), brass, fixed + out * n, 1.0, u + sgn * (0.05 + k * 0.08)) : mesh(new THREE.BoxGeometry(0.07, 0.08, leaf), brass, u + sgn * (0.05 + k * 0.08), 1.0, fixed + out * n));
        }
        b.add(P(edge, 0, 2.1, 0.16, 4.2, t + 0.12, brass));
      }
      const curtain = along === 'z' ? mesh(new THREE.PlaneGeometry(len, lintelY), dm.curtain, fixed + out * 0.05, lintelY / 2, mid) : mesh(new THREE.PlaneGeometry(len, lintelY), dm.curtain, mid, lintelY / 2, fixed + out * 0.05);
      if (along === 'z') curtain.rotation.y = Math.PI / 2;
      b.add(curtain);
      const runLen = 6;
      const rw = Math.min(len - 1.2, 3.6);
      b.add(P(mid, t / 2 + runLen / 2 - 0.4, 0.045, rw, 0.03, runLen + 1.4, runnerRed));
      for (const sgn of [-1, 1]) b.add(P(mid + sgn * (rw / 2 + 0.06), t / 2 + runLen / 2 - 0.4, 0.05, 0.12, 0.035, runLen + 1.4, brass));
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

  // Ceiling slab (walkable roof). It casts a shadow so the floor is lit by the casino, not the sun.
  const ceilMat = mat(s.ceiling, 0.8, 0, s.ceilingGlow ? { emissive: s.ceilingGlow, emissiveIntensity: 0.35 } : {});
  b.box(cx, s.height, cz, w, 0.8, d, ceilMat, false, true);

  b.light(s.light, 26, Math.max(w, d) * 0.9, cx, s.height - 1.4, cz, 0.85);

  // Slot rows: the cabinets themselves are instanced by the interior kit; one collider per row here.
  let first: THREE.Vector3 | null = null;
  for (const row of s.slots.rows) {
    const half = ((row.count - 1) / 2) * 1.1 + 0.55;
    if (row.along === 'x') b.collider(row.x - half, row.x + half, row.z - 0.5, row.z + 0.5, 0, 1.75, true);
    else b.collider(row.x - 0.5, row.x + 0.5, row.z - half, row.z + half, 0, 1.75, true);
    if (!first && row.count > 0) {
      const off = (-(row.count - 1) / 2) * 1.1;
      const x = row.along === 'x' ? row.x + off : row.x;
      const z = row.along === 'z' ? row.z + off : row.z;
      first = new THREE.Vector3(x + Math.sin(row.facing) * 1.6, 0, z + Math.cos(row.facing) * 1.6);
    }
  }
  if (first) {
    b.gamblingSpots.push({ id: `${s.id}-slots`, casinoName: s.casinoName, gameType: 'slots', position: first, label: s.slotLabel });
  }

  // Tables (drawn by the interior kit with felts, dealers and players)
  s.tables.forEach((tb, i) => {
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

  furnishCasino(b, s);
}
