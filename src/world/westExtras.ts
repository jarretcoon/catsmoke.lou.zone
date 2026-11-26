import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from './builder';
import { mat } from './props';
import { letterFace } from './signKit';

/**
 * Smaller west-side details, after the real places:
 *  - Lake Bellagio's Strip edge: a cream stone balustrade (plinth, vase balusters, rail) with black
 *    iron lamp posts carrying three lanterns each on stone pedestals;
 *  - the Cosmopolitan's "Beacon": the LED logo display high on the Boulevard tower (since 2016).
 */

const merge = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;

/** Balustrade along x = `x` from z0 to z1 (Strip side of the lake), lamp posts every `every` m. */
export function bellagioLakeFront(b: WorldBuilder, x: number, z0: number, z1: number, every = 6.5): void {
  const stone = mat(0xe9dcc0, 0.7);
  const iron = mat(0x16181a, 0.45, 0.5);
  const glass = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 0.08, roughness: 0.3 }), 0.08, 1.5);
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  const st: THREE.BufferGeometry[] = [];
  const ir: THREE.BufferGeometry[] = [];
  const gl: THREE.BufferGeometry[] = [];
  st.push(new THREE.BoxGeometry(0.72, 0.24, len).translate(x, 0.12, zc));
  st.push(new THREE.BoxGeometry(0.64, 0.17, len).translate(x, 0.965, zc));
  const lamps: number[] = [];
  for (let z = z0 + 2.5; z <= z1 - 12; z += every) lamps.push(z);
  const bal = new THREE.CylinderGeometry(0.07, 0.12, 0.66, 6);
  for (let z = z0 + 0.25; z < z1; z += 0.42) {
    if (lamps.some((l) => Math.abs(l - z) < 0.5)) continue;
    st.push(bal.clone().translate(x, 0.57, z));
  }
  for (const z of lamps) {
    st.push(new THREE.BoxGeometry(0.8, 1.3, 0.8).translate(x, 0.65, z));
    st.push(new THREE.BoxGeometry(0.92, 0.14, 0.92).translate(x, 1.3, z));
    ir.push(new THREE.CylinderGeometry(0.17, 0.21, 0.35, 10).translate(x, 1.55, z));
    ir.push(new THREE.CylinderGeometry(0.07, 0.1, 3.3, 8).translate(x, 3.0, z));
    ir.push(new THREE.BoxGeometry(0.08, 0.08, 1.55).translate(x, 4.4, z));
    // three lanterns: one on top, two hanging from the arm
    for (const [dz, y] of [
      [0, 5.0],
      [-0.72, 4.05],
      [0.72, 4.05],
    ]) {
      gl.push(new THREE.BoxGeometry(0.24, 0.36, 0.24).translate(x, y, z + dz));
      ir.push(new THREE.ConeGeometry(0.22, 0.2, 4).rotateY(Math.PI / 4).translate(x, y + 0.28, z + dz));
      ir.push(new THREE.BoxGeometry(0.28, 0.05, 0.28).translate(x, y - 0.2, z + dz));
      if (dz !== 0) ir.push(new THREE.BoxGeometry(0.03, 0.25, 0.03).translate(x, y + 0.48, z + dz));
    }
  }
  const sm = new THREE.Mesh(merge(st), stone);
  sm.castShadow = true;
  sm.receiveShadow = true;
  b.add(sm);
  const im = new THREE.Mesh(merge(ir), iron);
  im.castShadow = true;
  b.add(im);
  b.add(new THREE.Mesh(merge(gl), glass));
  b.collider(x - 0.36, x + 0.36, z0, z1, 0, 1.05);
}

/** The Cosmopolitan's Beacon: the logo on a black LED panel on the tower's Strip face (facing +x at x). */
export function cosmoBeacon(b: WorldBuilder, x: number, z: number, y: number, w = 11, h = 3.8): void {
  b.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, h + 0.3, w + 0.3), mat(0x0a0a10, 0.3, 0.4)), x + 0.15, y, z);
  const face = letterFace(b, w, h, (ctx, pw, ph) => {
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, pw, ph);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const big = Math.round(ph * 0.36);
    ctx.font = `400 ${big}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(big * 0.16)}px`;
    ctx.fillText('THE COSMOPOLITAN', pw / 2, ph * 0.46, pw * 0.92);
    ctx.font = `300 ${Math.round(ph * 0.14)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(ph * 0.05)}px`;
    ctx.fillStyle = '#d9c4ff';
    ctx.fillText('OF LAS VEGAS', pw / 2, ph * 0.76, pw * 0.6);
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
  });
  b.add(face, x + 0.32, y, z, Math.PI / 2);
}

/**
 * The Bellagio's Lake Como village front facing the lake (+x) at x, in segments [z0, z1, height]:
 * ochre and cream stucco with an arcade of arched loggias (lit warm at night), shuttered windows above,
 * a cornice and a terracotta tile roof; two small towers with pyramid roofs and Italian stone pines
 * along the walk between the village and the lake.
 */
export function bellagioLakeVillage(b: WorldBuilder, x: number, segs: Array<[number, number, number]>): void {
  const BAY = 6; // metres per texture repeat (one loggia bay)
  const paint = (lit: boolean) => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // h covers 11 m: loggia arch 0…4.6 m, upper floor windows, cornice band at the top
    const m = h / 11;
    if (!lit) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#e6c48c');
      g.addColorStop(1, '#d4a86e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(120,80,40,0.08)';
      for (let i = 0; i < 260; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 8, 1 + Math.random() * 3);
      // cream pilasters, string course, cornice
      ctx.fillStyle = '#f1e3c6';
      ctx.fillRect(0, 0, w * 0.08, h);
      ctx.fillRect(w * 0.92, 0, w * 0.08, h);
      ctx.fillRect(0, h - 5.2 * m, w, 0.35 * m);
      ctx.fillRect(0, 0, w, 0.7 * m);
      ctx.fillStyle = '#c9a46c';
      ctx.fillRect(0, 0.7 * m, w, 0.15 * m);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    }
    // the loggia arch
    const ax = w / 2;
    const aw = w * 0.56;
    const top = h - 4.6 * m;
    ctx.beginPath();
    ctx.moveTo(ax - aw / 2, h);
    ctx.lineTo(ax - aw / 2, top + aw / 2);
    ctx.arc(ax, top + aw / 2, aw / 2, Math.PI, 0);
    ctx.lineTo(ax + aw / 2, h);
    ctx.closePath();
    if (lit) {
      const gl = ctx.createLinearGradient(0, top, 0, h);
      gl.addColorStop(0, 'rgba(255,196,120,0.75)');
      gl.addColorStop(1, 'rgba(255,214,160,1)');
      ctx.fillStyle = gl;
    } else ctx.fillStyle = '#5a3e2a';
    ctx.fill();
    if (!lit) {
      ctx.strokeStyle = '#f1e3c6';
      ctx.lineWidth = 0.3 * m;
      ctx.stroke();
      // a hanging lantern in the arch
      ctx.fillStyle = '#2a1e14';
      ctx.fillRect(ax - 0.12 * m, top + 0.6 * m, 0.24 * m, 0.5 * m);
    }
    // upper floor: two shuttered windows with a small balcony rail
    for (const k of [-1, 1]) {
      const wx = w / 2 + k * w * 0.22;
      const wy = 1.6 * m;
      const ww = w * 0.16;
      const wh = 2.6 * m;
      if (lit) {
        if (k > 0) {
          ctx.fillStyle = 'rgba(255,206,140,0.85)';
          ctx.fillRect(wx - ww / 2, wy, ww, wh);
        }
        continue;
      }
      ctx.fillStyle = '#3a3a38';
      ctx.fillRect(wx - ww / 2, wy, ww, wh);
      ctx.fillStyle = '#4f6b4a';
      ctx.fillRect(wx - ww / 2 - ww * 0.42, wy, ww * 0.4, wh);
      ctx.fillRect(wx + ww / 2 + ww * 0.02, wy, ww * 0.4, wh);
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(wx - ww * 0.75, wy + wh, ww * 1.5, 0.12 * m);
      for (let bx = wx - ww * 0.7; bx < wx + ww * 0.7; bx += ww * 0.18) ctx.fillRect(bx, wy + wh - 0.6 * m, 0.06 * m, 0.6 * m);
    }
  };
  const map = canvasTexLocal(192, 352, paint(false));
  const em = canvasTexLocal(192, 352, paint(true));
  const wall = b.nightGlow(new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.02, roughness: 0.85 }), 0.02, 0.85);
  const faces: THREE.BufferGeometry[] = [];
  const roof: THREE.BufferGeometry[] = [];
  const tiles = mat(0xb5654a, 0.85);
  const cream = mat(0xf1e3c6, 0.7);
  const trim: THREE.BufferGeometry[] = [];
  for (const [z0, z1, h] of segs) {
    const len = z1 - z0;
    const g = new THREE.PlaneGeometry(len, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    // whole bays along; the canvas covers 11 m of height
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / BAY, uv.getY(i) * (h / 11));
    g.rotateY(Math.PI / 2).translate(x + 0.05, h / 2, (z0 + z1) / 2);
    faces.push(g);
    // terracotta roof: eave over the cornice sloping back up to a ridge
    const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-4.5, 0), new THREE.Vector2(-4.5, 2.2)]);
    const rg = new THREE.ExtrudeGeometry(s, { depth: len + 0.6, bevelEnabled: false });
    rg.translate(0, 0, -(len + 0.6) / 2);
    rg.translate(x + 0.9, h, (z0 + z1) / 2);
    roof.push(rg);
    trim.push(new THREE.BoxGeometry(1.2, 0.35, len + 0.4).translate(x + 0.4, h - 0.1, (z0 + z1) / 2));
  }
  b.add(new THREE.Mesh(merge(faces), wall));
  const rm = new THREE.Mesh(merge(roof), tiles);
  rm.castShadow = true;
  b.add(rm);
  b.add(new THREE.Mesh(merge(trim), cream));
  // two little towers with pyramid roofs over the loggias
  const tw: THREE.BufferGeometry[] = [];
  const tr: THREE.BufferGeometry[] = [];
  for (const [tz, th] of [
    [44, 17.5],
    [70, 15],
  ]) {
    tw.push(new THREE.BoxGeometry(4.2, th - 9, 4.2).translate(x - 2.2, 9 + (th - 9) / 2, tz));
    tr.push(new THREE.ConeGeometry(3.3, 2.6, 4).rotateY(Math.PI / 4).translate(x - 2.2, th + 1.3, tz));
  }
  const towers = new THREE.Mesh(merge(tw), mat(0xe2bf86, 0.8));
  towers.castShadow = true;
  b.add(towers);
  b.add(new THREE.Mesh(merge(tr), tiles));
  // Italian stone pines along the promenade between the village and the lake
  const trunk: THREE.BufferGeometry[] = [];
  const crown: THREE.BufferGeometry[] = [];
  for (const [pz, ph] of [
    [36, 8.5],
    [50, 9.5],
    [58, 8],
    [74, 9],
    [92, 8.5],
  ]) {
    const px = x + 4.2;
    trunk.push(new THREE.CylinderGeometry(0.22, 0.32, ph, 7).rotateZ(0.06).translate(px, ph / 2, pz));
    crown.push(new THREE.SphereGeometry(2.6, 10, 6).scale(1, 0.42, 1).translate(px + 0.3, ph + 0.3, pz));
    crown.push(new THREE.SphereGeometry(1.8, 9, 5).scale(1, 0.45, 1).translate(px - 1.2, ph - 0.5, pz + 0.8));
  }
  b.add(new THREE.Mesh(merge(trunk), mat(0x6a4a32, 0.9)));
  const cm = new THREE.Mesh(merge(crown), mat(0x2f5a32, 0.85));
  cm.castShadow = true;
  b.add(cm);
}

function canvasTexLocal(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * The Cosmopolitan's balcony light lines pulse from the bottom of the towers to the top like comets
 * (the real towers carry ~21,000 ft of blue light-line fixtures). Finds the balcony-lip glow material
 * (emissive `color`) in the tower groups and runs a travelling bright head with a fading tail up it.
 */
export function cosmoComets(b: WorldBuilder, towers: THREE.Object3D[], color: number): void {
  let m: THREE.MeshStandardMaterial | null = null;
  for (const t of towers) {
    t.traverse((o) => {
      const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mm && (mm as THREE.MeshStandardMaterial).isMeshStandardMaterial && mm.emissive && mm.emissive.getHex() === color) m = mm;
    });
  }
  const mat0 = m as THREE.MeshStandardMaterial | null;
  if (!mat0 || mat0.userData.comets) return;
  mat0.userData.comets = true;
  const uT = { value: 0 };
  mat0.onBeforeCompile = (sh) => {
    sh.uniforms.uCometT = uT;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCometW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCometW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCometW;\nuniform float uCometT;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n{ float cp = fract(vCometW.y * 0.03 - uCometT * 0.32 + (vCometW.x + vCometW.z) * 0.013);\n  totalEmissiveRadiance *= 0.3 + 0.95 * exp(-(1.0 - cp) * 7.0); }'
      );
  };
  mat0.customProgramCacheKey = () => 'cosmo-comets';
  mat0.needsUpdate = true;
  b.every((_dt, t, night) => {
    if (night > 0.05) uT.value = t;
  });
}
