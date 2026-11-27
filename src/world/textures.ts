import * as THREE from 'three';

let texDetail = 1;
/**
 * Draw the generated textures at `k` times their usual resolution (Ultra: 2). Every drawing function keeps working
 * in its own pixel units (the context is pre-scaled), so the same picture comes out with finer edges, text and
 * grain. Call before the world is built.
 */
export function setTextureDetail(k: number): void {
  texDetail = Math.max(1, Math.min(4, k));
}

function canvas(w: number, h: number, detail = texDetail): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.round(w * detail);
  c.height = Math.round(h * detail);
  const ctx = c.getContext('2d')!;
  if (detail !== 1) ctx.scale(c.width / w, c.height / h);
  return [c, ctx];
}

function finish(c: HTMLCanvasElement, repeat?: [number, number], srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

/** Small deterministic PRNG (xorshift32) so procedural textures look the same every run. */
export function rng(seed: number): () => number {
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Roughness/metalness map value (three reads roughness from G and metalness from B). */
const rm = (rough: number, metal = 0) => `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`;

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, R: () => number, light: string, dark: string, size = 2): void {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = R() < 0.5 ? light : dark;
    const s = R() < 0.8 ? size - 1 || 1 : size;
    ctx.fillRect(Math.floor(R() * w), Math.floor(R() * h), s, s);
  }
}

/** Random-walk crack: thin dark line with optional sealed (tar-snake) twin in the roughness map. */
function crackPath(R: () => number, x: number, y: number, len: number, dx: number, dy: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [[x, y]];
  let a = Math.atan2(dy, dx);
  for (let i = 0; i < len; i++) {
    a += (R() - 0.5) * 1.5;
    const step = 2 + R() * 4;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y]);
  }
  return pts;
}
function strokePath(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

// ------------------------------------------------------------------------------------------------
// Asphalt
// ------------------------------------------------------------------------------------------------

const roadCache = new Map<string, { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture }>();

/**
 * One full cross-section of a 6-lane boulevard (3 lanes each way around a raised median), 64 m long,
 * tiled along its length. u = across the road (west→east), v = along it. Worn lane paint, gutter pans,
 * patches, cracks and tar snakes, oil drips between the wheel paths, polished wheel paths, skid marks
 * and manhole covers. The roughness map makes the wheel paths, oil and sealant a little glossy.
 */
export function makeBoulevardMaps(lengthMeters: number, halfWidth: number, laneEdges: number[], medianHalf: number): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const key = `${halfWidth}|${laneEdges.join(',')}|${medianHalf}`;
  let base = roadCache.get(key);
  if (!base) {
    base = drawBoulevard(halfWidth, laneEdges, medianHalf);
    roadCache.set(key, base);
  }
  const map = base.map.clone();
  const roughnessMap = base.roughnessMap.clone();
  for (const t of [map, roughnessMap]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, lengthMeters / TILE_M);
    t.needsUpdate = true;
  }
  return { map, roughnessMap };
}

export function makeBoulevardTexture(lengthMeters: number, halfWidth: number, laneEdges: number[], medianHalf: number): THREE.CanvasTexture {
  return makeBoulevardMaps(lengthMeters, halfWidth, laneEdges, medianHalf).map;
}

const TILE_M = 64;

function drawBoulevard(halfWidth: number, laneEdges: number[], medianHalf: number): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const W = 1024;
  const H = 1024; // 1024 px = 64 m along the road
  const [c, ctx] = canvas(W, H);
  const RS = 512;
  const [r, rctx] = canvas(RS, RS);
  rctx.scale(RS / W, RS / H);
  const R = rng(1977);
  const pxX = (x: number) => ((x + halfWidth) / (halfWidth * 2)) * W;
  const ppmX = W / (halfWidth * 2);
  const ppmZ = H / TILE_M;

  // Base asphalt, each lane repaved at a slightly different time
  ctx.fillStyle = '#2a2b30';
  ctx.fillRect(0, 0, W, H);
  rctx.fillStyle = rm(0.86);
  rctx.fillRect(0, 0, W, H);
  const edges = [medianHalf, ...laneEdges];
  for (const s of [-1, 1]) {
    for (let i = 0; i + 1 < edges.length; i++) {
      const a = pxX(s * edges[i]);
      const b2 = pxX(s * edges[i + 1]);
      const v = R() * 14 - 7;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 160})`;
      ctx.fillRect(Math.min(a, b2), 0, Math.abs(b2 - a), H);
    }
  }
  // Aggregate
  speckle(ctx, W, H, 70000, R, 'rgba(92,92,98,0.22)', 'rgba(14,14,16,0.3)', 2);
  speckle(ctx, W, H, 6000, R, 'rgba(120,118,112,0.16)', 'rgba(0,0,0,0.22)', 3);

  // Patches (rectangular repaving cuts with sealed seams)
  for (let i = 0; i < 7; i++) {
    const lane = (R() < 0.5 ? -1 : 1) * (medianHalf + R() * (halfWidth - medianHalf - 3));
    const w = (2 + R() * 3) * ppmX;
    const h = (2 + R() * 7) * ppmZ;
    const x = pxX(lane) - w / 2;
    const y = R() * (H - h);
    const dark = R() < 0.6;
    ctx.fillStyle = dark ? 'rgba(8,8,10,0.38)' : 'rgba(120,118,112,0.16)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(5,5,6,0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    rctx.fillStyle = rm(dark ? 0.78 : 0.9);
    rctx.fillRect(x, y, w, h);
    rctx.strokeStyle = rm(0.4);
    rctx.lineWidth = 3;
    rctx.strokeRect(x, y, w, h);
  }

  // Wheel paths: polished, slightly darker bands in every lane
  for (const s of [-1, 1]) {
    for (let i = 0; i + 1 < edges.length; i++) {
      const center = s * (edges[i] + edges[i + 1]) / 2;
      for (const off of [-0.85, 0.85]) {
        const x = pxX(center + off);
        const g = ctx.createLinearGradient(x - 0.45 * ppmX, 0, x + 0.45 * ppmX, 0);
        g.addColorStop(0, 'rgba(10,10,12,0)');
        g.addColorStop(0.5, 'rgba(10,10,12,0.32)');
        g.addColorStop(1, 'rgba(10,10,12,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 0.45 * ppmX, 0, 0.9 * ppmX, H);
        const rg = rctx.createLinearGradient(x - 0.45 * ppmX, 0, x + 0.45 * ppmX, 0);
        rg.addColorStop(0, 'rgba(0,219,0,0)');
        rg.addColorStop(0.5, 'rgba(0,150,0,0.85)');
        rg.addColorStop(1, 'rgba(0,219,0,0)');
        rctx.fillStyle = rg;
        rctx.fillRect(x - 0.45 * ppmX, 0, 0.9 * ppmX, H);
      }
      // Oil drips down the middle of the lane
      for (let k = 0; k < 9; k++) {
        const ox = pxX(center + (R() - 0.5) * 0.7);
        const oy = R() * H;
        const rad = (0.25 + R() * 0.6) * ppmX;
        const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, rad);
        og.addColorStop(0, `rgba(4,4,6,${0.35 + R() * 0.3})`);
        og.addColorStop(1, 'rgba(4,4,6,0)');
        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(1, ppmZ / ppmX * (1.4 + R()));
        ctx.translate(-ox, -oy);
        ctx.fillStyle = og;
        ctx.beginPath();
        ctx.arc(ox, oy, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Soft-edged and only slightly glossy: hard low-roughness ovals mirrored the neon env map as rows of bright dots.
        const rg = rctx.createRadialGradient(ox, oy, 0, ox, oy, rad * 0.7);
        rg.addColorStop(0, 'rgba(0,166,0,0.85)');
        rg.addColorStop(1, 'rgba(0,166,0,0)');
        rctx.save();
        rctx.translate(ox, oy);
        rctx.scale(1, (ppmZ / ppmX) * 1.6);
        rctx.translate(-ox, -oy);
        rctx.fillStyle = rg;
        rctx.beginPath();
        rctx.arc(ox, oy, rad * 0.7, 0, Math.PI * 2);
        rctx.fill();
        rctx.restore();
      }
    }
  }

  // Cracks: a few long longitudinal ones on the lane joints, many short transverse ones; some sealed.
  for (let i = 0; i < 26; i++) {
    const longit = i < 8;
    const e = edges[1 + Math.floor(R() * (edges.length - 1))] * (R() < 0.5 ? -1 : 1);
    const x = longit ? pxX(e) + (R() - 0.5) * 8 : R() * W;
    const y = R() * H;
    const pts = crackPath(R, x, y, longit ? 14 + R() * 14 : 4 + R() * 8, longit ? 0 : 1, longit ? 1 : (R() - 0.5) * 0.6);
    const sealed = R() < 0.45;
    if (sealed) {
      ctx.strokeStyle = 'rgba(8,8,10,0.5)';
      ctx.lineWidth = 3;
      strokePath(ctx, pts);
      rctx.strokeStyle = rm(0.3);
      rctx.lineWidth = 5;
      strokePath(rctx, pts);
    }
    ctx.strokeStyle = 'rgba(10,10,12,0.7)';
    ctx.lineWidth = 1;
    strokePath(ctx, pts);
    if (R() < 0.5) {
      const j = Math.floor(R() * pts.length);
      strokePath(ctx, crackPath(R, pts[j][0], pts[j][1], 3 + R() * 5, R() - 0.5, R() - 0.5));
    }
  }

  // Skid marks (curved pairs)
  for (let i = 0; i < 4; i++) {
    const lane = (R() < 0.5 ? -1 : 1) * (edges[1 + Math.floor(R() * 3)] - 1.7);
    const y0 = R() * H;
    const bend = (R() - 0.5) * 1.2 * ppmX;
    const len = (6 + R() * 10) * ppmZ;
    ctx.lineWidth = 0.22 * ppmX;
    ctx.strokeStyle = 'rgba(5,5,6,0.28)';
    for (const off of [-0.8, 0.8]) {
      const x = pxX(lane + off);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.quadraticCurveTo(x + bend * 0.2, y0 + len / 2, x + bend, y0 + len);
      ctx.stroke();
    }
  }

  // Gutter pans (concrete, 0.5 m) against both curbs, with control joints every 3 m
  const gutter = 0.5;
  for (const s of [-1, 1]) {
    const x0 = pxX(s * halfWidth);
    const x1 = pxX(s * (halfWidth - gutter));
    const gx = Math.min(x0, x1);
    const gw = Math.abs(x1 - x0);
    ctx.fillStyle = '#77736c';
    ctx.fillRect(gx, 0, gw, H);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(gx + R() * gw, R() * H, 2, 2);
    }
    // Grime line where water runs
    const wx = s < 0 ? gx + 2 : gx + gw - 6;
    ctx.fillStyle = 'rgba(30,28,24,0.35)';
    ctx.fillRect(wx, 0, 4, H);
    ctx.fillStyle = 'rgba(20,20,20,0.55)';
    for (let y = 0; y < H; y += 3 * ppmZ) ctx.fillRect(gx, y, gw, 2);
    ctx.fillStyle = 'rgba(10,10,10,0.6)';
    ctx.fillRect(s < 0 ? gx + gw - 2 : gx, 0, 2, H);
    rctx.fillStyle = rm(0.8);
    rctx.fillRect(gx, 0, gw, H);
  }

  // Lane paint (worn): white dashes between travel lanes (3 m dash / 13 m gap), solid edge lines,
  // a yellow line along each side of the median.
  const paint = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    rctx.fillStyle = rm(0.62);
    rctx.fillRect(x, y, w, h);
  };
  const lineW = 0.15 * ppmX;
  for (const e of laneEdges.slice(0, -1)) {
    for (const s of [-1, 1]) {
      for (let y = 0; y < H; y += 16 * ppmZ) paint(pxX(s * e) - lineW / 2, y + 2 * ppmZ, lineW, 3 * ppmZ, 'rgba(236,234,226,0.92)');
    }
  }
  for (const s of [-1, 1]) paint(pxX(s * (halfWidth - gutter - 0.25)) - lineW / 2, 0, lineW, H, 'rgba(236,234,226,0.9)');
  for (const s of [-1, 1]) paint(pxX(s * (medianHalf + 0.3)) - lineW / 2, 0, lineW, H, 'rgba(226,181,60,0.95)');
  // Wear the paint: knock out flecks (asphalt only; the concrete gutter pans stay clean)
  const gx0 = pxX(-halfWidth + gutter);
  const gx1 = pxX(halfWidth - gutter);
  for (let i = 0; i < 26000; i++) {
    const x = gx0 + R() * (gx1 - gx0 - 3);
    const y = R() * H;
    ctx.fillStyle = `rgba(${38 + R() * 14},${38 + R() * 14},${42 + R() * 14},${0.35 + R() * 0.5})`;
    const s = 1 + Math.floor(R() * 3);
    // Only flecks that land on paint matter; on bare asphalt they read as aggregate.
    ctx.fillRect(x, y, s, s);
  }

  // Manhole covers + valve boxes (circles in world space → ellipses in this anisotropic texture)
  for (let i = 0; i < 5; i++) {
    const lane = (R() < 0.5 ? -1 : 1) * (edges[Math.floor(R() * 3)] + 1.7 + (R() - 0.5));
    const cx = pxX(lane);
    const cy = (i + 0.3 + R() * 0.4) * (H / 5);
    const rad = (i % 2 === 0 ? 0.36 : 0.16) * ppmX;
    const ry = rad * (ppmZ / ppmX);
    ctx.fillStyle = '#3d3a36';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rad * 1.18, ry * 1.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#26231f';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rad, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,112,100,0.6)';
    ctx.lineWidth = 1;
    for (let k = 0.35; k < 1; k += 0.3) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rad * k, ry * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    rctx.fillStyle = rm(0.58, 0.55);
    rctx.beginPath();
    rctx.ellipse(cx, cy, rad * 1.1, ry * 1.1, 0, 0, Math.PI * 2);
    rctx.fill();
  }

  const map = finish(c);
  const roughnessMap = finish(r, undefined, false);
  return { map, roughnessMap };
}

export function makeCrossStreetTexture(lengthMeters: number): THREE.CanvasTexture {
  let base = crossBase;
  if (!base) {
    const [c, ctx] = canvas(512, 512); // u: 16 m along the street, v: 20 m across it
    const R = rng(4242);
    ctx.fillStyle = '#28292e';
    ctx.fillRect(0, 0, 512, 512);
    speckle(ctx, 512, 512, 16000, R, 'rgba(120,120,126,0.35)', 'rgba(12,12,14,0.45)', 2);
    // Wheel paths along the street
    for (const y of [60, 140, 196, 316, 372, 452]) {
      const g = ctx.createLinearGradient(0, y - 12, 0, y + 12);
      g.addColorStop(0, 'rgba(10,10,12,0)');
      g.addColorStop(0.5, 'rgba(10,10,12,0.3)');
      g.addColorStop(1, 'rgba(10,10,12,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 12, 512, 24);
    }
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = 'rgba(8,8,10,0.85)';
      ctx.lineWidth = 1.3;
      strokePath(ctx, crackPath(R, R() * 512, R() * 512, 4 + R() * 9, R() - 0.5, R() - 0.5));
    }
    for (let i = 0; i < 10; i++) {
      const ox = R() * 512;
      const oy = [100, 168, 344, 412][i % 4] + (R() - 0.5) * 12;
      const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, 10 + R() * 10);
      og.addColorStop(0, 'rgba(4,4,6,0.45)');
      og.addColorStop(1, 'rgba(4,4,6,0)');
      ctx.fillStyle = og;
      ctx.fillRect(ox - 22, oy - 22, 44, 44);
    }
    // Double yellow centre line + white lane dashes (3 m dash / 5 m gap)
    ctx.fillStyle = 'rgba(226,181,60,0.95)';
    ctx.fillRect(0, 248, 512, 5);
    ctx.fillRect(0, 259, 512, 5);
    ctx.fillStyle = 'rgba(236,234,226,0.9)';
    for (const y of [170, 342]) for (let x = 0; x < 512; x += 256) ctx.fillRect(x + 20, y, 96, 5);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(40,40,44,${0.3 + R() * 0.5})`;
      ctx.fillRect(R() * 512, R() * 512, 2, 2);
    }
    base = crossBase = finish(ctx.canvas);
  }
  const tex = base.clone();
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(lengthMeters / 16, 1);
  tex.needsUpdate = true;
  return tex;
}
let crossBase: THREE.CanvasTexture | null = null;

// ------------------------------------------------------------------------------------------------
// Ground
// ------------------------------------------------------------------------------------------------

/**
 * Concrete pavers: every tile gets its own tone, a soft bevel, the odd stain, chip, crack or gum spot.
 * `pattern` 'running' lays them as offset rows; 'band' adds a darker accent course every 4th row.
 */
export function makePaverTexture(base = '#8d8478', joint = '#6d655b', tiles = 8, size = 256, pattern: 'grid' | 'running' | 'band' = 'grid'): THREE.CanvasTexture {
  const S = size;
  const [c, ctx] = canvas(S, S);
  const R = rng(base.length * 131 + tiles * 17 + parseInt(base.slice(1), 16) % 9973);
  ctx.fillStyle = joint;
  ctx.fillRect(0, 0, S, S);
  const s = S / tiles;
  const gap = Math.max(1.5, s * 0.045);
  const baseC = new THREE.Color(base);
  const tmp = new THREE.Color();
  for (let y = 0; y < tiles; y++) {
    const shift = pattern === 'running' && y % 2 ? s / 2 : 0;
    for (let x = -1; x < tiles; x++) {
      const px = x * s + shift;
      if (px + s < 0 || px >= S) continue;
      const v = (R() - 0.5) * 0.14;
      tmp.copy(baseC).offsetHSL((R() - 0.5) * 0.012, (R() - 0.5) * 0.04, v);
      if (pattern === 'band' && y % 4 === 3) tmp.multiplyScalar(0.78);
      ctx.fillStyle = `#${tmp.getHexString()}`;
      ctx.fillRect(px + gap / 2, y * s + gap / 2, s - gap, s - gap);
      // bevel: light upper-left edge, dark lower-right edge
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(px + gap / 2, y * s + gap / 2, s - gap, 1.5);
      ctx.fillRect(px + gap / 2, y * s + gap / 2, 1.5, s - gap);
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.fillRect(px + gap / 2, y * s + s - gap / 2 - 1.5, s - gap, 1.5);
      ctx.fillRect(px + s - gap / 2 - 1.5, y * s + gap / 2, 1.5, s - gap);
      // grain
      for (let k = 0; k < s * 0.6; k++) {
        ctx.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
        ctx.fillRect(px + gap + R() * (s - gap * 2), y * s + gap + R() * (s - gap * 2), 1, 1);
      }
      if (R() < 0.08) {
        // stain
        const g = ctx.createRadialGradient(px + s / 2, y * s + s / 2, 0, px + s / 2, y * s + s / 2, s * 0.45);
        g.addColorStop(0, 'rgba(40,30,20,0.18)');
        g.addColorStop(1, 'rgba(40,30,20,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px, y * s, s, s);
      }
      if (R() < 0.05) {
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        strokePath(ctx, crackPath(R, px + R() * s, y * s + R() * s, 3, R() - 0.5, R() - 0.5).map(([a, b2]) => [Math.min(px + s, Math.max(px, a)), Math.min(y * s + s, Math.max(y * s, b2))] as [number, number]));
      }
    }
  }
  // Gum spots
  for (let i = 0; i < tiles * 2; i++) {
    ctx.fillStyle = `rgba(30,28,26,${0.2 + R() * 0.25})`;
    ctx.beginPath();
    ctx.arc(R() * S, R() * S, 1 + R() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, [1, 1]);
}

export function makeDesertTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const R = rng(88);
  ctx.fillStyle = '#a88e6c';
  ctx.fillRect(0, 0, 512, 512);
  // broad tonal patches
  for (let i = 0; i < 40; i++) {
    const x = R() * 512;
    const y = R() * 512;
    const rad = 30 + R() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const dark = R() < 0.5;
    g.addColorStop(0, dark ? 'rgba(110,84,56,0.25)' : 'rgba(210,188,150,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 16000; i++) {
    const v = 140 + R() * 50;
    ctx.fillStyle = `rgb(${v},${v - 24},${v - 58})`;
    ctx.fillRect(R() * 512, R() * 512, 2, 2);
  }
  // creosote / bursage dots with shadows
  for (let i = 0; i < 260; i++) {
    const x = R() * 512;
    const y = R() * 512;
    const rad = 1.5 + R() * 3;
    ctx.fillStyle = 'rgba(70,56,38,0.35)';
    ctx.beginPath();
    ctx.arc(x + 1.5, y + 1.5, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = R() < 0.6 ? '#6b6a3c' : '#8a8452';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, [60, 60]);
}

/** Decomposed-granite gravel for desert landscaping (median, planters). */
export function makeGravelTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const R = rng(515);
  ctx.fillStyle = '#a08466';
  ctx.fillRect(0, 0, 256, 256);
  const cols = ['#c2a27e', '#8a6a4e', '#b48c66', '#d6c0a0', '#6e5a48', '#9a7a62', '#c8b090'];
  for (let i = 0; i < 2600; i++) {
    const x = R() * 256;
    const y = R() * 256;
    const rx = 0.8 + R() * 2.2;
    const ry = rx * (0.6 + R() * 0.5);
    ctx.fillStyle = 'rgba(40,28,18,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 0.8, y + 0.8, rx, ry, R() * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cols[Math.floor(R() * cols.length)];
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, R() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, [1, 1]);
}

// ------------------------------------------------------------------------------------------------
// Tower facades
// ------------------------------------------------------------------------------------------------

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

interface WinRect {
  x: number;
  y: number;
  w: number;
  h: number;
  col: number;
  row: number;
}

function facadeLayout(S: number, cols: number, rows: number, style: number): WinRect[] {
  const cw = S / cols;
  const rh = S / rows;
  const out: WinRect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (style === 2) out.push({ x: col * cw + 1, y: row * rh + rh * 0.2, w: cw - 2, h: rh * 0.8 - 1, col, row });
      else if (style === 1) out.push({ x: col * cw, y: row * rh + rh * 0.3, w: cw, h: rh * 0.62, col, row });
      else out.push({ x: col * cw + cw * 0.2, y: row * rh + rh * 0.24, w: cw * 0.6, h: rh * 0.58, col, row });
    }
  }
  return out;
}

const roughFacade = new Map<string, THREE.CanvasTexture>();
/** Roughness (G) / metalness (B) for a facade layout: matte walls, glossy glass, satin metal mullions. */
function facadeRoughness(cols: number, rows: number, style: number): THREE.CanvasTexture {
  const key = `${cols}|${rows}|${style}`;
  let t = roughFacade.get(key);
  if (t) return t;
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = style === 2 ? rm(0.42, 0.75) : rm(0.88, 0);
  ctx.fillRect(0, 0, S, S);
  const cw = S / cols;
  const rh = S / rows;
  for (const w of facadeLayout(S, cols, rows, style)) {
    ctx.fillStyle = rm(0.06, 1);
    ctx.fillRect(w.x, w.y, w.w, w.h);
  }
  ctx.fillStyle = rm(0.35, 0.9);
  for (let col = 0; col <= cols; col++) ctx.fillRect(col * cw - 1, 0, 2, S);
  if (style !== 0) for (let row = 0; row <= rows; row++) ctx.fillRect(0, row * rh + rh * 0.2 - 1, S, 2);
  t = finish(c, undefined, false);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  roughFacade.set(key, t);
  return t;
}

/**
 * Hotel tower skin: albedo, an emissive map (which rooms are lit: warm, cool, dimmed, the odd TV-blue)
 * and a roughness/metalness map so glass is glossy while walls stay matte. The facade shader reads the
 * emissive colour at each window as that room's light and builds the room behind the glass from it.
 */
export function makeFacadeTextures(spec: FacadeSpec): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const S = 512;
  const ES = 256;
  const [c, ctx] = canvas(S, S);
  const [e, ectx] = canvas(ES, ES);
  ectx.scale(ES / S, ES / S);
  const seed = spec.seed ?? 7;
  const style = spec.style ?? 0;
  const R = rng(seed * 7919 + spec.cols * 31 + spec.rows * 131);
  const cw = S / spec.cols;
  const rh = S / spec.rows;
  const wallC = new THREE.Color(spec.wall);
  const glassC = new THREE.Color(spec.glass);
  const mullC = new THREE.Color(spec.mullion);
  const tmp = new THREE.Color();
  const hex = (col: THREE.Color) => `#${col.getHexString()}`;

  // Wall with weathering
  ctx.fillStyle = style === 2 ? hex(glassC.clone().multiplyScalar(0.85)) : spec.wall;
  ctx.fillRect(0, 0, S, S);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(R() * S, R() * S, 2, 2);
  }
  if (style !== 2) {
    for (let i = 0; i < 26; i++) {
      const x = R() * S;
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(R(), `rgba(20,16,12,${0.03 + R() * 0.05})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 2 + R() * 6, S);
    }
  }

  // Floor bands / spandrels
  const bandLight = R() < 0.5;
  for (let row = 0; row < spec.rows; row++) {
    const y = row * rh;
    if (style === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, y, S, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(0, y + 2, S, 1);
    } else if (style === 1) {
      tmp.copy(wallC).multiplyScalar(bandLight ? 1.12 : 0.86);
      ctx.fillStyle = hex(tmp);
      ctx.fillRect(0, y, S, rh * 0.3);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(0, y, S, 1.5);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(0, y + rh * 0.3 - 1.5, S, 1.5);
    } else {
      // opaque spandrel glass at each slab
      tmp.copy(glassC).multiplyScalar(0.55);
      ctx.fillStyle = hex(tmp);
      ctx.fillRect(0, y, S, rh * 0.2);
    }
  }
  // Pilasters between punched windows
  if (style === 0) {
    for (let col = 0; col < spec.cols; col++) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(col * cw, 0, cw * 0.08, S);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(col * cw + cw * 0.92, 0, cw * 0.08, S);
    }
  }

  // Windows
  const litShare = 0.3 + R() * 0.3;
  const warm = new THREE.Color(spec.lit);
  for (const w of facadeLayout(S, spec.cols, spec.rows, style)) {
    // Glass: per-pane tint jitter + sky reflection (lighter at the top)
    tmp.copy(glassC).multiplyScalar(0.86 + R() * 0.28);
    const g = ctx.createLinearGradient(0, w.y, 0, w.y + w.h);
    g.addColorStop(0, hex(tmp.clone().lerp(new THREE.Color(0xc8d8e8), style === 2 ? 0.28 : 0.18)));
    g.addColorStop(1, hex(tmp.clone().multiplyScalar(0.8)));
    ctx.fillStyle = g;
    ctx.fillRect(w.x, w.y, w.w, w.h);

    // Curtains, furniture and lamps live in the facade shader (rooms behind the glass, see facadeShader.ts);
    // the textures only say which rooms are lit and in what colour, so near and far views agree.
    const lit = R() < litShare;
    if (lit) {
      const k = R();
      let col: THREE.Color;
      let bright = 0.65 + R() * 0.35;
      if (k < 0.55) col = warm.clone().offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.1);
      else if (k < 0.78) col = new THREE.Color(0xe8eeff);
      else if (k < 0.9) {
        col = warm.clone();
        bright *= 0.45;
      } else if (k < 0.96) col = new THREE.Color(0x5a8cff);
      else col = new THREE.Color(0xff9a6a);
      col.multiplyScalar(bright);
      if (k >= 0.9 && k < 0.96) {
        // TV glow: blue flicker gradient from the bottom of the room
        const tg = ectx.createLinearGradient(0, w.y + w.h, 0, w.y);
        tg.addColorStop(0, hex(col));
        tg.addColorStop(1, hex(col.clone().multiplyScalar(0.35)));
        ectx.fillStyle = tg;
      } else {
        // Ceiling-lit room: brighter at the top
        const lg = ectx.createLinearGradient(0, w.y, 0, w.y + w.h);
        lg.addColorStop(0, hex(col));
        lg.addColorStop(1, hex(col.clone().multiplyScalar(0.55)));
        ectx.fillStyle = lg;
      }
      ectx.fillRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
    }
    // Frame, centre mullion, sill
    ctx.strokeStyle = hex(mullC.clone().multiplyScalar(0.8));
    ctx.lineWidth = 1;
    ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
    if (w.w > 18) {
      ctx.fillStyle = spec.mullion;
      const n = style === 1 ? 2 : 1;
      for (let k = 1; k <= n; k++) ctx.fillRect(w.x + (w.w * k) / (n + 1) - 1, w.y, 2, w.h);
    }
    if (style === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(w.x - 1, w.y + w.h, w.w + 2, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(w.x, w.y, w.w, 2);
    }
  }
  // Curtain-wall mullion grid + ribbon mullions
  if (style !== 0) {
    ctx.fillStyle = spec.mullion;
    for (let col = 0; col <= spec.cols; col++) ctx.fillRect(col * cw - 1.5, 0, 3, S);
    for (let row = 0; row <= spec.rows; row++) ctx.fillRect(0, row * rh + rh * 0.2 - 1, S, 2);
  }

  const map = finish(c);
  const emissiveMap = finish(e);
  for (const t of [map, emissiveMap]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return { map, emissiveMap, roughnessMap: facadeRoughness(spec.cols, spec.rows, style) };
}

// ------------------------------------------------------------------------------------------------
// Vegetation + signage helpers
// ------------------------------------------------------------------------------------------------

let palmTrunkTex: THREE.CanvasTexture | null = null;
/** Date-palm trunk: overlapping diamond leaf-base scars. u wraps around, v repeats every 0.5 m. */
export function makePalmTrunkTexture(): THREE.CanvasTexture {
  if (palmTrunkTex) return palmTrunkTex;
  // 128 px ≈ 1.4 m round the trunk, 128 px = 0.5 m up it: 7 columns × 4 rows of cut frond bases
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const R = rng(31);
  ctx.fillStyle = '#4e3e2e';
  ctx.fillRect(0, 0, S, S);
  const cols = 7;
  const rows = 4;
  const cw = S / cols;
  const rh = S / rows;
  for (let row = -1; row <= rows; row++) {
    for (let col = -1; col <= cols; col++) {
      const cx = (col + (row % 2 ? 0.5 : 0)) * cw;
      const cy = row * rh;
      const rx = cw * 0.62;
      const ry = rh * 0.78;
      const v = 0.85 + R() * 0.3;
      const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry * 0.6);
      g.addColorStop(0, `rgb(${Math.round(150 * v)},${Math.round(124 * v)},${Math.round(92 * v)})`);
      g.addColorStop(1, `rgb(${Math.round(96 * v)},${Math.round(76 * v)},${Math.round(56 * v)})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95, true);
      ctx.closePath();
      ctx.fill();
      // shadowed lip under each frond base
      ctx.strokeStyle = 'rgba(28,20,12,0.8)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      // fibre at the cut
      ctx.fillStyle = 'rgba(70,52,34,0.6)';
      ctx.fillRect(cx - rx * 0.5, cy - ry * 0.05, rx, 1.5);
    }
  }
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = R() < 0.5 ? 'rgba(255,240,220,0.07)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(R() * S, R() * S, 1, 2);
  }
  palmTrunkTex = finish(c, [1, 1]);
  return palmTrunkTex;
}

let frondTex: THREE.CanvasTexture | null = null;
/** Alpha-tested pinnate frond: v = 0 at the base, 1 at the tip, rachis down u = 0.5. */
export function makePalmFrondTexture(): THREE.CanvasTexture {
  if (frondTex) return frondTex;
  const W = 128;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  const R = rng(77);
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  const greens = ['#3f7a34', '#4b8a3a', '#36702f', '#5a8f3e', '#2f6a2c', '#6a9a44'];
  // Leaflets angle toward the tip (canvas top), longest mid-frond
  for (let y = H - 30; y > 8; y -= 5) {
    const t = 1 - y / H;
    const reach = (W / 2 - 4) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.7) * (0.85 + R() * 0.15);
    for (const s of [-1, 1]) {
      const len = reach * (0.9 + R() * 0.1);
      const tipX = W / 2 + s * len;
      const tipY = y - len * (0.55 + R() * 0.2);
      ctx.strokeStyle = greens[Math.floor(R() * greens.length)];
      ctx.lineWidth = 2.6 + R() * 1.4;
      ctx.beginPath();
      ctx.moveTo(W / 2, y);
      ctx.quadraticCurveTo(W / 2 + s * len * 0.5, y - len * 0.1, tipX, tipY);
      ctx.stroke();
      if (t > 0.85 && R() < 0.5) {
        ctx.strokeStyle = 'rgba(160,140,70,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(W / 2 + s * len * 0.7, y - len * 0.4);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
      }
    }
  }
  // Rachis
  const g = ctx.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0, '#8a7a44');
  g.addColorStop(1, '#4a7a34');
  ctx.strokeStyle = g;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W / 2, H);
  ctx.lineTo(W / 2, 4);
  ctx.stroke();
  frondTex = finish(c);
  frondTex.wrapS = THREE.ClampToEdgeWrapping;
  frondTex.wrapT = THREE.ClampToEdgeWrapping;
  return frondTex;
}

let chaseTex: THREE.CanvasTexture | null = null;
/** Three bulb cells (one lit, two dim) for chasing marquee borders; scroll `offset.x` by 1/3 to chase. */
export function makeChaseBulbTexture(): THREE.CanvasTexture {
  if (chaseTex) return chaseTex;
  const [c, ctx] = canvas(96, 32);
  for (let i = 0; i < 3; i++) {
    const cx = i * 32 + 16;
    ctx.fillStyle = '#2a1c08';
    ctx.fillRect(i * 32, 0, 32, 32);
    const lit = i === 0;
    const g = ctx.createRadialGradient(cx, 16, 0, cx, 16, 13);
    g.addColorStop(0, lit ? '#ffffff' : '#c89a48');
    g.addColorStop(0.45, lit ? '#ffe6a0' : '#8a6428');
    g.addColorStop(1, lit ? 'rgba(255,190,80,0.0)' : 'rgba(60,40,12,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, 16, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  chaseTex = finish(c);
  chaseTex.wrapS = THREE.RepeatWrapping;
  chaseTex.magFilter = THREE.LinearFilter;
  return chaseTex;
}

let paintTex: THREE.CanvasTexture | null = null;
/** Worn thermoplastic road paint (crosswalks, stop bars). */
export function makeRoadPaintTexture(): THREE.CanvasTexture {
  if (paintTex) return paintTex;
  const [c, ctx] = canvas(64, 128);
  const R = rng(9);
  ctx.fillStyle = '#ecebe6';
  ctx.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(${60 + R() * 40},${60 + R() * 40},${64 + R() * 40},${0.2 + R() * 0.55})`;
    const s = 1 + Math.floor(R() * 3);
    ctx.fillRect(R() * 64, R() * 128, s, s);
  }
  // tire wear across the middle
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.3, 'rgba(40,40,44,0)');
  g.addColorStop(0.5, 'rgba(40,40,44,0.22)');
  g.addColorStop(0.7, 'rgba(40,40,44,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 128);
  paintTex = finish(c);
  return paintTex;
}

// ------------------------------------------------------------------------------------------------
// Interiors + signs
// ------------------------------------------------------------------------------------------------

export type CarpetStyle = 'grid' | 'scroll' | 'damask' | 'deco' | 'confetti' | 'medallion' | 'floral';

/**
 * Vegas casino carpet: loud on purpose. Each property gets its own classic pattern (picked from its
 * colours unless `style` says otherwise): swirling scrolls, damask lattices, deco fans, bowling-alley
 * confetti, Roman medallions, big florals. Seamless 512² tile; two-colour calls (stone-like floors) keep
 * the plain grid.
 */
export function makeCarpetTexture(primary: string, accent: string, accent2?: string, style?: CarpetStyle): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const known: Record<string, CarpetStyle> = {
    '#4a1220': 'damask', // Paris
    '#1a0a0c': 'scroll', // Horseshoe
    '#4a1238': 'deco', // Flamingo
    '#3a1420': 'medallion', // Venetian
    '#5a0c10': 'confetti', // Slots-A-Fun
    '#6a0a12': 'medallion', // Excalibur
    '#1c1230': 'scroll', // Cosmopolitan
    '#5a1a1e': 'floral', // Bellagio
    '#3a1e12': 'medallion', // Caesars
    '#141a36': 'deco', // Luxor
  };
  let h = 0;
  for (const ch of primary + accent + (accent2 ?? '')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  const pool: CarpetStyle[] = ['scroll', 'damask', 'deco', 'confetti', 'medallion', 'floral'];
  const st: CarpetStyle = style ?? (accent2 ? known[primary.toLowerCase()] ?? pool[Math.abs(h) % pool.length] : 'grid');
  const R = rng(Math.abs(h) + 7);
  const a2 = accent2 ?? accent;
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, S, S);
  // Draw a motif at (x, y) and at its wrapped copies so the tile is seamless.
  const wrap = (x: number, y: number, r: number, fn: (x: number, y: number) => void) => {
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const px = x + ox;
        const py = y + oy;
        if (px + r < 0 || px - r > S || py + r < 0 || py - r > S) continue;
        fn(px, py);
      }
  };
  // Soft wool texture underneath everything: tiny tufts of lighter/darker pile.
  const tufts = () => {
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(R() * S, R() * S, 1.5, 1.5);
    }
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (st === 'grid') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    for (let x = 0; x <= S; x += 128)
      for (let y = 0; y <= S; y += 128) {
        ctx.beginPath();
        ctx.arc(x, y, 44, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeRect(x + 36, y + 36, 56, 56);
      }
    if (accent2) {
      ctx.fillStyle = accent2;
      for (let x = 64; x < S; x += 128) for (let y = 64; y < S; y += 128) ctx.fillRect(x - 8, y - 8, 16, 16);
    }
  } else if (st === 'scroll') {
    // Acanthus-like swirls: spirals with leaves sprouting off them, in two colours.
    for (let i = 0; i < 22; i++) {
      const x = R() * S;
      const y = R() * S;
      const r0 = 22 + R() * 34;
      const dir = R() < 0.5 ? 1 : -1;
      const a0 = R() * Math.PI * 2;
      wrap(x, y, r0 * 2.2, (px, py) => {
        ctx.strokeStyle = i % 3 === 0 ? a2 : accent;
        ctx.lineWidth = 5;
        ctx.beginPath();
        for (let t = 0; t <= 1; t += 0.02) {
          const ang = a0 + dir * t * Math.PI * 3.2;
          const rr = r0 * (1.9 - t * 1.7);
          const qx = px + Math.cos(ang) * rr;
          const qy = py + Math.sin(ang) * rr;
          if (t === 0) ctx.moveTo(qx, qy);
          else ctx.lineTo(qx, qy);
        }
        ctx.stroke();
        ctx.fillStyle = i % 3 === 0 ? accent : a2;
        for (let k = 0; k < 5; k++) {
          const t = 0.1 + k * 0.17;
          const ang = a0 + dir * t * Math.PI * 3.2;
          const rr = r0 * (1.9 - t * 1.7);
          ctx.save();
          ctx.translate(px + Math.cos(ang) * rr, py + Math.sin(ang) * rr);
          ctx.rotate(ang + dir * 0.9);
          ctx.beginPath();
          ctx.ellipse(0, -9, 5, 12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
    }
  } else if (st === 'damask' || st === 'medallion') {
    // Diamond lattice with a rosette (damask) or a ringed medallion with a key border (medallion) in each cell.
    const n = 4;
    const cell = S / n;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    for (let i = -n; i <= n * 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell + S, S);
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell - S, S);
      ctx.stroke();
    }
    for (let gx = 0; gx < n; gx++)
      for (let gy = 0; gy < n; gy++) {
        const cx = (gx + 0.5) * cell + ((gy % 2) * cell) / 2;
        const cy = (gy + 0.5) * cell;
        wrap(cx % S, cy, cell, (px, py) => {
          if (st === 'damask') {
            for (let k = 0; k < 8; k++) {
              ctx.save();
              ctx.translate(px, py);
              ctx.rotate((k * Math.PI) / 4);
              ctx.fillStyle = k % 2 ? accent : a2;
              ctx.beginPath();
              ctx.ellipse(0, -20, 8, 20, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(px, py, 8, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.strokeStyle = accent;
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(px, py, 38, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = a2;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(px, py, 28, 0, Math.PI * 2);
            ctx.stroke();
            // little Greek-key teeth round the ring
            ctx.fillStyle = accent;
            for (let k = 0; k < 16; k++) {
              const ang = (k / 16) * Math.PI * 2;
              ctx.save();
              ctx.translate(px + Math.cos(ang) * 46, py + Math.sin(ang) * 46);
              ctx.rotate(ang);
              ctx.fillRect(-3, -5, 6, 10);
              ctx.restore();
            }
            ctx.fillStyle = a2;
            ctx.beginPath();
            for (let k = 0; k < 10; k++) {
              const ang = (k / 10) * Math.PI * 2 - Math.PI / 2;
              const rr = k % 2 ? 9 : 20;
              ctx.lineTo(px + Math.cos(ang) * rr, py + Math.sin(ang) * rr);
            }
            ctx.closePath();
            ctx.fill();
          }
        });
      }
  } else if (st === 'deco') {
    // Overlapping art-deco fans (scales), each with radiating ribs and a jewel at the hinge.
    const fw = 128;
    const fh = 64;
    for (let row = -1; row <= S / fh + 1; row++)
      for (let col = -1; col <= S / fw + 1; col++) {
        const x = col * fw + (row % 2 ? fw / 2 : 0);
        const y = row * fh;
        ctx.fillStyle = row % 4 === 0 ? a2 : primary;
        ctx.beginPath();
        ctx.arc(x, y, fw / 2 - 4, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4;
        for (const rr of [fw / 2 - 6, fw / 2 - 20, fw / 2 - 34]) {
          ctx.beginPath();
          ctx.arc(x, y, rr, Math.PI, 0);
          ctx.stroke();
        }
        ctx.lineWidth = 2;
        for (let k = 1; k < 8; k++) {
          const ang = Math.PI + (k / 8) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(ang) * 12, y + Math.sin(ang) * 12);
          ctx.lineTo(x + Math.cos(ang) * (fw / 2 - 6), y + Math.sin(ang) * (fw / 2 - 6));
          ctx.stroke();
        }
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
  } else if (st === 'confetti') {
    // The bowling-alley / arcade carpet: stars, squiggles, dots and triangles in neon on dark.
    const cols = [accent, a2, '#3af0ff', '#ff4fd8', '#9dff4a', '#ffffff'];
    for (let i = 0; i < 160; i++) {
      const x = R() * S;
      const y = R() * S;
      const col = cols[i % cols.length];
      const kind = i % 4;
      const rot = R() * Math.PI * 2;
      wrap(x, y, 30, (px, py) => {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        ctx.fillStyle = col;
        ctx.strokeStyle = col;
        if (kind === 0) {
          ctx.beginPath();
          for (let k = 0; k < 10; k++) {
            const ang = (k / 10) * Math.PI * 2;
            const rr = k % 2 ? 6 : 15;
            ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          }
          ctx.closePath();
          ctx.fill();
        } else if (kind === 1) {
          ctx.lineWidth = 4;
          ctx.beginPath();
          for (let t = -1; t <= 1; t += 0.1) ctx.lineTo(t * 22, Math.sin(t * 7) * 6);
          ctx.stroke();
        } else if (kind === 2) {
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -12);
          ctx.lineTo(11, 9);
          ctx.lineTo(-11, 9);
          ctx.closePath();
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.restore();
      });
    }
  } else {
    // floral: big open roses with leaves, scattered on a faint trellis.
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    for (let i = 0; i <= S; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, S);
      ctx.moveTo(0, i);
      ctx.lineTo(S, i);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
      const x = R() * S;
      const y = R() * S;
      const r = 20 + R() * 16;
      const leaves = [R(), R(), R()].map((v) => v * Math.PI * 2); // fixed per rose, so wrapped copies match
      wrap(x, y, r * 2.4, (px, py) => {
        ctx.fillStyle = a2;
        for (let k = 0; k < 3; k++) {
          const ang = leaves[k];
          ctx.save();
          ctx.translate(px + Math.cos(ang) * r * 1.3, py + Math.sin(ang) * r * 1.3);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 0.75, r * 0.32, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        for (let ring = 3; ring >= 1; ring--) {
          ctx.fillStyle = ring % 2 ? accent : primary;
          for (let k = 0; k < 6; k++) {
            const ang = (k / 6) * Math.PI * 2 + ring;
            ctx.beginPath();
            ctx.arc(px + Math.cos(ang) * r * 0.25 * ring, py + Math.sin(ang) * r * 0.25 * ring, r * 0.22 * ring, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(px, py, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  tufts();
  return finish(c, [6, 6]);
}

/** Montgolfier balloon envelope (equirect, u wraps round): blue/red gores, a gold equator band with PARIS twice, gold suns. */
export function makeBalloonTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 512);
  const colors = ['#1f3f86', '#c8202e'];
  const n = 16;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % 2];
    ctx.fillRect((i * 1024) / n, 0, 1024 / n + 1, 512);
    ctx.fillStyle = '#f7e5b7';
    ctx.fillRect((i * 1024) / n - 2, 0, 4, 512);
  }
  // crown cap and the lower skirt
  ctx.fillStyle = '#f2b830';
  ctx.fillRect(0, 0, 1024, 34);
  ctx.fillStyle = '#182442';
  ctx.fillRect(0, 440, 1024, 72);
  ctx.fillStyle = '#f2b830';
  for (let x = 0; x < 1024; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 440);
    ctx.lineTo(x + 16, 470);
    ctx.lineTo(x + 32, 440);
    ctx.fill();
  }
  // gold suns on the upper gores
  for (let i = 0; i < 8; i++) {
    const cx = (i + 0.5) * 128;
    ctx.fillStyle = '#f5ca56';
    ctx.beginPath();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const r = k % 2 ? 14 : 24;
      ctx.lineTo(cx + Math.cos(a) * r, 110 + Math.sin(a) * r);
    }
    ctx.fill();
  }
  // equator band with PARIS twice round
  ctx.fillStyle = '#f5ca56';
  ctx.fillRect(0, 196, 1024, 120);
  ctx.fillStyle = '#182442';
  ctx.fillRect(0, 196, 1024, 6);
  ctx.fillRect(0, 310, 1024, 6);
  ctx.font = 'bold 92px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '10px';
  // u = 0 / 0.5 face ±x (the Strip and the casino), so PARIS is centred there and wraps the seam
  for (const x of [0, 512, 1024]) ctx.fillText('PARIS', x, 260, 440);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#c8202e';
  for (const x of [256, 768]) {
    ctx.beginPath();
    ctx.arc(x, 256, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** Neon-tube sign face: glowing double tube border, tube-lettered title with a hot white core. */
export function makeSignTexture(text: string, bg: string, fg: string, subtext?: string, font = 'Georgia, system-ui, sans-serif'): THREE.CanvasTexture {
  const [c, ctx] = canvas(640, 160);
  // Backing with a soft vignette so the tubes pop
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 640, 160);
  const v = ctx.createRadialGradient(320, 80, 40, 320, 80, 360);
  v.addColorStop(0, 'rgba(255,255,255,0.05)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 640, 160);
  // Neon tube border (outer + inner), each with a glow and a pale core
  const tube = (x: number, y: number, w: number, h: number, r: number, width: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.shadowColor = fg;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = fg;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, width * 0.35);
    ctx.stroke();
  };
  tube(9, 9, 622, 142, 16, 5);
  tube(19, 19, 602, 122, 10, 2.5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 62px ${font}`;
  const ty = subtext ? 62 : 82;
  ctx.shadowColor = fg;
  ctx.shadowBlur = 22;
  ctx.fillStyle = fg;
  ctx.fillText(text, 320, ty, 580);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.strokeText(text, 320, ty, 580);
  if (subtext) {
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.shadowColor = fg;
    ctx.shadowBlur = 10;
    ctx.fillStyle = fg;
    ctx.fillText(subtext, 320, 122, 580);
    ctx.shadowBlur = 0;
  }
  return finish(c);
}

let ledGrid: HTMLCanvasElement | null = null;
function ledGridPattern(): HTMLCanvasElement {
  if (ledGrid) return ledGrid;
  const [c, ctx] = canvas(4, 4, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.fillRect(0, 0, 4, 1);
  ctx.fillRect(0, 0, 1, 4);
  ledGrid = c;
  return c;
}

/**
 * Animated LED marquee (Strip-facing video boards). Call draw(t) to refresh. Cycles through scenes:
 * headline slides with a light sweep, a starburst "spotlight" slide, and a jackpot 7-7-7 slide, with
 * chasing LED dots round the edge, twinkles and a scrolling ticker along the bottom.
 */
export interface LedShow {
  /** headliner / show name, big */
  name: string;
  /** dates or venue line */
  sub: string;
  color: string;
  art: 'singer' | 'magic' | 'cirque' | 'dj' | 'comic' | 'band';
}

export class LedBoard {
  /** The camera position (set by signKit); boards placed with at() skip redraws when it is far away. */
  static viewer: THREE.Vector3 | null = null;
  static range = 340;
  readonly tex: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly w: number;
  private readonly h: number;
  private lastFrame = -1;
  private grid: CanvasPattern | null = null;
  private pos: THREE.Vector3 | null = null;
  private showList: LedShow[] = [];

  /** Where the board stands, so it only animates while someone could read it. */
  at(x: number, y: number, z: number): this {
    this.pos = new THREE.Vector3(x, y, z);
    return this;
  }

  /** Add headliner slides (a performer silhouette in a spotlight, the name, the dates). */
  withShows(shows: LedShow[]): this {
    this.showList = shows;
    return this;
  }

  constructor(
    private readonly title: string,
    private readonly lines: string[],
    private readonly palette: string[],
    w = 256,
    h = 512
  ) {
    const [c, ctx] = canvas(w, h, 1); // redrawn every frame, with a 4 px LED grid: stays 1x
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.tex = finish(c);
  }

  /** Headliner ad: a spotlight cone, the performer's silhouette with a rim light, the name and the dates. */
  private drawShow(s: LedShow, t: number, local: number, frame: number, bodyH: number, portrait: boolean): void {
    const { ctx, w } = this;
    const bg = ctx.createLinearGradient(0, 0, 0, bodyH);
    bg.addColorStop(0, '#05040a');
    bg.addColorStop(0.55, s.color);
    bg.addColorStop(1, '#05040a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, bodyH);
    // figure box: lower part (portrait) or the left half (landscape)
    const fx = portrait ? w / 2 : w * 0.27;
    const fh = portrait ? bodyH * 0.46 : bodyH * 0.8;
    const fy = portrait ? bodyH * 0.96 : bodyH * 0.96;
    // spotlight cone
    const sway = Math.sin(t * 0.9) * w * 0.05;
    const cone = ctx.createLinearGradient(0, 0, 0, fy);
    cone.addColorStop(0, 'rgba(255,255,255,0.55)');
    cone.addColorStop(1, 'rgba(255,255,255,0.08)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(fx + sway - fh * 0.04, 0);
    ctx.lineTo(fx + sway + fh * 0.04, 0);
    ctx.lineTo(fx + fh * 0.42, fy);
    ctx.lineTo(fx - fh * 0.42, fy);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(fx, fy - fh * 0.01, fh * 0.42, fh * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    // silhouette (unit space: 0 = feet, 1 = top of head)
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(fh, -fh);
    ctx.fillStyle = '#07060c';
    ctx.strokeStyle = '#07060c';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const head = (x: number, y: number, r = 0.07) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const limb = (pts: number[], wdt = 0.05) => {
      ctx.lineWidth = wdt;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.stroke();
    };
    const bob = Math.sin(t * 5) * 0.015;
    switch (s.art) {
      case 'singer': {
        ctx.beginPath(); // gown
        ctx.moveTo(-0.2, 0);
        ctx.quadraticCurveTo(-0.06, 0.4, -0.07, 0.62);
        ctx.lineTo(0.07, 0.62);
        ctx.quadraticCurveTo(0.06, 0.4, 0.2, 0);
        ctx.fill();
        head(0, 0.86 + bob);
        limb([-0.07, 0.6, -0.2, 0.78 + bob * 2, -0.26, 0.95 + bob * 3]);
        limb([0.07, 0.6, 0.1, 0.7, 0.04, 0.8]);
        limb([0.04, 0.8, 0.02, 0.84], 0.035); // mic
        break;
      }
      case 'magic': {
        ctx.beginPath(); // cape
        ctx.moveTo(-0.22, 0.02);
        ctx.lineTo(-0.08, 0.7);
        ctx.lineTo(0.08, 0.7);
        ctx.lineTo(0.22, 0.02);
        ctx.fill();
        head(0, 0.8);
        ctx.fillRect(-0.075, 0.86, 0.15, 0.13); // top hat
        ctx.fillRect(-0.11, 0.86, 0.22, 0.025);
        limb([0.08, 0.66, 0.24, 0.78, 0.4, 0.86]);
        ctx.fillStyle = '#fff6c8';
        for (let i = 0; i < 6; i++) {
          const a = t * 3 + i;
          ctx.fillRect(0.42 + Math.cos(a) * 0.08 * (i % 3), 0.88 + Math.sin(a * 1.3) * 0.08, 0.02, 0.02);
        }
        break;
      }
      case 'cirque': {
        ctx.lineWidth = 0.025;
        ctx.strokeStyle = '#d8b25a';
        ctx.beginPath();
        ctx.arc(0, 0.55, 0.42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#07060c';
        const spin = Math.sin(t * 1.4) * 0.3;
        ctx.save();
        ctx.translate(0, 0.55);
        ctx.rotate(spin);
        head(0, 0.28, 0.06);
        limb([0, 0.2, 0, -0.05], 0.07);
        limb([0, 0.15, -0.36, 0.2]);
        limb([0, 0.15, 0.36, 0.2]);
        limb([0, -0.05, -0.3, -0.3]);
        limb([0, -0.05, 0.3, -0.3]);
        ctx.restore();
        break;
      }
      case 'dj': {
        ctx.fillRect(-0.4, 0, 0.8, 0.4); // decks
        head(0, 0.74 + bob);
        limb([0, 0.42, 0, 0.66], 0.12);
        limb([-0.05, 0.62, -0.22, 0.8 + bob * 3, -0.24, 1.0 + bob * 4]);
        limb([0.05, 0.62, 0.22, 0.8 - bob * 3, 0.26, 1.0 - bob * 4]);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 0.012;
        for (let i = 0; i < 7; i++) {
          const a = -0.9 + i * 0.3 + Math.sin(t * 2 + i) * 0.1;
          limb([0, 0.4, Math.sin(a) * 1.4, 0.4 + Math.cos(a) * 1.4], 0.012);
        }
        break;
      }
      case 'comic': {
        limb([0.25, 0, 0.25, 0.62], 0.02); // mic stand
        head(0.25, 0.66, 0.03);
        ctx.beginPath();
        ctx.moveTo(-0.14, 0);
        ctx.lineTo(-0.1, 0.62);
        ctx.lineTo(0.1, 0.62);
        ctx.lineTo(0.14, 0);
        ctx.fill();
        head(0, 0.8);
        limb([0.09, 0.58, 0.2, 0.62, 0.24, 0.66]);
        limb([-0.09, 0.58, -0.26, 0.5 + bob * 4, -0.36, 0.62 + bob * 4]);
        break;
      }
      case 'band': {
        for (const [x, sc] of [
          [-0.34, 0.8],
          [0, 1],
          [0.34, 0.85],
        ] as Array<[number, number]>) {
          ctx.save();
          ctx.translate(x, 0);
          ctx.scale(sc, sc);
          ctx.fillRect(-0.07, 0, 0.14, 0.6);
          head(0, 0.72 + bob * (x === 0 ? 1 : -1));
          limb([-0.07, 0.5, 0.12, 0.38], 0.05);
          ctx.restore();
        }
        ctx.save();
        ctx.translate(-0.34, 0.36);
        ctx.rotate(0.5);
        ctx.fillRect(-0.15, -0.03, 0.3, 0.06); // guitar
        ctx.restore();
        break;
      }
    }
    ctx.restore();
    // rim light: a soft glow round the figure's top
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, w, bodyH);
    // name + dates
    const tx = portrait ? w / 2 : w * 0.66;
    const tw = portrait ? w * 0.9 : w * 0.62;
    const nameY = portrait ? bodyH * 0.2 : bodyH * 0.38;
    const big = Math.round(portrait ? w * 0.17 : bodyH * 0.26);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${big}px Georgia, serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 14;
    const words = s.name.split(' ');
    if (portrait && words.length > 1 && ctx.measureText(s.name).width > tw) {
      const half = Math.ceil(words.length / 2);
      ctx.fillText(words.slice(0, half).join(' '), tx, nameY - big * 0.55, tw);
      ctx.fillText(words.slice(half).join(' '), tx, nameY + big * 0.55, tw);
    } else ctx.fillText(s.name, tx, nameY, tw);
    ctx.shadowBlur = 0;
    ctx.fillStyle = local > 0.5 && frame % 4 < 2 ? '#ffd23a' : '#ffffff';
    ctx.font = `bold ${Math.round(big * 0.42)}px system-ui, sans-serif`;
    ctx.fillText(s.sub, tx, portrait ? bodyH * 0.37 : bodyH * 0.66, tw);
    ctx.fillStyle = s.color;
    const bw = Math.min(tw, big * 3.2);
    const by = portrait ? bodyH * 0.44 : bodyH * 0.8;
    ctx.fillRect(tx - bw / 2, by - big * 0.24, bw * Math.min(1, local * 2.5), big * 0.48);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(big * 0.32)}px system-ui, sans-serif`;
    if (local > 0.4) ctx.fillText('TICKETS ON SALE', tx, by, bw * 0.94);
  }

  private wrapText(text: string, y: number, maxW: number, lineH: number): void {
    const { ctx, w } = this;
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, w / 2, y);
        line = word;
        y += lineH;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, w / 2, y);
  }

  draw(t: number): void {
    const frame = Math.floor(t * 6);
    if (frame === this.lastFrame) return;
    const v = LedBoard.viewer;
    if (this.pos && v && this.pos.distanceToSquared(v) > LedBoard.range * LedBoard.range) return;
    this.lastFrame = frame;
    const { ctx, w, h } = this;
    const slideLen = 4;
    const nSlides = this.lines.length + 2 + this.showList.length;
    const slide = Math.floor(t / slideLen) % nSlides;
    const local = (t % slideLen) / slideLen;
    const hue = this.palette[slide % this.palette.length];
    const hue2 = this.palette[(slide + 1) % this.palette.length];
    const portrait = h >= w;
    const tickerH = Math.round((portrait ? w : h) * 0.12);
    const bodyH = h - tickerH;

    // Background
    const g = ctx.createLinearGradient(0, 0, w * 0.4, bodyH);
    g.addColorStop(0, hue);
    g.addColorStop(1, '#07070f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const big = Math.round((portrait ? w : h) * (portrait ? 0.13 : 0.2));
    if (slide === this.lines.length) {
      // Starburst spotlight with the title
      ctx.save();
      ctx.translate(w / 2, bodyH * 0.5);
      ctx.rotate(t * 0.6);
      for (let i = 0; i < 14; i++) {
        ctx.rotate((Math.PI * 2) / 14);
        ctx.fillStyle = i % 2 ? hue2 : 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.max(w, h), -Math.max(w, h) * 0.12);
        ctx.lineTo(Math.max(w, h), Math.max(w, h) * 0.12);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 12;
      ctx.font = `bold ${Math.round(big * (1 + 0.08 * Math.sin(t * 6)))}px Georgia, serif`;
      ctx.fillText(this.title, w / 2, bodyH * 0.5, w * 0.92);
      ctx.shadowBlur = 0;
    } else if (slide === this.lines.length + 1) {
      // Jackpot reels
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(w * 0.06, bodyH * 0.3, w * 0.88, bodyH * 0.4);
      const sym = ['7', '★', 'BAR', '7', '$', '7'];
      const settled = local > 0.45;
      for (let i = 0; i < 3; i++) {
        const x = w * (0.22 + i * 0.28);
        const spinning = !settled || local < 0.45 + i * 0.12;
        const s = spinning ? sym[(frame + i * 2) % sym.length] : '7';
        ctx.fillStyle = s === '7' ? '#ff3344' : '#ffd23a';
        ctx.font = `bold ${Math.round(Math.min(w * 0.22, bodyH * 0.3))}px Georgia, serif`;
        ctx.fillText(s, x, bodyH * 0.5, w * 0.26);
      }
      ctx.fillStyle = local > 0.8 && frame % 2 ? '#ffffff' : '#ffd23a';
      ctx.font = `bold ${Math.round(big * 0.7)}px system-ui, sans-serif`;
      ctx.fillText('JACKPOT!', w / 2, bodyH * 0.18, w * 0.9);
      ctx.fillText(this.title, w / 2, bodyH * 0.82, w * 0.9);
    } else if (slide >= this.lines.length + 2) {
      this.drawShow(this.showList[slide - this.lines.length - 2], t, local, frame, bodyH, portrait);
    } else {
      // Headline slide with a moving light sweep
      const sweep = ((t * 120) % (h + 200)) - 100;
      const sg = ctx.createLinearGradient(0, sweep - 80, 0, sweep + 80);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.22)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${big}px Georgia, serif`;
      ctx.fillText(this.title, w / 2, bodyH * (portrait ? 0.16 : 0.24), w * 0.9);
      ctx.fillStyle = hue2;
      ctx.fillRect(w * 0.2, bodyH * (portrait ? 0.27 : 0.42), w * 0.6 * Math.min(1, local * 3), 3);
      ctx.fillStyle = '#ffffff';
      const sub = Math.round((portrait ? w : h) * (portrait ? 0.1 : 0.15));
      ctx.font = `bold ${sub}px system-ui, sans-serif`;
      this.wrapText(this.lines[slide], bodyH * (portrait ? 0.44 : 0.62), w * 0.86, sub * 1.25);
    }

    // Twinkles
    for (let i = 0; i < 10; i++) {
      const p = Math.sin(t * 3 + i * 12.9898) * 43758.5453;
      const fx = p - Math.floor(p);
      const q = Math.sin(t * 2 + i * 78.233) * 12345.678;
      const fy = q - Math.floor(q);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(fx * w, fy * bodyH, 2, 2);
    }

    // Ticker along the bottom
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, bodyH, w, tickerH);
    ctx.fillStyle = hue;
    ctx.fillRect(0, bodyH, w, 2);
    ctx.textAlign = 'left';
    ctx.font = `bold ${Math.round(tickerH * 0.62)}px system-ui, sans-serif`;
    const ticker = `${this.title}  •  ${this.lines.join('  •  ')}  •  `;
    const tw = ctx.measureText(ticker).width;
    const x0 = -((t * 60) % tw);
    ctx.fillStyle = '#ffd23a';
    ctx.fillText(ticker, x0, bodyH + tickerH / 2 + 1);
    ctx.fillText(ticker, x0 + tw, bodyH + tickerH / 2 + 1);

    // Chasing LED dots around the edge
    const step = 12;
    const per = Math.floor((w + h) * 2 / step);
    for (let i = 0; i < per; i++) {
      let d = i * step;
      let x: number;
      let y: number;
      if (d < w) [x, y] = [d, 3];
      else if ((d -= w) < h) [x, y] = [w - 3, d];
      else if ((d -= h) < w) [x, y] = [w - d, h - 3];
      else [x, y] = [3, h - (d - w)];
      ctx.fillStyle = (i + frame) % 3 === 0 ? '#fff4c8' : 'rgba(255,200,90,0.35)';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }

    // LED pixel grid
    if (!this.grid) this.grid = ctx.createPattern(ledGridPattern(), 'repeat');
    if (this.grid) {
      ctx.fillStyle = this.grid;
      ctx.fillRect(0, 0, w, h);
    }
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
