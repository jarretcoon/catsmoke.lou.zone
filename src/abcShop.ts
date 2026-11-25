import { SoundFX } from './audio';

export type AbcCategory = 'Smokes' | 'Vape' | 'Snacks & Drinks' | 'Souvenirs' | 'Essentials';

export interface AbcItem {
  id: string;
  cat: AbcCategory;
  name: string;
  desc: string;
  price: number;
  tag?: string;
}

/** Real-ish 2026 Strip ABC Stores prices (tobacco includes Nevada's $1.80/pack tax). */
export const ABC_ITEMS: AbcItem[] = [
  { id: 'pack', cat: 'Smokes', name: 'Pack of Cigarettes', desc: '+20 smokes. They ID anyone who looks under 40. Lou looks 4.', price: 13 },
  { id: 'carton', cat: 'Smokes', name: 'Full Carton', desc: '10 packs • +200 smokes. Bulk degen.', price: 110, tag: 'BEST VALUE' },
  { id: 'cigarillo', cat: 'Smokes', name: 'Wood-Tip Cigarillos', desc: '+5 smokes, but classy.', price: 6 },
  { id: 'lighter', cat: 'Smokes', name: 'Neon BIC Lighter', desc: 'Lou already has six. Buys a seventh.', price: 3 },
  { id: 'mod', cat: 'Vape', name: 'Neon Sub-Ohm Mod', desc: 'The big cloud machine + 100% juice.', price: 35 },
  { id: 'pod:Blue Razz', cat: 'Vape', name: 'Blue Razz Pod', desc: 'Refill to 100%.', price: 18 },
  { id: 'pod:Mango Sunset', cat: 'Vape', name: 'Mango Sunset Pod', desc: 'Refill to 100%.', price: 18 },
  { id: 'pod:Mint Chill', cat: 'Vape', name: 'Mint Chill Pod', desc: 'Refill to 100%.', price: 18 },
  { id: 'pod:Cotton Candy', cat: 'Vape', name: 'Cotton Candy Pod', desc: 'Refill to 100%.', price: 18 },
  { id: 'pod:Watermelon Ice', cat: 'Vape', name: 'Watermelon Ice Pod', desc: 'Refill to 100%.', price: 18 },
  { id: 'pod:Vegas Strawberry', cat: 'Vape', name: 'Vegas Strawberry Pod', desc: 'Refill to 100%.', price: 18 },
  { id: 'pod:Tobacco Gold', cat: 'Vape', name: 'Tobacco Gold Pod', desc: 'For when Lou misses his cigs. Refill to 100%.', price: 18 },
  { id: 'disposable', cat: 'Vape', name: 'Strip Stick Disposable', desc: '5,000 puffs of Watermelon Ice. Juice to 100%.', price: 24 },
  { id: 'coil', cat: 'Vape', name: 'Cloud Beast Coil', desc: 'Permanent upgrade: every rip is ~35% bigger.', price: 60, tag: 'UPGRADE' },
  { id: 'nuts', cat: 'Snacks & Drinks', name: 'Macadamia Nuts', desc: 'Very ABC. Sprint +20% for 90 s.', price: 14 },
  { id: 'musubi', cat: 'Snacks & Drinks', name: 'Spam Musubi', desc: 'Hawaiian classic. Tips ×1.15 for 90 s.', price: 5 },
  { id: 'energy', cat: 'Snacks & Drinks', name: 'Energy Drink', desc: 'Zoomies: move +30% for 60 s.', price: 6 },
  { id: 'beer', cat: 'Snacks & Drinks', name: '24 oz Beer', desc: 'Liquid courage: tips +50% for 60 s.', price: 6 },
  { id: 'cheetos', cat: 'Snacks & Drinks', name: 'Flamin’ Hot Chips', desc: 'Orange paws for days.', price: 4 },
  { id: 'water', cat: 'Snacks & Drinks', name: 'Bottle of Water', desc: '$3 here, $9 in the casino gift shop.', price: 3 },
  { id: 'trucker-hat', cat: 'Souvenirs', name: 'VEGAS Trucker Hat', desc: 'Wearable • +1 Swag', price: 15 },
  { id: 'lei', cat: 'Souvenirs', name: 'Shell Lei', desc: 'Wearable • +1 Swag • very ABC', price: 9 },
  { id: 'cheap-shades', cat: 'Souvenirs', name: 'Neon Plastic Shades', desc: 'Wearable • +1 Swag', price: 10 },
  { id: 'bandana', cat: 'Souvenirs', name: 'I ♥ VEGAS Bandana', desc: 'Wearable • +1 Swag', price: 12 },
  { id: 'shot-glass', cat: 'Souvenirs', name: 'Shot Glass', desc: 'Collectible. For milk.', price: 5 },
  { id: 'snow-globe', cat: 'Souvenirs', name: 'Strip Snow Globe', desc: 'Collectible. It never snows here.', price: 9 },
  { id: 'magnet', cat: 'Souvenirs', name: 'Welcome Sign Magnet', desc: 'Collectible.', price: 4 },
  { id: 'cards', cat: 'Essentials', name: 'Playing Cards', desc: 'Lou practices card counting. Gets to four.', price: 3 },
  { id: 'sunscreen', cat: 'Essentials', name: 'SPF 50 Sunscreen', desc: 'For the ears. The ears burn.', price: 11 },
  { id: 'charger', cat: 'Essentials', name: 'Phone Charger', desc: 'Lou does not have a phone. Peak degen purchase.', price: 25 },
  { id: 'aspirin', cat: 'Essentials', name: 'Aspirin', desc: 'Hangover cure. Cures nothing.', price: 6 },
  { id: 'lottery', cat: 'Essentials', name: 'Lottery Ticket', desc: 'Nevada has no lottery. Try the slots.', price: 0, tag: 'N/A' },
];

const CATS: AbcCategory[] = ['Smokes', 'Vape', 'Snacks & Drinks', 'Souvenirs', 'Essentials'];

export interface AbcShopCallbacks {
  getCash: () => number;
  setCash: (amount: number) => void;
  /** Apply the item; ok:false refuses it (no charge) with a message. */
  apply: (item: AbcItem) => { ok: boolean; msg: string };
  owns: (id: string) => boolean;
  onOutcome: (msg: string) => void;
}

export class AbcShopController {
  private readonly dialog = document.getElementById('abc-dialog') as HTMLDialogElement;
  private tab: AbcCategory = 'Smokes';
  private label = 'ABC Stores';
  private status = '';

  constructor(
    private readonly sfx: SoundFX,
    private readonly callbacks: AbcShopCallbacks
  ) {
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      this.dialog.addEventListener('click', (e) => {
        if (e.target === this.dialog) this.dialog.close();
      });
    }
  }

  public open(label = 'ABC Stores'): void {
    this.label = label;
    this.status = 'Aloha! Stock up on smokes, vapes, snacks & souvenirs.';
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
  }

  public isOpen(): boolean {
    return this.dialog.open;
  }

  private render(): void {
    const cash = this.callbacks.getCash();
    const items = ABC_ITEMS.filter((i) => i.cat === this.tab);
    this.dialog.innerHTML = `
      <div class="casino-header">
        <div><h1>${this.label}</h1><p class="casino-sub">Smokes • Vapes • Snacks • Souvenirs • 21+ (we ID under 40)</p></div>
        <div class="casino-bank-wrap"><span class="stat-label">Cash</span><strong class="casino-bank">$${cash}</strong></div>
      </div>
      <div class="abc-tabs" role="tablist">${CATS.map((c) => `<button type="button" role="tab" class="abc-tab${c === this.tab ? ' abc-tab--on' : ''}" data-tab="${c}">${c}</button>`).join('')}</div>
      <div class="abc-grid">${items
        .map((it) => {
          const owned = this.callbacks.owns(it.id);
          const price = it.tag === 'N/A' ? 'N/A' : owned ? 'Owned' : `$${it.price}`;
          const hl = it.tag && it.tag !== 'N/A' ? ' abc-card--highlight' : '';
          const vape = it.cat === 'Vape' ? ' abc-card--vape' : '';
          return `<button type="button" class="abc-card${hl}${vape}" data-item="${it.id}">${it.tag && it.tag !== 'N/A' ? `<small class="abc-tag">${it.tag}</small>` : ''}<strong>${it.name}</strong><span>${it.desc}</span><em>${price}</em></button>`;
        })
        .join('')}</div>
      <p class="casino-result" aria-live="polite">${this.status}</p>
      <form method="dialog" class="casino-footer"><button type="submit" class="action-btn">Mahalo, bye</button></form>`;
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab as AbcCategory;
        this.render();
      })
    );
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-item]').forEach((btn) => btn.addEventListener('click', () => this.buy(btn.dataset.item!)));
  }

  private buy(id: string): void {
    const item = ABC_ITEMS.find((i) => i.id === id)!;
    if (item.tag === 'N/A') {
      this.sfx.playBusted();
      this.status = 'Clerk: “Nevada doesn’t have a lottery, hon. That’s what the casinos are for.”';
      return this.render();
    }
    const owned = this.callbacks.owns(item.id);
    if (!owned && this.callbacks.getCash() < item.price) {
      this.sfx.playBusted();
      this.status = `Need $${item.price}. Go hustle some tourists [B] or hit the tables.`;
      return this.render();
    }
    const res = this.callbacks.apply(item);
    if (!res.ok) {
      this.sfx.playBusted();
      this.status = res.msg;
      return this.render();
    }
    if (!owned) this.callbacks.setCash(this.callbacks.getCash() - item.price);
    this.sfx.playCash();
    this.status = res.msg;
    this.callbacks.onOutcome(res.msg);
    this.render();
  }
}
