import * as THREE from 'three';
import { bakeGroup } from '../meshBake';
import type { WorldBuilder } from './builder';
import { car, mat } from './props';
import type { CarKind } from './props';
import { L1, L2, Merger, ground, v3 } from './southKit';

/**
 * The real east-side frontage of the south Strip, Welcome sign → Mandalay Bay Rd (Nov 2026), on canvas, all in one
 * texture atlas so the whole row costs a draw call or two:
 * - Las Vegas Harley-Davidson's bar-and-shield pole sign across from the Welcome sign (ex-Klondike site).
 * - The Pinball Hall of Fame (4925 LVB S, since 2021): white hangar with red PINBALL letters and its 44 ft sign —
 *   P-I-N-B-A-L-L stacked in white circles on a navy pole, the red HALL OF FAME boomerang with gold starbursts,
 *   the yellow In-N-Out-style arrow, the LED screen, and the stuffed cat that perches on top.
 * - The Little Church of the West (1942, here since 1996): cedar mining-town chapel with its steeple, opposite Russell.
 * - The closed Diamond Inn Motel (4605) and its pink elephant (out front since 1964).
 * - The Shell + Green Valley Grocery, the one-storey strip mall at 3999 (McDonald's, Subway, Panda Express,
 *   JF Bakery), the boarded-up Laughing Jackalope bar, the little motels at 3961 (Desert Oasis, Motel 8).
 * - The SkyVue "pillars": the two ~200 ft concrete columns left from the abandoned 2012 observation wheel.
 */

// ---------------------------------------------------------------- the atlas
type Painter = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  glow: boolean;
  /** Day colour, and the colour it glows at night (black = not lit). */
  fill: (day: string, night?: string) => void;
  stroke: (day: string, night?: string) => void;
};
type Slot = { mat: THREE.MeshStandardMaterial; u0: number; v0: number; u1: number; v1: number };

/** Shelf-packed canvas pages (2048 x 1024, night-glow mask at half size); a new page opens when one fills up. */
class Atlas {
  private page!: { color: HTMLCanvasElement; glow: HTMLCanvasElement; mat: THREE.MeshStandardMaterial };
  private x = 0;
  private y = 0;
  private rowH = 0;
  readonly materials: THREE.MeshStandardMaterial[] = [];
  constructor(
    private readonly W = 2048,
    private readonly H = 1024,
    private readonly glowScale = 0.5
  ) {
    this.newPage();
  }
  private newPage(): void {
    const color = document.createElement('canvas');
    color.width = this.W;
    color.height = this.H;
    const glow = document.createElement('canvas');
    glow.width = this.W * this.glowScale;
    glow.height = this.H * this.glowScale;
    const gx = glow.getContext('2d')!;
    gx.fillStyle = '#000';
    gx.fillRect(0, 0, glow.width, glow.height);
    const map = new THREE.CanvasTexture(color);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const gl = new THREE.CanvasTexture(glow);
    gl.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: gl, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.5, roughness: 0.72 });
    this.page = { color, glow, mat };
    this.materials.push(mat);
    this.x = this.y = this.rowH = 0;
  }
  /** Reserve a w×h pixel region and paint it twice (day colours, then the night glow mask). */
  slot(w: number, h: number, draw: (p: Painter) => void): Slot {
    if (this.x + w > this.W) {
      this.x = 0;
      this.y += this.rowH + 4;
      this.rowH = 0;
    }
    if (this.y + h > this.H) this.newPage();
    const sx = this.x;
    const sy = this.y;
    this.x += w + 4;
    this.rowH = Math.max(this.rowH, h);
    for (const glow of [false, true]) {
      const ctx = (glow ? this.page.glow : this.page.color).getContext('2d')!;
      ctx.save();
      if (glow) ctx.scale(this.glowScale, this.glowScale);
      ctx.translate(sx, sy);
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      const p: Painter = {
        ctx,
        w,
        h,
        glow,
        fill: (d, n) => (ctx.fillStyle = glow ? (n ?? '#000') : d),
        stroke: (d, n) => (ctx.strokeStyle = glow ? (n ?? '#000') : d),
      };
      draw(p);
      ctx.restore();
    }
    return { mat: this.page.mat, u0: sx / this.W, u1: (sx + w) / this.W, v0: 1 - (sy + h) / this.H, v1: 1 - sy / this.H };
  }
  /** A w×h plane showing a slot (faces +z before rotY). */
  plane(s: Slot, w: number, h: number): THREE.PlaneGeometry {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, s.u0 + uv.getX(i) * (s.u1 - s.u0), s.v0 + uv.getY(i) * (s.v1 - s.v0));
    return g;
  }
}

/** Common painting bits. */
function text(p: Painter, s: string, x: number, y: number, font: string, day: string, night?: string, maxW?: number, align: CanvasTextAlign = 'center'): void {
  p.ctx.font = font;
  p.ctx.textAlign = align;
  p.ctx.textBaseline = 'middle';
  p.fill(day, night);
  p.ctx.fillText(s, x, y, maxW);
}
function rect(p: Painter, x: number, y: number, w: number, h: number, day: string, night?: string): void {
  p.fill(day, night);
  p.ctx.fillRect(x, y, w, h);
}
function stucco(p: Painter, base: string): void {
  rect(p, 0, 0, p.w, p.h, base);
  if (p.glow) return;
  for (let i = 0; i < 260; i++) {
    p.ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)';
    p.ctx.fillRect((i * 97) % p.w, (i * 53) % p.h, 6, 4);
  }
}
/** Shop window with mullions; lit warm at night when `open`. */
function shopWindow(p: Painter, x: number, y: number, w: number, h: number, open = true): void {
  rect(p, x - 3, y - 3, w + 6, h + 6, '#2a2c30');
  const g = p.ctx.createLinearGradient(0, y, 0, y + h);
  if (!p.glow) {
    g.addColorStop(0, '#5d7286');
    g.addColorStop(1, '#2b3846');
    p.ctx.fillStyle = g;
  } else p.fill('', open ? '#c9a878' : '#000');
  p.ctx.fillRect(x, y, w, h);
  for (let k = 1; k < 3; k++) rect(p, x + (w * k) / 3 - 2, y, 4, h, '#2a2c30', '#000');
}
function boarded(p: Painter, x: number, y: number, w: number, h: number): void {
  rect(p, x, y, w, h, '#b99a6a');
  if (p.glow) return;
  for (let k = 0; k < w; k += 18) rect(p, x + k, y, 2, h, '#8a6a42');
  p.ctx.strokeStyle = '#7a5a36';
  p.ctx.lineWidth = 5;
  p.ctx.beginPath();
  p.ctx.moveTo(x, y);
  p.ctx.lineTo(x + w, y + h);
  p.ctx.stroke();
}
function starburst(p: Painter, x: number, y: number, r: number, day: string, night: string): void {
  p.fill(day, night);
  p.ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? r * 0.25 : i % 4 ? r * 0.7 : r;
    p.ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  p.ctx.closePath();
  p.ctx.fill();
}

// ---------------------------------------------------------------- builders
export function buildSouthFronts(b: WorldBuilder): void {
  const atlas = new Atlas();
  const mg = new Merger();
  const face = (s: Slot, w: number, h: number, x: number, y: number, z: number, ry: number) => mg.at(s.mat, atlas.plane(s, w, h), x, y, z, ry);
  /** West-facing facade on an east-side building whose street face is at x. */
  const westFace = (s: Slot, w: number, h: number, x: number, y: number, z: number) => face(s, w, h, x - 0.03, y, z, -Math.PI / 2);
  /** A sign seen from both directions along the Boulevard (faces ±z). */
  const twoSided = (s: Slot, w: number, h: number, x: number, y: number, z: number) => {
    face(s, w, h, x, y, z + 0.06, 0);
    face(s, w, h, x, y, z - 0.06, Math.PI);
  };
  const steel = mat(0x5a5e66, 0.5, 0.6);

  harleySign(b, atlas, mg, twoSided, steel);
  pinballHall(b, atlas, mg, westFace, twoSided);
  littleChurch(b, atlas, mg, westFace, twoSided);
  diamondInn(b, atlas, mg, westFace, twoSided, steel);
  stationAndMall(b, atlas, mg, westFace, twoSided, steel);
  skyVue(b, mg);
  dreamSite(b, atlas, mg);
  shoppers(b);
  for (const m of atlas.materials) b.nightGlow(m, 0.0, 1.0);
  mg.flush(b);
}

type FaceFn = (s: Slot, w: number, h: number, x: number, y: number, z: number) => void;

/** Las Vegas Harley-Davidson's tall pole sign at the curb across from the Welcome sign. */
function harleySign(b: WorldBuilder, atlas: Atlas, mg: Merger, twoSided: FaceFn, steel: THREE.Material): void {
  const s = atlas.slot(420, 440, (p) => {
    const { ctx, w } = p;
    // bar-and-shield: an orange-edged black shield with the white bar across it
    const shield = () => {
      ctx.beginPath();
      ctx.moveTo(30, 60);
      ctx.quadraticCurveTo(w / 2, 0, w - 30, 60);
      ctx.lineTo(w - 50, 260);
      ctx.quadraticCurveTo(w - 70, 360, w / 2, 430);
      ctx.quadraticCurveTo(70, 360, 50, 260);
      ctx.closePath();
    };
    shield();
    p.fill('#f2f2ee', '#c8c8c8');
    ctx.fill();
    ctx.save();
    ctx.translate(w / 2, 230);
    ctx.scale(0.9, 0.9);
    ctx.translate(-w / 2, -230);
    shield();
    p.fill('#111114', '#000');
    ctx.fill();
    ctx.restore();
    p.stroke('#e8701e', '#ff7a1e');
    ctx.lineWidth = 10;
    ctx.save();
    ctx.translate(w / 2, 230);
    ctx.scale(0.82, 0.82);
    ctx.translate(-w / 2, -230);
    shield();
    ctx.stroke();
    ctx.restore();
    text(p, 'MOTOR', w / 2, 120, 'bold 46px Georgia, serif', '#e8701e', '#ff8a2a');
    rect(p, 6, 170, w - 12, 84, '#f2f2ee', '#d8d8d8');
    rect(p, 14, 178, w - 28, 68, '#111114');
    text(p, 'HARLEY-DAVIDSON', w / 2, 212, 'bold 46px Arial, sans-serif', '#f2f2ee', '#ffffff', w - 50);
    text(p, 'CYCLES', w / 2, 300, 'bold 46px Georgia, serif', '#e8701e', '#ff8a2a');
    text(p, 'LAS VEGAS', w / 2, 362, 'bold 30px Arial, sans-serif', '#f2f2ee', '#e0e0e0');
  });
  const x = 20.25;
  const z = 885.5;
  mg.beam(steel, v3(x, 0, z), v3(x, 9.6, z), 0.28, 10, 0.24, true);
  twoSided(s, 3.8, 3.98, x, 11.3, z);
  // the arrow board under it pointing at the store
  const a = atlas.slot(360, 110, (p) => {
    rect(p, 0, 0, p.w, p.h, '#111114');
    rect(p, 6, 6, p.w - 12, p.h - 12, '#e8701e', '#ff7a1e');
    text(p, 'MOTORCLOTHES • RENTALS  ▶', p.w / 2, p.h / 2, 'bold 30px Arial, sans-serif', '#111114', '#000', p.w - 30);
  });
  twoSided(a, 3.1, 0.95, x, 8.6, z);
  b.collider(x - 0.35, x + 0.35, z - 0.35, z + 0.35, 0, 9.6, true);
  b.zone('Las Vegas Harley-Davidson', 19, 21.2, 880, 891);
}

/** Pinball Hall of Fame: white hangar with red PINBALL letters, and the 44 ft roadside sign. */
function pinballHall(b: WorldBuilder, atlas: Atlas, mg: Merger, westFace: FaceFn, twoSided: FaceFn): void {
  const pz = 838.4;
  const front = atlas.slot(1000, 300, (p) => {
    stucco(p, '#f1efe8');
    rect(p, 0, 0, p.w, 22, '#c8202a', '#ff3a3a');
    // big red channel letters across the top of the hangar
    const { ctx } = p;
    ctx.font = 'bold 132px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!p.glow) {
      ctx.fillStyle = '#7a0f16';
      ctx.fillText('PINBALL', p.w / 2 + 5, 110 + 5, 640);
    }
    p.fill('#d6202c', '#ff3030');
    ctx.fillText('PINBALL', p.w / 2, 110, 640);
    text(p, 'HALL OF FAME  •  MUSEUM  •  ARCADE', p.w / 2, 192, 'bold 26px Arial, sans-serif', '#2a3a6a', '#9ab8ff');
    // glass doors + windows
    shopWindow(p, 360, 218, 280, 82);
    shopWindow(p, 70, 228, 220, 60);
    shopWindow(p, 710, 228, 220, 60);
    rect(p, 380, 210, 240, 6, '#2a2c30');
  });
  westFace(front, 17, 7.4, 39.9, 3.7, pz);

  // The roadside sign (by High Impact Sign & Design): faces up and down the Boulevard
  const sign = atlas.slot(620, 900, (p) => {
    const { ctx } = p;
    // yellow arrow, red-edged, sweeping from the left and pointing right
    ctx.beginPath();
    ctx.moveTo(40, 300);
    ctx.quadraticCurveTo(40, 470, 300, 500);
    ctx.lineTo(520, 500);
    ctx.lineTo(520, 450);
    ctx.lineTo(610, 540);
    ctx.lineTo(520, 630);
    ctx.lineTo(520, 580);
    ctx.lineTo(290, 580);
    ctx.quadraticCurveTo(-20, 560, 0, 290);
    ctx.closePath();
    p.fill('#c8202a', '#ff3020');
    ctx.fill();
    ctx.save();
    ctx.translate(14, 8);
    ctx.scale(0.95, 0.97);
    ctx.beginPath();
    ctx.moveTo(48, 310);
    ctx.quadraticCurveTo(52, 480, 300, 505);
    ctx.lineTo(515, 505);
    ctx.lineTo(515, 470);
    ctx.lineTo(585, 540);
    ctx.lineTo(515, 610);
    ctx.lineTo(515, 575);
    ctx.lineTo(292, 575);
    ctx.quadraticCurveTo(6, 552, 14, 300);
    ctx.closePath();
    p.fill('#ffd21e', '#ffd84a');
    ctx.fill();
    ctx.restore();
    if (!p.glow) for (let x = 120; x < 520; x += 14) rect(p, x, 512, 3, 58, 'rgba(200,120,0,0.35)');
    // HALL OF FAME boomerang panel
    ctx.beginPath();
    ctx.moveTo(150, 120);
    ctx.quadraticCurveTo(360, 70, 560, 110);
    ctx.quadraticCurveTo(600, 230, 560, 350);
    ctx.quadraticCurveTo(360, 330, 170, 390);
    ctx.quadraticCurveTo(110, 260, 150, 120);
    ctx.closePath();
    p.fill('#d6232a', '#ff2a2a');
    ctx.fill();
    ctx.lineWidth = 12;
    p.stroke('#8a1016', '#ff8a60');
    ctx.stroke();
    text(p, 'HALL OF', 370, 175, 'bold 84px "Arial Black", Arial, sans-serif', '#ffffff', '#ffffff', 360);
    text(p, 'FAME', 370, 280, 'bold 104px "Arial Black", Arial, sans-serif', '#ffffff', '#ffffff', 340);
    for (const [x, y, r] of [
      [165, 120, 44],
      [560, 100, 50],
      [575, 355, 36],
      [330, 60, 34],
    ]) starburst(p, x, y, r, '#f2c230', '#ffe060');
    // LED screen in a red frame
    rect(p, 250, 640, 330, 220, '#c8202a', '#ff3020');
    const g = ctx.createLinearGradient(0, 660, 0, 840);
    if (!p.glow) {
      g.addColorStop(0, '#103a8a');
      g.addColorStop(1, '#0a1a40');
      ctx.fillStyle = g;
    } else p.fill('', '#4a6ad8');
    ctx.fillRect(266, 656, 298, 188);
    text(p, 'FREE ADMISSION', 415, 715, 'bold 34px Arial, sans-serif', '#ffd21e', '#ffe060', 280);
    text(p, 'PLAY THE CLASSICS', 415, 780, 'bold 30px Arial, sans-serif', '#ff5a5a', '#ff8080', 280);
    // P-I-N-B-A-L-L stacked in white circles down the pole
    'PINBALL'.split('').forEach((ch, i) => {
      const cy = 70 + i * 112;
      ctx.beginPath();
      ctx.arc(70, cy, 54, 0, Math.PI * 2);
      p.fill('#2a4aa0', '#6a8aff');
      ctx.fill();
      ctx.beginPath();
      ctx.arc(70, cy, 45, 0, Math.PI * 2);
      p.fill('#f4f6fa', '#e8ecff');
      ctx.fill();
      text(p, ch, 70, cy + 3, 'bold 64px Arial, sans-serif', '#2a4a9a', '#203070');
    });
  });
  const sx = 24.4;
  const sz = 827.4;
  const W = 8.3;
  const H = 12.0;
  const navy = mat(0x22346a, 0.5, 0.4);
  mg.beam(navy, v3(sx - W / 2 + 0.95, 0, sz), v3(sx - W / 2 + 0.95, H + 1.6, sz), 0.42, 12, 0.42, true);
  mg.box(mat(0x9a968c, 0.9), sx - W / 2 + 0.95, 0.2, sz, 1.6, 0.4, 1.6);
  // the circle column is mounted on the face of the pole; the panels and arrow hang off its side
  const cut = 140 / 620;
  const col: Slot = { ...sign, u1: sign.u0 + (sign.u1 - sign.u0) * cut };
  const rest: Slot = { ...sign, u0: col.u1 };
  const yC = 1.6 + H / 2;
  for (const [sl, w0, w1, dz] of [
    [col, 0, cut, 0.48],
    [rest, cut, 1, 0.06],
  ] as const) {
    const w = (w1 - w0) * W;
    const x = sx - W / 2 + (w0 + w1) / 2 * W;
    mg.at(sl.mat, atlas.plane(sl, w, H), x, yC, sz + dz, 0);
    mg.at(sl.mat, atlas.plane(sl, w, H), x, yC, sz - dz, Math.PI);
  }
  void twoSided;
  b.collider(sx - W / 2 + 0.5, sx - W / 2 + 1.4, sz - 0.45, sz + 0.45, 0, H + 1.6, true);
  // the stuffed cat that perches on the sign
  const fur = mat(0x6b5236, 0.9);
  const cx = sx + 0.6;
  const cy = 1.6 + H - 0.4;
  mg.add(new THREE.SphereGeometry(0.42, 12, 8).scale(1.25, 0.9, 0.8).translate(cx, cy + 0.38, sz), fur);
  mg.add(new THREE.SphereGeometry(0.3, 12, 8).translate(cx + 0.55, cy + 0.85, sz), fur);
  for (const s of [-1, 1]) mg.add(new THREE.ConeGeometry(0.1, 0.2, 4).translate(cx + 0.55, cy + 1.18, sz + s * 0.15), fur);
  mg.beam(fur, v3(cx - 0.45, cy + 0.3, sz), v3(cx - 0.75, cy - 0.35, sz + 0.1), 0.07, 5);
  b.zone('Pinball Hall of Fame Sign', 19, 30, sz - 2, sz + 2);
}

/** Little Church of the West, opposite the Russell Rd T. */
function littleChurch(b: WorldBuilder, atlas: Atlas, mg: Merger, westFace: FaceFn, twoSided: FaceFn): void {
  const x0 = 44;
  const x1 = 56;
  const z0 = 820.0;
  const z1 = 825.6;
  const zc = (z0 + z1) / 2;
  const wallH = 3.2;
  const cedar = mat(0x7a4e2c, 0.9);
  const shingle = mat(0x4a3e36, 0.95);
  const trim = mat(0xf2eee4, 0.7);
  ground(b, 40.5, 60, 819.2, 826.2, 0x8a7a5a, L1, 0.95);
  b.box((x0 + x1) / 2, 0, zc, x1 - x0, wallH, z1 - z0, cedar, true);
  // steep gabled roof (ridge along x)
  const half = (z1 - z0) / 2 + 0.35;
  const rise = 2.6;
  const slope = Math.hypot(half, rise);
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(x1 - x0 + 0.6, 0.16, slope);
    g.rotateX(s * Math.atan2(rise, half));
    mg.at(shingle, g, (x0 + x1) / 2, wallH + rise / 2, zc + (s * half) / 2, 0, true);
  }
  // gable ends
  for (const gx of [x0 - 0.01, x1 + 0.01]) {
    const tri = new THREE.Shape([new THREE.Vector2(-half + 0.35, 0), new THREE.Vector2(half - 0.35, 0), new THREE.Vector2(0, rise - 0.1)]);
    const g = new THREE.ShapeGeometry(tri);
    g.rotateY(gx < x0 + 1 ? -Math.PI / 2 : Math.PI / 2);
    mg.at(cedar, g, gx, wallH, zc);
  }
  // board-and-batten front with the double doors, a rose window and the sign
  const front = atlas.slot(360, 220, (p) => {
    rect(p, 0, 0, p.w, p.h, '#7a4e2c');
    if (!p.glow) for (let x = 0; x < p.w; x += 16) rect(p, x, 0, 4, p.h, '#5e3a1e');
    rect(p, 140, 90, 80, 130, '#f2eee4');
    rect(p, 148, 98, 30, 122, '#4a2a14', '#a06030');
    rect(p, 182, 98, 30, 122, '#4a2a14', '#a06030');
    for (const wx of [40, 270]) {
      rect(p, wx, 70, 50, 90, '#f2eee4');
      rect(p, wx + 6, 76, 38, 78, '#c8a050', '#ffcf80');
    }
    rect(p, 100, 18, 160, 40, '#f2eee4');
    text(p, 'LITTLE CHURCH OF THE WEST', 180, 38, 'bold 15px Georgia, serif', '#3a2414', '#ffe0a0', 150);
  });
  westFace(front, z1 - z0, wallH, x0, wallH / 2, zc);
  // the steeple over the entrance: a square belfry and a shingled spire with a cross
  const tx = x0 + 1.2;
  mg.box(cedar, tx, wallH + rise + 0.9, zc, 1.5, 1.8, 1.5, 0, true);
  mg.box(trim, tx, wallH + rise + 1.85, zc, 1.7, 0.12, 1.7);
  for (const s of [-1, 1]) mg.box(mat(0x2a1a0e, 0.9), tx - 0.76, wallH + rise + 1.0, zc + s * 0.35, 0.02, 0.9, 0.28);
  mg.at(shingle, new THREE.ConeGeometry(1.08, 3.2, 4).rotateY(Math.PI / 4), tx, wallH + rise + 3.5, zc, 0, true);
  mg.box(trim, tx, wallH + rise + 5.45, zc, 0.08, 0.8, 0.08);
  mg.box(trim, tx, wallH + rise + 5.6, zc, 0.08, 0.08, 0.45);
  b.collider(tx - 0.75, tx + 0.75, zc - 0.75, zc + 0.75, wallH, wallH + rise + 1.8, true);
  // monument sign at the walk
  const m = atlas.slot(300, 120, (p) => {
    rect(p, 0, 0, p.w, p.h, '#3a2414');
    rect(p, 8, 8, p.w - 16, p.h - 16, '#f2eee4', '#e8d8b0');
    text(p, 'Little Church', p.w / 2, 42, 'italic bold 36px Georgia, serif', '#5a2a10', '#6a3010');
    text(p, 'OF THE WEST • WEDDINGS', p.w / 2, 86, 'bold 19px Georgia, serif', '#5a2a10', '#6a3010', p.w - 30);
  });
  mg.box(mat(0x8a5a3a, 0.9), 21.6, 0.35, 822.9, 0.5, 0.7, 2.6);
  face(m, 21.33);
  function face(s: Slot, x: number): void {
    mg.at(s.mat, atlas.plane(s, 2.5, 1.0), x, 1.2, 822.9, -Math.PI / 2);
    mg.at(s.mat, atlas.plane(s, 2.5, 1.0), x + 0.54, 1.2, 822.9, Math.PI / 2);
  }
  mg.box(mat(0x3a2414, 0.9), 21.6, 1.2, 822.9, 0.5, 1.1, 2.6);
  void twoSided;
  b.collider(21.3, 21.9, 821.6, 824.2, 0, 1.75, true);
  b.building((x0 + x1) / 2, zc, x1 - x0, z1 - z0, '#7a4e2c', 'Little Church of the West');
  b.zone('Little Church of the West', 40.5, 60, 819.2, 826.2);
}

/** The closed Diamond Inn Motel and its pink elephant. */
function diamondInn(b: WorldBuilder, atlas: Atlas, mg: Merger, westFace: FaceFn, twoSided: FaceFn, steel: THREE.Material): void {
  const z0 = 759;
  const z1 = 787;
  const x0 = 31;
  const x1 = 41;
  ground(b, 20, 50, z0 - 1, z1 + 1, 0x6a6a6e, L1, 0.9);
  const wall = mat(0xece4d4, 0.85);
  b.box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, 3.3, z1 - z0, wall, true);
  mg.box(mat(0x2e6a8a, 0.7), (x0 + x1) / 2 - 0.4, 3.45, (z0 + z1) / 2, x1 - x0 + 1.6, 0.3, z1 - z0 + 0.6);
  // the row of rooms: doors and boarded windows (closed since fall 2023)
  const rooms = atlas.slot(900, 110, (p) => {
    stucco(p, '#ece4d4');
    for (let i = 0; i < 10; i++) {
      const x = 14 + i * 88;
      rect(p, x, 28, 26, 82, '#2e6a8a');
      boarded(p, x + 36, 36, 44, 40);
      text(p, String(101 + i), x + 13, 18, 'bold 13px Arial, sans-serif', '#2e4a5a');
    }
  });
  westFace(rooms, z1 - z0, 3.3, x0, 1.65, (z0 + z1) / 2);
  // the tall roadside sign: a big diamond over an arrow board
  const sign = atlas.slot(400, 520, (p) => {
    const { ctx } = p;
    ctx.beginPath();
    ctx.moveTo(200, 0);
    ctx.lineTo(398, 200);
    ctx.lineTo(200, 400);
    ctx.lineTo(2, 200);
    ctx.closePath();
    p.fill('#2ea8c8', '#000');
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(200, 26);
    ctx.lineTo(372, 200);
    ctx.lineTo(200, 374);
    ctx.lineTo(28, 200);
    ctx.closePath();
    p.fill('#f4f2ea', '#000');
    ctx.fill();
    text(p, 'DIAMOND', 200, 170, 'bold 60px Georgia, serif', '#c8203a', '#000', 300);
    text(p, 'INN', 200, 235, 'bold 62px Georgia, serif', '#c8203a', '#000');
    rect(p, 40, 410, 320, 100, '#c8203a', '#000');
    text(p, 'MOTEL • CLOSED', 200, 460, 'bold 34px Arial, sans-serif', '#ffffff', '#000', 290);
  });
  mg.beam(steel, v3(21.2, 0, 766), v3(21.2, 7.2, 766), 0.16, 8);
  twoSided(sign, 3.6, 4.7, 21.2, 9.3, 766);
  b.collider(21.0, 21.4, 765.8, 766.2, 0, 7.2, true);
  // the pink elephant (since 1964), raised trunk, on a little plinth by the fence
  const pink = mat(0xf4a6c8, 0.55);
  const ex = 23.2;
  const ez = 772;
  mg.box(mat(0xd8d2c4, 0.85), ex, 0.25, ez, 2.2, 0.5, 3.4);
  b.collider(ex - 1.1, ex + 1.1, ez - 1.7, ez + 1.7, 0, 0.5);
  mg.add(new THREE.SphereGeometry(0.9, 16, 12).scale(0.85, 0.8, 1.25).translate(ex, 1.75, ez), pink, true);
  for (const [lx, lz] of [
    [-0.42, -0.62],
    [0.42, -0.62],
    [-0.42, 0.62],
    [0.42, 0.62],
  ]) mg.add(new THREE.CylinderGeometry(0.2, 0.22, 1.1, 10).translate(ex + lx, 1.05, ez + lz), pink);
  mg.add(new THREE.SphereGeometry(0.55, 14, 10).translate(ex - 0.05, 2.3, ez - 1.15), pink);
  for (const s of [-1, 1]) mg.add(new THREE.CircleGeometry(0.5, 14).scale(0.8, 1, 1).rotateY(s * 1.2).translate(ex + s * 0.48, 2.35, ez - 0.95), mat(0xf4a6c8, 0.55, 0, { side: THREE.DoubleSide }));
  mg.beam(pink, v3(ex - 0.05, 2.05, ez - 1.6), v3(ex - 0.05, 1.5, ez - 2.0), 0.16, 8, 0.12);
  mg.beam(pink, v3(ex - 0.05, 1.5, ez - 2.0), v3(ex - 0.05, 2.2, ez - 2.5), 0.12, 8, 0.08);
  for (const s of [-1, 1]) mg.beam(mat(0xfffbf0, 0.4), v3(ex + s * 0.22, 2.0, ez - 1.55), v3(ex + s * 0.25, 1.75, ez - 1.95), 0.05, 5, 0.01);
  mg.beam(pink, v3(ex, 1.9, ez + 1.1), v3(ex, 1.3, ez + 1.35), 0.04, 4);
  for (const s of [-1, 1]) mg.add(new THREE.SphereGeometry(0.06, 6, 4).translate(ex + s * 0.25, 2.5, ez - 1.6), mat(0x1a1a1a, 0.4));
  b.collider(ex - 0.8, ex + 0.8, ez - 1.3, ez + 1.3, 0.5, 2.6, true);
  b.building((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, '#ece4d4', 'Diamond Inn (closed)');
  b.zone('Diamond Inn Motel (closed)', 20, 50, z0 - 1, z1 + 1);
  b.zone('Pink Elephant', ex - 1.6, ex + 1.6, ez - 2.4, ez + 2);
  b.pickup(ex + 0.9, 0.62, ez + 1.2, 2, 'Pink Elephant Pack', false);
}

/** Shell + Green Valley Grocery, the strip mall at 3999 LVB S, the Laughing Jackalope, the little motels at 3961. */
function stationAndMall(b: WorldBuilder, atlas: Atlas, mg: Merger, westFace: FaceFn, twoSided: FaceFn, steel: THREE.Material): void {
  const asphalt = 0x3a3a3f;
  // ---- Shell station: canopy over four pumps, the grocery behind
  ground(b, 19.6, 48, 702.5, 723, asphalt, L1, 0.85);
  const cz = 712.5;
  const canopyMat = mat(0xf4f2ec, 0.6);
  mg.box(canopyMat, 28.5, 4.9, cz, 9, 0.8, 13, 0, true);
  const band = atlas.slot(520, 48, (p) => {
    rect(p, 0, 0, p.w, p.h, '#f2c200', '#ffd21e');
    rect(p, 0, p.h - 10, p.w, 10, '#d6202c', '#ff3030');
  });
  westFace(band, 13, 0.8, 24.0, 4.9, cz);
  const lightM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.1 });
  b.nightGlow(lightM, 0.1, 1.3);
  for (const lz of [cz - 4.5, cz - 1.5, cz + 1.5, cz + 4.5]) for (const lx of [26, 31]) mg.box(lightM, lx, 4.48, lz, 1.2, 0.04, 0.6);
  for (const pz of [cz - 3.2, cz + 3.2]) {
    for (const px of [26.5, 30.5]) {
      mg.box(mat(0xd8d8d4, 0.6), px, 0.12, pz, 1.2, 0.24, 2.6);
      mg.box(mat(0xf2f2ee, 0.5), px, 1.0, pz, 0.6, 1.6, 0.9);
      mg.box(mat(0xd6202c, 0.5), px, 1.55, pz, 0.62, 0.3, 0.92);
      b.collider(px - 0.35, px + 0.35, pz - 0.5, pz + 0.5, 0, 1.8, true);
    }
    mg.add(new THREE.CylinderGeometry(0.22, 0.22, 4.5, 8).translate(28.5, 2.25, pz), canopyMat);
  }
  const groc = atlas.slot(700, 200, (p) => {
    stucco(p, '#e8e0cc');
    rect(p, 0, 0, p.w, 46, '#1e6a3a', '#000');
    text(p, 'GREEN VALLEY GROCERY', p.w / 2, 24, 'bold 34px Arial, sans-serif', '#ffffff', '#ffffff', p.w - 40);
    shopWindow(p, 30, 70, 260, 110);
    shopWindow(p, 410, 70, 260, 110);
    rect(p, 305, 66, 90, 134, '#2a2c30');
    rect(p, 312, 72, 76, 128, '#7a9ab0', '#c9b088');
    text(p, 'ICE • BEER • SNACKS • ATM', p.w / 2, 190, 'bold 15px Arial, sans-serif', '#1e6a3a');
  });
  b.box(42.5, 0, cz, 9, 4.2, 14, mat(0xe8e0cc, 0.85), true);
  westFace(groc, 14, 4.0, 38.0, 2.0, cz);
  const shell = atlas.slot(300, 420, (p) => {
    const { ctx } = p;
    rect(p, 0, 250, p.w, 170, '#1a1a1e');
    // the scallop: red outline, yellow fill, ribs fanning from the hinge
    ctx.beginPath();
    ctx.moveTo(150, 236);
    ctx.lineTo(70, 210);
    ctx.bezierCurveTo(10, 140, 40, 20, 150, 14);
    ctx.bezierCurveTo(260, 20, 290, 140, 230, 210);
    ctx.closePath();
    p.fill('#d6202c', '#ff2a2a');
    ctx.fill();
    ctx.save();
    ctx.translate(150, 130);
    ctx.scale(0.84, 0.84);
    ctx.translate(-150, -130);
    ctx.fill();
    p.fill('#ffd200', '#ffe040');
    ctx.fill();
    ctx.restore();
    p.stroke('#d6202c', '#ff2a2a');
    ctx.lineWidth = 7;
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath();
      ctx.moveTo(150, 222);
      ctx.lineTo(150 + k * 30, 40 + Math.abs(k) * 14);
      ctx.stroke();
    }
    text(p, 'REGULAR', 90, 290, 'bold 22px Arial, sans-serif', '#ffffff', '#ffffff');
    text(p, '4.59', 220, 290, 'bold 40px Arial, sans-serif', '#ff3a3a', '#ff4040');
    text(p, 'PREMIUM', 90, 345, 'bold 22px Arial, sans-serif', '#ffffff', '#ffffff');
    text(p, '5.29', 220, 345, 'bold 40px Arial, sans-serif', '#ff3a3a', '#ff4040');
    text(p, 'DIESEL', 90, 395, 'bold 22px Arial, sans-serif', '#ffffff', '#ffffff');
    text(p, '5.09', 220, 395, 'bold 40px Arial, sans-serif', '#ff3a3a', '#ff4040');
  });
  mg.beam(steel, v3(21.0, 0, 704.2), v3(21.0, 4.2, 704.2), 0.18, 8);
  twoSided(shell, 2.6, 3.64, 21.0, 5.9, 704.2);
  b.collider(20.8, 21.2, 704.0, 704.4, 0, 4.2, true);
  b.zone('Shell • Green Valley Grocery', 19.6, 48, 702.5, 723);

  // ---- 3999 strip mall: one storey, four shopfronts under one red-tiled parapet
  ground(b, 19.6, 44, 683, 702, asphalt, L1, 0.85);
  for (let z = 685; z <= 700; z += 2.8) b.floor(23.5, z, 4.6, 0.1, mat(0xf2f0ea, 0.85), L2);
  const mall = atlas.slot(1000, 170, (p) => {
    stucco(p, '#e9dcc4');
    const shops: Array<[string, string, string, string]> = [
      ['JF BAKERY', '#7a3a1a', '#ffe8c0', '#ffd8a0'],
      ['PANDA EXPRESS', '#c8102e', '#ffffff', '#ff4050'],
      ['SUBWAY', '#0a7a3a', '#ffd200', '#ffe040'],
      ["McDonald's", '#d6202c', '#ffc72c', '#ffd040'],
    ];
    shops.forEach(([name, bg, fg, glow], i) => {
      const x = i * 250;
      rect(p, x + 10, 14, 230, 46, bg, '#000');
      text(p, name, x + 125, 38, `bold ${name.length > 10 ? 26 : 32}px Arial, sans-serif`, fg, glow, 210);
      shopWindow(p, x + 20, 76, 130, 84);
      rect(p, x + 160, 70, 70, 100, '#2a2c30');
      rect(p, x + 166, 76, 58, 94, '#7a9ab0', '#c9b088');
      if (i < 3) rect(p, x + 247, 0, 6, p.h, '#c9b89a');
    });
  });
  b.box(35.5, 0, 692.5, 11, 4.4, 17, mat(0xe9dcc4, 0.85), true);
  mg.box(mat(0xb5482e, 0.8), 30.0, 4.55, 692.5, 1.0, 0.5, 17.4);
  westFace(mall, 17, 4.1, 30.0, 2.05, 692.5);
  // golden arches on a pole at the curb
  const arches = atlas.slot(260, 220, (p) => {
    const { ctx } = p;
    rect(p, 0, 150, p.w, 70, '#d6202c', '#ff3030');
    text(p, "McDonald's", p.w / 2, 186, 'bold 40px Arial, sans-serif', '#ffffff', '#ffffff', p.w - 20);
    p.stroke('#ffc72c', '#ffd040');
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(30, 150);
    ctx.bezierCurveTo(30, 0, 120, 0, 130, 120);
    ctx.bezierCurveTo(140, 0, 230, 0, 230, 150);
    ctx.stroke();
  });
  mg.beam(steel, v3(21.0, 0, 684.4), v3(21.0, 5.2, 684.4), 0.18, 8);
  twoSided(arches, 2.6, 2.2, 21.0, 6.3, 684.4);
  b.collider(20.8, 21.2, 684.2, 684.6, 0, 5.2, true);
  const mallCars: Array<[CarKind, number, number]> = [
    ['sedan', 0x8a1a1a, 687.8],
    ['suv', 0xd9d9d9, 696.2],
  ];
  for (const [k, c, z] of mallCars) {
    const cc = car(k, c);
    bakeGroup(cc.group);
    b.add(cc.group, 23.8, 0, z, Math.PI / 2);
    b.collider(21.3, 26.3, z - 1.1, z + 1.1, 0, 1.6);
  }
  b.building(35.5, 692.5, 11, 17, '#e9dcc4', 'Strip mall');
  b.zone('3999 Las Vegas Blvd S (McDonald’s • Subway • Panda Express)', 19.6, 44, 683, 702);

  // ---- the Laughing Jackalope (boarded up), right at the sidewalk
  const jack = atlas.slot(420, 160, (p) => {
    stucco(p, '#c8a878');
    rect(p, 0, 0, p.w, 54, '#5a3a1a', '#000');
    text(p, 'LAUGHING JACKALOPE', p.w / 2, 28, 'bold 30px Georgia, serif', '#f2d890', '#ffd870', p.w - 30);
    boarded(p, 30, 76, 120, 70);
    boarded(p, 270, 76, 120, 70);
    rect(p, 175, 66, 70, 94, '#3a2414');
    text(p, 'BAR • GRILL', p.w / 2, 154, 'bold 12px Arial, sans-serif', '#3a2414');
  });
  b.box(25.5, 0, 678.5, 7, 3.6, 7, mat(0xc8a878, 0.9), true);
  westFace(jack, 7, 3.6, 22.0, 1.8, 678.5);
  // the jackalope on the roof: a rabbit with antlers
  const tan = mat(0xb08a5a, 0.85);
  mg.add(new THREE.SphereGeometry(0.55, 12, 8).scale(1.3, 0.9, 0.8).rotateY(Math.PI / 2).translate(24, 4.15, 678.5), tan);
  mg.add(new THREE.SphereGeometry(0.34, 12, 8).translate(23.4, 4.7, 678.0), tan);
  for (const s of [-1, 1]) {
    mg.beam(tan, v3(23.45, 4.95, 678.0 + s * 0.12), v3(23.5, 5.65, 678.0 + s * 0.2), 0.07, 5, 0.04);
    mg.beam(mat(0xe8dcc0, 0.6), v3(23.4, 5.0, 678.0 + s * 0.08), v3(23.2, 5.7, 678.0 + s * 0.45), 0.035, 4, 0.02);
    mg.beam(mat(0xe8dcc0, 0.6), v3(23.3, 5.4, 678.0 + s * 0.28), v3(23.0, 5.65, 678.0 + s * 0.4), 0.025, 4, 0.015);
  }
  b.zone('Laughing Jackalope (closed)', 21.8, 29, 675, 682);

  // ---- the little motels at 3961: Desert Oasis and Motel 8, two storeys with outdoor walkways
  const motel = (z0: number, z1: number, name: string, bg: string, fg: string, wallC: string, wallN: number) => {
    const len = z1 - z0;
    const zc = (z0 + z1) / 2;
    ground(b, 19.6, 42, z0 - 0.5, z1 + 0.5, asphalt, L1, 0.85);
    b.box(36, 0, zc, 8, 6.4, len, mat(wallN, 0.85), true);
    mg.box(mat(0xd8d2c4, 0.8), 31.4, 3.2, zc, 1.4, 0.2, len);
    mg.box(mat(0x2a2a2e, 0.5, 0.6), 30.7, 4.1, zc, 0.05, 0.9, len);
    for (let z = z0 + 0.5; z <= z1 - 0.5; z += 3) mg.box(mat(0xd8d2c4, 0.8), 30.8, 1.6, z, 0.2, 3.2, 0.2);
    const rooms = atlas.slot(700, 170, (p) => {
      stucco(p, wallC);
      for (const row of [0, 1]) {
        for (let i = 0; i < 8; i++) {
          const x = 14 + i * 86;
          const y = 10 + row * 85;
          rect(p, x, y + 14, 24, 60, '#7a4a2a');
          rect(p, x + 34, y + 22, 40, 30, '#b8c8d0', i % 3 ? '#000' : '#d8b880');
        }
      }
    });
    westFace(rooms, len, 6.4, 32, 3.2, zc);
    const s = atlas.slot(300, 300, (p) => {
      const { ctx } = p;
      rect(p, 0, 0, p.w, 220, bg, '#000');
      rect(p, 10, 10, p.w - 20, 200, bg);
      p.stroke(fg, fg);
      ctx.lineWidth = 8;
      ctx.strokeRect(14, 14, p.w - 28, 192);
      const words = name.split(' ');
      words.forEach((wd, i) => text(p, wd, p.w / 2, 70 + i * 80 - (words.length - 2) * 30, 'bold 62px Georgia, serif', fg, fg, p.w - 40));
      rect(p, 30, 228, p.w - 60, 66, '#f2f2ee', '#000');
      text(p, 'VACANCY', p.w / 2, 261, 'bold 40px Arial, sans-serif', '#d6202c', '#ff3a3a');
    });
    mg.beam(steel, v3(21.0, 0, z0 + 1), v3(21.0, 5.0, z0 + 1), 0.15, 8);
    twoSided(s, 2.6, 2.6, 21.0, 6.3, z0 + 1);
    b.collider(20.8, 21.2, z0 + 0.8, z0 + 1.2, 0, 5, true);
    b.building(36, zc, 8, len, wallC, name);
    b.zone(name, 19.6, 42, z0 - 0.5, z1 + 0.5);
  };
  motel(663, 673, 'DESERT OASIS', '#1e8a8a', '#fff2c8', '#f0d8b8', 0xf0d8b8);
  motel(651, 661, 'MOTEL 8', '#f2f2ee', '#c8202a', '#dfe6ea', 0xdfe6ea);
}

/** The SkyVue "pillars of sadness": two bare concrete columns of the 2012 observation wheel that never turned. */
function skyVue(b: WorldBuilder, mg: Merger): void {
  const conc = mat(0xb4aea4, 0.92);
  const z = 631;
  for (const x of [50, 58]) {
    mg.add(new THREE.CylinderGeometry(1.25, 1.45, 21, 20).translate(x, 10.5, z), conc, true);
    mg.add(new THREE.CylinderGeometry(1.55, 1.55, 0.6, 20).translate(x, 21.2, z), mat(0x9a948a, 0.92));
    for (let k = 0; k < 4; k++) mg.beam(mat(0x6a4a32, 0.9, 0.4), v3(x - 0.5 + (k % 2), 21.5, z - 0.5 + (k >> 1)), v3(x - 0.5 + (k % 2), 23.0, z - 0.5 + (k >> 1)), 0.05, 4);
    b.collider(x - 1.45, x + 1.45, z - 1.45, z + 1.45, 0, 21.5, true);
  }
  mg.box(mat(0x9a948a, 0.92), 54, 0.3, z, 12, 0.6, 4.4);
  b.zone('SkyVue (abandoned observation wheel)', 47, 61, z - 3, z + 3);
}

/**
 * Dream Las Vegas, 5051 LVB S: work stopped in March 2023 at about 19% (excavation, utilities, concrete piles);
 * the contractor has held the site since 2025 and it's for sale. Pile caps with rebar, spoil heaps, an idle
 * excavator, the site trailer and a wrapped fence.
 */
function dreamSite(b: WorldBuilder, atlas: Atlas, mg: Merger): void {
  const dz = 856.9;
  ground(b, 22, 68, 849.2, 869, 0x8a6e4e, L1, 1);
  ground(b, 30, 62, 851, 866, 0x7a5e40, L2, 1);
  const conc = mat(0xa8a398, 0.9);
  const rebar = mat(0x6a3a22, 0.85, 0.4);
  for (let x = 32; x <= 60; x += 4) {
    for (let z = 852.5; z <= 865; z += 4) {
      mg.add(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 10).translate(x, 0.35, z), conc);
      for (let k = 0; k < 4; k++) {
        const ox = (k % 2 ? 0.22 : -0.22) + (x % 3) * 0.01;
        const oz = k < 2 ? -0.22 : 0.22;
        mg.beam(rebar, v3(x + ox, 0.7, z + oz), v3(x + ox * 1.15, 1.9 + ((x + z + k) % 3) * 0.2, z + oz * 1.15), 0.02, 3);
      }
      b.collider(x - 0.5, x + 0.5, z - 0.5, z + 0.5, 0, 0.7);
    }
  }
  // spoil heaps
  const dirt = mat(0x9a7a56, 1);
  for (const [x, z, r, h] of [
    [27, 852, 3.6, 2.2],
    [64, 853, 3.2, 1.8],
    [26, 866, 3.0, 1.6],
  ] as const) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(r, h, r * 0.9);
    mg.at(dirt, g, x, 0, z, x * 0.3);
    b.collider(x - r * 0.6, x + r * 0.6, z - r * 0.55, z + r * 0.55, 0, h * 0.7);
  }
  // idle excavator, boom down
  const yellow = mat(0xe8b21e, 0.55, 0.2);
  const dark = mat(0x2a2a2c, 0.8);
  const ex = 47;
  const ez = 851.4;
  mg.box(dark, ex, 0.45, ez - 1.1, 4.2, 0.9, 0.8);
  mg.box(dark, ex, 0.45, ez + 1.1, 4.2, 0.9, 0.8);
  mg.box(yellow, ex - 0.3, 1.5, ez, 3.2, 1.2, 2.6, 0, true);
  mg.box(yellow, ex + 0.6, 2.6, ez - 0.6, 1.2, 1.4, 1.2);
  mg.box(mat(0x3a4a5a, 0.2, 0.5), ex + 1.22, 2.7, ez - 0.6, 0.04, 0.9, 1.0);
  mg.beam(yellow, v3(ex + 1.2, 2.0, ez + 0.4), v3(ex + 4.0, 3.6, ez + 0.4), 0.22, 6);
  mg.beam(yellow, v3(ex + 4.0, 3.6, ez + 0.4), v3(ex + 5.2, 0.9, ez + 0.4), 0.18, 6);
  mg.box(dark, ex + 5.3, 0.5, ez + 0.4, 0.9, 0.8, 1.1);
  b.collider(ex - 2.1, ex + 1.6, ez - 1.5, ez + 1.5, 0, 2.1);
  // site trailer
  const trailer = atlas.slot(420, 130, (p) => {
    rect(p, 0, 0, p.w, p.h, '#eeeeea');
    for (const wx of [40, 300]) shopWindow(p, wx, 40, 80, 50, false);
    rect(p, 180, 30, 60, 100, '#8a8e94');
    text(p, 'SITE OFFICE • HARD HATS REQUIRED', p.w / 2, 16, 'bold 18px Arial, sans-serif', '#c8202a', '#000', p.w - 20);
  });
  b.box(60, 0.4, 868 - 1.6, 9, 2.6, 2.8, mat(0xeeeeea, 0.7), true);
  mg.at(trailer.mat, atlas.plane(trailer, 9, 2.6), 60, 1.7, 868 - 3.02, Math.PI);
  for (const x of [56.5, 63.5]) mg.box(mat(0x6a6a6e, 0.8), x, 0.2, 866.4, 0.4, 0.4, 2.6);
  // rebar bundles on timbers
  for (let k = 0; k < 4; k++) mg.box(rebar, 38 + k * 0.35, 0.5, 868, 0.3, 0.28, 9);
  for (const z of [864, 868, 872 - 0.5]) mg.box(mat(0x8a6a42, 0.9), 39, 0.15, Math.min(z, 871.5), 2.2, 0.3, 0.3);
  // the wrapped fence along the Boulevard, its faded banner and the for-sale board
  const wrap = atlas.slot(800, 110, (p) => {
    rect(p, 0, 0, p.w, p.h, '#2f4a3a');
    text(p, 'DREAM', 150, 48, 'bold 54px Georgia, serif', '#b8b2a2', '#000');
    text(p, 'LAS VEGAS', 150, 88, 'bold 18px Georgia, serif', '#9a9488', '#000');
    text(p, 'CONSTRUCTION SITE • KEEP OUT • NO TRESPASSING', 520, 56, 'bold 22px Arial, sans-serif', '#d8d2c2', '#000', 470);
  });
  // fence posts, rails and the dark green privacy screen (open at the site gate)
  const post = mat(0x8c9196, 0.45, 0.7);
  const screen = mat(0x24392c, 0.9, 0, { side: THREE.DoubleSide });
  for (const [z0, z1] of [
    [849.0, dz - 1.2],
    [dz + 1.4, 869.3],
  ]) {
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / Math.max(1, Math.round((z1 - z0) / 3))) mg.beam(post, v3(21.4, 0, z), v3(21.4, 2.5, z), 0.05, 5);
    mg.beam(post, v3(21.4, 2.5, z0), v3(21.4, 2.5, z1), 0.035, 4);
    const pl = new THREE.PlaneGeometry(z1 - z0, 2.0);
    pl.rotateY(Math.PI / 2);
    mg.at(screen, pl, 21.42, 1.2, (z0 + z1) / 2);
    b.collider(21.25, 21.55, z0, z1, 0, 2.9, true);
  }
  for (const z of [dz - 4.7, dz + 5.3]) {
    mg.at(wrap.mat, atlas.plane(wrap, 7, 1.0), 21.36, 1.3, z, -Math.PI / 2);
  }
  const sale = atlas.slot(360, 220, (p) => {
    rect(p, 0, 0, p.w, p.h, '#f4f2ec');
    rect(p, 0, 0, p.w, 64, '#1a3a6a');
    text(p, 'FOR SALE', p.w / 2, 34, 'bold 46px Arial, sans-serif', '#ffffff', '#000');
    text(p, '±5.5 ACRES • STRIP FRONTAGE', p.w / 2, 104, 'bold 24px Arial, sans-serif', '#1a3a6a', '#000', p.w - 30);
    text(p, 'ENTITLED HOTEL-CASINO SITE', p.w / 2, 146, 'bold 20px Arial, sans-serif', '#3a3a3a', '#000', p.w - 30);
    text(p, '702-555-0123', p.w / 2, 190, 'bold 30px Arial, sans-serif', '#c8202a', '#000');
  });
  const steel = mat(0x6a6e74, 0.5, 0.6);
  for (const s of [-1, 1]) mg.beam(steel, v3(22.6, 0, dz + s * 1.6), v3(22.6, 4.4, dz + s * 1.6), 0.08, 6);
  mg.at(sale.mat, atlas.plane(sale, 3.6, 2.2), 22.6, 4.0, dz + 0.04, 0);
  mg.at(sale.mat, atlas.plane(sale, 3.6, 2.2), 22.6, 4.0, dz - 0.04, Math.PI);
  b.zone('Dream Las Vegas site (stalled, for sale)', 19, 70, 848.5, 869.5);
}

/** A few people actually going into the shops (paths from the walk to the doors). */
function shoppers(b: WorldBuilder): void {
  const t = b.crowd.tourists;
  t.push(
    { pts: [[16.5, 690], [24, 690], [29.6, 689.6]], prop: 'bag' },
    { pts: [[16.5, 697.5], [25, 697.5], [29.6, 698]], prop: 'none' },
    { pts: [[16.2, 709], [23, 709], [37.6, 712.5]], prop: 'cig' },
    { pts: [[16.4, 832], [22, 832], [38.8, 838.4]], prop: 'camera' },
    { pts: [[16.2, 824], [42.5, 823], [43.6, 822.8]], prop: 'camera' }
  );
}
