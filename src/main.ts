import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AbcShopController } from './abcShop';
import { SoundFX } from './audio';
import { CasinoController } from './casino';
import { StripCrowdSystem } from './npcs';
import { SmokeSystem, VapeFlavor } from './smoke';
import { buildVegasStripWorld, DeuceBus, PlatformBox, TimePreset } from './vegasWorld';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const gameRoot = document.getElementById('game-root') as HTMLElement;
const cashEl = document.getElementById('cash-value') as HTMLElement;
const stashEl = document.getElementById('stash-value') as HTMLElement;
const deviceLabelEl = document.getElementById('device-label') as HTMLElement;
const deviceValueEl = document.getElementById('device-value') as HTMLElement;
const smokedEl = document.getElementById('smoked-value') as HTMLElement;
const stateEl = document.getElementById('state-value') as HTMLElement;
const zoneEl = document.getElementById('zone-label') as HTMLElement;
const promptEl = document.getElementById('prompt-pill') as HTMLElement;
const toastEl = document.getElementById('toast-banner') as HTMLElement;

const btnPuff = document.getElementById('btn-puff') as HTMLButtonElement;
const btnDevice = document.getElementById('btn-device') as HTMLButtonElement;
const btnBeg = document.getElementById('btn-beg') as HTMLButtonElement;
const btnSteal = document.getElementById('btn-steal') as HTMLButtonElement;
const btnBus = document.getElementById('btn-bus') as HTMLButtonElement;
const btnInteract = document.getElementById('btn-interact') as HTMLButtonElement;
const btnSound = document.getElementById('btn-sound') as HTMLButtonElement;
const btnMood = document.getElementById('btn-mood') as HTMLButtonElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 260);

const sfx = new SoundFX();
const world = buildVegasStripWorld(scene);
const crowd = new StripCrowdSystem(scene);
const smokeSystem = new SmokeSystem(scene);

// Cat Spawn: West Strip Sidewalk by Bellagio Fountains facing Paris & The Deuce bus lane!
const catHolder = new THREE.Group();
catHolder.position.set(-10.2, 0.1, 26);
scene.add(catHolder);

const catVelocity = new THREE.Vector3();
let catYaw = Math.PI * 0.5;
let isGrounded = false;
let coyoteTimer = 0;
let actionLockTimer = 0;
let puffTimer = 0;
let idleAutoPuffTimer = 5.5;
let toastTimeout: number | undefined;
let ridingBus: DeuceBus | null = null;

// Smoking & Vaping Economy State
let cash = 0;
let cigStash = 2;
let cigBurn = 100;
let isLit = true;
let cigsSmoked = 0;

let deviceMode: 'cig' | 'vape' = 'cig';
let hasVapeMod = true; // Starts with starter Blue Razz pod; upgrade or buy pods & cartons at ABC Stores!
let vapeJuice = 60;
let vapeFlavor: VapeFlavor = 'Blue Razz';
let vapeRips = 0;

const cigMeshes: THREE.Mesh[] = [];
const vapeMeshes: THREE.Mesh[] = [];

function updateEconomyHUD(): void {
  cashEl.textContent = `$${cash}`;
  stashEl.textContent = String(cigStash);
  smokedEl.textContent = String(cigsSmoked + vapeRips);

  if (deviceMode === 'cig') {
    deviceLabelEl.textContent = 'Cig Lit';
    deviceValueEl.textContent = isLit ? `${Math.ceil(cigBurn)}%` : 'OUT';
    btnDevice.innerHTML = 'Mode: Cig <kbd>V</kbd>';
  } else {
    deviceLabelEl.textContent = vapeFlavor;
    deviceValueEl.textContent = `${Math.ceil(vapeJuice)}%`;
    btnDevice.innerHTML = 'Mode: Vape <kbd>V</kbd>';
  }

  for (const m of cigMeshes) m.visible = deviceMode === 'cig' && isLit;
  for (const m of vapeMeshes) m.visible = deviceMode === 'vape' && hasVapeMod;
}

const casino = new CasinoController(sfx, {
  getCash: () => cash,
  setCash: (next) => {
    cash = next;
    updateEconomyHUD();
  },
  onOutcome: (msg) => showToast(msg),
});

const abcShop = new AbcShopController(sfx, {
  getCash: () => cash,
  setCash: (next) => {
    cash = next;
    updateEconomyHUD();
  },
  addCigs: (count, boughtCarton) => {
    cigStash += count;
    if (!isLit && cigStash > 0) {
      cigStash -= 1;
      isLit = true;
      cigBurn = 100;
    }
    if (boughtCarton) {
      deviceMode = 'cig';
    }
    updateEconomyHUD();
  },
  buyVapeMod: () => {
    hasVapeMod = true;
    vapeJuice = 100;
    deviceMode = 'vape';
    updateEconomyHUD();
  },
  buyVapePod: (flavor) => {
    vapeFlavor = flavor;
    vapeJuice = 100;
    deviceMode = 'vape';
    updateEconomyHUD();
  },
  hasVapeMod: () => hasVapeMod,
  onOutcome: (msg) => showToast(msg),
});

// Camera Orbit State
let camYaw = 1.55;
let camPitch = 0.28;
let camDist = 3.6;
let isDragging = false;
let lastPointerX = 0;
let lastPointerY = 0;
const camTarget = new THREE.Vector3(-10.2, 0.85, 26);

// GLTF Cat + Animations + Sockets
let mixer: THREE.AnimationMixer | null = null;
let idleAction: THREE.AnimationAction | null = null;
let walkAction: THREE.AnimationAction | null = null;
let puffAction: THREE.AnimationAction | null = null;
let vapeAction: THREE.AnimationAction | null = null;
let begAction: THREE.AnimationAction | null = null;
let stealAction: THREE.AnimationAction | null = null;
let activeAction: THREE.AnimationAction | null = null;
let cigTipObj: THREE.Object3D | null = null;
let vapeTipObj: THREE.Object3D | null = null;
let cigEmberMat: THREE.MeshStandardMaterial | null = null;

const emberLight = new THREE.PointLight(0xff6b1a, 1.3, 3.6, 2.0);
scene.add(emberLight);

function showToast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.add('is-visible');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toastEl.classList.remove('is-visible');
  }, 2600);
}

function fadeToAction(next: THREE.AnimationAction | null, duration = 0.18): void {
  if (!next || activeAction === next) return;
  next.reset().fadeIn(duration).play();
  if (activeAction) {
    activeAction.fadeOut(duration);
  }
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

function getTipWorld(preferVape: boolean): THREE.Vector3 {
  const out = new THREE.Vector3();
  const obj = preferVape ? vapeTipObj : cigTipObj;
  if (obj) {
    obj.getWorldPosition(out);
    return out;
  }
  out.set(0.08, 0.48, 0.44).applyAxisAngle(new THREE.Vector3(0, 1, 0), catYaw).add(catHolder.position);
  return out;
}

function toggleDevice(): void {
  if (deviceMode === 'cig') {
    if (!hasVapeMod) {
      showToast('Buy a Neon Vape Mod at ABC Stores first!');
      return;
    }
    deviceMode = 'vape';
    showToast(`Switched to Neon Vape (${vapeFlavor})`);
  } else {
    deviceMode = 'cig';
    showToast('Switched to Cigarette Mode');
  }
  updateEconomyHUD();
}

function triggerSmokeOrVape(): void {
  if (deviceMode === 'vape') {
    if (vapeJuice <= 0) {
      sfx.playMeow();
      showToast('Vape pod empty! Visit ABC Stores [F] for flavored pods!');
      return;
    }
    vapeJuice = Math.max(0, vapeJuice - 7);
    vapeRips += 1;
    puffTimer = 1.8;
    idleAutoPuffTimer = 7.0 + Math.random() * 4.0;
    sfx.playVapeRip();
    playOneShot(vapeAction ?? puffAction, 1.3);

    const tip = getTipWorld(true);
    const forward = new THREE.Vector3(Math.sin(catYaw), 0.16, Math.cos(catYaw)).normalize();
    smokeSystem.spawnVapeCloud(tip, forward, vapeFlavor, catVelocity);
    updateEconomyHUD();
    return;
  }

  // Cigarette Mode
  if (!isLit) {
    if (cigStash > 0) {
      cigStash -= 1;
      isLit = true;
      cigBurn = 100;
      sfx.playPuff();
      showToast('Lit a fresh cigarette from your stash!');
      updateEconomyHUD();
    } else {
      sfx.playMeow();
      showToast('Out of smokes! Steal [Q] or buy a Carton at ABC Stores!');
      return;
    }
  }

  puffTimer = 1.4;
  idleAutoPuffTimer = 6.0 + Math.random() * 4.0;
  cigBurn = Math.max(0, cigBurn - 12);
  sfx.playPuff();
  playOneShot(puffAction, 1.0);

  const tipWorld = getTipWorld(false);
  const forward = new THREE.Vector3(Math.sin(catYaw), 0.12, Math.cos(catYaw)).normalize();
  smokeSystem.spawnExhaleBurst(tipWorld, forward);

  if (cigBurn <= 0) {
    isLit = false;
    cigsSmoked += 1;
    showToast(`Finished cig #${cigsSmoked}!`);
  }
  updateEconomyHUD();
}

function triggerBeg(): void {
  sfx.playMeow();
  playOneShot(begAction, 1.35);

  let closest = null;
  let bestD = 4.6;
  for (const t of crowd.tourists) {
    const d = t.mesh.position.distanceTo(catHolder.position);
    if (d < bestD) {
      bestD = d;
      closest = t;
    }
  }

  if (!closest) {
    showToast('Meow! Walk up near Strip tourists before begging [B].');
    return;
  }
  if (closest.begCooldown > 0) {
    crowd.showTouristSpeech(closest, 'Already tipped you, kitty!', 2.2);
    showToast('Tourist: "Already tipped you, little smoker!"');
    return;
  }

  closest.begCooldown = 18;
  const roll = Math.random();
  if (roll < 0.65) {
    const tip = [5, 10, 15, 25][Math.floor(Math.random() * 4)];
    cash += tip;
    sfx.playCash();
    crowd.showTouristSpeech(closest, `OMG a smoking cat! +$${tip}`, 3.2);
    showToast(`Tourist: "OMG a smoking cat! Here's $${tip}!"`);
  } else if (roll < 0.86) {
    cigStash += 1;
    sfx.playSteal();
    crowd.showTouristSpeech(closest, 'Respect the hustle! +1 Cig', 3.2);
    showToast('Tourist: "Respect the hustle. Take a spare smoke!" (+1 Cig)');
  } else {
    crowd.showTouristSpeech(closest, 'Lost it all at Bellagio!', 2.6);
    showToast('Tourist: "Lost it all at Bellagio slots, sorry kitty!"');
  }
  updateEconomyHUD();
}

function triggerSteal(): void {
  playOneShot(stealAction, 0.75);

  const inCasino = (catHolder.position.x < -36 && catHolder.position.z > 6) || (catHolder.position.x > 33 && catHolder.position.z < 58);
  if (inCasino) {
    for (const g of crowd.guards) {
      if (g.mesh.position.distanceTo(catHolder.position) < 4.8) {
        sfx.playBusted();
        catHolder.position.set(g.kickPoint.x, 0.2, g.kickPoint.z);
        catVelocity.set(0, 0, 0);
        showToast(`${g.casinoName} Security: "No swipe-smoking cat in here!"`);
        return;
      }
    }
  }

  for (const p of world.cigPickups) {
    if (p.stolenCooldown > 0) continue;
    if (p.position.distanceTo(catHolder.position) < 3.5) {
      p.stolenCooldown = 28;
      p.mesh.visible = false;
      cigStash += p.amount;
      if (!isLit) {
        cigStash -= 1;
        isLit = true;
        cigBurn = 100;
      }
      sfx.playSteal();
      showToast(`Stole ${p.label}! (+${p.amount} Cigs)`);
      updateEconomyHUD();
      return;
    }
  }

  for (const t of crowd.tourists) {
    if (!t.hasCig || t.cigStolen) continue;
    if (t.mesh.position.distanceTo(catHolder.position) < 3.6) {
      t.cigStolen = true;
      if (t.cigMesh) t.cigMesh.visible = false;
      cigStash += 1;
      sfx.playSteal();
      crowd.showTouristSpeech(t, 'Hey! That cat took my cig!', 3.0);
      showToast('Swiped a lit cigarette straight from a tourist! (+1 Cig)');
      updateEconomyHUD();
      return;
    }
  }

  showToast('Nothing to swipe here! Look for glowing red cig packs or smokers.');
}

function getNearestDeuceBus(): DeuceBus | null {
  let best: DeuceBus | null = null;
  let bestDist = 7.5;
  for (const bus of world.deuceBuses) {
    const d = bus.mesh.position.distanceTo(catHolder.position);
    if (d < bestDist) {
      bestDist = d;
      best = bus;
    }
  }
  return best;
}

function toggleRideDeuce(): void {
  if (ridingBus) {
    // Hop cleanly off onto the Strip sidewalk side!
    const exitSide = ridingBus.laneX > 0 ? 10.6 : -10.6;
    catHolder.position.set(exitSide, 0.25, ridingBus.mesh.position.z);
    catVelocity.set(0, 2.5, 0);
    ridingBus = null;
    btnBus.innerHTML = 'Ride Deuce <kbd>G</kbd>';
    sfx.playBusBell();
    showToast('Hopped off The Deuce!');
    return;
  }

  const bus = getNearestDeuceBus();
  if (!bus) {
    showToast('Wait at a DEUCE STOP or get near a Metallic Gold Deuce Bus [G]!');
    return;
  }
  ridingBus = bus;
  catVelocity.set(0, 0, 0);
  btnBus.innerHTML = 'Exit Deuce <kbd>G</kbd>';
  sfx.playBusBell();
  showToast('Boarding THE DEUCE Double-Decker! Enjoy the Strip panoramic view!');
}

function getNearestGamblingSpot() {
  for (const spot of world.gamblingSpots) {
    if (spot.position.distanceTo(catHolder.position) < 4.5) {
      return spot;
    }
  }
  return null;
}

function isNearAbcShop(): boolean {
  const p = catHolder.position;
  return (p.x >= 16.5 && p.x <= 32.5 && p.z >= 65 && p.z <= 85) || world.abcShopSpot.distanceTo(p) < 6.0;
}

function triggerInteract(): void {
  if (isNearAbcShop()) {
    abcShop.open();
    return;
  }
  const spot = getNearestGamblingSpot();
  if (spot) {
    casino.open(spot);
    return;
  }
  showToast('Visit Bellagio/Paris/Flamingo Slots to Gamble, or ABC Stores (SE corner) to buy Cartons & Vapes!');
}

const loader = new GLTFLoader();
loader.load(
  '/models/tabby_cat.glb',
  (gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(1.35);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && mat.name === 'CigEmber') {
          cigEmberMat = mat;
        }
        if (mesh.name.startsWith('Cig')) {
          cigMeshes.push(mesh);
        }
        if (mesh.name.startsWith('Vape')) {
          vapeMeshes.push(mesh);
        }
      }
      if (child.name === 'CigTip') cigTipObj = child;
      if (child.name === 'VapeTip') vapeTipObj = child;
    });

    catHolder.add(model);

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      const findClip = (name: string) => gltf.animations.find((c) => c.name === name);
      if (findClip('Idle')) idleAction = mixer.clipAction(findClip('Idle')!);
      if (findClip('Walk')) walkAction = mixer.clipAction(findClip('Walk')!);
      if (findClip('Puff')) puffAction = mixer.clipAction(findClip('Puff')!);
      if (findClip('VapeRip')) vapeAction = mixer.clipAction(findClip('VapeRip')!);
      if (findClip('Beg')) begAction = mixer.clipAction(findClip('Beg')!);
      if (findClip('Steal')) stealAction = mixer.clipAction(findClip('Steal')!);
      fadeToAction(idleAction, 0.1);
    }

    updateEconomyHUD();
    showToast('Welcome to Vegas! Beg [B], Steal/Buy Cartons at ABC Stores [F], Vape [V/E], & Ride Deuce [G]!');
  },
  undefined,
  (err) => console.error('Failed to load tabby_cat.glb:', err)
);

// Input Handling
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if (casino.isOpen() || abcShop.isOpen()) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  keys.add(e.code);
  if (e.code === 'KeyE' && !e.repeat) triggerSmokeOrVape();
  else if (e.code === 'KeyV' && !e.repeat) toggleDevice();
  else if (e.code === 'KeyB' && !e.repeat) triggerBeg();
  else if (e.code === 'KeyQ' && !e.repeat) triggerSteal();
  else if (e.code === 'KeyG' && !e.repeat) toggleRideDeuce();
  else if (e.code === 'KeyF' && !e.repeat) triggerInteract();
  else if (e.code === 'KeyT' && !e.repeat) cycleTimePreset();
  else if (e.code === 'KeyR' && !e.repeat) resetCat();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

canvas.addEventListener('pointerdown', (e) => {
  isDragging = true;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
window.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastPointerX;
  const dy = e.clientY - lastPointerY;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  camYaw -= dx * 0.0065;
  camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.005, 0.06, 1.15);
});
window.addEventListener('pointerup', () => {
  isDragging = false;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.0028, 1.8, 13.0);
  },
  { passive: false }
);

const TIME_ORDER: TimePreset[] = ['day', 'sunset', 'night', 'auto'];
function cycleTimePreset(): void {
  const cur = world.getTimePreset();
  const next = TIME_ORDER[(TIME_ORDER.indexOf(cur) + 1) % TIME_ORDER.length];
  world.setTimePreset(next);
  const labels: Record<TimePreset, string> = {
    day: 'Mojave Day',
    sunset: 'Golden Sunset',
    night: 'Neon Night',
    auto: 'Auto Cycle',
  };
  btnMood.innerHTML = `${labels[next]} <kbd>T</kbd>`;
  showToast(`Time of Day: ${labels[next]}`);
}

function resetCat(): void {
  if (ridingBus) {
    ridingBus = null;
    btnBus.innerHTML = 'Ride Deuce <kbd>G</kbd>';
  }
  catHolder.position.set(-10.2, 0.2, 26);
  catVelocity.set(0, 0, 0);
  showToast('Back by the Bellagio Fountains');
}

btnPuff.addEventListener('click', triggerSmokeOrVape);
btnDevice.addEventListener('click', toggleDevice);
btnBeg.addEventListener('click', triggerBeg);
btnSteal.addEventListener('click', triggerSteal);
btnBus.addEventListener('click', toggleRideDeuce);
btnInteract.addEventListener('click', triggerInteract);
btnMood.addEventListener('click', cycleTimePreset);
btnSound.addEventListener('click', () => {
  sfx.enabled = !sfx.enabled;
  btnSound.textContent = sfx.enabled ? 'Sound: On' : 'Sound: Off';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function overlapsXZ(x: number, z: number, r: number, box: PlatformBox): boolean {
  return x + r > box.minX && x - r < box.maxX && z + r > box.minZ && z - r < box.maxZ;
}

function resolveCatPhysics(dt: number, moveDir: THREE.Vector3, sprinting: boolean): void {
  const maxSpeed = sprinting ? 9.0 : 5.2;
  const accel = isGrounded ? 24 : 10;

  if (moveDir.lengthSq() > 0.001) {
    catVelocity.x = THREE.MathUtils.lerp(catVelocity.x, moveDir.x * maxSpeed, Math.min(1, accel * dt));
    catVelocity.z = THREE.MathUtils.lerp(catVelocity.z, moveDir.z * maxSpeed, Math.min(1, accel * dt));

    const targetYaw = Math.atan2(moveDir.x, moveDir.z);
    let diff = targetYaw - catYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    catYaw += diff * Math.min(1, 12 * dt);
  } else {
    const drag = isGrounded ? 12 : 2;
    catVelocity.x = THREE.MathUtils.lerp(catVelocity.x, 0, Math.min(1, drag * dt));
    catVelocity.z = THREE.MathUtils.lerp(catVelocity.z, 0, Math.min(1, drag * dt));
  }

  if (keys.has('Space') && (isGrounded || coyoteTimer > 0)) {
    catVelocity.y = 7.4;
    isGrounded = false;
    coyoteTimer = 0;
  }

  catVelocity.y -= 18.5 * dt;

  const radius = 0.28;
  const pos = catHolder.position;

  pos.x += catVelocity.x * dt;
  for (const box of world.colliders) {
    if (pos.y + 0.65 <= box.minY) continue;
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
  for (const box of world.colliders) {
    if (pos.y + 0.65 <= box.minY) continue;
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
  for (const box of world.colliders) {
    if (box.isWall) continue;
    if (overlapsXZ(pos.x, pos.z, radius * 0.85, box) && pos.y >= box.topY - 0.58) {
      if (box.topY > floorY) floorY = box.topY;
    }
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
}

function updateContextPrompt(): void {
  if (ridingBus) {
    promptEl.textContent = 'Riding THE DEUCE Upper Deck — Press [E] to Smoke/Vape or [G] to Exit!';
    promptEl.hidden = false;
    return;
  }
  if (isNearAbcShop()) {
    promptEl.textContent = 'Press [F] to Buy Cartons ($55) & Vapes at ABC Stores!';
    promptEl.hidden = false;
    return;
  }
  const spot = getNearestGamblingSpot();
  if (spot) {
    promptEl.textContent = `Press [F] to Gamble at ${spot.label}`;
    promptEl.hidden = false;
    return;
  }
  const nearBus = getNearestDeuceBus();
  if (nearBus) {
    promptEl.textContent = 'Press [G] to Hop onto THE DEUCE Double-Decker Bus!';
    promptEl.hidden = false;
    return;
  }
  for (const p of world.cigPickups) {
    if (p.stolenCooldown === 0 && p.position.distanceTo(catHolder.position) < 3.5) {
      promptEl.textContent = `Press [Q] to Steal ${p.label} (+${p.amount} Cigs)`;
      promptEl.hidden = false;
      return;
    }
  }
  for (const t of crowd.tourists) {
    if (t.mesh.position.distanceTo(catHolder.position) < 3.8) {
      promptEl.textContent =
        t.hasCig && !t.cigStolen
          ? 'Press [B] to Beg for Cash or [Q] to Swipe Smoker’s Cig!'
          : 'Press [B] to Panhandle Tourist for Cash!';
      promptEl.hidden = false;
      return;
    }
  }
  promptEl.hidden = true;
}

// Background Pause Support
let isPaused = false;
let rafId = 0;
let lastTime = performance.now();
let elapsed = 0;

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
  const evt = e as Event & { skipped?: boolean };
  if (evt.skipped) pauseLoop();
  else resumeLoop();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseLoop();
  else resumeLoop();
});

function tick(now: number): void {
  if (isPaused) return;
  rafId = requestAnimationFrame(tick);

  const dt = Math.min(0.05, (now - lastTime) * 0.001);
  lastTime = now;
  elapsed += dt;

  // Passive cig burn
  if (deviceMode === 'cig' && isLit) {
    cigBurn -= dt * 2.0;
    if (cigBurn <= 0) {
      cigsSmoked += 1;
      if (cigStash > 0) {
        cigStash -= 1;
        cigBurn = 100;
        showToast(`Finished cig #${cigsSmoked} — auto-lit another!`);
      } else {
        isLit = false;
        cigBurn = 0;
        showToast('Out of smokes! Steal [Q] or buy a Carton at ABC Stores!');
      }
    }
    if (Math.floor(elapsed * 4) !== Math.floor((elapsed - dt) * 4)) {
      updateEconomyHUD();
    }
  }

  world.update(dt, elapsed);
  crowd.update(dt, elapsed);

  // Riding Deuce Bus OR Walking Physics
  if (ridingBus) {
    const worldOffset = ridingBus.deckOffset.clone().applyEuler(ridingBus.mesh.rotation);
    catHolder.position.copy(ridingBus.mesh.position).add(worldOffset);
    catYaw = ridingBus.dir === 1 ? 0 : Math.PI;
    catVelocity.set(0, 0, ridingBus.stopTimer > 0 ? 0 : ridingBus.dir * ridingBus.speed);

    if (keys.has('Space') && !casino.isOpen() && !abcShop.isOpen()) {
      toggleRideDeuce();
      catVelocity.y = 6.2;
    }
  } else {
    let inX = 0;
    let inZ = 0;
    if (!casino.isOpen() && !abcShop.isOpen()) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) inZ -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) inZ += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) inX -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) inX += 1;
    }

    const camForward = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const camRight = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const moveDir = new THREE.Vector3()
      .addScaledVector(camForward, -inZ)
      .addScaledVector(camRight, inX);
    if (moveDir.lengthSq() > 0.001) moveDir.normalize();

    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    resolveCatPhysics(dt, moveDir, sprinting);

    // Jump right onto a passing Deuce Bus roof if airborne above it!
    for (const bus of world.deuceBuses) {
      const dx = Math.abs(catHolder.position.x - bus.mesh.position.x);
      const dz = Math.abs(catHolder.position.z - bus.mesh.position.z);
      if (catHolder.position.y >= 3.2 && catHolder.position.y < 5.0 && dx < 1.5 && dz < 5.6) {
        ridingBus = bus;
        btnBus.innerHTML = 'Exit Deuce <kbd>G</kbd>';
        sfx.playBusBell();
        showToast('Landed on THE DEUCE upper deck!');
        break;
      } else if (catHolder.position.y < 2.2 && dx < 1.55 && dz < 5.8) {
        catVelocity.y = 5.4;
        catVelocity.x = catHolder.position.x >= bus.laneX ? 7.0 : -7.0;
        sfx.playMeow();
        showToast('Press [G] to board The Deuce Bus!');
      }
    }

    for (const car of world.trafficVehicles) {
      const dx = Math.abs(catHolder.position.x - car.mesh.position.x);
      const dz = Math.abs(catHolder.position.z - car.mesh.position.z);
      if (catHolder.position.y < 1.8 && dx < 1.25 && dz < car.halfLen) {
        catVelocity.y = 5.8;
        catVelocity.x = catHolder.position.x >= car.laneX ? 7.4 : -7.4;
        sfx.playMeow();
        showToast('Watch out for Las Vegas Blvd traffic!');
      }
    }
  }

  catHolder.rotation.y = catYaw;

  // Animation State
  if (actionLockTimer > 0) actionLockTimer = Math.max(0, actionLockTimer - dt);
  if (puffTimer > 0) puffTimer = Math.max(0, puffTimer - dt);

  const horizSpeed = ridingBus ? 0 : Math.hypot(catVelocity.x, catVelocity.z);
  if (actionLockTimer > 0) {
    stateEl.textContent =
      activeAction === begAction
        ? 'Panhandling'
        : activeAction === stealAction
        ? 'Swiping!'
        : deviceMode === 'vape'
        ? 'Ripping Vape!'
        : 'Taking a Drag';
  } else if (ridingBus) {
    fadeToAction(idleAction, 0.22);
    stateEl.textContent = 'Riding Deuce';
  } else if (horizSpeed > 0.35) {
    if (walkAction) {
      walkAction.timeScale = THREE.MathUtils.clamp(horizSpeed / 3.6, 0.75, 2.2);
      fadeToAction(walkAction, 0.15);
    }
    stateEl.textContent = !isGrounded ? 'Leaping' : keys.has('ShiftLeft') ? 'Sprinting' : 'Prowling';
  } else {
    fadeToAction(idleAction, 0.22);
    stateEl.textContent = !isGrounded
      ? 'Leaping'
      : deviceMode === 'vape'
      ? 'Vaping'
      : isLit
      ? 'Smoking'
      : 'Craving Smoke';
    if ((deviceMode === 'cig' && isLit) || (deviceMode === 'vape' && vapeJuice > 0)) {
      idleAutoPuffTimer -= dt;
      if (idleAutoPuffTimer <= 0) triggerSmokeOrVape();
    }
  }

  if (mixer) mixer.update(dt);

  // Ember & Smoke/Vape Particle Update
  const useVapeTip = deviceMode === 'vape';
  const tipPos = getTipWorld(useVapeTip);
  const isPuffing = puffTimer > 0.2;
  const flicker = 0.85 + Math.sin(elapsed * 19) * 0.12 + Math.cos(elapsed * 31) * 0.08;
  const puffBoost = isPuffing ? 2.4 : 1.0;

  const cigActive = deviceMode === 'cig' && isLit;
  emberLight.position.copy(tipPos);
  emberLight.color.setHex(useVapeTip ? 0x35e6ff : 0xff6b1a);
  emberLight.intensity = cigActive ? 1.25 * flicker * puffBoost : useVapeTip && isPuffing ? 2.2 : 0;
  if (cigEmberMat) {
    cigEmberMat.emissiveIntensity = cigActive ? 5.0 * flicker * puffBoost : 0;
  }

  smokeSystem.update(dt, tipPos, catVelocity, cigActive, isPuffing);

  // Tourist micro smoke wisps
  if (Math.random() < dt * 4.5) {
    const tPos = new THREE.Vector3();
    for (const t of crowd.tourists) {
      if (t.hasCig && !t.cigStolen && t.cigMesh && t.mesh.position.distanceTo(catHolder.position) < 28) {
        t.cigMesh.getWorldPosition(tPos);
        smokeSystem.spawnWisp(tPos, new THREE.Vector3(), false);
        break;
      }
    }
  }

  updateContextPrompt();
  zoneEl.textContent = `${world.getZoneName(catHolder.position.x, catHolder.position.z)} • ${world.getDaylightLabel()}`;

  const desiredTarget = new THREE.Vector3(
    catHolder.position.x,
    catHolder.position.y + 0.75,
    catHolder.position.z
  );
  camTarget.lerp(desiredTarget, Math.min(1, 10 * dt));

  const horizCam = Math.cos(camPitch) * camDist;
  const vertCam = Math.sin(camPitch) * camDist;
  camera.position.set(
    camTarget.x + Math.sin(camYaw) * horizCam,
    Math.max(0.4, camTarget.y + vertCam),
    camTarget.z + Math.cos(camYaw) * horizCam
  );
  camera.lookAt(camTarget);

  renderer.render(scene, camera);
}

rafId = requestAnimationFrame(tick);
