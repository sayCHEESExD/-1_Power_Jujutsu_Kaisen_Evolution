import { canRebirth, levelCap, rebirthMultiplier } from '@jjk/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { ProgressionService } from './ProgressionService.js';

export type RebirthResult =
  | {
      readonly ok: true;
      readonly rebirths: number;
      readonly multiplier: number;
      readonly levelCap: number;
    }
  | { readonly ok: false; readonly reason: 'not-eligible' | 'dead' };

/**
 * Server authority over rebirths.
 *
 * Eligibility is the server's own level reaching its cap (`levelCap`: the
 * "MAX" the HUD shows). A rebirth RESETS Cursed Energy and XP (the level) -
 * the room then places the player at the spawn, which starts a new run with
 * every wall standing - for a permanently higher punch multiplier, a higher
 * level cap and new training bags. It KEEPS Wins, characters, auras, upgrades
 * and the stage record. The client sends an empty message.
 */
export class RebirthService {
  rebirth(player: PlayerState, progression: ProgressionService): RebirthResult {
    if (player.health <= 0) return { ok: false, reason: 'dead' };
    if (!canRebirth(player.level, player.rebirths)) return { ok: false, reason: 'not-eligible' };
    player.rebirths += 1;
    player.xp = 0;
    player.energy = 0;
    progression.syncDerived(player);
    progression.heal(player);
    return {
      ok: true,
      rebirths: player.rebirths,
      multiplier: rebirthMultiplier(player.rebirths),
      levelCap: levelCap(player.rebirths),
    };
  }
}
