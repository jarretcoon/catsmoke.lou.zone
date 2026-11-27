import { type WorldBuilder } from './builder';
import { basic, mat } from './props';
import { L1, Merger, v3 } from './southKit';
import type { FacadeSpec } from './textures';
import { addBuilding, flatRoad, signBoard } from './westKit';
import { I15 } from './interstate';

/**
 * Past the west wall of the Dean Martin bay (x < -311) the map used to be open desert. In real life that's
 * the Valley View / Polaris industrial grid: rows of tilt-up warehouses and yards (OSM: dozens of
 * building=warehouse/industrial ways between Polaris Ave and Valley View Blvd), the Sinclair truck stop and
 * CAT Scale on Tropicana, and La Quinta Inn & Suites at 4975 S Valley View. None of it is walkable; it's
 * the skyline you see from Dean Martin Dr, the Tropicana bridge and I-15. Everything here is merged into a
 * handful of shared materials (a few draw calls), with no colliders.
 */

const X_E = -314; // just past the bay's west berm
const X_W = -480;
const VALLEY_VIEW_X = -392;

export function buildValleyViewBackdrop(b: WorldBuilder): void {
  const mg = new Merger();

  // ---- Roads that really keep going west: Tropicana Ave, Flamingo Rd, and Valley View Blvd north-south
  flatRoad(b, (X_E + X_W) / 2, I15.tropZ, 21.0, X_E - X_W, 'x', 6, true, L1);
  flatRoad(b, (X_E + X_W) / 2, I15.flamingoZ, 19.5, X_E - X_W, 'x', 6, true, L1);
  flatRoad(b, VALLEY_VIEW_X, 210, 16.0, 840, 'z', 4, true, L1);
  flatRoad(b, (X_E + VALLEY_VIEW_X) / 2, 530, 8.5, VALLEY_VIEW_X - X_E, 'x', 2, true, L1); // W Reno Ave

  // ---- Warehouse grid (deterministic): blocks between the roads, skipping the Rio and Palms sites
  let seed = 4975;
  const R = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const walls = [mat(0xc8bca8, 0.9), mat(0xb4ab9c, 0.9), mat(0xd6cdbd, 0.9), mat(0x9e968a, 0.9)];
  const dock = mat(0x5a5650, 0.8);
  const roofEdge = mat(0x7a746a, 0.85);
  const yard = mat(0x8a8478, 0.97);
  const avoid: Array<[number, number, number, number]> = [
    [-352, -308, 24, 56], // Rio
    [-376, -344, -82, -38], // Palms
    [-345, -312, 360, 400], // Sinclair truck stop
    [-410, -364, 446, 476], // La Quinta
  ];
  const roadsZ = [I15.flamingoZ, I15.tropZ, 530];
  const packs: Array<[number, number]> = [];
  const clearOfRoads = (x0: number, x1: number, z0: number, z1: number) =>
    !roadsZ.some((rz) => z1 > rz - 12 && z0 < rz + 12) && !(x1 > VALLEY_VIEW_X - 10 && x0 < VALLEY_VIEW_X + 10);
  const clearOfSites = (x0: number, x1: number, z0: number, z1: number) => !avoid.some(([ax0, ax1, az0, az1]) => x1 > ax0 && x0 < ax1 && z1 > az0 && z0 < az1);
  for (let z = -190; z < 640; ) {
    const d = 12 + R() * 14;
    for (let x = X_E - 4; x > X_W + 10; ) {
      const w = 14 + R() * 22;
      const x1 = x;
      const x0 = x - w;
      const z0 = z;
      const z1 = z + d;
      if (clearOfRoads(x0, x1, z0, z1) && clearOfSites(x0, x1, z0, z1) && R() > 0.12) {
        const h = 5 + R() * 4.5;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        mg.box(walls[Math.floor(R() * walls.length)], cx, h / 2, cz, w - 2, h, d - 2);
        mg.box(roofEdge, cx, h + 0.2, cz, w - 1.8, 0.4, d - 1.8);
        // Roll-up dock doors on the street (east) face
        const doors = Math.max(1, Math.floor((d - 4) / 4.5));
        for (let i = 0; i < doors; i++) mg.box(dock, x1 - 0.95, 1.9, z0 + 2.5 + i * 4.5 + 1.6, 0.1, 3.4, 3.0);
        if (R() > 0.45) packs.push([x1 - 0.9, cz]);
      } else if (clearOfRoads(x0, x1, z0, z1) && clearOfSites(x0, x1, z0, z1)) {
        mg.box(yard, (x0 + x1) / 2, L1 - 0.02, (z0 + z1) / 2, w - 2, 0.04, d - 2); // a gravel yard
      }
      x -= w + 4 + R() * 6;
    }
    z += d + 6 + R() * 6;
  }

  // ---- Sinclair truck stop + CAT Scale, north side of W Tropicana west of Polaris (OSM)
  const canopyWhite = mat(0xf2f2ee, 0.5);
  const sinclairGreen = mat(0x0b7a3c, 0.55);
  const canopyLight = basic(0xfff4dc);
  mg.box(canopyWhite, -330, 6.2, 388, 24, 0.9, 13);
  mg.box(sinclairGreen, -330, 6.85, 381.4, 24.2, 0.5, 0.3);
  mg.box(sinclairGreen, -330, 6.85, 394.6, 24.2, 0.5, 0.3);
  mg.box(canopyLight, -330, 5.72, 388, 22, 0.05, 11);
  for (const px of [-339, -333, -327, -321]) for (const pz of [384.5, 391.5]) mg.box(mat(0xd8d8d0, 0.5), px, 2.6, pz, 0.6, 5.2, 0.6);
  addBuilding(b, mg, { x: -330, z: 370, w: 18, d: 9, h: 5.4, wall: 0xe6e0d2, trim: 0x0b7a3c, roof: 0x5a5650, label: 'Sinclair truck stop', collider: false });
  mg.box(mat(0x6a6a66, 0.9), -342.5, 0.15, 410, 6, 0.3, 26); // CAT Scale platform
  mg.beam(mat(0x3a3c40, 0.5, 0.6), v3(-316.5, 0, 398), v3(-316.5, 12, 398), 0.28, 8);
  signBoard(b, 'SINCLAIR', '#0b7a3c', '#ffffff', 5.2, 2.0, -316.5, 13.4, 398, Math.PI / 2, 'DIESEL • CAT SCALE');

  // ---- La Quinta Inn & Suites LV Tropicana Stadium, 4975 S Valley View Blvd (4-story stucco, south of Tropicana)
  const lqSpec: FacadeSpec = { wall: '#e2cfae', mullion: '#c8a878', glass: '#3a4a58', lit: '#ffe2b0', cols: 9, rows: 4, style: 0, seed: 4975 };
  addBuilding(b, mg, { x: -387, z: 463, w: 30, d: 11, h: 13.5, wall: lqSpec, trim: 0x2c6e5a, roof: 0x6a5e50, label: 'La Quinta Inn & Suites', collider: false });
  signBoard(b, 'LA QUINTA', '#ffffff', '#1f6a52', 8.5, 1.6, -371.8, 11.6, 463, Math.PI / 2, 'INN & SUITES', 0.2);

  // ---- Night: a lit wall-pack over every few dock doors (one merged glow mesh), so the grid isn't a black hole
  const wallPack = basic(0xffd8a0);
  for (const [x, z] of packs) mg.box(wallPack, x, 4.6, z, 0.12, 0.3, 0.6);
  mg.flush(b);
}
