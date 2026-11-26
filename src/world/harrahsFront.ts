import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { mat, mesh } from './props';
import { canvasTex } from './themedKit';
import { LedBoard } from './textures';
import { driveLed, fitFont, goldGradient, letterFace, placed } from './signKit';

/*
 * Harrah's on the Strip, after street photos (since the 2021 refresh): the long barrel-vaulted arch over
 * the main doors wrapped in diagonal lilac-and-violet pinstripes with navy edge bands and a big LED
 * screen filling the arch; the crest on top (cream baroque scrollwork, gold balls, a teal globe with
 * the white "Harrah's" script and coloured stars). After dark the stripes glow violet: Caesars lit the
 * building purple in June 2021. Carnaval Court out front: an open bar under a white tent roof with a
 * fascia that runs yellow → orange → magenta → purple with black dots, the purple CARNAVAL badge with
 * "Court" in yellow script, black railings with gold-ball finials.
 */

let stripeMat: THREE.MeshStandardMaterial | null = null;
/** Diagonal pinstripes (pale lilac on grey-violet), violet glow at night through the light stripes. */
function stripes(b: WorldBuilder): THREE.MeshStandardMaterial {
  if (stripeMat) return stripeMat;
  const S = 128;
  const paint = (lit: boolean) => (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = lit ? '#000000' : '#8c7baa';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = lit ? '#ffffff' : '#e4dcef';
    ctx.lineWidth = 16;
    ctx.beginPath();
    for (let k = -S; k <= S * 2; k += 42.67) {
      ctx.moveTo(k, S);
      ctx.lineTo(k + S, 0);
    }
    ctx.stroke();
    ctx.strokeStyle = lit ? '#606060' : '#b3a6cc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = -S + 21; k <= S * 2; k += 42.67) {
      ctx.moveTo(k, S);
      ctx.lineTo(k + S, 0);
    }
    ctx.stroke();
  };
  const map = canvasTex(S, S, paint(false), true);
  const em = canvasTex(S, S, paint(true), true);
  stripeMat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0x8a3cff, emissiveIntensity: 0.0, roughness: 0.55, metalness: 0.15 });
  b.nightGlow(stripeMat, 0.0, 0.85);
  return stripeMat;
}

/** Planar UVs in metres (u along z, v up) so the stripes keep their size on every piece. */
function uvMetres(g: THREE.BufferGeometry, per = 3): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  g.computeVertexNormals();
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const u = nx > 0.7 ? pos.getZ(i) : pos.getZ(i) + pos.getX(i);
    uv.setXY(i, u / per, pos.getY(i) / per);
  }
  return g;
}

const HARRAHS_LED = (): LedBoard =>
  new LedBoard("HARRAH'S", ['THE IMPROV • NIGHTLY', 'MAC KING COMEDY MAGIC', 'CARNAVAL COURT • LIVE BANDS', 'CAESARS REWARDS'], ['#5a1a9a', '#c9a04a', '#1a3a8a', '#9a1a6a'], 512, 320);

/** The crest's teal globe: white "Harrah's" script and coloured stars round it. */
function globeTexture(): THREE.CanvasTexture {
  return canvasTex(1024, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1aa0b8');
    g.addColorStop(0.5, '#1586a8');
    g.addColorStop(1, '#0d5a7a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const star = (cx: number, cy: number, r: number, c: string) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.45 : r;
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.fill();
    };
    const cs = ['#ffd24d', '#ff5aa8', '#7dffb0', '#ffffff', '#ff8a3d'];
    let s = 3;
    for (let i = 0; i < 46; i++) {
      s = (s * 9301 + 49297) % 233280;
      const r = s / 233280;
      const yy = 40 + ((i * 37) % 9) * 50;
      if (yy > h * 0.36 && yy < h * 0.66) continue;
      star(((i * 151) % 1024) + r * 20, yy, 10 + r * 10, cs[i % cs.length]);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const u of [0.75, 0.25]) {
      fitFont(ctx, "Harrah's", 'script', w * 0.4, h * 0.3);
      ctx.fillStyle = '#ffffff';
      ctx.fillText("Harrah's", u * w, h * 0.51);
    }
  });
}

/**
 * The arch on the podium face at x (facing −x), centred at zc: the barrel vault of radius R springing
 * at `spring`, running `depth` back over the roof, the LED screen in its mouth, the crest on top.
 */
export function harrahsArch(b: WorldBuilder, x: number, zc: number, R: number, spring: number, depth: number): void {
  const sm = stripes(b);
  const navy = mat(0x3b2d78, 0.5, 0.2);
  const cream = mat(0xf0e4cc, 0.65);
  const gold = mat(0xd9a93e, 0.3, 0.85);
  // the barrel: a half cylinder, axis along x, its mouth at x
  const barrel = new THREE.CylinderGeometry(R, R, depth, 32, 1, true, 0, Math.PI);
  barrel.rotateZ(Math.PI / 2);
  uvMetres(barrel);
  b.add(mesh(barrel, sm, x + depth / 2, spring, zc, true));
  // the piers under the springing line, striped too
  for (const s of [-1, 1]) {
    const pier = uvMetres(new THREE.BoxGeometry(depth, spring, 2.2));
    b.add(mesh(pier, sm, x + depth / 2, spring / 2, zc + s * (R - 1.1), true));
    b.collider(x, x + depth, zc + s * (R - 1.1) - 1.1, zc + s * (R - 1.1) + 1.1, 0, spring, true);
  }
  // navy edge bands round the mouth (a ring of short boxes) and along the piers
  const segs = 20;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI;
    const a1 = ((i + 1) / segs) * Math.PI;
    const am = (a0 + a1) / 2;
    const len = 2 * (R + 0.3) * Math.sin((a1 - a0) / 2) + 0.05;
    const seg = mesh(new THREE.BoxGeometry(0.7, 0.8, len), navy, x - 0.3, spring + Math.sin(am) * (R + 0.3), zc + Math.cos(am) * (R + 0.3));
    seg.rotation.x = Math.PI / 2 - am;
    b.add(seg);
  }
  for (const s of [-1, 1]) b.add(mesh(new THREE.BoxGeometry(0.7, spring, 0.8), navy, x - 0.3, spring / 2, zc + s * (R + 0.3)));
  // the striped arch face round the mouth (what the street sees), with a second navy rule outside it
  const face = new THREE.RingGeometry(R + 0.7, R + 3.4, 28, 1, 0, Math.PI);
  const fuv = face.attributes.uv as THREE.BufferAttribute;
  const fpos = face.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fpos.getX(i) / 3, fpos.getY(i) / 3);
  const fm = mesh(face, sm, x - 0.45, spring, zc);
  fm.rotation.y = -Math.PI / 2;
  b.add(fm);
  for (const s of [-1, 1]) {
    const leg = uvMetres(new THREE.BoxGeometry(0.3, spring, 2.7));
    b.add(mesh(leg, sm, x - 0.45, spring / 2, zc + s * (R + 2.05)));
  }
  const outer = new THREE.RingGeometry(R + 3.4, R + 3.9, 28, 1, 0, Math.PI);
  const om = mesh(outer, navy, x - 0.5, spring, zc);
  om.rotation.y = -Math.PI / 2;
  b.add(om);
  // the LED screen filling the arch: a rectangle in the upper mouth over the glass doors
  const led = HARRAHS_LED();
  const lw = R * 1.3;
  const lh = R * 0.68;
  const ly = spring + R * 0.36;
  const screen = mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshBasicMaterial({ map: led.tex }), x + 0.5, ly, zc);
  screen.rotation.y = -Math.PI / 2;
  b.add(screen);
  driveLed(b, led, x, ly, zc);
  // dark back wall in the mouth (above and around the screen), the glazed entrance under it
  const back = mesh(new THREE.CircleGeometry(R - 0.05, 24, 0, Math.PI), mat(0x1d1830, 0.6), x + 0.7, spring, zc);
  back.rotation.y = -Math.PI / 2;
  b.add(back);
  const glass = mat(0x2a2a3a, 0.15, 0.6, { emissive: 0xffd9a8, emissiveIntensity: 0.25 });
  const doors = mesh(new THREE.PlaneGeometry(R * 2 - 4.6, spring - 0.3), glass, x + 0.7, (spring - 0.3) / 2, zc);
  doors.rotation.y = -Math.PI / 2;
  b.add(doors);
  b.add(mesh(new THREE.BoxGeometry(0.4, 0.4, R * 2 - 4.4), gold, x + 0.5, spring - 0.1, zc));
  // the crest: cream scrollwork with gold balls, the teal globe on top
  const top = spring + R;
  const scroll = letterFace(b, 9, 3.4, (ctx, w, h) => {
    ctx.fillStyle = '#f2e6cc';
    ctx.strokeStyle = '#c9a04a';
    ctx.lineWidth = h * 0.05;
    const p = new Path2D();
    p.moveTo(w * 0.04, h * 0.98);
    p.bezierCurveTo(w * 0.02, h * 0.5, w * 0.22, h * 0.3, w * 0.3, h * 0.55);
    p.bezierCurveTo(w * 0.36, h * 0.75, w * 0.22, h * 0.82, w * 0.2, h * 0.66);
    p.bezierCurveTo(w * 0.3, h * 0.2, w * 0.42, h * 0.05, w * 0.5, h * 0.04);
    p.bezierCurveTo(w * 0.58, h * 0.05, w * 0.7, h * 0.2, w * 0.8, h * 0.66);
    p.bezierCurveTo(w * 0.78, h * 0.82, w * 0.64, h * 0.75, w * 0.7, h * 0.55);
    p.bezierCurveTo(w * 0.78, h * 0.3, w * 0.98, h * 0.5, w * 0.96, h * 0.98);
    p.closePath();
    ctx.fill(p);
    ctx.stroke(p);
  }, 0.4);
  b.add(placed(scroll, x - 0.1, top + 1.3, zc, -Math.PI / 2));
  for (const dz of [-4.2, -2.4, 2.4, 4.2]) b.add(mesh(new THREE.SphereGeometry(0.42, 10, 8), gold, x - 0.1, top + 0.25 + (Math.abs(dz) < 3 ? 1.6 : 0.3), zc + dz));
  const globe = mesh(new THREE.SphereGeometry(2.3, 32, 20), new THREE.MeshStandardMaterial({ map: globeTexture(), roughness: 0.35, metalness: 0.2, emissive: 0x1aa0b8, emissiveIntensity: 0.05 }), x + 0.6, top + 4.6, zc, true);
  b.nightGlow(globe.material as THREE.MeshStandardMaterial, 0.05, 0.6);
  b.add(globe);
  b.add(mesh(new THREE.TorusGeometry(2.45, 0.12, 8, 40), gold, x + 0.6, top + 4.6, zc)).rotation.x = Math.PI / 2;
  b.add(mesh(new THREE.CylinderGeometry(0.9, 1.3, 1.2, 16), gold, x + 0.6, top + 1.9, zc));
}

/** The fascia band: yellow → orange → magenta → purple with black dots (repeats every 12 m). */
function fasciaMat(b: WorldBuilder): THREE.MeshStandardMaterial {
  const tex = canvasTex(512, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#ffd23a');
    g.addColorStop(0.33, '#ff8a2a');
    g.addColorStop(0.66, '#e8308a');
    g.addColorStop(1, '#6a2aa8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // fold back so it tiles: mirror the second half
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    ctx.fillStyle = '#16101c';
    for (let x = 12; x < w; x += 26) {
      ctx.beginPath();
      ctx.arc(x, h / 2, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#16101c';
    ctx.fillRect(0, 0, w, 3);
    ctx.fillRect(0, h - 3, w, 3);
  }, true);
  const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.6 });
  b.nightGlow(m, 0.05, 0.55);
  return m;
}

/**
 * Carnaval Court's tent: a white membrane roof of peaks over the court x0…x1, z0…z1 on slim poles,
 * the gradient fascia round its edge, the CARNAVAL / Court badge on the Strip side, black railings
 * with gold-ball finials along the walk (gap at zGap).
 */
export function carnavalTent(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, zGap: number): void {
  const membrane = mat(0xf6f4f0, 0.8, 0, { side: THREE.DoubleSide, emissive: 0xffe2c0, emissiveIntensity: 0.05 });
  b.nightGlow(membrane as THREE.MeshStandardMaterial, 0.05, 0.4);
  const pole = mat(0x1a1a1e, 0.5, 0.6);
  const gold = mat(0xd9a93e, 0.3, 0.85);
  const eave = 6.0;
  const nx = 2;
  const nz = 2;
  const cw = (x1 - x0) / nx;
  const cd = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const cx = x0 + (i + 0.5) * cw;
      const cz = z0 + (k + 0.5) * cd;
      const peak = new THREE.ConeGeometry(Math.hypot(cw, cd) / 2, 3.4, 4, 1, true);
      peak.rotateY(Math.PI / 4);
      const pm = mesh(peak, membrane, cx, eave + 1.7, cz);
      pm.scale.set((cw / Math.hypot(cw, cd)) * Math.SQRT2, 1, (cd / Math.hypot(cw, cd)) * Math.SQRT2);
      b.add(pm);
      b.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, eave + 3.4, 8), pole, cx, (eave + 3.4) / 2, cz));
      b.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), gold, cx, eave + 3.55, cz));
    }
  }
  for (const [px, pz] of [
    [x0, z0],
    [x0, z1],
    [x1, z0],
    [x1, z1],
    [x0, (z0 + z1) / 2],
  ]) b.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, eave, 8), pole, px + 0.2, eave / 2, pz));
  // fascia band round the eave
  const fm = fasciaMat(b);
  const band = (w: number, cx: number, cz: number, ry: number) => {
    const g = new THREE.BoxGeometry(w, 1.1, 0.2);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * w) / 12);
    const me = mesh(g, fm, cx, eave - 0.2, cz);
    me.rotation.y = ry;
    b.add(me);
  };
  band(z1 - z0, x0, (z0 + z1) / 2, Math.PI / 2);
  band(x1 - x0, (x0 + x1) / 2, z0, 0);
  band(x1 - x0, (x0 + x1) / 2, z1, 0);
  // the badge: CARNAVAL in white caps on a purple lozenge, "Court" in yellow script
  const badge = letterFace(b, 8.4, 3.0, (ctx, w, h) => {
    ctx.fillStyle = '#4a1a8a';
    ctx.beginPath();
    ctx.moveTo(w * 0.06, h * 0.12);
    ctx.lineTo(w * 0.94, h * 0.12);
    ctx.lineTo(w * 0.99, h * 0.4);
    ctx.lineTo(w * 0.94, h * 0.68);
    ctx.lineTo(w * 0.06, h * 0.68);
    ctx.lineTo(w * 0.01, h * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = goldGradient(ctx, 0, h * 0.7);
    ctx.lineWidth = h * 0.04;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, 'CARNAVAL', 'block', w * 0.8, h * 0.4, 0.06);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('CARNAVAL', w / 2, h * 0.41);
    ctx.letterSpacing = '0px';
    fitFont(ctx, 'Court', 'script', w * 0.5, h * 0.42);
    ctx.lineWidth = h * 0.04;
    ctx.strokeStyle = '#3a1060';
    ctx.strokeText('Court', w * 0.6, h * 0.8);
    ctx.fillStyle = '#ffd23a';
    ctx.fillText('Court', w * 0.6, h * 0.8);
  }, 0.3);
  b.add(mesh(new THREE.BoxGeometry(0.3, 1.9, 8.0), mat(0x2a0e4a, 0.5), x0 - 0.05, eave + 1.0, zGap));
  b.add(placed(badge, x0 - 0.05, eave + 1.2, zGap, -Math.PI / 2));
  // railings with gold-ball finials along the walk, gap for the way in
  const rail = mat(0x141416, 0.45, 0.6);
  for (const [a, c] of [
    [z0, zGap - 2.5],
    [zGap + 2.5, z1],
  ]) {
    const len = c - a;
    b.box(x0 + 0.3, 0, (a + c) / 2, 0.08, 1.05, len, rail, false, false);
    b.add(mesh(new THREE.BoxGeometry(0.1, 0.08, len), rail, x0 + 0.3, 1.08, (a + c) / 2));
    for (let zz = a; zz <= c + 0.01; zz += len / Math.max(1, Math.round(len / 2.4))) {
      b.add(mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), rail, x0 + 0.3, 0.6, zz));
      b.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), gold, x0 + 0.3, 1.3, zz));
    }
  }
}
