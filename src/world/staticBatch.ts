import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const vcMats = new Map<string, THREE.MeshStandardMaterial>();
function vcMaterial(rb: number, mb: number): THREE.MeshStandardMaterial {
  const key = `${rb}|${mb}`;
  let m = vcMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: [0.25, 0.55, 0.9][rb], metalness: [0, 0.75][mb] });
    vcMats.set(key, m);
  }
  return m;
}

/**
 * Merge every static mesh under `root` into as few meshes as possible, per spatial cell
 * (so frustum culling still works). Plain colored standard materials are folded into
 * shared vertex-colored materials; textured, transparent, glowing or animated materials
 * (listed in `keepMaterials`) keep their own material and merge only with identical ones.
 * Moving things live outside `root`.
 */
export function bakeStatic(root: THREE.Object3D, cell: number, keepMaterials: Set<THREE.Material>): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { geos: THREE.BufferGeometry[]; material: THREE.Material; cast: boolean; order: number; big: boolean }>();
  const size = new THREE.Vector3();
  const remove: THREE.Mesh[] = [];
  let before = 0;
  const center = new THREE.Vector3();

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    before++;
    if (Array.isArray(m.material) || m.userData.dynamic) return;
    const src = m.geometry;
    if (!src.attributes.position || !src.attributes.normal || !src.attributes.uv) return;
    if (Object.keys(src.attributes).length !== 3 || Object.keys(src.morphAttributes).length) return;

    const mat = m.material as THREE.MeshStandardMaterial;
    const glow = mat.emissive ? Math.max(mat.emissive.r, mat.emissive.g, mat.emissive.b) * (mat.emissiveIntensity ?? 0) : 0;
    const foldable =
      mat.type === 'MeshStandardMaterial' && !mat.map && !mat.transparent && !mat.vertexColors && !mat.wireframe && mat.side === THREE.FrontSide && glow < 0.12 && !keepMaterials.has(mat);

    const geo = src.clone();
    if (!geo.index) geo.setIndex(Array.from({ length: geo.attributes.position.count }, (_, i) => i));
    geo.clearGroups();
    geo.applyMatrix4(m.matrixWorld);
    geo.computeBoundingBox();
    geo.boundingBox!.getCenter(center);
    geo.boundingBox!.getSize(size);
    // Skyline pieces (towers, big signs, freeway) merge apart from street-level clutter so the clutter can be
    // culled much closer than the skyline: a merged cell no longer drags a bench along with a 150 m tower.
    // userData.clutter (parked cars on garage decks…) stays street clutter even when it sits high up.
    const big = !m.userData.clutter && (Math.max(size.x, size.y, size.z) > 14 || geo.boundingBox!.max.y > 22);
    const cellKey = `${Math.floor(center.x / cell)}|${Math.floor(center.z / cell)}|${big ? 'B' : 's'}`;

    let key: string;
    let material: THREE.Material;
    if (foldable) {
      const rb = mat.roughness < 0.4 ? 0 : mat.roughness < 0.75 ? 1 : 2;
      const mb = mat.metalness < 0.5 ? 0 : 1;
      material = vcMaterial(rb, mb);
      const n = geo.attributes.position.count;
      const colors = new Float32Array(n * 3);
      const c = mat.color.clone();
      if (glow > 0) c.add(mat.emissive.clone().multiplyScalar(mat.emissiveIntensity));
      for (let i = 0; i < n; i++) {
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      key = `vc|${rb}|${mb}|${m.castShadow ? 1 : 0}|${m.renderOrder}|${cellKey}`;
    } else {
      material = mat;
      key = `${mat.uuid}|${m.castShadow ? 1 : 0}|${m.renderOrder}|${cellKey}`;
    }
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { geos: [], material, cast: m.castShadow, order: m.renderOrder, big };
      buckets.set(key, bucket);
    }
    bucket.geos.push(geo);
    remove.push(m);
  });

  for (const m of remove) m.parent?.remove(m);
  const empties: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && !(o as THREE.Mesh).isMesh && o.children.length === 0) empties.push(o);
  });
  for (const e of empties) e.parent?.remove(e);

  for (const b of buckets.values()) {
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (b.geos.length > 1) for (const g of b.geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    mesh.renderOrder = b.order;
    mesh.userData.lod = b.big ? 'big' : 'small';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);
  }
  let after = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) after++;
  });
  return { before, after };
}
