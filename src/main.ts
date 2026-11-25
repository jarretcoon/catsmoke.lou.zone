import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AbcShopController } from './abcShop';
import { SoundFX } from './audio';
import { CasinoController } from './casino';
import { BoutiqueController, CatWardrobe, swagFor } from './cosmetics';
import { GoalTracker } from './goals';
import { MapMarker, Minimap } from './minimap';
import { GuardNPC, StripCrowdSystem } from './npcs';
import type { Rideable } from './rides';
import { SmokeSystem } from './smoke';
import { defaultState, GameState, localSaveBackend } from './state';
import { buildVegasStripWorld, PlatformBox, TimePreset } from './vegasWorld';

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

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.25, 1600);
const sfx = new SoundFX();
const world = buildVegasStripWorld(scene);
const crowd = new StripCrowdSystem(scene, world.crowd);
const smokeSystem = new SmokeSystem(scene);
const minimap = new Minimap(world.mapFeatures);

const catHolder = new THREE.Group();
catHolder.position.fromArray(S.position);
scene.add(catHolder);
const catVelocity = new THREE.Vector3();
let catYaw = S.yaw;
let isGrounded = false;
let coyoteTimer = 0;
let actionLockTimer = 0;
let puffTimer = 0;
let idleAutoPuffTimer = 5.5;
let buzzTimer = 0;
let performerTipCooldown = 0;
let toastTimeout: number | undefined;
let riding: Rideable | null = null;
let lastZone = '';
let wardrobe: CatWardrobe | null = null;
const cigMeshes: THREE.Mesh[] = [];
const vapeMeshes: THREE.Mesh[] = [];
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

world.setTimePreset(S.timePreset);
if (S.vip) world.unlockVip();

const swag = () => swagFor(S.cosmetics.equipped);
const tipMultiplier = (nearPerformer: boolean) => (1 + swag() * 0.18) * (buzzTimer > 0 ? 1.5 : 1) * (nearPerformer ? 1.3 : 1);

// ---------------------------------------------------------------- HUD
function updateHUD(): void {
  cashEl.textContent = `$${S.cash.toLocaleString()}`;
  stashEl.textContent = String(S.cigStash);
  swagEl.textContent = buzzTimer > 0 ? `${swag()} 🍹` : String(swag());
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
  recordResult: (game, net) => {
    if (net > 0) {
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

const abcShop = new AbcShopController(sfx, {
  getCash: () => S.cash,
  setCash: (n) => {
    S.cash = n;
    updateHUD();
  },
  addCigs: (count, boughtCarton) => {
    S.cigStash += count;
    if (!S.isLit && S.cigStash > 0) {
      S.cigStash -= 1;
      S.isLit = true;
      S.cigBurn = 100;
    }
    if (boughtCarton) {
      S.deviceMode = 'cig';
      S.stats.cartonsBought += 1;
    }
    goals.check(S);
    updateHUD();
    save();
  },
  buyVapeMod: () => {
    S.hasVapeMod = true;
    S.vapeJuice = 100;
    S.deviceMode = 'vape';
    updateHUD();
    save();
  },
  buyVapePod: (flavor) => {
    S.vapeFlavor = flavor;
    S.vapeJuice = 100;
    S.deviceMode = 'vape';
    updateHUD();
    save();
  },
  hasVapeMod: () => S.hasVapeMod,
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
    goals.check(S);
    updateHUD();
    save();
  },
  onOutcome: (msg) => showToast(msg),
});

const anyDialogOpen = () => casino.isOpen() || abcShop.isOpen() || boutique.isOpen();

// ---------------------------------------------------------------- cat model
let mixer: THREE.AnimationMixer | null = null;
const actions: Record<string, THREE.AnimationAction | null> = { Idle: null, Walk: null, Puff: null, VapeRip: null, Beg: null, Steal: null };
let activeAction: THREE.AnimationAction | null = null;
let cigTipObj: THREE.Object3D | null = null;
let vapeTipObj: THREE.Object3D | null = null;
let cigEmberMat: THREE.MeshStandardMaterial | null = null;
const emberLight = new THREE.PointLight(0xff6b1a, 1.3, 3.6, 2.0);
scene.add(emberLight);

function fadeToAction(next: THREE.AnimationAction | null, duration = 0.18): void {
  if (!next || activeAction === next) return;
  next.reset().fadeIn(duration).play();
  activeAction?.fadeOut(duration);
  activeAction = next;
}

function playOneShot(act: THREE.AnimationAction | null, lockSeconds: number): void {
  actionLockTimer = lockSeconds;
  if (!act) return;
  act.reset();
  act.setLoop(THREE.LoopOnce, 1);
  act.clampWhenFinished = false;
  fadeToAction(act, 0.12);
}

function getTipWorld(preferVape: boolean, out = new THREE.Vector3()): THREE.Vector3 {
  const obj = preferVape ? vapeTipObj : cigTipObj;
  if (obj) return obj.getWorldPosition(out);
  return out.set(0.08, 0.48, 0.44).applyAxisAngle(THREE.Object3D.DEFAULT_UP, catYaw).add(catHolder.position);
}

new GLTFLoader().load(
  '/models/tabby_cat.glb',
  (gltf) => {
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
    wardrobe = new CatWardrobe(model);
    wardrobe.apply(S.cosmetics.equipped);
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      for (const name of Object.keys(actions)) {
        const clip = gltf.animations.find((c) => c.name === name);
        if (clip) actions[name] = mixer.clipAction(clip);
      }
      fadeToAction(actions.Idle, 0.1);
    }
    updateHUD();
    titleLoading.textContent = 'Ready. Tip: tourists pay more when your Swag is up.';
    btnNewGame.disabled = false;
    btnContinue.disabled = false;
  },
  undefined,
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
    localSaveBackend.clear();
    S = defaultState();
    catHolder.position.copy(world.spawn);
    catYaw = world.spawnYaw;
    camYaw = Math.PI;
    world.setTimePreset('day');
    wardrobe?.apply([]);
    goals.render(S);
  }
  started = true;
  titleScreen.hidden = true;
  sfx.playBusBell();
  updateHUD();
  updateMoodButton();
  showToast(fresh ? 'Welcome to the Strip! Beg [B], steal [Q], smoke [E], ride [G], gamble & shop [F].' : 'Back on the Strip. The hustle never sleeps.', 4200);
  save();
}
btnNewGame.addEventListener('click', () => startGame(true));
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

function triggerSmokeOrVape(): void {
  if (S.deviceMode === 'vape') {
    if (S.vapeJuice <= 0) {
      sfx.playMeow();
      return showToast('Pod empty! Flavor pods at ABC Stores (Miracle Mile) [F].');
    }
    S.vapeJuice = Math.max(0, S.vapeJuice - 7);
    S.stats.vapeRips += 1;
    puffTimer = 1.8;
    idleAutoPuffTimer = 7 + Math.random() * 4;
    sfx.playVapeRip();
    playOneShot(actions.VapeRip ?? actions.Puff, 1.3);
    const tip = getTipWorld(true);
    const forward = new THREE.Vector3(Math.sin(catYaw), 0.16, Math.cos(catYaw)).normalize();
    smokeSystem.spawnVapeCloud(tip, forward, S.vapeFlavor, catVelocity);
    const reaction = crowd.reactToCloud(catHolder.position, tipMultiplier(false));
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

function triggerBeg(): void {
  sfx.playMeow();
  playOneShot(actions.Beg, 1.35);
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
    sfx.playCash();
    crowd.showTouristSpeech(closest, `Selfie with the smoking cat! +$${tip}`, 3.2);
    showToast(`📸 Photo op! +$${tip}`);
  } else if (roll < 0.62 + Math.min(0.2, swag() * 0.03)) {
    const tip = Math.round([5, 10, 15, 20][Math.floor(Math.random() * 4)] * mult);
    S.cash += tip;
    S.stats.tipsEarned += tip;
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
  showToast(msg ?? `Hopped off ${r.label}.`);
}

function toggleRide(): void {
  if (riding) return exitRide();
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
  const shop = nearestShop();
  if (shop) {
    if (shop.kind === 'abc') return abcShop.open();
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
      triggerSmokeOrVape();
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
    case 'KeyM':
      showToast(minimap.cycle());
      break;
    case 'KeyJ':
      goalsPopover.togglePopover();
      break;
    case 'Slash':
      $('controls-popover').togglePopover();
      break;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

let camYaw = S === saved ? catYaw + Math.PI : Math.PI;
let camPitch = 0.26;
let camDist = 4.2;
let isDragging = false;
let lastPointerX = 0;
let lastPointerY = 0;
const camTarget = catHolder.position.clone().add(new THREE.Vector3(0, 0.8, 0));

canvas.addEventListener('pointerdown', (e) => {
  isDragging = true;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
window.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  camYaw -= (e.clientX - lastPointerX) * 0.0065;
  camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - lastPointerY) * 0.005, 0.04, 1.2);
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
});
window.addEventListener('pointerup', () => {
  isDragging = false;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.003, 1.8, 16);
  },
  { passive: false }
);

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
  catHolder.position.copy(world.spawn);
  catVelocity.set(0, 0, 0);
  showToast('Back at the Bellagio Fountains');
}

const guard = (fn: () => void) => () => {
  if (started && !anyDialogOpen()) fn();
};
btnPuff.addEventListener('click', guard(triggerSmokeOrVape));
btnDevice.addEventListener('click', guard(toggleDevice));
btnBeg.addEventListener('click', guard(triggerBeg));
btnSteal.addEventListener('click', guard(triggerSteal));
btnBus.addEventListener('click', guard(toggleRide));
btnInteract.addEventListener('click', guard(triggerInteract));
btnMood.addEventListener('click', guard(cycleTimePreset));
btnSound.addEventListener('click', () => {
  sfx.enabled = !sfx.enabled;
  btnSound.textContent = sfx.enabled ? 'Sound: On' : 'Sound: Off';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});

// ---------------------------------------------------------------- physics
const overlapsXZ = (x: number, z: number, r: number, b: PlatformBox) => x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ;

function resolveCatPhysics(dt: number, moveDir: THREE.Vector3, sprinting: boolean): void {
  const maxSpeed = sprinting ? 9.0 : 5.2;
  const accel = isGrounded ? 24 : 10;
  if (moveDir.lengthSq() > 0.001) {
    catVelocity.x = THREE.MathUtils.lerp(catVelocity.x, moveDir.x * maxSpeed, Math.min(1, accel * dt));
    catVelocity.z = THREE.MathUtils.lerp(catVelocity.z, moveDir.z * maxSpeed, Math.min(1, accel * dt));
    let diff = Math.atan2(moveDir.x, moveDir.z) - catYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    catYaw += diff * Math.min(1, 12 * dt);
  } else {
    const drag = isGrounded ? 12 : 2;
    catVelocity.x = THREE.MathUtils.lerp(catVelocity.x, 0, Math.min(1, drag * dt));
    catVelocity.z = THREE.MathUtils.lerp(catVelocity.z, 0, Math.min(1, drag * dt));
  }
  if ((keys.has('Space') || jumpQueued) && (isGrounded || coyoteTimer > 0)) {
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
    catVelocity.y = 0;
    isGrounded = true;
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
    if (p.y < 1.8 && across < 1.2 && along < car.halfLen && car.speed > 1) {
      catVelocity.y = 5.8;
      const side = car.axis === 'z' ? Math.sign(p.x - car.laneX || 1) : Math.sign(p.z - car.laneX || 1);
      if (car.axis === 'z') catVelocity.x = side * 7.4;
      else catVelocity.z = side * 7.4;
      sfx.playMeow();
      showToast('HONK! Use the skybridges or crosswalks, kitty.');
    }
  }
  for (const bus of world.deuceBuses) {
    const dx = Math.abs(p.x - bus.mesh.position.x);
    const dz = Math.abs(p.z - bus.mesh.position.z);
    if (p.y < 2.2 && dx < 1.5 && dz < bus.halfLen && bus.stopTimer <= 0) {
      catVelocity.y = 5.4;
      catVelocity.x = Math.sign(p.x - bus.laneX || 1) * 7;
      sfx.playMeow();
      showToast('The Deuce stops at the gold shelters — press [G] there.');
    }
  }
}

// ---------------------------------------------------------------- context prompt + zones
function updatePrompt(): void {
  let text = '';
  if (riding) text = riding.ridingPrompt;
  else {
    const shop = nearestShop();
    const game = nearestGame();
    const ride = nearestRideable();
    if (shop) {
      text =
        shop.kind === 'abc'
          ? 'Press [F] — ABC Stores: packs, cartons, vapes & pods'
          : shop.kind === 'boutique'
            ? 'Press [F] — Forum Shops Boutique (swag = bigger tips)'
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
  const dt = Math.max(0, Math.min(0.05, (now - lastTime) * 0.001));
  lastTime = Math.max(lastTime, now);
  elapsed += dt;

  if (started) {
    if (buzzTimer > 0) buzzTimer = Math.max(0, buzzTimer - dt);
    if (performerTipCooldown > 0) performerTipCooldown -= dt;
    if (S.deviceMode === 'cig' && S.isLit) {
      S.cigBurn -= dt * 2.0;
      if (S.cigBurn <= 0) finishCig();
    }
  }

  world.update(dt, elapsed, catHolder.position, camera);
  crowd.update(dt, elapsed, catHolder.position, { onCaught, onEscaped });

  if (riding) {
    riding.seat(catHolder.position);
    catYaw = riding.yaw();
    catVelocity.set(0, 0, 0);
    if (riding.wantsExit?.()) {
      const r = riding;
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
    resolveCatPhysics(dt, moveDir, sprinting);
    vehicleBumps();
  }
  catHolder.rotation.y = catYaw;

  // Animation state
  if (actionLockTimer > 0) actionLockTimer = Math.max(0, actionLockTimer - dt);
  if (puffTimer > 0) puffTimer = Math.max(0, puffTimer - dt);
  const horizSpeed = riding ? 0 : Math.hypot(catVelocity.x, catVelocity.z);
  if (actionLockTimer > 0) {
    stateEl.textContent = activeAction === actions.Beg ? 'Hustling' : activeAction === actions.Steal ? 'Swiping!' : S.deviceMode === 'vape' ? 'Ripping Vape' : 'Taking a Drag';
  } else if (riding) {
    fadeToAction(actions.Idle, 0.22);
    stateEl.textContent = `Riding ${riding.label}`;
  } else if (horizSpeed > 0.35) {
    if (actions.Walk) {
      actions.Walk.timeScale = THREE.MathUtils.clamp(horizSpeed / 3.6, 0.75, 2.2);
      fadeToAction(actions.Walk, 0.15);
    }
    stateEl.textContent = !isGrounded ? 'Leaping' : horizSpeed > 6.5 ? 'Sprinting' : 'Prowling';
  } else {
    fadeToAction(actions.Idle, 0.22);
    stateEl.textContent = !isGrounded ? 'Leaping' : S.deviceMode === 'vape' ? 'Vaping' : S.isLit ? 'Smoking' : 'Craving';
    if (started && ((S.deviceMode === 'cig' && S.isLit) || (S.deviceMode === 'vape' && S.vapeJuice > 0))) {
      idleAutoPuffTimer -= dt;
      if (idleAutoPuffTimer <= 0) triggerSmokeOrVape();
    }
  }
  if (crowd.anyChasing()) stateEl.textContent = 'ON THE RUN!';
  mixer?.update(dt);

  // Ember + smoke
  const useVape = S.deviceMode === 'vape';
  getTipWorld(useVape, tipPos);
  const isPuffing = puffTimer > 0.2;
  const flicker = 0.85 + Math.sin(elapsed * 19) * 0.12 + Math.cos(elapsed * 31) * 0.08;
  const cigActive = S.deviceMode === 'cig' && S.isLit;
  emberLight.position.copy(tipPos);
  emberLight.color.setHex(useVape ? 0x35e6ff : 0xff6b1a);
  emberLight.intensity = cigActive ? 1.25 * flicker * (isPuffing ? 2.4 : 1) : useVape && isPuffing ? 2.2 : 0;
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
    const markers: MapMarker[] = [...world.staticMarkers];
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
  camTarget.lerp(desiredTarget, Math.min(1, (riding ? 6 : 10) * dt));
  const dist = riding?.kind === 'highroller' || riding?.kind === 'elevator' ? Math.max(camDist, 6) : camDist;
  const horiz = Math.cos(camPitch) * dist;
  camera.position.set(camTarget.x + Math.sin(camYaw) * horiz, Math.max(0.4, camTarget.y + Math.sin(camPitch) * dist), camTarget.z + Math.cos(camYaw) * horiz);
  camera.lookAt(camTarget);

  if (render) renderer.render(scene, camera);
}

updateHUD();
updateMoodButton();
trackZone();
rafId = requestAnimationFrame(tick);

if (import.meta.env.DEV) {
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
  };
}
