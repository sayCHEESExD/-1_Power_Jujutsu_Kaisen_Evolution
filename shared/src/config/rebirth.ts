/**
 * REBIRTH: an uncapped prestige ladder, every figure computed from the rebirth
 * number alone.
 *
 *   - Every rebirth CAPS the level: Level 10 at Rebirth 0, 20 at Rebirth 1,
 *     30 at Rebirth 2 ... Reaching the cap ("MAX - Rebirth needed to level
 *     up!") is what makes the next rebirth possible.
 *   - Each rebirth multiplies every punch by (1 + R): 1x, 2x, 3x Cursed Energy.
 *   - Rebirths open the training bags (Green at R1, Red R3, Pink R5, Gold R11,
 *     Lava R15) and the PvP arena (R3).
 *
 * A rebirth RESETS Cursed Energy, XP (the level) and the current run - every
 * wall stands again. It KEEPS Wins, characters, auras and upgrades, and the
 * stage record. Eligibility is the SERVER's own level.
 */
export const LEVELS_PER_REBIRTH = 10;

const count = (rebirths: number): number => Math.max(0, Math.floor(Number.isFinite(rebirths) ? rebirths : 0));

/** The highest level a player with `rebirths` can reach: the level the NEXT rebirth needs. */
export const levelCap = (rebirths: number): number => LEVELS_PER_REBIRTH * (count(rebirths) + 1);

/** Level the NEXT rebirth needs, for a player who has `rebirths`. */
export const rebirthRequiredLevel = levelCap;

/** The punch multiplier: 1x, 2x, 3x ... (1 + R)x. */
export const rebirthMultiplier = (rebirths: number): number => 1 + count(rebirths);

export const canRebirth = (level: number, rebirths: number): boolean => Math.floor(level) >= rebirthRequiredLevel(rebirths);
