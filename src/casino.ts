import { SoundFX } from './audio';
import { GamblingSpot } from './vegasWorld';

const SLOT_SYMBOLS = ['🍒', '🚬', '🔔', '💎', '🐈', '7️⃣'] as const;
// Real American double-zero wheel colors.
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

type GameKind = GamblingSpot['gameType'];

export interface CasinoCallbacks {
  getCash: () => number;
  setCash: (amount: number) => void;
  onOutcome: (msg: string) => void;
  /** net > 0 = player won that much on top of the stake; net < 0 = lost. */
  recordResult: (game: GameKind, net: number, vipTable: boolean) => void;
  isVip: () => boolean;
}

interface Card {
  rank: (typeof RANKS)[number];
  suit: (typeof SUITS)[number];
}

function drawCard(): Card {
  return {
    rank: RANKS[Math.floor(Math.random() * RANKS.length)],
    suit: SUITS[Math.floor(Math.random() * SUITS.length)],
  };
}

function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') {
      aces += 1;
      total += 11;
    } else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J') {
      total += 10;
    } else {
      total += Number(c.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

const isBlackjack = (cards: Card[]) => cards.length === 2 && handTotal(cards).total === 21;

export class CasinoController {
  private readonly dialog = document.getElementById('casino-dialog') as HTMLDialogElement;
  private readonly titleEl = document.getElementById('casino-dialog-title') as HTMLElement;
  private readonly subEl = document.getElementById('casino-dialog-sub') as HTMLElement;
  private readonly bankEl = document.getElementById('casino-bank') as HTMLElement;
  private readonly resultEl = document.getElementById('casino-result') as HTMLElement;
  private readonly reelEls = [0, 1, 2].map((i) => document.getElementById(`reel-${i}`) as HTMLElement);
  private readonly panels: Record<GameKind, HTMLElement> = {
    slots: document.getElementById('slots-panel') as HTMLElement,
    roulette: document.getElementById('roulette-panel') as HTMLElement,
    blackjack: document.getElementById('blackjack-panel') as HTMLElement,
    craps: document.getElementById('craps-panel') as HTMLElement,
  };
  private readonly wheelEl = document.getElementById('roulette-result-badge') as HTMLElement;

  // Blackjack DOM
  private readonly bjDealerEl = document.getElementById('bj-dealer') as HTMLElement;
  private readonly bjPlayerEl = document.getElementById('bj-player') as HTMLElement;
  private readonly bjDealerTotalEl = document.getElementById('bj-dealer-total') as HTMLElement;
  private readonly bjPlayerTotalEl = document.getElementById('bj-player-total') as HTMLElement;
  private readonly bjBetRow = document.getElementById('bj-bet-row') as HTMLElement;
  private readonly bjPlayRow = document.getElementById('bj-play-row') as HTMLElement;
  private readonly bjDoubleBtn = document.getElementById('bj-double') as HTMLButtonElement;

  // Craps DOM
  private readonly dieEls = [0, 1].map((i) => document.getElementById(`die-${i}`) as HTMLElement);
  private readonly crapsPointEl = document.getElementById('craps-point') as HTMLElement;
  private readonly crapsBetRow = document.getElementById('craps-bet-row') as HTMLElement;
  private readonly crapsRollBtn = document.getElementById('craps-roll') as HTMLButtonElement;

  private readonly sfx: SoundFX;
  private readonly callbacks: CasinoCallbacks;
  private isSpinning = false;
  private spot: GamblingSpot | null = null;

  // Blackjack round state
  private bjDealer: Card[] = [];
  private bjPlayer: Card[] = [];
  private bjBet = 0;
  private bjActive = false;

  // Craps round state
  private crapsPoint: number | null = null;
  private crapsBet = 0;
  private crapsSide: 'pass' | 'dontpass' = 'pass';

  constructor(sfx: SoundFX, callbacks: CasinoCallbacks) {
    this.sfx = sfx;
    this.callbacks = callbacks;
    this.setupDialogHandlers();
    this.setupGameButtons();
  }

  private setupDialogHandlers(): void {
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent) => {
        const r = this.dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      this.dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = isOutside(e);
      });
      this.dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && isOutside(e)) this.dialog.close();
      });
    }
    this.dialog.addEventListener('close', () => {
      this.dialog.returnValue = '';
      // Walking away mid-hand forfeits like a real table would.
      if (this.bjActive) {
        this.bjActive = false;
        this.callbacks.recordResult('blackjack', -this.bjBet, false);
        this.callbacks.onOutcome(`Walked away mid-hand — dealer keeps your $${this.bjBet}.`);
      }
      if (this.crapsPoint !== null) {
        this.callbacks.recordResult('craps', -this.crapsBet, false);
        this.callbacks.onOutcome(`Left the craps table with a point on — $${this.crapsBet} stays on the felt.`);
        this.crapsPoint = null;
      }
    });
  }

  private setupGameButtons(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-slot-bet]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.dataset.slotBet;
        this.spinSlots(raw === 'all' ? this.callbacks.getCash() : Number(raw));
      });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-roulette-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pick = btn.dataset.roulettePick as RoulettePick;
        const betInput = document.getElementById('roulette-bet') as HTMLSelectElement;
        const bet = betInput.value === 'all' ? this.callbacks.getCash() : Number(betInput.value);
        this.spinRoulette(pick, bet);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-bj-bet]').forEach((btn) => {
      btn.addEventListener('click', () => this.bjDeal(Number(btn.dataset.bjBet)));
    });
    document.getElementById('bj-hit')?.addEventListener('click', () => this.bjHit());
    document.getElementById('bj-stand')?.addEventListener('click', () => this.bjStand());
    this.bjDoubleBtn.addEventListener('click', () => this.bjDoubleDown());

    document.querySelectorAll<HTMLButtonElement>('[data-craps]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.craps as 'pass' | 'dontpass' | 'field';
        const betInput = document.getElementById('craps-bet') as HTMLSelectElement;
        this.crapsPlace(kind, Number(betInput.value));
      });
    });
    this.crapsRollBtn.addEventListener('click', () => this.crapsRollPoint());
  }

  public open(spot: GamblingSpot): void {
    this.spot = spot;
    this.titleEl.textContent = spot.label;
    this.subEl.textContent = `${spot.casinoName} • ${this.limitsText(spot.gameType)}`;
    this.refreshBank();
    for (const [kind, el] of Object.entries(this.panels) as Array<[GameKind, HTMLElement]>) {
      el.hidden = kind !== spot.gameType;
    }
    document.querySelectorAll<HTMLElement>('[data-vip-only]').forEach((el) => {
      el.hidden = !this.callbacks.isVip();
    });

    if (spot.gameType === 'slots') {
      this.resultEl.textContent = 'Any pair pays 1.5× • 3 Cats 15× • 3 Sevens 25×.';
    } else if (spot.gameType === 'roulette') {
      this.resultEl.textContent = 'Red or Black pays 1:1 • 0/00 split pays 17:1.';
    } else if (spot.gameType === 'blackjack') {
      this.bjReset();
      this.resultEl.textContent = 'Blackjack pays 3:2 • Dealer stands on all 17s • Double on any first two cards.';
    } else {
      this.crapsReset();
      this.resultEl.textContent = 'Pass Line: 7/11 wins, 2/3/12 craps. Hit your point before a 7!';
    }
    if (!this.dialog.open) this.dialog.showModal();
  }

  public isOpen(): boolean {
    return this.dialog.open;
  }

  private limitsText(kind: GameKind): string {
    const vip = this.callbacks.isVip();
    if (kind === 'slots') return 'Penny to Dollar Slots';
    if (kind === 'roulette') return vip ? 'Table limits $5–$500 (VIP)' : 'Table limits $5–$100';
    if (kind === 'blackjack') return vip ? 'Table limits $10–$500 (VIP)' : 'Table limits $10–$100';
    return vip ? 'Pass Line $10–$500 (VIP)' : 'Pass Line $10–$100';
  }

  private refreshBank(): void {
    this.bankEl.textContent = `$${this.callbacks.getCash()}`;
  }

  private canAfford(bet: number): boolean {
    const cash = this.callbacks.getCash();
    if (cash <= 0 || bet <= 0 || bet > cash) {
      this.sfx.playBusted();
      this.resultEl.textContent = 'Not enough cash for that bet! Hustle tourists on the Strip [B].';
      return false;
    }
    return true;
  }

  private pay(game: GameKind, stake: number, totalReturn: number, msg: string): void {
    const net = totalReturn - stake;
    this.callbacks.setCash(this.callbacks.getCash() + totalReturn);
    this.callbacks.recordResult(game, net, !!this.spot?.vipOnly);
    if (net > 0) {
      this.sfx.playJackpot();
      this.callbacks.onOutcome(msg);
    } else if (net < 0) {
      this.sfx.playBusted();
    }
    this.refreshBank();
  }

  // ---------- SLOTS ----------
  private spinSlots(bet: number): void {
    if (this.isSpinning || !this.canAfford(bet)) return;
    this.isSpinning = true;
    this.callbacks.setCash(this.callbacks.getCash() - bet);
    this.refreshBank();
    this.resultEl.textContent = 'Spinning the reels...';
    let ticks = 0;
    const interval = window.setInterval(() => {
      ticks += 1;
      for (const el of this.reelEls) el.textContent = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
      if (ticks >= 12) {
        window.clearInterval(interval);
        this.finishSlots(bet);
      }
    }, 65);
  }

  private finishSlots(bet: number): void {
    const r = [0, 1, 2].map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);
    r.forEach((sym, i) => (this.reelEls[i].textContent = sym));
    let mult = 0;
    if (r[0] === r[1] && r[1] === r[2]) {
      mult = r[0] === '7️⃣' ? 25 : r[0] === '🐈' ? 15 : r[0] === '💎' ? 10 : r[0] === '🚬' ? 8 : 6;
    } else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) {
      mult = 1.5; // ~5% house edge overall, like a loose Strip slot
    }
    const payout = Math.floor(bet * mult);
    if (payout > 0) {
      this.resultEl.textContent = mult >= 6 ? `JACKPOT (${mult}×)! +$${payout}!` : `Pair! Paid $${payout}.`;
    } else {
      this.resultEl.textContent = `No match (-$${bet}).`;
    }
    this.pay('slots', bet, payout, `Won $${payout - bet} on the slots!`);
    this.isSpinning = false;
  }

  // ---------- ROULETTE ----------
  private spinRoulette(pick: RoulettePick, bet: number): void {
    if (this.isSpinning || !this.canAfford(bet)) return;
    this.isSpinning = true;
    this.callbacks.setCash(this.callbacks.getCash() - bet);
    this.refreshBank();
    this.resultEl.textContent = 'No more bets… the ball is rolling.';
    this.wheelEl.textContent = '…';
    this.wheelEl.dataset.color = '';

    window.setTimeout(() => {
      const roll = Math.floor(Math.random() * 38); // 36 = 0, 37 = 00
      const label = roll === 36 ? '0' : roll === 37 ? '00' : String(roll + 1);
      const n = roll + 1;
      const color: 'red' | 'black' | 'green' = roll >= 36 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black';
      this.wheelEl.textContent = `${label} ${color.toUpperCase()}`;
      this.wheelEl.dataset.color = color;

      let ret = 0;
      if (pick === color) ret = pick === 'green' ? bet * 18 : bet * 2;
      else if (pick === 'odd' && color !== 'green' && n % 2 === 1) ret = bet * 2;
      else if (pick === 'even' && color !== 'green' && n % 2 === 0) ret = bet * 2;
      this.resultEl.textContent =
        ret > 0 ? `${label} ${color.toUpperCase()} — winner! Paid $${ret}.` : `${label} ${color.toUpperCase()} — house takes $${bet}.`;
      this.pay('roulette', bet, ret, `Roulette hit ${label} ${color.toUpperCase()} — won $${ret - bet}!`);
      this.isSpinning = false;
    }, 900);
  }

  // ---------- BLACKJACK ----------
  private bjReset(): void {
    this.bjActive = false;
    this.bjDealer = [];
    this.bjPlayer = [];
    this.bjBetRow.hidden = false;
    this.bjPlayRow.hidden = true;
    this.renderBlackjack(false);
  }

  private renderCards(el: HTMLElement, cards: Card[], hideHole: boolean): void {
    el.replaceChildren(
      ...cards.map((c, i) => {
        const span = document.createElement('span');
        span.className = 'card';
        if (hideHole && i === 1) {
          span.classList.add('card--back');
          span.textContent = '🂠';
        } else {
          span.textContent = `${c.rank}${c.suit}`;
          if (c.suit === '♥' || c.suit === '♦') span.classList.add('card--red');
        }
        return span;
      })
    );
  }

  private renderBlackjack(hideHole: boolean): void {
    this.renderCards(this.bjDealerEl, this.bjDealer, hideHole);
    this.renderCards(this.bjPlayerEl, this.bjPlayer, false);
    const p = handTotal(this.bjPlayer);
    this.bjPlayerTotalEl.textContent = this.bjPlayer.length ? `${p.soft && p.total < 21 ? 'soft ' : ''}${p.total}` : '';
    if (!this.bjDealer.length) this.bjDealerTotalEl.textContent = '';
    else if (hideHole) this.bjDealerTotalEl.textContent = `${handTotal([this.bjDealer[0]]).total} + ?`;
    else this.bjDealerTotalEl.textContent = String(handTotal(this.bjDealer).total);
  }

  private bjDeal(bet: number): void {
    if (this.bjActive || !this.canAfford(bet)) return;
    this.callbacks.setCash(this.callbacks.getCash() - bet);
    this.refreshBank();
    this.bjBet = bet;
    this.bjPlayer = [drawCard(), drawCard()];
    this.bjDealer = [drawCard(), drawCard()];
    this.bjActive = true;
    this.sfx.playSteal();

    if (isBlackjack(this.bjPlayer) || isBlackjack(this.bjDealer)) {
      this.bjSettle();
      return;
    }
    this.bjBetRow.hidden = true;
    this.bjPlayRow.hidden = false;
    this.bjDoubleBtn.disabled = this.callbacks.getCash() < bet;
    this.renderBlackjack(true);
    this.resultEl.textContent = `Bet $${bet}. Hit, Stand, or Double?`;
  }

  private bjHit(): void {
    if (!this.bjActive) return;
    this.bjPlayer.push(drawCard());
    this.bjDoubleBtn.disabled = true;
    this.sfx.playSteal();
    if (handTotal(this.bjPlayer).total >= 21) {
      this.bjStand();
      return;
    }
    this.renderBlackjack(true);
  }

  private bjDoubleDown(): void {
    if (!this.bjActive || this.bjPlayer.length !== 2) return;
    if (this.callbacks.getCash() < this.bjBet) return;
    this.callbacks.setCash(this.callbacks.getCash() - this.bjBet);
    this.bjBet *= 2;
    this.refreshBank();
    this.bjPlayer.push(drawCard());
    this.bjStand();
  }

  private bjStand(): void {
    if (!this.bjActive) return;
    if (handTotal(this.bjPlayer).total <= 21) {
      while (handTotal(this.bjDealer).total < 17) this.bjDealer.push(drawCard());
    }
    this.bjSettle();
  }

  private bjSettle(): void {
    const p = handTotal(this.bjPlayer).total;
    const d = handTotal(this.bjDealer).total;
    const pBJ = isBlackjack(this.bjPlayer);
    const dBJ = isBlackjack(this.bjDealer);
    let ret = 0;
    let msg: string;
    if (pBJ && !dBJ) {
      ret = Math.floor(this.bjBet * 2.5);
      msg = `BLACKJACK! Paid 3:2 — $${ret}.`;
    } else if (pBJ && dBJ) {
      ret = this.bjBet;
      msg = 'Both blackjack — push.';
    } else if (dBJ) {
      msg = 'Dealer blackjack. Ouch.';
    } else if (p > 21) {
      msg = `Bust with ${p}.`;
    } else if (d > 21) {
      ret = this.bjBet * 2;
      msg = `Dealer busts with ${d}! Paid $${ret}.`;
    } else if (p > d) {
      ret = this.bjBet * 2;
      msg = `${p} beats ${d}! Paid $${ret}.`;
    } else if (p === d) {
      ret = this.bjBet;
      msg = `Push at ${p}.`;
    } else {
      msg = `Dealer ${d} beats your ${p}.`;
    }
    this.bjActive = false;
    this.renderBlackjack(false);
    this.resultEl.textContent = msg;
    this.pay('blackjack', this.bjBet, ret, `Blackjack win: +$${ret - this.bjBet}!`);
    this.bjBetRow.hidden = false;
    this.bjPlayRow.hidden = true;
  }

  // ---------- CRAPS ----------
  private crapsReset(): void {
    this.crapsPoint = null;
    this.crapsBet = 0;
    this.crapsPointEl.textContent = 'Point: OFF';
    this.crapsPointEl.dataset.on = 'false';
    this.crapsBetRow.hidden = false;
    this.crapsRollBtn.hidden = true;
  }

  private rollDice(): [number, number] {
    const a = 1 + Math.floor(Math.random() * 6);
    const b = 1 + Math.floor(Math.random() * 6);
    this.dieEls[0].textContent = DIE_FACES[a - 1];
    this.dieEls[1].textContent = DIE_FACES[b - 1];
    this.sfx.playSteal();
    return [a, b];
  }

  private crapsPlace(kind: 'pass' | 'dontpass' | 'field', bet: number): void {
    if (this.isSpinning || this.crapsPoint !== null || !this.canAfford(bet)) return;
    this.callbacks.setCash(this.callbacks.getCash() - bet);
    this.refreshBank();
    const [a, b] = this.rollDice();
    const sum = a + b;

    if (kind === 'field') {
      let ret = 0;
      if (sum === 2 || sum === 12) ret = bet * 3; // pays double
      else if ([3, 4, 9, 10, 11].includes(sum)) ret = bet * 2;
      this.resultEl.textContent = ret > 0 ? `Field ${sum} — paid $${ret}!` : `Field ${sum} — loser.`;
      this.pay('craps', bet, ret, `Field bet hit ${sum}: +$${ret - bet}!`);
      return;
    }

    this.crapsSide = kind;
    this.crapsBet = bet;
    if (kind === 'pass') {
      if (sum === 7 || sum === 11) return this.crapsFinish(bet * 2, `${sum} on the come-out — Pass Line wins!`);
      if (sum === 2 || sum === 3 || sum === 12) return this.crapsFinish(0, `Craps ${sum}! Pass Line loses.`);
    } else {
      if (sum === 2 || sum === 3) return this.crapsFinish(bet * 2, `Craps ${sum} — Don't Pass wins!`);
      if (sum === 12) return this.crapsFinish(bet, '12 on the come-out — Don’t Pass pushes.');
      if (sum === 7 || sum === 11) return this.crapsFinish(0, `${sum} on the come-out — Don't Pass loses.`);
    }
    this.crapsPoint = sum;
    this.crapsPointEl.textContent = `Point: ${sum} — ON`;
    this.crapsPointEl.dataset.on = 'true';
    this.crapsBetRow.hidden = true;
    this.crapsRollBtn.hidden = false;
    this.resultEl.textContent =
      kind === 'pass' ? `Point is ${sum}. Roll it again before a 7!` : `Point is ${sum}. You want a 7 before it!`;
  }

  private crapsRollPoint(): void {
    if (this.crapsPoint === null) return;
    const [a, b] = this.rollDice();
    const sum = a + b;
    const pass = this.crapsSide === 'pass';
    if (sum === this.crapsPoint) {
      this.crapsFinish(pass ? this.crapsBet * 2 : 0, pass ? `Hit the point ${sum}! Winner!` : `Point ${sum} made — Don't Pass loses.`);
    } else if (sum === 7) {
      this.crapsFinish(pass ? 0 : this.crapsBet * 2, pass ? 'Seven out! Pass Line loses.' : 'Seven out — Don’t Pass wins!');
    } else {
      this.resultEl.textContent = `Rolled ${sum}. Point is still ${this.crapsPoint} — roll again.`;
    }
  }

  private crapsFinish(ret: number, msg: string): void {
    const bet = this.crapsBet;
    this.crapsPoint = null;
    this.resultEl.textContent = msg;
    this.pay('craps', bet, ret, `Craps: +$${ret - bet}!`);
    this.crapsReset();
  }
}

type RoulettePick = 'red' | 'black' | 'green' | 'odd' | 'even';
