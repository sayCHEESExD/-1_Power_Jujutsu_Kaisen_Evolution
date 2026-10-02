/**
 * The DERIVING facts of a player's progression: everything a session is
 * rebuilt from. Level, gain per lift and health are recomputed from these by
 * the same shared formulas a live session uses. The current RUN (walls down,
 * stages claimed) is deliberately NOT here: every session starts a new run.
 */
export interface ProgressFields {
  /** Total XP this rebirth (reset by a rebirth). The level is read off it. */
  xp: number;
  /** Cursed Energy held (reset by a rebirth). */
  energy: number;
  /** Highest Cursed Energy ever held: the Top Cursed Energy board. */
  bestEnergy: number;
  /** Wins held: spent on upgrades and auras. */
  wins: number;
  /** Wins earned, ever: what unlocks characters, and the Top Wins board. */
  lifetimeWins: number;
  rebirths: number;
  /** The equipped character's id, and 1 when the player shows it (0: their own avatar). */
  character: number;
  morph: number;
  /** The equipped aura (0 for none) and the owned ones (bit `id - 1`). */
  aura: number;
  auraMask: number;
  /** Upgrade levels. */
  upSpeed: number;
  upTraining: number;
  upLuck: number;
  upBoss: number;
  upPunch: number;
  /** Highest stage ever completed: how far the Worlds menu reaches. */
  bestStage: number;
  /** Walls broken, ever. */
  totalWalls: number;
  /** Players knocked out in the arena, ever. */
  pvpKos: number;
  /** Seconds played, lifetime: the Top Playtime board. */
  playSeconds: number;
}

/** What one save writes. */
export interface ProfileFields extends ProgressFields {
  /** The portal's display name and portrait as last seen. Cleared when empty. */
  displayName: string;
  avatarUrl: string;
  /** Wall clock of the save. */
  updatedAt: number;
}

/**
 * The first-login migration's bookkeeping.
 *
 *   - An ACCOUNT profile created from a browser's guest progress carries
 *     `migratedFrom`, the guest key it came from.
 *   - That GUEST profile is then RETIRED: its progress is reset, it carries
 *     `migratedTo` (the account key), `migratedAt`, and `migratedSnapshot` -
 *     the progress it held at that moment, kept as a recovery copy.
 */
export interface MigrationFields {
  migratedFrom?: string;
  migratedTo?: string;
  migratedAt?: number;
  migratedSnapshot?: ProgressFields;
}

/**
 * A profile as READ from storage. Beyond the fields this build knows, it may
 * carry any field a newer or older build wrote: those are kept and written
 * back untouched, never dropped.
 */
export type StoredProfile = ProfileFields & MigrationFields & { [field: string]: unknown };

const NUMERIC_KEYS = [
  'xp',
  'energy',
  'bestEnergy',
  'wins',
  'lifetimeWins',
  'rebirths',
  'character',
  'morph',
  'aura',
  'auraMask',
  'upSpeed',
  'upTraining',
  'upLuck',
  'upBoss',
  'upPunch',
  'bestStage',
  'totalWalls',
  'pvpKos',
  'playSeconds',
] as const satisfies readonly (keyof ProgressFields)[];

/** Optional string fields a save may CLEAR. The only fields ever $unset. */
export const CLEARABLE_FIELDS = ['displayName', 'avatarUrl'] as const;

const numeric = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export const emptyProgress = (): ProgressFields => ({
  xp: 0,
  energy: 0,
  bestEnergy: 0,
  wins: 0,
  lifetimeWins: 0,
  rebirths: 0,
  // Everyone starts punching with Yuji's power - and looking like themselves.
  character: 1,
  morph: 0,
  aura: 0,
  auraMask: 0,
  upSpeed: 0,
  upTraining: 0,
  upLuck: 0,
  upBoss: 0,
  upPunch: 0,
  bestStage: 0,
  totalWalls: 0,
  pvpKos: 0,
  playSeconds: 0,
});

/** Just the progression of a profile, coerced. */
export const progressOf = (source: Partial<ProgressFields>): ProgressFields => {
  const out = emptyProgress();
  for (const key of NUMERIC_KEYS) out[key] = numeric(source[key]);
  if (out.character === 0) out.character = 1;
  return out;
};

/**
 * Coerce whatever storage held into a profile, KEEPING every unknown field.
 */
export const coerceProfile = (raw: unknown): StoredProfile | null => {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const profile: StoredProfile = {
    ...source,
    ...progressOf(source as Partial<ProgressFields>),
    displayName: text(source['displayName']),
    avatarUrl: text(source['avatarUrl']),
    updatedAt: numeric(source['updatedAt']),
  };
  if (typeof source['migratedFrom'] !== 'string') delete profile.migratedFrom;
  if (typeof source['migratedTo'] !== 'string') delete profile.migratedTo;
  if (typeof source['migratedAt'] !== 'number') delete profile.migratedAt;
  if (source['migratedSnapshot'] && typeof source['migratedSnapshot'] === 'object') {
    profile.migratedSnapshot = progressOf(source['migratedSnapshot'] as Partial<ProgressFields>);
  } else {
    delete profile.migratedSnapshot;
  }
  return profile;
};

/**
 * Whether a profile holds anything worth carrying into an account. A player
 * who opened the game and stood still has nothing to migrate.
 */
export const hasProgress = (p: ProgressFields): boolean =>
  p.xp > 0 ||
  p.energy > 0 ||
  p.bestEnergy > 0 ||
  p.wins > 0 ||
  p.auraMask > 0 ||
  p.lifetimeWins > 0 ||
  p.bestStage > 0 ||
  p.rebirths > 0 ||
  p.totalWalls > 0;
