import type { GameState } from './state';
import { swagFor } from './cosmetics';

export interface GoalDef {
  id: string;
  title: string;
  hint: string;
  reward: number;
  done: (s: GameState) => boolean;
}

/** Ordered roughly as a progression so the HUD tracker always shows a sensible next step. */
export const GOALS: GoalDef[] = [
  { id: 'first-tip', title: 'First Hustle', hint: 'Get a cash tip from a tourist [B]', reward: 10, done: (s) => s.stats.tipsEarned > 0 },
  { id: 'chain', title: 'Chain Smoker', hint: 'Finish 5 cigarettes', reward: 15, done: (s) => s.stats.cigsSmoked >= 5 },
  { id: 'deuce', title: 'Upper Deck', hint: 'Ride The Deuce double-decker [G]', reward: 15, done: (s) => s.stats.deuceRides >= 1 },
  { id: 'five-finger', title: 'Five-Finger Discount', hint: 'Steal smokes 8 times [Q]', reward: 25, done: (s) => s.stats.steals >= 8 },
  { id: 'clouds', title: 'Cloud Chaser', hint: 'Get 3 tourists to cheer your vape clouds', reward: 25, done: (s) => s.stats.cloudsCheered >= 3 },
  { id: 'photo', title: 'Say Cheese', hint: 'Pose for 3 tourist photos [B near cameras]', reward: 20, done: (s) => s.stats.photoOps >= 3 },
  { id: 'carton', title: 'Bulk Buyer', hint: 'Buy a full carton at ABC Stores', reward: 20, done: (s) => s.stats.cartonsBought >= 1 },
  { id: 'card-sharp', title: 'Card Sharp', hint: 'Win a hand of blackjack', reward: 30, done: (s) => s.stats.blackjackWins >= 1 },
  { id: 'shooter', title: 'Hot Shooter', hint: 'Win a craps bet', reward: 30, done: (s) => s.stats.crapsWins >= 1 },
  { id: 'escape', title: 'Ghost of the Casino Floor', hint: 'Shake off a security guard who is chasing you', reward: 40, done: (s) => s.stats.escapes >= 1 },
  { id: 'gondola', title: 'O Sole Meow', hint: 'Ride a Venetian gondola [G]', reward: 30, done: (s) => s.stats.gondolaRides >= 1 },
  { id: 'high-roller', title: 'Top of the Wheel', hint: 'Ride the High Roller at the end of the LINQ Promenade', reward: 40, done: (s) => s.stats.highRollerRides >= 1 },
  { id: 'drip', title: 'Dripped Out', hint: 'Reach 4 Swag at the Forum Shops boutique', reward: 50, done: (s) => swagFor(s.cosmetics.equipped) >= 4 },
  { id: 'tourist', title: 'Seen It All', hint: 'Visit 12 different spots on the Strip', reward: 60, done: (s) => s.stats.zonesVisited.length >= 12 },
  { id: 'vip', title: 'Behind the Velvet Rope', hint: 'Get into the Cosmopolitan VIP lounge', reward: 100, done: (s) => s.vip },
  { id: 'bankroll', title: 'Whale', hint: 'Hold $2,000 cash at once', reward: 250, done: (s) => s.cash >= 2000 },
];

export class GoalTracker {
  private readonly listEl = document.getElementById('goals-list') as HTMLOListElement;
  private readonly trackerEl = document.getElementById('goal-tracker') as HTMLElement;

  constructor(private readonly onComplete: (goal: GoalDef) => void) {}

  /** Returns true if any goal completed this call (caller saves). */
  check(state: GameState): boolean {
    let changed = false;
    for (const g of GOALS) {
      if (state.goalsDone.includes(g.id)) continue;
      if (g.done(state)) {
        state.goalsDone.push(g.id);
        state.cash += g.reward;
        changed = true;
        this.onComplete(g);
      }
    }
    if (changed) this.render(state);
    return changed;
  }

  render(state: GameState): void {
    const next = GOALS.filter((g) => !state.goalsDone.includes(g.id)).slice(0, 1)[0];
    this.trackerEl.textContent = next
      ? `Next goal: ${next.title} — ${next.hint} (+$${next.reward})`
      : 'All hustle goals complete. You own this Strip.';
    this.listEl.replaceChildren(
      ...GOALS.map((g) => {
        const li = document.createElement('li');
        const done = state.goalsDone.includes(g.id);
        li.className = done ? 'goal goal--done' : 'goal';
        const t = document.createElement('strong');
        t.textContent = `${done ? '✓ ' : ''}${g.title}`;
        const h = document.createElement('span');
        h.textContent = `${g.hint} • +$${g.reward}`;
        li.append(t, h);
        return li;
      })
    );
  }
}
