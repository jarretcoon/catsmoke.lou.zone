import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from './builder';
import { beaconMaterial } from './buildings';
import { mat } from './props';
import { LedBoard } from './textures';
import type { LedShow } from './textures';
import { driveLed, ledFaces, letterFace, letters, part, placed } from './signKit';
import { canvasTex } from './themedKit';

/**
 * CityCenter's Strip frontage, after the real one:
 *  - the ARIA marquee (YESCO, 2013): a matte-black slab about 250 ft tall standing across the sidewalk
 *    on two legs (you walk through it under a black lintel that repeats the name), a giant portrait LED
 *    screen on each face, and the thin white "Aria" logotype at the top;
 *  - Crystals carries no big name on its Strip face, only its tenants' signs over the storefronts
 *    (Louis Vuitton, Tom Ford, Fendi in yellow, Gucci in gold, Dolce & Gabbana, Tiffany); the serif
 *    CRYSTALS name faces the ARIA drive instead;
 *  - Veer Towers behind it at Harmon: two 37-storey glass towers leaning 5° in opposite directions,
 *    their glass checkered with yellow panels, corner LED lines after dark.
 */

const ARIA_SHOWS: LedShow[] = [
  { name: 'CARBONE', sub: 'AT ARIA • RESERVATIONS', color: '#5a1a1a', art: 'singer' },
  { name: 'JEWEL', sub: 'NIGHTCLUB • FRIDAY & SATURDAY', color: '#2a1a6a', art: 'dj' },
];

/** The thin rounded "Aria" logotype (white on black, or white cut-out letters with no background). */
function paintAria(ctx: CanvasRenderingContext2D, w: number, h: number, bg: string | null): void {
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const px = Math.min(h * 0.82, w * 0.36);
  ctx.font = `200 ${Math.round(px)}px "Avenir Next", "Segoe UI Light", "Helvetica Neue", Arial, sans-serif`;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(px * 0.06)}px`;
  ctx.fillText('Aria', w / 2, h * 0.5 + px * 0.34);
  (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
}

/**
 * The ARIA marquee across the west sidewalk at z: legs at xIn (building side) and xOut (curb side),
 * LED faces looking up and down the Boulevard (±z).
 */
export function ariaMarquee(b: WorldBuilder, z = 253, xIn = -21.2, xOut = -12.6): void {
  const black = mat(0x141416, 0.55, 0.15);
  const W = xIn < xOut ? xOut - xIn : xIn - xOut;
  const cx = (xIn + xOut) / 2;
  const D = 1.7;
  const g = new THREE.Group();
  const legW = 1.0;
  const gateH = 5.6;
  // two legs and the lintel over the walk (local x = across the sidewalk, +z = south face)
  for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(legW, gateH, D), black, s * (W / 2 - legW / 2), gateH / 2, 0));
  g.add(part(new THREE.BoxGeometry(W, 1.6, D), black, 0, gateH + 0.8, 0));
  g.add(placed(letterFace(b, 3.2, 1.1, (ctx, w, h) => paintAria(ctx, w, h, '#141416'), D), 0, gateH + 0.8, 0));
  // the slab: black frame round the LED screen, black cap with the logo
  const y0 = gateH + 1.6;
  const ledH = 17.2;
  const ledW = W - 1.0;
  const cy = y0 + 0.4 + ledH / 2;
  g.add(part(new THREE.BoxGeometry(W, ledH + 0.8, D), black, 0, cy, 0));
  const led = new LedBoard('ARIA', ['ARIA RESORT & CASINO', 'THE SHOPS AT CRYSTALS', 'CATCH • JAVIER’S • BARDOT', 'VDARA HOTEL & SPA', 'ARIA POOL & CABANAS'], ['#1a2a4a', '#3a3a46', '#6a1a2a', '#1a4a4a', '#2a2a6a'], 256, 576).withShows(ARIA_SHOWS);
  g.add(placed(ledFaces(led, ledW, ledH, D), 0, cy, 0));
  const capY = y0 + ledH + 0.8 + 2.1;
  g.add(part(new THREE.BoxGeometry(W, 4.2, D), black, 0, capY, 0));
  const logo = letterFace(b, W - 0.6, 3.2, (ctx, w, h) => paintAria(ctx, w, h, '#141416'), D);
  g.add(placed(logo, 0, capY + 0.2, 0));
  // a slim lit reveal along the top edge and a pair of red aviation lights
  const top = capY + 2.1;
  const red = beaconMaterial(b);
  const bl = [-1, 1].map((s) => new THREE.SphereGeometry(0.18, 8, 6).translate(s * (W / 2 - 0.4), top + 0.2, 0));
  g.add(new THREE.Mesh(mergeGeometries(bl, false)!, red));
  b.add(g, cx, 0, z, 0);
  // the legs are solid; the walk between them is open
  for (const s of [-1, 1]) {
    const lx = cx + s * (W / 2 - legW / 2);
    b.collider(lx - legW / 2, lx + legW / 2, z - D / 2, z + D / 2, 0, top, true);
  }
  b.collider(cx - W / 2, cx + W / 2, z - D / 2, z + D / 2, gateH, top, true);
  driveLed(b, led, cx, cy, z);
}

/** Tenant signs over the Crystals storefront bands (wall face at x, facing +x), and CRYSTALS on the drive side. */
export function crystalsTenants(b: WorldBuilder, x = -20.86, y = 3.95): void {
  const signs: Array<[string, number, string, 'serif' | 'sans' | 'thin' | 'roman', number]> = [
    ['TIFFANY & CO.', 214.6, '#e8ecef', 'serif', 3.4],
    ['LOUIS VUITTON', 218.2, '#f2eee6', 'thin', 3.2],
    ['TOM FORD', 221.7, '#f4f4f4', 'sans', 2.6],
    ['GUCCI', 243.0, 'gold', 'serif', 2.2],
    ['FENDI', 246.3, '#ffd21f', 'sans', 2.2],
    ['DOLCE & GABBANA', 249.7, '#f4f4f4', 'serif', 3.4],
  ];
  for (const [text, z, fill, style, w] of signs) {
    const o = letters(b, text, w, 0.62, { style, fill, edge: fill === 'gold' ? '#3a2608' : '#20242a', spacing: 0.12 });
    b.add(o, x + 0.16, y, z, Math.PI / 2);
  }
  // the serif CRYSTALS name in brushed steel on the stone wall facing the ARIA drive (south face)
  b.add(mesh2(new THREE.BoxGeometry(14, 2.6, 0.4), mat(0xcfc6b4, 0.75), -38, 4.2, 252.2));
  b.add(letters(b, 'CRYSTALS', 12, 1.5, { style: 'serif', fill: 'silver', edge: '#2a2e34', spacing: 0.3 }), -38, 4.3, 252.45, 0);
}

function mesh2(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/** Veer Towers: two leaning glass slabs (w × d, h tall) at (x, z), leaning `lean` radians toward ±z. */
export function veerTowers(b: WorldBuilder, towers: Array<{ x: number; z: number; w: number; d: number; h: number; lean: number }>): void {
  // glass: 4 floors × 6 bays per tile, about a third of the panels yellow, floor bands and mullions
  const draw = (lit: boolean) => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    let s = 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    ctx.fillStyle = lit ? '#000' : '#5f7684';
    ctx.fillRect(0, 0, w, h);
    const cw = w / 6;
    const ch = h / 4;
    for (let fy = 0; fy < 4; fy++) {
      for (let fx = 0; fx < 6; fx++) {
        const yellow = r() < 0.36;
        if (lit) {
          if (r() < 0.42) {
            ctx.fillStyle = r() < 0.7 ? 'rgba(255,214,150,0.9)' : 'rgba(210,230,255,0.85)';
            ctx.fillRect(fx * cw + 3, fy * ch + 5, cw - 6, ch - 9);
          }
          continue;
        }
        const gr = ctx.createLinearGradient(0, fy * ch, 0, (fy + 1) * ch);
        if (yellow) {
          gr.addColorStop(0, '#e9cd52');
          gr.addColorStop(1, '#c9a52e');
        } else {
          gr.addColorStop(0, '#8aa2b2');
          gr.addColorStop(1, '#4f6676');
        }
        ctx.fillStyle = gr;
        ctx.fillRect(fx * cw + 1.5, fy * ch + 3, cw - 3, ch - 5);
      }
    }
    if (!lit) {
      ctx.fillStyle = '#d8dde0';
      for (let fy = 0; fy < 4; fy++) ctx.fillRect(0, fy * ch, w, 3);
    }
  };
  const map = canvasTex(192, 128, draw(false), true);
  const em = canvasTex(192, 128, draw(true), true);
  const glass = b.nightGlow(new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.04, roughness: 0.25, metalness: 0.45 }), 0.04, 0.85);
  const roof = mat(0x3a3e44, 0.7);
  const edge = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x2a2e34, emissive: 0xdff0ff, emissiveIntensity: 0.05, roughness: 0.4 }), 0.05, 1.8);
  const floorH = 3.2 * 0.38; // the game's towers are about a third of real height
  for (const t of towers) {
    const walls: THREE.BufferGeometry[] = [];
    // four faces with UVs in tiles: 6 bays of 1.8 m across, 4 floors up
    for (const [nx, nz, len] of [
      [1, 0, t.d],
      [-1, 0, t.d],
      [0, 1, t.w],
      [0, -1, t.w],
    ] as Array<[number, number, number]>) {
      const pg = new THREE.PlaneGeometry(len, t.h);
      const uv = pg.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / (6 * 1.8), (uv.getY(i) * t.h) / (4 * floorH));
      pg.rotateY(Math.atan2(nx, nz));
      pg.translate((nx * t.w) / 2, t.h / 2, (nz * t.d) / 2);
      walls.push(pg);
    }
    // shear: every floor slides along z by tan(lean) × height, so the floors stay level
    const shear = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, Math.tan(t.lean), 1, 0, 0, 0, 0, 1);
    const place = new THREE.Matrix4().makeTranslation(t.x, 0, t.z).multiply(shear);
    const body = new THREE.Mesh(mergeGeometries(walls, false)!.applyMatrix4(place), glass);
    body.castShadow = true;
    b.add(body);
    const extra: THREE.BufferGeometry[] = [new THREE.BoxGeometry(t.w - 0.2, 0.6, t.d - 0.2).translate(0, t.h, 0), new THREE.BoxGeometry(t.w * 0.5, 2.2, t.d * 0.5).translate(0, t.h + 1.4, 0)];
    b.add(new THREE.Mesh(mergeGeometries(extra, false)!.applyMatrix4(place), roof));
    const lines: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lines.push(new THREE.BoxGeometry(0.25, t.h, 0.25).translate((sx * t.w) / 2, t.h / 2, (sz * t.d) / 2));
    lines.push(new THREE.BoxGeometry(t.w + 0.3, 0.22, 0.22).translate(0, t.h + 0.32, t.d / 2));
    lines.push(new THREE.BoxGeometry(t.w + 0.3, 0.22, 0.22).translate(0, t.h + 0.32, -t.d / 2));
    b.add(new THREE.Mesh(mergeGeometries(lines, false)!.applyMatrix4(place), edge));
    const off = Math.tan(t.lean) * t.h;
    b.collider(t.x - t.w / 2, t.x + t.w / 2, t.z - t.d / 2 + Math.min(0, off), t.z + t.d / 2 + Math.max(0, off), 0, t.h, true);
  }
}
