/**
 * THE PVP ARENA, behind the spawn: a shrine battle stage under torii pillars.
 *
 *   - Entering needs REBIRTH 3 (as the reference's gate reads): its gate is
 *     solid for anyone below that (the same collision on both sides of the
 *     wire), and the server re-checks every blow.
 *   - Inside, everyone fights at 350% of their Cursed Energy. A blow deals
 *     `PVP.damageFraction` of the attacker's PvP energy; a player holds
 *     `PVP.baseHealth + their Cursed Energy` health, so equal players need
 *     about three blows and a much stronger one needs one.
 *   - Only a player INSIDE may hit, and only a player inside may be hit.
 *   - A knockout sends the loser home after the knockout animation, at full
 *     health; the winner's KO count goes up.
 */
export const PVP = {
  rebirthsRequired: 3,
  strengthMultiplier: 3.5,
  damageFraction: 0.1,
  baseHealth: 100,
  /** Reach from the attacker's centre to the victim's, world units (plus the server's slack). */
  reach: 4.6,
  reachSlack: 2,
  verticalReach: 3.5,
  /** Horizontal and upward velocity a blow knocks the victim back with. */
  knockback: 22,
  knockup: 12,
  /** Seconds the knockout lasts before the server sends the loser home. */
  deathSeconds: 2,
  /** Health regained per second (fraction of max) after `regenDelay` seconds unhurt. */
  regenRate: 0.1,
  regenDelay: 4,
} as const;

/** Health a player holds: base plus their Strength. */
export const pvpMaxHealth = (strength: number): number =>
  Math.floor(PVP.baseHealth + Math.max(0, Number.isFinite(strength) ? strength : 0));

/** The Strength a player fights with inside the arena. */
export const pvpStrength = (strength: number): number => Math.max(1, Math.floor((Number.isFinite(strength) ? strength : 0) * PVP.strengthMultiplier));

/** Health one blow takes. */
export const pvpDamage = (attackerStrength: number): number => Math.max(1, Math.floor(pvpStrength(attackerStrength) * PVP.damageFraction));

export const canEnterPvp = (rebirths: number): boolean => Math.floor(Number.isFinite(rebirths) ? rebirths : 0) >= PVP.rebirthsRequired;
