import {
  JUMP_VELOCITY,
  LUCKY_MULTIPLIER,
  MAX_STAT,
  PVP,
  bagAt,
  bagFactorOf,
  bagTierOf,
  canUseBag,
  describeGain,
  energyMultiplier,
  gainPerPunch,
  inPvpZone,
  levelOf,
  luckyChance,
  pvpMaxHealth,
  runSpeedFor,
  type GainInputs,
} from '@jjk/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { logger } from '../util/logger.js';

const SCOPE = 'progression';

interface Tracker {
  /** Seconds since this player last took a blow. */
  sinceHurt: number;
  loggedGain: number;
}

export interface PunchResult {
  /** Cursed Energy (and XP) the punch paid. */
  readonly gain: number;
  /** The bag factor it was paid at. */
  readonly bag: number;
  readonly lucky: boolean;
  /** Tier of a bag the player stood at but has not the rebirths for, or -1. */
  readonly lockedTier: number;
}

/** The gain inputs of a player where the SERVER has them now. */
export const gainInputsOf = (player: PlayerState): GainInputs => ({
  character: player.character,
  lifetimeWins: player.lifetimeWins,
  rebirths: player.rebirths,
  bagTier: player.bag >= 0 ? bagTierOf(player.bag) : -1,
  aura: player.aura,
  auraMask: player.auraMask,
  trainingRate: player.upgrades.trainingRate,
});

/**
 * Server authority over Cursed Energy, XP, levels, health and every DERIVED stat.
 *
 * THE ONE PLACE CURSED ENERGY AND XP ARE GRANTED: `creditPunch`, for a
 * training punch the room accepted - a click (rate limited) or the automatic
 * punch of a usable bag (server-timed, `GameRoom.trainAtBag`). It pays the
 * gain formula - the equipped character, the bag under the position the
 * SERVER simulated, the rebirths, the aura, the Training Rate - and rolls the
 * LUCKY punch itself, to BOTH energy and XP. Nothing else ever adds energy.
 *
 * `syncDerived` is the one place the level, the gain per punch, the run speed
 * and the health cap are written. Every service that changes an input calls it.
 */
export class ProgressionService {
  private readonly trackers = new Map<string, Tracker>();

  constructor(private readonly random: () => number = Math.random) {}

  initialise(player: PlayerState): void {
    this.trackers.set(player.sessionId, { sinceHurt: 99, loggedGain: -1 });
    this.locate(player);
    this.syncDerived(player);
    player.health = player.maxHealth;
  }

  forget(sessionId: string): void {
    this.trackers.delete(sessionId);
  }

  /** Credit one accepted training punch. */
  creditPunch(player: PlayerState): PunchResult {
    this.locate(player);
    const inputs = gainInputsOf(player);
    const lucky = this.random() < luckyChance(player.upgrades.luck);
    const gain = gainPerPunch(inputs) * (lucky ? LUCKY_MULTIPLIER : 1);
    const before = player.energy;
    player.energy = Math.min(MAX_STAT, before + gain);
    if (player.energy > player.bestEnergy) player.bestEnergy = player.energy;
    const paid = player.energy - before;
    player.xp = Math.min(MAX_STAT, player.xp + paid);
    player.punchCount = (player.punchCount + 1) >>> 0;
    this.syncDerived(player);
    const lockedTier = inputs.bagTier > 0 && !canUseBag(inputs.bagTier, inputs.rebirths) ? inputs.bagTier : -1;
    return { gain: paid, bag: bagFactorOf(inputs), lucky, lockedTier };
  }

  /** Take a blow in the arena. Returns true when it knocked the player out. */
  hurt(player: PlayerState, damage: number): boolean {
    if (!Number.isFinite(damage) || damage <= 0 || player.health <= 0) return false;
    player.health = Math.max(0, player.health - damage);
    player.hurtCount = (player.hurtCount + 1) % 65536;
    const tracker = this.trackers.get(player.sessionId);
    if (tracker) tracker.sinceHurt = 0;
    return player.health <= 0;
  }

  /** Restore full health (a respawn). */
  heal(player: PlayerState): void {
    player.health = player.maxHealth;
  }

  /**
   * Every tick: where the player stands (the bag in front of them, the
   * arena), and health coming back a little while nothing hurts them.
   */
  tick(delta: number, player: PlayerState): void {
    this.locate(player);
    const tracker = this.trackers.get(player.sessionId);
    if (!tracker) return;
    tracker.sinceHurt += delta;
    if (player.health <= 0 || player.health >= player.maxHealth) return;
    // Out of the arena nobody can be hurt, so health is simply whole again.
    if (!player.inPvp) {
      player.health = player.maxHealth;
      return;
    }
    if (tracker.sinceHurt < PVP.regenDelay) return;
    player.health = Math.min(player.maxHealth, player.health + player.maxHealth * PVP.regenRate * delta);
  }

  /** Read the bag and the arena off the SERVER's position; re-derive the gain when the bag changed. */
  private locate(player: PlayerState): void {
    const bag = player.grounded ? bagAt(player.x, player.y, player.z) : -1;
    const inPvp = inPvpZone(player.x, player.z);
    if (player.inPvp !== inPvp) player.inPvp = inPvp;
    if (bag !== player.bag) {
      player.bag = bag;
      this.syncDerived(player);
    }
  }

  /**
   * Re-derive every figure that follows from the player's own server state.
   * THE ONLY WRITER of level, gain per punch, run speed and the health cap.
   * Health keeps its fraction as the cap moves.
   */
  syncDerived(player: PlayerState): void {
    const inputs = gainInputsOf(player);
    const level = levelOf(player.xp, player.rebirths).level;
    if (player.level !== level) player.level = level;
    const gain = gainPerPunch(inputs);
    if (player.gainPerPunch !== gain) player.gainPerPunch = gain;
    const multiplier = energyMultiplier(inputs);
    if (player.energyMultiplier !== multiplier) player.energyMultiplier = multiplier;
    const speed = runSpeedFor(player.upgrades.speed);
    if (player.moveSpeed !== speed) player.moveSpeed = speed;
    if (player.jumpVelocity !== JUMP_VELOCITY) player.jumpVelocity = JUMP_VELOCITY;
    const max = pvpMaxHealth(player.energy);
    if (max !== player.maxHealth) {
      const fraction = player.maxHealth > 0 ? player.health / player.maxHealth : 1;
      player.maxHealth = max;
      player.health = player.health <= 0 ? 0 : Math.min(max, Math.max(1, Math.round(max * fraction)));
    }

    const tracker = this.trackers.get(player.sessionId);
    if (tracker && tracker.loggedGain !== gain) {
      tracker.loggedGain = gain;
      logger.info(SCOPE, `${player.sessionId} L${player.level} gain/punch: ${describeGain(inputs)}`);
    }
  }
}
