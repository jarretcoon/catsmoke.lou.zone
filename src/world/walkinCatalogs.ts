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
  // ---------------------------------------------------------------- Encore
  'encore-eastside': {
    title: 'Eastside Lounge',
    sub: 'The red lounge on the Encore casino floor',
    greeting: 'Grab a seat, the piano starts at nine.',
    bye: 'Good luck out there',
    items: [
      drink('es-butterfly', 'Red Butterfly', 'Hibiscus, gin, a little sparkle. 🍹 for 2 min.', 23, 120),
      drink('es-old-fashioned', 'Encore Old Fashioned', '🍹 for 2 min. Swag points for the big ice cube.', 26, 120, { degen: [8, 'Five-Star Feline'] }),
      drink('es-prosecco', 'Prosecco', '🍹 for 90 s.', 18, 90),
      food('es-sliders', 'Wagyu Sliders', 'Tips ×1.3 for 2 min.', 28, 1.3, 1, 120, '🍔'),
    ],
  },
  'encore-boutique': {
    title: 'Encore Boutique',
    sub: 'Gifts and jewellery on the Encore Esplanade',
    greeting: 'Welcome to the Esplanade.',
    bye: 'Enjoy Encore',
    items: [
      item('enc-aviators', 'Wear', 'Gold Aviators', 'Wearable • +1 Swag. For the pool at Encore Beach Club.', 60, { wear: 'aviators' }),
      item('enc-butterfly', 'Keepsakes', 'Red Glass Butterfly', 'Like the ones in the lobby. Collectible.', 38, { collect: true, degen: [10, 'Five-Star Feline'] }),
      item('enc-chandelier', 'Keepsakes', 'Jewelled Chandelier Ornament', 'A tiny Esplanade chandelier for the tree. Collectible.', 44, { collect: true }),
      item('enc-macarons', 'Snacks', 'Box of Macarons', 'Tips ×1.2 for 2 min, and a sprint for 1 min.', 22, { tip: 1.2, speed: 1.1, secs: 120, icon: '🍬' }),
    ],
  },
  // ---------------------------------------------------------------- Harrah's
  'harrahs-piano-bar': {
    title: "Piano Bar at Harrah's",
    sub: 'Dueling pianos nightly • requests welcome',
    greeting: 'Two pianos, one cat. What do you want to hear?',
    bye: 'Tip the piano players!',
    items: [
      drink('hp-hurricane', 'Mardi Gras Hurricane', 'Rum, passion fruit, a bead necklace. 🍹 for 2 min.', 19, 120, { degen: [5, 'Krewe Member'] }),
      drink('hp-beer', 'Draft Beer', '🍹 for 90 s.', 11, 90),
      drink('hp-purple', 'Purple Rain Martini', 'The house colour. 🍹 for 2 min.', 18, 120),
      item('hp-request', 'Requests', 'Request a Song ($20 tip)', 'They play "Piano Man" for Lou. The whole room sings. Tips ×1.3 for 3 min.', 20, { tip: 1.3, secs: 180, icon: '🎹', degen: [10, 'Piano Man'] }, 'FUN'),
    ],
  },
  'harrahs-fulton': {
    title: 'Fulton Street Food Hall',
    sub: "Pizza • Bao • Ice cream • Coffee • Harrah's",
    greeting: 'Order at the counter!',
    bye: 'Enjoy',
    items: [
      food('fs-pizza', 'NY Slice', 'Tips ×1.2 for 2 min.', 7, 1.2, 1, 120, '🍕'),
      food('fs-bao', 'Pork Belly Bao', 'Tips ×1.25 for 2 min.', 9, 1.25, 1, 120, '🥟'),
      food('fs-icecream', 'Ice Cream Cone', 'A sprint for 90 s. Brain freeze included.', 6, 1, 1.15, 90, '🍦'),
      food('fs-coffee', 'Cold Brew', 'A sprint for 2 min.', 6, 1, 1.12, 120, '☕'),
    ],
  },
});
