import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SoundFX } from '../audio';
import { bakeGroup } from '../meshBake';
import type { Rideable } from '../rides';
import { viewer, type WorldBuilder } from './builder';
import { stairs } from './buildings';
import { barCounter, basic, bollard, mat, neonSign, planter } from './props';
import { CEIL_FRAG, CEIL_VERT, LIT_FRAG, LIT_VERT, SHOW_FRAG, SHOW_VERT, SKIN_FRAG, SKIN_VERT, WIND_FRAG, WIND_VERT } from './sphereShaders';
import { LedBoard } from './textures';

/**
 * Sphere at the Venetian, game scale (the real one is 157 m wide × 112 m tall; this one is 52 × 37 m,
 * the same 1 : 3 as its neighbours). Exterior: the Exosphere LED skin as one GLSL draw — a grid of
 * pucks up close, a smooth image from afar — cycling eight shows; a dark-glass ground floor under the
 * overhang, a curved entrance canopy, the plaza, box office, merch, queue lines and the Venetian bridge
 * landing. Inside: the atrium (white curves, LED ceiling, "Aura" robot greeters) and through the portal
 * the bowl — 17 steep rows, a wrap-around screen running an original procedural Kansas-twister show
 * with 4D wind, lightning and seat rumble. Hidden unless the cat or the camera is in or at the door.
 *
 * Local frame: origin on the ground under the centre, +x east (toward the screen), +z south.
 */

const CX = 177;
const CZ = -230;
const R = 26;
const CY = 11.3;
const RI = 24;
const SKIN_Y0 = 5;
const BASE_R = 22.8;
const DOOR_A = (150 / 180) * Math.PI;
const DOOR_HALF = (7 / 180) * Math.PI;
const WALL_X = -12.5;
const ATRIUM_CEIL = 13;
const PIT_Y = 4.5;
const ROWS = 17;
const ROW_D = 0.94;
const ROW_RISE = 0.8;
const ROW_FRONT = 3.5;
const ROW_Y0 = 5.0;
const AISLES = [0, -8.6, 8.6, -17.2, 17.2];
const AISLE_HALF = 0.55;
const VOM = 2.0;
const VOM_ROWS = 3;
const SHOW_LEN = 84;
const SHOW_NAME = 'The Wizard of Oz at Sphere';
const SWEET = new THREE.Vector3(CX - 4, 12, CZ);
const UP = new THREE.Vector3(0, 1, 0);

/** Dev-only overrides for snapshots: force an exterior show (0–7) and/or the bowl show time (s). */
const sphereDebug = { show: -1, showT: -1 };
if (import.meta.env.DEV) (window as unknown as { __sphere: typeof sphereDebug }).__sphere = sphereDebug;

const rowFront = (k: number) => ROW_FRONT - ROW_D * k;
const rowBack = (k: number) => rowFront(k) - ROW_D;
const rowY = (k: number) => ROW_Y0 + ROW_RISE * k;
function rowHalfW(k: number): number {
  const y = rowY(k) + 1.3 - CY;
  const h2 = RI * RI - y * y;
  const xm = Math.max(Math.abs(rowFront(k)), Math.abs(rowBack(k)));
  return Math.sqrt(Math.max(0, h2 - xm * xm)) - 1.2;
}
const rampFloor = (x: number) => THREE.MathUtils.clamp(((x - WALL_X) / (ROW_FRONT - WALL_X)) * PIT_Y, 0, PIT_Y);
const sstep = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- geometry helpers
/** Flip any triangle whose winding disagrees with its first vertex normal. */
function orient(pos: number[], nor: number[], idx: number[]): void {
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a];
    const vy = pos[c + 1] - pos[a + 1];
    const vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (nx * nor[a] + ny * nor[a + 1] + nz * nor[a + 2] < 0) {
      const s = idx[t + 1];
      idx[t + 1] = idx[t + 2];
      idx[t + 2] = s;
    }
  }
}
function geo(pos: number[], nor: number[], idx: number[]): THREE.BufferGeometry {
  orient(pos, nor, idx);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  return g;
}
/** Flat fan over a convex outline at height y (normal up or down). */
function fan(pts: Array<[number, number]>, y: number, up: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let cx = 0;
  let cz = 0;
  for (const [x, z] of pts) {
    cx += x / pts.length;
    cz += z / pts.length;
  }
  const ny = up ? 1 : -1;
  pos.push(cx, y, cz);
  nor.push(0, ny, 0);
  for (const [x, z] of pts) {
    pos.push(x, y, z);
    nor.push(0, ny, 0);
  }
  for (let i = 0; i < pts.length; i++) idx.push(0, 1 + i, 1 + ((i + 1) % pts.length));
  return geo(pos, nor, idx);
}
/** The circle of radius r cut by the line x = xCut, keeping x < xCut (the atrium's D-shaped plan). */
function dOutline(r: number, xCut: number, segs = 56): Array<[number, number]> {
  const a0 = Math.acos(xCut / r);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (i / segs) * (2 * Math.PI - 2 * a0);
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}
/** Vertical curved band on a circle (normals in or out). */
function arcWall(r: number, a0: number, a1: number, y0: number, y1: number, segs: number, inward: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const s = inward ? -1 : 1;
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    pos.push(r * c, y0, r * sn, r * c, y1, r * sn);
    nor.push(s * c, 0, s * sn, s * c, 0, s * sn);
  }
  for (let i = 0; i < segs; i++) {
    const v = i * 2;
    idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
  }
  return geo(pos, nor, idx);
}
/** A curved slab (canopy): top, underside and the outer fascia. */
function ringSlab(r0: number, r1: number, a0: number, a1: number, y0: number, y1: number, segs: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const [y, ny] of [
    [y1, 1],
    [y0, -1],
  ]) {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = a0 + ((a1 - a0) * i) / segs;
      pos.push(r0 * Math.cos(a), y, r0 * Math.sin(a), r1 * Math.cos(a), y, r1 * Math.sin(a));
      nor.push(0, ny, 0, 0, ny, 0);
    }
    for (let i = 0; i < segs; i++) {
      const v = base + i * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  }
  const out = arcWall(r1, a0, a1, y0, y1, segs, false);
  const g = geo(pos, nor, idx);
  const m = mergeGeometries([g, out], false)!;
  g.dispose();
  out.dispose();
  return m;
}
function strip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const o = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal') o.deleteAttribute(k);
  return o;
}
/** Merge meshes (positioned relative to a common parent) per material: one draw call per material. */
function mergeByMaterial(meshes: THREE.Mesh[]): THREE.Mesh[] {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const m of meshes) {
    m.updateMatrix();
    const g = strip(m.geometry);
    g.applyMatrix4(m.matrix);
    const key = m.material as THREE.Material;
    let list = by.get(key);
    if (!list) by.set(key, (list = []));
    list.push(g);
  }
  const out: THREE.Mesh[] = [];
  for (const [mt, gs] of by) {
    const merged = mergeGeometries(gs, false);
    for (const g of gs) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    out.push(new THREE.Mesh(merged, mt));
  }
  return out;
}
function bx(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}
function cyl(rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 12): THREE.Mesh {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y, z);
  return o;
}
/** Thin rod between two points. */
function rod(a: THREE.Vector3, c: THREE.Vector3, r: number, m: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(c, a);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 6), m);
  o.position.copy(a).add(c).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(UP, dir.normalize());
  return o;
}
/** Copy every mesh of a prop group into `target`, baking the group's transform (so bakeGroup can merge them). */
function flattenInto(target: THREE.Object3D, obj: THREE.Object3D): void {
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const c = new THREE.Mesh(m.geometry, m.material);
    m.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    c.castShadow = m.castShadow;
    target.add(c);
  });
}
/** Box colliders approximating a circular wall (AABBs never poke in more than `tol`). */
function ringColliders(b: WorldBuilder, r: number, y0: number, y1: number, gaps: Array<[number, number]>, tol = 0.75, thick = 0.6): void {
  const inGap = (a: number) => gaps.some(([g0, g1]) => {
    const w = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const aa = w(a);
    const lo = w(g0);
    const hi = w(g1);
    return lo <= hi ? aa > lo && aa < hi : aa > lo || aa < hi;
  });
  let a = 0;
  while (a < 2 * Math.PI - 1e-6) {
    let da = 0.45;
    while (da > 0.01) {
      const mid = a + da / 2;
      if ((r * da * Math.abs(Math.sin(2 * mid))) / 2 + (r * da * da) / 8 <= tol) break;
      da *= 0.85;
    }
    const a1 = Math.min(2 * Math.PI, a + da);
    if (!inGap((a + a1) / 2)) {
      const xs: number[] = [];
      const zs: number[] = [];
      for (const aa of [a, a1])
        for (const rr of [r, r + thick]) {
          xs.push(CX + rr * Math.cos(aa));
          zs.push(CZ + rr * Math.sin(aa));
        }
      let x0 = Math.min(...xs);
      let x1 = Math.max(...xs);
      let z0 = Math.min(...zs);
      let z1 = Math.max(...zs);
      if (x1 - x0 < thick) {
        const m = (x0 + x1) / 2;
        x0 = m - thick / 2;
        x1 = m + thick / 2;
      }
      if (z1 - z0 < thick) {
        const m = (z0 + z1) / 2;
        z0 = m - thick / 2;
        z1 = m + thick / 2;
      }
      b.collider(x0, x1, z0, z1, y0, y1, true);
    }
    a = a1;
  }
}

// ---------------------------------------------------------------- the show timeline (shared by GPU uniforms, lights and audio)
interface Strike {
  t: number;
  z: number;
  X: number;
  seed: number;
}
const STRIKES: Strike[] = [19.5, 24.8, 29.6, 33.2, 37.9, 41.4, 44.6, 48.2, 51.7, 54.9, 58.6, 61.8].map((t, i) => ({
  t,
  z: [-220, 140, -60, 260, -300, 90, 30, -150, 200, -40, 120, -10][i],
  X: 420 + ((i * 137) % 480),
  seed: (i * 0.618) % 1,
}));
interface ShowState {
  dark: number;
  wind: number;
  funnel: [number, number, number, number];
  house: [number, number, number, number];
  camH: number;
  vortex: number;
  fade: number;
  bolt: number;
  strike: Strike;
  rumble: number;
}
function showState(T: number, s: ShowState): ShowState {
  const live = T < 80.5 ? 1 : 0;
  s.dark = sstep(8, 26, T) * live;
  s.wind = (sstep(10, 30, T) * 0.6 + sstep(36, 50, T) * 0.4) * live;
  s.funnel[0] = THREE.MathUtils.lerp(1100, 150, sstep(40, 60, T));
  s.funnel[1] = THREE.MathUtils.lerp(-260, -14, sstep(30, 60, T));
  s.funnel[2] = THREE.MathUtils.lerp(520, 0, sstep(24, 40, T));
  s.funnel[3] = sstep(22, 27, T) * live;
  const L = sstep(55, 63, T);
  s.house[0] = L * L * 70;
  s.house[1] = L * L * 7 + Math.max(0, T - 63) * 1.3;
  s.house[2] = L * 6 * Math.sin(T * 1.3);
  s.house[3] = L;
  const up = sstep(58, 67, T);
  s.camH = 1.7 + up * up * 140 * live;
  s.vortex = sstep(63, 68, T) * live;
  s.fade = T < 80.5 ? sstep(76, 80, T) : 1 - sstep(80.5, 84, T);
  s.bolt = 0;
  for (const k of STRIKES) {
    const dt = T - k.t;
    if (dt < 0 || dt > 0.7) continue;
    const flick = dt < 0.06 ? 1 : dt < 0.12 ? 0.25 : dt < 0.2 ? 0.85 : dt < 0.3 ? 0.35 : 0.5;
    const v = Math.exp(-dt * 6) * flick;
    if (v > s.bolt) {
      s.bolt = v;
      s.strike = k;
    }
  }
  s.rumble = sstep(54, 58, T) * (1 - sstep(70, 76, T));
  return s;
}

// ---------------------------------------------------------------- materials
const litShared = {
  uScreen: { value: new THREE.Color(0.5, 0.42, 0.3) },
  uFlash: { value: 0 },
  uScreenPos: { value: new THREE.Vector3(CX + 14, 18, CZ) },
  uAmb: { value: 0.025 },
};
function litMat(base: number, emis = 0x000000, vertexColors = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...litShared, uBase: { value: new THREE.Color(base) }, uEmis: { value: new THREE.Color(emis) } },
    vertexShader: LIT_VERT,
    fragmentShader: LIT_FRAG,
    vertexColors,
  });
}

/** The title atlas the LED skin samples (four rows of white text). */
function titleAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const rows: Array<[string, string]> = [
    ['THE WIZARD OF OZ', 'bold 100px Georgia, "Times New Roman", serif'],
    ['AT SPHERE', 'bold 96px Georgia, "Times New Roman", serif'],
    ['SMOKING CAT TAKEOVER', '900 92px Impact, "Arial Black", sans-serif'],
    ['SPHERE', 'bold 100px Arial, sans-serif'],
  ];
  rows.forEach(([s, f], i) => {
    g.font = f;
    const w = g.measureText(s).width;
    const sc = Math.min(1, 990 / Math.max(w, 1));
    g.save();
    g.translate(512, 64 + i * 128);
    g.scale(sc, 1);
    g.fillText(s, 0, 4);
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- build
export function buildSphereVenue(b: WorldBuilder): void {
  const exterior = buildExterior(b);
  const atrium = buildAtrium(b);
  const bowl = buildBowl(b);

  const doorX = CX + BASE_R * Math.cos(DOOR_A);
  const doorZ = CZ + BASE_R * Math.sin(DOOR_A);
  let hidden = -1;
  b.every((dt, t, nt) => {
    const cam = viewer.cam;
    const cat = viewer.cat;
    const cdx = cam.x - CX;
    const cdz = cam.z - CZ;
    const kdx = cat.x - CX;
    const kdz = cat.z - CZ;
    const camIn = cdx * cdx + cdz * cdz < 23.4 * 23.4 && cam.y < 34;
    const catIn = kdx * kdx + kdz * kdz < 23.4 * 23.4 && cat.y < 34;
    const nearDoor = Math.hypot(cat.x - doorX, cat.z - doorZ) < 34 || Math.hypot(cam.x - doorX, cam.z - doorZ) < 34;
    const interior = camIn || catIn;
    const state = (interior ? 1 : 0) + (nearDoor ? 2 : 0);
    if (state !== hidden) {
      hidden = state;
      atrium.group.visible = interior || nearDoor;
      bowl.group.visible = interior;
    }
    exterior.skin.visible = !camIn || cam.y > 36;
    exterior.update(dt, t, nt, camIn);
    if (atrium.group.visible) atrium.update(dt, t);
    bowl.update(dt, t, interior, catIn && kdx > WALL_X - 0.4);
  });

  // ---- Zones, map, pickups
  b.zone('Sphere', 126, 204, -270, -190);
  b.zone('Sphere Atrium', CX - BASE_R - 1, CX + WALL_X - 0.3, CZ - 19, CZ + 19);
  b.zone(`Sphere • ${SHOW_NAME.replace(' at Sphere', '')}`, CX + WALL_X - 0.3, CX + 23.5, CZ - 23.5, CZ + 23.5);
  b.feature({ kind: 'building', x: CX, z: CZ, w: R * 2, d: R * 2, color: '#3a3a60', label: 'Sphere' });
  b.staticMarkers.push({ x: CX, z: CZ, color: '#b07dff', glyph: '●', size: 3.6 });
  b.pickup(148, 8.9, -235.5, 3, 'Sphere Bridge Pack', false);
  b.pickup(CX - 20.2, 1.6, CZ - 5, 4, 'Sphere Bar Pack', false);
  b.pickup(CX + rowBack(14) + 0.5, rowY(14) + 0.5, CZ + 15.2, 5, 'Sphere Lost & Found Pack', false);
}

// ================================================================ exterior
function buildExterior(b: WorldBuilder): { skin: THREE.Mesh; update: (dt: number, t: number, night: number, camIn: boolean) => void } {
  // ---- The Exosphere: one ShaderMaterial draw
  const front = new THREE.Vector3(-1, 0.12, 0.25).normalize();
  const fwd = front.clone().negate();
  const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
  const up2 = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const skinU = {
    uTime: { value: 0 },
    uShowA: { value: 0 },
    uShowB: { value: 1 },
    uMix: { value: 0 },
    uTA: { value: 0 },
    uTB: { value: 0 },
    uLook: { value: front.clone() },
    uBlink: { value: 0 },
    uBright: { value: 1 },
    uDay: { value: 1 },
    uCam: { value: new THREE.Vector3() },
    uFront: { value: front },
    uRight: { value: right },
    uUp: { value: up2 },
    uText: { value: titleAtlas() },
  };
  const skinMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: SKIN_VERT,
    fragmentShader: SKIN_FRAG,
    fog: true,
  });
  Object.assign(skinMat.uniforms, skinU);
  const thetaSkin = Math.acos((SKIN_Y0 - CY) / R);
  const skin = new THREE.Mesh(new THREE.SphereGeometry(R, 144, 80, 0, Math.PI * 2, 0, thetaSkin), skinMat);
  skin.position.set(CX, CY, CZ);
  skin.castShadow = true;
  b.scene.add(skin);

  // ---- Base, canopy, plaza (static: baked + culled by the world)
  const ext = new THREE.Group();
  ext.position.set(CX, 0, CZ);
  const glass = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.05, metalness: 0.9, emissive: 0x6a7c96, emissiveIntensity: 0.02, side: THREE.DoubleSide }), 0.02, 0.3);
  const gap0 = DOOR_A - DOOR_HALF;
  const gap1 = DOOR_A + DOOR_HALF;
  ext.add(new THREE.Mesh(arcWall(BASE_R, gap1, gap0 + Math.PI * 2, 0, SKIN_Y0, 140, false), glass));
  const steel = mat(0x23262c, 0.4, 0.6);
  const parts: THREE.Mesh[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    if (Math.abs(((a - DOOR_A + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < DOOR_HALF + 0.02) continue;
    parts.push(bx(0.14, SKIN_Y0, 0.18, steel, (BASE_R + 0.05) * Math.cos(a), SKIN_Y0 / 2, (BASE_R + 0.05) * Math.sin(a), -a));
  }
  // Transom band + door frames
  for (const a of [gap0, gap1]) parts.push(bx(0.3, SKIN_Y0, 0.3, steel, BASE_R * Math.cos(a), SKIN_Y0 / 2, BASE_R * Math.sin(a), -a));
  const soffitR = Math.sqrt(R * R - (SKIN_Y0 - CY) ** 2);
  const soffit = new THREE.Mesh(new THREE.RingGeometry(BASE_R - 0.05, soffitR + 0.02, 144, 1), mat(0x2a2d33, 0.6, 0.3));
  soffit.rotation.x = Math.PI / 2;
  soffit.position.y = SKIN_Y0 - 0.02;
  ext.add(soffit);
  const ledEdge = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x222831, emissive: 0xbfe9ff, emissiveIntensity: 0.15, roughness: 0.4 }), 0.15, 1.6);
  ext.add(new THREE.Mesh(arcWall(soffitR - 0.15, 0, Math.PI * 2, SKIN_Y0 - 0.25, SKIN_Y0 - 0.05, 160, false), ledEdge));
  // Doors: glass transom over the opening, sliding leaves parked open
  const doorGlass = new THREE.MeshStandardMaterial({ color: 0x9fc8e8, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.3, depthWrite: false });
  ext.add(new THREE.Mesh(arcWall(BASE_R, gap0, gap1, 3.4, SKIN_Y0, 10, false), glass));
  for (const s of [-1, 1]) {
    const a0 = DOOR_A + s * (DOOR_HALF - 0.012);
    const a1 = DOOR_A + s * (DOOR_HALF - 0.065);
    ext.add(new THREE.Mesh(arcWall(BASE_R - 0.25, Math.min(a0, a1), Math.max(a0, a1), 0, 3.4, 4, false), doorGlass));
  }
  parts.push(bx(0.25, 0.22, 5.8, steel, BASE_R * Math.cos(DOOR_A), 3.45, BASE_R * Math.sin(DOOR_A), -DOOR_A));
  // Curved entrance canopy with an LED fascia and downlights
  const cA0 = DOOR_A - 0.3;
  const cA1 = DOOR_A + 0.3;
  const canopyMat = mat(0xe9ebef, 0.35, 0.2);
  ext.add(new THREE.Mesh(ringSlab(BASE_R - 0.2, 31, cA0, cA1, 4.35, 4.7, 36), canopyMat));
  const fascia = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x1b1f26, emissive: 0x9fd8ff, emissiveIntensity: 0.2, roughness: 0.3 }), 0.2, 2.2);
  ext.add(new THREE.Mesh(arcWall(31.03, cA0, cA1, 4.38, 4.67, 36, false), fascia));
  const downlight = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xfff3dc, emissive: 0xfff0d0, emissiveIntensity: 0.3 }), 0.3, 2.4);
  for (let i = 0; i < 9; i++) {
    const a = cA0 + 0.04 + (i / 8) * (cA1 - cA0 - 0.08);
    for (const r of [25.5, 28.8]) {
      const d = cyl(0.22, 0.22, 0.04, downlight, r * Math.cos(a), 4.33, r * Math.sin(a), 10);
      ext.add(d);
    }
  }
  for (const a of [DOOR_A - 0.24, DOOR_A + 0.24]) {
    parts.push(cyl(0.16, 0.2, 4.4, steel, 30 * Math.cos(a), 2.2, 30 * Math.sin(a)));
    b.collider(CX + 30 * Math.cos(a) - 0.25, CX + 30 * Math.cos(a) + 0.25, CZ + 30 * Math.sin(a) - 0.25, CZ + 30 * Math.sin(a) + 0.25, 0, 4.4, true);
  }
  const fasciaSign = neonSign('SPHERE', '#06070c', '#ffffff', 6.5, 1.1, undefined, 0.12);
  fasciaSign.position.set(31.15 * Math.cos(DOOR_A), 5.35, 31.15 * Math.sin(DOOR_A));
  fasciaSign.rotation.y = Math.PI / 2 - DOOR_A;
  ext.add(fasciaSign);
  for (const p of mergeByMaterial(parts)) ext.add(p);
  b.add(ext);

  // The cat can't walk into the ground floor except through the doors
  ringColliders(b, BASE_R - 0.2, 0, ATRIUM_CEIL, [[gap0 + 0.01, gap1 - 0.01]], 0.7, 0.7);
  buildPlaza(b);
  buildBridgeLanding(b);

  // ---- The skin's show cycle
  const SHOWS = 8;
  const DUR = 13;
  const avg = [
    [0.95, 0.92, 0.88],
    [0.15, 0.3, 0.6],
    [0.6, 0.48, 0.32],
    [0.62, 0.62, 0.6],
    [0.85, 0.38, 0.1],
    [0.75, 0.15, 0.5],
    [1.0, 0.75, 0.15],
    [0.35, 0.22, 0.45],
  ];
  const glow = b.light(0xffffff, 26, 70, CX - 30, 9, CZ + 4, 0.05);
  const lookWant = new THREE.Vector3();
  const centre = new THREE.Vector3(CX, CY, CZ);
  const tmpC = new THREE.Color();
  const update = (dt: number, t: number, nt: number, camIn: boolean): void => {
    const cyc = t % (SHOWS * DUR);
    const forced = sphereDebug.show >= 0;
    const idx = forced ? sphereDebug.show % SHOWS : Math.floor(cyc / DUR);
    const local = forced ? (t % DUR) * 0.8 : cyc - idx * DUR;
    const next = (idx + 1) % SHOWS;
    const mix = forced ? 0 : sstep(DUR - 1.6, DUR, local);
    skinU.uTime.value = t;
    skinU.uShowA.value = idx;
    skinU.uShowB.value = next;
    skinU.uMix.value = mix;
    skinU.uTA.value = local;
    skinU.uTB.value = local - DUR;
    skinU.uBright.value = THREE.MathUtils.lerp(0.82, 0.9, nt);
    skinU.uDay.value = 1 - nt;
    skinU.uCam.value.copy(viewer.cam);
    // The eye follows Lou
    lookWant.copy(viewer.cat).setY(viewer.cat.y + 0.6).sub(centre);
    if (!camIn) {
      lookWant.normalize();
      lookWant.y = Math.max(lookWant.y, -0.12);
      lookWant.normalize();
      skinU.uLook.value.lerp(lookWant, Math.min(1, dt * 3)).normalize();
    }
    const eyeT = idx === 0 ? local : next === 0 ? local - DUR : -99;
    const bp = ((eyeT % 3.7) + 3.7) % 3.7;
    skinU.uBlink.value = eyeT > -1.5 && bp < 0.3 ? 1 - Math.abs(bp - 0.15) / 0.15 : 0;
    // The plaza glows the show's colour at night
    const a = avg[idx];
    const c = avg[next];
    tmpC.setRGB(a[0] + (c[0] - a[0]) * mix, a[1] + (c[1] - a[1]) * mix, a[2] + (c[2] - a[2]) * mix);
    glow.color.copy(tmpC);
  };
  return { skin, update };
}

function ringOutline(r: number, segs = 96): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

function buildPlaza(b: WorldBuilder): void {
  const g = new THREE.Group();
  g.position.set(CX, 0, CZ);
  // Dark granite plaza with a lit ring inlay around the Sphere
  const pav = new THREE.MeshStandardMaterial({ map: graniteTexture(), roughness: 0.5, metalness: 0.08, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  pav.map!.repeat.set(75 / 6, 78 / 6);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(75, 78), pav);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(128 + 37.5 - CX, 0.012, -230 - CZ);
  plaza.receiveShadow = true;
  g.add(plaza);
  const ringLed = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x30343c, emissive: 0xb07dff, emissiveIntensity: 0.1, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.1, 1.5);
  const ringA = Math.acos(24 / 30);
  for (const [r0, r1] of [
    [29.7, 30.0],
    [33.6, 33.75],
  ]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 120, 1, ringA, Math.PI * 2 - 2 * ringA), ringLed);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.022;
    g.add(ring);
  }
  // Ring of bollards between the plaza and the bridge/Strip approach
  const parts: THREE.Object3D[] = [];
  for (let deg = 112; deg <= 250; deg += 4.6) {
    const a = (deg / 180) * Math.PI;
    if (Math.abs(a - DOOR_A) < 0.16 || (deg > 176 && deg < 196)) continue;
    const bo = bollard();
    bo.position.set(36.5 * Math.cos(a), 0.475, 36.5 * Math.sin(a));
    bo.userData.clutter = true;
    parts.push(bo);
  }
  // Queue lines (stanchions + belts) in front of the doors
  const post = mat(0xc9ccd2, 0.25, 0.85);
  const belt = mat(0x5b2a8a, 0.6);
  const dir = new THREE.Vector2(Math.cos(DOOR_A), Math.sin(DOOR_A));
  const tan = new THREE.Vector2(-dir.y, dir.x);
  for (let row = 0; row < 4; row++) {
    const out = 6 + row * 1.6;
    const len = 9;
    for (let s = -len / 2; s <= len / 2 + 0.01; s += 1.8) {
      const px = (BASE_R + out) * dir.x + s * tan.x;
      const pz = (BASE_R + out) * dir.y + s * tan.y;
      const p = cyl(0.04, 0.05, 0.95, post, px, 0.475, pz, 8);
      p.userData.clutter = true;
      parts.push(p);
      const base = cyl(0.17, 0.17, 0.04, post, px, 0.02, pz, 10);
      base.userData.clutter = true;
      parts.push(base);
      if (s + 1.8 <= len / 2 + 0.01) {
        const bl = bx(1.8, 0.06, 0.02, belt, px + 0.9 * tan.x, 0.88, pz + 0.9 * tan.y, -Math.atan2(tan.y, tan.x));
        bl.userData.clutter = true;
        parts.push(bl);
      }
    }
  }
  // Planters
  for (const [x, z, w, d] of [
    [-31, 26, 5, 1.6],
    [-40, 9, 1.6, 6],
    [-40, -22, 1.6, 6],
    [-30, -29, 5, 1.6],
    [-22, 31, 4, 1.6],
  ]) {
    const p = planter(w, d, 0xb07dff);
    p.position.set(x, 0, z);
    parts.push(p);
    b.collider(CX + x - w / 2, CX + x + w / 2, CZ + z - d / 2, CZ + z + d / 2, 0, 0.62);
  }
  for (const p of parts) g.add(p);
  b.add(g);

  // Box office and the Sphere Store: rounded kiosks
  kiosk(b, CX - 33, CZ + 18, 'BOX OFFICE', '#ffd27a', 2.2);
  kiosk(b, CX - 32, CZ - 17, 'SPHERE STORE', '#b9a2ff', 2.8);
  // Monument "SPHERE" sign and the LED marquee pylon facing the Strip
  const mono = neonSign('SPHERE', '#05060a', '#ffffff', 9, 2.2, 'AT THE VENETIAN RESORT', 0.6);
  b.add(mono, CX - 45, 1.6, CZ + 13, -Math.PI / 2);
  b.box(CX - 45, 0, CZ + 13, 0.9, 0.5, 9.6, mat(0x15171c, 0.4, 0.4));
  const led = new LedBoard('SPHERE', ['THE WIZARD OF OZ AT SPHERE', 'NOW SHOWING DAILY', 'TICKETS AT THE BOX OFFICE', 'SMOKING CAT TAKEOVER TONIGHT'], ['#b07dff', '#ff9a3c', '#2fd1ff', '#ffcf3a'], 256, 512);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 11.2), new THREE.MeshBasicMaterial({ map: led.tex }));
  board.position.set(CX - 44.62, 8.4, CZ - 24);
  board.rotation.y = -Math.PI / 2;
  b.scene.add(board);
  b.box(CX - 44, 0, CZ - 24, 1.1, 14.4, 6.2, mat(0x17191f, 0.35, 0.5), true);
  let ledT = 0;
  b.every((dt, t) => {
    ledT += dt;
    const d = Math.hypot(viewer.cam.x - board.position.x, viewer.cam.z - board.position.z);
    board.visible = d < 420;
    if (d < 160 && ledT > 0.16) {
      ledT = 0;
      led.draw(t);
    }
  });

  // A little crowd on the plaza and in the atrium
  b.crowd.tourists.push(
    { pts: [[134, -224], [150, -214], [156.5, -216.5]], prop: 'camera' },
    { pts: [[158, -214], [146, -208], [134, -206]], prop: 'bag' },
    { pts: [[136, -250], [150, -254], [160, -258]], prop: 'yard-drink' },
    { pts: [[150, -205], [140, -230], [150, -252]], prop: 'none' },
    { pts: [[CX - 18, CZ + 9], [CX - 15, CZ + 3], [CX - 16, CZ - 6]], prop: 'camera' },
    { pts: [[CX - 20, CZ - 4], [CX - 15, CZ - 10]], prop: 'bag' }
  );
}

/** Dark flamed granite in 1.5 m slabs (4×4 per 6 m repeat), low contrast so it reads as one plaza. */
function graniteTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const tint: number[] = [];
  for (let i = 0; i < 16; i++) tint.push((rnd() - 0.5) * 7);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const t = tint[Math.floor(y / 128) * 4 + Math.floor(x / 128)];
      const joint = x % 128 < 2 || y % 128 < 2;
      const sp = rnd();
      let v = 74 + t + (sp - 0.5) * 16 + (sp > 0.985 ? 40 : 0);
      if (joint) v = 50;
      const i = (y * S + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v + 2;
      img.data[i + 2] = v + 7;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

let kioskMats: { glass: THREE.MeshStandardMaterial; ring: THREE.MeshStandardMaterial } | null = null;
function kiosk(b: WorldBuilder, x: number, z: number, label: string, fg: string, r: number): void {
  // Both kiosks share their lit materials, so the static batch folds them into one draw each
  kioskMats ??= {
    glass: b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x182230, roughness: 0.08, metalness: 0.7, emissive: 0xffe2b0, emissiveIntensity: 0.1 }), 0.1, 0.7),
    ring: b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x2a2440, emissive: 0xb07dff, emissiveIntensity: 0.2 }), 0.2, 1.8),
  };
  const g = new THREE.Group();
  g.add(cyl(r, r, 0.9, mat(0x15171c, 0.4, 0.5), 0, 0.45, 0, 24));
  g.add(cyl(r - 0.05, r - 0.05, 1.5, kioskMats.glass, 0, 1.65, 0, 24));
  g.add(cyl(r + 0.25, r + 0.25, 0.35, mat(0xeceef2, 0.35, 0.2), 0, 2.58, 0, 24));
  g.add(cyl(r + 0.27, r + 0.27, 0.08, kioskMats.ring, 0, 2.4, 0, 24));
  b.add(g, x, 0, z);
  const sign = neonSign(label, '#06070c', fg, r * 1.9, 0.6, undefined, 0.08);
  b.add(sign, x - r - 0.32, 3.15, z, -Math.PI / 2);
  b.collider(x - r, x + r, z - r, z + r, 0, 2.75, true);
}

function buildBridgeLanding(b: WorldBuilder): void {
  // The Venetian footbridge (deck at 8.4 m, x 83–151) lands on this platform against the Sphere
  const deck = mat(0xb8b2a8, 0.7, 0.15);
  const x0 = 144.8;
  const x1 = 151;
  const z0 = -237.2;
  const z1 = -226.6;
  b.box((x0 + x1) / 2, 7.9, (z0 + z1) / 2, x1 - x0, 0.5, z1 - z0, deck);
  for (const [x, z] of [
    [x0 + 0.6, z0 + 0.6],
    [x0 + 0.6, z1 - 0.6],
    [x1 - 0.6, z0 + 0.6],
    [x1 - 0.6, z1 - 0.6],
  ]) {
    b.box(x, 0, z, 0.7, 7.9, 0.7, mat(0x8f8a82, 0.7, 0.1), true);
  }
  stairs(b, 129.4, -234.6, '+x', 3.2, 8.4, 15.4, deck);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.3, roughness: 0.05 });
  b.box((x0 + x1) / 2, 8.4, z1 - 0.06, x1 - x0, 1.1, 0.12, glass, true, false);
  b.box((x0 + x1) / 2, 8.4, z0 + 0.06, x1 - x0, 1.1, 0.12, glass, true, false);
  // West edge: open where the stair (z −236.2…−233) and the bridge deck (z −231.8…−228.2) arrive
  b.box(x0 + 0.06, 8.4, (-233 - 231.8) / 2, 0.12, 1.1, 1.2, glass, true, false);
  b.box(x0 + 0.06, 8.4, (-228.2 + z1) / 2, 0.12, 1.1, z1 + 228.2, glass, true, false);
  // East edge is the Sphere itself
  b.collider(x1, x1 + 0.4, z0, z1, 8.4, 11, true);
  // Wayfinding on a post at the stair head, clear of the walkway
  b.add(neonSign('SPHERE', '#06070c', '#d9c8ff', 2.6, 0.7, 'ENTRANCE ↓ STAIRS', 0.08), x0 + 0.5, 10.0, z0 + 0.35, -Math.PI / 2);
  b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6), mat(0x2a2c32, 0.4, 0.6)), x0 + 0.5, 9.05, z0 + 0.35);
  b.zone('Sphere Bridge Landing', x0, x1, z0, z1);
}

// ================================================================ atrium
interface Robot {
  root: THREE.Group;
  head: THREE.Group;
  arm: THREE.Group;
  phase: number;
}
function auraRobot(parent: THREE.Group, x: number, z: number, yaw: number, phase: number): Robot {
  const white = mat(0xf2f4f7, 0.22, 0.05);
  const grey = mat(0xaab0ba, 0.3, 0.6);
  const visor = mat(0x06070a, 0.06, 0.9);
  const eyes = basic(0x7ff0ff);
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  root.add(cyl(0.55, 0.62, 0.22, grey, 0, 0.11, 0, 28));
  root.add(cyl(0.5, 0.5, 0.03, basic(0x7ff0ff), 0, 0.235, 0, 28));
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.72, 4, 10), white);
    leg.position.set(0, 0.72, s * 0.12);
    root.add(leg);
  }
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), grey);
  hips.scale.set(0.9, 0.6, 1.2);
  hips.position.set(0, 1.18, 0);
  root.add(hips);
  const torso = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0.13, 0],
        [0.17, 0.12],
        [0.22, 0.42],
        [0.25, 0.6],
        [0.18, 0.7],
        [0.05, 0.74],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      18
    ),
    white
  );
  torso.position.set(0, 1.22, 0);
  torso.scale.set(0.8, 1, 1.15);
  root.add(torso);
  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.58, 4, 8), white);
  leftArm.position.set(0, 1.55, -0.33);
  leftArm.rotation.x = -0.12;
  root.add(leftArm);
  for (const s of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), grey);
    sh.position.set(0, 1.86, s * 0.3);
    root.add(sh);
  }
  const head = new THREE.Group();
  head.position.set(0, 2.0, 0);
  head.add(cyl(0.05, 0.06, 0.14, grey, 0, 0.02, 0, 10));
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), white);
  skull.scale.set(1, 1.15, 0.95);
  skull.position.y = 0.2;
  head.add(skull);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 12), visor);
  face.scale.set(0.55, 0.85, 0.85);
  face.position.set(0.075, 0.2, 0);
  head.add(face);
  head.add(bx(0.03, 0.025, 0.17, eyes, 0.158, 0.23, 0));
  bakeGroup(head, (m) => m.material === eyes);
  root.add(head);
  const arm = new THREE.Group();
  arm.position.set(0, 1.86, 0.3);
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), white);
  upper.position.set(0, 0.2, 0.06);
  arm.add(upper);
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.28, 4, 8), white);
  fore.position.set(0.0, 0.55, 0.12);
  arm.add(fore);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), grey);
  hand.position.set(0, 0.76, 0.14);
  arm.add(hand);
  bakeGroup(arm);
  root.add(arm);
  bakeGroup(root, (m) => m.material === eyes);
  parent.add(root);
  return { root, head, arm, phase };
}

function buildAtrium(b: WorldBuilder): { group: THREE.Group; update: (dt: number, t: number) => void } {
  const group = new THREE.Group();
  group.position.set(CX, 0, CZ);
  group.visible = false;
  b.scene.add(group);
  const statics = new THREE.Group();
  group.add(statics);
  const xIn = WALL_X - 0.6;
  // White curves: lit by the LED ceiling at night (counters the violet night ambient), calmer by day
  const white = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xe2e2e0, roughness: 0.32, metalness: 0.05, emissive: 0xe8f2ff, emissiveIntensity: 0.0 }), 0.0, 0.2);
  const floorMat = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xd2d0cc, roughness: 0.3, metalness: 0.05, emissive: 0xeef4ff, emissiveIntensity: 0.0 }), 0.0, 0.12);
  const whites: THREE.Mesh[] = [];
  whites.push(new THREE.Mesh(fan(dOutline(BASE_R - 0.05, xIn), 0.025, true), floorMat));
  // LED ceiling
  const ceilU = { uTime: { value: 0 } };
  const ceil = new THREE.Mesh(fan(dOutline(BASE_R + 0.2, xIn + 0.2), ATRIUM_CEIL, false), new THREE.ShaderMaterial({ uniforms: ceilU, vertexShader: CEIL_VERT, fragmentShader: CEIL_FRAG }));
  group.add(ceil);
  // Curved white wall above the glass, with cove light lines
  const aA = Math.acos(xIn / BASE_R);
  const wallG = arcWall(BASE_R - 0.05, aA, Math.PI * 2 - aA, SKIN_Y0 - 0.02, ATRIUM_CEIL, 40, true);
  whites.push(new THREE.Mesh(wallG, white));
  const cove = basic(0xd8f4ff);
  group.add(new THREE.Mesh(arcWall(BASE_R - 0.12, aA, Math.PI * 2 - aA, ATRIUM_CEIL - 0.4, ATRIUM_CEIL - 0.25, 40, true), cove));
  group.add(new THREE.Mesh(arcWall(BASE_R - 0.12, aA, Math.PI * 2 - aA, SKIN_Y0 + 0.05, SKIN_Y0 + 0.16, 40, true), cove));
  // East wall (the back of the bowl) with the portal
  const zW = Math.sqrt(BASE_R * BASE_R - xIn * xIn);
  const wallX = xIn + 0.15;
  const side = zW - VOM;
  whites.push(bx(0.3, ATRIUM_CEIL, side, white, wallX, ATRIUM_CEIL / 2, -VOM - side / 2));
  whites.push(bx(0.3, ATRIUM_CEIL, side, white, wallX, ATRIUM_CEIL / 2, VOM + side / 2));
  whites.push(bx(0.3, ATRIUM_CEIL - 3.4, VOM * 2, white, wallX, 3.4 + (ATRIUM_CEIL - 3.4) / 2, 0));
  const portalU = new THREE.Color(0x7fe8ff);
  const portalMat = new THREE.MeshBasicMaterial({ color: portalU });
  const portal = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.2, 12, 56), portalMat);
  portal.position.set(wallX - 0.2, 1.4, 0);
  portal.rotation.y = Math.PI / 2;
  group.add(portal);
  const portal2 = new THREE.Mesh(new THREE.TorusGeometry(2.85, 0.06, 8, 56), basic(0xc9a8ff));
  portal2.position.set(wallX - 0.22, 1.4, 0);
  portal2.rotation.y = Math.PI / 2;
  group.add(portal2);
  const sign = neonSign(SHOW_NAME.toUpperCase(), '#0a0612', '#ffd27a', 10, 1.5, 'ENTER THE BOWL  •  SECTIONS 100–400', 0.12);
  sign.position.set(wallX - 0.25, 5.6, 0);
  sign.rotation.y = -Math.PI / 2;
  group.add(sign);
  const welcome = neonSign('SPHERE', '#06070c', '#ffffff', 8, 2.2, 'WELCOME', 0.12);
  welcome.position.set(wallX - 0.25, 9.6, 0);
  welcome.rotation.y = -Math.PI / 2;
  group.add(welcome);
  // Sculpted white "tree" columns flaring into the ceiling
  const colGeo = new THREE.LatheGeometry(
    [0.42, 0.36, 0.34, 0.38, 0.6, 1.2, 2.2, 2.9].map((r, i, arr) => new THREE.Vector2(r, (i / (arr.length - 1)) * ATRIUM_CEIL)),
    28
  );
  for (const [x, z] of [
    [-18.6, -10.6],
    [-20.4, -3.4],
    [-15.4, 13.6],
  ]) {
    const c = new THREE.Mesh(colGeo, white);
    c.position.set(x, 0, z);
    whites.push(c);
    b.collider(CX + x - 0.45, CX + x + 0.45, CZ + z - 0.45, CZ + z + 0.45, 0, ATRIUM_CEIL, true);
  }
  // Ticket scanners at the doors
  const scanGrey = mat(0x30343b, 0.3, 0.6);
  const dir = new THREE.Vector2(Math.cos(DOOR_A), Math.sin(DOOR_A));
  const tan = new THREE.Vector2(-dir.y, dir.x);
  const scanGlow = basic(0x5cff9a);
  for (const s of [-1.7, 1.7]) {
    const px = (BASE_R - 2.4) * dir.x + s * tan.x;
    const pz = (BASE_R - 2.4) * dir.y + s * tan.y;
    statics.add(cyl(0.16, 0.2, 1.1, scanGrey, px, 0.55, pz));
    group.add(cyl(0.17, 0.17, 0.04, scanGlow, px, 1.12, pz));
    b.collider(CX + px - 0.22, CX + px + 0.22, CZ + pz - 0.22, CZ + pz + 0.22, 0, 1.1, true);
  }
  // Sphere Bar along the north glass
  const bar = barCounter(6, 0x101216, 0xeceef2);
  bar.position.set(-20.4, 0, -5.5);
  bar.rotation.y = -Math.PI / 2;
  flattenInto(statics, bar);
  b.collider(CX - 20.9, CX - 19.9, CZ - 8.6, CZ - 2.4, 0, 1.1, true);
  const barSign = neonSign('SPHERE BAR', '#0a0a12', '#7fe8ff', 4.2, 0.8, undefined, 0.08);
  barSign.position.set(-21.6, 3.4, -5.5);
  barSign.rotation.y = Math.PI / 2;
  group.add(barSign);
  // Merch wall on the south side
  const merch = neonSign('SPHERE STORE', '#0a0a12', '#ffd27a', 4.8, 0.8, undefined, 0.08);
  merch.position.set(-14.6, 3.6, 15.8);
  merch.rotation.y = Math.PI + 0.35;
  group.add(merch);
  const shirtCols = [0x7d4bd6, 0x111111, 0xf2f2f2, 0x2c8fd6, 0xd65b2c, 0x2cd68c];
  for (let i = 0; i < 6; i++) {
    statics.add(bx(0.7, 0.8, 0.04, mat(shirtCols[i], 0.8), -16.9 + i * 0.85, 2.2, 15.9 - i * 0.29, -0.35));
  }
  // Floor guide lights from the doors to the portal
  const guide = basic(0x8fdcff);
  const p0 = new THREE.Vector3((BASE_R - 3.5) * dir.x, 0.035, (BASE_R - 3.5) * dir.y);
  const p1 = new THREE.Vector3(wallX - 2.2, 0.035, 0);
  for (const s of [-1.2, 1.2]) {
    const a = p0.clone().add(new THREE.Vector3(tan.x * s, 0, tan.y * s));
    const c = p1.clone().add(new THREE.Vector3(0, 0, s));
    const len = a.distanceTo(c);
    const strip1 = bx(len, 0.01, 0.08, guide, (a.x + c.x) / 2, 0.035, (a.z + c.z) / 2, -Math.atan2(c.z - a.z, c.x - a.x));
    group.add(strip1);
  }
  // Escalators up to the Level 200 balcony (the up flight is climbable)
  const escTop = 7;
  const escZ0 = -4.6;
  const escZ1 = -13.4;
  const nEsc = 16;
  const escRun = (escZ0 - escZ1) / nEsc;
  const stepMat = mat(0x3a3d44, 0.5, 0.6);
  const glassRail = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false });
  const railGlow = basic(0x8fe8ff);
  const flights: Array<[number, number]> = [
    [-15.5, -14.45],
    [-14.4, -13.35],
  ];
  for (let i = 0; i < nEsc; i++) {
    const za = escZ0 - i * escRun;
    const top = ((i + 1) / nEsc) * escTop;
    for (const [x0, x1] of flights) statics.add(bx(x1 - x0, 0.12, escRun, stepMat, (x0 + x1) / 2, top - 0.06, za - escRun / 2));
    b.collider(CX - 15.5, CX - 13.35, CZ + za - escRun, CZ + za, 0, top);
  }
  const escLen = Math.hypot(escZ0 - escZ1, escTop);
  const escAng = Math.atan2(escTop, escZ0 - escZ1);
  for (const [x0, x1] of flights) {
    const truss = bx(x1 - x0 + 0.1, 0.7, escLen, white, (x0 + x1) / 2, escTop / 2 - 0.45, (escZ0 + escZ1) / 2);
    truss.rotation.x = escAng;
    whites.push(truss);
    for (const x of [x0 - 0.03, x1 + 0.03]) {
      const gl = bx(0.03, 0.95, escLen, glassRail, x, escTop / 2 + 0.5, (escZ0 + escZ1) / 2);
      gl.rotation.x = escAng;
      group.add(gl);
      const hr = bx(0.07, 0.05, escLen, railGlow, x, escTop / 2 + 0.98, (escZ0 + escZ1) / 2);
      hr.rotation.x = escAng;
      group.add(hr);
    }
  }
  // Balcony with a glass rail, the Level 200 doors and sign
  whites.push(bx(2.8, 0.4, 2.8, white, -14.5, escTop - 0.2, -14.8));
  b.collider(CX - 15.9, CX - 13.1, CZ - 16.2, CZ - 13.4, escTop - 0.4, escTop);
  group.add(bx(0.04, 1.0, 2.8, glassRail, -15.88, escTop + 0.5, -14.8));
  group.add(bx(0.06, 0.05, 2.8, railGlow, -15.88, escTop + 1.02, -14.8));
  b.collider(CX - 16.0, CX - 15.8, CZ - 16.2, CZ - 13.4, escTop, escTop + 1.1, true);
  statics.add(bx(0.06, 2.8, 2.0, mat(0x0c0e12, 0.2, 0.6), wallX - 0.17, escTop + 1.4, -14.8));
  const lvl = neonSign('LEVEL 200', '#06070c', '#8fe8ff', 2.4, 0.55, 'SECTIONS 200–400', 0.06);
  lvl.position.set(wallX - 0.2, escTop + 3.3, -14.8);
  lvl.rotation.y = -Math.PI / 2;
  group.add(lvl);

  // Aura robots greeting guests
  const robots = [auraRobot(statics, -17.2, 7.6, -2.16, 0), auraRobot(statics, -15.2, -2.9, -2.76, 1.7), auraRobot(statics, -19.4, 3.6, -0.46, 3.1), auraRobot(statics, -17.8, -8.2, -1.03, 4.4)];
  for (const r of robots) b.collider(CX + r.root.position.x - 0.6, CX + r.root.position.x + 0.6, CZ + r.root.position.z - 0.6, CZ + r.root.position.z + 0.6, 0, 2.3, true);
  // Pull robots out of `statics` before it bakes (they animate)
  for (const r of robots) {
    statics.remove(r.root);
    group.add(r.root);
  }
  bakeGroup(statics);
  for (const m of mergeByMaterial(whites)) group.add(m);

  // Colliders: ceiling slab (camera), the east wall around the portal, the ledge above
  b.collider(CX - BASE_R - 1, CX + wallX + 0.15, CZ - 19, CZ + 19, ATRIUM_CEIL, ATRIUM_CEIL + 0.4);
  b.collider(CX + wallX - 0.15, CX + WALL_X, CZ - zW, CZ - VOM, 0, 21.3, true);
  b.collider(CX + wallX - 0.15, CX + WALL_X, CZ + VOM, CZ + zW, 0, 21.3, true);
  b.collider(CX + wallX - 0.15, CX + WALL_X, CZ - VOM, CZ + VOM, 3.4, 21.3, true);

  const tmp = new THREE.Vector3();
  const update = (_dt: number, t: number): void => {
    ceilU.uTime.value = t;
    portalU.setHSL((0.5 + 0.12 * Math.sin(t * 0.8)) % 1, 0.9, 0.62);
    for (const r of robots) {
      tmp.set(viewer.cat.x - CX - r.root.position.x, 0, viewer.cat.z - CZ - r.root.position.z);
      const near = tmp.lengthSq() < 14 * 14;
      let want = 0;
      if (near) {
        want = Math.atan2(-tmp.z, tmp.x) - r.root.rotation.y;
        while (want > Math.PI) want -= Math.PI * 2;
        while (want < -Math.PI) want += Math.PI * 2;
        want = THREE.MathUtils.clamp(want, -1.2, 1.2);
      } else want = Math.sin(t * 0.4 + r.phase) * 0.5;
      r.head.rotation.y += (want - r.head.rotation.y) * 0.08;
      r.head.rotation.z = near ? -0.12 : 0.04 * Math.sin(t * 0.7 + r.phase);
      r.arm.rotation.x = near ? -0.35 + 0.45 * Math.sin(t * 6 + r.phase) : -0.15 + 0.08 * Math.sin(t * 1.2 + r.phase);
      r.arm.rotation.z = near ? 0.25 : 0.05;
    }
  };
  return { group, update };
}

// ================================================================ bowl
function buildBowl(b: WorldBuilder): { group: THREE.Group; update: (dt: number, t: number, interior: boolean, catInBowl: boolean) => void } {
  const group = new THREE.Group();
  group.position.set(CX, 0, CZ);
  group.visible = false;
  b.scene.add(group);

  // ---- The screen: inner sphere segment running the show
  const showU = {
    uT: { value: 0 },
    uDark: { value: 0 },
    uWind: { value: 0 },
    uVortex: { value: 0 },
    uFade: { value: 0 },
    uCamH: { value: 1.7 },
    uFunnel: { value: new THREE.Vector4() },
    uHouse: { value: new THREE.Vector4() },
    uBolt: { value: new THREE.Vector4() },
    uSweet: { value: SWEET.clone() },
  };
  const thetaIn = Math.acos((1.5 - CY) / RI);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(RI, 128, 72, 0, Math.PI * 2, 0, thetaIn), new THREE.ShaderMaterial({ uniforms: showU, vertexShader: SHOW_VERT, fragmentShader: SHOW_FRAG, side: THREE.BackSide }));
  dome.position.set(0, CY, 0);
  dome.renderOrder = 1;
  group.add(dome);

  // ---- Structure (screen-lit materials, merged per material)
  const concrete = litMat(0x2c2e33);
  const tread = litMat(0x3a3c44);
  const darkM = litMat(0x15161a);
  const metal = litMat(0xb4b9c2, 0x0a0a0c);
  const stepLed = basic(0x6fb8ff);
  const parts: THREE.Mesh[] = [];
  const floorDisc = new THREE.Mesh(
    fan(
      dOutline(22.6, -WALL_X).map(([x, z]) => [-x, z] as [number, number]),
      1.5,
      true
    ),
    darkM
  );
  parts.push(floorDisc);
  // Pit floor in front of row 1 with a glass rail at its edge
  const pitX1 = 13;
  parts.push(bx(pitX1 - ROW_FRONT, PIT_Y - 1.5, 38, concrete, (ROW_FRONT + pitX1) / 2, 1.5 + (PIT_Y - 1.5) / 2, 0));
  b.collider(CX + ROW_FRONT, CX + pitX1, CZ - 18.6, CZ + 18.6, 1.5, PIT_Y);
  b.collider(CX + pitX1, CX + pitX1 + 0.15, CZ - 19, CZ + 19, PIT_Y, PIT_Y + 3, true);
  const railGlass = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.12, depthWrite: false });
  const pitRail = bx(0.04, 1.05, 37, railGlass, pitX1 + 0.07, PIT_Y + 0.52, 0);
  group.add(pitRail);
  parts.push(bx(0.08, 0.06, 37, metal, pitX1 + 0.07, PIT_Y + 1.08, 0));
  // Rows: stepped treads, steep like the real bowl
  for (let k = 0; k < ROWS; k++) {
    const hw = rowHalfW(k);
    const x0 = rowBack(k);
    const x1 = rowFront(k);
    const y = rowY(k);
    const xc = (x0 + x1) / 2;
    const vis = hw + 3;
    if (k < VOM_ROWS) {
      for (const s of [-1, 1]) {
        const zc = s * (VOM + (vis - VOM) / 2);
        parts.push(bx(ROW_D, 1.0, vis - VOM, tread, xc, y - 0.5, zc));
        b.collider(CX + x0, CX + x1, s < 0 ? CZ - hw - 1 : CZ + VOM, s < 0 ? CZ - VOM : CZ + hw + 1, y - 0.8, y);
      }
    } else {
      parts.push(bx(ROW_D, 1.0, vis * 2, tread, xc, y - 0.5, 0));
      b.collider(CX + x0, CX + x1, CZ - hw - 1, CZ + hw + 1, y - 0.8, y);
    }
    // Aisle half-steps with LED nosings
    for (const a of AISLES) {
      if (k < VOM_ROWS && Math.abs(a) < VOM + 0.1) continue;
      if (Math.abs(a) > hw - 0.3) continue;
      parts.push(bx(ROW_D / 2, ROW_RISE / 2, AISLE_HALF * 2, tread, x0 + ROW_D / 4, y + ROW_RISE / 4, a));
      parts.push(bx(0.04, 0.03, AISLE_HALF * 2 - 0.1, stepLed, x0 + ROW_D / 2 - 0.02, y + ROW_RISE / 2 + 0.01, a));
      parts.push(bx(0.04, 0.03, AISLE_HALF * 2 - 0.1, stepLed, x1 - 0.02, y + 0.01, a));
      b.collider(CX + x0, CX + x0 + ROW_D / 2, CZ + a - AISLE_HALF, CZ + a + AISLE_HALF, y, y + ROW_RISE / 2);
    }
  }
  // Aisle handrails (sloped, on posts every few rows)
  for (const a of AISLES) {
    for (const s of a === 0 ? [-1, 1] : [1]) {
      const z = a + s * (AISLE_HALF + 0.05) * (a === 0 ? 1 : Math.sign(a) || 1) * -1;
      const kFirst = Math.abs(a) < VOM + 0.1 ? VOM_ROWS : 0;
      const pa = new THREE.Vector3(rowFront(kFirst) - 0.2, rowY(kFirst) + 0.95, z);
      const pb = new THREE.Vector3(rowBack(ROWS - 1) + 0.3, rowY(ROWS - 1) + 0.95, z);
      if (Math.abs(a) > rowHalfW(ROWS - 1) - 0.3) continue;
      parts.push(rod(pa, pb, 0.035, metal));
      for (let k = kFirst; k < ROWS; k += 3) parts.push(rod(new THREE.Vector3(rowFront(k) - 0.3, rowY(k), z), new THREE.Vector3(rowFront(k) - 0.3, rowY(k) + 0.95 + (0.3 * ROW_RISE) / ROW_D, z), 0.025, metal));
    }
  }
  // Rails along the vomitory edges and the back of the top row
  for (const s of [-1, 1]) parts.push(rod(new THREE.Vector3(rowFront(0), rowY(0) + 0.95, s * (VOM + 0.1)), new THREE.Vector3(rowBack(VOM_ROWS - 1), rowY(VOM_ROWS - 1) + 0.95, s * (VOM + 0.1)), 0.035, metal));
  parts.push(bx(0.3, 21.3 - 13, 38, darkM, WALL_X - 0.15, 13 + (21.3 - 13) / 2, 0));
  parts.push(new THREE.Mesh(fan(dOutline(RI - 0.3, WALL_X - 0.3), 21.3, true), darkM));
  b.collider(CX - RI, CX + WALL_X - 0.3, CZ - 20, CZ + 20, 20.9, 21.3);

  // ---- The vomitory tunnel from the atrium to the pit
  const nSteps = 18;
  const run = (ROW_FRONT - WALL_X) / nSteps;
  for (let i = 0; i < nSteps; i++) {
    const xs = WALL_X + i * run;
    const top = ((i + 1) / nSteps) * PIT_Y;
    parts.push(bx(run, top, VOM * 2, concrete, xs + run / 2, top / 2, 0));
    parts.push(bx(0.05, 0.03, VOM * 2 - 0.2, stepLed, xs + 0.03, top + 0.012, 0));
    b.collider(CX + xs, CX + xs + run, CZ - VOM, CZ + VOM, 0, top);
  }
  const tunEnd = rowBack(VOM_ROWS - 1);
  const tunLen = tunEnd - WALL_X;
  const slope = Math.atan2(rampFloor(tunEnd) - rampFloor(WALL_X), tunLen);
  const tunWallH = rowY(VOM_ROWS) - 0.15;
  for (const s of [-1, 1]) {
    parts.push(bx(tunLen, tunWallH, 0.3, darkM, (WALL_X + tunEnd) / 2, tunWallH / 2, s * (VOM + 0.15)));
    const led = bx(tunLen / Math.cos(slope), 0.05, 0.03, stepLed, (WALL_X + tunEnd) / 2, (rampFloor(WALL_X) + rampFloor(tunEnd)) / 2 + 0.35, s * (VOM - 0.02));
    led.rotation.z = slope;
    parts.push(led);
    const led2 = led.clone();
    led2.position.y += 2.6;
    parts.push(led2);
    b.collider(CX + WALL_X, CX + tunEnd, s < 0 ? CZ - VOM - 0.3 : CZ + VOM, s < 0 ? CZ - VOM : CZ + VOM + 0.3, 0, 8, true);
  }
  const ceilT = bx(tunLen / Math.cos(slope), 0.25, VOM * 2 + 0.6, darkM, (WALL_X + tunEnd) / 2, (rampFloor(WALL_X) + rampFloor(tunEnd)) / 2 + 3.3, 0);
  ceilT.rotation.z = slope;
  parts.push(ceilT);
  const nC = 5;
  for (let i = 0; i < nC; i++) {
    const xa = WALL_X + (i / nC) * tunLen;
    const xb = WALL_X + ((i + 1) / nC) * tunLen;
    const y = rampFloor(xb) + 3.1;
    b.collider(CX + xa, CX + xb, CZ - VOM - 0.3, CZ + VOM + 0.3, y, y + 0.4);
  }
  for (const m of mergeByMaterial(parts)) group.add(m);

  // Camera containment: the dome, in bands
  for (const [y0, y1] of [
    [13, 16],
    [16, 19],
    [19, 22],
    [22, 25],
    [25, 28],
  ]) {
    const r = Math.sqrt(RI * RI - (y1 - CY) ** 2) - 0.5;
    ringColliders(b, r, y0, y1, [], 0.9, 0.6);
  }
  b.collider(CX - 15, CX + 15, CZ - 15, CZ + 15, 28, 28.4);

  // ---- Seats and audience (instanced)
  interface SeatPos {
    x: number;
    y: number;
    z: number;
    yaw: number;
    k: number;
  }
  const seats: SeatPos[] = [];
  for (let k = 0; k < ROWS; k++) {
    const hw = rowHalfW(k);
    for (let z = -hw + 0.3; z <= hw - 0.3; z += 0.56) {
      if (AISLES.some((a) => Math.abs(z - a) < AISLE_HALF + 0.26)) continue;
      if (k < VOM_ROWS && Math.abs(z) < VOM + 0.3) continue;
      const x = rowBack(k) + 0.44;
      seats.push({ x, y: rowY(k), z, yaw: Math.atan2(z, 30 - x), k });
    }
  }
  const rideTargets: Array<[number, number]> = [
    [6, -3.1],
    [6, 3.1],
    [8, -5.2],
    [8, 5.2],
    [10, -2.0],
    [10, 2.0],
    [12, -4.2],
    [12, 4.2],
  ];
  const reserved = new Set<number>();
  const empty = new Set<number>();
  for (const [k, z] of rideTargets) {
    let best = -1;
    let bd = 1e9;
    seats.forEach((s, i) => {
      if (s.k !== k) return;
      const d = Math.abs(s.z - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best < 0) continue;
    reserved.add(best);
    // Keep the seats right behind free so the over-the-shoulder camera has somewhere to be
    const bz = seats[best].z;
    seats.forEach((s, i) => {
      if (s.k === k + 1 && Math.abs(s.z - bz) < 1.0) empty.add(i);
    });
  }

  const seatGeo = mergeGeometries(
    [
      new THREE.BoxGeometry(0.46, 0.08, 0.48).translate(0.03, 0.44, 0),
      new THREE.BoxGeometry(0.07, 0.62, 0.48).rotateZ(0.18).translate(-0.24, 0.78, 0),
      new THREE.BoxGeometry(0.42, 0.05, 0.05).translate(0.0, 0.64, 0.26),
      new THREE.BoxGeometry(0.42, 0.05, 0.05).translate(0.0, 0.64, -0.26),
      new THREE.BoxGeometry(0.1, 0.42, 0.3).translate(-0.06, 0.2, 0),
    ].map(strip),
    false
  )!;
  const seatMesh = new THREE.InstancedMesh(seatGeo, litMat(0x2b3352), seats.length);
  const bodyGeo = mergeGeometries(
    [
      new THREE.BoxGeometry(0.42, 0.16, 0.36).translate(0.14, 0.57, 0),
      new THREE.BoxGeometry(0.12, 0.44, 0.32).translate(0.37, 0.27, 0),
      new THREE.BoxGeometry(0.24, 0.56, 0.4).rotateZ(0.12).translate(-0.1, 0.9, 0),
      new THREE.BoxGeometry(0.1, 0.42, 0.1).translate(-0.02, 0.92, 0.25),
      new THREE.BoxGeometry(0.1, 0.42, 0.1).translate(-0.02, 0.92, -0.25),
    ].map(strip),
    false
  )!;
  const headGeo = strip(new THREE.SphereGeometry(0.115, 8, 6).scale(1, 1.12, 0.95).translate(-0.12, 1.33, 0));
  const people = seats.map((_, i) => i).filter((i) => !reserved.has(i) && !empty.has(i) && ((i * 2654435761) >>> 0) % 100 < 86);
  const bodyMesh = new THREE.InstancedMesh(bodyGeo, litMat(0x6a6a6a), people.length);
  const headMesh = new THREE.InstancedMesh(headGeo, litMat(0x8a8a8a), people.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const pv = new THREE.Vector3();
  seats.forEach((s, i) => {
    q.setFromAxisAngle(UP, s.yaw);
    m4.compose(pv.set(s.x, s.y, s.z), q, one);
    seatMesh.setMatrixAt(i, m4);
  });
  const clothes = [0x2b2b33, 0x4a5468, 0x6a3434, 0xb8b4ac, 0x3a5a4a, 0x564a6a, 0x1a1a1f, 0x7a6a4a, 0x46607e, 0x7e5464, 0x222226, 0x8a8478];
  const skins = [0xe8c4a8, 0xc89a78, 0x9a6a48, 0x6a4430, 0xf0d0b8, 0x4a3020];
  const col = new THREE.Color();
  people.forEach((si, i) => {
    const s = seats[si];
    const lean = ((si * 7) % 11) / 11 - 0.5;
    q.setFromAxisAngle(UP, s.yaw + lean * 0.25);
    m4.compose(pv.set(s.x, s.y, s.z), q, one);
    bodyMesh.setMatrixAt(i, m4);
    headMesh.setMatrixAt(i, m4);
    bodyMesh.setColorAt(i, col.setHex(clothes[(si * 13) % clothes.length]));
    headMesh.setColorAt(i, col.setHex(skins[(si * 5) % skins.length]));
  });
  for (const m of [seatMesh, bodyMesh, headMesh]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  }

  // ---- 4D: wind-blown leaves and dust through the seating
  const N = 700;
  const seedArr = new Float32Array(N * 4);
  for (let i = 0; i < N * 4; i++) seedArr[i] = Math.random();
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  pg.setAttribute('seed', new THREE.BufferAttribute(seedArr, 4));
  pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 12, 0), 30);
  const windU = {
    uTime: { value: 0 },
    uWind: { value: 0 },
    uBoxMin: { value: new THREE.Vector3(WALL_X, 4.6, -20) },
    uBoxSize: { value: new THREE.Vector3(26, 18, 40) },
    uScale: { value: 700 },
    uScreen: litShared.uScreen,
    uFlash: litShared.uFlash,
  };
  const winds = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: windU, vertexShader: WIND_VERT, fragmentShader: WIND_FRAG, transparent: true, depthWrite: false }));
  winds.renderOrder = 3;
  const dbs = new THREE.Vector2();
  winds.onBeforeRender = (renderer, _s, camera) => {
    renderer.getDrawingBufferSize(dbs);
    const cam = camera as THREE.PerspectiveCamera;
    windU.uScale.value = dbs.y / (2 * Math.tan(THREE.MathUtils.degToRad((cam.fov ?? 56) / 2)));
  };
  group.add(winds);

  // ---- Seats you can take
  const st: ShowState = { dark: 0, wind: 0, funnel: [0, 0, 0, 0], house: [0, 0, 0, 0], camH: 1.7, vortex: 0, fade: 0, bolt: 0, strike: STRIKES[0], rumble: 0 };
  let showT = 0;
  const look = new THREE.Vector3();
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  for (const si of reserved) {
    const s = seats[si];
    const wx = CX + s.x;
    const wz = CZ + s.z;
    const fwdX = Math.cos(s.yaw);
    const fwdZ = -Math.sin(s.yaw);
    const r: Rideable = {
      id: `sphere-seat-${si}`,
      kind: 'seat',
      label: `Sphere seat (Row ${s.k + 1})`,
      boardRadius: 0.8,
      boardPoint: (out) => out.set(wx, s.y, wz),
      seat: (out) => out.set(wx + fwdX * 0.05, s.y + 0.5, wz + fwdZ * 0.05),
      yaw: () => Math.atan2(fwdX, fwdZ),
      exitPoint: (out) => out.set(wx + fwdX * 0.42, s.y + 0.02, wz + fwdZ * 0.42),
      canBoard: () => ({ ok: true }),
      boardPrompt: `Press [G] to take your seat for ${SHOW_NAME} (Row ${s.k + 1})`,
      ridingPrompt: `🌪️ ${SHOW_NAME} — [G] get up`,
      status: () => `${SHOW_NAME} • ${fmt(showT)} / ${fmt(SHOW_LEN)}`,
      view: () => {
        const tt = performance.now() / 1000;
        const rum = st.rumble * 0.06 + st.bolt * 0.03;
        look.set(CX + 22, 15.5, CZ + s.z * 0.4);
        look.x += Math.sin(tt * 37) * rum;
        look.y += Math.sin(tt * 43 + 1.3) * rum + Math.sin(tt * 11) * rum * 0.5;
        return { yaw: -Math.PI / 2 + s.yaw * 0.6, pitch: 0.5, dist: 1.45, look };
      },
    };
    b.rideables.push(r);
  }

  // ---- Per-frame: the show, the screen light, 4D effects, audio
  let lastT = -1;
  let audioT = 0;
  const update = (dt: number, t: number, interior: boolean, catInBowl: boolean): void => {
    showT = sphereDebug.showT >= 0 ? sphereDebug.showT : t % SHOW_LEN;
    showState(showT, st);
    if (lastT >= 0 && catInBowl) {
      for (const k of STRIKES) {
        if (lastT < k.t && showT >= k.t) SoundFX.current?.playThunder(0.55 + 0.45 * (1 - (k.X - 420) / 480), 0.25 + k.X / 1400);
      }
    }
    lastT = showT;
    audioT -= dt;
    if (audioT <= 0) {
      audioT = 0.12;
      SoundFX.current?.setStorm(catInBowl ? 1 : 0, Math.max(st.wind, st.vortex * 0.9), st.rumble);
    }
    if (!interior) return;
    showU.uT.value = showT;
    showU.uDark.value = st.dark;
    showU.uWind.value = st.wind;
    showU.uVortex.value = st.vortex;
    showU.uFade.value = st.fade;
    showU.uCamH.value = st.camH;
    showU.uFunnel.value.fromArray(st.funnel);
    showU.uHouse.value.fromArray(st.house);
    showU.uBolt.value.set(st.bolt, st.strike.z, st.strike.X, st.strike.seed);
    const level = (1 - st.vortex) * THREE.MathUtils.lerp(0.8, 0.3, st.dark) + st.vortex * 0.58 + st.fade * 1.1;
    litShared.uScreen.value.setRGB(1.0 * level, 0.84 * level, 0.62 * level);
    litShared.uFlash.value = st.bolt * 1.4;
    windU.uTime.value = t;
    windU.uWind.value = Math.max(st.wind, st.vortex);
  };
  return { group, update };
}
