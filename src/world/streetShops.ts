import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { BX, CY, K, lampGlow, part, signs } from './backOfHouse';
import { mat } from './props';
import { InteriorKind, interiorCell, interiorMaterial, interiorPaneGeometry, lightPoolMaterial, litterGeometry, litterMaterial, PANE, POSTER_COUNT, posterGeometry, registerStreetTick, signGeometry } from './streetTextures';
import { rng } from './textures';

/**
 * Street-front retail along Las Vegas Blvd: rows of small shops with lit display windows that show a
 * room behind the glass (interior-mapped panes), fascia signs, awnings, blade signs, posters on the
 * pilasters, rooftop units, warm light spilling onto the sidewalk at night and gum/flyer litter.
 * Coordinates sit in frontage gaps between the resorts (checked against the colliders):
 * - East z −187…−166: Pharmacy & Liquor + souvenirs (the real Walgreens/Casino Royale gap).
 * - East z 306…344: shops between BLVD and Showcase (pharmacy, daiquiri bar, souvenirs, coffee).
 * - West z 254…292: "Diamond Row" between Crystals and the Whataburger (jewelry, kicks, candy, gallery).
 * - West z 316…344: food court, souvenirs, smoke shop (by Park MGM).
 * - West z 716…794: the south-Strip strip mall (chapel, souvenirs, slots, daiquiris, coffee, smoke shop).
 * - East z −733…−707: the giant gift shop at the north end.
 * - LINQ Promenade: interior windows on the existing promenade shops.
 */

interface ShopDef {
  kind: InteriorKind;
  sign: string;
  width: number;
  awning: number;
  variant?: number;
  spot?: 'abc' | 'bar' | 'boutique';
  label?: string;
}

const AWNINGS = {
  red: 0xb8282a,
  green: 0x1f6a46,
  navy: 0x1d2d5a,
  pink: 0xd8408a,
  gold: 0xc8962a,
  black: 0x1a1a1e,
  teal: 0x168a8a,
  cream: 0xe8dcc0,
};

let tickReady = false;

/** A row of shops along the Strip. side +1 = east frontage (faces −x), −1 = west frontage (faces +x). */
function shopRow(b: WorldBuilder, side: 1 | -1, z0: number, shops: ShopDef[], opts: { depth?: number; height?: number; wall?: number; seed?: number; zoneName?: string } = {}): number {
  const R = rng(opts.seed ?? Math.floor(z0 * 13));
  const depth = opts.depth ?? 8;
  const H = opts.height ?? 7.2;
  const fx = side * 19.7; // facade plane
  const out = -side; // outward normal (toward the Boulevard) along x
  const rot = side > 0 ? -Math.PI / 2 : Math.PI / 2; // +z of a part → outward
  const wall = mat(opts.wall ?? 0xd9cdb8, 0.85);
  const fascia = mat(0x2a2a30, 0.6);
  const glass = interiorMaterial();
  const sm = signs(b);
  const glow = lampGlow(b);
  const pool = lightPoolMaterial();
  let z = z0;
  const total = shops.reduce((a, s) => a + s.width, 0) + (shops.length + 1) * 0.6;
  // main massing (collider) behind the facade
  b.box(fx + side * (depth / 2), 0, z0 + total / 2, depth, H, total, wall, true);
  // parapet + cornice + rooftop units
  b.add(new THREE.Mesh(BX(0.5, 0.6, total), fascia), fx + side * 0.25, H + 0.3, z0 + total / 2);
  for (let k = 0; k < Math.max(1, Math.floor(total / 12)); k++) {
    const u = new THREE.Group();
    part(u, BX(2.2, 1.3, 1.6), K.galv, 0, 0.65, 0);
    part(u, CY(0.5, 0.5, 0.2, 10), K.darkSteel, 0, 1.4, 0);
    u.position.set(fx + side * (depth * 0.6), H, z0 + 5 + k * 12 + R() * 3);
    b.add(u);
  }
  const group = new THREE.Group();
  z += 0.6;
  // pilaster at the start
  const pil = (zz: number) => {
    part(group, BX(0.6, H, 0.6), wall, fx + out * 0.3, H / 2, zz);
    // poster on the pilaster (every other one)
    if (R() < 0.6) {
      const p = part(group, posterGeometry(Math.floor(R() * POSTER_COUNT), 0.5, 0.72), sm, fx + out * 0.61, 1.6, zz, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      p.userData.clutter = true;
    }
  };
  pil(z - 0.3);
  for (const s of shops) {
    const zc = z + s.width / 2;
    const nPanes = Math.max(1, Math.floor((s.width - 0.2) / (PANE.w + 0.12)));
    const span = nPanes * (PANE.w + 0.12);
    const doorAt = Math.floor(nPanes / 2);
    for (let i = 0; i < nPanes; i++) {
      const pz = zc - span / 2 + (PANE.w + 0.12) * (i + 0.5);
      const cell = interiorCell(s.kind, (s.variant ?? 0) + (i % 2));
      const pane = new THREE.Mesh(interiorPaneGeometry(cell), glass);
      pane.position.set(fx + out * 0.02, 0.5 + PANE.h / 2, pz);
      pane.rotation.y = rot;
      group.add(pane);
      // mullion
      part(group, BX(0.12, PANE.h + 0.1, 0.12), K.darkSteel, fx + out * 0.06, 0.5 + PANE.h / 2, pz - PANE.w / 2 - 0.06);
      if (i === doorAt) {
        // door: frame, push bar, threshold
        part(group, BX(0.1, 2.3, 0.08), K.darkSteel, fx + out * 0.08, 1.65, pz - 0.6);
        part(group, BX(0.1, 2.3, 0.08), K.darkSteel, fx + out * 0.08, 1.65, pz + 0.6);
        part(group, BX(0.1, 0.08, 1.2), K.darkSteel, fx + out * 0.08, 2.82, pz);
        part(group, BX(0.06, 0.05, 0.8), K.galv, fx + out * 0.12, 1.2, pz);
        part(group, BX(0.9, 0.03, 1.4), K.darkSteel, fx + out * 0.45, 0.015, pz);
      }
    }
    part(group, BX(0.12, PANE.h + 0.1, 0.12), K.darkSteel, fx + out * 0.06, 0.5 + PANE.h / 2, zc + span / 2 + 0.06);
    // bulkhead under the glass + head band
    part(group, BX(0.3, 0.5, s.width), mat(s.awning, 0.6), fx + out * 0.15, 0.25, zc);
    part(group, BX(0.36, 0.14, s.width), K.darkSteel, fx + out * 0.18, 0.5 + PANE.h + 0.07, zc);
    // fascia + sign
    part(group, BX(0.4, 1.3, s.width), fascia, fx + out * 0.2, 0.5 + PANE.h + 0.79, zc);
    const sg = part(group, signGeometry(s.sign, Math.min(s.width * 0.9, 9), Math.min(s.width * 0.9, 9) * 0.117, 0.08), sm, fx + out * 0.45, 0.5 + PANE.h + 0.79, zc, rot);
    sg.userData.clutter = false;
    // awning: sloped canvas + valance + arms
    const aw = mat(s.awning, 0.85, 0, { side: THREE.DoubleSide });
    const awn = part(group, BX(1.9, 0.06, s.width - 0.2), aw, fx + out * 0.95, 0.5 + PANE.h + 0.05, zc, 0, 0, side * 0.32);
    awn.castShadow = true;
    part(group, BX(0.04, 0.32, s.width - 0.2), aw, fx + out * 1.88, 0.5 + PANE.h - 0.42, zc);
    // blade sign at the shop edge, perpendicular to the facade
    const blade = new THREE.Group();
    part(blade, BX(0.9, 0.06, 0.06), K.darkSteel, out * 0.45, 0, 0);
    part(blade, signGeometry(s.sign, 1.7, 0.2, 0.05), sm, out * 1.0, -0.2, 0, 0);
    blade.position.set(fx, 5.6, z + 0.5);
    group.add(blade);
    // wall-pack light over the door, light pool + litter on the sidewalk
    part(group, BX(0.3, 0.2, 0.5), glow, fx + out * 0.25, 5.0, zc);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pool);
    p.rotation.x = -Math.PI / 2;
    p.scale.set(4.6, s.width * 1.1, 1);
    p.position.set(fx + out * 2.0, 0.07, zc);
    p.renderOrder = 1;
    p.userData.clutter = true;
    b.add(p);
    for (let k = 0; k < 2; k++) {
      const d = new THREE.Mesh(litterGeometry(k === 0 ? 0 : [1, 3, 4][Math.floor(R() * 3)], 1.6), litterMaterial());
      d.position.set(fx + out * (1.5 + R() * 4), 0.066, zc + (R() - 0.5) * s.width);
      d.rotation.y = R() * 3;
      d.userData.clutter = true;
      b.add(d);
    }
    if (s.spot) b.shopSpots.push({ kind: s.spot, position: new THREE.Vector3(fx + out * 1.2, 0, zc), radius: 2.4, label: s.label ?? s.sign });
    z += s.width + 0.6;
    pil(z - 0.3);
  }
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.clutter === undefined) o.userData.clutter = true;
  });
  b.add(group);
  b.building(fx + side * (depth / 2), z0 + total / 2, depth, total, '#d9cdb8', opts.zoneName);
  if (opts.zoneName) b.zone(opts.zoneName, side > 0 ? 19 : fx - depth, side > 0 ? fx + depth : -19, z0, z0 + total);
  return z0 + total;
}

/** Freestanding wedding-chapel kiosk: white gazebo booth with a heart sign and a flower arch. */
function chapelKiosk(b: WorldBuilder, x: number, z: number, rotY: number): void {
  const g = new THREE.Group();
  const white = mat(0xf6f2ec, 0.6);
  const pink = mat(0xf07aa6, 0.7);
  part(g, BX(2.6, 1.1, 1.4), white, 0, 0.55, 0);
  part(g, BX(2.8, 0.08, 1.6), mat(0xd8c08a, 0.4, 0.6), 0, 1.14, 0);
  for (const sx of [-1.25, 1.25]) part(g, CY(0.06, 0.06, 2.4, 8), white, sx, 1.2, -0.6);
  part(g, BX(3.0, 0.3, 1.8), pink, 0, 2.45, 0);
  part(g, new THREE.ConeGeometry(1.8, 0.8, 4), white, 0, 3.0, 0, Math.PI / 4);
  part(g, signGeometry('chapel', 2.6, 0.3, 0.05), signs(b), 0, 2.45, 0.92);
  // flower arch in front (half torus) for photos
  const arch = part(g, new THREE.TorusGeometry(1.1, 0.12, 6, 14, Math.PI), pink, 0, 0, 2.2);
  arch.rotation.set(0, 0, 0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 11) * Math.PI;
    part(g, new THREE.IcosahedronGeometry(0.16, 0), i % 2 ? white : pink, Math.cos(a) * 1.1, Math.sin(a) * 1.1, 2.2);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.userData.clutter = true;
  });
  b.add(g);
  b.collider(x - 1.5, x + 1.5, z - 1.5, z + 1.5, 0, 1.1, true);
}

/** Interior-mapped glass over the existing LINQ Promenade shopfronts (eastSide.ts builds the boxes). */
function linqPromenadeWindows(b: WorldBuilder): void {
  const glass = interiorMaterial();
  const south: Array<[number, InteriorKind]> = [
    [72, 'daiquiri'],
    [92, 'shirts'],
    [104, 'gallery'],
    [116, 'foodcourt'],
    [128, 'candy'],
  ];
  const north: Array<[number, InteriorKind]> = [
    [64, 'liquor'],
    [76, 'foodcourt'],
    [88, 'slots'],
    [124, 'racks'],
  ];
  const add = (x: number, z: number, kind: InteriorKind, rot: number) => {
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Mesh(interiorPaneGeometry(interiorCell(kind, i)), glass);
      p.position.set(x - 1.25 + i * 2.5, 0.2 + PANE.h / 2, z);
      p.rotation.y = rot;
      p.userData.clutter = true;
      b.add(p);
    }
  };
  for (const [x, k] of south) add(x, -97.07, k, Math.PI);
  for (const [x, k] of north) add(x, -110.93, k, 0);
  b.add(new THREE.Mesh(signGeometry('linq', 9, 1.05, 0.12), signs(b)), 21.5, 7.6, -104, -Math.PI / 2);
}

export function buildStreetShops(b: WorldBuilder): void {
  if (!tickReady) {
    registerStreetTick(b);
    tickReady = true;
  }
  // East: the Walgreens / Casino Royale gap
  shopRow(b, 1, -187.5, [
    { kind: 'pharmacy', sign: 'pharmacy', width: 11, awning: AWNINGS.red, spot: 'abc', label: 'Pharmacy & Liquor' },
    { kind: 'shirts', sign: 'souvenirs', width: 8.6, awning: AWNINGS.navy, spot: 'boutique' },
  ], { wall: 0xe2d8c6, height: 8, seed: 11, zoneName: 'Strip Shops (Casino Royale)' });

  // East: between BLVD and the Showcase Mall
  shopRow(b, 1, 306.5, [
    { kind: 'pharmacy', sign: 'pharmacy', width: 11, awning: AWNINGS.red, variant: 1, spot: 'abc', label: 'Pharmacy & Liquor (Showcase)' },
    { kind: 'daiquiri', sign: 'daiquiri', width: 8.6, awning: AWNINGS.pink, spot: 'bar', label: 'Frozen Daiquiri Bar' },
    { kind: 'trinkets', sign: 'souvenirs', width: 8.6, awning: AWNINGS.navy, spot: 'boutique' },
    { kind: 'coffee', sign: 'coffee', width: 6, awning: AWNINGS.green },
  ], { wall: 0xcdbfa6, height: 7.5, seed: 12, zoneName: 'Strip Shops at Showcase' });

  // West: Diamond Row between Crystals and the Whataburger
  shopRow(b, -1, 254, [
    { kind: 'jewelry', sign: 'jewelry', width: 8.6, awning: AWNINGS.black },
    { kind: 'sneakers', sign: 'sneakers', width: 8.6, awning: AWNINGS.black },
    { kind: 'candy', sign: 'candy', width: 8.6, awning: AWNINGS.pink },
    { kind: 'gallery', sign: 'gallery', width: 8.6, awning: AWNINGS.cream },
  ], { wall: 0xb8b2aa, height: 8.5, seed: 13, zoneName: 'Diamond Row Shops' });

  // West: by Park MGM
  shopRow(b, -1, 316, [
    { kind: 'foodcourt', sign: 'foodcourt', width: 11, awning: AWNINGS.gold },
    { kind: 'shirts', sign: 'souvenirs', width: 8.6, awning: AWNINGS.navy, variant: 1, spot: 'boutique' },
    { kind: 'smoke', sign: 'smoke', width: 6, awning: AWNINGS.black, spot: 'abc', label: 'Smoke Shop' },
  ], { wall: 0xd6c6aa, height: 7, seed: 14, zoneName: 'Park MGM Street Shops' });

  // West: the south-Strip strip mall (old-Vegas souvenir row)
  const end = shopRow(b, -1, 716, [
    { kind: 'chapel', sign: 'chapel', width: 8.6, awning: AWNINGS.pink },
    { kind: 'trinkets', sign: 'souvenirs', width: 11, awning: AWNINGS.teal, variant: 1, spot: 'boutique' },
    { kind: 'slots', sign: 'slots', width: 11, awning: AWNINGS.red },
    { kind: 'daiquiri', sign: 'daiquiri', width: 8.6, awning: AWNINGS.pink, variant: 1, spot: 'bar', label: 'Frozen Daiquiri Bar' },
    { kind: 'coffee', sign: 'coffee', width: 6, awning: AWNINGS.green, variant: 1 },
    { kind: 'smoke', sign: 'smoke', width: 8.6, awning: AWNINGS.black, variant: 1, spot: 'abc', label: 'South Strip Smoke Shop' },
  ], { wall: 0xe8d8b8, height: 6.5, seed: 15, zoneName: 'South Strip Souvenir Row' });
  void end;
  chapelKiosk(b, -15.5, 720, Math.PI / 2);

  // East: the giant gift shop at the north end
  shopRow(b, 1, -733, [
    { kind: 'shirts', sign: 'souvenirs', width: 13.6, awning: AWNINGS.gold, spot: 'boutique', label: 'Giant Gift Shop' },
    { kind: 'trinkets', sign: 'souvenirs', width: 8.6, awning: AWNINGS.gold, variant: 1 },
  ], { wall: 0xf0e2c0, height: 9, seed: 16, zoneName: 'Giant Gift Shop' });

  linqPromenadeWindows(b);
}
