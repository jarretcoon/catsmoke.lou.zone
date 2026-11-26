import * as THREE from 'three';
import { bakeGroup } from '../meshBake';
import type { WorldBuilder } from './builder';
import { car, mat, mesh, neonSign } from './props';
import type { CarKind } from './props';
import { L1, L2, Merger, canvasTex, ground, palmInto, paving, v3 } from './southKit';
import { zFromS } from './strip';

/**
 * The "Welcome to Fabulous Las Vegas" sign (Betty Willis, Western Neon, 1959; owned by YESCO, leased to Clark
 * County) in the median at 5100 Las Vegas Blvd S, built to its real proportions:
 * - 25 ft (7.6 m) to the top of the frame. The cabinet is a horizontally stretched diamond, pointed top and
 *   bottom with rounded side points (about 5.9 x 3.0 m), hung OFF-CENTRE on two flat blue poles joined by a
 *   crosspiece; the poles stand left of centre seen from the south and poke up above the cabinet.
 * - A red-painted eight-point metal star outlined in yellow neon sits between the poles under the crosspiece;
 *   its four long rays reach past the frame.
 * - Seven silver dollars (white neon circles, red letters outlined in neon) spell WELCOME across the top;
 *   "to Fabulous" in blue 1950s script, "LAS VEGAS" in big red capitals nearly the full width, "NEVADA" in small
 *   blue capitals. A yellow band trims the edge and ~89 chasing bulbs ring it.
 * - The north face reads DRIVE / CAREFULLY in red capitals, "Come Back" in blue script and SOON in blue capitals.
 * - Artificial turf under it (2007), the photo line and median parking lot south of it (2008-2015), three solar
 *   trees just north of it (2014) and a state historical marker.
 */

const SIGN_W = 5.9;
const SIGN_H = 3.0;
const SIGN_CY = 4.46; // centre of the cabinet above the ground
const SIGN_D = 0.42; // cabinet depth
const FRAME_X = -0.88; // centre of the pole frame, relative to the cabinet centre (left of centre seen from the south)
const POLE_DX = 0.64; // each pole's offset from the frame centre
const POLE_W = 0.32;
const POLE_D = 0.24;
const FRAME_TOP = 7.6;
const BAR_H = 0.36;
const STAR_Y = 6.72;
const STAR_VALLEY = 0.21; // radius of the notches between the star's rays
/** Ground-level half-width of the median island (inner-lane cars run from |x| ≈ 2.17). */
const ISLAND = 2.1;

const RED = '#d6202c';
const BLUE = '#2153b4';
const GOLD = '#f2b72c';

/** The cabinet outline (sign-local metres, centre at 0,0), counter-clockwise: rounded side points, near-sharp top and bottom. */
function boardOutline(W: number, H: number): THREE.Vector2[] {
  const V = [new THREE.Vector2(0, H / 2), new THREE.Vector2(-W / 2, 0), new THREE.Vector2(0, -H / 2), new THREE.Vector2(W / 2, 0)];
  const cut = [0.09, 0.62, 0.09, 0.62];
  const segs = [3, 12, 3, 12];
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 4; i++) {
    const v = V[i];
    const prev = V[(i + 3) % 4];
    const next = V[(i + 1) % 4];
    const a = v.clone().add(prev.clone().sub(v).normalize().multiplyScalar(cut[i]));
    const c = v.clone().add(next.clone().sub(v).normalize().multiplyScalar(cut[i]));
    for (let k = 0; k <= segs[i]; k++) {
      const t = k / segs[i];
      const u = 1 - t;
      pts.push(new THREE.Vector2(u * u * a.x + 2 * u * t * v.x + t * t * c.x, u * u * a.y + 2 * u * t * v.y + t * t * c.y));
    }
  }
  return pts;
}

/** Offset a convex CCW polygon outward by d (inward when d < 0). */
function offsetPoly(pts: THREE.Vector2[], d: number): THREE.Vector2[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i + n - 1) % n];
    const c = pts[(i + 1) % n];
    const t = c.clone().sub(a).normalize();
    // CCW polygon: outward normal is (t.y, −t.x)
    return p.clone().add(new THREE.Vector2(t.y, -t.x).multiplyScalar(d));
  });
}

/** Points spaced evenly along a closed polyline. */
function alongPerimeter(pts: THREE.Vector2[], count: number, phase = 0): THREE.Vector2[] {
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const l = pts[i].distanceTo(pts[(i + 1) % pts.length]);
    segLen.push(l);
    total += l;
  }
  const out: THREE.Vector2[] = [];
  let seg = 0;
  let acc = 0;
  for (let k = 0; k < count; k++) {
    const s = ((k + phase) / count) * total;
    while (acc + segLen[seg] < s && seg < pts.length - 1) {
      acc += segLen[seg];
      seg++;
    }
    const t = segLen[seg] ? (s - acc) / segLen[seg] : 0;
    out.push(pts[seg].clone().lerp(pts[(seg + 1) % pts.length], t));
  }
  return out;
}

/** Text squeezed to a target width (letter-spaced when it is narrower). */
function spacedText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, width: number): void {
  const plain = ctx.measureText(text).width;
  if (plain >= width || text.length < 2) {
    ctx.fillText(text, cx, cy, width);
    return;
  }
  const gap = (width - plain) / (text.length - 1);
  let x = cx - width / 2;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, x, cy);
    x += ctx.measureText(ch).width + gap;
  }
  ctx.textAlign = 'center';
}

/** The cabinet face: yellow band, white field, painted lettering (the silver dollars are separate 3D drums). */
function faceTexture(back: boolean): THREE.CanvasTexture {
  const cw = 1536;
  const ch = Math.round((cw * SIGN_H) / SIGN_W);
  return canvasTex(cw, ch, (ctx, w, h) => {
    const toPx = (p: THREE.Vector2) => [(p.x / SIGN_W + 0.5) * w, (0.5 - p.y / SIGN_H) * h] as const;
    const path = (pts: THREE.Vector2[]) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = toPx(p);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
    };
    const outline = boardOutline(SIGN_W, SIGN_H);
    ctx.clearRect(0, 0, w, h);
    path(offsetPoly(outline, 0.02));
    ctx.fillStyle = '#c98a12';
    ctx.fill();
    path(outline);
    ctx.fillStyle = GOLD;
    ctx.fill();
    path(offsetPoly(outline, -0.115));
    ctx.fillStyle = '#ffe58a';
    ctx.fill();
    path(offsetPoly(outline, -0.135));
    const field = ctx.createLinearGradient(0, 0, 0, h);
    field.addColorStop(0, '#fbfaf5');
    field.addColorStop(1, '#f1efe6');
    ctx.fillStyle = field;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const X = (u: number) => u * w;
    const Y = (v: number) => v * h;
    if (!back) {
      // "TO" small blue capitals + "Fabulous" in 1950s brush script with its swash underline
      ctx.fillStyle = BLUE;
      ctx.font = `600 ${Math.round(h * 0.085)}px "Trebuchet MS", Arial, sans-serif`;
      ctx.fillText('TO', X(0.272), Y(0.395));
      ctx.font = `italic bold ${Math.round(h * 0.17)}px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive`;
      ctx.textAlign = 'left';
      ctx.fillText('Fabulous', X(0.33), Y(0.405), X(0.44));
      ctx.lineWidth = h * 0.011;
      ctx.strokeStyle = BLUE;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(X(0.4), Y(0.43));
      ctx.quadraticCurveTo(X(0.6), Y(0.415), X(0.775), Y(0.405));
      ctx.stroke();
      ctx.textAlign = 'center';
      // "LAS VEGAS": big red capitals almost the full width, a thin dark edge so they read at a distance
      ctx.font = `bold ${Math.round(h * 0.215)}px Arial, Helvetica, sans-serif`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = h * 0.008;
      ctx.strokeStyle = '#8e1018';
      const lv = (lw: number) => {
        ctx.save();
        ctx.translate(X(0.5), Y(0.635));
        ctx.scale(1, 1.08);
        ctx.strokeText('LAS VEGAS', 0, 0, lw);
        ctx.fillStyle = RED;
        ctx.fillText('LAS VEGAS', 0, 0, lw);
        ctx.restore();
      };
      lv(X(0.75));
      // "NEVADA": small blue capitals, letter-spaced
      ctx.fillStyle = BLUE;
      ctx.font = `bold ${Math.round(h * 0.075)}px Arial, Helvetica, sans-serif`;
      spacedText(ctx, 'NEVADA', X(0.5), Y(0.775), X(0.25));
    } else {
      ctx.fillStyle = RED;
      ctx.lineJoin = 'round';
      ctx.font = `bold ${Math.round(h * 0.12)}px Arial, Helvetica, sans-serif`;
      spacedText(ctx, 'DRIVE', X(0.5), Y(0.28), X(0.27));
      ctx.font = `bold ${Math.round(h * 0.19)}px Arial, Helvetica, sans-serif`;
      ctx.fillText('CAREFULLY', X(0.5), Y(0.5), X(0.78));
      ctx.fillStyle = BLUE;
      ctx.font = `italic bold ${Math.round(h * 0.16)}px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive`;
      ctx.fillText('Come Back', X(0.5), Y(0.665), X(0.56));
      ctx.font = `bold ${Math.round(h * 0.09)}px Arial, Helvetica, sans-serif`;
      spacedText(ctx, 'SOON', X(0.5), Y(0.795), X(0.22));
    }
  });
}

/** Seven silver-dollar faces in one atlas (one column each) + the glow map for their neon letters. */
function coinAtlas(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const S = 256;
  const draw = (glow: boolean) =>
    canvasTex(S * 7, S, (ctx) => {
      'WELCOME'.split('').forEach((ch, i) => {
        const cx = i * S + S / 2;
        const cy = S / 2;
        if (!glow) {
          const g = ctx.createRadialGradient(cx - 30, cy - 40, 10, cx, cy, S / 2);
          g.addColorStop(0, '#fbfbfb');
          g.addColorStop(0.75, '#e2e3e6');
          g.addColorStop(1, '#b9bcc2');
          ctx.fillStyle = g;
        } else ctx.fillStyle = '#5a5856';
        ctx.fillRect(i * S, 0, S, S);
        // the coin's raised rim and its lettering (Liberty, the motto, a date) in faint relief
        ctx.strokeStyle = glow ? '#fff4e0' : '#9a9da4';
        ctx.lineWidth = glow ? 7 : 5;
        ctx.beginPath();
        ctx.arc(cx, cy, S * 0.43, 0, Math.PI * 2);
        ctx.stroke();
        if (!glow) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.fillStyle = 'rgba(110,112,120,0.55)';
          ctx.font = 'bold 15px Georgia, serif';
          ctx.textAlign = 'center';
          const ring = (txt: string, a0: number, span: number, r: number) => {
            for (let k = 0; k < txt.length; k++) {
              const a = a0 + (k / Math.max(1, txt.length - 1) - 0.5) * span;
              ctx.save();
              ctx.rotate(a);
              ctx.fillText(txt[k], 0, -r);
              ctx.restore();
            }
          };
          ring('LIBERTY', 0, 1.3, 88);
          ring('IN GOD WE TRUST', Math.PI, 2.2, -100);
          ctx.restore();
        }
        // the letter: orange-red paint with a neon tube traced down its strokes
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${ch === 'M' || ch === 'W' ? 132 : 150}px Arial, Helvetica, sans-serif`;
        if (!glow) {
          ctx.lineWidth = 7;
          ctx.strokeStyle = '#7a2010';
          ctx.strokeText(ch, cx, cy + 6);
          ctx.fillStyle = '#e8532a';
          ctx.fillText(ch, cx, cy + 6);
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffb08a';
          ctx.strokeText(ch, cx, cy + 6);
        } else {
          ctx.fillStyle = '#ff5a2a';
          ctx.shadowColor = '#ff6a3a';
          ctx.shadowBlur = 14;
          ctx.fillText(ch, cx, cy + 6);
          ctx.shadowBlur = 0;
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffd0b0';
          ctx.strokeText(ch, cx, cy + 6);
        }
      });
    });
  return { map: draw(false), glow: draw(true) };
}

/** An eight-point star with ridged (faceted) rays, front and back, centred at 0,0 in the xy plane. */
function starGeometry(): THREE.BufferGeometry {
  const rays: Array<[number, number, number]> = []; // [angle, length, half-width at the base]
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 4;
    const main = k % 2 === 0;
    const len = !main ? 0.7 : k === 0 ? 1.12 : k === 4 ? 1.02 : 0.96;
    rays.push([a, len, main ? 0.15 : 0.11]);
  }
  const pos: number[] = [];
  const t = 0.15; // ridge height at the centre
  for (const side of [1, -1]) {
    const C = v3(0, 0, side * t);
    for (let k = 0; k < 8; k++) {
      const [a, len, hw] = rays[k];
      const tip = v3(Math.cos(a) * len, Math.sin(a) * len, side * 0.015);
      void hw;
      const valley = (da: number) => {
        const va = a + da;
        return v3(Math.cos(va) * STAR_VALLEY, Math.sin(va) * STAR_VALLEY, side * 0.02);
      };
      const vl = valley(Math.PI / 8);
      const vr = valley(-Math.PI / 8);
      const tris = [
        [C, vr, tip],
        [C, tip, vl],
      ];
      for (const [p, q, r] of tris) {
        const order = side > 0 ? [p, q, r] : [p, r, q];
        for (const v of order) pos.push(v.x, v.y, v.z);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** The star's outline (tips and valleys) for the yellow neon. */
function starOutline(): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 4;
    const main = k % 2 === 0;
    const len = (!main ? 0.7 : k === 0 ? 1.12 : k === 4 ? 1.02 : 0.96) - 0.07;
    pts.push(new THREE.Vector2(Math.cos(a) * len, Math.sin(a) * len));
    const va = a + Math.PI / 8;
    const r = STAR_VALLEY * 0.78;
    pts.push(new THREE.Vector2(Math.cos(va) * r, Math.sin(va) * r));
  }
  return pts;
}

export function buildWelcomeSign(b: WorldBuilder): void {
  const zSign = zFromS(-3635); // 907.3
  const zLot0 = zFromS(-3687); // 918.9
  const zLot1 = zFromS(-3804); // 944.9
  const zIsl0 = 890.6;
  const zIsl1 = 951.4;
  const mg = new Merger();

  // ---------------------------------------------------------------- the island
  // Raised curbs, the terracotta stamped-concrete walk, the turf oval under the sign, the small median lot
  const curb = mat(0xd8d2c4, 0.8);
  for (const s of [-1, 1]) {
    for (const [a, c] of s < 0
      ? [
          [zIsl0, zLot1 - 5],
          [zLot1 + 0.6, zIsl1],
        ]
      : [[zIsl0, zIsl1]]) b.box(s * (ISLAND - 0.12), 0, (a + c) / 2, 0.24, 0.2, c - a, curb, false, false);
  }
  b.box(0, 0, zIsl0 + 0.12, ISLAND * 2, 0.2, 0.24, curb, false, false);
  b.box(0, 0, zIsl1 - 0.12, ISLAND * 2, 0.2, 0.24, curb, false, false);
  b.box(0, 0, zLot0 - 1.2, ISLAND * 2 - 0.4, 0.15, 0.24, curb, false, false);
  paving(b, -ISLAND + 0.24, ISLAND - 0.24, zIsl0 + 0.24, zLot0 - 1.3, '#c99878', '#a87a5c', 1.6, L1);
  ground(b, -ISLAND + 0.24, ISLAND - 0.24, zLot0 - 1.1, zLot1 + 0.4, 0x2e2e33, L1, 0.85);
  ground(b, -ISLAND + 0.24, ISLAND - 0.24, zLot1 + 0.6, zIsl1 - 0.24, 0x5f7d45, L1, 0.95);
  for (let z = zLot0 + 1; z <= zLot1; z += 6.2) b.floor(-0.2, z, ISLAND * 2 - 0.8, 0.12, mat(0xdedcd4, 0.85), L2);
  // Artificial turf (2007): an oval lawn the poles stand in, edged with a low concrete band
  const turfTex = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#4c9a34';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(120,190,80,0.35)' : 'rgba(30,90,30,0.35)';
      ctx.fillRect((i * 37) % w, (i * 71 + (i >> 3)) % h, 1, 3);
    }
  });
  turfTex.wrapS = turfTex.wrapT = THREE.RepeatWrapping;
  turfTex.repeat.set(3, 8);
  const turfGeo = new THREE.CircleGeometry(1, 40);
  turfGeo.rotateX(-Math.PI / 2);
  turfGeo.scale(ISLAND - 0.36, 1, 5.4);
  b.add(mesh(turfGeo, new THREE.MeshStandardMaterial({ map: turfTex, roughness: 0.95 }), 0, L2 + 0.012, zSign + 0.9));
  const edge = new THREE.CircleGeometry(1, 40);
  edge.rotateX(-Math.PI / 2);
  edge.scale(ISLAND - 0.2, 1, 5.6);
  b.add(mesh(edge, mat(0xd9d2c2, 0.85), 0, L2 + 0.004, zSign + 0.9));
  // Sandstone boulders at the front corners of the lawn
  const stone = mat(0xb98a5e, 0.95);
  for (const [x, z, r] of [
    [-1.6, zSign + 4.3, 0.46],
    [1.5, zSign - 4.2, 0.44],
    [-1.55, zSign - 4.0, 0.4],
  ] as const) {
    const g = new THREE.DodecahedronGeometry(r, 0);
    g.scale(1.3, 0.75, 1);
    mg.at(stone, g, x, r * 0.5, z, x);
    b.collider(x - r * 1.2, x + r * 1.2, z - r, z + r, 0, r * 1.1);
  }

  // Welcome sign parking (south of the sign; 2008, 2012, 2015)
  b.add(neonSign('WELCOME SIGN PARKING', '#0a2a5a', '#ffffff', 3.2, 0.7, '15 MIN • PHOTO STOP', 0.06), 0, 1.4, zLot1 + 1.6, 0);
  mg.beam(mat(0x8c8f94, 0.4, 0.6), v3(0, 0, zLot1 + 1.65), v3(0, 1.05, zLot1 + 1.65), 0.04, 4);
  const parked: Array<[CarKind, number, number]> = [
    ['sedan', 0xe8e8ea, zLot0 + 4],
    ['suv', 0x1d1f24, zLot0 + 10.2],
    ['limo', 0xf4f4f4, zLot0 + 17.6],
  ];
  for (const [k, c, z] of parked) {
    const cc = car(k, c);
    bakeGroup(cc.group);
    b.add(cc.group, -0.25, 0, z, 0);
    b.collider(-1.2, 0.7, z - cc.length / 2, z + cc.length / 2, 0, 1.55);
  }
  palmInto(mg, 0, zLot1 + 4.2, 6.6, 304);
  palmInto(mg, 0, zIsl1 - 2.2, 6.8, 303);
  palmInto(mg, 0.2, zIsl0 + 1.6, 6.4, 301);

  // ---------------------------------------------------------------- the sign
  const signG = new THREE.Group();
  const outline = boardOutline(SIGN_W, SIGN_H);
  const shape = new THREE.Shape(outline);
  const remapUV = (g: THREE.BufferGeometry) => {
    const p = g.attributes.position;
    const uvs = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uvs[i * 2] = p.getX(i) / SIGN_W + 0.5;
      uvs[i * 2 + 1] = p.getY(i) / SIGN_H + 0.5;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    return g;
  };
  // Internally lit translucent faces: matte by day, glowing white all night
  const faceMat = (back: boolean) => {
    const t = faceTexture(back);
    t.anisotropy = 8;
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.55 });
    b.nightGlow(m, 0.0, 0.5);
    return m;
  };
  // The cabinet: gold-painted sheet-metal sides
  const body = new THREE.ExtrudeGeometry(shape, { depth: SIGN_D, bevelEnabled: false, curveSegments: 1 });
  body.translate(0, 0, -SIGN_D / 2);
  const gold = mat(0xe0a826, 0.45, 0.35);
  signG.add(mesh(body, gold, 0, 0, 0, true));
  signG.add(mesh(remapUV(new THREE.ShapeGeometry(shape)), faceMat(false), 0, 0, SIGN_D / 2 + 0.004));
  const backM = mesh(remapUV(new THREE.ShapeGeometry(shape)), faceMat(true), 0, 0, -SIGN_D / 2 - 0.004);
  backM.rotation.y = Math.PI; // reads left-to-right from the north
  signG.add(backM);

  // Seven silver dollars across the top (front face only; from the north you see the backs of the outer ones)
  const atlas = coinAtlas();
  const coinFace = new THREE.MeshStandardMaterial({ map: atlas.map, emissiveMap: atlas.glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.35, metalness: 0.25 });
  b.nightGlow(coinFace, 0.0, 1.25);
  const reed = canvasTex(256, 8, (ctx, w, h) => {
    for (let x = 0; x < w; x += 4) {
      ctx.fillStyle = (x / 4) % 2 ? '#7d8087' : '#d6d8dc';
      ctx.fillRect(x, 0, 4, h);
    }
  });
  reed.wrapS = THREE.RepeatWrapping;
  reed.repeat.set(6, 1);
  const coinRim = new THREE.MeshStandardMaterial({ map: reed, roughness: 0.3, metalness: 0.7 });
  const coinBack = mat(0xa9acb2, 0.4, 0.6);
  const R = 0.345;
  const coinZ = SIGN_D / 2 + 0.11;
  const faces: THREE.BufferGeometry[] = [];
  const rims: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.685;
    const y = 1.0 + 0.012 * (3 - Math.abs(i - 3));
    const f = new THREE.CircleGeometry(R, 32);
    const uv = f.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 7);
    f.translate(x, y, coinZ + 0.08);
    faces.push(f);
    const rim = new THREE.CylinderGeometry(R, R, 0.16, 32, 1, true);
    rim.rotateX(Math.PI / 2);
    rim.translate(x, y, coinZ);
    rims.push(rim);
    const bk = new THREE.CircleGeometry(R, 24);
    bk.rotateY(Math.PI);
    bk.translate(x, y, coinZ - 0.08);
    mg.add(bk.translate(0, SIGN_CY, zSign), coinBack);
    // stand-off brackets to the cabinet
    mg.box(coinBack, x, y - 0.12 + SIGN_CY, zSign + SIGN_D / 2 + 0.02, 0.06, 0.06, 0.06);
  }
  const merge = (gs: THREE.BufferGeometry[]) => {
    const all = gs.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      return n;
    });
    let count = 0;
    for (const g of all) count += g.attributes.position.count;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    let o = 0;
    for (const g of all) {
      pos.set(g.attributes.position.array as Float32Array, o * 3);
      nor.set(g.attributes.normal.array as Float32Array, o * 3);
      uvs.set(g.attributes.uv.array as Float32Array, o * 2);
      o += g.attributes.position.count;
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    m.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    return m;
  };
  signG.add(mesh(merge(faces), coinFace));
  signG.add(mesh(merge(rims), coinRim));

  // Pole frame: two flat poles (left of centre from the south) joined by a crosspiece, standing above the cabinet
  const blue = mat(0x2a5cbf, 0.42, 0.3);
  for (const s of [-1, 1]) {
    const px = FRAME_X + s * POLE_DX;
    mg.box(blue, px, (FRAME_TOP - BAR_H) / 2, zSign, POLE_W, FRAME_TOP - BAR_H, POLE_D, 0, true);
    mg.box(mat(0x9a968c, 0.9), px, 0.12, zSign, POLE_W + 0.3, 0.24, POLE_D + 0.3);
    b.collider(px - POLE_W / 2, px + POLE_W / 2, zSign - POLE_D / 2, zSign + POLE_D / 2, 0, FRAME_TOP, true);
  }
  mg.box(blue, FRAME_X, FRAME_TOP - BAR_H / 2, zSign, POLE_DX * 2 + POLE_W, BAR_H, POLE_D, 0, true);
  // mitred corner braces
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.3, 0.12, POLE_D);
    g.rotateZ(s * Math.PI / 4);
    mg.at(blue, g, FRAME_X + s * (POLE_DX - POLE_W / 2 - 0.08), FRAME_TOP - BAR_H - 0.08, zSign);
  }

  // The star: red-painted metal, ridged rays, yellow neon tube around it, front and back
  const starMat = new THREE.MeshStandardMaterial({ color: 0xe0441c, roughness: 0.5, metalness: 0.15, flatShading: true, emissive: 0xff3a10, emissiveIntensity: 0 });
  b.nightGlow(starMat, 0.0, 0.32);
  signG.add(mesh(starGeometry(), starMat, FRAME_X, STAR_Y - SIGN_CY, 0, true));
  const neonY = new THREE.MeshStandardMaterial({ color: 0xffd22a, emissive: 0xffd84a, emissiveIntensity: 0.15, roughness: 0.4 });
  b.nightGlow(neonY, 0.15, 1.6);
  const so = starOutline();
  for (const fz of [0.065, -0.065]) {
    for (let i = 0; i < so.length; i++) {
      const p = so[i];
      const q = so[(i + 1) % so.length];
      mg.beam(neonY, v3(FRAME_X + p.x, STAR_Y + p.y, zSign + fz), v3(FRAME_X + q.x, STAR_Y + q.y, zSign + fz), 0.022, 4);
    }
  }

  signG.position.set(0, SIGN_CY, zSign);
  b.add(signG);
  b.collider(-SIGN_W / 2, SIGN_W / 2, zSign - SIGN_D / 2, zSign + SIGN_D / 2, SIGN_CY - SIGN_H / 2, SIGN_CY + SIGN_H / 2, true);

  // ~89 chasing bulbs ringing each face, just outside the yellow band
  const bulbMats = [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ color: 0x4a6ad8, roughness: 0.15, metalness: 0.1, emissive: 0xffd468, emissiveIntensity: 0 }));
  const ring = offsetPoly(outline, 0.075);
  const bulbs = alongPerimeter(ring, 89, 0.25);
  const stalk = mat(0xb8bcc4, 0.4, 0.7);
  bulbs.forEach((p, i) => {
    for (const fz of [0.12, -0.12]) {
      mg.add(new THREE.SphereGeometry(0.05, 8, 6).translate(p.x, SIGN_CY + p.y, zSign + fz), bulbMats[i % 3]);
    }
  });
  const sockets = offsetPoly(outline, 0.03);
  for (const p of alongPerimeter(sockets, 89, 0.25)) mg.box(stalk, p.x, SIGN_CY + p.y, zSign, 0.03, 0.03, 0.3);
  b.every((_dt, t, night) => {
    const k = Math.floor(t * 6) % 3;
    bulbMats.forEach((m, i) => {
      m.emissiveIntensity = night < 0.3 ? 0 : i === k ? 0.35 : 1.7;
      m.color.setHex(night < 0.3 ? 0x4a6ad8 : 0xffe2a0);
    });
  });

  // ---------------------------------------------------------------- around the sign
  // Ground floods in front (the PR #11 spot: aimed at the face, not the photo line) + their fixtures
  for (const s of [-1, 1]) mg.box(mat(0x2a2a30, 0.5, 0.6), s * 1.2, 0.2, zSign + 3.4, 0.42, 0.4, 0.42);
  b.spot(0xfff2d8, 6, 14, new THREE.Vector3(0, 0.25, zSign + 3.4), new THREE.Vector3(0, SIGN_CY + 0.3, zSign), 0.42, 0.55, 0);

  // Nevada State Historical Marker beside the walk
  const plaque = canvasTex(256, 192, (ctx, w, h) => {
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c8a860';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#e8d8a8';
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText('WELCOME TO FABULOUS', w / 2, 46);
    ctx.fillText('LAS VEGAS SIGN', w / 2, 70);
    ctx.font = '13px Georgia, serif';
    ['Designed by Betty Willis', 'Erected 1959 by Western Neon', 'National Register of', 'Historic Places 2009'].forEach((l, i) => ctx.fillText(l, w / 2, 100 + i * 18));
  });
  const plaqueM = new THREE.MeshStandardMaterial({ map: plaque, roughness: 0.6, metalness: 0.3 });
  b.add(mesh(new THREE.PlaneGeometry(0.62, 0.46), plaqueM, -1.62, 1.0, zSign - 2.6).rotateY(Math.PI));
  mg.beam(mat(0x3a3a3c, 0.5, 0.5), v3(-1.62, 0, zSign - 2.58), v3(-1.62, 0.8, zSign - 2.58), 0.04, 6);

  // Three solar trees (2014) along the walk south of the sign: a pole and one big square panel tilted to the sun
  // (kept off the east edge between z 915 and the spawn point so they never block a new game's first view)
  const panelTex = canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#16244a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#7d8fb4';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo((i * w) / 6, 0);
      ctx.lineTo((i * w) / 6, h);
      ctx.moveTo(0, (i * h) / 6);
      ctx.lineTo(w, (i * h) / 6);
      ctx.stroke();
    }
  });
  const panel = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.25, metalness: 0.5 });
  const steel = mat(0x9aa0a8, 0.45, 0.6);
  for (const [x, z, h] of [
    [1.62, zSign + 6.9, 4.7],
    [-1.62, zSign + 6.1, 5.0],
    [-1.62, zSign + 9.6, 4.6],
  ] as const) {
    mg.beam(steel, v3(x, 0, z), v3(x, h, z), 0.1, 8, 0.08, true);
    mg.add(new THREE.CylinderGeometry(0.3, 0.34, 0.3, 10).translate(x, 0.15, z), mat(0x9a968c, 0.9));
    const cx = x * 0.55;
    mg.beam(steel, v3(x, h - 0.6, z), v3(cx, h + 0.05, z), 0.05, 5);
    const pg = new THREE.PlaneGeometry(2.1, 2.1);
    pg.rotateX(-Math.PI / 2 + 0.33);
    mg.at(panel, pg, cx, h + 0.2, z);
    const pb = new THREE.BoxGeometry(2.1, 0.06, 2.1);
    pb.rotateX(0.33);
    mg.at(steel, pb, cx, h + 0.16, z);
    b.collider(x - 0.14, x + 0.14, z - 0.14, z + 0.14, 0, h, true);
  }
  // The old McCarran Field gate pillars (1941, moved here 1948): rubble-stone posts just south of the sign, east side
  const rubble = canvasTex(64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#8a7a66';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      const x = (i * 23 + (i >> 3) * 11) % w;
      const y = (i * 37 + (i >> 2) * 5) % h;
      ctx.fillStyle = ['#a8967c', '#9a8670', '#b8a688', '#7e6e5a', '#c2ae90'][i % 5];
      ctx.beginPath();
      ctx.ellipse(x, y, 5 + (i % 3) * 1.5, 3.5 + (i % 2) * 1.5, (i % 5) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const stoneM = new THREE.MeshStandardMaterial({ map: rubble, roughness: 0.95 });
  for (const pz of [zSign + 14.2, zSign + 19.4]) {
    const g = new THREE.BoxGeometry(1.05, 3.1, 1.05);
    mg.at(stoneM, g, 20.15, 1.55, pz, 0, true);
    mg.box(mat(0xd8d0c0, 0.8), 20.15, 3.2, pz, 1.25, 0.2, 1.25);
    mg.add(new THREE.SphereGeometry(0.28, 12, 8).translate(20.15, 3.58, pz), mat(0xf4ecd8, 0.4));
    b.collider(19.62, 20.68, pz - 0.53, pz + 0.53, 0, 3.3, true);
  }
  const marker = canvasTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#5a4a2a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c8a860';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#e8d8a8';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('McCARRAN FIELD', w / 2, 44);
    ctx.font = '15px Georgia, serif';
    ctx.fillText('Gate pillars, 1941', w / 2, 74);
    ctx.fillText('Las Vegas Army Air Field', w / 2, 98);
  });
  b.add(mesh(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshStandardMaterial({ map: marker, roughness: 0.5, metalness: 0.4 }), 19.615, 1.7, zSign + 14.2).rotateY(-Math.PI / 2));
  mg.flush(b);

  b.zone('Welcome to Fabulous Las Vegas Sign', -ISLAND - 0.6, ISLAND + 0.6, zIsl0, zLot0 - 1.2);
  b.zone('Welcome Sign Parking Lot', -ISLAND - 0.6, ISLAND + 0.6, zLot0 - 1.2, zIsl1);
  b.zone('McCarran Field Gate Pillars', 19.2, 21.2, zSign + 12.5, zSign + 21);
  b.staticMarkers.push({ x: 0, z: zSign, color: '#ff3b3b', glyph: '★', size: 3.2 });
  b.pickup(1.3, 0.95, zSign + 1.2, 3, 'Welcome Sign Selfie Pack', false);
  // The regulars posing out front for tips, and the photo line waiting its turn along the west side of the walk
  // (the east side is the welcome mission's marker)
  b.crowd.performers.push({ kind: 'elvis', x: -1.05, z: zSign + 2.0, facing: 0 }, { kind: 'showgirl', x: 0.95, z: zSign + 1.8, facing: 0 });
  // (kept north of z 915 so it never stands between a new game's camera and Lou at the spawn point)
  const queue: Array<'camera' | 'cig' | 'yard-drink' | 'bag'> = ['camera', 'camera', 'yard-drink', 'cig', 'bag'];
  queue.forEach((prop, i) => {
    const x = -0.85 + (i % 2) * 0.14;
    const z = zSign + 4.2 + i * 0.8;
    b.crowd.tourists.push({ pts: [[x, z], [x, z + 0.25]], prop });
  });
}
