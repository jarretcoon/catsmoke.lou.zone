import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { GUEST_SHIRTS, Kit, additiveMat, glassMat, glowMat, vcMat, type GateBox, type PeopleLists } from './interiorKit';
import { canvasTex, fitText, mapGlow, mapLit, prng, uvScale, uvTo, type Px } from './themedKit';

/*
 * Shared pieces for the build-5 walk-ins (Wynn, Encore, Harrah's, Palazzo, Treasure Island, Mandalay
 * Bay): a hall shell for lobbies and atriums that connect to a casino floor, a sign sheet (one canvas
 * per property for every storefront, bar and wayfinding sign), floors with tiled canvas patterns,
 * flowers and planting, bars with stools and back bars, and boutique storefronts. Everything that is
 * dressing goes into a lazily built, door-gated group (themedKit's lazyInterior), so none of it costs
 * a draw call from the street.
 */

export type Side = 'north' | 'south' | 'east' | 'west';
export interface Door {
  side: Side;
  at: number;
  width: number;
  /** Door height (lintel), default 4.6. */
  h?: number;
}

export interface HallSpec {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
  wall: THREE.Material;
  doors: Door[];
  /** Sides with no wall at all (the hall opens straight into a neighbour). */
  open?: Side[];
  roof?: THREE.Material;
  /** Wall thickness (default 1.2). */
  t?: number;
  /** Leave the roof off (the caller builds its own, e.g. round a skylight). */
  noRoof?: boolean;
}

/** Walls (with door gaps and lintels), the roof slab and the colliders for a lobby / atrium / arcade box. */
export function hallShell(b: WorldBuilder, s: HallSpec): GateBox {
  const t = s.t ?? 1.2;
  const sides: Side[] = ['north', 'south', 'east', 'west'];
  for (const side of sides) {
    if (s.open?.includes(side)) continue;
    const alongZ = side === 'east' || side === 'west';
    const lo = alongZ ? s.z0 : s.x0;
    const hi = alongZ ? s.z1 : s.x1;
    const fixed = side === 'east' ? s.x1 : side === 'west' ? s.x0 : side === 'north' ? s.z0 : s.z1;
    const ds = s.doors.filter((d) => d.side === side).sort((a, c) => a.at - c.at);
    let cur = lo;
    const seg = (a: number, c: number, y0: number, y1: number) => {
      if (c - a < 0.05) return;
      if (alongZ) b.box(fixed, y0, (a + c) / 2, t, y1 - y0, c - a, s.wall, true, true);
      else b.box((a + c) / 2, y0, fixed, c - a, y1 - y0, t, s.wall, true, true);
    };
    for (const d of ds) {
      const g0 = d.at - d.width / 2;
      const g1 = d.at + d.width / 2;
      seg(cur, g0, 0, s.h);
      seg(g0, g1, d.h ?? 4.6, s.h);
      cur = g1;
    }
    seg(cur, hi, 0, s.h);
  }
  if (!s.noRoof) b.box((s.x0 + s.x1) / 2, s.h, (s.z0 + s.z1) / 2, s.x1 - s.x0 + t, 0.6, s.z1 - s.z0 + t, s.roof ?? s.wall, false, true);
  return gateOf(s.x0, s.x1, s.z0, s.z1, s.h, [...s.doors, ...(s.open ?? []).map((side) => ({ side, at: side === 'east' || side === 'west' ? (s.z0 + s.z1) / 2 : (s.x0 + s.x1) / 2, width: side === 'east' || side === 'west' ? s.z1 - s.z0 : s.x1 - s.x0 }))]);
}

/** A gate box for a rectangle with doors on its sides. */
export function gateOf(x0: number, x1: number, z0: number, z1: number, h: number, doors: Array<{ side: Side; at: number; width: number }>): GateBox {
  return {
    minX: x0,
    maxX: x1,
    minZ: z0,
    maxZ: z1,
    height: h,
    doors: doors.map((e) =>
      e.side === 'east'
        ? { x: x1, z: e.at, nx: 1, nz: 0, half: e.width / 2 }
        : e.side === 'west'
          ? { x: x0, z: e.at, nx: -1, nz: 0, half: e.width / 2 }
          : e.side === 'north'
            ? { x: e.at, z: z0, nx: 0, nz: -1, half: e.width / 2 }
            : { x: e.at, z: z1, nx: 0, nz: 1, half: e.width / 2 }
    ),
  };
}

const dblCache = new Map<string, THREE.MeshStandardMaterial>();
/** Vertex-coloured, double-sided (parasols, fabric, open shades seen from below). */
export function vcDouble(rough = 0.7, metal = 0): THREE.MeshStandardMaterial {
  const key = `${rough}|${metal}`;
  let m = dblCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, side: THREE.DoubleSide });
    dblCache.set(key, m);
  }
  return m;
}

let _glowDbl: THREE.MeshBasicMaterial | null = null;
/** Unlit vertex-coloured, double-sided (skylight vaults, lamp shades seen from inside). */
export function glowDouble(): THREE.MeshBasicMaterial {
  return (_glowDbl ??= new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

/**
 * A barrel vault along z (springing at y0, crown y0 + r): a skylight glow surface and a lattice of
 * ribs (arcs every `step` m and longitudinal ribs), like the Wynn/Encore Esplanade ceilings.
 */
export function latticeVault(k: Kit, x: number, z0: number, z1: number, y0: number, r: number, sky: number, rib: number, step = 0.9): void {
  const L = z1 - z0;
  const zc = (z0 + z1) / 2;
  const g = new THREE.CylinderGeometry(r, r, L, 20, 1, true, Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  k.add(g, glowDouble(), sky, x, y0, zc);
  for (let z = z0 + step / 2; z < z1; z += step) {
    const a = new THREE.TorusGeometry(r - 0.03, 0.035, 4, 18, Math.PI);
    k.add(a, vcMat(0.6, 0.1), rib, x, y0, z);
  }
  for (let i = 1; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    k.box(vcMat(0.6, 0.1), rib, x + Math.cos(a) * (r - 0.04), y0 + Math.sin(a) * (r - 0.04), zc, 0.05, 0.05, L, 0, 0, a);
  }
}

/** An open parasol hanging upside-up: canopy cone, ribs, pole and finial (Parasol Up / Down). */
export function parasol(k: Kit, x: number, y: number, z: number, r: number, color: number, tilt = 0, ry = 0): void {
  k.at(x, y, z, ry, () => {
    const c = new THREE.ConeGeometry(r, r * 0.38, 12, 1, true);
    c.rotateZ(tilt);
    k.add(c, vcDouble(0.8), color, 0, 0, 0);
    // scalloped trim ring
    const ring = new THREE.TorusGeometry(r * 0.99, 0.03, 4, 24);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, -r * 0.19, 0);
    ring.rotateZ(tilt);
    k.add(ring, vcMat(0.6), 0xf4ead8, 0, 0, 0);
    const pole = new THREE.CylinderGeometry(0.025, 0.025, r * 1.1, 5);
    pole.translate(0, -r * 0.4, 0);
    pole.rotateZ(tilt);
    k.add(pole, vcMat(0.4, 0.6), 0xd8c8a0, 0, 0, 0);
  });
}

// ---------------------------------------------------------------- sign sheet
/**
 * One canvas for every sign in a property: `add` reserves a rect and remembers how to paint it; the
 * texture is painted once on first use. Shelf-packed, rows as tall as their tallest sign.
 */
export class SignSheet {
  private x = 0;
  private y = 0;
  private row = 0;
  private readonly jobs: Array<[Px, (ctx: CanvasRenderingContext2D, w: number, h: number) => void]> = [];
  private tex: THREE.CanvasTexture | null = null;
  constructor(readonly size: [number, number] = [1024, 1024]) {}
  add(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Px {
    if (this.x + w > this.size[0]) {
      this.x = 0;
      this.y += this.row + 2;
      this.row = 0;
    }
    const r: Px = [this.x, this.y, w, h];
    this.x += w + 2;
    this.row = Math.max(this.row, h);
    if (this.y + h > this.size[1]) console.warn('SignSheet overflow');
    this.jobs.push([r, draw]);
    return r;
  }
  /** A plain text sign: background, border and fitted text (optionally a second, smaller line). */
  text(w: number, h: number, s: string, fg: string, bg: string, family = 'Georgia, "Times New Roman", serif', sub?: string, border?: string): Px {
    return this.add(w, h, (ctx, pw, ph) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, pw, ph);
      if (border) {
        ctx.strokeStyle = border;
        ctx.lineWidth = Math.max(2, ph * 0.05);
        ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, pw - ctx.lineWidth * 2, ph - ctx.lineWidth * 2);
      }
      ctx.fillStyle = fg;
      if (sub) {
        fitText(ctx, s, pw / 2, ph * 0.4, ph * 0.5, pw * 0.88, family, 'bold');
        fitText(ctx, sub, pw / 2, ph * 0.78, ph * 0.2, pw * 0.88, family, 'normal');
      } else fitText(ctx, s, pw / 2, ph / 2, ph * 0.62, pw * 0.88, family, 'bold');
    });
  }
  texture(): THREE.CanvasTexture {
    if (this.tex) return this.tex;
    this.tex = canvasTex(this.size[0], this.size[1], (ctx) => {
      for (const [r, draw] of this.jobs) {
        ctx.save();
        ctx.translate(r[0], r[1]);
        ctx.beginPath();
        ctx.rect(0, 0, r[2], r[3]);
        ctx.clip();
        draw(ctx, r[2], r[3]);
        ctx.restore();
      }
    });
    return this.tex;
  }
  glow(): THREE.MeshBasicMaterial {
    return mapGlow(this.texture());
  }
  lit(rough = 0.7): THREE.MeshStandardMaterial {
    return mapLit(this.texture(), rough);
  }
  /** A quad facing +z (local), mapped to `r`. */
  quad(k: Kit, r: Px, x: number, y: number, z: number, w: number, h: number, ry = 0, tint = 0xffffff, lit = false): void {
    const g = new THREE.PlaneGeometry(w, h);
    uvTo(g, r, this.size);
    k.add(g, lit ? this.lit() : this.glow(), tint, x, y, z, ry);
  }
}

// ---------------------------------------------------------------- floors
/** A floor rectangle with a tiling canvas texture (repeats every `tile` metres). */
export function floorRect(k: Kit, m: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, tile: number, tint = 0xffffff): void {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  uvScale(g, (x1 - x0) / tile, (z1 - z0) / tile);
  k.add(g, m, tint, (x0 + x1) / 2, y, (z0 + z1) / 2);
}
/** A ceiling rectangle (facing down) with a tiling canvas texture. */
export function ceilRect(k: Kit, m: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, tile: number, tint = 0xffffff): void {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(Math.PI / 2);
  uvScale(g, (x1 - x0) / tile, (z1 - z0) / tile);
  k.add(g, m, tint, (x0 + x1) / 2, y, (z0 + z1) / 2);
}

/** Marble: a pale stone with soft veins, seamless. */
export function paintMarble(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, vein: string, seed: number, veins = 14): void {
  const rnd = prng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)';
    ctx.fillRect(rnd() * w, rnd() * h, 3, 3);
  }
  ctx.strokeStyle = vein;
  ctx.lineCap = 'round';
  for (let i = 0; i < veins; i++) {
    let x = rnd() * w;
    let y = rnd() * h;
    ctx.globalAlpha = 0.1 + rnd() * 0.25;
    ctx.lineWidth = 0.6 + rnd() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const a = rnd() * Math.PI * 2;
    for (let s = 0; s < 14; s++) {
      x += Math.cos(a + (rnd() - 0.5) * 1.4) * w * 0.05;
      y += Math.sin(a + (rnd() - 0.5) * 1.4) * h * 0.05;
      ctx.lineTo(((x % w) + w) % w, ((y % h) + h) % h);
      if (x < 0 || x > w || y < 0 || y > h) {
        x = ((x % w) + w) % w;
        y = ((y % h) + h) % h;
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A five-petal flower (mosaic-style: tesserae dots inside the petals). */
export function paintFlower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, petal: string, centre: string, rot = 0, petals = 5, edge?: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  for (let i = 0; i < petals; i++) {
    ctx.rotate((Math.PI * 2) / petals);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 0.34, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = petal;
    ctx.fill();
    if (edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = centre;
  ctx.fill();
  ctx.restore();
}

/** A butterfly (Encore's motif): swept upper wings, rounded lower wings, eye spots, body and antennae. */
export function paintButterfly(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, wing: string, edge: string, rot = 0, lower?: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.strokeStyle = edge;
  for (const s of [-1, 1]) {
    // upper wing
    ctx.beginPath();
    ctx.moveTo(0, -0.05 * r);
    ctx.bezierCurveTo(s * 0.3 * r, -0.85 * r, s * 1.05 * r, -1.0 * r, s * 1.0 * r, -0.42 * r);
    ctx.bezierCurveTo(s * 0.95 * r, -0.08 * r, s * 0.45 * r, 0.04 * r, 0, 0.04 * r);
    ctx.fillStyle = wing;
    ctx.fill();
    ctx.stroke();
    // lower wing
    ctx.beginPath();
    ctx.moveTo(0, 0.04 * r);
    ctx.bezierCurveTo(s * 0.62 * r, 0.02 * r, s * 0.82 * r, 0.55 * r, s * 0.45 * r, 0.75 * r);
    ctx.bezierCurveTo(s * 0.25 * r, 0.86 * r, s * 0.06 * r, 0.5 * r, 0, 0.16 * r);
    ctx.fillStyle = lower ?? wing;
    ctx.fill();
    ctx.stroke();
    // veins
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s * 0.8 * r, -0.62 * r);
    ctx.moveTo(0, 0);
    ctx.lineTo(s * 0.85 * r, -0.25 * r);
    ctx.moveTo(0, 0.08 * r);
    ctx.lineTo(s * 0.5 * r, 0.55 * r);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // eye spot + margin dots
    ctx.fillStyle = '#fff4dc';
    ctx.beginPath();
    ctx.arc(s * 0.62 * r, -0.5 * r, 0.13 * r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.arc(s * 0.62 * r, -0.5 * r, 0.06 * r, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(s * (0.92 - i * 0.04) * r, (-0.72 + i * 0.2) * r, 0.045 * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.ellipse(0, 0.12 * r, r * 0.06, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -0.25 * r);
  ctx.quadraticCurveTo(-0.12 * r, -0.55 * r, -0.25 * r, -0.62 * r);
  ctx.moveTo(0, -0.25 * r);
  ctx.quadraticCurveTo(0.12 * r, -0.55 * r, 0.25 * r, -0.62 * r);
  ctx.stroke();
  ctx.restore();
}

/** Draw `fn` at (x, y) and its wrapped copies so a tile stays seamless. */
export function wrapDraw(w: number, h: number, x: number, y: number, r: number, fn: (x: number, y: number) => void): void {
  for (const ox of [-w, 0, w])
    for (const oy of [-h, 0, h]) {
      const px = x + ox;
      const py = y + oy;
      if (px + r < 0 || px - r > w || py + r < 0 || py - r > h) continue;
      fn(px, py);
    }
}

/** Wool pile noise over a carpet tile. */
export function pile(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, n = 9000): void {
  const rnd = prng(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
  }
}

// ---------------------------------------------------------------- planting
const FLOWER_TEX = new Map<string, THREE.CanvasTexture>();
/** A dense flower-bed texture: blossoms of the given colours over dark leaves. */
export function flowerTex(colors: string[], leaf = '#2a5a2a', seed = 3): THREE.CanvasTexture {
  const key = colors.join(',') + leaf + seed;
  let t = FLOWER_TEX.get(key);
  if (!t) {
    t = canvasTex(
      256,
      256,
      (ctx, w, h) => {
        const rnd = prng(seed);
        ctx.fillStyle = leaf;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 260; i++) {
          ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(120,180,90,0.2)';
          const x = rnd() * w;
          const y = rnd() * h;
          wrapDraw(w, h, x, y, 8, (px, py) => {
            ctx.beginPath();
            ctx.ellipse(px, py, 7, 3.5, rnd() * 3, 0, Math.PI * 2);
            ctx.fill();
          });
        }
        for (let i = 0; i < 150; i++) {
          const c = colors[Math.floor(rnd() * colors.length)];
          const x = rnd() * w;
          const y = rnd() * h;
          const r = 6 + rnd() * 7;
          wrapDraw(w, h, x, y, r, (px, py) => paintFlower(ctx, px, py, r, c, '#f8e070', rnd() * 3, 5 + Math.floor(rnd() * 2)));
        }
      },
      true
    );
    FLOWER_TEX.set(key, t);
  }
  return t;
}

/** A flower sphere (Wynn's hanging balls, topiary heads): a textured sphere plus a ring of blossoms. */
export function flowerBall(k: Kit, x: number, y: number, z: number, r: number, tex: THREE.CanvasTexture): void {
  const g = new THREE.SphereGeometry(r, 14, 10);
  uvScale(g, Math.max(1, Math.round(r * 2)), Math.max(1, Math.round(r)));
  k.add(g, mapLit(tex, 0.85), 0xffffff, x, y, z);
}

/** A planter box (stone rim) packed with flowers. */
export function flowerBed(k: Kit, x: number, z: number, w: number, d: number, tex: THREE.CanvasTexture, rim = 0xe8dcc4, hRim = 0.55): void {
  k.box(vcMat(0.7), rim, x, hRim / 2, z, w, hRim, d);
  k.box(vcMat(0.6), rim, x, hRim + 0.03, z, w + 0.1, 0.06, d + 0.1);
  const g = new THREE.BoxGeometry(w - 0.16, 0.4, d - 0.16);
  uvScale(g, Math.max(1, w / 1.2), Math.max(1, d / 1.2));
  k.add(g, mapLit(tex, 0.85), 0xffffff, x, hRim + 0.12, z);
  // a few mounded heads so it isn't a flat slab
  const rnd = prng(Math.round(x * 13 + z * 7));
  const n = Math.max(2, Math.round((w * d) / 1.2));
  for (let i = 0; i < n; i++) {
    const sx = x + (rnd() - 0.5) * (w - 0.5);
    const sz = z + (rnd() - 0.5) * (d - 0.5);
    const rr = 0.22 + rnd() * 0.18;
    const s = new THREE.SphereGeometry(rr, 8, 6);
    s.scale(1, 0.7, 1);
    k.add(s, mapLit(tex, 0.85), 0xffffff, sx, hRim + 0.3, sz);
  }
}

/** Potted ficus-style tree: urn, trunk, a cluster of leafy balls. */
export function pottedTree(k: Kit, x: number, z: number, h: number, urn = 0xd8c8a8, leaf = 0x2e6a32): void {
  k.cyl(vcMat(0.6, 0.1), urn, x, 0.45, z, 0.55, 0.4, 0.9, 14);
  k.cyl(vcMat(0.5, 0.3), urn, x, 0.92, z, 0.62, 0.62, 0.08, 14);
  k.cyl(vcMat(0.9), 0x5a4030, x, 0.9 + h * 0.3, z, 0.06, 0.09, h * 0.6, 6);
  const rnd = prng(Math.round(x * 17 + z * 3));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const rr = 0.5 + rnd() * 0.25;
    k.add(new THREE.IcosahedronGeometry(rr, 1), vcMat(0.85), i % 2 ? leaf : 0x3a7a3a, x + Math.cos(a) * 0.5, 0.9 + h * 0.6 + rnd() * 0.6, z + Math.sin(a) * 0.5);
  }
  k.add(new THREE.IcosahedronGeometry(0.7, 1), vcMat(0.85), leaf, x, 0.9 + h * 0.85, z);
}

/** A palm in a pot (for tropical rooms): trunk + drooping fronds. */
export function pottedPalm(k: Kit, x: number, z: number, h: number, pot = 0x8a6a4a): void {
  k.cyl(vcMat(0.7), pot, x, 0.4, z, 0.5, 0.38, 0.8, 12);
  const trunk = 0x8a6a48;
  for (let i = 0; i < 6; i++) k.cyl(vcMat(0.9), i % 2 ? trunk : 0x7a5a3a, x, 0.8 + (i + 0.5) * (h / 6), z, 0.11, 0.13, h / 6, 7);
  const top = 0.8 + h;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const g = new THREE.PlaneGeometry(0.45, 2.2);
    g.translate(0, 1.1, 0);
    g.rotateX(-1.15 - (i % 3) * 0.12);
    g.rotateY(a);
    k.add(g, vcMat(0.8), i % 2 ? 0x2f7a34 : 0x3a8a3a, x, top, z);
  }
}

// ---------------------------------------------------------------- bars and shops
/**
 * A free-standing island bar (round or rectangular), bartenders inside, stools and seated guests all
 * round. Returns the stool ring radius so the caller can put the shop spot just outside it.
 */
export function islandBar(k: Kit, x: number, z: number, w: number, d: number, look: { top: number; front: number; trim: number; stool: number; glow: number; bartender: [number, number] }, ppl: PeopleLists, seed: number, round = false): void {
  const rnd = prng(seed);
  if (round) {
    const r = w / 2;
    const ring = (rr: number, h: number, y: number, c: number, m: THREE.Material) => {
      const g = new THREE.CylinderGeometry(rr, rr, h, 28, 1, true);
      k.add(g, m, c, x, y, z);
    };
    ring(r, 1.05, 0.525, look.front, vcMat(0.5));
    ring(r - 0.05, 1.05, 0.525, look.front, vcMat(0.5));
    const top = new THREE.RingGeometry(r - 0.55, r + 0.2, 28);
    top.rotateX(-Math.PI / 2);
    k.add(top, vcMat(0.2, 0.3), look.top, x, 1.1, z);
    const glow = new THREE.TorusGeometry(r + 0.02, 0.025, 4, 28);
    glow.rotateX(Math.PI / 2);
    k.add(glow, glowMat(), look.glow, x, 0.08, z);
    // back-bar tower in the middle
    k.cyl(vcMat(0.4, 0.4), look.trim, x, 1.3, z, 0.7, 0.8, 2.6, 16);
    for (const y of [1.3, 1.75, 2.2]) {
      const gg = new THREE.TorusGeometry(0.78, 0.02, 4, 18);
      gg.rotateX(Math.PI / 2);
      k.add(gg, glowMat(), look.glow, x, y, z);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const c = [0x3aa85a, 0xc8783a, 0xe8d8a8, 0x6ab8e8, 0xc8203a, 0xf2c23a, 0x8a5a2a][Math.floor(rnd() * 7)];
        k.cyl(glowMat(), c, x + Math.cos(a) * 0.86, y + 0.16, z + Math.sin(a) * 0.86, 0.025, 0.04, 0.3, 5);
      }
    }
    const n = Math.floor((Math.PI * 2 * (r + 0.6)) / 0.85);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sx = x + Math.cos(a) * (r + 0.55);
      const sz = z + Math.sin(a) * (r + 0.55);
      k.cyl(vcMat(0.3, 0.8), 0xb8a070, sx, 0.4, sz, 0.035, 0.05, 0.8, 6);
      k.cyl(vcMat(0.6), look.stool, sx, 0.82, sz, 0.22, 0.2, 0.1, 10);
      if (rnd() < 0.45) ppl.seated.push({ x: sx, y: 0.15, z: sz, rot: Math.atan2(x - sx, z - sz), shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
    }
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + 0.6;
      ppl.standing.push({ x: x + Math.cos(a) * (r - 0.35), z: z + Math.sin(a) * (r - 0.35), rot: Math.atan2(Math.cos(a), Math.sin(a)), shirt: look.bartender[0], vest: look.bartender[1] });
    }
    return;
  }
  // rectangular: counter ring (open middle) with a back-bar island
  const t = 0.6;
  for (const [cx, cz, cw, cd] of [
    [x, z - d / 2 + t / 2, w, t],
    [x, z + d / 2 - t / 2, w, t],
    [x - w / 2 + t / 2, z, t, d - t * 2],
    [x + w / 2 - t / 2, z, t, d - t * 2],
  ]) {
    k.box(vcMat(0.5), look.front, cx, 0.53, cz, cw, 1.05, cd);
    k.box(vcMat(0.2, 0.3), look.top, cx, 1.1, cz, cw + 0.2, 0.06, cd + 0.2);
  }
  k.box(vcMat(0.4, 0.4), look.trim, x, 1.2, z, Math.max(0.6, w - 2.6), 2.4, Math.max(0.5, d - 2.6));
  for (const y of [1.3, 1.8]) {
    for (let i = 0; i < Math.floor((w - 2.6) / 0.18); i++) {
      const bx = x - (w - 2.6) / 2 + 0.1 + i * 0.18;
      const c = [0x3aa85a, 0xc8783a, 0xe8d8a8, 0x6ab8e8, 0xc8203a, 0xf2c23a][Math.floor(rnd() * 6)];
      for (const s of [-1, 1]) k.cyl(glowMat(), c, bx, y + 0.15, z + s * ((d - 2.6) / 2 + 0.05), 0.025, 0.04, 0.3, 5);
    }
    k.box(glowMat(), look.glow, x, y, z, w - 2.5, 0.02, d - 2.5);
  }
  for (let sx = x - w / 2 + 0.6; sx < x + w / 2 - 0.3; sx += 0.85) {
    for (const s of [-1, 1]) {
      const sz = z + s * (d / 2 + 0.5);
      k.cyl(vcMat(0.3, 0.8), 0xb8a070, sx, 0.4, sz, 0.035, 0.05, 0.8, 6);
      k.cyl(vcMat(0.6), look.stool, sx, 0.82, sz, 0.22, 0.2, 0.1, 10);
      if (rnd() < 0.45) ppl.seated.push({ x: sx, y: 0.15, z: sz, rot: s > 0 ? Math.PI : 0, shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
    }
  }
  ppl.standing.push({ x: x - w / 4, z: z - d / 2 + 1.0, rot: Math.PI, shirt: look.bartender[0], vest: look.bartender[1] });
  ppl.standing.push({ x: x + w / 4, z: z + d / 2 - 1.0, rot: 0, shirt: look.bartender[0], vest: look.bartender[1] });
}

/**
 * A storefront against a wall (local frame: wall at z = 0, mall side toward +z): pilasters, a lit
 * display window either side of the door, the name sign over the door, a glow strip at the floor.
 */
export function storefront(k: Kit, sheet: SignSheet, sign: Px, x: number, z: number, rot: number, w: number, h: number, frame: number, glass = 0xfff0d8, sales?: number): void {
  k.at(x, 0, z, rot, () => {
    k.box(vcMat(0.6, 0.2), frame, 0, h / 2, 0.05, w, h, 0.1);
    for (const s of [-1, 1]) k.box(vcMat(0.4, 0.5), frame, s * (w / 2 - 0.15), h / 2, 0.2, 0.3, h, 0.3);
    // lit interior seen through the glass: a warm panel set back, the glass in front
    const winW = (w - 2.4) / 2;
    for (const s of [-1, 1]) {
      const cx = s * (1.2 + winW / 2);
      k.box(glowMat(), glass, cx, 1.55, 0.12, winW, 2.3, 0.02);
      k.box(glassMat(), 0xffffff, cx, 1.55, 0.3, winW, 2.4, 0.02);
      // mannequin / display plinths
      for (let i = 0; i < 2; i++) {
        const px = cx - winW / 4 + (i * winW) / 2;
        k.box(vcMat(0.5), 0xf4f0e8, px, 0.25, 0.22, 0.4, 0.5, 0.18);
        k.cyl(vcMat(0.6), sales ?? 0x1a1a1a, px, 1.05, 0.22, 0.14, 0.2, 0.9, 8);
        k.add(new THREE.SphereGeometry(0.12, 8, 6), vcMat(0.6), 0xe8e0d8, px, 1.62, 0.22);
      }
    }
    // the open doorway: a darker lit interior
    k.box(glowMat(), 0xb8a890, 0, 1.4, 0.11, 2.2, 2.8, 0.02);
    k.box(vcMat(0.4, 0.5), frame, 0, 3.0, 0.25, 2.6, 0.3, 0.3);
    sheet.quad(k, sign, 0, h - 0.9, 0.27, Math.min(w - 0.8, 5.2), 0.8);
    k.box(glowMat(), 0xffe8c0, 0, 0.04, 0.42, w - 0.4, 0.04, 0.04);
  });
}

/** A hanging cable from (x, y0, z) up to the ceiling at cy. */
export function cable(k: Kit, x: number, y: number, z: number, cy: number, color = 0x8a7a5a): void {
  if (cy - y < 0.05) return;
  k.cyl(vcMat(0.4, 0.8), color, x, (y + cy) / 2, z, 0.012, 0.012, cy - y, 4);
}

/** A soft light pool on the floor under a fixture. */
export function lightPool(k: Kit, x: number, z: number, r: number, color: number, y = 0.06): void {
  const g = new THREE.CircleGeometry(r, 20);
  g.rotateX(-Math.PI / 2);
  k.add(g, additiveMat(), color, x, y, z);
}

/** A glowing open-drum pendant (gold lantern chandelier): ribs, glow drum, crystal skirt. */
export function drumPendant(k: Kit, x: number, y: number, z: number, r: number, h: number, glow: number, rib: number, cy: number): void {
  cable(k, x, y + h / 2, z, cy, rib);
  const drum = new THREE.CylinderGeometry(r, r, h, 20, 1, true);
  k.add(drum, glowMat(), glow, x, y, z);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    k.box(vcMat(0.3, 0.85), rib, x + Math.cos(a) * (r + 0.02), y, z + Math.sin(a) * (r + 0.02), 0.04, h + 0.1, 0.04, -a);
  }
  for (const yy of [y - h / 2, y + h / 2]) {
    const ring = new THREE.TorusGeometry(r + 0.03, 0.035, 4, 20);
    ring.rotateX(Math.PI / 2);
    k.add(ring, vcMat(0.3, 0.85), rib, x, yy, z);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    k.cyl(glowMat(), 0xfff4dc, x + Math.cos(a) * r * 0.8, y - h / 2 - 0.2, z + Math.sin(a) * r * 0.8, 0.015, 0.03, 0.35, 4);
  }
}

/** Velvet-lined table lamp glow (bars, lounges): a little pool of light on a table top. */
export function tableLamp(k: Kit, x: number, y: number, z: number, shade: number): void {
  k.cyl(vcMat(0.3, 0.8), 0xc8a050, x, y + 0.15, z, 0.02, 0.05, 0.3, 6);
  k.cyl(glowMat(), shade, x, y + 0.38, z, 0.08, 0.14, 0.18, 10);
}

// ---------------------------------------------------------------- outside walls
const facadeCache = new Map<string, THREE.MeshStandardMaterial>();
/**
 * A tiling outside-wall bay (one bay per `bay` metres): stucco, pilasters, an arched window of lit
 * shop glass with a sill and keystone; only the glass glows after dark. For the sides of the walk-in
 * podiums that the street front code doesn't dress.
 */
export function archFacade(b: WorldBuilder, wall: string, trim: string, glass: string, glow: string): THREE.MeshStandardMaterial {
  const key = wall + trim + glass + glow;
  let m = facadeCache.get(key);
  if (m) return m;
  const arch = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const x0 = w * 0.24;
    const x1 = w * 0.76;
    const yTop = h * 0.22;
    const yBot = h * 0.9;
    ctx.beginPath();
    ctx.moveTo(x0, yBot);
    ctx.lineTo(x0, yTop + (x1 - x0) / 2);
    ctx.arc((x0 + x1) / 2, yTop + (x1 - x0) / 2, (x1 - x0) / 2, Math.PI, 0);
    ctx.lineTo(x1, yBot);
    ctx.closePath();
  };
  const map = canvasTex(
    256,
    320,
    (ctx, w, h) => {
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = trim;
      ctx.fillRect(0, 0, w * 0.08, h);
      ctx.fillRect(w * 0.92, 0, w * 0.08, h);
      ctx.fillRect(0, h * 0.95, w, h * 0.05);
      arch(ctx, w, h);
      const g = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.9);
      g.addColorStop(0, glass);
      g.addColorStop(1, '#3a2a1a');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = trim;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.24);
      ctx.lineTo(w / 2, h * 0.9);
      ctx.moveTo(w * 0.24, h * 0.52);
      ctx.lineTo(w * 0.76, h * 0.52);
      ctx.stroke();
      ctx.fillStyle = trim;
      ctx.fillRect(w * 0.2, h * 0.9, w * 0.6, h * 0.03);
      ctx.fillRect(w * 0.46, h * 0.16, w * 0.08, h * 0.07);
    },
    true
  );
  const emis = canvasTex(
    256,
    320,
    (ctx, w, h) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      arch(ctx, w, h);
      ctx.fillStyle = glow;
      ctx.fill();
    },
    true
  );
  m = b.nightGlow(new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: emis, emissiveIntensity: 0.05, roughness: 0.75 }), 0.05, 0.75);
  facadeCache.set(key, m);
  return m;
}

/** Lay an archFacade plane on an outside wall face (centre x/z, `len` long, facing `ry`), bays every `bay` m. */
export function facadePlane(b: WorldBuilder, m: THREE.Material, x: number, z: number, len: number, ry: number, y0 = 0.4, h = 5.6, bay = 4.5): void {
  if (len < 0.5) return;
  const g = new THREE.PlaneGeometry(len, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / bay);
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y0 + h / 2, z);
  me.rotation.y = ry;
  me.receiveShadow = true;
  b.add(me);
}
