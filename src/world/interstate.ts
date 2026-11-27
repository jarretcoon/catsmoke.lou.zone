import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { basic, mat } from './props';
import { L0, L1, Merger, v3 } from './southKit';
import { buildInstancedTraffic, flatRoad, freewayGantrySign, lightPoolMat, roadStripMat, type TrafficLane } from './westKit';
import { deckTop, easedProfile, pathFrom, smoothPath, sweepBox, sweptMat, type PathPt } from './bridgeKit';

/**
 * Interstate 15 (I-15) and its Las Vegas Resort Corridor interchanges:
 * - I-15 NB & SB mainlines (x = -213 .. -173, z = -860 .. +920), center Jersey barrier,
 *   high-mast sodium freeway lighting, ribbed desert-concrete sound walls, overhead gantries.
 * - Tropicana Ave / I-15 Interchange (2025/2026 layout): widened Tropicana bridge
 *   over Frank Sinatra Dr & I-15 (-114 -> -246), SB-to-EB flyover ramp, on/off ramps.
 * - Harmon Ave & Flamingo Rd walkable overpass bridges crossing I-15 to Dean Martin Dr.
 */

export const I15 = {
  eastWallX: -172.6,
  nbX: -182.5, // NB carriageway centerline (16m wide: -190.5 .. -174.5)
  medianX: -193.5,
  sbX: -204.5, // SB carriageway centerline (16m wide: -212.5 .. -196.5)
  westWallX: -213.8,
  tropZ: 442.7,
  harmonZ: 221.0,
  flamingoZ: 0.0,
};

/**
 * Bridge spans: [eBase, eSpan, wSpan, wBase, deck height]. The deck is flat from eSpan to wSpan and eases
 * down to grade at the two abutments.
 * Tropicana (real, from OSM): the structure starts just east of Frank Sinatra Dr and lands just past
 * Joey Bishop Dr, ~115 real m short of Dean Martin Dr; Frank Sinatra Dr, I-15 and Joey Bishop Dr all pass
 * underneath. The deck is low enough to stay drivable at the game's compressed scale (6.6 m).
 */
const TROP_SPAN = [-114, -146, -211, -238, 6.6] as const;
const HARMON_SPAN = [-148, -171, -236, -260, 6.8] as const;
const FLAMINGO_SPAN = [-148, -171, -217, -239, 6.8] as const;
const spanY = (s: readonly [number, number, number, number, number]) => (x: number) => easedProfile(x, s[0], s[1], s[2], s[3], s[4]);

export const tropicanaY = spanY(TROP_SPAN);
export const harmonY = spanY(HARMON_SPAN);
export const flamingoY = spanY(FLAMINGO_SPAN);

export function buildInterstate(b: WorldBuilder): void {
  const mg = new Merger();
  buildMainline(b, mg);
  buildSoundWalls(b, mg);
  buildOverpassesAndRamps(b, mg);
  buildOverheadSigns(b, mg);
  mg.flush(b);
  buildFreewayTraffic(b);
}

// ================================================================ I-15 Mainline

function buildMainline(b: WorldBuilder, mg: Merger): void {
  const zMin = -860;
  const zMax = 920;
  const len = zMax - zMin;
  const zMid = (zMin + zMax) / 2;

  // Compacted desert highway bed under entire I-15 ROW
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(46, len), mat(0x6e685c, 0.94));
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(I15.medianX, L0 - 0.004, zMid);
  bed.receiveShadow = true;
  b.add(bed);

  // 5-lane NB & 5-lane SB freeway carriageways (yellow median line -> false on 2-way so dashed white)
  flatRoad(b, I15.nbX, zMid, 16, len, 'z', 5, false, L1, 'I-15 NB');
  flatRoad(b, I15.sbX, zMid, 16, len, 'z', 5, false, L1, 'I-15 SB');
  b.feature({ kind: 'road', x: I15.medianX, z: zMid, w: 41, d: len, color: '#3b3a40', label: 'I-15' });
  b.zone('I-15 Freeway', I15.westWallX + 0.5, I15.eastWallX - 0.5, -25, 545);

  // Center concrete Jersey median barrier + yellow edge stripes
  const concrete = mat(0xb2aba0, 0.88);
  const yellow = mat(0xd8a632, 0.7);
  mg.box(concrete, I15.medianX, 0.55, zMid, 1.4, 1.1, len, 0, false);
  mg.box(yellow, I15.medianX - 2.4, L1 + 0.008, zMid, 0.25, 0.01, len);
  mg.box(yellow, I15.medianX + 2.4, L1 + 0.008, zMid, 0.25, 0.01, len);
  b.collider(I15.medianX - 0.8, I15.medianX + 0.8, zMin, zMax, 0, 1.1, true);

  // Median high-mast sodium freeway light poles + road glow pools (-600 .. +700)
  const steel = mat(0x60666e, 0.45, 0.72);
  const sodiumBulb = basic(0xffc97a);
  const poolMat = lightPoolMat(true);
  const pools = new Merger();
  for (let z = -600; z <= 700; z += 42) {
    mg.beam(steel, v3(I15.medianX, 1.0, z), v3(I15.medianX, 14.5, z), 0.16, 6, 0.1);
    for (const dir of [-1, 1]) {
      mg.beam(steel, v3(I15.medianX, 14.2, z), v3(I15.medianX + dir * 4.2, 15.0, z), 0.08, 5, 0.06);
      mg.box(sodiumBulb, I15.medianX + dir * 4.2, 14.9, z, 0.7, 0.16, 0.4);
    }
    if (z >= -80 && z <= 600) {
      for (const lx of [I15.nbX, I15.sbX]) {
        const p = new THREE.PlaneGeometry(15, 16);
        p.rotateX(-Math.PI / 2);
        p.translate(lx, L1 + 0.015, z);
        pools.add(p, poolMat);
      }
    }
  }
  pools.flush(b);
}

// ================================================================ Ribbed Concrete Sound Walls

function buildSoundWalls(b: WorldBuilder, mg: Merger): void {
  const wallMat = mat(0xb5a68e, 0.9);
  const capMat = mat(0x9b8b72, 0.9);

  const wallRun = (x: number, z0: number, z1: number) => {
    const len = z1 - z0;
    if (len < 1) return;
    const zc = (z0 + z1) / 2;
    mg.box(wallMat, x, 2.1, zc, 0.5, 4.2, len, 0, true);
    for (let z = z0 + 3; z < z1 - 1; z += 9) mg.box(capMat, x, 2.2, z, 0.72, 4.4, 0.55);
    b.collider(x - 0.35, x + 0.35, z0, z1, 0, 4.4, true);
  };

  // East wall south of backOfHouse (z = 352..424 before Tropicana ramp/bridge, and south 478..880)
  wallRun(I15.eastWallX, 353, 424);
  wallRun(I15.eastWallX, 478, 880);

  // West wall separating I-15 from Dean Martin / Joey Bishop (gapped cleanly at Flamingo, Harmon, Tropicana interchanges)
  wallRun(I15.westWallX, -620, -18);
  wallRun(I15.westWallX, 72, 210);
  wallRun(I15.westWallX, 232, 392);
  wallRun(I15.westWallX, 498, 880);
}

// ================================================================ Bridges & Tropicana Ramps

/** Below this deck height an approach sits on a solid retained fill; above it, it's an open slab on piers. */
const FILL_H = 3.0;
/** Pier lines that stay clear of every travel lane: Frank Sinatra's west curb, the I-15 median, Joey Bishop's east curb. */
const PIER_XS = [-157.2, -172.6, -193.5, -214.6];

function buildBridge(b: WorldBuilder, mg: Merger, zCenter: number, wTotal: number, lanes: number, span: readonly [number, number, number, number, number], name: string): void {
  const [eBase, eSpan, wSpan, wBase, deckH] = span;
  const prof = spanY(span);
  const halfW = wTotal / 2;
  const roadHalf = halfW - 2.2;
  const concrete = sweptMat(0xb3ada2, 0.88);
  const fascia = sweptMat(0xc9c3b6, 0.82);
  const walkMat = sweptMat(0xbdb6a8, 0.86);
  const fillMat = sweptMat(0xc2b296, 0.92);
  const railMat = sweptMat(0x59606a, 0.45, 0.7);

  // Centreline every metre from the east abutment to the west one.
  const pts: THREE.Vector3[] = [];
  for (let x = eBase; x > wBase; x -= 1) pts.push(new THREE.Vector3(x, prof(x), zCenter));
  pts.push(new THREE.Vector3(wBase, 0, zCenter));
  const path: PathPt[] = pathFrom(pts);

  // Road surface: one continuous strip with the lane texture, no seams between ramp and span.
  const road = new THREE.Mesh(deckTop(path, roadHalf, 0.035), roadStripMat(lanes, eBase - wBase, true));
  road.receiveShadow = true;
  b.add(road);
  // Deck slab (1.2 m), sidewalks with a curb, a concrete parapet with a steel rail on top.
  for (const g of sweepBox(path, -halfW, halfW, -1.2, 0, { top: false, bottom: true })) mg.add(g, concrete, true);
  for (const s of [-1, 1]) {
    const l0 = s * roadHalf;
    const l1 = s * (halfW - 0.32);
    for (const g of sweepBox(path, Math.min(l0, l1), Math.max(l0, l1), 0, 0.17)) mg.add(g, walkMat);
    const p0 = s * (halfW - 0.32);
    const p1 = s * halfW;
    for (const g of sweepBox(path, Math.min(p0, p1), Math.max(p0, p1), -1.2, 0.82)) mg.add(g, fascia, true);
    for (const g of sweepBox(path, Math.min(p0, p1) + 0.08, Math.max(p0, p1) - 0.08, 1.02, 1.12)) mg.add(g, railMat);
    for (let x = eSpan; x >= wSpan; x -= 3) mg.box(railMat, x, deckH + 0.92, zCenter + s * (halfW - 0.16), 0.08, 0.22, 0.08);
  }
  // Retained fill under the low ends of both approaches (MSE panel walls), open underneath elsewhere.
  for (const [a, c] of [
    [eBase, eSpan],
    [wSpan, wBase],
  ]) {
    const seg = path.filter((q) => q.p.x <= Math.max(a, c) && q.p.x >= Math.min(a, c) && q.p.y <= FILL_H + 0.5 && q.p.y > 0.05);
    if (seg.length < 2) continue;
    for (const g of sweepBox(seg, -halfW + 0.05, halfW - 0.05, (q) => -q.p.y, -1.2, { top: false })) mg.add(g, fillMat, true);
    for (let i = 0; i < seg.length; i += 3) {
      const q = seg[i];
      for (const s of [-1, 1]) mg.box(sweptMat(0xb4a487, 0.92), q.p.x, q.p.y / 2 - 0.6, zCenter + s * (halfW - 0.02), 0.06, Math.max(0.1, q.p.y - 1.2), 0.06);
    }
  }
  // Hammerhead piers on lane-free lines only.
  for (const px of PIER_XS) {
    const y = prof(px);
    if (y < FILL_H) continue;
    for (const pz of [zCenter - halfW * 0.5, zCenter + halfW * 0.5]) {
      mg.beam(concrete, v3(px, 0, pz), v3(px, y - 2.0, pz), 0.62, 12, 0.62, true);
      b.collider(px - 0.65, px + 0.65, pz - 0.65, pz + 0.65, 0, y - 1.3, true);
    }
    mg.box(concrete, px, y - 1.65, zCenter, 1.5, 0.9, wTotal - 1.4, 0, true);
  }

  // Colliders, one per metre: the deck is a walkable slab (solid down to the ground only over the fills,
  // so cars and the cat can pass underneath), with parapet walls on both edges.
  for (let i = 0; i < path.length - 1; i++) {
    const x1 = path[i].p.x;
    const x0 = path[i + 1].p.x;
    const top = Math.max(path[i].p.y, path[i + 1].p.y);
    if (top < 0.05) continue;
    b.collider(x0, x1, zCenter - halfW, zCenter + halfW, top < FILL_H ? 0 : top - 1.2, top, false).ramp = true;
    b.collider(x0, x1, zCenter - halfW - 0.05, zCenter - halfW + 0.32, top, top + 1.15, true);
    b.collider(x0, x1, zCenter + halfW - 0.32, zCenter + halfW + 0.05, top, top + 1.15, true);
  }

  // Bridge light poles on the north parapet.
  const brPole = mat(0x565a62, 0.45, 0.72);
  const brBulb = basic(0xffe09c);
  for (let x = wSpan + 6; x <= eSpan - 6; x += 22) {
    const pz = zCenter - halfW + 0.16;
    mg.beam(brPole, v3(x, deckH + 0.82, pz), v3(x, deckH + 7.4, pz), 0.09, 6, 0.06);
    mg.beam(brPole, v3(x, deckH + 7.2, pz), v3(x, deckH + 7.6, pz + 2.0), 0.05, 5, 0.035);
    mg.box(brPole, x, deckH + 7.62, pz + 2.0, 0.5, 0.12, 0.28);
    mg.box(brBulb, x, deckH + 7.52, pz + 2.0, 0.36, 0.05, 0.18);
  }

  b.zone(name, wBase, eBase, zCenter - halfW, zCenter + halfW);
  b.feature({ kind: 'road', x: (eBase + wBase) / 2, z: zCenter, w: eBase - wBase, d: wTotal, color: '#45444c', label: name });
}

/**
 * The SB I-15 → EB Tropicana flyover (OSM layer 2): it climbs off the southbound lanes north of Tropicana,
 * crosses high over the Tropicana bridge, swings east south of it over I-15 and Frank Sinatra Dr, and comes
 * down onto eastbound Tropicana before New York-New York's drive. Piers stand only on lane-free spots.
 */
function buildFlyover(b: WorldBuilder, mg: Merger): void {
  const pts: Array<[number, number, number, boolean]> = [
    [-210.5, 0.03, 366, false],
    [-211.2, 1.6, 384, false],
    [-213.6, 4.6, 402, false],
    [-214.6, 8.2, 420, true],
    [-214.3, 11.6, 438, false],
    [-210.0, 13.0, 455, false],
    [-200.0, 13.0, 465, false],
    [-193.5, 12.6, 468.5, true],
    [-173.0, 11.0, 470, true],
    [-157.2, 8.8, 467.5, true],
    [-139.0, 5.6, 463, true],
    [-121.0, 2.6, 459.6, true],
    [-104.0, 0.03, 457.6, false],
  ];
  const path = smoothPath(
    pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    1.5
  );
  const concrete = sweptMat(0xaba59a, 0.86);
  const barrier = sweptMat(0xc8c1b4, 0.84);
  const half = 3.7;
  const road = new THREE.Mesh(deckTop(path, half - 0.45, 0.035), roadStripMat(2, 170, false));
  road.receiveShadow = true;
  b.add(road);
  for (const g of sweepBox(path, -half, half, -1.1, 0, { top: false, bottom: true })) mg.add(g, concrete, true);
  for (const s of [-1, 1]) {
    const a = s * (half - 0.45);
    const c = s * half;
    for (const g of sweepBox(path, Math.min(a, c), Math.max(a, c), -1.1, 0.9)) mg.add(g, barrier, true);
  }
  for (const [x, y, z, pier] of pts) {
    if (!pier) continue;
    mg.beam(concrete, v3(x, 0, z), v3(x, y - 1.9, z), 0.7, 12, 0.7, true);
    mg.box(concrete, x, y - 1.5, z, 2.2, 0.8, 2.2, 0, true);
    b.collider(x - 0.72, x + 0.72, z - 0.72, z + 0.72, 0, y - 1.1, true);
  }
  b.zone('I-15 SB → Tropicana EB Flyover', -216, -104, 455, 472);
}

function buildOverpassesAndRamps(b: WorldBuilder, mg: Merger): void {
  // 1. Tropicana Ave bridge (6 lanes + sidewalks) over Frank Sinatra Dr, I-15 and Joey Bishop Dr.
  buildBridge(b, mg, I15.tropZ, 21.0, 6, TROP_SPAN, 'Tropicana Ave Bridge (I-15)');
  // 2. The SB-to-EB flyover, high over the bridge.
  buildFlyover(b, mg);

  // 3. Flamingo Rd loop on/off ramps on the west side of I-15 (z = 12..72)
  const emitRampSlab = (ax: number, az: number, bx: number, bz: number, w: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    const me = new THREE.Mesh(new THREE.PlaneGeometry(w, len), roadStripMat(2, len, false));
    me.rotation.order = 'YXZ';
    me.rotation.y = yaw;
    me.rotation.x = -Math.PI / 2;
    me.position.set((ax + bx) / 2, L1 + 0.008, (az + bz) / 2);
    me.receiveShadow = true;
    b.add(me);
  };
  emitRampSlab(-212, 65, -228, 12, 6.4);
  emitRampSlab(-226, 22, -211, -18, 5.8);

  // 4. Harmon Ave bridge (z = 221) over Frank Sinatra Dr, I-15 and Dean Martin Dr.
  buildBridge(b, mg, I15.harmonZ, 13.5, 4, HARMON_SPAN, 'Harmon Ave Bridge (I-15)');
  // 5. Flamingo Rd bridge (z = 0) over Frank Sinatra Dr and I-15 to Dean Martin Dr.
  buildBridge(b, mg, I15.flamingoZ, 19.5, 6, FLAMINGO_SPAN, 'Flamingo Rd Bridge (I-15)');
}

// ================================================================ Overhead Green Freeway Gantries

function buildOverheadSigns(b: WorldBuilder, mg: Merger): void {
  // NB approaching Tropicana (facing south commuters heading north)
  freewayGantrySign(b, mg, I15.medianX, I15.eastWallX, 492, true, [
    { x: I15.nbX - 3.6, w: 7.4, lines: ['NORTH  LAS VEGAS BLVD', 'FLAMINGO • HARMON'], shield: 'I-15', arrow: 'down' },
    { x: I15.nbX + 4.4, w: 6.4, lines: ['EXIT 37', 'TROPICANA AVE', 'T-MOBILE ARENA'], arrow: 'right' },
  ]);
  // SB approaching Tropicana (facing north commuters heading south toward Stadium / LA)
  freewayGantrySign(b, mg, I15.westWallX, I15.medianX, 382, false, [
    { x: I15.sbX + 3.4, w: 7.2, lines: ['SOUTH  LOS ANGELES', 'RUSSELL RD • AIRPORT'], shield: 'I-15', arrow: 'down' },
    { x: I15.sbX - 4.2, w: 6.6, lines: ['EXIT 37  TROPICANA AVE', 'LAS VEGAS STRIP • DEAN MARTIN DR'], arrow: 'left' },
  ]);
  // Harmon gantry facing north (SB) & south (NB)
  freewayGantrySign(b, mg, I15.medianX, I15.eastWallX, 268, true, [
    { x: I15.nbX, w: 9.0, lines: ['EXIT 38  FLAMINGO RD', 'CAESARS PALACE • BELLAGIO • RIO'], arrow: 'down' },
  ]);
  // Flamingo gantry SB approaching Flamingo
  freewayGantrySign(b, mg, I15.westWallX, I15.medianX, -58, false, [
    { x: I15.sbX, w: 9.2, lines: ['EXIT 38  FLAMINGO RD', 'THE STRIP • RIO • PALMS'], arrow: 'down' },
  ]);
}

// ================================================================ Culled Instanced Freeway & Bridge Traffic

function buildFreewayTraffic(b: WorldBuilder): void {
  const lanes: TrafficLane[] = [
    // I-15 Northbound (3 active flow lanes moving North: dir = -1)
    { axis: 'z', lanePos: -187.5, min: -740, max: 780, dir: -1, count: 14, speed: 24 },
    { axis: 'z', lanePos: -183.0, min: -740, max: 780, dir: -1, count: 14, speed: 21 },
    { axis: 'z', lanePos: -178.5, min: -740, max: 780, dir: -1, count: 12, speed: 18 },
    // I-15 Southbound (3 active flow lanes moving South: dir = +1)
    { axis: 'z', lanePos: -199.5, min: -740, max: 780, dir: 1, count: 14, speed: 24 },
    { axis: 'z', lanePos: -204.0, min: -740, max: 780, dir: 1, count: 14, speed: 21 },
    { axis: 'z', lanePos: -208.5, min: -740, max: 780, dir: 1, count: 12, speed: 18 },
    // Tropicana Bridge East/West flow (-290 .. -112)
    { axis: 'x', lanePos: I15.tropZ + 4.4, min: -290, max: -112, dir: 1, count: 6, speed: 13.5, yAt: tropicanaY },
    { axis: 'x', lanePos: I15.tropZ - 4.4, min: -290, max: -112, dir: -1, count: 6, speed: 13.5, yAt: tropicanaY },
    // Harmon Bridge flow (-290 .. -146)
    { axis: 'x', lanePos: I15.harmonZ + 2.5, min: -288, max: -146, dir: 1, count: 4, speed: 11.5, yAt: harmonY },
    { axis: 'x', lanePos: I15.harmonZ - 2.5, min: -288, max: -146, dir: -1, count: 4, speed: 11.5, yAt: harmonY },
    // Flamingo Bridge flow (-290 .. -146)
    { axis: 'x', lanePos: I15.flamingoZ + 4.0, min: -290, max: -146, dir: 1, count: 5, speed: 13, yAt: flamingoY },
    { axis: 'x', lanePos: I15.flamingoZ - 4.0, min: -290, max: -146, dir: -1, count: 5, speed: 13, yAt: flamingoY },
  ];

  // Tight cull radius around I-15 core (Flamingo -> Tropicana -> Allegiant corridor)
  buildInstancedTraffic(b, lanes, [-195, 220], 360);
}
