/**
 * TRAINING BAGS: six kinds in the Cursed Energy Training Zone right of the
 * spawn, two of each; every stage's nook has two Bronze bags of its own
 * (`map.ts`). They replace the treadmills of the game this one grew from, and
 * work the same way.
 *
 * A bag is USED by standing on the glowing mat in front of it: while the
 * server has the player there, every punch pays `energy x multiplier`, and the
 * bag punches for them on its own every `BAG_AUTO_PUNCH_SECONDS`. A bag whose
 * rebirth requirement is not met pays no bonus (it trains as 1x) and says why.
 *
 * Order is the tier: NEVER REORDER. How each kind LOOKS is the client's
 * (`world/Bags.ts`): stronger bags burn with stronger cursed energy.
 */
export interface BagTier {
  readonly tier: number;
  readonly name: string;
  readonly multiplier: number;
  readonly rebirthsRequired: number;
  /** Leather colour, stitching/trim colour and the cursed energy it burns with (0xRRGGBB). */
  readonly color: number;
  readonly trim: number;
  readonly glow: number;
}

export const BAG_TIERS: readonly BagTier[] = [
  { tier: 0, name: 'Bronze Bag', multiplier: 1, rebirthsRequired: 0, color: 0xc8823a, trim: 0x6a3a14, glow: 0xffb06a },
  { tier: 1, name: 'Green Bag', multiplier: 2, rebirthsRequired: 1, color: 0x3ad84a, trim: 0x14501c, glow: 0x7dff6a },
  { tier: 2, name: 'Red Bag', multiplier: 4, rebirthsRequired: 3, color: 0xe8202c, trim: 0x5a0a10, glow: 0xff4a5a },
  { tier: 3, name: 'Pink Bag', multiplier: 6, rebirthsRequired: 5, color: 0xff5ad8, trim: 0x6a1a5a, glow: 0xff8aff },
  { tier: 4, name: 'Gold Bag', multiplier: 12, rebirthsRequired: 11, color: 0xffc21e, trim: 0x8a5a0a, glow: 0xfff27a },
  { tier: 5, name: 'Lava Bag', multiplier: 15, rebirthsRequired: 15, color: 0x3a1410, trim: 0xff5a1a, glow: 0xff6a1c },
];

export const bagTier = (tier: number): BagTier | undefined => BAG_TIERS[Math.floor(tier)];

export const canUseBag = (tier: number, rebirths: number): boolean => {
  const t = bagTier(tier);
  return !!t && Math.floor(Number.isFinite(rebirths) ? rebirths : 0) >= t.rebirthsRequired;
};

/**
 * Seconds between two AUTOMATIC punches while a player stands at a bag they
 * can use. The server punches for them (the same `creditPunch` a click goes
 * through); clicking still punches on top. A bag they lack the rebirths for
 * trains nothing on its own.
 */
export const BAG_AUTO_PUNCH_SECONDS = 1;

/** The multiplier a bag pays this player: its own, or 1 when they lack the rebirths. */
export const bagMultiplier = (tier: number, rebirths: number): number => {
  const t = bagTier(tier);
  if (!t || !canUseBag(tier, rebirths)) return 1;
  return t.multiplier;
};

/**
 * A bag's footprint. The bag hangs from a frame over its own solid base; the
 * MAT (where the trainee stands) lies in front of it along `facing`.
 */
export const BAG_SIZE = {
  /** Half the bag's solid footprint (a square). */
  half: 0.9,
  /** The hanging bag's radius and length, and how high its top hangs. */
  radius: 0.85,
  length: 3.2,
  top: 5.2,
  /** The mat: from `matNear` to `matFar` in front of the bag, `matHalf` either side. */
  matNear: 1.1,
  matFar: 4.4,
  matHalf: 1.9,
} as const;
