import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { viewer, type WorldBuilder } from './builder';
import { facadeMaterial } from './buildings';
import { basic, mat, neonSign } from './props';
import { L0, L1, Merger, canvasTex, prepGeo, v3 } from './southKit';
import type { FacadeSpec } from './textures';

/** Shared materials, road surfaces, signage, instanced parking lots, and traffic for west Strip / I-15 / Dean Martin Dr. */

export const WEST_RNG = (seed: number) => {
  let s = (seed * 1664525 + 1013904223) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

// ================================================================ Shared Road & Ground Textures

const texCache = new Map<string, THREE.CanvasTexture>();

export function asphaltTexture(lanes: number, medianDoubleYellow: boolean, dashedWhite = true): THREE.CanvasTexture {
  const key = `${lanes}|${medianDoubleYellow ? 1 : 0}|${dashedWhite ? 1 : 0}`;
  let tex = texCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#34363c';
  ctx.fillRect(0, 0, 256, 256);
  // subtle aggregate grain
  const R = WEST_RNG(lanes * 97 + 13);
  for (let i = 0; i < 1600; i++) {
    const v = 42 + Math.floor(R() * 26);
    ctx.fillStyle = `rgb(${v},${v + 1},${v + 4})`;
    ctx.fillRect(R() * 256, R() * 256, 2, 2);
  }
  // shoulder edge lines
  ctx.fillStyle = '#d4d0c4';
  ctx.fillRect(6, 0, 4, 256);
  ctx.fillRect(246, 0, 4, 256);
  // median double yellow if two-way undivided
  if (medianDoubleYellow) {
    ctx.fillStyle = '#d8a632';
    ctx.fillRect(123, 0, 3.5, 256);
    ctx.fillRect(129.5, 0, 3.5, 256);
  }
  // dashed white lane dividers
  if (dashedWhite && lanes > 1) {
    ctx.fillStyle = '#dedbd2';
    for (let k = 1; k < lanes; k++) {
      if (medianDoubleYellow && Math.abs(k - lanes / 2) < 0.01) continue;
      const x = (k / lanes) * 240 + 8;
      for (let y = 12; y < 256; y += 64) ctx.fillRect(x - 1.5, y, 3, 30);
    }
  }
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

export function roadStripMat(lanes: number, lengthM: number, twoWay = true): THREE.MeshStandardMaterial {
  const t = asphaltTexture(lanes, twoWay, true).clone();
  t.needsUpdate = true;
  t.repeat.set(1, Math.max(1, lengthM / 18));
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.86, metalness: 0.04 });
}

/** Place a flat roadway slab at ground/deck height with stripes oriented along the travel axis. */
export function flatRoad(
  b: WorldBuilder,
  cx: number,
  cz: number,
  width: number,
  length: number,
  axis: 'z' | 'x',
  lanes: number,
  twoWay = true,
  y = L1,
  label?: string
): void {
  const me = new THREE.Mesh(new THREE.PlaneGeometry(width, length), roadStripMat(lanes, length, twoWay));
  me.rotation.set(-Math.PI / 2, 0, axis === 'z' ? 0 : Math.PI / 2);
  me.position.set(cx, y, cz);
  me.receiveShadow = true;
  b.add(me);
  b.feature({
    kind: 'road',
    x: cx,
    z: cz,
    w: axis === 'z' ? width : length,
    d: axis === 'z' ? length : width,
    color: '#3b3a40',
    label,
  });
}

export function crosswalkStripeMat(w: number, d: number): THREE.MeshStandardMaterial {
  const tex = canvasTex(256, 64, (ctx) => {
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(222,220,212,0.88)';
    for (let x = 8; x < 248; x += 28) ctx.fillRect(x, 6, 15, 52);
  });
  return new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    roughness: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

let _poolTex: THREE.CanvasTexture | null = null;
function sodiumPoolTex(rgb: string): THREE.CanvasTexture {
  const tex = canvasTex(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, rgb.replace('ALPHA', '0.52'));
    g.addColorStop(0.45, rgb.replace('ALPHA', '0.20'));
    g.addColorStop(1, rgb.replace('ALPHA', '0'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  return tex;
}

export function lightPoolMat(warm = true): THREE.MeshBasicMaterial {
  const t = warm ? (_poolTex ??= sodiumPoolTex('rgba(255,198,118,ALPHA)')) : sodiumPoolTex('rgba(232,242,255,ALPHA)');
  return new THREE.MeshBasicMaterial({
    map: t,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

// ================================================================ Architectural Signs & Billboards

/** Backlit canvas sign/monument mounted on any face cleanly without z-fighting. */
export function signBoard(
  b: WorldBuilder,
  text: string,
  bg: string,
  fg: string,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  sub?: string,
  depth = 0.24
): void {
  b.add(neonSign(text, bg, fg, w, h, sub, depth), x, y, z, rotY);
}

/** Roadside tall highway billboard visible from I-15 & Dean Martin Dr. */
export function freewayBillboard(
  b: WorldBuilder,
  mg: Merger,
  x: number,
  z: number,
  rotY: number,
  headline: string,
  sub: string,
  bg: string,
  fg: string,
  accent = '#ffcf3a'
): void {
  const steel = mat(0x464a52, 0.45, 0.72);
  mg.beam(steel, v3(x, 0, z), v3(x, 12.5, z), 0.42, 8, 0.36, true);
  mg.box(steel, x, 15.2, z, 14.4, 5.4, 0.45, rotY, false);
  b.collider(x - 0.5, x + 0.5, z - 0.5, z + 0.5, 0, 13, true);
  const faceMat = new THREE.MeshStandardMaterial({
    map: canvasTex(512, 192, (ctx) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 512, 192);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, 500, 180);
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 46px system-ui, sans-serif';
      ctx.fillText(headline, 256, 76, 470);
      ctx.fillStyle = accent;
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText(sub, 256, 136, 460);
    }),
    emissive: 0xffffff,
    emissiveIntensity: 0.25,
    roughness: 0.45,
  });
  // Emissive map for night legibility
  faceMat.emissiveMap = faceMat.map;
  b.nightGlow(faceMat, 0.15, 0.95);
  const off = 0.26;
  const s = Math.sin(rotY);
  const c = Math.cos(rotY);
  for (const dir of [1, -1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(13.8, 4.9), faceMat);
    face.position.set(x + s * off * dir, 15.2, z + c * off * dir);
    face.rotation.y = dir === 1 ? rotY : rotY + Math.PI;
    b.add(face);
  }
}

/** Green reflective Interstate directional gantry sign texture. */
export function freewayGantrySign(
  b: WorldBuilder,
  mg: Merger,
  x0: number,
  x1: number,
  z: number,
  southFace: boolean,
  boards: Array<{ x: number; w: number; lines: string[]; shield?: string; arrow?: 'down' | 'right' | 'left' }>
): void {
  const galv = mat(0x889098, 0.45, 0.78);
  const yB = 8.4;
  // Portal uprights outside lanes
  for (const px of [x0, x1]) {
    mg.beam(galv, v3(px, 0, z - 0.35), v3(px, yB + 2.2, z - 0.35), 0.18, 6);
    mg.beam(galv, v3(px, 0, z + 0.35), v3(px, yB + 2.2, z + 0.35), 0.18, 6);
    b.collider(px - 0.35, px + 0.35, z - 0.5, z + 0.5, 0, yB, true);
  }
  const xc = (x0 + x1) / 2;
  const span = Math.abs(x1 - x0);
  mg.box(galv, xc, yB + 1.9, z, span + 0.6, 0.18, 0.85);
  mg.box(galv, xc, yB + 0.3, z, span + 0.6, 0.18, 0.85);
  const signBack = mat(0x3a4046, 0.6, 0.4);
  const faceYaw = southFace ? 0 : Math.PI;
  const dz = southFace ? 0.45 : -0.45;
  for (const bd of boards) {
    mg.box(signBack, bd.x, yB + 1.15, z + dz * 0.6, bd.w, 2.5, 0.12);
    const t = canvasTex(512, 224, (ctx) => {
      ctx.fillStyle = '#0c5b32';
      ctx.fillRect(0, 0, 512, 224);
      ctx.strokeStyle = '#eef2ea';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(8, 8, 496, 208, 12);
      ctx.stroke();
      let yy = 52;
      if (bd.shield) {
        ctx.fillStyle = '#183a8a';
        ctx.fillRect(22, 18, 72, 46);
        ctx.fillStyle = '#c8202e';
        ctx.fillRect(22, 18, 72, 14);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bd.shield, 58, 52);
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < bd.lines.length; i++) {
        ctx.font = i === 0 ? 'bold 34px system-ui, sans-serif' : 'bold 28px system-ui, sans-serif';
        ctx.fillText(bd.lines[i], bd.shield && i === 0 ? 290 : 256, yy + i * 44, bd.shield && i === 0 ? 370 : 460);
      }
      if (bd.arrow) {
        ctx.fillStyle = '#ffcf3a';
        ctx.font = 'bold 34px system-ui, sans-serif';
        ctx.fillText(bd.arrow === 'down' ? '↓   ↓' : bd.arrow === 'right' ? '↗' : '↖', 256, 186);
      }
    });
    const m = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.22, roughness: 0.45 });
    b.nightGlow(m, 0.18, 0.72);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(bd.w - 0.1, 2.4), m);
    p.position.set(bd.x, yB + 1.15, z + dz);
    p.rotation.y = faceYaw;
    b.add(p);
  }
}

// ================================================================ Compact Building Block Helper

export interface BlockOpts {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  wall: number | FacadeSpec;
  trim?: number;
  roof?: number;
  collider?: boolean;
  label?: string;
  mapColor?: string;
}

/** Add a commercial/hotel/industrial building box with optional rooftop parapet, HVAC units, and auto-collider. */
export function addBuilding(b: WorldBuilder, mg: Merger, o: BlockOpts): void {
  const { x, z, w, d, h } = o;
  let body: THREE.Object3D;
  if (typeof o.wall === 'number') {
    body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(o.wall, 0.82));
    body.position.set(x, h / 2, z);
  } else {
    const fm = facadeMaterial(b, o.wall, Math.max(w, d), h);
    const sideRm = mat(o.roof ?? 0x50545a, 0.82);
    body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [fm, fm, sideRm, sideRm, fm, fm]);
    body.position.set(x, h / 2, z);
  }
  body.castShadow = true;
  body.receiveShadow = true;
  b.add(body);
  // Roof parapet & compact HVAC boxes in merger
  const para = mat(o.trim ?? 0xb8b0a4, 0.75);
  mg.box(para, x, h + 0.25, z - d / 2 + 0.2, w, 0.5, 0.4);
  mg.box(para, x, h + 0.25, z + d / 2 - 0.2, w, 0.5, 0.4);
  mg.box(para, x - w / 2 + 0.2, h + 0.25, z, 0.4, 0.5, d - 0.8);
  mg.box(para, x + w / 2 - 0.2, h + 0.25, z, 0.4, 0.5, d - 0.8);
  const hvac = mat(0x7c828a, 0.55, 0.4);
  if (w > 8 && d > 8) mg.box(hvac, x + w * 0.15, h + 0.55, z - d * 0.15, 2.2, 1.1, 1.8);
  if (o.collider !== false) b.collider(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, h, true);
  if (o.mapColor || o.label) b.building(x, z, w, d, o.mapColor ?? '#7a756c', o.label);
}

// ================================================================ Instanced Parked Cars & Traffic

const CAR_COLORS = [0xe8eaed, 0x48505c, 0x7b828c, 0xa8242c, 0x244e86, 0xc9b48a, 0xd8a828, 0x3b6e52];

let sharedCarGeo: { paint: THREE.BufferGeometry[]; trim: THREE.BufferGeometry[]; lights: THREE.BufferGeometry } | null = null;
function getCarGeos() {
  if (sharedCarGeo) return sharedCarGeo;
  const paint: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const pMat = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    prepGeo(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  // 0: sedan, 1: SUV, 2: box/van
  const specs = [
    { bw: 1.82, bh: 0.62, bd: 4.3, cw: 1.54, ch: 0.54, cd: 2.05, cz: -0.15 },
    { bw: 1.92, bh: 0.72, bd: 4.5, cw: 1.68, ch: 0.68, cd: 2.75, cz: -0.3 },
    { bw: 2.04, bh: 1.55, bd: 5.2, cw: 1.92, ch: 0.65, cd: 1.35, cz: 1.4 },
  ];
  for (let k = 0; k < specs.length; k++) {
    const s = specs[k];
    const pParts = [pMat(s.bw, s.bh, s.bd, 0, 0.34 + s.bh / 2, 0), pMat(s.cw, s.ch, s.cd, 0, 0.34 + s.bh + s.ch / 2, s.cz)];
    paint.push(mergeGeometries(pParts, false)!);
    for (const g of pParts) g.dispose();

    const tParts = [
      // windshield + side glass wrap + bumpers + 4 wheels
      pMat(s.cw + 0.04, s.ch * 0.72, s.cd + 0.06, 0, 0.34 + s.bh + s.ch * 0.48, s.cz),
      pMat(s.bw + 0.04, 0.2, s.bd + 0.06, 0, 0.28, 0),
    ];
    for (const wx of [-s.bw * 0.45, s.bw * 0.45]) {
      for (const wz of [-s.bd * 0.3, s.bd * 0.3]) {
        const w = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 8);
        w.rotateZ(Math.PI / 2);
        w.translate(wx, 0.32, wz);
        tParts.push(prepGeo(w));
      }
    }
    trim.push(mergeGeometries(tParts, false)!);
    for (const g of tParts) g.dispose();
  }
  const hl = pMat(0.34, 0.14, 0.08, -0.62, 0.62, 2.26);
  const hr = pMat(0.34, 0.14, 0.08, 0.62, 0.62, 2.26);
  const lights = mergeGeometries([hl, hr], false)!;
  hl.dispose();
  hr.dispose();
  sharedCarGeo = { paint, trim, lights };
  return sharedCarGeo;
}

export class ParkedLotBuilder {
  private readonly items: Array<{ x: number; y: number; z: number; rotY: number; kind: number; color: number }> = [];
  add(x: number, z: number, rotY: number, seed: number, y = 0): void {
    const kind = seed % 11 === 0 ? 2 : seed % 3 === 0 ? 1 : 0;
    const color = kind === 2 ? 0xe6e4de : CAR_COLORS[seed % CAR_COLORS.length];
    this.items.push({ x, y, z, rotY, kind, color });
  }
  grid(x0: number, x1: number, z0: number, z1: number, stepX: number, stepZ: number, fill = 0.62, rotY = 0, seed = 1): void {
    const R = WEST_RNG(seed);
    for (let x = x0; x <= x1; x += stepX) {
      for (let z = z0; z <= z1; z += stepZ) {
        if (R() > fill) continue;
        this.add(x + (R() - 0.5) * 0.25, z + (R() - 0.5) * 0.25, rotY + (R() < 0.08 ? Math.PI : 0), Math.floor(R() * 999));
      }
    }
  }
  /** Clean bay grid helper: rows oriented along X or Z without double random call. */
  bays(x0: number, x1: number, z0: number, z1: number, cols: number, rows: number, rotY: number, fill: number, seed: number, y = 0): void {
    const R = WEST_RNG(seed);
    for (let c = 0; c < cols; c++) {
      const x = cols === 1 ? (x0 + x1) / 2 : x0 + (c / (cols - 1)) * (x1 - x0);
      for (let r = 0; r < rows; r++) {
        if (R() > fill) continue;
        const z = rows === 1 ? (z0 + z1) / 2 : z0 + (r / (rows - 1)) * (z1 - z0);
        const flip = R() < 0.25 ? Math.PI : 0;
        this.add(x + (R() - 0.5) * 0.22, z + (R() - 0.5) * 0.22, rotY + flip, Math.floor(R() * 10000), y);
      }
    }
  }
  emit(b: WorldBuilder, cx: number, cz: number, cullDist = 360): void {
    if (!this.items.length) return;
    const geos = getCarGeos();
    const paintMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.36, metalness: 0.45 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.72, metalness: 0.15 });
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    const grp = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const sub = this.items.filter((it) => it.kind === k);
      if (!sub.length) continue;
      const pm = new THREE.InstancedMesh(geos.paint[k], paintMat, sub.length);
      const tm = new THREE.InstancedMesh(geos.trim[k], trimMat, sub.length);
      sub.forEach((it, i) => {
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, it.rotY);
        m4.compose(pos.set(it.x, it.y, it.z), q, sc);
        pm.setMatrixAt(i, m4);
        tm.setMatrixAt(i, m4);
        pm.setColorAt(i, col.setHex(it.color));
      });
      pm.instanceMatrix.needsUpdate = true;
      tm.instanceMatrix.needsUpdate = true;
      if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
      pm.computeBoundingSphere();
      tm.computeBoundingSphere();
      grp.add(pm, tm);
    }
    b.scene.add(grp);
    const cull2 = cullDist * cullDist;
    b.every(() => {
      const dx = viewer.cam.x - cx;
      const dz = viewer.cam.z - cz;
      grp.visible = dx * dx + dz * dz < cull2;
    });
  }
}

export interface TrafficLane {
  axis: 'z' | 'x';
  lanePos: number; // x if axis='z', z if axis='x'
  min: number;
  max: number;
  dir: 1 | -1;
  count: number;
  speed: number;
  yAt?: (p: number) => number;
}

/** Distance-culled instanced traffic with night headlamps + tailglow. */
export function buildInstancedTraffic(
  b: WorldBuilder,
  lanes: TrafficLane[],
  cullCenter: [number, number],
  cullRadius = 460
): void {
  interface CarState {
    lane: TrafficLane;
    pos: number;
    kind: number;
    color: number;
  }
  const cars: CarState[] = [];
  const R = WEST_RNG(4888);
  for (const lane of lanes) {
    const span = lane.max - lane.min;
    for (let i = 0; i < lane.count; i++) {
      cars.push({
        lane,
        pos: lane.min + ((i + R() * 0.45) / lane.count) * span,
        kind: R() < 0.14 ? 2 : R() < 0.45 ? 1 : 0,
        color: R() < 0.12 ? 0xf2c230 : CAR_COLORS[Math.floor(R() * CAR_COLORS.length)],
      });
    }
  }
  if (!cars.length) return;
  const geos = getCarGeos();
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.5 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.72, metalness: 0.1 });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2cc });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2c22 });
  const grp = new THREE.Group();
  const batches: Array<{ pm: THREE.InstancedMesh; tm: THREE.InstancedMesh; list: CarState[] }> = [];
  const col = new THREE.Color();

  for (let k = 0; k < 3; k++) {
    const list = cars.filter((c) => c.kind === k);
    if (!list.length) continue;
    const pm = new THREE.InstancedMesh(geos.paint[k], paintMat, list.length);
    const tm = new THREE.InstancedMesh(geos.trim[k], trimMat, list.length);
    pm.frustumCulled = false;
    tm.frustumCulled = false;
    list.forEach((c, i) => pm.setColorAt(i, col.setHex(c.color)));
    if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
    grp.add(pm, tm);
    batches.push({ pm, tm, list });
  }
  const hm = new THREE.InstancedMesh(geos.lights, headMat, cars.length);
  const rm = new THREE.InstancedMesh(geos.lights, tailMat, cars.length);
  hm.frustumCulled = false;
  rm.frustumCulled = false;
  grp.add(hm, rm);
  b.scene.add(grp);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tailQ = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const cull2 = cullRadius * cullRadius;

  b.every((dt, _t, night) => {
    const dx = viewer.cam.x - cullCenter[0];
    const dz = viewer.cam.z - cullCenter[1];
    const vis = dx * dx + dz * dz < cull2;
    grp.visible = vis;
    if (!vis) return;
    const lampOn = night > 0.25;
    hm.visible = lampOn;
    rm.visible = lampOn;
    for (const c of cars) {
      const span = c.lane.max - c.lane.min;
      c.pos += c.lane.dir * c.lane.speed * dt;
      if (c.pos > c.lane.max) c.pos -= span;
      if (c.pos < c.lane.min) c.pos += span;
    }
    let idx = 0;
    for (const batch of batches) {
      batch.list.forEach((c, bi) => {
        const y = c.lane.yAt ? c.lane.yAt(c.pos) : 0;
        const yaw = c.lane.axis === 'z' ? (c.lane.dir === 1 ? 0 : Math.PI) : c.lane.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
        if (c.lane.axis === 'z') p.set(c.lane.lanePos, y, c.pos);
        else p.set(c.pos, y, c.lane.lanePos);
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        m4.compose(p, q, s);
        batch.pm.setMatrixAt(bi, m4);
        batch.tm.setMatrixAt(bi, m4);
        if (lampOn) {
          hm.setMatrixAt(idx, m4);
          tailQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw + Math.PI);
          m4.compose(p, tailQ, s);
          rm.setMatrixAt(idx, m4);
        }
        idx++;
      });
      batch.pm.instanceMatrix.needsUpdate = true;
      batch.tm.instanceMatrix.needsUpdate = true;
    }
    if (lampOn) {
      hm.instanceMatrix.needsUpdate = true;
      rm.instanceMatrix.needsUpdate = true;
    }
  });
}

// ================================================================ Street Poles & Utility Props

export function cobraPoleInto(mg: Merger, b: WorldBuilder, x: number, z: number, armYaw: number, h = 9.5, armLen = 2.6): void {
  const pole = mat(0x565a62, 0.45, 0.72);
  const bulb = basic(0xffe09c);
  const sx = Math.sin(armYaw);
  const sz = Math.cos(armYaw);
  mg.beam(pole, v3(x, 0, z), v3(x, h, z), 0.1, 6, 0.065);
  mg.beam(pole, v3(x, h - 0.15, z), v3(x + sx * armLen, h + 0.35, z + sz * armLen), 0.055, 5, 0.04);
  mg.box(pole, x + sx * armLen, h + 0.38, z + sz * armLen, 0.6, 0.14, 0.32, armYaw);
  mg.box(bulb, x + sx * armLen, h + 0.28, z + sz * armLen, 0.45, 0.06, 0.22, armYaw);
  b.collider(x - 0.16, x + 0.16, z - 0.16, z + 0.16, 0, h, true);
}

export function treeClusterInto(mg: Merger, x: number, z: number, scale = 1, seed = 0): void {
  const bark = mat(0x6e5b44, 0.9);
  const leaf = mat(seed % 2 === 0 ? 0x5c7c3a : 0x7a9242, 0.9);
  mg.beam(bark, v3(x, 0, z), v3(x, 2.2 * scale, z), 0.12 * scale, 6, 0.08 * scale);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + seed;
    const px = x + Math.cos(a) * 0.95 * scale;
    const pz = z + Math.sin(a) * 0.95 * scale;
    const py = (2.8 + (i % 2) * 0.4) * scale;
    mg.beam(bark, v3(x, 1.9 * scale, z), v3(px, py - 0.2, pz), 0.06 * scale, 4, 0.04 * scale);
    const crown = new THREE.IcosahedronGeometry(1.15 * scale, 0);
    crown.scale(1, 0.72, 1);
    mg.at(leaf, crown, px, py + 0.25 * scale, pz);
  }
}

export function chainFenceInto(b: WorldBuilder, mg: Merger, x0: number, z0: number, x1: number, z1: number, h = 2.4): void {
  const post = mat(0x888f96, 0.45, 0.72);
  const link = new THREE.MeshStandardMaterial({
    color: 0x9aa3ab,
    transparent: true,
    opacity: 0.32,
    metalness: 0.7,
    roughness: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 4));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    mg.beam(post, v3(x0 + (x1 - x0) * k, 0, z0 + (z1 - z0) * k), v3(x0 + (x1 - x0) * k, h, z0 + (z1 - z0) * k), 0.045, 5);
  }
  mg.beam(post, v3(x0, h, z0), v3(x1, h, z1), 0.03, 4);
  const p = new THREE.PlaneGeometry(len, h);
  p.translate(0, h / 2, 0);
  p.rotateY(Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2);
  p.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  mg.add(p, link);
  b.collider(Math.min(x0, x1) - 0.14, Math.max(x0, x1) + 0.14, Math.min(z0, z1) - 0.14, Math.max(z0, z1) + 0.14, 0, h, true);
}

/** Draw an offscreen texture helper reusing L0/L1. */
export { L0, L1 };
