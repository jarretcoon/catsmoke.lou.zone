import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { GUEST_SHIRTS, Kit, additiveMat, buildPeople, gateOpen, glassMat, glowMat, vcMat, type GateBox, type Person } from './interiorKit';
import { viewer } from './builder';
import { gatedDoors } from './grandInteriors';
import { ArtCanvas } from './cosmoArt';

/**
 * The Cosmopolitan's casino, finished: the Chandelier as a three-storey curtain of crystal strands
 * (additive bead strips, one draw) round the circular bar, with velvet lounge chairs, cocktail tables
 * and bartenders on the casino level and on level 1.5; eight digital-art LED columns in the foyer;
 * the Marquee nightclub entrance (black glass, pulsing light, velvet rope, bouncer and a line);
 * "Secret Pizza" — an unmarked hallway lined with record sleeves to a tiny pizza counter with a
 * pinball machine; and the VIP lounge's sofas, gold mirrors and humidor.
 *
 * Everything here is one gated group, drawn only while the camera is inside the casino or looking
 * in through the Strip doors. Casino floor: x −62…−24, z 160…204, ceiling at y 10.4.
 */

const CX = -40;
const CZ = 182;
const CEIL = 10.4;
const PLUM = 0x4a1238;
const VELVET = 0x6a1a5a;
const BRASS = 0xc89a5a;
const BLACK_GLASS = 0x0a0910;
const PINK = 0xff4fc8;
const VIOLET = 0xb46bff;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
function tex(c: HTMLCanvasElement, wrap = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One bead-chain tile (4 crystal beads) for the Chandelier's strands (additive: black = clear). */
function beadTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(16, 64);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 16, 64);
  for (let i = 0; i < 4; i++) {
    const y = 8 + i * 16;
    const g = ctx.createRadialGradient(8, y - 1, 0.5, 8, y, 6.5);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#e8d8ff');
    g.addColorStop(0.8, '#5a3a8a');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(8, y, 6.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(200,180,255,0.35)';
  ctx.fillRect(7.5, 0, 1, 64);
  return tex(c, true);
}

/** Generic record sleeves: a grid of 8×4 bold, abstract covers (no real art). */
function recordWallTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 512);
  const r = rng(45);
  const pal = ['#e8432a', '#f2c230', '#1f6fd8', '#111111', '#f4efe4', '#2a9a5a', '#d84a9a', '#7a3ad8', '#ff8a1a', '#1ac8c8', '#8a1a1a', '#c8b89a'];
  const P = () => pal[Math.floor(r() * pal.length)];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 8; i++) {
      const x = i * 128;
      const y = j * 128;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 3, y + 3, 122, 122);
      ctx.clip();
      ctx.fillStyle = P();
      ctx.fillRect(x, y, 128, 128);
      const kind = Math.floor(r() * 7);
      ctx.fillStyle = P();
      ctx.strokeStyle = P();
      if (kind === 0) {
        for (let k = 0; k < 5; k++) {
          ctx.lineWidth = 3 + r() * 6;
          ctx.beginPath();
          ctx.arc(x + 64, y + 64, 10 + k * 11, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (kind === 1) {
        for (let k = 0; k < 6; k++) {
          ctx.fillStyle = P();
          ctx.fillRect(x, y + k * 22, 128, 11);
        }
      } else if (kind === 2) {
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 118);
        ctx.lineTo(x + 64, y + 14);
        ctx.lineTo(x + 118, y + 118);
        ctx.fill();
      } else if (kind === 3) {
        // portrait silhouette
        ctx.beginPath();
        ctx.arc(x + 64, y + 52, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + 28, y + 80, 72, 60);
      } else if (kind === 4) {
        for (let k = 0; k < 14; k++) {
          ctx.fillStyle = P();
          ctx.beginPath();
          ctx.arc(x + r() * 128, y + r() * 128, 4 + r() * 16, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (kind === 5) {
        ctx.fillRect(x + 14, y + 14, 100, 100);
        ctx.fillStyle = P();
        ctx.fillRect(x + 34, y + 34, 60, 60);
      } else {
        ctx.lineWidth = 8;
        for (let k = -4; k < 8; k++) {
          ctx.beginPath();
          ctx.moveTo(x + k * 20, y);
          ctx.lineTo(x + k * 20 + 128, y + 128);
          ctx.stroke();
        }
      }
      // title block
      if (r() < 0.6) {
        ctx.fillStyle = r() < 0.5 ? '#ffffff' : '#111111';
        ctx.font = `bold ${12 + Math.floor(r() * 10)}px ${r() < 0.5 ? 'Georgia, serif' : 'Arial Black, Arial, sans-serif'}`;
        const words = ['LIVE', 'SIDE A', 'VOL. 2', 'NIGHTS', 'SOUL', 'DISCO', 'JAZZ', 'NEON', 'BLUE', 'GOLD', 'HITS', 'MONO'];
        ctx.fillText(words[Math.floor(r() * words.length)], x + 10, y + 24);
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 122, y + 6, 4, 120);
    }
  }
  return tex(c, true);
}

function checkerTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = (i + j) % 2 ? '#141414' : '#e8e4da';
      ctx.fillRect(i * 32, j * 32, 32, 32);
    }
  return tex(c, true);
}

function menuTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 192);
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 184);
  ctx.fillStyle = '#f4f0e4';
  ctx.font = 'bold 30px "Comic Sans MS", "Marker Felt", cursive';
  ctx.textAlign = 'center';
  ctx.fillText('SLICES', 256, 44);
  ctx.font = '24px "Comic Sans MS", "Marker Felt", cursive';
  ctx.textAlign = 'left';
  const items = [
    ['CHEESE', '6'],
    ['PEPPERONI', '7'],
    ['WHITE', '7'],
    ['SPECIAL', '7'],
  ];
  items.forEach(([n, p], i) => {
    const x = i % 2 ? 280 : 30;
    const y = 96 + Math.floor(i / 2) * 50;
    ctx.fillStyle = i % 2 ? '#ffd27a' : '#f4f0e4';
    ctx.fillText(n, x, y);
    ctx.fillText(`$${p}`, x + 170, y);
  });
  return tex(c);
}

function marqueeSignTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 192);
  ctx.fillStyle = '#050408';
  ctx.fillRect(0, 0, 1024, 192);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 132px "Arial Black", "Helvetica Neue", Arial, sans-serif';
  (ctx as unknown as { letterSpacing: string }).letterSpacing = '24px';
  ctx.shadowColor = '#c77dff';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#f4ecff';
  ctx.fillText('MARQUEE', 524, 100, 980);
  ctx.shadowBlur = 0;
  // LED dot texture on the letters
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < 192; y += 6) ctx.fillRect(0, y, 1024, 2);
  ctx.globalCompositeOperation = 'source-over';
  return tex(c);
}

/** UVs for a quad tiling a texture every `tile` metres. */
function tiled(g: THREE.PlaneGeometry, w: number, h: number, tileU: number, tileV = tileU): THREE.PlaneGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tileU, (uv.getY(i) * h) / tileV);
  return g;
}

export function buildCosmoExtras(b: WorldBuilder): void {
  const group = new THREE.Group();
  group.name = 'interior:cosmo-extras';
  const k = new Kit();
  const r = rng(2010);
  const m5 = vcMat(0.5);
  const m8 = vcMat(0.8);
  const met = vcMat(0.3, 0.85);
  const shiny = vcMat(0.12, 0.6);
  const glow = glowMat();
  const add = additiveMat();
  const standing: Person[] = [];
  const seated: Person[] = [];
  const anim: Array<(t: number, dt: number) => void> = [];

  // ---------------------------------------------------------------- the Chandelier
  const beadMat = new THREE.MeshBasicMaterial({ map: beadTexture(), color: 0xd8c0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const strands: THREE.BufferGeometry[] = [];
  const drops = new Kit();
  const rings = [1.9, 2.6, 3.3, 4.0, 4.7, 5.35];
  rings.forEach((rad, ri) => {
    const n = Math.round((Math.PI * 2 * rad) / 0.26);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ri * 0.13;
      const bottom = 2.1 + (rad - 1.9) * 0.95 + 0.7 * Math.abs(Math.sin(a * 3 + ri)) + (r() - 0.5) * 0.25;
      const L = CEIL - bottom;
      const x = CX + Math.cos(a) * rad;
      const z = CZ + Math.sin(a) * rad;
      for (const rot of [a, a + Math.PI / 2]) {
        const g = new THREE.PlaneGeometry(0.085, L);
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let q = 0; q < uv.count; q++) uv.setY(q, uv.getY(q) * (L / 0.5));
        g.rotateY(rot);
        g.translate(x, bottom + L / 2, z);
        strands.push(g);
      }
      drops.add(new THREE.OctahedronGeometry(0.06, 0).scale(1, 1.8, 1), glow, 0xe8dcff, x, bottom - 0.08, z);
    }
  });
  const merged = strands.length ? (strands.length === 1 ? strands[0] : mergeAll(strands)) : null;
  if (merged) {
    const cm = new THREE.Mesh(merged, beadMat);
    cm.renderOrder = 2;
    group.add(cm);
  }
  drops.flush(group);
  // glowing core haze and the canopy ring at the ceiling
  k.cyl(add, 0x1a0a2a, CX, 6.2, CZ, 1.5, 1.5, 7.6, 20);
  k.cyl(add, 0x14081e, CX, 7.0, CZ, 5.6, 5.6, 6.6, 32);
  k.add(new THREE.TorusGeometry(5.6, 0.12, 6, 48).rotateX(Math.PI / 2), met, BRASS, CX, CEIL - 0.1, CZ);
  k.add(new THREE.TorusGeometry(2.0, 0.08, 6, 32).rotateX(Math.PI / 2), met, BRASS, CX, CEIL - 0.1, CZ);
  // back-bar island inside the ring: lit bottle shelves round a violet column
  k.cyl(shiny, BLACK_GLASS, CX, 0.55, CZ, 1.35, 1.35, 1.1, 24);
  for (let tier = 0; tier < 3; tier++) {
    const y = 1.25 + tier * 0.42;
    k.cyl(glow, tier === 1 ? PINK : VIOLET, CX, y - 0.04, CZ, 1.05 - tier * 0.12, 1.05 - tier * 0.12, 0.03, 24);
    const nb = 22 - tier * 4;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2;
      const rr = 0.95 - tier * 0.12;
      k.cyl(glow, [0xffc46a, 0x9af0ff, 0xff8ad8, 0xc8ff8a, 0xfff2d0][(i + tier) % 5], CX + Math.cos(a) * rr, y + 0.12, CZ + Math.sin(a) * rr, 0.035, 0.045, 0.24, 6);
    }
  }
  k.cyl(glow, 0x2a0e44, CX, 3.2, CZ, 0.42, 0.42, 1.2, 16);
  // bartenders inside the ring
  for (const a of [0.4, 2.5, 4.4]) standing.push({ x: CX + Math.cos(a) * 2.05, z: CZ + Math.sin(a) * 2.05, rot: Math.atan2(Math.cos(a), Math.sin(a)), shirt: 0x141414, vest: 0x2a0e3a });
  // guests at the bar
  for (const a of [0.9, 1.8, 3.3, 5.4, 6.0]) {
    seated.push({ x: CX + Math.cos(a) * 3.65, y: 0.05, z: CZ + Math.sin(a) * 3.65, rot: Math.atan2(-Math.cos(a), -Math.sin(a)), shirt: GUEST_SHIRTS[Math.floor(r() * GUEST_SHIRTS.length)] });
    k.cyl(met, BRASS, CX + Math.cos(a) * 3.7, 0.38, CZ + Math.sin(a) * 3.7, 0.04, 0.12, 0.76, 8);
    k.cyl(m8, VELVET, CX + Math.cos(a) * 3.7, 0.8, CZ + Math.sin(a) * 3.7, 0.22, 0.2, 0.1, 12);
  }

  // lounge clusters: velvet armchairs round a brass-and-black-glass cocktail table
  const lounge = (x: number, y: number, z: number, face: number, people: number) => {
    k.cyl(met, BRASS, x, y + 0.32, z, 0.05, 0.16, 0.64, 10);
    k.cyl(shiny, BLACK_GLASS, x, y + 0.66, z, 0.42, 0.42, 0.04, 20);
    k.cyl(glow, 0xffc46a, x + 0.12, y + 0.74, z, 0.035, 0.03, 0.12, 6);
    k.cyl(glow, 0xff6ad8, x - 0.1, y + 0.75, z + 0.08, 0.03, 0.025, 0.14, 6);
    for (let i = 0; i < 3; i++) {
      const a = face + (i - 1) * 1.25;
      const ax = x + Math.sin(a) * 1.0;
      const az = z + Math.cos(a) * 1.0;
      k.at(ax, y, az, a + Math.PI, () => {
        k.box(m8, VELVET, 0, 0.24, 0, 0.78, 0.42, 0.74);
        k.box(m8, scaleHex(VELVET, 0.8), 0, 0.72, -0.31, 0.78, 0.6, 0.14);
        for (const s of [-1, 1]) k.box(m8, scaleHex(VELVET, 0.85), s * 0.34, 0.55, 0, 0.12, 0.24, 0.7);
        k.box(met, BRASS, 0, 0.02, 0, 0.7, 0.04, 0.66);
      });
      b.collider(ax - 0.4, ax + 0.4, az - 0.4, az + 0.4, y, y + 0.46);
      if (i < people) seated.push({ x: ax, y: y - 0.14, z: az, rot: a + Math.PI, shirt: GUEST_SHIRTS[Math.floor(r() * GUEST_SHIRTS.length)] });
    }
    b.collider(x - 0.42, x + 0.42, z - 0.42, z + 0.42, y, y + 0.7);
  };
  for (const [a, ppl] of [
    [0, 2],
    [Math.PI * 0.27, 1],
    [Math.PI * 0.73, 2],
    [Math.PI, 0],
    [Math.PI * 1.27, 2],
    [Math.PI * 1.73, 1],
  ] as Array<[number, number]>) {
    const x = CX + Math.cos(a) * 6.3;
    const z = CZ + Math.sin(a) * 6.3;
    lounge(x, 0, z, Math.atan2(CX - x, CZ - z) + Math.PI, ppl);
  }

  // level 1.5: rails, under-glow and lounges on the two mezzanines (x −48…−33, top y 4.55)
  const LY = 4.55;
  for (const [zIn, zOut, s] of [
    [176, 173, 1],
    [188, 191, -1],
  ] as Array<[number, number, number]>) {
    // glass rails with a brass cap, on the chandelier side and the casino side (open at the stairs)
    k.box(glassMat(), 0xffffff, -40.5, LY + 0.55, zIn - s * 0.05, 15, 1.0, 0.04);
    k.box(met, BRASS, -40.5, LY + 1.07, zIn - s * 0.05, 15, 0.05, 0.08);
    k.box(glassMat(), 0xffffff, -42, LY + 0.55, zOut + s * 0.05, 12, 1.0, 0.04);
    k.box(met, BRASS, -42, LY + 1.07, zOut + s * 0.05, 12, 0.05, 0.08);
    k.box(glow, VIOLET, -40.5, LY - 0.38, zIn, 15, 0.05, 0.06);
    k.box(glow, PINK, -40.5, LY - 0.38, zOut, 15, 0.05, 0.06);
    k.box(m5, 0x2a1810, -40.5, LY + 0.01, (zIn + zOut) / 2, 15, 0.02, 3); // dark wood deck
    const zc = (zIn + zOut) / 2;
    lounge(-45.4, LY, zc, s > 0 ? Math.PI / 2 : Math.PI / 2, 2);
    // a little bar with its bartender at the inner end
    k.box(shiny, BLACK_GLASS, -39.2, LY + 0.55, zc, 0.6, 1.1, 2.6);
    k.box(glow, PINK, -38.88, LY + 0.2, zc, 0.02, 0.05, 2.6);
    k.box(m5, 0x2a1810, -39.2, LY + 1.12, zc, 0.8, 0.05, 2.8);
    for (let i = 0; i < 5; i++) k.cyl(glow, [0xffc46a, 0x9af0ff, 0xff8ad8][i % 3], -39.65, LY + 1.27, zc - 1.0 + i * 0.5, 0.035, 0.04, 0.22, 6);
    b.collider(-39.5, -38.9, zc - 1.3, zc + 1.3, LY, LY + 1.15, true);
    standing.push({ x: -40.1, y: LY, z: zc, rot: Math.PI / 2, shirt: 0x141414, vest: 0x2a0e3a });
    seated.push({ x: -38.25, y: LY + 0.05, z: zc - 0.6, rot: -Math.PI / 2, shirt: GUEST_SHIRTS[Math.floor(r() * GUEST_SHIRTS.length)] });
    k.cyl(met, BRASS, -38.3, LY + 0.38, zc - 0.6, 0.04, 0.12, 0.76, 8);
    k.cyl(m8, VELVET, -38.3, LY + 0.8, zc - 0.6, 0.22, 0.2, 0.1, 12);
    k.cyl(met, BRASS, -38.3, LY + 0.38, zc + 0.6, 0.04, 0.12, 0.76, 8);
    k.cyl(m8, VELVET, -38.3, LY + 0.8, zc + 0.6, 0.22, 0.2, 0.1, 12);
  }
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(-37.6, LY, 174.5), radius: 1.8, label: 'Chandelier Level 1.5' });

  // ---------------------------------------------------------------- LED art columns in the foyer
  const art = new ArtCanvas(256, 1024, { period: 10, fps: 8 });
  art.tex.wrapS = art.tex.wrapT = THREE.RepeatWrapping;
  const colGeos: THREE.BufferGeometry[] = [];
  const colW = 1.3;
  const colH = CEIL - 0.9;
  const cols: Array<[number, number]> = [];
  for (const x of [-27.2, -31.4]) for (const z of [170.5, 175.0, 189.0, 193.5]) cols.push([x, z]);
  cols.forEach(([x, z], ci) => {
    const vOff = ci * 0.37;
    for (let f = 0; f < 4; f++) {
      const g = new THREE.PlaneGeometry(colW, colH);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, (f + uv.getX(q)) / 4, uv.getY(q) + vOff);
      g.translate(0, 0, colW / 2 + 0.005);
      g.rotateY((f * Math.PI) / 2);
      g.translate(x, 0.45 + colH / 2, z);
      colGeos.push(g);
    }
    k.box(shiny, BLACK_GLASS, x, 0.22, z, colW + 0.2, 0.45, colW + 0.2);
    k.box(glow, VIOLET, x, 0.46, z, colW + 0.22, 0.03, colW + 0.22);
    k.box(shiny, BLACK_GLASS, x, CEIL - 0.22, z, colW + 0.2, 0.45, colW + 0.2);
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) k.box(shiny, 0x050508, x + (dx * colW) / 2, 0.45 + colH / 2, z + (dz * colW) / 2, 0.05, colH, 0.05);
    b.collider(x - colW / 2 - 0.1, x + colW / 2 + 0.1, z - colW / 2 - 0.1, z + colW / 2 + 0.1, 0, CEIL, true);
  });
  const colMesh = new THREE.Mesh(mergeAll(colGeos), new THREE.MeshBasicMaterial({ map: art.tex }));
  group.add(colMesh);
  anim.push((t) => art.draw(t));

  // ---------------------------------------------------------------- Marquee nightclub entrance (south wall)
  const MZ = 203.4;
  const mx0 = -44.4;
  const mx1 = -35.6;
  const mxc = (mx0 + mx1) / 2;
  k.box(shiny, BLACK_GLASS, mxc, 3.3, MZ - 0.2, mx1 - mx0, 6.6, 0.4);
  k.box(shiny, 0x020203, mxc, 1.75, MZ - 0.42, 3.6, 3.5, 0.06); // doors
  k.box(met, 0xd8d8e0, mxc - 0.25, 1.4, MZ - 0.47, 0.04, 1.2, 0.05);
  k.box(met, 0xd8d8e0, mxc + 0.25, 1.4, MZ - 0.47, 0.04, 1.2, 0.05);
  const signG = new THREE.PlaneGeometry(7.4, 1.39);
  k.add(signG, new THREE.MeshBasicMaterial({ map: marqueeSignTexture() }), 0xffffff, mxc, 5.0, MZ - 0.42, Math.PI);
  // red carpet and rope
  k.box(m8, 0x7a0a1a, mxc, 0.04, (MZ + 200.4) / 2, mx1 - mx0 - 1.2, 0.04, MZ - 200.4);
  for (let x = mx0 + 0.4; x <= mx1 - 0.39; x += 1.6) {
    k.cyl(met, 0xe0e0e8, x, 0.5, 200.4, 0.045, 0.06, 1.0, 8);
    k.cyl(met, 0xe0e0e8, x, 0.03, 200.4, 0.2, 0.2, 0.06, 12);
    k.add(new THREE.SphereGeometry(0.07, 8, 6), met, 0xe0e0e8, x, 1.04, 200.4);
    if (x + 1.6 <= mx1 - 0.39) {
      const g = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6);
      g.rotateZ(Math.PI / 2);
      k.add(g, m8, 0x9b0f2a, x + 0.8, 0.86, 200.4);
    }
  }
  b.collider(mx0, mx1, 200.1, 200.7, 0, 2.6, true);
  b.collider(mx0 - 0.2, mx1 + 0.2, MZ - 0.45, MZ, 0, 6.6, true);
  // host podium + bouncer + the line
  k.box(m5, 0x1a1218, -36.6, 0.55, 201.6, 0.6, 1.1, 0.5);
  k.box(glow, 0x8ad8ff, -36.6, 1.12, 201.5, 0.4, 0.02, 0.3);
  standing.push({ x: -35.1, z: 201.3, rot: Math.PI, shirt: 0x0c0c0e, vest: 0x0c0c0e });
  standing.push({ x: -37.2, z: 202.0, rot: Math.PI * 0.85, shirt: 0x111111, vest: 0x5a1a6a });
  for (let i = 0; i < 5; i++) standing.push({ x: -43.5 + i * 1.3, z: 199.6, rot: (r() - 0.5) * 0.8 + (i === 4 ? -Math.PI / 2 : 0), shirt: GUEST_SHIRTS[Math.floor(r() * GUEST_SHIRTS.length)] });
  // the light leaking round the door frame pulses with the bass inside
  const pulse = new THREE.MeshBasicMaterial({ color: 0xb46bff });
  const pk = new Kit();
  pk.box(glow, 0xffffff, mxc, 3.56, MZ - 0.44, 3.7, 0.06, 0.04);
  pk.box(glow, 0xffffff, mxc - 1.84, 1.78, MZ - 0.44, 0.06, 3.56, 0.04);
  pk.box(glow, 0xffffff, mxc + 1.84, 1.78, MZ - 0.44, 0.06, 3.56, 0.04);
  pk.box(glow, 0xffffff, mxc, 0.02, MZ - 0.5, 3.6, 0.02, 0.2);
  for (const s of [-1, 1]) pk.box(glow, 0xffffff, mxc + s * 4.3, 3.3, MZ - 0.42, 0.08, 6.4, 0.04);
  pk.box(glow, 0xffffff, mxc, 6.55, MZ - 0.42, mx1 - mx0, 0.08, 0.04);
  for (const m of pk.flush(group)) m.material = pulse;
  anim.push((t) => {
    const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 2.05)), 6);
    pulse.color.setHSL(0.78 + 0.08 * Math.sin(t * 0.3), 0.9, 0.35 + 0.35 * beat);
  });

  // ---------------------------------------------------------------- Secret Pizza (north wall)
  // An unmarked doorway behind the slot row in the casino's north-east corner opens into a dim
  // hallway lined with record sleeves; at its end, a tiny counter, an oven and a pinball machine.
  const pz0 = 160.95;
  const pz1 = 163.58;
  const px0 = -50.5;
  const px1 = -33.0;
  const recTex = recordWallTexture();
  const recMat = new THREE.MeshStandardMaterial({ map: recTex, roughness: 0.55 });
  const recL = px1 - px0 - 1.5;
  const recH = 2.6;
  const wallN = tiled(new THREE.PlaneGeometry(recL, recH), recL, recH, 0.34 * 8, 0.34 * 4);
  k.add(wallN, recMat, 0xffffff, (px0 + 1.5 + px1) / 2, 0.55 + recH / 2, pz0);
  const wallS = tiled(new THREE.PlaneGeometry(recL, recH), recL, recH, 0.34 * 8, 0.34 * 4);
  k.add(wallS, recMat, 0xffffff, (px0 + 1.5 + px1) / 2, 0.55 + recH / 2, pz1, Math.PI);
  const ck = checkerTexture();
  const floorG = tiled(new THREE.PlaneGeometry(px1 - px0, pz1 - pz0), px1 - px0, pz1 - pz0, 0.9);
  floorG.rotateX(-Math.PI / 2);
  k.add(floorG, new THREE.MeshStandardMaterial({ map: ck, roughness: 0.5 }), 0xffffff, (px0 + px1) / 2, 0.06, (pz0 + pz1) / 2);
  k.box(m8, 0x1a1614, (px0 + px1) / 2, 3.7, (pz0 + pz1) / 2, px1 - px0, 0.2, pz1 - pz0 + 0.4);
  k.box(m8, 0x2a2420, (px0 + px1) / 2, 0.3, pz0 + 0.03, px1 - px0, 0.5, 0.06);
  k.box(m8, 0x2a2420, (px0 + px1) / 2, 0.3, pz1 - 0.03, px1 - px0, 0.5, 0.06);
  for (let x = px0 + 2.5; x < px1; x += 3.2) {
    k.cyl(met, 0x1a1a1a, x, 3.45, (pz0 + pz1) / 2, 0.01, 0.01, 0.3, 4);
    k.add(new THREE.SphereGeometry(0.07, 8, 6), glow, 0xffd8a0, x, 3.26, (pz0 + pz1) / 2);
  }
  // the counter (glass case with pies), the oven, the menu and the pizza guy
  const cnt = px0 + 1.4;
  k.box(m5, 0x2a1c14, cnt, 0.52, (pz0 + pz1) / 2, 0.7, 1.04, pz1 - pz0);
  k.box(m5, 0xb8b4ac, cnt, 1.06, (pz0 + pz1) / 2, 0.8, 0.05, pz1 - pz0);
  k.box(glassMat(), 0xffffff, cnt + 0.05, 1.28, (pz0 + pz1) / 2, 0.55, 0.4, pz1 - pz0 - 0.5);
  for (let i = 0; i < 3; i++) {
    const zz = pz0 + 0.65 + i * 0.68;
    k.cyl(m8, 0xd8a050, cnt + 0.05, 1.1, zz, 0.22, 0.22, 0.03, 16);
    k.cyl(m8, i === 1 ? 0xf2ead0 : 0xd8402a, cnt + 0.05, 1.12, zz, 0.19, 0.19, 0.01, 16);
    if (i !== 1) for (let p = 0; p < 6; p++) k.cyl(m8, 0x8a1a10, cnt + 0.05 + Math.cos(p) * 0.1, 1.13, zz + Math.sin(p * 2.1) * 0.1, 0.03, 0.03, 0.01, 8);
  }
  k.box(met, 0x9aa0a8, px0 + 0.45, 1.2, pz0 + 0.8, 0.8, 1.4, 1.3);
  k.box(glow, 0xff7a2a, px0 + 0.86, 1.1, pz0 + 0.8, 0.02, 0.14, 0.9);
  k.add(new THREE.PlaneGeometry(2.3, 0.86), new THREE.MeshBasicMaterial({ map: menuTexture() }), 0xffffff, px0 + 0.02, 2.55, (pz0 + pz1) / 2, Math.PI / 2);
  standing.push({ x: px0 + 0.6, z: pz1 - 0.6, rot: Math.PI / 2, shirt: 0x1a1a1a, vest: 0x8a1a10 });
  b.collider(px0, cnt + 0.4, pz0 - 0.4, pz1 + 0.1, 0, 1.4, true);
  // pinball machine with a lit backglass, and stools
  const pbx = px0 + 4.2;
  k.box(m5, 0x1a1a2a, pbx, 0.95, pz1 - 0.5, 0.7, 0.3, 1.3, 0, 0.12);
  for (const [dx, dz] of [
    [-0.3, -0.55],
    [0.3, -0.55],
    [-0.3, 0.5],
    [0.3, 0.5],
  ]) k.box(met, 0x8a8a90, pbx + dx, 0.42, pz1 - 0.5 + dz, 0.05, 0.84, 0.05);
  k.box(m5, 0x1a1a2a, pbx, 1.65, pz1 - 0.1, 0.72, 0.85, 0.12);
  k.box(glow, 0xff5aa8, pbx, 1.65, pz1 - 0.17, 0.62, 0.72, 0.02);
  k.box(glow, 0x6af0ff, pbx, 1.12, pz1 - 0.55, 0.55, 0.02, 1.0, 0, 0.12);
  b.collider(pbx - 0.4, pbx + 0.4, pz1 - 1.2, pz1, 0, 1.2, true);
  for (const z of [pz0 + 0.5, pz0 + 1.3]) {
    k.cyl(met, 0x8a8a90, cnt + 1.0, 0.38, z, 0.03, 0.1, 0.76, 8);
    k.cyl(m8, 0xc8141e, cnt + 1.0, 0.79, z, 0.2, 0.2, 0.08, 12);
  }
  seated.push({ x: cnt + 1.05, y: 0.04, z: pz0 + 0.5, rot: -Math.PI / 2, shirt: GUEST_SHIRTS[3] });
  standing.push({ x: pbx + 0.1, z: pz1 - 1.5, rot: 0, shirt: GUEST_SHIRTS[7] });
  // hallway shell: partition (casino side is dark wood with a violet LED line), end wall, ceiling
  const wood = new THREE.MeshStandardMaterial({ color: 0x24160e, roughness: 0.6 });
  b.box((px0 + px1) / 2, 0, 164.1, px1 - px0, 3.9, 1.0, wood, true);
  b.box(px0 - 0.3, 0, (pz0 + pz1) / 2 - 0.1, 0.6, 3.9, 3.0, wood, true);
  b.collider(px0, px1, 160.6, 163.6, 3.6, 4.0);
  k.box(glow, VIOLET, (px0 + px1) / 2, 3.86, 164.62, px1 - px0, 0.05, 0.05);
  for (let x = px0 + 1.5; x < px1 - 0.5; x += 2.5) k.box(glow, PINK, x, 1.95, 164.62, 0.04, 3.6, 0.04);

  // ---------------------------------------------------------------- VIP lounge (behind the rope, x −62…−51.5)
  const sofa = (x: number, z: number, ry: number, len: number) => {
    k.at(x, 0, z, ry, () => {
      k.box(m8, PLUM, 0, 0.24, 0, len, 0.46, 0.9);
      k.box(m8, scaleHex(PLUM, 0.8), 0, 0.72, -0.38, len, 0.62, 0.18);
      for (const s of [-1, 1]) k.box(m8, scaleHex(PLUM, 0.85), s * (len / 2 - 0.08), 0.55, 0, 0.16, 0.3, 0.88);
      for (let i = 0; i < Math.floor(len / 0.8); i++) k.box(m8, scaleHex(PLUM, 1.25), -len / 2 + 0.5 + i * 0.8, 0.68, -0.18, 0.5, 0.4, 0.14);
    });
  };
  sofa(-60.6, 166, Math.PI / 2, 4.4);
  sofa(-60.6, 198, Math.PI / 2, 4.4);
  b.collider(-61.2, -60.0, 163.8, 168.2, 0, 0.5);
  b.collider(-61.2, -60.0, 195.8, 200.2, 0, 0.5);
  for (const z of [166, 198]) {
    k.cyl(met, BRASS, -58.8, 0.2, z, 0.5, 0.5, 0.04, 20);
    k.cyl(shiny, BLACK_GLASS, -58.8, 0.42, z, 0.55, 0.55, 0.04, 20);
    k.cyl(met, BRASS, -58.8, 0.2, z, 0.06, 0.06, 0.4, 8);
    seated.push({ x: -60.2, y: -0.15, z: z - 1.0, rot: Math.PI / 2, shirt: GUEST_SHIRTS[(z % 5) + 2] });
  }
  // gold-veined mirror panels and the humidor (the pickup sits on top)
  for (let z = 163; z < 202; z += 3.4) {
    k.box(shiny, 0x2a2430, -61.36, 3.2, z, 0.04, 4.4, 2.6);
    k.box(met, 0xd9ae4a, -61.32, 3.2, z - 1.32, 0.05, 4.5, 0.06);
    k.box(glow, 0xffd27a, -61.3, 5.5, z, 0.04, 0.05, 2.7);
  }
  k.box(m5, 0x3a2414, -58.6, 0.55, 182, 1.0, 1.1, 1.6);
  k.box(glassMat(), 0xffffff, -58.08, 0.6, 182, 0.04, 0.8, 1.4);
  for (let i = 0; i < 6; i++) k.box(m8, 0x6a3a1a, -58.4, 0.3 + (i % 3) * 0.25, 181.5 + Math.floor(i / 3) * 0.6, 0.6, 0.05, 0.5);
  b.collider(-59.1, -58.1, 181.2, 182.8, 0, 1.1);

  // ---------------------------------------------------------------- moody casino dressing
  // black-glass panels with pink LED fins on the east wall either side of the doors
  for (const [z0, z1] of [
    [161.5, 177],
    [187, 202.5],
  ]) {
    for (let z = z0; z < z1; z += 2.2) {
      k.box(shiny, BLACK_GLASS, -24.92, 3.6, z + 1.1, 0.04, 6.6, 2.0);
      k.box(glow, PINK, -24.96, 3.6, z, 0.03, 6.6, 0.04);
    }
  }

  // ---------------------------------------------------------------- emit + gate
  k.flush(group);
  buildPeople(group, 'stand', standing);
  buildPeople(group, 'sit', seated);
  anim.push((t) => {
    beadMat.color.setHSL(0.76 + Math.sin(t * 0.12) * 0.07, 0.55, 0.62 + 0.08 * Math.sin(t * 1.3));
  });
  // Drawn from inside, or looking in through the Strip doors from the sidewalk (not from across the Boulevard)
  const gate: GateBox = { minX: -62, maxX: -24, minZ: 160, maxZ: 204, height: 12, doors: [{ x: -24, z: 182, nx: 1, nz: 0, half: 4 }] };
  gatedDoors(
    b,
    group,
    gate,
    (t, dt) => {
      for (const f of anim) f(t, dt);
    },
    () => {
      const c = viewer.cam;
      if (c.x > -24.5 && (c.x + 24) * (c.x + 24) + (c.z - 182) * (c.z - 182) > 22 * 22) return false;
      return gateOpen(gate);
    }
  );

  b.zone('Secret Pizza • Cosmopolitan Casino', px0, px1, pz0 - 0.4, pz1 + 0.1);
  b.zone('Marquee Nightclub • Cosmopolitan Casino', mx0, mx1, 199.5, MZ);
  b.pickup(cnt + 1.6, 0.45, (pz0 + pz1) / 2, 4, 'Secret Pizza Slice-Box Smokes', true);
  b.pickup(-44, 0.45, 199.2, 3, 'Marquee Line Smokes', true);
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // all PlaneGeometry: same attributes and indexed
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index!.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array as Float32Array, vo * 3);
    nor.set(g.attributes.normal.array as Float32Array, vo * 3);
    uv.set(g.attributes.uv.array as Float32Array, vo * 2);
    const gi = g.index!.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

function scaleHex(hex: number, f: number): number {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c.getHex();
}
