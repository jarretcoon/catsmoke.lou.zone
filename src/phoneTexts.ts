import type { GameState } from './state';

/**
 * Lou's text messages: who texts him and when. Mission givers text their lines (phone.ts reads the mission
 * dialog), the Strip's characters react to what he's been up to (read off the saved stats), and now and then
 * somebody just checks in. Every trigger fires once per saved phone.
 */

export interface Contact {
  name: string;
  avatar: string;
  color: string;
}

export const CONTACTS: Record<string, Contact> = {
  mom: { name: 'Mom', avatar: '🐈', color: '#e98fb4' },
  lucky: { name: 'Lucky the Clown', avatar: '🤡', color: '#ff6a5a' },
  bellagio: { name: 'Bellagio Security', avatar: '🛡️', color: '#5a7cff' },
  ccac: { name: 'Animal Control', avatar: '🚐', color: '#f0b429' },
  slapper: { name: 'Card Slapper', avatar: '🃏', color: '#b46cff' },
  elvis: { name: 'Elvis', avatar: '🕺', color: '#ffd24d' },
  waymo: { name: 'Waymo', avatar: '🚘', color: '#4fd1c5' },
  uber: { name: 'Uber', avatar: '🚗', color: '#cfd3dc' },
  vip: { name: 'VIP Host', avatar: '🥂', color: '#ffcf70' },
  showgirl: { name: 'Showgirl', avatar: '💃', color: '#ff7ad9' },
  innout: { name: 'In-N-Out Manager', avatar: '🍔', color: '#ff4d4d' },
  whataburger: { name: 'Whataburger Cashier', avatar: '🍟', color: '#ff9f43' },
  tourist: { name: 'Hungry Tourist', avatar: '📸', color: '#7dd3fc' },
};

/** A mission giver's name ("Elvis (Bellagio Fountains)") → a contact id, making one if it's new. */
export function contactFor(giver: string): string {
  const base = giver.replace(/\s*\(.*$/, '').trim();
  const lower = base.toLowerCase();
  if (lower.includes('elvis')) return 'elvis';
  if (lower.includes('slapper')) return 'slapper';
  if (lower.includes('showgirl')) return 'showgirl';
  if (lower.includes('vip')) return 'vip';
  if (lower.includes('in-n-out')) return 'innout';
  if (lower.includes('whataburger')) return 'whataburger';
  if (lower.includes('tourist')) return 'tourist';
  const id = `x-${lower.replace(/[^a-z0-9]+/g, '-')}`;
  CONTACTS[id] ??= { name: base, avatar: '💬', color: '#9aa3b5' };
  return id;
}

export interface Trigger {
  id: string;
  from: string;
  text: string | ((s: GameState, zone: string) => string);
  /** Ready to send? `t` = seconds of play this session. */
  when: (s: GameState, zone: string, t: number, stars: number) => boolean;
}

const zoneHas = (zone: string, ...names: string[]) => names.some((n) => zone.toLowerCase().includes(n));

/** Reactions to what Lou has done. */
export const TRIGGERS: Trigger[] = [
  { id: 'mom-hello', from: 'mom', text: 'Lou it’s Mom. Did you make it to Las Vegas?? Text me when you land. Are you eating', when: (_s, _z, t) => t > 12 },
  { id: 'mom-news', from: 'mom', text: 'Your aunt says she saw a cat on the news smoking at the Bellagio. I said not MY son. Was it you', when: (s, _z, t) => t > 150 && s.stats.cigsSmoked >= 2 },
  { id: 'mom-cigs', from: 'mom', text: 'Your father smoked like that. Look at him now. (He’s fine. He’s asleep in the sun.)', when: (s) => s.stats.cigsSmoked >= 10 },
  { id: 'mom-cash', from: 'mom', text: 'You WON money?? Send some home, Fancy Feast is $1.89 a can now', when: (s) => s.cash >= 500 },
  { id: 'mom-vip', from: 'mom', text: 'The VIP lounge?? Look at my son. Wear the nice collar', when: (s) => s.vip },
  { id: 'mom-heli', from: 'mom', text: 'LOU. Why is there a helicopter on the news following a cat. Call your mother', when: (_s, _z, _t, stars) => stars >= 4 },
  { id: 'ccac-1', from: 'ccac', text: (_s, z) => `CLARK COUNTY ANIMAL CONTROL: large brown tabby reported near ${z || 'the Strip'}. Do not approach. Do not give it cigarettes.`, when: (_s, _z, _t, stars) => stars >= 1 },
  { id: 'ccac-2', from: 'ccac', text: 'UPDATE: suspect now described as “a raccoon in a cat costume.” Search called off. Officers are embarrassed.', when: (s) => s.stats.wantedEscapes >= 1 },
  { id: 'bellagio-1', from: 'bellagio', text: 'This is Bellagio Security. We have you on camera, sir. All of the cameras.', when: (s, z) => s.stats.steals >= 1 && zoneHas(z, 'bellagio') },
  { id: 'bellagio-2', from: 'bellagio', text: 'We have lost visual on the cat. If anyone asks, there was no cat.', when: (s) => s.stats.escapes >= 1 },
  { id: 'bellagio-3', from: 'bellagio', text: 'Please return the ashtray. It is hand-blown glass.', when: (s) => s.stats.steals >= 6 },
  { id: 'lucky-1', from: 'lucky', text: 'hey kid. it’s Lucky. the big clown on the sign up by Circus Circus', when: (_s, z) => zoneHas(z, 'circus', 'slots-a-fun', 'slots a fun') },
  { id: 'lucky-2', from: 'lucky', text: 'they don’t light me up like they used to. but I see everything from up here', when: (s, _z, t) => s.stats.zonesVisited.some((z) => zoneHas(z, 'circus')) && t > 60 },
  { id: 'lucky-3', from: 'lucky', text: 'you played the slots for me. nobody does that anymore 🥲', when: (s) => s.stats.missionsDone.includes('slots-a-fun') },
  { id: 'slapper-1', from: 'slapper', text: '*slap slap* free show tickets. you’re a cat? free show tickets anyway', when: (_s, _z, t) => t > 240 },
  { id: 'elvis-wrong', from: 'elvis', text: 'Thank you. Thank you very much. (wrong number)', when: (_s, _z, t) => t > 420 },
  { id: 'mom-late', from: 'mom', text: 'It’s late Lou. Are you wearing your collar with the bell', when: (_s, _z, t) => t > 600 },
];

/** Mom answers anything Lou sends her (everyone else leaves him on read). */
export const MOM_REPLIES = ['Use your words Lou', 'Is that a yes', '❤️', 'Call me', 'Who taught you that', 'OK. Eat something'];

/** Lou's quick replies (he has paws). */
export const QUICK_REPLIES = ['Meow', '😼', '🚬?', 'k'];

/** Ride receipts for the rideshare apps. */
export const RIDE_RECEIPTS: Record<'waymo' | 'uber', string[]> = {
  waymo: ['Thanks for riding with Waymo, Lou. Trip total: $0.00 (the car didn’t know how to charge a cat).', 'Your Waymo has been cleaned. There was a lot of fur. Please don’t smoke in the car.'],
  uber: ['Rate your driver ⭐⭐⭐⭐⭐. Your driver rated you 🐾🐾🐾 (“smelled like a casino”).', 'Thanks for riding, Lou. Your driver would like his air freshener back.'],
};
