import * as THREE from 'three';
import type { WorldBuilder } from './builder';

/** One fountain shooter: where it stands and which choreography line it belongs to. */
export interface JetSpec {
  x: number;
  z: number;
  line: number;
  i: number;
  n: number;
}

/**
 * Water columns for the Bellagio show, drawn as ONE instanced mesh: a soft translucent column
 * (opaque-ish at the core, feathered at the edges, streaky, dissolving into spray at the top)
 * lit from below by the underwater lights after dark, plus a mist puff on every crown.
 * Returns setters the choreography calls each frame.
 */
export function waterJets(b: WorldBuilder, specs: JetSpec[]): { set: (k: number, h: number, tilt: number) => void; commit: (t: number, night: number, show: number) => void } {
  const n = specs.length;
  const geo = new THREE.CylinderGeometry(0.1, 0.38, 1, 10, 6, true);
  geo.translate(0, 0.5, 0);
  const uniforms = { time: { value: 0 }, night: { value: 0 }, show: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vH; varying float vA; varying float vSeed;
      void main() {
        vec4 wp = instanceMatrix * vec4(position, 1.0);
        vec4 mv = modelViewMatrix * wp;
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vV = -mv.xyz;
        vH = uv.y;
        vA = uv.x;
        vSeed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time; uniform float night; uniform float show;
      varying vec3 vN; varying vec3 vV; varying float vH; varying float vA; varying float vSeed;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float core = 0.18 + 0.82 * pow(facing, 1.6);
        // Rushing streaks: stretched noise scrolling upward.
        float streak = noise(vec2(vA * 22.0 + vSeed, vH * 5.0 - time * 3.2 + vSeed));
        streak = 0.55 + 0.45 * streak;
        float top = 1.0 - smoothstep(0.62, 1.0, vH);
        float base = smoothstep(0.0, 0.04, vH);
        float a = core * streak * top * base * show * mix(0.72, 0.62, night);
        // Day: white water against the sky. Night: lit from the underwater lamps, brightest low down.
        vec3 dayCol = vec3(0.93, 0.97, 1.0);
        vec3 nightCol = mix(vec3(1.25, 1.3, 1.35), vec3(0.6, 0.72, 0.85), smoothstep(0.0, 0.9, vH));
        gl_FragColor = vec4(mix(dayCol, nightCol, night), a);
        #include <colorspace_fragment>
      }`,
  });
  const jets = new THREE.InstancedMesh(geo, mat, n);
  jets.frustumCulled = false;
  jets.renderOrder = 3;
  b.scene.add(jets);

  // Spray crowns: one soft point per jet, sized by how hard it's shooting.
  const sprayTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const sprayPos = new Float32Array(n * 3);
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  const sprayMat = new THREE.PointsMaterial({ map: sprayTex, size: 4.6, sizeAttenuation: true, transparent: true, depthWrite: false, color: 0xeaf6ff, opacity: 0 });
  const spray = new THREE.Points(sprayGeo, sprayMat);
  spray.frustumCulled = false;
  spray.renderOrder = 4;
  b.scene.add(spray);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3();
  return {
    set: (k, h, tilt) => {
      const sp = specs[k];
      e.set(0, 0, tilt);
      q.setFromEuler(e);
      p.set(sp.x, 0.05, sp.z);
      s.set(1 + Math.min(h, 40) * 0.012, Math.max(0.05, h), 1 + Math.min(h, 40) * 0.012);
      m4.compose(p, q, s);
      jets.setMatrixAt(k, m4);
      up.set(0, h * 0.97, 0).applyQuaternion(q).add(p);
      sprayPos[k * 3] = up.x;
      sprayPos[k * 3 + 1] = h > 0.3 ? up.y : -50;
      sprayPos[k * 3 + 2] = up.z;
    },
    commit: (t, night, show) => {
      jets.instanceMatrix.needsUpdate = true;
      sprayGeo.attributes.position.needsUpdate = true;
      uniforms.time.value = t;
      uniforms.night.value = night;
      uniforms.show.value = show;
      jets.visible = show > 0.001;
      spray.visible = show > 0.001;
      sprayMat.opacity = 0.42 * show;
    },
  };
}
