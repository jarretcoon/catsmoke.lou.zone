import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { font, mixWhite, paintNeonText, type LetterStyle } from './signKit';
import { prng } from './themedKit';

/*
 * One 2048×3072 canvas atlas for the whole LINQ Promenade: every storefront sign, blade sign, kiosk
 * header and the painted shop interiors seen through the windows. Two shared materials read it
 * (signs and windows), so a hundred storefront pieces merge into a handful of draw calls. Lettering
 * is drawn here in generic fonts (no logos): the names and colours follow the 2026 tenant directory
 * and photos of the real storefronts.
 */

export type Rect = [number, number, number, number]; // px x, y, w, h (y down)
export const LINQ_ATLAS = 2048;
/** The atlas is 2048 wide and this tall (signs + painted interiors). */
export const LINQ_ATLAS_H = 3072;

export interface Painter {
  w: number;
  h: number;
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

const painters = new Map<string, Painter>();
const rects = new Map<string, Rect>();
let canvas: HTMLCanvasElement | null = null;
let tex: THREE.CanvasTexture | null = null;

/** Register a region to paint (before the first `linqTex()` call). */
function reg(name: string, w: number, h: number, paint: Painter['paint']): void {
  painters.set(name, { w, h, paint });
}

/** Shelf-pack every registered painter and draw them once. */
function build(): void {
  canvas = document.createElement('canvas');
  canvas.width = LINQ_ATLAS;
  canvas.height = LINQ_ATLAS_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, LINQ_ATLAS, LINQ_ATLAS_H);
  const list = [...painters.entries()].sort((a, b) => b[1].h - a[1].h);
  // shelves (rows) holding columns; a short item stacks under another in a column with room left
  let x = 0;
  let y = 0;
  let rowH = 0;
  const PAD = 6;
  let cols: Array<{ x: number; w: number; used: number }> = [];
  for (const [name, p] of list) {
    let px = -1;
    let py = 0;
    const col = cols.find((c) => c.w >= p.w && c.used + PAD + p.h <= rowH);
    if (col) {
      px = col.x;
      py = y + col.used + PAD;
      col.used += PAD + p.h;
    } else {
      if (x + p.w > LINQ_ATLAS) {
        x = 0;
        y += rowH + PAD;
        rowH = 0;
        cols = [];
      }
      if (rowH === 0) rowH = p.h;
      px = x;
      py = y;
      cols.push({ x, w: p.w, used: p.h });
      x += p.w + PAD;
    }
    if (py + p.h > LINQ_ATLAS_H) throw new Error(`linqAtlas: out of room at ${name}`);
    ctx.save();
    ctx.translate(px, py);
    ctx.beginPath();
    ctx.rect(0, 0, p.w, p.h);
    ctx.clip();
    p.paint(ctx, p.w, p.h);
    ctx.restore();
    rects.set(name, [px, py, p.w, p.h]);
  }
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
}

export function linqTex(): THREE.CanvasTexture {
  if (!tex) build();
  return tex!;
}
export function linqRect(name: string): Rect {
  if (!tex) build();
  const r = rects.get(name);
  if (!r) throw new Error(`linqAtlas: no region ${name}`);
  return r;
}

let signMat: THREE.MeshStandardMaterial | null = null;
let winMat: THREE.MeshStandardMaterial | null = null;
/** Backlit signs: lit by day, glowing after dark (bright cores reach the bloom). */
export function linqSignMat(b: WorldBuilder): THREE.MeshStandardMaterial {
  if (!signMat) {
    signMat = new THREE.MeshStandardMaterial({ map: linqTex(), emissiveMap: linqTex(), emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.5 });
    b.nightGlow(signMat, 0.22, 1.05);
  }
  return signMat;
}
/** Shop windows with their painted interiors: dim glass by day, warm and lit at night. */
export function linqWindowMat(b: WorldBuilder): THREE.MeshStandardMaterial {
  if (!winMat) {
    winMat = new THREE.MeshStandardMaterial({ map: linqTex(), emissiveMap: linqTex(), emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.12, metalness: 0.25 });
    b.nightGlow(winMat, 0.3, 0.78);
  }
  return winMat;
}

// ------------------------------------------------------------------ painters
function fit(ctx: CanvasRenderingContext2D, s: string, style: LetterStyle, px: number, maxW: number): number {
  let size = px;
  ctx.font = font(style, size);
  while (ctx.measureText(s).width > maxW && size > 8) {
    size -= 2;
    ctx.font = font(style, size);
  }
  return size;
}
export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, style: LetterStyle, px: number, maxW: number, fill: string | CanvasGradient, stroke?: string, sw = 0): void {
  fit(ctx, s, style, px, maxW);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke && sw) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = sw;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
}
export function glowText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, style: LetterStyle, px: number, maxW: number, fill: string, glow: string): void {
  ctx.shadowColor = glow;
  ctx.shadowBlur = px * 0.35;
  text(ctx, s, x, y, style, px, maxW, fill);
  ctx.shadowBlur = 0;
}

export interface SignSpec {
  text: string;
  sub?: string;
  style: LetterStyle;
  subStyle?: LetterStyle;
  fg: string;
  bg: string;
  /** 'panel' = backlit cabinet, 'neon' = tubes on black, 'channel' = lit letters on a dark band. */
  look: 'panel' | 'neon' | 'channel';
  border?: string;
  w?: number;
  h?: number;
}

export function paintSign(s: SignSpec): Painter['paint'] {
  return (ctx, w, h) => {
    if (s.look === 'neon') {
      ctx.fillStyle = s.bg;
      ctx.fillRect(0, 0, w, h);
      const main = s.sub ? h * 0.36 : h * 0.5;
      const px = fit(ctx, s.text, s.style, h * (s.sub ? 0.5 : 0.64), w * 0.86);
      paintNeonText(ctx, w / 2, main, s.text, s.style, px, s.fg, 0.02, 0.06);
      if (s.sub) {
        const spx = fit(ctx, s.sub, s.subStyle ?? 'sans', h * 0.2, w * 0.8);
        paintNeonText(ctx, w / 2, h * 0.78, s.sub, s.subStyle ?? 'sans', spx, s.border ?? mixWhite(s.fg, 0.3), 0.08, 0.07);
      }
      return;
    }
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, w, h);
    if (s.look === 'panel') {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (s.border) {
      ctx.strokeStyle = s.border;
      ctx.lineWidth = Math.max(4, h * 0.05);
      ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
    }
    const main = s.sub ? h * 0.4 : h * 0.52;
    if (s.look === 'channel') glowText(ctx, s.text, w / 2, main, s.style, h * (s.sub ? 0.52 : 0.66), w * 0.88, s.fg, s.fg);
    else text(ctx, s.text, w / 2, main, s.style, h * (s.sub ? 0.52 : 0.66), w * 0.88, s.fg);
    if (s.sub) text(ctx, s.sub, w / 2, h * 0.8, s.subStyle ?? 'sans', h * 0.2, w * 0.84, s.border ?? s.fg);
  };
}

/** Register a plain storefront sign. */
export function signRegion(name: string, s: SignSpec): void {
  reg(name, s.w ?? 512, s.h ?? 128, paintSign(s));
}

// ---------------------------------------------------------------- shop-window interiors
type Interior = 'bar' | 'diner' | 'candy' | 'shop' | 'cafe' | 'bowl' | 'ice' | 'hats' | 'pizza' | 'upper' | 'sweets' | 'pub' | 'casino' | 'tattoo';

export function interiorPainter(kind: Interior, seed: number): Painter['paint'] {
  return (ctx, w, h) => {
    const r = prng(seed);
    // back wall + floor with a warm falloff
    const warm = kind === 'ice' ? '#7ad4ff' : kind === 'casino' ? '#3a7a3a' : kind === 'bowl' ? '#5a2a7a' : '#ffcf8a';
    const wall = ctx.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, kind === 'ice' ? '#0b2a44' : '#2a1a10');
    wall.addColorStop(0.62, kind === 'ice' ? '#2f7fb0' : kind === 'bowl' ? '#30164a' : '#6a4426');
    wall.addColorStop(0.63, '#1a120c');
    wall.addColorStop(1, '#3a2a1e');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);
    // ceiling lamps
    for (let i = 0; i < 4; i++) {
      const x = w * (0.14 + i * 0.24);
      const g = ctx.createRadialGradient(x, h * 0.12, 2, x, h * 0.12, w * 0.2);
      g.addColorStop(0, warm);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h * 0.6);
      ctx.fillStyle = '#fff3d0';
      ctx.fillRect(x - 6, h * 0.08, 12, 6);
    }
    const shelf = (y: number, colors: string[], dot = 7) => {
      ctx.fillStyle = '#3b2615';
      ctx.fillRect(w * 0.05, y + dot, w * 0.9, 4);
      for (let x = w * 0.07; x < w * 0.93; x += dot * 1.6) {
        ctx.fillStyle = colors[Math.floor(r() * colors.length)];
        ctx.fillRect(x, y + dot - dot * (0.8 + r() * 0.9), dot, dot * (0.8 + r() * 0.9));
      }
    };
    const people = (n: number, y: number) => {
      for (let i = 0; i < n; i++) {
        const x = w * (0.1 + r() * 0.8);
        const s = 0.8 + r() * 0.4;
        ctx.fillStyle = `hsl(${Math.floor(r() * 360)},45%,${30 + r() * 25}%)`;
        ctx.fillRect(x - 9 * s, y - 34 * s, 18 * s, 34 * s);
        ctx.fillStyle = '#c9946a';
        ctx.beginPath();
        ctx.arc(x, y - 42 * s, 8 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    switch (kind) {
      case 'bar':
      case 'pub':
        for (let i = 0; i < 3; i++) shelf(h * (0.18 + i * 0.12), ['#7ac943', '#c8a24a', '#e8e0c8', '#a3332c', '#3a7ac8'], 6);
        ctx.fillStyle = kind === 'pub' ? '#2c4a2a' : '#4a2a16';
        ctx.fillRect(0, h * 0.6, w, h * 0.1);
        ctx.fillStyle = '#c8a24a';
        ctx.fillRect(0, h * 0.6, w, 4);
        people(5, h * 0.62);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = '#111';
          ctx.fillRect(w * (0.12 + i * 0.3), h * 0.05, w * 0.18, h * 0.08);
          ctx.fillStyle = ['#1d6a2a', '#2a3a8a', '#8a2a2a'][i];
          ctx.fillRect(w * (0.125 + i * 0.3), h * 0.055, w * 0.17, h * 0.07);
        }
        break;
      case 'diner':
      case 'cafe':
      case 'pizza':
        if (kind === 'pizza') {
          const g = ctx.createRadialGradient(w * 0.75, h * 0.42, 4, w * 0.75, h * 0.42, w * 0.18);
          g.addColorStop(0, '#fff2a0');
          g.addColorStop(0.4, '#ff7a20');
          g.addColorStop(1, 'rgba(60,20,0,0)');
          ctx.fillStyle = '#6a3a22';
          ctx.beginPath();
          ctx.arc(w * 0.75, h * 0.5, w * 0.16, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = g;
          ctx.fillRect(w * 0.55, h * 0.3, w * 0.4, h * 0.3);
        }
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = kind === 'cafe' ? '#2a5a3a' : '#8a1c1c';
          ctx.fillRect(w * (0.05 + i * 0.24), h * 0.5, w * 0.16, h * 0.14);
          ctx.fillStyle = '#d8cbb2';
          ctx.fillRect(w * (0.07 + i * 0.24), h * 0.58, w * 0.12, 5);
        }
        people(4, h * 0.66);
        break;
      case 'candy':
      case 'sweets':
        for (let i = 0; i < 5; i++) shelf(h * (0.12 + i * 0.1), ['#ff4fa8', '#ffd24d', '#4de0ff', '#7dff6a', '#ff7a3d', '#b07dff', '#ffffff'], 9);
        ctx.fillStyle = '#ff8ac8';
        ctx.fillRect(0, h * 0.63, w, h * 0.06);
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = ['#ff4fa8', '#4de0ff', '#ffd24d'][i % 3];
          ctx.beginPath();
          ctx.arc(w * (0.1 + i * 0.16), h * 0.78, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillRect(w * (0.1 + i * 0.16) - 2, h * 0.78, 4, h * 0.2);
        }
        people(2, h * 0.64);
        break;
      case 'shop':
      case 'hats':
      case 'tattoo':
        for (let row = 0; row < 3; row++) {
          ctx.fillStyle = '#c0c0c0';
          ctx.fillRect(w * 0.06, h * (0.16 + row * 0.16), w * 0.88, 3);
          for (let x = w * 0.08; x < w * 0.92; x += 16) {
            ctx.fillStyle = `hsl(${Math.floor(r() * 360)},${kind === 'hats' ? 30 : 70}%,${kind === 'hats' ? 35 : 55}%)`;
            if (kind === 'hats') {
              ctx.beginPath();
              ctx.ellipse(x + 6, h * (0.15 + row * 0.16), 9, 5, 0, Math.PI, 0);
              ctx.fill();
              ctx.fillRect(x - 4, h * (0.15 + row * 0.16), 20, 3);
            } else ctx.fillRect(x, h * (0.17 + row * 0.16), 12, h * 0.1);
          }
        }
        if (kind === 'shop') {
          ctx.fillStyle = '#ffd24d';
          ctx.font = font('block', 26);
          ctx.textAlign = 'center';
          ctx.fillText('VEGAS', w * 0.5, h * 0.7);
        }
        people(3, h * 0.66);
        break;
      case 'bowl':
        for (let i = 0; i < 6; i++) {
          const x0 = w * (0.02 + i * 0.165);
          ctx.fillStyle = '#d8a860';
          ctx.beginPath();
          ctx.moveTo(x0, h);
          ctx.lineTo(x0 + w * 0.13, h);
          ctx.lineTo(x0 + w * 0.09, h * 0.35);
          ctx.lineTo(x0 + w * 0.05, h * 0.35);
          ctx.fill();
          ctx.fillStyle = '#fff';
          for (let p = 0; p < 4; p++) ctx.fillRect(x0 + w * 0.05 + p * 4, h * 0.3, 3, 8);
        }
        ctx.fillStyle = '#ff3a6a';
        ctx.fillRect(0, h * 0.2, w, 6);
        people(3, h * 0.95);
        break;
      case 'ice':
        for (let i = 0; i < 9; i++) {
          ctx.fillStyle = `rgba(200,240,255,${0.3 + r() * 0.4})`;
          ctx.fillRect(w * r(), h * r() * 0.6, 18 + r() * 30, 18 + r() * 30);
        }
        people(3, h * 0.7);
        break;
      case 'casino':
        for (let i = 0; i < 7; i++) {
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(w * (0.04 + i * 0.135), h * 0.32, w * 0.1, h * 0.3);
          ctx.fillStyle = ['#4dff7a', '#ffd24d', '#ff4fa8', '#4de0ff'][i % 4];
          ctx.fillRect(w * (0.05 + i * 0.135), h * 0.35, w * 0.08, h * 0.1);
        }
        people(3, h * 0.7);
        break;
      case 'upper': {
        ctx.fillStyle = '#20160f';
        ctx.fillRect(0, 0, w, h);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#e8b070');
        g.addColorStop(1, '#5a3a20');
        ctx.fillStyle = g;
        ctx.fillRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8);
        ctx.fillStyle = 'rgba(30,20,10,0.55)';
        ctx.fillRect(w * 0.08, h * 0.1, w * 0.84, h * 0.3);
        break;
      }
    }
    // glass sheen
    const sheen = ctx.createLinearGradient(0, 0, w, h);
    sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
    sheen.addColorStop(0.4, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.7, 'rgba(255,255,255,0.06)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
  };
}
export const INTERIORS: Interior[] = ['bar', 'diner', 'candy', 'shop', 'cafe', 'bowl', 'ice', 'hats', 'pizza', 'upper', 'sweets', 'pub', 'casino', 'tattoo'];
INTERIORS.forEach((k, i) => reg(`win:${k}`, 256, 256, interiorPainter(k, 77 + i * 13)));
export type { Interior };

// ---------------------------------------------------------------- special art
// Virgil's tall blade marquee: red with orange-lit letters running down, bulbs round the edge
reg('virgils-blade', 128, 512, (ctx, w, h) => {
  ctx.fillStyle = '#b8261c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffcc66';
  for (let y = 10; y < h; y += 22) {
    ctx.beginPath();
    ctx.arc(10, y, 5, 0, Math.PI * 2);
    ctx.arc(w - 10, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  const letters = "VIRGIL'S";
  letters.split('').forEach((c, i) => glowText(ctx, c, w / 2, 36 + i * 50, 'slab', 52, w * 0.7, '#ffe9b0', '#ff9a2a'));
  ctx.fillStyle = '#fff';
  ctx.fillRect(14, h - 76, w - 28, 54);
  text(ctx, 'BBQ', w / 2, h - 49, 'slab', 40, w * 0.7, '#b8261c');
});
// Brooklyn Bowl: white lettering in a red-and-black badge with a bowling pin
reg('brooklyn-bowl', 512, 256, (ctx, w, h) => {
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d62a2a';
  ctx.fillRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = '#121212';
  ctx.fillRect(22, 22, w - 44, h - 44);
  text(ctx, 'BROOKLYN', w * 0.56, h * 0.36, 'block', 80, w * 0.66, '#ffffff');
  text(ctx, 'BOWL', w * 0.56, h * 0.68, 'block', 92, w * 0.66, '#ffffff');
  // pin
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(w * 0.13, h * 0.66, 26, 46, 0, 0, Math.PI * 2);
  ctx.ellipse(w * 0.13, h * 0.3, 15, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d62a2a';
  ctx.fillRect(w * 0.13 - 16, h * 0.42, 32, 7);
  ctx.fillRect(w * 0.13 - 18, h * 0.47, 36, 7);
});
// Ghirardelli: gold script on cream, the gold-lit name across the upper floor
reg('ghirardelli', 512, 128, (ctx, w, h) => {
  ctx.fillStyle = '#efe4cc';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.85);
  g.addColorStop(0, '#fff1b0');
  g.addColorStop(0.5, '#e0a83a');
  g.addColorStop(1, '#9a6a1c');
  ctx.shadowColor = '#ffcf6a';
  ctx.shadowBlur = 14;
  text(ctx, 'Ghirardelli', w / 2, h * 0.55, 'script', 104, w * 0.92, g, '#6a4a12', 3);
  ctx.shadowBlur = 0;
});
// I Love Sugar: a big pink heart, candy-striped edges
reg('ilovesugar', 512, 192, (ctx, w, h) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  for (let x = -h; x < w; x += 36) {
    ctx.fillStyle = '#ff4fa8';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 18, 0);
    ctx.lineTo(x + 18 + h * 0.12, h * 0.12);
    ctx.lineTo(x + h * 0.12, h * 0.12);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + 18, h);
    ctx.lineTo(x + 18 + h * 0.12, h * 0.88);
    ctx.lineTo(x + h * 0.12, h * 0.88);
    ctx.fill();
  }
  text(ctx, 'I', w * 0.2, h * 0.5, 'block', 96, 80, '#2a1a4a');
  ctx.fillStyle = '#ff2a7a';
  ctx.shadowColor = '#ff6ab0';
  ctx.shadowBlur = 16;
  const cx = w * 0.36;
  const cy = h * 0.52;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 46);
  ctx.bezierCurveTo(cx - 80, cy - 10, cx - 40, cy - 66, cx, cy - 26);
  ctx.bezierCurveTo(cx + 40, cy - 66, cx + 80, cy - 10, cx, cy + 46);
  ctx.fill();
  ctx.shadowBlur = 0;
  text(ctx, 'SUGAR', w * 0.7, h * 0.5, 'block', 96, w * 0.48, '#2a1a4a');
});
// O'Sheas: green with a white shamrock
reg('osheas', 512, 160, (ctx, w, h) => {
  ctx.fillStyle = '#0d5a2a';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f2d36a';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = '#7dff6a';
  for (const [dx, dy] of [
    [0, -18],
    [-17, 4],
    [17, 4],
  ]) {
    ctx.beginPath();
    ctx.arc(w * 0.12 + dx, h * 0.48 + dy, 17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(w * 0.12 - 3, h * 0.55, 6, 34);
  glowText(ctx, "O'SHEAS", w * 0.58, h * 0.42, 'slab', 84, w * 0.7, '#ffffff', '#7dff6a');
  text(ctx, 'CASINO • BEER PONG', w * 0.58, h * 0.78, 'sans', 26, w * 0.7, '#f2d36a');
});
// Chayo: a painted sugar skull beside the name
reg('chayo', 512, 160, (ctx, w, h) => {
  ctx.fillStyle = '#1a1214';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f4efe6';
  ctx.beginPath();
  ctx.ellipse(w * 0.13, h * 0.45, 40, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(w * 0.13 - 24, h * 0.62, 48, 26);
  ctx.fillStyle = '#1a1214';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(w * 0.13 + s * 16, h * 0.42, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff4fa8';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(w * 0.13 + s * 16, h * 0.42, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  glowText(ctx, 'CHAYO', w * 0.6, h * 0.4, 'block', 80, w * 0.66, '#ff6a3a', '#ff3a1a');
  text(ctx, 'MEXICAN KITCHEN + TEQUILA BAR', w * 0.6, h * 0.78, 'sans', 24, w * 0.7, '#ffd24d');
});
// Welcome to Fabulous Las Vegas souvenir shop: the diamond sign shape on a navy band
reg('welcome-shop', 512, 192, (ctx, w, h) => {
  ctx.fillStyle = '#101a3a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f6f1e2';
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 8);
  ctx.lineTo(w - 20, h * 0.5);
  ctx.lineTo(w * 0.5, h - 8);
  ctx.lineTo(20, h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffcf3a';
  ctx.lineWidth = 5;
  ctx.stroke();
  text(ctx, 'WELCOME TO', w * 0.5, h * 0.3, 'sans', 24, w * 0.4, '#d62a2a');
  text(ctx, 'Fabulous', w * 0.5, h * 0.5, 'script', 44, w * 0.5, '#2a5ad8');
  text(ctx, 'LAS VEGAS', w * 0.5, h * 0.7, 'block', 34, w * 0.5, '#d62a2a');
  text(ctx, 'SOUVENIRS', w * 0.14, h * 0.5, 'block', 26, w * 0.2, '#ffcf3a');
  text(ctx, 'GIFTS', w * 0.86, h * 0.5, 'block', 30, w * 0.2, '#ffcf3a');
});
// Category 10: a black band, storm-swirl and white letters (opened Oct 2026 in the Flamingo corner)
reg('category10', 512, 192, (ctx, w, h) => {
  ctx.fillStyle = '#0c0c0e';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e8e2d2';
  ctx.lineWidth = 5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(w * 0.13, h * 0.5, 18 + i * 14, i * 1.4, i * 1.4 + 4.2);
    ctx.stroke();
  }
  text(ctx, "LUKE COMBS'", w * 0.6, h * 0.22, 'sans', 28, w * 0.66, '#c8a24a');
  glowText(ctx, 'CATEGORY 10', w * 0.6, h * 0.52, 'block', 70, w * 0.7, '#f4efe6', '#ffffff');
  text(ctx, 'BAR • LIVE MUSIC • TO-GO WINDOW', w * 0.6, h * 0.82, 'sans', 22, w * 0.7, '#c8a24a');
});
// Striped awning cloth (red/white, green/cream, navy/white …) as one strip of swatches
const AWN: Array<[string, string, string]> = [
  ['awn:red', '#c8202a', '#f4efe6'],
  ['awn:green', '#1d5a3a', '#efe6cc'],
  ['awn:navy', '#1a2a5a', '#f4efe6'],
  ['awn:pink', '#ff4fa8', '#ffffff'],
  ['awn:black', '#141416', '#2a2a2e'],
  ['awn:teal', '#0f6a72', '#e8f6f4'],
  ['awn:orange', '#e8641c', '#fff2dc'],
];
for (const [n, a, c] of AWN) {
  reg(n, 128, 64, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? c : a;
      ctx.fillRect((i * w) / 8, 0, w / 8 + 1, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
  });
}
// Night-time LED wall (the screens over the promenade): a static colourful frame (cheap)
reg('led-wall', 512, 256, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2a0a5a');
  g.addColorStop(0.5, '#0a3a8a');
  g.addColorStop(1, '#5a0a4a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  glowText(ctx, 'THE LINQ', w / 2, h * 0.36, 'thin', 92, w * 0.8, '#ffffff', '#6ae0ff');
  text(ctx, 'PROMENADE', w / 2, h * 0.64, 'sans', 40, w * 0.6, '#ffd24d');
  ctx.fillStyle = '#ff4fa8';
  ctx.fillRect(w * 0.2, h * 0.8, w * 0.6, 6);
});
