import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { layRoad, signal, stopBar, crosswalk, stripEnd, stripSidePhase, twoPhase, type LaneLayout, type P, type Phase } from './crossRoadKit';
import { mat } from './props';
import { letters } from './signKit';
import { Merger, palmInto } from './southKit';
import { CROSSWALKS, crosswalkPhase, STRIP } from './strip';

/**
 * The north Strip's cross streets west of the Boulevard (OSM ways "Fashion Show Drive", "Resorts World
 * Avenue"; map data © OpenStreetMap contributors):
 *
 * Fashion Show Dr: west along Fashion Show's north side (Nordstrom, Dillard's, Macy's on the mall's north
 * face) with the fenced ex-New Frontier lot across the street (the lot's south fence steps back to make room:
 * northStrip.ts wraps it in squashZ), then round the corner behind the mall to Spring Mountain Rd, the way the
 * real one swings south to meet it.
 *
 * Resorts World Ave: west along Resorts World's north side to its north motor lobby and parking entrance,
 * where the game's Adventuredome lot stops it (the real one carries on to Sammy Davis Jr Dr).
 */

const CURB = STRIP.curb;
const FSD_Z = -484;
const RWA_Z = -676.5;
const LANES: LaneLayout = { each: 2, laneW: 2.9, median: 'paint', medianW: 0.6 };

const sidePhase = (name: string): ((t: number) => Phase) => stripSidePhase(CROSSWALKS.find((c) => c.name === name)!.offset);
const stripPhase = (name: string): ((t: number) => Phase) => {
  const off = CROSSWALKS.find((c) => c.name === name)!.offset;
  return (t) => crosswalkPhase(t, off);
};
const stopOf = (name: string): [number, number] => CROSSWALKS.find((c) => c.name === name)!.stop!;

function sign(b: WorldBuilder, text: string, w: number, h: number, x: number, y: number, z: number, rot: number, o: Parameters<typeof letters>[4]): void {
  b.add(letters(b, text, w, h, o), x, y, z, rot);
}

export function buildNorthCrossRoads(b: WorldBuilder): void {
  const mg = new Merger();
  buildFashionShowDr(b, mg);
  buildResortsWorldAve(b, mg);
  mg.flush(b);
}

// ================================================================ Fashion Show Dr
function buildFashionShowDr(b: WorldBuilder, mg: Merger): void {
  const name = 'Fashion Show Dr';
  const pts: P[] = [
    [-CURB, FSD_Z],
    [-148, FSD_Z],
    [-154.5, FSD_Z + 1.8],
    [-158.6, FSD_Z + 6.2],
    [-160, FSD_Z + 12],
    [-160, -414],
  ];
  const road = layRoad(b, mg, {
    name: 'Fashion Show Dr',
    pts,
    lanes: LANES,
    walk: [2.2, 1.6],
    lights: { every: 27, first: 20 },
    zone: 'Fashion Show Dr',
    mapLabel: 'Fashion Show Dr',
  });
  // a signal at the mall's north garage ramp / the Frontier lot gate, halfway along
  const GATE_X = -96;
  const gate = twoPhase(36, 24, 7);
  const s = -CURB - GATE_X; // arc length along the road (x from −CURB westward)
  stripEnd(b, mg, { sgn: -1, pts, road, stripPhase: stripPhase(name), sidePhase: sidePhase(name), stop: stopOf(name), outStops: [[s - 6, gate.main]], inStops: [[s + 6, gate.main]], counts: [4, 3, 4, 3], blade: 'Las Vegas Blvd S' }, [[-80, FSD_Z], 300], 475);
  stopBar(mg, road, s - 6, 0.4, 6.5);
  stopBar(mg, road, s + 6, -6.5, -0.4);
  crosswalk(mg, road, s + 3.6);
  signal(b, GATE_X + 6, FSD_Z + 7.4, 0, -1, 6.0, gate.main, 'Fashion Show Dr');
  signal(b, GATE_X - 6, FSD_Z - 7.4, 0, 1, 6.0, gate.main, 'Fashion Show Dr');
  signal(b, GATE_X - 5.5, FSD_Z + 7.6, 1, 0, 4.2, gate.cross);
  // where it meets Spring Mountain Rd behind the mall
  crosswalk(mg, road, road.len - 4.2);

  // ---- Fashion Show's north face (z −475.3): the anchors' names and the north entrance, the garage ramp
  const fz = -475.35;
  sign(b, 'FASHION SHOW', 13, 1.8, -77, 10.2, fz, Math.PI, { style: 'thin', fill: '#ffffff', spacing: 0.22 });
  sign(b, "Macy's", 6, 1.4, -62, 6.4, fz, Math.PI, { style: 'serif', fill: '#e21a2c' });
  sign(b, 'NORDSTROM', 8, 1.2, -116, 13.6, -475.05, Math.PI, { style: 'serif', fill: '#1a1a1a', bg: '#f0efe9', scale: 0.62, spacing: 0.12 });
  sign(b, "Dillard's", 7, 1.3, -135, 12.4, -475.05, Math.PI, { style: 'serif', fill: '#2a2a2a', bg: '#f0efe9', scale: 0.62 });
  const glass = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x1e2a36, roughness: 0.12, metalness: 0.4, emissive: 0xffe2b0, emissiveIntensity: 0.05 }), 0.05, 0.8);
  mg.box(glass, -86, 2.2, fz + 0.06, 16, 4.0, 0.1);
  mg.box(mat(0x2a2c30, 0.55, 0.3), -86, 4.5, fz - 1.4, 18, 0.35, 2.8, 0, true); // north-entrance canopy
  for (const x of [-94, -78]) mg.box(mat(0xd8d6d0, 0.6), x, 2.2, fz - 2.6, 0.35, 4.4, 0.35);
  sign(b, 'SELF PARKING • ENTER', 5.4, 0.7, GATE_X + 0.5, 3.1, fz, Math.PI, { style: 'sans', fill: '#ffffff', bg: '#20262e', scale: 0.7 });
  mg.box(mat(0x2a2c30, 0.8), GATE_X + 0.5, 1.6, fz + 0.04, 6, 3.2, 0.1);
  for (const x of [-30, -44, -58]) palmInto(mg, x, -476.6, 7.6, 900 + x, 0);
  b.zone('Fashion Show (north entrance)', -100, -70, -478, -474);
  // ---- across the street: the Frontier lot's south fence (northStrip.ts), its gate and a for-sale sign
  sign(b, 'WYNN WEST • FUTURE DEVELOPMENT', 9, 1.3, -60, 2.4, -493.0, 0, { style: 'sans', fill: '#ffffff', bg: '#1f3a2c', rule: '#d8c890', scale: 0.62 });
  for (const x of [-64, -56]) mg.box(mat(0x8a8f94, 0.4, 0.6), x, 1.6, -493.15, 0.14, 3.2, 0.14);
}

// ================================================================ Resorts World Ave
function buildResortsWorldAve(b: WorldBuilder, mg: Merger): void {
  const name = 'Resorts World Ave';
  const END = -62;
  const pts: P[] = [
    [-CURB, RWA_Z],
    [END, RWA_Z],
  ];
  const road = layRoad(b, mg, {
    name: 'Resorts World Ave',
    pts,
    lanes: LANES,
    walk: [2.0, 1.4],
    lights: { every: 24, first: 18 },
    zone: 'Resorts World Ave',
    mapLabel: 'Resorts World Ave',
  });
  stripEnd(b, mg, { sgn: -1, pts, road, stripPhase: stripPhase(name), sidePhase: sidePhase(name), stop: stopOf(name), counts: [3, 2, 3, 2] }, [[-40, RWA_Z], 260], 676);
  // the turnaround at the motor lobby: a painted island and the end of the road
  mg.box(mat(0xb8ad9c, 0.85), END + 2.2, 0.11, RWA_Z, 4.4, 0.22, 4.0, 0, true);
  palmInto(mg, END + 2.2, RWA_Z, 7.2, 676, 0.22);
  b.collider(END, END + 4.4, RWA_Z - 2, RWA_Z + 2, 0, 0.22);
  // ---- Resorts World's north side (z −668): the motor lobby canopy, the Hilton / Conrad / Crockfords names, parking
  const rz = -668.05;
  const red = mat(0x7a1a14, 0.45, 0.35);
  mg.box(red, -46, 5.2, rz - 2.6, 26, 0.5, 5.2, 0, true); // porte-cochère roof
  for (const x of [-57, -35]) mg.box(mat(0x2a1a14, 0.5, 0.4), x, 2.6, rz - 4.8, 0.5, 5.2, 0.5);
  const glow = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x3a0e0a, emissive: 0xff3a1a, emissiveIntensity: 0.3, roughness: 0.4 }), 0.25, 1.4);
  mg.box(glow, -46, 5.5, rz - 5.25, 26, 0.18, 0.12);
  sign(b, 'RESORTS WORLD', 12, 1.5, -46, 9.4, rz, Math.PI, { style: 'serif', fill: '#f4e2c8', edge: '#3a0a06', spacing: 0.15 });
  sign(b, 'HILTON • CONRAD • CROCKFORDS', 9, 0.6, -46, 7.6, rz, Math.PI, { style: 'sans', fill: '#ffffff' });
  sign(b, 'NORTH MOTOR LOBBY • VALET', 7, 0.6, -46, 4.6, rz - 5.2, Math.PI, { style: 'sans', fill: '#ffffff', bg: '#2a0e0a', scale: 0.7 });
  sign(b, 'PARKING', 3.2, 0.8, -26, 3.2, rz, Math.PI, { style: 'block', fill: '#ffffff', bg: '#1d2a4a', scale: 0.62 });
  b.zone('Resorts World (north motor lobby)', -60, -30, -672, -668);
}
