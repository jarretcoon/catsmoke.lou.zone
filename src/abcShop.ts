import { SoundFX } from './audio';
import { VapeFlavor } from './smoke';

export interface AbcShopCallbacks {
  getCash: () => number;
  setCash: (amount: number) => void;
  addCigs: (count: number, boughtCarton: boolean) => void;
  buyVapeMod: () => void;
  buyVapePod: (flavor: VapeFlavor) => void;
  hasVapeMod: () => boolean;
  onOutcome: (msg: string) => void;
}

export class AbcShopController {
  private readonly dialog = document.getElementById('abc-dialog') as HTMLDialogElement;
  private readonly bankEl = document.getElementById('abc-bank') as HTMLElement;
  private readonly statusEl = document.getElementById('abc-result') as HTMLElement;
  private readonly sfx: SoundFX;
  private readonly callbacks: AbcShopCallbacks;

  constructor(sfx: SoundFX, callbacks: AbcShopCallbacks) {
    this.sfx = sfx;
    this.callbacks = callbacks;
    this.setupDialog();
    this.setupButtons();
  }

  private setupDialog(): void {
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

  private setupButtons(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-abc-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.dataset.abcItem;
        const cash = this.callbacks.getCash();

        if (item === 'pack') {
          if (cash < 8) return this.fail(8);
          this.callbacks.setCash(cash - 8);
          this.callbacks.addCigs(10, false);
          this.succeed('Bought 1 Pack (+10 Cigs) for $8!');
        } else if (item === 'carton') {
          if (cash < 55) return this.fail(55);
          this.callbacks.setCash(cash - 55);
          this.callbacks.addCigs(100, true);
          this.succeed('Bought a FULL CARTON (+100 Cigs) for $55!');
        } else if (item === 'vape-mod') {
          if (cash < 35) return this.fail(35);
          this.callbacks.setCash(cash - 35);
          this.callbacks.buyVapeMod();
          this.succeed('Bought Sub-Ohm Neon Vape Mod + 100% Juice ($35)! Press [V] to switch!');
        } else if (item?.startsWith('pod:')) {
          if (!this.callbacks.hasVapeMod()) {
            this.sfx.playBusted();
            this.statusEl.textContent = 'Buy the Neon Vape Mod ($35) first before buying flavor pods!';
            return;
          }
          if (cash < 18) return this.fail(18);
          const flavor = item.slice(4) as VapeFlavor;
          this.callbacks.setCash(cash - 18);
          this.callbacks.buyVapePod(flavor);
          this.succeed(`Loaded ${flavor} Vape Pod (100% Juice) for $18!`);
        }
      });
    });
  }

  private fail(cost: number): void {
    this.sfx.playBusted();
    this.statusEl.textContent = `Need $${cost}! Go panhandle tourists [B] or win at Bellagio/Paris/Flamingo!`;
  }

  private succeed(msg: string): void {
    this.sfx.playCash();
    this.refreshBank();
    this.statusEl.textContent = msg;
    this.callbacks.onOutcome(msg);
  }

  private refreshBank(): void {
    this.bankEl.textContent = `$${this.callbacks.getCash()}`;
  }

  public open(): void {
    this.refreshBank();
    this.statusEl.textContent = 'Aloha! Stock up on Cigarette Cartons, Vapes & Flavor Pods.';
    if (!this.dialog.open) {
      this.dialog.showModal();
    }
  }

  public isOpen(): boolean {
    return this.dialog.open;
  }
}
