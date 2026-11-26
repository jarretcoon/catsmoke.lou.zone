import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from './builder';
import { xFromO, zFromS } from './strip';

/**
 * Light-shaft material for searchlights and the Luxor Sky Beam: brightest along the core
 * (the part of the cone facing the camera), fading with height, additive and fog-free so it
 * reads as lit haze rather than a solid tube.
 */
export function beamMaterial(color: number, falloff = 1.4): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0 }, falloff: { value: falloff } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vH;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        vH = uv.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float opacity; uniform float falloff;
      varying vec3 vN; varying vec3 vV; varying float vH;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float core = pow(facing, 2.2);
        float along = pow(clamp(1.0 - vH, 0.0, 1.0), falloff) * smoothstep(0.0, 0.015, vH); // clamp: pow() of a hair-negative base is NaN, and bloom spreads NaN to the whole frame
        float a = core * along * opacity;
        gl_FragColor = vec4(color * a, a);
      }`,
  });
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A narrow-body jet (~30 m) as one merged mesh, nose along +z. */
function jetGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const fus = new THREE.CapsuleGeometry(1.9, 24, 6, 12).rotateX(Math.PI / 2);
  parts.push(fus);
  const wing = new THREE.BoxGeometry(32, 0.35, 4.2);
  wing.translate(0, -0.6, 0.5);
  parts.push(wing);
  for (const s of [-1, 1]) {
    const tip = new THREE.BoxGeometry(0.3, 1.6, 1.6).translate(s * 16, 0.2, -0.6);
    parts.push(tip);
    const eng = new THREE.CylinderGeometry(0.95, 0.85, 3.6, 10).rotateX(Math.PI / 2).translate(s * 5.6, -1.6, 2.2);
    parts.push(eng);
  }
  parts.push(new THREE.BoxGeometry(11, 0.25, 2.6).translate(0, 0.6, -12.4));
  parts.push(new THREE.BoxGeometry(0.3, 5.2, 3.4).translate(0, 3.2, -12.6).rotateX(0));
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
}

interface Jet {
  group: THREE.Group;
  landing: THREE.Sprite;
  strobe: THREE.Sprite;
  beacon: THREE.Sprite;
  navL: THREE.Sprite;
  navR: THREE.Sprite;
}

/**
 * Vegas sky life: sweeping casino searchlights after dark (plus a pair far off over Fremont
 * Street) and jets on approach to Harry Reid's 26R or climbing out of 1L over the east side,
 * with landing lights, nav lights, strobes and beacons. Lives outside the static bake.
 */
export function buildSkyLife(b: WorldBuilder): void {
  // ---------------------------------------------------------------- searchlights
  const beamGeo = new THREE.CylinderGeometry(15, 0.7, 760, 20, 1, true).translate(0, 380, 0);
  const sites = [
    { x: 96, z: 168, n: 2, color: 0xe4ecff, speed: 0.22 },
    { x: -104, z: -610, n: 2, color: 0xf0f4ff, speed: -0.18 },
    { x: 92, z: 440, n: 1, color: 0xfff1d8, speed: 0.26 },
    { x: 30, z: -1350, n: 2, color: 0xffffff, speed: 0.15 }, // downtown / Fremont, far north
  ];
  const beams: Array<{ yaw: THREE.Object3D; tilt: THREE.Object3D; mat: THREE.ShaderMaterial; phase: number; speed: number }> = [];
  for (const s of sites) {
    for (let i = 0; i < s.n; i++) {
      const yaw = new THREE.Group();
      yaw.position.set(s.x + i * 3, 4, s.z);
      const tilt = new THREE.Group();
      const mat = beamMaterial(s.color, 1.2);
      const beam = new THREE.Mesh(beamGeo, mat);
      beam.frustumCulled = false;
      beam.renderOrder = 2;
      tilt.add(beam);
      yaw.add(tilt);
      b.scene.add(yaw);
      beams.push({ yaw, tilt, mat, phase: i * Math.PI + s.x * 0.01, speed: s.speed * (i ? -1 : 1) });
    }
  }

  // ---------------------------------------------------------------- jets
  const jetMat = new THREE.MeshStandardMaterial({ color: 0xe8ebf0, roughness: 0.45, metalness: 0.35 });
  const jetGeo = jetGeometry();
  const glow = glowTexture();
  const sprite = (color: number, size: number) => {
    const m = new THREE.SpriteMaterial({ map: glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const sp = new THREE.Sprite(m);
    sp.scale.setScalar(size);
    return sp;
  };
  const jets: Jet[] = [];
  for (let i = 0; i < 3; i++) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(jetGeo, jetMat);
    group.add(body);
    const landing = sprite(0xfff6e8, 26);
    landing.position.set(0, -1.2, 14);
    const strobe = sprite(0xffffff, 14);
    strobe.position.set(0, 0.5, -15);
    const beacon = sprite(0xff2a2a, 9);
    beacon.position.set(0, 2.4, 0);
    const navL = sprite(0xff3030, 7);
    navL.position.set(16.2, 0, -0.6);
    const navR = sprite(0x30ff60, 7);
    navR.position.set(-16.2, 0, -0.6);
    group.add(landing, strobe, beacon, navL, navR);
    group.visible = false;
    b.scene.add(group);
    jets.push({ group, landing, strobe, beacon, navL, navR });
  }
  // Runway 8L/26R (east-west) and 1L (north-north-east), matching the airport build.
  const W8 = new THREE.Vector3(xFromO(218), 0, zFromS(-4267));
  const d8 = new THREE.Vector3(0.999, 0, 0.026).normalize();
  const touchdown = W8.clone().addScaledVector(d8, 600);
  const S1 = new THREE.Vector3(xFromO(204), 0, zFromS(-4380));
  const d1 = new THREE.Vector3(0.342, 0, -0.94).normalize();
  const look = new THREE.Vector3();

  const PERIOD = 96;
  b.every((_dt, t, night) => {
    // Searchlights: slow sweeps that also nod up and down; off by day.
    for (const bm of beams) {
      bm.mat.uniforms.opacity.value = night > 0.25 ? (night - 0.25) * 0.42 : 0;
      bm.yaw.visible = night > 0.25;
      bm.yaw.rotation.y = bm.phase + t * bm.speed;
      bm.tilt.rotation.x = 0.32 + 0.16 * Math.sin(t * 0.21 + bm.phase);
    }

    // Jets: two arrivals onto 26R from over Henderson, one departure off 1L.
    for (let i = 0; i < jets.length; i++) {
      const j = jets[i];
      const u = ((t + i * (PERIOD / 3)) % PERIOD) / PERIOD;
      const departing = i === 2;
      let vis = true;
      if (!departing) {
        if (u < 0.8) {
          const dist = THREE.MathUtils.lerp(2600, 0, u / 0.8);
          j.group.position.copy(touchdown).addScaledVector(d8, dist);
          j.group.position.y = 0.8 + dist * 0.055;
        } else {
          const k = (u - 0.8) / 0.2;
          const roll = 520 * (1 - (1 - k) * (1 - k));
          j.group.position.copy(touchdown).addScaledVector(d8, -roll);
          j.group.position.y = 0.8;
          vis = k < 0.95;
        }
        look.copy(j.group.position).addScaledVector(d8, -10);
        look.y = j.group.position.y - (u < 0.8 ? 0.55 : 0);
      } else {
        const roll = Math.min(u / 0.12, 1);
        const s = u < 0.12 ? 420 * roll * roll : 420 + (u - 0.12) * 3600;
        j.group.position.copy(S1).addScaledVector(d1, s);
        j.group.position.y = 0.8 + Math.max(0, s - 420) * 0.13;
        look.copy(j.group.position).addScaledVector(d1, 10);
        look.y = j.group.position.y + (s > 420 ? 1.3 : 0);
        vis = u < 0.97;
      }
      j.group.visible = vis;
      j.group.lookAt(look);
      // Lights: landing lights on low and slow, strobes double-flash, beacon pulses.
      const lowAlt = j.group.position.y < 160;
      j.landing.visible = lowAlt;
      const lm = j.landing.material as THREE.SpriteMaterial;
      lm.opacity = 0.35 + night * 0.65;
      const ph = (t * 1.1 + i * 0.37) % 1;
      j.strobe.visible = ph < 0.05 || (ph > 0.12 && ph < 0.17);
      (j.beacon.material as THREE.SpriteMaterial).opacity = 0.25 + 0.75 * Math.max(0, Math.sin(t * 6.3 + i));
      const navOp = 0.3 + night * 0.7;
      (j.navL.material as THREE.SpriteMaterial).opacity = navOp;
      (j.navR.material as THREE.SpriteMaterial).opacity = navOp;
    }
  });
}
