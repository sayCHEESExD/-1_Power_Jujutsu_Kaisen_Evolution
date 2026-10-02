import { upgradeById, upgradeCost, type UpgradeDef, type UpgradeId } from '@jjk/shared';
import type { PlayerState, UpgradeState } from '../rooms/state/PlayerState.js';
import type { ProgressionService } from './ProgressionService.js';
import { wallet } from './Wallet.js';

export type UpgradeResult =
  | { readonly ok: true; readonly upgrade: UpgradeDef; readonly level: number; readonly cost: number }
  | { readonly ok: false; readonly reason: 'unknown' | 'maxed' | 'poor'; readonly upgrade?: UpgradeDef; readonly cost?: number };

const FIELD: Readonly<Record<UpgradeId, keyof UpgradeState & UpgradeId>> = {
  speed: 'speed',
  trainingRate: 'trainingRate',
  luck: 'luck',
  bossDamage: 'bossDamage',
  punchRate: 'punchRate',
};

/**
 * Server authority over the five permanent upgrades. The price is the
 * SERVER's (`upgradeCost` of its own level), paid through `Wallet`; the client
 * names the upgrade and nothing else.
 */
export class UpgradeService {
  buy(player: PlayerState, raw: unknown, progression: ProgressionService): UpgradeResult {
    const def = typeof raw === 'string' ? upgradeById(raw) : undefined;
    if (!def) return { ok: false, reason: 'unknown' };
    const field = FIELD[def.id];
    const current = player.upgrades[field];
    if (current >= def.max) return { ok: false, reason: 'maxed', upgrade: def };
    const cost = upgradeCost(def.id, current);
    if (!wallet.spend(player, cost)) return { ok: false, reason: 'poor', upgrade: def, cost };
    player.upgrades[field] = current + 1;
    progression.syncDerived(player);
    return { ok: true, upgrade: def, level: current + 1, cost };
  }
}
