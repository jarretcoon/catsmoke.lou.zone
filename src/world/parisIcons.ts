import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { mat, mesh } from './props';
import { canvasTex } from './themedKit';
import { LedBoard } from './textures';
import type { LedShow } from './textures';
import { driveLed, fitFont, goldGradient } from './signKit';
import { bulbRing } from './stripSigns';
import { uplights } from './stripFronts';

/*
 * Paris Las Vegas landmarks, after street photos of the real thing:
 *  - the half-scale Eiffel Tower (165 m real): four curved lattice legs that join above the second
 *    platform, the big arches between the legs, the first-floor restaurant platform, the observation
 *    deck near the top and the antenna. Bronze-brown ironwork by day; floodlit gold at night, with the
 *    light show (real: every half hour from sunset, white sparkle plus red, white and blue washes).
 *  - the Montgolfier balloon marquee at the north end of the front, by the Grand Bazaar: a royal-blue
 *    envelope covered in gold fleurs-de-lis and garlands, the red "Paris" script on its band, and the
 *    three-sided LED "basket" under it on a column.
 *  - the two-thirds-scale Arc de Triomphe over the entry drive.
 * The tower lattice is one alpha-cut material (one draw call per map cell); the sparkle is one
 * Points object that only draws during a show.
 */

const TOWER_H = 60; // game metres (the Strip is compressed; the real tower is 165 m)
/** Envelope half-width at height fraction h (0…1): the Eiffel's concave curve. */
const envelope = (h: number) => (0.016 + 0.184 * Math.exp(-3.6 * h)) * TOWER_H;
const H1 = 0.178; // first platform
const H2 = 0.357; // second platform: the legs have joined
const HD = 0.8; // observation deck
const HT = 0.9; // top of the lattice
/** Inner edge of a leg (half-width): the legs start well apart and meet at the second platform. */
const legInner = (h: number) => (h >= H2 ? 0 : 0.116 * Math.pow(1 - h / H2, 1.25) * TOWER_H);

let latticeMat: THREE.MeshStandardMaterial | null = null;
const showUni = { uShow: { value: 0 }, uT: { value: 0 }, uShowI: { value: 1 } };

/** Riveted lattice: frame members, X bracing and a finer secondary lattice (bronze on clear; a white mask for the lights). */
function lattice(): THREE.MeshStandardMaterial {
  if (latticeMat) return latticeMat;
  const S = 128;
  const draw = (ctx: CanvasRenderingContext2D, col: string, lite: string) => {
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = col;
    ctx.lineCap = 'square';
    // secondary lattice (fine diagonals)
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = -S; k <= S * 2; k += 32) {
      ctx.moveTo(k, 0);
      ctx.lineTo(k + S, S);
      ctx.moveTo(k, S);
      ctx.lineTo(k + S, 0);
    }
    ctx.stroke();
    // main X bracing
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(S, S);
    ctx.moveTo(S, 0);
    ctx.lineTo(0, S);
    ctx.stroke();
    // frame: posts at the tile edges, girders top and bottom
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, 14, S);
    ctx.fillRect(S - 14, 0, 14, S);
    ctx.fillRect(0, 0, S, 10);
    ctx.fillRect(0, S - 10, S, 10);
    // rivet highlights / lit edges
    ctx.fillStyle = lite;
    ctx.fillRect(5, 0, 3, S);
    ctx.fillRect(S - 8, 0, 3, S);
  };
  const map = canvasTex(S, S, (ctx) => draw(ctx, '#6f5038', '#8c6a4c'), true);
  const mask = canvasTex(S, S, (ctx) => draw(ctx, '#d8d8d8', '#ffffff'), true);
  map.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap: mask, emissive: 0xffa640, emissiveIntensity: 0, alphaTest: 0.32, side: THREE.DoubleSide, roughness: 0.62, metalness: 0.35 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, showUni, { uTowerH: { value: TOWER_H } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vEy;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvEy = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vEy;
        uniform float uShow;
        uniform float uT;
        uniform float uShowI;
        uniform float uTowerH;
        vec3 eiffelHue(float h) {
          vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
          return k;
        }
        vec3 eiffelShow(float h, float t) {
          // 0-14 s: red, white and blue bands rising; 14-26 s: a slow rainbow chase; 26-34 s: dim gold
          // under the sparkle; 34-40 s: blue and white flashes, then back to gold
          float band = fract(h * 2.2 - t * 0.32);
          vec3 rwb = band < 0.3333 ? vec3(1.0, 0.1, 0.12) : (band < 0.6667 ? vec3(1.0, 0.96, 0.92) : vec3(0.12, 0.28, 1.0));
          vec3 rainbow = eiffelHue(h * 0.7 - t * 0.12);
          vec3 gold = vec3(1.0, 0.62, 0.22);
          float flash = step(0.5, fract(t * 1.6));
          vec3 bw = mix(vec3(0.15, 0.32, 1.0), vec3(1.0), flash);
          vec3 c = rwb;
          c = mix(c, rainbow, smoothstep(13.0, 15.0, t));
          c = mix(c, gold * 0.42, smoothstep(25.0, 27.0, t));
          c = mix(c, bw, smoothstep(33.5, 34.5, t));
          return c;
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uShow > 0.001) {
          totalEmissiveRadiance = mix(totalEmissiveRadiance, eiffelShow(clamp(vEy / uTowerH, 0.0, 1.0), uT) * emissiveColor.rgb * uShowI, uShow);
        }`
      );
  };
  m.customProgramCacheKey = () => 'eiffel-lattice';
  latticeMat = m;
  return m;
}

/** Non-indexed quad soup with planar UVs in metres (u across the face, v up). */
class Soup {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ua: [number, number], ub: [number, number], uc: [number, number], ud: [number, number]): void {
    for (const [p, t] of [
      [a, ua],
      [b, ub],
      [c, uc],
      [a, ua],
      [c, uc],
      [d, ud],
    ] as Array<[THREE.Vector3, [number, number]]>) {
      this.pos.push(p.x, p.y, p.z);
      this.uv.push(t[0], t[1]);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

const TILE = 2.4; // metres per lattice tile, vertically

/** The tower's lattice skin: four curved legs to the second platform, then one tapering shaft. */
function towerLattice(): THREE.BufferGeometry {
  const s = new Soup();
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const legSegs = 12;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let i = 0; i < legSegs; i++) {
        const h0 = (i / legSegs) * H2;
        const h1 = ((i + 1) / legSegs) * H2;
        const y0 = h0 * TOWER_H;
        const y1 = h1 * TOWER_H;
        const o0 = envelope(h0);
        const o1 = envelope(h1);
        const n0 = legInner(h0);
        const n1 = legInner(h1);
        const v0 = y0 / TILE;
        const v1 = y1 / TILE;
        // outer faces (x = ±o and z = ±o), inner faces (x = ±n and z = ±n); 2 tiles across each
        s.quad(V(sx * o0, y0, sz * n0), V(sx * o0, y0, sz * o0), V(sx * o1, y1, sz * o1), V(sx * o1, y1, sz * n1), [0, v0], [2, v0], [2, v1], [0, v1]);
        s.quad(V(sx * n0, y0, sz * o0), V(sx * o0, y0, sz * o0), V(sx * o1, y1, sz * o1), V(sx * n1, y1, sz * o1), [0, v0], [2, v0], [2, v1], [0, v1]);
        s.quad(V(sx * n0, y0, sz * n0), V(sx * n0, y0, sz * o0), V(sx * n1, y1, sz * o1), V(sx * n1, y1, sz * n1), [0, v0], [2, v0], [2, v1], [0, v1]);
        s.quad(V(sx * n0, y0, sz * n0), V(sx * o0, y0, sz * n0), V(sx * o1, y1, sz * n1), V(sx * n1, y1, sz * n1), [0, v0], [2, v0], [2, v1], [0, v1]);
      }
    }
  }
  const shaftSegs = 12;
  for (let i = 0; i < shaftSegs; i++) {
    const h0 = H2 + ((HT - H2) * i) / shaftSegs;
    const h1 = H2 + ((HT - H2) * (i + 1)) / shaftSegs;
    const y0 = h0 * TOWER_H;
    const y1 = h1 * TOWER_H;
    const o0 = envelope(h0);
    const o1 = envelope(h1);
    const v0 = y0 / TILE;
    const v1 = y1 / TILE;
    const tiles = 3;
    for (const sg of [-1, 1]) {
      s.quad(V(sg * o0, y0, -o0), V(sg * o0, y0, o0), V(sg * o1, y1, o1), V(sg * o1, y1, -o1), [0, v0], [tiles, v0], [tiles, v1], [0, v1]);
      s.quad(V(-o0, y0, sg * o0), V(o0, y0, sg * o0), V(o1, y1, sg * o1), V(-o1, y1, sg * o1), [0, v0], [tiles, v0], [tiles, v1], [0, v1]);
    }
  }
  return s.geometry();
}

/** A square ring slab (platform) of half-width `o` with a hole of half-width `hole`, `t` thick, centred at y. */
function ring(b: WorldBuilder, x: number, y: number, z: number, o: number, hole: number, t: number, m: THREE.Material): void {
  const w = o - hole;
  for (const s of [-1, 1]) {
    b.add(mesh(new THREE.BoxGeometry(o * 2, t, w), m, x, y, z + s * (hole + w / 2), true));
    b.add(mesh(new THREE.BoxGeometry(w, t, hole * 2), m, x + s * (hole + w / 2), y, z));
  }
}

export interface EiffelInfo {
  /** height of the observation deck floor */
  deckY: number;
}

/** The Eiffel Tower at (tx, tz), legs square to the axes. Static lattice + platforms; the light show runs on its own. */
export function eiffelTower(b: WorldBuilder, tx: number, tz: number): EiffelInfo {
  const iron = mat(0x6a4c34, 0.6, 0.4);
  const ironDark = mat(0x4a3424, 0.7, 0.3);
  const lat = lattice();
  b.add(mesh(towerLattice(), lat, tx, 0, tz, true));

  // the four great arches between the legs, under the first platform
  const y1 = H1 * TOWER_H;
  const rA = legInner(0.06) * 0.98;
  const yc = y1 - 0.9 - rA;
  for (const [ox, oz, ry] of [
    [0, -1, 0],
    [0, 1, 0],
    [-1, 0, Math.PI / 2],
    [1, 0, Math.PI / 2],
  ] as Array<[number, number, number]>) {
    const off = envelope(yc / TOWER_H) - 0.25;
    const arch = mesh(new THREE.TorusGeometry(rA, 0.32, 6, 22, Math.PI), iron, tx + ox * off, yc, tz + oz * off);
    arch.rotation.y = ry;
    b.add(arch);
    // lattice spandrel band under the platform edge
    const band = mesh(new THREE.BoxGeometry(ry ? 0.25 : envelope(H1) * 2, 0.9, ry ? envelope(H1) * 2 : 0.25), ironDark, tx + ox * (envelope(H1) - 0.1), y1 - 1.1, tz + oz * (envelope(H1) - 0.1));
    b.add(band);
  }

  // platforms: the first floor (restaurant level), the second, the observation deck
  const lights = new THREE.MeshStandardMaterial({ color: 0xffd278, emissive: 0xffc060, emissiveIntensity: 0.1, roughness: 0.4 });
  b.nightGlow(lights, 0.05, 1.5);
  const o1 = envelope(H1) + 0.9;
  ring(b, tx, y1, tz, o1, 1.6, 1.6, iron);
  ring(b, tx, y1 + 0.95, tz, o1 + 0.1, 1.6, 0.18, lights);
  // first-floor gallery: a glazed restaurant wall set back from the edge
  const gal = mat(0x3a4650, 0.2, 0.5, { emissive: 0xffd39a, emissiveIntensity: 0.06 });
  b.nightGlow(gal as THREE.MeshStandardMaterial, 0.06, 0.8);
  for (const s of [-1, 1]) {
    b.add(mesh(new THREE.BoxGeometry((o1 - 1.4) * 2, 1.7, 0.15), gal, tx, y1 + 1.8, tz + s * (o1 - 1.4)));
    b.add(mesh(new THREE.BoxGeometry(0.15, 1.7, (o1 - 1.4) * 2), gal, tx + s * (o1 - 1.4), y1 + 1.8, tz));
  }
  ring(b, tx, y1 + 2.75, tz, o1 - 1.1, 1.6, 0.25, iron);
  const y2 = H2 * TOWER_H;
  const o2 = envelope(H2) + 0.7;
  ring(b, tx, y2, tz, o2, 1.4, 1.1, iron);
  ring(b, tx, y2 + 0.62, tz, o2 + 0.08, 1.4, 0.14, lights);
  // observation deck: a gallery cantilevered round the shaft, railed
  const deckY = HD * TOWER_H;
  const od = 2.9;
  b.box(tx, deckY - 0.6, tz, od * 2, 0.6, od * 2, iron);
  for (const [ox, oz, w, d] of [
    [0, -od, od * 2, 0.1],
    [0, od, od * 2, 0.1],
    [-od, 0, 0.1, od * 2],
    [od, 0, 0.1, od * 2],
  ]) b.box(tx + ox, deckY, tz + oz, w, 1.1, d, ironDark, true, false);
  ring(b, tx, deckY - 0.66, tz, od + 0.06, od - 0.3, 0.12, lights);
  // top: lantern cabin, the antenna and its beacon
  const yt = HT * TOWER_H;
  b.add(mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), ironDark, tx, yt + 1.1, tz));
  b.add(mesh(new THREE.BoxGeometry(2.6, 0.3, 2.6), iron, tx, yt + 2.3, tz));
  const ant = mesh(new THREE.CylinderGeometry(0.12, 0.35, 4.2, 6), iron, tx, yt + 4.5, tz);
  b.add(ant);
  const beacon = mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), tx, yt + 6.8, tz);
  beacon.userData.dynamic = true;
  b.add(beacon);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    // leg footings (stone piers) and colliders
    const o = envelope(0);
    const n = legInner(0);
    const cx = tx + sx * (o + n) / 2;
    const cz = tz + sz * (o + n) / 2;
    b.box(cx, 0, cz, o - n + 0.6, 0.7, o - n + 0.6, mat(0xd9cdb6, 0.75), true);
    b.collider(cx - (o - n) / 2, cx + (o - n) / 2, cz - (o - n) / 2, cz + (o - n) / 2, 0, 6, true);
  }

  // night: gold floodlight on the ironwork, and the show every couple of minutes
  const sparkle = eiffelSparkle(tx, tz);
  b.scene.add(sparkle.points);
  const SHOW_EVERY = 120;
  const SHOW_LEN = 40;
  const beaconMat = beacon.material as THREE.MeshBasicMaterial;
  b.every((_dt, t, night) => {
    const n = THREE.MathUtils.smoothstep(night, 0.2, 0.8);
    lat.emissiveIntensity = n * 0.72;
    const local = t % SHOW_EVERY;
    const on = n > 0.5 && local < SHOW_LEN ? Math.min(1, local / 1.2, (SHOW_LEN - local) / 1.2) : 0;
    showUni.uShow.value = on;
    showUni.uT.value = local;
    showUni.uShowI.value = 1.25;
    sparkle.set(t, on * (local > 25 && local < 34 ? 1 : 0.55));
    beaconMat.color.setScalar(n > 0.1 && Math.floor(t * 1.5) % 2 ? 1.6 : 0.85);
  });
  return { deckY };
}

/** White twinkle lights over the ironwork: one Points draw call, only during a show. */
function eiffelSparkle(tx: number, tz: number): { points: THREE.Points; set: (t: number, on: number) => void } {
  const N = 520;
  const pos = new Float32Array(N * 3);
  const ph = new Float32Array(N);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < N; i++) {
    const h = Math.pow(rnd(), 1.15) * HT;
    const o = envelope(h);
    const n = legInner(h);
    const face = Math.floor(rnd() * 4);
    const sx = rnd() < 0.5 ? -1 : 1;
    const sz = rnd() < 0.5 ? -1 : 1;
    // a point on one of the outer faces (of a leg below the joint, of the shaft above)
    const along = n + (o - n) * rnd();
    const x = face < 2 ? sx * o : sx * along;
    const z = face < 2 ? sz * along : sz * o;
    pos[i * 3] = tx + x * 1.02;
    pos[i * 3 + 1] = h * TOWER_H;
    pos[i * 3 + 2] = tz + z * 1.02;
    ph[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const uni = { uTime: { value: 0 }, uOn: { value: 0 } };
  const m = new THREE.ShaderMaterial({
    uniforms: uni,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      uniform float uOn;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = fract(phase * 13.7 + uTime * (0.9 + phase * 1.4));
        vA = uOn * max(0.0, 1.0 - abs(tw - 0.5) * 7.0);
        gl_PointSize = clamp(380.0 / max(-mv.z, 1.0), 1.5, 9.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float a = vA * (1.0 - smoothstep(0.12, 0.5, d));
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a * 1.5, 1.0);
      }`,
  });
  const points = new THREE.Points(g, m);
  points.visible = false;
  return {
    points,
    set: (t, on) => {
      points.visible = on > 0.01;
      uni.uTime.value = t % 1000;
      uni.uOn.value = on;
    },
  };
}

// ---------------------------------------------------------------- the balloon marquee

const PARIS_SHOWS: LedShow[] = [
  { name: 'MJ THE MUSICAL', sub: 'PARIS THEATRE • NIGHTLY', color: '#5a1a6a', art: 'singer' },
  { name: 'GORDON RAMSAY STEAK', sub: 'RESERVE TONIGHT', color: '#7a1a1a', art: 'singer' },
  { name: 'EIFFEL TOWER VIEWING DECK', sub: '46 STORIES UP • OPEN LATE', color: '#1a3a7a', art: 'band' },
];

/** The envelope's skin: royal blue, gold fleurs-de-lis and seams, the cream band with the red script, garlands, gold crown. */
function balloonSkin(vBand: number, vTop: number, vSkirt: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  return canvasTex(W, H, (ctx) => {
    const y = (v: number) => (1 - v) * H; // canvas y of a profile fraction v (0 = collar, 1 = crown)
    ctx.fillStyle = '#1d4a9a';
    ctx.fillRect(0, 0, W, H);
    // gore seams in gold
    ctx.fillStyle = '#d8ae3e';
    for (let i = 0; i < 24; i++) ctx.fillRect((i * W) / 24 - 1.5, 0, 3, H);
    // fleurs-de-lis in a diaper over the upper half
    const fleur = (cx: number, cy: number, s: number) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.quadraticCurveTo(cx + s * 0.35, cy - s * 0.3, cx, cy + s * 0.2);
      ctx.quadraticCurveTo(cx - s * 0.35, cy - s * 0.3, cx, cy - s);
      ctx.moveTo(cx - s * 0.15, cy);
      ctx.quadraticCurveTo(cx - s * 0.9, cy - s * 0.5, cx - s * 0.75, cy + s * 0.25);
      ctx.quadraticCurveTo(cx - s * 0.5, cy + s * 0.05, cx - s * 0.1, cy + s * 0.2);
      ctx.moveTo(cx + s * 0.15, cy);
      ctx.quadraticCurveTo(cx + s * 0.9, cy - s * 0.5, cx + s * 0.75, cy + s * 0.25);
      ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.05, cx + s * 0.1, cy + s * 0.2);
      ctx.fill();
      ctx.fillRect(cx - s * 0.45, cy + s * 0.2, s * 0.9, s * 0.14);
      ctx.fillRect(cx - s * 0.08, cy + s * 0.34, s * 0.16, s * 0.4);
    };
    ctx.fillStyle = '#e8bf4a';
    const top = y(vTop);
    const bandTop = y(vBand + 0.075);
    for (let row = 0, yy = top + 20; yy < bandTop - 14; yy += 34, row++) {
      for (let x = (row % 2) * 21; x < W + 20; x += 42.67) fleur(x, yy, 11);
    }
    // the crown: gold sunburst rays over the top
    const g = ctx.createLinearGradient(0, 0, 0, top);
    g.addColorStop(0, '#f6d86a');
    g.addColorStop(1, '#c8962a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, top);
    ctx.fillStyle = '#e8bf4a';
    for (let x = 0; x < W; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + 16, top + 22);
      ctx.lineTo(x + 32, top);
      ctx.fill();
    }
    // the band: cream with gold rules and the red "Paris" script three times round
    const b0 = y(vBand + 0.075);
    const b1 = y(vBand - 0.075);
    ctx.fillStyle = '#f4e8cc';
    ctx.fillRect(0, b0, W, b1 - b0);
    ctx.fillStyle = '#c8962a';
    ctx.fillRect(0, b0, W, 7);
    ctx.fillRect(0, b1 - 7, W, 7);
    ctx.fillStyle = '#8a1a24';
    ctx.fillRect(0, b0 + 9, W, 2);
    ctx.fillRect(0, b1 - 11, W, 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const bh = b1 - b0;
    for (const u of [0.75, 0.75 - 1 / 3, 0.75 + 1 / 3 - 1, 0.75 + 1 / 3]) {
      const cx = u * W;
      fitFont(ctx, 'Paris', 'script', W / 3 - 60, bh * 0.9);
      ctx.lineWidth = bh * 0.06;
      ctx.strokeStyle = '#5a0a12';
      ctx.strokeText('Paris', cx, (b0 + b1) / 2 + bh * 0.04);
      ctx.fillStyle = '#c8102e';
      ctx.fillText('Paris', cx, (b0 + b1) / 2 + bh * 0.04);
      ctx.letterSpacing = '0px';
    }
    // gold garland swags with tassels under the band
    ctx.strokeStyle = '#e8bf4a';
    ctx.lineWidth = 7;
    const sw0 = b1 + 4;
    for (let i = 0; i < 12; i++) {
      const x0 = (i * W) / 12;
      ctx.beginPath();
      ctx.moveTo(x0, sw0);
      ctx.quadraticCurveTo(x0 + W / 24, sw0 + 46, x0 + W / 12, sw0);
      ctx.stroke();
      ctx.fillStyle = '#e8bf4a';
      ctx.fillRect(x0 - 3, sw0, 6, 30);
      ctx.beginPath();
      ctx.arc(x0, sw0 + 34, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // the skirt near the collar: red drapery with a gold fringe
    const s0 = y(vSkirt);
    ctx.fillStyle = '#b0182a';
    ctx.fillRect(0, s0, W, H - s0);
    ctx.fillStyle = '#e8bf4a';
    ctx.fillRect(0, s0, W, 6);
    for (let x = 0; x < W; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, s0 + 6);
      ctx.lineTo(x + 8, s0 + 22);
      ctx.lineTo(x + 16, s0 + 6);
      ctx.fill();
    }
  });
}

/**
 * The Montgolfier balloon marquee (real: 46 m tall, the globe 23 m across) standing at (x, z): the
 * column, the three-sided LED "basket", the envelope, chasing bulb rings at night.
 */
export function parisBalloon(b: WorldBuilder, x: number, z: number): void {
  const R = 4.1;
  const collarY = 8.9;
  // profile from the collar up: a tapering skirt flaring to the equator, then the round crown
  const prof: THREE.Vector2[] = [];
  const lower = [
    [0.95, 0],
    [1.1, 0.35],
    [1.45, 1.1],
    [2.05, 2.0],
    [2.75, 2.85],
    [3.4, 3.65],
    [3.85, 4.35],
    [R, 5.0],
  ];
  for (const [r, yy] of lower) prof.push(new THREE.Vector2(r, yy));
  const eqY = 5.0;
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    prof.push(new THREE.Vector2(Math.max(0.001, R * Math.cos(a)), eqY + R * Math.sin(a)));
  }
  const n = prof.length - 1;
  const vBand = (lower.length - 1 + 1.2) / n;
  const vTop = (lower.length - 1 + 10.2) / n;
  const vSkirt = 2.3 / n;
  const skin = balloonSkin(vBand, vTop, vSkirt);
  const envMat = new THREE.MeshStandardMaterial({ map: skin, emissiveMap: skin, emissive: 0xffffff, emissiveIntensity: 0.03, roughness: 0.5 });
  b.nightGlow(envMat, 0.03, 0.55);
  const env = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), envMat);
  env.castShadow = true;
  b.add(env, x, collarY, z);
  // bulb rings: above and below the band, round the crown, and the collar
  for (const [yy, rr, cnt] of [
    [eqY + 1.45, Math.sqrt(R * R - 1.45 * 1.45) + 0.06, 56],
    [eqY - 0.2, R + 0.03, 58],
    [eqY + R * 0.78, R * Math.cos(Math.asin(0.78)) + 0.05, 34],
    [0.2, 1.05, 18],
  ] as Array<[number, number, number]>) {
    const ring = bulbRing(rr, yy, cnt, 0.22);
    b.add(ring, x, collarY, z);
  }
  // column, plinth and the gold collar struts down to the basket
  const bronze = mat(0x3a2c1c, 0.45, 0.7);
  const gold = mat(0xd4a84a, 0.3, 0.85);
  b.add(mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.9, 16), mat(0xd9cdb6, 0.75), x, 0.45, z, true));
  b.add(mesh(new THREE.CylinderGeometry(0.55, 0.7, 4.0, 14), bronze, x, 2.9, z, true));
  b.collider(x - 1.8, x + 1.8, z - 1.8, z + 1.8, 0, 0.9);
  b.collider(x - 0.7, x + 0.7, z - 0.7, z + 0.7, 0, 9, true);
  // the basket: a three-sided LED screen with gold frames, one face to the Strip (−x)
  const led = new LedBoard('PARIS', ['LAS VEGAS', 'EIFFEL TOWER VIEWING DECK', 'MON AMI GABI • ON THE STRIP', 'CAESARS REWARDS'], ['#1d4a9a', '#c8102e', '#c9a04a', '#1a1a3a'], 256, 320).withShows(PARIS_SHOWS);
  const ledMat = new THREE.MeshBasicMaterial({ map: led.tex });
  const fw = 3.3;
  const fh = 4.0;
  const by = 4.9 + fh / 2;
  const apo = fw / (2 * Math.tan(Math.PI / 3)) + 0.05;
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * Math.PI * 2) / 3; // face normal angle about y (k = 0 faces −x)
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const face = mesh(new THREE.PlaneGeometry(fw, fh), ledMat, x + nx * apo, by, z + nz * apo);
    face.rotation.y = a;
    b.add(face);
    const fr = mesh(new THREE.BoxGeometry(fw + 0.3, 0.28, 0.2), gold, x + nx * (apo - 0.05), by + fh / 2 + 0.14, z + nz * (apo - 0.05));
    fr.rotation.y = a;
    b.add(fr);
    const fr2 = mesh(new THREE.BoxGeometry(fw + 0.3, 0.28, 0.2), gold, x + nx * (apo - 0.05), by - fh / 2 - 0.14, z + nz * (apo - 0.05));
    fr2.rotation.y = a;
    b.add(fr2);
  }
  const core = mesh(new THREE.CylinderGeometry((apo - 0.08) * 2, (apo - 0.08) * 2, fh, 3), bronze, x, by, z); // core behind the screens
  core.rotation.y = Math.PI / 2;
  b.add(core);
  driveLed(b, led, x, by, z);
  // gold struts from the basket's top up to the collar
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const p0 = new THREE.Vector3(x + Math.sin(a) * 1.35, by + fh / 2 + 0.25, z + Math.cos(a) * 1.35);
    const p1 = new THREE.Vector3(x + Math.sin(a) * 0.95, collarY + 0.05, z + Math.cos(a) * 0.95);
    const st = mesh(new THREE.CylinderGeometry(0.05, 0.05, p0.distanceTo(p1), 5), gold, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    st.lookAt(p1);
    st.rotateX(Math.PI / 2);
    b.add(st);
  }
  b.add(mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.4, 16), gold, x, by + fh / 2 + 0.2, z));
}

// ---------------------------------------------------------------- the Arc de Triomphe

/**
 * The Arc de Triomphe (two-thirds scale real, 33 m) over the entry drive at (x, z): the great arch
 * through it along x, piers with sculpture panels, the side arches, entablature, the attic with its
 * shields, gold uplight at night.
 */
export function arcDeTriomphe(b: WorldBuilder, x: number, z: number): void {
  const stone = mat(0xe6d8bd, 0.72);
  const shade = mat(0xcbb999, 0.8);
  const deep = mat(0x6a5a48, 0.9);
  const W = 12.5; // along z
  const D = 6.4; // along x
  const ent = 9.9; // entablature level
  const open = 3.0; // half opening
  const spring = 5.4;
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0);
  s.lineTo(-open, 0);
  s.lineTo(-open, spring);
  s.absarc(0, spring, open, Math.PI, 0, true);
  s.lineTo(open, 0);
  s.lineTo(W / 2, 0);
  s.lineTo(W / 2, ent);
  s.lineTo(-W / 2, ent);
  s.closePath();
  const body = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false, curveSegments: 16 });
  body.translate(0, 0, -D / 2);
  body.rotateY(Math.PI / 2); // the shape's x runs along world z; extruded along x
  b.add(mesh(body, stone, x, 0, z, true));
  // side (z-face) arches: dark recesses through the piers
  for (const sz of [-1, 1]) {
    const sa = new THREE.Shape();
    sa.moveTo(-1.3, 0);
    sa.lineTo(1.3, 0);
    sa.lineTo(1.3, 3.6);
    sa.absarc(0, 3.6, 1.3, 0, Math.PI, false);
    sa.closePath();
    const g = new THREE.ShapeGeometry(sa, 10);
    const m2 = mesh(g, deep, x, 0, z + sz * (W / 2 + 0.02));
    m2.rotation.y = sz > 0 ? 0 : Math.PI;
    b.add(m2);
  }
  // sculpture panels on the piers (both street faces), the impost band, the frieze and cornice
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.add(mesh(new THREE.BoxGeometry(0.25, 3.6, 2.2), shade, x + sx * (D / 2 + 0.12), 4.0, z + sz * (open + (W / 2 - open) / 2)));
      b.add(mesh(new THREE.BoxGeometry(0.2, 1.0, 2.6), shade, x + sx * (D / 2 + 0.1), 7.7, z + sz * (open + (W / 2 - open) / 2)));
    }
    b.add(mesh(new THREE.BoxGeometry(0.18, 0.35, W), shade, x + sx * (D / 2 + 0.09), spring - 0.1, z));
  }
  b.add(mesh(new THREE.BoxGeometry(D + 0.8, 0.55, W + 0.8), stone, x, ent + 0.27, z, true));
  b.add(mesh(new THREE.BoxGeometry(D + 0.5, 0.9, W + 0.5), shade, x, ent + 0.99, z));
  b.add(mesh(new THREE.BoxGeometry(D + 1.0, 0.4, W + 1.0), stone, x, ent + 1.64, z));
  // attic with a row of shields
  b.add(mesh(new THREE.BoxGeometry(D, 2.3, W), stone, x, ent + 3.0, z, true));
  b.add(mesh(new THREE.BoxGeometry(D + 0.4, 0.35, W + 0.4), stone, x, ent + 4.32, z));
  const shield = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 12);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const sh = mesh(shield, shade, x + sx * (D / 2 + 0.06), ent + 3.0, z - W / 2 + 0.9 + (i * (W - 1.8)) / 8);
      sh.rotation.z = Math.PI / 2;
      b.add(sh);
    }
  }
  b.collider(x - D / 2, x + D / 2, z - W / 2, z - open, 0, ent + 4.5, true);
  b.collider(x - D / 2, x + D / 2, z + open, z + W / 2, 0, ent + 4.5, true);
  b.collider(x - D / 2, x + D / 2, z - open, z + open, spring + open - 0.3, ent + 4.5);
  // gold uplight on both street faces (none in the opening)
  const skip = (zz: number) => Math.abs(zz - z) < open + 0.2;
  uplights(b, -1, x - D / 2 - 0.05, z - W / 2, z + W / 2, ent + 4.4, 0xffc070, W / 8, skip);
  uplights(b, 1, x + D / 2 + 0.05, z - W / 2, z + W / 2, ent + 4.4, 0xffc070, W / 8, skip);
}
