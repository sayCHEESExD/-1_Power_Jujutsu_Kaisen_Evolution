import {
  ACTION,
  CLAIM_PAD_HALF,
  CORRIDOR,
  STAGE_COUNT,
  WALLS,
  WALL_THICKNESS,
  bossDamageFactor,
  claimedBefore,
  damageOfEnergy,
  isClaimed,
  stageByIndex,
  stageComplete,
  withClaimed,
  type StageDef,
} from '@jjk/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { wallet } from './Wallet.js';

export type SmashOutcome =
  | { readonly ok: false; readonly reason: 'no-wall' | 'out-of-reach' }
  | {
      readonly ok: true;
      readonly wall: number;
      readonly damage: number;
      /** The wall's health after the blow. */
      readonly hp: number;
      readonly broken: boolean;
      readonly boss: boolean;
      /** The stage this blow completed, or 0. */
      readonly completed: number;
      readonly firstClear: boolean;
    };

export interface ClaimOutcome {
  readonly granted: boolean;
  readonly stage: StageDef | null;
  readonly wins: number;
  readonly reason?: 'unknown-stage' | 'not-on-pad' | 'not-complete' | 'claimed';
}

/** A claim pad is accepted a little beyond its edge, for latency. */
const PAD_SLACK = 1.2;

/**
 * THE ONE PLACE A WALL IS DAMAGED, AND THE ONE PLACE A STAGE PAYS WINS.
 *
 * EVERY PLAYER BREAKS THEIR OWN RUN of walls. A run begins whenever the
 * player is placed at the spawn (or teleported to a stage, which counts the
 * stages before it as broken AND claimed) and holds:
 *
 *   - `wallsBroken`: how many walls are down - they fall in corridor order,
 *     so the next to fall is always WALLS[wallsBroken], and every wall before
 *     it is open (shared collision reads the same count);
 *   - `wallHp`: the next wall's health;
 *   - `claimed`: which stages' Wins this run has banked.
 *
 * A BLOW is validated against the position the SERVER simulated: the player
 * must stand in the corridor, in front of that wall's face, within reach. Its
 * damage is the player's own server-side Cursed Energy - times their Boss
 * Damage on a stage's boss wall. A CLAIM needs the stage complete this run,
 * the player on its pad, and the stage not yet claimed this run - so no stage
 * ever pays twice for one breaking.
 */
export class WallService {
  /** Start a new run at the spawn: every wall stands, every claim is open. */
  resetRun(player: PlayerState): void {
    this.startRunAt(player, 1);
  }

  /**
   * Start a new run AT A STAGE: the walls before it count as broken and its
   * predecessors as claimed (nothing to collect twice); from it on, everything
   * stands at full health.
   */
  startRunAt(player: PlayerState, stage: number): void {
    const def = stageByIndex(Math.max(1, Math.min(STAGE_COUNT, Math.floor(stage)))) ?? stageByIndex(1)!;
    player.wallsBroken = def.firstWall;
    player.wallHp = WALLS[def.firstWall]?.hp ?? 0;
    player.claimed = claimedBefore(def.index);
  }

  /** One blow at the next wall. `hint` is the wall the client meant; only a hint. */
  smash(player: PlayerState, hint: number): SmashOutcome {
    const wall = WALLS[player.wallsBroken];
    if (!wall || (Number.isFinite(hint) && Math.floor(hint) !== wall.id)) return { ok: false, reason: 'no-wall' };
    const face = wall.z - WALL_THICKNESS / 2;
    const reach = ACTION.wallReach + ACTION.wallSlack;
    if (Math.abs(player.x) > CORRIDOR.halfWidth || player.z > face + 0.5 || player.z < face - reach || player.y > 4) {
      return { ok: false, reason: 'out-of-reach' };
    }

    const base = damageOfEnergy(player.energy);
    const damage = wall.boss ? Math.floor(base * bossDamageFactor(player.upgrades.bossDamage)) : base;
    const hp = Math.max(0, player.wallHp - damage);
    player.attackCount = (player.attackCount + 1) >>> 0;
    player.attackKind = wall.boss ? 3 : 1;
    player.attackX = Math.max(-CORRIDOR.halfWidth + 1, Math.min(CORRIDOR.halfWidth - 1, player.x));
    player.attackY = Math.min(4, player.y + 2.4);
    player.attackZ = face;

    if (hp > 0) {
      player.wallHp = hp;
      return { ok: true, wall: wall.id, damage, hp, broken: false, boss: wall.boss, completed: 0, firstClear: false };
    }

    // The wall falls: the next one (if any) stands at full health.
    player.wallsBroken = wall.id + 1;
    player.totalWalls += 1;
    player.wallHp = WALLS[wall.id + 1]?.hp ?? 0;
    let completed = 0;
    let firstClear = false;
    if (stageComplete(player.wallsBroken, wall.stage)) {
      completed = wall.stage;
      firstClear = wall.stage > player.bestStage;
      if (firstClear) player.bestStage = wall.stage;
    }
    return { ok: true, wall: wall.id, damage, hp: 0, broken: true, boss: wall.boss, completed, firstClear };
  }

  /** Bank a stage's Wins: complete this run, standing on its pad, not yet claimed this run. */
  claim(player: PlayerState, stageRaw: unknown): ClaimOutcome {
    const stage = stageByIndex(Number(stageRaw));
    if (!stage) return { granted: false, stage: null, wins: 0, reason: 'unknown-stage' };
    const half = CLAIM_PAD_HALF + PAD_SLACK;
    if (Math.abs(player.x - stage.claimX) > half || Math.abs(player.z - stage.claimZ) > half || player.y > 2) {
      return { granted: false, stage, wins: 0, reason: 'not-on-pad' };
    }
    if (!stageComplete(player.wallsBroken, stage.index)) return { granted: false, stage, wins: 0, reason: 'not-complete' };
    if (isClaimed(player.claimed, stage.index)) return { granted: false, stage, wins: 0, reason: 'claimed' };

    player.claimed = withClaimed(player.claimed, stage.index);
    const granted = wallet.add(player, stage.reward);
    if (stage.index > player.bestStage) player.bestStage = stage.index;
    return { granted: true, stage, wins: granted };
  }
}
