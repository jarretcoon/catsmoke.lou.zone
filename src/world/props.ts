import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeChaseBulbTexture, makePalmFrondTexture, makePalmTrunkTexture, makeSignTexture, rng } from './textures';
import { buildCar, buildDeuceBus } from './vehicles';

// ---------- shared material cache (identical looks share one material) ----------
const matCache = new Map<string, THREE.Material>();
export function mat(color: number, roughness = 0.7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const key = `s|${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    matCache.set(key, m);
  }
  return m;
}
export function basic(color: number, extra: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  const key = `b|${color}|${JSON.stringify(extra)}`;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, ...extra });
    matCache.set(key, m);
  }
  return m;
}

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, cast = false): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

let chaseMat: THREE.MeshBasicMaterial | null = null;
/** One shared chasing-bulb material; its texture offset steps every 0.12 s so every marquee chases. */
function marqueeMaterial(): THREE.MeshBasicMaterial {
  if (chaseMat) return chaseMat;
  const tex = makeChaseBulbTexture();
  const m = new THREE.MeshBasicMaterial({ map: tex, color: 0xfff2d8 });
  m.onBeforeRender = () => {
    tex.offset.x = (Math.floor(performance.now() / 120) % 3) / 3;
  };
  chaseMat = m;
  return m;
}

const marqueeGeos = new Map<string, THREE.BufferGeometry>();
/** Bulb quads round the edge of both faces of a w×h sign (each bulb samples one of 3 chase cells). */
function marqueeGeometry(w: number, h: number, depth: number): THREE.BufferGeometry {
  const key = `${w}|${h}|${depth}`;
  let g = marqueeGeos.get(key);
  if (g) return g;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const spacing = 0.34;
  const bs = Math.min(0.24, h * 0.08);
  const inset = bs * 0.75;
  const pts: Array<[number, number]> = [];
  const hw = w / 2 - inset;
  const hh = h / 2 - inset;
  const per = 4 * (hw + hh);
  const n = Math.max(8, Math.round(per / spacing));
  for (let i = 0; i < n; i++) {
    let d = (i / n) * per;
    if (d < 2 * hw) pts.push([-hw + d, hh]);
    else if ((d -= 2 * hw) < 2 * hh) pts.push([hw, hh - d]);
    else if ((d -= 2 * hh) < 2 * hw) pts.push([hw - d, -hh]);
    else pts.push([-hw, -hh + (d - 2 * hw)]);
  }
  for (const face of [1, -1]) {
    const z = face * (depth / 2 + 0.012);
    pts.forEach(([px, py], i) => {
      const k = i % 3;
      const u0 = k / 3 + 0.01;
      const u1 = (k + 1) / 3 - 0.01;
      const base = pos.length / 3;
      const s = bs / 2;
      // Front face winds CCW toward +z, back face mirrored in x so it winds toward -z
      const xs = face > 0 ? [px - s, px + s] : [px + s, px - s];
      pos.push(xs[0], py - s, z, xs[1], py - s, z, xs[1], py + s, z, xs[0], py + s, z);
      for (let q = 0; q < 4; q++) nor.push(0, 0, face);
      uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  marqueeGeos.set(key, g);
  return g;
}

/** Neon-tube sign board; big ones (≥ 6 m × 1.5 m) also get a chasing-bulb marquee border on both faces. */
export function neonSign(text: string, bg: string, fg: string, width = 8, height = 1.9, subtext?: string, depth = 0.28): THREE.Mesh {
  const sign = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshBasicMaterial({ map: makeSignTexture(text, bg, fg, subtext) }));
  if (width >= 6 && height >= 1.5) sign.add(new THREE.Mesh(marqueeGeometry(width, height, depth), marqueeMaterial()));
  return sign;
}

// ---------- vegetation ----------
interface PalmKit {
  trunk: THREE.MeshStandardMaterial;
  frond: THREE.MeshStandardMaterial;
  frondPink: THREE.MeshStandardMaterial;
  dates: THREE.MeshStandardMaterial;
  trunks: Map<string, THREE.BufferGeometry>;
  crowns: THREE.BufferGeometry[];
  clusters: THREE.BufferGeometry[];
}
let palmKitCache: PalmKit | null = null;

/** A drooping pinnate frond along +x: rachis arcs up then down, the two leaflet rows fold up into a V. */
function frondGeometry(len: number, droop: number, width: number, fold: number): THREE.BufferGeometry {
  const N = 8;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = t * len;
    const y = len * (0.32 * t - droop * t * t);
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + t * 1.02)), 0.65);
    pos.push(x, y + fold * w, -w, x, y, 0, x, y + fold * w, w);
    uv.push(0, t, 0.5, t, 1, t);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 3;
    const b2 = (i + 1) * 3;
    idx.push(a, a + 1, b2 + 1, a, b2 + 1, b2, a + 1, a + 2, b2 + 2, a + 1, b2 + 2, b2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function crownGeometry(variant: number): THREE.BufferGeometry {
  const R = rng(variant * 7 + 3);
  const parts: THREE.BufferGeometry[] = [];
  const n = 15;
  for (let i = 0; i < n; i++) {
    const tier = i % 3; // 0 = upright young fronds, 1 = spreading, 2 = drooping old fronds
    const az = (i / n) * Math.PI * 2 + (R() - 0.5) * 0.35;
    const len = (tier === 0 ? 2.7 : tier === 1 ? 3.4 : 3.1) + R() * 0.7;
    const droop = (tier === 0 ? 0.25 : tier === 1 ? 0.6 : 1.0) + R() * 0.3;
    const g = frondGeometry(len, droop, 0.62, 0.32);
    g.rotateZ((tier === 0 ? 0.75 : tier === 1 ? 0.22 : -0.25) + (R() - 0.5) * 0.25);
    g.rotateX((R() - 0.5) * 0.3);
    g.rotateY(az);
    g.translate(0, tier === 2 ? -0.25 : 0, 0);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

function dateClusterGeometry(variant: number): THREE.BufferGeometry {
  const R = rng(variant * 13 + 5);
  const parts: THREE.BufferGeometry[] = [];
  for (let c = 0; c < 3; c++) {
    const a = (c / 3) * Math.PI * 2 + R();
    const cx = Math.cos(a) * 0.32;
    const cz = Math.sin(a) * 0.32;
    for (let k = 0; k < 6; k++) {
      const s = new THREE.IcosahedronGeometry(0.07 + R() * 0.03, 0);
      s.translate(cx + (R() - 0.5) * 0.22, -0.35 - R() * 0.45, cz + (R() - 0.5) * 0.22);
      parts.push(s);
    }
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

/** Curved, tapering trunk with a flared foot and a boot of old frond bases under the crown. */
function trunkGeometry(h: number, lean: number): THREE.BufferGeometry {
  const radial = 8;
  const rings = 10;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const y = t * h;
    const ox = lean * h * Math.pow(t, 1.7);
    let r = 0.2 + 0.1 * Math.pow(1 - t, 5) + 0.05 * (1 - t);
    if (t > 0.88) r += 0.14 * ((t - 0.88) / 0.12);
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(ox + c * r, y, s * r);
      const n = new THREE.Vector3(c, 0.08, s).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(k / radial, y / 0.5);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let k = 0; k < radial; k++) {
      const a = j * (radial + 1) + k;
      const b2 = a + radial + 1;
      idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function palmKit(): PalmKit {
  if (palmKitCache) return palmKitCache;
  const frondTex = makePalmFrondTexture();
  palmKitCache = {
    trunk: new THREE.MeshStandardMaterial({ map: makePalmTrunkTexture(), roughness: 0.95 }),
    frond: new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 }),
    frondPink: new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.55, color: 0xff9ad6, emissive: 0xff2b9e, emissiveIntensity: 0.8 }),
    dates: mat(0xc8782a, 0.7),
    trunks: new Map(),
    crowns: [0, 1, 2, 3].map(crownGeometry),
    clusters: [0, 1].map(dateClusterGeometry),
  };
  return palmKitCache;
}

export interface PalmPiece {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  matrix: THREE.Matrix4;
  cast: boolean;
}

/**
 * The pieces of one palm (shared geometry + a transform each): ringed trunk, alpha-tested crown of
 * drooping fronds, and a date cluster. Every palm on the Strip shares 3 materials, so the static
 * batcher folds each map cell's palms into a few draw calls.
 */
export function palmPieces(height = 7.5, pinkNeon = false, seed = 0): PalmPiece[] {
  const kit = palmKit();
  const R = rng(Math.round(seed * 1000) + 17);
  const hb = Math.max(1.5, Math.round(height * 2) / 2);
  const li = Math.abs(Math.round(seed)) % 3;
  const lean = [0.025, 0.05, 0.085][li];
  const key = `${hb}|${li}`;
  let trunk = kit.trunks.get(key);
  if (!trunk) {
    trunk = trunkGeometry(hb, lean);
    kit.trunks.set(key, trunk);
  }
  const yaw = R() * Math.PI * 2;
  const base = new THREE.Matrix4().makeRotationY(yaw);
  const s = Math.min(1.1, Math.max(0.55, Math.sqrt(hb / 8)));
  const crown = base
    .clone()
    .multiply(new THREE.Matrix4().makeTranslation(lean * hb, hb, 0))
    .multiply(new THREE.Matrix4().makeRotationY(R() * Math.PI * 2))
    .multiply(new THREE.Matrix4().makeScale(s, s, s));
  return [
    { geo: trunk, mat: kit.trunk, matrix: base, cast: true },
    { geo: kit.crowns[Math.floor(R() * kit.crowns.length)], mat: pinkNeon ? kit.frondPink : kit.frond, matrix: crown, cast: true },
    { geo: kit.clusters[Math.floor(R() * kit.clusters.length)], mat: kit.dates, matrix: crown, cast: false },
  ];
}

export function palmTree(height = 7.5, pinkNeon = false, seed = 0): THREE.Group {
  const g = new THREE.Group();
  for (const p of palmPieces(height, pinkNeon, seed)) {
    const m = new THREE.Mesh(p.geo, p.mat);
    m.applyMatrix4(p.matrix);
    m.castShadow = p.cast;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

const cypressGeos = new Map<string, THREE.BufferGeometry[]>();
/** Italian cypress: a lumpy flame-shaped column with a few outer tufts, not a cone. */
export function cypressTree(h = 5.4): THREE.Group {
  const hb = Math.max(1.5, Math.round(h * 2) / 2);
  const variant = Math.round(hb * 2) % 3;
  const key = `${hb}|${variant}`;
  let geos = cypressGeos.get(key);
  if (!geos) {
    const R = rng(Math.round(hb * 100) + variant);
    const r0 = 0.5 + hb * 0.045;
    const pts: THREE.Vector2[] = [];
    const rows = 12;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const r = i === rows ? 0 : r0 * Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * Math.pow(t, 0.85))), 0.7) * (1 - 0.3 * t) + 0.02;
      pts.push(new THREE.Vector2(r, 0.7 + t * hb));
    }
    const body = new THREE.LatheGeometry(pts, 10);
    const p = body.attributes.position as THREE.BufferAttribute;
    const ph = R() * 6;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const n = 1 + 0.14 * Math.sin(a * 3 + y * 2.3 + ph) + 0.08 * Math.sin(a * 5 - y * 3.7 + ph * 2);
      p.setXYZ(i, x * n, y, z * n);
    }
    body.computeVertexNormals();
    const tufts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 7; k++) {
      const t = 0.15 + (k / 7) * 0.7;
      const a = k * 2.4 + R();
      const rr = r0 * Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * Math.pow(t, 0.85))), 0.7) * (1 - 0.3 * t);
      const tuft = new THREE.IcosahedronGeometry(0.3 + R() * 0.14, 1);
      tuft.scale(1, 1.7, 1);
      tuft.translate(Math.cos(a) * rr * 0.85, 0.7 + t * hb, Math.sin(a) * rr * 0.85);
      tufts.push(tuft);
    }
    const tuftGeo = mergeGeometries(tufts, false)!;
    for (const t of tufts) t.dispose();
    geos = [new THREE.CylinderGeometry(0.1, 0.16, 1.0, 6).translate(0, 0.5, 0), body, tuftGeo];
    cypressGeos.set(key, geos);
  }
  const g = new THREE.Group();
  g.add(mesh(geos[0], mat(0x453020, 0.9)));
  g.add(mesh(geos[1], mat(0x214a2c, 0.9), 0, 0, 0, true));
  g.add(mesh(geos[2], mat(0x2f5e36, 0.88), 0, 0, 0, true));
  return g;
}

export function planter(w: number, d: number, flowers = 0xff5e8e): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, 0.6, d), mat(0xcbbca6, 0.8), 0, 0.3, 0));
  g.add(mesh(new THREE.BoxGeometry(w + 0.12, 0.08, d + 0.12), mat(0xd8cbb6, 0.7), 0, 0.62, 0));
  g.add(mesh(new THREE.BoxGeometry(w - 0.2, 0.25, d - 0.2), mat(0x4a3a2a, 0.95), 0, 0.6, 0));
  // Leafy mounds under the flowers so it reads as planting, not a green slab
  const leaf = mat(0x2f6b34, 0.85);
  const nMound = Math.max(2, Math.floor(w * d * 0.7));
  for (let i = 0; i < nMound; i++) {
    const m = mesh(new THREE.IcosahedronGeometry(0.32, 0), leaf, ((i * 0.618) % 1 - 0.5) * (w - 0.6), 0.78, ((i * 0.382) % 1 - 0.5) * (d - 0.6));
    m.scale.set(1, 0.55, 1);
    g.add(m);
  }
  for (let i = 0; i < Math.floor(w * d * 1.5); i++) {
    g.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), mat(i % 3 ? flowers : 0xffe066, 0.7), ((i * 0.37) % 1 - 0.5) * (w - 0.5), 0.9, ((i * 0.61) % 1 - 0.5) * (d - 0.5)));
  }
  return g;
}

/** Desert landscaping bits for the median and plazas: shared rock / agave / shrub geometries. */
let desertKit: { rocks: THREE.BufferGeometry[]; agave: THREE.BufferGeometry[]; shrub: THREE.BufferGeometry[] } | null = null;
export function desertPlantKit(): { rocks: THREE.BufferGeometry[]; agave: THREE.BufferGeometry[]; shrub: THREE.BufferGeometry[] } {
  if (desertKit) return desertKit;
  const rocks = [0, 1, 2].map((v) => {
    const R = rng(v * 19 + 2);
    const g = new THREE.IcosahedronGeometry(0.4, 0);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + R() * 0.5), Math.max(-0.1, p.getY(i)) * (0.55 + R() * 0.3), p.getZ(i) * (0.8 + R() * 0.5));
    g.computeVertexNormals();
    return g;
  });
  const agave = [0, 1].map((v) => {
    const R = rng(v * 23 + 9);
    const leaves: THREE.BufferGeometry[] = [];
    const n = 11;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + R() * 0.3;
      const len = 0.55 + R() * 0.25;
      const leaf = new THREE.ConeGeometry(0.075, len, 4, 1);
      leaf.scale(1, 1, 0.35);
      leaf.translate(0, len / 2, 0);
      leaf.rotateZ(-(0.55 + (k % 2) * 0.35 + R() * 0.2));
      leaf.rotateY(a);
      leaves.push(leaf);
    }
    const core = new THREE.ConeGeometry(0.08, 0.5, 5);
    core.translate(0, 0.25, 0);
    leaves.push(core);
    const g = mergeGeometries(leaves, false)!;
    for (const l of leaves) l.dispose();
    return g;
  });
  const shrub = [0, 1].map((v) => {
    // Round desert sage: a couple of soft, lumpy domes
    const R = rng(v * 29 + 4);
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 2; k++) {
      const s = new THREE.IcosahedronGeometry(0.26 + R() * 0.08, 1);
      const p = s.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const n = 1 + (Math.sin(p.getX(i) * 23 + v) * Math.sin(p.getZ(i) * 19 + k) * 0.12);
        p.setXYZ(i, p.getX(i) * n, Math.max(-0.05, p.getY(i)) * n, p.getZ(i) * n);
      }
      s.computeVertexNormals();
      s.scale(1, 0.75, 1);
      s.translate((R() - 0.5) * 0.35 + (k ? 0.18 : -0.12), 0.06, (R() - 0.5) * 0.3);
      parts.push(s);
    }
    const g = mergeGeometries(parts, false)!;
    for (const p of parts) p.dispose();
    return g;
  });
  desertKit = { rocks, agave, shrub };
  return desertKit;
}

// ---------- street furniture ----------
/** Lantern glass for the Strip light poles; strip.ts drives its night glow. */
export const streetLampGlass = new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffd596, emissiveIntensity: 0.25, roughness: 0.25 });

/**
 * Strip-style decorative light pole: fluted bronze shaft on a stepped base, scroll brackets carrying
 * twin lantern housings with glowing glass, a ball finial, and vertical event banners.
 */
export function stripLightPole(bannerColor = 0xd4a640): { group: THREE.Group; bulbs: THREE.Mesh[] } {
  const g = new THREE.Group();
  const pole = mat(0x2a2622, 0.4, 0.7);
  const gold = mat(0x9a7a3a, 0.35, 0.8);
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.35, 12), pole, 0, 0.175, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.9, 12), pole, 0, 0.8, 0, true));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), gold, 0, 1.28, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.16, 7.4, 12), pole, 0, 5.0, 0, true));
  for (const y of [3.4, 7.4]) g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), gold, 0, y, 0));
  const bulbs: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), pole, s * 0.8, 8.45, 0);
    g.add(arm);
    // Scroll bracket under the arm
    const scroll = mesh(new THREE.TorusGeometry(0.38, 0.035, 5, 10, Math.PI), pole, s * 0.55, 8.07, 0);
    scroll.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(scroll);
    // Lantern: cap, glowing hex glass, bottom bowl
    g.add(mesh(new THREE.ConeGeometry(0.3, 0.3, 6), pole, s * 1.55, 8.42, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 6), gold, s * 1.55, 8.62, 0));
    const glass = mesh(new THREE.CylinderGeometry(0.24, 0.17, 0.5, 6), streetLampGlass, s * 1.55, 8.02, 0);
    g.add(glass);
    bulbs.push(glass);
    g.add(mesh(new THREE.CylinderGeometry(0.17, 0.08, 0.14, 6), pole, s * 1.55, 7.71, 0));
  }
  // Vertical street banners (the Strip hangs event banners on its poles)
  const banner = mat(bannerColor, 0.75, 0, { side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(0.03, 1.6, 0.7), banner, s * 0.16, 6.2, s * 0.35));
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 0.8), gold, s * 0.16, 7.02, s * 0.35));
  }
  g.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), gold, 0, 9.0, 0));
  g.add(mesh(new THREE.ConeGeometry(0.06, 0.3, 6), gold, 0, 9.28, 0));
  return { group: g, bulbs };
}

export function bollard(): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.95, 10), mat(0x3a3530, 0.4, 0.6), 0, 0.475, 0);
}

export function trashCan(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.95, 12), mat(0x2b3a2f, 0.6, 0.3), 0, 0.475, 0, true));
  g.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12), mat(0x1c241e, 0.5, 0.4), 0, 0.99, 0));
  // Banding + dome lid with the slot
  for (const y of [0.18, 0.78]) g.add(mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.05, 12), mat(0x1c241e, 0.5, 0.4), 0, y, 0));
  g.add(mesh(new THREE.SphereGeometry(0.3, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x1c241e, 0.5, 0.4), 0, 1.02, 0));
  return g;
}

/** Sand-topped ash urn — Strip smokers' meeting point. */
export function ashUrn(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.8, 12), mat(0x8a8f99, 0.3, 0.85), 0, 0.4, 0, true));
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 12), mat(0xe2d3b2, 0.95), 0, 0.81, 0));
  for (let i = 0; i < 4; i++) {
    const butt = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 5), mat(0xd59a52, 0.8), Math.cos(i * 1.7) * 0.1, 0.84, Math.sin(i * 1.7) * 0.1);
    butt.rotation.z = 1.3;
    butt.rotation.y = i;
    g.add(butt);
  }
  return g;
}

export function newsRack(colors: number[] = [0xd8352b, 0x2c6bd1, 0xf2c230, 0x2f9e57]): THREE.Group {
  const g = new THREE.Group();
  colors.forEach((c, i) => {
    const x = (i - (colors.length - 1) / 2) * 0.55;
    g.add(mesh(new THREE.BoxGeometry(0.5, 1.05, 0.45), mat(c, 0.5, 0.2), x, 0.53, 0, true));
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.3, 0.02), basic(0xf4f0e2), x, 0.82, 0.235));
    g.add(mesh(new THREE.BoxGeometry(0.44, 0.36, 0.03), mat(0x9fb4c4, 0.1, 0.3), x, 0.82, 0.25));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.04, 0.05), mat(0x2a2a2e, 0.4, 0.7), x, 0.6, 0.25));
  });
  return g;
}

export function fireHydrant(): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0xd9b21e, 0.5, 0.2);
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 10), m, 0, 0.04, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.6, 10), m, 0, 0.3, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 10), m, 0, 0.56, 0));
  g.add(mesh(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.6, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 5), m, 0, 0.76, 0));
  const nozzle = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), m, 0, 0.42, 0);
  nozzle.rotation.z = Math.PI / 2;
  g.add(nozzle);
  const front = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 8), m, 0, 0.4, 0.17);
  front.rotation.x = Math.PI / 2;
  g.add(front);
  return g;
}

export function bench(): THREE.Group {
  const g = new THREE.Group();
  const metal = mat(0x23262c, 0.4, 0.7);
  const slat = mat(0x6a4a30, 0.7);
  for (let k = 0; k < 4; k++) g.add(mesh(new THREE.BoxGeometry(1.8, 0.05, 0.1), slat, 0, 0.46, -0.18 + k * 0.12));
  for (let k = 0; k < 3; k++) g.add(mesh(new THREE.BoxGeometry(1.8, 0.1, 0.04), slat, 0, 0.58 + k * 0.14, -0.23));
  g.add(mesh(new THREE.BoxGeometry(1.7, 0.04, 0.04), metal, 0, 0.42, 0));
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.45, 0.5), metal, s * 0.8, 0.22, 0));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.45), metal, s * 0.86, 0.66, 0));
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), metal, s * 0.8, 0.7, -0.24));
  }
  return g;
}

export interface TrafficSignal {
  group: THREE.Group;
  setState: (state: 'green' | 'yellow' | 'red') => void;
}

/** Red / yellow / green lamp materials; signals that always show the same phase can share one set. */
export function signalLamps(): Record<'red' | 'yellow' | 'green', THREE.MeshBasicMaterial> {
  return {
    red: new THREE.MeshBasicMaterial({ color: 0x3a0d0a }),
    yellow: new THREE.MeshBasicMaterial({ color: 0x3a2c0a }),
    green: new THREE.MeshBasicMaterial({ color: 0x0a3a1e }),
  };
}

/** Mast-arm traffic signal; arm points along local +x over `armLength` meters. */
export function trafficSignal(armLength: number, shared?: Record<'red' | 'yellow' | 'green', THREE.MeshBasicMaterial>): TrafficSignal {
  const g = new THREE.Group();
  const pole = mat(0x8c8f94, 0.45, 0.6);
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.4, 10), pole, 0, 0.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 7.2, 10), pole, 0, 3.6, 0, true));
  g.add(mesh(new THREE.BoxGeometry(armLength, 0.18, 0.18), pole, armLength / 2, 6.9, 0));
  // Diagonal brace + push-button box
  const brace = mesh(new THREE.BoxGeometry(Math.min(2.4, armLength * 0.4), 0.08, 0.08), pole, Math.min(1.1, armLength * 0.18), 6.45, 0);
  brace.rotation.z = 0.38;
  g.add(brace);
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.2, 0.1), mat(0xe0c020, 0.5), 0, 1.1, 0.22));
  const housingMat = mat(0x1b1d22, 0.6);
  const plateMat = mat(0x111214, 0.7);
  const borderMat = mat(0xf2d21a, 0.4);
  const lampsMat = shared ?? signalLamps();
  const defs: Array<['red' | 'yellow' | 'green', number]> = [
    ['red', 0.38],
    ['yellow', 0],
    ['green', -0.38],
  ];
  const heads: number[] = [armLength * 0.45, armLength * 0.75, armLength * 0.98];
  const visor = new THREE.CylinderGeometry(0.18, 0.18, 0.13, 8, 1, true, -Math.PI / 2, Math.PI);
  visor.rotateX(-Math.PI / 2);
  for (const hx of heads) {
    g.add(mesh(new THREE.BoxGeometry(0.42, 1.2, 0.38), housingMat, hx, 6.25, 0));
    // Back plates with the reflective yellow border, both faces
    g.add(mesh(new THREE.BoxGeometry(0.78, 1.5, 0.03), borderMat, hx, 6.25, 0));
    g.add(mesh(new THREE.BoxGeometry(0.72, 1.44, 0.05), plateMat, hx, 6.25, 0));
    for (const [key, dy] of defs) {
      const m = lampsMat[key];
      g.add(mesh(new THREE.CircleGeometry(0.14, 12), m, hx, 6.25 + dy, 0.2));
      const back = mesh(new THREE.CircleGeometry(0.14, 12), m, hx, 6.25 + dy, -0.2);
      back.rotation.y = Math.PI;
      g.add(back);
      for (const f of [1, -1]) {
        const v = mesh(visor, housingMat, hx, 6.25 + dy + 0.01, f * 0.265);
        if (f < 0) v.rotation.y = Math.PI;
        g.add(v);
      }
    }
  }
  const on: Record<'red' | 'yellow' | 'green', number> = { red: 0xff2a1a, yellow: 0xffc21a, green: 0x2bff7a };
  const off: Record<'red' | 'yellow' | 'green', number> = { red: 0x3a0d0a, yellow: 0x3a2c0a, green: 0x0a3a1e };
  return {
    group: g,
    setState: (state) => {
      for (const k of ['red', 'yellow', 'green'] as const) lampsMat[k].color.setHex(k === state ? on[k] : off[k]);
    },
  };
}

// ---------- casino furniture ----------
const slotScreens = new Map<string, THREE.CanvasTexture>();
function slotScreenTexture(accent: string): THREE.CanvasTexture {
  let t = slotScreens.get(accent);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0c1020';
  ctx.fillRect(0, 0, 128, 96);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, 122, 90);
  ctx.fillStyle = '#ffffff';
  for (const x of [14, 50, 86]) ctx.fillRect(x, 24, 28, 48);
  ctx.fillStyle = accent;
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  for (const x of [28, 64, 100]) ctx.fillText('7', x, 57);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  slotScreens.set(accent, t);
  return t;
}

export function slotMachine(accentHex: string, topperHex: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.0, 1.75, 0.85), mat(0x222638, 0.32, 0.6), 0, 0.875, 0, true));
  g.add(mesh(new THREE.BoxGeometry(1.04, 0.08, 0.9), mat(0xf0be4d, 0.25, 0.85), 0, 0.82, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.62), new THREE.MeshBasicMaterial({ map: slotScreenTexture(accentHex) }));
  screen.position.set(0, 1.25, 0.43);
  g.add(screen);
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.28, 16), basic(topperHex), 0, 1.9, 0));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.22, 0.35), mat(0x30344a, 0.4, 0.5), 0, 0.85, 0.55));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 10), mat(0x8c1c28, 0.6), 0, 0.3, 1.05)); // stool
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 12), mat(0x5a0f18, 0.55), 0, 0.64, 1.05));
  return g;
}

export function rouletteTable(feltHex: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(3.6, 0.85, 1.7), mat(0x3b2116, 0.5), 0, 0.42, 0, true));
  g.add(mesh(new THREE.BoxGeometry(3.8, 0.12, 1.9), mat(0x4b1c12, 0.35), 0, 0.9, 0));
  g.add(mesh(new THREE.BoxGeometry(3.4, 0.05, 1.5), mat(feltHex, 0.9), 0, 0.97, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.14, 24), mat(0x1a1412, 0.3, 0.4), -1.3, 1.04, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 24), mat(0xa82020, 0.4), -1.3, 1.12, 0));
  g.add(mesh(new THREE.ConeGeometry(0.1, 0.2, 10), mat(0xf4c44e, 0.2, 0.9), -1.3, 1.22, 0));
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08 + (i % 3) * 0.05, 10), mat([0xe83b4d, 0x3482f6, 0xf2c23a][i % 3], 0.4), 0.2 + i * 0.22, 1.03, (i % 2 ? 0.3 : -0.3)));
  return g;
}

export function blackjackTable(feltHex: number): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.CylinderGeometry(1.7, 1.7, 0.1, 28, 1, false, -Math.PI / 2, Math.PI);
  const rail = new THREE.CylinderGeometry(1.85, 1.85, 0.14, 28, 1, false, -Math.PI / 2, Math.PI);
  g.add(mesh(new THREE.BoxGeometry(2.6, 0.85, 1.1), mat(0x3b2116, 0.5), 0, 0.42, 0.35, true));
  g.add(mesh(rail, mat(0x3a1c10, 0.35), 0, 0.9, 0));
  g.add(mesh(top, mat(feltHex, 0.9), 0, 0.96, 0));
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.2, 0.4), mat(0x15161c, 0.4), 0, 1.06, -0.15)); // shoe/rack
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + ((i + 0.5) / 5) * Math.PI;
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 10), mat(0x8c1c28, 0.6), Math.sin(a) * 2.25, 0.35, Math.cos(a) * 2.25));
  }
  return g;
}

export function crapsTable(feltHex: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(4.6, 0.8, 2.0), mat(0x3b2116, 0.5), 0, 0.4, 0, true));
  g.add(mesh(new THREE.BoxGeometry(4.8, 0.35, 2.2), mat(0x2c140b, 0.35), 0, 0.98, 0));
  g.add(mesh(new THREE.BoxGeometry(4.3, 0.05, 1.7), mat(feltHex, 0.9), 0, 0.86, 0));
  g.add(mesh(new THREE.BoxGeometry(3.6, 0.02, 0.18), basic(0xf2efe6), 0, 0.89, 0.55));
  for (const dx of [-0.2, 0.15]) {
    const die = mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), mat(0xd8202e, 0.25), dx, 0.95, 0);
    die.rotation.set(0.3, dx * 4, 0.2);
    g.add(die);
  }
  return g;
}

export function barCounter(len: number, topHex = 0x1a1a22, frontHex = 0x6b3a1e): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(len, 1.05, 0.8), mat(frontHex, 0.5), 0, 0.525, 0, true));
  g.add(mesh(new THREE.BoxGeometry(len + 0.2, 0.08, 1.0), mat(topHex, 0.15, 0.4), 0, 1.09, 0));
  for (let x = -len / 2 + 0.6; x < len / 2; x += 1.1) {
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.75, 8), mat(0xb8bcc6, 0.3, 0.8), x, 0.375, 0.85));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), mat(0x220d12, 0.6), x, 0.78, 0.85));
  }
  for (let x = -len / 2 + 0.4; x < len / 2; x += 0.5) {
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 8), mat([0x2e8b57, 0x8b4513, 0x87ceeb, 0xd2b48c][Math.abs(Math.round(x * 2)) % 4], 0.1, 0.1, { transparent: false }), x, 1.28, -0.25));
  }
  return g;
}

export function cigPack(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.24, 0.34, 0.11), mat(0xd9362b, 0.35, 0, { emissive: 0xff6224, emissiveIntensity: 0.45 })));
  g.add(mesh(new THREE.BoxGeometry(0.25, 0.1, 0.115), mat(0xf7efe0, 0.4), 0, 0.08, 0));
  for (const ox of [-0.04, 0.04]) {
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), mat(0xffffff, 0.6), ox, 0.21, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.0185, 0.0185, 0.04, 8), mat(0xc97b32, 0.7), ox, 0.26, 0));
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.33, 20), basic(0xffb347, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.16;
  g.add(ring);
  return g;
}

export function flamingoBird(phase: number): THREE.Group {
  const g = new THREE.Group();
  const pink = mat(0xff7aa8, 0.45);
  g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.7, 6), mat(0xff9b85, 0.6), 0, 0.35, 0));
  const body = mesh(new THREE.SphereGeometry(0.22, 12, 10), pink, 0, 0.74, 0);
  body.scale.set(0.85, 0.8, 1.35);
  g.add(body);
  const neck = mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.52, 8), pink, 0, 1.02, 0.16);
  neck.rotation.x = 0.28;
  g.add(neck);
  g.add(mesh(new THREE.SphereGeometry(0.075, 8, 8), pink, 0, 1.27, 0.24));
  const beak = mesh(new THREE.ConeGeometry(0.03, 0.12, 6), mat(0x18181f, 0.5), 0, 1.22, 0.32);
  beak.rotation.x = Math.PI * 0.72;
  g.add(beak);
  g.rotation.y = phase;
  return g;
}

// ---------- vehicles ----------
// Shaped bodies live in ./vehicles; these wrappers keep the old entry points.
export type CarKind = 'taxi' | 'limo' | 'suv' | 'sedan' | 'sport';

export function car(kind: CarKind, color: number): { group: THREE.Group; length: number } {
  return buildCar(kind, color);
}

/**
 * RTC "The Deuce" double-decker (Alexander Dennis Enviro500-style).
 * Livery is passed in so it can match the current paint scheme.
 */
export function deuceBus(livery: { body: number; band: number; accent: number }): { group: THREE.Group; wheels: THREE.Mesh[]; deckOffset: THREE.Vector3 } {
  return buildDeuceBus(livery);
}
