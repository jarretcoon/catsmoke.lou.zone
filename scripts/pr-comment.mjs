// Builds the PR comment for the game check: problems, then each postcard side by side with main's.
// Usage: node scripts/pr-comment.mjs <metrics.json> <main-metrics.json|-> <pr image base URL> <main image base URL|-> <run URL>
import fs from 'node:fs';

const [metricsPath, basePath, prImg, mainImg, runUrl] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
const base = basePath && basePath !== '-' && fs.existsSync(basePath) ? JSON.parse(fs.readFileSync(basePath, 'utf8')) : null;
const fmt = (n, d = 0) => (n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
const delta = (a, b, d = 0) => (a == null ? fmt(b, d) : `${fmt(a, d)} → ${fmt(b, d)}`);

const out = ['<!-- catsmoke-check -->'];
out.push(`## 🐈 Game check: ${m.ok ? '✅ passed' : `❌ ${m.failures.length} problem${m.failures.length === 1 ? '' : 's'}`}`);
out.push('');
out.push(
  `Loaded to Ready in ${m.loadSeconds == null ? '—' : `${fmt(m.loadSeconds, 1)} s`} on GitHub's software renderer (a real phone or PC is much faster). ` +
    `Download ${fmt(m.totalKB / 1000, 2)} MB${base ? ` (main: ${fmt(base.totalKB / 1000, 2)} MB)` : ''}. [Full run](${runUrl})`
);
out.push('');
for (const f of m.failures) out.push(`- ❌ ${f}`);
for (const w of m.warnings) out.push(`- ⚠️ ${w}`);
if (m.failures.length || m.warnings.length) out.push('');

const baseViews = new Map((base?.views ?? []).map((v) => [v.id, v]));
const showMain = base && mainImg && mainImg !== '-';
out.push(showMain ? '| View | main | this PR |' : '| View | this PR |');
out.push(showMain ? '|:--|:--:|:--:|' : '|:--|:--:|');
const img = (b, id) => `<img src="${b}/${id}.jpg" width="320">`;
for (const v of m.views) {
  const b = baseViews.get(v.id);
  const over = v.maxCalls && v.calls > v.maxCalls ? ' ❌' : '';
  const cell = [
    `**${v.label}**`,
    `draw calls ${delta(b?.calls, v.calls)}${over} (budget ${fmt(v.maxCalls)})`,
    `brightness ${delta(b?.mean, v.mean)}`,
    `blown out ${delta(b?.blownPct, v.blownPct, 1)}%`,
  ].join('<br>');
  out.push(showMain ? `| ${cell} | ${b ? img(mainImg, v.id) : '—'} | ${img(prImg, v.id)} |` : `| ${cell} | ${img(prImg, v.id)} |`);
}
out.push('');
out.push('<sub>Brightness is the average of the picture, 0–255. Blown out = share of the picture at pure white. Draw calls are the same on any machine, so a big jump means a heavier frame on phones too. Views and budgets: <code>checks/postcards.json</code>.</sub>');
process.stdout.write(out.join('\n') + '\n');
