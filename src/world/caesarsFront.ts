import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from './builder';
import { mat } from './props';
import { LedBoard } from './textures';
import type { LedShow } from './textures';
import { animate, driveLed, fitFont, goldGradient, ledFaces, letterFace, part, placed, rotatedCollider } from './signKit';

/**
 * Caesars Palace's Strip front, after the real one in late 2026:
 *  - the new marquee at the Flamingo corner (unveiled July 2026): a tall portrait LED slab in a thin
 *    cream frame on a narrower cream plinth with Caesar's gold medallion, a white classical crown — a
 *    frieze with CAESARS PALACE in deep red Roman capitals, a cornice and a pediment — and a round
 *    LED medallion standing on the apex; the slab's side edges are LED too;
 *  - the red CAESARS PALACE letters and the gold laurel medallion on the temple front over the main
 *    entrance and on the Palace Tower's pedimented crown (the letters are red, not gold);
 *  - on the drive: Winged Victory on her column in the fountain and rearing white horses.
 */

const SHOWS: LedShow[] = [
  { name: 'THE COLOSSEUM', sub: 'LIVE • FRI & SAT 8PM', color: '#7a1a2a', art: 'singer' },
  { name: 'ABSINTHE', sub: 'NIGHTLY IN THE SPIEGELTENT', color: '#5a1a6a', art: 'cirque' },
  { name: 'OMNIA DAYCLUB', sub: 'SKYBAR • ON THE BOULEVARD', color: '#1a5a5a', art: 'dj' },
];

const RED = '#9e1b32';

/** Caesar's medallion: a laurel wreath round a red field with the emperor's gold profile. */
export function paintMedallion(ctx: CanvasRenderingContext2D, w: number, h: number, field = '#8a1426'): void {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.48;
  ctx.fillStyle = goldGradient(ctx, cy - R, cy + R);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = field;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.66, 0, Math.PI * 2);
  ctx.fill();
  // laurel leaves round the ring, two sprays meeting at the top
  ctx.fillStyle = '#7a5418';
  for (const s of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const a = Math.PI / 2 + s * (0.25 + i * 0.25);
      const lx = cx + Math.cos(a) * R * 0.83;
      const ly = cy + Math.sin(a) * R * 0.83;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(a + s * 0.9);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.12, R * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  // the laureate profile, facing left
  ctx.fillStyle = goldGradient(ctx, cy - R * 0.6, cy + R * 0.6);
  const k = R * 0.62;
  ctx.beginPath();
  ctx.moveTo(cx - k * 0.3, cy - k * 0.55);
  ctx.quadraticCurveTo(cx + k * 0.1, cy - k * 0.85, cx + k * 0.42, cy - k * 0.45);
  ctx.quadraticCurveTo(cx + k * 0.52, cy, cx + k * 0.28, cy + k * 0.38);
  ctx.lineTo(cx + k * 0.34, cy + k * 0.75);
  ctx.lineTo(cx - k * 0.2, cy + k * 0.75);
  ctx.lineTo(cx - k * 0.2, cy + k * 0.38);
  ctx.lineTo(cx - k * 0.42, cy + k * 0.22);
  ctx.lineTo(cx - k * 0.36, cy + k * 0.08);
  ctx.lineTo(cx - k * 0.52, cy - k * 0.02);
  ctx.quadraticCurveTo(cx - k * 0.48, cy - k * 0.35, cx - k * 0.3, cy - k * 0.55);
  ctx.fill();
}

/** Deep red Roman capitals on white stone: CAESARS (big) over PALACE, or one line. */
function paintRedName(ctx: CanvasRenderingContext2D, w: number, h: number, twoLines: boolean, bg: string | null): void {
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const draw = (text: string, y: number, maxW: number, maxPx: number, sp: number) => {
    fitFont(ctx, text, 'roman', maxW, maxPx, sp);
    ctx.fillStyle = 'rgba(60,10,16,0.5)';
    ctx.fillText(text, w / 2 + maxPx * 0.03, y + maxPx * 0.03);
    ctx.fillStyle = RED;
    ctx.fillText(text, w / 2, y);
  };
  if (twoLines) {
    draw('CAESARS', h * 0.38, w * 0.88, h * 0.5, 0.1);
    draw('PALACE', h * 0.8, w * 0.56, h * 0.26, 0.42);
  } else draw('CAESARS PALACE', h * 0.54, w * 0.96, h * 0.82, 0.08);
  ctx.letterSpacing = '0px';
}

/** A pediment prism facing ±z: base w, rise h, depth d, sitting on y = 0. */
function pedimentGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g.toNonIndexed();
}

/** The 2026 Caesars Palace marquee at the Flamingo corner (faces ±z). */
export function caesarsMarquee(b: WorldBuilder, x = -26.5, z = -15.2): void {
  const cream = mat(0xece3cf, 0.55);
  const white = mat(0xf6f3ec, 0.5);
  const gold = mat(0xd9a93e, 0.3, 0.85);
  const g = new THREE.Group();
  // plinth with Caesar's medallion
  g.add(part(new THREE.BoxGeometry(6.2, 0.45, 3.3), cream, 0, 0.225, 0));
  g.add(part(new THREE.BoxGeometry(5.2, 4.4, 2.6), cream, 0, 2.6, 0));
  g.add(part(new THREE.BoxGeometry(5.5, 0.25, 2.8), gold, 0, 4.7, 0));
  g.add(placed(letterFace(b, 2.3, 2.3, (ctx, w, h) => paintMedallion(ctx, w, h), 2.62), 0, 2.55, 0));
  // the LED slab in its thin cream frame, LED on the side edges too
  const ledW = 7.0;
  const ledH = 15.6;
  const y0 = 5.0;
  const cy = y0 + ledH / 2;
  const depth = 1.6;
  g.add(part(new THREE.BoxGeometry(ledW + 0.5, ledH + 0.5, depth), cream, 0, cy, 0));
  const led = new LedBoard('CAESARS PALACE', ['THE FORUM SHOPS', 'BACCHANAL BUFFET', "HELL'S KITCHEN", 'NOBU HOTEL', 'GARDEN OF THE GODS'], ['#8a1a1a', '#c9a04a', '#1a2a6a', '#3a1a5a', '#0a5a6a'], 256, 576).withShows(SHOWS);
  g.add(placed(ledFaces(led, ledW, ledH, depth), 0, cy, 0));
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x806040 });
  const edges = [-1, 1].map((s) => new THREE.PlaneGeometry(depth - 0.3, ledH).rotateY((s * Math.PI) / 2).translate(s * (ledW / 2 + 0.26), cy, 0));
  g.add(new THREE.Mesh(mergeGeometries(edges, false)!, edgeMat));
  // crown: architrave, the white frieze with the red name, cornice with a gold fillet, pediment
  const top = y0 + ledH + 0.25;
  g.add(part(new THREE.BoxGeometry(7.8, 0.45, 2.0), white, 0, top + 0.22, 0));
  const fy = top + 0.45 + 1.25;
  g.add(part(new THREE.BoxGeometry(8.2, 2.5, 2.0), white, 0, fy, 0));
  g.add(placed(letterFace(b, 7.9, 2.3, (ctx, w, h) => paintRedName(ctx, w, h, true, '#f6f3ec'), 2.0), 0, fy, 0));
  const cTop = fy + 1.25;
  g.add(part(new THREE.BoxGeometry(8.9, 0.5, 2.5), white, 0, cTop + 0.25, 0));
  g.add(part(new THREE.BoxGeometry(8.6, 0.1, 2.3), gold, 0, cTop + 0.02, 0));
  for (let i = 0; i < 17; i++) g.add(part(new THREE.BoxGeometry(0.22, 0.2, 0.2), white, -4.0 + i * 0.5, cTop - 0.1, 1.16));
  for (let i = 0; i < 17; i++) g.add(part(new THREE.BoxGeometry(0.22, 0.2, 0.2), white, -4.0 + i * 0.5, cTop - 0.1, -1.16));
  const pedY = cTop + 0.5;
  g.add(part(pedimentGeo(8.9, 2.1, 2.2), white, 0, pedY, 0));
  for (const s of [-1, 1]) g.add(part(new THREE.ConeGeometry(0.26, 0.6, 8), gold, s * 4.3, pedY + 0.3, 0));
  // the LED medallion on the apex: a disc with the medallion on both faces and a glowing rim
  const dY = pedY + 2.1 + 1.15;
  g.add(part(new THREE.CylinderGeometry(1.25, 1.25, 0.5, 32), white, 0, dY, 0, 0, Math.PI / 2));
  g.add(placed(letterFace(b, 2.3, 2.3, (ctx, w, h) => paintMedallion(ctx, w, h, '#6a0e1e'), 0.5), 0, dY, 0));
  const rimMat = new THREE.MeshBasicMaterial({ color: 0x8a6a30 });
  const rims = [-1, 1].map((s) => new THREE.TorusGeometry(1.2, 0.07, 6, 40).translate(0, 0, s * 0.27));
  g.add(part(mergeGeometries(rims, false)!, rimMat, 0, dY, 0));
  b.add(g, x, 0, z, 0);
  rotatedCollider(b, x, z, 0, 0, 0, 6.2, 3.3, 0, dY + 1.3, true);
  driveLed(b, led, x, cy, z);
  // after dark the slab edges and the medallion rim come up; the edges chase red → gold
  const dayEdge = new THREE.Color(0x6a5a48);
  const c = new THREE.Color();
  const rimDay = new THREE.Color(0x8a6a30);
  const rimNight = new THREE.Color(1.3, 1.0, 0.55);
  animate(b, (t, n) => {
    c.setHSL(0.02 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.6)), 0.9, 0.5);
    edgeMat.color.copy(dayEdge).lerp(c.multiplyScalar(0.9), n);
    rimMat.color.copy(rimDay).lerp(rimNight, n);
  });
}

/**
 * The temple front over the main entrance (on the colonnade beam at x, beamTop, centred on z, facing +x):
 * a white frieze block with the red CAESARS PALACE and a pediment with the gold medallion.
 */
export function caesarsTempleFront(b: WorldBuilder, x = -54, beamTop = 9.2, z = -53, w = 16): void {
  const white = mat(0xf4f0e6, 0.55);
  const gold = mat(0xd9a93e, 0.3, 0.85);
  const g = new THREE.Group();
  // local frame: +z = the Boulevard (east); the group turns by π/2
  g.add(part(new THREE.BoxGeometry(w, 2.0, 2.6), white, 0, 1.0, 0));
  g.add(placed(letterFace(b, w - 1.2, 1.5, (ctx, pw, ph) => paintRedName(ctx, pw, ph, false, '#f4f0e6')), 0, 1.0, 1.32));
  g.add(part(new THREE.BoxGeometry(w + 0.8, 0.45, 3.2), white, 0, 2.22, 0));
  g.add(part(new THREE.BoxGeometry(w + 0.5, 0.08, 3.0), gold, 0, 2.0, 0));
  g.add(part(pedimentGeo(w + 0.8, 3.4, 3.0), white, 0, 2.45, 0));
  g.add(placed(letterFace(b, 1.9, 1.9, (ctx, pw, ph) => paintMedallion(ctx, pw, ph)), 0, 3.55, 1.52));
  g.add(part(new THREE.ConeGeometry(0.3, 0.9, 8), gold, 0, 2.45 + 3.4 + 0.3, 0));
  for (const s of [-1, 1]) g.add(part(new THREE.ConeGeometry(0.26, 0.7, 8), gold, s * (w / 2 + 0.2), 2.8, 0));
  b.add(g, x, beamTop, z, Math.PI / 2);
}

/**
 * The Palace Tower's crown (tower centred at tx, tz; its Boulevard face at faceX; roof at roofY): red
 * CAESARS PALACE letters under the cornice and a pediment with the gold medallion on the roof line.
 */
export function caesarsTowerCrown(b: WorldBuilder, faceX: number, tz: number, lettersY: number, upperFaceX: number, roofY: number): void {
  const white = mat(0xf4f0e6, 0.55);
  const gold = mat(0xd9a93e, 0.3, 0.85);
  const name = letterFace(b, 20, 2.8, (ctx, w, h) => paintRedName(ctx, w, h, false, null));
  b.add(name, faceX + 0.25, lettersY, tz, Math.PI / 2);
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(26, 0.6, 1.6), white, 0, 0.3, 0));
  g.add(part(pedimentGeo(26, 4.2, 1.4), white, 0, 0.6, 0));
  g.add(placed(letterFace(b, 2.8, 2.8, (ctx, w, h) => paintMedallion(ctx, w, h)), 0, 2.0, 0.72));
  g.add(part(new THREE.ConeGeometry(0.35, 1.1, 8), gold, 0, 0.6 + 4.2 + 0.4, 0));
  b.add(g, upperFaceX + 0.7, roofY, tz, Math.PI / 2);
}

/** Winged Victory on a column in the drive fountain, and rearing white horses (marble statuary). */
export function caesarsStatuary(b: WorldBuilder, victory: [number, number], horses: Array<[number, number, number]>): void {
  const marble = mat(0xf2efe6, 0.5);
  const geos: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const gg = g.index ? g.toNonIndexed() : g;
    gg.rotateX(rx).rotateZ(rz).rotateY(ry).translate(x, y, z);
    geos.push(gg);
  };
  // Victory: a fluted column and the winged figure striding forward, wings swept back
  const [vx, vz] = victory;
  add(new THREE.CylinderGeometry(0.75, 0.9, 0.8, 16), vx, 0.4, vz);
  add(new THREE.CylinderGeometry(0.42, 0.5, 5.2, 16), vx, 3.4, vz);
  add(new THREE.BoxGeometry(1.1, 0.4, 1.1), vx, 6.2, vz);
  add(new THREE.ConeGeometry(0.62, 2.0, 10), vx, 7.4, vz); // drapery
  add(new THREE.CylinderGeometry(0.2, 0.3, 0.8, 8), vx, 8.6, vz);
  add(new THREE.SphereGeometry(0.2, 8, 6), vx, 9.15, vz);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.12, 2.3, 0.9), vx - 0.35, 9.0, vz + s * 0.7);
    add(new THREE.BoxGeometry(0.1, 1.6, 0.7), vx - 0.55, 9.6, vz + s * 1.2, s * 0.5, 0, 0);
  }
  add(new THREE.BoxGeometry(0.12, 0.9, 0.12), vx + 0.25, 9.0, vz + 0.2, 0, 0, -0.8); // raised arm with the wreath
  // horses: plinth, body rearing up at ~35°, neck and head, hind legs planted, forelegs pawing
  for (const [hx, hz, face] of horses) {
    const c = Math.cos(face);
    const s = Math.sin(face);
    const P = (lx: number, ly: number, lz: number): [number, number, number] => [hx + lx * c + lz * s, ly, hz - lx * s + lz * c];
    const at = (g: THREE.BufferGeometry, lx: number, ly: number, lz: number, rx: number) => {
      const [wx, wy, wz] = P(lx, ly, lz);
      add(g, wx, wy, wz, rx, face, 0);
    };
    const pl = new THREE.BoxGeometry(1.5, 1.6, 2.8).rotateY(face);
    const [px, , pz] = P(0, 0, 0);
    geos.push(pl.toNonIndexed().translate(px, 0.8, pz));
    at(new THREE.BoxGeometry(0.8, 0.85, 2.3), 0, 2.85, 0.2, -0.6); // body, front raised (+z local = forward)
    at(new THREE.BoxGeometry(0.45, 1.3, 0.6), 0, 4.0, 1.15, 0.35); // neck
    at(new THREE.BoxGeometry(0.42, 0.45, 0.95), 0, 4.65, 1.55, 0.6); // head
    for (const sx of [-0.25, 0.25]) {
      at(new THREE.BoxGeometry(0.2, 1.4, 0.24), sx, 2.1, -0.75, 0.2); // hind legs
      at(new THREE.BoxGeometry(0.18, 0.95, 0.22), sx, 3.15, 1.45, -1.1); // forelegs pawing
    }
    at(new THREE.BoxGeometry(0.16, 1.1, 0.16), 0, 2.2, -1.2, 0.5); // tail
  }
  const m = new THREE.Mesh(mergeGeometries(geos, false)!, marble);
  m.castShadow = true;
  b.add(m);
  // colliders: the column and the plinths
  b.collider(vx - 0.9, vx + 0.9, vz - 0.9, vz + 0.9, 0, 6.4, true);
  for (const [hx, hz] of horses) b.collider(hx - 1.3, hx + 1.3, hz - 1.3, hz + 1.3, 0, 1.6, true);
}

/**
 * The Forum Shops' Strip entrance (the 2004 Trevi-style front): giant paired Corinthian columns either
 * side of the doors at `x` (the wall face, facing +x) centred on z, an arched glass lunette over the
 * doorway, the entablature and an attic with THE FORUM SHOPS, statues along the top, and the big
 * dome of the rotunda rising behind (centred at domeX).
 */
export function forumEntrance(b: WorldBuilder, x: number, z: number, roofY: number, domeX: number): void {
  const cream = mat(0xece2cc, 0.6);
  const marble = mat(0xf3eee4, 0.5);
  const gold = mat(0xd4ae57, 0.35, 0.75);
  const dome = mat(0xe2d6bd, 0.65);
  const geo: THREE.BufferGeometry[] = [];
  const gl: THREE.BufferGeometry[] = [];
  const add = (list: THREE.BufferGeometry[], g: THREE.BufferGeometry, px: number, py: number, pz: number) => {
    const n = g.index ? g.toNonIndexed() : g;
    list.push(n.translate(px, py, pz));
  };
  const colX = x + 1.3;
  const colH = 9.4;
  for (const s of [-1, 1]) {
    for (const off of [3.7, 5.3]) {
      const cz = z + s * off;
      add(geo, new THREE.BoxGeometry(1.4, 0.9, 1.4), colX, 0.45, cz);
      add(geo, new THREE.CylinderGeometry(0.5, 0.58, colH, 16), colX, 0.9 + colH / 2, cz);
      add(gl, new THREE.CylinderGeometry(0.72, 0.5, 0.7, 16), colX, 0.9 + colH + 0.35, cz);
    }
  }
  // entablature, attic, cornices
  const eY = 0.9 + colH + 0.7;
  add(geo, new THREE.BoxGeometry(2.8, 1.1, 13.4), colX - 0.1, eY + 0.55, z);
  add(geo, new THREE.BoxGeometry(3.2, 0.35, 14.0), colX - 0.1, eY + 1.27, z);
  add(geo, new THREE.BoxGeometry(1.8, 2.2, 11.6), colX - 0.6, eY + 2.55, z);
  add(geo, new THREE.BoxGeometry(2.2, 0.3, 12.2), colX - 0.6, eY + 3.8, z);
  add(gl, new THREE.BoxGeometry(2.85, 0.1, 13.5), colX - 0.1, eY + 0.02, z);
  // the arch over the doors: a moulded half-ring
  const ring = new THREE.TorusGeometry(3.05, 0.32, 8, 20, Math.PI).rotateY(Math.PI / 2);
  add(geo, ring, x + 0.35, 5.1, z);
  // statues on the attic over each column pair and at the ends
  for (const s of [-1, 1]) {
    for (const off of [1.6, 4.5]) {
      const sz = z + s * off;
      add(geo, new THREE.BoxGeometry(0.8, 0.5, 0.8), colX - 0.6, eY + 4.2, sz);
      add(geo, new THREE.CylinderGeometry(0.26, 0.36, 1.3, 8), colX - 0.6, eY + 5.1, sz);
      add(geo, new THREE.CylinderGeometry(0.2, 0.26, 0.55, 8), colX - 0.6, eY + 6.0, sz);
      add(geo, new THREE.SphereGeometry(0.15, 8, 6), colX - 0.6, eY + 6.42, sz);
    }
  }
  b.add(new THREE.Mesh(mergeGeometries(geo, false)!, marble)).castShadow = true;
  b.add(new THREE.Mesh(mergeGeometries(gl, false)!, gold));
  // glass lunette over the doorway, lit warm at night
  const lun = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x3a4250, emissive: 0xffd9a0, emissiveIntensity: 0.05, roughness: 0.2, metalness: 0.4 }), 0.05, 0.8);
  const lg = new THREE.CircleGeometry(2.8, 18, 0, Math.PI).rotateY(Math.PI / 2);
  b.add(new THREE.Mesh(lg, lun), x + 0.12, 5.1, z);
  // the name on the attic, bronze-gold Roman capitals
  b.add(placed(letterFace(b, 10.2, 1.7, (ctx, w, h) => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, 'THE FORUM SHOPS', 'roman', w * 0.94, h * 0.6, 0.12);
    ctx.fillStyle = 'rgba(40,24,6,0.6)';
    ctx.fillText('THE FORUM SHOPS', w / 2 + 3, h * 0.42 + 3);
    ctx.fillStyle = goldGradient(ctx, h * 0.1, h * 0.72);
    ctx.fillText('THE FORUM SHOPS', w / 2, h * 0.42);
    fitFont(ctx, 'AT CAESARS PALACE', 'roman', w * 0.5, h * 0.24, 0.3);
    ctx.fillStyle = goldGradient(ctx, h * 0.72, h * 0.95);
    ctx.fillText('AT CAESARS PALACE', w / 2, h * 0.84);
    ctx.letterSpacing = '0px';
  }), colX + 0.31, eY + 2.55, z, Math.PI / 2));
  // the rotunda's drum and dome behind, with a lantern
  const dg: THREE.BufferGeometry[] = [];
  const R = 6.4;
  add(dg, new THREE.CylinderGeometry(R, R, 2.6, 32), domeX, roofY + 1.3, z);
  add(dg, new THREE.CylinderGeometry(R + 0.35, R + 0.35, 0.4, 32), domeX, roofY + 2.7, z);
  b.add(new THREE.Mesh(mergeGeometries(dg, false)!, cream)).castShadow = true;
  const dd: THREE.BufferGeometry[] = [];
  add(dd, new THREE.SphereGeometry(R, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeX, roofY + 2.9, z);
  b.add(new THREE.Mesh(mergeGeometries(dd, false)!, dome)).castShadow = true;
  const ribs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const t = new THREE.TorusGeometry(R + 0.05, 0.12, 4, 12, Math.PI / 2).rotateZ(0).rotateY((i / 16) * Math.PI * 2);
    add(ribs, t, domeX, roofY + 2.9, z);
  }
  add(ribs, new THREE.CylinderGeometry(0.9, 1.1, 1.6, 12), domeX, roofY + 2.9 + R + 0.6, z);
  add(ribs, new THREE.SphereGeometry(0.45, 10, 8), domeX, roofY + 2.9 + R + 1.8, z);
  b.add(new THREE.Mesh(mergeGeometries(ribs, false)!, gold));
}
