export interface MapFeature {
  kind: 'road' | 'building' | 'water' | 'plaza' | 'park';
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
  label?: string;
}

export interface MapMarker {
  x: number;
  z: number;
  color: string;
  size?: number;
  shape?: 'dot' | 'square' | 'diamond';
  glyph?: string;
}

/**
 * North-up radar. World +x = east, +z = south, so screen x = world x and screen y = world z.
 * M cycles: local radar → whole-Strip map → hidden.
 */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private mode: 'local' | 'full' | 'off' = 'local';
  private staticLayer: HTMLCanvasElement | null = null;
  private bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

  constructor(private readonly features: MapFeature[]) {
    this.canvas = document.getElementById('minimap') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    for (const f of features) {
      this.bounds.minX = Math.min(this.bounds.minX, f.x - f.w / 2);
      this.bounds.maxX = Math.max(this.bounds.maxX, f.x + f.w / 2);
      this.bounds.minZ = Math.min(this.bounds.minZ, f.z - f.d / 2);
      this.bounds.maxZ = Math.max(this.bounds.maxZ, f.z + f.d / 2);
    }
    this.buildStaticLayer();
  }

  cycle(): string {
    this.mode = this.mode === 'local' ? 'full' : this.mode === 'full' ? 'off' : 'local';
    this.canvas.hidden = this.mode === 'off';
    this.canvas.classList.toggle('minimap--full', this.mode === 'full');
    return this.mode === 'local' ? 'Radar' : this.mode === 'full' ? 'Strip map' : 'Map hidden';
  }

  /** Pre-render every static feature once at 2 px per meter. */
  private buildStaticLayer(): void {
    const ppm = 2;
    const b = this.bounds;
    const c = document.createElement('canvas');
    c.width = Math.ceil((b.maxX - b.minX) * ppm);
    c.height = Math.ceil((b.maxZ - b.minZ) * ppm);
    const g = c.getContext('2d')!;
    g.fillStyle = '#1a1712';
    g.fillRect(0, 0, c.width, c.height);
    const order: MapFeature['kind'][] = ['plaza', 'park', 'water', 'road', 'building'];
    for (const kind of order) {
      for (const f of this.features) {
        if (f.kind !== kind) continue;
        g.fillStyle = f.color;
        g.fillRect((f.x - f.w / 2 - b.minX) * ppm, (f.z - f.d / 2 - b.minZ) * ppm, f.w * ppm, f.d * ppm);
        if (kind === 'building') {
          g.strokeStyle = 'rgba(0,0,0,0.55)';
          g.lineWidth = 2;
          g.strokeRect((f.x - f.w / 2 - b.minX) * ppm, (f.z - f.d / 2 - b.minZ) * ppm, f.w * ppm, f.d * ppm);
        }
      }
    }
    g.font = 'bold 22px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const f of this.features) {
      if (!f.label) continue;
      const px = (f.x - b.minX) * ppm;
      const pz = (f.z - b.minZ) * ppm;
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(f.label, px, pz);
      g.fillStyle = '#fff4d6';
      g.fillText(f.label, px, pz);
    }
    this.staticLayer = c;
  }

  draw(catX: number, catZ: number, heading: number, markers: MapMarker[]): void {
    // (hidden by CSS on phone screens, where the map lives in Lou's phone: nothing to draw)
    if (this.mode === 'off' || !this.staticLayer || !this.canvas.offsetWidth) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const b = this.bounds;
    const ppm = 2;

    // World meters visible across the canvas.
    const span = this.mode === 'local' ? 110 : Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 1.02;
    const scale = W / span; // canvas px per meter
    const cx = this.mode === 'local' ? catX : (b.minX + b.maxX) / 2;
    const cz = this.mode === 'local' ? catZ : (b.minZ + b.maxZ) / 2;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#100e0b';
    ctx.fillRect(0, 0, W, H);
    const sx = (cx - span / 2 - b.minX) * ppm;
    const sz = (cz - span / 2 - b.minZ) * ppm;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.staticLayer, sx, sz, span * ppm, span * ppm, 0, 0, W, H);

    const toScreen = (x: number, z: number) => [(x - cx) * scale + W / 2, (z - cz) * scale + H / 2] as const;

    for (const m of markers) {
      const [px, py] = toScreen(m.x, m.z);
      if (px < -8 || py < -8 || px > W + 8 || py > H + 8) continue;
      const r = (m.size ?? 3) * (this.mode === 'full' ? 0.9 : 1.2);
      ctx.fillStyle = m.color;
      if (m.glyph) {
        ctx.font = `bold ${Math.round(r * 4)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(m.glyph, px, py);
        ctx.fillText(m.glyph, px, py);
      } else if (m.shape === 'square') {
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Cat arrow (heading: 0 = facing +z / south).
    const [px, py] = toScreen(catX, catZ);
    ctx.translate(px, py);
    ctx.rotate(-heading + Math.PI);
    ctx.fillStyle = '#ff9a3c';
    ctx.strokeStyle = '#1b0e02';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('N ↑', 6, 14);
  }
}
