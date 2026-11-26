import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { stairs, tower } from './buildings';
import { buildCasinoFloor } from './casinos';
import { LedBoard, makeBalloonTexture, makePaverTexture } from './textures';
import { buildAbcStore } from './abcStore';
import { buildInNOut } from './food';
import { buildVenetianInteriors } from './grandVenetian';
import { buildSphereVenue } from './sphere';
import { flamingoSigns, harrahsSigns, horseshoeSigns, linqSigns, palazzoSigns, parisBalloonGlow, planetHollywoodSigns, venetianSigns } from './stripSigns';
import { barCounter, basic, bench, blackjackTable, flamingoBird, mat, mesh, neonSign, palmTree, planter } from './props';
import { casinoRoyaleFront, dogesPalaceFront, palazzoFront, parisFront } from './stripFronts';

/**
 * East side of Las Vegas Blvd, south → north:
 * Planet Hollywood/Miracle Mile · Paris · Horseshoe + Grand Bazaar · [Flamingo Rd] · The Vanderpump ·
 * Flamingo · LINQ Promenade + High Roller · LINQ · Harrah's/Carnaval Court · Casino Royale · Venetian · Palazzo · (Sphere)
 */
export function buildEastSide(b: WorldBuilder): void {
  buildPlanetHollywood(b);
  buildParis(b);
  buildHorseshoe(b);
  buildVanderpump(b);
  buildFlamingo(b);
  buildLinq(b);
  buildHarrahs(b);
  buildVenetian(b);
  buildSphere(b);
  buildPalazzo(b);
}

function plaza(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, base = '#d8ccb4', joint = '#bfb197'): void {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  const m = new THREE.MeshStandardMaterial({ map: makePaverTexture(base, joint, 4), roughness: 0.8 });
  m.map!.repeat.set(w / 4, d / 4);
  b.floor((x0 + x1) / 2, (z0 + z1) / 2, w, d, m, 0.01);
}

function storefront(b: WorldBuilder, x: number, z: number, w: number, d: number, h: number, wall: number, name: string, fg: string, bg: string, facing: number): void {
  b.box(x, 0, z, w, h, d, mat(wall, 0.7), true);
  const sign = neonSign(name, bg, fg, Math.min(w, d === 0 ? w : w) * 0.85, 1.0, undefined, 0.1);
  const off = (facing === 0 ? d : facing === Math.PI ? d : w) / 2 + 0.08;
  b.add(sign, x + Math.sin(facing) * off, h - 1.1, z + Math.cos(facing) * off, facing);
  const glass = mesh(new THREE.PlaneGeometry(w * 0.7, 2.4), mat(0x1c2a3a, 0.1, 0.8, { emissive: 0xffd9a0, emissiveIntensity: 0.25 }), x + Math.sin(facing) * (off - 0.05), 1.4, z + Math.cos(facing) * (off - 0.05));
  glass.rotation.y = facing;
  b.add(glass);
}

// ---------------------------------------------------------------- Planet Hollywood / Miracle Mile (+ ABC Stores)
function buildPlanetHollywood(b: WorldBuilder): void {
  const pod = mat(0x24242c, 0.5, 0.4);
  b.box(41.5, 0, 130, 41, 14, 28, pod, true);
  b.box(41.5, 0, 189, 41, 14, 34, pod, true);
  b.box(51, 0, 158, 22, 14, 28, pod, true);
  b.box(30.5, 7, 158, 19, 7, 28, pod, true);

  // Giant LED screens wrap the Strip front
  const boards = [
    new LedBoard('PLANET HOLLYWOOD', ['MIRACLE MILE SHOPS', 'ABC STORES INSIDE', 'LIVE • 7 NIGHTS', 'HAPPY HOUR 2–6'], ['#ff2c6a', '#00c2ff', '#ffb000', '#8c2cff'], 256, 512),
    new LedBoard('MIRACLE MILE', ['170 SHOPS & RESTAURANTS', 'SALE • SALE • SALE', 'V THEATER', 'OPEN LATE'], ['#00e0a0', '#ff4aa8', '#ffd000', '#3a7bff'], 256, 512),
  ];
  boards.forEach((led, i) => {
    const z = i === 0 ? 130 : 190;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(i === 0 ? 24 : 30, 12), new THREE.MeshBasicMaterial({ map: led.tex }));
    m.rotation.y = -Math.PI / 2;
    b.add(m, 20.9, 7.5, z);
    led.at(20.9, 7.5, z); // only redraws while the camera is near
    b.every((_dt, t) => led.draw(t + i * 3));
  });
  planetHollywoodSigns(b); // white block letters with pink tubes, podium + tower (stripSigns.ts)

  // ABC Stores #103 at the Miracle Mile front (real: Miracle Mile Shops)
  buildAbcStore(b, 30.5, 158, -Math.PI / 2, { label: 'ABC Stores #103 (Miracle Mile)', w: 26, d: 18 });

  const phSkin = { wall: '#1b1d24', mullion: '#3a3d48', glass: '#2c3a4a', lit: '#ffeacc', cols: 10, rows: 22, style: 1 as const, seed: 61 };
  tower(b, { x: 95, z: 153, w: 18, d: 46, h: 37, facade: phSkin });
  tower(b, { x: 120, z: 190, w: 14, d: 26, h: 57, facade: { ...phSkin, wall: '#5d6b78', glass: '#4b5c6c', seed: 63 }, metal: 0.5 });
  b.building(41.5, 160, 41, 90, '#24242c', 'Planet Hollywood');
  b.building(95, 153, 18, 46, '#1b1d24');
  b.zone('Planet Hollywood & Miracle Mile', 19, 140, 114, 208);
  b.crowd.performers.push({ kind: 'elvis', x: 16.5, z: 140, facing: -Math.PI / 2 }, { kind: 'slapper', x: 15.5, z: 182, facing: -Math.PI / 2 });
  b.crowd.tourists.push(
    { pts: [[16, 118], [16, 204]], prop: 'bag' },
    { pts: [[14, 200], [14, 120]], prop: 'yard-drink' },
    { pts: [[24, 148], [34, 168]], prop: 'cig' }
  );
}

// ---------------------------------------------------------------- Paris Las Vegas
function buildParis(b: WorldBuilder): void {
  plaza(b, 19, 36, 56, 114, '#d9cfbd', '#b9ab92');

  // Half-scale Eiffel Tower (165 m real) — rear legs come down inside the casino, like the real one
  const tx = 32;
  const tz = 77;
  const iron = mat(0x6e4f34, 0.5, 0.6);
  const lights = new THREE.MeshStandardMaterial({ color: 0xffd278, emissive: 0xffc860, emissiveIntensity: 0.1, roughness: 0.4 });
  b.nightGlow(lights, 0.05, 1.6);
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const lx = tx + dx * 6;
    const lz = tz + dz * 6;
    const leg = mesh(new THREE.BoxGeometry(1.6, 15, 1.6), iron, tx + dx * 4.2, 7.2, tz + dz * 4.2, true);
    leg.rotation.set(dz * 0.24, 0, -dx * 0.24);
    b.add(leg);
    b.collider(lx - 0.9, lx + 0.9, lz - 0.9, lz + 0.9, 0, 4, true);
  }
  for (const s of [-1, 1]) {
    const arch = mesh(new THREE.TorusGeometry(4.2, 0.35, 6, 18, Math.PI), iron, tx, 2.6, tz + s * 5.6);
    b.add(arch);
    const arch2 = mesh(new THREE.TorusGeometry(4.2, 0.35, 6, 18, Math.PI), iron, tx + s * 5.6, 2.6, tz);
    arch2.rotation.y = Math.PI / 2;
    b.add(arch2);
  }
  b.box(tx, 12.6, tz, 13, 0.8, 13, iron);
  b.add(mesh(new THREE.BoxGeometry(13.4, 0.3, 13.4), lights, tx, 13.55, tz));
  const mid = mesh(new THREE.CylinderGeometry(2.4, 4.6, 11, 4), iron, tx, 19, tz, true);
  mid.rotation.y = Math.PI / 4;
  b.add(mid);
  b.box(tx, 24.4, tz, 7.4, 0.7, 7.4, iron);
  b.add(mesh(new THREE.BoxGeometry(7.8, 0.3, 7.8), lights, tx, 25.25, tz));
  const upper = mesh(new THREE.CylinderGeometry(0.9, 2.6, 19, 4), iron, tx, 34.6, tz, true);
  upper.rotation.y = Math.PI / 4;
  b.add(upper);
  b.box(tx, 44.2, tz, 5, 0.6, 5, iron);
  for (const [ox, oz, w, d] of [
    [0, -2.45, 5, 0.1],
    [0, 2.45, 5, 0.1],
    [-2.45, 0, 0.1, 5],
    [2.45, 0, 0.1, 5],
  ]) b.box(tx + ox, 44.8, tz + oz, w, 1.1, d, mat(0x3a2a1a, 0.6, 0.5), true, false);
  b.add(mesh(new THREE.BoxGeometry(2.4, 2.6, 2.4), iron, tx, 46.1, tz));
  const spire = mesh(new THREE.ConeGeometry(0.55, 6, 4), lights, tx, 50.4, tz);
  spire.rotation.y = Math.PI / 4;
  b.add(spire);
  const beacon = mesh(new THREE.SphereGeometry(0.4, 10, 8), basic(0xffffff), tx, 53.6, tz);
  b.add(beacon);
  // Hourly sparkle at night
  const sparkles: THREE.Mesh[] = [];
  const spMat = basic(0xffffff, { transparent: true, opacity: 0 });
  for (let i = 0; i < 60; i++) {
    const y = 2 + (i / 60) * 46;
    const r = y < 13 ? 6 - y * 0.18 : y < 25 ? 3.6 - (y - 13) * 0.12 : 2 - (y - 25) * 0.07;
    const a = i * 2.1;
    const s = mesh(new THREE.SphereGeometry(0.12, 4, 3), spMat, tx + Math.cos(a) * Math.max(0.4, r), y, tz + Math.sin(a) * Math.max(0.4, r));
    sparkles.push(s);
    b.add(s);
  }
  b.every((_dt, t, night) => {
    spMat.opacity = night * (Math.sin(t * 20) > 0.2 ? 1 : 0.15);
    (beacon.material as THREE.MeshBasicMaterial).color.setHex(Math.floor(t * 1.5) % 2 ? 0xffffff : 0xffe9b0);
  });

  // Glass elevator up the middle to the top deck
  let cabY = 0.2;
  let cabTarget = 0.2;
  const cab = mesh(new THREE.BoxGeometry(1.8, 2.4, 1.8), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.45, roughness: 0.05 }), tx, cabY + 1.2, tz);
  b.scene.add(cab);
  b.every((dt) => {
    cabY += Math.sign(cabTarget - cabY) * Math.min(Math.abs(cabTarget - cabY), dt * 5.5);
    cab.position.y = cabY + 1.2;
  });
  const topY = 44.8;
  b.rideables.push({
    id: 'eiffel-up',
    kind: 'elevator',
    label: 'Eiffel Tower Elevator',
    boardRadius: 3.2,
    boardPoint: (out) => out.set(tx, 0, tz),
    seat: (out) => out.set(tx, cabY + 0.05, tz),
    yaw: () => -Math.PI / 2,
    exitPoint: (out) => (cabY > topY - 1 ? out.set(tx - 1.6, topY + 0.1, tz) : out.set(tx - 3, 0.2, tz)),
    canBoard: () => ({ ok: true }),
    onBoard: () => {
      cabTarget = topY;
    },
    wantsExit: () => Math.abs(cabY - topY) < 0.05,
    boardPrompt: 'Press [G] to ride the Eiffel Tower elevator to the top deck',
    ridingPrompt: 'Going up… best view of the Bellagio fountains on the Strip',
  });
  b.rideables.push({
    id: 'eiffel-down',
    kind: 'elevator',
    label: 'Eiffel Tower Elevator',
    boardRadius: 2.6,
    boardPoint: (out) => out.set(tx, topY, tz),
    seat: (out) => out.set(tx, cabY + 0.05, tz),
    yaw: () => -Math.PI / 2,
    exitPoint: (out) => (cabY < 1 ? out.set(tx - 3, 0.2, tz) : out.set(tx - 1.6, topY + 0.1, tz)),
    canBoard: () => ({ ok: true }),
    onBoard: () => {
      cabY = topY;
      cabTarget = 0.2;
    },
    wantsExit: () => Math.abs(cabY - 0.2) < 0.05,
    boardPrompt: 'Press [G] to take the elevator back down',
    ridingPrompt: 'Going down to the Strip…',
  });
  b.pickup(tx + 1.6, topY + 0.6, tz + 1.6, 6, 'Eiffel Top-Deck Tourist Pack!', false);
  b.zone('Eiffel Tower', tx - 7, tx + 7, tz - 7, tz + 7);
  b.staticMarkers.push({ x: tx, z: tz, color: '#ffd278', glyph: '▲', size: 3 });

  // Mon Ami Gabi patio, just north of the tower base, facing the fountains
  const awning = mat(0xb8202a, 0.65, 0, { side: THREE.DoubleSide });
  const rail = mat(0x1f3a2a, 0.5, 0.5);
  b.box(19.6, 0, 64.5, 0.1, 1.0, 11, rail, false, false);
  b.add(mesh(new THREE.BoxGeometry(7, 0.15, 12), awning, 23.2, 3.4, 64.5));
  for (let i = 0; i < 6; i++) {
    const x = 21.4 + (i % 2) * 3.2;
    const z = 60 + Math.floor(i / 2) * 3.8;
    b.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 14), mat(0xf4f1ea, 0.5), x, 0.78, z));
    b.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), mat(0x222222, 0.4), x, 0.38, z));
  }
  b.add(neonSign('MON AMI GABI', '#1f3a2a', '#f6e7c8', 6, 0.8, undefined, 0.08), 26.8, 3, 64.5, -Math.PI / 2);
  b.pickup(21.4, 1.1, 63.8, 2, 'Mon Ami Gabi Patio Pack', false);

  // Montgolfier balloon sign — SOUTH of the tower at the Planet Hollywood edge
  const balloon = new THREE.Group();
  const sphere = mesh(new THREE.SphereGeometry(5.4, 28, 20), new THREE.MeshStandardMaterial({ map: makeBalloonTexture(), emissive: 0x3b1f08, emissiveIntensity: 0.4, roughness: 0.45 }), 0, 15, 0, true);
  balloon.add(sphere);
  balloon.add(mesh(new THREE.CylinderGeometry(0.5, 0.7, 9.5, 10), mat(0x262938, 0.35, 0.7), 0, 4.75, 0, true));
  balloon.add(mesh(new THREE.BoxGeometry(2.8, 2, 2.8), mat(0x7d4c24, 0.65), 0, 8.6, 0));
  const ps = neonSign('PARIS', '#210c1f', '#ffd26a', 5, 1.4);
  ps.rotation.y = -Math.PI / 2;
  ps.position.set(-1.45, 8.6, 0);
  balloon.add(ps);
  parisBalloonGlow(b, balloon, sphere, 5.4, 15); // backlit envelope + rings of chasing bulbs (stripSigns.ts)
  b.add(balloon, 25, 0, 112);
  b.collider(24.2, 25.8, 111.2, 112.8, 0, 9.5, true);

  // Paris Dr: Arc de Triomphe + Fontaine des Mers in the entry drive
  b.floor(52, 103, 66, 6, mat(0x2b2b30, 0.85), 0.015);
  const stone = mat(0xe3d3ba, 0.72);
  b.box(54, 0, 98.6, 2.6, 6, 2.2, stone, true);
  b.box(54, 0, 107.4, 2.6, 6, 2.2, stone, true);
  b.box(54, 6, 103, 2.8, 3, 11, stone, true);
  b.add(mesh(new THREE.BoxGeometry(3.2, 0.6, 11.6), stone, 54, 9.3, 103));
  b.add(mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.6, 24), stone, 42, 0.3, 103));
  b.add(mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.05, 24), new THREE.MeshStandardMaterial({ color: 0x3fa6c7, roughness: 0.05, metalness: 0.4 }), 42, 0.62, 103));
  b.add(mesh(new THREE.CylinderGeometry(0.35, 0.45, 4, 10), stone, 42, 2.6, 103));
  b.collider(39, 45, 100, 106, 0, 0.6);
  b.box(75, 0, 110.5, 30, 10, 6, stone, true);
  b.add(neonSign('PARIS', '#1c112b', '#ffdf8e', 12, 2.4, 'LAS VEGAS'), 20.8, 9, 92, -Math.PI / 2);

  buildCasinoFloor(b, {
    id: 'paris',
    casinoName: 'Paris Las Vegas',
    minX: 36,
    maxX: 86,
    minZ: 58,
    maxZ: 98,
    height: 12,
    entrance: { side: 'west', at: 92, width: 7 },
    extraEntrances: [{ side: 'south', at: 66, width: 6 }],
    // Inside it's a Paris street: painted sky, cobbled lanes, the tower's legs landing on the floor,
    // iron street lamps and Le Boulevard's house fronts round the walls.
    theme: 'paris',
    interior: {
      ceilingY: 11.2,
      paths: [
        [36.6, 70, 92.6, 96.6],
        [65.5, 69.5, 59.5, 97.4],
      ],
      eiffelLegs: [
        [39, 71],
        [39, 83],
      ],
    },
    carpet: ['#4a1220', '#e8b850', '#1a2a5a'],
    wall: 0x45414f,
    ceiling: 0x8cc8ff,
    ceilingGlow: 0x3b6ca8,
    light: 0xffd292,
    slots: { accent: '#63e8ff', topper: 0x63e8ff, rows: [{ x: 80, z: 78, count: 7, along: 'z', facing: -Math.PI / 2 }] },
    slotLabel: 'Paris Eiffel Slots',
    tables: [
      { game: 'roulette', x: 52, z: 66, label: 'Paris Monte Carlo Roulette' },
      { game: 'craps', x: 62, z: 80, rot: Math.PI / 2, label: 'Paris Craps' },
      { game: 'blackjack', x: 50, z: 90, label: 'Paris Blackjack' },
    ],
    felt: 0x7c1d2e,
    guard: { kick: [26, 94] },
    pickups: [
      { x: 52, z: 66, y: 1.35, amount: 5, label: 'Paris High-Roller Table Pack!' },
      { x: 82, z: 62, amount: 3, label: 'Paris Slot Row Pack' },
    ],
    tourists: [{ pts: [[42, 62], [82, 62], [82, 94], [42, 94]], prop: 'cig' }, { pts: [[70, 66], [70, 92]], prop: 'yard-drink' }],
  });
  // Ivory Opéra/Louvre-style street front with the zinc mansard over the casino's Strip wall (stripFronts.ts)
  parisFront(b, 34.95, 58, 98, 88.5, 95.5, 12);
  const parisSkin = { wall: '#d9cdb6', mullion: '#efe4cf', glass: '#5d6e7c', lit: '#ffe6a8', cols: 10, rows: 20, style: 0 as const, seed: 71 };
  tower(b, { x: 104, z: 86, w: 16, d: 52, h: 33, facade: parisSkin, roof: 0x26384d });
  b.add(mesh(new THREE.BoxGeometry(17, 4, 53), mat(0x26384d, 0.55, 0.3), 104, 35, 86));
  b.building(61, 78, 50, 40, '#45414f', 'Paris');
  b.building(104, 86, 16, 52, '#d9cdb6');
  b.zone('Paris Las Vegas', 19, 140, 56, 114);
  b.crowd.performers.push({ kind: 'showgirl', x: 16.4, z: 84, facing: -Math.PI / 2 });
  b.crowd.tourists.push(
    { pts: [[16, 58], [16, 112]], prop: 'camera' },
    { pts: [[14.5, 110], [14.5, 60]], prop: 'cig' },
    { pts: [[22, 72], [30, 98]], prop: 'camera' }
  );
}

// ---------------------------------------------------------------- Horseshoe (ex-Bally's) + Grand Bazaar Shops
function buildHorseshoe(b: WorldBuilder): void {
  plaza(b, 19, 54, 17, 56, '#c9b89a', '#a8936e');
  // Grand Bazaar: canopied stalls, most leases winding down (Caesars took it over May 2026)
  const canopies = [0xff4d6d, 0xffc145, 0x2ec4b6, 0x7b5cff, 0xff8a3d, 0x3a86ff];
  let n = 0;
  for (let x = 29; x <= 47; x += 6) {
    for (let z = 24; z <= 50; z += 6.5) {
      const open = n % 5 === 0 || n % 7 === 3;
      const c = canopies[n % canopies.length];
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(3.2, 2.2, 3.2), mat(open ? 0x5a4632 : 0x8a8f99, 0.7, open ? 0 : 0.6), 0, 1.1, 0, true));
      const roof = mesh(new THREE.ConeGeometry(2.9, 1.4, 4), mat(c, 0.6), 0, 3.0, 0, true);
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), mat(0xdddddd, 0.4, 0.6), 0, 4.1, 0));
      b.add(g, x, 0, z);
      b.collider(x - 1.6, x + 1.6, z - 1.6, z + 1.6, 0, 2.2, true);
      if (!open) b.add(neonSign('LEASE ENDING', '#e8e8e8', '#5a5a5a', 2.6, 0.5, undefined, 0.04), x - 1.65, 1.6, z, -Math.PI / 2);
      n++;
    }
  }
  b.add(neonSign('GRAND BAZAAR SHOPS', '#2a0e12', '#ffd24d', 10, 1.4), 20.8, 6, 36, -Math.PI / 2);
  b.add(mesh(new THREE.BoxGeometry(0.6, 5, 0.6), mat(0x3a2a1a, 0.6), 20.8, 2.5, 31));
  b.add(mesh(new THREE.BoxGeometry(0.6, 5, 0.6), mat(0x3a2a1a, 0.6), 20.8, 2.5, 41));
  b.pickup(35, 2.6, 30.5, 3, 'Grand Bazaar Stall Pack', false);
  b.zone('Grand Bazaar Shops', 19, 54, 17, 56);

  buildCasinoFloor(b, {
    id: 'horseshoe',
    casinoName: 'Horseshoe',
    minX: 54,
    maxX: 94,
    minZ: 18,
    maxZ: 56,
    height: 11,
    entrance: { side: 'west', at: 37, width: 8 },
    // Black, red and gold, horseshoe trays over the pits, and the WSOP poker room in the back corner
    theme: 'horseshoe',
    interior: { ceilingY: 9.6, pokerRoom: [73.5, 88, 43.5, 50.5] },
    carpet: ['#1a0a0c', '#d9a63a', '#8a0a14'],
    wall: 0x5a2a22,
    ceiling: 0x2a1a14,
    ceilingGlow: 0x5a2a10,
    light: 0xffc078,
    slots: { accent: '#ffcc33', topper: 0xd9362b, rows: [{ x: 89, z: 37, count: 6, along: 'z', facing: -Math.PI / 2 }] },
    slotLabel: 'Horseshoe Double-Diamond Slots',
    tables: [
      { game: 'craps', x: 68, z: 26, label: 'Horseshoe Craps (home of the dice)' },
      { game: 'craps', x: 68, z: 48, label: 'Horseshoe Craps Pit' },
      { game: 'blackjack', x: 78, z: 37, rot: -Math.PI / 2, label: 'Horseshoe Blackjack' },
    ],
    felt: 0x0f4a2a,
    guard: { kick: [24, 37] },
    pickups: [{ x: 68, z: 26, y: 1.35, amount: 5, label: 'Horseshoe Craps Rail Pack!' }],
    tourists: [{ pts: [[58, 22], [90, 22], [90, 52], [58, 52]], prop: 'cig' }],
  });
  const beige = { wall: '#d6c6a8', mullion: '#e9dcc2', glass: '#5a5f66', lit: '#ffe2a8', cols: 9, rows: 18, style: 0 as const, seed: 81 };
  tower(b, { x: 108, z: 32, w: 12, d: 30, h: 26, facade: beige });
  tower(b, { x: 124, z: 44, w: 12, d: 30, h: 26, facade: { ...beige, seed: 83 } });
  horseshoeSigns(b); // gold horseshoe crest + slab lettering on red cabinets (stripSigns.ts)
  b.building(74, 37, 40, 38, '#5a2a22', 'Horseshoe');
  b.building(116, 36, 28, 40, '#d6c6a8');
  b.zone('Horseshoe Las Vegas', 19, 140, 17, 56);
  b.crowd.tourists.push({ pts: [[16, 22], [16, 54]], prop: 'yard-drink' }, { pts: [[26, 20], [50, 54]], prop: 'bag' });
}

// ---------------------------------------------------------------- The Vanderpump Hotel (ex-Cromwell) + Drai's
function buildVanderpump(b: WorldBuilder): void {
  const skin = { wall: '#24262b', mullion: '#c9a95c', glass: '#30343c', lit: '#ffd9a0', cols: 6, rows: 11, style: 0 as const, seed: 91 };
  tower(b, { x: 38, z: -26, w: 24, d: 16, h: 13, facade: skin, roof: 0x1a1a1e });
  b.add(neonSign('THE VANDERPUMP', '#0d0d10', '#f2c6d9', 12, 1.6, 'HOTEL • LAS VEGAS'), 25.8, 10, -26, -Math.PI / 2);
  // Drai's rooftop: pool, cabanas, string lights, DJ booth
  const roofY = 13.8;
  b.floor(38, -26, 14, 8, new THREE.MeshStandardMaterial({ color: 0x2bb6d9, roughness: 0.05, emissive: 0x0b4a66, emissiveIntensity: 0.7 }), roofY + 0.06);
  b.waterZones.push({ name: "Drai's Rooftop Pool", minX: 31, maxX: 45, minZ: -30, maxZ: -22, y: roofY });
  b.add(mesh(new THREE.BoxGeometry(3, 1.3, 1.6), mat(0x111111, 0.4, 0.4), 48, roofY + 0.65, -26));
  const bulb = basic(0xffd27a);
  for (let x = 27; x <= 49; x += 2) b.add(mesh(new THREE.SphereGeometry(0.1, 5, 4), bulb, x, roofY + 3.2 + Math.sin((x - 27) / 22 * Math.PI) * -0.6, -26));
  b.box(38, roofY, -18.3, 24, 1.1, 0.12, new THREE.MeshStandardMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.3 }), true, false);
  stairs(b, 78, -32, '-x', 2.6, roofY, 28, mat(0x3a3a46, 0.6));
  b.pickup(48, roofY + 1.6, -24, 4, "Drai's DJ Booth Stash", false);
  b.zone("Drai's Rooftop (The Vanderpump)", 26, 50, -34, -18);
  b.zone('The Vanderpump Hotel', 19, 52, -35, -17);
  b.building(38, -26, 24, 16, '#24262b', 'Vanderpump');
  b.crowd.performers.push({ kind: 'slapper', x: 15.5, z: -30, facing: -Math.PI / 2 });
}

// ---------------------------------------------------------------- Flamingo + Wildlife Habitat
function buildFlamingo(b: WorldBuilder): void {
  buildCasinoFloor(b, {
    id: 'flamingo',
    casinoName: 'Flamingo',
    minX: 26,
    maxX: 66,
    minZ: -94,
    maxZ: -38,
    height: 12,
    entrance: { side: 'west', at: -66, width: 8 },
    extraEntrances: [{ side: 'north', at: 50, width: 6 }],
    // Pink Miami deco: stepped neon ceiling, teal and pink walls, palm columns, the round Bird Bar
    theme: 'flamingo',
    interior: { ceilingY: 10.6 },
    carpet: ['#4a1238', '#ff64b8', '#ff9a3c'],
    wall: 0x3b2038,
    ceiling: 0x2b1028,
    ceilingGlow: 0x7a1a5a,
    light: 0xff52b8,
    slots: { accent: '#ff4fc6', topper: 0xff4fc6, rows: [{ x: 60, z: -66, count: 8, along: 'z', facing: -Math.PI / 2 }] },
    slotLabel: 'Flamingo Pink 777 Slots',
    tables: [
      { game: 'blackjack', x: 40, z: -46, label: 'Flamingo Party-Pit Blackjack' },
      { game: 'roulette', x: 44, z: -66, rot: Math.PI / 2, label: 'Flamingo Roulette' },
      { game: 'craps', x: 42, z: -84, label: 'Flamingo Craps' },
    ],
    felt: 0x7c1456,
    guard: { kick: [17, -66] },
    pickups: [
      { x: 44, z: -66, y: 1.35, amount: 5, label: 'Flamingo VIP Table Pack!' },
      { x: 62, z: -42, amount: 3, label: 'Flamingo Pink Slots Pack' },
    ],
    tourists: [{ pts: [[30, -42], [62, -42], [62, -90], [30, -90]], prop: 'cig' }, { pts: [[52, -48], [52, -88]], prop: 'bag' }],
  });
  // The pink & orange neon feather plume over the entrance + the "Flamingo" neon script (stripSigns.ts)
  flamingoSigns(b);

  // Wildlife Habitat behind the casino: pond, waterfall, Chilean flamingos, palms
  const hx = 84;
  const hz = -62;
  plaza(b, 68, 100, -42, -84, '#7c8f5a', '#647548');
  const pond = new THREE.MeshStandardMaterial({ color: 0x157885, roughness: 0.08, metalness: 0.6 });
  b.floor(hx, hz, 18, 22, pond, 0.04);
  b.waterZones.push({ name: 'Flamingo Habitat Pond', minX: hx - 9, maxX: hx + 9, minZ: hz - 11, maxZ: hz + 11, y: 0.04 });
  const rock = mat(0x6b5d54, 0.92);
  b.box(hx + 10, 0, hz, 3, 4, 8, rock, true);
  const fall = mesh(new THREE.PlaneGeometry(3, 4), basic(0x8ef4ff, { transparent: true, opacity: 0.7 }), hx + 8.45, 2, hz);
  fall.rotation.y = -Math.PI / 2;
  b.add(fall);
  b.box(hx, 0, hz, 22, 0.35, 2, mat(0x70492b, 0.75));
  const birds: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const bird = flamingoBird(i * 0.7);
    b.scene.add(bird);
    bird.position.set(hx - 6 + (i % 3) * 5, 0, hz - 7 + Math.floor(i / 3) * 6.5);
    birds.push(bird);
  }
  b.every((_dt, t) => {
    birds.forEach((bd, i) => {
      bd.rotation.y = i * 0.7 + Math.sin(t * 0.3 + i) * 0.6;
      bd.children[3].position.y = 1.27 + Math.sin(t * 2 + i) * 0.04;
    });
  });
  for (const [x, z] of [
    [71, -46],
    [97, -46],
    [71, -80],
    [97, -80],
    [76, -62],
  ]) b.add(palmTree(6.5, false, x), x, 0, z);
  b.pickup(hx, 0.8, hz, 2, 'Habitat Bridge Pack', false);
  b.zone('Flamingo Wildlife Habitat', 68, 100, -84, -42);
  b.crowd.tourists.push({ pts: [[72, -48], [96, -78]], prop: 'camera' });

  const flamSkin = { wall: '#c45a8a', mullion: '#e88ab4', glass: '#4b2442', lit: '#ffb6e0', cols: 10, rows: 20, style: 0 as const, seed: 101 };
  tower(b, { x: 114, z: -64, w: 18, d: 46, h: 30, facade: flamSkin });
  b.building(46, -66, 40, 56, '#3b2038', 'Flamingo');
  b.building(114, -64, 18, 46, '#c45a8a');
  b.feature({ kind: 'park', x: 84, z: -63, w: 32, d: 42, color: '#4f6b3a' });
  b.zone('Flamingo Las Vegas', 19, 130, -96, -36);
  b.crowd.tourists.push({ pts: [[16, -38], [16, -96]], prop: 'cig' }, { pts: [[14, -92], [14, -40]], prop: 'yard-drink' });
}

// ---------------------------------------------------------------- LINQ Promenade, High Roller, LINQ Hotel
function buildLinq(b: WorldBuilder): void {
  const z0 = -98;
  const z1 = -110;
  const zc = (z0 + z1) / 2;
  plaza(b, 19, 158, z0, z1, '#bfb4a4', '#9c917f');
  b.feature({ kind: 'plaza', x: 88, z: zc, w: 138, d: 12, color: '#bfb4a4', label: 'LINQ Promenade' });

  // Shops: Flamingo side (south) east of the casino, LINQ/O'Sheas side (north)
  const south: Array<[number, string, string]> = [
    [72, 'BREEZE DAIQUIRI', '#ff6ec7'],
    [92, 'SOUVENIRS', '#ffd24d'],
    [104, 'TATTOO', '#7dffb0'],
    [116, 'PIZZA', '#ff8a3d'],
    [128, 'ICE CREAM', '#9fe8ff'],
  ];
  for (const [x, name, col] of south) storefront(b, x, -94.5, 10, 5, 6, 0x3a3a44, name, col, '#111118', Math.PI);
  const north: Array<[number, string, string]> = [
    [64, "O'SHEAS", '#4dff7a'],
    [76, 'BURGERS', '#ffcc33'],
    [88, 'SPORTS BAR', '#3ab0ff'],
    [124, 'KARAOKE', '#c77dff'],
  ];
  for (const [x, name, col] of north) storefront(b, x, -113.5, 10, 5, 6, 0x2c2f3a, name, col, '#0d0e14', 0);
  // The LINQ Promenade In-N-Out (3545 S LVB, Ste L24) — famous for its line
  b.restaurants.push(buildInNOut(b, 104, -121.5, 0, { name: 'In-N-Out (LINQ Promenade)', standalone: false, w: 16, d: 10, patio: false }));
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(72, 0, -98.6), radius: 3, label: 'Breeze Daiquiri Bar' });
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(64, 0, -109.8), radius: 3, label: "O'Sheas" });

  // String lights across the promenade + planters + benches
  const bulb = basic(0xffe2a0);
  for (let x = 24; x < 150; x += 9) {
    for (let i = 0; i <= 6; i++) {
      const z = z0 - 0.5 - i * ((z0 - z1 - 1) / 6);
      b.add(mesh(new THREE.SphereGeometry(0.11, 5, 4), bulb, x, 6.2 - Math.sin((i / 6) * Math.PI) * 0.7, z));
    }
  }
  for (let x = 30; x < 150; x += 16) {
    b.add(planter(2.2, 1.4, 0xff6aa2), x, 0, zc);
    b.collider(x - 1.1, x + 1.1, zc - 0.7, zc + 0.7, 0, 0.6);
    b.add(bench(), x + 5, 0, zc + 3.4);
  }

  // Fly LINQ zipline overhead: launch tower near the wheel, riders land near the Strip
  const steel = mat(0x5b6068, 0.35, 0.7);
  b.add(mesh(new THREE.BoxGeometry(4, 32, 4), steel, 140, 16, zc, true));
  b.collider(138, 142, zc - 2, zc + 2, 0, 32, true);
  b.add(mesh(new THREE.BoxGeometry(3, 10, 3), steel, 24, 5, zc));
  b.collider(22.5, 25.5, zc - 1.5, zc + 1.5, 0, 10, true);
  const riders: Array<{ g: THREE.Group; lane: number; t: number }> = [];
  for (let lane = 0; lane < 4; lane++) {
    const zz = zc - 1.5 + lane;
    const cable = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), mat(0x222222, 0.5), 0, 0, 0);
    const a = new THREE.Vector3(140, 31, zz);
    const c = new THREE.Vector3(24, 9.5, zz);
    cable.position.copy(a).add(c).multiplyScalar(0.5);
    cable.scale.y = a.distanceTo(c);
    cable.lookAt(c);
    cable.rotateX(Math.PI / 2);
    b.add(cable);
    const g = new THREE.Group();
    g.add(mesh(new THREE.CapsuleGeometry(0.25, 0.8, 4, 8), mat([0xff5a7a, 0x2ec4ff, 0xffc83d, 0x4de088][lane], 0.6), 0, -1, 0));
    b.scene.add(g);
    riders.push({ g, lane, t: lane * 0.27 });
  }
  b.every((dt) => {
    for (const r of riders) {
      r.t = (r.t + dt * 0.09) % 1.3;
      const k = Math.min(1, r.t);
      r.g.visible = r.t < 1;
      r.g.position.set(140 + (24 - 140) * k, 31 + (9.5 - 31) * k, zc - 1.5 + r.lane);
    }
  });
  b.add(neonSign('FLY LINQ', '#0b0b12', '#7dffb0', 6, 1.2, 'ZIPLINE', 0.1), 140, 26, zc + 2.1);

  // The High Roller: 167 m tall, 28 cabins, at the end of the promenade
  const wx = 162;
  const wcy = 27.5;
  const R = 24.6;
  const wheel = new THREE.Group();
  wheel.position.set(wx, wcy, zc);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.3, metalness: 0.8, emissive: 0x35e0ff, emissiveIntensity: 0.1 });
  b.nightGlow(rimMat, 0.05, 1.4);
  const rim = mesh(new THREE.TorusGeometry(R, 0.45, 10, 72), rimMat);
  rim.rotation.y = Math.PI / 2;
  wheel.add(rim);
  const rim2 = mesh(new THREE.TorusGeometry(R - 2.4, 0.3, 8, 64), rimMat);
  rim2.rotation.y = Math.PI / 2;
  wheel.add(rim2);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const spoke = mesh(new THREE.CylinderGeometry(0.06, 0.06, R, 4), mat(0xb8c2cc, 0.4, 0.7), 0, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5);
    spoke.rotation.x = a;
    wheel.add(spoke);
  }
  wheel.add(mesh(new THREE.CylinderGeometry(2.2, 2.2, 4, 18), mat(0x8a96a2, 0.4, 0.8), 0, 0, 0));
  wheel.children[wheel.children.length - 1].rotation.z = Math.PI / 2;
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.3, emissive: 0x3a7bff, emissiveIntensity: 0.1 });
  b.nightGlow(cabinMat, 0.05, 0.9);
  const cabins: THREE.Mesh[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const cabin = mesh(new THREE.SphereGeometry(1.5, 14, 10), cabinMat, 0, Math.cos(a) * R, Math.sin(a) * R);
    cabin.scale.set(1.1, 0.9, 1.6);
    wheel.add(cabin);
    cabins.push(cabin);
  }
  b.scene.add(wheel);
  for (const s of [-1, 1]) {
    const leg = mesh(new THREE.BoxGeometry(1.2, 32, 1.4), mat(0xdfe6ee, 0.3, 0.8), wx + s * 3, 14, zc + s * 7);
    leg.rotation.x = s * 0.24;
    b.add(leg);
  }
  b.collider(wx - 4, wx + 4, zc + 6, zc + 9, 0, 8, true);
  b.collider(wx - 4, wx + 4, zc - 9, zc - 6, 0, 8, true);
  // Boarding station deck (pods pass level with it at the bottom)
  const stationY = wcy - R - 0.8;
  b.box(wx, 0, zc, 14, stationY, 5, mat(0x3a3f4a, 0.5, 0.3));
  stairs(b, wx - 17, zc, '+x', 4, stationY, 10, mat(0x3a3f4a, 0.5, 0.3));
  b.add(neonSign('HIGH ROLLER', '#05070d', '#35e0ff', 8, 1.3, 'THE LINQ OBSERVATION WHEEL', 0.1), wx - 7.1, stationY + 2.2, zc, -Math.PI / 2);
  let wheelAngle = 0;
  let rideStart = 0;
  let rideCabin = 0;
  let riding = false;
  const SPEED = 0.05; // rad/s — a full loop in ~2 minutes (real: 30)
  b.every((dt, _t, night) => {
    wheelAngle += SPEED * dt;
    wheel.rotation.x = wheelAngle;
    rimMat.emissive.setHSL((performance.now() / 20000) % 1, 0.8, 0.5);
    cabinMat.emissiveIntensity = 0.05 + night * 0.85;
  });
  const cabinWorld = (i: number, out: THREE.Vector3) => {
    cabins[i].getWorldPosition(out);
    return out;
  };
  const tmp = new THREE.Vector3();
  b.rideables.push({
    id: 'high-roller',
    kind: 'highroller',
    label: 'High Roller',
    boardRadius: 7,
    boardPoint: (out) => out.set(wx, stationY, zc),
    seat: (out) => cabinWorld(rideCabin, out).add(tmp.set(0, -1.05, 0)),
    yaw: () => -Math.PI / 2,
    exitPoint: (out) => out.set(wx - 4.5, stationY + 0.05, zc),
    canBoard: () => {
      let best = 0;
      let bestY = Infinity;
      for (let i = 0; i < cabins.length; i++) {
        const y = cabinWorld(i, tmp).y;
        if (y < bestY) {
          bestY = y;
          best = i;
        }
      }
      rideCabin = best;
      return { ok: true };
    },
    onBoard: () => {
      riding = true;
      rideStart = wheelAngle;
    },
    onExit: () => {
      riding = false;
    },
    wantsExit: () => riding && wheelAngle - rideStart > Math.PI * 2 - 0.08,
    boardPrompt: 'Press [G] to board a High Roller cabin (one full loop)',
    ridingPrompt: 'High Roller — 550 ft over the Strip. [E] smoke • [G] bail out at the station',
  });
  b.pickup(wx - 3, stationY + 0.6, zc + 1.6, 3, 'High Roller Queue Pack', false);
  b.zone('High Roller', wx - 20, wx + 10, zc - 12, zc + 12);
  b.zone('The LINQ Promenade', 19, 150, z1, z0);
  b.staticMarkers.push({ x: wx, z: zc, color: '#35e0ff', glyph: '◎', size: 3.4 });
  b.crowd.performers.push({ kind: 'slapper', x: 16, z: -112, facing: -Math.PI / 2 }, { kind: 'elvis', x: 96, z: -101.5, facing: 0 });
  b.crowd.tourists.push(
    { pts: [[22, -103], [150, -103]], prop: 'yard-drink' },
    { pts: [[148, -106], [24, -106]], prop: 'camera' },
    { pts: [[40, -101], [120, -108]], prop: 'cig' },
    { pts: [[110, -100], [30, -108]], prop: 'bag' }
  );

  const linqSkin = { wall: '#e8ebef', mullion: '#ffffff', glass: '#4a6a8a', lit: '#e8f4ff', cols: 10, rows: 20, style: 1 as const, seed: 111 };
  tower(b, { x: 39, z: -128, w: 34, d: 20, h: 28, facade: linqSkin, crownGlow: 0.5, washStrength: 0.3, washZone: 5 }); // soft crown so the LINQ letters read
  linqSigns(b); // LINQ crown letters + the promenade gateway sign (stripSigns.ts)
  b.building(39, -128, 34, 20, '#e8ebef', 'LINQ');
  b.zone('The LINQ Hotel', 19, 60, -140, -110);
}

// ---------------------------------------------------------------- Harrah's + Carnaval Court + Casino Royale
function buildHarrahs(b: WorldBuilder): void {
  plaza(b, 19, 44, -142, -164, '#8a6f4a', '#6f5838');
  b.box(31, 0, -142.6, 24, 1.0, 0.2, mat(0x2b2b30, 0.4, 0.6), true, false);
  const bar = barCounter(10, 0x161616, 0x8a1c1c);
  b.add(bar, 36, 0, -153, Math.PI / 2);
  b.collider(35.4, 36.6, -158, -148, 0, 1.15, true);
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(34, 0, -153), radius: 3, label: 'Carnaval Court Bar' });
  b.box(29, 0, -162, 12, 0.9, 3, mat(0x222222, 0.5));
  b.add(neonSign('CARNAVAL COURT', '#1a0a20', '#ffcc33', 9, 1.3), 29, 4.2, -163.4);
  const bj = blackjackTable(0x0f4a2a);
  b.add(bj, 26, 0, -150, Math.PI / 2);
  b.collider(25, 27, -152, -148, 0, 1.1);
  b.gamblingSpots.push({ id: 'carnaval-bj', casinoName: "Harrah's", gameType: 'blackjack', position: new THREE.Vector3(26, 0, -150), label: 'Carnaval Court Party-Pit Blackjack' });
  for (const [x, z] of [
    [21, -145],
    [21, -161],
  ]) b.add(palmTree(6.8, false, x + z), x, 0, z);
  const bulb = basic(0xff8ad8);
  for (let x = 21; x <= 43; x += 2.2) b.add(mesh(new THREE.SphereGeometry(0.1, 5, 4), bulb, x, 4.6, -153));
  b.pickup(36, 1.4, -150, 3, 'Carnaval Court Bar Pack', false);
  b.zone('Carnaval Court (Harrah’s)', 19, 44, -164, -142);
  b.crowd.tourists.push({ pts: [[24, -146], [40, -160]], prop: 'yard-drink' }, { pts: [[30, -160], [40, -146]], prop: 'cig' });
  b.crowd.performers.push({ kind: 'slapper', x: 16, z: -170, facing: -Math.PI / 2 });

  const harrahs = { wall: '#d9c4a0', mullion: '#ecdcbc', glass: '#7a4a3a', lit: '#ffe0a0', cols: 10, rows: 22, style: 0 as const, seed: 121 };
  b.box(52, 0, -164, 16, 12, 42, mat(0x7a1c1c, 0.6), true);
  tower(b, { x: 72, z: -165, w: 22, d: 40, h: 36, facade: harrahs, crownGlow: 0.5, washStrength: 0.3, washZone: 5 }); // soft crown so the script reads
  harrahsSigns(b); // the burgundy-and-gold script marquee at the Strip + tower script (stripSigns.ts)
  b.building(62, -165, 40, 42, '#7a1c1c', "Harrah's");
  b.zone("Harrah's Las Vegas", 19, 90, -186, -140);

  b.box(31, 0, -206, 22, 10, 34, mat(0xe2d6bf, 0.65), true);
  // Storefronts, gold canopy over the casino doors, the hotel floor's windows, cornice (stripFronts.ts)
  casinoRoyaleFront(b, 20, -223, -189, 10, -200);
  b.add(neonSign('CASINO ROYALE', '#0b0b12', '#ff3b3b', 8, 1.3), 19.55, 7.6, -198, -Math.PI / 2);
  b.add(neonSign('PHARMACY', '#ffffff', '#d81e2a', 6, 1.1, 'OPEN 24 HOURS'), 19.6, 5.2, -214, -Math.PI / 2);
  b.add(neonSign('SLIDERS 24/7', '#f4f4f4', '#1d3f8f', 5, 1.0, 'BURGERS • FRIES • SHAKES'), 19.6, 5.2, -192.5, -Math.PI / 2);
  b.zone('Casino Royale', 19, 42, -224, -188);
  b.crowd.tourists.push({ pts: [[16, -142], [16, -224]], prop: 'bag' }, { pts: [[14, -222], [14, -146]], prop: 'camera' });
}

// ---------------------------------------------------------------- The Venetian
function buildVenetian(b: WorldBuilder): void {
  plaza(b, 19, 84, -226, -306, '#d9b98a', '#bf9d6c');
  const cx0 = 24;
  const cx1 = 36;
  const cz0 = -300;
  const cz1 = -248;
  const water = new THREE.MeshStandardMaterial({ color: 0x2a8a9a, roughness: 0.06, metalness: 0.5, emissive: 0x0a3540, emissiveIntensity: 0.35 });
  b.floor((cx0 + cx1) / 2, (cz0 + cz1) / 2, cx1 - cx0, cz1 - cz0, water, 0.05);
  b.waterZones.push({ name: 'Venetian Canal', minX: cx0, maxX: cx1, minZ: cz0, maxZ: cz1, y: 0.05 });
  b.feature({ kind: 'water', x: (cx0 + cx1) / 2, z: (cz0 + cz1) / 2, w: cx1 - cx0, d: cz1 - cz0, color: '#2a8a9a' });
  const stone = mat(0xf0e6d2, 0.7);
  b.box(cx0 - 0.3, 0, (cz0 + cz1) / 2, 0.6, 0.9, cz1 - cz0, stone);
  b.box(cx1 + 0.3, 0, (cz0 + cz1) / 2, 0.6, 0.9, cz1 - cz0, stone);

  // Rialto Bridge across the canal
  const rz = -268;
  stairs(b, cx0 - 4, rz, '+x', 5, 2.6, 5, stone);
  b.box((cx0 + cx1) / 2, 2.25, rz, cx1 - cx0 - 2, 0.35, 5, stone); // arch deck: gondolas pass underneath
  stairs(b, cx1 + 4, rz, '-x', 5, 2.6, 5, stone);
  for (const s of [-1, 1]) {
    b.add(mesh(new THREE.BoxGeometry(cx1 - cx0 + 6, 1, 0.3), stone, (cx0 + cx1) / 2, 3.1, rz + s * 2.4));
    for (let x = cx0; x <= cx1; x += 3) b.add(mesh(new THREE.BoxGeometry(0.5, 3, 0.5), stone, x, 4.1, rz + s * 1.8));
  }
  b.add(mesh(new THREE.BoxGeometry(cx1 - cx0, 0.5, 4.2), mat(0xc96a4a, 0.7), (cx0 + cx1) / 2, 5.8, rz));
  b.zone('Rialto Bridge', cx0 - 4, cx1 + 4, rz - 3, rz + 3);

  // Campanile (96 m real)
  // Campanile, after St Mark's: red-brick shaft with pilaster strips arched at the top, white stone
  // belfry loggia (four arches a side), the attic with gold reliefs, green copper spire, gold angel
  const brick = mat(0xa8533a, 0.85);
  const brickLite = mat(0xb9654a, 0.85);
  const ivory = mat(0xf0e6d2, 0.6);
  const CX = 30;
  const CZ = -238;
  b.box(CX, 0, CZ, 4.4, 24, 4.4, brick, true);
  b.add(mesh(new THREE.BoxGeometry(5.0, 1.4, 5.0), ivory, CX, 0.7, CZ)); // stone base
  for (const f of [0, 1, 2, 3]) {
    const ax = f === 0 ? 1 : f === 1 ? -1 : 0;
    const az = f === 2 ? 1 : f === 3 ? -1 : 0;
    for (const t of [-1.6, -0.55, 0.55, 1.6]) {
      const w = Math.abs(t) > 1 ? 0.5 : 0.32;
      const px = CX + ax * 2.26 + (az !== 0 ? t : 0);
      const pz = CZ + az * 2.26 + (ax !== 0 ? t : 0);
      b.add(mesh(new THREE.BoxGeometry(ax !== 0 ? 0.14 : w, 20.4, az !== 0 ? 0.14 : w), brickLite, px, 11.6, pz));
    }
  }
  b.add(mesh(new THREE.BoxGeometry(4.9, 0.5, 4.9), ivory, CX, 22.2, CZ));
  b.add(mesh(new THREE.BoxGeometry(5.3, 0.35, 5.3), ivory, CX, 24.15, CZ));
  // belfry: dark core behind four arched openings a side (corner piers + slim columns), cornice on top
  b.add(mesh(new THREE.BoxGeometry(4.2, 3.6, 4.2), mat(0x2a2420, 0.9), CX, 26.1, CZ));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(mesh(new THREE.BoxGeometry(0.9, 3.6, 0.9), ivory, CX + sx * 2.15, 26.1, CZ + sz * 2.15));
  for (let f = 0; f < 4; f++) {
    const ax = f === 0 ? 1 : f === 1 ? -1 : 0;
    const az = f === 2 ? 1 : f === 3 ? -1 : 0;
    for (const t of [-0.85, 0, 0.85]) {
      b.add(mesh(new THREE.CylinderGeometry(0.13, 0.15, 2.7, 8), ivory, CX + ax * 2.3 + (az !== 0 ? t : 0), 25.7, CZ + az * 2.3 + (ax !== 0 ? t : 0)));
    }
    // arch heads: a band with the four arch crowns
    b.add(mesh(new THREE.BoxGeometry(ax !== 0 ? 0.3 : 4.4, 0.55, az !== 0 ? 0.3 : 4.4), ivory, CX + ax * 2.3, 27.4, CZ + az * 2.3));
  }
  b.add(mesh(new THREE.BoxGeometry(5.4, 0.4, 5.4), ivory, CX, 28.1, CZ));
  // attic with the winged-lion reliefs (gold panels), then the spire
  b.add(mesh(new THREE.BoxGeometry(4.6, 2.6, 4.6), ivory, CX, 29.6, CZ));
  const gilt = mat(0xf2c14e, 0.25, 0.85);
  for (let f = 0; f < 4; f++) {
    const ax = f === 0 ? 1 : f === 1 ? -1 : 0;
    const az = f === 2 ? 1 : f === 3 ? -1 : 0;
    b.add(mesh(new THREE.BoxGeometry(ax !== 0 ? 0.1 : 1.6, 1.2, az !== 0 ? 0.1 : 1.6), gilt, CX + ax * 2.32, 29.6, CZ + az * 2.32));
  }
  b.add(mesh(new THREE.BoxGeometry(4.9, 0.3, 4.9), ivory, CX, 31.05, CZ));
  const roof = mesh(new THREE.ConeGeometry(3.3, 8.5, 4), mat(0x4a8a5a, 0.6, 0.3), CX, 35.45, CZ, true);
  roof.rotation.y = Math.PI / 4;
  b.add(roof);
  b.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), gilt, CX, 39.8, CZ));
  b.add(mesh(new THREE.ConeGeometry(0.35, 1.1, 6), gilt, CX, 40.6, CZ)); // the archangel Gabriel
  for (const s of [-1, 1]) {
    const wing = mesh(new THREE.BoxGeometry(0.06, 0.55, 0.7), gilt, CX, 40.8, CZ + s * 0.35);
    wing.rotation.x = s * 0.5;
    b.add(wing);
  }

  // Doge's Palace front: white arcade below, rose wall above. Behind it, walk-in: the lobby, the indoor
  // Grand Canal Shoppes + St. Mark's Square and a casino wing (grandVenetian.ts, x 44…88, z −318…−246)
  buildVenetianInteriors(b);
  // Open arcade in front of the palace — the Rialto lands here (gap at the front doors, z −276)
  for (let z = -300; z <= -252; z += 3.4) {
    if (Math.abs(z + 276) < 1.5) continue;
    b.add(mesh(new THREE.CylinderGeometry(0.35, 0.4, 6, 10), stone, 43.2, 3, z, true));
    b.collider(42.8, 43.6, z - 0.4, z + 0.4, 0, 6, true);
  }
  b.box(41.5, 6, -276, 5, 1.2, 50, stone);
  // Upper loggia on the arcade, the rose lozenge wall with pointed windows, Gothic cresting (stripFronts.ts)
  dogesPalaceFront(b, 43.4, -291.4, -246, 18, 7.2, -300.5, -251.5);
  venetianSigns(b); // marquee by the campanile + gold Roman lettering on the palace and tower (stripSigns.ts)

  // Gondolas with gondoliers, rideable end to end
  // Boarding docks at both ends of the canal
  const dockWood = mat(0x7a5232, 0.85);
  b.box(30, 0, cz1 - 2, cx1 - cx0, 0.45, 4, dockWood);
  b.box(30, 0, cz0 + 2, cx1 - cx0, 0.45, 4, dockWood);
  b.add(neonSign('GONDOLA RIDES', '#1d150a', '#ffd86b', 5, 0.8, 'BOARD HERE', 0.08), 30, 2.2, cz1 + 0.3);
  const gondolas: Array<{ g: THREE.Group; z: number; dir: number; riding: boolean; done: boolean; dwell: number }> = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    const hull = mesh(new THREE.BoxGeometry(1.3, 0.5, 7), mat(0x0c0c10, 0.3, 0.3), 0, 0.3, 0, true);
    g.add(hull);
    for (const s of [-1, 1]) {
      const tip = mesh(new THREE.ConeGeometry(0.4, 1.6, 6), mat(0x0c0c10, 0.3, 0.3), 0, 0.7, s * 3.8);
      tip.rotation.x = s * 1.2;
      g.add(tip);
    }
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.25, 1.6), mat(0x8a1c1c, 0.6), 0, 0.6, 0.6));
    const gondolier = new THREE.Group();
    gondolier.add(mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.8, 8), mat(0x1c1c1c, 0.6), 0, 0.95, 0));
    const shirt = mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.6, 10), mat(0xf4f4f4, 0.6), 0, 1.65, 0);
    gondolier.add(shirt);
    for (let k = 0; k < 3; k++) gondolier.add(mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.06, 10), mat(0xc4141c, 0.6), 0, 1.45 + k * 0.18, 0));
    gondolier.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0xe2ae88, 0.6), 0, 2.1, 0));
    gondolier.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), mat(0xe8d48a, 0.7), 0, 2.25, 0));
    const oar = mesh(new THREE.BoxGeometry(0.06, 0.06, 3.4), mat(0x6b4a2a, 0.7), 0.4, 1.4, -0.6);
    oar.rotation.x = 0.7;
    gondolier.add(oar);
    gondolier.position.z = -2.6;
    g.add(gondolier);
    g.position.set(30, 0, i === 0 ? -254 : -294);
    b.scene.add(g);
    gondolas.push({ g, z: g.position.z, dir: i === 0 ? -1 : 1, riding: false, done: false, dwell: 0 });
  }
  b.every((dt, t) => {
    for (const gd of gondolas) {
      if (gd.dwell > 0) {
        gd.dwell -= dt;
      } else {
        const speed = gd.riding ? 2.4 : 1.6;
        gd.z += gd.dir * speed * dt;
        if (gd.z < -291) {
          gd.z = -291;
          gd.dir = 1;
          gd.dwell = 6;
          if (gd.riding) gd.done = true;
        } else if (gd.z > -257) {
          gd.z = -257;
          gd.dir = -1;
          gd.dwell = 6;
          if (gd.riding) gd.done = true;
        }
      }
      gd.g.position.z = gd.z;
      gd.g.rotation.y = gd.dir > 0 ? Math.PI : 0;
      gd.g.position.y = Math.sin(t * 1.4 + gd.z) * 0.04;
      gd.g.children[gd.g.children.length - 1].rotation.z = Math.sin(t * 1.8) * 0.15;
    }
  });
  gondolas.forEach((gd, i) => {
    b.rideables.push({
      id: `gondola-${i}`,
      kind: 'gondola',
      label: 'Gondola',
      boardRadius: 8.5,
      boardPoint: (out) => out.set(30, 0.3, gd.z),
      seat: (out) => out.set(30, 0.62 + gd.g.position.y, gd.z + (gd.dir > 0 ? -0.6 : 0.6)),
      yaw: () => (gd.dir > 0 ? 0 : Math.PI),
      exitPoint: (out) => (gd.z > -260 ? out.set(30, 0.6, cz1 - 2) : gd.z < -288 ? out.set(30, 0.6, cz0 + 2) : out.set(cx0 - 1.6, 0.2, gd.z)),
      canBoard: () => ({ ok: true }),
      onBoard: () => {
        gd.riding = true;
        gd.done = false;
      },
      onExit: () => {
        gd.riding = false;
        gd.done = false;
      },
      wantsExit: () => gd.done,
      boardPrompt: 'Press [G] to hop in a gondola (the gondolier sings for free)',
      ridingPrompt: '🎶 O sole mio… riding the Venetian canal — [G] hop out',
    });
  });

  const ven = { wall: '#d9b98a', mullion: '#ecd5ad', glass: '#6d5a44', lit: '#ffe9a8', cols: 12, rows: 22, style: 0 as const, seed: 131 };
  tower(b, { x: 98, z: -266, w: 20, d: 60, h: 44, facade: ven, wash: 0xffd9a0, crownGlow: 0.7 });
  tower(b, { x: 118, z: -290, w: 24, d: 14, h: 40, facade: { ...ven, seed: 133 }, wash: 0xffd9a0, crownGlow: 0.7 });

  // Footbridge from the Venetian to the Sphere (deck at 8 m)
  const deck = mat(0xb8b2a8, 0.7, 0.15);
  stairs(b, 64, -230, '+x', 3.2, 8.4, 19, deck);
  b.box(117, 8, -230, 68, 0.4, 3.6, deck);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.3 });
  for (const s of [-1, 1]) b.box(117, 8.4, -230 + s * 1.7, 66, 1.1, 0.12, glass, true, false);
  b.zone('Venetian ↔ Sphere Footbridge', 83, 151, -232, -228);

  b.building(53, -282, 18, 72, '#e8c4b4', 'Venetian');
  b.building(98, -266, 20, 60, '#d9b98a');
  b.zone('The Venetian', 19, 130, -306, -226);
  b.crowd.performers.push({ kind: 'showgirl', x: 16, z: -262, facing: -Math.PI / 2 });
  b.crowd.tourists.push(
    { pts: [[21, -228], [21, -304]], prop: 'camera' },
    { pts: [[16, -304], [16, -228]], prop: 'yard-drink' },
    { pts: [[20, -268], [40, -268]], prop: 'camera' }
  );
  b.pickup(29, 3.3, -268, 3, 'Rialto Bridge Pack', false);
}

// ---------------------------------------------------------------- Sphere
function buildSphere(b: WorldBuilder): void {
  // The full venue (LED Exosphere, plaza, atrium, bowl and the show) lives in sphere.ts
  buildSphereVenue(b);
}

// ---------------------------------------------------------------- Palazzo
function buildPalazzo(b: WorldBuilder): void {
  b.box(34, 0, -350, 26, 9, 80, mat(0xd9c39a, 0.7), true);
  // Arcade of lit boutique arches, pilasters with lanterns, cornice, balustrade, palms (stripFronts.ts)
  palazzoFront(b, 21, -390, -310, 9, -340);
  palazzoSigns(b); // bronze marquee + gold letters on the podium and tower (stripSigns.ts)
  const gold = { wall: '#c8a46a', mullion: '#e0c38a', glass: '#7a5a34', lit: '#ffe6a8', cols: 12, rows: 26, style: 1 as const, seed: 141 };
  tower(b, { x: 70, z: -350, w: 24, d: 50, h: 60, facade: gold, metal: 0.4, wash: 0xffd9a0, crownGlow: 0.7 });
  b.building(34, -350, 26, 80, '#d9c39a', 'Palazzo');
  b.building(70, -350, 24, 50, '#c8a46a');
  b.zone('The Palazzo', 19, 100, -405, -306);
  b.crowd.tourists.push({ pts: [[16, -310], [16, -400]], prop: 'cig' });
}
