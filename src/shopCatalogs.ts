import type { AbcItem, ShopCatalog } from './abcShop';

/*
 * Menus for the LINQ Promenade's working shops, bars and counters. They all open in the ABC Stores
 * shop dialog (abcShop.ts) and pay out through `fx` (shopFx.ts), so they share the one economy:
 * cash in, buffs (tips / sprint), the 🍹 buzz, smokes for the stash, Swag wearables, souvenirs and
 * degen points. Prices are 2026 promenade prices, rounded; the effects are cat logic.
 */

const item = (id: string, cat: string, name: string, desc: string, price: number, fx: AbcItem['fx'], tag?: string): AbcItem => ({ id, cat, name, desc, price, fx, tag });

/** Drinks: buzz seconds = the 🍹 (tips +50%). */
const drink = (id: string, name: string, desc: string, price: number, buzz: number, extra: AbcItem['fx'] = {}, tag?: string) => item(id, 'Drinks', name, desc, price, { buzz, ...extra }, tag);
/** Food: a timed buff (tips × and/or sprint ×). */
const food = (id: string, name: string, desc: string, price: number, tip: number, speed: number, secs: number, icon: string, tag?: string) => item(id, 'Food', name, desc, price, { tip, speed, secs, icon }, tag);

export const CATALOGS: Record<string, ShopCatalog> = {
  // ---------------------------------------------------------------- Dean Martin Dr: the In-N-Out Company Store (4838)
  'in-n-out-store': {
    title: 'In-N-Out Burger Company Store',
    sub: 'Shirts • Hats • Mugs • Keychains • 4838 Dean Martin Dr',
    greeting: 'Welcome in! The burgers are next door, the merch is right here.',
    bye: 'Thanks, have a great day',
    items: [
      item('ino-tee-palms', 'Shirts', 'Crossed Palms Tee', 'The red-and-yellow palm trees shirt. Lou naps on it. Collectible.', 22, { collect: true, degen: [8, 'Double-Double Devotee'] }),
      item('ino-tee-cruiser', 'Shirts', 'Vegas Cruiser Tee', 'A hot-rod and the Strip on the back. Collectible.', 24, { collect: true, degen: [8, 'Double-Double Devotee'] }),
      item('ino-hoodie', 'Shirts', 'Red Logo Hoodie', 'Big enough to be Lou’s new bed. Collectible.', 45, { collect: true, degen: [12, 'Double-Double Devotee'] }, 'NEW'),
      item('ino-trucker', 'Hats', 'Red Arrow Trucker Hat', 'Wearable • +1 Swag (Lou wears his trucker cap)', 18, { wear: 'trucker-hat' }),
      item('ino-paper-hat', 'Hats', 'Paper Crew Hat', 'The folded paper cap the crew wears. Lou shreds it in four seconds. Collectible.', 3, { collect: true, degen: [4, 'Crew Member (Honorary)'] }),
      item('ino-mug', 'Mugs', 'Classic Logo Mug', 'Red and white, holds coffee or one small cat. Collectible.', 14, { collect: true, degen: [6, 'Double-Double Devotee'] }),
      item('ino-tumbler', 'Mugs', 'Palm Tree Tumbler', 'Keeps a shake cold on the Strip. Collectible.', 20, { collect: true }),
      item('ino-keychain-cup', 'Keychains', 'Drink Cup Keychain', 'A tiny cup with the palms on it. Collectible.', 6, { collect: true, degen: [5, 'Souvenir Hoarder'] }),
      item('ino-keychain-burger', 'Keychains', 'Double-Double Keychain', 'A rubber burger. Lou bats it under the counter. Collectible.', 7, { collect: true, degen: [5, 'Souvenir Hoarder'] }),
    ],
  },
  // ---------------------------------------------------------------- souvenirs
  'linq-souvenirs': {
    title: 'Welcome to Fabulous Las Vegas',
    sub: 'Souvenirs • Gifts • Shot glasses by the thousand',
    greeting: 'Everything says LAS VEGAS on it. Everything.',
    bye: 'Bye, come back',
    items: [
      item('trucker-hat', 'Wear', 'VEGAS Trucker Hat', 'Wearable • +1 Swag', 18, { wear: 'trucker-hat' }),
      item('cheap-shades', 'Wear', 'Neon Plastic Shades', 'Wearable • +1 Swag', 12, { wear: 'cheap-shades' }),
      item('bandana', 'Wear', 'I ♥ VEGAS Bandana', 'Wearable • +1 Swag', 14, { wear: 'bandana' }),
      item('cowboy-hat', 'Wear', 'Rhinestone Cowboy Hat', 'Wearable • +2 Swag. Lou is country now.', 45, { wear: 'cowboy-hat' }, 'NEW'),
      item('linq-sign-replica', 'Keepsakes', 'Mini Welcome Sign', 'A 6-inch replica. Lou knocks it off the counter. Collectible.', 18, { collect: true, degen: [10, 'Souvenir Hoarder'] }),
      item('linq-shot-glass', 'Keepsakes', 'High Roller Shot Glass', 'Collectible. For milk. Obviously.', 6, { collect: true, degen: [5, 'Souvenir Hoarder'] }),
      item('linq-dice', 'Keepsakes', 'Fuzzy Dice', 'Collectible. Batted under a slot machine within minutes.', 9, { collect: true, degen: [8, 'Souvenir Hoarder'] }),
      item('linq-yard-cup', 'Keepsakes', 'Empty Novelty Yard Cup', 'A souvenir yard glass shaped like the Eiffel Tower. Lou fits inside.', 15, { collect: true, degen: [15, 'Yard Cup Hermit'] }),
      item('linq-postcards', 'Keepsakes', 'Postcard 10-Pack', 'Lou mails one to the dog. Collectible.', 5, { collect: true }),
      item('linq-chips', 'Snacks', 'Souvenir Poker Chip Candy', 'Chocolate chips. Real ones would buy more.', 7, { tip: 1.15, secs: 90, icon: '🍫' }),
    ],
  },
  'sky-shop': {
    title: 'Sky Shop • High Roller',
    sub: 'The High Roller gift shop at the foot of the wheel',
    greeting: 'Rode the wheel? Prove it.',
    bye: 'See you up top',
    items: [
      item('hr-globe', 'Keepsakes', 'High Roller Snow Globe', 'The wheel turns when you shake it. Collectible.', 16, { collect: true, degen: [10, 'Souvenir Hoarder'] }),
      item('hr-cabin', 'Keepsakes', 'Cabin Keychain', 'A little glass cabin with a littler cat inside. Collectible.', 9, { collect: true }),
      item('hr-magnet', 'Keepsakes', '550 ft Magnet', 'Collectible.', 6, { collect: true }),
      item('cheap-shades', 'Wear', 'Neon Plastic Shades', 'Wearable • +1 Swag', 12, { wear: 'cheap-shades' }),
      drink('hr-cocktail', 'Happy Half Hour Cocktail (to go)', 'The open-bar cabin special, in a cup. 🍹 for 2 min.', 19, 120),
    ],
  },
  'hat-loft': {
    title: 'The Hat Loft',
    sub: 'Hats, hats, more hats',
    greeting: 'We have a hat for every head. Even that one.',
    bye: 'Hats off',
    items: [
      item('cowboy-hat', 'Hats', 'Rhinestone Cowboy Hat', 'Wearable • +2 Swag. Yeehaw, but quieter.', 45, { wear: 'cowboy-hat' }),
      item('fedora', 'Hats', 'Rat Pack Fedora', 'Wearable • +2 Swag. Cheaper here than the Forum Shops.', 95, { wear: 'fedora' }, 'DEAL'),
      item('trucker-hat', 'Hats', 'VEGAS Trucker Hat', 'Wearable • +1 Swag', 18, { wear: 'trucker-hat' }),
      item('top-hat', 'Hats', 'Showman Top Hat', 'Wearable • +3 Swag. Headliner energy.', 380, { wear: 'top-hat' }),
    ],
  },
  // ---------------------------------------------------------------- sweets
  'ilovesugar': {
    title: 'I Love Sugar',
    sub: 'Candy store downstairs • Candy Martini Bar upstairs',
    greeting: 'Welcome to the sugar rush. No refunds on teeth.',
    bye: 'Sugar crash incoming',
    items: [
      item('ils-gummies', 'Candy', 'Gummy Bear Bucket', 'Two pounds. Zoomies: sprint +25% for 75 s.', 12, { speed: 1.25, secs: 75, icon: '🍬' }),
      item('ils-lollipop', 'Candy', 'Giant Rainbow Lollipop', 'Bigger than Lou. Tourists tip ×1.25 for 90 s.', 8, { tip: 1.25, secs: 90, icon: '🍭' }),
      item('ils-sour', 'Candy', 'Sour Belts by the Foot', 'Lou makes the face. +15 degen.', 5, { degen: [15, 'Sour Face'] }),
      item('ils-cotton', 'Candy', 'Cotton Candy Cloud', 'Real cotton candy. Lou tries to vape it. Juice +100% if he has the mod.', 9, { juice: true, degen: [10, 'Cloud Confusion'] }),
      drink('ils-martini', 'Candy Martini', 'Rimmed in Nerds, a gummy on the stick. 🍹 for 2 min.', 19, 120, { tip: 1.1, secs: 120, icon: '🍸' }, 'UPSTAIRS'),
      drink('ils-goblet', 'Giant Candy Goblet (shareable)', 'Smoking dry ice and a whole candy store floating in it. 🍹 for 3 min.', 38, 180, { degen: [40, 'Goblet Goblin'] }),
    ],
  },
  'sweet-sin': {
    title: 'Sweet Sin',
    sub: 'French pastries, macarons, candy',
    greeting: 'Bonjour, petit chat.',
    bye: 'Au revoir',
    items: [
      food('ss-macarons', 'Macaron Six-Pack', 'Lou bats them off the plate one by one. Tips ×1.2.', 14, 1.2, 1, 90, '🧁'),
      food('ss-cake', 'Cake Pop Bouquet', 'Tips ×1.15, sprint +10%.', 11, 1.15, 1.1, 90, '🍡'),
    ],
  },
  'ghirardelli': {
    title: 'Ghirardelli Ice Cream & Chocolate',
    sub: 'Sundaes • Shakes • Chocolate squares',
    greeting: 'Free sample? Here’s a square. No, not for the cat.',
    bye: 'Grazie',
    items: [
      food('gh-sundae', 'Hot Fudge Sundae', 'The classic. Tourists tip ×1.3 for 2 min.', 14, 1.3, 1, 120, '🍨'),
      food('gh-shake', 'Chocolate Shake', 'Brain freeze, then zoomies: sprint +20% for 90 s.', 11, 1, 1.2, 90, '🥤'),
      item('gh-squares', 'Chocolate', 'Sea Salt Caramel Squares', 'Chocolate is bad for cats. Lou licks the wrappers. +20 degen.', 6, { degen: [20, 'Wrapper Licker'] }),
      food('gh-earthquake', 'Earthquake Sundae', '8 scoops, 8 toppings. Tips ×1.6 for 3 min, but a food coma: sprint −10%.', 38, 1.6, 0.9, 180, '🌋', 'SHARE IT'),
    ],
  },
  'honolulu-cookie': {
    title: 'Honolulu Cookie Company',
    sub: 'Pineapple-shaped shortbread',
    greeting: 'Aloha! Try a sample.',
    bye: 'Mahalo',
    items: [
      food('hcc-box', 'Pineapple Shortbread Box', 'Dipped in chocolate. Tips ×1.2 for 2 min.', 18, 1.2, 1, 120, '🍍'),
      item('hcc-sample', 'Cookies', 'Free Sample', 'Lou takes six. Staff notices. +10 degen.', 0, { degen: [10, 'Sample Bandit'] }, 'FREE'),
    ],
  },
  // ---------------------------------------------------------------- counters
  'haute-doggery': {
    title: 'Haute Doggery',
    sub: 'Gourmet hot dogs, open late',
    greeting: 'What’ll it be? We don’t serve cat dogs.',
    bye: 'Relish the moment',
    items: [
      food('hd-chicago', 'Chicago Dog', 'Neon relish, sport peppers. Tips ×1.2, sprint +10% for 2 min.', 11, 1.2, 1.1, 120, '🌭'),
      food('hd-vegas', 'The Vegas Dog', 'Bacon-wrapped, jalapeños, a cheese avalanche. Tips ×1.3 for 2 min.', 14, 1.3, 1, 120, '🌭'),
      food('hd-corn', 'Corn Dog + Fries', 'Lou eats the corn dog. Then the stick. Sprint +20% for 90 s.', 10, 1, 1.2, 90, '🍟'),
    ],
  },
  'starbucks-linq': {
    title: 'Starbucks',
    sub: 'Coffee on the promenade',
    greeting: 'Name for the cup? “Lou.” They write “Lu”.',
    bye: 'Thanks, Lu',
    items: [
      food('sb-coldbrew', 'Venti Cold Brew', 'Caffeinated cat: sprint +30% for 60 s.', 6, 1, 1.3, 60, '☕'),
      food('sb-pup', 'Puppuccino', 'A cup of whipped cream. For dogs. Lou takes it anyway. Tips ×1.15.', 0, 1.15, 1, 60, '🥛', 'FREE'),
    ],
  },
  'gordon-ramsay': {
    title: 'Gordon Ramsay Fish & Chips',
    sub: 'British street food, shouted at',
    greeting: '“WHERE’S THE LAMB SAUCE?” (it’s fish)',
    bye: 'Cheers',
    items: [
      food('gr-fish', 'Fish & Chips', 'Proper cod. The best thing a cat ever ate. Tips ×1.4 for 3 min.', 22, 1.4, 1, 180, '🐟', 'LOU’S PICK'),
      food('gr-toffee', 'Sticky Toffee Pudding Bites', 'Sprint +15%, tips ×1.1 for 2 min.', 9, 1.1, 1.15, 120, '🍮'),
    ],
  },
  'flour-barley': {
    title: 'Flour & Barley',
    sub: 'Brick oven pizza & craft beer',
    greeting: 'Slice or a whole pie?',
    bye: 'Ciao',
    items: [
      food('fb-slice', 'Pepperoni Slice', 'Tips ×1.15, sprint +10% for 90 s.', 7, 1.15, 1.1, 90, '🍕'),
      food('fb-pie', 'Whole Margherita Pie', 'Lou lies on it first. Tips ×1.35 for 3 min.', 28, 1.35, 1, 180, '🍕'),
      drink('fb-ipa', 'Craft IPA', '🍹 for 90 s.', 11, 90),
    ],
  },
  'maxies': {
    title: 'Maxie’s',
    sub: 'Patio diner on the promenade',
    greeting: 'Patio’s open. Cats sit on the chairs, apparently.',
    bye: 'Come back for brunch',
    items: [
      food('mx-pancakes', 'Pancake Stack', 'Tips ×1.25 for 2 min.', 16, 1.25, 1, 120, '🥞'),
      drink('mx-mimosa', 'Bottomless Mimosas', 'Bottomless for 90 minutes. 🍹 for 3 min.', 29, 180, { degen: [25, 'Bottomless'] }),
    ],
  },
  'canters': {
    title: 'Canter’s Deli',
    sub: 'The LA deli, since 1931',
    greeting: 'Pastrami? Matzo ball? Both?',
    bye: 'Mazel',
    items: [
      food('cd-pastrami', 'Pastrami on Rye', 'A tower of meat. Tips ×1.35 for 3 min.', 24, 1.35, 1, 180, '🥪'),
      food('cd-latke', 'Latkes', 'Sprint +15% for 90 s.', 9, 1, 1.15, 90, '🥔'),
    ],
  },
  // ---------------------------------------------------------------- bars
  'osheas': {
    title: "O'Sheas",
    sub: 'Irish pub casino • $3 beers • beer pong',
    greeting: 'Top o’ the mornin’. It is 2 a.m.',
    bye: 'Sláinte',
    items: [
      drink('os-beer', '$3 Beer', 'Cheapest beer on the Strip. 🍹 for 60 s.', 3, 60),
      drink('os-green', 'Green Beer Pitcher', '🍹 for 2 min.', 14, 120),
      item('os-pong', 'Games', 'Beer Pong vs. the Bachelor Party', '$10 to play. 50/50 to win $30. Lou has no thumbs.', 10, { gamble: { chance: 0.5, win: 30, winMsg: 'Lou sinks the last cup with his tail. +$30!', loseMsg: 'Lou knocked every cup off the table. Disqualified.' }, degen: [20, 'Beer Pong'] }),
    ],
  },
  'tilted-kilt': {
    title: 'Tilted Kilt Pub & Eatery',
    sub: 'Pub fare, pints and plaid',
    greeting: 'Pint, love?',
    bye: 'Cheers',
    items: [
      drink('tk-pint', 'Imperial Pint', '🍹 for 90 s.', 9, 90),
      food('tk-wings', 'Pub Wings', 'Tips ×1.25 for 2 min.', 17, 1.25, 1, 120, '🍗'),
    ],
  },
  'breeze': {
    title: 'Breeze Daiquiri Bar',
    sub: 'Frozen daiquiris to go, by the yard',
    greeting: 'Strawberry, mango, or the blue one?',
    bye: 'Stay frosty',
    items: [
      drink('bz-yard', 'Yard Daiquiri', 'The tall one. 🍹 for 2.5 min.', 24, 150, {}, 'YARD'),
      drink('bz-cup', 'Daiquiri Cup', '🍹 for 90 s.', 12, 90),
      drink('bz-refill', 'Refill With a Souvenir Cup', 'Brings the yard back. 🍹 for 90 s.', 10, 90),
    ],
  },
  'american': {
    title: 'ameriCAN Beer & Cocktails',
    sub: 'Craft cans from all 50 states',
    greeting: 'Pick a state.',
    bye: 'Bye',
    items: [
      drink('ac-can', 'Nevada Craft Can', '🍹 for 90 s.', 10, 90),
      drink('ac-flight', 'Five-State Can Flight', '🍹 for 3 min. Lou’s tour of America.', 28, 180, { degen: [15, 'Road Trip'] }),
    ],
  },
  'yard-house': {
    title: 'Yard House',
    sub: '100+ beers on tap',
    greeting: 'Half-yard or a full yard?',
    bye: 'Bye',
    items: [
      drink('yh-half', 'Half-Yard of Beer', '🍹 for 2 min.', 15, 120),
      drink('yh-yard', 'A Full Yard of Beer', '🍹 for 4 min. The glass is longer than Lou.', 26, 240, { degen: [30, 'Yard Legend'] }),
      food('yh-poke', 'Poke Nachos', 'Tips ×1.25 for 2 min.', 19, 1.25, 1, 120, '🐟'),
    ],
  },
  'chayo': {
    title: 'Chayo Mexican Kitchen + Tequila Bar',
    sub: 'Tacos, tequila and the mechanical bull',
    greeting: '¡Bienvenido, gato!',
    bye: '¡Salud!',
    items: [
      drink('ch-marg', 'Margarita', '🍹 for 2 min.', 16, 120),
      food('ch-tacos', 'Street Tacos', 'Tips ×1.25, sprint +10% for 2 min.', 15, 1.25, 1.1, 120, '🌮'),
      item('ch-bull', 'Games', 'Ride the Mechanical Bull', '$10. Lou lasts 8 seconds (a record). +60 degen.', 10, { degen: [60, 'Bull Rider'], tip: 1.2, secs: 60, icon: '🐂' }),
    ],
  },
  'category10': {
    title: "Luke Combs' Category 10",
    sub: 'Three-story honky-tonk • to-go window on the promenade',
    greeting: 'Howdy. Frozen drink to go?',
    bye: 'Y’all come back',
    items: [
      drink('c10-frozen', 'Frozen Hurricane (to go)', '🍹 for 2 min.', 17, 120),
      drink('c10-whiskey', 'Whiskey Neat', '🍹 for 90 s. Swag points for the attitude.', 14, 90, { degen: [10, 'Outlaw'] }),
      item('cowboy-hat', 'Merch', 'Rhinestone Cowboy Hat', 'Wearable • +2 Swag', 48, { wear: 'cowboy-hat' }),
    ],
  },
  'icebar': {
    title: 'ICEBAR • minus5°',
    sub: 'A bar made of ice. Parkas included.',
    greeting: 'It’s 23°F in there. Lou is wearing a parka. A tiny one.',
    bye: 'Thaw out',
    items: [
      item('ice-entry', 'Chill', 'Entry + One Drink', 'Cool off: the heat dies down (−2 wanted stars) and 🍹 for 90 s.', 22, { heat: 2, buzz: 90 }, 'COOL DOWN'),
      drink('ice-shot', 'Shot From an Ice Glass', 'Lou licks the glass. Stuck for a second. 🍹 for 60 s.', 9, 60, { degen: [15, 'Tongue Stuck'] }),
    ],
  },
  'virgils': {
    title: "Virgil's Real BBQ",
    sub: 'Smoked low and slow',
    greeting: 'Brisket or ribs?',
    bye: 'Y’all come back',
    items: [
      food('vg-brisket', 'Brisket Plate', 'Tips ×1.4 for 3 min. Lou sleeps for a bit after.', 26, 1.4, 0.95, 180, '🍖'),
      food('vg-ribs', 'Rib Tips', 'Tips ×1.25 for 2 min.', 16, 1.25, 1, 120, '🍖'),
    ],
  },
};

export function catalogById(id: string | undefined): ShopCatalog | undefined {
  return id ? CATALOGS[id] : undefined;
}
