import * as THREE from 'three';

/**
 * Lou's body in motion. One weighted blend over the GLB's 14 clips instead of hard switches, so every
 * change of pose cross-fades (no pops), plus the procedural motion a baked clip can't know about.
 *
 * - Locomotion: Idle / Walk / Run blended by ground speed on one shared gait phase. Each gait's cadence
 *   comes from its stride (blender/build_tabby_cat.py: Walk sweeps a planted paw 0.11 m over 62% of a 1.0 s
 *   cycle, Run 0.21 m over 38% of 0.5 s, times the 1.35 model scale), so the paws keep pace with the ground.
 *   Past 5 strides a second the cadence eases off (a blur of legs reads worse than a little slip).
 * - Turning: the heading follows a critically damped spring (eases in and out instead of snapping), and Lou
 *   banks into the turn with the centripetal pull and pitches with acceleration.
 * - Jumps: a stretch at take-off, the Jump pose in the air with the body pitched along the arc, a squash on
 *   landing; after a real drop, or landing up on something, the last beat of the Pounce clip (hind paws
 *   coming down into a little crouch) plays as the landing.
 * - Idle life: stand and glance about (catLook.ts), now and then snack on something off the pavement or
 *   pounce at nothing, sit down after a while, flop over on his side when nothing has happened for half a
 *   minute.
 * - Smoking on the move: Puff and VapeRip play on the head and neck only while he runs, sits or naps, so the
 *   legs (or the loaf) carry on underneath.
 *
 * Nothing here allocates per frame.
 */

export const CLIP_NAMES = ['Idle', 'Walk', 'Run', 'Jump', 'Puff', 'VapeRip', 'Beg', 'Steal', 'Pounce', 'Sit', 'Eat', 'Drive', 'Flop', 'Dance'] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

/** What Lou is doing this frame, as far as his body is concerned (set by the game each frame). */
export type MotionMode = 'free' | 'eat' | 'drive' | 'rag' | 'ride' | 'seat';
/** The pose the blend settled on (the HUD names it). 'action' = a one-shot (puff, beg, steal...) is playing. */
export type MotionPose = 'action' | 'eat' | 'drive' | 'rag' | 'ride' | 'seat' | 'air' | 'land' | 'walk' | 'run' | 'idle' | 'snack' | 'pounce' | 'sit' | 'flop';

// Ground covered per gait cycle with the paws planted, in metres at model scale 1 (see the header).
const WALK_PER_CYCLE = (0.11 / 0.62) * 1.0;
const RUN_PER_CYCLE = (0.21 / (0.38 * 0.5)) * 0.5;
/** Strides per second where the run cadence starts to ease off, and how much it still follows past it. */
const RUN_KNEE = 5.0;
const RUN_KNEE_SLOPE = 0.5;
/** Head-and-neck bones the smoking clips may drive on their own. */
const UPPER = new Set(['Neck', 'Head', 'Jaw', 'Lid_L', 'Lid_R', 'Ear_L', 'Ear_R']);
/** Clips that can play on the head alone. */
const MASKABLE: ReadonlySet<ClipName> = new Set<ClipName>(['Puff', 'VapeRip']);
/** How much the head-only clip outweighs the body pose under it (the mixer averages by weight). */
const UPPER_WEIGHT = 6;

const FADE_IN: Record<MotionPose, number> = {
  action: 0.12,
  eat: 0.25,
  drive: 0.25,
  rag: 0.1,
  ride: 0.3,
  seat: 0.55,
  air: 0.1,
  land: 0.06,
  walk: 0.18,
  run: 0.18,
  idle: 0.2,
  snack: 0.35,
  pounce: 0.18,
  sit: 0.7,
  flop: 1.1,
};
const FADE_OUT: Partial<Record<MotionPose, number>> = { action: 0.22, rag: 0.3, flop: 0.35, sit: 0.25, snack: 0.25, eat: 0.25, drive: 0.25, seat: 0.35 };

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrapAngle = (a: number): number => {
  a %= Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a < -Math.PI) a += Math.PI * 2;
  return a;
};

interface Slot {
  act: THREE.AnimationAction;
  w: number;
  target: number;
}

export class CatMotion {
  /** The GLB's clips by name (null until the model has loaded, or if a clip is missing). */
  readonly actions: Record<ClipName, THREE.AnimationAction | null> = {
    Idle: null,
    Walk: null,
    Run: null,
    Jump: null,
    Puff: null,
    VapeRip: null,
    Beg: null,
    Steal: null,
    Pounce: null,
    Sit: null,
    Eat: null,
    Drive: null,
    Flop: null,
    Dance: null,
  };
  /** The one-shot playing now (puff, beg, steal, pounce, dance...), while it holds the body. */
  current: THREE.AnimationAction | null = null;
  /** The pose of the last update. */
  pose: MotionPose = 'idle';
  /** Seconds Lou has stood still (drives sitting down, snacking and flopping). */
  idleTime = 0;

  private mixer: THREE.AnimationMixer | null = null;
  private model: THREE.Object3D | null = null;
  private baseScale = 1;
  private readonly slots: Slot[] = [];
  private readonly slotOf = new Map<THREE.AnimationAction, Slot>();
  private readonly upper = new Map<THREE.AnimationAction, Slot>();
  private upperSlot: Slot | null = null;

  private lock = 0;
  private fade = 0.2;
  private phase = 0;
  private speed = 0;
  private accel = 0;
  private lastSpeed = 0;
  private lastYaw = 0;
  private yawRate = 0;
  private yawVel = 0;
  private steered = false;
  private airT = 0;
  private wasAir = false;
  private lastVy = 0;
  private takeoffY = 0;
  private peakY = 0;
  private landT = 0;
  private wasGrounded = true;
  // idle plan for this stretch of standing still
  private snackAt = 0;
  private snackKind: 'snack' | 'pounce' | 'none' = 'none';
  private sitAt = 0;
  private flopAt = 0;
  // procedural body pose
  private pitch = 0;
  private bank = 0;
  private squash = 0;
  private squashVel = 0;

  constructor() {
    this.planIdle();
  }

  /** Hook the model's clips up. Call once when the GLB has loaded. */
  attach(model: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    this.model = model;
    this.baseScale = model.scale.x;
    if (!clips.length) return;
    const mixer = new THREE.AnimationMixer(model);
    this.mixer = mixer;
    for (const name of CLIP_NAMES) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) continue;
      const act = mixer.clipAction(clip);
      act.play();
      act.setEffectiveWeight(0);
      this.actions[name] = act;
      const slot = { act, w: 0, target: 0 };
      this.slots.push(slot);
      this.slotOf.set(act, slot);
      if (MASKABLE.has(name)) {
        const tracks = clip.tracks.filter((t) => UPPER.has(t.name.split('.')[0]));
        if (tracks.length) {
          const up = mixer.clipAction(new THREE.AnimationClip(`${name}_Upper`, clip.duration, tracks));
          up.setLoop(THREE.LoopOnce, 1);
          up.clampWhenFinished = true;
          up.play();
          up.setEffectiveWeight(0);
          this.upper.set(act, { act: up, w: 0, target: 0 });
        }
      }
    }
    // the gait clips run on our own phase, not the mixer's clock
    for (const a of [this.actions.Walk, this.actions.Run]) if (a) a.timeScale = 0;
    for (const a of [this.actions.Pounce]) if (a) this.oneShotSetup(a);
    const idle = this.actions.Idle && this.slotOf.get(this.actions.Idle);
    if (idle) idle.w = idle.target = 1;
  }

  /** Play a one-shot clip; it holds the body (or just the head, on the move) for lockSeconds. */
  play(act: THREE.AnimationAction | null, lockSeconds: number): void {
    this.lock = lockSeconds;
    this.current = act;
    if (!act) return;
    this.oneShotSetup(act);
    act.reset();
    act.play();
    const up = this.upper.get(act);
    if (up) {
      up.act.reset();
      up.act.timeScale = act.timeScale;
      up.act.play();
    }
  }

  /** True while a one-shot holds the body. */
  get locked(): boolean {
    return this.lock > 0;
  }

  /** Back to square one on the idle clock (after a dance, say). */
  resetIdle(): void {
    this.idleTime = 0;
    this.planIdle();
  }

  /**
   * Turn toward the heading the player is steering at: a critically damped spring (it eases into the
   * turn and settles without overshoot) instead of snapping. Returns the new yaw.
   */
  steer(yaw: number, target: number, dt: number): number {
    const diff = wrapAngle(target - yaw);
    const smoothTime = 0.1;
    const omega = 2 / smoothTime;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const temp = (this.yawVel - omega * diff) * dt;
    let vel = (this.yawVel - omega * temp) * exp;
    let step = diff - (diff - temp) * exp; // how far toward the target this frame
    vel = Math.max(-16, Math.min(16, vel));
    if (Math.abs(step) > Math.abs(diff)) step = diff;
    this.yawVel = vel;
    this.steered = true;
    return yaw + step;
  }

  /**
   * Once per frame: pick the pose, blend the clips, advance the mixer and set the body's lean and squash.
   * vel = world velocity, yaw = heading, y = feet height. Call catLook.update() right after.
   */
  update(dt: number, mode: MotionMode, grounded: boolean, vel: THREE.Vector3, yaw: number, y: number): MotionPose {
    if (!this.steered) this.yawVel *= Math.exp(-dt * 12);
    this.steered = false;
    if (this.lock > 0) this.lock = Math.max(0, this.lock - dt);
    if (this.lock <= 0) this.current = null;
    if (this.landT > 0) this.landT = Math.max(0, this.landT - dt);

    // ---- what the body is doing
    const hs = Math.hypot(vel.x, vel.z);
    const k = Math.min(1, dt * 14);
    this.speed += (hs - this.speed) * k;
    if (dt > 0) {
      this.accel += ((this.speed - this.lastSpeed) / dt - this.accel) * Math.min(1, dt * 8);
      this.yawRate += (wrapAngle(yaw - this.lastYaw) / dt - this.yawRate) * Math.min(1, dt * 10);
    }
    this.lastSpeed = this.speed;
    this.lastYaw = yaw;
    const free = mode === 'free';

    // air time, take-off and landing
    if (free && !grounded) {
      if (this.wasGrounded && vel.y > 2) {
        // take-off: a quick stretch up out of the crouch
        this.takeoffY = y;
        this.squashVel += 1.2;
        this.airT = 0.2;
      }
      this.airT += dt;
      this.peakY = Math.max(this.peakY, y);
    }
    const airborne = free && !grounded && (this.airT > 0.12 || vel.y > 2);
    if (free && grounded && this.wasAir) {
      const impact = Math.max(0, -this.lastVy);
      this.squashVel -= Math.min(impact, 14) * 0.14;
      const drop = this.peakY - y;
      const onTop = y - this.takeoffY > 0.3;
      if (this.lock <= 0 && this.speed < 2.8 && (drop > 1.1 || onTop) && this.actions.Pounce) {
        this.landT = 0.24;
        const p = this.actions.Pounce;
        p.reset();
        p.time = p.getClip().duration * 0.72;
        p.play();
      }
    }
    if (grounded || !free) {
      this.airT = 0;
      this.peakY = y;
      if (grounded) this.takeoffY = y;
    }
    this.wasAir = airborne;
    this.wasGrounded = grounded;
    this.lastVy = vel.y;

    // ---- the pose under any one-shot
    let base: MotionPose;
    if (mode === 'eat') base = 'eat';
    else if (mode === 'drive') base = 'drive';
    else if (mode === 'rag') base = 'rag';
    else if (mode === 'seat') base = 'seat';
    else if (mode === 'ride') base = 'ride';
    else if (airborne) base = 'air';
    else if (this.landT > 0 && this.speed < 2.8) base = 'land';
    else if (this.speed > 0.3) base = this.speed > 1.2 ? 'run' : 'walk';
    else base = 'idle';

    if (base === 'idle' && this.lock <= 0) {
      if (this.idleTime === 0) this.planIdle();
      this.idleTime += dt;
      const t = this.idleTime;
      if (t >= this.flopAt) base = 'flop';
      else if (t >= this.sitAt) base = 'sit';
      else if (this.snackKind !== 'none' && t >= this.snackAt && t < this.snackAt + (this.snackKind === 'snack' ? 1.7 : 0.8)) base = this.snackKind;
    } else if (base !== 'idle' && base !== 'land') {
      this.idleTime = 0;
    }
    // a rest pose survives a one-shot (a puff while sitting stays sitting)
    if (this.lock > 0 && base === 'idle') base = this.idleTime >= this.flopAt ? 'flop' : this.idleTime >= this.sitAt ? 'sit' : 'idle';

    // one-shots: whole body when standing about, head and neck only when he's busy below the neck
    const cur = this.current;
    const up = cur ? this.upper.get(cur) : undefined;
    const headOnly = !!up && base !== 'idle' && base !== 'eat' && base !== 'snack' && base !== 'pounce' && base !== 'land';
    const pose: MotionPose = cur && this.lock > 0 && !headOnly && base !== 'eat' && base !== 'drive' && base !== 'rag' ? 'action' : base;

    if (pose !== this.pose) {
      const out = FADE_OUT[this.pose] ?? 0;
      this.fade = pose === 'air' || pose === 'land' || this.pose === 'air' ? FADE_IN[pose] : Math.max(FADE_IN[pose], out);
      if (pose === 'pounce' && this.actions.Pounce) {
        this.actions.Pounce.reset();
        this.actions.Pounce.play();
      }
      this.pose = pose;
    }

    // ---- targets
    for (const s of this.slots) s.target = 0;
    const A = this.actions;
    const set = (a: THREE.AnimationAction | null, w: number, fallback?: THREE.AnimationAction | null): void => {
      const s = (a && this.slotOf.get(a)) || (fallback && this.slotOf.get(fallback));
      if (s) s.target += w;
    };
    const moving = pose === 'walk' || pose === 'run' || pose === 'idle';
    switch (pose) {
      case 'action':
        set(cur, 1);
        break;
      case 'eat':
        set(A.Eat, 1, A.Sit ?? A.Idle);
        break;
      case 'drive':
        set(A.Drive, 1, A.Sit ?? A.Idle);
        break;
      case 'rag':
        set(A.Flop, 1, A.Idle);
        break;
      case 'seat':
        set(A.Sit, 1, A.Idle);
        break;
      case 'ride':
        set(A.Idle, 1);
        break;
      case 'air':
        set(A.Jump, 1, A.Idle);
        break;
      case 'land':
        set(A.Pounce, 1, A.Idle);
        break;
      case 'snack':
        set(A.Eat, 1, A.Idle);
        break;
      case 'pounce':
        set(A.Pounce, 1, A.Idle);
        break;
      case 'sit':
        set(A.Sit, 1, A.Idle);
        break;
      case 'flop':
        set(A.Flop, 1, A.Sit ?? A.Idle);
        break;
      default:
        break;
    }
    if (moving) {
      // Idle -> Walk -> Run by speed, all on one gait phase
      const v = this.speed;
      const still = 1 - smooth(0.08, 0.4, v);
      const r = smooth(0.7, 1.7, v);
      set(A.Idle, still);
      set(A.Walk, (1 - still) * (1 - r), A.Run);
      set(A.Run, (1 - still) * r, A.Walk);
      const fWalk = Math.min(v / (WALK_PER_CYCLE * this.baseScale), 2.8);
      const runMatched = v / (RUN_PER_CYCLE * this.baseScale);
      const fRun = runMatched < RUN_KNEE ? runMatched : RUN_KNEE + (runMatched - RUN_KNEE) * RUN_KNEE_SLOPE;
      const f = Math.max(0.6, fWalk + (fRun - fWalk) * r);
      if (still < 0.999) this.phase = (this.phase + dt * f) % 1;
    }
    if (A.Walk) A.Walk.time = this.phase * A.Walk.getClip().duration;
    if (A.Run) A.Run.time = this.phase * A.Run.getClip().duration;

    // ---- ramp the weights; normalise the whole-body ones so they always sum to one
    const rate = dt / Math.max(0.02, this.fade);
    let sum = 0;
    for (const s of this.slots) {
      const d = s.target - s.w;
      s.w += Math.abs(d) <= rate ? d : Math.sign(d) * rate;
      sum += s.w;
    }
    if (sum < 1e-4) {
      const idle = A.Idle && this.slotOf.get(A.Idle);
      if (idle) idle.w = sum = 1;
    }
    for (const s of this.slots) s.act.setEffectiveWeight(s.w / sum);
    // head-only one-shots ride on top
    for (const [full, u] of this.upper) {
      const on = headOnly && full === cur && this.lock > 0;
      const d = (on ? 1 : 0) - u.w;
      const r2 = dt / (on ? 0.12 : 0.25);
      u.w += Math.abs(d) <= r2 ? d : Math.sign(d) * r2;
      u.act.setEffectiveWeight(u.w * UPPER_WEIGHT);
      if (u.w > 0) u.act.time = Math.min(full.time, u.act.getClip().duration);
    }

    this.mixer?.update(dt);
    this.bodyPose(dt, mode, pose, vel);
    return this.lock > 0 && cur ? 'action' : pose;
  }

  /** Lean into turns, pitch with the jump arc and acceleration, squash and stretch on take-off and landing. */
  private bodyPose(dt: number, mode: MotionMode, pose: MotionPose, vel: THREE.Vector3): void {
    const m = this.model;
    if (!m) return;
    // squash spring (a little under-damped: one soft wobble)
    const K = 260;
    const C = 2 * Math.sqrt(K) * 0.42;
    this.squashVel += (-K * this.squash - C * this.squashVel) * dt;
    this.squash += this.squashVel * dt;
    this.squash = Math.max(-0.22, Math.min(0.16, this.squash));
    if (mode === 'rag') {
      // the ragdoll owns the model's rotation
      this.pitch = this.bank = 0;
      m.scale.setScalar(this.baseScale);
      return;
    }
    let wantPitch = 0;
    let wantBank = 0;
    if (mode === 'free') {
      if (pose === 'air') {
        const along = 0.4 + 0.6 * smooth(0.5, 4, this.speed);
        wantPitch = -Math.max(-0.3, Math.min(0.28, vel.y * 0.042)) * along;
      } else if (pose === 'walk' || pose === 'run') {
        wantPitch = Math.max(-0.1, Math.min(0.07, this.accel * 0.009));
      }
      if (pose === 'walk' || pose === 'run' || pose === 'air' || pose === 'action') {
        // centripetal lean: into the turn, harder the faster he goes
        wantBank = Math.max(-0.26, Math.min(0.26, -this.yawRate * this.speed * 0.022));
      }
    }
    this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 9);
    this.bank += (wantBank - this.bank) * Math.min(1, dt * 7);
    m.rotation.set(this.pitch, 0, this.bank);
    const sy = 1 + this.squash;
    const sxz = 1 / Math.sqrt(sy);
    m.scale.set(this.baseScale * sxz, this.baseScale * sy, this.baseScale * sxz);
  }

  private oneShotSetup(act: THREE.AnimationAction): void {
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
  }

  private planIdle(): void {
    const r = Math.random();
    this.snackAt = 3.2 + Math.random() * 2;
    this.snackKind = r < 0.5 ? 'snack' : r < 0.75 ? 'pounce' : 'none';
    this.sitAt = 7.5 + Math.random() * 2.5;
    this.flopAt = this.sitAt + 15 + Math.random() * 8;
  }
}
