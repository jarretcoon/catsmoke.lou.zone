import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from './builder';
import { mat } from './props';
import { LedBoard } from './textures';
import type { LedShow } from './textures';
import { animate, driveLed, fitFont, ledFaces, letterFace, letters, part, placed, rotatedCollider } from './signKit';
import { canvasTex } from './themedKit';

/**
 * Treasure Island's Strip front as it stands today (the 2003 rebrand, now "TI – Handwritten Collection"):
 *  - the TI sign by the Spring Mountain corner: a stone base, two LED video boards side by side, a
 *    FREE PARKING strip, a black band with TREASURE ISLAND in white capitals, and on top a billowing
 *    yellow-gold sail carrying a huge rounded italic lowercase "ti" outlined in colour-changing LED,
 *    with red, blue and green ribbon streamers flying off the yard;
 *  - gold serif TREASURE and ISLAND letters at the tops of the terracotta tower's wings;
 *  - lanterns and rigging lights on the two ships in Sirens' Cove (the show ended in 2013, the ships stay).
 */

const TI_SHOWS: LedShow[] = [
  { name: 'MYSTÈRE', sub: 'CIRQUE DU SOLEIL • NIGHTLY', color: '#1a5a8a', art: 'cirque' },
  { name: "GILLEY'S", sub: 'SALOON • DANCE HALL • BBQ', color: '#8a3a1a', art: 'band' },
];

/** The sail's cloth: gold with the big "ti" (day map), and the LED outline of the letters alone (glow map). */
function sailTextures(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const W = 512;
  const H = 400;
  const font = (px: number) => `italic 900 ${px}px "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", Arial, sans-serif`;
  const word = (ctx: CanvasRenderingContext2D) => {
    ctx.font = font(330);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
  };
  const map = canvasTex(W, H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#ffd84a');
    g.addColorStop(0.45, '#f2bf25');
    g.addColorStop(1, '#d99a12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // cloth seams and the shading of the billow
    for (let x = 0; x < W; x += 40) {
      ctx.fillStyle = 'rgba(150,90,0,0.12)';
      ctx.fillRect(x, 0, 2, H);
    }
    const sh = ctx.createLinearGradient(0, 0, W, 0);
    sh.addColorStop(0, 'rgba(120,70,0,0.28)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    sh.addColorStop(1, 'rgba(120,70,0,0.3)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, W, H);
    // bolt rope round the edge
    ctx.strokeStyle = '#8a5a10';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    // the letters: deep navy with a white face and a red i-dot
    word(ctx);
    ctx.fillStyle = 'rgba(20,24,60,0.85)';
    ctx.fillText('ti', W / 2 + 10, H * 0.86 + 8);
    ctx.fillStyle = '#fffaf0';
    ctx.fillText('ti', W / 2, H * 0.86);
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#2a3a8a';
    ctx.strokeText('ti', W / 2, H * 0.86);
  });
  const glow = canvasTex(W, H, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    word(ctx);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 16;
    ctx.strokeText('ti', W / 2, H * 0.86);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 4;
    ctx.strokeText('ti', W / 2, H * 0.86);
  });
  return { map, glow };
}

/** A billowing sail: a w×h sheet bellied toward +z (front) by `belly` metres, bottom edge at y = 0. */
function sailGeometry(w: number, h: number, belly: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 18, 8);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / w + 0.5;
    const v = p.getY(i) / h + 0.5;
    const z = belly * Math.sin(Math.PI * u) * (0.55 + 0.45 * Math.sin(Math.PI * v));
    // the foot of the sail sweeps a little wider than the head, like a square sail full of wind
    p.setXYZ(i, p.getX(i) * (1.06 - 0.1 * v), p.getY(i) + h / 2, z);
  }
  g.computeVertexNormals();
  return g;
}

/** The TI sign (faces ±z, Boulevard traffic) at (x, z). */
export function buildTiSign(b: WorldBuilder, x = -23.6, z = -399.5): void {
  const g = new THREE.Group();
  const rock = mat(0x8a6e52, 0.9);
  const steel = mat(0x2c2a2e, 0.45, 0.6);
  const black = mat(0x0c0c10, 0.4, 0.2);
  const wood = mat(0x5a3a22, 0.8);
  // rock-faced base (Sirens' Cove's rockwork) and two steel legs
  g.add(part(new THREE.BoxGeometry(9.6, 1.3, 2.8), rock, 0, 0.65, 0));
  g.add(part(new THREE.BoxGeometry(8.4, 0.5, 2.2), rock, 0.3, 1.55, 0.1));
  for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.9, 2.2, 0.9), steel, s * 3.3, 2.4, 0));
  // two LED video boards side by side
  const led = new LedBoard('TI', ['TREASURE ISLAND', 'HANDWRITTEN COLLECTION', "SIRENS' COVE", 'FREE SELF PARKING'], ['#1a4a7a', '#8a1a1a', '#c9a04a', '#2a5a3a'], 256, 192).withShows(TI_SHOWS);
  const bw = 4.0;
  const bh = 2.7;
  const by = 3.5 + bh / 2;
  g.add(part(new THREE.BoxGeometry(bw * 2 + 0.9, bh + 0.5, 1.1), black, 0, by, 0));
  for (const s of [-1, 1]) g.add(placed(ledFaces(led, bw, bh, 1.1), s * (bw / 2 + 0.15), by, 0));
  // FREE PARKING strip and the black TREASURE ISLAND band
  const strip = letterFace(b, 7.4, 0.5, (ctx, w, h) => {
    ctx.fillStyle = '#b0141c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, 'FREE PARKING', 'sans', w * 0.8, h * 0.7, 0.3);
    ctx.fillText('FREE PARKING', w / 2, h * 0.54);
    ctx.letterSpacing = '0px';
  }, 0.8);
  g.add(part(new THREE.BoxGeometry(7.5, 0.56, 0.8), black, 0, 5.4, 0));
  g.add(placed(strip, 0, 5.4, 0));
  const bandY = 6.55;
  g.add(part(new THREE.BoxGeometry(9.2, 1.5, 1.2), black, 0, bandY, 0));
  g.add(placed(letters(b, 'TREASURE ISLAND', 8.8, 1.2, { style: 'sans', fill: '#ffffff', spacing: 0.12, bg: '#0c0c10' }, 1.2), 0, bandY, 0));
  // the yard (spar) the sail hangs from, a short mast and a pennant
  const sailY = 7.5;
  const sailW = 8.4;
  const sailH = 6.4;
  g.add(part(new THREE.CylinderGeometry(0.16, 0.16, sailW + 1.4, 10), wood, 0, sailY + sailH + 0.15, 0, 0, 0, Math.PI / 2));
  g.add(part(new THREE.CylinderGeometry(0.14, 0.2, 2.4, 8), wood, 0, sailY + sailH + 1.2, -0.1));
  g.add(part(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8), wood, 0, sailY - 0.1, 0, 0, 0, Math.PI / 2));
  // sail: the cloth (both faces), lit by floods at night, and the colour-changing LED "ti" outline
  const tx = sailTextures();
  const cloth = b.nightGlow(new THREE.MeshStandardMaterial({ map: tx.map, emissiveMap: tx.map, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.8, side: THREE.FrontSide }), 0, 0.42);
  const front = sailGeometry(sailW, sailH, 0.9);
  const back = front.clone().rotateY(Math.PI);
  g.add(part(mergeGeometries([front, back], false)!, cloth, 0, sailY, 0));
  const outline = new THREE.MeshBasicMaterial({ map: tx.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x3a6aff });
  const of = sailGeometry(sailW, sailH, 0.92);
  const ob = of.clone().rotateY(Math.PI);
  const oMesh = part(mergeGeometries([of, ob], false)!, outline, 0, sailY, 0);
  oMesh.renderOrder = 2;
  g.add(oMesh);
  // red, blue and green ribbon streamers off the yard's ends, rippling
  const ribbons: Array<[number, number]> = [
    [0xd2232a, -1],
    [0x2456c8, 1],
    [0x2a9a4a, 1],
  ];
  ribbons.forEach(([c, side], k) => {
    const rm = mat(c, 0.7, 0, { side: THREE.DoubleSide });
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const seg = new THREE.PlaneGeometry(0.8, 0.42);
      seg.rotateZ(-side * (0.25 + i * 0.04));
      seg.translate(side * (sailW / 2 + 0.6 + i * 0.55), sailY + sailH + 0.1 - i * 0.28 - k * 0.35 + Math.sin(i * 1.7 + k) * 0.12, 0.1 * Math.sin(i + k));
      parts.push(seg);
    }
    g.add(part(mergeGeometries(parts, false)!, rm, 0, 0, 0));
  });
  b.add(g, x, 0, z, 0);
  rotatedCollider(b, x, z, 0, 0, 0, 9.6, 2.8, 0, sailY + sailH + 2.4, true);
  driveLed(b, led, x, by, z);
  // the LED outline runs blue → violet → green after dark and reads as a pale glint by day
  const day = new THREE.Color(0x404858);
  const hue = new THREE.Color();
  animate(b, (t, n) => {
    hue.setHSL(0.6 + 0.22 * Math.sin(t * 0.35), 0.95, 0.55);
    outline.color.copy(day).lerp(hue.multiplyScalar(1.25), n);
    outline.visible = true;
  });
}

/**
 * Gold serif TREASURE and ISLAND letters near the top of two wings of the Y tower (centre cx, cz; wing
 * axes at π/6, 5π/6, 3π/2, each wing w long and d deep, set `off` from the centre; letters at y).
 */
export function tiTowerLetters(b: WorldBuilder, cx = -104, cz = -364, off = 13, d = 11, y = 24.6): void {
  const word = (text: string, a: number, faceSign: 1 | -1, w: number) => {
    const wx = cx + Math.cos(a) * off;
    const wz = cz + Math.sin(a) * off;
    // the wing's local +z (its long face) after rotation.y = −a
    const nx = Math.sin(-a) * faceSign;
    const nz = Math.cos(-a) * faceSign;
    const o = letters(b, text, w, 2.5, { style: 'serif', fill: 'gold', edge: '#3a2608', spacing: 0.1 });
    b.add(o, wx + nx * (d / 2 + 0.32), y, wz + nz * (d / 2 + 0.32), Math.atan2(nx, nz));
  };
  word('TREASURE', Math.PI / 6, -1, 17);
  word('ISLAND', (3 * Math.PI) / 2, 1, 13);
}

/** Lanterns and rigging lights on the Sirens' Cove ships (warm glass by day, lit at night). */
export function tiShipLights(b: WorldBuilder, ships: Array<{ x: number; z: number; facing: number }>): void {
  const lamp = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffc070, emissiveIntensity: 0.05, roughness: 0.4 }), 0.05, 2.2);
  const geos: THREE.BufferGeometry[] = [];
  for (const s of ships) {
    const c = Math.cos(s.facing);
    const sn = Math.sin(s.facing);
    const at = (lx: number, y: number, lz: number, g: THREE.BufferGeometry) => {
      g.translate(s.x + lx * c + lz * sn, y, s.z - lx * sn + lz * c);
      geos.push(g);
    };
    // stern lanterns, a bow lantern, deck lamps along both rails
    for (const lx of [-1.6, 1.6]) at(lx, 5.2, -7.9, new THREE.BoxGeometry(0.4, 0.55, 0.4));
    at(0, 3.6, 12.4, new THREE.BoxGeometry(0.35, 0.5, 0.35));
    for (let lz = -5; lz <= 8; lz += 2.6) for (const lx of [-2.55, 2.55]) at(lx, 3.25, lz, new THREE.SphereGeometry(0.13, 6, 4));
    // rigging lights: a string of bulbs from the bow up to the tallest mast top and down to the stern
    for (let i = 0; i <= 14; i++) {
      const k = i / 14;
      const up = k < 0.5 ? k * 2 : (1 - k) * 2;
      at(0, 3.4 + up * 17.5, 12 - k * 20, new THREE.SphereGeometry(0.11, 6, 4));
    }
  }
  const m = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false)!, lamp);
  b.add(m);
}

/**
 * Sirens' Cove dressing: a Caribbean village front (pastel stucco houses with balconies, shutters and
 * tile eaves, windows lit at night) on the casino wall behind the ships at x (facing +x, z0…z1, h tall),
 * and rockwork boulders round the lagoon's edges (x0…x1, zA…zB).
 */
export function tiCove(b: WorldBuilder, wallX: number, z0: number, z1: number, h: number, lagoon: { x0: number; x1: number; zA: number; zB: number }): void {
  const W = 1024;
  const H = 256;
  const houses = ['#e98a6a', '#f2cf6a', '#6cbcb4', '#e0a35a', '#d9746a', '#8fc2d9', '#efe0b8', '#c98aa8'];
  const paint = (lit: boolean) => (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = lit ? '#000' : '#b98a62';
    ctx.fillRect(0, 0, W, H);
    let x = 0;
    let k = 0;
    while (x < W) {
      const w = 96 + ((k * 37) % 5) * 14;
      const top = 30 + ((k * 53) % 4) * 16;
      if (!lit) {
        ctx.fillStyle = houses[k % houses.length];
        ctx.fillRect(x, top, w, H - top);
        // tile eave and a white cornice
        ctx.fillStyle = '#9a4a32';
        ctx.fillRect(x - 3, top - 10, w + 6, 12);
        ctx.fillStyle = '#f6efe2';
        ctx.fillRect(x, top + 2, w, 4);
        // weathering
        ctx.fillStyle = 'rgba(80,50,30,0.12)';
        ctx.fillRect(x, H - 40, w, 40);
      }
      // two storeys of windows with shutters, a wooden balcony on the upper floor, a door below
      for (const [wy, wh] of [
        [top + 24, 46],
        [H - 92, 50],
      ]) {
        for (let i = 0; i < 2; i++) {
          const wx = x + 16 + i * (w / 2);
          const ww = w / 2 - 32;
          if (lit) {
            if ((k + i + wy) % 3 !== 0) {
              ctx.fillStyle = 'rgba(255,200,130,0.95)';
              ctx.fillRect(wx, wy, ww, wh);
            }
            continue;
          }
          ctx.fillStyle = '#3a2a22';
          ctx.fillRect(wx, wy, ww, wh);
          ctx.fillStyle = k % 2 ? '#2f6f5a' : '#3a5a8a';
          ctx.fillRect(wx - 9, wy, 8, wh);
          ctx.fillRect(wx + ww + 1, wy, 8, wh);
        }
      }
      if (!lit) {
        ctx.fillStyle = '#6a4a2a';
        ctx.fillRect(x + 8, top + 72, w - 16, 6);
        for (let bx = x + 10; bx < x + w - 10; bx += 8) ctx.fillRect(bx, top + 56, 3, 18);
        ctx.fillStyle = '#4a2a1a';
        ctx.fillRect(x + w / 2 - 12, H - 40, 24, 40);
      }
      x += w;
      k++;
    }
  };
  const map = canvasTex(W, H, paint(false));
  const em = canvasTex(W, H, paint(true));
  const m = b.nightGlow(new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.02, roughness: 0.85 }), 0.02, 0.8);
  const len = z1 - z0;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(len, h), m);
  plane.rotation.y = Math.PI / 2;
  b.add(plane, wallX + 0.03, h / 2, (z0 + z1) / 2);
  // rockwork round the lagoon
  const rock = mat(0x8a7058, 0.95);
  const rocks: THREE.BufferGeometry[] = [];
  let s = 5;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const boulder = (x: number, z: number, size: number) => {
    const g = new THREE.IcosahedronGeometry(size, 0);
    g.scale(1 + r() * 0.5, 0.6 + r() * 0.5, 1 + r() * 0.5);
    g.rotateY(r() * 6);
    g.translate(x, size * 0.35, z);
    rocks.push(g);
  };
  for (let x = lagoon.x0 + 1; x < lagoon.x1 - 1; x += 2.2) {
    // leave room for the ships' bows (one near each end of the lagoon)
    if (Math.abs(x - -46) > 4) boulder(x, lagoon.zA + 0.6, 0.9 + r() * 0.8);
    if (Math.abs(x + 1.1 - -42) > 4) boulder(x + 1.1, lagoon.zB - 0.6, 0.9 + r() * 0.8);
  }
  for (let z = lagoon.zA + 1; z < lagoon.zB - 1; z += 2.4) {
    if (Math.abs(z - -363) < 2.5) continue; // the plank bridge to the casino doors
    boulder(lagoon.x0 + 0.6, z, 1.0 + r() * 1.0);
  }
  // a taller rock outcrop with palms at the south-west corner
  for (let i = 0; i < 6; i++) boulder(lagoon.x0 + 3 + r() * 4, lagoon.zB - 4 - r() * 4, 1.6 + r() * 1.4);
  const rm = new THREE.Mesh(mergeGeometries(rocks, false)!, rock);
  rm.castShadow = true;
  rm.receiveShadow = true;
  b.add(rm);
}
