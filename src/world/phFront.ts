import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { mat, mesh } from './props';
import { LedBoard } from './textures';
import type { LedShow } from './textures';
import { driveLed, neonPanel } from './signKit';

/*
 * Planet Hollywood's Strip front, after street photos: the podium is a wall of video screens, and the
 * marquee (installed 2018, about 23 x 31 m real) is a tall LED slab whose screen curves round its street
 * end so it reads from both directions of traffic, "planet hollywood" in white lower-case on top.
 */

const PH_SHOWS: LedShow[] = [
  { name: 'BACKSTREET BOYS', sub: 'PH LIVE AT ZAPPOS • RESIDENCY', color: '#5a1a8a', art: 'band' },
  { name: 'FANTASY', sub: 'SEXIEST SHOW IN VEGAS • 18+', color: '#8a1a4a', art: 'singer' },
  { name: 'V THEATER', sub: 'MAGIC • COMEDY • MIRACLE MILE', color: '#1a3a8a', art: 'magic' },
];

/**
 * The curved marquee: a U in plan (two LED faces facing ±z joined by a half-round screen at the street
 * end), standing on two legs at the sidewalk so people walk under it. `xs` = street end, `xb` = back end.
 */
export function phMarquee(b: WorldBuilder, xs: number, xb: number, zc: number, y0: number, h: number): void {
  const r = 1.15;
  const flat = xb - (xs + r);
  const led = new LedBoard('PLANET HOLLYWOOD', ['LAS VEGAS', 'MIRACLE MILE SHOPS', 'PH LIVE AT ZAPPOS', 'HAPPY HOUR 2-6'], ['#ff2c6a', '#00c2ff', '#ffb000', '#8c2cff'], 256, 512).withShows(PH_SHOWS);
  led.tex.wrapS = THREE.RepeatWrapping;
  // the screen strip: north face (u 0..1, running −x), the round end (u 1..2), south face (u 2..3, running +x)
  const pts: Array<{ x: number; z: number; nx: number; nz: number; u: number }> = [];
  const nFlat = 4;
  for (let i = 0; i <= nFlat; i++) pts.push({ x: xb - (flat * i) / nFlat, z: zc - r, nx: 0, nz: -1, u: i / nFlat });
  const nArc = 14;
  for (let i = 1; i < nArc; i++) {
    const a = -Math.PI / 2 - (i / nArc) * Math.PI; // from −z round through −x to +z
    pts.push({ x: xs + r + Math.cos(a) * r, z: zc + Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a), u: 1 + i / nArc });
  }
  for (let i = 0; i <= nFlat; i++) pts.push({ x: xs + r + (flat * i) / nFlat, z: zc + r, nx: 0, nz: 1, u: 2 + i / nFlat });
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  pts.forEach((p, i) => {
    pos.push(p.x + p.nx * 0.03, y0, p.z + p.nz * 0.03, p.x + p.nx * 0.03, y0 + h, p.z + p.nz * 0.03);
    nor.push(p.nx, 0, p.nz, p.nx, 0, p.nz);
    uv.push(p.u, 0, p.u, 1);
    if (i > 0) {
      const a = (i - 1) * 2;
      const c = i * 2;
      idx.push(a, c, a + 1, c, c + 1, a + 1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const screen = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: led.tex, side: THREE.DoubleSide }));
  b.add(screen);
  driveLed(b, led, (xs + xb) / 2, y0 + h / 2, zc);
  // body, bezels, caps, legs
  const body = mat(0x15161c, 0.5, 0.4);
  const bezel = mat(0x2a2c34, 0.35, 0.7);
  b.add(mesh(new THREE.BoxGeometry(flat, h + 0.6, r * 2 - 0.08), body, xs + r + flat / 2, y0 + h / 2, zc, true));
  b.add(mesh(new THREE.CylinderGeometry(r - 0.04, r - 0.04, h + 0.6, 18, 1, false, Math.PI, Math.PI), body, xs + r, y0 + h / 2, zc));
  for (const yy of [y0 - 0.25, y0 + h + 0.25]) {
    b.add(mesh(new THREE.BoxGeometry(flat, 0.5, r * 2 + 0.25), bezel, xs + r + flat / 2, yy, zc));
    b.add(mesh(new THREE.CylinderGeometry(r + 0.125, r + 0.125, 0.5, 18, 1, false, Math.PI, Math.PI), bezel, xs + r, yy, zc));
  }
  for (const lx of [xs + r + 0.6, xb - 0.8]) {
    b.add(mesh(new THREE.BoxGeometry(1.0, y0 - 0.5, 1.4), bezel, lx, (y0 - 0.5) / 2, zc, true));
    b.collider(lx - 0.5, lx + 0.5, zc - 0.7, zc + 0.7, 0, y0, true);
  }
  // the name on top, both faces: white lower-case with a hot-pink tube
  const top = y0 + h + 0.5;
  for (const s of [-1, 1]) {
    b.add(neonPanel(b, 'planet hollywood', flat + r + 0.6, 1.5, { style: 'sans', color: '#ff3a8a', fill: '#ffffff', bg: 0x0a0a10, depth: 0.3, size: 0.66 }), xs + (flat + r) / 2 + 0.2, top + 0.75, zc + s * 0.2, s > 0 ? 0 : Math.PI);
  }
}

/** A wide LED ribbon on the podium face at x (facing −x), z0…z1, y0…y1. */
export function phRibbon(b: WorldBuilder, x: number, z0: number, z1: number, y0: number, y1: number): void {
  const led = new LedBoard('MIRACLE MILE', ['170 SHOPS & RESTAURANTS', 'ABC STORES • OPEN 24 HOURS', 'V THEATER', 'SALE • SALE • SALE'], ['#00e0a0', '#ff4aa8', '#ffd000', '#3a7bff'], 512, 128);
  const m = mesh(new THREE.PlaneGeometry(z1 - z0, y1 - y0), new THREE.MeshBasicMaterial({ map: led.tex }), x - 0.02, (y0 + y1) / 2, (z0 + z1) / 2);
  m.rotation.y = -Math.PI / 2;
  b.add(m);
  driveLed(b, led, x, (y0 + y1) / 2, (z0 + z1) / 2);
  b.add(mesh(new THREE.BoxGeometry(0.3, 0.3, z1 - z0 + 0.4), mat(0x2a2c34, 0.35, 0.7), x - 0.1, y0 - 0.15, (z0 + z1) / 2));
  b.add(mesh(new THREE.BoxGeometry(0.3, 0.3, z1 - z0 + 0.4), mat(0x2a2c34, 0.35, 0.7), x - 0.1, y1 + 0.15, (z0 + z1) / 2));
}

/** "planet hollywood" in white lower-case with a pink tube, on a dark band (podium or tower crown), facing −x. */
export function phName(b: WorldBuilder, x: number, y: number, z: number, w: number, h: number): void {
  b.add(neonPanel(b, 'planet hollywood', w, h, { style: 'sans', color: '#ff3a8a', fill: '#ffffff', bg: 0x06060a, depth: 0.35, size: 0.7 }), x, y, z, -Math.PI / 2);
}
