import * as THREE from 'three';
import type { PlatformBox } from './world/builder';
import type { PursuerNPC, StripCrowdSystem } from './npcs';
import { basic, car, mat, mesh } from './world/props';

// ============================================================ Degen Points (Goat-Simulator style score)
const RANKS: Array<[number, string]> = [
  [0, 'Stray'],
  [500, 'Alley Cat'],
  [2000, 'Strip Hustler'],
  [6000, 'Casino Menace'],
  [15000, 'Neon Nuisance'],
  [40000, 'Gigantic Degen'],
  [100000, 'Lou Legend'],
];

export function rankFor(points: number): { name: string; next: number | null } {
  let name = RANKS[0][1];
  let next: number | null = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (points >= RANKS[i][0]) {
      name = RANKS[i][1];
      next = RANKS[i + 1]?.[0] ?? null;
    }
  }
  return { name, next };
}

export class DegenScore {
  private pending = 0;
  private mult = 1;
  private timer = 0;
  private readonly root: HTMLElement;
  private readonly pointsEl: HTMLElement;
  private readonly rankEl: HTMLElement;
  private readonly comboEl: HTMLElement;
  private readonly popLayer: HTMLElement;

  constructor(
    private readonly getTotal: () => number,
    private readonly setTotal: (n: number) => void,
    private readonly onRankUp: (rank: string) => void
  ) {
    const host = document.getElementById('game-root')!;
    this.root = document.createElement('div');
    this.root.className = 'degen-hud';
    this.root.innerHTML = '<span class="degen-label">Degen Points</span><strong class="degen-points">0</strong><span class="degen-rank"></span><span class="degen-combo"></span>';
    this.pointsEl = this.root.querySelector('.degen-points')!;
    this.rankEl = this.root.querySelector('.degen-rank')!;
    this.comboEl = this.root.querySelector('.degen-combo')!;
    this.popLayer = document.createElement('div');
    this.popLayer.className = 'pop-layer';
    host.append(this.root, this.popLayer);
    this.render();
  }

  add(points: number, label: string): void {
    if (this.timer > 0) this.mult = Math.min(10, this.mult + 1);
    this.pending += points;
    this.timer = 3.5;
    this.popup(`${label} +${points}`, this.mult > 1 ? `×${this.mult}` : '');
    this.render();
  }

  update(dt: number): void {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    const before = rankFor(this.getTotal()).name;
    const banked = this.pending * this.mult;
    this.setTotal(this.getTotal() + banked);
    if (this.mult > 1) this.popup(`COMBO ×${this.mult}! +${banked.toLocaleString()}`, '', true);
    this.pending = 0;
    this.mult = 1;
    const after = rankFor(this.getTotal()).name;
    if (after !== before) this.onRankUp(after);
    this.render();
  }

  private popup(text: string, badge: string, big = false): void {
    const el = document.createElement('div');
    el.className = big ? 'pop pop--big' : 'pop';
    el.textContent = text;
    if (badge) {
      const b = document.createElement('b');
      b.textContent = ` ${badge}`;
      el.append(b);
    }
    el.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 160)}px`);
    this.popLayer.append(el);
    window.setTimeout(() => el.remove(), 1700);
  }

  render(): void {
    const total = this.getTotal();
    this.pointsEl.textContent = total.toLocaleString();
    const r = rankFor(total);
    this.rankEl.textContent = r.next ? `${r.name} → ${r.next.toLocaleString()}` : r.name;
    this.comboEl.textContent = this.timer > 0 ? `+${this.pending} ×${this.mult}` : '';
    this.root.classList.toggle('degen-hud--combo', this.timer > 0);
  }
}

// ============================================================ Wanted level: Clark County Animal Control → Metro → helicopter
interface ChaseVehicle {
  group: THREE.Group;
  kind: 'van' | 'cop';
  laneX: number;
  dir: 1 | -1;
  state: 'drive' | 'parked' | 'leave';
  lights: THREE.MeshBasicMaterial[];
  travelled: number;
}

export interface WantedCallbacks {
  onBusted: (by: PursuerNPC) => void;
  onEscaped: (stars: number) => void;
  onStarsChanged: (stars: number) => void;
}

function chaseVehicle(kind: 'van' | 'cop'): { group: THREE.Group; lights: THREE.MeshBasicMaterial[] } {
  const built = car(kind === 'van' ? 'suv' : 'sedan', kind === 'van' ? 0xf2f2f0 : 0x111318);
  const g = built.group;
  if (kind === 'cop') g.add(mesh(new THREE.BoxGeometry(1.88, 0.5, 2.2), mat(0xf2f2f2, 0.3, 0.4), 0, 0.85, 0));
  const lightA = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  const lightB = new THREE.MeshBasicMaterial({ color: 0x2050ff });
  const top = kind === 'van' ? 2.3 : 1.85;
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.16, 0.3), lightA, -0.35, top, -0.2), mesh(new THREE.BoxGeometry(0.6, 0.16, 0.3), lightB, 0.35, top, -0.2));
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = kind === 'van' ? '#f2f2f0' : '#f2f2f2';
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = kind === 'van' ? '#2d5a2d' : '#14213d';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(kind === 'van' ? 'ANIMAL CONTROL' : 'METRO POLICE', 256, 50, 490);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  for (const s of [-1, 1]) {
    const decal = mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshBasicMaterial({ map: tex }), s * (kind === 'van' ? 1.01 : 0.94), kind === 'van' ? 1.0 : 0.75, 0);
    decal.rotation.y = (s * Math.PI) / 2;
    g.add(decal);
  }
  if (kind === 'van') {
    const cage = mat(0x777777, 0.5, 0.7);
    g.add(mesh(new THREE.BoxGeometry(1.8, 1.0, 1.4), cage, 0, 1.6, -1.6));
  }
  return { group: g, lights: [lightA, lightB] };
}

export class WantedSystem {
  heat = 0;
  private unseen = 0;
  private spawnTimer = 0;
  private vehicles: ChaseVehicle[] = [];
  private heli: THREE.Group | null = null;
  private heliRotor: THREE.Mesh | null = null;
  private beamMat: THREE.MeshBasicMaterial | null = null;
  private clouds: Array<{ x: number; z: number; r: number; t: number }> = [];
  private lastSeen = new THREE.Vector3();
  private readonly hud: HTMLElement;
  private shownStars = -1;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly crowd: StripCrowdSystem,
    private readonly laneCenters: number[],
    private readonly cb: WantedCallbacks
  ) {
    this.hud = document.createElement('div');
    this.hud.className = 'wanted-hud';
    this.hud.setAttribute('aria-label', 'Wanted level');
    document.getElementById('game-root')!.append(this.hud);
    this.renderHud(false);
  }

  get stars(): number {
    return Math.floor(this.heat);
  }

  crime(amount: number): void {
    const before = this.stars;
    this.heat = Math.min(5.99, this.heat + amount);
    this.unseen = 0;
    if (this.stars !== before) this.cb.onStarsChanged(this.stars);
  }

  /** A thick vape cloud: Animal Control can't see the cat inside it. */
  addCloud(x: number, z: number, r: number, seconds: number): void {
    this.clouds.push({ x, z, r, t: seconds });
  }

  /** Boutique disguise etc. */
  lose(starsToDrop: number): void {
    const before = this.stars;
    this.heat = Math.max(0, this.heat - starsToDrop);
    if (this.stars < 1) this.clearAll();
    if (this.stars !== before) this.cb.onStarsChanged(this.stars);
  }

  clearAll(): void {
    this.heat = 0;
    this.unseen = 0;
    for (const p of [...this.crowd.pursuers]) this.crowd.removePursuer(p);
    for (const v of this.vehicles) this.scene.remove(v.group);
    this.vehicles = [];
    if (this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
    }
    this.renderHud(false);
  }

  update(dt: number, t: number, cat: THREE.Vector3, opts: { riding: boolean; inCar: boolean; indoors: boolean }): void {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      this.clouds[i].t -= dt;
      if (this.clouds[i].t <= 0) this.clouds.splice(i, 1);
    }
    const stars = this.stars;
    if (stars === 0) {
      if (this.crowd.pursuers.length || this.vehicles.length || this.heli) this.clearAll();
      this.heat = Math.max(0, this.heat - dt * 0.05);
      this.renderHud(false);
      return;
    }

    // ---- Who's looking ----
    const inCloud = this.clouds.some((c) => Math.hypot(cat.x - c.x, cat.z - c.z) < c.r);
    let seen = false;
    for (const p of this.crowd.pursuers) {
      const d = p.mesh.position.distanceTo(cat);
      const range = inCloud ? 2.5 : opts.indoors ? 14 : opts.riding ? 7 : 30;
      if (d < range && !p.knock) seen = true;
    }
    for (const v of this.vehicles) if (v.group.position.distanceTo(cat) < (inCloud ? 4 : 26)) seen = true;
    if (this.heli && !opts.indoors && !inCloud) seen = true;
    if (seen) {
      this.unseen = 0;
      this.lastSeen.copy(cat);
    } else {
      this.unseen += dt;
      if (this.unseen > 6 + stars * 1.5) {
        this.unseen = 0;
        this.heat = stars - 1 + 0.4;
        if (this.stars < 1) {
          this.cb.onEscaped(stars);
          this.clearAll();
          this.cb.onStarsChanged(0);
          return;
        }
        this.cb.onStarsChanged(this.stars);
      }
    }

    // ---- Units on foot ----
    const wantFoot = [0, 1, 2, 3, 4, 6][stars];
    this.spawnTimer -= dt;
    if (this.crowd.pursuers.length < wantFoot && this.spawnTimer <= 0) {
      this.spawnTimer = 2.2;
      const a = Math.random() * Math.PI * 2;
      const r = 34 + Math.random() * 10;
      this.crowd.spawnPursuer(stars >= 4 && this.crowd.pursuers.length % 2 === 1 ? 'cop' : 'ac', cat.x + Math.cos(a) * r, cat.z + Math.sin(a) * r);
    }
    // Drop far-away stragglers so the chase stays local
    for (const p of [...this.crowd.pursuers]) if (p.mesh.position.distanceTo(cat) > 120) this.crowd.removePursuer(p);
    const target = seen || this.unseen < 2 ? cat : this.lastSeen;
    const caught = this.crowd.updatePursuers(dt, target, true, !opts.inCar && !opts.riding);
    if (caught) {
      this.cb.onBusted(caught);
      return;
    }

    // ---- Vans and cruisers on Las Vegas Blvd ----
    const wantVans = stars >= 3 ? 2 : stars >= 2 ? 1 : 0;
    const wantCops = stars >= 4 ? (stars >= 5 ? 2 : 1) : 0;
    const count = (k: 'van' | 'cop') => this.vehicles.filter((v) => v.kind === k && v.state !== 'leave').length;
    if (count('van') < wantVans) this.spawnVehicle('van', cat);
    if (count('cop') < wantCops) this.spawnVehicle('cop', cat);
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      const flash = Math.floor(t * 8) % 2 === 0;
      v.lights[0].color.setHex(flash ? 0xff2020 : 0x330505);
      v.lights[1].color.setHex(flash ? 0x050a33 : 0x2050ff);
      const pos = v.group.position;
      if (v.state === 'drive') {
        const dz = cat.z - pos.z;
        if (Math.abs(dz) < 12) {
          v.state = 'parked';
          pos.x = Math.sign(v.laneX) * 10.6;
          for (let k = 0; k < (v.kind === 'van' ? 2 : 1); k++) this.crowd.spawnPursuer(v.kind === 'van' ? 'ac' : 'cop', pos.x - Math.sign(pos.x) * 2.2, pos.z + (k - 0.5) * 2);
        } else {
          v.dir = dz > 0 ? 1 : -1;
          v.group.rotation.y = v.dir === 1 ? 0 : Math.PI;
          pos.z += v.dir * 19 * dt;
          v.travelled += 19 * dt;
          if (v.travelled > 400) v.state = 'leave';
        }
      } else if (v.state === 'leave') {
        pos.z += v.dir * 22 * dt;
        v.travelled += 22 * dt;
        if (v.travelled > 520 || pos.distanceTo(cat) > 160) {
          this.scene.remove(v.group);
          this.vehicles.splice(i, 1);
        }
      }
    }

    // ---- Helicopter at 5 stars ----
    if (stars >= 5 && !this.heli) this.spawnHeli(cat);
    if (stars < 5 && this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
    }
    if (this.heli) {
      this.tmp.set(cat.x + Math.sin(t * 0.3) * 14, 42, cat.z + Math.cos(t * 0.3) * 14);
      this.heli.position.lerp(this.tmp, Math.min(1, dt * 0.8));
      this.heli.lookAt(cat.x, 42, cat.z);
      if (this.heliRotor) this.heliRotor.rotation.y += dt * 30;
      const beam = this.heli.getObjectByName('beam');
      if (beam) {
        const dx = cat.x - this.heli.position.x;
        const dz = cat.z - this.heli.position.z;
        const len = Math.hypot(dx, 42, dz);
        beam.position.set(0, 0, 0);
        beam.lookAt(cat.x, cat.y, cat.z);
        beam.scale.set(1, 1, len);
      }
      if (this.beamMat) this.beamMat.opacity = opts.indoors || inCloud ? 0.04 : 0.16;
    }

    this.renderHud(!seen && this.unseen > 1);
  }

  private spawnVehicle(kind: 'van' | 'cop', cat: THREE.Vector3): void {
    const built = chaseVehicle(kind);
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const laneX = (dir === 1 ? -1 : 1) * this.laneCenters[1];
    built.group.position.set(laneX, 0, cat.z - dir * 95);
    built.group.rotation.y = dir === 1 ? 0 : Math.PI;
    this.scene.add(built.group);
    this.vehicles.push({ group: built.group, kind, laneX, dir, state: 'drive', lights: built.lights, travelled: 0 });
  }

  private spawnHeli(cat: THREE.Vector3): void {
    const g = new THREE.Group();
    const body = mat(0x1b2433, 0.4, 0.5);
    const bodyMesh = mesh(new THREE.CapsuleGeometry(1.3, 2.6, 6, 12), body, 0, 0, 0);
    bodyMesh.rotation.x = Math.PI / 2;
    g.add(bodyMesh);
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.4, 5), body, 0, 0.3, -4));
    g.add(mesh(new THREE.BoxGeometry(0.1, 1.4, 0.8), body, 0, 0.9, -6.3));
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 3.4), mat(0x222222, 0.5), s * 1.1, -1.6, 0));
    this.heliRotor = mesh(new THREE.BoxGeometry(11, 0.06, 0.35), mat(0x111111, 0.5), 0, 1.6, 0);
    g.add(this.heliRotor);
    g.add(mesh(new THREE.SphereGeometry(0.25, 8, 6), basic(0xff2020), 0, 1.4, -6.7));
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
    const beamGeo = new THREE.ConeGeometry(4, 1, 20, 1, true);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0, 0.5);
    const beam = new THREE.Mesh(beamGeo, this.beamMat);
    beam.name = 'beam';
    g.add(beam);
    g.position.set(cat.x + 40, 42, cat.z + 40);
    this.scene.add(g);
    this.heli = g;
  }

  private renderHud(flashing: boolean): void {
    const stars = this.stars;
    const key = stars * 2 + (flashing ? 1 : 0);
    if (key === this.shownStars) return;
    this.shownStars = key;
    this.hud.textContent = '★★★★★'.slice(0, stars) + '☆☆☆☆☆'.slice(0, 5 - stars);
    this.hud.hidden = stars === 0;
    this.hud.classList.toggle('wanted-hud--flash', flashing);
  }
}

// ============================================================ Knockable street props
export interface PropDef {
  obj: THREE.Object3D;
  r: number;
  h: number;
  kind: string;
}

interface PropBody extends PropDef {
  vel: THREE.Vector3;
  tip: number;
  tipVel: number;
  axis: THREE.Vector3;
  baseQuat: THREE.Quaternion;
  baseY: number;
  awake: boolean;
  hitCooldown: number;
}

export class PropPhysics {
  private readonly bodies: PropBody[] = [];
  private readonly q = new THREE.Quaternion();

  register(defs: PropDef[]): void {
    for (const d of defs) {
      this.bodies.push({ ...d, vel: new THREE.Vector3(), tip: 0, tipVel: 0, axis: new THREE.Vector3(1, 0, 0), baseQuat: d.obj.quaternion.clone(), baseY: d.obj.position.y, awake: false, hitCooldown: 0 });
    }
  }

  /** Something moving at `vel` with radius `radius` hits props near `pos`. Returns the kinds hit. */
  hit(pos: THREE.Vector3, vel: THREE.Vector3, radius: number, minSpeed = 3.2): string[] {
    const speed = Math.hypot(vel.x, vel.z);
    if (speed < minSpeed) return [];
    const kinds: string[] = [];
    for (const b of this.bodies) {
      if (b.hitCooldown > 0) continue;
      const dx = b.obj.position.x - pos.x;
      const dz = b.obj.position.z - pos.z;
      if (dx * dx + dz * dz > (radius + b.r) ** 2 || pos.y > b.baseY + b.h + 0.5) continue;
      const push = speed * (b.kind === 'cone' ? 1.3 : 0.9);
      b.vel.set(vel.x / speed * push + dx * 1.5, 2 + speed * 0.25, vel.z / speed * push + dz * 1.5);
      b.axis.set(vel.z, 0, -vel.x).normalize();
      b.tipVel = 6 + speed * 0.4;
      b.awake = true;
      b.hitCooldown = 1.2;
      kinds.push(b.kind);
    }
    return kinds;
  }

  /** Hide props far from the camera: hundreds of cans, racks and benches line 1.8 km of Strip. */
  cull(cam: THREE.Vector3, limit: number): void {
    const l2 = limit * limit;
    for (const b of this.bodies) b.obj.visible = b.awake || b.obj.position.distanceToSquared(cam) < l2;
  }

  update(dt: number, colliders: PlatformBox[]): void {
    for (const b of this.bodies) {
      if (b.hitCooldown > 0) b.hitCooldown -= dt;
      if (!b.awake) continue;
      const p = b.obj.position;
      b.vel.y -= 18 * dt;
      p.addScaledVector(b.vel, dt);
      const floor = b.baseY + Math.sin(b.tip) * b.r;
      if (p.y < floor) {
        p.y = floor;
        b.vel.y = Math.abs(b.vel.y) > 2 ? -b.vel.y * 0.3 : 0;
        const f = Math.max(0, 1 - dt * 3);
        b.vel.x *= f;
        b.vel.z *= f;
      }
      for (const c of colliders) {
        if (!c.isWall || p.y > c.topY) continue;
        if (p.x + b.r > c.minX && p.x - b.r < c.maxX && p.z + b.r > c.minZ && p.z - b.r < c.maxZ) {
          const ox = Math.min(p.x + b.r - c.minX, c.maxX - (p.x - b.r));
          const oz = Math.min(p.z + b.r - c.minZ, c.maxZ - (p.z - b.r));
          if (ox < oz) {
            p.x += p.x < (c.minX + c.maxX) / 2 ? -ox : ox;
            b.vel.x *= -0.4;
          } else {
            p.z += p.z < (c.minZ + c.maxZ) / 2 ? -oz : oz;
            b.vel.z *= -0.4;
          }
        }
      }
      b.tip = Math.min(Math.PI / 2, b.tip + b.tipVel * dt);
      if (b.tip >= Math.PI / 2) b.tipVel = 0;
      this.q.setFromAxisAngle(b.axis, b.tip);
      b.obj.quaternion.copy(this.q).multiply(b.baseQuat);
      if (Math.hypot(b.vel.x, b.vel.z) < 0.05 && b.vel.y === 0 && b.tipVel === 0) b.awake = false;
    }
  }
}
