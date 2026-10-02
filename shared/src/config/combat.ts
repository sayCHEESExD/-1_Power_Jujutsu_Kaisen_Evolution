import { punchRateFactor } from './upgrades.js';

/**
 * Action tuning, shared so the client's feel and the server's validation agree.
 *
 * A click (or an auto-click) is ONE PUNCH, aimed by where the player stands:
 *
 *   - at the next standing wall, within `wallReach` of its face: a SMASH;
 *   - in the PvP arena with an opponent in reach: a STRIKE at them;
 *   - anywhere else: TRAINING - a punch at the bag in front of them, or at
 *     the air - for Cursed Energy.
 *
 * Every action is a REQUEST. The server rate-limits all three from one shared
 * bucket, re-checks the target against the position IT simulated, and decides
 * every figure. The client never supplies one.
 */
export const ACTION = {
  /** Seconds between two actions the client starts (manual or auto), before the Punch Rate upgrade. */
  interval: 0.35,
  /**
   * The server's rate limit: a bucket of `burst` actions refilled one per
   * `refillSeconds` (times the Punch Rate factor). A touch looser than the
   * client so jitter never eats an honest click; an auto-clicker gains nothing
   * past it.
   */
  refillSeconds: 0.3,
  burst: 3,
  /** How far in front of a wall's face a player may smash it from. */
  wallReach: 3.6,
  /** Extra reach the server allows for latency. */
  wallSlack: 1.6,
} as const;

/** Seconds between two punches for a player with this Punch Rate level. */
export const actionInterval = (punchRateLevel: number): number => ACTION.interval * punchRateFactor(punchRateLevel);

/** The server's refill for that player. */
export const actionRefill = (punchRateLevel: number): number => ACTION.refillSeconds * punchRateFactor(punchRateLevel);
