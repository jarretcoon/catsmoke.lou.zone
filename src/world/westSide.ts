import * as THREE from 'three';
import { bakeGroup } from '../meshBake';
import type { WorldBuilder } from './builder';
import { curvedTower, stairs, tower } from './buildings';
import { buildCasinoFloor } from './casinos';
import { makeCarpetTexture, makePaverTexture } from './textures';
import { barCounter, basic, cypressTree, mat, mesh, neonSign, palmTree, planter } from './props';
import { waterJets } from './fountains';
import type { JetSpec } from './fountains';
import { bellagioCasinoRoof, buildBellagioCasinoDressing, buildBellagioLobby } from './grandInteriors';
import { buildViaBellagio } from './viaBellagio';
import { buildCosmoExtras } from './cosmoExtras';
import { buildAriaSign, buildBellagioGateway, buildCosmoSigns } from './westSigns';
import { buildCaesarsCasinoDressing, buildForumShops, caesarsCasinoRoof } from './grandCaesars';
import { caesarsMarquee, caesarsStatuary, caesarsTempleFront, caesarsTowerCrown, forumEntrance } from './caesarsFront';
import { uplights } from './stripFronts';
import { buildTiSign, tiCove, tiShipLights, tiTowerLetters } from './tiFront';
import { bellagioLakeFront, bellagioLakeVillage, cosmoBeacon, cosmoComets } from './westExtras';
import { ariaMarquee, crystalsTenants, veerTowers } from './cityCenterFront';
import { buildGuitarHotel, hardRockBanner } from './guitarHotel';
import { crystalsFront, forumPlanting, forumWall } from './stripFronts';
import { squashZ } from './harmonAve';

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
  // The Shops at Crystals — Libeskind's tilted steel-and-glass shards over a glass storefront band (stripFronts.ts)
  // Harmon Ave now runs along its north side (harmonAve.ts), so the podium is squeezed from z 212…252 to 225.5…252
  squashZ(b, 212, 252, 225.5, () => {
    b.box(-40, 0, 232, 38, 9, 40, mat(0xb9c3cc, 0.4, 0.6), true);
    crystalsFront(b);
    // No big name on the Strip face, only the tenants' signs; the ARIA marquee stands across the walk (cityCenterFront.ts)
    crystalsTenants(b);
  });
  ariaMarquee(b);
  // Veer Towers south of Harmon, leaning 5° apart, behind Crystals
  veerTowers(b, [
    { x: -70, z: 233, w: 11, d: 9, h: 45, lean: -0.087 },
    { x: -86, z: 245, w: 11, d: 9, h: 45, lean: 0.087 },
  ]);
  tower(b, { x: -40, z: 280, w: 16, d: 22, h: 52, facade: silver, metal: 0.6, rough: 0.25 });
  b.add(neonSign('WALDORF ASTORIA', '#0d0f14', '#f6e7c8', 10, 1.4), -31.8, 46, 280, -Math.PI / 2);
  // ARIA: curving blue-silver low-e glass with sawtooth sunshade fins washed by podium floodlights
  curvedTower(b, -60, 268, 62, Math.PI * 0.86, Math.PI * 1.24, 6, 16, 56, { ...silver, glass: '#56789a', mullion: '#d8e0e8', lit: '#eef3ff', seed: 5 }, 0.7, { rough: 0.2, fins: { every: 2, depth: 0.8 }, ledFins: false, wash: 0xdce8ff, washZone: 22, washStrength: 0.6 });
  buildAriaSign(b);
  // Vdara: a slim silver crescent on the north side of Harmon Ave (2600 W Harmon), west of the Cosmopolitan
  curvedTower(b, -70, 189, 46, Math.PI * 0.9, Math.PI * 1.2, 4, 13, 53, { ...silver, wall: '#c8d2da', glass: '#8aa2b8', mullion: '#eef2f5', seed: 9 }, 0.7, { crescent: true, rough: 0.2, ledFins: false, wash: 0xeef4ff, washZone: 14 });
  b.building(-40, 238.75, 38, 26.5, '#9aa6b2', 'Crystals');
  b.building(-40, 280, 16, 22, '#a9b8c6');
  b.building(-112, 268, 22, 70, '#a9b8c6', 'ARIA');
  b.zone('CityCenter • ARIA & Crystals', -150, -19, 208, 312);
  b.crowd.tourists.push({ pts: [[-21, 212], [-21, 300]], prop: 'bag' }, { pts: [[-24, 300], [-24, 214]], prop: 'camera' });
}

// ---------------------------------------------------------------- Cosmopolitan
function buildCosmopolitan(b: WorldBuilder): void {
  const blueGlass = { wall: '#3a4a5c', mullion: '#55677c', glass: '#1d2938', lit: '#d7f0ff', cols: 9, rows: 20, style: 2 as const, seed: 11 };
  // the balcony edges carry blue-violet light lines (they pulse up the towers like comets on the real one)
  const cosmoA = tower(b, { x: -82, z: 170, w: 18, d: 14, h: 56, facade: blueGlass, metal: 0.7, rough: 0.2, ledFins: false, balconies: { color: 0x6a5cff }, wash: 0x9a8cff });
  const cosmoB = tower(b, { x: -82, z: 196, w: 18, d: 14, h: 56, facade: { ...blueGlass, seed: 13 }, metal: 0.7, rough: 0.2, ledFins: false, balconies: { color: 0x6a5cff }, wash: 0x9a8cff });
  cosmoComets(b, [cosmoA, cosmoB], 0x6a5cff);
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
      { game: 'blackjack', x: -29.5, z: 199.2, rot: Math.PI, label: 'Cosmo Blackjack' },
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
      { pts: [[-29.3, 176.6], [-50, 176.6], [-50, 187.4], [-29.3, 187.4]], prop: 'yard-drink' },
      { pts: [[-29.3, 168], [-29.3, 196.5]], prop: 'cig' },
    ],
    // The Cosmo's moody look: dark wood, black glass, plum velvet, violet coves and rose-bronze trim.
    // The Chandelier, its lounges, the LED-column foyer, Secret Pizza, the Marquee entrance and the
    // VIP lounge are dressed by cosmoExtras.ts, so the auto-fill keeps off them.
    interior: {
      ceiling: 'tray',
      trim: 0xb08a6a,
      cove: 0xc86bff,
      columnWrap: 0x0c0a12,
      wainscot: 0x2a1812,
      upperWall: 0x18121e,
      seat: 0x4a1238,
      slotThemes: [1, 2, 6, 4, 0],
      fill: 0.8,
      bar: false,
      sportsbook: false,
      highLimit: false,
      keepOut: [
        [-62, -50.6, 160, 204],
        [-51.5, -32, 160, 165.4],
        [-33.2, -24, 160, 164.2],
        [-49.5, -32.6, 165.6, 198.4],
        [-33.6, -24, 168.6, 196.4],
        [-45.4, -34.6, 198.6, 204],
      ],
    },
  });

  // The Chandelier: three levels of crystal strands around a circular bar
  const cx = -40;
  const cz = 182;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const seg = barCounter(2.6, 0x1a1a22, 0x3a1f4a);
    seg.position.set(cx + Math.cos(a) * 2.8, 0, cz + Math.sin(a) * 2.8);
    seg.rotation.y = -a - Math.PI / 2;
    b.add(seg);
  }
  b.collider(cx - 3.4, cx + 3.4, cz - 3.4, cz + 3.4, 0, 1.15, true);
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(cx + 4.4, 0, cz), radius: 2.5, label: 'Chandelier Bar' });
  // Level 1.5 mezzanines either side of the chandelier, each with its own stair up from the casino
  const mezz = mat(0x2a2236, 0.4, 0.4);
  b.box(cx - 0.5, 4.2, cz - 7.5, 15, 0.35, 3, mezz);
  b.box(cx - 0.5, 4.2, cz + 7.5, 15, 0.35, 3, mezz);
  stairs(b, cx + 5.5, cz - 15, '+z', 3, 4.55, 6, mezz);
  stairs(b, cx + 5.5, cz + 15, '-z', 3, 4.55, 6, mezz);
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
  b.zone('VIP High-Roller Lounge', -62, ropeX, 160, 204);

  // Strip marquee (four-sided LED pylon), the podium's LED canvas and the wordmark over the doors
  buildCosmoSigns(b);
  // the "Beacon": the LED logo display on the Boulevard tower's crown (since 2016)
  cosmoBeacon(b, -74.55, 170, 50.4);
  // Chandelier lounges + bartenders, LED art columns, the Marquee entrance, Secret Pizza, VIP lounge
  buildCosmoExtras(b);

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

  // Italianate balustrade with black multi-lantern lamp posts along the Strip side of the lake
  const stone = mat(0xe9dcc0, 0.7);
  bellagioLakeFront(b, lakeX1 + 0.5, lakeZ0 - 0.5, lakeZ1 + 0.5);
  b.box((lakeX0 + lakeX1) / 2, 0, lakeZ0 - 0.5, lakeX1 - lakeX0, 1.05, 0.6, stone);
  b.box((lakeX0 + lakeX1) / 2, 0, lakeZ1 + 0.5, lakeX1 - lakeX0, 1.05, 0.6, stone);
  b.box(lakeX0 - 0.5, 0, (lakeZ0 + lakeZ1) / 2, 0.6, 1.05, lakeZ1 - lakeZ0 + 1, stone);
  for (let z = lakeZ0 + 5; z <= lakeZ1 - 12; z += 13) b.add(cypressTree(5 + (z % 3)), -18.4, 0, z);
  for (let z = lakeZ0 + 8; z <= lakeZ1 - 12; z += 22) b.add(planter(2, 2, 0xffd34d), -18.2, 0, z + 6);
  // The Bellagio sign: the sandstone tower over the entrance of Bellagio Drive (westSigns.ts)
  buildBellagioGateway(b);

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

  // F1 Grand Prix teardown (late Nov 2026): the Fountain Club grandstand over the lake edge is coming down;
  // its top tiers are already gone (crews take it apart until mid-December), the lower ones and bare posts remain
  const steel = mat(0x6d737c, 0.4, 0.7);
  const tier = mat(0x30343c, 0.6, 0.4);
  for (let i = 0; i < 3; i++) {
    const y = 1.4 + i * 1.1;
    const x = -24 - i * 1.6;
    b.box(x, y, i < 2 ? 66 : 72, 1.6, 0.25, i < 2 ? 30 : 12, tier);
  }
  for (let z = 52; z <= 80; z += 4) {
    for (let i = 0; i < 3; i++) {
      if (i === 2 && z < 66) continue;
      b.add(mesh(new THREE.BoxGeometry(0.12, 1.4 + i * 1.1, 0.12), steel, -24 - i * 1.6, (1.4 + i * 1.1) / 2, z));
    }
  }
  b.add(neonSign('F1 TEARDOWN', '#101010', '#ff3b1f', 6, 1.1, 'CREWS WORKING • GRANDSTAND CLOSED', 0.1), -20.6, 3.2, 44, -Math.PI / 2);
  const jersey = mat(0xd9d6cf, 0.85);
  for (let z = 34; z < 98; z += 4.4) {
    if (Math.abs(z - 60) < 3) continue;
    b.box(-12.15, 0, z, 0.55, 0.85, 3.6, jersey, false, false);
  }
  b.pickup(-27.2, 4.6, 72, 3, 'Grandstand Crew Pack', false);

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
    extraEntrances: [
      { side: 'south', at: -94, width: 6 },
      { side: 'south', at: -118, width: 8 }, // into the lobby
    ],
    carpet: ['#5a1a1e', '#d4a64a', '#2f6b4a'],
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
      { game: 'roulette', x: -109, z: 29, label: 'Bellagio Roulette' },
      { game: 'blackjack', x: -91, z: 29, label: 'Bellagio Blackjack' },
      { game: 'craps', x: -109, z: 52, label: 'Bellagio Craps' },
      { game: 'blackjack', x: -91, z: 52, label: 'Bellagio Baccarat Salon Blackjack' },
    ],
    felt: 0x136f45,
    guard: { kick: [-70, 24] },
    pickups: [
      { x: -88, z: 58, amount: 3, label: 'Bellagio Slot Bar Pack' },
      { x: -91, z: 29, y: 1.35, amount: 5, label: 'Bellagio Blackjack Table Pack!' },
      { x: -120, z: 22, amount: 3, label: 'Bellagio Lounge Smokes' },
    ],
    tourists: [
      { pts: [[-84, 22], [-116, 22], [-116, 58], [-84, 58]], prop: 'cig' },
      { pts: [[-100, 34], [-100, 46], [-118, 60], [-118, 70]], prop: 'yard-drink' },
    ],
  });
  // Striped fabric tents + chandeliers over the floor, a shadow-casting roof, and the lobby with
  // Chihuly's "Fiori di Como" between the casino and the Conservatory (grandInteriors.ts)
  buildBellagioCasinoDressing(b);
  bellagioCasinoRoof(b);
  buildBellagioLobby(b);
  // Via Bellagio: the skylit shopping arcade from the porte-cochère to the Strip (south of the drive)
  buildViaBellagio(b);

  // Conservatory & Botanical Gardens — "Postcards From Christmas" (Nov 13 2026 – Jan 2 2027)
  buildConservatory(b);
  // The Lake Como village front across the lake: ochre and cream stucco, arched loggias, terracotta roofs,
  // two little towers and Italian stone pines (westExtras.ts)
  bellagioLakeVillage(b, -79.9, [
    [18, 21.5, 11],
    [30.5, 62, 11],
    [66, 77, 9],
    [87, 98, 9],
  ]);

  // Bellagio Dr (main drive, signalised at the Strip) + porte-cochère at the lobby doors
  const drive = mat(0x2b2b30, 0.85);
  b.floor(-76, 105.5, 114, 9, drive, 0.015);
  b.add(mesh(new THREE.BoxGeometry(16, 0.6, 10), mat(0xe9dcc0, 0.6), -122, 6, 106, true));
  b.add(mesh(new THREE.BoxGeometry(15.6, 0.08, 9.6), basic(0xfff0c8), -122, 5.67, 106));
  for (const [px, pz] of [
    [-115, 102],
    [-129, 102],
    [-115, 110],
    [-129, 110],
  ]) b.box(px, 0, pz, 0.8, 6, 0.8, mat(0xe9dcc0, 0.6), true);

  // South gardens between the drive and Cosmopolitan
  plaza(b, -19, -70, 122.2, 155, trav);
  plaza(b, -19, -24.4, 110, 122.2, trav);
  for (let z = 128; z < 154; z += 8) b.add(cypressTree(5.5), -24, 0, z);
  b.add(planter(10, 3, 0xff8a3d), -40, 0, 130);
  b.add(planter(10, 3, 0xff4d7a), -40, 0, 146);

  // The crescent tower (cream/ochre, 36 floors)
  // peach-cream walls, white cornice bands, blue-green glass; no name on the crown, a domed belvedere at the crest
  curvedTower(b, -65, 70, 86, Math.PI * 0.84, Math.PI * 1.16, 6, 16, 47, { wall: '#e8d3b0', mullion: '#f7ecda', glass: '#4f7f9a', lit: '#ffe199', cols: 12, rows: 22, style: 0, seed: 21 });
  b.add(mesh(new THREE.CylinderGeometry(3.4, 3.6, 3.2, 20), mat(0xf2e4c8, 0.6), -151, 48.4, 70, true));
  b.add(mesh(new THREE.CylinderGeometry(3.9, 3.9, 0.35, 20), mat(0xfaf3e4, 0.55), -151, 50.1, 70));
  b.add(mesh(new THREE.SphereGeometry(3.3, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xb5654a, 0.7), -151, 50.2, 70, true));
  b.add(mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.6, 8), mat(0xd9ae4a, 0.3, 0.85), -151, 54.2, 70));
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
  // West wall opens into the Bellagio lobby (doorway z 88…94, south of the train bed)
  b.box(minX, 0, (minZ + 88) / 2, 1, 9, 88 - minZ, wall, true);
  b.box(minX, 0, (94 + maxZ) / 2, 1, 9, maxZ - 94, wall, true);
  b.box(minX, 4.6, 91, 1, 4.4, 6, wall, true);
  b.add(mesh(new THREE.BoxGeometry(1.1, 0.18, 6), basic(0xffd27a), minX, 4.6, 91));
  b.box(cx, 0, minZ, maxX - minX, 9, 1, wall, true);
  // South wall opens onto Bellagio Dr (doorway x −85…−81), straight across from Via Bellagio's north door
  b.box((minX - 85) / 2, 0, maxZ, -85 - minX, 9, 1, wall, true);
  b.box(-80.5, 0, maxZ, 1, 9, 1, wall, true);
  b.box(-83, 4.6, maxZ, 4, 4.4, 1, wall, true);
  b.add(mesh(new THREE.BoxGeometry(4, 0.18, 1.1), basic(0xffd27a), -83, 4.6, maxZ));
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
  for (let i = 0; i < 10; i++) if (i !== 9) b.add(cypressTree(2.4), minX + 3 + (i % 5) * 6, 0, i < 5 ? minZ + 2 : maxZ - 2);

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
  // Thai-style pavilion roof: three stacked gold tiers and a slim spire
  for (const [r, hh, yy] of [
    [2.5, 1.1, 4.1],
    [1.8, 1.0, 4.9],
    [1.15, 0.9, 5.6],
  ]) {
    const tierMesh = mesh(new THREE.ConeGeometry(r, hh, 4), mat(0xf2c14e, 0.25, 0.85), 0, yy, 0);
    tierMesh.rotation.y = Math.PI / 4;
    shrine.add(tierMesh);
  }
  shrine.add(mesh(new THREE.ConeGeometry(0.22, 2.2, 8), mat(0xf2c14e, 0.25, 0.85), 0, 7.1, 0));
  shrine.add(mesh(new THREE.SphereGeometry(0.55, 12, 10), mat(0xf2c14e, 0.2, 0.9), 0, 1.4, 0));
  b.add(shrine, -30, 0, -37);
  b.collider(-31.7, -28.3, -38.7, -35.3, 0, 0.6);
  b.zone('Brahma Shrine', -34, -26, -41, -33);

  // Fountain pools + statues + cypress rows
  const jetMat = new THREE.MeshBasicMaterial({ color: 0xe6fbff, transparent: true, opacity: 0.7 });
  for (const [z0, z1] of [
    [-44, -60],
    [-70, -86],
  ]) {
    b.floor(-38, (z0 + z1) / 2, 10, Math.abs(z1 - z0), water, 0.36);
    b.box(-38, 0, (z0 + z1) / 2, 11, 0.35, Math.abs(z1 - z0) + 1, marble);
    for (let i = 0; i < 6; i++) {
      const jet = mesh(new THREE.CylinderGeometry(0.06, 0.18, 2.4, 6), jetMat, -38 + ((i % 2) * 2 - 1) * 2.5, 1.55, z0 - 1.5 - (i >> 1) * 5);
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
  // Winged Victory on her column in the first pool, rearing white horses between the pools (caesarsFront.ts)
  caesarsStatuary(b, [-38, -52], [
    [-30, -65, Math.PI / 2],
    [-46, -65, Math.PI / 2],
  ]);
  statue(-26, -94, 1.5); // Julius Caesar, at the main entrance
  b.zone('Julius Caesar Statue', -30, -21, -99, -89);
  for (let z = -22; z > -116; z -= 7) b.add(cypressTree(6), -21.5, 0, z);

  // Colonnade + casino
  for (let z = -26; z >= -80; z -= 4.5) {
    b.add(mesh(new THREE.CylinderGeometry(0.5, 0.58, 8, 14), marble, -54, 4, z, true));
    b.collider(-54.6, -53.4, z - 0.6, z + 0.6, 0, 8, true);
  }
  b.add(mesh(new THREE.BoxGeometry(3, 1.2, 58), marble, -54, 8.6, -53));
  // warm gold uplights wash the wall behind the colonnade after dark
  uplights(b, 1, -56.9, -80, -26, 11.5, 0xffd59a, 4.5);
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
    slots: {
      accent: '#f7d560',
      topper: 0xf7d560,
      rows: [
        { x: -96.5, z: -52, count: 8, along: 'z', facing: Math.PI / 2 },
      ],
    },
    slotLabel: 'Caesars Colosseum Slots',
    tables: [
      { game: 'craps', x: -66, z: -36, label: 'Caesars Craps' },
      { game: 'blackjack', x: -66, z: -68, label: 'Caesars Blackjack' },
      { game: 'roulette', x: -91, z: -36, label: 'Caesars Roulette' },
      { game: 'blackjack', x: -91, z: -68, label: 'Caesars Palace High-Limit Blackjack' },
    ],
    felt: 0x6b1414,
    guard: { kick: [-44, -52] },
    pickups: [
      { x: -95, z: -30, amount: 3, label: 'Caesars Cocktail Lounge Pack' },
      { x: -66, z: -36, y: 1.3, amount: 5, label: 'Caesars Craps Rail Pack!' },
    ],
    tourists: [{ pts: [[-60, -28], [-96, -28], [-96, -76], [-60, -76]], prop: 'cig' }, { pts: [[-70, -44], [-70, -64]], prop: 'yard-drink' }],
  });
  // The 2026 marquee at Flamingo Rd, the temple front with the red name over the entrance (caesarsFront.ts)
  caesarsMarquee(b);
  caesarsTempleFront(b, -54, 9.2, -53, 16);
  // Domed rotunda round Caesar, statues and chandeliers inside; a roof that shades the floor (grandCaesars.ts)
  buildCaesarsCasinoDressing(b);
  caesarsCasinoRoof(b);

  // Forum Shops: temple-front entrance + painted-sky lobby with the boutique
  const fx0 = -46;
  const fx1 = -26;
  const fz0 = -162;
  const fz1 = -138;
  const lobbyWall = mat(0xe6dfd3, 0.6);
  // West side opens into the Roman street (the Forum Shops hall, grandCaesars.ts); walls beside the arch
  b.box(fx0, 0, (fz0 + -156) / 2, 1, 10, -156 - fz0, lobbyWall, true);
  b.box(fx0, 0, (-144 + fz1) / 2, 1, 10, fz1 + 144, lobbyWall, true);
  b.box((fx0 + fx1) / 2, 0, fz0, fx1 - fx0, 10, 1, lobbyWall, true);
  b.box((fx0 + fx1) / 2, 0, fz1, fx1 - fx0, 10, 1, lobbyWall, true);
  b.box(fx1, 0, fz0 + 4.5, 1, 10, 9, lobbyWall, true);
  b.box(fx1, 0, fz1 - 4.5, 1, 10, 9, lobbyWall, true);
  b.box(fx1, 5, (fz0 + fz1) / 2, 1, 5, 6, lobbyWall, true);
  b.box((fx0 + fx1) / 2, 10, (fz0 + fz1) / 2, fx1 - fx0, 0.5, fz1 - fz0, lobbyWall); // the painted sky hangs under it
  b.floor((fx0 + fx1) / 2, (fz0 + fz1) / 2, fx1 - fx0, fz1 - fz0, new THREE.MeshStandardMaterial({ map: makeCarpetTexture('#d8ccb4', '#a88a5a'), roughness: 0.6 }), 0.03);
  // The Trevi-style entrance: paired giant columns, the arched lunette, the attic with the name and the
  // rotunda's dome rising behind (caesarsFront.ts); washed warm from ground uplights after dark
  forumEntrance(b, fx1, (fz0 + fz1) / 2, 10.5, (fx0 + fx1) / 2);
  for (const s of [-1, 1]) for (const off of [3.7, 5.3]) b.collider(fx1 + 0.6, fx1 + 2.0, (fz0 + fz1) / 2 + s * off - 0.7, (fz0 + fz1) / 2 + s * off + 0.7, 0, 10.3, true);
  uplights(b, 1, fx1 + 2.05, fz0 + 1, fz1 - 1, 13.5, 0xffe2b4, 3.2);
  // Boutique counter along the north wall, clear of the walk through to the street
  const counter = barCounter(6, 0x111111, 0x5a3a12);
  b.add(counter, -36, 0, fz0 + 2.5);
  b.collider(-39, -33, fz0 + 1.9, fz0 + 3.1, 0, 1.15, true);
  b.shopSpots.push({ kind: 'boutique', position: new THREE.Vector3(-36, 0, fz0 + 5), radius: 3.2, label: 'Forum Shops Boutique' });
  b.zone('The Forum Shops at Caesars', fx0, fx1, fz0, fz1);
  b.staticMarkers.push({ x: -36, z: fz0 + 4, color: '#ffd24d', glyph: '👒', size: 2.8 });
  buildForumShops(b);
  b.box(-36, 0, -127, 20, 12, 16, mat(0xe2d8c4, 0.7), true);
  b.box(-36, 0, -172, 20, 12, 16, mat(0xe2d8c4, 0.7), true);
  // The street wall either side of the temple front: pilasters, arches, statues, cornice (stripFronts.ts)
  forumWall(b, -26, -135, -119, 12);
  forumWall(b, -26, -180, -164, 12);
  forumPlanting(b, -22.4, [-122.5, -129, -135.5, -165.5, -172, -178.5]);

  // Towers: warm ivory with grey-blue windows, washed gold after dark; the Palace Tower wears the red name
  // under its cornice and a pediment with the medallion on the roof line
  const caesarsSkin = { wall: '#efe6d3', mullion: '#fbf6ea', glass: '#5f7a90', lit: '#ffe6b0', cols: 12, rows: 22, style: 0 as const, seed: 31 };
  tower(b, { x: -120, z: -50, w: 20, d: 46, h: 41, facade: caesarsSkin, wash: 0xffd59a, washZone: 16 });
  caesarsTowerCrown(b, -110, -50, 30.6, -111.8, 41);
  tower(b, { x: -128, z: -104, w: 46, d: 18, h: 38, facade: { ...caesarsSkin, seed: 33 } });
  tower(b, { x: -152, z: -40, w: 14, d: 34, h: 30, facade: { ...caesarsSkin, seed: 35 } });

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

  // Construction barrier along the Strip: black panels with the gold Hard Rock branding (gate gap at z −252)
  const screen = mat(0x0d0d10, 0.85);
  for (const [a, c] of [
    [z0 - 1, -249],
    [-255, z1 + 1],
  ]) {
    b.box(-20.2, 0, (a + c) / 2, 0.15, 2.6, Math.abs(c - a), screen, true, false);
  }
  for (let z = z0 - 12; z > z1; z -= 22) {
    if (Math.abs(z - -252) < 8) continue;
    b.add(hardRockBanner(b, 9, 1.9), -20.1, 1.35, z, -Math.PI / 2);
  }
  for (const z of [-249, -255]) b.add(mesh(new THREE.BoxGeometry(0.3, 3.2, 0.3), mat(0x8c8f94, 0.4, 0.6), -20.2, 1.6, z));

  // The Guitar Hotel on the old volcano site: topped out and glazed, the neck a stub of bare steel (guitarHotel.ts)
  const gx = -52;
  const gz = -222;
  buildGuitarHotel(b, gx, gz);
  b.zone('Hard Rock Guitar Hotel (under construction)', -72, -20, -245, -200);

  // Tower crane, slowly slewing
  const crane = new THREE.Group();
  const yellow = mat(0xf2c230, 0.5, 0.4);
  for (let y = 0; y < 76; y += 3) {
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
  jib.position.y = 77;
  bakeGroup(jib);
  bakeGroup(crane);
  crane.add(jib);
  b.scene.add(crane);
  crane.position.set(-76, 0, -213);
  b.collider(-77, -75, -214, -212, 0, 76, true);
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
  b.building(gx, gz, 38, 11, '#2f86b8', 'Guitar Hotel');
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
  tiShipLights(b, [
    { x: -42, z: -348, facing: 0 },
    { x: -46, z: -380, facing: Math.PI },
  ]);
  // Gangplank from the boardwalk up to the first ship
  stairs(b, -24, -350, '-x', 1.6, 2.5, 15.5, plank, 0.5);
  b.pickup(-42, 3.6, -352, 4, "Pirate Ship Captain's Stash", false);
  b.zone("Sirens' Cove (Treasure Island)", lx0, -19, lz0, lz1);

  // the Y tower in its terracotta "Salmon Stream" paint with a cream window grid
  const ti = { wall: '#c4704f', mullion: '#efdcc2', glass: '#4f5d66', lit: '#ffe2a0', cols: 9, rows: 22, style: 0 as const, seed: 51 };
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    tower(b, { x: -104 + Math.cos(a) * 13, z: -364 + Math.sin(a) * 13, w: 28, d: 11, h: 34, facade: { ...ti, seed: 51 + i }, rotY: -a });
  }
  // the north part of the low-rise (between the tower wings and Spring Mountain Rd) is the walk-in casino
  // now (tiInterior.ts, x −98..−73.6, z −391..−370); the rest stays solid
  b.box(-80, 0, -354.5, 14, 10, 31, mat(0xb26a4c, 0.8), true);
  // the Caribbean village front behind the ships and the rockwork round the cove (tiFront.ts)
  tiCove(b, -73, -389, -339, 10, { x0: lx0, x1: lx1, zA: lz0, zB: lz1 }, { z0: -376.5, z1: -371.5, h: 4.2 });
  // the 2003 TI sign by the Spring Mountain corner, and the gold letters on the wings (tiFront.ts)
  buildTiSign(b);
  tiTowerLetters(b);
  b.building(-104, -364, 40, 40, '#c4704f', 'TI');
  b.zone('Treasure Island', -142, -19, -405, -326);
  b.crowd.tourists.push({ pts: [[-21.8, -334], [-21.8, -392]], prop: 'camera' }, { pts: [[-16, -330], [-16, -400]], prop: 'yard-drink' });
}
