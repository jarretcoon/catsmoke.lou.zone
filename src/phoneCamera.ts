import * as THREE from 'three';
import type { ClipName } from './catMotion';
import type { TimePreset } from './vegasWorld';

/**
 * Photo mode (the phone's Camera app): a free camera around Lou, his 15 clips as poses, the time of day, a few
 * film looks, a selfie, the HUD hidden, and "Save photo" downloads a JPEG of the frame.
 *
 * The world keeps running (tourists, traffic, the fountains). Lou holds his pose. The camera is its own orbit
 * (wider tilt and zoom than the game's), taken over after main.ts has placed the game camera each frame.
 */

export interface PhotoHooks {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  cat: THREE.Object3D;
  catYaw(): number;
  /** Lou's head bone, once the model has loaded. */
  head(): THREE.Object3D | null;
  /** Draw one frame right now (the save reads the canvas straight after). */
  render(): void;
  getTime(): TimePreset;
  setTime(p: TimePreset): void;
  zone(): string;
  daylight(): string;
  /** Hold a clip (at = 0..1 freezes it there, null loops it); null clip = back to normal. */
  pose(clip: ClipName | null, at: number | null, phoneInPaw: boolean): void;
  onFoot(): boolean;
  shutter(): void;
  toast(msg: string): void;
  /** Photo mode closed: back to the phone (true) or straight back to the game. */
  onExit(back: boolean): void;
}

interface Pose {
  id: string;
  label: string;
  clip: ClipName | null;
  at: number | null;
  phone?: boolean;
}

/** All 15 clips: base poses loop, one-shots freeze on their best frame. */
const POSES: Pose[] = [
  { id: 'natural', label: 'Natural', clip: null, at: null },
  { id: 'idle', label: 'Stand', clip: 'Idle', at: null },
  { id: 'sit', label: 'Sit', clip: 'Sit', at: null },
  { id: 'flop', label: 'Flop', clip: 'Flop', at: null },
  { id: 'dance', label: 'Dance', clip: 'Dance', at: null },
  { id: 'beg', label: 'Beg', clip: 'Beg', at: 0.52 },
  { id: 'phone', label: 'On the phone', clip: 'Beg', at: 0.5, phone: true },
  { id: 'puff', label: 'Puff', clip: 'Puff', at: 0.56 },
  { id: 'vape', label: 'Vape rip', clip: 'VapeRip', at: 0.6 },
  { id: 'pounce', label: 'Pounce', clip: 'Pounce', at: 0.45 },
  { id: 'jump', label: 'Jump', clip: 'Jump', at: 0.5 },
  { id: 'walk', label: 'Strut', clip: 'Walk', at: 0.3 },
  { id: 'trot', label: 'Trot', clip: 'Trot', at: 0.25 },
  { id: 'run', label: 'Zoomies', clip: 'Run', at: 0.35 },
  { id: 'steal', label: 'Swipe', clip: 'Steal', at: 0.48 },
  { id: 'eat', label: 'Snack', clip: 'Eat', at: null },
  { id: 'drive', label: 'Cruise', clip: 'Drive', at: null },
];

interface Look {
  id: string;
  label: string;
  css: string;
  vignette: number;
}
const LOOKS: Look[] = [
  { id: 'none', label: 'Natural', css: 'none', vignette: 0 },
  { id: 'neon', label: 'Neon', css: 'saturate(1.65) contrast(1.12) brightness(1.02)', vignette: 0.35 },
  { id: 'golden', label: 'Golden', css: 'sepia(0.28) saturate(1.35) brightness(1.06) hue-rotate(-8deg)', vignette: 0.3 },
  { id: 'vintage', label: '1972', css: 'sepia(0.6) saturate(1.15) contrast(0.92) brightness(1.06)', vignette: 0.55 },
  { id: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.3) brightness(0.96)', vignette: 0.6 },
];
const LENSES: Array<[string, number]> = [
  ['Normal', 50],
  ['Wide', 74],
  ['Tele', 28],
];
const TIMES: Array<[TimePreset, string]> = [
  ['day', 'Day'],
  ['sunset', 'Sunset'],
  ['night', 'Night'],
];

const clamp = THREE.MathUtils.clamp;

// ---------------------------------------------------------------- the CSS filter maths, for browsers whose canvas has no `filter`
type M = number[]; // 4x5 colour matrix, row-major (r, g, b, a rows; the 5th column is the offset)
const ident = (): M => [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
function mul(a: M, b: M): M {
  // a after b
  const o: M = new Array(20).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let s = c === 4 ? a[r * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) s += a[r * 5 + k] * b[k * 5 + c];
      o[r * 5 + c] = s;
    }
  }
  return o;
}
function rgb3(m: number[]): M {
  return [m[0], m[1], m[2], 0, 0, m[3], m[4], m[5], 0, 0, m[6], m[7], m[8], 0, 0, 0, 0, 0, 1, 0];
}
/** The Filter Effects spec's matrices for the CSS functions LOOKS uses. */
function cssMatrix(css: string): M {
  let m = ident();
  for (const [, fn, arg] of css.matchAll(/([a-z-]+)\(([-\d.]+)(?:deg)?\)/g)) {
    const v = parseFloat(arg);
    let f: M;
    if (fn === 'grayscale' || fn === 'sepia' || fn === 'saturate') {
      if (fn === 'saturate') {
        const s = v;
        f = rgb3([0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]);
      } else if (fn === 'grayscale') {
        const a = 1 - Math.min(1, v);
        f = rgb3([0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a, 0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a, 0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a]);
      } else {
        const a = 1 - Math.min(1, v);
        f = rgb3([0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a]);
      }
    } else if (fn === 'hue-rotate') {
      const r = (v * Math.PI) / 180;
      const c = Math.cos(r);
      const s = Math.sin(r);
      f = rgb3([
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
      ]);
    } else if (fn === 'contrast') {
      const o = 0.5 - 0.5 * v;
      f = [v, 0, 0, 0, o, 0, v, 0, 0, o, 0, 0, v, 0, o, 0, 0, 0, 1, 0];
    } else if (fn === 'brightness') {
      f = rgb3([v, 0, 0, 0, v, 0, 0, 0, v]);
    } else continue;
    m = mul(f, m);
  }
  return m;
}
function applyMatrix(g: CanvasRenderingContext2D, w: number, h: number, m: M): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const gg = d[i + 1] / 255;
    const b = d[i + 2] / 255;
    d[i] = 255 * (m[0] * r + m[1] * gg + m[2] * b + m[4]);
    d[i + 1] = 255 * (m[5] * r + m[6] * gg + m[7] * b + m[9]);
    d[i + 2] = 255 * (m[10] * r + m[11] * gg + m[12] * b + m[14]);
  }
  g.putImageData(img, 0, 0);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'strip';

export class PhotoMode {
  active = false;
  private readonly bar: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly target = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0.2;
  private dist = 4;
  private height = 0;
  private roll = 0;
  private fov = 50;
  /** The lens as it eases between settings (main.ts's ride lens may also touch camera.fov). */
  private curFov = 50;
  private lens = 0;
  private look = 0;
  private poseIdx = 0;
  private selfie = false;
  private hiddenUi = false;
  private savedFov = 56;
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private moved = false;
  private prevPad: boolean[] = [];

  constructor(private readonly hooks: PhotoHooks) {
    const root = document.getElementById('game-root')!;
    this.overlay = document.createElement('div');
    this.overlay.className = 'photo-overlay';
    this.overlay.hidden = true;
    this.overlay.innerHTML = '<div class="photo-thirds" aria-hidden="true"></div><div class="photo-vignette" aria-hidden="true"></div>';
    this.flash = document.createElement('div');
    this.flash.className = 'photo-flash';
    this.bar = document.createElement('section');
    this.bar.className = 'photo-bar';
    this.bar.id = 'photo-bar';
    this.bar.setAttribute('popover', 'manual');
    this.bar.setAttribute('aria-label', 'Photo mode');
    this.bar.innerHTML = `
      <div class="photo-row photo-poses" role="group" aria-label="Pose">
        ${POSES.map((p, i) => `<button type="button" class="photo-chip" data-pose="${i}">${p.label}</button>`).join('')}
      </div>
      <div class="photo-row photo-tools">
        <div class="photo-seg" role="group" aria-label="Time of day">
          ${TIMES.map(([t, l]) => `<button type="button" class="photo-chip" data-time="${t}">${l}</button>`).join('')}
        </div>
        <button type="button" class="photo-chip" data-act="look">Look: Natural</button>
        <button type="button" class="photo-chip" data-act="lens">Lens: Normal</button>
        <button type="button" class="photo-chip" data-act="selfie">🤳 Selfie</button>
        <button type="button" class="photo-chip" data-act="hide">Hide UI <kbd>H</kbd></button>
      </div>
      <div class="photo-row photo-actions">
        <button type="button" class="photo-snap" data-act="snap" data-pad-first aria-label="Save photo"><span class="photo-snap-dot"></span><span>Save photo</span></button>
        <button type="button" class="photo-chip photo-exit" data-act="exit" aria-label="Close the camera">✕</button>
      </div>
      <p class="photo-help">Drag to orbit · wheel / pinch to zoom · <kbd>R</kbd>/<kbd>F</kbd> camera up/down · <kbd>Z</kbd>/<kbd>C</kbd> tilt · <kbd>Space</kbd> save · <kbd>Esc</kbd> back</p>`;
    root.append(this.overlay, this.flash, this.bar);
    this.bar.addEventListener('click', (e) => this.onBarClick(e));
    this.bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    // Hidden by the controller's B (it closes the top popover): leave photo mode.
    this.bar.addEventListener('toggle', (e) => {
      if ((e as ToggleEvent).newState === 'closed' && this.active) this.exit();
    });
    this.setupPointer();
    window.addEventListener('keydown', (e) => this.onKey(e, true), true);
    window.addEventListener('keyup', (e) => this.onKey(e, false), true);
  }

  // ---------------------------------------------------------------- enter / exit
  enter(): void {
    if (this.active) return;
    this.active = true;
    const cam = this.hooks.camera;
    this.savedFov = cam.fov;
    this.fov = LENSES[this.lens][1];
    this.curFov = cam.fov;
    // start where the game camera is, so it doesn't jump
    this.aim();
    this.tmp.copy(cam.position).sub(this.target);
    this.dist = clamp(this.tmp.length(), 0.8, 16);
    this.pitch = clamp(Math.asin(clamp(this.tmp.y / Math.max(0.01, this.dist), -1, 1)), -0.3, 1.45);
    this.yaw = Math.atan2(this.tmp.x, this.tmp.z);
    this.height = 0;
    this.roll = 0;
    this.selfie = false;
    this.hiddenUi = false;
    this.keys.clear();
    this.overlay.hidden = false;
    this.bar.classList.remove('is-hidden');
    this.overlay.classList.remove('is-hidden');
    document.getElementById('game-root')!.classList.add('is-photo');
    if (!this.bar.matches(':popover-open')) this.bar.showPopover();
    this.applyLook();
    this.setPose(this.poseIdx);
    this.render();
  }

  exit(back = true): void {
    if (!this.active) return;
    this.active = false;
    this.keys.clear();
    this.pointers.clear();
    this.overlay.hidden = true;
    document.getElementById('game-root')!.classList.remove('is-photo');
    this.hooks.canvas.style.filter = '';
    this.hooks.pose(null, null, false);
    const cam = this.hooks.camera;
    cam.fov = this.savedFov;
    cam.updateProjectionMatrix();
    if (this.bar.matches(':popover-open')) this.bar.hidePopover();
    this.hooks.onExit(back);
  }

  // ---------------------------------------------------------------- per frame
  /** After main.ts has placed the game camera: take it over. */
  update(dt: number): void {
    if (!this.active) return;
    this.pollPad(dt);
    const k = this.keys;
    const turn = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
    const tilt = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const zoom = (k.has('KeyQ') || k.has('Minus') || k.has('NumpadSubtract') ? 1 : 0) - (k.has('KeyE') || k.has('Equal') || k.has('NumpadAdd') ? 1 : 0);
    const lift = (k.has('KeyR') ? 1 : 0) - (k.has('KeyF') ? 1 : 0);
    const roll = (k.has('KeyZ') ? 1 : 0) - (k.has('KeyC') ? 1 : 0);
    if (turn || tilt || zoom || lift || roll) this.selfie = false;
    this.yaw += turn * dt * 1.6;
    this.pitch = clamp(this.pitch + tilt * dt * 1.1, -0.3, 1.45);
    this.dist = clamp(this.dist * Math.exp(zoom * dt * 1.4), 0.8, 16);
    this.height = clamp(this.height + lift * dt * 1.2, -0.45, 3);
    this.roll = clamp(this.roll + roll * dt * 0.7, -0.6, 0.6);

    const cam = this.hooks.camera;
    this.aim();
    if (this.selfie && this.hooks.head()) {
      // at paw's length in front of his face, a little above and to his right, looking back at him
      const head = this.hooks.head()!;
      head.getWorldPosition(this.target);
      const yaw = this.hooks.catYaw();
      cam.position.set(this.target.x + Math.sin(yaw) * 0.85 - Math.cos(yaw) * 0.2, this.target.y + 0.16, this.target.z + Math.cos(yaw) * 0.85 + Math.sin(yaw) * 0.2);
      this.target.y -= 0.08;
      cam.lookAt(this.target);
      this.curFov += (72 - this.curFov) * Math.min(1, dt * 8);
      cam.fov = this.curFov;
    } else {
      const ground = this.hooks.cat.position.y + 0.06;
      const horiz = Math.cos(this.pitch) * this.dist;
      cam.position.set(this.target.x + Math.sin(this.yaw) * horiz, Math.max(ground, this.target.y + Math.sin(this.pitch) * this.dist), this.target.z + Math.cos(this.yaw) * horiz);
      cam.lookAt(this.target);
      this.curFov += (this.fov - this.curFov) * Math.min(1, dt * 8);
      cam.fov = this.curFov;
    }
    if (this.roll) cam.rotateZ(this.roll);
    cam.updateProjectionMatrix();
  }

  private aim(): void {
    const p = this.hooks.cat.position;
    this.target.set(p.x, p.y + 0.55 + this.height, p.z);
  }

  // ---------------------------------------------------------------- UI
  private render(): void {
    for (const b of this.bar.querySelectorAll<HTMLButtonElement>('[data-pose]')) b.setAttribute('aria-pressed', String(Number(b.dataset.pose) === this.poseIdx));
    const t = this.hooks.getTime();
    for (const b of this.bar.querySelectorAll<HTMLButtonElement>('[data-time]')) b.setAttribute('aria-pressed', String(b.dataset.time === t));
    this.bar.querySelector('[data-act="look"]')!.textContent = `Look: ${LOOKS[this.look].label}`;
    this.bar.querySelector('[data-act="lens"]')!.textContent = `Lens: ${LENSES[this.lens][0]}`;
    this.bar.querySelector('[data-act="selfie"]')!.setAttribute('aria-pressed', String(this.selfie));
    this.bar.classList.toggle('is-car', !this.hooks.onFoot());
  }

  private onBarClick(e: MouseEvent): void {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.pose) this.setPose(Number(b.dataset.pose));
    else if (b.dataset.time) this.hooks.setTime(b.dataset.time as TimePreset);
    else {
      switch (b.dataset.act) {
        case 'look':
          this.look = (this.look + 1) % LOOKS.length;
          this.applyLook();
          break;
        case 'lens':
          this.lens = (this.lens + 1) % LENSES.length;
          this.fov = LENSES[this.lens][1];
          break;
        case 'selfie':
          this.toggleSelfie();
          break;
        case 'hide':
          this.setHidden(true);
          break;
        case 'snap':
          void this.save();
          break;
        case 'exit':
          this.exit();
          return;
      }
    }
    this.render();
  }

  private setPose(i: number): void {
    this.poseIdx = (i + POSES.length) % POSES.length;
    const p = POSES[this.poseIdx];
    this.hooks.pose(p.clip, p.at, !!p.phone);
    this.render();
  }

  private toggleSelfie(): void {
    this.selfie = !this.selfie;
    // a selfie is taken with the paws up holding the phone (the phone is the camera, so it isn't drawn)
    if (this.selfie) this.hooks.pose('Beg', 0.5, false);
    else this.setPose(this.poseIdx);
  }

  private applyLook(): void {
    const l = LOOKS[this.look];
    this.hooks.canvas.style.filter = l.css === 'none' ? '' : l.css;
    this.overlay.style.setProperty('--vignette', String(l.vignette));
  }

  private setHidden(on: boolean): void {
    this.hiddenUi = on;
    this.bar.classList.toggle('is-hidden', on);
    this.overlay.classList.toggle('is-hidden', on);
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.active) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    // Keep every key away from the game while the camera is up (it would steer Lou).
    e.stopPropagation();
    if (!down) {
      this.keys.delete(e.code);
      return;
    }
    if (e.repeat) return;
    switch (e.code) {
      case 'Escape':
      case 'Backspace':
        e.preventDefault();
        if (this.hiddenUi) this.setHidden(false);
        else this.exit();
        return;
      case 'Space':
      case 'Enter':
      case 'NumpadEnter':
        e.preventDefault();
        void this.save();
        return;
      case 'KeyH':
        this.setHidden(!this.hiddenUi);
        return;
      case 'KeyT': {
        const i = TIMES.findIndex(([t]) => t === this.hooks.getTime());
        this.hooks.setTime(TIMES[(i + 1) % TIMES.length][0]);
        this.render();
        return;
      }
      case 'KeyG':
        this.look = (this.look + 1) % LOOKS.length;
        this.applyLook();
        this.render();
        return;
      case 'KeyL':
        this.lens = (this.lens + 1) % LENSES.length;
        this.fov = LENSES[this.lens][1];
        this.render();
        return;
      case 'KeyX':
        this.toggleSelfie();
        this.render();
        return;
      case 'BracketLeft':
      case 'Comma':
        this.setPose(this.poseIdx - 1);
        return;
      case 'BracketRight':
      case 'Period':
        this.setPose(this.poseIdx + 1);
        return;
      case 'KeyP':
        // P puts the phone away: straight back to the game
        this.exit(false);
        return;
    }
    this.keys.add(e.code);
  }

  private setupPointer(): void {
    const o = this.overlay;
    o.addEventListener('pointerdown', (e) => {
      o.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.moved = false;
      if (this.pointers.size === 2) this.pinch = this.spread();
    });
    o.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.moved = true;
      if (this.pointers.size >= 2) {
        // two fingers: pinch zooms, moving them together raises / lowers the camera
        const s = this.spread();
        if (this.pinch > 0 && s > 0) this.dist = clamp(this.dist * (this.pinch / s), 0.8, 16);
        this.pinch = s;
        this.height = clamp(this.height + (dy / this.pointers.size) * 0.004, -0.45, 3);
        this.selfie = false;
        return;
      }
      if (e.shiftKey || e.buttons === 2) this.height = clamp(this.height + dy * 0.006, -0.45, 3);
      else {
        this.yaw -= dx * 0.006;
        this.pitch = clamp(this.pitch + dy * 0.005, -0.3, 1.45);
      }
      this.selfie = false;
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pinch = 0;
      // a tap with the UI hidden brings it back
      if (!this.moved && this.hiddenUi && e.type === 'pointerup') this.setHidden(false);
    };
    o.addEventListener('pointerup', up);
    o.addEventListener('pointercancel', up);
    o.addEventListener('contextmenu', (e) => e.preventDefault());
    o.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.shiftKey) this.height = clamp(this.height - e.deltaY * 0.002, -0.45, 3);
        else this.dist = clamp(this.dist * Math.exp(e.deltaY * 0.0012), 0.8, 16);
        this.selfie = false;
      },
      { passive: false }
    );
  }

  private spread(): number {
    const ps = [...this.pointers.values()];
    return ps.length < 2 ? 0 : Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
  }

  /** Controller: right stick orbits, triggers zoom, LB / RB change the pose, Y saves, X hides the UI. */
  private pollPad(dt: number): void {
    const pads = navigator.getGamepads?.() ?? [];
    const p = [...pads].find((x) => x && x.connected);
    if (!p) return;
    const pressed = p.buttons.map((b) => b.pressed || b.value > 0.5);
    const edge = (i: number) => !!pressed[i] && !this.prevPad[i];
    const curve = (v: number) => Math.sign(v) * Math.max(0, Math.abs(v) - 0.12) / 0.88;
    const rx = curve(p.axes[2] ?? 0);
    const ry = curve(p.axes[3] ?? 0);
    const zoom = (p.buttons[6]?.value ?? 0) - (p.buttons[7]?.value ?? 0);
    if (rx || ry || Math.abs(zoom) > 0.05) this.selfie = false;
    this.yaw -= rx * dt * 2.2;
    this.pitch = clamp(this.pitch + ry * dt * 1.4, -0.3, 1.45);
    this.dist = clamp(this.dist * Math.exp(zoom * dt * 1.5), 0.8, 16);
    if (edge(4)) this.setPose(this.poseIdx - 1);
    if (edge(5)) this.setPose(this.poseIdx + 1);
    if (edge(3)) void this.save();
    if (edge(2)) this.setHidden(!this.hiddenUi);
    this.prevPad = pressed;
  }

  // ---------------------------------------------------------------- save
  async save(): Promise<void> {
    const src = this.hooks.canvas;
    this.hooks.render(); // the drawing buffer is only readable in the same task it was drawn in
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const g = out.getContext('2d')!;
    const look = LOOKS[this.look];
    const native = 'filter' in g;
    if (look.css !== 'none' && native) g.filter = look.css;
    g.drawImage(src, 0, 0);
    g.filter = 'none';
    if (look.css !== 'none' && !native) applyMatrix(g, out.width, out.height, cssMatrix(look.css));
    const W = out.width;
    const H = out.height;
    if (look.vignette > 0) {
      const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.56);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(0,0,0,${look.vignette})`);
      g.fillStyle = v;
      g.fillRect(0, 0, W, H);
    }
    // a small caption, like a phone's photo stamp
    const zone = this.hooks.zone();
    const s = Math.max(12, Math.round(H * 0.022));
    g.font = `700 ${s}px system-ui, sans-serif`;
    g.textBaseline = 'bottom';
    g.shadowColor = 'rgba(0,0,0,0.85)';
    g.shadowBlur = s * 0.4;
    g.fillStyle = 'rgba(255,244,224,0.92)';
    g.textAlign = 'left';
    g.fillText(`📍 ${zone} · ${this.hooks.daylight()}`, s, H - s * 0.8);
    g.textAlign = 'right';
    g.fillStyle = 'rgba(255,214,140,0.85)';
    g.fillText('Shot on Lou’s phone · catsmoke.lou.zone', W - s, H - s * 0.8);
    this.hooks.shutter();
    this.flash.classList.remove('is-on');
    void this.flash.offsetWidth;
    this.flash.classList.add('is-on');
    const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) return this.hooks.toast('Could not save the photo');
    const d = new Date();
    const name = `lou-${slug(zone)}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}.jpg`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.hooks.toast(`📸 Saved ${name}`);
  }
}
