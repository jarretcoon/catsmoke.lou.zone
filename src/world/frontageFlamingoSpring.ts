import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { glowText, ShopAtlas, text } from './frontAtlas';
import { aq, FrontCluster, frontFrame, patioTable, storefront, type FrontShop } from './frontKit';
import { glowMat, vcMat } from './interiorKit';
import './frontageCatalogs';

/*
 * Strip frontage shops, Flamingo Rd → Spring Mountain Rd (build 5, area 3). Order from OpenStreetMap,
 * checked against 2026 listings.
 *  - West, Caesars Palace's south forecourt by the Flamingo Rd corner: Gordon Ramsay Hell's Kitchen
 *    (its own Strip entrance under the flaming pitchfork) and the Mojito Hut bar.
 *  - East, the LINQ hotel's Strip front: Guy Fieri's Vegas Kitchen & Bar with its terrace over the
 *    sidewalk.
 */

const A = new ShopAtlas('frontFlamingoSpring', 2048, 2048);

A.reg('fs:hellskitchen', 1024, 192, (ctx, w, h) => {
  ctx.fillStyle = '#0a0606';
  ctx.fillRect(0, 0, w, h);
  glowText(ctx, "HELL'S KITCHEN", w * 0.56, h * 0.46, 'block', h * 0.56, w * 0.78, '#ff4a1a', '#ff7a2a');
  text(ctx, 'GORDON RAMSAY', w * 0.56, h * 0.85, 'sans', h * 0.15, w * 0.5, '#e8e0d8');
  // the pitchfork in flames
  const px = w * 0.08;
  ctx.fillStyle = '#ff6a1a';
  for (let i = 0; i < 3; i++) {
    const x = px + (i - 1) * 22;
    ctx.beginPath();
    ctx.moveTo(x - 7, h * 0.62);
    ctx.quadraticCurveTo(x - 10, h * 0.25, x, h * 0.08);
    ctx.quadraticCurveTo(x + 10, h * 0.25, x + 7, h * 0.62);
    ctx.fill();
  }
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(px - 30, h * 0.6, 60, 8);
  ctx.fillRect(px - 4, h * 0.6, 8, h * 0.38);
});
A.reg('fs:guyfieri', 1024, 192, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#1a0a06');
  g.addColorStop(1, '#2a0c06');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // flames licking up from the bottom edge
  for (let i = 0; i < 26; i++) {
    const x = (i / 25) * w;
    const fl = ctx.createLinearGradient(0, h, 0, h * 0.35);
    fl.addColorStop(0, '#ff3a0a');
    fl.addColorStop(1, 'rgba(255,200,40,0)');
    ctx.fillStyle = fl;
    ctx.beginPath();
    ctx.moveTo(x - 24, h);
    ctx.quadraticCurveTo(x - 6, h * 0.6, x + (i % 2 ? 6 : -4), h * (0.3 + (i % 3) * 0.08));
    ctx.quadraticCurveTo(x + 8, h * 0.62, x + 24, h);
    ctx.fill();
  }
  glowText(ctx, "GUY FIERI'S", w / 2, h * 0.36, 'block', h * 0.42, w * 0.8, '#ffd23a', '#ff8a1a');
  text(ctx, 'VEGAS KITCHEN & BAR', w / 2, h * 0.74, 'block', h * 0.2, w * 0.6, '#ffffff', '#3a0a00', 4);
});
A.sign('fs:mojito', { text: 'MOJITO HUT', sub: 'CAESARS PALACE', style: 'sans', fg: '#a8ff6a', bg: '#0c1a0c', look: 'neon', border: '#ffffff', w: 512, h: 128 });

const FRONTS: FrontShop[] = [
  // Hell's Kitchen: a dark two-storey box on Caesars' forecourt, the Strip doors under the pitchfork
  { id: 'hellskitchen', side: 'W', xf: 25.2, z0: -46.5, z1: -30.5, d: 10.5, h: 9.5, groundH: 4.6, wall: 0x141012, trim: 0x8a2a14, sign: '', win: 'diner', style: 'glass', topSign: 'fs:hellskitchen', topSignH: 2.6, shop: { kind: 'store', catalog: 'hells-kitchen', label: "Gordon Ramsay Hell's Kitchen", hint: 'beef Wellington, sticky toffee pudding' }, pool: 0xff8a50 },
  // Guy Fieri's on the LINQ hotel's ground floor (a skin on the hotel's front; its terrace overhead)
  { id: 'guyfieri', side: 'E', xf: 21.7, z0: -133.6, z1: -123.4, d: 0.6, h: 5.0, groundH: 4.2, wall: 0x2a1410, trim: 0xffb020, sign: '', win: 'bar', style: 'glass', noCollider: true, shop: { kind: 'store', catalog: 'guy-fieri', label: "Guy Fieri's Vegas Kitchen & Bar", hint: 'trash-can nachos, a big margarita' }, pool: 0xffb060 },
];

/** Guy Fieri's terrace over the sidewalk: a slab on posts, a glass rail, the flaming name on its edge. */
function fieriTerrace(b: WorldBuilder, c: FrontCluster): void {
  const s = FRONTS.find((f) => f.id === 'guyfieri')!;
  const f = frontFrame(s);
  const w = s.z1 - s.z0;
  const k = c.k;
  const MET = vcMat(0.45, 0.5);
  k.at(f.x, 0, f.z, f.ry, () => {
    k.box(MET, 0x2a2a2e, 0, 5.0, 1.6, w, 0.35, 3.2);
    for (const sd of [-1, 1]) k.box(MET, 0x1a1a1c, sd * (w / 2 - 0.3), 2.5, 3.0, 0.25, 5.0, 0.25);
    k.box(MET, 0x9ac8d8, 0, 5.75, 3.15, w, 1.1, 0.06);
    aq(k, A, A.signMat(b), 'fs:guyfieri', 0, 4.4, 3.22, Math.min(w - 0.8, 8.4), Math.min(w - 0.8, 8.4) * (192 / 1024));
    patioTable(k, -2.8, 1.6, 0xd81e2a);
    patioTable(k, 2.8, 1.6, 0xffb020);
    for (let i = 0; i < 12; i++) k.add(new THREE.SphereGeometry(0.07, 6, 4), glowMat(), 0xffe0a0, -w / 2 + 0.5 + i * ((w - 1) / 11), 4.75, 3.1);
  });
  b.collider(Math.min(f.x, f.x + f.out * 3.2), Math.max(f.x, f.x + f.out * 3.2), s.z0, s.z1, 4.8, 5.2, false);
  b.zone("Guy Fieri's terrace (the LINQ)", 19, 22, s.z0, s.z1);
}

/** The Mojito Hut: a little bar under a palm-leaf roof on Caesars' forecourt, stools round it. */
function mojitoHut(b: WorldBuilder, c: FrontCluster): void {
  const x = -30;
  const z = -22;
  const k = c.k;
  const M = vcMat(0.8);
  k.box(M, 0x6a4a2a, x, 0.55, z, 3.2, 1.1, 2.4);
  k.box(M, 0xe8dcc0, x, 1.13, z, 3.5, 0.06, 2.7);
  for (const [dx, dz] of [
    [-1.5, -1.1],
    [1.5, -1.1],
    [-1.5, 1.1],
    [1.5, 1.1],
  ])
    k.cyl(M, 0x5a3a1a, x + dx, 1.7, z + dz, 0.08, 0.1, 3.4, 6);
  k.add(new THREE.ConeGeometry(2.9, 1.3, 8), M, 0xb89a5a, x, 3.9, z);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.cyl(M, 0x2a2a2a, x + Math.cos(a) * 2.2, 0.4, z + Math.sin(a) * 1.8, 0.2, 0.18, 0.08, 8);
    k.cyl(M, 0x8a8a8a, x + Math.cos(a) * 2.2, 0.2, z + Math.sin(a) * 1.8, 0.03, 0.03, 0.4, 5);
  }
  k.at(x + 1.78, 0, z, Math.PI / 2, () => {
    aq(k, A, A.signMat(b), 'fs:mojito', 0, 2.75, 0, 2.6, 0.65);
  });
  b.collider(x - 1.6, x + 1.6, z - 1.2, z + 1.2, 0, 1.1, true);
  c.pools.add(x + 2.4, z, 4, 4, 0xb0ffb0);
  b.shopSpots.push({ kind: 'store', position: new THREE.Vector3(x + 2.5, 0, z), radius: 2.4, label: 'Mojito Hut (Caesars Palace)', catalog: 'mojito-hut', hint: 'mojitos on the forecourt (🍹)' });
  b.zone('Mojito Hut (Caesars Palace)', x - 2.5, x + 3, z - 2.5, z + 2.5);
}

export function buildFrontageFlamingoSpring(b: WorldBuilder): void {
  const caesars = new FrontCluster(-28, -32);
  const linq = new FrontCluster(22, -128);
  for (const s of FRONTS) {
    const c = s.side === 'W' ? caesars : linq;
    storefront(b, c.k, A, s, c.pools);
  }
  fieriTerrace(b, linq);
  mojitoHut(b, caesars);
  for (const c of [caesars, linq]) c.flush(b);
}
