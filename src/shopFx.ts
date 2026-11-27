import type { AbcItem } from './abcShop';

/** What a shop purchase can touch in the game (main.ts wires these to the real state). */
export interface ShopFxContext {
  buff: { tip: number; speed: number; t: number; label: string };
  buzz: (seconds: number) => void;
  addCigs: (n: number) => void;
  degen: (points: number, label: string) => void;
  collect: (id: string) => number;
  /** Equip (or take off) a wearable; returns the message, or null if it isn't a known cosmetic. */
  wear: (id: string) => string | null;
  loseHeat: (stars: number) => number;
  refillJuice: () => boolean;
  addCash: (n: number) => void;
}

/**
 * Applies a catalog item's `fx` (see shopCatalogs.ts). Buffs from food replace a weaker one and
 * stack their timer; drinks feed the 🍹 buzz; everything else is souvenirs, swag, heat and degen.
 */
export function applyShopFx(item: AbcItem, ctx: ShopFxContext): { ok: boolean; msg: string } {
  const fx = item.fx!;
  const bits: string[] = [];
  if (fx.wear) {
    const m = ctx.wear(fx.wear);
    if (m) return { ok: true, msg: m };
  }
  if (fx.gamble) {
    const won = Math.random() < fx.gamble.chance;
    if (won) ctx.addCash(fx.gamble.win);
    if (fx.degen) ctx.degen(fx.degen[0], fx.degen[1]);
    return { ok: true, msg: won ? fx.gamble.winMsg : fx.gamble.loseMsg };
  }
  if (fx.secs && (fx.tip || fx.speed)) {
    const b = ctx.buff;
    const tip = fx.tip ?? 1;
    const speed = fx.speed ?? 1;
    // a better buff takes over; an equal or weaker one just tops up the timer
    if (b.t <= 0 || tip * speed >= b.tip * b.speed) {
      b.tip = tip;
      b.speed = speed;
      b.label = fx.icon ?? '★';
    }
    b.t = Math.max(b.t, fx.secs);
    const parts: string[] = [];
    if (tip !== 1) parts.push(`tips ×${tip}`);
    if (speed > 1) parts.push(`sprint +${Math.round((speed - 1) * 100)}%`);
    if (speed < 1) parts.push(`sprint −${Math.round((1 - speed) * 100)}%`);
    bits.push(`${parts.join(', ')} for ${fx.secs >= 120 ? `${Math.round(fx.secs / 60)} min` : `${fx.secs} s`}`);
  }
  if (fx.buzz) {
    ctx.buzz(fx.buzz);
    bits.push(`🍹 ${fx.buzz >= 120 ? `${Math.round(fx.buzz / 60)} min` : `${fx.buzz} s`}`);
  }
  if (fx.smokes) {
    ctx.addCigs(fx.smokes);
    bits.push(`+${fx.smokes} smokes`);
  }
  if (fx.heat) {
    const lost = ctx.loseHeat(fx.heat);
    if (lost > 0) bits.push(`−${lost}★ heat`);
  }
  if (fx.juice) {
    if (ctx.refillJuice()) bits.push('juice 100%');
  }
  if (fx.collect) bits.push(`${ctx.collect(item.id)} souvenirs`);
  if (fx.degen) ctx.degen(fx.degen[0], fx.degen[1]);
  return { ok: true, msg: `${item.name}! ${bits.length ? `(${bits.join(' • ')})` : item.desc}` };
}
