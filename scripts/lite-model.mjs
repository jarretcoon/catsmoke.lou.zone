// Makes public/models/tabby_cat_lite.glb, the phone version of Lou, from public/models/tabby_cat.glb.
//
// Same geometry, rig and animations byte for byte; only the WebP textures are halved (2048 -> 1024 px), which
// roughly halves the download. Phones draw Lou a few hundred pixels tall, so they can't show the difference.
// Run it whenever tabby_cat.glb changes (after blender/build_tabby_cat.py):
//
//   node scripts/lite-model.mjs
//
// It records which full model it was made from (asset.extras.liteOf = sha256 of tabby_cat.glb);
// vite.config.ts serves the full model to phones too if the lite one is out of date.
// The resizing and WebP encoding are done by Chrome (Playwright, already used by the PR check).

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'public', 'models', 'tabby_cat.glb');
const OUT = path.join(ROOT, 'public', 'models', 'tabby_cat_lite.glb');
const MAX_SIZE = 1024; // longest side of each texture in the lite model
const QUALITY = 0.85; // WebP quality, same as the Blender export

const glb = fs.readFileSync(SRC);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('tabby_cat.glb is not a GLB');
const jsonLen = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen));
const views = json.bufferViews.map((v) => bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));

// ---- resize the images in Chrome
const browser = await chromium.launch({ channel: process.env.CI ? 'chromium' : 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage();
const replaced = new Map(); // bufferView index -> new bytes
for (const [i, img] of (json.images ?? []).entries()) {
  if (img.bufferView === undefined || img.mimeType !== 'image/webp') continue;
  const b64 = Buffer.from(views[img.bufferView]).toString('base64');
  const out = await page.evaluate(
    async ({ b64, max, q }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (scale === 1) return null;
      const c = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await c.convertToBlob({ type: 'image/webp', quality: q });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode(...buf.subarray(k, k + 0x8000));
      return { b64: btoa(s), w: c.width, h: c.height, from: [bmp.width, bmp.height] };
    },
    { b64, max: MAX_SIZE, q: QUALITY },
  );
  if (!out) continue;
  const bytes = Buffer.from(out.b64, 'base64');
  replaced.set(img.bufferView, bytes);
  console.log(`${img.name ?? `image ${i}`}: ${out.from.join('x')} -> ${out.w}x${out.h}, ${(views[img.bufferView].length / 1e3).toFixed(0)} KB -> ${(bytes.length / 1e3).toFixed(0)} KB`);
}
await browser.close();

// ---- rebuild the binary chunk (bufferViews 4-byte aligned, in their original order)
const pad4 = (n) => (n + 3) & ~3;
const parts = [];
let offset = 0;
json.bufferViews.forEach((v, i) => {
  const data = replaced.get(i) ?? views[i];
  v.byteOffset = offset;
  v.byteLength = data.length;
  parts.push(data);
  const padded = pad4(data.length);
  if (padded > data.length) parts.push(Buffer.alloc(padded - data.length));
  offset += padded;
});
json.buffers[0].byteLength = offset;
json.asset.extras = { ...(json.asset.extras ?? {}), liteOf: createHash('sha256').update(glb).digest('hex') };

let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length) - jsonBuf.length, 0x20)]);
const binBuf = Buffer.concat(parts);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
const chunk = (type, data) => {
  const h = Buffer.alloc(8);
  h.writeUInt32LE(data.length, 0);
  h.writeUInt32LE(type, 4);
  return Buffer.concat([h, data]);
};
fs.writeFileSync(OUT, Buffer.concat([header, chunk(0x4e4f534a, jsonBuf), chunk(0x004e4942, binBuf)]));
console.log(`wrote ${path.relative(ROOT, OUT)}: ${(glb.length / 1e6).toFixed(2)} MB -> ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB`);
