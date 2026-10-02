/**
 * PERMANENT UPGRADES, bought with Wins (spent) and kept through every rebirth.
 *
 *   Speed          +2.5 run speed a level (25.0 -> 27.5 ...), up to 20 levels
 *   Training Rate  +5% Cursed Energy per punch a level, uncapped
 *   Luck           +0.5x a level: the chance of a LUCKY punch (3x energy)
 *   Boss Damage    +25% damage to every stage's boss wall a level, uncapped
 *   Punch Rate     5% less time between punches a level, up to 15 levels
 *
 * Each level costs more than the last (`upgradeCost`). The SERVER checks the
 * price against its own Wins, spends them, and raises the level; every figure
 * that follows from a level is derived from it on both sides, here.
 */
export type UpgradeId = 'speed' | 'trainingRate' | 'luck' | 'bossDamage' | 'punchRate';

export interface UpgradeDef {
  readonly id: UpgradeId;
  readonly name: string;
  /** Wins the first level costs, and the factor each level after multiplies it by. */
  readonly base: number;
  readonly growth: number;
  /** Highest level, or Infinity. */
  readonly max: number;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'speed', name: 'Speed', base: 1, growth: 1.62, max: 20 },
  { id: 'trainingRate', name: 'Training Rate', base: 1, growth: 1.3, max: Number.POSITIVE_INFINITY },
  { id: 'luck', name: 'Luck', base: 1, growth: 1.7, max: 30 },
  { id: 'bossDamage', name: 'Boss Damage', base: 2, growth: 1.38, max: Number.POSITIVE_INFINITY },
  { id: 'punchRate', name: 'Punch Rate', base: 3, growth: 1.85, max: 15 },
];

export const UPGRADE_IDS: readonly UpgradeId[] = UPGRADES.map((def) => def.id);

export const upgradeById = (id: string): UpgradeDef | undefined => UPGRADES.find((def) => def.id === id);

const level = (value: number): number => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));

/** Wins the NEXT level costs for a player at `current`. Infinity at the max. */
export const upgradeCost = (id: UpgradeId, current: number): number => {
  const def = upgradeById(id);
  if (!def) return Number.POSITIVE_INFINITY;
  const l = level(current);
  if (l >= def.max) return Number.POSITIVE_INFINITY;
  const raw = def.base * def.growth ** l;
  return raw < 1e15 ? Math.ceil(raw) : raw;
};

/** Speed as the menus print it (Roblox-style studs): 25.0 at level 0. */
export const speedStat = (l: number): number => 25 + 2.5 * level(l);
/** World units per second for a Speed stat: 25 studs is this game's run speed of 22. */
export const RUN_SPEED_PER_STUD = 22 / 25;
/** Training Rate as a factor: 1.00, 1.05, 1.10 ... */
export const trainingRateFactor = (l: number): number => 1 + 0.05 * level(l);
/** Luck as the menus print it: 1.0x, 1.5x, 2.0x ... */
export const luckStat = (l: number): number => 1 + 0.5 * level(l);
/** The chance one punch is LUCKY, and what a lucky punch is worth. */
export const luckyChance = (l: number): number => Math.min(0.5, 0.03 * luckStat(l));
export const LUCKY_MULTIPLIER = 3;
/** Damage to a boss wall, as a factor: 1.00, 1.25, 1.50 ... */
export const bossDamageFactor = (l: number): number => 1 + 0.25 * level(l);
/** The time between punches, as a factor of the base interval: 1, 0.95, 0.9025 ... */
export const punchRateFactor = (l: number): number => 0.95 ** Math.min(level(l), 15);

/** A player's five levels, as replicated and persisted. */
export interface UpgradeLevels {
  speed: number;
  trainingRate: number;
  luck: number;
  bossDamage: number;
  punchRate: number;
}

export const emptyUpgrades = (): UpgradeLevels => ({ speed: 0, trainingRate: 0, luck: 0, bossDamage: 0, punchRate: 0 });

/** "25.0 -> 27.5" pieces for the menu: the value now and after one more level. */
export const upgradeDisplay = (id: UpgradeId, l: number): { now: string; next: string } => {
  const show = (value: number): string => {
    switch (id) {
      case 'speed':
        return speedStat(value).toFixed(1);
      case 'trainingRate':
        return `${Math.round(trainingRateFactor(value) * 100)}%`;
      case 'luck':
        return `${luckStat(value).toFixed(1)}x`;
      case 'bossDamage':
        return `${Math.round(bossDamageFactor(value) * 100)}%`;
      case 'punchRate':
        return `${Math.round((1 / punchRateFactor(value)) * 100)}%`;
    }
  };
  return { now: show(l), next: show(l + 1) };
};
