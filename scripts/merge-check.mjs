// Joins the Game check's shards (each one `node scripts/check.mjs --shard=i/n --out=...`) into one check-out/:
// metrics.json with every view in postcards.json order, summary.md, and all the snaps. The CI job "Game check"
// runs this after the shards, so "Post snapshots" and scripts/pr-comment.mjs see one whole run like before.
//
// Usage: node scripts/merge-check.mjs <shards dir> <out dir> --shards=n
//   <shards dir> holds one folder per shard (any names), each with metrics.json and snaps/.
//   --shards=n is how many there should be: a missing shard (it crashed, or was cancelled) is a failure.
// Exits 1 if any shard failed or is missing.

import fs from 'node:fs';
import path from 'node:path';
import { summaryLines } from './check-report.mjs';

const [shardsDir, outDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const expected = +(process.argv.find((a) => a.startsWith('--shards='))?.slice(9) ?? 0);
if (!shardsDir || !outDir) throw new Error('usage: node scripts/merge-check.mjs <shards dir> <out dir> --shards=n');

const found = (fs.existsSync(shardsDir) ? fs.readdirSync(shardsDir, { withFileTypes: true }) : [])
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(shardsDir, e.name, 'metrics.json')))
  .map((e) => ({ dir: path.join(shardsDir, e.name), m: JSON.parse(fs.readFileSync(path.join(shardsDir, e.name, 'metrics.json'), 'utf8')) }))
  .sort((a, b) => parseInt(a.m.shard ?? '0') - parseInt(b.m.shard ?? '0'));

const failures = [];
const warnings = [];
const byNumber = new Map(found.map((s) => [parseInt(s.m.shard ?? '1'), s]));
const n = Math.max(expected, ...found.map((s) => +(s.m.shard?.split('/')[1] ?? 1)), 1);
const shards = [];
for (let i = 1; i <= n; i++) {
  const s = byNumber.get(i);
  if (!s) {
    failures.push(`shard ${i}/${n} left no results (it crashed or was cancelled: see its job log)`);
    shards.push({ shard: `${i}/${n}`, result: '❌ missing' });
    continue;
  }
  shards.push({ shard: s.m.shard ?? `${i}/${n}`, result: s.m.ok ? 'passed' : `❌ ${s.m.failures.length} problem${s.m.failures.length === 1 ? '' : 's'}`, views: s.m.views.length, loadSeconds: s.m.loadSeconds, wallSeconds: s.m.wallSeconds });
  // A problem with no view name of its own (load, console, crash) says which shard saw it.
  for (const f of s.m.failures) failures.push(s.m.views.some((v) => f.startsWith(`${v.label}:`)) || /^\S+ is [\d.,]+ MB/.test(f) ? f : `${f} (shard ${s.m.shard})`);
  warnings.push(...s.m.warnings);
}

// Views back in postcards.json order (the shards dealt them round-robin).
const cfgPath = path.join(process.cwd(), 'checks', 'postcards.json');
const order = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')).views.map((v) => v.id) : [];
const rank = (id) => (order.includes(id) ? order.indexOf(id) : order.length);
const views = found.flatMap((s) => s.m.views).sort((a, b) => rank(a.id) - rank(b.id));
const missing = order.filter((id) => !views.some((v) => v.id === id));
if (missing.length && found.length) failures.push(`no snapshot for ${missing.length} view${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);

const first = byNumber.get(1)?.m ?? {};
const metrics = {
  ok: failures.length === 0,
  sha: first.sha ?? found[0]?.m.sha ?? null,
  renderer: first.renderer ?? found[0]?.m.renderer ?? 'software',
  shards,
  loadSeconds: first.loadSeconds ?? null,
  firstLoadKB: first.firstLoadKB ?? null,
  firstLoadWireKB: first.firstLoadWireKB ?? null,
  totalKB: first.totalKB ?? null,
  chunks: first.chunks ?? [],
  views,
  failures: [...new Set(failures)],
  warnings: [...new Set(warnings)],
};

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'snaps'), { recursive: true });
for (const s of found) {
  const snaps = path.join(s.dir, 'snaps');
  if (fs.existsSync(snaps)) for (const f of fs.readdirSync(snaps)) fs.copyFileSync(path.join(snaps, f), path.join(outDir, 'snaps', f));
}
fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
const lines = summaryLines(metrics);
fs.writeFileSync(path.join(outDir, 'summary.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exit(metrics.ok ? 0 : 1);
