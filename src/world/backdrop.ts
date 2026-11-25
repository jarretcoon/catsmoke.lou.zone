import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { tower } from './buildings';
import { makeDesertTexture } from './textures';
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

  // ---- West: I-15 + the off-Strip resorts ----
  const freeway = mat(0x5a5a60, 0.85);
  b.add(mesh(new THREE.BoxGeometry(30, 1.2, 2400), freeway, -230, 8, 80));
  for (let z = -1100; z < 1280; z += 40) b.add(mesh(new THREE.CylinderGeometry(1.2, 1.4, 8, 8), mat(0x8a8a90, 0.8), -230, 4, z));
  const fwLights = basic(0xfff0c8);
  for (let z = -1100; z < 1280; z += 20) b.add(mesh(new THREE.SphereGeometry(0.6, 6, 4), fwLights, -217, 13, z));
  tower(b, { x: -330, z: 40, w: 34, d: 18, h: 46, facade: { wall: '#2a4e9a', mullion: '#d8364a', glass: '#1a2e5a', lit: '#ffd0e0', cols: 10, rows: 24, style: 1, seed: 270 }, collide: false, cast: false }); // Rio
  tower(b, { x: -360, z: -60, w: 20, d: 30, h: 50, facade: { wall: '#c8b8a0', mullion: '#e0d4c0', glass: '#4a5560', lit: '#ffe6b0', cols: 10, rows: 26, seed: 280 }, collide: false, cast: false }); // Palms
  b.add(neonSign('RIO', '#140818', '#ff3b5c', 12, 4), -312.8, 40, 40, Math.PI / 2);

  // ---- Mountains ----
  const ridge = (cx: number, cz: number, count: number, spread: number, baseH: number, color: number, axis: 'x' | 'z') => {
    const m = mat(color, 1);
    for (let i = 0; i < count; i++) {
      const off = (i - count / 2) * spread;
      const h = baseH * (0.6 + 0.4 * Math.abs(Math.sin(i * 1.7)) + (i % 3) * 0.12);
      const r = h * (1.3 + (i % 2) * 0.4);
      const x = axis === 'z' ? cx + Math.sin(i * 2.3) * 40 : cx + off;
      const z = axis === 'z' ? cz + off : cz + Math.sin(i * 2.3) * 40;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), m);
      cone.position.set(x, h / 2 - 4, z);
      cone.rotation.y = i;
      b.add(cone);
    }
  };
  ridge(-1100, -100, 16, 120, 190, 0x5a4a52, 'z'); // Spring Mountains / Red Rock
  ridge(-1250, 200, 6, 160, 260, 0x4e4048, 'z'); // Mt. Charleston massif behind
  ridge(950, -200, 7, 90, 150, 0x6a5a58, 'z'); // Frenchman / Sunrise Mountain
  ridge(0, 1900, 9, 200, 140, 0x5e5054, 'x'); // south hills
  ridge(0, -1800, 9, 220, 150, 0x5a4c50, 'x'); // north range (Sheep Range)

  // ---- Invisible map edge (low landscaping walls you can see) ----
  const edgeMat = mat(0x6b5a46, 0.95);
  const xW = STRIP.flamingoWest + 2;
  const xE = STRIP.flamingoEast - 2;
  const zN = STRIP.north - 4;
  const zS = STRIP.south + 4;
  b.box((xW + xE) / 2, 0, zN, xE - xW, 0.8, 1.2, edgeMat, false, false);
  b.box((xW + xE) / 2, 0, zS, xE - xW, 0.8, 1.2, edgeMat, false, false);
  b.box(xW, 0, (zN + zS) / 2, 1.2, 0.8, zS - zN, edgeMat, false, false);
  b.box(xE, 0, (zN + zS) / 2, 1.2, 0.8, zS - zN, edgeMat, false, false);
  b.collider(xW - 50, xE + 50, zN - 50, zN - 0.6, 0, 60, true);
  b.collider(xW - 50, xE + 50, zS + 0.6, zS + 50, 0, 60, true);
  b.collider(xW - 50, xW - 0.6, zN - 50, zS + 50, 0, 60, true);
  b.collider(xE + 0.6, xE + 50, zN - 50, zS + 50, 0, 60, true);
}
