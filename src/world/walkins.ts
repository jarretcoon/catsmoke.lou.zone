import type { WorldBuilder } from './builder';
import { buildEncoreWalkIn } from './encoreInterior';
import { buildHarrahsWalkIn } from './harrahsInterior';
import { buildPalazzoWalkIn } from './palazzoInterior';
import { buildWynnWalkIn } from './wynnInterior';

/** Build 5 walk-in casinos, batch 1 (each in its own module; dressing is built lazily near Lou). */
export function buildWalkIns(b: WorldBuilder): void {
  buildWynnWalkIn(b);
  buildEncoreWalkIn(b);
  buildHarrahsWalkIn(b);
  buildPalazzoWalkIn(b);
}
