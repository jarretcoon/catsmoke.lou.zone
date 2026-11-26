import type { MapFeature, MapMarker } from './minimap';

/**
 * The phone's Strip map: the same features the minimap uses, drawn as vectors (crisp at every zoom, no big
 * pre-rendered canvas), north up, with names, Lou's arrow and the mission markers. Drag pans, the wheel or a
 * pinch zooms, and it can follow Lou. Draws only while it's on screen.
 */

export interface CatPin {
  x: number;
  z: number;
  /** 0 = facing +z (south), like the minimap. */
  yaw: number;
}

const KIND_ORDER: MapFeature['kind'][] = ['plaza', 'park', 'water', 'road', 'building'];
/** Metres per CSS pixel: zoomed all the way in, and all the way out. */
const MIN_MPP = 0.12;
const MAX_MPP = 6;

export class StripMap {
  /** Centre of the view (world metres) and the zoom (metres per CSS pixel). */
  cx = 0;
  cz = 0;
  mpp = 0.8;
  /** Keep Lou in the middle (until the player drags). */
  follow = true;
  private readonly sorted: MapFeature[];
  private readonly labelled: MapFeature[];
  readonly bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    features: MapFeature[]
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.sorted = KIND_ORDER.flatMap((k) => features.filter((f) => f.kind === k));
    this.labelled = features.filter((f) => f.label).sort((a, b) => b.w * b.d - a.w * a.d);
    for (const f of features) {
      this.bounds.minX = Math.min(this.bounds.minX, f.x - f.w / 2);
      this.bounds.maxX = Math.max(this.bounds.maxX, f.x + f.w / 2);
      this.bounds.minZ = Math.min(this.bounds.minZ, f.z - f.d / 2);
      this.bounds.maxZ = Math.max(this.bounds.maxZ, f.z + f.d / 2);
    }
    if (!features.length) Object.assign(this.bounds, { minX: -100, maxX: 100, minZ: -100, maxZ: 100 });
  }

  /** Match the canvas buffer to its CSS size (call when it's shown or resized). */
  fit(): boolean {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.w = r.width;
    this.h = r.height;
    this.dpr = dpr;
    return true;
  }

  /** Zoom by a factor about a screen point (CSS px in the canvas). */
  zoomAt(factor: number, sx = this.w / 2, sy = this.h / 2): void {
    const wx = this.cx + (sx - this.w / 2) * this.mpp;
    const wz = this.cz + (sy - this.h / 2) * this.mpp;
    this.mpp = Math.min(MAX_MPP, Math.max(MIN_MPP, this.mpp * factor));
    this.cx = wx - (sx - this.w / 2) * this.mpp;
    this.cz = wz - (sy - this.h / 2) * this.mpp;
    this.clamp();
  }

  pan(dxPx: number, dyPx: number): void {
    this.cx -= dxPx * this.mpp;
    this.cz -= dyPx * this.mpp;
    this.follow = false;
    this.clamp();
  }

  centerOn(x: number, z: number, mpp?: number): void {
    this.cx = x;
    this.cz = z;
    if (mpp) this.mpp = Math.min(MAX_MPP, Math.max(MIN_MPP, mpp));
    this.clamp();
  }

  /** The whole Strip, top to bottom. */
  showAll(): void {
    const b = this.bounds;
    this.follow = false;
    this.centerOn((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, Math.max((b.maxX - b.minX) / Math.max(1, this.w), (b.maxZ - b.minZ) / Math.max(1, this.h)) * 1.04);
  }

  private clamp(): void {
    const b = this.bounds;
    this.cx = Math.min(b.maxX, Math.max(b.minX, this.cx));
    this.cz = Math.min(b.maxZ, Math.max(b.minZ, this.cz));
  }

  /** Screen point (CSS px) → world x, z. */
  toWorld(sx: number, sy: number): [number, number] {
    return [this.cx + (sx - this.w / 2) * this.mpp, this.cz + (sy - this.h / 2) * this.mpp];
  }

  draw(cat: CatPin, markers: MapMarker[], t: number, opts: { compact?: boolean } = {}): void {
    if (!this.w) return;
    if (this.follow) this.centerOn(cat.x, cat.z);
    const g = this.ctx;
    const k = 1 / this.mpp; // CSS px per metre
    const ox = this.w / 2 - this.cx * k;
    const oz = this.h / 2 - this.cz * k;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#17140f';
    g.fillRect(0, 0, this.w, this.h);
    // a faint 100 m grid, so empty desert still reads as a map
    if (!opts.compact) {
      g.strokeStyle = 'rgba(255,240,210,0.045)';
      g.lineWidth = 1;
      g.beginPath();
      const step = this.mpp > 2.5 ? 500 : 100;
      for (let x = Math.ceil((this.cx - this.w / 2 * this.mpp) / step) * step; x < this.cx + (this.w / 2) * this.mpp; x += step) {
        g.moveTo(Math.round(ox + x * k) + 0.5, 0);
        g.lineTo(Math.round(ox + x * k) + 0.5, this.h);
      }
      for (let z = Math.ceil((this.cz - this.h / 2 * this.mpp) / step) * step; z < this.cz + (this.h / 2) * this.mpp; z += step) {
        g.moveTo(0, Math.round(oz + z * k) + 0.5);
        g.lineTo(this.w, Math.round(oz + z * k) + 0.5);
      }
      g.stroke();
    }
    const x0 = this.cx - (this.w / 2) * this.mpp;
    const x1 = this.cx + (this.w / 2) * this.mpp;
    const z0 = this.cz - (this.h / 2) * this.mpp;
    const z1 = this.cz + (this.h / 2) * this.mpp;
    const outline = k > 1.2;
    for (const f of this.sorted) {
      if (f.x + f.w / 2 < x0 || f.x - f.w / 2 > x1 || f.z + f.d / 2 < z0 || f.z - f.d / 2 > z1) continue;
      const sx = ox + (f.x - f.w / 2) * k;
      const sy = oz + (f.z - f.d / 2) * k;
      const sw = Math.max(1, f.w * k);
      const sh = Math.max(1, f.d * k);
      g.fillStyle = f.color;
      g.fillRect(sx, sy, sw, sh);
      if (outline && f.kind === 'building') {
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 1;
        g.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
      }
    }

    // names, biggest first, never on top of each other
    if (!opts.compact || k > 0.6) {
      const placed: Array<[number, number, number, number]> = [];
      const size = Math.round(Math.min(15, Math.max(10, 9 + k * 2.2)));
      g.font = `700 ${size}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      for (const f of this.labelled) {
        const px = ox + f.x * k;
        const py = oz + f.z * k;
        if (px < -40 || py < -10 || px > this.w + 40 || py > this.h + 10) continue;
        const tw = g.measureText(f.label!).width;
        const box: [number, number, number, number] = [px - tw / 2 - 3, py - size / 2 - 2, px + tw / 2 + 3, py + size / 2 + 2];
        if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue;
        placed.push(box);
        g.lineWidth = 3.5;
        g.strokeStyle = 'rgba(10,8,6,0.9)';
        g.strokeText(f.label!, px, py);
        g.fillStyle = '#fff1d0';
        g.fillText(f.label!, px, py);
      }
    }

    // markers: a fixed size on screen whatever the zoom
    const scale = opts.compact ? 0.8 : 1.15;
    for (const m of markers) {
      const px = ox + m.x * k;
      const py = oz + m.z * k;
      if (px < -12 || py < -12 || px > this.w + 12 || py > this.h + 12) continue;
      const r = (m.size ?? 3) * scale;
      if (m.glyph === '!' || m.glyph === '◆') {
        // missions: a big badge (gold "!" to start one, green diamond = where to go now)
        g.fillStyle = m.color;
        g.beginPath();
        g.arc(px, py, r * 2.1, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.75)';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = '#1a1206';
        g.font = `900 ${Math.round(r * 2.6)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(m.glyph, px, py + 0.5);
      } else if (m.glyph) {
        // shops, food, stops: small, like the minimap draws them
        g.font = `800 ${opts.compact ? 9 : 11}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(0,0,0,0.85)';
        g.strokeText(m.glyph, px, py);
        g.fillStyle = m.color;
        g.fillText(m.glyph, px, py);
      } else {
        g.fillStyle = m.color;
        if (m.shape === 'square') g.fillRect(px - r, py - r, r * 2, r * 2);
        else {
          g.beginPath();
          g.arc(px, py, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Lou: a pulsing halo and an arrow
    const px = ox + cat.x * k;
    const py = oz + cat.z * k;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    g.fillStyle = `rgba(255,154,60,${0.18 + 0.14 * pulse})`;
    g.beginPath();
    g.arc(px, py, (opts.compact ? 10 : 15) + pulse * 4, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(px, py);
    g.rotate(-cat.yaw + Math.PI);
    const a = opts.compact ? 0.85 : 1.25;
    g.fillStyle = '#ff9a3c';
    g.strokeStyle = '#1b0e02';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -10 * a);
    g.lineTo(7 * a, 8 * a);
    g.lineTo(0, 3.5 * a);
    g.lineTo(-7 * a, 8 * a);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();

    if (!opts.compact) {
      // scale bar
      const metres = this.mpp > 2.5 ? 500 : this.mpp > 0.9 ? 200 : this.mpp > 0.4 ? 50 : 20;
      const len = metres * k;
      const y = this.h - 44; // clear of the phone's home bar
      g.fillStyle = 'rgba(10,8,6,0.65)';
      g.fillRect(10, y - 8, len + 56, 18);
      g.fillStyle = '#fff1d0';
      g.fillRect(16, y, len, 3);
      g.font = '600 11px system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`${metres} m`, 22 + len, y + 1.5);
    }
  }
}
