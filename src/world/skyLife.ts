import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { buildSkylineExtras } from './skylineExtras';

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

/**
 * Vegas sky life: sweeping casino searchlights after dark (plus a pair far off over Fremont
 * Street). Lives outside the static bake. (Airliners fly in airport.ts, on Harry Reid's runways.)
 */
export function buildSkyLife(b: WorldBuilder): void {
  // Trump tower + baked ground AO around building footprints (needs every district's colliders)
  buildSkylineExtras(b);
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

  b.every((_dt, t, night) => {
    // Searchlights: slow sweeps that also nod up and down; off by day.
    for (const bm of beams) {
      bm.mat.uniforms.opacity.value = night > 0.25 ? (night - 0.25) * 0.42 : 0;
      bm.yaw.visible = night > 0.25;
      bm.yaw.rotation.y = bm.phase + t * bm.speed;
      bm.tilt.rotation.x = 0.32 + 0.16 * Math.sin(t * 0.21 + bm.phase);
    }
  });
}
