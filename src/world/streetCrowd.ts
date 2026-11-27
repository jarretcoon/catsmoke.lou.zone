import * as THREE from 'three';
import { bit, bodyGeometry, crowdBody, crowdLook, crowdMaterial, OPT } from '../humanKit';
import { viewer, type WorldBuilder } from './builder';
import { CROSSWALKS, STRIP } from './strip';
import { bridgePinch, SPAN_BRIDGES, SPAN_X } from './stripBridges';
import { rng } from './textures';

/**
 * The Boulevard's sidewalk crowd, all instanced (4 draw calls for everyone, whatever the count):
 * - every person is humanKit's crowd body (real proportions, a painted face, hair, hats, hands, shoes, shirts,
 *   shorts, skirts, dresses, jackets, bags), its outfit options, colours, build and print switched per person,
 *   and walked in the vertex shader (knees, elbows, hip sway, shoulder twist, idle weight shifts and glances);
 *   a detailed body within ~20 m of the camera, a lighter one to ~55 m, a light one beyond, a soft shadow blob each;
 * - walkers stream both ways along both sidewalks around the camera, spread across the whole width,
 *   denser at night and densest in the middle Strip (Tropicana to Spring Mountain), where the real sidewalks
 *   are packed shoulder to shoulder after dark;
 * - standers fill the places people really stop: a ring of onlookers round every street performer,
 *   people waiting at the crosswalks for the walk signal, the rail of Lake Bellagio for the fountain
 *   show, the Deuce shelters, and the rails of the pedestrian bridges, the Strip's favourite photo spot;
 * - bridge walkers cross the Flamingo and Tropicana skybridges;
 * - phones: walkers look down at theirs, and at the shows people hold them up to film (the screen a small
 *   cool glow after dark).
 */

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
  /** standers: 0 arms free, 1 checking the phone, 2 filming, 3 hands in pockets */
  pose: number;
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

  // ---- geometry: humanKit's crowd body (every outfit option, switched per person in the shader), two levels of detail
  const cm = crowdMaterial();
  const baseNear = bodyGeometry(crowdBody(0));
  const baseMid = bodyGeometry(crowdBody(1));
  const baseFar = bodyGeometry(crowdBody(2));
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
  interface Lod {
    mesh: THREE.InstancedMesh;
    colA: THREE.InstancedBufferAttribute;
    colB: THREE.InstancedBufferAttribute;
    style: THREE.InstancedBufferAttribute;
    anim: THREE.InstancedBufferAttribute;
    n: number;
  }
  const lod = (base: THREE.BufferGeometry, cap: number): Lod => {
    const g = base.clone();
    const attr = (name: string) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    const l: Lod = { mesh: null!, colA: attr('iColA'), colB: attr('iColB'), style: attr('iStyle'), anim: attr('iAnim'), n: 0 };
    l.mesh = new THREE.InstancedMesh(g, cm.mat, cap);
    return l;
  };
  // the near body for the people within ~20 m of the camera (at most NEAR_MAX of them), a mid one to ~55 m, a light one beyond
  const NEAR_MAX = 90;
  const near = lod(baseNear, NEAR_MAX);
  const midL = lod(baseMid, N);
  const far = lod(baseFar, N);
  const blobs = new THREE.InstancedMesh(blob, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), N);
  const all = [near.mesh, midL.mesh, far.mesh, blobs];

  // ---- who they are: per person colours, outfit options, build, print and face (see humanKit's crowd material)
  const look = new Float32Array(N * 12);
  const agents: Agent[] = [];
  for (let i = 0; i < N; i++) {
    const mode: Mode = i < N_WALK ? 'walk' : i < N_WALK + N_STAND ? 'stand' : 'bridge';
    const side = i % 2 ? 1 : -1;
    // keep right, mostly: the curb half walks with the traffic, the frontage half against it
    const t = R();
    const x = side * (12.9 + t * 5.6);
    const dir: 1 | -1 = (side > 0) === (t < 0.5) ? -1 : 1;
    agents.push({ mode, x, y: 0, z: 0, dir: R() < 0.82 ? dir : (-dir as 1 | -1), speed: 1.0 + R() * 0.55, phase: R() * 6.28, scale: 0.92 + R() * 0.14, yaw: 0, phone: R() < (mode === 'walk' ? 0.14 : 0.5), pose: 0 });
    look.set(crowdLook(R), i * 12);
    // everyone carries a phone in the geometry; it only shows (in the right hand) while they use it
  }
  for (const m of all) {
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = m !== blobs;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
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
  const NEAR2 = 20 * 20;
  const MID2 = 55 * 55;
  let camX = 0;
  let camY = 0;
  let camZ = 0;
  let nb = 0;
  // Cross streets under the bridges: no sidewalk to walk on there
  const inStreet = (z: number) => Math.abs(z) < 11 || Math.abs(z - STRIP.tropicanaZ) < 11 || z < STRIP.north + 6 || z > 885;
  /** Draw person `i` at (x, y, z) facing `yaw`: into the near or far body, with their look, stride and pose. */
  const place = (i: number, a: Agent, x: number, y: number, z: number, yaw: number, walk: number, pose: number) => {
    const dx = x - camX;
    const dy = y - camY;
    const dz = z - camZ;
    const d2 = dx * dx + dy * dy + dz * dz;
    const L = d2 < NEAR2 && near.n < NEAR_MAX ? near : d2 < MID2 ? midL : far;
    const k = L.n++;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.setScalar(a.scale);
    dummy.updateMatrix();
    L.mesh.setMatrixAt(k, dummy.matrix);
    const o = i * 12;
    (L.colA.array as Float32Array).set(look.subarray(o, o + 4), k * 4);
    (L.colB.array as Float32Array).set(look.subarray(o + 4, o + 8), k * 4);
    const st = L.style.array as Float32Array;
    st[k * 4] = look[o + 8] + (pose === 1 || pose === 2 ? bit(OPT.phone) : 0);
    st[k * 4 + 1] = look[o + 9];
    const an = L.anim.array as Float32Array;
    an[k * 4] = a.phase;
    an[k * 4 + 1] = walk;
    an[k * 4 + 2] = pose;
    an[k * 4 + 3] = (i * 0.618) % 1;
    dummy.position.set(x, y + 0.075, z);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    blobs.setMatrixAt(nb++, dummy.matrix);
  };

  b.every((dt, t, night) => {
    const cam = viewer.cam;
    cm.time.value = t; // casino patrons share the material: keep their idle moving too
    const on = Math.abs(cam.x) < 80 && cam.y < 110;
    for (const m of all) m.visible = on;
    if (!on) return;
    camX = cam.x;
    camY = cam.y;
    camZ = cam.z;
    // the middle Strip is the busiest stretch, and every sidewalk fills up after dark
    const mid = THREE.MathUtils.smoothstep(cam.z, -470, -400) * (1 - THREE.MathUtils.smoothstep(cam.z, 450, 520));
    const busy = THREE.MathUtils.clamp(0.25 + 0.3 * mid + 0.45 * night, 0, 1);
    const nWalk = Math.round(N_WALK * Math.pow(busy, 1.5));
    if (!seeded) {
      for (const a of agents) if (a.mode === 'walk') a.z = cam.z + (R() - 0.5) * 2 * WINDOW;
      for (const a of agents) if (a.mode === 'bridge' && a.span) a.x = a.span.a + R() * (a.span.b - a.span.a);
      seeded = true;
    }
    // phone screens light up after dark (a dim grey by day), staying under the bloom threshold
    cm.screen.value.setRGB(0.05 + 0.5 * night, 0.06 + 0.58 * night, 0.08 + 0.68 * night);

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
      // filming the show (arm up), checking the phone, or hands in pockets
      a.pose = a.phone ? (s.phone >= 0.45 ? 2 : 1) : R() < 0.3 ? 3 : 0;
    }

    near.n = 0;
    midL.n = 0;
    far.n = 0;
    nb = 0;
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
        // phone users look down at it as they walk (more of them after dark)
        const pose = a.phone && (night > 0.3 || i % 3 === 0) ? 1 : 0;
        place(i, a, x, a.y, a.z, a.dir > 0 ? 0 : Math.PI, 0.6 + a.speed * 0.32, pose);
      } else if (a.mode === 'stand') {
        if (a.slot === undefined) continue;
        const s = slots[a.slot];
        a.x = s.x;
        a.y = s.y;
        a.z = s.z;
        // weight shifts and glances live in the shader; a slow turn of the whole body now and then
        place(i, a, s.x, s.y, s.z, s.yaw + Math.sin(t * 0.13 + i * 1.7) * 0.12, 0, a.pose);
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
        place(i, a, a.x, a.y, a.z, yaw, 0.6 + a.speed * 0.32, 0);
      }
    }
    for (const L of [near, midL, far]) {
      L.mesh.count = L.n;
      L.mesh.instanceMatrix.needsUpdate = true;
      for (const at of [L.colA, L.colB, L.style, L.anim]) {
        at.clearUpdateRanges();
        at.addUpdateRange(0, L.n * 4);
        at.needsUpdate = true;
      }
    }
    blobs.count = nb;
    blobs.instanceMatrix.needsUpdate = true;
  });
}
