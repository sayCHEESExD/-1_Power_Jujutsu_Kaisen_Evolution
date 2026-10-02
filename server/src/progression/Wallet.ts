import { MAX_WINS } from '@jjk/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/**
 * The ONE place Wins are added or removed.
 *
 * Stage claim pads and Bux grants add them (and the lifetime total that
 * unlocks characters and ranks on the Top Wins board); upgrades and auras
 * SPEND them, through `spend` and nothing else. Wins are a float64 on the
 * wire, so every addition saturates at the largest exact integer.
 */
export const wallet = {
  add(player: PlayerState, amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const before = player.wins;
    player.wins = Math.min(MAX_WINS, Math.floor(before + amount));
    const granted = player.wins - before;
    player.lifetimeWins = Math.min(MAX_WINS, player.lifetimeWins + granted);
    return granted;
  },

  canAfford(player: PlayerState, cost: number): boolean {
    if (!Number.isFinite(cost) || cost < 0) return false;
    return player.wins >= Math.floor(cost);
  },

  /** Deduct Wins. False and unchanged when the player cannot afford it. */
  spend(player: PlayerState, cost: number): boolean {
    const price = Math.floor(Number.isFinite(cost) ? Math.max(0, cost) : 0);
    if (player.wins < price) return false;
    player.wins -= price;
    return true;
  },
};
