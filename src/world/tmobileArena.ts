import * as THREE from 'three';
import { viewer, type WorldBuilder } from './builder';
import { buildPeople, GUEST_SHIRTS, Walkers, type Person } from './interiorKit';
import { basic, car, mat, mesh, neonSign } from './props';
import { L0, L1, Merger, canvasTex, palmInto, paving, v3 } from './southKit';
import { LedBoard } from './textures';
import { addBuilding, chainFenceInto, cobraPoleInto, flatRoad, lightPoolMat, ParkedLotBuilder, signBoard, treeClusterInto, WEST_RNG } from './westKit';

/**
 * T-Mobile Arena, Toshiba Plaza, The Park extension (Eataly, Dolby Live, Shake Shack, Beerhaus,
 * Top Round, Hello Kitty Cafe, Luke's Lobster, Tom's Watch Bar) and Frank Sinatra Dr south of z = 352.
 */

const ARENA_X = -135.5;
const ARENA_Z = 392.5;
const ARENA_YAW = 0.36; // front (+X local) faces ENE toward Toshiba Plaza & The Park
const ARENA_RX = 19.5; // depth radius (front-to-back)
const ARENA_RZ = 26.5; // width radius (wide oval bowl facing plaza)

export function buildTMobileArea(b: WorldBuilder): void {
  const mg = new Merger();
  extendThePark(b, mg);
  buildParkMGMPlazaEdge(b, mg);
  buildNYNYCornerShops(b, mg);
  buildToshibaPlaza(b, mg);
  buildArenaStructure(b, mg);
  buildFrankSinatraArenaSection(b, mg);
  mg.flush(b);
  buildArenaPlazaCrowds(b);
}

// ================================================================ The Park & Park MGM Edge

function extendThePark(b: WorldBuilder, mg: Merger): void {
  // Continuous desert travertine promenade west from Park MGM (-63.5) across Toshiba Plaza to Arena East
  paving(b, -63.5, -114, 344, 376, '#cbb89c', '#a8957a', 4, L0);
  paving(b, -88, -116, 376, 421, '#b8ab98', '#968976', 4, L0);

  // Extended Corten weathered-steel perforated shade canopies matching southStrip.ts
  const steel = mat(0x7a5a40, 0.8, 0.4);
  const perf = mat(0x8a6a4a, 0.75, 0.35, { side: THREE.DoubleSide });
  for (const [tx, tz] of [
    [-70, 355],
    [-82, 352],
    [-74, 369],
    [-94, 363],
  ]) {
    mg.beam(steel, v3(tx, 0, tz), v3(tx, 6.2, tz), 0.25, 8, 0.17, true);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + 0.35;
      mg.beam(steel, v3(tx, 4.4, tz), v3(tx + Math.cos(a) * 2.4, 6.5, tz + Math.sin(a) * 2.4), 0.085, 6);
    }
    for (let k = 0; k < 5; k++) {
      const a = k * 1.256 + 0.15;
      const g = new THREE.CylinderGeometry(1.72, 1.72, 0.08, 6);
      g.rotateX(0.16 * Math.cos(a * 2));
      g.rotateZ(0.14 * Math.sin(a * 3));
      mg.at(perf, g, tx + Math.cos(a) * 1.6, 6.55 + (k % 2) * 0.3, tz + Math.sin(a) * 1.6, 0, true);
    }
    b.collider(tx - 0.3, tx + 0.3, tz - 0.3, tz + 0.3, 0, 6.2, true);
  }

  // Basalt water wall west section
  mg.box(mat(0x2b2a2e, 0.55, 0.1), -69.5, 0.75, 367.5, 11, 1.5, 0.8, 0, true);
  b.collider(-75, -64, 367.1, 367.9, 0, 1.5, true);
  const sheet = new THREE.MeshStandardMaterial({
    color: 0x9fd8ff,
    transparent: true,
    opacity: 0.36,
    roughness: 0.05,
    metalness: 0.3,
    emissive: 0x2a6a9a,
    emissiveIntensity: 0.42,
  });
  b.add(mesh(new THREE.PlaneGeometry(10.6, 1.4), sheet, -69.5, 0.75, 367.92));

  // Desert trees & agave beds along the walk (keeping central Toshiba Plaza vista unobstructed)
  for (const [tx, tz, sc, sd] of [
    [-66, 368, 1.15, 2],
    [-91, 355, 1.1, 4],
    [-112, 362, 1.15, 5],
    [-110, 412, 1.1, 7],
  ] as Array<[number, number, number, number]>) {
    treeClusterInto(mg, tx, tz, sc, sd);
  }
  let pSeed = 310;
  for (const [px, pz] of [
    [-77, 373],
    [-89, 363],
    [-109, 358],
    [-112, 415],
  ]) {
    palmInto(mg, px, pz, 7.6 + (pSeed % 3) * 0.7, pSeed++);
    b.collider(px - 0.35, px + 0.35, pz - 0.35, pz + 0.35, 0, 7, true);
  }

  // Kiosks inside The Park: Top Round, Luke's Lobster, Hello Kitty Cafe
  // Top Round Roast Beef (north edge east of Park MGM tower)
  addBuilding(b, mg, { x: -57.5, z: 345.9, w: 7.4, d: 3.4, h: 4.0, wall: 0xf4f0e8, trim: 0xb82028, label: 'Top Round' });
  mg.box(mat(0xb82028, 0.55), -57.5, 3.05, 347.9, 7.6, 0.25, 1.0);
  signBoard(b, 'TOP ROUND', '#ffffff', '#c8202e', 6.4, 0.9, -57.5, 3.8, 347.7, 0, 'ROAST BEEF • CUSTARD', 0.12);
  b.zone('Top Round • The Park', -62, -53, 344, 350);

  // Luke's Lobster (cedar & navy shack near Strip entry of The Park)
  addBuilding(b, mg, { x: -35.5, z: 345.9, w: 6.4, d: 3.2, h: 3.8, wall: 0x7c5838, trim: 0x163258, label: "Luke's Lobster" });
  mg.box(mat(0x163258, 0.7), -35.5, 2.9, 347.8, 6.5, 0.22, 0.9);
  signBoard(b, "LUKE'S LOBSTER", '#163258', '#f6efe0', 5.8, 0.85, -35.5, 3.65, 347.6, 0, 'MAINE LOBSTER ROLLS', 0.12);
  b.zone("Luke's Lobster • The Park", -39.5, -31.5, 344, 350);

  // Hello Kitty Cafe (pink & white pop-up bow kiosk, south half of The Park near Bliss Dance)
  const pink = mat(0xf69ac0, 0.65);
  const cream = mat(0xfff7fa, 0.5);
  mg.box(cream, -39.5, 1.65, 363.8, 5.4, 3.3, 3.0, 0, true);
  mg.box(pink, -39.5, 3.45, 363.8, 5.8, 0.35, 3.4, 0, true);
  // signature pink bow above awning facing north into The Park
  mg.box(pink, -40.2, 4.05, 362.4, 0.8, 0.55, 0.22, 0.2);
  mg.box(pink, -38.8, 4.05, 362.4, 0.8, 0.55, 0.22, -0.2);
  mg.box(basic(0xff52a2), -39.5, 4.05, 362.4, 0.36, 0.36, 0.28);
  b.collider(-42.2, -36.8, 362.3, 365.3, 0, 3.6, true);
  signBoard(b, 'HELLO KITTY CAFE', '#ff64aa', '#ffffff', 5.2, 0.85, -39.5, 2.95, 362.2, Math.PI, 'TREATS • COFFEE', 0.1);
  // Strip-facing east counter window & striped pink emblem so Strip visitors see the front as they walk in
  mg.box(basic(0xfff0f6), -36.75, 1.65, 363.8, 0.1, 1.4, 2.0);
  signBoard(b, 'HELLO KITTY', '#ff64aa', '#ffffff', 2.8, 0.72, -36.68, 2.95, 363.8, Math.PI / 2, 'CAFE', 0.08);
  b.zone('Hello Kitty Cafe', -43, -36, 360, 366);

  // Extended zone
  b.zone('The Park', -84, -63.5, 344, 376);
}

function buildParkMGMPlazaEdge(b: WorldBuilder, mg: Merger): void {
  // ---- Eataly (Park MGM Strip/Park corner arcade facing south into The Park at z = 344)
  const stone = mat(0xdcd1be, 0.72);
  const warmGlass = new THREE.MeshStandardMaterial({
    color: 0x26201a,
    emissive: 0xffc878,
    emissiveIntensity: 0.3,
    roughness: 0.22,
    metalness: 0.3,
  });
  b.nightGlow(warmGlass, 0.25, 1.15);
  const greenAwning = mat(0x1e4d30, 0.75);
  addBuilding(b, mg, { x: -37.5, z: 339.8, w: 19, d: 6.4, h: 7.5, wall: 0xcabaa0, trim: 0x3a2c20, label: 'Eataly' });
  // Arched storefront colonnade facing south (+z)
  for (let i = 0; i < 4; i++) {
    const px = -45.2 + i * 4.8;
    mg.box(stone, px, 3.2, 343.2, 0.9, 6.4, 0.8);
    if (i < 3) {
      mg.box(warmGlass, px + 2.4, 2.6, 343.05, 3.6, 4.4, 0.15);
      mg.box(greenAwning, px + 2.4, 4.9, 343.8, 4.0, 0.22, 1.4);
    }
  }
  mg.box(stone, -29.8, 3.2, 343.2, 0.9, 6.4, 0.8);
  signBoard(b, 'EATALY', '#143320', '#f7ecd4', 11.5, 1.6, -37.5, 6.6, 343.25, 0, 'PIZZA • PASTA • GELATO • ESPRESSO');
  // Patio bistro tables outside Eataly
  const tableTop = mat(0xebe3d5, 0.55);
  const pole = mat(0x2a2d32, 0.5, 0.7);
  for (const tx of [-44, -39, -34, -30]) {
    mg.beam(pole, v3(tx, 0, 345.0), v3(tx, 0.74, 345.0), 0.05, 5);
    mg.at(tableTop, new THREE.CylinderGeometry(0.65, 0.65, 0.08, 10), tx, 0.76, 345.0);
  }
  b.zone('Eataly • Park MGM', -47, -28, 336, 346);

  // ---- Dolby Live (Park MGM Theater facing south onto Toshiba Plaza)
  const darkMetal = mat(0x1b1d24, 0.45, 0.65);
  const bronze = mat(0x8e673e, 0.35, 0.78);
  const dolbyPink = new THREE.MeshBasicMaterial({ color: 0xff287e });
  addBuilding(b, mg, { x: -97.5, z: 350.5, w: 38, d: 11, h: 15.5, wall: 0x22252e, trim: 0x8e673e, label: 'Dolby Live' });
  // Vertical bronze sculptural fins across south facade & east end facing The Park
  for (let x = -114.5; x <= -80.5; x += 2.6) {
    mg.box(bronze, x, 8.2, 356.2, 0.35, 13.6, 0.55);
  }
  mg.box(mat(0x4a3d34, 0.65, 0.25), -78.42, 7.8, 350.5, 0.16, 14.8, 10.6);
  for (let z = 345.8; z <= 355.2; z += 2.35) {
    mg.box(bronze, -78.22, 8.2, z, 0.35, 13.6, 0.42);
  }
  mg.box(dolbyPink, -78.2, 7.6, 354.6, 0.24, 11.2, 0.26);
  // Glowing vertical magenta marquee fins framing theater entry
  for (const fx of [-108, -87]) {
    mg.box(dolbyPink, fx, 7.6, 356.4, 0.25, 11.2, 0.28);
  }
  // Dramatic cantilevered theater entry canopy
  mg.box(darkMetal, -97.5, 4.8, 358.2, 22, 0.7, 4.6, 0, true);
  mg.box(dolbyPink, -97.5, 4.44, 360.45, 21.8, 0.12, 0.14);
  for (const cx of [-106, -89]) {
    mg.beam(bronze, v3(cx, 0, 359.8), v3(cx, 4.6, 359.8), 0.22, 8);
    b.collider(cx - 0.28, cx + 0.28, 359.5, 360.1, 0, 4.6, true);
  }
  signBoard(b, 'DOLBY LIVE', '#120816', '#ff3490', 14, 2.2, -97.5, 6.2, 360.6, 0, 'PARK MGM • 5,200-SEAT THEATER');
  signBoard(b, 'TONIGHT • RESIDENCY LIVE', '#18101c', '#ffe29c', 5.2, 1.35, -101.5, 2.6, 356.15, 0, 'DOORS 7 PM', 0.12);
  signBoard(b, 'BOX OFFICE & VIP', '#18101c', '#74e8ff', 5.2, 1.35, -93.5, 2.6, 356.15, 0, 'WILL CALL', 0.12);
  b.zone('Dolby Live (Park MGM)', -117, -78, 344, 361);

  // ---- Beerhaus (south border of The Park west of NYNY north wall, open plaza to north!)
  const brick = mat(0x6e3a2b, 0.85);
  const timber = mat(0x6b4b32, 0.8);
  const bhSpec = { wall: '#6e3a2b', mullion: '#222429', glass: '#262b30', lit: '#ffdca0', cols: 5, rows: 2, style: 0 as const, seed: 367 };
  addBuilding(b, mg, { x: -73, z: 374.5, w: 11.5, d: 4.8, h: 4.8, wall: bhSpec, trim: 0x24262b, label: 'Beerhaus' });
  mg.box(brick, -73, 2.4, 372.05, 11.4, 0.8, 0.2);
  // Outdoor beer garden pergola + long picnic tables opening north into The Park (z = 368..372)
  const pergolaSteel = mat(0x22252b, 0.45, 0.7);
  for (const px of [-78, -68]) {
    for (const pz of [368.0, 371.6]) {
      mg.beam(pergolaSteel, v3(px, 0, pz), v3(px, 3.6, pz), 0.1, 6);
    }
    mg.beam(pergolaSteel, v3(px, 3.6, 367.8), v3(px, 3.6, 371.8), 0.08, 5);
  }
  for (let pz = 368.2; pz <= 371.4; pz += 0.8) mg.box(timber, -73, 3.65, pz, 10.4, 0.08, 0.16);
  for (const bx of [-76, -70]) {
    mg.box(timber, bx, 0.74, 369.8, 2.8, 0.1, 0.9);
    mg.box(timber, bx, 0.42, 369.0, 2.8, 0.08, 0.32);
    mg.box(timber, bx, 0.42, 370.6, 2.8, 0.08, 0.32);
    b.collider(bx - 1.4, bx + 1.4, 368.8, 370.8, 0, 0.8, true);
  }
  signBoard(b, 'BEERHAUS', '#1d140e', '#ffd448', 8.2, 1.35, -73, 4.2, 371.95, Math.PI, 'CRAFT BEER • BRATS • GAMES');
  signBoard(b, 'BEERHAUS', '#1d140e', '#ffd448', 4.4, 1.0, -78.85, 4.2, 374.5, -Math.PI / 2, 'BEER GARDEN', 0.12);
  b.zone('Beerhaus • The Park', -79.5, -66.5, 367, 377);
}

function buildNYNYCornerShops(b: WorldBuilder, mg: Merger): void {
  // Shake Shack at NYNY's NE corner facing Strip & The Park (clear of Coaster at x <= -33.5)
  addBuilding(b, mg, { x: -26.5, z: 380.2, w: 7.4, d: 6.4, h: 5.4, wall: 0x2b2e33, trim: 0x4ca64a, label: 'Shake Shack' });
  mg.box(mat(0x7c5a3c, 0.8), -26.5, 3.4, 376.95, 7.2, 1.8, 0.25); // wood siding fascia
  mg.box(mat(0x1f2226, 0.5), -26.5, 3.2, 376.1, 7.6, 0.2, 1.8); // Park canopy
  signBoard(b, 'SHAKE SHACK', '#101c12', '#5ce65a', 6.8, 1.15, -26.5, 4.6, 376.8, Math.PI, 'BURGERS • SHAKES • FRIES');
  signBoard(b, 'SHAKE SHACK', '#101c12', '#5ce65a', 5.6, 1.05, -22.65, 4.6, 380.2, Math.PI / 2, '3790 S LAS VEGAS BLVD');
  b.zone('Shake Shack • NYNY', -31, -22, 375, 384);

  // Tom's Watch Bar immediately south (north of Brooklyn Bridge 392)
  addBuilding(b, mg, { x: -26.8, z: 387.4, w: 7.0, d: 5.2, h: 6.0, wall: 0x1a263a, trim: 0xd4a440, label: "Tom's Watch Bar" });
  signBoard(b, "TOM'S WATCH BAR", '#0c182c', '#ffd652', 6.4, 1.15, -23.15, 4.8, 387.4, Math.PI / 2, 'ALL SPORTS • 360° SCREENS');
  b.zone("Tom's Watch Bar • NYNY", -31, -22, 384, 391);
}

// ================================================================ Toshiba Plaza

function buildToshibaPlaza(b: WorldBuilder, mg: Merger): void {
  const truss = mat(0x242830, 0.45, 0.72);
  const deckMat = mat(0x3a3c42, 0.75, 0.25);
  const magenta = new THREE.MeshBasicMaterial({ color: 0xe20074 });
  const stageGlow = new THREE.MeshBasicMaterial({ color: 0x7ae8ff });

  // ---- North Plaza Stage (~950 sq ft): clean west of Beerhaus, south of Dolby Live
  const buildStage = (sx: number, sz: number, w: number, d: number, yaw: number, title: string, accentMat: THREE.Material) => {
    const g = new THREE.Group();
    const gm = new Merger();
    gm.box(deckMat, 0, 0.4, 0, w, 0.8, d, 0, true);
    for (const px of [-w / 2 + 0.3, w / 2 - 0.3]) {
      for (const pz of [-d / 2 + 0.3, d / 2 - 0.3]) {
        gm.beam(truss, v3(px, 0.8, pz), v3(px, 5.2, pz), 0.14, 6);
      }
    }
    gm.box(truss, 0, 5.35, 0, w + 0.4, 0.45, d + 0.4, 0, true);
    gm.box(accentMat, 0, 5.35, d / 2 + 0.22, w, 0.22, 0.08);
    // PA side speakers + rear LED wall
    for (const px of [-w / 2 - 0.45, w / 2 + 0.45]) gm.box(truss, px, 3.6, d * 0.25, 0.7, 2.2, 0.8);
    for (const me of gm.flush(b, true)) {
      b.scene.remove(me);
      g.add(me);
    }
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 1.2, 3.1),
      new THREE.MeshBasicMaterial({
        map: canvasTex(512, 224, (ctx) => {
          ctx.fillStyle = '#0d0618';
          ctx.fillRect(0, 0, 512, 224);
          ctx.strokeStyle = '#e20074';
          ctx.lineWidth = 8;
          ctx.strokeRect(8, 8, 496, 208);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 42px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(title, 256, 98, 460);
          ctx.fillStyle = '#70e4ff';
          ctx.font = 'bold 24px system-ui, sans-serif';
          ctx.fillText('LIVE FAN FEST • PREGAME PARTY', 256, 152, 460);
        }),
      })
    );
    backdrop.position.set(0, 2.8, -d / 2 + 0.45);
    g.add(backdrop);
    b.add(g, sx, 0, sz, yaw);
    const hw = Math.abs(Math.cos(yaw)) > 0.5 ? w / 2 : d / 2;
    const hd = Math.abs(Math.cos(yaw)) > 0.5 ? d / 2 : w / 2;
    b.collider(sx - hw, sx + hw, sz - hd, sz + hd, 0, 0.85);
  };

  buildStage(-94, 361.5, 7.6, 4.4, 0.32, 'TOSHIBA PLAZA', magenta);
  buildStage(-98, 415.0, 5.6, 3.6, -2.5, 'FAN ZONE STAGE', stageGlow);

  // ---- Terraced plaza stone seating planters & festival truss light towers (framing the open plaza vista)
  const stone = mat(0x9a8f80, 0.8);
  for (const [bx, bz, bw, bd] of [
    [-88, 365.5, 4.8, 1.3],
    [-100, 408.5, 4.6, 1.3],
  ]) {
    mg.box(stone, bx, 0.35, bz, bw, 0.7, bd);
    b.collider(bx - bw / 2, bx + bw / 2, bz - bd / 2, bz + bd / 2, 0, 0.7);
  }
  // 4 festival light & banner pylons ringing Toshiba Plaza perimeter
  for (const [lx, lz] of [
    [-81, 359],
    [-105, 361],
    [-88, 412],
    [-106, 415],
  ]) {
    mg.beam(truss, v3(lx, 0, lz), v3(lx, 10.5, lz), 0.18, 6, 0.16);
    mg.box(magenta, lx, 8.5, lz, 0.5, 2.4, 0.5);
    mg.box(basic(0xfff0d4), lx, 10.7, lz, 0.9, 0.4, 0.9);
    b.collider(lx - 0.25, lx + 0.25, lz - 0.25, lz + 0.25, 0, 10.5, true);
  }

  // Plaza feature + zone + map label
  b.feature({ kind: 'park', x: -97, z: 369, w: 32, d: 28, color: '#bfa88a', label: 'Toshiba Plaza' });
  b.zone('Toshiba Plaza', -115, -78, 357, 412);
  b.pickup(-94, 1.25, 361.5, 3, 'Toshiba Plaza Stage Pack', false);
}

// ================================================================ T-Mobile Arena Architecture

/** Transform local arena coords (lx = front +X, lz = left +Z) into world space. */
function arenaToWorld(lx: number, y: number, lz: number): [number, number, number] {
  const c = Math.cos(ARENA_YAW);
  const s = Math.sin(ARENA_YAW);
  return [ARENA_X + lx * c + lz * s, y, ARENA_Z - lx * s + lz * c];
}

/** Build a smooth indexed quad-strip ribbon in local arena coordinates (rotated + translated to world). */
function arenaRibbonGeo(
  botPts: Array<[number, number, number]>,
  topPts: Array<[number, number, number]>,
  uRepeat = 1,
  vRepeat = 1,
  flip = false
): THREE.BufferGeometry {
  const n = botPts.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * uRepeat;
    const b = arenaToWorld(botPts[i][0], botPts[i][1], botPts[i][2]);
    const t = arenaToWorld(topPts[i][0], topPts[i][1], topPts[i][2]);
    pos.push(b[0], b[1], b[2], t[0], t[1], t[2]);
    uv.push(u, 0, u, vRepeat);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    if (!flip) idx.push(a, b, c, b, d, c);
    else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Draw the T-Mobile "T" with flanking pixel dots + "Mobile" + "ARENA" + curved swoosh. */
function drawTMobileWordmark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baselineY: number,
  scale: number,
  color: string,
  includeSwoosh: boolean,
  includeWelcome: boolean
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  if (includeWelcome) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${Math.round(25 * scale)}px "Segoe UI", Arial, sans-serif`;
    ctx.letterSpacing = `${Math.round(2.5 * scale)}px`;
    ctx.fillText('WELCOME TO', cx - 340 * scale, baselineY - 102 * scale);
  }

  // Stylized slab-serif "T" + two square dots on left/right of stem
  const tx = cx - 345 * scale;
  const th = 84 * scale;
  const tw = 60 * scale;
  const ty = baselineY - th;
  const sw = 13 * scale;
  // Top bar + hanging end serifs
  ctx.fillRect(tx, ty, tw, 11 * scale);
  ctx.fillRect(tx, ty, 7 * scale, 22 * scale);
  ctx.fillRect(tx + tw - 7 * scale, ty, 7 * scale, 22 * scale);
  // Central stem + bottom serif
  ctx.fillRect(tx + (tw - sw) / 2, ty, sw, th);
  ctx.fillRect(tx + tw * 0.22, baselineY - 9 * scale, tw * 0.56, 9 * scale);
  // Two iconic square pixel dots flanking stem
  const dot = 10 * scale;
  ctx.fillRect(tx + 4 * scale, baselineY - 42 * scale, dot, dot);
  ctx.fillRect(tx + tw - 4 * scale - dot, baselineY - 42 * scale, dot, dot);

  // "Mobile" in bold serif
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = `${Math.round(-1 * scale)}px`;
  ctx.font = `bold ${Math.round(84 * scale)}px Georgia, "Times New Roman", serif`;
  const mobileX = tx + tw + 4 * scale;
  ctx.fillText('Mobile', mobileX, baselineY);
  const mobileW = ctx.measureText('Mobile').width;

  // "ARENA" in tracked geometric uppercase sans-serif
  ctx.letterSpacing = `${Math.round(12 * scale)}px`;
  ctx.font = `600 ${Math.round(54 * scale)}px "Segoe UI", Arial, sans-serif`;
  const arenaX = mobileX + mobileW + 28 * scale;
  ctx.fillText('ARENA', arenaX, baselineY - 2 * scale);

  // White curved swoosh arc sweeping from above Mobile/ARENA down the right side
  if (includeSwoosh) {
    const s0x = mobileX + mobileW * 0.65;
    const s0y = baselineY - 96 * scale;
    const cpX = arenaX + 215 * scale;
    const cpY = baselineY - 100 * scale;
    const s1x = arenaX + 288 * scale;
    const s1y = baselineY + 22 * scale;
    ctx.beginPath();
    ctx.moveTo(s0x, s0y);
    ctx.quadraticCurveTo(cpX, cpY, s1x, s1y);
    ctx.quadraticCurveTo(cpX - 8 * scale, cpY + 12 * scale, s0x, s0y + 2 * scale);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function makeArenaBronzeTex(): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const map = canvasTex(512, 512, (ctx) => {
    ctx.fillStyle = '#c9ad88';
    ctx.fillRect(0, 0, 512, 512);
    const cols = 36;
    const cw = 512 / cols;
    const rows = 8;
    const rh = 512 / rows;
    const R = WEST_RNG(717);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const shade = 0.88 + R() * 0.24;
        const cr = Math.min(255, Math.round(208 * shade));
        const cg = Math.min(255, Math.round(180 * shade));
        const cb = Math.min(255, Math.round(142 * shade));
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fillRect(c * cw, r * rh, cw, rh);
        // slim vertical metallic fin highlight & dark reveal
        ctx.fillStyle = 'rgba(255,232,200,0.28)';
        ctx.fillRect(c * cw + 1, r * rh, 2.2, rh);
        ctx.fillStyle = 'rgba(42,28,18,0.42)';
        ctx.fillRect(c * cw, r * rh, 1.4, rh);
      }
      ctx.fillStyle = 'rgba(46,32,20,0.34)';
      ctx.fillRect(0, r * rh, 512, 2);
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const roughnessMap = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = 'rgb(0,82,0)';
    ctx.fillRect(0, 0, 256, 256);
    for (let c = 0; c < 36; c++) {
      ctx.fillStyle = c % 2 === 0 ? 'rgb(0,62,0)' : 'rgb(0,104,0)';
      ctx.fillRect(c * (256 / 36) + 1, 0, 5, 256);
    }
  });
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  return { map, roughnessMap };
}

function makeLobbyInteriorTex(): THREE.CanvasTexture {
  return canvasTex(1024, 256, (ctx) => {
    const bg = ctx.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, '#54123c');
    bg.addColorStop(0.32, '#341a28');
    bg.addColorStop(1, '#1a161e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 256);

    // Warm magenta & rose concourse ceiling wash inside lobby
    const mag = ctx.createLinearGradient(0, 0, 0, 120);
    mag.addColorStop(0, 'rgba(255,48,156,0.72)');
    mag.addColorStop(1, 'rgba(255,48,156,0)');
    ctx.fillStyle = mag;
    ctx.fillRect(0, 0, 1024, 120);

    // Warm lit concourse depth bays + horizontal balcony slab
    for (let x = 28; x < 1024; x += 88) {
      ctx.fillStyle = 'rgba(255,216,170,0.22)';
      ctx.fillRect(x + 12, 74, 62, 162);
      ctx.fillStyle = 'rgba(22,18,22,0.85)';
      ctx.fillRect(x, 0, 10, 256);
    }
    ctx.fillStyle = 'rgba(34,28,32,0.8)';
    ctx.fillRect(0, 114, 1024, 10);

    // Diagonal interior escalator trusses visible through lobby glass
    ctx.strokeStyle = 'rgba(255,236,204,0.62)';
    ctx.lineWidth = 5;
    for (const [x0, y0, x1, y1] of [
      [180, 236, 360, 118],
      [350, 236, 510, 118],
      [680, 236, 520, 118],
      [850, 236, 690, 118],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    // Subtle pink interior signage glow
    ctx.fillStyle = 'rgba(226,0,116,0.45)';
    ctx.fillRect(438, 80, 148, 30);
    ctx.fillStyle = '#fff4fa';
    ctx.font = 'bold 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('T-Mobile ARENA', 512, 100);
  });
}

function makeSoffitGlowTex(): THREE.CanvasTexture {
  return canvasTex(512, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, '#ff40b8');
    g.addColorStop(0.32, '#ff1292');
    g.addColorStop(0.75, '#e00074');
    g.addColorStop(1, '#8c084e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    // Subtle architectural soffit panel seams
    ctx.strokeStyle = 'rgba(90,0,48,0.28)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= 512; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
  });
}

function makeRibbedBandTex(): THREE.CanvasTexture {
  return canvasTex(256, 128, (ctx) => {
    ctx.fillStyle = '#b3a088';
    ctx.fillRect(0, 0, 256, 128);
    for (let y = 0; y < 128; y += 8) {
      ctx.fillStyle = y % 16 === 0 ? 'rgba(250,236,214,0.35)' : 'rgba(60,48,40,0.38)';
      ctx.fillRect(0, y, 256, 3);
    }
  });
}

function makeRoofLettersTex(): THREE.CanvasTexture {
  return canvasTex(1024, 160, (ctx) => {
    ctx.clearRect(0, 0, 1024, 160);
    // Crisp dark return shadow for daytime legibility against clouds/sky
    drawTMobileWordmark(ctx, 512 + 3, 124 + 3, 1.12, '#1f232c', false, false);
    // Bright brushed silver-white front face
    drawTMobileWordmark(ctx, 512, 124, 1.12, '#f4f7fc', false, false);
  });
}

function buildArenaStructure(b: WorldBuilder, mg: Merger): void {
  const pt = (rx: number, rz: number, a: number): [number, number] => [Math.cos(a) * rx, Math.sin(a) * rz];
  // Sample decreasingly or strictly between a0 -> a1 (when a0 > a1, runs LEFT +Z to RIGHT -Z so u=0..1 reads left-to-right!)
  const sample = (n: number, a0: number, a1: number, fn: (a: number, k: number) => [number, number, number]) => {
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i <= n; i++) out.push(fn(a0 + (i / n) * (a1 - a0), i / n));
    return out;
  };

  // Cantilevered lower-deck overhang profile (broad center lip, dramatic pointed prow on left +Z)
  const deckOverhang = (a: number): number => {
    const base = 2.2 + Math.max(0, Math.cos(a * 0.9)) * 3.0;
    const prow = 3.6 * Math.exp(-Math.pow((a - 0.84) / 0.24, 2));
    return base + prow;
  };
  const deckSoffitY = (a: number): number => 6.15 + 1.1 * Math.exp(-Math.pow((a - 0.84) / 0.28, 2));
  const deckTopY = (a: number): number => 8.45 + 0.8 * Math.exp(-Math.pow((a - 0.84) / 0.3, 2));

  // Shared Architectural Materials
  const bronzeTex = makeArenaBronzeTex();
  const bronzeSkin = new THREE.MeshStandardMaterial({
    map: bronzeTex.map,
    roughnessMap: bronzeTex.roughnessMap,
    roughness: 0.46,
    metalness: 0.42,
  });
  const bronzeWing = mat(0xc6a985, 0.42, 0.45);
  const darkMetal = mat(0x28262b, 0.36, 0.76);
  const gunmetalRib = new THREE.MeshStandardMaterial({
    map: makeRibbedBandTex(),
    roughness: 0.4,
    metalness: 0.45,
  });
  const slateDeck = mat(0x323036, 0.65, 0.25);
  const silverFrame = mat(0xcfd4dc, 0.28, 0.84);
  const blueGlass = new THREE.MeshStandardMaterial({
    color: 0x2068b8,
    emissive: 0x0e3468,
    emissiveIntensity: 0.42,
    roughness: 0.08,
    metalness: 0.86,
  });
  b.nightGlow(blueGlass, 0.32, 0.72);

  const lobbyGlass = new THREE.MeshStandardMaterial({
    color: 0x2a3b4e,
    roughness: 0.08,
    metalness: 0.72,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
  });
  const concourseGlass = new THREE.MeshStandardMaterial({
    color: 0x161c26,
    emissive: 0x38142a,
    emissiveIntensity: 0.28,
    roughness: 0.1,
    metalness: 0.82,
  });
  b.nightGlow(concourseGlass, 0.2, 0.65);

  const interiorTex = makeLobbyInteriorTex();
  const interiorMat = new THREE.MeshStandardMaterial({
    map: interiorTex,
    emissiveMap: interiorTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.48,
    roughness: 0.5,
  });
  b.nightGlow(interiorMat, 0.42, 1.15);

  const soffitTex = makeSoffitGlowTex();
  const soffitMat = new THREE.MeshStandardMaterial({
    map: soffitTex,
    emissiveMap: soffitTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.72,
    roughness: 0.44,
    metalness: 0.12,
  });
  b.nightGlow(soffitMat, 0.72, 0.96);

  const railGlass = new THREE.MeshStandardMaterial({
    color: 0x9ec6e4,
    transparent: true,
    opacity: 0.35,
    roughness: 0.08,
    metalness: 0.5,
    side: THREE.DoubleSide,
  });

  // ---- 1. Ground Glass Lobby Curtain Wall + Interior Concourse + Entry Doors + Box Office (y = 0 .. 5.4)
  const LOBBY_RX = ARENA_RX - 1.2;
  const LOBBY_RZ = ARENA_RZ - 1.2;
  const LOBBY_H = 5.4;

  // Lit interior lobby backdrop curving behind the glass curtain wall (a = +1.05 -> -0.95)
  mg.add(
    arenaRibbonGeo(
      sample(24, 1.05, -0.95, (a) => {
        const [lx, lz] = pt(LOBBY_RX - 2.1, LOBBY_RZ - 2.1, a);
        return [lx, 0.05, lz];
      }),
      sample(24, 1.05, -0.95, (a) => {
        const [lx, lz] = pt(LOBBY_RX - 2.1, LOBBY_RZ - 2.1, a);
        return [lx, LOBBY_H - 0.05, lz];
      }),
      1,
      1,
      true
    ),
    interiorMat
  );

  // Outer curved lobby glass curtain wall (a = +0.96 -> -0.88)
  mg.add(
    arenaRibbonGeo(
      sample(28, 0.96, -0.88, (a) => {
        const [lx, lz] = pt(LOBBY_RX, LOBBY_RZ, a);
        return [lx, 0, lz];
      }),
      sample(28, 0.96, -0.88, (a) => {
        const [lx, lz] = pt(LOBBY_RX, LOBBY_RZ, a);
        return [lx, LOBBY_H, lz];
      }),
      1,
      1,
      true
    ),
    lobbyGlass
  );

  // Vertical mullions & row of double glass entry doors across the front center (a = -0.38 .. +0.42)
  for (let i = 0; i <= 28; i++) {
    const a = -0.88 + (i / 28) * (0.96 + 0.88);
    const [lx, lz] = pt(LOBBY_RX + 0.05, LOBBY_RZ + 0.05, a);
    const [wx, , wz] = arenaToWorld(lx, 0, lz);
    const isDoorZone = a >= -0.38 && a <= 0.42;
    mg.box(isDoorZone ? silverFrame : darkMetal, wx, LOBBY_H / 2, wz, 0.1, LOBBY_H, 0.12, ARENA_YAW - a);
    if (isDoorZone && i < 28) {
      const aMid = a + 0.032;
      const [dx, dz] = pt(LOBBY_RX + 0.12, LOBBY_RZ + 0.12, aMid);
      const [dwx, , dwz] = arenaToWorld(dx, 0, dz);
      mg.box(silverFrame, dwx, 1.32, dwz, 0.05, 2.64, 0.05, ARENA_YAW - aMid);
      mg.box(silverFrame, dwx, 1.12, dwz, 0.09, 0.05, 0.68, ARENA_YAW - aMid);
    }
  }
  // Horizontal transoms across glass lobby (door header at 2.65 m + upper transom at 4.05 m)
  for (const ty of [2.65, 4.05]) {
    mg.add(
      arenaRibbonGeo(
        sample(28, 0.96, -0.88, (a) => {
          const [lx, lz] = pt(LOBBY_RX + 0.06, LOBBY_RZ + 0.06, a);
          return [lx, ty - 0.05, lz];
        }),
        sample(28, 0.96, -0.88, (a) => {
          const [lx, lz] = pt(LOBBY_RX + 0.06, LOBBY_RZ + 0.06, a);
          return [lx, ty + 0.05, lz];
        }),
        1,
        1,
        true
      ),
      darkMetal
    );
  }

  // ---- Lower-Left Box Office Podium + Blue Ticket Kiosks (matching the photo under the left prow)
  const boxBronze = mat(0x8a7560, 0.55, 0.35);
  const boxDark = mat(0x221c18, 0.65, 0.3);
  const boxFrontPts = sample(8, 0.94, 0.48, (a) => {
    const [lx, lz] = pt(LOBBY_RX + 2.8, LOBBY_RZ + 2.8, a);
    return [lx, 0, lz];
  });
  const boxTopPts = sample(8, 0.94, 0.48, (a) => {
    const [lx, lz] = pt(LOBBY_RX + 2.8, LOBBY_RZ + 2.8, a);
    return [lx, 3.35, lz];
  });
  mg.add(arenaRibbonGeo(boxFrontPts, boxTopPts, 1, 1, true), boxBronze, true);
  // Roof + recessed ticket counter band on Box Office
  mg.add(
    arenaRibbonGeo(
      boxTopPts,
      sample(8, 0.94, 0.48, (a) => {
        const [lx, lz] = pt(LOBBY_RX, LOBBY_RZ, a);
        return [lx, 3.35, lz];
      }),
      1,
      1,
      true
    ),
    darkMetal
  );
  // Dark recessed teller window strip on Box Office front
  mg.add(
    arenaRibbonGeo(
      sample(6, 0.86, 0.55, (a) => {
        const [lx, lz] = pt(LOBBY_RX + 2.84, LOBBY_RZ + 2.84, a);
        return [lx, 0.95, lz];
      }),
      sample(6, 0.86, 0.55, (a) => {
        const [lx, lz] = pt(LOBBY_RX + 2.84, LOBBY_RZ + 2.84, a);
        return [lx, 2.2, lz];
      }),
      1,
      1,
      true
    ),
    boxDark
  );
  const boMid = pt(LOBBY_RX + 2.94, LOBBY_RZ + 2.94, 0.72);
  const boW = arenaToWorld(boMid[0], 2.74, boMid[1]);
  const boTex = canvasTex(512, 80, (ctx) => {
    ctx.clearRect(0, 0, 512, 80);
    ctx.fillStyle = '#e8cf9c';
    ctx.font = '700 42px "Segoe UI", Arial, sans-serif';
    ctx.letterSpacing = '6px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BOX OFFICE', 256, 40);
  });
  const boMat = b.nightGlow(
    new THREE.MeshStandardMaterial({ map: boTex, emissiveMap: boTex, emissive: 0xffffff, emissiveIntensity: 0.45, alphaTest: 0.25, roughness: 0.4 }),
    0.3,
    0.85
  );
  const boMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.7), boMat);
  boMesh.position.set(boW[0], boW[1], boW[2]);
  boMesh.rotation.y = Math.PI / 2 + ARENA_YAW - 0.72;
  b.add(boMesh);

  // Two bright blue self-service ticket kiosks just right of Box Office
  const kioskBlue = basic(0x1678ff);
  for (const ka of [0.43, 0.455]) {
    const kp = pt(LOBBY_RX + 2.3, LOBBY_RZ + 2.3, ka);
    const kw = arenaToWorld(kp[0], 0.95, kp[1]);
    mg.box(darkMetal, kw[0], 0.95, kw[2], 0.52, 1.9, 0.55, ARENA_YAW - ka, true);
    mg.box(kioskBlue, kw[0] + 0.14, 1.15, kw[2], 0.32, 0.95, 0.48, ARENA_YAW - ka);
  }

  // Subtle low dark security bollards across plaza doors (no chunky white poles!)
  for (let a = -0.36; a <= 0.36; a += 0.09) {
    const bp = pt(LOBBY_RX + 3.6, LOBBY_RZ + 3.6, a);
    const bw = arenaToWorld(bp[0], 0, bp[1]);
    mg.beam(darkMetal, v3(bw[0], 0, bw[2]), v3(bw[0], 0.85, bw[2]), 0.09, 8);
    b.collider(bw[0] - 0.14, bw[0] + 0.14, bw[2] - 0.14, bw[2] + 0.14, 0, 0.85, true);
  }

  // ---- 2. Sweeping Cantilevered Lower Deck ("thick curved lip" + bright magenta underside glow)
  const DECK_N = 48;
  const deckA0 = -1.14;
  const deckA1 = 1.16;
  const deckInBot = sample(DECK_N, deckA1, deckA0, (a) => {
    const [lx, lz] = pt(LOBBY_RX - 0.2, LOBBY_RZ - 0.2, a);
    return [lx, LOBBY_H, lz];
  });
  const deckOutBot = sample(DECK_N, deckA1, deckA0, (a) => {
    const ov = deckOverhang(a);
    const [lx, lz] = pt(LOBBY_RX + ov, LOBBY_RZ + ov, a);
    return [lx, deckSoffitY(a), lz];
  });
  const deckOutTop = sample(DECK_N, deckA1, deckA0, (a) => {
    const ov = deckOverhang(a) + 0.35;
    const [lx, lz] = pt(LOBBY_RX + ov, LOBBY_RZ + ov, a);
    return [lx, deckTopY(a), lz];
  });
  const deckInTop = sample(DECK_N, deckA1, deckA0, (a) => {
    const [lx, lz] = pt(LOBBY_RX - 0.2, LOBBY_RZ - 0.2, a);
    return [lx, deckTopY(a), lz];
  });
  // Glowing magenta soffit underside (normals point DOWNWARD -Y toward plaza & lobby!)
  mg.add(arenaRibbonGeo(deckInBot, deckOutBot, 1, 1, true), soffitMat);
  // Thick curved fascia lip, washed pink from the uplights below (champagne top edge -> hot pink bottom)
  const lipTex = canvasTex(16, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#c9ae94');
    g.addColorStop(0.1, '#c4889c');
    g.addColorStop(0.4, '#e8489e');
    g.addColorStop(1, '#ff2c9c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 128);
  });
  const lipMat = new THREE.MeshStandardMaterial({ map: lipTex, emissiveMap: lipTex, emissive: 0xffffff, emissiveIntensity: 0.32, roughness: 0.5, metalness: 0.2 });
  b.nightGlow(lipMat, 0.32, 0.7);
  mg.add(arenaRibbonGeo(deckOutBot, deckOutTop, 1, 1, true), lipMat, true);
  // Top terrace surface (normals point UPWARD +Y!) + frameless glass balcony railing
  mg.add(arenaRibbonGeo(deckOutTop, deckInTop, 1, 1, true), slateDeck);
  const deckRailTop = sample(DECK_N, deckA1, deckA0, (a) => {
    const ov = deckOverhang(a) + 0.22;
    const [lx, lz] = pt(LOBBY_RX + ov, LOBBY_RZ + ov, a);
    return [lx, deckTopY(a) + 0.85, lz];
  });
  mg.add(arenaRibbonGeo(deckOutTop, deckRailTop, 1, 1, true), railGlass);
  // Left prow end wall closing the cantilevered prow cleanly
  const prowEndIn = arenaToWorld(pt(LOBBY_RX - 0.2, LOBBY_RZ - 0.2, deckA1)[0], LOBBY_H, pt(LOBBY_RX - 0.2, LOBBY_RZ - 0.2, deckA1)[1]);
  const prowEndOut = arenaToWorld(
    pt(LOBBY_RX + deckOverhang(deckA1), LOBBY_RZ + deckOverhang(deckA1), deckA1)[0],
    deckTopY(deckA1),
    pt(LOBBY_RX + deckOverhang(deckA1), LOBBY_RZ + deckOverhang(deckA1), deckA1)[1]
  );
  mg.box(darkMetal, (prowEndIn[0] + prowEndOut[0]) / 2, (prowEndIn[1] + prowEndOut[1]) / 2, (prowEndIn[2] + prowEndOut[2]) / 2, 3.2, 1.8, 0.35, ARENA_YAW - deckA1);

  // ---- 3. Mid Dark Glass Concourse Gallery (y = 8.0 .. 11.2, recessed between lower deck & LED screen)
  const MID_RX = ARENA_RX + 0.2;
  const MID_RZ = ARENA_RZ + 0.2;
  mg.add(
    arenaRibbonGeo(
      sample(30, 0.95, -0.85, (a) => {
        const [lx, lz] = pt(MID_RX, MID_RZ, a);
        return [lx, 8.0, lz];
      }),
      sample(30, 0.95, -0.85, (a) => {
        const [lx, lz] = pt(MID_RX, MID_RZ, a);
        return [lx, 11.3, lz];
      }),
      1,
      1,
      true
    ),
    concourseGlass
  );
  // Dark structural mullions across mid-concourse gallery
  for (let i = 0; i <= 20; i++) {
    const a = -0.82 + (i / 20) * (0.92 + 0.82);
    const [lx, lz] = pt(MID_RX + 0.08, MID_RZ + 0.08, a);
    const [wx, , wz] = arenaToWorld(lx, 0, lz);
    mg.box(darkMetal, wx, 9.65, wz, 0.14, 3.3, 0.16, ARENA_YAW - a);
  }
  mg.add(
    arenaRibbonGeo(
      sample(24, 0.95, -0.85, (a) => {
        const [lx, lz] = pt(MID_RX + 0.1, MID_RZ + 0.1, a);
        return [lx, 9.55, lz];
      }),
      sample(24, 0.95, -0.85, (a) => {
        const [lx, lz] = pt(MID_RX + 0.1, MID_RZ + 0.1, a);
        return [lx, 9.75, lz];
      }),
      1,
      1,
      true
    ),
    darkMetal
  );

  // ---- 4. Upper Bowl Skin: Bronze Cladding, Upper-Left Blue Glass Strip & Right Stacked Ribbed Bands
  const SKIN_RX = ARENA_RX + 1.0;
  const SKIN_RZ = ARENA_RZ + 1.0;

  // (a) Bronze/champagne ribbed cladding wrapping from left wing (+0.54) around rear (+PI / -PI) to right (-1.82)
  mg.add(
    arenaRibbonGeo(
      sample(40, Math.PI * 2 - 1.82, 0.54, (a) => {
        const [lx, lz] = pt(SKIN_RX, SKIN_RZ, a);
        return [lx, 0, lz];
      }),
      sample(40, Math.PI * 2 - 1.82, 0.54, (a) => {
        const [lx, lz] = pt(SKIN_RX - 0.5, SKIN_RZ - 0.5, a);
        return [lx, 18.8, lz];
      }),
      12,
      2.5,
      true
    ),
    bronzeSkin,
    true
  );
  // Sculpted 3D vertical metallic fins along the left & rear bronze facade
  for (let i = 0; i <= 26; i++) {
    const a = 0.62 + (i / 26) * (Math.PI * 2 - 1.82 - 0.62);
    const [lx, lz] = pt(SKIN_RX + 0.08, SKIN_RZ + 0.08, a);
    const [wx, , wz] = arenaToWorld(lx, 0, lz);
    mg.box(bronzeWing, wx, 9.4, wz, 0.22, 18.4, 0.14, ARENA_YAW - a);
  }

  // (b) Long sweeping strip of cobalt-blue glass curving around the upper-left bronze flank (a = +0.64 .. +1.76)
  mg.add(
    arenaRibbonGeo(
      sample(18, 1.76, 0.64, (a, k) => {
        const taper = Math.sin(k * Math.PI);
        const [lx, lz] = pt(SKIN_RX + 0.22, SKIN_RZ + 0.22, a);
        return [lx, 11.4 + (1 - taper) * 1.1, lz];
      }),
      sample(18, 1.76, 0.64, (a, k) => {
        const taper = Math.sin(k * Math.PI);
        const [lx, lz] = pt(SKIN_RX + 0.08, SKIN_RZ + 0.08, a);
        return [lx, 15.2 - (1 - taper) * 0.7, lz];
      }),
      1,
      1,
      true
    ),
    blueGlass
  );
  // Projecting angled bronze brow hood overhanging above the blue glass strip
  mg.add(
    arenaRibbonGeo(
      sample(18, 1.82, 0.56, (a) => {
        const [lx, lz] = pt(SKIN_RX + 0.9, SKIN_RZ + 0.9, a);
        return [lx, 15.3, lz];
      }),
      sample(18, 1.82, 0.56, (a) => {
        const [lx, lz] = pt(SKIN_RX - 0.35, SKIN_RZ - 0.35, a);
        return [lx, 18.6, lz];
      }),
      4,
      1,
      true
    ),
    bronzeSkin,
    true
  );

  // (c) Left & right sculpted metallic wing fins framing the giant curved LED screen
  mg.add(
    arenaRibbonGeo(
      sample(6, 0.64, 0.52, (a, k) => {
        const [lx, lz] = pt(SKIN_RX + 0.8 + (1 - k) * 0.4, SKIN_RZ + 0.8 + (1 - k) * 0.4, a);
        return [lx, 8.2 + (1 - k) * 1.4, lz];
      }),
      sample(6, 0.64, 0.52, (a) => {
        const [lx, lz] = pt(SKIN_RX + 0.6, SKIN_RZ + 0.6, a);
        return [lx, 18.4, lz];
      }),
      1,
      1,
      true
    ),
    bronzeWing,
    true
  );
  mg.add(
    arenaRibbonGeo(
      sample(6, -0.51, -0.66, (a, k) => {
        const [lx, lz] = pt(SKIN_RX + 0.6 + k * 0.3, SKIN_RZ + 0.6 + k * 0.3, a);
        return [lx, 7.6 + k * 1.2, lz];
      }),
      sample(6, -0.51, -0.66, (a) => {
        const [lx, lz] = pt(SKIN_RX + 0.45, SKIN_RZ + 0.45, a);
        return [lx, 18.2, lz];
      }),
      1,
      1,
      true
    ),
    gunmetalRib,
    true
  );

  // (d) Stacked horizontal ribbed metallic bands wrapping around the right shoulder (a = -0.54 .. -1.85)
  mg.add(
    arenaRibbonGeo(
      sample(22, -0.54, -1.85, (a) => {
        const [lx, lz] = pt(SKIN_RX - 0.3, SKIN_RZ - 0.3, a);
        return [lx, 0, lz];
      }),
      sample(22, -0.54, -1.85, (a) => {
        const [lx, lz] = pt(SKIN_RX - 0.5, SKIN_RZ - 0.5, a);
        return [lx, 18.8, lz];
      }),
      10,
      2.5,
      true
    ),
    bronzeSkin,
    true
  );
  for (let band = 0; band < 7; band++) {
    const y0 = 6.2 + band * 1.72;
    const y1 = y0 + 1.38;
    const stepOut = 0.35 + Math.sin((band / 6) * Math.PI) * 0.55;
    const bandMat = band % 2 === 0 ? gunmetalRib : bronzeWing;
    mg.add(
      arenaRibbonGeo(
        sample(22, -0.56 - band * 0.015, -1.84, (a) => {
          const [lx, lz] = pt(SKIN_RX + stepOut, SKIN_RZ + stepOut, a);
          return [lx, y0, lz];
        }),
        sample(22, -0.56 - band * 0.015, -1.84, (a) => {
          const [lx, lz] = pt(SKIN_RX + stepOut - 0.25, SKIN_RZ + stepOut - 0.25, a);
          return [lx, y1, lz];
        }),
        4,
        1,
        true
      ),
      bandMat,
      true
    );
  }

  // ---- 5. Roof Ribbed Parapet Drum + Low Curved Roof Cap + Standing "T·Mobile ARENA" Roof Letters
  mg.add(
    arenaRibbonGeo(
      sample(48, Math.PI, -Math.PI, (a) => {
        const [lx, lz] = pt(SKIN_RX - 0.15, SKIN_RZ - 0.15, a);
        return [lx, 17.5, lz];
      }),
      sample(48, Math.PI, -Math.PI, (a) => {
        const [lx, lz] = pt(SKIN_RX - 0.55, SKIN_RZ - 0.55, a);
        return [lx, 19.05, lz];
      }),
      18,
      0.5,
      true
    ),
    bronzeSkin
  );
  // Low oval roof cap (light, like the real one from the air)
  const roofCap = new THREE.Mesh(new THREE.CylinderGeometry(SKIN_RX - 1.4, SKIN_RX - 0.55, 1.3, 40, 1), mat(0xc9ccd0, 0.62, 0.25)); // the real roof is a pale silver-white
  roofCap.scale.set(1, 1, (SKIN_RZ - 0.55) / (SKIN_RX - 0.55));
  roofCap.position.set(ARENA_X, 19.7, ARENA_Z);
  roofCap.rotation.y = ARENA_YAW;
  b.add(roofCap);

  // Standing silver/white "T·Mobile ARENA" letters along roof edge directly above the LED screen
  const lettersTex = makeRoofLettersTex();
  const lettersMat = new THREE.MeshStandardMaterial({
    map: lettersTex,
    emissiveMap: lettersTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.38,
    alphaTest: 0.35,
    roughness: 0.28,
    metalness: 0.6,
    side: THREE.DoubleSide,
  });
  b.nightGlow(lettersMat, 0.38, 1.0);
  // Front glowing silver face + subtle dark backing 0.18 m behind for 3D depth (u=0 LEFT -> u=1 RIGHT)
  mg.add(
    arenaRibbonGeo(
      sample(18, 0.37, -0.35, (a) => {
        const [lx, lz] = pt(SKIN_RX - 0.18, SKIN_RZ - 0.18, a);
        return [lx, 19.0, lz];
      }),
      sample(18, 0.37, -0.35, (a) => {
        const [lx, lz] = pt(SKIN_RX - 0.18, SKIN_RZ - 0.18, a);
        return [lx, 21.6, lz];
      }),
      1,
      1,
      true
    ),
    lettersMat
  );
  const lettersBackMat = new THREE.MeshBasicMaterial({ map: lettersTex, color: 0x262830, alphaTest: 0.35, side: THREE.DoubleSide });
  mg.add(
    arenaRibbonGeo(
      sample(18, 0.37, -0.35, (a) => {
        const [lx, lz] = pt(SKIN_RX - 0.36, SKIN_RZ - 0.36, a);
        return [lx, 19.0, lz];
      }),
      sample(18, 0.37, -0.35, (a) => {
        const [lx, lz] = pt(SKIN_RX - 0.36, SKIN_RZ - 0.36, a);
        return [lx, 21.6, lz];
      }),
      1,
      1,
      true
    ),
    lettersBackMat
  );
  // Structural steel rails behind the standing roof letters
  for (const ry of [19.75, 20.65]) {
    mg.add(
      arenaRibbonGeo(
        sample(18, 0.36, -0.34, (a) => {
          const [lx, lz] = pt(SKIN_RX - 0.42, SKIN_RZ - 0.42, a);
          return [lx, ry - 0.04, lz];
        }),
        sample(18, 0.36, -0.34, (a) => {
          const [lx, lz] = pt(SKIN_RX - 0.42, SKIN_RZ - 0.42, a);
          return [lx, ry + 0.04, lz];
        }),
        1,
        1,
        true
      ),
      silverFrame
    );
  }

  // ---- 6. Giant Curved Living LED Screen (y = 11.3 .. 17.6, wrapping upper front bowl)
  const ledCanvas = document.createElement('canvas');
  ledCanvas.width = 1024;
  ledCanvas.height = 256;
  const ledCtx = ledCanvas.getContext('2d')!;
  const ledTex = new THREE.CanvasTexture(ledCanvas);
  ledTex.colorSpace = THREE.SRGBColorSpace;
  ledTex.anisotropy = 4;

  const drawArenaLed = (localSec: number, nightVal: number) => {
    const cycle = localSec % 28;
    const w = 1024;
    const h = 256;
    if (cycle < 12 || cycle >= 22) {
      // Primary Resting Slide: Iconic hot-magenta "WELCOME TO T·Mobile ARENA" with white swoosh
      const g = ledCtx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#c62472');
      g.addColorStop(0.35, '#e23a8c');
      g.addColorStop(0.7, '#d82c80');
      g.addColorStop(1, '#bd1e6a');
      ledCtx.fillStyle = g;
      ledCtx.fillRect(0, 0, w, h);

      // Subtle living shimmer sweep across the magenta surface
      const sweepX = ((localSec * 90) % (w + 300)) - 150;
      const sg = ledCtx.createLinearGradient(sweepX - 140, 0, sweepX + 140, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,210,234,0.1)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ledCtx.fillStyle = sg;
      ledCtx.fillRect(0, 0, w, h);

      drawTMobileWordmark(ledCtx, w * 0.5, h * 0.78, 1.32, '#ffffff', true, true);
    } else if (cycle < 17) {
      // Slide 2: Vegas Golden Knights promo
      const g = ledCtx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#101216');
      g.addColorStop(0.55, '#2b2414');
      g.addColorStop(1, '#101216');
      ledCtx.fillStyle = g;
      ledCtx.fillRect(0, 0, w, h);
      ledCtx.fillStyle = '#c8a038';
      ledCtx.fillRect(0, 0, w, 10);
      ledCtx.fillRect(0, h - 10, w, 10);
      ledCtx.fillStyle = '#c8a038';
      ledCtx.beginPath();
      ledCtx.moveTo(150, 44);
      ledCtx.lineTo(222, 44);
      ledCtx.lineTo(222, 138);
      ledCtx.lineTo(186, 208);
      ledCtx.lineTo(150, 138);
      ledCtx.closePath();
      ledCtx.fill();
      ledCtx.fillStyle = '#14161b';
      ledCtx.beginPath();
      ledCtx.moveTo(164, 64);
      ledCtx.lineTo(208, 64);
      ledCtx.lineTo(186, 168);
      ledCtx.closePath();
      ledCtx.fill();

      ledCtx.textAlign = 'left';
      ledCtx.textBaseline = 'middle';
      ledCtx.fillStyle = '#f2d06b';
      ledCtx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
      ledCtx.fillText('THE FORTRESS • T-MOBILE ARENA', 265, 74);
      ledCtx.fillStyle = '#ffffff';
      ledCtx.font = '900 54px "Segoe UI", Arial, sans-serif';
      ledCtx.fillText('VEGAS GOLDEN KNIGHTS', 265, 136, 710);
      ledCtx.fillStyle = '#c8a038';
      ledCtx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
      ledCtx.fillText('HOME ICE • PUCK DROP 7:00 PM', 265, 194);
    } else {
      // Slide 3: Live Events & Concerts promo
      const g = ledCtx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#140822');
      g.addColorStop(0.5, '#680848');
      g.addColorStop(1, '#1a0a2e');
      ledCtx.fillStyle = g;
      ledCtx.fillRect(0, 0, w, h);
      ledCtx.fillStyle = '#e20074';
      ledCtx.fillRect(0, h - 12, w, 12);
      ledCtx.textAlign = 'center';
      ledCtx.textBaseline = 'middle';
      ledCtx.fillStyle = '#ff68b8';
      ledCtx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
      ledCtx.fillText('WORLD TOUR • CHAMPIONSHIP FIGHT NIGHT • LIVE', w / 2, 66);
      ledCtx.fillStyle = '#ffffff';
      ledCtx.font = '900 62px "Segoe UI", Arial, sans-serif';
      ledCtx.fillText('LIVE AT T-MOBILE ARENA', w / 2, 136, 920);
      ledCtx.fillStyle = '#ffd25a';
      ledCtx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
      ledCtx.fillText('DOORS 6:30 PM • TICKETS AT BOX OFFICE', w / 2, 198);
    }
    // Subtle physical LED dot matrix texture
    ledCtx.fillStyle = `rgba(0,0,0,${0.08 * (1 - nightVal * 0.4)})`;
    for (let y = 0; y < h; y += 4) ledCtx.fillRect(0, y, w, 1);
    ledTex.needsUpdate = true;
  };

  drawArenaLed(0, 0.5);
  const screenMat = new THREE.MeshStandardMaterial({
    map: ledTex,
    emissiveMap: ledTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.54,
    roughness: 0.38,
  });
  b.nightGlow(screenMat, 0.54, 0.76);
  // Sample LEFT (+0.54/+0.58) -> RIGHT (-0.52/-0.56) so text reads left-to-right!
  const ledMesh = new THREE.Mesh(
    arenaRibbonGeo(
      sample(28, 0.54, -0.52, (a) => {
        const [lx, lz] = pt(SKIN_RX + 0.58, SKIN_RZ + 0.58, a);
        return [lx, 11.3, lz];
      }),
      sample(28, 0.58, -0.56, (a) => {
        const [lx, lz] = pt(SKIN_RX + 0.25, SKIN_RZ + 0.25, a);
        return [lx, 17.55, lz];
      }),
      1,
      1,
      true
    ),
    screenMat
  );
  b.add(ledMesh);

  let nearSeconds = 0;
  let lastLedFrame = -1;
  b.every((dt, _t, night) => {
    const dx = viewer.cam.x - ARENA_X;
    const dz = viewer.cam.z - ARENA_Z;
    if (dx * dx + dz * dz > 240 * 240) {
      nearSeconds = 0;
      return;
    }
    nearSeconds += dt;
    const frame = Math.floor(nearSeconds * 4);
    if (frame !== lastLedFrame) {
      lastLedFrame = frame;
      drawArenaLed(nearSeconds, night);
    }
  });

  // Freeway-facing west rooftop sign (visible from I-15 & Dean Martin Dr)
  const westPt = arenaToWorld(-SKIN_RX + 1.2, 20.6, 0);
  signBoard(b, 'T-MOBILE ARENA', '#140812', '#ff2d95', 16, 2.4, westPt[0], westPt[1], westPt[2], -Math.PI / 2 + ARENA_YAW, 'NEXT EXIT • TROPICANA AVE');

  // ---- 7. Vivid Magenta Under-Deck Wash Lights & Plaza Glow
  for (const la of [-0.1, 0.45, 0.86]) {
    const lp = pt(LOBBY_RX + deckOverhang(la) * 0.62, LOBBY_RZ + deckOverhang(la) * 0.62, la);
    const lw = arenaToWorld(lp[0], 5.1, lp[1]);
    b.light(0xff148c, 18, 25, lw[0], lw[1], lw[2], 0.28);
  }
  b.light(0xffb86a, 18, 22, -96, 8, 368, 0.15);

  // Colliders & map metadata
  b.collider(ARENA_X - 20.2, ARENA_X + 20.2, ARENA_Z - 25.6, ARENA_Z + 25.6, 0, 21, true);
  b.building(ARENA_X, ARENA_Z, ARENA_RX * 2, ARENA_RZ * 2, '#9a683a', 'T-Mobile Arena');
  b.zone('T-Mobile Arena', ARENA_X - 24, ARENA_X + 26, ARENA_Z - 28, ARENA_Z + 28);
  const pkPt = arenaToWorld(LOBBY_RX + 3.2, 1.25, 0);
  b.pickup(pkPt[0], pkPt[1], pkPt[2], 4, 'T-Mobile Arena VIP Pack', false);
}

// ================================================================ Arena BOH & Frank Sinatra Dr South

function buildFrankSinatraArenaSection(b: WorldBuilder, mg: Merger): void {
  // Ground pad beneath Arena back-of-house, Sinatra Substation, Bruno Mars Dr & Arena Dr (extending backOfHouse cleanly)
  const BOH_X0 = -173;
  const BOH_X1 = -114;
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(BOH_X1 - BOH_X0, 86),
    mat(0x6e6a62, 0.92)
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set((BOH_X0 + BOH_X1) / 2, L0 - 0.004, 396);
  apron.receiveShadow = true;
  b.add(apron);

  // Frank Sinatra Dr continuing seamlessly south from z = 354 (-166.5) -> z = 540 (passing under Tropicana Bridge 442.7)
  const FS_X = -165.5;
  flatRoad(b, FS_X, 447, 11, 190, 'z', 4, true, L1, 'Frank Sinatra Dr');
  b.zone('Frank Sinatra Dr (Arena)', FS_X - 5.5, FS_X + 5.5, 353, 540);

  // Sidewalks & Cobra streetlights (carefully clearing Tropicana Bridge deck around z = 428..458!)
  const walkMat = mat(0xa8a296, 0.88);
  mg.box(walkMat, FS_X + 6.5, L1 * 0.5, 447, 2.0, L1, 190);
  const poolMat = lightPoolMat(true);
  const pools = new Merger();
  for (let z = 362; z <= 532; z += 34) {
    if (Math.abs(z - 442.7) < 16) continue;
    cobraPoleInto(mg, b, FS_X + 6.2, z, -Math.PI / 2, 9.2, 2.4);
    const p = new THREE.PlaneGeometry(11, 11);
    p.rotateX(-Math.PI / 2);
    p.translate(FS_X, L1 + 0.015, z);
    pools.add(p, poolMat);
  }
  pools.flush(b);

  // Bruno Mars Dr (connecting Park MGM Garage south edge -> Frank Sinatra Dr at z = 358)
  flatRoad(b, -137, 358, 8.0, 46, 'x', 2, true, L1 + 0.005, 'Bruno Mars Dr');

  // Arena Dr (connecting Arena South dock & NYNY rear -> Frank Sinatra Dr at z = 425)
  flatRoad(b, -134, 425, 8.5, 54, 'x', 2, true, L1 + 0.005, 'Arena Dr');

  // Sinatra Substation (architecturally screened enclosure west of Arena S-W, z = 408..420)
  addBuilding(b, mg, { x: -157.5, z: 414.5, w: 4.5, d: 9.0, h: 4.5, wall: 0x8f887d, trim: 0x5c5850, label: 'Sinatra Substation' });
  chainFenceInto(b, mg, -160.2, 409.5, -160.2, 419.5, 2.8);

  // Event & Team Production Parking + Loading Dock south of Arena Dr (z = 428..434, x = -158..-118)
  const lot = new ParkedLotBuilder();
  lot.bays(-155, -118, 429, 434, 8, 2, 0, 0.68, 429);
  lot.emit(b, -136, 431, 280);
  b.zone('Arena Event Lot', -158, -116, 426, 436);

  // Arena production truck parked on Arena Dr
  const truck = car('suv', 0x22252b);
  truck.group.position.set(-148, 0, 419.5);
  truck.group.rotation.y = Math.PI / 2;
  b.add(truck.group);
}

// ================================================================ Event-Night Arena Crowds

function buildArenaPlazaCrowds(b: WorldBuilder): void {
  const mk = (seed: number, x: number, z: number, rot = 0): Person & { speed: number; phase: number } => {
    const R = WEST_RNG(seed);
    // Mix Golden Knights gold/black, T-Mobile magenta, concert black & casual Vegas shirts
    const shirts = [0xd4a43a, 0x1a1c22, 0xe20074, ...GUEST_SHIRTS];
    return {
      x,
      z,
      rot,
      shirt: shirts[Math.floor(R() * shirts.length)],
      speed: 1.15 + R() * 0.55,
      phase: R(),
    };
  };

  // Closed walking loop of 34 fans streaming along The Park <-> Toshiba Plaza <-> Arena Atrium
  const walkersGroup = new THREE.Group();
  const loop: Array<[number, number]> = [
    [-25, 355],
    [-64, 356],
    [-92, 366],
    [-110, 392],
    [-108, 376],
    [-76, 361],
    [-32, 358],
  ];
  const people = Array.from({ length: 34 }, (_, i) => mk(800 + i, -60, 360));
  const walkers = new Walkers(walkersGroup, 'stand', people, loop);
  b.scene.add(walkersGroup);

  // Standing crowd outside Toshiba Plaza stage & Arena Glass Atrium
  const fans: Person[] = [];
  const FR = WEST_RNG(912);
  for (let i = 0; i < 24; i++) {
    const isStage = i < 12;
    const x = isStage ? -103 + (FR() - 0.5) * 9 : -111 + (FR() - 0.5) * 4;
    const z = isStage ? 371.5 + (FR() - 0.5) * 4.5 : 394 + (FR() - 0.5) * 14;
    fans.push({
      x,
      z,
      rot: isStage ? Math.PI + (FR() - 0.5) * 0.6 : -Math.PI / 2 + (FR() - 0.5) * 0.7,
      shirt: [0xd4a43a, 0x1a1c22, 0xe20074, ...GUEST_SHIRTS][Math.floor(FR() * (3 + GUEST_SHIRTS.length))],
    });
  }
  const standGroup = new THREE.Group();
  buildPeople(standGroup, 'stand', fans);
  b.scene.add(standGroup);

  const cull2 = 175 * 175;
  b.every((_dt, t) => {
    const dx = viewer.cam.x + 86;
    const dz = viewer.cam.z - 375;
    const vis = dx * dx + dz * dz < cull2;
    walkersGroup.visible = vis;
    standGroup.visible = vis;
    if (vis) walkers.update(t);
  });

  // Interactive sidewalk/plaza tourists lou can beg/bump
  b.crowd.tourists.push(
    { pts: [[-24, 354], [-78, 362], [-109, 392]], prop: 'yard-drink' },
    { pts: [[-109, 386], [-88, 366], [-45, 354]], prop: 'camera' },
    { pts: [[-80, 364], [-104, 368], [-106, 382]], prop: 'cig' },
    { pts: [[-34, 349], [-72, 350], [-97, 359]], prop: 'bag' }
  );
}
