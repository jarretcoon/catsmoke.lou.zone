import * as THREE from 'three';
import { SoundFX } from './audio';
import type { CosmeticId } from './state';

type Slot = 'eyes' | 'head' | 'neck' | 'chest' | 'collar';

export interface CosmeticDef {
  id: CosmeticId;
  name: string;
  blurb: string;
  price: number;
  swag: number;
  slot: Slot;
  bone: 'Head' | 'Neck';
}

export const COSMETICS: CosmeticDef[] = [
  { id: 'bowtie', name: 'Velvet Bow Tie', blurb: 'Lounge-singer chic', price: 45, swag: 1, slot: 'neck', bone: 'Neck' },
  { id: 'aviators', name: 'Gold Aviators', blurb: 'Pool-party shades', price: 60, swag: 1, slot: 'eyes', bone: 'Head' },
  { id: 'fedora', name: 'Rat Pack Fedora', blurb: 'Very Sands, 1960', price: 120, swag: 2, slot: 'head', bone: 'Head' },
  { id: 'gold-chain', name: 'Dice Gold Chain', blurb: 'Snake eyes pendant', price: 250, swag: 2, slot: 'chest', bone: 'Neck' },
  { id: 'top-hat', name: 'Showman Top Hat', blurb: 'Headliner energy', price: 400, swag: 3, slot: 'head', bone: 'Head' },
  { id: 'diamond-collar', name: 'Diamond Collar', blurb: 'High-roller bling', price: 750, swag: 4, slot: 'collar', bone: 'Neck' },
];

export const cosmeticById = (id: CosmeticId) => COSMETICS.find((c) => c.id === id)!;

export function swagFor(equipped: CosmeticId[]): number {
  return equipped.reduce((sum, id) => sum + (cosmeticById(id)?.swag ?? 0), 0);
}

const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.95, roughness: 0.22 });
const black = new THREE.MeshStandardMaterial({ color: 0x111218, roughness: 0.55 });
const felt = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.85 });
const band = new THREE.MeshStandardMaterial({ color: 0x8a1c26, roughness: 0.6 });
const lens = new THREE.MeshStandardMaterial({ color: 0x3a1f08, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.88 });
const velvet = new THREE.MeshStandardMaterial({ color: 0xb0122f, roughness: 0.7 });
const diamond = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, roughness: 0.02, metalness: 0.3, emissive: 0x9fd8ff, emissiveIntensity: 0.6 });
const white = new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.4 });

// All coordinates are in the cat GLB's model space (glTF: +Y up, cat faces +Z).
// Head center ≈ (0, 0.542, 0.262); eyes ≈ (±0.053, 0.556, 0.352); collar ring ≈ y 0.415 around z 0.218.
function buildCosmetic(id: CosmeticId): THREE.Group {
  const g = new THREE.Group();
  g.name = `Cosmetic_${id}`;
  if (id === 'aviators') {
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), lens);
      l.scale.set(1.0, 0.82, 0.32);
      l.position.set(s * 0.054, 0.558, 0.376);
      g.add(l);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0035, 6, 18), gold);
      rim.scale.set(1, 0.82, 1);
      rim.position.copy(l.position);
      g.add(rim);
      const temple = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.11), gold);
      temple.position.set(s * 0.104, 0.566, 0.322);
      temple.rotation.y = s * 0.28;
      g.add(temple);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.005, 0.005), gold);
    bridge.position.set(0, 0.572, 0.382);
    g.add(bridge);
  } else if (id === 'fedora') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.012, 28), felt);
    brim.position.set(0, 0.642, 0.25);
    g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.085, 0.085, 24), felt);
    crown.position.set(0, 0.69, 0.25);
    g.add(crown);
    const pinch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.13), felt);
    pinch.position.set(0, 0.73, 0.25);
    g.add(pinch);
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.0855, 0.0865, 0.02, 24), band);
    ribbon.position.set(0, 0.66, 0.25);
    g.add(ribbon);
    g.rotation.z = -0.12;
  } else if (id === 'top-hat') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.012, 28), black);
    brim.position.set(0, 0.648, 0.25);
    g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.066, 0.15, 24), black);
    crown.position.set(0, 0.728, 0.25);
    g.add(crown);
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.0675, 0.0675, 0.025, 24), velvet);
    ribbon.position.set(0, 0.67, 0.25);
    g.add(ribbon);
    g.rotation.z = 0.1;
  } else if (id === 'bowtie') {
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.05, 4), velvet);
      wing.rotation.z = (s * Math.PI) / 2;
      wing.position.set(s * 0.026, 0.39, 0.312);
      g.add(wing);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), velvet);
    knot.position.set(0, 0.39, 0.314);
    g.add(knot);
  } else if (id === 'gold-chain') {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.007, 8, 40), gold);
    chain.rotation.x = Math.PI / 2 - 0.45;
    chain.position.set(0, 0.385, 0.236);
    g.add(chain);
    for (const [dx, pip] of [
      [-0.016, 1],
      [0.016, 1],
    ] as const) {
      const die = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.024), white);
      die.position.set(dx, 0.33, 0.315);
      die.rotation.set(0.3, 0.4 * Math.sign(dx), 0.2);
      g.add(die);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0045 * pip, 6, 6), band);
      dot.position.set(dx, 0.33, 0.328);
      g.add(dot);
    }
  } else if (id === 'diamond-collar') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.089, 0.012, 8, 36), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.418, 0.218);
    g.add(ring);
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * 0.15 + (i / 10) * Math.PI * 0.7;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(i === 5 ? 0.02 : 0.011, 0), diamond);
      gem.position.set(Math.cos(a) * 0.092, 0.418, 0.218 + Math.sin(a) * 0.092);
      g.add(gem);
    }
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  return g;
}

/** Owns the accessory meshes on the cat rig and keeps them in sync with the equipped list. */
export class CatWardrobe {
  private readonly items = new Map<CosmeticId, THREE.Group>();

  constructor(model: THREE.Object3D) {
    model.updateMatrixWorld(true);
    const head = model.getObjectByName('Head');
    const neck = model.getObjectByName('Neck');
    for (const def of COSMETICS) {
      const obj = buildCosmetic(def.id);
      obj.visible = false;
      model.add(obj);
      model.updateMatrixWorld(true);
      const bone = def.bone === 'Head' ? head : neck;
      // attach() keeps the bind-pose world transform, so the item follows the bone afterwards.
      if (bone) bone.attach(obj);
      this.items.set(def.id, obj);
    }
  }

  apply(equipped: CosmeticId[]): void {
    for (const [id, obj] of this.items) obj.visible = equipped.includes(id);
  }
}

export interface BoutiqueCallbacks {
  getCash: () => number;
  setCash: (n: number) => void;
  getOwned: () => CosmeticId[];
  getEquipped: () => CosmeticId[];
  setOwnedEquipped: (owned: CosmeticId[], equipped: CosmeticId[]) => void;
  onOutcome: (msg: string) => void;
}

export class BoutiqueController {
  private readonly dialog = document.getElementById('boutique-dialog') as HTMLDialogElement;
  private readonly grid = document.getElementById('boutique-grid') as HTMLElement;
  private readonly bank = document.getElementById('boutique-bank') as HTMLElement;
  private readonly result = document.getElementById('boutique-result') as HTMLElement;

  constructor(private readonly sfx: SoundFX, private readonly cb: BoutiqueCallbacks) {}

  isOpen(): boolean {
    return this.dialog.open;
  }

  open(): void {
    this.result.textContent = 'More swag = bigger tips from tourists. Hats and shades also impress the VIP host.';
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
  }

  private render(): void {
    this.bank.textContent = `$${this.cb.getCash()}`;
    const owned = this.cb.getOwned();
    const equipped = this.cb.getEquipped();
    this.grid.replaceChildren(
      ...COSMETICS.map((def) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'abc-card';
        const isOwned = owned.includes(def.id);
        const isOn = equipped.includes(def.id);
        if (isOn) btn.classList.add('abc-card--highlight');
        const title = document.createElement('strong');
        title.textContent = def.name;
        const blurb = document.createElement('span');
        blurb.textContent = `${def.blurb} • +${def.swag} Swag`;
        const price = document.createElement('em');
        price.textContent = isOwned ? (isOn ? 'Wearing — tap to remove' : 'Owned — tap to wear') : `$${def.price}`;
        btn.append(title, blurb, price);
        btn.addEventListener('click', () => this.choose(def));
        return btn;
      })
    );
  }

  private choose(def: CosmeticDef): void {
    const owned = [...this.cb.getOwned()];
    let equipped = [...this.cb.getEquipped()];
    if (!owned.includes(def.id)) {
      const cash = this.cb.getCash();
      if (cash < def.price) {
        this.sfx.playBusted();
        this.result.textContent = `The ${def.name} is $${def.price}. Come back with more cash, kitty.`;
        return;
      }
      this.cb.setCash(cash - def.price);
      owned.push(def.id);
      this.sfx.playCash();
      this.cb.onOutcome(`Bought the ${def.name}!`);
    }
    if (equipped.includes(def.id)) {
      equipped = equipped.filter((id) => id !== def.id);
      this.result.textContent = `Took off the ${def.name}.`;
    } else {
      // One item per slot (fedora OR top hat).
      equipped = equipped.filter((id) => cosmeticById(id).slot !== def.slot);
      equipped.push(def.id);
      this.result.textContent = `Looking sharp in the ${def.name}. Swag ${swagFor(equipped)}.`;
    }
    this.cb.setOwnedEquipped(owned, equipped);
    this.render();
  }
}
