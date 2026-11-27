import * as THREE from 'three';
import { applyHeft, BONE, Body, bodyGeometry, boneShift, FACE, HEAD_C, JOINT, npcMaterial, PARENT, PRINT, recipeBody, type HairStyle, type Palette, type Recipe } from './humanKit';

export type TouristProp = 'yard-drink' | 'camera' | 'cig' | 'bag' | 'none';
export type Outfit = 'tourist' | 'guard' | 'elvis' | 'showgirl' | 'slapper' | 'officer' | 'animal-control' | 'worker' | 'robot' | 'statue' | 'water';
/** Street performers. robot/statue are generic costumed acts; water = a bottled-water seller with a cooler. */
export type PerformerKind = 'elvis' | 'showgirl' | 'slapper' | 'robot' | 'statue' | 'water';

export interface TouristRoute {
  pts: Array<[number, number]>;
  prop: TouristProp;
}
export interface PerformerSpot {
  kind: PerformerKind;
  x: number;
  z: number;
  facing: number;
  /** Standing height (living statues stand on a pedestal). */
  y?: number;
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
  y0: number;
}

export interface Rig {
  knock?: KnockState | null;
  group: THREE.Group;
  /** Upper arms, thighs and the head (bones: rotate them to pose the person). */
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  head: THREE.Object3D;
  /** Hips, spine, forearms and shins: the rest of the skeleton (see poseRig / idleRig / sitRig). */
  hips: THREE.Object3D;
  spine: THREE.Object3D;
  leftFore: THREE.Object3D;
  rightFore: THREE.Object3D;
  leftShin: THREE.Object3D;
  rightShin: THREE.Object3D;
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
  /** Carrying a yard-long drink in the right hand. */
  holdsDrink: boolean;
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

const SKIN_TONES = [0xf6d3b8, 0xe2ae88, 0xc88c64, 0x9b6342, 0x6b412a, 0xf0c3a0, 0xb87a52, 0x4e2e1c];
const HAIR_COLORS = [0x1c1512, 0x4a2e1b, 0x9c6b30, 0xd8b158, 0x7b2c25, 0x8e939e, 0x2a1a10, 0x6b4426];
const SHIRT_COLORS = [0xff5a7a, 0x2ec4ff, 0xffc83d, 0x4de088, 0xb874ff, 0xff7b3b, 0xf2f0eb, 0x26354d];
const PANTS_COLORS = [0x212c42, 0x2c2b30, 0x453b31, 0x3b4d6b, 0xd6cbb8];

const PERFORMER_LINES: Record<PerformerKind, string[]> = {
  elvis: ['Thank you, thank you very much', 'Photo with the King? $20!', 'Viva Las Vegas, baby!', 'Ain’t nothin’ but a hound cat'],
  showgirl: ['Photos with the showgirls!', 'Tips appreciated, darling', 'Strike a pose, kitty!', 'Feathers out!'],
  slapper: ['*slap slap* Free entry tonight!', 'VIP list, VIP list!', 'Club promos here!', '*slap* *slap*'],
  robot: ['*beep boop* PHOTO: $5', 'DANCE MODE: ENGAGED', 'I AM NOT A ROBOT. TIPS.', '*servo whirr*'],
  statue: ['…', '*blinks*', '(does not move)', '*winks at the cat*'],
  water: ['Water! One dollar! Ice cold!', 'Stay hydrated, kitty', 'Water, water, water!', 'Gatorade three bucks!'],
};

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

// ---------------------------------------------------------------- people
// Every person is ONE skinned mesh on an 11-bone skeleton (hips, spine, head, upper arms, forearms, thighs, shins):
// the body comes from humanKit's recipe (real proportions, a shaped head with a painted face, hair, hands, shoes)
// with the outfit's extras baked in, coloured per vertex and shared by everyone who looks the same. Two levels of
// detail swap by camera distance. Only special bits (glowing yard cups, the cigarette, the guard's torch beam)
// add their own small meshes. The bones ARE the Rig's limbs, so `leftLeg.rotation.x = …` still poses them.
const NEAR_IN = 19 * 19;
const NEAR_OUT = 23 * 23;
const BONE_INV = JOINT.map(([x, y, z]) => new THREE.Matrix4().makeTranslation(-x, -y, -z));
const ID4 = new THREE.Matrix4();
const npcGeoCache = new Map<string, THREE.BufferGeometry>();
const _wp = new THREE.Vector3();

let cigParts: { paper: THREE.BufferGeometry; ember: THREE.BufferGeometry; paperMat: THREE.Material; emberMat: THREE.Material } | null = null;
const cupMats = new Map<number, THREE.MeshStandardMaterial>();

const MALE_HAIR: HairStyle[] = ['short', 'side', 'buzz', 'bald', 'curly', 'short', 'side'];
const FEMALE_HAIR: HairStyle[] = ['long', 'pony', 'bun', 'curly', 'long', 'side', 'long'];

/** A small deterministic random stream per person. */
function personRng(seed: number): () => number {
  let s = (Math.imul(seed + 0x9e37, 2654435761) ^ 0x5bd1e995) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];

interface Look {
  recipe: Recipe;
  pal: Palette;
  paint: { face: number; print: number; brow: number; printAcc: number };
  hatCol: number;
  outfit: Outfit;
  prop: TouristProp;
  camera: boolean;
}

/** What a person wears, from their outfit and seed (tourists vary a lot; uniforms don't). */
function lookFor(seed: number, outfit: Outfit, prop: TouristProp): Look {
  const R = personRng(seed * 31 + outfit.length);
  const tourist = outfit === 'tourist';
  const female = outfit === 'showgirl' || (tourist && seed % 2 === 1) || (outfit === 'worker' && seed % 2 === 1);
  const painted = outfit === 'robot' ? 0xc4c8d0 : outfit === 'statue' ? 0xc8a24a : 0;
  const skin = painted || SKIN_TONES[seed % SKIN_TONES.length];
  const hairCol = painted || (outfit === 'elvis' ? 0x0b0b10 : HAIR_COLORS[(seed * 3) % HAIR_COLORS.length]);
  const r: Recipe = { female, legs: 'pants', arms: 'short', skirt: 'none', hair: 'short', hat: 'none', collar: false, jacket: false, bag: 'none', phone: false, heft: 1, shoe: 'sneaker' };
  const pal: Palette = { skin, top: 0xffffff, bottom: 0x22252c, shoe: 0x1a1a1e, hair: hairCol, acc: 0xf2f2f0 };
  const paint: Look['paint'] = { face: 0, print: PRINT.plain, brow: hairCol === 0xd8b158 || hairCol === 0xe6cf8a ? 0x8a6a3a : hairCol, printAcc: 0xffffff };
  let hatCol = 0x111111;
  let camera = false;
  if (painted) {
    Object.assign(pal, { top: painted, bottom: painted, shoe: painted, acc: painted });
    r.arms = 'long';
    r.hair = outfit === 'statue' ? 'curly' : 'buzz';
    paint.brow = painted;
  } else if (outfit === 'guard' || outfit === 'officer') {
    Object.assign(pal, { top: outfit === 'guard' ? 0x1a2340 : 0x1b2433, bottom: outfit === 'guard' ? 0x10141f : 0x141a26, shoe: 0x0c0d12 });
    Object.assign(r, { arms: 'long', collar: true, hair: 'buzz', hat: 'none', heft: [1, 1.08, 1.18][seed % 3], shoe: 'boot' });
    paint.face = FACE.shades | (seed % 2 ? FACE.stubble : 0);
  } else if (outfit === 'animal-control') {
    Object.assign(pal, { top: 0xc2a878, bottom: 0x4a4f36, shoe: 0x2a2018 });
    Object.assign(r, { arms: 'long', collar: true, hair: 'buzz', hat: 'cap', shoe: 'boot', heft: 1.1 });
    hatCol = 0x4a4f36;
    paint.face = FACE.shades | FACE.stubble;
  } else if (outfit === 'worker') {
    Object.assign(pal, { top: 0xf4f4f4, bottom: 0x2a2a2e, shoe: 0x111111 });
    Object.assign(r, { hair: female ? 'pony' : 'short', collar: true });
    paint.face = female ? FACE.lashes : 0;
  } else if (outfit === 'elvis') {
    Object.assign(pal, { top: 0xf4f1ea, bottom: 0xf4f1ea, shoe: 0xf4f1ea });
    Object.assign(r, { arms: 'long', hair: 'short', heft: 1.12, shoe: 'boot' });
    paint.face = FACE.shades;
    paint.print = PRINT.sequins;
    paint.printAcc = 0xf4c44e;
  } else if (outfit === 'showgirl') {
    Object.assign(pal, { top: 0xff3fa4, bottom: 0xe0a080, shoe: 0xffd34d });
    Object.assign(r, { arms: 'bare', legs: 'bare', hair: 'bun', shoe: 'heel', heft: 0.94 });
    paint.face = FACE.lipstick | FACE.lashes;
    paint.print = PRINT.sequins;
    paint.printAcc = 0xffd0f0;
  } else if (outfit === 'slapper') {
    Object.assign(pal, { top: 0x8cff3a, bottom: 0x1c1f2a, shoe: 0x0c0d12 });
    Object.assign(r, { hat: 'cap', hair: 'short' });
    hatCol = 0x111111;
    paint.print = PRINT.logo;
    paint.printAcc = 0x111111;
  } else if (outfit === 'water') {
    Object.assign(pal, { top: 0xf4f4f0, bottom: 0x2a3a5a, shoe: 0xe9e6de });
    Object.assign(r, { hat: 'cap', hair: 'short', heft: 1.1 });
    hatCol = 0x1e5fb8;
    paint.face = FACE.stubble;
  } else {
    // tourists: what people really wear on the Strip (shorts and tees by day, going-out clothes at night,
    // Hawaiian shirts, cowboy hats, sundresses, bachelorette sashes, fanny packs)
    const brights = [0xff5a7a, 0x2ec4ff, 0xffc83d, 0x4de088, 0xb874ff, 0xff7b3b, 0xf2f0eb, 0x26354d, 0x111111, 0xd8352b, 0x1e8c5a, 0xe8486b, 0x6a2a8a, 0x7fb8e0, 0xf4e04a, 0x8a5a3a];
    const bottoms = [0x2b3c5c, 0x3b4d6b, 0x5a6f8a, 0x1a1a1e, 0x2c2b30, 0xd6cbb8, 0x8a7a5a, 0x453b31, 0xf2f0eb, 0x6a6a70];
    pal.top = SHIRT_COLORS[(seed * 5) % SHIRT_COLORS.length];
    if (R() < 0.5) pal.top = pick(R, brights);
    pal.bottom = PANTS_COLORS[(seed * 7) % PANTS_COLORS.length];
    if (R() < 0.5) pal.bottom = pick(R, bottoms);
    pal.shoe = [0xe9e6de, 0x2a2b30, 0x8a5a34, 0xd23b3b, 0xf4f4f4, 0x1a1a1e][(seed * 11) % 6];
    pal.acc = pick(R, [0x2b2b33, 0xe8486b, 0x2e7bd8, 0xc8a070, 0x1a1a1e, 0xf2efe6]);
    r.heft = pick(R, [0.92, 1, 1, 1, 1.08, 1.16, 1.26]);
    r.hair = (female ? FEMALE_HAIR : MALE_HAIR)[(seed * 7 + 3) % (female ? FEMALE_HAIR.length : MALE_HAIR.length)];
    if (female) {
      const k = R();
      if (k < 0.2) {
        r.skirt = 'dress';
        r.arms = 'bare';
        r.shoe = R() < 0.5 ? 'heel' : 'sandal';
        if (R() < 0.35) {
          paint.print = PRINT.sequins;
          paint.printAcc = 0xffffff;
          pal.top = pick(R, [0x111111, 0xc8c8d0, 0xd4af37, 0xb0103a, 0x2a1a6a]);
        } else if (R() < 0.4) {
          paint.print = PRINT.floral;
          paint.printAcc = pick(R, [0xfff4f0, 0xff8ab0, 0xffd84a]);
        }
      } else if (k < 0.36) {
        r.skirt = 'skirt';
        r.arms = R() < 0.5 ? 'bare' : 'short';
        r.shoe = R() < 0.4 ? 'sandal' : 'sneaker';
      } else if (k < 0.68) {
        r.legs = 'shorts';
        r.arms = R() < 0.45 ? 'bare' : 'short';
        if (R() < 0.3) r.shoe = 'sandal';
      } else r.arms = R() < 0.25 ? 'long' : 'short';
      if (R() < 0.1) {
        paint.print = PRINT.sash; // the bachelorette
        paint.printAcc = pick(R, [0xffffff, 0xff7ac8]);
      }
      paint.face = (R() < 0.55 ? FACE.lipstick : 0) | FACE.lashes;
      if (R() < 0.25) r.bag = 'shoulder';
    } else {
      if (R() < 0.42) r.legs = 'shorts';
      r.arms = R() < 0.1 ? 'bare' : 'short';
      if (R() < 0.12) {
        r.jacket = true;
        r.arms = 'long';
        r.legs = 'pants';
        pal.acc = pick(R, [0xf2f0eb, 0x111111, 0x9ab8d8]);
      } else if (R() < 0.22) r.collar = true;
      if (r.legs === 'shorts' && R() < 0.25) r.shoe = 'sandal';
      if (R() < 0.4) paint.face |= FACE.stubble;
    }
    if (R() < 0.22) {
      paint.print = PRINT.floral; // the Hawaiian shirt
      paint.printAcc = pick(R, [0xffe066, 0xff6b9e, 0x63f5b8, 0xffffff]);
      r.arms = 'short';
      r.collar = !female;
    } else if (!paint.print && !r.jacket) {
      const pr = R();
      if (pr < 0.12) {
        paint.print = PRINT.stripes;
        paint.printAcc = pick(R, [0xffffff, 0x111111, 0x26354d]);
      } else if (pr < 0.2 && !female) {
        paint.print = PRINT.plaid;
        paint.printAcc = pick(R, [0x111111, 0xd8352b, 0xf2f0eb]);
        r.arms = 'long';
      } else if (pr < 0.36) {
        paint.print = PRINT.logo;
        paint.printAcc = pick(R, [0xffffff, 0x111111, 0xffc83d]);
      }
    }
    if (seed % 4 === 0) paint.face |= FACE.shades;
    if (R() < 0.2 && skin === 0xf6d3b8) paint.face |= FACE.blueEyes;
    if (seed % 4 === 1) {
      r.hat = 'cap';
      hatCol = [0xd9362b, 0x2665d8, 0x28995a, 0xf2f2f0, 0x111111][seed % 5];
    } else if (seed % 9 === 4 || (female && seed % 5 === 3)) {
      r.hat = 'wide'; // a cowboy hat, or a sun hat
      hatCol = female ? 0xe6cf98 : [0xd8c49a, 0x2a2018, 0xf2efe6][seed % 3];
    }
    if (r.bag === 'none' && seed % 6 === 5) r.bag = 'fanny';
    else if (r.bag === 'none' && R() < 0.08) r.bag = 'backpack';
    camera = prop === 'camera';
  }
  return { recipe: r, pal, paint, hatCol, outfit, prop, camera };
}

/** The outfit's own bits on top of the recipe body (badges, the King's cape, feathers, props carried in a hand). */
function outfitExtras(b: Body, L: Look, seed: number): void {
  const near = b.lod === 0;
  const o = L.outfit;
  const gold = 0xf4c44e;
  const [, hy, hz] = HEAD_C;
  const S = BONE.spine;
  const Hd = BONE.head;
  const chestZ = L.recipe.female ? 0.104 : 0.112;
  if (o === 'guard' || o === 'officer') {
    b.fixed(new THREE.BoxGeometry(0.036, 0.25, 0.012), S, o === 'officer' ? 0x0c0f16 : 0x5a1018, 0, 1.3, chestZ + 0.006); // tie
    b.fixed(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 10), S, gold, 0.072, 1.33, chestZ + 0.004, Math.PI / 2); // badge
    b.fixed(new THREE.BoxGeometry(0.05, 0.03, 0.01), S, 0xd8d8d8, -0.075, 1.34, chestZ + 0.002); // name tag
    b.fixed(new THREE.BoxGeometry(0.035, 0.09, 0.03), S, 0x111111, -0.13, 1.36, 0.07, 0, 0, 0.2); // radio
    if (o === 'officer') {
      b.fixed(new THREE.CylinderGeometry(0.195, 0.18, 0.36, 14, 1, true), S, 0x22262e, 0, 1.22, 0, 0, 0, 0, 1, 1, 0.72); // vest
      b.fixed(new THREE.CylinderGeometry(0.18, 0.18, 0.07, 14, 1, true), BONE.hips, 0x111111, 0, 0.98, 0, 0, 0, 0, 1, 1, 0.74); // duty belt
      b.fixed(new THREE.BoxGeometry(0.06, 0.15, 0.1), BONE.hips, 0x111111, -0.18, 0.92, 0.02);
      b.fixed(new THREE.BoxGeometry(0.08, 0.05, 0.02), S, 0x9fb4d0, 0.1, 1.33, chestZ + 0.03);
    }
    // the peaked cap
    b.fixed(new THREE.CylinderGeometry(0.1, 0.092, 0.07, near ? 16 : 8), Hd, 0x13192b, 0, hy + 0.075, hz - 0.005);
    b.fixed(new THREE.CylinderGeometry(0.115, 0.1, 0.03, near ? 16 : 8), Hd, 0x13192b, 0, hy + 0.12, hz, -0.08);
    b.fixed(new THREE.SphereGeometry(1, near ? 12 : 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), Hd, 0x080a10, 0, hy + 0.052, hz + 0.07, 0.25, 0, 0, 0.085, 0.012, 0.07);
    b.fixed(new THREE.BoxGeometry(0.03, 0.035, 0.008), Hd, gold, 0, hy + 0.1, hz + 0.105, -0.08);
    const [ex, ey, ez] = JOINT[BONE.foreR];
    b.fixed(new THREE.CylinderGeometry(0.022, 0.026, 0.24, 8), BONE.foreR, 0x1a1e26, ex, ey - 0.34, ez + 0.035); // the torch, along the forearm
  } else if (o === 'animal-control') {
    b.fixed(new THREE.BoxGeometry(0.09, 0.06, 0.012), S, 0x2d5a2d, -0.08, 1.3, chestZ + 0.004);
    b.fixed(new THREE.BoxGeometry(0.07, 0.05, 0.012), S, 0x2d5a2d, 0.08, 1.3, chestZ + 0.004);
    const [ex, ey, ez] = JOINT[BONE.foreR];
    b.fixed(new THREE.CylinderGeometry(0.016, 0.016, 1.9, 6), BONE.foreR, 0xb8bcc6, ex, ey - 0.3, ez + 0.9, Math.PI / 2);
    b.fixed(new THREE.TorusGeometry(0.13, 0.012, 4, 12), BONE.foreR, 0x222222, ex, ey - 0.3, ez + 1.88, 0, Math.PI / 2);
  } else if (o === 'worker') {
    b.fixed(new THREE.BoxGeometry(0.3, 0.5, 0.012), BONE.hips, 0xffffff, 0, 0.92, 0.125); // apron
    b.fixed(new THREE.BoxGeometry(0.31, 0.03, 0.014), BONE.hips, 0xd81e2a, 0, 1.06, 0.127);
    b.fixed(new THREE.BoxGeometry(0.2, 0.07, 0.15), Hd, 0xffffff, 0, hy + 0.095, hz - 0.005, -0.1); // paper hat
    b.fixed(new THREE.BoxGeometry(0.205, 0.02, 0.155), Hd, 0xd81e2a, 0, hy + 0.07, hz - 0.002, -0.1);
  } else if (o === 'elvis') {
    for (const s of [-1, 1]) b.fixed(new THREE.BoxGeometry(0.1, 0.15, 0.025), S, 0xf4f1ea, s * 0.075, 1.48, 0.05, 0, 0, s * 0.35); // the high collar
    b.fixed(new THREE.ConeGeometry(0.045, 0.2, 3), S, L.pal.skin, 0, 1.37, chestZ + 0.002, Math.PI, 0, 0, 1, 1, 0.25); // the deep V
    for (let i = 0; i < 10; i++) b.fixed(new THREE.SphereGeometry(0.011, 5, 4), S, gold, (i % 2 ? 1 : -1) * (0.05 + (i % 4) * 0.012), 1.08 + i * 0.03, chestZ + 0.006);
    b.fixed(new THREE.CylinderGeometry(0.172, 0.172, 0.06, 14, 1, true), BONE.hips, gold, 0, 1.0, 0, 0, 0, 0, 1, 1, 0.72); // the belt
    b.fixed(new THREE.BoxGeometry(0.14, 0.08, 0.02), BONE.hips, gold, 0, 1.0, 0.125);
    b.fixed(new THREE.BoxGeometry(0.44, 0.6, 0.016), S, 0xf4f1ea, 0, 1.13, -0.13, 0.08); // the cape
    b.fixed(new THREE.BoxGeometry(0.46, 0.03, 0.02), S, gold, 0, 1.42, -0.12);
    for (const s of [-1, 1]) {
      const sh = s > 0 ? BONE.shinL : BONE.shinR;
      const [kx] = JOINT[sh];
      b.fixed(new THREE.CylinderGeometry(0.058, 0.1, 0.22, 10, 1, true), sh, 0xf4f1ea, kx, 0.2, 0); // bell bottoms
    }
    b.fixed(new THREE.SphereGeometry(1, 12, 8), Hd, 0x0b0b10, 0, hy + 0.09, hz + 0.045, 0, 0, 0, 0.085, 0.05, 0.09); // the pompadour
    for (const s of [-1, 1]) b.fixed(new THREE.BoxGeometry(0.014, 0.075, 0.035), Hd, 0x0b0b10, s * 0.08, hy - 0.03, hz + 0.03); // sideburns
  } else if (o === 'showgirl') {
    for (let i = 0; i < 9; i++) {
      const a = -1.1 + i * 0.275;
      b.fixed(new THREE.ConeGeometry(0.08, 0.95, 5), S, i % 2 ? 0xff5fb6 : 0xfff0f8, Math.sin(a) * 0.42, 1.42 + Math.cos(a) * 0.4, -0.18, 0, 0, -a);
    }
    b.fixed(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14, 1, true), BONE.hips, gold, 0, 0.98, 0, 0, 0, 0, 1, 1, 0.72);
    b.fixed(new THREE.CylinderGeometry(0.11, 0.1, 0.05, 14), Hd, gold, 0, hy + 0.09, hz, -0.15);
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + i * 0.3;
      b.fixed(new THREE.ConeGeometry(0.032, 0.5, 5), Hd, i % 2 ? 0xff5fb6 : 0xfff0f8, Math.sin(a) * 0.17, hy + 0.33 + Math.cos(a) * 0.1, hz - 0.02, 0, 0, -a * 0.8);
    }
    for (const s of [-1, 1]) {
      const f = s > 0 ? BONE.foreL : BONE.foreR;
      const [ex, ey, ez] = JOINT[f];
      b.fixed(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 8, 1, true), f, gold, ex, ey - 0.22, ez);
    }
  } else if (o === 'slapper') {
    const [ex, ey, ez] = JOINT[BONE.foreR];
    b.fixed(new THREE.BoxGeometry(0.012, 0.09, 0.13), BONE.foreR, 0xffffff, ex - 0.03, ey - 0.33, ez + 0.05, 0.3); // the cards
  } else if (o === 'water') {
    const [ex, ey, ez] = JOINT[BONE.foreR];
    b.fixed(new THREE.CylinderGeometry(0.032, 0.032, 0.21, 8), BONE.foreR, 0xdff2ff, ex, ey - 0.34, ez + 0.05);
    b.fixed(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 8), BONE.foreR, 0x1e5fb8, ex, ey - 0.22, ez + 0.05);
  } else if (o === 'robot') {
    b.fixed(new THREE.BoxGeometry(0.28, 0.3, 0.28), Hd, 0xb8bcc6, 0, hy + 0.01, hz);
    b.fixed(new THREE.BoxGeometry(0.21, 0.07, 0.02), Hd, 0x30e0ff, 0, hy + 0.02, hz + 0.145);
    b.fixed(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 5), Hd, 0x9aa0aa, 0, hy + 0.24, hz);
    b.fixed(new THREE.SphereGeometry(0.03, 6, 4), Hd, 0xff3030, 0, hy + 0.34, hz);
    for (const s of [-1, 1]) b.fixed(new THREE.BoxGeometry(0.13, 0.13, 0.13), s > 0 ? BONE.armL : BONE.armR, 0x9aa0aa, s * 0.2, 1.33, 0);
  } else if (o === 'statue') {
    b.fixed(new THREE.TorusGeometry(0.1, 0.016, 5, 14), Hd, 0xa8822a, 0, hy + 0.05, hz - 0.01, Math.PI / 2 - 0.2);
  }
  if (L.camera) {
    b.fixed(new THREE.BoxGeometry(0.13, 0.085, 0.065), S, 0x1c1f28, 0, 1.16, chestZ + 0.045);
    b.fixed(new THREE.CylinderGeometry(0.03, 0.033, 0.06, 12), S, 0x0b0e14, 0, 1.16, chestZ + 0.1, Math.PI / 2);
    b.fixed(new THREE.BoxGeometry(0.012, 0.3, 0.012), S, 0x1c1f28, 0.06, 1.31, chestZ - 0.005, 0.25);
  }
  if (L.prop === 'bag') {
    // a shopping bag in the left hand
    const [ex, ey, ez] = JOINT[BONE.foreL];
    b.fixed(new THREE.BoxGeometry(0.1, 0.28, 0.24), BONE.foreL, [0xe8486b, 0xf2efe6, 0x2b2b33][seed % 3], ex + 0.03, ey - 0.5, ez + 0.01);
    b.fixed(new THREE.TorusGeometry(0.06, 0.007, 4, 10, Math.PI), BONE.foreL, 0x2b2b33, ex + 0.03, ey - 0.36, ez + 0.01, 0, Math.PI / 2, 0);
  }
}

function prepGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.6);
  return g;
}
function npcGeometry(L: Look, seed: number, lod: number): THREE.BufferGeometry {
  const key = `${lod}|${JSON.stringify(L)}|${L.prop === 'bag' ? seed % 3 : 0}`;
  let g = npcGeoCache.get(key);
  if (!g) {
    const b = recipeBody(lod, L.recipe, L.hatCol, L.pal.acc);
    outfitExtras(b, L, seed);
    applyHeft(b, L.recipe.heft, L.recipe.female);
    // geometry made with `new` in outfitExtras is single-use: index it the way bodyGeometry expects
    for (const p of b.parts) {
      if (!p.g.index) {
        const idx: number[] = [];
        for (let i = 0; i < p.g.attributes.position.count; i++) idx.push(i);
        p.g.setIndex(idx);
      }
      for (const n of Object.keys(p.g.attributes)) if (n !== 'position' && n !== 'normal') p.g.deleteAttribute(n);
    }
    g = prepGeo(bodyGeometry(b, L.pal, L.paint));
    npcGeoCache.set(key, g);
  }
  return g;
}

export function buildHuman(seed: number, outfit: Outfit, prop: TouristProp, over?: { skin?: number; shirt?: number; hair?: number }): Rig & { flashMat: THREE.MeshBasicMaterial | null } {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const L = lookFor(seed, outfit, prop);
  if (over) {
    if (over.skin !== undefined) L.pal.skin = over.skin;
    if (over.shirt !== undefined) L.pal.top = over.shirt;
    if (over.hair !== undefined) L.pal.hair = L.paint.brow = over.hair;
    L.recipe.hat = 'none';
    L.recipe.bag = 'none';
  }
  const tourist = outfit === 'tourist';
  const isGuard = outfit === 'guard' || outfit === 'officer';
  const isAC = outfit === 'animal-control';

  // the skeleton: bones at the joints (moved apart for a heavier build), parented like the body
  const bones = JOINT.map(() => new THREE.Bone());
  bones.forEach((bn, i) => {
    const sh = boneShift(i, L.recipe.heft, L.recipe.female);
    const p = PARENT[i];
    const [x, y, z] = JOINT[i];
    if (p < 0) {
      bn.position.set(x, y, z);
      g.add(bn);
    } else {
      const [px, py, pz] = JOINT[p];
      bn.position.set(x + sh - px - boneShift(p, L.recipe.heft, L.recipe.female), y - py, z - pz);
      bones[p].add(bn);
    }
  });
  const inv = BONE_INV.map((m, i) => {
    const sh = boneShift(i, L.recipe.heft, L.recipe.female);
    return sh ? m.clone().setPosition(-JOINT[i][0] - sh, -JOINT[i][1], -JOINT[i][2]) : m;
  });
  const far = npcGeometry(L, seed, 1);
  let near: THREE.BufferGeometry | null = null;
  const mesh = new THREE.SkinnedMesh(far, npcMaterial());
  mesh.castShadow = true;
  mesh.frustumCulled = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.6);
  g.add(mesh);
  mesh.bind(new THREE.Skeleton(bones, inv), ID4);
  // swap to the detailed body up close (built the first time someone gets near)
  let isNear = false;
  mesh.onBeforeRender = (_r, _s, cam) => {
    mesh.getWorldPosition(_wp);
    const d2 = _wp.distanceToSquared(cam.position);
    if (!isNear && d2 < NEAR_IN) {
      near ??= npcGeometry(L, seed, 0);
      mesh.geometry = near;
      isNear = true;
    } else if (isNear && d2 > NEAR_OUT) {
      mesh.geometry = far;
      isNear = false;
    }
  };

  const [hips, spine, head, leftArm, leftFore, rightArm, rightFore, leftLeg, leftShin, rightLeg, rightShin] = bones;
  leftArm.rotation.z = 0.07;
  rightArm.rotation.z = -0.07;
  leftFore.rotation.x = rightFore.rotation.x = -0.15;
  const hand = (fore: THREE.Bone, o: THREE.Object3D, x: number, y: number, z: number) => {
    o.position.set(x, y, z);
    fore.add(o);
  };

  let flashMat: THREE.MeshBasicMaterial | null = null;
  let cigMesh: THREE.Object3D | null = null;
  if (isGuard) {
    flashMat = new THREE.MeshBasicMaterial({ color: 0xffe69c, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4.4, 14, 1, true), flashMat);
    hand(rightFore, beam, 0, -0.46 - 2.2, 0.035); // tip at the torch, opening along the forearm
  }
  if (tourist && prop === 'yard-drink') {
    const k = seed % 3;
    let cm = cupMats.get(k);
    if (!cm) cupMats.set(k, (cm = new THREE.MeshStandardMaterial({ color: [0xff33a6, 0x2de2ff, 0x7aff47][k], roughness: 0.15, emissive: [0xff1e8a, 0x00b7ff, 0x45d618][k], emissiveIntensity: 0.4 })));
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.032, 0.44, 10), cm);
    cup.rotation.x = 1.35; // upright while the forearm is raised
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 5), cigParts?.paperMat ?? new THREE.MeshStandardMaterial({ color: 0xffffff }));
    straw.position.set(0.02, 0.27, 0);
    straw.rotation.z = -0.2;
    cup.add(straw);
    hand(rightFore, cup, 0, -0.3, 0.06);
  }
  if (tourist && prop === 'cig') {
    cigParts ??= {
      paper: new THREE.CylinderGeometry(0.01, 0.01, 0.11, 8).rotateX(Math.PI / 2),
      ember: new THREE.CylinderGeometry(0.0105, 0.008, 0.018, 8).rotateX(Math.PI / 2).translate(0, 0, 0.06),
      paperMat: new THREE.MeshStandardMaterial({ color: 0xf7f5f0, roughness: 0.7 }),
      emberMat: new THREE.MeshBasicMaterial({ color: 0xff5a1f }),
    };
    const cigGroup = new THREE.Group();
    cigGroup.add(new THREE.Mesh(cigParts.paper, cigParts.paperMat), new THREE.Mesh(cigParts.ember, cigParts.emberMat));
    hand(rightFore, cigGroup, -0.01, -0.33, 0.05);
    cigMesh = cigGroup;
  }
  if (tourist && prop === 'yard-drink') {
    rightArm.rotation.x = -0.3;
    rightFore.rotation.x = -1.05;
  }
  if (tourist && prop === 'cig') {
    rightArm.rotation.x = -0.3;
    rightFore.rotation.x = -0.9;
  }
  if (isAC) rightArm.rotation.x = -1.1;

  return { group: g, leftArm, rightArm, leftLeg, rightLeg, head, hips, spine, leftFore, rightFore, leftShin, rightShin, cigMesh, flashMat };
}

/** A driver for a car seat: seated, leaning back a little, both hands up on the wheel. */
export function buildDriver(seed: number, c: { skin: number; shirt: number; hair: number }): THREE.Group {
  const r = buildHuman(seed, 'tourist', 'none', c);
  sitRig(r, true);
  r.leftArm.rotation.set(-0.85, 0, 0.12);
  r.rightArm.rotation.set(-0.85, 0, -0.12);
  r.leftFore.rotation.x = r.rightFore.rotation.x = -0.6;
  r.spine.rotation.x = -0.08;
  return r.group;
}

const HIPS_Y = JOINT[BONE.hips][1];
/**
 * Walk (or run) a rig: `w` 0 = standing … 1 = a stroll … 2 = a run. The same stride the crowd shader draws:
 * thighs swing, the knee folds through the swing, arms swing against the legs with a soft elbow, the hips
 * twist and drop, the shoulders counter-twist, a little bob. `armR` false leaves the right arm alone (props, chases).
 */
export function poseRig(r: Rig, phase: number, w: number, armR = true): void {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  r.leftLeg.rotation.set(-0.44 * w * s, 0, 0);
  r.rightLeg.rotation.set(0.44 * w * s, 0, 0);
  r.leftShin.rotation.x = w * (0.06 + 0.8 * Math.max(c, 0) ** 2);
  r.rightShin.rotation.x = w * (0.06 + 0.8 * Math.max(-c, 0) ** 2);
  r.leftArm.rotation.set(0.36 * w * s, 0, 0.07);
  r.leftFore.rotation.x = -0.15 - 0.32 * w * Math.max(-s, 0);
  if (armR) {
    r.rightArm.rotation.set(-0.36 * w * s, 0, -0.07);
    r.rightFore.rotation.x = -0.15 - 0.32 * w * Math.max(s, 0);
  }
  r.hips.rotation.set(0, -0.1 * w * s, -0.045 * w * c);
  r.hips.position.set(0, HIPS_Y + w * (0.022 * Math.abs(c) - 0.011), 0);
  r.spine.rotation.set(0.05 * w + 0.06 * Math.max(w - 1.2, 0), 0.17 * w * s, 0.035 * w * c);
}
/** Standing about: weight on one leg then the other, the other knee soft, hips and shoulders tilting. */
export function idleRig(r: Rig, t: number, seed: number, dt: number): void {
  const ws = Math.sin(t * 0.5 + seed * 17);
  const k = Math.min(1, dt * 6);
  const lerp = (o: THREE.Object3D, x: number) => (o.rotation.x += (x - o.rotation.x) * k);
  lerp(r.leftLeg, -0.08 * Math.max(-ws, 0));
  lerp(r.rightLeg, -0.08 * Math.max(ws, 0));
  lerp(r.leftShin, 0.16 * Math.max(-ws, 0));
  lerp(r.rightShin, 0.16 * Math.max(ws, 0));
  r.hips.rotation.set(0, 0, 0.05 * ws);
  r.hips.position.set(0.022 * ws, HIPS_Y, 0);
  r.spine.rotation.set(0, 0, -0.035 * ws);
}
/** Seated: thighs forward, shins down. */
export function sitRig(r: Rig, on: boolean): void {
  r.leftLeg.rotation.x = r.rightLeg.rotation.x = on ? -1.45 : 0;
  r.leftShin.rotation.x = r.rightShin.rotation.x = on ? 1.4 : 0;
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
        holdsDrink: r.prop === 'yard-drink',
        cigStolen: false,
        speechSprite: null,
        speechTimer: 0,
        walkPhase: idx * 1.1,
        lookAtCat: 0,
      });
    });

    config.performers.forEach((p, idx) => {
      const built = buildHuman(idx * 7 + 2, p.kind, 'none');
      built.group.position.set(p.x, p.y ?? 0, p.z);
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

  public tickSpeech(holder: { mesh: THREE.Group; speechSprite: THREE.Sprite | null; speechTimer: number }, dt: number): void {
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
      holdsDrink: false,
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
      p.walkPhase += dt * (chasing ? 11 : 7);
      poseRig(p, p.walkPhase, chasing ? 1.9 : 1.05, p.kind !== 'ac');
      if (p.kind === 'ac') p.rightArm.rotation.x = -1.1;
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
    npc.knock = { t: 0, vx: dx * power, vz: dz * power, yaw: npc.mesh.rotation.y, y0: Math.max(0, npc.mesh.position.y) };
  }

  public say(npc: { mesh: THREE.Group; speechSprite: THREE.Sprite | null; speechTimer: number }, text: string, duration = 2.6, accent?: string): void {
    this.setSpeech(npc, text, duration, accent);
  }

  /** Returns true while the person is down (callers skip their normal behaviour). */
  public tickKnock(npc: Rig & { mesh: THREE.Group }, dt: number): boolean {
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
      m.position.y = k.y0 < 0.2 ? 0 : k.y0;
      npc.knock = null;
      return false;
    }
    m.position.x += k.vx * dt;
    m.position.z += k.vz * dt;
    const damp = Math.max(0, 1 - dt * 3.5);
    k.vx *= damp;
    k.vz *= damp;
    m.position.y = k.y0 + (k.t < 0.3 ? Math.sin((k.t / 0.3) * Math.PI) * 0.35 : 0.05);
    const flail = k.t < 3.2 ? Math.sin(k.t * 18) * (k.t < 0.8 ? 1.2 : 0.25) : 0;
    npc.leftArm.rotation.x = -1.4 + flail;
    npc.rightArm.rotation.x = -1.4 - flail;
    npc.leftLeg.rotation.x = 0.3 + flail * 0.5;
    npc.rightLeg.rotation.x = -0.3 - flail * 0.5;
    npc.leftShin.rotation.x = 0.35 + Math.max(0, flail) * 0.6;
    npc.rightShin.rotation.x = 0.35 + Math.max(0, -flail) * 0.6;
    npc.leftFore.rotation.x = npc.rightFore.rotation.x = -0.5;
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

  /** Tourists near a dancing cat film it, cheer, and sometimes tip. Elvises take it personally. */
  public reactToDance(origin: THREE.Vector3, tipMult: number): { cheers: number; tips: number } {
    let cheers = 0;
    let tips = 0;
    for (const t of this.tourists) {
      if (t.reactCooldown > 0 || t.knock) continue;
      if (t.mesh.position.distanceTo(origin) > 9) continue;
      t.reactCooldown = 18;
      t.lookAtCat = 3.2;
      if (Math.random() < 0.38 + Math.min(0.2, tipMult * 0.04)) {
        const tip = Math.max(1, Math.round((1 + Math.floor(Math.random() * 5)) * tipMult));
        tips += tip;
        cheers += 1;
        this.setSpeech(t, [`IT'S DANCING +$${tip}`, `Get it, kitty! +$${tip}`, `Main character energy +$${tip}`, `Vegas has everything +$${tip}`][Math.floor(Math.random() * 4)], 2.8);
      } else {
        this.setSpeech(t, ['📱 recording', 'Is this a show?', 'Somebody call Cirque', 'He has better moves than my husband'][Math.floor(Math.random() * 4)], 2.4);
      }
    }
    for (const p of this.performers) {
      if (p.mesh.position.distanceTo(origin) < 10 && Math.random() < 0.6) this.say(p, 'Thank you. Thank you very much.', 2.6);
    }
    return { cheers, tips };
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
        if (!far) idleRig(t, elapsed, t.id, dt);
        continue;
      }

      if (t.pauseTimer > 0) {
        t.pauseTimer -= dt;
        if (!far) idleRig(t, elapsed, t.id, dt);
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
        const holding = (t.hasCig && !t.cigStolen) || t.hasCamera || t.holdsDrink;
        poseRig(t, t.walkPhase, 0.6 + t.speed * 0.32, !holding);
        t.head.rotation.y *= 1 - Math.min(1, dt * 3);
        if (t.hasCig && !t.cigStolen) {
          // a drag every so often: the hand comes up to the mouth
          const drag = Math.max(0, Math.sin(elapsed * 1.1 + t.id));
          t.rightArm.rotation.set(-0.25 - drag * 0.35, 0, -0.1);
          t.rightFore.rotation.x = -0.9 - drag * 1.05;
        } else if (t.hasCamera) {
          t.rightArm.rotation.set(-0.3, 0, -0.05);
          t.rightFore.rotation.x = -1.2;
        } else if (t.holdsDrink) {
          t.rightArm.rotation.set(-0.3, 0, -0.07);
          t.rightFore.rotation.x = -1.05;
        }
        t.mesh.position.y = 0;
      }
    }

    for (const p of this.performers) {
      if (p.begCooldown > 0) p.begCooldown = Math.max(0, p.begCooldown - dt);
      this.tickSpeech(p, dt);
      if (this.tickKnock(p, dt)) continue;
      const near = p.mesh.position.distanceToSquared(catPos) < 90 * 90;
      p.mesh.visible = near;
      if (!near) continue;
      if (p.kind !== 'statue' && p.kind !== 'robot') idleRig(p, elapsed * 1.4, p.id + 5, dt);
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
      } else if (p.kind === 'robot') {
        // jerky robot dance: arms snap between poses on a beat
        const beat = Math.floor(elapsed * 2.5 + p.id) % 4;
        p.leftArm.rotation.x = [-1.5, 0, -1.5, -0.8][beat];
        p.rightArm.rotation.x = [0, -1.5, -1.5, -0.8][beat];
        p.leftArm.rotation.z = beat === 3 ? 0.6 : 0;
        p.rightArm.rotation.z = beat === 3 ? -0.6 : 0;
        p.head.rotation.y = [0.4, -0.4, 0, 0][beat];
      } else if (p.kind === 'statue') {
        // frozen pose; every ~9 s a tiny bow
        p.rightArm.rotation.x = -1.2;
        p.leftArm.rotation.z = 0.3;
        const c = (elapsed + p.id * 3) % 9;
        p.head.rotation.x = c < 0.8 ? Math.sin((c / 0.8) * Math.PI) * 0.35 : 0;
      } else if (p.kind === 'water') {
        p.rightArm.rotation.x = -1.2 - Math.max(0, Math.sin(elapsed * 2.2 + p.id)) * 1.1;
        p.head.rotation.y = Math.sin(elapsed * 0.9 + p.id) * 0.6;
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
      g.walkPhase += dt * (g.mode === 'chase' ? 11 : 6.2);
      poseRig(g, g.walkPhase, g.mode === 'chase' ? 1.85 : 0.95, false);
      // the torch hand: held out in front on patrol, pointed at the cat in a chase
      g.rightArm.rotation.set(g.mode === 'chase' ? -1.15 : -0.6, 0, -0.08);
      g.rightFore.rotation.x = g.mode === 'chase' ? -0.35 : -0.5;
    }
  }
}
