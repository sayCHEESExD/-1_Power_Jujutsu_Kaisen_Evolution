import { auraMultiplier } from './auras.js';
import { bagMultiplier } from './bags.js';
import { characterPower } from './characters.js';
import { levelCap, rebirthMultiplier } from './rebirth.js';
import { RUN_SPEED_PER_STUD, speedStat, trainingRateFactor } from './upgrades.js';

/**
 * THE PROGRESSION RULES, deterministic and shared, so the server, the HUD and
 * the menus always agree.
 *
 * CURSED ENERGY is earned by PUNCHING only - one punch per click (or per
 * auto-click, or per tick of a bag the player trains at). It is never spent:
 * it is the damage every blow at a wall deals, and 350% of it fights in the
 * PvP arena. A rebirth resets it.
 *
 * ONE GAIN FORMULA for a punch:
 *
 *     the equipped character's power      (+1 ... +100K)
 *   x the training bag under the player   (1x, 2x, 4x, 6x, 12x, 15x - its rebirths permitting)
 *   x the rebirth multiplier              (1 + rebirths)
 *   x the equipped aura                   (1x ... 700x)
 *   x the Training Rate upgrade           (100%, 105%, 110% ...)
 *
 * floored, at least 1 - and, now and then, a LUCKY punch pays three times that
 * (the server rolls it; `upgrades.ts`). Every punch the SERVER accepts pays
 * exactly this to Cursed Energy and to XP.
 *
 * The LEVEL is read off XP: Level L needs `XP_BASE x XP_GROWTH^(L-1)` XP to
 * reach the next, and every rebirth caps it (`levelCap`: Level 10, 20, 30 ...).
 * At the cap the bar reads MAX - "Rebirth needed to level up!" - and that is
 * exactly when a rebirth becomes possible.
 */

/** XP the first level needs, and the factor each level after multiplies it by. */
export const XP_BASE = 60;
export const XP_GROWTH = 1.12;

/**
 * Cursed Energy and XP saturate here rather than ever becoming Infinity (they
 * are float64 on the wire). Not a cap anyone meets.
 */
export const MAX_STAT = Number.MAX_VALUE / 8;

const whole = (level: number): number => Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));

/** XP to go from `level` to `level + 1`. */
export const xpToNext = (level: number): number => XP_BASE * XP_GROWTH ** (whole(level) - 1);

/** Total XP on first reaching `level`: 0 at Level 1. */
export const xpForLevel = (level: number): number => (XP_BASE * (XP_GROWTH ** (whole(level) - 1) - 1)) / (XP_GROWTH - 1);

export interface LevelProgress {
  /** The level as the XP alone would have it (uncapped). */
  readonly level: number;
  /** XP earned inside this level. */
  readonly into: number;
  /** XP this level needs in all (the bar's right-hand figure). */
  readonly need: number;
  /** 0..1 fill for the level bar. */
  readonly fraction: number;
}

/** Resolve an XP total into a level. Closed form, then nudged for float error. */
export const levelForXp = (xp: number): LevelProgress => {
  const total = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let level = Math.max(1, 1 + Math.floor(Math.log(1 + (total * (XP_GROWTH - 1)) / XP_BASE) / Math.log(XP_GROWTH)));
  if (!Number.isFinite(level)) level = 1;
  while (level > 1 && xpForLevel(level) > total) level -= 1;
  while (xpForLevel(level + 1) <= total) level += 1;
  const into = total - xpForLevel(level);
  const need = xpToNext(level);
  return { level, into, need, fraction: need > 0 ? Math.min(Math.max(into / need, 0), 1) : 0 };
};

/**
 * The level a player SHOWS: their XP's level, held at their rebirth's cap.
 * `maxed` is the cap reached - the bar reads MAX and a rebirth is open.
 */
export const levelOf = (xp: number, rebirths: number): LevelProgress & { readonly maxed: boolean; readonly cap: number } => {
  const cap = levelCap(rebirths);
  const progress = levelForXp(xp);
  if (progress.level < cap) return { ...progress, maxed: false, cap };
  return { level: cap, into: xpToNext(cap), need: xpToNext(cap), fraction: 1, maxed: true, cap };
};

// --------------------------------------------------------------- movement

/** The base run speed (Speed 25.0); the Speed upgrade raises it. */
export const RUN_SPEED = 22;
export const JUMP_VELOCITY = 24;

/** World units per second at a Speed upgrade level. */
export const runSpeedFor = (speedLevel: number): number => speedStat(speedLevel) * RUN_SPEED_PER_STUD;

// ------------------------------------------------------------------- gain

export interface GainInputs {
  readonly character: number;
  readonly lifetimeWins: number;
  readonly rebirths: number;
  /** Tier of the bag the player trains at, or -1. */
  readonly bagTier: number;
  readonly aura: number;
  readonly auraMask: number;
  readonly trainingRate: number;
}

/** The bag factor (1 away from one, or at one still locked). */
export const bagFactorOf = (inputs: GainInputs): number => (inputs.bagTier >= 0 ? bagMultiplier(inputs.bagTier, inputs.rebirths) : 1);

/**
 * Everything a punch is multiplied by apart from the character: the HUD's
 * "2.8x Energy".
 */
export const energyMultiplier = (inputs: GainInputs): number =>
  bagFactorOf(inputs) * rebirthMultiplier(inputs.rebirths) * auraMultiplier(inputs.aura, inputs.auraMask) * trainingRateFactor(inputs.trainingRate);

/** Cursed Energy (and XP) one ordinary punch pays. */
export const gainPerPunch = (inputs: GainInputs): number =>
  Math.max(1, Math.floor(characterPower(inputs.character, inputs.lifetimeWins) * energyMultiplier(inputs)));

export const describeGain = (inputs: GainInputs): string =>
  `character ${characterPower(inputs.character, inputs.lifetimeWins)} x bag ${bagFactorOf(inputs)} x rebirth ${rebirthMultiplier(inputs.rebirths)}` +
  ` x aura ${auraMultiplier(inputs.aura, inputs.auraMask)} x training ${trainingRateFactor(inputs.trainingRate).toFixed(2)} = ${gainPerPunch(inputs)}`;
