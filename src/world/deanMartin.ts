import * as THREE from 'three';
import { viewer, type WorldBuilder } from './builder';
import { buildInNOut } from './food';
import { basic, mat } from './props';
import { flamingoPhase, tropicanaPhase } from './strip';
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
  type TrafficLane,
} from './westKit';
import { I15 } from './interstate';
import { buildValleyViewBackdrop } from './valleyViewBackdrop';

/**
 * Dean Martin Drive & the west-of-I-15 corridor (late-2026 layout, OSM & local listings verified):
 * Runs north from 5201 Hotel Galaxy / 5155 Shooting Center & Hollywood Car Museum / 5115 Auto Bays /
 * 5085 Motel 6 (I-15 Stadium) / Tropicana Wash, through the Tropicana right-in/right-out + Joey Bishop Dr
 * underpass corridor (4975 Hampton Inn, 4940 Home2 Suites, 4920 TownePlace Suites, 3201 Chevron,
 * 3235 Jack in the Box, 3333 dark former Wendy's, 3457 McDonald's, 4888 In-N-Out Burger, 4838 In-N-Out
 * Company Store), past Grove Business Park / Hilton Garden Inn / Homewood Suites / Panorama Towers /
 * Harmon overpass / The Martin / South Tech / 4275 Tommy Rocker's / Flamingo Rd / Centerpoint 4040–4055
 * to W Twain Ave (-185), with a non-collided visual continuation south beside Allegiant Stadium to Russell Rd.
 */

export const WEST_BAY = {
  xW: -311,
  xE: -173, // joins backdrop.ts west edge outside I-15 sound wall
  zN: -196,
  zS: 605,
};

const DM_MAIN_X = -225;
/** The walkable annex south of the bay: x WEST_BAY.xW .. ANNEX_XE (I-15's west wall), z WEST_BAY.zS .. ANNEX_ZS. */
const ANNEX_XE = -214;
const ANNEX_ZS = 912;
const DM_FLAM_X = -248;
const DM_TROP_X = -255;
const JOEY_X = -219.5;
const POLARIS_X = -300;

export function buildDeanMartin(b: WorldBuilder): void {
  const mg = new Merger();
  const lot = new ParkedLotBuilder();

  buildBayGroundAndEdges(b, mg);
  buildDeanMartinRoadNetwork(b, mg);
  buildTropicanaCornersSouth(b, mg, lot);
  buildMotel6AndSouthIndustrial(b, mg, lot);
  buildInNOutNorthWedge(b, mg, lot);
  buildCityCenterWestRow(b, mg, lot);
  buildTommyRockersAndTwainCorridor(b, mg, lot);
  buildVisualSouthExtension(b, mg);
  buildBillboardsAndSignals(b, mg);
  buildValleyViewBackdrop(b);

  mg.flush(b);
  lot.emit(b, -252, 265, 380);
  buildDeanMartinTraffic(b);
  buildDeanMartinCrowds(b);
}

// ================================================================ Procedural Brand Signage Helper

function addCanvasSignBox(
  b: WorldBuilder,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  draw: (ctx: CanvasRenderingContext2D, cw: number, ch: number) => void,
  opts: { lit?: boolean; depth?: number; backing?: number; twoSided?: boolean } = {}
): void {
  const { lit = true, depth = 0.24, backing = 0x1e2228, twoSided = false } = opts;
  const tex = canvasTex(512, Math.max(128, Math.round((512 * h) / w)), draw);
  const faceMat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: lit ? 0xffffff : 0x000000,
    emissiveMap: lit ? tex : null,
    emissiveIntensity: lit ? 0.28 : 0,
    roughness: lit ? 0.36 : 0.72,
    metalness: 0.08,
  });
  if (lit) b.nightGlow(faceMat, 0.24, 1.05);
  const sideMat = mat(backing, 0.55, 0.45);
  const mats = twoSided
    ? [sideMat, sideMat, sideMat, sideMat, faceMat, faceMat]
    : [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat];
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), mats);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  b.add(m);
}

function drawChevronLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.fillStyle = '#0054a4';
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s * 0.9);
  ctx.lineTo(cx, cy - s * 0.35);
  ctx.lineTo(cx + s, cy - s * 0.9);
  ctx.lineTo(cx + s, cy - s * 0.25);
  ctx.lineTo(cx, cy + s * 0.28);
  ctx.lineTo(cx - s, cy - s * 0.25);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ed1c24';
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s * 0.05);
  ctx.lineTo(cx, cy + s * 0.48);
  ctx.lineTo(cx + s, cy - s * 0.05);
  ctx.lineTo(cx + s, cy + s * 0.6);
  ctx.lineTo(cx, cy + s * 1.12);
  ctx.lineTo(cx - s, cy + s * 0.6);
  ctx.closePath();
  ctx.fill();
}

// ================================================================ Ground, Bay Edges & Washes

function buildBayGroundAndEdges(b: WorldBuilder, mg: Merger): void {
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.abs(-213.8 - WEST_BAY.xW) + 2, WEST_BAY.zS - WEST_BAY.zN + 8),
    mat(0x9a8c76, 0.96)
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set((-213.8 + WEST_BAY.xW) / 2, L0 - 0.006, (WEST_BAY.zN + WEST_BAY.zS) / 2);
  pad.receiveShadow = true;
  b.add(pad);

  // Perimeter berms & colliders synced with backdrop.ts bayWN / bayWS
  const edgeMat = mat(0x6b5a46, 0.95);
  const bayW = WEST_BAY.xE - WEST_BAY.xW;
  const bayD = WEST_BAY.zS - WEST_BAY.zN;
  b.box(WEST_BAY.xW, 0, (WEST_BAY.zN + WEST_BAY.zS) / 2, 1.2, 0.8, bayD, edgeMat, false, false);
  b.box((WEST_BAY.xW + WEST_BAY.xE) / 2, 0, WEST_BAY.zN, bayW, 0.8, 1.2, edgeMat, false, false);
  // South of z = 605 the bay carries on as a walkable annex west of I-15 (Allegiant Stadium, Russell Rd and the
  // Dean Martin hotel row down to Residence Inn 5875); only the I-15 strip is closed off there.
  b.box((ANNEX_XE + WEST_BAY.xE) / 2, 0, WEST_BAY.zS, WEST_BAY.xE - ANNEX_XE, 0.8, 1.2, edgeMat, false, false);
  b.box(WEST_BAY.xW, 0, (WEST_BAY.zS + ANNEX_ZS) / 2, 1.2, 0.8, ANNEX_ZS - WEST_BAY.zS, edgeMat, false, false);
  b.box((WEST_BAY.xW + ANNEX_XE) / 2, 0, ANNEX_ZS, ANNEX_XE - WEST_BAY.xW, 0.8, 1.2, edgeMat, false, false);
  b.box(ANNEX_XE, 0, (WEST_BAY.zS + ANNEX_ZS) / 2, 1.2, 0.8, ANNEX_ZS - WEST_BAY.zS, edgeMat, false, false);
  b.collider(WEST_BAY.xW - 50, WEST_BAY.xW - 0.6, WEST_BAY.zN - 50, ANNEX_ZS + 50, 0, 60, true);
  b.collider(WEST_BAY.xW - 50, WEST_BAY.xE + 2, WEST_BAY.zN - 50, WEST_BAY.zN - 0.6, 0, 60, true);
  b.collider(ANNEX_XE + 0.6, WEST_BAY.xE + 2, WEST_BAY.zS + 0.6, ANNEX_ZS + 50, 0, 60, true);
  b.collider(WEST_BAY.xW - 50, ANNEX_XE + 0.6, ANNEX_ZS + 0.6, ANNEX_ZS + 50, 0, 60, true);
  const annexPad = new THREE.Mesh(new THREE.PlaneGeometry(ANNEX_XE - WEST_BAY.xW + 2, ANNEX_ZS - WEST_BAY.zS + 2), mat(0x9a8c76, 0.96));
  annexPad.rotation.x = -Math.PI / 2;
  annexPad.position.set((ANNEX_XE + WEST_BAY.xW) / 2, L0 - 0.006, (WEST_BAY.zS + ANNEX_ZS) / 2);
  annexPad.receiveShadow = true;
  b.add(annexPad);
  // Allegiant Stadium (southStrip.ts draws it) is solid now that you can walk up to it
  b.collider(-321, -249, 664, 727, 0, 30, true);

  // Flamingo Wash (north of Flamingo) & Tropicana Wash (south of Home2 / Hampton Inn)
  const concrete = mat(0x8e8a80, 0.9);
  const curbCol = mat(0x6c685e, 0.9);
  for (const [wz, spanW, xc] of [
    [-28, 72, -262],
    [494.5, 86, -260],
  ] as Array<[number, number, number]>) {
    mg.box(concrete, xc, 0.04, wz, spanW, 0.1, 6.2);
    mg.box(curbCol, xc, 0.18, wz - 3.2, spanW, 0.45, 0.35);
    mg.box(curbCol, xc, 0.18, wz + 3.2, spanW, 0.45, 0.35);
  }
}

// ================================================================ Roads, 5-Lane TWLTL, Tropicana Median & Signals

function angledRoadSeg(
  b: WorldBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  w: number,
  lanes: number,
  twoWay = true
): void {
  const len = Math.hypot(x1 - x0, z1 - z0) + 3.2;
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  const me = new THREE.Mesh(new THREE.PlaneGeometry(w, len), roadStripMat(lanes, len, twoWay));
  me.rotation.order = 'YXZ';
  me.rotation.y = yaw;
  me.rotation.x = -Math.PI / 2;
  me.position.set((x0 + x1) / 2, L1 + 0.002, (z0 + z1) / 2);
  me.receiveShadow = true;
  b.add(me);
}

/** World X centerline of Dean Martin Dr at any z coordinate along the corridor. */
function dmCenterX(z: number): number {
  if (z < -120) return -228 + ((-120 - z) / 80) * 6;
  if (z < -40) return -228 + ((z + 120) / 80) * (DM_FLAM_X + 228);
  if (z <= 40) return DM_FLAM_X;
  if (z < 92) return DM_FLAM_X + ((z - 40) / 52) * (DM_MAIN_X - DM_FLAM_X);
  if (z <= 386) return DM_MAIN_X;
  if (z < 424) return DM_MAIN_X + ((z - 386) / 38) * (DM_TROP_X - DM_MAIN_X);
  if (z <= 482) return DM_TROP_X;
  if (z < 502) return DM_TROP_X + ((z - 482) / 20) * (DM_MAIN_X - DM_TROP_X);
  return DM_MAIN_X;
}

function buildDeanMartinRoadNetwork(b: WorldBuilder, mg: Merger): void {
  // Continuous 5-lane TWLTL Dean Martin Dr (2 NB + 2 SB + center turn lane = 16.4m)
  angledRoadSeg(b, -222, -196, -228, -120, 16.4, 5, true);
  angledRoadSeg(b, -228, -120, DM_FLAM_X, -40, 16.4, 5, true);
  flatRoad(b, DM_FLAM_X, 0, 16.4, 82, 'z', 5, true, L1, 'Dean Martin Dr');
  angledRoadSeg(b, DM_FLAM_X, 40, DM_MAIN_X, 92, 16.4, 5, true);
  flatRoad(b, DM_MAIN_X, 239, 16.4, 296, 'z', 5, true, L1, 'Dean Martin Dr');
  angledRoadSeg(b, DM_MAIN_X, 386, DM_TROP_X, 424, 17.6, 5, true);
  // Wide right-turn channelized flare approaching Tropicana & wrapping Hampton Inn down to z=482
  flatRoad(b, DM_TROP_X, 453, 17.4, 58, 'z', 6, true, L1, 'Dean Martin Dr');
  angledRoadSeg(b, DM_TROP_X, 482, DM_MAIN_X, 502, 16.4, 5, true);
  flatRoad(b, DM_MAIN_X, 554, 16.4, 102, 'z', 5, true, L1, 'Dean Martin Dr');

  b.zone('Dean Martin Dr (Twain–Flamingo)', -255, -216, -196, 40);
  b.zone('Dean Martin Dr (Midtown–Harmon)', DM_MAIN_X - 9, DM_MAIN_X + 9, 80, 390);
  b.zone('Dean Martin Dr (Tropicana)', DM_TROP_X - 10, DM_TROP_X + 10, 400, 495);
  b.zone('Dean Martin Dr (South Industrial)', DM_MAIN_X - 9, DM_MAIN_X + 9, 500, 605);

  // Joey Bishop Dr: continuous N-S through-route running underneath Tropicana Bridge (-219.5)
  flatRoad(b, JOEY_X, 442, 6.6, 100, 'z', 2, true, L1, 'Joey Bishop Dr');
  flatRoad(b, -234, 392, 8.0, 32, 'x', 2, true, L1); // north connector beside In-N-Out Co Store
  flatRoad(b, -237, 490, 8.0, 38, 'x', 2, true, L1); // south connector beside Home2 Suites

  // Cross arterials west of I-15 bridges
  flatRoad(b, -264, -185, 13.5, 88, 'x', 4, true, L1, 'W Twain Ave');
  flatRoad(b, -274, I15.flamingoZ, 19.5, 74, 'x', 6, true, L1, 'W Flamingo Rd');
  flatRoad(b, -284, I15.harmonZ, 13.5, 54, 'x', 4, true, L1, 'W Harmon Ave');
  flatRoad(b, -274, I15.tropZ, 21.0, 72, 'x', 6, true, L1, 'W Tropicana Ave');
  flatRoad(b, -267, 180, 7.5, 72, 'x', 2, true, L1, 'Business Ln');
  flatRoad(b, -266, 199, 7.5, 70, 'x', 2, true, L1, 'Jerry Lewis Way');
  flatRoad(b, -306, 530, 8.5, 12, 'x', 2, true, L1, 'W Reno Ave'); // ends west at Polaris / Industrial Park

  // Polaris Ave parallel western collector (-300)
  flatRoad(b, POLARIS_X, 204, 9.5, 800, 'z', 2, true, L1, 'Polaris Ave');
  b.zone('Polaris Ave', POLARIS_X - 5, POLARIS_X + 5, -192, 600);

  // Permanent NDOT Tropicana Raised Center Median blocking N-S through-crossing at Tropicana/Dean Martin!
  const medConc = mat(0xb2aba0, 0.86);
  const yellowTrim = mat(0xd8a828, 0.65);
  mg.box(medConc, -278, 0.22, I15.tropZ, 64, 0.44, 1.8, 0, true);
  mg.box(yellowTrim, -278, 0.06, I15.tropZ - 0.92, 64, 0.12, 0.14);
  mg.box(yellowTrim, -278, 0.06, I15.tropZ + 0.92, 64, 0.12, 0.14);
  b.collider(-310, -246, I15.tropZ - 0.9, I15.tropZ + 0.9, 0, 0.6, true);
  // Flamingo Rd raised median west of bridge
  mg.box(medConc, -273, 0.18, I15.flamingoZ, 62, 0.36, 1.5);
  // Channelized right-turn islands & signage at Tropicana / Dean Martin
  signBoard(b, 'RIGHT TURN ONLY', '#f4f4ef', '#14181e', 2.4, 1.0, DM_TROP_X - 7.8, 2.8, I15.tropZ - 14.5, 0, 'NO THRU TRAFFIC', 0.1);
  signBoard(b, 'RIGHT TURN ONLY', '#f4f4ef', '#14181e', 2.4, 1.0, DM_TROP_X + 7.8, 2.8, I15.tropZ + 14.5, Math.PI, 'USE JOEY BISHOP DR', 0.1);

  // Continuous Sidewalks, Cobra Streetlights & Light Pools following Dean Martin curvature
  const walkMat = mat(0xb6afa2, 0.88);
  const poolMat = lightPoolMat(true);
  const pools = new Merger();
  const cwMat = crosswalkStripeMat(1, 1);

  for (let z = -190; z <= 596; z += 14) {
    const cx = dmCenterX(z);
    // West sidewalk continuous from Twain to South Industrial (clear of cross-arterial road decks)
    if (Math.abs(z - I15.flamingoZ) > 9 && Math.abs(z - I15.tropZ) > 10 && Math.abs(z + 185) > 7) {
      mg.box(walkMat, cx - 9.4, L1 * 0.6, z, 2.4, L1 * 1.2, 14.4);
    }
    // East sidewalk where real East-side parcels/access exist (Twain, Flamingo, In-N-Out..Home2)
    if (z < -42 || Math.abs(z) < 28 || (z >= 394 && z <= 488)) {
      if (Math.abs(z - I15.flamingoZ) > 9 && Math.abs(z - I15.tropZ) > 10 && Math.abs(z + 185) > 7) {
        mg.box(walkMat, cx + 9.4, L1 * 0.6, z, 2.4, L1 * 1.2, 14.4);
      }
    }
  }
  for (let z = -170; z <= 590; z += 32) {
    if (Math.abs(z - I15.harmonZ) < 12 || Math.abs(z - I15.tropZ) < 18 || Math.abs(z - I15.flamingoZ) < 13) continue;
    const cx = dmCenterX(z);
    cobraPoleInto(mg, b, cx - 9.0, z, Math.PI / 2, 9.0, 2.6);
    if (z >= 398 && z <= 486 && Math.abs(z - 470) > 10) cobraPoleInto(mg, b, cx + 9.0, z, -Math.PI / 2, 9.0, 2.6);
    const p = new THREE.PlaneGeometry(14, 14);
    p.rotateX(-Math.PI / 2);
    p.translate(cx, L1 + 0.014, z);
    pools.add(p, poolMat);
  }
  pools.flush(b);

  // Crosswalks at real signalized / pedestrian-controlled crossings
  const addCW = (cx: number, cz: number, w: number, d: number, ew: boolean) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), cwMat);
    m.rotation.set(-Math.PI / 2, 0, ew ? 0 : Math.PI / 2);
    m.position.set(cx, L1 + 0.018, cz);
    b.add(m);
  };
  for (const dz of [-11, 11]) addCW(DM_FLAM_X, I15.flamingoZ + dz, 15.5, 2.6, true);
  for (const dx of [-10, 10]) addCW(DM_FLAM_X + dx, I15.flamingoZ, 18, 2.6, false);
  for (const dz of [-9.5, 9.5]) addCW(-224, -185 + dz, 15.5, 2.4, true);
  // Tropicana right-turn & Tropicana approach pedestrian crossings
  addCW(DM_TROP_X - 11.5, I15.tropZ, 19, 2.8, false);
  addCW(DM_TROP_X, I15.tropZ - 12.2, 16, 2.6, true);
  addCW(DM_TROP_X, I15.tropZ + 12.2, 16, 2.6, true);

  // Pedestrian stair landing linking Harmon Ave Overpass sidewalk down to Dean Martin Dr
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

// ================================================================ Tropicana South Quadrants (East & West)

function buildTropicanaCornersSouth(b: WorldBuilder, mg: Merger, lot: ParkedLotBuilder): void {
  // ---- EAST SIDE: Dual-Brand 8-Story Hotel Complex (4920 TownePlace Suites + 4940 Home2 Suites)
  // Shared 3-story architectural parking podium base (DesignCell dual-brand layout cleanly between Dean Martin -245 & Joey Bishop -223)
  const podiumMat = mat(0xb8afa2, 0.8);
  const podiumTrim = mat(0x4a5058, 0.55);
  mg.box(podiumMat, -233.5, 4.2, 466.5, 13.6, 8.4, 29.0, 0, true);
  // Crisp horizontal concrete floor slabs & perforated garage screen bays (no blank dark blocks)
  for (const sy of [2.8, 5.6, 8.45]) mg.box(podiumTrim, -233.5, sy, 466.5, 14.0, 0.32, 29.4);
  const screenGlass = new THREE.MeshStandardMaterial({ color: 0x2a3642, roughness: 0.25, metalness: 0.45, emissive: 0x3b4d5e, emissiveIntensity: 0.22 });
  const lobbyGlass = new THREE.MeshStandardMaterial({ color: 0x222c38, emissive: 0xffe4aa, emissiveIntensity: 0.12, roughness: 0.15, metalness: 0.3 });
  b.nightGlow(lobbyGlass, 0.1, 1.05);
  for (const gz of [456, 461, 466, 471, 476]) {
    mg.box(screenGlass, -240.35, 4.25, gz, 0.14, 1.8, 3.6);
    mg.box(screenGlass, -240.35, 7.05, gz, 0.14, 1.8, 3.6);
  }
  mg.box(lobbyGlass, -240.35, 1.45, 457.5, 0.16, 2.5, 5.2);
  mg.box(lobbyGlass, -240.35, 1.45, 474.5, 0.16, 2.5, 5.2);
  for (const dz of [-1.7, 0, 1.7]) {
    mg.box(podiumTrim, -240.4, 1.45, 457.5 + dz, 0.08, 2.5, 0.1);
    mg.box(podiumTrim, -240.4, 1.45, 474.5 + dz, 0.08, 2.5, 0.1);
  }
  b.collider(-240.4, -226.7, 452.0, 481.0, 0, 8.6, true);

  // 4920 S Dean Martin Dr: TownePlace Suites by Marriott (North 5-story suite tower atop 3-story podium)
  const marriottSpec: FacadeSpec = {
    wall: '#c8baa6',
    mullion: '#363b42',
    glass: '#2d3b48',
    lit: '#ffdfa4',
    cols: 7,
    rows: 5,
    style: 1,
    seed: 4920,
  };
  addBuilding(b, mg, {
    x: -233.5,
    z: 457.5,
    w: 13.0,
    d: 10.5,
    h: 22.5,
    wall: marriottSpec,
    trim: 0x3b4048,
    label: 'TownePlace Suites',
    collider: false,
  });
  mg.box(mat(0xb42e28, 0.45), -240.1, 21.3, 457.5, 0.22, 0.55, 10.6);
  mg.box(mat(0x282c34, 0.5), -242.0, 3.3, 457.5, 3.4, 0.35, 5.8);
  addCanvasSignBox(
    b,
    8.2,
    1.55,
    -240.15,
    16.8,
    457.5,
    -Math.PI / 2,
    (ctx) => {
      ctx.fillStyle = '#182028';
      ctx.fillRect(0, 0, 512, 97);
      ctx.fillStyle = '#c42e24';
      ctx.fillRect(0, 0, 512, 10);
      ctx.fillStyle = '#f6efe0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 38px system-ui, sans-serif';
      ctx.fillText('TOWNEPLACE SUITES', 256, 44);
      ctx.fillStyle = '#d4b888';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText('MARRIOTT • 4920 DEAN MARTIN DR', 256, 78);
    },
    { depth: 0.2 }
  );
  b.zone('TownePlace Suites (4920 Dean Martin)', -245, -223, 451, 464);

  // 4940 S Dean Martin Dr: Home2 Suites by Hilton (South 5-story suite tower atop 3-story podium, lime green accent blade)
  const home2Spec: FacadeSpec = {
    wall: '#9aa0a6',
    mullion: '#dce2e8',
    glass: '#2c3d4d',
    lit: '#dcf6b6',
    cols: 7,
    rows: 6,
    style: 1,
    seed: 4940,
  };
  addBuilding(b, mg, {
    x: -233.5,
    z: 474.5,
    w: 13.0,
    d: 12.0,
    h: 23.0,
    wall: home2Spec,
    trim: 0x78be20,
    label: 'Home2 Suites',
    collider: false,
  });
  const home2Lime = mat(0x78be20, 0.42);
  mg.box(home2Lime, -240.2, 12.2, 479.8, 0.45, 22.0, 1.3);
  mg.box(home2Lime, -240.1, 21.8, 474.5, 0.24, 0.45, 11.8);
  addCanvasSignBox(
    b,
    8.6,
    1.55,
    -240.15,
    17.2,
    474.0,
    -Math.PI / 2,
    (ctx) => {
      ctx.fillStyle = '#1d242a';
      ctx.fillRect(0, 0, 512, 92);
      ctx.fillStyle = '#78be20';
      ctx.fillRect(0, 74, 512, 18);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.fillText('HOME2 SUITES', 256, 34);
      ctx.fillStyle = '#9ef048';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText('BY HILTON • 4940 DEAN MARTIN DR', 256, 62);
    },
    { depth: 0.2 }
  );
  b.zone('Home2 Suites (4940 Dean Martin)', -245, -223, 465, 484);

  // ---- WEST SIDE / SOUTH TROPICANA FRONTAGE (East -> West along W Tropicana Ave, strictly clear west of -265):
  // 1. 3201 W Tropicana Ave (SW Corner of Dean Martin & Tropicana): Chevron / Terrible's ExtraMile
  paving(b, -277, -265, 452, 466, '#484a50', '#3a3c42', 4, L0);
  const chevWhite = mat(0xf4f4f0, 0.5);
  const chevBlue = mat(0x0054a4, 0.45);
  const chevRed = mat(0xed1c24, 0.45);
  mg.box(chevWhite, -271, 5.2, 456.8, 9.0, 0.7, 6.2, 0, true);
  mg.box(chevBlue, -271, 5.42, 460.0, 9.05, 0.24, 0.14);
  mg.box(chevRed, -271, 5.18, 460.0, 9.05, 0.24, 0.14);
  mg.box(chevBlue, -271, 5.42, 453.6, 9.05, 0.24, 0.14);
  mg.box(chevRed, -271, 5.18, 453.6, 9.05, 0.24, 0.14);
  const canopyGlow = new THREE.MeshStandardMaterial({ color: 0xf5f8ff, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.35 });
  b.nightGlow(canopyGlow, 0.35, 1.35);
  mg.box(canopyGlow, -271, 4.82, 456.8, 8.2, 0.06, 5.2);
  for (const px of [-274.0, -271.0, -268.0]) {
    for (const pz of [455.2, 458.4]) {
      mg.box(chevWhite, px, 2.5, pz, 0.4, 4.8, 0.4);
      mg.box(chevBlue, px, 0.78, pz, 0.62, 1.45, 0.5);
      mg.box(chevRed, px, 1.56, pz, 0.64, 0.16, 0.52);
      b.collider(px - 0.35, px + 0.35, pz - 0.3, pz + 0.3, 0, 4.8, true);
    }
  }
  addBuilding(b, mg, { x: -271, z: 462.6, w: 9.2, d: 4.0, h: 3.8, wall: 0xebe6dc, trim: 0x0054a4, roof: 0x56524e, label: 'Chevron ExtraMile' });
  const qsrLitGlass = new THREE.MeshStandardMaterial({ color: 0x1e262e, emissive: 0xffe4a8, emissiveIntensity: 0.48, roughness: 0.14 });
  b.nightGlow(qsrLitGlass, 0.35, 1.1);
  mg.box(qsrLitGlass, -271, 1.5, 460.56, 5.4, 1.8, 0.12); // Chevron C-store glowing storefront windows
  addCanvasSignBox(
    b,
    7.6,
    1.15,
    -271,
    3.25,
    460.5,
    Math.PI,
    (ctx) => {
      ctx.fillStyle = '#004282';
      ctx.fillRect(0, 0, 512, 78);
      drawChevronLogo(ctx, 44, 39, 24);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.fillText('CHEVRON • EXTRAMILE', 84, 30);
      ctx.fillStyle = '#ffd84a';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillText("TERRIBLE'S MARKET • 3201 W TROPICANA", 84, 58);
    },
    { depth: 0.14 }
  );
  // Iconic Corner Chevron Fuel Price Monument Pylon (shifted cleanly clear of signal post at -266)
  mg.beam(mat(0x3a3e44, 0.5, 0.7), v3(-268.2, 0, 454.2), v3(-268.2, 7.6, 454.2), 0.2, 6);
  addCanvasSignBox(
    b,
    3.4,
    2.6,
    -268.2,
    6.2,
    454.2,
    -Math.PI / 6,
    (ctx) => {
      ctx.fillStyle = '#0a2d62';
      ctx.fillRect(0, 0, 512, 392);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 512, 130);
      drawChevronLogo(ctx, 90, 66, 42);
      ctx.fillStyle = '#004282';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 56px system-ui, sans-serif';
      ctx.fillText('Chevron', 152, 70);
      ctx.fillStyle = '#ff3838';
      ctx.font = 'bold 46px monospace';
      ctx.fillText('REG   $4.19', 48, 195);
      ctx.fillStyle = '#ffd84a';
      ctx.fillText('SUP   $4.59', 48, 265);
      ctx.fillStyle = '#62e078';
      ctx.fillText('DSL   $4.49', 48, 335);
    },
    { depth: 0.26, twoSided: true }
  );
  b.zone('Chevron (3201 W Tropicana)', -278, -264, 452, 466);

  // 2. 3235 W Tropicana Ave (immediately west of Chevron): Jack in the Box + Drive-Thru
  paving(b, -287, -277, 451, 464, '#505258', '#43454a', 4, L0);
  addBuilding(b, mg, { x: -282.0, z: 455.2, w: 6.8, d: 6.0, h: 4.0, wall: 0xd9cdb8, trim: 0xd4121f, roof: 0x56524e, label: 'Jack in the Box' });
  mg.box(mat(0xd4121f, 0.5), -282.0, 4.35, 455.2, 7.2, 0.85, 6.4);
  mg.box(qsrLitGlass, -282.0, 1.45, 452.16, 4.6, 1.75, 0.12); // dining glass fronting Tropicana
  addCanvasSignBox(
    b,
    6.0,
    1.35,
    -282.0,
    3.45,
    452.1,
    Math.PI,
    (ctx) => {
      ctx.fillStyle = '#1f2328';
      ctx.fillRect(0, 0, 512, 108);
      ctx.fillStyle = '#d4121f';
      ctx.fillRect(14, 12, 92, 84);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'italic bold 36px system-ui, sans-serif';
      ctx.fillText('Jack', 60, 56);
      ctx.textAlign = 'left';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText('IN THE BOX', 124, 42);
      ctx.fillStyle = '#ffd238';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText('3235 W TROPICANA • 24 HRS', 124, 80);
    },
    { depth: 0.14 }
  );
  addCanvasSignBox(b, 2.0, 1.4, -286.2, 1.5, 456.8, -Math.PI / 2, (ctx) => {
    ctx.fillStyle = '#181c22';
    ctx.fillRect(0, 0, 512, 326);
    ctx.fillStyle = '#d4121f';
    ctx.fillRect(0, 0, 512, 54);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('DRIVE-THRU MENU', 24, 38);
    ctx.fillStyle = '#ffe588';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('JUMBO JACK   TACOS   CURLY FRIES', 24, 165);
  });
  b.zone('Jack in the Box (3235 W Tropicana)', -287, -277, 451, 464);

  // 3. 3333 W Tropicana Ave (west of Jack in the Box): Vacant / Dark Former Wendy's Pad
  paving(b, -296, -287, 451, 464, '#565558', '#48474a', 4, L0);
  addBuilding(b, mg, { x: -291.5, z: 454.8, w: 6.8, d: 5.8, h: 4.1, wall: 0x8c8478, trim: 0x3b3532, roof: 0x4c4844, label: "3333 W Tropicana (Former Wendy's)" });
  mg.box(mat(0x4b443e, 0.72), -291.5, 4.35, 454.8, 7.1, 0.7, 6.1);
  mg.box(mat(0x1e2228, 0.35), -291.5, 1.45, 451.86, 4.2, 1.7, 0.12); // dark shuttered dining windows
  addCanvasSignBox(
    b,
    5.8,
    1.15,
    -291.5,
    3.3,
    451.8,
    Math.PI,
    (ctx) => {
      ctx.fillStyle = '#2d3034';
      ctx.fillRect(0, 0, 512, 95);
      ctx.strokeStyle = '#c83428';
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, 496, 79);
      ctx.fillStyle = '#e8e2d8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 25px system-ui, sans-serif';
      ctx.fillText('FOR LEASE • 3333 W TROPICANA', 256, 36);
      ctx.fillStyle = '#a89f96';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillText('DRIVE-THRU PAD (FORMER QSR)', 256, 68);
    },
    { lit: false, depth: 0.12 }
  );
  b.zone('3333 W Tropicana (Vacant QSR)', -296, -287, 451, 464);

  // 4. 3457 W Tropicana Ave (west side across Polaris Ave): McDonald's
  addBuilding(b, mg, { x: -306.5, z: 454.0, w: 6.5, d: 6.5, h: 4.2, wall: 0x46484e, trim: 0xb82228, label: "McDonald's" });
  addCanvasSignBox(
    b,
    5.2,
    1.35,
    -306.5,
    3.6,
    450.6,
    Math.PI,
    (ctx) => {
      ctx.fillStyle = '#da291c';
      ctx.fillRect(0, 0, 512, 132);
      ctx.strokeStyle = '#ffc72c';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(70, 96, 34, Math.PI, 0);
      ctx.arc(138, 96, 34, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 38px system-ui, sans-serif';
      ctx.fillText("McDONALD'S", 196, 52);
      ctx.fillStyle = '#ffc72c';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('3457 W TROPICANA', 196, 94);
    },
    { depth: 0.14 }
  );
  b.zone("McDonald's (3457 W Tropicana)", -310, -304, 449, 463);

  // ---- WEST SIDE SOUTH OF CHEVRON: 4975 S Dean Martin Dr — Hampton Inn Tropicana (6-story U-courtyard + Pool)
  // Strictly clear WEST of Dean Martin's -264.5 west sidewalk down to z=490!
  paving(b, -295, -265, 466, 491, '#7a7266', '#645c52', 4, L0);
  const hamptonSpec: FacadeSpec = {
    wall: '#d8cbb6',
    mullion: '#efe7d8',
    glass: '#34495e',
    lit: '#ffe3aa',
    cols: 7,
    rows: 6,
    style: 0,
    seed: 4975,
  };
  const hNavy = mat(0x0b2854, 0.55);
  addBuilding(b, mg, { x: -281.5, z: 469.5, w: 24, d: 6.5, h: 19.0, wall: hamptonSpec, trim: 0x0b2854, label: 'Hampton Inn' });
  addBuilding(b, mg, { x: -290.5, z: 477.5, w: 6.0, d: 10.5, h: 19.0, wall: hamptonSpec, trim: 0x0b2854, label: 'Hampton Inn' });
  addBuilding(b, mg, { x: -281.5, z: 485.5, w: 24, d: 6.5, h: 19.0, wall: hamptonSpec, trim: 0x0b2854, label: 'Hampton Inn' });
  // Porte-cochere lobby tucked on South wing so central pool courtyard opens cleanly to Dean Martin Dr
  addBuilding(b, mg, { x: -270.0, z: 484.5, w: 7.0, d: 7.0, h: 6.2, wall: hamptonSpec, trim: 0x0b2854, label: 'Hampton Lobby' });
  mg.box(mat(0x1f2836, 0.5), -265.2, 3.6, 484.5, 3.2, 0.4, 6.4);
  // Decorative low sandstone pool courtyard curb opening east onto Dean Martin sidewalk
  mg.box(mat(0xc8bca6, 0.75), -268.2, 0.35, 477.5, 0.35, 0.7, 9.2);
  mg.box(hNavy, -269.3, 17.6, 469.5, 0.3, 0.5, 6.6);
  const poolMat = new THREE.MeshStandardMaterial({ color: 0x2cc2dc, roughness: 0.08, emissive: 0x167890, emissiveIntensity: 0.42 });
  b.nightGlow(poolMat, 0.2, 0.85);
  const poolM = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 7.2), poolMat);
  poolM.rotation.x = -Math.PI / 2;
  poolM.position.set(-278.5, L2, 477.5);
  b.add(poolM);
  mg.box(mat(0xc9b490, 0.8), -278.5, L1 + 0.01, 477.5, 16.5, 0.04, 8.8);
  mg.box(mat(0x6e4a2e, 0.8), -285.5, 1.8, 477.5, 3.0, 0.25, 3.4);
  for (const [px, pz] of [
    [-271.5, 473.8],
    [-271.5, 481.2],
    [-285.0, 474.0],
    [-285.0, 481.0],
    [-267.0, 471.5],
    [-267.0, 484.0],
  ]) {
    palmInto(mg, px, pz, 7.2, px + pz);
  }
  addCanvasSignBox(
    b,
    8.2,
    1.7,
    -269.25,
    14.6,
    469.5,
    Math.PI / 2,
    (ctx) => {
      ctx.fillStyle = '#0b2854';
      ctx.fillRect(0, 0, 512, 102);
      ctx.fillStyle = '#d4202a';
      ctx.fillRect(0, 86, 512, 16);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'italic bold 42px Georgia, serif';
      ctx.fillText('Hampton Inn', 256, 38);
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText('BY HILTON • 4975 DEAN MARTIN DR', 256, 70);
    },
    { depth: 0.22 }
  );
  addCanvasSignBox(b, 3.2, 1.5, -265.2, 2.0, 471.0, Math.PI / 2, (ctx) => {
    ctx.fillStyle = '#0b2854';
    ctx.fillRect(0, 0, 512, 214);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic bold 56px Georgia, serif';
    ctx.fillText('Hampton Inn', 256, 86);
    ctx.fillStyle = '#9cc4ff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('TROPICANA • 4975', 256, 156);
  }, { twoSided: true });
  lot.bays(-295, -289, 466, 489, 2, 4, Math.PI / 2, 0.72, 4975);
  b.zone('Hampton Inn Tropicana (4975)', -296, -265, 466, 491);
}

// ================================================================ South Industrial & Motel 6 (5085..5201..605)

function buildMotel6AndSouthIndustrial(b: WorldBuilder, mg: Merger, lot: ParkedLotBuilder): void {
  // ---- 5085 S Dean Martin Dr: Motel 6 Las Vegas, NV - I-15 Stadium (rebranded from Park Inn by Radisson)
  // Verified 2-floor exterior-corridor U-wing footprint clearly west of straight Dean Martin (-234.5 sidewalk)
  paving(b, -267, -236, 502, 526, '#626268', '#525258', 4, L0);
  const m6Facade: FacadeSpec = { wall: '#f0ebe0', mullion: '#003b71', glass: '#2d3c4e', lit: '#ffe2a4', cols: 7, rows: 2, style: 0, seed: 5085 };
  const m6Blue = 0x003b71;
  const m6Red = 0xe31837;
  // North wing, West spine, South wing (2 stories = 6.8m exterior-corridor motel)
  addBuilding(b, mg, { x: -251.5, z: 506.0, w: 22.0, d: 5.8, h: 6.8, wall: m6Facade, trim: m6Blue, roof: 0x4e4a44, label: 'Motel 6' });
  addBuilding(b, mg, { x: -260.5, z: 513.5, w: 6.5, d: 18.0, h: 6.8, wall: m6Facade, trim: m6Blue, roof: 0x4e4a44, label: 'Motel 6' });
  addBuilding(b, mg, { x: -251.5, z: 521.0, w: 22.0, d: 5.8, h: 6.8, wall: m6Facade, trim: m6Blue, roof: 0x4e4a44, label: 'Motel 6' });
  // Second-floor exterior corridor walkway & signature Motel 6 crimson/navy fascia band
  mg.box(mat(m6Red, 0.5), -251.0, 6.2, 503.05, 22.2, 0.45, 0.16);
  mg.box(mat(m6Red, 0.5), -251.0, 6.2, 523.95, 22.2, 0.45, 0.16);
  for (const wz of [508.95, 518.05]) mg.box(mat(0xd8d2c6, 0.8), -249.5, 3.4, wz, 16.0, 0.18, 1.1);
  // Courtyard swimming pool + iconic tall Motel 6 blue/red "6" roadside pylon facing Dean Martin traffic (rotY = 0)
  const m6Pool = new THREE.Mesh(
    new THREE.PlaneGeometry(9.5, 5.2),
    new THREE.MeshStandardMaterial({ color: 0x32b8d8, roughness: 0.1, emissive: 0x166882, emissiveIntensity: 0.38 })
  );
  m6Pool.rotation.x = -Math.PI / 2;
  m6Pool.position.set(-250.0, L2, 513.5);
  b.add(m6Pool);
  mg.beam(mat(0x3a3e46, 0.5, 0.7), v3(-237.2, 0, 516.5), v3(-237.2, 7.4, 516.5), 0.22, 6);
  addCanvasSignBox(
    b,
    3.2,
    3.8,
    -237.2,
    6.0,
    516.5,
    0,
    (ctx) => {
      ctx.fillStyle = '#003b71';
      ctx.fillRect(0, 0, 512, 597);
      ctx.fillStyle = '#e31837';
      ctx.fillRect(0, 460, 512, 137);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 260px system-ui, sans-serif';
      ctx.fillText('6', 256, 210);
      ctx.font = 'bold 54px system-ui, sans-serif';
      ctx.fillText('MOTEL 6', 256, 405);
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText('I-15 STADIUM • 5085', 256, 528);
    },
    { depth: 0.34, twoSided: true }
  );
  lot.bays(-245, -238, 511, 521, 2, 2, Math.PI / 2, 0.65, 5085);
  b.zone('Motel 6 Las Vegas I-15 Stadium (5085)', -265, -234, 502, 526);

  // ---- 5115 S Dean Martin Dr: Tropicana Industrial Park (J.P. Auto Mechanic, Carl's Cool Cars, StarMotors, American Off-Road)
  addBuilding(b, mg, { x: -245.5, z: 533.0, w: 18.0, d: 10.5, h: 5.6, wall: 0xa69c8e, trim: 0x344458, roof: 0x524e4a, label: "5115 J.P. Auto & Carl's" });
  addBuilding(b, mg, { x: -269.0, z: 533.0, w: 14.0, d: 18.0, h: 5.8, wall: 0x9c9488, trim: 0x383e46, roof: 0x524e4a, label: 'Auto Service Annex' });
  for (const bz of [529.5, 532.0, 534.5, 537.0]) {
    mg.box(mat(0x282d34, 0.5, 0.5), -236.4, 1.85, bz, 0.16, 3.5, 2.1);
  }
  addCanvasSignBox(b, 10.0, 1.25, -236.25, 4.9, 533.0, Math.PI / 2, (ctx) => {
    ctx.fillStyle = '#182436';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#ffd23a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText("J.P. AUTO • CARL'S COOL CARS • STARMOTORS", 256, 26);
    ctx.fillStyle = '#d4e2f2';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText('5115 DEAN MARTIN DR • OFF-ROAD & REPAIRS', 256, 49);
  }, { depth: 0.14 });
  b.zone('Tropicana Industrial Park (5115 Dean Martin)', -277, -234, 527, 540);

  // ---- 5155 S Dean Martin Dr: Las Vegas Shooting Center & Hollywood Car Museum / Liberace Garage
  addBuilding(b, mg, { x: -246.0, z: 547.5, w: 19.0, d: 12.0, h: 6.4, wall: 0xb4a082, trim: 0x8a1820, roof: 0x524e4a, label: 'Hollywood Car Museum & Range' });
  addBuilding(b, mg, { x: -270.0, z: 550.0, w: 14.0, d: 16.0, h: 6.2, wall: 0x8e867a, trim: 0x464a50, roof: 0x524e4a, label: '5155 Storage Wing' });
  addCanvasSignBox(b, 11.4, 1.5, -236.3, 5.2, 547.5, Math.PI / 2, (ctx) => {
    ctx.fillStyle = '#78121a';
    ctx.fillRect(0, 0, 512, 68);
    ctx.fillStyle = '#ffe290';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('HOLLYWOOD CAR MUSEUM', 256, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText('LAS VEGAS SHOOTING CENTER • 5155 DEAN MARTIN', 256, 51);
  }, { depth: 0.14 });
  lot.bays(-256, -237, 554.5, 558, 4, 1, 0, 0.85, 5155);
  b.zone('Hollywood Car Museum & Shooting Center (5155)', -278, -234, 541, 560);

  // ---- 5201 S Dean Martin Dr (Hotel Galaxy) & South Ali Baba Industrial Complex (z = 562..602)
  addBuilding(b, mg, { x: -245.0, z: 567.0, w: 15.0, d: 11.0, h: 6.6, wall: 0xc2b29a, trim: 0x264668, roof: 0x524e4a, label: 'Hotel Galaxy (5201)' });
  signBoard(b, 'HOTEL GALAXY', '#162c44', '#86e2ff', 8.2, 1.15, -237.35, 5.2, 567.0, Math.PI / 2, '5201 DEAN MARTIN DR', 0.12);
  addBuilding(b, mg, { x: -246.5, z: 586.0, w: 18.0, d: 14.0, h: 6.8, wall: 0xa49b8d, trim: 0x4c525a, roof: 0x524e4a, label: 'Ali Baba Industrial' });
  addBuilding(b, mg, { x: -270.0, z: 576.0, w: 14.0, d: 22.0, h: 6.6, wall: 0x999184, trim: 0x484e56, roof: 0x524e4a, label: 'South Commerce Warehouse' });
  b.zone('5201 Hotel Galaxy & Ali Baba Industrial', -278, -234, 561, 602);
}

// ================================================================ Flagship In-N-Out North Tropicana Wedge (4888 & 4838)

function buildInNOutNorthWedge(b: WorldBuilder, mg: Merger, lot: ParkedLotBuilder): void {
  // East side north of Tropicana bridge between Dean Martin Dr & Joey Bishop Dr (4888 & 4838)
  // Positioned cleanly east of DM curve edge (-240 at z=415, -245 at z=428) with parking strictly off roadway!
  // Real spot (OSM): north of Tropicana between Joey Bishop Dr and Dean Martin Dr, just past the foot of the
  // Tropicana bridge. The store faces Dean Martin; the drive-thru runs along its south side, beside the bridge.
  paving(b, -246, -222.8, 396, 432, '#5a5c62', '#4c4e54', 4, L0);
  b.restaurants.push(
    buildInNOut(b, -230, 421, -Math.PI / 2, {
      name: 'In-N-Out (4888 Dean Martin Dr)',
      standalone: true,
      w: 12,
      d: 10,
      look: 'vegas',
      address: '4888',
      queueCars: 2,
      patioXs: [1.6, 4.6],
    })
  );
  b.zone('In-N-Out Burger (4888 Dean Martin Dr)', -246, -222.8, 412, 432);

  // 4838 S Dean Martin Dr: In-N-Out Company Store north of the burger restaurant
  addBuilding(b, mg, { x: -227.2, z: 404.5, w: 8.0, d: 8.4, h: 5.4, wall: 0xf7f3eb, trim: 0xd81e2a, roof: 0x524e4a, label: 'In-N-Out Company Store' });
  mg.box(mat(0xd81e2a, 0.45), -231.45, 3.2, 404.5, 0.5, 0.32, 8.0);
  const storeGlass = new THREE.MeshStandardMaterial({ color: 0x1b242e, emissive: 0xffe6b0, emissiveIntensity: 0.08, roughness: 0.14, metalness: 0.35 });
  b.nightGlow(storeGlass, 0.08, 1.0);
  mg.box(storeGlass, -231.3, 1.6, 404.5, 0.12, 2.4, 6.4);
  for (const dz of [-2.1, 0, 2.1]) mg.box(mat(0xd81e2a, 0.45), -231.38, 1.6, 404.5 + dz, 0.06, 2.4, 0.14);
  signBoard(b, 'IN-N-OUT COMPANY STORE', '#d81e2a', '#ffffff', 7.6, 1.2, -231.5, 4.5, 404.5, -Math.PI / 2, '4838 DEAN MARTIN • TEES & GEAR', 0.14);
  // A working shop: the merch counter just inside the west doors
  b.shopSpots.push({
    kind: 'store',
    position: new THREE.Vector3(-232.6, 0, 404.5),
    radius: 2.6,
    label: 'In-N-Out Company Store',
    catalog: 'in-n-out-store',
    hint: 'shirts, hats, mugs, keychains',
  });
  b.zone('In-N-Out Company Store (4838 Dean Martin)', -236, -222.8, 396, 411);

  // West side NW of Tropicana: Grove Business Park, NAPA (4675), Trapped! Escape Room (4760)
  // NOTE: Real late-2026 NW corner (z = 392..436) is open paved Tropicana turn setback & utility apron (NO Wendy's / NO Sinclair here!)
  paving(b, -284, -238, 352, 392, '#5c5a56', '#4c4a46', 4, L0);
  for (const [bx, bz, bw, bd, h, lbl] of [
    [-245, 359, 15, 13, 6.6, 'Grove Business Park'],
    [-265, 359, 16, 13, 6.6, 'Flex Park West'],
    [-245, 378, 15, 14, 6.6, 'Dean Martin Flex'],
    [-265, 378, 14, 14, 6.6, 'Polaris Flex Bays'],
    [-278, 375, 11, 13, 6.4, 'Trapped! Escape Room'],
    [-298, 336, 10, 12, 5.8, 'NAPA Auto Parts'],
  ] as Array<[number, number, number, number, number, string]>) {
    addBuilding(b, mg, { x: bx, z: bz, w: bw, d: bd, h, wall: 0xb6aca0, trim: 0x4e5662, roof: 0x524e4a, label: lbl });
  }
  signBoard(b, 'TRAPPED! ESCAPE ROOM', '#14141c', '#ff642e', 8.8, 1.25, -272.35, 4.8, 375, Math.PI / 2, '4760 POLARIS AVE', 0.12);
  addCanvasSignBox(b, 6.8, 1.35, -292.85, 4.4, 336, Math.PI / 2, (ctx) => {
    ctx.fillStyle = '#0a3a82';
    ctx.fillRect(0, 0, 512, 102);
    ctx.fillStyle = '#ffcf22';
    ctx.fillRect(14, 16, 84, 70);
    ctx.fillStyle = '#0a3a82';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('NAPA', 56, 52);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText('NAPA AUTO PARTS', 114, 38);
    ctx.fillStyle = '#ffd84a';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText('4675 POLARIS AVE', 114, 74);
  }, { depth: 0.14 });
  lot.bays(-257, -253, 355, 385, 1, 7, 0, 0.65, 4760);
  // Landscaped gravel & desert buffer cleanly rounding the NW Tropicana corner (z = 394..430)
  for (const tz of [404, 418, 428]) treeClusterInto(mg, -264, tz, 0.95, tz);
  // The corner itself is an empty, fenced dirt parcel with a land-for-sale board facing Tropicana
  chainFenceInto(b, mg, -300, 396, -270, 396);
  chainFenceInto(b, mg, -270, 396, -270, 431);
  chainFenceInto(b, mg, -270, 431, -300, 431);
  mg.box(mat(0x8a7558, 0.98), -285, L0 + 0.01, 413.5, 29, 0.02, 34);
  const signPost = mat(0x4a4c50, 0.6, 0.4);
  mg.box(signPost, -288.5, 1.6, 432.4, 0.18, 3.2, 0.18);
  mg.box(signPost, -283.5, 1.6, 432.4, 0.18, 3.2, 0.18);
  signBoard(b, 'LAND FOR SALE', '#ffffff', '#1a3a6a', 6.2, 1.9, -286, 3.4, 432.6, 0, 'TROPICANA & DEAN MARTIN • COMMERCIAL', 0.12);
  b.zone('Grove Business Park & Trapped! (4760)', -302, -234, 350, 392);
}

// ================================================================ CityCenter West High-Rises (202..349)

function buildCityCenterWestRow(b: WorldBuilder, mg: Merger, lot: ParkedLotBuilder): void {
  // Vacant Dirt / Brownfield Parcel directly south of Hilton Garden Inn (verified OSM way/1528008284)
  chainFenceInto(b, mg, -276, 336, -235, 336);
  chainFenceInto(b, mg, -235, 336, -235, 350);
  chainFenceInto(b, mg, -235, 350, -276, 350);
  b.zone('Vacant Commercial Parcel', -278, -234, 335, 351);

  // ---- 4655 S Dean Martin Dr: Hilton Garden Inn (6 stories, sandstone + burgundy accent)
  const hgiSpec: FacadeSpec = { wall: '#d6c6ad', mullion: '#ede4d4', glass: '#3c4d5e', lit: '#ffe2a4', cols: 8, rows: 5, style: 0, seed: 4655 };
  addBuilding(b, mg, { x: -247, z: 325, w: 20, d: 13, h: 16.5, wall: hgiSpec, trim: 0x7c2c38, label: 'Hilton Garden Inn' });
  mg.box(mat(0x2a2e34, 0.45), -235.6, 3.8, 325, 3.0, 0.35, 6.2);
  signBoard(b, 'HILTON GARDEN INN', '#3b151e', '#ffffff', 9.8, 1.35, -236.8, 14.5, 325, Math.PI / 2, '4655 DEAN MARTIN • CITY CENTER');
  b.zone('Hilton Garden Inn (4655 Dean Martin)', -272, -234, 316, 335);

  // ---- 4625 S Dean Martin Dr: Homewood Suites (6 stories, crisp white/cream + dark warm wood trim + stone)
  const hwSpec: FacadeSpec = { wall: '#e8dfd1', mullion: '#5a4332', glass: '#3e4e5c', lit: '#ffe0a6', cols: 8, rows: 6, style: 0, seed: 4625 };
  addBuilding(b, mg, { x: -247, z: 296, w: 20, d: 15, h: 17.5, wall: hwSpec, trim: 0x4b3524, label: 'Homewood Suites' });
  addBuilding(b, mg, { x: -272, z: 304, w: 14, d: 24, h: 10.5, wall: 0x9c988e, trim: 0x6c665c, label: 'Homewood Garage' });
  addBuilding(b, mg, { x: -282, z: 304, w: 8, d: 11, h: 5.5, wall: 0xb6ad9e, trim: 0x3b4858, label: 'Absolute Amusements (4630)' });
  signBoard(b, 'HOMEWOOD SUITES', '#183022', '#ffe090', 9.2, 1.35, -236.8, 15.0, 296, Math.PI / 2, '4625 DEAN MARTIN • BY HILTON');
  lot.bays(-258, -237, 306, 315, 4, 2, 0, 0.65, 4625);
  b.zone('Homewood Suites (4625 Dean Martin)', -284, -234, 286, 315);

  // ---- 4575 & 4525 S Dean Martin Dr: Panorama Towers I & II (33-story turquoise-glass residential skyscrapers)
  paving(b, -278, -234, 229, 285, '#b8b0a2', '#9c9488', 4, L0);
  const panoGlass: FacadeSpec = { wall: '#2c5464', mullion: '#88b4c4', glass: '#226b82', lit: '#ffe9b8', cols: 12, rows: 24, style: 2, seed: 4525 };
  for (const [tz, name, lbl] of [
    [270, 'Panorama Tower II', '4575 DEAN MARTIN'],
    [242, 'Panorama Tower I', '4525 DEAN MARTIN'],
  ] as Array<[number, string, string]>) {
    addBuilding(b, mg, { x: -248, z: tz, w: 17, d: 18, h: 52.0, wall: panoGlass, trim: 0x74a4b8, roof: 0x263440, label: name });
    for (const sz of [-7.8, 7.8]) mg.box(mat(0x62b4cc, 0.3, 0.75), -239.2, 25.5, tz + sz, 0.5, 51, 1.1);
    mg.box(basic(0x70ecff), -248, 51.4, tz, 17.4, 0.35, 18.4);
    signBoard(b, 'PANORAMA TOWERS', '#0c2430', '#8ef0ff', 10.5, 1.5, -239.2, 4.4, tz, Math.PI / 2, lbl);
  }
  // Low-rise street villas + shared podium garage + courtyard resort pool
  const villaSpec: FacadeSpec = { wall: '#d8ceb9', mullion: '#426a7a', glass: '#2c5468', lit: '#ffe9b8', cols: 2, rows: 2, style: 0, seed: 4555 };
  addBuilding(b, mg, { x: -236.5, z: 256, w: 4.5, d: 16, h: 6.5, wall: villaSpec, trim: 0x426a7a, roof: 0x3b4852, label: 'Panorama Street Villas' });
  addBuilding(b, mg, { x: -269, z: 256, w: 14, d: 44, h: 12.5, wall: 0x8e98a0, trim: 0x5c6872 });
  const poolWater = new THREE.MeshStandardMaterial({ color: 0x35b8d0, roughness: 0.08, emissive: 0x185c72, emissiveIntensity: 0.35 });
  const panoPool = new THREE.Mesh(new THREE.PlaneGeometry(7, 10), poolWater);
  panoPool.rotation.x = -Math.PI / 2;
  panoPool.position.set(-252, L2, 256);
  b.add(panoPool);
  for (const pz of [235, 256, 277]) palmInto(mg, -235.6, pz, 8.2, pz);
  b.zone('Panorama Towers (4525–4575 Dean Martin)', -278, -234, 229, 285);

  // ---- 4471 S Dean Martin Dr: THE MARTIN (45-story champagne/dark-bronze luxury tower north of Harmon)
  const martinGlass: FacadeSpec = { wall: '#3a3530', mullion: '#cbb38a', glass: '#2c343d', lit: '#ffe2a6', cols: 12, rows: 28, style: 2, seed: 4471 };
  addBuilding(b, mg, { x: -247, z: 209.5, w: 19, d: 13, h: 62.0, wall: martinGlass, trim: 0xd6ba82, roof: 0x242220, label: 'The Martin' });
  mg.box(basic(0xffe09c), -247, 61.5, 209.5, 19.4, 0.45, 13.4);
  mg.box(mat(0x22201e, 0.4, 0.7), -235.8, 3.8, 209.5, 3.2, 0.35, 7.6);
  signBoard(b, 'THE MARTIN', '#14110c', '#ecd088', 11.2, 1.7, -237.3, 6.2, 209.5, Math.PI / 2, '4471 DEAN MARTIN DR • RESIDENCES');
  b.zone('The Martin (4471 Dean Martin)', -272, -234, 201, 217);
}

// ================================================================ Midtown Industrial, Tommy Rocker's (4275) & Centerpoint Twain (-196..198)

function buildTommyRockersAndTwainCorridor(b: WorldBuilder, mg: Merger, lot: ParkedLotBuilder): void {
  // South Tech / Business Ln / 4305-4335 Vegas Tickets & Flex Bays (z = 110..196)
  for (const [bx, bz, bw, bd, h, wallCol, lbl] of [
    [-245, 187, 17, 12, 6.5, 0xbdb4a6, 'Business Ln Suites'],
    [-271, 187, 12, 13, 6.2, 0xa8a095, 'Pawsh Palace (3081)'],
    [-246, 165, 18, 17, 7.0, 0xb4ada0, 'Vegas Tickets / 4325'],
    [-267, 165, 13, 15, 6.8, 0xa0998e, 'Industrial Flex Bays'],
    [-246, 146, 17, 11, 6.8, 0xbeb5a6, 'Organic Labs / 4335'],
    [-247, 120, 18, 22, 7.2, 0xa49c90, 'South Tech Park'],
    [-272, 125, 13, 16, 7.6, 0x22202a, 'The Space LV'],
  ] as Array<[number, number, number, number, number, number, string]>) {
    addBuilding(b, mg, { x: bx, z: bz, w: bw, d: bd, h, wall: wallCol, trim: 0x4c5460, label: lbl });
  }
  signBoard(b, 'SOUTH TECH • VEGAS TICKETS', '#242c38', '#e8eef4', 9.6, 1.2, -236.8, 5.2, 165, Math.PI / 2, '4325–4335 DEAN MARTIN DR', 0.12);
  signBoard(b, 'PAWSH PALACE', '#381e42', '#ffd2e8', 7.4, 1.15, -264.8, 4.6, 187, Math.PI / 2, '3081 BUSINESS LN', 0.12);
  signBoard(b, 'THE SPACE LV', '#180c24', '#ff427c', 8.8, 1.35, -265.3, 5.4, 125, Math.PI / 2, 'CONCERTS & EVENTS', 0.12);
  lot.bays(-257, -239, 142, 195, 3, 9, Math.PI / 2, 0.58, 4325);
  b.zone('South Tech & Business Ln (4325)', -282, -234, 108, 198);

  // ---- 4275 S Dean Martin Dr: Tommy Rocker's Mojave Beach Grill & Bar (true 45-deg diamond plan)
  paving(b, -266, -234, 80, 104, '#726a5c', '#5e564a', 4, L0);
  const trWall = mat(0xc49a70, 0.84);
  mg.box(trWall, -249.5, 2.4, 90.0, 14.0, 4.8, 13.0, Math.PI / 4, true);
  mg.box(mat(0x3a2414, 0.7), -249.5, 4.95, 90.0, 14.5, 0.4, 13.5, Math.PI / 4);
  b.collider(-259, -240, 81, 99, 0, 5.2, true);
  // Tiki covered beach patio facing Dean Martin Dr
  mg.box(mat(0x7c5432, 0.85), -238.5, 3.3, 90.5, 4.8, 0.25, 11.4, 0, true);
  for (const pz of [85.5, 90.5, 95.5]) mg.beam(mat(0x4a321c, 0.85), v3(-236.4, 0, pz), v3(-236.4, 3.2, pz), 0.1, 6);
  signBoard(b, "TOMMY ROCKER'S", '#102438', '#ff622e', 9.6, 1.5, -236.2, 4.4, 90.5, Math.PI / 2, 'MOJAVE BEACH BAR & GRILL • 4275', 0.14);
  for (const pz of [83, 99]) treeClusterInto(mg, -237, pz, 1.0, pz);
  lot.bays(-264, -258, 84, 100, 2, 4, 0, 0.78, 4275);
  b.zone("Tommy Rocker's (4275 Dean Martin)", -268, -234, 80, 105);

  // ---- 4255 Dean Martin Dr (Best Boxes / 4D Commissary warehouse just north of Tommy Rocker's)
  addBuilding(b, mg, { x: -253, z: 72.0, w: 15, d: 12, h: 6.2, wall: 0xbcb3a4, trim: 0x3b485a, label: 'Best Boxes / 4D Commissary (4255)' });
  signBoard(b, 'BEST BOXES • 4D COMMISSARY', '#1d2938', '#f8d24c', 8.8, 1.1, -245.35, 4.8, 72.0, Math.PI / 2, '4255 DEAN MARTIN DR', 0.12);

  // ---- Flamingo South Quadrant (z = 12..62): Open Utility / Flood Channel / Graded Parcel (no fake Rio Retail box)
  addBuilding(b, mg, { x: -272, z: 16, w: 8, d: 8, h: 4.5, wall: 0xb2aa9e, trim: 0x525860, label: 'Flamingo Utility Bldg' });
  chainFenceInto(b, mg, -276, 26, -260, 62);
  for (const tz of [18, 44]) palmInto(mg, -262, tz, 9.0, tz);
  b.zone('W Flamingo Rd & Dean Martin Dr', -286, -234, -18, 62);

  // ---- NORTH OF FLAMINGO (-190..-36): Centerpoint Business & Engineering Corridor (West & East sides)
  // West side Trio (4045–4155 Dean Martin Dr)
  for (const [bz, w, d, h, lbl, signTxt] of [
    [-58, 18, 17, 7.2, '4155 Dean Martin Flex', 'DEAN MARTIN FLEX PARK'],
    [-84, 18, 17, 7.4, '4105 Industrial', 'CENTERPOINT WEST • 4063'],
    [-111, 18, 17, 7.4, '4045 Centerpoint West', 'TWILIGHT LOGISTICS • 4045'],
  ] as Array<[number, number, number, number, string, string]>) {
    const cx = dmCenterX(bz) - 21;
    addBuilding(b, mg, { x: cx, z: bz, w, d, h, wall: 0xc2b8aa, trim: 0x3c4856, label: lbl });
    signBoard(b, signTxt, '#1e2836', '#f2efe6', 8.2, 1.1, cx + w / 2 + 0.16, 5.2, bz, Math.PI / 2, undefined, 0.12);
  }
  // East side pair (4050 TYLin & 4040 Centerpoint East between Dean Martin Dr & I-15)
  for (const [bz, w, d, h, lbl, signTxt, subTxt] of [
    [-74, 15, 16, 7.5, 'Centerpoint Office (4040)', 'CENTERPOINT OFFICE PARK', '4040 DEAN MARTIN DR'],
    [-101, 15, 16, 7.8, 'T.Y. Lin Engineering (4050)', 'TYLIN • 4050', 'INFRASTRUCTURE & ENGINEERING'],
  ] as Array<[number, number, number, number, string, string, string]>) {
    const cx = dmCenterX(bz) + 19;
    addBuilding(b, mg, { x: cx, z: bz, w, d, h, wall: 0x384654, trim: 0xd6cfc2, label: lbl });
    signBoard(b, signTxt, '#122232', '#9cd8ff', 7.8, 1.15, cx - w / 2 - 0.16, 5.4, bz, -Math.PI / 2, subTxt, 0.12);
  }
  lot.bays(-250, -242, -118, -50, 2, 5, Math.PI / 2, 0.55, 4050);
  b.zone('Centerpoint Corridor (Twain–Flamingo)', -276, -214, -185, -36);
}

// ================================================================ Visual South Continuation Past Bay Border (z = 605..865)

function buildVisualSouthExtension(b: WorldBuilder, mg: Merger): void {
  // Keeps roadway & south Stadium / Russell Rd Hotel Row continuous beyond walkable WEST_BAY.zS = 605
  // Note: strictly east of Allegiant Stadium (-285, z=695, outer x=-247, Torch at x=-241) and north/south clear
  flatRoad(b, DM_MAIN_X, 758, 16.4, 308, 'z', 5, true, L1, 'Dean Martin Dr');
  b.zone('Dean Martin Dr (Stadium & Russell)', DM_MAIN_X - 9, DM_MAIN_X + 9, 605, ANNEX_ZS);
  b.zone('Allegiant Stadium', -323, -247, 660, 731);
  flatRoad(b, -238, 644, 12.0, 24, 'x', 4, true, L1); // Al Davis Way east approach into Allegiant Stadium
  flatRoad(b, -252, 807, 18.0, 62, 'x', 6, true, L1); // W Russell Rd continuation west of I-15
  const shoulderPad = mat(0x948670, 0.96);
  mg.box(shoulderPad, -250, L0 - 0.01, 735, 68, 0.02, 262);
  // North visual continuation beyond Twain (-196..-260)
  angledRoadSeg(b, -215, -260, -222, -196, 16.4, 5, true);

  buildRussellHotelRow(b, mg);
}

// ================================================================ South of Russell Rd: the stadium-area hotel row (west side)

interface RowHotel {
  addr: number;
  name: string;
  z: number;
  w: number;
  d: number;
  h: number;
  spec: FacadeSpec;
  trim: number;
  accent: number;
  sign: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

function brandSign(bg: string, lines: Array<[string, string, string]>, mark?: (ctx: CanvasRenderingContext2D, h: number) => void) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const x0 = mark ? h * 1.05 : w * 0.06;
    if (mark) mark(ctx, h);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.forEach(([text, font, color], i) => {
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.fillText(text, x0, h * (lines.length === 1 ? 0.52 : 0.36 + i * 0.36), w - x0 - 10);
    });
  };
}

/**
 * OSM order south of W Russell Rd, all on the west side: 5735 Staybridge Suites, 5775 Fairfield Inn & Suites
 * Stadium Area, 5845 Courtyard Stadium Area, 5875 Residence Inn Las Vegas South. Each gets its brand colours,
 * a curb cut with a drive aisle, a parking field in front, a porte-cochère, landscaping and a lit pole sign.
 */
function buildRussellHotelRow(b: WorldBuilder, mg: Merger): void {
  const lot = new ParkedLotBuilder();
  const hotels: RowHotel[] = [
    {
      addr: 5735, name: 'Staybridge Suites', z: 829, w: 24, d: 13, h: 16,
      spec: { wall: '#d9c6a4', mullion: '#a8784e', glass: '#34424e', lit: '#ffdca8', cols: 9, rows: 4, style: 0, seed: 5735 },
      trim: 0x7a4a2a, accent: 0x1d3a6e,
      sign: brandSign('#ffffff', [['STAYBRIDGE', 'bold 46px Georgia, serif', '#1d3a6e'], ['SUITES', '600 30px "Segoe UI", Arial, sans-serif', '#c7832c']], (ctx, h) => {
        ctx.fillStyle = '#c7832c';
        ctx.beginPath();
        ctx.arc(h * 0.52, h * 0.5, h * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1d3a6e';
        ctx.fillRect(h * 0.36, h * 0.44, h * 0.32, h * 0.12);
      }),
    },
    {
      addr: 5775, name: 'Fairfield Inn & Suites', z: 851, w: 24, d: 13, h: 17.5,
      spec: { wall: '#e4e1da', mullion: '#7d8a8e', glass: '#2e3c48', lit: '#ffe4b4', cols: 9, rows: 5, style: 1, seed: 5775 },
      trim: 0x2b4a63, accent: 0x6aa5c8,
      sign: brandSign('#ffffff', [['FAIRFIELD', 'bold 48px "Segoe UI", Arial, sans-serif', '#22384f'], ['BY MARRIOTT', '600 24px "Segoe UI", Arial, sans-serif', '#5b8fae']], (ctx, h) => {
        ctx.strokeStyle = '#e6a531';
        ctx.lineWidth = h * 0.05;
        for (let i = 0; i < 7; i++) {
          const a = Math.PI + (i / 6) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(h * 0.52 + Math.cos(a) * h * 0.14, h * 0.66 + Math.sin(a) * h * 0.14);
          ctx.lineTo(h * 0.52 + Math.cos(a) * h * 0.34, h * 0.66 + Math.sin(a) * h * 0.34);
          ctx.stroke();
        }
      }),
    },
    {
      addr: 5845, name: 'Courtyard', z: 873, w: 26, d: 14, h: 19,
      spec: { wall: '#d4d7da', mullion: '#3f8f8a', glass: '#24343e', lit: '#fff0c8', cols: 10, rows: 5, style: 1, seed: 5845 },
      trim: 0x2c6f6a, accent: 0x3f8f8a,
      sign: brandSign('#14313a', [['COURTYARD', 'bold 50px "Segoe UI", Arial, sans-serif', '#ffffff'], ['Marriott', 'italic 26px Georgia, serif', '#8fd2c8']]),
    },
    {
      addr: 5875, name: 'Residence Inn', z: 895, w: 24, d: 13, h: 15,
      spec: { wall: '#d8c3a8', mullion: '#9a3a2e', glass: '#323e48', lit: '#ffdcae', cols: 9, rows: 4, style: 0, seed: 5875 },
      trim: 0x8a2a24, accent: 0xb5332b,
      sign: brandSign('#ffffff', [['Residence Inn', 'bold 44px Georgia, serif', '#a3262a'], ['BY MARRIOTT', '600 22px "Segoe UI", Arial, sans-serif', '#555a60']]),
    },
  ];

  const curb = mat(0xbdb7ac, 0.85);
  const drive = mat(0x4a4c52, 0.9);
  const canopyMat = mat(0xece6da, 0.6);
  const glassDoor = new THREE.MeshStandardMaterial({ color: 0x1e2a34, emissive: 0xffe2b0, emissiveIntensity: 0.1, roughness: 0.12, metalness: 0.4 });
  b.nightGlow(glassDoor, 0.1, 0.9);
  const poleMat = mat(0x3a3c42, 0.5, 0.5);
  const HX = -266; // building centre line (set back behind its parking field)
  const CURB_X = DM_MAIN_X - 9.4; // west curb of Dean Martin
  // West sidewalk the whole way down the annex
  mg.box(curb, CURB_X - 1.1, L1 * 0.5, 758, 2.2, L1, 308);
  for (const ht of hotels) {
    const accent = mat(ht.accent, 0.55);
    addBuilding(b, mg, { x: HX, z: ht.z, w: ht.w, d: ht.d, h: ht.h, wall: ht.spec, trim: ht.trim, roof: 0x5a5650, label: `${ht.name} (${ht.addr} Dean Martin)` });
    // Brand accent: a full-height entry tower on the street face
    mg.box(accent, HX + ht.w / 2 + 0.35, ht.h / 2 + 0.6, ht.z, 0.7, ht.h + 1.2, 4.6, 0, true);
    mg.box(glassDoor, HX + ht.w / 2 + 0.72, 1.5, ht.z, 0.06, 2.6, 3.4);
    // Porte-cochère over the drop-off
    mg.box(canopyMat, HX + ht.w / 2 + 3.6, 4.3, ht.z, 6.4, 0.45, 6.4, 0, true);
    for (const dz of [-2.8, 2.8]) mg.box(accent, HX + ht.w / 2 + 6.4, 2.1, ht.z + dz, 0.45, 4.2, 0.45);
    // Parking field between the hotel and Dean Martin, with its drive aisle and curb cut
    paving(b, HX + ht.w / 2 + 0.2, CURB_X - 2.2, ht.z - 10, ht.z + 10, '#55575c', '#4a4c51', 4, L0);
    mg.box(drive, (HX + ht.w / 2 + CURB_X) / 2, L0 + 0.012, ht.z + 8.4, CURB_X - (HX + ht.w / 2), 0.02, 3.2);
    lot.bays(HX + ht.w / 2 + 8, CURB_X - 3.5, ht.z - 9.2, ht.z + 6.2, 3, 3, Math.PI / 2, 0.7, ht.addr);
    // Landscaping strip on the curb and two palms by the drive
    mg.box(mat(0x6a7a3e, 0.95), CURB_X - 2.8, L0 + 0.08, ht.z - 2, 1.0, 0.16, 14);
    palmInto(mg, CURB_X - 2.8, ht.z - 7.5, 7.5, ht.addr);
    palmInto(mg, CURB_X - 2.8, ht.z + 4.5, 6.8, ht.addr + 1);
    // Lit pole sign at the curb, facing the street
    mg.box(poleMat, CURB_X - 2.8, 2.8, ht.z + 6.0, 0.35, 5.6, 0.35);
    addCanvasSignBox(b, 4.2, 1.6, CURB_X - 2.8, 6.3, ht.z + 6.0, Math.PI / 2, ht.sign, { depth: 0.3, twoSided: true, backing: 0x2a2c30 });
    addCanvasSignBox(b, 0.9, 0.5, CURB_X - 2.8, 5.1, ht.z + 6.0, Math.PI / 2, (ctx, w, h) => {
      ctx.fillStyle = '#1e2024';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(h * 0.62)}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ht.addr), w / 2, h * 0.54);
    }, { depth: 0.12, twoSided: true });
    b.zone(`${ht.name} (${ht.addr} Dean Martin)`, HX - ht.w / 2 - 2, CURB_X, ht.z - 11, ht.z + 11);
  }
  // A street light per hotel frontage on the west side
  for (const ht of hotels) cobraPoleInto(mg, b, CURB_X - 0.6, ht.z - 11, Math.PI / 2, 9.2, 2.4);
  lot.emit(b, -250, 862, 260);
}

// ================================================================ Freeway Billboards & Real Traffic Signals

function buildBillboardsAndSignals(b: WorldBuilder, mg: Merger): void {
  freewayBillboard(b, mg, -218.5, 58, -Math.PI / 2, 'CIRQUE DU SOLEIL • O', 'BELLAGIO • NIGHTLY AT 7 & 9:30', '#0a162a', '#ffffff', '#68d8ff');
  freewayBillboard(b, mg, -218.5, 150, -Math.PI / 2, 'GOLDEN KNIGHTS', 'LIVE HOCKEY AT T-MOBILE ARENA', '#141418', '#ffd44a', '#c8a034');
  freewayBillboard(b, mg, -218.5, 310, -Math.PI / 2, 'IN-N-OUT BURGER', 'NEXT RIGHT • EXIT 37 TROPICANA', '#d81e2a', '#ffffff', '#ffd438');
  freewayBillboard(b, mg, -218.5, 360, -Math.PI / 2, 'EATALY • DOLBY LIVE', 'PARK MGM • WALK THE PARK', '#183222', '#f7ecd4', '#e86888');
  freewayBillboard(b, mg, -241.0, 343, 0, 'T-MOBILE ARENA', 'CONCERTS • UFC • KNIGHTS • TOSHIBA PLAZA', '#1c081a', '#ffffff', '#ff2e92');

  const poleMat = mat(0x2c3038, 0.45, 0.75);
  const redOn = basic(0xff2c24);
  const grnOn = basic(0x30e860);
  const ylwOn = basic(0xffb824);
  const offMat = mat(0x14161a, 0.7);
  const sigGroup = new THREE.Group();
  b.scene.add(sigGroup);
  const sigHeads: Array<{ r: THREE.Mesh; y: THREE.Mesh; g: THREE.Mesh; axis: 'ns' | 'ew'; plan: 'flam' | 'trop' }> = [];

  const placeSignal = (x: number, z: number, rotY: number, axis: 'ns' | 'ew', plan: 'flam' | 'trop') => {
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
    sigHeads.push({ r: mkBulb(0.28), y: mkBulb(0), g: mkBulb(-0.28), axis, plan });
    b.collider(x - 0.16, x + 0.16, z - 0.16, z + 0.16, 0, 6.4, true);
  };

  // Signalized: W Twain Ave (-185), W Flamingo Rd (0), and Tropicana right-turn / pedestrian signals (442.7)
  // Note: Harmon Ave crosses ABOVE Dean Martin Dr on the I-15 overpass (no surface intersection signals on Dean Martin)
  for (const [cx, cz, sLat] of [
    [-223.5, -185, 8],
    [DM_FLAM_X, I15.flamingoZ, 11],
  ] as Array<[number, number, number]>) {
    placeSignal(cx - 9, cz - sLat, 0, 'ns', 'flam');
    placeSignal(cx + 9, cz + sLat, Math.PI, 'ns', 'flam');
    placeSignal(cx + 9, cz - sLat, -Math.PI / 2, 'ew', 'flam');
    placeSignal(cx - 9, cz + sLat, Math.PI / 2, 'ew', 'flam');
  }
  placeSignal(DM_TROP_X - 10, I15.tropZ - 12, 0, 'ns', 'trop');
  placeSignal(DM_TROP_X + 10, I15.tropZ + 12, Math.PI, 'ns', 'trop');
  placeSignal(DM_TROP_X + 10, I15.tropZ - 12, -Math.PI / 2, 'ew', 'trop');
  placeSignal(DM_TROP_X - 10, I15.tropZ + 12, Math.PI / 2, 'ew', 'trop');

  const sigCull2 = 420 * 420;
  b.every((_dt, t) => {
    const dx = viewer.cam.x + 245;
    const dz = viewer.cam.z - 220;
    const vis = dx * dx + dz * dz < sigCull2;
    sigGroup.visible = vis;
    if (!vis) return;
    const pf = flamingoPhase(t);
    const pt = tropicanaPhase(t);
    for (const h of sigHeads) {
      const st = (h.plan === 'flam' ? pf : pt)[h.axis];
      h.r.material = st === 'stop' ? redOn : offMat;
      h.y.material = st === 'yellow' ? ylwOn : offMat;
      h.g.material = st === 'go' ? grnOn : offMat;
    }
  });
}

// ================================================================ Live Traffic & Pedestrians

function buildDeanMartinTraffic(b: WorldBuilder): void {
  const lanes: TrafficLane[] = [
    // North & Midtown stem (-190..388, 2 NB + 2 SB)
    { axis: 'z', lanePos: DM_MAIN_X - 4.8, min: -190, max: 386, dir: 1, count: 6, speed: 12.5 },
    { axis: 'z', lanePos: DM_MAIN_X + 4.8, min: -190, max: 386, dir: -1, count: 6, speed: 12.5 },
    // Joey Bishop Dr continuous N-S under Tropicana Bridge (bypasses Tropicana raised median)
    { axis: 'z', lanePos: JOEY_X - 1.7, min: 392, max: 490, dir: 1, count: 3, speed: 10.5 },
    { axis: 'z', lanePos: JOEY_X + 1.7, min: 392, max: 490, dir: -1, count: 3, speed: 10.5 },
    // South corridor past Motel 6, 5115 Auto, 5155 Museum down toward Stadium
    { axis: 'z', lanePos: DM_MAIN_X - 4.8, min: 506, max: 790, dir: 1, count: 5, speed: 12.0 },
    { axis: 'z', lanePos: DM_MAIN_X + 4.8, min: 506, max: 790, dir: -1, count: 5, speed: 12.0 },
    // Polaris Ave collector (-180..590)
    { axis: 'z', lanePos: POLARIS_X - 2.2, min: -180, max: 590, dir: 1, count: 5, speed: 10.0 },
    { axis: 'z', lanePos: POLARIS_X + 2.2, min: -180, max: 590, dir: -1, count: 5, speed: 10.0 },
  ];
  buildInstancedTraffic(b, lanes, [DM_MAIN_X, 270], 390);
}

function buildDeanMartinCrowds(b: WorldBuilder): void {
  b.crowd.tourists.push(
    { pts: [[-244, 434], [-244, 402]], prop: 'bag' },
    { pts: [[-241, 452], [-241, 482]], prop: 'camera' },
    { pts: [[-255, 450], [-274, 450]], prop: 'bag' },
    { pts: [[-234.4, 206], [-234.4, 278]], prop: 'cig' },
    { pts: [[-234.4, 290], [-234.4, 330]], prop: 'bag' },
    { pts: [[-236.0, 82], [-236.0, 100]], prop: 'yard-drink' },
    { pts: [[-234.4, 505], [-234.4, 555]], prop: 'camera' }
  );
}
