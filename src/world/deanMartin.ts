import * as THREE from 'three';
import { viewer, type WorldBuilder } from './builder';
import { buildInNOut } from './food';
import { basic, car, mat, neonSign } from './props';
import { flamingoPhase } from './strip';
import { L0, L1, L2, Merger, canvasTex, palmInto, paving, v3 } from './southKit';
import type { FacadeSpec } from './textures';
import {
  addBuilding,
  buildInstancedTraffic,
  chainFenceInto,
  cobraPoleInto,
  crosswalkStripeMat,
  flatRoad,
  freewayBillboard,
  lightPoolMat,
  ParkedLotBuilder,
  roadStripMat,
  signBoard,
  treeClusterInto,
  WEST_RNG,
  type TrafficLane,
} from './westKit';
import { I15 } from './interstate';

/**
 * Dean Martin Drive & the west-of-I-15 district from south of Tropicana Ave (5155 Shooting Center /
 * 5085 Park Inn) north to W. Flamingo Rd (Flamingo & Rio gateway), including both sides of Dean Martin Dr,
 * Joey Bishop Dr, Polaris Ave, the flagship In-N-Out Burger (4888 Dean Martin Dr) & Company Store (4838),
 * hotels, Panorama Towers, The Martin, industrial warehouses, gas stations, and Tommy Rocker's (4275).
 */

export const WEST_BAY = {
  xW: -290,
  xE: -173, // joins backdrop.ts west edge outside I-15 sound wall
  zN: -22,
  zS: 544,
};

const DM_NORTH_X = -225;
const DM_FLAMINGO_X = -246;
const DM_TROP_X = -252;
const POLARIS_X = -278;

export function buildDeanMartin(b: WorldBuilder): void {
  const mg = new Merger();
  const lot = new ParkedLotBuilder();

  buildBayGroundAndEdges(b, mg);
  buildDeanMartinRoadNetwork(b, mg);
  buildSouthOfTropicana(b, mg, lot);
  buildInNOutBlock(b, mg, lot);
  buildCityCenterWestRow(b, mg, lot);
  buildIndustrialAndFlamingoBlock(b, mg, lot);
  buildBillboardsAndSignals(b, mg);

  mg.flush(b);
  lot.emit(b, -246, 260, 340);
  buildDeanMartinTraffic(b);
  buildDeanMartinCrowds(b);
}

// ================================================================ Ground, Bay Edges & Wash

function buildBayGroundAndEdges(b: WorldBuilder, mg: Merger): void {
  // Compacted sandy-gravel urban pad across the whole playable west bay
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.abs(-213.8 - WEST_BAY.xW) + 2, WEST_BAY.zS - WEST_BAY.zN + 8),
    mat(0x9a8c76, 0.96)
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set((-213.8 + WEST_BAY.xW) / 2, L0 - 0.006, (WEST_BAY.zN + WEST_BAY.zS) / 2);
  pad.receiveShadow = true;
  b.add(pad);

  // Low perimeter walls matching backdrop.ts edgeMat + collider enclosing the West Bay
  const edgeMat = mat(0x6b5a46, 0.95);
  const bayW = WEST_BAY.xE - WEST_BAY.xW;
  const bayD = WEST_BAY.zS - WEST_BAY.zN;
  b.box(WEST_BAY.xW, 0, (WEST_BAY.zN + WEST_BAY.zS) / 2, 1.2, 0.8, bayD, edgeMat, false, false);
  b.box((WEST_BAY.xW + WEST_BAY.xE) / 2, 0, WEST_BAY.zN, bayW, 0.8, 1.2, edgeMat, false, false);
  b.box((WEST_BAY.xW + WEST_BAY.xE) / 2, 0, WEST_BAY.zS, bayW, 0.8, 1.2, edgeMat, false, false);
  b.collider(WEST_BAY.xW - 50, WEST_BAY.xW - 0.6, WEST_BAY.zN - 50, WEST_BAY.zS + 50, 0, 60, true);
  b.collider(WEST_BAY.xW - 50, WEST_BAY.xE + 2, WEST_BAY.zN - 50, WEST_BAY.zN - 0.6, 0, 60, true);
  b.collider(WEST_BAY.xW - 50, WEST_BAY.xE + 2, WEST_BAY.zS + 0.6, WEST_BAY.zS + 50, 0, 60, true);

  // Flamingo Wash & Tropicana Wash concrete flood-control channels
  const concrete = mat(0x8e8a80, 0.9);
  for (const wz of [30, 494]) {
    mg.box(concrete, -248, 0.04, wz, 66, 0.1, 6.2);
    mg.box(mat(0x6c685e, 0.9), -248, 0.18, wz - 3.2, 66, 0.45, 0.35);
    mg.box(mat(0x6c685e, 0.9), -248, 0.18, wz + 3.2, 66, 0.45, 0.35);
  }
}

// ================================================================ Roads, Sidewalks & Crosswalks

function angledRoadSeg(b: WorldBuilder, x0: number, z0: number, x1: number, z1: number, w: number, lanes: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0) + 3.0;
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  const me = new THREE.Mesh(new THREE.PlaneGeometry(w, len), roadStripMat(lanes, len, true));
  me.rotation.order = 'YXZ';
  me.rotation.y = yaw;
  me.rotation.x = -Math.PI / 2;
  me.position.set((x0 + x1) / 2, L1 + 0.002, (z0 + z1) / 2);
  me.receiveShadow = true;
  b.add(me);
}

function buildDeanMartinRoadNetwork(b: WorldBuilder, mg: Merger): void {
  // Dean Martin Dr continuous segments (Flamingo bend -246 -> main stem -225 -> Tropicana bend -252 -> south -225)
  flatRoad(b, DM_FLAMINGO_X, 9, 14, 62, 'z', 4, true, L1, 'Dean Martin Dr');
  angledRoadSeg(b, DM_FLAMINGO_X, 37, DM_NORTH_X, 82, 14, 4);
  flatRoad(b, DM_NORTH_X, 234, 14, 312, 'z', 4, true, L1, 'Dean Martin Dr');
  angledRoadSeg(b, DM_NORTH_X, 386, DM_TROP_X, 404, 14, 4);
  flatRoad(b, DM_TROP_X, 450, 14, 96, 'z', 4, true, L1, 'Dean Martin Dr');
  angledRoadSeg(b, DM_TROP_X, 495, DM_NORTH_X, 514, 14, 4);
  flatRoad(b, DM_NORTH_X, 528, 14, 36, 'z', 4, true, L1);

  b.zone('Dean Martin Dr (North)', DM_NORTH_X - 8, DM_NORTH_X + 8, 70, 388);
  b.zone('Dean Martin Dr (Tropicana)', DM_TROP_X - 9, DM_TROP_X + 9, 392, 504);

  // Joey Bishop Dr frontage street behind In-N-Out & TownePlace/Home2 running UNDER Tropicana Bridge (-219)
  flatRoad(b, -219, 442, 7.5, 102, 'z', 2, false, L1, 'Joey Bishop Dr');
  flatRoad(b, -234, 390.5, 8, 28, 'x', 2, true, L1); // northern connector from Joey Bishop to Dean Martin north of Company Store
  flatRoad(b, -234, 490, 8, 30, 'x', 2, true, L1); // southern connector

  // West Cross Arterials connecting bridge ramps cleanly out to Polaris & West Edge
  flatRoad(b, -264.5, I15.flamingoZ, 19.5, 51, 'x', 6, true, L1, 'W Flamingo Rd');
  flatRoad(b, -275.0, I15.harmonZ, 13.5, 30, 'x', 4, true, L1, 'W Harmon Ave');
  flatRoad(b, -268.0, I15.tropZ, 21.0, 44, 'x', 6, true, L1, 'W Tropicana Ave');

  // Polaris Ave (secondary west corridor serving industrial park, Sinclair & hotels)
  flatRoad(b, POLARIS_X, 260, 10.5, 560, 'z', 2, true, L1, 'Polaris Ave');
  b.zone('Polaris Ave', POLARIS_X - 6, POLARIS_X + 6, -15, 540);

  // Continuous Concrete Curbs, Sidewalks, Streetlights & Crosswalks
  const walkMat = mat(0xb6afa2, 0.88);
  const poolMat = lightPoolMat(true);
  const pools = new Merger();
  const cwMat = crosswalkStripeMat(1, 1);

  // Main stem (-225) sidewalks & cobra lamps
  for (const s of [-1, 1]) {
    mg.box(walkMat, DM_NORTH_X + s * 8.2, L1 * 0.6, 234, 2.4, L1 * 1.2, 306);
  }
  mg.box(walkMat, DM_TROP_X - 8.2, L1 * 0.6, 450, 2.4, L1 * 1.2, 92);
  mg.box(walkMat, DM_TROP_X + 8.2, L1 * 0.6, 450, 2.4, L1 * 1.2, 92);

  for (let z = 84; z <= 380; z += 36) {
    if (Math.abs(z - I15.harmonZ) < 12) continue;
    cobraPoleInto(mg, b, DM_NORTH_X - 7.8, z, Math.PI / 2, 9.0, 2.5);
    const p = new THREE.PlaneGeometry(13, 13);
    p.rotateX(-Math.PI / 2);
    p.translate(DM_NORTH_X, L1 + 0.014, z);
    pools.add(p, poolMat);
  }
  for (let z = 408; z <= 488; z += 26) {
    if (Math.abs(z - I15.tropZ) < 12) continue;
    cobraPoleInto(mg, b, DM_TROP_X + 7.8, z, -Math.PI / 2, 9.0, 2.5);
    cobraPoleInto(mg, b, DM_TROP_X - 7.8, z, Math.PI / 2, 9.0, 2.5);
    const p = new THREE.PlaneGeometry(14, 14);
    p.rotateX(-Math.PI / 2);
    p.translate(DM_TROP_X, L1 + 0.014, z);
    pools.add(p, poolMat);
  }
  pools.flush(b);

  // Zebra crosswalk stripes at Tropicana/Dean Martin (-252, 442.7) & Flamingo/Dean Martin (-246, 0)
  const addCW = (cx: number, cz: number, w: number, d: number, ew: boolean) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), cwMat);
    m.rotation.set(-Math.PI / 2, 0, ew ? 0 : Math.PI / 2);
    m.position.set(cx, L1 + 0.018, cz);
    b.add(m);
  };
  for (const dz of [-11.5, 11.5]) addCW(DM_TROP_X, I15.tropZ + dz, 13, 2.8, true);
  for (const dx of [-9.5, 9.5]) addCW(DM_TROP_X + dx, I15.tropZ, 19, 2.8, false);
  for (const dz of [-11, 11]) addCW(DM_FLAMINGO_X, I15.flamingoZ + dz, 13, 2.6, true);
  for (const dx of [-9, 9]) addCW(DM_FLAMINGO_X + dx, I15.flamingoZ, 17, 2.6, false);

  // Pedestrian stairs & landing linking Harmon Ave Bridge sidewalk down to Dean Martin Dr (-234, 229)
  const stairMat = mat(0xaba396, 0.85);
  const NST = 16;
  const stDx = 24 / NST;
  for (let i = 0; i < NST; i++) {
    const sx = -258 + (i + 0.5) * stDx;
    const sh = ((i + 1) / NST) * 6.8;
    mg.box(stairMat, sx, sh / 2, 229.2, stDx + 0.05, sh, 2.4);
    b.collider(sx - stDx / 2, sx + stDx / 2, 228.0, 230.4, 0, sh, false);
  }
  mg.box(stairMat, -234, 6.65, 227.5, 3.2, 0.3, 3.8);
  b.collider(-235.6, -232.4, 225.6, 229.4, 0, 6.8, false);
}

// ================================================================ South of Tropicana (z = 454..542)

function buildSouthOfTropicana(b: WorldBuilder, mg: Merger, lot: ParkedLotBuilder): void {
  const glassHotel: FacadeSpec = { wall: '#a89c8a', mullion: '#dcd4c4', glass: '#364452', lit: '#ffdfa4', cols: 7, rows: 5, style: 0, seed: 492 };

  // East of Dean Martin Dr (-242..-222): TownePlace Suites (4920) & Home2 Suites (4940)
  addBuilding(b, mg, { x: -232, z: 462.5, w: 12, d: 13, h: 15.5, wall: glassHotel, trim: 0x3b4048, label: 'TownePlace Suites' });
  mg.box(mat(0x282c34, 0.5), -239.2, 3.6, 462.5, 3.2, 0.35, 6.4); // porte-cochere facing west
  signBoard(b, 'TOWNEPLACE SUITES', '#1a222c', '#f6efe0', 8.5, 1.35, -238.2, 13.5, 462.5, -Math.PI / 2, '4920 DEAN MARTIN DR • MARRIOTT');
  b.zone('TownePlace Suites (4920 Dean Martin)', -243, -221, 454, 470);

  addBuilding(b, mg, {
    x: -232,
    z: 479.5,
    w: 12,
    d: 14,
    h: 16.5,
    wall: { ...glassHotel, wall: '#8f949a', lit: '#d6f5b0', seed: 494 },
    trim: 0x64b840,
    label: 'Home2 Suites',
  });
  mg.box(mat(0x64b840, 0.5), -238.1, 14.5, 479.5, 0.25, 0.4, 13.8);
  signBoard(b, 'HOME2 SUITES BY HILTON', '#16281c', '#9ef048', 9.2, 1.35, -238.2, 13.0, 479.5, -Math.PI / 2, '4940 DEAN MARTIN DR');
  b.zone('Home2 Suites (4940 Dean Martin)', -243, -221, 471, 488);

  // West of Dean Martin Dr (-288..-256): Chevron Gas + Jack in the Box + Hampton Inn + Park Inn + Auto/Car Museum
  // Chevron / Standard Gas Station SW Corner of Tropicana & Dean Martin
  paving(b, -271, -258, 454, 465, '#46484e', '#3a3c42', 4, L0);
  const chevWhite = mat(0xf4f4f0, 0.55);
  const chevBlue = mat(0x0c4a8c, 0.5);
  const chevRed = mat(0xd0222a, 0.5);
  mg.box(chevWhite, -264, 5.2, 458.5, 8.2, 0.65, 6.2, 0, true);
  mg.box(chevBlue, -264, 5.42, 461.65, 8.25, 0.22, 0.14);
  mg.box(chevRed, -264, 5.2, 461.65, 8.25, 0.22, 0.14);
  for (const px of [-266.5, -261.5]) {
    for (const pz of [456.8, 460.2]) {
      mg.box(chevWhite, px, 2.5, pz, 0.45, 5.0, 0.45);
      mg.box(chevBlue, px, 0.85, pz, 0.65, 1.6, 0.55);
      b.collider(px - 0.35, px + 0.35, pz - 0.3, pz + 0.3, 0, 5.0, true);
    }
  }
  addBuilding(b, mg, { x: -264, z: 463.8, w: 9.0, d: 3.4, h: 3.6, wall: 0xeae6dc, trim: 0x0c4a8c, label: 'Chevron' });
  signBoard(b, 'CHEVRON • EXTRA MILE', '#0a3a72', '#ffffff', 7.2, 1.1, -264, 2.9, 462.05, Math.PI, 'REG $4.19 • UNL $4.59', 0.12);
  // Glowing fuel price monument pole at intersection corner
  mg.beam(mat(0x3a3e44, 0.5, 0.7), v3(-259.6, 0, 454.8), v3(-259.6, 6.8, 454.8), 0.18, 6);
  signBoard(b, 'CHEVRON  $4.19', '#0a2d62', '#ffd84a', 3.4, 2.2, -259.6, 5.6, 454.8, -Math.PI / 4, 'DIESEL $4.39 • 24 HRS');
  b.zone('Chevron Gas Station (Tropicana)', -271, -258, 453, 466);

  // Jack in the Box (3235 W Tropicana Ave) right west of Chevron before Polaris Ave
  addBuilding(b, mg, { x: -273.5, z: 459.5, w: 5.5, d: 6.5, h: 4.0, wall: 0xd9cdb8, trim: 0xb81e24, label: 'Jack in the Box' });
  signBoard(b, 'JACK IN THE BOX', '#b81e24', '#ffffff', 5.2, 1.1, -273.5, 3.4, 456.15, Math.PI, '3235 W TROPICANA • 24 HRS', 0.12);
  b.zone('Jack in the Box (W Tropicana)', -277, -270, 454, 465);

  // Hampton Inn Tropicana (4975 S Dean Martin Dr) + courtyard pool + parked cars
  addBuilding(b, mg, { x: -268, z: 477, w: 16, d: 17, h: 16.0, wall: { ...glassHotel, wall: '#cab89e', seed: 497 }, label: 'Hampton Inn' });
  mg.box(mat(0x1f365c, 0.6), -259.8, 14.2, 477, 0.25, 0.45, 16.5);
  signBoard(b, 'HAMPTON INN', '#142a4d', '#ffffff', 9.0, 1.4, -259.75, 12.8, 477, Math.PI / 2, '4975 DEAN MARTIN • BY HILTON');
  lot.bays(-284, -278, 469, 486, 2, 4, Math.PI / 2, 0.72, 497);
  b.zone('Hampton Inn Tropicana (4975)', -286, -259, 466, 488);

  // Park Inn by Radisson (5085 S Dean Martin Dr)
  addBuilding(b, mg, { x: -242, z: 505, w: 16, d: 14, h: 13.5, wall: { wall: '#e8e2d8', mullion: '#c8c0b4', glass: '#3b4a58', lit: '#ffdca0', cols: 8, rows: 4, style: 0, seed: 508 }, trim: 0xc84a20, label: 'Park Inn' });
  signBoard(b, 'PARK INN by RADISSON', '#c83e18', '#ffffff', 10.5, 1.5, -233.8, 11.2, 505, Math.PI / 2, '5085 S DEAN MARTIN DR');
  b.zone('Park Inn by Radisson (5085)', -255, -232, 496, 513);

  // J.P. Auto Mechanic / Carl's Cool Cars (5115 S Dean Martin) & Shooting Center / Hollywood Car Museum (5155)
  addBuilding(b, mg, { x: -242, z: 520, w: 14, d: 11, h: 5.5, wall: 0xa49b8e, trim: 0x3a4a5e, label: 'Auto Shops' });
  for (const bz of [517, 520, 523]) mg.box(mat(0x2d3238, 0.5, 0.5), -234.9, 1.8, bz, 0.15, 3.4, 2.4);
  signBoard(b, "J.P. AUTO • CARL'S COOL CARS", '#182436', '#ffd23a', 10.2, 1.2, -234.75, 4.7, 520, Math.PI / 2, '5115 DEAN MARTIN DR • SERVICE & SALES', 0.12);
  b.zone("5115 Auto & Cool Cars", -254, -232, 514, 526);

  addBuilding(b, mg, { x: -243, z: 534, w: 16, d: 12, h: 6.2, wall: 0xb8a484, trim: 0x8e1c24, label: 'Car Museum' });
  signBoard(b, 'HOLLYWOOD CAR MUSEUM', '#7a141c', '#ffe290', 11.4, 1.35, -234.8, 5.1, 534, Math.PI / 2, 'LAS VEGAS SHOOTING CENTER • 5155', 0.12);
  lot.bays(-255, -234, 539, 541.5, 5, 1, 0, 0.85, 515);
  b.zone('Hollywood Car Museum • Shooting Center (5155)', -256, -232, 527, 542);
}

// ================================================================ Flagship In-N-Out Block (4888 & 4838 Dean Martin Dr)

function buildInNOutBlock(b: WorldBuilder, mg: Merger, lot: ParkedLotBuilder): void {
  // ---- 4888 S Dean Martin Dr: True walk-in In-N-Out Burger east of Dean Martin, north of Tropicana ramp
  paving(b, -244, -221, 392, 430.5, '#5a5c62', '#4c4e54', 4, L0);
  b.restaurants.push(buildInNOut(b, -229.5, 416.0, -Math.PI / 2, { name: 'In-N-Out (4888 Dean Martin Dr)', standalone: true }));
  // Extra visible drive-thru queue cars idling on the east drive lane & south exit
  for (const [cx, cz, ry, col] of [
    [-221.6, 411.0, 0, 0xf2f0eb],
    [-221.6, 416.0, 0, 0x48505c],
    [-221.6, 421.0, 0, 0x244e86],
    [-228.5, 426.5, -Math.PI / 2, 0xa8242c],
  ] as Array<[number, number, number, number]>) {
    const qCar = car('sedan', col);
    qCar.group.position.set(cx, 0, cz);
    qCar.group.rotation.y = ry;
    b.add(qCar.group);
  }
  lot.bays(-243.0, -238.5, 405, 412, 2, 3, Math.PI / 2, 0.85, 4888);
  b.zone('In-N-Out Burger (4888 Dean Martin Dr)', -244, -220, 406, 430);

  // ---- 4838 S Dean Martin Dr: In-N-Out Company Store directly north of the restaurant
  addBuilding(b, mg, { x: -229, z: 399.0, w: 11, d: 9.0, h: 5.2, wall: 0xf7f3eb, trim: 0xd81e2a, label: 'In-N-Out Company Store' });
  mg.box(mat(0xd81e2a, 0.45), -234.7, 3.1, 399.0, 1.2, 0.3, 8.6); // red awning facing Dean Martin Dr
  const storeGlass = new THREE.MeshStandardMaterial({ color: 0x222830, emissive: 0xffe6b0, emissiveIntensity: 0.35, roughness: 0.15 });
  b.nightGlow(storeGlass, 0.3, 1.1);
  mg.box(storeGlass, -234.55, 1.6, 399.0, 0.12, 2.4, 6.8);
  signBoard(b, 'IN-N-OUT COMPANY STORE', '#d81e2a', '#ffffff', 8.8, 1.25, -234.75, 4.35, 399.0, -Math.PI / 2, '4838 DEAN MARTIN • TEES & GEAR', 0.14);
  lot.bays(-242, -236, 394, 404, 2, 4, 0, 0.72, 4838);
  b.zone('In-N-Out Company Store (4838 Dean Martin)', -244, -221, 393, 406);

  // ---- West side of Tropicana / Dean Martin block (z = 352..436): Sinclair Travel Plaza, Wendy's & Polaris Flex Park
  paving(b, -288, -259, 416, 435, '#52545a', '#45474d', 4, L0);
  // Wendy's NW Tropicana corner
  addBuilding(b, mg, { x: -271, z: 429, w: 8.5, d: 6.5, h: 4.5, wall: 0xc24034, trim: 0xf2ece0, label: "Wendy's" });
  signBoard(b, "WENDY'S", '#b81d24', '#ffffff', 6.8, 1.2, -266.6, 3.6, 429, Math.PI / 2, 'FRESH NEVER FROZEN', 0.12);
  b.zone("Wendy's (W Tropicana)", -277, -264, 424, 434);

  // Sinclair green fuel canopy & Truck Stop shop
  const sinclairGreen = mat(0x166838, 0.5);
  mg.box(sinclairGreen, -266, 5.2, 419, 8.5, 0.6, 5.5, 0, true);
  mg.box(mat(0xf2efe6, 0.6), -268.5, 2.5, 417.5, 0.45, 5.0, 0.45);
  mg.box(mat(0xf2efe6, 0.6), -263.5, 2.5, 420.5, 0.45, 5.0, 0.45);
  // Dino emblem pillar outside Sinclair
  mg.box(sinclairGreen, -260.5, 1.4, 418, 1.4, 2.2, 0.7);
  signBoard(b, 'SINCLAIR', '#125a30', '#f4f8e8', 7.4, 1.1, -266, 5.2, 421.85, 0, 'TRUCK STOP • FUEL & SNACKS', 0.12);
  b.zone('Sinclair Station (Dean Martin / Polaris)', -276, -259, 415, 424);

  // Polaris Industrial Flex Plaza & Trapped! Escape Room (z = 352..406)
  for (const [bx, bz, bw, bd, lbl] of [
    [-264, 389, 14, 14, 'Dean Martin Flex Plaza'],
    [-265, 370, 14, 16, 'Trapped! Escape Room'],
    [-245, 360, 18, 14, 'Polaris Commerce Center'],
    [-266, 355, 13, 10, 'Industrial Flex Bays'],
  ] as Array<[number, number, number, number, string]>) {
    addBuilding(b, mg, { x: bx, z: bz, w: bw, d: bd, h: 6.5, wall: 0xc2b8a8, trim: 0x525a66, label: lbl });
  }
  signBoard(b, 'TRAPPED! ESCAPE ROOM', '#14141c', '#ff642e', 9.0, 1.3, -257.8, 4.8, 370, Math.PI / 2, '4760 POLARIS AVE');
  lot.bays(-255, -242, 372, 396, 3, 6, Math.PI / 2, 0.65, 4760);
  b.zone('Polaris Industrial & Escape Room (4760)', -275, -234, 350, 410);
}

// ================================================================ CityCenter West High-Rises (z = 202..348)

function buildCityCenterWestRow(b: WorldBuilder, mg: Merger, lot: ParkedLotBuilder): void {
  // Vacant Dirt / Brownfield Lot (z = 330..348)
  chainFenceInto(b, mg, -270, 331, -234, 331);
  chainFenceInto(b, mg, -234, 331, -234, 348);
  chainFenceInto(b, mg, -234, 348, -270, 348);
  b.zone('Vacant Commercial Parcel', -272, -233, 330, 349);

  // ---- 4655 S Dean Martin Dr: Hilton Garden Inn Las Vegas City Center (5 stories)
  const hiltonSpec: FacadeSpec = { wall: '#d6c6ad', mullion: '#ede4d4', glass: '#3c4d5e', lit: '#ffe2a4', cols: 8, rows: 5, style: 0, seed: 4655 };
  addBuilding(b, mg, { x: -245, z: 322, w: 18, d: 13, h: 15.5, wall: hiltonSpec, trim: 0x7c2c38, label: 'Hilton Garden Inn' });
  mg.box(mat(0x2a2e34, 0.45), -234.6, 3.6, 322, 3.0, 0.35, 6.2);
  signBoard(b, 'HILTON GARDEN INN', '#3b151e', '#ffffff', 9.8, 1.35, -235.8, 13.5, 322, Math.PI / 2, '4655 DEAN MARTIN • CITY CENTER');
  b.zone('Hilton Garden Inn (4655 Dean Martin)', -265, -233, 314, 330);

  // ---- 4625 S Dean Martin Dr: Homewood Suites by Hilton + Parking Structure
  const hwSpec: FacadeSpec = { wall: '#c9aa88', mullion: '#e9dac2', glass: '#405060', lit: '#ffdca4', cols: 8, rows: 5, style: 0, seed: 4625 };
  addBuilding(b, mg, { x: -245, z: 294, w: 18, d: 14, h: 15.5, wall: hwSpec, trim: 0x425e4a, label: 'Homewood Suites' });
  addBuilding(b, mg, { x: -265, z: 304, w: 13, d: 22, h: 10.0, wall: 0x9c988e, trim: 0x78746c, label: 'Hotel Parking' });
  signBoard(b, 'HOMEWOOD SUITES', '#183022', '#ffe090', 9.2, 1.35, -235.8, 13.5, 294, Math.PI / 2, '4625 DEAN MARTIN • BY HILTON');
  lot.bays(-255, -236, 304, 312, 4, 2, 0, 0.65, 4625);
  b.zone('Homewood Suites (4625 Dean Martin)', -274, -233, 285, 313);

  // ---- 4575 & 4525 S Dean Martin Dr: Panorama Towers I & II (Twin 33-story turquoise-glass residential skyscrapers)
  paving(b, -274, -233, 229, 284, '#b8b0a2', '#9c9488', 4, L0);
  const panoGlass: FacadeSpec = {
    wall: '#2c5464',
    mullion: '#88b4c4',
    glass: '#226b82',
    lit: '#ffe9b8',
    cols: 12,
    rows: 24,
    style: 2,
    seed: 4525,
  };
  for (const [tz, name, lbl] of [
    [269, 'Panorama Tower II', '4575 DEAN MARTIN'],
    [241, 'Panorama Tower I', '4525 DEAN MARTIN'],
  ] as Array<[number, string, string]>) {
    addBuilding(b, mg, { x: -245, z: tz, w: 17, d: 18, h: 52.0, wall: panoGlass, trim: 0x74a4b8, roof: 0x263440, label: name });
    // Signature vertical turquoise fins framing edges (clear of street-level sign!) & glowing rooftop crown ring
    for (const sz of [-7.8, 7.8]) mg.box(mat(0x62b4cc, 0.3, 0.75), -236.2, 25.5, tz + sz, 0.5, 51, 1.1);
    mg.box(basic(0x70ecff), -245, 51.4, tz, 17.4, 0.35, 18.4);
    signBoard(b, 'PANORAMA TOWERS', '#0c2430', '#8ef0ff', 10.5, 1.5, -236.2, 4.4, tz, Math.PI / 2, lbl);
  }
  // Panorama shared parking podium behind towers
  addBuilding(b, mg, { x: -265, z: 255, w: 13, d: 44, h: 12.5, wall: 0x8e98a0, trim: 0x5c6872 });
  // Resort swimming pool courtyard between Panorama towers
  const poolWater = new THREE.MeshStandardMaterial({ color: 0x35b8d0, roughness: 0.08, emissive: 0x185c72, emissiveIntensity: 0.35 });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 10), poolWater);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(-250, L2, 255);
  b.add(pool);
  for (const pz of [235, 255, 276]) palmInto(mg, -234.8, pz, 8.2, pz);
  b.zone('Panorama Towers (4525–4575 Dean Martin)', -274, -233, 229, 284);

  // ---- 4471 S Dean Martin Dr: THE MARTIN (45-story champagne-gold/bronze/charcoal luxury high-rise at Harmon!)
  const martinGlass: FacadeSpec = {
    wall: '#3a3530',
    mullion: '#cbb38a',
    glass: '#2c343d',
    lit: '#ffe2a6',
    cols: 12,
    rows: 28,
    style: 2,
    seed: 4471,
  };
  addBuilding(b, mg, { x: -246, z: 209.5, w: 19, d: 13, h: 62.0, wall: martinGlass, trim: 0xd6ba82, roof: 0x242220, label: 'The Martin' });
  mg.box(basic(0xffe09c), -246, 61.5, 209.5, 19.4, 0.45, 13.4);
  mg.box(mat(0x22201e, 0.4, 0.7), -234.8, 3.8, 209.5, 3.2, 0.35, 7.6);
  signBoard(b, 'THE MARTIN', '#14110c', '#ecd088', 11.2, 1.7, -236.3, 6.2, 209.5, Math.PI / 2, '4471 DEAN MARTIN DR • RESIDENCES');
  b.zone('The Martin (4471 Dean Martin)', -270, -233, 201, 217);
}

// ================================================================ North Industrial, Tommy Rocker's & Flamingo Block

function buildIndustrialAndFlamingoBlock(b: WorldBuilder, mg: Merger, lot: ParkedLotBuilder): void {
  // South Tech Business Park / Pawsh Palace / Arville-Polaris industrial warehouses (z = 144..198)
  for (const [bx, bz, bw, bd, h, wallCol, lbl] of [
    [-245, 189, 18, 13, 6.5, 0xbdb4a6, 'Business Park'],
    [-264, 188, 12, 14, 6.2, 0xa8a095, 'Pawsh Palace'],
    [-245, 166, 18, 18, 7.0, 0xb4ada0, 'South Tech Warehouse'],
    [-264, 166, 12, 16, 6.8, 0xa0998e, 'Production Studios'],
    [-245, 148, 17, 11, 6.8, 0xbeb5a6, 'Organic Labs'],
  ] as Array<[number, number, number, number, number, number, string]>) {
    addBuilding(b, mg, { x: bx, z: bz, w: bw, d: bd, h, wall: wallCol, trim: 0x565c64, label: lbl });
  }
  signBoard(b, 'SOUTH TECH BUSINESS PARK', '#242c38', '#e8eef4', 9.2, 1.15, -235.8, 5.2, 166, Math.PI / 2, 'PRODUCTION • FLEX • LOGISTICS', 0.12);
  signBoard(b, 'PAWSH PALACE', '#381e42', '#ffd2e8', 7.4, 1.15, -257.8, 4.6, 188, Math.PI / 2, 'PET SPA & BOARDING', 0.12);
  lot.bays(-255, -238, 144, 196, 3, 9, Math.PI / 2, 0.58, 166);
  b.zone('South Tech & Industrial Park', -274, -233, 140, 199);

  // The Space (live events music venue) & 4300 Industrial Park (z = 108..138)
  addBuilding(b, mg, { x: -245, z: 124, w: 18, d: 24, h: 7.4, wall: 0x9e978c, trim: 0x262932, label: 'Auto & Industrial' });
  addBuilding(b, mg, { x: -265, z: 129, w: 12, d: 14, h: 7.8, wall: 0x22202a, trim: 0xd8325a, label: 'The Space' });
  signBoard(b, 'THE SPACE LV', '#180c24', '#ff427c', 8.8, 1.4, -258.8, 5.5, 129, Math.PI / 2, 'CONCERT HALL & EVENTS', 0.12);
  b.zone('The Space & 4300 Industrial', -274, -233, 108, 139);

  // ---- 4275 S Dean Martin Dr: Tommy Rocker's Mojave Beach Bar & Grill
  paving(b, -264, -233, 84, 105, '#726a5c', '#5e564a', 4, L0);
  addBuilding(b, mg, { x: -247, z: 93, w: 16, d: 12, h: 4.8, wall: 0xc2986e, trim: 0x3a2414, label: "Tommy Rocker's" });
  // Tiki covered beer patio facing Dean Martin Dr with warm festoon lights
  const patRoof = mat(0x7c5432, 0.85);
  mg.box(patRoof, -236.5, 3.3, 93, 4.8, 0.25, 11.4, 0, true);
  for (const pz of [88, 93, 98]) mg.beam(mat(0x4a321c, 0.85), v3(-234.4, 0, pz), v3(-234.4, 3.2, pz), 0.1, 6);
  signBoard(b, "TOMMY ROCKER'S", '#102438', '#ff622e', 9.6, 1.5, -234.3, 4.4, 93, Math.PI / 2, 'MOJAVE BEACH BAR & GRILL • 4275', 0.14);
  for (const pz of [85.5, 101.5]) treeClusterInto(mg, -235, pz, 1.0, pz);
  lot.bays(-263, -256, 86, 101, 2, 4, 0, 0.78, 4275);
  b.zone("Tommy Rocker's (4275 Dean Martin)", -266, -233, 83, 105);

  // North Vacant Desert Lots & Flamingo Gateway corners (z = -18..82)
  chainFenceInto(b, mg, -270, 42, -234, 42);
  chainFenceInto(b, mg, -234, 42, -234, 80);
  // Hotel Rio Drive / Palms West Gateway Pad across Flamingo Rd (-274..-256, z = 12..32)
  addBuilding(b, mg, { x: -266, z: 22, w: 14, d: 12, h: 5.5, wall: 0xd4cab8, trim: 0xc82a4a, label: 'Flamingo West Retail' });
  signBoard(b, 'RIO • PALMS WEST', '#1c0a24', '#ff5288', 9.0, 1.35, -266, 4.3, 15.85, Math.PI, 'HOTEL RIO DR • WESTGATE', 0.12);
  b.zone('Flamingo Rd & Dean Martin Dr', -276, -232, -16, 32);
}

// ================================================================ Freeway Billboards & Traffic Signals

function buildBillboardsAndSignals(b: WorldBuilder, mg: Merger): void {
  // High-visibility Vegas highway billboards facing I-15 & Dean Martin Dr!
  freewayBillboard(b, mg, -218.5, 58, -Math.PI / 2, 'CIRQUE DU SOLEIL • O', 'BELLAGIO • NIGHTLY AT 7 & 9:30', '#0a162a', '#ffffff', '#68d8ff');
  freewayBillboard(b, mg, -218.5, 150, -Math.PI / 2, 'GOLDEN KNIGHTS', 'LIVE HOCKEY AT T-MOBILE ARENA', '#141418', '#ffd44a', '#c8a034');
  freewayBillboard(b, mg, -218.5, 310, -Math.PI / 2, 'IN-N-OUT BURGER', 'NEXT RIGHT • EXIT 37 TROPICANA', '#d81e2a', '#ffffff', '#ffd438');
  freewayBillboard(b, mg, -218.5, 360, -Math.PI / 2, 'EATALY • DOLBY LIVE', 'PARK MGM • WALK THE PARK', '#183222', '#f7ecd4', '#e86888');
  freewayBillboard(b, mg, -240.0, 342, 0, 'T-MOBILE ARENA', 'CONCERTS • UFC • KNIGHTS • TOSHIBA PLAZA', '#1c081a', '#ffffff', '#ff2e92');

  // Synchronized red/yellow/green traffic signals at Tropicana & Dean Martin (-252, 442.7) and Flamingo & Dean Martin (-246, 0)
  const poleMat = mat(0x2c3038, 0.45, 0.75);
  const redOn = basic(0xff2c24);
  const grnOn = basic(0x30e860);
  const ylwOn = basic(0xffb824);
  const offMat = mat(0x14161a, 0.7);
  const sigGroup = new THREE.Group();
  b.scene.add(sigGroup);
  const sigHeads: Array<{ r: THREE.Mesh; y: THREE.Mesh; g: THREE.Mesh; axis: 'ns' | 'ew' }> = [];

  const placeSignal = (x: number, z: number, rotY: number, axis: 'ns' | 'ew') => {
    mg.beam(poleMat, v3(x, 0, z), v3(x, 6.4, z), 0.12, 6, 0.09);
    const armLen = 5.4;
    const dx = Math.sin(rotY) * armLen;
    const dz = Math.cos(rotY) * armLen;
    mg.beam(poleMat, v3(x, 5.9, z), v3(x + dx, 6.1, z + dz), 0.075, 5, 0.055);
    const hx = x + dx * 0.65;
    const hz = z + dz * 0.65;
    mg.box(poleMat, hx, 6.0, hz, 0.36, 0.96, 0.36, rotY);
    const mkBulb = (dy: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.4), offMat);
      m.position.set(hx, 6.0 + dy, hz);
      m.rotation.y = rotY;
      sigGroup.add(m);
      return m;
    };
    sigHeads.push({ r: mkBulb(0.28), y: mkBulb(0), g: mkBulb(-0.28), axis });
    b.collider(x - 0.16, x + 0.16, z - 0.16, z + 0.16, 0, 6.4, true);
  };

  placeSignal(DM_TROP_X - 8, I15.tropZ - 11.5, 0, 'ns');
  placeSignal(DM_TROP_X + 8, I15.tropZ + 11.5, Math.PI, 'ns');
  placeSignal(DM_TROP_X + 8, I15.tropZ - 11.5, -Math.PI / 2, 'ew');
  placeSignal(DM_TROP_X - 8, I15.tropZ + 11.5, Math.PI / 2, 'ew');

  placeSignal(DM_FLAMINGO_X - 8, I15.flamingoZ - 11, 0, 'ns');
  placeSignal(DM_FLAMINGO_X + 8, I15.flamingoZ + 11, Math.PI, 'ns');
  placeSignal(DM_FLAMINGO_X + 8, I15.flamingoZ - 11, -Math.PI / 2, 'ew');
  placeSignal(DM_FLAMINGO_X - 8, I15.flamingoZ + 11, Math.PI / 2, 'ew');

  const sigCull2 = 340 * 340;
  b.every((_dt, t) => {
    const dx = viewer.cam.x + 248;
    const dz = viewer.cam.z - 220;
    const vis = dx * dx + dz * dz < sigCull2;
    sigGroup.visible = vis;
    if (!vis) return;
    const ph = flamingoPhase(t);
    for (const h of sigHeads) {
      const st = ph[h.axis];
      h.r.material = st === 'stop' ? redOn : offMat;
      h.y.material = st === 'yellow' ? ylwOn : offMat;
      h.g.material = st === 'go' ? grnOn : offMat;
    }
  });
}

// ================================================================ Dean Martin Traffic & Street Life

function buildDeanMartinTraffic(b: WorldBuilder): void {
  const lanes: TrafficLane[] = [
    // Dean Martin Dr main N-S stem (z = 80..385)
    { axis: 'z', lanePos: DM_NORTH_X - 3.0, min: 80, max: 386, dir: 1, count: 6, speed: 12.5 },
    { axis: 'z', lanePos: DM_NORTH_X + 3.0, min: 80, max: 386, dir: -1, count: 6, speed: 12.5 },
    // Tropicana / In-N-Out loop stretch (z = 404..496)
    { axis: 'z', lanePos: DM_TROP_X - 3.0, min: 404, max: 496, dir: 1, count: 3, speed: 9.5 },
    { axis: 'z', lanePos: DM_TROP_X + 3.0, min: 404, max: 496, dir: -1, count: 3, speed: 9.5 },
    // Polaris Ave service traffic (z = 10..535)
    { axis: 'z', lanePos: POLARIS_X - 2.2, min: 10, max: 535, dir: 1, count: 5, speed: 10 },
    { axis: 'z', lanePos: POLARIS_X + 2.2, min: 10, max: 535, dir: -1, count: 5, speed: 10 },
  ];
  buildInstancedTraffic(b, lanes, [DM_NORTH_X, 270], 340);
}

function buildDeanMartinCrowds(b: WorldBuilder): void {
  b.crowd.tourists.push(
    // In-N-Out Burger <-> Company Store sidewalk diners
    { pts: [[-243, 430], [-243, 402]], prop: 'bag' },
    { pts: [[-244, 405], [-244, 434], [-259, 456]], prop: 'camera' },
    // Panorama Towers & The Martin residents out walking by Harmon
    { pts: [[-233.2, 206], [-233.2, 278]], prop: 'cig' },
    // Hilton Garden Inn & Homewood Suites guests
    { pts: [[-233.2, 290], [-233.2, 328]], prop: 'bag' },
    // Tommy Rocker's patio regulars
    { pts: [[-233.2, 85], [-233.2, 104]], prop: 'yard-drink' },
    // Joey Bishop Dr under Tropicana Bridge toward TownePlace & Home2 Suites
    { pts: [[-243, 456], [-243, 486]], prop: 'camera' }
  );
}
