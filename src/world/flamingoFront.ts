import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { flamingoBird, mat, mesh, palmTree, planter } from './props';
import { canvasTex } from './themedKit';
import { animate, letters, neonFace, neonPanel, neonStroke, placed } from './signKit';

/*
 * The Flamingo's Strip front, after street photos:
 *  - the famous neon "bloom" on the south corner: a 3-D bulb of pink and orange feathered petals (cream
 *    tips) on a round canopy drum over the main doors, a ring of flared petals round its base, spiky
 *    feather plumes on top and flatter feather wings fanning along the parapet either side. At night the
 *    neon pulses upward through it, the bouquet "opening" like the 1976 original.
 *  - a cream podium with pink neon bands, a pink wave frieze under the parapet, the pink "Flamingo"
 *    script on the wall, a smaller lotus fan of petals over the north doors between two little domes;
 *  - the cream curb monument with the script, palms in planters and pink flamingo statues on the walk.
 * Two materials (the bulb skin, and one petal/feather atlas) carry all the neon; both are lit by one
 * shader hook driven from the sign kit's updater.
 */

const wave = { uTime: { value: 0 }, uNight: { value: 0 } };

/** Shared hook: the neon pulses in bands that rise through the bloom at night. */
function pulse(m: THREE.MeshStandardMaterial, key: string): void {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, wave);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFy;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFy = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFy;\nuniform float uTime;\nuniform float uNight;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float w = 0.5 + 0.5 * sin(uTime * 3.4 - vFy * 0.85);
          totalEmissiveRadiance *= mix(1.0, 0.45 + 0.85 * w, uNight);
        }`
      );
  };
  m.customProgramCacheKey = () => key;
}

let bulbMat: THREE.MeshStandardMaterial | null = null;
/** The bulb skin: 16 gores alternating hot pink and orange, cream feather tips, neon tubes on the edges and chevrons. */
function bulbMaterial(b: WorldBuilder): THREE.MeshStandardMaterial {
  if (bulbMat) return bulbMat;
  const W = 1024;
  const H = 512;
  const G = 16;
  const paint = (lit: boolean) => (ctx: CanvasRenderingContext2D) => {
    for (let i = 0; i < G; i++) {
      const x0 = (i * W) / G;
      const gw = W / G;
      const pink = i % 2 === 0;
      const g = ctx.createLinearGradient(0, H, 0, 0);
      if (lit) {
        g.addColorStop(0, pink ? '#5a1030' : '#5a2a08');
        g.addColorStop(1, pink ? '#8a2a58' : '#8a4a18');
      } else {
        g.addColorStop(0, pink ? '#e0307a' : '#f07a24');
        g.addColorStop(0.75, pink ? '#ff5fa2' : '#ff9a44');
        g.addColorStop(1, '#fbe6cf');
      }
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, gw + 1, H);
      // feather chevrons up the gore, cream tips
      for (let k = 0; k < 7; k++) {
        const yb = H - (k + 1) * (H / 7.5);
        const p = new Path2D();
        p.moveTo(x0 + 3, yb + 26);
        p.lineTo(x0 + gw / 2, yb);
        p.lineTo(x0 + gw - 3, yb + 26);
        if (!lit) {
          ctx.fillStyle = 'rgba(251,230,207,0.55)';
          ctx.beginPath();
          ctx.moveTo(x0 + 6, yb + 26);
          ctx.lineTo(x0 + gw / 2, yb + 4);
          ctx.lineTo(x0 + gw - 6, yb + 26);
          ctx.lineTo(x0 + gw / 2, yb + 14);
          ctx.closePath();
          ctx.fill();
        }
        neonStroke(ctx, p, pink ? '#ff7cc0' : '#ffb060', lit ? 4 : 2.5);
      }
      const edge = new Path2D();
      edge.moveTo(x0 + 1, H);
      edge.lineTo(x0 + 1, 0);
      neonStroke(ctx, edge, '#ffd8ec', lit ? 5 : 3);
    }
  };
  const map = canvasTex(W, H, paint(false));
  const em = canvasTex(W, H, paint(true));
  bulbMat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.45 });
  b.nightGlow(bulbMat, 0.1, 1.15);
  pulse(bulbMat, 'flamingo-bulb');
  return bulbMat;
}

let featherMat: THREE.MeshStandardMaterial | null = null;
/** Petal / feather atlas (alpha cut): [0] pink petal, [1] orange petal, [2] cream-gold plume, [3] magenta petal. */
function featherMaterial(b: WorldBuilder): THREE.MeshStandardMaterial {
  if (featherMat) return featherMat;
  const S = 256;
  const cols: Array<[string, string, string]> = [
    ['#ff3f98', '#ffb0d8', '#ff7cc0'],
    ['#ff7a1a', '#ffd0a0', '#ffb060'],
    ['#f6d68a', '#fff4dc', '#ffe8b0'],
    ['#d0208a', '#ff9ad0', '#ff5cc0'],
  ];
  const paint = (lit: boolean) => (ctx: CanvasRenderingContext2D) => {
    cols.forEach(([body, tip, tube], k) => {
      const x0 = k * S;
      const feather = k === 2;
      const half = feather ? 44 : 92;
      const shape = new Path2D();
      shape.moveTo(x0 + S / 2, S - 4);
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const w = half * Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.95)) ** (feather ? 0.6 : 0.85) * (1 + (feather ? 0.18 : 0.06) * Math.sin(t * 34));
        shape.lineTo(x0 + S / 2 + w, S - 4 - t * (S - 10));
      }
      for (let i = 20; i >= 0; i--) {
        const t = i / 20;
        const w = half * Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.95)) ** (feather ? 0.6 : 0.85) * (1 + (feather ? 0.18 : 0.06) * Math.sin(t * 34 + 1.3));
        shape.lineTo(x0 + S / 2 - w, S - 4 - t * (S - 10));
      }
      shape.closePath();
      const g = ctx.createLinearGradient(0, S, 0, 0);
      g.addColorStop(0, lit ? '#3a0a20' : body);
      g.addColorStop(0.7, lit ? '#6a2040' : body);
      g.addColorStop(1, lit ? '#a06070' : tip);
      ctx.fillStyle = g;
      ctx.fill(shape);
      neonStroke(ctx, shape, tube, lit ? 7 : 4);
      const quill = new Path2D();
      quill.moveTo(x0 + S / 2, S - 4);
      quill.lineTo(x0 + S / 2, 14);
      neonStroke(ctx, quill, '#fff0f8', lit ? 4 : 2);
    });
  };
  const map = canvasTex(S * 4, S, paint(false));
  const em = canvasTex(S * 4, S, paint(true));
  featherMat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.5, alphaTest: 0.4, side: THREE.DoubleSide });
  b.nightGlow(featherMat, 0.1, 1.2);
  pulse(featherMat, 'flamingo-feather');
  return featherMat;
}

/** A petal quad of width w and length l from the origin up +y, facing +z, using atlas cell k (0..3). */
function petalGeo(w: number, l: number, k: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, l);
  g.translate(0, l / 2, 0);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i)) / 4);
  return g;
}

/** Place a petal: base at p, pointing along `dir` (unit), its face turned toward `face` (roughly). */
function petalAt(b: WorldBuilder, geo: THREE.BufferGeometry, m: THREE.Material, p: THREE.Vector3, dir: THREE.Vector3, face: THREE.Vector3): void {
  const me = new THREE.Mesh(geo, m);
  const y = dir.clone().normalize();
  const x = new THREE.Vector3().crossVectors(y, face).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  me.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  me.position.copy(p);
  b.add(me);
}

/** The bloom on its drum at (cx, cz), sitting on the parapet at y0. */
function bloom(b: WorldBuilder, cx: number, y0: number, cz: number): void {
  const bm = bulbMaterial(b);
  const fm = featherMaterial(b);
  // the bulb: an onion of feathered gores
  const prof: THREE.Vector2[] = [
    [3.4, 0],
    [4.6, 1.0],
    [5.4, 2.4],
    [5.6, 3.8],
    [5.2, 5.4],
    [4.3, 7.0],
    [3.0, 8.5],
    [1.7, 9.8],
    [0.7, 10.8],
    [0.05, 11.4],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const bulb = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), bm);
  bulb.castShadow = true;
  b.add(bulb, cx, y0, cz);
  // a ring of flared petals round its base
  const ringN = 20;
  const pg = [petalGeo(2.6, 4.6, 0), petalGeo(2.6, 4.6, 1)];
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * Math.PI * 2 + 0.08;
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const p = new THREE.Vector3(cx, y0 + 0.4, cz).addScaledVector(out, 3.6);
    const dir = out.clone().multiplyScalar(0.85).add(new THREE.Vector3(0, 0.55, 0));
    petalAt(b, pg[i % 2], fm, p, dir, out);
  }
  // a second, taller inner ring hugging the bulb
  const pg2 = [petalGeo(2.2, 5.2, 1), petalGeo(2.2, 5.2, 0)];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const p = new THREE.Vector3(cx, y0 + 1.6, cz).addScaledVector(out, 5.0);
    const dir = out.clone().multiplyScalar(0.42).add(new THREE.Vector3(0, 0.9, 0));
    petalAt(b, pg2[i % 2], fm, p, dir, out);
  }
  // spiky feather plumes crowning the top (two crossed quads each)
  const plume = petalGeo(1.3, 4.6, 2);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const p = new THREE.Vector3(cx, y0 + 10.2, cz).addScaledVector(out, 0.5);
    const dir = out.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 0.85, 0));
    petalAt(b, plume, fm, p, dir, out);
    petalAt(b, plume, fm, p, dir, new THREE.Vector3(out.z, 0, -out.x));
  }
  petalAt(b, petalGeo(1.4, 5.4, 2), fm, new THREE.Vector3(cx, y0 + 10.6, cz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
  petalAt(b, petalGeo(1.4, 5.4, 2), fm, new THREE.Vector3(cx, y0 + 10.6, cz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
}

/** A flat fan of `n` petals in the wall plane facing −x, rooted at (x, y, z), spreading ±spread rad. */
function fan(b: WorldBuilder, x: number, y: number, z: number, n: number, len: number, w: number, spread: number, cells: number[]): void {
  const fm = featherMaterial(b);
  const geos = cells.map((k) => petalGeo(w, len, k));
  const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => Math.abs(q - (n - 1) / 2) - Math.abs(p - (n - 1) / 2));
  order.forEach((i, rank) => {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const a = t * spread;
    const dir = new THREE.Vector3(0, Math.cos(a), -Math.sin(a));
    const l = len * (1 - Math.abs(t) * 0.22);
    const geo = geos[i % geos.length];
    const me = new THREE.Mesh(geo, fm);
    me.scale.set(1, l / len, 1);
    const yv = dir;
    const zv = new THREE.Vector3(-1, 0, 0);
    const xv = new THREE.Vector3().crossVectors(yv, zv).normalize();
    me.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xv, yv, new THREE.Vector3().crossVectors(xv, yv)));
    me.position.set(x - 0.02 * rank, y, z);
    b.add(me);
  });
}

/** The pink wave frieze under the parapet (a strip texture repeating every 4 m). */
function waveFrieze(b: WorldBuilder, x: number, y: number, z0: number, z1: number, h: number): void {
  const tex = canvasTex(256, 64, (ctx, w, hh) => {
    ctx.fillStyle = '#f6e9da';
    ctx.fillRect(0, 0, w, hh);
    ctx.fillStyle = '#ec5a9a';
    ctx.beginPath();
    ctx.moveTo(0, hh);
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      ctx.lineTo(t * w, hh * 0.55 - Math.sin(t * Math.PI * 2) * hh * 0.28);
    }
    ctx.lineTo(w, hh);
    ctx.fill();
    ctx.fillStyle = '#ff9ac4';
    ctx.fillRect(0, 2, w, 5);
  }, true);
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  const len = z1 - z0;
  const geo = new THREE.PlaneGeometry(len, h);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 4);
  const me = mesh(geo, m, x, y, (z0 + z1) / 2);
  me.rotation.y = -Math.PI / 2;
  b.add(me);
}

export interface FlamingoDoors {
  main: number;
  north: number;
}

/**
 * The Flamingo front on the casino wall at x = `x` (facing −x), z0 (north) … z1 (south), `h` tall, the
 * main doors under the bloom at `doors.main`, the north doors under the lotus fan at `doors.north`.
 */
export function flamingoFront(b: WorldBuilder, x: number, z0: number, z1: number, h: number, doors: FlamingoDoors): void {
  const cream = mat(0xf3e6d6, 0.7);
  const creamDark = mat(0xe2cdb8, 0.75);
  const pinkTrim = mat(0xe8508a, 0.6);
  const neonPink = new THREE.MeshStandardMaterial({ color: 0xff7ab8, emissive: 0xff3f9a, emissiveIntensity: 0.15, roughness: 0.4 });
  b.nightGlow(neonPink, 0.15, 1.05);
  const fx = x - 0.75; // face of the skin, proud of the casino's pilasters
  // cream skin in panels between the doors
  const gaps: Array<[number, number]> = [
    [doors.main - 4.2, doors.main + 4.2],
    [doors.north - 3.2, doors.north + 3.2],
  ].sort((p, q) => p[0] - q[0]) as Array<[number, number]>;
  let cur = z0;
  const segs: Array<[number, number]> = [];
  for (const [g0, g1] of gaps) {
    if (g0 > cur) segs.push([cur, g0]);
    cur = g1;
  }
  if (cur < z1) segs.push([cur, z1]);
  for (const [a, c] of segs) {
    b.add(mesh(new THREE.BoxGeometry(0.3, h - 1.2, c - a), cream, fx + 0.15, (h - 1.2) / 2, (a + c) / 2));
    // pink pilaster strips with neon caps every ~6 m
    const n = Math.max(1, Math.round((c - a) / 6));
    for (let i = 0; i <= n; i++) {
      const zz = a + ((c - a) * i) / n;
      b.add(mesh(new THREE.BoxGeometry(0.3, h - 1.6, 0.5), creamDark, fx - 0.1, (h - 1.6) / 2, zz));
    }
  }
  for (const [g0, g1] of gaps) b.add(mesh(new THREE.BoxGeometry(0.3, h - 1.2 - 4.9, g1 - g0), cream, fx + 0.15, 4.9 + (h - 6.1) / 2, (g0 + g1) / 2));
  // base course, two pink neon bands, the frieze and parapet
  b.add(mesh(new THREE.BoxGeometry(0.5, 0.7, z1 - z0), pinkTrim, fx - 0.05, 0.35, (z0 + z1) / 2));
  b.add(mesh(new THREE.BoxGeometry(0.16, 0.16, z1 - z0), neonPink, fx - 0.3, 5.05, (z0 + z1) / 2));
  b.add(mesh(new THREE.BoxGeometry(0.16, 0.16, z1 - z0), neonPink, fx - 0.3, h - 1.55, (z0 + z1) / 2));
  waveFrieze(b, fx - 0.32, h - 0.95, z0, z1, 1.0);
  b.add(mesh(new THREE.BoxGeometry(0.9, 0.5, z1 - z0 + 0.6), cream, fx - 0.1, h - 0.2, (z0 + z1) / 2, true));
  b.add(mesh(new THREE.BoxGeometry(0.4, 0.9, z1 - z0), cream, fx + 0.2, h + 0.45, (z0 + z1) / 2));

  // the drum canopy over the main doors: a half round drum on four pink columns, a glowing soffit
  const R = 6.2;
  const dcx = x + 0.4;
  const dz = doors.main;
  const drumY0 = 5.4;
  const drum = new THREE.CylinderGeometry(R, R, h - drumY0, 28, 1, true, Math.PI, Math.PI);
  b.add(mesh(drum, cream, dcx, (h + drumY0) / 2, dz, true));
  b.add(mesh(new THREE.CylinderGeometry(R + 0.25, R + 0.25, 0.16, 28, 1, true, Math.PI, Math.PI), neonPink, dcx, drumY0 + 0.3, dz));
  b.add(mesh(new THREE.CylinderGeometry(R + 0.25, R + 0.25, 0.16, 28, 1, true, Math.PI, Math.PI), neonPink, dcx, h - 1.55, dz));
  b.add(mesh(new THREE.CylinderGeometry(R + 0.4, R + 0.4, 0.6, 28, 1, false, Math.PI, Math.PI), cream, dcx, h - 0.2, dz));
  const soffit = mesh(new THREE.CircleGeometry(R, 28, Math.PI / 2, Math.PI), mat(0xfff0dc, 0.5, 0, { emissive: 0xffd8b0, emissiveIntensity: 0.3 }), dcx, drumY0, dz);
  soffit.rotation.x = Math.PI / 2;
  b.add(soffit);
  for (const a of [-1.25, -0.42, 0.42, 1.25]) {
    const px = dcx - Math.cos(a) * (R - 0.4);
    const pz = dz + Math.sin(a) * (R - 0.4);
    b.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, drumY0, 12), pinkTrim, px, drumY0 / 2, pz, true));
    b.collider(px - 0.3, px + 0.3, pz - 0.3, pz + 0.3, 0, drumY0, true);
  }
  bloom(b, dcx - 0.6, h + 0.2, dz);
  // feather wings fanning along the parapet either side of the drum
  fan(b, fx - 0.4, h - 0.1, dz - R - 4.6, 9, 4.2, 1.5, 1.2, [0, 1, 3]);
  fan(b, fx - 0.4, h - 0.1, dz + R + 3.4, 7, 3.4, 1.4, 1.1, [1, 0, 3]);

  // the lotus fan over the north doors between two small banded domes
  fan(b, fx - 0.4, h + 0.1, doors.north, 11, 5.0, 1.9, 1.35, [0, 3, 2, 3]);
  const bm = bulbMaterial(b);
  for (const s of [-1, 1]) {
    const dome = new THREE.LatheGeometry(
      [
        [1.2, 0],
        [1.35, 0.6],
        [1.25, 1.3],
        [0.9, 1.9],
        [0.4, 2.4],
        [0.03, 2.7],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      16
    );
    b.add(mesh(new THREE.CylinderGeometry(1.3, 1.4, 1.4, 16), cream, fx - 0.6, h + 0.7, doors.north + s * 6.4));
    b.add(mesh(dome, bm, fx - 0.6, h + 1.4, doors.north + s * 6.4));
  }

  // "Flamingo" in pink neon script on the wall between the two entrances, and over the north doors
  const midZ = (doors.main + doors.north) / 2;
  b.add(neonPanel(b, 'Flamingo', 17, 4.4, { style: 'script', color: '#ff4fb8', fill: '#e8407e', size: 0.92 }), fx - 0.34, 7.9, midZ, -Math.PI / 2);
  b.add(neonPanel(b, 'Flamingo', 7, 1.8, { style: 'script', color: '#ff4fb8', fill: '#e8407e', size: 0.9 }), fx - 0.34, 4.55, doors.north, -Math.PI / 2);

  // the curb monument: a cream slab with the pink script on both faces
  const mx = 19.9;
  const mz = midZ + 4;
  b.add(mesh(new THREE.BoxGeometry(0.8, 2.0, 6.4), cream, mx, 1.0, mz, true));
  b.add(mesh(new THREE.BoxGeometry(1.0, 0.25, 6.8), pinkTrim, mx, 2.1, mz));
  b.add(placed(letters(b, 'Flamingo', 6.0, 1.6, { style: 'script', fill: '#e8407e', edge: '#7a1040', edgeW: 3 }, 0.8), mx, 1.05, mz, -Math.PI / 2));
  b.collider(mx - 0.4, mx + 0.4, mz - 3.2, mz + 3.2, 0, 2.2, true);

  // palms in planters with pink flamingo statues along the walk (gaps at the doors)
  let k = 0;
  for (let z = z0 + 5; z < z1 - 3; z += 9) {
    if (Math.abs(z - doors.main) < 8 || Math.abs(z - doors.north) < 6 || Math.abs(z - mz) < 5) continue;
    b.add(planter(2.4, 2.4, 0xff5e9e), 22, 0, z);
    b.collider(20.8, 23.2, z - 1.2, z + 1.2, 0, 0.6);
    b.add(palmTree(7 + (k % 3) * 0.6, false, 70 + k), 22, 0.6, z);
    for (const s of [-1, 1]) {
      const bird = flamingoBird(k + s);
      bird.rotation.y = s * 0.8 + k;
      bird.scale.setScalar(1.3);
      b.add(bird, 22 + s * 0.6, 0.62, z + s * 0.7);
    }
    k++;
  }
  animate(b, (t, n) => {
    wave.uTime.value = t % 1000;
    wave.uNight.value = n;
  });
}

/** The Flamingo tower: "Flamingo" neon script near the top and the pink neon corner strip topped by a flamingo emblem. */
export function flamingoTowerSigns(b: WorldBuilder, faceX: number, z: number, top: number, cornerZ: number): void {
  b.add(neonPanel(b, 'Flamingo', 15, 3.6, { style: 'script', color: '#ff4fb8', fill: '#ff8ac4', size: 0.9 }), faceX - 0.3, top - 3.2, z, -Math.PI / 2);
  const strip = new THREE.MeshStandardMaterial({ color: 0xff8ac0, emissive: 0xff3f9a, emissiveIntensity: 0.15, roughness: 0.4 });
  b.nightGlow(strip, 0.15, 1.05);
  b.add(mesh(new THREE.BoxGeometry(0.35, top - 4, 0.35), strip, faceX - 0.2, 2 + (top - 4) / 2, cornerZ));
  // the emblem: a neon flamingo on one leg, on the corner over the strip
  const emblem = neonFace(b, 3.2, 4.2, (ctx, w, h) => {
    const p = new Path2D();
    p.moveTo(w * 0.5, h * 0.98);
    p.lineTo(w * 0.5, h * 0.62);
    p.moveTo(w * 0.5, h * 0.8);
    p.lineTo(w * 0.36, h * 0.72);
    p.lineTo(w * 0.5, h * 0.66);
    p.moveTo(w * 0.32, h * 0.6);
    p.bezierCurveTo(w * 0.3, h * 0.42, w * 0.78, h * 0.38, w * 0.72, h * 0.56);
    p.bezierCurveTo(w * 0.66, h * 0.66, w * 0.42, h * 0.68, w * 0.32, h * 0.6);
    p.moveTo(w * 0.36, h * 0.5);
    p.bezierCurveTo(w * 0.2, h * 0.3, w * 0.5, h * 0.18, w * 0.42, h * 0.08);
    p.bezierCurveTo(w * 0.52, h * 0.04, w * 0.62, h * 0.1, w * 0.56, h * 0.16);
    p.lineTo(w * 0.66, h * 0.22);
    neonStroke(ctx, p, '#ff4fb8', w * 0.035);
  });
  b.add(placed(emblem, faceX - 0.25, top + 1.6, cornerZ, -Math.PI / 2));
}
