import { deviceClass, loadSeconds } from './loading';

// Anonymous game stats (README "Stats"). A report is a handful of coarse fields, sent with sendBeacon to
// /api/stats (worker/index.ts writes it to Cloudflare Analytics Engine) when the tab is hidden or closed, and
// at most every 5 minutes while playing. No IDs, cookies, storage, user agents or fingerprints: nothing here
// can tie two reports to the same person. Do Not Track / Global Privacy Control = nothing is sent. Never
// throws and never logs: if /api/stats isn't there (vite dev, the PR check), the reports just go nowhere.

/** Set by vite.config.ts: the commit the build came from (short sha), else the build time. */
declare const __GAME_VERSION__: string;

export interface StatsSource {
  started: () => boolean;
  quality: () => string;
  zone: () => string;
  goalsDone: () => readonly string[];
  missionsDone: () => readonly string[];
}

const ENDPOINT = `${import.meta.env.BASE_URL}api/stats`;
const TIMED_REPORT_MS = 5 * 60 * 1000;

function optedOut(): boolean {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const w = window as Window & { doNotTrack?: string };
  return n.doNotTrack === '1' || w.doNotTrack === '1' || n.msDoNotTrack === '1' || n.globalPrivacyControl === true;
}

function enabled(): boolean {
  if (optedOut() || typeof navigator.sendBeacon !== 'function') return false;
  const force = new URLSearchParams(location.search).get('stats');
  if (force === '0') return false;
  // Dev servers and the PR-check build stay quiet unless asked (?stats=1) so they never pollute the numbers.
  if (import.meta.env.DEV || import.meta.env.MODE === 'check') return force === '1';
  return true;
}

/** labels[i] for the first edge above v (labels has one more entry than edges: the last is "above them all"). */
function bucket(v: number, edges: number[], labels: string[]): string {
  const i = edges.findIndex((e) => v < e);
  return labels[i < 0 ? labels.length - 1 : i];
}

function loadBucket(): string {
  const s = loadSeconds();
  if (s === null) return 'loading';
  return bucket(s, [3, 6, 10, 20, 40], ['0-3s', '3-6s', '6-10s', '10-20s', '20-40s', '40s+']);
}

function fpsBucket(samples: number[]): string {
  if (!samples.length) return 'none';
  const sorted = [...samples].sort((a, b) => a - b);
  return bucket(sorted[sorted.length >> 1], [20, 30, 45, 58, 90], ['<20', '20-30', '30-45', '45-58', '58-90', '90+']);
}

function lengthBucket(playSeconds: number, started: boolean): string {
  if (!started && playSeconds === 0) return 'title';
  return bucket(playSeconds / 60, [1, 5, 15, 30, 60], ['0-1m', '1-5m', '5-15m', '15-30m', '30-60m', '60m+']);
}

export function startStats(src: StatsSource): void {
  try {
    if (!enabled()) return;
  } catch {
    return;
  }
  const device = deviceClass();
  let seq = 0;
  let sentAt = performance.now();
  let everSent = false;
  let playTotal = 0; // seconds played (game started, tab visible) this page visit
  let playSince = 0; // ... since the last report
  let zoneTime = new Map<string, number>();
  let fps: number[] = [];
  let goalsSeen = new Set(src.goalsDone());
  let missionsSeen = new Set(src.missionsDone());

  const fresh = (list: readonly string[], seen: Set<string>): { ids: string[]; seen: Set<string> } => {
    if (list.length < seen.size) seen = new Set(); // a new game started: count its completions afresh
    const ids = list.filter((id) => !seen.has(id));
    for (const id of ids) seen.add(id);
    return { ids, seen };
  };

  const send = (why: 'hide' | 'exit' | 'timer') => {
    try {
      const goals = fresh(src.goalsDone(), goalsSeen);
      const missions = fresh(src.missionsDone(), missionsSeen);
      goalsSeen = goals.seen;
      missionsSeen = missions.seen;
      // After the first report, only send when something happened since the last one.
      if (everSent && playSince < 1 && !goals.ids.length && !missions.ids.length) return;
      const zones = [...zoneTime].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([z]) => z.slice(0, 48));
      const report = {
        s: 1,
        ver: __GAME_VERSION__,
        dev: device,
        q: src.quality(),
        load: loadBucket(),
        fps: fpsBucket(fps),
        len: lengthBucket(playTotal, src.started()),
        zones,
        missions: missions.ids.slice(0, 12),
        goals: goals.ids.slice(0, 12),
        seq: Math.min(999, ++seq),
        why,
        play: Math.round(playSince / 6) / 10,
        started: src.started(),
      };
      everSent = true;
      sentAt = performance.now();
      playSince = 0;
      zoneTime = new Map();
      fps = [];
      navigator.sendBeacon(ENDPOINT, JSON.stringify(report));
    } catch {
      /* stats must never break the game */
    }
  };

  // Frame rate: one sample per second of play (an extra rAF callback costs nothing measurable).
  let frames = 0;
  let frameStart = performance.now();
  const countFrame = (now: number) => {
    frames++;
    if (now - frameStart >= 1000) {
      if (src.started() && !document.hidden && fps.length < 600) fps.push((frames * 1000) / (now - frameStart));
      frames = 0;
      frameStart = now;
    }
    requestAnimationFrame(countFrame);
  };
  requestAnimationFrame(countFrame);

  // Where Lou spends his time, and how long the game is played: sampled every 2 s while visible.
  window.setInterval(() => {
    try {
      if (document.hidden || !src.started()) return;
      playTotal += 2;
      playSince += 2;
      const z = src.zone();
      if (z) zoneTime.set(z, (zoneTime.get(z) ?? 0) + 2);
      if (performance.now() - sentAt >= TIMED_REPORT_MS) send('timer');
    } catch {
      /* ignore */
    }
  }, 2000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') send('hide');
  });
  window.addEventListener('pagehide', () => send('exit'));
}
