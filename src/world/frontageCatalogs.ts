import type { AbcItem } from '../abcShop';
import { CATALOGS } from '../shopCatalogs';

/*
 * Menus for the Strip frontage shops (frontageShops*.ts). They open in the shared shop dialog
 * (abcShop.ts) like the LINQ Promenade's, and pay out through the same economy (shopFx.ts): the 🍹
 * buzz, timed food buffs, smokes for the stash, Swag wearables, collectibles and degen points.
 * Prices are rounded 2026 Strip prices; the effects are cat logic.
 */

const item = (id: string, cat: string, name: string, desc: string, price: number, fx: AbcItem['fx'], tag?: string): AbcItem => ({ id, cat, name, desc, price, fx, tag });
const drink = (id: string, name: string, desc: string, price: number, buzz: number, extra: AbcItem['fx'] = {}, tag?: string) => item(id, 'Drinks', name, desc, price, { buzz, ...extra }, tag);
const food = (id: string, name: string, desc: string, price: number, tip: number, speed: number, secs: number, icon: string, tag?: string) => item(id, 'Food', name, desc, price, { tip, speed, secs, icon }, tag);

Object.assign(CATALOGS, {
  // ================================================================ Tropicana Ave → Harmon Ave, west
  'hersheys': {
    title: "HERSHEY'S CHOCOLATE WORLD",
    sub: 'Two floors of chocolate • New York-New York, at Tropicana',
    greeting: 'Welcome to Hershey’s! Free sample? It’s a Kiss. Lou can’t have chocolate. Lou wants it more now.',
    bye: 'Have a sweet night',
    items: [
      item('hz-kisses', 'Candy', 'Bag of Kisses (Pick & Mix)', 'Silver foil, one pound. Lou bats them under the shelf. Sprint +15% for 90 s.', 12, { speed: 1.15, secs: 90, icon: '🍫' }),
      item('hz-reeses', 'Candy', 'Giant Reese’s Cup', 'The size of Lou’s head. Tips ×1.3 for 2 min.', 15, { tip: 1.3, secs: 120, icon: '🥜' }, 'GIANT'),
      item('hz-smores', 'Bakery', 'S’mores Bar', 'Marshmallow on everything, whiskers included. Tips ×1.2, sprint +10% for 2 min.', 9, { tip: 1.2, speed: 1.1, secs: 120, icon: '🍫' }),
      item('hz-shake', 'Bakery', 'Chocolate Milkshake', 'The milk part is the point. Sprint +25% for 60 s.', 11, { speed: 1.25, secs: 60, icon: '🥤' }),
      item('hz-liberty', 'Souvenirs', 'Chocolate Statue of Liberty (mini)', 'A tiny copy of the 800-lb one inside. Collectible.', 25, { collect: true, degen: [10, 'Chocoholic'] }),
      item('hz-kiss-plush', 'Souvenirs', 'Giant Kiss Plush', 'A silver pillow with a paper plume. Lou naps on it. Collectible.', 30, { collect: true }),
      item('trucker-hat', 'Souvenirs', 'Hershey’s Trucker Hat', 'Wearable • +1 Swag', 22, { wear: 'trucker-hat' }),
    ],
  },
  'crack-shack': {
    title: 'The Crack Shack',
    sub: 'Fried chicken & eggs • outside Park MGM, right on the Strip',
    greeting: 'Welcome to the coop! Chicken or egg first? Lou says chicken.',
    bye: 'Peace, love & chicken',
    items: [
      food('cs-firebird', 'Firebird Sandwich', 'Spicy fried chicken, ranch, pickles. Tips ×1.35 for 3 min.', 17, 1.35, 1, 180, '🐔', 'LOU’S PICK'),
      food('cs-coop', 'Coop Fried Chicken (4 pc)', 'Lou eats the skin, then the chicken, then the box. Tips ×1.3 for 2 min.', 22, 1.3, 1, 120, '🍗'),
      food('cs-nuggets', 'Chicken Oysters', 'The two best bites of the bird, for a cat who knows. Sprint +20% for 90 s.', 12, 1, 1.2, 90, '🍗'),
      food('cs-fries', 'Schmaltz Fries', 'Fried in chicken fat. Of course. Tips ×1.15 for 90 s.', 8, 1.15, 1, 90, '🍟'),
      drink('cs-frose', 'Frosé', 'Frozen rosé on the Strip. 🍹 for 2 min.', 15, 120),
      drink('cs-beer', 'Tallboy', '🍹 for 90 s.', 10, 90),
    ],
  },
  'cvs-parkmgm': {
    title: 'CVS Pharmacy',
    sub: 'Park MGM, 3770 S Las Vegas Blvd • Snacks • Sunscreen • Phone chargers',
    greeting: 'Welcome to CVS. Your receipt will be four feet long.',
    bye: 'Have a great day',
    items: [
      item('cvs-smokes', 'Smokes', 'Cigarettes?', 'CVS quit tobacco in 2014. The clerk points across the Strip to ABC Stores. Lou is outraged.', 0, { degen: [5, 'Asked CVS for Cigs'] }, 'NOPE'),
      item('cvs-water', 'Snacks & Drinks', 'Gallon of Water', 'It’s 108°F. Lou drinks it from the jug. Sprint +10% for 2 min.', 4, { speed: 1.1, secs: 120, icon: '💧' }),
      item('cvs-chips', 'Snacks & Drinks', 'Party-Size Chips', 'Tips ×1.1 for 2 min.', 6, { tip: 1.1, secs: 120, icon: '🥔' }),
      drink('cvs-seltzer', 'Hard Seltzer 4-Pack', 'Black cherry. 🍹 for 2 min.', 13, 120),
      item('cheap-shades', 'Essentials', 'Drugstore Sunglasses', 'Wearable • +1 Swag', 15, { wear: 'cheap-shades' }),
      item('cvs-charger', 'Essentials', 'Phone Charger (6 ft)', 'For the phone Lou still doesn’t own. Peak degen.', 25, { degen: [12, 'Bought a Charger, Has No Phone'] }),
      item('cvs-receipt', 'Essentials', 'ExtraCare Receipt', 'Four feet of coupons. Lou unspools it down the aisle. Collectible.', 1, { collect: true, degen: [6, 'Coupon Cat'] }),
    ],
  },
  // ================================================================ Tropicana Ave → Harmon Ave, east
  'walgreens-polo': {
    title: 'Walgreens',
    sub: '3765 S Las Vegas Blvd • Open 24 hours • Photo • Smokes • Snacks',
    greeting: 'Walgreens, open 24 hours. Yes, even now. Especially now.',
    bye: 'Be well',
    items: [
      item('wg-pack', 'Smokes', 'Pack of Cigarettes', '+20 smokes. They card Lou. He shows a paw.', 13, { smokes: 20 }),
      item('wg-carton', 'Smokes', 'Carton', '+200 smokes, Strip-pharmacy markup included.', 115, { smokes: 200 }, 'BULK'),
      item('wg-energy', 'Snacks & Drinks', 'Energy Drink', 'Zoomies: sprint +30% for 60 s.', 5, { speed: 1.3, secs: 60, icon: '⚡' }),
      drink('wg-tallboy', '24 oz Tallboy', 'For the walk to the Bellagio. 🍹 for 90 s.', 5, 90),
      item('wg-candy', 'Snacks & Drinks', 'King-Size Candy Bar', 'Tips ×1.1 for 90 s.', 3, { tip: 1.1, secs: 90, icon: '🍬' }),
      item('wg-aspirin', 'Essentials', 'Hangover Kit', 'Aspirin, electrolytes, regret. Clears your head: −1 wanted star.', 12, { heat: 1 }),
      item('wg-postcards', 'Essentials', 'Strip Postcards', 'Ten views of everywhere Lou has been thrown out of. Collectible.', 5, { collect: true }),
    ],
  },
  'jd-sports': {
    title: 'JD Sports',
    sub: 'Flagship • BLVD, 3747 S Las Vegas Blvd • Sneakers • Streetwear',
    greeting: 'Welcome to JD. Size? Lou’s a men’s zero.',
    bye: 'Stay fresh',
    items: [
      item('jd-runners', 'Sneakers', 'Retro Runners', 'Lou can’t wear them. He sleeps in the box. Sprint +20% for 3 min (he’s inspired).', 140, { speed: 1.2, secs: 180, icon: '👟' }, 'HYPE'),
      item('jd-slides', 'Sneakers', 'Pool Slides', 'Sprint +10% for 2 min. Squeak, squeak.', 35, { speed: 1.1, secs: 120, icon: '🩴' }),
      item('trucker-hat', 'Streetwear', 'Snapback Cap', 'Wearable • +1 Swag', 32, { wear: 'trucker-hat' }),
      item('cheap-shades', 'Streetwear', 'Shield Shades', 'Wearable • +1 Swag', 25, { wear: 'cheap-shades' }),
      item('jd-tee', 'Streetwear', 'Las Vegas Box-Logo Tee', 'Exclusive to the Strip flagship. Collectible.', 40, { collect: true, degen: [8, 'Hypebeast'] }),
    ],
  },
  'adidas-blvd': {
    title: 'adidas',
    sub: 'BLVD • Three stripes, one Strip',
    greeting: 'Welcome to adidas. Lou already has stripes. Mackerel ones.',
    bye: 'Impossible is nothing',
    items: [
      item('ad-sambas', 'Shoes', 'Samba (white/black)', 'The shoe of 2024, 2025 and 2026. Sprint +20% for 3 min.', 100, { speed: 1.2, secs: 180, icon: '👟' }),
      item('ad-tracksuit', 'Apparel', 'Three-Stripe Track Jacket', 'Lou wears it as a cape. Collectible.', 85, { collect: true, degen: [8, 'Tracksuit Era'] }),
      item('bandana', 'Apparel', 'Trefoil Bandana', 'Wearable • +1 Swag', 18, { wear: 'bandana' }),
    ],
  },
  'lululemon-blvd': {
    title: 'lululemon',
    sub: 'BLVD • Yoga • Run • Train',
    greeting: 'Namaste. Lou does nine hours of cat pose a day.',
    bye: 'Sweat once a day',
    items: [
      item('lu-belt', 'Accessories', 'Everywhere Belt Bag', 'Holds smokes, a lighter and a stolen chip. Collectible.', 38, { collect: true, degen: [6, 'Belt Bag Cat'] }),
      item('lu-mat', 'Accessories', 'Yoga Mat', 'Lou claims it immediately. Tips ×1.15 for 3 min (he’s zen).', 98, { tip: 1.15, secs: 180, icon: '🧘' }),
    ],
  },
  'hm-blvd': {
    title: 'H&M',
    sub: 'BLVD • Fashion and quality at the best price',
    greeting: 'Hi! Everything on the front table is $9.99.',
    bye: 'Bye',
    items: [
      item('bowtie', 'Accessories', 'Party Bow Tie', 'Wearable • +1 Swag', 13, { wear: 'bowtie' }),
      item('hm-shirt', 'Clothes', 'Vegas Print Shirt', 'Palm trees and dice. Collectible.', 25, { collect: true }),
      item('hm-socks', 'Clothes', 'Socks 5-Pack', 'Lou steals one from every pair. Collectible.', 10, { collect: true, degen: [4, 'Sock Thief'] }),
    ],
  },
  'puma-blvd': {
    title: 'PUMA',
    sub: 'BLVD • Forever faster',
    greeting: 'Welcome to PUMA. A big cat on the sign, a small cat at the door.',
    bye: 'Forever faster',
    items: [
      item('pm-suede', 'Shoes', 'Suede Classics', 'A cat brand for a cat. Sprint +25% for 2 min.', 80, { speed: 1.25, secs: 120, icon: '🐆' }, 'CAT APPROVED'),
      item('pm-cap', 'Apparel', 'Leaping-Cat Cap', 'Wearable • +1 Swag', 28, { wear: 'trucker-hat' }),
    ],
  },
  'pandora-blvd': {
    title: 'Pandora',
    sub: 'BLVD • Charms • Bracelets',
    greeting: 'Hello! Would you like a charm for the trip?',
    bye: 'Enjoy',
    items: [
      item('pd-dice', 'Charms', 'Silver Dice Charm', 'Snake eyes, forever. Collectible.', 55, { collect: true, degen: [6, 'Charmed'] }),
      item('pd-welcome', 'Charms', 'Las Vegas Sign Charm', 'A tiny Welcome sign for the collar. Collectible.', 65, { collect: true }),
      item('gold-chain', 'Necklaces', 'Gold Chain (Lou size)', 'Wearable • +2 Swag', 250, { wear: 'gold-chain' }),
    ],
  },
  'miniso-blvd': {
    title: 'MINISO',
    sub: 'BLVD • Plush • Blind boxes • Snacks',
    greeting: 'Welcome to MINISO! Blind boxes are by the door.',
    bye: 'See you',
    items: [
      item('mn-blind', 'Blind Boxes', 'Blind Box', 'Could be anything. It’s a tiny cat. It’s always a tiny cat. Collectible.', 13, { collect: true, gamble: { chance: 0.12, win: 60, winMsg: 'A SECRET RARE! A reseller on the sidewalk pays $60 for it.', loseMsg: 'Another tiny cat. Lou puts it with the others.' } }, 'GAMBLE'),
      item('mn-plush', 'Plush', 'Giant Cat Plush', 'Bigger than Lou. Lou is threatened. Collectible.', 30, { collect: true }),
      item('mn-candy', 'Snacks', 'Gummy Peach Pack', 'Tips ×1.1 for 90 s.', 4, { tip: 1.1, secs: 90, icon: '🍑' }),
    ],
  },
  // ================================================================ Harmon Ave → Flamingo Rd, east
  'pbr-rockbar': {
    title: 'PBR Rock Bar & Grill',
    sub: 'Miracle Mile Shops • on the Strip at Harmon',
    greeting: 'Welcome to PBR! The mechanical bull is resting. The beers are not.',
    bye: 'Rock on',
    items: [
      drink('pbr-giant', '100 oz Beer Tower', 'For the table. Lou is the table. 🍹 for 4 min.', 38, 240, { degen: [10, 'Tower Cat'] }, 'GIANT'),
      drink('pbr-can', 'Tallboy of PBR', '🍹 for 90 s.', 9, 90),
      food('pbr-wings', 'Wings (dozen)', 'Lou eats the sauce first. Tips ×1.25 for 2 min.', 19, 1.25, 1, 120, '🍗'),
    ],
  },
  'rosa-mexicano': {
    title: 'Rosa Mexicano',
    sub: 'Miracle Mile Shops • indoor and outdoor bars on the Strip',
    greeting: 'Bienvenidos! Guacamole made at your table. Lou is the table again.',
    bye: 'Hasta luego',
    items: [
      food('rm-guac', 'Tableside Guacamole', 'Mashed right in front of Lou. Tips ×1.3 for 2 min.', 19, 1.3, 1, 120, '🥑', 'FAMOUS'),
      drink('rm-marg', 'Frozen Pomegranate Margarita', 'Pink, like everything here. 🍹 for 2 min.', 18, 120),
      food('rm-tacos', 'Carnitas Tacos', 'Tips ×1.2, sprint +10% for 2 min.', 22, 1.2, 1.1, 120, '🌮'),
    ],
  },
  'pfchangs': {
    title: "P.F. Chang's",
    sub: 'Planet Hollywood • 3667 S Las Vegas Blvd • patio on the Strip',
    greeting: 'Welcome! Chopsticks? Lou prefers paws.',
    bye: 'Thank you',
    items: [
      food('pf-wraps', 'Chicken Lettuce Wraps', 'Lou eats the chicken, leaves the lettuce. Tips ×1.3 for 2 min.', 17, 1.3, 1, 120, '🥬', 'CLASSIC'),
      food('pf-dynamite', 'Dynamite Shrimp', 'Sprint +20% for 90 s.', 16, 1, 1.2, 90, '🍤'),
      food('pf-fortune', 'Fortune Cookie', '“You will find a cigarette on the Strip.” Tips ×1.1 for 60 s.', 1, 1.1, 1, 60, '🥠'),
      drink('pf-mai', 'Mai Tai', '🍹 for 2 min.', 15, 120),
    ],
  },
  'hexx': {
    title: 'Hexx Kitchen + Bar',
    sub: 'Paris Las Vegas • bean-to-bar chocolate • the Eiffel Tower overhead',
    greeting: 'Bonjour! Our chocolate is made from the bean, right here. Not for cats. Mostly.',
    bye: 'Au revoir',
    items: [
      item('hx-bar', 'Chocolate', 'Single-Origin Bar', 'Made in the window. Lou only smells it. Tips ×1.2 for 2 min.', 12, { tip: 1.2, secs: 120, icon: '🍫' }),
      item('hx-truffles', 'Chocolate', 'Box of Truffles', 'A gift for a showgirl. Collectible.', 28, { collect: true, degen: [6, 'Chocolatier'] }),
      food('hx-crepe', 'Nutella Crêpe', 'Sprint +15% for 90 s.', 14, 1, 1.15, 90, '🥞'),
      drink('hx-mimosa', 'Mimosa (Eiffel View)', '🍹 for 2 min.', 16, 120),
    ],
  },
  'alexxas': {
    title: "Alexxa's",
    sub: 'Paris Las Vegas • bar & patio facing the Bellagio fountains',
    greeting: 'Bienvenue! Best seats for the fountains are on the patio.',
    bye: 'À bientôt',
    items: [
      drink('ax-rose', 'Frozen Rosé', '🍹 for 2 min.', 17, 120),
      drink('ax-french75', 'French 75', '🍹 for 90 s and Swag points for the pinky.', 19, 90, { degen: [6, 'Très Chic'] }),
      food('ax-frites', 'Truffle Frites', 'Tips ×1.15 for 90 s.', 12, 1.15, 1, 90, '🍟'),
    ],
  },
  'wahlburgers': {
    title: 'Wahlburgers',
    sub: 'Grand Bazaar Shops • burgers, tots, a full bar',
    greeting: 'Welcome to Wahlburgers! Paul says hi. Mark is not here.',
    bye: 'Wicked good, see ya',
    items: [
      food('wb-our', 'Our Burger', 'Government cheese, the secret sauce. Tips ×1.35 for 3 min.', 15, 1.35, 1, 180, '🍔', 'HOUSE'),
      food('wb-tots', 'Tots', 'Sprint +15% for 90 s.', 7, 1, 1.15, 90, '🥔'),
      drink('wb-frappe', 'Spiked Frappe', 'A boozy milkshake. 🍹 for 2 min.', 14, 120),
    ],
  },
  'ben-jerrys': {
    title: "Ben & Jerry's",
    sub: 'Grand Bazaar Shops • scoop shop',
    greeting: 'Hi! Cherry Garcia or Phish Food? Lou votes Phish Food on principle.',
    bye: 'Peace, love & ice cream',
    items: [
      food('bj-phish', 'Phish Food Cone', 'Fish in name only. Lou is disappointed and eats it anyway. Sprint +20% for 90 s.', 7, 1, 1.2, 90, '🍦'),
      food('bj-shake', 'Cookie Dough Shake', 'Tips ×1.2 for 2 min.', 9, 1.2, 1, 120, '🥤'),
    ],
  },
  'itsugar': {
    title: "IT'SUGAR",
    sub: 'Grand Bazaar Shops • a candy department store',
    greeting: 'Welcome to IT’SUGAR! The gummy bear is five pounds. Yes, five.',
    bye: 'Stay sweet',
    items: [
      item('is-bear', 'Candy', 'Five-Pound Gummy Bear', 'Bigger than Lou’s head. Collectible.', 40, { collect: true, degen: [10, 'Sugar Rush'] }, 'GIANT'),
      item('is-mix', 'Candy', 'Pick & Mix Bag', 'Sprint +25% for 60 s.', 9, { speed: 1.25, secs: 60, icon: '🍬' }),
    ],
  },
  'duck-donuts': {
    title: 'Duck Donuts',
    sub: 'Grand Bazaar Shops • warm, made-to-order donuts',
    greeting: 'Hi! Coating, topping, drizzle? Lou says “all”.',
    bye: 'Have a ducky day',
    items: [
      food('dd-dozen', 'Half Dozen, Maple Bacon', 'Tips ×1.25 for 2 min.', 14, 1.25, 1, 120, '🍩'),
      food('dd-one', 'One Warm Donut', 'Sprint +10% for 60 s.', 3, 1, 1.1, 60, '🍩'),
    ],
  },
  'happy-lemon': {
    title: 'Happy Lemon',
    sub: 'Grand Bazaar Shops • cheese-foam tea',
    greeting: 'Hi! Salted cheese foam on top? Lou ate the foam already.',
    bye: 'Stay happy',
    items: [
      food('hl-foam', 'Salted Cheese Green Tea', 'Sprint +20% for 90 s.', 7, 1, 1.2, 90, '🧋'),
      food('hl-boba', 'Brown Sugar Boba Milk', 'Lou bats the pearls. Tips ×1.15 for 90 s.', 8, 1.15, 1, 90, '🧋'),
    ],
  },
  'katanaya': {
    title: 'Katanaya Ramen',
    sub: 'Grand Bazaar Shops',
    greeting: 'Irasshaimase! Tonkotsu or spicy miso?',
    bye: 'Arigatō',
    items: [
      food('kt-tonkotsu', 'Tonkotsu Ramen', 'Lou drinks the broth and naps in the bowl. Tips ×1.3 for 3 min.', 17, 1.3, 1, 180, '🍜'),
      food('kt-gyoza', 'Gyoza (6)', 'Sprint +10%, tips ×1.1 for 90 s.', 9, 1.1, 1.1, 90, '🥟'),
    ],
  },
  'fat-tuesday': {
    title: 'Fat Tuesday',
    sub: 'Grand Bazaar Shops • frozen daiquiris since 1984',
    greeting: 'What’s it gonna be? Get the souvenir cup, it’s two feet tall.',
    bye: 'Laissez les bons temps rouler',
    items: [
      drink('ft-190', '190 Octane (souvenir cup)', 'The strong one, in a two-foot cup. 🍹 for 4 min.', 26, 240, { degen: [8, 'Two-Foot Cup'] }, 'STRONG'),
      drink('ft-pina', 'Piña Colada (refill)', '🍹 for 2 min.', 14, 120),
    ],
  },
  'daves-hot-chicken': {
    title: "Dave's Hot Chicken",
    sub: 'Grand Bazaar Shops • Nashville hot tenders',
    greeting: 'Spice level? No Spice to Reaper. Lou picks Reaper. Lou regrets it.',
    bye: 'Stay hot',
    items: [
      food('dv-tenders', 'Two Tenders, Hot', 'Tips ×1.3 for 2 min.', 15, 1.3, 1, 120, '🌶️'),
      food('dv-reaper', 'Reaper Slider', 'Sign a waiver. Sprint +35% for 60 s (fleeing the heat).', 9, 1, 1.35, 60, '🔥', 'WAIVER'),
    ],
  },
  // ================================================================ Flamingo Rd → Spring Mountain Rd
  'hells-kitchen': {
    title: "Gordon Ramsay Hell's Kitchen",
    sub: 'Caesars Palace • the Strip entrance under the pitchfork',
    greeting: '“Welcome to Hell’s Kitchen.” Red team or blue team? Lou is on the cat team.',
    bye: '“Get out!” (affectionately)',
    items: [
      food('hk-wellington', 'Beef Wellington', 'The one from the show. Perfectly pink. Tips ×1.5 for 3 min.', 69, 1.5, 1, 180, '🥩', 'SIGNATURE'),
      food('hk-scallops', 'Pan-Seared Scallops', '“It’s RAW!” It isn’t. Tips ×1.3 for 2 min.', 48, 1.3, 1, 120, '🐚'),
      food('hk-toffee', 'Sticky Toffee Pudding', 'Sprint +20%, tips ×1.15 for 2 min.', 16, 1.15, 1.2, 120, '🍮'),
      drink('hk-cocktail', 'Hell’s Kitchen Lemonade', 'Spicy. 🍹 for 2 min.', 19, 120, { degen: [6, 'Survived Service'] }),
    ],
  },
  'guy-fieri': {
    title: "Guy Fieri's Vegas Kitchen & Bar",
    sub: 'The LINQ • a terrace over the Strip • welcome to Flavortown',
    greeting: 'Welcome to Flavortown! Lou is now the mayor.',
    bye: 'Keep it real, keep it funky',
    items: [
      food('gf-nachos', 'Trash Can Nachos', 'Served in a can, dumped at the table. Lou sits in the can. Tips ×1.4 for 3 min.', 26, 1.4, 1, 180, '🧀', 'FLAVORTOWN'),
      food('gf-burger', 'Bacon Mac-n-Cheese Burger', 'Tips ×1.3, sprint −5% for 2 min (heavy).', 24, 1.3, 0.95, 120, '🍔'),
      drink('gf-marg', 'Big Margarita', 'A fishbowl of it. 🍹 for 3 min.', 22, 180),
      item('cheap-shades', 'Merch', 'Backwards Shades', 'Worn on the back of the head, like the man himself. Wearable • +1 Swag', 18, { wear: 'cheap-shades' }),
    ],
  },
  'mojito-hut': {
    title: 'Mojito Hut',
    sub: 'Caesars Palace forecourt • outdoor bar',
    greeting: 'Mojito? We muddle the mint right here.',
    bye: 'Salud',
    items: [
      drink('mh-mojito', 'Classic Mojito', 'Lou eats the mint. 🍹 for 2 min.', 16, 120),
      drink('mh-frozen', 'Frozen Strawberry Mojito (yard)', 'A yard-long cup. 🍹 for 4 min.', 28, 240, { degen: [6, 'Yard Cat'] }),
      drink('mh-virgin', 'Virgin Mojito', 'Mint, lime, soda. 🍹 for 30 s (it’s mostly the vibe).', 9, 30),
    ],
  },
});
