import * as THREE from 'three';
import type { Rideable } from '../rides';
import { bakeGroup } from '../meshBake';
import type { WorldBuilder } from './builder';
import { LedBoard, makeBoulevardMaps, makeCrossStreetTexture, makeGlowTexture, makeGravelTexture, makePaverTexture, makeRoadPaintTexture, rng } from './textures';
import { viewer } from './builder';
import { boxTruck, signs } from './backOfHouse';
import { posterGeometry, POSTER_COUNT } from './streetTextures';
import { bridgeFascia, deuceStopSign, streetBlade } from './stripSigns';
import { placed } from './signKit';
import { StreetGlow } from './streetGlow';
import { buildSpanBridges } from './stripBridges';
import {
  ashUrn,
  basic,
  bench,
  bollard,
  car,
  CarKind,
  desertPlantKit,
  deuceBus,
  fireHydrant,
  mat,
  mesh,
  neonSign,
  newsRack,
  palmTree,
  signalLamps,
  streetLampGlass,
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
  /** The walkable north end: past Circus Circus Dr to Sky Las Vegas (Sahara Ave and the STRAT stay backdrop). */
  north: -856,
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
/** `bridged`: the Boulevard has no at-grade crossing here; people use the pedestrian bridges (signals stay for the cross street). */
/** `eastStub`: the east stub ends at this x; the district draws the road on from there (Sands Ave curves to the Sphere: sphereDistrict.ts). */
export const CROSSWALKS: Array<{ z: number; name: string; offset: number; road?: 'west' | 'east' | 'both'; bridged?: boolean; eastStub?: number }> = [
  { z: -797, name: 'Circus Circus Dr', offset: 6, road: 'west' },
  { z: -735.3, name: 'Circus Circus main entrance', offset: 3, road: 'west' },
  { z: -669.8, name: 'Resorts World Ave', offset: 12 },
  { z: -615.3, name: 'Convention Center Dr', offset: 2, road: 'east' },
  { z: -573.1, name: 'Genting Blvd', offset: 8 },
  { z: -475.3, name: 'Fashion Show Dr', offset: 4 },
  { z: -407, name: 'Spring Mountain Rd / Sands Ave', offset: 10, road: 'both', bridged: true, eastStub: 40 },
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

/** Lit mast-arm blades at the real cross streets: [west pole, east pole]. Mid-block casino crossings get none. */
const STREET_BLADES: Record<string, [string, string]> = {
  'Circus Circus Dr': ['Circus Circus Dr', 'Circus Circus Dr'],
  'Resorts World Ave': ['Resorts World Ave', 'Resorts World Ave'],
  'Convention Center Dr': ['Convention Center Dr', 'Convention Center Dr'],
  'Genting Blvd': ['Genting Blvd', 'Genting Blvd'],
  'Fashion Show Dr': ['Fashion Show Dr', 'Fashion Show Dr'],
  'Spring Mountain Rd / Sands Ave': ['Spring Mountain Rd', 'Sands Ave'],
  'Harmon Ave': ['Harmon Ave', 'Harmon Ave'],
  'Reno Ave': ['Reno Ave', 'Reno Ave'],
  'Mandalay Bay Rd / Hacienda': ['Mandalay Bay Rd', 'Hacienda Ave'],
  'Four Seasons Dr': ['Four Seasons Dr', 'Four Seasons Dr'],
  'Russell Rd': ['Russell Rd', 'Russell Rd'],
};

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
  /** 0 in its curb lane … 1 out in the next lane, passing a car stopped at the curb. */
  swing: number;
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
  /** Stopped at the curb in the Deuce's lane (a rideshare pickup or drop-off): the bus pulls out around it. */
  curbside?: boolean;
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
export function flamingoPhase(t: number): { ns: Phase; ew: Phase } {
  const c = t % FLAMINGO_CYCLE;
  if (c < 17) return { ns: 'go', ew: 'stop' };
  if (c < 20) return { ns: 'yellow', ew: 'stop' };
  if (c < 31) return { ns: 'stop', ew: 'go' };
  return { ns: 'stop', ew: 'yellow' };
}
/** Tropicana runs the same plan, half a cycle out of step with Flamingo. */
export function tropicanaPhase(t: number): { ns: Phase; ew: Phase } {
  return flamingoPhase(t + FLAMINGO_CYCLE / 2);
}
function crossPhase(z: number, t: number): { ns: Phase; ew: Phase } {
  return Math.abs(z - STRIP.tropicanaZ) < 40 ? tropicanaPhase(t) : flamingoPhase(t);
}
export function crosswalkPhase(t: number, offset: number): Phase {
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
  const paver = new THREE.MeshStandardMaterial({ map: makePaverTexture('#9a9085', '#776e64', 8, 512), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  const groundW = STRIP.flamingoEast - STRIP.flamingoWest;
  paver.map!.repeat.set(groundW / 6, len / 6);
  b.floor((STRIP.flamingoEast + STRIP.flamingoWest) / 2, midZ, groundW, len, paver, 0.0);

  // Curbside band: darker running-bond pavers along both Strip sidewalks (sits under district plazas)
  const bandTex = makePaverTexture('#6f625a', '#4a403a', 8, 256, 'running');
  const band = new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  for (const s of [-1, 1]) b.add(mesh(worldUvPlane(1.6, len, s * (half + 1.1), 0.006, midZ, 2), band));

  // --- Las Vegas Blvd ---
  const roadMaps = makeBoulevardMaps(len, half, [4.8, 8.2, 11.6], STRIP.medianHalf);
  const roadMat = new THREE.MeshStandardMaterial({ map: roadMaps.map, roughnessMap: roadMaps.roughnessMap, roughness: 1 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, len), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.03, midZ);
  road.receiveShadow = true;
  b.add(road);
  b.feature({ kind: 'road', x: 0, z: midZ, w: half * 2, d: len, color: '#3b3a40' });
  // Night light on the street surfaces themselves: frontage spill, lamp pools, reflected neon (streetGlow.ts)
  const glow = new StreetGlow(STRIP.north - 60, STRIP.south + 60, half + 1.0);
  glow.apply(roadMat, { fill: 0.46, pools: 0.7, sheen: 0.22, lift: 0.015 }); // night asphalt stays dark between the pools; the neon reads in the sheen
  glow.apply(paver, { fill: 0.07, pools: 0.1, sheen: 0.03 });
  glow.apply(band, { fill: 0.12, pools: 0.2, sheen: 0.05, lift: 0.01 });
  b.every((_dt, _t, night) => glow.update(night));

  // Curb: concrete face with a pale weathered top edge (the gutter pan is painted into the road)
  const curbMat = mat(0xb4ada1, 0.8);
  const curbTop = mat(0xd4cec2, 0.75);
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [
      [STRIP.north, -STRIP.flamingoHalf],
      [STRIP.flamingoHalf, STRIP.tropicanaZ - STRIP.flamingoHalf],
      [STRIP.tropicanaZ + STRIP.flamingoHalf, STRIP.south],
    ]) {
      b.add(mesh(new THREE.BoxGeometry(0.3, 0.16, z1 - z0), curbMat, s * (half + 0.15), 0.08, (z0 + z1) / 2));
      b.add(mesh(new THREE.BoxGeometry(0.36, 0.025, z1 - z0), curbTop, s * (half + 0.17), 0.165, (z0 + z1) / 2));
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
  // Desert-landscaped median: concrete curb, decomposed-granite gravel, palms, agave, sage and boulders.
  const medianMat = mat(0xb8ad9c, 0.85);
  const gravel = new THREE.MeshStandardMaterial({ map: makeGravelTexture(), roughness: 0.97 });
  const kit = desertPlantKit();
  const rockMats = [mat(0x8a6e58, 0.95), mat(0xa38b72, 0.95), mat(0x6e5a4c, 0.95)];
  const agaveMat = mat(0x6f8f7a, 0.75);
  const shrubMats = [mat(0x56693e, 0.92), mat(0x7f8460, 0.92)];
  const R = rng(2024);
  const inner = STRIP.medianHalf - 0.35;
  const plant = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, z: number, sc: number, cast = false) => {
    const me = mesh(geo, m, x, 0.26, z, cast);
    me.rotation.y = R() * Math.PI * 2;
    me.scale.setScalar(sc);
    b.add(me);
  };
  let palmI = 0;
  for (const [z0, z1] of medianRuns) {
    const zc = (z0 + z1) / 2;
    b.box(0, 0, zc, STRIP.medianHalf * 2, 0.22, z1 - z0, medianMat, false, false);
    b.add(mesh(worldUvPlane(STRIP.medianHalf * 2 - 0.3, z1 - z0 - 0.3, 0, 0.255, zc, 2.5), gravel));
    for (let z = z0 + 6; z < z1 - 4; z += 15) {
      b.add(palmTree(8 + (palmI % 3) * 0.8, false, palmI++), 0, 0.22, z);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + R();
        plant(kit.rocks[k % 3], rockMats[k % 3], Math.cos(a) * 0.6, z + Math.sin(a) * 0.6, 0.7 + R() * 0.5);
      }
      for (const dz of [-4.2, 4.2]) if (z + dz > z0 + 1 && z + dz < z1 - 1) plant(kit.agave[palmI % 2], agaveMat, (R() - 0.5) * 0.5, z + dz, 0.75 + R() * 0.2);
      for (const dz of [-7.5, 7.5]) {
        if (z + dz <= z0 + 1 || z + dz >= z1 - 1) continue;
        plant(kit.shrub[0], shrubMats[0], -inner * 0.45, z + dz + (R() - 0.5), 0.8 + R() * 0.3);
        plant(kit.shrub[1], shrubMats[1], inner * 0.45, z + dz + (R() - 0.5), 0.8 + R() * 0.3);
      }
      for (let k = 0; k < 2; k++) plant(kit.rocks[(k + palmI) % 3], rockMats[(k + 1) % 3], (R() - 0.5) * inner * 1.4, z + 9 + R() * 4, 0.35 + R() * 0.3);
    }
  }

  // --- Flamingo Rd (west surface stops at -148 where interstate.ts Flamingo overpass ramp starts) ---
  const flamWest = -148;
  const crossLen = STRIP.flamingoEast - flamWest;
  const crossMid = (STRIP.flamingoEast + flamWest) / 2;
  // The cross streets catch the frontage glow too (the resorts on the corners light them)
  const crossGlow = { fill: 0.42, pools: 0, sheen: 0.14, lift: 0.013 };
  const crossMat = new THREE.MeshStandardMaterial({ map: makeCrossStreetTexture(crossLen), roughness: 0.82 });
  glow.apply(crossMat, crossGlow);
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(crossLen, STRIP.flamingoHalf * 2), crossMat);
  cross.rotation.x = -Math.PI / 2;
  cross.position.set(crossMid, 0.035, 0);
  cross.receiveShadow = true;
  b.add(cross);
  b.feature({ kind: 'road', x: crossMid, z: 0, w: crossLen, d: STRIP.flamingoHalf * 2, color: '#3b3a40' });
  b.zone('Flamingo Rd & Las Vegas Blvd', -STRIP.sidewalkOuter, STRIP.sidewalkOuter, -STRIP.flamingoWalk, STRIP.flamingoWalk);
  // --- Tropicana Ave (west surface stops at -114 where interstate.ts Dropicana overpass ramp starts) ---
  const tropWest = -114;
  const tropLen = STRIP.flamingoEast - tropWest;
  const tropMid = (STRIP.flamingoEast + tropWest) / 2;
  const tropMat = new THREE.MeshStandardMaterial({ map: makeCrossStreetTexture(tropLen), roughness: 0.82 });
  glow.apply(tropMat, crossGlow);
  const trop = new THREE.Mesh(new THREE.PlaneGeometry(tropLen, STRIP.flamingoHalf * 2), tropMat);
  trop.rotation.x = -Math.PI / 2;
  trop.position.set(tropMid, 0.035, STRIP.tropicanaZ);
  trop.receiveShadow = true;
  b.add(trop);
  b.feature({ kind: 'road', x: tropMid, z: STRIP.tropicanaZ, w: tropLen, d: STRIP.flamingoHalf * 2, color: '#3b3a40', label: 'Tropicana Ave' });
  b.zone('Tropicana Ave & Las Vegas Blvd', -STRIP.sidewalkOuter, STRIP.sidewalkOuter, STRIP.tropicanaZ - STRIP.flamingoWalk, STRIP.tropicanaZ + STRIP.flamingoWalk);
  // Side-street stubs (two lanes each way) at the real cross streets
  const sideMat = new THREE.MeshStandardMaterial({ map: makeCrossStreetTexture(160), roughness: 0.82 });
  glow.apply(sideMat, crossGlow);
  for (const cw of CROSSWALKS) {
    if (!cw.road) continue;
    let spans: Array<[number, number]> = cw.road === 'both' ? [[STRIP.flamingoWest, -half], [half, STRIP.flamingoEast]] : cw.road === 'west' ? [[STRIP.flamingoWest, -half]] : [[half, STRIP.flamingoEast]];
    if (cw.eastStub !== undefined) spans = spans.map(([a, c]) => (a > 0 ? [a, cw.eastStub!] : [a, c]));
    for (const [a, c] of spans) {
      const w = c - a;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 14), sideMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((a + c) / 2, 0.034, cw.z);
      m.receiveShadow = true;
      b.add(m);
      b.feature({ kind: 'road', x: (a + c) / 2, z: cw.z, w, d: 14, color: '#3b3a40' });
    }
  }

  // Lit, worn thermoplastic paint (an unlit white MeshBasic blew out to glare under night bloom)
  const white = new THREE.MeshStandardMaterial({ map: makeRoadPaintTexture(), color: 0xd8d6cf, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  glow.apply(white, { fill: 0.06, pools: 0.07, sheen: 0.2 }); // the paint catches the same night light as the asphalt
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
  // Signals that always show the same phase share one set of lamp materials (fewer draw calls).
  const lampSets = { fns: signalLamps(), few: signalLamps(), tns: signalLamps(), tew: signalLamps() };
  for (const [x, z, rot, axis] of flamingoDefs) {
    const sig = trafficSignal(axis === 'ns' ? half : STRIP.flamingoHalf + 1, axis === 'ns' ? lampSets.fns : lampSets.few);
    // Lit street-name blades on the mast arms: the cross street over the Strip, the Boulevard over the cross street
    sig.group.add(placed(streetBlade(b, axis === 'ns' ? 'Flamingo Rd' : 'Las Vegas Blvd S'), 2.1, 7.35, 0));
    b.add(sig.group, x, 0, z, rot);
    b.collider(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 7, true);
    signals.push({ sig, read: () => flamingoPhase(clock())[axis] });
    const tz = z + STRIP.tropicanaZ;
    const sig2 = trafficSignal(axis === 'ns' ? half : STRIP.flamingoHalf + 1, axis === 'ns' ? lampSets.tns : lampSets.tew);
    sig2.group.add(placed(streetBlade(b, axis === 'ns' ? 'Tropicana Ave' : 'Las Vegas Blvd S'), 2.1, 7.35, 0));
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
  const stripeGeo = new THREE.PlaneGeometry(0.6, 4.0);
  for (const cw of CROSSWALKS) {
    // Continental bars, symmetric about the centreline, clear of the gutter pans (none where a bridge replaced them)
    const nBars = cw.bridged ? -1 : Math.floor((half - 0.9) / 1.2);
    for (let i = -nBars; i <= nBars; i++) {
      const stripe = mesh(stripeGeo, white, i * 1.2, 0.055, cw.z);
      stripe.rotation.x = -Math.PI / 2;
      b.add(stripe);
    }
    const lamps = signalLamps();
    const ped = cw.bridged ? null : pedCountdown(b, cw.z, cw.offset, clock);
    for (const s of [-1, 1]) {
      const bar = mesh(new THREE.PlaneGeometry(half - STRIP.medianHalf, 0.45), white, s * ((half + STRIP.medianHalf) / 2), 0.055, cw.z - s * 4.2);
      bar.rotation.x = -Math.PI / 2;
      b.add(bar);
      const sig = trafficSignal(5.5, lamps);
      const blade = STREET_BLADES[cw.name];
      if (blade) sig.group.add(placed(streetBlade(b, s < 0 ? blade[0] : blade[1]), 2.0, 7.35, 0));
      const sx = s * (half + 0.9);
      const sz = cw.z - s * 3.4;
      b.add(sig.group, sx, 0, sz, s < 0 ? 0 : Math.PI);
      b.collider(sx - 0.25, sx + 0.25, sz - 0.25, sz + 0.25, 0, 7, true);
      signals.push({ sig, read: () => crosswalkPhase(clock(), cw.offset) });
      if (!ped) continue;
      // Pedestrian head: walking person + countdown while cars are stopped, flashing hand as time runs out
      b.add(mesh(new THREE.BoxGeometry(0.12, 0.38, 0.66), mat(0x1b1d22, 0.6), sx, 3.1, cw.z + s * 1.6));
      const face = mesh(new THREE.PlaneGeometry(0.58, 0.29), ped, sx - s * 0.07, 3.1, cw.z + s * 1.6);
      face.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      b.add(face);
      b.add(mesh(new THREE.BoxGeometry(0.14, 0.03, 0.66), mat(0x1b1d22, 0.6), sx - s * 0.12, 3.3, cw.z + s * 1.6));
    }
    b.zone(cw.bridged ? `${cw.name} & Las Vegas Blvd` : `${cw.name} Crosswalk`, -half, half, cw.z - 3, cw.z + 3);
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
  // Single spans at Harmon Ave and both sides of Spring Mountain Rd / Sands Ave (stripBridges.ts)
  buildSpanBridges(b);

  // --- Street furniture along both sidewalks ---
  const glowMat = new THREE.MeshBasicMaterial({ map: makeGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  let poleIdx = 0;
  const nearCrossing = (z: number, r: number) => Math.abs(z) < 30 || Math.abs(z - STRIP.tropicanaZ) < 30 || (z > 885 && z < 955) || CROSSWALKS.some((c) => Math.abs(c.z - z) < r + (c.road ? 6 : 0));
  const poleZs: number[] = [];
  for (let z = STRIP.north + 10; z < STRIP.south - 5; z += 24) if (!nearCrossing(z, 7)) poleZs.push(z);
  glow.setPoles(STRIP.north + 10, 24, poleZs);
  glow.finish();
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
    glowMat.opacity = night * 0.32; // the surfaces' own shader pools (streetGlow.ts) carry most of the light now
    glowMat.visible = night > 0.03; // no additive overdraw by day
  });
  b.nightGlow(streetLampGlass, 0.2, 2.6);

  // --- Deuce stop shelters ---
  const shelterGlass = new THREE.MeshStandardMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.35, roughness: 0.1 });
  const shelterFrame = mat(0x2d2f36, 0.4, 0.6);
  // The ad box behind the posters: lit, but far below the lamp heads (lampGlow) so it never blooms up close
  const adLight = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe4c0, emissiveIntensity: 0.1, roughness: 0.4 }), 0.08, 0.85);
  let adIdx = 0;
  for (const stop of deuceStops) {
    const x = stop.side * (half + 3.2);
    b.box(x + stop.side * 1.25, 0, stop.z, 0.1, 2.4, 4.6, shelterGlass, true, false);
    b.add(mesh(new THREE.BoxGeometry(2.6, 0.12, 5.0), shelterFrame, x, 2.5, stop.z));
    b.collider(x - 1.3, x + 1.3, stop.z - 2.5, stop.z + 2.5, 2.44, 2.56);
    b.add(bench(), x + stop.side * 0.6, 0, stop.z, stop.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    // Lit ad panel at the downstream end of the shelter (posters both faces)
    const adZ = stop.z + 2.45;
    b.add(mesh(new THREE.BoxGeometry(1.5, 2.2, 0.16), shelterFrame), x, 1.25, adZ);
    b.add(mesh(new THREE.BoxGeometry(1.32, 2.0, 0.17), adLight, x, 1.25, adZ));
    const pi = (adIdx++ * 3) % POSTER_COUNT;
    for (const f of [-1, 1]) {
      const pm = mesh(posterGeometry((pi + (f > 0 ? 0 : 1)) % POSTER_COUNT, 1.25, 1.8), signs(b), x, 1.25, adZ + f * 0.09);
      pm.rotation.y = f > 0 ? 0 : Math.PI;
      b.add(pm);
    }
    // RTC Deuce stop flag (black and gold DEUCE, blue RTC band, the stop), facing the oncoming bus
    b.add(deuceStopSign(b, stop.name), x - stop.side * 1.0, 0, stop.z - 3.1); // clear of the shelter roof
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
    buses.push({ mesh: built.group, laneX: def.x, dir: def.dir, speed: 9, stopTimer: 0, lastStop: NaN, wheels: built.wheels, deckOffset: built.deckOffset, halfLen: 6.3, swing: 0 });
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
    const westLim = i >= 4 ? -114 : -148;
    const c = car(kind, color);
    bakeGroup(c.group);
    b.scene.add(c.group);
    c.group.position.set(westLim + 16 + i * 38, 0, z);
    c.group.rotation.y = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    cars.push({ mesh: c.group, laneX: z, dir, speed: 10, cruise: 10 + i, halfLen: c.length / 2 + 0.3, axis: 'x' });
  });

  // LED billboard trucks circling the Boulevard (middle lane, one each way)
  const adLed = new LedBoard('TONIGHT', ['MAGIC • 7 & 9 PM', 'POOL PARTY SAT', 'ALL-YOU-CAN-EAT $39', 'FIGHT NIGHT LIVE', 'LOU THE CAT • WANTED'], ['#ff2c8a', '#2de2ff', '#ffd24d', '#7aff47', '#ff7a1a'], 512, 256);
  const adMat = new THREE.MeshBasicMaterial({ map: adLed.tex, color: 0xd8d8d8 });
  const adTrucks: THREE.Group[] = [];
  for (const [dir, z0] of [
    [1, -300],
    [-1, 380],
  ] as Array<[1 | -1, number]>) {
    const t = boxTruck(0x111114, 0x111114);
    for (const sx of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(5.9, 2.5), adMat);
      panel.position.set(sx * 1.28, 2.6, -0.9);
      panel.rotation.y = sx * Math.PI / 2;
      t.add(panel);
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), adMat);
    back.position.set(0, 2.55, -4.08);
    back.rotation.y = Math.PI;
    t.add(back);
    bakeGroup(t, (m) => m.material === adMat);
    const x = dir === 1 ? -STRIP.laneCenters[1] : STRIP.laneCenters[1];
    t.position.set(x, 0, z0);
    t.rotation.y = dir === 1 ? 0 : Math.PI;
    b.scene.add(t);
    adTrucks.push(t);
    cars.push({ mesh: t, laneX: x, dir, speed: 8, cruise: 8.5, halfLen: 4.9, axis: 'z' });
  }
  b.every((_dt, t) => {
    if (adTrucks.some((tr) => tr.visible && tr.position.distanceToSquared(viewer.cam) < 160 * 160)) adLed.draw(t);
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
      // a Deuce swinging out into this lane round a car at the curb: hang back behind it
      if (c.axis === 'z') {
        for (const bus of buses) {
          if (bus.swing < 0.15 || bus.dir !== c.dir || Math.abs(Math.sign(bus.laneX) * STRIP.laneCenters[1] - c.laneX) > 0.5) continue;
          const gap = (bus.mesh.position.z - pos) * c.dir - bus.halfLen - c.halfLen;
          if (gap > -bus.halfLen && gap < 14) target = Math.min(target, Math.max(0, (gap - 2.5) * 1.2));
        }
      }
      c.speed = THREE.MathUtils.lerp(c.speed, target, Math.min(1, dt * 2.2));
      const next = pos + c.dir * c.speed * dt;
      if (c.axis === 'z') {
        c.mesh.position.z = next;
        if (c.dir === 1 && next > STRIP.south) c.mesh.position.z = STRIP.north;
        if (c.dir === -1 && next < STRIP.north) c.mesh.position.z = STRIP.south;
      } else {
        const westLim = c.laneX > 200 ? -114 : -148;
        c.mesh.position.x = next;
        if (c.dir === 1 && next > STRIP.flamingoEast) c.mesh.position.x = westLim;
        if (c.dir === -1 && next < westLim) c.mesh.position.x = STRIP.flamingoEast;
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
      // A rideshare waiting at the curb doesn't hold the Deuce up: the bus swings out into the next lane, round
      // it and back in (yielding to that lane's traffic while it's out there).
      const passX = Math.sign(bus.laneX) * STRIP.laneCenters[1];
      let pass = false;
      for (const c of cars) {
        if (c.axis !== 'z' || !(Math.abs(c.laneX - bus.laneX) <= 0.5)) continue;
        const gap = (c.mesh.position.z - z) * bus.dir - c.halfLen - bus.halfLen;
        if (c.curbside && gap < 20 && gap > -2 * (c.halfLen + bus.halfLen) - 3) {
          pass = true;
          if (bus.swing < 0.9 && gap > 0) target = Math.min(target, Math.max(1.5, gap * 0.6)); // ease out before it
          continue;
        }
        if (gap > 0 && gap < 14) target = Math.min(target, Math.max(0, (gap - 2.5) * 1.2));
      }
      if (pass || bus.swing > 0) {
        for (const c of cars) {
          if (c.axis !== 'z' || c.dir !== bus.dir || !(Math.abs(c.laneX - passX) <= 0.5)) continue;
          const gap = (c.mesh.position.z - z) * bus.dir - c.halfLen - bus.halfLen;
          if (gap > 0 && gap < 14) target = Math.min(target, Math.max(0, (gap - 2.5) * 1.2));
        }
      }
      const x0 = bus.mesh.position.x;
      bus.swing = THREE.MathUtils.clamp(bus.swing + (pass ? 0.6 : -0.6) * dt, 0, 1);
      bus.mesh.position.x = THREE.MathUtils.lerp(bus.laneX, passX, THREE.MathUtils.smoothstep(bus.swing, 0, 1));
      // nose into the lane change instead of crabbing sideways
      bus.mesh.rotation.y = Math.atan2((bus.mesh.position.x - x0) / Math.max(dt, 1e-4), bus.dir * Math.max(target, 2));
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

/**
 * Pedestrian countdown head for a mid-block crosswalk: a walking person while cars hold (first 3 s), then a
 * flashing orange hand with the seconds left, then a steady hand. Redrawn only when the shown state changes
 * and the crossing is within 150 m of the camera.
 */
function pedCountdown(b: WorldBuilder, z: number, offset: number, clock: () => number): THREE.MeshBasicMaterial {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex, color: 0xdddddd });
  let last = '';
  const hand = (col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(18, 22, 26, 30);
    for (let i = 0; i < 4; i++) ctx.fillRect(18 + i * 6.8, 8 + (i === 0 || i === 3 ? 6 : 0), 5, 18);
    ctx.fillRect(40, 30, 10, 6);
  };
  const walker = () => {
    ctx.fillStyle = '#f4f4f0';
    ctx.beginPath();
    ctx.arc(32, 12, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(28, 19, 8, 20);
    ctx.save();
    ctx.translate(32, 38);
    for (const a of [-0.45, 0.45]) {
      ctx.save();
      ctx.rotate(a);
      ctx.fillRect(-3, 0, 6, 20);
      ctx.restore();
    }
    ctx.restore();
    ctx.fillRect(22, 22, 4, 14);
    ctx.fillRect(38, 22, 4, 14);
  };
  b.every(() => {
    if (Math.abs(viewer.cam.z - z) > 150 || Math.abs(viewer.cam.x) > 150) return;
    const cyc = (clock() + offset) % CROSSWALK_CYCLE;
    let state: string;
    let secs = 0;
    if (cyc >= 22 && cyc < 25) {
      state = 'walk';
      secs = Math.ceil(CROSSWALK_CYCLE - cyc);
    } else if (cyc >= 25) {
      secs = Math.ceil(CROSSWALK_CYCLE - cyc);
      state = (cyc * 2) % 2 < 1.1 ? 'flash-on' : 'flash-off';
    } else state = 'hand';
    const key = `${state}|${secs}`;
    if (key === last) return;
    last = key;
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, 0, 128, 64);
    if (state === 'walk') walker();
    else if (state === 'flash-on' || state === 'hand') hand('#ff7a1a');
    if (secs > 0) {
      ctx.fillStyle = '#ff8a2a';
      ctx.font = 'bold 44px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(secs).padStart(2, '0'), 94, 34);
    }
    tex.needsUpdate = true;
  });
  return m;
}

/** Flat ground patch whose UVs are world metres / `scale`, so one shared material tiles seamlessly. */
function worldUvPlane(w: number, d: number, x: number, y: number, z: number, scale: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d, 1, Math.max(1, Math.round(d / 40)));
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / scale, p.getZ(i) / scale);
  return g;
}

function buildSkybridges(b: WorldBuilder, zc: number, labels: [string, string, string, string] | string[], sideName: string, zoneName: string): void {
  const y = STRIP.bridgeY;
  const deck = mat(0xb8b2a8, 0.7, 0.15);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.32, roughness: 0.08 });
  const steel = mat(0x5b6068, 0.35, 0.7);
  const escRail = mat(0x111114, 0.4, 0.2);
  const escCab = mat(0xfff1d6, 0.4, 0, { emissive: 0xffd9a0, emissiveIntensity: 0.35 });
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
    // Spans the Boulevard: Strip traffic reads the cross street and the resorts it links
    b.add(bridgeFascia(b, sideName, label, '#ff8ad8', 10, 1.2), 0, y - 0.7, zc + sz + (sz < 0 ? -1 : 1) * (wDeck / 2 + 0.08), sz < 0 ? Math.PI : 0);
  }
  for (const [sx, label] of [
    [-X, labels[2]],
    [X, labels[3]],
  ] as const) {
    b.box(sx, y, zc, wDeck, 0.4, Z * 2 - wDeck, deck);
    for (const e of [-1, 1]) b.box(sx + e * (wDeck / 2 - 0.1), y + 0.4, zc, 0.12, 1.15, Z * 2 - wDeck * 2, glass, true, false);
    b.add(mesh(new THREE.BoxGeometry(wDeck + 0.6, 0.2, Z * 2), steel, sx, y + 3.6, zc));
    // Spans the cross street: its traffic reads the Boulevard
    b.add(bridgeFascia(b, 'LAS VEGAS BLVD', label, '#7dffb0', 8, 1.1), sx + (sx < 0 ? -1 : 1) * (wDeck / 2 + 0.08), y - 0.6, zc, sx < 0 ? -Math.PI / 2 : Math.PI / 2);
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
      // Escalator dressing over the stair run: glass balustrades, black handrails, steel skirts
      const runLen = steps * 0.7;
      const zMid = cz + sz * (wDeck / 2 + 0.35 + runLen / 2 - 0.35);
      const slope = Math.atan2(y + 0.4, runLen) * sz;
      const L = Math.hypot(runLen, y + 0.4);
      for (const e of [-1, 1]) {
        const ex = cx + sx * 0.4 + e * 1.36;
        const gl = mesh(new THREE.BoxGeometry(0.06, 0.95, L), glass, ex, (y + 0.4) / 2 + 0.75, zMid);
        gl.rotation.x = slope;
        b.add(gl);
        const rail = mesh(new THREE.BoxGeometry(0.1, 0.08, L + 0.4), escRail, ex, (y + 0.4) / 2 + 1.25, zMid);
        rail.rotation.x = slope;
        b.add(rail);
        const skirt = mesh(new THREE.BoxGeometry(0.08, 0.7, L), steel, ex, (y + 0.4) / 2 - 0.1, zMid);
        skirt.rotation.x = slope;
        b.add(skirt);
      }
      // Glass elevator tower on the street side of each corner landing (looks only)
      const exX = sx * 18.9;
      b.box(exX, 0, cz, 2.4, y + 3.9, 2.4, glass, true, false);
      for (const [px, pz] of [
        [-1.15, -1.15],
        [1.15, -1.15],
        [-1.15, 1.15],
        [1.15, 1.15],
      ]) b.add(mesh(new THREE.BoxGeometry(0.14, y + 4.0, 0.14), steel, exX + px, (y + 4.0) / 2, cz + pz));
      b.add(mesh(new THREE.BoxGeometry(2.6, 0.3, 2.6), steel, exX, y + 4.05, cz));
      b.add(mesh(new THREE.BoxGeometry(1.7, 2.3, 1.7), escCab, exX, sx * sz > 0 ? 1.25 : y + 1.6, cz));
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
