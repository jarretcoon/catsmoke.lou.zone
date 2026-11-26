import * as THREE from 'three';
import { loadingDone, loadLou, warmLou, warmWorld } from './loading';
import { startStats } from './stats';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { EnvLighting, applyGrade, capSpecularHighlights, makeBloomPass, makeGradePass, stripLook } from './look';
import { getBrightness, mountBrightnessSlider } from './brightness';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AbcItem, AbcShopController } from './abcShop';
import { SoundFX } from './audio';
import { CasinoController } from './casino';
import { CatLook, setFurQuality } from './catLook';
import { CatMotion } from './catMotion';
import { DegenScore, PropPhysics, WantedSystem } from './chaos';
import { IntroComic } from './intro';
import { MissionCtx, MissionEvent, MissionManager } from './missions';
import { PlayerDriving } from './driving';
import { RestaurantSystem } from './restaurants';
import { BoutiqueController, CatWardrobe, cosmeticById, swagFor } from './cosmetics';
import { GoalTracker } from './goals';
import { MapMarker, Minimap } from './minimap';
import { GuardNPC, StripCrowdSystem } from './npcs';
import { rideLens, type Rideable } from './rides';
import { installRideshare } from './rideshare';
import { SmokeSystem, VapeTrick } from './smoke';
import { CosmeticId, defaultState, GameState, localSaveBackend } from './state';
import { buildVegasStripWorld, PlatformBox, TimePreset } from './vegasWorld';
import { INDOOR_ZONE } from './world/builder';
import { hiddenIndoors } from './world/grandInteriors';
import { Ambience } from './ambience';
import { STRIP } from './world/strip';
import { GraphicsQuality, type Quality } from './quality';
import { Hud, menuOpen } from './hud';
import { installMouseCamera } from './mouseCam';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game-canvas');
const gameRoot = $('game-root');
const cashEl = $('cash-value');
const stashEl = $('stash-value');
const deviceLabelEl = $('device-label');
const deviceValueEl = $('device-value');
const swagEl = $('swag-value');
const stateEl = $('state-value');
const zoneEl = $('zone-label');
const promptEl = $('prompt-pill');
const toastEl = $('toast-banner');
const heatMeter = $('heat-meter');
const heatFill = $('heat-fill');
const titleScreen = $('title-screen');
const btnContinue = $<HTMLButtonElement>('btn-continue');
const btnNewGame = $<HTMLButtonElement>('btn-new-game');
const titleSaveInfo = $('title-save-info');
const titleLoading = $('title-loading');
const btnPuff = $<HTMLButtonElement>('btn-puff');
const btnDevice = $<HTMLButtonElement>('btn-device');
const btnBeg = $<HTMLButtonElement>('btn-beg');
const btnSteal = $<HTMLButtonElement>('btn-steal');
const btnDance = $<HTMLButtonElement>('btn-dance');
const btnBus = $<HTMLButtonElement>('btn-bus');
const btnInteract = $<HTMLButtonElement>('btn-interact');
const btnSound = $<HTMLButtonElement>('btn-sound');
const btnMood = $<HTMLButtonElement>('btn-mood');
const btnResetSave = $<HTMLButtonElement>('btn-reset-save');
const goalsPopover = $('goals-popover');

// ---------------------------------------------------------------- state
const saved = localSaveBackend.load();
let S: GameState = saved ?? defaultState();
let started = false;

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
capSpecularHighlights();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.25, 1600);
const sfx = new SoundFX();
const ambience = new Ambience();
const world = buildVegasStripWorld(scene);
// Reflections: a PMREM env map of a stand-in Vegas that follows the time of day.
const envLighting = new EnvLighting(renderer, scene);
envLighting.update(world.atmosphere);
const crowd = new StripCrowdSystem(scene, world.crowd);
const smokeSystem = new SmokeSystem(scene);
const minimap = new Minimap(world.mapFeatures);
const props = new PropPhysics();
props.register(world.props);
const driving = new PlayerDriving();
const DRIVER_LINES = ['MY UBER!! A CAT TOOK MY UBER!', 'Hey! That is a rental!', 'Was that cat SMOKING?!', 'I just got this detailed!', 'Somebody call Animal Control!'];

// ---------------------------------------------------------------- graphics quality + bloom
// The level comes from src/quality.ts: Auto (measured from real frame times) unless the player picked one.
let quality: Quality = 'high';
let composer: EffectComposer | null = null;
/** Scales the distance culling of props, pickups, guards and vehicles (Low graphics = 0.7). */
let dynCullScale = 1;
let bloom: UnrealBloomPass | null = null;
let grade: ShaderPass | null = null;
const look = { exposure: 1.12, bloomStrength: 0.6, bloomThreshold: 0.9 };
// The slider goes before its anchor: anchor it on the menu's first setting row so it's the top row of Settings.
mountBrightnessSlider(document.querySelector('#controls-popover .controls-footer > .setting-row'));

function applyQuality(): void {
  renderer.setPixelRatio(quality === 'high' ? Math.min(window.devicePixelRatio, 2) : quality === 'medium' ? Math.min(window.devicePixelRatio, 1.25) : 1);
  const shadows = quality !== 'low';
  if (renderer.shadowMap.enabled !== shadows) {
    renderer.shadowMap.enabled = shadows;
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => (mm.needsUpdate = true));
    });
  }
  world.sun.castShadow = shadows;
  const size = quality === 'high' ? 2048 : 1024;
  if (world.sun.shadow.mapSize.x !== size) {
    world.sun.shadow.mapSize.set(size, size);
    world.sun.shadow.map?.dispose();
    world.sun.shadow.map = null;
  }
  // Post-processing renders off-screen, where the canvas's own antialiasing doesn't apply:
  // give the composer a multisampled target so edges stay smooth with bloom on.
  const samples = quality === 'high' ? 4 : quality === 'medium' ? 2 : 0;
  if (composer && composer.renderTarget1.samples !== samples) {
    composer.dispose();
    composer = null;
  }
  if (quality === 'low') {
    composer?.dispose();
    composer = null;
    bloom = null;
    grade = null;
  } else if (!composer) {
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(window.innerWidth * pr, window.innerHeight * pr, { type: THREE.HalfFloatType, samples });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = makeBloomPass(window.innerWidth, window.innerHeight);
    composer.addPass(bloom);
    grade = makeGradePass();
    composer.addPass(grade);
    composer.addPass(new OutputPass());
  }
  world.setDrawDistance(quality === 'low' ? 0.6 : quality === 'medium' ? 0.85 : 1);
  dynCullScale = quality === 'low' ? 0.7 : 1;
  setFurQuality(quality);
  composer?.setPixelRatio(renderer.getPixelRatio());
  composer?.setSize(window.innerWidth, window.innerHeight);
}
/**
 * Shadows on/off changes every lit material's shader, and building them all at once froze the game for seconds
 * (35 s on a busy PC) the first time anyone picked Low. Build that level's shaders in the background first
 * (KHR_parallel_shader_compile) while the current level keeps drawing; the switch itself is then instant.
 */
function prewarmQuality(q: Quality): Promise<void> {
  const shadows = q !== 'low';
  if (renderer.shadowMap.enabled === shadows) return Promise.resolve();
  const was = renderer.shadowMap.enabled;
  const sunWas = world.sun.castShadow;
  const rtWas = renderer.getRenderTarget();
  // Medium / High draw through the bloom composer's render target (shaders without tone mapping); Low draws
  // straight to the canvas. Compile the variants that level will really use.
  const rt = q === 'low' ? null : new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  renderer.shadowMap.enabled = shadows;
  world.sun.castShadow = shadows;
  renderer.setRenderTarget(rt);
  let programs: { isReady(): boolean }[] = [];
  try {
    programs = [...renderer.compile(scene, camera)]
      .map((m) => (renderer.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram)
      .filter((p): p is { isReady(): boolean } => !!p);
  } finally {
    renderer.setRenderTarget(rtWas);
    rt?.dispose();
    renderer.shadowMap.enabled = was;
    world.sun.castShadow = sunWas;
  }
  return new Promise((resolve) => {
    const check = () => (programs.every((p) => p.isReady()) ? resolve() : window.setTimeout(check, 50));
    check();
  });
}
const graphics = new GraphicsQuality(
  (q) => {
    quality = q;
    applyQuality();
  },
  // Measure only real play: past the title screen, menu closed, no shop or casino open.
  () => started && !menuOpen() && !document.querySelector('dialog[open]'),
  prewarmQuality
);

const catHolder = new THREE.Group();
catHolder.position.fromArray(S.position);
scene.add(catHolder);
// Waymos and Ubers in traffic; [G] at a RIDESHARE PICKUP sign or the phone's `catsmoke:hail` calls one (rideshare.ts).
const rideshare = installRideshare({
  world,
  scene,
  camera,
  cat: catHolder,
  pay: (amount) => {
    const paid = Math.min(Math.max(0, S.cash), amount);
    S.cash -= paid;
    updateHUD();
    return paid;
  },
  toast: (msg, ms) => showToast(msg, ms),
  dev: import.meta.env.DEV || import.meta.env.MODE === 'check',
});
const catVelocity = new THREE.Vector3();
let catYaw = S.yaw;
let isGrounded = false;
let coyoteTimer = 0;
let puffTimer = 0;
let idleAutoPuffTimer = 5.5;
let dynCullTimer = 0;
let buzzTimer = 0;
let performerTipCooldown = 0;
let toastTimeout: number | undefined;
let riding: Rideable | null = null;
let waitingStop: { z: number; side: 1 | -1; name: string } | null = null;
let lastZone = '';
let wardrobe: CatWardrobe | null = null;
let catModel: THREE.Object3D | null = null;
let pounceTimer = 0;
let vapeChargeStart = -1;
let trickCooldown = 0;
let airTime = 0;
let peakY = 0;
const rag = { active: false, t: 0, spin: new THREE.Vector3(), lastVy: 0 };
const cigMeshes: THREE.Mesh[] = [];
const vapeMeshes: THREE.Mesh[] = [];
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

world.setTimePreset(S.timePreset);
if (S.vip) world.unlockVip();

const swag = () => swagFor(S.cosmetics.equipped);
const buff = { tip: 1, speed: 1, t: 0, label: '' };
const tipMultiplier = (nearPerformer: boolean) => (1 + swag() * 0.18) * (buzzTimer > 0 ? 1.5 : 1) * (nearPerformer ? 1.3 : 1) * (buff.t > 0 ? buff.tip : 1);

// ---------------------------------------------------------------- HUD
function updateHUD(): void {
  cashEl.textContent = `$${S.cash.toLocaleString()}`;
  stashEl.textContent = String(S.cigStash);
  swagEl.textContent = `${swag()}${buzzTimer > 0 ? ' 🍹' : ''}${buff.t > 0 ? ` ${buff.label}${Math.ceil(buff.t)}s` : ''}`;
  if (S.deviceMode === 'cig') {
    deviceLabelEl.textContent = 'Cig Lit';
    deviceValueEl.textContent = S.isLit ? `${Math.ceil(S.cigBurn)}%` : 'OUT';
    btnDevice.innerHTML = 'Mode: Cig <kbd>V</kbd>';
  } else {
    deviceLabelEl.textContent = S.vapeFlavor;
    deviceValueEl.textContent = `${Math.ceil(S.vapeJuice)}%`;
    btnDevice.innerHTML = 'Mode: Vape <kbd>V</kbd>';
  }
  for (const m of cigMeshes) m.visible = S.deviceMode === 'cig' && S.isLit;
  for (const m of vapeMeshes) m.visible = S.deviceMode === 'vape' && S.hasVapeMod;
}

function showToast(msg: string, ms = 2800): void {
  toastEl.textContent = msg;
  toastEl.classList.add('is-visible');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toastEl.classList.remove('is-visible'), ms);
}

function save(): void {
  if (!started) return;
  if (!riding) {
    S.position = [catHolder.position.x, Math.max(0.2, catHolder.position.y), catHolder.position.z];
    S.yaw = catYaw;
  }
  S.timePreset = world.getTimePreset();
  localSaveBackend.save(S);
}

const goals = new GoalTracker((g) => {
  sfx.playJackpot();
  showToast(`🏆 Goal complete: ${g.title}! +$${g.reward}`, 3600);
  updateHUD();
});
goals.render(S);

// ---------------------------------------------------------------- shops & casinos
const casino = new CasinoController(sfx, {
  getCash: () => S.cash,
  setCash: (n) => {
    S.cash = n;
    updateHUD();
  },
  onOutcome: (msg) => showToast(msg),
  recordResult: (game, net, vipTable, casinoName) => {
    if (game === 'slots') emit('slots-spin', { casino: casinoName });
    if (net > 0) {
      emit('casino-win', { amount: net, vip: vipTable, game });
      if (game === 'blackjack') emit('blackjack-win', {});
      S.stats.casinoWon += net;
      S.stats.biggestWin = Math.max(S.stats.biggestWin, net);
      if (game === 'blackjack') S.stats.blackjackWins += 1;
      if (game === 'craps') S.stats.crapsWins += 1;
    } else if (net < 0) {
      S.stats.casinoLost += -net;
    }
    goals.check(S);
    save();
  },
  isVip: () => S.vip,
});

const WEARABLES = new Set(['trucker-hat', 'lei', 'cheap-shades', 'bandana']);
const COLLECTIBLES = new Set(['shot-glass', 'snow-globe', 'magnet', 'cards']);
function addCigs(count: number): void {
  S.cigStash += count;
  if (!S.isLit && S.cigStash > 0) {
    S.cigStash -= 1;
    S.isLit = true;
    S.cigBurn = 100;
  }
}
function applyAbcItem(item: AbcItem): { ok: boolean; msg: string } {
  const id = item.id;
  if (id === 'pack' || id === 'carton' || id === 'cigarillo') {
    addCigs(id === 'pack' ? 20 : id === 'carton' ? 200 : 5);
    if (id === 'carton') S.stats.cartonsBought += 1;
    S.deviceMode = 'cig';
    emit('abc-buy', { id });
    return { ok: true, msg: id === 'carton' ? 'A whole carton. Lou cradles it like a newborn. (+200)' : id === 'pack' ? 'Pack secured. (+20 smokes)' : 'Cigarillos. Fancy. (+5)' };
  }
  if (id === 'lighter') return { ok: true, msg: 'Lighter #7 acquired. Lou now has a lighter for every day of the week.' };
  if (id === 'mod') {
    if (S.hasVapeMod) return { ok: false, msg: 'Lou already has the Neon Mod. Grab pods instead.' };
    S.hasVapeMod = true;
    S.vapeJuice = 100;
    S.deviceMode = 'vape';
    emit('abc-buy', { id });
    return { ok: true, msg: 'Neon Sub-Ohm Mod! Hold [E] for huge clouds, [1–4] for tricks.' };
  }
  if (id.startsWith('pod:') || id === 'disposable') {
    if (!S.hasVapeMod && id !== 'disposable') return { ok: false, msg: 'Pods need the Neon Mod first ($35).' };
    S.hasVapeMod = true;
    S.vapeFlavor = id === 'disposable' ? 'Watermelon Ice' : (id.slice(4) as GameState['vapeFlavor']);
    S.vapeJuice = 100;
    S.deviceMode = 'vape';
    emit('abc-buy', { id });
    return { ok: true, msg: `${S.vapeFlavor} loaded. Juice 100%.` };
  }
  if (id === 'coil') {
    if (S.upgrades.includes('coil')) return { ok: false, msg: 'The Cloud Beast Coil is already installed.' };
    S.upgrades.push('coil');
    return { ok: true, msg: 'Cloud Beast Coil installed. Every rip is ~35% bigger. The fire marshal has been notified.' };
  }
  if (id === 'nuts') {
    buff.speed = Math.max(buff.speed, 1.2);
    buff.t = Math.max(buff.t, 90);
    buff.label = '🥜';
    return { ok: true, msg: 'Macadamia power. Sprint +20% for 90 s.' };
  }
  if (id === 'energy') {
    buff.speed = 1.3;
    buff.t = Math.max(buff.t, 60);
    buff.label = '⚡';
    return { ok: true, msg: 'ZOOMIES. +30% speed for 60 s.' };
  }
  if (id === 'musubi') {
    buff.tip = Math.max(buff.tip, 1.15);
    buff.t = Math.max(buff.t, 90);
    buff.label = '🍙';
    return { ok: true, msg: 'Spam musubi. Tourists find Lou 15% more charming for 90 s.' };
  }
  if (id === 'beer') {
    buzzTimer = 60;
    return { ok: true, msg: '24 oz of liquid courage. Tips +50% for 60 s.' };
  }
  if (id === 'cheetos') {
    degen.add(15, 'Orange Paws');
    return { ok: true, msg: 'Lou’s paws are now permanently orange. Worth it.' };
  }
  if (id === 'water') return { ok: true, msg: 'Lou stares at the water. The water stares back. He does not drink it.' };
  if (WEARABLES.has(id)) {
    const cid = id as CosmeticId;
    const owned = S.cosmetics.owned.includes(cid);
    let equipped = S.cosmetics.equipped.filter((e) => e !== cid);
    const def = cosmeticById(cid);
    if (!S.cosmetics.equipped.includes(cid)) {
      equipped = equipped.filter((e) => cosmeticById(e).slot !== def.slot);
      equipped.push(cid);
    }
    S.cosmetics = { owned: owned ? S.cosmetics.owned : [...S.cosmetics.owned, cid], equipped };
    wardrobe?.apply(equipped);
    goals.check(S);
    return { ok: true, msg: equipped.includes(cid) ? `Wearing the ${def.name}. Swag ${swag()}.` : `Took off the ${def.name}.` };
  }
  if (COLLECTIBLES.has(id)) {
    S.collectibles.push(id);
    degen.add(10, 'Souvenir Hoarder');
    return { ok: true, msg: `${item.name} added to the collection (${S.collectibles.length} souvenirs).` };
  }
  if (id === 'charger') {
    degen.add(40, 'Peak Degen Purchase');
    return { ok: true, msg: 'Lou bought a phone charger. Lou does not own a phone.' };
  }
  return { ok: true, msg: `${item.name}: ${item.desc}` };
}
const abcShop = new AbcShopController(sfx, {
  getCash: () => S.cash,
  setCash: (n) => {
    S.cash = n;
    updateHUD();
    save();
  },
  apply: (item) => {
    const r = applyAbcItem(item);
    updateHUD();
    return r;
  },
  owns: (id) => (WEARABLES.has(id) && S.cosmetics.owned.includes(id as CosmeticId)) || (id === 'coil' && S.upgrades.includes('coil')) || (id === 'mod' && S.hasVapeMod),
  onOutcome: (msg) => showToast(msg),
});

const boutique = new BoutiqueController(sfx, {
  getCash: () => S.cash,
  setCash: (n) => {
    S.cash = n;
    updateHUD();
  },
  getOwned: () => S.cosmetics.owned,
  getEquipped: () => S.cosmetics.equipped,
  setOwnedEquipped: (owned, equipped) => {
    S.cosmetics = { owned, equipped };
    wardrobe?.apply(equipped);
    if (wanted.stars > 0) {
      wanted.lose(2);
      showToast('New look! Animal Control lost your description (-2 stars).');
    }
    goals.check(S);
    updateHUD();
    save();
  },
  onOutcome: (msg) => showToast(msg),
});

const restaurants = new RestaurantSystem(scene, crowd, world.restaurants, {
  getCash: () => S.cash,
  spend: (n) => {
    S.cash -= n;
    updateHUD();
  },
  toast: (msg, ms) => showToast(msg, ms),
  onAte: (place, item) => {
    S.stats.burgersEaten += 1;
    buff.tip = item.tipBoost;
    buff.speed = item.speedBoost;
    buff.t = item.minutes * 60;
    buff.label = place.kind === 'innout' ? '🍔' : '🟠';
    emit('burger-eaten', { kind: place.kind });
    if (place.kind === 'innout') {
      degen.add(100, 'Double-Double Down');
      sfx.playJackpot();
      showToast(`Lou demolished the ${item.name}. Burger buff: tips ×${item.tipBoost}, sprint +${Math.round((item.speedBoost - 1) * 100)}% for ${item.minutes} min.`, 4200);
    } else {
      degen.add(20, 'Whataburger… Done');
      showToast(`Lou ate the ${item.name}. It was… fine. Tips ×${item.tipBoost} for ${item.minutes} min.`, 4000);
    }
    goals.check(S);
    updateHUD();
    save();
  },
  onKicked: () => {
    S.stats.tablesLost += 1;
    degen.add(30, 'Booted From In-N-Out');
    sfx.playBusted();
    startRagdoll(new THREE.Vector3(Math.sin(catYaw + Math.PI) * 4, 4.5, Math.cos(catYaw + Math.PI) * 4));
  },
  onTableWon: () => {
    degen.add(75, 'Table Secured');
    emit('table-won', {});
  },
  sfxCash: () => sfx.playCash(),
  sfxBad: () => sfx.playBusted(),
});
const anyDialogOpen = () => casino.isOpen() || abcShop.isOpen() || boutique.isOpen() || restaurants.isOpen() || menuOpen();

// ---------------------------------------------------------------- chaos: score + wanted level
const degen = new DegenScore(
  () => S.stats.degenPoints,
  (n) => {
    S.stats.degenPoints = n;
  },
  (rank) => {
    sfx.playJackpot();
    showToast(`New Degen rank: ${rank}!`, 3600);
  }
);
const wanted = new WantedSystem(scene, crowd, STRIP.laneCenters, {
  onBusted: (by) => impound(by.kind),
  onEscaped: (stars) => {
    S.stats.wantedEscapes += 1;
    emit('wanted-escaped', { stars });
    degen.add(150 * stars, `Shook ${stars} star heat`);
    sfx.playSteal();
    showToast(stars >= 3 ? 'Animal Control lost the trail. They are telling everyone it was a raccoon.' : 'Animal Control gave up. Lou is a free cat again.');
    goals.check(S);
    save();
  },
  onStarsChanged: (n) => {
    S.stats.maxStars = Math.max(S.stats.maxStars, n);
  },
});
const intro = new IntroComic();
const missions = new MissionManager(
  scene,
  () => S,
  (m) => {
    S.cash += m.reward.cash;
    degen.add(m.reward.points, 'MISSION PASSED');
    sfx.playJackpot();
    showToast(`MISSION PASSED: ${m.title} — +$${m.reward.cash}`, 4200);
    updateHUD();
    goals.check(S);
    save();
  },
  (msg) => showToast(msg, 3600)
);
function missionCtx(): MissionCtx {
  return { state: S, catPos: catHolder.position, driving: driving.active, stars: wanted.stars, cigLit: S.deviceMode === 'cig' && S.isLit };
}
function emit(event: MissionEvent, data: Record<string, unknown> = {}): void {
  missions.emit(event, data, missionCtx());
}

function crime(amount: number): void {
  const before = wanted.stars;
  wanted.crime(amount);
  if (wanted.stars > before && before === 0) showToast('Clark County Animal Control has been called. Run, Lou!');
  else if (wanted.stars > before && wanted.stars === 4) showToast('Metro Police joined the chase!');
  else if (wanted.stars > before && wanted.stars === 5) showToast('They sent a HELICOPTER. For a cat.');
}
function impound(kind: 'ac' | 'cop'): void {
  const bail = Math.min(S.cash, Math.max(25, Math.floor(S.cash * 0.3)));
  const lost = Math.min(S.cigStash, 8);
  S.cash -= bail;
  S.cigStash -= lost;
  wanted.clearAll();
  if (riding) exitRide();
  if (driving.active) exitCar();
  endRagdoll();
  catHolder.position.copy(world.resetPoint);
  catVelocity.set(0, 0, 0);
  sfx.playBusted();
  showToast(
    kind === 'cop'
      ? `BUSTED by Metro. Lou spent the night at the Clark County Animal Shelter. Bail: $${bail}, ${lost} smokes confiscated.`
      : `Caught in the catch-pole! Animal Control impounded Lou. A volunteer paid $${bail} bail and kept ${lost} of your smokes.`,
    5200
  );
  updateHUD();
  save();
}

function startRagdoll(launch?: THREE.Vector3): void {
  if (riding) return;
  rag.active = true;
  rag.t = 0;
  if (launch) catVelocity.copy(launch);
  rag.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14);
  isGrounded = false;
}
function endRagdoll(): void {
  if (!rag.active) return;
  rag.active = false;
  catModel?.rotation.set(0, 0, 0);
}

function triggerPounce(): void {
  if (riding || rag.active || !isGrounded) return;
  pounceTimer = 0.6;
  catVelocity.x = Math.sin(catYaw) * 10.5;
  catVelocity.z = Math.cos(catYaw) * 10.5;
  catVelocity.y = 4.4;
  isGrounded = false;
  // the physics launches him now, so the clip starts at its leap (past the crouch and butt wiggle)
  motion.play(actions.Pounce ?? actions.Steal, 0.6, actions.Pounce ? 0.34 : 0);
  sfx.playMeow();
}

/** While pouncing (or ragdolling at speed) bowl over anyone in the way. */
function pounceHits(): void {
  const p = catHolder.position;
  for (const npc of crowd.allPeople()) {
    if (npc.knock) continue;
    const dx = npc.mesh.position.x - p.x;
    const dz = npc.mesh.position.z - p.z;
    if (dx * dx + dz * dz > 1.5 || p.y > 1.6) continue;
    crowd.knockdown(npc, dx, dz, 5.5);
    S.stats.knockdowns += 1;
    emit('knockdown', {});
    sfx.playBusted();
    if ('casinoName' in npc) {
      degen.add(120, 'Security Takedown');
      crime(0.9);
      crowd.say(npc, 'OOF! Assault by feline!', 2.2);
    } else if ('kind' in npc && (npc.kind === 'ac' || npc.kind === 'cop')) {
      degen.add(200, npc.kind === 'ac' ? 'Catch-Pole Denied' : 'Cop Bowling');
      crime(1.0);
    } else {
      degen.add(50, 'Tourist Bowling');
      crime(0.45);
      const lines = ['MY YARD DRINK!', 'Was that a CAT?!', 'I am calling Animal Control!', 'Ow! Vegas is wild...', 'He took my dignity!'];
      crowd.say(npc, lines[Math.floor(Math.random() * lines.length)], 2.6);
      if (Math.random() < 0.4) {
        const drop = 5 + Math.floor(Math.random() * 4) * 5;
        S.cash += drop;
        sfx.playCash();
        showToast(`They dropped $${drop}. Finders keepers.`);
      }
    }
  }
}

// ---------------------------------------------------------------- cat model
// Lou's clips, blends, gait, lean, jumps and idle life live in catMotion.ts.
const motion = new CatMotion();
const actions = motion.actions;
let cigTipObj: THREE.Object3D | null = null;
let vapeTipObj: THREE.Object3D | null = null;
let cigEmberMat: THREE.MeshStandardMaterial | null = null;
// A small, soft glow: enough to light the smoke and the pavement under his chin, not to dye Lou orange.
const emberLight = new THREE.PointLight(0xff8a3c, 0.4, 1.5, 2.0);
scene.add(emberLight);

function playOneShot(act: THREE.AnimationAction | null, lockSeconds: number): void {
  motion.play(act, lockSeconds);
}

function getTipWorld(preferVape: boolean, out = new THREE.Vector3()): THREE.Vector3 {
  const obj = preferVape ? vapeTipObj : cigTipObj;
  if (obj) return obj.getWorldPosition(out);
  return out.set(0.08, 0.48, 0.44).applyAxisAngle(THREE.Object3D.DEFAULT_UP, catYaw).add(catHolder.position);
}

// Lou's model is Draco-compressed with WebP textures. loading.ts started downloading it (content-hashed URL,
// a lighter one on phones) before the Strip was built.
let catLook: CatLook | null = null;
loadLou().then(
  async (gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(1.35);
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (m?.name === 'CigEmber') cigEmberMat = m;
        if (mesh.name.startsWith('Cig')) cigMeshes.push(mesh);
        if (mesh.name.startsWith('Vape')) vapeMeshes.push(mesh);
      }
      if (child.name === 'CigTip') cigTipObj = child;
      if (child.name === 'VapeTip') vapeTipObj = child;
    });
    catHolder.add(model);
    catModel = model;
    // shell fur, matte coat, wet eyes with light-following pupils, blinks/twitches/glances
    catLook = new CatLook(model);
    restaurants.burger.position.set(0, 0.68, 0.58);
    catHolder.add(restaurants.burger);
    wardrobe = new CatWardrobe(model);
    wardrobe.apply(S.cosmetics.equipped);
    motion.attach(model, gltf.animations);
    updateHUD();
    // Lou's shaders compile in the background too, and the Strip's must be done: no stall on the first frames.
    await warmLou(renderer, model, camera, drawTarget(), scene);
    loadingDone();
    titleLoading.textContent = 'Ready. Tip: tourists pay more when your Swag is up.';
    btnNewGame.disabled = false;
    btnContinue.disabled = false;
  },
  (err) => {
    console.error('Failed to load tabby_cat.glb:', err);
    titleLoading.textContent = 'Could not load the cat model — check public/models/tabby_cat.glb';
  }
);

// ---------------------------------------------------------------- title screen
if (saved) {
  btnContinue.hidden = false;
  const zone = world.getZoneName(S.position[0], S.position[2]);
  titleSaveInfo.hidden = false;
  titleSaveInfo.textContent = `Saved hustle: $${S.cash.toLocaleString()} • ${S.cigStash} smokes • ${S.goalsDone.length} goals • last seen at ${zone}`;
}
btnNewGame.disabled = true;
btnContinue.disabled = true;

function startGame(fresh: boolean): void {
  if (fresh) {
    missions.abandon();
    localSaveBackend.clear();
    S = defaultState();
    catHolder.position.copy(world.spawn);
    catYaw = world.spawnYaw;
    camYaw = 0;
    world.setTimePreset('night');
    S.timePreset = 'night';
    S.position = [world.spawn.x, world.spawn.y, world.spawn.z];
    S.yaw = world.spawnYaw;
    wardrobe?.apply([]);
    goals.render(S);
  }
  missions.refreshMarkers();
  started = true;
  titleScreen.hidden = true;
  sfx.playBusBell();
  updateHUD();
  updateMoodButton();
  showToast(fresh ? 'Welcome to the Strip! Beg [B], steal [Q], smoke [E], ride [G], gamble & shop [F].' : 'Back on the Strip. The hustle never sleeps.', 4200);
  save();
}
btnNewGame.addEventListener('click', async () => {
  titleScreen.hidden = true;
  await intro.play();
  startGame(true);
});
btnContinue.addEventListener('click', () => startGame(false));
btnResetSave.addEventListener('click', () => {
  if (!window.confirm('Start over? This erases your saved cash, smokes, swag and goals.')) return;
  startGame(true);
  $('controls-popover').hidePopover();
});

// ---------------------------------------------------------------- actions
function toggleDevice(): void {
  if (S.deviceMode === 'cig') {
    if (!S.hasVapeMod) return showToast('Buy a Neon Vape Mod at ABC Stores first!');
    S.deviceMode = 'vape';
    showToast(`Switched to Neon Vape (${S.vapeFlavor})`);
  } else {
    S.deviceMode = 'cig';
    showToast('Switched to cigarettes');
  }
  updateHUD();
}

const TRICKS: Record<VapeTrick, { name: string; points: number }> = {
  orings: { name: 'O-Ring Barrage', points: 50 },
  french: { name: 'French Inhale', points: 60 },
  ghost: { name: 'The Ghost', points: 80 },
  tornado: { name: 'Vape Tornado', points: 110 },
};

function vapeTrick(trick: VapeTrick): void {
  if (S.deviceMode !== 'vape' || trickCooldown > 0) return;
  if (S.vapeJuice < 4) return showToast('Not enough juice for tricks. Pods at ABC Stores.');
  S.vapeJuice -= 4;
  trickCooldown = 1.4;
  S.stats.vapeTricks += 1;
  emit('vape-trick', { trick });
  sfx.playVapeRip();
  playOneShot(actions.VapeRip ?? actions.Puff, 1.1);
  const mouth = getTipWorld(true);
  const forward = new THREE.Vector3(Math.sin(catYaw), 0.1, Math.cos(catYaw)).normalize();
  smokeSystem.spawnTrick(trick, mouth, forward, S.vapeFlavor);
  degen.add(TRICKS[trick].points, TRICKS[trick].name);
  const reaction = crowd.reactToCloud(catHolder.position, tipMultiplier(false) * 1.5);
  if (reaction.tips > 0) {
    S.cash += reaction.tips;
    S.stats.tipsEarned += reaction.tips;
    S.stats.cloudsCheered += reaction.cheers;
    sfx.playCash();
  }
  showToast(`${TRICKS[trick].name}!${reaction.tips ? ` The crowd tipped $${reaction.tips}.` : ''}`);
  goals.check(S);
  updateHUD();
}

/** Vape: hold E to charge a bigger rip; release to exhale. Too long = dry hit. */
function releaseVapeCharge(): void {
  if (vapeChargeStart < 0) return;
  const held = elapsed - vapeChargeStart;
  vapeChargeStart = -1;
  if (held > 3.2) {
    S.vapeJuice = Math.max(0, S.vapeJuice - 3);
    sfx.playMeow();
    window.setTimeout(() => sfx.playMeow(), 220);
    degen.add(5, 'Dry Hit');
    showToast('DRY HIT. *cough cough hack* Lou sees colors.');
    playOneShot(actions.Beg ?? actions.Puff, 1);
    return;
  }
  triggerSmokeOrVape(THREE.MathUtils.clamp(held / 1.1, 0.35, 2.4));
}

function triggerSmokeOrVape(power = 1): void {
  if (S.deviceMode === 'vape') {
    if (S.vapeJuice <= 0) {
      sfx.playMeow();
      return showToast('Pod empty! Flavor pods at ABC Stores (Miracle Mile) [F].');
    }
    S.vapeJuice = Math.max(0, S.vapeJuice - (4 + power * 3));
    S.stats.vapeRips += 1;
    puffTimer = 1.4 + power * 0.4;
    idleAutoPuffTimer = 7 + Math.random() * 4;
    sfx.playVapeRip();
    playOneShot(actions.VapeRip ?? actions.Puff, 1.3);
    const tip = getTipWorld(true);
    const forward = new THREE.Vector3(Math.sin(catYaw), 0.16, Math.cos(catYaw)).normalize();
    if (S.upgrades.includes('coil')) power *= 1.35;
    smokeSystem.spawnVapeCloud(tip, forward, S.vapeFlavor, catVelocity, power);
    // Thick clouds are a smoke screen: Animal Control loses sight of Lou inside
    wanted.addCloud(catHolder.position.x + forward.x * 1.2, catHolder.position.z + forward.z * 1.2, 1.4 + power * 1.7, 3 + power * 2.5);
    if (power > 1.6) {
      S.stats.bigClouds += 1;
      degen.add(Math.round(40 * power), 'Cloud Chaser');
    }
    const reaction = crowd.reactToCloud(catHolder.position, tipMultiplier(false) * (0.7 + power * 0.4));
    if (reaction.tips > 0) {
      S.cash += reaction.tips;
      S.stats.tipsEarned += reaction.tips;
      S.stats.cloudsCheered += reaction.cheers;
      sfx.playCash();
      showToast(`Cloud chasers! ${reaction.cheers} tourist${reaction.cheers > 1 ? 's' : ''} tipped $${reaction.tips}`);
      goals.check(S);
    }
    updateHUD();
    return;
  }

  if (!S.isLit) {
    if (S.cigStash > 0) {
      S.cigStash -= 1;
      S.isLit = true;
      S.cigBurn = 100;
      sfx.playPuff();
      showToast('Lit a fresh one from the stash.');
    } else {
      sfx.playMeow();
      return showToast('Out of smokes! Steal [Q] or buy a pack at ABC Stores.');
    }
  }
  puffTimer = 1.4;
  idleAutoPuffTimer = 6 + Math.random() * 4;
  S.cigBurn = Math.max(0, S.cigBurn - 12);
  emit('smoke', {});
  sfx.playPuff();
  playOneShot(actions.Puff, 1.0);
  const tipWorld = getTipWorld(false);
  const forward = new THREE.Vector3(Math.sin(catYaw), 0.12, Math.cos(catYaw)).normalize();
  smokeSystem.spawnExhaleBurst(tipWorld, forward);
  if (S.cigBurn <= 0) finishCig();
  updateHUD();
}

function finishCig(): void {
  S.stats.cigsSmoked += 1;
  if (S.cigStash > 0) {
    S.cigStash -= 1;
    S.cigBurn = 100;
    showToast(`Finished cig #${S.stats.cigsSmoked} — lit another.`);
  } else {
    S.isLit = false;
    S.cigBurn = 0;
    showToast(`Finished cig #${S.stats.cigsSmoked}. That was your last one.`);
  }
  goals.check(S);
}

let danceCooldown = 0;
function triggerDance(): void {
  if (riding || driving.active || rag.active || restaurants.cat.state === 'eating') return;
  motion.resetIdle();
  playOneShot(actions.Dance ?? actions.Beg, 3);
  if (actions.Dance) {
    actions.Dance.setLoop(THREE.LoopRepeat, 3);
    actions.Dance.timeScale = 1.1;
  }
  sfx.playMeow();
  if (danceCooldown > 0) return;
  danceCooldown = 4;
  const reaction = crowd.reactToDance(catHolder.position, tipMultiplier(false));
  degen.add(reaction.cheers ? 20 + reaction.cheers * 10 : 5, reaction.cheers ? 'Sidewalk Showcat' : 'Dancing Alone');
  if (reaction.tips > 0) {
    S.cash += reaction.tips;
    S.stats.tipsEarned += reaction.tips;
    sfx.playCash();
    showToast(`Lou busts a move. The crowd tipped $${reaction.tips}.`);
  } else showToast(reaction.cheers ? 'Lou busts a move.' : 'Lou dances for nobody. Pure art.');
  goals.check(S);
  updateHUD();
}

function triggerBeg(): void {
  sfx.playMeow();
  playOneShot(actions.Beg, 1.35);
  if (/Welcome to Fabulous/.test(world.getZoneName(catHolder.position.x, catHolder.position.z))) {
    emit('photo-sign', {});
    if (!S.collectibles.includes('welcome-photo')) {
      S.collectibles.push('welcome-photo');
      degen.add(100, 'Welcome Sign Selfie');
      showToast('📸 Lou poses in front of the Welcome to Fabulous Las Vegas sign. Iconic.');
    }
  }
  S.stats.begs += 1;
  const performer = crowd.nearestPerformer(catHolder.position, 9);
  const mult = tipMultiplier(!!performer);

  let closest = null as (typeof crowd.tourists)[number] | null;
  let bestD = 4.6;
  for (const t of crowd.tourists) {
    if (!t.mesh.visible) continue;
    const d = t.mesh.position.distanceTo(catHolder.position);
    if (d < bestD) {
      bestD = d;
      closest = t;
    }
  }

  if (!closest) {
    if (performer && performerTipCooldown <= 0) {
      performerTipCooldown = 25;
      if (performer.kind === 'slapper') {
        crowd.showPerformerSpeech(performer, '*slap* Here kitty, VIP club card!', 2.6);
        showToast('The card slapper hands you a promo card. Useless… but you look connected.');
      } else {
        const cut = Math.round(5 * mult);
        S.cash += cut;
        S.stats.tipsEarned += cut;
        emit('tip', { amount: cut });
        sfx.playCash();
        crowd.showPerformerSpeech(performer, performer.kind === 'elvis' ? `Thank you very much! Here's your cut: $${cut}` : `Cute! Split the photo tips: $${cut}`, 3);
        showToast(`Worked the crowd with the ${performer.kind === 'elvis' ? 'Elvis' : 'showgirl'} — +$${cut}`);
        goals.check(S);
      }
      updateHUD();
      return;
    }
    showToast('Meow! Get close to tourists to hustle [B]. Performers draw bigger crowds.');
    return;
  }
  if (closest.begCooldown > 0) {
    crowd.showTouristSpeech(closest, 'Already tipped you, kitty!', 2.2);
    return;
  }
  closest.begCooldown = 18;
  closest.lookAtCat = 1.8;
  const roll = Math.random();
  if (closest.hasCamera && roll < 0.75) {
    const tip = Math.round((10 + Math.floor(Math.random() * 3) * 5) * mult);
    S.cash += tip;
    S.stats.tipsEarned += tip;
    S.stats.photoOps += 1;
    emit('tip', { amount: tip });
    sfx.playCash();
    crowd.showTouristSpeech(closest, `Selfie with the smoking cat! +$${tip}`, 3.2);
    showToast(`📸 Photo op! +$${tip}`);
  } else if (roll < 0.62 + Math.min(0.2, swag() * 0.03)) {
    const tip = Math.round([5, 10, 15, 20][Math.floor(Math.random() * 4)] * mult);
    S.cash += tip;
    S.stats.tipsEarned += tip;
    emit('tip', { amount: tip });
    sfx.playCash();
    crowd.showTouristSpeech(closest, `OMG a smoking cat! +$${tip}`, 3.2);
    showToast(`Tourist tipped $${tip}${mult > 1.01 ? ` (×${mult.toFixed(1)} swag)` : ''}`);
  } else if (roll < 0.84) {
    S.cigStash += 1;
    sfx.playSteal();
    crowd.showTouristSpeech(closest, 'Respect the hustle. +1 cig', 3.2);
    showToast('Tourist gave you a spare smoke (+1)');
  } else {
    crowd.showTouristSpeech(closest, ['Lost it all at the craps table…', 'Tipping is voluntary, kitty!', 'I only have chips, sorry'][Math.floor(Math.random() * 3)], 2.6);
  }
  goals.check(S);
  updateHUD();
}

function inCasinoFloor(): boolean {
  return /Casino$/.test(world.getZoneName(catHolder.position.x, catHolder.position.z)) || world.getZoneName(catHolder.position.x, catHolder.position.z) === 'VIP High-Roller Lounge';
}

function triggerSteal(): void {
  playOneShot(actions.Steal, 0.75);
  const insideCasino = inCasinoFloor();

  const stolen = (amount: number, label: string) => {
    S.cigStash += amount;
    S.stats.steals += 1;
    if (insideCasino) S.stats.casinoSteals += 1;
    degen.add(insideCasino ? 60 : 25, insideCasino ? 'Casino Heist' : 'Five-Finger Discount');
    if (Math.random() < (insideCasino ? 0.5 : 0.3)) crime(insideCasino ? 0.6 : 0.4);
    if (!S.isLit) {
      S.cigStash -= 1;
      S.isLit = true;
      S.cigBurn = 100;
    }
    sfx.playSteal();
    showToast(`Swiped ${label}! (+${amount})`);
    if (insideCasino) {
      const alerted = crowd.alertGuards(catHolder.position, 16);
      if (alerted.length) {
        sfx.playBusted();
        showToast(`${alerted[0].casinoName} Security spotted you! RUN — sprint [Shift] out the doors!`, 3600);
      }
    }
    goals.check(S);
    updateHUD();
  };

  for (const p of world.cigPickups) {
    if (p.stolenCooldown > 0) continue;
    if (p.position.distanceTo(catHolder.position) < 3.2) {
      p.stolenCooldown = 45;
      p.mesh.visible = false;
      return stolen(p.amount, p.label);
    }
  }
  for (const t of crowd.tourists) {
    if (!t.hasCig || t.cigStolen) continue;
    if (t.mesh.position.distanceTo(catHolder.position) < 3.4) {
      t.cigStolen = true;
      if (t.cigMesh) t.cigMesh.visible = false;
      crowd.showTouristSpeech(t, 'Hey! That cat took my cig!', 3.0);
      return stolen(1, "a tourist's lit cig");
    }
  }
  showToast('Nothing to swipe here. Look for glowing red packs, ash urns and smokers.');
}

function nearestRideable(): Rideable | null {
  let best: Rideable | null = null;
  let bestD = Infinity;
  for (const r of world.rideables) {
    r.boardPoint(tmpV);
    const d = tmpV.distanceTo(catHolder.position);
    if (d < r.boardRadius && d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

function nearestDeuceStop() {
  for (const s of world.deuceStops) {
    const x = s.side * (STRIP.curb + 3.2);
    if (Math.hypot(catHolder.position.x - x, catHolder.position.z - s.z) < 5) return s;
  }
  return null;
}

function deuceEta(stop: { z: number; side: 1 | -1 }): string {
  const dir = stop.side < 0 ? 1 : -1;
  let best = Infinity;
  for (const bus of world.deuceBuses) {
    if (bus.dir !== dir) continue;
    const d = (stop.z - bus.mesh.position.z) * dir;
    const loop = STRIP.south - STRIP.north;
    const dist = d >= 0 ? d : d + loop;
    best = Math.min(best, dist);
  }
  return best < Infinity ? `Next Deuce in ~${Math.max(3, Math.round(best / 7))}s.` : '';
}

/** Board automatically when the bus we're waiting for pulls in (or we land on its roof). */
function deuceAutoBoard(): void {
  if (riding || driving.active) return;
  const p = catHolder.position;
  world.deuceBuses.forEach((bus, i) => {
    if (riding) return;
    const dx = Math.abs(p.x - bus.mesh.position.x);
    const dz = Math.abs(p.z - bus.mesh.position.z);
    const onRoof = p.y > 3.4 && dx < 1.5 && dz < bus.halfLen;
    const arrived = waitingStop && bus.stopTimer > 0 && Math.abs(bus.mesh.position.z - waitingStop.z) < 1.5 && Math.sign(bus.laneX) === waitingStop.side;
    if (!onRoof && !arrived) return;
    const ride = world.rideables.find((r) => r.id === `deuce-${i}`);
    if (!ride) return;
    riding = ride;
    waitingStop = null;
    S.stats.deuceRides += 1;
    btnBus.innerHTML = 'Hop off <kbd>G</kbd>';
    sfx.playBusBell();
    showToast(onRoof ? 'Landed on THE DEUCE. Lou climbs in through the roof hatch.' : 'THE DEUCE pulled in. Lou boards and takes the front seat upstairs.');
    goals.check(S);
  });
  if (waitingStop) {
    const x = waitingStop.side * (STRIP.curb + 3.2);
    if (Math.hypot(p.x - x, p.z - waitingStop.z) > 7) waitingStop = null;
  }
}

function exitRide(msg?: string): void {
  if (!riding) return;
  const r = riding;
  r.exitPoint(tmpV);
  catHolder.position.copy(tmpV);
  catVelocity.set(0, 0, 0);
  riding = null;
  r.onExit?.();
  btnBus.innerHTML = 'Ride <kbd>G</kbd>';
  sfx.playBusBell();
  showToast(msg ?? r.exitMessage?.() ?? `Hopped off ${r.label}.`, r.kind === 'rideshare' ? 4200 : undefined);
}

function enterCar(car: (typeof world.trafficVehicles)[number]): void {
  driving.enter(car);
  S.stats.carsStolen += 1;
  crime(1.6);
  emit('car-stolen', {});
  degen.add(150, 'Grand Theft Auto-Cat');
  const side = new THREE.Vector3(Math.cos(car.mesh.rotation.y), 0, -Math.sin(car.mesh.rotation.y));
  const out = car.mesh.position.clone().addScaledVector(side, 2.2);
  crowd.spawnBystander(out.x, out.z, out.x + side.x * 8, out.z + side.z * 8, DRIVER_LINES[Math.floor(Math.random() * DRIVER_LINES.length)], [side.x, side.z]);
  btnBus.innerHTML = 'Exit car <kbd>G</kbd>';
  sfx.playCrash();
  sfx.startEngine();
  showToast('Lou yanked the driver out. W/S gas & brake, A/D steer, Space handbrake, H honk, G to bail.', 4200);
  goals.check(S);
}

function exitCar(): void {
  driving.exit(tmpV);
  catHolder.position.copy(tmpV);
  catVelocity.set(0, 0, 0);
  sfx.stopEngine();
  btnBus.innerHTML = 'Ride <kbd>G</kbd>';
  showToast('Lou ditched the car. Somebody else can explain the scratches.');
}

function toggleRide(): void {
  if (restaurants.cat.state === 'eating') return restaurants.getUp();
  if (driving.active) return exitCar();
  if (riding) return exitRide();
  if (!nearestRideable()) {
    const stop = nearestDeuceStop();
    if (stop) {
      waitingStop = stop;
      showToast(`Waiting at the ${stop.name} stop. ${deuceEta(stop)}`);
      return;
    }
    const car = driving.nearestCar(world.trafficVehicles, catHolder.position);
    if (car) return enterCar(car);
  }
  const r = nearestRideable();
  if (!r) return showToast('Nothing to ride here. Deuce stops, the High Roller, the Eiffel elevator and Venetian gondolas all take [G].');
  const can = r.canBoard();
  if (!can.ok) return showToast(can.reason ?? 'Not right now.');
  riding = r;
  r.onBoard?.();
  catVelocity.set(0, 0, 0);
  if (r.kind === 'deuce') S.stats.deuceRides += 1;
  if (r.kind === 'highroller') S.stats.highRollerRides += 1;
  if (r.kind === 'gondola') S.stats.gondolaRides += 1;
  btnBus.innerHTML = 'Hop off <kbd>G</kbd>';
  sfx.playBusBell();
  showToast(`Boarded ${r.label}!`);
  goals.check(S);
}

function nearestShop() {
  for (const s of world.shopSpots) if (s.position.distanceTo(catHolder.position) < s.radius) return s;
  return null;
}
function nearestGame() {
  let best = null as (typeof world.gamblingSpots)[number] | null;
  let bestD = 3.4;
  for (const g of world.gamblingSpots) {
    const d = g.position.distanceTo(catHolder.position);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

function vipProgress(): string {
  return `$${Math.min(500, S.stats.casinoWon)}/$500 won at the tables, or ${swag()}/5 Swag`;
}

function triggerInteract(): void {
  const offer = missions.nearbyOffer(catHolder.position);
  if (offer) {
    missions.start(offer);
    sfx.playBusBell();
    return;
  }
  if (restaurants.interact(catHolder.position)) return;
  const shop = nearestShop();
  if (shop) {
    if (shop.kind === 'abc') return abcShop.open(shop.label);
    if (shop.kind === 'boutique') return boutique.open();
    if (shop.kind === 'vip-host') {
      if (S.vip) return showToast('VIP Host: "Welcome back, high roller. Your tables are waiting."');
      if (S.stats.casinoWon >= 500 || swag() >= 5) {
        S.vip = true;
        world.unlockVip();
        sfx.playJackpot();
        showToast('VIP Host: "Right this way." The velvet rope drops — VIP lounge unlocked!', 4000);
        goals.check(S);
        save();
      } else {
        sfx.playBusted();
        showToast(`VIP Host: "Not tonight, kitty." Need ${vipProgress()}.`, 4000);
      }
      return;
    }
    if (shop.kind === 'bar') {
      if (S.cash < 12) return showToast(`${shop.label}: yard drinks are $12. Come back with cash.`);
      S.cash -= 12;
      buzzTimer = 90;
      sfx.playCash();
      showToast(`${shop.label}: one yard drink. Liquid courage — tips +50% for 90s!`);
      updateHUD();
      return;
    }
  }
  const game = nearestGame();
  if (game) {
    if (game.vipOnly && !S.vip) return showToast(`VIP only. Talk to the VIP host — ${vipProgress()}.`);
    return casino.open(game);
  }
  showToast('Find a slot bank or table inside a casino, ABC Stores (Miracle Mile), the Forum Shops boutique, or a bar.');
}

function onCaught(g: GuardNPC): void {
  const fine = Math.min(S.cash, Math.max(15, Math.floor(S.cash * 0.25)));
  const lostCigs = Math.min(S.cigStash, 5);
  S.cash -= fine;
  S.cigStash -= lostCigs;
  S.stats.busted += 1;
  if (riding) exitRide();
  catHolder.position.set(g.kickPoint.x, 0.2, g.kickPoint.z);
  catVelocity.set(0, 0, 0);
  sfx.playBusted();
  showToast(`BUSTED by ${g.casinoName} Security! Fined $${fine}, ${lostCigs} smokes confiscated, tossed out the door.`, 4200);
  updateHUD();
  save();
}
function onEscaped(g: GuardNPC): void {
  S.stats.escapes += 1;
  sfx.playSteal();
  showToast(`You shook off ${g.casinoName} Security. Smooth.`);
  goals.check(S);
  save();
}

// ---------------------------------------------------------------- input
const keys = new Set<string>();
let jumpQueued = false;
window.addEventListener('keydown', (e) => {
  if (!started || anyDialogOpen()) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  keys.add(e.code);
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyE':
      if (S.deviceMode === 'vape' && S.vapeJuice > 0) vapeChargeStart = elapsed;
      else triggerSmokeOrVape();
      break;
    case 'Digit1':
      vapeTrick('orings');
      break;
    case 'Digit2':
      vapeTrick('french');
      break;
    case 'Digit3':
      vapeTrick('ghost');
      break;
    case 'Digit4':
      vapeTrick('tornado');
      break;
    case 'KeyV':
      toggleDevice();
      break;
    case 'KeyB':
      triggerBeg();
      break;
    case 'KeyQ':
      triggerSteal();
      break;
    case 'KeyX':
      triggerDance();
      break;
    case 'KeyG':
      toggleRide();
      break;
    case 'KeyF':
      triggerInteract();
      break;
    case 'KeyT':
      cycleTimePreset();
      break;
    case 'KeyR':
      resetCat();
      break;
    case 'KeyC':
      triggerPounce();
      break;
    case 'KeyH':
      if (driving.active) {
        sfx.playHonk();
        for (const t of crowd.tourists) {
          if (t.mesh.position.distanceTo(catHolder.position) < 14 && !t.knock) {
            t.lookAtCat = 1.5;
            if (Math.random() < 0.3) crowd.say(t, ['JEEZ!', 'Is a cat DRIVING?', 'Learn to drive!'][Math.floor(Math.random() * 3)], 2);
          }
        }
      }
      break;
    case 'KeyZ':
      if (rag.active) endRagdoll();
      else {
        startRagdoll(new THREE.Vector3(catVelocity.x, Math.max(catVelocity.y, 2.5), catVelocity.z));
        degen.add(10, 'Dramatic Flop');
      }
      break;
    case 'KeyM':
      showToast(minimap.cycle());
      break;
    case 'KeyN':
      showToast(ambience.toggle() ? '🔊 Background sound on' : '🔇 Background sound off');
      break;
    case 'KeyJ':
      goalsPopover.togglePopover();
      break;
    case 'Slash':
      $('controls-popover').togglePopover();
      break;
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyE') releaseVapeCharge();
});
window.addEventListener('blur', () => keys.clear());

let camYaw = S === saved ? catYaw + Math.PI : Math.PI;
let camPitch = 0.26;
let camDist = 4.2;
let isDragging = false;
const camTarget = catHolder.position.clone().add(new THREE.Vector3(0, 0.8, 0));
/** How far along the boom the camera may sit (1 = full distance), eased back out after a wall pulls it in. */
let camClip = 1;
const camWant = new THREE.Vector3();
const camLook = new THREE.Vector3();

/**
 * First hit (as a 0..1 fraction of the segment) of the camera boom against the world's boxes: walls,
 * ceilings and solid buildings, so the camera stays inside a casino instead of showing its outside.
 * Thin posts are skipped (the camera would pop on every lamp), and so is any box the cat's head is in.
 */
function boomHit(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const x0 = Math.min(ax, bx);
  const x1 = Math.max(ax, bx);
  const z0 = Math.min(az, bz);
  const z1 = Math.max(az, bz);
  let best = 1;
  for (const box of world.colliders) {
    if (box.maxX < x0 || box.minX > x1 || box.maxZ < z0 || box.minZ > z1) continue;
    if (box.maxX - box.minX < 0.9 && box.maxZ - box.minZ < 0.9) continue;
    if (ax > box.minX && ax < box.maxX && az > box.minZ && az < box.maxZ && ay > box.minY && ay < box.topY) continue;
    let tmin = 0;
    let tmax = best;
    // slab test per axis
    if (Math.abs(dx) < 1e-6) {
      if (ax < box.minX || ax > box.maxX) continue;
    } else {
      let t1 = (box.minX - ax) / dx;
      let t2 = (box.maxX - ax) / dx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dy) < 1e-6) {
      if (ay < box.minY || ay > box.topY) continue;
    } else {
      let t1 = (box.minY - ay) / dy;
      let t2 = (box.topY - ay) / dy;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dz) < 1e-6) {
      if (az < box.minZ || az > box.maxZ) continue;
    } else {
      let t1 = (box.minZ - az) / dz;
      let t2 = (box.maxZ - az) / dz;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin < best) best = tmin;
  }
  return best;
}

// Drag to orbit, smooth wheel / pinch zoom (src/mouseCam.ts).
const orbitCamera = (dYaw: number, dPitch: number) => {
  camYaw += dYaw;
  camPitch = THREE.MathUtils.clamp(camPitch + dPitch, 0.04, 1.2);
};
installMouseCamera(canvas, {
  orbit: orbitCamera,
  getDist: () => camDist,
  setDist: (d) => (camDist = d),
  setDragging: (on) => (isDragging = on),
});

// Touch: virtual stick + jump for phones/tablets
const stick = { x: 0, y: 0, id: -1 };
if (window.matchMedia('(pointer: coarse)').matches) {
  const stickEl = $('touch-stick');
  const knob = $('touch-knob');
  const jumpBtn = $<HTMLButtonElement>('touch-jump');
  stickEl.hidden = false;
  jumpBtn.hidden = false;
  const move = (e: PointerEvent) => {
    const r = stickEl.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    stick.x = dx;
    stick.y = dy;
    knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
  };
  stickEl.addEventListener('pointerdown', (e) => {
    stick.id = e.pointerId;
    stickEl.setPointerCapture(e.pointerId);
    move(e);
  });
  stickEl.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) move(e);
  });
  const end = () => {
    stick.x = 0;
    stick.y = 0;
    stick.id = -1;
    knob.style.transform = '';
  };
  stickEl.addEventListener('pointerup', end);
  stickEl.addEventListener('pointercancel', end);
  jumpBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    jumpQueued = true;
  });
}

const TIME_ORDER: TimePreset[] = ['day', 'sunset', 'night', 'auto'];
const TIME_LABELS: Record<TimePreset, string> = { day: 'Mojave Day', sunset: 'Golden Sunset', night: 'Neon Night', auto: 'Auto Cycle' };
function updateMoodButton(): void {
  btnMood.innerHTML = `${TIME_LABELS[world.getTimePreset()]} <kbd>T</kbd>`;
}
function cycleTimePreset(): void {
  const next = TIME_ORDER[(TIME_ORDER.indexOf(world.getTimePreset()) + 1) % TIME_ORDER.length];
  world.setTimePreset(next);
  updateMoodButton();
  showToast(`Time of day: ${TIME_LABELS[next]}`);
}

function resetCat(): void {
  if (riding) exitRide();
  if (driving.active) exitCar();
  catHolder.position.copy(world.resetPoint);
  catVelocity.set(0, 0, 0);
  showToast('Back at the Bellagio Fountains');
}

const guard = (fn: () => void) => () => {
  if (started && !anyDialogOpen()) fn();
};
btnPuff.addEventListener('click', guard(() => triggerSmokeOrVape(1.2)));
btnDevice.addEventListener('click', guard(toggleDevice));
btnBeg.addEventListener('click', guard(triggerBeg));
btnSteal.addEventListener('click', guard(triggerSteal));
btnDance.addEventListener('click', guard(triggerDance));
btnBus.addEventListener('click', guard(toggleRide));
btnInteract.addEventListener('click', guard(triggerInteract));
btnMood.addEventListener('click', guard(cycleTimePreset));
btnSound.addEventListener('click', () => {
  sfx.enabled = !sfx.enabled;
  btnSound.textContent = sfx.enabled ? 'Sound: On' : 'Sound: Off';
});

// Key hints, context button, menu, title screen (src/hud.ts).
new Hud({
  started: () => started,
  context: () => ({
    prompt: promptEl.hidden ? '' : (promptEl.textContent ?? ''),
    riding: !!riding,
    driving: driving.active,
    eating: restaurants.cat.state === 'eating',
    vape: S.deviceMode === 'vape',
  }),
  orbit: orbitCamera,
  graphics,
  ambience,
  sfx,
});

// Dragging a window edge fires dozens of resizes a second: resize the buffers once per frame at most.
let resizeQueued = false;
window.addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer?.setSize(window.innerWidth, window.innerHeight);
  });
});
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});

// ---------------------------------------------------------------- physics
const overlapsXZ = (x: number, z: number, r: number, b: PlatformBox) => x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ;

function resolveCatPhysics(dt: number, moveDir: THREE.Vector3, sprinting: boolean): void {
  const maxSpeed = (sprinting ? 9.0 : 5.2) * (buff.t > 0 ? buff.speed : 1);
  const accel = isGrounded ? 24 : 10;
  const steering = pounceTimer <= 0 && !rag.active;
  if (!steering) {
    if (isGrounded) {
      const f = Math.max(0, 1 - dt * (rag.active ? 2.5 : 6));
      catVelocity.x *= f;
      catVelocity.z *= f;
    }
  } else if (moveDir.lengthSq() > 0.001) {
    catVelocity.x = THREE.MathUtils.lerp(catVelocity.x, moveDir.x * maxSpeed, Math.min(1, accel * dt));
    catVelocity.z = THREE.MathUtils.lerp(catVelocity.z, moveDir.z * maxSpeed, Math.min(1, accel * dt));
    catYaw = motion.steer(catYaw, Math.atan2(moveDir.x, moveDir.z), dt);
  } else {
    const drag = isGrounded ? 12 : 2;
    catVelocity.x = THREE.MathUtils.lerp(catVelocity.x, 0, Math.min(1, drag * dt));
    catVelocity.z = THREE.MathUtils.lerp(catVelocity.z, 0, Math.min(1, drag * dt));
  }
  if (steering && (keys.has('Space') || jumpQueued) && (isGrounded || coyoteTimer > 0)) {
    catVelocity.y = 7.4;
    isGrounded = false;
    coyoteTimer = 0;
  }
  jumpQueued = false;
  catVelocity.y -= 18.5 * dt;

  const radius = 0.28;
  const pos = catHolder.position;
  const cols = world.colliders;
  pos.x += catVelocity.x * dt;
  for (const box of cols) {
    if (pos.y + 0.65 <= box.minY || box.minY > pos.y + 3) continue;
    if (overlapsXZ(pos.x, pos.z, radius, box)) {
      const canStep = box.topY <= pos.y + 0.56 && !box.isWall;
      if (!canStep && pos.y < box.topY - 0.05) {
        if (catVelocity.x > 0) pos.x = box.minX - radius - 0.001;
        else if (catVelocity.x < 0) pos.x = box.maxX + radius + 0.001;
        catVelocity.x = 0;
      }
    }
  }
  pos.z += catVelocity.z * dt;
  for (const box of cols) {
    if (pos.y + 0.65 <= box.minY || box.minY > pos.y + 3) continue;
    if (overlapsXZ(pos.x, pos.z, radius, box)) {
      const canStep = box.topY <= pos.y + 0.56 && !box.isWall;
      if (!canStep && pos.y < box.topY - 0.05) {
        if (catVelocity.z > 0) pos.z = box.minZ - radius - 0.001;
        else if (catVelocity.z < 0) pos.z = box.maxZ + radius + 0.001;
        catVelocity.z = 0;
      }
    }
  }
  let floorY = 0;
  for (const box of cols) {
    if (box.isWall) continue;
    if (overlapsXZ(pos.x, pos.z, radius * 0.85, box) && pos.y >= box.topY - 0.58 && box.topY > floorY) floorY = box.topY;
  }
  pos.y += catVelocity.y * dt;
  if (pos.y <= floorY) {
    pos.y = floorY;
    const impact = catVelocity.y;
    if (rag.active && impact < -4) {
      catVelocity.y = -impact * 0.42;
      isGrounded = false;
      sfx.playMeow();
    } else {
      catVelocity.y = 0;
      isGrounded = true;
    }
    coyoteTimer = 0.12;
  } else {
    isGrounded = false;
    coyoteTimer = Math.max(0, coyoteTimer - dt);
  }

  // Cats don't swim: bounce out of fountains, canals and pools
  for (const wz of world.waterZones) {
    if (pos.x < wz.minX || pos.x > wz.maxX || pos.z < wz.minZ || pos.z > wz.maxZ) continue;
    if (pos.y > wz.y + 0.35 || pos.y < wz.y - 1) continue;
    const dl = pos.x - wz.minX;
    const dr = wz.maxX - pos.x;
    const dn = pos.z - wz.minZ;
    const ds = wz.maxZ - pos.z;
    const m = Math.min(dl, dr, dn, ds);
    if (m === dl) pos.x = wz.minX - 0.9;
    else if (m === dr) pos.x = wz.maxX + 0.9;
    else if (m === dn) pos.z = wz.minZ - 0.9;
    else pos.z = wz.maxZ + 0.9;
    pos.y = wz.y + 0.2;
    catVelocity.set(0, 4.5, 0);
    sfx.playMeow();
    smokeSystem.spawnWisp(tmpV.copy(pos).setY(wz.y + 0.3), catVelocity, true);
    showToast(`SPLASH! The ${wz.name} — cats don't swim.`);
  }
}

function vehicleBumps(): void {
  const p = catHolder.position;
  if (p.y > 3) return;
  for (const car of world.trafficVehicles) {
    const along = car.axis === 'z' ? Math.abs(p.z - car.mesh.position.z) : Math.abs(p.x - car.mesh.position.x);
    const across = car.axis === 'z' ? Math.abs(p.x - car.mesh.position.x) : Math.abs(p.z - car.mesh.position.z);
    if (p.y < 1.8 && across < 1.2 && along < car.halfLen && car.speed > 1 && !rag.active) {
      const side = car.axis === 'z' ? Math.sign(p.x - car.laneX || 1) : Math.sign(p.z - car.laneX || 1);
      const fwd = car.dir * car.speed * 0.9;
      if (car.speed > 5) {
        startRagdoll(car.axis === 'z' ? new THREE.Vector3(side * 6, 7 + car.speed * 0.25, fwd) : new THREE.Vector3(fwd, 7 + car.speed * 0.25, side * 6));
        degen.add(Math.round(car.speed * 8), 'Hood Ornament');
        showToast('SPLAT… just kidding. Nine lives, baby.');
      } else {
        catVelocity.y = 5.8;
        if (car.axis === 'z') catVelocity.x = side * 7.4;
        else catVelocity.z = side * 7.4;
        showToast('HONK! Use the skybridges or crosswalks, kitty.');
      }
      sfx.playMeow();
    }
  }
  for (const bus of world.deuceBuses) {
    const dx = Math.abs(p.x - bus.mesh.position.x);
    const dz = Math.abs(p.z - bus.mesh.position.z);
    if (p.y < 2.2 && dx < 1.5 && dz < bus.halfLen && bus.stopTimer <= 0 && !rag.active && !waitingStop) {
      startRagdoll(new THREE.Vector3(Math.sign(p.x - bus.laneX || 1) * 7, 9, bus.dir * 8));
      degen.add(120, 'Deuce Bumper Sticker');
      sfx.playMeow();
      showToast('Flattened by The Deuce. Next time wait at a gold stop and press [G].');
    }
  }
}

function chaosStep(dt: number, moving: boolean): void {
  const p = catHolder.position;
  if (pounceTimer > 0) {
    pounceTimer -= dt;
    pounceHits();
  }
  if (rag.active) {
    rag.t += dt;
    const speed = Math.hypot(catVelocity.x, catVelocity.z);
    if (speed > 5) pounceHits();
    if (catModel) {
      if (!isGrounded) {
        catModel.rotation.x += rag.spin.x * dt;
        catModel.rotation.y += rag.spin.y * dt;
        catModel.rotation.z += rag.spin.z * dt;
      } else {
        rag.spin.multiplyScalar(Math.max(0, 1 - dt * 4));
        catModel.rotation.x = THREE.MathUtils.lerp(catModel.rotation.x, 0, dt * 6);
        catModel.rotation.z = THREE.MathUtils.lerp(catModel.rotation.z, Math.PI / 2, dt * 6);
        catModel.position.y = THREE.MathUtils.lerp(catModel.position.y, 0.12, dt * 6);
      }
    }
    if ((rag.t > 1.2 && isGrounded && speed < 0.8 && moving) || rag.t > 6) {
      endRagdoll();
      if (catModel) catModel.position.y = 0;
    }
  }
  // Knock over street props (Goat-Simulator rules: everything is a bowling pin)
  const kinds = props.hit(p, catVelocity, rag.active ? 0.6 : 0.42, rag.active ? 2 : 3.4);
  for (const k of kinds) {
    S.stats.propsSmashed += 1;
    sfx.playBusted();
    if (k === 'trash') degen.add(15, 'Trash Panda');
    else if (k === 'newsrack') degen.add(25, 'Breaking News');
    else if (k === 'cone') degen.add(10, 'Cone Zone');
    else if (k === 'urn') {
      degen.add(20, 'Ash Tray Toss');
      if (Math.random() < 0.3) {
        S.cigStash += 1;
        showToast('A perfectly good half-smoked butt fell out. (+1)');
      }
    } else degen.add(15, 'Vandal Cat');
  }
  // Air time
  if (!isGrounded && !riding) {
    airTime += dt;
    peakY = Math.max(peakY, p.y);
  } else if (airTime > 0) {
    if (airTime > 1.1) degen.add(Math.round(airTime * 40), 'Big Air');
    if (peakY - p.y > 6) degen.add(Math.round((peakY - p.y) * 12), 'Gravity Check');
    airTime = 0;
    peakY = p.y;
  }
}

// ---------------------------------------------------------------- context prompt + zones
function updatePrompt(): void {
  let text = '';
  const foodPrompt = restaurants.promptFor(catHolder.position);
  if (foodPrompt && !driving.active && !riding) text = foodPrompt;
  else if (driving.active) text = 'Driving a stolen car — W/S gas/brake, A/D steer, Space handbrake, H honk, G to bail';
  else if (riding) text = riding.status ? `${riding.ridingPrompt} • ${riding.status()}` : riding.ridingPrompt;
  else if (waitingStop) text = `Waiting for THE DEUCE at ${waitingStop.name} — ${deuceEta(waitingStop)}`;
  else if (missions.nearbyOffer(catHolder.position)) text = `Press [F] — start mission: ${missions.nearbyOffer(catHolder.position)!.title}`;
  else {
    const shop = nearestShop();
    const game = nearestGame();
    const ride = nearestRideable();
    if (shop) {
      text =
        shop.kind === 'abc'
          ? 'Press [F] — ABC Stores: packs, cartons, vapes & pods'
          : shop.kind === 'boutique'
            ? `Press [F] — ${shop.label} (swag = bigger tips)`
            : shop.kind === 'vip-host'
              ? S.vip
                ? 'VIP Lounge — you’re on the list'
                : `Press [F] — VIP Host (${vipProgress()})`
              : `Press [F] — ${shop.label}: yard drink $12 (tips +50%)`;
    } else if (game) {
      text = `Press [F] — ${game.label}${game.vipOnly && !S.vip ? ' (VIP only)' : ''}`;
    } else if (ride) {
      text = ride.boardPrompt;
    } else {
      for (const p of world.cigPickups) {
        if (p.stolenCooldown === 0 && p.position.distanceTo(catHolder.position) < 3.2) {
          text = `Press [Q] to swipe ${p.label} (+${p.amount})${p.insideCasino ? ' — guards are watching!' : ''}`;
          break;
        }
      }
      if (!text) {
        for (const t of crowd.tourists) {
          if (t.mesh.position.distanceTo(catHolder.position) < 3.8) {
            text = t.hasCamera ? 'Press [B] — pose for a tourist photo (camera = big tips)' : t.hasCig && !t.cigStolen ? 'Press [B] to hustle or [Q] to swipe their cig' : 'Press [B] to hustle this tourist';
            break;
          }
        }
      }
    }
  }
  promptEl.hidden = !text;
  if (text && promptEl.textContent !== text) promptEl.textContent = text;
}

function trackZone(): void {
  const z = world.getZoneName(catHolder.position.x, catHolder.position.z);
  if (z !== lastZone) {
    lastZone = z;
    if (z !== 'Las Vegas Boulevard' && !S.stats.zonesVisited.includes(z)) {
      S.stats.zonesVisited.push(z);
      if (started) showToast(`📍 Discovered: ${z} (${S.stats.zonesVisited.length} spots)`);
      goals.check(S);
    }
  }
  zoneEl.textContent = `${z} • ${world.getDaylightLabel()}`;
}

// ---------------------------------------------------------------- loop
let isPaused = false;
let rafId = 0;
let lastTime = performance.now();
let elapsed = 0;
let hudTimer = 0;
let saveTimer = 0;
let mapTimer = 0;
let zoneTimer = 0;

function pauseLoop(): void {
  if (isPaused) return;
  isPaused = true;
  cancelAnimationFrame(rafId);
}
function resumeLoop(): void {
  if (!isPaused) return;
  isPaused = false;
  lastTime = performance.now();
  rafId = requestAnimationFrame(tick);
}
gameRoot.addEventListener('contentvisibilityautostatechange', (e) => {
  if ((e as Event & { skipped?: boolean }).skipped) pauseLoop();
  else resumeLoop();
});
document.addEventListener('visibilitychange', () => (document.hidden ? pauseLoop() : resumeLoop()));

const camForward = new THREE.Vector3();
const camRight = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const tipPos = new THREE.Vector3();
const desiredTarget = new THREE.Vector3();

function tick(now: number): void {
  if (isPaused) return;
  rafId = requestAnimationFrame(tick);
  step(now);
}

function step(now: number, render = true): void {
  // The menu pauses the game: the world still draws (settings show live) but its clock stands still.
  const dt = menuOpen() ? 0 : Math.max(0, Math.min(0.05, (now - lastTime) * 0.001));
  lastTime = Math.max(lastTime, now);
  elapsed += dt;

  if (started) {
    if (trickCooldown > 0) trickCooldown -= dt;
    if (buff.t > 0) buff.t = Math.max(0, buff.t - dt);
    if (vapeChargeStart >= 0) {
      const held = elapsed - vapeChargeStart;
      stateEl.textContent = held > 3.2 ? 'TOO MUCH!' : `Charging ${'▮'.repeat(Math.min(8, Math.ceil(held * 3)))}`;
      if (held > 3.6) releaseVapeCharge();
    }
    if (buzzTimer > 0) buzzTimer = Math.max(0, buzzTimer - dt);
    if (performerTipCooldown > 0) performerTipCooldown -= dt;
    if (S.deviceMode === 'cig' && S.isLit) {
      S.cigBurn -= dt * 2.0;
      if (S.cigBurn <= 0) finishCig();
    }
  }

  world.update(dt, elapsed, catHolder.position, camera);
  envLighting.update(world.atmosphere);
  crowd.update(dt, elapsed, catHolder.position, { onCaught, onEscaped });
  // People inside the big interiors (Bellagio, Venetian, Forum Shops, Luxor) aren't drawn from the street.
  for (const t of crowd.tourists) if (t.mesh.visible && hiddenIndoors(t.mesh.position.x, t.mesh.position.z)) t.mesh.visible = false;
  for (const t of crowd.guards) if (t.mesh.visible && hiddenIndoors(t.mesh.position.x, t.mesh.position.z)) t.mesh.visible = false;

  const seatAt = restaurants.update(dt, elapsed, catHolder.position);
  if (seatAt && started) {
    const moving = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((k) => keys.has(k));
    if (moving) restaurants.getUp();
    catHolder.position.copy(seatAt.pos);
    catYaw = seatAt.yaw;
    catVelocity.set(0, 0, 0);
  } else if (driving.active) {
    const throttle = started && !anyDialogOpen() ? (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - stick.y : 0;
    const steer = started && !anyDialogOpen() ? (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - stick.x : 0;
    const res = driving.update(dt, { throttle: THREE.MathUtils.clamp(throttle, -1, 1), steer: THREE.MathUtils.clamp(steer, -1, 1), handbrake: keys.has('Space') }, world.colliders, world.trafficVehicles);
    if (res.crashed) {
      sfx.playCrash();
      degen.add(30, 'Fender Bender');
    }
    driving.seat(catHolder.position);
    catYaw = driving.heading;
    catVelocity.copy(driving.velocity);
    sfx.setEngine(driving.speed);
    const carPos = driving.car!.mesh.position;
    if (Math.abs(driving.speed) > 4) {
      for (const npc of crowd.allPeople()) {
        if (npc.knock) continue;
        const dx = npc.mesh.position.x - carPos.x;
        const dz = npc.mesh.position.z - carPos.z;
        if (dx * dx + dz * dz > 3.2) continue;
        crowd.knockdown(npc, driving.velocity.x + dx, driving.velocity.z + dz, Math.min(9, Math.abs(driving.speed) * 0.5));
        S.stats.knockdowns += 1;
        degen.add(75, 'Pedestrian Bowling');
        crime(0.8);
        sfx.playBusted();
      }
    }
    for (const k of props.hit(carPos, driving.velocity, 1.7, 3)) {
      S.stats.propsSmashed += 1;
      degen.add(k === 'newsrack' ? 30 : 15, k === 'trash' ? 'Trash Day' : k === 'cone' ? 'Cone Zone' : 'Street Sweeper');
    }
  } else if (riding) {
    riding.seat(catHolder.position);
    catYaw = riding.yaw();
    catVelocity.set(0, 0, 0);
    if (riding.wantsExit?.()) {
      const r = riding;
      emit('ride', { kind: r.kind });
      exitRide(r.kind === 'highroller' ? 'Full loop on the High Roller — what a view!' : r.kind === 'gondola' ? 'Grazie! End of the canal.' : r.kind === 'elevator' ? 'Doors open.' : undefined);
    }
    if ((keys.has('Space') || jumpQueued) && !anyDialogOpen() && riding?.kind === 'deuce') {
      exitRide();
      catVelocity.y = 6.2;
    }
  } else {
    let inX = 0;
    let inZ = 0;
    if (started && !anyDialogOpen()) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) inZ -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) inZ += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) inX -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) inX += 1;
      inX += stick.x;
      inZ += stick.y;
    }
    camForward.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    camRight.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
    moveDir.set(0, 0, 0).addScaledVector(camForward, -inZ).addScaledVector(camRight, inX);
    if (moveDir.lengthSq() > 1) moveDir.normalize();
    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(stick.x, stick.y) > 0.95;
    if (rag.active) moveDir.set(0, 0, 0);
    resolveCatPhysics(dt, moveDir, sprinting);
    vehicleBumps();
    deuceAutoBoard();
    chaosStep(dt, inX !== 0 || inZ !== 0);
  }
  catHolder.rotation.y = catYaw;
  props.update(dt, world.colliders);
  rideshare.update(dt);
  // Moving things live outside the baked world, so the world's distance culling never sees them.
  dynCullTimer -= dt;
  if (dynCullTimer <= 0) {
    dynCullTimer = 0.25;
    const cam = camera.position;
    const k = dynCullScale * dynCullScale;
    props.cull(cam, 110 * dynCullScale);
    for (const p of world.cigPickups) if (p.stolenCooldown <= 0) p.mesh.visible = p.position.distanceToSquared(cam) < 160 * 160 * k;
    for (const gd of crowd.guards) gd.mesh.visible = gd.mesh.position.distanceToSquared(cam) < 150 * 150;
    for (const c of world.trafficVehicles) c.mesh.visible = c.mesh.position.distanceToSquared(cam) < 300 * 300 * k;
    for (const bus of world.deuceBuses) bus.mesh.visible = bus.mesh.position.distanceToSquared(cam) < 400 * 400 * k;
  }
  driving.tickAbandoned(dt, catHolder.position);
  if (started) missions.update(dt, elapsed, missionCtx());
  degen.update(dt);
  const zoneNow = world.getZoneName(catHolder.position.x, catHolder.position.z);
  wanted.update(dt, elapsed, catHolder.position, {
    riding: !!riding && riding.kind === 'deuce',
    inCar: driving.active,
    indoors: INDOOR_ZONE.test(zoneNow),
  });
  ambience.update(dt, INDOOR_ZONE.test(zoneNow) ? 1 : 0, world.getNight());

  // Animation state (the blends, gait, lean, jumps and idle life are in catMotion.ts)
  if (danceCooldown > 0) danceCooldown -= dt;
  if (puffTimer > 0) puffTimer = Math.max(0, puffTimer - dt);
  const horizSpeed = riding ? 0 : Math.hypot(catVelocity.x, catVelocity.z);
  const motionMode = restaurants.cat.state === 'eating' ? 'eat' : driving.active ? 'drive' : rag.active ? 'rag' : riding ? (riding.kind === 'seat' || riding.kind === 'rideshare' ? 'seat' : 'ride') : 'free';
  const pose = motion.update(dt, motionMode, isGrounded, catVelocity, catYaw, catHolder.position.y);
  if (motionMode === 'eat') stateEl.textContent = 'Eating';
  else if (motionMode === 'drive') stateEl.textContent = `Driving ${Math.round(Math.abs(driving.speed) * 2.237)} mph`;
  else if (motionMode === 'rag') stateEl.textContent = 'Ragdolling';
  else if (pose === 'action') {
    const cur = motion.current;
    stateEl.textContent = cur === actions.Pounce || pounceTimer > 0 ? 'POUNCE!' : cur === actions.Beg ? 'Hustling' : cur === actions.Steal ? 'Swiping!' : cur === actions.Dance && actions.Dance ? 'Dancing' : S.deviceMode === 'vape' ? 'Ripping Vape' : 'Taking a Drag';
  } else if (riding) stateEl.textContent = `Riding ${riding.label}`;
  else if (pose === 'air' || pose === 'land') stateEl.textContent = 'Leaping';
  else if (pose === 'walk' || pose === 'run') stateEl.textContent = horizSpeed > 6.5 ? 'Sprinting' : 'Prowling';
  else {
    stateEl.textContent = pose === 'sit' ? 'Loafing' : pose === 'flop' ? 'Napping' : S.deviceMode === 'vape' ? 'Vaping' : S.isLit ? 'Smoking' : 'Craving';
    if (started && ((S.deviceMode === 'cig' && S.isLit) || (S.deviceMode === 'vape' && S.vapeJuice > 0))) {
      idleAutoPuffTimer -= dt;
      if (idleAutoPuffTimer <= 0) triggerSmokeOrVape();
    }
  }
  if (crowd.anyChasing() || wanted.stars > 0) stateEl.textContent = wanted.stars > 0 ? `WANTED ${'★'.repeat(wanted.stars)}` : 'ON THE RUN!';
  catLook?.update(dt, { night: world.getNight(), idle: pose === 'idle' || pose === 'sit' || pose === 'seat', roam: pose === 'walk' || pose === 'run', groom: motion.grooming, camera: camera.position, tourists: crowd.tourists, focus: riding?.view?.()?.focus });

  // Ember + smoke
  const useVape = S.deviceMode === 'vape';
  getTipWorld(useVape, tipPos);
  const isPuffing = puffTimer > 0.2;
  const flicker = 0.85 + Math.sin(elapsed * 19) * 0.12 + Math.cos(elapsed * 31) * 0.08;
  const cigActive = S.deviceMode === 'cig' && S.isLit;
  // The glow sits ~40 cm out in front of the tip, small and dim: right at the tip it was 5 cm from Lou's white
  // chest and washed his whole face orange. Out here it still warms the smoke and the sidewalk at night.
  emberLight.position.set(Math.sin(catYaw) * 0.42, 0.04, Math.cos(catYaw) * 0.42).add(tipPos);
  emberLight.color.setHex(useVape ? 0x35e6ff : 0xff8a3c);
  emberLight.intensity = cigActive ? 0.16 * flicker * (isPuffing ? 2.0 : 1) : useVape && isPuffing ? 0.5 : 0;
  if (cigEmberMat) cigEmberMat.emissiveIntensity = cigActive ? 5 * flicker * (isPuffing ? 2.4 : 1) : 0;
  smokeSystem.update(dt, tipPos, catVelocity, cigActive, isPuffing);
  if (Math.random() < dt * 4.5) {
    for (const t of crowd.tourists) {
      if (t.hasCig && !t.cigStolen && t.cigMesh && t.mesh.visible && t.mesh.position.distanceTo(catHolder.position) < 28) {
        t.cigMesh.getWorldPosition(tmpV2);
        smokeSystem.spawnWisp(tmpV2, tmpV.set(0, 0, 0), false);
        break;
      }
    }
  }

  // HUD / map / zones / autosave (throttled)
  hudTimer += dt;
  if (hudTimer > 0.25) {
    hudTimer = 0;
    updateHUD();
    updatePrompt();
    const chasing = crowd.anyChasing();
    heatMeter.hidden = !chasing;
    if (chasing) heatFill.style.width = `${Math.round(crowd.heat(catHolder.position) * 100)}%`;
    if (started && goals.check(S)) save();
  }
  zoneTimer += dt;
  if (zoneTimer > 0.5) {
    zoneTimer = 0;
    trackZone();
  }
  mapTimer += dt;
  if (mapTimer > 0.1) {
    mapTimer = 0;
    const markers: MapMarker[] = [...world.staticMarkers, ...missions.markers2D()];
    for (const g of crowd.guards) markers.push({ x: g.mesh.position.x, z: g.mesh.position.z, color: g.mode === 'chase' ? '#ff3030' : '#5a8cff', size: g.mode === 'chase' ? 3.4 : 2.2 });
    for (const bus of world.deuceBuses) markers.push({ x: bus.mesh.position.x, z: bus.mesh.position.z, color: '#ffcc33', shape: 'square', size: 2.6 });
    for (const p of world.cigPickups) if (p.stolenCooldown === 0) markers.push({ x: p.position.x, z: p.position.z, color: '#ff7a3a', size: 1.5 });
    minimap.draw(catHolder.position.x, catHolder.position.z, catYaw, markers);
  }
  saveTimer += dt;
  if (saveTimer > 10) {
    saveTimer = 0;
    save();
  }

  // Camera
  desiredTarget.set(catHolder.position.x, catHolder.position.y + 0.75, catHolder.position.z);
  camTarget.lerp(desiredTarget, Math.min(1, (riding || driving.active ? 6 : 10) * dt));
  if (driving.active && !isDragging) {
    // Chase cam swings in behind the car like GTA
    let diff = driving.heading + Math.PI - camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    camYaw += diff * Math.min(1, dt * 2.5);
    camPitch = THREE.MathUtils.lerp(camPitch, 0.24, dt * 2);
  }
  // A ride can frame its own shot (a seat facing the Sphere's screen, say); dragging still wins.
  const rideView = riding?.view?.() ?? null;
  if (rideView && !isDragging) {
    let dy = rideView.yaw - camYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    camYaw += dy * Math.min(1, dt * 3);
    camPitch = THREE.MathUtils.lerp(camPitch, rideView.pitch, Math.min(1, dt * 3));
  }
  const dist = rideView ? rideView.dist : driving.active ? Math.max(camDist, 8.5) : riding?.kind === 'highroller' || riding?.kind === 'elevator' ? Math.max(camDist, 6) : camDist;
  const horiz = Math.cos(camPitch) * dist;
  camWant.set(camTarget.x + Math.sin(camYaw) * horiz, Math.max(0.4, camTarget.y + Math.sin(camPitch) * dist), camTarget.z + Math.cos(camYaw) * horiz);
  // Keep the camera on the cat's side of walls and under ceilings; ease back out once clear.
  const hit = rideView?.free ? 1 : boomHit(camTarget.x, camTarget.y, camTarget.z, camWant.x, camWant.y, camWant.z);
  // Never closer than ~1.1 m: with a wall right behind Lou it's better to see through the wall's back
  // face (it's culled) than to put the camera inside the cat.
  const fit = hit < 1 ? Math.max(Math.min(1, 1.1 / Math.max(dist, 0.5)), hit - 0.3 / Math.max(dist, 0.5)) : 1;
  camClip = fit < camClip ? fit : THREE.MathUtils.lerp(camClip, fit, Math.min(1, dt * 3));
  camera.position.lerpVectors(camTarget, camWant, camClip);
  camera.lookAt(rideView?.look ?? camLook.copy(camTarget));
  rideLens(camera, rideView?.fov, dt);

  if (render) {
    stripLook(world.atmosphere, look);
    renderer.toneMappingExposure = look.exposure * getBrightness();
    if (composer && bloom) {
      bloom.strength = look.bloomStrength;
      bloom.threshold = look.bloomThreshold;
      if (grade) applyGrade(grade, world.atmosphere);
      composer.render(dt);
    } else {
      renderer.render(scene, camera);
    }
  }
}

updateHUD();
updateMoodButton();
trackZone();
// Lay out the first frame without drawing it, compile the Strip's shaders in the background, then start
// drawing (the title screen shows progress meanwhile instead of freezing on the first frame).
/** Where the scene is drawn (the bloom composer's target, or the screen on Low): shaders compile to match it. */
function drawTarget(): THREE.WebGLRenderTarget | null {
  return composer?.readBuffer ?? null;
}
step(performance.now(), false);
warmWorld(renderer, scene, camera, drawTarget()).then(() => {
  if (!isPaused && rafId === 0) rafId = requestAnimationFrame(tick);
});
startStats({
  started: () => started,
  quality: () => quality,
  zone: () => world.getZoneName(catHolder.position.x, catHolder.position.z),
  goalsDone: () => S.goalsDone,
  missionsDone: () => S.stats.missionsDone,
});

// Dev hooks: on in `vite dev` and in the PR-check build (`vite build --mode check`), never in the live build.
if (import.meta.env.DEV || import.meta.env.MODE === 'check') {
  (window as unknown as { __game: unknown }).__game = {
    renderer,
    scene,
    camera,
    catHolder,
    world,
    crowd,
    state: () => S,
    start: startGame,
    cam: (yaw: number, pitch: number, dist: number) => {
      camYaw = yaw;
      camPitch = pitch;
      camDist = dist;
    },
    /** Dev-only: run the simulation forward `seconds` at 60 Hz without waiting for frames. */
    advance: (seconds: number) => {
      let t = lastTime;
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        t += 1000 / 60;
        step(t, false);
      }
    },
    keys,
    tp: (x: number, y: number, z: number) => {
      catHolder.position.set(x, y, z);
      camTarget.set(x, y + 0.75, z);
    },
    /** Dev-only: render one frame (with bloom when on) and return the canvas as a JPEG data URL. Works in a background tab. */
    snap: (q = 0.86): string => {
      step(lastTime + 1000 / 60, true);
      return canvas.toDataURL('image/jpeg', q);
    },
    /** Dev-only: render `n` frames back to back (GPU-synced) and report the average ms and per-frame draw stats. */
    bench: (n = 30) => {
      const gl = renderer.getContext();
      renderer.info.autoReset = false;
      let ms = 0;
      let calls = 0;
      let tris = 0;
      for (let i = 0; i < n; i++) {
        renderer.info.reset();
        const t0 = performance.now();
        step(lastTime + 1000 / 60, true);
        gl.finish();
        ms += performance.now() - t0;
        calls = renderer.info.render.calls;
        tris = renderer.info.render.triangles;
      }
      renderer.info.autoReset = true;
      return { ms: +(ms / n).toFixed(2), calls, tris, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
    },
  };
}
