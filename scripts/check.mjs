// Game check (runs on every pull request, and locally with `bun run check`).
//
// 1. Checks the live build in dist/: no JavaScript chunk over the size budget.
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

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const SITE = path.join(ROOT, 'dist-check');
const LIVE = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'check-out');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'checks', 'postcards.json'), 'utf8'));
const args = process.argv.slice(2);
const useGpu = args.includes('--gpu');
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const views = only ? cfg.views.filter((v) => only.includes(v.id)) : cfg.views;

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
const liveFiles = listFiles(LIVE).map((f) => ({ name: path.relative(LIVE, f).replaceAll('\\', '/'), kb: fs.statSync(f).size / 1000 }));
// The Draco decoder is three.js's own prebuilt file (a worker loads it), not a chunk we build.
const chunks = liveFiles.filter((f) => f.name.endsWith('.js') && !/draco_/.test(f.name)).sort((a, b) => b.kb - a.kb);
const totalKB = liveFiles.reduce((s, f) => s + f.kb, 0);
for (const c of chunks) if (c.kb > cfg.maxChunkKB) failures.push(`${c.name} is ${fmt(c.kb)} KB, over the ${cfg.maxChunkKB} KB chunk budget`);

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
  await page.screenshot({ path: path.join(OUT, 'snaps', 'title.jpg'), type: 'jpeg', quality: 80 });
  if (!(await page.evaluate(() => !!window.__game))) throw new Error('the check build has no dev hooks (build it with `bun run build:check`)');
  await page.click('#btn-new-game');
  await page.waitForFunction(() => document.getElementById('title-screen')?.hidden === true, null, { timeout: 30000 });

  // ---------------------------------------------------------------- 3. postcards
  for (const v of views) {
    const started = Date.now();
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
      if (v.tp && !v.ride) g.tp(v.tp[0], v.tp[1], v.tp[2]);
      if (v.cam) g.cam(v.cam[0], v.cam[1], v.cam[2]);
      g.advance(v.settle ?? 2.5); // let the camera ease in, lazy interiors build and indoor light adapt
      g.bench(1); // first frame after a move compiles shaders
      const b = g.bench(2);
      const shot = g.snap(0.82);
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
  await page.screenshot({ path: path.join(OUT, 'snaps', 'failure.jpg'), type: 'jpeg', quality: 80 }).catch(() => {});
}
await browser.close();
server.close();

for (const e of [...new Set(errors)]) failures.push(`console error: ${e.slice(0, 300)}`);

// ---------------------------------------------------------------- report
const metrics = {
  ok: failures.length === 0,
  sha: process.env.GITHUB_SHA ?? null,
  renderer: useGpu ? 'gpu' : 'software',
  loadSeconds,
  firstLoadKB: Math.round(firstLoad.bytes / 1000),
  firstLoadWireKB: Math.round(firstLoad.wire / 1000),
  totalKB,
  chunks: chunks.map((c) => ({ name: c.name, kb: +c.kb.toFixed(1) })),
  views: views_out.map((v) => ({ ...v, mean: +v.mean.toFixed(1), blownPct: +v.blownPct.toFixed(2), darkPct: +v.darkPct.toFixed(1), seconds: +v.seconds.toFixed(1) })),
  failures,
  warnings,
};
fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');

const lines = [
  `## Game check: ${metrics.ok ? 'passed' : `${failures.length} problem${failures.length === 1 ? '' : 's'}`}`,
  '',
  `Loaded to Ready in ${loadSeconds === null ? '—' : `${fmt(loadSeconds, 1)} s`} (${metrics.renderer} WebGL). Download before Ready (desktop): ${fmt(metrics.firstLoadKB / 1000, 2)} MB, ${fmt(metrics.firstLoadWireKB / 1000, 2)} MB compressed; whole site: ${fmt(totalKB / 1000, 2)} MB; biggest JS chunk ${chunks[0] ? `${chunks[0].name} ${fmt(chunks[0].kb)} KB` : '—'}.`,
  '',
  ...failures.map((f) => `- ❌ ${f}`),
  ...warnings.map((w) => `- ⚠️ ${w}`),
  '',
  '| View | Draw calls | Triangles | Brightness | Blown out | Black |',
  '|---|---:|---:|---:|---:|---:|',
  ...metrics.views.map((v) => `| ${v.label} | ${fmt(v.calls)} / ${fmt(v.maxCalls)} | ${fmt(v.tris)} | ${fmt(v.mean, 0)} | ${fmt(v.blownPct, 1)}% | ${fmt(v.darkPct, 1)}% |`),
];
fs.writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n') + '\n');
console.log('\n' + lines.join('\n'));
process.exit(metrics.ok ? 0 : 1);
