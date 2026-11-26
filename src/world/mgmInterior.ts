import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { viewer, type WorldBuilder } from './builder';
import { GUEST_SHIRTS, Kit, additiveMat, buildPeople, glassMat, glowMat, pokerTable, ropeLine, vcMat, type GateBox, type PeopleLists, type TableLook } from './interiorKit';
import { basic, mat, mesh } from './props';
import { LedBoard } from './textures';
import { canvasTex, fitText, lazyInterior, mapGlow, mapLit, prng, puckMaterial, themeClock, tickTheme, uvScale, uvTo, type Px } from './themedKit';

/*
 * MGM Grand: the Lion Rotunda (the Strip entrance by the bronze lion: a domed, emerald-and-gold
 * rotunda with a golden lion on a pedestal), the casino floor's set pieces (BetMGM sportsbook with a
 * giant LED wall, the round Center Bar under a lit crown, the poker room, the glass Lion Habitat with
 * Lou's cousins lounging inside, Art-Deco Hollywood dressing and signs to the Grand Garden Arena and
 * KÀ) and the Strip marquee (giant LED-puck MGM letters over a video board).
 */

// ------------------------------------------------------------------ layout (shared with southStrip)
export const MGM = {
  /** Main casino floor (buildCasinoFloor) */
  x0: 68.6,
  x1: 120,
  z0: 380,
  z1: 423.8,
  h: 13,
  /** Lion Rotunda (custom room west of the floor, opening onto the Strip) */
  rx0: 44,
  rz0: 405.6,
  rz1: 423.8,
  door: 414.7,
  innerDoorW: 8,
  stripDoorW: 9,
  cx: 56.3,
  cz: 414.7,
  /** Set pieces on the main floor */
  bar: [90, 404] as [number, number],
  habitat: [105, 115.6, 385, 399.5] as [number, number, number, number],
  poker: [102, 114, 406, 417.5] as [number, number, number, number],
  book: [79, 101, 384.6, 392.6] as [number, number, number, number],
};

// ------------------------------------------------------------------ textures
const AT: [number, number] = [1024, 1024];
const A = {
  arena: [0, 0, 512, 96] as Px,
  ka: [512, 0, 512, 96] as Px,
  betmgm: [0, 96, 512, 96] as Px,
  poker: [512, 96, 512, 96] as Px,
  habitat: [0, 192, 512, 128] as Px,
  casino: [512, 192, 512, 128] as Px,
  noTap: [0, 320, 512, 64] as Px,
  centerBar: [512, 320, 512, 64] as Px,
  sunburst: [0, 384, 256, 256] as Px,
  poster0: [256, 384, 128, 192] as Px,
  poster1: [384, 384, 128, 192] as Px,
  poster2: [512, 384, 128, 192] as Px,
  medallion: [640, 384, 384, 384] as Px,
  odds: [0, 640, 512, 320] as Px,
  savanna: [512, 768, 512, 208] as Px,
  ticker: [0, 976, 1024, 48] as Px,
  plaque: [256, 576, 384, 64] as Px,
};

let _atlas: THREE.CanvasTexture | null = null;
function atlas(): THREE.CanvasTexture {
  if (_atlas) return _atlas;
  _atlas = canvasTex(AT[0], AT[1], (ctx) => {
    const panel = (r: Px, bg: string, border: string) => {
      ctx.fillStyle = bg;
      ctx.fillRect(r[0], r[1], r[2], r[3]);
      ctx.strokeStyle = border;
      ctx.lineWidth = 5;
      ctx.strokeRect(r[0] + 6, r[1] + 6, r[2] - 12, r[3] - 12);
      ctx.lineWidth = 2;
      ctx.strokeRect(r[0] + 13, r[1] + 13, r[2] - 26, r[3] - 26);
    };
    const arrow = (x: number, y: number, s: number, dir: 1 | -1, col: string) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x + dir * s, y);
      ctx.lineTo(x - dir * s * 0.2, y - s * 0.8);
      ctx.lineTo(x - dir * s * 0.2, y - s * 0.32);
      ctx.lineTo(x - dir * s, y - s * 0.32);
      ctx.lineTo(x - dir * s, y + s * 0.32);
      ctx.lineTo(x - dir * s * 0.2, y + s * 0.32);
      ctx.lineTo(x - dir * s * 0.2, y + s * 0.8);
      ctx.closePath();
      ctx.fill();
    };
    const deco = '"Century Gothic", Futura, "Trebuchet MS", sans-serif';
    // wayfinding
    panel(A.arena, '#0a2a1a', '#d9ae4a');
    ctx.fillStyle = '#ffffff';
    fitText(ctx, 'GRAND GARDEN ARENA', A.arena[0] + 220, A.arena[1] + 48, 44, 380, deco);
    arrow(A.arena[0] + 462, A.arena[1] + 48, 30, 1, '#ffd27a');
    panel(A.ka, '#0a2a1a', '#d9ae4a');
    ctx.fillStyle = '#ffffff';
    fitText(ctx, 'KÀ THEATRE', A.ka[0] + 210, A.ka[1] + 40, 46, 360, deco);
    ctx.fillStyle = '#ffd27a';
    fitText(ctx, 'CIRQUE DU SOLEIL', A.ka[0] + 210, A.ka[1] + 74, 20, 300, deco);
    arrow(A.ka[0] + 462, A.ka[1] + 48, 30, 1, '#ffd27a');
    // BetMGM
    ctx.fillStyle = '#050505';
    ctx.fillRect(A.betmgm[0], A.betmgm[1], A.betmgm[2], A.betmgm[3]);
    ctx.font = `bold 58px ${deco}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Bet', A.betmgm[0] + 28, A.betmgm[1] + 50);
    const bw = ctx.measureText('Bet').width;
    ctx.fillStyle = '#d9b25a';
    ctx.fillText('MGM', A.betmgm[0] + 28 + bw, A.betmgm[1] + 50);
    ctx.fillStyle = '#e8e8e8';
    ctx.font = `bold 26px ${deco}`;
    ctx.fillText('SPORTSBOOK', A.betmgm[0] + 300, A.betmgm[1] + 52);
    panel(A.poker, '#0a1a12', '#d9ae4a');
    ctx.fillStyle = '#ffd27a';
    fitText(ctx, 'MGM GRAND', A.poker[0] + 256, A.poker[1] + 34, 26, 400, deco);
    ctx.fillStyle = '#ffffff';
    fitText(ctx, 'POKER ROOM', A.poker[0] + 256, A.poker[1] + 66, 40, 420, deco);
    // Lion habitat
    panel(A.habitat, '#0c3a22', '#e8c25a');
    ctx.fillStyle = '#ffe9a8';
    fitText(ctx, 'LION HABITAT', A.habitat[0] + 256, A.habitat[1] + 50, 58, 440, deco);
    ctx.fillStyle = '#ffffff';
    fitText(ctx, "meet LOU'S COUSINS", A.habitat[0] + 256, A.habitat[1] + 98, 28, 420, deco, 'italic bold');
    // casino header
    panel(A.casino, '#071a10', '#d9ae4a');
    ctx.fillStyle = '#ffd77a';
    fitText(ctx, 'MGM GRAND', A.casino[0] + 256, A.casino[1] + 54, 68, 440, deco);
    ctx.fillStyle = '#d8ffe8';
    fitText(ctx, 'C  A  S  I  N  O', A.casino[0] + 256, A.casino[1] + 102, 24, 300, deco);
    panel(A.noTap, '#f2ecd8', '#3a2a10');
    ctx.fillStyle = '#2a1a08';
    fitText(ctx, "PLEASE DON'T TAP THE GLASS • THEY'RE NAPPING", A.noTap[0] + 256, A.noTap[1] + 33, 22, 470, deco);
    panel(A.centerBar, '#071a10', '#d9ae4a');
    ctx.fillStyle = '#ffe2a0';
    fitText(ctx, 'THE CENTER BAR', A.centerBar[0] + 256, A.centerBar[1] + 33, 34, 460, deco);
    panel(A.plaque, '#2a1a08', '#d9ae4a');
    ctx.fillStyle = '#ffe9b8';
    fitText(ctx, 'LEO • LENNY • LULU • LITTLE LOUIE', A.plaque[0] + 192, A.plaque[1] + 33, 22, 350, deco);
    // Art-Deco sunburst
    {
      const [x, y, w, h] = A.sunburst;
      ctx.fillStyle = '#0b3a26';
      ctx.fillRect(x, y, w, h);
      const cx = x + w / 2;
      const cy = y + h * 0.92;
      for (let i = 0; i < 19; i++) {
        const a0 = Math.PI + (i / 19) * Math.PI;
        const a1 = Math.PI + ((i + 0.5) / 19) * Math.PI;
        ctx.fillStyle = i % 2 ? '#e8c25a' : '#b88a2a';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a0) * w, cy + Math.sin(a0) * w);
        ctx.lineTo(cx + Math.cos(a1) * w, cy + Math.sin(a1) * w);
        ctx.fill();
      }
      ctx.fillStyle = '#0b3a26';
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = '#ffe08a';
        ctx.lineWidth = 6 - k * 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 40 + k * 34, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.arc(cx, cy, 30, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 8;
      ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
    }
    // Hollywood "MGM classics" posters (cat-pun titles)
    const posters: Array<[Px, string, string, string]> = [
      [A.poster0, 'THE WIZARD', 'OF PAWS', '#2a6a3a'],
      [A.poster1, 'GONE WITH', 'THE WHISKERS', '#8a1a1a'],
      [A.poster2, 'CATSABLANCA', '★ 1942 ★', '#1a2a5a'],
    ];
    for (const [r, t1, t2, bg] of posters) {
      const [x, y, w, h] = r;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, bg);
      g.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      // silhouette of a starlet cat
      ctx.fillStyle = '#f2d8a0';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h * 0.42, 26, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - 24, y + h * 0.3);
      ctx.lineTo(x + w / 2 - 14, y + h * 0.16);
      ctx.lineTo(x + w / 2 - 4, y + h * 0.28);
      ctx.moveTo(x + w / 2 + 24, y + h * 0.3);
      ctx.lineTo(x + w / 2 + 14, y + h * 0.16);
      ctx.lineTo(x + w / 2 + 4, y + h * 0.28);
      ctx.fill();
      ctx.fillStyle = '#ffe08a';
      fitText(ctx, t1, x + w / 2, y + h * 0.75, 18, w - 14, deco);
      fitText(ctx, t2, x + w / 2, y + h * 0.86, 16, w - 14, deco);
      ctx.strokeStyle = '#d9ae4a';
      ctx.lineWidth = 6;
      ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    }
    // floor medallion: a compass star in emerald, gold and cream marble
    {
      const [x, y, w] = A.medallion;
      const cx = x + w / 2;
      const cy = y + w / 2;
      ctx.fillStyle = '#efe7d6';
      ctx.fillRect(x, y, w, w);
      const ring = (r: number, col: string) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      };
      ring(190, '#b88a2a');
      ring(180, '#0f5a3a');
      ring(160, '#efe7d6');
      ring(150, '#d9ae4a');
      ring(144, '#f4ecdc');
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const long = i % 2 === 0;
        const len = long ? 140 : 96;
        ctx.fillStyle = i % 4 === 0 ? '#0f5a3a' : long ? '#d9ae4a' : '#1f7a52';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        ctx.lineTo(cx + Math.cos(a + 0.2) * 26, cy + Math.sin(a + 0.2) * 26);
        ctx.lineTo(cx + Math.cos(a - 0.2) * 26, cy + Math.sin(a - 0.2) * 26);
        ctx.fill();
      }
      ring(30, '#0f5a3a');
      ring(22, '#d9ae4a');
      ctx.fillStyle = '#0f5a3a';
      fitText(ctx, 'MGM', cx, cy + 1, 16, 40, deco);
    }
    // sportsbook odds board (scrolled by the LED shader)
    {
      const [x, y, w, h] = A.odds;
      ctx.fillStyle = '#04060a';
      ctx.fillRect(x, y, w, h);
      const games = [
        ['NFL', 'LAS VEGAS', 'KANSAS CITY', '-3.5', '+145'],
        ['NFL', 'DENVER', 'BUFFALO', '+6', '-110'],
        ['NBA', 'BOSTON', 'PHOENIX', '-4', 'O 224'],
        ['NHL', 'VEGAS', 'EDMONTON', '-1.5', '+170'],
        ['MLB', 'LOS ANGELES', 'SAN DIEGO', '-125', 'O 8.5'],
        ['UFC', 'MAIN EVENT', 'T-MOBILE', '-210', '+175'],
        ['NCAAF', 'UNLV', 'BOISE ST', '+2.5', '-105'],
        ['PGA', 'FIELD', 'THE FAVOURITE', '+600', ''],
      ];
      ctx.textBaseline = 'middle';
      games.forEach((g, i) => {
        const yy = y + 22 + i * 38;
        ctx.fillStyle = i % 2 ? '#0c1420' : '#081018';
        ctx.fillRect(x, yy - 18, w, 36);
        ctx.font = `bold 15px ${deco}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#d9b25a';
        ctx.fillText(g[0], x + 10, yy);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 16px ${deco}`;
        ctx.fillText(`${g[1]} @ ${g[2]}`, x + 70, yy);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#4aff8a';
        ctx.fillText(g[3], x + w - 90, yy);
        ctx.fillStyle = '#ffd24a';
        ctx.fillText(g[4], x + w - 12, yy);
      });
    }
    // habitat backdrop: savanna at golden hour
    {
      const [x, y, w, h] = A.savanna;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, '#6aa8e0');
      g.addColorStop(0.55, '#f4c88a');
      g.addColorStop(0.75, '#e8a860');
      g.addColorStop(1, '#b8a058');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,240,200,0.9)';
      ctx.beginPath();
      ctx.arc(x + w * 0.7, y + h * 0.56, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9a9a6a';
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.72);
      for (let i = 0; i <= 12; i++) ctx.lineTo(x + (i / 12) * w, y + h * (0.68 + 0.04 * Math.sin(i * 1.7)));
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.fill();
      ctx.fillStyle = '#3a3020';
      for (const [ax, s] of [
        [0.18, 1],
        [0.46, 0.7],
        [0.86, 0.85],
      ]) {
        const tx = x + w * ax;
        const ty = y + h * 0.7;
        ctx.fillRect(tx - 2 * s, ty - 40 * s, 4 * s, 40 * s);
        ctx.beginPath();
        ctx.ellipse(tx, ty - 44 * s, 38 * s, 9 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // ticker
    {
      const [x, y, w, h] = A.ticker;
      ctx.fillStyle = '#020406';
      ctx.fillRect(x, y, w, h);
      ctx.font = `bold 26px ${deco}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const items = ['LV -3.5', 'VGK -1.5', 'BOS -4', 'UNLV +2.5', 'KC +145', 'O/U 224', 'LAD -125', 'PARLAY 12-1'];
      let px = x + 10;
      items.forEach((s, i) => {
        ctx.fillStyle = i % 2 ? '#ffd24a' : '#4aff8a';
        ctx.fillText(s, px, y + h / 2);
        px += ctx.measureText(s).width + 26;
        ctx.fillStyle = '#d9b25a';
        ctx.fillText('◆', px - 20, y + h / 2);
      });
    }
  });
  return _atlas;
}

let _marble: THREE.CanvasTexture | null = null;
function marbleTex(): THREE.CanvasTexture {
  if (_marble) return _marble;
  _marble = canvasTex(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#efe8da';
      ctx.fillRect(0, 0, w, h);
      const r = prng(41);
      for (let i = 0; i < 40; i++) {
        ctx.strokeStyle = `rgba(150,140,120,${0.08 + r() * 0.12})`;
        ctx.lineWidth = 1 + r() * 2;
        ctx.beginPath();
        let x = r() * w;
        let y = r() * h;
        ctx.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += (r() - 0.5) * 120;
          y += (r() - 0.3) * 90;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // 2 x 2 slabs with emerald inlay joints and gold dots
      ctx.strokeStyle = '#0f5a3a';
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.fillStyle = '#d9ae4a';
      for (const [x, y] of [
        [0, 0],
        [w / 2, 0],
        [0, h / 2],
        [w / 2, h / 2],
      ]) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-9, -9, 18, 18);
        ctx.restore();
      }
    },
    true
  );
  return _marble;
}

let _dome: THREE.CanvasTexture | null = null;
/** The rotunda dome: deco coffers (u around, v equator→oculus). */
function domeTex(): THREE.CanvasTexture {
  if (_dome) return _dome;
  _dome = canvasTex(1024, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, '#0c3a26');
    g.addColorStop(0.75, '#12583a');
    g.addColorStop(1, '#fff2c8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const cols = 24;
    const rows = [
      [0.1, 0.3],
      [0.34, 0.5],
      [0.54, 0.66],
      [0.7, 0.78],
    ];
    for (let c = 0; c < cols; c++) {
      const x0 = (c / cols) * w;
      const cw = w / cols;
      rows.forEach(([v0, v1], ri) => {
        const y0 = h * (1 - v1);
        const y1 = h * (1 - v0);
        ctx.fillStyle = '#d9ae4a';
        ctx.fillRect(x0 + 3, y0, cw - 6, y1 - y0);
        ctx.fillStyle = ri % 2 ? '#0e4a30' : '#0a3a24';
        ctx.fillRect(x0 + 8, y0 + 5, cw - 16, y1 - y0 - 10);
        ctx.fillStyle = '#e8c25a';
        ctx.beginPath();
        ctx.arc(x0 + cw / 2, (y0 + y1) / 2, Math.min(cw, y1 - y0) * 0.16, 0, Math.PI * 2);
        ctx.fill();
      });
      // gold rib between coffers up to the oculus
      ctx.fillStyle = '#b88a2a';
      ctx.fillRect(x0 - 2, h * 0.2, 4, h * 0.8);
    }
    // deco frieze band at the springline
    ctx.fillStyle = '#b88a2a';
    ctx.fillRect(0, h * 0.9, w, h * 0.1);
    ctx.fillStyle = '#0c3a26';
    for (let i = 0; i < 64; i++) {
      const x = (i / 64) * w;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + w / 128, h * 0.92);
      ctx.lineTo(x + w / 64, h);
      ctx.fill();
    }
    // oculus glow
    const og = ctx.createLinearGradient(0, 0, 0, h * 0.22);
    og.addColorStop(0, '#fffbe8');
    og.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = og;
    ctx.fillRect(0, 0, w, h * 0.22);
  });
  return _dome;
}

/** Flip a geometry so its faces point the other way (an open cylinder seen from inside). */
function insideOut<T extends THREE.BufferGeometry>(g: T): T {
  const idx = g.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

// ------------------------------------------------------------------ lions
type LionPose = 'stand' | 'lie' | 'sit' | 'sleep';
interface LionSpec {
  pose: LionPose;
  scale: number;
  mane: boolean;
  phase: number;
  /** Head turns to follow the cat instead of idling. */
  watch?: boolean;
  coat?: number;
  maneCol?: number;
}
interface LionPiece {
  g: THREE.BufferGeometry;
  c: number;
  part: number; // 0 torso (breathes) · 1 head (idles) · 2 tail (swishes) · 3 head that watches Lou · 4 static
  piv: THREE.Vector3;
}

/** A lion facing local +x, standing on y = 0 (adult ≈ 2 m long). */
function lionPieces(o: LionSpec): LionPiece[] {
  const out: LionPiece[] = [];
  const coat = o.coat ?? 0xc8954a;
  const belly = new THREE.Color(coat).lerp(new THREE.Color(0xfff0d0), 0.35).getHex();
  const maneCol = o.maneCol ?? 0x8a5a2a;
  const dark = 0x2a1a12;
  const ell = (rx: number, ry: number, rz: number, x: number, y: number, z: number, c: number, part: number, piv: THREE.Vector3, rotZ = 0, seg = 12) => {
    const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)));
    g.scale(rx, ry, rz);
    if (rotZ) g.rotateZ(rotZ);
    g.translate(x, y, z);
    out.push({ g, c, part, piv });
  };
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, c: number, part: number, piv: THREE.Vector3) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = Math.max(0.01, d.length());
    const g = new THREE.CylinderGeometry(r1, r0, len, 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    out.push({ g, c, part, piv });
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const ZERO = V(0, 0, 0);
  const headPart = o.watch ? 3 : 1;
  const head = (hx: number, hy: number, hz: number, neck: THREE.Vector3, tilt = 0) => {
    const p = headPart;
    if (o.mane) {
      ell(0.26, 0.5, 0.48, hx - 0.14, hy - 0.04, hz, maneCol, p, neck, tilt, 12);
      ell(0.34, 0.4, 0.36, hx - 0.34, hy - 0.3, hz, maneCol, p, neck, 0, 10);
    }
    ell(0.27, 0.26, 0.24, hx, hy, hz, coat, p, neck, tilt);
    ell(0.17, 0.12, 0.15, hx + 0.22, hy - 0.08 + tilt * 0.2, hz, belly, p, neck);
    ell(0.06, 0.045, 0.07, hx + 0.37, hy - 0.03 + tilt * 0.3, hz, dark, p, neck, 0, 6);
    for (const s of [-1, 1]) {
      ell(0.07, 0.085, 0.04, hx - 0.06, hy + 0.24, hz + s * 0.16, coat, p, neck, 0, 6);
      ell(0.03, 0.03, 0.03, hx + 0.2, hy + 0.07 + tilt * 0.2, hz + s * 0.1, dark, p, neck, 0, 5);
    }
  };
  const tail = (pts: THREE.Vector3[]) => {
    const piv = pts[0];
    for (let i = 0; i < pts.length - 1; i++) limb(pts[i], pts[i + 1], 0.055, 0.045, coat, 2, piv);
    const e = pts[pts.length - 1];
    ell(0.08, 0.12, 0.08, e.x, e.y, e.z, maneCol, 2, piv, 0, 6);
  };
  const paw = (x: number, z: number) => ell(0.15, 0.07, 0.11, x, 0.06, z, belly, 4, ZERO, 0, 8);
  if (o.pose === 'stand') {
    const piv = V(0, 1.0, 0);
    ell(0.85, 0.42, 0.4, 0, 1.0, 0, coat, 0, piv);
    ell(0.45, 0.5, 0.42, 0.55, 1.05, 0, coat, 0, piv);
    ell(0.42, 0.45, 0.4, -0.6, 0.98, 0, coat, 0, piv);
    ell(0.7, 0.2, 0.3, 0, 0.72, 0, belly, 0, piv);
    for (const s of [-1, 1]) {
      limb(V(0.6, 0.95, s * 0.2), V(0.64, 0.06, s * 0.2), 0.14, 0.11, coat, 4, ZERO);
      paw(0.72, s * 0.2);
      limb(V(-0.62, 0.9, s * 0.22), V(-0.72, 0.06, s * 0.2), 0.17, 0.1, coat, 4, ZERO);
      paw(-0.64, s * 0.2);
    }
    const neck = V(0.75, 1.25, 0);
    ell(0.3, 0.36, 0.3, 0.86, 1.32, 0, coat, headPart, neck);
    head(1.08, 1.52, 0, neck);
    tail([V(-0.98, 1.05, 0), V(-1.35, 0.7, 0), V(-1.5, 0.3, 0.06)]);
  } else if (o.pose === 'sit') {
    const piv = V(-0.05, 0.9, 0);
    ell(0.45, 0.66, 0.4, -0.08, 0.82, 0, coat, 0, piv, 0.5);
    ell(0.38, 0.5, 0.4, 0.2, 1.08, 0, coat, 0, piv);
    ell(0.52, 0.38, 0.48, -0.35, 0.38, 0, coat, 0, piv);
    ell(0.25, 0.4, 0.3, 0.3, 0.9, 0, belly, 0, piv);
    for (const s of [-1, 1]) {
      ell(0.42, 0.2, 0.15, -0.2, 0.22, s * 0.44, coat, 4, ZERO);
      paw(0.18, s * 0.46);
      limb(V(0.35, 0.95, s * 0.18), V(0.42, 0.06, s * 0.18), 0.13, 0.1, coat, 4, ZERO);
      paw(0.5, s * 0.18);
    }
    const neck = V(0.3, 1.42, 0);
    ell(0.28, 0.34, 0.28, 0.36, 1.5, 0, coat, headPart, neck);
    head(0.52, 1.74, 0, neck);
    tail([V(-0.7, 0.2, 0), V(-0.95, 0.06, 0.35), V(-0.6, 0.05, 0.78), V(-0.2, 0.05, 0.85)]);
  } else {
    // lie (sphinx) / sleep (head down on the paws)
    const piv = V(-0.1, 0.42, 0);
    ell(0.9, 0.36, 0.42, -0.1, 0.42, 0, coat, 0, piv);
    ell(0.42, 0.42, 0.42, 0.45, 0.55, 0, coat, 0, piv);
    ell(0.46, 0.36, 0.46, -0.72, 0.42, 0, coat, 0, piv);
    for (const s of [-1, 1]) {
      limb(V(0.5, 0.3, s * 0.2), V(1.12, 0.1, s * 0.22), 0.12, 0.1, coat, 4, ZERO);
      paw(1.2, s * 0.22);
      ell(0.4, 0.2, 0.15, -0.55, 0.22, s * 0.44, coat, 4, ZERO);
      paw(-0.2, s * 0.47);
    }
    const sleep = o.pose === 'sleep';
    const neck = sleep ? V(0.7, 0.5, 0) : V(0.62, 0.72, 0);
    ell(0.28, 0.3, 0.28, sleep ? 0.82 : 0.75, sleep ? 0.52 : 0.8, 0, coat, headPart, neck);
    if (sleep) head(1.08, 0.34, 0.06, neck, -0.25);
    else head(1.0, 1.0, 0, neck);
    tail([V(-1.12, 0.42, 0), V(-1.55, 0.12, 0.25), V(-1.85, 0.07, 0.7), V(-1.7, 0.07, 1.05)]);
  }
  return out;
}

/** Lions merged into one geometry with per-vertex pivots/parts for the idle-animation shader. */
function lionGeometry(list: Array<{ x: number; y: number; z: number; ry: number; spec: LionSpec }>): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();
  const m = new THREE.Matrix4();
  for (const l of list) {
    m.makeRotationY(l.ry).scale(new THREE.Vector3(l.spec.scale, l.spec.scale, l.spec.scale)).setPosition(l.x, l.y, l.z);
    for (const p of lionPieces(l.spec)) {
      const g = p.g;
      g.deleteAttribute('uv');
      g.applyMatrix4(m);
      const piv = p.piv.clone().applyMatrix4(m);
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      const pv = new Float32Array(n * 4);
      const pt = new Float32Array(n);
      col.setHex(p.c);
      for (let i = 0; i < n; i++) {
        c.set([col.r, col.g, col.b], i * 3);
        pv.set([piv.x, piv.y, piv.z, l.spec.phase], i * 4);
        pt[i] = p.part;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.setAttribute('aPiv', new THREE.BufferAttribute(pv, 4));
      g.setAttribute('aPart', new THREE.BufferAttribute(pt, 1));
      geos.push(g.index ? g.toNonIndexed() : g);
    }
  }
  const out = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  out.computeBoundingSphere();
  return out;
}

const lionLook = { value: 0 };
let _lionMat: THREE.MeshStandardMaterial | null = null;
function lionMat(): THREE.MeshStandardMaterial {
  if (_lionMat) return _lionMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = themeClock;
    sh.uniforms.uLook = lionLook;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aPiv;\nattribute float aPart;\nuniform float uTime;\nuniform float uLook;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec3 d = transformed - aPiv.xyz;
        float ph = aPiv.w;
        if ( aPart < 0.5 ) {
          float br = 1.0 + 0.03 * sin( uTime * 1.25 + ph );
          d.y *= br;
          d.z *= br;
        } else if ( aPart < 3.5 ) {
          float ang = aPart < 1.5 ? sin( uTime * 0.31 + ph ) * 0.4 + sin( uTime * 0.13 + ph * 2.0 ) * 0.2
                    : aPart < 2.5 ? sin( uTime * 1.6 + ph ) * 0.5 + sin( uTime * 0.7 + ph ) * 0.2
                    : uLook;
          float c = cos( ang );
          float s = sin( ang );
          d = vec3( c * d.x + s * d.z, d.y, -s * d.x + c * d.z );
        }
        transformed = aPiv.xyz + d;
      }`
    );
  };
  m.customProgramCacheKey = () => 'mgmLionIdle';
  _lionMat = m;
  return m;
}

/** Gold statue lion (static, merged into a kit). */
function goldLionInto(k: Kit, m: THREE.Material, x: number, y: number, z: number, ry: number, scale: number): void {
  const mm = new THREE.Matrix4().makeRotationY(ry).scale(new THREE.Vector3(scale, scale, scale)).setPosition(x, y, z);
  for (const p of lionPieces({ pose: 'stand', scale, mane: true, phase: 0 })) {
    p.g.applyMatrix4(mm);
    k.add(p.g, m, 0xffffff);
  }
}

// ------------------------------------------------------------------ BetMGM LED wall
let _ledMat: THREE.ShaderMaterial | null = null;
function ledWallMat(): THREE.ShaderMaterial {
  if (_ledMat) return _ledMat;
  const r = (p: Px) => new THREE.Vector4(p[0] / AT[0], 1 - (p[1] + p[3]) / AT[1], p[2] / AT[0], p[3] / AT[1]);
  _ledMat = new THREE.ShaderMaterial({
    uniforms: { uTime: themeClock, uMap: { value: atlas() }, uOdds: { value: r(A.odds) }, uLogo: { value: r(A.betmgm) }, uTick: { value: r(A.ticker) }, uAsp: { value: 4.0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uMap;
      uniform vec4 uOdds;
      uniform vec4 uLogo;
      uniform vec4 uTick;
      uniform float uAsp;
      varying vec2 vUv;
      float h1( float n ) { return fract( sin( n ) * 43758.5453123 ); }
      float dot2( vec2 p, vec2 c, float r, float asp ) { vec2 d = ( p - c ) * vec2( asp, 1.0 ); return 1.0 - smoothstep( r * 0.6, r, length( d ) ); }
      float inR( vec2 p, vec4 r ) { return step( r.x, p.x ) * step( p.x, r.z ) * step( r.y, p.y ) * step( p.y, r.w ); }
      vec2 loc( vec2 p, vec4 r ) { return ( p - r.xy ) / max( r.zw - r.xy, vec2( 1e-4 ) ); }
      vec3 football( vec2 q, float t, float asp ) {
        float x = q.x * 0.7 + 0.15 + 0.12 * sin( t * 0.11 );
        vec3 c = mix( vec3( 0.06, 0.32, 0.1 ), vec3( 0.09, 0.4, 0.13 ), step( 0.5, fract( x * 10.0 ) ) );
        float fl = fract( x * 10.0 );
        c = mix( c, vec3( 0.92 ), ( 1.0 - smoothstep( 0.015, 0.04, min( fl, 1.0 - fl ) ) ) * step( 0.08, q.y ) * step( q.y, 0.92 ) );
        c = mix( c, vec3( 0.92 ), step( q.y, 0.06 ) + step( 0.94, q.y ) );
        float play = fract( t * 0.08 );
        for ( int i = 0; i < 11; i++ ) {
          float fi = float( i );
          vec2 a = vec2( 0.42 + 0.02 * sin( t * 0.9 + fi * 1.3 ) + 0.06 * h1( fi ) + play * 0.15, 0.14 + fi * 0.07 );
          vec2 b = vec2( 0.5 + 0.03 * sin( t * 0.8 + fi * 2.1 ) + 0.07 * h1( fi + 9.0 ) + play * 0.14, 0.16 + fi * 0.068 );
          c = mix( c, vec3( 0.8, 0.1, 0.12 ), dot2( vec2( x, q.y ), a, 0.022, asp ) );
          c = mix( c, vec3( 0.95, 0.95, 0.9 ), dot2( vec2( x, q.y ), b, 0.022, asp ) );
        }
        vec2 ball = vec2( 0.46 + play * 0.2, 0.5 + 0.25 * sin( play * 6.2832 ) );
        c = mix( c, vec3( 0.45, 0.25, 0.1 ), dot2( vec2( x, q.y ), ball, 0.012, asp ) );
        // score bug
        if ( q.y > 0.86 && q.y < 0.97 && q.x > 0.03 && q.x < 0.5 ) {
          c = vec3( 0.03, 0.04, 0.06 );
          if ( q.x < 0.13 ) c = vec3( 0.75, 0.62, 0.3 );
          else if ( q.x > 0.2 && q.x < 0.26 ) c = vec3( 0.75, 0.1, 0.12 );
          else if ( q.x > 0.34 && q.x < 0.4 ) c = vec3( 0.85 );
        }
        return c;
      }
      vec3 race( vec2 q, float t, float asp ) {
        vec3 c = mix( vec3( 0.35, 0.55, 0.85 ), vec3( 0.75, 0.85, 0.95 ), q.y );
        if ( q.y < 0.62 ) c = mix( vec3( 0.42, 0.28, 0.16 ), vec3( 0.5, 0.34, 0.2 ), step( 0.5, fract( q.y * 9.0 ) ) );
        if ( q.y < 0.62 && q.y > 0.58 ) c = vec3( 0.95 );
        if ( q.y < 0.08 ) c = vec3( 0.12, 0.4, 0.15 );
        for ( int i = 0; i < 6; i++ ) {
          float fi = float( i );
          float px = fract( t * ( 0.05 + 0.006 * fi ) + h1( fi ) * 0.2 );
          vec2 p = vec2( px, 0.14 + fi * 0.075 );
          c = mix( c, vec3( 0.18, 0.1, 0.05 ), dot2( q, p, 0.045, asp ) );
          c = mix( c, vec3( h1( fi + 3.0 ), h1( fi + 5.0 ), h1( fi + 7.0 ) ), dot2( q, p + vec2( 0.0, 0.03 ), 0.018, asp ) );
        }
        return c;
      }
      vec3 hoops( vec2 q, float t, float asp ) {
        vec3 c = mix( vec3( 0.75, 0.5, 0.25 ), vec3( 0.8, 0.56, 0.3 ), step( 0.5, fract( q.x * 14.0 ) ) );
        float cc = abs( length( ( q - 0.5 ) * vec2( asp, 1.0 ) ) - 0.14 );
        c = mix( c, vec3( 0.95 ), 1.0 - smoothstep( 0.008, 0.016, cc ) );
        c = mix( c, vec3( 0.95 ), 1.0 - smoothstep( 0.004, 0.01, abs( q.x - 0.5 ) ) );
        c = mix( c, vec3( 0.1, 0.25, 0.6 ), step( q.x, 0.12 ) * step( 0.3, q.y ) * step( q.y, 0.7 ) );
        c = mix( c, vec3( 0.1, 0.25, 0.6 ), step( 0.88, q.x ) * step( 0.3, q.y ) * step( q.y, 0.7 ) );
        for ( int i = 0; i < 10; i++ ) {
          float fi = float( i );
          vec2 p = vec2( 0.5 + 0.3 * sin( t * 0.4 + fi * 0.9 ) * ( i < 5 ? 1.0 : 0.8 ), 0.5 + 0.3 * sin( t * 0.55 + fi * 2.3 ) );
          c = mix( c, i < 5 ? vec3( 0.95, 0.85, 0.2 ) : vec3( 0.3, 0.1, 0.5 ), dot2( q, p, 0.035, asp ) );
        }
        return c;
      }
      void main() {
        vec2 p = vUv;
        float t = uTime;
        vec3 col = vec3( 0.01 );
        vec4 rT = vec4( 0.0, 0.0, 1.0, 0.09 );
        vec4 rL = vec4( 0.005, 0.8, 0.18, 0.99 );
        vec4 rO = vec4( 0.005, 0.11, 0.18, 0.78 );
        vec4 rM = vec4( 0.19, 0.11, 0.71, 0.99 );
        vec4 rH = vec4( 0.72, 0.56, 0.995, 0.99 );
        vec4 rB = vec4( 0.72, 0.11, 0.995, 0.54 );
        if ( inR( p, rT ) > 0.5 ) {
          vec2 q = loc( p, rT );
          vec2 uv = uTick.xy + vec2( fract( q.x * 2.0 + t * 0.06 ), q.y ) * uTick.zw;
          col = texture2D( uMap, uv ).rgb;
        } else if ( inR( p, rL ) > 0.5 ) {
          vec2 q = loc( p, rL );
          col = texture2D( uMap, uLogo.xy + q * uLogo.zw ).rgb;
        } else if ( inR( p, rO ) > 0.5 ) {
          vec2 q = loc( p, rO );
          float v = fract( q.y * 0.5 - t * 0.03 );
          col = texture2D( uMap, uOdds.xy + vec2( q.x, v ) * uOdds.zw ).rgb;
        } else if ( inR( p, rM ) > 0.5 ) {
          vec2 q = loc( p, rM );
          col = football( q, t, uAsp * ( rM.z - rM.x ) / ( rM.w - rM.y ) );
        } else if ( inR( p, rH ) > 0.5 ) {
          vec2 q = loc( p, rH );
          col = race( q, t, uAsp * ( rH.z - rH.x ) / ( rH.w - rH.y ) );
        } else if ( inR( p, rB ) > 0.5 ) {
          vec2 q = loc( p, rB );
          col = hoops( q, t, uAsp * ( rB.z - rB.x ) / ( rB.w - rB.y ) );
        }
        // LED pixel grid
        vec2 px = fract( p * vec2( 640.0, 160.0 ) );
        col *= 0.78 + 0.22 * step( 0.12, px.x ) * step( 0.12, px.y );
        gl_FragColor = vec4( col * 0.92, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return _ledMat;
}

// ------------------------------------------------------------------ a doorway dressed like the kit's Strip entrances
function stripDoorway(b: WorldBuilder, xFace: number, zc: number, width: number, out: 1 | -1, height: number, wall: THREE.Material): void {
  const t = 1.2;
  const lintelY = 4.6;
  const z0 = zc - width / 2;
  const z1 = zc + width / 2;
  b.add(mesh(new THREE.BoxGeometry(t, height - lintelY, width), wall, xFace, lintelY + (height - lintelY) / 2, zc, true));
  b.collider(xFace - t / 2, xFace + t / 2, z0, z1, lintelY, height, true);
  const brass = mat(0xd4a640, 0.3, 0.85);
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfdcea, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const leaf = 1.5;
  for (const sgn of [-1, 1]) {
    const edge = sgn < 0 ? z0 : z1;
    for (const k of [0, 1]) {
      const n = t / 2 + 0.1 + leaf / 2 + k * 0.02;
      b.add(mesh(new THREE.BoxGeometry(leaf, 3.8, 0.05), glass, xFace + out * n, 1.95, edge - sgn * 0.12 + sgn * (0.05 + k * 0.08)));
      b.add(mesh(new THREE.BoxGeometry(leaf, 0.08, 0.07), brass, xFace + out * n, 1.0, edge - sgn * 0.12 + sgn * (0.05 + k * 0.08)));
    }
    b.add(mesh(new THREE.BoxGeometry(t + 0.14, lintelY, 0.3), brass, xFace, lintelY / 2, edge));
  }
  b.add(mesh(new THREE.BoxGeometry(t + 0.12, 0.24, width), basic(0xffd27a), xFace, lintelY, zc));
  // runner
  b.add(mesh(new THREE.BoxGeometry(7.4, 0.03, Math.min(width - 1.2, 4)), mat(0x0f4a2a, 0.95), xFace + out * 3.4, 0.045, zc));
  for (const s of [-1, 1]) b.add(mesh(new THREE.BoxGeometry(7.4, 0.035, 0.12), brass, xFace + out * 3.4, 0.05, zc + s * (Math.min(width - 1.2, 4) / 2 + 0.06)));
}

// ------------------------------------------------------------------ the Lion Rotunda
export function buildMGMRotunda(b: WorldBuilder, wallMat: THREE.Material): void {
  const x0 = MGM.rx0;
  const x1 = MGM.x0;
  const z0 = MGM.rz0;
  const z1 = MGM.rz1;
  const H = MGM.h;
  const T = 1.2;
  const dz0 = MGM.door - MGM.stripDoorW / 2;
  const dz1 = MGM.door + MGM.stripDoorW / 2;
  // shell: west wall with the Strip doors, north + south walls, roof (east side = the casino's west wall)
  b.box(x0, 0, (z0 + dz0) / 2, T, H, dz0 - z0, wallMat, true, true);
  b.box(x0, 0, (dz1 + z1) / 2, T, H, z1 - dz1, wallMat, true, true);
  b.box((x0 + x1) / 2, 0, z0, x1 - x0, H, T, wallMat, true, true);
  b.box((x0 + x1) / 2, 0, z1, x1 - x0, H, T, wallMat, true, true);
  b.box((x0 + x1) / 2, H, (z0 + z1) / 2, x1 - x0 + 1.2, 0.8, z1 - z0 + 1.2, mat(0x24362c, 0.8), false, true);
  stripDoorway(b, x0, MGM.door, MGM.stripDoorW, -1, H, wallMat);
  // the camera stays under the springline of the dome
  b.collider(x0, x1, z0, z1, 8.3, 8.7);
  // pedestal + statue collider
  const cx = MGM.cx;
  const cz = MGM.cz;
  b.collider(cx - 1.75, cx + 1.75, cz - 1.75, cz + 1.75, 0, 3.4, true);
  b.collider(cx - 2.3, cx + 2.3, cz - 0.9, cz + 0.9, 3.4, 6.2, true);
  // columns
  const colR = 7.3;
  const colAt: Array<[number, number]> = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
    const x = cx + Math.cos(a) * colR;
    const z = cz + Math.sin(a) * colR;
    colAt.push([x, z]);
    b.collider(x - 0.55, x + 0.55, z - 0.55, z + 0.55, 0, 8.3, true);
  }
  b.zone('MGM Grand Casino • Lion Rotunda', x0, x1, z0, z1);
  b.pickup(cx - 2.4, 0.45, cz + 1.4, 3, 'Golden Lion Pack', true);
  b.crowd.performers.push({ kind: 'showgirl', x: 61.5, z: 409.2, facing: -Math.PI / 2 });
  b.crowd.tourists.push(
    { pts: [[46.5, 413.5], [52, 411], [60.5, 411], [66, 414], [60.5, 419.2], [52, 419.2]], prop: 'camera' },
    { pts: [[47, 416.5], [53.5, 420.5], [63.5, 416.5], [53.5, 410]], prop: 'bag' }
  );

  const gate: GateBox = {
    minX: x0,
    maxX: x1,
    minZ: z0,
    maxZ: z1,
    height: H,
    doors: [
      { x: x0, z: MGM.door, nx: -1, nz: 0, half: MGM.stripDoorW / 2 },
      { x: x1, z: MGM.door, nx: 1, nz: 0, half: MGM.innerDoorW / 2 },
    ],
  };
  lazyInterior(b, 'interior:mgm-rotunda', gate, (group) => {
    const k = new Kit();
    const ix0 = x0 + 0.6;
    const ix1 = x1 - 0.6;
    const iz0 = z0 + 0.6;
    const iz1 = z1 - 0.6;
    const W = ix1 - ix0;
    const D = iz1 - iz0;
    const springY = 8.9;
    const gold = vcMat(0.25, 0.9);
    const emerald = vcMat(0.25, 0.15);
    // floor: marble slabs + the compass-star medallion under the lion
    const fl = new THREE.PlaneGeometry(W, D);
    fl.rotateX(-Math.PI / 2);
    uvScale(fl, W / 4, D / 4);
    k.add(fl, mapLit(marbleTex(), 0.25, 0.05), 0xffffff, (ix0 + ix1) / 2, 0.035, (iz0 + iz1) / 2);
    const md = new THREE.CircleGeometry(6.6, 48);
    md.rotateX(-Math.PI / 2);
    const uv = md.attributes.uv as THREE.BufferAttribute;
    const pos = md.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 13.2 + 0.5, -pos.getZ(i) / 13.2 + 0.5);
    uvTo(md, A.medallion, AT);
    k.add(md, mapLit(atlas(), 0.3, 0.05), 0xffffff, cx, 0.04, cz);
    // walls: emerald with gold deco fluting, a dark wainscot and a glowing cove under the ceiling
    const walls: Array<{ x: number; z: number; len: number; ry: number; gaps: Array<[number, number]> }> = [
      { x: ix0, z: (iz0 + iz1) / 2, len: D, ry: Math.PI / 2, gaps: [[dz0 - iz0 - 0.3, dz1 - iz0 + 0.3]] },
      { x: (ix0 + ix1) / 2, z: iz0, len: W, ry: 0, gaps: [] },
      { x: (ix0 + ix1) / 2, z: iz1, len: W, ry: Math.PI, gaps: [] },
      { x: ix1, z: (iz0 + iz1) / 2, len: D, ry: -Math.PI / 2, gaps: [[MGM.door - MGM.innerDoorW / 2 - iz0 - 0.3, MGM.door + MGM.innerDoorW / 2 - iz0 + 0.3]] },
    ];
    for (const w of walls) {
      k.at(w.x, 0, w.z, w.ry, () => {
        const segs: Array<[number, number]> = [];
        let cur = 0;
        // local x runs along the wall; for the west/east walls local +x is world −z / +z (flip gaps accordingly)
        const flip = w.ry === Math.PI / 2 || w.ry === Math.PI;
        const gaps = w.gaps.map(([a, c]) => (flip ? ([w.len - c, w.len - a] as [number, number]) : ([a, c] as [number, number])));
        for (const [a, c] of gaps.sort((p, q) => p[0] - q[0])) {
          if (a > cur) segs.push([cur, a]);
          cur = Math.max(cur, c);
        }
        if (cur < w.len) segs.push([cur, w.len]);
        for (const [a, c] of segs) {
          const len = c - a;
          const mid = a + len / 2 - w.len / 2;
          k.box(vcMat(0.5), 0x0a2a1a, mid, 0.6, 0.05, len, 1.2, 0.1);
          k.box(gold, 0xd9ae4a, mid, 1.23, 0.1, len, 0.07, 0.12);
          k.quad(vcMat(0.55), 0x14523a, mid, (1.26 + springY) / 2, 0.02, len, springY - 1.26);
          k.box(glowMat(), 0x9affd0, mid, 8.05, 0.2, len, 0.05, 0.05);
          k.box(gold, 0xd9ae4a, mid, 8.2, 0.12, len, 0.18, 0.2);
          for (let u = a + 1.1; u < c - 0.8; u += 1.6) {
            k.box(gold, 0xc8a040, u - w.len / 2, 4.6, 0.06, 0.08, 6.4, 0.06);
            k.box(glowMat(), 0x5affb0, u - w.len / 2 + 0.8, 4.6, 0.05, 0.03, 5.6, 0.02);
          }
        }
      });
    }
    // deco sunbursts over both doorways and the MGM GRAND CASINO header over the inner door
    const sb = (x: number, z: number, ry: number) =>
      k.at(x, 0, z, ry, () => {
        const g = new THREE.PlaneGeometry(4.2, 4.2);
        uvTo(g, A.sunburst, AT);
        k.add(g, mapGlow(atlas()), 0xd8d8d8, 0, 6.75, 0.09);
      });
    sb(ix0, MGM.door, Math.PI / 2);
    k.at(ix1, 0, MGM.door, -Math.PI / 2, () => {
      const g = new THREE.PlaneGeometry(6.4, 1.6);
      uvTo(g, A.casino, AT);
      k.add(g, mapGlow(atlas()), 0xffffff, 0, 6.2, 0.12);
      k.box(gold, 0xd9ae4a, 0, 6.2, 0.06, 6.7, 1.9, 0.08);
      // gold proscenium round the arch into the casino
      for (const s of [-1, 1]) k.box(gold, 0xd9ae4a, s * (MGM.innerDoorW / 2 + 0.35), 2.6, 0.2, 0.5, 5.2, 0.3);
      k.box(gold, 0xd9ae4a, 0, 5.3, 0.2, MGM.innerDoorW + 1.2, 0.35, 0.3);
    });
    for (const [x, z, ry] of [
      [(ix0 + ix1) / 2, iz0, 0],
      [(ix0 + ix1) / 2, iz1, Math.PI],
    ] as Array<[number, number, number]>) {
      for (const dx of [-7.5, 7.5]) sb(x + dx * (ry ? -1 : 1), z, ry);
      // Hollywood posters between
      k.at(x, 0, z, ry, () => {
        [A.poster0, A.poster1, A.poster2].forEach((r, i) => {
          const g = new THREE.PlaneGeometry(1.5, 2.25);
          uvTo(g, r, AT);
          k.add(g, mapGlow(atlas()), 0xd0d0d0, -2.6 + i * 2.6, 3.0, 0.1);
          k.box(gold, 0xd9ae4a, -2.6 + i * 2.6, 3.0, 0.06, 1.7, 2.45, 0.06);
          k.box(glowMat(), 0xfff0c8, -2.6 + i * 2.6, 4.35, 0.2, 1.2, 0.05, 0.1);
        });
      });
    }
    // columns: emerald shafts, stepped gold deco bases and capitals
    for (const [x, z] of colAt) {
      k.cyl(emerald, 0x0f5a3a, x, 4.15, z, 0.46, 0.46, 8.3, 16);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        k.box(gold, 0xd9ae4a, x + Math.cos(a) * 0.47, 4.15, z + Math.sin(a) * 0.47, 0.05, 6.6, 0.05, -a);
      }
      k.box(gold, 0xd9ae4a, x, 0.2, z, 1.25, 0.4, 1.25);
      k.box(gold, 0xd9ae4a, x, 0.5, z, 1.05, 0.2, 1.05);
      k.box(gold, 0xd9ae4a, x, 7.9, z, 1.1, 0.25, 1.1);
      k.box(gold, 0xd9ae4a, x, 8.15, z, 1.35, 0.25, 1.35);
      k.box(glowMat(), 0xfff0c0, x, 0.62, z, 0.9, 0.04, 0.9);
    }
    // ring entablature + flat ceiling round the dome, then the coffered dome with its oculus
    const ringM = new THREE.CylinderGeometry(colR + 0.7, colR + 0.7, 0.6, 64, 1, true);
    k.add(ringM, gold, 0xd9ae4a, cx, springY - 0.3, cz);
    const ringIn = insideOut(new THREE.CylinderGeometry(colR - 0.3, colR - 0.3, 0.6, 64, 1, true));
    k.add(ringIn, gold, 0xd9ae4a, cx, springY - 0.3, cz);
    const lip = new THREE.RingGeometry(colR - 0.3, colR + 0.7, 64);
    lip.rotateX(Math.PI / 2);
    k.add(lip, gold, 0xb88a2a, cx, springY - 0.6, cz);
    const glowRing = new THREE.TorusGeometry(colR + 0.72, 0.04, 4, 64);
    glowRing.rotateX(Math.PI / 2);
    k.add(glowRing, glowMat(), 0x9affd0, cx, springY - 0.62, cz);
    const shape = new THREE.Shape();
    shape.moveTo(ix0 - cx, iz0 - cz);
    shape.lineTo(ix1 - cx, iz0 - cz);
    shape.lineTo(ix1 - cx, iz1 - cz);
    shape.lineTo(ix0 - cx, iz1 - cz);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, colR + 0.7, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const ceil = new THREE.ShapeGeometry(shape, 32);
    ceil.rotateX(Math.PI / 2);
    k.add(ceil, vcMat(0.7), 0x0a2418, cx, springY, cz);
    for (const [px, pz] of [
      [ix0 + 1.6, iz0 + 1.6],
      [ix1 - 1.6, iz0 + 1.6],
      [ix0 + 1.6, iz1 - 1.6],
      [ix1 - 1.6, iz1 - 1.6],
    ]) k.can(px, springY - 0.02, pz, 0.16, 0xfff0d0);
    const domeR = colR + 0.7;
    const dome = new THREE.SphereGeometry(domeR, 48, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const duv = dome.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < duv.count; i++) duv.setY(i, (duv.getY(i) - 0.5) * 2);
    dome.scale(1, 0.46, 1);
    const domeMat = new THREE.MeshBasicMaterial({ map: domeTex(), vertexColors: true, side: THREE.BackSide });
    k.add(dome, domeMat, 0xd8d8d8, cx, springY, cz);
    // pedestal: emerald drum with gold bands and up-lights; the golden lion strides toward the Strip
    k.cyl(gold, 0xd9ae4a, cx, 0.25, cz, 1.8, 1.9, 0.5, 32);
    k.cyl(emerald, 0x0c4a30, cx, 1.85, cz, 1.45, 1.5, 2.7, 32);
    for (const y of [0.9, 2.9]) k.cyl(gold, 0xd9ae4a, cx, y, cz, 1.53, 1.53, 0.12, 32);
    k.cyl(gold, 0xd9ae4a, cx, 3.3, cz, 1.7, 1.6, 0.25, 32);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.box(glowMat(), 0xfff2c8, cx + Math.cos(a) * 1.82, 0.52, cz + Math.sin(a) * 1.82, 0.3, 0.05, 0.3, -a);
    }
    const lionGold = new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 0.85, roughness: 0.26, emissive: 0x4a3208, emissiveIntensity: 1 });
    goldLionInto(k, lionGold, cx + 0.3, 3.42, cz, Math.PI, 1.35);
    const halo = new THREE.CircleGeometry(5.5, 32);
    halo.rotateX(-Math.PI / 2);
    k.add(halo, additiveMat(), 0x2a2008, cx, 0.05, cz);
    // brass stanchions round the plinth
    const rr = 2.8;
    ropeLine(k, cx - rr, cz - rr, cx + rr, cz - rr, 0xd9ae4a, 0x0f4a2a);
    ropeLine(k, cx + rr, cz + rr, cx - rr, cz + rr, 0xd9ae4a, 0x0f4a2a);
    // wayfinding: Grand Garden Arena + KÀ hang either side of the arch into the casino
    const hang = (r: Px, x: number, z: number, ry: number) => {
      k.at(x, 0, z, ry, () => {
        for (const s of [1, -1]) {
          const g = new THREE.PlaneGeometry(3.6, 0.68);
          uvTo(g, r, AT);
          k.add(g, mapGlow(atlas()), 0xe0e0e0, 0, 6.6, s * 0.07, s > 0 ? 0 : Math.PI);
        }
        k.box(vcMat(0.4, 0.5), 0x101410, 0, 6.6, 0, 3.7, 0.78, 0.12);
        for (const s of [-1, 1]) k.cyl(gold, 0xd9ae4a, s * 1.4, 7.95, 0, 0.015, 0.015, 1.9, 5);
      });
    };
    hang(A.arena, ix1 - 3.2, MGM.door - 6.2, -Math.PI / 2);
    hang(A.ka, ix1 - 3.2, MGM.door + 6.2, -Math.PI / 2);
    // potted palms in gold urns by the Strip doors
    for (const s of [-1, 1]) {
      const px = ix0 + 2.2;
      const pz = MGM.door + s * (MGM.stripDoorW / 2 + 1.3);
      k.cyl(gold, 0xd9ae4a, px, 0.5, pz, 0.55, 0.4, 1.0, 16);
      k.cyl(vcMat(0.9), 0x6a5a40, px, 1.4, pz, 0.08, 0.1, 1.8, 6);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const g = new THREE.ConeGeometry(0.26, 1.8, 4);
        g.rotateX(Math.PI / 2 + 0.6);
        g.translate(0, 0, 0.8);
        g.rotateY(a);
        k.add(g, vcMat(0.7), i % 2 ? 0x2a7a42 : 0x3a944e, px, 2.3, pz);
      }
    }
    k.flush(group);
    const ppl: PeopleLists = { seated: [], standing: [] };
    ppl.standing.push({ x: ix0 + 3.0, z: MGM.door - 3.2, rot: Math.PI / 2, shirt: 0x0f4a2a, vest: 0xd9ae4a }); // doorman
    ppl.standing.push({ x: cx - 3.6, z: cz - 2.2, rot: 0.6, shirt: GUEST_SHIRTS[2] });
    ppl.standing.push({ x: cx - 3.4, z: cz - 1.4, rot: 1.2, shirt: GUEST_SHIRTS[8] });
    ppl.standing.push({ x: cx + 1.2, z: cz + 3.6, rot: Math.PI, shirt: GUEST_SHIRTS[5] });
    buildPeople(group, 'stand', ppl.standing);
    return [];
  });
}

// ------------------------------------------------------------------ the casino floor's set pieces
/**
 * Called right after buildCasinoFloor for the MGM floor: registers colliders, pickups, bar spot and
 * routes now; builds the dressing lazily (gated like the kit's interior).
 */
export function mgmFloorSet(b: WorldBuilder, gate: GateBox, look: TableLook): void {
  const [bx, bz] = MGM.bar;
  const barR = 3.4;
  // center bar colliders (ring counter + back bar), like the kit's island bars
  b.collider(bx - barR - 0.35, bx + barR + 0.35, bz - 0.5, bz + 0.5, 0, 1.15, true);
  b.collider(bx - 0.5, bx + 0.5, bz - barR - 0.35, bz + barR + 0.35, 0, 1.15, true);
  b.collider(bx - barR * 0.75, bx + barR * 0.75, bz - barR * 0.75, bz + barR * 0.75, 0, 1.15, true);
  b.collider(bx - 0.6, bx + 0.6, bz - 0.6, bz + 0.6, 0, 6.0, true);
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(bx - barR - 1.3, 0, bz), radius: 2.4, label: 'The Center Bar (MGM Grand)' });
  // sportsbook risers + desks
  const [sx0, sx1, sz0, sz1] = MGM.book;
  const rows = [sz0 + 1.6, sz0 + 4.2, sz0 + 6.8];
  rows.forEach((rz, i) => {
    const y = i * 0.3;
    if (y > 0) b.collider(sx0, sx1, rz - 1.3, rz + 1.3, 0, y);
    b.collider(sx0, sx1, rz - 1.15, rz - 0.85, y, y + 0.78);
  });
  b.collider(80, 100, 380.6, 382.7, 0, 1.15, true);
  // habitat: glass on three sides, the painted rock wall behind
  const [hx0, hx1, hz0, hz1] = MGM.habitat;
  b.collider(hx0 - 0.12, hx0 + 0.12, hz0, hz1, 0, 5.2, true);
  b.collider(hx0, hx1, hz0 - 0.12, hz0 + 0.12, 0, 5.2, true);
  b.collider(hx0, hx1, hz1 - 0.12, hz1 + 0.12, 0, 5.2, true);
  b.collider(hx1 - 0.8, hx1, hz0, hz1, 0, 6.4, true);
  b.collider(hx0, hx1, hz0, hz1, 5.2, 5.6);
  // poker room: glass partitions with a gap on the west side, four tables
  const [px0, px1, pz0, pz1] = MGM.poker;
  const gapZ0 = 410.2;
  const gapZ1 = 413.2;
  b.collider(px0 - 0.1, px0 + 0.1, pz0, gapZ0, 0, 2.4, true);
  b.collider(px0 - 0.1, px0 + 0.1, gapZ1, pz1, 0, 2.4, true);
  b.collider(px1 - 0.1, px1 + 0.1, pz0, pz1, 0, 2.4, true);
  b.collider(px0, px1, pz0 - 0.1, pz0 + 0.1, 0, 2.4, true);
  b.collider(px0, px1, pz1 - 0.1, pz1 + 0.1, 0, 2.4, true);
  const pokerAt: Array<[number, number]> = [
    [px0 + 3.5, pz0 + 2.9],
    [px0 + 8.5, pz0 + 2.9],
    [px0 + 3.5, pz1 - 2.9],
    [px0 + 8.5, pz1 - 2.9],
  ];
  for (const [tx, tz] of pokerAt) b.collider(tx - 1.5, tx + 1.5, tz - 0.85, tz + 0.85, 0, 0.95);
  b.pickup(bx + barR + 0.9, 1.2, bz, 3, 'Center Bar Tip Jar Pack', true);
  b.pickup(px0 + 6, 0.45, (pz0 + pz1) / 2, 4, 'Poker Room Pack', true);
  b.pickup((sx0 + sx1) / 2, 1.3, rows[2], 2, 'Sportsbook Ticket Pack', true);
  b.pickup(hx0 - 0.9, 0.45, (hz0 + hz1) / 2 + 2, 2, "Lou's Cousins Pack", true);
  b.crowd.performers.push({ kind: 'elvis', x: bx - barR - 2.2, z: bz + 3.2, facing: -Math.PI / 2 });

  lazyInterior(b, 'interior:mgm-set', gate, (group) => {
    const k = new Kit();
    const ppl: PeopleLists = { seated: [], standing: [] };
    const gold = vcMat(0.25, 0.9);
    const rnd = prng(905);
    const shirt = () => GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)];
    const anim: Array<(t: number, dt: number) => void> = [];

    // ---- BetMGM sportsbook: a 24 m LED wall, betting windows, tiered recliners
    const ledW = 24;
    const ledH = 6;
    const ledX = (sx0 + sx1) / 2;
    const wallZ = MGM.z0 + 0.6;
    k.box(vcMat(0.5, 0.4), 0x050608, ledX, 4.4 + ledH / 2, wallZ + 0.15, ledW + 0.5, ledH + 0.5, 0.3);
    k.box(gold, 0xd9ae4a, ledX, 4.4 + ledH + 0.3, wallZ + 0.3, ledW + 0.6, 0.1, 0.1);
    k.box(gold, 0xd9ae4a, ledX, 4.12, wallZ + 0.3, ledW + 0.6, 0.1, 0.1);
    const led = new THREE.Mesh(new THREE.PlaneGeometry(ledW, ledH), ledWallMat());
    led.position.set(ledX, 4.4 + ledH / 2, wallZ + 0.32);
    group.add(led);
    // windows
    k.at(90, 0, wallZ, 0, () => {
      k.box(vcMat(0.5), 0x101014, 0, 0.55, 1.25, 20, 1.1, 0.6);
      k.box(vcMat(0.2, 0.3), 0x1a1a1e, 0, 1.13, 1.3, 20.2, 0.06, 0.8);
      k.box(glowMat(), 0x9affd0, 0, 0.08, 1.57, 20, 0.05, 0.03);
      k.box(vcMat(0.5), 0x0a0c10, 0, 3.0, 0.5, 20.2, 1.4, 1.0);
      const sg = new THREE.PlaneGeometry(5, 0.94);
      uvTo(sg, A.betmgm, AT);
      k.add(sg, mapGlow(atlas()), 0xffffff, 0, 3.0, 1.02);
      for (let i = 0; i < 7; i++) {
        const wx = -8.6 + i * 2.85;
        k.box(glassMat(), 0xffffff, wx, 1.75, 1.45, 1.2, 1.1, 0.04);
        k.quad(glowMat(), 0x3a8aff, wx, 1.3, 1.6, 0.4, 0.26, 0, undefined, -0.5);
        const p = k.world(wx, 0, 0.6);
        ppl.standing.push({ x: p.x, z: p.z, rot: 0, shirt: 0x101010, vest: 0x0f4a2a });
        if (rnd() < 0.5) {
          const q = k.world(wx, 0, 2.3);
          ppl.standing.push({ x: q.x, z: q.z, rot: Math.PI, shirt: shirt() });
        }
      }
    });
    rows.forEach((rz, i) => {
      const y = i * 0.3;
      if (y > 0) k.box(vcMat(0.8), 0x14201a, (sx0 + sx1) / 2, y / 2, rz, sx1 - sx0, y, 2.6);
      k.box(vcMat(0.4), 0x0a0c0e, (sx0 + sx1) / 2, y + 0.75, rz - 1.0, sx1 - sx0, 0.06, 0.42);
      k.box(vcMat(0.6), 0x1a1a1e, (sx0 + sx1) / 2, y + 0.38, rz - 1.12, sx1 - sx0, 0.72, 0.08);
      k.box(glowMat(), 0x5affb0, (sx0 + sx1) / 2, y + 0.04, rz - 1.18, sx1 - sx0, 0.04, 0.02);
      for (let cx = sx0 + 0.8; cx < sx1 - 0.5; cx += 1.25) {
        k.at(cx, y, rz, 0, () => {
          k.box(vcMat(0.7), 0x1a3a2a, 0, 0.25, 0, 0.8, 0.5, 0.72);
          k.box(vcMat(0.7), 0x1a3a2a, 0, 0.72, 0.32, 0.8, 0.62, 0.16);
          for (const s of [-1, 1]) k.box(vcMat(0.7), 0x14301f, s * 0.42, 0.45, 0, 0.12, 0.3, 0.7);
          k.quad(glowMat(), 0x6ab8ff, 0, 0.8, -0.98, 0.3, 0.2, 0, undefined, -0.9);
        });
        if (rnd() < 0.55) ppl.seated.push({ x: cx, y: y - 0.15, z: rz + 0.02, rot: Math.PI, shirt: shirt() });
      }
    });

    // ---- the Center Bar: a ring bar under a lit emerald crown
    const n = 22;
    for (let i = 0; i < n; i++) {
      if (i < 3) continue;
      const a = (i / n) * Math.PI * 2 + Math.PI / 2;
      const px = bx + Math.sin(a) * barR;
      const pz = bz + Math.cos(a) * barR;
      const segW = (2 * Math.PI * barR) / n + 0.05;
      k.box(vcMat(0.5), 0x0c2a1c, px, 0.55, pz, segW, 1.1, 0.6, a);
      k.box(vcMat(0.15, 0.3), 0x111111, bx + Math.sin(a) * (barR + 0.05), 1.13, bz + Math.cos(a) * (barR + 0.05), segW, 0.06, 0.8, a);
      k.box(gold, 0xd9ae4a, bx + Math.sin(a) * (barR + 0.33), 1.05, bz + Math.cos(a) * (barR + 0.33), segW, 0.06, 0.05, a);
      k.box(glowMat(), 0x7dffb8, bx + Math.sin(a) * (barR + 0.32), 0.12, bz + Math.cos(a) * (barR + 0.32), segW, 0.06, 0.04, a);
      const tx = bx + Math.sin(a) * (barR + 0.9);
      const tz = bz + Math.cos(a) * (barR + 0.9);
      k.cyl(gold, 0xd9ae4a, tx, 0.4, tz, 0.035, 0.05, 0.8, 8);
      k.cyl(vcMat(0.6), 0x0f4a2a, tx, 0.82, tz, 0.22, 0.2, 0.1, 12);
      if (i % 3 !== 0) ppl.seated.push({ x: tx, y: 0.15, z: tz, rot: a + Math.PI, shirt: shirt() });
    }
    k.cyl(vcMat(0.4), 0x0a1a12, bx, 1.1, bz, 1.25, 1.35, 2.2, 24);
    for (let t = 0; t < 3; t++) {
      const y = 0.8 + t * 0.5;
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        k.cyl(glowMat(), [0x7dffb8, 0xffd27a, 0xff8a4a, 0xe8f0ff, 0xc8203a][(i + t) % 5], bx + Math.sin(a) * 1.32, y + 0.15, bz + Math.cos(a) * 1.32, 0.025, 0.04, 0.28, 6);
      }
      const ring = new THREE.TorusGeometry(1.36, 0.02, 4, 28);
      ring.rotateX(Math.PI / 2);
      k.add(ring, glowMat(), 0x7dffb8, bx, y, bz);
    }
    k.cyl(gold, 0xd9ae4a, bx, 3.6, bz, 0.38, 0.5, 2.8, 16);
    // the crown: an emerald glass drum, gold rims and glowing points, signs on four sides
    const crownY = 6.0;
    const drum = new THREE.CylinderGeometry(3.0, 3.0, 1.4, 40, 1, true);
    k.add(drum, glowMat(), 0x1fae6a, bx, crownY, bz);
    k.add(new THREE.CylinderGeometry(2.9, 2.9, 1.35, 40, 1, true), vcMat(0.4), 0x0a2a1a, bx, crownY, bz);
    for (const y of [crownY - 0.75, crownY + 0.75]) {
      const r = new THREE.TorusGeometry(3.05, 0.09, 6, 48);
      r.rotateX(Math.PI / 2);
      k.add(r, gold, 0xd9ae4a, bx, y, bz);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const px = bx + Math.cos(a) * 3.0;
      const pz = bz + Math.sin(a) * 3.0;
      k.add(new THREE.ConeGeometry(0.28, 1.1, 4), gold, 0xd9ae4a, px, crownY + 1.3, pz);
      k.add(new THREE.SphereGeometry(0.13, 8, 6), glowMat(), i % 2 ? 0xfff0b0 : 0x7dffb8, px, crownY + 1.9, pz);
      k.add(new THREE.OctahedronGeometry(0.16, 0), glowMat(), i % 3 === 0 ? 0xff3a5a : 0x7dffb8, bx + Math.cos(a + 0.26) * 3.06, crownY, bz + Math.sin(a + 0.26) * 3.06);
    }
    for (let q = 0; q < 4; q++) {
      const a = (q / 4) * Math.PI * 2;
      k.at(bx, 0, bz, a, () => {
        const g = new THREE.PlaneGeometry(3.0, 0.42);
        uvTo(g, A.centerBar, AT);
        k.add(g, mapGlow(atlas()), 0xffffff, 0, crownY - 1.15, 1.32);
      });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.cyl(gold, 0xd9ae4a, bx + Math.cos(a) * 1.6, (2.2 + crownY - 0.7) / 2, bz + Math.sin(a) * 1.6, 0.025, 0.025, crownY - 0.7 - 2.2, 5);
    }
    const spoke = new THREE.RingGeometry(0.5, 3.0, 40);
    spoke.rotateX(Math.PI / 2);
    k.add(spoke, vcMat(0.4), 0x0a2a1a, bx, crownY - 0.7, bz);
    const halo = new THREE.RingGeometry(barR - 0.4, barR + 2.2, 40);
    halo.rotateX(-Math.PI / 2);
    k.add(halo, additiveMat(), 0x0a3a20, bx, 0.05, bz);
    ppl.standing.push({ x: bx + 1.9, z: bz + 0.4, rot: Math.PI / 2, shirt: 0x101010, vest: 0x0f4a2a });
    ppl.standing.push({ x: bx - 1.7, z: bz - 1.1, rot: -Math.PI * 0.75, shirt: 0x101010, vest: 0x0f4a2a });

    // ---- the Lion Habitat
    const hcx = (hx0 + hx1) / 2;
    const hcz = (hz0 + hz1) / 2;
    const grass = new THREE.PlaneGeometry(hx1 - hx0 - 0.3, hz1 - hz0 - 0.3);
    grass.rotateX(-Math.PI / 2);
    k.add(grass, vcMat(0.95), 0x6a7a34, hcx, 0.05, hcz);
    for (let i = 0; i < 40; i++) {
      const g = new THREE.ConeGeometry(0.08, 0.35 + rnd() * 0.3, 3);
      k.add(g, vcMat(0.9), rnd() < 0.5 ? 0x8a9a3a : 0xa8a050, hx0 + 0.5 + rnd() * (hx1 - hx0 - 1.6), 0.2, hz0 + 0.5 + rnd() * (hz1 - hz0 - 1));
    }
    // painted savanna on the back wall + rock wall faces
    k.at(hx1 - 0.82, 0, hcz, -Math.PI / 2, () => {
      const g = new THREE.PlaneGeometry(hz1 - hz0, 5.2);
      uvTo(g, A.savanna, AT);
      k.add(g, mapGlow(atlas()), 0xd8d8d8, 0, 2.6, 0);
    });
    k.box(vcMat(0.9), 0x5a4632, hx1 - 0.4, 3.2, hcz, 0.8, 6.4, hz1 - hz0);
    const rock = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c = 0x8a7458) => {
      const g = new THREE.IcosahedronGeometry(1, 1);
      g.scale(sx, sy, sz);
      k.add(g, vcMat(0.95), c, x, y, z);
    };
    rock(hx1 - 2.4, 0.7, hz0 + 3.2, 2.2, 1.4, 2.2);
    rock(hx1 - 1.8, 1.6, hz0 + 3.6, 1.4, 1.2, 1.6, 0x9a8466);
    rock(hx1 - 2.0, 0.4, hz1 - 2.6, 1.6, 0.8, 1.4, 0x7a664a);
    rock(hx0 + 2.6, 0.25, hz1 - 1.6, 0.9, 0.45, 0.8, 0x8a7458);
    // acacia tree
    k.cyl(vcMat(0.9), 0x5a4228, hx1 - 3.6, 1.6, hcz + 1.6, 0.18, 0.28, 3.2, 8);
    k.cyl(vcMat(0.9), 0x5a4228, hx1 - 3.1, 3.3, hcz + 1.2, 0.08, 0.12, 1.4, 6, 0, 0.5, 0);
    const crown = new THREE.SphereGeometry(1, 12, 6);
    crown.scale(2.6, 0.42, 2.0);
    k.add(crown, vcMat(0.85), 0x5a7a2a, hx1 - 3.3, 4.2, hcz + 1.3);
    // pool
    const pool = new THREE.CircleGeometry(1.3, 20);
    pool.rotateX(-Math.PI / 2);
    pool.scale(1.4, 1, 1);
    k.add(pool, vcMat(0.1, 0.3), 0x2a5a6a, hx0 + 3.2, 0.07, hz0 + 2.2);
    // a giant ball of yarn for the cub (cousins will be cousins)
    k.add(new THREE.SphereGeometry(0.42, 12, 10), vcMat(0.9), 0xc8203a, hx0 + 2.4, 0.47, hz1 - 3.6);
    k.add(new THREE.TorusGeometry(0.43, 0.025, 4, 24), vcMat(0.9), 0xe83a50, hx0 + 2.4, 0.47, hz1 - 3.6, 0.6, 0.3);
    k.add(new THREE.TorusGeometry(0.43, 0.025, 4, 24), vcMat(0.9), 0xe83a50, hx0 + 2.4, 0.47, hz1 - 3.6, -0.4, 1.2);
    // glass: three sides, gold mullions, header with the sign; skylight glow above
    const hGlass = new THREE.MeshStandardMaterial({ color: 0xe8f4f8, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const pane = (x: number, z: number, w: number, ry: number) => {
      k.box(hGlass, 0xffffff, x, 2.55, z, w, 4.9, 0.06, ry);
      k.box(gold, 0xd9ae4a, x, 0.1, z, w, 0.2, 0.16, ry);
    };
    pane(hx0, hcz, hz1 - hz0, Math.PI / 2);
    pane(hcx - 0.4, hz0, hx1 - hx0 - 0.8, 0);
    pane(hcx - 0.4, hz1, hx1 - hx0 - 0.8, 0);
    for (let z = hz0; z <= hz1 + 0.01; z += (hz1 - hz0) / 6) k.box(gold, 0xd9ae4a, hx0, 2.6, z, 0.12, 5.2, 0.12);
    for (let x = hx0; x < hx1 - 0.8; x += (hx1 - hx0 - 0.8) / 4) {
      k.box(gold, 0xd9ae4a, x, 2.6, hz0, 0.12, 5.2, 0.12);
      k.box(gold, 0xd9ae4a, x, 2.6, hz1, 0.12, 5.2, 0.12);
    }
    k.box(vcMat(0.5), 0x0a2a1a, hcx - 0.4, 5.4, hcz, hx1 - hx0 + 0.4, 0.5, hz1 - hz0 + 0.4);
    k.box(gold, 0xd9ae4a, hcx - 0.4, 5.13, hcz, hx1 - hx0 + 0.5, 0.08, hz1 - hz0 + 0.5);
    const sky = new THREE.PlaneGeometry(hx1 - hx0 - 1.2, hz1 - hz0 - 0.6);
    sky.rotateX(Math.PI / 2);
    k.add(sky, glowMat(), 0x9ab8d0, hcx - 0.4, 5.14, hcz);
    k.at(hx0 - 0.05, 0, hcz, -Math.PI / 2, () => {
      const g = new THREE.PlaneGeometry(4.6, 1.15);
      uvTo(g, A.habitat, AT);
      k.add(g, mapGlow(atlas()), 0xffffff, 0, 6.3, 0.02);
      k.box(gold, 0xd9ae4a, 0, 6.3, -0.04, 4.8, 1.32, 0.06);
      for (const s of [-1, 1]) k.cyl(gold, 0xd9ae4a, s * 1.9, (6.96 + 12) / 2, -0.02, 0.015, 0.015, 12 - 6.96, 5);
      const nt = new THREE.PlaneGeometry(2.6, 0.33);
      uvTo(nt, A.noTap, AT);
      k.add(nt, mapGlow(atlas()), 0xd0d0d0, -2.0, 1.25, 0.06);
      const pq = new THREE.PlaneGeometry(2.1, 0.35);
      uvTo(pq, A.plaque, AT);
      k.add(pq, mapGlow(atlas()), 0xd0d0d0, 2.0, 1.25, 0.06);
    });
    // brass rail in front of the glass
    k.box(gold, 0xd9ae4a, hx0 - 0.7, 0.95, hcz, 0.06, 0.06, hz1 - hz0 - 0.6);
    for (let z = hz0 + 0.4; z < hz1; z += 2.2) k.cyl(gold, 0xd9ae4a, hx0 - 0.7, 0.48, z, 0.03, 0.03, 0.95, 6);
    // the lions: Leo on the rock, Lulu asleep, Lenny sitting by the glass watching Lou, Little Louie with the yarn
    const lions = new THREE.Mesh(
      lionGeometry([
        { x: hx1 - 2.1, y: 2.2, z: hz0 + 3.3, ry: Math.PI * 0.85, spec: { pose: 'lie', scale: 1, mane: true, phase: 0.3 } },
        { x: hcx - 0.4, y: 0.05, z: hz1 - 2.2, ry: Math.PI * 1.1, spec: { pose: 'sleep', scale: 0.92, mane: false, phase: 2.1, coat: 0xd0a060 } },
        { x: hx0 + 1.8, y: 0.05, z: hcz - 0.6, ry: Math.PI, spec: { pose: 'sit', scale: 1.05, mane: true, phase: 4.0, watch: true } },
        { x: hx0 + 3.4, y: 0.05, z: hz1 - 3.4, ry: Math.PI * 0.7, spec: { pose: 'lie', scale: 0.5, mane: false, phase: 5.2, coat: 0xd8aa68 } },
      ]),
      lionMat()
    );
    group.add(lions);
    const neck = new THREE.Vector3(hx0 + 1.8 - 0.3 * 1.05, 0, hcz - 0.6);
    anim.push(() => {
      const dx = viewer.cat.x - neck.x;
      const dz = viewer.cat.z - neck.z;
      const want = Math.atan2(dx, dz);
      const face = Math.atan2(Math.cos(Math.PI), -Math.sin(Math.PI)); // the lion faces local +x rotated by ry
      let d = want - face;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const target = THREE.MathUtils.clamp(d, -1.1, 1.1);
      lionLook.value += (target - lionLook.value) * 0.06;
    });

    // ---- the poker room
    const ptl: TableLook = { ...look, felt: 0x0f5a32, rail: 0x0a0a0a };
    pokerAt.forEach(([tx, tz], i) => pokerTable(k, tx, tz, 0, ptl, ppl, 50 + i * 7));
    const pcx = (px0 + px1) / 2;
    const pcz = (pz0 + pz1) / 2;
    const carpet = new THREE.PlaneGeometry(px1 - px0, pz1 - pz0);
    carpet.rotateX(-Math.PI / 2);
    k.add(carpet, vcMat(0.95), 0x0a2416, pcx, 0.045, pcz);
    const part = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ry = Math.atan2(-(z1 - z0), x1 - x0);
      k.box(glassMat(), 0xffffff, (x0 + x1) / 2, 1.35, (z0 + z1) / 2, len, 2.1, 0.05, ry);
      k.box(gold, 0xd9ae4a, (x0 + x1) / 2, 2.42, (z0 + z1) / 2, len, 0.07, 0.1, ry);
      k.box(vcMat(0.6), 0x0a2a1a, (x0 + x1) / 2, 0.15, (z0 + z1) / 2, len, 0.3, 0.14, ry);
    };
    part(px0, pz0, px0, gapZ0);
    part(px0, gapZ1, px0, pz1);
    part(px1, pz0, px1, pz1);
    part(px0, pz0, px1, pz0);
    part(px0, pz1, px1, pz1);
    k.at(px0 - 0.1, 0, (gapZ0 + gapZ1) / 2, -Math.PI / 2, () => {
      const g = new THREE.PlaneGeometry(3.8, 0.71);
      uvTo(g, A.poker, AT);
      k.add(g, mapGlow(atlas()), 0xffffff, 0, 3.4, 0.02);
      k.box(vcMat(0.5, 0.4), 0x0a120c, 0, 3.4, -0.05, 3.9, 0.8, 0.08);
      for (const s of [-1, 1]) k.cyl(gold, 0xd9ae4a, s * 1.4, 3.4 + 0.4 + 0.5, -0.05, 0.03, 0.03, 1.0, 6);
    });
    for (const [tx, tz] of pokerAt) {
      k.box(glowMat(), 0xfff0d0, tx, 5.5, tz, 1.6, 0.06, 0.9);
      k.box(gold, 0xd9ae4a, tx, 5.56, tz, 1.8, 0.08, 1.1);
      k.cyl(gold, 0xd9ae4a, tx, 8.8, tz, 0.02, 0.02, 6.4, 5);
    }

    // ---- Art-Deco Hollywood dressing on the walls + wayfinding to the Arena and KÀ
    const deco = (x: number, z: number, ry: number) =>
      k.at(x, 0, z, ry, () => {
        const g = new THREE.PlaneGeometry(3.2, 3.2);
        uvTo(g, A.sunburst, AT);
        k.add(g, mapGlow(atlas()), 0xc8c8c8, 0, 8.4, 0.26);
      });
    for (let x = MGM.x0 + 5; x < MGM.x1 - 3; x += 10) {
      if (x > ledX - ledW / 2 - 2 && x < ledX + ledW / 2 + 2) continue;
      deco(x, MGM.z0 + 0.6, 0);
    }
    for (let x = MGM.x0 + 5; x < MGM.x1 - 3; x += 10) {
      if (Math.abs(x - 100) < 6) continue;
      deco(x, MGM.z1 - 0.6, Math.PI);
    }
    for (let z = MGM.z0 + 5; z < MGM.z1 - 3; z += 10) deco(MGM.x1 - 0.6, z, -Math.PI / 2);
    const poster = (x: number, z: number, ry: number, r: Px) =>
      k.at(x, 0, z, ry, () => {
        const g = new THREE.PlaneGeometry(1.8, 2.7);
        uvTo(g, r, AT);
        k.add(g, mapGlow(atlas()), 0xc0c0c0, 0, 5.4, 0.27);
        k.box(gold, 0xd9ae4a, 0, 5.4, 0.22, 2.0, 2.9, 0.06);
        for (let i = 0; i < 9; i++) k.add(new THREE.SphereGeometry(0.05, 6, 4), glowMat(), 0xfff0b0, -0.9 + (i / 8) * 1.8, 6.95, 0.27);
      });
    poster(MGM.x0 + 10, MGM.z1 - 0.6, Math.PI, A.poster0);
    poster(MGM.x0 + 20, MGM.z1 - 0.6, Math.PI, A.poster1);
    poster(MGM.x1 - 0.6, MGM.z0 + 10, -Math.PI / 2, A.poster2);
    const hang = (r: Px, x: number, z: number, ry: number) =>
      k.at(x, 0, z, ry, () => {
        for (const s of [1, -1]) {
          const g = new THREE.PlaneGeometry(3.8, 0.71);
          uvTo(g, r, AT);
          k.add(g, mapGlow(atlas()), 0xe0e0e0, 0, 6.2, s * 0.07, s > 0 ? 0 : Math.PI);
        }
        k.box(vcMat(0.4, 0.5), 0x101410, 0, 6.2, 0, 3.9, 0.8, 0.12);
        for (const s of [-1, 1]) k.cyl(gold, 0xd9ae4a, s * 1.5, 9.3, 0, 0.015, 0.015, 5.4, 5);
      });
    hang(A.arena, 80, 411, Math.PI / 2);
    hang(A.ka, 100, 400.8, 0);
    hang(A.arena, 112, 403.2, 0);

    k.flush(group);
    buildPeople(group, 'sit', ppl.seated);
    buildPeople(group, 'stand', ppl.standing);
    return anim;
  });
}

// ------------------------------------------------------------------ the Strip marquee
/** Two single-material planes on the ±z faces of a box (merges in the static batch, unlike a multi-material box). */
export function facePair(b: WorldBuilder, m: THREE.Material, x: number, y: number, z: number, w: number, h: number, off: number): void {
  b.add(mesh(new THREE.PlaneGeometry(w, h), m, x, y, z + off));
  const back = mesh(new THREE.PlaneGeometry(w, h), m, x, y, z - off);
  back.rotation.y = Math.PI;
  b.add(back);
}

/**
 * The MGM Grand marquee by the lion: two gold-clad legs, a giant video board facing up and down the
 * Boulevard, a "GRAND" band and the huge MGM letters on top in LED pucks (gold by day, a chasing
 * blaze of light after dark), crowned by a bulb-lit cornice.
 */
export function mgmMarquee(b: WorldBuilder, x: number, z: number): void {
  tickTheme(b);
  const W = 9.6;
  const legH = 7.5;
  const scrH = 11;
  const bandH = 1.6;
  const capH = 5.2;
  const dep = 1.6;
  const goldM = mat(0xc89a3a, 0.3, 0.85);
  const dark = mat(0x16181c, 0.5, 0.4);
  // legs
  for (const s of [-1, 1]) {
    b.add(mesh(new THREE.BoxGeometry(1.2, legH + 0.5, 1.2), goldM, x + s * (W / 2 - 1.2), (legH + 0.5) / 2, z, true));
    b.add(mesh(new THREE.BoxGeometry(1.7, 0.5, 1.7), dark, x + s * (W / 2 - 1.2), 0.25, z));
    b.collider(x + s * (W / 2 - 1.2) - 0.65, x + s * (W / 2 - 1.2) + 0.65, z - 0.65, z + 0.65, 0, legH + scrH + bandH + capH, true);
  }
  // video board (both faces)
  const led = new LedBoard('MGM GRAND', ['KÀ • CIRQUE DU SOLEIL', 'DAVID COPPERFIELD', 'GRAND GARDEN ARENA', 'BetMGM SPORTSBOOK', 'HAKKASAN', 'LION HABITAT • MEET LOU’S COUSINS'], ['#0f6a3a', '#c9a04a', '#7a1c2a', '#1a3a8a', '#101010', '#0f6a3a'], 256, 320);
  const face = new THREE.MeshBasicMaterial({ map: led.tex });
  facePair(b, face, x, legH + scrH / 2, z, W - 0.6, scrH, (dep - 0.2) / 2 + 0.01);
  b.add(mesh(new THREE.BoxGeometry(W, scrH + 0.5, dep - 0.3), goldM, x, legH + scrH / 2, z));
  b.every((_dt, t) => {
    const dx = viewer.cam.x - x;
    const dz = viewer.cam.z - z;
    if (dx * dx + dz * dz < 260 * 260) led.draw(t);
  });
  // GRAND band (gold letters on black, pucks too)
  const bandMask = canvasTex(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f00';
    ctx.font = 'bold 54px "Century Gothic", Futura, "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // letter-spaced
    const s = 'G R A N D';
    ctx.fillText(s, w / 2, h / 2 + 2);
    ctx.fillStyle = '#0f0';
    ctx.fillRect(0, 0, w, 4);
    ctx.fillRect(0, h - 4, w, 4);
  });
  const bandMat = puckMaterial(b, bandMask, [96, 12], 0xd9ae4a, 0xfff0c0, 0x050505, 0.6);
  const bandY = legH + scrH + bandH / 2;
  b.add(mesh(new THREE.BoxGeometry(W, bandH, dep), dark, x, bandY, z));
  facePair(b, bandMat, x, bandY, z, W, bandH, dep / 2 + 0.01);
  // MGM letters
  const mask = canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f00';
    ctx.font = 'bold 236px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MGM', w / 2, h / 2 + 12);
    ctx.fillStyle = '#0f0';
    for (const yy of [0, h - 6]) ctx.fillRect(0, yy, w, 6);
    for (const xx of [0, w - 6]) ctx.fillRect(xx, 0, 6, h);
  });
  const mgmMat = puckMaterial(b, mask, [72, 36], 0xe0b040, 0xffe6a0, 0x06140c, 1);
  const capY = legH + scrH + bandH + capH / 2;
  b.add(mesh(new THREE.BoxGeometry(W + 0.6, capH, dep + 0.2), goldM, x, capY, z, true));
  facePair(b, mgmMat, x, capY, z, W + 0.4, capH - 0.2, (dep + 0.2) / 2 + 0.01);
  // cornice + crown bulbs
  b.add(mesh(new THREE.BoxGeometry(W + 1.2, 0.5, dep + 0.8), goldM, x, capY + capH / 2 + 0.25, z));
  const bulbs = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffd27a, emissiveIntensity: 0.2, roughness: 0.3 });
  b.nightGlow(bulbs, 0.2, 2.4);
  for (let i = 0; i < 13; i++) {
    const bx = x - (W + 1.0) / 2 + (i / 12) * (W + 1.0);
    for (const s of [-1, 1]) b.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), bulbs, bx, capY + capH / 2 + 0.6, z + s * (dep / 2 + 0.3)));
  }
  // a gold lion's head medallion on top (Leo, the MGM mascot)
  const lionHead = new THREE.Group();
  lionHead.add(mesh(new THREE.SphereGeometry(1.05, 16, 12), goldM, 0, 0, 0));
  lionHead.add(mesh(new THREE.SphereGeometry(0.7, 14, 10), mat(0xe8c060, 0.28, 0.9), 0, -0.05, 0.6));
  lionHead.add(mesh(new THREE.SphereGeometry(0.32, 10, 8), mat(0xe8c060, 0.28, 0.9), 0, -0.3, 1.15));
  lionHead.position.set(x, capY + capH / 2 + 1.6, z);
  b.add(lionHead);
  // uplights at the feet
  const up = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
  for (const s of [-1, 1]) b.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), up, x + s * (W / 2 - 1.2), 0.56, z + 0.9));
  b.staticMarkers.push({ x, z, color: '#d9ae4a', glyph: '▮', size: 2.2 });
}
