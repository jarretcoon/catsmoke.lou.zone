/**
 * The on-screen HUD around the 3D view: no wall of buttons any more.
 *
 * Desktop: a small key-hint strip (clickable, hide with × or [K]), the context prompt with key chips, and a menu
 * (Esc or the Menu button) holding controls, goals, graphics, sound and Start Over. The game pauses while it's open.
 * Touch: the stick + Jump (main.ts), ONE context button that does whatever fits where Lou is (Ride near a ride,
 * Gamble / Shop / VIP near those, Beg near people, otherwise Smoke), and a menu button for everything else.
 *
 * Every action stays on its key exactly as before: the context button and the clickable hints just press that key.
 */
import type { GraphicsQuality, QualityChoice } from './quality';

export interface HudContext {
  /** The context prompt main.ts shows ('' when none), e.g. "Press [F] — Cosmo Neon Slots". */
  prompt: string;
  riding: boolean;
  driving: boolean;
  eating: boolean;
  vape: boolean;
}

export interface HudHooks {
  started(): boolean;
  context(): HudContext;
  /** Turn the camera (radians): the title screen slowly circles Lou. */
  orbit(dYaw: number, dPitch: number): void;
  graphics: GraphicsQuality;
  ambience: { readonly enabled: boolean; toggle(): boolean; setPaused(paused: boolean): void };
  sfx: { setPaused(paused: boolean): void };
}

const HINTS_KEY = 'smoking-cat-sim.keyhints';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const menuEl = () => document.getElementById('controls-popover');
let clickInMenu = false;

/**
 * True while the menu is open, so main.ts holds Lou still and freezes the clock (anyDialogOpen / step).
 * Not during a click inside the menu itself, so its buttons (Time of day, Mode, actions) still go through.
 */
export function menuOpen(): boolean {
  return !clickInMenu && !!menuEl()?.matches(':popover-open');
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* blocked storage: just don't remember */
  }
}
function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Press a game key the way the keyboard does, so every button runs exactly the keyboard's code path. */
function pressKey(code: string, phase: 'down' | 'up' | 'tap' = 'tap'): void {
  const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code;
  const init: KeyboardEventInit = { code, key, bubbles: true, cancelable: true };
  if (phase !== 'up') window.dispatchEvent(new KeyboardEvent('keydown', init));
  if (phase !== 'down') window.dispatchEvent(new KeyboardEvent('keyup', init));
}

interface Action {
  key: string;
  label: string;
  icon: string;
}

function fAction(p: string): Action {
  const a = (label: string, icon: string): Action => ({ key: 'KeyF', label, icon });
  if (/VIP Host/.test(p)) return a('VIP', '🥂');
  if (/mission/i.test(p)) return a('Mission', '⭐');
  if (/yard drink/i.test(p)) return a('Drink', '🍹');
  if (/ABC|boutique|swag|shop/i.test(p)) return a('Shop', '🛍️');
  if (/order|grab|claim|table|In-N-Out|Whataburger/i.test(p)) return a('Eat', '🍔');
  return a('Gamble', '🎰');
}

function gAction(c: HudContext): Action {
  if (c.driving) return { key: 'KeyG', label: 'Bail', icon: '🚪' };
  if (c.eating) return { key: 'KeyG', label: 'Get up', icon: '🪑' };
  if (c.riding) return { key: 'KeyG', label: 'Hop off', icon: '👋' };
  return { key: 'KeyG', label: 'Ride', icon: '🎢' };
}

const smoke = (c: HudContext): Action => (c.vape ? { key: 'KeyE', label: 'Vape', icon: '💨' } : { key: 'KeyE', label: 'Smoke', icon: '🚬' });

function actionForKey(k: string, c: HudContext): Action {
  switch (k) {
    case 'F':
      return fAction(c.prompt);
    case 'G':
      return gAction(c);
    case 'B':
      return /photo|pose/i.test(c.prompt) ? { key: 'KeyB', label: 'Pose', icon: '📸' } : { key: 'KeyB', label: 'Beg', icon: '🙏' };
    case 'Q':
      return { key: 'KeyQ', label: 'Steal', icon: '🫳' };
    case 'X':
      return { key: 'KeyX', label: 'Dance', icon: '💃' };
    case 'H':
      return { key: 'KeyH', label: 'Honk', icon: '📯' };
    case 'V':
      return { key: 'KeyV', label: 'Switch', icon: '🔁' };
    default:
      return /[1-4]/.test(k) ? { key: `Digit${k}`, label: 'Trick', icon: '✨' } : smoke(c);
  }
}

/** The one most useful action where Lou is: the first key the prompt asks for, else get off what he's on, else smoke. */
function contextAction(c: HudContext): Action {
  if (c.driving || c.eating || c.riding) return gAction(c);
  const m = /\[([A-Z0-9])\]/.exec(c.prompt);
  return m ? actionForKey(m[1], c) : smoke(c);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

export class Hud {
  private readonly root = $('game-root');
  private readonly touch = window.matchMedia('(pointer: coarse)').matches;
  private readonly menu = $('controls-popover');
  private readonly prompt = $('prompt-pill');
  private readonly promptView = $('prompt-view');
  private readonly hints = $('key-hints');
  private readonly ctxBtn = $<HTMLButtonElement>('hud-context');
  private readonly title = $('title-screen');
  private hintsOn = load(HINTS_KEY) !== 'off';
  private ctx: HudContext = { prompt: '', riding: false, driving: false, eating: false, vape: false };
  private ctxAction: Action | null = null;
  private heldKey: string | null = null;

  constructor(private readonly hooks: HudHooks) {
    this.root.classList.add(this.touch ? 'hud--touch' : 'hud--fine');
    this.adoptFloaters();
    this.trackTopHeight();
    this.setupTitle();
    this.setupMenu();
    this.setupHints();
    this.setupContextButton();
    this.setupKeys();
    this.setupFocusAndVisibility();
    new MutationObserver(() => this.renderPrompt()).observe(this.prompt, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
    this.decorateKeys($('toast-banner'));
    this.decorateKeys($('goal-tracker'));
    window.setInterval(() => this.refreshContext(), 200);
    this.refreshContext();
  }

  // ---------------------------------------------------------------- layout
  /** The Degen score and wanted stars are made by chaos.ts; seat them in the HUD columns so nothing overlaps. */
  private adoptFloaters(): void {
    const left = this.root.querySelector('.hud-left');
    const mission = this.root.querySelector('.mission-hud');
    if (mission) left?.append(mission);
    const degen = this.root.querySelector('.degen-hud');
    if (degen) left?.append(degen);
    const wanted = this.root.querySelector('.wanted-hud');
    if (wanted) this.root.querySelector('.hud-right')?.append(wanted);
  }

  /** Toasts and the mission banner sit under the top HUD, however tall it wraps. */
  private trackTopHeight(): void {
    const top = this.root.querySelector<HTMLElement>('.hud-top');
    if (!top) return;
    const set = () => this.root.style.setProperty('--hud-top-h', `${Math.round(top.getBoundingClientRect().bottom)}px`);
    new ResizeObserver(set).observe(top);
    set();
  }

  // ---------------------------------------------------------------- title screen
  private setupTitle(): void {
    const newGame = $<HTMLButtonElement>('btn-new-game');
    const cont = $<HTMLButtonElement>('btn-continue');
    const primary = () => (!cont.hidden && !cont.disabled ? cont : !newGame.disabled ? newGame : null);
    let drift = 0;
    let last = 0;
    const spin = (t: number) => {
      if (!this.root.classList.contains('is-title')) return;
      requestAnimationFrame(spin);
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      // A slow turn around Lou and the Welcome sign behind the title card.
      const d = dt * 0.07;
      drift += d;
      this.hooks.orbit(d, 0);
    };
    const sync = () => {
      const showing = !this.title.hidden;
      if (showing === this.root.classList.contains('is-title')) return;
      this.root.classList.toggle('is-title', showing);
      if (showing) {
        last = 0;
        requestAnimationFrame(spin);
      } else if (drift) {
        // Put the camera back where the game expects it (behind Lou on Continue).
        this.hooks.orbit(-drift, 0);
        drift = 0;
      }
    };
    new MutationObserver(sync).observe(this.title, { attributes: true, attributeFilter: ['hidden'] });
    this.root.classList.remove('is-title');
    sync();
    // Ready: focus the main button so Enter / Space start the game.
    new MutationObserver(() => {
      const p = primary();
      if (p && !this.title.hidden && document.activeElement === document.body) p.focus({ preventScroll: true });
      this.title.classList.toggle('is-ready', !!p);
    }).observe(newGame, { attributes: true, attributeFilter: ['disabled'] });
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.title.hidden || !e.isTrusted || (e.code !== 'Enter' && e.code !== 'NumpadEnter')) return;
        const p = primary();
        if (!p) return;
        e.preventDefault();
        p.click();
      },
      true
    );
  }

  // ---------------------------------------------------------------- menu
  private setupMenu(): void {
    const seg = $('quality-seg');
    const ambBtn = $<HTMLButtonElement>('btn-ambience');
    const hintsBtn = $<HTMLButtonElement>('btn-hints');
    const fsBtn = $<HTMLButtonElement>('btn-fullscreen');
    const g = this.hooks.graphics;

    const renderQuality = () => {
      for (const b of seg.querySelectorAll<HTMLButtonElement>('button[data-quality]')) {
        const q = b.dataset.quality as QualityChoice;
        const on = g.choice === q;
        b.setAttribute('aria-pressed', String(on));
        if (q === 'auto') b.textContent = g.choice === 'auto' ? g.label : 'Auto';
      }
      seg.title = `Graphics: ${g.label}`;
    };
    seg.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button[data-quality]');
      if (!b) return;
      g.choose(b.dataset.quality as QualityChoice);
    });
    g.onChange(renderQuality);

    const renderSettings = () => {
      renderQuality();
      ambBtn.innerHTML = `Background: ${this.hooks.ambience.enabled ? 'On' : 'Off'} <kbd>N</kbd>`;
      hintsBtn.innerHTML = `${this.hintsOn ? 'Shown' : 'Hidden'} <kbd>K</kbd>`;
      fsBtn.textContent = document.fullscreenElement ? 'Leave full screen' : 'Full screen';
    };
    ambBtn.addEventListener('click', () => {
      this.hooks.ambience.toggle();
      renderSettings();
    });
    hintsBtn.addEventListener('click', () => {
      this.setHints(!this.hintsOn);
      renderSettings();
    });
    if (!document.fullscreenEnabled) fsBtn.closest('.setting-row')?.setAttribute('hidden', '');
    fsBtn.addEventListener('click', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
    });
    document.addEventListener('fullscreenchange', renderSettings);

    // Clicks inside the menu go through to the game (menuOpen() is false during them); actions close it.
    this.menu.addEventListener('click', () => (clickInMenu = true), true);
    this.menu.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button');
      if (b?.dataset.key) pressKey(b.dataset.key);
      clickInMenu = false;
      if (b?.hasAttribute('data-close')) this.menu.hidePopover();
    });
    window.addEventListener('click', () => (clickInMenu = false));

    this.menu.addEventListener('toggle', (e) => {
      const open = (e as ToggleEvent).newState === 'open';
      this.root.classList.toggle('is-menu', open);
      if (open) {
        renderSettings();
        this.releaseHeld();
      } else if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        // Closing hands focus back to the Menu button; Space (jump) would then click it open again.
        document.activeElement.blur();
      }
    });
    renderSettings();
  }

  openMenu(): void {
    if (!this.menu.matches(':popover-open')) this.menu.showPopover();
  }

  // ---------------------------------------------------------------- key hints (desktop)
  private setupHints(): void {
    this.setHints(this.hintsOn);
    this.hints.addEventListener('pointerdown', (e) => e.preventDefault()); // don't take focus from the game
    this.hints.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button');
      if (!b) return;
      if (b.classList.contains('kh-close')) return this.setHints(false);
      if (b.hasAttribute('data-open-menu')) return this.openMenu();
      if (b.dataset.key) pressKey(b.dataset.key);
    });
  }

  private setHints(on: boolean): void {
    this.hintsOn = on;
    store(HINTS_KEY, on ? 'on' : 'off');
    this.hints.hidden = this.touch || !on;
  }

  // ---------------------------------------------------------------- context (touch button, prompt, hint highlight)
  private setupContextButton(): void {
    if (!this.touch) return;
    this.ctxBtn.hidden = false;
    // Hold works like holding the key: E held charges a vape rip.
    this.ctxBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const a = this.ctxAction;
      if (!a || !this.hooks.started()) return;
      this.ctxBtn.setPointerCapture(e.pointerId);
      this.ctxBtn.classList.add('is-down');
      if (a.key === 'KeyE') {
        this.heldKey = a.key;
        pressKey(a.key, 'down');
      } else pressKey(a.key);
    });
    const up = () => {
      this.ctxBtn.classList.remove('is-down');
      this.releaseHeld();
    };
    this.ctxBtn.addEventListener('pointerup', up);
    this.ctxBtn.addEventListener('pointercancel', up);
    this.ctxBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private releaseHeld(): void {
    if (this.heldKey) pressKey(this.heldKey, 'up');
    this.heldKey = null;
  }

  private refreshContext(): void {
    if (!this.hooks.started()) return;
    const c = this.hooks.context();
    const same = c.prompt === this.ctx.prompt && c.riding === this.ctx.riding && c.driving === this.ctx.driving && c.eating === this.ctx.eating && c.vape === this.ctx.vape;
    this.ctx = c;
    if (same && this.ctxAction) return;
    const a = contextAction(c);
    this.ctxAction = a;
    if (this.touch) {
      this.ctxBtn.querySelector('.hud-context-icon')!.textContent = a.icon;
      this.ctxBtn.querySelector('.hud-context-label')!.textContent = a.label;
      this.ctxBtn.dataset.kind = a.label.toLowerCase().replace(/\s+/g, '-');
      this.ctxBtn.setAttribute('aria-label', a.label);
    } else {
      const hot = c.prompt ? /\[([A-Z0-9])\]/.exec(c.prompt)?.[1] : undefined;
      for (const b of this.hints.querySelectorAll<HTMLButtonElement>('button[data-key]')) {
        const k = b.dataset.key!.slice(3);
        const label = b.querySelector('[data-label]');
        if (label && (k === 'E' || k === 'G' || k === 'F')) label.textContent = k === 'F' ? (hot === 'F' ? fAction(c.prompt).label : 'Use') : actionForKey(k, c).label;
        b.classList.toggle('is-hot', (hot === k && !c.riding) || (k === 'G' && (c.riding || c.driving || c.eating)));
      }
    }
    this.renderPrompt();
  }

  /** "[F]" in game text: a key chip with a keyboard, the context button's icon on touch (there are no keys). */
  private keysToHtml(text: string): string {
    if (!this.touch) return esc(text).replace(/\[([A-Z0-9])\]/g, '<kbd>$1</kbd>');
    const icon = (k: string) => `<span class="pp-icon">${actionForKey(k, { ...this.ctx, prompt: text }).icon}</span>`;
    const html = esc(text)
      .replace(/^Press \[([A-Z0-9])\] — /, (_, k: string) => `${icon(k)} `)
      .replace(/[Pp]ress \[([A-Z0-9])\]/g, (_, k: string) => `tap ${icon(k)}`)
      .replace(/\[([A-Z0-9])\]/g, (_, k: string) => icon(k));
    return html.charAt(0).toUpperCase() + html.slice(1);
  }

  /** Mirror main.ts's prompt through keysToHtml (main.ts compares its own text, so it keeps its plain copy). */
  private renderPrompt(): void {
    const text = this.prompt.hidden ? '' : (this.prompt.textContent ?? '');
    this.promptView.hidden = !text;
    if (!text) return;
    const html = this.touch && this.ctx.driving ? 'Driving a stolen car — the stick is gas and steering' : this.keysToHtml(text);
    if (this.promptView.innerHTML !== html) this.promptView.innerHTML = html;
  }

  /** Toasts and the goal line mention keys too ("Beg [B], steal [Q]…"): same treatment, in place. */
  private decorateKeys(el: HTMLElement | null): void {
    if (!el) return;
    const run = () => {
      const t = el.textContent ?? '';
      if (/\[[A-Z0-9]\]/.test(t) && !el.querySelector('kbd, .pp-icon')) el.innerHTML = this.keysToHtml(t);
    };
    new MutationObserver(run).observe(el, { childList: true, characterData: true, subtree: true });
    run();
  }

  // ---------------------------------------------------------------- keys
  private setupKeys(): void {
    // Capture phase: runs before main.ts's handler, so it can keep a key away from the game when it belongs to the menu.
    window.addEventListener(
      'keydown',
      (e) => {
        if (!e.isTrusted || !this.hooks.started()) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
        const open = this.menu.matches(':popover-open');
        if (open) {
          if (e.code === 'Slash') {
            e.preventDefault();
            e.stopPropagation();
            this.menu.hidePopover();
          }
          return; // Esc: the browser closes the top popover itself
        }
        if (document.querySelector('dialog[open]') || document.querySelector(':popover-open')) return;
        // A HUD button clicked earlier keeps focus; Space / Enter would click it again on top of the game's own action.
        const f = document.activeElement;
        if (f instanceof HTMLButtonElement && !f.closest('dialog, [popover]') && !(f.closest('#title-screen') && !this.title.hidden)) {
          f.blur();
          if (e.code === 'Space' || e.code === 'Enter') e.preventDefault();
        }
        if (e.code === 'Escape' && !e.repeat) {
          e.preventDefault();
          // Next task: opening it during this very keydown would let the same Esc close it again.
          window.setTimeout(() => this.openMenu(), 0);
        } else if (e.code === 'KeyK' && !e.repeat) {
          this.setHints(!this.hintsOn);
        }
      },
      true
    );
  }

  // ---------------------------------------------------------------- focus / visibility
  private setupFocusAndVisibility(): void {
    // The render loop already stops when the tab is hidden; this silences the sound too (the car engine, the casino).
    document.addEventListener('visibilitychange', () => {
      this.hooks.sfx.setPaused(document.hidden);
      this.hooks.ambience.setPaused(document.hidden);
      if (document.hidden) this.releaseHeld();
    });
    window.addEventListener('blur', () => this.releaseHeld());
  }
}
