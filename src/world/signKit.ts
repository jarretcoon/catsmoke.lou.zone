import * as THREE from 'three';
import { viewer } from './builder';
import type { WorldBuilder } from './builder';
import { LedBoard } from './textures';
import { chaseBulbMaterial, mat } from './props';

/**
 * Shared kit for the Strip's landmark signs. Everything static is drawn into two 2048² atlases so
 * signs merge per map cell instead of costing a draw call each:
 *  - the LETTER atlas: painted / channel letters and backlit cabinet faces (alpha cut-out, metal-ish
 *    by day, backlit by night through nightGlow);
 *  - the NEON atlas: tubes on black with a coloured halo and a hot white core, drawn additively, dim
 *    glass by day and over the bloom threshold (0.86) only in the thin cores at night.
 * Chasing bulbs share the one chase material from props.ts (dim glass by day, chasing at night), and
 * LED boards only redraw when the camera is near them. One `b.every` drives all of it.
 */

export type LetterStyle = 'roman' | 'serif' | 'script' | 'block' | 'sans' | 'deco' | 'slab' | 'egypt' | 'thin' | 'gothic' | 'road';

const FONT: Record<LetterStyle, (px: number) => string> = {
  roman: (px) => `${px}px "Perpetua Titling MT", "Trajan Pro", "Times New Roman", Georgia, serif`,
  serif: (px) => `bold ${px}px Georgia, "Times New Roman", serif`,
  script: (px) => `italic ${px}px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive`,
  block: (px) => `900 ${px}px "Arial Black", Impact, sans-serif`,
  sans: (px) => `bold ${px}px "Segoe UI", Arial, sans-serif`,
  deco: (px) => `bold ${px}px "Bodoni MT", Didot, "Times New Roman", serif`,
  slab: (px) => `bold ${px}px "Rockwell Extra Bold", Rockwell, "Courier New", serif`,
  egypt: (px) => `bold ${px}px Papyrus, "Copperplate Gothic Bold", Copperplate, Georgia, serif`,
  thin: (px) => `300 ${px}px "Segoe UI Light", "Helvetica Neue", Arial, sans-serif`,
  gothic: (px) => `${px}px "Old English Text MT", "Blackadder ITC", "Engravers MT", Georgia, serif`,
  road: (px) => `bold ${px}px "Highway Gothic", "Arial Narrow", "Segoe UI", Arial, sans-serif`,
};

export function font(style: LetterStyle, px: number): string {
  return FONT[style](Math.round(px));
}

// ---------------------------------------------------------------- atlas
const S = 2048;
const PAD = 10;

interface Page {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  mat: THREE.Material;
  x: number;
  y: number;
  rowH: number;
}

export interface Region {
  page: Page;
  x: number;
  y: number;
  w: number;
  h: number;
}

class Atlas {
  readonly pages: Page[] = [];
  constructor(
    private readonly clear: string | null,
    private readonly makeMat: (tex: THREE.CanvasTexture) => THREE.Material
  ) {}

  private newPage(): Page {
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    if (this.clear) {
      ctx.fillStyle = this.clear;
      ctx.fillRect(0, 0, S, S);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const p: Page = { canvas, ctx, tex, mat: this.makeMat(tex), x: PAD, y: PAD, rowH: 0 };
    this.pages.push(p);
    return p;
  }

  alloc(w: number, h: number): Region {
    w = Math.min(S - PAD * 2, Math.ceil(w));
    h = Math.min(S - PAD * 2, Math.ceil(h));
    let p = this.pages[this.pages.length - 1] ?? this.newPage();
    if (p.x + w + PAD > S) {
      p.x = PAD;
      p.y += p.rowH + PAD;
      p.rowH = 0;
    }
    if (p.y + h + PAD > S) p = this.newPage();
    const r: Region = { page: p, x: p.x, y: p.y, w, h };
    p.x += w + PAD;
    p.rowH = Math.max(p.rowH, h);
    return r;
  }

  /** Draw into a region (clipped, origin at the region's top-left) and flag the page for upload. */
  draw(r: Region, fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
    const { ctx } = r.page;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.translate(r.x, r.y);
    fn(ctx, r.w, r.h);
    ctx.restore();
    r.page.tex.needsUpdate = true;
  }
}

/** A w×h plane facing +z whose UVs cover `r` (optionally a sub-rect u0..u1 / v0..v1 of it, 0..1, top-down). */
export function regionQuad(r: Region, w: number, h: number, u0 = 0, u1 = 1, t0 = 0, t1 = 1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const ux = u0 + uv.getX(i) * (u1 - u0);
    const ty = t0 + (1 - uv.getY(i)) * (t1 - t0);
    uv.setXY(i, (r.x + ux * r.w) / S, 1 - (r.y + ty * r.h) / S);
  }
  return g;
}

// ---------------------------------------------------------------- the kit (one per world)
interface KitState {
  letters: Atlas;
  neon: Atlas;
  neonMats: THREE.MeshBasicMaterial[];
  leds: Array<{ led: LedBoard; x: number; y: number; z: number; r: number }>;
  anim: Array<(t: number, night: number) => void>;
}

const kits = new WeakMap<WorldBuilder, KitState>();

export function kit(b: WorldBuilder): KitState {
  let k = kits.get(b);
  if (k) return k;
  const neonMats: THREE.MeshBasicMaterial[] = [];
  k = {
    letters: new Atlas(null, (tex) =>
      b.nightGlow(
        new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.03, alphaTest: 0.4, roughness: 0.42, metalness: 0.3 }),
        0.03,
        0.62
      )
    ),
    neon: new Atlas('#000000', (tex) => {
      const m = new THREE.MeshBasicMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: true });
      neonMats.push(m);
      return m;
    }),
    neonMats,
    leds: [],
    anim: [],
  };
  kits.set(b, k);
  const state = k;
  LedBoard.viewer = viewer.cam;
  const chase = chaseBulbMaterial();
  const dayBulb = new THREE.Color(0.5, 0.47, 0.42);
  const nightBulb = new THREE.Color(1.22, 1.1, 0.92);
  b.every((_dt, t, night) => {
    const n = THREE.MathUtils.smoothstep(night, 0.15, 0.85);
    // Neon: pale glass tubes by day, saturated at night (cores just cross the bloom threshold)
    const s = THREE.MathUtils.lerp(0.42, 1.18, n);
    for (const m of state.neonMats) m.color.setScalar(s);
    chase.color.copy(dayBulb).lerp(nightBulb, n);
    for (const fn of state.anim) fn(t, n);
    // LED boards: redraw only those the camera can actually read
    const cam = viewer.cam;
    for (const l of state.leds) {
      const dx = cam.x - l.x;
      const dz = cam.z - l.z;
      if (dx * dx + dz * dz < l.r * l.r) l.led.draw(t);
    }
  });
  return k;
}

/** Register an LED board drawn by the kit's updater (skipped when the camera is further than `r`). */
export function driveLed(b: WorldBuilder, led: LedBoard, x: number, y: number, z: number, r = 320): void {
  led.at(x, y, z);
  kit(b).leds.push({ led, x, y, z, r });
}

/** Per-frame hook for a kit-made sign (t seconds, n = 0 day … 1 night, smoothed). */
export function animate(b: WorldBuilder, fn: (t: number, n: number) => void): void {
  kit(b).anim.push(fn);
}

// ---------------------------------------------------------------- drawing helpers
/** Largest font size of `style` (≤ maxPx) at which `text` fits maxW. Leaves ctx.font set. */
export function fitFont(ctx: CanvasRenderingContext2D, text: string, style: LetterStyle, maxW: number, maxPx: number, spacing = 0): number {
  let px = maxPx;
  ctx.font = font(style, px);
  ctx.letterSpacing = `${Math.round(px * spacing)}px`;
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    px = Math.max(8, Math.floor((px * maxW) / w));
    ctx.font = font(style, px);
    ctx.letterSpacing = `${Math.round(px * spacing)}px`;
  }
  return px;
}

/** Polished gold leaf, top to bottom. */
export function goldGradient(ctx: CanvasRenderingContext2D, y0: number, y1: number, tone: 'gold' | 'bronze' | 'silver' | 'rose' = 'gold'): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  const stops: Record<string, string[]> = {
    gold: ['#fff4c2', '#f2c55a', '#b9812a', '#f7d47a', '#fff0b8'],
    bronze: ['#f6d2a6', '#c98a52', '#7a4a26', '#b97a44', '#e8b886'],
    silver: ['#ffffff', '#d8dde4', '#8a929c', '#c8ced6', '#f4f6f8'],
    rose: ['#ffe0ea', '#f4a6c0', '#b85a7a', '#e88aa8', '#ffd6e4'],
  };
  stops[tone].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
  return g;
}

export interface LetterOpts {
  style: LetterStyle;
  /** fill: a CSS colour, or a metal tone for a polished gradient */
  fill: string | 'gold' | 'bronze' | 'silver' | 'rose';
  /** dark return / outline round each letter (reads against pale stone by day) */
  edge?: string;
  edgeW?: number;
  spacing?: number;
  /** opaque cabinet background (otherwise cut-out letters) */
  bg?: string;
  /** a second, smaller line under the main one */
  sub?: string;
  subStyle?: LetterStyle;
  subFill?: string;
  /** relative size of the main line (0..1 of the height) */
  scale?: number;
  /** thin border line inset round an opaque cabinet */
  rule?: string;
}

const METALS = new Set(['gold', 'bronze', 'silver', 'rose']);

/** Paint lettering into a region: used for channel letters and cabinet faces. */
export function paintLetters(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, o: LetterOpts): void {
  if (o.bg) {
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, w, h);
    const v = ctx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(255,255,255,0.08)');
    v.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    if (o.rule) {
      ctx.strokeStyle = o.rule;
      ctx.lineWidth = Math.max(2, h * 0.03);
      ctx.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mainH = h * (o.scale ?? (o.sub ? 0.6 : 0.82));
  const cy = o.sub ? h * 0.4 : h * 0.52;
  const px = fitFont(ctx, text, o.style, w * 0.92, mainH * (o.style === 'script' ? 1.05 : 0.95), o.spacing ?? 0);
  const fillOf = (f: string, y0: number, y1: number) => (METALS.has(f) ? goldGradient(ctx, y0, y1, f as 'gold') : f);
  if (o.edge) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = o.edge;
    ctx.lineWidth = o.edgeW ?? Math.max(3, px * 0.09);
    ctx.strokeText(text, w / 2, cy);
  }
  ctx.fillStyle = fillOf(o.fill, cy - px * 0.45, cy + px * 0.45);
  ctx.fillText(text, w / 2, cy);
  if (o.sub) {
    fitFont(ctx, o.sub, o.subStyle ?? 'sans', w * 0.8, h * 0.2, 0.18);
    if (o.edge) {
      ctx.strokeStyle = o.edge;
      ctx.lineWidth = Math.max(2, h * 0.02);
      ctx.strokeText(o.sub, w / 2, h * 0.82);
    }
    ctx.fillStyle = fillOf(o.subFill ?? o.fill, h * 0.72, h * 0.92);
    ctx.fillText(o.sub, w / 2, h * 0.82);
  }
  ctx.letterSpacing = '0px';
}

/** Neon tube text: coloured halo, tube, white-hot core. Region is black (drawn additively). */
export function paintNeonText(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, style: LetterStyle, px: number, color: string, spacing = 0, tube = 0.055): void {
  ctx.font = font(style, px);
  ctx.letterSpacing = `${Math.round(px * spacing)}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // halo
  ctx.shadowColor = color;
  ctx.shadowBlur = px * 0.32;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = px * tube * 2.6;
  ctx.strokeText(text, cx, cy);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = px * 0.12;
  ctx.lineWidth = px * tube;
  ctx.strokeText(text, cx, cy);
  ctx.shadowBlur = 0;
  // hot core
  ctx.strokeStyle = mixWhite(color, 0.72);
  ctx.lineWidth = Math.max(1.5, px * tube * 0.42);
  ctx.strokeText(text, cx, cy);
  ctx.letterSpacing = '0px';
}

/** Stroke an arbitrary path as a neon tube (halo, tube, core). */
export function neonStroke(ctx: CanvasRenderingContext2D, path: Path2D, color: string, width: number): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = width * 5;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = width * 2.4;
  ctx.stroke(path);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = width * 2;
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = mixWhite(color, 0.72);
  ctx.lineWidth = Math.max(1.2, width * 0.42);
  ctx.stroke(path);
}

export function mixWhite(css: string, k: number): string {
  const c = new THREE.Color(css);
  c.lerp(new THREE.Color(1, 1, 1), k);
  return `#${c.getHexString()}`;
}

// ---------------------------------------------------------------- meshes
const PX_PER_M = 96;

/** Atlas resolution for a w×h metre face: ~96 px/m, capped at 1024 on the long side. */
function regionSize(w: number, h: number, maxSide = 1024): [number, number] {
  let pw = w * PX_PER_M;
  let ph = h * PX_PER_M;
  const k = Math.min(1, maxSide / Math.max(pw, ph));
  pw *= k;
  ph *= k;
  return [Math.max(32, Math.round(pw)), Math.max(16, Math.round(ph))];
}

/** A painted / backlit face from the letter atlas: a w×h plane facing +z (two-sided when `back`). */
export function letterFace(b: WorldBuilder, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, pw: number, ph: number) => void, two?: number, maxSide = 1024): THREE.Object3D {
  const k = kit(b);
  const [pw, ph] = regionSize(w, h, maxSide);
  const r = k.letters.alloc(pw, ph);
  k.letters.draw(r, paint);
  return faces(regionQuad(r, w, h), r.page.mat, two, 0.012);
}

/** Channel / painted letters (or a cabinet face with `o.bg`). Faces +z; `two` = both faces of a board that thick. */
export function letters(b: WorldBuilder, text: string, w: number, h: number, o: LetterOpts, two?: number): THREE.Object3D {
  return letterFace(b, w, h, (ctx, pw, ph) => paintLetters(ctx, pw, ph, text, o), two);
}

/** A neon panel from the neon atlas (draw on black; it is added to whatever is behind it). Faces +z. */
export function neonFace(b: WorldBuilder, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, pw: number, ph: number) => void, two?: number, maxSide = 1024): THREE.Object3D {
  const k = kit(b);
  const [pw, ph] = regionSize(w, h, maxSide);
  const r = k.neon.alloc(pw, ph);
  k.neon.draw(r, paint);
  return faces(regionQuad(r, w, h), r.page.mat, two, 0.03);
}

/** Neon tube lettering centred in a w×h panel. */
export function neonText(b: WorldBuilder, text: string, w: number, h: number, style: LetterStyle, color: string, two?: number, spacing = 0): THREE.Object3D {
  return neonFace(b, w, h, (ctx, pw, ph) => {
    ctx.font = font(style, ph * 0.7);
    ctx.letterSpacing = `${Math.round(ph * 0.7 * spacing)}px`;
    const tw = ctx.measureText(text).width;
    const px = Math.min(ph * (style === 'script' ? 0.78 : 0.64), (ph * 0.7 * pw * 0.84) / Math.max(1, tw));
    paintNeonText(ctx, pw / 2, ph * 0.53, text, style, px, color, spacing);
  }, two);
}

/** One face at z = 0, or (with `two`) a face on each side of a board `two` thick, lifted off it. */
function faces(geo: THREE.BufferGeometry, m: THREE.Material, two: number | undefined, lift: number): THREE.Object3D {
  const front = new THREE.Mesh(geo, m);
  if (two === undefined) return front;
  front.position.z = two / 2 + lift;
  const g = new THREE.Group();
  g.add(front);
  const bk = new THREE.Mesh(geo, m);
  bk.rotation.y = Math.PI;
  bk.position.z = -two / 2 - lift;
  g.add(bk);
  return g;
}

/** Chasing bulbs along a polyline in the local XY plane at depth z (facing +z, or -z when `flip`). */
export function bulbPath(pts: Array<[number, number]>, closed: boolean, spacing = 0.36, size = 0.2, z = 0, flip = false): THREE.Mesh {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const segs = closed ? pts.length : pts.length - 1;
  let n = 0;
  const s = size / 2;
  for (let e = 0; e < segs; e++) {
    const [ax, ay] = pts[e];
    const [bx, by] = pts[(e + 1) % pts.length];
    const len = Math.hypot(bx - ax, by - ay);
    const cnt = Math.max(1, Math.round(len / spacing));
    for (let i = 0; i < cnt + (!closed && e === segs - 1 ? 1 : 0); i++) {
      const t = i / cnt;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      const k = n % 3;
      const u0 = k / 3 + 0.01;
      const u1 = (k + 1) / 3 - 0.01;
      const base = pos.length / 3;
      const xs = flip ? [px + s, px - s] : [px - s, px + s];
      pos.push(xs[0], py - s, z, xs[1], py - s, z, xs[1], py + s, z, xs[0], py + s, z);
      for (let q = 0; q < 4; q++) nor.push(0, 0, flip ? -1 : 1);
      uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      n++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return new THREE.Mesh(g, chaseBulbMaterial());
}

/** Bulb rectangle round a w×h face (front at +z/2 depth, and the back too when `both`). */
export function bulbRect(w: number, h: number, depth: number, inset = 0.2, both = true, spacing = 0.36, size = 0.2): THREE.Object3D {
  const hw = w / 2 - inset;
  const hh = h / 2 - inset;
  const pts: Array<[number, number]> = [
    [-hw, hh],
    [hw, hh],
    [hw, -hh],
    [-hw, -hh],
  ];
  const g = new THREE.Group();
  g.add(bulbPath(pts, true, spacing, size, depth / 2 + 0.015));
  if (both) g.add(bulbPath(pts, true, spacing, size, -depth / 2 - 0.015, true));
  return g;
}

/** LED screen faces (front and back) for a board w×h centred at the origin, depth apart. */
export function ledFaces(led: LedBoard, w: number, h: number, depth: number, both = true): THREE.Object3D {
  const m = new THREE.MeshBasicMaterial({ map: led.tex });
  const g = new THREE.Group();
  const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  f.position.z = depth / 2 + 0.01;
  g.add(f);
  if (both) {
    const bk = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    bk.rotation.y = Math.PI;
    bk.position.z = -depth / 2 - 0.01;
    g.add(bk);
  }
  return g;
}

/** Axis-aligned collider round a local box (cx, cz, w, d) of an object placed at (x, z) turned by rotY. */
export function rotatedCollider(b: WorldBuilder, x: number, z: number, rotY: number, cx: number, cz: number, w: number, d: number, y0: number, y1: number, wall = true): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [px, pz] of [
    [cx - w / 2, cz - d / 2],
    [cx + w / 2, cz - d / 2],
    [cx + w / 2, cz + d / 2],
    [cx - w / 2, cz + d / 2],
  ]) {
    const wx = x + px * c + pz * s;
    const wz = z - px * s + pz * c;
    minX = Math.min(minX, wx);
    maxX = Math.max(maxX, wx);
    minZ = Math.min(minZ, wz);
    maxZ = Math.max(maxZ, wz);
  }
  b.collider(minX, maxX, minZ, maxZ, y0, y1, wall);
}

/** Small helper: a positioned mesh. */
export function part(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

export function placed<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}

// ---------------------------------------------------------------- composite pieces
export interface NeonPanelOpts {
  style: LetterStyle;
  /** tube colour */
  color: string;
  /** painted letter colour behind the tubes (reads by day); defaults to the tube colour */
  fill?: string;
  /** backing cabinet colour (none = tubes and letters only) */
  bg?: number;
  depth?: number;
  spacing?: number;
  /** both faces */
  two?: boolean;
  /** 0..1 of the panel height for the letters */
  size?: number;
}

/** Painted letters (day) under neon tubes (night) on an optional backing cabinet; faces +z. */
export function neonPanel(b: WorldBuilder, text: string, w: number, h: number, o: NeonPanelOpts): THREE.Group {
  const g = new THREE.Group();
  const d = o.depth ?? 0.35;
  if (o.bg !== undefined) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(o.bg, 0.6));
    g.add(cab);
  }
  const size = o.size ?? 0.7;
  const layout = (ctx: CanvasRenderingContext2D, pw: number, ph: number) => {
    ctx.font = font(o.style, ph * size);
    ctx.letterSpacing = `${Math.round(ph * size * (o.spacing ?? 0))}px`;
    const tw = ctx.measureText(text).width;
    return Math.min(ph * size * (o.style === 'script' ? 1.1 : 0.92), (ph * size * pw * 0.86) / Math.max(1, tw));
  };
  const two = o.two ? d : undefined;
  const fillFace = letterFace(b, w, h, (ctx, pw, ph) => {
    const px = layout(ctx, pw, ph);
    ctx.font = font(o.style, px);
    ctx.letterSpacing = `${Math.round(px * (o.spacing ?? 0))}px`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = o.fill ?? o.color;
    ctx.fillText(text, pw / 2, ph * 0.53);
    ctx.letterSpacing = '0px';
  }, two);
  const tubes = neonFace(b, w, h, (ctx, pw, ph) => paintNeonText(ctx, pw / 2, ph * 0.53, text, o.style, layout(ctx, pw, ph), o.color, o.spacing ?? 0), two);
  if (!o.two) {
    fillFace.position.z = d / 2 + 0.012;
    tubes.position.z = d / 2 + 0.03;
  }
  g.add(fillFace, tubes);
  return g;
}

export interface PylonSpec {
  /** LED board size and its bottom height */
  w: number;
  ledH: number;
  ledY: number;
  led: LedBoard;
  depth?: number;
  frame: THREE.Material;
  trim?: THREE.Material;
  legs: 'single' | 'twin' | 'slab';
  legW?: number;
  /** crown cabinet over the board, painted into the letter atlas on both faces */
  crownH: number;
  crownW?: number;
  crown: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** chasing bulbs round the crown */
  bulbs?: boolean;
}

/**
 * Generic Strip marquee: legs, an LED board in a frame, a backlit crown cabinet with the property's
 * lettering. Returns the group (faces ±z, origin at the foot) and its top height.
 */
export function marqueePylon(b: WorldBuilder, s: PylonSpec): { g: THREE.Group; top: number } {
  const g = new THREE.Group();
  const d = s.depth ?? 1.2;
  const legW = s.legW ?? 1.4;
  if (s.legs === 'single') g.add(part(new THREE.BoxGeometry(legW, s.ledY, Math.min(d, legW)), s.frame, 0, s.ledY / 2, 0));
  else if (s.legs === 'twin') for (const x of [-1, 1]) g.add(part(new THREE.BoxGeometry(legW, s.ledY, d * 0.8), s.frame, x * (s.w / 2 - legW * 0.8), s.ledY / 2, 0));
  else g.add(part(new THREE.BoxGeometry(s.w * 0.7, s.ledY, d * 0.8), s.frame, 0, s.ledY / 2, 0));
  g.add(part(new THREE.BoxGeometry(s.w + 1.2, 0.5, d + 1.4), s.frame, 0, 0.25, 0));
  const cy = s.ledY + s.ledH / 2;
  g.add(part(new THREE.BoxGeometry(s.w + 0.5, s.ledH + 0.5, d), s.frame, 0, cy, 0));
  g.add(placed(ledFaces(s.led, s.w, s.ledH, d), 0, cy, 0));
  if (s.trim) for (const sy of [-1, 1]) g.add(part(new THREE.BoxGeometry(s.w + 0.7, 0.14, d + 0.1), s.trim, 0, cy + sy * (s.ledH / 2 + 0.25), 0));
  const cw = s.crownW ?? s.w + 0.8;
  const crownY = s.ledY + s.ledH + 0.25 + s.crownH / 2;
  g.add(part(new THREE.BoxGeometry(cw, s.crownH, d + 0.2), s.frame, 0, crownY, 0));
  g.add(placed(letterFace(b, cw - 0.1, s.crownH - 0.1, s.crown, d + 0.2), 0, crownY, 0));
  if (s.bulbs) g.add(placed(bulbRect(cw - 0.1, s.crownH - 0.1, d + 0.24, 0.18, true, 0.34, 0.2), 0, crownY, 0));
  return { g, top: crownY + s.crownH / 2 };
}
