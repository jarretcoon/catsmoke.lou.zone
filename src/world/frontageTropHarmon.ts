import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { ShopAtlas, glowText, text } from './frontAtlas';
import { aq, FrontCluster, frontFrame, Pools, storefront, type FrontShop } from './frontKit';
import { glowMat, Kit, vcMat } from './interiorKit';

const M = () => vcMat(0.8);
const MET = () => vcMat(0.45, 0.5);
import { palmTree } from './props';
import './frontageCatalogs';

/*
 * Strip frontage shops, Tropicana Ave → Harmon Ave (build 5, area 1). Checked against OpenStreetMap
 * (shops and amenities within 160 m of the Boulevard), the tenants' own 2026 directories and street
 * photos; each sits in its real order along the sidewalk, compressed to the game's scale.
 *
 * West, south → north:
 *  - HERSHEY'S CHOCOLATE WORLD at New York-New York's Tropicana corner, between the Statue of Liberty
 *    and the Tropicana bridge escalators: two storeys of brown and glass, the name across the top, a
 *    silver Kiss on the corner, the wrapper screen over the doors.
 *  - Park MGM's Strip front: The Crack Shack (black, roll-up glass doors, the patio on the sidewalk,
 *    "next to Eataly"), the Park MGM street doors, and CVS (red on white).
 *  - Starbucks at the foot of the Waldorf Astoria, whose low stone podium and brass name replace the
 *    made-up "Diamond Row" shops (the real frontage between Crystals and Park MGM is the Waldorf).
 * East, south → north:
 *  - Walgreens (3765 S LVB, 24 hours) and the Polo Towers (Hilton Vacation Club) street lobby, where
 *    the made-up pharmacy/daiquiri/souvenir row stood.
 *  - The BLVD's ground floor (the 2026 directory, suites 104-123 running south from ABC Stores):
 *    JD Sports' flagship, H&M, MINISO, adidas, lululemon, Pandora and PUMA under the LED wall.
 */

const A = new ShopAtlas('frontTropHarmon', 2048, 2048);

// ------------------------------------------------------------------ signs
A.reg('fs:hersheys', 1024, 192, (ctx, w, h) => {
  ctx.fillStyle = '#3a1c0e';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  glowText(ctx, "HERSHEY'S", w / 2, h * 0.42, 'block', h * 0.62, w * 0.9, '#ffffff', '#ffffff');
  text(ctx, 'CHOCOLATE WORLD', w / 2, h * 0.84, 'sans', h * 0.17, w * 0.6, '#c8c8d2');
});
A.reg('fs:hz-screen', 512, 256, (ctx, w, h) => {
  // the wrapper screen: the classic brown bar with silver letters, a row of Kisses, a Reese's orange band
  ctx.fillStyle = '#4a2412';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ff7a1a';
  ctx.fillRect(0, h * 0.78, w, h * 0.22);
  text(ctx, "HERSHEY'S", w / 2, h * 0.32, 'block', h * 0.34, w * 0.86, '#d8d8e0', '#2a1408', 6);
  text(ctx, "REESE'S • KISSES • KIT KAT®", w / 2, h * 0.89, 'sans', h * 0.12, w * 0.9, '#3a1408');
  for (let i = 0; i < 7; i++) {
    const x = w * (0.1 + i * 0.133);
    const y = h * 0.66;
    const gr = ctx.createLinearGradient(x - 18, 0, x + 18, 0);
    gr.addColorStop(0, '#8a8a94');
    gr.addColorStop(0.5, '#f4f4f8');
    gr.addColorStop(1, '#7a7a84');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(x, y - 34);
    ctx.quadraticCurveTo(x - 6, y - 8, x - 20, y);
    ctx.lineTo(x + 20, y);
    ctx.quadraticCurveTo(x + 6, y - 8, x, y - 34);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, y - 46, 3, 14);
  }
});
A.sign('fs:crackshack', { text: 'THE CRACK SHACK', sub: 'CHICKEN & EGGS', style: 'block', fg: '#ffffff', bg: '#0c0c0c', look: 'neon', border: '#ffd23a', w: 768, h: 160 });
A.sign('fs:parkmgm', { text: 'PARK MGM', style: 'serif', fg: '#e8d6b0', bg: '#141210', look: 'channel', w: 512, h: 112 });
A.sign('fs:cvs', { text: 'CVS pharmacy', style: 'sans', fg: '#cc0000', bg: '#ffffff', look: 'panel', w: 640, h: 128 });
A.sign('fs:waldorf', { text: 'WALDORF ASTORIA', sub: 'LAS VEGAS', style: 'serif', fg: '#d8b878', bg: '#121110', look: 'channel', w: 768, h: 128 });
A.sign('fs:starbucks', { text: 'STARBUCKS', sub: 'COFFEE', style: 'sans', fg: '#ffffff', bg: '#00704a', look: 'panel' });
A.sign('fs:walgreens', { text: 'Walgreens', sub: 'PHARMACY • OPEN 24 HOURS', style: 'script', fg: '#e31837', bg: '#ffffff', look: 'panel', border: '#e31837', w: 768, h: 160 });
A.sign('fs:polo', { text: 'POLO TOWERS', sub: 'HILTON VACATION CLUB', style: 'deco', fg: '#f4e8c8', bg: '#14202c', look: 'channel', border: '#c8a24a', w: 640, h: 128 });
A.sign('fs:jd', { text: 'JD', sub: 'JD SPORTS • KING OF TRAINERS', style: 'block', fg: '#ffffff', bg: '#0a0a0a', look: 'panel', border: '#ffd200', w: 512, h: 128 });
A.sign('fs:hm', { text: 'H&M', style: 'script', fg: '#e50010', bg: '#ffffff', look: 'panel', w: 384, h: 128 });
A.sign('fs:miniso', { text: 'MINISO', style: 'block', fg: '#ffffff', bg: '#e8202a', look: 'panel', w: 384, h: 128 });
A.sign('fs:adidas', { text: 'adidas', style: 'sans', fg: '#ffffff', bg: '#0a0a0a', look: 'channel', w: 448, h: 128 });
A.sign('fs:lulu', { text: 'lululemon', style: 'sans', fg: '#d31f2a', bg: '#ffffff', look: 'panel', w: 448, h: 112 });
A.sign('fs:pandora', { text: 'PANDORA', style: 'thin', fg: '#ffffff', bg: '#141414', look: 'channel', w: 448, h: 112 });
A.sign('fs:puma', { text: 'PUMA', sub: 'FOREVER FASTER', style: 'block', fg: '#ffffff', bg: '#0a0a0a', look: 'panel', w: 448, h: 128 });

// ------------------------------------------------------------------ the fronts
const BLVD_X = 20.7; // just proud of the BLVD's glass (x 21) and its mullions
const BLVD_G = 3.6; // the BLVD's LED wall hangs from y 4.8: the shop signs stay under it

const FRONTS: FrontShop[] = [
  // ---- west: Park MGM, north → south (CVS, the street doors, The Crack Shack next to The Park)
  { id: 'cvs', side: 'W', z0: 316, z1: 326.6, d: 8, h: 7, wall: 0xe8e2d6, trim: 0xcc0000, sign: 'fs:cvs', signH: 1.4, softSign: true, win: 'pharmacy', style: 'stucco', shop: { kind: 'store', catalog: 'cvs-parkmgm', label: 'CVS Pharmacy (Park MGM)', hint: 'snacks, sunscreen, shades (no smokes!)' } },
  { id: 'parkmgm-doors', side: 'W', z0: 326.6, z1: 332.6, d: 8, h: 7, wall: 0x2a2622, trim: 0xb89a6a, sign: 'fs:parkmgm', signH: 0.9, win: 'lobby', style: 'modern', label: 'Park MGM (Strip entrance)' },
  { id: 'crackshack', side: 'W', z0: 332.6, z1: 344, d: 8, h: 7.5, wall: 0x141416, trim: 0x2a2a2e, sign: 'fs:crackshack', signH: 1.7, win: 'chicken', style: 'modern', patio: 2.6, shop: { kind: 'store', catalog: 'crack-shack', label: 'The Crack Shack', hint: 'fried chicken, frosé' }, pool: 0xffd890 },
  // ---- west: the Waldorf Astoria's street podium (Starbucks at its south end)
  { id: 'waldorf', side: 'W', z0: 266, z1: 285.6, d: 8, h: 6.2, wall: 0xd8ccb4, trim: 0x8a6a3a, sign: 'fs:waldorf', signH: 0.95, win: 'lobby', style: 'stone', label: 'Waldorf Astoria Las Vegas', pool: 0xffe0b0 },
  { id: 'starbucks-waldorf', side: 'W', z0: 285.6, z1: 291.2, d: 8, h: 6.2, wall: 0x3a3430, trim: 0x00704a, sign: 'fs:starbucks', signH: 0.95, win: 'cafe', style: 'modern', awning: 'awn:green', shop: { kind: 'store', catalog: 'starbucks-linq', label: 'Starbucks (Waldorf Astoria)', hint: 'cold brew (sprint)' } },
  // ---- east: Polo Towers' street front (where the made-up row stood), south → north
  { id: 'walgreens', side: 'E', z0: 322, z1: 343.7, d: 8, h: 6.8, groundH: 4.4, wall: 0xf2ede4, trim: 0xd8d0c4, sign: 'fs:walgreens', signH: 1.9, softSign: true, win: 'pharmacy', style: 'stucco', shop: { kind: 'store', catalog: 'walgreens-polo', label: 'Walgreens (24 hours)', hint: 'smokes, energy drinks, hangover kit' } },
  { id: 'polo', side: 'E', z0: 306.5, z1: 322, d: 8, h: 7.5, wall: 0x6a5a48, trim: 0xc8a24a, sign: 'fs:polo', signH: 1.1, win: 'lobby', style: 'stone', awning: 'awn:navy', label: 'Polo Towers (Hilton Vacation Club)' },
  // ---- east: the BLVD's ground floor under its LED wall (skins on the existing glass box), north → south
  { id: 'jd', side: 'E', xf: BLVD_X, z0: 255.2, z1: 266.2, d: 0.6, h: BLVD_G + 1.1, groundH: BLVD_G, wall: 0x101012, trim: 0xffd200, sign: 'fs:jd', signH: 0.8, win: 'sneakers', style: 'glass', noCollider: true, shop: { kind: 'store', catalog: 'jd-sports', label: 'JD Sports (BLVD flagship)', hint: 'sneakers, caps, shades' } },
  { id: 'hm', side: 'E', xf: BLVD_X, z0: 266.2, z1: 272.8, d: 0.6, h: BLVD_G + 1.1, groundH: BLVD_G, wall: 0xf2f2f2, trim: 0xe50010, sign: 'fs:hm', signH: 0.8, softSign: true, win: 'apparel', style: 'glass', noCollider: true, shop: { kind: 'store', catalog: 'hm-blvd', label: 'H&M (BLVD)', hint: 'bow ties, Vegas shirts' } },
  { id: 'miniso', side: 'E', xf: BLVD_X, z0: 272.8, z1: 277.4, d: 0.6, h: BLVD_G + 1.1, groundH: BLVD_G, wall: 0xe8202a, trim: 0xffffff, sign: 'fs:miniso', signH: 0.8, win: 'plush', style: 'glass', noCollider: true, shop: { kind: 'store', catalog: 'miniso-blvd', label: 'MINISO (BLVD)', hint: 'blind boxes, plush' } },
  { id: 'adidas', side: 'E', xf: BLVD_X, z0: 277.4, z1: 284.4, d: 0.6, h: BLVD_G + 1.1, groundH: BLVD_G, wall: 0x0a0a0a, trim: 0xffffff, sign: 'fs:adidas', signH: 0.8, win: 'sneakers', style: 'glass', noCollider: true, shop: { kind: 'store', catalog: 'adidas-blvd', label: 'adidas (BLVD)', hint: 'Sambas, track jackets' } },
  { id: 'lulu', side: 'E', xf: BLVD_X, z0: 284.4, z1: 289.6, d: 0.6, h: BLVD_G + 1.1, groundH: BLVD_G, wall: 0xf4f2ee, trim: 0xd31f2a, sign: 'fs:lulu', signH: 0.7, softSign: true, win: 'apparel', style: 'glass', noCollider: true, shop: { kind: 'store', catalog: 'lululemon-blvd', label: 'lululemon (BLVD)', hint: 'belt bags, yoga mats' } },
  { id: 'pandora', side: 'E', xf: BLVD_X, z0: 289.6, z1: 293.4, d: 0.6, h: BLVD_G + 1.1, groundH: BLVD_G, wall: 0x141414, trim: 0xf0d0d4, sign: 'fs:pandora', signH: 0.6, win: 'jewelry', style: 'glass', noCollider: true, shop: { kind: 'store', catalog: 'pandora-blvd', label: 'Pandora (BLVD)', hint: 'charms, a gold chain' } },
  { id: 'puma', side: 'E', xf: BLVD_X, z0: 293.4, z1: 299.6, d: 0.6, h: BLVD_G + 1.1, groundH: BLVD_G, wall: 0x0a0a0a, trim: 0xffffff, sign: 'fs:puma', signH: 0.8, win: 'sneakers', style: 'glass', noCollider: true, shop: { kind: 'store', catalog: 'puma-blvd', label: 'PUMA (BLVD)', hint: 'Suedes (sprint)' } },
];

// ------------------------------------------------------------------ Hershey's Chocolate World
const HZ = { x0: -38.2, x1: -25, z0: 412.9, z1: 423.4, h: 13.5 };

function hersheys(b: WorldBuilder, k: Kit, pools: Pools): void {
  const s: FrontShop = {
    id: 'hersheys',
    side: 'W',
    xf: -HZ.x1,
    z0: HZ.z0,
    z1: HZ.z1,
    d: HZ.x1 - HZ.x0,
    h: HZ.h,
    groundH: 5,
    wall: 0x3a1c0e,
    trim: 0xc0c0c8,
    sign: '',
    win: 'chocolate',
    style: 'glass',
    label: "HERSHEY'S CHOCOLATE WORLD",
    pool: 0xffc890,
    doorAt: HZ.z0 + 1.4,
  };
  storefront(b, k, A, s, pools);
  const f = frontFrame(s);
  const w = HZ.z1 - HZ.z0;
  const SM = A.signMat(b);
  const silver = MET();
  k.at(f.x, 0, f.z, f.ry, () => {
    // the name across the top and the wrapper screen over the doors
    aq(k, A, SM, 'fs:hersheys', 0, HZ.h - 1.55, 0.2, w - 0.8, (w - 0.8) * (192 / 1024));
    k.box(MET(), 0x1a0c06, 0, HZ.h - 1.55, 0.1, w - 0.5, (w - 0.8) * (192 / 1024) + 0.3, 0.2);
    aq(k, A, SM, 'fs:hz-screen', 0, 7.9, 0.16, 7.2, 3.6);
    k.box(MET(), 0x101010, 0, 7.9, 0.08, 7.5, 3.85, 0.14);
    // silver fins between the upper-floor panes (the real front is ribbed)
    for (let x = -w / 2 + 0.6; x <= w / 2 - 0.6; x += 1.15) if (Math.abs(x) > 3.9) k.box(silver, 0xb8b8c2, x, 8.6, 0.22, 0.12, 6.2, 0.3);
    // brown marquee canopy over the doors at the north end (the escalators hold the south end)
    k.box(M(), 0x2a1408, w / 2 - 2.2, 4.7, 1.0, 3.8, 0.3, 2.0);
    for (let i = 0; i < 9; i++) k.add(new THREE.SphereGeometry(0.06, 6, 4), glowMat(), 0xfff0d0, w / 2 - 3.9 + i * 0.42, 4.53, 1.95);
  });
  // a giant silver Kiss on the roof corner, its paper plume flying
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = t * 3.4;
    const r = 1.75 * Math.pow(1 - t, 1.6) * (1 - 0.15 * Math.sin(t * Math.PI)) + 0.04;
    pts.push(new THREE.Vector2(r, y));
  }
  k.add(new THREE.LatheGeometry(pts, 20), MET(), 0xe0e0ea, HZ.x1 - 2.2, HZ.h, HZ.z1 - 2.2);
  k.add(new THREE.BoxGeometry(0.35, 1.6, 0.02), M(), 0xf4f4ee, HZ.x1 - 1.8, HZ.h + 3.9, HZ.z1 - 2.2, 0.6, 0, -0.5);
  b.shopSpots.push({ kind: 'store', position: new THREE.Vector3(-23.4, 0, HZ.z0 + 1.4), radius: 2.6, label: "HERSHEY'S CHOCOLATE WORLD", catalog: 'hersheys', hint: 'Reese’s, Kisses, a chocolate Statue of Liberty' });
}

// ------------------------------------------------------------------ the Waldorf's landscaped drive mouth (z 254..266)
function waldorfGarden(b: WorldBuilder, k: Kit): void {
  const stone = M();
  // low stone planter walls along the sidewalk and a row of palms, the drive mouth left open
  k.box(stone, 0xcfc4ae, -22.8, 0.35, 260.2, 0.6, 0.7, 11.4);
  k.box(stone, 0x4a3a28, -24.6, 0.66, 260.2, 3, 0.06, 11);
  k.box(stone, 0xcfc4ae, -26.4, 0.35, 260.2, 0.6, 0.7, 11.4);
  for (let i = 0; i < 3; i++) b.add(palmTree(9 + i, false, 260 + i * 7), -24.6, 0.7, 256 + i * 4.2);
  b.collider(-26.7, -22.5, 254.5, 265.9, 0, 0.7, true);
}

export function buildFrontageTropHarmon(b: WorldBuilder): void {
  // three blocks, each flushed to a handful of meshes and shown within ~280 m
  const westPM = new FrontCluster(-24, 300);
  const east = new FrontCluster(24, 300);
  const hz = new FrontCluster(-30, 418);
  for (const s of FRONTS) {
    const c = s.side === 'E' ? east : westPM;
    storefront(b, c.k, A, s, c.pools);
  }
  hersheys(b, hz.k, hz.pools);
  waldorfGarden(b, westPM.k);
  for (const c of [westPM, east, hz]) c.flush(b);
}
