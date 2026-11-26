import * as THREE from 'three';
import { SoundFX } from './audio';
import { bakeGroup } from './meshBake';
import type { Rideable, RideView } from './rides';
import type { VegasWorldContext } from './vegasWorld';
import { INDOOR_ZONE } from './world/builder';
import { RIDESHARE_SPOTS, spotSign, WAYMO_UPSTREAM, type RideshareSpot } from './world/rideshareSpots';
import { crosswalkPhase, CROSSWALKS, flamingoPhase, STRIP, tropicanaPhase, type TrafficCar } from './world/strip';
import { buildRideshareCar, buildZoox, type RideBrand, type RideModel } from './world/vehicles';

/*
 * Rideshare on the Strip: Waymos (driverless, lidar spinning, careful) and Uber cars in the traffic, which
 * Lou can hail at a RIDESHARE PICKUP sign with [G] or from the phone (`catsmoke:hail`). The car leaves the
 * traffic, drives to the pickup, waits with its flashers on, Lou hops in the back, it drives to one of the
 * Strip's famous stops (the one Lou faces; [Tab] picks the next), pulls over and Lou hops out. Uber charges a
 * small fare and the driver talks; Waymo talks through its rider screen. Every step is reported with
 * `catsmoke:ride-status` for the phone. Cars are TrafficCar entries, so main.ts culls them with the rest of
 * the traffic and the Strip's traffic loop drives them while they're free.
 */

export type RideService = 'waymo' | 'uber';
type RideState = 'requested' | 'arriving' | 'arrived' | 'riding' | 'done' | 'cancelled' | 'unavailable';

export interface RideshareHooks {
  world: VegasWorldContext;
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** Lou (the cat holder). */
  cat: THREE.Object3D;
  /** Take up to `amount` dollars from Lou; returns what was paid. */
  pay: (amount: number) => number;
  toast: (msg: string, ms?: number) => void;
  /** Dev / check builds: add the postcard shortcuts. */
  dev: boolean;
}

export interface RideshareApi {
  update: (dt: number) => void;
}

// ---------------------------------------------------------------- the road model
const DRIVE = STRIP.laneCenters[1]; // traffic's outer car lane (6.5 m off the centre line)
const CURB = STRIP.curb - 1.4; // a stopped car's centre against the Boulevard curb
const TURN_R = 7;
const U_R = DRIVE; // a U-turn swings from one 6.5 m lane to the other
/** Where the median is cut (every crosswalk and both big intersections): the only places a car U-turns. */
const TURNAROUNDS = [...CROSSWALKS.map((c) => c.z), 0, STRIP.tropicanaZ].sort((a, c) => a - c);

/** Famous stops on the Boulevard curb (side −1 = west curb, reached southbound). Kept clear of Deuce stops. */
interface Dest {
  name: string;
  z: number;
  side: -1 | 1;
}
const DESTS: Dest[] = [
  { name: 'Fontainebleau', z: -790, side: 1 },
  { name: 'Circus Circus', z: -745, side: -1 },
  { name: 'Resorts World', z: -610, side: -1 },
  { name: 'Wynn & Encore', z: -515, side: 1 },
  { name: 'Fashion Show', z: -432, side: -1 },
  { name: 'Treasure Island', z: -380, side: -1 },
  { name: 'The Venetian & the Sphere', z: -212, side: 1 },
  { name: 'The LINQ & High Roller', z: -122, side: 1 },
  { name: 'Caesars Palace', z: -78, side: -1 },
  { name: 'Flamingo', z: -58, side: 1 },
  { name: 'Bellagio Fountains', z: 55, side: -1 },
  { name: 'Paris & the Eiffel Tower', z: 74, side: 1 },
  { name: 'Planet Hollywood', z: 150, side: 1 },
  { name: 'The Cosmopolitan', z: 228, side: -1 },
  { name: 'New York-New York', z: 392, side: -1 },
  { name: 'MGM Grand', z: 422, side: 1 },
  { name: 'Excalibur', z: 470, side: -1 },
  { name: 'Luxor', z: 553, side: -1 },
  { name: 'Mandalay Bay', z: 645, side: -1 },
  { name: 'Welcome to Fabulous Las Vegas sign', z: 905, side: -1 },
];

/** A stop on a curb: the Boulevard (lane direction `dir`, position z = s) or a cross street (x = s). */
interface Stop {
  name: string;
  road: 'strip' | 'cross';
  zc: number;
  dir: 1 | -1;
  s: number;
  driveOff: number;
  curbOff: number;
  spot?: RideshareSpot;
}

function lanePt(road: 'strip' | 'cross', zc: number, dir: 1 | -1, s: number, off: number): [number, number] {
  return road === 'strip' ? [-dir * off, s] : [s, zc + dir * off];
}

/** Arc-length polyline with a speed cap per point (curves and the stop at the end). */
class Path {
  readonly x: number[] = [];
  readonly z: number[] = [];
  cum: number[] = [];
  cap: number[] = [];
  len = 0;
  start(x: number, z: number): this {
    this.x.push(x);
    this.z.push(z);
    return this;
  }
  private get lx(): number {
    return this.x[this.x.length - 1];
  }
  private get lz(): number {
    return this.z[this.z.length - 1];
  }
  line(x: number, z: number): this {
    const d = Math.hypot(x - this.lx, z - this.lz);
    const n = Math.max(1, Math.ceil(d / 1.5));
    const x0 = this.lx;
    const z0 = this.lz;
    for (let i = 1; i <= n; i++) this.start(x0 + ((x - x0) * i) / n, z0 + ((z - z0) * i) / n);
    return this;
  }
  /** Cubic Bézier from the current point, leaving along (d0x, d0z) and arriving at (x, z) along (d3x, d3z). */
  curve(d0x: number, d0z: number, x: number, z: number, d3x: number, d3z: number): this {
    const x0 = this.lx;
    const z0 = this.lz;
    const L = Math.hypot(x - x0, z - z0);
    const dot = d0x * d3x + d0z * d3z;
    const k = dot > 0.7 ? 0.42 * L : dot < -0.7 ? 0.667 * L : 0.39 * L;
    const c1x = x0 + d0x * k;
    const c1z = z0 + d0z * k;
    const c2x = x - d3x * k;
    const c2z = z - d3z * k;
    const n = Math.max(4, Math.ceil((L * 1.4) / 0.6));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const e = t * t * t;
      this.start(a * x0 + b * c1x + c * c2x + e * x, a * z0 + b * c1z + c * c2z + e * z);
    }
    return this;
  }
  /** Lengths and the speed profile: lateral grip `aLat` in curves, braking `aBrake` into the end. */
  finish(aLat: number, aBrake: number): this {
    const n = this.x.length;
    this.cum = new Array(n).fill(0);
    for (let i = 1; i < n; i++) this.cum[i] = this.cum[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    this.len = this.cum[n - 1];
    this.cap = new Array(n).fill(40);
    for (let i = 1; i < n - 1; i++) {
      const a0 = Math.atan2(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
      const a1 = Math.atan2(this.x[i + 1] - this.x[i], this.z[i + 1] - this.z[i]);
      let da = Math.abs(a1 - a0);
      if (da > Math.PI) da = Math.PI * 2 - da;
      const ds = Math.max(0.05, (this.cum[i + 1] - this.cum[i - 1]) / 2);
      const kappa = da / ds;
      if (kappa > 1e-3) this.cap[i] = Math.min(40, Math.sqrt(aLat / kappa));
    }
    this.cap[n - 1] = 0;
    for (let i = n - 2; i >= 0; i--) this.cap[i] = Math.min(this.cap[i], Math.sqrt(this.cap[i + 1] ** 2 + 2 * aBrake * (this.cum[i + 1] - this.cum[i])));
    return this;
  }
  /** Position, heading and speed cap at arc length d (i is a monotonic cursor). */
  sample(d: number, cur: { i: number }, out: { x: number; z: number; fx: number; fz: number; cap: number }): void {
    const n = this.x.length;
    let i = Math.min(cur.i, n - 2);
    while (i < n - 2 && this.cum[i + 1] < d) i++;
    cur.i = i;
    const seg = Math.max(1e-6, this.cum[i + 1] - this.cum[i]);
    const t = THREE.MathUtils.clamp((d - this.cum[i]) / seg, 0, 1);
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
    out.z = this.z[i] + (this.z[i + 1] - this.z[i]) * t;
    const dx = this.x[i + 1] - this.x[i];
    const dz = this.z[i + 1] - this.z[i];
    const l = Math.hypot(dx, dz) || 1;
    out.fx = dx / l;
    out.fz = dz / l;
    out.cap = this.cap[i] + (this.cap[i + 1] - this.cap[i]) * t;
  }
}

/** A U-turn through the median cut at `u`, from the lane heading `d`. */
function uTurn(p: Path, d: 1 | -1, u: number): number {
  const s = u - d * U_R;
  p.line(-d * DRIVE, s);
  p.curve(0, d, d * DRIVE, s, 0, -d);
  return s;
}

/** Boulevard driving from lane `d0` at s0 to lane `d1` at s1 (U-turning at median cuts as needed). */
function stripLeg(p: Path, d0: 1 | -1, s0: number, d1: 1 | -1, s1: number): boolean {
  const inMap = (u: number) => u - U_R > STRIP.north + 20 && u + U_R < STRIP.south - 20;
  const nearest = (d: 1 | -1, from: number, ok: (u: number) => boolean) => {
    let best: number | null = null;
    for (const u of TURNAROUNDS) {
      if (!inMap(u) || (u - from) * d < U_R + 10 || !ok(u)) continue;
      if (best === null || (u - from) * d < (best - from) * d) best = u;
    }
    return best;
  };
  if (d0 === d1 && (s1 - s0) * d0 >= 0) {
    p.line(-d1 * DRIVE, s1);
    return true;
  }
  if (d0 !== d1) {
    const u = nearest(d0, s0, (u) => (u - s1) * d0 >= U_R + 20);
    if (u === null) return false;
    uTurn(p, d0, u);
    p.line(-d1 * DRIVE, s1);
    return true;
  }
  const u1 = nearest(d0, s0, () => true);
  if (u1 === null) return false;
  const sA = u1 - d0 * U_R;
  const back = -d0 as 1 | -1;
  const u2 = nearest(back, sA, (u) => (u - s1) * back >= U_R + 20);
  if (u2 === null) return false;
  uTurn(p, d0, u1);
  uTurn(p, back, u2);
  p.line(-d1 * DRIVE, s1);
  return true;
}

/** Pull in from the lane to the curb at the stop (the last 14 m), or out of it. */
function pullIn(p: Path, st: Stop, fromOff = st.driveOff): void {
  const [ax, az] = lanePt(st.road, st.zc, st.dir, st.s - st.dir * 14, fromOff);
  const [bx, bz] = lanePt(st.road, st.zc, st.dir, st.s, st.curbOff);
  const [fx, fz] = st.road === 'strip' ? [0, st.dir] : [st.dir, 0];
  p.line(ax, az);
  p.curve(fx, fz, bx, bz, fx, fz);
}
function pullOut(p: Path, st: Stop): { s: number } {
  const [ax, az] = lanePt(st.road, st.zc, st.dir, st.s, st.curbOff);
  const [bx, bz] = lanePt(st.road, st.zc, st.dir, st.s + st.dir * 14, st.driveOff);
  const [fx, fz] = st.road === 'strip' ? [0, st.dir] : [st.dir, 0];
  p.start(ax, az);
  p.curve(fx, fz, bx, bz, fx, fz);
  return { s: st.s + st.dir * 14 };
}

/** From a cross-street lane heading toward the Strip, turn onto the Boulevard heading `D`; returns the Boulevard s. */
function turnOnto(p: Path, st: Stop, D: 1 | -1): number {
  const xX = -D * DRIVE;
  const zX = st.zc + st.dir * st.driveOff;
  p.line(xX - st.dir * TURN_R, zX);
  p.curve(st.dir, 0, xX, zX + D * TURN_R, 0, D);
  return zX + D * TURN_R;
}

/** The whole ride: pull out at the pickup, find the Boulevard, U-turn if the stop is on the other side, pull in. */
function ridePath(from: Stop, to: Stop): Path | null {
  const d1 = to.dir;
  const s1 = to.s - d1 * 14;
  const tries: Array<() => Path | null> = [];
  if (from.road === 'strip') {
    tries.push(() => {
      const p = new Path();
      const { s } = pullOut(p, from);
      return stripLeg(p, from.dir, s, d1, s1) ? p : null;
    });
  } else {
    for (const D of [1, -1] as const) {
      tries.push(() => {
        const p = new Path();
        pullOut(p, from);
        const s = turnOnto(p, from, D);
        return stripLeg(p, D, s, d1, s1) ? p : null;
      });
    }
  }
  let best: Path | null = null;
  for (const t of tries) {
    const p = t();
    if (!p) continue;
    pullIn(p, to);
    p.finish(1, 1);
    if (!best || p.len < best.len) best = p;
  }
  return best;
}

function destStop(d: Dest): Stop {
  const dir = d.side < 0 ? 1 : -1;
  return { name: d.name, road: 'strip', zc: 0, dir, s: d.z, driveOff: DRIVE, curbOff: CURB };
}

function spotStop(sp: RideshareSpot, service: RideService): Stop {
  return { name: sp.name, road: 'cross', zc: sp.zc, dir: sp.dir, s: service === 'waymo' ? sp.x - sp.dir * WAYMO_UPSTREAM : sp.x, driveOff: sp.driveOff, curbOff: sp.curbOff, spot: sp };
}

// ---------------------------------------------------------------- traffic lights (same plan the traffic loop uses)
const clock = () => performance.now() / 1000;
/** Distance to a red / yellow stop line ahead of a car at (x, z) heading (fx, fz); Infinity if clear. */
function lightAhead(x: number, z: number, fx: number, fz: number): number {
  const t = clock();
  let best = Infinity;
  const consider = (d: number, phase: string) => {
    if (phase !== 'go' && d > 2.5 && d < best) best = d;
  };
  if (Math.abs(fz) > 0.97 && Math.abs(x) < STRIP.curb) {
    const dir = fz > 0 ? 1 : -1;
    consider((-dir * (STRIP.flamingoHalf + 2.2) - z) * dir, flamingoPhase(t).ns);
    consider((STRIP.tropicanaZ - dir * (STRIP.flamingoHalf + 2.2) - z) * dir, tropicanaPhase(t).ns);
    for (const cw of CROSSWALKS) consider((cw.z - dir * 4.6 - z) * dir, crosswalkPhase(t, cw.offset));
  } else if (Math.abs(fx) > 0.97) {
    const dir = fx > 0 ? 1 : -1;
    for (const zc of [0, STRIP.tropicanaZ]) {
      if (Math.abs(z - zc) > STRIP.flamingoHalf) continue;
      consider((-dir * (STRIP.curb + 2.2) - x) * dir, (zc === 0 ? flamingoPhase(t) : tropicanaPhase(t)).ew);
    }
  }
  return best;
}

// ---------------------------------------------------------------- the fleet
interface Driver {
  name: string;
  rating: string;
  car: string;
  lines: string[];
}
const DRIVERS: Driver[] = [
  {
    name: 'Gary',
    rating: '4.91',
    car: 'white Toyota Camry',
    lines: [
      'First time in Vegas? I’m actually a magician. Pick a card.',
      'No smoking in the car, man. …Okay, crack the window.',
      'I drove Wayne Newton once. Lovely tipper.',
      'This is my side hustle. My main hustle is also driving.',
      'You smell like a casino carpet, little buddy. Respect.',
    ],
  },
  {
    name: 'Marisol',
    rating: '4.97',
    car: 'silver Toyota RAV4',
    lines: [
      'Water’s in the seat pocket, mijo. The bowl’s for my dog.',
      'Avoid the Strip at midnight? Honey, we ARE the Strip at midnight.',
      'Twelve years driving here. I’ve seen an Elvis fight a Elvis.',
      'Five stars and I’ll tell you where the free shrimp is.',
      'Is that a cigarette? You’re a cat. I’m not even mad.',
    ],
  },
  {
    name: 'Big Tony',
    rating: '4.88',
    car: 'black Tesla Model 3',
    lines: [
      'I’m not a cab, I’m a lifestyle.',
      'Scenic route or fast route? Ha. There’s only the Strip.',
      'This baby drives itself, but I don’t trust it. I trust ME.',
      'You win big tonight, you remember Tony.',
      'Don’t touch the screen, it plays smooth jazz and it won’t stop.',
    ],
  },
];
const WAYMO_LINES = [
  'Good evening, Lou. Please fasten your seatbelt (or paws).',
  'Now playing: “Vegas Purr” — Lou’s playlist.',
  'Smoking isn’t permitted in this vehicle. We can smell the tuna.',
  'Need help? Rider Support is one tap away. A real human!',
  'The vehicle is driving. Please keep your tail inside.',
  'Fun fact: this car can see 300 metres in every direction. It saw that, Lou.',
];

interface RCar {
  tc: TrafficCar;
  service: RideService;
  brand: RideBrand;
  model: RideModel;
  desc: string;
  driver: Driver | null;
  lidar: THREE.Mesh | null;
  hazard: THREE.Mesh;
  led: THREE.Mesh | null;
  seat: THREE.Vector3;
  rideable: Rideable;
}

interface Job {
  car: RCar;
  service: RideService;
  pickup: Stop;
  phase: 'arriving' | 'waiting' | 'riding' | 'dropping' | 'leaving';
  path: Path;
  d: number;
  cur: { i: number };
  speed: number;
  waitT: number;
  rider: boolean;
  dest: Dest | null;
  destList: Dest[];
  destI: number;
  fare: number;
  statusT: number;
  lineT: number;
  lineI: number;
  /** Seconds stopped (lights, traffic). */
  stillT: number;
  /** Set once the car is on its pull-out path: it rejoins traffic at the end of it. */
  release: boolean;
  /** The stop was picked with [Tab] (otherwise it follows the camera while the car waits). */
  destManual: boolean;
  /** Seconds left of squeezing past a stuck vehicle. */
  ghostT: number;
}

const UP = new THREE.Vector3(0, 1, 0);

export function installRideshare(h: RideshareHooks): RideshareApi {
  const { world, camera, cat } = h;
  const scene = h.scene;
  /** Cars that dropped a rider (or a cancelled pickup) and are easing back into traffic. */
  const leaving: Job[] = [];
  let lastExitMsg: string | undefined;
  const cars: RCar[] = [];
  let job: Job | null = null;
  let elapsed = 0;
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const pose = { x: 0, z: 0, fx: 0, fz: 1, cap: 0 };

  const emit = (service: RideService, state: RideState, etaSeconds?: number, label?: string) => {
    window.dispatchEvent(new CustomEvent('catsmoke:ride-status', { detail: { kind: service, state, etaSeconds: etaSeconds === undefined ? undefined : Math.max(0, Math.round(etaSeconds)), label } }));
  };
  const heading = (c: RCar) => c.tc.mesh.rotation.y;
  const right = (c: RCar, out: THREE.Vector3) => out.set(-Math.cos(heading(c)), 0, Math.sin(heading(c)));
  const serviceName = (c: RCar) => (c.service === 'waymo' ? 'Waymo' : 'Uber');

  // ---- build the cars and put them in traffic
  const fleet: Array<{ service: RideService; model: RideModel; brand: RideBrand; color: number; desc: string; driver?: number }> = [
    { service: 'waymo', model: 'ojai', brand: 'waymo', color: 0xf2f3f1, desc: 'white Waymo Ojai' },
    { service: 'waymo', model: 'ipace', brand: 'waymo', color: 0xf2f3f1, desc: 'white Jaguar I-PACE Waymo' },
    { service: 'waymo', model: 'ojai', brand: 'waymo', color: 0xf2f3f1, desc: 'white Waymo Ojai' },
    { service: 'uber', model: 'sedan', brand: 'uber', color: 0xe9eaec, desc: 'white Toyota Camry', driver: 0 },
    { service: 'uber', model: 'suv', brand: 'uber', color: 0xa7abb2, desc: 'silver Toyota RAV4', driver: 1 },
    { service: 'uber', model: 'sedan', brand: 'uber', color: 0x16171b, desc: 'black Tesla Model 3', driver: 2 },
    { service: 'uber', model: 'sedan', brand: 'lyft', color: 0x2c4a7a, desc: 'blue Honda Accord (Lyft)', driver: -1 },
  ];
  const looks = [
    { skin: 0xe2ae88, shirt: 0x2e4d7a, hair: 0x3a2a1e },
    { skin: 0xc88c64, shirt: 0xc8324a, hair: 0x1c1512 },
    { skin: 0x9b6342, shirt: 0x222222, hair: 0x111111 },
    { skin: 0xf2c8a8, shirt: 0x6a8f4a, hair: 0xd8b158 },
  ];
  const starts = [-520, 260, 700, -300, 120, -640, 520];
  fleet.forEach((f, i) => {
    const look = f.brand === 'waymo' ? undefined : looks[f.driver === undefined || f.driver < 0 ? 3 : f.driver];
    const built = buildRideshareCar(f.model, f.brand, f.color, look);
    bakeGroup(built.group, (m) => !!m.userData.keep);
    scene.add(built.group);
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const lane = STRIP.laneCenters[1 - (i % 3 === 0 ? 1 : 0)];
    const x = dir === 1 ? -lane : lane;
    built.group.position.set(x, 0, starts[i]);
    built.group.rotation.y = dir === 1 ? 0 : Math.PI;
    // Waymos keep to the speed limit and leave room; rideshare drivers drive like they're on the clock.
    const cruise = f.service === 'waymo' ? 10.5 : 12.5 + (i % 2) * 1.5;
    const tc: TrafficCar = { mesh: built.group, laneX: x, dir, speed: cruise, cruise, halfLen: built.length / 2 + 0.3, axis: 'z' };
    world.trafficVehicles.push(tc);
    const car: RCar = {
      tc,
      service: f.service,
      brand: f.brand,
      model: f.model,
      desc: f.desc,
      driver: f.driver !== undefined && f.driver >= 0 ? DRIVERS[f.driver] : null,
      lidar: built.lidar,
      hazard: built.hazard,
      led: built.led,
      seat: built.seat,
      rideable: null as unknown as Rideable,
    };
    car.rideable = carRideable(car);
    if (f.brand !== 'lyft') world.rideables.push(car.rideable);
    cars.push(car);
  });

  // and a Zoox, the robotaxi that already carries riders on the Strip (traffic only: it isn't on Lou's apps)
  {
    const z = buildZoox();
    bakeGroup(z.group);
    scene.add(z.group);
    const x = STRIP.laneCenters[0];
    z.group.position.set(x, 0, 330);
    z.group.rotation.y = Math.PI;
    world.trafficVehicles.push({ mesh: z.group, laneX: x, dir: -1, speed: 10, cruise: 10, halfLen: z.length / 2 + 0.3, axis: 'z' });
  }

  // ---- hailing
  const lou = () => cat.position;
  const etaOf = (j: Job) => (j.path.len - j.d) / (j.car.tc.cruise * 0.6) + 2;

  function freeCar(service: RideService, near: Stop): { car: RCar; inPlace: boolean } | null {
    const pool = cars.filter((c) => c.service === service && c.brand !== 'lyft' && !c.tc.hijacked && !c.tc.parked);
    if (!pool.length) return null;
    if (near.road === 'strip') {
      // one already coming down this lane, 50–280 m out, just peels off to the curb
      for (const c of pool) {
        const p = c.tc.mesh.position;
        if (c.tc.axis === 'z' && c.tc.dir === near.dir && Math.sign(c.tc.laneX) === -near.dir) {
          const ahead = (near.s - p.z) * near.dir;
          if (ahead > 50 && ahead < 280) return { car: c, inPlace: true };
        }
      }
    }
    // otherwise the one farthest from the camera comes in from out of sight
    pool.sort((a, c) => c.tc.mesh.position.distanceToSquared(camera.position) - a.tc.mesh.position.distanceToSquared(camera.position));
    return { car: pool[0], inPlace: false };
  }

  function approachPath(c: RCar, st: Stop, inPlace: boolean): Path {
    const p = new Path();
    if (st.road === 'strip') {
      if (inPlace) {
        const off = Math.abs(c.tc.mesh.position.x);
        p.start(c.tc.mesh.position.x, c.tc.mesh.position.z);
        pullIn(p, st, off);
      } else {
        const s0 = THREE.MathUtils.clamp(st.s - st.dir * 150, STRIP.north + 12, STRIP.south - 12);
        p.start(...lanePt('strip', 0, st.dir, s0, DRIVE));
        pullIn(p, st);
      }
    } else {
      const sp = st.spot!;
      const s0 = THREE.MathUtils.clamp(st.s - st.dir * 120, sp.x0, sp.x1);
      p.start(...lanePt('cross', st.zc, st.dir, s0, st.driveOff));
      pullIn(p, st);
    }
    return p;
  }

  /** Pickup for a phone hail: a zone within 140 m, else the Boulevard curb beside Lou, else a zone within 320 m. */
  function phoneStop(service: RideService): Stop | null {
    const p = lou();
    let best: RideshareSpot | null = null;
    let bestD = Infinity;
    for (const sp of RIDESHARE_SPOTS) {
      const d = spotSign(sp, service, tmp).distanceTo(tmp2.set(p.x, 0, p.z));
      if (d < bestD) {
        bestD = d;
        best = sp;
      }
    }
    if (best && bestD < 140) return spotStop(best, service);
    if (Math.abs(p.x) < 60 && p.z > STRIP.north + 40 && p.z < STRIP.south - 40) {
      const dir: 1 | -1 = p.x < 0 ? 1 : -1;
      let s = THREE.MathUtils.clamp(p.z, STRIP.north + 70, STRIP.south - 70);
      for (const zc of [0, STRIP.tropicanaZ]) if (Math.abs(s - zc) < 32) s = zc + (s < zc ? -32 : 32);
      for (const cw of CROSSWALKS) if (Math.abs(s - cw.z) < 9) s = cw.z + (s < cw.z ? -9 : 9);
      return { name: 'the curb by you', road: 'strip', zc: 0, dir, s, driveOff: DRIVE, curbOff: CURB };
    }
    if (best && bestD < 320) return spotStop(best, service);
    return null;
  }

  function hail(service: RideService, from: 'phone' | 'sign', spot?: RideshareSpot): string {
    const name = service === 'waymo' ? 'Waymo' : 'Uber';
    if (job && job.phase !== 'leaving') {
      if (job.rider) {
        emit(service, 'unavailable', undefined, 'You’re already on a ride');
        return 'Lou is already on a ride.';
      }
      if (job.service === service) {
        reportJob();
        return job.phase === 'waiting' ? `Your ${name} is here — hop in the back with [G].` : `Your ${name} is on the way — about ${Math.round(etaOf(job))} s.`;
      }
      // a sign never cancels the other service's car by accident; the phone can switch
      if (from === 'sign') {
        const other = job.service === 'waymo' ? 'Waymo' : 'Uber';
        return job.phase === 'waiting' ? `Your ${other} is already at the curb — one ride at a time.` : `Your ${other} is on its way (~${Math.round(etaOf(job))} s) — one ride at a time.`;
      }
      cancel('Switched rides');
    }
    const p = lou();
    if (INDOOR_ZONE.test(world.getZoneName(p.x, p.z))) {
      emit(service, 'unavailable', undefined, 'No roads in here — head outside');
      return 'No cars come in here. Head outside to the street.';
    }
    if (p.y > 3.5) {
      emit(service, 'unavailable', undefined, 'Head down to the street');
      return 'Head down to street level first.';
    }
    const st = spot ? spotStop(spot, service) : phoneStop(service);
    if (!st) {
      emit(service, 'unavailable', undefined, 'No pickup spot nearby');
      return 'No pickup spot near here. Walk out to the Strip.';
    }
    const pick = freeCar(service, st);
    if (!pick) {
      emit(service, 'unavailable', undefined, `No ${name}s free right now`);
      return `No ${name}s free right now.`;
    }
    const c = pick.car;
    const path = approachPath(c, st, pick.inPlace).finish(service === 'waymo' ? 2.2 : 3.4, service === 'waymo' ? 2.4 : 3.4);
    c.tc.hijacked = true;
    if (!pick.inPlace) {
      c.tc.mesh.position.set(path.x[0], 0, path.z[0]);
      c.tc.speed = c.tc.cruise * 0.8;
    }
    job = { car: c, service, pickup: st, phase: 'arriving', path, d: 0, cur: { i: 0 }, speed: pick.inPlace ? c.tc.speed : c.tc.cruise * 0.8, waitT: 0, rider: false, dest: null, destList: [], destI: 0, fare: 0, statusT: 0, lineT: 0, lineI: 0, stillT: 0, release: false, destManual: false, ghostT: 0 };
    if (c.led) c.led.visible = true;
    const where = st.spot ? st.spot.name : st.name;
    const who = c.driver ? `${c.driver.name} (${c.driver.rating}★) in a ${c.desc}` : `a ${c.desc}, nobody driving`;
    emit(service, 'requested', etaOf(job), `${name}: ${who} → pickup at ${where}`);
    if (from === 'phone') h.toast(`${name} on the way: ${who}. Meet it at ${where} (~${Math.round(etaOf(job))} s).`, 4200);
    return `${name} requested: ${who}. Arriving in ~${Math.round(etaOf(job))} s — wait by the sign.`;
  }

  window.addEventListener('catsmoke:hail', (e) => {
    const kind = (e as CustomEvent<{ kind?: string }>).detail?.kind;
    hail(kind === 'uber' ? 'uber' : 'waymo', 'phone');
  });

  function cancel(why: string): void {
    if (!job) return;
    emit(job.service, 'cancelled', undefined, why);
    leave(job);
  }

  /** Hand the job's car to the leaving list: it finishes the path it's on, pulls out and rejoins traffic. */
  function leave(j: Job, flashFor = 0): void {
    j.rider = false;
    j.phase = 'leaving';
    j.release = false;
    j.waitT = -flashFor;
    if (j.car.led) j.car.led.visible = false;
    if (!flashFor) j.car.hazard.visible = false;
    if (job === j) job = null;
    leaving.push(j);
  }

  function startPullOut(j: Job): void {
    const p = j.car.tc.mesh.position;
    const st = j.dest ? destStop(j.dest) : j.pickup;
    const path = new Path();
    const [fx, fz] = st.road === 'strip' ? [0, st.dir] : [st.dir, 0];
    path.start(p.x, p.z);
    const along = st.road === 'strip' ? p.z : p.x;
    const [bx, bz] = lanePt(st.road, st.zc, st.dir, along + st.dir * 16, st.driveOff);
    path.curve(fx, fz, bx, bz, fx, fz);
    path.line(...lanePt(st.road, st.zc, st.dir, along + st.dir * 24, st.driveOff));
    path.finish(3, 3);
    path.cap.fill(j.car.tc.cruise);
    j.path = path;
    j.d = 0;
    j.cur.i = 0;
    j.release = true;
    j.car.hazard.visible = false;
    if (j.car.led) j.car.led.visible = false;
  }

  /** Back into the Strip's traffic loop, on the exact lane line it queues on. */
  function rejoin(j: Job): void {
    const c = j.car;
    const p = c.tc.mesh.position;
    if (Math.abs(p.x) < STRIP.curb) {
      const dir: 1 | -1 = Math.abs(c.tc.mesh.rotation.y) < Math.PI / 2 ? 1 : -1;
      c.tc.axis = 'z';
      c.tc.dir = dir;
      c.tc.laneX = dir === 1 ? -DRIVE : DRIVE;
      p.x = c.tc.laneX;
      c.tc.mesh.rotation.set(0, dir === 1 ? 0 : Math.PI, 0);
    } else {
      const zc = Math.abs(p.z) < Math.abs(p.z - STRIP.tropicanaZ) ? 0 : STRIP.tropicanaZ;
      const dir: 1 | -1 = Math.sin(c.tc.mesh.rotation.y) > 0 ? 1 : -1;
      if (Math.abs(p.z - zc) < STRIP.flamingoHalf + 2) {
        c.tc.axis = 'x';
        c.tc.dir = dir;
        c.tc.laneX = zc + (dir === 1 ? DRIVE : -DRIVE);
        p.z = c.tc.laneX;
        c.tc.mesh.rotation.set(0, dir === 1 ? Math.PI / 2 : -Math.PI / 2, 0);
      } else {
        // a side-street stub has no traffic loop: put it back on the Boulevard out of sight
        c.tc.axis = 'z';
        c.tc.dir = 1;
        c.tc.laneX = -DRIVE;
        const z = THREE.MathUtils.clamp(lou().z - 200, STRIP.north + 10, STRIP.south - 10);
        p.set(-DRIVE, 0, z);
        c.tc.mesh.rotation.set(0, 0, 0);
      }
    }
    c.tc.speed = c.tc.cruise * 0.6;
    c.tc.hijacked = false;
    c.hazard.visible = false;
    if (c.led) c.led.visible = false;
    const k = leaving.indexOf(j);
    if (k >= 0) leaving.splice(k, 1);
    if (job === j) job = null;
  }

  // ---- driving a job
  const others: Array<{ p: THREE.Vector3; half: number }> = [];
  function drive(j: Job, dt: number): void {
    const c = j.car;
    const waymo = c.service === 'waymo';
    const at = j.path;
    at.sample(j.d, j.cur, pose);
    let target = Math.min(c.tc.cruise, pose.cap);
    // lights
    const light = lightAhead(pose.x, pose.z, pose.fx, pose.fz);
    if (light < 30) target = Math.min(target, Math.max(0, (light - c.tc.halfLen) * (waymo ? 0.7 : 0.9)));
    // vehicles (and Lou) in a corridor ahead
    const gap0 = waymo ? 4.5 : 3;
    others.length = 0;
    if (j.ghostT <= 0) for (const o of world.trafficVehicles) if (o !== c.tc) others.push({ p: o.mesh.position, half: o.halfLen });
    if (j.ghostT <= 0) for (const b of world.deuceBuses) others.push({ p: b.mesh.position, half: b.halfLen });
    j.ghostT -= dt;
    let blocked = false;
    for (const o of others) {
      const dx = o.p.x - pose.x;
      const dz = o.p.z - pose.z;
      const f = dx * pose.fx + dz * pose.fz;
      if (f <= 0 || f > 32) continue;
      const lat = Math.abs(dx * pose.fz - dz * pose.fx);
      if (lat > 1.9) continue;
      const gap = f - o.half - c.tc.halfLen;
      const lim = Math.max(0, (gap - gap0) * 1.1);
      if (lim < 0.3) blocked = true;
      target = Math.min(target, lim);
    }
    if (!j.rider && j.phase !== 'leaving') {
      const lp = lou();
      const dx = lp.x - pose.x;
      const dz = lp.z - pose.z;
      const f = dx * pose.fx + dz * pose.fz;
      if (f > 0 && f < 11 && Math.abs(dx * pose.fz - dz * pose.fx) < 1.5 && lp.y < 1.5) {
        target = Math.min(target, Math.max(0, (f - c.tc.halfLen - 1.2) * 1.2));
      }
    }
    const accel = waymo ? 1.8 : 3.0;
    const brake = waymo ? 3.0 : 4.2;
    j.speed = target > j.speed ? Math.min(target, j.speed + accel * dt) : Math.max(target, j.speed - brake * 1.6 * dt);
    if (j.d >= at.len - 0.4 && pose.cap < 0.5) j.speed = Math.min(j.speed, Math.max(0.4, (at.len - j.d) * 2));
    j.d = Math.min(at.len, j.d + j.speed * dt);
    j.stillT = j.speed < 0.2 ? j.stillT + dt : 0;
    // wedged behind something that won't move (a car Lou abandoned in the lane): ease past it
    if (blocked && j.stillT > 14 && light === Infinity) j.ghostT = 4;
    at.sample(j.d, j.cur, pose);
    const m = c.tc.mesh;
    m.position.set(pose.x, 0, pose.z);
    const yaw = Math.atan2(pose.fx, pose.fz);
    m.rotation.set(0, yaw, 0);
    c.tc.speed = j.speed;
    // let the traffic queue behind it on a lane line; at a Boulevard curb the Deuce waits behind it
    if (Math.abs(pose.fz) > 0.999 && Math.abs(Math.abs(pose.x) - DRIVE) < 0.03 && Math.abs(pose.x) < STRIP.curb) {
      c.tc.axis = 'z';
      c.tc.dir = pose.fz > 0 ? 1 : -1;
      c.tc.laneX = c.tc.dir === 1 ? -DRIVE : DRIVE;
    } else if (Math.abs(pose.fz) > 0.999 && Math.abs(pose.x) > STRIP.laneCenters[2] - 0.6 && Math.abs(pose.x) < STRIP.curb) {
      c.tc.axis = 'z';
      c.tc.dir = pose.fz > 0 ? 1 : -1;
      c.tc.laneX = c.tc.dir === 1 ? -STRIP.laneCenters[2] : STRIP.laneCenters[2];
    } else if (Math.abs(pose.fx) > 0.999 && (Math.abs(pose.z - DRIVE) < 0.03 || Math.abs(pose.z + DRIVE) < 0.03 || Math.abs(pose.z - STRIP.tropicanaZ - DRIVE) < 0.03 || Math.abs(pose.z - STRIP.tropicanaZ + DRIVE) < 0.03)) {
      c.tc.axis = 'x';
      c.tc.dir = pose.fx > 0 ? 1 : -1;
      const zc = Math.abs(pose.z) < 20 ? 0 : STRIP.tropicanaZ;
      c.tc.laneX = zc + (c.tc.dir === 1 ? DRIVE : -DRIVE);
    } else c.tc.laneX = NaN;
  }

  function startRide(): void {
    if (!job) return;
    const j = job;
    if (!j.destList.length) chooseDests(j);
    let dest: Dest | null = null;
    let path: Path | null = null;
    for (let k = 0; k < j.destList.length && !path; k++) {
      dest = j.destList[(j.destI + k) % j.destList.length];
      path = ridePath(j.pickup, destStop(dest));
    }
    if (!path || !dest) {
      dest = DESTS.find((d) => (path = ridePath(j.pickup, destStop(d)))) ?? DESTS[0];
    }
    if (!path) return;
    path.finish(j.service === 'waymo' ? 2.2 : 3.4, j.service === 'waymo' ? 2.4 : 3.4);
    j.path = path;
    j.d = 0;
    j.cur.i = 0;
    j.dest = dest;
    j.rider = true;
    j.phase = 'riding';
    j.car.hazard.visible = false;
    j.lineT = 0;
    j.lineI = 0;
    j.fare = j.service === 'uber' ? Math.round((3.25 + path.len * 0.011) * 4) / 4 : 0;
    emit(j.service, 'riding', etaOf(j), `→ ${dest.name}`);
  }

  function endRide(): void {
    if (!job || !job.rider) return;
    const j = job;
    const arrived = j.phase === 'dropping';
    const left = Math.max(0, j.path.len - j.d);
    let label: string;
    if (j.service === 'uber') {
      const fare = arrived ? j.fare : Math.max(4, Math.round(j.fare * (1 - left / Math.max(1, j.path.len)) * 4) / 4);
      const paid = h.pay(fare);
      if (paid > 0) SoundFX.current?.playCash();
      const d = j.car.driver;
      label = paid >= fare - 0.001 ? `$${fare.toFixed(2)} paid. ${d?.name ?? 'Your driver'} rated Lou ★★★★★` : `Lou paid $${paid.toFixed(2)} of $${fare.toFixed(2)} and a hairball. ${d?.name ?? 'Your driver'} rated Lou ★★★`;
      lastExitMsg = arrived ? `${d?.name ?? 'Uber'}: “Here we are, ${j.dest!.name}!” ${label}.` : `Lou bailed out early. ${label}.`;
    } else {
      label = 'Free — rides are on Waymo tonight';
      lastExitMsg = arrived ? `Rider screen: “You’ve arrived at ${j.dest!.name}. Don’t forget your cigarettes.”` : 'Rider screen: “Ending your ride here. Mind the traffic, Lou.”';
    }
    emit(j.service, 'done', 0, arrived ? `${j.dest!.name} · ${label}` : `Hopped out early · ${label}`);
    // at the stop: flashers a moment longer, then pull away (an early hop-out carries on to the stop first)
    leave(j, arrived ? 2.5 : 0);
  }

  function reportJob(): void {
    if (!job) return;
    const j = job;
    if (j.phase === 'arriving') emit(j.service, 'arriving', etaOf(j), j.pickup.spot ? j.pickup.spot.name : 'Pulling up by you');
    else if (j.phase === 'waiting') emit(j.service, 'arrived', 0, j.car.driver ? `${j.car.driver.name} is waiting in the ${j.car.desc}` : 'Your Waymo is here (the dome says LOU)');
    else if (j.phase === 'riding') emit(j.service, 'riding', etaOf(j), `→ ${j.dest?.name ?? ''}`);
  }

  /** Destinations from here: the stop the camera faces first (nearest within 30°), then the rest by distance. */
  function chooseDests(j: Job): void {
    const p = lou();
    camera.getWorldDirection(tmp);
    const fx = tmp.x;
    const fz = tmp.z;
    const fl = Math.hypot(fx, fz) || 1;
    const list = DESTS.filter((d) => Math.abs(d.z - p.z) > 140).map((d) => {
      const dx = d.side * CURB - p.x;
      const dz = d.z - p.z;
      const dist = Math.hypot(dx, dz);
      const ang = Math.acos(THREE.MathUtils.clamp((dx * fx + dz * fz) / (dist * fl), -1, 1));
      return { d, dist, ang };
    });
    list.sort((a, c) => a.dist - c.dist);
    const cone = list.filter((e) => e.ang < 0.52);
    const first = cone.length ? cone[0] : list.slice().sort((a, c) => a.ang - c.ang)[0];
    j.destList = list.map((e) => e.d);
    j.destI = first ? j.destList.indexOf(first.d) : 0;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Tab' || !job || job.phase !== 'waiting' || job.rider) return;
    if (job.car.tc.mesh.position.distanceTo(lou()) > 8) return;
    e.preventDefault();
    if (!job.destList.length) chooseDests(job);
    job.destI = (job.destI + 1) % job.destList.length;
    job.destManual = true;
  });

  // ---- rideables
  function carRideable(c: RCar): Rideable {
    const mine = () => job !== null && job.car === c;
    const name = serviceName(c);
    return {
      id: `rideshare-${c.service}-${cars.length}`,
      kind: 'rideshare',
      get label() {
        return c.driver ? `${c.driver.name}’s Uber` : 'your Waymo';
      },
      get boardRadius() {
        return mine() && job!.phase === 'waiting' ? 6 : 0;
      },
      boardPoint(out) {
        right(c, out).multiplyScalar(1.3).add(c.tc.mesh.position);
        out.addScaledVector(tmp2.set(Math.sin(heading(c)), 0, Math.cos(heading(c))), -0.7);
        // the car you're standing next to wins over the pickup sign beside it
        if (out.distanceTo(lou()) < 6) out.copy(lou());
        return out;
      },
      seat: (out) => out.copy(c.seat).applyAxisAngle(UP, heading(c)).add(c.tc.mesh.position),
      yaw: () => heading(c),
      exitPoint(out) {
        right(c, out).multiplyScalar(2.6).add(c.tc.mesh.position);
        out.y = 0.3;
        return out;
      },
      canBoard: () => (mine() && job!.phase === 'waiting' ? { ok: true } : { ok: false, reason: `That ${name} isn’t yours.` }),
      onBoard: () => startRide(),
      onExit: () => endRide(),
      exitMessage: () => lastExitMsg,
      wantsExit: () => mine() && job!.phase === 'dropping' && job!.stillT > 0.5,
      get boardPrompt() {
        if (!mine()) return '';
        if (!job!.destList.length) chooseDests(job!);
        const to = job!.destList[job!.destI]?.name ?? 'the Strip';
        return `Press [G] to hop in the back of ${c.driver ? `${c.driver.name}’s ${c.desc}` : 'your Waymo'} → ${to}  ·  [Tab] next stop`;
      },
      get ridingPrompt() {
        return c.driver ? `Riding with ${c.driver.name} (${c.driver.rating}★) — [G] hop out` : 'Riding in a Waymo, nobody at the wheel — [G] hop out';
      },
      status() {
        if (!mine()) return '';
        const j = job!;
        const eta = Math.max(1, Math.round(etaOf(j)));
        const to = j.dest?.name ?? '';
        if (j.phase === 'dropping') return c.driver ? `${c.driver.name}: “${to}! Watch the door, the traffic’s nuts.”` : `Rider screen: “You’ve arrived at ${to}.”`;
        const lines = c.driver ? c.driver.lines : WAYMO_LINES;
        const line = lines[j.lineI % lines.length];
        if (c.driver) return j.stillT > 2 ? `${c.driver.name}: “This light takes forever, I swear.” · ${to} in ${eta} s` : `${c.driver.name}: “${line}” · ${to} in ${eta} s`;
        return j.stillT > 2 ? `Rider screen: “Waiting for the light. Patience is a virtue.” · ${to} in ${eta} s` : `Rider screen: “${line}” · ${to} in ${eta} s`;
      },
      view(): RideView {
        // the curb side, a little behind: the car, the dome and Lou in the back window
        const hd = heading(c);
        const rx = -Math.cos(hd);
        const rz = Math.sin(hd);
        const bx = -Math.sin(hd);
        const bz = -Math.cos(hd);
        const dx = rx * 0.82 + bx * 0.58;
        const dz = rz * 0.82 + bz * 0.58;
        return { yaw: Math.atan2(dx, dz), pitch: 0.16, dist: 4.6, free: true, fov: 54 };
      },
    } satisfies Rideable;
  }

  for (const sp of RIDESHARE_SPOTS) {
    for (const service of ['uber', 'waymo'] as const) {
      const at = spotSign(sp, service);
      const name = service === 'waymo' ? 'Waymo' : 'Uber';
      world.rideables.push({
        id: `rideshare-pickup-${sp.id}-${service}`,
        kind: 'rideshare',
        label: `${name} pickup`,
        boardRadius: 2.8,
        boardPoint: (out) => out.copy(at),
        seat: (out) => out.copy(at),
        yaw: () => 0,
        exitPoint: (out) => out.copy(at).setY(0.3),
        canBoard: () => ({ ok: false, reason: hail(service, 'sign', sp) }),
        get boardPrompt() {
          if (job && job.service === service && !job.rider && job.phase === 'arriving') return `${name} on the way — about ${Math.round(etaOf(job))} s. Wait here.`;
          if (job && job.service === service && !job.rider && job.phase === 'waiting') return `Your ${name} is at the curb — walk up to the back door.`;
          if (job && job.service !== service && !job.rider) return `Your ${job.service === 'waymo' ? 'Waymo' : 'Uber'} is ${job.phase === 'waiting' ? 'at the curb' : 'on its way'} — one ride at a time`;
          return service === 'waymo' ? `Waymo pickup — press [G] to hail a driverless Waymo` : `RIDESHARE PICKUP (${sp.name.split(' · ')[0]}) — press [G] to hail an Uber`;
        },
        ridingPrompt: '',
      } satisfies Rideable);
    }
  }

  // ---- postcard shortcuts (dev / check builds only): [G] on these spots skips the wait
  if (h.dev) {
    // route probe for tests: every pickup zone to every stop
    (window as unknown as { __rideshare: unknown }).__rideshare = {
      routes: () =>
        RIDESHARE_SPOTS.flatMap((sp) =>
          (['waymo', 'uber'] as const).flatMap((sv) =>
            DESTS.map((d) => {
              const p = ridePath(spotStop(sp, sv), destStop(d));
              return { from: sp.id, sv, to: d.name, len: p ? Math.round(p.len) : null };
            }),
          ),
        ),
      job: () => (job ? { phase: job.phase, service: job.service, d: job.d, len: job.path.len, dest: job.dest?.name ?? null } : null),
      leaving: () => leaving.length,
    };
    const rideAt = new THREE.Vector3(-12.6, 0.3, -40);
    world.rideables.push({
      id: 'rideshare-demo-ride',
      kind: 'rideshare',
      label: 'your Waymo',
      get boardRadius() {
        return job?.rider ? 0 : 1.5;
      },
      boardPoint: (out) => out.copy(rideAt),
      seat: (out) => (job ? job.car.rideable.seat(out) : out.copy(rideAt)),
      yaw: () => (job ? job.car.rideable.yaw() : 0),
      exitPoint: (out) => (job ? job.car.rideable.exitPoint(out) : out.copy(rideAt)),
      canBoard: () => {
        // a Waymo Ojai already waiting at the curb here, bound for The Cosmopolitan
        if (job) cancel('Demo');
        for (const l of [...leaving]) rejoin(l);
        const c = cars.find((k) => k.service === 'waymo' && k.model === 'ojai' && !k.tc.parked);
        if (!c) return { ok: false, reason: 'no Waymo' };
        const st: Stop = { name: 'demo', road: 'strip', zc: 0, dir: 1, s: rideAt.z, driveOff: DRIVE, curbOff: CURB };
        const p = new Path().start(-CURB, rideAt.z - 1).line(-CURB, rideAt.z).finish(2, 2);
        c.tc.hijacked = true;
        c.tc.mesh.position.set(-CURB, 0, rideAt.z);
        c.tc.mesh.rotation.set(0, 0, 0);
        job = { car: c, service: 'waymo', pickup: st, phase: 'waiting', path: p, d: p.len, cur: { i: 0 }, speed: 0, waitT: 0, rider: false, dest: null, destList: DESTS.filter((d) => d.name === 'The Cosmopolitan'), destI: 0, fare: 0, statusT: 0, lineT: 0, lineI: 0, stillT: 0, release: false, destManual: true, ghostT: 0 };
        if (c.led) c.led.visible = true;
        return { ok: true };
      },
      onBoard: () => startRide(),
      onExit: () => endRide(),
      exitMessage: () => lastExitMsg,
      wantsExit: () => job?.car.rideable.wantsExit?.() ?? false,
      boardPrompt: '[dev] postcard: ride in a Waymo',
      ridingPrompt: 'Riding in a Waymo, nobody at the wheel — [G] hop out',
      status: () => job?.car.rideable.status?.() ?? '',
      view: () => job?.car.rideable.view?.() ?? null,
    } satisfies Rideable);
    // a Waymo waiting at the Bellagio pickup on Flamingo Rd, flashers on (it leaves again after half a minute)
    const pickAt = new THREE.Vector3(-66, 0.3, 12.6);
    world.rideables.push({
      id: 'rideshare-demo-pickup',
      kind: 'rideshare',
      label: 'demo',
      boardRadius: 1.5,
      boardPoint: (out) => out.copy(pickAt),
      seat: (out) => out.copy(pickAt),
      yaw: () => 0,
      exitPoint: (out) => out.copy(pickAt),
      canBoard: () => {
        const sp = RIDESHARE_SPOTS.find((s) => s.id === 'bellagio')!;
        const c = cars.find((k) => k.service === 'waymo' && k.model === 'ojai' && !k.tc.hijacked && !k.tc.parked);
        if (c && !leaving.some((l) => l.car === c)) {
          const st = spotStop(sp, 'waymo');
          const [x, z] = lanePt('cross', st.zc, st.dir, st.s, st.curbOff);
          const p = new Path().start(x - 1, z).line(x, z).finish(2, 2);
          c.tc.hijacked = true;
          c.tc.laneX = NaN;
          c.tc.mesh.position.set(x, 0, z);
          c.tc.mesh.rotation.set(0, Math.PI / 2, 0);
          const j: Job = { car: c, service: 'waymo', pickup: st, phase: 'waiting', path: p, d: p.len, cur: { i: 0 }, speed: 0, waitT: 0, rider: false, dest: null, destList: [], destI: 0, fare: 0, statusT: 0, lineT: 0, lineI: 0, stillT: 0, release: false, destManual: false, ghostT: 0 };
          leave(j, 30);
          if (c.led) c.led.visible = true;
        }
        return { ok: false, reason: '[dev] a Waymo waits at the pickup' };
      },
      boardPrompt: '[dev] postcard: a Waymo at the pickup',
      ridingPrompt: '',
    } satisfies Rideable);
    // a Waymo in traffic: [G] here sends the I-PACE down the southbound lane past the fountains
    const stageAt = new THREE.Vector3(-13.2, 0.3, 80);
    world.rideables.push({
      id: 'rideshare-demo-traffic',
      kind: 'rideshare',
      label: 'demo',
      boardRadius: 1.5,
      boardPoint: (out) => out.copy(stageAt),
      seat: (out) => out.copy(stageAt),
      yaw: () => 0,
      exitPoint: (out) => out.copy(stageAt),
      canBoard: () => {
        const c = cars.find((k) => k.service === 'waymo' && k.model === 'ipace' && !k.tc.hijacked && !k.tc.parked);
        if (c) {
          c.tc.axis = 'z';
          c.tc.dir = 1;
          c.tc.laneX = -DRIVE;
          c.tc.mesh.position.set(-DRIVE, 0, stageAt.z - 27);
          c.tc.mesh.rotation.set(0, 0, 0);
          c.tc.speed = c.tc.cruise;
          for (const o of world.trafficVehicles) if (o !== c.tc && o.axis === 'z' && o.laneX === -DRIVE && Math.abs(o.mesh.position.z - stageAt.z) < 60) o.mesh.position.z -= 120;
        }
        return { ok: false, reason: '[dev] a Waymo comes down the lane' };
      },
      boardPrompt: '[dev] postcard: a Waymo in traffic',
      ridingPrompt: '',
    } satisfies Rideable);
  }

  // ---- per frame
  function update(dt: number): void {
    elapsed += dt;
    const camPos = camera.position;
    for (const c of cars) {
      if (c.lidar && c.tc.mesh.visible && c.tc.mesh.position.distanceToSquared(camPos) < 140 * 140) c.lidar.rotation.y += dt * 11;
    }
    const blink = elapsed % 0.9 < 0.5;
    for (const l of [...leaving]) {
      if (l.waitT < 0) {
        l.waitT += dt;
        l.car.hazard.visible = blink;
        l.car.tc.speed = 0;
        if (l.waitT >= 0) startPullOut(l);
        continue;
      }
      drive(l, dt);
      if (l.d >= l.path.len - 0.02) {
        if (l.release) rejoin(l);
        else startPullOut(l);
      }
    }
    if (!job) return;
    const j = job;
    const c = j.car;
    if (c.tc.parked) {
      emit(j.service, 'cancelled', undefined, 'Your car got… borrowed');
      leave(j);
      return;
    }
    if (j.phase === 'arriving') {
      drive(j, dt);
      if (j.d >= j.path.len - 0.02 && j.speed < 0.45) {
        j.phase = 'waiting';
        j.speed = 0;
        j.waitT = 0;
        chooseDests(j);
        reportJob();
        const where = j.pickup.spot ? ` at ${j.pickup.spot.name.split(' · ')[0]}` : '';
        if (c.driver && lou().distanceTo(c.tc.mesh.position) < 60) SoundFX.current?.playHonk(); // the driver lets you know
        h.toast(c.driver ? `${c.driver.name} pulled up${where} — hop in the back with [G].` : `Your Waymo pulled up${where} (the dome says LOU) — hop in the back with [G].`, 3600);
      } else if (lou().distanceTo(c.tc.mesh.position) > 330) cancel('Lou wandered off');
    } else if (j.phase === 'waiting') {
      j.waitT += dt;
      c.hazard.visible = blink;
      c.tc.speed = 0;
      if (!j.destManual && Math.floor(j.waitT * 4) !== Math.floor((j.waitT - dt) * 4)) chooseDests(j);
      const limit = j.pickup.road === 'strip' ? 50 : 80;
      if (j.waitT > limit) {
        h.toast(c.driver ? `${c.driver.name} gave up waiting. No-show!` : 'Your Waymo left — you were a no-show.');
        cancel('No-show: the car left');
        return;
      }
      if (lou().distanceTo(c.tc.mesh.position) > 160) {
        cancel('Lou wandered off');
        return;
      }
    } else if (j.phase === 'riding') {
      drive(j, dt);
      j.lineT += dt;
      if (j.lineT > 6) {
        j.lineT = 0;
        j.lineI++;
      }
      if (j.d >= j.path.len - 0.02 && j.speed < 0.45) {
        j.phase = 'dropping';
        j.speed = 0;
        j.stillT = 0;
      }
    } else if (j.phase === 'dropping') {
      j.stillT += dt;
      c.hazard.visible = blink;
      c.tc.speed = 0;
    }
    j.statusT += dt;
    if (job === j && j.statusT > (j.phase === 'riding' ? 2 : 1)) {
      j.statusT = 0;
      reportJob();
    }
  }

  return { update };
}
