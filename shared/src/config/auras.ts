/**
 * AURAS: fifteen cursed techniques worn as a shell of energy round the body.
 *
 * An aura is BOUGHT once with Wins (they are spent) and kept for good; any
 * owned aura may be equipped, and the equipped one multiplies every punch's
 * Cursed Energy. Owned auras are a bit mask (bit `id - 1`). How each LOOKS is
 * the client's (`characters/AuraFx.ts`) - every one is procedural sprites
 * and simple geometry, each more impressive than the last.
 *
 * Order is the persisted id: NEVER REORDER.
 */
export interface AuraDef {
  /** 1-based, stable. 0 means "no aura". */
  readonly id: number;
  readonly name: string;
  readonly multiplier: number;
  /** Wins it costs, once. */
  readonly cost: number;
  /** Main and secondary colour (0xRRGGBB). */
  readonly color: number;
  readonly accent: number;
}

const K = 1_000;
const M = 1_000_000;
const B = 1_000_000_000;

export const AURAS: readonly AuraDef[] = [
  { id: 1, name: 'Cursed Energy', multiplier: 2, cost: 100, color: 0x7a5aff, accent: 0xc8b8ff },
  { id: 2, name: 'Divergence', multiplier: 3, cost: 400, color: 0x3a8aff, accent: 0xb8e8ff },
  { id: 3, name: 'Ten Shadows', multiplier: 5, cost: 1.6 * K, color: 0x1a1a2a, accent: 0x6a5aff },
  { id: 4, name: 'Black Flash', multiplier: 8, cost: 6.5 * K, color: 0xff1a2a, accent: 0x14080c },
  { id: 5, name: 'Blood Manipulation', multiplier: 12, cost: 25 * K, color: 0xc8101c, accent: 0xff6a7a },
  { id: 6, name: 'Disaster Flames', multiplier: 18, cost: 100 * K, color: 0xff5a1a, accent: 0xffd23a },
  { id: 7, name: 'True Black Flash', multiplier: 27, cost: 400 * K, color: 0xff2a3a, accent: 0x000000 },
  { id: 8, name: 'Divine General', multiplier: 40, cost: 1.6 * M, color: 0xf2f2ff, accent: 0xffd23a },
  { id: 9, name: 'Divine Flame', multiplier: 60, cost: 6.5 * M, color: 0xff8a1a, accent: 0xfff27a },
  { id: 10, name: 'Limitless', multiplier: 90, cost: 25 * M, color: 0x5ad8ff, accent: 0xffffff },
  { id: 11, name: 'Malevolent Shrine', multiplier: 135, cost: 100 * M, color: 0xd0101c, accent: 0x2a0a0a },
  { id: 12, name: 'Unlimited Void', multiplier: 200, cost: 400 * M, color: 0x8ae8ff, accent: 0x2a0a5a },
  { id: 13, name: 'Chimera Shadow', multiplier: 300, cost: 1.6 * B, color: 0x2a1a5a, accent: 0x9a7aff },
  { id: 14, name: 'Flow Purple', multiplier: 450, cost: 6.5 * B, color: 0xb83aff, accent: 0xff5ae8 },
  { id: 15, name: 'Heavenly Restrictions', multiplier: 700, cost: 25 * B, color: 0xe8ecff, accent: 0x6aff9a },
];

export const AURA_COUNT = AURAS.length;

export const auraById = (id: number): AuraDef | undefined => (id >= 1 ? AURAS[Math.floor(id) - 1] : undefined);

const bit = (id: number): number => 2 ** (Math.floor(id) - 1);

/** True when aura `id` is in the owned mask (a float64 holding up to 53 bits). */
export const ownsAura = (mask: number, id: number): boolean => {
  if (!auraById(id)) return false;
  const m = Number.isFinite(mask) ? Math.max(0, Math.floor(mask)) : 0;
  return Math.floor(m / bit(id)) % 2 === 1;
};

/** The mask with `id` added. */
export const withAura = (mask: number, id: number): number => (ownsAura(mask, id) ? mask : Math.floor(Math.max(0, mask)) + bit(id));

export const ownedAuraCount = (mask: number): number => AURAS.filter((def) => ownsAura(mask, def.id)).length;

/** The equipped aura's multiplier: 1 with none, or one not owned. */
export const auraMultiplier = (equipped: number, mask: number): number => {
  const def = auraById(equipped);
  return def && ownsAura(mask, def.id) ? def.multiplier : 1;
};

/** The best owned aura (by multiplier), or 0. */
export const bestOwnedAura = (mask: number): number => {
  let best = 0;
  for (const def of AURAS) if (ownsAura(mask, def.id)) best = def.id;
  return best;
};
