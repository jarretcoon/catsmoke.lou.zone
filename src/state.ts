import type { VapeFlavor } from './smoke';
import type { TimePreset } from './vegasWorld';

export type CosmeticId = 'aviators' | 'fedora' | 'gold-chain' | 'bowtie' | 'top-hat' | 'diamond-collar';

export interface GameStats {
  cigsSmoked: number;
  vapeRips: number;
  tipsEarned: number;
  begs: number;
  steals: number;
  casinoSteals: number;
  busted: number;
  escapes: number;
  deuceRides: number;
  highRollerRides: number;
  gondolaRides: number;
  casinoWon: number;
  casinoLost: number;
  biggestWin: number;
  blackjackWins: number;
  crapsWins: number;
  cloudsCheered: number;
  cartonsBought: number;
  photoOps: number;
  zonesVisited: string[];
  degenPoints: number;
  knockdowns: number;
  propsSmashed: number;
  wantedEscapes: number;
  maxStars: number;
  carsStolen: number;
  burgersEaten: number;
  tablesLost: number;
  vapeTricks: number;
  bigClouds: number;
  missionsDone: string[];
}

/**
 * Everything that persists between sessions. Plain JSON on purpose: the same object can be
 * POSTed to a Cloudflare Worker (KV / D1 / Durable Object) later without a schema change.
 */
export interface GameState {
  version: 1;
  cash: number;
  cigStash: number;
  cigBurn: number;
  isLit: boolean;
  deviceMode: 'cig' | 'vape';
  hasVapeMod: boolean;
  vapeJuice: number;
  vapeFlavor: VapeFlavor;
  vip: boolean;
  cosmetics: { owned: CosmeticId[]; equipped: CosmeticId[] };
  goalsDone: string[];
  timePreset: TimePreset;
  position: [number, number, number];
  yaw: number;
  stats: GameStats;
  savedAt: number;
}

export function defaultState(): GameState {
  return {
    version: 1,
    cash: 0,
    cigStash: 2,
    cigBurn: 100,
    isLit: true,
    deviceMode: 'cig',
    hasVapeMod: true,
    vapeJuice: 60,
    vapeFlavor: 'Blue Razz',
    vip: false,
    cosmetics: { owned: [], equipped: [] },
    goalsDone: [],
    timePreset: 'day',
    // Strip sidewalk in front of the Bellagio fountains, looking south toward Paris
    position: [-15, 0.2, 40],
    yaw: 0,
    stats: {
      cigsSmoked: 0,
      vapeRips: 0,
      tipsEarned: 0,
      begs: 0,
      steals: 0,
      casinoSteals: 0,
      busted: 0,
      escapes: 0,
      deuceRides: 0,
      highRollerRides: 0,
      gondolaRides: 0,
      casinoWon: 0,
      casinoLost: 0,
      biggestWin: 0,
      blackjackWins: 0,
      crapsWins: 0,
      cloudsCheered: 0,
      cartonsBought: 0,
      photoOps: 0,
      zonesVisited: [],
      degenPoints: 0,
      knockdowns: 0,
      propsSmashed: 0,
      wantedEscapes: 0,
      maxStars: 0,
      carsStolen: 0,
      burgersEaten: 0,
      tablesLost: 0,
      vapeTricks: 0,
      bigClouds: 0,
      missionsDone: [],
    },
    savedAt: 0,
  };
}

/** Pluggable persistence so a remote (Worker / game server) backend can slot in later. */
export interface SaveBackend {
  load(): GameState | null;
  save(state: GameState): void;
  clear(): void;
}

const SAVE_KEY = 'smoking-cat-sim.save.v1';

export const localSaveBackend: SaveBackend = {
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return migrate(JSON.parse(raw));
    } catch {
      return null;
    }
  },
  save(state) {
    try {
      state.savedAt = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      // Private mode / quota: the game keeps running without persistence.
    }
  },
  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** Fill in fields added after a save was written so old saves never crash the game. */
function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const base = defaultState();
  const r = raw as Partial<GameState>;
  if (r.version !== 1) return null;
  const merged: GameState = {
    ...base,
    ...r,
    cosmetics: {
      owned: Array.isArray(r.cosmetics?.owned) ? r.cosmetics!.owned : [],
      equipped: Array.isArray(r.cosmetics?.equipped) ? r.cosmetics!.equipped : [],
    },
    stats: { ...base.stats, ...(r.stats ?? {}) },
    goalsDone: Array.isArray(r.goalsDone) ? r.goalsDone : [],
  };
  if (!Array.isArray(merged.stats.zonesVisited)) merged.stats.zonesVisited = [];
  if (!Array.isArray(merged.stats.missionsDone)) merged.stats.missionsDone = [];
  if (!Number.isFinite(merged.cash)) merged.cash = 0;
  return merged;
}
