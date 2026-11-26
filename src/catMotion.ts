import * as THREE from 'three';

/**
 * Lou's body in motion. One weighted blend over the GLB's 14 clips instead of hard switches, so every
 * change of pose cross-fades (no pops), plus the procedural motion a baked clip can't know about.
 *
 * - Locomotion: Idle / Walk / Trot / Run blended by ground speed on one shared gait phase. Walk is the
 *   lateral-sequence walk (phones' half-pushed stick, starting and stopping), Trot the diagonal trot the walk
 *   key holds (5.2 m/s, about 3.9 strides a second), Run the rotary gallop of a sprint (9 m/s, about 4 a
 *   second). Each clip moves a planted paw a fixed distance per cycle (GAIT_* D in
 *   blender/build_tabby_cat.py, times the 1.35 model scale), so the cadence that keeps the paws planted is
 *   speed / distance; it's held inside each gait's natural range (a slow-motion trot or a blur of legs reads
 *   worse than a little slip at the edges of a band).
 * - Turning: the heading follows a critically damped spring (eases in and out instead of snapping), Lou
 *   banks into the turn with the centripetal pull and pitches with acceleration, and his back curves into
 *   the turn with the head leading it (bones, on top of the clip).
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

export const CLIP_NAMES = ['Idle', 'Walk', 'Run', 'Jump', 'Puff', 'VapeRip', 'Beg', 'Steal', 'Pounce', 'Sit', 'Eat', 'Drive', 'Flop', 'Dance', 'Trot'] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

/** What Lou is doing this frame, as far as his body is concerned (set by the game each frame). */
export type MotionMode = 'free' | 'eat' | 'drive' | 'rag' | 'ride' | 'seat';
/** The pose the blend settled on (the HUD names it). 'action' = a one-shot (puff, beg, steal...) is playing. */
export type MotionPose = 'action' | 'eat' | 'drive' | 'rag' | 'ride' | 'seat' | 'air' | 'land' | 'walk' | 'run' | 'idle' | 'snack' | 'pounce' | 'sit' | 'flop';

// Ground a planted paw covers per gait cycle, in metres at model scale 1 (GAIT_WALK / GAIT_TROT / GAIT_RUN D
// in blender/build_tabby_cat.py; change them together).
const WALK_PER_CYCLE = 0.3;
const TROT_PER_CYCLE = 0.98;
const RUN_PER_CYCLE = 1.65;
/** Each gait's cadence range in strides per second: below it the paws slide back a little, above it forward. */
const WALK_HZ: readonly [number, number] = [0.8, 3.2];
const TROT_HZ: readonly [number, number] = [1.7, 5.2];
const RUN_HZ: readonly [number, number] = [2.4, 5.0];
/** Past RUN_HZ's top the gallop still speeds up, by this share of what matching would need (burger buffs). */
const RUN_KNEE_SLOPE = 0.5;
/** Ground speeds (m/s) where the gaits hand over: walk to trot, trot to gallop. */
const WALK_TROT: readonly [number, number] = [1.2, 2.0];
const TROT_RUN: readonly [number, number] = [6.0, 7.2];
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
const tmpQ = new THREE.Quaternion();
const clamp = (x: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, x));
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
    Trot: null,
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
  /** The same head-only slots as a list, with the clip each one shadows (iterated per frame without allocating). */
  private readonly upperList: Array<{ full: THREE.AnimationAction; slot: Slot }> = [];

  /** A pose held until released (the phone: Beg frozen with the paws up; photo mode: any clip). */
  private held: { act: THREE.AnimationAction; at: number | null; loop: THREE.AnimationActionLoopStyles; clamp: boolean; timeScale: number } | null = null;
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
  private groomAt = 0;
  private flopAt = 0;
  // procedural body pose
  private pitch = 0;
  private bank = 0;
  private squash = 0;
  private squashVel = 0;
  // the back and neck curve into turns: each bone turns about its own copy of the model's up axis
  private readonly bend: Array<{ bone: THREE.Object3D; axis: THREE.Vector3; k: number }> = [];
  private bendAmt = 0;

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
          const us = { act: up, w: 0, target: 0 };
          this.upper.set(act, us);
          this.upperList.push({ full: act, slot: us });
        }
      }
    }
    // the gait clips run on our own phase, not the mixer's clock
    for (const a of [this.actions.Walk, this.actions.Trot, this.actions.Run]) if (a) a.timeScale = 0;
    for (const a of [this.actions.Pounce]) if (a) this.oneShotSetup(a);
    const idle = this.actions.Idle && this.slotOf.get(this.actions.Idle);
    if (idle) idle.w = idle.target = 1;
    // bones still in their rest pose here: find each one's local axis for the model's up
    model.updateWorldMatrix(true, true);
    const modelQ = model.getWorldQuaternion(new THREE.Quaternion());
    for (const [name, k] of [['Spine', 0.55], ['Neck', 0.45]] as const) {
      const bone = model.getObjectByName(name);
      if (!bone) continue;
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(modelQ).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
      this.bend.push({ bone, axis: axis.normalize(), k });
    }
  }

  /**
   * Play a one-shot clip; it holds the body (or just the head, on the move) for lockSeconds. `from` starts
   * it part-way in (0..1 of the clip), e.g. the Pounce at the leap when the physics has already launched him.
   */
  play(act: THREE.AnimationAction | null, lockSeconds: number, from = 0): void {
    this.lock = lockSeconds;
    this.current = act;
    if (!act) return;
    this.oneShotSetup(act);
    act.reset();
    act.time = from * act.getClip().duration;
    act.play();
    const up = this.upper.get(act);
    if (up) {
      up.act.reset();
      up.act.timeScale = act.timeScale;
      up.act.play();
    }
  }

  /**
   * Hold a pose on foot until released: `at` (0..1 of the clip) freezes it there, null loops it. The phone holds
   * Beg at its middle (sat up, paws raised: holding the phone); photo mode holds whatever the player picks.
   */
  holdPose(act: THREE.AnimationAction | null, at: number | null = null): void {
    if (this.held?.act === act && this.held.at === at) return;
    this.releasePose();
    if (!act) return;
    this.held = { act, at, loop: act.loop, clamp: act.clampWhenFinished, timeScale: act.timeScale };
    act.reset();
    act.setLoop(THREE.LoopRepeat, Infinity);
    act.clampWhenFinished = false;
    if (at !== null) {
      act.time = at * act.getClip().duration;
      act.timeScale = 0;
    } else if (act.timeScale === 0) act.timeScale = 1; // Walk / Run normally run on the gait phase
    act.play();
  }

  releasePose(): void {
    const h = this.held;
    if (!h) return;
    this.held = null;
    h.act.setLoop(h.loop, h.loop === THREE.LoopOnce ? 1 : Infinity);
    h.act.clampWhenFinished = h.clamp;
    h.act.timeScale = h.timeScale;
  }

  get holding(): boolean {
    return !!this.held;
  }

  /** Sitting and washing (catLook bends the head down to the chest): a few seconds now and then while he sits. */
  get grooming(): boolean {
    const s = this.idleTime - this.groomAt;
    return this.pose === 'sit' && this.lock <= 0 && s >= 0 && s % 10 < 3.6;
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

    // a held pose (phone, photo mode) owns the body while he's on foot
    const hold = this.held && mode === 'free' ? this.held.act : null;
    if (hold) this.idleTime = 0;
    // one-shots: whole body when standing about, head and neck only when he's busy below the neck
    const cur = hold ?? this.current;
    const up = !hold && cur ? this.upper.get(cur) : undefined;
    const headOnly = !!up && base !== 'idle' && base !== 'eat' && base !== 'snack' && base !== 'pounce' && base !== 'land';
    const pose: MotionPose = hold ? 'action' : cur && this.lock > 0 && !headOnly && base !== 'eat' && base !== 'drive' && base !== 'rag' ? 'action' : base;

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
    const moving = pose === 'walk' || pose === 'run' || pose === 'idle';
    switch (pose) {
      case 'action':
        this.want(cur, 1);
        break;
      case 'eat':
        this.want(A.Eat, 1, A.Sit ?? A.Idle);
        break;
      case 'drive':
        this.want(A.Drive, 1, A.Sit ?? A.Idle);
        break;
      case 'rag':
        this.want(A.Flop, 1, A.Idle);
        break;
      case 'seat':
        this.want(A.Sit, 1, A.Idle);
        break;
      case 'ride':
        this.want(A.Idle, 1);
        break;
      case 'air':
        this.want(A.Jump, 1, A.Idle);
        break;
      case 'land':
        this.want(A.Pounce, 1, A.Idle);
        break;
      case 'snack':
        this.want(A.Eat, 1, A.Idle);
        break;
      case 'pounce':
        this.want(A.Pounce, 1, A.Idle);
        break;
      case 'sit':
        this.want(A.Sit, 1, A.Idle);
        break;
      case 'flop':
        this.want(A.Flop, 1, A.Sit ?? A.Idle);
        break;
      default:
        break;
    }
    if (moving) {
      // Idle -> Walk -> Trot -> Run by speed, all on one gait phase (every clip's left hind lands at 0)
      const v = this.speed;
      const still = 1 - smooth(0.06, 0.3, v);
      const t = smooth(WALK_TROT[0], WALK_TROT[1], v);
      const r = smooth(TROT_RUN[0], TROT_RUN[1], v);
      // an old GLB without the Trot clip gallops instead
      const trot = A.Trot ? t * (1 - r) : 0;
      const run = A.Trot ? t * r : t;
      const walk = 1 - t;
      this.want(A.Idle, still);
      this.want(A.Walk, (1 - still) * walk, A.Run);
      if (trot > 0) this.want(A.Trot, (1 - still) * trot);
      this.want(A.Run, (1 - still) * run, A.Walk);
      const s = this.baseScale;
      const fWalk = clamp(v / (WALK_PER_CYCLE * s), WALK_HZ);
      const fTrot = clamp(v / (TROT_PER_CYCLE * s), TROT_HZ);
      const runMatched = v / (RUN_PER_CYCLE * s);
      const fRun = runMatched > RUN_HZ[1] ? RUN_HZ[1] + (runMatched - RUN_HZ[1]) * RUN_KNEE_SLOPE : Math.max(RUN_HZ[0], runMatched);
      const f = walk * fWalk + trot * fTrot + run * fRun;
      if (still < 0.999) this.phase = (this.phase + dt * Math.max(0.6, f)) % 1;
    }
    for (const a of [A.Walk, A.Trot, A.Run]) if (a && hold !== a) a.time = this.phase * a.getClip().duration;

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
    for (const { full, slot: u } of this.upperList) {
      const on = headOnly && full === cur && this.lock > 0;
      const d = (on ? 1 : 0) - u.w;
      const r2 = dt / (on ? 0.12 : 0.25);
      u.w += Math.abs(d) <= r2 ? d : Math.sign(d) * r2;
      u.act.setEffectiveWeight(u.w * UPPER_WEIGHT);
      if (u.w > 0) u.act.time = Math.min(full.time, u.act.getClip().duration);
    }

    this.mixer?.update(dt);
    this.bendIntoTurn(dt, mode, pose);
    this.bodyPose(dt, mode, pose, vel);
    return hold || (this.lock > 0 && cur) ? 'action' : pose;
  }

  /**
   * Curve the back into a turn, the head leading: the mixer has just written every bone, so this rides on top
   * of whatever clip is playing. Up to ~17 degrees through the back and neck at a hard turn.
   */
  private bendIntoTurn(dt: number, mode: MotionMode, pose: MotionPose): void {
    const on = mode === 'free' && (pose === 'walk' || pose === 'run' || pose === 'air' || pose === 'idle') ? 1 : 0;
    const want = on * Math.max(-0.3, Math.min(0.3, this.yawRate * 0.045 * smooth(0.2, 2.5, this.speed)));
    this.bendAmt += (want - this.bendAmt) * Math.min(1, dt * 10);
    if (Math.abs(this.bendAmt) < 1e-4 || !this.mixer) return; // only on top of a fresh mixer pose (it would pile up)
    for (const b of this.bend) b.bone.quaternion.multiply(tmpQ.setFromAxisAngle(b.axis, this.bendAmt * b.k));
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

  /** Add weight to a clip's target this frame (or to the fallback clip if the GLB lacks it). */
  private want(a: THREE.AnimationAction | null, w: number, fallback?: THREE.AnimationAction | null): void {
    const s = (a && this.slotOf.get(a)) || (fallback && this.slotOf.get(fallback));
    if (s) s.target += w;
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
    this.groomAt = this.sitAt + 2.5 + Math.random() * 3;
    this.flopAt = this.sitAt + 15 + Math.random() * 8;
  }
}
