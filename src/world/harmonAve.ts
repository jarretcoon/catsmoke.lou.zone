import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { tower } from './buildings';
import {
  crosswalk,
  frames,
  junctionBox,
  laneArrow,
  layRoad,
  offsetLine,
  pathTraffic,
  roadPaint,
  signal,
  stopBar,
  stripSidePhase,
  turn,
  twoPhase,
  type P,
  type Phase,
  type TrafficPath,
} from './crossRoadKit';
import { mat } from './props';
import { driveLed, ledFaces, letters, placed } from './signKit';
import { Merger, palmInto } from './southKit';
import { CROSSWALKS, crosswalkPhase, STRIP } from './strip';
import { LedBoard } from './textures';
import { chainFenceInto } from './westKit';

/**
 * Harmon Avenue, both sides of the Strip (OSM ways "East/West Harmon Avenue", map data © OpenStreetMap
 * contributors; Commons street photos of Harmon Corner, Elara, Polo Towers, Grand Chateau and the Signature
 * towers as reference). The real street is a 6-to-9-lane arterial; at the game's scale (street sections life
 * size, frontages ÷3.2 along the Strip) it is two lanes each way plus a landscaped median, signalised at the
 * Boulevard, at the PH garage / Signature drive and at Koval Ln.
 *
 * East of the Strip (centreline z = 214.8): Harmon Corner on Planet Hollywood's corner (Walgreens, Fat
 * Tuesday, Taco Bell Cantina, McDonald's, Bubba Gump, Buffalo Wild Wings, Nacho Daddy and the big corner
 * screen), the Miracle Mile's Harmon entrance and the V and Saxe theaters, Elara's red fin, the PH self-park
 * garage across from the Signature at MGM Grand's three towers, Polo Towers' purple-lit edges, Marriott's
 * Grand Chateau with its green mansard, the Carriage House, and Topgolf's nets at Koval.
 * West of the Strip: between the Cosmopolitan's motor-lobby side and Crystals (ARTE MUSEUM), past Vdara and
 * the ARIA/Vdara garage to the I-15 Harmon bridge (interstate.ts) at x −148, z 221.
 * The Boulevard side of the crossing (crosswalk on the south leg, the stop lines, the cut median) is the
 * 'Harmon Ave' entry in strip.ts CROSSWALKS; the 2012 skybridge just north of it is stripBridges.ts.
 */

export const HARMON_Z = 214.8;
const LANES = { each: 2, laneW: 3.0, median: 'raised' as const, medianW: 2.0 };
const CURB = STRIP.curb;
const KOVAL_X0 = 181.5;
const KOVAL_X1 = 190.5;
const MID_X = 131; // PH garage exit / Signature drive

/** East Harmon centreline (first point at the Boulevard curb, heading east; its right side is south). */
const EAST: P[] = [
  [CURB, HARMON_Z],
  [203, HARMON_Z],
];
/** West Harmon centreline (heading west from the Boulevard; its right side is north), jogging north round
 *  ARIA's crescent tip and then down onto the I-15 bridge deck at z 221. */
const WEST: P[] = [
  [-CURB, HARMON_Z],
  [-90, HARMON_Z],
  [-98, 213.2],
  [-124, 213.2],
  [-140, 219.6],
  [-148, 221],
];

const harmonCross = (): ((t: number) => Phase) => stripSidePhase(CROSSWALKS.find((c) => c.name === 'Harmon Ave')!.offset);
const stripLanes = (): ((t: number) => Phase) => {
  const off = CROSSWALKS.find((c) => c.name === 'Harmon Ave')!.offset;
  return (t) => crosswalkPhase(t, off);
};

export function buildHarmonAve(b: WorldBuilder): void {
  const mg = new Merger();
  const east = layRoad(b, mg, {
    name: 'E Harmon Ave',
    pts: EAST,
    lanes: LANES,
    walk: [1.6, 4.6],
    gaps: [
      [KOVAL_X0 - CURB - 1.4, KOVAL_X1 - CURB + 1.4, -1],
      [KOVAL_X0 - CURB - 1.4, KOVAL_X1 - CURB + 1.4, 1],
      [MID_X - CURB - 5, MID_X - CURB + 5, 1],
      [MID_X - CURB - 5, MID_X - CURB + 5, -1],
    ],
    medianCuts: [
      [0, 16],
      [MID_X - CURB - 9, MID_X - CURB + 7],
      [KOVAL_X0 - CURB - 12, 999],
    ],
    lights: { every: 26, first: 22 },
    palms: 9,
    zone: 'Harmon Ave',
    mapLabel: 'E Harmon Ave',
  });
  const west = layRoad(b, mg, {
    name: 'W Harmon Ave',
    pts: WEST,
    lanes: LANES,
    walk: [3.2, 2.8],
    medianCuts: [
      [0, 16],
      [126, 999],
    ],
    lights: { every: 26, first: 22 },
    palms: 9,
    zone: 'Harmon Ave',
    mapLabel: 'W Harmon Ave',
  });

  // ---- paint: the Strip-side crosswalks over each mouth, stop bars, arrows; Koval and the mid signal
  crosswalk(mg, east, 3.2);
  crosswalk(mg, west, 3.2);
  stopBar(mg, east, 5.6, -7, -1); // westbound (north half) holds before the crosswalk
  stopBar(mg, west, 5.6, -7, -1); // eastbound on the west side (its left half = south)
  for (const k of [0, 1]) {
    laneArrow(mg, east, 12, east.laneOffset(-1, k), -1, k === 1 ? 'left' : 'right');
    laneArrow(mg, west, 12, west.laneOffset(-1, k), -1, k === 1 ? 'left' : 'right');
    laneArrow(mg, east, KOVAL_X0 - CURB - 10, east.laneOffset(1, k), 1, 'straight');
  }
  const sK0 = KOVAL_X0 - CURB;
  const sK1 = KOVAL_X1 - CURB;
  crosswalk(mg, east, sK0 - 2);
  crosswalk(mg, east, sK1 + 2);
  stopBar(mg, east, sK0 - 4.2, 1, 7);
  stopBar(mg, east, sK1 + 4.2, -7, -1);
  stopBar(mg, east, MID_X - CURB - 6, 1, 7);
  stopBar(mg, east, MID_X - CURB + 6, -7, -1);
  junctionBox(b, KOVAL_X0, KOVAL_X1, HARMON_Z - 7, HARMON_Z + 7);
  // Koval's own crosswalks over its north and south legs
  for (const z of [HARMON_Z - 9.3, HARMON_Z + 9.3]) {
    for (let x = KOVAL_X0 + 0.6; x < KOVAL_X1 - 0.3; x += 1.2) {
      const g = new THREE.PlaneGeometry(0.6, 3.2).rotateX(-Math.PI / 2);
      g.translate(x, 0.046, z);
      mg.add(g, roadPaint());
    }
  }

  // ---- signals
  const cross = harmonCross();
  signal(b, CURB + 6.2, HARMON_Z - 7.9, 0, 1, 6.6, cross, 'Las Vegas Blvd S'); // westbound, NE corner, arm south
  signal(b, -CURB - 6.2, HARMON_Z + 7.9, 0, -1, 6.6, cross, 'Las Vegas Blvd S'); // eastbound on the west side, SW corner
  const mid = twoPhase(36, 22, 5);
  signal(b, MID_X - 6, HARMON_Z + 7.9, 0, -1, 6.6, mid.main, 'Harmon Ave'); // eastbound
  signal(b, MID_X + 6, HARMON_Z - 7.9, 0, 1, 6.6, mid.main, 'Harmon Ave'); // westbound
  signal(b, MID_X + 5.5, HARMON_Z + 8.2, -1, 0, 4.2, mid.cross); // the Signature drive coming out
  signal(b, MID_X - 5.5, HARMON_Z - 8.2, 1, 0, 4.2, mid.cross); // the PH garage coming out
  const kov = twoPhase(40, 22, 13);
  signal(b, KOVAL_X0 - 1, HARMON_Z + 7.9, 0, -1, 6.6, kov.main, 'Koval Ln');
  signal(b, KOVAL_X1 + 1, HARMON_Z - 7.9, 0, 1, 6.6, kov.main, 'Koval Ln');
  signal(b, KOVAL_X1 + 1, HARMON_Z + 7.9, -1, 0, 5.4, kov.cross, 'Harmon Ave');
  signal(b, KOVAL_X0 - 1, HARMON_Z - 7.9, 1, 0, 5.4, kov.cross, 'Harmon Ave');

  buildHarmonFrontage(b, mg);
  mg.flush(b);
  harmonTraffic(b, east.laneOffset, west.laneOffset, cross, mid.main, kov.main);
  b.zone('Harmon Ave & Koval Ln', KOVAL_X0 - 3, KOVAL_X1 + 3, HARMON_Z - 9, HARMON_Z + 9);
}

/** Arc length of the point on a polyline closest to (x, z). */
function sOn(pts: P[], x: number, z: number): number {
  const fr = frames(pts);
  let best = Infinity;
  let bs = 0;
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i];
    const c = fr[i + 1];
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const L2 = dx * dx + dz * dz || 1;
    const k = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
    const px = a.x + dx * k;
    const pz = a.z + dz * k;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      bs = a.s + k * Math.sqrt(L2);
    }
  }
  return bs;
}

function harmonTraffic(
  b: WorldBuilder,
  eOff: (side: -1 | 1, k: number) => number,
  wOff: (side: -1 | 1, k: number) => number,
  cross: (t: number) => Phase,
  mid: (t: number) => Phase,
  kov: (t: number) => Phase
): void {
  const strip = stripLanes();
  const L = STRIP.laneCenters; // [3.1, 6.5, 9.9]
  const paths: TrafficPath[] = [];
  const add = (pts: P[], count: number, stops: Array<[number, number, (t: number) => Phase]>) => {
    paths.push({ pts, count, speed: 11.5, stops: stops.map(([x, z, phase]) => ({ s: sOn(pts, x, z), phase })) });
  };
  // ---- east side
  const ebCurb = HARMON_Z + eOff(1, 0);
  const ebIn = HARMON_Z + eOff(1, 1);
  const wbCurb = HARMON_Z + eOff(-1, 0);
  const wbIn = HARMON_Z + eOff(-1, 1);
  // eastbound: right turn in from the northbound curb lane; left turn in from the southbound inner lane
  add([[L[2], 262], [L[2], 232], ...turn(L[2], 232, L[2], ebCurb, CURB + 6, ebCurb), [CURB + 6, ebCurb], [203, ebCurb]], 5, [
    [MID_X - 6, ebCurb, mid],
    [KOVAL_X0 - 4.2, ebCurb, kov],
  ]);
  add([[-L[1], 160], [-L[1], 203], ...turn(-L[1], 203, -L[1] + 2, ebIn, CURB + 2, ebIn), [CURB + 2, ebIn], [203, ebIn]], 4, [
    [-L[1], 205.6, strip],
    [MID_X - 6, ebIn, mid],
    [KOVAL_X0 - 4.2, ebIn, kov],
  ]);
  // westbound: right turn out onto the northbound curb lane; left turn out onto the southbound inner lane
  add([[203, wbCurb], [CURB + 6, wbCurb], ...turn(CURB + 6, wbCurb, L[2], wbCurb, L[2], 200), [L[2], 200], [L[2], 110]], 5, [
    [KOVAL_X1 + 4.2, wbCurb, kov],
    [MID_X + 6, wbCurb, mid],
    [CURB + 5.4, wbCurb, cross],
  ]);
  add([[203, wbIn], [CURB + 5.4, wbIn], ...turn(CURB + 5.4, wbIn, -L[1], wbIn, -L[1], 232), [-L[1], 232], [-L[1], 320]], 4, [
    [KOVAL_X1 + 4.2, wbIn, kov],
    [MID_X + 6, wbIn, mid],
    [CURB + 5.4, wbIn, cross],
  ]);
  // ---- west side (its "right" half is north: westbound)
  const wWbCurb = offsetLine(WEST, wOff(1, 0));
  const wWbIn = offsetLine(WEST, wOff(1, 1));
  const wEbCurb = offsetLine(WEST, wOff(-1, 0), true);
  const wEbIn = offsetLine(WEST, wOff(-1, 1), true);
  // westbound: right turn in from the southbound curb lane, left turn in from the northbound inner lane
  const z0 = wWbCurb[0][1];
  add([[-L[2], 150], [-L[2], 196], ...turn(-L[2], 196, -L[2], z0, -CURB - 6, z0), ...wWbCurb.filter((p) => p[0] < -CURB - 6)], 4, []);
  const z1 = wWbIn[0][1];
  add([[L[1], 280], [L[1], 230], ...turn(L[1], 230, L[1] - 2, z1, -CURB - 2, z1), ...wWbIn.filter((p) => p[0] < -CURB - 2)], 3, [[L[1], 230.4, strip]]);
  // eastbound: right turn out onto the southbound curb lane, left turn out onto the northbound inner lane
  const zE0 = wEbCurb[wEbCurb.length - 1][1];
  add([...wEbCurb.filter((p) => p[0] < -CURB - 6), [-CURB - 6, zE0], ...turn(-CURB - 6, zE0, -L[2], zE0, -L[2], 230), [-L[2], 230], [-L[2], 330]], 4, [
    [-CURB - 5.4, zE0, cross],
  ]);
  const zE1 = wEbIn[wEbIn.length - 1][1];
  add([...wEbIn.filter((p) => p[0] < -CURB - 5.4), [-CURB - 5.4, zE1], ...turn(-CURB - 5.4, zE1, L[1], zE1, L[1], 200), [L[1], 200], [L[1], 110]], 3, [
    [-CURB - 5.4, zE1, cross],
  ]);
  pathTraffic(b, paths, [20, HARMON_Z], 320, 214);
}

// ================================================================ frontage

/** Compress what `build` adds along z from z0…z1 into n0…z1 (pivot z1): objects, colliders, zones and map features. */
export function squashZ(b: WorldBuilder, z0: number, z1: number, n0: number, build: () => void): void {
  const k = (z1 - n0) / (z1 - z0);
  const nRoot = b.root.children.length;
  const nCol = b.colliders.length;
  const nZone = b.zones.length;
  build();
  const g = new THREE.Group();
  g.position.z = z1;
  g.scale.z = k;
  for (const o of b.root.children.slice(nRoot)) {
    o.position.z -= z1;
    g.add(o);
  }
  b.root.add(g);
  const f = (z: number) => z1 - (z1 - z) * k;
  for (let i = nCol; i < b.colliders.length; i++) {
    const c = b.colliders[i];
    c.minZ = f(c.minZ);
    c.maxZ = f(c.maxZ);
  }
  for (let i = nZone; i < b.zones.length; i++) {
    const zn = b.zones[i];
    zn.minZ = f(zn.minZ);
    zn.maxZ = f(zn.maxZ);
    zn.area = (zn.maxX - zn.minX) * (zn.maxZ - zn.minZ);
  }
}

function sign(b: WorldBuilder, text: string, w: number, h: number, x: number, y: number, z: number, rot: number, o: Parameters<typeof letters>[4]): void {
  b.add(letters(b, text, w, h, o), x, y, z, rot);
}

const N_FACE = Math.PI; // a sign on a north-facing wall (faces −z)
const S_FACE = 0; // faces +z

function buildHarmonFrontage(b: WorldBuilder, mg: Merger): void {
  const zN = HARMON_Z - 7 - 1.6; // north building line (206.2)
  const zS = HARMON_Z + 7 + 4.6; // south sidewalk back edge (226.4)
  const glass = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x1d2a36, roughness: 0.12, metalness: 0.4, emissive: 0xffd9a6, emissiveIntensity: 0.05 }), 0.05, 0.75);
  const dark = mat(0x1c1d22, 0.55, 0.3);
  const mull = mat(0x3a3d44, 0.5, 0.6);

  // ---- Harmon Corner (2014): three floors of glass across PH's south end, x 21…62
  const hcz = 206.04;
  mg.box(glass, 41.5, 1.9, hcz + 0.05, 41, 3.4, 0.1);
  mg.box(glass, 41.5, 6.2, hcz + 0.05, 41, 3.2, 0.1);
  mg.box(glass, 41.5, 10.3, hcz + 0.05, 41, 3.0, 0.1);
  for (const y of [3.8, 8.0, 12.2]) mg.box(dark, 41.5, y, hcz + 0.2, 41.2, 0.5, 0.4);
  for (let x = 21.5; x <= 61.6; x += 2.5) mg.box(mull, x, 6, hcz + 0.12, 0.12, 12, 0.14);
  // patio canopy over the Taco Bell Cantina terrace
  mg.box(dark, 30.5, 3.55, hcz + 1.1, 9, 0.12, 2.2);
  const purple = mat(0x5a2a86, 0.45, 0.2);
  mg.box(purple, 30.5, 3.65, hcz + 2.2, 9, 0.3, 0.08);
  // the corner video screen (wraps nothing: it faces Harmon), driven like the Strip's boards
  const led = new LedBoard('HARMON CORNER', ['TACO BELL CANTINA', 'BUBBA GUMP • UPSTAIRS', 'SUGAR FACTORY', 'NACHO DADDY', 'HAPPY HOUR 3-6'], ['#7a2cff', '#ff2c8a', '#20d0ff', '#ffb000', '#2cff9a'], 512, 256);
  b.add(placed(ledFaces(led, 8, 4.2, 0.3, false), 26, 9.8, hcz + 0.4));
  driveLed(b, led, 26, 9.8, hcz + 0.4, 260);
  // tenants: ground floor west → east, upstairs, and the rooftop names
  sign(b, 'Walgreens', 4.6, 0.9, 25.5, 3.0, hcz + 0.42, S_FACE, { style: 'script', fill: '#e31837', bg: '#ffffff', scale: 0.8 });
  sign(b, 'FAT TUESDAY', 4.2, 0.7, 31.5, 4.3, hcz + 2.3, S_FACE, { style: 'block', fill: '#ffd21f', edge: '#4a1a6a' });
  sign(b, 'cocolini', 3.0, 0.7, 36.5, 3.05, hcz + 0.42, S_FACE, { style: 'script', fill: '#f4d6a0', bg: '#3b1f14', scale: 0.8 });
  sign(b, "PIZZA D'ITALIA", 4.4, 0.75, 41.5, 3.05, hcz + 0.42, S_FACE, { style: 'block', fill: '#ffffff', bg: '#c4201c', scale: 0.7 });
  sign(b, 'TACO BELL', 7.5, 1.3, 33, 6.6, hcz + 0.42, S_FACE, { style: 'block', fill: '#ffffff', edge: '#2a0a3a', sub: 'cantina', subStyle: 'serif', subFill: '#ffffff' });
  sign(b, "McDonald's", 4.0, 1.0, 44, 6.6, hcz + 0.42, S_FACE, { style: 'sans', fill: '#ffc72c', bg: '#da291c', scale: 0.7 });
  sign(b, 'SUBWAY', 3.6, 0.8, 49.5, 6.6, hcz + 0.42, S_FACE, { style: 'block', fill: '#ffcc00', bg: '#008938', scale: 0.7 });
  sign(b, 'BUFFALO WILD WINGS', 7.0, 0.9, 54.5, 3.05, hcz + 0.42, S_FACE, { style: 'block', fill: '#ffc600', bg: '#111111', scale: 0.7 });
  sign(b, 'NACHO DADDY', 5.0, 0.9, 58.5, 10.4, hcz + 0.42, S_FACE, { style: 'block', fill: '#ff6a00', edge: '#1a1a1a' });
  sign(b, 'BUBBA GUMP SHRIMP CO.', 10, 1.2, 38, 12.95, hcz + 0.5, S_FACE, { style: 'serif', fill: '#ffffff', bg: '#1d4f8a', rule: '#d4b060', scale: 0.62 });
  sign(b, 'SUGAR FACTORY', 6, 0.9, 49, 10.4, hcz + 0.42, S_FACE, { style: 'serif', fill: '#ff6fb5', edge: '#3a0a22' });
  sign(b, 'RAINFOREST CAFE', 6, 0.8, 33.5, 10.4, hcz + 0.42, S_FACE, { style: 'serif', fill: '#f2d24a', bg: '#1f4a24', scale: 0.7 });
  b.zone('Harmon Corner', 21, 62, 204, 207.8);

  // ---- the Miracle Mile's Harmon side: shops, the V and Saxe theaters, valet, x 64…110
  b.box(87, 0, 196, 46, 13, 20, mat(0xd8d0c6, 0.8), true);
  b.building(87, 196, 46, 20, '#2a2a32', 'Miracle Mile Shops (Harmon)');
  mg.box(glass, 87, 1.8, 206.05, 42, 3.2, 0.1);
  for (let x = 66; x <= 108; x += 3) mg.box(mull, x, 1.8, 206.12, 0.12, 3.4, 0.12);
  mg.box(dark, 87, 3.7, 206.6, 44, 0.4, 1.2);
  const red = mat(0xc41e2a, 0.5);
  mg.box(red, 70, 8.4, 206.2, 6, 8, 0.3); // the Miracle Mile "M" pylon face
  sign(b, 'M', 4.2, 4.6, 70, 9.4, 206.4, S_FACE, { style: 'block', fill: '#ffffff' });
  sign(b, 'MIRACLE MILE SHOPS', 14, 1.6, 86, 10.2, 206.1, S_FACE, { style: 'sans', fill: '#ffffff', edge: '#7a0e16' });
  sign(b, 'V THEATER', 5.2, 1.0, 96, 6.2, 206.1, S_FACE, { style: 'deco', fill: '#ffd56a', bg: '#1a0f2e', rule: '#ffd56a', scale: 0.7 });
  sign(b, 'SAXE THEATER', 6, 1.0, 104, 6.2, 206.1, S_FACE, { style: 'deco', fill: '#ffffff', bg: '#7a0e16', rule: '#e8c070', scale: 0.7 });
  sign(b, 'OCEAN ONE BAR & GRILLE', 7.5, 0.7, 78, 3.0, 206.75, S_FACE, { style: 'sans', fill: '#7fe0ff', bg: '#0b2b44', scale: 0.7 });
  sign(b, 'PH LIVE', 4, 0.9, 88, 6.2, 206.1, S_FACE, { style: 'block', fill: '#ffffff', bg: '#5a1a8a', scale: 0.7 });
  b.zone('Miracle Mile Shops (Harmon entrance)', 64, 110, 186, 207.5);

  // ---- Elara (Hilton Grand Vacations, 2009): dark blue glass, the red blade up its south-west edge
  const fin = mat(0xb01820, 0.35, 0.4, { emissive: 0x400406, emissiveIntensity: 0.4 });
  mg.box(fin, 112.7, 31, 202.4, 0.9, 52, 1.6);
  mg.box(fin, 113.6, 55.5, 202.6, 2.6, 3.4, 1.2);
  sign(b, 'Hilton Grand Vacations', 12, 1.3, 120.5, 53.5, 203.08, S_FACE, { style: 'serif', fill: '#ffffff' });
  sign(b, 'ELARA', 3.2, 1.2, 118, 2.4, 205.9, S_FACE, { style: 'thin', fill: '#e8e8ea', bg: '#1a1c22', rule: '#9aa0a8', sub: 'HILTON GRAND VACATIONS', scale: 0.55 });
  mg.box(dark, 118, 1.2, 205.6, 3.4, 2.4, 0.4);

  // ---- PH garage (backOfHouse.ts, north side) gets its Harmon signs
  sign(b, 'ENTER', 2.6, 0.8, MID_X + 6, 3.4, 204.35, S_FACE, { style: 'block', fill: '#ffffff', bg: '#127a3a', scale: 0.6 });

  // ---- south side: Polo Towers (1993): pink stucco, purple LED up every edge
  tower(b, {
    x: 77,
    z: 264,
    w: 18,
    d: 38,
    h: 24,
    facade: { wall: '#d9b3ab', mullion: '#c7a097', glass: '#3a3f4a', lit: '#ffd9a0', cols: 8, rows: 7, style: 0, seed: 3745 },
    accent: 0x8a5cff,
    edgeLed: 0x8a5cff,
    ledFins: false,
    crownGlow: 1.2,
  });
  b.building(77, 264, 18, 38, '#c9a19a', 'Polo Towers');
  sign(b, 'POLO TOWERS', 8, 1.1, 77, 21.3, 244.9, N_FACE, { style: 'sans', fill: '#ffffff' });
  sign(b, 'HILTON VACATION CLUB', 7, 0.6, 77, 2.6, 244.9, N_FACE, { style: 'sans', fill: '#ffffff', bg: '#20304a', scale: 0.7 });

  // ---- Marriott's Grand Chateau (2005): cream, dark window strips, green mansard crown
  const gc = { x: 99, z: 239.5, w: 22, d: 19, h: 40 };
  tower(b, {
    x: gc.x,
    z: gc.z,
    w: gc.w,
    d: gc.d,
    h: gc.h,
    facade: { wall: '#efe3cc', mullion: '#e2d2b4', glass: '#2f343a', lit: '#ffe2a8', cols: 9, rows: 12, style: 0, seed: 75 },
    noSetback: true,
    ledFins: false,
    crownGlow: 0.3,
  });
  const copper = mat(0x8fbfa4, 0.6, 0.2);
  const roof = new THREE.CylinderGeometry(Math.hypot(gc.w, gc.d) * 0.36, Math.hypot(gc.w, gc.d) * 0.5, 4.5, 4, 1);
  roof.rotateY(Math.PI / 4);
  roof.scale(gc.w / Math.hypot(gc.w, gc.d) * 1.41, 1, gc.d / Math.hypot(gc.w, gc.d) * 1.41);
  mg.at(copper, roof, gc.x, gc.h + 2.2, gc.z);
  for (const dx of [-7, -2.3, 2.3, 7]) mg.box(mat(0xefe3cc, 0.7), gc.x + dx, gc.h + 1.6, gc.z - gc.d / 2 + 0.6, 1.2, 1.6, 0.9);
  b.building(gc.x, gc.z, gc.w, gc.d, '#e6d8bd', "Marriott's Grand Chateau");
  sign(b, "MARRIOTT'S GRAND CHATEAU", 10, 0.9, gc.x, 4.2, gc.z - gc.d / 2 - 0.05, N_FACE, { style: 'serif', fill: '#3a2a10', bg: '#efe3cc', scale: 0.62 });
  // the porte-cochère on Harmon
  mg.box(mat(0xe0d2b6, 0.7), gc.x, 4.4, gc.z - gc.d / 2 - 2.4, 9, 0.6, 4.6, 0, true);
  for (const dx of [-4, 4]) mg.box(mat(0xe0d2b6, 0.7), gc.x + dx, 2.1, gc.z - gc.d / 2 - 4.2, 0.6, 4.2, 0.6);

  // ---- The Carriage House (low tan hotel), then the Signature drive
  tower(b, { x: 114.5, z: 237, w: 7, d: 12, h: 14, facade: { wall: '#c9b08c', mullion: '#a88e6a', glass: '#2e3238', lit: '#ffd9a0', cols: 3, rows: 4, style: 0, seed: 105 }, ledFins: false, crownGlow: 0 });
  sign(b, 'THE CARRIAGE HOUSE', 5.5, 0.6, 114.5, 3.2, 230.95, N_FACE, { style: 'serif', fill: '#2a1a0a', bg: '#e8dcc4', scale: 0.7 });

  // ---- The Signature at MGM Grand (2006-07): three cream towers with balconies and arched crowns
  mg.box(mat(0xe6dccb, 0.75), 137, 2.5, 260, 20, 5, 60, 0, true);
  b.collider(127, 147, 230, 290, 0, 5, true);
  for (const [i, z] of [233, 255, 277].map((v, k) => [k, v + 5] as const)) {
    tower(b, {
      x: 137,
      z,
      w: 13,
      d: 10,
      h: 46 - i * 1.5,
      y: 0,
      facade: { wall: '#eee6d6', mullion: '#e0d6c4', glass: '#3c4652', lit: '#ffe6b8', cols: 6, rows: 16, style: 0, seed: 145 + i },
      balconies: { color: 0xf2eadb, every: 1 },
      noSetback: true,
      ledFins: false,
      crownGlow: 0.6,
    });
    const arch = new THREE.CylinderGeometry(6.2, 6.2, 1.2, 16, 1, false, -Math.PI / 2, Math.PI);
    arch.rotateX(Math.PI / 2);
    arch.scale(1, 0.42, 1);
    mg.at(mat(0xf2eadb, 0.6), arch, 137, 46 - i * 1.5, z - 5.05);
  }
  b.building(137, 260, 20, 60, '#e6dccb', 'The Signature at MGM Grand');
  sign(b, 'THE SIGNATURE', 7, 0.9, 137, 4.0, 229.9, N_FACE, { style: 'roman', fill: 'gold', edge: '#3a2a08' });
  sign(b, 'AT MGM GRAND', 4.5, 0.5, 137, 3.25, 229.9, N_FACE, { style: 'sans', fill: '#e8d4a0' });
  b.zone('The Signature at MGM Grand', 126, 148, 228, 292);

  // ---- Topgolf (2016): the hitting-bay building facing east over a green field inside tall nets
  const bay = mat(0x2a2e36, 0.6, 0.3);
  b.box(154, 0, 267, 8, 13, 62, bay, true);
  const tg = [0x00a3e0, 0xf6a01a, 0x8dc63f];
  for (let lvl = 0; lvl < 3; lvl++) mg.box(mat(tg[lvl], 0.5), 158.05, 3.6 + lvl * 4, 267, 0.12, 0.35, 61.8);
  for (let z = 238; z <= 296; z += 2.6) mg.box(mat(0x0e1014, 0.8), 158.1, 6.5, z, 0.1, 12, 0.1);
  const turf = mat(0x4f8f3a, 0.95);
  mg.box(turf, 169, 0.03, 267, 22, 0.06, 60);
  const ring = [0xe8352b, 0xf6c21a, 0x2ab04a, 0x2a6ad0, 0xffffff];
  [[166, 252], [172, 270], [167, 286], [176, 260], [176, 282]].forEach(([x, z], i) => {
    const g = new THREE.CylinderGeometry(1.6 + (i % 2), 1.6 + (i % 2), 0.08, 18);
    mg.at(mat(ring[i], 0.6), g, x, 0.07, z);
  });
  const pole = mat(0x6a6e76, 0.4, 0.7);
  const net = new THREE.MeshStandardMaterial({ color: 0x1a1d22, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 });
  const nets: Array<[number, number, number, number]> = [
    [158.5, 237, 179.5, 237],
    [179.5, 237, 179.5, 297],
    [158.5, 297, 179.5, 297],
  ];
  for (const [x0, z0, x1, z1] of nets) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const p = new THREE.PlaneGeometry(L, 20).translate(0, 10, 0).rotateY(Math.atan2(-(z1 - z0), x1 - x0));
    p.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    mg.add(p, net);
    const n = Math.max(1, Math.round(L / 15));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      mg.box(pole, x, 10.5, z, 0.45, 21, 0.45, 0, true);
      b.collider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0, 21, true);
    }
  }
  b.collider(158.5, 179.8, 236.8, 237.2, 0, 3, true);
  b.collider(179.4, 179.8, 237, 297, 0, 3, true);
  sign(b, 'TOPGOLF', 7, 1.6, 154, 11, 235.9, N_FACE, { style: 'block', fill: '#ffffff', edge: '#0a5a8a', spacing: 0.04 });
  b.building(154, 267, 8, 62, '#2a2e36', 'Topgolf');
  b.feature({ kind: 'park', x: 169, z: 267, w: 22, d: 60, color: '#4f8f3a', label: 'Topgolf' });
  b.zone('Topgolf Las Vegas', 150, 180, 236, 298);

  // ---- west side, north: the Cosmopolitan's Harmon side (motor lobby + self-park ramp), Vdara, the ARIA/Vdara garage
  const cz = 204.62;
  mg.box(dark, -43, 4.6, cz + 1.6, 30, 0.35, 3.2); // canopy over the motor-lobby lanes
  for (const x of [-56, -50, -36, -30]) mg.box(mull, x, 2.3, cz + 3.0, 0.3, 4.6, 0.3);
  mg.box(glass, -43, 2.2, cz + 0.05, 28, 4.0, 0.1);
  sign(b, 'THE COSMOPOLITAN', 11, 1.1, -43, 6.5, cz + 0.08, S_FACE, { style: 'thin', fill: '#ffffff', spacing: 0.18 });
  sign(b, 'VALET • SELF PARKING', 6.5, 0.6, -43, 5.15, cz + 3.25, S_FACE, { style: 'sans', fill: '#ffffff', bg: '#111216', scale: 0.7 });
  const cosmoLed = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x220a2a, emissive: 0xc040ff, emissiveIntensity: 0.3, roughness: 0.4 }), 0.25, 1.4);
  mg.box(cosmoLed, -43, 8.5, cz + 0.06, 34, 0.25, 0.08);
  for (const p of [-61, -25]) palmInto(mg, p, 206.3, 7.5, 7 + p, 0);
  // ARIA / Vdara self parking, north-west of Vdara (the bridge to I-15 lands beside it)
  b.box(-145, 0, 186, 26, 14, 36, mat(0xb8b2a8, 0.85), true);
  for (const y of [3.4, 6.8, 10.2]) mg.box(mat(0x6d727a, 0.7), -145, y, 186, 26.3, 0.5, 36.3);
  sign(b, 'ARIA • VDARA  SELF PARKING', 11, 1.0, -145, 11.6, 204.1, S_FACE, { style: 'sans', fill: '#ffffff', bg: '#20262e', scale: 0.62 });
  b.building(-145, 186, 26, 36, '#9a958c', 'ARIA • Vdara Self Parking');
  sign(b, 'VDARA', 4.6, 1.1, -113, 2.6, 205.4, S_FACE, { style: 'thin', fill: '#f0f2f4', bg: '#30343a', spacing: 0.3, scale: 0.6 });
  mg.box(dark, -113, 1.3, 205.1, 5, 2.6, 0.5);
  b.zone('Vdara Hotel & Spa', -124, -104, 160, 206);

  // ---- west side, south: Crystals' Harmon face (ARTE MUSEUM, inside since 2024) — the podium is squeezed to 225.5 (westSide.ts)
  const az = 225.45;
  mg.box(glass, -40, 2.4, az - 0.06, 34, 4.2, 0.1);
  const arte = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x0a0a10, emissive: 0x40e0ff, emissiveIntensity: 0.25, roughness: 0.3 }), 0.2, 1.3);
  mg.box(arte, -40, 6.6, az - 0.08, 14, 2.4, 0.08);
  sign(b, 'ARTE MUSEUM', 12, 1.6, -40, 6.6, az - 0.14, N_FACE, { style: 'thin', fill: '#ffffff', spacing: 0.25 });
  sign(b, 'IMMERSIVE MEDIA ART • THE SHOPS AT CRYSTALS', 10, 0.45, -40, 4.85, az - 0.14, N_FACE, { style: 'sans', fill: '#b8f4ff' });
  b.zone('ARTE MUSEUM Las Vegas', -59, -21, 225, 236);

  // planters with palms along the wide east sidewalk
  for (const x of [70, 84, 98, 112]) {
    mg.box(mat(0x8a7a66, 0.85), x, 0.3, zS - 1.2, 2.2, 0.6, 2.2, 0, true);
    palmInto(mg, x, zS - 1.2, 7 + (x % 3), x, 0.6);
    b.collider(x - 1.1, x + 1.1, zS - 2.3, zS - 0.1, 0, 0.6);
  }
  // the construction fence along the Topgolf / Koval corner
  chainFenceInto(b, mg, 180.4, 226, 180.4, 236.6, 2.2);
  void zN;
}
