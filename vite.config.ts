import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const MODELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'public', 'models');
const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

/**
 * Lou's two models, each with a content hash in its URL (so /models/* can be cached for a year and a new
 * model still shows up at once). The lite one (half-size textures, for phones) is made from the full one by
 * `node scripts/lite-model.mjs` and records which full model it came from; if it's stale (the full model was
 * rebuilt since), phones get the full model too until it's remade.
 */
function louModels() {
  const full = fs.readFileSync(path.join(MODELS, 'tabby_cat.glb'));
  const fullSha = sha(full);
  const out = { full: { url: `models/tabby_cat.glb?v=${fullSha.slice(0, 10)}`, bytes: full.length }, lite: { url: '', bytes: 0 } };
  out.lite = out.full;
  const litePath = path.join(MODELS, 'tabby_cat_lite.glb');
  if (fs.existsSync(litePath)) {
    const lite = fs.readFileSync(litePath);
    const json = JSON.parse(lite.subarray(20, 20 + lite.readUInt32LE(12)).toString('utf8'));
    if (json.asset?.extras?.liteOf === fullSha) out.lite = { url: `models/tabby_cat_lite.glb?v=${sha(lite).slice(0, 10)}`, bytes: lite.length };
    else console.warn('\n[lou] public/models/tabby_cat_lite.glb is out of date: run `node scripts/lite-model.mjs`. Phones get the full model until then.\n');
  }
  return out;
}

/** The game version the anonymous stats report: the commit (Cloudflare Workers Builds / GitHub / git), else the build time. */
function gameVersion(): string {
  const env = process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  }
}

/**
 * three's DRACOLoader names three decoder builds; the game only uses the glTF WebAssembly one
 * (DRACO_GLTF_CONFIG). Drop the URLs of the other two so ~1 MB of unused decoder files stay out of dist/.
 */
function onlyGltfDraco(): Plugin {
  return {
    name: 'only-gltf-draco',
    enforce: 'pre',
    transform(code, id) {
      if (!/three[\\/]examples[\\/]jsm[\\/]loaders[\\/]DRACOLoader\.js$/.test(id)) return null;
      let n = 0;
      const out = code.replace(/new URL\(\s*'\.\.\/libs\/draco\/draco_[a-z_]+\.(?:js|wasm)',\s*import\.meta\.url\s*\)\.toString\(\)/g, () => {
        n++;
        return "''";
      });
      if (n !== 3) this.warn(`expected 3 default Draco decoder URLs in DRACOLoader.js, found ${n}`);
      return { code: out, map: null };
    },
  };
}

// Three.js ships as two big ES modules (core + WebGL renderer). Splitting them into
// their own long-cached vendor chunks keeps game-logic deploys tiny on Cloudflare Pages
// and keeps every chunk under Vite's 500 KB warning.
export default defineConfig({
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
  plugins: [onlyGltfDraco()],
  define: {
    __LOU_MODELS__: JSON.stringify(louModels()),
    __GAME_VERSION__: JSON.stringify(gameVersion()),
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /node_modules[\\/]three[\\/]build[\\/]three\.core/, priority: 3 },
            { name: 'three-renderer', test: /node_modules[\\/]three[\\/]build[\\/]/, priority: 2 },
            { name: 'three-addons', test: /node_modules[\\/]three[\\/]examples[\\/]/, priority: 1 },
            // The world's walk-in places (Sphere, casinos, grand interiors) and the districts, split so
            // no chunk trips the 500 KB warning.
            { name: 'interiors', test: /src[\\/]world[\\/](sphere|grand|interior|casino|circus|mgm|nyny|via|cosmo|themed)/, priority: 1 },
            { name: 'signs', test: /src[\\/]world[\\/](signKit|stripSigns|westSigns|luckySign)/, priority: 1 },
            { name: 'districts', test: /src[\\/]world[\\/]/, priority: 0 },
          ],
        },
      },
    },
  },
});
