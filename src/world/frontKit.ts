import * as THREE from 'three';
import { viewer, type ShopKind, type WorldBuilder } from './builder';
import type { FrontInterior, ShopAtlas } from './frontAtlas';
import { glowMat, Kit, vcMat } from './interiorKit';
import { lightPoolMaterial } from './streetTextures';
import { uvTo } from './themedKit';

/*
 * Storefronts on the Strip sidewalk, the frontage counterpart of the LINQ Promenade's kit
 * (linqPromenade.ts): one data row per real shop, built into a shared Kit so a whole block flushes to
 * a handful of meshes (one per material), with the signs, awnings and painted window interiors from
 * one ShopAtlas. Each front gets a collider, a map building, a zone, a warm light pool on the
 * sidewalk at night and, where it's a working shop, a walk-up spot that opens its catalog.
 *
 * Frame: side 'W' fronts face +x (toward the Boulevard) on the plane x = −xf; side 'E' fronts face −x
 * on x = +xf. Inside `k.at(...)` local +z points out to the street and local +x runs along the front.
 */

export type FrontStyle = 'brick' | 'stone' | 'modern' | 'stucco' | 'glass';

export interface FrontShop {
  id: string;
  side: 'E' | 'W';
  /** Extent along the Strip (z0 < z1). */
  z0: number;
  z1: number;
  /** |x| of the facade plane (default 19.7, the frontage line). */
  xf?: number;
  /** Depth into the lot and height. */
  d: number;
  h: number;
  wall: number;
  trim: number;
  /** Atlas region of the fascia sign ('' = none). */
  sign: string;
  signH?: number;
  /** Ground-floor height (where the sign band sits). */
  groundH?: number;
  win: FrontInterior;
  style?: FrontStyle;
  awning?: string;
  /** Patio depth out onto the sidewalk (tables, rail, string lights). */
  patio?: number;
  /** Projecting blade sign (atlas region, tall). */
  blade?: string;
  /** Second, higher sign (a roof-line name). */
  topSign?: string;
  topSignH?: number;
  shop?: { kind: ShopKind; catalog?: string; label: string; hint?: string };
  /** Map/zone label when it's not a shop. */
  label?: string;
  /** Skip the collider (something else already blocks this lot). */
  noCollider?: boolean;
  /** Pool colour on the sidewalk at night (default: trim mixed warm). */
  pool?: number;
  /** The fascia sign is a light cabinet (white background): it glows less at night. */
  softSign?: boolean;
  /** World z of the door (default: the middle pane). */
  doorAt?: number;
}

const M = () => vcMat(0.8);
const MET = () => vcMat(0.45, 0.5);

/** Atlas-mapped quad (facing local +z) into the kit. */
export function aq(k: Kit, A: ShopAtlas, m: THREE.Material, r: string, x: number, y: number, z: number, w: number, h: number, ry = 0, rx = 0, color = 0xffffff): void {
  const g = new THREE.PlaneGeometry(w, h);
  uvTo(g, A.rect(r), [A.W, A.H]);
  k.add(g, m, color, x, y, z, ry, rx);
}

/** Bulbs hung on a sagging line from a to c. */
export function stringLights(k: Kit, a: THREE.Vector3, c: THREE.Vector3, sag: number, spacing = 0.7, color = 0xffd9a0): void {
  const n = Math.max(2, Math.round(a.distanceTo(c) / spacing));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    k.add(new THREE.OctahedronGeometry(0.07, 0), glowMat(), color, a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t - Math.sin(t * Math.PI) * sag - 0.06, a.z + (c.z - a.z) * t);
  }
}

/** Bistro table with two chairs and an optional umbrella (local frame). */
export function patioTable(k: Kit, x: number, z: number, umb: number | null): void {
  const metal = MET();
  k.cyl(metal, 0x1a1a1c, x, 0.36, z, 0.04, 0.04, 0.72, 6);
  k.cyl(metal, 0x2a2a2e, x, 0.74, z, 0.42, 0.42, 0.04, 12);
  for (const s of [-1, 1]) {
    k.box(metal, 0x1a1a1c, x + s * 0.62, 0.45, z, 0.42, 0.05, 0.42);
    k.box(metal, 0x1a1a1c, x + s * 0.82, 0.75, z, 0.04, 0.6, 0.42);
  }
  if (umb !== null) {
    k.cyl(metal, 0xdddddd, x, 1.5, z, 0.03, 0.03, 1.6, 5);
    k.add(new THREE.ConeGeometry(1.25, 0.45, 8, 1, true), M(), umb, x, 2.45, z);
  }
}

/** The local frame of a front: origin on the facade plane at the middle of the shop. */
export function frontFrame(s: { side: 'E' | 'W'; z0: number; z1: number; xf?: number }): { x: number; z: number; ry: number; out: number } {
  const xf = s.xf ?? 19.7;
  const W = s.side === 'W';
  return { x: W ? -xf : xf, z: (s.z0 + s.z1) / 2, ry: W ? Math.PI / 2 : -Math.PI / 2, out: W ? 1 : -1 };
}

/** Sidewalk light pools, one merged mesh per area (additive, faded in at night by the street tick). */
export class Pools {
  private readonly k = new Kit();
  add(x: number, z: number, along: number, across: number, color: number): void {
    const g = new THREE.PlaneGeometry(across, along);
    g.rotateX(-Math.PI / 2);
    this.k.add(g, lightPoolMaterial(), color, x, 0.07, z);
  }
  flush(b: WorldBuilder): void {
    for (const m of this.k.flush(b.root)) {
      m.renderOrder = 1;
      m.userData.clutter = true;
    }
  }
}

/** One storefront on the Strip sidewalk. */
export function storefront(b: WorldBuilder, k: Kit, A: ShopAtlas, s: FrontShop, pools?: Pools): void {
  const f = frontFrame(s);
  const xf = s.xf ?? 19.7;
  const w = s.z1 - s.z0 - 0.08;
  const wall = M();
  const trimM = M();
  const dark = MET();
  const SM = A.signMat(b);
  const WM = A.winMat(b);
  const groundH = s.groundH ?? 4.3;
  const style = s.style ?? 'stucco';
  if (!s.noCollider) {
    if (s.side === 'W') b.collider(-xf - s.d, -xf, s.z0, s.z1, 0, s.h, true);
    else b.collider(xf, xf + s.d, s.z0, s.z1, 0, s.h, true);
  }
  k.at(f.x, 0, f.z, f.ry, () => {
    k.box(wall, s.wall, 0, s.h / 2, -s.d / 2, w, s.h, s.d);
    // ground floor: glass panes with the painted interior, a door in the middle
    const glassW = w - 0.9;
    const paneTarget = style === 'glass' ? 3.4 : 2.8;
    const panes = Math.max(1, Math.round(glassW / paneTarget));
    const pw = glassW / panes;
    const doorLocal = s.doorAt === undefined ? 0 : s.side === 'W' ? -(s.doorAt - f.z) : s.doorAt - f.z;
    const door = Math.max(0, Math.min(panes - 1, Math.floor((doorLocal + glassW / 2) / pw)));
    const glassTop = style === 'glass' ? groundH - 0.25 : Math.min(3.9, groundH - 0.3);
    for (let i = 0; i < panes; i++) {
      const px = -glassW / 2 + pw * (i + 0.5);
      if (i === door && style === 'glass') {
        // a glass door: the shop shows through, a frame and push bars
        aq(k, A, WM, `win:${s.win}`, px, glassTop / 2, 0.04, pw - 0.15, glassTop - 0.1, 0, 0, 0xc8c8c8);
        const dw = Math.min(1.9, pw - 0.3);
        for (const sd of [-1, 1]) k.box(dark, 0x2a2a30, px + (sd * dw) / 2, 1.3, 0.08, 0.07, 2.6, 0.07);
        k.box(dark, 0x2a2a30, px, 2.62, 0.08, dw, 0.07, 0.07);
        k.box(dark, 0x2a2a30, px, 0.03, 0.08, dw, 0.06, 0.07);
        for (const sd of [-1, 1]) k.box(dark, 0xd0d0d4, px + sd * 0.12, 1.15, 0.12, 0.03, 0.9, 0.03);
      } else if (i === door) {
        k.box(dark, 0x101014, px, 1.35, 0.02, Math.min(1.9, pw - 0.2), 2.7, 0.08);
        k.box(dark, 0xc8c8cc, px + 0.38, 1.2, 0.08, 0.04, 0.7, 0.04);
        aq(k, A, WM, `win:${s.win}`, px, 2.7 + (glassTop - 2.7) / 2 + 0.05, 0.04, pw - 0.15, glassTop - 2.8, 0, 0, 0xb0b0b0);
      } else {
        aq(k, A, WM, `win:${s.win}`, px, 0.55 + (glassTop - 0.55) / 2, 0.04, pw - 0.15, glassTop - 0.55);
        k.box(trimM, style === 'brick' || style === 'stone' ? 0x141418 : s.trim, px, 0.27, 0.08, pw - 0.1, 0.55, 0.16);
      }
      k.box(dark, style === 'glass' ? 0x9aa0a8 : 0x16161a, px - pw / 2, glassTop / 2, 0.06, 0.1, glassTop, 0.12);
    }
    k.box(dark, style === 'glass' ? 0x9aa0a8 : 0x16161a, glassW / 2, glassTop / 2, 0.06, 0.1, glassTop, 0.12);
    k.box(dark, 0x16161a, 0, glassTop + 0.05, 0.07, glassW, 0.1, 0.12);
    // pilasters
    if (style !== 'glass') for (const sd of [-1, 1]) k.box(trimM, s.trim, sd * (w / 2 - 0.25), s.h / 2, 0.08, 0.5, s.h, 0.3);
    else for (const sd of [-1, 1]) k.box(dark, 0x2a2a30, sd * (w / 2 - 0.12), s.h / 2, 0.06, 0.24, s.h, 0.2);
    // sign band + sign
    if (s.sign) {
      const r = A.rect(s.sign);
      const sh = s.signH ?? 1.0;
      const sw = Math.min(w - 1.0, (sh * r[2]) / r[3]);
      const sy = groundH + 0.25 + sh / 2;
      if (style !== 'glass') k.box(dark, style === 'modern' ? 0x0c0c0e : s.trim, 0, sy, 0.1, Math.min(w - 0.7, sw + 0.3), sh + 0.25, 0.22);
      aq(k, A, s.softSign ? A.softSignMat(b) : SM, s.sign, 0, sy, 0.22, sw, sh);
    }
    k.box(trimM, s.trim, 0, groundH, 0.18, w, 0.22, 0.4);
    // upper floors
    if (s.h > groundH + 2.6) {
      const yb = groundH + 0.6 + (s.signH ?? 1);
      if (style === 'glass') {
        // a full curtain wall above the shopfront, lit softly from inside
        const top = s.h - 0.6;
        if (top - yb > 1) {
          aq(k, A, WM, 'win:upper', 0, (yb + top) / 2, 0.03, w - 0.4, top - yb, 0, 0, 0x6a6a70);
          for (let x = -w / 2 + 2; x < w / 2 - 1; x += 2.2) k.box(dark, 0x9aa0a8, x, (yb + top) / 2, 0.06, 0.08, top - yb, 0.1);
        }
      } else {
        const rows = Math.max(1, Math.floor((s.h - yb - 0.6) / 2.6));
        const cols = Math.max(1, Math.floor((w - 1.2) / 2.3));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = -((cols - 1) * 2.3) / 2 + c * 2.3;
            const y = yb + 1.0 + r * 2.6;
            aq(k, A, WM, style === 'modern' ? `win:${s.win}` : 'win:upper', x, y, 0.03, 1.25, 1.75, 0, 0, style === 'modern' ? 0x8a8a8a : 0xffffff);
            if (style !== 'modern') {
              k.box(trimM, style === 'brick' ? 0xe8dcc0 : 0xf4efe6, x, y - 0.95, 0.07, 1.5, 0.12, 0.18);
              k.box(trimM, style === 'brick' ? 0xe8dcc0 : 0xf4efe6, x, y + 0.98, 0.06, 1.55, 0.18, 0.14);
            } else k.box(dark, 0x0c0c0e, x, y, 0.02, 1.45, 1.95, 0.04);
          }
        }
      }
    }
    // roof-line name
    if (s.topSign) {
      const r = A.rect(s.topSign);
      const th = s.topSignH ?? 1.4;
      const tw = Math.min(w - 0.6, (th * r[2]) / r[3]);
      aq(k, A, SM, s.topSign, 0, s.h - th / 2 - 0.55, 0.12, tw, th);
    }
    k.box(trimM, style === 'glass' ? 0xd8d8dc : s.trim, 0, s.h - 0.2, 0.1, w + 0.1, 0.4, 0.4);
    // awning: sloped striped canvas with a valance
    if (s.awning) {
      const aw = Math.min(w - 0.8, 9);
      const depth = 1.6;
      const slope = Math.atan2(0.7, depth);
      const len = Math.hypot(depth, 0.7);
      const ay = Math.min(3.95, groundH - 0.35);
      aq(k, A, A.litMat(), s.awning, 0, ay - 0.35, depth / 2 + 0.1, aw, len, 0, -Math.PI / 2 + slope);
      aq(k, A, A.litMat(), s.awning, 0, ay - 0.88, depth + 0.1, aw, 0.34);
      for (const sd of [-1, 1]) k.box(MET(), 0x111111, sd * (aw / 2), ay - 0.4, depth / 2 + 0.1, 0.04, 0.04, depth);
    }
    // projecting blade sign
    if (s.blade) {
      const r = A.rect(s.blade);
      const bh = Math.min(4.2, s.h - groundH - 0.6);
      const bw = (bh * r[2]) / r[3];
      const bx = w / 2 - 0.7;
      const bz = 0.2 + bw / 2;
      const by = groundH + 0.4 + bh / 2;
      k.box(dark, 0x111111, bx, by, bz, 0.2, bh + 0.2, bw + 0.2);
      aq(k, A, SM, s.blade, bx + 0.11, by, bz, bw, bh, Math.PI / 2);
      aq(k, A, SM, s.blade, bx - 0.11, by, bz, bw, bh, -Math.PI / 2);
    }
    // patio
    if (s.patio) {
      const pw2 = Math.min(w - 0.6, 12);
      const pz = s.patio;
      const rail = MET();
      k.box(rail, 0x141416, 0, 0.95, pz, pw2, 0.05, 0.05);
      for (let x = -pw2 / 2; x <= pw2 / 2 + 0.01; x += pw2 / Math.max(1, Math.round(pw2 / 1.6))) k.box(rail, 0x141416, x, 0.48, pz, 0.05, 0.96, 0.05);
      const tables = Math.max(1, Math.floor(pw2 / 2.6));
      for (let i = 0; i < tables; i++) patioTable(k, -pw2 / 2 + (pw2 / tables) * (i + 0.5), pz / 2 + 0.1, s.awning && pz < 2.5 ? null : [s.trim, 0xf4efe6][i % 2]);
      for (let i = 0; i <= 2; i++) {
        const x = -pw2 / 2 + (pw2 / 2) * i;
        stringLights(k, new THREE.Vector3(x * 0.8, groundH, 0.2), new THREE.Vector3(x, 2.1, pz), 0.35, 0.6);
      }
      for (const sd of [-1, 1]) k.cyl(rail, 0x141416, sd * (pw2 / 2), 1.1, pz, 0.04, 0.04, 2.2, 5);
    }
  });
  const sx = f.x + f.out * (s.patio ? s.patio + 1 : 1.3);
  const sz = s.doorAt ?? f.z;
  if (s.patio) {
    const pw2 = Math.min(w - 0.6, 12);
    const xr = f.x + f.out * s.patio;
    b.collider(xr - 0.15, xr + 0.15, f.z - pw2 / 2, f.z - 0.9, 0, 1.0, true);
    b.collider(xr - 0.15, xr + 0.15, f.z + 0.9, f.z + pw2 / 2, 0, 1.0, true);
  }
  if (s.shop) b.shopSpots.push({ kind: s.shop.kind, position: new THREE.Vector3(sx, 0, sz), radius: 2.6, label: s.shop.label, catalog: s.shop.catalog, hint: s.shop.hint });
  if (pools) {
    const c = new THREE.Color(s.pool ?? s.trim).lerp(new THREE.Color(0xffd29a), s.pool ? 0 : 0.55);
    pools.add(f.x + f.out * 2.4, f.z, w * 0.95, 4.6, c.getHex());
  }
  const label = s.shop?.label ?? s.label ?? s.id;
  const cxB = s.side === 'W' ? -xf - s.d / 2 : xf + s.d / 2;
  b.building(cxB, f.z, s.d, s.z1 - s.z0, `#${new THREE.Color(s.wall).getHexString()}`, s.shop?.label ?? s.label);
  b.zone(label, s.side === 'W' ? -xf - s.d : xf - (s.patio ?? 0) - 1.5, s.side === 'W' ? -xf + (s.patio ?? 0) + 1.5 : xf + s.d, s.z0, s.z1);
}

/** Flush a kit into the world: shadows from the dressing, the glow layers unshadowed. */
export function flushKit(b: WorldBuilder, k: Kit): THREE.Mesh[] {
  const out = k.flush(b.root);
  for (const m of out) {
    m.castShadow = m.material === M() || m.material === MET();
    m.receiveShadow = true;
  }
  return out;
}

/**
 * A block of storefronts flushed together (one mesh per material for the whole block) and kept out of
 * the static bake, shown only while the camera is within `range` of the block: a handful of draw calls
 * up close, none from the far end of the Strip where a shopfront is a few pixels.
 */
export class FrontCluster {
  readonly k = new Kit();
  readonly pools = new Pools();
  constructor(
    readonly x: number,
    readonly z: number,
    readonly range = 280
  ) {}
  flush(b: WorldBuilder): void {
    const meshes = flushKit(b, this.k);
    const before = b.root.children.length;
    this.pools.flush(b);
    meshes.push(...(b.root.children.slice(before) as THREE.Mesh[]));
    for (const m of meshes) m.userData.dynamic = true;
    const r2 = this.range * this.range;
    let shown = true;
    b.every(() => {
      const dx = viewer.cam.x - this.x;
      const dz = viewer.cam.z - this.z;
      const on = dx * dx + dz * dz < r2;
      if (on === shown) return;
      shown = on;
      for (const m of meshes) m.visible = on;
    });
  }
}
