import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { tower, curvedTower } from './buildings';
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

  // ---- South (toward the airport end of the Strip) ----
  tower(b, { x: -60, z: 352, w: 30, d: 14, h: 34, facade: { wall: '#e8dcc4', mullion: '#f4ead6', glass: '#6c757c', lit: '#ffe6b0', cols: 10, rows: 20, seed: 201 }, collide: false, cast: false }); // Park MGM
  // NYNY skyline cluster
  for (const [x, z, h, c] of [
    [-44, 410, 36, '#b9a88e'],
    [-34, 420, 46, '#c9b79a'],
    [-54, 424, 30, '#a8977c'],
    [-40, 432, 52, '#d9c6a6'],
  ] as const) tower(b, { x, z, w: 8, d: 8, h, facade: { wall: c, mullion: '#e8dcc4', glass: '#5a5f66', lit: '#ffe6b0', cols: 4, rows: 14, seed: x }, collide: false, cast: false });
  // MGM Grand — the big green one
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    tower(b, { x: 90 + Math.cos(a) * 14, z: 420 + Math.sin(a) * 14, w: 28, d: 11, h: 36, facade: { wall: '#2f9e6a', mullion: '#5fd29a', glass: '#1d5e40', lit: '#d8ffe8', cols: 10, rows: 22, style: 2, seed: 210 + i }, rotY: -a, metal: 0.5, collide: false, cast: false });
  }
  // Excalibur castle turrets
  const castleColors = [0xd9362b, 0x2a66cc, 0xf2c230];
  for (let i = 0; i < 6; i++) {
    const x = -78 + (i % 3) * 12;
    const z = 480 + Math.floor(i / 3) * 12;
    b.add(mesh(new THREE.CylinderGeometry(2.4, 2.4, 14, 12), mat(0xf2efe6, 0.7), x, 7, z));
    b.add(mesh(new THREE.ConeGeometry(3, 6, 12), mat(castleColors[i % 3], 0.5), x, 17, z));
  }
  tower(b, { x: -66, z: 470, w: 34, d: 10, h: 26, facade: { wall: '#f2efe6', mullion: '#ffffff', glass: '#7a2a2a', lit: '#ffe6b0', cols: 10, rows: 16, seed: 220 }, collide: false, cast: false });
  // Luxor pyramid + the sky beam (on at night)
  const pyr = mesh(new THREE.ConeGeometry(46, 48, 4), mat(0x111418, 0.15, 0.8), -70, 24, 560);
  pyr.rotation.y = Math.PI / 4;
  b.add(pyr);
  b.add(mesh(new THREE.BoxGeometry(14, 10, 20), mat(0xd9b98a, 0.7), -40, 5, 520)); // Sphinx block
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const beam = mesh(new THREE.CylinderGeometry(1.4, 3.2, 900, 12, 1, true), beamMat, -70, 48 + 450, 560);
  b.add(beam);
  b.every((_dt, _t, night) => {
    beamMat.opacity = night * 0.32;
  });
  // Mandalay Bay — gold Y
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    tower(b, { x: -50 + Math.cos(a) * 15, z: 640 + Math.sin(a) * 15, w: 30, d: 10, h: 44, facade: { wall: '#d4a640', mullion: '#f2c46a', glass: '#b88a2a', lit: '#fff0c0', cols: 10, rows: 26, style: 2, seed: 230 + i }, rotY: -a, metal: 0.8, rough: 0.2, collide: false, cast: false });
  }

  // ---- North ----
  curvedTower(b, 120, -470, 50, Math.PI * 0.85, Math.PI * 1.25, 5, 14, 58, { wall: '#a0673e', mullion: '#c88a5a', glass: '#7a4a2a', lit: '#ffd9a0', cols: 10, rows: 30, style: 2, seed: 240 }, 0.7); // Wynn
  curvedTower(b, 140, -520, 46, Math.PI * 0.85, Math.PI * 1.25, 5, 14, 60, { wall: '#a0673e', mullion: '#c88a5a', glass: '#7a4a2a', lit: '#ffd9a0', cols: 10, rows: 30, style: 2, seed: 241 }, 0.7); // Encore
  tower(b, { x: 90, z: -600, w: 22, d: 30, h: 72, facade: { wall: '#3a6fb8', mullion: '#6a9ad8', glass: '#24508c', lit: '#e8f2ff', cols: 10, rows: 34, style: 2, seed: 250 }, metal: 0.6, collide: false, cast: false }); // Fontainebleau
  tower(b, { x: -80, z: -580, w: 30, d: 20, h: 56, facade: { wall: '#7a1a24', mullion: '#a83a44', glass: '#5a0f18', lit: '#ffd0d0', cols: 10, rows: 28, style: 2, seed: 260 }, metal: 0.6, collide: false, cast: false }); // Resorts World
  // The STRAT: shaft + pod + needle, far up the Boulevard
  const strat = new THREE.Group();
  strat.add(mesh(new THREE.CylinderGeometry(3.2, 5, 96, 3), mat(0xe8e4dc, 0.6), 0, 48, 0));
  strat.add(mesh(new THREE.CylinderGeometry(9, 7, 10, 20), mat(0xdcd6cc, 0.5, 0.3), 0, 100, 0));
  strat.add(mesh(new THREE.CylinderGeometry(0.6, 1, 22, 8), mat(0xaaaaaa, 0.4, 0.7), 0, 116, 0));
  const stratLights = basic(0xff3355);
  strat.add(mesh(new THREE.TorusGeometry(9.1, 0.4, 6, 32), stratLights, 0, 103, 0));
  strat.children[strat.children.length - 1].rotation.x = Math.PI / 2;
  b.add(strat, 30, 0, -760);

  // ---- West: I-15 + the off-Strip resorts ----
  const freeway = mat(0x5a5a60, 0.85);
  b.add(mesh(new THREE.BoxGeometry(30, 1.2, 1600), freeway, -230, 8, -50));
  for (let z = -800; z < 700; z += 40) b.add(mesh(new THREE.CylinderGeometry(1.2, 1.4, 8, 8), mat(0x8a8a90, 0.8), -230, 4, z));
  const fwLights = basic(0xfff0c8);
  for (let z = -800; z < 700; z += 20) b.add(mesh(new THREE.SphereGeometry(0.6, 6, 4), fwLights, -217, 13, z));
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
  ridge(0, 1250, 9, 160, 110, 0x5e5054, 'x'); // south hills
  ridge(0, -1300, 9, 180, 120, 0x5a4c50, 'x'); // north range

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
