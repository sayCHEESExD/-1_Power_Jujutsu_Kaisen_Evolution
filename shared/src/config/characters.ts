/**
 * THE TWELVE SORCERERS (and curses), on the character stand left of the spawn.
 *
 * Every player STARTS as their own Bloxity avatar, punching at Yuji's +1 per
 * click: Yuji is free and owned from the first second. A character is
 * UNLOCKED by the Wins a player has EARNED IN ALL (`lifetimeWins`) reaching its
 * threshold - spending Wins on upgrades or auras never locks one again - and
 * any unlocked character may be equipped. Every punch pays the equipped
 * character's Cursed Energy (times the bag, the rebirths, the aura and the
 * Training Rate, `progression.ts`). The SERVER checks the threshold against
 * its own figure on every equip.
 *
 * Equipping a character also MORPHS the player into it; the Characters menu can
 * switch the look back to their own avatar (`morph` false) without losing the
 * character's power.
 *
 * Order is the stand's order and the persisted id: NEVER REORDER. How each one
 * LOOKS is the client's (`characters/JjkCharacters.ts`), id for id.
 */
export type CharacterRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'divine';

export interface CharacterDef {
  /** 1-based, stable: the persisted id and the stand position. */
  readonly id: number;
  readonly name: string;
  /** Cursed Energy one punch pays, before multipliers. */
  readonly power: number;
  /** Wins that must have been EARNED (lifetime) to unlock it. */
  readonly winsRequired: number;
  readonly rarity: CharacterRarity;
  /** The menu card's colour and trim (0xRRGGBB). */
  readonly color: number;
  readonly accent: number;
  /** The colour of this fighter's cursed energy: punch sparks and the pedestal glow. */
  readonly energy: number;
}

const K = 1_000;
const M = 1_000_000;

export const CHARACTERS: readonly CharacterDef[] = [
  { id: 1, name: 'Yuji', power: 1, winsRequired: 0, rarity: 'common', color: 0xf07aa8, accent: 0x1d1f2a, energy: 0x7ab8ff },
  { id: 2, name: 'Nobara', power: 2, winsRequired: 1, rarity: 'common', color: 0xc8743a, accent: 0x1d1f2a, energy: 0xff9a5a },
  { id: 3, name: 'Megumi', power: 5, winsRequired: 5, rarity: 'uncommon', color: 0x2a2e48, accent: 0xc8d0ff, energy: 0x6a5aff },
  { id: 4, name: 'Maki', power: 25, winsRequired: 25, rarity: 'uncommon', color: 0x1f5a3a, accent: 0xff4a4a, energy: 0x5aff9a },
  { id: 5, name: 'Toge', power: 50, winsRequired: 100, rarity: 'rare', color: 0xe8e4ff, accent: 0x2a2e48, energy: 0xc8a8ff },
  { id: 6, name: 'Panda', power: 100, winsRequired: 500, rarity: 'rare', color: 0xf4f4f4, accent: 0x16161c, energy: 0xffffff },
  { id: 7, name: 'Nanami', power: 250, winsRequired: 2.5 * K, rarity: 'epic', color: 0xf0e0a8, accent: 0x3a6a2a, energy: 0xffd23a },
  { id: 8, name: 'Todo', power: 1 * K, winsRequired: 10 * K, rarity: 'epic', color: 0x8a5a3a, accent: 0x2a2a3a, energy: 0xff7a2a },
  { id: 9, name: 'Black Flash Yuji', power: 4 * K, winsRequired: 50 * K, rarity: 'legendary', color: 0x16121a, accent: 0xff2a3a, energy: 0xff2a4a },
  { id: 10, name: 'Mahito', power: 10 * K, winsRequired: 250 * K, rarity: 'legendary', color: 0x8aa0c8, accent: 0x3a3a5a, energy: 0x7affd8 },
  { id: 11, name: 'Jogo', power: 25 * K, winsRequired: 1 * M, rarity: 'mythic', color: 0xe8e0c8, accent: 0x5a2a10, energy: 0xff5a1a },
  { id: 12, name: 'Toji', power: 100 * K, winsRequired: 2.5 * M, rarity: 'divine', color: 0x1a1a22, accent: 0xd8d8e0, energy: 0xe8ecff },
];

export const CHARACTER_COUNT = CHARACTERS.length;
/** Yuji: free, owned by everyone from the start. */
export const STARTER_CHARACTER = 1;

export const RARITY_NAMES: Readonly<Record<CharacterRarity, string>> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  mythic: 'Mythic',
  divine: 'Divine',
};

/** Menu and label colour per rarity. */
export const RARITY_COLORS: Readonly<Record<CharacterRarity, string>> = {
  common: '#c8ccd8',
  uncommon: '#6aff6a',
  rare: '#5ab8ff',
  epic: '#c87aff',
  legendary: '#ffb02a',
  mythic: '#ff4a8a',
  divine: '#fff27a',
};

export const characterById = (id: number): CharacterDef | undefined => CHARACTERS[Math.floor(id) - 1];

const count = (value: number): number => Math.floor(Number.isFinite(value) ? Math.max(0, value) : 0);

/** True when `lifetimeWins` reaches the character's threshold. */
export const characterUnlocked = (id: number, lifetimeWins: number): boolean => {
  const def = characterById(id);
  return !!def && count(lifetimeWins) >= def.winsRequired;
};

/** The best character `lifetimeWins` unlocks. */
export const bestUnlockedCharacter = (lifetimeWins: number): number => {
  let best = STARTER_CHARACTER;
  for (const def of CHARACTERS) if (characterUnlocked(def.id, lifetimeWins)) best = def.id;
  return best;
};

/** Cursed Energy per punch of what is equipped; anything unknown or locked punches as Yuji. */
export const characterPower = (id: number, lifetimeWins: number): number => {
  const def = characterById(id);
  if (!def || !characterUnlocked(id, lifetimeWins)) return CHARACTERS[0]!.power;
  return def.power;
};
