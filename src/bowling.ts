import type { SoundFX } from './audio';

/*
 * Brooklyn Bowl: one frame of ten-pin on a lane drawn in the shop dialog. Lou pays the lane fee,
 * then two clicks per ball: lock the aim as the marker swings across the foul line, then lock the
 * hook. The ball rolls with that curve; pins it touches fall, and falling pins take their
 * neighbours behind them. Strike, spare or count pays out in cash and degen.
 */

export interface BowlingCallbacks {
  getCash: () => number;
  addCash: (n: number) => void;
  degen: (points: number, label: string) => void;
  toast: (msg: string) => void;
}

const FEE = 8;
const PAY = { strike: 40, spare: 20, seven: 6 };
const W = 220;
const H = 500;
const LANE_X0 = 65;
const LANE_X1 = 155; // 90 px ≈ 41.5 in
const PIN_Y = 92;
const SPACING = 22; // ≈ 12 in between pin centres in a row
const PIN_R = 5.5;
const BALL_R = 9;
const FOUL_Y = H - 46;

type Phase = 'idle' | 'aim' | 'hook' | 'rolling' | 'done';

interface Pin {
  x: number;
  y: number;
  down: boolean;
  t: number; // fall animation 0..1
  dir: number;
}

function rack(): Pin[] {
  const pins: Pin[] = [];
  const cx = (LANE_X0 + LANE_X1) / 2;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) pins.push({ x: cx + (i - row / 2) * SPACING, y: PIN_Y + (3 - row) * SPACING * 0.87, down: false, t: 0, dir: 0 });
  }
  return pins;
}

export class BowlingGame {
  private readonly dialog: HTMLDialogElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private label = 'Brooklyn Bowl';
  private phase: Phase = 'idle';
  private pins: Pin[] = rack();
  private roll = 0; // 0 = first ball, 1 = second
  private firstDown = 0;
  private aim = 0; // -1..1
  private hook = 0; // -1..1
  private swingT = 0;
  private ball = { x: 0, y: 0, x0: 0, t: 0 };
  private status = '';
  private raf = 0;
  private last = 0;

  constructor(
    private readonly sfx: SoundFX,
    private readonly cb: BowlingCallbacks
  ) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'casino-dialog food-dialog bowl-dialog';
    this.dialog.setAttribute('closedby', 'any');
    document.getElementById('game-root')!.append(this.dialog);
    this.dialog.addEventListener('close', () => {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    });
    this.dialog.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'KeyF' || e.code === 'Enter') {
        e.preventDefault();
        this.press();
      }
    });
  }

  isOpen(): boolean {
    return this.dialog.open;
  }

  open(label = 'Brooklyn Bowl'): void {
    this.label = label;
    this.phase = 'idle';
    this.pins = rack();
    this.status = `Lane fee $${FEE} for a frame (two balls). Strike pays $${PAY.strike}, spare $${PAY.spare}, 7+ pins $${PAY.seven}.`;
    this.dialog.innerHTML = `
      <div class="casino-header"><div><h1>${this.label}</h1><p class="casino-sub">Bowling • live music • fried chicken • 32 lanes upstairs</p></div>
      <div class="casino-bank-wrap"><span class="stat-label">Cash</span><strong class="casino-bank" data-cash>$${this.cb.getCash()}</strong></div></div>
      <div style="display:flex;gap:16px;align-items:flex-start;justify-content:center;flex-wrap:wrap">
        <canvas width="${W}" height="${H}" style="background:#151018;border-radius:8px;max-height:56vh;height:auto;max-width:44vw"></canvas>
        <div style="max-width:260px;display:flex;flex-direction:column;gap:10px">
          <p class="casino-result" data-status aria-live="polite"></p>
          <button type="button" class="action-btn" data-go>Rent a lane ($${FEE})</button>
          <p class="casino-sub">Click or press Space: once to lock the aim, once to lock the hook.</p>
        </div>
      </div>
      <form method="dialog" class="casino-footer"><button type="submit" class="action-btn">Return the shoes</button></form>`;
    this.canvas = this.dialog.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.dialog.querySelector<HTMLButtonElement>('[data-go]')!.addEventListener('click', () => this.press());
    this.canvas.addEventListener('click', () => this.press());
    this.refresh();
    if (!this.dialog.open) this.dialog.showModal();
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(loop);
  }

  private refresh(): void {
    const s = this.dialog.querySelector('[data-status]');
    if (s) s.textContent = this.status;
    const c = this.dialog.querySelector('[data-cash]');
    if (c) c.textContent = `$${this.cb.getCash()}`;
    const go = this.dialog.querySelector<HTMLButtonElement>('[data-go]');
    if (go)
      go.textContent =
        this.phase === 'idle' || this.phase === 'done' ? `${this.phase === 'done' ? 'Another frame' : 'Rent a lane'} ($${FEE})` : this.phase === 'aim' ? 'Lock aim' : this.phase === 'hook' ? 'Lock hook — bowl!' : 'Rolling…';
  }

  private press(): void {
    if (this.phase === 'idle' || this.phase === 'done') {
      if (this.cb.getCash() < FEE) {
        this.sfx.playBusted();
        this.status = `Lane fee is $${FEE}. Go hustle some tourists first.`;
        return this.refresh();
      }
      this.cb.addCash(-FEE);
      this.sfx.playCash();
      this.pins = rack();
      this.roll = 0;
      this.firstDown = 0;
      this.phase = 'aim';
      this.swingT = Math.random() * 3;
      this.status = 'Ball 1. Lou squares up to the lane…';
    } else if (this.phase === 'aim') {
      this.aim = Math.sin(this.swingT * 2.6);
      this.phase = 'hook';
      this.swingT = Math.random() * 3;
      this.status = 'Now the hook (left ↔ right).';
    } else if (this.phase === 'hook') {
      this.hook = Math.sin(this.swingT * 3.4);
      this.phase = 'rolling';
      const cx = (LANE_X0 + LANE_X1) / 2;
      this.ball = { x: cx + this.aim * 34, y: FOUL_Y, x0: cx + this.aim * 34, t: 0 };
      this.status = 'Rolling…';
    }
    this.refresh();
  }

  private tick(dt: number): void {
    this.swingT += dt;
    for (const p of this.pins) if (p.down && p.t < 1) p.t = Math.min(1, p.t + dt * 3);
    if (this.phase !== 'rolling') return;
    const b = this.ball;
    b.t += dt;
    b.y -= dt * 420;
    const travelled = (FOUL_Y - b.y) / (FOUL_Y - PIN_Y);
    // the hook bites in the back half of the lane
    b.x = b.x0 + this.hook * 28 * Math.max(0, travelled - 0.35) ** 2 * 2.4;
    if (b.x < LANE_X0 + BALL_R * 0.5 || b.x > LANE_X1 - BALL_R * 0.5) {
      // gutter ball: it rides the channel to the end
      b.x = b.x < (LANE_X0 + LANE_X1) / 2 ? LANE_X0 - 5 : LANE_X1 + 5;
      b.x0 = b.x;
      this.hook = 0;
    }
    const inLane = b.x > LANE_X0 && b.x < LANE_X1;
    for (const p of this.pins) {
      if (p.down || !inLane) continue;
      if (Math.hypot(p.x - b.x, p.y - b.y) < PIN_R + BALL_R) this.topple(p, Math.sign(p.x - b.x) || 1);
    }
    if (b.y < PIN_Y - 40) this.endBall();
  }

  /** A falling pin takes out the pins behind it on its side (and sometimes straight back). */
  private topple(p: Pin, dir: number, depth = 0): void {
    p.down = true;
    p.dir = dir;
    if (depth > 4) return;
    for (const q of this.pins) {
      if (q.down || q.y >= p.y) continue;
      const dx = q.x - p.x;
      const dy = p.y - q.y;
      if (dy > SPACING * 1.9) continue;
      const along = dx * dir;
      const chance = along > 0 && along < SPACING * 0.8 ? 0.78 : Math.abs(dx) < 2 ? 0.45 : 0.08;
      if (Math.random() < chance) this.topple(q, dir, depth + 1);
    }
  }

  private endBall(): void {
    const down = this.pins.filter((p) => p.down).length;
    if (this.roll === 0) {
      this.firstDown = down;
      if (down === 10) {
        this.sfx.playJackpot();
        this.cb.addCash(PAY.strike);
        this.cb.degen(120, 'STRIKE!');
        this.status = `STRIKE! Lou does a little dance. +$${PAY.strike}`;
        this.cb.toast(`Brooklyn Bowl: STRIKE! +$${PAY.strike}`);
        this.phase = 'done';
      } else {
        this.status = `${down} down. ${10 - down} left standing — ball 2.`;
        this.roll = 1;
        this.phase = 'aim';
        this.swingT = Math.random() * 3;
      }
    } else {
      if (down === 10) {
        this.sfx.playCash();
        this.cb.addCash(PAY.spare);
        this.cb.degen(60, 'Spare');
        this.status = `SPARE! +$${PAY.spare}`;
      } else if (down >= 7) {
        this.cb.addCash(PAY.seven);
        this.cb.degen(15, 'Respectable Frame');
        this.status = `${down} pins. Respectable. +$${PAY.seven}`;
      } else {
        this.sfx.playBusted();
        this.cb.degen(5, 'Gutter Cat');
        this.status = down === 0 ? 'Two gutter balls. Lou blames the shoes.' : `${down} pins (${this.firstDown} + ${down - this.firstDown}). Lou blames the shoes.`;
      }
      this.phase = 'done';
    }
    this.refresh();
  }

  private draw(): void {
    const c = this.ctx;
    if (!c) return;
    c.fillStyle = '#151018';
    c.fillRect(0, 0, W, H);
    // gutters and the maple lane with its boards and arrows
    c.fillStyle = '#2a2a30';
    c.fillRect(LANE_X0 - 12, 0, 12, H);
    c.fillRect(LANE_X1, 0, 12, H);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#c89a5a');
    g.addColorStop(1, '#e8c088');
    c.fillStyle = g;
    c.fillRect(LANE_X0, 0, LANE_X1 - LANE_X0, H);
    c.strokeStyle = 'rgba(120,80,40,0.25)';
    for (let x = LANE_X0; x < LANE_X1; x += 6) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, H);
      c.stroke();
    }
    c.fillStyle = '#6a3a1a';
    for (let i = -3; i <= 3; i++) {
      const x = (LANE_X0 + LANE_X1) / 2 + i * 11;
      const y = H - 150 + Math.abs(i) * 8;
      c.beginPath();
      c.moveTo(x, y - 8);
      c.lineTo(x - 3, y);
      c.lineTo(x + 3, y);
      c.fill();
    }
    c.fillStyle = '#d62a2a';
    c.fillRect(LANE_X0, FOUL_Y, LANE_X1 - LANE_X0, 3);
    // pins
    for (const p of this.pins) {
      const lean = p.down ? p.t : 0;
      c.save();
      c.translate(p.x + p.dir * lean * 8, p.y - lean * 6);
      c.globalAlpha = 1 - lean * 0.55;
      c.rotate(p.dir * lean * 1.4);
      c.fillStyle = '#fbfbf6';
      c.beginPath();
      c.ellipse(0, 0, PIN_R, PIN_R * (1 + lean * 0.8), 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#d62a2a';
      c.fillRect(-PIN_R + 1, -1.5, PIN_R * 2 - 2, 2);
      c.restore();
    }
    c.globalAlpha = 1;
    // aim + hook meters
    const cx = (LANE_X0 + LANE_X1) / 2;
    if (this.phase === 'aim') {
      const ax = cx + Math.sin(this.swingT * 2.6) * 34;
      c.fillStyle = '#ffd24d';
      c.beginPath();
      c.moveTo(ax, FOUL_Y - 16);
      c.lineTo(ax - 7, FOUL_Y - 4);
      c.lineTo(ax + 7, FOUL_Y - 4);
      c.fill();
    }
    if (this.phase === 'hook') {
      const hx = Math.sin(this.swingT * 3.4);
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(20, H - 22, W - 40, 12);
      c.fillStyle = Math.abs(hx) < 0.25 ? '#4dff7a' : '#ffd24d';
      c.fillRect(W / 2 + hx * (W / 2 - 26) - 4, H - 24, 8, 16);
      c.strokeStyle = '#fff';
      c.strokeRect(W / 2 - 10, H - 24, 20, 16);
    }
    // the ball (Lou's paw-print house ball)
    if (this.phase === 'rolling' || this.phase === 'aim' || this.phase === 'hook') {
      const bx = this.phase === 'rolling' ? this.ball.x : this.phase === 'hook' ? cx + this.aim * 34 : cx + Math.sin(this.swingT * 2.6) * 34;
      const by = this.phase === 'rolling' ? this.ball.y : FOUL_Y + 18;
      c.fillStyle = '#2a5ad8';
      c.beginPath();
      c.arc(bx, by, BALL_R, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#0c1a40';
      for (const [dx, dy] of [
        [-2.5, -3],
        [2.5, -3],
        [0, 1.5],
      ]) {
        c.beginPath();
        c.arc(bx + dx, by + dy, 1.6, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.fillStyle = '#fff';
    c.font = 'bold 13px system-ui';
    c.textAlign = 'center';
    c.fillText(`Ball ${this.roll + 1} • down ${this.pins.filter((p) => p.down).length}`, W / 2, 18);
  }
}
