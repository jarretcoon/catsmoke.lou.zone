import { SoundFX } from './audio';
import { GamblingSpot } from './vegasWorld';

const SLOT_SYMBOLS = ['🍒', '🚬', '🔔', '💎', '🐈', '7️⃣'] as const;

export interface CasinoCallbacks {
  getCash: () => number;
  setCash: (amount: number) => void;
  onOutcome: (msg: string) => void;
}

export class CasinoController {
  private readonly dialog = document.getElementById('casino-dialog') as HTMLDialogElement;
  private readonly titleEl = document.getElementById('casino-dialog-title') as HTMLElement;
  private readonly subEl = document.getElementById('casino-dialog-sub') as HTMLElement;
  private readonly bankEl = document.getElementById('casino-bank') as HTMLElement;
  private readonly resultEl = document.getElementById('casino-result') as HTMLElement;
  private readonly reelEls = [
    document.getElementById('reel-0') as HTMLElement,
    document.getElementById('reel-1') as HTMLElement,
    document.getElementById('reel-2') as HTMLElement,
  ];
  private readonly slotsSection = document.getElementById('slots-panel') as HTMLElement;
  private readonly rouletteSection = document.getElementById('roulette-panel') as HTMLElement;
  private readonly wheelEl = document.getElementById('roulette-result-badge') as HTMLElement;

  private readonly sfx: SoundFX;
  private readonly callbacks: CasinoCallbacks;
  private isSpinning = false;

  constructor(sfx: SoundFX, callbacks: CasinoCallbacks) {
    this.sfx = sfx;
    this.callbacks = callbacks;
    this.setupDialogHandlers();
    this.setupGameButtons();
  }

  private setupDialogHandlers(): void {
    // Light-dismiss fallback for browsers lacking closedBy (modern-web-guidance: light-dismiss-a-dialog)
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
    });
  }

  private setupGameButtons(): void {
    const betButtons = document.querySelectorAll<HTMLButtonElement>('[data-slot-bet]');
    betButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.dataset.slotBet;
        const bet = raw === 'all' ? this.callbacks.getCash() : Number(raw);
        this.spinSlots(bet);
      });
    });

    const rouletteButtons = document.querySelectorAll<HTMLButtonElement>('[data-roulette-pick]');
    rouletteButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const pick = btn.dataset.roulettePick as 'red' | 'black' | 'green';
        const betInput = document.getElementById('roulette-bet') as HTMLSelectElement;
        const bet = betInput.value === 'all' ? this.callbacks.getCash() : Number(betInput.value);
        this.spinRoulette(pick, bet);
      });
    });
  }

  public open(spot: GamblingSpot): void {
    this.titleEl.textContent = spot.label;
    this.subEl.textContent = `${spot.casinoName} • High-Stakes Alleycat Table`;
    this.refreshBank();

    if (spot.gameType === 'slots') {
      this.slotsSection.hidden = false;
      this.rouletteSection.hidden = true;
      this.resultEl.textContent = 'Pull the lever. 3 Cats = 15× • 3 Sevens = 25×!';
    } else {
      this.slotsSection.hidden = true;
      this.rouletteSection.hidden = false;
      this.resultEl.textContent = 'Pick Red (2×), Black (2×), or Lucky 00 Green (14×).';
    }

    if (!this.dialog.open) {
      this.dialog.showModal();
    }
  }

  public isOpen(): boolean {
    return this.dialog.open;
  }

  private refreshBank(): void {
    this.bankEl.textContent = `$${this.callbacks.getCash()}`;
  }

  private spinSlots(bet: number): void {
    if (this.isSpinning) return;
    const cash = this.callbacks.getCash();
    if (cash <= 0 || bet <= 0 || bet > cash) {
      this.sfx.playBusted();
      this.resultEl.textContent = 'Broke! Go panhandle tourists on the Strip [B] for cash!';
      return;
    }

    this.isSpinning = true;
    this.callbacks.setCash(cash - bet);
    this.refreshBank();
    this.resultEl.textContent = 'Spinning the reels...';

    let ticks = 0;
    const interval = window.setInterval(() => {
      ticks += 1;
      for (const el of this.reelEls) {
        el.textContent = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
      }
      if (ticks >= 12) {
        window.clearInterval(interval);
        this.finishSlots(bet);
      }
    }, 65);
  }

  private finishSlots(bet: number): void {
    const r0 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    const r1 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    const r2 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    this.reelEls[0].textContent = r0;
    this.reelEls[1].textContent = r1;
    this.reelEls[2].textContent = r2;

    let mult = 0;
    if (r0 === r1 && r1 === r2) {
      if (r0 === '7️⃣') mult = 25;
      else if (r0 === '🐈') mult = 15;
      else if (r0 === '💎') mult = 10;
      else if (r0 === '🚬') mult = 8;
      else mult = 6;
    } else if (r0 === r1 || r1 === r2 || r0 === r2) {
      mult = 2;
    }

    if (mult > 0) {
      const payout = bet * mult;
      this.callbacks.setCash(this.callbacks.getCash() + payout);
      this.sfx.playJackpot();
      this.resultEl.textContent = `WINNER (${mult}×)! +$${payout}!`;
      this.callbacks.onOutcome(`Won $${payout} on the slots!`);
    } else {
      this.sfx.playBusted();
      this.resultEl.textContent = `No match (-$${bet}). Spin again or beg tourists outside!`;
    }

    this.refreshBank();
    this.isSpinning = false;
  }

  private spinRoulette(pick: 'red' | 'black' | 'green', bet: number): void {
    if (this.isSpinning) return;
    const cash = this.callbacks.getCash();
    if (cash <= 0 || bet <= 0 || bet > cash) {
      this.sfx.playBusted();
      this.resultEl.textContent = 'Not enough cash! Panhandle tourists on the Strip [B]!';
      return;
    }

    this.isSpinning = true;
    this.callbacks.setCash(cash - bet);
    this.refreshBank();

    const roll = Math.floor(Math.random() * 38); // 0..37 (36 & 37 = 00 green)
    let color: 'red' | 'black' | 'green' = 'black';
    let label = String(roll);
    if (roll >= 36) {
      color = 'green';
      label = roll === 36 ? '0' : '00';
    } else if (roll % 2 === 1) {
      color = 'red';
    }

    this.wheelEl.textContent = `${label} ${color.toUpperCase()}`;
    this.wheelEl.dataset.color = color;

    if (pick === color) {
      const mult = color === 'green' ? 14 : 2;
      const payout = bet * mult;
      this.callbacks.setCash(this.callbacks.getCash() + payout);
      this.sfx.playJackpot();
      this.resultEl.textContent = `Ball landed on ${label} ${color.toUpperCase()}! Won $${payout}!`;
      this.callbacks.onOutcome(`Hit ${label} ${color.toUpperCase()} for $${payout}!`);
    } else {
      this.sfx.playBusted();
      this.resultEl.textContent = `Landed on ${label} ${color.toUpperCase()} — house takes $${bet}.`;
    }

    this.refreshBank();
    this.isSpinning = false;
  }
}
