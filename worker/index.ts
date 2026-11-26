// catsmoke.lou.zone Worker. The game itself is static assets, served by Workers Static Assets without running
// this code: only /api/* reaches it (wrangler.jsonc, assets.run_worker_first).
//
// POST /api/stats takes one anonymous report from src/stats.ts and writes it to the Analytics Engine dataset
// "catsmoke_stats" (created on the first write; PR previews use "catsmoke_stats_preview"). Without the STATS
// binding (Analytics Engine not switched on yet, see wrangler.jsonc) reports are accepted and dropped.
// Every field is checked against what the game sends and clamped; anything unexpected is dropped. Nothing
// about the visitor is stored: no IP, no user agent, no IDs or cookies. Cloudflare's country code is the only
// thing added here.
//
// Data point layout (keep in step with src/stats.ts and the README's "Stats" section):
//   index1   device class: desktop | phone | tablet
//   blob1    report schema: "s1"
//   blob2    game version (short commit sha, or the build time)
//   blob3    device class (same as index1, handy in GROUP BY)
//   blob4    graphics quality: low | medium | high
//   blob5    time to "Ready": 0-3s | 3-6s | 6-10s | 10-20s | 20-40s | 40s+ | loading (left before Ready)
//   blob6    typical frame rate while playing: <20 | 20-30 | 30-45 | 45-58 | 58-90 | 90+ | none
//   blob7    play time so far this visit: title (never started) | 0-1m | 1-5m | 5-15m | 15-30m | 30-60m | 60m+
//   blob8-10 the three zones Lou spent the most time in since the last report (or "")
//   blob11   missions finished since the last report (comma list of mission ids)
//   blob12   goals finished since the last report (comma list of goal ids)
//   blob13   country (ISO code from Cloudflare, "XX" if unknown)
//   blob14   site: live (catsmoke.lou.zone) | preview
//   blob15   why it was sent: hide (tab hidden) | exit (page closed) | timer (every 5 min of play)
//   blob16   got past the title screen: yes | no
//   double1  1 (one report: count reports with SUM(_sample_interval * double1))
//   double2  minutes played since the last report (0-30, tenths)
//   double3  report number within the visit (1 = the visit's first report: counts visits)

interface AnalyticsEngineDataset {
  writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}
interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
interface Env {
  STATS?: AnalyticsEngineDataset;
  ASSETS: Fetcher;
}

const MAX_BODY = 2048;
const LIVE_HOST = 'catsmoke.lou.zone';

const ENUMS = {
  dev: ['desktop', 'phone', 'tablet'],
  q: ['low', 'medium', 'high'],
  load: ['0-3s', '3-6s', '6-10s', '10-20s', '20-40s', '40s+', 'loading'],
  fps: ['<20', '20-30', '30-45', '45-58', '58-90', '90+', 'none'],
  len: ['title', '0-1m', '1-5m', '5-15m', '15-30m', '30-60m', '60m+'],
  why: ['hide', 'exit', 'timer'],
} as const;

const pick = (v: unknown, allowed: readonly string[]): string => (typeof v === 'string' && allowed.includes(v) ? v : '');

/** Zone names are the game's own place names: letters, digits, spaces and a little punctuation, 48 chars at most. */
function zoneName(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.replace(/[^\p{L}\p{N} .,'’&()•:/+-]/gu, '').replace(/\s+/g, ' ').trim();
  return s.slice(0, 48);
}

/** Mission and goal ids: lowercase-with-dashes, at most 12 of them. */
function idList(v: unknown): string {
  if (!Array.isArray(v)) return '';
  const ids = v.filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,32}$/.test(x));
  return [...new Set(ids)].slice(0, 12).join(',');
}

function num(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.min(max, Math.max(min, n));
}

async function readSmallBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY || !request.body) return declared > MAX_BODY ? null : '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

async function handleStats(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const text = await readSmallBody(request);
  if (text === null) return new Response(null, { status: 413 });
  let r: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    r = parsed as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (r.s !== 1) return new Response(null, { status: 400 });

  const dev = pick(r.dev, ENUMS.dev);
  const version = typeof r.ver === 'string' && /^[0-9a-z]{4,16}$/i.test(r.ver) ? r.ver.toLowerCase() : '';
  const zones = Array.isArray(r.zones) ? r.zones.slice(0, 3).map(zoneName) : [];
  while (zones.length < 3) zones.push('');
  const country = (request as Request & { cf?: { country?: unknown } }).cf?.country;
  const host = new URL(request.url).hostname;

  env.STATS?.writeDataPoint({
    indexes: [dev || 'unknown'],
    blobs: [
      's1',
      version,
      dev,
      pick(r.q, ENUMS.q),
      pick(r.load, ENUMS.load),
      pick(r.fps, ENUMS.fps),
      pick(r.len, ENUMS.len),
      ...zones,
      idList(r.missions),
      idList(r.goals),
      typeof country === 'string' && /^[A-Z0-9]{2}$/.test(country) ? country : 'XX',
      host === LIVE_HOST ? 'live' : 'preview',
      pick(r.why, ENUMS.why),
      r.started === true ? 'yes' : 'no',
    ],
    doubles: [1, Math.round(num(r.play, 0, 30) * 10) / 10, Math.round(num(r.seq, 1, 999))],
  });
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/stats') return handleStats(request, env);
    if (pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    // Only /api/* is routed here, but if anything else ever arrives, serve it exactly as the assets would.
    return env.ASSETS.fetch(request);
  },
};
