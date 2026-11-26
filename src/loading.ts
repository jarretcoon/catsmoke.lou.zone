import * as THREE from 'three';
import { DRACO_GLTF_CONFIG, DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Getting from the link to "Ready" fast. Everything here starts the moment the game's code runs, before the
// Strip is built: Lou's model (a lighter one on phones) and the Draco decoder start downloading. Once the
// Strip is built, the shaders of the opening view compile in the GPU process while Lou's model is parsed,
// instead of one after the other inside the first frame, and the title screen shows progress.

/** Set by vite.config.ts: Lou's models with content-hashed URLs (relative to BASE_URL) and their sizes. */
declare const __LOU_MODELS__: Record<'full' | 'lite', { url: string; bytes: number }>;

export type DeviceClass = 'desktop' | 'phone' | 'tablet';

const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;

/** Desktop = any mouse/trackpad; a touch-only screen is a phone, or a tablet from 600 CSS px on its short side. */
export function deviceClass(): DeviceClass {
  if (mq('(any-pointer: fine)') || !mq('(any-pointer: coarse)')) return 'desktop';
  return Math.min(screen.width, screen.height) >= 600 ? 'tablet' : 'phone';
}

// Phones and tablets get the lite model (half-size fur textures, ~half the download); `?lou=full|lite` overrides.
const louPick = new URLSearchParams(location.search).get('lou');
const louModel = __LOU_MODELS__[louPick === 'full' || louPick === 'lite' ? louPick : deviceClass() === 'desktop' ? 'full' : 'lite'];
const louUrl = new URL(`${import.meta.env.BASE_URL}${louModel.url}`, location.href).href;

// ---------------------------------------------------------------- progress on the title screen
const progress = { bytes: 0, shaders: 0, shadersDone: 0, louShadersKnown: false, done: false, shown: 0 };
const LOU_PROGRAMS_GUESS = 8; // until his model is parsed, count his shaders as this many
let shownAt = 0;
function showProgress(): void {
  if (progress.done) return;
  const now = performance.now();
  if (now - shownAt < 100) return;
  shownAt = now;
  const el = document.getElementById('title-loading');
  if (!el) return;
  const lou = Math.min(1, progress.bytes / Math.max(1, louModel.bytes));
  const total = progress.shaders + (progress.louShadersKnown ? 0 : LOU_PROGRAMS_GUESS);
  const shaders = total ? progress.shadersDone / total : 0;
  // Never step backwards (Lou's real shader count replaces the guess).
  progress.shown = Math.max(progress.shown, Math.min(99, Math.round(100 * (0.4 * lou + 0.6 * shaders))));
  el.textContent = `Loading the Strip… ${progress.shown}%`;
}

// ---------------------------------------------------------------- Lou's download
// Requested the moment this module runs, before the Strip is built: the browser keeps receiving it while the
// build keeps the page busy. (A worker would be no better: it can't even start until the page is free.)
async function download(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (!r.body) return r.arrayBuffer();
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.byteLength;
    progress.bytes = size;
    showProgress();
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out.buffer;
}

const louBytes = download(louUrl);
let louArrived = false;
louBytes.then(
  () => (louArrived = true),
  () => {},
);
// Fetch and compile the Draco decoder now too, while the Strip builds.
const draco = new DRACOLoader().setDecoderPath(DRACO_GLTF_CONFIG).preload();

/** Lou's glTF, parsed (Draco geometry decodes in workers, WebP textures decode off the main thread). */
export function loadLou(): Promise<GLTF> {
  return louBytes.then((buf) => {
    performance.mark('lou-downloaded');
    return new Promise<GLTF>((resolve, reject) => new GLTFLoader().setDRACOLoader(draco).parse(buf, '', resolve, reject));
  });
}

// ---------------------------------------------------------------- shaders
type ProgramLike = { isReady?: () => boolean };

/**
 * Compiles every material under `root` the way `target` will draw it (the bloom composer's render target, or
 * null for the screen: tone mapping and output colour space differ, so it must match or they'd compile twice).
 * Resolves when the GPU has them all ready. The compiling happens in the GPU process; asking whether a program
 * is ready can wait for everything queued before it, so the asking starts only once `askAfter` settles (Lou's
 * model parses on the main thread meanwhile).
 */
export function warmShaders(renderer: THREE.WebGLRenderer, root: THREE.Object3D, camera: THREE.Camera, target: THREE.WebGLRenderTarget | null, scene?: THREE.Scene, askAfter: Promise<unknown> = Promise.resolve()): Promise<void> {
  const prev = renderer.getRenderTarget();
  let materials: Set<THREE.Material>;
  // three r18x draws PCFSoftShadowMap as PCFShadowMap, switching on the first shadow render; switch now so
  // the shaders compiled here are the ones that frame uses (the shadow type is part of every lit shader).
  if (renderer.shadowMap.type === THREE.PCFSoftShadowMap) renderer.shadowMap.type = THREE.PCFShadowMap;
  try {
    renderer.setRenderTarget(target);
    materials = renderer.compile(root, camera, scene ?? (root as THREE.Scene));
  } catch (e) {
    console.warn('Shader warm-up skipped:', e);
    return Promise.resolve();
  } finally {
    renderer.setRenderTarget(prev);
  }
  // Many materials share one GPU program; wait on (and count progress in) programs.
  const programs = new Set<ProgramLike>();
  for (const m of materials) {
    const program = (renderer.properties.get(m) as { currentProgram?: ProgramLike }).currentProgram;
    if (program) programs.add(program);
  }
  progress.shaders += programs.size;
  const started = performance.now();
  return askAfter.then(() => new Promise<void>((resolve) => {
    const check = () => {
      for (const p of programs) {
        if (!p.isReady || p.isReady()) {
          programs.delete(p);
          progress.shadersDone++;
        }
      }
      showProgress();
      // A driver that never reports "ready" can't hold the game hostage: draw anyway after 90 s.
      if (programs.size === 0 || performance.now() - started > 90000) resolve();
      else setTimeout(check, 16);
    };
    check();
  }));
}

let worldWarmDone: () => void = () => {};
const worldWarm = new Promise<void>((r) => (worldWarmDone = r));
let louParsedDone: () => void = () => {};
const louParsed = new Promise<void>((r) => (louParsedDone = r));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * What the first frame will draw: switched on (after the first frame's distance culling) and in the camera's
 * view. One object per material, gathered under a stand-in parent that doesn't re-parent them. Everything
 * else compiles when it first shows up, as before; only the opening view waits on its shaders.
 */
function inFirstFrame(scene: THREE.Scene, camera: THREE.Camera): THREE.Object3D {
  scene.updateMatrixWorld();
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const seen = new Set<THREE.Material>();
  const picks: THREE.Object3D[] = [];
  scene.traverseVisible((o) => {
    const r = o as THREE.Mesh;
    const sprite = (o as THREE.Sprite).isSprite;
    if (!(r.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || sprite) || !r.material) return;
    if (o.frustumCulled && !(sprite ? frustum.intersectsSprite(o as THREE.Sprite) : frustum.intersectsObject(o))) return;
    const mats = Array.isArray(r.material) ? r.material : [r.material];
    if (mats.every((m) => seen.has(m))) return;
    for (const m of mats) seen.add(m);
    picks.push(o);
  });
  const stand = new THREE.Group();
  stand.children = picks; // traversal only: their real parent stays as it is
  return stand;
}

/** Warm the shaders of the Strip's opening view once it's built (call before the first frame). */
export function warmWorld(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget | null): Promise<void> {
  performance.mark('strip-built');
  // Lou parses while the GPU compiles the Strip. If he's still downloading after 2.5 s (a slow link), don't
  // hold the Strip back for him; if he's here and parsing, give him up to 5 s more.
  const askAfter = Promise.race([louParsed, sleep(2500).then(() => (louArrived ? Promise.race([louParsed, sleep(5000)]) : undefined))]);
  warmShaders(renderer, inFirstFrame(scene, camera), camera, target, scene, askAfter).then(() => {
    performance.mark('strip-shaders-ready');
    worldWarmDone();
  });
  return worldWarm;
}

/** Warm Lou's own shaders, and wait for the Strip's: then the first frames can't stall. */
export function warmLou(renderer: THREE.WebGLRenderer, model: THREE.Object3D, camera: THREE.Camera, target: THREE.WebGLRenderTarget | null, scene: THREE.Scene): Promise<void> {
  performance.mark('lou-parsed');
  progress.louShadersKnown = true;
  louParsedDone();
  return Promise.all([worldWarm, warmShaders(renderer, model, camera, target, scene).then(() => performance.mark('lou-shaders-ready'))]).then(() => {});
}

// ---------------------------------------------------------------- done
let readyAt: number | null = null;

/** Call when the title screen says "Ready": stops the progress text and records the load time. */
export function loadingDone(): void {
  if (readyAt !== null) return;
  progress.done = true;
  readyAt = performance.now() / 1000;
  performance.mark('game-ready');
}

/** Seconds from the link to "Ready", or null while still loading. */
export function loadSeconds(): number | null {
  return readyAt;
}
