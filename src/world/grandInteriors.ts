import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { viewer } from './builder';
import type { WorldBuilder } from './builder';
import { makeCarpetTexture } from './textures';
import { basic, mat, mesh } from './props';
import {
  bellagioMarbleTexture,
  canopyStripeTexture,
  cofferTexture,
  frescoCeilingTexture,
  hieroglyphTexture,
  luxorCorridorAtlas,
  paintedSkyMaterial,
  romanFacadeAtlas,
  signAtlas,
  venetianFacadeAtlas,
  venetianFloorTexture,
} from './grandTextures';

/**
 * The big signature interiors: Bellagio lobby (Chihuly's Fiori di Como) and casino canopies, the
 * Forum Shops' Roman street, Caesars' rotunda, the Venetian lobby + indoor Grand Canal Shoppes and
 * St. Mark's Square, and the Luxor's pyramid atrium.
 *
 * Shells (walls, ceilings, colliders) go through the builder like every other building. The dressing
 * inside each space is merged per material into its own group, added straight to the scene and
 * shown only while the camera is in or near that space, so the Boulevard pays nothing for it.
 */

// ------------------------------------------------------------------------------------------------
// Kit: merge pieces per material, gate groups by camera position
// ------------------------------------------------------------------------------------------------

function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.index === null) {
    const n = g.attributes.position.count;
    const idx = new Array<number>(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(idx);
  }
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  return g;
}

/** Collects many pieces and emits one merged mesh per material. */
export class Kit {
  private readonly lists = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(g: THREE.BufferGeometry, m: THREE.Material): void {
    let l = this.lists.get(m);
    if (!l) {
      l = [];
      this.lists.set(m, l);
    }
    l.push(prep(g));
  }
  at(m: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): void {
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add(g, m);
  }
  /** Box centred at (x, y, z). */
  box(m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0): void {
    this.at(m, new THREE.BoxGeometry(w, h, d), x, y, z, ry);
  }
  /** Upright cylinder standing on y. */
  cyl(m: THREE.Material, x: number, y: number, z: number, rTop: number, rBot: number, h: number, seg = 12): void {
    this.at(m, new THREE.CylinderGeometry(rTop, rBot, h, seg), x, y + h / 2, z);
  }
  flush(group: THREE.Object3D, cast = false): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [m, geos] of this.lists) {
      if (!geos.length) continue;
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (geos.length > 1) for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const me = new THREE.Mesh(merged, m);
      me.castShadow = cast;
      me.receiveShadow = true;
      me.matrixAutoUpdate = false;
      group.add(me);
      out.push(me);
    }
    this.lists.clear();
    return out;
  }
}

const sharedTexMats = new Map<string, THREE.Material>();
/**
 * Merge a prop group (slot machine, table, bar…) into a kit at (x, y, z, ry). Textured basic
 * materials (slot screens) are swapped for one shared material per texture so a whole bank of
 * machines costs one draw per material instead of one per machine.
 */
export function kitAddObject(k: Kit, obj: THREE.Object3D, x: number, y: number, z: number, ry = 0): void {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    let material = m.material as THREE.Material;
    const bm = material as THREE.MeshBasicMaterial;
    if (bm.isMeshBasicMaterial && bm.map) {
      const key = `${bm.map.uuid}|${bm.color.getHex()}`;
      let shared = sharedTexMats.get(key);
      if (!shared) {
        shared = bm;
        sharedTexMats.set(key, shared);
      }
      material = shared;
    }
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    k.add(g, material);
  });
}

interface Gate {
  obj: THREE.Object3D;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
const gatesByBuilder = new WeakMap<WorldBuilder, Gate[]>();

const interiorBoxes: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; gate: Gate }> = [];

/**
 * True when (x, z) is inside one of the walk-in interiors while the camera is outside it — e.g. a
 * tourist strolling the Grand Canal Shoppes seen from the Boulevard (walls hide them, but they'd
 * still be drawn). For main.ts after the crowd update:
 *   for (const t of crowd.tourists) if (t.mesh.visible && hiddenIndoors(t.mesh.position.x, t.mesh.position.z)) t.mesh.visible = false;
 */
export function hiddenIndoors(x: number, z: number): boolean {
  for (const r of interiorBoxes) {
    if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return !r.gate.obj.visible;
  }
  return false;
}

/** Adds `obj` to the scene, visible only while the camera is within the box (+margin). */
export function gated(b: WorldBuilder, obj: THREE.Object3D, minX: number, maxX: number, minZ: number, maxZ: number, margin = 6): Gate {
  b.scene.add(obj);
  let list = gatesByBuilder.get(b);
  if (!list) {
    const l: Gate[] = [];
    gatesByBuilder.set(b, l);
    list = l;
    b.every(() => {
      const c = viewer.cam;
      for (const g of l) g.obj.visible = c.x > g.minX && c.x < g.maxX && c.z > g.minZ && c.z < g.maxZ;
    });
  }
  const g = { obj, minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin };
  list.push(g);
  interiorBoxes.push({ minX, maxX, minZ, maxZ, gate: g });
  obj.visible = false;
  return g;
}

/** PlaneGeometry (facing +z) with its UVs remapped to an atlas sub-rect. */
export function quad(w: number, h: number, u0: number, v0: number, u1: number, v1: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  return g;
}

const texMats = new Map<string, THREE.Material>();
export function texMat(key: string, make: () => THREE.Material): THREE.Material {
  let m = texMats.get(key);
  if (!m) {
    m = make();
    texMats.set(key, m);
  }
  return m;
}

/** A floor plane with a repeating texture (cloned per size so repeats differ). */
export function texFloor(tex: THREE.Texture, w: number, d: number, tile: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(w / tile, d / tile);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.05, ...extra });
}

/** Seeded random (mulberry32). */
export function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shared looks
export const gold = () => mat(0xd9ae4a, 0.28, 0.9);
export const marbleWhite = () => mat(0xf1ebde, 0.3, 0.05);
export const glowWarm = () => basic(0xffe2a8);

/** Classical column (base, fluted-look shaft, gold or marble capital) into a kit. */
export function column(k: Kit, x: number, z: number, h: number, r: number, shaft: THREE.Material, cap: THREE.Material, y0 = 0): void {
  k.box(cap, x, y0 + 0.2, z, r * 2.8, 0.4, r * 2.8);
  k.cyl(shaft, x, y0 + 0.4, z, r * 0.92, r, h - 1.1, 14);
  k.cyl(cap, x, y0 + h - 0.7, z, r * 1.5, r * 0.95, 0.45, 14);
  k.box(cap, x, y0 + h - 0.12, z, r * 3, 0.25, r * 3);
}

/** Crystal chandelier: tiers of glowing drops round a gold stem, hanging from y. */
export function chandelier(k: Kit, x: number, y: number, z: number, r: number, crystal: THREE.Material, metal: THREE.Material): void {
  k.at(metal, new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), x, y - 0.6, z);
  for (let t = 0; t < 3; t++) {
    const rr = r * (1 - t * 0.28);
    const yy = y - 1.3 - t * 0.55;
    k.at(metal, new THREE.TorusGeometry(rr, 0.05, 5, 20).rotateX(Math.PI / 2), x, yy, z);
    const n = 10 + t * -2 + Math.round(rr * 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      k.at(crystal, new THREE.OctahedronGeometry(0.11, 0).scale(1, 1.8, 1), x + Math.cos(a) * rr, yy - 0.25, z + Math.sin(a) * rr);
    }
  }
  k.at(crystal, new THREE.SphereGeometry(r * 0.35, 10, 8), x, y - 2.2, z);
}

/**
 * A draped classical statue (plinth, robed body, head, raised arm) merged into a kit, ~h tall on the plinth.
 * `pose` turns the raised arm (0 = right arm up, 1 = left arm forward).
 */
export function statue(k: Kit, m: THREE.Material, x: number, y: number, z: number, h: number, facing: number, pose = 0, plinth?: THREE.Material): void {
  const s = h / 2.4;
  const P = (lx: number, ly: number, lz: number): [number, number, number] => {
    const c = Math.cos(facing);
    const sn = Math.sin(facing);
    return [x + lx * c + lz * sn, y + ly, z - lx * sn + lz * c];
  };
  if (plinth) {
    k.box(plinth, x, y - 0.8 * s, z, 1.3 * s, 1.6 * s, 1.3 * s, facing);
    k.box(plinth, x, y - 0.05 * s, z, 1.5 * s, 0.1 * s, 1.5 * s, facing);
  }
  const at = (g: THREE.BufferGeometry, lx: number, ly: number, lz: number, rx = 0, rz = 0) => {
    const [wx, wy, wz] = P(lx, ly, lz);
    k.at(m, g, wx, wy, wz, facing, rx, rz);
  };
  at(new THREE.CylinderGeometry(0.28 * s, 0.42 * s, 1.3 * s, 10), 0, 0.65 * s, 0); // robe
  at(new THREE.CylinderGeometry(0.24 * s, 0.28 * s, 0.6 * s, 10), 0, 1.6 * s, 0); // torso
  at(new THREE.SphereGeometry(0.17 * s, 10, 8), 0, 2.1 * s, 0.02 * s); // head
  at(new THREE.CylinderGeometry(0.2 * s, 0.24 * s, 0.25 * s, 10), 0, 1.3 * s, 0); // belt drape
  at(new THREE.BoxGeometry(0.5 * s, 0.9 * s, 0.12 * s), -0.1 * s, 1.35 * s, -0.22 * s, 0.15, 0.25); // cloak fold
  if (pose === 0) {
    at(new THREE.CylinderGeometry(0.07 * s, 0.08 * s, 0.85 * s, 6), 0.32 * s, 2.15 * s, 0, 0, -0.25); // raised right arm
    at(new THREE.CylinderGeometry(0.07 * s, 0.08 * s, 0.7 * s, 6), -0.3 * s, 1.45 * s, 0.08 * s, 0, 0.15);
  } else {
    at(new THREE.CylinderGeometry(0.07 * s, 0.08 * s, 0.7 * s, 6), -0.3 * s, 1.7 * s, 0.3 * s, 1.2, 0); // arm forward
    at(new THREE.CylinderGeometry(0.07 * s, 0.08 * s, 0.7 * s, 6), 0.3 * s, 1.45 * s, 0.05 * s, 0, -0.15);
  }
}

/** Piazza lamp post: dark iron column, scrolled arms, three glowing globes. */
export function lampPost(k: Kit, x: number, z: number, h = 3.6, globeMat: THREE.Material = glowWarm(), y = 0): void {
  const iron = mat(0x1c1a18, 0.45, 0.6);
  k.cyl(iron, x, y, z, 0.18, 0.24, 0.5, 8);
  k.cyl(iron, x, y + 0.5, z, 0.07, 0.1, h - 0.5, 8);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const ax = x + Math.cos(a) * 0.45;
    const az = z + Math.sin(a) * 0.45;
    k.at(iron, new THREE.BoxGeometry(0.9, 0.05, 0.05), (x + ax) / 2, y + h - 0.35, (z + az) / 2, -a);
    k.at(globeMat, new THREE.SphereGeometry(0.19, 10, 8), ax, y + h - 0.12, az);
  }
  k.at(globeMat, new THREE.SphereGeometry(0.22, 10, 8), x, y + h + 0.15, z);
}

let waterMatCache: THREE.MeshStandardMaterial | null = null;
export function poolWater(): THREE.MeshStandardMaterial {
  if (!waterMatCache) waterMatCache = new THREE.MeshStandardMaterial({ color: 0x2f9aa8, roughness: 0.05, metalness: 0.5, emissive: 0x0c4a58, emissiveIntensity: 0.55 });
  return waterMatCache;
}

// ================================================================================================
// BELLAGIO
// ================================================================================================

/** Glass blossom: a ruffled bowl hanging mouth-down (unit radius). */
function blossomGeometry(): THREE.BufferGeometry {
  const seg = 14;
  const rings = 3;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  pos.push(0, 0, 0);
  uv.push(0.5, 0.5);
  for (let j = 1; j <= rings; j++) {
    const r = j / rings;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ruffle = 0.3 * Math.sin(a * 7) * r * r * r;
      const y = -0.38 * r * r + ruffle;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uv.push(0.5 + Math.cos(a) * r * 0.5, 0.5 + Math.sin(a) * r * 0.5);
    }
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + i, 1 + ((i + 1) % seg));
  for (let j = 1; j < rings; j++) {
    const a0 = 1 + (j - 1) * seg;
    const a1 = 1 + j * seg;
    for (let i = 0; i < seg; i++) {
      const i1 = (i + 1) % seg;
      idx.push(a0 + i, a1 + i, a1 + i1, a0 + i, a1 + i1, a0 + i1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Twisted glass horn ("Venetian" spiral) pointing down, unit length. */
function hornGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector2(0.03 + 0.2 * Math.pow(t, 2.6), -t));
  }
  const g = new THREE.LatheGeometry(pts, 8);
  // twist
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const a = y * 2.4;
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a) + 0.18 * y * y, y, x * Math.sin(a) + z * Math.cos(a));
  }
  g.computeVertexNormals();
  return g;
}

/** Glossy glass with emissive tinted by the instance colour and brightened at grazing angles (backlit look). */
export function glassMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.42, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR )
        float rimF = 1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0);
        totalEmissiveRadiance *= vColor.rgb * (0.65 + 1.1 * rimF * rimF);
      #endif`
    );
  };
  m.customProgramCacheKey = () => 'grand-glass';
  return m;
}

/**
 * Bellagio lobby with Dale Chihuly's "Fiori di Como" (2,000 glass blossoms) between the casino, the
 * Conservatory and the porte-cochère. Lobby: x −132…−112, z 62.6…100.
 */
export function buildBellagioLobby(b: WorldBuilder): void {
  const x0 = -132;
  const x1 = -112;
  const z0 = 62.6;
  const z1 = 100;
  const H = 10; // main ceiling
  const HR = 11.6; // the recess over the glass
  const cx = (x0 + x1) / 2;
  const wall = mat(0xe8dcc4, 0.75);
  const plaster = mat(0xf3ead8, 0.85, 0, { emissive: 0xfff0d8, emissiveIntensity: 0.22 });

  // ---- Shell (baked) ----
  b.box(x0 - 0.5, 0, (z0 + z1) / 2, 1, 12.5, z1 - z0 + 1, wall, true); // west
  b.box(-128, 0, 62, 8, 12.5, 1.2, wall, true); // north (the casino's wall covers x −124…−112)
  b.box(-118, 11, 62, 12, 1.5, 1.2, wall, true); // casino wall is only 11 tall
  b.box(x1, 0, 64.3, 1, 12.5, 3.4, wall, true); // east, north of the Conservatory
  b.box(x1, 0, 99, 1, 12.5, 2, wall, true); // east, south of it
  b.box(x1, 9, 82, 1, 3.5, 32, wall, true); // above the Conservatory's wall
  // South wall with the porte-cochère doorway (x −126…−118)
  b.box(-129, 0, z1, 6, 12.5, 1, wall, true);
  b.box(-115, 0, z1, 6, 12.5, 1, wall, true);
  b.box(-122, 4.8, z1, 8, 7.7, 1, wall, true);
  // Ceilings: the main ceiling round a recess where the glass hangs
  b.box(cx, H, 66.3, 20, 0.5, 7.4, plaster);
  b.box(cx, H, 96, 20, 0.5, 8, plaster);
  b.box(-129.5, H, 81, 5, 0.5, 22, plaster);
  b.box(-114.5, H, 81, 5, 0.5, 22, plaster);
  b.box(-122, HR, 81, 10, 0.5, 22, plaster);
  b.building(cx, (z0 + z1) / 2, x1 - x0, z1 - z0, '#e8dcc4', 'Lobby');

  // ---- Dressing (gated) ----
  const g = new THREE.Group();
  const k = new Kit();
  const floorMat = texFloor(bellagioMarbleTexture(), x1 - x0, z1 - z0, 5, { roughness: 0.22 });
  const floor = mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), floorMat, cx, 0.035, (z0 + z1) / 2);
  floor.rotation.x = -Math.PI / 2;
  floor.updateMatrix();
  floor.matrixAutoUpdate = false;
  g.add(floor);

  // Recess: gilded rim, glowing cove and a warm backlit ceiling above the blossoms
  const gilt = gold();
  const cove = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
  for (const [x, z, w, d] of [
    [-122, 70, 10.4, 0.3],
    [-122, 92, 10.4, 0.3],
    [-127, 81, 0.3, 22.4],
    [-117, 81, 0.3, 22.4],
  ]) {
    k.box(plaster, x, (H + HR) / 2, z, w, HR - H, d);
    k.box(gilt, x, H - 0.05, z, w + 0.25, 0.22, d + 0.25);
    k.box(cove, x, H + 0.35, z, w * 0.98, 0.08, d * 0.98);
  }
  const backlight = new THREE.MeshBasicMaterial({ color: 0xfff3dc });
  k.at(backlight, new THREE.PlaneGeometry(10, 22).rotateX(Math.PI / 2), -122, HR - 0.02, 81);
  // Coffered main ceiling: gold-lined panels and recessed lights
  for (let z = 64.5; z < 99; z += 3.5) {
    for (const x of [-129.5, -114.5]) {
      if (z > 70 && z < 92) {
        k.box(gilt, x, H - 0.04, z, 4.4, 0.06, 0.08);
      }
      k.at(cove, new THREE.CircleGeometry(0.18, 10).rotateX(Math.PI / 2), x, H - 0.03, z);
    }
  }

  // Columns: marble with gilded capitals
  const shaft = mat(0xe9dfcc, 0.25, 0.05);
  for (const z of [66.5, 74, 88, 96.5]) column(k, -114.6, z, H, 0.42, shaft, gilt);
  for (const z of [66.5, 96.5]) column(k, -129.4, z, H, 0.42, shaft, gilt);
  for (const z of [66.5, 74, 88, 96.5]) b.collider(-115.1, -114.1, z - 0.5, z + 0.5, 0, H, true);
  for (const z of [66.5, 96.5]) b.collider(-129.9, -128.9, z - 0.5, z + 0.5, 0, H, true);

  // Front desk along the west wall: dark wood, marble top, gold trim, lit back wall
  const wood = mat(0x3a2014, 0.45, 0.1);
  const deskX = -128.6;
  k.box(wood, deskX, 0.55, 81, 1.2, 1.1, 18);
  k.box(marbleWhite(), deskX, 1.14, 81, 1.5, 0.08, 18.3);
  k.box(gilt, deskX + 0.62, 0.95, 81, 0.04, 0.08, 18);
  k.box(gilt, deskX + 0.62, 0.15, 81, 0.04, 0.1, 18);
  b.collider(deskX - 0.75, deskX + 0.75, 72, 90, 0, 1.18, true);
  const panel = mat(0x5a3a22, 0.5, 0.1);
  for (let z = 72.5; z < 90; z += 3.4) {
    k.box(panel, x0 + 0.08, 4.2, z, 0.12, 6.4, 2.8);
    k.box(gilt, x0 + 0.16, 4.2, z, 0.04, 6.6, 0.08);
    k.at(cove, new THREE.PlaneGeometry(2.4, 0.12).rotateY(Math.PI / 2), x0 + 0.16, 7.5, z);
  }
  const { tex: deskSign } = signAtlas(['BELLAGIO', 'FRONT DESK • CHECK-IN', 'VIA BELLAGIO', 'CONSERVATORY & BOTANICAL GARDENS', 'CASINO'], 'bellagio');
  const signMat = texMat('bell-sign', () => new THREE.MeshBasicMaterial({ map: deskSign }));
  k.at(signMat, quad(8, 1.0, 0, 0.8, 1, 1).rotateY(Math.PI / 2), x0 + 0.25, 8.4, 81);
  k.at(signMat, quad(5, 0.6, 0, 0.6, 1, 0.8).rotateY(Math.PI / 2), x0 + 0.25, 3.1, 81);
  k.at(signMat, quad(5, 0.7, 0, 0, 1, 0.2), -118, 6.8, 62.68 + 0.6);
  k.at(signMat, quad(6, 0.6, 0, 0.2, 1, 0.4).rotateY(-Math.PI / 2), x1 - 0.55, 5.4, 91);

  // Flowers: the lobby's famous arrangements in gilded urns
  const urn = mat(0xc9a04a, 0.3, 0.8);
  const petals = [0xff5e8e, 0xffffff, 0xffc63d, 0xff7b29, 0xd16bff].map((c) => mat(c, 0.6, 0, { emissive: c, emissiveIntensity: 0.08 }));
  const leaf = mat(0x2f6b3a, 0.7);
  const r = rand(17);
  for (const [x, z] of [
    [-122, 66.5],
    [-122, 96.5],
    [-118.5, 81],
  ]) {
    k.cyl(urn, x, 0, z, 0.9, 0.55, 1.1, 14);
    k.cyl(urn, x, 1.1, z, 1.0, 0.95, 0.12, 14);
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const rr = r() * 1.2;
      const y = 1.4 + r() * 1.2 * (1 - rr / 1.4);
      k.at(i % 4 === 0 ? leaf : petals[i % petals.length], new THREE.IcosahedronGeometry(0.13 + r() * 0.1, 1), x + Math.cos(a) * rr, y, z + Math.sin(a) * rr);
    }
    b.collider(x - 1, x + 1, z - 1, z + 1, 0, 1.25, true);
  }
  // Settees by the Conservatory doors
  const velvet = mat(0x7a2a3a, 0.8);
  for (const z of [84.5, 97.2]) {
    k.box(velvet, -115.5, 0.3, z, 1.0, 0.6, 3.2);
    k.box(velvet, -115.05, 0.75, z, 0.25, 0.9, 3.2);
    b.collider(-116, -114.9, z - 1.6, z + 1.6, 0, 0.6);
  }
  k.flush(g);

  // ---- Fiori di Como: ~2,000 glass blossoms (two instanced draws) ----
  const glass = glassMaterial();
  const palette = [0x1f5fff, 0x27c3ff, 0x6bf04a, 0xffd21f, 0xff8a1f, 0xff2f2f, 0xff3fa8, 0x9a4bff, 0xffb03a, 0x2ad6a0, 0xff6a3a, 0x3a7aff];
  const nB = 1650;
  const nH = 350;
  const blossoms = new THREE.InstancedMesh(blossomGeometry(), glass, nB);
  const horns = new THREE.InstancedMesh(hornGeometry(), glass, nH);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sv = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const col = new THREE.Color();
  const rr = rand(2026);
  const place = (im: THREE.InstancedMesh, i: number, size: number, horn: boolean) => {
    // denser near the top, a soft hanging belly in the middle of the field
    const u = rr();
    const v = rr();
    const x = -126.6 + u * 9.2;
    const z = 70.4 + v * 21.2;
    const belly = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
    const y = HR - 0.15 - Math.pow(rr(), 1.6) * (0.6 + 1.3 * belly) - (horn ? 0.2 : 0);
    e.set((rr() - 0.5) * (horn ? 0.5 : 0.7), rr() * Math.PI * 2, (rr() - 0.5) * (horn ? 0.5 : 0.7));
    q.setFromEuler(e);
    const s = size * (0.75 + rr() * 0.6);
    sv.set(s, horn ? s * (1.4 + rr()) : s, s);
    pv.set(x, y, z);
    m4.compose(pv, q, sv);
    im.setMatrixAt(i, m4);
    col.setHex(palette[Math.floor(rr() * palette.length)]);
    col.offsetHSL(0, 0, (rr() - 0.5) * 0.12);
    im.setColorAt(i, col);
  };
  for (let i = 0; i < nB; i++) place(blossoms, i, 0.44, false);
  for (let i = 0; i < nH; i++) place(horns, i, 0.7, true);
  for (const im of [blossoms, horns]) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.frustumCulled = true;
    g.add(im);
  }
  gated(b, g, x0, x1, z0, z1, 4);

  b.zone('Bellagio Lobby • Fiori di Como', x0, x1, z0, z1);
  b.pickup(deskX, 1.6, 76, 3, 'Front Desk Mint-Tin Pack', true);
  b.pickup(-118.5, 0.5, 78.6, 2, "Chihuly Admirer's Pack", true);
  b.crowd.tourists.push({ pts: [[-122, 98], [-122, 68], [-117, 72], [-117, 92]], prop: 'camera' }, { pts: [[-120, 64], [-125, 90], [-113.5, 91]], prop: 'bag' });
  b.staticMarkers.push({ x: -122, z: 81, color: '#ff8ad8', glyph: '✿', size: 2.6 });
}

/** Striped fabric tents, chandeliers and columns over the Bellagio casino floor (x −124…−80, z 18…62). */
export function buildBellagioCasinoDressing(b: WorldBuilder): void {
  const g = new THREE.Group();
  const k = new Kit();
  const tents: Array<[number, number, string, string]> = [
    [-109, 29, '#f3e6c8', '#b5402e'],
    [-91, 29, '#f3e6c8', '#c9962e'],
    [-109, 51, '#f3e6c8', '#3f6b4a'],
    [-91, 51, '#f3e6c8', '#9a2a3a'],
  ];
  const crystal = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe6b0, emissiveIntensity: 1.1, roughness: 0.15, metalness: 0.2 });
  const gilt = gold();
  for (const [x, z, a, c] of tents) {
    const tex = canopyStripeTexture(a, c, '#c9a24a');
    const fabric = texMat(`tent|${c}`, () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide, emissive: 0xffe0b0, emissiveIntensity: 0.12, emissiveMap: tex }));
    // Tent: a shallow cone (apex up), then a scalloped valance round the rim
    const R = 8;
    k.at(fabric, new THREE.ConeGeometry(R, 1.55, 32, 1, true), x, 9.2 + 0.775, z);
    k.at(fabric, new THREE.CylinderGeometry(R, R, 0.6, 32, 1, true), x, 8.9, z);
    for (let i = 0; i < 32; i++) {
      const ang = (i / 32) * Math.PI * 2;
      k.at(fabric, new THREE.ConeGeometry(0.42, 0.4, 4, 1, true), x + Math.cos(ang) * R, 8.4, z + Math.sin(ang) * R, -ang, Math.PI);
    }
    k.at(gilt, new THREE.TorusGeometry(R, 0.07, 5, 40).rotateX(Math.PI / 2), x, 9.2, z);
    k.at(gilt, new THREE.SphereGeometry(0.4, 12, 8), x, 10.7, z);
    chandelier(k, x, 10.5, z, 1.3, crystal, gilt);
  }
  // Marble columns with gilded capitals between the tents (along the aisles, clear of the tables)
  const shaft = mat(0xe9dfcc, 0.25, 0.05);
  for (const [x, z] of [
    [-100, 20.5],
    [-100, 59.5],
    [-121.5, 40],
    [-82.5, 40],
  ]) {
    column(k, x, z, 11, 0.45, shaft, gilt);
    b.collider(x - 0.5, x + 0.5, z - 0.5, z + 0.5, 0, 11, true);
  }
  // Italianate lamp sconces round the walls
  const lamp = glowWarm();
  for (let z = 22; z < 60; z += 6) {
    for (const x of [-123.35, -80.65]) k.at(lamp, new THREE.SphereGeometry(0.22, 8, 6).scale(1, 1.4, 1), x, 4.2, z);
  }
  k.flush(g);
  gated(b, g, -124, -80, 18, 62, 3);
}

/** Bellagio's roof over the casino (casts the sun's shadow so the floor reads as indoors). */
export function bellagioCasinoRoof(b: WorldBuilder): void {
  b.box(-102, 11.8, 40, 45.2, 0.35, 45.2, mat(0xd8c8a8, 0.85));
}
