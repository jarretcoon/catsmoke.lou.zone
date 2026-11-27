/**
 * Graphics quality: Auto (the default) picks Ultra / High / Medium / Low from the game's own frame times, and the
 * player can pin a level in the menu instead (that choice always wins and is remembered).
 *
 * Auto, step by step:
 * - Starts at High on a desktop, Medium on a touch device (or at the level Auto settled on last time, for a week).
 * - Once the game is running (not on the title screen, not in the menu, tab visible), it skips a couple of seconds
 *   (shaders compile, the area streams in), then times real frames for a few seconds: the requestAnimationFrame
 *   timestamps of the actual render loop, so it measures exactly what the player gets.
 * - Median frame 25 ms or better (40+ fps): keep. Slower: one level down, measure again, and so on.
 *   If even Low sits at a dead-steady 30 fps (a browser's battery saver caps it there), it goes back to where it
 *   started and stops testing, so it never flickers between levels.
 * - On a desktop that holds ~60 fps at High, it then TRIES Ultra: kept only if Ultra still holds ~55 fps or better,
 *   otherwise straight back to High (and it remembers that for a week, so it doesn't try again every visit).
 *   Phones never go above where they started.
 * - A switch builds the new level's shaders in the background first (main.ts prewarmQuality), so it doesn't freeze.
 * - After that it keeps watching, both ways, slowly and never within a minute of the last change:
 *   - DOWN after a sustained slump: under ~33 fps for 20 seconds straight (Ultra: under ~45 fps);
 *   - UP again once the frame rate has recovered: ~60 fps for 40 seconds straight, below the level it started at
 *     (or Ultra, if Ultra passed). The step up is a trial: if the level above is too slow it goes straight back,
 *     and waits longer before the next try there (2, 4, 8 … up to 30 minutes of play), so it never flickers.
 *     Leaving a level for a slump counts the same way.
 *
 * Under automation (Playwright: the PR check, screenshots) Auto stays at its starting level so the postcards are
 * comparable run to run; add `?autoq` to the URL to test the real behaviour. `?quality=ultra` (or low / medium /
 * high / auto) picks a level for that page load only, without saving it: for screenshots and testing.
 */
export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type QualityChoice = Quality | 'auto';

const KEY = 'smoking-cat-sim.quality';
const AUTO_KEY = 'smoking-cat-sim.quality-auto';
const AUTO_MEMORY_MS = 7 * 24 * 3600 * 1000;
const ORDER: Quality[] = ['low', 'medium', 'high', 'ultra'];
export const QUALITY_NAMES: Record<Quality, string> = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };
const isQuality = (s: string | null | undefined): s is Quality => s === 'low' || s === 'medium' || s === 'high' || s === 'ultra';

const WARMUP_S = 2.5;
const SAMPLE_S = 4;
/** A level is fine at this median frame time or better (40 fps)... */
const OK_MS = 25;
/** ...except Ultra, which is only worth it while it holds ~55 fps. */
const ULTRA_OK_MS = 18.5;
/** Ultra is tried only when High holds ~58 fps or better. */
const ULTRA_TRY_MS = 17.5;
const WATCH_WINDOW_S = 5;
const WATCH_SLOW_MS = 30;
const ULTRA_SLOW_MS = 22;
const WATCH_SLOW_WINDOWS = 4;
const WATCH_COOLDOWN_S = 60;
/** Recovered: windows at ~60 fps (or better) in a row before a step up is tried. */
const UP_MS = 17.5;
const UP_WINDOWS = 8;
const RETRY_FIRST_S = 120;
const RETRY_MAX_S = 1800;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage: just don't remember */
  }
}
function stats(a: number[]): { median: number; spread: number } {
  const s = [...a].sort((x, y) => x - y);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
  return { median: at(0.5), spread: at(0.9) - at(0.1) };
}
const okMs = (q: Quality) => (q === 'ultra' ? ULTRA_OK_MS : OK_MS);
const slowMs = (q: Quality) => (q === 'ultra' ? ULTRA_SLOW_MS : WATCH_SLOW_MS);

interface AutoMemory {
  level: Quality;
  capped: boolean;
  /** Ultra was tried on this machine and couldn't hold its frame rate. */
  noUltra: boolean;
}
function rememberedAuto(): AutoMemory | null {
  try {
    const r = JSON.parse(read(AUTO_KEY) ?? 'null') as { level?: string; at?: number; capped?: boolean; noUltra?: boolean } | null;
    if (r && isQuality(r.level) && typeof r.at === 'number' && Date.now() - r.at < AUTO_MEMORY_MS) {
      return { level: r.level, capped: r.capped === true, noUltra: r.noUltra === true };
    }
  } catch {
    /* ignore */
  }
  return null;
}
const coarsePointer = () => window.matchMedia('(pointer: coarse)').matches;
const urlChoice = (): QualityChoice | null => {
  const q = new URLSearchParams(location.search).get('quality');
  return q === 'auto' || isQuality(q) ? q : null;
};

/**
 * The level the game will start drawing at, worked out the same way GraphicsQuality does, for things that are
 * decided once at load (the resolution of the generated textures).
 */
export function startingQuality(): Quality {
  const url = urlChoice();
  if (url && url !== 'auto') return url;
  const saved = read(KEY);
  if (!url && isQuality(saved)) return saved;
  const start: Quality = coarsePointer() ? 'medium' : 'high';
  if (navigator.webdriver === true && !new URLSearchParams(location.search).has('autoq')) return start;
  return rememberedAuto()?.level ?? start;
}

type Phase = 'test' | 'trial' | 'watch' | 'off';

export class GraphicsQuality {
  choice: QualityChoice;
  level: Quality;
  private phase: Phase = 'off';
  private readonly start: Quality;
  /** The highest level Auto may step up to: Ultra on a desktop (until Ultra fails here), else where it started. */
  private ceiling: Quality;
  private readonly automated: boolean;
  /** A `?quality=` pick for this page load: not saved, and the menu still works as usual. */
  private readonly urlPinned: boolean;
  private lastNow = -1;
  private activeTime = 0;
  /** Seconds of measured play since this object was made (pauses and the title screen don't count). */
  private clock = 0;
  private samples: number[] = [];
  /** The first level this test found too slow, and its median: where to go back to if a cap is to blame. */
  private firstSlow: { level: Quality; ms: number } | null = null;
  private slowWindows = 0;
  private goodWindows = 0;
  private sinceChange = 0;
  /** A step up being tried: the level it came from (to go back to if the new one is too slow). */
  private trialFrom: Quality | null = null;
  /** Per level: not before this clock time may Auto step up to it again, and how long the next wait is. */
  private readonly retryAt: Partial<Record<Quality, number>> = {};
  private readonly retryWait: Partial<Record<Quality, number>> = {};
  /** Bumped on every requested change; a change still preparing when a newer one arrives is dropped. */
  private token = 0;
  private preparing = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly apply: (q: Quality) => void,
    private readonly active: () => boolean,
    /** Get a level ready without stalling (build its shaders in the background); resolves when it can switch. */
    private readonly prepare: (q: Quality) => Promise<void> = () => Promise.resolve()
  ) {
    const coarse = coarsePointer();
    this.start = coarse ? 'medium' : 'high';
    this.automated = navigator.webdriver === true && !new URLSearchParams(location.search).has('autoq');
    const mem = this.remembered();
    this.ceiling = coarse ? this.start : mem?.noUltra ? 'high' : 'ultra';
    const url = urlChoice();
    this.urlPinned = url !== null;
    const saved = url ?? read(KEY);
    if (isQuality(saved)) {
      this.choice = saved;
      this.level = saved;
    } else {
      this.choice = 'auto';
      this.level = (!this.automated && mem?.level) || this.start;
      this.phase = this.automated || mem?.capped ? 'off' : 'test';
    }
    this.apply(this.level);
    // Moving the window to a screen with another pixel density changes how much the GPU draws: re-apply.
    const watchDpr = () => {
      window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
        'change',
        () => {
          this.apply(this.level);
          watchDpr();
        },
        { once: true }
      );
    };
    watchDpr();
    // Its own rAF callback runs in the same frames as the game's, so the timestamps are the game's frame times.
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      this.frame(now);
    };
    requestAnimationFrame(loop);
    if (import.meta.env.DEV || import.meta.env.MODE === 'check') (window as unknown as { __quality: GraphicsQuality }).__quality = this;
  }

  /** "Auto (High)", "Medium" … */
  get label(): string {
    return this.choice === 'auto' ? `Auto (${QUALITY_NAMES[this.level]})` : QUALITY_NAMES[this.level];
  }

  /** Dev/test: what Auto is doing right now. */
  get state(): { choice: QualityChoice; level: Quality; phase: Phase; ceiling: Quality; goodWindows: number; slowWindows: number; sinceChange: number } {
    return { choice: this.choice, level: this.level, phase: this.phase, ceiling: this.ceiling, goodWindows: this.goodWindows, slowWindows: this.slowWindows, sinceChange: this.sinceChange };
  }

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  /** The player picked a level (or Auto) in the menu. */
  choose(choice: QualityChoice): void {
    this.choice = choice;
    write(KEY, choice === 'auto' ? null : choice);
    this.firstSlow = null;
    this.trialFrom = null;
    if (choice === 'auto') {
      write(AUTO_KEY, null);
      this.ceiling = coarsePointer() ? this.start : 'ultra';
      this.phase = this.automated ? 'off' : 'test';
      this.change(this.start);
    } else {
      this.phase = 'off';
      this.change(choice);
    }
    for (const fn of this.listeners) fn();
  }

  /** Prepare the level (shaders build in the background, the current level keeps drawing), then switch. */
  private change(q: Quality, then?: () => void): void {
    const token = ++this.token;
    this.preparing = true;
    const ready = Promise.race([this.prepare(q).catch(() => undefined), new Promise((r) => window.setTimeout(r, 60000))]);
    void ready.then(() => {
      if (token !== this.token) return;
      this.preparing = false;
      this.set(q);
      then?.();
    });
  }

  private remembered(): AutoMemory | null {
    // A `?quality=` page load starts fresh too, so a test link always shows the same thing.
    return this.urlPinned ? null : rememberedAuto();
  }

  private set(q: Quality): void {
    const changed = q !== this.level;
    this.level = q;
    this.activeTime = 0;
    this.samples = [];
    this.slowWindows = 0;
    this.goodWindows = 0;
    this.sinceChange = 0;
    if (changed) this.apply(q);
    for (const fn of this.listeners) fn();
  }

  /** Done testing: keep this level, remember it, and from now on watch for a sustained slump or a recovery. */
  private settle(capped = false): void {
    this.phase = capped ? 'off' : 'watch';
    this.firstSlow = null;
    this.trialFrom = null;
    this.activeTime = 0;
    this.samples = [];
    this.slowWindows = 0;
    this.goodWindows = 0;
    if (this.urlPinned) return;
    write(AUTO_KEY, JSON.stringify({ level: this.level, at: Date.now(), capped, noUltra: this.ceiling !== 'ultra' && !coarsePointer() }));
  }

  /** Not up to `q` again for a while; each time it has to come back down from `q`, the wait doubles. */
  private backOff(q: Quality): void {
    const wait = this.retryWait[q] ?? RETRY_FIRST_S;
    this.retryAt[q] = this.clock + wait;
    this.retryWait[q] = Math.min(RETRY_MAX_S, wait * 2);
  }

  private stepDown(): void {
    const i = ORDER.indexOf(this.level);
    if (i <= 0) return this.settle();
    this.backOff(this.level);
    this.phase = 'test';
    this.change(ORDER[i - 1]);
  }

  /** Try the level above; the trial window decides whether it stays. */
  private stepUp(): void {
    const next = ORDER[ORDER.indexOf(this.level) + 1];
    if (!next) return;
    this.trialFrom = this.level;
    this.phase = 'trial';
    this.change(next);
  }

  private canStepUp(): boolean {
    const next = ORDER[ORDER.indexOf(this.level) + 1];
    if (!next || ORDER.indexOf(next) > ORDER.indexOf(this.ceiling)) return false;
    return this.clock >= (this.retryAt[next] ?? 0);
  }

  private frame(now: number): void {
    if (this.phase === 'off' || this.preparing || document.hidden || !this.active()) {
      this.lastNow = -1;
      return;
    }
    const dt = this.lastNow < 0 ? 0 : now - this.lastNow;
    this.lastNow = now;
    // A pause, a shader compile after a teleport, the dev hooks' bench: not the steady frame rate.
    if (dt <= 0 || dt > 250) return;
    this.activeTime += dt / 1000;
    this.sinceChange += dt / 1000;
    this.clock += dt / 1000;
    if (this.activeTime < WARMUP_S) return;
    this.samples.push(dt);
    const span = this.phase === 'watch' ? WATCH_WINDOW_S : SAMPLE_S;
    if (this.activeTime < WARMUP_S + span) return;
    const { median: ms, spread } = stats(this.samples);
    this.samples = [];
    this.activeTime = WARMUP_S;

    if (this.phase === 'trial') {
      // A step up: keep it if the new level holds up, else straight back to where it came from.
      const from = this.trialFrom ?? ORDER[Math.max(0, ORDER.indexOf(this.level) - 1)];
      if (ms <= okMs(this.level)) return this.settle();
      this.backOff(this.level);
      // The first try of Ultra on this machine failed: remember (settle() writes it) and don't try again.
      if (this.level === 'ultra' && this.retryWait.ultra === RETRY_FIRST_S * 2) this.ceiling = 'high';
      this.phase = 'test';
      this.trialFrom = null;
      return this.change(from, () => this.settle());
    }

    if (this.phase === 'test') {
      if (ms <= okMs(this.level)) {
        // A desktop that holds ~60 fps at High tries Ultra straight away (once per week, see settle()).
        if (this.level === 'high' && ms <= ULTRA_TRY_MS && this.canStepUp()) {
          this.firstSlow = null;
          return this.stepUp();
        }
        return this.settle();
      }
      this.firstSlow ??= { level: this.level, ms };
      if (this.level !== 'low') return this.stepDown();
      // Low and still slow. If it sits at a dead-steady 30 fps all the way down, a frame-rate cap is in charge
      // (a battery saver), not the GPU: go back to where it started and stop testing. (One level down showing no
      // gain proves nothing: on a 60 Hz screen a GPU-bound game snaps to 30 fps until it's fast enough for 60.)
      const first = this.firstSlow;
      const capped = spread < 4 && Math.abs(ms - 33.3) < 2.5 && ms > first.ms * 0.95 && first.level !== 'low';
      this.firstSlow = null;
      if (!capped) return this.settle();
      this.phase = 'off';
      return this.change(first.level, () => this.settle(true));
    }
    // watch: down after a sustained slump, up after a sustained recovery; never soon after a change
    this.slowWindows = ms > slowMs(this.level) ? this.slowWindows + 1 : 0;
    this.goodWindows = ms <= UP_MS ? this.goodWindows + 1 : 0;
    if (this.sinceChange <= WATCH_COOLDOWN_S) return;
    if (this.slowWindows >= WATCH_SLOW_WINDOWS && this.level !== 'low') {
      this.firstSlow = { level: this.level, ms };
      return this.stepDown();
    }
    if (this.goodWindows >= UP_WINDOWS && this.canStepUp()) this.stepUp();
  }
}
