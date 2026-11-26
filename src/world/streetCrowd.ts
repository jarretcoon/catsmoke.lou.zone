import * as THREE from 'three';
import { viewer, type WorldBuilder } from './builder';
import { CROSSWALKS, STRIP } from './strip';
import { bridgePinch, SPAN_BRIDGES, SPAN_X } from './stripBridges';
import { rng } from './textures';

/**
 * The Boulevard's sidewalk crowd, all instanced (10 draw calls for everyone, whatever the count):
 * - walkers stream both ways along both sidewalks around the camera, spread across the whole width,
 *   with swinging arms and legs; denser at night and densest in the middle Strip (Tropicana to Spring
 *   Mountain), where the real sidewalks are packed shoulder to shoulder after dark;
 * - standers fill the places people really stop: a ring of onlookers round every street performer,
 *   people waiting at the crosswalks for the walk signal, the rail of Lake Bellagio for the fountain
 *   show, the Deuce shelters, and the rails of the pedestrian bridges, the Strip's favourite photo spot;
 * - bridge walkers cross the Flamingo and Tropicana skybridges;
 * - at night a good share hold a phone up, its screen a small cool glow (filming the fountains,
 *   the performers, the bridges' view).
 */

const SKIN = [0xf2c8a8, 0xe2ae88, 0xc88c64, 0x9b6342, 0x6b412a];
const HAIR = [0x1c1512, 0x4a2e1b, 0x9c6b30, 0xd8b158, 0x7b2c25, 0x8e939e, 0x111111];
const SHIRT = [0xff5a7a, 0x2ec4ff, 0xffc83d, 0x4de088, 0xb874ff, 0xff7b3b, 0xf2f0eb, 0x26354d, 0x111111, 0xd8352b, 0xf4f4f4, 0x1e8c5a, 0x0f0f12, 0xe8486b, 0xf4e04a, 0x6a2a8a];
const PANTS = [0x212c42, 0x2c2b30, 0x453b31, 0x3b4d6b, 0xd6cbb8, 0x1a1a1e, 0x5a6f8a, 0x111114];

type Mode = 'walk' | 'stand' | 'bridge';
interface Agent {
  mode: Mode;
  x: number;
  y: number;
  z: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  scale: number;
  yaw: number;
  phone: boolean;
  /** bridge walkers: the span they cross */
  span?: Span;
  /** standers: the slot they hold */
  slot?: number;
}
interface Slot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 0 = always there, 1 = only once it gets busy (night) */
  busy: number;
  phone: number;
}
interface Span {
  axis: 'x' | 'z';
  a: number;
  b: number;
  /** the fixed coordinate (z for an x-span) */
  at: number;
  y: number;
}

function lathe(pts: Array<[number, number]>, seg: number, flatZ: number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg
  );
  g.scale(1, 1, flatZ);
  return g;
}

function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
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

/** Where people stop: performer rings, crosswalk corners, the fountain rail, bus shelters, bridge rails. */
function standSlots(b: WorldBuilder, R: () => number, deuceStops: Array<{ z: number; side: 1 | -1 }>): Slot[] {
  const slots: Slot[] = [];
  const clampSide = (x: number, s: number) => s * THREE.MathUtils.clamp(Math.abs(x), 12.3, 19.2);
  // a ring of onlookers in front of each street performer, facing the act
  for (const p of b.crowd.performers) {
    if (Math.abs(p.x) > 21 || Math.abs(p.x) < 11) continue;
    const s = Math.sign(p.x);
    const fx = Math.sin(p.facing);
    const fz = Math.cos(p.facing);
    const n = 5 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * 2.4 + (R() - 0.5) * 0.25; // ±70° round the front
      const r = 2.0 + R() * 1.3 + (i % 2) * 0.6;
      const dx = fx * Math.cos(a) - fz * Math.sin(a);
      const dz = fz * Math.cos(a) + fx * Math.sin(a);
      const x = clampSide(p.x + dx * r, s);
      const z = p.z + dz * r;
      slots.push({ x, y: 0, z, yaw: Math.atan2(p.x - x, p.z - z), busy: i < 3 ? 0 : 1, phone: 0.45 });
    }
  }
  // waiting at the crosswalks for the walk signal, facing across the Boulevard
  for (const cw of CROSSWALKS) {
    if (cw.bridged) continue;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const x = s * (12.3 + (i % 3) * 0.75 + R() * 0.3);
        const z = cw.z + (Math.floor(i / 3) - 1) * 0.9 + (R() - 0.5) * 2.6;
        slots.push({ x, y: 0, z, yaw: s > 0 ? -Math.PI / 2 + (R() - 0.5) * 0.5 : Math.PI / 2 + (R() - 0.5) * 0.5, busy: i < 2 ? 0 : 1, phone: 0.15 });
      }
    }
  }
  // the Lake Bellagio rail during the fountain show (people face the water)
  for (let z = 34; z < 96; z += 1.6 + R() * 1.6) {
    if (((z - 37) % 13 + 13) % 13 < 2.2) continue; // the cypresses
    slots.push({ x: -20.05 + R() * 0.25, y: 0, z, yaw: -Math.PI / 2 + (R() - 0.5) * 0.4, busy: R() < 0.35 ? 0 : 1, phone: 0.55 });
  }
  // the Deuce shelters
  for (const st of deuceStops) {
    for (let i = 0; i < 3; i++) slots.push({ x: st.side * (STRIP.curb + 2.0 + R() * 0.8), y: 0, z: st.z - 3.5 + i * 1.4 + R() * 0.4, yaw: st.side > 0 ? -Math.PI / 2 : Math.PI / 2, busy: i === 0 ? 0 : 1, phone: 0.5 });
  }
  // the pedestrian bridges' rails, looking up and down the Strip
  const deckY = STRIP.bridgeY + 0.4;
  for (const zc of [0, STRIP.tropicanaZ]) {
    for (const sz of [-1, 1]) {
      const zr = zc + sz * (STRIP.bridgeZ + 1.55);
      for (let x = -15; x < 15; x += 1.4 + R() * 2.2) slots.push({ x, y: deckY, z: zr, yaw: sz < 0 ? Math.PI + (R() - 0.5) * 0.5 : (R() - 0.5) * 0.5, busy: R() < 0.3 ? 0 : 1, phone: 0.7 });
    }
  }
  for (const br of SPAN_BRIDGES) {
    for (const sz of [-1, 1]) {
      for (let x = -14; x < 14; x += 1.8 + R() * 2.6) slots.push({ x, y: deckY, z: br.z + sz * 1.55, yaw: sz < 0 ? Math.PI + (R() - 0.5) * 0.5 : (R() - 0.5) * 0.5, busy: R() < 0.3 ? 0 : 1, phone: 0.7 });
    }
  }
  return slots;
}

export function buildStreetCrowd(b: WorldBuilder, deuceStops: Array<{ z: number; side: 1 | -1 }>): void {
  const R = rng(321);
  const N_WALK = 300;
  const N_STAND = 130;
  const N_BRIDGE = 33;
  const N = N_WALK + N_STAND + N_BRIDGE;

  // ---- geometry: lathe torso with shoulders and hips, head, hair cap, legs and arms that swing at the hip/shoulder
  const torso = mergeSimple([
    lathe(
      [
        [0.0, 0.8],
        [0.165, 0.82],
        [0.182, 0.92],
        [0.165, 1.05],
        [0.18, 1.22],
        [0.2, 1.36],
        [0.13, 1.43],
        [0.055, 1.47],
        [0.05, 1.53],
        [0.0, 1.54],
      ],
      7,
      0.68
    ),
  ]);
  const head = new THREE.SphereGeometry(0.115, 8, 5).scale(0.92, 1.05, 1).translate(0, 1.63, 0.01);
  const hair = new THREE.SphereGeometry(0.124, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.655, -0.012);
  const leg = mergeSimple([
    new THREE.CylinderGeometry(0.078, 0.056, 0.76, 7).translate(0, -0.38, 0),
    new THREE.BoxGeometry(0.1, 0.07, 0.24).translate(0, -0.79, 0.04),
  ]);
  const arm = new THREE.CylinderGeometry(0.046, 0.036, 0.6, 6).translate(0, -0.3, 0);
  const phoneGeo = new THREE.BoxGeometry(0.075, 0.14, 0.012);
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const blob = new THREE.PlaneGeometry(0.85, 0.85).rotateX(-Math.PI / 2);
  const humanMat = new THREE.MeshStandardMaterial({ roughness: 0.72 });
  // Phone screens: a cool glow that stays under the bloom threshold (a pinprick, not a flare)
  const phoneMat = new THREE.MeshBasicMaterial({ color: 0x1a1d22 });
  const meshes = {
    torso: new THREE.InstancedMesh(torso, humanMat, N),
    head: new THREE.InstancedMesh(head, humanMat, N),
    hair: new THREE.InstancedMesh(hair, humanMat, N),
    legL: new THREE.InstancedMesh(leg, humanMat, N),
    legR: new THREE.InstancedMesh(leg, humanMat, N),
    armL: new THREE.InstancedMesh(arm, humanMat, N),
    armR: new THREE.InstancedMesh(arm, humanMat, N),
    phone: new THREE.InstancedMesh(phoneGeo, phoneMat, N),
    blob: new THREE.InstancedMesh(blob, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), N),
  };
  const all = Object.values(meshes);
  // Only the people actually placed this frame are drawn: they're packed into the first `count`
  // instances, so each agent's colours travel with it (7 coloured parts × rgb).
  const coloured = [meshes.torso, meshes.head, meshes.hair, meshes.legL, meshes.legR, meshes.armL, meshes.armR];
  const agentCol = new Float32Array(N * 21);
  const c = new THREE.Color();
  const agents: Agent[] = [];
  for (let i = 0; i < N; i++) {
    const mode: Mode = i < N_WALK ? 'walk' : i < N_WALK + N_STAND ? 'stand' : 'bridge';
    const side = i % 2 ? 1 : -1;
    // keep right, mostly: the curb half walks with the traffic, the frontage half against it
    const t = R();
    const x = side * (12.9 + t * 5.6);
    const dir: 1 | -1 = (side > 0) === (t < 0.5) ? -1 : 1;
    agents.push({ mode, x, y: 0, z: 0, dir: R() < 0.82 ? dir : (-dir as 1 | -1), speed: 1.0 + R() * 0.55, phase: R() * 6.28, scale: 0.9 + R() * 0.17, yaw: 0, phone: R() < (mode === 'walk' ? 0.12 : 0.5) });
    const shirt = SHIRT[Math.floor(R() * SHIRT.length)];
    const skin = SKIN[Math.floor(R() * SKIN.length)];
    meshes.torso.setColorAt(i, c.setHex(shirt));
    meshes.head.setColorAt(i, c.setHex(skin));
    meshes.hair.setColorAt(i, c.setHex(HAIR[Math.floor(R() * HAIR.length)]));
    const pc = PANTS[Math.floor(R() * PANTS.length)];
    meshes.legL.setColorAt(i, c.setHex(pc));
    meshes.legR.setColorAt(i, c.setHex(pc));
    const sleeve = R() < 0.6 ? skin : shirt; // Vegas nights are warm: mostly bare arms
    meshes.armL.setColorAt(i, c.setHex(sleeve));
    meshes.armR.setColorAt(i, c.setHex(sleeve));
    coloured.forEach((m, k) => {
      m.getColorAt(i, c);
      agentCol.set([c.r, c.g, c.b], i * 21 + k * 3);
    });
  }
  for (const m of all) {
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = m !== meshes.blob && m !== meshes.phone;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    b.scene.add(m);
  }

  const slots = standSlots(b, R, deuceStops);
  const slotOwner = new Int32Array(slots.length).fill(-1);
  const spans: Span[] = [];
  const deckY = STRIP.bridgeY + 0.4;
  for (const zc of [0, STRIP.tropicanaZ]) {
    for (const sz of [-1, 1]) spans.push({ axis: 'x', a: -20, b: 20, at: zc + sz * STRIP.bridgeZ + (R() - 0.5), y: deckY });
    for (const sx of [-1, 1]) spans.push({ axis: 'z', a: zc - 15, b: zc + 15, at: sx * STRIP.bridgeX + (R() - 0.5), y: deckY });
  }
  for (const br of SPAN_BRIDGES) spans.push({ axis: 'x', a: -SPAN_X, b: SPAN_X, at: br.z + (R() - 0.5) * 1.2, y: deckY });
  agents.forEach((a, i) => {
    if (a.mode !== 'bridge') return;
    a.span = spans[i % spans.length];
    a.dir = R() < 0.5 ? 1 : -1;
  });

  const WINDOW = 110;
  let seeded = false;
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // Cross streets under the bridges: no sidewalk to walk on there
  const inStreet = (z: number) => Math.abs(z) < 11 || Math.abs(z - STRIP.tropicanaZ) < 11 || z < STRIP.north + 6 || z > 885;
  /** Write agent `i` into instance slot `k` (matrices for every part, its colours, the phone if held). */
  const place = (k: number, i: number, a: Agent, yaw: number, swing: number, bob: number, armUp: number) => {
    const s = a.scale;
    dummy.position.set(a.x, a.y + bob, a.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    meshes.torso.setMatrixAt(k, dummy.matrix);
    meshes.head.setMatrixAt(k, dummy.matrix);
    meshes.hair.setMatrixAt(k, dummy.matrix);
    dummy.position.set(a.x, a.y + 0.075, a.z);
    dummy.updateMatrix();
    meshes.blob.setMatrixAt(k, dummy.matrix);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    // legs swing at the hips
    for (const [m, side] of [
      [meshes.legL, 1],
      [meshes.legR, -1],
    ] as Array<[THREE.InstancedMesh, number]>) {
      dummy.position.set(a.x + cy * side * 0.095 * s, a.y + 0.83 * s + bob, a.z - sy * side * 0.095 * s);
      dummy.rotation.set(side * swing, yaw, 0);
      dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
    }
    // arms swing opposite the legs; a phone holder raises the right arm in front of the face
    for (const [m, side] of [
      [meshes.armL, 1],
      [meshes.armR, -1],
    ] as Array<[THREE.InstancedMesh, number]>) {
      dummy.position.set(a.x + cy * side * 0.215 * s, a.y + 1.36 * s + bob, a.z - sy * side * 0.215 * s);
      const up = side < 0 ? armUp : 0;
      dummy.rotation.set(up > 0 ? -up : -side * swing * 0.7, yaw, side * 0.05);
      dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
    }
    if (armUp > 0) {
      // the hand end of the raised arm, screen facing the holder
      const reach = 0.6 * s;
      const hx = a.x + cy * -0.215 * s + sy * Math.sin(armUp) * reach;
      const hz = a.z - sy * -0.215 * s + cy * Math.sin(armUp) * reach;
      const hy = a.y + 1.36 * s + bob - Math.cos(armUp) * reach + 0.06;
      dummy.position.set(hx, hy, hz);
      dummy.rotation.set(-0.25, yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      meshes.phone.setMatrixAt(k, dummy.matrix);
    } else meshes.phone.setMatrixAt(k, zero);
    for (let p = 0; p < 7; p++) (coloured[p].instanceColor!.array as Float32Array).set(agentCol.subarray(i * 21 + p * 3, i * 21 + p * 3 + 3), k * 3);
  };

  b.every((dt, t, night) => {
    const cam = viewer.cam;
    const on = Math.abs(cam.x) < 80 && cam.y < 110;
    for (const m of all) m.visible = on;
    if (!on) return;
    // the middle Strip is the busiest stretch, and every sidewalk fills up after dark
    const mid = THREE.MathUtils.smoothstep(cam.z, -470, -400) * (1 - THREE.MathUtils.smoothstep(cam.z, 450, 520));
    const busy = THREE.MathUtils.clamp(0.25 + 0.3 * mid + 0.45 * night, 0, 1);
    const nWalk = Math.round(N_WALK * Math.pow(busy, 1.5));
    if (!seeded) {
      for (const a of agents) if (a.mode === 'walk') a.z = cam.z + (R() - 0.5) * 2 * WINDOW;
      for (const a of agents) if (a.mode === 'bridge' && a.span) a.x = a.span.a + R() * (a.span.b - a.span.a);
      seeded = true;
    }
    // phone screens light up after dark (dim grey by day)
    phoneMat.color.setRGB(0.1 + 0.62 * night, 0.11 + 0.68 * night, 0.13 + 0.78 * night);

    // ---- standers: claim free slots within 70 m, release far ones
    const standR2 = 70 * 70;
    for (let i = N_WALK; i < N_WALK + N_STAND; i++) {
      const a = agents[i];
      if (a.slot !== undefined) {
        const s = slots[a.slot];
        const dx = s.x - cam.x;
        const dz = s.z - cam.z;
        if (dx * dx + dz * dz > standR2 * 1.3 || s.busy > busy + 0.25) {
          slotOwner[a.slot] = -1;
          a.slot = undefined;
        }
      }
    }
    let free = N_WALK;
    for (let k = 0; k < slots.length; k++) {
      if (slotOwner[k] >= 0) continue;
      const s = slots[k];
      if (s.busy > busy + 0.25) continue;
      const dx = s.x - cam.x;
      const dz = s.z - cam.z;
      if (dx * dx + dz * dz > standR2) continue;
      while (free < N_WALK + N_STAND && agents[free].slot !== undefined) free++;
      if (free >= N_WALK + N_STAND) break;
      const a = agents[free];
      a.slot = k;
      slotOwner[k] = free;
      a.phone = R() < s.phone * (0.3 + 0.7 * night);
    }

    let n = 0; // packed instance count
    for (let i = 0; i < N; i++) {
      const a = agents[i];
      if (a.mode === 'walk') {
        if (i >= nWalk) continue;
        a.z += a.dir * a.speed * dt;
        if (a.z - cam.z > WINDOW) a.z -= 2 * WINDOW;
        else if (cam.z - a.z > WINDOW) a.z += 2 * WINDOW;
        a.phase += dt * a.speed * 3.6;
        if (inStreet(a.z)) continue;
        // squeeze past the bridge elevator towers and escalator runs
        const nearRing = Math.abs(a.z) < 20 || Math.abs(a.z - STRIP.tropicanaZ) < 20;
        const x = Math.sign(a.x) * Math.min(Math.abs(a.x), nearRing ? 17.2 : 99, bridgePinch(a.z));
        const bob = Math.abs(Math.sin(a.phase)) * 0.03;
        const yaw = a.dir > 0 ? 0 : Math.PI;
        const ox = a.x;
        a.x = x;
        place(n++, i, a, yaw, Math.sin(a.phase) * 0.48, bob, a.phone && night > 0.3 ? 1.05 : 0);
        a.x = ox;
      } else if (a.mode === 'stand') {
        if (a.slot === undefined) continue;
        const s = slots[a.slot];
        a.x = s.x;
        a.y = s.y;
        a.z = s.z;
        // weight shifts and glances; phone holders keep the arm up
        const sway = Math.sin(t * 0.7 + i * 1.7) * 0.18;
        place(n++, i, a, s.yaw + sway, 0.04 * Math.sin(t * 0.9 + i), 0, a.phone ? 1.25 : 0);
      } else {
        const sp = a.span!;
        let p = sp.axis === 'x' ? a.x : a.z;
        p += a.dir * a.speed * dt;
        if (p > sp.b) p = sp.a;
        else if (p < sp.a) p = sp.b;
        if (sp.axis === 'x') {
          a.x = p;
          a.z = sp.at;
        } else {
          a.z = p;
          a.x = sp.at;
        }
        a.y = sp.y;
        a.phase += dt * a.speed * 3.6;
        const dx = cam.x - a.x;
        const dz = cam.z - a.z;
        if (dx * dx + dz * dz > 120 * 120 || busy < 0.4) continue;
        const yaw = sp.axis === 'x' ? (a.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : a.dir > 0 ? 0 : Math.PI;
        place(n++, i, a, yaw, Math.sin(a.phase) * 0.45, Math.abs(Math.sin(a.phase)) * 0.03, 0);
      }
    }
    for (const m of all) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  });
}