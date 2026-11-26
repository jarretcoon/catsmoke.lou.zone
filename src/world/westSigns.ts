import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { viewer, type WorldBuilder } from './builder';
import { LedBoard } from './textures';
import { mat } from './props';
import { ArtCanvas } from './cosmoArt';

/**
 * Strip signs on the west side, rebuilt from the real ones:
 *  - Bellagio: the Italianate travertine pylon at the lake's south-east corner — stone piers with gilded
 *    capitals, a big LED board over two smaller panels, a frieze with "BELLAGIO" in gold channel letters
 *    (halo-lit at night), stacked cornices with warm cove light, a pediment and gilt finials.
 *  - The Cosmopolitan: the 65-ft four-sided LED marquee on a black granite plinth with the wordmark crown,
 *    a long LED canvas across the podium's Strip face (the "PAUSE" digital-art program) and the
 *    wordmark over the casino doors.
 *  - ARIA: the crossbar-less "ARIA" letters along the curved tower's crown, silver by day, white at night.
 * LED canvases only redraw while the camera is close enough to read them.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
function tex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Merge boxes/geometries into one mesh (one draw). */
class Pieces {
  private readonly g: THREE.BufferGeometry[] = [];
  box(x: number, y: number, z: number, w: number, h: number, d: number, ry = 0): this {
    const b = new THREE.BoxGeometry(w, h, d);
    if (ry) b.rotateY(ry);
    b.translate(x, y, z);
    this.g.push(b);
    return this;
  }
  geo(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0): this {
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.g.push(g);
    return this;
  }
  mesh(m: THREE.Material, cast = false): THREE.Mesh {
    const list = this.g.map((x) => (x.index ? x.toNonIndexed() : x));
    const me = new THREE.Mesh(mergeGeometries(list, false)!, m);
    me.castShadow = cast;
    me.receiveShadow = true;
    return me;
  }
}

const near = (x: number, z: number, r: number) => {
  const c = viewer.cam;
  return (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z) < r * r;
};

// ================================================================================================
// Bellagio
// ================================================================================================

function bellagioFrieze(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const W = 1024;
  const H = 176;
  const [c, ctx] = canvas(W, H);
  const [g, gx] = canvas(W, H);
  ctx.fillStyle = '#e8dbc0';
  ctx.fillRect(0, 0, W, H);
  // travertine pores and banding
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(150,124,84,${0.05 + Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 6, 1 + Math.random() * 1.5);
  }
  ctx.fillStyle = 'rgba(120,96,60,0.25)';
  ctx.fillRect(0, 10, W, 3);
  ctx.fillRect(0, H - 13, W, 3);
  gx.fillStyle = '#000';
  gx.fillRect(0, 0, W, H);
  const draw = (k: CanvasRenderingContext2D, glow: boolean) => {
    k.textAlign = 'center';
    k.textBaseline = 'middle';
    k.font = 'bold 118px "Times New Roman", Georgia, serif';
    (k as unknown as { letterSpacing: string }).letterSpacing = '22px';
    if (glow) {
      k.shadowColor = '#ffd27a';
      k.shadowBlur = 26;
      k.fillStyle = '#fff0c8';
      k.fillText('BELLAGIO', W / 2 + 11, H / 2 + 6, W * 0.92);
      k.shadowBlur = 0;
      k.fillStyle = '#ffe9b0';
      k.fillText('BELLAGIO', W / 2 + 11, H / 2 + 6, W * 0.92);
      return;
    }
    k.fillStyle = 'rgba(60,40,10,0.55)';
    k.fillText('BELLAGIO', W / 2 + 15, H / 2 + 10, W * 0.92);
    const gr = k.createLinearGradient(0, 30, 0, H - 30);
    gr.addColorStop(0, '#fff1a8');
    gr.addColorStop(0.45, '#e2b54a');
    gr.addColorStop(1, '#9a6a1e');
    k.fillStyle = gr;
    k.fillText('BELLAGIO', W / 2 + 11, H / 2 + 6, W * 0.92);
  };
  draw(ctx, false);
  draw(gx, true);
  return { map: tex(c), glow: tex(g) };
}

function posterO(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 200);
  const g = ctx.createLinearGradient(0, 0, 0, 200);
  g.addColorStop(0, '#04122e');
  g.addColorStop(1, '#0a4a7a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 200);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(140,220,255,${0.08 + Math.random() * 0.18})`;
    ctx.beginPath();
    const y = 120 + Math.random() * 80;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y - 10, 170, y + 12, 256, y - 4);
    ctx.stroke();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 12;
  ctx.shadowColor = '#7fd8ff';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.ellipse(128, 82, 44, 52, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 19px Georgia, serif';
  ctx.fillText('CIRQUE DU SOLEIL', 128, 162);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#bfe8ff';
  ctx.fillText('NIGHTLY • BELLAGIO THEATRE', 128, 184);
  return tex(c);
}

function posterConservatory(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 200);
  const g = ctx.createLinearGradient(0, 0, 0, 200);
  g.addColorStop(0, '#0f3a24');
  g.addColorStop(1, '#1c5a36');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 200);
  // tree
  ctx.fillStyle = '#2f8a4a';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(128, 18 + i * 26);
    ctx.lineTo(128 - 26 - i * 12, 62 + i * 26);
    ctx.lineTo(128 + 26 + i * 12, 62 + i * 26);
    ctx.fill();
  }
  const orn = ['#ff3b3b', '#ffd24d', '#ffffff', '#3bb0ff'];
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = orn[i % 4];
    ctx.beginPath();
    ctx.arc(128 + (Math.random() - 0.5) * (30 + i * 3), 40 + i * 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.arc(128, 16, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 17px Georgia, serif';
  ctx.fillText('CONSERVATORY', 128, 168);
  ctx.font = 'italic 14px Georgia, serif';
  ctx.fillStyle = '#ffe7a8';
  ctx.fillText('Postcards From Christmas', 128, 188);
  return tex(c);
}

/** The Bellagio's Strip pylon at the lake's south-east corner, facing the Boulevard (+x). */
export function buildBellagioSign(b: WorldBuilder, sx = -23.4, sz = 93.6): void {
  const stone = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xe6d8bb, roughness: 0.72, emissive: 0xffd9a8, emissiveIntensity: 0 }), 0, 0.2);
  const darkStone = new THREE.MeshStandardMaterial({ color: 0xcdbb98, roughness: 0.8 });
  const gilt = new THREE.MeshStandardMaterial({ color: 0xd9ae4a, roughness: 0.28, metalness: 0.9, emissive: 0x6a4a10, emissiveIntensity: 0.15 });
  const cove = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x3a2a14, emissive: 0xffd08a, emissiveIntensity: 0.4, roughness: 0.6 }), 0.35, 2.6);
  const ys = 2.45; // top of the plinth
  const W = 9.6; // along z
  const fx = sx + 0.86; // front face of the screen wall

  // ---- plinth with a moulded cap and a flower bed on top
  const st = new Pieces();
  st.box(sx, 1.1, sz, 3.2, 2.2, W + 0.2);
  st.box(sx + 0.35, ys + 5.2, sz, 1.0, 10.4, W - 2.6); // screen wall
  // piers
  for (const s of [-1, 1]) {
    const pz = sz + s * (W / 2 - 0.75);
    st.box(sx + 0.35, ys + 0.35, pz, 1.7, 0.7, 1.7);
    st.box(sx + 0.35, ys + 6.4, pz, 1.35, 12.8, 1.35);
    for (let y = ys + 1.6; y < ys + 12.2; y += 1.3) st.box(sx + 0.36, y, pz, 1.42, 0.06, 1.42); // rustication
  }
  st.box(sx + 0.35, ys + 12.55, sz, 1.3, 0.3, W - 0.2); // architrave
  st.box(sx + 0.35, ys + 14.05, sz, 1.0, 2.7, W - 1.2); // frieze block
  st.box(sx + 0.35, ys + 16.35, sz, 0.9, 1.0, W - 3.6); // attic
  b.add(st.mesh(stone, true));
  const ds = new Pieces();
  ds.box(sx, ys - 0.05, sz, 3.5, 0.3, W + 0.6);
  ds.box(sx + 0.35, ys + 12.85, sz, 2.0, 0.34, W + 0.5); // lower cornice
  ds.box(sx + 0.35, ys + 15.6, sz, 2.3, 0.5, W + 1.0); // upper cornice
  for (let z = sz - W / 2; z <= sz + W / 2 + 0.01; z += 0.6) ds.box(sx + 1.25, ys + 15.25, z, 0.3, 0.2, 0.22); // modillions
  // pediment (a triangular prism)
  const ped = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
  ped.rotateX(Math.PI / 2);
  ped.rotateZ(Math.PI / 2);
  ped.scale(1.0, 1.25, W * 0.52);
  ds.geo(ped, sx + 0.35, ys + 17.35, sz);
  b.add(ds.mesh(darkStone, true));

  // ---- gilt: capitals, screen frames, finials, crest
  const gl = new Pieces();
  for (const s of [-1, 1]) {
    const pz = sz + s * (W / 2 - 0.75);
    gl.box(sx + 0.35, ys + 12.1, pz, 1.55, 0.35, 1.55);
    gl.geo(new THREE.CylinderGeometry(0.22, 0.38, 0.6, 12), sx + 0.35, ys + 16.5, pz);
    gl.geo(new THREE.SphereGeometry(0.34, 14, 10), sx + 0.35, ys + 17.1, pz);
  }
  gl.geo(new THREE.SphereGeometry(0.42, 14, 10), sx + 0.35, ys + 18.6, sz);
  gl.geo(new THREE.ConeGeometry(0.14, 0.7, 8), sx + 0.35, ys + 19.2, sz);
  const frame = (y: number, z: number, w: number, h: number) => {
    gl.box(fx + 0.03, y + h / 2 + 0.06, z, 0.1, 0.12, w + 0.24);
    gl.box(fx + 0.03, y - h / 2 - 0.06, z, 0.1, 0.12, w + 0.24);
    gl.box(fx + 0.03, y, z - w / 2 - 0.06, 0.1, h, 0.12);
    gl.box(fx + 0.03, y, z + w / 2 + 0.06, 0.1, h, 0.12);
  };
  frame(ys + 8.3, sz, 6.2, 3.7);
  frame(ys + 3.6, sz - 1.6, 2.9, 2.25);
  frame(ys + 3.6, sz + 1.6, 2.9, 2.25);
  b.add(gl.mesh(gilt));

  // ---- cove light under each cornice and along the plinth cap
  const cv = new Pieces();
  cv.box(sx + 1.2, ys + 12.62, sz, 0.08, 0.08, W + 0.3);
  cv.box(sx + 1.4, ys + 15.3, sz, 0.08, 0.08, W + 0.8);
  cv.box(sx + 1.66, ys + 0.12, sz, 0.08, 0.08, W + 0.4);
  b.add(cv.mesh(cove));

  // ---- frieze with the gold channel letters (halo-lit at night)
  const fr = bellagioFrieze();
  const friezeMat = b.nightGlow(new THREE.MeshStandardMaterial({ map: fr.map, emissiveMap: fr.glow, emissive: 0xffd890, emissiveIntensity: 0.05, roughness: 0.55, metalness: 0.15 }), 0.05, 1.5);
  const frieze = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.4, 1.5), friezeMat);
  frieze.rotation.y = Math.PI / 2;
  b.add(frieze, sx + 0.87, ys + 14.05, sz);

  // ---- LED board + the two lower panels (the "O" poster and the Conservatory show)
  const led = new LedBoard('BELLAGIO', ['FOUNTAINS EVERY 15 MIN AFTER 8PM', 'O • CIRQUE DU SOLEIL', 'CONSERVATORY: POSTCARDS FROM CHRISTMAS', 'VIA BELLAGIO SHOPS', 'RESORT & CASINO'], ['#c9a24a', '#1f6f5a', '#8a1e2e', '#2c5fa8', '#5a3a8a'], 512, 288);
  const screen = (t: THREE.Texture, y: number, z: number, w: number, h: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
    m.rotation.y = Math.PI / 2;
    b.add(m, fx + 0.02, y, z);
  };
  screen(led.tex, ys + 8.3, sz, 6.2, 3.7);
  screen(posterO(), ys + 3.6, sz - 1.6, 2.9, 2.25);
  screen(posterConservatory(), ys + 3.6, sz + 1.6, 2.9, 2.25);
  b.every((_dt, t) => {
    if (near(sx, sz, 230)) led.draw(t);
  });

  // ---- flower bed on the plinth (petunias / mums in Bellagio's reds, golds and whites)
  const fl = new Pieces();
  const lf = new Pieces();
  for (let i = 0; i < 70; i++) {
    const z = sz - W / 2 + 0.3 + (i / 69) * (W - 0.6);
    const x = sx + 0.8 + Math.sin(i * 7.3) * 0.5;
    if (i % 3 === 0) lf.geo(new THREE.IcosahedronGeometry(0.26, 0), x, ys + 0.2, z);
    else fl.geo(new THREE.IcosahedronGeometry(0.17 + (i % 4) * 0.02, 0), x, ys + 0.24 + (i % 2) * 0.1, z);
  }
  b.add(fl.mesh(new THREE.MeshStandardMaterial({ color: 0xd23a4a, roughness: 0.7, emissive: 0x5a0a10, emissiveIntensity: 0.2 })));
  b.add(lf.mesh(new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.8 })));

  b.collider(sx - 1.7, sx + 1.75, sz - W / 2 - 0.4, sz + W / 2 + 0.4, 0, ys + 19, true);
  b.light(0xffd9a0, 10, 18, sx + 5, 3, sz, 0);
}

// ================================================================================================
// The Cosmopolitan
// ================================================================================================

function wordmark(lines: Array<{ text: string; size: number; weight?: string; spacing: number; color?: string }>, w: number, h: number, bg: string | null): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  const total = lines.reduce((a, l) => a + l.size * 1.25, 0);
  let y = (h - total) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of lines) {
    y += l.size * 0.62;
    ctx.font = `${l.weight ?? '300'} ${l.size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${l.spacing}px`;
    ctx.shadowColor = '#d9b8ff';
    ctx.shadowBlur = 14;
    ctx.fillStyle = l.color ?? '#ffffff';
    ctx.fillText(l.text, w / 2 + l.spacing / 2, y, w * 0.94);
    ctx.shadowBlur = 0;
    ctx.fillText(l.text, w / 2 + l.spacing / 2, y, w * 0.94);
    y += l.size * 0.63;
  }
  return tex(c);
}

/**
 * The Cosmopolitan's Strip signage: the four-sided LED marquee, the podium's LED canvas and the
 * wordmark over the doors. `podX` is the podium's Strip face; the marquee stands at (mx, mz).
 */
export function buildCosmoSigns(b: WorldBuilder, podX = -24, mx = -22.4, mz = 157.6): void {
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.18, metalness: 0.6 });
  const granite = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.35, metalness: 0.2 });
  const edge = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x1a1024, emissive: 0xc77dff, emissiveIntensity: 0.6, roughness: 0.4 }), 0.6, 2.4);

  // ---- marquee pylon: plinth, LED shaft (four faces), black-glass crown with the wordmark
  const D = 2.6; // x depth
  const Wd = 6.2; // z width
  const H0 = 1.8;
  const HL = 17.5;
  const pl = new Pieces();
  pl.box(mx, H0 / 2, mz, D + 1.2, H0, Wd + 1.2);
  b.add(pl.mesh(granite, true));
  const art = new ArtCanvas(256, 640, {
    slides: [
      { lines: ['THE', 'COSMOPOLITAN'], sub: 'OF LAS VEGAS' },
      { lines: ['JUST THE RIGHT', 'AMOUNT OF', 'WRONG'] },
      { lines: ['MARQUEE'], sub: 'NIGHTCLUB • DAYCLUB' },
      { lines: ['THE', 'CHANDELIER'], sub: 'THREE LEVELS • 2,000,000 CRYSTALS' },
      { lines: ['BOULEVARD', 'POOL'], sub: 'OVER THE STRIP' },
    ],
  });
  const ledMat = new THREE.MeshBasicMaterial({ map: art.tex });
  // Four LED faces: the narrow ±z faces show a slice of the same canvas (BoxGeometry faces: +x −x +y −y +z −z)
  const faces: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 4; f++) {
    const wide = f % 2 === 0;
    const g = new THREE.PlaneGeometry(wide ? Wd : D, HL);
    if (!wide) {
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 0.3 + uv.getX(i) * (D / Wd));
    }
    g.translate(0, 0, (wide ? D : Wd) / 2);
    g.rotateY(Math.PI / 2 + (f * Math.PI) / 2);
    g.translate(mx, H0 + HL / 2, mz);
    faces.push(g);
  }
  b.add(new THREE.Mesh(mergeGeometries(faces, false)!, ledMat));
  // black frame edges with the violet LED trim the real one wears
  const fr = new Pieces();
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) fr.box(mx + (dx * D) / 2, H0 + HL / 2, mz + (dz * Wd) / 2, 0.22, HL + 0.1, 0.22);
  const crownY = H0 + HL + 1.6;
  fr.box(mx, H0 + HL + 0.1, mz, D + 0.5, 0.2, Wd + 0.5);
  fr.box(mx, crownY + 1.62, mz, D + 0.5, 0.18, Wd + 0.5);
  b.add(fr.mesh(black));
  const tr = new Pieces();
  tr.box(mx, H0 + HL + 0.24, mz, D + 0.56, 0.06, Wd + 0.56);
  tr.box(mx, crownY + 1.76, mz, D + 0.56, 0.06, Wd + 0.56);
  tr.box(mx, H0 + 0.06, mz, D + 1.26, 0.06, Wd + 1.26);
  b.add(tr.mesh(edge));
  const crownTex = wordmark(
    [
      { text: 'THE', size: 30, spacing: 14 },
      { text: 'COSMOPOLITAN', size: 66, spacing: 10, weight: '400' },
      { text: 'OF LAS VEGAS', size: 22, spacing: 12, color: '#e6d0ff' },
    ],
    1024,
    256,
    '#07060c'
  );
  const crownMat = new THREE.MeshBasicMaterial({ map: crownTex });
  b.add(new THREE.Mesh(new THREE.BoxGeometry(D + 0.4, 3.0, Wd + 0.4), black), mx, crownY, mz);
  const cf: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(Wd + 0.2, 1.55);
    g.rotateY((s * Math.PI) / 2);
    g.translate(mx + s * (D / 2 + 0.215), crownY, mz);
    cf.push(g);
  }
  b.add(new THREE.Mesh(mergeGeometries(cf, false)!, crownMat));
  b.collider(mx - D / 2 - 0.6, mx + D / 2 + 0.6, mz - Wd / 2 - 0.6, mz + Wd / 2 + 0.6, 0, crownY + 2, true);

  // ---- the podium's LED canvas (digital art + the name sweeping past) above the entrance canopy
  const bandL = 40;
  const band = new ArtCanvas(1024, 96, { banner: 'THE COSMOPOLITAN  •  JUST THE RIGHT AMOUNT OF WRONG  •  MARQUEE  •  THE CHANDELIER  •  ' });
  const bandMesh = new THREE.Mesh(new THREE.PlaneGeometry(bandL, 3.6), new THREE.MeshBasicMaterial({ map: band.tex }));
  bandMesh.rotation.y = Math.PI / 2;
  b.add(bandMesh, podX + 1.16, 8.45, 182);
  const bf = new Pieces();
  bf.box(podX + 1.08, 8.45, 182, 0.12, 4.0, bandL + 0.4);
  b.add(bf.mesh(black));
  const bt = new Pieces();
  bt.box(podX + 1.2, 6.58, 182, 0.06, 0.06, bandL + 0.4);
  bt.box(podX + 1.2, 10.32, 182, 0.06, 0.06, bandL + 0.4);
  b.add(bt.mesh(edge));

  // ---- wordmark over the casino doors
  const doorTex = wordmark([{ text: 'THE COSMOPOLITAN', size: 64, spacing: 16, weight: '400' }], 1024, 96, null);
  const doorMat = new THREE.MeshBasicMaterial({ map: doorTex, transparent: true, depthWrite: false });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.95), doorMat);
  door.rotation.y = Math.PI / 2;
  b.add(door, podX + 1.12, 5.75, 182);

  b.every((_dt, t) => {
    const c = viewer.cam;
    const d2 = (c.x - mx) * (c.x - mx) + (c.z - 182) * (c.z - 182);
    if (d2 < 260 * 260) {
      art.draw(t);
      band.draw(t + 3);
    }
  });
}

// ================================================================================================
// ARIA
// ================================================================================================

/** Stroke glyphs (unit height) for the ARIA wordmark: thin, geometric, A without a crossbar. */
const GLYPHS: Record<string, { w: number; s: Array<[number, number, number, number]> }> = {
  A: {
    w: 0.78,
    s: [
      [0, 0, 0.39, 1],
      [0.39, 1, 0.78, 0],
    ],
  },
  R: {
    w: 0.62,
    s: [
      [0, 0, 0, 1],
      [0, 1, 0.38, 1],
      [0.38, 1, 0.55, 0.9],
      [0.55, 0.9, 0.58, 0.76],
      [0.58, 0.76, 0.52, 0.62],
      [0.52, 0.62, 0.36, 0.54],
      [0.36, 0.54, 0, 0.54],
      [0.26, 0.54, 0.62, 0],
    ],
  },
  I: { w: 0.08, s: [[0.04, 0, 0.04, 1]] },
};

/** "ARIA" in channel letters along the concave face of the curved tower (centre cx, cz; face radius r). */
export function buildAriaSign(b: WorldBuilder, cx = -60, cz = 268, r = 53.2, aMid = Math.PI * 1.05, y0 = 47.6, size = 5.6): void {
  const face = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xe9eef4, roughness: 0.28, metalness: 0.55, emissive: 0xffffff, emissiveIntensity: 0.12 }), 0.12, 2.1);
  const back = new THREE.MeshStandardMaterial({ color: 0x8a96a4, roughness: 0.3, metalness: 0.8 });
  const word = 'ARIA';
  const t = size * 0.085; // stroke thickness
  const gap = size * 0.42;
  let total = 0;
  for (const ch of word) total += GLYPHS[ch].w * size;
  total += gap * (word.length - 1);
  const parts: THREE.BufferGeometry[] = [];
  const rails: THREE.BufferGeometry[] = [];
  let u = -total / 2;
  for (const ch of word) {
    const gph = GLYPHS[ch];
    const wch = gph.w * size;
    const uc = u + wch / 2;
    // each letter sits on the arc at its own angle, square to the facade
    const a = aMid + uc / r;
    const nx = -Math.cos(a);
    const nz = -Math.sin(a);
    const px = cx + Math.cos(a) * r;
    const pz = cz + Math.sin(a) * r;
    const ry = Math.atan2(nx, nz);
    for (const [x0, y0s, x1, y1] of gph.s) {
      const lx0 = x0 * size - wch / 2;
      const lx1 = x1 * size - wch / 2;
      const ly0 = y0s * size;
      const ly1 = y1 * size;
      const len = Math.hypot(lx1 - lx0, ly1 - ly0);
      const g = new THREE.BoxGeometry(t, len + t * 0.6, 0.35);
      g.rotateZ(-Math.atan2(lx1 - lx0, ly1 - ly0));
      g.translate((lx0 + lx1) / 2, (ly0 + ly1) / 2 + y0, 0.35);
      g.rotateY(ry);
      g.translate(px, 0, pz);
      parts.push(g);
    }
    // mounting rails behind each letter
    const rg = new THREE.BoxGeometry(wch + 0.4, 0.16, 0.2);
    for (const ry0 of [size * 0.2, size * 0.8]) {
      const gg = rg.clone();
      gg.translate(0, y0 + ry0, 0.08);
      gg.rotateY(ry);
      gg.translate(px, 0, pz);
      rails.push(gg);
    }
    u += wch + gap;
  }
  const m = new THREE.Mesh(mergeGeometries(parts, false)!, face);
  b.add(m);
  b.add(new THREE.Mesh(mergeGeometries(rails, false)!, back));
}
