// Game check (runs on every pull request, and locally with `bun run check`).
//
// 1. Checks the live build in dist/: no file over Cloudflare's 25 MiB static-asset limit (sizes are only reported).
// 2. Serves the check build in dist-check/ (`bun run build:check`, the live build plus the dev hooks),
//    opens it in headless Chromium with software WebGL (GitHub's machines have no GPU), and checks it
//    reaches "Ready" with no console errors.
// 3. Starts a new game and takes the fixed postcard snapshots in checks/postcards.json. Each one is
//    measured: draw calls (the same on any machine, so it catches heavy changes), how much of the
//    picture is blown out to white, and whether it came out black.
//
// Writes check-out/metrics.json, check-out/summary.md and check-out/snaps/*.jpg. Exits 1 on a problem.
//
// Options: --gpu (use this machine's GPU instead of software WebGL; faster, numbers differ slightly)
//          --only=id1,id2 (just those views)
//          --shard=i/n (just every n-th view starting at the i-th, 1-based; CI runs n of these side by side and
//                       scripts/merge-check.mjs joins them. The size and first-load parts run in shard 1 only.)
//          --out=dir (write there instead of check-out/)
//          --list (print the views this run would take, and stop)

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseShard, shardViews, summaryLines } from './check-report.mjs';

const ROOT = process.cwd();
const SITE = path.join(ROOT, 'dist-check');
const LIVE = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'checks', 'postcards.json'), 'utf8'));
const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const OUT = path.resolve(ROOT, arg('out') ?? 'check-out');
const useGpu = args.includes('--gpu');
const only = arg('only')?.split(',');
const shard = parseShard(arg('shard'));
const views = shardViews(only ? cfg.views.filter((v) => only.includes(v.id)) : cfg.views, shard);
// Shard 1 (or an unsharded run) also checks the live build's file sizes and counts the first download.
const firstShard = !shard || shard.i === 1;

if (args.includes('--list')) {
  console.log(views.map((v) => v.id).join('\n'));
  process.exit(0);
}
const { chromium } = await import('playwright');

const failures = [];
const warnings = [];
const fmt = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'snaps'), { recursive: true });

// ---------------------------------------------------------------- 1. chunk sizes of the live build
function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
if (!fs.existsSync(LIVE)) throw new Error('dist/ is missing: run `bun run build` first');
if (!fs.existsSync(SITE)) throw new Error('dist-check/ is missing: run `bun run build:check` first');
// Sharded, only shard 1 does this (it's the same build everywhere): the merged report has it once.
const liveFiles = (firstShard ? listFiles(LIVE) : []).map((f) => ({ name: path.relative(LIVE, f).replaceAll('\\', '/'), kb: fs.statSync(f).size / 1000 }));
// The Draco decoder is three.js's own prebuilt file (a worker loads it), not a chunk we build.
const chunks = liveFiles.filter((f) => f.name.endsWith('.js') && !/draco_/.test(f.name)).sort((a, b) => b.kb - a.kb);
const totalKB = liveFiles.reduce((s, f) => s + f.kb, 0);
// No size budget on our own chunks or assets (Jarret, 11/26: "i want detail no limits on size"); sizes are
// only reported. The one hard limit is the platform's: Cloudflare Workers static assets take files up to 25 MiB.
const CF_MAX_FILE_KB = (25 * 1024 * 1024) / 1000;
for (const f of liveFiles) if (f.kb > CF_MAX_FILE_KB) failures.push(`${f.name} is ${fmt(f.kb / 1000, 1)} MB, over Cloudflare's 25 MiB per-file limit for static assets (split it, or serve it from R2)`);

// ---------------------------------------------------------------- 2. serve the check build
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};
// What the player downloads before "Ready" (the first load): every file this server hands out until then,
// raw and as Cloudflare would send it (text compressed; gzip here, Cloudflare's brotli is a little smaller).
const firstLoad = { counting: true, bytes: 0, wire: 0 };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://check').pathname);
  let file = path.join(SITE, p);
  if (!file.startsWith(SITE)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(SITE, 'index.html');
  if (firstLoad.counting) {
    const body = fs.readFileSync(file);
    firstLoad.bytes += body.length;
    firstLoad.wire += /\.(html|js|css|svg|json|wasm)$/.test(file) ? zlib.gzipSync(body, { level: 6 }).length : body.length;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const gpuArgs = useGpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({
  // On GitHub, Playwright's own Chromium (installed by the workflow). Here, the installed Chrome.
  channel: process.env.CI ? 'chromium' : 'chrome',
  args: [...gpuArgs, '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url().replace(url, '/')} (${r.failure()?.errorText})`));

const t0 = Date.now();
let loadSeconds = null;
const views_out = [];
try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('title-loading')?.textContent?.startsWith('Ready'), null, {
    timeout: cfg.maxLoadSeconds * 1000,
    polling: 500,
  });
  loadSeconds = (Date.now() - t0) / 1000;
  firstLoad.counting = false;
  if (firstShard) await page.screenshot({ path: path.join(OUT, 'snaps', 'title.jpg'), type: 'jpeg', quality: 80 });
  if (!(await page.evaluate(() => !!window.__game))) throw new Error('the check build has no dev hooks (build it with `bun run build:check`)');
  await page.click('#btn-new-game');
  await page.waitForFunction(() => document.getElementById('title-screen')?.hidden === true, null, { timeout: 30000 });

  // ---------------------------------------------------------------- 3. postcards
  for (const v of views) {
    const started = Date.now();
    // [G] and the movement keys only work once the game has started: skip the intro comic first if it's still up.
    if ((v.ride || v.keys) && (await page.evaluate(() => document.querySelector('.intro')?.hidden === false))) await page.keyboard.press('Escape');
    if (v.ride) {
      // Walk up to the ride (first whose id starts with v.ride) and press [G] like a player would.
      await page.evaluate((v) => {
        const g = window.__game;
        if (v.time) g.world.setTimePreset(v.time);
        const ride = g.world.rideables.find((x) => x.id.startsWith(v.ride));
        if (!ride) throw new Error(`no ride ${v.ride}`);
        const p = ride.boardPoint(g.catHolder.position.clone());
        g.tp(p.x, p.y, p.z);
        g.advance(0.3);
      }, v);
      await page.keyboard.press('g');
    }
    const r = await page.evaluate(async (v) => {
      const g = window.__game;
      if (v.time) g.world.setTimePreset(v.time);
      if (v.sphereT !== undefined && window.__sphere) window.__sphere.showT = v.sphereT;
      if (v.airT !== undefined && window.__airport) window.__airport.t = v.airT;
      if (v.tp && !v.ride) g.tp(v.tp[0], v.tp[1], v.tp[2]);
      if (v.cam) g.cam(v.cam[0], v.cam[1], v.cam[2]);
      for (const k of v.keys ?? []) g.keys.add(k); // Lou on the move: held through the settle and the shot
      g.advance(v.settle ?? 2.5); // let the camera ease in, lazy interiors build and indoor light adapt
      if (v.keys) {
        const p = g.catHolder.position;
        g.tp(p.x, p.y, p.z); // the follow camera trails a running cat: frame him again
      }
      g.bench(1); // first frame after a move compiles shaders
      const b = g.bench(2);
      const shot = g.snap(0.82);
      if (v.keys) g.keys.clear();
      const img = new Image();
      img.src = shot;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      let blown = 0;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) {
        const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += y;
        if (y >= 250) blown++;
        if (y <= 6) dark++;
      }
      const n = d.length / 4;
      if (window.__sphere) window.__sphere.showT = -1;
      const p = g.catHolder.position;
      return { shot, calls: b.calls, tris: b.tris, mean: sum / n, blownPct: (100 * blown) / n, darkPct: (100 * dark) / n, zone: g.world.getZoneName(p.x, p.z) };
    }, v);
    if (v.ride) await page.keyboard.press('g'); // get up again
    fs.writeFileSync(path.join(OUT, 'snaps', `${v.id}.jpg`), Buffer.from(r.shot.split(',')[1], 'base64'));
    delete r.shot;
    const out = { id: v.id, label: v.label, time: v.time, maxCalls: v.maxCalls, ...r, seconds: (Date.now() - started) / 1000 };
    views_out.push(out);
    if (r.mean < 4) failures.push(`${v.label}: the picture came out black`);
    if (v.maxCalls && r.calls > v.maxCalls) failures.push(`${v.label}: ${fmt(r.calls)} draw calls, over its budget of ${fmt(v.maxCalls)}`);
    if (r.blownPct > cfg.blownOutWarnPct) warnings.push(`${v.label}: ${fmt(r.blownPct, 1)}% of the picture is blown out to white`);
    console.log(`${v.id.padEnd(16)} calls ${String(r.calls).padStart(5)}  tris ${fmt(r.tris).padStart(10)}  mean ${fmt(r.mean, 1).padStart(5)}  blown ${fmt(r.blownPct, 2).padStart(5)}%  dark ${fmt(r.darkPct, 1).padStart(4)}%  ${out.seconds.toFixed(1)}s  ${r.zone}`);
  }
} catch (e) {
  failures.push(loadSeconds === null ? `the game didn't reach "Ready" (${e.message.split('\n')[0]})` : `the check stopped early: ${e.message.split('\n')[0]}`);
  await page.screenshot({ path: path.join(OUT, 'snaps', shard ? `failure-shard-${shard.i}.jpg` : 'failure.jpg'), type: 'jpeg', quality: 80 }).catch(() => {});
}
await browser.close();
server.close();

for (const e of [...new Set(errors)]) failures.push(`console error: ${e.slice(0, 300)}`);

// ---------------------------------------------------------------- report
const metrics = {
  ok: failures.length === 0,
  sha: process.env.GITHUB_SHA ?? null,
  renderer: useGpu ? 'gpu' : 'software',
  shard: shard ? `${shard.i}/${shard.n}` : null,
  wallSeconds: +((Date.now() - t0) / 1000).toFixed(1),
  loadSeconds,
  firstLoadKB: firstShard ? Math.round(firstLoad.bytes / 1000) : null,
  firstLoadWireKB: firstShard ? Math.round(firstLoad.wire / 1000) : null,
  totalKB: firstShard ? totalKB : null,
  chunks: firstShard ? chunks.map((c) => ({ name: c.name, kb: +c.kb.toFixed(1) })) : null,
  views: views_out.map((v) => ({ ...v, mean: +v.mean.toFixed(1), blownPct: +v.blownPct.toFixed(2), darkPct: +v.darkPct.toFixed(1), seconds: +v.seconds.toFixed(1) })),
  failures,
  warnings,
};
fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');

const lines = summaryLines(metrics);
fs.writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n') + '\n');
console.log('\n' + lines.join('\n'));
process.exit(metrics.ok ? 0 : 1);
