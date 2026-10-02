import { auraById, ownsAura, withAura, type AuraDef } from '@jjk/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { ProgressionService } from './ProgressionService.js';
import { wallet } from './Wallet.js';

export type AuraResult =
  | { readonly ok: true; readonly aura: AuraDef | null }
  | { readonly ok: false; readonly reason: 'unknown' | 'owned' | 'poor' | 'locked' | 'equipped'; readonly aura?: AuraDef };

/**
 * Server authority over auras: BUY one (once, its price in Wins through
 * `Wallet`, and it is worn at once), or EQUIP one already owned (0 takes it
 * off). Ownership is the server's mask; the client only names an id.
 */
export class AuraService {
  buy(player: PlayerState, raw: unknown, progression: ProgressionService): AuraResult {
    const def = auraById(Number(raw));
    if (!def) return { ok: false, reason: 'unknown' };
    if (ownsAura(player.auraMask, def.id)) return { ok: false, reason: 'owned', aura: def };
    if (!wallet.spend(player, def.cost)) return { ok: false, reason: 'poor', aura: def };
    player.auraMask = withAura(player.auraMask, def.id);
    player.aura = def.id;
    progression.syncDerived(player);
    return { ok: true, aura: def };
  }

  equip(player: PlayerState, raw: unknown, progression: ProgressionService): AuraResult {
    const id = Math.floor(Number(raw));
    if (id === 0) {
      if (player.aura === 0) return { ok: false, reason: 'equipped' };
      player.aura = 0;
      progression.syncDerived(player);
      return { ok: true, aura: null };
    }
    const def = auraById(id);
    if (!def) return { ok: false, reason: 'unknown' };
    if (!ownsAura(player.auraMask, def.id)) return { ok: false, reason: 'locked', aura: def };
    if (player.aura === def.id) return { ok: false, reason: 'equipped', aura: def };
    player.aura = def.id;
    progression.syncDerived(player);
    return { ok: true, aura: def };
  }
}
