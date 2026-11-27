import * as THREE from 'three';
import type { PlatformBox } from './world/builder';
import { STRIP, TrafficCar } from './world/strip';

export interface DriveInput {
  throttle: number; // -1..1
  steer: number; // -1..1 (positive = left)
  handbrake: boolean;
}

/** How far up a car climbs in one step (ramps are sampled per metre; kerbs and planters stay walls). */
const STEP_UP = 0.85;
/** Ramp slabs: the nose meets the next step before the wheels do, so a ramp only blocks when it's clearly a wall. */
const RAMP_UP = 1.75;
/** The drivable world: the Strip's ground plus the west bay out to Valley View (Dean Martin Dr, I-15, the bridges). */
const DRIVE_WEST = -307;

/** Arcade GTA-style driving for a hijacked traffic car. */
export class PlayerDriving {
  car: TrafficCar | null = null;
  speed = 0;
  heading = 0;
  private readonly abandoned: Array<{ car: TrafficCar; t: number }> = [];
  private readonly fwd = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  /** Vertical speed (falling off a ledge); the car otherwise rides the ground, ramps and bridge decks. */
  private vy = 0;

  /** Highest drivable surface under (x, z) that the car can climb onto from height y. */
  private groundAt(x: number, z: number, y: number, colliders: PlatformBox[]): number {
    let g = 0;
    for (const b of colliders) {
      if (b.isWall || b.topY > y + (b.ramp ? RAMP_UP : STEP_UP) || b.topY <= g) continue;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      g = b.topY;
    }
    return g;
  }

  get active(): boolean {
    return !!this.car;
  }

  /** Nearest traffic car the cat can jack (stopped or slow, within reach). */
  nearestCar(cars: TrafficCar[], pos: THREE.Vector3): TrafficCar | null {
    let best: TrafficCar | null = null;
    let bestD = 3.4;
    for (const c of cars) {
      if (c.hijacked) continue;
      const d = c.mesh.position.distanceTo(pos);
      if (d < bestD + c.halfLen * 0.4 && c.speed < 7) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  enter(car: TrafficCar): void {
    this.car = car;
    car.hijacked = true;
    car.parked = false;
    car.homeLane ??= car.laneX;
    car.laneX = NaN; // traffic no longer queues behind it
    this.heading = car.mesh.rotation.y;
    this.speed = car.speed * 0.5;
    const i = this.abandoned.findIndex((a) => a.car === car);
    if (i >= 0) this.abandoned.splice(i, 1);
  }

  /** Leave the car where it is; returns where the cat hops out (driver's side). */
  exit(out: THREE.Vector3): THREE.Vector3 {
    const car = this.car!;
    car.hijacked = false;
    car.parked = true;
    car.speed = 0;
    this.abandoned.push({ car, t: 0 });
    const side = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    out.copy(car.mesh.position).addScaledVector(side, 1.8);
    out.y = car.mesh.position.y + 0.3;
    car.mesh.rotation.x = 0;
    this.vy = 0;
    this.car = null;
    this.speed = 0;
    return out;
  }

  /** Seat position + yaw for the cat while driving. */
  seat(out: THREE.Vector3): THREE.Vector3 {
    const car = this.car!;
    const local = new THREE.Vector3(0.42, 0.62, 0.25).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.heading);
    return out.copy(car.mesh.position).add(local);
  }

  /**
   * Drive one step. Returns impacts so the game can score them / raise the wanted level.
   */
  update(dt: number, input: DriveInput, colliders: PlatformBox[], others: TrafficCar[]): { crashed: boolean } {
    const car = this.car!;
    const kind = car.halfLen > 3.6 ? 'limo' : car.halfLen < 2.5 ? 'sport' : 'car';
    const maxF = kind === 'sport' ? 40 : kind === 'limo' ? 25 : 31;
    const accel = kind === 'sport' ? 18 : 13;
    if (input.throttle > 0) {
      this.speed += (this.speed < 0 ? 28 : accel) * input.throttle * dt;
    } else if (input.throttle < 0) {
      this.speed += (this.speed > 0 ? -26 : -9) * -input.throttle * dt;
    } else {
      this.speed *= Math.max(0, 1 - dt * 0.7);
    }
    if (input.handbrake) this.speed *= Math.max(0, 1 - dt * 2.5);
    this.speed = THREE.MathUtils.clamp(this.speed, -9, maxF);
    const grip = input.handbrake ? 2.6 : 1.7;
    const steerRate = input.steer * grip * THREE.MathUtils.clamp(this.speed / 6, -1, 1) * (1 - Math.min(0.55, Math.abs(this.speed) / 70));
    this.heading += steerRate * dt;

    this.fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.velocity.copy(this.fwd).multiplyScalar(this.speed);
    const p = car.mesh.position;
    p.addScaledVector(this.velocity, dt);
    car.speed = Math.abs(this.speed);

    // Buildings, walls, poles: circle vs box push-out. Anything the car can climb (a ramp step, a low
    // deck edge) or that's overhead (a bridge deck it passes under) doesn't block it.
    let crashed = false;
    const r = 1.15;
    for (const centerOff of [car.halfLen * 0.55, -car.halfLen * 0.55]) {
      const cx = p.x + this.fwd.x * centerOff;
      const cz = p.z + this.fwd.z * centerOff;
      for (const b of colliders) {
        if (b.minY > p.y + 1.4) continue;
        if (b.isWall ? b.topY < p.y + 0.6 : b.topY <= p.y + (b.ramp ? RAMP_UP : STEP_UP)) continue;
        const nx = THREE.MathUtils.clamp(cx, b.minX, b.maxX);
        const nz = THREE.MathUtils.clamp(cz, b.minZ, b.maxZ);
        const dx = cx - nx;
        const dz = cz - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 0.001;
          const push = r - d;
          p.x += (dx / d) * push;
          p.z += (dz / d) * push;
          if (Math.abs(this.speed) > 6) crashed = true;
          this.speed *= -0.25;
        }
      }
    }
    // Shove traffic out of the way
    for (const o of others) {
      if (o === car || Math.abs(o.mesh.position.y - p.y) > 2) continue;
      const dx = o.mesh.position.x - p.x;
      const dz = o.mesh.position.z - p.z;
      const d = Math.hypot(dx, dz);
      const minD = 1.6 + Math.min(o.halfLen, car.halfLen) * 0.6;
      if (d < minD && d > 0.01) {
        if (Math.abs(this.speed) > 6) crashed = true;
        p.x -= (dx / d) * (minD - d) * 0.6;
        p.z -= (dz / d) * (minD - d) * 0.6;
        o.speed = 0;
        this.speed *= 0.35;
      }
    }
    // Keep inside the map
    p.x = THREE.MathUtils.clamp(p.x, DRIVE_WEST, STRIP.flamingoEast - 4);
    p.z = THREE.MathUtils.clamp(p.z, STRIP.north + 4, STRIP.south - 4);

    // Ride the ground: climb ramps and decks, fall off edges, and pitch the body to the slope.
    const g = this.groundAt(p.x, p.z, p.y, colliders);
    if (g >= p.y - 0.05) {
      p.y = g;
      this.vy = 0;
    } else {
      this.vy -= 18 * dt;
      p.y = Math.max(g, p.y + this.vy * dt);
      if (p.y === g) this.vy = 0;
    }
    const reach = car.halfLen * 0.7;
    const gF = this.groundAt(p.x + this.fwd.x * reach, p.z + this.fwd.z * reach, p.y, colliders);
    const gB = this.groundAt(p.x - this.fwd.x * reach, p.z - this.fwd.z * reach, p.y, colliders);
    const pitch = p.y - g > 0.3 ? car.mesh.rotation.x : -Math.atan2(gF - gB, reach * 2);
    car.mesh.rotation.order = 'YXZ';
    car.mesh.rotation.set(THREE.MathUtils.lerp(car.mesh.rotation.x, pitch, Math.min(1, dt * 10)), this.heading, -steerRate * 0.02 * Math.sign(this.speed));
    return { crashed };
  }

  /** Abandoned cars quietly go back into traffic once the cat is far away. */
  tickAbandoned(dt: number, catPos: THREE.Vector3): void {
    for (let i = this.abandoned.length - 1; i >= 0; i--) {
      const a = this.abandoned[i];
      a.t += dt;
      if (a.t < 40 || a.car.mesh.position.distanceTo(catPos) < 80) continue;
      const c = a.car;
      c.parked = false;
      c.laneX = c.homeLane ?? c.laneX;
      if (c.axis === 'z') {
        const z = THREE.MathUtils.clamp(catPos.z - c.dir * 160, STRIP.north + 10, STRIP.south - 10);
        c.mesh.position.set(c.laneX, 0, z);
        c.mesh.rotation.set(0, c.dir === 1 ? 0 : Math.PI, 0);
      } else {
        c.mesh.position.set(c.dir === 1 ? STRIP.flamingoWest + 6 : STRIP.flamingoEast - 6, 0, c.laneX);
        c.mesh.rotation.set(0, c.dir === 1 ? Math.PI / 2 : -Math.PI / 2, 0);
      }
      c.speed = c.cruise;
      this.abandoned.splice(i, 1);
    }
  }
}
