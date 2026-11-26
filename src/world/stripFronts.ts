import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { cypressTree, mat, mesh, palmTree } from './props';
import { canvasTex } from './themedKit';
import { type InteriorKind, interiorCell, interiorMaterial, interiorPaneGeometry, PANE, registerStreetTick } from './streetTextures';

/*
 * Street faces for the big blank podium walls along the central Strip, after real street-level photos:
 *  - The Shops at Crystals (CityCenter): Libeskind's tilted stainless-steel and glass shards that fold up
 *    off the sidewalk, a glass storefront band under them and a tall glass entry between two leaning
 *    shards, the CRYSTALS name over the doors.
 *  - The Forum Shops at Caesars: the classical street wall either side of the temple-front entrance:
 *    plinth, Corinthian pilasters with gilded capitals, arched windows and statue niches, entablature,
 *    cornice and a roof balustrade with statues, cypresses in front.
 *  - The Palazzo: an arcade of arched, lit boutique windows between stone pilasters, a plain frieze
 *    (THE PALAZZO letters sit on it), cornice and balustrade with urns, palms in planters at the walk.
 * Everything is plain static geometry with shared materials (the static batch folds the plain colours
 * into its shared vertex-colour materials); the shop glass is one canvas material that glows at night.
 */

// ---------------------------------------------------------------- shared pieces

let shopGlassMat: THREE.MeshStandardMaterial | null = null;
/** Boutique glass: lit interiors with displays behind dark bronze mullions; reflective by day, glowing at night. */
function shopGlass(b: WorldBuilder): THREE.MeshStandardMaterial {
  if (shopGlassMat) return shopGlassMat;
  const W = 256;
  const H = 256;
  const interior = (ctx: CanvasRenderingContext2D, reflect: boolean) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fff3dc');
    g.addColorStop(0.55, '#f3dcb4');
    g.addColorStop(1, '#c99d6a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // boutique bays (one each side of the centre mullion): a lit wall niche with a single bag on
    // a shelf, a mannequin in a dress and a low plinth with shoes, all in the window light
    const dress = ['#1d1d24', '#b0262c', '#e9e2d4', '#2c4f7c'];
    const bag = ['#c9a24a', '#7a3d6e', '#1d1d24', '#b5652b'];
    for (let k = 0; k < 2; k++) {
      const x0 = k * 128;
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(x0 + 22, 64, 56, 84);
      ctx.fillStyle = '#d8c3a0';
      ctx.fillRect(x0 + 22, 126, 56, 5);
      ctx.fillStyle = bag[k * 2];
      ctx.beginPath();
      ctx.moveTo(x0 + 36, 126);
      ctx.lineTo(x0 + 64, 126);
      ctx.lineTo(x0 + 60, 104);
      ctx.lineTo(x0 + 40, 104);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = bag[k * 2];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x0 + 50, 104, 8, Math.PI, 0);
      ctx.stroke();
      // mannequin
      const mx = x0 + 96;
      ctx.fillStyle = '#e9d9c4';
      ctx.beginPath();
      ctx.arc(mx, 122, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dress[k * 2 + 1];
      ctx.beginPath();
      ctx.moveTo(mx - 8, 132);
      ctx.lineTo(mx + 8, 132);
      ctx.lineTo(mx + 18, 206);
      ctx.lineTo(mx - 18, 206);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3a3a40';
      ctx.fillRect(mx - 1, 206, 3, 30);
      ctx.fillRect(mx - 12, 234, 24, 3);
      // plinth with shoes
      ctx.fillStyle = '#f7efe2';
      ctx.fillRect(x0 + 24, 208, 44, 30);
      ctx.fillStyle = bag[k * 2 + 1];
      ctx.fillRect(x0 + 30, 200, 14, 8);
      ctx.fillRect(x0 + 48, 200, 14, 8);
    }
    // spotlights in the ceiling
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) ctx.fillRect(22 + i * 42, 54, 10, 3);
    if (reflect) {
      // daylight: the glass mirrors the sky and the street, so the interior reads darker
      const r = ctx.createLinearGradient(0, 0, W, H);
      r.addColorStop(0, 'rgba(150,175,200,0.72)');
      r.addColorStop(0.5, 'rgba(70,82,96,0.62)');
      r.addColorStop(1, 'rgba(120,140,160,0.7)');
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, W, H);
    }
    // bronze frame, mullion and transom
    ctx.fillStyle = reflect ? '#3a2c1e' : '#000000';
    ctx.fillRect(0, 0, 10, H);
    ctx.fillRect(W - 10, 0, 10, H);
    ctx.fillRect(0, 0, W, 10);
    ctx.fillRect(0, H - 14, W, 14);
    ctx.fillRect(W / 2 - 4, 48, 8, H);
    ctx.fillRect(0, 44, W, 8);
  };
  const map = canvasTex(W, H, (ctx) => interior(ctx, true), true);
  const glow = canvasTex(W, H, (ctx) => interior(ctx, false), true);
  shopGlassMat = new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.42, metalness: 0.05 });
  b.nightGlow(shopGlassMat, 0.1, 0.55);
  return shopGlassMat;
}

let lampMat: THREE.MeshStandardMaterial | null = null;
/** Warm wall sconces: an amber glass by day, glowing at night. */
function sconceMat(b: WorldBuilder): THREE.MeshStandardMaterial {
  if (lampMat) return lampMat;
  lampMat = new THREE.MeshStandardMaterial({ color: 0xf3dcae, emissive: 0xffc878, emissiveIntensity: 0.05, roughness: 0.4 });
  b.nightGlow(lampMat, 0.05, 2.4);
  return lampMat;
}

/** Glass pane facing +x (side 1) or -x (side -1) on a wall at `x`, spanning z0..z1 and y0..y1; `bay` m per texture repeat. */
function glassPane(b: WorldBuilder, side: 1 | -1, x: number, z0: number, z1: number, y0: number, y1: number, bay: number): void {
  const w = Math.abs(z1 - z0);
  const geo = new THREE.PlaneGeometry(w, y1 - y0);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (w / bay));
  const m = mesh(geo, shopGlass(b), x, (y0 + y1) / 2, (z0 + z1) / 2);
  m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  b.add(m);
}

/**
 * A row of interior-mapped shop windows (a fake room behind each pane, see streetTextures.ts) facing
 * +x / −x on a wall at x, filling z0…z1 from y0 (PANE.h tall), with slim mullions between panes.
 */
function shopRow(b: WorldBuilder, side: 1 | -1, x: number, z0: number, z1: number, y0: number, kinds: InteriorKind[], seed = 0): void {
  registerStreetTick(b);
  const glass = interiorMaterial();
  const mull = mat(0x23262b, 0.5, 0.6);
  const step = PANE.w + 0.12;
  const n = Math.max(1, Math.floor((z1 - z0) / step));
  const span = n * step;
  const zs = (z0 + z1) / 2 - span / 2;
  for (let i = 0; i < n; i++) {
    const pz = zs + step * (i + 0.5);
    const kind = kinds[(i + seed) % kinds.length];
    const pane = new THREE.Mesh(interiorPaneGeometry(interiorCell(kind, (i + seed) >> 1)), glass);
    pane.position.set(x + side * 0.02, y0 + PANE.h / 2, pz);
    pane.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    b.add(pane);
    b.add(mesh(new THREE.BoxGeometry(0.12, PANE.h + 0.1, 0.12), mull, x + side * 0.06, y0 + PANE.h / 2, pz - PANE.w / 2 - 0.06));
  }
  b.add(mesh(new THREE.BoxGeometry(0.12, PANE.h + 0.1, 0.12), mull, x + side * 0.06, y0 + PANE.h / 2, zs + span - 0.06));
  b.add(mesh(new THREE.BoxGeometry(0.14, 0.12, span), mull, x + side * 0.07, y0 - 0.02, zs + span / 2));
  b.add(mesh(new THREE.BoxGeometry(0.14, 0.12, span), mull, x + side * 0.07, y0 + PANE.h + 0.04, zs + span / 2));
}

/** Arch-topped glass pane (rectangle + half-round head) facing +x / -x, centred on z, sill at y0, springing at y1. */
function archPane(b: WorldBuilder, side: 1 | -1, x: number, z: number, w: number, y0: number, y1: number, m?: THREE.Material): void {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, y1 - y0);
  s.absarc(0, y1 - y0, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  const geo = new THREE.ShapeGeometry(s, 10);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const top = y1 - y0 + r;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / top);
  const me = mesh(geo, m ?? shopGlass(b), x, y0, z);
  me.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  b.add(me);
}

/** A box of size (dx, h, dz) sitting on the wall face: `out` metres proud of the wall at `x` toward the street. */
function proud(b: WorldBuilder, side: 1 | -1, x: number, out: number, z: number, wz: number, y0: number, h: number, m: THREE.Material, cast = false): void {
  b.add(mesh(new THREE.BoxGeometry(out, h, wz), m, x + (side * out) / 2, y0 + h / 2, z, cast));
}

/** A marble figure on a plinth (Roman statue silhouette). */
function figure(b: WorldBuilder, x: number, y: number, z: number, s: number, m: THREE.Material, ry: number): void {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), m, 0, 0.25, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.5, 8), m, 0, 1.25, 0)); // draped robe
  g.add(mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.6, 8), m, 0, 2.3, 0)); // torso
  g.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), m, 0, 2.78, 0));
  const arm = mesh(new THREE.BoxGeometry(0.12, 0.75, 0.12), m, 0.32, 2.55, 0);
  arm.rotation.z = -0.6; // raised arm (the orator pose)
  g.add(arm);
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), m, -0.3, 2.1, 0.05));
  g.scale.setScalar(s);
  b.add(g, x, y, z, ry);
}

/** An urn on the balustrade. */
function urn(b: WorldBuilder, x: number, y: number, z: number, m: THREE.Material): void {
  b.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.2, 10), m, x, y + 0.1, z));
  b.add(mesh(new THREE.SphereGeometry(0.32, 10, 8), m, x, y + 0.45, z));
  b.add(mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.25, 10), m, x, y + 0.78, z));
}

/** Balustrade along a wall top (rail, base, balusters every 0.55 m) at x, z0..z1, sitting on y. */
function balustrade(b: WorldBuilder, x: number, z0: number, z1: number, y: number, m: THREE.Material, h = 0.95): void {
  const len = Math.abs(z1 - z0);
  const zc = (z0 + z1) / 2;
  b.add(mesh(new THREE.BoxGeometry(0.42, 0.16, len), m, x, y + 0.08, zc));
  b.add(mesh(new THREE.BoxGeometry(0.46, 0.14, len), m, x, y + h - 0.07, zc));
  const n = Math.floor(len / 0.55);
  const bal = new THREE.CylinderGeometry(0.08, 0.12, h - 0.3, 6);
  for (let i = 0; i <= n; i++) b.add(mesh(bal, m, x, y + 0.16 + (h - 0.3) / 2, Math.min(z0, z1) + (i / n) * len));
}

/**
 * Flat-shaded prism from a bottom quad (corners in order round the footprint, at y = yb) to a free top
 * quad (same corner order). Faces are wound outward; UVs are planar in metres (for the static batch).
 */
function prism(bottom: Array<[number, number]>, yb: number, top: Array<[number, number, number]>): THREE.BufferGeometry {
  const B = bottom.map(([x, z]) => new THREE.Vector3(x, yb, z));
  const T = top.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const c = new THREE.Vector3();
  for (const v of [...B, ...T]) c.add(v);
  c.multiplyScalar(1 / 8);
  const pos: number[] = [];
  const uv: number[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const fc = new THREE.Vector3();
  const tri = (a: THREE.Vector3, b2: THREE.Vector3, d: THREE.Vector3) => {
    e1.subVectors(b2, a);
    e2.subVectors(d, a);
    n.crossVectors(e1, e2);
    fc.copy(a).add(b2).add(d).multiplyScalar(1 / 3).sub(c);
    const pts = n.dot(fc) >= 0 ? [a, b2, d] : [a, d, b2];
    // planar UV in metres on the face's dominant plane
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (const p of pts) {
      pos.push(p.x, p.y, p.z);
      if (ay >= ax && ay >= az) uv.push(p.x / 4, p.z / 4);
      else if (ax >= az) uv.push(p.z / 4, p.y / 4);
      else uv.push(p.x / 4, p.y / 4);
    }
  };
  const quad = (a: THREE.Vector3, b2: THREE.Vector3, d: THREE.Vector3, e: THREE.Vector3) => {
    tri(a, b2, d);
    tri(a, d, e);
  };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(B[i], B[j], T[j], T[i]);
  }
  quad(T[0], T[1], T[2], T[3]);
  if (yb > 0.05) quad(B[0], B[1], B[2], B[3]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- The Shops at Crystals

/**
 * Crystals' Strip face. The podium core is the box x −59…−21, z 212…252 (9 m); the shards stand on its
 * front edge and fold up and back over it, two leaning shards frame the glass entry at z 226.5…237.5.
 */
export function crystalsFront(b: WorldBuilder): void {
  const X = -21;
  const XF = -20.85; // shard faces stand just proud of the podium wall
  // Brushed stainless panels cut by diagonal seams (4 m per tile on the shards' planar UVs)
  const steelTex = canvasTex(
    256,
    256,
    (ctx, w, h) => {
      const R = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      ctx.fillStyle = '#d6dce2';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(${R(i) > 0.5 ? '255,255,255' : '90,100,112'},${0.05 + R(i + 7) * 0.08})`;
        const y = R(i + 3) * h;
        ctx.fillRect(0, y, w, 4 + R(i + 5) * 20);
      }
      ctx.strokeStyle = '#717a84';
      ctx.lineWidth = 2;
      for (let c = -h; c < w + h; c += 64) {
        ctx.beginPath();
        ctx.moveTo(c, 0);
        ctx.lineTo(c + h / 2, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 128) {
        ctx.beginPath();
        ctx.moveTo(0, y + 1);
        ctx.lineTo(w, y + 1);
        ctx.stroke();
      }
    },
    true
  );
  const steelMat = new THREE.MeshStandardMaterial({ map: steelTex, roughness: 0.5, metalness: 0.3 });
  const steel = [steelMat, steelMat, steelMat];
  // Glass shards: triangulated mullions over blue-grey low-e glass, faintly lit from inside at night
  const glassTex = canvasTex(
    256,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#9fb6c9');
      g.addColorStop(0.5, '#6f8aa3');
      g.addColorStop(1, '#8aa3b8');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#4a525c';
      ctx.lineWidth = 3;
      for (let x = 0; x <= w; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let c = -h; c < w + h; c += 128) {
        for (const d of [1, -1]) {
          ctx.beginPath();
          ctx.moveTo(c, d > 0 ? 0 : h);
          ctx.lineTo(c + h / 2, d > 0 ? h : 0);
          ctx.stroke();
        }
      }
    },
    true
  );
  // after dark the real shards' glazing glows teal from the atrium lighting
  const glass = new THREE.MeshStandardMaterial({ map: glassTex, roughness: 0.15, metalness: 0.55, emissive: 0x5fd6dc, emissiveMap: glassTex, emissiveIntensity: 0 });
  b.nightGlow(glass, 0, 0.45);
  const seam = mat(0x59626c, 0.6);

  // Glass storefront band under the shards (Tiffany, Louis Vuitton… behind it) and a steel ledge above
  shopRow(b, 1, X, 212.3, 223.3, 0.35, ['jewelry', 'mannequins', 'racks'], 0);
  shopRow(b, 1, X, 240.7, 251.7, 0.35, ['mannequins', 'jewelry', 'racks'], 1);
  for (const [a, c] of [[212, 223.5], [240.5, 252]]) {
    b.add(mesh(new THREE.BoxGeometry(0.12, 1.4, c - a), seam, X + 0.06, 3.95, (a + c) / 2));
    b.add(mesh(new THREE.BoxGeometry(0.2, 0.35, c - a), seam, X + 0.1, 0.17, (a + c) / 2));
  }
  b.add(mesh(new THREE.BoxGeometry(0.9, 0.35, 11.5), steel[0], X + 0.45, 4.78, 217.75));
  b.add(mesh(new THREE.BoxGeometry(0.9, 0.35, 11.5), steel[0], X + 0.45, 4.78, 246.25));
  // Tall glass entry (the atrium behind) with a slim steel frame
  glassPane(b, 1, X + 0.05, 226.5, 237.5, 0, 8.2, 3.7);
  for (const z of [226.6, 237.4]) b.add(mesh(new THREE.BoxGeometry(0.3, 8.4, 0.25), seam, X + 0.15, 4.2, z));
  b.add(mesh(new THREE.BoxGeometry(0.4, 0.3, 11), seam, X + 0.2, 8.35, 232));

  // Shards: [z front a, z front b, z back a, z back b, front-top y, back-top y, lean toward the street, base y, depth, material]
  type Shard = [number, number, number, number, number, number, number, number, number, THREE.Material];
  const shards: Shard[] = [
    [212, 218, 213.5, 220, 12.5, 17, 0.6, 4.95, 12, steel[1]],
    [218, 223.5, 219, 225.5, 19.5, 14, 1.2, 4.95, 11, glass],
    [223.5, 226.5, 225, 228.5, 23, 21, 1.5, 0, 7, steel[0]], // portal shard, rises off the sidewalk
    [237.5, 240.5, 236, 239, 20, 18, 1.3, 0, 7, steel[2]], // portal shard
    [240.5, 246.5, 239.5, 245, 14.5, 21.5, -0.8, 4.95, 12, glass],
    [246.5, 252, 245.5, 251, 10.5, 15.5, 0.5, 4.95, 11, steel[1]],
  ];
  for (const [fa, fb, ba, bb, hf, hb, lean, yb, depth, m] of shards) {
    const xb = XF - depth;
    const portal = yb === 0;
    // portal shards lean in over the doors
    const dz = portal ? (fa < 232 ? 2.2 : -2.2) : 0;
    const geo = prism(
      [
        [XF, fa],
        [XF, fb],
        [xb, bb],
        [xb, ba],
      ],
      yb,
      [
        [XF + lean, hf, fa + dz],
        [XF + lean, hf - 1.5, fb + dz],
        [xb + lean * 0.4, hb + 1.2, bb + dz * 0.5],
        [xb + lean * 0.4, hb, ba + dz * 0.5],
      ]
    );
    b.add(mesh(geo, m, 0, 0, 0, true));
  }
  // The crown: a tall glass shard rising behind the entry, and a steel blade folding over it
  b.add(
    mesh(
      prism(
        [
          [-28, 227],
          [-28, 238],
          [-42, 240],
          [-42, 225],
        ],
        8.95,
        [
          [-27, 27, 229.5],
          [-27.5, 24, 236],
          [-40, 18, 238.5],
          [-39, 21, 226.5],
        ]
      ),
      glass,
      0,
      0,
      0,
      true
    )
  );
  b.add(
    mesh(
      prism(
        [
          [-33, 212],
          [-33, 226],
          [-50, 224],
          [-50, 213],
        ],
        8.95,
        [
          [-33.5, 15, 213],
          [-33.5, 13, 225.5],
          [-49, 11.5, 223.5],
          [-49, 13.5, 213.5],
        ]
      ),
      steel[2],
      0,
      0,
      0,
      true
    )
  );
  b.add(
    mesh(
      prism(
        [
          [-33, 239],
          [-33, 252],
          [-52, 252],
          [-52, 241],
        ],
        8.95,
        [
          [-34, 18.5, 240],
          [-34, 13, 251.5],
          [-51, 12, 251.5],
          [-51, 16, 241.5],
        ]
      ),
      steel[0],
      0,
      0,
      0,
      true
    )
  );
  // Granite step along the frontage
  b.add(mesh(new THREE.BoxGeometry(0.8, 0.12, 40), mat(0x4a4e54, 0.6), X + 0.4, 0.06, 232));
}

// ---------------------------------------------------------------- The Forum Shops street wall

/**
 * Classical dressing on a blank Forum Shops wall facing the Strip (+x) at x = `x`, z0…z1, `h` tall:
 * plinth, Corinthian pilasters with gilded capitals, arched windows and statue niches, entablature,
 * cornice, roof balustrade with statues.
 */
export function forumWall(b: WorldBuilder, x: number, z0: number, z1: number, h: number): void {
  const marble = mat(0xf1ece2, 0.6);
  const stone = mat(0xdcd0ba, 0.75);
  const niche = mat(0xb9ab92, 0.85);
  const gold = mat(0xd4ae57, 0.35, 0.75);
  const len = z1 - z0;
  const bays = Math.max(2, Math.round(len / 4));
  const bw = len / bays;
  proud(b, 1, x, 0.35, (z0 + z1) / 2, len, 0, 0.9, stone);
  for (let i = 0; i <= bays; i++) {
    const z = z0 + i * bw;
    const wz = i === 0 || i === bays ? 0.9 : 0.75;
    proud(b, 1, x, 0.32, z, wz, 0.9, h - 3.3, marble);
    proud(b, 1, x, 0.48, z, wz + 0.3, h - 2.4, 0.55, gold);
    b.add(mesh(new THREE.BoxGeometry(0.18, 0.32, 0.22), sconceMat(b), x + 0.45, 4.2, z));
  }
  for (let i = 0; i < bays; i++) {
    const zc = z0 + (i + 0.5) * bw;
    if (i % 2 === 0) {
      archPane(b, 1, x + 0.04, zc, bw * 0.55, 1.2, 5.2);
      proud(b, 1, x, 0.12, zc, bw * 0.75, 0.95, 0.25, stone); // sill
    } else {
      // niche with a statue
      archPane(b, 1, x + 0.03, zc, bw * 0.5, 0.9, 4.4, niche);
      b.add(mesh(new THREE.BoxGeometry(0.9, 0.9, 1.0), stone, x + 0.75, 0.45, zc));
      figure(b, x + 0.75, 0.9, zc, 0.95, marble, Math.PI / 2);
    }
    // upper windows: small square lights under the entablature
    b.add(mesh(new THREE.PlaneGeometry(bw * 0.36, 1.3), mat(0x6b5a45, 0.6), x + 0.04, h - 4.5, zc)).rotation.y = Math.PI / 2;
  }
  // entablature (frieze + cornice) and the roof balustrade
  proud(b, 1, x, 0.42, (z0 + z1) / 2, len + 0.6, h - 1.85, 0.95, marble);
  proud(b, 1, x, 0.8, (z0 + z1) / 2, len + 1.0, h - 0.9, 0.45, stone, true);
  proud(b, 1, x, 0.95, (z0 + z1) / 2, len + 1.2, h - 0.45, 0.45, marble);
  balustrade(b, x + 0.3, z0, z1, h, marble);
  for (let i = 1; i < bays; i += 2) figure(b, x + 0.3, h + 0.95, z0 + i * bw, 0.8, marble, Math.PI / 2);
  urn(b, x + 0.3, h + 0.95, z0 + 0.3, marble);
  urn(b, x + 0.3, h + 0.95, z1 - 0.3, marble);
  uplights(b, 1, x + 0.43, z0, z1, h - 1.9, 0xffe2b4, bw);
}

/** Cypresses in round stone planters along the Forum Shops frontage. */
export function forumPlanting(b: WorldBuilder, x: number, zs: number[]): void {
  const pot = mat(0xd9ccb4, 0.75);
  const soil = mat(0x4a3a2a, 0.95);
  for (const z of zs) {
    b.add(mesh(new THREE.CylinderGeometry(0.85, 0.75, 0.7, 14), pot, x, 0.35, z, true));
    b.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.05, 14), soil, x, 0.71, z));
    b.add(cypressTree(5.2), x, 0.7, z);
    b.collider(x - 0.85, x + 0.85, z - 0.85, z + 0.85, 0, 0.7);
  }
}

// ---------------------------------------------------------------- The Palazzo street front

/**
 * The Palazzo podium's Strip face (facing −x at x = `x`, z0…z1, `h` tall, the Strip to the west):
 * an arcade of arched boutique windows between stone pilasters with bronze lanterns, a plain frieze
 * (the THE PALAZZO letters at z −346…−334 sit on it), cornice and balustrade with urns, a bronze
 * canopy over the doors at `door`, and palms in planters along the walk.
 */
export function palazzoFront(b: WorldBuilder, x: number, z0: number, z1: number, h: number, door: number): void {
  const stone = mat(0xe6d3ab, 0.7);
  const light = mat(0xf0e3c6, 0.65);
  const dark = mat(0xb79f74, 0.8);
  const bronze = mat(0x4a3420, 0.45, 0.75);
  const len = z1 - z0;
  const bays = Math.round(len / 6);
  const bw = len / bays;
  proud(b, -1, x, 0.3, (z0 + z1) / 2, len, 0, 0.7, dark);
  for (let i = 0; i <= bays; i++) {
    const z = z0 + i * bw;
    proud(b, -1, x, 0.38, z, 1.0, 0.7, 5.0, stone);
    proud(b, -1, x, 0.5, z, 1.25, 5.7, 0.35, light);
    b.add(mesh(new THREE.BoxGeometry(0.22, 0.42, 0.26), sconceMat(b), x - 0.5, 3.6, z));
  }
  for (let i = 0; i < bays; i++) {
    const zc = z0 + (i + 0.5) * bw;
    const isDoor = Math.abs(zc - door) < bw / 2;
    archPane(b, -1, x - 0.04, zc, bw * 0.66, isDoor ? 0 : 0.75, 3.6);
    if (!isDoor) proud(b, -1, x, 0.16, zc, bw * 0.74, 0.6, 0.18, light); // sill
    // keystone over the arch
    proud(b, -1, x, 0.2, zc, 0.5, 3.6 + bw * 0.33 - 0.35, 0.55, light);
  }
  // bronze canopy over the Strip doors
  b.add(mesh(new THREE.BoxGeometry(2.6, 0.28, bw * 0.9), bronze, x - 1.3, 4.75, door, true));
  for (const s of [-1, 1]) b.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.05, 6), bronze, x - 1.3, 5.7, door + s * bw * 0.4)).rotation.z = -1.02;
  // frieze stays flat for the letters; string course, cornice and balustrade
  proud(b, -1, x, 0.22, (z0 + z1) / 2, len, 5.95, 0.25, light);
  proud(b, -1, x, 0.45, (z0 + z1) / 2, len + 0.6, h - 0.75, 0.35, light, true);
  proud(b, -1, x, 0.7, (z0 + z1) / 2, len + 1.0, h - 0.4, 0.4, stone);
  balustrade(b, x - 0.3, z0, z1, h, light);
  for (let i = 0; i <= bays; i += 2) urn(b, x - 0.3, h + 0.95, z0 + i * bw, light);
  // palms in square stone planters along the walk (gaps for the doors)
  const pot = mat(0xcdb894, 0.8);
  const soil = mat(0x4a3a2a, 0.95);
  let k = 0;
  for (let z = z0 + bw; z < z1 - 1; z += bw * 2) {
    if (Math.abs(z - door) < bw * 1.2) continue;
    const px = x - 1.25;
    b.add(mesh(new THREE.BoxGeometry(1.5, 0.75, 1.5), pot, px, 0.375, z, true));
    b.add(mesh(new THREE.BoxGeometry(1.3, 0.05, 1.3), soil, px, 0.76, z));
    b.add(palmTree(7.5 + (k % 3) * 0.7, false, 40 + k), px, 0.75, z);
    b.collider(px - 0.75, px + 0.75, z - 0.75, z + 0.75, 0, 0.75);
    k++;
  }
  uplights(b, -1, x - 0.43, z0 - bw / 2, z1, h - 0.8, 0xffd08a, bw);
}

// ---------------------------------------------------------------- Casino Royale

/**
 * Casino Royale's street front (facing −x at x = `x`, z0…z1, `h` tall): the small casino between
 * Harrah's and the Venetian with the 24-hour pharmacy, the casino doors under a gold bulb canopy and a
 * slider joint on the ground floor, the hotel floor above (maroon and cream, a row of windows), cornice.
 * `doors` is the z of the casino entrance; the CASINO ROYALE sign sits on the upper floor over it.
 */
export function casinoRoyaleFront(b: WorldBuilder, x: number, z0: number, z1: number, h: number, doors: number): void {
  const maroon = mat(0x6a1e26, 0.7);
  const cream = mat(0xeadfc8, 0.65);
  const gold = mat(0xc9a24a, 0.35, 0.75);
  const dark = mat(0x1c2430, 0.25, 0.4);
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  proud(b, -1, x, 0.25, zc, len, 0, 0.5, maroon);
  // ground floor: pharmacy (south), casino doors, slider joint (north)
  const dz0 = doors - 4;
  const dz1 = doors + 4;
  shopRow(b, -1, x, z0 + 0.6, dz0 - 0.6, 0.6, ['pharmacy', 'liquor', 'pharmacy'], 0);
  shopRow(b, -1, x, dz1 + 0.6, z1 - 0.6, 0.6, ['foodcourt'], 0);
  proud(b, -1, x, 0.1, (z0 + dz0) / 2, dz0 - z0, 3.45, 1.15, cream);
  proud(b, -1, x, 0.1, (dz1 + z1) / 2, z1 - dz1, 3.45, 1.15, cream);
  const doorGlass = mesh(new THREE.PlaneGeometry(dz1 - dz0 - 1.2, 3.9), dark, x - 0.05, 1.95 + 0.5, doors);
  doorGlass.rotation.y = -Math.PI / 2;
  b.add(doorGlass);
  for (const z of [z0, dz0, dz1, z1]) proud(b, -1, x, 0.35, z, 1.1, 0.5, 4.1, cream);
  // gold canopy over the casino doors with a row of lamps underneath
  b.add(mesh(new THREE.BoxGeometry(3.4, 0.45, dz1 - dz0), gold, x - 1.7, 4.55, doors, true));
  b.add(mesh(new THREE.BoxGeometry(3.0, 0.06, dz1 - dz0 - 0.6), sconceMat(b), x - 1.7, 4.3, doors));
  for (const s of [-1, 1]) b.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.3, 6), gold, x - 1.7, 6.1, doors + s * (dz1 - dz0) * 0.42)).rotation.z = -0.92;
  // fascia band with gold edges, the hotel floor above with windows and maroon pilasters
  proud(b, -1, x, 0.3, zc, len, 4.6, 1.2, maroon);
  proud(b, -1, x, 0.38, zc, len, 4.55, 0.1, gold);
  proud(b, -1, x, 0.38, zc, len, 5.75, 0.1, gold);
  const win = new THREE.PlaneGeometry(1.8, 1.7);
  for (let z = z0 + 2; z < z1 - 1; z += 3.2) {
    if (z > doors - 5 && z < doors + 5) continue; // the CASINO ROYALE sign hangs here
    const w = mesh(win, dark, x - 0.04, 7.6, z);
    w.rotation.y = -Math.PI / 2;
    b.add(w);
    proud(b, -1, x, 0.12, z, 2.1, 6.6, 0.14, cream);
  }
  for (let z = z0; z <= z1 + 0.01; z += len / 6) proud(b, -1, x, 0.22, z, 0.6, 5.9, h - 6.5, maroon);
  proud(b, -1, x, 0.5, zc, len + 0.8, h - 0.6, 0.6, cream, true);
  proud(b, -1, x, 0.56, zc, len + 0.9, h - 0.68, 0.1, gold);
}

// ---------------------------------------------------------------- The Venetian: Doge's Palace front

/**
 * The Doge's Palace face on the Strip (the palace wall faces −x at x = `x`, z0…z1, roof at `h`): over
 * the ground-floor arcade (venue code) goes the upper loggia — slim white columns with pointed arch
 * heads and a balustrade on the arcade beam (`beamTop`, z a0…a1) — then the famous rose-and-white
 * lozenge wall with big pointed windows, and the white Gothic cresting along the roof line.
 */
export function dogesPalaceFront(b: WorldBuilder, x: number, z0: number, z1: number, h: number, beamTop: number, a0: number, a1: number): void {
  const ivory = mat(0xf3ece0, 0.6);
  const shade = mat(0x6b5a55, 0.9);
  const loggiaTop = beamTop + 3.6;
  // loggia: shadowed back wall, slim columns, balustrade, arch-head band and the slab above
  const back = mesh(new THREE.PlaneGeometry(a1 - a0, loggiaTop - beamTop), shade, x - 0.04, (beamTop + loggiaTop) / 2, (a0 + a1) / 2);
  back.rotation.y = -Math.PI / 2;
  b.add(back);
  const colX = x - 2.6;
  const col = new THREE.CylinderGeometry(0.14, 0.17, 2.9, 8);
  for (let z = a0 + 0.85; z < a1; z += 1.7) {
    b.add(mesh(col, ivory, colX, beamTop + 1.45, z));
    b.add(mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), ivory, colX, beamTop + 2.95, z));
  }
  balustrade(b, colX, a0, a1, beamTop, ivory, 0.85);
  b.add(mesh(new THREE.BoxGeometry(0.5, 0.7, a1 - a0), ivory, colX, beamTop + 3.35, (a0 + a1) / 2));
  b.add(mesh(new THREE.BoxGeometry(x - colX + 0.4, 0.3, a1 - a0), ivory, (x + colX) / 2, loggiaTop + 0.15, (a0 + a1) / 2, true));
  // the rose lozenge wall with pointed windows (6 m tiles), lit from inside at night
  const TW = 256;
  const TH = 288;
  const paint = (lit: boolean) => (ctx: CanvasRenderingContext2D, w: number, hh: number) => {
    ctx.fillStyle = lit ? '#000000' : '#e6b3a6';
    ctx.fillRect(0, 0, w, hh);
    if (!lit) {
      // lozenges: alternating rose and cream diamonds on a fine grid
      const s = 16;
      for (let yy = -s; yy < hh + s; yy += s) {
        for (let xx = -s; xx < w + s; xx += s) {
          const odd = ((xx + yy) / s) % 2 === 0;
          ctx.fillStyle = odd ? '#f2e4da' : '#d89c90';
          ctx.beginPath();
          ctx.moveTo(xx + s / 2, yy);
          ctx.lineTo(xx + s, yy + s / 2);
          ctx.lineTo(xx + s / 2, yy + s);
          ctx.lineTo(xx, yy + s / 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    // a tall pointed window in a white stone frame
    const cx = w / 2;
    const ww = 64;
    const top = 70;
    const bot = 250;
    const arch = (pad: number) => {
      ctx.beginPath();
      ctx.moveTo(cx - ww / 2 - pad, bot + pad);
      ctx.lineTo(cx - ww / 2 - pad, top + 30);
      ctx.quadraticCurveTo(cx - ww / 2 - pad, top - pad, cx, top - 26 - pad);
      ctx.quadraticCurveTo(cx + ww / 2 + pad, top - pad, cx + ww / 2 + pad, top + 30);
      ctx.lineTo(cx + ww / 2 + pad, bot + pad);
      ctx.closePath();
    };
    if (!lit) {
      ctx.fillStyle = '#f6f0e6';
      arch(10);
      ctx.fill();
    }
    ctx.fillStyle = lit ? '#ffcf8a' : '#3a3036';
    arch(0);
    ctx.fill();
    // mullion + transom
    ctx.fillStyle = lit ? '#000000' : '#f6f0e6';
    ctx.fillRect(cx - 3, top, 6, bot - top);
    ctx.fillRect(cx - ww / 2, 150, ww, 6);
    // balcony sill
    if (!lit) {
      ctx.fillStyle = '#f6f0e6';
      ctx.fillRect(cx - ww / 2 - 16, bot + 8, ww + 32, 12);
    }
  };
  const map = canvasTex(TW, TH, paint(false), true);
  const em = canvasTex(TW, TH, paint(true), true);
  const wallMat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.02, roughness: 0.8 });
  b.nightGlow(wallMat, 0.02, 0.7);
  const wy0 = loggiaTop + 0.3;
  const wy1 = h - 0.6;
  const len = z1 - z0;
  const geo = new THREE.PlaneGeometry(len, wy1 - wy0);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 6));
  const wall = mesh(geo, wallMat, x - 0.03, (wy0 + wy1) / 2, (z0 + z1) / 2);
  wall.rotation.y = -Math.PI / 2;
  b.add(wall);
  // white string course under the cresting, and the cresting itself
  b.add(mesh(new THREE.BoxGeometry(0.4, 0.6, len + 0.4), ivory, x - 0.2, h - 0.3, (z0 + z1) / 2));
  const merlon = new THREE.BoxGeometry(0.35, 0.9, 0.7);
  const tip = new THREE.ConeGeometry(0.22, 0.6, 4);
  for (let z = z0 + 0.6; z < z1; z += 1.6) {
    b.add(mesh(merlon, ivory, x - 0.2, h + 0.45, z));
    b.add(mesh(tip, ivory, x - 0.2, h + 1.2, z));
  }
}

// ---------------------------------------------------------------- Paris Las Vegas: the Paris street front

/**
 * The Paris casino's Strip face (facing −x; `x` is just proud of the venue wall's pilasters, z0…z1,
 * doors d0…d1): an ivory Second-Empire front after the Opéra and the Louvre — arched ground-floor windows
 * between pilasters with gilded capitals, a string course, round-headed upper windows between paired
 * columns, a deep cornice, and the blue-grey zinc mansard roof with dormers and gilded cresting.
 */
export function parisFront(b: WorldBuilder, x: number, z0: number, z1: number, d0: number, d1: number, h: number): void {
  const ivory = mat(0xefe5d0, 0.65);
  const cream = mat(0xe2d4b8, 0.7);
  const gold = mat(0xd4ae57, 0.35, 0.75);
  const zinc = mat(0x6f7c86, 0.55, 0.35);
  const dark = mat(0x2e3238, 0.3, 0.4);
  const top = h - 1.15; // under the venue's own cornice line
  // ivory skin over the wall (and over the lintel above the doors)
  for (const [a, c] of [
    [z0, d0],
    [d1, z1],
  ]) b.add(mesh(new THREE.BoxGeometry(0.1, top, c - a), ivory, x - 0.05, top / 2, (a + c) / 2));
  b.add(mesh(new THREE.BoxGeometry(0.1, top - 5.2, d1 - d0), ivory, x - 0.05, 5.2 + (top - 5.2) / 2, (d0 + d1) / 2));
  proud(b, -1, x - 0.1, 0.25, (z0 + z1) / 2, z1 - z0, 0, 0.6, cream);
  // bays: arched shop windows below, round-headed windows above, pilasters and paired columns between
  const bays = Math.round((z1 - z0) / 4);
  const bw = (z1 - z0) / bays;
  for (let i = 0; i <= bays; i++) {
    const z = z0 + i * bw;
    proud(b, -1, x - 0.1, 0.3, z, 0.7, 0.6, 5.0, ivory);
    proud(b, -1, x - 0.1, 0.42, z, 0.95, 5.6, 0.35, gold);
    // paired columns on the upper floor
    for (const s of [-0.28, 0.28]) b.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, top - 6.6, 10), ivory, x - 0.45, 6.2 + (top - 6.6) / 2, z + s));
    b.add(mesh(new THREE.BoxGeometry(0.5, 0.3, 1.0), gold, x - 0.45, top - 0.2, z));
  }
  for (let i = 0; i < bays; i++) {
    const zc = z0 + (i + 0.5) * bw;
    if (zc > d0 - 0.5 && zc < d1 + 0.5) continue; // the doors (the venue builds them)
    archPane(b, -1, x - 0.14, zc, bw * 0.58, 0.8, 3.9);
    archPane(b, -1, x - 0.14, zc, bw * 0.42, 6.9, 8.6);
    proud(b, -1, x - 0.1, 0.22, zc, bw * 0.7, 6.55, 0.18, cream); // balcony sill
    proud(b, -1, x - 0.1, 0.16, zc, 0.45, 3.9 + bw * 0.29 - 0.2, 0.5, gold); // keystone
  }
  // string course between the floors, the frieze and the deep cornice
  proud(b, -1, x - 0.1, 0.4, (z0 + z1) / 2, z1 - z0 + 0.4, 5.95, 0.4, cream);
  proud(b, -1, x - 0.1, 0.35, (z0 + z1) / 2, z1 - z0 + 0.4, top, 0.5, ivory);
  proud(b, -1, x - 0.1, 0.95, (z0 + z1) / 2, z1 - z0 + 1.0, top + 0.5, 0.55, cream, true);
  proud(b, -1, x - 0.1, 0.98, (z0 + z1) / 2, z1 - z0 + 1.0, top + 1.0, 0.08, gold);
  // zinc mansard: steep lower slope from the cornice back over the roof, dormers, gilded cresting
  const yb = h + 0.05;
  const yt = h + 3.6;
  const xf = x - 0.6;
  const xr = x + 2.4;
  b.add(
    mesh(
      prism(
        [
          [xf, z0 - 0.3],
          [xf, z1 + 0.3],
          [xf + 5.5, z1 + 0.3],
          [xf + 5.5, z0 - 0.3],
        ],
        yb,
        [
          [xr, yt, z0 + 1.2],
          [xr, yt, z1 - 1.2],
          [xf + 5.5, yt, z1 - 1.2],
          [xf + 5.5, yt, z0 + 1.2],
        ]
      ),
      zinc,
      0,
      0,
      0,
      true
    )
  );
  for (let i = 0; i < bays; i++) {
    const zc = z0 + (i + 0.5) * bw;
    const dx = xf + (xr - xf) * 0.45;
    const dy = yb + (yt - yb) * 0.45;
    b.add(mesh(new THREE.BoxGeometry(1.2, 1.5, 1.1), ivory, dx + 0.1, dy + 0.4, zc));
    const w = mesh(new THREE.PlaneGeometry(0.7, 0.95), dark, dx - 0.51, dy + 0.35, zc);
    w.rotation.y = -Math.PI / 2;
    b.add(w);
    const ped = mesh(new THREE.ConeGeometry(0.85, 0.55, 4), zinc, dx + 0.1, dy + 1.42, zc);
    ped.rotation.y = Math.PI / 4;
    ped.scale.set(0.95, 1, 0.75);
    b.add(ped);
  }
  for (let z = z0 + 1.4; z < z1 - 1; z += 1.2) b.add(mesh(new THREE.ConeGeometry(0.12, 0.6, 4), gold, xr + 0.1, yt + 0.3, z));
  b.add(mesh(new THREE.BoxGeometry(0.12, 0.12, z1 - z0 - 2.4), gold, xr + 0.1, yt + 0.06, (z0 + z1) / 2));
  uplights(b, -1, x - 0.68, z0 - bw / 2, z1, top, 0xffd59a, bw, (z) => z > d0 - 1 && z < d1 + 1);
}

// ---------------------------------------------------------------- night uplights

const washMats = new Map<number, THREE.MeshBasicMaterial>();
let washTex: THREE.CanvasTexture | null = null;
/**
 * Warm floodlight washes up a facade at night, the way the Strip's resort fronts are lit from ground
 * uplights: soft additive cones on the wall (one shared material per colour), plus the dark fixture
 * at the foot of each. Kept faint so they colour the stone without blooming. Facing −x or +x.
 */
export function uplights(b: WorldBuilder, side: 1 | -1, x: number, z0: number, z1: number, h: number, color: number, every = 4, skip?: (z: number) => boolean): void {
  if (!washTex) {
    const W = 64;
    const H = 128;
    washTex = canvasTex(W, H, (ctx) => {
      const img = ctx.createImageData(W, H);
      for (let py = 0; py < H; py++) {
        const v = 1 - py / (H - 1); // 0 at the bottom (canvas bottom row)
        for (let px = 0; px < W; px++) {
          const u = px / (W - 1) - 0.5;
          const spread = 0.1 + 0.28 * v;
          const k = Math.pow(1 - v, 1.4) * Math.exp(-(u * u) / (2 * spread * spread));
          const i = (py * W + px) * 4;
          const c = Math.round(255 * Math.min(1, k));
          img.data[i] = c;
          img.data[i + 1] = c;
          img.data[i + 2] = c;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
  }
  let m = washMats.get(color);
  if (!m) {
    const wm = new THREE.MeshBasicMaterial({ map: washTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    washMats.set(color, wm);
    m = wm;
    b.every((_dt, _t, night) => {
      wm.opacity = night * 0.5;
      wm.visible = night > 0.03;
    });
  }
  const geo = new THREE.PlaneGeometry(every * 0.95, h);
  const fixture = mat(0x1d1f22, 0.5, 0.5);
  for (let z = z0 + every / 2; z < z1; z += every) {
    if (skip?.(z)) continue;
    const p = mesh(geo, m, x + side * 0.12, h / 2, z);
    p.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    p.renderOrder = 2;
    b.add(p);
    b.add(mesh(new THREE.BoxGeometry(0.3, 0.18, 0.4), fixture, x + side * 0.35, 0.09, z));
  }
}
