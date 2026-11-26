import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeGroup } from '../meshBake';
import { viewer, type WorldBuilder } from './builder';
import { buildSlots, type SlotPlacement } from './interiorKit';
import { basic, car, mat, mesh, neonSign, palmPieces } from './props';
import type { CarKind } from './props';
import { xFromO, zFromS } from './strip';
import { lazyInterior } from './themedKit';

/**
 * Harry Reid International Airport (LAS), just east and south-east of the Welcome sign.
 *
 * Real positions come from the FAA runway-end coordinates and OpenStreetMap (terminals, tower,
 * FBOs), measured from the sign and squeezed like the rest of the south Strip (xFromO / zFromS,
 * 1:4.5). Inside the playable map: the airfield fence along the Boulevard, the Signature private-
 * jet ramp, runway 1L/19R and a walk-up Terminal 1 front on Russell Rd (the real one sits 2 km
 * east, past the map edge, so the game moves its curb, lobby and gates in to where Lou can reach
 * them). Past the edge: 1R/19L, 8L/26R, 8R/26L, the A/B/C piers, the D gates, the FAA tower and
 * Terminal 3. Airliners depart 1L/1R and land on 26L/26R (the usual west-flow setup), one about
 * every 40 s, with gear, nav lights, strobes, landing lights and a jet roar.
 */
export function buildAirport(b: WorldBuilder): void {
  const mg = new Merger();
  buildFenceAndGround(b, mg);
  buildRunways(b, mg);
  buildTerminal1(b, mg);
  buildGates(b, mg);
  buildSignature(b, mg);
  buildFarSide(b, mg);
  mg.flush(b);
  buildTraffic(b);
  b.feature({ kind: 'plaza', x: 140, z: 900, w: 130, d: 140, color: '#8a7c5c', label: 'Harry Reid Intl (LAS)' });
  b.building(111, 852, 78, 24, '#c9ced6', 'Terminal 1');
  b.zone('Harry Reid International Airport', FX, 205, RUSSELL_S + 0.6, 964);
  b.zone('Terminal 1 Curb • Harry Reid Airport', 70, 156, RUSSELL_S, T1.z0);
  b.zone('Terminal 1 Lobby • Harry Reid Airport', T1.x0, T1.x1, T1.z0, T1.z1);
}

// ---------------------------------------------------------------- real → game
const RUSSELL_S = zFromS(-3182) + 12.2; // 818.9, south kerb of Russell Rd
const FX = 21.2; // airfield fence along the Boulevard
const SIGN = { lat: 36.0820593, lon: -115.1727735, s: -3635 }; // the Welcome sign (OSM), in the median at x = 0
const M_LAT = 110950;
const M_LON = 89990;
/** Lat/lon → game (x, 0, z), measured from the Welcome sign, squeezed like the south Strip. */
function ll(lat: number, lon: number, shiftX = 0): THREE.Vector3 {
  const n = (lat - SIGN.lat) * M_LAT;
  const e = (lon - SIGN.lon) * M_LON;
  return new THREE.Vector3(xFromO(e) + shiftX, 0, zFromS(SIGN.s + n));
}

interface Runway {
  a: THREE.Vector3;
  b: THREE.Vector3;
  dir: THREE.Vector3;
  /** Right of `dir`. */
  side: THREE.Vector3;
  len: number;
  w: number;
  ends: [string, string];
}
function runway(aLat: number, aLon: number, bLat: number, bLon: number, ends: [string, string], shiftX = 0): Runway {
  const a = ll(aLat, aLon, shiftX);
  const b = ll(bLat, bLon, shiftX);
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.divideScalar(len);
  return { a, b, dir, side: new THREE.Vector3(-dir.z, 0, dir.x), len, w: 18, ends };
}
/** 1L/19R and 1R/19L move 30 m east so 1L clears Russell Rd inside the map (real heading 025° kept). */
const NS_SHIFT = 30;
// FAA runway-end coordinates (true heading 025° / 090°)
const R1L = runway(36.075327, -115.1703639, 36.0996632, -115.1564341, ['1L', '19R'], NS_SHIFT);
const R1R = runway(36.0742427, -115.1674867, 36.0985756, -115.1535582, ['1R', '19L'], NS_SHIFT);
const R8L = runway(36.0763657, -115.1712737, 36.0764065, -115.121083, ['8L', '26R']);
const R8R = runway(36.0736288, -115.1614338, 36.0736575, -115.125824, ['8R', '26L']);
const RUNWAYS = [R1L, R1R, R8L, R8R];
/** Point `s` metres along a runway, `off` metres to its right. */
function along(r: Runway, s: number, off = 0, y = 0): THREE.Vector3 {
  return r.a.clone().addScaledVector(r.dir, s).addScaledVector(r.side, off).setY(y);
}

/** Terminal 1 front (walk-up, inside the map) */
const T1 = { x0: 72, x1: 150, z0: 840, z1: 864, h: 13 };
const T1_GATES = [86, 112, 138];
const GATE_NOSE_Z = 867.5;

// ---------------------------------------------------------------- small helpers
const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function prepGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx: number[] = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(idx);
  }
  g.clearGroups();
  return g;
}

const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
/** Cylinder from a to c (radius r at a, rTop at c). */
function beamGeo(a: THREE.Vector3, c: THREE.Vector3, r: number, seg = 6, rTop = r): THREE.BufferGeometry {
  _dir.subVectors(c, a);
  const len = Math.max(0.001, _dir.length());
  const g = new THREE.CylinderGeometry(rTop, r, len, seg, 1);
  _q.setFromUnitVectors(UP, _dir.divideScalar(len));
  g.applyQuaternion(_q);
  g.translate((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
  return g;
}

/** Collects many small pieces and emits one merged mesh per material (keeps the mesh count low). */
class Merger {
  private readonly lists = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  add(g: THREE.BufferGeometry, m: THREE.Material, cast = false): void {
    let e = this.lists.get(m);
    if (!e) {
      e = { geos: [], cast: false };
      this.lists.set(m, e);
    }
    e.geos.push(prepGeo(g));
    e.cast ||= cast;
  }
  box(m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, cast = false): void {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add(g, m, cast);
  }
  beam(m: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, r: number, seg = 6, rTop = r, cast = false): void {
    this.add(beamGeo(a, c, r, seg, rTop), m, cast);
  }
  at(m: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, cast = false): void {
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add(g, m, cast);
  }
  flush(b: WorldBuilder, toScene = false): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [m, e] of this.lists) {
      if (!e.geos.length) continue;
      const merged = mergeGeometries(e.geos, false);
      for (const g of e.geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const me = new THREE.Mesh(merged, m);
      me.castShadow = e.cast;
      me.receiveShadow = true;
      if (toScene) b.scene.add(me);
      else b.add(me);
      out.push(me);
    }
    this.lists.clear();
    return out;
  }
}

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Flat quad from a to c, `w` wide, at height y; u runs across (u0..u1), v along (len / vLen). */
function flatStrip(a: THREE.Vector3, c: THREE.Vector3, w: number, y: number, vLen: number, u0 = 0, u1 = 1): THREE.BufferGeometry {
  const d = c.clone().sub(a);
  const len = d.length();
  d.divideScalar(len);
  const sx = -d.z * (w / 2);
  const sz = d.x * (w / 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a.x - sx, y, a.z - sz, a.x + sx, y, a.z + sz, c.x + sx, y, c.z + sz, c.x - sx, y, c.z - sz], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  const v = len / vLen;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, 0, u1, 0, u1, v, u0, v], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Chain-link fence run between two points (posts, rails, barbed top, translucent mesh) + an isWall collider. */
const linkMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, transparent: true, opacity: 0.32, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide, depthWrite: false });
function chainLink(b: WorldBuilder, mg: Merger, x0: number, z0: number, x1: number, z1: number, h = 3): void {
  const post = mat(0x8c9196, 0.45, 0.7);
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ang = Math.atan2(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const px = x0 + (x1 - x0) * k;
    const pz = z0 + (z1 - z0) * k;
    mg.beam(post, v3(px, 0, pz), v3(px, h + 0.5, pz), 0.05, 5);
  }
  mg.beam(post, v3(x0, h, z0), v3(x1, h, z1), 0.035, 4);
  mg.beam(post, v3(x0, 0.15, z0), v3(x1, 0.15, z1), 0.025, 4);
  for (const dy of [0.2, 0.35, 0.5]) mg.beam(mat(0x3a3a3a, 0.6, 0.6), v3(x0, h + dy, z0), v3(x1, h + dy, z1), 0.012, 3);
  const panel = new THREE.PlaneGeometry(len, h);
  panel.translate(0, h / 2, 0);
  panel.rotateY(ang + Math.PI / 2);
  panel.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  mg.add(panel, linkMat);
  b.collider(Math.min(x0, x1) - 0.12, Math.max(x0, x1) + 0.12, Math.min(z0, z1) - 0.12, Math.max(z0, z1) + 0.12, 0, h + 0.4, true);
}

function sign(b: WorldBuilder, text: string, bg: string, fg: string, w: number, h: number, x: number, y: number, z: number, rotY: number, sub?: string, depth = 0.28): THREE.Mesh {
  return b.add(neonSign(text, bg, fg, w, h, sub, depth), x, y, z, rotY);
}

/** A palm into a merger (shared palm pieces). */
function palmInto(mg: Merger, x: number, z: number, h: number, seed: number): void {
  for (const p of palmPieces(h, false, seed)) {
    const g = p.geo.clone().applyMatrix4(p.matrix);
    g.translate(x, 0, z);
    mg.add(g, p.mat, p.cast);
  }
}

/** Markings painted on tarmac: lit (not glowing), pulled toward the camera so they never fight the asphalt. */
const paint = (color: number) => new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
const PAINT_WHITE = paint(0xe6e6df);
const PAINT_YELLOW = paint(0xe8b81c);

// ---------------------------------------------------------------- airport lights (one draw call)
/**
 * Every fixed airport light is a point in one Points cloud with its own colour, size and blink:
 * runway edges, thresholds, taxiway blues, approach bars and the "rabbit", PAPIs, the beacon,
 * apron floods. Sized in metres (with a pixel floor so far lights still read as dots), additive,
 * fog-free so they carry across the airfield at night like the real thing.
 */
const lightUniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 600 } };
let lightMat: THREE.ShaderMaterial | null = null;
function lightMaterial(): THREE.ShaderMaterial {
  return (lightMat ??= new THREE.ShaderMaterial({
    uniforms: lightUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexShader: /* glsl */ `
      attribute vec3 tint; attribute float size; attribute vec3 anim;
      uniform float uTime, uNight, uScale;
      varying vec3 vColor; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float on = anim.x > 0.0 ? step(fract(uTime * anim.x + anim.y), 0.12) : 1.0;
        vA = on * mix(anim.z, 1.0, uNight);
        vColor = tint;
        gl_PointSize = clamp(size * uScale / max(-mv.z, 0.5), 1.6, 30.0);
        gl_Position = projectionMatrix * mv;
        if (vA < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vA;
      void main() {
        float r = clamp(length(gl_PointCoord - 0.5) * 2.0, 0.0, 1.0);
        float core = 1.0 - r;
        float a = (core * core + 0.6 * smoothstep(0.55, 0.0, r)) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor * a, a);
      }`,
  }));
}
const _col = new THREE.Color();
class LightSet {
  readonly pos: number[] = [];
  readonly tint: number[] = [];
  readonly size: number[] = [];
  readonly anim: number[] = [];
  /** rate: flashes per second (0 = steady); day: how much shows by day (0..1). */
  add(p: THREE.Vector3, color: number, size: number, intensity = 1.3, rate = 0, phase = 0, day = 0): void {
    _col.setHex(color).multiplyScalar(intensity);
    this.pos.push(p.x, p.y, p.z);
    this.tint.push(_col.r, _col.g, _col.b);
    this.size.push(size);
    this.anim.push(rate, phase, day);
  }
  build(): THREE.Points {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(this.tint, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(this.size, 1));
    g.setAttribute('anim', new THREE.Float32BufferAttribute(this.anim, 3));
    const p = new THREE.Points(g, lightMaterial());
    p.frustumCulled = false;
    p.renderOrder = 3;
    const size = new THREE.Vector2();
    p.onBeforeRender = (renderer, _scene, camera) => {
      const cam = camera as THREE.PerspectiveCamera;
      renderer.getDrawingBufferSize(size);
      lightUniforms.uScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad((cam.fov ?? 56) / 2)));
    };
    return p;
  }
}
const lights = new LightSet();
const C_EDGE = 0xffe2b0;
const C_BLUE = 0x2f5cff;
const C_GREEN = 0x30ff6a;
const C_RED = 0xff2a20;
const C_WHITE = 0xffffff;
const C_SODIUM = 0xffc27a;

// ---------------------------------------------------------------- fence + ground
function buildFenceAndGround(b: WorldBuilder, mg: Merger): void {
  const fz1 = 869.5;
  // Fence: Russell Rd east of the terminal landside, the landside's east edge, round Pinball/Dream,
  // then down the Boulevard to the map edge.
  chainLink(b, mg, 156, RUSSELL_S + 0.6, 204, RUSSELL_S + 0.6);
  chainLink(b, mg, 156, RUSSELL_S + 0.6, 156, T1.z1);
  chainLink(b, mg, 150, T1.z1, 156, T1.z1);
  chainLink(b, mg, 70, RUSSELL_S + 0.6, 70, fz1);
  chainLink(b, mg, 70, fz1, FX, fz1);
  chainLink(b, mg, FX, fz1, FX, 959.5);
  for (let z = 885; z < 955; z += 30) sign(b, 'HARRY REID INTERNATIONAL AIRPORT', '#0a1a3a', '#ffffff', 7.4, 1.0, FX - 0.08, 1.6, z, -Math.PI / 2, 'AIR OPERATIONS AREA • NO TRESPASSING', 0.05);

  // Airfield ground: tan desert infield inside the map and out to the far fences
  const airGround = new THREE.MeshStandardMaterial({ color: 0xa8976f, roughness: 1, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  b.floor((FX + 205) / 2, (fz1 + 964) / 2, 205 - FX, 964 - fz1, airGround, 0.008);
  b.floor((156 + 205) / 2, (RUSSELL_S + fz1) / 2, 49, fz1 - RUSSELL_S, airGround, 0.008);
  b.floor((70 + 156) / 2, (T1.z1 + fz1) / 2, 86, fz1 - T1.z1, airGround, 0.008);
  b.floor(663, 810, 914, 740, airGround, 0.0);
  b.floor(113, 1072, 186, 216, airGround, 0.0);
  // Perimeter service road inside the Boulevard fence
  b.floor(FX + 4.6, (fz1 + 964) / 2, 4.5, 964 - fz1 - 1, mat(0x45464c, 0.85), 0.034);

  // Windsock beside 1L, inside the fence
  const sockPos = along(R1L, 150, -16);
  mg.beam(mat(0xdddddd, 0.4, 0.6), v3(sockPos.x, 0, sockPos.z), v3(sockPos.x, 6, sockPos.z), 0.08, 6);
  const sock = mesh(new THREE.ConeGeometry(0.45, 2.4, 10, 1, true).rotateZ(-Math.PI / 2).translate(1.2, 0, 0), mat(0xff6a00, 0.7, 0, { side: THREE.DoubleSide }), sockPos.x, 5.8, sockPos.z);
  b.scene.add(sock);
  lights.add(v3(sockPos.x, 6.3, sockPos.z), C_RED, 0.5, 1.2);
  b.every((_dt, t) => {
    sock.rotation.y = 0.6 + Math.sin(t * 0.3) * 0.35;
  });
}

// ---------------------------------------------------------------- runways, taxiways, lights
function runwayTextures(): { strip: THREE.CanvasTexture; ends: THREE.CanvasTexture; taxi: THREE.CanvasTexture } {
  const tarmac = (ctx: CanvasRenderingContext2D, w: number, h: number, base: number) => {
    ctx.fillStyle = `rgb(${base},${base},${base + 4})`;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 40; i++) {
      const v = base + 6 + ((i * 37) % 20);
      ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
      ctx.fillRect((i * 53) % w, (i * 97) % h, 2, 2);
    }
  };
  const strip = canvasTex(128, 512, (ctx, w, h) => {
    tarmac(ctx, w, h, 50);
    ctx.fillStyle = 'rgba(18,18,20,0.35)'; // rubber down the middle
    ctx.fillRect(w / 2 - 22, 0, 44, h);
    ctx.fillStyle = '#ededE6';
    ctx.fillRect(3, 0, 4, h);
    ctx.fillRect(w - 7, 0, 4, h);
    ctx.fillRect(w / 2 - 2, 30, 4, 200);
    ctx.fillRect(w / 2 - 2, 286, 4, 200);
  });
  strip.wrapS = strip.wrapT = THREE.RepeatWrapping;
  const taxi = canvasTex(64, 256, (ctx, w, h) => {
    tarmac(ctx, w, h, 58);
    ctx.fillStyle = '#e8b81c';
    ctx.fillRect(w / 2 - 2, 0, 4, h);
    ctx.fillRect(1, 0, 2, h);
    ctx.fillRect(w - 3, 0, 2, h);
  });
  taxi.wrapS = taxi.wrapT = THREE.RepeatWrapping;
  // 8 cells: piano keys at the runway end (canvas bottom), the number further in
  const names = RUNWAYS.flatMap((r) => r.ends);
  const ends = canvasTex(128 * 8, 256, (ctx, _w, h) => {
    names.forEach((n, k) => {
      const x0 = k * 128;
      ctx.save();
      ctx.translate(x0, 0);
      ctx.fillStyle = '#34353a';
      ctx.fillRect(0, 0, 128, h);
      ctx.fillStyle = '#efefe8';
      for (let i = 0; i < 8; i++) ctx.fillRect(9 + i * 14 + (i >= 4 ? 4 : 0), h - 92, 8, 84);
      ctx.fillRect(3, 0, 4, h);
      ctx.fillRect(121, 0, 4, h);
      ctx.font = 'bold 70px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const num = n.replace(/[LR]$/, '');
      const lr = n.slice(num.length);
      ctx.fillText(num, 64, 52, 110);
      if (lr) {
        ctx.font = 'bold 56px system-ui, sans-serif';
        ctx.fillText(lr, 64, 124);
      }
      ctx.restore();
    });
  });
  return { strip, ends, taxi };
}

/** Taxiway centre-lines (game coords), shared with the traffic. */
const TAXI: Array<[THREE.Vector3, THREE.Vector3]> = [];
function buildRunways(b: WorldBuilder, mg: Merger): void {
  const { strip, ends, taxi } = runwayTextures();
  const runGeos: THREE.BufferGeometry[] = [];
  const endGeos: THREE.BufferGeometry[] = [];
  const names = RUNWAYS.flatMap((r) => r.ends);
  RUNWAYS.forEach((r, i) => {
    runGeos.push(flatStrip(r.a, r.b, r.w, 0.06, 40));
    // Thresholds: one quad at each end, facing the landing direction
    for (const e of [0, 1]) {
      const start = e === 0 ? r.a : r.b;
      const into = e === 0 ? r.dir : r.dir.clone().negate();
      const k = names.indexOf(r.ends[e]);
      endGeos.push(flatStrip(start, start.clone().addScaledVector(into, r.w * 1.6), r.w, 0.075, r.w * 1.6, k / 8, (k + 1) / 8));
      // Aiming point + touchdown-zone bars
      const L = (s: number, off: number, len: number, wid: number) => {
        const p0 = start.clone().addScaledVector(into, s);
        const sd = v3(-into.z, 0, into.x).multiplyScalar(off);
        mg.add(flatStrip(p0.clone().add(sd), p0.clone().add(sd).addScaledVector(into, len), wid, 0.08, 1), PAINT_WHITE);
      };
      for (const sd of [-1, 1]) {
        L(70, sd * 4.6, 14, 2.6);
        for (const s of [40, 100, 125]) for (const o of [3.2, 5.6]) L(s, sd * o, 6, 1.1);
      }
      // Threshold greens across the end, PAPI on the left (two red over two white = on the slope)
      const sideV = v3(-into.z, 0, into.x);
      for (let j = 0; j < 9; j++) lights.add(start.clone().addScaledVector(sideV, -r.w / 2 + (j * r.w) / 8).setY(0.35), C_GREEN, 0.9, 1.4);
      for (let j = 0; j < 4; j++) lights.add(start.clone().addScaledVector(into, 70).addScaledVector(sideV, -(r.w / 2 + 6 + j * 2.4)).setY(0.6), j < 2 ? C_RED : C_WHITE, 1.0, 1.5, 0, 0, 0.35);
    }
    // Edge lights (the last 130 m of each end amber)
    for (let s = 0; s <= r.len; s += 13) for (const sd of [-1, 1]) lights.add(along(r, s, sd * (r.w / 2 + 0.7), 0.35), s > r.len - 130 || s < 130 ? 0xffc060 : C_EDGE, 0.9, 1.25);
    // Centre-line lights on the long ones
    if (i >= 2) for (let s = 30; s < r.len - 30; s += 22) lights.add(along(r, s, 0, 0.12), C_EDGE, 0.55, 0.9);
  });
  // Tarmac sits a few cm over the infield and is pulled toward the camera, so far-off runways never sink into it
  const runMat = new THREE.MeshStandardMaterial({ map: strip, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const endMat = new THREE.MeshStandardMaterial({ map: ends, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  b.add(new THREE.Mesh(mergeGeometries(runGeos)!, runMat));
  b.add(new THREE.Mesh(mergeGeometries(endGeos)!, endMat));

  // Taxiways: the west parallel of 1L (into the T1 apron), the east parallel of 1R, the north
  // parallel of 8L/26R, the south parallel of 8R/26L, and links to the gates.
  const tw = (a: THREE.Vector3, c: THREE.Vector3) => TAXI.push([a.clone().setY(0), c.clone().setY(0)]);
  tw(along(R1L, -14, -26), along(R1L, 176, -26));
  tw(along(R1L, 0, -26), along(R1L, 0, 0));
  tw(along(R1L, 92, -26), along(R1L, 92, 0));
  tw(along(R1L, 176, -26), v3(76, 0, 903));
  tw(along(R1R, 0, 26), along(R1R, R1R.len, 26));
  tw(along(R1R, 0, 26), along(R1R, 0, 0));
  tw(along(R1R, R1R.len * 0.55, 26), along(R1R, R1R.len * 0.55, 0));
  tw(along(R8L, 44, -26), along(R8L, R8L.len - 20, -26));
  tw(along(R8L, R8L.len - 20, -26), along(R8L, R8L.len - 20, 0));
  tw(along(R8R, 0, 26), along(R8R, R8R.len, 26));
  tw(along(R8R, R8R.len, 26), along(R8R, R8R.len, 0));
  tw(v3(420, 0, R8R.a.z), v3(420, 0, 905));
  tw(v3(560, 0, along(R8L, 0, -26).z), v3(560, 0, 950));
  tw(v3(240, 0, along(R8L, 0, -26).z), along(R1R, 200, 26));
  const taxiGeos = TAXI.map(([a, c]) => flatStrip(a, c, 11, 0.045, 20));
  b.add(new THREE.Mesh(mergeGeometries(taxiGeos)!, new THREE.MeshStandardMaterial({ map: taxi, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })));
  for (const [a, c] of TAXI) {
    const d = c.clone().sub(a);
    const len = d.length();
    d.divideScalar(len);
    const sd = v3(-d.z, 0, d.x);
    for (let s = 6; s < len - 6; s += 9) for (const k of [-1, 1]) lights.add(a.clone().addScaledVector(d, s).addScaledVector(sd, k * 6.2).setY(0.3), C_BLUE, 0.7, 1.6);
  }
  // Runway guard signs (red with white text) at the 1L holding points
  for (const s of [0, 92]) {
    const p = along(R1L, s, -16);
    mg.box(mat(0x1a1a1a, 0.6), p.x, 0.5, p.z, 0.2, 1.0, 0.2);
    b.add(neonSign('1L-19R', '#c81d1d', '#ffffff', 2.4, 0.8, undefined, 0.15), p.x, 1.1, p.z, Math.atan2(R1L.dir.x, R1L.dir.z) + Math.PI / 2);
  }

  // Approach lights: 1L and 1R from the south-west, 26L and 26R from the east, each with its rabbit
  const approach = (r: Runway, fromEnd: 0 | 1, bars: number) => {
    const start = fromEnd === 0 ? r.a : r.b;
    const out = fromEnd === 0 ? r.dir.clone().negate() : r.dir.clone();
    const sd = v3(-out.z, 0, out.x);
    for (let k = 1; k <= bars; k++) {
      const p = start.clone().addScaledVector(out, k * 13);
      const y = 0.6 + k * 0.08;
      for (let j = -2; j <= 2; j++) lights.add(p.clone().addScaledVector(sd, j * 1.3).setY(y), C_EDGE, 0.8, 1.35);
      if (k === 4) for (let j = -6; j <= 6; j++) lights.add(p.clone().addScaledVector(sd, j * 1.3).setY(y), C_EDGE, 0.8, 1.35);
      lights.add(p.clone().setY(y + 0.5), C_WHITE, 1.7, 2.0, 2, (k / bars) * 0.9, 0.4);
      mg.beam(mat(0x6a6e74, 0.6, 0.4), v3(p.x, 0, p.z), v3(p.x, y, p.z), 0.07, 4);
      mg.add(beamGeo(p.clone().addScaledVector(sd, -3).setY(y), p.clone().addScaledVector(sd, 3).setY(y), 0.05, 4), mat(0x6a6e74, 0.6, 0.4));
    }
  };
  approach(R1L, 0, 14);
  approach(R1R, 0, 10);
  approach(R8L, 1, 16);
  approach(R8R, 1, 16);
}

// ---------------------------------------------------------------- airliners (geometry)
interface JetGeo {
  body: THREE.BufferGeometry;
  accent: THREE.BufferGeometry;
  fixed: THREE.BufferGeometry;
  gear: THREE.BufferGeometry;
}
const FUS_Y = 2.9;
const FUS_R = 1.32;
let jetGeoCache: JetGeo | null = null;
/** A ~26 m narrow-body, nose +z, wheels on y = 0: body (livery colour), accent (tail, winglets, engines, cheat-line), fixed (wings, windows) and gear. */
function jetGeo(): JetGeo {
  if (jetGeoCache) return jetGeoCache;
  const body: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  const fixed: THREE.BufferGeometry[] = [];
  const gear: THREE.BufferGeometry[] = [];
  const tint = (g: THREE.BufferGeometry, hex: number) => {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const n of Object.keys(ng.attributes)) if (n !== 'position' && n !== 'normal') ng.deleteAttribute(n);
    _col.setHex(hex);
    const c = new Float32Array(ng.attributes.position.count * 3);
    for (let i = 0; i < c.length; i += 3) {
      c[i] = _col.r;
      c[i + 1] = _col.g;
      c[i + 2] = _col.b;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return ng;
  };
  const plain = (g: THREE.BufferGeometry) => {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const n of Object.keys(ng.attributes)) if (n !== 'position' && n !== 'normal') ng.deleteAttribute(n);
    return ng;
  };
  const Y = FUS_Y;
  const R = FUS_R;
  body.push(plain(new THREE.CylinderGeometry(R, R, 18, 16, 1, true).rotateX(Math.PI / 2).translate(0, Y, 0)));
  body.push(plain(new THREE.SphereGeometry(R, 16, 10).scale(1, 0.96, 2.0).translate(0, Y - 0.05, 9)));
  body.push(plain(new THREE.ConeGeometry(R, 5.6, 16, 1, true).rotateX(-Math.PI / 2).scale(1, 0.9, 1).translate(0, Y + 0.25, -11.8)));
  for (const s of [1, -1]) {
    const wing = new THREE.BoxGeometry(11, 0.26, 3.4);
    wing.rotateY(s * 0.5);
    wing.translate(s * (1 + 5.5 * Math.cos(0.5)), 2.0, 0.6 - 5.5 * Math.sin(0.5));
    fixed.push(tint(wing, 0xb8bec6));
    const flap = new THREE.BoxGeometry(5.5, 0.08, 0.9);
    flap.rotateY(s * 0.5);
    flap.translate(s * (1 + 3 * Math.cos(0.5)), 2.05, 0.6 - 3 * Math.sin(0.5) - 1.9);
    fixed.push(tint(flap, 0x8c929a));
    accent.push(plain(new THREE.BoxGeometry(0.14, 1.6, 1.0).translate(s * (1 + 11 * Math.cos(0.5)), 2.7, 0.6 - 11 * Math.sin(0.5) - 0.3)));
    fixed.push(tint(new THREE.CylinderGeometry(0.82, 0.72, 3.3, 14).rotateX(Math.PI / 2).translate(s * 4.1, 1.15, 1.1), 0xc4c9d0));
    accent.push(plain(new THREE.CylinderGeometry(0.84, 0.84, 0.5, 14, 1, true).rotateX(Math.PI / 2).translate(s * 4.1, 1.15, 2.45)));
    fixed.push(tint(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 14).rotateX(Math.PI / 2).translate(s * 4.1, 1.15, 2.78), 0x1c1e22));
    fixed.push(tint(new THREE.BoxGeometry(0.25, 0.7, 1.8).translate(s * 4.1, 1.75, 0.5), 0xb8bec6));
    const stab = new THREE.BoxGeometry(4.6, 0.18, 1.9);
    stab.rotateY(s * 0.55);
    stab.translate(s * (0.6 + 2.3 * Math.cos(0.55)), Y + 0.55, -12.9);
    body.push(plain(stab));
    fixed.push(tint(new THREE.BoxGeometry(0.05, 0.26, 15.5).translate(s * (R - 0.005), Y + 0.38, 0.4), 0x1b2028));
    accent.push(plain(new THREE.BoxGeometry(0.06, 0.34, 17.5).translate(s * (R - 0.02), Y - 0.42, -0.2)));
    fixed.push(tint(new THREE.BoxGeometry(0.05, 1.25, 0.6).translate(s * (R - 0.01), Y + 0.05, 7.6), 0x8e96a0));
  }
  // Swept tail fin (a trapezoid in side view)
  const finShape = new THREE.Shape([new THREE.Vector2(-9.4, 0), new THREE.Vector2(-13.9, 0), new THREE.Vector2(-15.1, 4.5), new THREE.Vector2(-13.5, 4.5)]);
  const fin = new THREE.ExtrudeGeometry(finShape, { depth: 0.3, bevelEnabled: false });
  fin.rotateY(-Math.PI / 2);
  fin.translate(0.15, Y + R - 0.25, 0);
  accent.push(plain(fin));
  const dorsal = new THREE.Shape([new THREE.Vector2(-7.5, 0), new THREE.Vector2(-9.6, 0), new THREE.Vector2(-9.6, 0.7)]);
  const dg = new THREE.ExtrudeGeometry(dorsal, { depth: 0.24, bevelEnabled: false });
  dg.rotateY(-Math.PI / 2);
  dg.translate(0.12, Y + R - 0.25, 0);
  accent.push(plain(dg));
  accent.push(plain(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 6, 16, 1, true, -Math.PI * 0.38, Math.PI * 0.76).rotateX(Math.PI / 2).translate(0, Y, -1)));
  fixed.push(tint(new THREE.BoxGeometry(1.6, 0.36, 0.7).rotateX(-0.5).translate(0, Y + 0.72, 10.0), 0x14181e));
  // Gear: nose leg + two main bogies
  const tyre = 0x121316;
  const strut = 0x9aa0a8;
  gear.push(tint(beamGeo(v3(0, Y - R + 0.2, 8.4), v3(0, 0.45, 8.4), 0.1, 5), strut));
  gear.push(tint(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 10).rotateZ(Math.PI / 2).translate(0, 0.42, 8.4), tyre));
  for (const s of [1, -1]) {
    gear.push(tint(beamGeo(v3(s * 2.1, 1.9, -0.6), v3(s * 2.1, 0.5, -0.6), 0.13, 5), strut));
    gear.push(tint(new THREE.CylinderGeometry(0.5, 0.5, 1.0, 12).rotateZ(Math.PI / 2).translate(s * 2.1, 0.5, -0.6), tyre));
  }
  const m = (l: THREE.BufferGeometry[]) => mergeGeometries(l)!;
  jetGeoCache = { body: m(body), accent: m(accent), fixed: m(fixed), gear: m(gear) };
  return jetGeoCache;
}

interface Livery {
  body: number;
  accent: number;
}
/** Generic liveries: the big local carrier's blue with a red belly, plus white-and-colour tails and a yellow low-coster. No logos. */
const LIV: Record<string, Livery> = {
  local: { body: 0x2d4aa2, accent: 0xd52b31 },
  red: { body: 0xf2f4f6, accent: 0xc8202e },
  navy: { body: 0xf2f4f6, accent: 0x1b2f5e },
  yellow: { body: 0xf3cf12, accent: 0x262626 },
  teal: { body: 0xf2f4f6, accent: 0x14a39a },
  orange: { body: 0xf2f4f6, accent: 0xf07a1a },
  biz: { body: 0xf4f4f2, accent: 0x2a3550 },
  bizGold: { body: 0xf4f4f2, accent: 0xb08a3a },
};
const JET_BODY = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.25 });
const JET_FIXED = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.35 });

interface Parked {
  x: number;
  z: number;
  yaw: number;
  liv: Livery;
  scale?: number;
}
const parked: Parked[] = [];
let parkedMeshes: THREE.InstancedMesh[] = [];
let gateSlot = -1;
let gateShown = true;
const gateMatrix = new THREE.Matrix4();
const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
/** Show or empty Terminal 1's third gate (its jet is the one that pushes back and departs, then lands and taxis in). */
function setGateParked(on: boolean): void {
  if (on === gateShown || gateSlot < 0) return;
  gateShown = on;
  for (const im of parkedMeshes) {
    im.setMatrixAt(gateSlot, on ? gateMatrix : hiddenMatrix);
    im.instanceMatrix.needsUpdate = true;
  }
}
const _m4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _quat = new THREE.Quaternion();
/** Every parked aircraft as four instanced meshes (body, accent, fixed parts, gear). */
function buildParked(b: WorldBuilder): void {
  const g = jetGeo();
  const n = parked.length;
  const body = new THREE.InstancedMesh(g.body, JET_BODY, n);
  const accent = new THREE.InstancedMesh(g.accent, JET_BODY, n);
  const fixed = new THREE.InstancedMesh(g.fixed, JET_FIXED, n);
  const gear = new THREE.InstancedMesh(g.gear, JET_FIXED, n);
  parked.forEach((p, i) => {
    _quat.setFromAxisAngle(UP, p.yaw);
    _m4.compose(_pos.set(p.x, 0, p.z), _quat, _scl.setScalar(p.scale ?? 1));
    for (const im of [body, accent, fixed, gear]) im.setMatrixAt(i, _m4);
    if (i === gateSlot) gateMatrix.copy(_m4);
    body.setColorAt(i, _col.setHex(p.liv.body));
    accent.setColorAt(i, _col.setHex(p.liv.accent));
  });
  parkedMeshes = [body, accent, fixed, gear];
  for (const im of [body, accent, fixed, gear]) {
    im.computeBoundingSphere();
    im.castShadow = false;
    im.receiveShadow = true;
    b.scene.add(im);
  }
}

// ---------------------------------------------------------------- Terminal 1 front (walk-up)
function t1FasciaTexture(): THREE.CanvasTexture {
  return canvasTex(2048, 160, (ctx, w, h) => {
    ctx.fillStyle = '#eef0f2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c9cdd3';
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = '#16233f';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 96px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TERMINAL 1', 60, h / 2);
    ctx.textAlign = 'right';
    ctx.font = 'bold 58px system-ui, "Segoe UI", sans-serif';
    ctx.fillText('HARRY REID INTERNATIONAL AIRPORT · LAS', w - 60, h / 2);
  });
}

function boardTexture(title: string, rows: string[][], accent: string): THREE.CanvasTexture {
  return canvasTex(512, 320, (ctx, w, h) => {
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 44);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 14, 23);
    ctx.font = '22px "Consolas", monospace';
    rows.forEach((r, i) => {
      const y = 70 + i * 28;
      ctx.fillStyle = i % 2 ? '#121a30' : '#0e1528';
      ctx.fillRect(0, y - 14, w, 28);
      ctx.fillStyle = '#ffd34a';
      ctx.fillText(r[0], 12, y);
      ctx.fillStyle = '#e8ecf4';
      ctx.fillText(r[1], 96, y);
      ctx.fillText(r[2], 300, y);
      ctx.fillStyle = r[3].startsWith('ON') || r[3].startsWith('LAND') ? '#5ef08a' : r[3].startsWith('DEL') ? '#ff6a5a' : '#8fd0ff';
      ctx.fillText(r[3], 392, y);
    });
  });
}

function buildTerminal1(b: WorldBuilder, mg: Merger): void {
  const { x0, x1, z0, z1, h } = T1;
  const xm = (x0 + x1) / 2;
  const concrete = mat(0xd9d6cf, 0.8);
  const white = mat(0xeef0f2, 0.55, 0.1);
  const steel = mat(0x8e949c, 0.4, 0.6);
  const dark = mat(0x2a2d33, 0.6, 0.3);
  const wallTex = canvasTex(256, 256, (ctx, w, hh) => {
    const g = ctx.createLinearGradient(0, 0, 0, hh);
    g.addColorStop(0, '#a9c6dc');
    g.addColorStop(0.45, '#7d9db6');
    g.addColorStop(1, '#4a6377');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hh);
    ctx.fillStyle = 'rgba(255,240,215,0.18)'; // warm lobby glow low in the glass
    ctx.fillRect(0, hh * 0.62, w, hh * 0.38);
    ctx.fillStyle = '#3a4048';
    ctx.fillRect(0, 0, 6, hh);
    ctx.fillRect(w / 2 - 2, 0, 4, hh);
    ctx.fillRect(0, hh / 2 - 3, w, 6);
    ctx.fillRect(0, 0, w, 5);
  });
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  const glass = b.nightGlow(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.12, metalness: 0.45, emissive: 0xffd9a8, emissiveMap: wallTex, emissiveIntensity: 0.04 }), 0.04, 0.42);
  /** A glass box whose front/back faces repeat the curtain-wall panel every 3.6 m. */
  const glassBox = (x: number, y: number, z: number, w: number, hh: number, d: number) => {
    const g = new THREE.BoxGeometry(w, hh, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 3.6), uv.getY(i) * (hh / 3.6));
    mg.at(glass, g, x, y, z);
  };

  // Landside paving: Russell sidewalk island with palms, the curb road, the raised curb under the canopy
  b.floor((70 + 156) / 2, (RUSSELL_S + z0) / 2, 86, z0 - RUSSELL_S, mat(0x3b3c42, 0.85), 0.03);
  b.box(xm + 3, 0, RUSSELL_S + 1.6, 74, 0.16, 3.2, mat(0xcfc8b8, 0.85), false, false);
  for (let x = 82; x <= 146; x += 16) palmInto(mg, x, RUSSELL_S + 1.6, 7.5, x * 0.07);
  b.box(xm + 3, 0, z0 - 4, x1 - x0 + 12, 0.18, 8, mat(0xd2ccbf, 0.85), false, false);
  for (let x = x0 + 2; x < x1 + 4; x += 3) mg.beam(mat(0x6a6e74, 0.5, 0.5), v3(x, 0.18, z0 - 7.75), v3(x, 1.05, z0 - 7.75), 0.11, 6);
  for (let x = 78; x < 152; x += 6) mg.add(flatStrip(v3(x, 0, 827), v3(x + 3, 0, 827), 0.15, 0.04, 1), PAINT_WHITE);
  for (let x = 78; x < 150; x += 9) mg.add(flatStrip(v3(x, 0, 822.6), v3(x + 4.5, 0, 822.6), 0.3, 0.04, 1), PAINT_YELLOW);

  // The building: walls with four door bays, glass, a white fascia and a flat roof with a lip
  const doors = [82, 98, 124, 140];
  const doorW = 4.4;
  let xa = x0;
  for (const dx of [...doors, x1 + doorW / 2]) {
    const xb = Math.min(dx - doorW / 2, x1);
    if (xb > xa) {
      b.collider(xa, xb, z0 - 0.3, z0 + 0.3, 0, h, true);
      glassBox((xa + xb) / 2, 3.6, z0, xb - xa, 7.2, 0.3);
    }
    xa = dx + doorW / 2;
  }
  for (const dx of doors) {
    mg.box(steel, dx, 3.6 + 1.6, z0, doorW + 0.6, 4.0, 0.4);
    mg.box(steel, dx - doorW / 2 - 0.15, 1.6, z0, 0.3, 3.2, 0.4);
    mg.box(steel, dx + doorW / 2 + 0.15, 1.6, z0, 0.3, 3.2, 0.4);
    // half-open sliding doors
    glassBox(dx - doorW / 2 + 0.7, 1.55, z0 - 0.12, 1.2, 3.1, 0.08);
    glassBox(dx + doorW / 2 - 0.7, 1.55, z0 - 0.12, 1.2, 3.1, 0.08);
    b.floor(dx, z0 - 0.9, doorW, 1.6, mat(0x26282c, 0.9), 0.2);
  }
  for (let x = x0; x <= x1 + 0.01; x += 6.5) mg.box(steel, x, 3.6, z0 - 0.05, 0.35, 7.2, 0.5);
  const fasciaTex = t1FasciaTexture();
  const fascia = b.nightGlow(new THREE.MeshStandardMaterial({ map: fasciaTex, roughness: 0.6, emissive: 0xffffff, emissiveMap: fasciaTex, emissiveIntensity: 0.05 }), 0.05, 0.55);
  b.add(mesh(new THREE.PlaneGeometry(x1 - x0, 2.8), fascia, xm, h - 2.0, z0 - 0.42)).rotation.y = Math.PI;
  mg.box(white, xm, (7.2 + h) / 2, z0, x1 - x0 + 0.4, h - 7.2, 0.7);
  mg.box(concrete, x0, h / 2, (z0 + z1) / 2, 0.6, h, z1 - z0);
  mg.box(concrete, x1, h / 2, (z0 + z1) / 2, 0.6, h, z1 - z0);
  b.collider(x0 - 0.3, x0 + 0.3, z0, z1, 0, h, true);
  b.collider(x1 - 0.3, x1 + 0.3, z0, z1, 0, h, true);
  // Airside wall: glass above a low base, so the lobby looks onto the gates
  mg.box(concrete, xm, 0.5, z1, x1 - x0, 1.0, 0.5);
  const winGlass = new THREE.MeshStandardMaterial({ color: 0x9fc2d8, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.22, depthWrite: false });
  mg.box(winGlass, xm, 5.2, z1, x1 - x0, 8.4, 0.1);
  for (let x = x0; x <= x1 + 0.01; x += 4.875) mg.box(steel, x, 5.2, z1, 0.2, 8.4, 0.3);
  mg.box(steel, xm, 4.6, z1, x1 - x0, 0.18, 0.32);
  mg.box(white, xm, (9.4 + h) / 2, z1, x1 - x0 + 0.4, h - 9.4, 0.6);
  b.collider(x0, x1, z1 - 0.3, z1 + 0.3, 0, h, true);
  // Roof slab with an overhang, rooftop units
  mg.box(white, xm, h + 0.35, (z0 + z1) / 2, x1 - x0 + 3, 0.7, z1 - z0 + 3, 0, true);
  mg.box(concrete, xm, h + 0.05, (z0 + z1) / 2, x1 - x0, 0.2, z1 - z0);
  b.collider(x0, x1, z0, z1, h, h + 0.7);
  for (const [rx, rz] of [
    [86, 852],
    [104, 856],
    [130, 851],
  ]) mg.box(mat(0xa8adb4, 0.6, 0.4), rx, h + 1.3, rz, 5, 1.6, 3.2);
  // Curb canopy: thin slab on round columns, downlights underneath
  const canZ0 = z0 - 10;
  mg.box(white, xm, 6.6, (canZ0 + z0) / 2, x1 - x0 + 6, 0.5, z0 - canZ0);
  mg.box(steel, xm, 6.25, canZ0 + 0.2, x1 - x0 + 6, 0.4, 0.4);
  const cols: number[] = [];
  for (let x = x0 + 4; x <= x1 - 2; x += 13) cols.push(x);
  for (const x of cols) {
    mg.beam(steel, v3(x, 0.18, canZ0 + 3), v3(x, 6.4, canZ0 + 3), 0.22, 10);
    b.collider(x - 0.3, x + 0.3, canZ0 + 2.7, canZ0 + 3.3, 0, 6.4, true);
  }
  const downlight = basic(0xfff1d6);
  for (let x = x0; x <= x1; x += 4) for (const zz of [canZ0 + 2.5, canZ0 + 7]) mg.box(downlight, x, 6.33, zz, 1.2, 0.04, 0.5);
  // Light pool on the curb at night (additive decal)
  const poolTex = canvasTex(64, 64, (ctx, w, hh) => {
    const g = ctx.createRadialGradient(w / 2, hh / 2, 0, w / 2, hh / 2, w / 2);
    g.addColorStop(0, 'rgba(255,236,200,1)');
    g.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hh);
  });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const pools: THREE.BufferGeometry[] = [];
  for (let x = x0 + 4; x <= x1; x += 9) pools.push(new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2).translate(x, 0.21, canZ0 + 5));
  for (const g of T1_GATES) pools.push(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2).translate(g, 0.08, 884));
  const poolMesh = new THREE.Mesh(mergeGeometries(pools)!, poolMat);
  poolMesh.renderOrder = 2;
  b.scene.add(poolMesh);
  b.every((_dt, _t, night) => {
    poolMat.opacity = night * 0.42;
  });

  // Hanging curb signs: DEPARTURES over the west doors, ARRIVALS over the east doors
  const hang = (text: string, sub: string, x: number, bg: string) => {
    const s = neonSign(text, bg, '#ffffff', 9, 1.2, sub, 0.25);
    b.add(s, x, 5.3, z0 - 2.6, Math.PI);
    mg.beam(steel, v3(x - 3.5, 5.9, z0 - 2.6), v3(x - 3.5, 6.4, z0 - 2.6), 0.04, 4);
    mg.beam(steel, v3(x + 3.5, 5.9, z0 - 2.6), v3(x + 3.5, 6.4, z0 - 2.6), 0.04, 4);
  };
  hang('DEPARTURES', 'TICKETING • CHECK-IN • DOORS 1–2', 90, '#14305e');
  hang('ARRIVALS', 'BAGGAGE CLAIM • DOORS 3–4', 132, '#1d4a2e');
  doors.forEach((dx, i) => sign(b, `${i + 1}`, '#14305e', '#ffffff', 1.1, 1.1, dx, 4.7, z0 - 0.45, Math.PI, undefined, 0.08));

  // Curb island signs + the queue: taxis east, rideshare west
  const pole = (x: number, z: number, text: string, sub: string, bg: string, fg = '#ffffff') => {
    mg.beam(steel, v3(x, 0.18, z), v3(x, 3.4, z), 0.06, 6);
    b.add(neonSign(text, bg, fg, 2.8, 0.9, sub, 0.12), x, 3.6, z, Math.PI);
  };
  pole(147, canZ0 + 2.6, 'TAXI', 'LINE STARTS HERE', '#f2c400', '#111111');
  pole(82, canZ0 + 2.6, 'RIDESHARE', 'PICKUP • ZONE A', '#0e7a5a');
  pole(108, canZ0 + 2.6, 'SHUTTLES', 'HOTELS • RENT-A-CAR', '#243b70');
  // Monument sign at the drive in from Russell
  sign(b, 'TERMINAL 1', '#16233f', '#ffffff', 5.2, 1.3, 147.5, 1.2, RUSSELL_S + 1.6, Math.PI, 'DEPARTURES • ARRIVALS', 0.4);
  const cars: Array<[CarKind, number, number, number]> = [
    ['taxi', 0xf2c400, 132, 827.5],
    ['taxi', 0xf2c400, 139, 827.5],
    ['taxi', 0xf2c400, 146, 827.5],
    ['suv', 0xf4f4f2, 80, 828],
    ['sedan', 0x15161a, 87, 828],
    ['suv', 0x1c1d22, 104, 824],
  ];
  for (const [k, c, x, z] of cars) {
    const cc = car(k, c);
    bakeGroup(cc.group);
    b.add(cc.group, x, 0, z, -Math.PI / 2);
    b.collider(x - cc.length / 2, x + cc.length / 2, z - 1, z + 1, 0, 1.5, true);
  }
  // A white self-driving SUV waiting in rideshare: roof sensor dome and side pods
  mg.beam(mat(0x2a2c30, 0.4, 0.5), v3(80, 1.85, 828), v3(80, 2.25, 828), 0.32, 14, 0.26);
  for (const s of [-1, 1]) mg.box(mat(0x2a2c30, 0.4, 0.5), 80 + 1.3, 1.25, 828 + s * 0.98, 0.3, 0.2, 0.12);

  // Luggage: suitcases by the doors and the taxi line, a rack of carts
  const bagCols = [0x1d2533, 0xc8202e, 0x2d6fd8, 0x111216, 0x6a2a8a, 0xe8a02a, 0x3a3e46];
  let bi = 0;
  const bag = (x: number, z: number, big = true) => {
    const c = bagCols[bi++ % bagCols.length];
    const hh = big ? 0.72 : 0.5;
    mg.box(mat(c, 0.5, 0.1), x, 0.18 + hh / 2 + 0.06, z, 0.46, hh, 0.27);
    mg.beam(dark, v3(x - 0.14, 0.18 + hh + 0.06, z), v3(x - 0.14, 0.18 + hh + 0.5, z), 0.012, 4);
    mg.beam(dark, v3(x + 0.14, 0.18 + hh + 0.06, z), v3(x + 0.14, 0.18 + hh + 0.5, z), 0.012, 4);
    mg.box(dark, x, 0.18 + hh + 0.5, z, 0.32, 0.03, 0.04);
  };
  for (const [x, z] of [
    [141, 833.2],
    [142.2, 833.6],
    [137.5, 833],
    [138.4, 833.1],
    [134, 833.4],
    [96, 837.6],
    [96.7, 837.9],
    [84, 837.5],
    [120.5, 837.2],
    [79, 832.9],
    [80, 833.3],
    [113, 833.2],
  ]) bag(x, z, bi % 3 !== 2);
  for (let i = 0; i < 6; i++) mg.box(steel, 106 + i * 0.35, 0.65, 837.8, 0.08, 0.9, 1.1);
  mg.box(mat(0xd8282e, 0.6), 107, 1.25, 837.8, 2.4, 0.3, 0.12);
  // People with luggage along the curb (tourists with bags)
  b.crowd.tourists.push(
    { pts: [[142, 834], [125, 834.5], [100, 834]], prop: 'bag' },
    { pts: [[84, 836.5], [97, 836.5], [118, 836]], prop: 'bag' },
    { pts: [[76, 833], [90, 833.2]], prop: 'none' },
    { pts: [[128, 836.8], [146, 836.5]], prop: 'bag' },
  );
  b.pickup(144.2, 0.4, 834.2, 2, 'Dropped at the taxi line', false);

  // Lobby floor (static) + the dressed interior (built when Lou comes near, seen inside or through the doors)
  // Terrazzo with a blue-and-gold inlay band down the hall
  const terrazzo = canvasTex(256, 256, (ctx, w, hh) => {
    ctx.fillStyle = '#d9d5cc';
    ctx.fillRect(0, 0, w, hh);
    for (let i = 0; i < 1400; i++) {
      const c = ['#b9b3a6', '#eeeae2', '#a8a294', '#c9c2b2'][i % 4];
      ctx.fillStyle = c;
      ctx.fillRect((i * 97) % w, (i * 61 + (i >> 3)) % hh, 2 + (i % 3), 2 + (i % 2));
    }
    ctx.fillStyle = 'rgba(120,112,100,0.5)';
    ctx.fillRect(0, 0, w, 2);
    ctx.fillRect(0, 0, 2, hh);
  });
  terrazzo.wrapS = terrazzo.wrapT = THREE.RepeatWrapping;
  terrazzo.repeat.set((x1 - x0) / 3, (z1 - z0) / 3);
  b.floor(xm, (z0 + z1) / 2, x1 - x0 - 0.6, z1 - z0 - 0.6, new THREE.MeshStandardMaterial({ map: terrazzo, roughness: 0.3, metalness: 0.05 }), 0.03);
  b.floor(xm, 846.2, x1 - x0 - 2, 0.5, mat(0x2d4aa2, 0.3), 0.036);
  b.floor(xm, 846.9, x1 - x0 - 2, 0.18, mat(0xc9a43a, 0.3, 0.4), 0.036);
  const slots: SlotPlacement[] = [];
  for (let i = 0; i < 6; i++) slots.push({ x: x0 + 1.3, z: 845 + i * 1.1, rot: Math.PI / 2, theme: i * 3 + 1, style: i % 3 ? 'video' : 'wheel', accent: [0xd52b31, 0x2d4aa2, 0xf3cf12][i % 3], played: i === 2 || i === 4 });
  for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) slots.push({ x: 109 + i * 1.1, z: 857.5 + sd * 0.75, rot: sd > 0 ? 0 : Math.PI, theme: i * 5 + (sd > 0 ? 2 : 7), style: 'video', accent: [0xff4fd8, 0x35d0ff, 0xffd23f][(i + (sd > 0 ? 1 : 0)) % 3], played: i === 1 });
  b.collider(x0 + 0.5, x0 + 2.1, 844.4, 851.6, 0, 1.75, true);
  b.collider(108.4, 114.6, 856.6, 858.4, 0, 1.75, true);
  b.gamblingSpots.push({ id: 'las-airport-slots', casinoName: 'Harry Reid Airport', gameType: 'slots', position: v3(x0 + 3.2, 0, 848), label: 'Airport slots (one last spin before your flight)' });
  // Check-in counters, the baggage carousel
  b.collider(80, 104, 851.6, 853.4, 0, 1.1, true);
  b.collider(121, 147, 849.5, 857.5, 0, 0.9, true);
  b.crowd.tourists.push({ pts: [[86, 847.8], [100, 848]], prop: 'bag' }, { pts: [[118, 848.4], [146, 848.6]], prop: 'bag' }, { pts: [[106, 844.5], [106, 855], [116, 855]], prop: 'none' });
  b.pickup(110, 0.25, 844.2, 1, 'Under a gate seat', true);
  // A gate bar at the east end: yard drinks before the flight
  b.collider(144.9, 146.1, 856.8, 862.6, 0, 1.15, true);
  b.shopSpots.push({ kind: 'bar', position: v3(143.4, 0, 859.7), radius: 2.4, label: 'Terminal 1 Gate Bar' });

  const gate = {
    minX: x0 + 0.3,
    maxX: x1 - 0.3,
    minZ: z0 + 0.3,
    maxZ: z1 - 0.3,
    height: h,
    doors: doors.map((dx) => ({ x: dx, z: z0, nx: 0, nz: -1, half: doorW / 2 })),
  };
  lazyInterior(b, 'Terminal 1 lobby', gate, (group) => {
    const k = new Merger();
    const add = (m: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => k.at(m, g, x, y, z, ry);
    // Ceiling with long light coves
    add(mat(0xf4f4f2, 0.8), new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2), xm, h - 0.3, (z0 + z1) / 2);
    for (const zz of [845, 852, 859]) add(basic(0xfff6e4), new THREE.BoxGeometry(x1 - x0 - 4, 0.06, 0.8), xm, h - 0.35, zz);
    // Check-in island: counter, back wall in the carrier's blue, kiosks in front
    add(mat(0xe8e6e0, 0.5), new THREE.BoxGeometry(24, 1.05, 1.1), 92, 0.55, 852.5);
    add(mat(0x2d4aa2, 0.55), new THREE.BoxGeometry(24, 3.2, 0.3), 92, 1.6, 853.6);
    add(mat(0xd52b31, 0.55), new THREE.BoxGeometry(24, 0.3, 0.32), 92, 3.05, 853.6);
    for (let x = 82; x <= 102; x += 4) {
      add(mat(0x2a2d33, 0.4, 0.4), new THREE.BoxGeometry(0.5, 1.4, 0.4), x, 0.7, 849.6);
      add(basic(0x7ec8ff), new THREE.PlaneGeometry(0.38, 0.3).rotateX(-0.4).rotateY(Math.PI), x, 1.35, 849.38);
      add(mat(0x1a1c20, 0.5, 0.2), new THREE.BoxGeometry(1.0, 0.25, 0.9), x + 1.3, 0.35, 851.6);
    }
    const ci = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), new THREE.MeshBasicMaterial({ map: boardTexture('CHECK-IN · BAG DROP', [['WN', 'ALL FLIGHTS', 'ROW A', 'OPEN'], ['NK', 'ALL FLIGHTS', 'ROW B', 'OPEN'], ['G4', 'ALL FLIGHTS', 'ROW C', 'OPEN']], '#2d4aa2') }));
    ci.position.set(92, 4.4, 853.42);
    ci.rotation.y = Math.PI;
    group.add(ci);
    // Departure / arrival boards over the doors, facing into the lobby
    const dep = boardTexture('DEPARTURES', [['WN 1820', 'DENVER', 'C 18', 'ON TIME'], ['WN 2214', 'OAKLAND', 'B 9', 'BOARDING'], ['NK 611', 'CHICAGO', 'A 21', 'ON TIME'], ['WN 3371', 'PHOENIX', 'C 22', 'DELAYED'], ['G4 2204', 'BOISE', 'A 3', 'ON TIME'], ['WN 976', 'SAN DIEGO', 'B 12', 'ON TIME'], ['WN 1407', 'NASHVILLE', 'C 9', 'FINAL CALL'], ['NK 230', 'DALLAS', 'A 15', 'ON TIME']], '#14305e');
    const arr = boardTexture('ARRIVALS · BAGGAGE', [['WN 2290', 'LOS ANGELES', 'BELT 4', 'LANDED'], ['WN 133', 'SEATTLE', 'BELT 4', 'LANDED'], ['NK 1112', 'HOUSTON', 'BELT 2', '12:40'], ['WN 645', 'AUSTIN', 'BELT 4', '12:55'], ['G4 471', 'FARGO', 'BELT 1', '13:05'], ['WN 3011', 'SACRAMENTO', 'BELT 3', '13:10'], ['WN 88', 'BALTIMORE', 'BELT 3', 'DELAYED'], ['NK 908', 'DETROIT', 'BELT 2', '13:30']], '#1d4a2e');
    for (const [tex, x] of [
      [dep, 90],
      [arr, 132],
    ] as Array<[THREE.CanvasTexture, number]>) {
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4), new THREE.MeshBasicMaterial({ map: tex }));
      bd.position.set(x, 6.2, z0 + 0.45);
      group.add(bd);
      add(dark, new THREE.BoxGeometry(6.8, 4.4, 0.3), x, 6.2, z0 + 0.28);
    }
    // Carousel: oval belt + suitcases riding round it
    const belt = new THREE.Shape();
    belt.absarc(-7, 0, 2.6, Math.PI / 2, (Math.PI * 3) / 2, false);
    belt.absarc(7, 0, 2.6, -Math.PI / 2, Math.PI / 2, false);
    const hole = new THREE.Path();
    hole.absarc(-7, 0, 1.4, Math.PI / 2, (Math.PI * 3) / 2, false);
    hole.absarc(7, 0, 1.4, -Math.PI / 2, Math.PI / 2, false);
    belt.holes.push(hole);
    const beltGeo = new THREE.ExtrudeGeometry(belt, { depth: 0.75, bevelEnabled: false, curveSegments: 10 }).rotateX(Math.PI / 2).translate(0, 0.75, 0);
    add(mat(0x9aa0a8, 0.35, 0.6), beltGeo, 134, 0, 853.5);
    add(mat(0x22252a, 0.8), new THREE.ShapeGeometry(belt, 10).rotateX(-Math.PI / 2), 134, 0.77, 853.5);
    const carouselSign = neonSign('BAGGAGE CLAIM 4', '#1d4a2e', '#ffffff', 5, 0.9, 'WN · NK · G4', 0.12);
    carouselSign.position.set(134, 4.2, 853.5);
    group.add(carouselSign);
    const nBags = 12;
    const bagIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.32, 0.42), mat(0xffffff, 0.55), nBags);
    for (let i = 0; i < nBags; i++) bagIM.setColorAt(i, _col.setHex(bagCols[(i * 3) % bagCols.length]));
    bagIM.frustumCulled = false;
    group.add(bagIM);
    const ovalAt = (u: number, out: THREE.Vector3) => {
      const L = 14;
      const C = Math.PI * 2;
      const per = 2 * L + C * 2;
      let d = (((u % 1) + 1) % 1) * per;
      if (d < L) return out.set(-7 + d, 0, 2);
      d -= L;
      if (d < C) return out.set(7 + 2 * Math.sin(d / 2), 0, 2 * Math.cos(d / 2));
      d -= C;
      if (d < L) return out.set(7 - d, 0, -2);
      d -= L;
      return out.set(-7 - 2 * Math.sin(d / 2), 0, -2 * Math.cos(d / 2));
    };
    // Security checkpoint along the glass: scanners, stanchions, the sign
    for (const x of [80, 92]) {
      add(mat(0xc8ccd2, 0.5, 0.3), new THREE.BoxGeometry(1.8, 1.9, 3.2), x, 0.95, 861.4);
      add(mat(0x2a2d33, 0.6), new THREE.BoxGeometry(1.0, 0.9, 6), x + 1.6, 0.45, 861.6);
    }
    b.collider(78.8, 94, 859.6, 863.4, 0, 1.9, true);
    for (let x = 75; x <= 100; x += 2.5) add(mat(0x9aa0a8, 0.3, 0.8), new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), x, 0.48, 859.2);
    add(mat(0x1a2a6a, 0.6), new THREE.BoxGeometry(26, 0.08, 0.05), 87.5, 0.85, 859.2);
    const sec = neonSign('SECURITY CHECKPOINT', '#14305e', '#ffffff', 8, 1.0, 'GATES A • B • C  →', 0.12);
    sec.position.set(87, 4.0, 859);
    sec.rotation.y = Math.PI;
    group.add(sec);
    // Gate seating by the glass
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) {
      add(mat(0x2a2d33, 0.5, 0.3), new THREE.BoxGeometry(0.5, 0.1, 0.5), 117 + i * 0.55, 0.45, 861 - r * 1.4);
      add(mat(0x2a2d33, 0.5, 0.3), new THREE.BoxGeometry(0.5, 0.5, 0.06), 117 + i * 0.55, 0.75, 861.25 - r * 1.4);
    }
    // End walls: a welcome mural (west) and a show-billboard wall (east)
    const mural = canvasTex(1024, 512, (ctx, w, hh) => {
      const g = ctx.createLinearGradient(0, 0, 0, hh);
      g.addColorStop(0, '#1b1f4a');
      g.addColorStop(1, '#5a1f5e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, hh);
      for (let i = 0; i < 120; i++) {
        ctx.fillStyle = ['#ffd23f', '#ff4fd8', '#35d0ff', '#ffffff'][i % 4];
        ctx.beginPath();
        ctx.arc((i * 211) % w, (i * 97) % hh, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'italic bold 54px Georgia, serif';
      ctx.fillText('Welcome to Fabulous', w / 2, hh * 0.3);
      ctx.fillStyle = '#ff3b3b';
      ctx.font = 'bold 150px Georgia, serif';
      ctx.fillText('LAS VEGAS', w / 2, hh * 0.58, w * 0.9);
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.fillText('WHAT HAPPENS HERE… STAYS HERE', w / 2, hh * 0.84);
    });
    const muralMat = new THREE.MeshBasicMaterial({ map: mural });
    const mw = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), muralMat);
    mw.position.set(x0 + 0.35, 7.2, 852);
    mw.rotation.y = Math.PI / 2;
    group.add(mw);
    const me = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), muralMat);
    me.position.set(x1 - 0.35, 7.2, 852);
    me.rotation.y = -Math.PI / 2;
    group.add(me);
    // Gate bar: counter with a lit front, stools, a back bar of bottles under a neon sign
    add(mat(0x3a2a22, 0.6), new THREE.BoxGeometry(1.1, 1.1, 5.6), 145.5, 0.55, 859.7);
    add(mat(0xd9d4c6, 0.3, 0.2), new THREE.BoxGeometry(1.3, 0.08, 5.8), 145.5, 1.14, 859.7);
    add(basic(0xffb347), new THREE.BoxGeometry(0.04, 0.12, 5.4), 144.93, 0.95, 859.7);
    for (let i = 0; i < 4; i++) {
      add(mat(0x1a1c20, 0.4, 0.6), new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), 144.3, 0.38, 857.8 + i * 1.3);
      add(mat(0xb8202e, 0.6), new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10), 144.3, 0.8, 857.8 + i * 1.3);
    }
    add(mat(0x2a1c16, 0.7), new THREE.BoxGeometry(0.5, 2.4, 5.6), x1 - 0.6, 1.2, 859.7);
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 12; i++) add(mat([0x2f7a3a, 0x8a5a1a, 0xd9d4c6, 0x5a1a1a][(i + r) % 4], 0.2, 0.1), new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), x1 - 0.75, 1.0 + r * 0.55, 857.4 + i * 0.42);
    const barSign = neonSign('GATE BAR', '#1a0a14', '#ff4fd8', 3.2, 0.8, 'YARD DRINKS • LAST CALL', 0.1);
    barSign.position.set(x1 - 0.5, 3.4, 859.7);
    barSign.rotation.y = -Math.PI / 2;
    group.add(barSign);
    // Columns
    for (const x of [86, 99, 112, 125, 138]) add(white, new THREE.CylinderGeometry(0.4, 0.4, h - 0.3, 14), x, (h - 0.3) / 2, 846.5);
    for (const x of [86, 99, 112, 125, 138]) b.collider(x - 0.4, x + 0.4, 846.1, 846.9, 0, h, true);
    // Slots: the Las Vegas welcome (and last chance) right inside the doors
    buildSlots(group, slots, 0x2d4aa2);
    const lowBank = neonSign('SLOTS', '#2a0a3a', '#ffd23f', 3, 0.8, 'LAST CHANCE TO WIN', 0.1);
    lowBank.position.set(x0 + 1.4, 3.4, 848);
    lowBank.rotation.y = Math.PI / 2;
    group.add(lowBank);
    for (const me of k.flush(b, true)) group.add(me);
    return [
      (t) => {
        for (let i = 0; i < nBags; i++) {
          ovalAt(t * 0.035 + i / nBags, _pos);
          _quat.setFromAxisAngle(UP, i * 0.7);
          _m4.compose(_pos.set(_pos.x + 134, 0.95, _pos.z + 853.5), _quat, _scl.setScalar(1));
          bagIM.setMatrixAt(i, _m4);
        }
        bagIM.instanceMatrix.needsUpdate = true;
      },
    ];
  });
}

// ---------------------------------------------------------------- T1 gates (airside, behind the building)
function buildGates(b: WorldBuilder, mg: Merger): void {
  const apron = mat(0xb4b0a6, 0.92);
  // Apron slab
  b.floor(116, 885, 92, 42, apron, 0.03);
  const steel = mat(0x9aa0a8, 0.45, 0.55);
  const bridgeGlass = mat(0x34414e, 0.25, 0.5);
  for (const [i, gx] of T1_GATES.entries()) {
    if (i === 2) gateSlot = parked.length;
    parked.push({ x: gx, z: GATE_NOSE_Z + 11.6, yaw: Math.PI, liv: i === 1 ? LIV.yellow : LIV.local });
    // Lead-in line + stop bar
    mg.add(flatStrip(v3(gx, 0, 904), v3(gx, 0, GATE_NOSE_Z + 3), 0.25, 0.05, 1), PAINT_YELLOW);
    mg.add(flatStrip(v3(gx - 1.6, 0, GATE_NOSE_Z + 3), v3(gx + 1.6, 0, GATE_NOSE_Z + 3), 0.3, 0.05, 1), PAINT_YELLOW);
    // Jet bridge: rotunda at the wall, a tunnel out to the front-left door, a wheeled leg
    const door = v3(gx - 1.6, FUS_Y + 0.15, GATE_NOSE_Z + 3.6);
    const root = v3(gx - 7.5, FUS_Y + 0.6, T1.z1 + 1.6);
    mg.beam(steel, v3(root.x, 0, root.z), v3(root.x, root.y + 1.6, root.z), 1.4, 12);
    const len = root.distanceTo(door);
    const tunnel = new THREE.BoxGeometry(2.4, 2.6, len - 1.2);
    const ang = Math.atan2(door.x - root.x, door.z - root.z);
    tunnel.rotateX(-Math.atan2(door.y - root.y, Math.hypot(door.x - root.x, door.z - root.z)));
    tunnel.rotateY(ang);
    const mid = root.clone().lerp(door, 0.5);
    mg.at(steel, tunnel, mid.x, mid.y + 0.2, mid.z);
    const win = new THREE.BoxGeometry(2.46, 0.5, len - 2);
    win.rotateY(ang);
    mg.at(bridgeGlass, win, mid.x, mid.y + 0.6, mid.z);
    const legP = root.clone().lerp(door, 0.72);
    mg.beam(steel, v3(legP.x, 0.6, legP.z), v3(legP.x, legP.y - 1, legP.z), 0.22, 6);
    mg.box(mat(0x2a2d33, 0.6), legP.x, 0.35, legP.z, 2.2, 0.7, 0.9, ang);
    mg.box(steel, door.x - 0.4, door.y + 0.2, door.z, 1.4, 2.8, 1.8);
    // Ground crew kit: tug + baggage carts, belt loader, catering truck
    const tz = GATE_NOSE_Z + 19;
    mg.box(mat(0x2a6ad8, 0.5), gx + 5.5, 0.6, tz, 1.4, 1.0, 2.2);
    mg.box(mat(0x2a2d33, 0.4), gx + 5.5, 1.35, tz - 0.4, 1.2, 0.6, 1.0);
    for (let c = 0; c < 3; c++) {
      mg.box(mat(0x5a6068, 0.6), gx + 5.5, 0.55, tz + 2.6 + c * 2.6, 1.4, 0.3, 2.2);
      mg.box(mat(0x2c6e46, 0.7), gx + 5.5, 1.25, tz + 2.6 + c * 2.6, 1.42, 0.08, 2.24);
      for (const sd of [-1, 1]) mg.box(mat([0xc8202e, 0x2d6fd8, 0x111216][(c + i) % 3], 0.5), gx + 5.5 + sd * 0.35, 0.9, tz + 2.6 + c * 2.6, 0.45, 0.4, 1.6);
    }
    if (i < 2) {
      const belt = new THREE.BoxGeometry(0.9, 0.18, 7.5);
      belt.rotateX(0.32);
      mg.at(mat(0x1a1c20, 0.7), belt, gx + 2.2, 1.6, GATE_NOSE_Z + 6.5);
      mg.box(mat(0xf2c400, 0.6), gx + 2.2, 0.5, GATE_NOSE_Z + 8.6, 1.4, 0.8, 3.0);
    }
    if (i === 0) {
      mg.box(mat(0xf4f4f2, 0.5), gx + 3.4, 1.0, GATE_NOSE_Z + 1.6, 2.2, 1.6, 4.0);
      mg.box(mat(0xf4f4f2, 0.5), gx + 3.4, 2.9, GATE_NOSE_Z + 2.2, 2.3, 2.0, 3.0);
    }
    // Wing-walker cones
    for (const s of [-1, 1]) mg.add(new THREE.ConeGeometry(0.2, 0.6, 8).translate(gx + s * 10.5, 0.3, GATE_NOSE_Z + 16), mat(0xff6a00, 0.6));
  }
  // Apron floodlight masts
  for (const x of [76, 99, 125, 152]) {
    mg.beam(mat(0x8a9096, 0.5, 0.5), v3(x, 0, 902), v3(x, 16, 902), 0.25, 8, 0.16);
    mg.box(mat(0x2a2d33, 0.5, 0.4), x, 16.2, 902, 2.4, 0.5, 0.8);
    for (const dx of [-0.8, 0, 0.8]) lights.add(v3(x + dx, 15.9, 901.6), C_SODIUM, 1.5, 1.3);
  }
  b.zone('Terminal 1 Gates • Harry Reid Airport', 72, 162, T1.z1, 905);
}

// ---------------------------------------------------------------- Signature private-jet terminal (west side, by the sign)
function buildSignature(b: WorldBuilder, mg: Merger): void {
  const sx = 49.4;
  const sz = 952.2; // OSM: 36.08024 N, -115.17104 W
  b.floor(84, 940, 56, 44, mat(0xbab6ac, 0.92), 0.03);
  b.floor(34.6, 947, 11, 22, mat(0x3b3c42, 0.85), 0.03);
  for (let z = 938; z <= 957; z += 3.2) b.floor(34.6, z, 8, 0.12, basic(0xf2f0ea), 0.045);
  const wall = mat(0xe8e4dc, 0.7);
  const glass = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x3a4f62, roughness: 0.12, metalness: 0.6, emissive: 0xffd9a8, emissiveIntensity: 0.04 }), 0.04, 0.4);
  mg.box(wall, sx, 2.2, sz, 16, 4.4, 14, 0, true);
  mg.box(glass, sx + 8.05, 2.0, sz, 0.1, 3.2, 12);
  mg.box(glass, sx - 8.05, 2.0, sz, 0.1, 3.2, 8);
  mg.box(mat(0x2a2d33, 0.5, 0.4), sx, 4.6, sz, 17, 0.4, 15);
  mg.box(mat(0x2a2d33, 0.5, 0.4), sx - 10, 3.4, sz, 4, 0.25, 6);
  for (const s of [-1, 1]) mg.beam(mat(0x8e949c, 0.4, 0.6), v3(sx - 11.6, 0, sz + s * 2.6), v3(sx - 11.6, 3.3, sz + s * 2.6), 0.1, 6);
  sign(b, 'PRIVATE AVIATION TERMINAL', '#141820', '#e8d6a8', 8, 1.0, sx - 8.3, 3.0, sz, -Math.PI / 2, 'GENERAL AVIATION • FBO', 0.1);
  // Private jets on the ramp (scaled-down narrow-bodies read as bizjets at this size)
  const jets: Array<[number, number, number, Livery]> = [
    [70, 930, 1.9, LIV.biz],
    [86, 932, 2.2, LIV.bizGold],
    [72, 949, 1.6, LIV.bizGold],
    [101, 947, 2.6, LIV.biz],
  ];
  for (const [x, z, yaw, liv] of jets) parked.push({ x, z, yaw, liv, scale: 0.52 });
  mg.box(mat(0xf2c400, 0.6), 92, 1.2, 958, 2.4, 2.0, 6.0);
  mg.beam(mat(0xb8bcc2, 0.4, 0.6), v3(90.8, 1.6, 955), v3(90.8, 1.6, 961), 0.9, 12);
  for (const x of [62, 110]) {
    mg.beam(mat(0x8a9096, 0.5, 0.5), v3(x, 0, 962), v3(x, 12, 962), 0.2, 8, 0.14);
    lights.add(v3(x, 12, 961.6), C_SODIUM, 1.2, 1.2);
  }
  for (let x = 60; x <= 112; x += 6) lights.add(v3(x, 0.3, 917.5), C_BLUE, 0.6, 1.5);
  b.building(sx, sz, 16, 14, '#d8d2c4', 'Private jets');
}

// ---------------------------------------------------------------- the far side: piers, D gates, tower, Terminal 3
function buildFarSide(b: WorldBuilder, mg: Merger): void {
  const concrete = mat(0xd4d0c6, 0.85);
  const roof = mat(0xe6e8ea, 0.6, 0.1);
  const apron = mat(0xb4b0a6, 0.92);
  const glass = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x4d6478, roughness: 0.15, metalness: 0.6, emissive: 0xffd9a8, emissiveIntensity: 0.04 }), 0.04, 0.5);
  const pier = (ax: number, az: number, cx: number, cz: number, w: number, h: number, gatesEach: number, livs: Livery[], sides: number[] = [-1, 1]) => {
    const a = v3(ax, 0, az);
    const c = v3(cx, 0, cz);
    const d = c.clone().sub(a);
    const len = d.length();
    d.divideScalar(len);
    const ang = Math.atan2(d.x, d.z);
    const mid = a.clone().lerp(c, 0.5);
    mg.at(concrete, new THREE.BoxGeometry(w, h, len), mid.x, h / 2, mid.z, ang);
    mg.at(glass, new THREE.BoxGeometry(w + 0.1, h * 0.45, len - 2), mid.x, h * 0.55, mid.z, ang);
    mg.at(roof, new THREE.BoxGeometry(w + 1.2, 0.5, len + 1), mid.x, h + 0.25, mid.z, ang);
    mg.add(flatStrip(a, c, w + 60, 0.025, 1), apron);
    const sd = v3(-d.z, 0, d.x);
    let k = 0;
    for (const s of sides)
      for (let g = 0; g < gatesEach; g++) {
        const p = a.clone().addScaledVector(d, (len * (g + 0.6)) / (gatesEach + 0.2)).addScaledVector(sd, s * (w / 2 + 12.5));
        parked.push({ x: p.x, z: p.z, yaw: Math.atan2(sd.x * s, sd.z * s), liv: livs[k++ % livs.length] });
        lights.add(p.clone().addScaledVector(sd, s * -8).setY(9), C_SODIUM, 1.2, 1.1);
      }
  };
  // Terminal 1 ticketing (real site) with the A/B and C piers running south from it
  mg.box(concrete, 462, 7, 824, 88, 14, 30);
  mg.box(glass, 462, 7, 808.9, 86, 6, 0.4);
  mg.box(roof, 462, 14.3, 824, 90, 0.6, 32);
  mg.box(mat(0xbfbab0, 0.85), 492, 9, 795, 36, 18, 18); // parking garage
  pier(436, 840, 400, 935, 9, 9, 3, [LIV.local, LIV.local, LIV.orange]);
  pier(486, 840, 500, 940, 9, 9, 3, [LIV.local, LIV.navy, LIV.local]);
  // D gates: an X-shaped satellite reached by tram (OSM tram stop 36.0820 N, -115.1381 W)
  const D = ll(36.082027, -115.13816);
  mg.at(concrete, new THREE.CylinderGeometry(16, 16, 12, 16), D.x, 6, D.z);
  mg.at(roof, new THREE.CylinderGeometry(17, 17, 0.6, 16), D.x, 12.3, D.z);
  for (const a of [0.6, 2.2, 3.75, 5.35]) pier(D.x + Math.cos(a) * 12, D.z + Math.sin(a) * 12, D.x + Math.cos(a) * 58, D.z + Math.sin(a) * 58, 8, 9, 2, [LIV.navy, LIV.red, LIV.teal, LIV.local, LIV.orange, LIV.red]);
  // FAA tower, 352 ft (OSM 36.08495 N, -115.14160 W): tapered shaft, a dark glass cab, the beacon
  const T = ll(36.0849532, -115.141596);
  mg.at(concrete, new THREE.CylinderGeometry(2.6, 3.8, 30, 12), T.x, 15, T.z);
  mg.at(concrete, new THREE.CylinderGeometry(4.6, 2.6, 2.4, 12), T.x, 31.2, T.z);
  mg.at(mat(0x1c2a33, 0.1, 0.7), new THREE.CylinderGeometry(4.9, 4.4, 3.4, 12), T.x, 34.1, T.z);
  mg.at(mat(0x8e949c, 0.4, 0.6), new THREE.CylinderGeometry(5.2, 5.2, 0.6, 12), T.x, 36.1, T.z);
  mg.beam(mat(0x8e949c, 0.4, 0.6), v3(T.x + 1.5, 36.2, T.z), v3(T.x + 1.5, 41, T.z), 0.08, 4);
  lights.add(v3(T.x, 37.4, T.z), C_GREEN, 3.4, 2.2, 0.33, 0, 0.5);
  lights.add(v3(T.x, 37.4, T.z), C_WHITE, 3.4, 2.2, 0.33, 0.5, 0.5);
  lights.add(v3(T.x + 1.5, 41.2, T.z), C_RED, 1.3, 1.6);
  for (const [dx, dz] of [
    [4.4, 0],
    [-4.4, 0],
    [0, 4.4],
    [0, -4.4],
  ]) lights.add(v3(T.x + dx, 36.6, T.z + dz), 0x9ad8ff, 0.8, 0.9);
  b.building(T.x, T.z, 10, 10, '#c9ced6', 'FAA tower');
  // Terminal 3 (OSM: 36.0857–36.0865 N, -115.1408 to -115.1330 W) with the E gates pier
  const t3a = ll(36.08615, -115.1408);
  const t3b = ll(36.08615, -115.133);
  const t3c = t3a.clone().lerp(t3b, 0.5);
  const t3w = t3b.x - t3a.x;
  mg.box(concrete, t3c.x, 8, t3c.z, t3w, 16, 26);
  mg.box(glass, t3c.x, 8, t3c.z - 13.05, t3w - 4, 9, 0.4);
  mg.at(roof, new THREE.CylinderGeometry(30, 30, t3w + 6, 24, 1, false, -0.55, 1.1).rotateZ(Math.PI / 2), t3c.x, 16 - 27, t3c.z);
  mg.box(mat(0xbfbab0, 0.85), t3c.x - 20, 10, t3c.z - 30, 60, 20, 22);
  pier(t3c.x + 40, t3c.z + 13, t3c.x + 46, t3c.z + 80, 9, 9, 3, [LIV.red, LIV.navy, LIV.teal, LIV.local, LIV.orange, LIV.navy]);
  // Atlantic Aviation's hangar up on Tropicana (OSM 36.10015 N, -115.16046 W)
  const A = ll(36.1001528, -115.1604605);
  mg.at(mat(0xc8ccd2, 0.5, 0.5), new THREE.CylinderGeometry(14, 14, 30, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.55, 1), A.x + 10, 0, A.z + 18);
  parked.push({ x: A.x + 12, z: A.z + 42, yaw: 0.4, liv: LIV.biz, scale: 0.52 });
  buildParked(b);
  b.scene.add(lights.build());
  b.every((_dt, t, night) => {
    lightUniforms.uTime.value = t % 3600;
    lightUniforms.uNight.value = night;
  });
}

// ---------------------------------------------------------------- traffic: departures 1L/1R, arrivals 26L/26R
interface FlyingJet {
  g: THREE.Group;
  gear: THREE.Mesh;
  landing: THREE.BufferAttribute;
  thrust: number;
  tug?: THREE.Object3D;
}
function flyingJet(scene: THREE.Scene, liv: Livery, scale: number, withTug = false): FlyingJet {
  const geo = jetGeo();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo.body, new THREE.MeshStandardMaterial({ color: liv.body, roughness: 0.32, metalness: 0.25 })));
  g.add(new THREE.Mesh(geo.accent, new THREE.MeshStandardMaterial({ color: liv.accent, roughness: 0.32, metalness: 0.25 })));
  g.add(new THREE.Mesh(geo.fixed, JET_FIXED));
  const gear = new THREE.Mesh(geo.gear, JET_FIXED);
  g.add(gear);
  // Lights: two landing lights, red/green nav, white tail, strobes, red beacons top and bottom
  const ls = new LightSet();
  ls.add(v3(1.6, 1.7, 2.6), C_WHITE, 4.5, 2.2, 0, 0, 0.6);
  ls.add(v3(-1.6, 1.7, 2.6), C_WHITE, 4.5, 2.2, 0, 0, 0.6);
  ls.add(v3(10.7, 2.5, -5.2), C_RED, 0.9, 1.8, 0, 0, 0.15);
  ls.add(v3(-10.7, 2.5, -5.2), C_GREEN, 0.9, 1.8, 0, 0, 0.15);
  ls.add(v3(0, FUS_Y + 0.3, -14.4), C_WHITE, 0.8, 1.4, 0, 0, 0.1);
  ls.add(v3(10.8, 2.4, -5.0), C_WHITE, 2.4, 2.6, 1.1, 0.0, 0.7);
  ls.add(v3(-10.8, 2.4, -5.0), C_WHITE, 2.4, 2.6, 1.1, 0.0, 0.7);
  ls.add(v3(0, FUS_Y + FUS_R + 0.1, -1), C_RED, 1.3, 2.0, 0.9, 0.3, 0.35);
  ls.add(v3(0, FUS_Y - FUS_R - 0.1, 0.5), C_RED, 1.3, 2.0, 0.9, 0.75, 0.35);
  const pts = ls.build();
  g.add(pts);
  // Pushback tug with its tow bar on the nose gear
  let tug: THREE.Group | undefined;
  if (withTug) {
    tug = new THREE.Group();
    tug.add(mesh(new THREE.BoxGeometry(2.3, 1.1, 4.2), mat(0xf2c400, 0.6), 0, 0.75, 13.6));
    tug.add(mesh(new THREE.BoxGeometry(1.4, 0.8, 1.2), mat(0x2a2d33, 0.4, 0.4), 0, 1.65, 14.6));
    tug.add(mesh(beamGeo(v3(0, 0.55, 11.5), v3(0, 0.5, 8.8), 0.07, 5), mat(0x2a2d33, 0.5, 0.5)));
    bakeGroup(tug);
    tug.visible = false;
    g.add(tug);
  }
  g.visible = false;
  g.scale.setScalar(scale); // the gate pair matches the parked jets; the others fly at a full narrow-body's size
  scene.add(g);
  return { g, gear, landing: pts.geometry.getAttribute('tint') as THREE.BufferAttribute, thrust: 0, tug };
}
function setLanding(j: FlyingJet, on: boolean): void {
  const v = on ? 2.2 : 0;
  if (j.landing.getX(0) === v) return;
  for (const i of [0, 1]) j.landing.setXYZ(i, v, v, v * 0.94);
  j.landing.needsUpdate = true;
}
function pose(j: FlyingJet, p: THREE.Vector3, d: THREE.Vector3, pitch: number, bank = 0): void {
  j.g.position.copy(p);
  j.g.rotation.set(-pitch, Math.atan2(d.x, d.z), bank, 'YXZ');
}

const CYCLE = 160;
/** Dev/check hook: pin the traffic clock to a second of the cycle (postcards set it with "airT"). */
const airportDebug: { t: number; jets?: THREE.Group[] } = { t: -1 };
if (import.meta.env.DEV || import.meta.env.MODE === 'check') (window as unknown as { __airport: typeof airportDebug }).__airport = airportDebug;

/** A taxi route: a smooth curve through the points, walked by distance. */
class Route {
  private readonly curve: THREE.CatmullRomCurve3;
  readonly len: number;
  constructor(pts: THREE.Vector3[]) {
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.len = this.curve.getLength();
  }
  at(d: number, p: THREE.Vector3, t: THREE.Vector3): void {
    const u = THREE.MathUtils.clamp(d / this.len, 0, 1);
    this.curve.getPointAt(u, p);
    this.curve.getTangentAt(u, t);
    t.y = 0;
    t.normalize();
  }
}

function buildTraffic(b: WorldBuilder): void {
  // jets[0] and jets[1] share Terminal 1's third gate: one lands on 26R and taxis in, the other pushes back and departs 1L
  const jets = [flyingJet(b.scene, LIV.local, 1, true), flyingJet(b.scene, LIV.local, 1), flyingJet(b.scene, LIV.local, 1.3), flyingJet(b.scene, LIV.navy, 1.3)];
  airportDebug.jets = jets.map((j) => j.g);
  const sound = new JetSound();
  const P = new THREE.Vector3();
  const D = new THREE.Vector3();
  const west = v3(-1, 0, 0);

  /** Takeoff roll from `s0` metres down the runway, rotation, climb-out; u = seconds since brakes off. */
  const takeoff = (j: FlyingJet, r: Runway, u: number, s0: number): void => {
    const a = 5.2;
    const ur = 9.6; // rotate at ~50 m/s, just east of the Terminal 1 gates
    let s: number;
    let h = 0;
    let pitch = 0;
    j.thrust = 1;
    if (u < ur) s = s0 + 0.5 * a * u * u;
    else {
      const u2 = u - ur;
      const sr = s0 + 0.5 * a * ur * ur;
      s = sr + 50.4 * u2 + 0.7 * u2 * u2;
      const dd = s - sr;
      h = dd < 60 ? ((dd * dd) / 120) * 0.2 : (dd - 30) * 0.2;
      pitch = Math.min(0.2, u2 * 0.1);
      if (u2 > 20) j.thrust = 0.8;
    }
    P.copy(r.a).addScaledVector(r.dir, s);
    P.y = h;
    pose(j, P, r.dir, pitch);
    j.gear.visible = h < 30;
    setLanding(j, h < 300);
  };

  /** Departure from the runway end: taxi on, hold, roll, climb out north-north-east. */
  const departure = (j: FlyingJet, r: Runway, tau: number): boolean => {
    if (tau < 0 || tau > 62) return false;
    j.gear.visible = true;
    if (tau < 9) {
      P.copy(r.a).addScaledVector(r.dir, tau < 5 ? -16 + 3.2 * tau : 0);
      pose(j, P, r.dir, 0);
      j.thrust = tau < 5 ? 0.25 : 0.35 + (tau - 5) * 0.12;
      setLanding(j, tau >= 5);
    } else takeoff(j, r, tau - 9, 0);
    return true;
  };

  // Terminal 1, gate 3: pushback, engine start, taxi out on the west parallel, line up on 1L
  const GATE = v3(T1_GATES[2], 0, GATE_NOSE_Z + 11.6);
  const pushRoute = new Route([GATE.clone(), v3(GATE.x, 0, 889), v3(GATE.x - 1.2, 0, 897), v3(GATE.x - 5.5, 0, 901.6), v3(GATE.x - 12, 0, 903.2)]);
  const taxiOut = new Route([v3(GATE.x - 12, 0, 903.2), v3(GATE.x - 3, 0, 903.4), v3(GATE.x + 3, 0, 906), along(R1L, 158, -26), along(R1L, 90, -26), along(R1L, 24, -26), along(R1L, 4, -21), along(R1L, 4, -9), along(R1L, 15, -1), along(R1L, 26, 0)]);
  const LINEUP = 26;
  const PUSH_V = 1.6;
  const TAXI_V = 9;
  const pushT = pushRoute.len / PUSH_V;
  const startT = pushT + 4;
  const taxiT = startT + taxiOut.len / TAXI_V;
  const rollT = taxiT + 5;
  const fromGate = (j: FlyingJet, tau: number): boolean => {
    if (tau < 0 || tau > rollT + 55) return false;
    j.gear.visible = true;
    if (j.tug) j.tug.visible = tau < pushT;
    if (tau < startT) {
      pushRoute.at(Math.min(tau, pushT) * PUSH_V, P, D);
      D.negate(); // pushed tail-first
      pose(j, P, D, 0);
      j.thrust = tau < pushT ? 0.05 : 0.18;
      setLanding(j, false);
    } else if (tau < taxiT) {
      taxiOut.at((tau - startT) * TAXI_V, P, D);
      pose(j, P, D, 0);
      j.thrust = 0.22;
      setLanding(j, false);
    } else if (tau < rollT) {
      P.copy(along(R1L, LINEUP));
      pose(j, P, R1L.dir, 0);
      j.thrust = 0.4 + (tau - taxiT) * 0.08;
      setLanding(j, true);
    } else takeoff(j, R1L, tau - rollT, LINEUP);
    return true;
  };

  /**
   * Arrival: 3° approach from the east, flare, touchdown, reversers, roll out, turn off north at exitX.
   * Then `after` takes over (u = seconds since the turn-off), or the jet taxis north and fades.
   */
  const arrival = (j: FlyingJet, r: Runway, exitX: number, tau: number, after?: (u: number) => boolean): boolean => {
    if (tau < 0) return false;
    const td = r.b.clone().addScaledVector(west, 70);
    const d0 = 2300;
    const v0 = 62;
    const ta = d0 / v0;
    j.gear.visible = true;
    setLanding(j, true);
    if (tau < ta) {
      const d = d0 - v0 * tau;
      P.copy(td).addScaledVector(west, -d);
      P.y = d < 70 ? 0.075 * 70 * (d / 70) ** 2 : 0.075 * d;
      pose(j, P, west, d < 70 ? 0.09 : 0.04);
      j.thrust = 0.32;
      return true;
    }
    const u = tau - ta;
    const R = 22;
    const sEnd = td.x - (exitX + R);
    const dec = (v0 * v0 - 81) / (2 * sEnd);
    const ue = (v0 - 9) / dec;
    j.thrust = u < 6 ? 0.85 : 0.18;
    if (u < ue) {
      const s = v0 * u - 0.5 * dec * u * u;
      P.copy(td).addScaledVector(west, s);
      P.y = 0;
      pose(j, P, west, u < 1.5 ? 0.06 * (1 - u / 1.5) : 0);
      return true;
    }
    setLanding(j, false);
    const u2 = u - ue;
    const arcT = (R * Math.PI) / 2 / 9;
    if (u2 < arcT) {
      const th = (u2 * 9) / R;
      P.set(exitX + R - R * Math.sin(th), 0, td.z - R * (1 - Math.cos(th)));
      D.set(-Math.cos(th), 0, -Math.sin(th));
      pose(j, P, D, 0);
      return true;
    }
    if (after) return after(u2 - arcT);
    P.set(exitX, 0, td.z - R - (u2 - arcT) * 9);
    pose(j, P, D.set(0, 0, -1), 0);
    return P.z > td.z - 150;
  };

  // The 26R arrival's taxi-in: west on the 8L parallel, north up the west parallel, into gate 3
  const tdz = R8L.b.z - 22;
  const taxiIn = new Route([v3(420, 0, tdz), v3(419, 0, 1022.6), v3(405, 0, 1021.7), v3(130, 0, 1021.7), v3(100, 0, 1021.4), v3(90, 0, 1017.5), along(R1L, 62, -26), along(R1L, 110, -26), along(R1L, 150, -26), along(R1L, 166, -26.5), v3(GATE.x, 0, 904), v3(GATE.x, 0, 898)]);
  const gateIn = new Route([v3(GATE.x, 0, 898), v3(GATE.x, 0, 890), GATE.clone()]);
  const IN_V = 10;
  const GATE_V = 2.4;
  const ARRIVE_AT = 8;
  const toGate = (u: number): boolean => {
    const j = jets[1];
    j.thrust = 0.2;
    const d = u * IN_V;
    if (d < taxiIn.len) {
      taxiIn.at(d, P, D);
      pose(j, P, D, 0);
      return true;
    }
    const d2 = (u - taxiIn.len / IN_V) * GATE_V;
    if (d2 < gateIn.len) {
      gateIn.at(d2, P, D);
      pose(j, P, D, 0);
      j.thrust = 0.12;
      return true;
    }
    return false;
  };
  // Cycle second the 26R arrival stops at gate 3 (the departure pushes back from it at second 0)
  const parkedAt = (() => {
    const ta = 2300 / 62;
    const sEnd = R8L.b.x - 70 - (420 + 22);
    const dec = (62 * 62 - 81) / (2 * sEnd);
    return ARRIVE_AT + ta + (62 - 9) / dec + (22 * Math.PI) / 2 / 9 + taxiIn.len / IN_V + gateIn.len / GATE_V;
  })();

  b.every((_dt, t) => {
    const cam = viewer.cam;
    const tc = airportDebug.t >= 0 ? airportDebug.t : t % CYCLE;
    const wrap = (x: number) => ((x % CYCLE) + CYCLE) % CYCLE; // the 1R departure and 26L arrival may straddle the cycle
    const vis = [fromGate(jets[0], tc), arrival(jets[1], R8L, 420, tc - ARRIVE_AT, toGate), departure(jets[2], R1R, wrap(tc - 84)), arrival(jets[3], R8R, 420, wrap(tc - 112))];
    setGateParked(tc >= parkedAt);
    for (let i = 0; i < jets.length; i++) {
      const j = jets[i];
      j.g.visible = vis[i] && j.g.position.distanceTo(cam) < 2600;
      if (!j.g.visible) j.thrust = 0;
    }
    sound.update(jets, cam, viewer.cat);
  });
}

// ---------------------------------------------------------------- jet sound (WebAudio, follows the game's sound switch)
const AMBIENCE_KEY = 'catsmoke.ambience';
class JetSound {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private whine: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private checkAt = 0;
  private on = true;

  constructor() {
    const begin = () => {
      this.start();
      window.removeEventListener('pointerdown', begin);
      window.removeEventListener('keydown', begin);
    };
    window.addEventListener('pointerdown', begin);
    window.addEventListener('keydown', begin);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  private start(): void {
    if (this.ctx) return;
    try {
      const ctx = new AudioContext();
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.96 + (Math.random() * 2 - 1) * 0.2; // brown-ish rumble
        d[i] = last;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      lp.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      // A thin turbine whine on top
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 2400;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 6;
      const whine = ctx.createGain();
      whine.gain.value = 0;
      src.connect(lp).connect(gain).connect(pan);
      osc.connect(bp).connect(whine).connect(pan);
      pan.connect(ctx.destination);
      src.start();
      osc.start();
      this.ctx = ctx;
      this.gain = gain;
      this.whine = whine;
      this.pan = pan;
      this.lp = lp;
    } catch {
      this.ctx = null;
    }
  }

  update(jets: FlyingJet[], cam: THREE.Vector3, cat: THREE.Vector3): void {
    const ctx = this.ctx;
    if (!ctx || !this.gain || !this.whine || !this.pan || !this.lp) return;
    const now = ctx.currentTime;
    if (now > this.checkAt) {
      this.checkAt = now + 1;
      try {
        this.on = localStorage.getItem(AMBIENCE_KEY) !== 'off';
      } catch {
        this.on = true;
      }
    }
    let loud = 0;
    let px = 0;
    let near = 1e9;
    const fx = cat.x - cam.x;
    const fz = cat.z - cam.z;
    const fl = Math.hypot(fx, fz) || 1;
    for (const j of jets) {
      if (!j.g.visible || j.thrust <= 0) continue;
      const p = j.g.position;
      const dist = p.distanceTo(cam);
      const l = j.thrust / (1 + (dist / 140) ** 2);
      loud += l;
      near = Math.min(near, dist);
      // right of the camera's facing: (−fz, fx)
      px += (((p.x - cam.x) * -fz + (p.z - cam.z) * fx) / (fl * Math.max(dist, 1))) * l;
    }
    const level = this.on ? Math.min(0.5, loud * 0.55) : 0;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(level, now, 0.25);
    this.gain.gain.setTargetAtTime(0, now + 0.4, 0.3); // fades if the game stops updating (pause)
    this.whine.gain.cancelScheduledValues(now);
    this.whine.gain.setTargetAtTime(this.on ? Math.min(0.03, loud * 0.04) * (near < 400 ? 1 : 0.3) : 0, now, 0.25);
    this.whine.gain.setTargetAtTime(0, now + 0.4, 0.3);
    this.pan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, loud > 0 ? px / loud : 0)), now, 0.2);
    this.lp.frequency.setTargetAtTime(260 + Math.min(1, loud) * 700, now, 0.3);
  }
}
