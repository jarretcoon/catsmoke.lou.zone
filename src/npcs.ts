import * as THREE from 'three';
import { bakeGroup } from './meshBake';

export type TouristProp = 'yard-drink' | 'camera' | 'cig' | 'bag' | 'none';
export type Outfit = 'tourist' | 'guard' | 'elvis' | 'showgirl' | 'slapper' | 'officer' | 'animal-control' | 'worker';
export type PerformerKind = 'elvis' | 'showgirl' | 'slapper';

export interface TouristRoute {
  pts: Array<[number, number]>;
  prop: TouristProp;
}
export interface PerformerSpot {
  kind: PerformerKind;
  x: number;
  z: number;
  facing: number;
}
export interface GuardRoute {
  name: string;
  pts: Array<[number, number]>;
  kick: [number, number];
  /** Casino floor rectangle the guard protects (chases end when the cat leaves it). */
  zone: { minX: number; maxX: number; minZ: number; maxZ: number };
}
export interface CrowdConfig {
  tourists: TouristRoute[];
  performers: PerformerSpot[];
  guards: GuardRoute[];
}

/** Knocked-over state (Goat-Simulator style): fall, slide, lie there, get back up. */
export interface KnockState {
  t: number;
  vx: number;
  vz: number;
  yaw: number;
}

export interface Rig {
  knock?: KnockState | null;
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  head: THREE.Group;
  cigMesh: THREE.Object3D | null;
}

export interface TouristNPC extends Rig {
  id: number;
  mesh: THREE.Group;
  waypoints: THREE.Vector3[];
  wpIndex: number;
  speed: number;
  pauseTimer: number;
  begCooldown: number;
  reactCooldown: number;
  hasCig: boolean;
  hasCamera: boolean;
  cigStolen: boolean;
  speechSprite: THREE.Sprite | null;
  speechTimer: number;
  walkPhase: number;
  lookAtCat: number;
}

export interface PerformerNPC extends Rig {
  id: number;
  kind: PerformerKind;
  mesh: THREE.Group;
  begCooldown: number;
  speechSprite: THREE.Sprite | null;
  speechTimer: number;
  chatterTimer: number;
}

export interface GuardNPC extends Rig {
  id: number;
  mesh: THREE.Group;
  waypoints: THREE.Vector3[];
  wpIndex: number;
  casinoName: string;
  kickPoint: THREE.Vector3;
  zone: GuardRoute['zone'];
  walkPhase: number;
  mode: 'patrol' | 'chase' | 'return';
  lostTimer: number;
  flashMat: THREE.MeshBasicMaterial | null;
  speechSprite: THREE.Sprite | null;
  speechTimer: number;
}

export interface PursuerNPC extends Rig {
  id: number;
  kind: 'ac' | 'cop';
  mesh: THREE.Group;
  speed: number;
  walkPhase: number;
  speechSprite: THREE.Sprite | null;
  speechTimer: number;
  shoutTimer: number;
}

const PURSUER_LINES: Record<'ac' | 'cop', string[]> = {
  ac: ['Animal Control! Drop the cigarette!', 'Here kitty kitty… GOTCHA— no.', 'That cat is NOT chipped!', 'Get the net! The NET!', 'Suspect is a large brown tabby!'],
  cop: ['LVMPD! Stop right there… cat!', 'Dispatch, it’s the smoking cat again', 'Freeze! …Do cats freeze?', 'Suspect fleeing on four legs!'],
};

const SKIN_TONES = [0xf2c8a8, 0xe2ae88, 0xc88c64, 0x9b6342, 0x6b412a];
const HAIR_COLORS = [0x1c1512, 0x4a2e1b, 0x9c6b30, 0xd8b158, 0x7b2c25, 0x8e939e];
const SHIRT_COLORS = [0xff5a7a, 0x2ec4ff, 0xffc83d, 0x4de088, 0xb874ff, 0xff7b3b, 0xf2f0eb, 0x26354d];
const PANTS_COLORS = [0x212c42, 0x2c2b30, 0x453b31, 0x3b4d6b, 0xd6cbb8];

const PERFORMER_LINES: Record<PerformerKind, string[]> = {
  elvis: ['Thank you, thank you very much', 'Photo with the King? $20!', 'Viva Las Vegas, baby!', 'Ain’t nothin’ but a hound cat'],
  showgirl: ['Photos with the showgirls!', 'Tips appreciated, darling', 'Strike a pose, kitty!', 'Feathers out!'],
  slapper: ['*slap slap* Free entry tonight!', 'VIP list, VIP list!', 'Club promos here!', '*slap* *slap*'],
};

const hawaiianTextures = new Map<number, THREE.CanvasTexture>();
function makeHawaiianTexture(baseHex: number): THREE.CanvasTexture {
  const cached = hawaiianTextures.get(baseHex);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = `#${new THREE.Color(baseHex).getHexString()}`;
    ctx.fillRect(0, 0, 128, 128);
    const accents = ['#ffe066', '#ff6b9e', '#63f5b8', '#ffffff'];
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = accents[i % accents.length];
      const x = (i * 37) % 128;
      const y = (i * 59) % 128;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 8, y - 2, 16, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  hawaiianTextures.set(baseHex, tex);
  return tex;
}

function makeSpeechTexture(text: string, accent = '#ffd25a'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(18, 22, 36, 0.94)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(14, 14, 484, 108, 28);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(234, 120);
    ctx.lineTo(256, 150);
    ctx.lineTo(278, 120);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff5e0';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68, 456);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function std(color: number, roughness = 0.7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

export function buildHuman(seed: number, outfit: Outfit, prop: TouristProp): Rig & { flashMat: THREE.MeshBasicMaterial | null } {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const isGuard = outfit === 'guard' || outfit === 'officer';
  const isAC = outfit === 'animal-control';
  const female = outfit === 'showgirl' || (outfit === 'tourist' && seed % 2 === 1);

  const skinColor = SKIN_TONES[seed % SKIN_TONES.length];
  const hairColor = outfit === 'elvis' ? 0x0b0b10 : HAIR_COLORS[(seed * 3) % HAIR_COLORS.length];
  const shirtHex =
    outfit === 'guard' ? 0x162038 : outfit === 'officer' ? 0x1b2433 : isAC ? 0xc2a878 : outfit === 'worker' ? 0xf4f4f4 : outfit === 'elvis' ? 0xf4f1ea : outfit === 'showgirl' ? 0xff3fa4 : outfit === 'slapper' ? 0x8cff3a : SHIRT_COLORS[(seed * 5) % SHIRT_COLORS.length];
  const pantsHex =
    outfit === 'guard' ? 0x0e1320 : outfit === 'officer' ? 0x141a26 : isAC ? 0x4a4f36 : outfit === 'worker' ? 0x2a2a2e : outfit === 'elvis' ? 0xf4f1ea : outfit === 'showgirl' ? skinColor : outfit === 'slapper' ? 0x1c1f2a : PANTS_COLORS[(seed * 7) % PANTS_COLORS.length];

  const skinMat = std(skinColor, 0.68);
  const hairMat = std(hairColor, outfit === 'elvis' ? 0.25 : 0.78);
  const pantsMat = std(pantsHex, outfit === 'showgirl' ? 0.5 : 0.85);
  const shoeMat = std(isGuard || outfit === 'slapper' ? 0x0c0d12 : outfit === 'showgirl' ? 0xffd34d : 0xe9e6de, 0.5);
  const soleMat = std(0xf4f4f6, 0.7);
  const isHawaiian = outfit === 'tourist' && seed % 3 === 0;
  const shirtMat = isHawaiian
    ? new THREE.MeshStandardMaterial({ map: makeHawaiianTexture(shirtHex), roughness: 0.72 })
    : outfit === 'showgirl'
      ? std(shirtHex, 0.3, 0.6, { emissive: 0x5a0830, emissiveIntensity: 0.4 })
      : std(shirtHex, 0.72);
  const goldMat = std(0xf4c44e, 0.22, 0.85);

  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    parent.add(m);
    return m;
  };

  // Pelvis / belt
  add(g, new THREE.BoxGeometry(0.38, 0.14, 0.22), pantsMat, 0, 0.84, 0, true);
  add(g, new THREE.BoxGeometry(0.4, 0.05, 0.24), outfit === 'elvis' ? goldMat : std(0x1a1615, 0.45), 0, 0.9, 0);
  add(g, new THREE.BoxGeometry(outfit === 'elvis' ? 0.16 : 0.08, 0.06, 0.03), goldMat, 0, 0.9, 0.125);

  const torso = add(g, new THREE.CylinderGeometry(female ? 0.19 : 0.21, 0.175, 0.52, 14), shirtMat, 0, 1.17, 0, true);
  torso.scale.set(1.05, 1, 0.65);
  for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(0.088, 10, 8), shirtMat, s * 0.22, 1.38, 0);

  if (isGuard) {
    const badge = add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8), goldMat, 0.1, 1.28, 0.13);
    badge.rotation.x = Math.PI / 2;
    add(g, new THREE.BoxGeometry(0.06, 0.3, 0.03), std(0x10141f, 0.5), 0, 1.24, 0.13);
    if (outfit === 'officer') {
      add(g, new THREE.BoxGeometry(0.42, 0.1, 0.26), std(0x111111, 0.5), 0, 0.92, 0); // duty belt
      add(g, new THREE.BoxGeometry(0.38, 0.3, 0.25), std(0x22262e, 0.6), 0, 1.2, 0.02); // vest
    }
  } else if (isAC) {
    add(g, new THREE.BoxGeometry(0.1, 0.07, 0.02), std(0x2d5a2d, 0.6), -0.1, 1.3, 0.13); // patch
    add(g, new THREE.BoxGeometry(0.42, 0.07, 0.26), std(0x3a2a1a, 0.6), 0, 0.92, 0);
  } else if (outfit === 'worker') {
    add(g, new THREE.BoxGeometry(0.34, 0.5, 0.02), std(0xffffff, 0.6), 0, 1.0, 0.13); // apron
  } else if (outfit === 'elvis') {
    // High collar, open V and rhinestone studs
    for (const s of [-1, 1]) {
      const collar = add(g, new THREE.BoxGeometry(0.12, 0.16, 0.03), shirtMat, s * 0.09, 1.47, 0.07);
      collar.rotation.z = s * 0.35;
    }
    for (let i = 0; i < 6; i++) add(g, new THREE.SphereGeometry(0.014, 6, 6), goldMat, (i % 2 ? 1 : -1) * 0.09, 1.05 + i * 0.05, 0.125);
    const cape = add(g, new THREE.BoxGeometry(0.44, 0.6, 0.02), std(0xf4f1ea, 0.4), 0, 1.12, -0.13);
    cape.rotation.x = 0.08;
  } else if (outfit === 'showgirl') {
    // Rhinestone bodice + giant feather headdress & back plumes
    const plumeMat = std(0xfff0f8, 0.6, 0, { emissive: 0xff7ac8, emissiveIntensity: 0.15 });
    const pinkPlume = std(0xff5fb6, 0.55, 0, { emissive: 0xff2b9e, emissiveIntensity: 0.25 });
    for (let i = 0; i < 9; i++) {
      const a = -1.1 + i * 0.275;
      const f = add(g, new THREE.ConeGeometry(0.09, 0.95, 6), i % 2 ? pinkPlume : plumeMat, Math.sin(a) * 0.45, 1.45 + Math.cos(a) * 0.42, -0.2);
      f.rotation.z = -a;
    }
  } else if (outfit === 'slapper') {
    add(g, new THREE.BoxGeometry(0.36, 0.06, 0.2), std(0xf2f2f2, 0.6), 0, 1.3, 0.04); // vest stripe
  }

  add(g, new THREE.CylinderGeometry(0.062, 0.072, 0.12, 10), skinMat, 0, 1.46, 0);

  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  g.add(head);
  const cranium = add(head, new THREE.SphereGeometry(0.145, 16, 14), skinMat, 0, 0, 0, true);
  cranium.scale.set(0.92, 1.06, 0.98);
  const nose = add(head, new THREE.ConeGeometry(0.022, 0.055, 6), skinMat, 0, -0.01, 0.145);
  nose.rotation.x = Math.PI * 0.45;
  for (const s of [-1, 1]) {
    const ear = add(head, new THREE.SphereGeometry(0.032, 8, 8), skinMat, s * 0.132, -0.01, 0);
    ear.scale.set(0.55, 1.0, 0.75);
  }

  const hasShades = isGuard || isAC || outfit === 'elvis' || (outfit === 'tourist' && seed % 2 === 0);
  if (hasShades) {
    const frameMat = outfit === 'elvis' ? goldMat : std(0x12141c, 0.2, 0.7);
    const lensMat = std(isGuard ? 0x090b10 : outfit === 'elvis' ? 0x5a3a12 : 0x261436, 0.08, 0.85);
    add(head, new THREE.BoxGeometry(0.18, 0.018, 0.03), frameMat, 0, 0.025, 0.138);
    for (const s of [-1, 1]) add(head, new THREE.BoxGeometry(0.068, 0.05, 0.025), lensMat, s * 0.048, 0.02, 0.142);
  } else {
    const eyeMat = std(0x161a24, 0.3);
    for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.016, 8, 8), eyeMat, s * 0.046, 0.022, 0.132);
  }

  if (isGuard || isAC) {
    add(head, new THREE.CylinderGeometry(0.155, 0.145, 0.09, 14), std(isAC ? 0x4a4f36 : 0x13192b, 0.5), 0, 0.11, 0);
    add(head, new THREE.BoxGeometry(0.2, 0.02, 0.12), std(0x090b12, 0.2), 0, 0.075, 0.12);
  } else if (outfit === 'worker') {
    // White paper hat
    add(head, new THREE.BoxGeometry(0.3, 0.09, 0.14), std(0xffffff, 0.7), 0, 0.12, 0);
    add(head, new THREE.BoxGeometry(0.31, 0.025, 0.145), std(0xd81e2a, 0.6), 0, 0.09, 0);
  } else {
    add(head, new THREE.SphereGeometry(0.152, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat, 0, 0.02, -0.01);
    if (outfit === 'elvis') {
      const pomp = add(head, new THREE.SphereGeometry(0.1, 12, 8), hairMat, 0, 0.13, 0.06);
      pomp.scale.set(1.2, 0.7, 1.1);
      for (const s of [-1, 1]) add(head, new THREE.BoxGeometry(0.025, 0.09, 0.04), hairMat, s * 0.128, -0.03, 0.04);
    } else if (outfit === 'showgirl') {
      const crown = add(head, new THREE.CylinderGeometry(0.16, 0.15, 0.06, 16), goldMat, 0, 0.1, 0);
      crown.rotation.x = -0.15;
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + i * 0.3;
        const f = add(head, new THREE.ConeGeometry(0.035, 0.55, 5), std(i % 2 ? 0xff5fb6 : 0xfff0f8, 0.6), Math.sin(a) * 0.22, 0.36 + Math.cos(a) * 0.12, -0.02);
        f.rotation.z = -a * 0.8;
      }
    } else if (outfit === 'slapper' || seed % 4 === 1) {
      const capMat = std(outfit === 'slapper' ? 0x111111 : [0xd9362b, 0x2665d8, 0x28995a][seed % 3], 0.6);
      add(head, new THREE.SphereGeometry(0.156, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), capMat, 0, 0.04, 0);
      const brim = add(head, new THREE.BoxGeometry(0.17, 0.018, 0.14), capMat, 0, 0.06, 0.14);
      brim.rotation.x = 0.15;
    } else if (female) {
      const pony = add(head, new THREE.SphereGeometry(0.07, 10, 8), hairMat, 0, 0.0, -0.16);
      pony.scale.set(0.8, 1.4, 0.8);
    }
  }

  const buildLeg = (side: number): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.11, 0.8, 0);
    const legMat = outfit === 'showgirl' ? std(0xd49a7a, 0.4) : pantsMat;
    add(leg, new THREE.CapsuleGeometry(0.074, 0.26, 6, 10), legMat, 0, -0.18, 0, true);
    add(leg, new THREE.CapsuleGeometry(0.06, 0.28, 6, 10), legMat, 0, -0.5, 0, true);
    add(leg, new THREE.BoxGeometry(0.11, 0.08, 0.21), shoeMat, 0, -0.73, 0.04, true);
    add(leg, new THREE.BoxGeometry(0.115, 0.028, 0.215), soleMat, 0, -0.775, 0.04);
    if (outfit === 'elvis') {
      const flare = add(leg, new THREE.CylinderGeometry(0.07, 0.11, 0.18, 10), pantsMat, 0, -0.62, 0);
      flare.castShadow = true;
    }
    return leg;
  };
  const leftLeg = buildLeg(1);
  const rightLeg = buildLeg(-1);
  g.add(leftLeg, rightLeg);

  const buildArm = (side: number): THREE.Group => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.24, 1.38, 0);
    add(arm, new THREE.CapsuleGeometry(0.056, 0.16, 6, 10), shirtMat, 0, -0.12, 0, true);
    add(arm, new THREE.CapsuleGeometry(0.044, 0.22, 6, 10), isGuard || isAC || outfit === 'elvis' ? shirtMat : skinMat, 0, -0.34, 0, true);
    add(arm, new THREE.SphereGeometry(0.046, 8, 8), skinMat, 0, -0.5, 0);
    return arm;
  };
  const leftArm = buildArm(1);
  const rightArm = buildArm(-1);
  g.add(leftArm, rightArm);

  let flashMat: THREE.MeshBasicMaterial | null = null;
  if (isAC) {
    // Catch-pole: long aluminum pole with a cable loop at the end
    const pole = add(rightArm, new THREE.CylinderGeometry(0.02, 0.02, 1.9, 6), std(0xb8bcc6, 0.3, 0.8), 0, -0.5, 0.9);
    pole.rotation.x = Math.PI / 2;
    const loop = add(rightArm, new THREE.TorusGeometry(0.13, 0.012, 6, 16), std(0x222222, 0.5), 0, -0.5, 1.88);
    loop.rotation.y = Math.PI / 2;
  }
  if (isGuard) {
    const torch = add(rightArm, new THREE.CylinderGeometry(0.032, 0.028, 0.22, 8), std(0x1a1e26, 0.3, 0.8), 0, -0.5, 0.1);
    torch.rotation.x = Math.PI / 2;
    flashMat = new THREE.MeshBasicMaterial({ color: 0xffe69c, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
    const cone = add(rightArm, new THREE.ConeGeometry(1.4, 4.4, 14, 1, true), flashMat, 0, -0.5, 2.35);
    cone.rotation.x = -Math.PI / 2;
  }

  let cigMesh: THREE.Object3D | null = null;
  if (outfit === 'slapper') {
    const cards = add(rightArm, new THREE.BoxGeometry(0.09, 0.012, 0.13), std(0xffffff, 0.5), 0, -0.55, 0.05);
    cards.rotation.x = 0.4;
  } else if (outfit === 'tourist') {
    if (prop === 'yard-drink') {
      const cupMat = std([0xff33a6, 0x2de2ff, 0x7aff47][seed % 3], 0.15, 0, {
        emissive: [0xff1e8a, 0x00b7ff, 0x45d618][seed % 3],
        emissiveIntensity: 0.4,
      });
      add(rightArm, new THREE.CylinderGeometry(0.055, 0.032, 0.44, 10), cupMat, 0, -0.34, 0.16);
      add(rightArm, new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), std(0xffffff, 0.4), 0, -0.06, 0.16);
      rightArm.rotation.x = -0.55;
    } else if (prop === 'camera') {
      add(g, new THREE.BoxGeometry(0.14, 0.09, 0.07), std(0x1c1f28, 0.35), 0, 1.18, 0.17);
      const lensM = add(g, new THREE.CylinderGeometry(0.032, 0.035, 0.06, 10), std(0x0b0e14, 0.1, 0.8), 0, 1.18, 0.22);
      lensM.rotation.x = Math.PI / 2;
    } else if (prop === 'cig') {
      const cigGroup = new THREE.Group();
      const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.11, 8), std(0xf7f5f0, 0.7));
      paper.rotation.x = Math.PI / 2;
      cigGroup.add(paper);
      const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.008, 0.018, 8), new THREE.MeshBasicMaterial({ color: 0xff5a1f }));
      ember.rotation.x = Math.PI / 2;
      ember.position.z = 0.06;
      cigGroup.add(ember);
      cigGroup.position.set(0, -0.5, 0.09);
      rightArm.add(cigGroup);
      rightArm.rotation.x = -0.45;
      cigMesh = cigGroup;
    } else if (prop === 'bag') {
      add(leftArm, new THREE.BoxGeometry(0.24, 0.28, 0.1), std([0xe8486b, 0xf2efe6, 0x2b2b33][seed % 3], 0.55), 0.04, -0.62, 0);
    }
  }

  // Collapse ~35 primitive meshes into ~8 vertex-colored ones (limbs stay separately animated).
  for (const part of [g, head, leftArm, rightArm, leftLeg, rightLeg]) bakeGroup(part);

  return { group: g, leftArm, rightArm, leftLeg, rightLeg, head, cigMesh, flashMat };
}

const tmpV = new THREE.Vector3();

export class StripCrowdSystem {
  public readonly tourists: TouristNPC[] = [];
  public readonly performers: PerformerNPC[] = [];
  public readonly guards: GuardNPC[] = [];
  public readonly pursuers: PursuerNPC[] = [];
  private pursuerSeq = 0;
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene, config: CrowdConfig) {
    this.scene = scene;

    config.tourists.forEach((r, idx) => {
      const built = buildHuman(idx + 3, 'tourist', r.prop);
      const waypoints = r.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
      built.group.position.copy(waypoints[0]);
      scene.add(built.group);
      this.tourists.push({
        ...built,
        id: idx,
        mesh: built.group,
        waypoints,
        wpIndex: 1 % waypoints.length,
        speed: 1.35 + (idx % 4) * 0.25,
        pauseTimer: 0,
        begCooldown: 0,
        reactCooldown: 0,
        hasCig: r.prop === 'cig',
        hasCamera: r.prop === 'camera',
        cigStolen: false,
        speechSprite: null,
        speechTimer: 0,
        walkPhase: idx * 1.1,
        lookAtCat: 0,
      });
    });

    config.performers.forEach((p, idx) => {
      const built = buildHuman(idx * 7 + 2, p.kind, 'none');
      built.group.position.set(p.x, 0, p.z);
      built.group.rotation.y = p.facing;
      scene.add(built.group);
      this.performers.push({
        ...built,
        id: idx,
        kind: p.kind,
        mesh: built.group,
        begCooldown: 0,
        speechSprite: null,
        speechTimer: 0,
        chatterTimer: 3 + idx * 2.3,
      });
    });

    config.guards.forEach((gr, idx) => {
      const built = buildHuman(idx + 1, 'guard', 'none');
      const waypoints = gr.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
      built.group.position.copy(waypoints[0]);
      scene.add(built.group);
      this.guards.push({
        ...built,
        id: idx,
        mesh: built.group,
        waypoints,
        wpIndex: 1,
        casinoName: gr.name,
        kickPoint: new THREE.Vector3(gr.kick[0], 0, gr.kick[1]),
        zone: gr.zone,
        walkPhase: idx * 2.0,
        mode: 'patrol',
        lostTimer: 0,
        speechSprite: null,
        speechTimer: 0,
      });
    });
  }

  private setSpeech(holder: { mesh: THREE.Group; speechSprite: THREE.Sprite | null; speechTimer: number }, text: string, duration: number, accent?: string): void {
    if (holder.speechSprite) {
      holder.mesh.remove(holder.speechSprite);
      holder.speechSprite.material.map?.dispose();
      holder.speechSprite.material.dispose();
    }
    const mat = new THREE.SpriteMaterial({ map: makeSpeechTexture(text, accent), transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(0, 2.32, 0);
    sprite.scale.set(2.3, 0.72, 1);
    holder.mesh.add(sprite);
    holder.speechSprite = sprite;
    holder.speechTimer = duration;
  }

  private tickSpeech(holder: { mesh: THREE.Group; speechSprite: THREE.Sprite | null; speechTimer: number }, dt: number): void {
    if (holder.speechTimer <= 0) return;
    holder.speechTimer -= dt;
    if (holder.speechTimer <= 0 && holder.speechSprite) {
      holder.mesh.remove(holder.speechSprite);
      holder.speechSprite.material.map?.dispose();
      holder.speechSprite.material.dispose();
      holder.speechSprite = null;
    }
  }

  public spawnPursuer(kind: 'ac' | 'cop', x: number, z: number): PursuerNPC {
    const built = buildHuman(40 + this.pursuerSeq, kind === 'ac' ? 'animal-control' : 'officer', 'none');
    built.group.position.set(x, 0, z);
    this.scene.add(built.group);
    const p: PursuerNPC = {
      ...built,
      id: this.pursuerSeq++,
      kind,
      mesh: built.group,
      speed: kind === 'ac' ? 6.0 : 6.7,
      walkPhase: 0,
      speechSprite: null,
      speechTimer: 0,
      shoutTimer: 1 + Math.random() * 2,
    };
    this.pursuers.push(p);
    return p;
  }

  /** A one-off pedestrian (e.g. the driver Lou just yanked out of their car). */
  public spawnBystander(x: number, z: number, toX: number, toZ: number, line: string, knockDir?: [number, number]): TouristNPC {
    const idx = this.tourists.length;
    const built = buildHuman(idx + 77, 'tourist', 'none');
    built.group.position.set(x, 0, z);
    this.scene.add(built.group);
    const t: TouristNPC = {
      ...built,
      id: idx,
      mesh: built.group,
      waypoints: [new THREE.Vector3(toX, 0, toZ), new THREE.Vector3(toX + 6, 0, toZ + 6)],
      wpIndex: 0,
      speed: 2.6,
      pauseTimer: 0,
      begCooldown: 30,
      reactCooldown: 20,
      hasCig: false,
      hasCamera: false,
      cigStolen: false,
      speechSprite: null,
      speechTimer: 0,
      walkPhase: 0,
      lookAtCat: 0,
    };
    this.tourists.push(t);
    if (knockDir) this.knockdown(t, knockDir[0], knockDir[1], 3.5);
    this.setSpeech(t, line, 3.2, '#ff8a3d');
    return t;
  }

  public removePursuer(p: PursuerNPC): void {
    this.scene.remove(p.mesh);
    const i = this.pursuers.indexOf(p);
    if (i >= 0) this.pursuers.splice(i, 1);
  }

  /** Move pursuers toward the cat (or its last known spot). Returns the pursuer that caught it, if any. */
  public updatePursuers(dt: number, target: THREE.Vector3, chasing: boolean, canCatch: boolean): PursuerNPC | null {
    let caught: PursuerNPC | null = null;
    for (const p of this.pursuers) {
      this.tickSpeech(p, dt);
      if (this.tickKnock(p, dt)) continue;
      tmpV.copy(target).sub(p.mesh.position);
      tmpV.y = 0;
      const d = tmpV.length();
      if (canCatch && chasing && d < 0.95) caught = p;
      if (d < 0.6) continue;
      tmpV.normalize();
      const speed = chasing ? p.speed : 2.4;
      p.mesh.position.addScaledVector(tmpV, speed * dt);
      p.mesh.rotation.y = Math.atan2(tmpV.x, tmpV.z);
      p.walkPhase += dt * (chasing ? 12 : 7);
      const swing = Math.sin(p.walkPhase) * (chasing ? 0.85 : 0.5);
      p.leftLeg.rotation.x = swing;
      p.rightLeg.rotation.x = -swing;
      p.leftArm.rotation.x = -swing * 0.7;
      p.rightArm.rotation.x = p.kind === 'ac' ? -1.1 : -swing * 0.7;
      p.shoutTimer -= dt;
      if (chasing && p.shoutTimer <= 0 && d < 30) {
        p.shoutTimer = 5 + Math.random() * 4;
        const lines = PURSUER_LINES[p.kind];
        this.setSpeech(p, lines[Math.floor(Math.random() * lines.length)], 2.4, p.kind === 'ac' ? '#9fd46a' : '#5a8cff');
      }
    }
    return caught;
  }

  /** Everyone on foot the cat can bowl over. */
  public allPeople(): Array<TouristNPC | PerformerNPC | GuardNPC | PursuerNPC> {
    return [...this.tourists, ...this.performers, ...this.guards, ...this.pursuers];
  }

  /** Knock someone over, pushed away along (dx, dz). */
  public knockdown(npc: Rig & { mesh: THREE.Group }, dx: number, dz: number, power: number): void {
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    npc.mesh.rotation.y = Math.atan2(-dx, -dz);
    npc.knock = { t: 0, vx: dx * power, vz: dz * power, yaw: npc.mesh.rotation.y };
  }

  public say(npc: { mesh: THREE.Group; speechSprite: THREE.Sprite | null; speechTimer: number }, text: string, duration = 2.6, accent?: string): void {
    this.setSpeech(npc, text, duration, accent);
  }

  /** Returns true while the person is down (callers skip their normal behaviour). */
  private tickKnock(npc: Rig & { mesh: THREE.Group }, dt: number): boolean {
    const k = npc.knock;
    if (!k) return false;
    k.t += dt;
    const m = npc.mesh;
    m.rotation.y = k.yaw;
    if (k.t < 0.35) m.rotation.x = (-Math.PI / 2) * (k.t / 0.35);
    else if (k.t < 3.2) m.rotation.x = -Math.PI / 2;
    else if (k.t < 3.8) m.rotation.x = (-Math.PI / 2) * (1 - (k.t - 3.2) / 0.6);
    else {
      m.rotation.x = 0;
      m.position.y = 0;
      npc.knock = null;
      return false;
    }
    m.position.x += k.vx * dt;
    m.position.z += k.vz * dt;
    const damp = Math.max(0, 1 - dt * 3.5);
    k.vx *= damp;
    k.vz *= damp;
    m.position.y = k.t < 0.3 ? Math.sin((k.t / 0.3) * Math.PI) * 0.35 : 0.05;
    const flail = k.t < 3.2 ? Math.sin(k.t * 18) * (k.t < 0.8 ? 1.2 : 0.25) : 0;
    npc.leftArm.rotation.x = -1.4 + flail;
    npc.rightArm.rotation.x = -1.4 - flail;
    npc.leftLeg.rotation.x = 0.3 + flail * 0.5;
    npc.rightLeg.rotation.x = -0.3 - flail * 0.5;
    return true;
  }

  public showTouristSpeech(tourist: TouristNPC, text: string, duration = 3.0): void {
    this.setSpeech(tourist, text, duration);
  }

  public showPerformerSpeech(p: PerformerNPC, text: string, duration = 3.0): void {
    this.setSpeech(p, text, duration, '#ff7ac8');
  }

  public nearestPerformer(pos: THREE.Vector3, maxDist: number): PerformerNPC | null {
    let best: PerformerNPC | null = null;
    let bestD = maxDist;
    for (const p of this.performers) {
      const d = p.mesh.position.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Tourists near a big vape cloud react. Returns how many cheered and the tips they threw. */
  public reactToCloud(origin: THREE.Vector3, tipMult: number): { cheers: number; tips: number; coughs: number } {
    let cheers = 0;
    let tips = 0;
    let coughs = 0;
    for (const t of this.tourists) {
      if (t.reactCooldown > 0) continue;
      const d = t.mesh.position.distanceTo(origin);
      if (d > 7.5) continue;
      t.reactCooldown = 14;
      t.lookAtCat = 2.5;
      const roll = Math.random();
      if (roll < 0.42 + Math.min(0.25, tipMult * 0.05)) {
        const tip = Math.round((2 + Math.floor(Math.random() * 6)) * tipMult);
        tips += tip;
        cheers += 1;
        this.setSpeech(t, ['Sick clouds!! +$' + tip, 'Do an O-ring! +$' + tip, 'Cloud chaser kitty! +$' + tip][Math.floor(Math.random() * 3)], 2.8);
      } else if (roll < 0.8) {
        coughs += 1;
        this.setSpeech(t, ['*cough* Ugh, kitty!', 'Not in my face!', 'Is that… cotton candy?'][Math.floor(Math.random() * 3)], 2.4);
      } else {
        this.setSpeech(t, 'Filming this for my story', 2.4);
      }
    }
    return { cheers, tips, coughs };
  }

  /** Guards in the casino the cat is standing in, who can see it, start chasing. */
  public alertGuards(catPos: THREE.Vector3, radius: number): GuardNPC[] {
    const alerted: GuardNPC[] = [];
    for (const g of this.guards) {
      const z = g.zone;
      if (catPos.x < z.minX || catPos.x > z.maxX || catPos.z < z.minZ || catPos.z > z.maxZ) continue;
      if (g.mesh.position.distanceTo(catPos) > radius) continue;
      if (g.mode !== 'chase') {
        g.mode = 'chase';
        g.lostTimer = 0;
        this.setSpeech(g, ['HEY! Stop that cat!', 'Security! Freeze, kitty!', 'You can’t swipe in here!'][g.id % 3], 2.6, '#ff4d4d');
      }
      alerted.push(g);
    }
    return alerted;
  }

  public anyChasing(): boolean {
    return this.guards.some((g) => g.mode === 'chase');
  }

  /** How close the nearest chasing guard is, 0 (far) → 1 (on you). */
  public heat(catPos: THREE.Vector3): number {
    let h = 0;
    for (const g of this.guards) {
      if (g.mode !== 'chase') continue;
      const d = g.mesh.position.distanceTo(catPos);
      h = Math.max(h, THREE.MathUtils.clamp(1 - (d - 1) / 16, 0.15, 1));
    }
    return h;
  }

  public update(
    dt: number,
    elapsed: number,
    catPos: THREE.Vector3,
    events: { onCaught: (g: GuardNPC) => void; onEscaped: (g: GuardNPC) => void }
  ): void {
    for (const t of this.tourists) {
      if (t.begCooldown > 0) t.begCooldown = Math.max(0, t.begCooldown - dt);
      if (t.reactCooldown > 0) t.reactCooldown = Math.max(0, t.reactCooldown - dt);
      this.tickSpeech(t, dt);
      if (this.tickKnock(t, dt)) continue;

      const far = t.mesh.position.distanceToSquared(catPos) > 110 * 110;
      t.mesh.visible = !far;

      if (t.lookAtCat > 0) {
        t.lookAtCat -= dt;
        tmpV.copy(catPos).sub(t.mesh.position);
        t.mesh.rotation.y = Math.atan2(tmpV.x, tmpV.z);
        t.leftLeg.rotation.x = THREE.MathUtils.lerp(t.leftLeg.rotation.x, 0, dt * 8);
        t.rightLeg.rotation.x = THREE.MathUtils.lerp(t.rightLeg.rotation.x, 0, dt * 8);
        continue;
      }

      if (t.pauseTimer > 0) {
        t.pauseTimer -= dt;
        t.leftLeg.rotation.x = THREE.MathUtils.lerp(t.leftLeg.rotation.x, 0, dt * 8);
        t.rightLeg.rotation.x = THREE.MathUtils.lerp(t.rightLeg.rotation.x, 0, dt * 8);
        t.head.rotation.y = Math.sin(elapsed * 2 + t.id) * 0.25;
        continue;
      }

      const target = t.waypoints[t.wpIndex];
      tmpV.copy(target).sub(t.mesh.position);
      tmpV.y = 0;
      const dist = tmpV.length();
      if (dist < 0.35) {
        t.wpIndex = (t.wpIndex + 1) % t.waypoints.length;
        if (t.id % 3 === 0) t.pauseTimer = 1.6 + (t.id % 4);
      } else {
        tmpV.normalize();
        t.mesh.position.addScaledVector(tmpV, t.speed * dt);
        t.mesh.rotation.y = Math.atan2(tmpV.x, tmpV.z);
        if (far) continue;
        t.walkPhase += dt * t.speed * 3.8;
        const swing = Math.sin(t.walkPhase) * 0.55;
        t.leftLeg.rotation.x = swing;
        t.rightLeg.rotation.x = -swing;
        t.leftArm.rotation.x = -swing * 0.65;
        if (!t.hasCig || t.cigStolen) {
          t.rightArm.rotation.x = t.hasCamera ? -0.3 : swing * 0.65;
        } else {
          const drag = Math.max(0, Math.sin(elapsed * 1.1 + t.id));
          t.rightArm.rotation.x = -0.45 - drag * 0.65;
        }
        t.mesh.position.y = Math.abs(Math.sin(t.walkPhase)) * 0.035;
      }
    }

    for (const p of this.performers) {
      if (p.begCooldown > 0) p.begCooldown = Math.max(0, p.begCooldown - dt);
      this.tickSpeech(p, dt);
      if (this.tickKnock(p, dt)) continue;
      const near = p.mesh.position.distanceToSquared(catPos) < 90 * 90;
      p.mesh.visible = near;
      if (!near) continue;
      // Idle performance loops
      if (p.kind === 'elvis') {
        p.rightArm.rotation.x = -1.4 + Math.sin(elapsed * 3 + p.id) * 0.5;
        p.rightArm.rotation.z = -0.3;
        p.leftLeg.rotation.z = Math.max(0, Math.sin(elapsed * 6 + p.id)) * 0.25;
        p.mesh.position.y = Math.abs(Math.sin(elapsed * 6)) * 0.02;
      } else if (p.kind === 'showgirl') {
        p.leftArm.rotation.z = 0.9 + Math.sin(elapsed * 1.6 + p.id) * 0.15;
        p.rightArm.rotation.z = -0.9 - Math.sin(elapsed * 1.6 + p.id) * 0.15;
        p.head.rotation.y = Math.sin(elapsed * 0.8 + p.id) * 0.3;
      } else {
        const slap = Math.max(0, Math.sin(elapsed * 7 + p.id * 3));
        p.rightArm.rotation.x = -0.9 + slap * 0.5;
        p.head.rotation.y = Math.sin(elapsed * 1.3 + p.id) * 0.5;
      }
      p.chatterTimer -= dt;
      if (p.chatterTimer <= 0 && p.mesh.position.distanceTo(catPos) < 26) {
        p.chatterTimer = 9 + Math.random() * 8;
        const lines = PERFORMER_LINES[p.kind];
        this.setSpeech(p, lines[Math.floor(Math.random() * lines.length)], 2.8, '#ff7ac8');
      }
    }

    for (const g of this.guards) {
      this.tickSpeech(g, dt);
      if (this.tickKnock(g, dt)) continue;
      const z = g.zone;
      const catInZone = catPos.x > z.minX - 2 && catPos.x < z.maxX + 2 && catPos.z > z.minZ - 2 && catPos.z < z.maxZ + 2;
      let speed = 2.2;
      let target: THREE.Vector3;

      if (g.mode === 'chase') {
        speed = 5.9; // faster than a prowl (5.2), slower than a sprint (9)
        target = catPos;
        const d = g.mesh.position.distanceTo(catPos);
        if (d < 0.95) {
          g.mode = 'return';
          events.onCaught(g);
        } else if (!catInZone || d > 20) {
          g.lostTimer += dt;
          if (g.lostTimer > (catInZone ? 2.5 : 0.8)) {
            g.mode = 'return';
            this.setSpeech(g, 'Lost the cat… back to my post.', 2.2);
            events.onEscaped(g);
          }
        } else {
          g.lostTimer = 0;
        }
      } else if (g.mode === 'return') {
        target = g.waypoints[g.wpIndex];
        if (g.mesh.position.distanceTo(target) < 0.6) g.mode = 'patrol';
      } else {
        target = g.waypoints[g.wpIndex];
      }

      if (g.flashMat) {
        g.flashMat.color.setHex(g.mode === 'chase' ? (Math.floor(elapsed * 6) % 2 ? 0xff3030 : 0x3060ff) : 0xffe69c);
        g.flashMat.opacity = g.mode === 'chase' ? 0.22 : 0.12;
      }

      tmpV.copy(target).sub(g.mesh.position);
      tmpV.y = 0;
      if (g.mode === 'patrol' && tmpV.length() < 0.4) {
        g.wpIndex = (g.wpIndex + 1) % g.waypoints.length;
        continue;
      }
      if (tmpV.lengthSq() < 1e-4) continue;
      tmpV.normalize();
      g.mesh.position.addScaledVector(tmpV, speed * dt);
      g.mesh.rotation.y = Math.atan2(tmpV.x, tmpV.z);
      g.walkPhase += dt * (g.mode === 'chase' ? 12 : 7.2);
      const swing = Math.sin(g.walkPhase) * (g.mode === 'chase' ? 0.8 : 0.5);
      g.leftLeg.rotation.x = swing;
      g.rightLeg.rotation.x = -swing;
      g.leftArm.rotation.x = -swing * 0.6;
      g.rightArm.rotation.x = g.mode === 'chase' ? -1.2 : -0.35;
    }
  }
}
