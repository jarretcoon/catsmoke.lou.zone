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

const ARENA_X = -135;
const ARENA_Z = 394;
const ARENA_RX = 20.5;
const ARENA_RZ = 23.0;

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
  paving(b, -97, -116, 376, 421, '#b8ab98', '#968976', 4, L0);
  paving(b, -86, -98, 376, 396, '#b8ab98', '#968976', 4, L0);

  // Extended Corten weathered-steel perforated shade canopies matching southStrip.ts
  const steel = mat(0x7a5a40, 0.8, 0.4);
  const perf = mat(0x8a6a4a, 0.75, 0.35, { side: THREE.DoubleSide });
  for (const [tx, tz] of [
    [-70, 355],
    [-82, 352],
    [-74, 369],
    [-95, 372],
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

  // Desert trees & agave beds along the walk
  for (const [tx, tz, sc, sd] of [
    [-66, 368, 1.15, 2],
    [-91, 355, 1.1, 4],
    [-108, 368, 1.2, 5],
    [-110, 408, 1.1, 7],
  ] as Array<[number, number, number, number]>) {
    treeClusterInto(mg, tx, tz, sc, sd);
  }
  let pSeed = 310;
  for (const [px, pz] of [
    [-77, 373],
    [-89, 374],
    [-109, 359],
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

  buildStage(-103, 364.5, 8.2, 4.8, 0.42, 'TOSHIBA PLAZA', magenta);
  buildStage(-86, 374.5, 6.4, 4.0, -0.35, 'FAN ZONE STAGE', stageGlow);

  // ---- Terraced plaza stone seating planters & festival truss light towers
  const stone = mat(0x9a8f80, 0.8);
  for (const [bx, bz, bw, bd] of [
    [-93, 366.2, 5.2, 1.4],
    [-99, 376.5, 5.0, 1.4],
    [-108, 381.0, 4.2, 1.4],
  ]) {
    mg.box(stone, bx, 0.35, bz, bw, 0.7, bd);
    b.collider(bx - bw / 2, bx + bw / 2, bz - bd / 2, bz + bd / 2, 0, 0.7);
  }
  // 4 festival light & banner pylons ringing Toshiba Plaza
  for (const [lx, lz] of [
    [-81, 359],
    [-98, 362],
    [-104, 377],
    [-82, 375],
  ]) {
    mg.beam(truss, v3(lx, 0, lz), v3(lx, 10.5, lz), 0.18, 6, 0.16);
    mg.box(magenta, lx, 8.5, lz, 0.5, 2.4, 0.5);
    mg.box(basic(0xfff0d4), lx, 10.7, lz, 0.9, 0.4, 0.9);
    b.collider(lx - 0.25, lx + 0.25, lz - 0.25, lz + 0.25, 0, 10.5, true);
  }

  // Plaza feature + zone + map label
  b.feature({ kind: 'park', x: -97, z: 369, w: 32, d: 28, color: '#bfa88a', label: 'Toshiba Plaza' });
  b.zone('Toshiba Plaza', -115, -78, 357, 389);
  b.pickup(-103, 1.25, 364.5, 3, 'Toshiba Plaza Stage Pack', false);
}

// ================================================================ T-Mobile Arena Architecture

function buildArenaStructure(b: WorldBuilder, mg: Merger): void {
  const N = 32;
  const H = 22.0;

  // Materials: Populous "Desert Side" copper/bronze sedimentary cladding + dark slate + Strip-side glass
  const bronzeShingle = [
    mat(0x8d5730, 0.36, 0.74),
    mat(0xc18a3f, 0.32, 0.78),
    mat(0x633b22, 0.42, 0.68),
    mat(0xd4a456, 0.3, 0.8),
  ];
  const darkSteel = mat(0x1b1e25, 0.38, 0.78);
  const lightRoof = mat(0xd2d6dc, 0.42, 0.58);
  const concourseGlow = new THREE.MeshStandardMaterial({
    color: 0x262834,
    emissive: 0xffc980,
    emissiveIntensity: 0.32,
    roughness: 0.3,
  });
  b.nightGlow(concourseGlow, 0.32, 0.72);

  const atriumGlass = new THREE.MeshStandardMaterial({
    color: 0x385874,
    roughness: 0.08,
    metalness: 0.72,
    transparent: true,
    opacity: 0.56,
  });
  const magentaFin = new THREE.MeshStandardMaterial({
    color: 0xe20074,
    emissive: 0xe20074,
    emissiveIntensity: 0.45,
    roughness: 0.25,
  });
  b.nightGlow(magentaFin, 0.4, 1.35);

  // Ellipse point helper (angle 0 = +x east facing Toshiba Plaza)
  const pt = (rx: number, rz: number, a: number): [number, number] => [ARENA_X + Math.cos(a) * rx, ARENA_Z + Math.sin(a) * rz];

  // Inner lit drum + concourse core (slightly inset behind glass & bronze panels)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(18.6, 18.2, H - 1.2, 28, 1), concourseGlow);
  core.scale.set(ARENA_RX / 20.5, 1, ARENA_RZ / 20.5);
  core.position.set(ARENA_X, (H - 1.2) / 2, ARENA_Z);
  b.add(core);

  // Segmented outer facade: Strip Side (angle -1.25..+1.15 rad: E/NE glass atrium) vs Desert Side (copper/gold bands)
  for (let i = 0; i < N; i++) {
    const a0 = -Math.PI + (i / N) * Math.PI * 2;
    const a1 = -Math.PI + ((i + 1) / N) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const isAtrium = Math.abs(am) < 1.15;

    const p0 = pt(ARENA_RX, ARENA_RZ, a0);
    const p1 = pt(ARENA_RX, ARENA_RZ, a1);
    const xm = (p0[0] + p1[0]) / 2;
    const zm = (p0[1] + p1[1]) / 2;
    const segLen = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 0.15;
    const yaw = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);

    if (isAtrium) {
      // Sweeping 85-ft Strip-side glass curtain wall + bronze mullions + open entry band
      const isEntryDoor = Math.abs(am) < 0.42;
      if (!isEntryDoor) {
        mg.box(atriumGlass, xm, H / 2, zm, 0.18, H, segLen, yaw);
      } else {
        // Upper glass atrium above 5m entrance doors + warm recessed portal frame
        mg.box(atriumGlass, xm, 5 + (H - 5) / 2, zm, 0.18, H - 5, segLen, yaw);
      }
      // Structural steel/magenta fin mullions between bays
      const finMat = i % 2 === 0 ? magentaFin : darkSteel;
      mg.box(finMat, p0[0], H / 2, p0[1], 0.42, H + 0.4, 0.36, am);
      // Second-level exterior concourse floor band visible through glass
      mg.box(darkSteel, xm, 7.2, zm, 0.9, 0.45, segLen, yaw);
      mg.box(darkSteel, xm, 14.2, zm, 0.7, 0.35, segLen, yaw);
    } else {
      // Desert Side: solid inner wall + 5 stacked bronze/copper/gold sedimentary undulating horizontal tiers
      mg.box(darkSteel, xm, H / 2, zm, 0.6, H, segLen, yaw, true);
      for (let tier = 0; tier < 5; tier++) {
        const th = 3.8;
        const ty = 2.0 + tier * 4.2;
        const wave = Math.sin(am * 3 + tier * 1.1) * 0.45;
        const bPt0 = pt(ARENA_RX + 0.55 + wave, ARENA_RZ + 0.55 + wave, a0);
        const bPt1 = pt(ARENA_RX + 0.55 + wave, ARENA_RZ + 0.55 + wave, a1);
        const bx = (bPt0[0] + bPt1[0]) / 2;
        const bz = (bPt0[1] + bPt1[1]) / 2;
        const blen = Math.hypot(bPt1[0] - bPt0[0], bPt1[1] - bPt0[1]) + 0.2;
        mg.box(bronzeShingle[(tier + (i % 2)) % bronzeShingle.length], bx, ty, bz, 0.75, th, blen, yaw, true);
      }
      // Accent bronze vertical ribs every 2 panels
      if (i % 2 === 0) mg.box(darkSteel, p0[0], H / 2, p0[1], 0.45, H, 0.35, am);
    }
  }

  // ---- Signature Y-Shaped Structural Super-Columns on East / NE Atrium
  for (const ang of [-0.95, -0.58, -0.2, 0.2, 0.58, 0.95]) {
    const base = pt(ARENA_RX + 1.8, ARENA_RZ + 1.8, ang);
    const split = v3(base[0], 7.4, base[1]);
    const nx = Math.cos(ang);
    const nz = Math.sin(ang);
    mg.beam(darkSteel, v3(base[0], 0, base[1]), split, 0.34, 8, 0.28, true);
    // Two diagonal Y arms sweeping up to roof fascia & balcony
    mg.beam(darkSteel, split, v3(base[0] + nx * 1.2 - nz * 1.4, H + 0.2, base[1] + nz * 1.2 + nx * 1.4), 0.22, 6, 0.18);
    mg.beam(darkSteel, split, v3(base[0] + nx * 1.2 + nz * 1.4, H + 0.2, base[1] + nz * 1.2 - nx * 1.4), 0.22, 6, 0.18);
    b.collider(base[0] - 0.45, base[0] + 0.45, base[1] - 0.45, base[1] + 0.45, 0, 8, true);
  }

  // ---- Sweeping Oval Cantilevered Roof Canopy + Crown Drum + Rooftop "T-MOBILE ARENA" Signs
  const canopyOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_RX + 3.4, ARENA_RX + 2.0, 1.3, 36, 1),
    darkSteel
  );
  canopyOuter.scale.set(1, 1, (ARENA_RZ + 3.0) / (ARENA_RX + 3.4));
  canopyOuter.position.set(ARENA_X, H + 0.65, ARENA_Z);
  canopyOuter.castShadow = true;
  b.add(canopyOuter);

  const upperCrown = new THREE.Mesh(new THREE.CylinderGeometry(16.5, 19.2, 3.6, 32, 1), lightRoof);
  upperCrown.scale.set(1, 1, ARENA_RZ / ARENA_RX);
  upperCrown.position.set(ARENA_X, H + 3.0, ARENA_Z);
  b.add(upperCrown);

  // Magenta perimeter roof LED halo ring
  const halo = new THREE.TorusGeometry(ARENA_RX + 3.45, 0.16, 6, 48);
  halo.rotateX(Math.PI / 2);
  halo.scale(1, 1, (ARENA_RZ + 3.05) / (ARENA_RX + 3.45));
  mg.at(magentaFin, halo, ARENA_X, H + 0.65, ARENA_Z);

  // ---- Projecting Second-Level Exterior VIP Balconies & Overhead Plaza Stage
  const balcMat = mat(0x282b33, 0.4, 0.72);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x9fc8e8, transparent: true, opacity: 0.45, roughness: 0.1 });
  const balcPt = pt(ARENA_RX + 2.6, ARENA_RZ + 2.6, -0.05);
  mg.box(balcMat, balcPt[0], 7.0, balcPt[1], 5.6, 0.55, 15.0, -0.05, true);
  mg.box(magentaFin, balcPt[0] + 2.85, 7.0, balcPt[1], 0.14, 0.25, 15.0, -0.05);
  mg.box(railMat, balcPt[0] + 2.75, 7.8, balcPt[1], 0.1, 1.0, 14.8, -0.05);
  signBoard(b, 'ARENA STAGE • LIVE', '#120814', '#ffffff', 9.0, 1.15, balcPt[0] + 2.95, 7.05, balcPt[1], Math.PI / 2, 'VIP TERRACE & FAN OVERLOOK', 0.14);

  // ---- Signature Ground Atrium Entrance Canopy & Bollard Plaza facing East/NE (-113, 393)
  const entPt = pt(ARENA_RX + 2.2, ARENA_RZ + 2.2, -0.02);
  mg.box(darkSteel, entPt[0], 4.5, entPt[1], 5.4, 0.55, 13.5, -0.02, true);
  mg.box(magentaFin, entPt[0] + 2.72, 4.5, entPt[1], 0.16, 0.22, 13.5, -0.02);
  signBoard(b, 'T-MOBILE ARENA', '#140812', '#ff2d95', 12.2, 1.95, entPt[0] + 2.85, 5.1, entPt[1], Math.PI / 2, 'LAS VEGAS • HOME OF CHAMPIONS');
  // Security bollards in front of main doors
  const bollardMat = mat(0x282b32, 0.4, 0.78);
  for (let z = 385.5; z <= 401.5; z += 2.2) {
    mg.beam(bollardMat, v3(-111.5, 0, z), v3(-111.5, 0.9, z), 0.14, 8);
    b.collider(-111.7, -111.3, z - 0.18, z + 0.18, 0, 0.9, true);
  }

  // ---- Massive ~9,000 sq ft Exterior Curved/Angled LED Media Mesh facing Toshiba Plaza & The Park
  const arenaLed = new LedBoard(
    'T-MOBILE ARENA',
    ['GOLDEN KNIGHTS HOCKEY', 'UFC FIGHT NIGHT LIVE', 'WORLD TOUR CONCERT', 'THE PARK • TOSHIBA PLAZA'],
    ['#b8923a', '#d81e2a', '#e20074', '#1e78d4'],
    512,
    256
  ).withShows([
    { name: 'VEGAS GOLDEN KNIGHTS', sub: 'PUCK DROP 7 PM • FORTRESS', color: '#9a7a2c', art: 'singer' },
    { name: 'ARENA WORLD TOUR', sub: 'SOLD OUT • DOORS 6:30 PM', color: '#8a0a5a', art: 'dj' },
    { name: 'CHAMPIONSHIP BOUT', sub: 'MAIN CARD • LIVE TONIGHT', color: '#8e1420', art: 'cirque' },
  ]);
  const ledFace = new THREE.MeshBasicMaterial({ map: arenaLed.tex });
  const ledGroup = new THREE.Group();
  // Two slightly curved giant fascia panels facing NE (-0.35 rad) directly toward Toshiba Plaza & The Park
  const panelAngles = [-0.62, -0.22];
  for (const ang of panelAngles) {
    const p = pt(ARENA_RX + 1.15, ARENA_RZ + 1.15, ang);
    const pm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 7.6, 10.2), [ledFace, darkSteel, darkSteel, darkSteel, darkSteel, darkSteel]);
    pm.position.set(p[0], 14.8, p[1]);
    pm.rotation.y = -ang;
    ledGroup.add(pm);
  }
  b.add(ledGroup);
  arenaLed.at(ARENA_X + 18, 14.8, ARENA_Z - 6);
  b.every((_dt, t) => arenaLed.draw(t));

  // Freeway-facing west rooftop crown sign (facing I-15 NB/SB commuters)
  signBoard(b, 'T-MOBILE ARENA', '#140812', '#ff2d95', 18, 3.0, ARENA_X - ARENA_RX * 0.88, H + 3.2, ARENA_Z, -Math.PI / 2, 'NEXT EXIT • TROPICANA AVE');

  // Night magenta/amber architectural light wash onto Toshiba Plaza (two selective spots/lights)
  b.light(0xe20074, 0, 26, ARENA_X + ARENA_RX + 4, 9, ARENA_Z - 5);
  b.light(0xffb86a, 0, 22, -96, 8, 368);

  // Cylinder approximation collider + world map building + zone
  b.collider(ARENA_X - ARENA_RX - 0.8, ARENA_X + ARENA_RX + 0.8, ARENA_Z - ARENA_RZ - 0.8, ARENA_Z + ARENA_RZ + 0.8, 0, H + 4, true);
  b.building(ARENA_X, ARENA_Z, ARENA_RX * 2, ARENA_RZ * 2, '#9a683a', 'T-Mobile Arena');
  b.zone('T-Mobile Arena', ARENA_X - ARENA_RX - 3, ARENA_X + ARENA_RX + 4, ARENA_Z - ARENA_RZ - 3, ARENA_Z + ARENA_RZ + 4);
  b.pickup(-113.5, 1.25, 394, 4, 'T-Mobile Arena VIP Pack', false);
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

  // Bruno Mars Dr (connecting Park MGM Garage south edge -> Frank Sinatra Dr at z = 360)
  flatRoad(b, -137, 360, 8.5, 46, 'x', 2, true, L1 + 0.005, 'Bruno Mars Dr');

  // Arena Dr (connecting Arena South dock & NYNY rear -> Frank Sinatra Dr at z = 423)
  flatRoad(b, -134, 423, 9, 54, 'x', 2, true, L1 + 0.005, 'Arena Dr');

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
