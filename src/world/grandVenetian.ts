import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { stairs } from './buildings';
import { buildCasinoFloor } from './casinos';
import { mat, mesh } from './props';
import { canopyStripeTexture, frescoCeilingTexture, paintedSkyMaterial, signAtlas, venetianFacadeAtlas, venetianFloorTexture } from './grandTextures';
import { chandelier, column, gated, glowWarm, gold, Kit, lampPost, marbleWhite, poolWater, quad, rand, statue, texFloor, texMat } from './grandInteriors';

/**
 * The Venetian, indoors: the lobby (frescoed ceiling, gold armillary-sphere fountain, tumbling-block
 * marble), the Grand Canal Shoppes (an indoor canal under a painted sky, Venetian facades with
 * balconies and window boxes, two footbridges, gondolas you can ride) ending in St. Mark's Square
 * with café tables and street performers, and a casino wing toward the Palazzo.
 *
 * Footprint: x 44…88, z −318…−246 (the old solid Doge's Palace block was x 44…84, z −301…−251).
 *   Lobby       x 44…62, z −291.4…−246   (front doors at x 44, z −276, behind the arcade)
 *   Canal hall  x 62…88, z −300…−246     (canal x 71…79, z −300…−250)
 *   St. Mark's  x 62…88, z −318…−300
 *   Casino      x 44…62, z −318…−292     (doors: Strip side z −305, lobby x 53, square z −310)
 */
export function buildVenetianInteriors(b: WorldBuilder): void {
  const X0 = 44;
  const XM = 62;
  const X1 = 88;
  const Z0 = -318;
  const ZL = -291.4; // lobby north edge (casino south wall at −292)
  const Z1 = -246;
  const SQ = -300; // St. Mark's / canal boundary
  const H = 18;
  const pink = mat(0xe8c4b4, 0.75);
  const stone = mat(0xf0e6d2, 0.7);

  // ================= Shell (baked) =================
  // Strip front (x 44) with the main doors at z −276 (6 m wide, 5 m tall)
  b.box(X0, 0, (ZL + -279) / 2, 1.2, H, -279 - ZL, pink, true);
  b.box(X0, 0, (-273 + Z1) / 2, 1.2, H, Z1 - -273, pink, true);
  b.box(X0, 5, -276, 1.2, H - 5, 6, pink, true);
  b.box((X0 + X1) / 2, 0, Z1, X1 - X0 + 1.2, H, 1.2, pink, true); // south
  b.box(X1, 0, (Z0 + Z1) / 2, 1.2, H, Z1 - Z0, pink, true); // east (against the hotel tower)
  b.box((XM + X1) / 2, 0, Z0, X1 - XM, H, 1.2, pink, true); // north (square)
  // Lobby ↔ canal partition with a grand doorway at z −276 and a second one at z −252
  b.box(XM, 0, (ZL + -280) / 2, 1.2, H, -280 - ZL, stone, true);
  b.box(XM, 0, (-272 + -255) / 2, 1.2, H, 17, stone, true);
  b.box(XM, 0, (-249 + Z1) / 2, 1.2, H, Z1 - -249, stone, true);
  b.box(XM, 6.5, -276, 1.2, H - 6.5, 8, stone, true);
  b.box(XM, 5, -252, 1.2, H - 5, 6, stone, true);
  // Above the casino wing (its own walls/ceiling stop at 9.8)
  b.box(XM, 9.8, (Z0 + -292) / 2, 1.2, H - 9.8, 26, stone, true);
  b.box((X0 + XM) / 2, 9.8, -292, XM - X0, H - 9.8, 1.2, pink, true);
  // Ceilings (camera stays under them) + roof (casts the sun's shadow)
  b.box((X0 + XM) / 2, 11, (ZL + Z1) / 2, XM - X0, 0.5, Z1 - ZL, mat(0x8a6a3a, 0.8));
  b.box((XM + X1) / 2, 15.45, (Z0 + Z1) / 2, X1 - XM, 0.5, Z1 - Z0, mat(0x6a8ab0, 0.8));
  const roof = mat(0xc9b08e, 0.85);
  b.box((X0 + X1) / 2, H - 0.4, (ZL + Z1) / 2, X1 - X0, 0.4, Z1 - ZL, roof);
  b.box((XM + X1) / 2, H - 0.4, (Z0 + ZL) / 2, X1 - XM, 0.4, ZL - Z0, roof);

  // Casino wing (games from the shared kit)
  buildCasinoFloor(b, {
    id: 'venetian',
    casinoName: 'The Venetian',
    minX: X0,
    maxX: XM,
    minZ: Z0,
    maxZ: -292,
    height: 9,
    entrance: { side: 'west', at: -305, width: 6 },
    extraEntrances: [
      { side: 'south', at: 53, width: 6 },
      { side: 'east', at: -309, width: 6 },
    ],
    carpet: ['#3a1420', '#d8b25a', '#2a4a7a'],
    wall: 0xd9b98a,
    ceiling: 0xe8d6b0,
    ceilingGlow: 0x6a4a20,
    light: 0xffd9a0,
    slots: {
      accent: '#ffd27a',
      topper: 0xffc34d,
      rows: [
        { x: 47.4, z: -305, count: 6, along: 'z', facing: Math.PI / 2 },
      ],
    },
    slotLabel: 'Venetian Carnevale Slots',
    tables: [
      { game: 'roulette', x: 54, z: -313, label: 'Venetian Roulette' },
      { game: 'blackjack', x: 54, z: -305.5, label: 'Venetian Blackjack' },
      { game: 'craps', x: 53.5, z: -297.6, label: 'Venetian Craps' },
    ],
    felt: 0x1f3f6a,
    guard: { kick: [38, -305] },
    pickups: [
      { x: 47, z: -296, amount: 3, label: 'Carnevale Slot Bank Pack' },
      { x: 54, z: -305.5, y: 1.35, amount: 5, label: 'Venetian Blackjack Pack!' },
    ],
    tourists: [{ pts: [[50, -295], [50, -315], [58, -315], [58, -295]], prop: 'cig' }],
  });

  // ================= Dressing (gated) =================
  const g = new THREE.Group();
  const k = new Kit();
  const gilt = gold();
  const lampGlow = glowWarm();

  // ---------- Lobby ----------
  const lobbyW = XM - X0;
  const lobbyD = Z1 - ZL;
  const lobbyCZ = (ZL + Z1) / 2;
  const floorL = mesh(new THREE.PlaneGeometry(lobbyW, lobbyD), texFloor(venetianFloorTexture(), lobbyW, lobbyD, 3.2, { roughness: 0.18 }), (X0 + XM) / 2, 0.035, lobbyCZ);
  floorL.rotation.x = -Math.PI / 2;
  g.add(floorL);
  // Frescoed ceiling: three painted bays with gilded frames, plus two over the casino
  const frescoTex = frescoCeilingTexture();
  const fresco = texMat('fresco', () => new THREE.MeshStandardMaterial({ map: frescoTex, emissiveMap: frescoTex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.6, metalness: 0.15 }));
  const bay = lobbyD / 3;
  for (let i = 0; i < 3; i++) {
    const z = ZL + bay * (i + 0.5);
    k.at(fresco, new THREE.PlaneGeometry(lobbyW - 1.2, bay - 0.6).rotateX(Math.PI / 2), (X0 + XM) / 2, 10.97, z);
    k.box(gilt, (X0 + XM) / 2, 10.75, ZL + bay * i + 0.01, lobbyW - 1.2, 0.45, 0.5);
  }
  for (const z of [-311.4, -298.6]) k.at(fresco, new THREE.PlaneGeometry(16.4, 12.2).rotateX(Math.PI / 2), 53, 8.97, z);
  // Cornice + gold cove round the lobby
  const coveGlow = new THREE.MeshBasicMaterial({ color: 0xffe6b8 });
  for (const [x, z, w, d] of [
    [X0 + 0.8, lobbyCZ, 0.5, lobbyD],
    [XM - 0.8, lobbyCZ, 0.5, lobbyD],
    [(X0 + XM) / 2, ZL + 0.2, lobbyW, 0.5],
    [(X0 + XM) / 2, Z1 - 0.8, lobbyW, 0.5],
  ]) {
    k.box(gilt, x, 10.4, z, w, 0.7, d);
    k.box(coveGlow, x, 10.0, z, w * 0.98 + 0.02, 0.08, d * 0.98 + 0.02);
  }
  // Warm cream lining with gilded panel frames inside the (pink) shell walls
  const lining = mat(0xead6b0, 0.6, 0.05, { emissive: 0x3a2a10, emissiveIntensity: 0.2 });
  k.box(lining, X0 + 0.65, 6.6, lobbyCZ, 0.1, 6.8, lobbyD);
  k.box(lining, XM - 0.65, 6.6, (ZL + -280) / 2, 0.1, 6.8, -280 - ZL);
  k.box(lining, XM - 0.65, 8.5, -276, 0.1, 3, 8);
  k.box(lining, XM - 0.65, 6.6, (-272 + Z1) / 2, 0.1, 6.8, Z1 + 272);
  k.box(lining, (X0 + XM) / 2, 6.6, Z1 - 0.65, lobbyW, 6.8, 0.1);
  k.box(lining, (X0 + XM) / 2, 6.6, ZL + 0.05, lobbyW, 6.8, 0.1);
  for (let z = ZL + 1.5; z < Z1 - 1; z += 5.2) {
    for (const x of [X0 + 0.72, XM - 0.72]) {
      if (x > 50 && (Math.abs(z + 276) < 5 || Math.abs(z + 252) < 4)) continue;
      k.box(gilt, x, 6.4, z + 2.6, 0.06, 5.2, 0.08);
      k.box(gilt, x, 6.4, z, 0.06, 5.2, 0.08);
      k.box(gilt, x, 9.0, z + 1.3, 0.06, 0.08, 2.6);
      k.box(gilt, x, 3.8, z + 1.3, 0.06, 0.08, 2.6);
    }
  }
  // Marble wainscot + gilded pilasters along both long walls; columns in two rows
  const wains = mat(0xdcc9a8, 0.3, 0.05);
  const shaft = mat(0xe8ddc8, 0.25, 0.05);
  k.box(wains, X0 + 0.7, 1.6, lobbyCZ, 0.2, 3.2, lobbyD);
  k.box(wains, XM - 0.7, 1.6, lobbyCZ, 0.2, 3.2, lobbyD);
  for (let z = ZL + 4; z < Z1 - 2; z += 5.2) {
    if (Math.abs(z + 276) < 4.5 || Math.abs(z + 252) < 3.5) continue;
    for (const x of [X0 + 2.2, XM - 2.2]) {
      column(k, x, z, 10.4, 0.42, shaft, gilt);
      b.collider(x - 0.5, x + 0.5, z - 0.5, z + 0.5, 0, 10.4, true);
    }
    for (const x of [X0 + 0.75, XM - 0.75]) k.at(lampGlow, new THREE.SphereGeometry(0.18, 8, 6).scale(1, 1.5, 1), x, 4.6, z + 2.6);
  }
  // Chandeliers down the lobby
  const crystal = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe6b0, emissiveIntensity: 1.15, roughness: 0.15, metalness: 0.2 });
  for (const z of [-286, -264, -251]) chandelier(k, 53, 10.8, z, 1.1, crystal, gilt);

  // Armillary-sphere fountain at the heart of the lobby
  const ax = 53;
  const az = -276;
  k.cyl(stone, ax, 0, az, 3.3, 3.4, 0.65, 32);
  k.cyl(poolWater(), ax, 0.62, az, 2.95, 2.95, 0.04, 32);
  k.cyl(marbleWhite(), ax, 0.6, az, 0.6, 0.8, 1.2, 16);
  k.cyl(gilt, ax, 1.8, az, 0.35, 0.6, 0.5, 16);
  k.cyl(gilt, ax, 2.3, az, 0.12, 0.12, 0.9, 8);
  b.collider(ax - 3.3, ax + 3.3, az - 3.3, az + 3.3, 0, 0.65);
  b.collider(ax - 0.8, ax + 0.8, az - 0.8, az + 0.8, 0, 4.6, true);
  b.waterZones.push({ name: 'Armillary Fountain', minX: ax - 2.9, maxX: ax + 2.9, minZ: az - 2.9, maxZ: az + 2.9, y: 0.66 });
  const sphere = new THREE.Group();
  const ringMat = mat(0xe8b84a, 0.22, 0.95);
  const addRing = (r: number, rx: number, rz: number, tube = 0.06) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 48), ringMat);
    ring.rotation.set(rx, 0, rz);
    sphere.add(ring);
  };
  addRing(1.5, Math.PI / 2, 0, 0.09); // equator
  addRing(1.5, 0, 0); // meridians
  addRing(1.5, 0, 0);
  sphere.children[2].rotation.y = Math.PI / 2;
  addRing(1.5, Math.PI / 2 + 0.41, 0, 0.11); // ecliptic band
  addRing(1.38, Math.PI / 2, 0, 0.04); // tropics
  sphere.children[sphere.children.length - 1].position.y = 0.55;
  addRing(1.38, Math.PI / 2, 0, 0.04);
  sphere.children[sphere.children.length - 1].position.y = -0.55;
  sphere.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), mat(0x2a5aa8, 0.3, 0.4)));
  sphere.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 6), ringMat));
  sphere.rotation.z = 0.41;
  sphere.position.set(ax, 4.1, az);
  g.add(sphere);
  // Four arcs of water into the basin
  const jetMat = new THREE.MeshBasicMaterial({ color: 0xdff8ff, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const arc = new THREE.TorusGeometry(1.1, 0.05, 4, 16, Math.PI * 0.9);
    k.at(jetMat, arc, ax + Math.cos(a) * 1.3, 0.7, az + Math.sin(a) * 1.3, -a + Math.PI / 2);
  }

  // Reception desk at the south end
  const wood = mat(0x4a2a18, 0.45, 0.1);
  k.box(wood, 53, 0.55, -249.6, 12, 1.1, 1.1);
  k.box(marbleWhite(), 53, 1.14, -249.6, 12.3, 0.08, 1.4);
  b.collider(47, 59, -250.3, -248.9, 0, 1.18, true);
  const { tex: venSigns } = signAtlas(
    ['THE VENETIAN', 'GRAND CANAL SHOPPES', 'BURBERRY', 'SEPHORA', 'MICHAEL KORS', 'TAG HEUER', 'MASCHERE DI VENEZIA', 'GELATERIA', 'GRAND LUX CAFE', 'KATE SPADE', 'TIFFANY & CO.', 'ROLEX', 'CAFFÈ FLORIAN', 'VERSACE', 'MURANO GLASS', 'GONDOLA GIFTS', 'CASINO', 'TO THE LOBBY'],
    'venetian'
  );
  const NS = 18;
  const sv = (i: number): [number, number] => [1 - (i + 1) / NS, 1 - i / NS];
  const signM = texMat('ven-sign', () => new THREE.MeshBasicMaterial({ map: venSigns }));
  const signQuad = (i: number, w: number, h: number) => {
    const [v0, v1] = sv(i);
    return quad(w, h, 0, v0, 1, v1);
  };
  k.at(signM, signQuad(0, 6, 0.75), 53, 4.2, Z1 - 0.7, Math.PI);
  k.at(signM, signQuad(1, 6, 0.75).rotateY(-Math.PI / 2), XM - 0.68, 7.4, -276);
  k.at(signM, signQuad(16, 4, 0.6), 53, 6.6, ZL + 0.75);

  // ---------- Grand Canal hall ----------
  const hallW = X1 - XM;
  const hallD = Z1 - Z0;
  const hallCX = (XM + X1) / 2;
  const hallCZ = (Z0 + Z1) / 2;
  // Bank paving (warm stone) + St. Mark's checker
  const bankMat = texFloor(venetianFloorTexture(), hallW, hallD, 6, { roughness: 0.5, color: 0xf2e2c8 });
  const floorH = mesh(new THREE.PlaneGeometry(hallW, hallD), bankMat, hallCX, 0.03, hallCZ);
  floorH.rotation.x = -Math.PI / 2;
  g.add(floorH);
  // Canal water + stone curbs + boarding docks
  const cx0 = 71;
  const cx1 = 79;
  const cz0 = SQ;
  const cz1 = -250;
  const water = mesh(new THREE.PlaneGeometry(cx1 - cx0, cz1 - cz0), poolWater(), (cx0 + cx1) / 2, 0.06, (cz0 + cz1) / 2);
  water.rotation.x = -Math.PI / 2;
  g.add(water);
  b.waterZones.push({ name: 'Grand Canal (indoors)', minX: cx0, maxX: cx1, minZ: cz0, maxZ: cz1, y: 0.06 });
  b.box(cx0 - 0.3, 0, (cz0 + cz1) / 2, 0.6, 0.5, cz1 - cz0 + 0.6, stone);
  b.box(cx1 + 0.3, 0, (cz0 + cz1) / 2, 0.6, 0.5, cz1 - cz0 + 0.6, stone);
  b.box((cx0 + cx1) / 2, 0, cz0 - 0.3, cx1 - cx0 + 1.2, 0.5, 0.6, stone);
  const dock = mat(0x7a5232, 0.85);
  b.box((cx0 + cx1) / 2, 0, -248, cx1 - cx0, 0.45, 3.4, dock);
  b.box((cx0 + cx1) / 2, 0, cz1 + 0.3, cx1 - cx0, 0.04, 0.6, dock);
  // Striped mooring poles
  const poleTex = canopyStripeTexture('#ffffff', '#1f4a8a', '#c9a24a');
  const pole = texMat('mooring', () => new THREE.MeshStandardMaterial({ map: poleTex, roughness: 0.6 }));
  for (const [px, pz] of [
    [cx0 + 0.4, -253],
    [cx1 - 0.4, -253],
    [cx0 + 0.4, -297],
    [cx1 - 0.4, -297],
  ]) {
    k.at(pole, new THREE.CylinderGeometry(0.13, 0.13, 3, 8), px, 1.5, pz);
    k.at(gilt, new THREE.SphereGeometry(0.18, 8, 6), px, 3.05, pz);
  }
  // Two arched footbridges (walk over; gondolas glide under)
  for (const bz of [-263, -286]) {
    stairs(b, cx0 - 4, bz, '+x', 3, 2.8, 4, stone);
    stairs(b, cx1 + 4, bz, '-x', 3, 2.8, 4, stone);
    b.box((cx0 + cx1) / 2, 2.45, bz, cx1 - cx0, 0.35, 3, stone);
    for (const s of [-1, 1]) {
      k.box(stone, (cx0 + cx1) / 2, 3.3, bz + s * 1.42, cx1 - cx0 + 0.4, 0.12, 0.2);
      for (let x = cx0; x <= cx1 + 0.01; x += 0.5) k.cyl(stone, x, 2.8, bz + s * 1.42, 0.05, 0.07, 0.5, 5);
      // arch fascia under the deck
      const arch = new THREE.TorusGeometry(4.6, 0.25, 5, 20, Math.PI);
      arch.scale(1, 0.24, 1);
      k.at(stone, arch, (cx0 + cx1) / 2, 1.4, bz + s * 1.6);
      b.collider(cx0 - 4, cx1 + 4, bz + s * 1.42 - 0.12, bz + s * 1.42 + 0.12, 2.8, 3.4, true);
    }
  }

  // Facades: 6 m × 12 m Venetian fronts down both banks and round St. Mark's Square
  const atlas = venetianFacadeAtlas();
  const facadeM = texMat('ven-facade', () => new THREE.MeshStandardMaterial({ map: atlas.map, emissiveMap: atlas.glow, emissive: 0xffffff, emissiveIntensity: 0.95, roughness: 0.85 }));
  const ironM = mat(0x1e1c1a, 0.5, 0.5);
  const boxM = mat(0x9a4a2a, 0.8);
  const bloom = [0xff4d6a, 0xffffff, 0xffc63d, 0xd94dff, 0xff7a2a].map((c) => mat(c, 0.6, 0, { emissive: c, emissiveIntensity: 0.06 }));
  const leafM = mat(0x2f6b3a, 0.75);
  const awnTex = [canopyStripeTexture('#f3eee0', '#2f5a3e', '#c9a24a'), canopyStripeTexture('#f3eee0', '#8a1c22', '#c9a24a'), canopyStripeTexture('#f3eee0', '#1f3f7a', '#c9a24a')];
  const awnM = awnTex.map((t, i) => texMat(`ven-awn${i}`, () => new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, side: THREE.DoubleSide })));
  const r = rand(331);
  let shop = 2;
  /** One facade unit: centre on the wall line (wx, wz), outward normal (nx, nz). */
  const unit = (wx: number, wz: number, nx: number, nz: number, variant: number, portal = -1, ph = 3) => {
    const ry = Math.atan2(nx, nz);
    const tx = -nz; // along-wall direction (right-hand when facing out)
    const tz = nx;
    const P = (along: number, out: number): [number, number] => [wx + tx * along + nx * out, wz + tz * along + nz * out];
    const [fx, fz] = P(0, 0.02);
    k.at(facadeM, quad(6, 12, variant * 0.25, 0, variant * 0.25 + 0.25, 1), fx, 6, fz, ry);
    // string courses + cornice
    for (const [y, h, d] of [
      [4.0, 0.22, 0.3],
      [8.0, 0.2, 0.25],
      [12.0, 0.5, 0.7],
    ]) {
      const [sx, sz] = P(0, d / 2);
      k.box(stone, sx, y, sz, 6.04, h, d, ry);
    }
    if (portal >= 0) {
      // A grand archway in this unit (a real doorway behind it)
      const [px, pz] = P(0, 0.12);
      k.box(stone, px, 6.6, pz, ph * 2 + 1.2, 0.6, 0.3, ry);
      for (const s of [-1, 1]) {
        const [qx, qz] = P(s * (ph + 0.3), 0.3);
        k.box(stone, qx, 3.3, qz, 0.6, 6.6, 0.6, ry);
      }
      const [lx, lz] = P(0, 0.25);
      k.at(signM, signQuad(portal, 4.4, 0.6), lx, 7.3, lz, ry);
      return;
    }
    // Balcony on the second floor (centred on one window pair)
    const side = variant % 2 ? -1 : 1;
    const [bx, bz] = P(side * 1.5, 0.45);
    k.box(stone, bx, 4.55, bz, 2.6, 0.16, 0.9, ry);
    for (let i = 0; i <= 8; i++) {
      const [cx, cz] = P(side * 1.5 - 1.2 + i * 0.3, 0.85);
      k.cyl(stone, cx, 4.63, cz, 0.04, 0.06, 0.6, 5);
    }
    const [rx2, rz2] = P(side * 1.5, 0.85);
    k.box(stone, rx2, 5.27, rz2, 2.6, 0.1, 0.12, ry);
    // Window boxes with flowers on the top floor
    for (const s of [-1, 1]) {
      const [wbx, wbz] = P(s * 1.5 + (r() - 0.5) * 0.1, 0.25);
      k.box(boxM, wbx, 8.55, wbz, 1.7, 0.32, 0.4, ry);
      for (let f = 0; f < 7; f++) {
        const [ffx, ffz] = P(s * 1.5 - 0.75 + f * 0.25, 0.3 + (r() - 0.5) * 0.15);
        k.at(f % 3 === 0 ? leafM : bloom[Math.floor(r() * bloom.length)], new THREE.IcosahedronGeometry(0.13, 0), ffx, 8.85 + r() * 0.1, ffz);
      }
    }
    // Iron lantern bracket between the shop windows + a projecting blade sign
    const [lx, lz] = P(0, 0.35);
    k.box(ironM, lx, 3.1, lz, 0.06, 0.06, 0.7, ry);
    k.at(lampGlow, new THREE.SphereGeometry(0.16, 8, 6).scale(1, 1.3, 1), lx, 2.85, lz);
    const [bsx, bsz] = P(side * 2.4, 0.9);
    const [brx, brz] = P(side * 2.4, 0.5);
    k.box(ironM, brx, 3.75, brz, 0.05, 0.05, 1.0, ry);
    const blade = signQuad(shop, 1.6, 0.45);
    k.at(signM, blade, bsx, 3.45, bsz, ry + Math.PI / 2);
    k.at(signM, signQuad(shop, 1.6, 0.45), bsx, 3.45, bsz, ry - Math.PI / 2);
    shop = shop >= 15 ? 2 : shop + 1;
    // Striped awning over one shop window
    if (r() > 0.35) {
      const [awx, awz] = P(-side * 1.5, 0.6);
      const aw = new THREE.PlaneGeometry(2.4, 1.3, 1, 1);
      aw.rotateX(-Math.PI / 2 + 0.55);
      k.at(awnM[Math.floor(r() * awnM.length)], aw, awx, 3.65, awz, ry);
    }
  };
  const W = 6;
  let v = 0;
  // West bank (wall at x 62, facing +x): 8 units centred on the lobby doors (z −276 and −252)
  for (let i = 0; i < 8; i++) {
    const z = -294 + W * i;
    unit(XM + 0.6, z, 1, 0, v++ % 4, z === -276 || z === -252 ? 17 : -1, z === -276 ? 4 : 3);
  }
  // East bank (x 88, facing −x)
  for (let i = 0; i < 9; i++) unit(X1 - 0.6, SQ + W * (i + 0.5), -1, 0, v++ % 4);
  // South end wall (z −246, facing −z… i.e. north into the hall)
  for (let i = 0; i < 4; i++) unit(XM + 1 + W * (i + 0.5), Z1 - 0.6, 0, -1, v++ % 4);
  // St. Mark's: west (casino doors at z −310), east, north
  for (let i = 0; i < 3; i++) {
    const z = Z0 + W * (i + 0.5);
    unit(XM + 0.6, z, 1, 0, v++ % 4, Math.abs(z + 309) < 3.1 ? 16 : -1);
    unit(X1 - 0.6, z, -1, 0, v++ % 4);
  }
  for (let i = 0; i < 4; i++) unit(XM + 1 + W * (i + 0.5), Z0 + 0.6, 0, 1, v++ % 4);

  // Lamps along the canal + round the square
  for (let z = -296; z <= -252; z += 8.8) {
    for (const x of [cx0 - 1.3, cx1 + 1.3]) {
      if (Math.abs(z + 263) < 2.5 || Math.abs(z + 286) < 2.5) continue;
      lampPost(k, x, z, 3.6, lampGlow);
      b.collider(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 3.6, true);
    }
  }
  for (const [x, z] of [
    [65, -303],
    [85, -303],
    [65, -315],
    [85, -315],
  ]) {
    lampPost(k, x, z, 4.2, lampGlow);
    b.collider(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 4.2, true);
  }

  // Painted sky vault over the whole hall (fixed late-afternoon phase)
  const skyMat = paintedSkyMaterial(0.37);
  const vault = new THREE.PlaneGeometry(hallW, hallD, 20, 1);
  vault.rotateX(Math.PI / 2);
  const vp = vault.attributes.position as THREE.BufferAttribute;
  const R = 29.7;
  for (let i = 0; i < vp.count; i++) {
    const dx = vp.getX(i);
    vp.setY(i, Math.sqrt(R * R - dx * dx) - Math.sqrt(R * R - 13 * 13));
  }
  vault.computeVertexNormals();
  const vaultMesh = new THREE.Mesh(vault, skyMat);
  vaultMesh.position.set(hallCX, 12.25, hallCZ);
  g.add(vaultMesh);
  // Lunettes at both ends of the vault, painted too
  for (const z of [Z0 + 0.62, Z1 - 0.62]) {
    const sh = new THREE.Shape();
    sh.moveTo(-13, 0);
    for (let i = 0; i <= 20; i++) {
      const x = -13 + (26 * i) / 20;
      sh.lineTo(x, Math.sqrt(R * R - x * x) - Math.sqrt(R * R - 169) + 0.05);
    }
    sh.lineTo(13, 0);
    const lg = new THREE.ShapeGeometry(sh);
    const lm = new THREE.Mesh(lg, skyMat);
    lm.position.set(hallCX, 12.2, z);
    g.add(lm);
  }

  // ---------- St. Mark's Square ----------
  // Café tables with white cloths and bistro chairs
  const cloth = mat(0xf6f2ea, 0.8);
  const chairM = mat(0x2a2420, 0.5, 0.4);
  const tables: Array<[number, number]> = [
    [67, -304],
    [67, -309],
    [67, -314],
    [83, -304],
    [83, -309],
    [83, -314],
    [71.5, -312],
    [78.5, -312],
  ];
  for (const [tx, tz] of tables) {
    k.cyl(ironM, tx, 0, tz, 0.06, 0.25, 0.72, 8);
    k.cyl(cloth, tx, 0.62, tz, 0.55, 0.62, 0.16, 16);
    for (let c = 0; c < 3; c++) {
      const a = (c / 3) * Math.PI * 2 + tx;
      const chx = tx + Math.cos(a) * 0.95;
      const chz = tz + Math.sin(a) * 0.95;
      k.cyl(chairM, chx, 0.42, chz, 0.24, 0.24, 0.06, 10);
      for (const [ox, oz] of [
        [0.15, 0.15],
        [-0.15, 0.15],
        [0.15, -0.15],
        [-0.15, -0.15],
      ]) k.cyl(chairM, chx + ox, 0, chz + oz, 0.02, 0.02, 0.42, 4);
      k.at(chairM, new THREE.BoxGeometry(0.46, 0.5, 0.04), chx + Math.cos(a) * 0.22, 0.75, chz + Math.sin(a) * 0.22, -a + Math.PI / 2);
    }
    b.collider(tx - 0.6, tx + 0.6, tz - 0.6, tz + 0.6, 0, 0.78);
  }
  // A little bandstand stage + living statue (gilded) + an opera singer
  b.box(75, 0, -315.5, 6, 0.5, 3, mat(0x5a3a22, 0.7));
  k.box(mat(0x8a1c22, 0.7), 75, 0.55, -316.9, 6, 0.1, 0.2);
  statue(k, gilt, 69.5, 0.8, -307, 1.9, Math.PI / 2, 0, mat(0x6a5a48, 0.7));
  b.collider(68.8, 70.2, -307.7, -306.3, 0, 0.8, true);
  const singer = new THREE.Group();
  const gown = mat(0x6a1a3a, 0.5, 0.1);
  singer.add(mesh(new THREE.ConeGeometry(0.55, 1.4, 12), gown, 0, 0.7, 0));
  singer.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 10), gown, 0, 1.6, 0));
  singer.add(mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(0xe8b892, 0.6), 0, 2.02, 0));
  singer.add(mesh(new THREE.SphereGeometry(0.19, 10, 8), mat(0x3a2414, 0.7), 0, 2.08, -0.05));
  const arm = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), mat(0xe8b892, 0.6), 0.3, 1.85, 0.15);
  arm.rotation.z = -0.9;
  singer.add(arm);
  singer.position.set(75, 0.5, -315.6);
  g.add(singer);
  b.collider(74.5, 75.5, -316.1, -315.1, 0.5, 2.4, true);
  b.crowd.performers.push({ kind: 'showgirl', x: 80.5, z: -306, facing: -Math.PI / 2 });

  // Hanging Murano-glass lanterns over the square
  const murano = new THREE.MeshStandardMaterial({ color: 0xffd6a0, emissive: 0xffb860, emissiveIntensity: 1.2, roughness: 0.2 });
  for (const [x, z] of [
    [70, -306],
    [80, -306],
    [75, -310],
  ]) {
    k.at(ironM, new THREE.CylinderGeometry(0.02, 0.02, 5, 4), x, 11.5, z);
    k.at(murano, new THREE.OctahedronGeometry(0.45, 1).scale(1, 1.4, 1), x, 8.7, z);
  }

  k.flush(g);

  // ---------- Gondolas on the indoor canal (rideable) ----------
  const gx = (cx0 + cx1) / 2;
  const zN = cz0 + 3.2;
  const zS = cz1 - 3.2;
  const boats: Array<{ g: THREE.Group; z: number; dir: number; riding: boolean; done: boolean; dwell: number; oar: THREE.Object3D }> = [];
  for (let i = 0; i < 2; i++) {
    const boat = gondola(i === 0 ? 0x8a1c1c : 0x1f3f7a);
    boat.position.set(gx, 0, i === 0 ? zS : zN);
    g.add(boat);
    boats.push({ g: boat, z: boat.position.z, dir: i === 0 ? -1 : 1, riding: false, done: false, dwell: i * 4, oar: boat.children[boat.children.length - 1] });
  }
  b.every((dt, t) => {
    if (!g.visible && !boats.some((bt) => bt.riding)) return;
    for (const gd of boats) {
      if (gd.dwell > 0) gd.dwell -= dt;
      else {
        gd.z += gd.dir * (gd.riding ? 2.2 : 1.5) * dt;
        if (gd.z < zN) {
          gd.z = zN;
          gd.dir = 1;
          gd.dwell = 5;
          if (gd.riding) gd.done = true;
        } else if (gd.z > zS) {
          gd.z = zS;
          gd.dir = -1;
          gd.dwell = 5;
          if (gd.riding) gd.done = true;
        }
      }
      gd.g.position.z = gd.z;
      gd.g.rotation.y = gd.dir > 0 ? Math.PI : 0;
      gd.g.position.y = Math.sin(t * 1.4 + gd.z) * 0.03;
      gd.oar.rotation.z = Math.sin(t * 1.8) * 0.15;
    }
    sphere.rotation.y = t * 0.12;
    singer.position.y = 0.5 + Math.abs(Math.sin(t * 2.2)) * 0.03;
    arm.rotation.z = -0.9 - Math.sin(t * 0.9) * 0.35;
  });
  boats.forEach((gd, i) => {
    b.rideables.push({
      id: `gondola-gcs-${i}`,
      kind: 'gondola',
      label: 'Grand Canal Gondola',
      boardRadius: 6,
      boardPoint: (out) => out.set(gx, 0.3, gd.z),
      seat: (out) => out.set(gx, 0.62 + gd.g.position.y, gd.z + (gd.dir > 0 ? -0.6 : 0.6)),
      yaw: () => (gd.dir > 0 ? 0 : Math.PI),
      exitPoint: (out) => (gd.z > zS - 3 ? out.set(gx, 0.6, -248) : gd.z < zN + 3 ? out.set(gx, 0.2, cz0 - 2) : out.set(cx0 - 1.8, 0.2, gd.z)),
      canBoard: () => ({ ok: true }),
      onBoard: () => {
        gd.riding = true;
        gd.done = false;
      },
      onExit: () => {
        gd.riding = false;
        gd.done = false;
      },
      wantsExit: () => gd.done,
      view: () => ({ yaw: gd.dir > 0 ? Math.PI : 0, pitch: 0.18, dist: 7 }),
      boardPrompt: 'Press [G] to ride a gondola down the Grand Canal (indoors, under the painted sky)',
      ridingPrompt: '🎶 Volare… gliding the Grand Canal Shoppes — [G] hop out',
    });
  });

  gated(b, g, X0, X1, Z0, Z1, 4);

  // ---------- Zones, life, pickups ----------
  b.zone('The Venetian Lobby', X0, XM, ZL, Z1);
  b.zone('Grand Canal Shoppes', XM, X1, SQ, Z1);
  b.zone("St. Mark's Square • Grand Canal Shoppes", XM, X1, Z0, SQ);
  b.crowd.tourists.push(
    { pts: [[48, -250], [48, -288], [58, -288], [58, -250]], prop: 'camera' },
    { pts: [[46, -276], [56, -276], [66, -276], [67, -298]], prop: 'bag' },
    { pts: [[66, -252], [66, -298], [70, -304], [80, -304]], prop: 'bag' },
    { pts: [[83, -250], [83, -296], [66, -316]], prop: 'camera' },
    { pts: [[72, -303], [78, -303], [78, -310], [72, -310]], prop: 'cig' }
  );
  b.pickup(75, 3.4, -263, 3, 'Grand Canal Bridge Pack', true);
  b.pickup(83, 1.1, -309, 3, 'Caffè Florian Table Smokes', true);
  b.pickup(53, 1.6, -249.6, 2, 'Venetian Reception Matchbook Pack', true);
  b.staticMarkers.push({ x: 75, z: -282, color: '#7fd8ff', glyph: '≈', size: 2.6 });
  b.building(75, -282, 26, 72, '#e8c4b4', 'Grand Canal Shoppes');
  b.building(53, -268, 18, 45, '#e8c4b4');
}

/** Black gondola with a red/blue seat and a singing gondolier (last child = the gondolier, for oar sway). */
function gondola(seat: number): THREE.Group {
  const g = new THREE.Group();
  const black = mat(0x0c0c10, 0.3, 0.3);
  g.add(mesh(new THREE.BoxGeometry(1.3, 0.5, 7), black, 0, 0.3, 0));
  for (const s of [-1, 1]) {
    const tip = mesh(new THREE.ConeGeometry(0.4, 1.6, 6), black, 0, 0.7, s * 3.8);
    tip.rotation.x = s * 1.2;
    g.add(tip);
  }
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.08), mat(0xd9ae4a, 0.3, 0.9), 0, 1.15, 4.3));
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.25, 1.6), mat(seat, 0.6), 0, 0.6, 0.6));
  const gondolier = new THREE.Group();
  gondolier.add(mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.8, 8), mat(0x1c1c1c, 0.6), 0, 0.95, 0));
  gondolier.add(mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.6, 10), mat(0xf4f4f4, 0.6), 0, 1.65, 0));
  for (let k = 0; k < 3; k++) gondolier.add(mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.06, 10), mat(0xc4141c, 0.6), 0, 1.45 + k * 0.18, 0));
  gondolier.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0xe2ae88, 0.6), 0, 2.1, 0));
  gondolier.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), mat(0xe8d48a, 0.7), 0, 2.25, 0));
  const oar = mesh(new THREE.BoxGeometry(0.06, 0.06, 3.4), mat(0x6b4a2a, 0.7), 0.4, 1.4, -0.6);
  oar.rotation.x = 0.7;
  gondolier.add(oar);
  gondolier.position.z = -2.6;
  g.add(gondolier);
  return g;
}

