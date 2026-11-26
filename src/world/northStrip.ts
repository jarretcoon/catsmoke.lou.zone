import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeGroup } from '../meshBake';
import type { WorldBuilder } from './builder';
import { curvedTower, stairs, tower } from './buildings';
import { buildCasinoFloor } from './casinos';
import { bigTopLight, buildBigTopInterior, buildPromenade } from './circusInterior';
import { LedBoard, makeBoulevardTexture, makePaverTexture, makeSignTexture } from './textures';
import type { FacadeSpec } from './textures';
import { barCounter, basic, bench, car, cypressTree, mat, mesh, neonSign, palmTree, planter } from './props';
import type { CarKind } from './props';
import { xFromO, zFromS } from './strip';
import { wynnSignature } from './stripSigns';

/**
 * North Strip, Spring Mountain Rd / Sands Ave → Circus Circus (Sahara + the STRAT as backdrop).
 * West, south → north: Fashion Show + The Cloud · ex-New Frontier lot (Wynn) · Resorts World ·
 * Slots-A-Fun · Circus Circus (big top, towers, Adventuredome, the dark Lucky the Clown sign).
 * East, south → north: Wynn (mountain + Lake of Dreams) · Encore · Wynn Golf Club · Peppermill ·
 * Diamond Lot (ex-Riviera) · LVCC West Hall · Las Vegas Monorail · Fontainebleau.
 * Real positions come from zFromS / xFromO (the real ~28° bend north of s≈600 is ignored).
 */
export function buildNorthStrip(b: WorldBuilder): void {
  buildFashionShow(b);
  buildFrontierLot(b);
  buildResortsWorld(b);
  buildSlotsAFun(b);
  buildCircusCircus(b);
  buildAdventuredome(b);
  buildWynn(b);
  buildEncore(b);
  buildWynnGolf(b);
  buildPeppermill(b);
  buildDiamondLot(b);
  buildWestHall(b);
  buildMonorail(b);
  buildFontainebleau(b);
  buildNorthBackdrop(b);
  addSidewalkCrowds(b);
}

const HALF_PI = Math.PI / 2;
const UP = new THREE.Vector3(0, 1, 0);
/** North edge of the reserved Spring Mountain / Sands corridor (−420 < z < −394). */
const Z_SANDS = -420;
/** Convention Center Dr (reserved for x > 0 within ±9 m). */
const Z_CONV = zFromS(2180);
/** Circus Circus Dr (reserved for x < 0 within ±9 m). */
const Z_CCDR = zFromS(2720);

// =============================================================== helpers

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function place<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rotY = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = rotY;
  return o;
}

function part(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): THREE.Mesh {
  const o = mesh(geo, m, x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

/** Thin cylinder from a to c. */
function rod(a: THREE.Vector3, c: THREE.Vector3, r: number, m: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(c, a);
  const len = dir.length();
  const o = mesh(new THREE.CylinderGeometry(r, r, len, 6), m, (a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
  o.quaternion.setFromUnitVectors(UP, dir.normalize());
  return o;
}

/**
 * Merge many small static pieces (trees, parked cars, posts, bulbs…) into one mesh per material
 * before they reach the scene, so the district stays cheap even before the static bake.
 */
function mergeAdd(b: WorldBuilder, objs: THREE.Object3D[], cast = true): void {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const o of objs) {
    o.updateMatrixWorld(true);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const g = m.geometry.clone();
      g.clearGroups();
      g.applyMatrix4(m.matrixWorld);
      const key = m.material as THREE.Material;
      let list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      list.push(g);
    });
  }
  for (const [material, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) {
      for (const g of geos) b.add(new THREE.Mesh(g, material));
      continue;
    }
    if (geos.length > 1) for (const g of geos) g.dispose();
    const m = new THREE.Mesh(merged, material);
    m.castShadow = cast;
    m.receiveShadow = true;
    b.add(m);
  }
}

function plaza(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, base = '#d8ccb4', joint = '#bfb197'): void {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  const m = new THREE.MeshStandardMaterial({ map: makePaverTexture(base, joint, 4), roughness: 0.8 });
  m.map!.repeat.set(w / 4, d / 4);
  b.floor((x0 + x1) / 2, (z0 + z1) / 2, w, d, m, 0.01);
}

function pine(h: number, seed = 0): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.16, h * 0.3, 5), mat(0x4a3424, 0.9), 0, h * 0.15, 0));
  const needles = mat([0x1f4a2a, 0x24552f, 0x2c5e33][seed % 3], 0.9);
  for (let i = 0; i < 3; i++) {
    const r = (0.8 - i * 0.2) * (h / 5);
    g.add(mesh(new THREE.ConeGeometry(r, h * 0.42, 7), needles, 0, h * (0.34 + i * 0.21), 0));
  }
  return g;
}

function roundTree(h: number, leaf = 0x3f7a3a): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, h * 0.55, 6), mat(0x5a4030, 0.9), 0, h * 0.27, 0));
  const crown = mesh(new THREE.SphereGeometry(h * 0.28, 10, 8), mat(leaf, 0.85), 0, h * 0.68, 0);
  crown.scale.y = 0.85;
  g.add(crown);
  return g;
}

function stripeTexture(a: string, c: string, n: number): THREE.CanvasTexture {
  return canvasTex(512, 64, (ctx) => {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? c : a;
      ctx.fillRect((i * 512) / n, 0, 512 / n + 1, 64);
    }
  });
}

function waterfallTexture(): THREE.CanvasTexture {
  return canvasTex(
    64,
    256,
    (ctx) => {
      ctx.fillStyle = 'rgba(190,236,255,0.55)';
      ctx.fillRect(0, 0, 64, 256);
      for (let i = 0; i < 110; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + (i % 5) * 0.13})`;
        ctx.fillRect((i * 37) % 64, (i * 71) % 256, 1 + (i % 3), 18 + ((i * 13) % 60));
      }
    },
    [5, 2]
  );
}

let parkingBase: THREE.CanvasTexture | null = null;
/** Asphalt tile = 14 m × 14 m: two 5.5 m stall rows around a 3 m aisle, stalls 2.8 m wide. */
function parkingLot(b: WorldBuilder, xa: number, xb: number, za: number, zb: number): void {
  const x0 = Math.min(xa, xb);
  const x1 = Math.max(xa, xb);
  const zS = Math.max(za, zb);
  const zN = Math.min(za, zb);
  if (!parkingBase) {
    parkingBase = canvasTex(256, 256, (ctx) => {
      ctx.fillStyle = '#2a2b30';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2400; i++) {
        const v = 34 + ((i * 41) % 22);
        ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
        ctx.fillRect((i * 83) % 256, (i * 157) % 256, 2, 2);
      }
      const px = 256 / 14;
      ctx.fillStyle = 'rgba(236,236,226,0.85)';
      for (let x = 0; x < 256; x += 2.8 * px) {
        ctx.fillRect(x, 0, 3, 5.5 * px);
        ctx.fillRect(x, 256 - 5.5 * px, 3, 5.5 * px);
      }
      ctx.fillRect(0, 5.5 * px, 256, 2);
      ctx.fillRect(0, 256 - 5.5 * px - 2, 256, 2);
    });
  }
  const t = parkingBase.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set((x1 - x0) / 14, (zS - zN) / 14);
  t.needsUpdate = true;
  b.floor((x0 + x1) / 2, (zS + zN) / 2, x1 - x0, zS - zN, new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }), 0.012);
}

/** Stall centres that line up with parkingLot()'s painted lines. */
function stallSpots(xa: number, xb: number, za: number, zb: number): Array<[number, number]> {
  const x0 = Math.min(xa, xb);
  const x1 = Math.max(xa, xb);
  const zS = Math.max(za, zb);
  const d = zS - Math.min(za, zb);
  const out: Array<[number, number]> = [];
  for (let base = 0; base < d; base += 14) {
    for (const off of [2.75, 11.25]) {
      const dz = base + off;
      if (dz > d - 2.6) continue;
      for (let x = x0 + 1.4; x < x1 - 1; x += 2.8) out.push([x, zS - dz]);
    }
  }
  return out;
}

const PARKED: Array<[CarKind, number]> = [
  ['sedan', 0xe8e8ea],
  ['suv', 0x1d1f24],
  ['sedan', 0x6b6f76],
  ['suv', 0xf2f2f0],
  ['sedan', 0x2d4f8c],
  ['sport', 0xc4161c],
  ['suv', 0x8a1c1c],
  ['sedan', 0x111111],
  ['sedan', 0xbfa77a],
];

/** A parked car with its lamps off (and no draw calls for them). */
function parkedCar(i: number, x: number, z: number): THREE.Group {
  const [kind, color] = PARKED[i % PARKED.length];
  const g = car(kind, color).group;
  for (const ch of [...g.children]) {
    const m = ch as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.Material).type === 'MeshBasicMaterial') g.remove(m);
    else if (m.isMesh) m.userData.clutter = true; // high garage decks: cull with street clutter, not the skyline
  }
  return place(g, x, 0, z, i % 3 === 0 ? Math.PI : 0);
}

function parkCars(b: WorldBuilder, spots: Array<[number, number]>, every: number, seed: number): void {
  const cars: THREE.Object3D[] = [];
  spots.forEach(([x, z], i) => {
    if ((i * 7 + seed) % every !== 0) return;
    cars.push(parkedCar(i + seed, x, z));
  });
  mergeAdd(b, cars);
}

/** Two-panel gable roof (base at baseY), ridge along z. */
function gableRoof(out: THREE.Object3D[], m: THREE.Material, x: number, baseY: number, z: number, width: number, height: number, length: number): void {
  const half = width / 2;
  const slope = Math.hypot(half, height);
  const ang = Math.atan2(height, half);
  for (const s of [-1, 1]) out.push(part(new THREE.BoxGeometry(slope, 0.08, length), m, x + (s * half) / 2, baseY + height / 2, z, 0, 0, -s * ang));
}

/** LED pylon at the Strip edge, faces ±x. */
function ledPylon(b: WorldBuilder, led: LedBoard, x: number, z: number, h: number, w: number, base = 0x2a2a30): void {
  const face = new THREE.MeshBasicMaterial({ map: led.tex });
  const dark = basic(0x121216);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.2), [dark, dark, dark, dark, face, face]);
  m.rotation.y = HALF_PI;
  b.add(m, x, 2.6 + h / 2, z);
  led.at(x, 2.6 + h / 2, z); // only redraws while the camera is near
  b.add(mesh(new THREE.BoxGeometry(1.6, 2.6, Math.min(w, 3)), mat(base, 0.5, 0.4)), x, 1.3, z);
  b.collider(x - 0.8, x + 0.8, z - w / 2, z + w / 2, 0, 2.6 + h, true);
  b.every((_dt, t) => led.draw(t));
}

/** Printed (unlit) sign board — banners, plaques, sandwich boards. Faces ±z. */
function printedSign(text: string, bg: string, fg: string, sub: string | undefined, w: number, h: number, depth = 0.08): THREE.Mesh {
  const face = new THREE.MeshStandardMaterial({ map: makeSignTexture(text, bg, fg, sub, 'system-ui, Arial, sans-serif'), roughness: 0.8 });
  const edge = mat(0x8a8d93, 0.6, 0.3);
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), [edge, edge, edge, edge, face, face]);
}

function glassGlow(b: WorldBuilder, color = 0x1d2a36, lit = 0xffdcaa, night = 1.3): THREE.MeshStandardMaterial {
  return b.nightGlow(new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.6, emissive: lit, emissiveIntensity: 0.1 }), 0.1, night);
}

// =============================================================== Fashion Show + The Cloud
function buildFashionShow(b: WorldBuilder): void {
  const zS = Z_SANDS;
  const zN = zFromS(1550);
  const front = -50;
  const zMid = (zS + zN) / 2;
  // The ABC Stores storefront slot (x −46…−19, z −432…−414) is left empty for the main session.
  plaza(b, -19, front, -432.4, zN, '#d9d5cd', '#bdb7ac');
  plaza(b, -46.4, front, zS, -432.4, '#d9d5cd', '#bdb7ac');

  // Long low mall: three levels of white panels, glass storefront band, fins
  const shell = mat(0xe8e5df, 0.55, 0.1);
  b.box(-77, 0, zMid, 54, 13, zS - zN, shell, true);
  const glass = glassGlow(b);
  b.add(part(new THREE.PlaneGeometry(zS - zN - 1, 4.2), glass, front + 0.04, 2.3, zMid, HALF_PI));
  const fin = mat(0xc8ccd2, 0.3, 0.7);
  const fins: THREE.Object3D[] = [];
  for (const y of [5.2, 8.4, 11.6]) fins.push(mesh(new THREE.BoxGeometry(0.7, 0.35, zS - zN), fin, front + 0.35, y, zMid));
  for (let z = zS - 3; z > zN + 2; z -= 6) fins.push(mesh(new THREE.BoxGeometry(0.5, 13, 0.35), fin, front + 0.25, 6.5, z));
  // rooftop units
  for (let i = 0; i < 6; i++) fins.push(mesh(new THREE.BoxGeometry(4, 1.8, 3), mat(0x9a9ea6, 0.6, 0.3), -64 - (i % 3) * 12, 13.9, zMid - 14 + Math.floor(i / 3) * 26));
  mergeAdd(b, fins, false);
  // Glass atrium entrance under the Cloud
  b.add(mesh(new THREE.BoxGeometry(2.4, 11, 13), glass, front + 1.2, 5.5, -455));
  b.add(mesh(new THREE.BoxGeometry(5, 0.4, 15), fin, front + 2.6, 4.6, -455, true));
  b.collider(front, front + 2.4, -461.5, -448.5, 0, 11, true);
  b.add(neonSign('FASHION SHOW', '#121419', '#ffffff', 22, 2.8, 'LAS VEGAS'), front + 0.3, 14.6, -444, HALF_PI);

  // Department stores behind (their names peek over the mall roof)
  const stores: Array<[number, number, number, number, string, string, string]> = [
    [-420.5, -438.5, 17, 0xcdbfa6, 'NEIMAN MARCUS', '#2a2420', '#f4ecdc'],
    [-439, -456.5, 16, 0xf0efe9, 'SAKS FIFTH AVENUE', '#111111', '#ffffff'],
    [-457, -475, 18, 0xb9bcc2, 'NORDSTROM', '#0e0e10', '#ffffff'],
  ];
  for (const [z0, z1, h, color, name, bg, fg] of stores) {
    const zc = (z0 + z1) / 2;
    b.box(-125, 0, zc, 42, h, Math.abs(z1 - z0), mat(color, 0.7), true);
    b.add(neonSign(name, bg, fg, Math.abs(z1 - z0) - 3, 1.9, undefined, 0.2), -103.8, h - 2, zc, HALF_PI);
    b.building(-125, zc, 42, Math.abs(z1 - z0), '#' + new THREE.Color(color).getHexString());
  }

  // The Cloud: a lenticular canopy over the plaza, LED underside, LED-wrapped columns, hanging screens
  const cx = -31;
  const cz = -455;
  const rx = 6.5;
  const rz = 17.5;
  const cy = 10;
  const dome = mesh(new THREE.SphereGeometry(1, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe4e9ee, 0.3, 0.6), cx, cy, cz, true);
  dome.scale.set(rx, 1.9, rz);
  b.add(dome);
  const cloudLed = new LedBoard('THE CLOUD', ['FASHION SHOW LAS VEGAS', 'HOLIDAY RUNWAY SHOWS • WEEKENDS', "NORDSTROM • SAKS • NEIMAN MARCUS • MACY'S", 'SANTA ARRIVES BY CLOUD • DEC 1'], ['#2f7bff', '#ff4fb0', '#7a3cff', '#00c2c7'], 512, 256);
  const under = mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ map: cloudLed.tex }), cx, cy - 0.03, cz);
  under.rotation.x = HALF_PI;
  under.scale.set(rx * 0.98, rz * 0.98, 1);
  b.add(under);
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x9fe0ff });
  const edge = mesh(new THREE.CylinderGeometry(1, 1, 0.45, 48, 1, true), edgeMat, cx, cy + 0.15, cz);
  edge.scale.set(rx + 0.02, 1, rz + 0.02);
  b.add(edge);
  const screenLed = new LedBoard('FASHION SHOW', ['THE CLOUD • LIVE ON THE STRIP', 'BLACK FRIDAY • DOORS 6AM', 'HOLIDAY GIFT GUIDE', 'FREE VALET • OPEN LATE'], ['#ff2d6f', '#00b7ff', '#ffb000', '#9b5cff'], 512, 256);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenLed.tex });
  for (const z of [-449, -461]) {
    b.add(part(new THREE.PlaneGeometry(9, 4.5), screenMat, -25.7, 6.9, z, HALF_PI));
    b.add(mesh(new THREE.BoxGeometry(0.35, 4.7, 9.2), mat(0x1a1c22, 0.5, 0.4), -25.95, 6.9, z));
    for (const dz of [-3.8, 3.8]) b.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5), mat(0x2a2c30, 0.4, 0.8), -25.95, 9.7, z + dz));
  }
  const colLed = new LedBoard('FASHION SHOW', ['NOW OPEN', 'THE CLOUD', 'SHOP • DINE • PLAY'], ['#ff4fb0', '#2f7bff', '#00c2c7'], 256, 512);
  const wrapMat = new THREE.MeshBasicMaterial({ map: colLed.tex });
  const colMat = mat(0xd9dee4, 0.3, 0.7);
  for (const [x, z] of [
    [-33.5, -441],
    [-28.5, -441],
    [-33.5, -469],
    [-28.5, -469],
  ]) {
    b.add(mesh(new THREE.CylinderGeometry(0.42, 0.62, cy, 12), colMat, x, cy / 2, z, true));
    b.add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 4.6, 16, 1, true), wrapMat, x, 3.2, z));
    b.collider(x - 0.7, x + 0.7, z - 0.7, z + 0.7, 0, cy, true);
  }
  b.every((_dt, t, night) => {
    cloudLed.draw(t);
    screenLed.draw(t + 2);
    colLed.draw(t + 5);
    edgeMat.color.setHSL((t * 0.06) % 1, 0.7, 0.5 + night * 0.15);
  });

  // Pop-up holiday runway under the Cloud
  b.box(-31, 0, -455, 12, 0.75, 2.2, mat(0xf4f4f6, 0.25, 0.1));
  const runwayLights = basic(0xbfe6ff);
  for (const s of [-1, 1]) b.add(mesh(new THREE.BoxGeometry(12, 0.06, 0.08), runwayLights, -31, 0.75, -455 + s * 1.12));
  b.add(neonSign('RUNWAY', '#101218', '#ff7ac8', 3.4, 1.2, 'HOLIDAY SHOW 7PM', 0.12), -37.4, 2.0, -455, HALF_PI);
  for (const dz of [-1.5, 1.5]) b.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), mat(0x2a2c30, 0.4, 0.8), -37.4, 0.7, -455 + dz));
  b.pickup(-34.2, 1.2, -455, 3, 'Fashion Show Runway Pack', false);

  // Landscaping + pylon
  const deco: THREE.Object3D[] = [];
  for (const z of [-437, -473]) {
    deco.push(place(planter(3, 1.4, 0xff6aa2), -43, 0, z));
    b.collider(-44.5, -41.5, z - 0.7, z + 0.7, 0, 0.6);
  }
  deco.push(place(palmTree(7.6, false, 5), -23.3, 0, -474), place(palmTree(8, false, 3), -45.5, 0, -447), place(palmTree(7.4, false, 7), -45.5, 0, -463));
  for (const z of [-452, -458]) deco.push(place(bench(), -44, 0, z, -HALF_PI));
  mergeAdd(b, deco);
  b.add(neonSign('FASHION SHOW', '#0d0f14', '#ffffff', 7, 2.2, 'LAS VEGAS • 250 STORES', 0.4), -21.4, 9.4, -437, HALF_PI);
  b.add(mesh(new THREE.BoxGeometry(0.9, 8.3, 1.4), mat(0x2a2c32, 0.4, 0.6)), -21.4, 4.15, -437);
  b.collider(-21.9, -20.9, -438, -436, 0, 10.5, true);

  b.building(-77, zMid, 54, zS - zN, '#e8e5df', 'Fashion Show');
  b.feature({ kind: 'plaza', x: cx, z: cz, w: rx * 2, d: rz * 2, color: '#cfd8e6', label: 'The Cloud' });
  b.zone('Fashion Show Las Vegas', -150, -19, zN, zS);
  b.zone('The Cloud (Fashion Show)', -38, -24, -473, -437);
  b.crowd.tourists.push(
    { pts: [[-24, -438], [-44, -440], [-44, -470], [-24, -472]], prop: 'bag' },
    { pts: [[-40, -447], [-24, -463]], prop: 'camera' },
    { pts: [[-26, -470], [-46, -436]], prop: 'yard-drink' }
  );
}

// =============================================================== ex-New Frontier site (Wynn-owned)
function buildFrontierLot(b: WorldBuilder): void {
  const zS = zFromS(1550) - 1.2;
  const zN = zFromS(1990) - 2.5;
  const xE = -20.3;
  const xW = -150;
  const w = xE - xW;
  const zc = (zS + zN) / 2;
  b.floor((xE + xW) / 2, zc, w, zS - zN, mat(0x8d6c4a, 0.97), 0.015);
  b.floor(-70, -526, 64, 52, mat(0x9b9387, 0.95), 0.022);
  b.feature({ kind: 'plaza', x: (xE + xW) / 2, z: zc, w, d: zS - zN, color: '#6b5238', label: 'Frontier lot' });

  // Chain-link + green windscreen, gate at z −523…−531
  const screen = mat(0x1f3a2c, 0.9);
  const gate0 = -523;
  const gate1 = -531;
  b.box(xE, 0, (zS + gate0) / 2, 0.15, 2.6, zS - gate0, screen, true, false);
  b.box(xE, 0, (gate1 + zN) / 2, 0.15, 2.6, gate1 - zN, screen, true, false);
  b.box((xE + xW) / 2, 0, zS, w, 2.6, 0.15, screen, true, false);
  b.box((xE + xW) / 2, 0, zN, w, 2.6, 0.15, screen, true, false);
  b.box(xW, 0, zc, 0.15, 2.6, zS - zN, screen, true, false);
  const steel = mat(0x8c8f94, 0.4, 0.6);
  const bits: THREE.Object3D[] = [];
  for (let z = zS; z >= zN; z -= 3.5) if (z > gate0 || z < gate1) bits.push(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), steel, xE, 1.4, z));
  bits.push(mesh(new THREE.BoxGeometry(0.1, 2.4, 8), steel, xE - 0.6, 1.2, gate1 - 4.2)); // gate slid open
  for (const [text, sub, z] of [
    ['PRIVATE PROPERTY', 'WYNN RESORTS • NO TRESPASSING', -490],
    ['EVENT LOAD-OUT', 'CREWS & CREDENTIALS ONLY', -515],
    ['TRUCK ENTRANCE', 'WATCH FOR FORKLIFTS', -538],
    ['FUTURE DEVELOPMENT', 'WYNN LAS VEGAS', -562],
  ] as const) {
    b.add(part(new THREE.PlaneGeometry(8, 2), new THREE.MeshStandardMaterial({ map: makeSignTexture(text, '#f2f0ea', '#1f3a2c', sub, 'system-ui, Arial, sans-serif'), roughness: 0.8 }), xE + 0.1, 1.4, z, HALF_PI));
  }

  // Big event tent mid-strike: north half still skinned, south half bare frame
  const fabric = mat(0xf3f2ec, 0.9);
  const alu = mat(0xc9ccd1, 0.35, 0.8);
  const tx = -57;
  const tw = 22;
  for (let z = -484; z >= -518.01; z -= 4.25) {
    for (const s of [-1, 1]) {
      bits.push(mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 6), alu, tx + (s * tw) / 2, 1.8, z));
      b.collider(tx + (s * tw) / 2 - 0.12, tx + (s * tw) / 2 + 0.12, z - 0.12, z + 0.12, 0, 3.6, true);
      bits.push(part(new THREE.BoxGeometry(Math.hypot(tw / 2, 4), 0.12, 0.12), alu, tx + (s * tw) / 4, 5.6, z, 0, 0, -s * Math.atan2(4, tw / 2)));
    }
  }
  gableRoof(bits, fabric, tx, 3.6, -509.5, tw + 0.6, 4, 17.5);
  b.box(tx - tw / 2, 0, -509.5, 0.1, 3.6, 17, fabric, true, false);
  b.box(tx + tw / 2, 0, -509.5, 0.1, 3.6, 17, fabric, true, false);
  b.box(tx, 0, -518, tw, 3.6, 0.1, fabric, true, false);
  // stacked banquet tables + chair carts in the open half
  for (let i = 0; i < 8; i++) {
    const x = tx - 7 + (i % 4) * 4.6;
    const z = -488 - Math.floor(i / 4) * 5;
    for (let k = 0; k < 5; k++) bits.push(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.06, 14), mat(0x8a6a48, 0.7), x, 0.4 + k * 0.08, z));
    bits.push(mesh(new THREE.BoxGeometry(1.2, 1.3, 0.8), mat(0x2a2a2e, 0.6, 0.4), x + 1.6, 0.65, z));
  }
  // three pagoda tents near the gate
  for (const z of [-545, -553, -561]) {
    for (const [dx, dz] of [
      [-2.8, -2.8],
      [2.8, -2.8],
      [-2.8, 2.8],
      [2.8, 2.8],
    ]) bits.push(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 5), alu, -32 + dx, 1.4, z + dz));
    bits.push(part(new THREE.ConeGeometry(4.3, 2.4, 4), fabric, -32, 4.0, z, Math.PI / 4));
    bits.push(mesh(new THREE.BoxGeometry(5.8, 0.4, 5.8), fabric, -32, 2.9, z));
  }

  // Concert stage being struck + scaffold stair to the roof (pickup up top)
  const deck = mat(0x2a2a2e, 0.7);
  const truss = mat(0x9aa0a8, 0.35, 0.8);
  const sx0 = -112;
  const sx1 = -97;
  const sz0 = -545;
  const sz1 = -520;
  const scx = (sx0 + sx1) / 2;
  const scz = (sz0 + sz1) / 2;
  b.box(scx, 0, scz, sx1 - sx0, 1.4, sz1 - sz0, deck);
  b.box(sx1 + 0.9, 0, scz, 1.8, 0.7, 6, deck);
  for (const x of [sx0 + 0.4, sx1 - 0.4]) {
    for (const z of [sz0 + 0.4, sz1 - 0.4]) {
      bits.push(mesh(new THREE.BoxGeometry(0.6, 11, 0.6), truss, x, 5.5, z));
      b.collider(x - 0.35, x + 0.35, z - 0.35, z + 0.35, 0, 11, true);
    }
  }
  for (let x = sx0 + 0.4; x <= sx1; x += 3.65) bits.push(mesh(new THREE.BoxGeometry(0.4, 0.4, sz1 - sz0), truss, x, 10.2, scz));
  for (let z = sz0 + 0.4; z <= sz1; z += 4.1) bits.push(mesh(new THREE.BoxGeometry(sx1 - sx0, 0.4, 0.4), truss, scx, 10.2, z));
  for (const z of [sz0 + 2, sz1 - 2]) for (let i = 0; i < 6; i++) bits.push(mesh(new THREE.BoxGeometry(1.1, 0.55, 0.8), mat(0x15161a, 0.6), sx1 - 1.5, 9.4 - i * 0.6, z));
  bits.push(mesh(new THREE.BoxGeometry(0.4, 7, 20), mat(0x0d0e12, 0.4, 0.3), sx0 + 0.6, 5, scz));
  for (let i = 0; i < 7; i++) bits.push(mesh(new THREE.BoxGeometry(1.2, 0.9, 0.8), mat([0x1a1a1e, 0x2a2a30, 0x3a3020][i % 3], 0.5, 0.3), sx0 + 3 + (i % 4) * 2.2, 1.85, sz0 + 3 + Math.floor(i / 4) * 1.4));
  b.box(scx, 10.6, scz, sx1 - sx0 + 1, 0.5, sz1 - sz0 + 1, mat(0x111214, 0.8));
  const scaffold = mat(0x7d838c, 0.45, 0.7);
  stairs(b, -88.5, -548.5, '-x', 2.6, 11.1, 23, scaffold);
  b.box(-109.5, 10.6, -546.05, 4, 0.5, 2.1, scaffold);
  for (let x = -89; x > -112; x -= 2.9) {
    const top = 11.1 * ((-88.5 - x) / 23) + 1.1;
    bits.push(mesh(new THREE.CylinderGeometry(0.05, 0.05, top, 5), scaffold, x, top / 2, -549.9));
  }
  b.pickup(-104, 11.6, -532, 5, 'Load-Out Crew Roof Stash', false);
  b.zone('Frontier Lot Stage (load-out)', sx0 - 2, sx1 + 2, -551, sz1 + 1);

  // Light towers, containers, porta-potties, semis, cable ramps, dirt piles
  for (const [x, z] of [
    [-40, -530],
    [-90, -500],
    [-90, -566],
    [-136, -528],
  ]) {
    bits.push(mesh(new THREE.BoxGeometry(1.6, 1.2, 3), mat(0xf2c230, 0.5, 0.3), x, 0.9, z));
    bits.push(mesh(new THREE.CylinderGeometry(0.1, 0.12, 8, 6), truss, x, 5.4, z));
    bits.push(mesh(new THREE.BoxGeometry(2.4, 0.2, 0.2), truss, x, 9.3, z));
    for (const dx of [-0.9, -0.3, 0.3, 0.9]) bits.push(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.25), basic(0xfff4d6), x + dx, 9.05, z + 0.2));
    b.collider(x - 0.8, x + 0.8, z - 1.5, z + 1.5, 0, 1.5, true);
  }
  const containers: Array<[number, number, number, number]> = [
    [-132, 0, -492, 0x2a5fa8],
    [-132, 2.6, -492, 0xb3261e],
    [-132, 0, -499, 0x3a6a3a],
    [-140, 0, -558, 0x8a5a2a],
    [-132, 0, -566, 0x6b6f76],
    [-132, 2.6, -566, 0x2a5fa8],
  ];
  for (const [x, y, z, c] of containers) b.box(x, y, z, 2.5, 2.6, 6.1, mat(c, 0.7, 0.3), true);
  for (let i = 0; i < 6; i++) {
    bits.push(mesh(new THREE.BoxGeometry(1.2, 2.3, 1.2), mat(0x2a66cc, 0.6), -60 - i * 1.4, 1.15, -571.5));
    bits.push(mesh(new THREE.BoxGeometry(1.25, 0.12, 1.25), mat(0xeeeeee, 0.6), -60 - i * 1.4, 2.36, -571.5));
  }
  b.collider(-67.8, -59.4, -572.1, -570.9, 0, 2.4, true);
  for (const [x, z] of [
    [-80, -556],
    [-100, -566],
  ]) {
    b.box(x, 1.1, z, 16, 2.8, 2.6, mat(0xf2f2f0, 0.6, 0.2), true);
    b.box(x + 9.6, 0, z, 3, 3.4, 2.6, mat(0x1d3a6b, 0.4, 0.5), true);
    for (const dx of [-6, 5]) for (const s of [-1, 1]) bits.push(part(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10), mat(0x111216, 0.85), x + dx, 0.5, z + s * 1.1, 0, HALF_PI));
  }
  for (let i = 0; i < 5; i++) bits.push(mesh(new THREE.BoxGeometry(0.6, 0.12, 6), mat(0xf2c230, 0.6), -78 + i * 0.9, 0.06, -531));
  for (const [x, z, r] of [
    [-120, -490, 4],
    [-46, -568, 3],
    [-145, -545, 5],
  ]) bits.push(mesh(new THREE.ConeGeometry(r, r * 0.55, 9), mat(0x8d6c4a, 0.97), x, r * 0.27, z));
  mergeAdd(b, bits);
  for (let i = 0; i < 8; i++) {
    const cone = new THREE.Group();
    cone.add(mesh(new THREE.ConeGeometry(0.2, 0.7, 8), mat(0xff6a00, 0.6), 0, 0.35, 0));
    cone.add(mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), mat(0x222222, 0.7), 0, 0.02, 0));
    b.prop(cone, -23 - (i % 4) * 1.8, gate0 - 1 - Math.floor(i / 4) * 6, 0.22, 0.7, 'cone');
  }
  b.zone('Former New Frontier Site (Wynn West)', xW, xE, zN, zS);
  b.crowd.tourists.push({ pts: [[-30, -528], [-70, -526], [-95, -540], [-60, -560]], prop: 'none' });
}

// =============================================================== Resorts World (ex-Stardust)
function buildResortsWorld(b: WorldBuilder): void {
  const zS = zFromS(2025);
  const zN = zFromS(2431);
  b.floor(-42.5, -578.6, 47, 4.4, mat(0x2b2b30, 0.85), 0.015); // Resorts World Ave drive
  plaza(b, -19, -30, zS, zN, '#cdbfae', '#a99a86');

  // Twin curved red/copper glass wings (59 floors)
  const skinA: FacadeSpec = { wall: '#1c0a09', mullion: '#120909', glass: '#5a1210', lit: '#ffd2b0', cols: 10, rows: 30, style: 2, seed: 301 };
  // Red glass, black frames, red LED corners; the giant LED wrap faces the Strip on the south wing
  curvedTower(b, -20, -604, 60, Math.PI * 0.87, Math.PI * 1.13, 5, 14, 60, skinA, 0.7, { rough: 0.2, ledFins: false, edgeLed: 0xff2430, wash: 0xff3030, ledWrap: { y0: 23, y1: 50, face: 'back', dir: [0, 1] } });
  curvedTower(b, -25, -650, 66, Math.PI * 0.88, Math.PI * 1.12, 5, 14, 64, { ...skinA, glass: '#4e0e0c', seed: 303 }, 0.7, { rough: 0.2, ledFins: false, edgeLed: 0xff2430, wash: 0xff3030 });
  b.add(neonSign('RESORTS WORLD', '#140404', '#ff4a3a', 16, 2.4), -72.6, 55, -604, HALF_PI);
  b.add(neonSign('RESORTS WORLD', '#140404', '#ffffff', 16, 2.4), -83.6, 59, -650, HALF_PI);

  // Podium + the giant LED wall facing the Strip
  b.box(-48, 0, -628, 36, 22, 80, mat(0x4a1612, 0.35, 0.55), true);
  b.add(mesh(new THREE.BoxGeometry(36.6, 1.2, 80.6), mat(0xb87333, 0.3, 0.8), -48, 21.6, -628));
  b.add(mesh(new THREE.BoxGeometry(0.3, 2.4, 79), glassGlow(b, 0x2a1410, 0xffc890, 1.4), -29.9, 1.2, -628));
  const wallLed = new LedBoard('RESORTS WORLD', ['HILTON • CONRAD • CROCKFORDS', 'ZOUK NIGHTCLUB • TONIGHT', 'FAMOUS FOODS STREET EATS', 'THEATRE • LIVE THIS WEEKEND', 'AYU DAYCLUB • HEATED POOLS'], ['#d0142c', '#ff7a00', '#b0005a', '#ffb000', '#7a2cff'], 512, 256);
  b.add(part(new THREE.PlaneGeometry(40, 17.5), new THREE.MeshBasicMaterial({ map: wallLed.tex }), -29.7, 11.2, -628, HALF_PI));
  b.add(mesh(new THREE.BoxGeometry(0.4, 18.2, 40.8), mat(0x111114, 0.5, 0.4), -29.95, 11.2, -628));
  b.every((_dt, t) => wallLed.draw(t + 1));
  for (const z of [-597, -659]) {
    b.add(mesh(new THREE.BoxGeometry(5, 0.4, 9), mat(0x2a1a16, 0.4, 0.6), -27.5, 4.4, z, true));
    b.add(mesh(new THREE.BoxGeometry(4.7, 0.05, 8.6), basic(0xffe6c8), -27.5, 4.17, z));
    b.add(mesh(new THREE.BoxGeometry(0.12, 0.5, 9.1), basic(0xff4a3a), -25.0, 4.4, z));
  }
  const pylonLed = new LedBoard('RESORTS WORLD', ['LAS VEGAS', 'CASINO • HOTELS • DINING', 'ZOUK • AYU', '24/7'], ['#e0102a', '#ff6a00', '#b0005a', '#ffb000']);
  ledPylon(b, pylonLed, -21.4, -588, 18, 7, 0x3a1410);

  // Red lanterns + palms down the plaza
  const red = basic(0xff2a1a);
  const gold = mat(0xd4a640, 0.3, 0.8);
  const post = mat(0x2a1a16, 0.5, 0.5);
  const deco: THREE.Object3D[] = [];
  for (let z = zS - 10; z > zN + 6; z -= 9) {
    if (Math.abs(z + 597) < 5 || Math.abs(z + 659) < 5) continue;
    deco.push(mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6), post, -27.8, 2.1, z));
    deco.push(mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), post, -27.2, 4.15, z));
    const lan = mesh(new THREE.SphereGeometry(0.42, 10, 8), red, -26.7, 3.55, z);
    lan.scale.y = 0.85;
    deco.push(lan, mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8), gold, -26.7, 3.95, z), mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), gold, -26.7, 2.95, z));
    b.collider(-28, -27.6, z - 0.2, z + 0.2, 0, 4.2, true);
  }
  for (const z of [-604, -620, -636, -652, -667]) deco.push(place(palmTree(7.6, false, Math.round(-z)), -23.3, 0, z));
  deco.push(place(planter(2.2, 1.6, 0xff3a2a), -27, 0, -604));
  b.collider(-28.1, -25.9, -604.8, -603.2, 0, 0.6);
  mergeAdd(b, deco);
  b.pickup(-27, 1.05, -604, 3, 'Famous Foods Street Eats Pack', false);

  // North lot toward the Adventuredome
  parkingLot(b, -24, -130, -677.5, -695.8);
  parkCars(b, stallSpots(-24, -130, -677.5, -695.8), 3, 1);
  b.floor(-21.7, -684, 4.6, 23.4, mat(0x5f7d45, 0.95), 0.018);
  b.add(neonSign('ADVENTUREDOME', '#2a0a1e', '#ff7ac8', 6, 1.3, 'INDOOR THEME PARK THIS WAY', 0.12), -21.4, 4.4, -684, HALF_PI);
  b.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.8, 6), mat(0x2a2c32, 0.4, 0.6)), -21.4, 1.9, -684);
  b.zone('Adventuredome Parking', -130, -19, -696, -672);

  b.building(-48, -628, 36, 80, '#4a1612', 'Resorts World');
  b.building(-80, -604, 14, 48, '#7a2418');
  b.building(-91, -650, 14, 50, '#8a3020');
  b.zone('Resorts World Las Vegas', -130, -19, -672, -576.3);
  b.crowd.tourists.push({ pts: [[-22.5, -590], [-27, -664]], prop: 'camera' }, { pts: [[-28, -668], [-22, -584]], prop: 'yard-drink' }, { pts: [[-30, -690], [-110, -690]], prop: 'bag' });
}

// =============================================================== Slots-A-Fun (Lou's favourite dive)
function slotsSignTexture(): THREE.CanvasTexture {
  return canvasTex(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, '#ff5040');
    g.addColorStop(1, '#a8100c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(128, 128, 104, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 66px "Arial Black", Impact, sans-serif';
    ctx.fillText('SLOTS', 128, 100, 196);
    ctx.font = 'bold 56px "Arial Black", Impact, sans-serif';
    ctx.fillText("A' FUN", 128, 162, 190);
  });
}

function buildSlotsAFun(b: WorldBuilder): void {
  const minX = -46;
  const maxX = -24.5;
  const minZ = -712;
  const maxZ = -697;
  buildCasinoFloor(b, {
    id: 'slotsafun',
    casinoName: 'Slots-A-Fun',
    minX,
    maxX,
    minZ,
    maxZ,
    height: 7,
    entrance: { side: 'east', at: -704.5, width: 6 },
    // Low drop ceiling, worn busy carpet, cheap bright signs and the giant novelty slot at the back
    theme: 'slotsafun',
    interior: { ceilingY: 4.2, giantSlot: [-44.85, -704.8, HALF_PI], cashier: false, sportsbook: false, highLimit: false, bar: false, columns: false, fill: 0.5 },
    carpet: ['#5a0c10', '#ffc93a', '#1e5bd8'],
    wall: 0xb3161e,
    ceiling: 0x2a0a0c,
    ceilingGlow: 0x6a1010,
    light: 0xffc27a,
    slots: {
      accent: '#ffcc33',
      topper: 0xff2a2a,
      rows: [
        { x: -38.5, z: -698.6, count: 12, along: 'x', facing: Math.PI },
        { x: -38.5, z: -710.4, count: 12, along: 'x', facing: 0 },
        { x: -38.8, z: -705.3, count: 7, along: 'x', facing: Math.PI },
        { x: -38.8, z: -704.3, count: 7, along: 'x', facing: 0 },
      ],
    },
    slotLabel: 'Slots-A-Fun Nickel Slots (coin-in, coin-out, clatter included)',
    tables: [],
    felt: 0x0f4a2a,
    guard: { kick: [-16.5, -704.5] },
    pickups: [
      { x: -29.2, z: -701.4, y: 1.35, amount: 6, label: "Lou's Favorite Dive: $2 Beer Bar Stash!" },
      { x: -44.6, z: -711, amount: 3, label: 'Coin-Cup Smokes (Slots-A-Fun)' },
    ],
    tourists: [{ pts: [[-27, -702.2], [-43.5, -702.2], [-43.5, -707.6], [-27, -707.6]], prop: 'yard-drink' }],
  });

  // $2 beer bar + hot-dog counter
  b.add(barCounter(5, 0x1a1a1a, 0x7a1010), -29.2, 0, -700.4, HALF_PI);
  b.collider(-29.6, -28.8, -702.9, -697.9, 0, 1.15, true);
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(-27.4, 0, -700.4), radius: 2.4, label: 'Slots-A-Fun $2 Beer Bar' });
  b.add(neonSign('$2 BEER', '#1a0505', '#ffd23a', 3.4, 0.9, 'HOT DOGS • 24/7', 0.08), -29.2, 4.6, -700.4, HALF_PI);
  b.box(-27.6, 0, -710.4, 3.4, 1.0, 1.1, mat(0xd9d4c8, 0.4, 0.4), true);
  const grill: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) grill.push(part(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), mat(0xa8552a, 0.6), -28.8 + i * 0.45, 1.08, -710.4, 0, HALF_PI));
  grill.push(mesh(new THREE.BoxGeometry(3.0, 0.05, 0.9), mat(0x9aa0a8, 0.3, 0.8), -27.6, 1.02, -710.4));
  mergeAdd(b, grill, false);
  b.add(neonSign('HOT DOGS', '#1a0505', '#ffd23a', 2.6, 0.6, undefined, 0.06), -27.6, 2.6, -711.2);

  // Facade sign over the doors
  b.add(neonSign('SLOTS-A-FUN', '#b3161e', '#ffffff', 11, 1.0, undefined, 0.2), -23.0, 5.45, -704.5, HALF_PI);

  // The iconic round polished-aluminium sign cabinet on its pole
  const px = -20.9;
  const pz = -697.6;
  const cy = 10.4;
  const alu = mat(0xd9dde2, 0.18, 0.95);
  b.add(mesh(new THREE.CylinderGeometry(0.28, 0.34, cy - 3, 12), alu, px, (cy - 3) / 2, pz, true));
  b.collider(px - 0.35, px + 0.35, pz - 0.35, pz + 0.35, 0, cy, true);
  b.add(part(new THREE.CylinderGeometry(3.2, 3.2, 0.9, 48), alu, px, cy, pz, 0, 0, HALF_PI));
  b.add(part(new THREE.TorusGeometry(3.2, 0.16, 8, 48), alu, px, cy, pz, HALF_PI));
  const faceTex = slotsSignTexture();
  for (const s of [-1, 1]) b.add(part(new THREE.CircleGeometry(2.98, 48), new THREE.MeshBasicMaterial({ map: faceTex }), px + s * 0.46, cy, pz, s * HALF_PI));
  const bulbA = new THREE.MeshBasicMaterial({ color: 0xfff1b0 });
  const bulbB = new THREE.MeshBasicMaterial({ color: 0xfff1b0 });
  const bulbs: THREE.Object3D[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    for (const s of [-1, 1]) bulbs.push(mesh(new THREE.SphereGeometry(0.1, 6, 4), i % 2 ? bulbA : bulbB, px + s * 0.5, cy + Math.cos(a) * 3.38, pz + Math.sin(a) * 3.38));
  }
  mergeAdd(b, bulbs, false);
  b.add(neonSign('$2 BEER • HOT DOG', '#140404', '#ffd23a', 5.6, 1.3, 'LOOSEST SLOTS ON THE STRIP', 0.25), px, 6.0, pz, HALF_PI);
  b.every((_dt, t, night) => {
    const on = Math.floor(t * 6) % 2 === 0;
    const hi = 0.55 + night * 0.45;
    bulbA.color.setRGB(1, 0.94, 0.68).multiplyScalar(on ? hi : 0.25);
    bulbB.color.setRGB(1, 0.94, 0.68).multiplyScalar(on ? 0.25 : hi);
  });

  b.building((minX + maxX) / 2, (minZ + maxZ) / 2, maxX - minX, maxZ - minZ, '#b3161e', 'Slots-A-Fun');
  b.staticMarkers.push({ x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, color: '#ff3a3a', glyph: '$', size: 2.6 });
  b.zone("Slots-A-Fun (Lou's favourite dive)", maxX, -19, minZ, maxZ + 1);
}

// =============================================================== Circus Circus
/** The Lucky sign's CIRCUS CIRCUS marquee face: pink bulb-socket border, cream field, fat circus caps (neon unlit). */
function luckyMarqueeTexture(): THREE.CanvasTexture {
  return canvasTex(1024, 384, (ctx) => {
    ctx.fillStyle = '#e8508e';
    ctx.fillRect(0, 0, 1024, 384);
    ctx.fillStyle = '#f6efe6';
    ctx.fillRect(34, 34, 956, 316);
    ctx.strokeStyle = '#d4a640';
    ctx.lineWidth = 6;
    ctx.strokeRect(40, 40, 944, 304);
    for (let x = 17; x < 1024; x += 26) {
      for (const y of [17, 367]) {
        ctx.fillStyle = '#3a3632';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a8478';
        ctx.beginPath();
        ctx.arc(x - 2, y - 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let y = 43; y < 350; y += 26) {
      for (const x of [17, 1007]) {
        ctx.fillStyle = '#3a3632';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // stars either side
    const star = (x: number, y: number, r: number, c: string) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.fill();
    };
    star(92, 160, 34, '#1c4fc8');
    star(932, 160, 34, '#1c4fc8');
    // the lettering: fat wedge-serif caps, dark-red shadow + outline, hot-pink fill, pale (unlit) neon inline
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 132px "Rockwell Extra Bold", Rockwell, Clarendon, "Bookman Old Style", Georgia, serif';
    ctx.fillStyle = 'rgba(80,10,30,0.55)';
    ctx.fillText('CIRCUS CIRCUS', 518, 168, 760);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#6a0a1e';
    ctx.lineWidth = 16;
    ctx.strokeText('CIRCUS CIRCUS', 512, 160, 760);
    ctx.fillStyle = '#e8237a';
    ctx.fillText('CIRCUS CIRCUS', 512, 160, 760);
    ctx.strokeStyle = '#f6d6e2';
    ctx.lineWidth = 4;
    ctx.strokeText('CIRCUS CIRCUS', 512, 157, 760);
    ctx.font = 'bold 40px Georgia, serif';
    ctx.fillStyle = '#1c4fc8';
    ctx.fillText('HOTEL ★ CASINO ★ ADVENTUREDOME', 512, 290, 700);
    // sun-bleaching and grime streaks
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(70,55,45,${0.04 + (i % 4) * 0.025})`;
      ctx.fillRect((i * 67) % 980 + 34, 34, 3 + (i % 3), 40 + ((i * 29) % 200));
    }
  });
}

function buildCircusCircus(b: WorldBuilder): void {
  const southOfDr = Z_CCDR + 9.3;
  const northOfDr = Z_CCDR - 9.3;
  const ccSkin: FacadeSpec = { wall: '#f7eef2', mullion: '#ffffff', glass: '#d2477f', lit: '#ffd0e6', cols: 10, rows: 22, style: 1, seed: 401 };

  // South casino wing at the frontage (Slots-A-Fun side of Circus Circus Dr)
  const wz0 = -713;
  const wz1 = southOfDr - 0.1;
  const wzc = (wz0 + wz1) / 2;
  const wd = wz0 - wz1;
  // the south wing is the walk-through Promenade (shops + arcade) to the Adventuredome
  buildPromenade(b, { x0: -82, x1: -20.5, z0: wz1, z1: wz0, h: 9, eastDoorZ: wzc, westDoorZ: -717.7, domeX: -87.6 });
  b.add(mesh(new THREE.BoxGeometry(3.2, 0.4, 7.5), mat(0xf2c230, 0.5, 0.2), -19.0, 4.65, wzc, true));
  b.add(mesh(new THREE.BoxGeometry(3.0, 0.05, 7.2), basic(0xfff0c8), -19.0, 4.43, wzc));
  b.add(mesh(new THREE.BoxGeometry(1.0, 1.1, wd - 0.6), new THREE.MeshStandardMaterial({ map: stripeTexture('#ff5fa2', '#fbf4f6', 14), roughness: 0.6 }), -20.1, 4.4, wzc));
  b.add(neonSign('CIRCUS CIRCUS', '#fff6fa', '#e8237a', 11, 2.0, 'CASINO • MIDWAY • ADVENTUREDOME', 0.25), -20.25, 7.0, wzc, HALF_PI);
  b.add(mesh(new THREE.BoxGeometry(62, 0.6, wd), mat(0xffffff, 0.6), -51.25, 9.3, wzc));
  tower(b, { x: -64, z: -704.5, w: 29, d: 12, h: 24, facade: ccSkin, accent: 0xff4fa8 });
  b.building(-51.25, wzc, 61.5, wd, '#e85a9a', 'Circus Circus');
  b.building(-64, -704.5, 29, 12, '#f7eef2');

  // North of the drive: the big top + the Skyrise tower
  const skyX = xFromO(-330);
  tower(b, { x: skyX, z: -769, w: 16, d: 34, h: 34, facade: { ...ccSkin, seed: 403 }, accent: 0xff4fa8 });
  b.add(neonSign('CIRCUS CIRCUS', '#fff4f8', '#ff2f8a', 13, 2.4), skyX + 8.3, 30.5, -769, HALF_PI);
  b.building(skyX, -769, 16, 34, '#f7eef2', 'Skyrise');

  // ---- The big top: a walk-in round casino under the striped tent (interior: circusInterior.ts) ----
  const btx = -44;
  const btz = -767;
  const R = 18;
  const wallH = 10;
  const coneH = 12;
  const doorW = 8;
  const dHalf = doorW / 2 / R;
  const shellMat = mat(0xf7f1f3, 0.6);
  // outer wall with the Strip-side doorway cut out, and the curved lintel over it
  b.add(mesh(new THREE.CylinderGeometry(R, R, wallH, 64, 1, true, HALF_PI + dHalf, Math.PI * 2 - dHalf * 2), shellMat, btx, wallH / 2, btz, true));
  b.add(mesh(new THREE.CylinderGeometry(R, R, wallH - 4.6, 6, 1, true, HALF_PI - dHalf, dHalf * 2), shellMat, btx, 4.6 + (wallH - 4.6) / 2, btz));
  const bandTex = canvasTex(1024, 64, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1024, 64);
    ctx.fillStyle = '#ff4f98';
    ctx.fillRect(0, 0, 1024, 26);
    for (let x = 0; x < 1024; x += 32) {
      ctx.beginPath();
      ctx.arc(x + 16, 26, 16, 0, Math.PI);
      ctx.fill();
    }
  });
  b.add(mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 1.4, 48, 1, true), new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.6 }), btx, wallH - 0.7, btz));
  b.add(mesh(new THREE.ConeGeometry(R + 2.4, coneH, 48, 1, true), new THREE.MeshStandardMaterial({ map: stripeTexture('#ff5fa2', '#fbf4f6', 32), roughness: 0.55 }), btx, wallH + coneH / 2, btz, true));
  // eave bulbs (lit at night, the big top's string of lights)
  const eaveBulb = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffd890, emissiveIntensity: 0.1, roughness: 0.4 }), 0.1, 2.4);
  const eave: THREE.Object3D[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    eave.push(mesh(new THREE.SphereGeometry(0.13, 6, 4), eaveBulb, btx + Math.cos(a) * (R + 2.35), wallH - 0.05, btz + Math.sin(a) * (R + 2.35)));
  }
  mergeAdd(b, eave, false);
  const top: THREE.Object3D[] = [];
  const apexY = wallH + coneH;
  top.push(mesh(new THREE.CylinderGeometry(1.3, 1.6, 1.8, 16), mat(0xff4f98, 0.5), btx, apexY + 0.1, btz));
  top.push(mesh(new THREE.ConeGeometry(1.6, 1.6, 16), mat(0xffffff, 0.5), btx, apexY + 1.8, btz));
  top.push(mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), mat(0xd4a640, 0.3, 0.8), btx, apexY + 4.5, btz));
  top.push(mesh(new THREE.BoxGeometry(0.05, 0.9, 1.6), mat(0xe8237a, 0.6), btx, apexY + 5.9, btz + 0.8));
  const flagMats = [mat(0xd8202a, 0.6), mat(0xf2c230, 0.6), mat(0x2a66cc, 0.6), mat(0xffffff, 0.6)];
  const apex = new THREE.Vector3(btx, apexY - 0.5, btz);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.31;
    const end = new THREE.Vector3(btx + Math.cos(a) * (R + 2.2), wallH + 0.4, btz + Math.sin(a) * (R + 2.2));
    top.push(rod(apex, end, 0.03, mat(0x333333, 0.6)));
    for (let i = 1; i <= 7; i++) {
      const p = apex.clone().lerp(end, i / 8);
      top.push(part(new THREE.ConeGeometry(0.3, 0.7, 3), flagMats[(i + k) % 4], p.x, p.y - 0.4, p.z, a, Math.PI));
    }
  }
  // Strip-side entrance: pink pylons with gold balls, a header, and the porte-cochère marquee canopy
  const ex = btx + R;
  const pinkM = mat(0xe8237a, 0.55);
  const goldM = mat(0xf2c230, 0.4, 0.3);
  for (const s of [-1, 1]) {
    top.push(mesh(new THREE.BoxGeometry(1.6, 7.6, 1.4), pinkM, ex + 0.2, 3.8, btz + s * (doorW / 2 + 0.7)));
    top.push(mesh(new THREE.SphereGeometry(0.6, 12, 8), goldM, ex + 0.2, 8.2, btz + s * (doorW / 2 + 0.7)));
    b.collider(ex - 0.6, ex + 1.0, btz + s * (doorW / 2 + 0.7) - 0.7, btz + s * (doorW / 2 + 0.7) + 0.7, 0, 7.6, true);
  }
  top.push(mesh(new THREE.BoxGeometry(1.3, 2.6, doorW + 2.8), pinkM, ex + 0.2, 6.1, btz));
  // canopy (yellow marquee with a lit underside), two slim posts
  const canW = doorW + 7;
  top.push(mesh(new THREE.BoxGeometry(6.4, 0.55, canW), goldM, ex + 3.4, 5.05, btz, true));
  for (const s of [-1, 1]) {
    top.push(mesh(new THREE.CylinderGeometry(0.14, 0.16, 4.8, 8), mat(0xd4a640, 0.3, 0.8), ex + 6.2, 2.4, btz + s * (canW / 2 - 0.6)));
    b.collider(ex + 6.05, ex + 6.35, btz + s * (canW / 2 - 0.6) - 0.15, btz + s * (canW / 2 - 0.6) + 0.15, 0, 4.8, true);
  }
  mergeAdd(b, top);
  b.add(mesh(new THREE.BoxGeometry(6.0, 0.05, canW - 0.4), basic(0xfff0c8), ex + 3.4, 4.76, btz));
  b.add(neonSign('CIRCUS CIRCUS', '#fff2f6', '#e81f78', 11, 2.2, 'CASINO • MIDWAY • FREE CIRCUS ACTS', 0.25), ex + 6.75, 6.45, btz, HALF_PI);
  b.add(neonSign('CIRCUS CIRCUS', '#fff2f6', '#e81f78', 9, 1.9), ex + 0.95, 6.2, btz, HALF_PI);
  // glass doors swung open against the pylons, a warm air-curtain glow, a red runner to the sidewalk
  const doorGlass = new THREE.MeshStandardMaterial({ color: 0xbfdcea, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  for (const s of [-1, 1]) for (const k of [0, 1]) b.add(mesh(new THREE.BoxGeometry(1.6, 3.6, 0.05), doorGlass, ex + 1.1 + k * 0.06, 1.85, btz + s * (doorW / 2 - 0.15 - k * 0.1)));
  const curtainTex = canvasTex(4, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,200,230,0)');
    g.addColorStop(1, 'rgba(255,210,235,0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 64);
  });
  b.add(part(new THREE.PlaneGeometry(doorW, 4.4), new THREE.MeshBasicMaterial({ map: curtainTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), ex + 0.05, 2.2, btz, HALF_PI));
  b.add(mesh(new THREE.BoxGeometry(8, 0.03, 3.6), mat(0x7a0f1a, 0.95), ex + 4, 0.045, btz));
  b.feature({ kind: 'building', x: btx, z: btz, w: R * 2, d: R * 2, color: '#ff5fa2', label: 'Big Top Casino + Midway' });
  buildBigTopInterior(b, { cx: btx, cz: btz, R, wallH, coneH, doorW });
  bigTopLight(b, btx, btz);

  // ---- Lucky the Clown (1976, 123 ft, YESCO) — completely dark since summer 2026, electrics fried ----
  // A faithful dark replica: twin candy-striped pylons with bulb rows, the 2008 LED reader cabinet
  // (dead), the CIRCUS CIRCUS marquee with its scalloped big-top crown and bulb border, and Lucky on
  // top: balancing on a star ball, waving, holding his giant swirl lollipop. Nothing lights except
  // one bulb that still flickers, and the repair crew's work lamp.
  const lx = -25.6;
  const lz = -749.6;
  const sign = new THREE.Group();
  const signParts: THREE.Object3D[] = [];
  const S = (o: THREE.Object3D) => {
    sign.add(o);
    return o;
  };
  const pinkS = mat(0xe8508e, 0.6);
  const whiteS = mat(0xf2ece6, 0.6);
  const bulbS = mat(0x6a645c, 0.3, 0.2);
  const socketS = mat(0x3a3632, 0.6, 0.4);
  // plinth + twin pylons, candy-striped with rows of bulbs (dark)
  S(mesh(new THREE.BoxGeometry(9.4, 1.2, 3.0), mat(0xc8a0a8, 0.85), 0, 0.6, 0));
  for (const x of [-3.3, 3.3]) {
    for (let j = 0; j < 9; j++) S(mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), j % 2 ? whiteS : pinkS, x, 1.65 + j * 0.9, 0));
    for (let j = 0; j < 20; j++) for (const zz of [-0.62, 0.62]) S(mesh(new THREE.SphereGeometry(0.08, 6, 4), bulbS, x, 1.5 + j * 0.4, zz));
  }
  // LED reader cabinet (2008), three dead panels each face
  S(mesh(new THREE.BoxGeometry(10.2, 4.4, 1.1), mat(0x2a2a30, 0.5, 0.4), 0, 6.3, 0));
  S(mesh(new THREE.BoxGeometry(10.5, 0.3, 1.25), pinkS, 0, 8.6, 0));
  S(mesh(new THREE.BoxGeometry(10.5, 0.3, 1.25), pinkS, 0, 4.0, 0));
  const ledTex = canvasTex(256, 128, (ctx) => {
    ctx.fillStyle = '#08080b';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#17171d';
    for (let y = 2; y < 128; y += 4) for (let x = 2; x < 256; x += 4) ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = 'rgba(60,20,30,0.5)';
    for (let i = 0; i < 9; i++) ctx.fillRect((i * 53) % 250, (i * 37) % 120, 2, 2);
  });
  const ledM = new THREE.MeshStandardMaterial({ map: ledTex, roughness: 0.25, metalness: 0.4 });
  for (const zz of [-0.56, 0.56]) for (const x of [-3.25, 0, 3.25]) S(part(new THREE.PlaneGeometry(3.05, 3.7), ledM, x, 6.3, zz, zz < 0 ? Math.PI : 0));
  // vinyl "lights out" banner zip-tied across the middle panel, facing the Strip
  const banner = printedSign("LUCKY'S LIGHTS ARE OUT", '#f4efe4', '#b01818', 'SIGN REPAIR BIDS OPEN • HE WILL RETURN', 5.6, 1.5, 0.02);
  b.add(banner, lx + 0.62, 6.6, lz, HALF_PI);
  // the CIRCUS CIRCUS marquee: scalloped crown, bulb border, letters with unlit neon
  const marqueeTex = luckyMarqueeTexture();
  const mFace = new THREE.MeshStandardMaterial({ map: marqueeTex, roughness: 0.7 });
  S(mesh(new THREE.BoxGeometry(12.4, 4.6, 1.4), pinkS, 0, 11.2, 0));
  for (const zz of [-0.705, 0.705]) S(part(new THREE.PlaneGeometry(12.2, 4.4), mFace, 0, 11.2, zz, zz < 0 ? Math.PI : 0));
  for (let i = 0; i < 12; i++) {
    for (const zz of [-0.72, 0.72]) {
      const sc = S(part(new THREE.CircleGeometry(0.52, 16, 0, Math.PI), i % 2 ? whiteS : pinkS, -5.7 + i * 1.04, 13.5, zz, zz < 0 ? Math.PI : 0));
      void sc;
    }
  }
  S(mesh(new THREE.BoxGeometry(12.6, 0.22, 1.5), mat(0xd4a640, 0.35, 0.8), 0, 13.55, 0));
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const per = 2 * (12.0 + 4.2);
    let d = t * per;
    let bx: number;
    let by: number;
    if (d < 12) [bx, by] = [-6 + d, 13.2];
    else if ((d -= 12) < 4.2) [bx, by] = [6, 13.2 - d];
    else if ((d -= 4.2) < 12) [bx, by] = [6 - d, 9.0];
    else [bx, by] = [-6, 9.0 + (d - 12)];
    for (const zz of [-0.74, 0.74]) S(mesh(new THREE.SphereGeometry(0.11, 6, 4), bulbS, bx, by, zz));
  }
  // Lucky's star ball
  const ballTex = canvasTex(512, 256, (ctx) => {
    const bands = ['#d0122e', '#ffffff', '#1c4fc8', '#ffffff', '#d0122e'];
    bands.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, (i * 256) / 5, 512, 256 / 5 + 1);
    });
    ctx.fillStyle = '#ffd23a';
    for (let i = 0; i < 10; i++) {
      const x = 25 + i * 51;
      const y = 128;
      ctx.beginPath();
      for (let q = 0; q < 10; q++) {
        const a = -Math.PI / 2 + (q * Math.PI) / 5;
        const r = q % 2 ? 7 : 17;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.fill();
    }
  });
  S(mesh(new THREE.SphereGeometry(1.7, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.5 }), 0.4, 15.35, 0));
  // Lucky himself (feet at y 16.9): striped suit, ruffle, white face, red nose, big smile, orange hair,
  // little star hat, waving right glove, giant swirl lollipop in the left hand
  const L0 = 16.95;
  const suitTex = stripeTexture('#ff4f98', '#fbf6f2', 14);
  const suitM = new THREE.MeshStandardMaterial({ map: suitTex, roughness: 0.65 });
  const faceM = mat(0xfff4ee, 0.55);
  const redM = mat(0xd8101e, 0.35, 0.1);
  const glove = mat(0xffffff, 0.6);
  const hairM = mat(0xff6a1a, 0.85);
  const blueM = mat(0x1c4fc8, 0.5);
  const yellowM = mat(0xffd23a, 0.5);
  for (const s of [-1, 1]) {
    const shoe = S(mesh(new THREE.SphereGeometry(0.55, 14, 10), redM, s * 0.65, L0 + 0.3, 0.45));
    shoe.scale.set(0.85, 0.55, 1.6);
    S(mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.4, 14), suitM, s * 0.6, L0 + 1.7, 0));
  }
  const body = S(mesh(new THREE.SphereGeometry(1.55, 20, 16), suitM, 0, L0 + 4.1, 0));
  body.scale.set(1, 1.22, 0.85);
  for (const [y, z] of [
    [L0 + 4.9, 1.2],
    [L0 + 4.2, 1.3],
    [L0 + 3.5, 1.24],
  ]) S(mesh(new THREE.SphereGeometry(0.26, 10, 8), yellowM, 0, y, z));
  const ruff = S(part(new THREE.TorusGeometry(1.05, 0.42, 10, 24), whiteS, 0, L0 + 5.85, 0, 0, HALF_PI));
  void ruff;
  S(part(new THREE.TorusGeometry(1.42, 0.08, 6, 24), pinkS, 0, L0 + 5.85, 0, 0, HALF_PI));
  S(mesh(new THREE.SphereGeometry(1.35, 22, 16), faceM, 0, L0 + 7.3, 0));
  S(mesh(new THREE.SphereGeometry(0.38, 14, 10), redM, 0, L0 + 7.15, 1.33));
  S(part(new THREE.TorusGeometry(0.62, 0.12, 8, 18, Math.PI), redM, 0, L0 + 6.95, 1.12, 0, -0.25, Math.PI));
  S(part(new THREE.CircleGeometry(0.5, 16, Math.PI, Math.PI), mat(0xb0101e, 0.6), 0, L0 + 6.72, 1.2, 0, -0.35));
  for (const s of [-1, 1]) {
    const dia = S(part(new THREE.SphereGeometry(0.28, 4, 2), blueM, s * 0.48, L0 + 7.65, 1.15, 0, 0, 0));
    dia.scale.set(0.6, 1.2, 0.3);
    S(mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0x101010, 0.4), s * 0.48, L0 + 7.62, 1.26));
    S(mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0xff8aa8, 0.6), s * 0.82, L0 + 7.0, 1.0)).scale.set(1, 0.7, 0.4);
    for (const [hx, hy, hz, hr] of [
      [1.3, 7.35, -0.1, 0.5],
      [1.05, 8.0, -0.35, 0.45],
      [1.45, 6.75, -0.15, 0.4],
    ]) S(mesh(new THREE.SphereGeometry(hr, 10, 8), hairM, s * hx, L0 + hy, hz));
  }
  // little star hat, tipped
  S(part(new THREE.ConeGeometry(0.62, 1.7, 16), blueM, 0.3, L0 + 9.15, -0.15, 0, 0, -0.28));
  S(mesh(new THREE.SphereGeometry(0.22, 10, 8), yellowM, 0.55, L0 + 10.0, -0.15));
  S(part(new THREE.TorusGeometry(0.62, 0.08, 6, 16), yellowM, 0.08, L0 + 8.4, -0.15, 0, HALF_PI, 0.28));
  // waving right arm (raised), open glove
  const sh = new THREE.Vector3(1.35, L0 + 5.3, 0.1);
  const el = new THREE.Vector3(2.35, L0 + 6.5, 0.35);
  const wr = new THREE.Vector3(2.65, L0 + 7.9, 0.5);
  S(rod(sh, el, 0.34, suitM));
  S(rod(el, wr, 0.3, suitM));
  S(mesh(new THREE.SphereGeometry(0.46, 12, 10), glove, wr.x + 0.05, wr.y + 0.35, wr.z));
  for (let f = 0; f < 4; f++) {
    const a = -0.6 + f * 0.4;
    S(rod(new THREE.Vector3(wr.x + 0.05, wr.y + 0.55, wr.z), new THREE.Vector3(wr.x + 0.05 + Math.sin(a) * 0.75, wr.y + 0.55 + Math.cos(a) * 0.75, wr.z + 0.05), 0.11, glove));
  }
  S(rod(new THREE.Vector3(wr.x - 0.25, wr.y + 0.3, wr.z), new THREE.Vector3(wr.x - 0.7, wr.y + 0.55, wr.z + 0.15), 0.12, glove));
  // left arm out to the giant lollipop
  const sh2 = new THREE.Vector3(-1.35, L0 + 5.3, 0.1);
  const hd2 = new THREE.Vector3(-2.55, L0 + 5.6, 0.75);
  S(rod(sh2, hd2, 0.34, suitM));
  S(mesh(new THREE.SphereGeometry(0.44, 12, 10), glove, hd2.x, hd2.y, hd2.z));
  S(rod(new THREE.Vector3(hd2.x, hd2.y - 0.4, hd2.z), new THREE.Vector3(hd2.x - 0.1, hd2.y + 2.7, hd2.z), 0.09, whiteS));
  const lolliTex = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#fff6f0';
    ctx.beginPath();
    ctx.arc(128, 128, 126, 0, Math.PI * 2);
    ctx.fill();
    const cols = ['#e8237a', '#ffd23a', '#1c4fc8', '#7ad84a'];
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = cols[i];
      ctx.lineWidth = 16;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 6; a += 0.05) {
        const r = 4 + a * 6.2;
        const aa = a + (i * Math.PI) / 2;
        ctx.lineTo(128 + Math.cos(aa) * r, 128 + Math.sin(aa) * r);
      }
      ctx.stroke();
    }
  });
  const lolliM = new THREE.MeshStandardMaterial({ map: lolliTex, roughness: 0.3 });
  for (const s of [-1, 1]) S(part(new THREE.CircleGeometry(1.25, 32), lolliM, hd2.x - 0.1, hd2.y + 3.9, hd2.z + s * 0.16, s < 0 ? Math.PI : 0));
  S(part(new THREE.CylinderGeometry(1.25, 1.25, 0.3, 32, 1, true), whiteS, hd2.x - 0.1, hd2.y + 3.9, hd2.z, 0, HALF_PI));
  sign.position.set(lx, 0, lz);
  sign.rotation.y = HALF_PI;
  signParts.push(sign);
  mergeAdd(b, signParts);
  b.collider(lx - 0.7, lx + 0.7, lz - 4.7, lz + 4.7, 0, 1.2);
  for (const zz of [lz - 3.3, lz + 3.3]) b.collider(lx - 0.6, lx + 0.6, zz - 0.6, zz + 0.6, 0, 9.4, true);
  b.collider(lx - 0.7, lx + 0.7, lz - 6.3, lz + 6.3, 8.9, 13.6);
  // the one bulb that still flickers + the crew's work lamp at night
  const flick = new THREE.MeshBasicMaterial({ color: 0x3a3632 });
  b.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), flick, lx + 0.76, 12.1, lz + 5.9));
  const lamp = new THREE.MeshBasicMaterial({ color: 0x3a3632 });
  b.every((_dt, t, night) => {
    const on = night > 0.3 && Math.sin(t * 23.7) * Math.sin(t * 7.3 + 1.1) > 0.55;
    flick.color.setHex(on ? 0xffd27a : 0x3a3632);
    lamp.color.setRGB(0.23 + night * 0.77, 0.22 + night * 0.73, 0.2 + night * 0.55);
  });
  // repair crew vibe: boom lift parked under the marquee, tape, sandwich board
  const orange = mat(0xe8731a, 0.55, 0.3);
  b.box(lx + 2.5, 0, lz - 4.6, 2.2, 1.4, 4.4, orange);
  const crew: THREE.Object3D[] = [];
  for (const dz of [-1.6, 1.6]) for (const s of [-1, 1]) crew.push(part(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10), mat(0x111216, 0.85), lx + 2.5 + s * 1.15, 0.35, lz - 4.6 + dz, 0, 0, HALF_PI));
  crew.push(rod(new THREE.Vector3(lx + 2.5, 1.8, lz - 5), new THREE.Vector3(lx + 2.2, 9.4, lz - 2.4), 0.28, orange));
  crew.push(mesh(new THREE.BoxGeometry(1.6, 1.1, 1.2), orange, lx + 2.0, 10.0, lz - 2.1));
  const tape = mat(0xf2d21a, 0.6);
  crew.push(mesh(new THREE.BoxGeometry(9, 0.08, 0.04), tape, lx + 1, 0.9, lz + 2.4), mesh(new THREE.BoxGeometry(0.04, 0.08, 9.2), tape, lx - 3.5, 0.9, lz - 2.2));
  mergeAdd(b, crew);
  const lampHead = mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.4, 10), lamp, lx + 1.6, 10.85, lz - 2.1);
  lampHead.rotation.z = 0.9;
  b.add(lampHead);
  const bids = printedSign('SIGN REPAIR BIDS', '#f4efe4', '#b01818', 'LUCKY WILL RETURN • STAND CLEAR', 1.8, 1.1, 0.06);
  for (const s of [-1, 1]) {
    const board = bids.clone();
    board.rotation.order = 'YXZ';
    board.rotation.set(-s * 0.22, HALF_PI, 0);
    b.add(board, -21.2 + s * 0.22, 0.62, -759);
  }
  b.collider(-21.6, -20.8, -760, -758, 0, 1.2, true);
  for (let i = 0; i < 4; i++) {
    const cone = new THREE.Group();
    cone.add(mesh(new THREE.ConeGeometry(0.2, 0.7, 8), mat(0xff6a00, 0.6), 0, 0.35, 0));
    cone.add(mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), mat(0x222222, 0.7), 0, 0.02, 0));
    b.prop(cone, lx + 1 + (i % 2 ? 4.6 : -4.6), lz + (i < 2 ? 2.4 : -6.8), 0.22, 0.7, 'cone');
  }
  b.pickup(lx + 2.1, 1.85, lz - 5.4, 3, "Sign Electrician's Lunch-Pail Pack", false);
  b.zone('Lucky the Clown Sign (dark since summer 2026)', -31, -19.5, -757, northOfDr);

  b.zone('Circus Circus', -100, -19, -790, northOfDr);
  b.zone('Circus Circus', -84, -19, southOfDr, -697);
  b.crowd.performers.push({ kind: 'elvis', x: -16.2, z: -716, facing: HALF_PI }, { kind: 'elvis', x: -16.4, z: -756, facing: HALF_PI });
  b.crowd.tourists.push({ pts: [[-21.5, -748], [-23, -788]], prop: 'camera' }, { pts: [[-26, -746.6], [-66, -746.6], [-66, -789]], prop: 'bag' });
}

// =============================================================== Adventuredome (+ Canyon Blaster coaster)
function coasterCar(color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.4, 0.5, 1.9), mat(color, 0.35, 0.4), 0, 0.45, 0));
  g.add(mesh(new THREE.BoxGeometry(1.3, 0.6, 0.15), mat(0x18181c, 0.6), 0, 0.95, -0.7));
  g.add(mesh(new THREE.BoxGeometry(1.3, 0.6, 0.15), mat(0x18181c, 0.6), 0, 0.95, 0.15));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), mat(0xd8dce4, 0.3, 0.8), 0, 1.1, 0.55));
  for (const s of [-1, 1]) {
    for (const z of [-0.6, 0.6]) g.add(part(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 8), mat(0x2a2a2e, 0.5, 0.6), s * 0.55, 0.12, z, 0, 0, HALF_PI));
  }
  bakeGroup(g);
  return g;
}

function buildAdventuredome(b: WorldBuilder): void {
  const xE = xFromO(-317);
  const xW = xFromO(-501);
  const cx = (xE + xW) / 2;
  const rx = (xE - xW) / 2;
  const cz = -711.4;
  const rz = 13.9; // stays south of Circus Circus Dr
  const H = 16;

  b.add(part(new THREE.CircleGeometry(1, 48), mat(0x8a4a32, 0.95), cx, 0.02, cz, 0, -HALF_PI)).scale.set(rx, rz, 1);
  // base ring, open where the Promenade's glass link comes in (ellipse angle ~333°)
  const ring = mesh(new THREE.CylinderGeometry(1, 1, 1.0, 48, 1, true, (127 * Math.PI) / 180, (340 * Math.PI) / 180), mat(0xd8cfc4, 0.8, 0, { side: THREE.DoubleSide }), cx, 0.5, cz);
  ring.scale.set(rx, 1, rz);
  b.add(ring);
  const glass = new THREE.MeshStandardMaterial({ color: 0xff7ab8, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false, emissive: 0xff4fa0, emissiveIntensity: 0.05 });
  b.nightGlow(glass, 0.05, 0.55);
  const dome = mesh(new THREE.SphereGeometry(1, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, cx, 1.0, cz);
  dome.scale.set(rx, H, rz);
  b.add(dome);
  const lattice = mesh(new THREE.SphereGeometry(1.004, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd6ea, wireframe: true, transparent: true, opacity: 0.35 }), cx, 1.0, cz);
  lattice.scale.set(rx, H, rz);
  b.add(lattice);
  // Elliptical wall colliders with a door at ~63° (south-east, toward the parking lot)
  const segs = 20;
  for (let k = 0; k < segs; k++) {
    if (k === 3 || k === 18) continue; // SE door to the lot; the Promenade link from Circus Circus
    const a0 = (k / segs) * Math.PI * 2;
    const a1 = ((k + 1) / segs) * Math.PI * 2;
    const x0 = cx + Math.cos(a0) * rx;
    const z0 = cz + Math.sin(a0) * rz;
    const x1 = cx + Math.cos(a1) * rx;
    const z1 = cz + Math.sin(a1) * rz;
    b.collider(Math.min(x0, x1) - 0.5, Math.max(x0, x1) + 0.5, Math.min(z0, z1) - 0.5, Math.max(z0, z1) + 0.5, 0, 10, true);
  }
  const doorA = (3.5 / segs) * Math.PI * 2;
  const dx = cx + Math.cos(doorA) * rx;
  const dz = cz + Math.sin(doorA) * rz;
  const nYaw = Math.atan2(Math.cos(doorA) / rx, Math.sin(doorA) / rz);
  const portal: THREE.Object3D[] = [];
  for (const s of [-1, 1]) portal.push(mesh(new THREE.BoxGeometry(0.6, 5, 0.6), mat(0xe8237a, 0.5), dx + Math.cos(nYaw) * s * 3.2, 2.5, dz - Math.sin(nYaw) * s * 3.2));
  portal.push(part(new THREE.BoxGeometry(7.2, 0.8, 0.8), mat(0xe8237a, 0.5), dx, 5.2, dz, nYaw));
  mergeAdd(b, portal);
  b.add(neonSign('ADVENTUREDOME', '#2a0a1e', '#ff7ac8', 8, 1.5, 'AT CIRCUS CIRCUS', 0.15), dx + Math.sin(nYaw) * 0.6, 6.6, dz + Math.cos(nYaw) * 0.6, nYaw);

  // Canyon rocks
  const rock = mat(0xa0583a, 0.95);
  const rocks: THREE.Object3D[] = [];
  for (const [ox, oz, r, h] of [
    [-16, 2, 3, 6],
    [-10, -10, 2.6, 4.5],
    [11, -10.3, 2.4, 5],
    [3, -1, 2.0, 3.2],
  ]) {
    rocks.push(part(new THREE.ConeGeometry(r, h, 7), rock, cx + ox, h / 2, cz + oz, ox));
    b.collider(cx + ox - r * 0.6, cx + ox + r * 0.6, cz + oz - r * 0.6, cz + oz + r * 0.6, 0, h * 0.7, true);
  }

  // Track: closed loop of hills inside the dome
  const ctrl: Array<[number, number, number]> = [
    [5, 1.4, 8.6],
    [-3, 1.4, 8.6],
    [-9, 2.2, 7.6],
    [-12.5, 5.5, 4.5],
    [-12, 9.5, 0],
    [-8, 6.0, -5.5],
    [-2, 2.2, -8.5],
    [5, 6.5, -7.5],
    [10.5, 8.5, -3],
    [13.5, 5.0, 2],
    [11, 2.5, 6.5],
    [9, 1.6, 8.4],
  ];
  const track = new THREE.CatmullRomCurve3(
    ctrl.map(([ox, y, oz]) => new THREE.Vector3(cx + ox, y, cz + oz)),
    true,
    'centripetal'
  );
  track.arcLengthDivisions = 600;
  track.updateArcLengths();
  const TL = track.getLength();
  const N = 240;
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const railL: THREE.Vector3[] = [];
  const railR: THREE.Vector3[] = [];
  const spine: THREE.Vector3[] = [];
  const railM = mat(0xdfe3ea, 0.3, 0.85);
  const supM = mat(0x5a5e66, 0.5, 0.6);
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const p = track.getPointAt(u);
    track.getTangentAt(u, tan);
    side.crossVectors(tan, UP).normalize();
    railL.push(p.clone().addScaledVector(side, 0.5));
    railR.push(p.clone().addScaledVector(side, -0.5));
    spine.push(new THREE.Vector3(p.x, p.y - 0.3, p.z));
    if (i % 8 === 0 && p.y > 1.9) rocks.push(mesh(new THREE.CylinderGeometry(0.12, 0.16, p.y - 0.45, 6), supM, p.x, (p.y - 0.45) / 2, p.z));
  }
  mergeAdd(b, rocks);
  const tubes: Array<{ pts: THREE.Vector3[]; r: number; m: THREE.Material }> = [
    { pts: railL, r: 0.08, m: railM },
    { pts: railR, r: 0.08, m: railM },
    { pts: spine, r: 0.2, m: mat(0xe0401f, 0.45, 0.4) },
  ];
  for (const tb of tubes) b.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tb.pts, true), N, tb.r, 6, true), tb.m));
  // loading platform + sign
  b.add(mesh(new THREE.BoxGeometry(8, 0.25, 1.4), mat(0x3a3f4a, 0.6, 0.3), cx + 1, 0.12, cz + 10.2));
  b.add(neonSign('CANYON BLASTER', '#1a0a06', '#ffb347', 5, 1.0, 'BOARD HERE', 0.1), cx + 1, 3.2, cz + 10.9);
  b.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), mat(0x2a2c32, 0.4, 0.6)), cx + 1, 1.3, cz + 10.9);

  // Train + ride
  const trainCars = [coasterCar(0xd8202a), coasterCar(0xf2c230), coasterCar(0x2a66cc)];
  for (const c of trainCars) b.scene.add(c);
  const sDwell = 3.5;
  const LAPS = 2;
  let cs = sDwell;
  let state: 'dwell' | 'run' = 'dwell';
  let timer = 4;
  let travel = 0;
  let rider: 'none' | 'waiting' | 'riding' = 'none';
  let armed = false;
  let done = false;
  let leadYaw = 0;
  const look = new THREE.Vector3();
  const placeTrain = () => {
    trainCars.forEach((c, i) => {
      const s = (((cs - i * 2.3) % TL) + TL) % TL;
      const u = s / TL;
      track.getPointAt(u, c.position);
      track.getTangentAt(u, tan);
      look.copy(c.position).add(tan);
      c.lookAt(look);
      if (i === 0) leadYaw = Math.atan2(tan.x, tan.z);
    });
  };
  placeTrain();
  b.every((dt) => {
    if (state === 'dwell') {
      timer -= dt;
      if (rider === 'waiting') rider = 'riding';
      if (timer <= 0) {
        state = 'run';
        travel = 0;
        if (rider === 'riding') armed = true;
      }
    } else {
      const y = trainCars[0].position.y;
      let v = 2.8 + 0.92 * Math.sqrt(2 * 9.8 * Math.max(0, 10 - y));
      v = Math.min(v, 13, 2.5 + travel * 1.4, 2 + (TL * LAPS - travel) * 1.1);
      let step = v * dt;
      if (travel + step >= TL * LAPS) {
        step = TL * LAPS - travel;
        state = 'dwell';
        timer = 6;
        if (armed) {
          done = true;
          armed = false;
        }
      }
      travel += step;
      cs = state === 'dwell' ? sDwell : (cs + step) % TL;
    }
    placeTrain();
  });
  const seatOff = new THREE.Vector3(0, 0.75, 0);
  b.rideables.push({
    id: 'adventuredome-coaster',
    kind: 'coaster',
    label: 'Canyon Blaster (Adventuredome)',
    boardRadius: 4.5,
    boardPoint: (out) => out.set(cx + 1.5, 0, cz + 10.6),
    seat: (out) => (rider === 'riding' ? out.copy(trainCars[0].position).add(seatOff) : out.set(cx + 1.5, 0.05, cz + 10.9)),
    yaw: () => (rider === 'riding' ? leadYaw : -HALF_PI),
    exitPoint: (out) => out.set(cx + 1.5, 0.1, cz + 11.3),
    canBoard: () => ({ ok: true }),
    onBoard: () => {
      rider = state === 'dwell' ? 'riding' : 'waiting';
      armed = false;
      done = false;
    },
    onExit: () => {
      rider = 'none';
      armed = false;
      done = false;
    },
    wantsExit: () => done,
    boardPrompt: 'Press [G] to ride the Canyon Blaster coaster (two laps, hold the cigarette tight)',
    ridingPrompt: 'Canyon Blaster — [G] bail out at your own risk',
    status: () => (rider === 'waiting' ? 'Waiting at the loading platform for the next train…' : state === 'dwell' ? `Lap bars locking… departing in ${Math.max(0, Math.ceil(timer))}s` : 'Through the canyon at full tilt!'),
  });

  b.feature({ kind: 'building', x: cx, z: cz, w: rx * 2, d: rz * 2, color: '#ff7ab8', label: 'Adventuredome' });
  b.zone('Adventuredome (Circus Circus)', xW, xE, cz - rz, cz + rz);
  b.staticMarkers.push({ x: cx, z: cz, color: '#ff7ab8', glyph: '◓', size: 3 });
  b.crowd.tourists.push({ pts: [[cx + 8, cz + 11], [cx - 6, cz + 11.5], [cx - 14, cz + 4]], prop: 'yard-drink' });
}

// =============================================================== Wynn: mountain, Lake of Dreams, bronze tower
function buildWynn(b: WorldBuilder): void {
  // ---- The mountain (climbable terraces, ~12 m), hiding the Lake of Dreams from the Strip ----
  const rock = mat(0x6e6152, 0.95);
  const turf = mat(0x3d6a35, 0.95);
  const levels = 9;
  const rise = 1.3;
  const mx1 = 35;
  const trees: THREE.Object3D[] = [];
  for (let i = 0; i < levels; i++) {
    const x0 = 21.6 + i * 1.25;
    const zs = -425 - i * 1.8;
    const zn = -473 + i * 1.8;
    const w = mx1 - x0;
    const d = zs - zn;
    b.box((x0 + mx1) / 2, i * rise, (zs + zn) / 2, w, rise, d, rock);
    b.add(mesh(new THREE.BoxGeometry(w - 0.1, 0.14, d - 0.1), turf, (x0 + mx1) / 2, (i + 1) * rise + 0.02, (zs + zn) / 2));
    const y = (i + 1) * rise;
    if (i < levels - 1) {
      for (let z = zs - 1.2; z > zn + 1; z -= 3.1 + (i % 3) * 0.4) {
        const h = 3.2 + ((i * 7 + Math.round(-z)) % 5) * 0.55;
        trees.push(place((Math.round(-z) + i) % 3 === 0 ? cypressTree(h) : pine(h, i + Math.round(-z)), x0 + 0.55, y, z));
      }
      for (let x = x0 + 1.8; x < mx1 - 0.6; x += 2.6) {
        trees.push(place(pine(3.4 + (i % 3) * 0.6, i), x, y, zs - 0.8), place(pine(3.2 + (i % 2) * 0.7, i + 1), x, y, zn + 0.8));
      }
    } else {
      for (const [x, z] of [
        [32.2, -441.5],
        [34.2, -444],
        [32.4, -456.5],
        [34.3, -454],
      ]) trees.push(place(pine(4.6, 2), x, y, z));
    }
    if (i % 2 === 0) {
      for (let k = 0; k < 3; k++) {
        const bz = zs - 4 - k * ((d - 8) / 2);
        const boulder = part(new THREE.IcosahedronGeometry(0.7 + (k % 2) * 0.3, 0), rock, x0 + 0.5, y + 0.3, bz, k + i);
        boulder.scale.set(1, 0.7, 1.2);
        trees.push(boulder);
      }
    }
  }
  mergeAdd(b, trees);
  const summitY = levels * rise;
  b.pickup(33.3, summitY + 0.45, -449, 6, 'Wynn Mountaintop Stash!', false);
  b.feature({ kind: 'park', x: 28.3, z: -449, w: 13.4, d: 48, color: '#3d6a35', label: 'Wynn' });
  b.zone('Wynn Mountain', 21, 35.5, -474, -424);

  // ---- Lake of Dreams + the waterfall wall + nightly light show ----
  const lx0 = Math.min(35.4, xFromO(94));
  const lx1 = xFromO(150) + 2.9;
  const lz0 = zFromS(1459) - 4.4;
  const lz1 = zFromS(1414) + 4.6;
  const lakeMat = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x123c48, roughness: 0.05, metalness: 0.6, emissive: 0x0a3a4a, emissiveIntensity: 0.2 }), 0.2, 1.1);
  b.floor((lx0 + lx1) / 2, (lz0 + lz1) / 2, lx1 - lx0, lz1 - lz0, lakeMat, 0.05);
  b.waterZones.push({ name: 'Lake of Dreams', minX: lx0, maxX: lx1, minZ: lz0, maxZ: lz1, y: 0.05 });
  b.feature({ kind: 'water', x: (lx0 + lx1) / 2, z: (lz0 + lz1) / 2, w: lx1 - lx0, d: lz1 - lz0, color: '#1f6f80' });
  const fallTex = waterfallTexture();
  const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.85, depthWrite: false });
  b.add(part(new THREE.PlaneGeometry(lz1 - lz0 - 1, summitY - 0.2), fallMat, mx1 + 0.08, summitY / 2, (lz0 + lz1) / 2, HALF_PI));
  b.add(part(new THREE.PlaneGeometry(1.4, lz1 - lz0 - 1), basic(0xe8fbff, { transparent: true, opacity: 0.55 }), mx1 + 0.8, 0.09, (lz0 + lz1) / 2, 0, -HALF_PI));
  b.box((lx0 + lx1) / 2, 0, lz0 - 0.3, lx1 - lx0, 0.4, 0.6, rock);
  b.box((lx0 + lx1) / 2, 0, lz1 + 0.3, lx1 - lx0, 0.4, 0.6, rock);
  // the show: a giant frog surfaces while the lake and falls cycle colour
  const frog = new THREE.Group();
  const frogBody = mesh(new THREE.SphereGeometry(2.2, 16, 12), mat(0x4fae3a, 0.5), 0, 0, 0);
  frogBody.scale.set(1.1, 0.75, 1);
  frog.add(frogBody);
  for (const s of [-1, 1]) {
    frog.add(mesh(new THREE.SphereGeometry(0.6, 10, 8), mat(0xf4f4ea, 0.4), s * 0.9, 1.5, 1.0));
    frog.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), mat(0x111111, 0.3), s * 0.9, 1.6, 1.5));
  }
  const mouth = mesh(new THREE.SphereGeometry(1.1, 12, 6), mat(0x7a1a2a, 0.6), 0, 0.1, 1.6);
  mouth.scale.set(1, 0.18, 0.4);
  frog.add(mouth);
  bakeGroup(frog);
  frog.position.set((lx0 + lx1) / 2, -5, (lz0 + lz1) / 2);
  frog.rotation.y = HALF_PI;
  b.scene.add(frog);
  const showLight = b.light(0xffffff, 0, 34, (lx0 + lx1) / 2, 6, (lz0 + lz1) / 2);
  let showClock = 0;
  const tint = new THREE.Color();
  b.every((dt, t, night) => {
    showClock += dt;
    fallTex.offset.y += dt * 0.9;
    const st = showClock % 50;
    const on = night > 0.4 && st < 24;
    const k = on ? Math.min(1, st / 2, (24 - st) / 2) : 0;
    const hue = (t * 0.09) % 1;
    if (on) lakeMat.emissive.setHSL(hue, 0.9, 0.42);
    else lakeMat.emissive.setHSL(0.52, 0.6, 0.12);
    fallMat.color.setRGB(1, 1, 1).lerp(tint.setHSL((hue + 0.33) % 1, 0.85, 0.6), k);
    showLight.color.setHSL(hue, 0.85, 0.6);
    showLight.intensity = 30 * k;
    frog.position.y = -5 + 5.3 * k + Math.sin(t * 1.3) * 0.15 * k;
    frog.rotation.y = HALF_PI + Math.sin(t * 0.8) * 0.35 * k;
  });
  // SW Steakhouse / Parasol terrace on the far shore
  const deckMat = mat(0x6b4a30, 0.75);
  b.box(lx1 + 1.8, 0, (lz0 + lz1) / 2, 3.6, 0.3, lz1 - lz0 + 2, deckMat);
  b.box(lx1 + 0.08, 0.3, (lz0 + lz1) / 2, 0.12, 1.0, lz1 - lz0 + 2, new THREE.MeshStandardMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.3 }), true, false);
  const terr: THREE.Object3D[] = [];
  for (let z = lz0 + 2; z < lz1 - 1; z += 3.4) {
    terr.push(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 12), mat(0xf4f1ea, 0.5), lx1 + 2, 1.05, z), mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), mat(0x222222, 0.4), lx1 + 2, 0.68, z));
    terr.push(mesh(new THREE.ConeGeometry(1.3, 0.6, 10), mat(0xe8dcc0, 0.8), lx1 + 2.4, 2.6, z), mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 5), mat(0x222222, 0.4), lx1 + 2.4, 1.45, z));
  }
  mergeAdd(b, terr);
  b.zone('Lake of Dreams', lx0, lx1 + 3.6, lz0 - 1, lz1 + 1);

  // ---- Bronze curved-glass tower (concave to the Strip) ----
  // Bronze-gold curved glass; no LED fins, a warm crown wash
  const wynnSkin: FacadeSpec = { wall: '#a8703e', mullion: '#d2a060', glass: '#8c5a2c', lit: '#ffd9a0', cols: 10, rows: 30, style: 2, seed: 240 };
  curvedTower(b, 5, -454, 64, -0.15 * Math.PI, 0.15 * Math.PI, 5, 14, 60, wynnSkin, 0.8, { rough: 0.2, ledFins: false, wash: 0xffc88a, washZone: 16 });
  b.add(place(wynnSignature(b, 'Wynn', 12, 4.2), 61.8, 55.8, -454, -HALF_PI));

  // ---- Entrance plaza, porte-cochère, the Wynn | Encore marquee ----
  plaza(b, 19, 56, -475.5, -489.5, '#d8c7a8', '#b9a684');
  const bronze = mat(0x8a5a32, 0.35, 0.75);
  b.add(mesh(new THREE.BoxGeometry(14, 0.6, 9), bronze, 46, 6.6, -482.5, true));
  b.add(mesh(new THREE.BoxGeometry(13.6, 0.05, 8.6), basic(0xffe2b0), 46, 6.27, -482.5));
  for (const [x, z] of [
    [40, -478.8],
    [52, -478.8],
    [40, -486.2],
    [52, -486.2],
  ]) b.box(x, 0, z, 0.8, 6.3, 0.8, bronze, true);
  b.add(place(wynnSignature(b, 'Wynn', 6.4, 2.2), 38.95, 6.6, -482.5, -HALF_PI));
  const ent: THREE.Object3D[] = [];
  for (const [x, z] of [
    [23.3, -477.2],
    [36, -488.6],
    [23.3, -481.6],
  ]) ent.push(place(palmTree(7.8, false, x + z), x, 0, z));
  for (const z of [-478, -487]) {
    ent.push(place(planter(4, 1.4, 0xff3a5c), 30, 0, z));
    b.collider(28, 32, z - 0.7, z + 0.7, 0, 0.6);
  }
  mergeAdd(b, ent);
  const marquee = new LedBoard('WYNN | ENCORE', ['LAS VEGAS', 'LAKE OF DREAMS • NIGHTLY', 'XS NIGHTCLUB • ENCORE BEACH CLUB', 'FORBES FIVE-STAR'], ['#a0673e', '#6a1424', '#c88a5a', '#3a2418'], 256, 512);
  ledPylon(b, marquee, 21.4, -490, 22, 8, 0x5a3a22);
  b.crowd.performers.push({ kind: 'showgirl', x: 16.4, z: -482, facing: -HALF_PI });

  b.building(68, -454, 14, 58, '#a0673e', 'Wynn');
  b.zone('Wynn Las Vegas', 19, 100, -489.5, -420.5);
  b.crowd.tourists.push(
    { pts: [[20, -481], [38, -483], [50, -476], [50, -458]], prop: 'camera' },
    { pts: [[lx1 + 1.6, lz0 + 0.5], [lx1 + 1.6, lz1 - 0.5]], prop: 'yard-drink' },
    { pts: [[37, -476], [52, -462]], prop: 'cig' }
  );
}

// =============================================================== Encore
function buildEncore(b: WorldBuilder): void {
  const zS = -490;
  const zN = zFromS(1940);
  const skin: FacadeSpec = { wall: '#a8703e', mullion: '#d2a060', glass: '#86562a', lit: '#ffd9a0', cols: 10, rows: 30, style: 2, seed: 241 };
  curvedTower(b, 5, -527, 66, -0.14 * Math.PI, 0.14 * Math.PI, 5, 14, 62, skin, 0.8, { rough: 0.2, ledFins: false, wash: 0xffc88a, washZone: 16 });
  b.add(place(wynnSignature(b, 'Encore', 12, 4.0), 63.8, 57.8, -527, -HALF_PI));

  // Esplanade garden: pavers by the sidewalk, lawn, red flower beds, trees
  plaza(b, 19, 26, zS, zN, '#d8c7a8', '#b9a684');
  b.floor(41, (zS + zN) / 2, 30, zS - zN, mat(0x4f7a3a, 0.95), 0.012);
  const garden: THREE.Object3D[] = [];
  for (let z = zS - 5; z > -546; z -= 9) {
    garden.push(place(roundTree(6 + (Math.round(-z) % 3) * 0.6, 0x3a6e34), 29, 0, z));
    garden.push(place(cypressTree(5.5), 49, 0, z - 3));
    garden.push(mesh(new THREE.BoxGeometry(6, 0.3, 2.2), mat(0xc4141c, 0.7), 38, 0.15, z - 4.5));
  }
  mergeAdd(b, garden);
  b.box(23, 0, -527, 1.2, 1.6, 12, mat(0x6b4a30, 0.6, 0.3), true);
  b.add(place(wynnSignature(b, 'Encore', 7.4, 2.4), 22.35, 0.95, -527, -HALF_PI));
  // Porte-cochère
  const bronze = mat(0x8a5a32, 0.35, 0.75);
  b.add(mesh(new THREE.BoxGeometry(14, 0.6, 9), bronze, 40, 6.4, -553, true));
  b.add(mesh(new THREE.BoxGeometry(13.6, 0.05, 8.6), basic(0xffd6c0), 40, 6.07, -553));
  for (const [x, z] of [
    [34, -549.3],
    [46, -549.3],
    [34, -556.7],
    [46, -556.7],
  ]) b.box(x, 0, z, 0.8, 6.1, 0.8, bronze, true);
  b.floor(37, -553, 36, 9, mat(0x2b2b30, 0.85), 0.016);

  // Encore Beach Club behind the tower
  const px0 = 82;
  const px1 = 100;
  const pz0 = -564;
  const pz1 = -546;
  plaza(b, px0 - 3, px1 + 2, pz1 + 3, pz0 - 3, '#e6dccb', '#c9bca6');
  b.floor((px0 + px1) / 2, (pz0 + pz1) / 2, px1 - px0, pz1 - pz0, new THREE.MeshStandardMaterial({ color: 0x2bb6d9, roughness: 0.05, metalness: 0.2, emissive: 0x0b4a66, emissiveIntensity: 0.6 }), 0.04);
  b.waterZones.push({ name: 'Encore Beach Club Pool', minX: px0, maxX: px1, minZ: pz0, maxZ: pz1, y: 0.04 });
  const ebc: THREE.Object3D[] = [];
  for (let z = pz0 + 1; z < pz1; z += 3) ebc.push(mesh(new THREE.BoxGeometry(1.8, 0.35, 0.8), mat(0xf4f1ea, 0.6), px0 - 1.8, 0.2, z), mesh(new THREE.BoxGeometry(1.8, 0.35, 0.8), mat(0xf4f1ea, 0.6), px1 + 1.2, 0.2, z));
  for (const [x, z] of [
    [px0 - 2, pz1 + 2],
    [px1 + 1, pz1 + 2],
    [px0 - 2, pz0 - 2],
    [px1 + 1, pz0 - 2],
  ]) ebc.push(place(palmTree(6.5, false, x), x, 0, z));
  for (let i = 0; i < 3; i++) {
    ebc.push(mesh(new THREE.BoxGeometry(3, 2.6, 3), mat(0xf4f1ea, 0.7), px0 + 3 + i * 5.5, 1.3, pz0 - 2.5));
    ebc.push(mesh(new THREE.BoxGeometry(3.4, 0.25, 3.4), mat(0xc4141c, 0.7), px0 + 3 + i * 5.5, 2.75, pz0 - 2.5));
  }
  mergeAdd(b, ebc);
  b.add(neonSign('ENCORE BEACH CLUB', '#1a0606', '#ff6a5a', 9, 1.4, undefined, 0.15), px0 - 2.9, 3.4, (pz0 + pz1) / 2, -HALF_PI);
  b.zone('Encore Beach Club', px0 - 4, px1 + 3, pz0 - 4, pz1 + 4);

  // Self-park garage at the north end (stays clear of Convention Center Dr)
  const gz0 = -566;
  const gz1 = Z_CONV + 9 + 2.6;
  const gzc = (gz0 + gz1) / 2;
  const concrete = mat(0xbdb8ae, 0.85);
  b.box(49, 0, gzc, 42, 16, gz0 - gz1, concrete, true);
  const bands: THREE.Object3D[] = [];
  for (let y = 2.2; y < 16; y += 3.2) bands.push(mesh(new THREE.BoxGeometry(0.3, 1.4, gz0 - gz1 - 1), mat(0x1d1e22, 0.8), 27.9, y, gzc));
  mergeAdd(b, bands, false);
  b.add(neonSign('SELF PARK', '#0a1a33', '#ffffff', 5, 1.2, 'WYNN • ENCORE', 0.12), 27.7, 13.5, gzc, -HALF_PI);
  b.building(49, gzc, 42, gz0 - gz1, '#bdb8ae');

  b.building(70, -527, 14, 56, '#a0673e', 'Encore');
  b.zone('Encore Las Vegas', 19, 100, zN, zS);
  b.crowd.tourists.push({ pts: [[22, -494], [24, -560]], prop: 'camera' }, { pts: [[30, -500], [46, -548], [30, -556]], prop: 'bag' }, { pts: [[px0 - 2, pz1 + 1.5], [px1 + 1, pz1 + 1.5], [px1 + 1, pz0 - 1]], prop: 'yard-drink' });
}

// =============================================================== Wynn Golf Club (behind Wynn/Encore)
function buildWynnGolf(b: WorldBuilder): void {
  const x0 = 102;
  const x1 = 178;
  const zS = -423;
  const zN = Z_CONV + 9 + 2.2;
  const turfTex = canvasTex(64, 64, (ctx) => {
    ctx.fillStyle = '#4f8a3a';
    ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = '#5c9a44';
    ctx.fillRect(0, 32, 64, 32);
  });
  turfTex.wrapS = THREE.RepeatWrapping;
  turfTex.wrapT = THREE.RepeatWrapping;
  turfTex.repeat.set((x1 - x0) / 12, (zS - zN) / 12);
  b.floor((x0 + x1) / 2, (zS + zN) / 2, x1 - x0, zS - zN, new THREE.MeshStandardMaterial({ map: turfTex, roughness: 0.95 }), 0.012);
  b.feature({ kind: 'park', x: (x0 + x1) / 2, z: (zS + zN) / 2, w: x1 - x0, d: zS - zN, color: '#4f8a3a', label: 'Wynn Golf' });

  // Water hazard with the signature waterfall
  const wx = 130;
  const wz = -480;
  const pond = mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ color: 0x1f6f80, roughness: 0.06, metalness: 0.5, emissive: 0x08303a, emissiveIntensity: 0.3 }), wx, 0.03, wz);
  pond.rotation.x = -HALF_PI;
  pond.scale.set(12, 14, 1);
  b.add(pond);
  b.waterZones.push({ name: 'Wynn Golf Water Hazard', minX: wx - 9.5, maxX: wx + 9.5, minZ: wz - 11, maxZ: wz + 11, y: 0.03 });
  b.feature({ kind: 'water', x: wx, z: wz, w: 24, d: 28, color: '#1f6f80' });
  const rock = mat(0x7a6a5a, 0.95);
  b.box(wx + 13.5, 0, wz, 3, 6, 12, rock, true);
  const fallTex = waterfallTexture();
  b.add(part(new THREE.PlaneGeometry(10, 5.8), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.85, depthWrite: false }), wx + 11.95, 3, wz, -HALF_PI));
  b.every((dt) => {
    fallTex.offset.y += dt * 0.9;
  });

  const course: THREE.Object3D[] = [];
  const sand = mat(0xe2d1a8, 0.95);
  for (const [x, z, sx, sz] of [
    [112, -440, 4, 2.5],
    [146, -520, 3.5, 5],
    [120, -560, 5, 3],
  ]) {
    const bunker = part(new THREE.CircleGeometry(1, 20), sand, x, 0.02, z, 0, -HALF_PI);
    bunker.scale.set(sx, sz, 1);
    course.push(bunker);
  }
  for (const [x, z] of [
    [150, -548],
    [116, -455],
  ]) {
    const green = part(new THREE.CircleGeometry(5, 24), mat(0x6fb04f, 0.9), x, 0.018, z, 0, -HALF_PI);
    course.push(green, mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), mat(0xf4f4f4, 0.5), x, 1.2, z), mesh(new THREE.BoxGeometry(0.02, 0.5, 0.8), mat(0xd8202a, 0.6), x, 2.15, z + 0.4));
  }
  for (let i = 0; i < 26; i++) {
    const x = x0 + 3 + ((i * 37) % (x1 - x0 - 30));
    const z = zS - 4 - ((i * 53) % (zS - zN - 8));
    if (Math.hypot(x - wx, z - wz) < 16) continue;
    if (Math.abs(x - 160) < 4 && z > -500) continue;
    course.push(place(i % 3 === 0 ? palmTree(7, false, i) : pine(5 + (i % 4) * 0.8, i), x, 0, z));
  }
  course.push(mesh(new THREE.BoxGeometry(1.3, 1.0, 2.2), mat(0xf4f4f2, 0.5), 108, 0.8, -500), mesh(new THREE.BoxGeometry(1.4, 0.08, 2.0), mat(0x2a6a3a, 0.6), 108, 2.0, -500));
  for (const dz of [-0.8, 0.8]) course.push(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), mat(0x333333, 0.5), 108.6, 1.5, -500 + dz));
  mergeAdd(b, course);
  b.zone('Wynn Golf Club', x0, x1, zN, zS);
}

// =============================================================== Peppermill Restaurant & Fireside Lounge
function buildPeppermill(b: WorldBuilder): void {
  const bx0 = Math.max(28, xFromO(59));
  const bx1 = bx0 + 20;
  const bzS = -645;
  const bzN = -666;
  const bcx = (bx0 + bx1) / 2;
  const bcz = (bzS + bzN) / 2;
  const H = 5.4;
  const t = 0.8;
  parkingLot(b, 23.5, 100, Z_CONV - 10.5, -644.4);
  parkCars(b, stallSpots(23.5, 100, Z_CONV - 10.5, -644.4), 3, 2);
  b.floor(21.5, (Z_CONV - 10.5 + -668) / 2, 4, Z_CONV - 10.5 + 668, mat(0x5f7d45, 0.95), 0.018);
  plaza(b, 23.5, bx0, -644.4, -668, '#cdbfd6', '#a998b8');
  parkingLot(b, bx1 + 1, 100, -644.4, -668);
  parkCars(b, stallSpots(bx1 + 1, 100, -644.4, -668), 4, 0);
  b.floor(bcx, bcz, bx1 - bx0, bzS - bzN, new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (ctx) => {
    ctx.fillStyle = '#2a1036';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ff4fd8';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(32 + (i % 2) * 64, 32 + Math.floor(i / 2) * 64, 20, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [6, 6]), roughness: 0.9 }), 0.03);

  // Shell: door on the west (street) side, walkable roof
  const wall = mat(0x2a1838, 0.7);
  const doorZ0 = bcz + 2.5;
  const doorZ1 = bcz - 2.5;
  b.box(bx0 + t / 2, 0, (bzS + doorZ0) / 2, t, H, bzS - doorZ0, wall, true);
  b.box(bx0 + t / 2, 0, (doorZ1 + bzN) / 2, t, H, doorZ1 - bzN, wall, true);
  b.box(bx0 + t / 2, 3.6, bcz, t, H - 3.6, 5, wall, true);
  b.box(bx1 - t / 2, 0, bcz, t, H, bzS - bzN, wall, true);
  b.box(bcx, 0, bzS - t / 2, bx1 - bx0, H, t, wall, true);
  b.box(bcx, 0, bzN + t / 2, bx1 - bx0, H, t, wall, true);
  b.box(bcx, H, bcz, bx1 - bx0 + 0.6, 0.5, bzS - bzN + 0.6, mat(0x1a1020, 0.7));
  // Famous neon roofline: pink / purple / blue bands on the three public sides
  const neon = [basic(0xff4fd8), basic(0xa24dff), basic(0x3a8bff)];
  const strips: THREE.Object3D[] = [];
  neon.forEach((m, i) => {
    const y = H - 0.25 - i * 0.42;
    strips.push(mesh(new THREE.BoxGeometry(0.12, 0.14, bzS - bzN + 0.3), m, bx0 - 0.06, y, bcz));
    strips.push(mesh(new THREE.BoxGeometry(bx1 - bx0 + 0.3, 0.14, 0.12), m, bcx, y, bzS + 0.06));
    strips.push(mesh(new THREE.BoxGeometry(bx1 - bx0 + 0.3, 0.14, 0.12), m, bcx, y, bzN - 0.06));
    strips.push(mesh(new THREE.BoxGeometry(bx1 - bx0 - 2, 0.1, 0.1), m, bcx, H - 0.3 - i * 0.3, bzS - t - 0.1));
  });
  mergeAdd(b, strips, false);
  b.add(mesh(new THREE.BoxGeometry(3.6, 0.35, 6.4), mat(0x1a1020, 0.5, 0.4), bx0 - 1.8, 3.7, bcz, true));
  b.add(mesh(new THREE.BoxGeometry(3.4, 0.05, 6.0), basic(0xff9ae8), bx0 - 1.8, 3.5, bcz));
  b.add(neonSign('Peppermill', '#2a0a3a', '#ff6ad5', 6, 1.1, undefined, 0.15), bx0 - 0.3, 4.5, bcz, -HALF_PI);

  // Restaurant half: booths + neon cherry-blossom trees
  const room: THREE.Object3D[] = [];
  const velvet = mat(0x6a1e7a, 0.7);
  for (let i = 0; i < 4; i++) {
    const x = bx0 + 3 + i * 4.2;
    room.push(mesh(new THREE.BoxGeometry(3.2, 1.3, 0.5), velvet, x, 0.65, bzS - t - 0.3), mesh(new THREE.BoxGeometry(3.2, 0.5, 0.9), velvet, x, 0.25, bzS - t - 0.9), mesh(new THREE.BoxGeometry(2.6, 0.08, 1.0), mat(0x1a1a22, 0.2, 0.4), x, 0.78, bzS - t - 2.0), mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.75, 6), mat(0xb8bcc6, 0.3, 0.8), x, 0.38, bzS - t - 2.0));
    b.collider(x - 1.6, x + 1.6, bzS - t - 2.5, bzS - t, 0, 0.8);
  }
  const blossom = basic(0xffb6e6);
  const blossom2 = basic(0xffe6f4);
  for (const [x, z] of [
    [bx0 + 5, bcz + 3.6],
    [bx0 + 11, bcz + 3.2],
    [bx1 - 3, bcz + 3.8],
  ]) {
    room.push(mesh(new THREE.CylinderGeometry(0.12, 0.18, 3, 6), mat(0x3a2418, 0.8), x, 1.5, z));
    for (let k = 0; k < 3; k++) room.push(mesh(new THREE.SphereGeometry(0.8 - k * 0.1, 10, 8), k % 2 ? blossom2 : blossom, x + Math.cos(k * 2.1) * 0.6, 3.1 + k * 0.3, z + Math.sin(k * 2.1) * 0.6));
    b.collider(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 0, 3, true);
  }
  for (const m of [basic(0xa24dff), basic(0x3a8bff)]) room.push(mesh(new THREE.BoxGeometry(bx1 - bx0 - 1.8, 0.08, 0.08), m, bcx, H - 0.25, bzN + t + 0.1), mesh(new THREE.BoxGeometry(0.08, 0.08, bzS - bzN - 1.8), m, bx1 - t - 0.1, H - 0.25, bcz));

  // Fireside Lounge: fire rising out of a pool, wrapped by a sunken velvet couch
  const fx = bcx - 2;
  const fz = bcz - 5.2;
  room.push(mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.4, 32), mat(0x2a2a30, 0.4, 0.3), fx, 0.2, fz), mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.5, 16), mat(0x3a3a40, 0.5, 0.3), fx, 0.45, fz));
  room.push(part(new THREE.TorusGeometry(3.5, 0.45, 8, 40, Math.PI * 1.7), mat(0x3a1640, 0.7), fx, 0.45, fz, 0, HALF_PI, -0.85 * Math.PI));
  mergeAdd(b, room);
  const poolMat = new THREE.MeshBasicMaterial({ color: 0x0d2a55 });
  b.add(mesh(new THREE.CylinderGeometry(2.12, 2.12, 0.02, 32), poolMat, fx, 0.41, fz));
  b.collider(fx - 2.3, fx + 2.3, fz - 2.3, fz + 2.3, 0, 0.4);
  b.waterZones.push({ name: 'Peppermill Fire-Pit Pool', minX: fx - 2.1, maxX: fx + 2.1, minZ: fz - 2.1, maxZ: fz + 2.1, y: 0.4 });
  const flameA = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameB = new THREE.MeshBasicMaterial({ color: 0xffd04a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const f = mesh(new THREE.ConeGeometry(0.26, 1.2, 6), i % 2 ? flameA : flameB, fx + Math.cos(a) * 0.45, 1.1, fz + Math.sin(a) * 0.45);
    b.scene.add(f);
    flames.push(f);
  }
  b.every((_dt, tt) => {
    flames.forEach((f, i) => {
      const s = 0.7 + 0.4 * Math.abs(Math.sin(tt * 9 + i * 1.7));
      f.scale.set(1, s, 1);
      f.position.y = 0.7 + 0.6 * s;
    });
    poolMat.color.setRGB(0.05 + 0.08 * Math.abs(Math.sin(tt * 5)), 0.12, 0.33);
  });
  b.add(barCounter(6, 0x1a1a22, 0x3a1640), bcx + 4.2, 0, bzN + t + 0.6);
  b.collider(bcx + 1.2, bcx + 7.2, bzN + t + 0.2, bzN + t + 1.0, 0, 1.15, true);
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(bcx + 4.2, 0, bzN + t + 2.4), radius: 2.6, label: 'Peppermill Fireside Lounge' });
  b.pickup(fx - 3.4, 0.45, fz, 4, 'Fireside Lounge Couch-Cushion Pack', true);

  // Pole sign with the chasing neon bands
  const sx = 21.3;
  const sz = Z_CONV - 13.5;
  b.box(sx, 0, sz, 0.9, 9.6, 0.9, mat(0x2a1838, 0.5, 0.4), true);
  b.add(neonSign('PEPPERMILL', '#1c0630', '#ff7ae0', 6.5, 2.2, 'RESTAURANT • FIRESIDE LOUNGE', 0.4), sx, 11.0, sz, HALF_PI);
  const bandMats = [0xff4fd8, 0xa24dff, 0x3a8bff].map((c) => new THREE.MeshBasicMaterial({ color: c }));
  bandMats.forEach((m, i) => b.add(mesh(new THREE.BoxGeometry(0.5, 0.32, 6.2), m, sx, 9.3 - i * 0.5, sz)));
  b.every((_dt, tt) => {
    bandMats.forEach((m, i) => {
      m.color.setHex([0xff4fd8, 0xa24dff, 0x3a8bff][i]).multiplyScalar(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(tt * 3 - i * 1.3)));
    });
  });
  const palms: THREE.Object3D[] = [];
  for (const [x, z] of [
    [23.3, -650],
    [23.3, -662],
    [bx0 - 2.5, bzN - 1.8],
  ]) palms.push(place(palmTree(7, false, x * z), x, 0, z));
  mergeAdd(b, palms);

  b.building(bcx, bcz, bx1 - bx0, bzS - bzN, '#3a1450', 'Peppermill');
  b.staticMarkers.push({ x: bcx, z: bcz, color: '#ff6ad5', glyph: '☕', size: 2.6 });
  b.zone('Peppermill Restaurant & Fireside Lounge', bx0 - 4, bx1, bzN, bzS);
  b.zone('Peppermill Parking', 19, 100, -668, Z_CONV - 9.5);
  b.crowd.tourists.push({ pts: [[bx0 + 2, bzS - 3.6], [bx1 - 2, bzS - 3.6]], prop: 'cig' }, { pts: [[20.5, -648], [bx0 - 2, bcz + 1]], prop: 'yard-drink' });
}

// =============================================================== Diamond Lot (former Riviera)
function buildDiamondLot(b: WorldBuilder): void {
  const zS = -672.6;
  const zN = zFromS(2687) + 0.4;
  const x0 = 24;
  const x1 = Math.max(100, xFromO(380));
  parkingLot(b, x0, x1, zS, zN);
  parkCars(b, stallSpots(x0, x1, zS, zN).filter(([x, z]) => !(x < 31 && z > zS - 8.5)), 3, 5);
  b.floor(21.7, (zS + zN) / 2, 4.6, zS - zN, mat(0x5f7d45, 0.95), 0.018);
  const lot: THREE.Object3D[] = [];
  for (let z = zS - 7; z > zN; z -= 14) {
    for (const x of [40, 62, 84]) {
      lot.push(mesh(new THREE.CylinderGeometry(0.12, 0.18, 9, 8), mat(0x8c8f94, 0.4, 0.6), x, 4.5, z));
      lot.push(mesh(new THREE.BoxGeometry(2.6, 0.2, 0.5), mat(0x5b6068, 0.4, 0.6), x, 9.0, z));
      for (const s of [-1, 1]) lot.push(mesh(new THREE.BoxGeometry(0.7, 0.08, 0.4), basic(0xfff0d0), x + s * 1.0, 8.86, z));
    }
  }
  for (const z of [-677, -692, -711, -724]) lot.push(place(palmTree(7.4, false, -z), 23.3, 0, z));
  lot.push(mesh(new THREE.BoxGeometry(2.2, 2.4, 2.2), mat(0xf2f0ea, 0.6), 27, 1.2, zS - 3.6), mesh(new THREE.BoxGeometry(2.6, 0.2, 2.6), mat(0x0b3a7a, 0.5), 27, 2.5, zS - 3.6));
  mergeAdd(b, lot);
  for (let z = zS - 7; z > zN; z -= 14) for (const x of [40, 62, 84]) b.collider(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 0, 9, true);
  b.collider(25.9, 28.1, zS - 4.7, zS - 2.5, 0, 2.4, true);
  b.box(25.6, 0, zS - 3.6, 0.6, 1.05, 1.4, mat(0xd9d4c8, 0.5));
  b.box(22.2, 0, -700, 0.8, 1.6, 9, mat(0x6b6f76, 0.7), true);
  b.add(place(printedSign('DIAMOND LOT', '#0b3a7a', '#ffffff', 'LVCVA • CONVENTION & EVENT PARKING', 8.4, 1.3), 21.75, 0.85, -700, HALF_PI));
  b.box(22.2, 0, -686, 0.6, 1.1, 3.2, mat(0x9a8a6a, 0.6, 0.4), true);
  b.add(place(printedSign('SITE OF THE RIVIERA', '#3a2a10', '#f2d48a', '1955 – 2015 • "THE RIV"', 3, 0.8), 21.85, 0.62, -686, HALF_PI));
  b.feature({ kind: 'plaza', x: (x0 + x1) / 2, z: (zS + zN) / 2, w: x1 - x0, d: zS - zN, color: '#45464c', label: 'Diamond Lot' });
  b.zone('Diamond Lot (former Riviera site)', 19, x1, zN, zS);
  b.crowd.performers.push({ kind: 'slapper', x: 15.6, z: -700, facing: -HALF_PI });
  b.crowd.tourists.push({ pts: [[24, -676], [70, -700], [104, -705]], prop: 'none' }, { pts: [[96, -722], [30, -712]], prop: 'bag' });
}

// =============================================================== LVCC West Hall
function buildWestHall(b: WorldBuilder): void {
  const x0 = 108;
  const x1 = 170;
  const zS = -686;
  const zN = -766;
  const cx = (x0 + x1) / 2;
  const cz = (zS + zN) / 2;
  b.box(cx, 0, cz, x1 - x0, 19, zS - zN, mat(0xdfe3e8, 0.4, 0.3), true);
  b.add(part(new THREE.PlaneGeometry(zS - zN - 4, 12), glassGlow(b, 0x26405a, 0xd8ecff, 1.2), x0 - 0.04, 6.5, cz, -HALF_PI));
  const hall: THREE.Object3D[] = [];
  hall.push(part(new THREE.BoxGeometry(14, 0.6, zS - zN + 4), mat(0xf2f4f6, 0.3, 0.5), x0 - 2, 19.6, cz, 0, 0, 0.12));
  for (let z = zS - 4; z > zN + 2; z -= 12) hall.push(mesh(new THREE.CylinderGeometry(0.25, 0.25, 19, 8), mat(0xc9ccd1, 0.3, 0.7), x0 - 7, 9.5, z));
  mergeAdd(b, hall);
  for (let z = zS - 4; z > zN + 2; z -= 12) b.collider(x0 - 7.3, x0 - 6.7, z - 0.3, z + 0.3, 0, 19, true);
  b.add(neonSign('LAS VEGAS CONVENTION CENTER', '#0a1a33', '#ffffff', 26, 2.2, 'WEST HALL', 0.2), x0 - 0.3, 15, cz, -HALF_PI);
  plaza(b, 100.5, x0, zS, zN, '#d4d6d8', '#b4b8bc');
  b.building(cx, cz, x1 - x0, zS - zN, '#dfe3e8', 'LVCC West Hall');
  b.zone('LVCC West Hall', x0 - 10, x1, zN, zS);
  b.crowd.tourists.push({ pts: [[x0 - 3, zS - 3], [x0 - 3, zN + 3]], prop: 'bag' });
}

// =============================================================== Las Vegas Monorail (behind the east-side resorts)
const MONO_CAR = 9;
const MONO_CARS = 4;

function monorailCar(endDir: number, cabGlass: THREE.Material, winGlow: THREE.Material, livery: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const L = MONO_CAR;
  const white = mat(0xf2f4f6, 0.35, 0.3);
  const dark = mat(0x23262c, 0.6, 0.3);
  const teal = mat(0x0f7fb8, 0.35, 0.3);
  g.add(mesh(new THREE.BoxGeometry(2.5, 0.4, L - 0.4), dark, 0, 0.32, 0));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.16, 1.25, L - 0.8), dark, s * 0.66, -0.5, 0));
  if (endDir !== 0) {
    g.add(mesh(new THREE.BoxGeometry(2.9, 0.6, L), white, 0, 0.8, 0));
    g.add(mesh(new THREE.BoxGeometry(2.92, 0.16, L), teal, 0, 1.06, 0));
    g.add(mesh(new THREE.BoxGeometry(2.94, 1.6, L - 0.4), cabGlass, 0, 1.92, 0));
    g.add(mesh(new THREE.BoxGeometry(2.9, 0.12, L - 0.2), cabGlass, 0, 2.78, 0));
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.3, 0.9), mat(0x1c458c, 0.7), 0, 0.95, endDir * (L / 2 - 1.7)));
    g.add(part(new THREE.BoxGeometry(2.8, 1.9, 1.3), white, 0, 1.45, endDir * (L / 2 + 0.45), 0, endDir * 0.42));
    g.add(part(new THREE.BoxGeometry(2.4, 0.9, 0.05), basic(0x14202c), 0, 2.0, endDir * (L / 2 + 0.75), 0, endDir * 0.42));
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), basic(0xfff6d8), s * 0.95, 0.85, endDir * (L / 2 + 1.05)));
  } else {
    g.add(mesh(new THREE.BoxGeometry(2.9, 1.2, L), white, 0, 1.1, 0));
    g.add(mesh(new THREE.BoxGeometry(2.92, 0.16, L), teal, 0, 1.62, 0));
    g.add(mesh(new THREE.BoxGeometry(2.94, 0.95, L - 1.2), winGlow, 0, 2.15, 0));
    g.add(mesh(new THREE.BoxGeometry(2.8, 0.4, L - 0.3), white, 0, 2.8, 0));
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.4, 2.2), mat(0xb8bcc6, 0.5, 0.5), 0, 3.15, 0));
  }
  for (const s of [-1, 1]) g.add(part(new THREE.PlaneGeometry(6, 0.42), livery, s * 1.48, endDir !== 0 ? 0.78 : 0.95, 0, s * HALF_PI));
  bakeGroup(g, (m) => m.material === winGlow);
  return g;
}

function buildMonorail(b: WorldBuilder): void {
  const BEAM_TOP = 8.6;
  const beamX = Math.min(184, xFromO(912));
  const pts = [
    new THREE.Vector3(160, BEAM_TOP, -424),
    new THREE.Vector3(160, BEAM_TOP, -446),
    new THREE.Vector3(160, BEAM_TOP, -470),
    new THREE.Vector3(160, BEAM_TOP, -490),
    new THREE.Vector3(172, BEAM_TOP, -540),
    new THREE.Vector3(beamX, BEAM_TOP, -585),
    new THREE.Vector3(beamX, BEAM_TOP, -605),
    new THREE.Vector3(beamX, BEAM_TOP, -700),
    new THREE.Vector3(beamX, BEAM_TOP, -792),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  curve.arcLengthDivisions = 800;
  curve.updateArcLengths();
  const L = curve.getLength();
  const concrete = mat(0xcfcac0, 0.8);
  const beam: THREE.Object3D[] = [];
  const nSeg = Math.ceil(L / 4);
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  for (let i = 0; i < nSeg; i++) {
    curve.getPointAt(i / nSeg, p0);
    curve.getPointAt((i + 1) / nSeg, p1);
    const len = p0.distanceTo(p1);
    beam.push(part(new THREE.BoxGeometry(0.9, 1.5, len + 0.06), concrete, (p0.x + p1.x) / 2, BEAM_TOP - 0.75, (p0.z + p1.z) / 2, Math.atan2(p1.x - p0.x, p1.z - p0.z)));
  }
  for (const u of [0, 1]) {
    curve.getPointAt(u, p0);
    beam.push(mesh(new THREE.BoxGeometry(1.2, 0.8, 0.5), mat(0xf2c230, 0.6), p0.x, BEAM_TOP + 0.3, p0.z));
  }
  const tan = new THREE.Vector3();
  for (let s = 4; s < L - 2; s += 16) {
    curve.getPointAt(s / L, p0);
    if (Math.abs(p0.z - Z_CONV) < 11.5) continue;
    curve.getTangentAt(s / L, tan);
    const colH = BEAM_TOP - 1.5;
    beam.push(mesh(new THREE.CylinderGeometry(0.55, 0.7, colH, 10), concrete, p0.x, colH / 2, p0.z));
    beam.push(part(new THREE.BoxGeometry(2.2, 0.6, 1.2), concrete, p0.x, colH - 0.3, p0.z, Math.atan2(tan.x, tan.z)));
    b.collider(p0.x - 0.7, p0.x + 0.7, p0.z - 0.7, p0.z + 0.7, 0, colH, true);
  }

  // ---- Convention Center station (platform west of the beam, stair down to the north) ----
  const PLAT = 8.95;
  const stX0 = beamX - 9;
  const stX1 = beamX - 1.65;
  const stZS = Z_CONV - 12.2;
  const stZN = stZS - 24;
  const stZC = (stZS + stZN) / 2;
  const deck = mat(0xb8b2a8, 0.7, 0.15);
  b.box((stX0 + stX1) / 2, PLAT - 0.9, stZC, stX1 - stX0, 0.9, stZS - stZN, deck);
  for (const x of [stX0 + 1.5, stX1 - 1.5]) {
    for (const z of [stZS - 3, stZN + 3]) {
      beam.push(mesh(new THREE.CylinderGeometry(0.4, 0.45, PLAT - 0.9, 8), concrete, x, (PLAT - 0.9) / 2, z));
      b.collider(x - 0.45, x + 0.45, z - 0.45, z + 0.45, 0, PLAT - 0.9, true);
    }
  }
  const pglass = new THREE.MeshStandardMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.32, roughness: 0.08 });
  b.box(stX0 + 0.1, PLAT, stZC, 0.12, 1.3, stZS - stZN, pglass, true, false);
  b.box((stX0 + stX1) / 2, PLAT, stZS - 0.1, stX1 - stX0, 1.3, 0.12, pglass, true, false);
  beam.push(mesh(new THREE.BoxGeometry(stX1 - stX0 + 5, 0.35, stZS - stZN + 2), mat(0xf2f4f6, 0.4, 0.4), (stX0 + stX1) / 2 + 2, PLAT + 4.1, stZC));
  for (let z = stZS - 2; z > stZN; z -= 6) beam.push(mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.0, 8), mat(0x8c8f94, 0.4, 0.7), stX0 + 0.5, PLAT + 2.0, z));
  beam.push(place(bench(), stX0 + 1.2, PLAT, stZC + 4, HALF_PI), place(bench(), stX0 + 1.2, PLAT, stZC - 4, HALF_PI));
  mergeAdd(b, beam);
  b.add(neonSign('CONVENTION CENTER', '#0b2a5a', '#ffffff', 7, 1.0, 'LAS VEGAS MONORAIL', 0.1), (stX0 + stX1) / 2, PLAT + 3.2, stZC, HALF_PI);
  b.add(mesh(new THREE.BoxGeometry(0.2, 0.06, stZS - stZN - 0.4), basic(0xffd23a), stX1 - 0.35, PLAT + 0.01, stZC));
  const stairX = stX0 + 2.9;
  stairs(b, stairX, stZN - 19.5, '+z', 2.8, PLAT, 19.5, deck);
  b.add(neonSign('MONORAIL', '#0b2a5a', '#7fd4ff', 4, 0.9, 'CONVENTION CENTER STATION', 0.12), stairX - 3.2, 3.2, stZN - 20, HALF_PI);
  b.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.8, 6), mat(0x2a2c32, 0.4, 0.6)), stairX - 3.2, 1.4, stZN - 20);
  b.pickup(stX0 + 1.3, PLAT + 0.95, stZC - 4, 3, 'Monorail Platform Bench Pack', false);
  b.staticMarkers.push({ x: (stX0 + stX1) / 2, z: stZC, color: '#7fd4ff', glyph: 'M', size: 2.6 });
  b.zone('Monorail • Convention Center Station', stX0 - 1, beamX + 2, stZN - 22, stZS);

  // ---- The train ----
  const cabGlass = new THREE.MeshStandardMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.3 });
  const winGlow = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x1b2633, roughness: 0.1, metalness: 0.5, emissive: 0xfff0d0, emissiveIntensity: 0.05 }), 0.05, 1.1);
  const livery = new THREE.MeshStandardMaterial({ map: makeSignTexture('LAS VEGAS MONORAIL', '#f2f4f6', '#0f7fb8', undefined, 'system-ui, Arial, sans-serif'), roughness: 0.4 });
  const cars: THREE.Group[] = [];
  for (let i = 0; i < MONO_CARS; i++) {
    const g = monorailCar(i === 0 ? -1 : i === MONO_CARS - 1 ? 1 : 0, cabGlass, winGlow, livery);
    b.scene.add(g);
    cars.push(g);
  }
  const pitch = MONO_CAR + 0.55;
  const half = (MONO_CARS * pitch - 0.55) / 2;
  const sMin = half + 1.5;
  const sMax = L - half - 1.5;
  let sStation = L / 2;
  for (let i = 0; i <= 800; i++) {
    curve.getPointAt(i / 800, p0);
    if (p0.z <= stZC) {
      sStation = (i / 800) * L;
      break;
    }
  }
  let sPos = sStation;
  let speed = 0;
  let state: 'dwell' | 'out' | 'turn' | 'back' = 'dwell';
  let timer = 6;
  let target = sStation;
  let legDir = 1;
  let aboard: 'none' | 'waiting' | 'riding' = 'none';
  let armed = false;
  let done = false;
  const VMAX = 15;
  const ACC = 1.3;
  const tp = new THREE.Vector3();
  const tt = new THREE.Vector3();
  const placeTrain = () => {
    for (let i = 0; i < MONO_CARS; i++) {
      const si = THREE.MathUtils.clamp(sPos + (i - (MONO_CARS - 1) / 2) * pitch, 0, L);
      curve.getPointAt(si / L, tp);
      curve.getTangentAt(si / L, tt);
      cars[i].position.copy(tp);
      cars[i].rotation.y = Math.atan2(tt.x, tt.z);
    }
  };
  placeTrain();
  b.every((dt) => {
    if (state === 'dwell') {
      timer -= dt;
      if (aboard === 'waiting') aboard = 'riding';
      if (timer <= 0) {
        state = 'out';
        target = legDir > 0 ? sMax : sMin;
        if (aboard === 'riding') armed = true;
      }
    } else if (state === 'turn') {
      timer -= dt;
      if (timer <= 0) {
        state = 'back';
        target = sStation;
      }
    } else {
      const dist = Math.abs(target - sPos);
      const want = Math.min(VMAX, Math.sqrt(2 * ACC * dist));
      speed = Math.min(want, speed + ACC * dt);
      const step = Math.min(dist, Math.max(speed, 0.4) * dt);
      sPos += Math.sign(target - sPos) * step;
      if (dist - step < 0.02) {
        sPos = target;
        speed = 0;
        if (state === 'out') {
          state = 'turn';
          timer = 5;
        } else {
          state = 'dwell';
          timer = 9;
          legDir = -legDir;
          if (armed) {
            done = true;
            armed = false;
          }
        }
      }
    }
    placeTrain();
  });
  const travelDir = () => (state === 'out' || state === 'dwell' ? legDir : -legDir);
  const leadCar = () => (travelDir() > 0 ? cars[MONO_CARS - 1] : cars[0]);
  const waitX = stX0 + 3.5;
  const waitZ = stZC;
  b.rideables.push({
    id: 'monorail-lvcc',
    kind: 'monorail',
    label: 'Las Vegas Monorail',
    boardRadius: 9,
    boardPoint: (out) => out.set((stX0 + stX1) / 2, PLAT, stZC),
    seat: (out) => {
      if (aboard !== 'riding') return out.set(waitX, PLAT + 0.02, waitZ);
      const g = leadCar();
      return out.set(0, 1.12, travelDir() * (MONO_CAR / 2 - 1.7)).applyEuler(g.rotation).add(g.position);
    },
    yaw: () => (aboard === 'riding' ? leadCar().rotation.y + (travelDir() > 0 ? 0 : Math.PI) : HALF_PI),
    exitPoint: (out) => {
      if (aboard !== 'riding' || state === 'dwell') return out.set(waitX, PLAT + 0.05, waitZ);
      const g = leadCar();
      return out.set(g.position.x - 3.6, 0.2, g.position.z);
    },
    canBoard: () => ({ ok: true }),
    onBoard: () => {
      aboard = state === 'dwell' ? 'riding' : 'waiting';
      armed = false;
      done = false;
    },
    onExit: () => {
      aboard = 'none';
      armed = false;
      done = false;
    },
    wantsExit: () => done,
    boardPrompt: 'Press [G] to ride the Las Vegas Monorail from Convention Center station',
    ridingPrompt: 'Las Vegas Monorail — front window seat. [E] smoke • [G] hop off',
    status: () => {
      if (aboard === 'waiting') return `Waiting on the platform — the train is ${state === 'back' ? 'pulling in' : 'out on the line'}…`;
      if (state === 'dwell') return `Doors open — departing ${legDir > 0 ? 'northbound' : 'southbound'} in ${Math.max(0, Math.ceil(timer))}s`;
      if (state === 'turn') return 'End of the line — the operator switches ends…';
      if (state === 'back') return 'Next stop: Convention Center';
      return legDir > 0 ? 'Northbound toward SAHARA Las Vegas' : "Southbound toward Harrah's/The LINQ";
    },
  });

  // Decorative continuation to the SAHARA station beyond the north edge
  const ext = new THREE.CatmullRomCurve3(
    [new THREE.Vector3(beamX, BEAM_TOP, -792), new THREE.Vector3(beamX, BEAM_TOP, -850), new THREE.Vector3(170, BEAM_TOP, -886), new THREE.Vector3(132, BEAM_TOP, -904), new THREE.Vector3(106, BEAM_TOP, -908)],
    false,
    'centripetal'
  );
  const EL = ext.getLength();
  const extParts: THREE.Object3D[] = [];
  const en = Math.ceil(EL / 5);
  for (let i = 0; i < en; i++) {
    ext.getPointAt(i / en, p0);
    ext.getPointAt((i + 1) / en, p1);
    extParts.push(part(new THREE.BoxGeometry(0.9, 1.5, p0.distanceTo(p1) + 0.06), concrete, (p0.x + p1.x) / 2, BEAM_TOP - 0.75, (p0.z + p1.z) / 2, Math.atan2(p1.x - p0.x, p1.z - p0.z)));
    if (i % 4 === 2) extParts.push(mesh(new THREE.CylinderGeometry(0.55, 0.7, BEAM_TOP - 1.5, 10), concrete, p0.x, (BEAM_TOP - 1.5) / 2, p0.z));
  }
  extParts.push(mesh(new THREE.BoxGeometry(10, 0.9, 30), deck, 100, PLAT - 0.45, -908), mesh(new THREE.BoxGeometry(12, 0.4, 32), mat(0xf2f4f6, 0.4, 0.4), 101, PLAT + 4, -908));
  mergeAdd(b, extParts, false);
  b.add(neonSign('SAHARA LAS VEGAS', '#0b2a5a', '#ffffff', 8, 1.1, 'MONORAIL STATION', 0.1), 100, PLAT + 2.6, -893, 0);
}

// =============================================================== Fontainebleau (tallest in Nevada)
function buildFontainebleau(b: WorldBuilder): void {
  const zS = zFromS(2692);
  const zN = -798;
  plaza(b, 19, 30, zS, zN, '#e4e2dc', '#c7c4bc');
  const white = mat(0xf2f1ee, 0.5, 0.2);
  b.box(38, 0, -765, 16, 12, 54, white, true);
  const blueGlow = glassGlow(b, 0x1c3a6c, 0xd8ecff, 1.3);
  for (const y of [4.5, 9]) b.add(mesh(new THREE.BoxGeometry(16.3, 1.4, 54.3), blueGlow, 38, y, -765));
  // Blue glass in a white mullion grid
  const fbSkin: FacadeSpec = { wall: '#dfe8f2', mullion: '#e8f0f8', glass: '#2f66a0', lit: '#e8f2ff', cols: 10, rows: 34, style: 2, seed: 250 };
  const fcx = -10;
  const fcz = -765;
  const fR = 70;
  const fa0 = -0.14 * Math.PI;
  const fa1 = 0.14 * Math.PI;
  const fsegs = 6;
  const fH = 76;
  curvedTower(b, fcx, fcz, fR, fa0, fa1, fsegs, 14, fH, fbSkin, 0.7, { rough: 0.2, ledFins: false, wash: 0xcfe6ff, washZone: 18 });
  // Lit crown fins along the arc
  const crownMat = new THREE.MeshBasicMaterial({ color: 0xcfe6ff });
  const segLen = (fR * (fa1 - fa0)) / fsegs;
  for (let i = 0; i < fsegs; i++) {
    const a = fa0 + ((i + 0.5) / fsegs) * (fa1 - fa0);
    const stepH = fH * (0.86 + 0.14 * Math.sin(((i + 0.5) / fsegs) * Math.PI));
    const r = fR - 6.6;
    b.add(part(new THREE.BoxGeometry(segLen * 1.04, 4, 0.6), crownMat, fcx + Math.cos(a) * r, stepH + 2.4, fcz + Math.sin(a) * r, -a + HALF_PI));
  }
  b.every((_dt, t, night) => {
    crownMat.color.setHSL(0.6 + 0.07 * Math.sin(t * 0.25), 0.1 + 0.7 * night, 0.72 + 0.1 * night);
  });
  b.add(neonSign('FONTAINEBLEAU', '#0b1730', '#e8f2ff', 16, 2.4), fcx + fR - 7 - 0.55, fH - 6, fcz, -HALF_PI);

  // Porte-cochère, signage, the bowtie, LIV
  const steel = mat(0xd9dee4, 0.2, 0.85);
  b.add(mesh(new THREE.BoxGeometry(8, 0.5, 16), mat(0x1c2a44, 0.4, 0.5), 25.5, 6.2, -765, true));
  b.add(mesh(new THREE.BoxGeometry(7.6, 0.05, 15.6), basic(0xeaf4ff), 25.5, 5.93, -765));
  for (const [x, z] of [
    [22.6, -758],
    [28.4, -758],
    [22.6, -772],
    [28.4, -772],
  ]) b.box(x, 0, z, 0.6, 6, 0.6, steel, true);
  b.add(neonSign('FONTAINEBLEAU', '#0c1a33', '#ffffff', 14, 2.0, 'LAS VEGAS', 0.2), 29.8, 10, -765, -HALF_PI);
  b.add(neonSign('LIV', '#000000', '#ffffff', 4, 1.6, 'NIGHTCLUB', 0.15), 29.8, 8.0, -786, -HALF_PI);
  b.box(24, 0, -762, 0.8, 0.8, 0.8, mat(0x1c2a44, 0.5, 0.4));
  b.pickup(24, 1.25, -762, 3, "LIV Bouncer's Confiscated Pack", false);
  b.box(25, 0, -745, 2.4, 1.2, 2.4, white, true);
  b.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, 2.6, 10), steel, 25, 2.5, -745));
  for (const s of [-1, 1]) b.add(part(new THREE.ConeGeometry(2, 3.4, 24), steel, 25, 3.8, -745 - s * 1.7, 0, s * HALF_PI));
  const fbLed = new LedBoard('FONTAINEBLEAU', ['TALLEST IN NEVADA • 67 FLOORS', 'LIV NIGHTCLUB • TONIGHT', 'BLEAULIVE THEATER', 'LAS VEGAS'], ['#2c5a9a', '#0b1730', '#5a8ad0', '#1c3a6c']);
  ledPylon(b, fbLed, 21.4, -738, 20, 7, 0x1c2a44);
  const palms: THREE.Object3D[] = [];
  for (const z of [-752, -780, -793]) palms.push(place(palmTree(8, false, Math.round(-z)), 23.3, 0, z));
  mergeAdd(b, palms);

  b.building(38, -765, 16, 54, '#f2f1ee', 'Fontainebleau');
  b.building(58, -765, 14, 56, '#2c5a9a');
  b.zone('Fontainebleau Las Vegas', 19, 75, zN, zS);
  b.crowd.tourists.push({ pts: [[22, -733], [27, -795]], prop: 'yard-drink' }, { pts: [[29, -757], [21, -776]], prop: 'camera' });
}

// =============================================================== Backdrop past the north edge (no collisions)
function buildNorthBackdrop(b: WorldBuilder): void {
  // The Boulevard keeps going toward the STRAT
  const z0 = -804;
  const z1 = -1090;
  const len = z0 - z1;
  const road = mesh(new THREE.PlaneGeometry(23.2, len), new THREE.MeshStandardMaterial({ map: makeBoulevardTexture(len, 11.6, [4.8, 8.2, 11.6], 1.4), roughness: 0.82 }), 0, 0.03, (z0 + z1) / 2);
  road.rotation.x = -HALF_PI;
  b.add(road);
  for (const s of [-1, 1]) b.add(part(new THREE.PlaneGeometry(7.4, len), mat(0x9a9085, 0.85), s * 15.3, 0.02, (z0 + z1) / 2, 0, -HALF_PI));
  b.add(mesh(new THREE.BoxGeometry(2.8, 0.22, len), mat(0xb8ad9c, 0.85), 0, 0.11, (z0 + z1) / 2));

  // SAHARA (east side)
  const sz0 = zFromS(3390);
  const sz1 = zFromS(3685);
  const sahara: FacadeSpec = { wall: '#efe6d8', mullion: '#ffffff', glass: '#6a5a4a', lit: '#ffe6b8', cols: 10, rows: 26, style: 1, seed: 501 };
  tower(b, { x: 54, z: sz0 - 22, w: 14, d: 38, h: 34, facade: sahara, collide: false, cast: false });
  tower(b, { x: 72, z: sz1 + 14, w: 38, d: 13, h: 30, facade: { ...sahara, seed: 503 }, collide: false, cast: false });
  tower(b, { x: 38, z: sz1 + 10, w: 12, d: 24, h: 26, facade: { ...sahara, seed: 505 }, collide: false, cast: false });
  b.add(mesh(new THREE.BoxGeometry(32, 10, 58), mat(0xd9cdb8, 0.7), 40, 5, (sz0 + sz1) / 2));
  b.add(mesh(new THREE.BoxGeometry(1.6, 24, 1.6), mat(0x3a2a20, 0.5, 0.4), 22.5, 12, sz0 - 4));
  b.add(neonSign('SAHARA', '#1a0b05', '#ffd9a8', 10, 3.2, 'LAS VEGAS'), 22.5, 24, sz0 - 4, -HALF_PI);
  b.add(neonSign('SAHARA', '#1a0b05', '#ff6a3a', 12, 3), 46.7, 30, sz0 - 22, -HALF_PI);

  // The STRAT (350 m real) with its thrill rides
  const sx = xFromO(-46);
  const szz = zFromS(4046);
  const shaft = mat(0xe8e4dc, 0.6);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + HALF_PI;
    b.add(mesh(new THREE.CylinderGeometry(1.8, 3.2, 104, 6), shaft, sx + Math.cos(a) * 3.2, 52, szz + Math.sin(a) * 3.2));
    b.add(mesh(new THREE.BoxGeometry(0.25, 96, 0.25), basic(0xfff4e0), sx + Math.cos(a) * 5.2, 52, szz + Math.sin(a) * 5.2));
  }
  b.add(mesh(new THREE.CylinderGeometry(2.2, 3.0, 104, 10), shaft, sx, 52, szz));
  b.add(mesh(new THREE.CylinderGeometry(8.6, 4.6, 5, 28), mat(0xdcd6cc, 0.5, 0.3), sx, 106.5, szz));
  b.add(mesh(new THREE.CylinderGeometry(9.2, 8.6, 3, 32), glassGlow(b, 0x2a3a4a, 0xffe6c0, 1.2), sx, 110.5, szz));
  b.add(mesh(new THREE.CylinderGeometry(8.6, 9.2, 2.4, 32), mat(0xdcd6cc, 0.5, 0.3), sx, 113.2, szz));
  b.add(mesh(new THREE.CylinderGeometry(6.2, 8.4, 2, 28), mat(0xcfc8bc, 0.5, 0.3), sx, 115.4, szz));
  b.add(part(new THREE.TorusGeometry(9.35, 0.35, 6, 40), basic(0xff3355), sx, 109, szz, 0, HALF_PI));
  b.add(mesh(new THREE.CylinderGeometry(0.9, 1.6, 26, 10), mat(0xaaaaaa, 0.4, 0.7), sx, 129.4, szz));
  b.add(mesh(new THREE.SphereGeometry(0.5, 8, 6), basic(0xff2020), sx, 142.8, szz));
  b.add(neonSign('THE STRAT', '#140404', '#ff3355', 8, 1.8), sx, 110.5, szz + 9.5);
  tower(b, { x: sx - 24, z: szz - 8, w: 14, d: 34, h: 26, facade: { wall: '#f2efe8', mullion: '#ffffff', glass: '#5a6a7a', lit: '#ffe6b8', cols: 10, rows: 20, seed: 511 }, collide: false, cast: false });
  b.add(mesh(new THREE.BoxGeometry(18, 9, 22), mat(0xe2dccf, 0.7), sx - 2, 4.5, szz + 16));
  b.add(neonSign('THE STRAT', '#140404', '#ff3355', 9, 2.2, 'HOTEL • CASINO • SKYPOD'), -21.5, 9, szz + 28, HALF_PI);
  b.add(mesh(new THREE.BoxGeometry(1.2, 8, 1.2), mat(0x2a2a30, 0.5, 0.4)), -21.5, 4, szz + 28);
  // Big Shot (up the needle), Insanity (spinning arm), X-Scream (see-saw)
  const ridesMat = mat(0xf2c230, 0.5, 0.4);
  const bigShot = new THREE.Group();
  bigShot.add(part(new THREE.TorusGeometry(2.0, 0.35, 6, 20), ridesMat, 0, 0, 0, 0, HALF_PI));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    bigShot.add(mesh(new THREE.BoxGeometry(0.6, 0.7, 0.6), mat(0x2a66cc, 0.5), Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4));
  }
  bakeGroup(bigShot);
  bigShot.position.set(sx, 118, szz);
  b.scene.add(bigShot);
  const insanity = new THREE.Group();
  insanity.add(mesh(new THREE.BoxGeometry(12, 0.6, 0.8), mat(0xd8202a, 0.5, 0.4), 6, 0, 0));
  const spinner = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    spinner.add(mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), mat(0xf2c230, 0.5), Math.cos(a) * 1.6, -1.2, Math.sin(a) * 1.6));
  }
  spinner.add(mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 12), mat(0xd8202a, 0.5, 0.4), 0, -0.4, 0));
  bakeGroup(spinner);
  spinner.position.set(12, 0, 0);
  insanity.add(spinner);
  insanity.position.set(sx, 117, szz);
  b.scene.add(insanity);
  const xscream = new THREE.Group();
  xscream.add(mesh(new THREE.BoxGeometry(14, 0.5, 1.0), mat(0x2a66cc, 0.5, 0.4), 4, 0, 0));
  xscream.add(mesh(new THREE.BoxGeometry(1.6, 1.0, 1.4), mat(0xf2c230, 0.5), 10.5, 0.6, 0));
  bakeGroup(xscream);
  xscream.position.set(sx, 117.5, szz);
  xscream.rotation.y = Math.PI * 0.8;
  b.scene.add(xscream);
  b.every((_dt, t) => {
    const c = t % 10;
    bigShot.position.y = c < 1 ? 118 + 22 * c : c < 6 ? 140 - ((c - 1) / 5) * 22 + Math.sin(c * 6) * 0.6 * (6 - c) * 0.2 : 118;
    insanity.rotation.y = t * 0.9;
    spinner.rotation.y = t * 3.2;
    insanity.rotation.z = -0.35 - 0.25 * Math.sin(t * 0.5);
    xscream.rotation.z = -0.25 + 0.3 * Math.sin(t * 0.7);
  });

  // Bonanza "World's Largest Gift Shop" (west side)
  const bz = -900;
  b.add(mesh(new THREE.BoxGeometry(38, 8, 24), mat(0xe6dcc8, 0.7), -41, 4, bz));
  b.add(mesh(new THREE.BoxGeometry(1.2, 12, 1.2), mat(0x3a2a20, 0.5, 0.4), -21.5, 6, bz + 9));
  b.add(neonSign('BONANZA', '#3a1405', '#ffcf3a', 9, 2.8, "WORLD'S LARGEST GIFT SHOP"), -21.5, 13.5, bz + 9, HALF_PI);
  b.add(neonSign('GIFTS • SOUVENIRS • T-SHIRTS', '#3a1405', '#ffffff', 16, 1.4, undefined, 0.2), -21.9, 6.6, bz, HALF_PI);

  // Wedding chapels
  const chapel = (x: number, z: number, wallC: number, name: string, sub: string, fg: string, faceX: number) => {
    b.add(mesh(new THREE.BoxGeometry(9, 6, 12), mat(wallC, 0.7), x + faceX * -4.5, 3, z));
    b.add(part(new THREE.ConeGeometry(1.2, 4, 4), mat(0xffffff, 0.6), x + faceX * -4.5, 8, z, Math.PI / 4));
    b.add(mesh(new THREE.BoxGeometry(0.8, 9, 0.8), mat(0x2a2a30, 0.5, 0.4), x + faceX * 1.4, 4.5, z + 7));
    b.add(neonSign(name, '#fff6fa', fg, 10, 1.7, sub, 0.25), x + faceX * 1.4, 9.8, z + 7, HALF_PI);
  };
  chapel(-26, -968, 0xfaf8f4, 'A LITTLE WHITE WEDDING CHAPEL', 'DRIVE-UP WEDDINGS • OPEN 24 HOURS', '#d81e5b', 1);
  chapel(26, -1000, 0xffd6ea, 'VIVA LAS VEGAS WEDDING CHAPEL', 'ELVIS WEDDINGS DAILY', '#7a2cff', -1);
}

// =============================================================== Sidewalk crowds through the district
function addSidewalkCrowds(b: WorldBuilder): void {
  const cc = Z_CCDR;
  const conv = Z_CONV;
  b.crowd.tourists.push(
    { pts: [[-16, -422], [-16, cc + 10]], prop: 'camera' },
    { pts: [[-14.5, cc + 12], [-14.5, -424]], prop: 'yard-drink' },
    { pts: [[-17.6, -478], [-17.6, -640]], prop: 'bag' },
    { pts: [[-15.2, -700], [-15.2, -560]], prop: 'cig' },
    { pts: [[-16, cc - 10], [-16, -796]], prop: 'cig' },
    { pts: [[-14.6, -794], [-14.6, cc - 11]], prop: 'camera' },
    { pts: [[16, -422], [16, conv + 10]], prop: 'yard-drink' },
    { pts: [[14.5, conv + 12], [14.5, -424]], prop: 'camera' },
    { pts: [[17.4, -500], [17.4, -580]], prop: 'cig' },
    { pts: [[16, conv - 10], [16, -796]], prop: 'cig' },
    { pts: [[14.5, -794], [14.5, conv - 12]], prop: 'bag' },
    { pts: [[17.6, -650], [17.6, -760]], prop: 'yard-drink' }
  );
}
