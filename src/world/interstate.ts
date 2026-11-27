import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { basic, mat } from './props';
import { L0, L1, Merger, v3 } from './southKit';
import { buildInstancedTraffic, flatRoad, freewayGantrySign, lightPoolMat, roadStripMat, type TrafficLane } from './westKit';

/**
 * Interstate 15 (I-15) and its Las Vegas Resort Corridor interchanges:
 * - I-15 NB & SB mainlines (x = -213 .. -173, z = -860 .. +920), center Jersey barrier,
 *   high-mast sodium freeway lighting, ribbed desert-concrete sound walls, overhead gantries.
 * - Tropicana Ave / I-15 Interchange ("Dropicana" 2025/2026 layout): widened Tropicana bridge
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

/** Smooth walkable bridge deck height profile for East-West cross arterials over I-15. */
function bridgeProfile(x: number, eBase: number, eSpan: number, wSpan: number, wBase: number, deckH: number): number {
  if (x >= eBase || x <= wBase) return 0;
  if (x >= eSpan) return ((eBase - x) / (eBase - eSpan)) * deckH;
  if (x <= wSpan) return ((x - wBase) / (wSpan - wBase)) * deckH;
  return deckH;
}

export const tropicanaY = (x: number) => bridgeProfile(x, -114, -144, -223, -246, 7.2);
export const harmonY = (x: number) => bridgeProfile(x, -148, -171, -236, -260, 6.8);
export const flamingoY = (x: number) => bridgeProfile(x, -148, -171, -217, -239, 6.8);

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

// ================================================================ Bridges & Dropicana Ramps

function buildBridge(
  b: WorldBuilder,
  mg: Merger,
  zCenter: number,
  wTotal: number,
  lanes: number,
  eBase: number,
  eSpan: number,
  wSpan: number,
  wBase: number,
  deckH: number,
  name: string
): void {
  const concrete = mat(0xa8a298, 0.86);
  const parapet = mat(0xc4bdb0, 0.84);
  const railMat = mat(0x3a3f46, 0.45, 0.72);
  const asphalt = roadStripMat(lanes, eBase - wBase, true);
  const sidewalkMat = mat(0xbab3a6, 0.85);
  const halfW = wTotal / 2;
  const roadW = wTotal - 4.4;
  const stepX = 1.5;

  // Flat central bridge deck over Frank Sinatra Dr & I-15
  const spanLen = eSpan - wSpan;
  const xc = (eSpan + wSpan) / 2;
  mg.box(concrete, xc, deckH - 0.65, zCenter, spanLen, 1.3, wTotal, 0, true);
  const deckSurf = new THREE.Mesh(new THREE.PlaneGeometry(roadW, spanLen), asphalt);
  deckSurf.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  deckSurf.position.set(xc, deckH + 0.025, zCenter);
  deckSurf.receiveShadow = true;
  b.add(deckSurf);

  // Sidewalks, low Jersey curbs & open steel bridge guardrails along North and South deck edges
  for (const s of [-1, 1]) {
    const swZ = zCenter + s * (halfW - 1.1);
    const railZ = zCenter + s * (halfW - 0.15);
    mg.box(sidewalkMat, xc, deckH + 0.08, swZ, spanLen, 0.16, 2.2);
    mg.box(parapet, xc, deckH + 0.26, railZ, spanLen, 0.52, 0.3);
    mg.box(railMat, xc, deckH + 0.84, railZ, spanLen, 0.08, 0.12);
    mg.box(railMat, xc, deckH + 1.18, railZ, spanLen, 0.1, 0.15);
    for (let px = wSpan + 3; px <= eSpan - 3; px += 6) {
      mg.box(railMat, px, deckH + 0.85, railZ, 0.08, 0.68, 0.1);
    }
  }
  // Colliders for flat main deck + bridge walls
  b.collider(wSpan, eSpan, zCenter - halfW, zCenter + halfW, 0, deckH, false);
  b.collider(wSpan, eSpan, zCenter - halfW - 0.3, zCenter - halfW + 0.3, deckH, deckH + 1.6, true);
  b.collider(wSpan, eSpan, zCenter + halfW - 0.3, zCenter + halfW + 0.3, deckH, deckH + 1.6, true);

  // Support piers at shoulders + median (clear of travel lanes!)
  for (const px of [eSpan - 2, -169.5, I15.medianX, wSpan + 2]) {
    for (const pz of [zCenter - halfW * 0.65, zCenter + halfW * 0.65]) {
      mg.beam(concrete, v3(px, 0, pz), v3(px, deckH - 1.1, pz), 0.72, 10, 0.66, true);
      b.collider(px - 0.75, px + 0.75, pz - 0.75, pz + 0.75, 0, deckH - 1.0, true);
    }
  }

  // Stepped solid ramp embankments at both ends (keep visual fill slightly below tilted asphalt so steps never poke through)
  const emitSlope = (xStart: number, xEnd: number) => {
    const totalLen = xEnd - xStart;
    const steps = Math.max(12, Math.round(totalLen / stepX));
    const dx = totalLen / steps;
    const stepDrop = (deckH / steps) * 0.65;
    for (let i = 0; i < steps; i++) {
      const xm = xStart + (i + 0.5) * dx;
      const ym = bridgeProfile(xm, eBase, eSpan, wSpan, wBase, deckH);
      const visH = Math.max(0.02, ym - stepDrop);
      mg.box(concrete, xm, visH / 2, zCenter, dx + 0.04, visH, wTotal, 0, true);
      b.collider(xm - dx / 2, xm + dx / 2, zCenter - halfW, zCenter + halfW, 0, ym, false);
      b.collider(xm - dx / 2, xm + dx / 2, zCenter - halfW - 0.3, zCenter - halfW + 0.3, ym, ym + 1.4, true);
      b.collider(xm - dx / 2, xm + dx / 2, zCenter + halfW - 0.3, zCenter + halfW + 0.3, ym, ym + 1.4, true);
    }
    // Single tilted planar asphalt roadway & parapets over the slope (zero zigzags)
    const ang = Math.atan2(
      bridgeProfile(xStart, eBase, eSpan, wSpan, wBase, deckH) - bridgeProfile(xEnd, eBase, eSpan, wSpan, wBase, deckH),
      totalLen
    );
    const hyp = Math.hypot(totalLen, deckH);
    const rPlane = new THREE.Mesh(new THREE.PlaneGeometry(roadW, hyp), roadStripMat(lanes, hyp, true));
    const xm = (xStart + xEnd) / 2;
    rPlane.rotation.order = 'YXZ';
    rPlane.rotation.y = Math.PI / 2;
    rPlane.rotation.x = -Math.PI / 2 + ang;
    rPlane.position.set(xm, deckH / 2 + 0.06, zCenter);
    rPlane.receiveShadow = true;
    b.add(rPlane);
    for (const s of [-1, 1]) {
      const sw = new THREE.BoxGeometry(hyp, 0.18, 2.2);
      sw.rotateZ(-ang);
      mg.at(sidewalkMat, sw, xm, deckH / 2 + 0.1, zCenter + s * (halfW - 1.1));
      const p = new THREE.BoxGeometry(hyp, 0.54, 0.3);
      p.rotateZ(-ang);
      mg.at(parapet, p, xm, deckH / 2 + 0.32, zCenter + s * (halfW - 0.15));
      const r = new THREE.BoxGeometry(hyp, 0.1, 0.14);
      r.rotateZ(-ang);
      mg.at(railMat, r, xm, deckH / 2 + 0.96, zCenter + s * (halfW - 0.15));
    }
  };

  emitSlope(wBase, wSpan);
  emitSlope(eSpan, eBase);

  // Bridge light poles standing cleanly on the north bridge deck parapet (avoid extending down through freeway lanes)
  const brPole = mat(0x565a62, 0.45, 0.72);
  const brBulb = basic(0xffe09c);
  for (let x = wSpan + 6; x <= eSpan - 6; x += 22) {
    const px = x;
    const pz = zCenter - halfW + 0.4;
    mg.beam(brPole, v3(px, deckH + 1.0, pz), v3(px, deckH + 7.4, pz), 0.09, 6, 0.06);
    mg.beam(brPole, v3(px, deckH + 7.2, pz), v3(px, deckH + 7.6, pz + 2.0), 0.05, 5, 0.035);
    mg.box(brPole, px, deckH + 7.62, pz + 2.0, 0.5, 0.12, 0.28);
    mg.box(brBulb, px, deckH + 7.52, pz + 2.0, 0.36, 0.05, 0.18);
  }

  b.zone(name, wBase, eBase, zCenter - halfW, zCenter + halfW);
  b.feature({ kind: 'road', x: (eBase + wBase) / 2, z: zCenter, w: eBase - wBase, d: wTotal, color: '#45444c', label: name });
}

function buildOverpassesAndRamps(b: WorldBuilder, mg: Merger): void {
  // 1. Widened "Dropicana" Tropicana Ave Overpass (z = 442.7, 6 lanes + wide pedestrian sidewalks)
  buildBridge(b, mg, I15.tropZ, 21.0, 6, -114, -144, -226, -246, 7.2, 'Tropicana Ave Bridge (I-15)');

  // 2. Dropicana SB-to-EB Flyover Viaduct (iconic curving flyover from I-15 SB over I-15 down to Tropicana EB!)
  const viaduct = mat(0x9e988e, 0.85);
  const deckAsph = roadStripMat(2, 120, false);
  const flyPts: Array<[number, number, number]> = [
    [-210.5, 0.05, 396],
    [-210.5, 1.8, 412],
    [-208.0, 5.2, 430],
    [-198.0, 9.6, 452],
    [-180.0, 10.2, 461],
    [-156.0, 7.2, 460],
    [-134.0, 2.8, 456],
    [-114.0, 0.05, 451],
  ];
  for (let i = 0; i < flyPts.length - 1; i++) {
    const [ax, ay, az] = flyPts[i];
    const [bx, by, bz] = flyPts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const flatLen = Math.hypot(dx, dz);
    const dy = by - ay;
    const len3 = Math.hypot(flatLen, dy);
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, flatLen);
    const xm = (ax + bx) / 2;
    const ym = (ay + by) / 2;
    const zm = (az + bz) / 2;

    const gDeck = new THREE.BoxGeometry(7.2, 0.9, len3 + 0.6);
    gDeck.rotateX(pitch);
    gDeck.rotateY(yaw);
    mg.at(viaduct, gDeck, xm, ym - 0.45, zm, 0, true);

    const rTop = new THREE.Mesh(new THREE.PlaneGeometry(6.2, len3 + 0.4), deckAsph);
    rTop.rotation.order = 'YXZ';
    rTop.rotation.y = yaw;
    rTop.rotation.x = -Math.PI / 2 + pitch;
    rTop.position.set(xm, ym + 0.03, zm);
    b.add(rTop);

    // Viaduct edge barriers + cylindrical piers
    for (const side of [-3.3, 3.3]) {
      const rail = new THREE.BoxGeometry(0.35, 0.9, len3 + 0.5);
      rail.translate(side, 0.45, 0);
      rail.rotateX(pitch);
      rail.rotateY(yaw);
      mg.at(mat(0xc2bbb0, 0.85), rail, xm, ym, zm);
    }
    if (ym > 2.2) {
      mg.beam(viaduct, v3(ax, 0, az), v3(ax, ay - 0.5, az), 0.72, 8, 0.65, true);
      b.collider(ax - 0.75, ax + 0.75, az - 0.75, az + 0.75, 0, ay, true);
    }
  }

  // 3. I-15 NB & SB On/Off Ramps at Tropicana & Flamingo
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
  // NB Off-Ramp & On-Ramp near Tropicana
  emitRampSlab(-175, 515, -162, 462, 6.4);
  emitRampSlab(-162, 424, -174.5, 365, 6.2);
  // SB Tropicana On-Ramp (clear east of Joey Bishop Dr)
  emitRampSlab(-216.0, 482, -212.0, 526, 5.4);
  // Flamingo Rd Loop On/Off Ramps on west side of I-15 (z = 12..72)
  emitRampSlab(-212, 65, -228, 12, 6.4);
  emitRampSlab(-226, 22, -211, -18, 5.8);

  // 4. Harmon Ave Overpass Bridge (z = 221, spanning over Frank Sinatra Dr, I-15 & Dean Martin Dr to -260)
  buildBridge(b, mg, I15.harmonZ, 13.5, 4, -148, -171, -236, -260, 6.8, 'Harmon Ave Bridge (I-15)');

  // 5. Flamingo Rd Overpass Bridge (z = 0, connecting Strip Flamingo Rd over Frank Sinatra & I-15 to Dean Martin at -239)
  buildBridge(b, mg, I15.flamingoZ, 19.5, 6, -148, -171, -217, -239, 6.8, 'Flamingo Rd Bridge (I-15)');
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

  // Tight cull radius around I-15 core (Flamingo -> Dropicana -> Allegiant corridor)
  buildInstancedTraffic(b, lanes, [-195, 220], 360);
}
