import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { mat, mesh } from './props';
import { STRIP } from './strip';
import { bridgeFascia } from './stripSigns';

/**
 * Single-span pedestrian bridges over the Boulevard in the middle Strip (the four-corner rings at
 * Flamingo and Tropicana are built in strip.ts). Real ones, Clark County's:
 * - Harmon Ave (2012): The Cosmopolitan ↔ Planet Hollywood, just north of the Harmon crossing, which
 *   stays at grade on its south side;
 * - Spring Mountain Rd / Sands Ave: Treasure Island ↔ The Venetian/Palazzo (opened 2001) on the south
 *   side and Fashion Show ↔ Wynn on the north side; the Boulevard has no at-grade crossing there.
 * Each has a glass-sided deck under a steel canopy, the street name on lit fascias facing traffic both
 * ways, and at each end a landing with an escalator run (stairs here, so Lou can climb them) beside a
 * glass elevator that rises from the sidewalk to the deck.
 */
export interface SpanBridge {
  z: number;
  name: string;
  label: string;
  /** which way each end's escalator run descends along the sidewalk: −1 = north, +1 = south */
  runW: 1 | -1;
  runE: 1 | -1;
  /** |x| of the stair run's centre on each side */
  stairW: number;
  stairE: number;
  /** steps in each run (14–15; 0.47 m risers, 0.7 m treads) */
  steps: number;
}

export const SPAN_BRIDGES: SpanBridge[] = [
  { z: 196, name: 'HARMON AVE', label: 'THE COSMOPOLITAN  •  PLANET HOLLYWOOD', runW: -1, runE: -1, stairW: 19.3, stairE: 19.3, steps: 15 },
  { z: -397, name: 'SPRING MOUNTAIN RD', label: 'TREASURE ISLAND  •  THE VENETIAN', runW: 1, runE: 1, stairW: 18.4, stairE: 19.3, steps: 14 },
  { z: -417, name: 'SANDS AVE', label: 'FASHION SHOW  •  WYNN', runW: -1, runE: -1, stairW: 19.3, stairE: 19.3, steps: 15 },
];

/** Deck half-length: the landings sit over the back of the sidewalk. */
export const SPAN_X = 19.8;

export function buildSpanBridges(b: WorldBuilder): void {
  const y = STRIP.bridgeY;
  const deck = mat(0xb8b2a8, 0.7, 0.15);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.32, roughness: 0.08 });
  const steel = mat(0x5b6068, 0.35, 0.7);
  const escRail = mat(0x111114, 0.4, 0.2);
  const cab = b.nightGlow(new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.4, emissive: 0xffd9a0, emissiveIntensity: 0.35 }), 0.25, 0.6);
  const wDeck = 4;
  const X = SPAN_X;
  for (const br of SPAN_BRIDGES) {
    const z = br.z;
    // deck, glass sides, canopy
    b.box(0, y, z, X * 2 + wDeck, 0.4, wDeck, deck);
    for (const e of [-1, 1]) b.box(0, y + 0.4, z + e * (wDeck / 2 - 0.1), X * 2 - 1, 1.15, 0.12, glass, true, false);
    b.add(mesh(new THREE.BoxGeometry(X * 2 + wDeck, 0.2, wDeck + 0.6), steel, 0, y + 3.6, z));
    for (const f of [-1, 1]) b.add(bridgeFascia(b, br.name, br.label, '#ff8ad8', 10, 1.2), 0, y - 0.7, z + f * (wDeck / 2 + 0.08), f < 0 ? Math.PI : 0);
    for (const s of [-1, 1] as const) {
      const cx = s * X;
      // canopy columns at the landing
      for (const [px, pz] of [
        [-1.8, -1.8],
        [1.8, -1.8],
        [-1.8, 1.8],
        [1.8, 1.8],
      ]) {
        if (Math.abs(cx + px) > 21.4) continue; // the outer pair would stand in the building's wall
        b.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, y + 3.6, 8), steel, cx + px, (y + 3.6) / 2, z + pz, true));
        b.collider(cx + px - 0.18, cx + px + 0.18, z + pz - 0.18, z + pz + 0.18, 0, y, true);
      }
      // escalator run down to the sidewalk (stairs, so the cat can climb it), glass balustrades, black handrails
      const run = s < 0 ? br.runW : br.runE;
      const sxC = s * (s < 0 ? br.stairW : br.stairE);
      const rise = (y + 0.4) / br.steps;
      for (let i = 0; i < br.steps; i++) {
        const top = y + 0.4 - (i + 1) * rise;
        if (top <= 0.05) break;
        b.box(sxC, 0, z + run * (wDeck / 2 + 0.35 + i * 0.7), 2.6, top, 0.72, deck, false, false);
      }
      const runLen = br.steps * 0.7;
      const zMid = z + run * (wDeck / 2 + 0.35 + runLen / 2 - 0.35);
      const slope = Math.atan2(y + 0.4, runLen) * run;
      const L = Math.hypot(runLen, y + 0.4);
      for (const e of [-1, 1]) {
        const ex = sxC + e * 1.36;
        const gl = mesh(new THREE.BoxGeometry(0.06, 0.95, L), glass, ex, (y + 0.4) / 2 + 0.75, zMid);
        gl.rotation.x = slope;
        b.add(gl);
        const rail = mesh(new THREE.BoxGeometry(0.1, 0.08, L + 0.4), escRail, ex, (y + 0.4) / 2 + 1.25, zMid);
        rail.rotation.x = slope;
        b.add(rail);
        const skirt = mesh(new THREE.BoxGeometry(0.08, 0.7, L), steel, ex, (y + 0.4) / 2 - 0.1, zMid);
        skirt.rotation.x = slope;
        b.add(skirt);
      }
      // glass elevator rising from the sidewalk to the deck, on the street side of the landing
      const exX = s * 16.4;
      b.box(exX, 0, z, 2.2, y + 0.4, 2.2, glass, true, false);
      for (const [px, pz] of [
        [-1.05, -1.05],
        [1.05, -1.05],
        [-1.05, 1.05],
        [1.05, 1.05],
      ]) b.add(mesh(new THREE.BoxGeometry(0.12, y + 0.5, 0.12), steel, exX + px, (y + 0.5) / 2, z + pz));
      b.add(mesh(new THREE.BoxGeometry(1.6, 2.2, 1.6), cab, exX, (br.z * 7) % 2 > 1 ? 1.2 : y - 1.3, z));
    }
    b.zone(`${br.name === 'HARMON AVE' ? 'Harmon' : br.name === 'SANDS AVE' ? 'Fashion Show–Wynn' : 'Treasure Island–Venetian'} Skybridge`, -X - 2, X + 2, z - 2, z + 2);
    b.feature({ kind: 'plaza', x: 0, z, w: X * 2 + wDeck, d: wDeck, color: '#d8d0c0' });
  }
}

/** Sidewalk spots the walkers squeeze past (stair runs and elevator towers). */
export function bridgePinch(z: number): number {
  for (const br of SPAN_BRIDGES) {
    const dz = z - br.z;
    if (Math.abs(dz) < 1.6) return 15.0; // elevator tower
    if (dz * br.runE > 0 && Math.abs(dz) < br.steps * 0.7 + 2.5) return 17.4; // stair run
    if (dz * br.runW > 0 && Math.abs(dz) < br.steps * 0.7 + 2.5) return 17.4;
  }
  return 99;
}
