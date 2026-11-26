import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from './builder';
import { beaconMaterial } from './buildings';
import { mat } from './props';
import { letterFace } from './signKit';
import { canvasTex } from './themedKit';

/**
 * Hard Rock Las Vegas's Guitar Hotel on the old Mirage volcano site, as it stands in late 2026: the
 * ~660-ft tower is topped out and glazed but not open (late 2027). The whole tower is a guitar BODY
 * standing on end (the neck is only a stub of bare steel at the crown, where light beams will go):
 * its broad faces look up and down the Strip (north and south), the narrow edge and the horns point
 * at the Boulevard. Mid cyan-blue glass inside a navy binding ring, white floor lines, a white trim
 * line round the outline, a white bridge with six string bars running up the face (their LEDs are
 * going in, not lit yet). After dark: dark glass with scattered work lights and red aviation lights.
 */

/** Guitar body outline (x across, y up), symmetric double-cutaway, total height H. */
function outline(H: number, W: number): THREE.Vector2[] {
  // control points for the right half, bottom centre → top centre (neck root); fractions of H / W/2
  const half: Array<[number, number]> = [
    [0, 0],
    [0.55, 0.015],
    [0.86, 0.08],
    [1.0, 0.2],
    [0.98, 0.32],
    [0.84, 0.43],
    [0.72, 0.52], // waist
    [0.76, 0.6],
    [0.86, 0.69],
    [0.84, 0.79],
    [0.72, 0.88],
    [0.62, 0.97], // horn tip
    [0.52, 0.94],
    [0.42, 0.82], // cutaway
    [0.25, 0.8],
    [0.16, 0.83], // neck root
  ];
  const right = new THREE.SplineCurve(half.map(([x, y]) => new THREE.Vector2((x * W) / 2, y * H)));
  const pts = right.getSpacedPoints(48);
  // anticlockwise: the right half up to the neck root, across it, then the mirrored left half back down
  return [...pts, ...pts.slice(1).reverse().map((p) => new THREE.Vector2(-p.x, p.y))];
}

/** Face texture: navy binding ring, cyan-blue glass, white floor lines and trim; glow map = work lights. */
function faceTextures(pts: THREE.Vector2[], H: number, W: number): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const CW = 512;
  const CH = Math.round((512 * H) / W);
  const tx = (p: THREE.Vector2) => [CW / 2 + (p.x / W) * CW, CH - (p.y / H) * CH] as const;
  const path = (ctx: CanvasRenderingContext2D, s: number, cy: number) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = tx(new THREE.Vector2(p.x * s, cy + (p.y - cy) * s));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
  const floors = 42;
  const map = canvasTex(CW, CH, (ctx) => {
    ctx.fillStyle = '#1c3d78';
    ctx.fillRect(0, 0, CW, CH);
    // inner glass field
    path(ctx, 0.83, H * 0.44);
    const g = ctx.createLinearGradient(0, 0, CW, CH);
    g.addColorStop(0, '#4aa6d6');
    g.addColorStop(0.5, '#2f86b8');
    g.addColorStop(1, '#2a74a6');
    ctx.fillStyle = g;
    ctx.fill();
    // sky reflection streaks
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(220,240,255,${0.05 + (i % 3) * 0.03})`;
      ctx.fillRect(0, (i * CH) / 9 + 20, CW, 14 + (i % 4) * 6);
    }
    // white trim line inside the binding
    path(ctx, 0.83, H * 0.44);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#eef4fa';
    ctx.stroke();
    // floor lines and mullions
    ctx.fillStyle = 'rgba(235,245,255,0.55)';
    for (let f = 1; f < floors; f++) ctx.fillRect(0, CH - (f / floors) * CH, CW, 2);
    ctx.fillStyle = 'rgba(10,30,60,0.35)';
    for (let x = 0; x < CW; x += 11) ctx.fillRect(x, 0, 1, CH);
    // outer white trim on the edge of the outline
    path(ctx, 1, 0);
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#f4f8fc';
    ctx.stroke();
  });
  const glow = canvasTex(CW, CH, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CW, CH);
    // sparse work lights on the floors being fitted out (inside the outline)
    ctx.save();
    path(ctx, 0.97, H * 0.44);
    ctx.clip();
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let f = 1; f < floors - 3; f++) {
      if (r() < 0.45) continue;
      const y = CH - ((f + 0.5) / floors) * CH;
      const n = 1 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const x = r() * CW;
        const warm = r() < 0.6;
        ctx.fillStyle = warm ? 'rgba(255,214,150,0.9)' : 'rgba(225,240,255,0.9)';
        ctx.fillRect(x, y - 3, 6 + r() * 26, 5);
      }
    }
    ctx.restore();
  });
  return { map, glow };
}

/**
 * The Guitar Hotel, centred at (gx, gz): faces ±z, `H` tall, `W` across, `D` thick. Returns the
 * height of the steel crown (for the crane).
 */
export function buildGuitarHotel(b: WorldBuilder, gx = -52, gz = -222, H = 60, W = 38, D = 11): number {
  const pts = outline(H, W);
  // faces: one shape, its UVs mapped to the outline's bounding box; the back face is the front turned round
  const shape = new THREE.Shape(pts);
  const face = new THREE.ShapeGeometry(shape, 1);
  const p = face.attributes.position as THREE.BufferAttribute;
  const uv = face.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / W + 0.5, p.getY(i) / H);
  const front = face.clone().translate(0, 0, D / 2);
  const back = face.clone().translate(0, 0, D / 2).rotateY(Math.PI);
  const tex = faceTextures(pts, H, W);
  const faceMat = b.nightGlow(new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.18, metalness: 0.55 }), 0, 0.85);
  const faces = new THREE.Mesh(mergeGeometries([front, back], false)!, faceMat);
  faces.castShadow = true;
  b.add(faces, gx, 0, gz);

  // the edge: blue glass with floor lines, wrapped round the outline (UVs: metres along, floors up)
  const edgeTex = canvasTex(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#244f86';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(70,150,210,0.6)';
      for (let y = 0; y < h; y += 32) ctx.fillRect(0, y + 6, w, 22);
      ctx.fillStyle = '#e8f0f8';
      for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 3);
      ctx.fillStyle = 'rgba(10,20,40,0.5)';
      for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 2, h);
    },
    true
  );
  const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.2, metalness: 0.55 });
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  let along = 0;
  const floorH = H / 42;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % pts.length];
    const len = a.distanceTo(c);
    // the outline runs anticlockwise, so the outward normal of a → c is (dy, −dx)
    const nl = Math.hypot(c.y - a.y, c.x - a.x) || 1;
    const nx = (c.y - a.y) / nl;
    const ny = -(c.x - a.x) / nl;
    const quad: Array<[number, number, number, number, number]> = [
      [a.x, a.y, -D / 2, along, a.y],
      [c.x, c.y, -D / 2, along + len, c.y],
      [c.x, c.y, D / 2, along + len, c.y],
      [a.x, a.y, D / 2, along, a.y],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const q = quad[k];
      pos.push(q[0], q[1], q[2]);
      nor.push(nx, ny, 0);
      uvs.push(q[3] / 4, q[4] / (floorH * 4));
    }
    along += len;
  }
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  edgeGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  edgeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const edge = new THREE.Mesh(edgeGeo, edgeMat);
  edge.castShadow = true;
  b.add(edge, gx, 0, gz);

  // white bridge, two pickups and six string bars proud of both faces; a white neck-root plate
  const white = mat(0xf2f5f8, 0.35, 0.2);
  const strings = mat(0xd8dde2, 0.3, 0.7);
  const parts: THREE.BufferGeometry[] = [];
  const sparts: THREE.BufferGeometry[] = [];
  const topY = H * 0.83;
  for (const s of [1, -1]) {
    const z = s * (D / 2 + 0.25);
    parts.push(new THREE.BoxGeometry(9.5, 2.0, 0.5).translate(0, H * 0.2, z));
    parts.push(new THREE.BoxGeometry(7.2, 1.3, 0.4).translate(0, H * 0.33, z));
    parts.push(new THREE.BoxGeometry(7.2, 1.3, 0.4).translate(0, H * 0.43, z));
    for (let i = 0; i < 6; i++) {
      const x = -3.0 + i * 1.2;
      sparts.push(new THREE.BoxGeometry(0.22, topY - H * 0.2, 0.22).translate(x, (topY + H * 0.2) / 2, s * (D / 2 + 0.55)));
    }
  }
  b.add(new THREE.Mesh(mergeGeometries(parts, false)!, white), gx, 0, gz);
  b.add(new THREE.Mesh(mergeGeometries(sparts, false)!, strings), gx, 0, gz);

  // the neck stub: bare steel frame rising off the crown between the horns, with a hoist and work lights
  const steel = mat(0x8e959c, 0.45, 0.75);
  const neckW = W * 0.3;
  const neckD = D * 0.7;
  const y0 = H * 0.8;
  const y1 = H + 4;
  const st: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) st.push(new THREE.BoxGeometry(0.45, y1 - y0, 0.45).translate((sx * neckW) / 2, (y0 + y1) / 2, (sz * neckD) / 2));
  for (let y = y0 + 2; y <= y1; y += 2.6) {
    for (const sz of [-1, 1]) st.push(new THREE.BoxGeometry(neckW, 0.3, 0.3).translate(0, y, (sz * neckD) / 2));
    for (const sx of [-1, 1]) st.push(new THREE.BoxGeometry(0.3, 0.3, neckD).translate((sx * neckW) / 2, y, 0));
    // diagonal bracing on the faces
    const diag = new THREE.BoxGeometry(0.2, Math.hypot(neckW, 2.6), 0.2).rotateZ(Math.atan2(neckW, 2.6) * (y % 5.2 < 2.6 ? 1 : -1));
    for (const sz of [-1, 1]) st.push(diag.clone().translate(0, y - 1.3, (sz * neckD) / 2));
  }
  b.add(new THREE.Mesh(mergeGeometries(st, false)!, steel), gx, 0, gz);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(neckW + 1, 0.4, neckD + 1), mat(0x6a6e74, 0.7, 0.3));
  b.add(deck, gx, y0 + 0.2, gz);
  // red aviation lights on the horn tips and the steel
  const red = beaconMaterial(b);
  const beacons: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) beacons.push(new THREE.SphereGeometry(0.4, 8, 6).translate(sx * W * 0.31, H * 0.97 + 0.4, 0));
  beacons.push(new THREE.SphereGeometry(0.4, 8, 6).translate(0, y1 + 0.4, 0));
  b.add(new THREE.Mesh(mergeGeometries(beacons, false)!, red), gx, 0, gz);
  // construction work lights on the crown (warm glass by day, lit at night)
  const work = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xfff0d8, emissiveIntensity: 0.05, roughness: 0.3 }), 0.05, 2.4);
  const wl: THREE.BufferGeometry[] = [];
  for (let y = y0 + 1.4; y < y1; y += 5.2) for (const sx of [-1, 1]) wl.push(new THREE.BoxGeometry(0.5, 0.4, 0.5).translate(sx * (neckW / 2 + 0.3), y, 0));
  b.add(new THREE.Mesh(mergeGeometries(wl, false)!, work), gx, 0, gz);

  b.collider(gx - W / 2 + 2, gx + W / 2 - 2, gz - D / 2, gz + D / 2, 0, H, true);
  return y1;
}

/** Black construction barrier panel with the gold Hard Rock branding (faces +z; place it on the fence). */
export function hardRockBanner(b: WorldBuilder, w = 9, h = 1.9): THREE.Object3D {
  return letterFace(b, w, h, (ctx, pw, ph) => {
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, 0, pw, ph);
    const gold = ctx.createLinearGradient(0, ph * 0.1, 0, ph * 0.9);
    gold.addColorStop(0, '#f6dc8a');
    gold.addColorStop(0.5, '#c99a3a');
    gold.addColorStop(1, '#8a6420');
    // the round Hard Rock badge
    const r = ph * 0.38;
    const bx = pw * 0.1;
    ctx.strokeStyle = gold;
    ctx.lineWidth = ph * 0.05;
    ctx.beginPath();
    ctx.arc(bx, ph / 2, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(ph * 0.17)}px Georgia, serif`;
    ctx.fillText('HARD', bx, ph * 0.43);
    ctx.fillText('ROCK', bx, ph * 0.6);
    ctx.textAlign = 'left';
    ctx.font = `bold ${Math.round(ph * 0.34)}px Georgia, "Times New Roman", serif`;
    ctx.fillText('HARD ROCK', pw * 0.2, ph * 0.38, pw * 0.76);
    ctx.font = `${Math.round(ph * 0.17)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText('HOTEL & CASINO  •  LAS VEGAS  •  2027', pw * 0.2, ph * 0.72, pw * 0.76);
  });
}
