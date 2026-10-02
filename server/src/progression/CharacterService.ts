import { bestUnlockedCharacter, characterById, characterUnlocked, type CharacterDef } from '@jjk/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { ProgressionService } from './ProgressionService.js';

export type EquipResult =
  | { readonly ok: true; readonly character: CharacterDef }
  | { readonly ok: false; readonly reason: 'unknown' | 'locked' | 'equipped'; readonly character?: CharacterDef };

/**
 * Server authority over the equipped character and the morph.
 *
 * A character is UNLOCKED by the SERVER's own lifetime Wins reaching its
 * threshold; equipping one checks that again, every time. Equipping a
 * character also puts its look on (`morph`); the player may take the look off
 * again and fight as their own avatar with the same power.
 */
export class CharacterService {
  equip(player: PlayerState, raw: unknown, progression: ProgressionService): EquipResult {
    const def = characterById(Number(raw));
    if (!def) return { ok: false, reason: 'unknown' };
    if (!characterUnlocked(def.id, player.lifetimeWins)) return { ok: false, reason: 'locked', character: def };
    if (player.character === def.id && player.morph) return { ok: false, reason: 'equipped', character: def };
    player.character = def.id;
    player.morph = true;
    progression.syncDerived(player);
    return { ok: true, character: def };
  }

  /** Wear the character's look, or the player's own avatar. Cosmetic: the power stays. */
  setMorph(player: PlayerState, raw: unknown): boolean {
    const morph = raw === true;
    if (player.morph === morph) return false;
    player.morph = morph;
    return true;
  }

  /**
   * After lifetime Wins went up from `before`: when that unlocked a better
   * character and the player held the best they had, hand them the new best
   * (keeping their choice of look). Returns the newly unlocked id, or 0.
   */
  upgradeAfterWins(player: PlayerState, before: number, progression: ProgressionService): number {
    const was = bestUnlockedCharacter(before);
    const now = bestUnlockedCharacter(player.lifetimeWins);
    if (now <= was) return 0;
    if (player.character === was) {
      player.character = now;
      progression.syncDerived(player);
    }
    return now;
  }

  /** A stored id that is unknown or no longer unlocked falls back to the best unlocked one. */
  normalise(player: PlayerState): void {
    if (!characterUnlocked(player.character, player.lifetimeWins)) player.character = bestUnlockedCharacter(player.lifetimeWins);
  }
}
