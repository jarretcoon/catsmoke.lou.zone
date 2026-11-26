import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { viewer, type WorldBuilder } from './builder';

/*
 * Lucky the Clown (YESCO, 1976): the classic Circus Circus roadside sign, rebuilt procedurally.
 *
 * Top to bottom: Lucky's head (pink/purple striped cone hat with a pom-pom, orange curly hair, white
 * face, round red nose, wide red smile, blue eye shadow) rising out of a pink-red ruffled collar with
 * orange/yellow scrolls; a big pink-red-white swirl lollipop held up on the viewer's right and a white
 * glove pointing out and down on the left; the red CIRCUS CIRCUS / HOTEL-CASINO panel in a yellow bulb
 * frame with magenta flame flares; the gold-framed reader board (FREE CIRCUS ACTS, ROOMS AVAILABLE,
 * the buffet block, the little restaurant panels, FULL SERVICE RV PARK); yellow/orange flame scallops
 * and Lucky's giant red-and-yellow shoes at the base, all up on steel pylons.
 *
 * Built as layered 2.5D cabinets: every piece is an extruded silhouette whose front face samples one
 * painted canvas (the art) and one glow canvas (the night emissive), so the whole sign is two draw
 * calls, plus one instanced mesh for ~300 chasing bulbs and a pulsing neon overlay on the lollipop.
 * Art coordinates are in "photo px" (372 × 537, y down); s converts to metres.
 */

const IMG_W = 372;
const IMG_H = 537;
const K = 1024 / IMG_W; // canvas px per photo px
const CAN_H = Math.round(IMG_H * K);

type Pt = [number, number];

const circle = (cx: number, cy: number, r: number, n = 28): Pt[] => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy - Math.sin((i / n) * Math.PI * 2) * r]);
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 36): Pt[] => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy - Math.sin((i / n) * Math.PI * 2) * ry]);
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y1],
  [x1, y1],
  [x1, y0],
  [x0, y0],
];
/** A capsule (rounded bar) from a to b. */
function capsule(ax: number, ay: number, bx: number, by: number, r: number): Pt[] {
  const a = Math.atan2(by - ay, bx - ax);
  const out: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = a - Math.PI / 2 + (i / 10) * Math.PI;
    out.push([bx + Math.cos(t) * r, by + Math.sin(t) * r]);
  }
  for (let i = 0; i <= 10; i++) {
    const t = a + Math.PI / 2 + (i / 10) * Math.PI;
    out.push([ax + Math.cos(t) * r, ay + Math.sin(t) * r]);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Layout (photo px)
// ------------------------------------------------------------------------------------------------
const NAME: [number, number, number, number] = [86, 197, 300, 271];
const READER: [number, number, number, number] = [85, 273, 302, 443];

/** Pink-red ruffled collar: a wide ellipse with a scalloped edge. */
const COLLAR: Pt[] = (() => {
  const out: Pt[] = [];
  const n = 120;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const scal = 1 + 0.07 * Math.abs(Math.sin(t * 9));
    out.push([184 + Math.cos(t) * 88 * scal, 186 - Math.sin(t) * 36 * scal]);
  }
  return out;
})();

/** Magenta flame flare on one side of the name panel (tips outward). */
function flare(side: -1 | 1): Pt[] {
  const x0 = side < 0 ? NAME[0] + 22 : NAME[2] - 22;
  const tips: Array<[number, number, number]> =
    side < 0
      ? [
          [50, 178, 72],
          [34, 204, 70],
          [38, 232, 74],
          [46, 259, 76],
          [62, 286, 80],
        ]
      : [
          [330, 182, 308],
          [342, 208, 310],
          [338, 234, 308],
          [322, 258, 304],
        ];
  const out: Pt[] = [[x0, side < 0 ? 176 : 180]];
  let prevY = side < 0 ? 176 : 180;
  for (const [tx, ty, vx] of tips) {
    // curl up to the tip then back down into the valley
    const midY = (prevY + ty) / 2;
    out.push([(x0 + tx) / 2 + side * -4, midY - 6]);
    out.push([tx, ty]);
    out.push([vx, ty + 8]);
    prevY = ty + 8;
  }
  out.push([x0, side < 0 ? 292 : 266]);
  return side < 0 ? out : out.reverse();
}

/** Yellow/orange flame scallops along the bottom edge (tips downward). */
const BOTTOM_FLAMES: Pt[] = (() => {
  const out: Pt[] = [[70, 420]];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const x = 70 + ((i + 0.5) / n) * 236;
    const depth = 444 + 16 + (i % 2 ? 6 : 14) + (i === 0 || i === n - 1 ? -6 : 0);
    out.push([x - 9, 452]);
    out.push([x - 4, depth - 6]);
    out.push([x + 1, depth]);
    out.push([x + 8, 452]);
  }
  out.push([306, 420]);
  return out;
})();

const HAT: Pt[] = [
  [136, 113],
  [190, 101],
  [147, 56],
];
const HAIR: Array<[number, number, number]> = [
  [128, 116, 17],
  [118, 138, 19],
  [124, 160, 16],
  [140, 101, 13],
  [217, 115, 17],
  [227, 137, 19],
  [221, 159, 16],
  [204, 100, 13],
  [172, 97, 13],
];
const FACE = { cx: 172, cy: 139, rx: 38, ry: 41 };
const LOLLI = { cx: 243, cy: 84, r: 34 };
const STICK = capsule(250, 116, 282, 166, 3.2);
const GLOVE_R = { cx: 286, cy: 168, r: 14 };
// Left glove: cuff, finger pointing out and down-left, palm, thumb
const gl = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [58 + (x - 58) * 1.35, 240 + (y - 240) * 1.35]);
const CUFF_L = gl(capsule(80, 233, 68, 237, 9));
const FINGER_L = gl(capsule(46, 247, 16, 260, 5));
const PALM_L = gl(circle(52, 242, 13, 24));
const THUMB_L = gl(capsule(50, 236, 43, 227, 4.6));
const SLEEVE_L = capsule(122, 222, 90, 232, 14);

// ------------------------------------------------------------------------------------------------
// Painting
// ------------------------------------------------------------------------------------------------
function path(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

const SLAB = '"Rockwell Extra Bold", "Rockwell", "Clarendon Blk BT", "Clarendon", "Bookman Old Style", Georgia, serif';

function swirl(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, cols: string[], width: number, rot = 0): void {
  const arms = cols.length;
  for (let k = 0; k < arms; k++) {
    ctx.strokeStyle = cols[k];
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.05) {
      const rr = (a / (Math.PI * 5)) * r;
      const aa = a + (k * Math.PI * 2) / arms + rot;
      const x = cx + Math.cos(aa) * rr;
      const y = cy + Math.sin(aa) * rr;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/**
 * The sign is double-faced (one face for each direction of traffic). The back face samples the same
 * silhouette, so its pictures are a mirror of the front; only the lettering must be flipped back so it
 * reads left to right from behind. While MIRROR is set, text is drawn mirrored about its own centre.
 */
let MIRROR = false;
function mirrored(ctx: CanvasRenderingContext2D, cx: number, draw: () => void): void {
  if (!MIRROR) {
    draw();
    return;
  }
  ctx.save();
  ctx.translate(cx, 0);
  ctx.scale(-1, 1);
  ctx.translate(-cx, 0);
  draw();
  ctx.restore();
}

function slabText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxW: number, fill: string, outline: string, glowCore?: string): void {
  ctx.save();
  if (MIRROR) {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${size}px ${SLAB}`;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = size * 0.22;
  ctx.strokeText(text, x, y, maxW);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y, maxW);
  if (glowCore) {
    ctx.strokeStyle = glowCore;
    ctx.lineWidth = size * 0.05;
    ctx.strokeText(text, x, y, maxW);
  }
  ctx.restore();
}

/**
 * Paint the sign into a two-face atlas: the south face on the left half, the north face (lettering
 * flipped back, see MIRROR) on the right. glow = the night emissive version (dim fields, lit faces,
 * white-hot letter cores).
 */
function paint(glow: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = CAN_H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = glow ? '#000000' : '#c8306a';
  ctx.fillRect(0, 0, 2048, CAN_H);
  for (const back of [false, true]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(back ? 1024 : 0, 0, 1024, CAN_H);
    ctx.clip();
    ctx.translate(back ? 1024 : 0, 0);
    MIRROR = back;
    paintFace(ctx, glow);
    MIRROR = false;
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function paintFace(ctx: CanvasRenderingContext2D, glow: boolean): void {
  ctx.scale(K, K);
  const G = (day: string, night: string) => (glow ? night : day);
  const outline = (w = 1.6, col = '#2a0a14') => {
    ctx.lineWidth = w;
    ctx.strokeStyle = glow ? '#000000' : col;
    ctx.stroke();
  };

  // ---- collar / costume (pink-red ruffles with orange-yellow scrolls)
  path(ctx, COLLAR);
  ctx.fillStyle = G('#e8285a', '#5a0a1e');
  ctx.fill();
  outline(1.4);
  for (let i = 0; i < 18; i++) {
    const t = (i / 18) * Math.PI * 2;
    if (Math.sin(t) < -0.2) continue;
    const x = 184 + Math.cos(t) * 74;
    const y = 186 - Math.sin(t) * 26;
    ctx.strokeStyle = G(i % 2 ? '#ffd23a' : '#ff8a1a', i % 2 ? '#6a5010' : '#6a3008');
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 8, Math.PI * 0.2, Math.PI * 1.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 8, y - 1, 4, Math.PI, Math.PI * 2.4);
    ctx.stroke();
  }
  // ruffle folds
  ctx.strokeStyle = G('#a01040', '#2a0410');
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const t = Math.PI * 0.05 + (i / 26) * Math.PI * 0.9;
    ctx.beginPath();
    ctx.moveTo(184 + Math.cos(t) * 60, 186 - Math.sin(t) * 20);
    ctx.lineTo(184 + Math.cos(t) * 92, 186 - Math.sin(t) * 38);
    ctx.stroke();
  }

  // ---- magenta flame flares + yellow/orange bottom flames
  const flameFill = (pts: Pt[], a: string, b: string, y0: number, y1: number) => {
    path(ctx, pts);
    const gr = ctx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    ctx.fillStyle = gr;
    ctx.fill();
    outline(1.6, '#5a0a3a');
  };
  for (const side of [-1, 1] as const) {
    const pts = flare(side);
    flameFill(pts, G('#ff4fc8', '#8a1060'), G('#c8108a', '#5a0840'), 176, 292);
    // inner tongues
    ctx.strokeStyle = G('#ffb0e8', '#a03080');
    ctx.lineWidth = 2;
    for (const [x, y] of pts) {
      const inX = side < 0 ? NAME[0] + 6 : NAME[2] - 6;
      if (Math.abs(x - inX) < 14) continue;
      ctx.beginPath();
      ctx.moveTo(inX, y + 2);
      ctx.quadraticCurveTo((inX + x) / 2, y - 6, x - side * -6, y + 1);
      ctx.stroke();
    }
  }
  flameFill(BOTTOM_FLAMES, G('#ff8a1a', '#7a3008'), G('#ffd23a', '#8a6a10'), 420, 470);
  ctx.strokeStyle = G('#d0122e', '#5a0808');
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 11; i++) {
    const x = 70 + ((i + 0.5) / 11) * 236;
    ctx.beginPath();
    ctx.moveTo(x - 4, 446);
    ctx.quadraticCurveTo(x, 455, x + 1, 462 - (i % 2) * 4);
    ctx.stroke();
  }

  // ---- left sleeve + pointing glove
  path(ctx, SLEEVE_L);
  ctx.fillStyle = G('#e8285a', '#5a0a1e');
  ctx.fill();
  outline();
  for (const pts of [CUFF_L, FINGER_L, PALM_L, THUMB_L]) {
    path(ctx, pts);
    ctx.fillStyle = G('#fbfbf6', '#9a9a92');
    ctx.fill();
    outline(1.6, '#101010');
  }
  ctx.strokeStyle = G('#101010', '#000000');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(76, 224);
  ctx.lineTo(82, 248);
  ctx.stroke();
  ctx.lineWidth = 1;
  for (const dy of [-5, 0, 5]) {
    ctx.beginPath();
    ctx.moveTo(44, 246 + dy * 1.2);
    ctx.lineTo(60, 243 + dy * 1.2);
    ctx.stroke();
  }

  // ---- name panel: yellow frame, red field, fat white slab letters with dark outlines
  {
    const [x0, y0, x1, y1] = NAME;
    ctx.fillStyle = G('#ffd23a', '#7a6010');
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = G('#d0102a', '#4a0408');
    ctx.fillRect(x0 + 7, y0 + 7, x1 - x0 - 14, y1 - y0 - 14);
    ctx.strokeStyle = G('#8a0818', '#200204');
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x0 + 7, y0 + 7, x1 - x0 - 14, y1 - y0 - 14);
    slabText(ctx, 'CIRCUS CIRCUS', (x0 + x1) / 2, 220, 31, x1 - x0 - 24, G('#fff8ec', '#d8d0c4'), G('#2a0408', '#000000'), glow ? '#fff6f0' : undefined);
    slabText(ctx, 'HOTEL-CASINO', (x0 + x1) / 2, 251, 27, x1 - x0 - 32, G('#fff8ec', '#d8d0c4'), G('#2a0408', '#000000'), glow ? '#fff6f0' : undefined);
  }

  // ---- reader board (gold frame, backlit white field)
  {
    const [x0, y0, x1, y1] = READER;
    ctx.fillStyle = G('#f2c230', '#6a5410');
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = G('#fbfaf2', '#a8a69c');
    ctx.fillRect(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12);
    const cx = (x0 + x1) / 2;
    const W = x1 - x0 - 20;
    const txt = (t: string, y: number, size: number, col: string, font = SLAB, weight = '900') => {
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${weight} ${size}px ${font}`;
      mirrored(ctx, cx, () => ctx.fillText(t, cx, y, W));
    };
    txt('FREE CIRCUS ACTS', 293, 20, G('#d0102a', '#8a0410'));
    txt('11 AM TO MIDNIGHT', 311, 11, G('#141414', '#0a0a0a'), 'Arial, sans-serif', 'bold');
    txt('ROOMS AVAILABLE', 326, 15, G('#141414', '#0a0a0a'), 'Arial Black, Arial, sans-serif');
    txt("If not, we'll place you!", 343, 14, G('#d0102a', '#6a0408'), '"Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive', 'italic');
    // buffet block: dark, lit yellow + orange prices
    ctx.fillStyle = G('#1a1014', '#0a0608');
    ctx.fillRect(112, 352, 166, 40);
    ctx.strokeStyle = G('#f2c230', '#9a7a10');
    ctx.lineWidth = 1.2;
    ctx.strokeRect(112, 352, 166, 40);
    ctx.beginPath();
    ctx.moveTo(195, 352);
    ctx.lineTo(195, 392);
    ctx.stroke();
    const ltxt = (t: string, x: number, y: number, size: number, col: string, align: CanvasTextAlign = 'left') => {
      ctx.fillStyle = col;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${size}px Arial Black, Arial, sans-serif`;
      const mid = align === 'center' ? x : x + ctx.measureText(t).width / 2;
      mirrored(ctx, mid, () => ctx.fillText(t, x, y));
    };
    const Y = G('#ffd23a', '#fff07a');
    const O = G('#ff8a1a', '#ffa040');
    ltxt('BUFFET', 117, 360, 8, Y);
    ltxt('BRUNCH', 117, 372, 8, Y);
    ltxt('DINNER', 117, 384, 8, Y);
    ltxt('2⁴⁹', 160, 362, 12, O);
    ltxt('3⁶⁹', 160, 381, 12, O);
    ltxt('BREAKFAST', 236, 359, 8, Y, 'center');
    ltxt('BUFFET', 236, 369, 8, Y, 'center');
    ltxt('45 HOT ITEMS  1⁹⁹', 236, 383, 7, O, 'center');
    // the row of little restaurant panels
    const cells: Array<[string, string, string, string, number]> = [
      ['THE STEAK', 'HOUSE', G('#6a0a14', '#3a0408'), G('#ffe8c0', '#d0b890'), 34],
      ['SKYRISE', 'dining room', G('#ff7ab8', '#7a2a50'), G('#ffffff', '#e0e0e0'), 34],
      ['RACE & SPORTS', 'BOOK', G('#ffffff', '#a0a0a0'), G('#141414', '#0a0a0a'), 52],
      ['PIZZERIA', 'on the mezzanine', G('#2a5ad8', '#10204a'), G('#ffffff', '#d8d8d8'), 36],
      ['PINK PONY', 'coffee shop', G('#ff4fa8', '#7a1048'), G('#ffffff', '#e8e8e8'), 34],
    ];
    let cx2 = 92;
    for (const [a, b2, bg, fg, w] of cells) {
      ctx.fillStyle = bg;
      ctx.fillRect(cx2, 396, w - 2, 28);
      ctx.strokeStyle = G('#141414', '#000000');
      ctx.lineWidth = 0.8;
      ctx.strokeRect(cx2, 396, w - 2, 28);
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 6.4px Arial Black, Arial, sans-serif`;
      const mid = cx2 + (w - 2) / 2;
      mirrored(ctx, mid, () => ctx.fillText(a, mid, 405, w - 5));
      ctx.font = `italic bold 5.4px Georgia, serif`;
      mirrored(ctx, mid, () => ctx.fillText(b2, mid, 416, w - 5));
      cx2 += w;
    }
    ctx.fillStyle = G('#d0102a', '#6a0410');
    ctx.fillRect(x0 + 6, 426, x1 - x0 - 12, 11);
    ctx.fillStyle = G('#ffffff', '#f0f0f0');
    ctx.font = `900 8px Arial Black, Arial, sans-serif`;
    ctx.textAlign = 'center';
    mirrored(ctx, cx, () => ctx.fillText('FULL SERVICE RV PARK', cx, 432, W));
  }

  // ---- hair (orange curly puffs)
  for (const [x, y, r] of HAIR) {
    path(ctx, circle(x, y, r));
    const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    gr.addColorStop(0, G('#ffb040', '#a06018'));
    gr.addColorStop(1, G('#f0501a', '#7a2008'));
    ctx.fillStyle = gr;
    ctx.fill();
    outline(1.2, '#6a1a08');
    ctx.strokeStyle = G('#b8300e', '#4a1004');
    ctx.lineWidth = 1.4;
    for (let q = 0; q < 3; q++) {
      ctx.beginPath();
      ctx.arc(x + (q - 1) * r * 0.4, y + (q % 2) * 3, r * 0.35, 0.3, Math.PI * 1.7);
      ctx.stroke();
    }
  }

  // ---- face
  {
    const { cx, cy, rx, ry } = FACE;
    path(ctx, ellipse(cx, cy, rx, ry));
    ctx.fillStyle = G('#fffaf2', '#b8b2a8');
    ctx.fill();
    outline(1.6);
    // blue eye shadow, arched black brows, eyes
    for (const s of [-1, 1]) {
      const ex = cx + s * 14;
      ctx.fillStyle = G('#3a7ae8', '#2a4a90');
      ctx.beginPath();
      ctx.ellipse(ex, cy - 13, 8, 6, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = G('#101010', '#000000');
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex, cy - 14, 10, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.fillStyle = '#101010';
      ctx.beginPath();
      ctx.ellipse(ex, cy - 9, 2.6, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = G('#ff8a9a', '#8a3040');
      ctx.beginPath();
      ctx.arc(cx + s * 25, cy + 8, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // wide red-outlined smile with a white inner mouth
    ctx.fillStyle = G('#d0102a', '#8a0818');
    ctx.beginPath();
    ctx.moveTo(cx - 27, cy + 9);
    ctx.quadraticCurveTo(cx, cy + 46, cx + 27, cy + 9);
    ctx.quadraticCurveTo(cx, cy + 24, cx - 27, cy + 9);
    ctx.fill();
    ctx.fillStyle = G('#fffaf2', '#c8c2b8');
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy + 14);
    ctx.quadraticCurveTo(cx, cy + 36, cx + 20, cy + 14);
    ctx.quadraticCurveTo(cx, cy + 22, cx - 20, cy + 14);
    ctx.fill();
    ctx.strokeStyle = G('#5a0408', '#000000');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 27, cy + 9);
    ctx.quadraticCurveTo(cx, cy + 46, cx + 27, cy + 9);
    ctx.stroke();
    // painted nose disc (the 3D ball sits on it)
    ctx.fillStyle = G('#e0101e', '#c00818');
    ctx.beginPath();
    ctx.arc(cx, cy + 4, 11, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- hat: tall pink/purple striped cone with a yellow-orange pom-pom
  {
    ctx.save();
    path(ctx, HAT);
    ctx.clip();
    const [b0, b1, tip] = HAT;
    const bx = (b0[0] + b1[0]) / 2;
    const by = (b0[1] + b1[1]) / 2;
    for (let i = 0; i < 9; i++) {
      const t0 = i / 9;
      const t1 = (i + 1) / 9;
      const p = (t: number, base: Pt): Pt => [base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t];
      ctx.fillStyle = i % 2 ? G('#9a3ad8', '#4a1a6a') : G('#ff6ac0', '#7a2a5a');
      ctx.beginPath();
      const a0 = p(t0, b0);
      const a1 = p(t0, b1);
      const c0 = p(t1, b0);
      const c1 = p(t1, b1);
      ctx.moveTo(a0[0] - 6, a0[1] + 4);
      ctx.lineTo(a1[0] + 6, a1[1] + 4);
      ctx.lineTo(c1[0] + 6, c1[1] + 4);
      ctx.lineTo(c0[0] - 6, c0[1] + 4);
      ctx.fill();
    }
    void bx;
    void by;
    ctx.restore();
    path(ctx, HAT);
    outline(1.6);
    ctx.fillStyle = G('#ffd23a', '#9a7a10');
    ctx.beginPath();
    ctx.ellipse((b0x(HAT) + b1x(HAT)) / 2, (HAT[0][1] + HAT[1][1]) / 2, 28, 4, -0.22, 0, Math.PI * 2);
    ctx.fill();
    const pom = circle(HAT[2][0], HAT[2][1] - 1, 9);
    path(ctx, pom);
    const gr = ctx.createRadialGradient(HAT[2][0] - 3, HAT[2][1] - 4, 1, HAT[2][0], HAT[2][1], 9);
    gr.addColorStop(0, G('#fff07a', '#c0a030'));
    gr.addColorStop(1, G('#ff8a1a', '#8a4008'));
    ctx.fillStyle = gr;
    ctx.fill();
    outline(1.2);
  }

  // ---- lollipop: stick, pink/red/white spiral disc with a rim; right glove holding it
  path(ctx, STICK);
  ctx.fillStyle = G('#fbfbf6', '#9a9a92');
  ctx.fill();
  outline(1);
  {
    const { cx, cy, r } = LOLLI;
    path(ctx, circle(cx, cy, r, 48));
    ctx.fillStyle = G('#ffffff', '#a8a0a0');
    ctx.fill();
    ctx.save();
    ctx.clip();
    swirl(ctx, cx, cy, r * 1.05, [G('#e8104a', '#a0102a'), G('#ff7ac8', '#9a3070'), G('#d0102a', '#8a0818')], 6.5);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = G('#ffd23a', '#9a7a10');
    ctx.stroke();
    outline(1);
  }
  path(ctx, circle(GLOVE_R.cx, GLOVE_R.cy, GLOVE_R.r, 24));
  ctx.fillStyle = G('#fbfbf6', '#9a9a92');
  ctx.fill();
  outline(1.6, '#101010');
  ctx.strokeStyle = G('#101010', '#000000');
  ctx.lineWidth = 1;
  for (const dx of [-5, 0, 5]) {
    ctx.beginPath();
    ctx.moveTo(GLOVE_R.cx + dx, GLOVE_R.cy - 8);
    ctx.lineTo(GLOVE_R.cx + dx + 2, GLOVE_R.cy + 2);
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(GLOVE_R.cx - 10, GLOVE_R.cy + 12);
  ctx.lineTo(GLOVE_R.cx + 6, GLOVE_R.cy + 16);
  ctx.stroke();
}
const b0x = (h: Pt[]) => h[0][0];
const b1x = (h: Pt[]) => h[1][0];

// ------------------------------------------------------------------------------------------------
// Geometry
// ------------------------------------------------------------------------------------------------
interface Buf {
  pos: number[];
  nrm: number[];
  uv: number[];
}
const newBuf = (): Buf => ({ pos: [], nrm: [], uv: [] });

function toGeo(b: Buf, withUv: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(withUv ? b.uv : new Array((b.pos.length / 3) * 2).fill(0), 2));
  const n = b.pos.length / 3;
  const idx = new Array<number>(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * Lucky stands perpendicular to the Boulevard like the real pylon, so traffic from both directions
 * reads a face: yaw 0 = the main face looks south (toward the player walking up the Strip), the
 * second face north.
 */
export function buildLuckySign(b: WorldBuilder, lx: number, lz: number, yaw = 0): void {
  const s = 0.045; // metres per photo px
  const base = 4.6; // the cabinets ride on steel pylons
  const X = (px: number) => (px - 170) * s;
  const Yw = (py: number) => (510 - py) * s + base;
  const front = newBuf();
  const rest = newBuf();
  const vA = new THREE.Vector3();
  const nA = new THREE.Vector3();
  /** Extrude a photo-px silhouette from local -z1 to z1 (local +z = the main face, -z = the second face). */
  const ext = (pts: Pt[], _z0: number, z1: number) => {
    const z0 = -z1;
    const shape = new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(X(px), Yw(py))));
    const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, z0);
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position as THREE.BufferAttribute;
    const nn = ng.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 3) {
      let isFront = true;
      let isBack = true;
      for (let k = 0; k < 3; k++) {
        if (nn.getZ(i + k) < 0.9) isFront = false;
        if (nn.getZ(i + k) > -0.9) isBack = false;
      }
      const dst = isFront || isBack ? front : rest;
      for (let k = 0; k < 3; k++) {
        vA.fromBufferAttribute(p, i + k);
        nA.fromBufferAttribute(nn, i + k);
        dst.pos.push(vA.x, vA.y, vA.z);
        dst.nrm.push(nA.x, nA.y, nA.z);
        if (isFront || isBack) {
          const px = vA.x / s + 170;
          const py = 510 - (vA.y - base) / s;
          dst.uv.push((isBack ? 0.5 : 0) + (px / IMG_W) * 0.5, 1 - py / IMG_H);
        } else dst.uv.push(0, 0);
      }
    }
    g.dispose();
    if (ng !== g) ng.dispose();
  };
  // back → front, matching the paint order
  ext(COLLAR, -0.5, 0.5);
  ext(flare(-1), -0.42, 0.42);
  ext(flare(1), -0.42, 0.42);
  ext(BOTTOM_FLAMES, -0.42, 0.42);
  ext(SLEEVE_L, -0.35, 0.6);
  ext(CUFF_L, -0.3, 0.68);
  ext(FINGER_L, -0.25, 0.7);
  ext(PALM_L, -0.3, 0.74);
  ext(THUMB_L, -0.25, 0.76);
  ext(rect(...NAME), -0.62, 0.72);
  ext(rect(...READER), -0.6, 0.66);
  HAIR.forEach(([x, y, r], i) => ext(circle(x, y, r, 20), -0.42, 0.7 + (i % 3) * 0.01));
  ext(ellipse(FACE.cx, FACE.cy, FACE.rx, FACE.ry, 40), -0.45, 0.82);
  ext(HAT, -0.3, 0.86);
  ext(circle(HAT[2][0], HAT[2][1] - 1, 9, 16), -0.3, 0.92);
  ext(STICK, -0.08, 0.2);
  ext(circle(LOLLI.cx, LOLLI.cy, LOLLI.r, 48), -0.14, 0.3);
  ext(circle(GLOVE_R.cx, GLOVE_R.cy, GLOVE_R.r, 24), -0.3, 0.6);

  const rot = new THREE.Matrix4().makeRotationY(yaw).setPosition(lx, 0, lz);
  const art = paint(false);
  const glowTex = paint(true);
  const faceM = b.nightGlow(new THREE.MeshStandardMaterial({ map: art, emissiveMap: glowTex, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.55, metalness: 0.05 }), 0.15, 1.0);
  const sideM = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x3a1420, roughness: 0.6, metalness: 0.2, emissive: 0x5a0a2a, emissiveIntensity: 0.05 }), 0.05, 0.5);
  const fg = toGeo(front, true);
  fg.applyMatrix4(rot);
  const rg = toGeo(rest, false);
  rg.applyMatrix4(rot);
  const fm = new THREE.Mesh(fg, faceM);
  const rm = new THREE.Mesh(rg, sideM);
  fm.castShadow = rm.castShadow = true;
  fm.receiveShadow = rm.receiveShadow = true;
  b.add(fm);
  b.add(rm);

  // the 3D nose ball
  const noseM = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xe0101e, roughness: 0.25, metalness: 0.1, emissive: 0xff2030, emissiveIntensity: 0.05 }), 0.05, 0.65);
  for (const side of [1, -1]) {
    const nose = new THREE.Mesh(new THREE.SphereGeometry(11 * s, 18, 12), noseM);
    nose.position.set(X(FACE.cx), Yw(FACE.cy + 4), 0.86 * side).applyMatrix4(rot);
    b.add(nose);
  }

  // Lucky's giant shoes: round 3D clown shoes (yellow uppers, red bulb toes curling up, red soles)
  const shoeY = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xffc81e, roughness: 0.4, emissive: 0xffa020, emissiveIntensity: 0.04 }), 0.04, 0.32);
  const shoeR = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xd8101e, roughness: 0.35, emissive: 0xff2020, emissiveIntensity: 0.04 }), 0.04, 0.3);
  const sole = new THREE.MeshStandardMaterial({ color: 0x5a0a14, roughness: 0.6 });
  const blob = (m: THREE.Material, px: number, py: number, z: number, rx: number, ry: number, rz: number, tilt = 0) => {
    const g = new THREE.SphereGeometry(1, 20, 14);
    g.scale(rx, ry, rz);
    if (tilt) g.rotateZ(tilt);
    const me = new THREE.Mesh(g, m);
    me.position.set(X(px), Yw(py), z).applyMatrix4(rot);
    me.rotation.y = yaw;
    me.castShadow = true;
    b.add(me);
    // the face-side trims get a twin on the second face
    if (z > 0.5) {
      const twin = me.clone();
      twin.position.set(X(px), Yw(py), -z).applyMatrix4(rot);
      b.add(twin);
    }
  };
  const leg = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xe8285a, roughness: 0.5, emissive: 0xff3a7a, emissiveIntensity: 0.04 }), 0.04, 0.22);
  for (const d of [-1, 1]) {
    const hx = d < 0 ? 104 : 232; // heel end, tucked behind the flame skirt
    const tx = d < 0 ? 30 : 306; // the big round toe
    const y = 470;
    // stubby striped leg up behind the flames so the shoe hangs from Lucky, not the sky
    blob(leg, hx + d * 4, 452, -0.35, 0.55, 1.1, 0.55);
    // yellow upper rising toward the toe, the big red toe bulb, a curled tip, a dark sole under the heel half
    blob(shoeY, (hx + tx) / 2, y + 2, -0.05, 2.05, 0.92, 1.0, d * -0.12);
    blob(shoeR, tx, y - 4, 0.05, 1.25, 1.12, 1.15);
    blob(shoeR, tx + d * 8, y - 31, 0.1, 0.5, 0.5, 0.5);
    blob(shoeY, tx + d * 2, y - 20, 0.1, 0.62, 0.42, 0.62, d * 0.6);
    blob(sole, (hx + tx) / 2 - d * 8, y + 20, -0.05, 1.7, 0.22, 0.95);
    for (let i = 0; i < 3; i++) blob(shoeR, hx + d * (12 + i * 9), y - 18 + i * 2, 0.78, 0.18, 0.07, 0.18, d * 0.3);
    blob(shoeY, hx + d * 30, y - 21, 0.8, 0.28, 0.18, 0.18);
  }

  // steel pylons + planter
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c44, roughness: 0.5, metalness: 0.6 });
  for (const px of [148, 196]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, Yw(440) + 0.4, 0.9), steel);
    post.position.set(X(px), (Yw(440) + 0.4) / 2, -0.1).applyMatrix4(rot);
    post.rotation.y = yaw;
    post.castShadow = true;
    b.add(post);
    const w = new THREE.Vector3(X(px), 0, -0.1).applyMatrix4(rot);
    b.collider(w.x - 0.5, w.x + 0.5, w.z - 0.45, w.z + 0.45, 0, Yw(440), true);
  }
  const planter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 5.6), new THREE.MeshStandardMaterial({ color: 0xe8a0b8, roughness: 0.85 }));
  const pw = new THREE.Vector3(X(172), 0.5, -0.1).applyMatrix4(rot);
  planter.position.copy(pw);
  planter.rotation.y = yaw + Math.PI / 2;
  b.add(planter);
  const phx = Math.abs(2.8 * Math.cos(yaw)) + Math.abs(1.3 * Math.sin(yaw));
  const phz = Math.abs(2.8 * Math.sin(yaw)) + Math.abs(1.3 * Math.cos(yaw));
  b.collider(pw.x - phx, pw.x + phx, pw.z - phz, pw.z + phz, 0, 1.0);

  // ---- bulbs: name frame, reader frame, flame outlines (one instanced mesh, chased per step)
  type Bulb = { p: THREE.Vector3; ring: number };
  const bulbs: Bulb[] = [];
  const along = (pts: Pt[], spacing: number, z: number, ring: number, closed = true, skip?: (x: number, y: number) => boolean) => {
    const segs = closed ? pts.length : pts.length - 1;
    let carry = 0;
    for (let i = 0; i < segs; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, by - ay);
      let d = carry;
      while (d < len) {
        const x = ax + ((bx - ax) * d) / len;
        const y = ay + ((by - ay) * d) / len;
        if (!skip?.(x, y)) for (const zz of [z, -z]) bulbs.push({ p: new THREE.Vector3(X(x), Yw(y), zz).applyMatrix4(rot), ring });
        d += spacing;
      }
      carry = d - len;
    }
  };
  const inset = (r: [number, number, number, number], d: number): Pt[] => rect(r[0] + d, r[1] + d, r[2] - d, r[3] - d).reverse();
  along(inset(NAME, 3.5), 6.2, 0.76, 0);
  along(inset(READER, 3), 6.6, 0.7, 1);
  const inPanel = (x: number, y: number) => x > NAME[0] - 2 && x < NAME[2] + 2 && y > NAME[1] - 2 && y < READER[3] + 2;
  along(flare(-1), 6.5, 0.46, 2, true, inPanel);
  along(flare(1), 6.5, 0.46, 2, true, inPanel);
  along(BOTTOM_FLAMES, 6.5, 0.46, 3, true, (x, y) => y < 446 || inPanel(x, y));
  const N = bulbs.length;
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true }), N);
  const m4 = new THREE.Matrix4();
  bulbs.forEach((bl, i) => bulbMesh.setMatrixAt(i, m4.makeTranslation(bl.p.x, bl.p.y, bl.p.z)));
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) bulbMesh.setColorAt(i, col.setRGB(0.8, 0.76, 0.62));
  bulbMesh.computeBoundingSphere();
  b.scene.add(bulbMesh);

  // ---- neon pulse on the lollipop spiral (additive overlay, night only)
  const neonTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 256, 256);
    ctx.shadowColor = '#ff3a8a';
    ctx.shadowBlur = 10;
    swirl(ctx, 128, 128, 122, ['#ff5aa0', '#ffc8e8', '#ff2a5a'], 5);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffe07a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(128, 128, 122, 0, Math.PI * 2);
    ctx.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const neonM = new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: 0xc0c0c0 });
  // one disc on each face, merged, spun about the sign's normal
  const discF = new THREE.CircleGeometry(LOLLI.r * s, 40).translate(0, 0, 0.32);
  const discB = new THREE.CircleGeometry(LOLLI.r * s, 40).rotateY(Math.PI).translate(0, 0, -0.32);
  const discs = mergeGeometries([discF, discB], false)!;
  discF.dispose();
  discB.dispose();
  const neon = new THREE.Mesh(discs, neonM);
  neon.position.set(X(LOLLI.cx), Yw(LOLLI.cy), 0).applyMatrix4(rot);
  neon.rotation.y = yaw;
  b.scene.add(neon);

  // ---- one updater: chase steps, twinkle, lollipop pulse, distance cull
  let lastStep = -1;
  let lastNight = -1;
  const at = new THREE.Vector3(lx, 12, lz);
  b.every((_dt, t, night) => {
    const far = viewer.cam.distanceToSquared(at) > 700 * 700;
    bulbMesh.visible = !far;
    neon.visible = !far && night > 0.05;
    if (far) return;
    neonM.opacity = night * (0.42 + 0.22 * Math.sin(t * 2.4));
    neon.rotation.z = -t * 0.35;
    const step = Math.floor(t * 7);
    const nq = Math.round(night * 20) / 20;
    if (step === lastStep && nq === lastNight) return;
    lastStep = step;
    lastNight = nq;
    for (let i = 0; i < N; i++) {
      const bl = bulbs[i];
      let on: boolean;
      if (bl.ring === 0) on = (i + step) % 3 !== 0;
      else if (bl.ring === 1) on = (i - step) % 4 !== 0;
      else on = ((i * 7 + step * 3) % 5 !== 0) !== ((i + step) % 2 === 0 && bl.ring === 3);
      const hot = on ? 1 : 0.22;
      // day: pale glass bulbs; night: warm incandescent chase (kept just over the bloom threshold)
      const r = 0.82 + (1.12 * hot - 0.82) * nq;
      const g = 0.78 + ((bl.ring >= 2 ? 0.78 : 0.94) * hot - 0.78) * nq;
      const bb = 0.66 + ((bl.ring >= 2 ? 0.36 : 0.58) * hot - 0.66) * nq;
      bulbMesh.setColorAt(i, col.setRGB(r, g, bb));
    }
    bulbMesh.instanceColor!.needsUpdate = true;
  });
}
