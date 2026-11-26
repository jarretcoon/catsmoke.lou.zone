import * as THREE from 'three';

/**
 * Lou's looks on top of the glTF: shell fur, matte fur materials, wet eyes whose pupils follow the
 * light, and a little procedural life (blinks, ear twitches, tail-tip sway, breathing, an idle glance).
 *
 * Shell fur: the GLB carries `CatFurShell`, a low-poly copy of the body skinned to the same bones.
 * It becomes ONE instanced draw: every instance is a shell pushed out along the skinned normal
 * (instance i -> height (i+1)/N), combed along the coat and drooping a touch with gravity. The fragment
 * shader cuts tapering tufts out of each shell, darkens the roots and samples the body's own colour map
 * so the stripes carry into the fur. Fur length is a per-vertex attribute worked out here from the bind
 * pose (short on the face and legs, none round the eyes, nose, mouth, soles and collar, fullest on the
 * chest ruff, cheeks, belly and tail).
 */

export type FurQuality = 'low' | 'medium' | 'high';
const SHELLS: Record<FurQuality, number> = { high: 16, medium: 10, low: 0 };

let furQuality: FurQuality = 'high';
const instances = new Set<CatLook>();

/** Called from applyQuality(): High 16 shells, Medium 10, Low none (the baked fur normal map only). */
export function setFurQuality(q: FurQuality): void {
  furQuality = q;
  for (const c of instances) c.applyQuality();
}

export interface CatLookFrame {
  /** 0 day .. 1 night (world.getNight()). */
  night: number;
  /** Standing or loafing with no one-shot playing: allowed to glance about. */
  idle: boolean;
  /** On the move: he still turns his head to people he passes, just less far. */
  roam?: boolean;
  /** Things worth a glance when idle: the camera first, else the nearest tourist. */
  camera?: THREE.Vector3;
  tourists?: ReadonlyArray<{ mesh: THREE.Object3D }>;
  /** Something that holds his attention (the Sphere's screen from a seat): most glances go there. */
  focus?: THREE.Vector3;
  /** Sitting and washing: head down to the chest in little licks, eyes half shut. */
  groom?: boolean;
}

// ------------------------------------------------------------------ small helpers
const sstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Distance from p to a polyline (Blender space), with the arc length at the closest point. */
function polyDist(p: THREE.Vector3, pts: THREE.Vector3[]): { d: number; arc: number; dir: THREE.Vector3 } {
  let best = Infinity;
  let bestArc = 0;
  const bestDir = new THREE.Vector3();
  let arc = 0;
  const ab = new THREE.Vector3();
  const ap = new THREE.Vector3();
  for (let i = 0; i < pts.length - 1; i++) {
    ab.subVectors(pts[i + 1], pts[i]);
    const len = ab.length();
    ap.subVectors(p, pts[i]);
    const t = THREE.MathUtils.clamp(ap.dot(ab) / (len * len), 0, 1);
    const d = ap.sub(ab.clone().multiplyScalar(t)).length();
    if (d < best) {
      best = d;
      bestArc = arc + t * len;
      bestDir.copy(ab).divideScalar(len);
    }
    arc += len;
  }
  return { d: best, arc: bestArc, dir: bestDir };
}

// Anatomy from blender/build_tabby_cat.py (Blender space: cat faces -Y, Z up, left of the cat is +X).
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const HEAD_PLANE_P = V(0, -0.236, 0.446);
const HEAD_PLANE_N = V(0, -0.38, 0.92).normalize();
const tmpP = new THREE.Vector3();
const EYES = [V(0.053, -0.347, 0.556), V(-0.053, -0.347, 0.556)];
const NOSE = V(0, -0.389, 0.521);
const CHIN = V(0, -0.343, 0.474);
const TAIL_PTS = [V(0, 0.258, 0.33), V(0, 0.345, 0.39), V(0.02, 0.425, 0.49), V(0.03, 0.452, 0.6), V(0.02, 0.425, 0.7), V(0.002, 0.392, 0.745), V(-0.02, 0.356, 0.76)];

/**
 * Fur length (metres, model units) and comb direction for one bind-pose vertex, in Blender space.
 * `ear` = skinned wholly to an Ear bone.
 */
function furAt(p: THREE.Vector3, n: THREE.Vector3, ear: boolean, comb: THREE.Vector3): number {
  const ax = Math.abs(p.x);
  const side = p.x >= 0 ? 1 : -1;
  if (ear) {
    comb.set(0, 0.1, 1);
    // backs of the ears get a short velvet; the pink insides have their own tufts
    return n.y > -0.2 ? 0.0028 : 0;
  }
  // ---- default: torso coat, combed toward the tail and down the flanks
  let len = 0.012;
  comb.set(0, 1, -0.45);

  // belly: a longer, softer underside
  const belly = sstep(0.25, 0.19, p.z) * sstep(0.075, 0.04, ax) * sstep(-0.16, -0.1, p.y) * sstep(0.24, 0.18, p.y);
  len = lerp(len, 0.015, belly);

  // chest ruff: front of the chest below the collar
  const chest = sstep(-0.13, -0.19, p.y) * sstep(0.2, 0.27, p.z) * sstep(0.43, 0.38, p.z) * sstep(0.0, -0.45, n.y);
  len = lerp(len, 0.018, chest);
  if (chest > 0.01) comb.lerp(V(0, 0.35, -1), chest);

  // legs: short, combed down; shorter still on the paws, none on the soles
  const legW = sstep(0.25, 0.18, p.z) * sstep(0.035, 0.06, ax) * (1 - belly);
  len = lerp(len, lerp(0.0062, 0.0042, sstep(0.07, 0.035, p.z)), legW);
  if (legW > 0.01) comb.lerp(V(0, 0.12, -1), legW);
  len *= sstep(0.008, 0.02, p.z);

  // tail: full and fluffy, combed toward the tip
  if (p.y > 0.2) {
    const t = polyDist(p, TAIL_PTS);
    const tw = sstep(0.065, 0.04, t.d) * sstep(0.0, 0.04, t.arc);
    if (tw > 0) {
      len = lerp(len, 0.016, tw);
      comb.lerp(t.dir, tw);
    }
  }

  // collar: no fur through the band (ring r 0.084 round y -0.218, z 0.415 - 0.018 sin a, half-height 11.5 mm)
  const sa = THREE.MathUtils.clamp((p.y + 0.218) / 0.084, -1, 1);
  const zc = 0.415 - 0.018 * sa;
  const nearNeck = sstep(0.125, 0.105, Math.hypot(p.x, p.y + 0.218));
  len *= 1 - nearNeck * sstep(0.026, 0.016, Math.abs(p.z - zc));

  // neck below the head: combed down
  const neck = sstep(0.4, 0.45, p.z) * sstep(-0.12, -0.18, p.y) * (1 - sstep(0.47, 0.5, p.z));
  if (neck > 0.01) comb.lerp(V(0, 0.35, -1), neck * 0.8);

  // head: everything above the neck plane the rig uses to split Head from Neck
  const head = sstep(-0.004, 0.03, tmpP.subVectors(p, HEAD_PLANE_P).dot(HEAD_PLANE_N));
  if (head > 0) {
    let hl = 0.0075; // crown / back of the head
    // face front: short
    hl = lerp(hl, 0.0036, sstep(-0.28, -0.32, p.y));
    // cheeks: chunky tomcat jowls
    const cheek = sstep(0.075, 0.095, ax) * sstep(0.565, 0.535, p.z) * sstep(-0.355, -0.325, p.y);
    hl = lerp(hl, 0.0125, cheek);
    hl = Math.min(hl, lerp(hl, 0.003, sstep(0.03, 0.018, p.distanceTo(CHIN))));
    len = lerp(len, hl, head);
    // combed back from the nose, out over the cheeks
    const hc = V(side * 0.5 * sstep(0.03, 0.09, ax), 1, -0.22);
    comb.lerp(hc, head);
  }
  // none round the eyes (wider at the outer corners), the nose leather or the mouth
  for (const e of EYES) len *= sstep(0.028, 0.041, p.distanceTo(e));
  len *= sstep(0.021, 0.033, p.distanceTo(NOSE));
  len *= 1 - sstep(0.014, 0.006, Math.abs(p.z - 0.49)) * sstep(-0.345, -0.36, p.y) * sstep(0.042, 0.03, ax);

  // comb lies in the skin
  comb.addScaledVector(n, -comb.dot(n));
  if (comb.lengthSq() > 1e-8) comb.normalize();
  return Math.max(0, len);
}

// ------------------------------------------------------------------ shaders
const FUR_VERT_PARS = /* glsl */ `
attribute float furLen;
attribute vec3 furComb;
uniform float uFurShells;
uniform vec3 uFurGravity;
varying float vFurH;
varying float vFurLen;
varying vec3 vFurRest;
`;
const FUR_VERT = /* glsl */ `
#include <skinning_vertex>
{
  float furH = (float(gl_InstanceID) + 1.0) / uFurShells;
  vFurH = furH;
  vFurLen = furLen;
  vFurRest = position;
  vec3 fn = normalize(objectNormal);
  #ifdef USE_SKINNING
    vec3 fc = (skinMatrix * vec4(furComb, 0.0)).xyz;
  #else
    vec3 fc = furComb;
  #endif
  // straight out along the skinned normal, then combed and drooping toward the tips
  transformed += fn * (furLen * furH + 0.0004) + (fc * 0.55 + uFurGravity * 0.4) * (furLen * furH * furH);
}
`;
const FUR_FRAG_PARS = /* glsl */ `
uniform float uFurDensity;
varying float vFurH;
varying float vFurLen;
varying vec3 vFurRest;
float furHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
// One lattice of tufts (cells of 1/uFurDensity): a jittered point per cell, random length,
// a cone that tapers to nothing at its tip. Returns coverage at shell height hh; r1 for tinting.
float furTuft(vec3 q, float hh, out float r1) {
  vec3 cell = floor(q);
  vec3 f = fract(q) - 0.5;
  r1 = furHash(cell);
  float r2 = furHash(cell + 19.19);
  float r3 = furHash(cell + 41.7);
  float h = hh / (0.4 + 0.6 * r1);
  vec3 jit = (vec3(r2, r3, fract(r1 * 13.7)) - 0.5) * 0.55;
  float rad = 0.5 * (1.0 - h);
  return h < 1.0 ? 1.0 - smoothstep(rad * 0.5, rad, length(f - jit)) : 0.0;
}
// two lattices, rotated against each other and against the model axes, so no grid shows
const mat3 FUR_ROT_A = mat3(0.80, 0.36, -0.48, -0.48, 0.86, -0.16, 0.36, 0.36, 0.86);
const mat3 FUR_ROT_B = mat3(0.36, -0.80, 0.48, 0.86, 0.48, 0.16, -0.36, 0.36, 0.86);
`;
const FUR_FRAG_CUT = /* glsl */ `
#include <clipping_planes_fragment>
float furCov;
float furTint;
{
  // tufts on the bind-pose surface (so they ride along with the skin), ~2.4 mm apart
  vec3 q = vFurRest * uFurDensity;
  float ra, rb;
  float sa = furTuft(FUR_ROT_A * q, vFurH, ra);
  float sb = furTuft(FUR_ROT_B * q * 1.21 + 0.5, vFurH, rb);
  float strand = max(sa, sb);
  // when a tuft is under a pixel, fade to its average coverage so the coat stays soft, not sparkly
  float expected = pow(max(1.0 - vFurH, 0.0), 1.7) * 0.9;
  float aa = smoothstep(0.3, 0.8, length(fwidth(q)));
  furCov = mix(strand, expected, aa) * smoothstep(0.0007, 0.002, vFurLen);
  if (furCov < 0.035) discard;
  furTint = mix(0.91 + 0.16 * (sa > sb ? ra : rb), 1.0, aa);
}
`;
const FUR_FRAG_COLOUR = /* glsl */ `
#include <map_fragment>
// darker at the roots (fake occlusion), a little lighter at the tips (agouti ticking)
diffuseColor.rgb *= mix(0.84, 1.06, sqrt(vFurH)) * furTint;
diffuseColor.a = furCov;
`;

const EYE_FRAG_PUPIL = /* glsl */ `
#include <map_fragment>
float louHalo = 1.0;
float louPup = 0.0;
{
  // pupil drawn here (the iris texture has none): a slit by day, round and wide at night
  vec2 e = vMapUv * 2.0 - 1.0;
  float n = uPupil;
  float w = mix(0.07, 0.52, n);
  float hgt = mix(0.75, 0.63, n);
  float yy = clamp(abs(e.y) / hgt, 0.0, 1.0);
  float hw = w * pow(max(1.0 - yy * yy, 0.0), mix(1.0, 0.5, n));
  float dx = abs(e.x) - hw;
  float inY = step(abs(e.y), hgt);
  louPup = (1.0 - smoothstep(-0.016, 0.016, dx)) * inY;
  louHalo = 1.0 - 0.28 * (1.0 - smoothstep(0.0, 0.09, dx)) * step(abs(e.y), hgt * 1.06);
  diffuseColor.rgb = mix(diffuseColor.rgb * louHalo, vec3(0.010, 0.009, 0.009), louPup);
}
`;
const EYE_FRAG_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance *= louHalo * (1.0 - louPup);
`;

// ------------------------------------------------------------------ procedural bone life
const Y_UP = new THREE.Vector3(0, 1, 0);
const X_AX = new THREE.Vector3(1, 0, 0);
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpM = new THREE.Matrix3();

/**
 * Adds rotations on top of whatever the mixer wrote this frame. If the mixer did not touch the bone
 * (a clip without that track), the last animated value is reused so offsets never accumulate.
 */
class BoneLayer {
  private readonly base = new THREE.Quaternion();
  private readonly written = new THREE.Quaternion();
  /** Bone-local axes for model-space directions, from the bind pose. */
  private readonly restModel = new THREE.Quaternion();
  readonly rest = new THREE.Quaternion();

  constructor(readonly bone: THREE.Object3D, modelInv: THREE.Quaternion) {
    this.rest.copy(bone.quaternion);
    bone.getWorldQuaternion(this.restModel).premultiply(modelInv);
    this.base.copy(bone.quaternion);
    this.written.set(NaN, NaN, NaN, NaN);
  }

  /** A model-space axis expressed in this bone's local frame (bind pose). */
  localAxis(axisModel: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(axisModel).applyQuaternion(tmpQ.copy(this.restModel).invert()).normalize();
  }

  /** The animated rotation for this frame (before our offsets). */
  begin(): THREE.Quaternion {
    if (!this.bone.quaternion.equals(this.written)) this.base.copy(this.bone.quaternion);
    this.bone.quaternion.copy(this.base);
    return this.base;
  }

  rotate(localAxis: THREE.Vector3, angle: number): void {
    if (angle !== 0) this.bone.quaternion.multiply(tmpQ2.setFromAxisAngle(localAxis, angle));
  }

  end(): void {
    this.written.copy(this.bone.quaternion);
  }
}

interface LidInfo {
  layer: BoneLayer;
  axis: THREE.Vector3;
  close: number;
}

export class CatLook {
  private readonly model: THREE.Object3D;
  private shell: THREE.SkinnedMesh | null = null;
  private shellGeo: THREE.InstancedBufferGeometry | null = null;
  private readonly furUniforms = {
    uFurShells: { value: 16 },
    uFurGravity: { value: new THREE.Vector3(0, -1, 0) },
    uFurDensity: { value: 1 / 0.0024 },
  };
  private readonly eyeUniforms = { uPupil: { value: 0 } };

  private readonly lids: LidInfo[] = [];
  private head: BoneLayer | null = null;
  private neck: BoneLayer | null = null;
  private ears: Array<{ layer: BoneLayer; swivel: THREE.Vector3; flick: THREE.Vector3; s: number }> = [];
  private tail: Array<{ layer: BoneLayer; axis: THREE.Vector3; k: number }> = [];
  private belly: THREE.Object3D | null = null;
  private bellyScale = new THREE.Vector3(1, 1, 1);
  private bellyWritten = new THREE.Vector3(NaN, NaN, NaN);
  private headYaw = { local: new THREE.Vector3(), neck: new THREE.Vector3() };
  private headPitch = { local: new THREE.Vector3(), neck: new THREE.Vector3() };

  private t = 0;
  private blinkTimer = 2.5;
  private blinkT = -1;
  private doubleBlink = false;
  private earTimer = 4;
  private earT = -1;
  private earSide = 1;
  private earAmp = 1;
  private flickTimer = 6;
  private flickT = -1;
  private pupil = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookWeight = 0;
  private glanceTimer = 0;
  private glanceTarget: THREE.Vector3 | null = null;
  private groomW = 0;
  private groomSide = 1;
  private readonly modelInv = new THREE.Quaternion();
  private readonly tmpTarget = new THREE.Vector3();
  private readonly glanceAt = new THREE.Vector3();

  constructor(model: THREE.Object3D) {
    this.model = model;
    model.updateMatrixWorld(true);
    model.getWorldQuaternion(this.modelInv).invert();

    let body: THREE.SkinnedMesh | null = null;
    let shellSrc: THREE.SkinnedMesh | null = null;
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      if (m.name === 'CatBody') body = m;
      if (m.name === 'CatFurShell') shellSrc = m;
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshPhysicalMaterial[];
      for (const mat of mats) this.tuneMaterial(mat);
    });
    if (body) this.buildShells(body, shellSrc);
    this.setupBones();
    instances.add(this);
    this.applyQuality();
  }

  dispose(): void {
    instances.delete(this);
  }

  applyQuality(): void {
    const n = SHELLS[furQuality];
    if (!this.shell || !this.shellGeo) return;
    this.shell.visible = n > 0;
    this.shellGeo.instanceCount = Math.max(1, n);
    this.furUniforms.uFurShells.value = Math.max(1, n);
  }

  // ---------------------------------------------------------------- materials
  private tuneMaterial(mat: THREE.MeshPhysicalMaterial): void {
    switch (mat.name) {
      case 'TabbyFur':
      case 'LidFur':
      case 'EarFur':
        // Fur is matte. Under the env map anything glossier reads as plastic.
        mat.roughness = 0.95;
        if (mat.isMeshPhysicalMaterial) {
          mat.specularIntensity = Math.min(mat.specularIntensity, 0.12);
          // the shells carry the soft rim now; a strong sheen made the skin brighter than the tufts on it
          mat.sheen = Math.min(mat.sheen, 0.35);
        }
        mat.envMapIntensity = 0.75;
        break;
      case 'CatEye':
        // a wet cornea over the iris: mirror-sharp coat, stronger reflections than anything else on him
        mat.roughness = 0.4;
        mat.clearcoat = 1;
        mat.clearcoatRoughness = 0.03;
        mat.envMapIntensity = 1.6;
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uPupil = this.eyeUniforms.uPupil;
          shader.fragmentShader = 'uniform float uPupil;\n' + shader.fragmentShader
            .replace('#include <map_fragment>', EYE_FRAG_PUPIL)
            .replace('#include <emissivemap_fragment>', EYE_FRAG_EMISSIVE);
        };
        mat.customProgramCacheKey = () => 'lou-eye';
        mat.needsUpdate = true;
        break;
      case 'NoseLeather':
        mat.roughness = 0.32;
        mat.envMapIntensity = 1.1;
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- shell fur
  private buildShells(body: THREE.SkinnedMesh, src: THREE.SkinnedMesh | null): void {
    const from = src ?? body;
    const g = from.geometry;
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const skinIdx = g.getAttribute('skinIndex');
    const skinW = g.getAttribute('skinWeight');
    if (!pos || !nrm) return;
    const bones = from.skeleton.bones;
    const earIdx = new Set([bones.findIndex((b) => b.name === 'Ear_L'), bones.findIndex((b) => b.name === 'Ear_R')]);

    const count = pos.count;
    const lenArr = new Float32Array(count);
    const combArr = new Float32Array(count * 3);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      // glTF (x, y up, z forward) -> Blender (x, -z, y)
      p.set(pos.getX(i), -pos.getZ(i), pos.getY(i));
      n.set(nrm.getX(i), -nrm.getZ(i), nrm.getY(i)).normalize();
      let ear = false;
      if (skinIdx && skinW) {
        let best = 0;
        let bi = -1;
        for (let k = 0; k < 4; k++) {
          const w = skinW.getComponent(i, k);
          if (w > best) {
            best = w;
            bi = skinIdx.getComponent(i, k);
          }
        }
        ear = best > 0.9 && earIdx.has(bi);
      }
      lenArr[i] = furAt(p, n, ear, c);
      // Blender -> glTF
      combArr[i * 3] = c.x;
      combArr[i * 3 + 1] = c.z;
      combArr[i * 3 + 2] = -c.y;
    }

    // Drop triangles with no fur at all (eye sockets, nose, mouth, soles, collar band), and the few the
    // decimation stretched across a UV seam: those would smear half the texture atlas into the coat.
    const srcIndex = g.getIndex();
    const uv = g.getAttribute('uv');
    const nTri = srcIndex ? srcIndex.count / 3 : count / 3;
    const vid = (t: number, k: number): number => (srcIndex ? srcIndex.getX(t * 3 + k) : t * 3 + k);
    const stretch = new Float32Array(nTri);
    const pa = new THREE.Vector3();
    const pb = new THREE.Vector3();
    for (let t = 0; t < nTri && uv; t++) {
      let uvLen = 0;
      let posLen = 0;
      for (let k = 0; k < 3; k++) {
        const i0 = vid(t, k);
        const i1 = vid(t, (k + 1) % 3);
        uvLen += Math.hypot(uv.getX(i0) - uv.getX(i1), uv.getY(i0) - uv.getY(i1));
        posLen += pa.fromBufferAttribute(pos, i0).distanceTo(pb.fromBufferAttribute(pos, i1));
      }
      stretch[t] = uvLen / Math.max(posLen, 1e-6);
    }
    const sorted = Array.from(stretch).sort((x, y) => x - y);
    const maxStretch = (sorted[Math.floor(sorted.length / 2)] || 1) * 3;
    const tri: number[] = [];
    for (let t = 0; t < nTri; t++) {
      const a = vid(t, 0);
      const b = vid(t, 1);
      const d = vid(t, 2);
      if (uv && stretch[t] > maxStretch) continue;
      if (lenArr[a] > 0.0007 || lenArr[b] > 0.0007 || lenArr[d] > 0.0007) tri.push(a, b, d);
    }

    const ig = new THREE.InstancedBufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
      const a = g.getAttribute(name);
      if (a) ig.setAttribute(name, a);
    }
    ig.setAttribute('furLen', new THREE.BufferAttribute(lenArr, 1));
    ig.setAttribute('furComb', new THREE.BufferAttribute(combArr, 3));
    ig.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(tri, 1) : new THREE.Uint16BufferAttribute(tri, 1));
    ig.instanceCount = 16;
    if (!g.boundingSphere) g.computeBoundingSphere();
    ig.boundingSphere = g.boundingSphere!.clone();
    ig.boundingSphere.radius += 0.03;
    if (!g.boundingBox) g.computeBoundingBox();
    ig.boundingBox = g.boundingBox!.clone().expandByScalar(0.03);

    const bodyMat = body.material as THREE.MeshPhysicalMaterial;
    const mat = new THREE.MeshStandardMaterial({
      name: 'LouFurShells',
      map: bodyMat.map,
      roughness: 1,
      metalness: 0,
      transparent: true,
      depthWrite: true,
      envMapIntensity: 0.75,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.furUniforms);
      shader.vertexShader = FUR_VERT_PARS + shader.vertexShader.replace('#include <skinning_vertex>', FUR_VERT);
      shader.fragmentShader = FUR_FRAG_PARS + shader.fragmentShader
        .replace('#include <clipping_planes_fragment>', FUR_FRAG_CUT)
        .replace('#include <map_fragment>', FUR_FRAG_COLOUR);
    };
    mat.customProgramCacheKey = () => 'lou-fur-shells';

    let shell: THREE.SkinnedMesh;
    if (src) {
      src.geometry = ig;
      src.material = mat;
      shell = src;
    } else {
      shell = new THREE.SkinnedMesh(ig, mat);
      shell.name = 'CatFurShellRuntime';
      body.parent?.add(shell);
      shell.position.copy(body.position);
      shell.quaternion.copy(body.quaternion);
      shell.scale.copy(body.scale);
      shell.bind(body.skeleton, body.bindMatrix);
    }
    shell.castShadow = false;
    shell.receiveShadow = true;
    shell.frustumCulled = body.frustumCulled;
    shell.renderOrder = 1;
    this.shell = shell;
    this.shellGeo = ig;
  }

  // ---------------------------------------------------------------- bones
  private setupBones(): void {
    const get = (name: string): THREE.Object3D | null => this.model.getObjectByName(name) ?? null;
    const layer = (name: string): BoneLayer | null => {
      const b = get(name);
      return b ? new BoneLayer(b, this.modelInv) : null;
    };
    // Lids: the upper lid closes by rotating about the eye's sideways axis (eyes splay out 15 degrees).
    // Lou's left eye (+X) sits lower, so it has less far to travel (Blender: 36 vs 42 degrees).
    for (const [name, s, close] of [['Lid_L', 1, 36], ['Lid_R', -1, 42]] as const) {
      const l = layer(name);
      if (!l) continue;
      const a = THREE.MathUtils.degToRad(15) * s;
      const axisModel = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      this.lids.push({ layer: l, axis: l.localAxis(axisModel), close: THREE.MathUtils.degToRad(close) });
    }
    this.head = layer('Head');
    this.neck = layer('Neck');
    if (this.head) {
      this.head.localAxis(Y_UP, this.headYaw.local);
      this.head.localAxis(X_AX, this.headPitch.local);
    }
    if (this.neck) {
      this.neck.localAxis(Y_UP, this.headYaw.neck);
      this.neck.localAxis(X_AX, this.headPitch.neck);
    }
    for (const [name, s] of [['Ear_L', 1], ['Ear_R', -1]] as const) {
      const l = layer(name);
      if (!l) continue;
      // swivel about the ear's own upright axis, flick back about the sideways axis
      this.ears.push({ layer: l, swivel: l.localAxis(new THREE.Vector3(0.25 * s, 1, 0.1)), flick: l.localAxis(X_AX), s });
    }
    for (const [name, k] of [['Tail3', 0.45], ['Tail4', 1]] as const) {
      const l = layer(name);
      if (l) this.tail.push({ layer: l, axis: l.localAxis(Y_UP), k });
    }
    this.belly = get('Belly');
    if (this.belly) this.bellyScale.copy(this.belly.scale);
  }

  // ---------------------------------------------------------------- per frame
  /** Call right after mixer.update(dt). */
  update(dt: number, f: CatLookFrame): void {
    this.t += dt;
    const t = this.t;

    // grooming eases in and out (head down to the chest, one side, then the other next time)
    if (f.groom && this.groomW === 0) this.groomSide = -this.groomSide;
    this.groomW = Math.max(0, Math.min(1, this.groomW + (f.groom ? dt * 2.2 : -dt * 3)));
    const g = this.groomW * this.groomW * (3 - 2 * this.groomW);

    // pupils: ease toward the light level (cats take a second or two)
    this.pupil += (THREE.MathUtils.clamp(f.night, 0, 1) - this.pupil) * Math.min(1, dt * 1.2);
    this.eyeUniforms.uPupil.value = this.pupil;

    // fur gravity in the shell mesh's own space
    if (this.shell?.visible) {
      tmpM.setFromMatrix4(this.shell.matrixWorld).invert();
      this.furUniforms.uFurGravity.value.set(0, -1, 0).applyMatrix3(tmpM).normalize();
    }

    // ---- blink every 3-7 s (now and then a double)
    let blink = 0;
    this.blinkTimer -= dt;
    if (this.blinkT < 0 && this.blinkTimer <= 0) {
      this.blinkT = 0;
      this.doubleBlink = Math.random() < 0.2;
      this.blinkTimer = 3 + Math.random() * 4;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const dur = this.doubleBlink ? 0.42 : 0.2;
      const bt = this.blinkT;
      const one = (x: number): number => (x < 0 ? 0 : x < 0.06 ? x / 0.06 : x < 0.09 ? 1 : x < 0.2 ? 1 - (x - 0.09) / 0.11 : 0);
      blink = Math.max(one(bt), this.doubleBlink ? one(bt - 0.22) : 0);
      if (bt > dur) this.blinkT = -1;
    }
    for (const lid of this.lids) {
      const base = lid.layer.begin();
      // the clip's own lid angle about the blink axis (squints, wide-eyed jumps)
      tmpQ.copy(lid.layer.rest).invert().multiply(base);
      const sinHalf = tmpV.set(tmpQ.x, tmpQ.y, tmpQ.z).dot(lid.axis);
      let clipAng = 2 * Math.atan2(sinHalf, tmpQ.w);
      // standing or loafing, the clip's metronome blink is replaced by ours
      if (f.idle) clipAng = Math.min(clipAng, 0);
      lid.layer.bone.quaternion.copy(lid.layer.rest);
      const ang = clipAng + Math.max(blink, g * 0.62) * (lid.close - clipAng);
      lid.layer.rotate(lid.axis, ang);
      lid.layer.end();
    }

    // ---- ear twitches: a quick swivel of one ear every few seconds, sometimes both flick back
    this.earTimer -= dt;
    if (this.earT < 0 && this.earTimer <= 0) {
      this.earT = 0;
      this.earSide = Math.random() < 0.5 ? 1 : -1;
      this.earAmp = 0.7 + Math.random() * 0.6;
      this.earTimer = 2.5 + Math.random() * 5;
    }
    let twitch = 0;
    if (this.earT >= 0) {
      this.earT += dt;
      const x = this.earT;
      twitch = x < 0.07 ? x / 0.07 : x < 0.12 ? 1 : x < 0.3 ? 1 - (x - 0.12) / 0.18 : 0;
      twitch = twitch * Math.sin(x * 40) * 0.25 + twitch;
      if (x > 0.3) this.earT = -1;
    }
    this.flickTimer -= dt;
    if (this.flickT < 0 && this.flickTimer <= 0) {
      this.flickT = 0;
      this.flickTimer = 7 + Math.random() * 8;
    }
    let flick = 0;
    if (this.flickT >= 0) {
      this.flickT += dt;
      const x = this.flickT;
      flick = x < 0.08 ? x / 0.08 : x < 0.5 ? 1 - (x - 0.08) / 0.42 : 0;
      if (x > 0.5) this.flickT = -1;
    }
    for (const e of this.ears) {
      e.layer.begin();
      const mine = e.s === this.earSide ? twitch * this.earAmp : 0;
      e.layer.rotate(e.swivel, mine * 0.42 * e.s + Math.sin(t * 0.7 + e.s) * 0.025);
      e.layer.rotate(e.flick, -flick * 0.22 - mine * 0.12);
      e.layer.end();
    }

    // ---- tail tip: a lazy idle sway plus the odd flick
    const sway = Math.sin(t * 1.15) * 0.1 + Math.sin(t * 2.9 + 1.3) * 0.04;
    for (const s of this.tail) {
      s.layer.begin();
      s.layer.rotate(s.axis, sway * s.k * (f.idle ? 1 : 0.4) + flick * 0.15 * s.k);
      s.layer.end();
    }

    // ---- breathing: the belly bone swells a little (slower and deeper when loafing about)
    if (this.belly) {
      if (!this.belly.scale.equals(this.bellyWritten)) this.bellyScale.copy(this.belly.scale);
      const br = Math.sin(t * (Math.PI * 2) / 3.2);
      const amp = f.idle ? 0.035 : 0.012;
      this.belly.scale.copy(this.bellyScale).multiplyScalar(1 + amp * (0.5 + 0.5 * br));
      this.bellyWritten.copy(this.belly.scale);
    }

    // ---- idle glance: the camera when it's in front of him, else the nearest tourist ahead
    this.glanceTimer -= dt;
    const looking = f.idle || !!f.roam;
    if (looking && this.glanceTimer <= 0) {
      this.glanceTimer = 1.2 + Math.random() * 2.2;
      this.glanceTarget = this.pickGlance(f);
    }
    if (!looking || g > 0) this.glanceTarget = null;
    let wantYaw = 0;
    let wantPitch = 0;
    let wantW = 0;
    if (this.glanceTarget && this.head) {
      this.model.updateWorldMatrix(true, false);
      const local = this.model.worldToLocal(this.tmpTarget.copy(this.glanceTarget));
      // from between the eyes (model space: y up, +z forward)
      const dx = local.x;
      const dy = local.y - 0.56;
      const dz = local.z - 0.33;
      const yaw = Math.atan2(dx, dz);
      if (Math.abs(yaw) < THREE.MathUtils.degToRad(105)) {
        wantYaw = THREE.MathUtils.clamp(yaw, -0.95, 0.95);
        wantPitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.3, 0.42);
        wantW = f.idle ? 1 : 0.6;
      }
    }
    const k = Math.min(1, dt * 4);
    this.lookYaw += (wantYaw - this.lookYaw) * k;
    this.lookPitch += (wantPitch - this.lookPitch) * k;
    this.lookWeight += (wantW - this.lookWeight) * Math.min(1, dt * 2.5);
    const yawA = this.lookYaw * this.lookWeight;
    const pitchA = this.lookPitch * this.lookWeight;
    // washing: little licks (a nod a bit under three times a second) with the head turned to one side
    const lick = g > 0 ? Math.max(0, Math.sin(t * Math.PI * 2 * 2.6)) : 0;
    if (this.neck) {
      this.neck.begin();
      this.neck.rotate(this.headYaw.neck, yawA * 0.35 + g * 0.22 * this.groomSide);
      this.neck.rotate(this.headPitch.neck, -pitchA * 0.3 + g * 0.42);
      this.neck.end();
    }
    if (this.head) {
      this.head.begin();
      this.head.rotate(this.headYaw.local, yawA * 0.65 + g * 0.3 * this.groomSide);
      this.head.rotate(this.headPitch.local, -pitchA * 0.7 + g * (0.38 + 0.16 * lick));
      this.head.end();
    }
  }

  private pickGlance(f: CatLookFrame): THREE.Vector3 | null {
    if (f.focus && Math.random() < 0.8) return f.focus;
    const here = this.model.getWorldPosition(tmpV);
    const fwd = tmpV2.set(0, 0, 1).applyQuaternion(this.model.getWorldQuaternion(tmpQ)).setY(0).normalize();
    if (f.camera) {
      const to = this.tmpTarget.subVectors(f.camera, here).setY(0);
      const d = to.length();
      if (d > 0.3 && to.dot(fwd) / d > -0.2 && Math.random() < 0.75) return f.camera;
    }
    let best: THREE.Vector3 | null = null;
    let bestD = 7;
    for (const tt of f.tourists ?? []) {
      if (!tt.mesh.visible) continue;
      const tp = tt.mesh.position;
      const dx = tp.x - here.x;
      const dz = tp.z - here.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && d > 0.4 && (dx * fwd.x + dz * fwd.z) / d > 0.1) {
        bestD = d;
        best = tp;
      }
    }
    if (best) return this.glanceAt.set(best.x, best.y + 1.55, best.z);
    return null;
  }
}
