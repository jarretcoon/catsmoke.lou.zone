import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from './builder';
import { tower } from './buildings';
import { basic, bench, mat, mesh, palmTree, planter, trashCan } from './props';
import { bulbPath, bulbRect, letterFace, letters, neonFace, neonStroke, neonText } from './signKit';
import { makePaverTexture } from './textures';

/*
 * The real neighbours of Circus Circus and Slots-A-Fun (west side of Las Vegas Blvd, Nov 2026), and
 * the pieces of Circus Circus a passer-by actually sees from the sidewalk. South → north:
 *   Resorts World Ave · the vacant ex-Westward Ho lot · McDonald's (24/7, drive-thru) · Slots-A-Fun ·
 *   Circus Circus main entrance (signalised, opposite Elvis Presley Blvd) · the 1983 YESCO porte-cochère
 *   (arched canopy of red and white bulbs, CIRCUS CIRCUS in white bulb letters on the peak) under the
 *   pink-and-white big top · Lucky the Clown (perpendicular to the road) · Circus Circus Dr (with the
 *   dead Sky Shuttle track overhead) · Travelodge · a small vacant storefront · Sky Las Vegas (CVS at
 *   street level) · the Skyrise tower behind. Across the road north of the Fontainebleau: the empty
 *   ex-Wet 'n Wild lot. Everything is procedural (canvas + geometry); names are plain fan-project signage.
 */

const HALF_PI = Math.PI / 2;

/** Merge static pieces into one mesh per material (cheap before the static bake too). */
function merge(b: WorldBuilder, objs: THREE.Object3D[], cast = true): void {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const o of objs) {
    o.updateMatrixWorld(true);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()) as THREE.BufferGeometry;
      g.clearGroups();
      g.applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
      const key = m.material as THREE.Material;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
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

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}

function boxM(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  return at(mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z, ry);
}

export function paved(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, base: string, joint: string, tile = 4): void {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  const m = new THREE.MeshStandardMaterial({ map: makePaverTexture(base, joint, 4), roughness: 0.85 });
  m.map!.repeat.set(w / tile, d / tile);
  b.floor((x0 + x1) / 2, (z0 + z1) / 2, w, d, m, 0.012);
}

/** Lit glass storefront: dark by day, warm interior glow at night (one shared material for the block). */
let shopGlassM: THREE.MeshStandardMaterial | null = null;
function shopGlass(b: WorldBuilder): THREE.MeshStandardMaterial {
  return (shopGlassM ??= b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x1a232c, roughness: 0.08, metalness: 0.5, emissive: 0xffd9a8, emissiveIntensity: 0.05 }), 0.05, 0.48));
}

/** The red neon glow shared by the Sky Shuttle stripes and the Slots-A-Fun cabinet rings. */
let redNeonM: THREE.MeshStandardMaterial | null = null;
export function redNeonGlow(b: WorldBuilder): THREE.MeshStandardMaterial {
  return (redNeonM ??= b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xc81030, roughness: 0.4, emissive: 0xff1838, emissiveIntensity: 0.15 }), 0.15, 1.1));
}

/**
 * Paint "bulb letters": the text cut into a grid of round lamps over a cabinet background, the way the
 * Circus Circus porte-cochère and Slots-A-Fun spell their names.
 */
export function bulbLetters(text: string, bg: string, bulb: string, rim: string, pitch = 0.11) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
    ctx.save();
    ctx.fillStyle = bulb;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let px = h * 0.78;
    ctx.font = `900 ${px}px "Arial Black", Impact, sans-serif`;
    const tw = ctx.measureText(text).width;
    if (tw > w * 0.9) {
      px *= (w * 0.9) / tw;
      ctx.font = `900 ${px}px "Arial Black", Impact, sans-serif`;
    }
    ctx.fillText(text, w / 2, h * 0.54);
    // keep only round lamps inside the letters (one path: destination-in clears everything outside it)
    ctx.globalCompositeOperation = 'destination-in';
    const step = Math.max(4, h * pitch);
    ctx.beginPath();
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        ctx.moveTo(x + step * 0.38, y);
        ctx.arc(x, y, step * 0.38, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    // the cabinet goes in behind
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(3, h * 0.06);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  };
}

// =============================================================== the porte-cochère (YESCO, 1983)
/**
 * A gently arched, cantilevered canopy over the drive in front of the big top's door, fronted in red
 * with rows of chasing white bulbs, a lit bulb soffit underneath and CIRCUS CIRCUS in white bulb
 * letters on the front peak. ex = the building face (canopy root), front = the canopy's Strip edge.
 */
export function buildPorteCochere(b: WorldBuilder, ex: number, front: number, cz: number, halfW: number): void {
  const L = front - ex;
  const bot0 = 5.3; // clearance at the ends
  const botC = 7.0; // and under the peak
  const top0 = 6.5;
  const topC = 9.0;
  // arch curves in (u = along the front, v = height); quadratic: y(u) = y0 + (yc - y0) * (1 - (u/halfW)^2)
  const yb = (u: number) => bot0 + (botC - bot0) * (1 - (u / halfW) ** 2);
  const yt = (u: number) => top0 + (topC - top0) * (1 - (u / halfW) ** 2);
  const shape = new THREE.Shape();
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const u = -halfW + (i / N) * halfW * 2;
    if (i === 0) shape.moveTo(u, yb(u));
    else shape.lineTo(u, yb(u));
  }
  for (let i = N; i >= 0; i--) {
    const u = -halfW + (i / N) * halfW * 2;
    shape.lineTo(u, yt(u));
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false, curveSegments: 1 });
  // shape u → world -z after the turn; extrude +z → world +x
  geo.rotateY(HALF_PI);
  geo.translate(ex, 0, cz);
  const capM = mat(0xc4102c, 0.45, 0.2);
  const shellM = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xfbf2f4, roughness: 0.5, emissive: 0xffe2c8, emissiveIntensity: 0.06 }), 0.06, 0.55);
  const canopy = new THREE.Mesh(geo, [capM, shellM]);
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  b.add(canopy);

  // Front fascia: three arched rows of chasing bulbs + a pink neon line between them
  const fascia = new THREE.Group();
  const row = (f: number): Array<[number, number]> => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 32; i++) {
      const u = -halfW + 0.3 + (i / 32) * (halfW * 2 - 0.6);
      pts.push([u, yb(u) + (yt(u) - yb(u)) * f]);
    }
    return pts;
  };
  for (const f of [0.18, 0.5, 0.82]) fascia.add(bulbPath(row(f), false, 0.34, 0.2, 0.03));
  fascia.add(
    neonFace(b, halfW * 2, topC - bot0 + 0.6, (ctx, pw, ph) => {
      const sx = pw / (halfW * 2);
      const sy = ph / (topC - bot0 + 0.6);
      for (const f of [0.34, 0.66]) {
        const p = new Path2D();
        for (let i = 0; i <= 40; i++) {
          const u = -halfW + 0.3 + (i / 40) * (halfW * 2 - 0.6);
          const y = yb(u) + (yt(u) - yb(u)) * f;
          const X = (u + halfW) * sx;
          const Y = (topC + 0.3 - y) * sy;
          if (i === 0) p.moveTo(X, Y);
          else p.lineTo(X, Y);
        }
        neonStroke(ctx, p, '#ff2a5a', Math.max(2, ph * 0.02));
      }
    })
  );
  fascia.children[fascia.children.length - 1].position.set(0, (topC + 0.3 + bot0 - 0.3) / 2, 0.05);
  fascia.rotation.y = HALF_PI;
  fascia.position.set(front, 0, cz);
  b.add(fascia);

  // Soffit: rows of bulbs following the arch, facing down
  const soffit = new THREE.Group();
  for (let zi = -halfW + 0.9; zi <= halfW - 0.9; zi += 1.3) {
    const h = yb(zi) - 0.04;
    soffit.add(at(bulbPath([[0.6, 0], [L - 0.6, 0]], false, 0.62, 0.18, 0), 0, h, cz - zi));
  }
  soffit.children.forEach((c) => {
    c.rotation.x = HALF_PI;
    c.position.x = ex;
  });
  b.add(soffit);

  // CIRCUS CIRCUS in white bulb letters on a red crest over the peak (both faces: the drive sees it too)
  const crestW = halfW * 1.5;
  const crestH = 2.1;
  const crest = new THREE.Group();
  crest.add(boxM(crestW, crestH, 0.5, mat(0xb80e28, 0.5, 0.2), 0, 0, 0));
  const face = letterFace(b, crestW - 0.2, crestH - 0.2, bulbLetters('CIRCUS CIRCUS', '#a80c24', '#fff4dc', '#ffd23a', 0.1), 0.5);
  crest.add(face);
  crest.add(bulbRect(crestW, crestH, 0.5, 0.12, true, 0.32, 0.18));
  crest.rotation.y = HALF_PI;
  crest.position.set(front - 0.6, topC + crestH / 2 - 0.15, cz);
  b.add(crest);

  b.zone('Circus Circus Porte-Cochère', ex, front + 1, cz - halfW, cz + halfW);
}

/** The backlit clown-face CASINO ENTRANCE sign, outlined in blue neon (beside the porte-cochère). */
export function casinoEntranceClown(b: WorldBuilder, x: number, y: number, z: number, ry: number): void {
  const g = new THREE.Group();
  const R = 1.5;
  g.add(at(mesh(new THREE.CylinderGeometry(R, R, 0.35, 32), mat(0x1c1c30, 0.5, 0.3)), 0, 0, 0).rotateX(HALF_PI));
  const face = letterFace(b, R * 1.9, R * 1.9, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2;
    ctx.fillStyle = '#f6e8ff';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // orange hair puffs, white face, blue eye shadow, red nose and smile
    ctx.fillStyle = '#ff7a1a';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + s * r * 0.58, cy - r * 0.18, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.08, r * 0.5, r * 0.56, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#3a7ae8';
      ctx.beginPath();
      ctx.ellipse(cx + s * r * 0.2, cy - r * 0.26, r * 0.12, r * 0.09, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#101010';
      ctx.beginPath();
      ctx.arc(cx + s * r * 0.2, cy - r * 0.2, r * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#e0101e';
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.02, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d0102a';
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.06, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // CASINO / ENTRANCE banner across the bottom
    ctx.fillStyle = '#d0102a';
    ctx.fillRect(cx - r * 0.82, cy + r * 0.48, r * 1.64, r * 0.34);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(r * 0.2)}px "Arial Black", Arial, sans-serif`;
    ctx.fillText('CASINO ENTRANCE', cx, cy + r * 0.66, r * 1.56);
  });
  face.position.z = 0.19;
  g.add(face);
  const ring = neonFace(b, R * 2.2, R * 2.2, (ctx, w, h) => {
    const p = new Path2D();
    p.arc(w / 2, h / 2, w * 0.45, 0, Math.PI * 2);
    neonStroke(ctx, p, '#2a6aff', Math.max(3, w * 0.018));
  });
  ring.position.z = 0.21;
  g.add(ring);
  b.add(g, x, y, z, ry);
}

/** A scalloped pink tent valance round the top of a Circus Circus tower (w along x, d along z). */
let valanceMat: THREE.MeshStandardMaterial | null = null;
export function towerValance(b: WorldBuilder, x: number, z: number, w: number, d: number, top: number): void {
  const tex = valanceMat ? null : (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fbf4f6';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ef3f8f';
    ctx.fillRect(0, 0, 256, 30);
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(i * 32 + 16, 30, 16, 0, Math.PI);
      ctx.fill();
    }
    ctx.clearRect(0, 50, 256, 14);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  })();
  const m = (valanceMat ??= new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, alphaTest: 0.5, side: THREE.DoubleSide }));
  const h = 2.4;
  const parts: THREE.Object3D[] = [];
  for (const [len, px, pz, ry] of [
    [w, x, z + d / 2 + 0.12, 0],
    [w, x, z - d / 2 - 0.12, Math.PI],
    [d, x + w / 2 + 0.12, z, HALF_PI],
    [d, x - w / 2 - 0.12, z, -HALF_PI],
  ] as Array<[number, number, number, number]>) {
    const g = new THREE.PlaneGeometry(len, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 4));
    parts.push(at(new THREE.Mesh(g, m), px, top - h / 2 + 0.2, pz, ry));
  }
  merge(b, parts, false);
}

// =============================================================== chain-link + windscreen fence
function windscreenFence(objs: THREE.Object3D[], x0: number, z0: number, x1: number, z1: number, h = 2.2): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(-(z1 - z0), x1 - x0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  objs.push(at(mesh(new THREE.BoxGeometry(len, h - 0.15, 0.04), mat(0x26352a, 0.95)), cx, (h - 0.15) / 2 + 0.05, cz, ry));
  objs.push(at(mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 4).rotateZ(HALF_PI), mat(0x9a9ea4, 0.4, 0.7)), cx, h, cz, ry));
  const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    objs.push(mesh(new THREE.CylinderGeometry(0.04, 0.04, h + 0.05, 5), mat(0x9a9ea4, 0.4, 0.7), x0 + (x1 - x0) * t, (h + 0.05) / 2, z0 + (z1 - z0) * t));
  }
}

function weeds(objs: THREE.Object3D[], x0: number, x1: number, z0: number, z1: number, n: number, seed: number): void {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const sage = mat(0x7a8a5a, 0.95);
  const dry = mat(0xa89a6a, 0.95);
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0);
    const z = z0 + r() * (z1 - z0);
    const k = 0.35 + r() * 0.5;
    const o = mesh(new THREE.IcosahedronGeometry(k, 0), r() > 0.5 ? sage : dry, x, k * 0.55, z);
    o.scale.y = 0.6;
    objs.push(o);
  }
}

// =============================================================== McDonald's + the vacant ex-Westward Ho lot
export function buildSouthNeighbours(b: WorldBuilder, zS: number, zN: number): void {
  // zS = Resorts World Ave side (south, larger z), zN = Slots-A-Fun's south wall
  const objs: THREE.Object3D[] = [];
  // ---- the vacant lot (Westward Ho, razed 2006): dirt, weeds, windscreen fence along the sidewalk
  const lotN = zN + 12.5;
  // (Resorts World Ave now takes this strip: crossRoads.ts passes zS at the lot's north edge and the lot is skipped)
  if (zS - lotN > 4) buildWestwardHoLot(b, objs, zS, lotN);
  // ---- McDonald's: charcoal box, wood-slat bays, the yellow arch blade, glass to the Strip, drive-thru
  buildMcDonalds(b, objs, zS, zN, lotN);
}

function buildWestwardHoLot(b: WorldBuilder, objs: THREE.Object3D[], zS: number, lotN: number): void {
  b.floor(-40, (zS + lotN) / 2, 42, zS - lotN, mat(0xa8926e, 0.98), 0.014);
  windscreenFence(objs, -19.6, zS - 0.6, -19.6, lotN + 0.4);
  windscreenFence(objs, -19.6, lotN + 0.4, -60, lotN + 0.4);
  weeds(objs, -58, -22, lotN + 1.5, zS - 1.5, 26, 77);
  b.collider(-19.9, -19.3, lotN, zS - 0.4, 0, 2.2, true);
  b.collider(-60, -19.3, lotN + 0.1, lotN + 0.7, 0, 2.2, true);
  const lotSign = letters(b, 'AVAILABLE', 5.2, 1.3, { style: 'block', fill: '#ffffff', bg: '#2a4a8a', sub: 'PRIME STRIP FRONTAGE', subFill: '#ffd23a', rule: '#ffffff' });
  b.add(lotSign, -20.0, 3.3, (zS + lotN) / 2, HALF_PI);
  objs.push(boxM(0.12, 3.4, 0.12, mat(0x9a9ea4, 0.4, 0.7), -20.2, 1.7, (zS + lotN) / 2 - 2), boxM(0.12, 3.4, 0.12, mat(0x9a9ea4, 0.4, 0.7), -20.2, 1.7, (zS + lotN) / 2 + 2));
  b.zone('Vacant lot (former Westward Ho)', -60, -19, lotN, zS);
}

function buildMcDonalds(b: WorldBuilder, objs: THREE.Object3D[], zS: number, zN: number, lotN: number): void {
  const mz = (lotN + zN) / 2 - 0.4;
  const mx0 = -24.5;
  const mx1 = -38;
  const md = lotN - zN - 2.2;
  const charcoal = mat(0x34353a, 0.8);
  const wood = mat(0x9a6a3e, 0.75);
  const yellow = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xffc72c, roughness: 0.45, emissive: 0xffb000, emissiveIntensity: 0.04 }), 0.04, 0.35);
  const red = mat(0xda291c, 0.5);
  const glass = shopGlass(b);
  b.box((mx0 + mx1) / 2, 0, mz, mx0 - mx1, 5.2, md, charcoal, true);
  objs.push(boxM(0.08, 3.0, md - 2.2, glass, mx0 + 0.05, 1.7, mz));
  objs.push(boxM(0.3, 0.5, md + 0.2, wood, mx0 + 0.1, 5.4, mz));
  for (const s of [-1, 1]) objs.push(boxM(0.25, 5.2, 0.9, wood, mx0 + 0.1, 2.6, mz + s * (md / 2 - 0.45)));
  // the yellow arch blade rising over the entrance corner
  const blade = new THREE.Shape();
  blade.moveTo(-1.2, 0);
  blade.lineTo(1.2, 0);
  blade.quadraticCurveTo(1.25, 6.6, 0, 7.4);
  blade.quadraticCurveTo(-1.25, 6.6, -1.2, 0);
  const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.5, bevelEnabled: false });
  objs.push(at(new THREE.Mesh(bg, yellow), mx0 + 0.2, 0, mz + md / 2 - 1.6, HALF_PI));
  objs.push(boxM(0.18, 0.35, md - 1, red, mx0 + 0.12, 4.6, mz));
  // roof equipment
  for (const dz of [-2, 1.5]) objs.push(boxM(2.2, 1.0, 1.6, mat(0xb8bcc2, 0.5, 0.4), (mx0 + mx1) / 2 - 1, 5.7, mz + dz));
  // wordmark on the parapet (Strip face) and over the side door (sidewalk view)
  const word = letters(b, "McDonald's", 6.4, 1.2, { style: 'sans', fill: '#ffc72c', edge: '#1a1a1a', edgeW: 3 });
  b.add(word, mx0 + 0.32, 6.3, mz - 0.8, HALF_PI);
  const sideM = letters(b, "McDonald's", 4.2, 0.9, { style: 'sans', fill: '#ffc72c', edge: '#1a1a1a', edgeW: 3 });
  b.add(sideM, (mx0 + mx1) / 2, 4.3, mz + md / 2 + 0.04, 0);
  // patio: two tables with red umbrellas, a trash can
  for (const [tx, tz] of [
    [-22.3, mz - 2.5],
    [-22.3, mz + 1.5],
  ]) {
    objs.push(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 14), mat(0xd8d8d0, 0.5, 0.4), tx, 0.75, tz));
    objs.push(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), mat(0x8a8a8a, 0.4, 0.6), tx, 1.2, tz));
    objs.push(mesh(new THREE.ConeGeometry(1.3, 0.5, 8), red, tx, 2.45, tz));
    b.collider(tx - 0.5, tx + 0.5, tz - 0.5, tz + 0.5, 0, 0.78);
  }
  objs.push(at(trashCan(), -22.0, 0, mz + 3.5));
  // drive-thru lane round the back with the menu board
  b.floor(-41.5, mz, 4.2, md + 6, mat(0x2b2b30, 0.85), 0.016);
  objs.push(boxM(0.3, 2.0, 2.6, charcoal, -39.6, 1.0, mz + 1));
  const menu = letters(b, 'DRIVE THRU', 2.4, 1.6, { style: 'block', fill: '#ffffff', bg: '#da291c', sub: 'OPEN 24 HOURS', subFill: '#ffc72c' });
  b.add(menu, -39.43, 1.4, mz + 1, HALF_PI);
  // the arches pylon by the sidewalk (cabinet faces up and down the Strip)
  const py = 8.2;
  objs.push(boxM(0.45, py, 0.45, mat(0x8a8d92, 0.4, 0.6), -20.6, py / 2, zN + 1.4));
  const cab = new THREE.Group();
  cab.add(boxM(3.4, 3.0, 0.5, red, 0, 0, 0));
  cab.add(
    letterFace(b, 3.2, 2.8, (ctx, w, h) => {
      ctx.fillStyle = '#da291c';
      ctx.fillRect(0, 0, w, h);
      // the double arch
      ctx.strokeStyle = '#ffc72c';
      ctx.lineCap = 'butt';
      ctx.lineWidth = w * 0.09;
      const base = h * 0.78;
      const top = h * 0.14;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(w / 2, base * 0.66);
        ctx.bezierCurveTo(w / 2 + s * w * 0.06, top, w / 2 + s * w * 0.3, top - h * 0.02, w / 2 + s * w * 0.33, base);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(h * 0.12)}px "Segoe UI", Arial, sans-serif`;
      ctx.fillText('OPEN 24 HOURS', w / 2, h * 0.9, w * 0.9);
    }, 0.5)
  );
  b.add(cab, -20.6, py + 1.4, zN + 1.4, 0);
  b.collider(-20.85, -20.35, zN + 1.15, zN + 1.65, 0, py, true);
  merge(b, objs, false);
  b.building((mx0 + mx1) / 2, mz, mx0 - mx1, md, '#da291c', "McDonald's");
  b.zone("McDonald's (Circus Circus)", -44, -19, zN, lotN);
}

// =============================================================== Circus Circus Dr and north to Sky Las Vegas
export function buildNorthNeighbours(b: WorldBuilder, zDr: number, zEnd: number): void {
  const objs: THREE.Object3D[] = [];
  const zA = zDr - 9; // north curb of Circus Circus Dr

  // ---- the dead Sky Shuttle: a white beam on T-columns along the drive, red neon stripes, a dark bulb row
  const beamY = 7.6;
  const beamZ = zDr + 4.2;
  const white = mat(0xf2ecee, 0.6);
  const stripe = redNeonGlow(b);
  const xs0 = -78;
  const xs1 = -40;
  objs.push(boxM(xs1 - xs0, 1.3, 1.8, white, (xs0 + xs1) / 2, beamY, beamZ));
  for (const s of [-1, 1]) objs.push(boxM(xs1 - xs0, 0.16, 0.06, stripe, (xs0 + xs1) / 2, beamY + 0.2, beamZ + s * 0.93));
  // the turn north over the drive into the Skyrise
  objs.push(boxM(1.8, 1.3, beamZ - (zA - 6), white, xs0 - 0.9, beamY, (beamZ + zA - 6) / 2));
  for (const s of [-1, 1]) objs.push(boxM(0.06, 0.16, beamZ - (zA - 6), stripe, xs0 - 0.9 + s * 0.93, beamY + 0.2, (beamZ + zA - 6) / 2));
  const colZ = zDr + 7.7;
  for (const x of [-44, -58, -72]) {
    objs.push(boxM(0.9, beamY - 0.6, 0.9, white, x, (beamY - 0.6) / 2, colZ));
    objs.push(boxM(0.9, 0.6, colZ - beamZ + 0.45, white, x, beamY - 0.7, (colZ + beamZ) / 2));
    b.collider(x - 0.45, x + 0.45, colZ - 0.45, colZ + 0.45, 0, beamY, true);
  }
  // the old station canopy hanging off the casino's north wall
  objs.push(boxM(4.2, 0.4, 3.0, white, xs1 + 1.6, beamY + 0.85, beamZ));
  b.zone('Circus Circus Dr (Sky Shuttle overhead)', -90, -19, zDr - 7, zDr + 7);

  // ---- Travelodge: two-storey motel, exterior walkway, teal doors, lobby box at the Strip end
  const tz0 = zA - 1;
  const tz1 = tz0 - 15;
  const cream = mat(0xece2cf, 0.85);
  const teal = mat(0x1f7a8a, 0.6);
  const rail = mat(0xe8e8e8, 0.5, 0.3);
  const roof = mat(0x6a4a3a, 0.8);
  const wingX0 = -29;
  const wingX1 = -54;
  const wingZ = tz1 + 4.5;
  b.box((wingX0 + wingX1) / 2, 0, wingZ, wingX0 - wingX1, 6.2, 9, cream, true);
  objs.push(boxM(wingX0 - wingX1 + 0.6, 0.5, 9.6, roof, (wingX0 + wingX1) / 2, 6.45, wingZ));
  // second-floor walkway on the drive side + railing, stairs at the west end
  const wz = wingZ + 4.5 + 0.9;
  objs.push(boxM(wingX0 - wingX1, 0.22, 1.8, mat(0xcfc6b4, 0.85), (wingX0 + wingX1) / 2, 3.1, wz));
  objs.push(boxM(wingX0 - wingX1, 0.06, 0.06, rail, (wingX0 + wingX1) / 2, 4.1, wz + 0.88));
  for (let x = wingX1 + 0.5; x <= wingX0 - 0.3; x += 2.4) {
    objs.push(boxM(0.08, 1.0, 0.08, rail, x, 3.7, wz + 0.88));
    objs.push(boxM(0.14, 3.0, 0.14, rail, x, 1.5, wz + 0.88));
  }
  // doors + windows (both floors)
  const lit = shopGlass(b);
  for (let x = wingX1 + 1.6; x < wingX0 - 0.8; x += 3.0) {
    for (const y of [1.1, 4.25]) {
      objs.push(boxM(0.95, 2.0, 0.06, teal, x, y, wingZ + 4.53));
      objs.push(boxM(1.1, 0.9, 0.06, lit, x + 1.2, y + 0.35, wingZ + 4.53));
    }
  }
  // lobby
  b.box(-24.5, 0, tz1 + 6.5, 7, 4.6, 11, cream, true);
  objs.push(boxM(0.08, 2.6, 8, lit, -20.95, 1.5, tz1 + 6.5));
  objs.push(boxM(2.6, 0.3, 4.5, teal, -19.9, 3.2, tz1 + 8.2));
  // motel lot in front of the rooms
  b.floor(-40, (tz0 + wingZ + 5.4) / 2, 24, tz0 - (wingZ + 5.4), mat(0x2f2f34, 0.88), 0.014);
  for (let x = -31; x > -54; x -= 2.8) objs.push(boxM(0.12, 0.02, 4.4, basic(0xd8d4c8), x, 0.03, tz0 - 3));
  // pylon sign (both faces) + VACANCY neon
  const tpH = 7.8;
  objs.push(boxM(0.5, tpH, 0.5, mat(0x6a6e74, 0.4, 0.6), -20.6, tpH / 2, tz0 - 1.2));
  b.collider(-20.85, -20.35, tz0 - 1.45, tz0 - 0.95, 0, tpH, true);
  const tSign = new THREE.Group();
  tSign.add(boxM(4.6, 2.2, 0.45, mat(0x0a3a8a, 0.5, 0.2), 0, 0, 0));
  tSign.add(letters(b, 'Travelodge', 4.3, 1.9, { style: 'sans', fill: '#ffffff', sub: 'BY WYNDHAM', subFill: '#ffd23a', bg: '#0b4aa8', scale: 0.56 }, 0.45));
  b.add(tSign, -20.6, tpH + 1.1, tz0 - 1.2, 0);
  const vac = neonText(b, 'VACANCY', 2.6, 0.7, 'sans', '#ff2a3a', 0.2);
  b.add(vac, -20.6, tpH - 1.0, tz0 - 1.2, 0);
  objs.push(boxM(2.8, 0.8, 0.2, mat(0x141414, 0.6), -20.6, tpH - 1.0, tz0 - 1.2));
  b.building((wingX0 + wingX1) / 2, wingZ, wingX0 - wingX1, 9, '#ece2cf', 'Travelodge');
  b.zone('Travelodge (2830 Las Vegas Blvd S)', -56, -19, tz1, tz0 + 0.5);

  // ---- small vacant storefront + scrap of empty lot
  const sz0 = tz1 - 1;
  const sz1 = sz0 - 8;
  b.box(-29, 0, (sz0 + sz1) / 2, 12, 4.2, sz0 - sz1, mat(0xd8c8a8, 0.9), true);
  objs.push(boxM(0.08, 2.4, sz0 - sz1 - 2, mat(0x1e2226, 0.15, 0.4), -22.95, 1.4, (sz0 + sz1) / 2));
  objs.push(boxM(0.5, 0.6, sz0 - sz1 + 0.4, mat(0xb8a888, 0.85), -22.8, 4.4, (sz0 + sz1) / 2));
  const lease = letters(b, 'FOR LEASE', 4.4, 1.1, { style: 'block', fill: '#c81020', bg: '#ffffff', sub: 'RETAIL • STRIP FRONTAGE', subFill: '#1a1a1a', rule: '#c81020' });
  b.add(lease, -22.7, 3.3, (sz0 + sz1) / 2, HALF_PI);
  b.floor(-46, (sz0 + sz1) / 2, 22, sz0 - sz1, mat(0xa8926e, 0.98), 0.014);
  weeds(objs, -56, -36, sz1 + 1, sz0 - 1, 10, 91);
  b.zone('Vacant storefront', -56, -19, sz1, sz0);

  // ---- Sky Las Vegas (45 floors): blue-green glass on a white frame, CVS on the street floor
  const kz0 = sz1 - 1;
  const kz1 = zEnd + 1.5;
  const kzc = (kz0 + kz1) / 2;
  const skyFacade = { wall: '#e8eef2', mullion: '#f4f8fa', glass: '#2a5a6a', lit: '#e8f2ff', cols: 10, rows: 30, style: 2 as const, seed: 611 };
  tower(b, { x: -38, z: kzc + 0.5, w: 16, d: kz0 - kz1 - 4, h: 52, y: 6, facade: skyFacade, accent: 0x8fd0e8 });
  b.box(-32, 0, kzc, 21, 6, kz0 - kz1, mat(0xe4e2dc, 0.7), true);
  // CVS storefront: glass wall to the Strip, red band, red wordmark
  objs.push(boxM(0.1, 3.4, kz0 - kz1 - 3, shopGlass(b), -21.45, 1.9, kzc));
  objs.push(boxM(0.4, 1.0, kz0 - kz1 - 1, mat(0xcc0000, 0.5), -21.3, 4.3, kzc));
  const cvs = letters(b, 'CVS pharmacy', 6.4, 0.9, { style: 'sans', fill: '#ffffff' });
  b.add(cvs, -21.07, 4.3, kzc, HALF_PI);
  const cvsBlade = letters(b, 'CVS', 1.4, 0.8, { style: 'block', fill: '#ffffff', bg: '#cc0000' }, 0.2);
  b.add(cvsBlade, -20.4, 3.4, kz0 - 1.2, 0);
  objs.push(boxM(0.06, 0.06, 0.8, mat(0x8a8a8a, 0.4, 0.6), -20.4, 3.95, kz0 - 1.2 + 0.0));
  // tower crown wordmark
  const skyWord = letters(b, 'SKY', 5, 2, { style: 'thin', fill: '#ffffff' });
  b.add(skyWord, -38 + 8.08, 52 + 6 - 3, kzc, HALF_PI);
  b.building(-32, kzc, 21, kz0 - kz1, '#9ad0e0', 'Sky Las Vegas');
  b.zone('Sky Las Vegas (CVS)', -50, -19, kz1, kz0);

  // ---- sidewalk furniture up this stretch
  for (const z of [tz0 - 6, sz0 - 4, kz0 - 8]) objs.push(at(bench(), -18.4, 0, z, -HALF_PI));
  for (const z of [tz0 - 9.5, kz0 - 12]) objs.push(at(trashCan(), -18.5, 0, z));
  for (const z of [tz0 - 4, kz1 + 3]) objs.push(at(palmTree(7.2, false, Math.round(-z)), -20.0, 0, z));
  objs.push(at(planter(1.6, 3.2, 0xffc72c), -21.0, 0, kz1 + 6));
  merge(b, objs, false);

  // ---- east side north of the Fontainebleau: the empty ex-Wet 'n Wild lot
  const eObjs: THREE.Object3D[] = [];
  const ez0 = -822;
  b.floor(60, (ez0 + zEnd) / 2, 82, ez0 - zEnd, mat(0xb09a76, 0.98), 0.014);
  windscreenFence(eObjs, 19.6, ez0, 19.6, zEnd + 0.5);
  weeds(eObjs, 24, 96, zEnd + 2, ez0 - 2, 30, 133);
  b.collider(19.3, 19.9, zEnd, ez0, 0, 2.2, true);
  merge(b, eObjs, false);
  b.zone("Former Wet 'n Wild site (vacant)", 19, 100, zEnd, ez0);
}


// =============================================================== east side: the strip mall north of Convention Center Dr
/**
 * Between Convention Center Dr and the Peppermill (east side, opposite Resorts World): a one-storey
 * row of everyday stores with a parking row in front — Walgreens on the corner, Denny's (24/7),
 * 7-Eleven and Ross, north to the Peppermill — plus the multi-tenant pylon by the sidewalk.
 * zS = the south end (Convention Center Dr side, larger z), zN = the north end.
 */
export function buildEastStripMall(b: WorldBuilder, zS: number, zN: number): void {
  const objs: THREE.Object3D[] = [];
  const x0 = 33.5; // shopfronts face west, to the Strip
  const depth = 13;
  const H = 5.6;
  const glass = shopGlass(b);
  type Store = { w: number; wall: number; band?: number; sign: (w: number) => THREE.Object3D; zone: string; stripes?: number[] };
  const stores: Store[] = [
    {
      w: 4.6,
      wall: 0xd9c9ab,
      sign: (w) => letters(b, 'Walgreens', w - 0.6, 1.3, { style: 'script', fill: '#e31837', bg: '#ffffff', sub: 'PHARMACY • 24 HOURS', subFill: '#e31837', scale: 0.62 }),
      zone: 'Walgreens (24 hours)',
    },
    {
      w: 4.2,
      wall: 0xefe4cc,
      band: 0xffc20e,
      sign: (w) => letters(b, "Denny's", w - 0.8, 1.25, { style: 'block', fill: '#e2231a', bg: '#ffc20e', sub: 'ALWAYS OPEN', subFill: '#e2231a', scale: 0.62 }),
      zone: "Denny's (24/7)",
    },
    {
      w: 3.8,
      wall: 0xf6f6f2,
      stripes: [0xf58025, 0x008163, 0xee2526],
      sign: (w) => letters(b, '7-ELEVEN', w - 0.7, 1.0, { style: 'block', fill: '#ffffff', bg: '#008163', rule: '#f58025' }),
      zone: '7-Eleven',
    },
    {
      w: zS - zN - 12.6 - 0.4,
      wall: 0xf4f4f0,
      sign: (w) => letters(b, 'Ross', Math.min(4, w - 0.6), 1.35, { style: 'block', fill: '#1f4e9c', sub: 'DRESS FOR LESS', subFill: '#1f4e9c', scale: 0.62 }),
      zone: 'Ross Dress for Less',
    },
  ];
  let z = zS - 0.2;
  for (const st of stores) {
    const zc = z - st.w / 2;
    // shell (back + party walls) with a parapet, glass shopfront, sign band, little awning
    b.box(x0 + depth / 2, 0, zc, depth, H, st.w - 0.06, mat(st.wall, 0.85), true);
    objs.push(boxM(0.08, 2.9, st.w - 1.0, glass, x0 - 0.05, 1.55, zc));
    if (st.band) objs.push(boxM(0.22, 1.5, st.w, mat(st.band, 0.6), x0 - 0.12, 4.35, zc));
    if (st.stripes) st.stripes.forEach((c, i) => objs.push(boxM(0.2, 0.28, st.w, mat(c, 0.6), x0 - 0.12, 5.25 - i * 0.3, zc)));
    objs.push(boxM(1.2, 0.12, st.w - 0.4, mat(0x3a3c42, 0.6, 0.3), x0 - 0.6, 3.15, zc));
    const sign = st.sign(st.w);
    b.add(sign, x0 - 0.25, st.stripes ? 3.9 : 4.35, zc, -HALF_PI);
    b.zone(st.zone, 19, x0 + depth, z - st.w, z);
    z -= st.w;
  }
  b.building(x0 + depth / 2, (zS + zN) / 2, depth, zS - zN, '#d9c9ab', 'Walgreens · Denny’s · 7-Eleven · Ross');
  // multi-tenant pylon by the sidewalk (cabinets face up and down the Strip)
  const px = 21.3;
  const pz = zS - 2.2;
  const pyH = 9.6;
  objs.push(boxM(0.6, pyH, 0.6, mat(0x5a5e66, 0.4, 0.6), px, pyH / 2, pz));
  b.collider(px - 0.3, px + 0.3, pz - 0.3, pz + 0.3, 0, pyH, true);
  const tenants: Array<[string, string, string]> = [
    ['Walgreens', '#ffffff', '#e31837'],
    ["Denny's", '#e2231a', '#ffc20e'],
    ['7-ELEVEN', '#ffffff', '#008163'],
    ['Ross', '#1f4e9c', '#ffffff'],
  ];
  tenants.forEach(([t, fg, bg], i) => {
    const cab = letters(b, t, 3.0, 0.95, { style: t === 'Walgreens' ? 'script' : 'block', fill: fg, bg, rule: '#d8d8d8' }, 0.4);
    b.add(cab, px, pyH - 0.7 - i * 1.1, pz, 0);
    objs.push(boxM(3.1, 1.0, 0.4, mat(0x2a2c32, 0.5, 0.3), px, pyH - 0.7 - i * 1.1, pz));
  });
  merge(b, objs, false);
}

/**
 * The wall behind the porte-cochère: a red screen across the front of the big top with narrow,
 * intersecting bulb arches rising nearly to the roof, the door opening between the pink pylons, and a
 * side door on the south with a neon clown over it. ex = the big top's front (door) x, cz = door axis.
 */
export function porteCochereWall(b: WorldBuilder, ex: number, cz: number): void {
  const x = ex + 0.45;
  const H = 9.3;
  const open = 5.4; // pylons + door between ±open
  const half = 10.5;
  const red = mat(0xb8123e, 0.55);
  const objs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const zc = cz + s * (open + half) / 2;
    objs.push(boxM(0.4, H, half - open, red, x, H / 2, zc));
    b.collider(x - 0.2, x + 0.2, Math.min(zc - (half - open) / 2, zc + (half - open) / 2), Math.max(zc - (half - open) / 2, zc + (half - open) / 2), 0, H, true);
  }
  objs.push(boxM(0.4, H - 7.4, open * 2, red, x, 7.4 + (H - 7.4) / 2, cz));
  // south side door (dark glass) under the neon clown
  const dz = cz + 7.9;
  objs.push(boxM(0.08, 2.6, 2.2, mat(0x101418, 0.15, 0.5), x + 0.22, 1.3, dz));
  objs.push(boxM(0.2, 0.25, 2.6, mat(0xd8a838, 0.3, 0.85), x + 0.25, 2.7, dz));
  merge(b, objs, false);
  // intersecting bulb arches across the whole screen (one chase-bulb mesh, facing the Strip)
  const arches = new THREE.Group();
  const aw = 1.5; // half-width of each narrow arch
  for (let k = -6; k <= 6; k++) {
    const zc = k * 1.62;
    if (Math.abs(zc) < open + 0.2 && Math.abs(zc) > 0.5) continue; // the doorway itself stays clear
    const pts: Array<[number, number]> = [];
    const top = H - 0.5;
    const spring = top - aw * 1.6;
    pts.push([zc - aw, Math.abs(zc) < open ? 7.6 : 0.2]);
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI - (i / 12) * Math.PI;
      pts.push([zc + Math.cos(a) * aw, spring + Math.sin(a) * aw * 1.6]);
    }
    pts.push([zc + aw, Math.abs(zc) < open ? 7.6 : 0.2]);
    arches.add(bulbPath(pts, false, 0.36, 0.16, 0));
  }
  arches.rotation.y = HALF_PI;
  arches.position.set(x + 0.22, 0, cz);
  b.add(arches);
  // the neon clown over the south door
  const clown = neonFace(b, 2.6, 2.6, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h * 0.56;
    const r = w * 0.27;
    const ring = (p: Path2D, c: string) => neonStroke(ctx, p, c, Math.max(2, w * 0.016));
    const face = new Path2D();
    face.arc(cx, cy, r, 0, Math.PI * 2);
    ring(face, '#ffffff');
    const hat = new Path2D();
    hat.moveTo(cx - r * 0.75, cy - r * 0.8);
    hat.lineTo(cx + r * 0.1, cy - r * 2.0);
    hat.lineTo(cx + r * 0.75, cy - r * 0.8);
    ring(hat, '#ff4fd8');
    for (const s of [-1, 1]) {
      const hair = new Path2D();
      hair.arc(cx + s * r * 1.15, cy - r * 0.1, r * 0.38, 0, Math.PI * 2);
      ring(hair, '#ff8a1a');
      const eye = new Path2D();
      eye.arc(cx + s * r * 0.38, cy - r * 0.28, r * 0.12, 0, Math.PI * 2);
      ring(eye, '#3a8bff');
    }
    const nose = new Path2D();
    nose.arc(cx, cy + r * 0.05, r * 0.16, 0, Math.PI * 2);
    ring(nose, '#ff2030');
    const smile = new Path2D();
    smile.arc(cx, cy + r * 0.1, r * 0.55, 0.15 * Math.PI, 0.85 * Math.PI);
    ring(smile, '#ff2030');
  });
  b.add(clown, x + 0.25, 4.6, dz, HALF_PI);
  const ringB = new THREE.Group();
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push([Math.cos(a) * 1.35, Math.sin(a) * 1.35]);
  }
  ringB.add(bulbPath(pts, true, 0.3, 0.15, 0));
  ringB.rotation.y = HALF_PI;
  ringB.position.set(x + 0.24, 4.6, dz);
  b.add(ringB);
}
