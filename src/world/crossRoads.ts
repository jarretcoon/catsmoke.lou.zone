import type { WorldBuilder } from './builder';
import { buildHarmonAve } from './harmonAve';
import { buildNorthCrossRoads } from './northCrossRoads';
import { buildSouthCrossRoads } from './southCrossRoads';

/**
 * The real cross streets off Las Vegas Blvd that the map didn't have yet, each with its lanes, medians,
 * signals, crosswalks, sidewalks, street lights, culled traffic and its real frontage (OSM-placed):
 * Harmon Ave (harmonAve.ts); Reno Ave and Mandalay Bay Rd / Hacienda Ave (southCrossRoads.ts); Fashion Show Dr and
 * Resorts World Ave (northCrossRoads.ts).
 */
export function buildCrossRoads(b: WorldBuilder): void {
  buildHarmonAve(b);
  buildSouthCrossRoads(b);
  buildNorthCrossRoads(b);
}
