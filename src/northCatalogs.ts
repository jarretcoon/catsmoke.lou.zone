import type { AbcItem, ShopCatalog } from './abcShop';

/*
 * Menus for the north end (Sahara Ave): the Bonanza Gift Shop ("World's Largest Gift Shop", 2440 Las Vegas
 * Blvd S) and the Circle K at Bob Stupak Ave. They open in the shared ABC Stores dialog (abcShop.ts) and pay
 * out through `fx` (shopFx.ts). The Bonanza's own signs set the menu: 99¢ souvenirs, 3 T-shirts for $10,
 * casino games & supplies, Western gifts, hats, belts, turquoise jewelry, sports goods, sweatshirts.
 */

const item = (id: string, cat: string, name: string, desc: string, price: number, fx: AbcItem['fx'], tag?: string): AbcItem => ({ id, cat, name, desc, price, fx, tag });

export const NORTH_CATALOGS: Record<string, ShopCatalog> = {
  bonanza: {
    title: "Bonanza Gift Shop • World's Largest Gift Shop",
    sub: '99¢ souvenirs • 3 T-shirts for $10 • Western gifts • Casino games & supplies • Open till midnight',
    greeting: 'Howdy! Forty thousand square feet of Las Vegas. If it fits on a magnet, we have it.',
    bye: 'Y’all come back now',
    items: [
      // the 99¢ wall
      item('bz-magnet', '99¢ Wall', 'Welcome Sign Magnet', 'Ninety-nine cents of pure Fabulous. Collectible.', 1, { collect: true, degen: [3, 'Souvenir Hoarder'] }, '99¢'),
      item('bz-keychain-dice', '99¢ Wall', 'Fuzzy Dice Keychain', 'Lou bats it under the shelf in nine seconds flat. Collectible.', 1, { collect: true, degen: [3, 'Souvenir Hoarder'] }, '99¢'),
      item('bz-shot-glass', '99¢ Wall', 'Rhinestone Shot Glass', 'From the wall of four thousand shot glasses. For milk. Collectible.', 1, { collect: true, degen: [4, 'Souvenir Hoarder'] }, '99¢'),
      item('bz-postcards', '99¢ Wall', 'Postcard 10-Pack', 'The Strip, the STRAT, a jackalope. Lou mails one to the dog. Collectible.', 1, { collect: true }, '99¢'),
      // T-shirts: 3 for $10
      item('bz-tee-3pack', 'T-Shirts', '3 T-Shirts for $10', '“What happens in Vegas…”, an Elvis and a cat in sunglasses. Collectible.', 10, { collect: true, degen: [10, 'Tourist Uniform'] }, '3/$10'),
      item('bz-tee-vgk', 'T-Shirts', 'Golden Knights Tee', 'Gold and steel. Lou wears it as a dress. Collectible.', 15, { collect: true, degen: [6, 'Vegas Born'] }),
      item('bz-hoodie', 'T-Shirts', 'LAS VEGAS Zip Hoodie', 'For the 3 AM desert chill. Doubles as a cat bed. Collectible.', 25, { collect: true }),
      // Western gifts, hats, belts
      item('cowboy-hat', 'Western', 'Rhinestone Cowboy Hat', 'Wearable • +2 Swag. Off the hat wall, under the giant longhorns.', 39, { wear: 'cowboy-hat' }, 'DEAL'),
      item('trucker-hat', 'Western', 'VEGAS Trucker Hat', 'Wearable • +1 Swag', 12, { wear: 'trucker-hat' }),
      item('bandana', 'Western', 'I ♥ VEGAS Bandana', 'Wearable • +1 Swag. Outlaw energy.', 8, { wear: 'bandana' }),
      item('bz-belt', 'Western', 'Silver Dollar Belt Buckle', 'Big as Lou’s head, says LAS VEGAS NEVADA. Collectible.', 18, { collect: true, degen: [8, 'Rhinestone Cowboy'] }),
      item('bz-turquoise', 'Western', 'Turquoise & Silver Bracelet', 'From the jewelry cases at the back, 50% off (always). Collectible.', 29, { collect: true, degen: [6, 'Rhinestone Cowboy'] }),
      // casino games & supplies
      item('bz-dice', 'Casino Supplies', 'Real Casino Dice (used)', 'Drilled and cancelled, off a real craps table. Feels lucky. +tips for 3 min.', 4, { tip: 1.2, secs: 180, icon: '🎲' }),
      item('bz-cards', 'Casino Supplies', 'Casino Deck (drilled)', 'A retired deck from a Strip blackjack shoe. Collectible.', 2, { collect: true, degen: [4, 'Card Counter (Self-Taught)'] }),
      item('bz-chips', 'Casino Supplies', 'Poker Chip Set (300)', 'Clay-feel chips in an aluminum case. Lou guards them. Collectible.', 35, { collect: true, degen: [12, 'Home Game Host'] }),
      item('bz-scratcher', 'Casino Supplies', 'Lucky Jackpot Scratcher', 'A novelty scratcher from the register. One in five pays $25.', 3, { gamble: { chance: 0.2, win: 25, winMsg: 'Scratched a cherry row! +$25 (the clerk didn’t even blink).', loseMsg: 'Scratched… nothing. Lou eats the ticket.' }, degen: [3, 'Scratch-Off Philosopher'] }),
      // kitsch + snacks
      item('cheap-shades', 'Kitsch', 'Elvis Gold Shades', 'Wearable • +1 Swag. Thank you, thank you very much.', 7, { wear: 'cheap-shades' }),
      item('bz-snowglobe', 'Kitsch', 'STRAT Snow Globe', 'It never snows on the Strip. Except in here. Collectible.', 9, { collect: true, degen: [6, 'Souvenir Hoarder'] }),
      item('bz-showgirl', 'Kitsch', 'Bobblehead Showgirl', 'Feathers, sequins, a spring for a neck. Collectible.', 12, { collect: true, degen: [6, 'Souvenir Hoarder'] }),
      item('bz-slot-bank', 'Kitsch', 'Slot Machine Piggy Bank', 'Pull the handle, it eats your quarter. Very realistic. Collectible.', 16, { collect: true, degen: [10, 'Degenerate in Training'] }),
      item('bz-fudge', 'Snacks', 'Las Vegas Fudge Slab', 'Chocolate-walnut, the size of a brick. Sugar rush: sprint +15% for 2 min.', 6, { speed: 1.15, secs: 120, icon: '🍫' }),
      item('bz-jerky', 'Snacks', 'Cowboy Beef Jerky', 'Peppered. Lou would like to discuss it. Tips ×1.15 for 2 min.', 8, { tip: 1.15, secs: 120, icon: '🥩' }),
    ],
  },
  'circle-k-stupak': {
    title: 'Circle K • Bob Stupak Ave',
    sub: 'Fuel • Smokes • Polar Pop • Open 24 hours',
    greeting: 'Pump 4 is broken, the Polar Pop is not.',
    bye: 'Have a good one',
    items: [
      item('ck-smokes', 'Smokes', 'Pack of Smokes', 'The cheapest pack on the north end. +20 smokes.', 9, { smokes: 20 }),
      item('ck-polar-pop', 'Drinks', 'Polar Pop (44 oz)', 'A bucket of ice and cola for under a dollar. Sprint +10% for 3 min.', 1, { speed: 1.1, secs: 180, icon: '🥤' }, '99¢'),
      item('ck-energy', 'Drinks', 'Energy Drink', 'Neon-green. Sprint +25% for 2 min.', 4, { speed: 1.25, secs: 120, icon: '⚡' }),
      item('ck-hot-dog', 'Food', 'Roller-Grill Hot Dog', 'Been rolling since the STRAT opened. Tips ×1.1 for 2 min.', 2, { tip: 1.1, secs: 120, icon: '🌭' }),
      item('ck-scratcher', 'Lottery', 'Nevada Scratcher?', 'Nevada has no lottery. The clerk sells you a gum ball instead. Collectible.', 1, { collect: true, degen: [2, 'Nevada Law Student'] }),
    ],
  },
};
