import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { ShopAtlas } from './frontAtlas';
import { aq, FrontCluster, patioTable, storefront, type FrontShop } from './frontKit';
import { vcMat } from './interiorKit';
import './frontageCatalogs';

/*
 * Strip frontage shops, Harmon Ave → Flamingo Rd (build 5, area 2), east side (the west side here is
 * the Cosmopolitan's and Bellagio's own fronts). Order from OpenStreetMap, checked against 2026
 * listings (Rosa Mexicano's "outdoor bar on the Strip", P.F. Chang's Planet Hollywood at 3667,
 * the Grand Bazaar Shops' directory; Caesars bought the Bazaar out in May 2026 and is letting the
 * leases run out, but the tenants below still trade).
 *
 * North ← → south along the east sidewalk:
 *  - Grand Bazaar Shops: Wahlburgers and a Ben & Jerry's window on the Strip edge; IT'SUGAR, Duck
 *    Donuts, Happy Lemon, Katanaya Ramen, Fat Tuesday and Dave's Hot Chicken on the open stalls.
 *  - Paris, between the Eiffel Tower's south leg and the Arc: Hexx (chocolate, kitchen + bar) and
 *    Alexxa's with its patio, Beer Park on the roof.
 *  - Planet Hollywood / Miracle Mile, under the video walls: P.F. Chang's (north end), Rosa Mexicano
 *    (pink, outdoor bar), PBR Rock Bar & Grill at the Harmon end.
 */

const A = new ShopAtlas('frontHarmonFlamingo', 2048, 2048);

A.sign('fs:pfchangs', { text: "P.F. CHANG'S", style: 'serif', fg: '#f4e8d0', bg: '#141010', look: 'channel', w: 640, h: 128 });
A.sign('fs:rosa', { text: 'Rosa Mexicano', sub: 'OUTDOOR BAR • MARGARITAS', style: 'script', fg: '#ff4fa8', bg: '#120810', look: 'neon', border: '#ffd0e8', w: 640, h: 160 });
A.sign('fs:pbr', { text: 'PBR ROCK BAR', sub: '& GRILL', style: 'block', fg: '#ffffff', bg: '#0a1a4a', look: 'panel', border: '#d81e2a', w: 640, h: 160 });
A.sign('fs:hexx', { text: 'HEXX', sub: 'KITCHEN • BAR • CHOCOLATE', style: 'deco', fg: '#d8b878', bg: '#0e0c0a', look: 'channel', w: 448, h: 128 });
A.sign('fs:alexxas', { text: "ALEXXA'S", sub: 'BAR & PATIO', style: 'serif', fg: '#ffffff', bg: '#2a1420', look: 'channel', w: 448, h: 128 });
A.sign('fs:beerpark', { text: 'BEER PARK', sub: 'ROOFTOP • EIFFEL VIEWS', style: 'block', fg: '#ffffff', bg: '#123a1e', look: 'panel', border: '#d81e2a', w: 640, h: 128 });
A.sign('fs:wahlburgers', { text: 'WAHLBURGERS', style: 'block', fg: '#ffffff', bg: '#16613a', look: 'panel', w: 640, h: 112 });
A.sign('fs:benjerry', { text: "BEN & JERRY'S", sub: 'SCOOP SHOP', style: 'sans', fg: '#ffffff', bg: '#2a6ad8', look: 'panel', border: '#7ac943', w: 512, h: 128 });
A.sign('fs:itsugar', { text: "IT'SUGAR", style: 'block', fg: '#ffffff', bg: '#ff2a8a', look: 'panel', w: 384, h: 96 });
A.sign('fs:duck', { text: 'DUCK DONUTS', style: 'sans', fg: '#0a3a6a', bg: '#ffd23a', look: 'panel', w: 384, h: 96 });
A.sign('fs:happylemon', { text: 'HAPPY LEMON', style: 'sans', fg: '#3a2a00', bg: '#ffe23a', look: 'panel', w: 384, h: 96 });
A.sign('fs:katanaya', { text: 'KATANAYA', sub: 'RAMEN', style: 'serif', fg: '#ffffff', bg: '#141414', look: 'channel', border: '#d81e2a', w: 384, h: 96 });
A.sign('fs:fattuesday', { text: 'FAT TUESDAY', style: 'block', fg: '#ffd24d', bg: '#2a0a3a', look: 'neon', w: 384, h: 96 });
A.sign('fs:daves', { text: "DAVE'S HOT CHICKEN", style: 'block', fg: '#ffffff', bg: '#e8202a', look: 'panel', w: 448, h: 96 });

// Planet Hollywood's video walls come down to y 1.5 (eastSide.ts): the shopfronts stand in front of
// their lower part, signs at y ≤ 5, so the screens still run above them.
const PH_X = 20.7;

const FRONTS: FrontShop[] = [
  // ---- Planet Hollywood / Miracle Mile, south (Harmon) → north
  { id: 'pbr', side: 'E', xf: PH_X, z0: 195, z1: 205.6, d: 0.6, h: 5.2, groundH: 3.6, wall: 0x14142a, trim: 0xd81e2a, sign: 'fs:pbr', signH: 1.0, win: 'bar', style: 'modern', patio: 2.4, noCollider: true, shop: { kind: 'store', catalog: 'pbr-rockbar', label: 'PBR Rock Bar & Grill', hint: 'giant beers, wings' } },
  { id: 'rosa', side: 'E', xf: PH_X, z0: 172.6, z1: 184.4, d: 0.6, h: 5.2, groundH: 3.6, wall: 0x2a1420, trim: 0xff4fa8, sign: 'fs:rosa', signH: 1.1, win: 'bar', style: 'modern', patio: 2.4, noCollider: true, shop: { kind: 'store', catalog: 'rosa-mexicano', label: 'Rosa Mexicano (outdoor bar)', hint: 'tableside guac, margaritas' }, pool: 0xff9ac8 },
  { id: 'pfchangs', side: 'E', xf: PH_X, z0: 124, z1: 140.5, d: 0.6, h: 5.2, groundH: 3.6, wall: 0x2a1a12, trim: 0xb8862a, sign: 'fs:pfchangs', signH: 0.95, win: 'diner', style: 'stone', patio: 2.6, noCollider: true, shop: { kind: 'store', catalog: 'pfchangs', label: "P.F. Chang's (Planet Hollywood)", hint: 'lettuce wraps, dynamite shrimp' } },
  // ---- Paris: between the Eiffel Tower's south leg and the Arc
  { id: 'hexx', side: 'E', xf: 24, z0: 89.6, z1: 93.1, d: 11.3, h: 8, wall: 0x2a2420, trim: 0xd8b878, sign: 'fs:hexx', signH: 0.9, win: 'chocolate', style: 'stone', shop: { kind: 'store', catalog: 'hexx', label: 'Hexx Kitchen + Bar (Paris)', hint: 'bean-to-bar chocolate, Eiffel views' } },
  { id: 'alexxas', side: 'E', xf: 24, z0: 93.1, z1: 96.5, d: 11.3, h: 8, wall: 0x3a2430, trim: 0xe8dcc0, sign: 'fs:alexxas', signH: 0.9, win: 'bar', style: 'stone', awning: 'awn:black', patio: 2.2, shop: { kind: 'store', catalog: 'alexxas', label: "Alexxa's (Paris)", hint: 'patio cocktails' } },
  // ---- Grand Bazaar Shops: the Strip edge (the stalls start at x 27.4)
  { id: 'wahlburgers', side: 'E', xf: 21.6, z0: 42.3, z1: 51.3, d: 4.4, h: 7.6, wall: 0x1e3a2a, trim: 0xf2ede4, sign: 'fs:wahlburgers', signH: 0.9, win: 'diner', style: 'modern', awning: 'awn:green', shop: { kind: 'store', catalog: 'wahlburgers', label: 'Wahlburgers (Grand Bazaar)', hint: 'burgers, tots, spiked frappes' } },
  { id: 'benjerry', side: 'E', xf: 21.6, z0: 53.8, z1: 56.6, d: 2.6, h: 4.6, groundH: 3.2, wall: 0x2a6ad8, trim: 0x7ac943, sign: 'fs:benjerry', signH: 0.62, win: 'froyo', style: 'stucco', shop: { kind: 'store', catalog: 'ben-jerrys', label: "Ben & Jerry's (Grand Bazaar)", hint: 'scoops, a shake' } },
];

/** The Grand Bazaar's open stalls (eastSide.ts' grid: x 29..47 step 6, z 24..50 step 6.5; these are the ones it leaves open). */
const STALLS: Array<{ x: number; z: number; sign: string; catalog: string; label: string; hint: string }> = [
  { x: 29, z: 24, sign: 'fs:itsugar', catalog: 'itsugar', label: "IT'SUGAR (Grand Bazaar)", hint: 'giant candy, gummy bears' },
  { x: 35, z: 24, sign: 'fs:duck', catalog: 'duck-donuts', label: 'Duck Donuts (Grand Bazaar)', hint: 'warm made-to-order donuts' },
  { x: 41, z: 24, sign: 'fs:happylemon', catalog: 'happy-lemon', label: 'Happy Lemon (Grand Bazaar)', hint: 'cheese-foam tea' },
  { x: 47, z: 24, sign: 'fs:katanaya', catalog: 'katanaya', label: 'Katanaya Ramen (Grand Bazaar)', hint: 'tonkotsu ramen' },
  { x: 29, z: 43.5, sign: 'fs:fattuesday', catalog: 'fat-tuesday', label: 'Fat Tuesday (Grand Bazaar)', hint: 'frozen daiquiris (🍹)' },
  { x: 47, z: 37, sign: 'fs:daves', catalog: 'daves-hot-chicken', label: "Dave's Hot Chicken (Grand Bazaar)", hint: 'Nashville hot tenders' },
];

function bazaarStalls(b: WorldBuilder, c: FrontCluster): void {
  const SM = A.signMat(b);
  const M = vcMat(0.8);
  for (const s of STALLS) {
    const fx = s.x - 1.62;
    c.k.at(fx, 0, s.z, -Math.PI / 2, () => {
      c.k.box(M, 0x1a1a1e, 0, 2.05, 0.04, 3.0, 0.72, 0.08);
      aq(c.k, A, SM, s.sign, 0, 2.05, 0.1, 2.8, 2.8 * (96 / 384) > 0.66 ? 0.66 : 2.8 * (96 / 384));
      // a counter ledge under the window
      c.k.box(M, 0xd8ccb4, 0, 1.0, 0.25, 2.6, 0.08, 0.45);
    });
    c.pools.add(fx - 2, s.z, 3.2, 3.2, 0xffd8a8);
    b.shopSpots.push({ kind: 'store', position: new THREE.Vector3(fx - 1.2, 0, s.z), radius: 2.2, label: s.label, catalog: s.catalog, hint: s.hint });
  }
}

/** Beer Park on the roof over Hexx and Alexxa's: a rail, umbrellas, the sign facing the Strip. */
function beerPark(b: WorldBuilder, c: FrontCluster): void {
  const k = c.k;
  const top = 8;
  const z0 = 89.6;
  const z1 = 96.5;
  const MET = vcMat(0.45, 0.5);
  k.box(MET, 0x141416, 24.2, top + 0.55, (z0 + z1) / 2, 0.06, 1.1, z1 - z0);
  for (let z = z0 + 0.4; z <= z1 - 0.3; z += 1.4) k.box(MET, 0x141416, 24.2, top + 0.5, z, 0.05, 1.0, 0.05);
  k.at(29, top, (z0 + z1) / 2, -Math.PI / 2, () => {
    patioTable(k, -1.6, -1.5, 0xd81e2a);
    patioTable(k, 1.6, -1.5, 0xf4efe6);
    patioTable(k, 0, 1.6, 0xd81e2a);
  });
  k.at(24.25, 0, (z0 + z1) / 2, -Math.PI / 2, () => {
    k.box(vcMat(0.5, 0.4), 0x101010, 0, top + 1.75, 0, 6.2, 1.15, 0.12);
    aq(k, A, A.signMat(b), 'fs:beerpark', 0, top + 1.75, 0.08, 5.8, 5.8 / 5);
  });
  b.collider(24, 24.4, z0, z1, top, top + 1.1, true);
  b.zone('Beer Park (rooftop, Paris)', 24, 35.3, z0, z1);
}

export function buildFrontageHarmonFlamingo(b: WorldBuilder): void {
  const ph = new FrontCluster(24, 165);
  const paris = new FrontCluster(26, 93);
  const bazaar = new FrontCluster(30, 38);
  for (const s of FRONTS) {
    const c = s.z0 > 110 ? ph : s.z0 > 60 ? paris : bazaar;
    storefront(b, c.k, A, s, c.pools);
  }
  beerPark(b, paris);
  bazaarStalls(b, bazaar);
  for (const c of [ph, paris, bazaar]) c.flush(b);
}
