import type { WorldBuilder } from './builder';
import { buildFrontageFlamingoSpring } from './frontageFlamingoSpring';
import { buildFrontageHarmonFlamingo } from './frontageHarmonFlamingo';
import { buildFrontageTropHarmon } from './frontageTropHarmon';

/*
 * The real shops and restaurants on the Strip sidewalk (build 5, map-audit section 3), area by area:
 *  1. Tropicana Ave → Harmon Ave (frontageTropHarmon.ts)
 *  2. Harmon Ave → Flamingo Rd (frontageHarmonFlamingo.ts)
 *  3. Flamingo Rd → Spring Mountain Rd (frontageFlamingoSpring.ts)
 * Each area has its own sign/window atlas (frontAtlas.ts) and builds its storefronts with the shared
 * frontage kit (frontKit.ts); the working ones open their menus from frontageCatalogs.ts.
 */
export function buildFrontageShops(b: WorldBuilder): void {
  buildFrontageTropHarmon(b);
  buildFrontageHarmonFlamingo(b);
  buildFrontageFlamingoSpring(b);
}
