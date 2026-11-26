import * as THREE from 'three';
import { viewer, type WorldBuilder } from './builder';
import { tower } from './buildings';
import { neonSign } from './props';

/**
 * Skyline and grounding pieces that sit outside any one district:
 * - Trump International (gold glass, 64 floors) behind the old Frontier lot on Fashion Show Dr.
 * - Baked ground AO: a soft dark skirt around the foot of every solid building, so towers, podiums and
 *   kiosks sit on the pavement instead of floating on it. One mesh, one draw call.
 * Called from buildSkyLife (after every district, before the static bake).
 */
export function buildSkylineExtras(b: WorldBuilder): void {
  buildTrump(b);
  buildGroundAO(b);
}

function buildTrump(b: WorldBuilder): void {
  const x = -178;
  const z = -530;
  const gold = { wall: '#c9a04a', mullion: '#e8c878', glass: '#b8882c', lit: '#ffe6b0', cols: 10, rows: 30, style: 2 as const, seed: 610 };
  tower(b, { x, z, w: 30, d: 13, h: 70, facade: gold, rotY: Math.PI / 2, metal: 0.9, rough: 0.16, collide: false, cast: false, ledFins: false, accent: 0xffe2a0, wash: 0xffd27a, washZone: 16, washStrength: 0.9, crownGlow: 1.2 });
  b.add(neonSign('TRUMP', '#1a1206', '#f6d27a', 12, 2.4), x + 6.5 + 0.2, 64.5, z, Math.PI / 2);
  b.building(x, z, 13, 30, '#c9a04a', 'Trump International');
}

/** Soft contact darkening around building footprints (solid wall colliders standing on the ground). */
function buildGroundAO(b: WorldBuilder): void {
  const pos: number[] = [];
  const ao: number[] = [];
  const idx: number[] = [];
  const Y = 0.045;
  for (const c of b.colliders) {
    if (!c.isWall || c.minY > 0.3) continue;
    const w = c.maxX - c.minX;
    const d = c.maxZ - c.minZ;
    const h = c.topY - c.minY;
    if (h < 2.5 || Math.min(w, d) < 1.5 || Math.max(w, d) > 260) continue;
    const r = THREE.MathUtils.clamp(h * 0.22, 1.4, 4.5);
    const s = THREE.MathUtils.clamp(h / 8, 0.5, 1);
    const ix0 = c.minX + 0.05;
    const ix1 = c.maxX - 0.05;
    const iz0 = c.minZ + 0.05;
    const iz1 = c.maxZ - 0.05;
    const inner: Array<[number, number]> = [
      [ix0, iz0],
      [ix1, iz0],
      [ix1, iz1],
      [ix0, iz1],
    ];
    const outer: Array<[number, number]> = [
      [c.minX - r, c.minZ - r],
      [c.maxX + r, c.minZ - r],
      [c.maxX + r, c.maxZ + r],
      [c.minX - r, c.maxZ + r],
    ];
    const base = pos.length / 3;
    for (const [px, pz] of inner) {
      pos.push(px, Y, pz);
      ao.push(s);
    }
    for (const [px, pz] of outer) {
      pos.push(px, Y, pz);
      ao.push(0);
    }
    // Four trapezoids around the footprint (drawn double-sided)
    for (let k = 0; k < 4; k++) {
      const i0 = base + k;
      const i1 = base + ((k + 1) % 4);
      const o0 = base + 4 + k;
      const o1 = base + 4 + ((k + 1) % 4);
      idx.push(i0, o0, o1, i0, o1, i1);
    }
  }
  if (!idx.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAo', new THREE.Float32BufferAttribute(ao, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0.55 }, uCam: { value: viewer.cam } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: /* glsl */ `
      attribute float aAo;
      varying float vAo;
      varying vec3 vW;
      void main() {
        vAo = aAo;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uStrength;
      uniform vec3 uCam;
      varying float vAo;
      varying vec3 vW;
      void main() {
        // vAo = per-footprint strength at the wall, 0 at the skirt's edge: a sharp contact core and a long soft tail
        float a = clamp(vAo, 0.0, 1.0);
        a = 0.62 * a * a * a + 0.38 * a;
        a *= uStrength * (1.0 - smoothstep(160.0, 360.0, distance(vW, uCam)));
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.userData.dynamic = true;
  b.scene.add(mesh);
}
