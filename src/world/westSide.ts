import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeGroup } from '../meshBake';
import type { WorldBuilder } from './builder';
import { curvedTower, stairs, tower } from './buildings';
import { buildCasinoFloor } from './casinos';
import { LedBoard, makeCarpetTexture, makePaverTexture } from './textures';
import { barCounter, basic, cypressTree, mat, mesh, neonSign, palmTree, planter } from './props';
import { waterJets } from './fountains';
import type { JetSpec } from './fountains';

/**
 * West side of Las Vegas Blvd, south → north:
 * CityCenter · Cosmopolitan · Bellagio · [Flamingo Rd] · Caesars Palace · Hard Rock (ex-Mirage) site · Treasure Island.
 * z = −(real meters north of Flamingo) / 3.2, x < 0 is west.
 */
export function buildWestSide(b: WorldBuilder): void {
  buildCityCenter(b);
  buildCosmopolitan(b);
  buildBellagio(b);
  buildCaesars(b);
  buildHardRockSite(b);
  buildTreasureIsland(b);
}

const travertine = () => {
  const m = new THREE.MeshStandardMaterial({ map: makePaverTexture('#d8ccb4', '#bfb197', 4), roughness: 0.8 });
  return m;
};

function plaza(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, m: THREE.MeshStandardMaterial): void {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  const mm = m.clone();
  mm.map = m.map!.clone();
  mm.map.needsUpdate = true;
  mm.map.repeat.set(w / 4, d / 4);
  b.floor((x0 + x1) / 2, (z0 + z1) / 2, w, d, mm, 0.01);
}

// ---------------------------------------------------------------- CityCenter
function buildCityCenter(b: WorldBuilder): void {
  const silver = { wall: '#a9b8c6', mullion: '#cfd8e0', glass: '#6d8396', lit: '#fff2cf', cols: 10, rows: 18, style: 2 as const, seed: 3 };
  // The Shops at Crystals — faceted metal-and-glass front on the Strip
  const crystal = mat(0xcfd6de, 0.25, 0.85);
  b.box(-40, 0, 232, 38, 9, 40, mat(0xb9c3cc, 0.4, 0.6), true);
  for (let i = 0; i < 7; i++) {
    const p = mesh(new THREE.BoxGeometry(8, 10 + (i % 3) * 3, 8), crystal, -28 - (i % 3) * 9, 9 + (i % 3), 216 + i * 5.5, true);
    p.rotation.set(0.35 * ((i % 2) * 2 - 1), i * 0.6, 0.4);
    b.add(p);
  }
  b.add(neonSign('CRYSTALS', '#101418', '#e8f4ff', 9, 1.6, 'THE SHOPS AT CRYSTALS'), -20.8, 6, 232, -Math.PI / 2);
  tower(b, { x: -40, z: 280, w: 16, d: 22, h: 52, facade: silver, metal: 0.6, rough: 0.25 });
  b.add(neonSign('WALDORF ASTORIA', '#0d0f14', '#f6e7c8', 10, 1.4), -31.8, 46, 280, -Math.PI / 2);
  // ARIA: curving blue-silver low-e glass with sawtooth sunshade fins washed by podium floodlights
  curvedTower(b, -60, 268, 62, Math.PI * 0.86, Math.PI * 1.24, 6, 16, 56, { ...silver, glass: '#56789a', mullion: '#d8e0e8', lit: '#eef3ff', seed: 5 }, 0.7, { rough: 0.2, fins: { every: 2, depth: 0.8 }, ledFins: false, wash: 0xdce8ff, washZone: 22, washStrength: 0.6 });
  b.add(neonSign('ARIA', '#0b0d12', '#ffffff', 10, 3), -112, 50, 268, -Math.PI / 2);
  // Vdara: a slim silver crescent
  curvedTower(b, -100, 215, 46, Math.PI * 0.9, Math.PI * 1.2, 4, 13, 53, { ...silver, wall: '#c8d2da', glass: '#8aa2b8', mullion: '#eef2f5', seed: 9 }, 0.7, { crescent: true, rough: 0.2, ledFins: false, wash: 0xeef4ff, washZone: 14 });
  b.building(-40, 232, 38, 40, '#9aa6b2', 'Crystals');
  b.building(-40, 280, 16, 22, '#a9b8c6');
  b.building(-112, 268, 22, 70, '#a9b8c6', 'ARIA');
  b.zone('CityCenter • ARIA & Crystals', -150, -19, 208, 312);
  b.crowd.tourists.push({ pts: [[-21, 212], [-21, 300]], prop: 'bag' }, { pts: [[-24, 300], [-24, 214]], prop: 'camera' });
}

// ---------------------------------------------------------------- Cosmopolitan
function buildCosmopolitan(b: WorldBuilder): void {
  const blueGlass = { wall: '#3a4a5c', mullion: '#55677c', glass: '#1d2938', lit: '#d7f0ff', cols: 9, rows: 20, style: 2 as const, seed: 11 };
  tower(b, { x: -82, z: 170, w: 18, d: 14, h: 56, facade: blueGlass, metal: 0.7, rough: 0.2 });
  tower(b, { x: -82, z: 196, w: 18, d: 14, h: 56, facade: { ...blueGlass, seed: 13 }, metal: 0.7, rough: 0.2 });
  b.building(-82, 183, 18, 40, '#3a4a5c', 'Cosmopolitan');

  // Podium: casino floor with the 3-level Chandelier bar and the VIP lounge
  buildCasinoFloor(b, {
    id: 'cosmo',
    casinoName: 'The Cosmopolitan',
    minX: -62,
    maxX: -24,
    minZ: 160,
    maxZ: 204,
    height: 12,
    entrance: { side: 'east', at: 182, width: 8 },
    carpet: ['#1c1230', '#b06cff', '#ff6cd6'],
    wall: 0x22202e,
    ceiling: 0x141220,
    ceilingGlow: 0x3a1a5c,
    light: 0xd59cff,
    slots: { accent: '#d68cff', topper: 0xc86bff, rows: [{ x: -30, z: 166, count: 5, along: 'x', facing: 0 }] },
    slotLabel: 'Cosmo Neon Slots',
    tables: [
      { game: 'blackjack', x: -30, z: 196, rot: Math.PI, label: 'Cosmo Blackjack' },
      { game: 'blackjack', x: -57, z: 172, rot: Math.PI / 2, label: 'VIP High-Limit Blackjack', vipOnly: true },
      { game: 'roulette', x: -57, z: 192, rot: Math.PI / 2, label: 'VIP High-Limit Roulette', vipOnly: true },
    ],
    felt: 0x2a0f45,
    guard: { kick: [-16, 182] },
    pickups: [
      { x: -58, z: 182, y: 1.2, amount: 12, label: 'VIP Lounge Cigar Humidor!' },
      { x: -28, z: 172, amount: 3, label: 'Cosmo Slot Bank Pack' },
    ],
    tourists: [
      { pts: [[-28, 176], [-44, 176], [-44, 190], [-28, 190]], prop: 'yard-drink' },
      { pts: [[-36, 168], [-36, 198]], prop: 'cig' },
    ],
  });

  // The Chandelier: three levels of crystal strands around a circular bar
  const cx = -40;
  const cz = 182;
  const strands: THREE.BufferGeometry[] = [];
  for (let ring = 0; ring < 4; ring++) {
    const r = 2.2 + ring * 1.1;
    const n = 26 + ring * 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.2;
      const top = 11.8;
      const len = 3 + ((i * 7 + ring * 3) % 5) * 0.9 + ring * 1.2;
      const g = new THREE.CylinderGeometry(0.035, 0.035, len, 4);
      g.translate(cx + Math.cos(a) * r, top - len / 2, cz + Math.sin(a) * r);
      strands.push(g);
    }
  }
  const crystals = mergeGeometries(strands)!;
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0xf4e9ff, emissive: 0xd59cff, emissiveIntensity: 1.2, roughness: 0.1, metalness: 0.3 });
  const chandelier = new THREE.Mesh(crystals, crystalMat);
  b.add(chandelier);
  b.every((_dt, t) => {
    crystalMat.emissiveIntensity = 1.0 + Math.sin(t * 1.3) * 0.25;
    crystalMat.emissive.setHSL(0.78 + Math.sin(t * 0.15) * 0.06, 0.8, 0.6);
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const seg = barCounter(2.6, 0x1a1a22, 0x3a1f4a);
    seg.position.set(cx + Math.cos(a) * 2.8, 0, cz + Math.sin(a) * 2.8);
    seg.rotation.y = -a - Math.PI / 2;
    b.add(seg);
  }
  b.collider(cx - 3.4, cx + 3.4, cz - 3.4, cz + 3.4, 0, 1.15, true);
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(cx + 4.4, 0, cz), radius: 2.5, label: 'Chandelier Bar' });
  // Level 1.5 mezzanine wrapping the chandelier (walk up the stairs inside)
  const mezz = mat(0x2a2236, 0.4, 0.4);
  b.box(cx, 4.2, cz - 7.5, 14, 0.35, 3, mezz);
  b.box(cx, 4.2, cz + 7.5, 14, 0.35, 3, mezz);
  stairs(b, cx + 7, cz - 7.5, '+x', 3, 4.2, 6, mezz);
  b.pickup(cx, 4.95, cz + 7.5, 3, 'Chandelier 1.5 Rail Pack', true);
  b.zone('The Chandelier', cx - 8, cx + 8, cz - 9, cz + 9);

  // VIP lounge behind the velvet rope (west end of the floor)
  const ropeX = -51.5;
  const gold = mat(0xf2c14e, 0.2, 0.9);
  const velvet = mat(0x9b0f2a, 0.6);
  for (let z = 163; z <= 201; z += 3.8) {
    b.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.0, 8), gold, ropeX, 0.5, z));
    b.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), gold, ropeX, 1.02, z));
  }
  const rope = mesh(new THREE.BoxGeometry(0.06, 0.06, 38), velvet, ropeX, 0.85, 182);
  b.add(rope);
  const ropeWall = b.collider(ropeX - 0.4, ropeX + 0.4, 161, 203, 0, 5, true);
  b.vipColliders.push(ropeWall);
  b.add(neonSign('VIP', '#1a0a14', '#ffd24d', 3, 1.1, 'HIGH-ROLLER LOUNGE', 0.1), ropeX + 0.3, 3.6, 182, Math.PI / 2);
  b.shopSpots.push({ kind: 'vip-host', position: new THREE.Vector3(ropeX + 2.2, 0, 182), radius: 2.6, label: 'VIP Host' });
  const sofa = mat(0x3a0f24, 0.7);
  for (const z of [166, 200]) b.add(mesh(new THREE.BoxGeometry(2.4, 0.7, 5), sofa, -60, 0.35, z, true));
  b.zone('VIP High-Roller Lounge', -62, ropeX, 160, 204);

  // Strip marquee: the giant LED pylon
  const led = new LedBoard('COSMOPOLITAN', ['JUST THE RIGHT AMOUNT OF WRONG', 'CHANDELIER BAR NOW POURING', 'BOULEVARD POOL • ROOFTOP', 'FREE ENTRY • 21+'], ['#7a2cff', '#ff2c8a', '#00b3ff', '#ff9a00']);
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 8), [basic(0x111111), basic(0x111111), basic(0x111111), basic(0x111111), new THREE.MeshBasicMaterial({ map: led.tex }), new THREE.MeshBasicMaterial({ map: led.tex })]);
  pylon.rotation.y = Math.PI / 2;
  b.add(pylon, -21.2, 11, 158);
  b.collider(-25.5, -16.9, 157.4, 158.6, 0, 22, true);
  b.every((_dt, t) => led.draw(t));

  // Boulevard Pool on the podium roof, overlooking the Strip
  const pool = new THREE.MeshStandardMaterial({ color: 0x2bb6d9, roughness: 0.05, metalness: 0.2, emissive: 0x0b4a66, emissiveIntensity: 0.6 });
  b.floor(-40, 182, 14, 26, pool, 12.86);
  b.waterZones.push({ name: 'Boulevard Pool', minX: -47, maxX: -33, minZ: 169, maxZ: 195, y: 12.8 });
  const lounger = mat(0xf4f1ea, 0.6);
  for (let z = 168; z <= 196; z += 4) {
    b.add(mesh(new THREE.BoxGeometry(1.8, 0.35, 0.8), lounger, -29, 13, z));
    b.add(mesh(new THREE.BoxGeometry(1.8, 0.35, 0.8), lounger, -51, 13, z));
  }
  b.add(palmTree(5, false, 3), -27, 12.8, 162);
  b.add(palmTree(5, false, 4), -27, 12.8, 202);
  const railGlass = new THREE.MeshStandardMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.3 });
  b.box(-24.3, 12.8, 182, 0.15, 1.1, 44, railGlass, true, false);
  stairs(b, -62, 157.2, '+x', 2.6, 12.8, 32, mat(0x3a3a46, 0.6));
  b.box(-28.5, 0, 158.4, 3.5, 12.8, 3.6, mat(0x3a3a46, 0.6));
  b.pickup(-29, 13.6, 196, 4, 'Boulevard Pool Cabana Pack', false);
  b.zone('Boulevard Pool (Cosmopolitan Rooftop)', -62, -24, 160, 204);
  b.zone('The Cosmopolitan', -100, -19, 155, 207);
  b.building(-43, 182, 38, 44, '#2a2440', 'Cosmo');
  b.staticMarkers.push({ x: -40, z: 182, color: '#d59cff', glyph: '★', size: 3 });
}

// ---------------------------------------------------------------- Bellagio
function buildBellagio(b: WorldBuilder): void {
  const lakeX0 = -72;
  const lakeX1 = -21.4;
  const lakeZ0 = 32;
  const lakeZ1 = 98;
  const water = new THREE.MeshStandardMaterial({ color: 0x2e8b9a, roughness: 0.06, metalness: 0.55, emissive: 0x0a3040, emissiveIntensity: 0.35 });
  b.floor((lakeX0 + lakeX1) / 2, (lakeZ0 + lakeZ1) / 2, lakeX1 - lakeX0, lakeZ1 - lakeZ0, water, 0.06);
  b.waterZones.push({ name: 'Lake Bellagio', minX: lakeX0, maxX: lakeX1, minZ: lakeZ0, maxZ: lakeZ1, y: 0.06 });
  b.feature({ kind: 'water', x: (lakeX0 + lakeX1) / 2, z: (lakeZ0 + lakeZ1) / 2, w: lakeX1 - lakeX0, d: lakeZ1 - lakeZ0, color: '#2e8b9a' });

  // Italianate balustrade with lamp posts around the lake
  const stone = mat(0xe9dcc0, 0.7);
  const globe = basic(0xffe4a8);
  b.box(lakeX1 + 0.5, 0, (lakeZ0 + lakeZ1) / 2, 0.6, 1.05, lakeZ1 - lakeZ0 + 1, stone);
  b.box((lakeX0 + lakeX1) / 2, 0, lakeZ0 - 0.5, lakeX1 - lakeX0, 1.05, 0.6, stone);
  b.box((lakeX0 + lakeX1) / 2, 0, lakeZ1 + 0.5, lakeX1 - lakeX0, 1.05, 0.6, stone);
  b.box(lakeX0 - 0.5, 0, (lakeZ0 + lakeZ1) / 2, 0.6, 1.05, lakeZ1 - lakeZ0 + 1, stone);
  for (let z = lakeZ0 + 2; z <= lakeZ1; z += 6.5) {
    b.add(mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), stone, lakeX1 + 0.5, 1.3, z));
    b.add(mesh(new THREE.SphereGeometry(0.28, 10, 8), globe, lakeX1 + 0.5, 2.8, z));
  }
  for (let z = lakeZ0 + 5; z <= lakeZ1 - 2; z += 13) b.add(cypressTree(5 + (z % 3)), -18.4, 0, z);
  for (let z = lakeZ0 + 8; z <= lakeZ1; z += 22) b.add(planter(2, 2, 0xffd34d), -18.2, 0, z + 6);

  // Fountains: three lines of shooters + a ring of "super shooters" (one instanced draw, see fountains.ts)
  const jets: JetSpec[] = [];
  const lines: Array<{ x: number; n: number }> = [
    { x: -32, n: 20 },
    { x: -44, n: 26 },
    { x: -56, n: 20 },
  ];
  lines.forEach((ln, li) => {
    for (let i = 0; i < ln.n; i++) {
      const z = lakeZ0 + 4 + (i / (ln.n - 1)) * (lakeZ1 - lakeZ0 - 8);
      jets.push({ x: ln.x + Math.sin(i * 0.5) * (li === 1 ? 4 : 1.5), z, line: li, i, n: ln.n });
    }
  });
  const water3d = waterJets(b, jets);
  const glowA = b.light(0x76ecff, 0, 40, -44, 4, 50);
  const glowB = b.light(0xffb86b, 0, 40, -44, 4, 80);
  let showClock = 0;
  b.every((dt, t, night) => {
    showClock += dt;
    const period = night > 0.5 ? 40 : 70;
    const showT = showClock % period;
    const onShow = showT < 24;
    const intensity = onShow ? Math.min(1, showT / 1.5, (24 - showT) / 1.5) : 0;
    for (let k = 0; k < jets.length; k++) {
      const j = jets[k];
      let h: number;
      if (!onShow) {
        h = 0.05;
      } else {
        const wave = Math.sin(t * 2.4 - j.i * 0.42 + j.line * 1.3);
        const sweep = Math.sin(showT * 0.7 + (j.i / j.n) * Math.PI * 2);
        const base = j.line === 1 ? 22 : 13;
        h = Math.max(0.4, (0.5 + 0.5 * wave) * base * (0.55 + 0.45 * sweep));
        if (showT > 18 && showT < 21) h = (j.line === 1 ? 46 : 30) * (0.8 + 0.2 * Math.sin(j.i));
        h *= intensity;
      }
      water3d.set(k, h, j.line === 1 ? 0 : (j.line === 0 ? -1 : 1) * 0.25 * Math.sin(t * 1.6 + j.i * 0.3) * intensity);
    }
    water3d.commit(t, night, intensity);
    const hue = (t * 0.05) % 1;
    glowA.color.setHSL(hue, 0.8, 0.65);
    glowB.color.setHSL((hue + 0.35) % 1, 0.8, 0.65);
    glowA.intensity = (8 + night * 20) * intensity;
    glowB.intensity = (8 + night * 20) * intensity;
  });
  b.zone('Bellagio Fountains', lakeX0, -11.6, lakeZ0, lakeZ1);
  b.crowd.performers.push({ kind: 'elvis', x: -15.5, z: 60, facing: Math.PI / 2 }, { kind: 'showgirl', x: -15.2, z: 84, facing: Math.PI / 2 });
  b.crowd.tourists.push(
    { pts: [[-17, 30], [-17, 98]], prop: 'camera' },
    { pts: [[-15, 96], [-15, 34]], prop: 'cig' },
    { pts: [[-17.6, 40], [-17.6, 90]], prop: 'yard-drink' },
    { pts: [[-14, 70], [-14, 36]], prop: 'bag' },
    { pts: [[-16.5, 104], [-16.5, 150]], prop: 'camera' }
  );
  b.pickup(-19.6, 1.25, 52, 2, 'Fountain Balustrade Smokes', false);
  b.pickup(-19.6, 1.25, 88, 2, 'Ash-Stand Pack by the Fountains', false);

  // F1 Grand Prix teardown (late Nov 2026): half-dismantled grandstand + barriers along the lake front
  const steel = mat(0x6d737c, 0.4, 0.7);
  const tier = mat(0x30343c, 0.6, 0.4);
  for (let i = 0; i < 5; i++) {
    const y = 1.4 + i * 1.1;
    const x = -24 - i * 1.6;
    b.box(x, y, 66, 1.6, 0.25, i < 3 ? 30 : 14, tier);
  }
  for (let z = 52; z <= 80; z += 4) {
    for (let i = 0; i < 5; i++) b.add(mesh(new THREE.BoxGeometry(0.12, 1.4 + i * 1.1, 0.12), steel, -24 - i * 1.6, (1.4 + i * 1.1) / 2, z));
  }
  b.add(neonSign('F1 TEARDOWN', '#101010', '#ff3b1f', 6, 1.1, 'CREWS WORKING • GRANDSTAND CLOSED', 0.1), -20.6, 3.2, 44, -Math.PI / 2);
  const jersey = mat(0xd9d6cf, 0.85);
  for (let z = 34; z < 98; z += 4.4) {
    if (Math.abs(z - 60) < 3) continue;
    b.box(-12.15, 0, z, 0.55, 0.85, 3.6, jersey, false, false);
  }
  b.pickup(-28.8, 6.2, 60, 3, 'Grandstand Crew Pack', false);

  // North walkway from the corner (bridge stairs land here) to the casino
  const trav = travertine();
  plaza(b, -19, -80, 16, 31, trav);
  for (let x = -30; x > -76; x -= 9) b.add(planter(1.6, 1.6, 0xff6aa2), x, 0, 17.6);

  buildCasinoFloor(b, {
    id: 'bellagio',
    casinoName: 'Bellagio',
    minX: -124,
    maxX: -80,
    minZ: 18,
    maxZ: 62,
    height: 11,
    entrance: { side: 'east', at: 26, width: 7 },
    extraEntrances: [{ side: 'south', at: -94, width: 6 }],
    carpet: ['#144734', '#d4a64a', '#f2d48a'],
    wall: 0xc99c6d,
    ceiling: 0xebd9bc,
    light: 0xffd78c,
    slots: {
      accent: '#ffbe3d',
      topper: 0xffd147,
      rows: [
        { x: -86, z: 44, count: 6, along: 'z', facing: Math.PI / 2 },
        { x: -118, z: 42, count: 6, along: 'z', facing: -Math.PI / 2 },
      ],
    },
    slotLabel: 'Bellagio High-Limit Slots',
    tables: [
      { game: 'roulette', x: -100, z: 26, label: 'Bellagio Roulette' },
      { game: 'blackjack', x: -100, z: 40, label: 'Bellagio Blackjack' },
      { game: 'craps', x: -101, z: 54, label: 'Bellagio Craps' },
    ],
    felt: 0x136f45,
    guard: { kick: [-70, 24] },
    pickups: [
      { x: -88, z: 58, amount: 3, label: 'Bellagio Slot Bar Pack' },
      { x: -100, z: 40, y: 1.35, amount: 5, label: 'Bellagio Blackjack Table Pack!' },
      { x: -120, z: 22, amount: 3, label: 'Bellagio Lounge Smokes' },
    ],
    tourists: [
      { pts: [[-84, 22], [-116, 22], [-116, 58], [-84, 58]], prop: 'cig' },
      { pts: [[-94, 30], [-94, 52]], prop: 'yard-drink' },
    ],
  });
  // Dale Chihuly-style glass-flower ceiling piece in the lobby corner
  const blossomColors = [0xff5e8e, 0xffc63d, 0x3bdcff, 0x76ff7a, 0xff7b29, 0xd16bff];
  for (let i = 0; i < 24; i++) {
    const c = blossomColors[i % blossomColors.length];
    b.add(mesh(new THREE.IcosahedronGeometry(0.4 + (i % 3) * 0.12, 0), mat(c, 0.15, 0, { emissive: c, emissiveIntensity: 0.6 }), -84 - (i % 4) * 1.4, 9.6 + (i % 2) * 0.3, 20.5 + Math.floor(i / 4) * 1.3));
  }

  // Conservatory & Botanical Gardens — "Postcards From Christmas" (Nov 13 2026 – Jan 2 2027)
  buildConservatory(b);

  // Bellagio Dr (main drive, signalised at the Strip) + porte-cochère
  const drive = mat(0x2b2b30, 0.85);
  b.floor(-52, 104.5, 66, 9, drive, 0.015);
  b.add(mesh(new THREE.BoxGeometry(16, 0.6, 11), mat(0xe9dcc0, 0.6), -96, 6, 105, true));
  for (const [px, pz] of [
    [-89, 100.5],
    [-103, 100.5],
    [-89, 109.5],
    [-103, 109.5],
  ]) b.box(px, 0, pz, 0.8, 6, 0.8, mat(0xe9dcc0, 0.6), true);
  const led = new LedBoard('BELLAGIO', ['FOUNTAINS EVERY 30 MINUTES', 'CONSERVATORY: POSTCARDS FROM CHRISTMAS', 'RESORT & CASINO', 'FREE • OPEN 24 HOURS'], ['#d4a64a', '#1f6f5a', '#a8323e', '#2c5fa8'], 512, 256);
  const signM = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.6), [basic(0x2a2016), basic(0x2a2016), basic(0x2a2016), basic(0x2a2016), new THREE.MeshBasicMaterial({ map: led.tex }), new THREE.MeshBasicMaterial({ map: led.tex })]);
  signM.rotation.y = Math.PI / 2;
  b.add(signM, -20.6, 6.5, 114);
  b.add(mesh(new THREE.BoxGeometry(1.4, 4, 3), mat(0xe9dcc0, 0.6), -20.6, 2, 114));
  b.collider(-21.4, -19.8, 112.5, 115.5, 0, 9, true);
  b.every((_dt, t) => led.draw(t));

  // South gardens between the drive and Cosmopolitan
  plaza(b, -19, -70, 112, 155, trav);
  for (let z = 120; z < 154; z += 8) b.add(cypressTree(5.5), -24, 0, z);
  b.add(planter(10, 3, 0xff8a3d), -40, 0, 130);
  b.add(planter(10, 3, 0xff4d7a), -40, 0, 146);

  // The crescent tower (cream/ochre, 36 floors)
  curvedTower(b, -65, 70, 86, Math.PI * 0.84, Math.PI * 1.16, 6, 16, 47, { wall: '#e9dcc0', mullion: '#f5ecd8', glass: '#7c8a8f', lit: '#ffe199', cols: 12, rows: 22, style: 0, seed: 21 });
  const crown = neonSign('BELLAGIO', '#1d120a', '#ffd573', 18, 3);
  b.add(crown, -142, 43, 70, -Math.PI / 2);
  b.building(-150, 70, 18, 74, '#e9dcc0', 'Bellagio');
  b.building(-102, 40, 44, 44, '#c99c6d');
  b.zone('Bellagio', -150, -19, 10, 155);
}

function buildConservatory(b: WorldBuilder): void {
  const minX = -112;
  const maxX = -80;
  const minZ = 66;
  const maxZ = 98;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  b.floor(cx, cz, maxX - minX, maxZ - minZ, new THREE.MeshStandardMaterial({ map: makeCarpetTexture('#c9b89a', '#a8936e'), roughness: 0.8 }), 0.03);
  const wall = mat(0xe9dcc0, 0.7);
  b.box(minX, 0, cz, 1, 9, maxZ - minZ, wall, true);
  b.box(cx, 0, minZ, maxX - minX, 9, 1, wall, true);
  b.box(cx, 0, maxZ, maxX - minX, 9, 1, wall, true);
  b.box(maxX, 0, minZ + 6.5, 1, 9, 13, wall, true);
  b.box(maxX, 0, maxZ - 6.5, 1, 9, 13, wall, true);
  b.box(maxX, 4.6, cz, 1, 4.4, 8, wall, true);
  const glassRoof = new THREE.MeshStandardMaterial({ color: 0xd9f4ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.2 });
  const roof = mesh(new THREE.BoxGeometry(maxX - minX, 0.3, maxZ - minZ), glassRoof, cx, 9.2, cz);
  b.add(roof);
  for (let x = minX + 4; x < maxX; x += 4) b.add(mesh(new THREE.BoxGeometry(0.15, 0.25, maxZ - minZ), mat(0x5b6068, 0.4, 0.7), x, 9.4, cz));
  b.light(0xfff0d0, 18, 30, cx, 7.5, cz, 0.6);

  // East bed: the 45-ft tree
  const tree = new THREE.Group();
  for (let i = 0; i < 5; i++) tree.add(mesh(new THREE.ConeGeometry(3.4 - i * 0.6, 2.6, 12), mat(0x1f5a32, 0.85), 0, 1.4 + i * 1.55, 0, true));
  const ornament = [0xff3b3b, 0xffd24d, 0xffffff, 0x3bb0ff];
  for (let i = 0; i < 40; i++) {
    const h = 1 + (i / 40) * 7.4;
    const r = 3.2 - (h / 9) * 3;
    const a = i * 2.4;
    tree.add(mesh(new THREE.SphereGeometry(0.16, 6, 5), basic(ornament[i % 4]), Math.cos(a) * r, h, Math.sin(a) * r));
  }
  tree.add(mesh(new THREE.OctahedronGeometry(0.6, 0), basic(0xffe066), 0, 9.6, 0));
  b.add(tree, maxX - 8, 0, cz);
  b.collider(maxX - 11, maxX - 5, cz - 3, cz + 3, 0, 9, true);

  // West bed: the Bellagio Express train with elves
  const train = new THREE.Group();
  const red = mat(0xb3121f, 0.4, 0.3);
  const gold = mat(0xf2c14e, 0.25, 0.85);
  train.add(mesh(new THREE.BoxGeometry(1.6, 1.4, 3), red, 0, 1.0, 0, true));
  train.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.4, 14), mat(0x1c1c22, 0.4, 0.6), 0, 1.3, 2.2));
  train.children[1].rotation.x = Math.PI / 2;
  train.add(mesh(new THREE.CylinderGeometry(0.25, 0.32, 1.0, 10), gold, 0, 2.3, 3));
  for (let c = 1; c <= 2; c++) train.add(mesh(new THREE.BoxGeometry(1.5, 1.0, 2.4), c === 1 ? mat(0x1f6b3a, 0.5) : red, 0, 0.8, -c * 2.8, true));
  for (let i = 0; i < 4; i++) {
    const elf = new THREE.Group();
    elf.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.6, 8), mat(0x1f8a3a, 0.6), 0, 0.3, 0));
    elf.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(0xf2c8a8, 0.6), 0, 0.75, 0));
    elf.add(mesh(new THREE.ConeGeometry(0.16, 0.4, 8), mat(0xc4141c, 0.6), 0, 1.0, 0));
    train.add(elf);
    elf.position.set((i % 2 ? 0.3 : -0.3), 1.3, -2.8 * (1 + (i >> 1)));
  }
  b.add(train, minX + 7, 0, cz);
  b.collider(minX + 6, minX + 8, cz - 9, cz + 5, 0, 2, true);

  // North bed: drummer bear
  const bear = new THREE.Group();
  const fur = mat(0x8a5a32, 0.9);
  bear.add(mesh(new THREE.SphereGeometry(1.1, 14, 12), fur, 0, 1.4, 0, true));
  bear.add(mesh(new THREE.SphereGeometry(0.75, 14, 12), fur, 0, 2.9, 0));
  for (const s of [-1, 1]) bear.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), fur, s * 0.55, 3.5, 0));
  bear.add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.9, 16), mat(0xc4141c, 0.4), 0, 1.4, 1.1));
  bear.add(mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 16), gold, 0, 1.88, 1.1));
  b.add(bear, cx, 0, minZ + 5);
  b.collider(cx - 1.3, cx + 1.3, minZ + 3.6, minZ + 7, 0, 3.5, true);

  // South bed: golden puppy by a fireplace + the gold North Pole mailbox
  b.add(mesh(new THREE.BoxGeometry(4, 3.2, 1.2), mat(0x8a3a2a, 0.8), cx, 1.6, maxZ - 1.4, true));
  b.add(mesh(new THREE.BoxGeometry(2, 1.4, 0.4), basic(0xff8a2a), cx, 0.9, maxZ - 0.95));
  const pup = new THREE.Group();
  const pupMat = mat(0xd9a03a, 0.6, 0.4);
  pup.add(mesh(new THREE.SphereGeometry(0.5, 12, 10), pupMat, 0, 0.55, 0));
  pup.children[0].scale.set(0.8, 0.8, 1.3);
  pup.add(mesh(new THREE.SphereGeometry(0.34, 10, 8), pupMat, 0, 1.05, 0.5));
  for (const s of [-1, 1]) pup.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), pupMat, s * 0.25, 1.0, 0.45));
  b.add(pup, cx + 2.4, 0, maxZ - 3.2, Math.PI);
  const mailbox = new THREE.Group();
  mailbox.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.3, 8), gold, 0, 0.65, 0));
  mailbox.add(mesh(new THREE.BoxGeometry(0.6, 0.5, 0.8), gold, 0, 1.5, 0));
  b.add(mailbox, cx - 3, 0, maxZ - 3);
  b.pickup(cx - 3, 2.1, maxZ - 3, 3, 'Letter-to-Santa Mailbox Smokes', false);
  for (let i = 0; i < 10; i++) b.add(cypressTree(2.4), minX + 3 + (i % 5) * 6, 0, i < 5 ? minZ + 2 : maxZ - 2);

  b.zone('Bellagio Conservatory • Postcards From Christmas', minX, maxX, minZ, maxZ);
  b.crowd.tourists.push({ pts: [[-84, 70], [-108, 70], [-108, 94], [-84, 94]], prop: 'camera' });
  b.building(cx, cz, maxX - minX, maxZ - minZ, '#d9f4ff', 'Conservatory');
  b.staticMarkers.push({ x: maxX - 8, z: cz, color: '#5cff8a', glyph: '🎄', size: 2.8 });
}

// ---------------------------------------------------------------- Caesars Palace
function buildCaesars(b: WorldBuilder): void {
  const trav = travertine();
  plaza(b, -19, -56, -10, -118, trav);
  const marble = mat(0xf2efe6, 0.55);
  const water = new THREE.MeshStandardMaterial({ color: 0x3fa6c7, roughness: 0.05, metalness: 0.4, emissive: 0x0d3a4a, emissiveIntensity: 0.4 });

  // Brahma Shrine near the corner (real: just north of the Flamingo corner)
  const shrine = new THREE.Group();
  shrine.add(mesh(new THREE.BoxGeometry(3.4, 0.6, 3.4), marble, 0, 0.3, 0));
  for (const [x, z] of [
    [-1.3, -1.3],
    [1.3, -1.3],
    [-1.3, 1.3],
    [1.3, 1.3],
  ]) shrine.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 8), mat(0xf2c14e, 0.25, 0.85), x, 2.1, z));
  shrine.add(mesh(new THREE.ConeGeometry(2.5, 2.4, 4), mat(0xf2c14e, 0.25, 0.85), 0, 4.8, 0));
  shrine.children[shrine.children.length - 1].rotation.y = Math.PI / 4;
  shrine.add(mesh(new THREE.SphereGeometry(0.55, 12, 10), mat(0xf2c14e, 0.2, 0.9), 0, 1.4, 0));
  b.add(shrine, -30, 0, -37);
  b.collider(-31.7, -28.3, -38.7, -35.3, 0, 0.6);
  b.zone('Brahma Shrine', -34, -26, -41, -33);

  // Fountain pools + statues + cypress rows
  for (const [z0, z1] of [
    [-44, -60],
    [-70, -86],
  ]) {
    b.floor(-38, (z0 + z1) / 2, 10, Math.abs(z1 - z0), water, 0.36);
    b.box(-38, 0, (z0 + z1) / 2, 11, 0.35, Math.abs(z1 - z0) + 1, marble);
    for (let i = 0; i < 6; i++) {
      const jet = mesh(new THREE.CylinderGeometry(0.06, 0.18, 2.4, 6), new THREE.MeshBasicMaterial({ color: 0xe6fbff, transparent: true, opacity: 0.7 }), -38 + ((i % 2) * 2 - 1) * 2.5, 1.55, z0 - 1.5 - (i >> 1) * 5);
      b.add(jet);
    }
  }
  const statue = (x: number, z: number, scale = 1) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.4, 2, 1.4), marble, 0, 1, 0, true));
    g.add(mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 10), marble, 0, 3.1, 0, true));
    g.add(mesh(new THREE.SphereGeometry(0.32, 10, 8), marble, 0, 4.5, 0));
    g.add(mesh(new THREE.BoxGeometry(0.2, 1.4, 0.2), marble, 0.5, 3.5, 0));
    g.scale.setScalar(scale);
    b.add(g, x, 0, z);
    b.collider(x - 0.7 * scale, x + 0.7 * scale, z - 0.7 * scale, z + 0.7 * scale, 0, 2 * scale, true);
  };
  statue(-30, -65);
  statue(-46, -65);
  statue(-26, -94, 1.5); // Julius Caesar, at the main entrance
  b.zone('Julius Caesar Statue', -30, -21, -99, -89);
  for (let z = -22; z > -116; z -= 7) b.add(cypressTree(6), -21.5, 0, z);

  // Colonnade + casino
  for (let z = -26; z >= -80; z -= 4.5) {
    b.add(mesh(new THREE.CylinderGeometry(0.5, 0.58, 8, 14), marble, -54, 4, z, true));
    b.collider(-54.6, -53.4, z - 0.6, z + 0.6, 0, 8, true);
  }
  b.add(mesh(new THREE.BoxGeometry(3, 1.2, 58), marble, -54, 8.6, -53));
  buildCasinoFloor(b, {
    id: 'caesars',
    casinoName: 'Caesars Palace',
    minX: -100,
    maxX: -57,
    minZ: -80,
    maxZ: -24,
    height: 12,
    entrance: { side: 'east', at: -52, width: 8 },
    carpet: ['#3a1e12', '#d8b25a', '#7a1414'],
    wall: 0xe6dfd3,
    ceiling: 0x8cb6e8,
    ceilingGlow: 0x3b6ca8,
    light: 0xffe2a8,
    slots: { accent: '#f7d560', topper: 0xf7d560, rows: [{ x: -62, z: -40, count: 6, along: 'z', facing: Math.PI / 2 }] },
    slotLabel: 'Caesars Colosseum Slots',
    tables: [
      { game: 'craps', x: -78, z: -34, label: 'Caesars Craps' },
      { game: 'blackjack', x: -78, z: -52, label: 'Caesars Blackjack' },
      { game: 'roulette', x: -78, z: -68, label: 'Caesars Roulette' },
    ],
    felt: 0x6b1414,
    guard: { kick: [-44, -52] },
    pickups: [
      { x: -95, z: -30, amount: 3, label: 'Caesars Cocktail Lounge Pack' },
      { x: -78, z: -34, y: 1.3, amount: 5, label: 'Caesars Craps Rail Pack!' },
    ],
    tourists: [{ pts: [[-60, -28], [-96, -28], [-96, -76], [-60, -76]], prop: 'cig' }, { pts: [[-70, -44], [-70, -64]], prop: 'yard-drink' }],
  });
  b.add(neonSign('CAESARS PALACE', '#1a140d', '#f7d560', 16, 2.6, 'LAS VEGAS'), -53.2, 10.6, -53, -Math.PI / 2);

  // Forum Shops: temple-front entrance + painted-sky lobby with the boutique
  const fx0 = -46;
  const fx1 = -26;
  const fz0 = -162;
  const fz1 = -138;
  const lobbyWall = mat(0xe6dfd3, 0.6);
  b.box(fx0, 0, (fz0 + fz1) / 2, 1, 10, fz1 - fz0, lobbyWall, true);
  b.box((fx0 + fx1) / 2, 0, fz0, fx1 - fx0, 10, 1, lobbyWall, true);
  b.box((fx0 + fx1) / 2, 0, fz1, fx1 - fx0, 10, 1, lobbyWall, true);
  b.box(fx1, 0, fz0 + 4.5, 1, 10, 9, lobbyWall, true);
  b.box(fx1, 0, fz1 - 4.5, 1, 10, 9, lobbyWall, true);
  b.box(fx1, 5, (fz0 + fz1) / 2, 1, 5, 6, lobbyWall, true);
  const sky = new THREE.MeshStandardMaterial({ color: 0x8cc8ff, emissive: 0x6aa8f0, emissiveIntensity: 0.7 });
  b.box((fx0 + fx1) / 2, 10, (fz0 + fz1) / 2, fx1 - fx0, 0.5, fz1 - fz0, sky);
  b.floor((fx0 + fx1) / 2, (fz0 + fz1) / 2, fx1 - fx0, fz1 - fz0, new THREE.MeshStandardMaterial({ map: makeCarpetTexture('#d8ccb4', '#a88a5a'), roughness: 0.6 }), 0.03);
  for (let z = fz0 + 2; z <= fz1 - 2; z += 4) {
    b.add(mesh(new THREE.CylinderGeometry(0.5, 0.55, 9, 12), marble, fx1 + 2, 4.5, z, true));
    b.collider(fx1 + 1.5, fx1 + 2.5, z - 0.5, z + 0.5, 0, 9, true);
  }
  const pediment = mesh(new THREE.ConeGeometry(14, 4, 4), marble, fx1 + 2, 11.5, (fz0 + fz1) / 2);
  pediment.rotation.y = Math.PI / 4;
  pediment.scale.set(0.3, 1, 1);
  b.add(pediment);
  b.add(neonSign('THE FORUM SHOPS', '#1a140d', '#f7d560', 10, 1.4, 'AT CAESARS'), fx1 + 2.6, 8.4, (fz0 + fz1) / 2, -Math.PI / 2);
  const counter = barCounter(6, 0x111111, 0x5a3a12);
  b.add(counter, fx0 + 4, 0, -150, Math.PI / 2);
  b.collider(fx0 + 3.4, fx0 + 4.6, -153, -147, 0, 1.15, true);
  b.shopSpots.push({ kind: 'boutique', position: new THREE.Vector3(fx0 + 6.5, 0, -150), radius: 3.2, label: 'Forum Shops Boutique' });
  b.light(0xfff0d0, 16, 26, (fx0 + fx1) / 2, 8, -150, 0.7);
  b.zone('The Forum Shops at Caesars', fx0, fx1, fz0, fz1);
  b.staticMarkers.push({ x: fx0 + 6, z: -150, color: '#ffd24d', glyph: '👒', size: 2.8 });
  b.box(-68, 0, -150, 44, 14, 60, mat(0xe2d8c4, 0.7), true);
  b.box(-36, 0, -127, 20, 12, 16, mat(0xe2d8c4, 0.7), true);
  b.box(-36, 0, -172, 20, 12, 16, mat(0xe2d8c4, 0.7), true);

  // Towers (white with blue glass)
  const caesarsSkin = { wall: '#f2efe6', mullion: '#ffffff', glass: '#6e9bc5', lit: '#fff0b3', cols: 12, rows: 22, style: 0 as const, seed: 31 };
  tower(b, { x: -120, z: -50, w: 20, d: 46, h: 41, facade: caesarsSkin });
  tower(b, { x: -128, z: -104, w: 46, d: 18, h: 38, facade: { ...caesarsSkin, seed: 33 } });
  tower(b, { x: -152, z: -40, w: 14, d: 34, h: 30, facade: { ...caesarsSkin, seed: 35 } });
  b.add(neonSign('CAESARS', '#1a140d', '#f7d560', 14, 2.6), -109.8, 37, -50, -Math.PI / 2);

  b.crowd.performers.push({ kind: 'showgirl', x: -16, z: -30, facing: Math.PI / 2 }, { kind: 'showgirl', x: -17, z: -33, facing: Math.PI / 2 });
  b.crowd.tourists.push(
    { pts: [[-16, -24], [-16, -176]], prop: 'yard-drink' },
    { pts: [[-14, -170], [-14, -30]], prop: 'cig' },
    { pts: [[-30, -24], [-48, -100]], prop: 'camera' },
    { pts: [[-36, -110], [-28, -40]], prop: 'bag' }
  );
  b.pickup(-26, 0.45, -100, 2, 'Caesars Statue Plaza Pack', false);
  b.pickup(-30, 0.95, -37, 2, 'Brahma Shrine Offering Pack', false);
  b.building(-78, -52, 43, 56, '#e6dfd3', 'Caesars');
  b.building(-68, -150, 44, 60, '#e2d8c4', 'Forum Shops');
  b.building(-120, -50, 20, 46, '#f2efe6');
  b.building(-128, -104, 46, 18, '#f2efe6');
  b.zone('Caesars Palace', -150, -19, -180, -10);
}

// ---------------------------------------------------------------- Hard Rock (ex-Mirage) site
function buildHardRockSite(b: WorldBuilder): void {
  const z0 = -182;
  const z1 = -324;
  const dirt = mat(0x8a6a48, 0.95);
  b.floor(-80, (z0 + z1) / 2, 122, z0 - z1, dirt, 0.015);
  b.feature({ kind: 'plaza', x: -80, z: (z0 + z1) / 2, w: 122, d: z0 - z1, color: '#6b5238' });

  // Construction fence with windscreen banners along the Strip (gate gap at z −252)
  const screen = mat(0x1f3a2c, 0.9);
  for (const [a, c] of [
    [z0 - 1, -249],
    [-255, z1 + 1],
  ]) {
    b.box(-20.2, 0, (a + c) / 2, 0.15, 2.6, Math.abs(c - a), screen, true, false);
  }
  for (let z = z0 - 12; z > z1; z -= 26) {
    b.add(neonSign('HARD ROCK', '#0b0b0f', '#f6f6f6', 9, 1.7, 'HOTEL & CASINO • OPENING 2027', 0.06), -20.05, 1.35, z, -Math.PI / 2);
  }
  for (const z of [-249, -255]) b.add(mesh(new THREE.BoxGeometry(0.3, 3.2, 0.3), mat(0x8c8f94, 0.4, 0.6), -20.2, 1.6, z));

  // The Guitar Hotel on the old volcano site: body topped out, neck steel ~⅓ up, LED strings going in
  const blue = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.15, metalness: 0.75, emissive: 0x0c2850, emissiveIntensity: 0.2 });
  b.nightGlow(blue, 0.15, 0.55);
  const gx = -52;
  const gz = -222;
  const body = new THREE.Group();
  const lower = mesh(new THREE.CylinderGeometry(15, 15, 12, 40), blue, 0, 15, 0, true);
  lower.rotation.z = Math.PI / 2;
  const upper = mesh(new THREE.CylinderGeometry(11.5, 11.5, 12, 36), blue, 0, 36, 0, true);
  upper.rotation.z = Math.PI / 2;
  body.add(lower, upper, mesh(new THREE.BoxGeometry(12, 10, 17), blue, 0, 27, 0, true));
  // Sound hole + bridge on the Strip-facing face
  const hole = mesh(new THREE.CircleGeometry(4.2, 28), basic(0x0a1222), 6.05, 27, 0);
  hole.rotation.y = Math.PI / 2;
  body.add(hole);
  body.add(mesh(new THREE.BoxGeometry(0.6, 1.2, 9), mat(0x111111, 0.4), 6.2, 12, 0));
  // Neck: solid first third, then bare steel
  body.add(mesh(new THREE.BoxGeometry(10, 8, 5), blue, 0, 51, 0, true));
  const steel = mat(0xa0a4aa, 0.4, 0.8);
  for (let y = 55; y < 63; y += 2) {
    for (const zz of [-2.4, 2.4]) body.add(mesh(new THREE.BoxGeometry(0.35, 2, 0.35), steel, 4.6, y + 1, zz));
    body.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 5), steel, 4.6, y, 0));
  }
  // LED "strings": six lines, the first few already lit
  const stringMats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.MeshBasicMaterial({ color: i < 4 ? 0xe9f6ff : 0x3a4048 });
    stringMats.push(m);
    body.add(mesh(new THREE.BoxGeometry(0.12, 46, 0.12), m, 6.3, 34, -2.5 + i));
  }
  b.add(body, gx, 0, gz);
  b.collider(gx - 6, gx + 6, gz - 15, gz + 15, 0, 48, true);
  b.every((_dt, t, night) => {
    for (let i = 0; i < 4; i++) stringMats[i].color.setHSL((t * 0.08 + i * 0.12) % 1, 0.6, 0.55 + night * 0.25);
  });
  b.zone('Hard Rock Guitar Hotel (under construction)', -72, -20, -245, -200);

  // Tower crane, slowly slewing
  const crane = new THREE.Group();
  const yellow = mat(0xf2c230, 0.5, 0.4);
  for (let y = 0; y < 70; y += 3) {
    crane.add(mesh(new THREE.BoxGeometry(2, 0.2, 2), yellow, 0, y, 0));
    for (const [x, z] of [
      [-0.9, -0.9],
      [0.9, -0.9],
      [-0.9, 0.9],
      [0.9, 0.9],
    ]) crane.add(mesh(new THREE.BoxGeometry(0.2, 3, 0.2), yellow, x, y + 1.5, z));
  }
  const jib = new THREE.Group();
  jib.add(mesh(new THREE.BoxGeometry(48, 1.2, 1.2), yellow, 14, 0, 0));
  jib.add(mesh(new THREE.BoxGeometry(5, 3, 3), mat(0x777777, 0.6), -9, -0.6, 0));
  jib.add(mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), mat(0x222222, 0.6), 0, 1.6, 0));
  jib.add(mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), basic(0xff2a2a), 38, 1, 0));
  const hook = mesh(new THREE.BoxGeometry(0.1, 22, 0.1), mat(0x222222, 0.5), 26, -11, 0);
  jib.add(hook);
  jib.position.y = 71;
  bakeGroup(jib);
  bakeGroup(crane);
  crane.add(jib);
  b.scene.add(crane);
  crane.position.set(-34, 0, -200);
  b.collider(-35, -33, -201, -199, 0, 70, true);
  b.every((_dt, t) => {
    jib.rotation.y = Math.sin(t * 0.05) * 1.2 + 0.6;
  });

  // Old Y-shaped tower, re-glazed blue (a few gold panes left)
  const reglaze = { wall: '#2f6fb0', mullion: '#4a86c4', glass: '#24568c', lit: '#ffe8a0', cols: 8, rows: 20, style: 2 as const, seed: 41 };
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    tower(b, { x: -112 + Math.cos(a) * 14, z: -268 + Math.sin(a) * 14, w: 30, d: 11, h: 30, facade: { ...reglaze, seed: 41 + i }, rotY: -a, metal: 0.6, rough: 0.2 });
  }
  const goldPane = mat(0xd4a640, 0.2, 0.9);
  b.add(mesh(new THREE.BoxGeometry(0.2, 9, 8), goldPane, -97.8, 22, -262));

  // Site dressing: excavator, dirt piles, rebar, porta-potties, cones, field office
  const exc = new THREE.Group();
  exc.add(mesh(new THREE.BoxGeometry(3, 1, 5), mat(0x222222, 0.7), 0, 0.5, 0, true));
  exc.add(mesh(new THREE.BoxGeometry(3, 2, 3), yellow, 0, 2, 0, true));
  const arm = mesh(new THREE.BoxGeometry(0.6, 0.6, 6), yellow, 0, 3.2, 3.5);
  arm.rotation.x = -0.5;
  exc.add(arm);
  b.add(exc, -78, 0, -300, 0.7);
  b.collider(-80, -76, -303, -297, 0, 3, true);
  for (const [x, z, r] of [
    [-90, -200, 6],
    [-60, -310, 5],
    [-130, -300, 7],
  ]) b.add(mesh(new THREE.ConeGeometry(r, r * 0.6, 10), dirt, x, r * 0.3, z, true));
  for (let i = 0; i < 4; i++) b.add(mesh(new THREE.BoxGeometry(1.2, 2.3, 1.2), mat(0x2a66cc, 0.6), -26 - i * 1.4, 1.15, -300, true));
  for (let i = 0; i < 10; i++) {
    const cone = new THREE.Group();
    cone.add(mesh(new THREE.ConeGeometry(0.2, 0.7, 8), mat(0xff6a00, 0.6), 0, 0.35, 0));
    cone.add(mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), mat(0x222222, 0.7), 0, 0.02, 0));
    b.prop(cone, -24 - (i % 5) * 2, -260 - Math.floor(i / 5) * 3, 0.22, 0.7, 'cone');
  }
  b.box(-40, 0, -290, 10, 3.2, 3.6, mat(0xeeeeee, 0.6), true);
  b.add(neonSign('FIELD OFFICE', '#ffffff', '#1a1a1a', 3.4, 0.6, undefined, 0.05), -40, 2.4, -288.15);
  for (let i = 0; i < 6; i++) b.add(mesh(new THREE.BoxGeometry(6, 0.3, 0.3), mat(0x7a4a2a, 0.8, 0.4), -60, 0.15 + i * 0.32, -284 + (i % 2) * 0.2));
  b.pickup(-60, 2.4, -284, 4, "Ironworker's Lunch-Break Pack", false);
  b.zone('Hard Rock Construction Site (ex-Mirage)', -142, -19, z1, z0);
  b.building(gx, gz, 12, 30, '#2f6fb0', 'Guitar Hotel');
  b.building(-112, -268, 50, 50, '#2f6fb0', 'Hard Rock');
  b.crowd.tourists.push({ pts: [[-16, -186], [-16, -320]], prop: 'camera' }, { pts: [[-14, -318], [-14, -190]], prop: 'none' });
}

// ---------------------------------------------------------------- Treasure Island
function buildTreasureIsland(b: WorldBuilder): void {
  const water = new THREE.MeshStandardMaterial({ color: 0x1f6f80, roughness: 0.08, metalness: 0.5, emissive: 0x08303a, emissiveIntensity: 0.3 });
  const lx0 = -64;
  const lx1 = -24;
  const lz0 = -394;
  const lz1 = -332;
  b.floor((lx0 + lx1) / 2, (lz0 + lz1) / 2, lx1 - lx0, lz1 - lz0, water, 0.05);
  b.waterZones.push({ name: "Sirens' Cove", minX: lx0, maxX: lx1, minZ: lz0, maxZ: lz1, y: 0.05 });
  b.feature({ kind: 'water', x: (lx0 + lx1) / 2, z: (lz0 + lz1) / 2, w: lx1 - lx0, d: lz1 - lz0, color: '#1f6f80' });
  const plank = mat(0x7a5232, 0.85);
  b.box(-21.8, 0, (lz0 + lz1) / 2, 4.4, 0.5, lz1 - lz0 + 4, plank);
  for (let z = lz1; z >= lz0; z -= 4) b.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.6, 6), plank, -23.9, 0.8, z));
  // Rope-and-plank bridge across the cove to the casino doors
  b.box(-44, 0, -363, 40, 0.5, 3, plank);

  const ship = (x: number, z: number, facing: number, hull: number) => {
    const g = new THREE.Group();
    const wood = mat(hull, 0.8);
    g.add(mesh(new THREE.BoxGeometry(5, 3, 16), wood, 0, 1.5, 0, true));
    const bow = mesh(new THREE.ConeGeometry(2.5, 5, 4), wood, 0, 1.5, 10.2);
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.scale.set(1, 1, 0.6);
    g.add(bow);
    g.add(mesh(new THREE.BoxGeometry(5.2, 1.6, 4), wood, 0, 3.8, -6));
    const sail = mat(0xe9dfc8, 0.9, 0, { side: THREE.DoubleSide });
    for (const [mz, mh] of [
      [-3, 16],
      [3, 18],
      [8, 12],
    ]) {
      g.add(mesh(new THREE.CylinderGeometry(0.18, 0.25, mh, 8), mat(0x4a3220, 0.8), 0, 3 + mh / 2, mz, true));
      for (let s = 0; s < 2; s++) g.add(mesh(new THREE.PlaneGeometry(6 - s * 1.4, 4), sail, 0, 7 + s * 5, mz));
    }
    g.add(mesh(new THREE.PlaneGeometry(1.6, 1), basic(0x111111, { side: THREE.DoubleSide }), 0, 3 + 18 + 0.6, 3));
    b.add(g, x, 0, z, facing);
    // Walkable deck + quarterdeck
    const c = Math.abs(Math.cos(facing));
    const hx = c > 0.5 ? 2.5 : 8;
    const hz = c > 0.5 ? 8 : 2.5;
    b.collider(x - hx, x + hx, z - hz, z + hz, 0, 3.0);
  };
  ship(-42, -348, 0, 0x5a3a22);
  ship(-46, -380, Math.PI, 0x3a2a1a);
  // Gangplank from the boardwalk up to the first ship
  stairs(b, -24, -350, '-x', 1.6, 2.5, 15.5, plank, 0.5);
  b.pickup(-42, 3.6, -352, 4, "Pirate Ship Captain's Stash", false);
  b.zone("Sirens' Cove (Treasure Island)", lx0, -19, lz0, lz1);

  const ti = { wall: '#c9a27a', mullion: '#e0c19e', glass: '#5a6a72', lit: '#ffe2a0', cols: 9, rows: 22, style: 0 as const, seed: 51 };
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    tower(b, { x: -104 + Math.cos(a) * 13, z: -364 + Math.sin(a) * 13, w: 28, d: 11, h: 34, facade: { ...ti, seed: 51 + i }, rotY: -a });
  }
  b.box(-80, 0, -364, 14, 10, 50, mat(0xb98f66, 0.8), true);
  const tiSign = neonSign('TI', '#120a06', '#ff3b2f', 6, 4.4, 'TREASURE ISLAND', 0.6);
  b.add(tiSign, -21.6, 7, -328, -Math.PI / 2);
  b.add(mesh(new THREE.BoxGeometry(1.2, 5, 1.6), mat(0x3a2a1a, 0.6), -21.6, 2.5, -328));
  b.collider(-22.4, -20.8, -329, -327, 0, 9, true);
  b.building(-104, -364, 40, 40, '#c9a27a', 'TI');
  b.zone('Treasure Island', -142, -19, -405, -326);
  b.crowd.tourists.push({ pts: [[-21.8, -334], [-21.8, -392]], prop: 'camera' }, { pts: [[-16, -330], [-16, -400]], prop: 'yard-drink' });
}
