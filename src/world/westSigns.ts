import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { viewer, type WorldBuilder } from './builder';
import { LedBoard } from './textures';
import { mat } from './props';
import { letterFace } from './signKit';
import { ArtCanvas } from './cosmoArt';

/**
 * Strip signs on the west side, rebuilt from the real ones:
 *  - Bellagio: the cream sandstone Italianate tower over the entrance of Bellagio Drive — a round arch
 *    with wrought-iron scrollwork and a clock that the drive passes through, a square LED screen in a
 *    bronze frame, BELLAGIO in bronze serif capitals with the swash B on a salmon band (halo-lit at
 *    night), a cornice and a small cupola.
 *  - The Cosmopolitan: the 65-ft four-sided LED marquee on a black granite plinth with the wordmark crown,
 *    a long LED canvas across the podium's Strip face (the "PAUSE" digital-art program) and the
 *    wordmark over the casino doors.
 *  - ARIA: the thin "Aria" logotype (a crossbar-less capital A, lowercase ria) along the curved tower's crown,
 *    silver by day, white at night.
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

/** "BELLAGIO" in bronze serif capitals with the swash B, on the salmon band (day map / halo glow map). */
function bellagioBand(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const W = 1024;
  const H = 160;
  const [c, ctx] = canvas(W, H);
  const [g, gx] = canvas(W, H);
  const band = ctx.createLinearGradient(0, 0, 0, H);
  band.addColorStop(0, '#e3a487');
  band.addColorStop(0.5, '#d9967a');
  band.addColorStop(1, '#c98468');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(120,60,40,${0.03 + Math.random() * 0.07})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 5, 1 + Math.random() * 1.5);
  }
  ctx.fillStyle = 'rgba(90,50,30,0.35)';
  ctx.fillRect(0, 6, W, 3);
  ctx.fillRect(0, H - 9, W, 3);
  gx.fillStyle = '#000';
  gx.fillRect(0, 0, W, H);
  const draw = (k: CanvasRenderingContext2D, glow: boolean) => {
    k.textAlign = 'center';
    k.textBaseline = 'middle';
    (k as unknown as { letterSpacing: string }).letterSpacing = '18px';
    // the swash B: a taller, italic initial
    k.font = 'italic 600 132px "Bodoni MT", "Didot", "Times New Roman", Georgia, serif';
    const bw = k.measureText('B').width;
    k.font = '500 104px "Bodoni MT", "Didot", "Times New Roman", Georgia, serif';
    const rest = k.measureText('ELLAGIO').width;
    const x0 = W / 2 - (bw + rest) / 2;
    const paint = (fill: string | CanvasGradient, dx: number, dy: number) => {
      k.fillStyle = fill;
      k.font = 'italic 600 132px "Bodoni MT", "Didot", "Times New Roman", Georgia, serif';
      k.textAlign = 'left';
      k.fillText('B', x0 + dx, H / 2 + 4 + dy);
      k.font = '500 104px "Bodoni MT", "Didot", "Times New Roman", Georgia, serif';
      k.fillText('ELLAGIO', x0 + bw + dx, H / 2 + 8 + dy);
    };
    if (glow) {
      k.shadowColor = '#ffcf8a';
      k.shadowBlur = 22;
      paint('#ffe7b8', 0, 0);
      k.shadowBlur = 0;
      paint('#fff0d0', 0, 0);
      return;
    }
    paint('rgba(60,30,10,0.55)', 4, 4);
    const gr = k.createLinearGradient(0, 24, 0, H - 24);
    gr.addColorStop(0, '#d9a66a');
    gr.addColorStop(0.5, '#8a5a2a');
    gr.addColorStop(1, '#5a3614');
    paint(gr, 0, 0);
  };
  draw(ctx, false);
  draw(gx, true);
  return { map: tex(c), glow: tex(g) };
}

/** Black wrought-iron scrollwork filling an arch head (w across, r tall), with the clock in the middle. */
function paintIronArch(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const R = Math.min(w / 2, h) * 0.98;
  ctx.strokeStyle = '#141210';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3, w * 0.012);
  // the arch rim and radial bars
  ctx.beginPath();
  ctx.arc(cx, h, R, Math.PI, 0);
  ctx.stroke();
  for (let i = 1; i < 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.32, h + Math.sin(a) * R * 0.32);
    ctx.lineTo(cx + Math.cos(a) * R, h + Math.sin(a) * R);
    ctx.stroke();
  }
  // C-scrolls between the bars
  ctx.lineWidth = Math.max(2, w * 0.008);
  for (let i = 0; i < 12; i++) {
    const a = Math.PI + ((i + 0.5) / 12) * Math.PI;
    for (const rr of [0.55, 0.8]) {
      const px = cx + Math.cos(a) * R * rr;
      const py = h + Math.sin(a) * R * rr;
      ctx.beginPath();
      ctx.arc(px, py, R * 0.075, a, a + Math.PI * 1.5);
      ctx.stroke();
    }
  }
  // inner ring with the clock
  ctx.lineWidth = Math.max(3, w * 0.012);
  ctx.beginPath();
  ctx.arc(cx, h, R * 0.32, Math.PI, 0);
  ctx.stroke();
  const cr = R * 0.2;
  const cy = h - cr - R * 0.06;
  ctx.fillStyle = '#f4ecd8';
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(3, w * 0.01);
  ctx.strokeStyle = '#2a2018';
  ctx.stroke();
  ctx.lineWidth = Math.max(2, w * 0.005);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * cr * 0.78, cy + Math.sin(a) * cr * 0.78);
    ctx.lineTo(cx + Math.cos(a) * cr * 0.92, cy + Math.sin(a) * cr * 0.92);
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(3, w * 0.009);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + cr * 0.45, cy - cr * 0.3);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - cr * 0.1, cy - cr * 0.72);
  ctx.stroke();
}

/**
 * The Bellagio's Strip sign: a cream sandstone Italianate tower standing over the entrance of
 * Bellagio Drive at (gx, zc). The drive passes through a round arch filled with black wrought-iron
 * scrollwork and a clock; above it a square LED screen in a bronze frame, BELLAGIO in bronze serif
 * capitals with the swash B on a salmon band, a cornice and a small cupola finial. Faces the
 * Boulevard (+x) with the screen and the name on the back too.
 */
export function buildBellagioGateway(b: WorldBuilder, gx = -22.8, zc = 105.5): void {
  const stone = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xe3cfae, roughness: 0.75, emissive: 0xffd9a8, emissiveIntensity: 0 }), 0, 0.16);
  const trim = new THREE.MeshStandardMaterial({ color: 0xcdb894, roughness: 0.8 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x6a4a26, roughness: 0.38, metalness: 0.85 });
  const cove = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0x3a2a14, emissive: 0xffd08a, emissiveIntensity: 0.3, roughness: 0.6 }), 0.3, 2.4);
  const D = 3.0; // thickness along x
  const W = 13.2; // across the drive (z)
  const archR = 4.6;
  const spring = 5.4;
  const wallTop = 11.8;

  // ---- the gateway wall with its arch (a shape in the z–y plane, extruded along x)
  const sh = new THREE.Shape();
  sh.moveTo(-W / 2, 0);
  sh.lineTo(-archR, 0);
  sh.lineTo(-archR, spring);
  sh.absarc(0, spring, archR, Math.PI, 0, true);
  sh.lineTo(archR, 0);
  sh.lineTo(W / 2, 0);
  sh.lineTo(W / 2, wallTop);
  sh.lineTo(-W / 2, wallTop);
  sh.closePath();
  const wall = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 20 });
  wall.translate(0, 0, -D / 2);
  wall.rotateY(-Math.PI / 2); // shape x → world z (mirrored is fine: it's symmetric), extrusion → x
  const st = new Pieces();
  st.geo(wall.toNonIndexed(), gx, 0, zc);
  // the screen storey above, a little narrower
  const upH = 9.6;
  st.box(gx, wallTop + upH / 2, zc, D - 0.3, upH, W - 1.6);
  // pilasters at the corners of both storeys, rusticated piers
  for (const s of [-1, 1]) {
    st.box(gx, wallTop / 2, zc + s * (W / 2 - 0.55), D + 0.35, wallTop, 1.1);
    st.box(gx, wallTop + upH / 2, zc + s * (W / 2 - 1.25), D + 0.05, upH, 0.9);
  }
  b.add(st.mesh(stone, true));
  const tr = new Pieces();
  for (const s of [-1, 1]) for (let y = 1.2; y < wallTop - 0.5; y += 1.25) tr.box(gx, y, zc + s * (W / 2 - 0.55), D + 0.42, 0.08, 1.16); // rustication
  for (const s of [-1, 1]) tr.box(gx, 0.35, zc + s * (W / 2 + archR) / 2, D + 0.6, 0.7, W / 2 - archR + 0.4); // plinth course under the piers
  tr.box(gx, wallTop + 0.2, zc, D + 0.8, 0.45, W + 0.6); // string course
  tr.box(gx, wallTop + upH + 0.3, zc, D + 0.9, 0.6, W - 0.6); // cornice
  tr.box(gx, wallTop + upH + 0.75, zc, D + 0.5, 0.3, W - 1.2);
  for (let z = -W / 2 + 1.0; z <= W / 2 - 1.0 + 0.01; z += 0.55) tr.box(gx + (D + 0.8) / 2 - 0.1, wallTop + upH - 0.08, zc + z, 0.25, 0.2, 0.2); // modillions
  // keystone and the arch's moulded rim (voussoirs)
  tr.box(gx, spring + archR + 0.3, zc, D + 0.3, 1.1, 0.9);
  for (let i = 1; i < 10; i++) {
    const a = (i / 10) * Math.PI;
    tr.box(gx, spring + Math.sin(a) * (archR + 0.2), zc + Math.cos(a) * (archR + 0.2), D + 0.2, 0.5, 0.25, 0);
  }
  // cupola: drum, dome and lantern finial
  const top = wallTop + upH + 0.9;
  tr.geo(new THREE.CylinderGeometry(1.5, 1.7, 1.6, 20), gx, top + 0.8, zc);
  b.add(tr.mesh(trim, true));
  const dome = new Pieces();
  dome.geo(new THREE.SphereGeometry(1.55, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), gx, top + 1.6, zc);
  dome.geo(new THREE.CylinderGeometry(0.12, 0.2, 1.4, 8), gx, top + 3.7, zc);
  dome.geo(new THREE.SphereGeometry(0.28, 10, 8), gx, top + 4.5, zc);
  b.add(dome.mesh(bronze, true));

  // ---- wrought iron and the clock in the arch head (both faces)
  const iron = letterFace(b, archR * 2, archR, paintIronArch, D);
  b.add(iron, gx, spring + archR / 2, zc, Math.PI / 2);

  // ---- the square LED screen in its bronze frame (both faces) and the salmon name band
  const ledS = 6.4;
  const ledY = wallTop + 0.9 + ledS / 2;
  const fr = new Pieces();
  fr.box(gx, ledY, zc, D + 0.1, ledS + 0.6, ledS + 0.6);
  b.add(fr.mesh(bronze));
  const led = new LedBoard('BELLAGIO', ['FOUNTAINS EVERY 15 MIN AFTER 8PM', 'O • CIRQUE DU SOLEIL', 'CONSERVATORY: POSTCARDS FROM CHRISTMAS', 'VIA BELLAGIO SHOPS', 'RESORT & CASINO'], ['#c9a24a', '#1f6f5a', '#8a1e2e', '#2c5fa8', '#5a3a8a'], 320, 320);
  const scr = new THREE.MeshBasicMaterial({ map: led.tex });
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ledS, ledS), scr);
    m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    b.add(m, gx + s * ((D + 0.1) / 2 + 0.02), ledY, zc);
  }
  const bandY = ledY + ledS / 2 + 1.25;
  const bt = bellagioBand();
  const bandMat = b.nightGlow(new THREE.MeshStandardMaterial({ map: bt.map, emissiveMap: bt.glow, emissive: 0xffd890, emissiveIntensity: 0.04, roughness: 0.6, metalness: 0.1 }), 0.04, 1.35);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W - 3.4, 1.6), bandMat);
    m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    b.add(m, gx + s * ((D - 0.3) / 2 + 0.02), bandY, zc);
  }
  // warm cove lines under the cornice and the string course
  const cv = new Pieces();
  for (const s of [-1, 1]) {
    cv.box(gx + s * ((D + 0.8) / 2 + 0.02), wallTop - 0.02, zc, 0.06, 0.06, W + 0.5);
    cv.box(gx + s * ((D + 0.9) / 2 + 0.02), wallTop + upH - 0.02, zc, 0.06, 0.06, W - 0.7);
  }
  b.add(cv.mesh(cove));

  // ---- flower urns either side of the arch at the sidewalk
  const urnG = new Pieces();
  const flowers = new Pieces();
  for (const s of [-1, 1]) {
    const uz = zc + s * (W / 2 + 0.9);
    urnG.geo(new THREE.CylinderGeometry(0.75, 0.45, 1.0, 14), gx + 1.2, 0.5, uz);
    urnG.geo(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 14), gx + 1.2, 1.05, uz);
    for (let i = 0; i < 9; i++) flowers.geo(new THREE.IcosahedronGeometry(0.22, 0), gx + 1.2 + Math.cos(i * 2.4) * 0.45, 1.25 + (i % 3) * 0.08, uz + Math.sin(i * 2.4) * 0.45);
  }
  b.add(urnG.mesh(trim, true));
  b.add(flowers.mesh(new THREE.MeshStandardMaterial({ color: 0xd23a4a, roughness: 0.7, emissive: 0x5a0a10, emissiveIntensity: 0.2 })));

  // colliders: the two piers and the solid storeys over the arch
  const pier = W / 2 - archR;
  for (const s of [-1, 1]) b.collider(gx - D / 2 - 0.3, gx + D / 2 + 0.3, zc + s * archR + (s < 0 ? -pier : 0), zc + s * archR + (s > 0 ? pier : 0), 0, top + 4, true);
  b.collider(gx - D / 2, gx + D / 2, zc - W / 2, zc + W / 2, spring + archR, top + 4, true);
  b.every((_dt, t) => {
    if (near(gx, zc, 230)) led.draw(t);
  });
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
  // lowercase for the "Aria" logotype (x-height 0.62 of the capital, as on the real sign: A 26 ft, ria 16 ft)
  r: {
    w: 0.34,
    s: [
      [0.03, 0, 0.03, 0.62],
      [0.03, 0.42, 0.1, 0.54],
      [0.1, 0.54, 0.2, 0.61],
      [0.2, 0.61, 0.34, 0.6],
    ],
  },
  i: {
    w: 0.08,
    s: [
      [0.04, 0, 0.04, 0.62],
      [0.04, 0.8, 0.04, 0.88],
    ],
  },
  a: {
    w: 0.64,
    s: [
      [0.580, 0.310, 0.541, 0.465],
      [0.541, 0.465, 0.435, 0.578],
      [0.435, 0.578, 0.290, 0.620],
      [0.290, 0.620, 0.145, 0.578],
      [0.145, 0.578, 0.039, 0.465],
      [0.039, 0.465, 0.000, 0.310],
      [0.000, 0.310, 0.039, 0.155],
      [0.039, 0.155, 0.145, 0.042],
      [0.145, 0.042, 0.290, 0.000],
      [0.290, 0.000, 0.435, 0.042],
      [0.435, 0.042, 0.541, 0.155],
      [0.541, 0.155, 0.580, 0.310],
      [0.6, 0, 0.6, 0.62],
    ],
  },
};

/** The thin "Aria" logotype in channel letters along the concave face of the curved tower (centre cx, cz; face radius r). */
export function buildAriaSign(b: WorldBuilder, cx = -60, cz = 268, r = 53.2, aMid = Math.PI * 1.05, y0 = 47.6, size = 5.6): void {
  const face = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xe9eef4, roughness: 0.28, metalness: 0.55, emissive: 0xffffff, emissiveIntensity: 0.12 }), 0.12, 2.1);
  const back = new THREE.MeshStandardMaterial({ color: 0x8a96a4, roughness: 0.3, metalness: 0.8 });
  const word = 'Aria';
  const t = size * 0.075; // stroke thickness
  const gap = size * 0.2;
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
