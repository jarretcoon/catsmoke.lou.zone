import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { mat, mesh } from './props';
import { cofferTexture, paintedSkyMaterial, romanFacadeAtlas, signAtlas } from './grandTextures';
import { chandelier, column, gated, glowWarm, gold, Kit, lampPost, marbleWhite, poolWater, quad, statue, texFloor, texMat } from './grandInteriors';
import { makePaverTexture } from './textures';

/**
 * Caesars Palace, indoors:
 *  - The Forum Shops' Roman street behind the temple-front lobby: two-storey storefronts under a
 *    painted sky that cycles dawn → day → dusk, piazza lamps, the Fountain of the Gods, and the
 *    spiral escalator (ride it up to the landing and back down).
 *    Hall x −90…−46, z −180…−120; street x −77…−61; cross street to the lobby at z −156…−144.
 *  - The casino's domed rotunda with Caesar on a plinth, statues, chandeliers (x −100…−57, z −80…−24).
 */

const HX0 = -90;
const HX1 = -46;
const HZ0 = -180;
const HZ1 = -120;
const SX0 = -77; // street
const SX1 = -61;
const CZ0 = -156; // cross street to the lobby
const CZ1 = -144;

/** Painted sky shared by the Forum street, cross street and lobby (its phase cycles over ~4 minutes). */
let forumSky: THREE.ShaderMaterial | null = null;
function forumSkyMaterial(b: WorldBuilder): THREE.ShaderMaterial {
  if (forumSky) return forumSky;
  const m = paintedSkyMaterial(0.1);
  forumSky = m;
  b.every((_dt, t) => {
    if (!m.visible) return;
    m.uniforms.uPhase.value = 0.08 + ((t / 240) % 1);
    m.uniforms.uTime.value = t;
  });
  return m;
}

/** Scrolling escalator treads. */
function treadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a3c40';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#8a8e94';
  for (let x = 0; x < 64; x += 4) ctx.fillRect(x, 0, 1, 64);
  ctx.fillStyle = '#e8c35a';
  ctx.fillRect(0, 0, 64, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildForumShops(b: WorldBuilder): void {
  const wallMat = mat(0xe2d8c4, 0.7);
  const stoneM = mat(0xf2ece0, 0.6);
  const gilt = gold();
  const lampGlow = glowWarm();

  // ================= Shell (baked) =================
  b.box((HX0 + SX0) / 2, 0, (HZ0 + HZ1) / 2, SX0 - HX0, 15, HZ1 - HZ0, wallMat, true); // west block
  b.box((SX1 + HX1) / 2, 0, (HZ0 + CZ0) / 2, HX1 - SX1, 15, CZ0 - HZ0, wallMat, true); // east block, north
  b.box((SX1 + HX1) / 2, 0, (CZ1 + HZ1) / 2, HX1 - SX1, 15, HZ1 - CZ1, wallMat, true); // east block, south
  b.box((SX0 + SX1) / 2, 0, HZ0 + 0.6, SX1 - SX0, 15, 1.2, wallMat, true); // north end
  b.box((SX0 + SX1) / 2, 0, HZ1 - 0.6, SX1 - SX0, 15, 1.2, wallMat, true); // south end
  b.box(HX1, 10, (CZ0 + CZ1) / 2, 1, 5, CZ1 - CZ0, wallMat, true); // above the lobby doorway
  // Roofs double as the camera's ceiling (the painted sky hangs just under them)
  b.box((SX0 + SX1) / 2, 13.8, (HZ0 + HZ1) / 2, SX1 - SX0, 1.2, HZ1 - HZ0, wallMat);
  b.box((SX1 + HX1) / 2, 11.3, (CZ0 + CZ1) / 2, HX1 - SX1, 3.7, CZ1 - CZ0, wallMat);

  // ================= Dressing (gated) =================
  const g = new THREE.Group();
  const k = new Kit();
  const sky = forumSkyMaterial(b);

  // Floor: travertine with a red-and-gold border down the street
  const pav = makePaverTexture('#dcc6a0', '#b0946e', 4);
  const fl = mesh(new THREE.PlaneGeometry(SX1 - SX0, HZ1 - HZ0 - 2), texFloor(pav, SX1 - SX0, HZ1 - HZ0 - 2, 3, { roughness: 0.6 }), (SX0 + SX1) / 2, 0.03, (HZ0 + HZ1) / 2);
  fl.rotation.x = -Math.PI / 2;
  g.add(fl);
  const fl2 = mesh(new THREE.PlaneGeometry(HX1 - SX1, CZ1 - CZ0), texFloor(pav, HX1 - SX1, CZ1 - CZ0, 3, { roughness: 0.6 }), (SX1 + HX1) / 2, 0.03, (CZ0 + CZ1) / 2);
  fl2.rotation.x = -Math.PI / 2;
  g.add(fl2);
  const inlay = mat(0x8a2a1e, 0.4);
  const inlayG = mat(0xc9a24a, 0.35, 0.5);
  for (let z = HZ0 + 4; z < HZ1 - 2; z += 4) {
    k.box(inlay, (SX0 + SX1) / 2, 0.045, z, 10, 0.01, 0.35);
    k.box(inlayG, (SX0 + SX1) / 2, 0.05, z + 0.3, 10, 0.01, 0.08);
  }
  for (const x of [SX0 + 2.5, SX1 - 2.5]) k.box(inlay, x, 0.045, (HZ0 + HZ1) / 2, 0.3, 0.01, HZ1 - HZ0 - 4);

  // Painted-sky vault over the street + a flat painted sky over the cross street
  const R = 14.05;
  const vault = new THREE.PlaneGeometry(SX1 - SX0, HZ1 - HZ0, 16, 1);
  vault.rotateX(Math.PI / 2);
  const vp = vault.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < vp.count; i++) {
    const dx = vp.getX(i);
    vp.setY(i, Math.sqrt(R * R - dx * dx) - Math.sqrt(R * R - 64));
  }
  const vm = new THREE.Mesh(vault, sky);
  vm.position.set((SX0 + SX1) / 2, 11.2, (HZ0 + HZ1) / 2);
  g.add(vm);
  const cs = new THREE.Mesh(new THREE.PlaneGeometry(HX1 - SX1, CZ1 - CZ0).rotateX(Math.PI / 2), sky);
  cs.position.set((SX1 + HX1) / 2, 11.2, (CZ0 + CZ1) / 2);
  g.add(cs);
  for (const z of [HZ0 + 1.25, HZ1 - 1.25]) {
    const sh = new THREE.Shape();
    sh.moveTo(-8, 0);
    for (let i = 0; i <= 16; i++) {
      const x = -8 + i;
      sh.lineTo(x, Math.sqrt(R * R - x * x) - Math.sqrt(R * R - 64) + 0.05);
    }
    sh.lineTo(8, 0);
    const lm = new THREE.Mesh(new THREE.ShapeGeometry(sh), sky);
    lm.position.set((SX0 + SX1) / 2, 11.15, z);
    g.add(lm);
  }

  // Storefronts: 5.5 m × 11 m Roman fronts with lit arched windows and gilt name plates
  const atlas = romanFacadeAtlas();
  const facadeM = texMat('rom-facade', () => new THREE.MeshStandardMaterial({ map: atlas.map, emissiveMap: atlas.glow, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.75 }));
  const names = [
    'LOUIS VUITTON',
    'GUCCI',
    'FENDI',
    'VERSACE',
    'APPLE',
    'NIKE',
    'THE CHEESECAKE FACTORY',
    'TIFFANY & CO.',
    'CARTIER',
    'ROLEX',
    'DIOR',
    'PRADA',
    'HUGO BOSS',
    'SPAGO',
    'BALENCIAGA',
    'BURBERRY',
    'MONTBLANC',
    'GIORGIO ARMANI',
    'THE FORUM SHOPS',
    'FOUNTAIN OF THE GODS',
  ];
  const { tex: signTex, rows } = signAtlas(names, 'forum', 'Georgia, "Times New Roman", serif');
  const signM = texMat('forum-sign', () => new THREE.MeshBasicMaterial({ map: signTex }));
  const signQ = (i: number, w: number, h: number) => quad(w, h, 0, 1 - (i + 1) / rows, 1, 1 - i / rows);
  let shop = 0;
  let variant = 0;
  const FW = 5.5;
  const FH = 11;
  const unit = (wx: number, wz: number, nx: number, nz: number) => {
    const ry = Math.atan2(nx, nz);
    const tx = -nz;
    const tz = nx;
    const P = (along: number, out: number): [number, number] => [wx + tx * along + nx * out, wz + tz * along + nz * out];
    const vv = variant++ % 4;
    const [fx, fz] = P(0, 0.02);
    k.at(facadeM, quad(FW, FH, vv * 0.25, 0, vv * 0.25 + 0.25, 1), fx, FH / 2, fz, ry);
    // 3D pilasters with gilded capitals, cornice, name plate, balcony
    for (const s of [-1, 1]) {
      const [px, pz] = P(s * (FW / 2 - 0.2), 0.12);
      k.box(stoneM, px, FH / 2, pz, 0.4, FH, 0.24, ry);
      const [cx, cz] = P(s * (FW / 2 - 0.2), 0.2);
      k.box(gilt, cx, 5.0, cz, 0.55, 0.3, 0.3, ry);
      k.box(gilt, cx, FH - 0.7, cz, 0.55, 0.3, 0.3, ry);
    }
    const [cx, cz] = P(0, 0.35);
    k.box(stoneM, cx, FH - 0.2, cz, FW + 0.1, 0.45, 0.7, ry);
    const [dx, dz] = P(0, 0.2);
    k.box(stoneM, dx, FH - 0.55, dz, FW, 0.18, 0.4, ry);
    const [sx, sz] = P(0, 0.09);
    k.at(signM, signQ(shop, 4.2, 0.52), sx, 5.73, sz, ry);
    shop = (shop + 1) % 18;
    const [bx, bz] = P(0, 0.35);
    k.box(stoneM, bx, 6.45, bz, 1.9, 0.14, 0.7, ry);
    for (let i = 0; i <= 6; i++) {
      const [qx, qz] = P(-0.85 + i * 0.283, 0.62);
      k.cyl(stoneM, qx, 6.52, qz, 0.045, 0.065, 0.55, 5);
    }
    const [rx, rz] = P(0, 0.62);
    k.box(stoneM, rx, 7.1, rz, 1.9, 0.09, 0.12, ry);
    // a lantern bracket by the door
    const [lx, lz] = P(FW / 2 - 0.7, 0.4);
    k.at(lampGlow, new THREE.SphereGeometry(0.16, 8, 6).scale(1, 1.3, 1), lx, 3.3, lz);
  };
  // West side of the street (facing east)
  for (let i = 0; i < 10; i++) unit(SX0, -177.5 + FW * (i + 0.5), 1, 0);
  // East side (facing west), north and south of the cross street
  for (let i = 0; i < 4; i++) unit(SX1, -178 + FW * (i + 0.5), -1, 0);
  for (let i = 0; i < 4; i++) unit(SX1, CZ1 + FW * (i + 0.5), -1, 0);
  // Cross street faces
  for (let i = 0; i < 2; i++) {
    unit(SX1 + 0.5 + FW * (i + 0.5), CZ0, 0, 1);
    unit(SX1 + 0.5 + FW * (i + 0.5), CZ1, 0, -1);
  }
  // North end: three fronts round the spiral escalator; south end: wall fountain between two fronts
  for (let i = 0; i < 3; i++) unit(SX0 + 0.25 + FW * (i + 0.5), HZ0 + 1.2, 0, 1);
  for (const i of [0, 2]) unit(SX0 + 0.25 + FW * (i + 0.5), HZ1 - 1.2, 0, -1);

  // ---- South end: a Trevi-style wall fountain ----
  const fxC = (SX0 + SX1) / 2;
  const fzW = HZ1 - 1.2;
  k.box(stoneM, fxC, 5.5, fzW - 0.3, FW, 11, 0.6);
  k.box(stoneM, fxC, 10.6, fzW - 0.9, FW + 1.2, 0.8, 1.2);
  for (const s of [-1, 1]) column(k, fxC + s * 2.2, fzW - 1.0, 9.8, 0.36, stoneM, gilt);
  k.box(mat(0x7a6a58, 0.7), fxC, 4.5, fzW - 0.62, 3.2, 7, 0.1);
  statue(k, marbleWhite(), fxC, 2.4, fzW - 1.1, 3.2, Math.PI, 0, stoneM);
  k.cyl(stoneM, fxC, 0, fzW - 3.2, 3.2, 3.3, 0.6, 24);
  k.cyl(poolWater(), fxC, 0.57, fzW - 3.2, 3.0, 3.0, 0.04, 24);
  b.collider(fxC - 3.2, fxC + 3.2, fzW - 4.4, fzW - 0.3, 0, 0.6);
  b.waterZones.push({ name: 'Forum Wall Fountain', minX: fxC - 2.6, maxX: fxC + 2.6, minZ: fzW - 4.4, maxZ: fzW - 1.4, y: 0.6 });

  // ---- Fountain of the Gods (Neptune with Venus, Mars, Diana and Apollo) ----
  const gx = (SX0 + SX1) / 2;
  const gz = (CZ0 + CZ1) / 2;
  const marble = marbleWhite();
  k.cyl(stoneM, gx, 0, gz, 4.0, 4.15, 0.7, 32);
  k.cyl(poolWater(), gx, 0.66, gz, 3.7, 3.7, 0.04, 32);
  k.cyl(stoneM, gx, 0.6, gz, 1.5, 1.7, 1.2, 16);
  k.cyl(stoneM, gx, 1.8, gz, 2.2, 1.1, 0.45, 20);
  k.cyl(poolWater(), gx, 2.2, gz, 2.05, 2.05, 0.04, 20);
  k.cyl(stoneM, gx, 2.25, gz, 0.55, 0.7, 1.4, 12);
  statue(k, marble, gx, 3.65, gz, 2.9, 0, 0);
  // Neptune's trident
  k.at(gilt, new THREE.CylinderGeometry(0.05, 0.05, 3.0, 6), gx + 0.55, 5.6, gz + 0.1);
  for (const o of [-0.18, 0, 0.18]) k.at(gilt, new THREE.ConeGeometry(0.06, 0.4, 5), gx + 0.55 + o, 7.25, gz + 0.1);
  k.at(gilt, new THREE.BoxGeometry(0.42, 0.06, 0.06), gx + 0.55, 7.0, gz + 0.1);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const sx = gx + Math.cos(a) * 3.1;
    const sz = gz + Math.sin(a) * 3.1;
    k.cyl(stoneM, sx, 0.6, sz, 0.55, 0.6, 0.9, 10);
    statue(k, marble, sx, 1.5, sz, 1.9, Math.atan2(Math.cos(a), Math.sin(a)), i % 2);
  }
  const jetMat = new THREE.MeshBasicMaterial({ color: 0xe6fbff, transparent: true, opacity: 0.5, depthWrite: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.at(jetMat, new THREE.TorusGeometry(0.9, 0.045, 4, 14, Math.PI * 0.85), gx + Math.cos(a) * 2.6, 1.2, gz + Math.sin(a) * 2.6, -a + Math.PI / 2);
  }
  b.collider(gx - 4.1, gx + 4.1, gz - 4.1, gz + 4.1, 0, 0.7);
  b.collider(gx - 1.6, gx + 1.6, gz - 1.6, gz + 1.6, 0, 6.5, true);
  b.waterZones.push({ name: 'Fountain of the Gods', minX: gx - 3.6, maxX: gx + 3.6, minZ: gz - 3.6, maxZ: gz + 3.6, y: 0.7 });

  // ---- Piazza lamp posts down the street ----
  for (let z = HZ1 - 7; z > HZ0 + 16; z -= 9) {
    if (Math.abs(z - gz) < 6) continue;
    for (const x of [SX0 + 2.2, SX1 - 2.2]) {
      lampPost(k, x, z, 4.0, lampGlow);
      b.collider(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 4.0, true);
    }
  }

  // ---- The spiral escalator at the north end (rideable up to a landing balcony) ----
  const ex = gx;
  const ez = -170.5;
  const rIn = 1.9;
  const rOut = 3.7;
  const turns = 1.5;
  const a0 = Math.PI / 2; // starts on the street side (south)
  const topY = 7;
  const N = 96;
  const tread = treadTexture();
  const treadM = new THREE.MeshStandardMaterial({ map: tread, roughness: 0.5, metalness: 0.4 });
  const steel = mat(0xc9ccd2, 0.25, 0.85);
  const glassM = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const edgeGlow = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
  const helix = (s: number, r: number, dy = 0): THREE.Vector3 => {
    const a = a0 + s * turns * Math.PI * 2;
    return new THREE.Vector3(ex + Math.cos(a) * r, 0.15 + s * topY + dy, ez + Math.sin(a) * r);
  };
  const ribbon = (rA: number, rB: number, dyA: number, dyB: number, u: number) => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const pa = helix(s, rA, dyA);
      const pb = helix(s, rB, dyB);
      pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
      uv.push(s * u, 0, s * u, 1);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  const stepsMesh = new THREE.Mesh(ribbon(rOut, rIn, 0, 0, 70), treadM);
  stepsMesh.material.side = THREE.DoubleSide;
  g.add(stepsMesh);
  k.add(ribbon(rOut, rOut, 0, -0.9, 1), gilt);
  k.add(ribbon(rIn, rIn, 0, -0.9, 1), steel);
  k.add(ribbon(rOut, rOut, 0.05, 0.95, 1), glassM);
  k.add(ribbon(rIn, rIn, 0.05, 0.95, 1), glassM);
  k.add(ribbon(rOut - 0.05, rOut + 0.05, 1.0, 1.0, 1), edgeGlow);
  k.add(ribbon(rIn - 0.05, rIn + 0.05, 1.0, 1.0, 1), edgeGlow);
  k.cyl(marble, ex, 0, ez, 0.9, 1.0, topY + 0.6, 20);
  k.cyl(gilt, ex, topY + 0.6, ez, 1.1, 0.9, 0.35, 20);
  b.collider(ex - rOut, ex + rOut, ez - rOut, ez + rOut, 0, topY, true);
  // Landing balcony against the north wall (walkable), with a balustrade
  const landZ0 = HZ0 + 1.2;
  const landZ1 = ez - rOut + 0.1;
  b.box(ex, topY - 0.4, (landZ0 + landZ1) / 2, 7, 0.4, landZ1 - landZ0, stoneM);
  for (const s of [-1, 1]) {
    k.box(stoneM, ex + s * 3.45, topY + 0.5, (landZ0 + landZ1) / 2, 0.12, 1.0, landZ1 - landZ0);
    b.collider(ex + s * 3.45 - 0.1, ex + s * 3.45 + 0.1, landZ0, landZ1, topY, topY + 1.1, true);
    k.box(stoneM, ex + s * 2.4, topY + 0.5, landZ1 - 0.06, 2.2, 1.0, 0.12);
    b.collider(ex + s * 2.4 - 1.1, ex + s * 2.4 + 1.1, landZ1 - 0.15, landZ1 + 0.05, topY, topY + 1.1, true);
  }
  let escS = 0;
  let escTarget = 0;
  let escDir = 0;
  b.every((dt) => {
    tread.offset.x = (tread.offset.x - dt * 0.8) % 1;
    if (escDir !== 0) {
      escS = Math.max(0, Math.min(1, escS + escDir * dt * 0.09));
      if ((escDir > 0 && escS >= escTarget) || (escDir < 0 && escS <= escTarget)) escDir = 0;
    }
  });
  const pt = new THREE.Vector3();
  const seat = (out: THREE.Vector3) => {
    pt.copy(helix(escS, (rIn + rOut) / 2, 0.1));
    return out.copy(pt);
  };
  const yawAt = () => {
    const a = a0 + escS * turns * Math.PI * 2;
    // tangent of the helix (counter-clockwise seen from above)
    return Math.atan2(-Math.sin(a), Math.cos(a));
  };
  const bottom = helix(0, (rIn + rOut) / 2);
  b.rideables.push({
    id: 'forum-spiral-up',
    kind: 'elevator',
    label: 'Forum Shops Spiral Escalator',
    boardRadius: 2.6,
    boardPoint: (out) => out.set(bottom.x, 0, bottom.z + 1),
    seat,
    yaw: yawAt,
    exitPoint: (out) => (escS > 0.95 ? out.set(ex, topY + 0.1, (landZ0 + landZ1) / 2) : out.set(bottom.x, 0.2, bottom.z + 1.5)),
    canBoard: () => ({ ok: true }),
    onBoard: () => {
      escS = 0;
      escTarget = 1;
      escDir = 1;
    },
    wantsExit: () => escS >= 1,
    boardPrompt: 'Press [G] to ride the famous spiral escalator',
    ridingPrompt: 'Round and round and up… the Forum Shops spiral escalator',
  });
  b.rideables.push({
    id: 'forum-spiral-down',
    kind: 'elevator',
    label: 'Forum Shops Spiral Escalator',
    boardRadius: 2.4,
    boardPoint: (out) => out.set(ex, topY, landZ1 - 0.8),
    seat,
    yaw: () => yawAt() + Math.PI,
    exitPoint: (out) => (escS < 0.05 ? out.set(bottom.x, 0.2, bottom.z + 1.5) : out.set(ex, topY + 0.1, (landZ0 + landZ1) / 2)),
    canBoard: () => ({ ok: true }),
    onBoard: () => {
      escS = 1;
      escTarget = 0;
      escDir = -1;
    },
    wantsExit: () => escS <= 0,
    boardPrompt: 'Press [G] to ride the spiral escalator back down',
    ridingPrompt: 'Spiralling down into the Forum Shops…',
  });

  // ---- Temple-front lobby: painted sky instead of a flat blue lid ----
  const lobby = new THREE.Mesh(new THREE.PlaneGeometry(20, 24).rotateX(Math.PI / 2), sky);
  lobby.position.set(-36, 9.98, -150);
  g.add(lobby);
  for (const z of [-160, -140]) {
    statue(k, marble, -44.5, 1.6, z, 2.3, Math.PI / 2, z > -150 ? 1 : 0, stoneM);
    b.collider(-45.2, -43.8, z - 0.7, z + 0.7, 0, 1.6, true);
  }
  k.at(signM, signQ(18, 6, 0.75), -46.6, 8.9, -150, Math.PI / 2);

  k.flush(g);
  gated(b, g, HX0, -24, HZ0, HZ1, 4);
  sky.visible = true;
  b.every(() => {
    sky.visible = g.visible;
  });

  // ---- Zones, life, pickups ----
  b.zone('The Forum Shops at Caesars', HX0, HX1, HZ0, HZ1);
  b.zone('Fountain of the Gods • Forum Shops', gx - 6, gx + 6, gz - 6, gz + 6);
  b.zone('Spiral Escalator • Forum Shops', SX0, SX1, HZ0, -164);
  b.crowd.tourists.push(
    { pts: [[-74, -125], [-74, -160], [-74, -164]], prop: 'bag' },
    { pts: [[-64, -164], [-64, -125]], prop: 'bag' },
    { pts: [[-30, -150], [-50, -150], [-62, -153], [-75, -147], [-62, -146], [-50, -147]], prop: 'camera' },
    { pts: [[-72, -126], [-66, -126], [-66, -140], [-72, -140]], prop: 'yard-drink' }
  );
  b.pickup(gx + 3.9, 1.1, gz, 3, 'Fountain of the Gods Coin-Toss Pack', true);
  b.pickup(ex, topY + 0.6, landZ0 + 1.2, 5, 'Spiral Escalator Landing Pack!', true);
  b.pickup(SX0 + 1.4, 0.45, -131, 2, 'Cheesecake Factory Doorway Pack', true);
  b.staticMarkers.push({ x: gx, z: gz, color: '#9fe8ff', glyph: '⛲', size: 2.6 });
  b.building((HX0 + HX1) / 2, (HZ0 + HZ1) / 2, HX1 - HX0, HZ1 - HZ0, '#e2d8c4', 'Forum Shops');
}

/** Caesars casino (x −100…−57, z −80…−24): a domed rotunda round Caesar, statues, chandeliers. */
export function buildCaesarsCasinoDressing(b: WorldBuilder): void {
  const cx = -78.5;
  const cz = -52;
  const g = new THREE.Group();
  const k = new Kit();
  const gilt = gold();
  const marble = marbleWhite();
  const shaft = mat(0xf0ebe0, 0.25, 0.05);
  const Rr = 7.5;
  const colH = 6.4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const x = cx + Math.cos(a) * Rr;
    const z = cz + Math.sin(a) * Rr;
    column(k, x, z, colH, 0.38, shaft, gilt);
    b.collider(x - 0.45, x + 0.45, z - 0.45, z + 0.45, 0, colH, true);
  }
  // Entablature ring + dome (cream outside, coffered inside) + glowing oculus
  k.at(marble, new THREE.CylinderGeometry(Rr + 0.6, Rr + 0.6, 0.9, 40, 1, true), cx, colH + 0.45, cz);
  k.at(gilt, new THREE.TorusGeometry(Rr + 0.6, 0.08, 4, 48).rotateX(Math.PI / 2), cx, colH + 0.05, cz);
  k.at(gilt, new THREE.TorusGeometry(Rr + 0.6, 0.08, 4, 48).rotateX(Math.PI / 2), cx, colH + 0.9, cz);
  const outer = new THREE.SphereGeometry(Rr + 0.6, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  outer.scale(1, 0.6, 1);
  k.at(mat(0xf2ece0, 0.6), outer, cx, colH + 0.9, cz);
  const coffers = cofferTexture();
  const inner = new THREE.SphereGeometry(Rr + 0.45, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  inner.scale(1, 0.6, 1);
  const innerM = texMat('rotunda-coffers', () => {
    const t = coffers.clone();
    t.needsUpdate = true;
    t.repeat.set(10, 3);
    return new THREE.MeshStandardMaterial({ map: t, side: THREE.BackSide, roughness: 0.7, emissive: 0x2a2010, emissiveIntensity: 0.3 });
  });
  k.at(innerM, inner, cx, colH + 0.9, cz);
  const oculus = new THREE.MeshBasicMaterial({ color: 0xfff2d0 });
  k.at(oculus, new THREE.CircleGeometry(1.2, 24).rotateX(Math.PI / 2), cx, colH + 0.9 + (Rr + 0.45) * 0.6 - 0.12, cz);
  const crystal = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe6b0, emissiveIntensity: 1.15, roughness: 0.15, metalness: 0.2 });
  chandelier(k, cx, colH + 0.9 + (Rr + 0.45) * 0.6 - 0.2, cz, 1.6, crystal, gilt);
  // Caesar on his plinth at the centre
  statue(k, marble, cx, 1.8, cz, 3.2, Math.PI / 2, 0, mat(0x8a7a64, 0.5));
  k.box(gilt, cx, 1.85, cz, 1.5, 0.1, 1.5);
  b.collider(cx - 1.1, cx + 1.1, cz - 1.1, cz + 1.1, 0, 5.2, true);
  // Statues along the north and south walls, chandeliers over the tables
  for (const [x, z, f] of [
    [-90, -25.6, 0],
    [-68, -25.6, 0],
    [-90, -78.4, Math.PI],
    [-68, -78.4, Math.PI],
  ] as Array<[number, number, number]>) {
    statue(k, marble, x, 1.4, z + (f ? -0.5 : 0.5), 2.6, f, f ? 1 : 0, mat(0x8a7a64, 0.5));
    b.collider(x - 0.8, x + 0.8, z - 0.9, z + 0.9, 0, 3.8, true);
  }
  for (const [x, z] of [
    [-66, -36],
    [-91, -36],
    [-66, -68],
    [-91, -68],
  ]) chandelier(k, x, 11.9, z, 1.3, crystal, gilt);
  // Gold sconces round the walls
  const lamp = glowWarm();
  for (let z = -76; z < -26; z += 6) for (const x of [-99.35, -57.65]) if (Math.abs(z + 52) > 5) k.at(lamp, new THREE.SphereGeometry(0.2, 8, 6).scale(1, 1.4, 1), x, 4.4, z);
  k.flush(g);
  gated(b, g, -100, -57, -80, -24, 3);
  b.zone('Caesars Palace Casino • The Rotunda', cx - Rr, cx + Rr, cz - Rr, cz + Rr);
  b.pickup(cx + 1.3, 1.95, cz, 4, "Caesar's Plinth Tribute Pack", true);
}

/** Roof over the Caesars casino (shadows the floor so it reads as indoors). */
export function caesarsCasinoRoof(b: WorldBuilder): void {
  b.box(-78.5, 12.8, -52, 44.2, 0.35, 57.2, mat(0xe2d8c4, 0.8));
}
