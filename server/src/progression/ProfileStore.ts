import { AURAS, STAGE_COUNT, UPGRADES, WALLS, bestUnlockedCharacter, characterUnlocked, ownsAura } from '@jjk/shared';
import {
  emptyProgress,
  progressOf,
  storage,
  type MigrationFields,
  type ProfileFields,
  type ProgressFields,
  type StoredProfile,
} from '../persistence/index.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { logger } from '../util/logger.js';

const SCOPE = 'profiles';

/** How often the leaderboard cache is re-read from storage. */
const CACHE_REFRESH_MS = 30_000;

/** An upgrade level from a save: whole, and never past the upgrade's maximum. */
const levelOf = (value: number, id: (typeof UPGRADES)[number]['id']): number => {
  const def = UPGRADES.find((u) => u.id === id)!;
  return Math.min(Number.isFinite(def.max) ? def.max : 65535, Math.max(0, Math.floor(value)));
};

/** Only the bits of auras that exist. */
const AURA_BITS = 2 ** AURAS.length - 1;

/**
 * Progression that outlives a session.
 *
 * A thin, PER-KEY front on the storage: a profile is READ FROM STORAGE AT
 * JOIN TIME, never from a cache filled at boot, because several pods share
 * one database and the boot cache of one knows nothing of what another has
 * written since. The cache here exists for exactly one reader - the
 * leaderboards, which want everyone at once - and is refreshed on a timer
 * with newer `updatedAt` winning.
 */
class ProfileStore {
  private readonly cache = new Map<string, StoredProfile>();
  private refreshTimer: NodeJS.Timeout | null = null;

  get kind(): string {
    return storage.kind;
  }

  /** Connect the store and warm the leaderboard cache. Never throws. */
  async open(): Promise<void> {
    await storage.open();
    await this.refresh();
    this.refreshTimer = setInterval(() => void this.refresh(), CACHE_REFRESH_MS);
    this.refreshTimer.unref?.();
  }

  /** Profiles known to the cache, for the boards. */
  get size(): number {
    return this.cache.size;
  }

  entries(): IterableIterator<[string, StoredProfile]> {
    return this.cache.entries();
  }

  /** The profile under a key, read from storage NOW. Throws when storage is unreachable. */
  async load(key: string): Promise<StoredProfile | null> {
    const profile = await storage.get(key);
    if (profile) this.remember(key, profile);
    return profile;
  }

  /** What a live session is worth on disk: the deriving facts and the identity. */
  snapshot(player: PlayerState): ProfileFields {
    const u = player.upgrades;
    return {
      xp: player.xp,
      energy: player.energy,
      bestEnergy: player.bestEnergy,
      wins: player.wins,
      lifetimeWins: player.lifetimeWins,
      rebirths: player.rebirths,
      character: player.character,
      morph: player.morph ? 1 : 0,
      aura: player.aura,
      auraMask: player.auraMask,
      upSpeed: u.speed,
      upTraining: u.trainingRate,
      upLuck: u.luck,
      upBoss: u.bossDamage,
      upPunch: u.punchRate,
      bestStage: player.bestStage,
      totalWalls: player.totalWalls,
      pvpKos: player.pvpKos,
      playSeconds: player.playSeconds,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
      updatedAt: Date.now(),
    };
  }

  /**
   * Apply a profile onto player state - or the fresh-player defaults when
   * there is none. Only the DERIVING facts: level, gain and health are
   * recomputed by the progression service, which the room runs right after.
   */
  applyTo(player: PlayerState, profile: StoredProfile | null, keepIdentity = false): void {
    const p = profile ? progressOf(profile) : freshProgress();
    player.xp = p.xp;
    player.energy = p.energy;
    player.bestEnergy = Math.max(p.bestEnergy, p.energy);
    player.wins = p.wins;
    player.lifetimeWins = Math.max(p.lifetimeWins, p.wins);
    // Uncapped: any whole, finite count a save holds.
    player.rebirths = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(p.rebirths)));
    // A character that is held must be unlocked by the Wins earned; anything else is the best that is.
    const character = Math.floor(p.character);
    player.character = characterUnlocked(character, player.lifetimeWins) ? character : bestUnlockedCharacter(player.lifetimeWins);
    player.morph = p.morph >= 1;
    player.auraMask = Math.floor(p.auraMask) % (AURA_BITS + 1);
    player.aura = ownsAura(player.auraMask, Math.floor(p.aura)) ? Math.floor(p.aura) : 0;
    player.upgrades.speed = levelOf(p.upSpeed, 'speed');
    player.upgrades.trainingRate = levelOf(p.upTraining, 'trainingRate');
    player.upgrades.luck = levelOf(p.upLuck, 'luck');
    player.upgrades.bossDamage = levelOf(p.upBoss, 'bossDamage');
    player.upgrades.punchRate = levelOf(p.upPunch, 'punchRate');
    player.bestStage = Math.min(STAGE_COUNT, Math.max(0, Math.floor(p.bestStage)));
    player.totalWalls = Math.floor(p.totalWalls);
    player.pvpKos = Math.floor(p.pvpKos);
    player.playSeconds = p.playSeconds;
    // Every session starts a new run: every wall standing, every claim open.
    player.wallsBroken = 0;
    player.wallHp = WALLS[0]?.hp ?? 0;
    player.claimed = 0;
    if (!keepIdentity) {
      player.displayName = profile?.displayName ?? '';
      player.avatarUrl = profile?.avatarUrl ?? '';
    }
  }

  /** Save a live session under a key. Resolves once the write has landed. */
  async save(key: string, player: PlayerState, extras?: MigrationFields): Promise<void> {
    const fields = this.snapshot(player);
    this.remember(key, { ...(this.cache.get(key) ?? {}), ...fields, ...extras } as StoredProfile);
    await storage.put(key, fields, extras);
  }

  /** Create a profile only if the key is free. Throws when storage is unreachable. */
  async insertIfAbsent(key: string, profile: ProfileFields & MigrationFields): Promise<boolean> {
    const inserted = await storage.insertIfAbsent(key, profile);
    if (inserted) this.remember(key, { ...profile });
    return inserted;
  }

  /**
   * RETIRE a guest profile whose progress just became an account's: reset its
   * progress, keep what it held as `migratedSnapshot`, and mark where it went.
   * A retired guest is never migrated again and never ranks on a board.
   */
  async retireGuest(
    guestKey: string,
    accountKey: string,
    snapshot: ProgressFields,
    identity: { displayName: string; avatarUrl: string },
  ): Promise<void> {
    const now = Date.now();
    const fields: ProfileFields = { ...freshProgress(), ...identity, updatedAt: now };
    const extras: MigrationFields = { migratedTo: accountKey, migratedAt: now, migratedSnapshot: snapshot };
    this.remember(guestKey, { ...(this.cache.get(guestKey) ?? {}), ...fields, ...extras } as StoredProfile);
    await storage.put(guestKey, fields, extras);
  }

  flush(timeoutMs?: number): Promise<boolean> {
    return storage.flush(timeoutMs);
  }

  async close(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    await storage.close();
  }

  private remember(key: string, profile: StoredProfile): void {
    const known = this.cache.get(key);
    if (known && known.updatedAt > profile.updatedAt) return;
    this.cache.set(key, profile);
  }

  private async refresh(): Promise<void> {
    try {
      for (const [key, profile] of await storage.loadAll()) this.remember(key, profile);
    } catch (error) {
      logger.warn(SCOPE, `leaderboard cache not refreshed: ${String(error)}`);
    }
  }
}

/** What a brand-new player holds: Yuji's +1, their own avatar, and nothing else. */
const freshProgress = (): ProgressFields => emptyProgress();

export const profileStore = new ProfileStore();
