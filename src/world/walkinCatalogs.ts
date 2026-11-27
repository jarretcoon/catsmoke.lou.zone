import type { AbcItem } from '../abcShop';
import { CATALOGS } from '../shopCatalogs';

/*
 * Menus for the build-5 walk-in casinos' bars and shops. They open in the shared shop dialog
 * (abcShop.ts) like the LINQ Promenade's, so they pay out through the same economy: buzz, timed food
 * buffs, wearables, collectibles and degen points. Prices are rounded 2026 resort prices.
 */

const item = (id: string, cat: string, name: string, desc: string, price: number, fx: AbcItem['fx'], tag?: string): AbcItem => ({ id, cat, name, desc, price, fx, tag });
const drink = (id: string, name: string, desc: string, price: number, buzz: number, extra: AbcItem['fx'] = {}, tag?: string) => item(id, 'Drinks', name, desc, price, { buzz, ...extra }, tag);
const food = (id: string, name: string, desc: string, price: number, tip: number, speed: number, secs: number, icon: string, tag?: string) => item(id, 'Food', name, desc, price, { tip, speed, secs, icon }, tag);

Object.assign(CATALOGS, {
  // ---------------------------------------------------------------- Wynn Las Vegas
  'wynn-parasol-up': {
    title: 'Parasol Up',
    sub: 'The bar under the parasols • Wynn Las Vegas',
    greeting: 'Welcome to Parasol Up. Look up.',
    bye: 'Enjoy the evening',
    items: [
      drink('pu-margarita', 'Parasol Margarita', 'Blood orange, Cointreau, a sugared rim. 🍹 for 2 min.', 24, 120),
      drink('pu-champagne', 'Glass of Champagne', 'It’s the Wynn. 🍹 for 90 s and Swag points for the pinky.', 28, 90, { degen: [8, 'Five-Star Feline'] }),
      drink('pu-espresso', 'Espresso Martini', '🍹 for 2 min and a little faster on the way out.', 25, 120, { speed: 1.1, secs: 120, icon: '☕' }),
      drink('pu-mocktail', 'Garden Spritz (no booze)', 'Elderflower and cucumber. A lap of cool water. 🍹 for 45 s.', 14, 45),
      food('pu-truffle-fries', 'Truffle Fries', 'Tips ×1.2 for 2 min.', 18, 1.2, 1, 120, '🍟'),
    ],
  },
  'wynn-signature': {
    title: 'Wynn Signature Shop',
    sub: 'Robes • Linens • Fragrance • Wynn keepsakes',
    greeting: 'Good evening. Everything here is from the rooms upstairs.',
    bye: 'Thank you for visiting Wynn',
    items: [
      item('wynn-bowtie', 'Wear', 'Velvet Bow Tie', 'Wearable • +1 Swag. Wynn red, for the salon.', 45, { wear: 'bowtie' }, 'NEW'),
      item('wynn-candle', 'Keepsakes', 'Atrium Flower Candle', 'Smells like the atrium. Collectible.', 48, { collect: true, degen: [10, 'Five-Star Feline'] }),
      item('wynn-butterfly-pin', 'Keepsakes', 'Butterfly Mosaic Pin', 'The floor mosaic, tiny, in enamel. Collectible.', 32, { collect: true }),
      item('wynn-chip-set', 'Keepsakes', 'Souvenir Chip Set', 'Wynn chips in a case. Worth nothing at the cage. Collectible.', 40, { collect: true, degen: [8, 'Souvenir Hoarder'] }),
      item('wynn-truffles', 'Snacks', 'Box of Truffles', 'Tips ×1.25 for 2 min.', 24, { tip: 1.25, secs: 120, icon: '🍫' }),
    ],
  },
});
