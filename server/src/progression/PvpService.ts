import { PVP, canEnterPvp, inPvpZone, pvpDamage } from '@jjk/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { ProgressionService } from './ProgressionService.js';

export type PunchOutcome =
  | { readonly ok: false; readonly reason: 'not-in-arena' | 'no-target' | 'out-of-reach' | 'locked' }
  | { readonly ok: true; readonly damage: number; readonly knockedOut: boolean; readonly dirX: number; readonly dirZ: number };

/**
 * THE ONE PLACE A PLAYER IS HURT: blows in the PvP arena.
 *
 * Validated against the positions the SERVER simulated, in this order: the
 * attacker is alive, has the arena's rebirths and stands in the arena; the
 * victim exists, is alive and stands in the arena too (nobody outside it can
 * ever be hit); the two are within reach. The damage is the attacker's own
 * server-side Cursed Energy at 350% (`pvpDamage`). The client sends a session
 * id and nothing else.
 */
export class PvpService {
  punch(attacker: PlayerState, victim: PlayerState | undefined, progression: ProgressionService): PunchOutcome {
    if (attacker.health <= 0 || !inPvpZone(attacker.x, attacker.z)) return { ok: false, reason: 'not-in-arena' };
    if (!canEnterPvp(attacker.rebirths)) return { ok: false, reason: 'locked' };
    if (!victim || victim === attacker || victim.health <= 0 || !inPvpZone(victim.x, victim.z)) return { ok: false, reason: 'no-target' };
    const dx = victim.x - attacker.x;
    const dz = victim.z - attacker.z;
    const distance = Math.hypot(dx, dz);
    if (distance > PVP.reach + PVP.reachSlack || Math.abs(victim.y - attacker.y) > PVP.verticalReach) return { ok: false, reason: 'out-of-reach' };

    const damage = pvpDamage(attacker.energy);
    attacker.attackCount = (attacker.attackCount + 1) >>> 0;
    attacker.attackKind = 2;
    attacker.attackX = victim.x;
    attacker.attackY = victim.y + 2;
    attacker.attackZ = victim.z;
    const knockedOut = progression.hurt(victim, damage);
    const dirX = distance > 1e-3 ? dx / distance : Math.sin(attacker.rotationY);
    const dirZ = distance > 1e-3 ? dz / distance : Math.cos(attacker.rotationY);
    if (knockedOut) attacker.pvpKos += 1;
    return { ok: true, damage, knockedOut, dirX, dirZ };
  }
}
