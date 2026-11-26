import * as THREE from 'three';

/**
 * One shared 2048² canvas atlas for every casino interior: slot-game art (8 themes: screen, topper,
 * bank sign, a 4×4 reel-symbol grid), felt layouts, signs, the sportsbook wall, jackpot digits and
 * themed art. One texture means every textured interior part of every casino shares one material.
 *
 * Alpha is a tint mask: opaque pixels take the mesh's vertex colour (felt colours, awnings, banners),
 * pixels written at alpha ≈ 0.6 keep their own colour (white felt lines, gold lettering).
 */
export const ATLAS = 2048;
export const THEME_W = 256;
export const THEME_COUNT = 8;

export type Rect = [number, number, number, number]; // canvas px: x, y, w, h

/** Atlas regions in canvas pixels (y down). Theme regions are for theme 0; theme k is +k·256 in x. */
export const R = {
  screen: [0, 0, 256, 512] as Rect,
  topper: [0, 512, 256, 128] as Rect,
  bankSign: [0, 640, 256, 112] as Rect,
  reels: [0, 768, 256, 256] as Rect,
  // felts (tintable)
  feltBJ: [0, 1024, 512, 256] as Rect,
  feltRoulette: [512, 1024, 512, 256] as Rect,
  feltCraps: [1024, 1024, 768, 256] as Rect,
  wheel: [1792, 1024, 256, 256] as Rect,
  // generic signs
  cashier: [0, 1280, 512, 112] as Rect,
  sportsbook: [512, 1280, 512, 112] as Rect,
  highLimit: [1024, 1280, 512, 112] as Rect,
  bar: [1536, 1280, 512, 112] as Rect,
  restrooms: [0, 1392, 256, 96] as Rect,
  atm: [256, 1392, 128, 96] as Rect,
  videoPoker: [384, 1392, 128, 96] as Rect,
  lobby: [512, 1392, 384, 96] as Rect,
  pool: [896, 1392, 384, 96] as Rect,
  shows: [1280, 1392, 384, 96] as Rect,
  limit15: [1664, 1392, 128, 96] as Rect,
  limit25: [1792, 1392, 128, 96] as Rect,
  limit100: [1920, 1392, 128, 96] as Rect,
  led: [0, 1488, 1024, 304] as Rect,
  digits: [1024, 1488, 768, 96] as Rect,
  feltPoker: [1024, 1584, 512, 208] as Rect,
  solid: [1792, 1488, 64, 64] as Rect,
  stripes: [1856, 1488, 192, 96] as Rect, // awning stripes (tintable)
  wheelBig: [1536, 1584, 256, 208] as Rect, // big-wheel topper
  shield: [1792, 1584, 128, 208] as Rect, // heraldic shield (tintable field)
  banner: [1920, 1584, 128, 208] as Rect, // heraldic banner (tintable field)
  // themed signs row
  wsop: [0, 1792, 512, 112] as Rect,
  pokerRoom: [512, 1792, 384, 112] as Rect,
  flamingoNeon: [896, 1792, 256, 256] as Rect,
  horseshoe: [1152, 1792, 192, 112] as Rect,
  looseSlots: [1344, 1792, 384, 112] as Rect,
  freePull: [1728, 1792, 320, 112] as Rect,
  boulangerie: [0, 1904, 256, 72] as Rect,
  cafe: [256, 1904, 256, 72] as Rect,
  brasserie: [512, 1904, 256, 72] as Rect,
  chocolat: [0, 1976, 256, 72] as Rect,
  fleurs: [256, 1976, 256, 72] as Rect,
  laCave: [512, 1976, 256, 72] as Rect,
  hotdogs: [1152, 1904, 384, 72] as Rect,
  reserved: [1152, 1976, 384, 72] as Rect,
  giantReels: [1536, 1904, 256, 144] as Rect,
  roundTable: [1792, 1904, 256, 144] as Rect,
};
export type RegionName = keyof typeof R;

/** Atlas rect → GL uv rect [u0, v0, du, dv] (v0 at the bottom). */
export function uvRect(r: Rect): [number, number, number, number] {
  return [r[0] / ATLAS, 1 - (r[1] + r[3]) / ATLAS, r[2] / ATLAS, r[3] / ATLAS];
}

const THEMES: Array<{ name: string; sub: string; bg: [string, string]; fg: string; frame: string; sym: string[] }> = [
  { name: 'LUCKY 777', sub: 'TRIPLE PAY', bg: ['#5a0008', '#d81a22'], fg: '#ffd94a', frame: '#ffcc33', sym: ['7', 'BAR', 'cherry', 'bell', '7', 'BAR', 'star', 'cherry', 'bell', '7', 'BAR2', 'cherry', 'star', 'bell', 'BAR3', '7'] },
  { name: 'DIAMOND DELUXE', sub: 'HIGH LIMIT', bg: ['#04143a', '#2a6cd8'], fg: '#e8f4ff', frame: '#bfe0ff', sym: ['diamond', '7', 'BAR', 'diamond', 'star', 'diamond', 'BAR2', '7', 'diamond', 'bell', 'BAR3', 'diamond', '7', 'star', 'diamond', 'BAR'] },
  { name: 'DRAGON FORTUNE', sub: 'GRAND JACKPOT', bg: ['#3a0400', '#c81e0a'], fg: '#ffd24a', frame: '#ffb020', sym: ['coin', 'dragon', 'A', 'K', 'coin', 'Q', 'J', 'dragon', 'coin', '10', 'A', 'K', 'dragon', 'Q', 'coin', 'J'] },
  { name: 'WOLF MOON', sub: 'HOLD & SPIN', bg: ['#0a0420', '#5a2aa8'], fg: '#e0d0ff', frame: '#b89cff', sym: ['moon', 'wolf', 'A', 'K', 'moon', 'Q', 'J', 'wolf', 'star', '10', 'A', 'moon', 'K', 'wolf', 'Q', 'J'] },
  { name: "PHARAOH'S GOLD", sub: 'FREE GAMES', bg: ['#032a2a', '#13908a'], fg: '#ffd96a', frame: '#e8c050', sym: ['eye', 'coin', 'A', 'K', 'eye', 'Q', 'J', 'coin', 'ankh', '10', 'A', 'eye', 'K', 'ankh', 'Q', 'J'] },
  { name: "CAT'S MEOW", sub: 'PURRFECT PAYS', bg: ['#3a0628', '#ff4fa8'], fg: '#fff0fa', frame: '#ffb8e0', sym: ['paw', 'fish', 'A', 'K', 'paw', 'Q', 'J', 'fish', 'yarn', '10', 'A', 'paw', 'K', 'fish', 'Q', 'yarn'] },
  { name: 'WHEEL OF RICHES', sub: 'SPIN THE WHEEL', bg: ['#1a0638', '#7a2ae0'], fg: '#ffe06a', frame: '#ffd040', sym: ['7', 'wheel', 'BAR', 'star', 'wheel', '7', 'BAR2', 'diamond', 'wheel', 'bell', 'BAR3', '7', 'wheel', 'star', 'BAR', 'diamond'] },
  { name: 'FIRE LINK', sub: 'FIREBALL BONUS', bg: ['#2a0800', '#ff6a00'], fg: '#fff2b0', frame: '#ffb030', sym: ['fire', 'A', 'K', 'fire', 'Q', 'J', '10', 'fire', 'coin', 'A', 'K', 'fire', 'Q', 'J', '10', 'coin'] },
];
export const SLOT_THEME_NAMES = THEMES.map((t) => t.name);

function font(px: number, weight = 'bold', family = '"Arial Black", Impact, sans-serif'): string {
  return `${weight} ${px}px ${family}`;
}

function glowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string, glow: string, maxW?: number, family?: string): void {
  ctx.save();
  ctx.font = font(px, 'bold', family);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glow;
  ctx.shadowBlur = px * 0.35;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y, maxW);
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y, maxW);
  ctx.restore();
}

function drawSymbol(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, s: number, th: (typeof THEMES)[number]): void {
  ctx.save();
  ctx.translate(cx, cy);
  const gold = '#ffd24a';
  const fill = (c: string) => {
    ctx.fillStyle = c;
    ctx.fill();
  };
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#1a1a1a';
  switch (kind) {
    case '7':
      ctx.font = font(s * 0.9);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e01822';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.strokeText('7', 0, 2);
      ctx.fillText('7', 0, 2);
      break;
    case 'BAR':
    case 'BAR2':
    case 'BAR3': {
      const n = kind === 'BAR' ? 1 : kind === 'BAR2' ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const y = (i - (n - 1) / 2) * s * 0.28;
        ctx.fillStyle = '#111';
        ctx.fillRect(-s * 0.4, y - s * 0.12, s * 0.8, s * 0.24);
        ctx.fillStyle = '#fff';
        ctx.font = font(s * 0.18);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BAR', 0, y + 1);
      }
      break;
    }
    case 'cherry':
      ctx.beginPath();
      ctx.moveTo(-s * 0.15, s * 0.05);
      ctx.quadraticCurveTo(0, -s * 0.4, s * 0.2, -s * 0.38);
      ctx.moveTo(s * 0.17, s * 0.1);
      ctx.quadraticCurveTo(s * 0.12, -s * 0.2, s * 0.2, -s * 0.38);
      ctx.strokeStyle = '#2a8a2a';
      ctx.lineWidth = 3;
      ctx.stroke();
      for (const [x, y] of [
        [-s * 0.17, s * 0.15],
        [s * 0.17, s * 0.2],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, s * 0.17, 0, Math.PI * 2);
        fill('#d0101a');
      }
      break;
    case 'bell':
      ctx.beginPath();
      ctx.moveTo(-s * 0.32, s * 0.25);
      ctx.quadraticCurveTo(-s * 0.3, -s * 0.38, 0, -s * 0.38);
      ctx.quadraticCurveTo(s * 0.3, -s * 0.38, s * 0.32, s * 0.25);
      ctx.closePath();
      fill(gold);
      ctx.beginPath();
      ctx.arc(0, s * 0.3, s * 0.08, 0, Math.PI * 2);
      fill('#a87a10');
      break;
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.17 : s * 0.4;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      fill(gold);
      break;
    }
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.4);
      ctx.lineTo(s * 0.35, -s * 0.05);
      ctx.lineTo(0, s * 0.4);
      ctx.lineTo(-s * 0.35, -s * 0.05);
      ctx.closePath();
      fill('#7fd8ff');
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, -s * 0.05);
      ctx.lineTo(s * 0.35, -s * 0.05);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      break;
    case 'coin':
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2);
      fill(gold);
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.26, 0, Math.PI * 2);
      ctx.strokeStyle = '#a87a10';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#a87a10';
      ctx.font = font(s * 0.32);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 1);
      break;
    case 'moon':
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2);
      fill('#f4f0d8');
      ctx.beginPath();
      ctx.arc(s * 0.14, -s * 0.08, s * 0.3, 0, Math.PI * 2);
      fill(th.bg[0]);
      break;
    case 'wolf':
    case 'dragon':
    case 'eye':
    case 'ankh':
    case 'fish':
    case 'paw':
    case 'yarn':
    case 'fire':
    case 'wheel': {
      const col: Record<string, string> = { wolf: '#9aa0b8', dragon: '#2ac040', eye: '#2a8ad8', ankh: gold, fish: '#5ac8ff', paw: '#ff7ac0', yarn: '#ff5a7a', fire: '#ff8a1a', wheel: '#ffd24a' };
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.38, 0, Math.PI * 2);
      fill(col[kind]);
      ctx.fillStyle = '#1a1a1a';
      if (kind === 'paw') {
        ctx.fillStyle = '#5a1030';
        ctx.beginPath();
        ctx.arc(0, s * 0.08, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc((i - 1.5) * s * 0.12, -s * 0.13 - (i === 1 || i === 2 ? s * 0.04 : 0), s * 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (kind === 'wheel') {
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, s * 0.34, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
          ctx.closePath();
          ctx.fillStyle = i % 2 ? '#c01a5a' : '#2a5ad8';
          ctx.fill();
        }
      } else {
        ctx.font = font(s * 0.36);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText({ wolf: 'W', dragon: 'D', eye: '◉', ankh: '☥', fish: '><>', yarn: '@', fire: '▲' }[kind] ?? '?', 0, 2);
      }
      break;
    }
    default:
      ctx.font = font(s * 0.62, 'bold', 'Georgia, serif');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = { A: '#e01822', K: '#2a6ad8', Q: '#9a2ad8', J: '#2a9a3a', '10': '#e08a10' }[kind] ?? '#fff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.strokeText(kind, 0, 2);
      ctx.fillText(kind, 0, 2);
  }
  ctx.restore();
}

function drawTheme(ctx: CanvasRenderingContext2D, k: number): void {
  const th = THEMES[k];
  const x0 = k * THEME_W;
  // --- portrait screen art ---
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, th.bg[1]);
  g.addColorStop(0.55, th.bg[0]);
  g.addColorStop(1, th.bg[0]);
  ctx.fillStyle = g;
  ctx.fillRect(x0, 0, 256, 512);
  // rays behind the title
  ctx.save();
  ctx.translate(x0 + 128, 110);
  for (let i = 0; i < 16; i++) {
    ctx.rotate(Math.PI / 8);
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.0)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-30, 220);
    ctx.lineTo(30, 220);
    ctx.fill();
  }
  ctx.restore();
  glowText(ctx, th.name, x0 + 128, 70, 34, th.fg, th.frame, 236);
  glowText(ctx, th.sub, x0 + 128, 108, 18, '#ffffff', th.frame, 220);
  // jackpot ladder
  const ladder = ['GRAND', 'MAJOR', 'MINOR', 'MINI'];
  const lc = ['#ff3a3a', '#ff9a1a', '#3ad84a', '#3aa8ff'];
  ladder.forEach((l, i) => {
    const y = 138 + i * 30;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x0 + 18, y, 220, 26);
    ctx.strokeStyle = lc[i];
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 18, y, 220, 26);
    ctx.fillStyle = lc[i];
    ctx.font = font(15);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(l, x0 + 26, y + 14);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.fillText(['$25,410', '$1,280', '$62.50', '$12.80'][i], x0 + 230, y + 14);
  });
  // reel window frame (the reels render inside u 0.06..0.94, v 0.05..0.47)
  ctx.fillStyle = '#05060a';
  ctx.fillRect(x0 + 12, 268, 232, 222);
  ctx.strokeStyle = th.frame;
  ctx.lineWidth = 5;
  ctx.strokeRect(x0 + 12, 268, 232, 222);
  // credit meter strip
  ctx.fillStyle = '#000';
  ctx.fillRect(x0, 494, 256, 18);
  ctx.fillStyle = '#ffd24a';
  ctx.font = font(11, 'bold', 'monospace');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('CREDIT 4,820   BET 88   WIN 0', x0 + 8, 503);

  // --- topper ---
  const tg = ctx.createLinearGradient(0, 512, 0, 640);
  tg.addColorStop(0, th.bg[1]);
  tg.addColorStop(1, th.bg[0]);
  ctx.fillStyle = tg;
  ctx.fillRect(x0, 512, 256, 128);
  ctx.strokeStyle = th.frame;
  ctx.lineWidth = 6;
  ctx.strokeRect(x0 + 4, 516, 248, 120);
  glowText(ctx, th.name, x0 + 128, 562, 32, th.fg, th.frame, 232);
  glowText(ctx, '$ ' + ['25,410.77', '108,442.10', '1,048,576.00', '77,777.77', '250,000.00', '9,999.99', '1,000,000.00', '42,420.42'][k], x0 + 128, 604, 22, '#ffffff', '#ff3a3a', 232);

  // --- bank sign ---
  ctx.fillStyle = '#0a0a10';
  ctx.fillRect(x0, 640, 256, 112);
  const bg2 = ctx.createLinearGradient(0, 644, 0, 748);
  bg2.addColorStop(0, th.bg[1]);
  bg2.addColorStop(1, th.bg[0]);
  ctx.fillStyle = bg2;
  ctx.fillRect(x0 + 4, 644, 248, 104);
  glowText(ctx, th.name, x0 + 128, 682, 30, th.fg, th.frame, 236);
  glowText(ctx, 'PROGRESSIVE', x0 + 128, 722, 16, '#ffffff', th.frame, 220);

  // --- reel symbols (4×4 grid of 64 px cells) ---
  for (let i = 0; i < 16; i++) {
    const cx = x0 + (i % 4) * 64;
    const cy = 768 + Math.floor(i / 4) * 64;
    const sg = ctx.createLinearGradient(0, cy, 0, cy + 64);
    sg.addColorStop(0, '#d8d8e0');
    sg.addColorStop(0.5, '#ffffff');
    sg.addColorStop(1, '#d0d0d8');
    ctx.fillStyle = sg;
    ctx.fillRect(cx, cy, 64, 64);
    drawSymbol(ctx, th.sym[i], cx + 32, cy + 32, 56, th);
  }
}

/** Alpha 150 for anything not near the felt base grey, so lines and lettering keep their colour. */
function maskTint(ctx: CanvasRenderingContext2D, r: Rect, base: [number, number, number]): void {
  const img = ctx.getImageData(r[0], r[1], r[2], r[3]);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.abs(d[i] - base[0]) + Math.abs(d[i + 1] - base[1]) + Math.abs(d[i + 2] - base[2]);
    if (dist > 40) d[i + 3] = 150;
  }
  ctx.putImageData(img, r[0], r[1]);
}

const FELT = '#c4c4c4';
const FELT_RGB: [number, number, number] = [196, 196, 196];

function drawFelts(ctx: CanvasRenderingContext2D): void {
  const line = '#fdf6e0';
  const gold = '#f4cf5a';
  // Blackjack: semicircle, flat dealer edge at the top of the region
  {
    const [x, y, w, h] = R.feltBJ;
    ctx.fillStyle = FELT;
    ctx.fillRect(x, y, w, h);
    const cx = x + w / 2;
    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, y, h * 0.78, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, y, h * 0.56, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.font = font(15, 'bold', 'Georgia, serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BLACKJACK PAYS 3 TO 2', cx, y + h * 0.42);
    ctx.font = font(11, 'bold', 'Georgia, serif');
    ctx.fillStyle = line;
    ctx.fillText('Dealer must draw to 16, and stand on all 17s', cx, y + h * 0.5);
    ctx.fillText('INSURANCE PAYS 2 TO 1', cx, y + h * 0.66);
    for (let i = 0; i < 6; i++) {
      const a = 0.18 * Math.PI + (i / 5) * 0.64 * Math.PI;
      const px = cx + Math.cos(a) * h * 0.9;
      const py = y + Math.sin(a) * h * 0.9;
      ctx.strokeStyle = line;
      ctx.lineWidth = 2;
      ctx.strokeRect(px - 13, py - 9, 26, 18);
    }
  }
  // Roulette layout: 0/00 column + 3×12 grid + outside bets
  {
    const [x, y, w, h] = R.feltRoulette;
    ctx.fillStyle = FELT;
    ctx.fillRect(x, y, w, h);
    const gx = x + 70;
    const gy = y + 30;
    const cw = (w - 110) / 12;
    const ch = 44;
    const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = line;
    for (let c = 0; c < 12; c++) {
      for (let r = 0; r < 3; r++) {
        const n = c * 3 + (3 - r);
        const px = gx + c * cw;
        const py = gy + r * ch;
        ctx.fillStyle = reds.has(n) ? '#c8141e' : '#121212';
        ctx.beginPath();
        ctx.ellipse(px + cw / 2, py + ch / 2, cw * 0.32, ch * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeRect(px, py, cw, ch);
        ctx.fillStyle = line;
        ctx.font = font(13, 'bold', 'Georgia, serif');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), px + cw / 2, py + ch / 2 + 1);
      }
    }
    ctx.strokeRect(x + 30, gy, 40, ch * 1.5);
    ctx.strokeRect(x + 30, gy + ch * 1.5, 40, ch * 1.5);
    ctx.fillStyle = line;
    ctx.fillText('0', x + 50, gy + ch * 0.75);
    ctx.fillText('00', x + 50, gy + ch * 2.25);
    const by = gy + ch * 3;
    ['1st 12', '2nd 12', '3rd 12'].forEach((t, i) => {
      ctx.strokeRect(gx + i * cw * 4, by, cw * 4, 34);
      ctx.fillText(t, gx + i * cw * 4 + cw * 2, by + 17);
    });
    ['1-18', 'EVEN', '◆', '◆', 'ODD', '19-36'].forEach((t, i) => {
      ctx.strokeRect(gx + i * cw * 2, by + 34, cw * 2, 34);
      ctx.fillStyle = t === '◆' ? (i === 2 ? '#c8141e' : '#121212') : line;
      ctx.fillText(t, gx + i * cw * 2 + cw, by + 51);
      ctx.fillStyle = line;
    });
  }
  // Craps: pass line, come, field, center props, both ends mirrored
  {
    const [x, y, w, h] = R.feltCraps;
    ctx.fillStyle = FELT;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    ctx.fillStyle = line;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const side of [0, 1]) {
      const sx = side ? x + w - 280 : x + 20;
      ctx.strokeRect(sx, y + 20, 260, h - 40);
      ctx.strokeRect(sx + 10, y + h - 60, 240, 30);
      ctx.font = font(16, 'bold', 'Georgia, serif');
      ctx.fillText('PASS LINE', sx + 130, y + h - 45);
      ctx.strokeRect(sx + 30, y + 110, 200, 70);
      ctx.fillText('COME', sx + 130, y + 145);
      ctx.font = font(13, 'bold', 'Georgia, serif');
      ctx.fillStyle = gold;
      ctx.fillText('FIELD  2 • 3 • 4 • 9 • 10 • 11 • 12', sx + 130, y + 95);
      ctx.fillStyle = line;
      for (let i = 0; i < 6; i++) {
        ctx.strokeRect(sx + 10 + i * 40, y + 30, 40, 50);
        ctx.fillText(['4', '5', 'SIX', '8', 'NINE', '10'][i], sx + 30 + i * 40, y + 55);
      }
    }
    const mx = x + w / 2;
    ctx.strokeRect(mx - 90, y + 30, 180, h - 60);
    ctx.font = font(12, 'bold', 'Georgia, serif');
    ctx.fillStyle = '#e8202a';
    ctx.fillText('SEVEN 4 TO 1', mx, y + 50);
    ctx.fillStyle = line;
    ctx.fillText('HARDWAYS', mx, y + 90);
    for (let i = 0; i < 4; i++) ctx.strokeRect(mx - 80 + (i % 2) * 80, y + 105 + Math.floor(i / 2) * 40, 80, 40);
    ctx.fillStyle = '#e8202a';
    ctx.fillText('ANY CRAPS 7 TO 1', mx, y + h - 45);
  }
  // Poker (WSOP oval): betting line + logo
  {
    const [x, y, w, h] = R.feltPoker;
    ctx.fillStyle = FELT;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w * 0.4, h * 0.34, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = line;
    ctx.font = font(22, 'bold', 'Georgia, serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WSOP', x + w / 2, y + h / 2 - 8);
    ctx.font = font(10, 'bold', 'Georgia, serif');
    ctx.fillText('WORLD SERIES OF POKER', x + w / 2, y + h / 2 + 14);
  }
  maskTint(ctx, R.feltBJ, FELT_RGB);
  maskTint(ctx, R.feltRoulette, FELT_RGB);
  maskTint(ctx, R.feltCraps, FELT_RGB);
  maskTint(ctx, R.feltPoker, FELT_RGB);
}

function drawWheel(ctx: CanvasRenderingContext2D, r: Rect, pockets: number, big: boolean): void {
  const [x, y, w, h] = r;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rad = Math.min(w, h) / 2 - 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = big ? '#ffd24a' : '#5a3418';
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
  const order = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
  const vals = ['$1', '$5', '$10', '$25', '$100', '$5', '$10', '$1K', '$5', '$25', '$10', 'JACKPOT'];
  for (let i = 0; i < pockets; i++) {
    const a0 = (i / pockets) * Math.PI * 2;
    const a1 = ((i + 1) / pockets) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rad * (big ? 0.97 : 0.92), a0, a1);
    ctx.closePath();
    if (big) ctx.fillStyle = ['#d81a3a', '#2a5ad8', '#1aa84a', '#8a2ad8', '#ff8a1a', '#1ab8c8'][i % 6];
    else ctx.fillStyle = order[i] === 0 || order[i] === 37 ? '#1a8a2a' : i % 2 ? '#141414' : '#c8141e';
    ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((a0 + a1) / 2);
    ctx.fillStyle = '#fff';
    ctx.font = font(big ? 15 : 10);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(big ? vals[i % vals.length] : order[i] === 37 ? '00' : String(order[i]), rad * 0.9, 0);
    ctx.restore();
  }
  ctx.fillStyle = big ? '#2a0a3a' : '#7a4a20';
  ctx.beginPath();
  ctx.arc(cx, cy, rad * (big ? 0.36 : 0.55), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.arc(cx, cy, rad * 0.12, 0, Math.PI * 2);
  ctx.fill();
  if (big) glowText(ctx, 'SPIN', cx, cy, 26, '#ffe06a', '#ff3aa8');
}

function sign(ctx: CanvasRenderingContext2D, r: Rect, text: string, bg: string, fg: string, glow: string, sub?: string, family?: string, border?: string): void {
  const [x, y, w, h] = r;
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  }
  const px = sub ? h * 0.42 : h * 0.55;
  glowText(ctx, text, x + w / 2, y + (sub ? h * 0.4 : h * 0.52), px, fg, glow, w - 20, family);
  if (sub) glowText(ctx, sub, x + w / 2, y + h * 0.78, h * 0.18, '#ffffff', glow, w - 20, family);
}

function drawSigns(ctx: CanvasRenderingContext2D): void {
  sign(ctx, R.cashier, 'CASHIER', '#0c0a06', '#ffd24a', '#ffaa20', 'CASINO CAGE • CREDIT', undefined, '#c8a040');
  sign(ctx, R.sportsbook, 'SPORTSBOOK', '#050a1a', '#7ae0ff', '#2a8aff', 'RACE • SPORTS • LIVE ODDS', undefined, '#2a6ad8');
  sign(ctx, R.highLimit, 'HIGH LIMIT', '#14060a', '#ffd9a0', '#ff4a6a', 'SALON PRIVÉ', 'Georgia, serif', '#c8a040');
  sign(ctx, R.bar, 'CASINO BAR', '#100614', '#ff8ad8', '#ff2aa8', 'COCKTAILS • VIDEO POKER', undefined, '#ff5ac0');
  sign(ctx, R.restrooms, 'RESTROOMS', '#14161c', '#ffffff', '#9ab0ff', '♀  ♂');
  sign(ctx, R.atm, 'ATM', '#0a3a1a', '#ffffff', '#4aff8a');
  {
    const [x, y, w, h] = R.videoPoker;
    ctx.fillStyle = '#0a1a6a';
    ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 6 + i * 24, y + 40, 20, 30);
      ctx.fillStyle = i % 2 ? '#c8141e' : '#111';
      ctx.font = font(12);
      ctx.textAlign = 'center';
      ctx.fillText(['A', 'K', 'Q', 'J', '10'][i], x + 16 + i * 24, y + 60);
    }
    glowText(ctx, 'JACKS OR BETTER', x + w / 2, y + 18, 12, '#ffe06a', '#ff8a00', w - 8);
    glowText(ctx, 'DEAL  DRAW', x + w / 2, y + 84, 10, '#7affa0', '#00ff60', w - 8);
  }
  sign(ctx, R.lobby, '← HOTEL LOBBY', '#101418', '#ffffff', '#ffd9a0');
  sign(ctx, R.pool, 'POOL  →', '#101418', '#ffffff', '#7ae0ff');
  sign(ctx, R.shows, 'SHOWS • DINING ↑', '#101418', '#ffffff', '#ffb0e0');
  sign(ctx, R.limit15, '$15', '#081a10', '#ffffff', '#4aff8a', 'MIN • $1,000 MAX');
  sign(ctx, R.limit25, '$25', '#1a0808', '#ffffff', '#ff6a4a', 'MIN • $5,000 MAX');
  sign(ctx, R.limit100, '$100', '#14100a', '#ffd24a', '#ffaa20', 'MIN • $10K MAX');
  // Sportsbook LED wall: games grid with odds + a horse race
  {
    const [x, y, w, h] = R.led;
    ctx.fillStyle = '#03060c';
    ctx.fillRect(x, y, w, h);
    const teams = [
      ['RAIDERS', 'CHIEFS', '+3.5', 'O 47.5'],
      ['GOLDEN KNIGHTS', 'AVALANCHE', '-1.5', 'O 6.5'],
      ['ACES', 'LIBERTY', '+2', 'O 168'],
      ['LAKERS', 'CELTICS', '-4.5', 'O 221'],
      ['49ERS', 'COWBOYS', '-6', 'O 44'],
      ['DODGERS', 'YANKEES', '-140', 'O 8.5'],
    ];
    for (let i = 0; i < 6; i++) {
      const px = x + 10 + (i % 3) * 336;
      const py = y + 10 + Math.floor(i / 3) * 96;
      ctx.fillStyle = '#0a1830';
      ctx.fillRect(px, py, 326, 88);
      ctx.strokeStyle = '#2a6ad8';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, 326, 88);
      ctx.font = font(18, 'bold', 'Arial, sans-serif');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(teams[i][0], px + 10, py + 24, 200);
      ctx.fillText(teams[i][1], px + 10, py + 62, 200);
      ctx.fillStyle = '#ffd24a';
      ctx.textAlign = 'right';
      ctx.fillText(teams[i][2], px + 250, py + 24);
      ctx.fillStyle = '#7affa0';
      ctx.fillText(teams[i][3], px + 318, py + 62);
      ctx.fillStyle = '#ff5a5a';
      ctx.font = font(12, 'bold', 'Arial, sans-serif');
      ctx.textAlign = 'right';
      ctx.fillText(i % 2 ? 'LIVE Q3' : '7:05 PM', px + 318, py + 24);
    }
    // race track strip
    const ry = y + 206;
    ctx.fillStyle = '#1a3a12';
    ctx.fillRect(x + 10, ry, w - 20, 88);
    ctx.fillStyle = '#7a5a30';
    ctx.fillRect(x + 10, ry + 20, w - 20, 48);
    const silks = ['#e8202a', '#ffd24a', '#2a6ad8', '#2ab84a', '#ff7ac0', '#ffffff'];
    for (let i = 0; i < 6; i++) {
      const hx = x + 120 + ((i * 137) % 700);
      ctx.fillStyle = '#3a2412';
      ctx.fillRect(hx, ry + 30 + (i % 3) * 10, 30, 12);
      ctx.fillStyle = silks[i];
      ctx.fillRect(hx + 18, ry + 24 + (i % 3) * 10, 9, 9);
    }
    ctx.font = font(16, 'bold', 'Arial, sans-serif');
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('SANTA ANITA  R5  •  1 MILE TURF  •  POST 7:12', x + 20, ry + 82);
  }
  // Jackpot digits: 0-9, $, . (amber LED)
  {
    const [x, y, , h] = R.digits;
    for (let i = 0; i < 12; i++) {
      const cx = x + i * 64;
      ctx.fillStyle = '#080202';
      ctx.fillRect(cx, y, 64, h);
      glowText(ctx, i < 10 ? String(i) : i === 10 ? '$' : '.', cx + 32, y + h / 2 + 2, 70, '#ffb020', '#ff4a00', 60, '"Courier New", monospace');
    }
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(...R.solid);
  // Awning stripes (tintable stripe + cream stripe)
  {
    const [x, y, w, h] = R.stripes;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#f6eedc' : FELT;
      ctx.fillRect(x + (i * w) / 6, y, w / 6, h);
    }
    // scalloped edge shading
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y + h - 10, w, 10);
    maskTint(ctx, R.stripes, FELT_RGB);
  }
  drawWheel(ctx, R.wheel, 38, false);
  drawWheel(ctx, [R.wheelBig[0], R.wheelBig[1], 256, 208], 24, true);
  // Heraldic shield + banner (tintable field, gold charges)
  {
    const [x, y, w, h] = R.shield;
    ctx.fillStyle = '#20140c';
    ctx.fillRect(x, y, w, h);
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 8);
    ctx.lineTo(x + w - 8, y + 8);
    ctx.lineTo(x + w - 8, y + h * 0.55);
    ctx.quadraticCurveTo(x + w - 10, y + h * 0.88, x + w / 2, y + h - 6);
    ctx.quadraticCurveTo(x + 10, y + h * 0.88, x + 8, y + h * 0.55);
    ctx.closePath();
    ctx.fillStyle = FELT;
    ctx.fill();
    ctx.strokeStyle = '#e8c050';
    ctx.lineWidth = 6;
    ctx.stroke();
    glowText(ctx, '♜', x + w / 2, y + h * 0.42, 64, '#f4cf5a', '#a87a10');
  }
  {
    const [x, y, w, h] = R.banner;
    ctx.fillStyle = FELT;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#f4cf5a';
    ctx.fillRect(x, y, w, 10);
    ctx.fillRect(x + 8, y, 8, h);
    ctx.fillRect(x + w - 16, y, 8, h);
    glowText(ctx, '⚜', x + w / 2, y + h * 0.4, 70, '#f4cf5a', '#a87a10');
    maskTint(ctx, R.banner, FELT_RGB);
  }
  maskTint(ctx, R.shield, FELT_RGB);

  sign(ctx, R.wsop, 'WORLD SERIES OF POKER', '#0a0a0a', '#ffd24a', '#ffaa20', 'POKER ROOM • DAILY TOURNAMENTS', undefined, '#c8a040');
  sign(ctx, R.pokerRoom, 'POKER ROOM', '#1a0204', '#ffffff', '#ff3a3a', 'NO LIMIT HOLD’EM');
  {
    const [x, y, w, h] = R.flamingoNeon;
    ctx.fillStyle = '#12030e';
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2 + 10);
    ctx.strokeStyle = '#ff4fb8';
    ctx.shadowColor = '#ff2aa8';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(10, 0, 44, 26, -0.2, 0, Math.PI * 2); // body
    ctx.moveTo(-26, -10);
    ctx.quadraticCurveTo(-60, -40, -36, -78); // neck
    ctx.quadraticCurveTo(-26, -92, -10, -80); // head
    ctx.lineTo(-2, -66); // beak
    ctx.moveTo(6, 24);
    ctx.lineTo(4, 96); // leg
    ctx.moveTo(20, 22);
    ctx.lineTo(30, 60);
    ctx.lineTo(10, 64);
    ctx.stroke();
    ctx.restore();
    glowText(ctx, 'FLAMINGO', x + w / 2, y + 26, 28, '#ffe0f4', '#ff2aa8', w - 16);
  }
  {
    const [x, y, w, h] = R.horseshoe;
    ctx.fillStyle = '#0a0606';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffcc33';
    ctx.shadowColor = '#ff9a00';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(x + 50, y + h / 2 + 6, 30, 0.75 * Math.PI, 0.25 * Math.PI);
    ctx.stroke();
    ctx.shadowBlur = 0;
    glowText(ctx, 'HORSESHOE', x + 125, y + h / 2, 22, '#ffcc33', '#ff3a1a', 120);
  }
  sign(ctx, R.looseSlots, 'LOOSEST SLOTS!', '#ffe000', '#d80010', '#ff6a00', 'ON THE STRIP • 98% PAYBACK*', undefined, '#d80010');
  sign(ctx, R.freePull, 'FREE PULL!', '#d80010', '#ffffff', '#ffe000', 'WIN A T-SHIRT', undefined, '#ffe000');
  sign(ctx, R.boulangerie, 'Boulangerie', '#1a2a4a', '#f4e6c0', '#ffd9a0', undefined, 'Georgia, serif');
  sign(ctx, R.cafe, 'Café Belle Madeleine', '#3a0a14', '#f4e6c0', '#ffd9a0', undefined, 'Georgia, serif');
  sign(ctx, R.brasserie, 'Le Central Brasserie', '#0a2a1a', '#f4e6c0', '#ffd9a0', undefined, 'Georgia, serif');
  sign(ctx, R.chocolat, 'Chocolatier', '#3a1a0a', '#f4e6c0', '#ffd9a0', undefined, 'Georgia, serif');
  sign(ctx, R.fleurs, 'Les Fleurs', '#2a0a2a', '#f4e6c0', '#ffd9a0', undefined, 'Georgia, serif');
  sign(ctx, R.laCave, 'La Cave • Vins', '#2a0a0a', '#f4e6c0', '#ffd9a0', undefined, 'Georgia, serif');
  sign(ctx, R.hotdogs, 'HOT DOGS $1.99', '#ffe000', '#c80010', '#ff6a00', undefined, undefined, '#c80010');
  sign(ctx, R.reserved, "RESERVED FOR LOU", '#14060a', '#ffd24a', '#ff4a6a', undefined, undefined, '#ffd24a');
  {
    // giant novelty slot: three big 7s
    const [x, y, w, h] = R.giantReels;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#e8e8ee';
      ctx.fillRect(x + 4 + i * 84, y + 4, 80, h - 8);
      ctx.fillStyle = '#e01822';
      ctx.font = font(96);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('7', x + 44 + i * 84, y + h / 2 + 6);
    }
    ctx.fillStyle = 'rgba(255,0,0,0.6)';
    ctx.fillRect(x, y + h / 2 - 2, w, 4);
  }
  sign(ctx, R.roundTable, 'THE ROUND TABLE', '#2a0a0a', '#ffd24a', '#ff8a20', 'TOURNAMENT OF KINGS', 'Georgia, serif', '#ffd24a');
}

let atlasTex: THREE.CanvasTexture | null = null;
/** The shared interior atlas (built once, on first use). */
export function interiorAtlas(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas');
  c.width = ATLAS;
  c.height = ATLAS;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ATLAS, ATLAS);
  for (let k = 0; k < THEME_COUNT; k++) drawTheme(ctx, k);
  drawFelts(ctx);
  drawSigns(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.premultiplyAlpha = false;
  atlasTex = t;
  return t;
}

// ---------------------------------------------------------------- tiling surface textures
function tile(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const texCache = new Map<string, THREE.CanvasTexture>();
function cached(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = texCache.get(key);
  if (!t) {
    t = make();
    texCache.set(key, t);
  }
  return t;
}

/** Paris: the painted Parisian sky (one tile spans the whole ceiling). */
export function skyTexture(): THREE.CanvasTexture {
  return cached('sky', () =>
    tile(1024, 512, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, '#5f9ee0');
      g.addColorStop(1, '#8ec4f0');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1024, 512);
      const r = prng(77);
      for (let i = 0; i < 26; i++) {
        const cx = r() * 1024;
        const cy = r() * 512;
        const s = 30 + r() * 60;
        for (let k = 0; k < 9; k++) {
          const x = cx + (r() - 0.5) * s * 2.4;
          const y = cy + (r() - 0.5) * s * 0.7;
          const rad = s * (0.35 + r() * 0.5);
          for (const [ox, oy] of [
            [0, 0],
            [-1024, 0],
            [1024, 0],
            [0, -512],
            [0, 512],
          ]) {
            const gg = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
            gg.addColorStop(0, 'rgba(255,255,255,0.85)');
            gg.addColorStop(0.6, 'rgba(250,246,255,0.45)');
            gg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = gg;
            ctx.beginPath();
            ctx.arc(x + ox, y + oy, rad, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    })
  );
}

/** Cobblestones (Paris paths). 1 tile ≈ 2 m. */
export function cobbleTexture(): THREE.CanvasTexture {
  return cached('cobble', () =>
    tile(256, 256, (ctx) => {
      ctx.fillStyle = '#5a5048';
      ctx.fillRect(0, 0, 256, 256);
      const r = prng(31);
      for (let row = 0; row < 10; row++) {
        const off = (row % 2) * 13;
        for (let col = -1; col < 11; col++) {
          const x = col * 26 + off;
          const y = row * 25.6;
          const v = 120 + Math.floor(r() * 60);
          ctx.fillStyle = `rgb(${v + 20},${v + 8},${v - 6})`;
          ctx.beginPath();
          ctx.ellipse(x + 13, y + 12.8, 11.5, 10.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath();
          ctx.ellipse(x + 10, y + 9, 5, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    })
  );
}

/** Castle ashlar stone (Excalibur). 1 tile ≈ 4 m. */
export function stoneTexture(): THREE.CanvasTexture {
  return cached('stone', () =>
    tile(256, 256, (ctx) => {
      ctx.fillStyle = '#4a4038';
      ctx.fillRect(0, 0, 256, 256);
      const r = prng(53);
      for (let row = 0; row < 8; row++) {
        const off = (row % 2) * 32;
        for (let col = -1; col < 5; col++) {
          const v = 150 + Math.floor(r() * 50);
          ctx.fillStyle = `rgb(${v},${v - 10},${v - 26})`;
          ctx.fillRect(col * 64 + off + 2, row * 32 + 2, 60, 28);
          ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`;
          ctx.fillRect(col * 64 + off + 2, row * 32 + 22, 60, 8);
        }
      }
    })
  );
}

/** Acoustic drop-ceiling tiles (Slots-A-Fun): 1 tile = 2×2 ceiling tiles (1.2 m). */
export function ceilingTileTexture(): THREE.CanvasTexture {
  return cached('acoustic', () =>
    tile(128, 128, (ctx) => {
      ctx.fillStyle = '#d8d2c4';
      ctx.fillRect(0, 0, 128, 128);
      const r = prng(9);
      for (let i = 0; i < 300; i++) {
        ctx.fillStyle = `rgba(80,70,60,${0.15 + r() * 0.2})`;
        ctx.fillRect(r() * 128, r() * 128, 1.5, 1.5);
      }
      ctx.fillStyle = 'rgba(150,110,60,0.25)'; // a water stain
      ctx.beginPath();
      ctx.arc(90, 36, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9a9488';
      ctx.fillRect(0, 0, 128, 3);
      ctx.fillRect(0, 64, 128, 3);
      ctx.fillRect(0, 0, 3, 128);
      ctx.fillRect(64, 0, 3, 128);
    })
  );
}

/** Eiffel lattice with see-through holes (alpha-tested). 1 tile ≈ 1.2 m. */
export function latticeTexture(): THREE.CanvasTexture {
  return cached('lattice', () =>
    tile(128, 128, (ctx) => {
      ctx.clearRect(0, 0, 128, 128);
      ctx.strokeStyle = '#7a5a3c';
      ctx.lineWidth = 9;
      ctx.strokeRect(4, 4, 120, 120);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(128, 128);
      ctx.moveTo(128, 0);
      ctx.lineTo(0, 128);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(64, 0);
      ctx.lineTo(64, 128);
      ctx.stroke();
      ctx.fillStyle = '#4a3420';
      for (const [x, y] of [
        [8, 8],
        [120, 8],
        [8, 120],
        [120, 120],
        [64, 64],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    })
  );
}

/**
 * Le Boulevard village facade: cream stone, tall windows with grey shutters and iron balconies,
 * a ground-floor shopfront. One tile = one 6 m × 8 m house front (u wraps per house).
 */
export function parisFacadeTexture(): THREE.CanvasTexture {
  return cached('parisFacade', () =>
    tile(512, 512, (ctx) => {
      const houses = ['#e8dcc4', '#e2cfae', '#ecd9c0', '#d8c8b0'];
      for (let hIdx = 0; hIdx < 2; hIdx++) {
        const x0 = hIdx * 256;
        ctx.fillStyle = houses[hIdx * 2];
        ctx.fillRect(x0, 0, 256, 512);
        // stone coursing
        ctx.fillStyle = 'rgba(120,100,70,0.12)';
        for (let y = 140; y < 512; y += 18) ctx.fillRect(x0, y, 256, 2);
        // cornice
        ctx.fillStyle = '#cbb898';
        ctx.fillRect(x0, 0, 256, 18);
        ctx.fillRect(x0, 300, 256, 10);
        // upper windows (2 floors × 3)
        for (let fl = 0; fl < 2; fl++) {
          for (let w = 0; w < 3; w++) {
            const wx = x0 + 28 + w * 76;
            const wy = 34 + fl * 130;
            ctx.fillStyle = '#5a6a7a';
            ctx.fillRect(wx - 12, wy, 10, 92);
            ctx.fillRect(wx + 46, wy, 10, 92);
            ctx.fillStyle = '#2a3440';
            ctx.fillRect(wx, wy, 44, 92);
            ctx.fillStyle = '#ffd99a';
            ctx.fillRect(wx + 3, wy + 3, 18, 40);
            ctx.fillRect(wx + 23, wy + 3, 18, 40);
            ctx.fillStyle = '#e8c890';
            ctx.fillRect(wx + 3, wy + 46, 18, 42);
            ctx.fillRect(wx + 23, wy + 46, 18, 42);
            ctx.fillStyle = '#cbb898';
            ctx.fillRect(wx - 4, wy - 8, 52, 8);
            // iron balcony
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 2;
            ctx.strokeRect(wx - 6, wy + 70, 56, 22);
            for (let k = 0; k < 7; k++) {
              ctx.beginPath();
              ctx.arc(wx - 2 + k * 8, wy + 81, 4, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
        // ground floor shopfront (dark wood frame + lit glass)
        ctx.fillStyle = hIdx ? '#1f3a2a' : '#3a1420';
        ctx.fillRect(x0 + 8, 318, 240, 194);
        ctx.fillStyle = '#ffe2a8';
        ctx.fillRect(x0 + 22, 372, 86, 128);
        ctx.fillRect(x0 + 148, 372, 86, 128);
        ctx.fillStyle = '#c8a050';
        ctx.fillRect(x0 + 116, 372, 24, 140);
        ctx.fillStyle = 'rgba(120,80,40,0.5)';
        for (let k = 0; k < 4; k++) ctx.fillRect(x0 + 22, 400 + k * 26, 86, 3);
        for (let k = 0; k < 4; k++) ctx.fillRect(x0 + 148, 400 + k * 26, 86, 3);
        ctx.fillStyle = '#c8a050';
        ctx.fillRect(x0 + 8, 318, 240, 6);
      }
    })
  );
}

/** Mansard roof slate. */
export function slateTexture(): THREE.CanvasTexture {
  return cached('slate', () =>
    tile(128, 128, (ctx) => {
      ctx.fillStyle = '#3a4250';
      ctx.fillRect(0, 0, 128, 128);
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const off = (row % 2) * 8;
          ctx.fillStyle = (row + col) % 3 ? '#46505e' : '#525c6a';
          ctx.fillRect(col * 16 + off + 1, row * 16 + 1, 14, 14);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(col * 16 + off + 1, row * 16 + 12, 14, 3);
        }
      }
    })
  );
}

/** Sportsbook ticker (scrolls in u). */
export function tickerTexture(): THREE.CanvasTexture {
  return cached('ticker', () =>
    tile(1024, 64, (ctx) => {
      ctx.fillStyle = '#020408';
      ctx.fillRect(0, 0, 1024, 64);
      ctx.font = font(30, 'bold', 'Arial, sans-serif');
      ctx.textBaseline = 'middle';
      const items = ['KNIGHTS -1.5 (+165)', 'RAIDERS +3.5 (-110)', 'ACES ML -140', 'UNLV +7 (-105)', 'OVER 47.5 (-110)', 'PARLAY 6-TEAM 40-1'];
      let x = 10;
      items.forEach((t, i) => {
        ctx.fillStyle = i % 2 ? '#ffd24a' : '#7affa0';
        ctx.fillText(t, x, 34);
        x += ctx.measureText(t).width + 40;
      });
    })
  );
}
