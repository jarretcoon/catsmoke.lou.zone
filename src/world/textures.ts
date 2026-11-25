import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

/**
 * One full cross-section of a 6-lane boulevard (3 lanes each way around a raised median),
 * tiled along its length. u = across the road (west→east), v = along it.
 */
export function makeBoulevardTexture(lengthMeters: number, halfWidth: number, laneEdges: number[], medianHalf: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 256; // 256 px = 16 m along the road
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#26272d';
  ctx.fillRect(0, 0, W, H);
  // Aggregate speckle + tire polish
  for (let i = 0; i < 9000; i++) {
    const v = 30 + ((i * 53) % 30);
    ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
    ctx.fillRect((i * 97) % W, (i * 61) % H, 2, 2);
  }
  const xToPx = (x: number) => ((x + halfWidth) / (halfWidth * 2)) * W;
  ctx.fillStyle = 'rgba(15,15,18,0.35)';
  for (const e of laneEdges) {
    for (const s of [-1, 1]) {
      const center = s * (e - 1.7);
      ctx.fillRect(xToPx(center - 0.9), 0, 6, H);
      ctx.fillRect(xToPx(center + 0.9), 0, 6, H);
    }
  }
  // Lane dashes (white) between travel lanes, solid edge lines, yellow along the median.
  ctx.fillStyle = 'rgba(240,240,236,0.9)';
  for (const e of laneEdges.slice(0, -1)) {
    for (const s of [-1, 1]) {
      for (let y = 0; y < H; y += 64) ctx.fillRect(xToPx(s * e) - 3, y + 6, 6, 36);
    }
  }
  for (const s of [-1, 1]) ctx.fillRect(xToPx(s * (halfWidth - 0.35)) - 3, 0, 6, H);
  ctx.fillStyle = '#e2b53c';
  for (const s of [-1, 1]) ctx.fillRect(xToPx(s * (medianHalf + 0.25)) - 3, 0, 6, H);
  return finish(c, [1, lengthMeters / 16]);
}

export function makeCrossStreetTexture(lengthMeters: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#25262c';
  ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 2500; i++) {
    const v = 30 + ((i * 37) % 28);
    ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
    ctx.fillRect((i * 73) % 256, (i * 139) % 512, 2, 2);
  }
  ctx.fillStyle = '#e2b53c';
  ctx.fillRect(0, 250, 256, 4);
  ctx.fillRect(0, 258, 256, 4);
  ctx.fillStyle = 'rgba(240,240,236,0.85)';
  for (const y of [85, 170, 342, 427]) for (let x = 0; x < 256; x += 64) ctx.fillRect(x + 8, y, 36, 4);
  const tex = finish(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(lengthMeters / 16, 1);
  return tex;
}

export function makePaverTexture(base = '#8d8478', joint = '#6d655b', tiles = 8): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const s = 256 / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const v = ((x * 7 + y * 13) % 5) * 4 - 8;
      ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 120})`;
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
  ctx.strokeStyle = joint;
  ctx.lineWidth = 2;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * s);
    ctx.lineTo(256, i * s);
    ctx.stroke();
  }
  return finish(c, [1, 1]);
}

export function makeDesertTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#a88e6c';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const v = 140 + ((i * 29) % 50);
    ctx.fillStyle = `rgb(${v},${v - 24},${v - 58})`;
    ctx.fillRect((i * 71) % 256, (i * 113) % 256, 2, 2);
  }
  return finish(c, [60, 60]);
}

export interface FacadeSpec {
  wall: string;
  mullion: string;
  glass: string;
  lit: string;
  cols: number;
  rows: number;
  /** 0 = punched windows, 1 = ribbon glass bands, 2 = full curtain wall */
  style?: 0 | 1 | 2;
  seed?: number;
}

/** Hotel tower skin: albedo + an emissive mask so windows glow after dark. */
export function makeFacadeTextures(spec: FacadeSpec): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const [e, ectx] = canvas(S, S);
  ctx.fillStyle = spec.wall;
  ctx.fillRect(0, 0, S, S);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, S, S);
  const cw = S / spec.cols;
  const rh = S / spec.rows;
  const seed = spec.seed ?? 7;
  const style = spec.style ?? 0;
  for (let col = 0; col < spec.cols; col++) {
    for (let row = 0; row < spec.rows; row++) {
      const lit = (col * 17 + row * 31 + seed * 11) % 13 > 5;
      const x = style === 2 ? col * cw + 1 : col * cw + cw * 0.18;
      const y = style === 0 ? row * rh + rh * 0.2 : row * rh + rh * 0.12;
      const w = style === 2 ? cw - 2 : cw * 0.64;
      const h = style === 0 ? rh * 0.6 : rh * 0.76;
      ctx.fillStyle = spec.glass;
      ctx.fillRect(x, y, w, h);
      if (lit) {
        ectx.fillStyle = spec.lit;
        ectx.fillRect(x + 1, y + 1, w - 2, h - 2);
        ctx.fillStyle = 'rgba(255,240,200,0.12)';
        ctx.fillRect(x, y, w, h);
      }
    }
    if (style !== 2) {
      ctx.fillStyle = spec.mullion;
      ctx.fillRect(col * cw, 0, 3, S);
    }
  }
  if (style === 1) {
    ctx.fillStyle = spec.mullion;
    for (let row = 0; row < spec.rows; row++) ctx.fillRect(0, row * rh, S, 2);
  }
  const map = finish(c);
  const emissiveMap = finish(e);
  for (const t of [map, emissiveMap]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return { map, emissiveMap };
}

export function makeCarpetTexture(primary: string, accent: string, accent2?: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  for (let x = 0; x <= 256; x += 64) {
    for (let y = 0; y <= 256; y += 64) {
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(x + 18, y + 18, 28, 28);
    }
  }
  if (accent2) {
    ctx.fillStyle = accent2;
    for (let x = 32; x < 256; x += 64) for (let y = 32; y < 256; y += 64) ctx.fillRect(x - 4, y - 4, 8, 8);
  }
  return finish(c, [6, 6]);
}

export function makeBalloonTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 256);
  const colors = ['#c8202e', '#f7e5b7', '#1f3f86', '#f2b830'];
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect((i * 512) / 12, 0, 512 / 12 + 1, 256);
  }
  ctx.fillStyle = '#f5ca56';
  ctx.fillRect(0, 108, 512, 34);
  ctx.fillStyle = '#182442';
  ctx.font = 'bold 24px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PARIS  •  LAS VEGAS  •  PARIS  •  LAS VEGAS', 256, 125);
  return finish(c);
}

export function makeSignTexture(text: string, bg: string, fg: string, subtext?: string, font = 'Georgia, system-ui, sans-serif'): THREE.CanvasTexture {
  const [c, ctx] = canvas(640, 160);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 640, 160);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 624, 144);
  ctx.fillStyle = fg;
  ctx.font = `bold 62px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = fg;
  ctx.shadowBlur = 20;
  ctx.fillText(text, 320, subtext ? 62 : 82, 600);
  if (subtext) {
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(subtext, 320, 122, 600);
  }
  return finish(c);
}

/** Animated LED marquee (Strip-facing video boards). Call draw(t) to refresh. */
export class LedBoard {
  readonly tex: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly w: number;
  private readonly h: number;
  private lastFrame = -1;

  constructor(
    private readonly title: string,
    private readonly lines: string[],
    private readonly palette: string[],
    w = 256,
    h = 512
  ) {
    const [c, ctx] = canvas(w, h);
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.tex = finish(c);
  }

  draw(t: number): void {
    const frame = Math.floor(t * 6);
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    const { ctx, w, h } = this;
    const slide = Math.floor(t / 4) % this.lines.length;
    const hue = this.palette[slide % this.palette.length];
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, hue);
    g.addColorStop(1, '#090912');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Moving light sweep
    const sweep = ((t * 120) % (h + 200)) - 100;
    const sg = ctx.createLinearGradient(0, sweep - 80, 0, sweep + 80);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(w * 0.13)}px Georgia, serif`;
    ctx.fillText(this.title, w / 2, h * 0.16, w * 0.9);
    ctx.font = `bold ${Math.round(w * 0.1)}px system-ui, sans-serif`;
    const words = this.lines[slide].split(' ');
    let line = '';
    let y = h * 0.42;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > w * 0.86 && line) {
        ctx.fillText(line, w / 2, y);
        line = word;
        y += w * 0.13;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, w / 2, y);
    // LED pixel grid
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
    for (let yy = 0; yy < h; yy += 4) ctx.fillRect(0, yy, w, 1);
    this.tex.needsUpdate = true;
  }
}

/** Radial glow decal for fake street-light pools on the pavement. */
export function makeGlowTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,214,150,0.85)');
  g.addColorStop(0.45, 'rgba(255,190,120,0.3)');
  g.addColorStop(1, 'rgba(255,170,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return finish(c);
}
