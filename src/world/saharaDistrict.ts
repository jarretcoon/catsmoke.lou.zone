import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { tower } from './buildings';
import type { FacadeSpec } from './textures';
import { LedBoard, makeDesertTexture, makeRoadPaintTexture } from './textures';
import { basic, mat, mesh } from './props';
import { STRIP, saharaPhase } from './strip';
import { bulbPath, driveLed, letterFace, letters, neonFace, neonPanel, neonText, part, placed } from './signKit';
import { L0, Merger, canvasTex, palmInto, paving, v3 } from './southKit';
import { ParkedLotBuilder, flatRoad } from './westKit';
import { stratSign } from './stripSigns';

/**
 * The north end, Sky Las Vegas → Sahara Ave → Bob Stupak Ave (the foot of the STRAT), built from the OpenStreetMap
 * layout (catsmoke-notes/reference/north): real s/o positions through zFromS/xFromO, with Sahara Ave itself kept at
 * z −936 (16 m north of its zFromS spot, because the Circus Circus block upstream is stretched).
 *
 *  West, south → north: Hilton Grand Vacations on the Boulevard · the Las Vegas Festival Grounds · SAHARA AVE ·
 *    Bonanza Gift Shop ("World's Largest Gift Shop", a walk-in with a working souvenir counter) · Allure · Ahern ·
 *    the Circle K and the El Mirador Motel at Bob Stupak Ave.
 *  East, south → north: the empty ex-Wet 'n Wild lot (north end of the Fontainebleau's block) · SAHARA Las Vegas
 *    (Alexandria, Blanca and Marra towers, the round porte-cochère, the LED-wrapped tower, Bazaar Meat) · the
 *    Sahara garage · Paradise Rd and the monorail's SAHARA station · Turnberry Towers · SAHARA AVE · Walgreens ·
 *    Essence · Chapel of the Bells · McDonald's · Paradise Rd north · Starbucks · 7-Eleven.
 *  Beyond the edge (backdrop, no colliders): the STRAT (350 m, Big Shot, X-Scream, Insanity), the Aztec Inn, the
 *    Las Vegas Boulevard Gateway Arches, Holiday Motel, Little Vegas Chapel, Atomic Golf, IHOP, the chapels.
 *
 * Sahara Ave & Las Vegas Blvd is a real at-grade intersection: the signals, phases and cross traffic live in
 * strip.ts (STRIP.saharaZ / saharaPhase); the road surface, crosswalks, stop bars, turn arrows, ped heads, medians
 * and street lights are here.
 */
export function buildSaharaDistrict(b: WorldBuilder): void {
  const k = new Kit(b);
  buildSaharaAve(b, k);
  buildSahara(b, k);
  buildSaharaEastBack(b, k);
  buildHgvBoulevard(b, k);
  buildFestivalGrounds(b, k);
  buildBonanza(b, k);
  buildNorthWest(b, k);
  buildNorthEast(b, k);
  buildBeyondTheEdge(b, k);
  addCrowds(b);
  k.flush();
}

const HALF_PI = Math.PI / 2;
const Z = STRIP.saharaZ;
const SH = STRIP.saharaHalf;
/** Curb lines and outer sidewalk edges of Sahara Ave. */
const CURB_S = Z + SH;
const CURB_N = Z - SH;
const WALK_S = CURB_S + 4;
const WALK_N = CURB_N - 4;
const BLVD = STRIP.curb;
/** The walkable map edges (backdrop.ts walls them). */
const X_W = STRIP.flamingoWest + 2;
const X_E = STRIP.flamingoEast - 2;
const EDGE_N = STRIP.north - 4;

// =============================================================== shared kit
/** Shared materials + the static merger for the whole district (one draw per material after the bake). */
class Kit {
  readonly mg = new Merger();
  readonly lots = new ParkedLotBuilder();
  readonly concrete = mat(0xb9b2a6, 0.85);
  readonly curb = mat(0xb4ada1, 0.8);
  readonly darkSteel = mat(0x2a2c32, 0.5, 0.5);
  readonly steel = mat(0x8c8f94, 0.45, 0.6);
  readonly white = mat(0xf2f0ea, 0.6);
  readonly stucco = mat(0xe6dccb, 0.85);
  readonly roof = mat(0x5a5652, 0.85);
  readonly glass: THREE.MeshStandardMaterial;
  readonly shopGlass: THREE.MeshStandardMaterial;
  readonly paint = new THREE.MeshStandardMaterial({ map: makeRoadPaintTexture(), color: 0xd8d6cf, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  readonly yellowPaint = new THREE.MeshStandardMaterial({ color: 0xd8a632, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  readonly asphalt = mat(0x2c2d32, 0.9);
  readonly lotAsphalt = mat(0x34353a, 0.92);
  readonly dirt = new THREE.MeshStandardMaterial({ map: (() => { const t = makeDesertTexture(); t.repeat.set(8, 8); return t; })(), color: 0xc8b28e, roughness: 1 });
  readonly gravel = mat(0xa59479, 0.97);
  readonly hedge = mat(0x3f5a30, 0.9);
  readonly lampHead = basic(0xffe2a8);
  constructor(readonly b: WorldBuilder) {
    this.glass = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x1d2a36, roughness: 0.15, metalness: 0.6, emissive: 0xffdcaa, emissiveIntensity: 0.1 }), 0.1, 1.1);
    // storefront glass: dark by day, a warm shop glow at night that stays under the bloom threshold
    this.shopGlass = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x182028, roughness: 0.1, metalness: 0.5, emissive: 0xffd8a8, emissiveIntensity: 0.03 }), 0.03, 0.3);
  }
  box(m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, cast = false): void {
    this.mg.box(m, x, y, z, w, h, d, ry, cast);
  }
  /** Solid block from the ground with a collider (wall = true). */
  solid(m: THREE.Material, x0: number, x1: number, z0: number, z1: number, h: number, y = 0, cast = true): void {
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    this.mg.box(m, cx, y + h / 2, cz, w, h, d, 0, cast);
    this.b.collider(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, y, y + h, true);
  }
  /** Flat ground patch (no collider). */
  flat(m: THREE.Material, x0: number, x1: number, z0: number, z1: number, y = L0): void {
    const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)).rotateX(-HALF_PI);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    this.mg.add(g, m);
  }
  palm(x: number, z: number, h = 8, seed = 0): void {
    palmInto(this.mg, x, z, h, seed || Math.round(Math.abs(x * 7 + z * 3)));
  }
  /** Shared cobra-head street light, arm toward `armYaw`. */
  cobra(x: number, z: number, armYaw: number, h = 10, armLen = 3): void {
    const sx = Math.sin(armYaw);
    const sz = Math.cos(armYaw);
    this.mg.beam(this.steel, v3(x, 0, z), v3(x, h, z), 0.12, 6, 0.08);
    this.mg.beam(this.steel, v3(x, h - 0.15, z), v3(x + sx * armLen, h + 0.35, z + sz * armLen), 0.06, 5, 0.045);
    this.mg.box(this.steel, x + sx * armLen, h + 0.4, z + sz * armLen, 0.7, 0.16, 0.36, armYaw);
    this.mg.box(this.lampHead, x + sx * armLen, h + 0.3, z + sz * armLen, 0.5, 0.06, 0.26, armYaw);
    this.b.collider(x - 0.16, x + 0.16, z - 0.16, z + 0.16, 0, h, true);
  }
  /** A painted parking lot (asphalt + stall lines along x or z) with instanced parked cars. */
  lot(x0: number, x1: number, z0: number, z1: number, rowsAlongX: boolean, fill: number, seed: number): void {
    const xa = Math.min(x0, x1);
    const xb = Math.max(x0, x1);
    const za = Math.min(z0, z1);
    const zb = Math.max(z0, z1);
    this.flat(this.lotAsphalt, xa, xb, za, zb, 0.012);
    // stall rows: 5.4 m deep, 2.7 m wide, double-loaded on a 6.5 m aisle (17.3 m module)
    if (rowsAlongX) {
      for (let z = za + 0.4; z + 5.4 <= zb; z += 17.3) {
        for (const rz of [z, z + 11.9]) {
          if (rz + 5.4 > zb) continue;
          for (let x = xa + 0.8; x <= xb - 0.8; x += 2.7) this.box(this.paint, x, 0.02, rz + 2.7, 0.12, 0.01, 5.0);
          const cols = Math.floor((xb - xa - 1.6) / 2.7);
          if (cols > 0) this.lots.bays(xa + 2.15, xa + 2.15 + (cols - 1) * 2.7, rz + 2.7, rz + 2.7, cols, 1, rz === z ? 0 : Math.PI, fill, seed++);
        }
      }
    } else {
      for (let x = xa + 0.4; x + 5.4 <= xb; x += 17.3) {
        for (const rx of [x, x + 11.9]) {
          if (rx + 5.4 > xb) continue;
          for (let z = za + 0.8; z <= zb - 0.8; z += 2.7) this.box(this.paint, rx + 2.7, 0.02, z, 5.0, 0.01, 0.12);
          const rowsN = Math.floor((zb - za - 1.6) / 2.7);
          if (rowsN > 0) this.lots.bays(rx + 2.7, rx + 2.7, za + 2.15, za + 2.15 + (rowsN - 1) * 2.7, 1, rowsN, rx === x ? HALF_PI : -HALF_PI, fill, seed++);
        }
      }
    }
  }
  flush(): void {
    this.mg.flush(this.b);
    this.lots.emit(this.b, 20, -936, 420);
  }
}

/** A plane facing +z, its UVs scaled so a texture repeats every `tileW` × `tileH` m. */
function tiledPlane(w: number, h: number, tileW: number, tileH: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tileW, (uv.getY(i) * h) / tileH);
  return g;
}

function repeatTex(t: THREE.CanvasTexture): THREE.CanvasTexture {
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A wall-mounted facade plane at (x, y, z) facing `ry` (0 = +z). */
function facade(b: WorldBuilder, m: THREE.Material, w: number, h: number, tileW: number, tileH: number, x: number, y: number, z: number, ry: number): void {
  const p = new THREE.Mesh(tiledPlane(w, h, tileW, tileH), m);
  p.position.set(x, y, z);
  p.rotation.y = ry;
  p.receiveShadow = true;
  b.add(p);
}

// =============================================================== Sahara Ave & the intersection
/** Asphalt for Sahara Ave: 32 m along the street × 30 m across, four lanes each way, double yellow centre. */
function saharaRoadTexture(): THREE.CanvasTexture {
  return repeatTex(
    canvasTex(1024, 512, (ctx, W, H) => {
      const ppmX = W / 32;
      const ppmZ = H / (SH * 2);
      const zy = (dz: number) => H / 2 + dz * ppmZ;
      ctx.fillStyle = '#2a2b30';
      ctx.fillRect(0, 0, W, H);
      let s = 9137;
      const R = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < 26000; i++) {
        const v = R();
        ctx.fillStyle = v < 0.5 ? `rgba(110,110,116,${0.12 + v * 0.3})` : `rgba(10,10,12,${0.1 + (v - 0.5) * 0.5})`;
        ctx.fillRect(R() * W, R() * H, 2, 2);
      }
      // wheel paths in every lane
      for (const lc of [3.3, 6.6, 10.0, 13.3]) {
        for (const sgn of [-1, 1]) {
          for (const off of [-0.8, 0.8]) {
            const y = zy(sgn * (lc + off));
            const g = ctx.createLinearGradient(0, y - 10, 0, y + 10);
            g.addColorStop(0, 'rgba(8,8,10,0)');
            g.addColorStop(0.5, 'rgba(8,8,10,0.28)');
            g.addColorStop(1, 'rgba(8,8,10,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, y - 10, W, 20);
          }
        }
      }
      // cracks + oil drips
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = 'rgba(6,6,8,0.8)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        let x = R() * W;
        let y = R() * H;
        ctx.moveTo(x, y);
        for (let j = 0; j < 6; j++) ctx.lineTo((x += (R() - 0.5) * 60), (y += (R() - 0.5) * 30));
        ctx.stroke();
      }
      // double yellow centre line
      ctx.fillStyle = 'rgba(226,181,60,0.95)';
      ctx.fillRect(0, zy(-0.22) - 3, W, 5);
      ctx.fillRect(0, zy(0.22) - 2, W, 5);
      // white lane dashes (3 m dash, 9 m gap … 4 per tile here: 3 m / 5 m) and the solid edge lines
      ctx.fillStyle = 'rgba(236,234,226,0.9)';
      for (const dz of [4.95, 8.3, 11.65]) for (const sgn of [-1, 1]) for (let x = 0; x < W; x += 8 * ppmX) ctx.fillRect(x + ppmX, zy(sgn * dz) - 3, 3 * ppmX, 6);
      for (const sgn of [-1, 1]) ctx.fillRect(0, zy(sgn * 14.6) - 3, W, 5);
    })
  );
}

/** Ped signal face: walking person / flashing hand with the countdown / steady hand. */
function pedHeadMaterial(b: WorldBuilder, state: (t: number) => { walk: boolean; secs: number }): THREE.MeshBasicMaterial {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex, color: 0xdddddd });
  let last = '';
  b.every((_dt, t) => {
    const st = state(performance.now() / 1000);
    const flash = !st.walk && st.secs > 0;
    const on = !flash || Math.floor(t * 2) % 2 === 0;
    const key = `${st.walk}|${st.secs}|${on}`;
    if (key === last) return;
    last = key;
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, 0, 128, 64);
    if (st.walk) {
      ctx.fillStyle = '#f4f4f0';
      ctx.beginPath();
      ctx.arc(31, 12, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#f4f4f0';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(31, 20);
      ctx.lineTo(29, 38);
      ctx.moveTo(29, 38);
      ctx.lineTo(20, 56);
      ctx.moveTo(29, 38);
      ctx.lineTo(38, 56);
      ctx.moveTo(30, 24);
      ctx.lineTo(20, 34);
      ctx.moveTo(30, 24);
      ctx.lineTo(40, 32);
      ctx.stroke();
    } else if (on) {
      ctx.fillStyle = '#ff7a1a';
      ctx.fillRect(18, 24, 26, 28);
      for (let i = 0; i < 4; i++) ctx.fillRect(18 + i * 6.8, 8 + (i === 0 || i === 3 ? 6 : 0), 5, 18);
      ctx.fillRect(40, 30, 10, 6);
    }
    if (st.secs > 0) {
      ctx.fillStyle = '#ff7a1a';
      ctx.font = 'bold 40px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(st.secs), 92, 34);
    }
    tex.needsUpdate = true;
  });
  return m;
}

/** Arrow decals: 0 = left, 1 = straight, 2 = straight + right, 3 = right. One shared texture. */
function arrowMaterial(): THREE.MeshStandardMaterial {
  const t = canvasTex(512, 256, (ctx) => {
    ctx.clearRect(0, 0, 512, 256);
    ctx.fillStyle = 'rgba(236,234,226,0.92)';
    const stem = (cx: number) => ctx.fillRect(cx - 7, 120, 14, 130);
    const head = (cx: number, cy: number, dir: 'up' | 'left' | 'right') => {
      ctx.beginPath();
      if (dir === 'up') {
        ctx.moveTo(cx, cy - 40);
        ctx.lineTo(cx - 26, cy + 10);
        ctx.lineTo(cx + 26, cy + 10);
      } else {
        const s = dir === 'left' ? -1 : 1;
        ctx.moveTo(cx + s * 44, cy);
        ctx.lineTo(cx + s * 4, cy - 24);
        ctx.lineTo(cx + s * 4, cy + 24);
      }
      ctx.closePath();
      ctx.fill();
    };
    // left
    stem(64);
    ctx.fillRect(30, 108, 41, 14);
    head(30, 115, 'left');
    // straight
    stem(192);
    ctx.fillRect(185, 60, 14, 70);
    head(192, 50, 'up');
    // straight + right
    stem(320);
    ctx.fillRect(313, 60, 14, 70);
    head(320, 50, 'up');
    ctx.fillRect(320, 140, 30, 14);
    head(350, 147, 'right');
    // right
    stem(448);
    ctx.fillRect(441, 108, 34, 14);
    head(474, 115, 'right');
  });
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

/** Lay an arrow decal (kind 0..3) flat at (x, z), pointing along `ry` (0 = toward −z, the arrow's "up"). */
function arrowAt(mg: Merger, m: THREE.Material, kind: number, x: number, z: number, ry: number): void {
  const g = new THREE.PlaneGeometry(1.4, 5.6);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (kind + uv.getX(i)) / 4);
  g.rotateX(-HALF_PI);
  g.rotateY(ry);
  g.translate(x, 0.058, z);
  mg.add(g, m);
}

function buildSaharaAve(b: WorldBuilder, k: Kit): void {
  const mg = k.mg;
  // --- road surface: west leg, the box, east leg (the box has no lane paint)
  const roadMat = new THREE.MeshStandardMaterial({ map: saharaRoadTexture(), roughness: 0.86 });
  for (const [x0, x1] of [
    [X_W - 2, -BLVD],
    [BLVD, X_E + 2],
  ]) {
    const len = x1 - x0;
    const g = new THREE.PlaneGeometry(len, SH * 2);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 32);
    const m = new THREE.Mesh(g, roadMat);
    m.rotation.x = -HALF_PI;
    m.position.set((x0 + x1) / 2, 0.036, Z);
    m.receiveShadow = true;
    b.add(m);
    b.feature({ kind: 'road', x: (x0 + x1) / 2, z: Z, w: len, d: SH * 2, color: '#3b3a40', label: x0 < 0 ? 'W Sahara Ave' : 'E Sahara Ave' });
  }
  const boxM = new THREE.Mesh(new THREE.PlaneGeometry(BLVD * 2, SH * 2), mat(0x2b2c31, 0.88));
  boxM.rotation.x = -HALF_PI;
  boxM.position.set(0, 0.04, Z);
  boxM.receiveShadow = true;
  b.add(boxM);
  b.zone('Sahara Ave & Las Vegas Blvd', -BLVD - 8, BLVD + 8, CURB_N - 4, CURB_S + 4);
  b.zone('W Sahara Ave', X_W, -BLVD - 8, CURB_N, CURB_S);
  b.zone('E Sahara Ave', BLVD + 8, X_E, CURB_N, CURB_S);

  // --- curbs along Sahara Ave (the Blvd's own curbs stop at the corners: strip.ts)
  for (const s of [-1, 1]) {
    // driveway / Paradise Rd mouths break the curb (south: Paradise Rd; north: Bonanza lot, Walgreens lot, Paradise Rd)
    const cuts: Array<[number, number]> = s > 0 ? [[94, 106]] : [[-36, -26], [26, 34], [50, 62]];
    for (const [x0, x1] of [
      [X_W - 2, -BLVD],
      [BLVD, X_E + 2],
    ]) {
      let a = x0;
      const stops = cuts.filter(([c0]) => c0 > x0 && c0 < x1).concat([[x1, x1]]);
      for (const [c0, c1] of stops) {
        if (c0 - a > 0.5) k.box(k.curb, (a + c0) / 2, 0.08, Z + s * (SH + 0.15), c0 - a, 0.16, 0.3);
        a = Math.max(a, c1);
      }
    }
  }

  // --- crosswalks: continental bars across the Blvd (north + south legs) and across Sahara (east + west legs)
  for (const s of [-1, 1]) {
    for (let i = -9; i <= 9; i++) k.box(k.paint, i * 1.2, 0.05, Z + s * (SH + 2.5), 0.6, 0.01, 4);
    for (let i = -12; i <= 12; i++) k.box(k.paint, s * (BLVD + 3.7), 0.05, Z + i * 1.2, 4, 0.01, 0.6);
  }
  // stop bars: SB (west half, from the north), NB (east half, from the south), EB (south half, from the west), WB
  k.box(k.paint, -(BLVD + STRIP.medianHalf) / 2, 0.05, Z - SH - 5.1, BLVD - STRIP.medianHalf, 0.01, 0.45);
  k.box(k.paint, (BLVD + STRIP.medianHalf) / 2, 0.05, Z + SH + 5.1, BLVD - STRIP.medianHalf, 0.01, 0.45);
  k.box(k.paint, -18.6, 0.05, Z + SH / 2 + 0.6, 0.45, 0.01, SH - 1.4);
  k.box(k.paint, 18.6, 0.05, Z - SH / 2 - 0.6, 0.45, 0.01, SH - 1.4);
  // the Blvd's left-turn bays (median cut by strip.ts) get a yellow nose and lane arrows
  const arrows = arrowMaterial();
  const lanes = STRIP.laneCenters;
  for (const d of [8, 30]) {
    // southbound (x < 0, heading +z: arrow "up" = +z → ry = π)
    arrowAt(mg, arrows, 0, -lanes[0], Z - SH - 5.1 - d, Math.PI);
    arrowAt(mg, arrows, 1, -lanes[1], Z - SH - 5.1 - d, Math.PI);
    arrowAt(mg, arrows, 2, -lanes[2], Z - SH - 5.1 - d, Math.PI);
    // northbound
    arrowAt(mg, arrows, 0, lanes[0], Z + SH + 5.1 + d, 0);
    arrowAt(mg, arrows, 1, lanes[1], Z + SH + 5.1 + d, 0);
    arrowAt(mg, arrows, 2, lanes[2], Z + SH + 5.1 + d, 0);
    // eastbound on Sahara (south half, heading +x)
    arrowAt(mg, arrows, 0, -18.6 - d, Z + 3.3, -HALF_PI);
    arrowAt(mg, arrows, 1, -18.6 - d, Z + 6.6, -HALF_PI);
    arrowAt(mg, arrows, 1, -18.6 - d, Z + 10.0, -HALF_PI);
    arrowAt(mg, arrows, 3, -18.6 - d, Z + 13.3, -HALF_PI);
    // westbound (north half, heading −x)
    arrowAt(mg, arrows, 0, 18.6 + d, Z - 3.3, HALF_PI);
    arrowAt(mg, arrows, 1, 18.6 + d, Z - 6.6, HALF_PI);
    arrowAt(mg, arrows, 1, 18.6 + d, Z - 10.0, HALF_PI);
    arrowAt(mg, arrows, 3, 18.6 + d, Z - 13.3, HALF_PI);
  }
  for (const s of [-1, 1]) {
    // yellow median noses where the Blvd's raised median resumes
    k.box(k.yellowPaint, 0, 0.05, Z + s * (SH + 8.6), 2.6, 0.01, 0.4);
  }

  // --- raised medians on Sahara Ave, from the turn bays outward, with palms
  const medTop = mat(0xb8ad9c, 0.85);
  for (const [x0, x1] of [
    [X_W - 1, -46],
    [46, X_E + 1],
  ]) {
    const w = x1 - x0;
    k.box(medTop, (x0 + x1) / 2, 0.11, Z, w, 0.22, 2.6);
    k.box(k.gravel, (x0 + x1) / 2, 0.225, Z, w - 0.3, 0.01, 2.2);
    b.collider(x0, x1, Z - 1.3, Z + 1.3, 0, 0.22);
    for (let x = x0 + 8; x < x1 - 4; x += 16) k.palm(x, Z, 8.5);
  }
  // yellow double line + nose at the start of each median
  for (const s of [-1, 1]) k.box(k.yellowPaint, s * 45.4, 0.05, Z, 0.4, 0.01, 2.6);

  // --- ped signal heads on posts at the four corners
  const cyc = (t: number) => (((t + 11) % 34) + 34) % 34; // saharaPhase's cycle (strip.ts): ns go 0–17, ew go 20–31
  const crossSahara = pedHeadMaterial(b, (t) => {
    const c = cyc(t);
    if (c < 9) return { walk: true, secs: 0 };
    if (c < 17) return { walk: false, secs: Math.ceil(17 - c) };
    return { walk: false, secs: 0 };
  });
  const crossBlvd = pedHeadMaterial(b, (t) => {
    const c = cyc(t);
    if (c >= 20 && c < 25) return { walk: true, secs: 0 };
    if (c >= 25 && c < 31) return { walk: false, secs: Math.ceil(31 - c) };
    return { walk: false, secs: 0 };
  });
  void saharaPhase; // the phase itself drives the mast-arm heads in strip.ts
  const housing = k.darkSteel;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = sx * (BLVD + 1.9);
      const pz = Z + sz * (SH + 0.9);
      k.mg.beam(k.steel, v3(px, 0, pz), v3(px, 3.4, pz), 0.07, 6);
      b.collider(px - 0.1, px + 0.1, pz - 0.1, pz + 0.1, 0, 3.4, true);
      // facing across the Blvd (toward −sx)
      k.box(housing, px - sx * 0.2, 2.9, pz, 0.3, 0.42, 0.62);
      const f1 = mesh(new THREE.PlaneGeometry(0.56, 0.29), crossBlvd, px - sx * 0.36, 2.9, pz);
      f1.rotation.y = sx > 0 ? -HALF_PI : HALF_PI;
      b.add(f1);
      // facing across Sahara Ave (toward −sz)
      k.box(housing, px, 2.35, pz - sz * 0.2, 0.62, 0.42, 0.3);
      const f2 = mesh(new THREE.PlaneGeometry(0.56, 0.29), crossSahara, px, 2.35, pz - sz * 0.36);
      f2.rotation.y = sz > 0 ? Math.PI : 0;
      b.add(f2);
      // push-button box
      k.box(k.paint, px, 1.1, pz, 0.14, 0.2, 0.14);
    }
  }

  // --- cobra-head street lights both sides of Sahara Ave, sodium pools under them at night
  const pool = new THREE.MeshBasicMaterial({
    map: canvasTex(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, 'rgba(255,198,118,0.5)');
      g.addColorStop(0.45, 'rgba(255,198,118,0.18)');
      g.addColorStop(1, 'rgba(255,198,118,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const pools = new Merger();
  for (const s of [-1, 1]) {
    for (let x = X_W + 10; x < X_E - 6; x += 30) {
      if (Math.abs(x) < 30 || (x > 46 && x < 66) || (x > 90 && x < 110) || (x > -40 && x < -20)) continue;
      const z = Z + s * (SH + 0.9);
      k.cobra(x, z, s > 0 ? Math.PI : 0);
      pools.add(new THREE.PlaneGeometry(11, 11).rotateX(-HALF_PI).translate(x, 0.07, Z + s * (SH - 3)), pool);
    }
  }
  const pm = pools.flush(b, true);
  b.every((_dt, _t, night) => {
    pool.opacity = night * 0.55;
    for (const p of pm) p.visible = night > 0.05;
  });
}

// =============================================================== SAHARA Las Vegas (east, south of Sahara Ave)
/** White podium panels with the 2019 diamond lattice in thin gold lines (the lines light up at night). */
function latticeMaterial(b: WorldBuilder): THREE.MeshStandardMaterial {
  const draw = (lines: boolean) => (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    if (!lines) {
      ctx.fillStyle = '#ece7de';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(120,110,96,0.35)';
      ctx.lineWidth = 2;
      for (let x = 0; x <= W; x += W / 4) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y <= H; y += H / 2) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    }
    // the long diamonds (two crossing diagonals per 4 m bay)
    ctx.strokeStyle = lines ? '#ffd98a' : '#9a8460';
    ctx.lineWidth = lines ? 6 : 5;
    for (let i = -1; i <= 4; i++) {
      const x0 = (i * W) / 4;
      ctx.beginPath();
      ctx.moveTo(x0, H);
      ctx.lineTo(x0 + W / 4, 0);
      ctx.moveTo(x0 + W / 4, H);
      ctx.lineTo(x0, 0);
      ctx.stroke();
    }
  };
  const map = repeatTex(canvasTex(512, 512, draw(false)));
  const em = repeatTex(canvasTex(256, 256, draw(true)));
  return b.nightGlow(new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffd08a, emissiveIntensity: 0.05, roughness: 0.6 }), 0.0, 1.15);
}

/** The Sahara's stylised looping S (two stacked rings with a diagonal), in bulbs, plus SAHARA in bulb letters. */
function saharaMark(b: WorldBuilder, w: number, h: number, withName: boolean): THREE.Group {
  const g = new THREE.Group();
  // bulbs round the S: two stacked rings (open on alternate sides) and a diagonal spine
  const r = Math.min(w * 0.22, h * (withName ? 0.17 : 0.24));
  const cy = withName ? h * 0.18 : 0;
  const ring = (cx: number, yc: number, a0: number, a1: number) => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 24; i++) {
      const a = a0 + ((a1 - a0) * i) / 24;
      pts.push([cx + Math.cos(a) * r, yc + Math.sin(a) * r]);
    }
    return pts;
  };
  // upper loop open to the lower right, lower loop open to the upper left: the S, drawn twice (the double line)
  for (const rr of [1, 0.68]) {
    const up = ring(0, cy + r, -0.3 * Math.PI, 1.35 * Math.PI).map(([x, y]) => [x * rr, cy + r + (y - cy - r) * rr] as [number, number]);
    const dn = ring(0, cy - r, 0.7 * Math.PI, 2.35 * Math.PI).map(([x, y]) => [x * rr, cy - r + (y - cy + r) * rr] as [number, number]);
    g.add(bulbPath(up, false, 0.3, 0.17, 0.05));
    g.add(bulbPath(dn, false, 0.3, 0.17, 0.05));
  }
  if (withName) {
    g.add(placed(neonText(b, 'SAHARA', w * 0.98, h * 0.22, 'deco', '#fff6e8', undefined, 0.25), 0, -h * 0.3, 0.04));
    g.add(placed(letters(b, 'SAHARA', w * 0.98, h * 0.22, { style: 'deco', fill: '#f6efe0', spacing: 0.25 }), 0, -h * 0.3, 0.03));
  }
  return g;
}

function buildSahara(b: WorldBuilder, k: Kit): void {
  const x0 = 19;
  const zS = -864; // south end of the property (the ex-Wet 'n Wild lot below it)
  const zN = WALK_S; // Sahara Ave's south sidewalk
  // the lot's last strip between the Fontainebleau block (northBlock.ts ends it at -856) and the Sahara
  k.flat(k.dirt, x0 + 0.6, 93, -856.2, zS, 0.013);
  k.box(mat(0x26352a, 0.95), 19.6, 1.1, (-856 + zS) / 2, 0.06, 2.2, -856 - zS);
  b.collider(19.3, 19.9, zS, -856, 0, 2.2, true);

  // --- landscaped Strip setback + corner plaza, palms and clipped hedges like the 2026 photos
  paving(b, x0, 27, zS, zN, '#d9d2c6', '#bdb4a6', 3);
  for (let z = zS - 4; z > zN + 3; z -= 9) k.palm(21.6, z, 9);
  for (let z = zS - 8; z > zN + 6; z -= 9) k.box(k.hedge, 24.6, 0.55, z, 1.4, 1.1, 5.4);

  // --- the drive (Liset Way) and the round porte-cochère at the south end
  const pcx = 40;
  const pcz = -875;
  k.flat(k.asphalt, BLVD + 0.2, 52, zS - 0.5, -886.5, 0.02);
  for (let x = BLVD + 1; x < 26; x += 1.2) k.box(k.paint, x, 0.03, -875.5, 0.6, 0.01, 0.2); // the median line out to the Strip
  const canopyTop = 7.2;
  const disc = mesh(new THREE.CylinderGeometry(9.5, 9.5, 0.9, 48), k.white, pcx, canopyTop, pcz);
  b.add(disc);
  // the LED band round the rim (by day a warm white, a slow colour drift at night)
  const rim = new THREE.MeshBasicMaterial({ color: 0xe8d8c0 });
  b.add(mesh(new THREE.CylinderGeometry(9.56, 9.56, 0.62, 48, 1, true), rim, pcx, canopyTop + 0.06, pcz));
  b.every((_dt, t, night) => rim.color.setHSL(0.08 + 0.06 * Math.sin(t * 0.15) * night, 0.35 + 0.4 * night, 0.62 + 0.08 * night));
  // the wood-and-light starburst soffit
  const soffit = new THREE.MeshStandardMaterial({
    map: canvasTex(512, 512, (ctx, W) => {
      ctx.fillStyle = '#8a6a48';
      ctx.fillRect(0, 0, W, W);
      ctx.strokeStyle = '#f6d9a0';
      ctx.lineWidth = 7;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(W / 2 + Math.cos(a) * 60, W / 2 + Math.sin(a) * 60);
        ctx.quadraticCurveTo(W / 2 + Math.cos(a + 0.6) * 200, W / 2 + Math.sin(a + 0.6) * 200, W / 2 + Math.cos(a + 0.9) * 250, W / 2 + Math.sin(a + 0.9) * 250);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(W / 2, W / 2, 60, 0, Math.PI * 2);
      ctx.stroke();
    }),
    emissive: 0xffd9a0,
    emissiveIntensity: 0.1,
    roughness: 0.7,
  });
  soffit.emissiveMap = soffit.map;
  b.nightGlow(soffit, 0.1, 0.85);
  const sof = mesh(new THREE.CircleGeometry(9.4, 48).rotateX(HALF_PI), soffit, pcx, canopyTop - 0.46, pcz);
  b.add(sof);
  // white columns round the central chandelier (lit glass rods)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = pcx + 3 + Math.cos(a) * 1.6;
    const z = pcz + Math.sin(a) * 1.6;
    k.mg.beam(k.white, v3(x, 0, z), v3(x, canopyTop - 0.4, z), 0.32, 12, 0.32, true);
    b.collider(x - 0.32, x + 0.32, z - 0.32, z + 0.32, 0, canopyTop, true);
  }
  const chand = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xf4f6fa, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.2, transparent: true, opacity: 0.9 }), 0.3, 1.1);
  for (let i = 0; i < 22; i++) {
    const a = i * 2.39;
    const r = 0.3 + (i % 4) * 0.28;
    const len = 0.8 + ((i * 7) % 5) * 0.35;
    k.box(chand, pcx + 3 + Math.cos(a) * r, canopyTop - 1.0 - len / 2, pcz + Math.sin(a) * r, 0.12, len, 0.12);
  }
  // the lobby doors under the canopy: diamond-lattice columns (black with gold lines)
  const latticeCol = b.nightGlow(
    new THREE.MeshStandardMaterial({
      map: repeatTex(
        canvasTex(128, 512, (ctx, W, H) => {
          ctx.fillStyle = '#141416';
          ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = '#f2d48c';
          ctx.lineWidth = 6;
          for (let y = -H; y < H * 2; y += 128) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y + 128);
            ctx.moveTo(W, y);
            ctx.lineTo(0, y + 128);
            ctx.stroke();
          }
        })
      ),
      emissive: 0xffd590,
      emissiveIntensity: 0.05,
      roughness: 0.5,
    }),
    0.05,
    0.7
  );
  latticeCol.emissiveMap = latticeCol.map;
  for (let i = 0; i < 6; i++) {
    const z = -868 + i * -2.8;
    k.mg.beam(latticeCol, v3(49.2, 0, z), v3(49.2, 5.6, z), 0.45, 12, 0.45, true);
  }
  k.box(k.shopGlass, 49.8, 2.2, -875, 0.1, 4.2, 16);

  // --- casino podium (white lattice panels on the Strip and Sahara Ave faces)
  const pX0 = 27;
  const pX1 = 80;
  const pZ0 = -888;
  const pZ1 = zN - 0.5;
  const pH = 11;
  const plain = mat(0xe4dfd6, 0.7);
  k.solid(plain, pX0, pX1, pZ0, pZ1, pH);
  const lattice = latticeMaterial(b);
  facade(b, lattice, pZ0 - pZ1, pH - 0.6, 4, 8, pX0 - 0.03, (pH - 0.6) / 2, (pZ0 + pZ1) / 2, -HALF_PI);
  facade(b, lattice, pX1 - pX0, pH - 0.6, 4, 8, (pX0 + pX1) / 2, (pH - 0.6) / 2, pZ1 - 0.03, Math.PI);
  facade(b, lattice, 22, pH - 0.6, 4, 8, 38 + 0, (pH - 0.6) / 2, pZ0 + 0.03, 0);
  k.box(mat(0xd9d2c4, 0.6), (pX0 + pX1) / 2, pH + 0.3, (pZ0 + pZ1) / 2, pX1 - pX0 + 0.4, 0.6, pZ0 - pZ1 + 0.4); // parapet cap
  // main Strip entrance: glass, a deep canopy with a glowing soffit, lattice columns
  const ez = -902;
  k.box(k.shopGlass, pX0 - 0.08, 2.3, ez, 0.12, 4.4, 12);
  k.box(k.white, pX0 - 2.2, 4.9, ez, 4.4, 0.5, 15);
  k.box(b.nightGlow(mat(0xffe8c4, 0.4, 0, { emissive: 0xffd7a0, emissiveIntensity: 0.1 }), 0.1, 0.5), pX0 - 2.2, 4.63, ez, 4.2, 0.04, 14.6);
  for (const dz of [-7, 7]) k.mg.beam(latticeCol, v3(pX0 - 4.1, 0, ez + dz), v3(pX0 - 4.1, 4.7, ez + dz), 0.36, 12, 0.36, true);
  for (const dz of [-7, 7]) b.collider(pX0 - 4.5, pX0 - 3.7, ez + dz - 0.4, ez + dz + 0.4, 0, 4.7, true);
  // LED marquee band over the doors (the 2026 photos: a long screen along the canopy edge)
  const band = new LedBoard('SAHARA', ['MAGIC MIKE LIVE', 'BAZAAR MEAT BY JOSÉ ANDRÉS', 'THE CASBAR LOUNGE', 'LOOSE SLOTS • LIVE TABLES', 'SAHARA LAS VEGAS'], ['#2a5cff', '#c06a2a', '#7a2cff', '#ffcc33', '#e8d6b0'], 512, 128);
  const bandM = new THREE.MeshBasicMaterial({ map: band.tex, color: 0xd0d0d0 });
  const bandP = mesh(new THREE.PlaneGeometry(14.6, 1.8), bandM, pX0 - 4.43, 5.95, ez);
  bandP.rotation.y = -HALF_PI;
  b.add(bandP);
  k.box(k.darkSteel, pX0 - 4.25, 5.95, ez, 0.3, 2.0, 15);
  driveLed(b, band, pX0 - 4.4, 6, ez);
  // signs on the podium: Bazaar Meat and the Casbar on Sahara Ave, 800 Degrees and Beers and Bets to the Strip
  b.add(letters(b, 'BAZAAR MEAT', 11, 1.5, { style: 'slab', fill: '#f2efe8', sub: 'BY JOSÉ ANDRÉS', subFill: '#e0b070' }), 62, 7.8, pZ1 - 0.08, Math.PI);
  b.add(neonPanel(b, 'THE CASBAR LOUNGE', 9, 1.1, { style: 'deco', color: '#ffb35a', fill: '#e8d2b0', depth: 0.1 }), 40, 8.2, pZ1 - 0.1, Math.PI);
  b.add(letters(b, 'BEERS & BETS', 6, 1.1, { style: 'block', fill: '#ffffff', bg: '#1a1a1e', rule: '#ffb020' }, 0.12), pX0 - 0.1, 7.6, -912, -HALF_PI);
  b.add(letters(b, '800° DEGREES', 6, 1.0, { style: 'sans', fill: '#ff5a2a', bg: '#141414' }, 0.12), pX0 - 0.1, 7.6, -891.5, -HALF_PI);

  // --- the towers (real: Alexandria 24 fl at the corner, Blanca 14 fl, Marra 26 fl behind; game heights ≈ 1:3.1)
  // white tile with punched windows (the SLS photos): the towers read white from the Strip, not glass
  const alex: FacadeSpec = { wall: '#f1efe9', mullion: '#d8d4cc', glass: '#3c4654', lit: '#ffe6c0', cols: 12, rows: 24, style: 0, seed: 531 };
  const blanca: FacadeSpec = { wall: '#efe8dc', mullion: '#c4b8a4', glass: '#4a5666', lit: '#ffe2b4', cols: 10, rows: 14, style: 0, seed: 533 };
  const marra: FacadeSpec = { wall: '#e8dccb', mullion: '#cbbba4', glass: '#3a4a5a', lit: '#ffe8c8', cols: 12, rows: 26, style: 0, seed: 535 };
  tower(b, { x: 50.5, z: -904.5, w: 14, d: 20, h: 27, y: pH, facade: alex, accent: 0xffe0b0, noSetback: true });
  tower(b, { x: 56, z: -873.5, w: 15, d: 11, h: 17, facade: blanca, accent: 0xffd8a0 });
  tower(b, { x: 71.5, z: -891, w: 12, d: 40, h: 31, facade: marra, accent: 0xffd8a0 });
  // dark vertical end bands on the Alexandria (the SLS-era stripes), the LED wrap up top, SAHARA + the S in bulbs
  for (const dz of [-9.6, 9.6]) k.box(mat(0x2e2e34, 0.6), 43.4, pH + 13.5, -904.5 + dz, 0.4, 27, 1.2);
  const wrap = new LedBoard('SAHARA', ['MAGIC MIKE LIVE', 'NOW PLAYING', 'BAZAAR MEAT', 'SAHARA LAS VEGAS', 'THE STRIP STARTS HERE'], ['#1c2cff', '#2a5cff', '#6a2cff', '#0a1a8a', '#c06a2a'], 384, 512);
  const wrapM = new THREE.MeshBasicMaterial({ map: wrap.tex, color: 0xbcbcbc });
  const wrapP = mesh(new THREE.PlaneGeometry(18, 11), wrapM, 43.35, pH + 21, -904.5);
  wrapP.rotation.y = -HALF_PI;
  b.add(wrapP);
  driveLed(b, wrap, 43.3, pH + 21, -904.5, 480);
  const mark = saharaMark(b, 9, 9, true);
  mark.position.set(43.3, pH + 9.5, -904.5);
  mark.rotation.y = -HALF_PI;
  b.add(mark);
  // the crown wordmark on the Marra, toward the Strip and Sahara Ave
  b.add(letters(b, 'SAHARA', 10, 2.4, { style: 'deco', fill: '#e8d6b0', spacing: 0.2 }), 65.4, 28.5, -891, -HALF_PI);
  b.add(letters(b, 'SAHARA', 10, 2.4, { style: 'deco', fill: '#e8d6b0', spacing: 0.2 }), 71.5, 28.5, -911.1, Math.PI);

  // --- the SAHARA pylon at the corner of the Strip and Sahara Ave (faces up and down the Strip)
  const py = new THREE.Group();
  const slab = mat(0xf0ece4, 0.55);
  py.add(part(new THREE.BoxGeometry(5.4, 0.8, 2), k.darkSteel, 0, 0.4, 0));
  py.add(part(new THREE.BoxGeometry(4.6, 17, 1.3), slab, 0, 8.9, 0));
  py.add(part(new THREE.BoxGeometry(4.9, 0.3, 1.5), k.darkSteel, 0, 17.5, 0));
  const pyLed = new LedBoard('SAHARA', ['MAGIC MIKE LIVE', 'BAZAAR MEAT', 'CASBAR LOUNGE', 'SAHARA LAS VEGAS'], ['#2a5cff', '#c06a2a', '#7a2cff', '#e8d6b0'], 256, 192);
  const ledM = new THREE.MeshBasicMaterial({ map: pyLed.tex, color: 0xc8c8c8 });
  for (const f of [-1, 1]) {
    const scr = mesh(new THREE.PlaneGeometry(4.0, 3.0), ledM, 0, 4.2, f * 0.66);
    scr.rotation.y = f > 0 ? 0 : Math.PI;
    py.add(scr);
    const m2 = saharaMark(b, 4.2, 9, true);
    m2.position.set(0, 12.3, f * 0.66);
    m2.rotation.y = f > 0 ? 0 : Math.PI;
    py.add(m2);
  }
  py.add(placed(letters(b, 'LAS VEGAS', 3.6, 0.6, { style: 'sans', fill: '#c8a874', spacing: 0.4 }, 1.32), 0, 7.2, 0));
  b.add(py, 22.6, 0, -913.6, 0);
  b.collider(20, 25.2, -914.6, -912.6, 0, 17.6, true);
  driveLed(b, pyLed, 22.6, 4.2, -913.6);

  b.building((pX0 + pX1) / 2, (pZ0 + pZ1) / 2, pX1 - pX0, pZ0 - pZ1, '#e8dccb', 'SAHARA Las Vegas');
  b.building(40, -875, 24, 22, '#d9d2c6');
  b.zone('SAHARA Las Vegas', x0, 94, zN, zS);
  b.zone('SAHARA porte-cochère (Liset Way)', BLVD, 50, -886.5, zS);
  b.zone('Former Wet ’n Wild site (vacant)', x0, 100, zS, -856);
  b.pickup(24.2, 1.2, -887.8, 2, 'Valet stand: a forgotten pack', false);
  b.crowd.tourists.push({ pts: [[24, -868], [24, -884], [45, -884]], prop: 'bag' }, { pts: [[22.8, -890], [22.8, -915]], prop: 'camera' });
}

// =============================================================== behind the Sahara: garage, Paradise Rd, Turnberry, HGV
function buildSaharaEastBack(b: WorldBuilder, k: Kit): void {
  const zN = WALK_S;
  // Sahara self-park garage (five decks), concrete spandrels with dark openings
  const gx0 = 80.5;
  const gx1 = 93;
  const gz0 = -864;
  const gz1 = zN - 0.5;
  const deck = mat(0xc9c3b8, 0.85);
  const open = mat(0x1a1b1f, 0.9);
  k.solid(open, gx0 + 0.3, gx1 - 0.3, gz0 - 0.3, gz1 + 0.3, 15.4);
  for (let y = 0; y <= 15; y += 3.1) k.box(deck, (gx0 + gx1) / 2, y + 0.55, (gz0 + gz1) / 2, gx1 - gx0, 1.1, gz0 - gz1);
  for (let z = gz0 - 3; z > gz1 + 2; z -= 7.5) k.box(deck, gx1 - 0.2, 7.7, z, 0.5, 15.4, 0.6);
  b.add(letters(b, 'SAHARA SELF PARKING', 9, 1.2, { style: 'sans', fill: '#ffffff', bg: '#1d2a5a' }, 0.15), gx1 + 0.15, 13.5, -880, HALF_PI);
  b.building((gx0 + gx1) / 2, (gz0 + gz1) / 2, gx1 - gx0, gz0 - gz1, '#9a948a', 'Sahara garage');

  // Paradise Rd south of Sahara Ave: under the monorail to the SAHARA station (two lanes each way)
  const rx0 = 94;
  const rx1 = 106;
  flatRoad(b, (rx0 + rx1) / 2, (CURB_S - 858) / 2, rx1 - rx0, -858 - CURB_S, 'z', 4, true, 0.034, 'Paradise Rd');
  for (const x of [rx0 - 0.15, rx1 + 0.15]) k.box(k.curb, x, 0.08, (zN - 858) / 2, 0.3, 0.16, -858 - zN);
  k.flat(k.lotAsphalt, rx0, rx1 + 8, -858, -864, 0.02);
  b.zone('Paradise Rd (SAHARA monorail station)', rx0, rx1, zN, -858);
  // the taxi + rideshare stand under the station
  k.box(k.white, rx1 + 2.2, 3.4, -906, 3.2, 0.25, 12);
  for (const dz of [-5, 5]) k.mg.beam(k.steel, v3(rx1 + 3.4, 0, -906 + dz), v3(rx1 + 3.4, 3.3, -906 + dz), 0.08, 6);
  b.add(letters(b, 'TAXI • RIDESHARE • MONORAIL ↑', 7, 0.6, { style: 'sans', fill: '#ffffff', bg: '#0b2a5a' }, 0.1), rx1 + 0.9, 3.0, -906, HALF_PI);

  // Turnberry Towers (45 floors, blue-green glass) behind Paradise, south of the monorail curve
  const tb: FacadeSpec = { wall: '#c8d8dc', mullion: '#e8f0f2', glass: '#2d5a66', lit: '#e8f2ff', cols: 10, rows: 34, style: 2, seed: 541 };
  tower(b, { x: 119, z: -868, w: 14, d: 13, h: 45, facade: tb, accent: 0x9fe0f0 });
  tower(b, { x: 141, z: -866, w: 13, d: 13, h: 42, facade: { ...tb, seed: 543 }, accent: 0x9fe0f0 });
  paving(b, 109, 152, -858, -880, '#d0cbc0', '#b4ada0', 3);
  for (const [x, z] of [[110, -878], [130, -878], [151, -878], [130, -860]] as Array<[number, number]>) k.palm(x, z, 8);
  b.zone('Turnberry Towers', 108, 153, -880, -856);
  // Hilton Grand Vacations Suites (Paradise), lower and wider
  const hgv: FacadeSpec = { wall: '#dcd4c6', mullion: '#f0eadf', glass: '#3a4a5a', lit: '#ffe6b8', cols: 12, rows: 12, style: 1, seed: 547 };
  tower(b, { x: 178, z: -868, w: 20, d: 13, h: 19, facade: hgv });
  b.add(letters(b, 'HILTON GRAND VACATIONS', 12, 1.2, { style: 'sans', fill: '#ffffff' }), 178, 17.5, -861.3, 0);
  b.zone('Hilton Grand Vacations Suites (Paradise)', 160, X_E, -880, -856);
  // surface lots between the monorail curve and Sahara Ave
  k.lot(110, 200, -884, zN - 1, true, 0.55, 551);
  b.zone('Sahara east lots', 107, X_E, zN, -884);
  for (let x = 112; x < 200; x += 22) k.cobra(x, zN - 0.6, Math.PI, 9, 2.4);
}

// =============================================================== west, south of Sahara Ave
function buildHgvBoulevard(b: WorldBuilder, k: Kit): void {
  // Hilton Grand Vacations on the Boulevard (39 floors), north of Sky Las Vegas: drive + porte-cochère to the Strip
  const zS = -857.5;
  const zN = -879;
  paving(b, -27.5, -19, zS, zN, '#cfc8bb', '#b2aa9c', 3);
  k.flat(k.asphalt, -BLVD - 0.2, -19, -861.5, -874.5, 0.02);
  const hgv: FacadeSpec = { wall: '#ddd8ce', mullion: '#f2eee6', glass: '#3a4a5a', lit: '#ffe6b8', cols: 10, rows: 30, style: 1, seed: 521 };
  tower(b, { x: -37, z: -868, w: 18, d: 15, h: 42, facade: hgv, accent: 0xbfe0ff });
  b.add(letters(b, 'HILTON GRAND VACATIONS', 13, 1.4, { style: 'sans', fill: '#ffffff' }), -27.9, 39.5, -868, HALF_PI);
  b.add(letters(b, 'ON THE BOULEVARD', 8, 0.9, { style: 'sans', fill: '#bfe0ff', spacing: 0.3 }), -27.9, 37.6, -868, HALF_PI);
  // porte-cochère
  k.box(k.white, -24, 5.0, -868, 7, 0.6, 12);
  k.box(mat(0xffe8c4, 0.4, 0, { emissive: 0xffd7a0, emissiveIntensity: 0.55 }), -24, 4.68, -868, 6.6, 0.04, 11.6);
  for (const [x, z] of [[-21, -862.5], [-21, -873.5]] as Array<[number, number]>) {
    k.mg.beam(k.white, v3(x, 0, z), v3(x, 4.8, z), 0.28, 10, 0.28, true);
    b.collider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0, 4.8, true);
  }
  b.add(letters(b, 'Hilton Grand Vacations', 5, 0.8, { style: 'serif', fill: '#1c3a6a', bg: '#f4f2ec' }, 0.2), -20.4, 1.6, -876.6, HALF_PI);
  k.box(k.stucco, -20.4, 0.8, -876.6, 0.5, 1.6, 5.2);
  b.collider(-20.7, -20.1, -879.2, -874, 0, 1.6, true);
  // garage behind
  k.solid(mat(0xc4beb2, 0.85), -60, -47, -858, -879, 12);
  b.zone('Hilton Grand Vacations on the Boulevard', -60, -19, zN, zS);
  b.building(-37, -868, 18, 15, '#ddd8ce', 'HGV on the Boulevard');
}

/** The Festival Grounds: the empty former El Rancho Vegas site, fenced, a gravel field, a permanent stage truss. */
function buildFestivalGrounds(b: WorldBuilder, k: Kit): void {
  const zS = -879.5;
  const zN = WALK_S - 0.5;
  const xE = -19.6;
  // the frontage block to Sahara Ave, plus the deep lot behind HGV and Sky Las Vegas
  k.flat(k.dirt, X_W, xE, zS, zN, 0.012);
  k.flat(k.dirt, X_W, -61, -800, zS, 0.012);
  // a mown event field in the middle, and the gravel load-in road
  k.flat(mat(0x7d8a4a, 0.95), -150, -70, -812, -905, 0.016);
  k.flat(k.gravel, -66, -60, -800, zN, 0.018);
  // perimeter: chain-link with a dark windscreen, posts every 4 m (one shared material each)
  const screen = new THREE.MeshStandardMaterial({ color: 0x1f2a24, roughness: 0.95, side: THREE.DoubleSide });
  const runs: Array<[number, number, number, number]> = [
    [xE, zS, xE, -892],
    [xE, -902, xE, zN],
    [xE, zN, X_W + 0.4, zN],
    [-61, -800, X_W + 0.4, -800],
    [-61, -800, -61, zS],
    [-61, zS, xE, zS],
  ];
  for (const [ax, az, cx, cz] of runs) {
    const len = Math.hypot(cx - ax, cz - az);
    const along = Math.abs(cz - az) > Math.abs(cx - ax);
    k.box(screen, (ax + cx) / 2, 1.15, (az + cz) / 2, along ? 0.04 : len, 2.3, along ? len : 0.04);
    const n = Math.round(len / 4);
    for (let i = 0; i <= n; i++) k.mg.beam(k.steel, v3(ax + ((cx - ax) * i) / n, 0, az + ((cz - az) * i) / n), v3(ax + ((cx - ax) * i) / n, 2.4, az + ((cz - az) * i) / n), 0.04, 5);
    b.collider(Math.min(ax, cx) - 0.1, Math.max(ax, cx) + 0.1, Math.min(az, cz) - 0.1, Math.max(az, cz) + 0.1, 0, 2.4, true);
  }
  // the Strip gate (rolling gates, open: Lou walks in) under the Festival Grounds sign
  for (const z of [-892.2, -901.8]) {
    k.mg.beam(k.darkSteel, v3(xE, 0, z), v3(xE, 7.6, z), 0.22, 8);
    b.collider(xE - 0.25, xE + 0.25, z - 0.25, z + 0.25, 0, 7.6, true);
  }
  b.add(letters(b, 'LAS VEGAS FESTIVAL GROUNDS', 11, 2.4, { style: 'block', fill: '#ffffff', bg: '#1a1a2a', rule: '#ffd23a' }, 0.3), xE, 8.6, -897, HALF_PI);
  k.box(k.darkSteel, xE, 8.6, -897, 0.25, 2.6, 11.4);
  // the permanent stage: a black truss roof on four towers, facing the Strip from the far west end
  const sx = -150;
  const sz = -858;
  k.solid(mat(0x2a2a2e, 0.8), sx - 6, sx + 6, sz - 16, sz + 16, 1.8);
  const truss = k.darkSteel;
  for (const [dx, dz] of [[-5, -15], [-5, 15], [5, -15], [5, 15]] as Array<[number, number]>) {
    k.box(truss, sx + dx, 8, sz + dz, 1.1, 16, 1.1, 0, true);
    b.collider(sx + dx - 0.55, sx + dx + 0.55, sz + dz - 0.55, sz + dz + 0.55, 0, 16, true);
  }
  k.box(truss, sx, 16.4, sz, 12, 1.2, 32, 0, true);
  for (let dz = -14; dz <= 14; dz += 4) k.box(truss, sx, 15.2, sz + dz, 11, 0.25, 0.25);
  for (const dz of [-20, 20]) k.box(truss, sx + 2, 7, sz + dz, 1.2, 12, 3.6, 0, true); // sound wings
  // light / delay towers out in the field, a mixing tent, porta-johns, storage containers
  for (const [x, z] of [[-110, -840], [-110, -880], [-80, -858]] as Array<[number, number]>) {
    k.box(truss, x, 7, z, 0.8, 14, 0.8, 0, true);
    k.box(truss, x, 14.2, z, 3, 0.8, 2);
    b.collider(x - 0.4, x + 0.4, z - 0.4, z + 0.4, 0, 14, true);
  }
  k.solid(mat(0xe8e6e0, 0.8), -96, -88, -862, -854, 3.2);
  const john = mat(0x2c6ab8, 0.7);
  for (let i = 0; i < 10; i++) k.solid(john, -70, -68.6, -884 - i * 1.6, -885.4 - i * 1.6, 2.3);
  const cont = [mat(0x8a3a2a, 0.8, 0.3), mat(0x2a5a7a, 0.8, 0.3), mat(0xb0b0a8, 0.8, 0.3)];
  for (let i = 0; i < 5; i++) k.solid(cont[i % 3], -130 + i * 3, -127.6 + i * 3, -905, -913, 2.6);
  b.zone('Las Vegas Festival Grounds', X_W, xE, -800, zN);
  b.building((X_W + xE) / 2, (zS + zN) / 2, xE - X_W, zN - zS, '#a8926e');
  b.building((X_W - 61) / 2, (-800 + zS) / 2, -61 - X_W, zS + 800, '#a8926e', 'Festival Grounds');
  b.crowd.tourists.push({ pts: [[-25, -897], [-70, -897], [-140, -858]], prop: 'camera' });
  b.pickup(-92, 1.1, -858, 4, 'Mixing tent: a roadie’s stash', false);
}

// =============================================================== Bonanza Gift Shop (west, north of Sahara Ave)
function brickMaterial(): THREE.MeshStandardMaterial {
  const t = repeatTex(
    canvasTex(256, 128, (ctx, W, H) => {
      ctx.fillStyle = '#8a4a36';
      ctx.fillRect(0, 0, W, H);
      const bh = H / 8;
      const bw = W / 4;
      for (let r = 0; r < 8; r++) {
        for (let c = -1; c < 5; c++) {
          const x = c * bw + (r % 2 ? bw / 2 : 0);
          const v = ((r * 7 + c * 13) % 5) * 6;
          ctx.fillStyle = `rgb(${128 + v},${66 + v / 2},${50 + v / 3})`;
          ctx.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
        }
      }
    })
  );
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
}

/** The merchandise on a gondola face: four shelves of mugs, magnets, shot glasses, plush, caps and boxes. */
function merchMaterial(seed: number): THREE.MeshStandardMaterial {
  const t = repeatTex(
    canvasTex(512, 128, (ctx, W, H) => {
      ctx.fillStyle = '#f0ece4';
      ctx.fillRect(0, 0, W, H);
      let s = seed;
      const R = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      const cols = ['#d8202a', '#f2c230', '#2a66cc', '#1e8c5a', '#ff7ab8', '#ffffff', '#1a1a1a', '#e87a1a', '#7a2cff', '#c8a874'];
      for (let row = 0; row < 4; row++) {
        const y0 = row * (H / 4);
        ctx.fillStyle = '#9a9a9e';
        ctx.fillRect(0, y0 + H / 4 - 4, W, 4);
        for (let x = 2; x < W - 4; ) {
          const w = 5 + R() * 12;
          const h = 10 + R() * 16;
          ctx.fillStyle = cols[Math.floor(R() * cols.length)];
          ctx.fillRect(x, y0 + H / 4 - 4 - h, w, h);
          if (R() < 0.3) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillRect(x + 1, y0 + H / 4 - 4 - h + 2, w - 2, 3);
          }
          x += w + 1 + R() * 2;
        }
      }
    })
  );
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
}

/** The round "BONANZA GIFT & SOUVENIR SHOPS" disk: brown wood face, red neon western letters, a bulb ring. Faces +z. */
function bonanzaDisk(b: WorldBuilder, r: number): THREE.Group {
  const g = new THREE.Group();
  const D = r * 2;
  g.add(
    letterFace(b, D, D, (ctx, pw, ph) => {
      ctx.fillStyle = '#4a2a1a';
      ctx.beginPath();
      ctx.arc(pw / 2, ph / 2, pw / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,14,8,0.6)';
      ctx.lineWidth = 3;
      for (let y = ph * 0.1; y < ph; y += ph / 14) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(pw, y);
        ctx.stroke();
      }
      ctx.strokeStyle = '#c8a050';
      ctx.lineWidth = pw * 0.012;
      ctx.beginPath();
      ctx.arc(pw / 2, ph / 2, pw / 2 - pw * 0.03, 0, Math.PI * 2);
      ctx.stroke();
      // the gold scroll and the gold F in GIFT
      ctx.strokeStyle = '#d8b060';
      ctx.lineWidth = pw * 0.008;
      ctx.beginPath();
      ctx.arc(pw * 0.44, ph * 0.37, pw * 0.03, 0, Math.PI * 1.6);
      ctx.arc(pw * 0.56, ph * 0.37, pw * 0.03, Math.PI * 1.4, Math.PI * 3);
      ctx.stroke();
    })
  );
  const neon = '#ff3a2a';
  g.add(
    placed(
      neonFaceArc(b, D, (ctx, pw, ph) => {
        // BONANZA on an arc over the top
        const word = 'BONANZA';
        ctx.font = `bold ${Math.round(ph * 0.13)}px "Rockwell Extra Bold", Rockwell, Georgia, serif`;
        for (let i = 0; i < word.length; i++) {
          const a = -Math.PI / 2 + (i - (word.length - 1) / 2) * 0.33;
          ctx.save();
          ctx.translate(pw / 2 + Math.cos(a) * pw * 0.36, ph / 2 + Math.sin(a) * ph * 0.36);
          ctx.rotate(a + Math.PI / 2);
          neonGlyph(ctx, word[i], ph * 0.13, neon);
          ctx.restore();
        }
        const line = (t: string, y: number, px: number) => {
          ctx.save();
          ctx.translate(pw / 2, ph * y);
          neonGlyph(ctx, t, px, neon);
          ctx.restore();
        };
        line('GIFT', 0.52, ph * 0.15);
        line('& SOUVENIR', 0.69, ph * 0.08);
        line('SHOPS', 0.82, ph * 0.12);
      }),
      0,
      0,
      0.02
    )
  );
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < 64; i++) ring.push([Math.cos((i / 64) * Math.PI * 2) * (r - 0.15), Math.sin((i / 64) * Math.PI * 2) * (r - 0.15)]);
  g.add(bulbPath(ring, true, 0.3, 0.18, 0.05));
  return g;
}

/** A square neon face (signKit's neon atlas) painted freely. */
function neonFaceArc(b: WorldBuilder, D: number, paint: (ctx: CanvasRenderingContext2D, pw: number, ph: number) => void): THREE.Object3D {
  return neonFace(b, D, D, paint);
}

/** Neon tube text at the origin: halo, tube and a white-hot core (like signKit's paintNeonText). */
function neonGlyph(ctx: CanvasRenderingContext2D, text: string, px: number, color: string): void {
  ctx.font = `bold ${Math.round(px)}px "Rockwell Extra Bold", Rockwell, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = px * 0.35;
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.shadowBlur = px * 0.12;
  ctx.fillText(text, 0, 0);
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.5, px * 0.035);
  ctx.strokeStyle = '#fff4ea';
  ctx.strokeText(text, 0, 0);
}

/** White backlit marquee cabinet with bulb rows top and bottom (the Bonanza's signs). Faces +z. */
function marquee(b: WorldBuilder, w: number, h: number, text: string, sub: string | undefined, fill: string, subFill = '#c81e1e', style: 'block' | 'slab' | 'sans' = 'block'): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(w + 0.5, h + 0.5, 0.4), mat(0xe8b020, 0.5, 0.3), 0, 0, -0.05));
  g.add(placed(letters(b, text, w, h, { style, fill, bg: '#f8f6ee', sub, subFill, subStyle: 'slab', scale: sub ? 0.5 : 0.7 }), 0, 0, 0.16));
  g.add(bulbPath([[-w / 2 - 0.1, h / 2 + 0.13], [w / 2 + 0.1, h / 2 + 0.13]], false, 0.22, 0.16, 0.18));
  g.add(bulbPath([[-w / 2 - 0.1, -h / 2 - 0.13], [w / 2 + 0.1, -h / 2 - 0.13]], false, 0.22, 0.16, 0.18));
  return g;
}

function buildBonanza(b: WorldBuilder, k: Kit): void {
  const xF = -31; // the storefront (faces the Strip, +x)
  const xB = -49;
  const zS = WALK_N - 2.5; // -957.5
  const zN = -980.5;
  const H = 6.2;
  const door0 = -972.5;
  const door1 = -967.5;
  const brick = brickMaterial();
  const inner = mat(0xf2eee6, 0.85);
  // walls (front with the doorway; collider pieces so Lou walks in)
  const T = 0.3;
  k.solid(inner, xB, xB + T, zN, zS, H);
  k.solid(inner, xB, xF, zN, zN + T, H);
  k.solid(inner, xB, xF, zS - T, zS, H);
  for (const [a, c] of [
    [zS, door1],
    [door0, zN],
  ]) k.solid(inner, xF - T, xF, Math.min(a, c), Math.max(a, c), H);
  k.box(inner, xF - T / 2, 3.25 + (H - 3.25) / 2, (door0 + door1) / 2, T, H - 3.25, door1 - door0);
  b.collider(xF - T, xF, door0, door1, 3.25, H, true);
  // the roof slab (walkable) + its parapet
  k.box(k.roof, (xF + xB) / 2, H + 0.2, (zS + zN) / 2, xF - xB + 0.4, 0.4, zS - zN + 0.4);
  b.collider(xB, xF, zN, zS, H, H + 0.4);
  // brick + glass storefront outside, red awning, the white marquees with bulbs
  facade(b, brick, zS - zN, 3.2, 2.4, 1.2, xF + 0.02, 1.6, (zS + zN) / 2, HALF_PI);
  facade(b, brick, xF - xB, 3.2, 2.4, 1.2, (xF + xB) / 2, 1.6, zS + 0.02, 0);
  for (const [a, c] of [
    [zS - 1, door1 - 0.4],
    [door0 + 0.4, zN + 1],
  ]) k.box(k.shopGlass, xF + 0.06, 1.55, (a + c) / 2, 0.06, 2.5, Math.abs(a - c));
  k.box(mat(0x1a1a1a, 0.4, 0.4), xF + 0.04, 1.4, (door0 + door1) / 2, 0.05, 2.8, door1 - door0 - 0.2);
  b.add(letters(b, 'ENTRANCE', 4.2, 0.55, { style: 'slab', fill: '#ffe08a', bg: '#b81c1c' }), xF + 0.95, 3.35, (door0 + door1) / 2, HALF_PI);
  const awning = mat(0xc41e1e, 0.55);
  const aw = new THREE.CylinderGeometry(0.8, 0.8, zS - zN, 16, 1, true, 0, Math.PI).rotateX(HALF_PI);
  k.mg.add(aw.translate(xF, 3.0, (zS + zN) / 2), awning, true);
  const aw2 = new THREE.CylinderGeometry(0.8, 0.8, xF - xB, 16, 1, true, 0, Math.PI).rotateX(HALF_PI).rotateY(-HALF_PI);
  k.mg.add(aw2.translate((xF + xB) / 2, 3.0, zS), awning, true);
  // storefront marquees, south → north (the real ones, 2020 photo)
  const panels: Array<[number, string, string | undefined, string]> = [
    [5.2, 'SHOP', 'NOVELTIES', '#1a1a1a'],
    [4.0, 'CASINO GAMES', '& SUPPLIES', '#1a1a1a'],
    [6.2, '99¢ SOUVENIRS', '3 T-SHIRTS FOR $10', '#1a1a1a'],
    [4.4, 'NFL & NHL GOODS', 'HATS • SWEATSHIRTS • SHOES', '#c81e1e'],
    [5.2, 'TURQUOISE JEWELRY', '50% OFF', '#1a1a1a'],
  ];
  let z = zS - 0.4;
  for (const [w, t, sub, fill] of panels) {
    b.add(marquee(b, w - 0.6, 2.2, t, sub, fill), xF + 0.4, 4.95, z - w / 2, HALF_PI);
    z -= w;
  }
  // WORLD'S LARGEST GIFT SHOP over Sahara Ave (with its Western sub-line)
  b.add(marquee(b, 15, 2.6, "WORLD'S LARGEST GIFT SHOP", 'WESTERN GIFTS ♦ HATS ♦ BELTS ♦ SOUVENIRS ♦ T-SHIRTS', '#141414', '#b8401c'), (xF + xB) / 2, 5.0, zS + 0.4, 0);
  // the big round sign on the roof, over the entrance (faces the Strip, both sides)
  const disk = bonanzaDisk(b, 4.2);
  b.add(disk, xF - 1.2, H + 4.9, (door0 + door1) / 2, HALF_PI);
  const back = bonanzaDisk(b, 4.2);
  b.add(back, xF - 1.45, H + 4.9, (door0 + door1) / 2, -HALF_PI);
  k.box(mat(0x3a2418, 0.7), xF - 1.32, H + 4.9, (door0 + door1) / 2, 0.2, 8.0, 8.0);
  for (const dz of [-2.4, 2.4]) k.box(k.darkSteel, xF - 1.32, H + 0.4, (door0 + door1) / 2 + dz, 0.3, 1.2, 0.3);
  // the corner pylon (a smaller disk on a pole), facing up and down the Strip
  const pole = new THREE.Group();
  pole.add(part(new THREE.CylinderGeometry(0.3, 0.35, 10.4, 12), mat(0x6a4a2a, 0.5, 0.4), 0, 5.2, 0));
  const pd = bonanzaDisk(b, 2.3);
  pd.position.set(0, 12.4, 0.12);
  pole.add(pd);
  const pd2 = bonanzaDisk(b, 2.3);
  pd2.position.set(0, 12.4, -0.12);
  pd2.rotation.y = Math.PI;
  pole.add(pd2);
  pole.add(placed(marquee(b, 4.2, 1.1, 'GIFTS • T-SHIRTS', 'OPEN TILL MIDNIGHT', '#c81e1e', '#1a1a1a'), 0, 8.8, 0.25));
  b.add(pole, -21.4, 0, zS - 1.2, 0);
  b.collider(-21.8, -21.0, zS - 1.6, zS - 0.8, 0, 10.4, true);

  // --- the shop floor (walk in): tile, fluorescent panels, gondolas, the T-shirt and hat walls, the counter
  const tile = new THREE.MeshStandardMaterial({
    map: repeatTex(
      canvasTex(128, 128, (ctx, W) => {
        ctx.fillStyle = '#e6e0d4';
        ctx.fillRect(0, 0, W, W);
        ctx.strokeStyle = '#c8c0b0';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, W / 2 - 2, W / 2 - 2);
        ctx.strokeRect(W / 2 + 1, W / 2 + 1, W / 2 - 2, W / 2 - 2);
        ctx.fillStyle = '#d6cfc0';
        ctx.fillRect(W / 2, 0, W / 2, W / 2);
        ctx.fillRect(0, W / 2, W / 2, W / 2);
      })
    ),
    roughness: 0.4,
  });
  const fl = new THREE.Mesh(tiledPlane(xF - xB - 0.6, zS - zN - 0.6, 1.2, 1.2), tile);
  fl.rotation.x = -HALF_PI;
  fl.position.set((xF + xB) / 2, 0.03, (zS + zN) / 2);
  fl.receiveShadow = true;
  b.add(fl);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(xF - xB - 0.6, zS - zN - 0.6), mat(0xe8e6e0, 0.9, 0, { emissive: 0xf4f2ea, emissiveIntensity: 0.35 }));
  ceil.rotation.x = HALF_PI;
  ceil.position.set((xF + xB) / 2, H - 0.05, (zS + zN) / 2);
  b.add(ceil);
  const fluor = basic(0xfaf8f0);
  for (let x = xB + 2.5; x < xF - 1; x += 4) for (let zz = zN + 2; zz < zS - 1; zz += 3.2) k.box(fluor, x, H - 0.1, zz, 0.6, 0.04, 1.8);
  // gondolas (two-sided merchandise) either side of the main aisle in from the doors
  const merchA = merchMaterial(71);
  const merchB = merchMaterial(173);
  const shelfBody = mat(0xd0ccc4, 0.6, 0.2);
  for (const zc of [-960.2, -963.6, -976.2, -979.0]) {
    const x0 = -44.5;
    const x1 = -35;
    k.box(shelfBody, (x0 + x1) / 2, 0.9, zc, x1 - x0, 1.8, 1.0);
    for (const f of [-1, 1]) {
      const p = new THREE.Mesh(tiledPlane(x1 - x0, 1.6, 4.5, 1.6), f > 0 ? merchA : merchB);
      p.position.set((x0 + x1) / 2, 0.95, zc + f * 0.51);
      p.rotation.y = f > 0 ? 0 : Math.PI;
      b.add(p);
    }
    b.collider(x0, x1, zc - 0.5, zc + 0.5, 0, 1.8);
  }
  // the T-shirt wall at the back and the hat wall on the north side
  const shirts = new THREE.MeshStandardMaterial({
    map: repeatTex(
      canvasTex(256, 128, (ctx, W, Hh) => {
        ctx.fillStyle = '#f4f2ec';
        ctx.fillRect(0, 0, W, Hh);
        const cols = ['#1a1a1a', '#d8202a', '#2a66cc', '#ffffff', '#f2c230', '#7a2cff', '#1e8c5a', '#ff7ab8'];
        for (let r = 0; r < 2; r++) {
          for (let i = 0; i < 6; i++) {
            const x = 8 + i * 41;
            const y = 8 + r * 62;
            ctx.fillStyle = cols[(i * 3 + r * 5) % cols.length];
            ctx.fillRect(x + 6, y, 24, 46);
            ctx.fillRect(x, y, 36, 12);
            ctx.fillStyle = cols[(i + 2 + r) % cols.length] === ctx.fillStyle ? '#888' : cols[(i + 4 + r) % cols.length];
            ctx.fillRect(x + 11, y + 16, 14, 10);
          }
        }
      })
    ),
    roughness: 0.85,
  });
  facade(b, shirts, zS - zN - 2, 2.6, 4.5, 2.6, xB + T + 0.04, 2.6, (zS + zN) / 2, HALF_PI);
  const hats = new THREE.MeshStandardMaterial({
    map: repeatTex(
      canvasTex(256, 128, (ctx, W, Hh) => {
        ctx.fillStyle = '#5a3a24';
        ctx.fillRect(0, 0, W, Hh);
        for (let r = 0; r < 3; r++) {
          for (let i = 0; i < 6; i++) {
            const x = 22 + i * 42;
            const y = 30 + r * 40;
            ctx.fillStyle = ['#d8b880', '#1a1a1a', '#f4f0e4', '#8a5a34', '#c81e1e', '#ffd6ea'][(i + r * 2) % 6];
            ctx.beginPath();
            ctx.ellipse(x, y + 8, 18, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(x - 9, y - 8, 18, 15);
          }
        }
      })
    ),
    roughness: 0.85,
  });
  facade(b, hats, 9, 2.2, 4.5, 2.2, -40, 3.2, zN + T + 0.04, 0);
  b.add(letters(b, 'WESTERN HATS', 4, 0.6, { style: 'slab', fill: '#ffe08a', bg: '#5a2a14' }), -40, 4.8, zN + T + 0.06, 0);
  b.add(letters(b, '3 FOR $10', 3.2, 0.7, { style: 'block', fill: '#ffffff', bg: '#c81e1e' }), xB + T + 0.06, 4.6, -969.8, HALF_PI);
  // the checkout counter by the doors (the working shop)
  k.box(mat(0x6a3a22, 0.6), -34.5, 0.55, -975.8, 4.4, 1.1, 1.1);
  k.box(mat(0x1a1a1e, 0.4, 0.3), -34.5, 1.13, -975.8, 4.6, 0.06, 1.2);
  k.box(k.darkSteel, -33.4, 1.35, -975.8, 0.5, 0.4, 0.4);
  b.collider(-36.7, -32.3, -976.4, -975.2, 0, 1.15);
  b.shopSpots.push({ kind: 'store', position: new THREE.Vector3(-34.5, 0, -974.2), radius: 2.8, label: 'Bonanza Gift Shop', catalog: 'bonanza', hint: '99¢ souvenirs, T-shirts, cowboy hats, casino dice' });
  b.pickup(-46.5, 1.95, -963.6, 2, 'Top shelf, behind the shot glasses', true);
  b.zone('Bonanza Gift Shop', xB, xF, zN, zS);
  b.building((xF + xB) / 2, (zS + zN) / 2, xF - xB, zS - zN, '#8a4a36', 'Bonanza Gift Shop');

  // the lot between the shop and the Strip (nose-in stalls along the storefront)
  k.lot(xF, -19.3, zS + 1.5, zN, false, 0.7, 2440);
  b.zone('Bonanza parking lot', xF, -19, zN, WALK_N);
}

// =============================================================== west, north of Sahara Ave: Allure, Ahern, Circle K, El Mirador
function buildNorthWest(b: WorldBuilder, k: Kit): void {
  // Allure Las Vegas (41 floors, glass, a curved crown) behind the Bonanza
  const allure: FacadeSpec = { wall: '#b8cad4', mullion: '#e4eef2', glass: '#24485a', lit: '#e6f0ff', cols: 10, rows: 34, style: 2, seed: 561 };
  tower(b, { x: -62.5, z: -968, w: 15, d: 18, h: 46, facade: allure, accent: 0xbfe6ff, metal: 0.6 });
  k.mg.add(new THREE.CylinderGeometry(7.5, 7.5, 18.4, 24, 1, false, 0, Math.PI).rotateX(HALF_PI).rotateZ(HALF_PI).scale(1, 0.4, 1).translate(-62.5, 46.2, -968), mat(0xd8e4ea, 0.3, 0.6));
  b.add(letters(b, 'ALLURE', 6, 1.4, { style: 'thin', fill: '#ffffff', spacing: 0.3 }), -54.9, 42, -968, HALF_PI);
  b.zone('Allure Las Vegas (200 W Sahara)', -71, -52, -978, WALK_N);
  // Ahern Hotel (9 floors)
  const ahern: FacadeSpec = { wall: '#e8e2d6', mullion: '#2a2a2e', glass: '#3a4450', lit: '#ffe6c0', cols: 8, rows: 9, style: 1, seed: 563 };
  tower(b, { x: -87, z: -967, w: 18, d: 20, h: 11, facade: ahern });
  b.add(letters(b, 'AHERN', 5, 1.2, { style: 'sans', fill: '#ffffff', spacing: 0.2 }), -77.9, 9.6, -967, HALF_PI);
  b.zone('Ahern Hotel (300 W Sahara)', -96, -77, -978, WALK_N);
  // the rest of the block west to the map edge: the MINT Tavern and lots
  k.solid(mat(0x2a2c30, 0.8), -116, -102, -959, -971, 4.6);
  b.add(neonPanel(b, 'MINT TAVERN', 8, 1.2, { style: 'slab', color: '#3affb0', fill: '#bfffe6', bg: 0x101214, depth: 0.2 }), -109, 3.6, -958.85, 0);
  b.zone('The MINT Tavern', -117, -101, -972, WALK_N);
  k.lot(-170, -100, -975, -996, true, 0.45, 571);
  k.lot(-170, -122, -958, -973, true, 0.5, 573);

  // Circle K (gas, 24 h) at Bob Stupak Ave, a working counter inside the door
  const cx0 = -34;
  const cx1 = -20;
  const cz0 = -982.5;
  const cz1 = -994.5;
  k.flat(k.lotAsphalt, -46, -19.3, cz0, -996.5, 0.016);
  const ckRed = mat(0xe2231a, 0.5);
  const ckOrange = mat(0xf58025, 0.5);
  k.box(k.white, (cx0 + cx1) / 2, 5.5, (cz0 + cz1) / 2, cx1 - cx0, 0.7, cz0 - cz1, 0, true);
  k.box(ckRed, (cx0 + cx1) / 2, 5.5, cz0 + 0.02, cx1 - cx0 + 0.04, 0.3, 0.04);
  k.box(ckOrange, (cx0 + cx1) / 2, 5.25, cz0 + 0.02, cx1 - cx0 + 0.04, 0.2, 0.04);
  k.box(basic(0xfdfaf0), (cx0 + cx1) / 2, 5.13, (cz0 + cz1) / 2, cx1 - cx0 - 0.4, 0.04, cz0 - cz1 - 0.4);
  for (const x of [cx0 + 2.5, cx1 - 2.5]) {
    for (const zz of [cz0 - 3, cz1 + 3]) {
      k.box(k.white, x, 2.6, zz, 0.5, 5.2, 0.5);
      b.collider(x - 0.25, x + 0.25, zz - 0.25, zz + 0.25, 0, 5.2, true);
      k.box(mat(0x3a3c42, 0.5, 0.3), x + 1.4, 0.9, zz, 0.7, 1.8, 1.1);
      k.box(ckRed, x + 1.4, 1.95, zz, 0.72, 0.3, 1.12);
      b.collider(x + 1.05, x + 1.75, zz - 0.55, zz + 0.55, 0, 1.8);
    }
  }
  // the store
  k.solid(k.stucco, -46, -37, cz0 + 0.5, cz1 - 1.5, 4.6);
  k.box(k.shopGlass, -36.95, 1.6, -989, 0.08, 2.6, 7);
  k.box(ckRed, -36.9, 3.8, -989, 0.2, 0.6, 9);
  b.add(letters(b, 'CIRCLE K', 4, 0.7, { style: 'block', fill: '#ffffff', bg: '#e2231a' }), -36.75, 3.8, -989, HALF_PI);
  b.shopSpots.push({ kind: 'store', position: new THREE.Vector3(-35.9, 0, -989), radius: 2.4, label: 'Circle K', catalog: 'circle-k-stupak', hint: 'smokes, Polar Pop, hot dogs' });
  // pylon: the red circle K over the price board
  const ck = new THREE.Group();
  ck.add(part(new THREE.BoxGeometry(0.5, 7, 0.5), k.darkSteel, 0, 3.5, 0));
  ck.add(placed(letterFace(b, 3, 3, (ctx, pw, ph) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pw, ph);
    ctx.fillStyle = '#e2231a';
    ctx.beginPath();
    ctx.arc(pw / 2, ph / 2, pw * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(ph * 0.55)}px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('K', pw / 2, ph * 0.54);
    ctx.fillStyle = '#f58025';
    ctx.fillRect(0, ph * 0.88, pw, ph * 0.06);
  }, 0.4), 0, 8.4, 0));
  ck.add(placed(letters(b, 'UNLEADED 4.59', 2.8, 0.9, { style: 'road', fill: '#ff3a2a', bg: '#101010', sub: 'DIESEL 4.89', subFill: '#ffd23a' }, 0.4), 0, 6.3, 0));
  ck.add(part(new THREE.BoxGeometry(3.1, 3.1, 0.38), k.white, 0, 8.4, 0));
  ck.add(part(new THREE.BoxGeometry(3.0, 1.0, 0.38), k.darkSteel, 0, 6.3, 0));
  b.add(ck, -20.6, 0, cz0 + 0.5, 0);
  b.collider(-20.9, -20.3, cz0 + 0.25, cz0 + 0.75, 0, 7, true);
  b.zone('Circle K (Bob Stupak Ave)', -46, -19, -996.5, cz0 + 1);
  // El Mirador Motel behind it: two storeys, an outside walkway, the vintage arrow sign
  k.solid(mat(0xf0e2c4, 0.85), -60, -48, -983, -996.5, 6.2);
  k.box(mat(0xcfc6b4, 0.85), -47.1, 3.1, -989.7, 1.8, 0.22, 13);
  for (let zz = -984; zz > -996; zz -= 2.8) {
    for (const y of [1.1, 4.2]) k.box(mat(0x1f6a8a, 0.6), -47.94, y, zz, 0.06, 2.0, 0.95);
  }
  b.add(neonPanel(b, 'EL MIRADOR', 5, 1.0, { style: 'script', color: '#ff4a8a', fill: '#ffd0e0', bg: 0x14202a, depth: 0.2 }), -54, 7.4, -982.85, 0);
  b.add(letters(b, 'MOTEL • VACANCY', 4, 0.5, { style: 'sans', fill: '#ffd23a', bg: '#14202a' }, 0.12), -54, 6.55, -982.8, 0);
  b.zone('El Mirador Motel', -61, -47, -996.5, -982.5);
}

// =============================================================== east, north of Sahara Ave
function buildNorthEast(b: WorldBuilder, k: Kit): void {
  const zS = WALK_N;
  // Walgreens on the corner (24 h), its lot facing Sahara Ave
  k.lot(19.4, 38, zS - 0.5, -962.5, false, 0.6, 2427);
  k.solid(mat(0xd9c9ab, 0.85), 21, 33.5, -963, -977.5, 6.4);
  k.box(k.shopGlass, 27, 1.6, -962.95, 5, 2.6, 0.08);
  k.box(mat(0xe31837, 0.55), 27.25, 5.2, -962.85, 12.6, 1.2, 0.2);
  b.add(letters(b, 'Walgreens', 8, 1.1, { style: 'script', fill: '#ffffff' }), 27.25, 5.2, -962.7, 0);
  b.add(letters(b, 'Walgreens', 7, 1.1, { style: 'script', fill: '#e31837', bg: '#ffffff', sub: 'PHARMACY • 24 HOURS', subFill: '#e31837', scale: 0.6 }, 0.2), 20.6, 4.2, -970, HALF_PI);
  b.zone('Walgreens (2427 Las Vegas Blvd S)', 19, 34, -978, zS);
  // a little strip along Paradise: Subway, Thai Pepper, Bourbon Street Bar & Grill (storefronts face the lot, west)
  const shops: Array<[string, string, string, number]> = [
    ['SUBWAY', '#ffc20e', '#008c15', 6],
    ['THAI PEPPER', '#ffffff', '#c81e1e', 6],
    ['BOURBON STREET', '#ffd23a', '#3a1a5a', 7.5],
  ];
  k.flat(k.lotAsphalt, 33.5, 38.5, -962.5, -979, 0.015);
  let z = -958.5;
  for (const [name, fg, bg, w] of shops) {
    k.solid(k.stucco, 38.5, 49.4, z, z - w, 5.2);
    k.box(k.shopGlass, 38.45, 1.5, z - w / 2, 0.08, 2.4, w - 1.2);
    b.add(letters(b, name, w - 0.8, 0.9, { style: name === 'SUBWAY' ? 'block' : 'slab', fill: fg, bg }, 0.15), 38.3, 3.9, z - w / 2, -HALF_PI);
    b.zone(name === 'BOURBON STREET' ? 'Bourbon Street Bar & Grill' : name === 'SUBWAY' ? 'Subway' : 'Thai Pepper', 33.5, 49.4, z - w, z);
    z -= w;
  }
  // Essence (cannabis dispensary, two storeys of dark glass with the green wordmark)
  k.solid(mat(0x2a2e30, 0.5, 0.3), 21, 32, -979.5, -987.5, 7.4);
  k.box(k.glass, 20.95, 3.6, -983.5, 0.08, 6, 6.5);
  b.add(neonPanel(b, 'ESSENCE', 6.5, 1.2, { style: 'thin', color: '#5aff9a', fill: '#d6ffe6', depth: 0.1, spacing: 0.25 }), 20.85, 6.6, -983.5, -HALF_PI);
  b.zone('Essence (The Strip)', 19, 32, -987.5, -979);
  // Chapel of the Bells: white chapel, steeple, the big neon bell sign by the sidewalk
  k.solid(mat(0xfaf6ee, 0.75), 23, 31, -989, -996.5, 5.2);
  k.mg.add(new THREE.ConeGeometry(4.8, 2.4, 4).rotateY(Math.PI / 4).scale(1, 1, 1.5).translate(27, 6.4, -992.7), mat(0x8a2a2a, 0.7), true);
  k.box(mat(0xfaf6ee, 0.75), 27, 7.5, -989.8, 1.6, 4, 1.6);
  k.mg.add(new THREE.ConeGeometry(1.2, 3.4, 4).rotateY(Math.PI / 4).translate(27, 11.2, -989.8), mat(0xf2f0ea, 0.6), true);
  const bells = new THREE.Group();
  bells.add(part(new THREE.BoxGeometry(0.5, 8, 0.5), k.darkSteel, 0, 4, 0));
  bells.add(placed(marquee(b, 4.6, 1.5, 'CHAPEL OF THE BELLS', 'WEDDINGS • SINCE 1957', '#c81e5b', '#1a3a8a', 'slab'), 0, 7.6, 0.3));
  bells.add(placed(marquee(b, 4.6, 1.5, 'CHAPEL OF THE BELLS', 'WEDDINGS • SINCE 1957', '#c81e5b', '#1a3a8a', 'slab'), 0, 7.6, -0.3, Math.PI));
  const bellM = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xe8c050, emissive: 0xffd040, emissiveIntensity: 0.2, roughness: 0.35, metalness: 0.6 }), 0.2, 1.2);
  for (const dx of [-1.3, 1.3]) bells.add(part(new THREE.CylinderGeometry(0.15, 0.6, 0.9, 16), bellM, dx, 9.2, 0));
  b.add(bells, 20.6, 0, -989.5, 0);
  b.collider(20.35, 20.85, -989.75, -989.25, 0, 8, true);
  b.zone('Chapel of the Bells', 19, 32, -996.5, -988.5);
  // McDonald's (2248) at the back of the block, on Paradise
  k.solid(mat(0xece4d6, 0.85), 37, 49, -982, -994, 4.4);
  k.mg.add(new THREE.BoxGeometry(12.6, 1.1, 12.6).translate(43, 4.95, -988), mat(0x8a1a14, 0.7));
  b.add(letters(b, "McDonald's", 6, 0.9, { style: 'sans', fill: '#ffc72c' }), 36.8, 3.6, -988, -HALF_PI);
  const arches = new THREE.Group();
  arches.add(part(new THREE.BoxGeometry(0.5, 7.4, 0.5), mat(0xb8b8b8, 0.4, 0.6), 0, 3.7, 0));
  arches.add(placed(letterFace(b, 3.4, 2.6, (ctx, pw, ph) => {
    ctx.fillStyle = '#da291c';
    ctx.fillRect(0, 0, pw, ph);
    ctx.strokeStyle = '#ffc72c';
    ctx.lineWidth = pw * 0.09;
    ctx.beginPath();
    for (const cx of [pw * 0.32, pw * 0.68]) {
      ctx.moveTo(cx - pw * 0.17, ph * 0.86);
      ctx.bezierCurveTo(cx - pw * 0.17, ph * 0.0, cx + pw * 0.17, ph * 0.0, cx + pw * 0.17, ph * 0.86);
    }
    ctx.stroke();
  }, 0.4), 0, 8.4, 0));
  arches.add(part(new THREE.BoxGeometry(3.5, 2.7, 0.38), mat(0xda291c, 0.5), 0, 8.4, 0));
  b.add(arches, 36, 0, -980.6, 0);
  b.zone("McDonald's (Paradise Rd)", 33.5, 49.5, -996.5, -979.5);

  // Paradise Rd north of Sahara Ave (two lanes each way) to the map edge
  flatRoad(b, 56, (CURB_N + EDGE_N) / 2, 12, CURB_N - EDGE_N, 'z', 4, true, 0.034, 'Paradise Rd');
  for (const x of [49.85, 62.15]) k.box(k.curb, x, 0.08, (CURB_N + EDGE_N) / 2, 0.3, 0.16, CURB_N - EDGE_N);
  b.zone('Paradise Rd', 50, 62, EDGE_N, CURB_N);
  // east of Paradise: Starbucks (drive-thru), 7-Eleven, Record City, Siegel Suites, low motels, lots
  k.solid(mat(0xe8e0d0, 0.8), 64, 72, -957.5, -966.5, 5.2);
  k.box(mat(0x00704a, 0.6), 63.9, 4.4, -962, 0.2, 1.0, 9);
  b.add(letters(b, 'STARBUCKS', 6.5, 0.8, { style: 'sans', fill: '#ffffff', spacing: 0.2 }), 63.75, 4.4, -962, -HALF_PI);
  k.flat(k.lotAsphalt, 62.5, 80, -957, -970, 0.015);
  b.zone('Starbucks (2233 Paradise)', 62.5, 80, -970, zS);
  k.solid(mat(0xf6f6f2, 0.8), 64, 76, -972, -982, 4.6);
  for (const [c, y] of [[0xf58025, 4.1], [0x008163, 3.8], [0xee2526, 3.5]] as Array<[number, number]>) k.box(mat(c, 0.6), 63.9, y, -977, 0.2, 0.28, 10);
  b.add(letters(b, '7-ELEVEN', 3.6, 1.0, { style: 'block', fill: '#ffffff', bg: '#008163', rule: '#f58025' }, 0.15), 63.7, 2.9, -980.4, -HALF_PI);
  b.zone('7-Eleven (2202 Paradise)', 62.5, 77, -983, -971);
  k.solid(mat(0xd8c8a8, 0.85), 80, 91, -957.5, -967, 4.8);
  b.add(letters(b, 'RECORD CITY', 7, 1.0, { style: 'block', fill: '#ffd23a', bg: '#1a1a1a' }, 0.12), 85.5, 5.6, -957.3, 0);
  b.zone('Record City', 79, 92, -968, zS);
  const motel = mat(0xe8dcc4, 0.85);
  for (const [x0, x1, z0, z1, name] of [
    [96, 128, -958, -972, 'Siegel Suites Sahara'],
    [96, 128, -980, -994, 'Siegel Suites Sahara'],
    [134, 160, -958, -976, 'Meadows Village apartments'],
  ] as Array<[number, number, number, number, string]>) {
    k.solid(motel, x0, x1, z0, z1, 6.2);
    k.box(k.roof, (x0 + x1) / 2, 6.35, (z0 + z1) / 2, x1 - x0 + 0.6, 0.3, Math.abs(z1 - z0) + 0.6);
    for (let x = x0 + 1.6; x < x1 - 1; x += 3) for (const y of [1.2, 4.3]) k.box(mat(0x2a4a6a, 0.6), x, y, z0 + 0.04, 1.1, 1.8, 0.06);
    b.zone(name, x0, x1, z1, z0);
  }
  b.add(letters(b, 'SIEGEL SUITES', 8, 1.0, { style: 'sans', fill: '#ffffff', bg: '#14467a' }, 0.15), 112, 6.9, -957.9, 0);
  k.lot(80, 92, -970, -996, false, 0.55, 581);
  k.lot(162, 200, -958, -996, true, 0.5, 583);
  k.lot(134, 160, -980, -996, true, 0.5, 585);
}

// =============================================================== past the edge: the STRAT, the Gateway Arches, the far north
function buildBeyondTheEdge(b: WorldBuilder, k: Kit): void {
  const z0 = EDGE_N;
  const z1 = -1180;
  const len = z0 - z1;
  // the Boulevard runs on to the STRAT and downtown (its own road plane: strip.ts stops at the edge)
  const roadMat = new THREE.MeshStandardMaterial({ map: saharaRoadTexture(), roughness: 0.86 });
  const rg = new THREE.PlaneGeometry(len, BLVD * 2);
  const uv = rg.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 32);
  const road = new THREE.Mesh(rg, roadMat);
  road.rotation.set(-HALF_PI, 0, HALF_PI);
  road.position.set(0, 0.03, (z0 + z1) / 2);
  b.add(road);
  for (const s of [-1, 1]) {
    k.flat(mat(0x9a9085, 0.85), s * (BLVD + 3.7) - 3.7, s * (BLVD + 3.7) + 3.7, z0, z1, 0.02);
    k.box(k.curb, s * (BLVD + 0.15), 0.08, (z0 + z1) / 2, 0.3, 0.16, len);
  }
  for (const [ma, mb] of [[z0 - 22, -1040], [-1052, z1]]) k.box(mat(0xb8ad9c, 0.85), 0, 0.11, (ma + mb) / 2, 2.8, 0.22, ma - mb);
  for (let z = z0 - 28; z > z1; z -= 15) if (z > -1036 || z < -1056) k.palm(0, z, 8.5);
  // Bob Stupak Ave (west), the STRAT's south side
  flatRoad(b, -48, -1012, 72, 12, 'x', 4, true, 0.03);
  // the Strip's street lights carry on
  for (const s of [-1, 1]) for (let z = z0 - 10; z > z1; z -= 24) k.cobra(s * (BLVD + 1), z, s > 0 ? -HALF_PI : HALF_PI, 10, 3);

  // --- the Aztec Inn (south corner of Bob Stupak)
  k.box(mat(0xd8b878, 0.85), -27, 3, -1003, 14, 6, 5);
  b.add(neonPanel(b, 'AZTEC INN', 6, 1.4, { style: 'slab', color: '#ff7a1a', fill: '#ffd6a0', bg: 0x3a1a0a, depth: 0.25 }), -21.5, 7.4, -1003, HALF_PI);
  b.add(letters(b, 'CASINO • $5 CAFE', 5, 0.6, { style: 'sans', fill: '#ffd23a', bg: '#1a1a1a' }, 0.12), -19.9, 5.2, -1003, HALF_PI);

  // --- the STRAT: tripod legs, the tapering core, the lit lattice bowl, the pod, the mast and the thrill rides
  const sx = -26;
  const sz = -1036;
  const shaft = mat(0xe8e4dc, 0.55);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + HALF_PI;
    k.mg.beam(shaft, v3(sx + Math.cos(a) * 7.5, 0, sz + Math.sin(a) * 7.5), v3(sx + Math.cos(a) * 2.6, 96, sz + Math.sin(a) * 2.6), 1.9, 8, 1.2, false);
    k.mg.beam(basic(0xfff4e0), v3(sx + Math.cos(a) * 9.3, 0.4, sz + Math.sin(a) * 9.3), v3(sx + Math.cos(a) * 3.9, 96, sz + Math.sin(a) * 3.9), 0.12, 4);
  }
  k.mg.beam(shaft, v3(sx, 0, sz), v3(sx, 100, sz), 3.4, 12, 2.2);
  // the pod: flared bowl with the diamond lattice (green at night), the deck ring, the upper pod
  const latt = canvasTex(512, 64, (ctx, W, H) => {
    ctx.fillStyle = '#20262c';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    for (let x = -64; x < W + 64; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 32, H);
      ctx.moveTo(x + 32, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  });
  repeatTex(latt);
  latt.repeat.set(4, 1);
  const bowl = b.nightGlow(new THREE.MeshStandardMaterial({ map: latt, emissiveMap: latt, emissive: 0x5aff5a, emissiveIntensity: 0.05, roughness: 0.5 }), 0.05, 1.4);
  b.add(mesh(new THREE.CylinderGeometry(9.8, 4.2, 7, 32, 1, true), bowl, sx, 103.5, sz));
  b.add(mesh(new THREE.CylinderGeometry(10.6, 9.8, 1.4, 36), mat(0xdcd6cc, 0.5, 0.3), sx, 107.7, sz));
  const deckGlass = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.15, metalness: 0.6, emissive: 0xffe6c0, emissiveIntensity: 0.15 }), 0.15, 1.2);
  b.add(mesh(new THREE.CylinderGeometry(10.2, 10.6, 3.2, 36), deckGlass, sx, 110, sz));
  b.add(mesh(new THREE.CylinderGeometry(9.6, 10.2, 1.2, 36), mat(0xdcd6cc, 0.5, 0.3), sx, 112.2, sz));
  b.add(mesh(new THREE.CylinderGeometry(8.6, 9.4, 2.6, 32), deckGlass, sx, 114.1, sz));
  b.add(mesh(new THREE.CylinderGeometry(6.0, 8.4, 2.4, 28), mat(0xcfc8bc, 0.5, 0.3), sx, 116.6, sz));
  b.add(mesh(new THREE.CylinderGeometry(4.2, 5.6, 2.4, 24), mat(0xe8e4dc, 0.5, 0.3), sx, 119, sz));
  // the mast: red lit needle with the aviation light
  const red = basic(0xff2a2a);
  b.add(mesh(new THREE.CylinderGeometry(0.9, 1.6, 24, 10), mat(0xaaaaaa, 0.4, 0.7), sx, 132, sz));
  b.add(mesh(new THREE.CylinderGeometry(0.95, 1.65, 18, 10, 1, true), b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x8a1a1a, emissive: 0xff1a1a, emissiveIntensity: 0.1, roughness: 0.5 }), 0.1, 1.6), sx, 133, sz));
  b.add(mesh(new THREE.SphereGeometry(0.5, 8, 6), red, sx, 144.3, sz));
  b.add(stratSign(b, 9, 2, 0x140404), sx, 110, sz + 10.75);
  b.add(stratSign(b, 9, 2, 0x140404), sx + 10.75, 110, sz, HALF_PI);
  // Big Shot (up the needle), Insanity (the spinning arm), X-Scream (the see-saw)
  const ridesMat = mat(0xf2c230, 0.5, 0.4);
  const bigShot = new THREE.Group();
  bigShot.add(part(new THREE.TorusGeometry(2.0, 0.35, 6, 20), ridesMat, 0, 0, 0, 0, HALF_PI));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    bigShot.add(mesh(new THREE.BoxGeometry(0.6, 0.7, 0.6), mat(0x2a66cc, 0.5), Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4));
  }
  bigShot.position.set(sx, 121, sz);
  b.scene.add(bigShot);
  const insanity = new THREE.Group();
  insanity.add(mesh(new THREE.BoxGeometry(12, 0.6, 0.8), mat(0xd8202a, 0.5, 0.4), 6, 0, 0));
  const spinner = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    spinner.add(mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), ridesMat, Math.cos(a) * 1.6, -1.2, Math.sin(a) * 1.6));
  }
  spinner.add(mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 12), mat(0xd8202a, 0.5, 0.4), 0, -0.4, 0));
  spinner.position.set(12, 0, 0);
  insanity.add(spinner);
  insanity.position.set(sx, 119, sz);
  b.scene.add(insanity);
  const xscream = new THREE.Group();
  xscream.add(mesh(new THREE.BoxGeometry(14, 0.5, 1.0), mat(0x2a66cc, 0.5, 0.4), 4, 0, 0));
  xscream.add(mesh(new THREE.BoxGeometry(1.6, 1.0, 1.4), ridesMat, 10.5, 0.6, 0));
  xscream.position.set(sx, 119.5, sz);
  xscream.rotation.y = Math.PI * 0.8;
  b.scene.add(xscream);
  b.every((_dt, t) => {
    const c = t % 10;
    bigShot.position.y = c < 1 ? 121 + 22 * c : c < 6 ? 143 - ((c - 1) / 5) * 22 + Math.sin(c * 6) * 0.6 * (6 - c) * 0.2 : 121;
    insanity.rotation.y = t * 0.9;
    spinner.rotation.y = t * 3.2;
    insanity.rotation.z = -0.35 - 0.25 * Math.sin(t * 0.5);
    xscream.rotation.z = -0.25 + 0.3 * Math.sin(t * 0.7);
  });
  // the casino podium round the legs, the hotel tower, the Strip marquee
  k.box(mat(0xe2dccf, 0.7), -48, 6, -1046, 52, 12, 48);
  b.add(letters(b, 'THE STRAT • HOTEL • CASINO • TOWER', 26, 1.6, { style: 'block', fill: '#e8102c' }), -48, 10, -1021.9, 0);
  tower(b, { x: -60, z: -1060, w: 14, d: 34, h: 28, facade: { wall: '#f2efe8', mullion: '#ffffff', glass: '#5a6a7a', lit: '#ffe6b8', cols: 10, rows: 20, seed: 511 }, collide: false, cast: false });
  const sm = new THREE.Group();
  sm.add(part(new THREE.BoxGeometry(1.4, 12, 1.4), k.darkSteel, 0, 6, 0));
  sm.add(placed(stratSign(b, 9, 2.2, 0x140404), 0, 13.2, 0));
  const strLed = new LedBoard('THE STRAT', ['SKYPOD • 1,149 FT', 'BIG SHOT • X-SCREAM • INSANITY', 'SKYJUMP', 'TOP OF THE WORLD'], ['#e8102c', '#ffcc33', '#2a66cc', '#ffffff'], 512, 192);
  sm.add(placed(ledFacesLocal(strLed, 8, 3.2), 0, 9.4, 0));
  b.add(sm, -21.4, 0, -1024);
  driveLed(b, strLed, -21.4, 9.4, -1024);

  // --- the Las Vegas Boulevard Gateway Arches: two white arches crossing over the Blvd in an X, LED-lit after dark
  const archM = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xf4f2ee, emissive: 0xd8ecff, emissiveIntensity: 0.05, roughness: 0.4, metalness: 0.2 }), 0.05, 0.9);
  const gz = -1026;
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(new THREE.Vector3(-17 + 34 * t, 24 * 4 * t * (1 - t), gz + s * (-7 + 14 * t)));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.75, 10, false);
    b.add(mesh(tube, archM));
  }

  // --- east beyond: Holiday Motel, Little Vegas Chapel, Halfpriceshows, Carl's Jr, IHOP / St. Louis Square
  const motel = mat(0xf2e6c8, 0.85);
  k.box(motel, 30, 3.1, -1009, 18, 6.2, 14);
  b.add(neonPanel(b, 'HOLIDAY MOTEL', 7, 1.4, { style: 'script', color: '#ff4a6a', fill: '#ffe0e6', bg: 0x0e2a4a, depth: 0.25 }), 20.4, 7.6, -1004, -HALF_PI);
  k.box(mat(0xfaf6ee, 0.75), 24, 2.6, -1020, 8, 5.2, 6);
  b.add(letters(b, 'LITTLE VEGAS CHAPEL', 6, 0.9, { style: 'serif', fill: '#c81e5b', bg: '#ffffff' }, 0.15), 19.9, 6.0, -1020, -HALF_PI);
  k.box(mat(0x2a2a30, 0.8), 25, 2.4, -1029, 10, 4.8, 8);
  b.add(letters(b, 'HALF PRICE SHOWS', 7, 0.9, { style: 'block', fill: '#ffd23a', bg: '#1a1a1a' }, 0.15), 19.9, 4.2, -1029, -HALF_PI);
  k.box(mat(0xf0e8d8, 0.8), 25, 2.6, -1044, 10, 5.2, 8);
  b.add(letters(b, "Carl's Jr.", 5, 1.0, { style: 'sans', fill: '#ffd700', bg: '#e01e26' }, 0.15), 19.9, 4.4, -1044, -HALF_PI);
  k.box(mat(0xe8e2d8, 0.8), 30, 3, -1072, 16, 6, 20);
  k.mg.add(new THREE.BoxGeometry(17, 1.6, 21).translate(30, 6.6, -1072), mat(0x1a4ab0, 0.6));
  b.add(letters(b, 'IHOP', 4, 1.2, { style: 'block', fill: '#ffffff', bg: '#1a4ab0' }, 0.2), 21.8, 7.6, -1072, -HALF_PI);
  // --- west beyond the STRAT: Atomic Golf (four-level bays under tall nets)
  k.box(mat(0x2a2e3a, 0.6, 0.3), -40, 6, -1094, 18, 12, 26);
  b.add(neonPanel(b, 'ATOMIC GOLF', 9, 1.6, { style: 'block', color: '#ff4ab8', fill: '#ffd0f0', bg: 0x14101e, depth: 0.25 }), -30.8, 10, -1094, HALF_PI);
  for (const [x, zz] of [[-50, -1080], [-50, -1108], [-90, -1080], [-90, -1108], [-130, -1094]] as Array<[number, number]>) k.mg.beam(k.steel, v3(x, 0, zz), v3(x, 32, zz), 0.35, 8, 0.25);
  const net = new THREE.MeshStandardMaterial({ color: 0x1a2a1a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 });
  for (const zz of [-1080, -1108]) k.box(net, -90, 16, zz, 80, 32, 0.05);
  // --- far north: the wedding chapels toward downtown
  const chapel = (x: number, z: number, wallC: number, name: string, sub: string, fg: string, faceX: number) => {
    k.box(mat(wallC, 0.7), x + faceX * -4.5, 3, z, 9, 6, 12);
    k.mg.add(new THREE.ConeGeometry(1.2, 4, 4).rotateY(Math.PI / 4).translate(x + faceX * -4.5, 8, z), mat(0xffffff, 0.6));
    k.box(k.darkSteel, x + faceX * 1.4, 4.5, z + 7, 0.8, 9, 0.8);
    b.add(letters(b, name, 10, 1.7, { style: 'serif', fill: fg, bg: '#fff6fa', sub, subFill: fg, scale: 0.55 }, 0.25), x + faceX * 1.4, 9.8, z + 7, HALF_PI);
  };
  chapel(-26, -1122, 0xfaf8f4, 'A LITTLE WHITE WEDDING CHAPEL', 'DRIVE-UP WEDDINGS • OPEN 24 HOURS', '#d81e5b', 1);
  chapel(26, -1134, 0xffd6ea, 'VIVA LAS VEGAS WEDDING CHAPEL', 'ELVIS WEDDINGS DAILY', '#7a2cff', -1);
}

/** LED faces on both sides of a board (local, faces ±z). */
function ledFacesLocal(led: LedBoard, w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ map: led.tex, color: 0xc8c8c8 });
  g.add(part(new THREE.BoxGeometry(w + 0.4, h + 0.4, 0.8), mat(0x1a1a1e, 0.5, 0.4), 0, 0, 0));
  for (const f of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.z = f * 0.42;
    p.rotation.y = f > 0 ? 0 : Math.PI;
    g.add(p);
  }
  return g;
}

// =============================================================== people
function addCrowds(b: WorldBuilder): void {
  const t = b.crowd.tourists;
  // along both Sahara Ave sidewalks and across the corners
  t.push(
    { pts: [[-17, CURB_S + 2], [-90, CURB_S + 2]], prop: 'camera' },
    { pts: [[-95, CURB_S + 2.8], [-18, CURB_S + 2.8]], prop: 'bag' },
    { pts: [[17, CURB_S + 2.4], [92, CURB_S + 2.4]], prop: 'yard-drink' },
    { pts: [[90, CURB_S + 1.6], [18, CURB_S + 1.6]], prop: 'cig' },
    { pts: [[-17, CURB_N - 2.4], [-48, CURB_N - 2.4], [-48, CURB_N - 1.2]], prop: 'bag' },
    { pts: [[17, CURB_N - 2], [48, CURB_N - 2]], prop: 'camera' },
    // the north frontage, both sides, and into the Bonanza
    { pts: [[-15.2, CURB_N - 4], [-15.2, -994]], prop: 'bag' },
    { pts: [[-16.8, -993], [-16.8, CURB_N - 5]], prop: 'yard-drink' },
    { pts: [[-17.5, -970], [-29, -970], [-38, -970], [-38, -968]], prop: 'bag' },
    { pts: [[-42, -972], [-33, -972], [-24, -973]], prop: 'camera' },
    { pts: [[15.4, CURB_N - 4], [15.4, -994]], prop: 'cig' },
    { pts: [[16.8, -993], [16.8, CURB_N - 5]], prop: 'camera' },
    // the frontage south of Sahara Ave (Festival Grounds, the Sahara's sidewalk)
    { pts: [[-15.6, -858], [-15.6, CURB_S + 4]], prop: 'camera' },
    { pts: [[-17.2, CURB_S + 5], [-17.2, -858]], prop: 'cig' },
    { pts: [[15.6, -858], [15.6, CURB_S + 4]], prop: 'yard-drink' },
    { pts: [[17.2, CURB_S + 5], [17.2, -858]], prop: 'bag' }
  );
}
