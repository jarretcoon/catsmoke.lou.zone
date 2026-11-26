import type * as THREE from 'three';
import './phone.css';
import type { ClipName } from './catMotion';
import { GOALS } from './goals';
import type { MapFeature, MapMarker } from './minimap';
import { MISSIONS } from './missions';
import { PhotoMode, type PhotoHooks } from './phoneCamera';
import { type CatPin, StripMap } from './phoneMap';
import { PhoneProp } from './phoneProp';
import { CONTACTS, contactFor, MOM_REPLIES, QUICK_REPLIES, RIDE_RECEIPTS, TRIGGERS } from './phoneTexts';
import type { GameState } from './state';
import type { TimePreset } from './vegasWorld';

/**
 * Lou's smartphone. [P] on a keyboard, the phone button on touch, View / Select on a controller.
 *
 * It slides up over the game and the world keeps running; Lou sits up and holds it in his paws (phoneProp.ts)
 * and stays put until it's away. Apps: Map, Goals (+ missions), Camera (photo mode, phoneCamera.ts), Rides
 * (Waymo / Uber through the `catsmoke:hail` / `catsmoke:ride-status` events, so the rideshare code and this one
 * never import each other), Messages, Settings (the pause menu's settings).
 *
 * On a phone-sized screen the minimap and the Degen Points live in here instead of on the HUD.
 */

export interface PhoneHooks {
  started(): boolean;
  state(): GameState;
  zone(): string;
  daylight(): string;
  cat(): CatPin;
  features: MapFeature[];
  /** Everything the minimap shows (shops, missions, the Deuce…). */
  markers(): MapMarker[];
  stars(): number;
  /** A shop, a casino table or the pause menu is open: the phone stays in his pocket. */
  blocked(): boolean;
  onFoot(): boolean;
  /** Hold a clip on Lou (at = 0..1 freezes it), or release (null). */
  pose(clip: ClipName | null, at: number | null): void;
  model(): THREE.Object3D | null;
  toast(msg: string, ms?: number): void;
  sound(kind: 'open' | 'close' | 'text' | 'tap' | 'shutter'): void;
  getTime(): TimePreset;
  setTime(p: TimePreset): void;
  scene: THREE.Scene;
  photo: Pick<PhotoHooks, 'canvas' | 'camera' | 'cat' | 'catYaw' | 'render'>;
}

type AppId = 'map' | 'goals' | 'camera' | 'rides' | 'messages' | 'settings';
type Screen = 'lock' | 'home' | AppId;
type RideKind = 'waymo' | 'uber';
type RideState = 'requested' | 'arriving' | 'arrived' | 'riding' | 'done' | 'cancelled' | 'unavailable';

interface Msg {
  from: string;
  text: string;
  /** ms since epoch */
  t: number;
  me?: boolean;
}
interface Saved {
  msgs: Msg[];
  fired: string[];
  read: Record<string, number>;
}

const APPS: Array<{ id: AppId; label: string; icon: string; key: string }> = [
  { id: 'map', label: 'Map', icon: '🗺️', key: '1' },
  { id: 'goals', label: 'Goals', icon: '🏆', key: '2' },
  { id: 'camera', label: 'Camera', icon: '📷', key: '3' },
  { id: 'rides', label: 'Rides', icon: '🚘', key: '4' },
  { id: 'messages', label: 'Messages', icon: '💬', key: '5' },
  { id: 'settings', label: 'Settings', icon: '⚙️', key: '6' },
];
const TITLES: Record<AppId, string> = { map: 'Map', goals: 'Goals', camera: 'Camera', rides: 'Rides', messages: 'Messages', settings: 'Settings' };
const RIDES: Record<RideKind, { name: string; tag: string; blurb: string }> = {
  waymo: { name: 'Waymo', tag: 'Self-driving', blurb: 'Pulls up empty. No small talk, no questions about the smoke.' },
  uber: { name: 'Uber', tag: 'A real driver', blurb: 'A person drives. He will mention the fur.' },
};
const RIDE_TEXT: Record<RideState, string> = {
  requested: 'Finding you a car…',
  arriving: 'On the way to you',
  arrived: 'Your car is here',
  riding: 'On the way. Enjoy the Strip.',
  done: 'You’ve arrived',
  cancelled: 'Ride cancelled',
  unavailable: 'No cars nearby',
};
const STORE_KEY = 'smoking-cat-sim.phone';
const NO_ANSWER_MS = 2000;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const keysHtml = (s: string) => esc(s).replace(/\[([^\]]{1,9})\]/g, '<kbd>$1</kbd>');
const clock = (d = new Date()) => `${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')}`;
const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s % 60))).padStart(2, '0')}`;

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (Array.isArray(s.msgs) && Array.isArray(s.fired)) return { msgs: s.msgs, fired: s.fired, read: s.read ?? {} };
    }
  } catch {
    /* blocked or broken storage: a fresh phone */
  }
  return { msgs: [], fired: [], read: {} };
}

const CRACK_SVG = `<svg class="lp-crack" viewBox="0 0 120 120" aria-hidden="true"><g fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.8" stroke-linecap="round"><path d="M118 2 L96 20 L84 18 L70 34 L52 38 L40 58"/><path d="M96 20 L98 40 L88 56 L90 78"/><path d="M84 18 L76 6"/><path d="M70 34 L74 50 L62 64"/><path d="M98 40 L114 50"/><path d="M52 38 L44 30 L30 32"/><path d="M88 56 L104 66 L118 64"/></g><path d="M120 0 L104 0 L112 9 L120 12 Z" fill="rgba(255,255,255,0.22)"/><circle cx="104" cy="14" r="5" fill="rgba(255,255,255,0.12)"/></svg>`;

export class Phone {
  private readonly root = document.getElementById('game-root')!;
  private readonly el: HTMLElement;
  private readonly screen: HTMLElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly notif: HTMLButtonElement;
  private readonly btn: HTMLButtonElement;
  private readonly touch = window.matchMedia('(pointer: coarse)').matches;
  private readonly photo: PhotoMode;
  private readonly prop: PhoneProp;
  private propAttached = false;
  private current: Screen = 'home';
  private lastApp: Screen = 'home';
  private closedAt = -1e9;
  private lockTimer = 0;
  private closing = 0;
  private saved = loadSaved();
  private thread: string | null = null;
  private playT = 0;
  private triggerT = 0;
  private uiT = 0;
  private mapT = 0;
  private bannerT = 0;
  private notifT = 0;
  private map: StripMap | null = null;
  private widgetMap: StripMap | null = null;
  private goalsTab: 'goals' | 'missions' = 'goals';
  private ride: { kind: RideKind; state: RideState; eta: number; label: string; heard: boolean; at: number } | null = null;
  private noAnswer = 0;
  private missionSeen = '';

  constructor(private readonly hooks: PhoneHooks) {
    this.el = document.createElement('section');
    this.el.id = 'lou-phone';
    this.el.className = 'lou-phone';
    this.el.setAttribute('popover', 'manual');
    this.el.setAttribute('aria-label', 'Lou’s phone');
    this.el.innerHTML = `
      <div class="lp-case">
        <div class="lp-body">
          <div class="lp-screen" data-screen="home">
            <header class="lp-status">
              <span class="lp-clock">3:47</span>
              <span class="lp-island" aria-hidden="true"></span>
              <span class="lp-icons"><span class="lp-carrier">MEOW 5G</span><span class="lp-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="lp-batt" title="Cig / vape left"><i></i></span></span>
            </header>
            <div class="lp-lock">
              <p class="lp-lock-brand">LOU</p>
              <p class="lp-lock-time">3:47</p>
              <p class="lp-lock-date"></p>
              <ul class="lp-lock-notes"></ul>
              <p class="lp-lock-id"><span>😼</span> Purr ID</p>
            </div>
            <div class="lp-home">
              <div class="lp-widgets">
                <button type="button" class="lp-widget lp-widget--map" data-app="map" aria-label="Open the map"><canvas class="lp-mini"></canvas><span class="lp-widget-zone"></span></button>
                <button type="button" class="lp-widget lp-widget--degen" data-app="goals" aria-label="Degen Points and goals">
                  <span class="lp-w-label">Degen Points</span><strong class="lp-w-points">0</strong><span class="lp-w-rank"></span>
                  <span class="lp-w-cash"></span>
                </button>
              </div>
              <button type="button" class="lp-next" data-app="goals"></button>
              <button type="button" class="lp-texts" data-app="messages" aria-label="Messages"></button>
              <nav class="lp-apps" aria-label="Apps">
                ${APPS.map((a) => `<button type="button" class="lp-app-icon lp-app-icon--${a.id}" data-app="${a.id}"><span class="lp-icon" aria-hidden="true">${a.icon}</span><span class="lp-app-label">${a.label}</span><b class="lp-badge" hidden></b></button>`).join('')}
              </nav>
            </div>
            <div class="lp-app">
              <header class="lp-app-head"><button type="button" class="lp-back" aria-label="Back">‹</button><h2 class="lp-app-title"></h2><span class="lp-head-extra"></span></header>
              <div class="lp-app-body"></div>
            </div>
            <div class="lp-banner" hidden></div>
            ${CRACK_SVG}
            <button type="button" class="lp-homebar" aria-label="Home"></button>
          </div>
        </div>
      </div>
      <button type="button" class="lp-away" aria-label="Put the phone away">Put away <kbd>P</kbd></button>`;
    this.screen = this.el.querySelector('.lp-screen')!;
    this.body = this.el.querySelector('.lp-app-body')!;
    this.title = this.el.querySelector('.lp-app-title')!;
    this.banner = this.el.querySelector('.lp-banner')!;

    // the HUD's phone button (top-right on touch, beside Menu on desktop) and the closed-phone text pill
    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = 'hud-phone-btn';
    this.btn.setAttribute('aria-label', 'Phone (P)');
    this.btn.innerHTML = '<span class="hud-phone-icon" aria-hidden="true">📱</span><span class="hud-phone-text">Phone</span><b class="hud-phone-badge" hidden></b>';
    this.notif = document.createElement('button');
    this.notif.type = 'button';
    this.notif.className = 'phone-notif';
    this.notif.hidden = true;
    this.root.append(this.el, this.btn, this.notif);

    this.prop = new PhoneProp(hooks.scene);
    this.photo = new PhotoMode({
      ...hooks.photo,
      head: () => hooks.model()?.getObjectByName('Head') ?? null,
      getTime: hooks.getTime,
      setTime: hooks.setTime,
      zone: hooks.zone,
      daylight: hooks.daylight,
      pose: (clip, at, inPaw) => {
        this.photoPhone = inPaw;
        hooks.pose(clip, at);
      },
      onFoot: hooks.onFoot,
      shutter: () => hooks.sound('shutter'),
      toast: (m) => hooks.toast(m, 3200),
      onExit: (back) => {
        this.photoPhone = false;
        if (back) this.open('home');
      },
    });

    this.wire();
    this.renderBadges();
  }

  private photoPhone = false;

  // ---------------------------------------------------------------- state
  isOpen(): boolean {
    return this.el.matches(':popover-open');
  }

  /** Open or in photo mode: Lou's paws are busy (main.ts holds his input). */
  busy(): boolean {
    return this.isOpen() || this.photo.active;
  }

  /** New game: a clean phone (no old texts or ride). */
  reset(): void {
    this.saved = { msgs: [], fired: [], read: {} };
    this.ride = null;
    this.playT = 0;
    this.store();
    this.renderBadges();
  }

  private store(): void {
    try {
      if (this.saved.msgs.length > 80) this.saved.msgs.splice(0, this.saved.msgs.length - 80);
      localStorage.setItem(STORE_KEY, JSON.stringify(this.saved));
    } catch {
      /* blocked storage: the texts just don't survive a reload */
    }
  }

  // ---------------------------------------------------------------- open / close
  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open();
  }

  open(to?: Screen): void {
    if (!this.hooks.started() || this.photo.active) return;
    if (this.hooks.blocked() && !this.isOpen()) return;
    window.clearTimeout(this.closing);
    this.el.classList.remove('is-closing');
    const fresh = !this.isOpen();
    if (fresh) {
      this.el.showPopover();
      this.hooks.sound('open');
      this.notif.hidden = true;
    }
    if (this.hooks.onFoot()) this.hooks.pose('Beg', 0.5);
    this.root.classList.add('is-phone');
    // A quick look at the lock screen when it's been away a while; otherwise straight back where you were.
    const away = performance.now() - this.closedAt > 30000;
    const target = to ?? (away ? 'home' : this.lastApp);
    if (fresh && away && !to) {
      this.show('lock');
      window.clearTimeout(this.lockTimer);
      this.lockTimer = window.setTimeout(() => this.current === 'lock' && this.show(target), 750);
    } else this.show(target);
  }

  close(): void {
    if (!this.isOpen()) return;
    window.clearTimeout(this.lockTimer);
    this.lastApp = this.current === 'lock' ? 'home' : this.current;
    this.closedAt = performance.now();
    this.hooks.pose(null, null);
    this.root.classList.remove('is-phone');
    this.hooks.sound('close');
    this.el.classList.add('is-closing');
    this.closing = window.setTimeout(() => {
      this.el.classList.remove('is-closing');
      if (this.isOpen()) this.el.hidePopover();
    }, 170);
    const f = document.activeElement;
    if (f instanceof HTMLElement && this.el.contains(f)) f.blur();
  }

  private back(): void {
    if (this.current === 'messages' && this.thread) {
      this.thread = null;
      this.renderApp();
    } else if (this.current === 'home' || this.current === 'lock') this.close();
    else this.show('home');
  }

  private show(s: Screen): void {
    if (s === 'camera') {
      // the camera takes over the whole screen: the phone slides away
      this.lastApp = 'home';
      this.close();
      window.setTimeout(() => this.photo.enter(), 180);
      return;
    }
    if (s === 'settings') {
      this.close();
      window.setTimeout(() => {
        const menu = document.getElementById('controls-popover');
        menu?.showPopover();
        document.getElementById('menu-settings-h')?.scrollIntoView({ block: 'start' });
      }, 180);
      return;
    }
    this.current = s;
    this.screen.dataset.screen = s === 'lock' || s === 'home' ? s : 'app';
    if (s === 'lock') this.renderLock();
    else if (s === 'home') this.renderHome();
    else {
      this.title.textContent = TITLES[s];
      this.renderApp();
    }
    this.renderStatus();
  }

  // ---------------------------------------------------------------- wiring
  private wire(): void {
    this.btn.addEventListener('click', () => this.toggle());
    this.btn.addEventListener('pointerdown', (e) => e.preventDefault());
    this.notif.addEventListener('click', () => {
      this.notif.hidden = true;
      this.open(this.notif.dataset.go === 'rides' ? 'rides' : 'messages');
    });
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-open-phone]')) {
      b.addEventListener('click', () => {
        document.getElementById('controls-popover')?.hidePopover();
        window.setTimeout(() => this.open(), 0);
      });
    }
    this.el.addEventListener('click', (e) => {
      const t = e.target as Element;
      if (this.current === 'lock') {
        this.show('home');
        return;
      }
      const b = t.closest<HTMLButtonElement>('button');
      if (!b) return;
      if (b.classList.contains('lp-away')) return this.close();
      if (b.classList.contains('lp-homebar')) return this.current === 'home' ? this.close() : this.show('home');
      if (b.classList.contains('lp-back')) return this.back();
      if (b.dataset.app) {
        this.hooks.sound('tap');
        return this.show(b.dataset.app as AppId);
      }
      this.onAppClick(b);
    });
    // pointer events inside the phone don't reach the canvas (no camera drag through the phone)
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    // Hidden by the controller's B (it closes the top popover): tidy up like Put away.
    this.el.addEventListener('toggle', (e) => {
      if ((e as ToggleEvent).newState === 'closed' && this.root.classList.contains('is-phone')) {
        this.lastApp = this.current === 'lock' ? 'home' : this.current;
        this.closedAt = performance.now();
        this.hooks.pose(null, null);
        this.root.classList.remove('is-phone');
      }
    });
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('catsmoke:ride-status', (e) => this.onRideStatus(e as CustomEvent));
    // Switching away (alt-tab, another tab, the phone's home button) pauses the game into its menu, but hud.ts
    // leaves it be while a popover is up: put the phone away first, then pause like it would.
    const away = () => {
      if (navigator.webdriver) return;
      if (this.photo.active) this.photo.exit(false);
      else if (this.isOpen()) this.close();
      else return;
      window.setTimeout(() => {
        if (this.hooks.started() && !document.querySelector('dialog[open]') && !document.querySelector(':popover-open')) document.getElementById('controls-popover')?.showPopover();
      }, 220);
    };
    window.addEventListener('blur', away);
    document.addEventListener('visibilitychange', () => document.hidden && away());
    // Mission givers text Lou their lines: the mission dialog (missions.ts) is mirrored into Messages.
    const watch = () => {
      const d = this.root.querySelector<HTMLElement>('.mission-dialog');
      if (!d) return false;
      new MutationObserver(() => {
        if (d.hidden) return;
        const who = d.querySelector('strong')?.textContent?.trim();
        const text = d.querySelector('p')?.textContent?.trim();
        if (!who || !text || `${who}|${text}` === this.missionSeen) return;
        this.missionSeen = `${who}|${text}`;
        this.text(contactFor(who), text, true);
      }).observe(d, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
      return true;
    };
    if (!watch()) window.setTimeout(watch, 0);
  }

  private onKey(e: KeyboardEvent): void {
    if (!e.isTrusted && e.code !== 'KeyP') return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    if (this.photo.active) return; // photo mode has its own keys
    const open = this.isOpen();
    if (!open) {
      if (e.code !== 'KeyP' || e.repeat || !this.hooks.started()) return;
      if (document.querySelector('dialog[open]') || document.querySelector(':popover-open')) return;
      e.preventDefault();
      e.stopPropagation();
      this.open();
      return;
    }
    // Open: the phone's keys; everything else is held away from the game (Lou's paws are busy).
    if (e.repeat && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Equal', 'Minus'].includes(e.code)) return;
    if (e.code === 'KeyP') {
      e.preventDefault();
      e.stopPropagation();
      return this.close();
    }
    if (e.code === 'Escape' || e.code === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      return this.back();
    }
    if (this.current === 'lock') {
      e.stopPropagation();
      return this.show('home');
    }
    if (this.current === 'home' && /^Digit[1-6]$/.test(e.code)) {
      e.stopPropagation();
      return this.show(APPS[Number(e.code.slice(5)) - 1].id);
    }
    if (this.current === 'map' && this.map) {
      const step = 60;
      const pan: Record<string, [number, number]> = { ArrowLeft: [step, 0], KeyA: [step, 0], ArrowRight: [-step, 0], KeyD: [-step, 0], ArrowUp: [0, step], KeyW: [0, step], ArrowDown: [0, -step], KeyS: [0, -step] };
      if (pan[e.code]) {
        e.preventDefault();
        this.map.pan(...pan[e.code]);
      } else if (e.code === 'Equal' || e.code === 'NumpadAdd') this.map.zoomAt(0.75);
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.map.zoomAt(1.33);
      else if (e.code === 'KeyC') this.centerMap();
      e.stopPropagation();
    }
  }

  // ---------------------------------------------------------------- per frame (from main.ts's loop)
  /** Returns the HUD's State line while the phone has Lou's attention, else null. */
  update(dt: number): string | null {
    const model = this.hooks.model();
    if (model && !this.propAttached) {
      this.prop.attach(model);
      this.propAttached = true;
    }
    const open = this.isOpen();
    const onFoot = this.hooks.onFoot();
    const cat = this.hooks.cat();
    this.prop.update((open || (this.photo.active && this.photoPhone)) && onFoot && !!model, this.hooks.photo.cat, cat.yaw);

    if (this.hooks.started()) {
      this.playT += dt;
      this.triggerT += dt;
      if (this.triggerT > 1) {
        this.triggerT = 0;
        this.checkTriggers();
      }
    }
    if (this.ride && this.ride.state === 'arriving' && this.ride.eta > 0) this.ride.eta = Math.max(0, this.ride.eta - dt);
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) this.banner.hidden = true;
    if (this.notifT > 0 && (this.notifT -= dt) <= 0) this.notif.hidden = true;

    if (open) {
      this.uiT += dt;
      if (this.uiT > 0.5) {
        this.uiT = 0;
        this.renderStatus();
        if (this.current === 'home') this.renderHomeLive();
        else if (this.current === 'rides') this.renderRideStatus();
        else if (this.current === 'goals' && this.goalsTab === 'missions') this.renderMissionLive();
      }
      this.mapT += dt;
      if (this.mapT > 1 / 30) {
        const t = performance.now() / 1000;
        if (this.current === 'map' && this.map) this.map.draw(cat, this.hooks.markers(), t);
        else if (this.current === 'home' && this.widgetMap && this.mapT > 0.12) this.widgetMap.draw(cat, this.hooks.markers(), t, { compact: true });
        else return this.stateLine(open, onFoot);
        this.mapT = 0;
      }
    }
    return this.stateLine(open, onFoot);
  }

  private stateLine(open: boolean, onFoot: boolean): string | null {
    if (this.photo.active) return onFoot ? 'Posing' : null;
    if (!open || !onFoot) return null;
    return this.current === 'messages' ? 'Texting' : this.current === 'map' ? 'Checking the map' : this.current === 'rides' ? 'Hailing a ride' : 'On the phone';
  }

  /** Photo mode takes the camera after main.ts has placed it. */
  camera(dt: number): void {
    this.photo.update(dt);
  }

  get photoActive(): boolean {
    return this.photo.active;
  }

  // ---------------------------------------------------------------- texts
  private text(from: string, text: string, quiet = false): void {
    this.saved.msgs.push({ from, text, t: Date.now() });
    this.store();
    this.renderBadges();
    const c = CONTACTS[from] ?? { name: from, avatar: '💬', color: '#999' };
    if (this.isOpen()) {
      if (this.current === 'messages' && (this.thread === from || !this.thread)) this.renderApp();
      else this.flashBanner(`${c.avatar} <b>${esc(c.name)}</b> ${esc(text)}`);
    } else if (!quiet || !this.root.querySelector('.mission-dialog:not([hidden])')) {
      this.popNotif(`${c.avatar} <b>${esc(c.name)}</b> <span>${esc(text)}</span>`, 'messages');
    }
    this.hooks.sound('text');
  }

  private checkTriggers(): void {
    const s = this.hooks.state();
    const zone = this.hooks.zone();
    const stars = this.hooks.stars();
    // one at a time, a few seconds apart, so they read like texts and not a wall
    if (this.playT - this.lastTextAt < 6) return;
    for (const tr of TRIGGERS) {
      if (this.saved.fired.includes(tr.id)) continue;
      if (!tr.when(s, zone, this.playT, stars)) continue;
      this.saved.fired.push(tr.id);
      this.lastTextAt = this.playT;
      this.text(tr.from, typeof tr.text === 'function' ? tr.text(s, zone) : tr.text);
      return;
    }
  }
  private lastTextAt = -1e9;

  private unread(from?: string): number {
    let n = 0;
    for (const m of this.saved.msgs) if (!m.me && (!from || m.from === from) && m.t > (this.saved.read[m.from] ?? 0)) n++;
    return n;
  }

  private renderBadges(): void {
    const n = this.unread();
    const b = this.btn.querySelector<HTMLElement>('.hud-phone-badge')!;
    b.hidden = n === 0;
    b.textContent = String(n);
    const ab = this.el.querySelector<HTMLElement>('.lp-app-icon--messages .lp-badge')!;
    ab.hidden = n === 0;
    ab.textContent = String(n);
  }

  private popNotif(html: string, go: 'messages' | 'rides'): void {
    this.notif.innerHTML = html;
    this.notif.dataset.go = go;
    this.notif.hidden = false;
    this.notif.classList.remove('is-in');
    void this.notif.offsetWidth;
    this.notif.classList.add('is-in');
    this.notifT = 4.5;
  }

  private flashBanner(html: string): void {
    this.banner.innerHTML = html;
    this.banner.hidden = false;
    this.bannerT = 3.2;
  }

  // ---------------------------------------------------------------- rides
  private hail(kind: RideKind): void {
    this.ride = { kind, state: 'requested', eta: 0, label: '', heard: false, at: performance.now() };
    window.clearTimeout(this.noAnswer);
    window.dispatchEvent(new CustomEvent('catsmoke:hail', { detail: { kind } }));
    // Nobody answered (no rideshare in this build, or no cars): say so instead of spinning forever.
    this.noAnswer = window.setTimeout(() => {
      if (this.ride && !this.ride.heard && this.ride.kind === kind) {
        this.ride.state = 'unavailable';
        this.renderRideStatus();
      }
    }, NO_ANSWER_MS);
    this.renderRideStatus();
  }

  private onRideStatus(e: CustomEvent): void {
    const d = (e.detail ?? {}) as { kind?: string; state?: string; etaSeconds?: number; label?: string };
    const kind: RideKind = d.kind === 'uber' ? 'uber' : 'waymo';
    const state = d.state as RideState;
    if (!(state in RIDE_TEXT)) return;
    const prev = this.ride;
    this.ride = { kind, state, eta: typeof d.etaSeconds === 'number' ? d.etaSeconds : prev?.kind === kind ? prev.eta : 0, label: d.label ?? (prev?.kind === kind ? prev.label : ''), heard: true, at: prev?.at ?? performance.now() };
    if (state !== 'requested') window.clearTimeout(this.noAnswer);
    if (this.isOpen() && this.current === 'rides') this.renderRideStatus();
    else if (!prev || prev.state !== state) {
      const name = RIDES[kind].name;
      const line = state === 'arriving' && this.ride.eta ? `${RIDE_TEXT[state]} · ${mmss(this.ride.eta)}` : RIDE_TEXT[state];
      if (this.isOpen()) this.flashBanner(`🚘 <b>${name}</b> ${esc(line)}`);
      else this.popNotif(`🚘 <b>${name}</b> <span>${esc(line)}</span>`, 'rides');
    }
    if (state === 'done' && prev?.state !== 'done') {
      const r = RIDE_RECEIPTS[kind];
      window.setTimeout(() => this.text(kind, r[Math.floor(Math.random() * r.length)]), 1800);
    }
  }

  // ---------------------------------------------------------------- screens
  private renderStatus(): void {
    const s = this.hooks.state();
    const lvl = s.deviceMode === 'cig' ? (s.isLit ? s.cigBurn : 0) : s.vapeJuice;
    const t = clock();
    this.el.querySelector('.lp-clock')!.textContent = t;
    const b = this.el.querySelector<HTMLElement>('.lp-batt i')!;
    b.style.width = `${Math.max(4, Math.min(100, lvl))}%`;
    b.classList.toggle('is-low', lvl < 20);
    if (this.current === 'lock') this.el.querySelector('.lp-lock-time')!.textContent = t;
  }

  private renderLock(): void {
    const d = new Date();
    this.el.querySelector('.lp-lock-time')!.textContent = clock(d);
    this.el.querySelector('.lp-lock-date')!.textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const unread = this.saved.msgs.filter((m) => !m.me && m.t > (this.saved.read[m.from] ?? 0)).slice(-3).reverse();
    this.el.querySelector('.lp-lock-notes')!.innerHTML = unread
      .map((m) => {
        const c = CONTACTS[m.from] ?? { name: m.from, avatar: '💬' };
        return `<li><span class="lp-note-av">${c.avatar}</span><span><b>${esc(c.name)}</b>${esc(m.text)}</span></li>`;
      })
      .join('');
  }

  private renderHome(): void {
    const canvas = this.el.querySelector<HTMLCanvasElement>('.lp-mini')!;
    this.widgetMap ??= new StripMap(canvas, this.hooks.features);
    this.widgetMap.mpp = 0.9;
    this.widgetMap.follow = true;
    requestAnimationFrame(() => {
      if (this.widgetMap?.fit()) this.widgetMap.draw(this.hooks.cat(), this.hooks.markers(), performance.now() / 1000, { compact: true });
    });
    this.renderHomeLive();
    this.renderBadges();
  }

  private renderHomeLive(): void {
    const s = this.hooks.state();
    const pts = document.querySelector('.degen-hud .degen-points')?.textContent ?? s.stats.degenPoints.toLocaleString();
    const rank = document.querySelector('.degen-hud .degen-rank')?.textContent ?? '';
    this.el.querySelector('.lp-w-points')!.textContent = pts;
    this.el.querySelector('.lp-w-rank')!.textContent = rank;
    this.el.querySelector('.lp-w-cash')!.textContent = `$${s.cash.toLocaleString()} · ${s.cigStash} smokes`;
    this.el.querySelector('.lp-widget-zone')!.textContent = this.hooks.zone();
    const next = GOALS.find((g) => !s.goalsDone.includes(g.id));
    const nextEl = this.el.querySelector<HTMLElement>('.lp-next')!;
    const html = next ? `<span class="lp-next-k">Next goal</span><b>${esc(next.title)}</b><span>${keysHtml(next.hint)} · +$${next.reward}</span>` : '<span class="lp-next-k">Goals</span><b>All done. You own this Strip.</b>';
    if (nextEl.innerHTML !== html) nextEl.innerHTML = html;
    // the last couple of texts, like a lock-screen stack
    const recent = this.saved.msgs.filter((m) => !m.me).slice(-2).reverse();
    const textsEl = this.el.querySelector<HTMLElement>('.lp-texts')!;
    const th = recent.length
      ? `<span class="lp-next-k">Texts</span>${recent
          .map((m) => {
            const c = CONTACTS[m.from] ?? { name: m.from, avatar: '💬', color: '#999' };
            const unread = m.t > (this.saved.read[m.from] ?? 0);
            return `<span class="lp-tx${unread ? ' is-new' : ''}"><span class="lp-av lp-av--xs" style="--c:${c.color}">${c.avatar}</span><span class="lp-tx-text"><b>${esc(c.name)}</b>${esc(m.text)}</span><time>${ago(m.t)}</time></span>`;
          })
          .join('')}`
      : '<span class="lp-next-k">Texts</span><span class="lp-tx-none">Nobody’s texted yet. Give it a minute.</span>';
    if (textsEl.innerHTML !== th) textsEl.innerHTML = th;
  }

  private renderApp(): void {
    const extra = this.el.querySelector<HTMLElement>('.lp-head-extra')!;
    extra.innerHTML = '';
    this.body.className = `lp-app-body lp-app-body--${this.current}`;
    switch (this.current) {
      case 'map':
        return this.renderMap();
      case 'goals':
        return this.renderGoals();
      case 'rides':
        return this.renderRides();
      case 'messages':
        return this.renderMessages();
      default:
        this.body.innerHTML = '';
    }
  }

  // ---- Map
  private renderMap(focus?: { x: number; z: number }): void {
    this.body.innerHTML = `
      <canvas class="lp-map" aria-label="Map of the Strip"></canvas>
      <div class="lp-map-tools">
        <button type="button" data-map="in" aria-label="Zoom in">＋</button>
        <button type="button" data-map="out" aria-label="Zoom out">－</button>
        <button type="button" data-map="lou" aria-label="Center on Lou">◎</button>
        <button type="button" data-map="all" aria-label="The whole Strip">⇕</button>
      </div>
      <div class="lp-map-legend"><span><i style="background:#ff9a3c"></i>Lou</span><span><i style="background:#ffd24d"></i>Mission</span><span><i style="background:#5cff8a"></i>Target</span><span><i style="background:#ffcc33;border-radius:2px"></i>Deuce</span></div>`;
    const canvas = this.body.querySelector<HTMLCanvasElement>('.lp-map')!;
    const prev = this.map;
    this.map = new StripMap(canvas, this.hooks.features);
    if (prev) {
      this.map.mpp = prev.mpp;
      this.map.follow = prev.follow;
      this.map.cx = prev.cx;
      this.map.cz = prev.cz;
    }
    if (focus) {
      this.map.follow = false;
      this.map.centerOn(focus.x, focus.z, 0.5);
    }
    requestAnimationFrame(() => this.map?.fit());
    const m = this.map;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const s = Math.hypot(a.x - b.x, a.y - b.y);
        const r = canvas.getBoundingClientRect();
        if (pinch > 0 && s > 0) m.zoomAt(pinch / s, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        pinch = s;
      } else m.pan(dx, dy);
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        m.zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false }
    );
  }

  private centerMap(): void {
    if (!this.map) return;
    const c = this.hooks.cat();
    this.map.follow = true;
    this.map.centerOn(c.x, c.z);
  }

  // ---- Goals + missions
  private renderGoals(): void {
    const s = this.hooks.state();
    const done = GOALS.filter((g) => s.goalsDone.includes(g.id)).length;
    const next = GOALS.find((g) => !s.goalsDone.includes(g.id));
    const tab = this.goalsTab;
    const goals = GOALS.map((g) => {
      const ok = s.goalsDone.includes(g.id);
      const cls = ok ? 'is-done' : g === next ? 'is-next' : '';
      return `<li class="lp-goal ${cls}"><span class="lp-goal-tick">${ok ? '✓' : g === next ? '★' : ''}</span><span class="lp-goal-text"><b>${esc(g.title)}</b><span>${keysHtml(g.hint)}</span></span><span class="lp-goal-pay">+$${g.reward}</span></li>`;
    }).join('');
    const doneM = s.stats.missionsDone;
    const cat = this.hooks.cat();
    const dirTo = (x: number, z: number) => {
      const d = Math.hypot(x - cat.x, z - cat.z);
      const dir = Math.abs(z - cat.z) > Math.abs(x - cat.x) ? (z < cat.z ? 'north' : 'south') : x < cat.x ? 'west' : 'east';
      return d < 15 ? 'right here' : `${d > 999 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`} ${dir}`;
    };
    const avail = MISSIONS.filter((m) => !doneM.includes(m.id) && (!m.after || doneM.includes(m.after)));
    const locked = MISSIONS.filter((m) => !doneM.includes(m.id) && m.after && !doneM.includes(m.after));
    const missionList = `
      <div class="lp-mission-live"></div>
      <h3 class="lp-sub">Available <span>${avail.length}</span></h3>
      <ul class="lp-missions">${avail.map((m) => `<li><span class="lp-m-bang">!</span><span class="lp-m-text"><b>${esc(m.title)}</b><span>${esc(m.giver)} · ${dirTo(m.at[0], m.at[1])}</span></span><button type="button" class="lp-mini-btn" data-show="${m.id}">Map</button></li>`).join('') || '<li class="lp-empty">Nothing new right now. Finish what you started.</li>'}</ul>
      ${locked.length ? `<h3 class="lp-sub">Later <span>${locked.length}</span></h3><ul class="lp-missions lp-missions--locked">${locked.map((m) => `<li><span class="lp-m-bang">🔒</span><span class="lp-m-text"><b>${esc(m.title)}</b><span>after ${esc(MISSIONS.find((x) => x.id === m.after)?.title ?? '')}</span></span></li>`).join('')}</ul>` : ''}
      ${doneM.length ? `<h3 class="lp-sub">Passed <span>${doneM.length}</span></h3><ul class="lp-missions lp-missions--done">${MISSIONS.filter((m) => doneM.includes(m.id)).map((m) => `<li><span class="lp-m-bang">✓</span><span class="lp-m-text"><b>${esc(m.title)}</b><span>+$${m.reward.cash}</span></span></li>`).join('')}</ul>` : ''}`;
    this.body.innerHTML = `
      <div class="lp-tabs" role="tablist"><button type="button" role="tab" data-tab="goals" aria-selected="${tab === 'goals'}">Goals</button><button type="button" role="tab" data-tab="missions" aria-selected="${tab === 'missions'}">Missions</button></div>
      ${
        tab === 'goals'
          ? `<div class="lp-progress"><span><b>${done}</b> of ${GOALS.length} done</span><span>$${GOALS.filter((g) => s.goalsDone.includes(g.id)).reduce((a, g) => a + g.reward, 0)} earned</span><i style="--p:${(done / GOALS.length) * 100}%"></i></div><ol class="lp-goals">${goals}</ol>`
          : missionList
      }`;
    if (tab === 'missions') this.renderMissionLive();
  }

  private renderMissionLive(): void {
    const box = this.body.querySelector<HTMLElement>('.lp-mission-live');
    if (!box) return;
    const hud = this.root.querySelector<HTMLElement>('.mission-hud');
    const on = !!hud && !hud.hidden;
    const html = on
      ? `<p class="lp-sub-k">Now playing</p><b>${esc(hud!.querySelector('b')?.textContent ?? '')}</b><span>${keysHtml(hud!.querySelector('span')?.textContent ?? '')}</span>`
      : '<p class="lp-sub-k">No mission running</p><span>Walk into a gold <b>!</b> marker and press <kbd>F</kbd> to start one.</span>';
    box.classList.toggle('is-on', on);
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // ---- Rides
  private renderRides(): void {
    this.body.innerHTML = `
      <p class="lp-ride-intro">Get a car to come to you. Stand by the curb on the Strip.</p>
      ${(['waymo', 'uber'] as RideKind[])
        .map(
          (k) => `<div class="lp-ride lp-ride--${k}">
            <div class="lp-ride-art" aria-hidden="true"><span class="lp-car"></span></div>
            <div class="lp-ride-text"><b>${RIDES[k].name}</b><span class="lp-ride-tag">${RIDES[k].tag}</span><span>${RIDES[k].blurb}</span></div>
            <button type="button" class="lp-hail" data-hail="${k}">Hail</button>
          </div>`
        )
        .join('')}
      <div class="lp-ride-status" aria-live="polite"></div>`;
    this.renderRideStatus();
  }

  private renderRideStatus(): void {
    const box = this.body.querySelector<HTMLElement>('.lp-ride-status');
    if (!box) return;
    const r = this.ride;
    for (const b of this.body.querySelectorAll<HTMLButtonElement>('[data-hail]')) b.disabled = !!r && !['done', 'cancelled', 'unavailable'].includes(r.state);
    if (!r) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const name = RIDES[r.kind].name;
    const steps: RideState[] = ['requested', 'arriving', 'arrived', 'riding', 'done'];
    const at = steps.indexOf(r.state);
    const sub =
      r.state === 'arriving' && r.eta > 0
        ? `Arriving in <b>${mmss(r.eta)}</b>`
        : r.state === 'arrived'
          ? this.touch
            ? 'Walk up to it and tap <b>Ride</b>'
            : 'Walk up to it and press <kbd>G</kbd>'
          : r.state === 'unavailable'
            ? 'Nothing answered. Try again from the Strip itself.'
            : r.state === 'requested'
              ? '<span class="lp-spin" aria-hidden="true"></span> Asking nearby cars'
              : '';
    box.dataset.state = r.state;
    const html = `
      <p class="lp-rs-head"><b>${name}</b> · ${RIDE_TEXT[r.state]}</p>
      ${r.label ? `<p class="lp-rs-label">${esc(r.label)}</p>` : ''}
      ${sub ? `<p class="lp-rs-sub">${sub}</p>` : ''}
      ${at >= 0 ? `<ol class="lp-rs-steps">${steps.map((s, i) => `<li class="${i < at ? 'is-past' : i === at ? 'is-now' : ''}">${['Requested', 'On the way', 'Here', 'Riding', 'Arrived'][i]}</li>`).join('')}</ol>` : ''}`;
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // ---- Messages
  private renderMessages(): void {
    const extra = this.el.querySelector<HTMLElement>('.lp-head-extra')!;
    if (this.thread) {
      const id = this.thread;
      const c = CONTACTS[id] ?? { name: id, avatar: '💬', color: '#999' };
      this.title.textContent = c.name;
      extra.innerHTML = `<span class="lp-av lp-av--sm" style="--c:${c.color}">${c.avatar}</span>`;
      const msgs = this.saved.msgs.filter((m) => m.from === id);
      this.body.innerHTML = `
        <ol class="lp-thread">${msgs.map((m) => `<li class="${m.me ? 'is-me' : ''}"><p>${esc(m.text)}</p><time>${ago(m.t)}</time></li>`).join('')}</ol>
        <div class="lp-replies">${QUICK_REPLIES.map((q) => `<button type="button" data-reply="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
      const last = msgs.filter((m) => !m.me).pop();
      if (last) this.saved.read[id] = Math.max(this.saved.read[id] ?? 0, last.t);
      this.store();
      this.renderBadges();
      const list = this.body.querySelector('.lp-thread')!;
      list.scrollTop = list.scrollHeight;
      return;
    }
    this.title.textContent = 'Messages';
    const latest = new Map<string, Msg>();
    for (const m of this.saved.msgs) latest.set(m.from, m);
    const rows = [...latest.values()].sort((a, b) => b.t - a.t);
    this.body.innerHTML = rows.length
      ? `<ul class="lp-threads">${rows
          .map((m) => {
            const c = CONTACTS[m.from] ?? { name: m.from, avatar: '💬', color: '#999' };
            const n = this.unread(m.from);
            return `<li><button type="button" data-thread="${esc(m.from)}"><span class="lp-av" style="--c:${c.color}">${c.avatar}</span><span class="lp-th-text"><b>${esc(c.name)}</b><span>${m.me ? 'You: ' : ''}${esc(m.text)}</span></span><span class="lp-th-meta"><time>${ago(m.t)}</time>${n ? `<b class="lp-dot">${n}</b>` : ''}</span></button></li>`;
          })
          .join('')}</ul>`
      : '<p class="lp-empty">No texts yet. Go make some trouble.</p>';
  }

  private onAppClick(b: HTMLButtonElement): void {
    if (b.dataset.tab) {
      this.goalsTab = b.dataset.tab as 'goals' | 'missions';
      this.renderGoals();
    } else if (b.dataset.show) {
      const m = MISSIONS.find((x) => x.id === b.dataset.show);
      if (!m) return;
      this.current = 'map';
      this.screen.dataset.screen = 'app';
      this.title.textContent = TITLES.map;
      this.body.className = 'lp-app-body lp-app-body--map';
      this.renderMap({ x: m.at[0], z: m.at[1] });
    } else if (b.dataset.map && this.map) {
      const m = this.map;
      if (b.dataset.map === 'in') m.zoomAt(0.7);
      else if (b.dataset.map === 'out') m.zoomAt(1.45);
      else if (b.dataset.map === 'lou') this.centerMap();
      else m.showAll();
    } else if (b.dataset.hail) {
      this.hooks.sound('tap');
      this.hail(b.dataset.hail as RideKind);
    } else if (b.dataset.thread) {
      this.thread = b.dataset.thread;
      this.renderMessages();
    } else if (b.dataset.reply && this.thread) {
      const to = this.thread;
      this.saved.msgs.push({ from: to, text: b.dataset.reply, t: Date.now(), me: true });
      this.store();
      this.renderMessages();
      if (to === 'mom') window.setTimeout(() => this.text('mom', MOM_REPLIES[Math.floor(Math.random() * MOM_REPLIES.length)]), 1600 + Math.random() * 1400);
    }
  }
}
