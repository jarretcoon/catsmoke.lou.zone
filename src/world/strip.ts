import * as THREE from 'three';
import type { Rideable } from '../rides';
import { bakeGroup } from '../meshBake';
import type { WorldBuilder } from './builder';
import { makeBoulevardTexture, makeCrossStreetTexture, makeGlowTexture, makePaverTexture } from './textures';
import {
  ashUrn,
  basic,
  bench,
  bollard,
  car,
  CarKind,
  deuceBus,
  fireHydrant,
  mat,
  mesh,
  neonSign,
  newsRack,
  palmTree,
  stripLightPole,
  trafficSignal,
  trashCan,
} from './props';

/**
 * Coordinates: x = east, z = SOUTH, y = up, Flamingo Rd / Las Vegas Blvd center at the origin.
 * Distances along the Strip are the real OpenStreetMap distances compressed 1:3.2.
 * Street cross-section, cars and people stay life-size.
 */
export const STRIP = {
  north: -800,
  south: 960,
  /** Tropicana Ave (real s −1542) — the second big intersection, also a skybridge ring. */
  tropicanaZ: 442.7,
  medianHalf: 1.4,
  laneCenters: [3.1, 6.5, 9.9],
  curb: 11.6,
  sidewalkOuter: 19,
  flamingoHalf: 10,
  flamingoWalk: 16,
  flamingoWest: -175,
  flamingoEast: 205,
  bridgeY: 6.6,
  bridgeX: 22,
  bridgeZ: 17,
};

/** Real signalised mid-block crossings of the Strip (real meters north of Flamingo / -3.2). */
export const CROSSWALKS: Array<{ z: number; name: string; offset: number; road?: 'west' | 'east' | 'both' }> = [
  { z: -735.3, name: 'Circus Circus Dr', offset: 6, road: 'west' },
  { z: -669.8, name: 'Resorts World Ave', offset: 12 },
  { z: -615.3, name: 'Convention Center Dr', offset: 2, road: 'east' },
  { z: -573.1, name: 'Genting Blvd', offset: 8 },
  { z: -475.3, name: 'Fashion Show Dr', offset: 4 },
  { z: -407, name: 'Spring Mountain Rd / Sands Ave', offset: 10, road: 'both' },
  { z: 206, name: 'Harmon Ave', offset: 3 },
  { z: 529.6, name: 'Reno Ave', offset: 7 },
  { z: 621.1, name: 'Mandalay Bay Rd / Hacienda', offset: 13 },
  { z: 716.2, name: 'Four Seasons Dr', offset: 5 },
  { z: 806.7, name: 'Russell Rd', offset: 9, road: 'both' },
  { z: 100, name: 'Bellagio Dr / Paris', offset: 9 },
  { z: -94, name: 'Caesars / LINQ', offset: 14 },
  { z: -181, name: "Harrah's / Hard Rock", offset: 5 },
  { z: -244, name: 'Venetian', offset: 11 },
  { z: -316, name: 'TI / Palazzo', offset: 1 },
];

export interface DeuceState {
  mesh: THREE.Group;
  laneX: number;
  dir: 1 | -1;
  speed: number;
  stopTimer: number;
  lastStop: number;
  wheels: THREE.Mesh[];
  deckOffset: THREE.Vector3;
  halfLen: number;
}

export interface TrafficCar {
  mesh: THREE.Group;
  laneX: number;
  dir: 1 | -1;
  speed: number;
  cruise: number;
  halfLen: number;
  axis: 'z' | 'x';
  /** Being driven by the cat. */
  hijacked?: boolean;
  /** Abandoned by the cat; waits to respawn into traffic. */
  parked?: boolean;
  homeLane?: number;
}

export interface StripResult {
  buses: DeuceState[];
  cars: TrafficCar[];
}

/** Current RTC Deuce: metallic-gold Enviro500 double-decker. */
export const DEUCE_LIVERY = { body: 0xc8a34a, band: 0x15161a, accent: 0x7a1414 };

type Phase = 'go' | 'yellow' | 'stop';
const FLAMINGO_CYCLE = 34;
const CROSSWALK_CYCLE = 30;

/** Las Vegas Blvd phase at the Flamingo intersection (Flamingo Rd gets the opposite). */
function flamingoPhase(t: number): { ns: Phase; ew: Phase } {
  const c = t % FLAMINGO_CYCLE;
  if (c < 17) return { ns: 'go', ew: 'stop' };
  if (c < 20) return { ns: 'yellow', ew: 'stop' };
  if (c < 31) return { ns: 'stop', ew: 'go' };
  return { ns: 'stop', ew: 'yellow' };
}
/** Tropicana runs the same plan, half a cycle out of step with Flamingo. */
function tropicanaPhase(t: number): { ns: Phase; ew: Phase } {
  return flamingoPhase(t + FLAMINGO_CYCLE / 2);
}
function crossPhase(z: number, t: number): { ns: Phase; ew: Phase } {
  return Math.abs(z - STRIP.tropicanaZ) < 40 ? tropicanaPhase(t) : flamingoPhase(t);
}
function crosswalkPhase(t: number, offset: number): Phase {
  const c = (t + offset) % CROSSWALK_CYCLE;
  if (c < 19) return 'go';
  if (c < 22) return 'yellow';
  return 'stop';
}

export function buildStrip(b: WorldBuilder, deuceStops: Array<{ z: number; side: 1 | -1; name: string }>): StripResult {
  const len = STRIP.south - STRIP.north;
  const midZ = (STRIP.south + STRIP.north) / 2;
  const half = STRIP.curb;
  const clock = () => performance.now() / 1000;

  // --- Ground: plaza pavers across the resort corridor ---
  const paver = new THREE.MeshStandardMaterial({ map: makePaverTexture('#9a9085', '#776e64', 8), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  const groundW = STRIP.flamingoEast - STRIP.flamingoWest;
  paver.map!.repeat.set(groundW / 6, len / 6);
  b.floor((STRIP.flamingoEast + STRIP.flamingoWest) / 2, midZ, groundW, len, paver, 0.0);

  // --- Las Vegas Blvd ---
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2, len),
    new THREE.MeshStandardMaterial({ map: makeBoulevardTexture(len, half, [4.8, 8.2, 11.6], STRIP.medianHalf), roughness: 0.82 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.03, midZ);
  road.receiveShadow = true;
  b.add(road);
  b.feature({ kind: 'road', x: 0, z: midZ, w: half * 2, d: len, color: '#3b3a40' });

  const curbMat = mat(0xc9c2b6, 0.8);
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [
      [STRIP.north, -STRIP.flamingoHalf],
      [STRIP.flamingoHalf, STRIP.tropicanaZ - STRIP.flamingoHalf],
      [STRIP.tropicanaZ + STRIP.flamingoHalf, STRIP.south],
    ]) {
      b.add(mesh(new THREE.BoxGeometry(0.3, 0.16, z1 - z0), curbMat, s * (half + 0.15), 0.08, (z0 + z1) / 2));
    }
  }

  // --- Raised median with palms, cut for the intersection and every crosswalk ---
  const cuts = [
    { z0: -28, z1: 28 },
    { z0: STRIP.tropicanaZ - 28, z1: STRIP.tropicanaZ + 28 },
    { z0: 890, z1: 952 }, // Welcome sign island (built by the south district)
    ...CROSSWALKS.map((c) => ({ z0: c.z - 5, z1: c.z + 5 })),
  ].sort((a, c) => a.z0 - c.z0);
  const medianRuns: Array<[number, number]> = [];
  let cursor = STRIP.north + 4;
  for (const cut of cuts) {
    if (cut.z0 > cursor) medianRuns.push([cursor, cut.z0]);
    cursor = Math.max(cursor, cut.z1);
  }
  if (cursor < STRIP.south - 4) medianRuns.push([cursor, STRIP.south - 4]);
  const medianMat = mat(0xb8ad9c, 0.85);
  const medianTop = mat(0x5f7d45, 0.95);
  let palmI = 0;
  for (const [z0, z1] of medianRuns) {
    const zc = (z0 + z1) / 2;
    b.box(0, 0, zc, STRIP.medianHalf * 2, 0.22, z1 - z0, medianMat, false, false);
    b.add(mesh(new THREE.BoxGeometry(STRIP.medianHalf * 2 - 0.3, 0.05, z1 - z0 - 0.3), medianTop, 0, 0.245, zc));
    for (let z = z0 + 6; z < z1 - 4; z += 15) b.add(palmTree(8 + (palmI % 3) * 0.8, false, palmI++), 0, 0.22, z);
  }

  // --- Flamingo Rd ---
  const crossLen = STRIP.flamingoEast - STRIP.flamingoWest;
  const crossMid = (STRIP.flamingoEast + STRIP.flamingoWest) / 2;
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(crossLen, STRIP.flamingoHalf * 2), new THREE.MeshStandardMaterial({ map: makeCrossStreetTexture(crossLen), roughness: 0.82 }));
  cross.rotation.x = -Math.PI / 2;
  cross.position.set(crossMid, 0.035, 0);
  cross.receiveShadow = true;
  b.add(cross);
  b.feature({ kind: 'road', x: crossMid, z: 0, w: crossLen, d: STRIP.flamingoHalf * 2, color: '#3b3a40' });
  b.zone('Flamingo Rd & Las Vegas Blvd', -STRIP.sidewalkOuter, STRIP.sidewalkOuter, -STRIP.flamingoWalk, STRIP.flamingoWalk);
  const trop = new THREE.Mesh(new THREE.PlaneGeometry(crossLen, STRIP.flamingoHalf * 2), new THREE.MeshStandardMaterial({ map: makeCrossStreetTexture(crossLen), roughness: 0.82 }));
  trop.rotation.x = -Math.PI / 2;
  trop.position.set(crossMid, 0.035, STRIP.tropicanaZ);
  trop.receiveShadow = true;
  b.add(trop);
  b.feature({ kind: 'road', x: crossMid, z: STRIP.tropicanaZ, w: crossLen, d: STRIP.flamingoHalf * 2, color: '#3b3a40', label: 'Tropicana Ave' });
  b.zone('Tropicana Ave & Las Vegas Blvd', -STRIP.sidewalkOuter, STRIP.sidewalkOuter, STRIP.tropicanaZ - STRIP.flamingoWalk, STRIP.tropicanaZ + STRIP.flamingoWalk);
  // Side-street stubs (two lanes each way) at the real cross streets
  const sideTex = makeCrossStreetTexture(160);
  for (const cw of CROSSWALKS) {
    if (!cw.road) continue;
    const spans: Array<[number, number]> = cw.road === 'both' ? [[STRIP.flamingoWest, -half], [half, STRIP.flamingoEast]] : cw.road === 'west' ? [[STRIP.flamingoWest, -half]] : [[half, STRIP.flamingoEast]];
    for (const [a, c] of spans) {
      const w = c - a;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 14), new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.82 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((a + c) / 2, 0.034, cw.z);
      m.receiveShadow = true;
      b.add(m);
      b.feature({ kind: 'road', x: (a + c) / 2, z: cw.z, w, d: 14, color: '#3b3a40' });
    }
  }

  const white = basic(0xf2f0ea);
  for (const s of [-1, 1]) {
    const bar = mesh(new THREE.PlaneGeometry(half - STRIP.medianHalf, 0.5), white, s * ((half + STRIP.medianHalf) / 2), 0.055, -s * (STRIP.flamingoHalf + 1.2));
    bar.rotation.x = -Math.PI / 2;
    b.add(bar);
  }

  // --- Flamingo intersection signals (no at-grade crosswalks here — use the bridges) ---
  const signals: Array<{ sig: ReturnType<typeof trafficSignal>; read: () => Phase }> = [];
  const flamingoDefs: Array<[number, number, number, 'ns' | 'ew']> = [
    [-half - 1, -STRIP.flamingoHalf - 1.5, 0, 'ns'],
    [half + 1, STRIP.flamingoHalf + 1.5, Math.PI, 'ns'],
    [half + 1, -STRIP.flamingoHalf - 1.5, -Math.PI / 2, 'ew'],
    [-half - 1, STRIP.flamingoHalf + 1.5, Math.PI / 2, 'ew'],
  ];
  for (const [x, z, rot, axis] of flamingoDefs) {
    const sig = trafficSignal(axis === 'ns' ? half : STRIP.flamingoHalf + 1);
    b.add(sig.group, x, 0, z, rot);
    b.collider(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 7, true);
    signals.push({ sig, read: () => flamingoPhase(clock())[axis] });
    const tz = z + STRIP.tropicanaZ;
    const sig2 = trafficSignal(axis === 'ns' ? half : STRIP.flamingoHalf + 1);
    b.add(sig2.group, x, 0, tz, rot);
    b.collider(x - 0.25, x + 0.25, tz - 0.25, tz + 0.25, 0, 7, true);
    signals.push({ sig: sig2, read: () => tropicanaPhase(clock())[axis] });
  }
  for (const s2 of [-1, 1]) {
    const bar = mesh(new THREE.PlaneGeometry(half - STRIP.medianHalf, 0.5), white, s2 * ((half + STRIP.medianHalf) / 2), 0.055, STRIP.tropicanaZ - s2 * (STRIP.flamingoHalf + 1.2));
    bar.rotation.x = -Math.PI / 2;
    b.add(bar);
  }

  // --- Mid-block signalised crosswalks ---
  for (const cw of CROSSWALKS) {
    for (let x = -half + 0.6; x < half - 0.4; x += 1.4) {
      const stripe = mesh(new THREE.PlaneGeometry(0.75, 4.2), white, x, 0.055, cw.z);
      stripe.rotation.x = -Math.PI / 2;
      b.add(stripe);
    }
    for (const s of [-1, 1]) {
      const bar = mesh(new THREE.PlaneGeometry(half - STRIP.medianHalf, 0.45), white, s * ((half + STRIP.medianHalf) / 2), 0.055, cw.z - s * 4.2);
      bar.rotation.x = -Math.PI / 2;
      b.add(bar);
      const sig = trafficSignal(5.5);
      const sx = s * (half + 0.9);
      const sz = cw.z - s * 3.4;
      b.add(sig.group, sx, 0, sz, s < 0 ? 0 : Math.PI);
      b.collider(sx - 0.25, sx + 0.25, sz - 0.25, sz + 0.25, 0, 7, true);
      signals.push({ sig, read: () => crosswalkPhase(clock(), cw.offset) });
      // Pedestrian head: white walking figure when cars are stopped
      const ped = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
      b.add(mesh(new THREE.BoxGeometry(0.36, 0.36, 0.1), mat(0x1b1d22, 0.6), sx, 3.1, cw.z + s * 1.6));
      b.add(mesh(new THREE.PlaneGeometry(0.28, 0.28), ped, sx, 3.1, cw.z + s * 1.6 + 0.06));
      b.every(() => {
        ped.color.setHex(crosswalkPhase(clock(), cw.offset) === 'stop' ? 0xf4f4f0 : 0xff7a1a);
      });
    }
    b.zone(`${cw.name} Crosswalk`, -half, half, cw.z - 3, cw.z + 3);
  }
  b.every(() => {
    for (const s of signals) {
      const p = s.read();
      s.sig.setState(p === 'go' ? 'green' : p === 'yellow' ? 'yellow' : 'red');
    }
  });

  // --- Four-corner pedestrian skybridge ring ---
  buildSkybridges(b, 0, ['CAESARS PALACE  •  THE VANDERPUMP', 'BELLAGIO  •  HORSESHOE', 'FLAMINGO RD  •  BELLAGIO ↔ CAESARS', 'FLAMINGO RD  •  HORSESHOE ↔ VANDERPUMP'], 'FLAMINGO RD', 'Flamingo Skybridge');
  buildSkybridges(b, STRIP.tropicanaZ, ['NEW YORK-NEW YORK  •  MGM GRAND', 'EXCALIBUR  •  BALLPARK SITE', 'TROPICANA AVE  •  NYNY ↔ EXCALIBUR', 'TROPICANA AVE  •  MGM ↔ BALLPARK'], 'TROPICANA AVE', 'Tropicana Skybridge');

  // --- Street furniture along both sidewalks ---
  const glowMat = new THREE.MeshBasicMaterial({ map: makeGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  let poleIdx = 0;
  const nearCrossing = (z: number, r: number) => Math.abs(z) < 30 || Math.abs(z - STRIP.tropicanaZ) < 30 || (z > 885 && z < 955) || CROSSWALKS.some((c) => Math.abs(c.z - z) < r + (c.road ? 6 : 0));
  for (const s of [-1, 1]) {
    for (let z = STRIP.north + 10; z < STRIP.south - 5; z += 24) {
      if (nearCrossing(z, 7)) continue;
      const pole = stripLightPole([0xd4a640, 0xb3261e, 0x2b5fb8, 0x7d2b8c][poleIdx++ % 4]);
      const x = s * (half + 1.0);
      b.add(pole.group, x, 0, z, s > 0 ? Math.PI / 2 : -Math.PI / 2);
      b.collider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0, 9, true);
      const pool = mesh(new THREE.PlaneGeometry(9, 9), glowMat, x, 0.065, z);
      pool.rotation.x = -Math.PI / 2;
      pool.renderOrder = 1;
      b.add(pool);
    }
    for (let z = STRIP.north + 16; z < STRIP.south - 5; z += 11) {
      if (nearCrossing(z, 6)) continue;
      const k = Math.abs(Math.round(z)) % 7;
      const x = s * (half + 0.7);
      if (k === 0) b.prop(trashCan(), x, z, 0.34, 1.0, 'trash');
      else if (k === 1 || k === 5) b.prop(ashUrn(), x, z, 0.24, 0.85, 'urn');
      else if (k === 2) b.prop(newsRack([0xd8352b, 0x2c6bd1]), s * (half + 0.9), z, 0.55, 1.1, 'newsrack', s > 0 ? -Math.PI / 2 : Math.PI / 2);
      else if (k === 3) b.add(fireHydrant(), x, 0, z);
      else if (k === 4) b.add(bench(), s * (half + 0.8), 0, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      else b.add(bollard(), x, 0, z);
    }
  }
  b.every((_dt, _t, night) => {
    glowMat.opacity = night * 0.55;
  });

  // --- Deuce stop shelters ---
  const shelterGlass = new THREE.MeshStandardMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.35, roughness: 0.1 });
  const shelterFrame = mat(0x2d2f36, 0.4, 0.6);
  for (const stop of deuceStops) {
    const x = stop.side * (half + 3.2);
    b.box(x + stop.side * 1.25, 0, stop.z, 0.1, 2.4, 4.6, shelterGlass, true, false);
    b.add(mesh(new THREE.BoxGeometry(2.6, 0.12, 5.0), shelterFrame, x, 2.5, stop.z));
    b.collider(x - 1.3, x + 1.3, stop.z - 2.5, stop.z + 2.5, 2.44, 2.56);
    b.add(bench(), x + stop.side * 0.6, 0, stop.z, stop.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const sign = neonSign('THE DEUCE', '#111111', '#ffcc33', 1.7, 0.6, stop.name, 0.08);
    b.add(sign, x - stop.side * 1.0, 3.2, stop.z - 1.4, stop.side < 0 ? Math.PI / 2 : -Math.PI / 2);
    b.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), shelterFrame, x - stop.side * 1.0, 1.6, stop.z - 1.4));
    b.staticMarkers.push({ x, z: stop.z, color: '#ffcc33', glyph: 'D', size: 2.6 });
  }

  // --- Buses: southbound on the west side, northbound on the east side ---
  const buses: DeuceState[] = [];
  const stopsByDir = (dir: 1 | -1) => deuceStops.filter((s) => (dir === 1 ? s.side < 0 : s.side > 0)).map((s) => s.z);
  const busDefs: Array<{ x: number; dir: 1 | -1; z: number }> = [
    { x: -STRIP.laneCenters[2], dir: 1, z: -140 },
    { x: STRIP.laneCenters[2], dir: -1, z: 70 },
    { x: -STRIP.laneCenters[2], dir: 1, z: 180 },
    { x: STRIP.laneCenters[2], dir: -1, z: -260 },
    { x: -STRIP.laneCenters[2], dir: 1, z: 600 },
    { x: STRIP.laneCenters[2], dir: -1, z: 820 },
    { x: -STRIP.laneCenters[2], dir: 1, z: -560 },
    { x: STRIP.laneCenters[2], dir: -1, z: -700 },
  ];
  for (const def of busDefs) {
    const built = deuceBus(DEUCE_LIVERY);
    bakeGroup(built.group, (m) => !!m.userData.keep);
    b.scene.add(built.group);
    built.group.position.set(def.x, 0, def.z);
    built.group.rotation.y = def.dir === 1 ? 0 : Math.PI;
    buses.push({ mesh: built.group, laneX: def.x, dir: def.dir, speed: 9, stopTimer: 0, lastStop: NaN, wheels: built.wheels, deckOffset: built.deckOffset, halfLen: 6.3 });
  }

  // --- Cars ---
  const cars: TrafficCar[] = [];
  const palette: Array<[CarKind, number]> = [
    ['taxi', 0xf4c430], ['limo', 0x11131c], ['suv', 0x1d1f24], ['sedan', 0xe8e8ea],
    ['sport', 0xc4161c], ['sedan', 0x2d4f8c], ['taxi', 0x2a2a2a], ['suv', 0xf2f2f0],
    ['sedan', 0x6b6f76], ['limo', 0xf4f4f4], ['sport', 0x1e8c5a], ['taxi', 0xf4c430],
    ['suv', 0x8a1c1c], ['sedan', 0x111111], ['taxi', 0xf4c430], ['sport', 0xf2a516],
    ['taxi', 0xf4c430], ['sedan', 0x3a5a3a], ['limo', 0x111111], ['suv', 0xd9d9d9],
    ['sport', 0x2a66cc], ['sedan', 0x8a6a4a], ['taxi', 0x2a2a2a], ['suv', 0x1d1f24],
    ['sedan', 0xf2f2f0], ['taxi', 0xf4c430], ['sport', 0x6b1fa8], ['sedan', 0x4a4a52],
  ];
  palette.forEach(([kind, color], i) => {
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const lane = STRIP.laneCenters[(i >> 1) % 2]; // inner two lanes; buses own the curb lane
    const x = dir === 1 ? -lane : lane;
    const c = car(kind, color);
    bakeGroup(c.group);
    b.scene.add(c.group);
    c.group.position.set(x, 0, STRIP.north + 20 + ((i * 89) % (len - 40)));
    c.group.rotation.y = dir === 1 ? 0 : Math.PI;
    const cruise = 11 + (i % 4) * 1.6;
    cars.push({ mesh: c.group, laneX: x, dir, speed: cruise, cruise, halfLen: c.length / 2 + 0.3, axis: 'z' });
  });
  const crossPalette: Array<[CarKind, number]> = [['sedan', 0x8a1c1c], ['taxi', 0xf4c430], ['suv', 0x23262c], ['sedan', 0xd9d9d9]];
  [...crossPalette, ...crossPalette].forEach(([kind, color], i) => {
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1; // +1 = eastbound (drives on the south half)
    const lane = i % 4 < 2 ? 3.1 : 6.5;
    const z = (i >= 4 ? STRIP.tropicanaZ : 0) + (dir === 1 ? lane : -lane);
    const c = car(kind, color);
    bakeGroup(c.group);
    b.scene.add(c.group);
    c.group.position.set(STRIP.flamingoWest + 30 + i * 80, 0, z);
    c.group.rotation.y = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    cars.push({ mesh: c.group, laneX: z, dir, speed: 10, cruise: 10 + i, halfLen: c.length / 2 + 0.3, axis: 'x' });
  });

  /** Distance to the next red/yellow stop line ahead of a z-axis vehicle, or Infinity. */
  const nextStop = (pos: number, dir: 1 | -1): number => {
    const t = clock();
    let best = Infinity;
    const consider = (lineZ: number, phase: Phase) => {
      if (phase === 'go') return;
      const d = (lineZ - pos) * dir;
      if (d > 0 && d < best) best = d;
    };
    consider(-dir * (STRIP.flamingoHalf + 2.2), flamingoPhase(t).ns);
    consider(STRIP.tropicanaZ - dir * (STRIP.flamingoHalf + 2.2), tropicanaPhase(t).ns);
    for (const cw of CROSSWALKS) consider(cw.z - dir * 4.6, crosswalkPhase(t, cw.offset));
    return best;
  };

  b.every((dt) => {
    const t = clock();
    for (const c of cars) {
      if (c.hijacked || c.parked) continue;
      const pos = c.axis === 'z' ? c.mesh.position.z : c.mesh.position.x;
      let target = c.cruise;
      if (c.axis === 'z') {
        const d = nextStop(pos, c.dir);
        if (d < 28) target = Math.min(target, Math.max(0, (d - c.halfLen) * 0.9));
      } else if (crossPhase(c.laneX, t).ew !== 'go') {
        const line = -c.dir * (STRIP.curb + 2.2);
        const d = (line - pos) * c.dir;
        if (d > 0 && d < 26) target = Math.min(target, Math.max(0, (d - c.halfLen) * 0.9));
      }
      for (const o of cars) {
        if (o === c || o.axis !== c.axis || o.laneX !== c.laneX) continue;
        const op = c.axis === 'z' ? o.mesh.position.z : o.mesh.position.x;
        const gap = (op - pos) * c.dir - o.halfLen - c.halfLen;
        if (gap > 0 && gap < 14) target = Math.min(target, Math.max(0, (gap - 2.5) * 1.2));
      }
      c.speed = THREE.MathUtils.lerp(c.speed, target, Math.min(1, dt * 2.2));
      const next = pos + c.dir * c.speed * dt;
      if (c.axis === 'z') {
        c.mesh.position.z = next;
        if (c.dir === 1 && next > STRIP.south) c.mesh.position.z = STRIP.north;
        if (c.dir === -1 && next < STRIP.north) c.mesh.position.z = STRIP.south;
      } else {
        c.mesh.position.x = next;
        if (c.dir === 1 && next > STRIP.flamingoEast) c.mesh.position.x = STRIP.flamingoWest;
        if (c.dir === -1 && next < STRIP.flamingoWest) c.mesh.position.x = STRIP.flamingoEast;
      }
    }

    for (const bus of buses) {
      if (bus.stopTimer > 0) {
        bus.stopTimer -= dt;
        continue;
      }
      const z = bus.mesh.position.z;
      let target = bus.speed;
      const d = nextStop(z, bus.dir);
      if (d < 32) target = Math.min(target, Math.max(0, (d - bus.halfLen) * 0.8));
      for (const c of cars) {
        if (c.axis !== 'z' || !(Math.abs(c.laneX - bus.laneX) <= 0.5)) continue;
        const gap = (c.mesh.position.z - z) * bus.dir - c.halfLen - bus.halfLen;
        if (gap > 0 && gap < 14) target = Math.min(target, Math.max(0, (gap - 2.5) * 1.2));
      }
      const nz = z + bus.dir * target * dt;
      for (const sz of stopsByDir(bus.dir)) {
        if (sz === bus.lastStop) continue;
        if ((bus.dir === 1 && z < sz && nz >= sz) || (bus.dir === -1 && z > sz && nz <= sz)) {
          bus.mesh.position.z = sz;
          bus.stopTimer = 5;
          bus.lastStop = sz;
          break;
        }
      }
      if (bus.stopTimer <= 0) bus.mesh.position.z = nz;
      for (const w of bus.wheels) w.rotation.x += bus.dir * target * dt * 2;
      if (bus.dir === 1 && bus.mesh.position.z > STRIP.south) {
        bus.mesh.position.z = STRIP.north;
        bus.lastStop = NaN;
      } else if (bus.dir === -1 && bus.mesh.position.z < STRIP.north) {
        bus.mesh.position.z = STRIP.south;
        bus.lastStop = NaN;
      }
    }
  });

  buses.forEach((bus, i) => {
    b.rideables.push({
      id: `deuce-${i}`,
      kind: 'deuce',
      label: 'The Deuce',
      boardRadius: 7.5,
      boardPoint: (out) => out.copy(bus.mesh.position),
      seat: (out) => out.copy(bus.deckOffset).applyEuler(bus.mesh.rotation).add(bus.mesh.position),
      yaw: () => (bus.dir === 1 ? 0 : Math.PI),
      exitPoint: (out) => out.set(Math.sign(bus.laneX) * (STRIP.curb + 2.0), 0.2, bus.mesh.position.z),
      canBoard: () => ({ ok: true }),
      boardPrompt: 'Press [G] to hop on THE DEUCE (metallic-gold double-decker, runs 24/7)',
      ridingPrompt: 'Riding THE DEUCE upper deck — [E] smoke • [G] hop off',
      status: () => {
        const z = bus.mesh.position.z;
        const ahead = deuceStops
          .filter((s) => (bus.dir === 1 ? s.side < 0 && s.z > z + 1 : s.side > 0 && s.z < z - 1))
          .sort((a, c) => (bus.dir === 1 ? a.z - c.z : c.z - a.z))[0];
        if (bus.stopTimer > 0) return 'Doors open — [G] to hop off here';
        return ahead ? `Next stop: ${ahead.name}` : 'Next stop: end of the line (loops around)';
      },
    } satisfies Rideable);
  });

  return { buses, cars };
}

function buildSkybridges(b: WorldBuilder, zc: number, labels: [string, string, string, string] | string[], sideName: string, zoneName: string): void {
  const y = STRIP.bridgeY;
  const deck = mat(0xb8b2a8, 0.7, 0.15);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.32, roughness: 0.08 });
  const steel = mat(0x5b6068, 0.35, 0.7);
  const X = STRIP.bridgeX;
  const Z = STRIP.bridgeZ;
  const wDeck = 4;

  for (const [sz, label] of [
    [-Z, labels[0]],
    [Z, labels[1]],
  ] as const) {
    b.box(0, y, zc + sz, X * 2 - wDeck, 0.4, wDeck, deck);
    for (const e of [-1, 1]) b.box(0, y + 0.4, zc + sz + e * (wDeck / 2 - 0.1), X * 2 - wDeck * 2, 1.15, 0.12, glass, true, false);
    b.add(mesh(new THREE.BoxGeometry(X * 2, 0.2, wDeck + 0.6), steel, 0, y + 3.6, zc + sz));
    const sign = neonSign('LAS VEGAS BLVD', '#0f1d14', '#7dffb0', 9, 1.1, label, 0.1);
    b.add(sign, 0, y - 0.7, zc + sz + (sz < 0 ? -1 : 1) * (wDeck / 2 + 0.06), sz < 0 ? Math.PI : 0);
  }
  for (const [sx, label] of [
    [-X, labels[2]],
    [X, labels[3]],
  ] as const) {
    b.box(sx, y, zc, wDeck, 0.4, Z * 2 - wDeck, deck);
    for (const e of [-1, 1]) b.box(sx + e * (wDeck / 2 - 0.1), y + 0.4, zc, 0.12, 1.15, Z * 2 - wDeck * 2, glass, true, false);
    b.add(mesh(new THREE.BoxGeometry(wDeck + 0.6, 0.2, Z * 2), steel, sx, y + 3.6, zc));
    const sign = neonSign(sideName, '#1b0b18', '#ff8ad8', 6, 0.9, label, 0.1);
    b.add(sign, sx + (sx < 0 ? -1 : 1) * (wDeck / 2 + 0.06), y - 0.6, zc, sx < 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * X;
      const cz = zc + sz * Z;
      b.box(cx, y, cz, wDeck, 0.4, wDeck, deck);
      for (const [px, pz] of [
        [-1.8, -1.8],
        [1.8, -1.8],
        [-1.8, 1.8],
        [1.8, 1.8],
      ]) {
        b.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, y + 3.6, 8), steel, cx + px, (y + 3.6) / 2, cz + pz, true));
        b.collider(cx + px - 0.2, cx + px + 0.2, cz + pz - 0.2, cz + pz + 0.2, 0, y, true);
      }
      // Stairs (stand-in for the escalators) run away from the intersection along the frontage.
      const steps = 15;
      const rise = (y + 0.4) / steps;
      for (let i = 0; i < steps; i++) {
        const top = y + 0.4 - (i + 1) * rise;
        if (top <= 0.05) break;
        const z = cz + sz * (wDeck / 2 + 0.35 + i * 0.7);
        b.box(cx + sx * 0.4, 0, z, 2.6, top, 0.72, deck, false, false);
      }
    }
  }
  b.zone(zoneName, -X - 2, X + 2, zc - Z - 2, zc - Z + 2);
  b.zone(zoneName, -X - 2, X + 2, zc + Z - 2, zc + Z + 2);
  b.zone(zoneName, -X - 2, -X + 2, zc - Z, zc + Z);
  b.zone(zoneName, X - 2, X + 2, zc - Z, zc + Z);
  b.feature({ kind: 'plaza', x: 0, z: zc - Z, w: X * 2, d: wDeck, color: '#d8d0c0' });
  b.feature({ kind: 'plaza', x: 0, z: zc + Z, w: X * 2, d: wDeck, color: '#d8d0c0' });
  b.feature({ kind: 'plaza', x: -X, z: zc, w: wDeck, d: Z * 2, color: '#d8d0c0' });
  b.feature({ kind: 'plaza', x: X, z: zc, w: wDeck, d: Z * 2, color: '#d8d0c0' });
}

/**
 * Real Strip position → game z. `s` = real meters NORTH of Flamingo along the Blvd.
 * Core (Park MGM → TI) is compressed 1:3.2; the far south (to the Welcome sign) and the far
 * north (to Circus Circus) are compressed 1:4.5 so the whole Strip stays explorable.
 */
export function zFromS(s: number): number {
  if (s >= 1265) return -(412 + (s - 1265) / 4.5);
  if (s <= -1100) return 344 + (-1100 - s) / 4.5;
  return -s / 3.2;
}

/** Real lateral offset (meters east of the Blvd centreline) → game x for the extension districts. */
export function xFromO(o: number): number {
  const a = Math.abs(o);
  return Math.sign(o) * (a <= 19 ? a : 19 + (a - 19) / 4.5);
}
