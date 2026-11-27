import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { buildAbcStore } from './abcStore';
import { stairs } from './buildings';
import { buildInNOut, buildWhataburger } from './food';
import { basic, mat, mesh, neonSign, palmTree, planter } from './props';
import { LedBoard, makePaverTexture } from './textures';

/**
 * Real Strip food + ABC Stores (Nov 2026):
 * - BLVD (3747 S LVB, replaced the Hawaiian Marketplace): ABC #115 at street level, the flagship
 *   rooftop In-N-Out (opened June 2026) on the 3rd level with its terrace.
 * - Whataburger, 3752 S LVB — right across the Boulevard, next to the Waldorf Astoria.
 * - In-N-Out on the LINQ Promenade (built in eastSide.ts), Dean Martin Dr (drive-thru + company store),
 *   and Russell Rd across from Allegiant (drive-thru).
 * - ABC Stores #104 (Showcase, 3771 S LVB) and #102 (Fashion Show). #103 Miracle Mile is in eastSide.ts.
 */
export function buildFoodAndShops(b: WorldBuilder): void {
  buildBlvd(b);
  b.restaurants.push(buildWhataburger(b, -40, 303, Math.PI / 2, 'Whataburger (3752 S Las Vegas Blvd)'));
  b.restaurants.push(buildInNOut(b, -150, 819, Math.PI / 2, { name: 'In-N-Out (Russell Rd, across from Allegiant)', standalone: true }));
  buildAbcStore(b, 32, 361, -Math.PI / 2, { label: 'ABC Stores #104 (Showcase)', w: 22, d: 17 });
  buildAbcStore(b, -33, -423, Math.PI / 2, { label: 'ABC Stores #102 (Fashion Show)', w: 17, d: 18 });
}

function buildBlvd(b: WorldBuilder): void {
  const x0 = 21;
  const x1 = 66;
  const z0 = 228;
  const z1 = 300;
  const roofY = 12;
  const glass = mat(0x24384a, 0.1, 0.7);
  const band = mat(0xe8e4dc, 0.5, 0.2);

  // ABC Stores #115 at street level (front faces the Strip)
  buildAbcStore(b, 31, 242, -Math.PI / 2, { label: 'ABC Stores #115 (BLVD)', w: 24, d: 18 });
  // Massing around it: retail + level 2, then the roof deck
  b.box((x0 + x1) / 2, 0, (255 + z1) / 2, x1 - x0, roofY, z1 - 255, glass, true);
  b.box((41 + x1) / 2, 0, (z0 + 255) / 2, x1 - 41, roofY, 255 - z0, glass, true);
  b.box((x0 + 41) / 2, 5.6, (z0 + 255) / 2, 41 - x0, roofY - 5.6, 255 - z0, glass, true);
  b.box((x0 + x1) / 2, roofY, (z0 + z1) / 2, x1 - x0, 0.6, z1 - z0, mat(0xcfc8bc, 0.7), false);
  // Floor bands + vertical mullions on the Strip face
  for (const y of [5.6, 11.6]) b.add(mesh(new THREE.BoxGeometry(0.5, 0.5, z1 - z0 + 0.6), band, x0 - 0.2, y, (z0 + z1) / 2));
  for (let z = z0 + 3; z < z1; z += 4.5) b.add(mesh(new THREE.BoxGeometry(0.3, roofY, 0.25), band, x0 - 0.1, roofY / 2, z));
  // The ground-floor storefronts along the remaining frontage (JD Sports, H&M, MINISO, adidas,
  // lululemon, Pandora, PUMA) are built in frontageTropHarmon.ts.
  // Big LED wall + giant BLVD letters on the roof edge
  const led = new LedBoard('BLVD', ['ROOFTOP IN-N-OUT NOW OPEN', '120,000 SQ FT OF ROOFTOP', 'ABC STORES • STREET LEVEL', 'EAT • DRINK • VEGAS'], ['#d81e2a', '#ffc72c', '#2c6bd1', '#ff2c8a'], 512, 256);
  const ledMesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: led.tex }));
  ledMesh.rotation.y = -Math.PI / 2;
  b.add(ledMesh, x0 - 0.35, 8.8, 280);
  b.every((_dt, t) => led.draw(t));
  b.add(neonSign('B L V D', '#0a0a0a', '#ffffff', 14, 3, undefined, 0.4), x0 + 0.5, roofY + 2.4, 240, -Math.PI / 2);

  // Rooftop: the flagship In-N-Out + terrace (palms, string lights, glass rail)
  const ino = buildInNOut(b, 52, 262, -Math.PI / 2, { name: 'In-N-Out (BLVD rooftop — the big one)', standalone: false, y: roofY + 0.6, w: 22, d: 15 });
  ino.busy = 1;
  b.restaurants.push(ino);
  const railGlass = new THREE.MeshStandardMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.3, roughness: 0.05 });
  b.box(x0 + 0.2, roofY + 0.6, (z0 + z1) / 2, 0.15, 1.1, z1 - z0 - 6, railGlass, true, false);
  b.box((x0 + x1) / 2, roofY + 0.6, z0 + 0.2, x1 - x0, 1.1, 0.15, railGlass, true, false);
  for (const [px, pz] of [
    [25, 232],
    [25, 286],
    [40, 296],
    [62, 232],
  ]) {
    b.add(planter(2, 2, 0xff4d4d), px, roofY + 0.6, pz);
    b.add(palmTree(5.5, false, px + pz), px, roofY + 1.2, pz);
  }
  const bulb = basic(0xffe2a0);
  for (let z = z0 + 4; z < z1; z += 2.5) b.add(mesh(new THREE.SphereGeometry(0.1, 5, 4), bulb, 30 + Math.sin(z) * 0.3, roofY + 4.2, z));
  b.pickup(27, roofY + 1.4, 296, 4, 'Rooftop Terrace Pack', false);
  // Rooftop dining district: pavers, a bar, fire pits, lounge seating, shade sails
  const deckMat = new THREE.MeshStandardMaterial({ map: makePaverTexture('#b9a98e', '#8f8068', 6), roughness: 0.8 });
  deckMat.map!.repeat.set((x1 - x0) / 5, (z1 - z0) / 5);
  b.floor((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, deckMat, roofY + 0.62);
  const barWood = mat(0x5a3a22, 0.6);
  b.box(36, roofY + 0.6, 238, 10, 1.1, 1.2, barWood, true);
  b.add(mesh(new THREE.BoxGeometry(10.3, 0.08, 1.5), mat(0x1a1a22, 0.2, 0.4)), 36, roofY + 1.74, 238);
  b.add(neonSign('ROOFTOP BAR', '#120a14', '#ff8ad8', 6, 1.0, undefined, 0.08), 36, roofY + 4.2, 236.5);
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(36, roofY + 0.6, 240.2), radius: 3, label: 'BLVD Rooftop Bar' });
  const fire = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 1.6 });
  for (const [px, pz] of [
    [30, 252],
    [30, 274],
    [62, 286],
  ]) {
    b.add(mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.5, 16), mat(0x3a3a40, 0.6), px, roofY + 0.85, pz));
    b.add(mesh(new THREE.ConeGeometry(0.6, 0.9, 8), fire, px, roofY + 1.5, pz));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.add(mesh(new THREE.BoxGeometry(1.4, 0.45, 0.8), mat(0xf2efe6, 0.8), px + Math.cos(a) * 2.4, roofY + 0.85, pz + Math.sin(a) * 2.4, true));
    }
  }
  const sail = mat(0xf7f5f0, 0.9, 0, { side: THREE.DoubleSide });
  for (const [px, pz, rot] of [
    [33, 260, 0.3],
    [33, 280, -0.2],
    [60, 240, 0.5],
  ]) {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(6, 0.05, 3), sail);
    tri.position.set(px, roofY + 5.2, pz);
    tri.rotation.set(0.12, rot, 0.08);
    b.add(tri);
    b.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 6), mat(0x8a8d93, 0.4, 0.7), px + 4, roofY + 3.1, pz + 2));
  }
  b.zone('BLVD Rooftop', x0, x1, z0, z1);

  // Grand stair up the south side + a glass elevator from the sidewalk
  const stone = mat(0xd8d2c4, 0.7);
  stairs(b, x0, 302.4, '+x', 4.6, roofY + 0.6, 34, stone);
  b.add(neonSign('IN-N-OUT • ROOFTOP', '#d81e2a', '#ffffff', 6, 0.9, 'UP THE STAIRS ↑', 0.08), x0 - 0.2, 3, 304.9, -Math.PI / 2);
  let cabY = 0.2;
  let target = 0.2;
  const cab = mesh(new THREE.BoxGeometry(2, 2.6, 2), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.4 }), 22, 1.3, 307.5);
  b.scene.add(cab);
  b.every((dt) => {
    cabY += Math.sign(target - cabY) * Math.min(Math.abs(target - cabY), dt * 4);
    cab.position.y = cabY + 1.3;
  });
  const top = roofY + 0.6;
  b.rideables.push(
    {
      id: 'blvd-up',
      kind: 'elevator',
      label: 'BLVD Glass Elevator',
      boardRadius: 2.6,
      boardPoint: (out) => out.set(22, 0, 307.5),
      seat: (out) => out.set(22, cabY + 0.05, 307.5),
      yaw: () => 0,
      exitPoint: (out) => (cabY > top - 1 ? out.set(24, top + 0.1, 297) : out.set(19.5, 0.2, 307.5)),
      canBoard: () => ({ ok: true }),
      onBoard: () => {
        target = top;
      },
      wantsExit: () => Math.abs(cabY - top) < 0.05,
      boardPrompt: 'Press [G] — elevator up to the rooftop In-N-Out',
      ridingPrompt: 'Going up to the BLVD rooftop…',
    },
    {
      id: 'blvd-down',
      kind: 'elevator',
      label: 'BLVD Glass Elevator',
      boardRadius: 2.4,
      boardPoint: (out) => out.set(24, top, 297),
      seat: (out) => out.set(22, cabY + 0.05, 307.5),
      yaw: () => 0,
      exitPoint: (out) => (cabY < 1 ? out.set(19.5, 0.2, 307.5) : out.set(24, top + 0.1, 297)),
      canBoard: () => ({ ok: true }),
      onBoard: () => {
        cabY = top;
        target = 0.2;
      },
      wantsExit: () => Math.abs(cabY - 0.2) < 0.05,
      boardPrompt: 'Press [G] — elevator back down to the Strip',
      ridingPrompt: 'Going down…',
    }
  );
  b.building((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, '#24384a', 'BLVD');
  b.zone('BLVD (ex-Hawaiian Marketplace)', 19, x1, z0, 312);
  b.crowd.tourists.push(
    { pts: [[16, 230], [16, 300]], prop: 'bag' },
    { pts: [[30, 236], [60, 236]], prop: 'yard-drink' },
    { pts: [[28, 290], [28, 240]], prop: 'camera' }
  );
}

export { THREE };
