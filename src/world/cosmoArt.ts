import * as THREE from 'three';

/**
 * The Cosmopolitan's digital art, drawn procedurally on a canvas: the LED columns in the casino and
 * lobby, the Strip marquee and the podium's LED canvas all cycle through the same loops (ink blooms,
 * a scrolling library of book spines, champagne bubbles through violet, a kaleidoscope, silk ribbons),
 * optionally with text slides or a scrolling banner on top. Redraws at ~8 fps, only when called.
 */

type Mode = 'bloom' | 'library' | 'bubbles' | 'kaleido' | 'ribbons';
const MODES: Mode[] = ['bloom', 'library', 'bubbles', 'kaleido', 'ribbons'];

export interface ArtOptions {
  slides?: Array<{ lines: string[]; sub?: string }>;
  banner?: string;
  fps?: number;
  /** Seconds per art loop. */
  period?: number;
  seed?: number;
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

let gridCanvas: HTMLCanvasElement | null = null;
function ledGrid(): HTMLCanvasElement {
  if (gridCanvas) return gridCanvas;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 4;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, 0, 4, 1);
  g.fillRect(0, 0, 1, 4);
  gridCanvas = c;
  return c;
}

export class ArtCanvas {
  readonly tex: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private last = -1;
  private pattern: CanvasPattern | null = null;
  constructor(
    readonly w: number,
    readonly h: number,
    private readonly opts: ArtOptions = {}
  ) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    this.ctx = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
  }

  /** Redraws when the frame clock ticks over; returns true if the texture changed. */
  draw(t: number): boolean {
    const fps = this.opts.fps ?? 8;
    const f = Math.floor(t * fps);
    if (f === this.last) return false;
    this.last = f;
    const { ctx, w, h } = this;
    const period = this.opts.period ?? 9;
    const seed = this.opts.seed ?? 0;
    const slides = this.opts.slides;
    // the marquee alternates an art loop with a text slide
    let artT = t;
    let slide = -1;
    if (slides?.length) {
      const cyc = period + 4.5;
      const k = Math.floor(t / cyc);
      const local = t - k * cyc;
      artT = k * period + Math.min(local, period);
      if (local > period) slide = k % slides.length;
    }
    const mi = Math.floor(artT / period + seed) % MODES.length;
    const lt = artT % period;
    this.paint(MODES[mi], lt, artT, mi * 17 + seed);
    // quick wipe between loops
    if (lt < 0.5) {
      ctx.fillStyle = `rgba(8,4,16,${1 - lt / 0.5})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (slide >= 0 && slides) this.textSlide(slides[slide], t);
    if (this.opts.banner) this.bannerText(this.opts.banner, t);
    if (!this.pattern) this.pattern = ctx.createPattern(ledGrid(), 'repeat');
    if (this.pattern) {
      ctx.fillStyle = this.pattern;
      ctx.fillRect(0, 0, w, h);
    }
    this.tex.needsUpdate = true;
    return true;
  }

  private paint(mode: Mode, lt: number, t: number, s: number): void {
    const { ctx, w, h } = this;
    const big = Math.max(w, h);
    switch (mode) {
      case 'bloom': {
        ctx.fillStyle = '#07040c';
        ctx.fillRect(0, 0, w, h);
        const hues = [285, 320, 200, 40, 340];
        for (let i = 0; i < 16; i++) {
          const born = hash(i + s) * 9;
          const age = (lt - born + 9) % 9;
          const life = Math.min(1, age / 3);
          const fade = age > 6 ? Math.max(0, 1 - (age - 6) / 3) : 1;
          const x = hash(i * 3.1 + s) * w;
          const y = hash(i * 7.7 + s) * h;
          const r = (0.08 + 0.18 * hash(i * 1.9)) * big * (0.3 + life * 0.9);
          const hue = hues[i % hues.length];
          const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
          g.addColorStop(0, `hsla(${hue},95%,72%,${0.85 * fade})`);
          g.addColorStop(0.55, `hsla(${hue + 20},90%,45%,${0.45 * fade})`);
          g.addColorStop(1, `hsla(${hue},80%,20%,0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          // petal-edged bloom
          for (let k = 0; k <= 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            const rr = r * (0.82 + 0.18 * Math.sin(a * 6 + i));
            if (k === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
            else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          }
          ctx.fill();
        }
        break;
      }
      case 'library': {
        ctx.fillStyle = '#1a0e08';
        ctx.fillRect(0, 0, w, h);
        const shelf = Math.max(48, Math.round(Math.min(w, h) * (h > w ? 0.5 : 0.9)));
        const off = (t * 14) % shelf;
        const cols = ['#7a1a1a', '#1a3a6a', '#2a5a2a', '#c8a050', '#5a2a6a', '#e8dcc0', '#1a1a1a', '#8a4a1a', '#3a7a8a'];
        for (let row = -1; row < h / shelf + 1; row++) {
          const y0 = row * shelf - off;
          let x = -((row * 37) % 23);
          let k = row * 11;
          while (x < w) {
            const bw = 8 + hash(k + s) * 16;
            const bh = shelf * (0.62 + hash(k * 2.3) * 0.3);
            ctx.fillStyle = cols[Math.floor(hash(k * 5.1 + s) * cols.length)];
            ctx.fillRect(x, y0 + shelf - 6 - bh, bw - 1.5, bh);
            ctx.fillStyle = 'rgba(232,196,110,0.8)';
            ctx.fillRect(x + 1, y0 + shelf - 6 - bh * 0.85, bw - 3.5, 2);
            ctx.fillRect(x + 1, y0 + shelf - 6 - bh * 0.25, bw - 3.5, 2);
            x += bw;
            k++;
          }
          ctx.fillStyle = '#3a2214';
          ctx.fillRect(0, y0 + shelf - 6, w, 6);
        }
        // a warm reading-lamp glow drifting over the shelves
        const gx = (0.5 + 0.4 * Math.sin(t * 0.4)) * w;
        const gy = (0.5 + 0.4 * Math.cos(t * 0.3)) * h;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, big * 0.6);
        g.addColorStop(0, 'rgba(255,210,140,0.35)');
        g.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        break;
      }
      case 'bubbles': {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#2a0a4a');
        g.addColorStop(1, '#b0186a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 46; i++) {
          const sp = 30 + hash(i + s) * 70;
          const r = 2 + hash(i * 4.3) * Math.min(w, h) * 0.07;
          const x = hash(i * 9.7 + s) * w + Math.sin(t * 2 + i) * 5;
          const y = h + r - ((t * sp + hash(i * 3.3) * h * 2) % (h + r * 2));
          ctx.strokeStyle = 'rgba(255,230,255,0.75)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          ctx.fillRect(x - r * 0.4, y - r * 0.5, Math.max(1, r * 0.3), Math.max(1, r * 0.3));
        }
        break;
      }
      case 'kaleido': {
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, w, h);
        const cell = Math.max(24, Math.min(w, h) / 3);
        const pal = ['#ff2c8a', '#7a2cff', '#00c2d8', '#ffc23a', '#ffffff'];
        for (let y = 0; y < h + cell; y += cell) {
          for (let x = 0; x < w + cell; x += cell) {
            const k = Math.floor(x / cell) * 7 + Math.floor(y / cell) * 13;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(t * 0.5 * (k % 2 ? 1 : -1) + k);
            for (let p = 0; p < 6; p++) {
              ctx.rotate(Math.PI / 3);
              ctx.fillStyle = pal[(p + k + Math.floor(t)) % pal.length];
              ctx.globalAlpha = 0.75;
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(cell * 0.5, cell * 0.12);
              ctx.lineTo(cell * 0.5, -cell * 0.12);
              ctx.fill();
            }
            ctx.restore();
          }
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'ribbons': {
        ctx.fillStyle = '#05030a';
        ctx.fillRect(0, 0, w, h);
        const tall = h > w;
        for (let i = 0; i < 7; i++) {
          ctx.strokeStyle = `hsla(${280 + i * 18},90%,${55 + i * 4}%,0.8)`;
          ctx.lineWidth = 3 + i;
          ctx.beginPath();
          for (let k = 0; k <= 40; k++) {
            const u = k / 40;
            const a = u * Math.PI * 3 + t * (0.6 + i * 0.1) + i;
            const px = tall ? w * (0.5 + 0.42 * Math.sin(a)) : u * w;
            const py = tall ? u * h : h * (0.5 + 0.42 * Math.sin(a));
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        break;
      }
    }
  }

  private textSlide(sl: { lines: string[]; sub?: string }, t: number): void {
    const { ctx, w, h } = this;
    ctx.fillStyle = 'rgba(6,4,12,0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = Math.round(w * 0.15);
    const n = sl.lines.length + (sl.sub ? 0.8 : 0);
    let y = h / 2 - ((n - 1) * size * 1.15) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#c77dff';
    ctx.shadowBlur = 14;
    for (const line of sl.lines) {
      ctx.font = `300 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      ctx.fillText(line, w / 2, y, w * 0.92);
      y += size * 1.15;
    }
    ctx.shadowBlur = 0;
    if (sl.sub) {
      ctx.font = `bold ${Math.round(size * 0.36)}px system-ui, sans-serif`;
      ctx.fillStyle = '#ff6cd6';
      ctx.fillText(sl.sub, w / 2, y - size * 0.25, w * 0.9);
    }
    ctx.fillStyle = '#c77dff';
    ctx.fillRect(w * 0.2, h * 0.86, w * 0.6 * ((t % 4.5) / 4.5), 3);
  }

  private bannerText(text: string, t: number): void {
    const { ctx, w, h } = this;
    ctx.font = `300 ${Math.round(h * 0.55)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const x0 = -((t * 55) % tw);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, h * 0.18, w, h * 0.64);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#e4a8ff';
    ctx.shadowBlur = 10;
    for (let x = x0; x < w; x += tw) ctx.fillText(text, x, h / 2 + 2);
    ctx.shadowBlur = 0;
  }
}
