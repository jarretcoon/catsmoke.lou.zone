import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { glowText, INTERIORS, interiorPainter, paintSign, text, type Painter, type Rect, type SignSpec } from './linqAtlas';
import { prng } from './themedKit';

/*
 * A canvas atlas for one stretch of Strip frontage shops (frontageShops*.ts): every storefront sign,
 * awning cloth and the painted shop interiors seen through the windows, packed into one texture so a
 * whole block of storefronts draws with a handful of materials. Same packer and painters as the LINQ
 * Promenade's atlas (linqAtlas.ts), but each area gets its own canvas so the areas stay independent.
 * Lettering is drawn in generic fonts in each brand's colours (no logos, no photos).
 */

export type { Rect, SignSpec };

/** Window interiors this atlas adds to the LINQ set (bar, diner, candy, shop, cafe, …). */
export type FrontInterior =
  | 'bar' | 'diner' | 'candy' | 'shop' | 'cafe' | 'pizza' | 'upper' | 'sweets' | 'pub' | 'casino' | 'hats'
  | 'chocolate' | 'pharmacy' | 'apparel' | 'sneakers' | 'jewelry' | 'chicken' | 'lux' | 'lobby' | 'plush' | 'froyo';

const AWNINGS: Array<[string, string, string]> = [
  ['awn:red', '#c8202a', '#f4efe6'],
  ['awn:green', '#1d5a3a', '#efe6cc'],
  ['awn:navy', '#1a2a5a', '#f4efe6'],
  ['awn:pink', '#ff4fa8', '#ffffff'],
  ['awn:black', '#141416', '#2a2a2e'],
  ['awn:brown', '#4a2614', '#6a3a22'],
  ['awn:orange', '#e8641c', '#fff2dc'],
  ['awn:yellow', '#f4c21a', '#fff6d8'],
];

export class ShopAtlas {
  private readonly painters = new Map<string, Painter>();
  private readonly rects = new Map<string, Rect>();
  private canvas: HTMLCanvasElement | null = null;
  private t: THREE.CanvasTexture | null = null;
  private sm: THREE.MeshStandardMaterial | null = null;
  private wm: THREE.MeshStandardMaterial | null = null;
  private lm: THREE.MeshStandardMaterial | null = null;
  private sm2: THREE.MeshStandardMaterial | null = null;

  constructor(
    readonly name: string,
    readonly W = 2048,
    readonly H = 2048
  ) {
    INTERIORS.forEach((k, i) => this.reg(`win:${k}`, 256, 256, interiorPainter(k, 177 + i * 13)));
    (['chocolate', 'pharmacy', 'apparel', 'sneakers', 'jewelry', 'chicken', 'lux', 'lobby', 'plush', 'froyo'] as const).forEach((k, i) => this.reg(`win:${k}`, 256, 256, frontInterior(k, 311 + i * 17)));
    for (const [n, a, c] of AWNINGS) {
      this.reg(n, 128, 64, (ctx, w, h) => {
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? c : a;
          ctx.fillRect((i * w) / 8, 0, w / 8 + 1, h);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, h * 0.82, w, h * 0.18);
      });
    }
  }

  /** Register a painter (before the first `tex()`). */
  reg(name: string, w: number, h: number, paint: Painter['paint']): void {
    if (this.t) throw new Error(`${this.name}: atlas already built (${name})`);
    this.painters.set(name, { w, h, paint });
  }
  /** A plain storefront sign (panel / neon / channel letters). */
  sign(name: string, s: SignSpec): void {
    this.reg(name, s.w ?? 512, s.h ?? 128, paintSign(s));
  }

  private build(): void {
    const c = document.createElement('canvas');
    c.width = this.W;
    c.height = this.H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.W, this.H);
    const list = [...this.painters.entries()].sort((a, b) => b[1].h - a[1].h || b[1].w - a[1].w);
    let x = 0;
    let y = 0;
    let rowH = 0;
    const PAD = 6;
    let cols: Array<{ x: number; w: number; used: number }> = [];
    for (const [name, p] of list) {
      let px: number;
      let py: number;
      const col = cols.find((q) => q.w >= p.w && q.used + PAD + p.h <= rowH);
      if (col) {
        px = col.x;
        py = y + col.used + PAD;
        col.used += PAD + p.h;
      } else {
        if (x + p.w > this.W) {
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
      if (py + p.h > this.H) throw new Error(`${this.name}: atlas out of room at ${name}`);
      ctx.save();
      ctx.translate(px, py);
      ctx.beginPath();
      ctx.rect(0, 0, p.w, p.h);
      ctx.clip();
      p.paint(ctx, p.w, p.h);
      ctx.restore();
      this.rects.set(name, [px, py, p.w, p.h]);
    }
    this.canvas = c;
    this.t = new THREE.CanvasTexture(c);
    this.t.colorSpace = THREE.SRGBColorSpace;
    this.t.anisotropy = 8;
  }

  tex(): THREE.CanvasTexture {
    if (!this.t) this.build();
    return this.t!;
  }
  rect(name: string): Rect {
    if (!this.t) this.build();
    const r = this.rects.get(name);
    if (!r) throw new Error(`${this.name}: no region ${name}`);
    return r;
  }
  has(name: string): boolean {
    return this.painters.has(name);
  }
  /** Backlit signs: lit by day, glowing after dark (bright cores reach the bloom). */
  signMat(b: WorldBuilder): THREE.MeshStandardMaterial {
    if (!this.sm) {
      this.sm = new THREE.MeshStandardMaterial({ map: this.tex(), emissiveMap: this.tex(), emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.5 });
      b.nightGlow(this.sm, 0.22, 1.0);
    }
    return this.sm;
  }
  /** Signs on a light (white) cabinet: glow less after dark, so the letters still read through the bloom. */
  softSignMat(b: WorldBuilder): THREE.MeshStandardMaterial {
    if (!this.sm2) {
      this.sm2 = new THREE.MeshStandardMaterial({ map: this.tex(), emissiveMap: this.tex(), emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.5 });
      b.nightGlow(this.sm2, 0.18, 0.4);
    }
    return this.sm2;
  }
  /** Shop windows with their painted interiors: dim glass by day, warm and lit at night. */
  winMat(b: WorldBuilder): THREE.MeshStandardMaterial {
    if (!this.wm) {
      this.wm = new THREE.MeshStandardMaterial({ map: this.tex(), emissiveMap: this.tex(), emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.12, metalness: 0.25 });
      b.nightGlow(this.wm, 0.28, 0.74);
    }
    return this.wm;
  }
  /** The atlas lit (awning cloth, painted panels): no glow. */
  litMat(): THREE.MeshStandardMaterial {
    return (this.lm ??= new THREE.MeshStandardMaterial({ map: this.tex(), roughness: 0.85 }));
  }
}

// ---------------------------------------------------------------- new window interiors
function frontInterior(kind: Exclude<FrontInterior, 'bar' | 'diner' | 'candy' | 'shop' | 'cafe' | 'pizza' | 'upper' | 'sweets' | 'pub' | 'casino' | 'hats'>, seed: number): Painter['paint'] {
  return (ctx, w, h) => {
    const r = prng(seed);
    const bright = kind === 'pharmacy' || kind === 'apparel' || kind === 'sneakers' || kind === 'froyo' || kind === 'plush';
    const wall = ctx.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, bright ? '#d8d4cc' : kind === 'chocolate' ? '#2a160c' : '#1a1410');
    wall.addColorStop(0.62, bright ? '#f4f0e8' : kind === 'chocolate' ? '#6a3a1e' : kind === 'lux' || kind === 'jewelry' ? '#4a4038' : '#5a3a22');
    wall.addColorStop(0.63, bright ? '#b8b0a4' : '#1a120c');
    wall.addColorStop(1, bright ? '#d0c8bc' : '#3a2a1e');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);
    // ceiling light strips / cans
    for (let i = 0; i < 4; i++) {
      const x = w * (0.14 + i * 0.24);
      const g = ctx.createRadialGradient(x, h * 0.1, 2, x, h * 0.1, w * 0.2);
      g.addColorStop(0, bright ? '#ffffff' : '#ffd9a0');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h * 0.6);
      ctx.fillStyle = '#fff8e8';
      ctx.fillRect(x - 10, h * 0.05, 20, 4);
    }
    const people = (n: number, y: number) => {
      for (let i = 0; i < n; i++) {
        const x = w * (0.1 + r() * 0.8);
        const s = 0.8 + r() * 0.4;
        ctx.fillStyle = `hsl(${Math.floor(r() * 360)},45%,${30 + r() * 25}%)`;
        ctx.fillRect(x - 9 * s, y - 34 * s, 18 * s, 34 * s);
        ctx.fillStyle = ['#c9946a', '#8a5a3a', '#e8c0a0', '#5a3a2a'][Math.floor(r() * 4)];
        ctx.beginPath();
        ctx.arc(x, y - 42 * s, 8 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const shelves = (rows: number, y0: number, dy: number, colors: string[], dot: number, wood = '#3b2615') => {
      for (let i = 0; i < rows; i++) {
        const y = h * (y0 + i * dy);
        ctx.fillStyle = wood;
        ctx.fillRect(w * 0.04, y + dot, w * 0.92, 4);
        for (let x = w * 0.06; x < w * 0.94; x += dot * 1.5) {
          ctx.fillStyle = colors[Math.floor(r() * colors.length)];
          const hh = dot * (0.8 + r() * 0.8);
          ctx.fillRect(x, y + dot - hh, dot, hh);
        }
      }
    };
    switch (kind) {
      case 'chocolate': {
        // wall of brown-and-silver packs, a giant chocolate drop on the counter
        shelves(5, 0.12, 0.1, ['#5a2a12', '#3a1a0a', '#c0c0c8', '#e8a020', '#d81e2a', '#ff8a1a'], 9, '#2a1408');
        ctx.fillStyle = '#4a2410';
        ctx.fillRect(0, h * 0.64, w, h * 0.08);
        ctx.fillStyle = '#c8c8d0';
        ctx.beginPath();
        ctx.moveTo(w * 0.72, h * 0.3);
        ctx.quadraticCurveTo(w * 0.62, h * 0.6, w * 0.64, h * 0.64);
        ctx.lineTo(w * 0.8, h * 0.64);
        ctx.quadraticCurveTo(w * 0.82, h * 0.6, w * 0.72, h * 0.3);
        ctx.fill();
        people(3, h * 0.66);
        break;
      }
      case 'pharmacy':
        // tall white aisles, red category signs
        for (let i = 0; i < 5; i++) {
          const x = w * (0.05 + i * 0.19);
          ctx.fillStyle = '#e8e6e2';
          ctx.fillRect(x, h * 0.2, w * 0.15, h * 0.45);
          for (let j = 0; j < 6; j++) {
            ctx.fillStyle = ['#2a6ad8', '#e8e0c8', '#d83a3a', '#3ab85a', '#f4c21a', '#8a3ad8'][Math.floor(r() * 6)];
            ctx.fillRect(x + 4, h * (0.23 + j * 0.07), w * 0.15 - 8, h * 0.04);
          }
          ctx.fillStyle = '#d81e2a';
          ctx.fillRect(x, h * 0.13, w * 0.15, h * 0.05);
        }
        people(3, h * 0.72);
        break;
      case 'apparel':
      case 'sneakers':
        if (kind === 'sneakers') {
          // the sneaker wall: lit cubbies, one shoe each
          for (let row = 0; row < 5; row++)
            for (let c = 0; c < 9; c++) {
              const x = w * (0.05 + c * 0.1);
              const y = h * (0.12 + row * 0.1);
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(x, y, w * 0.09, h * 0.08);
              ctx.fillStyle = `hsl(${Math.floor(r() * 360)},${50 + r() * 40}%,${35 + r() * 30}%)`;
              ctx.beginPath();
              ctx.ellipse(x + w * 0.045, y + h * 0.055, w * 0.033, h * 0.018, 0, 0, Math.PI * 2);
              ctx.fill();
            }
        } else {
          // rails of folded and hung clothes, a mannequin or two
          for (let row = 0; row < 2; row++) {
            ctx.fillStyle = '#8a8a8a';
            ctx.fillRect(w * 0.05, h * (0.18 + row * 0.2), w * 0.9, 3);
            for (let x = w * 0.06; x < w * 0.94; x += 9) {
              ctx.fillStyle = `hsl(${Math.floor(r() * 360)},${20 + r() * 40}%,${20 + r() * 50}%)`;
              ctx.fillRect(x, h * (0.19 + row * 0.2), 7, h * 0.13);
            }
          }
          for (const mx of [0.22, 0.78]) {
            ctx.fillStyle = '#e8e2d8';
            ctx.beginPath();
            ctx.arc(w * mx, h * 0.5, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `hsl(${Math.floor(r() * 360)},40%,35%)`;
            ctx.fillRect(w * mx - 14, h * 0.53, 28, h * 0.17);
          }
        }
        ctx.fillStyle = '#d8d0c4';
        ctx.fillRect(w * 0.35, h * 0.62, w * 0.3, h * 0.07);
        people(3, h * 0.72);
        break;
      case 'jewelry':
      case 'lux':
        // a few lit vitrines in a calm stone room; spotlights on single pieces
        for (let i = 0; i < 3; i++) {
          const x = w * (0.1 + i * 0.3);
          const g = ctx.createRadialGradient(x + w * 0.1, h * 0.4, 2, x + w * 0.1, h * 0.4, w * 0.16);
          g.addColorStop(0, 'rgba(255,240,210,0.7)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - 10, h * 0.2, w * 0.4, h * 0.4);
          ctx.fillStyle = kind === 'jewelry' ? '#1a1410' : '#e8e0d0';
          ctx.fillRect(x, h * 0.55, w * 0.2, h * 0.12);
          ctx.fillStyle = 'rgba(220,240,255,0.5)';
          ctx.fillRect(x, h * 0.47, w * 0.2, h * 0.08);
          ctx.fillStyle = kind === 'jewelry' ? '#ffe08a' : `hsl(${Math.floor(r() * 360)},25%,30%)`;
          if (kind === 'jewelry') {
            ctx.beginPath();
            ctx.arc(x + w * 0.1, h * 0.5, 6, 0, Math.PI * 2);
            ctx.fill();
          } else ctx.fillRect(x + w * 0.06, h * 0.24, w * 0.08, h * 0.22);
        }
        people(2, h * 0.7);
        break;
      case 'chicken':
        // bright order counter, menu boards, a neon chicken, picnic tables
        ctx.fillStyle = '#1a1a1a';
        for (let i = 0; i < 3; i++) ctx.fillRect(w * (0.1 + i * 0.28), h * 0.08, w * 0.24, h * 0.14);
        ctx.fillStyle = '#f4d23a';
        for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) ctx.fillRect(w * (0.12 + i * 0.28), h * (0.1 + j * 0.03), w * 0.16, 3);
        ctx.strokeStyle = '#ff5a8a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.36, 18, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = '#c8a06a';
          ctx.fillRect(w * (0.04 + i * 0.25), h * 0.55, w * 0.18, h * 0.05);
          ctx.fillRect(w * (0.04 + i * 0.25), h * 0.62, w * 0.18, h * 0.03);
        }
        people(5, h * 0.64);
        break;
      case 'lobby':
        // hotel lobby: a stone desk, a chandelier glow, a big floral arrangement
        {
          const g = ctx.createRadialGradient(w * 0.5, h * 0.18, 4, w * 0.5, h * 0.18, w * 0.35);
          g.addColorStop(0, 'rgba(255,230,180,0.9)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h * 0.6);
          ctx.fillStyle = '#d8ccb4';
          ctx.fillRect(w * 0.25, h * 0.52, w * 0.5, h * 0.12);
          ctx.fillStyle = '#3a6a3a';
          ctx.beginPath();
          ctx.arc(w * 0.5, h * 0.44, 22, 0, Math.PI * 2);
          ctx.fill();
          people(2, h * 0.7);
        }
        break;
      case 'plush':
      case 'froyo':
        shelves(4, 0.14, 0.11, kind === 'plush' ? ['#ff8ac8', '#8ad8ff', '#ffe08a', '#c8a0ff', '#ffffff', '#a0ffb0'] : ['#ff6aa8', '#ffffff', '#a8e878', '#ffd24d'], 12, '#e8e4dc');
        ctx.fillStyle = kind === 'plush' ? '#ff4a5a' : '#8ad85a';
        ctx.fillRect(0, h * 0.62, w, h * 0.06);
        people(3, h * 0.72);
        break;
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

export { glowText, text };
