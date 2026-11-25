import * as THREE from 'three';
import type { MapMarker } from './minimap';
import type { GameState } from './state';

export type MissionEvent =
  | 'tip'
  | 'abc-buy'
  | 'smoke'
  | 'blackjack-win'
  | 'casino-win'
  | 'wanted-escaped'
  | 'car-stolen'
  | 'ride'
  | 'burger-eaten'
  | 'table-won'
  | 'vape-trick'
  | 'knockdown'
  | 'photo-sign'
  | 'slots-spin';

export interface MissionCtx {
  state: GameState;
  catPos: THREE.Vector3;
  driving: boolean;
  stars: number;
  cigLit: boolean;
}

interface Step {
  text: string;
  target?: [number, number, number];
  event?: MissionEvent;
  /** Count events (or sum `amount`) until this is reached. */
  need?: number;
  sum?: boolean;
  filter?: (data: Record<string, unknown>, ctx: MissionCtx) => boolean;
  check?: (ctx: MissionCtx) => boolean;
  requireDriving?: boolean;
  timeLimit?: number;
}

export interface MissionDef {
  id: string;
  title: string;
  giver: string;
  at: [number, number];
  intro: string;
  outro: string;
  steps: Step[];
  reward: { cash: number; points: number };
  after?: string;
}

export const MISSIONS: MissionDef[] = [
  {
    id: 'welcome',
    title: 'Welcome to Fabulous Las Vegas',
    giver: 'Elvis (Welcome sign photo line)',
    at: [3.2, 922],
    intro: '“Well hey there, little fella. 3:47 in the morning and you’ve got two cigarettes and no money? Kid, you’re gonna fit right in. Get your picture at the sign, then catch the Deuce up the Strip — the real hustle is at the Bellagio fountains.”',
    outro: '“Now you’re in Vegas, baby. Go find the Elvis at the fountains. Tell him the King sent ya.”',
    steps: [
      { text: 'Pose for a photo at the Welcome sign [B]', event: 'photo-sign' },
      { text: 'Take THE DEUCE north (wait at a gold stop, [G]) — or run it', target: [-15, 0, 60] },
    ],
    reward: { cash: 20, points: 200 },
  },
  {
    id: 'first-hustle',
    title: "Lou's First Hustle",
    giver: 'Elvis (Bellagio Fountains)',
    at: [-14.6, 57.5],
    intro: '“Well thank you, kitty. New in town? Rule one: Vegas runs on cash. Hustle up $30, grab smokes at the ABC in the Miracle Mile, then light one under the Eiffel Tower like a classy cat.”',
    outro: '“Now THAT’s a Vegas cat. Thank you… thank you very much.”',
    steps: [
      { text: 'Hustle $30 in tips from tourists [B]', event: 'tip', need: 30, sum: true },
      { text: 'Buy smokes at ABC Stores (Miracle Mile, east side)', target: [30, 0, 158], event: 'abc-buy' },
      { text: 'Light up under the Eiffel Tower [E]', target: [32, 0, 77], event: 'smoke', filter: (_d, c) => Math.hypot(c.catPos.x - 32, c.catPos.z - 77) < 9 },
    ],
    reward: { cash: 60, points: 300 },
    after: 'welcome',
  },
  {
    id: 'double-double',
    title: 'Double-Double Trouble',
    giver: 'Hungry tourist (BLVD steps)',
    at: [18.4, 309],
    intro: '“Bro. The new In-N-Out on the BLVD roof is the biggest one in Vegas. The line is insane and people are FIGHTING for tables. Get a Double-Double and actually finish it. I believe in you, cat.”',
    outro: '“You ate the whole thing at a table? In THAT crowd? Legend.”',
    steps: [
      { text: 'Get up to the BLVD rooftop (grand stairs or the glass elevator)', target: [40, 0, 262] },
      { text: 'Order, grab your number, win a table and finish your burger', event: 'burger-eaten', filter: (d) => d.kind === 'innout' },
    ],
    reward: { cash: 80, points: 500 },
  },
  {
    id: 'whataburger-pity',
    title: 'Whataburger Pity Visit',
    giver: 'Whataburger cashier (across the street)',
    at: [-23, 296],
    intro: '“Hi. Hello. Welcome. You’re… our first customer since Tuesday. Everybody goes to the In-N-Out across the street. Could you just… eat something here? Anything? Please?”',
    outro: '“You finished it! Corporate is going to frame this receipt.”',
    steps: [{ text: 'Eat at Whataburger (it has tables. all of them.)', event: 'burger-eaten', filter: (d) => d.kind === 'whataburger' }],
    reward: { cash: 25, points: 150 },
  },
  {
    id: 'table-wars',
    title: 'Table Wars',
    giver: 'In-N-Out manager (LINQ Promenade)',
    at: [96, -110.5],
    intro: '“Look, I can’t officially endorse table combat. Unofficially? Win three tables during the rush and lunch is on me.”',
    outro: '“Three tables. I’ve never seen anything like it. Please never come back during the lunch rush.”',
    steps: [{ text: 'Claim 3 In-N-Out tables (any location) [F]', event: 'table-won', need: 3 }],
    reward: { cash: 150, points: 900 },
    after: 'double-double',
  },
  {
    id: 'slots-a-fun',
    title: 'Slots-A-Fun Forever',
    giver: 'Elvis (Circus Circus)',
    at: [-16.5, -698],
    intro: '“This is where the real degens play, son. $2 beer, coin slots, Lucky the Clown watching over us… well, he’s dark now. Play five spins for the old clown.”',
    outro: '“Lucky would be proud. If his electrics weren’t fried.”',
    steps: [{ text: 'Spin the slots at Slots-A-Fun 5 times', event: 'slots-spin', need: 5, filter: (d) => String(d.casino).includes('Slots') }],
    reward: { cash: 75, points: 600 },
  },
  {
    id: 'card-sharp',
    title: 'Card Sharp',
    giver: 'Showgirl (Caesars corner)',
    at: [-15.2, -27],
    intro: '“Honey, the house always wins… unless the house is distracted by a cat. Win two hands of blackjack and I’ll split my tips with you.”',
    outro: '“Two hands! The pit boss is still looking for your paws under the table.”',
    steps: [{ text: 'Win 2 hands of blackjack (Bellagio, Caesars, Paris, Flamingo, Cosmo)', event: 'blackjack-win', need: 2 }],
    reward: { cash: 120, points: 400 },
  },
  {
    id: 'smoke-screen',
    title: 'Smoke Screen',
    giver: 'Card slapper (The Vanderpump)',
    at: [15.6, -27.5],
    intro: '*slap slap* “Animal Control’s been asking about a fat brown tabby. Show ’em you can vanish. Get some heat, then hide in a big vape cloud — hold [E] — till they give up.”',
    outro: '“Gone like a free buffet. Respect.”',
    steps: [
      { text: 'Get 2★ of Animal Control heat (pounce [C], steal, jack a car…)', check: (c) => c.stars >= 2 },
      { text: 'Lose them. Big vape clouds [hold E] hide you', event: 'wanted-escaped' },
    ],
    reward: { cash: 150, points: 600 },
    after: 'first-hustle',
  },
  {
    id: 'grand-theft-uber',
    title: 'Grand Theft Uber',
    giver: 'Elvis (Planet Hollywood)',
    at: [17.4, 137],
    intro: '“My ride bailed and my show at the High Roller starts in ninety seconds. Borrow us a car, kitty. Don’t ask whose.”',
    outro: '“You drove THROUGH the Promenade?! …I’ve never been prouder.”',
    steps: [
      { text: 'Jack a car stopped at a light [G]', event: 'car-stolen' },
      { text: 'Drive to the High Roller before time runs out', target: [150, 0, -104], requireDriving: true, timeLimit: 95 },
    ],
    reward: { cash: 200, points: 800 },
    after: 'first-hustle',
  },
  {
    id: 'high-roller-smoke',
    title: 'Smoking Section: 550 Feet',
    giver: 'Card slapper (LINQ Promenade)',
    at: [16.8, -114.5],
    intro: '“Bet you can’t ride the whole High Roller loop with a lit cig. They have smoke detectors up there. Probably.”',
    outro: '“Full loop, still lit. You absolute legend.”',
    steps: [{ text: 'Ride the High Roller with a lit cigarette', event: 'ride', filter: (d, c) => d.kind === 'highroller' && c.cigLit }],
    reward: { cash: 100, points: 500 },
  },
  {
    id: 'vape-god',
    title: 'Cloud Chaser of the Canal',
    giver: 'Showgirl (The Venetian)',
    at: [16.8, -259],
    intro: '“The gondola tourists want a show. Give ’em four vape tricks — keys 1 to 4 — and make it look effortless, darling.”',
    outro: '“A tornado, a ghost AND O-rings? You’re booked through New Year’s.”',
    steps: [{ text: 'Pull off 4 vape tricks [1–4 in vape mode]', event: 'vape-trick', need: 4 }],
    reward: { cash: 120, points: 600 },
  },
  {
    id: 'the-whale',
    title: 'The Whale',
    giver: 'VIP Host (Cosmopolitan)',
    at: [-47.5, 186],
    intro: '“Mr. Lou. Our VIP lounge is for whales. Get on the list, then win $300 at a high-limit table and we’ll comp your cigars forever.”',
    outro: '“Sir, your cigars are comped for life. Please stop sitting on the dealer.”',
    steps: [
      { text: 'Get into the VIP lounge (win $500 total or 5 Swag)', check: (c) => c.state.vip },
      { text: 'Win $300 at the VIP tables', event: 'casino-win', need: 300, sum: true, filter: (d) => d.vip === true },
    ],
    reward: { cash: 500, points: 2000 },
    after: 'card-sharp',
  },
];

export class MissionManager {
  private readonly hud: HTMLElement;
  private readonly dialog: HTMLElement;
  private readonly markers = new Map<string, THREE.Group>();
  private readonly beacon: THREE.Group;
  private active: MissionDef | null = null;
  private stepIdx = 0;
  private progress = 0;
  private timer = 0;
  private dialogTimer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly getState: () => GameState,
    private readonly onComplete: (m: MissionDef) => void,
    private readonly onToast: (msg: string) => void
  ) {
    const host = document.getElementById('game-root')!;
    this.hud = document.createElement('div');
    this.hud.className = 'mission-hud';
    this.hud.hidden = true;
    this.dialog = document.createElement('div');
    this.dialog.className = 'mission-dialog';
    this.dialog.hidden = true;
    this.dialog.addEventListener('click', () => (this.dialog.hidden = true));
    host.append(this.hud, this.dialog);
    this.beacon = this.makeBeacon(0x5cff8a);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.refreshMarkers();
  }

  private makeBeacon(color: number): THREE.Group {
    const g = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 40, 16, 1, true), beamMat));
    g.children[0].position.y = 20;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    return g;
  }

  private available(): MissionDef[] {
    const done = this.getState().stats.missionsDone;
    return MISSIONS.filter((m) => !done.includes(m.id) && (!m.after || done.includes(m.after)));
  }

  refreshMarkers(): void {
    for (const g of this.markers.values()) this.scene.remove(g);
    this.markers.clear();
    if (this.active) return;
    for (const m of this.available()) {
      const g = this.makeBeacon(0xffd24d);
      g.position.set(m.at[0], 0, m.at[1]);
      const bang = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: 0xffd24d }));
      bang.position.y = 3.2;
      bang.name = 'bang';
      g.add(bang);
      this.scene.add(g);
      this.markers.set(m.id, g);
    }
  }

  markers2D(): MapMarker[] {
    const out: MapMarker[] = [];
    for (const m of this.available()) if (!this.active) out.push({ x: m.at[0], z: m.at[1], color: '#ffd24d', glyph: '!', size: 3.2 });
    const t = this.currentTarget();
    if (t) out.push({ x: t[0], z: t[2], color: '#5cff8a', glyph: '◆', size: 3.4 });
    return out;
  }

  private currentTarget(): [number, number, number] | null {
    return this.active ? this.active.steps[this.stepIdx].target ?? null : null;
  }

  nearbyOffer(pos: THREE.Vector3): MissionDef | null {
    if (this.active) return null;
    for (const m of this.available()) if (Math.hypot(pos.x - m.at[0], pos.z - m.at[1]) < 2.6) return m;
    return null;
  }

  isActive(): boolean {
    return !!this.active;
  }

  start(m: MissionDef): void {
    this.active = m;
    this.stepIdx = 0;
    this.beginStep();
    this.refreshMarkers();
    this.say(`${m.giver}`, m.intro);
  }

  abandon(): void {
    if (!this.active) return;
    this.onToast(`Mission abandoned: ${this.active.title}`);
    this.active = null;
    this.beacon.visible = false;
    this.hud.hidden = true;
    this.refreshMarkers();
  }

  private beginStep(): void {
    this.progress = 0;
    const step = this.active!.steps[this.stepIdx];
    this.timer = step.timeLimit ?? 0;
    const t = step.target;
    this.beacon.visible = !!t;
    if (t) this.beacon.position.set(t[0], t[1], t[2]);
  }

  private say(who: string, text: string): void {
    this.dialog.innerHTML = `<strong>${who}</strong><p>${text}</p><small>click to close</small>`;
    this.dialog.hidden = false;
    this.dialogTimer = 9;
  }

  emit(event: MissionEvent, data: Record<string, unknown>, ctx: MissionCtx): void {
    if (!this.active) return;
    const step = this.active.steps[this.stepIdx];
    if (step.event !== event) return;
    if (step.filter && !step.filter(data, ctx)) return;
    if (step.target && !this.atTarget(step, ctx)) return;
    this.progress += step.sum ? Number(data.amount ?? 0) : 1;
    if (this.progress >= (step.need ?? 1)) this.advance();
  }

  private atTarget(step: Step, ctx: MissionCtx): boolean {
    const t = step.target!;
    return Math.hypot(ctx.catPos.x - t[0], ctx.catPos.z - t[2]) < 9;
  }

  update(dt: number, t: number, ctx: MissionCtx): void {
    if (this.dialogTimer > 0) {
      this.dialogTimer -= dt;
      if (this.dialogTimer <= 0) this.dialog.hidden = true;
    }
    for (const g of this.markers.values()) {
      const bang = g.getObjectByName('bang');
      if (bang) {
        bang.rotation.y = t * 2;
        bang.position.y = 3.2 + Math.sin(t * 3) * 0.25;
      }
    }
    if (!this.active) {
      this.hud.hidden = true;
      return;
    }
    const step = this.active.steps[this.stepIdx];
    if (step.timeLimit) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.onToast(`Mission failed: ${this.active.title} — out of time. The marker is back where you got it.`);
        this.active = null;
        this.beacon.visible = false;
        this.refreshMarkers();
        return;
      }
    }
    if (!step.event) {
      const reached = step.target ? this.atTarget(step, ctx) && (!step.requireDriving || ctx.driving) : true;
      if (reached && (!step.check || step.check(ctx))) this.advance();
    }
    this.beacon.rotation.y = t;
    const need = step.need && step.need > 1 ? ` (${step.sum ? '$' : ''}${Math.min(this.progress, step.need)}/${step.sum ? '$' : ''}${step.need})` : '';
    const time = step.timeLimit ? ` — ${Math.ceil(this.timer)}s` : '';
    const dist = step.target ? ` • ${Math.round(Math.hypot(ctx.catPos.x - step.target[0], ctx.catPos.z - step.target[2]))} m` : '';
    this.hud.hidden = false;
    this.hud.innerHTML = `<b>${this.active.title}</b><span>${step.text}${need}${time}${dist}</span>`;
  }

  private advance(): void {
    const m = this.active!;
    this.stepIdx += 1;
    if (this.stepIdx >= m.steps.length) {
      const s = this.getState();
      if (!s.stats.missionsDone.includes(m.id)) s.stats.missionsDone.push(m.id);
      this.active = null;
      this.beacon.visible = false;
      this.hud.hidden = true;
      this.say(m.giver, m.outro);
      this.onComplete(m);
      this.refreshMarkers();
      return;
    }
    this.onToast(`✔ ${m.steps[this.stepIdx - 1].text}`);
    this.beginStep();
  }
}
