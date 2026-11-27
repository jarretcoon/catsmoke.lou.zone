// Shared by scripts/check.mjs (one run, or one shard of it) and scripts/merge-check.mjs (the shards joined):
// which views a shard takes, and the job summary.

const fmt = (n, d = 0) => (n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));

/** "2/4" → { i: 2, n: 4 } (1-based); nothing → null (the whole check). */
export function parseShard(s) {
  if (s == null) return null;
  const m = /^(\d+)\/(\d+)$/.exec(s);
  const i = m ? +m[1] : NaN;
  const n = m ? +m[2] : NaN;
  if (!(n >= 1 && i >= 1 && i <= n)) throw new Error(`--shard=${s}: expected i/n with 1 <= i <= n, e.g. --shard=2/4`);
  return { i, n };
}

/**
 * The views shard i of n takes: every n-th one, starting at the i-th. Dealt round-robin rather than in blocks,
 * so each shard gets a mix of the cheap and the heavy views and the ride views (always last) spread out too.
 * Every view lands in exactly one shard, in postcards.json order, so shard 1 still starts with the new-game view.
 */
export function shardViews(views, shard) {
  return shard ? views.filter((_, k) => k % shard.n === shard.i - 1) : views;
}

/** The Markdown summary (job summary and console) for a metrics.json object. */
export function summaryLines(m) {
  const failures = m.failures ?? [];
  const warnings = m.warnings ?? [];
  const chunk = m.chunks?.[0];
  const lines = [
    `## Game check${m.shard ? ` (shard ${m.shard})` : ''}: ${m.ok ? 'passed' : `${failures.length} problem${failures.length === 1 ? '' : 's'}`}`,
    '',
    `Loaded to Ready in ${m.loadSeconds == null ? '—' : `${fmt(m.loadSeconds, 1)} s`} (${m.renderer} WebGL).` +
      (m.totalKB != null
        ? ` Download before Ready (desktop): ${fmt(m.firstLoadKB / 1000, 2)} MB, ${fmt(m.firstLoadWireKB / 1000, 2)} MB compressed; whole site: ${fmt(m.totalKB / 1000, 2)} MB; biggest JS chunk ${chunk ? `${chunk.name} ${fmt(chunk.kb)} KB` : '—'}.`
        : ' (Sizes are in shard 1.)'),
    '',
  ];
  if (m.shards?.length) {
    lines.push('| Shard | Result | Views | Load | Whole run |', '|---|---|---:|---:|---:|');
    for (const s of m.shards) lines.push(`| ${s.shard} | ${s.result} | ${s.views ?? '—'} | ${s.loadSeconds == null ? '—' : `${fmt(s.loadSeconds, 0)} s`} | ${s.wallSeconds == null ? '—' : `${fmt(s.wallSeconds / 60, 1)} min`} |`);
    lines.push('');
  }
  lines.push(
    ...failures.map((f) => `- ❌ ${f}`),
    ...warnings.map((w) => `- ⚠️ ${w}`),
    '',
    '| View | Draw calls | Triangles | Brightness | Blown out | Black |',
    '|---|---:|---:|---:|---:|---:|',
    ...m.views.map((v) => `| ${v.label} | ${fmt(v.calls)} / ${fmt(v.maxCalls)} | ${fmt(v.tris)} | ${fmt(v.mean, 0)} | ${fmt(v.blownPct, 1)}% | ${fmt(v.darkPct, 1)}% |`)
  );
  return lines;
}
