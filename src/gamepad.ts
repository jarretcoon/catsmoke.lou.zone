/**
 * Controller support (any "standard" gamepad: Xbox, PlayStation, Switch Pro, 8BitDo…). It presses the same keys
 * as the keyboard, so every action behaves exactly like its key.
 *
 *   Left stick   walk (all the way = sprint)        Right stick  camera
 *   A / ✕        jump                                B / ○        ride, hop off, bail (G)
 *   X / □        smoke; hold to rip a vape (E)       Y / △        gamble, shop, eat, VIP (F)
 *   LB           beg (B)                             RB           steal (Q)
 *   LT           pounce (C)                          RT           dance (X)
 *   D-pad        ← cig/vape  → flop  ↑ time of day  ↓ map size
 *   View/Select  goals (J)                           Menu/Start   pause menu
 *   Driving: left stick steers, RT gas, LT brake, A handbrake, B bail.
 *   Menus, shops, casino tables: D-pad / left stick moves, A presses, B backs out.
 *
 * Polls only while a controller is connected. Under the hood: synthetic KeyboardEvents on window, which is
 * exactly what main.ts listens to.
 */
export interface PadHooks {
  started(): boolean;
  driving(): boolean;
  orbit(dYaw: number, dPitch: number): void;
  openMenu(): void;
  /** The pad was used (true) or the keyboard / mouse took over again (false): swap the hints. */
  onActive(active: boolean): void;
}

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const FOOT: Record<number, string> = { [B.A]: 'Space', [B.B]: 'KeyG', [B.X]: 'KeyE', [B.Y]: 'KeyF', [B.LB]: 'KeyB', [B.RB]: 'KeyQ', [B.LT]: 'KeyC', [B.RT]: 'KeyX', [B.LEFT]: 'KeyV', [B.RIGHT]: 'KeyZ', [B.UP]: 'KeyT', [B.DOWN]: 'KeyM', [B.VIEW]: 'KeyJ' };
const CAR: Record<number, string> = { [B.A]: 'Space', [B.B]: 'KeyG', [B.RT]: 'KeyW', [B.LT]: 'KeyS', [B.X]: 'KeyH', [B.DOWN]: 'KeyM', [B.VIEW]: 'KeyJ' };

function key(type: 'keydown' | 'keyup', code: string): void {
  const k = code === 'Space' ? ' ' : code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
  window.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true }));
}

export class PadControls {
  private raf = 0;
  private last = 0;
  /** Keys this controller is holding down right now. */
  private held = new Set<string>();
  private prevButtons: boolean[] = [];
  private navCooldown = 0;
  private active = false;
  private focused: HTMLElement | null = null;

  constructor(private readonly hooks: PadHooks) {
    window.addEventListener('gamepadconnected', () => this.start());
    window.addEventListener('gamepaddisconnected', () => {
      if (!this.pad()) this.stop();
    });
    // Keyboard or mouse again: back to the keyboard hints.
    const human = () => this.setActive(false);
    window.addEventListener('keydown', (e) => e.isTrusted && human(), true);
    window.addEventListener('pointerdown', human, true);
    if (this.pad()) this.start();
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    let any: Gamepad | null = null;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (p.mapping === 'standard') return p;
      any ??= p;
    }
    return any;
  }

  private start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.poll(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.releaseAll();
    this.setActive(false);
  }

  private setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.hooks.onActive(on);
    if (!on) this.setFocus(null);
  }

  private hold(code: string, down: boolean): void {
    if (down === this.held.has(code)) return;
    if (down) this.held.add(code);
    else this.held.delete(code);
    key(down ? 'keydown' : 'keyup', code);
  }

  private releaseAll(): void {
    for (const c of [...this.held]) this.hold(c, false);
  }

  private poll(dt: number): void {
    const p = this.pad();
    if (!p) return;
    const pressed = p.buttons.map((b) => b.pressed || b.value > 0.5);
    const edge = (i: number) => !!pressed[i] && !this.prevButtons[i];
    const [lx = 0, ly = 0, rx = 0, ry = 0] = p.axes;
    const used = pressed.some(Boolean) || Math.hypot(lx, ly) > 0.3 || Math.hypot(rx, ry) > 0.3;
    if (used) this.setActive(true);
    if (document.hidden) {
      this.releaseAll();
      this.prevButtons = pressed;
      return;
    }

    const title = document.getElementById('title-screen');
    const intro = document.querySelector<HTMLElement>('.intro:not([hidden])');
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    const popover = [...document.querySelectorAll<HTMLElement>(':popover-open')].pop() ?? null;

    if (intro) {
      this.releaseAll();
      if (edge(B.A)) intro.click();
      if (edge(B.B) || edge(B.MENU)) key('keydown', 'Escape');
    } else if (title && !title.hidden) {
      this.releaseAll();
      if (edge(B.A) || edge(B.MENU)) {
        const cont = document.getElementById('btn-continue') as HTMLButtonElement | null;
        const fresh = document.getElementById('btn-new-game') as HTMLButtonElement | null;
        const btn = cont && !cont.hidden && !cont.disabled ? cont : fresh && !fresh.disabled ? fresh : null;
        btn?.click();
      }
    } else if (dialog || popover) {
      // A shop, a casino table, the pause menu, the goals list: move between buttons, A presses, B backs out.
      this.releaseAll();
      const box = dialog ?? popover!;
      this.navigate(box, dt, lx, ly, pressed);
      if (edge(B.A)) this.press();
      if (edge(B.B) || (edge(B.MENU) && !dialog)) {
        // requestClose() = what Esc does (the shop's own close handlers run); close() where it's missing.
        const d = dialog as (HTMLDialogElement & { requestClose?: () => void }) | null;
        if (d && typeof d.requestClose === 'function') d.requestClose();
        else if (d) d.close();
        else popover?.hidePopover();
        this.setFocus(null);
      }
      if (edge(B.VIEW) && popover?.id === 'goals-popover') popover.hidePopover();
    } else if (this.hooks.started()) {
      this.play(dt, pressed, edge, lx, ly, rx, ry);
    }
    this.prevButtons = pressed;
  }

  private play(dt: number, pressed: boolean[], edge: (i: number) => boolean, lx: number, ly: number, rx: number, ry: number): void {
    if (edge(B.MENU)) {
      this.releaseAll();
      this.hooks.openMenu();
      return;
    }
    const car = this.hooks.driving();
    const map = car ? CAR : FOOT;
    const want = new Set<string>();
    for (const [i, code] of Object.entries(map)) if (pressed[+i]) want.add(code);
    // Left stick: four keys (the game normalizes the diagonal); all the way out sprints.
    const dead = 0.38;
    if (lx < -dead) want.add('KeyA');
    if (lx > dead) want.add('KeyD');
    if (ly < -dead) want.add('KeyW');
    if (ly > dead) want.add('KeyS');
    if (!car && Math.hypot(lx, ly) > 0.92) want.add('ShiftLeft');
    if (pressed[B.L3]) want.add('ShiftLeft');
    for (const c of [...this.held]) if (!want.has(c)) this.hold(c, false);
    for (const c of want) this.hold(c, true);
    // Right stick: the camera, like dragging the mouse (a little curve for fine aim).
    const curve = (v: number) => {
      const a = Math.max(0, Math.abs(v) - 0.12) / 0.88;
      return Math.sign(v) * a * a;
    };
    const cx = curve(rx);
    const cy = curve(ry);
    if (cx || cy) this.hooks.orbit(-cx * dt * 3.2, cy * dt * 2.0);
  }

  // ---------------------------------------------------------------- menus
  private focusables(box: HTMLElement): HTMLElement[] {
    return [...box.querySelectorAll<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])')].filter((el) => {
      if ((el as HTMLButtonElement).disabled) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  private setFocus(el: HTMLElement | null): void {
    this.focused?.classList.remove('pad-focus');
    this.focused = el;
    if (!el) return;
    el.classList.add('pad-focus');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  }

  private navigate(box: HTMLElement, dt: number, lx: number, ly: number, pressed: boolean[]): void {
    const list = this.focusables(box);
    if (!list.length) return;
    if (!this.focused || !list.includes(this.focused)) this.setFocus(list.find((el) => el.hasAttribute('data-pad-first')) ?? list[0]);
    this.navCooldown -= dt;
    const dirX = pressed[B.LEFT] || lx < -0.5 ? -1 : pressed[B.RIGHT] || lx > 0.5 ? 1 : 0;
    const dirY = pressed[B.UP] || ly < -0.5 ? -1 : pressed[B.DOWN] || ly > 0.5 ? 1 : 0;
    if (!dirX && !dirY) {
      this.navCooldown = 0;
      return;
    }
    if (this.navCooldown > 0) return;
    this.navCooldown = 0.22;
    const cur = this.focused!;
    // A slider or a wager list: left / right change it.
    if (dirX && cur instanceof HTMLInputElement && cur.type === 'range') {
      if (dirX > 0) cur.stepUp();
      else cur.stepDown();
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (dirX && cur instanceof HTMLSelectElement) {
      // Skip options the game has switched off (VIP-only wagers before the VIP lounge).
      for (let i = cur.selectedIndex + dirX; i >= 0 && i < cur.options.length; i += dirX) {
        const o = cur.options[i];
        if (o.disabled || o.hidden) continue;
        cur.selectedIndex = i;
        cur.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
      return;
    }
    // Otherwise the nearest control in that direction (rows and grids both work).
    const from = cur.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - fx;
      const dy = r.top + r.height / 2 - fy;
      const along = dirX ? dx * dirX : dy * dirY;
      if (along <= 4) continue;
      const across = dirX ? Math.abs(dy) : Math.abs(dx);
      // Sideways stays in its row (nothing to the right of the last button); up / down may drift between columns.
      if (dirX && across > Math.max(12, along * 0.6)) continue;
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) this.setFocus(best);
  }

  private press(): void {
    const el = this.focused;
    if (!el) return;
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) el.click();
    else if (el instanceof HTMLButtonElement || el.getAttribute('role') === 'button') el.click();
    else el.focus();
  }
}
