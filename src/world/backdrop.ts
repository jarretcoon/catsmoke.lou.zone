import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { tower } from './buildings';
import { makeDesertTexture, rng } from './textures';
import { basic, mat, mesh, neonSign } from './props';
import { STRIP } from './strip';

/**
 * Everything past the playable corridor: the rest of the real skyline (in its real directions,
 * compressed), I-15, the Spring Mountains to the west and Frenchman Mountain to the east,
 * desert to the horizon — plus the invisible edge of the map.
 */
export function buildBackdrop(b: WorldBuilder): void {
  // Desert to the horizon (under the paved corridor)
  const desert = new THREE.MeshStandardMaterial({ map: makeDesertTexture(), roughness: 1, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), desert);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.35;
  ground.receiveShadow = true;
  b.add(ground);

  // ---- West: off-Strip resorts beyond Dean Martin Dr (interstate.ts builds playable I-15) ----
  tower(b, { x: -330, z: 40, w: 34, d: 18, h: 46, facade: { wall: '#2a4e9a', mullion: '#d8364a', glass: '#1a2e5a', lit: '#ffd0e0', cols: 10, rows: 24, style: 1, seed: 270 }, collide: false, cast: false }); // Rio
  tower(b, { x: -360, z: -60, w: 20, d: 30, h: 50, facade: { wall: '#c8b8a0', mullion: '#e0d4c0', glass: '#4a5560', lit: '#ffe6b0', cols: 10, rows: 26, seed: 280 }, collide: false, cast: false }); // Palms
  b.add(neonSign('RIO', '#140818', '#ff3b5c', 12, 4), -312.8, 40, 40, Math.PI / 2);

  // ---- Mountains: noise-displaced ridgelines ringing the valley (they ride with the camera, like the sky) ----
  buildMountains(b);

  // ---- Invisible map edge (low landscaping walls you can see) ----
  const edgeMat = mat(0x6b5a46, 0.95);
  const xW = STRIP.flamingoWest + 2;
  const xE = STRIP.flamingoEast - 2;
  const zN = STRIP.north - 4;
  const zS = STRIP.south + 4;
  b.box((xW + xE) / 2, 0, zN, xE - xW, 0.8, 1.2, edgeMat, false, false);
  b.box((xW + xE) / 2, 0, zS, xE - xW, 0.8, 1.2, edgeMat, false, false);
  // The west edge opens into T-Mobile Arena, I-15 bridges & Dean Martin Dr's bay (deanMartin.ts walls it)
  const bayWN = -196;
  const bayWS = 605;
  b.box(xW, 0, (zN + bayWN) / 2, 1.2, 0.8, bayWN - zN, edgeMat, false, false);
  b.box(xW, 0, (bayWS + zS) / 2, 1.2, 0.8, zS - bayWS, edgeMat, false, false);
  // The east edge opens into the Sphere district's bay (Sands Ave, Manhattan St, Hughes Center: sphereDistrict.ts walls it)
  const bayN = -425;
  const bayS = -55;
  b.box(xE, 0, (zN + bayN) / 2, 1.2, 0.8, bayN - zN, edgeMat, false, false);
  b.box(xE, 0, (bayS + zS) / 2, 1.2, 0.8, zS - bayS, edgeMat, false, false);
  b.collider(xW - 50, xE + 50, zN - 50, zN - 0.6, 0, 60, true);
  b.collider(xW - 50, xE + 50, zS + 0.6, zS + 50, 0, 60, true);
  b.collider(xW - 50, xW - 0.6, zN - 50, bayWN, 0, 60, true);
  b.collider(xW - 50, xW - 0.6, bayWS, zS + 50, 0, 60, true);
  b.collider(xE + 0.6, xE + 50, zN - 50, bayN, 0, 60, true);
  b.collider(xE + 0.6, xE + 50, bayS, zS + 50, 0, 60, true);
}

interface Range {
  /** Compass span in degrees, world-angle convention: 0 = east, 90 = south, 180 = west, 270 = north. */
  a0: number;
  a1: number;
  r: number;
  depth: number;
  peak: number;
  rock: number;
  haze: number;
  seed: number;
  /** Optional sharp summit (degrees) and snowline (m). */
  summit?: number;
  snow?: number;
  redBand?: boolean;
}

const RANGES: Range[] = [
  { a0: 0, a1: 360, r: 1480, depth: 50, peak: 60, rock: 0x6a5e58, haze: 0.7, seed: 1 }, // far low ring: always a horizon
  { a0: 148, a1: 248, r: 1260, depth: 230, peak: 215, rock: 0x5e5048, haze: 0.4, seed: 2 }, // Spring Mountains
  { a0: 162, a1: 214, r: 1060, depth: 130, peak: 105, rock: 0x7a5040, haze: 0.34, seed: 3, redBand: true }, // Red Rock escarpment
  { a0: 210, a1: 254, r: 1420, depth: 150, peak: 260, rock: 0x585058, haze: 0.52, seed: 4, summit: 232, snow: 205 }, // Mt Charleston
  { a0: 248, a1: 300, r: 1400, depth: 120, peak: 150, rock: 0x5a5048, haze: 0.58, seed: 5 }, // Sheep Range
  { a0: -38, a1: 38, r: 1050, depth: 150, peak: 140, rock: 0x6e5646, haze: 0.32, seed: 6, summit: -6 }, // Frenchman / Sunrise Mountain
  { a0: 55, a1: 140, r: 1340, depth: 120, peak: 115, rock: 0x5e5250, haze: 0.56, seed: 7 }, // McCullough Range
];

function valueNoise(seed: number): (x: number) => number {
  const R = rng(seed * 977 + 13);
  const table = Array.from({ length: 256 }, () => R());
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = table[i & 255];
    const c = table[(i + 1) & 255];
    const t = f * f * (3 - 2 * f);
    return a + (c - a) * t;
  };
}

/**
 * One merged mesh of ridge strips, shaded from baked normals and vertex colours, with aerial haze that
 * follows the fog colour by day and a dark silhouette at night. One draw call for every range.
 */
function buildMountains(b: WorldBuilder): void {
  const pos: number[] = [];
  const col: number[] = [];
  const hz: number[] = [];
  const idx: number[] = [];
  const L = new THREE.Vector3(0.45, 0.72, 0.5).normalize();
  const tmp = new THREE.Color();
  const snowC = new THREE.Color(0xf4f6fa);
  const bajada = new THREE.Color(0xa08a70);
  const red = new THREE.Color(0x94583a);
  for (const rg of RANGES) {
    const n1 = valueNoise(rg.seed);
    const n2 = valueNoise(rg.seed + 50);
    const a0 = THREE.MathUtils.degToRad(rg.a0);
    const a1 = THREE.MathUtils.degToRad(rg.a1);
    const span = a1 - a0;
    const full = rg.a1 - rg.a0 >= 359;
    const cols = Math.max(24, Math.round((span * rg.r) / 11));
    const rows = 5;
    const base = pos.length / 3;
    const rowLen = rows + 2; // front rows 0..rows (crest), then one back row
    const crest = (u: number) => {
      const x = u * cols * 0.09;
      // ridged multi-octave noise: sharp crests, rounded valleys
      let h = 0;
      let amp = 1;
      let f = 1;
      let norm = 0;
      for (let o = 0; o < 4; o++) {
        const v = 1 - Math.abs(2 * n1(x * f + o * 17.3) - 1);
        h += v * v * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2.1;
      }
      h /= norm;
      const env = full ? 1 : Math.pow(Math.sin(Math.PI * u), 0.55);
      let peak = rg.peak * env * (0.35 + 0.75 * h);
      if (rg.summit !== undefined) {
        const da = THREE.MathUtils.degToRad(rg.summit) - (a0 + u * span);
        peak += rg.peak * 0.25 * Math.exp(-(da * da) / 0.006);
      }
      return peak;
    };
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const a = a0 + u * span;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const top = crest(u);
      for (let j = 0; j < rowLen; j++) {
        let r: number;
        let y: number;
        if (j <= rows) {
          const t = j / rows;
          r = rg.r - rg.depth / 2 + rg.depth * 0.55 * t + (j > 0 && j < rows ? (n2(i * 0.31 + j * 7.1) - 0.5) * rg.depth * 0.16 : 0);
          // concave slope with gullies cut into the middle rows
          const gully = j > 0 && j < rows ? (n2(i * 0.47 + j * 3.3) - 0.5) * 0.18 : 0;
          y = j === 0 ? -35 : top * (Math.pow(t, 1.35) + gully);
        } else {
          r = rg.r + rg.depth / 2;
          y = -35;
        }
        pos.push(ca * r, y, sa * r);
        hz.push(Math.min(0.95, rg.haze + (j === 0 ? 0.3 : j === 1 ? 0.14 : 0)));
        col.push(0, 0, 0);
      }
    }
    const first = idx.length;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rowLen - 1; j++) {
        const p = base + i * rowLen + j;
        const q = p + rowLen;
        // faces point back toward the valley centre (the camera)
        idx.push(p, q, p + 1, p + 1, q, q + 1);
      }
    }
    // colours from a temporary normal pass over this range
    const g = new THREE.BufferGeometry();
    const sub = pos.slice(base * 3);
    g.setAttribute('position', new THREE.Float32BufferAttribute(sub, 3));
    g.setIndex(idx.slice(first).map((v) => v - base));
    g.computeVertexNormals();
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    const rock = new THREE.Color(rg.rock);
    for (let v = 0; v < nrm.count; v++) {
      const j = v % rowLen;
      const y = sub[v * 3 + 1];
      const lit = Math.max(0, nrm.getX(v) * L.x + nrm.getY(v) * L.y + nrm.getZ(v) * L.z);
      tmp.copy(rock).multiplyScalar(0.45 + 0.75 * lit);
      if (j <= 1) tmp.lerp(bajada, 0.45);
      if (rg.redBand && j >= 1 && j <= 3) tmp.lerp(red, 0.2 + 0.2 * lit);
      if (rg.snow !== undefined && y > rg.snow + (n2(v * 0.37) - 0.5) * 30) tmp.lerp(snowC, Math.min(1, (y - rg.snow) / 40 + 0.45) * (0.6 + 0.4 * lit));
      col[(base + v) * 3] = tmp.r;
      col[(base + v) * 3 + 1] = tmp.g;
      col[(base + v) * 3 + 2] = tmp.b;
    }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('haze', new THREE.Float32BufferAttribute(hz, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const uniforms = {
    uHaze: { value: new THREE.Color(0xbcd8f0) },
    uNight: { value: 0 },
    uNightCol: { value: new THREE.Color(0x07060f) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexColors: true,
    fog: false,
    vertexShader: /* glsl */ `
      attribute float haze;
      varying vec3 vCol;
      varying float vHaze;
      void main() {
        vCol = color;
        vHaze = haze;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uHaze;
      uniform float uNight;
      uniform vec3 uNightCol;
      varying vec3 vCol;
      varying float vHaze;
      void main() {
        vec3 day = mix(vCol, uHaze, vHaze);
        vec3 night = uNightCol * (0.7 + 1.6 * dot(vCol, vec3(0.3, 0.5, 0.2))) + uHaze * vHaze * 0.12;
        gl_FragColor = vec4(mix(day, night, uNight), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mountains = new THREE.Mesh(geo, material);
  mountains.frustumCulled = false;
  mountains.matrixAutoUpdate = false;
  mountains.renderOrder = -0.5;
  // Distant ranges sit at "infinity": keep them centred on the camera so they ring every corner of the map.
  mountains.onBeforeRender = (_r, _s, camera) => {
    mountains.position.set(camera.position.x, 0, camera.position.z);
    mountains.updateMatrix();
    mountains.updateMatrixWorld(true);
  };
  b.scene.add(mountains);
  const fogFallback = new THREE.Color(0xbcd8f0);
  b.every((_dt, _t, night) => {
    const fog = b.scene.fog as THREE.Fog | THREE.FogExp2 | null;
    uniforms.uHaze.value.copy(fog ? fog.color : fogFallback);
    uniforms.uNight.value = night;
  });
}
