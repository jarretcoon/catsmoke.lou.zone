import * as THREE from 'three';
import { buildHuman, poseRig, Rig, sitRig, StripCrowdSystem } from './npcs';
import { burgerProp, RestaurantDef, RestaurantTable } from './world/food';

type DinerState = 'queue' | 'waiting' | 'seeking' | 'eating' | 'leaving' | 'sleeping';

interface Diner extends Rig {
  id: string;
  mesh: THREE.Group;
  state: DinerState;
  timer: number;
  target: THREE.Vector3;
  table: RestaurantTable | null;
  speechSprite: THREE.Sprite | null;
  speechTimer: number;
  walkPhase: number;
  tray: THREE.Object3D;
}

interface Place {
  def: RestaurantDef;
  diners: Diner[];
  workers: Array<Rig & { mesh: THREE.Group; speechSprite: THREE.Sprite | null; speechTimer: number }>;
  serving: number;
}

export interface MenuItem {
  name: string;
  price: number;
  minutes: number;
  tipBoost: number;
  speedBoost: number;
  blurb: string;
}

const MENUS: Record<RestaurantDef['kind'], MenuItem[]> = {
  innout: [
    { name: 'Double-Double', price: 6, minutes: 2, tipBoost: 1.25, speedBoost: 1.1, blurb: 'Two patties, two cheese. Perfection.' },
    { name: '#1 Combo, Animal Style + shake', price: 14, minutes: 3, tipBoost: 1.5, speedBoost: 1.15, blurb: 'Mustard-grilled, extra spread, grilled onions, Neapolitan shake.' },
    { name: 'Flying Dutchman (secret menu)', price: 6, minutes: 2, tipBoost: 1.2, speedBoost: 1.25, blurb: 'Just meat and cheese. Lou respects it.' },
  ],
  whataburger: [
    { name: 'Whataburger', price: 8, minutes: 1, tipBoost: 1.08, speedBoost: 1.0, blurb: 'It was… fine.' },
    { name: 'Honey Butter Chicken Biscuit', price: 6, minutes: 1, tipBoost: 1.1, speedBoost: 1.0, blurb: 'Sticky. Lou is now sticky.' },
  ],
};

const RUSH_LINES = ['THAT’S MY TABLE!', 'I was here FIRST!', 'We have SIX kids, Brenda!', 'Move it, buddy!', 'I’ve been standing for 40 minutes!', 'Back off, I’m from Cleveland!'];
const KICK_LINES = [
  'Manager: “Sir, these tables are for— is that a cat?”',
  'A family of nine: “We need this table. All of it. Including you.”',
  'Bachelorette party: “Ew, the cat’s in our seats!”',
  'Guy in a Raiders jersey: “Shoo. SHOO.”',
];

const tmp = new THREE.Vector3();

export interface RestaurantCallbacks {
  getCash: () => number;
  spend: (n: number) => void;
  toast: (msg: string, ms?: number) => void;
  onAte: (place: RestaurantDef, item: MenuItem) => void;
  onKicked: (place: RestaurantDef) => void;
  onTableWon: (place: RestaurantDef) => void;
  sfxCash: () => void;
  sfxBad: () => void;
}

/** In-N-Out chaos + Whataburger peace. Lou orders, waits for his number, then fights for a table. */
export class RestaurantSystem {
  private readonly places: Place[] = [];
  private seq = 0;
  private readonly dialog: HTMLDialogElement;
  /** What Lou is doing with food right now. */
  cat: { place: Place | null; state: 'idle' | 'ordered' | 'ready' | 'carrying' | 'eating'; number: number; timer: number; item: MenuItem | null; table: RestaurantTable | null } = {
    place: null,
    state: 'idle',
    number: 0,
    timer: 0,
    item: null,
    table: null,
  };
  readonly burger: THREE.Group;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly crowd: StripCrowdSystem,
    defs: RestaurantDef[],
    private readonly cb: RestaurantCallbacks
  ) {
    this.burger = burgerProp();
    this.burger.scale.setScalar(2.2);
    this.burger.visible = false;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'casino-dialog food-dialog';
    this.dialog.setAttribute('closedby', 'any');
    document.getElementById('game-root')!.append(this.dialog);
    for (const def of defs) this.addPlace(def);
  }

  isOpen(): boolean {
    return this.dialog.open;
  }

  private addPlace(def: RestaurantDef): void {
    const place: Place = { def, diners: [], workers: [], serving: 60 + Math.floor(Math.random() * 20) };
    def.workers.forEach((w, i) => {
      const rig = buildHuman(200 + i + this.places.length * 7, def.kind === 'innout' ? 'worker' : 'tourist', 'none');
      rig.group.position.copy(w);
      tmp.copy(def.door).sub(w);
      rig.group.rotation.y = Math.atan2(tmp.x, tmp.z);
      this.scene.add(rig.group);
      place.workers.push({ ...rig, mesh: rig.group, speechSprite: null, speechTimer: 0 });
    });
    if (def.kind === 'innout') {
      // Packed: almost every table taken, a line out the door
      def.tables.forEach((t, i) => {
        if (i % 7 === 3) return;
        const d = this.newDiner(place, t.pos);
        this.seat(d, t);
        d.timer = 4 + Math.random() * 30;
      });
      for (let i = 0; i < Math.min(9, def.queue.length); i++) {
        const d = this.newDiner(place, def.queue[i]);
        d.state = 'queue';
        d.target.copy(def.queue[i]);
      }
      for (let i = 0; i < 2; i++) {
        const d = this.newDiner(place, tmp.copy(def.pickup).add(new THREE.Vector3(i - 0.5, 0, 1.2)));
        d.state = 'waiting';
        d.timer = 2 + i * 4;
      }
    } else {
      // One customer, asleep, since Tuesday
      const t = def.tables[def.tables.length - 1];
      const d = this.newDiner(place, t.pos);
      this.seat(d, t);
      d.state = 'sleeping';
      this.crowd.say(d, 'Zzz…', 9999, '#888888');
    }
    this.places.push(place);
  }

  private newDiner(place: Place, at: THREE.Vector3): Diner {
    const rig = buildHuman(300 + this.seq * 3, 'tourist', this.seq % 4 === 0 ? 'bag' : 'none');
    rig.group.position.copy(at);
    this.scene.add(rig.group);
    const tray = burgerProp();
    tray.scale.setScalar(1.8);
    tray.position.set(0, 1.08, 0.32);
    tray.visible = false;
    rig.group.add(tray);
    const d: Diner = { ...rig, id: `d${this.seq++}`, mesh: rig.group, state: 'queue', timer: 0, target: at.clone(), table: null, speechSprite: null, speechTimer: 0, walkPhase: 0, tray };
    place.diners.push(d);
    return d;
  }

  private seat(d: Diner, t: RestaurantTable): void {
    d.table = t;
    t.taken = d.id;
    d.state = 'eating';
    d.timer = 18 + Math.random() * 25;
    d.mesh.position.set(t.pos.x, t.pos.y - 0.38, t.pos.z);
    d.mesh.rotation.y = t.yaw;
    sitRig(d, true);
    d.tray.visible = true;
  }

  private standUp(d: Diner): void {
    if (d.table && d.table.taken === d.id) d.table.taken = null;
    d.mesh.position.y = d.table ? d.table.pos.y : d.mesh.position.y;
    d.table = null;
    sitRig(d, false);
  }

  /** What's near Lou (for prompts and the [F] key). */
  nearest(pos: THREE.Vector3): { place: Place; what: 'counter' | 'pickup' | 'table'; table?: RestaurantTable } | null {
    for (const place of this.places) {
      const b = place.def.bounds;
      if (pos.x < b.minX - 2 || pos.x > b.maxX + 2 || pos.z < b.minZ - 2 || pos.z > b.maxZ + 2) continue;
      if (this.cat.state === 'ready' && this.cat.place === place && pos.distanceTo(place.def.pickup) < 2.4) return { place, what: 'pickup' };
      if (this.cat.state === 'carrying') {
        for (const t of place.def.tables) if (!t.taken && Math.hypot(pos.x - t.pos.x, pos.z - t.pos.z) < 1.8) return { place, what: 'table', table: t };
      }
      if (this.cat.state === 'idle' && pos.distanceTo(place.def.counter) < 2.6) return { place, what: 'counter' };
    }
    return null;
  }

  promptFor(pos: THREE.Vector3): string | null {
    const n = this.nearest(pos);
    if (this.cat.state === 'eating') return `Eating at ${this.cat.place!.def.name}… (${Math.ceil(this.cat.timer)}s) — [G] get up`;
    if (!n) {
      if (this.cat.state === 'ordered') return `Order #${this.cat.number} — wait for your number (${Math.ceil(this.cat.timer)}s)`;
      if (this.cat.state === 'ready') return `Order #${this.cat.number} is READY — grab it at the pickup counter`;
      if (this.cat.state === 'carrying') return 'Find a FREE table and press [F] — move fast, it’s a war zone';
      return null;
    }
    if (n.what === 'counter') return n.place.def.kind === 'innout' ? 'Press [F] to order at In-N-Out (the line is real)' : 'Press [F] to order at Whataburger (no line. no anything.)';
    if (n.what === 'pickup') return `Press [F] to grab order #${this.cat.number}`;
    return 'Press [F] to CLAIM this table!';
  }

  /** [F] near a restaurant. Returns true if it handled the key. */
  interact(pos: THREE.Vector3): boolean {
    const n = this.nearest(pos);
    if (!n) return false;
    if (n.what === 'counter') {
      this.openMenu(n.place);
      return true;
    }
    if (n.what === 'pickup') {
      this.cat.state = 'carrying';
      this.burger.visible = true;
      this.cb.toast('Got the food. Now find a table before someone else does.');
      return true;
    }
    if (n.what === 'table' && n.table) {
      this.cat.state = 'eating';
      this.cat.table = n.table;
      n.table.taken = 'cat';
      this.cat.timer = 10;
      this.cb.onTableWon(n.place.def);
      // Anyone else rushing this table now has a problem with Lou
      for (const d of n.place.diners) {
        if (d.state === 'seeking' && d.table === n.table) {
          d.table = null;
          d.state = 'waiting';
          this.crowd.say(d, ['Are you KIDDING me?', 'A CAT took my table!', 'Unbelievable. Vegas.'][Math.floor(Math.random() * 3)], 2.6, '#ff4d4d');
        }
      }
      this.cb.toast(n.place.def.kind === 'innout' ? 'TABLE SECURED. Eat fast — they’re circling.' : 'Plenty of tables. All of them, actually.');
      return true;
    }
    return false;
  }

  private openMenu(place: Place): void {
    const items = MENUS[place.def.kind];
    const isIno = place.def.kind === 'innout';
    this.dialog.classList.toggle('food-dialog--wb', !isIno);
    this.dialog.innerHTML = `
      <div class="casino-header"><div><h1>${isIno ? 'In-N-Out Burger' : 'Whataburger'}</h1>
      <p class="casino-sub">${isIno ? `Line: ${place.diners.filter((d) => d.state === 'queue').length} people deep • Now serving #${place.serving}` : 'Line: none • Cashier: barely conscious'}</p></div>
      <div class="casino-bank-wrap"><span class="stat-label">Cash</span><strong class="casino-bank">$${this.cb.getCash()}</strong></div></div>
      <div class="abc-grid">${items
        .map((it, i) => `<button type="button" class="abc-card" data-food="${i}"><strong>${it.name}</strong><span>${it.blurb}</span><em>$${it.price}</em></button>`)
        .join('')}</div>
      <p class="casino-result">${isIno ? 'Tip: your number gets called, THEN you fight for a table.' : '“You’re our first customer since Tuesday.”'}</p>
      <form method="dialog" class="casino-footer"><button type="submit" class="action-btn">Never mind</button></form>`;
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-food]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const item = items[Number(btn.dataset.food)];
        if (this.cb.getCash() < item.price) {
          this.cb.sfxBad();
          this.dialog.querySelector('.casino-result')!.textContent = `That’s $${item.price}. Go hustle some tourists first.`;
          return;
        }
        this.cb.spend(item.price);
        this.cb.sfxCash();
        this.cat.place = place;
        this.cat.item = item;
        this.cat.number = place.serving + (isIno ? 3 + place.diners.filter((d) => d.state === 'queue').length : 1);
        this.cat.timer = isIno ? 14 + Math.random() * 8 : 3;
        this.cat.state = 'ordered';
        this.dialog.close();
        this.cb.toast(isIno ? `Order #${this.cat.number}. ${Math.round(this.cat.timer)} seconds. Stake out a table.` : `Order #${this.cat.number}. It’s already sitting under a heat lamp. Has been for a while.`);
      })
    );
    if (!this.dialog.open) this.dialog.showModal();
  }

  /** Lou walked off / got kicked: lose the seat. */
  private catLoseTable(reason: string): void {
    if (this.cat.table && this.cat.table.taken === 'cat') this.cat.table.taken = null;
    this.cat.table = null;
    this.cat.state = 'carrying';
    this.burger.visible = true;
    this.cb.toast(reason, 4200);
  }

  /** Lou pressed G / moved while eating. */
  getUp(): void {
    if (this.cat.state !== 'eating') return;
    this.catLoseTable('Lou got up. The table was taken before his butt left the seat.');
  }

  /** Per-frame. Returns the seat to pin Lou to while eating, else null. */
  update(dt: number, t: number, catPos: THREE.Vector3): { pos: THREE.Vector3; yaw: number } | null {
    for (const place of this.places) {
      const near = place.def.door.distanceTo(catPos) < 90;
      const show = place.def.door.distanceTo(catPos) < 160;
      for (const w of place.workers) w.mesh.visible = show;
      for (const d of place.diners) d.mesh.visible = show;
      for (const w of place.workers) {
        this.crowd.tickSpeech(w, dt);
        w.rightArm.rotation.x = -0.6 + Math.sin(t * 6 + w.mesh.position.x) * 0.3;
      }
      if (place.def.kind === 'innout' && near && Math.random() < dt * 0.08) {
        place.serving += 1;
        place.def.numberBoard?.set(place.serving);
        const w = place.workers[2] ?? place.workers[0];
        if (w) this.crowd.say(w, `NUMBER ${place.serving}!`, 2.2, '#ffc72c');
      }
      for (const d of place.diners) this.updateDiner(place, d, dt, t, near);
    }

    // Lou's order flow
    const c = this.cat;
    if (c.state === 'ordered') {
      c.timer -= dt;
      if (c.timer <= 0 && c.place) {
        c.state = 'ready';
        c.place.serving = c.number;
        c.place.def.numberBoard?.set(c.number);
        const w = c.place.workers[2] ?? c.place.workers[0];
        if (w) this.crowd.say(w, `NUMBER ${c.number}! …FOR A CAT?`, 3.5, '#ffc72c');
        this.cb.toast(`🔔 NUMBER ${c.number}! Lou’s order is up.`);
      }
    }
    if (c.state === 'eating' && c.table && c.place) {
      c.timer -= dt;
      // In-N-Out is a battlefield: you can get booted mid-burger
      if (c.place.def.kind === 'innout' && Math.random() < dt * 0.035) {
        this.cb.onKicked(c.place.def);
        this.catLoseTable(`${KICK_LINES[Math.floor(Math.random() * KICK_LINES.length)]} Lou was booted from the table!`);
        return null;
      }
      if (c.timer <= 0) {
        const item = c.item!;
        c.table.taken = null;
        this.cb.onAte(c.place.def, item);
        c.state = 'idle';
        c.table = null;
        c.place = null;
        this.burger.visible = false;
        return null;
      }
      return { pos: tmp.copy(c.table.pos).setY(c.table.pos.y + 0.42), yaw: c.table.yaw };
    }
    return null;
  }

  private updateDiner(place: Place, d: Diner, dt: number, t: number, near: boolean): void {
    this.crowd.tickSpeech(d, dt);
    if (this.crowd.tickKnock(d, dt)) return;
    if (!near && d.state !== 'eating' && d.state !== 'sleeping') return;
    const walkTo = (target: THREE.Vector3, speed: number): boolean => {
      tmp.copy(target).sub(d.mesh.position);
      tmp.y = 0;
      const dist = tmp.length();
      if (dist < 0.25) {
        poseRig(d, 0, 0);
        return true;
      }
      tmp.normalize();
      d.mesh.position.addScaledVector(tmp, Math.min(dist, speed * dt));
      d.mesh.rotation.y = Math.atan2(tmp.x, tmp.z);
      d.walkPhase += dt * speed * 4;
      poseRig(d, d.walkPhase, 1.1);
      return false;
    };
    switch (d.state) {
      case 'sleeping':
        d.head.rotation.x = 0.6 + Math.sin(t * 0.8) * 0.05;
        break;
      case 'eating':
        d.timer -= dt;
        d.rightArm.rotation.x = -1.2 + Math.max(0, Math.sin(t * 2.2 + d.mesh.position.x)) * -0.5;
        if (d.timer <= 0) {
          this.standUp(d);
          d.tray.visible = false;
          d.state = 'leaving';
        }
        break;
      case 'leaving':
        if (walkTo(place.def.door, 1.6)) {
          // Rejoin at the back of the line (In-N-Out never empties)
          d.state = 'queue';
          d.target.copy(place.def.queue[place.def.queue.length - 1]);
        }
        break;
      case 'queue': {
        const inLine = place.diners.filter((x) => x.state === 'queue');
        const idx = inLine.indexOf(d);
        const spot = place.def.queue[Math.min(idx, place.def.queue.length - 1)];
        walkTo(spot, 1.2);
        if (idx === 0 && Math.random() < dt * 0.18) {
          d.state = 'waiting';
          d.timer = 6 + Math.random() * 8;
          d.target.copy(place.def.pickup).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, 1 + Math.random()));
        }
        break;
      }
      case 'waiting':
        walkTo(d.target, 1.3);
        d.timer -= dt;
        if (d.timer <= 0) {
          d.tray.visible = true;
          const free = place.def.tables.filter((tb) => !tb.taken && !place.diners.some((o) => o.state === 'seeking' && o.table === tb));
          if (free.length) {
            free.sort((a, b2) => a.pos.distanceTo(d.mesh.position) - b2.pos.distanceTo(d.mesh.position));
            d.table = free[0];
            d.state = 'seeking';
          } else {
            d.timer = 2 + Math.random() * 3; // hovering… circling…
            if (Math.random() < 0.35) this.crowd.say(d, ['Anyone leaving??', 'Are you done with that?', 'I’ll stand. It’s FINE.'][Math.floor(Math.random() * 3)], 2.2);
          }
        }
        break;
      case 'seeking': {
        const tb = d.table!;
        if (tb.taken) {
          // Someone (maybe Lou) beat them to it
          d.state = 'waiting';
          d.timer = 1.5;
          d.table = null;
          if (Math.random() < 0.5) this.crowd.say(d, RUSH_LINES[Math.floor(Math.random() * RUSH_LINES.length)], 2.4, '#ff4d4d');
          break;
        }
        // Two people racing for the same table → shoving match
        const rival = place.diners.find((o) => o !== d && o.state === 'seeking' && o.table === tb);
        if (rival && rival.mesh.position.distanceTo(d.mesh.position) < 1.2) {
          const loser = Math.random() < 0.5 ? d : rival;
          const winner = loser === d ? rival : d;
          this.crowd.knockdown(loser, loser.mesh.position.x - winner.mesh.position.x, loser.mesh.position.z - winner.mesh.position.z, 3.5);
          this.crowd.say(winner, RUSH_LINES[Math.floor(Math.random() * RUSH_LINES.length)], 2.4, '#ff4d4d');
          this.crowd.say(loser, 'OW! My fries!', 2.2);
          loser.table = null;
          loser.state = 'waiting';
          loser.timer = 4;
        }
        if (walkTo(tb.pos, 2.6)) this.seat(d, tb);
        break;
      }
    }
  }
}
