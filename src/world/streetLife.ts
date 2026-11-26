import * as THREE from 'three';
import { viewer, type WorldBuilder } from './builder';
import { BX, CY, K, part, signs } from './backOfHouse';
import { car, mat } from './props';
import { litterGeometry, litterMaterial, mistMaterial, registerStreetTick, signGeometry, wetSheenMaterial } from './streetTextures';
import { CROSSWALKS, STRIP } from './strip';
import { buildCornerRails } from './stripRails';
import { rng } from './textures';

/**
 * Street life along the Boulevard:
 * - ambient walkers: an instanced crowd (6 draw calls for everyone) that streams along both sidewalks
 *   around the camera, denser at night;
 * - taxi + rideshare queues, valet podiums and bellhop luggage carts at the porte-cochères;
 * - shade structures with misters (animated mist, wet sheen on the pavers);
 * - water-bottle sellers with coolers, flyer litter round the card slappers, overflowing trash;
 * - generic costumed performers (silver robot, living statue) on the busy corners.
 */
export function buildStreetLife(b: WorldBuilder): void {
  registerStreetTick(b);
  const R = rng(8080);
  buildWalkers(b);
  buildPorteCocheres(b);
  buildMisters(b, R);
  buildSidewalkTrade(b, R);
  buildCornerRails(b); // no at-grade crossing at the bridge intersections (stripRails.ts)
}

// ---------------------------------------------------------------- ambient walkers (instanced)
const SKIN = [0xf2c8a8, 0xe2ae88, 0xc88c64, 0x9b6342, 0x6b412a];
const HAIR = [0x1c1512, 0x4a2e1b, 0x9c6b30, 0xd8b158, 0x7b2c25, 0x8e939e];
const SHIRT = [0xff5a7a, 0x2ec4ff, 0xffc83d, 0x4de088, 0xb874ff, 0xff7b3b, 0xf2f0eb, 0x26354d, 0x111111, 0xd8352b, 0xf4f4f4, 0x1e8c5a];
const PANTS = [0x212c42, 0x2c2b30, 0x453b31, 0x3b4d6b, 0xd6cbb8, 0x1a1a1e];

function buildWalkers(b: WorldBuilder): void {
  const N = 150;
  const R = rng(321);
  const humanMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const torsoGeo = new THREE.CylinderGeometry(0.19, 0.16, 0.66, 7).translate(0, 1.16, 0);
  const armL = new THREE.BoxGeometry(0.09, 0.58, 0.1).translate(-0.24, 1.14, 0);
  const armR = new THREE.BoxGeometry(0.09, 0.58, 0.1).translate(0.24, 1.14, 0);
  const torso = mergeSimple([torsoGeo, armL, armR]);
  const head = new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.62, 0.01);
  const hair = new THREE.SphereGeometry(0.128, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.645, -0.01);
  const leg = new THREE.BoxGeometry(0.13, 0.82, 0.15).translate(0, -0.41, 0);
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const blob = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);
  const meshes = {
    torso: new THREE.InstancedMesh(torso, humanMat, N),
    head: new THREE.InstancedMesh(head, humanMat, N),
    hair: new THREE.InstancedMesh(hair, humanMat, N),
    legL: new THREE.InstancedMesh(leg, humanMat, N),
    legR: new THREE.InstancedMesh(leg, humanMat, N),
    blob: new THREE.InstancedMesh(blob, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), N),
  };
  const c = new THREE.Color();
  interface W {
    x: number;
    z: number;
    dir: 1 | -1;
    speed: number;
    phase: number;
    scale: number;
  }
  const ws: W[] = [];
  for (let i = 0; i < N; i++) {
    const side = i % 2 ? 1 : -1;
    const lane = (i >> 1) % 2;
    const dir: 1 | -1 = (side > 0) === (lane === 0) ? 1 : -1;
    ws.push({ x: side * (16.9 + lane * 1.3 + (R() - 0.5) * 0.4), z: 0, dir, speed: 1.1 + R() * 0.6, phase: R() * 6.28, scale: 0.92 + R() * 0.16 });
    meshes.torso.setColorAt(i, c.setHex(SHIRT[Math.floor(R() * SHIRT.length)]));
    meshes.head.setColorAt(i, c.setHex(SKIN[Math.floor(R() * SKIN.length)]));
    meshes.hair.setColorAt(i, c.setHex(HAIR[Math.floor(R() * HAIR.length)]));
    const pc = PANTS[Math.floor(R() * PANTS.length)];
    meshes.legL.setColorAt(i, c.setHex(pc));
    meshes.legR.setColorAt(i, c.setHex(pc));
  }
  for (const m of Object.values(meshes)) {
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = m !== meshes.blob;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    b.scene.add(m);
  }
  const WINDOW = 130;
  let seeded = false;
  const dummy = new THREE.Object3D();
  const hidden = (z: number) => Math.abs(z) < 20 || Math.abs(z - STRIP.tropicanaZ) < 20 || z < STRIP.north + 6 || z > 885;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  b.every((dt, t, night) => {
    const cam = viewer.cam;
    const on = Math.abs(cam.x) < 70 && cam.y < 90;
    for (const m of Object.values(meshes)) m.visible = on;
    if (!on) return;
    const count = Math.round(THREE.MathUtils.lerp(90, N, night));
    if (!seeded) {
      for (const w of ws) w.z = cam.z + (R() - 0.5) * 2 * WINDOW;
      seeded = true;
    }
    for (let i = 0; i < count; i++) {
      const w = ws[i];
      w.z += w.dir * w.speed * dt;
      if (w.z - cam.z > WINDOW) w.z -= 2 * WINDOW;
      else if (cam.z - w.z > WINDOW) w.z += 2 * WINDOW;
      if (hidden(w.z)) {
        for (const m of Object.values(meshes)) m.setMatrixAt(i, zero);
        continue;
      }
      w.phase += dt * w.speed * 3.6;
      const bob = Math.abs(Math.sin(w.phase)) * 0.035;
      const yaw = w.dir > 0 ? 0 : Math.PI;
      dummy.position.set(w.x, bob, w.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(w.scale);
      dummy.updateMatrix();
      meshes.torso.setMatrixAt(i, dummy.matrix);
      meshes.head.setMatrixAt(i, dummy.matrix);
      meshes.hair.setMatrixAt(i, dummy.matrix);
      dummy.position.set(w.x, 0.08, w.z);
      dummy.updateMatrix();
      meshes.blob.setMatrixAt(i, dummy.matrix);
      const swing = Math.sin(w.phase) * 0.5;
      for (const [m, s] of [
        [meshes.legL, 1],
        [meshes.legR, -1],
      ] as Array<[THREE.InstancedMesh, number]>) {
        dummy.position.set(w.x + Math.cos(yaw) * s * 0.1 * w.scale, 0.83 * w.scale + bob, w.z - Math.sin(yaw) * s * 0.1 * w.scale);
        dummy.rotation.set(s * swing, yaw, 0, 'YXZ');
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      }
    }
    for (const m of Object.values(meshes)) {
      m.count = count;
      m.instanceMatrix.needsUpdate = true;
    }
    void t;
  });
}

function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // tiny merge for non-indexed + indexed mixes: convert all to non-indexed with position/normal only
  const parts = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    return n;
  });
  let count = 0;
  for (const p of parts) count += p.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

// ---------------------------------------------------------------- porte-cochères: taxis, rideshare, valet, bellhops
function valetPodium(b: WorldBuilder): THREE.Group {
  const g = new THREE.Group();
  part(g, BX(1.0, 1.15, 0.6), mat(0x2a2016, 0.5, 0.3), 0, 0.58, 0);
  part(g, BX(1.1, 0.06, 0.7), mat(0xc8a24a, 0.35, 0.8), 0, 1.18, 0);
  part(g, signGeometry('valet', 0.95, 0.11, 0.02), signs(b), 0, 0.85, 0.31);
  part(g, BX(0.6, 1.4, 0.15), mat(0x3a2a1a, 0.6), 0.9, 0.7, -0.2); // key box
  part(g, CY(0.03, 0.03, 2.2, 6), K.steel, -0.7, 1.1, 0);
  part(g, new THREE.ConeGeometry(0.9, 0.35, 8), mat(0x1a1a1e, 0.8), -0.7, 2.25, 0);
  return g;
}
function luggageCart(R: () => number): THREE.Group {
  const g = new THREE.Group();
  const brass = mat(0xc8a24a, 0.3, 0.85);
  part(g, BX(1.0, 0.08, 1.7), mat(0x8a1c22, 0.85), 0, 0.3, 0);
  for (const s of [-1, 1]) {
    part(g, CY(0.025, 0.025, 1.6, 6), brass, s * 0.48, 1.1, 0.82);
    part(g, CY(0.025, 0.025, 1.6, 6), brass, s * 0.48, 1.1, -0.82);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.025, 4, 10, Math.PI), brass);
  arch.position.set(0, 1.9, 0.82);
  g.add(arch);
  const arch2 = arch.clone();
  arch2.position.z = -0.82;
  g.add(arch2);
  part(g, CY(0.025, 0.025, 1.64, 6), brass, 0, 2.38, 0, 0, Math.PI / 2);
  for (const sx of [-0.4, 0.4]) for (const sz of [-0.7, 0.7]) part(g, CY(0.09, 0.09, 0.06, 8), K.rubber, sx, 0.1, sz, 0, 0, Math.PI / 2);
  const cols = [0x1a1a1e, 0x8a1c1c, 0x2a4a8a, 0xc8a24a, 0x4a4a52, 0xd8d0bc];
  let y = 0.34;
  for (let i = 0; i < 3; i++) {
    const h = 0.25 + R() * 0.2;
    part(g, BX(0.7 + R() * 0.2, h, 0.45 + R() * 0.2), mat(cols[Math.floor(R() * cols.length)], 0.6), (R() - 0.5) * 0.1, y + h / 2, (i - 1) * 0.5);
    if (R() < 0.5) {
      const h2 = 0.2 + R() * 0.15;
      part(g, BX(0.5, h2, 0.35), mat(cols[Math.floor(R() * cols.length)], 0.6), 0, y + h + h2 / 2, (i - 1) * 0.5);
    }
  }
  y += 0.1;
  return g;
}
function clutterAll<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) c.userData.clutter = true;
  });
  return o;
}
/** A queue of parked taxis/rideshare cars along a drive, nose toward `dirSign` along the axis. */
function carQueue(b: WorldBuilder, x0: number, z0: number, axis: 'x' | 'z', dirSign: 1 | -1, n: number, seed: number): void {
  const kinds: Array<['taxi' | 'sedan' | 'suv' | 'limo', number]> = [
    ['taxi', 0xf4c430],
    ['taxi', 0xf4c430],
    ['suv', 0x111111],
    ['taxi', 0x2a2a2a],
    ['sedan', 0xe8e8ea],
    ['taxi', 0xf4c430],
    ['limo', 0x11131c],
  ];
  for (let i = 0; i < n; i++) {
    const [kind, color] = kinds[(i + seed) % kinds.length];
    const c = car(kind, color);
    const along = i * (c.length + 1.4);
    const g = c.group;
    for (const ch of [...g.children]) {
      const m = ch as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).type === 'MeshBasicMaterial' && kind !== 'taxi') g.remove(m);
    }
    if (axis === 'x') g.position.set(x0 - dirSign * along, 0, z0);
    else g.position.set(x0, 0, z0 - dirSign * along);
    g.rotation.y = axis === 'x' ? (dirSign > 0 ? Math.PI / 2 : -Math.PI / 2) : dirSign > 0 ? 0 : Math.PI;
    b.add(clutterAll(g));
    const p = g.position;
    const hl = c.length / 2;
    if (axis === 'x') b.collider(p.x - hl, p.x + hl, p.z - 0.95, p.z + 0.95, 0, 1.5);
    else b.collider(p.x - 0.95, p.x + 0.95, p.z - hl, p.z + hl, 0, 1.5);
  }
}
function buildPorteCocheres(b: WorldBuilder): void {
  const R = rng(4545);
  const stand = (x: number, z: number, rot: number) => {
    b.add(clutterAll(valetPodium(b)), x, 0, z, rot);
    b.collider(x - 0.6, x + 0.6, z - 0.6, z + 0.6, 0, 1.2, true);
  };
  const cart = (x: number, z: number, rot: number) => {
    b.add(clutterAll(luggageCart(R)), x, 0, z, rot);
    b.collider(x - 0.6, x + 0.6, z - 0.9, z + 0.9, 0, 2.4, true);
  };
  const taxiSign = (x: number, z: number, rot: number) => {
    const g = new THREE.Group();
    part(g, CY(0.05, 0.05, 2.6, 6), K.galv, 0, 1.3, 0);
    part(g, signGeometry('taxi', 1.7, 0.2, 0.03), signs(b), 0, 2.45, 0);
    b.add(clutterAll(g), x, 0, z, rot);
  };
  // Bellagio (drive x −85…−19 along z 100…109; canopy at x −96)
  carQueue(b, -82, 102.2, 'x', -1, 5, 0);
  stand(-88, 98.2, 0);
  cart(-92, 98.4, Math.PI / 2);
  cart(-99, 98.6, Math.PI / 2 + 0.3);
  taxiSign(-76, 98.4, 0);
  // Wynn (drive x 19…55 along z −557…−549; canopy at x 33…47)
  carQueue(b, 31, -551, 'x', 1, 3, 2);
  stand(40, -547.6, Math.PI);
  cart(44, -547.8, Math.PI / 2);
  taxiSign(30, -547.6, Math.PI);
  // Fontainebleau (canopy x 22.6…28.4, z −772…−758)
  carQueue(b, 25.5, -750, 'z', -1, 3, 4);
  stand(29.2, -764, -Math.PI / 2);
  cart(29.4, -769, 0);
  // Mandalay Bay (drive x −40…−24 at z 655…669; canopy at x −43)
  carQueue(b, -30, 659, 'x', -1, 2, 1);
  stand(-38.8, 653.4, 0);
  cart(-41, 653.8, Math.PI / 2);
  taxiSign(-27, 653.4, 0);
  // Four Seasons (canopy x −28…−20, z 702…711)
  stand(-20.6, 701.2, Math.PI / 2);
  cart(-22.4, 713.4, 0.4);
}

// ---------------------------------------------------------------- shade structures with misters
function buildMisters(b: WorldBuilder, R: () => number): void {
  const mist = mistMaterial();
  const wet = wetSheenMaterial();
  const spots: Array<[number, number]> = [
    [-16.5, 52],
    [16.6, 62],
    [-16.5, -48],
    [16.6, -140],
    [-16.5, 380],
    [16.6, 360],
    [16.6, -470],
    [-16.5, -700],
    [16.6, 290],
    [-16.5, 222],
  ];
  const fabric = mat(0xf2ece0, 0.9, 0, { side: THREE.DoubleSide });
  const pole = mat(0x2b2f36, 0.45, 0.6);
  for (const [x, z] of spots) {
    const g = new THREE.Group();
    for (const dz of [-2.6, 2.6]) {
      part(g, CY(0.09, 0.11, 4.2, 8), pole, 0, 2.1, dz);
      // mister ring + nozzles under the canopy
      part(g, CY(0.02, 0.02, 5.2, 4), K.galv, 0, 3.75, 0, 0, Math.PI / 2);
    }
    part(g, BX(3.2, 0.06, 6.4), fabric, 0, 4.15, 0, 0, 0, 0.08);
    part(g, BX(3.4, 0.1, 0.1), pole, 0, 4.1, -2.6);
    part(g, BX(3.4, 0.1, 0.1), pole, 0, 4.1, 2.6);
    for (let k = 0; k < 6; k++) {
      const m = part(g, new THREE.ConeGeometry(0.55, 2.4, 8, 1, true), mist, (R() - 0.5) * 0.6, 2.55, -2.2 + k * 0.88);
      m.rotation.x = Math.PI;
      m.renderOrder = 2;
    }
    g.position.set(x, 0, z);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.userData.clutter = true;
    });
    b.add(g);
    b.collider(x - 0.15, x + 0.15, z - 2.75, z - 2.45, 0, 4.2, true);
    b.collider(x - 0.15, x + 0.15, z + 2.45, z + 2.75, 0, 4.2, true);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.6), wet);
    w.rotation.x = -Math.PI / 2;
    w.position.set(x, 0.068, z);
    w.renderOrder = 1;
    w.userData.clutter = true;
    b.add(w);
  }
  // Real misters make a fine haze you barely see, fainter still at night under the lamps. Fade the
  // streaks out as the camera comes in under a canopy, or they fill the frame with layered noise.
  b.every((_dt, _t, night) => {
    let d2 = Infinity;
    for (const [x, z] of spots) {
      const dx = viewer.cam.x - x;
      const dz = viewer.cam.z - z;
      d2 = Math.min(d2, dx * dx + dz * dz);
    }
    const near = THREE.MathUtils.smoothstep(Math.sqrt(d2), 3.5, 8);
    mist.opacity = (0.5 - 0.28 * night) * near;
    mist.visible = mist.opacity > 0.01;
  });
}

// ---------------------------------------------------------------- sidewalk trade: water sellers, slapper flyers, trash overflow, performers
function cooler(b: WorldBuilder): THREE.Group {
  const g = new THREE.Group();
  part(g, BX(0.9, 0.5, 0.5), mat(0x2a66cc, 0.5), 0, 0.25, 0);
  part(g, BX(0.92, 0.08, 0.52), K.white, 0, 0.53, 0);
  part(g, BX(0.6, 0.06, 0.4), mat(0xbfe8ff, 0.2, 0, { emissive: 0x9fd8ff, emissiveIntensity: 0.05 }), 0.6, 0.6, 0);
  for (let i = 0; i < 6; i++) part(g, CY(0.035, 0.035, 0.2, 6), mat(0xdff2ff, 0.15), 0.45 + (i % 3) * 0.1, 0.72, -0.08 + Math.floor(i / 3) * 0.14);
  part(g, BX(0.06, 0.45, 0.06), K.darkSteel, -0.25, 0.75, 0.2);
  part(g, signGeometry('water', 0.95, 0.11, 0.02), signs(b), -0.25, 1.05, 0.24);
  return g;
}
function buildSidewalkTrade(b: WorldBuilder, R: () => number): void {
  // Water sellers by the busiest crossings: cooler + seller (a performer slot that hawks water)
  const sellers: Array<[number, number]> = [
    [-14.6, -86],
    [14.6, 96],
    [-14.6, 196],
    [14.6, -230],
    [-14.6, 520],
    [14.6, -300],
  ];
  for (const [x, z] of sellers) {
    const side = Math.sign(x);
    const c = cooler(b);
    c.position.set(x + side * 0.9, 0, z + 0.8);
    c.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    b.add(clutterAll(c));
    b.collider(x + side * 0.9 - 0.3, x + side * 0.9 + 0.3, z + 0.3, z + 1.3, 0, 0.6, true);
    b.crowd.performers.push({ kind: 'water', x, z, facing: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  // Generic costumed performers: silver robot, living statues (gold + silver) on pedestals
  const perf: Array<['robot' | 'statue', number, number]> = [
    ['robot', -16, 30],
    ['statue', 16.2, 30],
    ['robot', 16.2, -186],
    ['statue', -16.2, 330],
    ['robot', 16.2, 450 - 30],
    ['statue', -16.2, -150],
  ];
  for (const [kind, x, z] of perf) {
    const side = Math.sign(x);
    if (kind === 'statue') {
      b.box(x, 0, z, 0.9, 0.5, 0.9, mat(0x2a2a30, 0.5, 0.4), false, false);
      b.add(clutterAll(new THREE.Group().add(new THREE.Mesh(BX(0.5, 0.25, 0.35), mat(0x8a6a3a, 0.6)))), x - side * 0.9, 0.12, z + 0.8);
    }
    b.crowd.performers.push({ kind, x, z, facing: side > 0 ? -Math.PI / 2 : Math.PI / 2, y: kind === 'statue' ? 0.5 : 0 });
  }
  // Flyer litter round every card slapper
  const lm = litterMaterial();
  for (const p of b.crowd.performers) {
    if (p.kind !== 'slapper') continue;
    for (let k = 0; k < 4; k++) {
      const d = new THREE.Mesh(litterGeometry([1, 5, 9, 13][k], 1.4 + R() * 0.6), lm);
      d.position.set(p.x + (R() - 0.5) * 3.5, 0.067, p.z + (R() - 0.5) * 5);
      d.rotation.y = R() * 6;
      d.userData.clutter = true;
      b.add(d);
    }
  }
  // Overflowing trash: cups and a spill of litter next to the Strip trash cans
  const cupMats = [mat(0xff33a6, 0.3), mat(0x2de2ff, 0.3), mat(0xf4f4f0, 0.5), mat(0xd8352b, 0.4)];
  for (const pr of b.props) {
    if (pr.kind !== 'trash') continue;
    const { x, z } = pr.obj.position;
    if (Math.abs(x) > 14) continue;
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const cup = new THREE.Mesh(CY(0.05, 0.035, 0.16 + R() * 0.12, 6), cupMats[k % 4]);
      cup.position.set((R() - 0.5) * 1.2, 0.07, (R() - 0.5) * 1.2);
      cup.rotation.set(Math.PI / 2, R() * 6, 0);
      g.add(cup);
    }
    const yard = new THREE.Mesh(CY(0.07, 0.04, 0.5, 6), cupMats[Math.floor(R() * 2)]);
    yard.position.set(0.5, 0.25, 0.4);
    g.add(yard);
    g.position.set(x, 0, z);
    b.add(clutterAll(g));
    const d = new THREE.Mesh(litterGeometry([3, 7, 0, 2][Math.floor(R() * 4)], 1.8), lm);
    d.position.set(x + Math.sign(x) * 0.3, 0.066, z + 0.4);
    d.userData.clutter = true;
    b.add(d);
  }
  // Gum spots and stains scattered down both sidewalks near the crosswalks (where people wait)
  for (const cw of CROSSWALKS) {
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const d = new THREE.Mesh(litterGeometry([0, 2, 4, 6, 8][Math.floor(R() * 5)], 2.2), lm);
        d.position.set(s * (13.5 + R() * 4.5), 0.066, cw.z + (R() - 0.5) * 10);
        d.rotation.y = R() * 6;
        d.userData.clutter = true;
        b.add(d);
      }
    }
  }
}
