import * as THREE from 'three';
import { viewer, type WorldBuilder } from './builder';
import { R as AR, type Rect } from './interiorAtlas';
import {
  GUEST_SHIRTS,
  Kit,
  Walkers,
  additiveMat,
  blackjack,
  buildPeople,
  buildSlots,
  cameraDome,
  catDistance,
  craps,
  ensureClock,
  gateOpen,
  glassMat,
  glowMat,
  roulette,
  vcMat,
  type GateBox,
  type PeopleLists,
  type Person,
  type SlotPlacement,
  type TableLook,
} from './interiorKit';
import { gated } from './grandInteriors';

/*
 * Circus Circus, walk-in: the 1968 big top as a round casino under a pink-and-white striped tent,
 * the Midway mezzanine ringing it (carnival games, prize walls, Skee-Ball, claw machines, the Big
 * Wheel), the free circus acts over the floor (two flyers and a catcher on the trapeze, a
 * tightrope walker, the net), the revolving Cat-A-Round carousel bar (a cat-friendly Horse-A-Round),
 * clowns, cotton candy and popcorn carts, families. Plus the Promenade that leads back to the
 * Adventuredome.
 *
 * Shell colliders go through the builder. All the dressing is merged per material into one group
 * per space, built the first time Lou comes near and drawn only while the camera is inside or
 * looking in through a door, so the Boulevard pays nothing for it.
 */

export interface BigTopSpec {
  cx: number;
  cz: number;
  /** Outer wall radius. */
  R: number;
  wallH: number;
  coneH: number;
  /** Strip-side (east) doorway width. */
  doorW: number;
}

const DECK_Y = 5; // top of the Midway deck
const DECK_IN = 13.5; // inner edge (railing) radius
const PI = Math.PI;
const TAU = PI * 2;

// ------------------------------------------------------------------------------------------------
// Textures
// ------------------------------------------------------------------------------------------------
function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -PI / 2 + (i * PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Circus lettering: fat wedge-serif caps with a white inline and a drop shadow. */
function circusText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, maxW: number, outline = '#2a0610'): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${size}px "Rockwell Extra Bold", "Rockwell", "Clarendon", "Bookman Old Style", Georgia, serif`;
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(text, x + size * 0.06, y + size * 0.07, maxW);
  ctx.strokeStyle = outline;
  ctx.lineWidth = size * 0.16;
  ctx.strokeText(text, x, y, maxW);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y, maxW);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.strokeText(text, x, y - size * 0.02, maxW);
  ctx.restore();
}

/** Atlas regions (px in a 1024² canvas). */
const C = {
  ringToss: [0, 0, 256, 64] as Rect,
  darts: [256, 0, 256, 64] as Rect,
  bottles: [512, 0, 256, 64] as Rect,
  skee: [768, 0, 256, 64] as Rect,
  claw: [0, 64, 256, 64] as Rect,
  water: [256, 64, 256, 64] as Rect,
  bigWheel: [512, 64, 256, 64] as Rect,
  prizes: [768, 64, 256, 64] as Rect,
  bar: [0, 128, 512, 64] as Rect,
  midway: [512, 128, 256, 64] as Rect,
  dome: [768, 128, 256, 64] as Rect,
  candy: [0, 192, 256, 64] as Rect,
  popcorn: [256, 192, 256, 64] as Rect,
  acts: [512, 192, 512, 64] as Rect,
  wheelFace: [0, 256, 256, 256] as Rect,
  poster: [256, 256, 256, 256] as Rect,
  stripesRed: [512, 256, 256, 128] as Rect,
  stripesBlue: [768, 256, 256, 128] as Rect,
  stripesPink: [512, 384, 256, 128] as Rect,
  score: [768, 384, 256, 64] as Rect,
  arcade: [768, 448, 256, 64] as Rect,
  shopCandy: [0, 512, 512, 96] as Rect,
  shopGifts: [512, 512, 512, 96] as Rect,
  shopArcade: [0, 608, 512, 96] as Rect,
  shopFood: [512, 608, 512, 96] as Rect,
  poster2: [0, 704, 256, 256] as Rect,
  bunting: [256, 704, 512, 64] as Rect,
  bigtop: [256, 768, 512, 96] as Rect,
  wheelSeg: [768, 704, 256, 256] as Rect,
};

let atlasTex: THREE.CanvasTexture | null = null;
function circusAtlas(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex;
  atlasTex = canvasTex(1024, 1024, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1024, 1024);
    const sign = (r: Rect, text: string, bg: string, fg: string, border = '#ffd23a') => {
      const [x, y, w, h] = r;
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = border;
      ctx.lineWidth = 5;
      ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
      for (let bx = x + 10; bx < x + w - 6; bx += 14) {
        ctx.fillStyle = '#fff6c8';
        ctx.beginPath();
        ctx.arc(bx, y + 4, 2.6, 0, TAU);
        ctx.arc(bx, y + h - 4, 2.6, 0, TAU);
        ctx.fill();
      }
      circusText(ctx, text, x + w / 2, y + h / 2 + 2, h * 0.56, fg, w - 22);
    };
    sign(C.ringToss, 'RING TOSS', '#c8102e', '#ffd23a');
    sign(C.darts, 'BALLOON DARTS', '#1c4fc8', '#ffffff');
    sign(C.bottles, 'MILK BOTTLES', '#f2c230', '#c8102e', '#c8102e');
    sign(C.skee, 'SKEE-BALL', '#7a1fb8', '#ffd23a');
    sign(C.claw, 'CLAW-A-PRIZE', '#0f8a7a', '#ffffff');
    sign(C.water, 'CLOWN WATER RACE', '#e8237a', '#ffffff');
    sign(C.bigWheel, 'THE BIG WHEEL', '#1a1a1a', '#ffd23a');
    sign(C.prizes, 'PRIZES!', '#ff6a00', '#ffffff');
    sign(C.bar, 'CAT-A-ROUND CAROUSEL BAR', '#e8237a', '#ffffff', '#ffffff');
    sign(C.midway, 'MIDWAY ↑', '#1c4fc8', '#ffd23a');
    sign(C.dome, 'ADVENTUREDOME →', '#e8237a', '#ffffff');
    sign(C.candy, 'COTTON CANDY', '#ff8ad0', '#ffffff', '#ffffff');
    sign(C.popcorn, 'POPCORN', '#c8102e', '#ffd23a', '#ffffff');
    sign(C.acts, 'FREE CIRCUS ACTS DAILY', '#1a0a2a', '#ff5fa2');
    sign(C.score, '0000  HI 9999', '#000000', '#ff3a2a', '#333333');
    sign(C.arcade, 'ARCADE', '#120a2a', '#3ae8ff', '#ff5fa2');
    sign(C.shopCandy, 'CARNIVAL SWEETS', '#ff8ad0', '#ffffff', '#ffffff');
    sign(C.shopGifts, 'BIG TOP GIFTS', '#1c4fc8', '#ffd23a');
    sign(C.shopArcade, "CLOWN ALLEY ARCADE", '#120a2a', '#3ae8ff', '#ff5fa2');
    sign(C.shopFood, 'MIDWAY EATS', '#c8102e', '#ffd23a', '#ffffff');
    sign(C.bigtop, 'CIRCUS CIRCUS', '#fff6fa', '#e8237a', '#e8237a');
    // Prize wheel face: 16 wedges with prizes / multipliers
    {
      const [x, y, w] = C.wheelFace;
      const cx0 = x + w / 2;
      const cy0 = y + w / 2;
      const cols = ['#c8102e', '#ffffff', '#1c4fc8', '#f2c230', '#0f8a3a', '#ffffff', '#e8237a', '#f2c230'];
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath();
        ctx.moveTo(cx0, cy0);
        ctx.arc(cx0, cy0, 124, (i / 16) * TAU, ((i + 1) / 16) * TAU);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.translate(cx0, cy0);
        ctx.rotate(((i + 0.5) / 16) * TAU);
        ctx.fillStyle = cols[i % cols.length] === '#ffffff' || cols[i % cols.length] === '#f2c230' ? '#1a1a1a' : '#ffffff';
        ctx.font = 'bold 18px Georgia, serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(['$1', '$2', '$5', '★', '$10', '$1', '$20', '$2'][i % 8], 116, 0);
        ctx.restore();
      }
      ctx.strokeStyle = '#ffd23a';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx0, cy0, 124, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.arc(cx0, cy0, 18, 0, TAU);
      ctx.fill();
    }
    // Vintage circus posters
    const poster = (r: Rect, title: string, sub: string, bg: string) => {
      const [x, y, w, h] = r;
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#fff2d8';
      ctx.fillRect(x + 10, y + 10, w - 20, h - 20);
      ctx.fillStyle = bg;
      ctx.fillRect(x + 16, y + 16, w - 32, 54);
      circusText(ctx, title, x + w / 2, y + 44, 34, '#ffd23a', w - 40);
      // clown face
      const fx = x + w / 2;
      const fy = y + 150;
      ctx.fillStyle = '#ff7a1a';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(fx + s * 46, fy - 8, 26, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#fff8f0';
      ctx.beginPath();
      ctx.arc(fx, fy, 44, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e8102a';
      ctx.beginPath();
      ctx.arc(fx, fy + 4, 10, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#e8102a';
      ctx.beginPath();
      ctx.arc(fx, fy + 6, 24, 0.2, PI - 0.2);
      ctx.stroke();
      ctx.fillStyle = '#1c4fc8';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(fx + s * 16, fy - 26);
        ctx.lineTo(fx + s * 22, fy - 14);
        ctx.lineTo(fx + s * 16, fy - 2);
        ctx.lineTo(fx + s * 10, fy - 14);
        ctx.fill();
      }
      ctx.fillStyle = '#1c4fc8';
      ctx.beginPath();
      ctx.moveTo(fx - 22, fy - 38);
      ctx.lineTo(fx + 22, fy - 38);
      ctx.lineTo(fx + 4, fy - 92);
      ctx.fill();
      star(ctx, fx + 4, fy - 92, 10, '#ffd23a');
      circusText(ctx, sub, x + w / 2, y + h - 38, 22, '#c8102e', w - 40, '#fff2d8');
    };
    poster(C.poster, 'LUCKY', 'THE GREATEST CAT ON EARTH', '#c8102e');
    poster(C.poster2, 'CIRCUS!', 'DEATH-DEFYING TRAPEZE', '#1c4fc8');
    // Stripes for awnings (tintable regions)
    const stripes = (r: Rect, a: string, b2: string) => {
      const [x, y, w, h] = r;
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? b2 : a;
        ctx.fillRect(x + (i * w) / 8, y, w / 8 + 1, h);
      }
      // scalloped hem
      ctx.fillStyle = a;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.arc(x + (i + 0.5) * (w / 8), y + h - 14, w / 16, 0, PI);
        ctx.fill();
      }
    };
    stripes(C.stripesRed, '#d0122e', '#fff6ee');
    stripes(C.stripesBlue, '#1c4fc8', '#fff6ee');
    stripes(C.stripesPink, '#ff4f98', '#fff6ee');
    // Bunting pennants
    {
      const [x, y, w, h] = C.bunting;
      ctx.clearRect(x, y, w, h);
      const pc = ['#d0122e', '#ffd23a', '#1c4fc8', '#ffffff', '#0f8a3a', '#ff4f98'];
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = pc[i % pc.length];
        ctx.beginPath();
        ctx.moveTo(x + i * 32, y + 4);
        ctx.lineTo(x + i * 32 + 32, y + 4);
        ctx.lineTo(x + i * 32 + 16, y + h - 4);
        ctx.fill();
      }
    }
  });
  return atlasTex;
}

function region(g: THREE.BufferGeometry, r: Rect, flipU = false): THREE.BufferGeometry {
  const [x, y, w, h] = r;
  const u0 = x / 1024;
  const v0 = 1 - (y + h) / 1024;
  const du = w / 1024;
  const dv = h / 1024;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (flipU ? 1 - uv.getX(i) : uv.getX(i)) * du, v0 + uv.getY(i) * dv);
  return g;
}

let _cLit: THREE.MeshStandardMaterial | null = null;
let _cGlow: THREE.MeshBasicMaterial | null = null;
let _cCut: THREE.MeshBasicMaterial | null = null;
const cLit = () => (_cLit ??= new THREE.MeshStandardMaterial({ map: circusAtlas(), vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }));
const cGlow = () => (_cGlow ??= new THREE.MeshBasicMaterial({ map: circusAtlas(), vertexColors: true }));
const cCut = () => (_cCut ??= new THREE.MeshBasicMaterial({ map: circusAtlas(), vertexColors: true, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));

/** Quad on the circus atlas (faces +z before rotation). */
function cq(k: Kit, m: THREE.Material, r: Rect, x: number, y: number, z: number, w: number, h: number, ry = 0, rx = 0, color = 0xffffff): void {
  const g = new THREE.PlaneGeometry(w, h);
  region(g, r);
  k.add(g, m, color, x, y, z, ry, rx);
}

/** Two-sided lit sign board on the circus atlas. */
function csign(k: Kit, r: Rect, x: number, y: number, z: number, w: number, h: number, ry = 0, frame = 0x1a1014): void {
  k.box(vcMat(0.5, 0.3), frame, x, y, z, w + 0.12, h + 0.12, 0.1, ry);
  k.at(x, y, z, ry, () => {
    cq(k, cGlow(), r, 0, 0, 0.056, w, h, 0, 0, 0xe0e0e0);
    cq(k, cGlow(), r, 0, 0, -0.056, w, h, PI, 0, 0xe0e0e0);
  });
}

function carpetTexture(R: number): THREE.CanvasTexture {
  return canvasTex(1024, 1024, (ctx) => {
    const S = 512 / R; // px per metre
    ctx.fillStyle = '#1a1450';
    ctx.fillRect(0, 0, 1024, 1024);
    // loud confetti / circus-ball pattern
    let s = 7;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    const cols = ['#e8237a', '#ffd23a', '#3ad8ff', '#ff5a2a', '#7ad84a', '#ffffff'];
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * 1024;
      const y = rnd() * 1024;
      const c = cols[Math.floor(rnd() * cols.length)];
      const kind = rnd();
      if (kind < 0.25) star(ctx, x, y, 4 + rnd() * 3, c);
      else if (kind < 0.6) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, 2 + rnd() * 2.5, 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 3 + rnd() * 3, rnd() * 6, rnd() * 6 + 2);
        ctx.stroke();
      }
    }
    const ring = (r: number, width: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * S;
      ctx.beginPath();
      ctx.arc(512, 512, r * S, 0, TAU);
      ctx.stroke();
    };
    // the circus-ring rosette around the stage
    ring(5.4, 1.8, '#a8102a');
    ring(5.4, 0.18, '#ffd23a');
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      star(ctx, 512 + Math.cos(a) * 5.4 * S, 512 + Math.sin(a) * 5.4 * S, 0.45 * S, '#ffd23a');
    }
    ring(4.5, 0.12, '#ffd23a');
    ring(6.3, 0.12, '#ffd23a');
    ring(DECK_IN, 0.25, '#ffd23a');
    ring(DECK_IN + 0.4, 0.6, '#a8102a');
    // entrance runner
    ctx.fillStyle = '#a8102a';
    ctx.fillRect(512 + 6.3 * S, 512 - 1.9 * S, (R - 6.3) * S, 3.8 * S);
    ctx.fillStyle = '#ffd23a';
    ctx.fillRect(512 + 6.3 * S, 512 - 1.95 * S, (R - 6.3) * S, 0.12 * S);
    ctx.fillRect(512 + 6.3 * S, 512 + 1.83 * S, (R - 6.3) * S, 0.12 * S);
  });
}

function tentTexture(): THREE.CanvasTexture {
  return canvasTex(1024, 512, (ctx) => {
    const n = 32;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#fff4f8' : '#ff4f98';
      ctx.fillRect((i * 1024) / n, 0, 1024 / n + 1, 512);
    }
    // seams
    ctx.fillStyle = 'rgba(120,20,60,0.25)';
    for (let i = 0; i < n; i++) ctx.fillRect((i * 1024) / n - 1, 0, 2, 512);
    // stars near the peak
    for (let i = 0; i < 64; i++) star(ctx, (i + 0.5) * 16, 40 + (i % 2) * 18, 5, '#ffd23a');
    // scalloped red valance at the eave
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(0, 470, 1024, 42);
    for (let i = 0; i < 64; i++) {
      ctx.beginPath();
      ctx.arc((i + 0.5) * 16, 470, 8, PI, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd23a';
    ctx.fillRect(0, 498, 1024, 6);
  });
}

function wallTexture(): THREE.CanvasTexture {
  // canvas top = wall top (10 m); 51.2 px per metre
  return canvasTex(256, 512, (ctx) => {
    const m = 512 / 10;
    const n = 8;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#fff0f6' : '#ff5fa2';
      ctx.fillRect((i * 256) / n, 0, 256 / n + 1, 512);
    }
    // scalloped valance at the very top
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(0, 0, 256, 0.5 * m);
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc((i + 0.5) * 32, 0.5 * m, 16, 0, PI);
      ctx.fill();
    }
    // blue band with stars behind the Midway booths (5–6.4 m)
    ctx.fillStyle = '#1c2f8a';
    ctx.fillRect(0, 512 - 6.6 * m, 256, 1.8 * m);
    for (let i = 0; i < 6; i++) star(ctx, 21 + i * 43, 512 - 5.7 * m, 9, '#ffd23a');
    // deck fascia line
    ctx.fillStyle = '#a8102a';
    ctx.fillRect(0, 512 - 5.05 * m, 256, 0.7 * m);
    // wainscot
    ctx.fillStyle = '#1a1450';
    ctx.fillRect(0, 512 - 1.3 * m, 256, 1.3 * m);
    for (let i = 0; i < 4; i++) star(ctx, 32 + i * 64, 512 - 0.65 * m, 11, '#ffd23a');
    ctx.fillStyle = '#ffd23a';
    ctx.fillRect(0, 512 - 1.33 * m, 256, 4);
  });
}

function fasciaTexture(): THREE.CanvasTexture {
  return canvasTex(256, 32, (ctx) => {
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(0, 0, 256, 32);
    ctx.fillStyle = '#ffd23a';
    ctx.fillRect(0, 0, 256, 3);
    ctx.fillRect(0, 29, 256, 3);
    for (let i = 0; i < 8; i++) {
      const g = ctx.createRadialGradient(16 + i * 32, 16, 1, 16 + i * 32, 16, 10);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, i % 2 ? '#fff0a0' : '#ffd060');
      g.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(i * 32, 2, 32, 28);
    }
  });
}

function netTexture(): THREE.CanvasTexture {
  return canvasTex(
    64,
    64,
    (ctx) => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.strokeStyle = 'rgba(240,236,220,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(64, 64);
      ctx.moveTo(64, 0);
      ctx.lineTo(0, 64);
      ctx.stroke();
    },
    [1, 1]
  );
}

// ------------------------------------------------------------------------------------------------
// Little builders
// ------------------------------------------------------------------------------------------------
/** A friendly clown (static body), local +z forward, feet at y. Arm pose: 'wave' | 'juggle' | 'balloons'. */
function clown(k: Kit, x: number, y: number, z: number, ry: number, suit: number, suit2: number, pose: 'wave' | 'juggle' | 'balloons'): void {
  const M = vcMat(0.6);
  k.at(x, y, z, ry, () => {
    for (const s of [-1, 1]) {
      const shoe = new THREE.SphereGeometry(0.16, 10, 6);
      shoe.scale(0.8, 0.55, 1.7);
      k.add(shoe, M, 0xd0122e, s * 0.13, 0.07, 0.1);
      k.cyl(M, s < 0 ? suit : suit2, s * 0.12, 0.45, 0, 0.1, 0.13, 0.7, 8);
    }
    const body = new THREE.SphereGeometry(0.32, 12, 10);
    body.scale(1, 1.25, 0.85);
    k.add(body, M, suit, 0, 1.08, 0);
    for (const by of [1.25, 1.05, 0.85]) k.add(new THREE.SphereGeometry(0.05, 8, 6), M, 0xffd23a, 0, by, 0.27);
    // ruffle collar
    const ruff = new THREE.TorusGeometry(0.2, 0.08, 6, 14);
    ruff.rotateX(PI / 2);
    k.add(ruff, M, 0xffffff, 0, 1.47, 0);
    k.add(new THREE.SphereGeometry(0.2, 12, 10), M, 0xfff4ee, 0, 1.66, 0);
    k.add(new THREE.SphereGeometry(0.055, 8, 6), glowMat(), 0xff2020, 0, 1.65, 0.2);
    const smile = new THREE.TorusGeometry(0.08, 0.018, 4, 10, PI);
    smile.rotateZ(PI);
    k.add(smile, M, 0xd0122e, 0, 1.6, 0.18);
    for (const s of [-1, 1]) {
      k.add(new THREE.SphereGeometry(0.1, 8, 6), M, 0xff6a1a, s * 0.2, 1.7, -0.03);
      k.add(new THREE.SphereGeometry(0.022, 6, 4), M, 0x101010, s * 0.07, 1.72, 0.18);
    }
    k.cyl(M, suit2, 0, 1.92, 0, 0.0, 0.11, 0.28, 10, 0, 0, -0.25);
    k.add(new THREE.SphereGeometry(0.04, 6, 4), M, 0xffd23a, -0.05, 2.06, 0);
    // arms
    const arm = (s: number, ax: number, az: number) => k.cyl(M, suit, s * 0.33, 1.15, 0.05, 0.055, 0.06, 0.55, 6, 0, ax, az);
    if (pose === 'wave') {
      arm(-1, 0, 0.25);
      k.cyl(M, suit, 0.42, 1.45, 0.02, 0.055, 0.06, 0.55, 6, 0, 0, -2.5);
      k.add(new THREE.SphereGeometry(0.07, 8, 6), M, 0xffffff, 0.53, 1.7, 0.02);
    } else if (pose === 'juggle') {
      for (const s of [-1, 1]) {
        k.cyl(M, suit, s * 0.33, 1.15, 0.15, 0.055, 0.06, 0.5, 6, 0, -1.1, s * 0.2);
        k.add(new THREE.SphereGeometry(0.07, 8, 6), M, 0xffffff, s * 0.3, 1.27, 0.42);
      }
    } else {
      arm(-1, 0, 0.25);
      k.cyl(M, suit, 0.38, 1.4, 0.02, 0.055, 0.06, 0.5, 6, 0, 0, -2.7);
      k.cyl(vcMat(0.5), 0xf0f0f0, 0.44, 2.2, 0.02, 0.006, 0.006, 1.2, 4);
      const bc = [0xff2a5a, 0xffd23a, 0x3ad8ff, 0x7ad84a, 0xff8ad0, 0xff6a1a];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const bl = new THREE.SphereGeometry(0.17, 10, 8);
        bl.scale(1, 1.18, 1);
        k.add(bl, vcMat(0.25, 0.1), bc[i], 0.44 + Math.cos(a) * 0.2, 2.95 + Math.sin(a * 2) * 0.12, 0.02 + Math.sin(a) * 0.2);
      }
    }
  });
}

/** Stuffed-animal plush: body + head + ears (a tabby when tint is brownish). */
function plush(k: Kit, x: number, y: number, z: number, ry: number, col: number, s = 1): void {
  const M = vcMat(0.95);
  k.at(x, y, z, ry, () => {
    const b = new THREE.SphereGeometry(0.16 * s, 8, 6);
    b.scale(1, 1.1, 0.85);
    k.add(b, M, col, 0, 0.16 * s, 0);
    k.add(new THREE.SphereGeometry(0.13 * s, 8, 6), M, col, 0, 0.4 * s, 0.02);
    for (const e of [-1, 1]) k.cyl(M, col, e * 0.075 * s, 0.52 * s, 0, 0, 0.045 * s, 0.09 * s, 4);
    k.add(new THREE.SphereGeometry(0.018 * s, 5, 4), M, 0x101010, -0.045 * s, 0.42 * s, 0.13 * s);
    k.add(new THREE.SphereGeometry(0.018 * s, 5, 4), M, 0x101010, 0.045 * s, 0.42 * s, 0.13 * s);
  });
}

const PLUSH = [0x8a7a66, 0xff8ad0, 0x3ad8ff, 0xffd23a, 0x7ad84a, 0xb07adf, 0xff6a3a, 0x9a8a78, 0xffffff, 0x6a5a4a];

// ------------------------------------------------------------------------------------------------
// The big top
// ------------------------------------------------------------------------------------------------
export function buildBigTopInterior(b: WorldBuilder, s: BigTopSpec): void {
  ensureClock(b);
  const { cx, cz, R, wallH } = s;
  const doorHalf = s.doorW / 2 / R;
  const P = (r: number, th: number): [number, number] => [cx + Math.cos(th) * r, cz + Math.sin(th) * r];
  const rotIn = (th: number) => Math.atan2(-Math.cos(th), -Math.sin(th));

  // ---------- colliders (shell)
  const N = 48;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU;
    const a1 = ((i + 1) / N) * TAU;
    const am = (a0 + a1) / 2;
    const inDoor = Math.abs(Math.atan2(Math.sin(am), Math.cos(am))) < doorHalf;
    const [x0, z0] = P(R, a0);
    const [x1, z1] = P(R, a1);
    if (!inDoor) b.collider(Math.min(x0, x1) - 0.35, Math.max(x0, x1) + 0.35, Math.min(z0, z1) - 0.35, Math.max(z0, z1) + 0.35, 0, wallH, true);
    // Midway deck ring
    const [i0x, i0z] = P(DECK_IN, a0);
    const [i1x, i1z] = P(DECK_IN, a1);
    b.collider(Math.min(x0, x1, i0x, i1x), Math.max(x0, x1, i0x, i1x), Math.min(z0, z1, i0z, i1z), Math.max(z0, z1, i0z, i1z), DECK_Y - 0.4, DECK_Y);
    // railing (gaps at the two stair landings)
    const nearStair = Math.abs(Math.atan2(Math.sin(am - PI), Math.cos(am - PI))) < 0.13 || Math.abs(Math.atan2(Math.sin(am + PI / 2), Math.cos(am + PI / 2))) < 0.13;
    if (!nearStair) b.collider(Math.min(i0x, i1x) - 0.12, Math.max(i0x, i1x) + 0.12, Math.min(i0z, i1z) - 0.12, Math.max(i0z, i1z) + 0.12, DECK_Y, DECK_Y + 1.15, true);
  }
  // lintel over the doorway
  b.collider(cx + R - 1.2, cx + R + 0.6, cz - s.doorW / 2, cz + s.doorW / 2, 4.6, wallH, true);
  // ceiling slabs keep the camera under the tent
  const slabY = wallH + 0.3;
  for (const [hx, hz] of [
    [0.92, 0.38],
    [0.38, 0.92],
    [0.7, 0.7],
  ]) b.collider(cx - R * hx, cx + R * hx, cz - R * hz, cz + R * hz, slabY, slabY + 0.4);
  // stairs: west (−x) and north (−z), 12 steps from r 6.5 to the deck edge
  const steps = 12;
  const run = (DECK_IN - 6.5) / steps;
  const rise = DECK_Y / steps;
  for (let i = 0; i < steps; i++) {
    const top = (i + 1) * rise;
    const u0 = 6.5 + i * run;
    const u1 = u0 + run + 0.02;
    b.collider(cx - u1, cx - u0, cz - 1.6, cz + 1.6, 0, top);
    b.collider(cx - 1.6, cx + 1.6, cz - u1, cz - u0, 0, top);
  }
  // stage (Lou can hop up), carousel bar, deck columns
  b.collider(cx - 3.5, cx + 3.5, cz - 3.5, cz + 3.5, 0, 0.55);
  const barX = cx;
  const barZ = cz + 9.4;
  b.collider(barX - 2.75, barX + 2.75, barZ - 2.75, barZ + 2.75, 0, 1.15);
  b.collider(barX - 0.9, barX + 0.9, barZ - 0.9, barZ + 0.9, 0, 3.2, true);
  const colAngles: number[] = [];
  for (let d = 30; d < 360; d += 30) if (d !== 180 && d !== 270) colAngles.push((d * PI) / 180);
  for (const a of colAngles) {
    const [x, z] = P(DECK_IN + 0.3, a);
    b.collider(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, DECK_Y - 0.4, true);
  }

  // ---------- slot placements (colliders now, cabinets later)
  const slots: SlotPlacement[] = [];
  const slotCols: Array<[number, number, number, number]> = [];
  const accents = [0xff4fa8, 0xffd23a, 0x3ad8ff, 0x7ad84a, 0xff6a1a];
  const themes = [5, 0, 6, 7, 1, 3];
  let si = 0;
  const arc = (r: number, th0: number, th1: number, facingIn: boolean, group = 3) => {
    const n = Math.max(1, Math.floor((Math.abs(th1 - th0) * r) / 1.0));
    let run2: Array<[number, number]> = [];
    const flushRun = () => {
      if (!run2.length) return;
      const xs = run2.map((p) => p[0]);
      const zs = run2.map((p) => p[1]);
      slotCols.push([Math.min(...xs) - 0.42, Math.max(...xs) + 0.42, Math.min(...zs) - 0.42, Math.max(...zs) + 0.42]);
      run2 = [];
    };
    for (let i = 0; i < n; i++) {
      const th = th0 + ((i + 0.5) / n) * (th1 - th0);
      const [x, z] = P(r, th);
      const rot = facingIn ? rotIn(th) : rotIn(th) + PI;
      slots.push({ x, z, rot, theme: themes[(si >> 2) % themes.length], style: si % 11 === 5 ? 'wheel' : 'video', accent: accents[(si >> 1) % accents.length], played: ((si * 7919) % 10) < 4 });
      si++;
      run2.push([x, z]);
      if (run2.length >= group) flushRun();
    }
    flushRun();
  };
  // perimeter ring under the Midway, facing in (door gap at the east)
  arc(16.3, doorHalf + 0.12, TAU - doorHalf - 0.12, true);
  // inner arcs (backs to the stage) between the tables, stairs and bar
  for (const th of [PI / 8, -PI / 8, -3 * PI / 8, -5 * PI / 8, 7 * PI / 8, -7 * PI / 8]) arc(12.1, th - 0.2, th + 0.2, false, 5);
  for (const c of slotCols) b.collider(c[0], c[1], c[2], c[3], 0, 2.0, true);
  const firstSlot = slots[4];
  b.gamblingSpots.push({
    id: 'circus-slots',
    casinoName: 'Circus Circus',
    gameType: 'slots',
    position: new THREE.Vector3(firstSlot.x + Math.sin(firstSlot.rot) * 1.4, 0, firstSlot.z + Math.cos(firstSlot.rot) * 1.4),
    label: 'Circus Circus Big Top Slots (penny reels under the trapeze)',
  });

  // ---------- tables
  const tables: Array<{ game: 'blackjack' | 'roulette' | 'craps'; th: number; label: string }> = [
    { game: 'blackjack', th: -PI / 4, label: 'Big Top Blackjack ($5 tables, clown on the felt)' },
    { game: 'roulette', th: (-3 * PI) / 4, label: 'Ringmaster Roulette' },
    { game: 'craps', th: (3 * PI) / 4, label: 'Circus Circus Craps' },
    { game: 'blackjack', th: PI / 4, label: 'Midway-View Blackjack' },
  ];
  tables.forEach((tb, i) => {
    const [x, z] = P(9, tb.th);
    b.collider(x - 1.5, x + 1.5, z - 1.5, z + 1.5, 0, 1.1);
    b.gamblingSpots.push({ id: `circus-${tb.game}-${i}`, casinoName: 'Circus Circus', gameType: tb.game, position: new THREE.Vector3(x, 0, z), label: tb.label });
  });

  // ---------- gameplay hooks: carousel bar, the Big Wheel, carnival prizes
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(barX, 0, barZ - 3.4), radius: 2.6, label: 'Cat-A-Round Carousel Bar' });
  const wheelTh = -PI / 2 - 0.42;
  const [wx, wz] = P(15.9, wheelTh);
  b.gamblingSpots.push({ id: 'circus-bigwheel', casinoName: 'Circus Circus Midway', gameType: 'roulette', position: new THREE.Vector3(wx, DECK_Y, wz), label: 'The Big Wheel (Midway prize spinner, house rules = roulette)' });
  const [px1, pz1] = P(16.6, 0.52);
  b.pickup(px1, DECK_Y + 1.25, pz1, 4, 'a Ring Toss prize: one stuffed tabby (with smokes in the pouch)', false);
  const [px2, pz2] = P(16.6, PI * 0.78);
  b.pickup(px2, DECK_Y + 1.1, pz2, 3, 'the Skee-Ball ticket-counter prize (a plush tabby + a pack)', false);
  b.pickup(cx + 2.6, 0.95, cz - 2.2, 2, 'popcorn-tub smokes dropped by the clown', true);

  // ---------- zones, guard, people
  for (const [hx, hz] of [
    [0.98, 0.42],
    [0.42, 0.98],
    [0.74, 0.74],
  ]) b.zone('Circus Circus Casino', cx - R * hx, cx + R * hx, cz - R * hz, cz + R * hz);
  const oct: Array<[number, number]> = [];
  for (let i = 0; i < 8; i++) oct.push(P(5.6, (i / 8) * TAU + PI / 8));
  b.crowd.guards.push({ name: 'Circus Circus', pts: oct, kick: [cx + R + 6, cz + 3], zone: { minX: cx - R, maxX: cx + R, minZ: cz - R, maxZ: cz + R } });
  const aisle = (r: number, n: number, off = 0): Array<[number, number]> => {
    const o: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) o.push(P(r, (i / n) * TAU + off));
    return o;
  };
  b.crowd.tourists.push(
    { pts: [[cx + R + 4, cz - 1.2], [cx + 6.6, cz - 1.2], ...aisle(5.9, 8, PI / 8).slice(0, 7), [cx + 6.6, cz + 1.2], [cx + R + 4, cz + 1.2]], prop: 'camera' },
    { pts: aisle(6.1, 10, 0.3).reverse(), prop: 'yard-drink' },
    { pts: [[cx + R + 4, cz + 2], [cx + 6.8, cz + 1.4], ...aisle(5.8, 6, PI / 2).slice(0, 4), [cx + 6.8, cz + 0.4]], prop: 'bag' }
  );
  b.crowd.performers.push({ kind: 'statue', x: cx + 7.6, z: cz - 3.3, facing: rotIn(-0.4) + PI * 0 });

  // Hide tourists/guards inside from the street (registers the interior box with grandInteriors)
  gated(b, new THREE.Group(), cx - R, cx + R, cz - R, cz + R, 4);

  // ---------- the furnished interior (lazy, gated)
  const group = new THREE.Group();
  group.name = 'interior:circus-bigtop';
  group.visible = false;
  b.scene.add(group);
  const gate: GateBox = { minX: cx - R, maxX: cx + R, minZ: cz - R, maxZ: cz + R, height: wallH + 4, doors: [{ x: cx + R, z: cz, nx: 1, nz: 0, half: s.doorW / 2 }] };
  let anim: Array<(t: number, dt: number) => void> | null = null;
  b.every((dt, t) => {
    if (!anim && catDistance(gate) < 85) anim = layoutBigTop(b, s, group, slots, tables, barX, barZ, wheelTh);
    const vis = !!anim && gateOpen(gate);
    group.visible = vis;
    if (vis) for (const f of anim!) f(t, dt);
  });
}

function layoutBigTop(
  b: WorldBuilder,
  s: BigTopSpec,
  group: THREE.Group,
  slots: SlotPlacement[],
  tables: Array<{ game: 'blackjack' | 'roulette' | 'craps'; th: number; label: string }>,
  barX: number,
  barZ: number,
  wheelTh: number
): Array<(t: number, dt: number) => void> {
  const { cx, cz, R, wallH, coneH } = s;
  const P = (r: number, th: number): [number, number] => [cx + Math.cos(th) * r, cz + Math.sin(th) * r];
  const rotIn = (th: number) => Math.atan2(-Math.cos(th), -Math.sin(th));
  const k = new Kit();
  const ppl: PeopleLists = { seated: [], standing: [] };
  const anim: Array<(t: number, dt: number) => void> = [];
  const M = vcMat(0.6);
  const MET = vcMat(0.3, 0.85);
  const GOLD = 0xd9ae4a;
  let rs = 12345;
  const rnd = () => {
    rs = (rs * 16807) % 2147483647;
    return rs / 2147483647;
  };

  // ---------- floor, walls, tent
  const carpet = new THREE.Mesh(new THREE.CircleGeometry(R - 0.2, 64), new THREE.MeshStandardMaterial({ map: carpetTexture(R - 0.2), roughness: 0.92 }));
  carpet.rotation.x = -PI / 2;
  carpet.position.set(cx, 0.035, cz);
  group.add(carpet);
  const wallTex = wallTexture();
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.repeat.set(22, 1);
  const lining = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.12, R - 0.12, wallH, 64, 1, true, PI / 2 + s.doorW / 2 / R, TAU - s.doorW / R), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8, side: THREE.BackSide, emissive: 0xffffff, emissiveMap: wallTex, emissiveIntensity: 0.22 }));
  lining.position.set(cx, wallH / 2, cz);
  group.add(lining);
  const tentTex = tentTexture();
  const tentMat = new THREE.MeshStandardMaterial({ map: tentTex, roughness: 0.85, side: THREE.BackSide, emissive: 0xffffff, emissiveMap: tentTex, emissiveIntensity: 0.5 });
  const tent = new THREE.Mesh(new THREE.ConeGeometry(R - 0.1, coneH - 0.4, 64, 4, true), tentMat);
  tent.position.set(cx, wallH + (coneH - 0.4) / 2 - 0.05, cz);
  group.add(tent);
  // door reveal (jambs + lintel inside face)
  for (const sgn of [-1, 1]) k.box(M, 0xe8237a, cx + R - 0.5, 2.3, cz + sgn * (s.doorW / 2 + 0.25), 1.2, 4.6, 0.5);
  k.box(M, 0xe8237a, cx + R - 0.6, 4.75, cz, 1.0, 0.5, s.doorW + 1);
  csign(k, C.acts, cx + R - 1.2, 5.5, cz, 4.6, 0.58, -PI / 2);
  // wall-top bunting swags
  for (let i = 0; i < 40; i++) {
    const a0 = (i / 40) * TAU;
    const [x0, z0] = P(R - 0.3, a0);
    const [x1, z1] = P(R - 0.3, a0 + TAU / 40);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.PlaneGeometry(len, 0.5);
    region(g, C.bunting);
    k.add(g, cCut(), 0xffffff, (x0 + x1) / 2, wallH - 0.6, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0) - PI / 2);
  }

  // ---------- string lights: apex → wall top along 24 gores, bulbs on chains
  const bulbCols = [0xfff2b0, 0xff7ab8, 0xfff2b0, 0x7ad8ff, 0xfff2b0, 0xffd060];
  const apexY = wallH + coneH - 1.0;
  const bulbGeo = (r: number) => new THREE.OctahedronGeometry(r, 0);
  for (let g = 0; g < 24; g++) {
    const a = (g / 24) * TAU;
    const n = 26;
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const r = u * (R - 0.6);
      const y = apexY - u * (apexY - wallH - 0.25) - Math.sin(u * PI) * 1.3;
      const [x, z] = P(r, a);
      k.add(bulbGeo(0.08), glowMat(), bulbCols[(i + g) % bulbCols.length], x, y, z);
    }
  }
  // crown at the apex: a gold ring + star
  {
    const ring = new THREE.TorusGeometry(1.4, 0.12, 6, 24);
    ring.rotateX(PI / 2);
    k.add(ring, MET, GOLD, cx, apexY - 0.2, cz);
    k.add(new THREE.SphereGeometry(0.55, 14, 10), glowMat(), 0xfff0c0, cx, apexY - 0.4, cz);
    const halo = new THREE.CircleGeometry(4, 20);
    halo.rotateX(PI / 2);
    k.add(halo, additiveMat(), 0x5a3040, cx, apexY - 0.1, cz);
  }

  // ---------- the Midway deck
  {
    const top = new THREE.RingGeometry(DECK_IN, R - 0.12, 64, 1);
    top.rotateX(-PI / 2);
    // boardwalk planks: radial colour bands
    k.add(top, vcMat(0.8), 0x8a4a3a, cx, DECK_Y + 0.01, cz);
    const runner = new THREE.RingGeometry(DECK_IN + 0.5, DECK_IN + 2.9, 64, 1);
    runner.rotateX(-PI / 2);
    k.add(runner, vcMat(0.9), 0x2a1f6a, cx, DECK_Y + 0.02, cz);
    const under = new THREE.RingGeometry(DECK_IN, R - 0.12, 64, 1);
    under.rotateX(PI / 2);
    k.add(under, vcMat(0.8), 0x2a1430, cx, DECK_Y - 0.42, cz);
    // fascia with chasing bulbs
    const fTex = fasciaTexture();
    fTex.wrapS = THREE.RepeatWrapping;
    fTex.repeat.set(52, 1);
    const fascia = new THREE.Mesh(new THREE.CylinderGeometry(DECK_IN - 0.02, DECK_IN - 0.02, 0.5, 96, 1, true), new THREE.MeshBasicMaterial({ map: fTex }));
    fascia.position.set(cx, DECK_Y - 0.2, cz);
    group.add(fascia);
    anim.push((t) => {
      fTex.offset.x = Math.floor(t * 6) * (1 / 8);
    });
    // railing: posts + gold top rail + mid rail (gaps at the stairs)
    const gaps = [PI, -PI / 2];
    const nearGap = (a: number) => gaps.some((gA) => Math.abs(Math.atan2(Math.sin(a - gA), Math.cos(a - gA))) < 0.14);
    for (let i = 0; i < 96; i++) {
      const a0 = (i / 96) * TAU;
      const a1 = ((i + 1) / 96) * TAU;
      if (nearGap((a0 + a1) / 2)) continue;
      const [x0, z0] = P(DECK_IN + 0.08, a0);
      const [x1, z1] = P(DECK_IN + 0.08, a1);
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ry = Math.atan2(x1 - x0, z1 - z0);
      k.box(MET, GOLD, (x0 + x1) / 2, DECK_Y + 1.1, (z0 + z1) / 2, 0.08, 0.08, len + 0.02, ry);
      k.box(MET, GOLD, (x0 + x1) / 2, DECK_Y + 0.55, (z0 + z1) / 2, 0.04, 0.04, len + 0.02, ry);
      if (i % 2 === 0) k.cyl(MET, GOLD, x0, DECK_Y + 0.55, z0, 0.03, 0.03, 1.1, 6);
    }
    // candy-striped support columns under the deck
    const colAngles: number[] = [];
    for (let d = 30; d < 360; d += 30) if (d !== 180 && d !== 270) colAngles.push((d * PI) / 180);
    for (const a of colAngles) {
      const [x, z] = P(DECK_IN + 0.3, a);
      for (let j = 0; j < 9; j++) k.cyl(M, j % 2 ? 0xffffff : 0xd0122e, x, 0.25 + j * 0.5, z, 0.2, 0.2, 0.5, 10);
      k.cyl(MET, GOLD, x, DECK_Y - 0.55, z, 0.32, 0.22, 0.3, 10);
    }
    // under-deck can lights
    for (let i = 0; i < 40; i++) {
      const [x, z] = P(15.8, (i / 40) * TAU);
      k.can(x, DECK_Y - 0.43, z, 0.11, 0xfff0d0);
    }
  }

  // ---------- stairs (west + north) with gold rails and a MIDWAY sign
  {
    const steps = 12;
    const run = (DECK_IN - 6.5) / steps;
    const rise = DECK_Y / steps;
    for (const dir of ['w', 'n'] as const) {
      for (let i = 0; i < steps; i++) {
        const top = (i + 1) * rise;
        const u = 6.5 + (i + 0.5) * run;
        const [x, z] = dir === 'w' ? [cx - u, cz] : [cx, cz - u];
        const [w, d] = dir === 'w' ? [run + 0.02, 3.2] : [3.2, run + 0.02];
        k.box(vcMat(0.85), 0xa8102a, x, top / 2, z, w, top, d);
        k.box(MET, GOLD, dir === 'w' ? x + run / 2 - 0.02 : x, top + 0.005, dir === 'w' ? z : z + run / 2 - 0.02, dir === 'w' ? 0.05 : 3.2, 0.03, dir === 'w' ? 3.2 : 0.05);
      }
      for (const sg of [-1, 1]) {
        const a = dir === 'w' ? new THREE.Vector3(cx - 6.5, 1.0, cz + sg * 1.65) : new THREE.Vector3(cx + sg * 1.65, 1.0, cz - 6.5);
        const c2 = dir === 'w' ? new THREE.Vector3(cx - DECK_IN, DECK_Y + 1.0, cz + sg * 1.65) : new THREE.Vector3(cx + sg * 1.65, DECK_Y + 1.0, cz - DECK_IN);
        const mid = a.clone().add(c2).multiplyScalar(0.5);
        const len = a.distanceTo(c2);
        const dirV = c2.clone().sub(a).normalize();
        const g = new THREE.CylinderGeometry(0.045, 0.045, len, 6);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirV));
        k.add(g, MET, GOLD, mid.x, mid.y, mid.z);
        for (let j = 0; j <= 6; j++) {
          const p = a.clone().lerp(c2, j / 6);
          k.cyl(MET, GOLD, p.x, p.y - 0.5, p.z, 0.025, 0.025, 1.0, 5);
        }
      }
      const [sx, sz] = dir === 'w' ? [cx - 6.0, cz] : [cx, cz - 6.0];
      csign(k, C.midway, sx, 2.6, sz, 2.2, 0.55, dir === 'w' ? PI / 2 : 0);
      k.cyl(MET, GOLD, sx, 1.15, sz, 0.04, 0.04, 2.1, 6);
    }
  }

  // ---------- the ring stage + safety net + trapeze rig + tightrope
  {
    const curb = new THREE.CylinderGeometry(4.3, 4.3, 0.55, 48, 1, true);
    k.add(curb, M, 0xd0122e, cx, 0.275, cz);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const [x, z] = P(4.32, a);
      const st = new THREE.CircleGeometry(0.14, 5);
      k.add(st, glowMat(), 0xffe27a, x, 0.3, z, Math.atan2(Math.cos(a), Math.sin(a)));
    }
    const rim = new THREE.TorusGeometry(4.3, 0.09, 6, 48);
    rim.rotateX(PI / 2);
    k.add(rim, MET, GOLD, cx, 0.56, cz);
    const saw = new THREE.CircleGeometry(4.25, 48);
    saw.rotateX(-PI / 2);
    k.add(saw, vcMat(0.95), 0xc8a060, cx, 0.54, cz);
    const ring2 = new THREE.RingGeometry(2.6, 2.75, 48);
    ring2.rotateX(-PI / 2);
    k.add(ring2, vcMat(0.9), 0xf4e8d0, cx, 0.545, cz);
    // a clown juggling on the stage + a balloon clown at the door + one waving on the Midway
    clown(k, cx + 0.8, 0.55, cz + 0.6, PI / 2 - 0.4, 0x3a6ad8, 0xffd23a, 'juggle');
    clown(k, cx + R - 4.2, 0, cz + 3.0, -PI / 2 - 0.5, 0xd0122e, 0xffffff, 'balloons');
    {
      const [x, z] = P(15.0, PI - 0.25);
      clown(k, x, DECK_Y, z, rotIn(PI - 0.25), 0x7ad84a, 0xff4fa8, 'wave');
    }
    // juggling balls (animated)
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 3);
    const bc = [0xff2a5a, 0xffd23a, 0x3ad8ff];
    const jm = new THREE.Matrix4();
    const jc = new THREE.Color();
    bc.forEach((c, i) => balls.setColorAt(i, jc.setHex(c)));
    balls.frustumCulled = false;
    group.add(balls);
    const jRot = PI / 2 - 0.4;
    const jx = cx + 0.8 + Math.sin(jRot) * 0.42;
    const jz = cz + 0.6 + Math.cos(jRot) * 0.42;
    anim.push((t) => {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 1.7 + i / 3) % 1;
        const side = Math.floor(t * 1.7 + i / 3) % 2 ? 1 : -1;
        const lat = side * (0.3 - ph * 0.6);
        const y = 0.55 + 1.3 + Math.sin(ph * PI) * 1.0;
        jm.makeTranslation(jx + Math.cos(jRot) * lat, y, jz - Math.sin(jRot) * lat);
        balls.setMatrixAt(i, jm);
      }
      balls.instanceMatrix.needsUpdate = true;
    });

    // safety net under the trapeze (along x), corner cables to the tent
    const netY = 6.4;
    const net = new THREE.Mesh(new THREE.PlaneGeometry(17, 7, 1, 1), new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: 0xd8d0c0 }));
    (net.material as THREE.MeshBasicMaterial).map!.repeat.set(17 / 0.35, 7 / 0.35);
    net.rotation.x = -PI / 2;
    net.position.set(cx, netY, cz);
    group.add(net);
    for (const sx of [-8.5, 8.5]) {
      k.box(MET, 0x9aa0aa, cx + sx, netY, cz, 0.08, 0.08, 7.0);
      for (const sz of [-3.5, 3.5]) k.cyl(MET, 0x8a8e96, cx + sx, netY + (wallH + 4 - netY) / 2, cz + sz, 0.02, 0.02, wallH + 4 - netY, 4);
    }
    for (const sz of [-3.5, 3.5]) k.box(MET, 0x9aa0aa, cx, netY, cz + sz, 17, 0.08, 0.08);
    // crane bar for the trapeze, two pedestal boards with ladders
    const anchorY = 16.4;
    k.box(MET, 0x6a6e76, cx, anchorY + 0.15, cz, 11, 0.3, 0.3);
    for (const sx of [-1, 1]) k.cyl(MET, 0x8a8e96, cx + sx * 5.2, anchorY + 1.4, cz, 0.03, 0.03, 2.6, 4);
    for (const sx of [-1, 1]) {
      const px = cx + sx * 9.6;
      k.box(MET, 0xd9ae4a, px, 12.6, cz, 1.4, 0.12, 1.4);
      k.box(M, 0xd0122e, px, 12.9, cz + 0.7, 1.4, 0.5, 0.04);
      for (const sz of [-0.6, 0.6]) k.cyl(MET, 0x8a8e96, px, 12.6 + (wallH + coneH * (1 - 9.6 / R) - 12.6) / 2, cz + sz, 0.02, 0.02, wallH + coneH * (1 - 9.6 / R) - 12.6, 4);
      // rope ladder down to the Midway rail
      const top2 = new THREE.Vector3(px + sx * 0.6, 12.55, cz);
      const [lx, lz] = [cx + sx * (DECK_IN + 0.3), cz];
      const bot = new THREE.Vector3(lx, DECK_Y + 1.1, lz);
      const mid = top2.clone().add(bot).multiplyScalar(0.5);
      const g = new THREE.CylinderGeometry(0.012, 0.012, top2.distanceTo(bot), 4);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), bot.clone().sub(top2).normalize()));
      for (const dz of [-0.25, 0.25]) k.add(g.clone(), vcMat(0.8), 0xe8dcc0, mid.x, mid.y, mid.z + dz);
    }

    // trapeze bars (pivot groups) + three flyers
    const L = 4.4;
    const FS = 1.3;
    const HANDS = 2.1 * FS;
    const mkBar = (x: number) => {
      const piv = new THREE.Group();
      piv.position.set(x, anchorY, cz);
      const rope = new THREE.CylinderGeometry(0.02, 0.02, L, 4);
      rope.translate(0, -L / 2, 0);
      const ropeM = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.8 });
      for (const dz of [-0.5, 0.5]) {
        const r = new THREE.Mesh(rope, ropeM);
        r.position.z = dz;
        piv.add(r);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 8), new THREE.MeshStandardMaterial({ color: 0xd9ae4a, metalness: 0.8, roughness: 0.3 }));
      bar.rotation.x = PI / 2;
      bar.position.y = -L;
      piv.add(bar);
      group.add(piv);
      return piv;
    };
    const barA = mkBar(cx - 3.2);
    const barB = mkBar(cx + 3.2);
    const figure = (leo: number, catcher: boolean): THREE.Group => {
      const fk = new Kit();
      const FM = vcMat(0.4, 0.2);
      // hands at the origin, body hanging toward −y (catcher: hanging by the knees, hands at the bottom)
      if (!catcher) {
        for (const s2 of [-1, 1]) fk.cyl(FM, 0xf2c7a5, 0, -0.3, s2 * 0.16, 0.035, 0.04, 0.6, 6);
        fk.add(new THREE.SphereGeometry(0.12, 10, 8), FM, 0xf2c7a5, 0, -0.62, 0.02);
        fk.add(new THREE.SphereGeometry(0.125, 8, 4, 0, TAU, 0, PI * 0.5), FM, 0x2a1a10, 0, -0.6, 0.0);
        const torso = new THREE.CylinderGeometry(0.15, 0.12, 0.62, 8);
        fk.add(torso, FM, leo, 0, -1.05, 0);
        for (const s2 of [-1, 1]) fk.cyl(FM, 0xf2d8c8, 0, -1.7, s2 * 0.08, 0.06, 0.045, 0.78, 6);
        fk.box(glowMat(), 0xffffff, 0, -0.95, 0.0, 0.31, 0.04, 0.31);
      } else {
        for (const s2 of [-1, 1]) {
          fk.cyl(FM, 0xf2d8c8, 0.0, 2.05, s2 * 0.08, 0.06, 0.045, 0.5, 6, 0, 0, 0);
          fk.cyl(FM, 0xf2d8c8, 0.2, 2.3, s2 * 0.08, 0.05, 0.05, 0.45, 6, 0, 0, PI / 2);
        }
        fk.add(new THREE.CylinderGeometry(0.16, 0.14, 0.66, 8), FM, leo, 0, 1.45, 0);
        fk.add(new THREE.SphereGeometry(0.13, 10, 8), FM, 0xe0ac86, 0, 0.98, 0);
        for (const s2 of [-1, 1]) fk.cyl(FM, 0xe0ac86, 0, 0.55, s2 * 0.14, 0.04, 0.045, 0.62, 6);
      }
      const g = new THREE.Group();
      const inner = new THREE.Group();
      fk.flush(inner);
      if (catcher) inner.position.y = -2.3;
      inner.scale.setScalar(1);
      g.add(inner);
      g.scale.setScalar(FS);
      group.add(g);
      return g;
    };
    const flyer = figure(0xff4fa8, false);
    const flyer2 = figure(0x3ad8ff, false);
    const catcher = figure(0xffd23a, true);
    const w = 2.25;
    const T = TAU / w;
    const amp = 0.78;
    const bpos = (x0: number, ph: number, out: THREE.Vector3, extra = 0) => out.set(x0 + Math.sin(ph) * (L + extra), anchorY - Math.cos(ph) * (L + extra), cz);
    const pa = new THREE.Vector3();
    const pb = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    anim.push((t) => {
      const phA = -amp * Math.cos(w * t);
      const phB = amp * Math.cos(w * t);
      barA.rotation.z = phA;
      barB.rotation.z = phB;
      // catcher hangs by the knees from bar B, swinging with it
      bpos(cx + 3.2, phB, tmp);
      catcher.position.copy(tmp);
      catcher.rotation.set(0, 0, phB);
      const hands = bpos(cx + 3.2, phB, new THREE.Vector3(), HANDS);
      // flyer cycle over 4 swings: A → (flight) → catcher → (flight) → A
      const c = (((t % (4 * T)) + 4 * T) % (4 * T)) / T;
      const r1 = 1.5 - 0.22;
      const c1 = 1.5 + 0.3;
      const r2 = 3.5 - 0.22;
      const c2 = 3.5 + 0.3;
      bpos(cx - 3.2, phA, pa);
      if (c < r1 || c >= c2) {
        flyer.position.copy(pa);
        flyer.rotation.set(0, 0, phA);
      } else if (c < c1 || (c >= r2 && c < c2)) {
        const going = c < c1;
        const u = going ? (c - r1) / (c1 - r1) : (c - r2) / (c2 - r2);
        const tr = (going ? r1 : r2) * T;
        const tc = (going ? c1 : c2) * T;
        const fromA = bpos(cx - 3.2, -amp * Math.cos(w * tr), new THREE.Vector3());
        const fromB = bpos(cx + 3.2, amp * Math.cos(w * tr), new THREE.Vector3(), HANDS);
        const toA = bpos(cx - 3.2, -amp * Math.cos(w * tc), new THREE.Vector3());
        const toB = bpos(cx + 3.2, amp * Math.cos(w * tc), new THREE.Vector3(), HANDS);
        const from = going ? fromA : fromB;
        const to = going ? toB : toA;
        pb.copy(from).lerp(to, u);
        pb.y += Math.sin(u * PI) * 1.6;
        flyer.position.copy(pb);
        const sgn = going ? 1 : -1;
        flyer.rotation.set(0, 0, (going ? -amp : amp) * (1 - u) + sgn * u * TAU);
      } else {
        flyer.position.copy(hands);
        flyer.rotation.set(0, 0, phB);
      }
      // second flyer waits on the west pedestal, waving now and then
      flyer2.position.set(cx - 9.6, 12.6 + 1.85 * FS, cz + 0.2);
      flyer2.rotation.set(0, 0, PI + Math.sin(t * 1.3) * 0.05);
    });

    // tightrope NE→SW across the ring, posts standing on the Midway
    const tA = P(DECK_IN + 0.9, -PI / 4);
    const tB = P(DECK_IN + 0.9, (3 * PI) / 4);
    const ropeY = 9.2;
    for (const [x, z] of [tA, tB]) {
      k.cyl(MET, GOLD, x, (DECK_Y + ropeY + 0.4) / 2, z, 0.09, 0.12, ropeY + 0.4 - DECK_Y, 8);
      k.box(MET, GOLD, x, ropeY - 0.1, z, 0.9, 0.08, 0.9);
    }
    {
      const a = new THREE.Vector3(tA[0], ropeY, tA[1]);
      const c2 = new THREE.Vector3(tB[0], ropeY, tB[1]);
      const mid = a.clone().add(c2).multiplyScalar(0.5);
      const g = new THREE.CylinderGeometry(0.018, 0.018, a.distanceTo(c2), 4);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c2.clone().sub(a).normalize()));
      k.add(g, MET, 0xe8e8e8, mid.x, mid.y, mid.z);
    }
    const walker = new THREE.Group();
    {
      const fk = new Kit();
      const FM = vcMat(0.45, 0.1);
      for (const s2 of [-1, 1]) fk.cyl(FM, 0xf2d8c8, s2 * 0.07, 0.42, 0, 0.05, 0.04, 0.84, 6);
      const tutu = new THREE.ConeGeometry(0.42, 0.22, 16, 1, true);
      fk.add(tutu, FM, 0xff8ad0, 0, 0.92, 0);
      fk.add(new THREE.CylinderGeometry(0.13, 0.15, 0.55, 8), FM, 0xff4fa8, 0, 1.15, 0);
      fk.add(new THREE.SphereGeometry(0.12, 10, 8), FM, 0xf2c7a5, 0, 1.55, 0);
      fk.add(new THREE.SphereGeometry(0.13, 8, 4, 0, TAU, 0, PI * 0.5), FM, 0xc89a5a, 0, 1.58, -0.01);
      fk.cyl(MET, 0xd9ae4a, 0, 1.25, 0.15, 0.02, 0.02, 3.6, 5, 0, 0, PI / 2);
      for (const s2 of [-1, 1]) fk.cyl(FM, 0xf2c7a5, s2 * 0.25, 1.28, 0.08, 0.035, 0.035, 0.42, 5, 0, 0, (s2 * PI) / 2.6);
      fk.flush(walker);
    }
    group.add(walker);
    const dirTA = Math.atan2(tB[0] - tA[0], tB[1] - tA[1]);
    anim.push((t) => {
      const cyc = (t / 22) % 1;
      const u = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
      const e = u * u * (3 - 2 * u);
      const uu = 0.08 + e * 0.84;
      walker.position.set(tA[0] + (tB[0] - tA[0]) * uu, ropeY + 0.02, tA[1] + (tB[1] - tA[1]) * uu);
      walker.rotation.set(0, dirTA + PI / 2, Math.sin(t * 2.3) * 0.07);
    });
  }

  // ---------- slots + tables
  buildSlots(group, slots, 0x2a5ad8);
  for (const sl of slots) {
    if (!sl.played) continue;
    ppl.seated.push({ x: sl.x + Math.sin(sl.rot) * 0.86, z: sl.z + Math.cos(sl.rot) * 0.86, rot: sl.rot + PI, shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
  }
  // bank signs over the inner arcs
  for (const th of [PI / 8, -PI / 8, -3 * PI / 8, -5 * PI / 8, 7 * PI / 8, -7 * PI / 8]) {
    const [x, z] = P(12.1, th);
    csign(k, C.bigtop, x, 3.2, z, 2.4, 0.46, rotIn(th));
    k.cyl(MET, GOLD, x, 2.55, z, 0.03, 0.03, 0.8, 5);
  }
  const look: TableLook = { felt: 0x0f6a4a, rail: 0x2a0a1a, wood: 0x5a1a2a, trim: GOLD, seat: 0x2a5ad8, dealerShirt: 0xffffff, dealerVest: 0xd0122e };
  tables.forEach((tb, i) => {
    const [x, z] = P(9, tb.th);
    const rot = Math.atan2(Math.cos(tb.th), Math.sin(tb.th));
    const lim = i % 2 ? AR.limit25 : AR.limit15;
    if (tb.game === 'blackjack') blackjack(k, x, z, rot, look, ppl, 900 + i * 13, lim);
    else if (tb.game === 'roulette') roulette(k, x, z, rot, { ...look, felt: 0x1a3a8a }, ppl, 900 + i * 13, lim);
    else craps(k, x, z, rot, { ...look, felt: 0x8a1030 }, ppl, 900 + i * 13, lim);
    // a little striped canopy lamp over each table
    k.cyl(MET, GOLD, x, wallH - 1.6, z, 0.02, 0.02, 3.2, 4);
    const shade = new THREE.ConeGeometry(1.1, 0.6, 12, 1, true);
    k.add(shade, M, i % 2 ? 0xd0122e : 0x1c4fc8, x, wallH - 3.4, z);
    k.add(new THREE.SphereGeometry(0.22, 10, 8), glowMat(), 0xfff0c8, x, wallH - 3.6, z);
  });

  // ---------- the Cat-A-Round carousel bar
  {
    const top = new THREE.CylinderGeometry(2.7, 2.7, 0.1, 32);
    k.add(top, vcMat(0.25, 0.3), 0x1a0a14, barX, 1.15, barZ);
    k.add(new THREE.CylinderGeometry(2.55, 2.6, 1.1, 32, 1, true), M, 0xd0122e, barX, 0.55, barZ);
    const brass = new THREE.TorusGeometry(2.7, 0.05, 6, 32);
    brass.rotateX(PI / 2);
    k.add(brass, MET, GOLD, barX, 1.08, barZ);
    k.add(brass.clone(), MET, GOLD, barX, 0.12, barZ);
    // back-bar column of bottles
    k.cyl(M, 0x2a0a1a, barX, 1.7, barZ, 0.85, 0.9, 3.4, 16);
    for (const y of [1.6, 2.1, 2.6]) {
      const sh = new THREE.TorusGeometry(0.95, 0.04, 4, 20);
      sh.rotateX(PI / 2);
      k.add(sh, glowMat(), 0xff8ad0, barX, y, barZ);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        k.cyl(glowMat(), [0x3aa85a, 0xc8783a, 0xe8d8a8, 0x6ab8e8, 0xc8203a, 0xf2c23a][i % 6], barX + Math.cos(a) * 0.92, y + 0.17, barZ + Math.sin(a) * 0.92, 0.03, 0.045, 0.3, 5);
      }
    }
    // bartenders
    for (let i = 0; i < 2; i++) {
      const a = PI * 1.5 + (i ? 0.9 : -0.9);
      ppl.standing.push({ x: barX + Math.cos(a) * 1.6, z: barZ + Math.sin(a) * 1.6, rot: Math.atan2(Math.cos(a), Math.sin(a)), shirt: 0xffffff, vest: 0xd0122e });
    }
    csign(k, C.bar, barX, 4.95, barZ - 3.25, 4.4, 0.55, 0);
  }
  // revolving part: canopy, valance, bulbs, stools and cat mounts
  const carousel = new THREE.Group();
  carousel.position.set(barX, 0, barZ);
  {
    const ck = new Kit();
    const canopy = new THREE.ConeGeometry(3.7, 1.5, 24, 1, true);
    region(canopy, C.stripesRed);
    ck.add(canopy, cLit(), 0xffffff, 0, 4.75, 0);
    const val = new THREE.CylinderGeometry(3.7, 3.7, 0.55, 24, 1, true);
    region(val, C.stripesRed);
    ck.add(val, cLit(), 0xffffff, 0, 3.75, 0);
    const rimT = new THREE.TorusGeometry(3.72, 0.06, 4, 32);
    rimT.rotateX(PI / 2);
    ck.add(rimT, MET, GOLD, 0, 4.03, 0);
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * TAU;
      ck.add(new THREE.OctahedronGeometry(0.07, 0), glowMat(), i % 2 ? 0xfff2b0 : 0xffd060, Math.cos(a) * 3.76, 4.03, Math.sin(a) * 3.76);
      ck.add(new THREE.OctahedronGeometry(0.06, 0), glowMat(), 0xfff2b0, Math.cos(a) * 3.73, 3.47, Math.sin(a) * 3.73);
    }
    ck.add(new THREE.SphereGeometry(0.3, 10, 8), MET, GOLD, 0, 5.6, 0);
    ck.add(new THREE.ConeGeometry(0.12, 0.6, 8), MET, GOLD, 0, 6.0, 0);
    // carved panels round the centre column top (mirrors and gilt)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ck.box(vcMat(0.15, 0.9), 0xc8ccd8, Math.cos(a) * 0.98, 3.65, Math.sin(a) * 0.98, 0.4, 0.5, 0.04, PI / 2 - a);
    }
    // stools around the bar
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const x = Math.cos(a) * 3.25;
      const z = Math.sin(a) * 3.25;
      ck.cyl(MET, 0x8a8e96, x, 0.4, z, 0.04, 0.05, 0.8, 6);
      ck.cyl(M, i % 2 ? 0xd0122e : 0xffd23a, x, 0.84, z, 0.23, 0.21, 0.1, 12);
    }
    ck.flush(carousel);
  }
  group.add(carousel);
  // cat mounts (instanced, bobbing on brass poles) — a cat-friendly Horse-A-Round
  const NC = 8;
  const catGeo = (() => {
    const gk = new Kit();
    const W = 0xffffff;
    const body = new THREE.SphereGeometry(0.42, 14, 10);
    body.scale(0.75, 0.62, 1.35);
    gk.add(body, vcMat(0.5), W, 0, 0, 0);
    gk.add(new THREE.SphereGeometry(0.3, 12, 10), vcMat(0.5), W, 0, 0.32, 0.52);
    for (const e of [-1, 1]) {
      gk.add(new THREE.ConeGeometry(0.1, 0.2, 4), vcMat(0.5), W, e * 0.15, 0.6, 0.5);
      gk.add(new THREE.SphereGeometry(0.05, 6, 4), glowMat(), 0x7ad84a, e * 0.11, 0.38, 0.77);
      gk.cyl(vcMat(0.5), W, e * 0.18, -0.38, 0.35, 0.06, 0.05, 0.42, 6, 0, -0.5);
      gk.cyl(vcMat(0.5), W, e * 0.18, -0.38, -0.35, 0.06, 0.05, 0.42, 6, 0, 0.5);
    }
    gk.add(new THREE.SphereGeometry(0.05, 6, 4), vcMat(0.4), 0xff8ab0, 0, 0.3, 0.81);
    const tail = new THREE.TorusGeometry(0.28, 0.05, 5, 10, PI * 1.2);
    tail.rotateY(PI / 2);
    gk.add(tail, vcMat(0.5), W, 0, 0.25, -0.6);
    // saddle + stripes
    gk.box(vcMat(0.4), 0xd0122e, 0, 0.27, 0, 0.5, 0.08, 0.5);
    gk.box(vcMat(0.3, 0.8), 0xd9ae4a, 0, 0.32, 0, 0.52, 0.03, 0.06);
    for (const zz of [-0.35, -0.12, 0.12]) gk.box(vcMat(0.5), 0x2a2420, 0, 0.2, zz, 0.62, 0.06, 0.07);
    const meshes = gk.flush(new THREE.Group());
    return meshes;
  })();
  const catInst = catGeo.map((m) => {
    const im = new THREE.InstancedMesh(m.geometry, m.material as THREE.Material, NC);
    im.frustumCulled = false;
    group.add(im);
    return im;
  });
  const catTints = [0x9a7a5a, 0xff9a3a, 0xf4f0e8, 0x6a6a72, 0xd8b08a, 0x3a3230, 0xff9a3a, 0xa8a8b0];
  const tc = new THREE.Color();
  for (let i = 0; i < NC; i++) catInst[0].setColorAt(i, tc.setHex(catTints[i]));
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 3.6, 6), new THREE.MeshStandardMaterial({ color: 0xd9ae4a, metalness: 0.85, roughness: 0.3 }), NC);
  pole.frustumCulled = false;
  group.add(pole);
  const cm = new THREE.Matrix4();
  const cq2 = new THREE.Quaternion();
  const cpos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const yAx = new THREE.Vector3(0, 1, 0);
  anim.push((t) => {
    const spin = t * 0.12;
    carousel.rotation.y = spin;
    for (let i = 0; i < NC; i++) {
      const a = (i / NC) * TAU + spin + PI / NC;
      const x = barX + Math.cos(a) * 3.35;
      const z = barZ - Math.sin(a) * 3.35;
      const y = 1.55 + Math.sin(t * 1.6 + i * 1.7) * 0.22;
      cq2.setFromAxisAngle(yAx, a + PI);
      cm.compose(cpos.set(x, y, z), cq2, one);
      for (const im of catInst) im.setMatrixAt(i, cm);
      cm.compose(cpos.set(x, 2.0, z), cq2, one);
      pole.setMatrixAt(i, cm);
    }
    for (const im of catInst) im.instanceMatrix.needsUpdate = true;
    pole.instanceMatrix.needsUpdate = true;
  });

  // ---------- the Midway booths (ring of carnival games against the wall)
  type Booth = 'ring' | 'darts' | 'bottles' | 'skee' | 'claw' | 'water' | 'wheel' | 'prizes' | 'candy' | 'arcade';
  const booths: Array<[Booth, number]> = [
    ['ring', 0.52],
    ['darts', 0.95],
    ['candy', 1.32],
    ['bottles', 1.72],
    ['water', 2.12],
    ['skee', 2.55],
    ['prizes', 2.86],
    ['arcade', 3.55],
    ['claw', 3.98],
    ['darts', 4.32],
    ['wheel', -PI / 2 - 0.42 + TAU],
    ['ring', 5.38],
    ['prizes', 5.72],
    ['bottles', 6.02],
  ];
  const plushCol = () => PLUSH[Math.floor(rnd() * PLUSH.length)];
  const signOf: Record<Booth, Rect> = { ring: C.ringToss, darts: C.darts, bottles: C.bottles, skee: C.skee, claw: C.claw, water: C.water, wheel: C.bigWheel, prizes: C.prizes, candy: C.candy, arcade: C.arcade };
  const awnOf: Record<Booth, Rect> = { ring: C.stripesRed, darts: C.stripesBlue, bottles: C.stripesRed, skee: C.stripesPink, claw: C.stripesBlue, water: C.stripesPink, wheel: C.stripesRed, prizes: C.stripesBlue, candy: C.stripesPink, arcade: C.stripesBlue };
  const wheelSpin: THREE.Mesh[] = [];
  for (const [kind, th] of booths) {
    const [bx, bz] = P(17.05, th);
    const ry = rotIn(th);
    const W = 3.6;
    k.at(bx, DECK_Y, bz, ry, () => {
      // back wall + side posts + counter
      k.box(M, 0x2a1440, 0, 1.35, -0.75, W, 2.7, 0.08);
      for (const sx of [-1, 1]) {
        for (let j = 0; j < 5; j++) k.box(M, j % 2 ? 0xffffff : 0xd0122e, sx * (W / 2), 0.27 + j * 0.54, 0.55, 0.14, 0.54, 0.14);
      }
      k.box(M, 0xffd23a, 0, 0.5, 0.55, W, 1.0, 0.25);
      k.box(MET, GOLD, 0, 1.02, 0.55, W + 0.05, 0.05, 0.32);
      for (let j = 0; j < 9; j++) k.add(new THREE.OctahedronGeometry(0.05, 0), glowMat(), j % 2 ? 0xfff2b0 : 0xff7ab8, -W / 2 + 0.2 + j * ((W - 0.4) / 8), 0.85, 0.69);
      // striped awning sloping toward the walkway + hem bulbs
      const awn = new THREE.PlaneGeometry(W + 0.3, 1.5);
      region(awn, awnOf[kind]);
      k.add(awn, cLit(), 0xffffff, 0, 2.95, 0.15, 0, -1.05);
      for (let j = 0; j < 10; j++) k.add(new THREE.OctahedronGeometry(0.055, 0), glowMat(), 0xfff2b0, -W / 2 + j * (W / 9), 2.6, 0.78);
      // booth sign above
      cq(k, cGlow(), signOf[kind], 0, 3.45, 0.2, 2.6, 0.62, 0, -0.1, 0xe8e8e8);
      k.box(vcMat(0.5), 0x1a1014, 0, 3.45, 0.17, 2.7, 0.7, 0.05, 0, -0.1);
      // the back wall's prize display: rows of plushies (stuffed tabbies included)
      if (kind !== 'arcade' && kind !== 'candy') {
        for (let row = 0; row < 3; row++) {
          for (let j = 0; j < 8; j++) {
            if (kind === 'skee' && row < 1) continue;
            plush(k, -W / 2 + 0.3 + j * ((W - 0.6) / 7), 1.25 + row * 0.5, -0.62, 0, row === 2 && j % 3 === 1 ? 0x8a7a66 : plushCol(), row === 2 ? 1.15 : 0.9);
          }
        }
        // giant hanging tabby on top
        plush(k, W / 2 - 0.5, 2.35, -0.5, 0, 0x8a7a66, 1.8);
      }
      // game-specific dressing
      if (kind === 'ring') {
        k.box(M, 0x1a6a3a, 0, 0.7, -0.15, W - 0.5, 0.7, 0.9);
        for (let r2 = 0; r2 < 4; r2++) for (let j = 0; j < 10; j++) k.cyl(vcMat(0.15, 0.1), [0x2a8a4a, 0x8a5a2a, 0x2a5a8a][(r2 + j) % 3], -1.35 + j * 0.3, 1.19, -0.5 + r2 * 0.24, 0.045, 0.06, 0.28, 6);
      } else if (kind === 'darts') {
        k.box(M, 0x2a2a3a, 0, 1.75, -0.66, W - 0.4, 1.6, 0.06);
        for (let r2 = 0; r2 < 4; r2++) for (let j = 0; j < 9; j++) k.add(new THREE.SphereGeometry(0.13, 8, 6), vcMat(0.2, 0.1), [0xff2a5a, 0xffd23a, 0x3ad8ff, 0x7ad84a, 0xff8ad0][(r2 * 3 + j) % 5], -1.4 + j * 0.35, 1.2 + r2 * 0.36, -0.55);
      } else if (kind === 'bottles') {
        for (const px of [-1.1, 0, 1.1]) {
          k.cyl(M, 0xd0122e, px, 0.6, -0.25, 0.25, 0.25, 1.2, 12);
          for (const [ox, oy] of [
            [-0.13, 0],
            [0.13, 0],
            [0, 0.3],
          ]) k.cyl(vcMat(0.3), 0xf4f4f0, px + ox, 1.35 + oy, -0.25, 0.07, 0.11, 0.3, 8);
        }
      } else if (kind === 'skee') {
        for (let j = 0; j < 4; j++) {
          const lx = -1.35 + j * 0.9;
          k.box(vcMat(0.5), 0x7a1fb8, lx, 0.55, 0.3, 0.75, 0.5, 2.2, 0, 0.18);
          k.box(vcMat(0.6), 0x2a1430, lx, 1.3, -0.65, 0.75, 1.6, 0.25);
          for (const [rr, yy] of [
            [0.22, 1.0],
            [0.15, 1.35],
            [0.1, 1.62],
          ]) {
            const ringG = new THREE.TorusGeometry(rr, 0.025, 4, 14);
            k.add(ringG, glowMat(), 0xffd23a, lx, yy, -0.5);
          }
          cq(k, cGlow(), C.score, lx, 2.25, -0.51, 0.7, 0.18, 0, 0, 0xffffff);
        }
      } else if (kind === 'claw') {
        for (let j = 0; j < 3; j++) {
          const lx = -1.1 + j * 1.1;
          k.box(M, 0x0f8a7a, lx, 0.45, -0.1, 0.95, 0.9, 0.95);
          k.box(glassMat(), 0xffffff, lx, 1.35, -0.1, 0.95, 0.9, 0.95);
          k.box(glowMat(), [0xff5fa2, 0x3ae8ff, 0xffd23a][j], lx, 1.9, -0.1, 0.97, 0.2, 0.97);
          for (let q = 0; q < 6; q++) plush(k, lx - 0.3 + (q % 3) * 0.3, 0.9, -0.3 + Math.floor(q / 3) * 0.35, q, plushCol(), 0.6);
          k.cyl(MET, 0xc8ccd4, lx, 1.62, -0.1, 0.01, 0.01, 0.3, 4);
          k.cyl(MET, 0xc8ccd4, lx, 1.45, -0.1, 0.06, 0.02, 0.08, 6);
        }
      } else if (kind === 'water') {
        for (let j = 0; j < 6; j++) {
          const lx = -1.4 + j * 0.56;
          k.add(new THREE.SphereGeometry(0.16, 10, 8), M, 0xfff4ee, lx, 1.5, -0.55);
          k.add(new THREE.SphereGeometry(0.04, 6, 4), glowMat(), 0xff2020, lx, 1.5, -0.4);
          k.add(new THREE.SphereGeometry(0.08, 6, 4), M, 0xff6a1a, lx - 0.13, 1.6, -0.58);
          k.add(new THREE.SphereGeometry(0.08, 6, 4), M, 0xff6a1a, lx + 0.13, 1.6, -0.58);
          k.add(new THREE.SphereGeometry(0.12 + (j % 3) * 0.05, 8, 6), vcMat(0.2, 0.1), [0xff2a5a, 0xffd23a, 0x3ad8ff][j % 3], lx, 1.95 + (j % 3) * 0.08, -0.55);
          k.cyl(MET, 0x8a8e96, lx, 1.12, 0.45, 0.03, 0.03, 0.2, 5, 0, PI / 2);
        }
      } else if (kind === 'candy') {
        k.box(glassMat(), 0xffffff, 0, 1.5, 0.1, W - 0.6, 0.9, 0.6);
        for (let j = 0; j < 9; j++) {
          const cone = new THREE.SphereGeometry(0.17, 8, 6);
          cone.scale(1, 1.3, 1);
          k.add(cone, vcMat(0.95), j % 2 ? 0xff9ad8 : 0x9ad8ff, -1.3 + j * 0.32, 1.55, 0.1);
          k.cyl(vcMat(0.6), 0xf4f0e8, -1.3 + j * 0.32, 1.3, 0.1, 0.012, 0.012, 0.25, 4);
        }
        k.cyl(MET, 0xc8ccd4, 0, 0.9, -0.4, 0.4, 0.3, 0.5, 14);
        ppl.standing.push({ ...(() => {
          const p = k.world(0.6, 0, -0.2);
          return { x: p.x, y: DECK_Y, z: p.z };
        })(), rot: k.worldRot(0), shirt: 0xff8ad0, vest: 0xffffff });
      } else if (kind === 'arcade') {
        for (let j = 0; j < 4; j++) {
          const lx = -1.3 + j * 0.86;
          k.box(M, [0x2a1a5a, 0x5a1a2a, 0x1a4a5a, 0x3a3a1a][j], lx, 0.9, -0.3, 0.75, 1.8, 0.7);
          k.box(glowMat(), [0x3ae8ff, 0xff5fa2, 0x7ad84a, 0xffd23a][j], lx, 1.25, 0.06, 0.6, 0.5, 0.02, 0, -0.2);
          k.box(glowMat(), 0xffffff, lx, 1.78, 0.06, 0.7, 0.16, 0.02);
        }
      } else if (kind === 'wheel') {
        k.box(M, 0x1a1014, 0, 1.85, -0.6, 2.4, 2.4, 0.12);
      }
      // a carnival barker / attendant behind the counter
      if (kind !== 'arcade' && kind !== 'candy') {
        const p = k.world(-W / 2 + 0.7, 0, 0.05);
        ppl.standing.push({ x: p.x, y: DECK_Y, z: p.z, rot: k.worldRot(0), shirt: 0xd0122e, vest: 0xffd23a });
      }
    });
    if (kind === 'wheel') {
      const face = new THREE.Mesh(region(new THREE.CircleGeometry(1.05, 40), C.wheelFace), new THREE.MeshBasicMaterial({ map: circusAtlas() }));
      const [fx, fz] = P(17.05 - 0.6, th);
      face.position.set(fx, DECK_Y + 1.9, fz);
      face.rotation.y = ry;
      group.add(face);
      wheelSpin.push(face);
    }
    // players in front of the booth (families: a grown-up and kids)
    if (kind !== 'wheel') {
      const p = k.world(0, 0, 0);
      void p;
      const [ax, az] = P(15.5, th + 0.05);
      ppl.standing.push({ x: ax, y: DECK_Y, z: az, rot: Math.atan2(Math.cos(th), Math.sin(th)), shirt: GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)] });
    }
  }
  anim.push((t) => {
    for (const f of wheelSpin) f.rotateZ(0.016 + Math.max(0, Math.sin(t * 0.4)) * 0.04);
  });
  void wheelTh;

  // ---------- posters, popcorn + cotton-candy carts on the floor
  for (const th of [0.42, -0.42, PI - 0.6, PI + 0.6]) {
    const [x, z] = P(R - 0.2, th);
    cq(k, cLit(), th > 0 && th < 1 ? C.poster : C.poster2, x, 2.85, z, 1.4, 1.4, rotIn(th));
  }
  const cart = (x: number, y: number, z: number, ry: number, pop: boolean) => {
    k.at(x, y, z, ry, () => {
      for (let j = 0; j < 4; j++) k.box(M, j % 2 ? 0xffffff : 0xd0122e, -0.45 + j * 0.3, 0.55, 0, 0.3, 0.7, 0.7);
      k.box(MET, GOLD, 0, 0.92, 0, 1.25, 0.05, 0.75);
      k.box(glassMat(), 0xffffff, 0, 1.3, 0, 1.0, 0.7, 0.6);
      if (pop) {
        for (let j = 0; j < 40; j++) k.add(new THREE.IcosahedronGeometry(0.05, 0), vcMat(0.9), 0xfff0b0, -0.4 + (j % 8) * 0.11, 1.0 + Math.floor(j / 8) * 0.05, -0.2 + ((j * 7) % 5) * 0.1);
        k.box(glowMat(), 0xffe8a0, 0, 1.64, 0, 1.0, 0.04, 0.6);
      } else {
        for (let j = 0; j < 6; j++) {
          const cc = new THREE.SphereGeometry(0.16, 8, 6);
          cc.scale(1, 1.3, 1);
          k.add(cc, vcMat(0.95), j % 2 ? 0xff9ad8 : 0x9ad8ff, -0.35 + (j % 3) * 0.35, 1.3, -0.12 + Math.floor(j / 3) * 0.24);
        }
      }
      for (const wx2 of [-0.5, 0.5]) {
        const wh = new THREE.TorusGeometry(0.22, 0.04, 5, 12);
        wh.rotateY(PI / 2);
        k.add(wh, M, 0xffd23a, wx2, 0.22, 0.38);
      }
      k.cyl(MET, GOLD, 0.55, 1.5, 0, 0.02, 0.02, 1.6, 5);
      const umb = new THREE.ConeGeometry(0.85, 0.35, 8, 1, true);
      region(umb, pop ? C.stripesRed : C.stripesPink);
      k.add(umb, cLit(), 0xffffff, 0.55, 2.4, 0);
      cq(k, cGlow(), pop ? C.popcorn : C.candy, 0, 1.82, 0.31, 1.0, 0.25, 0, 0, 0xffffff);
      const seller = k.world(0, 0, -0.75);
      ppl.standing.push({ x: seller.x, y, z: seller.z, rot: k.worldRot(0), shirt: pop ? 0xd0122e : 0xff8ad0, vest: 0xffffff });
    });
  };
  cart(cx + 9.5, 0, cz + 4.6, -PI / 2 - 0.3, true);
  cart(cx + 9.2, 0, cz - 4.8, -PI / 2 + 0.3, false);
  {
    const [x, z] = P(15.0, 0.22);
    cart(x, DECK_Y, z, rotIn(0.22) + PI / 2, true);
  }

  // ---------- people
  // Standing families on the floor near the stage watching the acts
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.11;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.35) continue;
    if (Math.abs(Math.atan2(Math.sin(a - PI / 2), Math.cos(a - PI / 2))) < 0.3) continue;
    const r = 5.3 + (i % 3) * 0.35;
    const [x, z] = P(r, a);
    ppl.standing.push({ x, z, rot: rotIn(a), shirt: GUEST_SHIRTS[(i * 5) % GUEST_SHIRTS.length] });
  }
  buildPeople(group, 'sit', ppl.seated);
  buildPeople(group, 'stand', ppl.standing);
  // kids (scaled-down figures) watching the stage and walking the Midway with their families
  const kidsG = new THREE.Group();
  const KS = 0.62;
  kidsG.scale.setScalar(KS);
  group.add(kidsG);
  const kids: Person[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.4;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.3) continue;
    const [x, z] = P(4.85, a);
    kids.push({ x: x / KS, z: z / KS, rot: rotIn(a), shirt: [0xffd23a, 0x3ad8ff, 0xff5fa2, 0x7ad84a][i % 4] });
  }
  buildPeople(kidsG, 'stand', kids);
  const midwayG = new THREE.Group();
  midwayG.position.y = DECK_Y;
  group.add(midwayG);
  const loop: Array<[number, number]> = [];
  for (let i = 0; i < 24; i++) loop.push(P(14.6, (i / 24) * TAU));
  const strollers = [] as Array<Person & { speed: number; phase: number }>;
  for (let i = 0; i < 6; i++) strollers.push({ x: 0, z: 0, rot: 0, shirt: GUEST_SHIRTS[(i * 3 + 1) % GUEST_SHIRTS.length], speed: i % 2 ? -0.9 : 1.0, phase: i / 6 });
  const wMid = new Walkers(midwayG, 'stand', strollers, loop);
  const kidMidG = new THREE.Group();
  kidMidG.position.y = DECK_Y;
  kidMidG.scale.setScalar(KS);
  group.add(kidMidG);
  const kidLoop = loop.map(([x, z]) => [x / KS, z / KS] as [number, number]);
  const kidWalk = [] as Array<Person & { speed: number; phase: number }>;
  for (let i = 0; i < 6; i++) kidWalk.push({ x: 0, z: 0, rot: 0, shirt: [0xffd23a, 0x3ad8ff, 0xff5fa2][i % 3], speed: (i % 2 ? -0.9 : 1.0) / KS, phase: i / 6 + 0.012 });
  const wKid = new Walkers(kidMidG, 'stand', kidWalk, kidLoop);
  const serverLoop: Array<[number, number]> = [];
  for (let i = 0; i < 16; i++) serverLoop.push(P(10.9, (i / 16) * TAU));
  const wServ = new Walkers(group, 'server', [{ x: 0, z: 0, rot: 0, shirt: 0xd0122e, vest: 0xffd23a, speed: 0.9, phase: 0 }, { x: 0, z: 0, rot: 0, shirt: 0xd0122e, vest: 0xffd23a, speed: -0.8, phase: 0.5 }], serverLoop);
  anim.push((t) => {
    wMid.update(t);
    wKid.update(t);
    wServ.update(t);
  });
  // security domes under the deck
  for (let i = 0; i < 6; i++) {
    const [x, z] = P(15.6, (i / 6) * TAU + 0.3);
    cameraDome(k, x, DECK_Y - 0.44, z);
  }

  k.flush(group);
  return anim;
}

// ------------------------------------------------------------------------------------------------
// The Promenade: the south wing as a walk-through arcade from the Strip to the Adventuredome
// ------------------------------------------------------------------------------------------------
export interface PromenadeSpec {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
  /** Strip-side doorway centre z (east wall) and the Adventuredome link centre z (west wall). */
  eastDoorZ: number;
  westDoorZ: number;
  /** Where the glass link meets the dome (x). */
  domeX: number;
}

export function buildPromenade(b: WorldBuilder, p: PromenadeSpec): void {
  const { x0, x1, z0, z1, h } = p;
  const T = 0.6;
  const ceilY = 5.2;
  const wallM = new THREE.MeshStandardMaterial({ color: 0xe85a9a, roughness: 0.6 });
  const box = (cx: number, cy: number, cz: number, w: number, hh: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), wallM);
    m.position.set(cx, cy, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    b.add(m);
  };
  box((x0 + x1) / 2, h / 2, z0 + T / 2, x1 - x0, h, T);
  box((x0 + x1) / 2, h / 2, z1 - T / 2, x1 - x0, h, T);
  b.collider(x0, x1, z0, z0 + T, 0, h, true);
  b.collider(x0, x1, z1 - T, z1, 0, h, true);
  const ends: Array<[number, number, number]> = [
    [x1 - T / 2, p.eastDoorZ, 5],
    [x0 + T / 2, p.westDoorZ, 4],
  ];
  for (const [x, dz, dw] of ends) {
    const a0 = z0 + T;
    const a1 = dz - dw / 2;
    const c0 = dz + dw / 2;
    const c1 = z1 - T;
    box(x, h / 2, (a0 + a1) / 2, T, h, a1 - a0);
    box(x, h / 2, (c0 + c1) / 2, T, h, c1 - c0);
    box(x, (4.2 + h) / 2, dz, T, h - 4.2, dw);
    b.collider(x - T / 2, x + T / 2, a0, a1, 0, h, true);
    b.collider(x - T / 2, x + T / 2, c0, c1, 0, h, true);
    b.collider(x - T / 2, x + T / 2, dz - dw / 2, dz + dw / 2, 4.2, h, true);
  }
  // roof: walkable on top, camera slab under the drop ceiling
  b.collider(x0, x1, z0, z1, h - 0.4, h);
  b.collider(x0 + T, x1 - T, z0 + T, z1 - T, ceilY + 0.2, ceilY + 0.6);
  b.zone('Circus Circus Promenade Shoppes', x0, x1, z0, z1);
  // the glass link to the Adventuredome
  const lz = p.westDoorZ;
  b.collider(p.domeX, x0, lz - 2.1, lz - 1.7, 0, 4.2, true);
  b.collider(p.domeX, x0, lz + 1.7, lz + 2.1, 0, 4.2, true);
  b.collider(p.domeX, x0, lz - 2.1, lz + 2.1, 4.0, 4.4);
  b.zone('Circus Circus Promenade Shoppes', p.domeX, x0, lz - 2, lz + 2);
  b.crowd.tourists.push(
    { pts: [[x1 + 3, p.eastDoorZ - 0.6], [x1 - 6, p.eastDoorZ - 0.6], [x0 + 6, lz - 0.6], [p.domeX - 6, lz - 0.6], [p.domeX - 6, lz + 0.6], [x0 + 6, lz + 0.6], [x1 - 6, p.eastDoorZ + 0.6], [x1 + 3, p.eastDoorZ + 0.6]], prop: 'bag' },
    { pts: [[x0 + 8, lz + 1.4], [x1 - 8, p.eastDoorZ + 1.6]], prop: 'yard-drink' }
  );
  gated(b, new THREE.Group(), x0, x1, z0, z1, 3);

  const group = new THREE.Group();
  group.name = 'interior:circus-promenade';
  group.visible = false;
  b.scene.add(group);
  const gate: GateBox = {
    minX: p.domeX,
    maxX: x1,
    minZ: z0,
    maxZ: z1,
    height: h,
    doors: [
      { x: x1, z: p.eastDoorZ, nx: 1, nz: 0, half: 2.5 },
      { x: p.domeX, z: lz, nx: -1, nz: 0, half: 2 },
    ],
  };
  let built = false;
  b.every(() => {
    if (!built && catDistance(gate) < 70) {
      built = true;
      layoutPromenade(group, p, ceilY);
    }
    group.visible = built && gateOpen(gate);
  });
}

function layoutPromenade(group: THREE.Group, p: PromenadeSpec, ceilY: number): void {
  const { x0, x1, z0, z1 } = p;
  const k = new Kit();
  const M = vcMat(0.6);
  const MET = vcMat(0.3, 0.85);
  const ix0 = x0 + 0.6;
  const ix1 = x1 - 0.6;
  const iz0 = z0 + 0.6;
  const iz1 = z1 - 0.6;
  const W = ix1 - ix0;
  const D = iz1 - iz0;
  const cx = (ix0 + ix1) / 2;
  const cz = (iz0 + iz1) / 2;
  // floor: a red runner down the middle on a blue star carpet
  const fl = new THREE.PlaneGeometry(W, D);
  fl.rotateX(-PI / 2);
  k.add(fl, vcMat(0.9), 0x1a1450, cx, 0.03, cz);
  const run = new THREE.PlaneGeometry(W, 3.2);
  run.rotateX(-PI / 2);
  k.add(run, vcMat(0.9), 0xa8102a, cx, 0.035, cz);
  for (let x = ix0 + 1; x < ix1; x += 2.2) {
    const st = new THREE.CircleGeometry(0.22, 5);
    st.rotateX(-PI / 2);
    k.add(st, M, 0xffd23a, x, 0.04, cz + ((Math.round(x) % 2) - 0.5) * 4.2);
  }
  // striped tent ceiling + string lights
  const ce = new THREE.PlaneGeometry(W, D);
  ce.rotateX(PI / 2);
  k.add(ce, vcMat(0.8), 0xfff0f6, cx, ceilY, cz);
  for (let x = ix0 + 0.5; x < ix1; x += 2.0) k.box(M, Math.round(x / 2) % 2 ? 0xffffff : 0xff4f98, x, ceilY - 0.1, cz, 1.0, 0.18, D);
  for (const zz of [cz - 2.4, cz + 2.4]) {
    for (let x = ix0 + 0.4; x < ix1; x += 0.8) k.add(new THREE.OctahedronGeometry(0.07, 0), glowMat(), Math.round(x / 0.8) % 3 ? 0xfff2b0 : 0xff7ab8, x, ceilY - 0.35 - Math.abs(Math.sin(x * 0.4)) * 0.3, zz);
  }
  // storefronts on both walls: glowing fronts, striped awnings, signs
  const shops: Rect[] = [C.shopCandy, C.shopGifts, C.shopArcade, C.shopFood];
  const awns: Rect[] = [C.stripesPink, C.stripesBlue, C.stripesRed, C.stripesRed];
  let n = 0;
  for (const side of [-1, 1]) {
    const wz = side < 0 ? iz0 : iz1;
    const ry = side < 0 ? 0 : PI;
    for (let x = ix0 + 6; x < ix1 - 6; x += 10) {
      const i = n++ % 4;
      k.at(x, 0, wz, ry, () => {
        k.box(glowMat(), [0xffd8ec, 0xd8e8ff, 0x2a1a5a, 0xffe8c8][i], 0, 1.6, 0.05, 6.4, 3.0, 0.06);
        k.box(M, 0xffffff, 0, 3.25, 0.12, 7.0, 0.3, 0.2);
        for (const sx of [-1, 1]) k.box(M, 0xffd23a, sx * 3.35, 1.6, 0.12, 0.3, 3.2, 0.24);
        const awn = new THREE.PlaneGeometry(6.8, 1.2);
        region(awn, awns[i]);
        k.add(awn, cLit(), 0xffffff, 0, 3.55, 0.55, 0, -1.0);
        cq(k, cGlow(), shops[i], 0, 4.4, 0.13, 4.4, 0.8, 0, 0, 0xe8e8e8);
        if (i === 0) for (let q = 0; q < 10; q++) k.add(new THREE.SphereGeometry(0.16, 8, 6), vcMat(0.4), PLUSH[q % PLUSH.length], -2.5 + q * 0.55, 1.1, 0.3);
        else if (i === 1) for (let q = 0; q < 9; q++) plush(k, -2.4 + q * 0.6, 0.9, 0.3, 0, PLUSH[(q + 3) % PLUSH.length], 1.1);
        else if (i === 2) {
          for (let q = 0; q < 4; q++) {
            k.box(M, 0x1a1a2a, -2.1 + q * 1.4, 0.9, 0.6, 0.8, 1.8, 0.7);
            k.box(glowMat(), [0x3ae8ff, 0xff5fa2, 0x7ad84a, 0xffd23a][q], -2.1 + q * 1.4, 1.25, 0.96, 0.62, 0.48, 0.02);
          }
        } else k.box(M, 0xc8a070, 0, 0.55, 0.5, 5.6, 1.1, 0.6);
      });
    }
  }
  // wayfinding + posters
  csign(k, C.dome, ix0 + 3.5, 3.3, p.westDoorZ, 3.2, 0.8, PI / 2);
  csign(k, C.bigtop, ix1 - 3.5, 3.6, p.eastDoorZ, 3.2, 0.6, PI / 2);
  cq(k, cLit(), C.poster, cx - 8, 2.2, iz0 + 0.04, 1.6, 1.6, 0);
  cq(k, cLit(), C.poster2, cx + 8, 2.2, iz1 - 0.04, 1.6, 1.6, PI);
  // the glass link tube to the dome
  const lx0 = p.domeX;
  const lx1 = x0;
  const lcx = (lx0 + lx1) / 2;
  const lw = lx1 - lx0;
  const lf = new THREE.PlaneGeometry(lw, 3.6);
  lf.rotateX(-PI / 2);
  k.add(lf, vcMat(0.9), 0xa8102a, lcx, 0.04, p.westDoorZ);
  for (const sz of [-1.9, 1.9]) {
    k.box(glassMat(), 0xffffff, lcx, 2.1, p.westDoorZ + sz, lw, 4.2, 0.05);
    k.box(MET, 0xe8237a, lcx, 0.1, p.westDoorZ + sz, lw, 0.2, 0.12);
    for (let x = lx0 + 0.2; x <= lx1; x += 1.6) k.box(MET, 0xe8237a, x, 2.1, p.westDoorZ + sz, 0.12, 4.2, 0.12);
  }
  const roof = new THREE.CylinderGeometry(1.95, 1.95, lw, 16, 1, true, -PI / 2, PI);
  roof.rotateZ(PI / 2);
  k.add(roof, glassMat(), 0xffffff, lcx, 4.2, p.westDoorZ);
  k.flush(group);
  const people: Person[] = [];
  for (let i = 0; i < 10; i++) {
    const x = ix0 + 5 + i * ((W - 10) / 9);
    const z = cz + (i % 2 ? 2.2 : -2.0);
    people.push({ x, z, rot: i % 2 ? PI : 0, shirt: GUEST_SHIRTS[(i * 3) % GUEST_SHIRTS.length] });
  }
  buildPeople(group, 'stand', people);
}

/** One warm pooled light over the middle of the big top. */
export function bigTopLight(b: WorldBuilder, cx: number, cz: number): void {
  b.light(0xffc8e0, 22, 34, cx, 8.5, cz, 0.7);
  void viewer;
}
