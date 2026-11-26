/**
 * Graphics quality: Auto (the default) picks High / Medium / Low from the game's own frame times, and the
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
 * - A switch builds the new level's shaders in the background first (main.ts prewarmQuality), so it doesn't freeze.
 * - After that it keeps watching and only ever steps DOWN: under ~33 fps for 20 seconds straight (and nothing
 *   changed in the last minute) = one level down. Never up on its own.
 *
 * Under automation (Playwright: the PR check, screenshots) Auto stays at its starting level so the postcards are
 * comparable run to run; add `?autoq` to the URL to test the real behaviour.
 */
export type Quality = 'low' | 'medium' | 'high';
export type QualityChoice = Quality | 'auto';

const KEY = 'smoking-cat-sim.quality';
const AUTO_KEY = 'smoking-cat-sim.quality-auto';
const AUTO_MEMORY_MS = 7 * 24 * 3600 * 1000;
const ORDER: Quality[] = ['low', 'medium', 'high'];
export const QUALITY_NAMES: Record<Quality, string> = { low: 'Low', medium: 'Medium', high: 'High' };

const WARMUP_S = 2.5;
const SAMPLE_S = 4;
const OK_MS = 25;
const WATCH_WINDOW_S = 5;
const WATCH_SLOW_MS = 30;
const WATCH_SLOW_WINDOWS = 4;
const WATCH_COOLDOWN_S = 60;

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

type Phase = 'test' | 'watch' | 'off';

export class GraphicsQuality {
  choice: QualityChoice;
  level: Quality;
  private phase: Phase = 'off';
  private readonly start: Quality;
  private readonly automated: boolean;
  private lastNow = -1;
  private activeTime = 0;
  private samples: number[] = [];
  /** The first level this test found too slow, and its median: where to go back to if a cap is to blame. */
  private firstSlow: { level: Quality; ms: number } | null = null;
  private slowWindows = 0;
  private sinceChange = 0;
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
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    this.start = coarse ? 'medium' : 'high';
    this.automated = navigator.webdriver === true && !new URLSearchParams(location.search).has('autoq');
    const saved = read(KEY);
    if (saved === 'low' || saved === 'medium' || saved === 'high') {
      this.choice = saved;
      this.level = saved;
    } else {
      this.choice = 'auto';
      const mem = this.remembered();
      this.level = mem?.level ?? this.start;
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

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  /** The player picked a level (or Auto) in the menu. */
  choose(choice: QualityChoice): void {
    this.choice = choice;
    write(KEY, choice === 'auto' ? null : choice);
    this.firstSlow = null;
    if (choice === 'auto') {
      write(AUTO_KEY, null);
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

  private remembered(): { level: Quality; capped: boolean } | null {
    try {
      const r = JSON.parse(read(AUTO_KEY) ?? 'null') as { level?: string; at?: number; capped?: boolean } | null;
      if (r && (r.level === 'low' || r.level === 'medium' || r.level === 'high') && typeof r.at === 'number' && Date.now() - r.at < AUTO_MEMORY_MS) {
        return { level: r.level, capped: r.capped === true };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private set(q: Quality): void {
    const changed = q !== this.level;
    this.level = q;
    this.activeTime = 0;
    this.samples = [];
    this.slowWindows = 0;
    this.sinceChange = 0;
    if (changed) this.apply(q);
    for (const fn of this.listeners) fn();
  }

  /** Done testing: keep this level, remember it, and from now on only watch for a sustained slump. */
  private settle(capped = false): void {
    this.phase = capped ? 'off' : 'watch';
    this.firstSlow = null;
    this.activeTime = 0;
    this.samples = [];
    this.slowWindows = 0;
    write(AUTO_KEY, JSON.stringify({ level: this.level, at: Date.now(), capped }));
  }

  private stepDown(): void {
    const i = ORDER.indexOf(this.level);
    if (i <= 0) return this.settle();
    this.phase = 'test';
    this.change(ORDER[i - 1]);
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
    if (this.activeTime < WARMUP_S) return;
    this.samples.push(dt);
    const span = this.phase === 'test' ? SAMPLE_S : WATCH_WINDOW_S;
    if (this.activeTime < WARMUP_S + span) return;
    const { median: ms, spread } = stats(this.samples);
    this.samples = [];
    this.activeTime = WARMUP_S;

    if (this.phase === 'test') {
      if (ms <= OK_MS) return this.settle();
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
    // watch: down only, after a sustained slump, never soon after a change
    this.slowWindows = ms > WATCH_SLOW_MS ? this.slowWindows + 1 : 0;
    if (this.slowWindows >= WATCH_SLOW_WINDOWS && this.sinceChange > WATCH_COOLDOWN_S && this.level !== 'low') {
      this.firstSlow = { level: this.level, ms };
      this.stepDown();
    }
  }
}
