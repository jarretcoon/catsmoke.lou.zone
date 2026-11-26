import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { mat, mesh } from './props';
import { canvasTex } from './themedKit';
import { LedBoard } from './textures';
import type { LedShow } from './textures';
import { driveLed, fitFont, goldGradient, letterFace, letters, neonPanel, placed } from './signKit';

/*
 * Smaller real-world landmarks on the middle east side, after street photos and news (2023-2026):
 *  - Horseshoe: the 55 m (real) three-sided LED tower on the Flamingo Rd corner (live since March 2023)
 *    and the Swarovski Starburst over the Grand Bazaar (a ball of crystals on rods on a perch, a hex LED
 *    canopy under it; shows at 9 pm and midnight).
 *  - The Vanderpump (the Cromwell until 2026): two LED screens wrapping the intersection corner, the gold
 *    crest over the name, black Parisian awnings with gold trim; on the roof, Soleia Beach's red loungers
 *    replaced Drai's in November 2025.
 *  - The LINQ: the slim cyan LINQ pylon at the promenade mouth, the hexagon-tiled corner box with
 *    THE LINQ in thin white letters (lit magenta at night) and the purple light fins.
 */

const HORSESHOE_SHOWS: LedShow[] = [
  { name: 'WSOP', sub: 'WORLD SERIES OF POKER • HORSESHOE', color: '#7a0a10', art: 'magic' },
  { name: 'OLE RED', sub: 'LIVE COUNTRY • ROOFTOP BAR', color: '#8a1a1a', art: 'band' },
  { name: 'JUBILEE!', sub: 'HORSESHOE • LAS VEGAS', color: '#5a1a6a', art: 'singer' },
];

/** The Horseshoe corner tower: three LED faces round a core, a red crown with the gold horseshoe and name. */
export function horseshoeLedTower(b: WorldBuilder, x: number, z: number): void {
  const led = new LedBoard('HORSESHOE', ['LAS VEGAS', 'WORLD SERIES OF POKER', 'GRAND BAZAAR SHOPS', 'CAESARS REWARDS'], ['#7a0a10', '#c9a04a', '#1a1a1a', '#3a0306'], 256, 512).withShows(HORSESHOE_SHOWS);
  const ledMat = new THREE.MeshBasicMaterial({ map: led.tex });
  const fw = 4.6;
  const fh = 13;
  const y0 = 3.2;
  const apo = fw / (2 * Math.sqrt(3));
  const frame = mat(0x2a0a0c, 0.5, 0.4);
  const gold = mat(0xd4a84a, 0.3, 0.85);
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + Math.PI / 3 + (k * Math.PI * 2) / 3; // faces point SW, N-ish and E: one reads up the Strip, one down, one along Flamingo Rd
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const f = mesh(new THREE.PlaneGeometry(fw, fh), ledMat, x + nx * (apo + 0.06), y0 + fh / 2, z + nz * (apo + 0.06));
    f.rotation.y = a;
    b.add(f);
  }
  const core = mesh(new THREE.CylinderGeometry(apo * 2, apo * 2, fh + 0.4, 3), frame, x, y0 + fh / 2, z, true);
  core.rotation.y = Math.PI / 3 + Math.PI / 2;
  b.add(core);
  driveLed(b, led, x, y0 + fh / 2, z);
  // base and legs
  b.add(mesh(new THREE.CylinderGeometry(apo * 2 + 0.15, apo * 2 + 0.25, y0, 3), frame, x, y0 / 2, z, true)).rotation.y = Math.PI / 3 + Math.PI / 2;
  b.collider(x - apo * 2, x + apo * 2, z - apo * 2, z + apo * 2, 0, y0 + fh, true);
  // crown: a red drum, the gold horseshoe and HORSESHOE round it
  const cy = y0 + fh + 1.6;
  b.add(mesh(new THREE.CylinderGeometry(apo * 2 + 0.3, apo * 2 + 0.3, 3.2, 3), mat(0x7a0a10, 0.5, 0.2), x, cy, z)).rotation.y = Math.PI / 3 + Math.PI / 2;
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + Math.PI / 3 + (k * Math.PI * 2) / 3;
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const lf = letters(b, 'HORSESHOE', fw - 0.2, 1.3, { style: 'slab', fill: 'gold', edge: '#2a0204', edgeW: 3, spacing: 0.04 });
    b.add(placed(lf, x + nx * (apo + 0.2), cy - 0.6, z + nz * (apo + 0.2), a));
  }
  const shoe = mesh(new THREE.TorusGeometry(1.2, 0.32, 10, 24, Math.PI * 1.55), gold, x, cy + 2.9, z);
  shoe.rotation.z = Math.PI / 2 + Math.PI * 0.225; // the open end up, for luck
  shoe.rotation.y = Math.PI / 2;
  b.add(shoe);
  for (const s of [-1, 1]) b.add(mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), gold, x, cy + 2.9 + 0.95, z + s * 0.72));
}

/** The Swarovski Starburst on its perch: crystal spheres on rods round a core, a hex LED canopy under it. */
export function starburst(b: WorldBuilder, x: number, z: number, y: number): void {
  const steel = mat(0x8a8f99, 0.3, 0.8);
  const crystal = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, roughness: 0.05, metalness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.05 });
  b.add(mesh(new THREE.CylinderGeometry(0.22, 0.32, y, 10), steel, x, y / 2, z, true));
  b.collider(x - 0.35, x + 0.35, z - 0.35, z + 0.35, 0, y, true);
  b.add(mesh(new THREE.SphereGeometry(0.5, 12, 10), steel, x, y + 1.6, z));
  const N = 90;
  const ga = Math.PI * (3 - Math.sqrt(5));
  const ball = new THREE.SphereGeometry(0.13, 6, 4);
  for (let i = 0; i < N; i++) {
    const yy = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - yy * yy);
    const th = ga * i;
    const d = new THREE.Vector3(Math.cos(th) * r, yy, Math.sin(th) * r);
    const len = 1.05 + (i % 3) * 0.12;
    const rod = mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 4), steel, x + d.x * len * 0.5, y + 1.6 + d.y * len * 0.5, z + d.z * len * 0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    b.add(rod);
    b.add(mesh(ball, crystal, x + d.x * len, y + 1.6 + d.y * len, z + d.z * len));
  }
  // the hex canopy ring under it
  const hexMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, emissive: 0x8ab8ff, emissiveIntensity: 0.05, roughness: 0.4 });
  const hex = mesh(new THREE.TorusGeometry(2.8, 0.16, 6, 6), hexMat, x, y - 0.6, z);
  hex.rotation.x = Math.PI / 2;
  b.add(hex);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const p0 = new THREE.Vector3(x + Math.cos(a) * 2.8, y - 0.6, z + Math.sin(a) * 2.8);
    const p1 = new THREE.Vector3(x, y - 0.1, z);
    const sp = mesh(new THREE.CylinderGeometry(0.05, 0.05, p0.distanceTo(p1), 5), steel, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
    b.add(sp);
  }
  // after dark the crystals and the canopy cycle colour; the full show (brighter, faster) every few minutes
  const c = new THREE.Color();
  b.every((_dt, t, night) => {
    const n = THREE.MathUtils.smoothstep(night, 0.2, 0.8);
    const show = n > 0.5 && t % 180 < 30;
    c.setHSL((t * (show ? 0.25 : 0.04)) % 1, 0.75, 0.62);
    crystal.emissive.copy(c);
    crystal.emissiveIntensity = 0.05 + n * (show ? 0.95 : 0.45);
    hexMat.emissive.copy(c);
    hexMat.emissiveIntensity = 0.05 + n * (show ? 1.0 : 0.55);
  });
}

// ---------------------------------------------------------------- The Vanderpump

/** The Vanderpump crest: a gold heraldic shield under a crown, between two rampant scrolls. */
function crest(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = goldGradient(ctx, 0, h);
  ctx.strokeStyle = '#3a2808';
  ctx.lineWidth = w * 0.012;
  const sh = new Path2D();
  sh.moveTo(w * 0.32, h * 0.3);
  sh.lineTo(w * 0.68, h * 0.3);
  sh.lineTo(w * 0.68, h * 0.62);
  sh.quadraticCurveTo(w * 0.66, h * 0.86, w * 0.5, h * 0.97);
  sh.quadraticCurveTo(w * 0.34, h * 0.86, w * 0.32, h * 0.62);
  sh.closePath();
  ctx.fill(sh);
  ctx.stroke(sh);
  ctx.fillStyle = '#7a4b65';
  ctx.fillRect(w * 0.36, h * 0.34, w * 0.28, h * 0.3);
  ctx.fillStyle = goldGradient(ctx, h * 0.34, h * 0.64);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'V', 'roman', w * 0.2, h * 0.3);
  ctx.fillText('V', w * 0.5, h * 0.5);
  // crown
  ctx.fillStyle = goldGradient(ctx, 0, h * 0.3);
  ctx.beginPath();
  ctx.moveTo(w * 0.36, h * 0.27);
  ctx.lineTo(w * 0.36, h * 0.12);
  ctx.lineTo(w * 0.42, h * 0.2);
  ctx.lineTo(w * 0.5, h * 0.05);
  ctx.lineTo(w * 0.58, h * 0.2);
  ctx.lineTo(w * 0.64, h * 0.12);
  ctx.lineTo(w * 0.64, h * 0.27);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // scrolls either side
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(w * (0.5 + s * 0.2), h * 0.4);
    ctx.bezierCurveTo(w * (0.5 + s * 0.42), h * 0.3, w * (0.5 + s * 0.46), h * 0.7, w * (0.5 + s * 0.3), h * 0.78);
    ctx.lineWidth = w * 0.03;
    ctx.strokeStyle = goldGradient(ctx, h * 0.3, h * 0.8);
    ctx.stroke();
  }
}

const VANDERPUMP_SHOWS: LedShow[] = [
  { name: 'VANDERPUMP', sub: 'HOTEL • CASINO • LAS VEGAS', color: '#7a4b65', art: 'singer' },
  { name: 'SOLEIA BEACH', sub: 'ROOFTOP POOL • DAYLIFE', color: '#a41b32', art: 'dj' },
  { name: "GIADA", sub: 'ON THE CORNER • RESERVE NOW', color: '#2a1a2a', art: 'singer' },
];

/**
 * The Vanderpump's corner (the building spans x x0…x1, z z0 (north) … z1 (south) at the Flamingo Rd
 * corner, the Strip to the west): two LED screens wrapping the corner, the crest over the name, black
 * awnings with gold trim on the Strip face.
 */
export function vanderpumpFront(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, h: number): void {
  const led = new LedBoard('THE VANDERPUMP', ['HOTEL • CASINO', "GIADA • ON THE CORNER", 'SOLEIA BEACH ROOFTOP', 'CAESARS REWARDS'], ['#7a4b65', '#e6037b', '#a41b32', '#1e1e20'], 512, 192).withShows(VANDERPUMP_SHOWS);
  const m = new THREE.MeshBasicMaterial({ map: led.tex });
  const y0 = 3.8;
  const lh = 3.2;
  const west = mesh(new THREE.PlaneGeometry(10, lh), m, x0 - 0.42, y0 + lh / 2, z1 - 5.2);
  west.rotation.y = -Math.PI / 2;
  b.add(west);
  const south = mesh(new THREE.PlaneGeometry(10, lh), m, x0 + 5.2, y0 + lh / 2, z1 + 0.42);
  b.add(south);
  driveLed(b, led, x0, y0 + lh / 2, z1);
  const black = mat(0x141416, 0.45, 0.4);
  const gold = mat(0xb8903c, 0.3, 0.85);
  b.add(mesh(new THREE.BoxGeometry(0.6, lh + 0.5, 10.6), black, x0 - 0.12, y0 + lh / 2, z1 - 5.2));
  b.add(mesh(new THREE.BoxGeometry(10.6, lh + 0.5, 0.6), black, x0 + 5.2, y0 + lh / 2, z1 + 0.12));
  b.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, lh + 0.5, 10), black, x0 - 0.05, y0 + lh / 2, z1 + 0.05));
  for (const yy of [y0 - 0.1, y0 + lh + 0.1]) {
    b.add(mesh(new THREE.BoxGeometry(0.66, 0.1, 10.6), gold, x0 - 0.12, yy, z1 - 5.2));
    b.add(mesh(new THREE.BoxGeometry(10.6, 0.1, 0.66), gold, x0 + 5.2, yy, z1 + 0.12));
  }
  // black Parisian awnings with gold edges over the Strip-face windows (north of the screens)
  const awn = mat(0x101012, 0.6);
  for (let z = z1 - 12; z > z0 + 1.5; z -= 3.2) {
    const a = mesh(new THREE.BoxGeometry(1.4, 0.12, 2.4), awn, x0 - 0.7, 3.2, z);
    a.rotation.z = 0.35;
    b.add(a);
    b.add(mesh(new THREE.BoxGeometry(0.08, 0.32, 2.4), gold, x0 - 1.38, 2.95, z));
  }
  // the crest high on the Strip face, over the name
  b.add(placed(letterFace(b, 3.4, 3.4, crest, 0.2), x0 - 0.3, h - 0.4, (z0 + z1) / 2, -Math.PI / 2));
}

// ---------------------------------------------------------------- The LINQ

/** The slim LINQ pylon at the promenade mouth: LED faces, "LINQ" in cyan at the top. */
export function linqPylon(b: WorldBuilder, x: number, z: number): void {
  const led = new LedBoard('THE LINQ', ['PROMENADE', 'HIGH ROLLER', 'FLY LINQ ZIPLINE', "O'SHEAS • IN-N-OUT"], ['#0d1420', '#2fe0e6', '#c0207a', '#3a2a8a'], 128, 512);
  const w = 1.9;
  const h = 9.5;
  const y0 = 1.2;
  const body = mat(0x1a1e26, 0.4, 0.5);
  b.add(mesh(new THREE.BoxGeometry(w + 0.3, h + 3.6, 0.9), body, x, (h + 3.6) / 2, z, true));
  b.collider(x - (w + 0.3) / 2, x + (w + 0.3) / 2, z - 0.45, z + 0.45, 0, h + 3.6, true);
  const m = new THREE.MeshBasicMaterial({ map: led.tex });
  for (const s of [-1, 1]) {
    const f = mesh(new THREE.PlaneGeometry(w, h), m, x, y0 + h / 2, z + s * 0.47);
    f.rotation.y = s > 0 ? 0 : Math.PI;
    b.add(f);
    b.add(placed(neonPanel(b, 'LINQ', w + 0.2, 1.3, { style: 'sans', color: '#2fe0e6', fill: '#eaffff', depth: 0.1, size: 0.8, spacing: 0.1 }), x, y0 + h + 1.4, z + s * 0.48, s > 0 ? 0 : Math.PI));
  }
  driveLed(b, led, x, y0 + h / 2, z);
}

/** Hexagon-tiled box (mauve and grey on white) with THE LINQ in thin white letters; magenta at night. */
export function linqHexBox(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, h: number): void {
  const paint = (lit: boolean) => (ctx: CanvasRenderingContext2D, w: number, hh: number) => {
    ctx.fillStyle = lit ? '#000000' : '#f2f0f4';
    ctx.fillRect(0, 0, w, hh);
    const r = 16;
    const cols = ['#b48ab4', '#8a7a9a', '#d8c8dc', '#a06aa0', '#f2f0f4'];
    let k = 0;
    for (let row = 0, y = 0; y < hh + r; y += r * 1.5, row++) {
      for (let x = (row % 2) * r * 0.866; x < w + r; x += r * 1.732) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + (i * Math.PI) / 3;
          ctx.lineTo(x + Math.cos(a) * (r - 1.5), y + Math.sin(a) * (r - 1.5));
        }
        ctx.closePath();
        k = (k * 7 + 3) % 11;
        ctx.fillStyle = lit ? (k % 3 === 0 ? '#ff40c0' : '#5a1050') : cols[k % cols.length];
        ctx.fill();
      }
    }
  };
  const map = canvasTex(256, 256, paint(false), true);
  const em = canvasTex(256, 256, paint(true), true);
  const hm = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.6 });
  b.nightGlow(hm, 0.0, 0.75);
  const geo = new THREE.BoxGeometry(x1 - x0, h, z1 - z0);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const across = Math.abs(nor.getX(i)) > 0.5 ? z1 - z0 : x1 - x0;
    uv.setXY(i, (uv.getX(i) * across) / 6, (uv.getY(i) * h) / 6);
  }
  b.add(mesh(geo, hm, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, true));
  b.collider(x0, x1, z0, z1, 0, h, true);
  b.add(placed(letters(b, 'THE', 2.2, 0.8, { style: 'thin', fill: '#ffffff', spacing: 0.3 }), x0 - 0.03, h - 2.4, (z0 + z1) / 2, -Math.PI / 2));
  b.add(placed(letters(b, 'LINQ', z1 - z0 - 1.2, 2.4, { style: 'thin', fill: '#ffffff', spacing: 0.2 }), x0 - 0.03, h - 4.2, (z0 + z1) / 2, -Math.PI / 2));
  // light fins of staggered lengths along the foot of the Strip face
  const fin = new THREE.MeshStandardMaterial({ color: 0xe8e0f0, emissive: 0xb060ff, emissiveIntensity: 0.05, roughness: 0.4 });
  b.nightGlow(fin, 0.05, 0.9);
  for (let i = 0; i < 9; i++) {
    const fh = 2.2 + ((i * 5) % 7) * 0.45;
    b.add(mesh(new THREE.BoxGeometry(0.18, fh, 0.12), fin, x0 - 0.12, fh / 2 + 0.2, z0 + 0.8 + (i * (z1 - z0 - 1.6)) / 8));
  }
}

/** Soleia Beach on the Vanderpump roof: fire-engine-red loungers and cabanas round the pool. */
export function soleiaLoungers(b: WorldBuilder, x0: number, x1: number, zA: number, zB: number, y: number): void {
  const red = mat(0xc8102e, 0.6);
  const white = mat(0xf4f1ea, 0.6);
  for (const z of [zA, zB]) {
    for (let x = x0; x <= x1; x += 1.6) {
      const l = mesh(new THREE.BoxGeometry(0.75, 0.3, 1.9), red, x, y + 0.3, z);
      b.add(l);
      const back = mesh(new THREE.BoxGeometry(0.75, 0.08, 0.8), red, x, y + 0.6, z + (z < (zA + zB) / 2 ? -0.85 : 0.85));
      back.rotation.x = z < (zA + zB) / 2 ? 0.7 : -0.7;
      b.add(back);
    }
  }
  for (const x of [x0 - 2.2, x1 + 2.2]) {
    b.add(mesh(new THREE.BoxGeometry(2.4, 0.12, 2.4), red, x, y + 2.6, (zA + zB) / 2));
    for (const [dx, dz] of [
      [-1.1, -1.1],
      [1.1, -1.1],
      [-1.1, 1.1],
      [1.1, 1.1],
    ]) b.add(mesh(new THREE.BoxGeometry(0.08, 2.5, 0.08), white, x + dx, y + 1.3, (zA + zB) / 2 + dz));
  }
}

// ---------------------------------------------------------------- Casino Royale

/** The tilted yellow Denny's sign face. */
function dennysFace(ctx: CanvasRenderingContext2D, w: number, hh: number): void {
  ctx.save();
  ctx.translate(w / 2, hh / 2);
  ctx.rotate(-0.12);
  ctx.fillStyle = '#ffd23a';
  ctx.fillRect(-w * 0.44, -hh * 0.36, w * 0.88, hh * 0.72);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, "Denny's", 'block', w * 0.76, hh * 0.5);
  ctx.fillStyle = '#c8102e';
  ctx.fillText("Denny's", 0, hh * 0.02);
  ctx.restore();
}

/**
 * Casino Royale's real order along the walk, south to north: the McDonald's under its giant bulb-lit
 * golden arches, the casino under a gold onion-dome turret with the magenta CASINO ROYALE sign, then the
 * 2014 block with the pharmacy downstairs and Denny's upstairs behind a red steel portal, its grey stone
 * pylon with the giant silver fork and the tilted yellow sign. Faces −x at `x`; z0 north … z1 south.
 */
export function casinoRoyaleDressing(b: WorldBuilder, x: number, z0: number, z1: number, h: number, doors: number): void {
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc72c, emissive: 0xffb000, emissiveIntensity: 0.1, roughness: 0.35, metalness: 0.4 });
  b.nightGlow(gold, 0.1, 0.9);
  // the golden arches: two parabolic arches side by side on the roof over the McDonald's (south end)
  const mz = z1 - 3.6;
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const zz = mz + s * 1.35 + (t - 0.5) * 2.6;
      const yy = h + 0.2 + 3.6 * (1 - Math.pow((t - 0.5) * 2, 2));
      pts.push(new THREE.Vector3(x - 0.6, yy, zz));
    }
    b.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.3, 8), gold));
  }
  b.add(neonPanel(b, "McDonald's", 5.6, 1.2, { style: 'block', color: '#ffc72c', fill: '#ffc72c', bg: 0xc8102e, depth: 0.3, size: 0.72 }), x - 0.3, 5.2, mz, -Math.PI / 2);
  // gold onion-dome turret at the casino's corner (north of the sign, clear of the arches)
  const tz = doors - 6.6;
  b.add(mesh(new THREE.CylinderGeometry(1.5, 1.5, h + 1.2, 16), mat(0xeadfc8, 0.65), x - 0.9, (h + 1.2) / 2, tz, true));
  b.collider(x - 2.4, x + 0.6, tz - 1.5, tz + 1.5, 0, h + 1.2, true);
  const domeProfile: Array<[number, number]> = [
    [1.55, 0],
    [1.9, 0.7],
    [1.85, 1.5],
    [1.3, 2.3],
    [0.55, 3.0],
    [0.12, 3.6],
    [0.05, 4.3],
  ];
  const dome = new THREE.LatheGeometry(
    domeProfile.map(([r, y]) => new THREE.Vector2(r, y)),
    20
  );
  const domeGold = mat(0xd9a93e, 0.3, 0.85);
  b.add(mesh(dome, domeGold, x - 0.9, h + 1.2, tz, true));
  b.add(mesh(new THREE.TorusGeometry(1.55, 0.12, 6, 20), domeGold, x - 0.9, h + 1.2, tz)).rotation.x = Math.PI / 2;
  // the CASINO ROYALE sign: white letters on a magenta panel under a gold fan crest
  b.add(neonPanel(b, 'CASINO ROYALE', 9.4, 1.7, { style: 'serif', color: '#ffe0f0', fill: '#ffffff', bg: 0xb0106a, depth: 0.35, size: 0.62, spacing: 0.04 }), x - 0.45, 7.6, doors, -Math.PI / 2);
  const fanCrest = letterFace(b, 3.6, 1.6, (ctx, w, hh) => {
    ctx.fillStyle = goldGradient(ctx, 0, hh);
    for (let i = -4; i <= 4; i++) {
      ctx.save();
      ctx.translate(w / 2, hh * 0.98);
      ctx.rotate(i * 0.3);
      ctx.beginPath();
      ctx.moveTo(-w * 0.03, 0);
      ctx.lineTo(0, -hh * 0.92);
      ctx.lineTo(w * 0.03, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(w / 2, hh * 0.98, hh * 0.22, Math.PI, 0);
    ctx.fill();
  });
  b.add(placed(fanCrest, x - 0.62, 9.3, doors, -Math.PI / 2));
  // north end: the pharmacy in red script on white, Denny's red portal upstairs, the fork pylon
  const nz = z0 + 6.5;
  b.add(neonPanel(b, 'Pharmacy', 6.4, 1.2, { style: 'script', color: '#ff4040', fill: '#e31837', bg: 0xffffff, depth: 0.25, size: 0.8 }), x - 0.35, 4.0, nz, -Math.PI / 2);
  const red = mat(0xc8102e, 0.45, 0.4);
  b.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 11), red, x - 0.6, h - 0.9, nz));
  for (const s of [-1, 1]) b.add(mesh(new THREE.BoxGeometry(0.5, h - 5.2, 0.5), red, x - 0.6, 5 + (h - 5.2) / 2 - 0.4, nz + s * 5.25));
  const px = x - 1.6;
  const pz = z0 + 1.2;
  const stone = mat(0x8a8a88, 0.85);
  b.add(mesh(new THREE.BoxGeometry(1.3, h + 1.6, 1.3), stone, px, (h + 1.6) / 2, pz, true));
  b.collider(px - 0.65, px + 0.65, pz - 0.65, pz + 0.65, 0, h + 1.6, true);
  const silver = mat(0xd8dde2, 0.2, 0.9);
  b.add(mesh(new THREE.BoxGeometry(0.2, h - 3, 0.5), silver, px - 0.75, (h - 3) / 2 + 1, pz));
  b.add(mesh(new THREE.BoxGeometry(0.2, 0.9, 1.1), silver, px - 0.75, h - 1.6, pz));
  for (const t of [-0.45, -0.15, 0.15, 0.45]) b.add(mesh(new THREE.BoxGeometry(0.16, 1.6, 0.12), silver, px - 0.75, h - 0.4, pz + t));
  b.add(mesh(new THREE.BoxGeometry(1.2, 1.9, 3.3), stone, px, h + 2.4, pz));
  b.add(placed(letterFace(b, 3.0, 1.5, dennysFace), px - 0.62, h + 2.4, pz, -Math.PI / 2));
  b.add(placed(letterFace(b, 3.0, 1.5, dennysFace), px + 0.62, h + 2.4, pz, Math.PI / 2));
}

// ---------------------------------------------------------------- The Venetian's columns

/** The Piazzetta's two columns at the canal edge: the winged lion of St Mark on one, St Theodore on the other. */
export function venetianColumns(b: WorldBuilder, x: number, zLion: number, zTheo: number): void {
  const marble = mat(0xf0e8da, 0.5);
  const grey = mat(0xb8b2a8, 0.6);
  const bronze = mat(0x5a4a30, 0.45, 0.7);
  const gold = mat(0xd9a93e, 0.3, 0.85);
  const saint = mat(0xe8e0d0, 0.55);
  const H = 7.4;
  for (const z of [zLion, zTheo]) {
    b.add(mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.6, 8), grey, x, 0.3, z, true));
    b.add(mesh(new THREE.BoxGeometry(1.3, 0.8, 1.3), marble, x, 1.0, z));
    b.add(mesh(new THREE.CylinderGeometry(0.36, 0.42, H, 14), grey, x, 1.4 + H / 2, z, true));
    b.add(mesh(new THREE.BoxGeometry(1.0, 0.55, 1.0), marble, x, 1.4 + H + 0.27, z));
    b.collider(x - 0.6, x + 0.6, z - 0.6, z + 0.6, 0, 1.4, true);
  }
  const top = 1.4 + H + 0.55;
  // the winged lion: body, head, raised gilded wings
  b.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 1.1), bronze, x, top + 0.45, zLion));
  b.add(mesh(new THREE.SphereGeometry(0.28, 10, 8), bronze, x - 0.05, top + 0.82, zLion + 0.48));
  for (const s of [-1, 1]) {
    const wing = mesh(new THREE.BoxGeometry(0.06, 0.8, 0.6), gold, x + s * 0.3, top + 1.0, zLion - 0.1);
    wing.rotation.z = -s * 0.45;
    b.add(wing);
  }
  // St Theodore standing on his crocodile, spear in hand
  b.add(mesh(new THREE.BoxGeometry(0.4, 0.22, 1.2), saint, x, top + 0.11, zTheo));
  b.add(mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.1, 10), saint, x, top + 0.77, zTheo));
  b.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), saint, x, top + 1.45, zTheo));
  b.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 5), bronze, x + 0.26, top + 1.0, zTheo));
}
