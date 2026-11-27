import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { crosswalk, junctionBox, layRoad, pathTraffic, signal, stopBar, streetGarage, stripEnd, stripSidePhase, SIDE_CLOCK, type LaneLayout, type P, type Phase, type TrafficPath } from './crossRoadKit';
import { mat } from './props';
import { letters } from './signKit';
import { Merger, palmInto } from './southKit';
import { CROSSWALKS, crosswalkPhase, STRIP } from './strip';
import { chainFenceInto } from './westKit';

/**
 * The south Strip's cross streets (OSM ways "East/West Reno Avenue", "Mandalay Bay Road", "West/East Hacienda
 * Avenue"; map data © OpenStreetMap contributors):
 *
 * Reno Ave: west between Excalibur (its self-park garage on the north side) and Luxor (its garage on the
 * south side) out to Frank Sinatra Dr, under the Excalibur–Mandalay tram (its pier stands in the median);
 * east between the ballpark site (the fence steps back to make room) and the ampm/ARCO, past the Shrine of the
 * Most Holy Redeemer and the Desert Rose to the map edge. Signals at the Boulevard, at the ballpark gate /
 * church drive and at Frank Sinatra.
 *
 * Mandalay Bay Rd / Hacienda Ave: an offset crossing, as the real one is: Mandalay Bay Rd west between Luxor
 * and the W (ex-Delano) tower to Mandalay Bay's garage and Frank Sinatra Dr (extended south to meet it);
 * Hacienda Ave east along the north edge of the Diamond lot.
 */

const CURB = STRIP.curb;
const RENO_W_Z = 534;
const RENO_E_Z = 532;
const MBR_Z = 612.5;
const HAC_Z = 625;
const FS_X = -165.5; // Frank Sinatra Dr centreline

const RAISED: LaneLayout = { each: 2, laneW: 3.0, median: 'raised', medianW: 2.4 };
const PAINTED: LaneLayout = { each: 2, laneW: 3.0, median: 'paint', medianW: 0.6 };

const sidePhase = (name: string): ((t: number) => Phase) => stripSidePhase(CROSSWALKS.find((c) => c.name === name)!.offset);
const stripPhase = (name: string): ((t: number) => Phase) => {
  const off = CROSSWALKS.find((c) => c.name === name)!.offset;
  return (t) => crosswalkPhase(t, off);
};
const stopOf = (name: string): [number, number] => CROSSWALKS.find((c) => c.name === name)!.stop!;

function sign(b: WorldBuilder, text: string, w: number, h: number, x: number, y: number, z: number, rot: number, o: Parameters<typeof letters>[4]): void {
  b.add(letters(b, text, w, h, o), x, y, z, rot);
}

export function buildSouthCrossRoads(b: WorldBuilder): void {
  const mg = new Merger();
  const paths: TrafficPath[] = [];
  buildReno(b, mg, paths);
  buildMandalayHacienda(b, mg, paths);
  mg.flush(b);
  // one instanced traffic set for all four streets (simulated and drawn only while the camera is near)
  pathTraffic(b, paths, [0, 578], 330, 530);
}

// ================================================================ Reno Ave
function buildReno(b: WorldBuilder, mg: Merger, paths: TrafficPath[]): void {
  const name = 'Reno Ave';
  const side = sidePhase(name);
  const strip = stripPhase(name);
  // ---- west: to Frank Sinatra Dr; the tram pier (x −40) sits in the raised median
  const wPts: P[] = [
    [-CURB, RENO_W_Z],
    [FS_X + 5.5, RENO_W_Z],
  ];
  const w = layRoad(b, mg, {
    name: 'W Reno Ave',
    pts: wPts,
    lanes: RAISED,
    walk: [2.4, 2.6],
    medianCuts: [
      [0, 14],
      [wPts[0][0] - wPts[1][0] - 16, 999],
    ],
    lights: { every: 28, first: 20 },
    palms: 10,
    zone: 'Reno Ave',
    mapLabel: 'W Reno Ave',
  });
  const fsPh = SIDE_CLOCK;
  paths.push(...stripEnd(b, mg, { sgn: -1, pts: wPts, road: w, stripPhase: strip, sidePhase: side, stop: stopOf(name), inStops: [], outStops: [[w.len - 5, fsPh.main]], counts: [4, 3, 3, 3] }));
  stopBar(mg, w, w.len - 5, 0.4, 7);
  crosswalk(mg, w, w.len - 2.4);
  signal(b, FS_X + 6.5, RENO_W_Z - 8.2, 0, 1, 6.4, fsPh.main, 'Frank Sinatra Dr');
  signal(b, FS_X + 6.5, RENO_W_Z + 8.2, -1, 0, 4.6, fsPh.cross, 'Reno Ave');

  // ---- east: the ballpark fence steps back to z 523.4 (southStrip.ts); ARCO stays on the south corner
  const ePts: P[] = [
    [CURB, RENO_E_Z],
    [203, RENO_E_Z],
  ];
  const GATE_X = 70; // the ballpark's south gate / the church drive (the real signal at Duke Ellington Way)
  const e = layRoad(b, mg, {
    name: 'E Reno Ave',
    pts: ePts,
    lanes: PAINTED,
    walk: [2.0, 1.7],
    gaps: [
      [GATE_X - CURB - 4.5, GATE_X - CURB + 4.5, -1],
      [GATE_X - CURB - 4.5, GATE_X - CURB + 4.5, 1],
    ],
    lights: { every: 26, first: 18 },
    zone: 'Reno Ave',
    mapLabel: 'E Reno Ave',
  });
  const gate = SIDE_CLOCK;
  paths.push(...stripEnd(b, mg, { sgn: 1, pts: ePts, road: e, stripPhase: strip, sidePhase: side, stop: stopOf(name), outStops: [[GATE_X - CURB - 6, gate.main]], inStops: [[GATE_X - CURB + 6, gate.main]], counts: [4, 3, 4, 3] }));
  stopBar(mg, e, GATE_X - CURB - 6, 0.4, 6);
  stopBar(mg, e, GATE_X - CURB + 6, -6, -0.4);
  crosswalk(mg, e, GATE_X - CURB - 3.8);
  signal(b, GATE_X - 6, RENO_E_Z + 7.6, 0, -1, 6.0, gate.main, 'Reno Ave');
  signal(b, GATE_X + 6, RENO_E_Z - 7.6, 0, 1, 6.0, gate.main, 'Reno Ave');
  signal(b, GATE_X + 5.5, RENO_E_Z + 7.8, -1, 0, 4.2, gate.cross);

  // ---- west frontage: Excalibur's south side and its garage (north), the Luxor garage (south)
  streetGarage(b, mg, -158, -108, 496, 524, 4, 'Excalibur Self Parking', 's', 'EXCALIBUR  SELF PARKING', '#7a1414');
  streetGarage(b, mg, -158, -110, 543.6, 598, 4, 'Luxor Self Parking', 'n', 'LUXOR  SELF PARKING', '#14181e');
  sign(b, 'EXCALIBUR', 9, 1.6, -91.5, 30, 524.05, 0, { style: 'gothic', fill: '#d42a2a', edge: '#3a0a0a' });
  sign(b, 'SOUTH ENTRANCE • RENO AVE', 7, 0.6, -91.5, 4.3, 524.1, 0, { style: 'serif', fill: '#f4e6c0', bg: '#3a1a1a', scale: 0.7 });
  mg.box(mat(0x7a1414, 0.6), -91.5, 3.9, 525.3, 14, 0.5, 2.6, 0, true); // canopy over the south doors
  for (const x of [-98, -85]) mg.box(mat(0xe8dcc0, 0.7), x, 1.9, 526.4, 0.5, 3.8, 0.5);
  sign(b, 'LUXOR', 6, 1.2, -78, 4.2, 546.6, Math.PI, { style: 'egypt', fill: 'gold', edge: '#2a1a08' });

  // ---- east frontage: the Shrine of the Most Holy Redeemer (55 E Reno) and the Desert Rose (north side)
  const tan = mat(0xd9c3a0, 0.85);
  const roofM = mat(0x6e5a48, 0.8);
  b.box(84, 0, 556, 32, 9, 20, tan, true);
  // the nave's pitched roof (a gable running east-west) and a clerestory band under its eaves
  const gable = new THREE.CylinderGeometry(12.2, 12.2, 33, 3, 1);
  gable.rotateZ(Math.PI / 2);
  gable.rotateX(Math.PI / 6);
  gable.scale(1, 0.34, 0.9);
  mg.at(roofM, gable, 84, 9.0 + 12.2 * 0.34 * 0.5, 556);
  mg.box(mat(0x3a5a7a, 0.3, 0.3), 84, 8.4, 545.95, 31, 0.8, 0.1);
  b.box(68.5, 0, 545.5, 4.5, 24, 4.5, tan, true); // bell tower
  mg.box(mat(0xf2ead8, 0.6), 68.5, 26.2, 545.5, 0.35, 4.4, 0.35);
  mg.box(mat(0xf2ead8, 0.6), 68.5, 27.2, 545.5, 2.2, 0.35, 0.35);
  for (let x = 72; x < 99; x += 3.4) mg.box(mat(0x3a5a7a, 0.3, 0.3), x, 4.6, 545.95, 1.6, 6.5, 0.1); // tall nave windows
  sign(b, 'SHRINE OF THE MOST HOLY REDEEMER', 13, 0.7, 84, 1.4, 545.4, Math.PI, { style: 'serif', fill: '#3a2a10', bg: '#efe3cc', scale: 0.62 });
  b.building(84, 556, 32, 20, '#d9c3a0', 'Shrine of the Most Holy Redeemer');
  b.zone('Shrine of the Most Holy Redeemer', 66, 100, 543, 566);
  // the Desert Rose Resort: three-storey Spanish-style blocks round a courtyard, north of Reno past the ballpark
  for (const [x, z, w2, d2] of [
    [124, 496, 30, 8],
    [124, 516, 30, 8],
    [112.5, 506, 7, 12],
  ] as Array<[number, number, number, number]>) {
    b.box(x, 0, z, w2, 9, d2, mat(0xe8d8bc, 0.85), true);
    mg.box(mat(0xb5583a, 0.8), x, 9.3, z, w2 + 0.6, 0.6, d2 + 0.6);
  }
  palmInto(mg, 128, 506, 7.5, 3);
  palmInto(mg, 120, 506, 8.2, 4);
  sign(b, 'DESERT ROSE RESORT', 7, 0.8, 124, 7.2, 520.05, 0, { style: 'serif', fill: '#8a2a1a', bg: '#f4ead8', scale: 0.7 });
  b.zone('Desert Rose Resort', 108, 140, 491, 521);
  // low business frontage further east on the south side: the motel + a body shop and a storage yard
  b.box(150, 0, 551, 34, 7, 12, mat(0xc8c0b0, 0.85), true);
  sign(b, 'RENO AVE MOTEL • WEEKLY RATES', 9, 0.8, 150, 5.5, 544.9, Math.PI, { style: 'sans', fill: '#ffffff', bg: '#1a5a8a', scale: 0.7 });
  b.box(186, 0, 552, 24, 6, 14, mat(0xa8a49c, 0.85), true);
  sign(b, 'AUTO BODY & PAINT', 7, 0.8, 186, 4.6, 544.9, Math.PI, { style: 'block', fill: '#1a1a1a', bg: '#f2c230', scale: 0.7 });
  b.building(150, 551, 34, 12, '#c8c0b0');
  b.building(186, 552, 24, 14, '#a8a49c');
  chainFenceInto(b, mg, 112, 540.4, 132, 540.4, 2.0);
}

// ================================================================ Mandalay Bay Rd / Hacienda Ave
function buildMandalayHacienda(b: WorldBuilder, mg: Merger, paths: TrafficPath[]): void {
  const name = 'Mandalay Bay Rd / Hacienda';
  const side = sidePhase(name);
  const strip = stripPhase(name);
  // ---- west: Mandalay Bay Rd to Frank Sinatra Dr
  const wPts: P[] = [
    [-CURB, MBR_Z],
    [-96, MBR_Z],
    [FS_X + 5.5, MBR_Z],
  ];
  const w = layRoad(b, mg, {
    name: 'Mandalay Bay Rd',
    pts: wPts,
    lanes: RAISED,
    walk: [2.4, 2.0],
    gaps: [[5, 20, 1]],
    medianCuts: [
      [0, 14],
      [76, 92],
      [138, 999],
    ],
    lights: { every: 30, first: 30 },
    palms: 11,
    zone: 'Mandalay Bay Rd',
    mapLabel: 'Mandalay Bay Rd',
  });
  const mbx = SIDE_CLOCK;
  paths.push(...stripEnd(b, mg, { sgn: -1, pts: wPts, road: w, stripPhase: strip, sidePhase: side, stop: stopOf(name), outStops: [[78, mbx.main]], inStops: [[90, mbx.main]], counts: [4, 3, 3, 3] }));
  stopBar(mg, w, 78, 0.4, 7);
  stopBar(mg, w, 90, -7, -0.4);
  signal(b, -84 - 6, MBR_Z + 8.2, 0, -1, 6.4, mbx.main, 'Mandalay Bay Rd');
  signal(b, -84 + 6, MBR_Z - 8.2, 0, 1, 6.4, mbx.main, 'Mandalay Bay Rd');
  // Frank Sinatra Dr carries on south from the arena to meet it (two lanes each way between the I-15 wall and the garages)
  const fs = layRoad(b, mg, {
    name: 'Frank Sinatra Dr',
    pts: [
      [FS_X, 542],
      [FS_X, 632],
    ],
    lanes: { each: 2, laneW: 2.6, median: 'paint', medianW: 0.6 },
    walk: [0, 0],
    lights: { every: 30, first: 10 },
    zone: 'Frank Sinatra Dr',
    mapLabel: 'Frank Sinatra Dr',
  });
  void fs;
  junctionBox(b, FS_X - 5.5, FS_X + 5.5, MBR_Z - 7.2, MBR_Z + 7.2);
  junctionBox(b, FS_X - 5.5, FS_X + 5.5, RENO_W_Z - 7.2, RENO_W_Z + 7.2);

  // ---- east: Hacienda Ave along the Diamond lot's north fence
  const ePts: P[] = [
    [CURB, HAC_Z],
    [203, HAC_Z],
  ];
  const e = layRoad(b, mg, {
    name: 'E Hacienda Ave',
    pts: ePts,
    lanes: PAINTED,
    walk: [1.8, 1.8],
    lights: { every: 30, first: 20 },
    zone: 'Hacienda Ave',
    mapLabel: 'E Hacienda Ave',
  });
  paths.push(...stripEnd(b, mg, { sgn: 1, pts: ePts, road: e, stripPhase: strip, sidePhase: side, stop: stopOf(name), counts: [3, 3, 3, 3], blade: 'Las Vegas Blvd S' }));

  // ---- west frontage: Mandalay Bay's main entrance (south side), the W tower, the garage; Luxor's south doors
  mandalayGate(b, mg, -62, 625.4);
  sign(b, 'W', 4, 4, -102, 40, 620.35, Math.PI, { style: 'sans', fill: '#ffffff' });
  sign(b, 'W LAS VEGAS', 6, 0.9, -102, 3.6, 620.3, Math.PI, { style: 'sans', fill: '#ffffff', bg: '#111114', scale: 0.62, spacing: 0.2 });
  streetGarage(b, mg, -160, -116, 622.4, 668, 5, 'Mandalay Bay Self Parking', 'n', 'MANDALAY BAY  SELF PARKING', '#7a5a1a');
  sign(b, 'LUXOR  SOUTH ENTRANCE', 7, 0.7, -78, 4.0, 602.8, 0, { style: 'egypt', fill: 'gold', bg: '#14181e', scale: 0.7 });
  b.zone('Mandalay Bay Main Entrance', -70, -40, 620, 632);
  // ---- east frontage: the Diamond lot's fence (southStrip.ts) and the vacant lot north; an event-parking sign
  sign(b, 'HACIENDA AVE • EVENT PARKING →', 6.4, 0.7, 40, 1.9, 632.2, Math.PI, { style: 'sans', fill: '#ffffff', bg: '#0a2a5a', scale: 0.7 });
  mg.box(mat(0x5a5e66, 0.5, 0.6), 40, 0.8, 632.35, 0.12, 1.6, 0.12);
}

/**
 * Mandalay Bay's main entrance gate on Mandalay Bay Rd (after the street photos): a sandstone gatehouse with a
 * deep cornice over an arched passage, low carved walls either side with MANDALAY BAY in gold, a winged griffin
 * crouching on each wall, and teal lamp standards with glass lanterns. Faces north onto the road.
 */
function mandalayGate(b: WorldBuilder, mg: Merger, x: number, z: number): void {
  const stone = mat(0xcbb38c, 0.85);
  const carved = mat(0xb89c74, 0.9);
  const dark = mat(0x2a2418, 0.9);
  const teal = mat(0x2f6f73, 0.45, 0.4);
  // gatehouse: two piers, the lintel and the cornice, a dark arched passage between
  for (const s of [-1, 1]) {
    mg.box(stone, x + s * 2.9, 3, z, 1.8, 6, 3.4, 0, true);
    b.collider(x + s * 2.9 - 0.9, x + s * 2.9 + 0.9, z - 1.7, z + 1.7, 0, 6, true);
  }
  mg.box(stone, x, 5.2, z, 4.0, 1.6, 3.4, 0, true);
  mg.box(carved, x, 6.35, z, 8.6, 0.7, 4.4, 0, true);
  mg.box(stone, x, 6.95, z, 7.4, 0.5, 3.8);
  mg.box(dark, x, 2.2, z + 1.6, 4.0, 4.4, 0.2);
  const arch = new THREE.CylinderGeometry(2.0, 2.0, 0.3, 14, 1, false, -Math.PI / 2, Math.PI);
  arch.rotateX(Math.PI / 2);
  mg.at(dark, arch, x, 4.4, z - 1.72);
  for (const s of [-1, 1]) mg.box(carved, x + s * 2.9, 3, z - 1.75, 1.2, 5.2, 0.12);
  // the flanking walls with the name, and a griffin on each
  for (const s of [-1, 1]) {
    const wx = x + s * 8.4;
    mg.box(stone, wx, 1.3, z - 0.4, 7.2, 2.6, 2.4, 0, true);
    mg.box(carved, wx, 2.75, z - 0.4, 7.6, 0.3, 2.8);
    b.collider(wx - 3.6, wx + 3.6, z - 1.6, z + 0.8, 0, 2.6, true);
    sign(b, 'MANDALAY BAY', 5.2, 0.6, wx, 1.5, z - 1.62, Math.PI, { style: 'serif', fill: 'gold', edge: '#3a2a08', spacing: 0.12 });
    // the griffin: haunches, chest, head and beak, two swept wings
    const gx = wx + s * 0.6;
    const gy = 2.9;
    const sand = mat(0xa88a64, 0.9);
    mg.box(sand, gx, gy + 0.9, z + 0.2, 1.8, 1.8, 2.6, 0, true);
    mg.box(sand, gx, gy + 2.1, z - 0.8, 1.4, 1.8, 1.2, 0, true);
    mg.box(sand, gx, gy + 3.2, z - 1.1, 0.9, 0.9, 1.0);
    mg.box(sand, gx, gy + 3.05, z - 1.75, 0.4, 0.35, 0.6);
    for (const w of [-1, 1]) {
      const wing = new THREE.BoxGeometry(0.25, 4.4, 2.2);
      wing.translate(0, 2.2, 0);
      wing.rotateX(-0.35);
      wing.rotateZ(w * 0.32);
      mg.at(sand, wing, gx + w * 0.75, gy + 1.4, z + 0.4, 0, true);
    }
  }
  // teal lamp standards with lanterns (lit at night)
  const lantern = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xcfe8e4, emissive: 0xfff0c8, emissiveIntensity: 0.1, roughness: 0.3 }), 0.08, 1.6);
  for (const lx of [x - 13.2, x - 4.6, x + 4.6, x + 13.2]) {
    mg.box(teal, lx, 0.6, z - 2.2, 0.8, 1.2, 0.8);
    mg.add(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 8).translate(lx, 3.9, z - 2.2), teal);
    for (const d of [-1, 1]) {
      mg.add(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6).rotateZ(Math.PI / 2 - d * 0.5).translate(lx + d * 0.55, 6.6, z - 2.2), teal);
      mg.add(new THREE.SphereGeometry(0.32, 10, 8).translate(lx + d * 1.1, 6.6, z - 2.2), lantern);
    }
    b.collider(lx - 0.4, lx + 0.4, z - 2.6, z - 1.8, 0, 6, true);
  }
}
