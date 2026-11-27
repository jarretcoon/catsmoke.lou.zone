import * as THREE from 'three';
import { viewer, type WorldBuilder } from './builder';
import { buildInNOut } from './food';
import { Kit, glowMat, vcMat } from './interiorKit';
import { LINQ_ATLAS, LINQ_ATLAS_H, linqRect, linqSignMat, linqTex, linqWindowMat, signRegion, type Interior, type Rect } from './linqAtlas';
import { makePaverTexture } from './textures';
import { lazyInterior, mapGlow, uvTo } from './themedKit';
import { neonSign, palmTree } from './props';

/*
 * The LINQ Promenade, rebuilt from the 2026 tenant directory, OpenStreetMap and photos.
 *
 * Real layout: a 1,200 ft pedestrian street running east from the Strip between the Flamingo (south)
 * and The LINQ (north) to the High Roller. Two- and three-storey storefronts in brick, cream stone
 * and dark modern panels, patios out front, two rows of tall palms and round-headed ficus in
 * planters, black five-globe lamp posts, string lights over the patios, the Fly LINQ zipline cables
 * overhead (launch tower at the Strip, landing at the wheel), and a blue-lit fountain in the middle
 * in front of Ghirardelli and the round, striped Brooklyn Bowl building with its glowing glass crown.
 *
 * Order (west → east), from OSM node positions mapped onto the game's compressed x
 * (x = 19 + metres east of the Strip property line × 0.384):
 *  south: Category 10 (Flamingo corner) · Haute Doggery · Starbucks · Breeze Daiquiri · Flamingo doors ·
 *         I Love Sugar · Gordon Ramsay Fish & Chips · Nectar · Tilted Kilt · Flour & Barley ·
 *         In-N-Out (Ste L24, real spot) · ICEBAR · Brooklyn Bowl · Honolulu Cookie · Maxie's · Canter's
 *  north: The LINQ casino doors · Sweet Sin · Chayo · Off the Strip · The Hat Loft · Welcome to Fabulous
 *         Las Vegas · O'Sheas · Virgil's · Havaianas · ameriCAN · Favorite Bistro · Ghirardelli ·
 *         Jimmy Kimmel's · Yard House · Harley-Davidson · Pier 30
 * The In-N-Out used to sit on the north side; the real one is on the south (Flamingo) side, beside
 * the fountain, just west of Brooklyn Bowl.
 *
 * Cost: every facade, awning, patio, lamp, planter and bulb goes through one Kit and flushes to one
 * mesh per material (a handful of draw calls); the signs and painted shop interiors share one atlas.
 * Walk-in interiors are built only when Lou comes near and drawn only while he's inside or looking in.
 */

export const LINQ = { zs: -97, zn: -111.5, x0: 19, x1: 146, zc: -104.25 };
const ZS = LINQ.zs;
const ZN = LINQ.zn;
const ZC = LINQ.zc;

type Style = 'brick' | 'stone' | 'modern' | 'stucco';
interface Tenant {
  id: string;
  side: 'N' | 'S';
  x0: number;
  x1: number;
  h: number;
  d: number;
  wall: number;
  trim: number;
  sign: string;
  signH?: number;
  win: Interior;
  style?: Style;
  awning?: string;
  patio?: number;
  blade?: string;
  /** World-x of the door (default: middle). */
  doorAt?: number;
  shop?: { kind: 'store' | 'bowling'; catalog?: string; label: string; hint: string };
  walkIn?: boolean;
  /** Skip the facade (something else builds this lot). */
  skip?: boolean;
}

// ------------------------------------------------------------------ the signs, painted into the atlas
signRegion('s:haute', { text: 'Haute Doggery', sub: 'GOURMET HOT DOGS', style: 'script', fg: '#ffd84a', bg: '#b3161c', look: 'panel', border: '#ffd84a' });
signRegion('s:starbucks', { text: 'STARBUCKS', sub: 'COFFEE', style: 'sans', fg: '#ffffff', bg: '#00704a', look: 'panel' });
signRegion('s:breeze', { text: 'BREEZE', sub: 'DAIQUIRI BAR', style: 'block', fg: '#7df9ff', bg: '#000000', look: 'neon', border: '#ff6ec7' });
signRegion('s:flamingo', { text: 'Flamingo', style: 'script', fg: '#ff5fb4', bg: '#000000', look: 'neon' });
signRegion('s:gordon', { text: 'GORDON RAMSAY', sub: 'FISH & CHIPS', style: 'sans', fg: '#ffffff', bg: '#0c1a3a', look: 'panel', border: '#d62a2a' });
signRegion('s:nectar', { text: 'nectar', sub: 'BATH TREATS', style: 'serif', fg: '#ffffff', bg: '#e86aa8', look: 'panel' });
signRegion('s:kilt', { text: 'Tilted Kilt', sub: 'PUB & EATERY', style: 'serif', fg: '#f4e8c8', bg: '#173a24', look: 'channel', border: '#c8a24a' });
signRegion('s:flour', { text: 'FLOUR & BARLEY', sub: 'BRICK OVEN PIZZA', style: 'slab', fg: '#f4e8c8', bg: '#2a1a12', look: 'channel', border: '#e8641c' });
signRegion('s:icebar', { text: 'ICEBAR', sub: 'minus5°', style: 'thin', fg: '#9fe8ff', bg: '#000000', look: 'neon', border: '#ffffff' });
signRegion('s:cupcakes', { text: 'CUPCAKES • COOKIES', style: 'sans', fg: '#ffffff', bg: '#141416', look: 'channel' });
signRegion('s:honolulu', { text: 'HONOLULU COOKIE CO.', style: 'serif', fg: '#ffffff', bg: '#d8902a', look: 'panel' });
signRegion('s:maxies', { text: "Maxie's", style: 'script', fg: '#ffd24d', bg: '#000000', look: 'neon' });
signRegion('s:canters', { text: "CANTER'S DELI", sub: 'SINCE 1931', style: 'deco', fg: '#ffffff', bg: '#7a1414', look: 'panel', border: '#ffd24d' });
signRegion('s:linq', { text: 'THE LINQ', sub: 'HOTEL + EXPERIENCE', style: 'thin', fg: '#ffffff', bg: '#000000', look: 'neon', border: '#7a4dff' });
signRegion('s:sweetsin', { text: 'Sweet Sin', sub: 'PATISSERIE • CANDY', style: 'script', fg: '#ff8ad8', bg: '#000000', look: 'neon' });
signRegion('s:offstrip', { text: 'OFF THE STRIP', sub: 'BISTRO', style: 'sans', fg: '#ffffff', bg: '#1a1a1a', look: 'channel', border: '#ffb000' });
signRegion('s:hatloft', { text: 'THE HAT LOFT', style: 'deco', fg: '#ffe6b0', bg: '#2a2018', look: 'channel' });
signRegion('s:american', { text: 'ameriCAN', sub: 'BEER & COCKTAILS', style: 'block', fg: '#ffffff', bg: '#1a2a5a', look: 'panel', border: '#d62a2a' });
signRegion('s:havaianas', { text: 'Havaianas', style: 'sans', fg: '#1a1a1a', bg: '#ffd400', look: 'panel' });
signRegion('s:bistro', { text: 'FAVORITE BISTRO', style: 'deco', fg: '#f4e8c8', bg: '#3a1a2a', look: 'channel' });
signRegion('s:kimmel', { text: "JIMMY KIMMEL'S", sub: 'COMEDY CLUB', style: 'block', fg: '#ffffff', bg: '#000000', look: 'neon', border: '#ff3a3a' });
signRegion('s:yardhouse', { text: 'YARD HOUSE', style: 'slab', fg: '#ffffff', bg: '#1a1a1a', look: 'channel' });
signRegion('s:harley', { text: 'HARLEY-DAVIDSON', style: 'block', fg: '#ff7a1a', bg: '#0c0c0c', look: 'panel', border: '#ff7a1a' });
signRegion('s:pier30', { text: 'PIER 30', sub: 'SURF • SWIM • STYLE', style: 'sans', fg: '#0a3a6a', bg: '#f4f4ee', look: 'panel' });
signRegion('s:virgils', { text: "VIRGIL'S", sub: 'REAL BBQ • LIVE MUSIC', style: 'slab', fg: '#ffb04a', bg: '#1a0c08', look: 'channel', border: '#ffe0a0' });
signRegion('s:skyshop', { text: 'SKY SHOP', sub: 'HIGH ROLLER GIFTS', style: 'sans', fg: '#35e0ff', bg: '#000000', look: 'neon' });
signRegion('s:heli', { text: 'GRAND CANYON', sub: 'HELICOPTER TOURS', style: 'block', fg: '#ffffff', bg: '#c84a1a', look: 'panel' });
signRegion('s:tix', { text: 'TIX4VEGAS', sub: 'HALF-PRICE SHOWS', style: 'block', fg: '#ffd24d', bg: '#3a0a5a', look: 'panel' });
signRegion('s:squeeze', { text: 'SQUEEZE', sub: 'FROZEN DRINKS', style: 'block', fg: '#7dff6a', bg: '#000000', look: 'neon', border: '#ffd24d' });
signRegion('s:highroller', { text: 'HIGH ROLLER', style: 'thin', fg: '#35e0ff', bg: '#000000', look: 'neon', w: 1024, h: 128 });

// brick reds, cream stones, dark modern panels
const BRICK = 0x8a3a28;
const BRICK2 = 0x6e2e22;
const CREAM = 0xe8dcc0;
const STONE = 0xd8c8a6;
const DARK = 0x26262c;
const WHITE = 0xeeeae2;
const TRIM_W = 0xf4efe6;
const TRIM_D = 0x141418;

const TENANTS: Tenant[] = [
  // ------------------------------------------------ south side (Flamingo), fronts face north
  { id: 'category10', side: 'S', x0: 26.6, x1: 34, h: 13, d: 3.2, wall: 0x2a2420, trim: 0x8a6a3a, sign: 'category10', signH: 2.2, win: 'bar', style: 'modern', awning: 'awn:black', shop: { kind: 'store', catalog: 'category10', label: "Category 10's to-go window", hint: 'frozen drinks, whiskey, cowboy hats' } },
  { id: 'haute', side: 'S', x0: 34, x1: 39, h: 6.5, d: 3, wall: 0xb3161c, trim: 0xffd84a, sign: 's:haute', win: 'diner', awning: 'awn:red', shop: { kind: 'store', catalog: 'haute-doggery', label: 'Haute Doggery', hint: 'gourmet hot dogs' } },
  { id: 'starbucks', side: 'S', x0: 39, x1: 43, h: 6.5, d: 3, wall: 0x3a3430, trim: 0x00704a, sign: 's:starbucks', win: 'cafe', awning: 'awn:green', shop: { kind: 'store', catalog: 'starbucks-linq', label: 'Starbucks', hint: 'cold brew (sprint), a free puppuccino' } },
  { id: 'breeze', side: 'S', x0: 43, x1: 47, h: 6.5, d: 3, wall: 0x1a5a6a, trim: 0xff6ec7, sign: 's:breeze', win: 'bar', awning: 'awn:teal', shop: { kind: 'store', catalog: 'breeze', label: 'Breeze Daiquiri Bar', hint: 'yard daiquiris (🍹)' } },
  { id: 'flamingo-doors', side: 'S', x0: 47, x1: 53, h: 7.5, d: 1, wall: 0xf2e0d6, trim: 0xff5fb4, sign: 's:flamingo', win: 'casino', style: 'stucco' },
  { id: 'ilovesugar', side: 'S', x0: 53, x1: 62, h: 10, d: 3, wall: 0xffffff, trim: 0xff4fa8, sign: 'ilovesugar', signH: 2.4, win: 'candy', style: 'modern', shop: { kind: 'store', catalog: 'ilovesugar', label: 'I Love Sugar', hint: 'candy, candy martinis' } },
  { id: 'gordon', side: 'S', x0: 62, x1: 67, h: 6.5, d: 3, wall: 0x0c1a3a, trim: 0xd62a2a, sign: 's:gordon', win: 'diner', style: 'modern', shop: { kind: 'store', catalog: 'gordon-ramsay', label: 'Gordon Ramsay Fish & Chips', hint: 'fish & chips (tips ×1.4)' } },
  { id: 'nectar', side: 'S', x0: 67, x1: 70, h: 6.5, d: 9, wall: 0xf4e4ee, trim: 0xe86aa8, sign: 's:nectar', win: 'sweets', style: 'stucco' },
  { id: 'kilt', side: 'S', x0: 70, x1: 84, h: 10.5, d: 10, wall: STONE, trim: TRIM_W, sign: 's:kilt', signH: 1.3, win: 'pub', style: 'stone', awning: 'awn:green', patio: 3.2, shop: { kind: 'store', catalog: 'tilted-kilt', label: 'Tilted Kilt Pub & Eatery', hint: 'pints and wings' } },
  { id: 'flour', side: 'S', x0: 84, x1: 93, h: 8, d: 10, wall: BRICK, trim: CREAM, sign: 's:flour', win: 'pizza', style: 'brick', awning: 'awn:orange', patio: 3, shop: { kind: 'store', catalog: 'flour-barley', label: 'Flour & Barley', hint: 'brick oven pizza, craft beer' } },
  // In-N-Out (93..107) is built by buildInNOut; this is the storey above it and its street face
  { id: 'innout-upper', side: 'S', x0: 93, x1: 107, h: 9.5, d: 9.5, wall: 0xf7f5f0, trim: 0xd81e2a, sign: '', win: 'upper', skip: true },
  { id: 'icebar', side: 'S', x0: 107, x1: 110, h: 7, d: 9, wall: 0x0c1a2a, trim: 0x9fe8ff, sign: 's:icebar', win: 'ice', style: 'modern', shop: { kind: 'store', catalog: 'icebar', label: 'ICEBAR (minus5°)', hint: 'cool off: lose 2 wanted stars' } },
  // Brooklyn Bowl (110..124) is the round striped building, built by brooklynBowl()
  { id: 'honolulu', side: 'S', x0: 124, x1: 130, h: 7, d: 9, wall: CREAM, trim: 0xd8902a, sign: 's:honolulu', win: 'sweets', style: 'stucco', awning: 'awn:orange', shop: { kind: 'store', catalog: 'honolulu-cookie', label: 'Honolulu Cookie Company', hint: 'pineapple shortbread' } },
  { id: 'maxies', side: 'S', x0: 130, x1: 138, h: 8, d: 9, wall: 0x3a2a22, trim: 0xffd24d, sign: 's:maxies', win: 'diner', style: 'modern', awning: 'awn:black', patio: 3, shop: { kind: 'store', catalog: 'maxies', label: "Maxie's", hint: 'pancakes, bottomless mimosas' } },
  { id: 'canters', side: 'S', x0: 138, x1: 146, h: 8, d: 9, wall: WHITE, trim: 0x7a1414, sign: 's:canters', win: 'diner', style: 'stucco', awning: 'awn:red', shop: { kind: 'store', catalog: 'canters', label: "Canter's Deli", hint: 'pastrami on rye' } },
  // ------------------------------------------------ north side (The LINQ), fronts face south
  { id: 'linq-doors', side: 'N', x0: 27.5, x1: 33, h: 8, d: 6, wall: 0x2a2a34, trim: 0x7a4dff, sign: 's:linq', win: 'casino', style: 'modern' },
  { id: 'sweetsin', side: 'N', x0: 33, x1: 38, h: 6.5, d: 6, wall: 0xf8e8f0, trim: 0xff8ad8, sign: 's:sweetsin', win: 'sweets', style: 'stucco', awning: 'awn:pink', shop: { kind: 'store', catalog: 'sweet-sin', label: 'Sweet Sin', hint: 'macarons, cake pops' } },
  { id: 'chayo', side: 'N', x0: 38, x1: 50, h: 9, d: 6, wall: 0x3a2a24, trim: 0xff6a3a, sign: 'chayo', signH: 1.8, win: 'bar', style: 'modern', patio: 3.4, shop: { kind: 'store', catalog: 'chayo', label: 'Chayo', hint: 'margaritas, tacos, the mechanical bull' } },
  { id: 'offstrip', side: 'N', x0: 50, x1: 56, h: 7, d: 6, wall: 0x4a4a4e, trim: 0xffb000, sign: 's:offstrip', win: 'diner', style: 'modern', patio: 2.6 },
  { id: 'hatloft', side: 'N', x0: 56, x1: 62, h: 8, d: 9, wall: BRICK2, trim: CREAM, sign: 's:hatloft', win: 'hats', style: 'brick', awning: 'awn:black', shop: { kind: 'store', catalog: 'hat-loft', label: 'The Hat Loft', hint: 'cowboy hats, fedoras (Swag)' } },
  { id: 'welcome', side: 'N', x0: 62, x1: 72, h: 8.5, d: 10, wall: 0x1a2a5a, trim: 0xffcf3a, sign: 'welcome-shop', signH: 2.1, win: 'shop', style: 'modern', walkIn: true, shop: { kind: 'store', catalog: 'linq-souvenirs', label: 'Welcome to Fabulous Las Vegas', hint: 'souvenirs, hats, shades (Swag)' } },
  { id: 'osheas', side: 'N', x0: 72, x1: 81, h: 9, d: 10, wall: 0x0d4a24, trim: 0xf2d36a, sign: 'osheas', signH: 1.7, win: 'casino', style: 'stucco', awning: 'awn:green', shop: { kind: 'store', catalog: 'osheas', label: "O'Sheas", hint: '$3 beer, beer pong' } },
  { id: 'virgils', side: 'N', x0: 81, x1: 90, h: 11, d: 10, wall: BRICK, trim: CREAM, sign: 's:virgils', win: 'bar', style: 'brick', blade: 'virgils-blade', patio: 3, shop: { kind: 'store', catalog: 'virgils', label: "Virgil's Real BBQ", hint: 'brisket, rib tips' } },
  { id: 'havaianas', side: 'N', x0: 90, x1: 93, h: 7, d: 10, wall: 0xf4f0e0, trim: 0xffd400, sign: 's:havaianas', win: 'shop', style: 'stucco' },
  { id: 'american', side: 'N', x0: 93, x1: 99, h: 9, d: 10, wall: BRICK2, trim: TRIM_W, sign: 's:american', win: 'bar', style: 'brick', awning: 'awn:navy', patio: 2.6, shop: { kind: 'store', catalog: 'american', label: 'ameriCAN Beer & Cocktails', hint: 'craft cans from 50 states' } },
  { id: 'bistro', side: 'N', x0: 99, x1: 105, h: 9, d: 10, wall: 0xd8c8b8, trim: 0x3a1a2a, sign: 's:bistro', win: 'cafe', style: 'stone', awning: 'awn:black', patio: 2.4 },
  { id: 'ghirardelli', side: 'N', x0: 105, x1: 113, h: 10, d: 10, wall: CREAM, trim: 0xc8a24a, sign: 'ghirardelli', signH: 1.6, win: 'sweets', style: 'stone', awning: 'awn:red', shop: { kind: 'store', catalog: 'ghirardelli', label: 'Ghirardelli', hint: 'sundaes, shakes, chocolate' } },
  { id: 'kimmel', side: 'N', x0: 113, x1: 119, h: 10, d: 10, wall: DARK, trim: 0xff3a3a, sign: 's:kimmel', win: 'bar', style: 'modern' },
  { id: 'yardhouse', side: 'N', x0: 119, x1: 132, h: 10, d: 10, wall: 0x5a4a3a, trim: 0xc8a24a, sign: 's:yardhouse', signH: 1.3, win: 'bar', style: 'stone', awning: 'awn:black', patio: 3.4, shop: { kind: 'store', catalog: 'yard-house', label: 'Yard House', hint: 'a yard of beer (🍹 4 min)' } },
  { id: 'harley', side: 'N', x0: 132, x1: 139, h: 8, d: 10, wall: 0x1a1a1c, trim: 0xff7a1a, sign: 's:harley', win: 'shop', style: 'modern' },
  { id: 'pier30', side: 'N', x0: 139, x1: 146, h: 8, d: 10, wall: 0xf0f0ea, trim: 0x0a3a6a, sign: 's:pier30', win: 'shop', style: 'stucco', awning: 'awn:navy' },
];

// ------------------------------------------------------------------ helpers
/** Two shared vertex-coloured materials for all the promenade's dressing: matte and metal. */
const M = () => vcMat(0.8);
const MET = () => vcMat(0.45, 0.5);
let AL: THREE.MeshStandardMaterial | null = null;
/** The atlas, lit (awnings, cloth): no glow. */
function atlasLit(): THREE.MeshStandardMaterial {
  return (AL ??= new THREE.MeshStandardMaterial({ map: linqTex(), roughness: 0.85 }));
}

/** Atlas-mapped quad (facing +z) into the kit. */
function aq(k: Kit, m: THREE.Material, r: Rect, x: number, y: number, z: number, w: number, h: number, ry = 0, rx = 0, color = 0xffffff): void {
  const g = new THREE.PlaneGeometry(w, h);
  uvTo(g, r, [LINQ_ATLAS, LINQ_ATLAS_H]);
  k.add(g, m, color, x, y, z, ry, rx);
}

/** A five-globe black lamp post (the promenade's), globes glowing warm. */
function lampPost(k: Kit, x: number, z: number): void {
  const iron = MET();
  k.cyl(iron, 0x141416, x, 0.25, z, 0.22, 0.28, 0.5, 8);
  k.cyl(iron, 0x141416, x, 2.4, z, 0.07, 0.1, 4.4, 8);
  k.cyl(iron, 0x141416, x, 4.65, z, 0.16, 0.1, 0.25, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.box(iron, 0x141416, x + Math.cos(a) * 0.3, 4.75, z + Math.sin(a) * 0.3, 0.6, 0.05, 0.05, -a);
    k.add(new THREE.SphereGeometry(0.17, 8, 6), glowMat(), 0xffe2a8, x + Math.cos(a) * 0.58, 4.98, z + Math.sin(a) * 0.58);
  }
  k.add(new THREE.SphereGeometry(0.2, 8, 6), glowMat(), 0xfff0c8, x, 5.15, z);
}

/** Bulbs hung on a sagging line from a to c. */
function stringLights(k: Kit, a: THREE.Vector3, c: THREE.Vector3, sag: number, spacing = 0.7, color = 0xffd9a0): void {
  const n = Math.max(2, Math.round(a.distanceTo(c) / spacing));
  const line = M();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a.x + (c.x - a.x) * t;
    const z = a.z + (c.z - a.z) * t;
    const y = a.y + (c.y - a.y) * t - Math.sin(t * Math.PI) * sag;
    k.add(new THREE.OctahedronGeometry(0.07, 0), glowMat(), color, x, y - 0.06, z);
    if (i < n) {
      const t2 = (i + 1) / n;
      const x2 = a.x + (c.x - a.x) * t2;
      const z2 = a.z + (c.z - a.z) * t2;
      const y2 = a.y + (c.y - a.y) * t2 - Math.sin(t2 * Math.PI) * sag;
      const len = Math.hypot(x2 - x, y2 - y, z2 - z);
      const g = new THREE.BoxGeometry(0.02, 0.02, len);
      g.lookAt(new THREE.Vector3(x2 - x, y2 - y, z2 - z));
      k.add(g, line, 0x111111, (x + x2) / 2, (y + y2) / 2, (z + z2) / 2);
    }
  }
}

/** A round-headed ficus in a square planter (the promenade's shade trees). */
function ficus(k: Kit, x: number, z: number, s = 1): void {
  k.box(M(), 0xb8ab94, x, 0.3, z, 2.2, 0.6, 2.2);
  k.box(M(), 0x4a3a28, x, 0.62, z, 1.9, 0.05, 1.9);
  k.cyl(M(), 0x5a4a3a, x, 1.9 * s, z, 0.12, 0.18, 2.6 * s, 6);
  const leaf = M();
  for (const [dx, dy, dz, r] of [
    [0, 3.7, 0, 1.6],
    [0.8, 3.4, 0.5, 1.1],
    [-0.8, 3.5, -0.4, 1.15],
    [0.2, 4.4, -0.3, 1.0],
  ] as const)
    k.add(new THREE.IcosahedronGeometry(r * s, 1), leaf, 0x3f6e34, x + dx * s, dy * s, z + dz * s);
  // wrapped in white fairy lights, like the real ones
  for (let i = 0; i < 46; i++) {
    const a = i * 2.399;
    const yy = 2.6 + ((i * 0.37) % 1) * 2.4;
    const rr = 1.55 * Math.sqrt(Math.max(0.15, 1 - ((yy - 3.7) / 1.7) ** 2));
    k.add(new THREE.OctahedronGeometry(0.055, 0), glowMat(), 0xfff2cc, x + Math.cos(a) * rr * s, yy * s, z + Math.sin(a) * rr * s);
  }
}

/** Bistro table with two chairs and an umbrella, local to the kit's current frame. */
function patioTable(k: Kit, x: number, z: number, umb: number | null): void {
  const metal = MET();
  k.cyl(metal, 0x1a1a1c, x, 0.36, z, 0.04, 0.04, 0.72, 6);
  k.cyl(metal, 0x2a2a2e, x, 0.74, z, 0.42, 0.42, 0.04, 12);
  for (const s of [-1, 1]) {
    k.box(metal, 0x1a1a1c, x + s * 0.62, 0.45, z, 0.42, 0.05, 0.42);
    k.box(metal, 0x1a1a1c, x + s * 0.82, 0.75, z, 0.04, 0.6, 0.42);
    for (const dz of [-0.18, 0.18]) k.box(metal, 0x1a1a1c, x + s * 0.62, 0.22, z + dz, 0.04, 0.45, 0.04);
  }
  if (umb !== null) {
    k.cyl(metal, 0xdddddd, x, 1.5, z, 0.03, 0.03, 1.6, 5);
    k.add(new THREE.ConeGeometry(1.25, 0.45, 8, 1, true), M(), umb, x, 2.45, z);
  }
}

// ------------------------------------------------------------------ one storefront
function storefront(b: WorldBuilder, k: Kit, t: Tenant): void {
  const S = t.side === 'S';
  const zf = S ? ZS : ZN;
  const ry = S ? Math.PI : 0;
  const cx = (t.x0 + t.x1) / 2;
  const w = t.x1 - t.x0 - 0.08;
  const wall = M();
  const trimM = M();
  const dark = MET();
  const SM = linqSignMat(b);
  const WM = linqWindowMat(b);
  const groundH = 4.3;
  // collider (solid unless it's a walk-in shop, which builds its own walls)
  if (!t.walkIn) b.collider(t.x0, t.x1, S ? zf : zf - t.d, S ? zf + t.d : zf, 0, t.h, true);
  k.at(cx, 0, zf, ry, () => {
    // body: in front of the back; walk-ins get walls with a door gap
    if (t.walkIn) {
      const doorW = 2.6;
      const side = (w - doorW) / 2;
      k.box(wall, t.wall, -doorW / 2 - side / 2, groundH + (t.h - groundH) / 2, -0.15, side, t.h - groundH, 0.3);
      k.box(wall, t.wall, doorW / 2 + side / 2, groundH + (t.h - groundH) / 2, -0.15, side, t.h - groundH, 0.3);
      k.box(wall, t.wall, 0, groundH + (t.h - groundH) / 2, -0.15, doorW, t.h - groundH, 0.3);
      k.box(wall, t.wall, 0, t.h / 2, -t.d + 0.15, w, t.h, 0.3);
      for (const s of [-1, 1]) k.box(wall, t.wall, s * (w / 2 - 0.15), t.h / 2, -t.d / 2, 0.3, t.h, t.d);
      k.box(wall, t.wall, 0, t.h - 0.15, -t.d / 2, w, 0.3, t.d);
      // the glass shopfront either side of the door (the walls behind are open to the interior)
      for (const s of [-1, 1]) {
        k.box(dark, 0x1a1a1e, s * (doorW / 2 + side / 2), 0.25, -0.15, side, 0.5, 0.3);
        aq(k, WM, linqRect(`win:${t.win}`), s * (doorW / 2 + side / 2), 2.4, -0.1, side - 0.3, 3.6);
      }
    } else {
      k.box(wall, t.wall, 0, t.h / 2, -t.d / 2, w, t.h, t.d);
      // shop windows with painted interiors, split into panes, a door in the middle
      const doorX = t.doorAt !== undefined ? (S ? -(t.doorAt - cx) : t.doorAt - cx) : 0;
      const glassW = w - 1.0;
      const panes = Math.max(1, Math.round(glassW / 2.8));
      const pw = glassW / panes;
      for (let i = 0; i < panes; i++) {
        const px = -glassW / 2 + pw * (i + 0.5);
        const isDoor = Math.abs(px - doorX) < pw / 2;
        if (isDoor) {
          k.box(dark, 0x101014, px, 1.35, 0.02, Math.min(1.8, pw - 0.2), 2.7, 0.08);
          k.box(dark, 0xc8a24a, px + 0.35, 1.2, 0.08, 0.04, 0.6, 0.04);
          aq(k, WM, linqRect(`win:${t.win}`), px, 3.4, 0.04, pw - 0.15, 1.0, 0, 0, 0xb0b0b0);
        } else {
          aq(k, WM, linqRect(`win:${t.win}`), px, 2.15, 0.04, pw - 0.15, 3.1);
          k.box(trimM, t.style === 'brick' || t.style === 'stone' ? TRIM_D : t.trim, px, 0.3, 0.08, pw - 0.1, 0.6, 0.16);
        }
        k.box(dark, 0x16161a, px - pw / 2, 2.0, 0.06, 0.1, 4.0, 0.12);
      }
      k.box(dark, 0x16161a, glassW / 2, 2.0, 0.06, 0.1, 4.0, 0.12);
      k.box(dark, 0x16161a, 0, 3.95, 0.07, glassW, 0.1, 0.12);
    }
    // pilasters
    for (const s of [-1, 1]) k.box(trimM, t.trim, s * (w / 2 - 0.25), t.h / 2, 0.08, 0.5, t.h, 0.3);
    // sign band + the sign
    if (t.sign) {
      const r = linqRect(t.sign);
      const sh = t.signH ?? 1.0;
      const sw = Math.min(w - 1.2, (sh * r[2]) / r[3]);
      const sy = groundH + 0.25 + sh / 2;
      k.box(dark, t.style === 'modern' ? 0x0c0c0e : t.trim, 0, sy, 0.1, Math.min(w - 0.9, sw + 0.3), sh + 0.25, 0.22);
      aq(k, SM, r, 0, sy, 0.215, sw, sh);
    }
    // cornice over the shopfront
    k.box(trimM, t.trim, 0, groundH, 0.18, w, 0.22, 0.4);
    // upper floors: lit windows with sills, a top cornice
    if (t.h > 7.4) {
      const yb = groundH + 0.6 + (t.signH ?? 1) + 0.3;
      const rows = Math.max(1, Math.floor((t.h - yb - 0.6) / 2.6));
      const cols = Math.max(1, Math.floor((w - 1.2) / 2.3));
      for (let ry2 = 0; ry2 < rows; ry2++) {
        for (let c = 0; c < cols; c++) {
          const x = -((cols - 1) * 2.3) / 2 + c * 2.3;
          const y = yb + 1.0 + ry2 * 2.6;
          aq(k, WM, linqRect(t.style === 'modern' ? `win:${t.win}` : 'win:upper'), x, y, 0.03, 1.25, 1.75, 0, 0, t.style === 'modern' ? 0x9a9a9a : 0xffffff);
          if (t.style !== 'modern') {
            k.box(trimM, t.style === 'brick' ? CREAM : TRIM_W, x, y - 0.95, 0.07, 1.5, 0.12, 0.18);
            k.box(trimM, t.style === 'brick' ? CREAM : TRIM_W, x, y + 0.98, 0.06, 1.55, 0.18, 0.14);
          } else k.box(dark, 0x0c0c0e, x, y, 0.02, 1.45, 1.95, 0.04);
        }
      }
    }
    k.box(trimM, t.trim, 0, t.h - 0.25, 0.12, w + 0.15, 0.5, 0.5);
    // awning: a sloped striped canvas with a valance
    if (t.awning) {
      const aw = Math.min(w - 0.8, 8);
      const depth = 1.7;
      const slope = Math.atan2(0.75, depth);
      const len = Math.hypot(depth, 0.75);
      aq(k, atlasLit(), linqRect(t.awning), 0, 3.95 - 0.375, depth / 2 + 0.1, aw, len, 0, -Math.PI / 2 + slope);
      aq(k, atlasLit(), linqRect(t.awning), 0, 3.0, depth + 0.1, aw, 0.36);
      for (const s of [-1, 1]) k.box(MET(), 0x111111, s * (aw / 2), 3.6, depth / 2 + 0.1, 0.04, 0.04, depth);
    }
    // projecting blade sign
    if (t.blade) {
      const r = linqRect(t.blade);
      const bh = 4.2;
      const bw = (bh * r[2]) / r[3];
      const bx = w / 2 - 0.9;
      const bz = 0.2 + bw / 2;
      k.box(dark, 0x111111, bx, 7.6, bz, 0.2, bh + 0.2, bw + 0.2);
      aq(k, SM, r, bx + 0.11, 7.6, bz, bw, bh, Math.PI / 2);
      aq(k, SM, r, bx - 0.11, 7.6, bz, bw, bh, -Math.PI / 2);
    }
    // patio with a rail of planters, tables, umbrellas and string lights from the facade
    if (t.patio) {
      const pw = Math.min(w - 0.6, 12);
      const pz = t.patio;
      const rail = MET();
      k.box(rail, 0x141416, 0, 0.95, pz, pw, 0.05, 0.05);
      k.box(M(), 0x6a5a48, -pw / 2 + 0.6, 0.35, pz, 1.2, 0.7, 0.5);
      k.box(M(), 0x6a5a48, pw / 2 - 0.6, 0.35, pz, 1.2, 0.7, 0.5);
      for (let x = -pw / 2; x <= pw / 2 + 0.01; x += pw / Math.max(1, Math.round(pw / 1.6))) k.box(rail, 0x141416, x, 0.48, pz, 0.05, 0.96, 0.05);
      const tables = Math.max(1, Math.floor(pw / 2.6));
      const umbC = [t.trim, 0xf4efe6, t.trim];
      for (let i = 0; i < tables; i++) {
        const x = -pw / 2 + (pw / tables) * (i + 0.5);
        patioTable(k, x, pz / 2 + 0.1, t.awning && pz < 2.5 ? null : umbC[i % 3]);
      }
      // string lights: facade top of the shopfront → the rail posts
      for (let i = 0; i <= 2; i++) {
        const x = -pw / 2 + (pw / 2) * i;
        stringLights(k, new THREE.Vector3(x * 0.8, 4.3, 0.2), new THREE.Vector3(x, 2.1, pz), 0.35, 0.6);
      }
      for (const s of [-1, 1]) k.cyl(rail, 0x141416, s * (pw / 2), 1.1, pz, 0.04, 0.04, 2.2, 5);
    }
  });
  if (t.patio) {
    // the rail is a low wall (with a gap in the middle for the waiters)
    const pw = Math.min(w - 0.6, 12);
    const zr = S ? zf - t.patio : zf + t.patio;
    b.collider(cx - pw / 2, cx - 0.9, zr - 0.15, zr + 0.15, 0, 1.0, true);
    b.collider(cx + 0.9, cx + pw / 2, zr - 0.15, zr + 0.15, 0, 1.0, true);
  }
  if (t.shop) {
    const sz = S ? zf - (t.patio ? t.patio + 1 : 1.2) : zf + (t.patio ? t.patio + 1 : 1.2);
    const pos = t.walkIn ? new THREE.Vector3(cx, 0, S ? zf + t.d * 0.55 : zf - t.d * 0.55) : new THREE.Vector3(cx, 0, sz);
    b.shopSpots.push({ kind: t.shop.kind, position: pos, radius: t.walkIn ? 3.4 : 3, label: t.shop.label, catalog: t.shop.catalog, hint: t.shop.hint });
  }
  // on the phone map: each storefront as a building, the working ones labelled
  b.building(cx, S ? zf + t.d / 2 : zf - t.d / 2, t.x1 - t.x0, t.d, `#${new THREE.Color(t.wall).getHexString()}`, t.shop?.label);
  b.zone(t.shop?.label ?? t.id, t.x0, t.x1, S ? zf - (t.patio ?? 0) : zf - t.d, S ? zf + t.d : zf + (t.patio ?? 0));
}

// ------------------------------------------------------------------ Brooklyn Bowl: the round striped building
function brooklynBowl(b: WorldBuilder, k: Kit): void {
  const x0 = 110;
  const x1 = 124;
  const zf = ZS;
  const zb = -87.5;
  const H = 12;
  const SM = linqSignMat(b);
  const WM = linqWindowMat(b);
  const wall = M();
  // the box behind: white-and-graphite bands, red frames on the ground floor, the BB badge up top
  k.box(wall, 0xe8e6e0, (x0 + x1) / 2 + 2, H / 2, (zf + zb) / 2, x1 - x0 - 4, H, zb - zf);
  for (let y = 5.2; y < H; y += 0.9) k.box(wall, 0x2a2a30, (x0 + x1) / 2 + 2, y, zf - 0.02, x1 - x0 - 4, 0.32, 0.1);
  aq(k, SM, linqRect('brooklyn-bowl'), (x0 + x1) / 2 + 2.5, 8.6, zf - 0.09, 6.4, 3.2, Math.PI);
  // ground floor: red portals and the bowling-lounge window
  for (let i = 0; i < 3; i++) {
    const x = x0 + 6 + i * 2.6;
    k.box(wall, 0xc8202a, x, 2.1, zf - 0.05, 2.4, 4.2, 0.2);
    aq(k, WM, linqRect('win:bowl'), x, 2.2, zf - 0.17, 2.0, 3.4, Math.PI);
  }
  // chevron light strip (pink arrows pointing down to the door)
  for (let i = 0; i < 6; i++) k.add(new THREE.ConeGeometry(0.35, 0.35, 3), glowMat(), 0xff4a8a, x1 - 1.2, 9.5 - i * 0.9, zf - 0.15, 0, Math.PI, 0);
  // the drum on the corner by the fountain: striped, a glass band, the stepped blue glass crown
  const dx = x0 + 3.6;
  const dz = zf - 0.6;
  const R = 4.2;
  k.cyl(wall, 0xf0eee8, dx, 6, dz, R, R, 12, 28);
  for (let y = 5.5; y < 11.5; y += 0.8) k.cyl(wall, 0x2a2a30, dx, y, dz, R + 0.03, R + 0.03, 0.3, 28);
  // glass band with the lounge inside (atlas window wrapped as panels)
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.95 + (i / 8) * Math.PI * 0.95;
    const px = dx + Math.cos(a) * (R + 0.04);
    const pz = dz + Math.sin(a) * (R + 0.04);
    aq(k, WM, linqRect('win:bar'), px, 2.3, pz, 2.6, 3.6, Math.atan2(Math.cos(a), Math.sin(a)), 0, 0xd0d0d0);
  }
  aq(k, SM, linqRect('s:cupcakes'), dx, 4.6, dz - R - 0.1, 4.4, 0.6, Math.PI);
  const crownGlass = new THREE.MeshStandardMaterial({ color: 0x5ab8ff, emissive: 0x2a8aff, emissiveIntensity: 0.3, roughness: 0.15, metalness: 0.4 });
  b.nightGlow(crownGlass, 0.12, 1.15);
  for (let i = 0; i < 3; i++) {
    const r = R * (0.95 - i * 0.2);
    const geo = new THREE.CylinderGeometry(r, r + 0.3, 1.3, 8);
    k.add(geo, crownGlass, 0xffffff, dx, 12.65 + i * 1.3, dz, Math.PI / 8);
  }
  // the colourful dot clusters on the facade (lit discs)
  const dots = [0xff3a3a, 0xffd24d, 0x4dff7a, 0x35e0ff, 0xff7ad8, 0xff8a1a];
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (1.12 + (i % 7) * 0.09);
    const y = 6.5 + Math.floor(i / 7) * 1.5 + (i % 2) * 0.55;
    const disc = new THREE.CircleGeometry(0.4, 14);
    k.add(disc, glowMat(), dots[i % dots.length], dx + Math.cos(a) * (R + 0.08), y, dz + Math.sin(a) * (R + 0.08), Math.atan2(Math.cos(a), Math.sin(a)));
  }
  b.collider(x0, x1, zf, zb, 0, H, true);
  b.collider(dx - R, dx + R, dz - R, dz + R, 0, 16, true);
  b.shopSpots.push({ kind: 'bowling', position: new THREE.Vector3(x0 + 8.6, 0, zf - 1.3), radius: 2.8, label: 'Brooklyn Bowl', hint: 'bowl a frame ($8, strike pays $40)' });
  b.zone('Brooklyn Bowl', x0, x1, zf - 1.5, zb);
}

// ------------------------------------------------------------------ the fountain
function fountain(b: WorldBuilder, k: Kit, x: number, z: number): void {
  const rx = 6.5;
  const rz = 2.7;
  // rim: a low stone ring you can sit on (oval = scaled ring segments)
  const n = 36;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const a2 = ((i + 1) / n) * Math.PI * 2;
    const p = new THREE.Vector3(x + Math.cos(a) * rx, 0, z + Math.sin(a) * rz);
    const q = new THREE.Vector3(x + Math.cos(a2) * rx, 0, z + Math.sin(a2) * rz);
    const len = p.distanceTo(q) + 0.05;
    const g = new THREE.BoxGeometry(len, 0.55, 0.5);
    k.add(g, M(), 0xcfc4ae, (p.x + q.x) / 2, 0.275, (p.z + q.z) / 2, -Math.atan2(q.z - p.z, q.x - p.x));
  }
  const water = new THREE.MeshStandardMaterial({ color: 0x0a4a8a, emissive: 0x1a6aff, emissiveIntensity: 0.15, roughness: 0.05, metalness: 0.5 });
  b.nightGlow(water, 0.08, 0.75);
  const wg = new THREE.CircleGeometry(1, 40);
  wg.rotateX(-Math.PI / 2);
  wg.scale(rx - 0.2, 1, rz - 0.2);
  k.add(wg, water, 0xffffff, x, 0.32, z);
  b.waterZones.push({ name: 'LINQ Promenade fountain', minX: x - rx + 0.4, maxX: x + rx - 0.4, minZ: z - rz + 0.3, maxZ: z + rz - 0.3, y: 0.32 });
  b.collider(x - rx, x + rx, z - rz, z + rz, 0, 0.5);
  // the jets: one instanced mesh, dancing in waves (only animated when the cat's near)
  const jetMat = new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.38, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const jetGeo = new THREE.CylinderGeometry(0.17, 0.05, 1, 7, 1, true);
  jetGeo.translate(0, 0.5, 0);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const rr = i % 2 ? 0.55 : 0.82;
    pts.push([x + Math.cos(a) * (rx - 0.5) * rr, z + Math.sin(a) * (rz - 0.4) * rr]);
  }
  const jets = new THREE.InstancedMesh(jetGeo, jetMat, pts.length);
  jets.frustumCulled = false;
  b.scene.add(jets);
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const update = (t: number) => {
    pts.forEach(([px, pz], i) => {
      const h = 0.4 + 1.6 * Math.max(0, Math.sin(t * 1.7 + i * 0.6)) ** 2 + (i % 5 === 0 ? 0.8 : 0);
      m4.compose(pos.set(px, 0.3, pz), q, sc.set(1, h, 1));
      jets.setMatrixAt(i, m4);
    });
    jets.instanceMatrix.needsUpdate = true;
  };
  update(0);
  b.every((_dt, t, night) => {
    const near = Math.hypot(viewer.cam.x - x, viewer.cam.z - z) < 140;
    jets.visible = near;
    if (!near) return;
    jetMat.color.setHSL(0.56, 0.9, 0.5 + night * 0.12);
    update(t);
  });
}

// ------------------------------------------------------------------ the souvenir shop interior (lazy)
function souvenirInterior(b: WorldBuilder, t: Tenant): void {
  const minX = t.x0 + 0.3;
  const maxX = t.x1 - 0.3;
  const minZ = ZN - t.d + 0.3;
  const maxZ = ZN - 0.3;
  const cx = (t.x0 + t.x1) / 2;
  // walls (the shell itself is drawn by the facade kit); colliders with a door gap
  b.collider(t.x0, cx - 1.3, ZN - 0.3, ZN, 0, t.h, true);
  b.collider(cx + 1.3, t.x1, ZN - 0.3, ZN, 0, t.h, true);
  b.collider(t.x0, t.x1, ZN - t.d, ZN - t.d + 0.3, 0, t.h, true);
  b.collider(t.x0, t.x0 + 0.3, ZN - t.d, ZN, 0, t.h, true);
  b.collider(t.x1 - 0.3, t.x1, ZN - t.d, ZN, 0, t.h, true);
  b.collider(t.x0, t.x1, ZN - t.d, ZN, t.h - 0.3, t.h, false);
  lazyInterior(b, 'interior:linq-souvenirs', { minX, maxX, minZ, maxZ, height: t.h, doors: [{ x: cx, z: ZN, nx: 0, nz: 1, half: 1.3 }] }, (group) => {
    const k = new Kit();
    const rnd = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    k.box(glowMat(), 0x2a3050, cx, 0.03, (minZ + maxZ) / 2, maxX - minX, 0.04, maxZ - minZ);
    k.box(M(), 0xf4efe6, cx, t.h - 0.4, (minZ + maxZ) / 2, maxX - minX, 0.05, maxZ - minZ);
    // shelving round the walls: rows of mugs, shot glasses, snow globes, tees
    for (const side of [-1, 1]) {
      const x = side < 0 ? minX + 0.35 : maxX - 0.35;
      for (let level = 0; level < 4; level++) {
        k.box(M(), 0x6a4a2a, x, 0.5 + level * 0.6, (minZ + maxZ) / 2, 0.6, 0.05, maxZ - minZ - 1);
        for (let i = 0; i < 12; i++) {
          const c = [0xd62a2a, 0xffcf3a, 0x2a5ad8, 0xffffff, 0x4dff7a, 0xff4fa8][Math.floor(rnd(level * 31 + i + side * 7) * 6)];
          k.box(glowMat(), (c & 0xfefefe) >> 1 | 0x202020, x, 0.62 + level * 0.6, minZ + 0.8 + i * ((maxZ - minZ - 1.6) / 11), 0.18, 0.2, 0.16);
        }
      }
    }
    // a centre rack of VEGAS tees and the hat tree
    for (let i = 0; i < 6; i++) k.box(glowMat(), [0x8a1a1a, 0x1a1a1a, 0x1a3a8a, 0x9a9a9a, 0x9a2a6a, 0x9a7a1a][i], cx - 1.2 + i * 0.48, 1.1, (minZ + maxZ) / 2 - 0.6, 0.42, 0.7, 0.08);
    k.box(MET(), 0xc0c0c0, cx, 1.55, (minZ + maxZ) / 2 - 0.6, 3.2, 0.04, 0.04);
    // the counter at the back, a till, the mini Welcome sign
    k.box(M(), 0x1a2a5a, cx, 0.5, minZ + 1.2, 4, 1.0, 0.8);
    k.box(M(), 0xffcf3a, cx, 1.02, minZ + 1.2, 4.1, 0.05, 0.9);
    k.box(MET(), 0x222222, cx + 1.2, 1.2, minZ + 1.2, 0.4, 0.3, 0.3);
    aq(k, mapGlow(linqTex()), linqRect('welcome-shop'), cx, 3.2, minZ + 0.08, 4.2, 1.6, 0, 0, 0x9a9a9a);
    // warm cream walls and a light floor: the shop reads lit from inside
    k.box(glowMat(), 0x4a4038, cx, t.h / 2, minZ + 0.02, maxX - minX, t.h, 0.04);
    for (const sx of [minX + 0.06, maxX - 0.06]) k.box(glowMat(), 0x3e362e, sx, t.h / 2, (minZ + maxZ) / 2, 0.04, t.h, maxZ - minZ);
    for (let i = 0; i < 3; i++) k.can(cx - 2 + i * 2, t.h - 0.45, (minZ + maxZ) / 2);
    k.flush(group);
    return [];
  });
}

// ------------------------------------------------------------------ night light on the paving
/**
 * After dark the real promenade is bright: every shopfront spills warm light onto the pavers, the
 * five-globe lamps throw pools, the fountain tints its plaza blue. Done in the paving's own shader
 * (no lights, no draw calls): a per-metre colour for each frontage (a 1-D texture built from the
 * tenants), falling off with distance from the building line, plus cos² lamp pools on the lamp grid.
 */
function pavingGlow(b: WorldBuilder, pav: THREE.MeshStandardMaterial): void {
  const N = 256;
  const data = new Uint8Array(N * 2 * 4);
  const warm = new THREE.Color(0xffd29a);
  const c = new THREE.Color();
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < N; i++) {
      const x = LINQ.x0 + ((i + 0.5) / N) * (LINQ.x1 - LINQ.x0);
      const t = TENANTS.find((q) => q.side === (row === 0 ? 'S' : 'N') && x >= q.x0 && x < q.x1);
      let k = 0.55;
      if (t) {
        c.setHex(t.trim).lerp(warm, 0.6);
        k = t.patio ? 1 : 0.85;
      } else if (row === 0 && x > 110 && x < 124) {
        c.setHex(0xff7ab8).lerp(warm, 0.4); // Brooklyn Bowl's glass and dots
        k = 0.9;
      } else c.copy(warm);
      const o = (row * N + i) * 4;
      data[o] = Math.round(c.r * 255 * k);
      data[o + 1] = Math.round(c.g * 255 * k);
      data[o + 2] = Math.round(c.b * 255 * k);
      data[o + 3] = 255;
    }
  }
  const front = new THREE.DataTexture(data, N, 2);
  front.magFilter = THREE.LinearFilter;
  front.minFilter = THREE.LinearFilter;
  front.colorSpace = THREE.SRGBColorSpace;
  front.needsUpdate = true;
  const night = { value: 0 };
  b.every((_dt, _t, n) => {
    night.value = n;
  });
  pav.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night;
    sh.uniforms.uFront = { value: front };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLinqW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLinqW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLinqW;\nuniform float uNight;\nuniform sampler2D uFront;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float u = clamp((vLinqW.x - ${LINQ.x0.toFixed(1)}) / ${(LINQ.x1 - LINQ.x0).toFixed(1)}, 0.0, 1.0);
          float dS = max(0.0, ${ZS.toFixed(2)} - vLinqW.z);
          float dN = max(0.0, vLinqW.z - (${ZN.toFixed(2)}));
          vec3 fS = texture2D(uFront, vec2(u, 0.25)).rgb * exp(-dS * 0.32);
          vec3 fN = texture2D(uFront, vec2(u, 0.75)).rgb * exp(-dN * 0.32);
          // lamp pools: south lamps every 12 m from x 31, north from x 37
          float ax = mod(vLinqW.x - 31.0 + 6.0, 12.0) - 6.0;
          float bx = mod(vLinqW.x - 37.0 + 6.0, 12.0) - 6.0;
          float sz = vLinqW.z - (${(ZS - 3.9).toFixed(2)});
          float nz = vLinqW.z - (${(ZN + 3.9).toFixed(2)});
          float pS = exp(-(ax * ax + sz * sz) * 0.12);
          float pN = exp(-(bx * bx + nz * nz) * 0.12);
          // the fountain's blue
          vec2 fq = (vLinqW.xz - vec2(106.0, ${ZC.toFixed(2)})) / vec2(9.0, 5.0);
          float fb = exp(-dot(fq, fq) * 1.4);
          vec3 glow = (fS + fN) * 0.42 + vec3(1.0, 0.82, 0.58) * (pS + pN) * 0.38 + vec3(0.25, 0.55, 1.0) * fb * 0.3;
          totalEmissiveRadiance += glow * diffuseColor.rgb * uNight;
        }`
      );
  };
  pav.customProgramCacheKey = () => 'linq-paving-glow';
}

// ------------------------------------------------------------------ build it
export function buildLinqPromenade(b: WorldBuilder): void {
  // the paving: light grey-tan pavers in running bond, edge bands
  const pav = new THREE.MeshStandardMaterial({ map: makePaverTexture('#bcb2a2', '#968c7a', 6, 256, 'running'), roughness: 0.82 });
  pav.map!.wrapS = pav.map!.wrapT = THREE.RepeatWrapping;
  pav.map!.repeat.set((LINQ.x1 - LINQ.x0) / 3, (ZS - ZN) / 3);
  pavingGlow(b, pav);
  b.floor((LINQ.x0 + LINQ.x1) / 2, ZC, LINQ.x1 - LINQ.x0, ZS - ZN, pav, 0.05);
  // the High Roller plaza at the end of the walk, same pavers
  const pav2 = new THREE.MeshStandardMaterial({ map: pav.map!.clone(), roughness: 0.82 });
  pav2.map!.repeat.set(30 / 3, 22 / 3);
  pav2.map!.needsUpdate = true;
  pavingGlow(b, pav2);
  b.floor(161, -105, 30, 22, pav2, 0.05);
  b.feature({ kind: 'plaza', x: (LINQ.x0 + LINQ.x1) / 2, z: ZC, w: LINQ.x1 - LINQ.x0, d: ZS - ZN, color: '#c8bfae', label: 'LINQ Promenade' });

  const k = new Kit();
  for (const t of TENANTS) if (!t.skip) storefront(b, k, t);
  const welcome = TENANTS.find((t) => t.id === 'welcome')!;
  souvenirInterior(b, welcome);

  // In-N-Out, at its real spot (3545 S LVB Ste L24): the Flamingo side, next to Brooklyn Bowl and the
  // fountain. Built by the restaurant kit (walk in, order, fight for a table), the storey above here.
  b.restaurants.push(buildInNOut(b, 100, -92, Math.PI, { name: 'In-N-Out (LINQ Promenade)', standalone: false, w: 14, d: 9, patio: false, inLine: true }));
  const ino = TENANTS.find((t) => t.id === 'innout-upper')!;
  k.at(100, 0, ZS, Math.PI, () => {
    const wall = M();
    k.box(wall, 0xf7f5f0, 0, 5.75 + (ino.h - 5.75) / 2, -ino.d / 2, 14, ino.h - 5.75, ino.d);
    k.box(wall, 0xd81e2a, 0, 6.35, 0.12, 14, 0.8, 0.25);
    k.box(wall, 0xffc72c, 0, 5.9, 0.14, 14, 0.12, 0.27);
    for (let i = 0; i < 2; i++) aq(k, linqWindowMat(b), linqRect('win:upper'), -1.6 + i * 3.2, 8.0, 0.02, 1.6, 1.4);
    k.box(wall, 0xd81e2a, 0, ino.h - 0.2, 0.1, 14.2, 0.4, 0.5);
  });
  // the yellow arrow on the wall above the doors
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(-2.2, 0.5);
  arrowShape.lineTo(1.1, 0.5);
  arrowShape.lineTo(1.1, 1.1);
  arrowShape.lineTo(2.4, 0);
  arrowShape.lineTo(1.1, -1.1);
  arrowShape.lineTo(1.1, -0.5);
  arrowShape.lineTo(-2.2, -0.5);
  arrowShape.closePath();
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffc72c, emissive: 0xffb000, emissiveIntensity: 0.25, roughness: 0.4 });
  b.nightGlow(arrowMat, 0.2, 1.2);
  const arrow = new THREE.Mesh(new THREE.ExtrudeGeometry(arrowShape, { depth: 0.15, bevelEnabled: false }), arrowMat);
  arrow.position.set(103.6, 8.0, ZS - 0.3);
  arrow.rotation.set(0, Math.PI, -0.22);
  b.add(arrow);
  b.add(neonSign('In-N-Out Burger', '#d81e2a', '#ffffff', 5.6, 1.1, undefined, 0.12), 96.6, 8.0, ZS - 0.3, Math.PI);
  b.collider(93, 107, ZS, -87.5, 5.7, ino.h, false);

  brooklynBowl(b, k);
  fountain(b, k, 106, ZC);

  // the median: ficus planters with seating ledges, palm pairs, lamp posts both sides
  const lampXs: number[] = [];
  for (let x = 31; x < 144; x += 12) lampXs.push(x);
  const LS = ZS - 3.9;
  const LN = ZN + 3.9;
  for (const x of lampXs) {
    if (Math.abs(x - 106) > 7) lampPost(k, x, LS);
    if (Math.abs(x + 6 - 106) > 7) lampPost(k, x + 6, LN);
  }
  const islands = [38, 54, 70, 86, 126];
  for (const x of islands) {
    if (x % 32 === 6) ficus(k, x, ZC, 1.05);
    else {
      k.box(M(), 0xb8ab94, x, 0.28, ZC, 4.2, 0.56, 1.6);
      k.box(M(), 0x4a3a28, x, 0.58, ZC, 3.9, 0.05, 1.3);
      for (const s of [-1, 1]) b.add(palmTree(11.5 + s, false, x + s), x + s * 1.2, 0.6, ZC);
    }
    b.collider(x - 2.1, x + 2.1, ZC - 1.1, ZC + 1.1, 0, 0.56);
  }
  // tall palms along both building lines (they frame the walk in every photo)
  for (const x of lampXs) {
    if (Math.abs(x + 6 - 106) > 8) b.add(palmTree(13 + (x % 3), false, x * 3), x + 6, 0, LS);
    if (Math.abs(x - 106) > 8) b.add(palmTree(12.5 + (x % 2), false, x * 5), x, 0, LN);
  }
  // string lights zig-zagging across the walk around the fountain plaza and the Strip end
  for (const x of [43, 55, 67, 79, 91, 119, 131]) stringLights(k, new THREE.Vector3(x, 4.9, LS), new THREE.Vector3(x + 6, 4.9, LN), 0.8);

  // kiosks: Grand Canyon helicopter tours (by Tilted Kilt, as in the photos), Tix4Vegas, a drinks cart
  const kiosk = (x: number, z: number, sign: string, body: number) => {
    k.box(M(), body, x, 0.55, z, 3, 1.1, 1.6);
    k.box(M(), 0xf4efe6, x, 1.12, z, 3.2, 0.06, 1.8);
    for (const sx of [-1.4, 1.4]) for (const sz of [-0.7, 0.7]) k.box(MET(), 0x222222, x + sx, 1.9, z + sz, 0.06, 1.6, 0.06);
    k.box(M(), 0x1a1a1a, x, 2.75, z, 3.4, 0.15, 2.0);
    const r = linqRect(sign);
    for (const s of [-1, 1]) aq(k, linqSignMat(b), r, x, 2.35, z + s * 0.82, 2.8, 0.7, s > 0 ? 0 : Math.PI);
    b.collider(x - 1.5, x + 1.5, z - 0.8, z + 0.8, 0, 1.1);
  };
  kiosk(78, ZC, 's:heli', 0x2a2a6a);
  kiosk(62, ZC, 's:tix', 0x3a0a5a);
  kiosk(46, ZC, 's:squeeze', 0x1a3a1a);
  b.shopSpots.push({ kind: 'store', position: new THREE.Vector3(46, 0, ZC + 1.5), radius: 2.4, label: 'Squeeze frozen drinks', catalog: 'breeze', hint: 'daiquiris to go (🍹)' });

  // High Roller plaza: the Sky Shop pavilion at the foot of the boarding stairs
  const skyX0 = 147;
  const skyX1 = 156;
  k.box(M(), 0x1c2a3a, (skyX0 + skyX1) / 2, 2.6, -97.8, skyX1 - skyX0, 5.2, 4.4);
  aq(k, linqWindowMat(b), linqRect('win:shop'), (skyX0 + skyX1) / 2, 2.0, -100.04, skyX1 - skyX0 - 1, 3.2, Math.PI);
  aq(k, linqSignMat(b), linqRect('s:skyshop'), (skyX0 + skyX1) / 2, 4.5, -100.06, 4.4, 1.1, Math.PI);
  k.box(M(), 0x35e0ff, (skyX0 + skyX1) / 2, 5.25, -100, skyX1 - skyX0 + 0.2, 0.12, 0.2);
  b.collider(skyX0, skyX1, -100, -95.6, 0, 5.2, true);
  b.shopSpots.push({ kind: 'store', position: new THREE.Vector3((skyX0 + skyX1) / 2, 0, -101.4), radius: 2.6, label: 'Sky Shop', catalog: 'sky-shop', hint: 'High Roller souvenirs' });
  aq(k, linqSignMat(b), linqRect('s:highroller'), 156.6, 4.2, -104, 7.2, 0.9, -Math.PI / 2);

  // Fly LINQ landing tower: an open white steel frame with the landing deck at 6 m, at the wheel end
  {
    const lx = 141.5;
    const steelW = MET();
    for (const [dx, dz] of [
      [-1.8, -2.2],
      [1.8, -2.2],
      [-1.8, 2.2],
      [1.8, 2.2],
    ])
      k.box(steelW, 0xeef0f2, lx + dx, 3.6, -104 + dz, 0.32, 7.2, 0.32);
    for (const y of [2.4, 4.8]) {
      for (const s of [-1, 1]) {
        k.box(steelW, 0xeef0f2, lx, y, -104 + s * 2.2, 3.9, 0.18, 0.18);
        k.box(steelW, 0xeef0f2, lx + s * 1.8, y, -104, 0.18, 0.18, 4.7);
      }
    }
    k.box(steelW, 0xd8dce2, lx, 6.1, -104, 4.4, 0.3, 5.2);
    for (const s of [-1, 1]) k.box(steelW, 0x9aa2ac, lx, 7.0, -104 + s * 2.55, 4.2, 1.6, 0.06);
    k.box(steelW, 0x1a6ad8, lx, 7.95, -104, 4.6, 0.22, 5.4);
    b.collider(lx - 2, lx + 2, -106.4, -101.6, 0, 6.2, true);
  }

  // behind the north row: the LINQ's back-of-house block and its self-parking garage (OSM: The LINQ
  // Self Parking sits north of the promenade's east half, by LINQ Lane)
  k.box(M(), 0xd6d0c4, 101, 6, -125.5, 90, 12, 7);
  for (let y = 3; y < 15; y += 3) k.box(M(), 0xbfb8aa, 120, y, -139, 52, 0.5, 22);
  k.box(M(), 0xcfc8ba, 120, 7.5, -139, 50, 15, 20);
  for (let lvl = 0; lvl < 4; lvl++) k.box(M(), 0x2a2a30, 120, 1.6 + lvl * 3.4, -128.96, 48, 1.4, 0.08);
  b.collider(56, 146, -129, -122, 0, 12, true);
  b.collider(95, 145, -149, -129, 0, 15, true);

  const out = k.flush(b.root);
  for (const m of out) {
    m.castShadow = m.material === M() || m.material === MET();
    m.receiveShadow = true;
  }

  // ---------------------------------------------------------------- life: performers, crowds with drinks
  b.crowd.performers.push(
    { kind: 'showgirl', x: 96.5, z: ZC + 3.4, facing: -Math.PI / 2 },
    { kind: 'statue', x: 64, z: ZC + 0.2, facing: Math.PI / 2 },
    { kind: 'robot', x: 136, z: ZC - 2.5, facing: -Math.PI / 2 },
    { kind: 'elvis', x: 88, z: ZC + 3.2, facing: Math.PI }
  );
  b.crowd.tourists.push(
    { pts: [[22, ZC - 2.5], [144, ZC - 2.5]], prop: 'yard-drink' },
    { pts: [[144, ZC + 2.5], [22, ZC + 2.5]], prop: 'yard-drink' },
    { pts: [[24, ZC - 2.9], [98, ZC - 2.9]], prop: 'camera' },
    { pts: [[140, ZC + 2.9], [30, ZC + 2.9]], prop: 'bag' },
    { pts: [[30, ZC + 1.2], [96, ZC + 1.4]], prop: 'cig' },
    { pts: [[120, ZC - 1], [144, ZC - 3]], prop: 'yard-drink' },
    { pts: [[52, ZC - 1.8], [130, ZC - 1.5]], prop: 'yard-drink' },
    { pts: [[134, ZC + 1], [60, ZC + 3]], prop: 'none' }
  );
  b.zone('The LINQ Promenade', LINQ.x0, LINQ.x1, ZN, ZS);
}
