import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { chaseBulbMaterial, mat } from './props';
import { LedBoard } from './textures';
import type { LedShow } from './textures';
import {
  animate,
  bulbPath,
  bulbRect,
  driveLed,
  fitFont,
  font,
  goldGradient,
  kit,
  ledFaces,
  letterFace,
  letters,
  marqueePylon,
  mixWhite,
  neonPanel,
  neonFace,
  neonStroke,
  neonText,
  paintNeonText,
  part,
  placed,
  rotatedCollider,
} from './signKit';

/**
 * The Strip's landmark signs, built from the shared kit (signKit.ts). Each builder places one
 * property's roadside pylon and building lettering; district files call these in place of the old
 * generic neon boxes. Pylons face ±z (Boulevard traffic) unless noted.
 */

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 16, rTop = r) => new THREE.CylinderGeometry(rTop, r, h, seg);

/** A gable / pediment prism: base w, rise h, depth d, sitting on y = 0, facing ±z. */
function pediment(w: number, h: number, d: number): THREE.BufferGeometry {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

/** Turn a group's children into a placed group on the builder, with the footprint collider. */
function place(b: WorldBuilder, g: THREE.Group, x: number, z: number, rotY: number, foot: [number, number], h: number): void {
  b.add(g, x, 0, z, rotY);
  rotatedCollider(b, x, z, rotY, 0, 0, foot[0], foot[1], 0, h, true);
}

// ====================================================================== Caesars Palace
const CAESARS_SHOWS: LedShow[] = [
  { name: 'THE COLOSSEUM', sub: 'LIVE • FRI & SAT 8PM', color: '#7a1a2a', art: 'singer' },
  { name: 'ABSINTHE', sub: 'NIGHTLY IN THE SPIEGELTENT', color: '#5a1a6a', art: 'cirque' },
  { name: 'OMNIA', sub: 'TONIGHT • GUEST DJ', color: '#1a3a8a', art: 'dj' },
];

/**
 * Caesars Palace marquee at the Flamingo Rd corner: four Roman columns in a row carry a bronze-framed
 * LED board, a black frieze with gold Roman CAESARS / PALACE, a cornice and a pediment with Caesar's
 * gold medallion. Plus gold channel letters on the colonnade and the tower crown.
 */
export function caesarsSigns(b: WorldBuilder): void {
  const stone = mat(0xece4d2, 0.55);
  const gold = mat(0xd9a93e, 0.3, 0.85);
  const bronze = mat(0x5a3e22, 0.4, 0.7);
  const marble = mat(0x16120e, 0.3, 0.2);
  const g = new THREE.Group();
  // base: stepped plinth and four columns in a row
  g.add(part(box(11, 0.35, 3.2), stone, 0, 0.175, 0));
  g.add(part(box(10.2, 0.7, 2.6), stone, 0, 0.7, 0));
  for (const x of [-3.75, -1.25, 1.25, 3.75]) {
    g.add(part(box(1.3, 0.4, 1.3), stone, x, 1.25, 0));
    g.add(part(cyl(0.5, 7.6, 16, 0.44), stone, x, 5.25, 0));
    g.add(part(cyl(0.5, 0.18, 16), gold, x, 8.6, 0));
    g.add(part(box(1.35, 0.5, 1.35), stone, x, 9.2, 0));
  }
  g.add(part(box(10.6, 0.9, 2.4), stone, 0, 9.9, 0));
  g.add(part(box(10.7, 0.12, 2.45), gold, 0, 10.4, 0));
  // LED board in a bronze frame with gold fillets
  const led = new LedBoard(
    'CAESARS PALACE',
    ['THE FORUM SHOPS', 'BACCHANAL BUFFET', "HELL'S KITCHEN", 'NOBU HOTEL', 'GARDEN OF THE GODS POOLS'],
    ['#8a1a1a', '#c9a04a', '#1a2a6a', '#3a1a5a', '#0a5a6a'],
    512,
    512
  ).withShows(CAESARS_SHOWS);
  const ledW = 9.2;
  const ledH = 9.2;
  const ledY = 10.6 + 0.35 + ledH / 2;
  g.add(part(box(ledW + 0.7, ledH + 0.7, 1.3), bronze, 0, ledY, 0));
  g.add(placed(ledFaces(led, ledW, ledH, 1.3), 0, ledY, 0));
  for (const s of [-1, 1]) g.add(part(box(0.16, ledH + 0.5, 1.4), gold, s * (ledW / 2 + 0.2), ledY, 0));
  // frieze: gold Roman letters on black marble, both faces
  const fy = ledY + ledH / 2 + 0.35 + 1.5;
  g.add(part(box(11.2, 3.0, 1.9), marble, 0, fy, 0));
  const frieze = letterFace(b, 10.9, 2.8, (ctx, w, h) => {
    ctx.fillStyle = '#120e0a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = goldGradient(ctx, 0, h);
    ctx.lineWidth = h * 0.035;
    ctx.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, 'CAESARS', 'roman', w * 0.84, h * 0.56, 0.14);
    ctx.fillStyle = goldGradient(ctx, h * 0.12, h * 0.62);
    ctx.fillText('CAESARS', w / 2, h * 0.39);
    fitFont(ctx, 'PALACE', 'roman', w * 0.5, h * 0.25, 0.45);
    ctx.fillStyle = goldGradient(ctx, h * 0.68, h * 0.9);
    ctx.fillText('PALACE', w / 2, h * 0.79);
    // laurel sprigs either side of PALACE
    ctx.strokeStyle = '#d9a93e';
    ctx.fillStyle = '#d9a93e';
    ctx.lineWidth = h * 0.015;
    for (const s of [-1, 1]) {
      const cx = w / 2 + s * w * 0.27;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(cx + s * i * h * 0.06, h * 0.79 - Math.sin(i * 0.5) * h * 0.04, h * 0.035, h * 0.014, s * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.letterSpacing = '0px';
  }, 1.9);
  g.add(placed(frieze, 0, fy, 0));
  // cornice, dentils, pediment with Caesar's medallion
  const cy = fy + 1.5;
  g.add(part(box(12, 0.5, 2.5), stone, 0, cy + 0.25, 0));
  g.add(part(box(11.6, 0.18, 2.2), gold, 0, cy + 0.02, 0));
  const ped = part(pediment(11.6, 2.4, 2.0), stone, 0, cy + 0.5, 0);
  g.add(ped);
  const medal = letterFace(b, 1.45, 1.45, (ctx, w, h) => {
    ctx.fillStyle = goldGradient(ctx, 0, h);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5418';
    ctx.lineWidth = w * 0.03;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    // Caesar's laureate profile, facing left
    ctx.fillStyle = '#8a5e1a';
    ctx.beginPath();
    ctx.moveTo(w * 0.36, h * 0.3);
    ctx.quadraticCurveTo(w * 0.52, h * 0.18, w * 0.64, h * 0.32);
    ctx.quadraticCurveTo(w * 0.68, h * 0.5, w * 0.6, h * 0.66);
    ctx.lineTo(w * 0.62, h * 0.8);
    ctx.lineTo(w * 0.42, h * 0.8);
    ctx.lineTo(w * 0.42, h * 0.66);
    ctx.lineTo(w * 0.34, h * 0.6);
    ctx.lineTo(w * 0.36, h * 0.54);
    ctx.lineTo(w * 0.31, h * 0.5);
    ctx.quadraticCurveTo(w * 0.32, h * 0.4, w * 0.36, h * 0.3);
    ctx.fill();
    ctx.strokeStyle = '#f7dc8a';
    ctx.lineWidth = w * 0.025;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(w * (0.42 + i * 0.05), h * (0.28 + Math.abs(i - 2) * 0.012), w * 0.03, w * 0.012, -0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, 2.0);
  g.add(placed(medal, 0, cy + 1.4, 0));
  // gold acroteria
  g.add(part(new THREE.ConeGeometry(0.35, 0.9, 8), gold, 0, cy + 3.3, 0));
  for (const s of [-1, 1]) g.add(part(new THREE.ConeGeometry(0.28, 0.7, 8), gold, s * 5.6, cy + 0.85, 0));
  const x = -26.5;
  const z = -15.2;
  place(b, g, x, z, 0, [10.4, 2.8], cy + 3);
  driveLed(b, led, x, ledY, z);

  // Gold channel letters over the colonnade (facing the Boulevard) and on the Augustus tower crown
  b.add(letters(b, 'CAESARS PALACE', 15, 1.7, { style: 'roman', fill: 'gold', edge: '#3a2608', spacing: 0.08 }), -52.35, 9.95, -53, Math.PI / 2);
  b.add(letters(b, 'CAESARS PALACE', 19, 2.6, { style: 'roman', fill: 'gold', edge: '#3a2608', spacing: 0.06 }), -109.85, 37.6, -50, Math.PI / 2);
}

// ====================================================================== Flamingo
/** The plume: a fan of pink and orange neon ostrich feathers on transparent ground (1024×640). */
function plumeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  const ctx = c.getContext('2d')!;
  const ox = 512;
  const oy = 690;
  const n = 15;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b2) => Math.abs(b2 - 7) - Math.abs(a - 7)); // outer first, centre on top
  for (const i of order) {
    const a = ((i - (n - 1) / 2) / ((n - 1) / 2)) * 1.25; // −72° … +72°
    const len = 640 - Math.abs(i - 7) * 26;
    const pink = i % 2 === 0;
    const col = pink ? '#ff3ea5' : '#ff7a1a';
    const lite = pink ? '#ffb0dc' : '#ffc890';
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(a);
    // feather body: a long teardrop that widens toward a curled tip, frilled edges
    const wmax = 46 + (7 - Math.abs(i - 7)) * 2;
    const steps = 22;
    const edge = (sgn: number) => {
      const pts: Array<[number, number]> = [];
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const y = -60 - t * (len - 60);
        const wdt = wmax * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.92)) ** 0.8 * (1 + 0.12 * Math.sin(t * 40 + i));
        const curl = Math.sin(t * Math.PI * 0.9) * 18 * Math.sign(a || 1) * t;
        pts.push([curl + sgn * wdt, y]);
      }
      return pts;
    };
    const L = edge(-1);
    const Rr = edge(1);
    const body = new Path2D();
    body.moveTo(L[0][0], L[0][1]);
    for (const [x, y] of L) body.lineTo(x, y);
    for (let k = Rr.length - 1; k >= 0; k--) body.lineTo(Rr[k][0], Rr[k][1]);
    body.closePath();
    const gr = ctx.createLinearGradient(0, -60, 0, -len);
    gr.addColorStop(0, col);
    gr.addColorStop(0.62, col);
    gr.addColorStop(0.9, lite);
    gr.addColorStop(1, col);
    ctx.fillStyle = gr;
    ctx.fill(body);
    // barbs
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let k = 2; k < steps; k++) {
      const [lx, ly] = L[k];
      const [rx, ry] = Rr[k];
      const mx = (lx + rx) / 2;
      ctx.beginPath();
      ctx.moveTo(mx, ly + 6);
      ctx.lineTo(lx + 4, ly - 10);
      ctx.moveTo(mx, ry + 6);
      ctx.lineTo(rx - 4, ry - 10);
      ctx.stroke();
    }
    // neon: outline tube and the quill
    neonStroke(ctx, body, col, 5);
    const quill = new Path2D();
    quill.moveTo(0, -20);
    quill.quadraticCurveTo(Math.sign(a || 1) * 10, -len * 0.5, (L[steps][0] + Rr[steps][0]) / 2, -len + 8);
    neonStroke(ctx, quill, '#fff2fa', 3);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Flamingo: the giant neon feather plume on a drum over the entrance (feathers light in a wave from the
 * centre outward at night), and the pink script "Flamingo" in neon on its plum cabinet.
 */
export function flamingoSigns(b: WorldBuilder): void {
  const tex = plumeTexture();
  const uni = { uTime: { value: 0 }, uNight: { value: 0 } };
  const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.3, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uni.uTime;
    sh.uniforms.uNight = uni.uNight;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uNight;').replace(
      '#include <map_fragment>',
      `#include <map_fragment>
        {
          vec2 pq = vMapUv - vec2(0.5, -0.08);
          float ang = abs(atan(pq.x, max(pq.y, 0.001)));
          float wave = 0.5 + 0.5 * sin(uTime * 4.2 - ang * 7.0 - length(pq) * 3.0);
          float k = mix(0.82, 0.78 + 0.62 * wave, uNight);
          diffuseColor.rgb *= k;
        }`
    );
  };
  m.customProgramCacheKey = () => 'flamingo-plume';
  animate(b, (t, n) => {
    uni.uTime.value = t % 1000;
    uni.uNight.value = n;
  });
  // drum segment bulging toward the Boulevard (west), over the casino roof line
  const R = 22;
  const len = 30;
  const th = len / R;
  const plumeH = 17;
  const geo = new THREE.CylinderGeometry(R, R, plumeH, 24, 1, true, -Math.PI / 2 - th / 2, th);
  // CylinderGeometry's u runs with theta; flip it so the fan reads left→right from the street
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  const plume = new THREE.Mesh(geo, m);
  plume.userData.dynamic = true;
  b.add(plume, 24.4 + R, 11.4 + plumeH / 2, -65.4);
  // steel ribs behind the feathers
  const steel = mat(0x3a1a30, 0.6, 0.4);
  for (const zz of [-74, -65.4, -57]) b.add(part(box(0.4, 3, 0.4), steel, 27, 13, zz));

  // "Flamingo" script over the porte-cochère, on a plum cabinet, and on the hotel tower
  const script = neonPanel(b, 'Flamingo', 15, 3.6, { style: 'script', color: '#ff4fb8', fill: '#ff7ccb', bg: 0x2b0722, depth: 0.5, size: 0.86 });
  b.add(script, 25.0, 9.2, -66, -Math.PI / 2);
  b.add(placed(bulbRect(15, 3.6, 0.5, 0.2, false, 0.4, 0.2), 0, 0, 0), 25.0, 9.2, -66, -Math.PI / 2);
  const towerScript = neonPanel(b, 'Flamingo', 15, 3.4, { style: 'script', color: '#ff4fb8', fill: '#ffe4f2', bg: 0x3a0c2c, depth: 0.4, size: 0.86 });
  b.add(towerScript, 104.7, 26.6, -64, -Math.PI / 2);
}

// ====================================================================== Harrah's
const HARRAHS_SHOWS: LedShow[] = [
  { name: 'THE IMPROV', sub: 'STAND-UP NIGHTLY 8:30PM', color: '#8a1a1a', art: 'comic' },
  { name: 'MAC KING', sub: 'COMEDY MAGIC • AFTERNOONS', color: '#1a4a8a', art: 'magic' },
  { name: 'PIANO BAR', sub: 'DUELING PIANOS • FREE ENTRY', color: '#6a2a8a', art: 'band' },
];

/** Harrah's: a burgundy and gold marquee with the script logo in a bulb-chased crown; script on the tower. */
export function harrahsSigns(b: WorldBuilder): void {
  const led = new LedBoard("HARRAH'S", ['CARNAVAL COURT • LIVE BANDS', 'RUTH’S CHRIS STEAK HOUSE', 'FLAMINGO • LINQ • HARRAH’S', 'CAESARS REWARDS'], ['#9a1a1a', '#c9a04a', '#1a3a6a', '#6a1a4a'], 256, 512).withShows(HARRAHS_SHOWS);
  const frame = mat(0x5a0e14, 0.5, 0.3);
  const gold = mat(0xd9a93e, 0.3, 0.85);
  const crown = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#a3121e');
    g.addColorStop(1, '#5a0810');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = goldGradient(ctx, 0, h);
    ctx.lineWidth = h * 0.05;
    ctx.strokeRect(h * 0.12, h * 0.12, w - h * 0.24, h - h * 0.24);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, "Harrah's", 'script', w * 0.82, h * 0.72);
    ctx.lineWidth = h * 0.05;
    ctx.strokeStyle = '#3a0408';
    ctx.strokeText("Harrah's", w / 2, h * 0.5);
    ctx.fillStyle = goldGradient(ctx, h * 0.2, h * 0.8);
    ctx.fillText("Harrah's", w / 2, h * 0.5);
  };
  const { g, top } = marqueePylon(b, { w: 6, ledH: 7.2, ledY: 6.5, led, frame, trim: gold, legs: 'single', legW: 1.6, crownH: 2.8, crownW: 7.4, crown, bulbs: true });
  // gold fan / jester crest on top
  for (let i = -3; i <= 3; i++) g.add(part(new THREE.ConeGeometry(0.22, 1.6 - Math.abs(i) * 0.15, 6), gold, i * 0.75, top + 0.7 - Math.abs(i) * 0.07, 0, 0, 0, -i * 0.18));
  g.add(part(new THREE.SphereGeometry(0.28, 10, 8), gold, 0, top + 1.6, 0));
  const x = 22.2;
  const z = -176;
  place(b, g, x, z, 0, [7.6, 1.6], top + 1.6);
  driveLed(b, led, x, 10, z);
  // tower crown script (west face at x = 61)
  b.add(neonPanel(b, "Harrah's", 16, 4.2, { style: 'script', color: '#ffd24d', fill: '#f2c14e', bg: 0x6a0e16, depth: 0.4, size: 0.84 }), 60.75, 31.5, -165, -Math.PI / 2);
}

// ====================================================================== The LINQ
/** The LINQ: big white LINQ letters on the hotel's crown (cool white neon at night). */
export function linqSigns(b: WorldBuilder): void {
  // white backlit channel letters (no neon over them: white + tubes bloomed into a blob at night)
  b.add(letters(b, 'LINQ', 15, 4.6, { style: 'block', fill: '#eef2f6', edge: '#c0207a', edgeW: 10, spacing: 0.12, scale: 0.86 }), 21.85, 20.6, -128, -Math.PI / 2);
  // promenade gateway: THE LINQ in white on the slate entrance cabinet with a cyan tube underline
  b.add(neonPanel(b, 'THE LINQ', 10, 1.8, { style: 'sans', color: '#5ad0ff', fill: '#eaf8ff', bg: 0x0d1420, depth: 0.28, spacing: 0.25, size: 0.72 }), 39, 6, -117.8);
}

// ====================================================================== Venetian / Palazzo
const VENETIAN_SHOWS: LedShow[] = [
  { name: 'BLUE MAN GROUP', sub: 'VENETIAN THEATRE • NIGHTLY', color: '#1a3aa8', art: 'band' },
  { name: 'TAO NIGHTCLUB', sub: 'THURSDAY • FRIDAY • SATURDAY', color: '#8a1a2a', art: 'dj' },
  { name: 'ATOMIC SALOON SHOW', sub: 'SPIEGELWORLD • 18+', color: '#7a4a1a', art: 'cirque' },
];

function venetianCrown(text: string, sub: string, bg: string): (ctx: CanvasRenderingContext2D, w: number, h: number) => void {
  return (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = goldGradient(ctx, 0, h);
    ctx.lineWidth = h * 0.04;
    ctx.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, text, 'roman', w * 0.84, h * 0.46, 0.08);
    ctx.fillStyle = goldGradient(ctx, h * 0.18, h * 0.6);
    ctx.fillText(text, w / 2, h * 0.42);
    fitFont(ctx, sub, 'serif', w * 0.6, h * 0.16, 0.4);
    ctx.fillStyle = '#f2d28a';
    ctx.fillText(sub, w / 2, h * 0.76);
    ctx.letterSpacing = '0px';
  };
}

/** Lion of St Mark (gold, winged) for the Venetian's crown. */
function lionOfStMark(b: WorldBuilder, two: number): THREE.Object3D {
  return letterFace(b, 2.6, 1.8, (ctx, w, h) => {
    ctx.fillStyle = goldGradient(ctx, 0, h);
    ctx.beginPath(); // body
    ctx.ellipse(w * 0.5, h * 0.66, w * 0.28, h * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); // head + mane
    ctx.arc(w * 0.22, h * 0.48, h * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(w * 0.27, h * 0.7, w * 0.05, h * 0.26); // legs
    ctx.fillRect(w * 0.66, h * 0.7, w * 0.05, h * 0.26);
    ctx.beginPath(); // wing
    ctx.moveTo(w * 0.42, h * 0.58);
    ctx.quadraticCurveTo(w * 0.6, h * 0.05, w * 0.92, h * 0.08);
    ctx.lineTo(w * 0.82, h * 0.2);
    ctx.lineTo(w * 0.88, h * 0.28);
    ctx.lineTo(w * 0.76, h * 0.38);
    ctx.lineTo(w * 0.8, h * 0.46);
    ctx.quadraticCurveTo(w * 0.66, h * 0.56, w * 0.6, h * 0.6);
    ctx.fill();
    ctx.lineWidth = w * 0.02; // tail
    ctx.strokeStyle = '#d9a93e';
    ctx.beginPath();
    ctx.moveTo(w * 0.78, h * 0.66);
    ctx.quadraticCurveTo(w * 0.95, h * 0.62, w * 0.9, h * 0.44);
    ctx.stroke();
    ctx.strokeStyle = '#7a5418';
    ctx.lineWidth = w * 0.01;
    ctx.beginPath();
    ctx.arc(w * 0.22, h * 0.48, h * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  }, two);
}

export function venetianSigns(b: WorldBuilder): void {
  const stone = mat(0xf0e6d2, 0.6);
  const gold = mat(0xd9a93e, 0.3, 0.85);
  const led = new LedBoard('THE VENETIAN', ['GRAND CANAL SHOPPES', 'GONDOLA RIDES DAILY', 'SPHERE • NEXT DOOR', 'MADAME TUSSAUDS'], ['#8a1a2a', '#c9a04a', '#1a4a7a', '#4a2a6a'], 256, 512).withShows(VENETIAN_SHOWS);
  const { g, top } = marqueePylon(b, { w: 5.4, ledH: 7.4, ledY: 6.2, led, frame: stone, trim: gold, legs: 'twin', legW: 1.0, crownH: 2.4, crownW: 6.6, crown: venetianCrown('THE VENETIAN', 'RESORT • LAS VEGAS', '#5a1020') });
  // Venetian-Gothic cap: pointed gable, the winged lion on top
  g.add(part(pediment(6.8, 1.4, 1.5), stone, 0, top, 0));
  g.add(placed(lionOfStMark(b, 0.4), 0, top + 2.1, 0));
  g.add(part(box(2.4, 0.3, 0.4), gold, 0, top + 1.25, 0));
  for (const s of [-1, 1]) g.add(part(new THREE.ConeGeometry(0.3, 1.4, 8), gold, s * 3.2, top + 0.7, 0));
  const x = 21.7;
  const z = -244.6;
  place(b, g, x, z, 0, [5.6, 1.2], top + 3);
  driveLed(b, led, x, 10, z);
  // facade + tower lettering: gold Roman letters
  b.add(letters(b, 'THE VENETIAN', 13, 2.0, { style: 'roman', fill: 'gold', edge: '#3a2608', spacing: 0.08 }), 38.7, 9.6, -276, -Math.PI / 2);
  b.add(letters(b, 'THE VENETIAN', 16, 2.6, { style: 'roman', fill: 'gold', edge: '#3a2608', spacing: 0.06 }), 87.5, 39.6, -266, -Math.PI / 2);
}

const PALAZZO_SHOWS: LedShow[] = [
  { name: 'LAVO', sub: 'ITALIAN • NIGHTCLUB', color: '#5a3a1a', art: 'dj' },
  { name: 'PALAZZO THEATRE', sub: 'BROADWAY ON THE STRIP', color: '#6a1a2a', art: 'singer' },
];

export function palazzoSigns(b: WorldBuilder): void {
  const bronze = mat(0x3a2a18, 0.45, 0.6);
  const gold = mat(0xd9a93e, 0.3, 0.85);
  const led = new LedBoard('THE PALAZZO', ['SHOPPES AT THE PALAZZO', 'BOUTIQUES • DINING', 'ALL-SUITE RESORT', 'CUT BY WOLFGANG PUCK'], ['#7a5a2a', '#2a1a10', '#c9a04a', '#5a2a1a'], 256, 512).withShows(PALAZZO_SHOWS);
  const crown = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = '#1d150a';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, 'PALAZZO', 'deco', w * 0.86, h * 0.55, 0.16);
    ctx.fillStyle = goldGradient(ctx, h * 0.2, h * 0.7);
    ctx.fillText('PALAZZO', w / 2, h * 0.46);
    fitFont(ctx, 'THE', 'deco', w * 0.3, h * 0.18, 0.5);
    ctx.fillStyle = '#f2d28a';
    ctx.fillText('THE', w / 2, h * 0.14);
    fitFont(ctx, 'LAS VEGAS', 'deco', w * 0.5, h * 0.15, 0.5);
    ctx.fillText('LAS VEGAS', w / 2, h * 0.82);
    ctx.letterSpacing = '0px';
  };
  const { g, top } = marqueePylon(b, { w: 5.2, ledH: 8.4, ledY: 6.6, led, frame: bronze, trim: gold, legs: 'single', legW: 1.3, crownH: 2.6, crownW: 6.0, crown });
  g.add(part(box(6.4, 0.4, 1.8), gold, 0, top + 0.2, 0));
  g.add(part(box(4.4, 0.5, 1.4), bronze, 0, top + 0.65, 0));
  const x = 22.6;
  const z = -308;
  place(b, g, x, z, 0, [1.6, 1.6], top + 1);
  driveLed(b, led, x, 10, z);
  b.add(letters(b, 'THE PALAZZO', 12, 1.8, { style: 'deco', fill: 'gold', edge: '#2a1a08', spacing: 0.1 }), 20.85, 7.2, -340, -Math.PI / 2);
  b.add(letters(b, 'PALAZZO', 16, 3.0, { style: 'deco', fill: 'gold', edge: '#2a1a08', spacing: 0.14 }), 57.85, 54, -350, -Math.PI / 2);
}

// ====================================================================== Paris balloon
/** Chase bulbs in a horizontal ring of radius r at height y (quads face outward). */
export function bulbRing(r: number, y: number, count: number, size = 0.24): THREE.Mesh {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const s = size / 2;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const cx = nx * r;
    const cz = nz * r;
    // tangent (right) = (cos a, 0, -sin a)
    const tx = Math.cos(a) * s;
    const tz = -Math.sin(a) * s;
    const k = i % 3;
    const u0 = k / 3 + 0.01;
    const u1 = (k + 1) / 3 - 0.01;
    const base = pos.length / 3;
    pos.push(cx - tx, y - s, cz - tz, cx + tx, y - s, cz + tz, cx + tx, y + s, cz + tz, cx - tx, y + s, cz - tz);
    for (let q = 0; q < 4; q++) nor.push(nx, 0, nz);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return new THREE.Mesh(g, chaseBulbMaterial());
}

/** The Montgolfier balloon sign glows at night (backlit envelope) and wears rings of chasing bulbs. */
export function parisBalloonGlow(b: WorldBuilder, balloon: THREE.Group, sphere: THREE.Mesh, r: number, cy: number): void {
  const m = sphere.material as THREE.MeshStandardMaterial;
  m.emissiveMap = m.map;
  m.emissive.setHex(0xffffff);
  b.nightGlow(m, 0.04, 0.62);
  for (const [k, n] of [
    [0, 64],
    [0.42, 54],
    [-0.42, 54],
    [0.75, 38],
  ] as Array<[number, number]>) {
    const y = cy + k * r;
    const rr = Math.sqrt(Math.max(0, r * r - (k * r) ** 2)) + 0.06;
    balloon.add(bulbRing(rr, y, n));
  }
}

// ====================================================================== Horseshoe
function horseshoeCrest(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#7a0a10');
  g.addColorStop(1, '#3a0306');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = goldGradient(ctx, 0, h);
  ctx.lineWidth = h * 0.04;
  ctx.strokeRect(h * 0.07, h * 0.07, w - h * 0.14, h - h * 0.14);
  // the gold horseshoe, open end up, with nail holes
  const cx = h * 0.62;
  const cy = h * 0.52;
  const R = h * 0.3;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = goldGradient(ctx, cy - R, cy + R);
  ctx.lineWidth = R * 0.42;
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI * 0.82, Math.PI * 0.18, true);
  ctx.stroke();
  ctx.fillStyle = '#5a0406';
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.86 - i * 0.12);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, R * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tx = h * 1.1 + (w - h * 1.1) / 2;
  fitFont(ctx, 'HORSESHOE', 'slab', (w - h * 1.3) * 0.96, h * 0.5, 0.06);
  ctx.lineWidth = h * 0.03;
  ctx.strokeStyle = '#2a0204';
  ctx.strokeText('HORSESHOE', tx, h * 0.44);
  ctx.fillStyle = goldGradient(ctx, h * 0.2, h * 0.66);
  ctx.fillText('HORSESHOE', tx, h * 0.44);
  fitFont(ctx, 'LAS VEGAS', 'sans', (w - h * 1.3) * 0.5, h * 0.15, 0.6);
  ctx.fillStyle = '#ffe6a8';
  ctx.fillText('LAS VEGAS', tx, h * 0.78);
  ctx.letterSpacing = '0px';
}

/** Horseshoe: gold horseshoe crest and slab-serif lettering on red cabinets (tower crown and the casino front). */
export function horseshoeSigns(b: WorldBuilder): void {
  const red = mat(0x3a0306, 0.5, 0.3);
  for (const [x, y, z, w, h] of [
    [101.75, 22, 32, 13, 2.8],
    [53.3, 9.4, 37, 10, 2.2],
  ]) {
    const g = new THREE.Group();
    g.add(part(box(w, h, 0.4), red, 0, 0, 0));
    g.add(placed(letterFace(b, w - 0.05, h - 0.05, horseshoeCrest), 0, 0, 0.212));
    g.add(placed(bulbRect(w, h, 0.4, 0.14, false, 0.34, 0.16), 0, 0, 0));
    b.add(g, x, y, z, -Math.PI / 2);
  }
}

// ====================================================================== Planet Hollywood
/** Planet Hollywood: white block lettering with hot-pink tubes over the LED-wrapped podium and on the tower. */
export function planetHollywoodSigns(b: WorldBuilder): void {
  b.add(neonPanel(b, 'PLANET HOLLYWOOD', 18, 2.6, { style: 'block', color: '#ff3a8a', fill: '#ffffff', bg: 0x06060a, depth: 0.35, spacing: 0.04, size: 0.66 }), 20.8, 15.6, 158, -Math.PI / 2);
  b.add(neonPanel(b, 'PLANET HOLLYWOOD', 17, 2.6, { style: 'block', color: '#ff3a8a', fill: '#ffffff', bg: 0x06060a, depth: 0.35, spacing: 0.04, size: 0.66 }), 85.8, 33, 153, -Math.PI / 2);
}

// ====================================================================== Wynn / Encore
/** The Wynn signature: script with a long underline swash, in bronze leaf; warm neon at night. */
function signature(text: string): (ctx: CanvasRenderingContext2D, w: number, h: number) => void {
  return (ctx, w, h) => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const px = fitFont(ctx, text, 'script', w * 0.8, h * 0.82);
    ctx.save();
    ctx.translate(w / 2, h * 0.46);
    ctx.transform(1, 0, -0.12, 1, 0, 0);
    ctx.lineWidth = px * 0.05;
    ctx.strokeStyle = '#4a2a10';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = goldGradient(ctx, -px * 0.4, px * 0.4, 'bronze');
    ctx.fillText(text, 0, 0);
    ctx.restore();
    // the swash under the name
    ctx.strokeStyle = goldGradient(ctx, h * 0.7, h * 0.9, 'bronze');
    ctx.lineCap = 'round';
    ctx.lineWidth = h * 0.045;
    ctx.beginPath();
    ctx.moveTo(w * 0.16, h * 0.86);
    ctx.bezierCurveTo(w * 0.4, h * 0.74, w * 0.7, h * 0.95, w * 0.9, h * 0.72);
    ctx.stroke();
  };
}

/** Wynn / Encore signatures on the tower crowns and the porte-cochère (replace the font-only logos). */
export function wynnSignature(b: WorldBuilder, text: string, w: number, h: number): THREE.Object3D {
  const g = new THREE.Group();
  g.add(letterFace(b, w, h, signature(text)));
  g.add(placed(neonFace(b, w, h, (ctx, pw, ph) => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const px = fitFont(ctx, text, 'script', pw * 0.8, ph * 0.82);
    ctx.save();
    ctx.translate(pw / 2, ph * 0.46);
    ctx.transform(1, 0, -0.12, 1, 0, 0);
    paintNeonText(ctx, 0, 0, text, 'script', px, '#ffb35a', 0, 0.035);
    ctx.restore();
    const p = new Path2D();
    p.moveTo(pw * 0.16, ph * 0.86);
    p.bezierCurveTo(pw * 0.4, ph * 0.74, pw * 0.7, ph * 0.95, pw * 0.9, ph * 0.72);
    neonStroke(ctx, p, '#ffb35a', ph * 0.02);
  }), 0, 0, 0.02));
  return g;
}

// ====================================================================== Treasure Island
const TI_SHOWS: LedShow[] = [
  { name: 'MYSTÈRE', sub: 'CIRQUE DU SOLEIL • NIGHTLY', color: '#1a5a8a', art: 'cirque' },
  { name: 'MARVEL AVENGERS S.T.A.T.I.O.N.', sub: 'OPEN DAILY', color: '#8a1a1a', art: 'band' },
];

function skullAndBones(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const bone = ctx.createLinearGradient(0, 0, 0, h);
  bone.addColorStop(0, '#fffaf0');
  bone.addColorStop(1, '#d8c8a8');
  ctx.fillStyle = bone;
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = w * 0.012;
  // crossbones
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(w / 2, h * 0.62);
    ctx.rotate(s * 0.62);
    ctx.beginPath();
    ctx.roundRect(-w * 0.42, -h * 0.045, w * 0.84, h * 0.09, h * 0.04);
    ctx.fill();
    ctx.stroke();
    for (const e of [-1, 1]) {
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(e * w * 0.43, k * h * 0.05, h * 0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // skull
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.38, w * 0.24, h * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(w * 0.36, h * 0.5, w * 0.28, h * 0.2, h * 0.04);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1a120a';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(w / 2 + s * w * 0.1, h * 0.4, w * 0.065, h * 0.075, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.47);
  ctx.lineTo(w * 0.47, h * 0.53);
  ctx.lineTo(w * 0.53, h * 0.53);
  ctx.fill();
  for (let i = 0; i < 5; i++) ctx.fillRect(w * (0.39 + i * 0.05), h * 0.6, w * 0.012, h * 0.09);
}

/** Treasure Island: a weathered-timber marquee with the skull and crossbones on top, gold TREASURE ISLAND, red TI. */
export function treasureIslandSigns(b: WorldBuilder): void {
  const timber = mat(0x4a3420, 0.85);
  const iron = mat(0x2a2622, 0.5, 0.6);
  const led = new LedBoard('TI', ['TREASURE ISLAND', "SIRENS' COVE", 'GILLEY’S SALOON', 'FREE PARKING'], ['#1a4a7a', '#8a1a1a', '#c9a04a', '#2a5a3a'], 256, 512).withShows(TI_SHOWS);
  const crown = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = '#2a1c10';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (let y = h * 0.25; y < h; y += h * 0.25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, 'TREASURE', 'slab', w * 0.86, h * 0.36, 0.06);
    ctx.lineWidth = h * 0.03;
    ctx.strokeStyle = '#1a0e04';
    ctx.strokeText('TREASURE', w / 2, h * 0.3);
    ctx.fillStyle = goldGradient(ctx, h * 0.12, h * 0.48);
    ctx.fillText('TREASURE', w / 2, h * 0.3);
    fitFont(ctx, 'ISLAND', 'slab', w * 0.7, h * 0.36, 0.14);
    ctx.strokeText('ISLAND', w / 2, h * 0.72);
    ctx.fillStyle = goldGradient(ctx, h * 0.54, h * 0.9);
    ctx.fillText('ISLAND', w / 2, h * 0.72);
    ctx.letterSpacing = '0px';
  };
  const { g, top } = marqueePylon(b, { w: 5.0, ledH: 6.4, ledY: 6.0, led, frame: timber, trim: iron, legs: 'twin', legW: 0.9, crownH: 2.6, crownW: 6.4, crown, bulbs: true });
  g.add(placed(neonText(b, 'TI', 2.4, 1.4, 'block', '#ff3b2f', 1.0), 0, 3.6, 0));
  g.add(part(box(2.6, 1.6, 0.9), iron, 0, 3.6, 0));
  g.add(placed(letterFace(b, 4.4, 3.4, skullAndBones, 0.2), 0, top + 1.6, 0));
  g.add(part(box(4.0, 0.25, 0.2), iron, 0, top + 0.1, 0));
  const x = -22.6;
  const z = -328;
  place(b, g, x, z, 0, [5.6, 1.0], top + 3.4);
  driveLed(b, led, x, 10, z);
}

// ====================================================================== Excalibur
const EXCALIBUR_SHOWS: LedShow[] = [
  { name: 'TOURNAMENT OF KINGS', sub: 'DINNER • JOUSTING • NIGHTLY', color: '#8a1a1a', art: 'band' },
  { name: 'THUNDER FROM DOWN UNDER', sub: 'THUNDER ROOM • 18+', color: '#1f3f86', art: 'dj' },
];

/** Excalibur: a castle-gate marquee between two round turrets with red / blue / gold cone roofs, battlements and gothic gold lettering. */
export function excaliburSigns(b: WorldBuilder, x = -23.4, z = 476): void {
  const stone = mat(0xf2efe6, 0.75);
  const roofs = [mat(0xb3121f, 0.55), mat(0x1f3f86, 0.55), mat(0xd4a640, 0.35, 0.6)];
  const gold = mat(0xd9a93e, 0.3, 0.85);
  const led = new LedBoard('EXCALIBUR', ['FUN DUNGEON MIDWAY', 'ROUND TABLE BUFFET', 'DICK’S LAST RESORT', 'FREE TRAM TO LUXOR & MANDALAY'], ['#b3121f', '#1f3f86', '#d4a640', '#2a7a3a'], 256, 512).withShows(EXCALIBUR_SHOWS);
  const g = new THREE.Group();
  const w = 6.4;
  const ledH = 8;
  const ledY = 5.2;
  const crownH = 2.6;
  const crownY = ledY + ledH + 0.3 + crownH / 2;
  const tx = w / 2 + 1.0;
  // turrets
  for (const s of [-1, 1]) {
    const th = crownY + crownH / 2 + 1.6;
    g.add(part(cyl(1.05, th, 16, 0.95), stone, s * tx, th / 2, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(part(box(0.42, 0.55, 0.42), stone, s * tx + Math.cos(a) * 0.98, th + 0.27, Math.sin(a) * 0.98, -a));
    }
    g.add(part(new THREE.ConeGeometry(1.25, 3.2, 16), roofs[s < 0 ? 0 : 1], s * tx, th + 2.2, 0));
    g.add(part(new THREE.SphereGeometry(0.16, 8, 6), gold, s * tx, th + 3.9, 0));
    g.add(part(box(0.04, 1.4, 0.04), gold, s * tx, th + 4.5, 0));
    g.add(part(box(0.8, 0.45, 0.03), roofs[s < 0 ? 2 : 0], s * tx + 0.42, th + 4.9, 0));
    for (const yy of [3.2, 7.2, 11.2]) g.add(part(box(0.28, 0.9, 0.12), mat(0x1a1410, 0.6), s * tx, yy, s * 0.0 + 1.0)); // arrow slits
  }
  // the gate: a stone arch under the board
  g.add(part(box(w + 0.6, ledY, 1.1), stone, 0, ledY / 2, 0));
  g.add(part(box(2.4, 3.2, 1.2), mat(0x2a1a10, 0.7), 0, 1.6, 0));
  g.add(part(new THREE.CylinderGeometry(1.2, 1.2, 1.2, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), mat(0x2a1a10, 0.7), 0, 3.2, 0));
  // board
  g.add(part(box(w + 0.5, ledH + 0.5, 1.0), stone, 0, ledY + ledH / 2, 0));
  g.add(placed(ledFaces(led, w, ledH, 1.0), 0, ledY + ledH / 2, 0));
  // crown with battlements
  g.add(part(box(w + 1.0, crownH, 1.2), stone, 0, crownY, 0));
  g.add(placed(letterFace(b, w + 0.8, crownH - 0.2, (ctx, cw, ch) => {
    const gr = ctx.createLinearGradient(0, 0, 0, ch);
    gr.addColorStop(0, '#b3121f');
    gr.addColorStop(1, '#6a0810');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = goldGradient(ctx, 0, ch);
    ctx.lineWidth = ch * 0.05;
    ctx.strokeRect(ch * 0.08, ch * 0.08, cw - ch * 0.16, ch - ch * 0.16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, 'Excalibur', 'gothic', cw * 0.84, ch * 0.78);
    ctx.lineWidth = ch * 0.04;
    ctx.strokeStyle = '#3a0408';
    ctx.strokeText('Excalibur', cw / 2, ch * 0.54);
    ctx.fillStyle = goldGradient(ctx, ch * 0.15, ch * 0.85);
    ctx.fillText('Excalibur', cw / 2, ch * 0.54);
  }, 1.2), 0, crownY, 0));
  for (let i = -3; i <= 3; i++) g.add(part(box(0.6, 0.6, 1.2), stone, i * 1.05, crownY + crownH / 2 + 0.3, 0));
  // sword in the stone on top
  g.add(part(box(0.12, 2.2, 0.06), mat(0xd8dde4, 0.2, 0.9), 0, crownY + crownH / 2 + 1.7, 0));
  g.add(part(box(0.9, 0.12, 0.12), gold, 0, crownY + crownH / 2 + 2.5, 0));
  g.add(part(new THREE.SphereGeometry(0.12, 8, 6), gold, 0, crownY + crownH / 2 + 3.0, 0));
  b.add(g, x, 0, z);
  b.collider(x - tx - 1.05, x + tx + 1.05, z - 1.05, z + 1.05, 0, crownY + crownH / 2 + 1.6, true);
  driveLed(b, led, x, ledY + ledH / 2, z);
}

/** Gold gothic Excalibur letters for the tower face. */
export function excaliburTowerLetters(b: WorldBuilder): THREE.Object3D {
  return letters(b, 'Excalibur', 10, 2.4, { style: 'gothic', fill: 'gold', edge: '#5a0a10', edgeW: 6 });
}

// ====================================================================== Luxor
const LUXOR_SHOWS: LedShow[] = [
  { name: 'CARROT TOP', sub: 'ATRIUM SHOWROOM • NIGHTLY', color: '#1f3f86', art: 'comic' },
  { name: 'BLUE MAN GROUP', sub: 'BLUE MAN THEATER', color: '#1a3aa8', art: 'band' },
  { name: 'FANTASY', sub: 'ATRIUM SHOWROOM • 18+', color: '#7a1c6a', art: 'singer' },
];

/** Luxor: a sandstone Egyptian pylon (battered piers, cavetto cornice, winged sun disc) carrying the LED board, LUXOR in gold. */
export function luxorSigns(b: WorldBuilder, x = -23.4, z = 604): void {
  const sand = mat(0xc9a878, 0.8);
  const dark = mat(0x1a1c2a, 0.5, 0.3);
  const gold = mat(0xe0b04a, 0.3, 0.85);
  const led = new LedBoard('LUXOR', ['TITANIC: THE ARTIFACT EXHIBITION', 'BODIES… THE EXHIBITION', 'HYDE BELLAGIO • ESPORTS ARENA', 'THE SKY BEAM IS ON'], ['#1f3f86', '#c9a04a', '#7a1c6a', '#0a6a7a'], 256, 512).withShows(LUXOR_SHOWS);
  const g = new THREE.Group();
  const w = 6.2;
  const ledH = 8.6;
  const ledY = 5.4;
  // battered piers either side, painted with hieroglyph bands
  for (const s of [-1, 1]) {
    const pier = new THREE.CylinderGeometry(0.9 * Math.SQRT2 * 0.72, 1.2 * Math.SQRT2 * 0.72, ledY + ledH + 1.2, 4, 1);
    pier.rotateY(Math.PI / 4);
    g.add(part(pier, sand, s * (w / 2 + 1.0), (ledY + ledH + 1.2) / 2, 0));
    const glyphs = letterFace(b, 1.2, 9, (ctx, pw, ph) => {
      ctx.fillStyle = '#c9a878';
      ctx.fillRect(0, 0, pw, ph);
      ctx.fillStyle = '#1f3f86';
      ctx.fillRect(pw * 0.08, 0, pw * 0.04, ph);
      ctx.fillRect(pw * 0.88, 0, pw * 0.04, ph);
      const R = rngSigns(7 + s);
      for (let y = ph * 0.03; y < ph * 0.97; y += pw * 0.5) {
        const k = Math.floor(R() * 5);
        ctx.fillStyle = ['#1f3f86', '#8a1a1a', '#2a6a4a', '#1a1a1a', '#b07a1a'][k];
        const cx = pw / 2;
        const cy = y + pw * 0.22;
        const r = pw * 0.2;
        ctx.beginPath();
        if (k === 0) ctx.ellipse(cx, cy, r * 1.3, r * 0.6, 0, 0, Math.PI * 2); // eye
        else if (k === 1) ctx.arc(cx, cy, r, 0, Math.PI * 2); // sun
        else if (k === 2) {
          ctx.moveTo(cx - r, cy + r); // reed
          ctx.lineTo(cx, cy - r);
          ctx.lineTo(cx + r * 0.4, cy + r);
        } else if (k === 3) ctx.rect(cx - r, cy - r * 0.3, r * 2, r * 0.6); // water
        else {
          ctx.moveTo(cx, cy - r); // ankh
          ctx.arc(cx, cy - r * 0.5, r * 0.45, 0, Math.PI * 2);
          ctx.rect(cx - r * 0.12, cy - r * 0.1, r * 0.24, r * 1.2);
          ctx.rect(cx - r * 0.6, cy + r * 0.05, r * 1.2, r * 0.22);
        }
        ctx.fill();
      }
    }, 1.75);
    g.add(placed(glyphs, s * (w / 2 + 1.0), ledY + ledH / 2 - 0.4, 0));
  }
  // board between the piers
  g.add(part(box(w + 0.4, ledH + 0.4, 1.0), dark, 0, ledY + ledH / 2, 0));
  g.add(placed(ledFaces(led, w, ledH, 1.0), 0, ledY + ledH / 2, 0));
  g.add(part(box(w + 0.2, ledY, 0.9), sand, 0, ledY / 2, 0));
  // cavetto cornice with LUXOR and the winged sun disc
  const cy = ledY + ledH + 1.6;
  g.add(part(box(w + 3.8, 2.4, 1.9), sand, 0, cy, 0));
  g.add(part(box(w + 4.4, 0.4, 2.3), gold, 0, cy + 1.4, 0));
  g.add(placed(letterFace(b, w + 3.6, 2.2, (ctx, cw, ch) => {
    ctx.fillStyle = '#141a30';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#e0b04a';
    ctx.fillRect(0, 0, cw, ch * 0.08);
    ctx.fillRect(0, ch * 0.92, cw, ch * 0.08);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = i % 2 ? '#1f3f86' : '#c9a04a';
      ctx.fillRect((i / 26) * cw, ch * 0.08, cw / 26, ch * 0.08);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, 'LUXOR', 'roman', cw * 0.7, ch * 0.62, 0.32);
    ctx.fillStyle = goldGradient(ctx, ch * 0.25, ch * 0.85);
    ctx.fillText('LUXOR', cw / 2, ch * 0.58);
    ctx.letterSpacing = '0px';
  }, 1.9), 0, cy, 0));
  const disc = letterFace(b, 4.2, 1.3, (ctx, cw, ch) => {
    ctx.fillStyle = goldGradient(ctx, 0, ch);
    ctx.beginPath();
    ctx.arc(cw / 2, ch * 0.5, ch * 0.34, 0, Math.PI * 2);
    ctx.fill();
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(cw / 2 + s * ch * 0.36, ch * (0.36 + k * 0.08));
        ctx.quadraticCurveTo(cw / 2 + s * cw * 0.3, ch * (0.2 + k * 0.1), cw / 2 + s * cw * (0.48 - k * 0.06), ch * (0.3 + k * 0.12));
        ctx.lineTo(cw / 2 + s * ch * 0.36, ch * (0.44 + k * 0.08));
        ctx.fill();
      }
    }
    ctx.fillStyle = '#8a1a1a';
    ctx.beginPath();
    ctx.arc(cw / 2, ch * 0.5, ch * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }, 0.3);
  g.add(placed(disc, 0, cy + 2.4, 0));
  g.add(part(box(0.4, 0.8, 0.3), gold, 0, cy + 1.8, 0));
  b.add(g, x, 0, z);
  b.collider(x - w / 2 - 2.1, x + w / 2 + 2.1, z - 1.2, z + 1.2, 0, cy + 3, true);
  driveLed(b, led, x, ledY + ledH / 2, z);
}

function rngSigns(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Gold LUXOR letters lying on the pyramid's Strip face (replaces the boxed neon sign; same transform). */
export function luxorPyramidLetters(b: WorldBuilder): THREE.Object3D {
  return neonPanel(b, 'LUXOR', 14, 2.8, { style: 'roman', color: '#ffd27a', fill: '#f2c86a', spacing: 0.3, size: 0.78 });
}

// ====================================================================== Mandalay Bay
const MANDALAY_SHOWS: LedShow[] = [
  { name: 'MICHELOB ULTRA ARENA', sub: 'LIVE • THIS WEEKEND', color: '#7a5a1a', art: 'band' },
  { name: 'HOUSE OF BLUES', sub: 'GOSPEL BRUNCH • SUNDAYS', color: '#1a2a6a', art: 'singer' },
  { name: 'SHARK REEF', sub: 'AQUARIUM • OPEN DAILY', color: '#0f6a7a', art: 'cirque' },
];

/** Mandalay Bay: a gold-leaf pylon under a flared pagoda cap, MANDALAY BAY in gold on bronze; gold letters on the tower wings. */
export function mandalaySigns(b: WorldBuilder, x = -23.4, z = 650): void {
  const goldLeaf = mat(0xd4a640, 0.25, 0.9);
  const bronze = mat(0x3a2a14, 0.4, 0.6);
  const led = new LedBoard('MANDALAY BAY', ['MANDALAY BAY BEACH', 'SHARK REEF AQUARIUM', 'FOUR SEASONS • W HOTEL', 'BAYSIDE BUFFET'], ['#c9a04a', '#0f6a7a', '#d0502a', '#2a3a8a'], 256, 512).withShows(MANDALAY_SHOWS);
  const crown = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = '#2a1c0c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = goldGradient(ctx, 0, h);
    ctx.lineWidth = h * 0.04;
    ctx.strokeRect(h * 0.07, h * 0.07, w - h * 0.14, h - h * 0.14);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, 'MANDALAY', 'deco', w * 0.82, h * 0.42, 0.14);
    ctx.fillStyle = goldGradient(ctx, h * 0.12, h * 0.52);
    ctx.fillText('MANDALAY', w / 2, h * 0.33);
    fitFont(ctx, 'BAY', 'deco', w * 0.4, h * 0.32, 0.6);
    ctx.fillStyle = goldGradient(ctx, h * 0.55, h * 0.88);
    ctx.fillText('BAY', w / 2, h * 0.72);
    ctx.letterSpacing = '0px';
  };
  const { g, top } = marqueePylon(b, { w: 6.2, ledH: 8.6, ledY: 6.4, led, frame: goldLeaf, trim: bronze, legs: 'slab', crownH: 3.2, crownW: 7.2, crown });
  // flared pagoda cap
  const cap = new THREE.ConeGeometry(5.6, 1.8, 4, 1, true);
  cap.rotateY(Math.PI / 4);
  cap.scale(1, 1, 0.32);
  g.add(part(cap, goldLeaf, 0, top + 0.9, 0));
  g.add(part(new THREE.ConeGeometry(0.35, 2.6, 8), goldLeaf, 0, top + 2.6, 0));
  g.add(part(new THREE.SphereGeometry(0.3, 10, 8), goldLeaf, 0, top + 1.6, 0));
  place(b, g, x, z, 0, [4.6, 1.2], top + 2);
  driveLed(b, led, x, 10, z);
}

/** Gold MANDALAY BAY letters for a tower wing (faces +z). */
export function mandalayTowerLetters(b: WorldBuilder): THREE.Object3D {
  return letters(b, 'MANDALAY BAY', 10, 1.9, { style: 'deco', fill: 'gold', edge: '#3a2608', spacing: 0.1 });
}

// ====================================================================== Resorts World
/** The Resorts World mark: a red lotus over the white wordmark, on a black cabinet (two-sided crown for the pylon). */
function resortsWorldCrown(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#0c0c0e';
  ctx.fillRect(0, 0, w, h);
  // lotus
  const cx = w / 2;
  const cy = h * 0.3;
  const r = h * 0.2;
  ctx.fillStyle = '#e0102a';
  for (let i = -2; i <= 2; i++) {
    ctx.save();
    ctx.translate(cx, cy + r * 0.8);
    ctx.rotate(i * 0.42);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.8, r * 0.32, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  fitFont(ctx, 'RESORTS', 'thin', w * 0.84, h * 0.2, 0.25);
  ctx.fillText('RESORTS', cx, h * 0.66);
  fitFont(ctx, 'WORLD', 'thin', w * 0.6, h * 0.2, 0.45);
  ctx.fillText('WORLD', cx, h * 0.86);
  ctx.letterSpacing = '0px';
}

/** Crown + red bands for the existing Resorts World LED pylon (faces ±x, board 7 wide at x, z). */
export function resortsWorldPylonCrown(b: WorldBuilder, x: number, z: number, topY: number, w: number): void {
  const g = new THREE.Group();
  g.add(part(box(w + 0.6, 4.4, 1.4), mat(0x0c0c0e, 0.4, 0.4), 0, 2.2, 0));
  g.add(placed(letterFace(b, w + 0.4, 4.2, resortsWorldCrown, 1.4), 0, 2.2, 0));
  g.add(placed(neonFace(b, w + 0.4, 0.3, (ctx, pw, ph) => {
    const p = new Path2D();
    p.moveTo(ph, ph / 2);
    p.lineTo(pw - ph, ph / 2);
    neonStroke(ctx, p, '#ff2a3a', ph * 0.3);
  }, 1.4), 0, -0.1, 0));
  b.add(g, x, topY, z, Math.PI / 2);
}

/** Resorts World tower lettering: thin white caps with the red lotus (faces +z). */
export function resortsWorldTowerSign(b: WorldBuilder, w: number, h: number): THREE.Object3D {
  return letterFace(b, w, h, (ctx, pw, ph) => {
    const r = ph * 0.38;
    ctx.fillStyle = '#e0102a';
    for (let i = -2; i <= 2; i++) {
      ctx.save();
      ctx.translate(r * 1.3, ph * 0.5 + r * 0.6);
      ctx.rotate(i * 0.42);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.8, r * 0.3, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, 'RESORTS WORLD', 'thin', pw - r * 3.2, ph * 0.7, 0.14);
    ctx.fillText('RESORTS WORLD', r * 2.6 + (pw - r * 2.6) / 2, ph * 0.54);
    ctx.letterSpacing = '0px';
  });
}

// ====================================================================== Fontainebleau
function bowtie(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - s, cy - s * 0.6);
  ctx.lineTo(cx - s, cy + s * 0.6);
  ctx.closePath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + s, cy - s * 0.6);
  ctx.lineTo(cx + s, cy + s * 0.6);
  ctx.closePath();
  ctx.fill();
}

/** Fontainebleau: thin white Didone caps with the bowtie mark (tower crown and the porte-cochère). Faces +z. */
export function fontainebleauSign(b: WorldBuilder, w: number, h: number, sub?: string, bg?: number): THREE.Object3D {
  const g = new THREE.Group();
  if (bg !== undefined) g.add(part(box(w, h, 0.3), mat(bg, 0.4, 0.3), 0, 0, 0));
  const face = letterFace(b, w - 0.1, h - 0.1, (ctx, pw, ph) => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    bowtie(ctx, pw / 2, ph * (sub ? 0.18 : 0.2), ph * 0.12, '#ffffff');
    fitFont(ctx, 'FONTAINEBLEAU', 'deco', pw * 0.92, ph * (sub ? 0.36 : 0.46), 0.16);
    ctx.font = ctx.font.replace('bold ', '');
    ctx.fillStyle = '#ffffff';
    ctx.fillText('FONTAINEBLEAU', pw / 2, ph * (sub ? 0.55 : 0.64));
    if (sub) {
      fitFont(ctx, sub, 'thin', pw * 0.4, ph * 0.13, 0.6);
      ctx.fillStyle = '#cfe6ff';
      ctx.fillText(sub, pw / 2, ph * 0.84);
    }
    ctx.letterSpacing = '0px';
  });
  face.position.z = bg !== undefined ? 0.162 : 0;
  g.add(face);
  return g;
}

// ====================================================================== Peppermill
/** Peppermill's 1970s pole sign: magenta script on a violet cabinet, a chasing bulb frame, and the two-line neon under-panel. */
export function peppermillSign(b: WorldBuilder): THREE.Group {
  const g = new THREE.Group();
  g.add(neonPanel(b, 'Peppermill', 6.8, 2.0, { style: 'script', color: '#ff5ad8', fill: '#ff9ae8', bg: 0x2a0a3a, depth: 0.5, size: 0.9, two: true }));
  g.add(bulbRect(6.8, 2.0, 0.5, 0.14, true, 0.3, 0.16));
  const sub = new THREE.Group();
  sub.add(part(box(6.0, 1.0, 0.4), mat(0x1c0630, 0.6), 0, 0, 0));
  sub.add(neonFace(b, 5.9, 0.95, (ctx, pw, ph) => {
    paintNeonText(ctx, pw / 2, ph * 0.3, 'RESTAURANT', 'sans', ph * 0.3, '#7ad8ff', 0.2);
    paintNeonText(ctx, pw / 2, ph * 0.74, 'FIRESIDE LOUNGE', 'sans', ph * 0.28, '#ffb35a', 0.15);
  }, 0.4));
  g.add(placed(sub, 0, -1.65, 0));
  return g;
}

// ====================================================================== North backdrop (Sahara, The STRAT)
/** SAHARA in sand-gold Didone caps over LAS VEGAS (the 2019 identity), on a dark cabinet. Faces +z. */
export function saharaSign(b: WorldBuilder, w: number, h: number, withSub: boolean): THREE.Object3D {
  const g = new THREE.Group();
  g.add(part(box(w, h, 0.4), mat(0x1a120a, 0.6), 0, 0, 0));
  const face = letterFace(b, w - 0.1, h - 0.1, (ctx, pw, ph) => {
    ctx.fillStyle = '#1a120a';
    ctx.fillRect(0, 0, pw, ph);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, 'SAHARA', 'deco', pw * 0.86, ph * (withSub ? 0.52 : 0.7), 0.22);
    ctx.fillStyle = goldGradient(ctx, ph * 0.1, ph * 0.7, 'bronze');
    ctx.fillText('SAHARA', pw / 2, ph * (withSub ? 0.4 : 0.52));
    if (withSub) {
      fitFont(ctx, 'LAS VEGAS', 'thin', pw * 0.5, ph * 0.16, 0.7);
      ctx.fillStyle = '#ffd9a8';
      ctx.fillText('LAS VEGAS', pw / 2, ph * 0.8);
    }
    ctx.letterSpacing = '0px';
  });
  face.position.z = 0.212;
  g.add(face);
  return g;
}

/** THE STRAT in red block letters with a white tube core. Faces +z. */
export function stratSign(b: WorldBuilder, w: number, h: number, bg?: number): THREE.Group {
  return neonPanel(b, 'THE STRAT', w, h, { style: 'block', color: '#ff2a44', fill: '#e8102c', bg, depth: 0.3, spacing: 0.06, size: 0.66 });
}

// ====================================================================== Street level
/**
 * RTC Deuce stop flag: black and metallic-gold DEUCE header, the blue RTC band, the stop name and the
 * double-decker pictogram, two-sided on a pole. Origin at the foot of the pole.
 */
export function deuceStopSign(b: WorldBuilder, stopName: string): THREE.Group {
  const g = new THREE.Group();
  const pole = mat(0x8c9196, 0.4, 0.7);
  g.add(part(cyl(0.05, 3.4, 8), pole, 0, 1.7, 0));
  g.add(part(box(0.86, 1.32, 0.05), mat(0x111111, 0.5, 0.3), 0, 2.75, 0));
  g.add(placed(letterFace(b, 0.8, 1.26, (ctx, w, h) => {
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = goldGradient(ctx, 0, h * 0.3);
    fitFont(ctx, 'DEUCE', 'block', w * 0.86, h * 0.17, 0.04);
    ctx.fillText('DEUCE', w / 2, h * 0.13);
    fitFont(ctx, 'ON THE STRIP', 'sans', w * 0.8, h * 0.06, 0.12);
    ctx.fillStyle = '#ffd36a';
    ctx.fillText('ON THE STRIP', w / 2, h * 0.255);
    ctx.fillStyle = '#1d4f9c';
    ctx.fillRect(0, h * 0.31, w, h * 0.13);
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, 'RTC  BUS STOP', 'sans', w * 0.86, h * 0.08, 0.06);
    ctx.fillText('RTC  BUS STOP', w / 2, h * 0.375);
    // bus pictogram
    ctx.fillStyle = '#c8a34a';
    const bx = w * 0.18;
    const by = h * 0.48;
    const bw = w * 0.64;
    const bh = h * 0.2;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, h * 0.02);
    ctx.fill();
    ctx.fillStyle = '#111111';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(bx + bw * (0.06 + i * 0.18), by + bh * 0.12, bw * 0.13, bh * 0.28);
      ctx.fillRect(bx + bw * (0.06 + i * 0.18), by + bh * 0.52, bw * 0.13, bh * 0.22);
    }
    ctx.beginPath();
    ctx.arc(bx + bw * 0.22, by + bh, bh * 0.16, 0, Math.PI * 2);
    ctx.arc(bx + bw * 0.78, by + bh, bh * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, stopName, 'sans', w * 0.88, h * 0.075, 0.02);
    ctx.fillText(stopName, w / 2, h * 0.8);
    ctx.fillStyle = '#ffd36a';
    fitFont(ctx, '24 HRS • EVERY 15 MIN', 'sans', w * 0.8, h * 0.05, 0.05);
    ctx.fillText('24 HRS • EVERY 15 MIN', w / 2, h * 0.92);
    ctx.letterSpacing = '0px';
  }, 0.05), 0, 2.75, 0));
  return g;
}

/**
 * Clark County mast-arm street-name blade: internally lit, white mixed-case on green with a thin white
 * border (two-sided). `w` long; origin at its centre; faces ±z.
 */
export function streetBlade(b: WorldBuilder, name: string, w = 2.8): THREE.Group {
  const g = new THREE.Group();
  const h = 0.52;
  g.add(part(box(w + 0.06, h + 0.06, 0.12), mat(0x2a2d32, 0.5, 0.5), 0, 0, 0));
  g.add(placed(letterFace(b, w, h, (ctx, pw, ph) => {
    ctx.fillStyle = '#0d6b3c';
    ctx.fillRect(0, 0, pw, ph);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, ph * 0.05);
    ctx.beginPath();
    ctx.roundRect(ph * 0.07, ph * 0.07, pw - ph * 0.14, ph - ph * 0.14, ph * 0.08);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, name, 'road', pw * 0.88, ph * 0.66, 0.03);
    ctx.fillText(name, pw / 2, ph * 0.54);
    ctx.letterSpacing = '0px';
  }, 0.12), 0, 0, 0));
  return g;
}

/** Skybridge fascia: an illuminated band with the street it crosses and the resorts it links. Faces +z. */
export function bridgeFascia(b: WorldBuilder, street: string, label: string, accent: string, w = 10, h = 1.3): THREE.Object3D {
  return letterFace(b, w, h, (ctx, pw, ph) => {
    ctx.fillStyle = '#0c1016';
    ctx.fillRect(0, 0, pw, ph);
    ctx.fillStyle = accent;
    ctx.fillRect(0, ph * 0.9, pw, ph * 0.1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, street, 'road', pw * 0.8, ph * 0.46, 0.12);
    ctx.fillText(street, pw / 2, ph * 0.33);
    ctx.fillStyle = mixWhite(accent, 0.35);
    fitFont(ctx, label, 'sans', pw * 0.9, ph * 0.22, 0.08);
    ctx.fillText(label, pw / 2, ph * 0.7);
    ctx.letterSpacing = '0px';
  });
}
