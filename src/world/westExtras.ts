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
