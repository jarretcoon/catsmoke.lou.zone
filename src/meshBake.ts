import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const vcMaterials = new Map<string, THREE.MeshStandardMaterial>();

function vertexColorMaterial(roughBucket: number, metalBucket: number): THREE.MeshStandardMaterial {
  const key = `${roughBucket}|${metalBucket}`;
  let m = vcMaterials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: [0.3, 0.75][roughBucket],
      metalness: [0, 0.8][metalBucket],
    });
    vcMaterials.set(key, m);
  }
  return m;
}

// Coarse buckets: at street-level camera distance two roughness and two metalness looks are plenty.
const bucketRough = (r: number) => (r < 0.5 ? 0 : 1);
const bucketMetal = (m: number) => (m < 0.5 ? 0 : 1);

/**
 * Merge the plain (untextured, opaque, non-glowing) mesh children of `group` into a few
 * vertex-colored meshes, one per roughness/metalness bucket. Children for which `keep`
 * returns true — and anything textured, transparent or emissive — are left alone, so
 * animated parts and special materials keep working. Only direct children are merged;
 * nested groups (limbs, heads) should be baked separately so they can still move.
 */
export function bakeGroup(group: THREE.Object3D, keep: (m: THREE.Mesh) => boolean = () => false): void {
  const buckets = new Map<string, { geos: THREE.BufferGeometry[]; cast: boolean; rb: number; mb: number }>();
  const toRemove: THREE.Mesh[] = [];

  group.updateMatrix();
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh || keep(mesh)) continue;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (Array.isArray(mat) || !mat || mat.type !== 'MeshStandardMaterial') continue;
    if (mat.map || mat.transparent || mat.wireframe || mat.side !== THREE.FrontSide || mat.vertexColors) continue;
    const glow = mat.emissive ? Math.max(mat.emissive.r, mat.emissive.g, mat.emissive.b) * mat.emissiveIntensity : 0;
    if (glow > 0.12) continue;

    mesh.updateMatrix();
    let geo = mesh.geometry.clone();
    geo = geo.index ? geo.toNonIndexed() : geo;
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    }
    geo.applyMatrix4(mesh.matrix);
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const c = mat.color.clone();
    if (glow > 0) c.add(mat.emissive.clone().multiplyScalar(mat.emissiveIntensity));
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const rb = bucketRough(mat.roughness);
    const mb = bucketMetal(mat.metalness);
    const key = `${rb}|${mb}`;
    let b = buckets.get(key);
    if (!b) {
      b = { geos: [], cast: false, rb, mb };
      buckets.set(key, b);
    }
    b.cast ||= mesh.castShadow;
    b.geos.push(geo);
    toRemove.push(mesh);
  }

  for (const m of toRemove) group.remove(m);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, vertexColorMaterial(b.rb, b.mb));
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

/** Bake `root` and every descendant group (each keeps its own transform/animation). */
export function bakeHierarchy(root: THREE.Object3D, keep?: (m: THREE.Mesh) => boolean): void {
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh && o.children.length > 0) groups.push(o);
  });
  for (const g of groups) bakeGroup(g, keep);
}
