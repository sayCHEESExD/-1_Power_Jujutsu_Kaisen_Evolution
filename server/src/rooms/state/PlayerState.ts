import { Schema, type } from '@colyseus/schema';
import { JUMP_VELOCITY, PVP, RUN_SPEED, SPAWN, STARTER_CHARACTER, WALLS } from '@jjk/shared';
import { AvatarState } from './AvatarState.js';

/** The five permanent upgrade levels, bought with Wins. */
export class UpgradeState extends Schema {
  @type('uint16') speed = 0;
  @type('uint16') trainingRate = 0;
  @type('uint16') luck = 0;
  @type('uint16') bossDamage = 0;
  @type('uint16') punchRate = 0;
}

/**
 * Replicated per-player state.
 *
 * Every field is written by the SERVER: transform and motion by the
 * authoritative simulation, progression by its own service. Nothing is ever
 * copied from a client message.
 */
export class PlayerState extends Schema {
  @type('string') sessionId = '';

  @type('float32') x: number = SPAWN.x;
  @type('float32') y: number = SPAWN.y;
  @type('float32') z: number = SPAWN.z;
  @type('float32') rotationY: number = SPAWN.yaw;

  @type('float32') speed = 0;
  @type('float32') verticalVelocity = 0;
  @type('boolean') grounded = true;

  /** Authoritative velocity, for client reconciliation. */
  @type('float32') velocityX = 0;
  @type('float32') velocityY = 0;
  @type('float32') velocityZ = 0;
  @type('uint32') lastInputSeq = 0;
  @type('boolean') jumpLatched = false;
  @type('uint32') jumpCount = 0;

  /** Accepted training punches, counted, so every client plays each one. */
  @type('uint32') punchCount = 0;
  /** Accepted blows (at a wall or a player), counted, so every client plays each one. */
  @type('uint32') attackCount = 0;
  /** What the last blow hit: 1 a wall, 2 a player, 3 a boss wall. */
  @type('uint8') attackKind = 0;
  /** Where the last blow landed. */
  @type('float32') attackX = 0;
  @type('float32') attackY = 0;
  @type('float32') attackZ = 0;
  /** The Bloxity emote playing (empty for none), and a count of emotes started so a repeat replays. */
  @type('string') emote = '';
  @type('uint16') emoteCount = 0;
  /** Blows this player has TAKEN in the arena, so every client plays each flinch. */
  @type('uint16') hurtCount = 0;

  @type(AvatarState) avatar = new AvatarState();
  @type('string') displayName = '';
  /** The VERIFIED Bloxity username ('' for guests): set from Bloxity's answer, never a client message. */
  @type('string') username = '';
  @type('string') avatarUrl = '';

  // ---- progression: every figure is the server's own
  /** Total XP this rebirth: the level is read off it. */
  @type('float64') xp = 0;
  /** The level shown: XP's level, held at the rebirth's cap. */
  @type('uint32') level = 1;
  /** Cursed Energy: earned by punching only; the damage a blow deals. */
  @type('float64') energy = 0;
  /** Highest Cursed Energy ever held (a rebirth resets `energy`, never this). */
  @type('float64') bestEnergy = 0;
  @type('float64') rebirths = 0;
  /** Written through `Wallet` only: spent on upgrades and auras. */
  @type('float64') wins = 0;
  /** Wins earned, ever: characters unlock at thresholds of it. */
  @type('float64') lifetimeWins = 0;
  /** The equipped character's id (1..12), and whether the player wears it (else their own avatar). */
  @type('uint8') character = STARTER_CHARACTER;
  @type('boolean') morph = false;
  /** The equipped aura (0 none) and the owned ones (bit id-1, a float64 mask). */
  @type('uint8') aura = 0;
  @type('float64') auraMask = 0;
  @type(UpgradeState) upgrades = new UpgradeState();
  /** Cursed Energy one ordinary punch pays right now, where the player stands. */
  @type('float64') gainPerPunch = 1;
  /** Everything a punch is multiplied by besides the character: the HUD's "2.8x Energy". */
  @type('float64') energyMultiplier = 1;
  /** The bag whose mat the player stands on (an index into BAGS), or -1. */
  @type('int16') bag = -1;
  @type('float32') moveSpeed = RUN_SPEED;
  @type('float32') jumpVelocity = JUMP_VELOCITY;

  // ---- the current RUN through the walls: from the spawn until back at it
  /** Walls broken this run. Walls fall in order, so the next to fall is WALLS[wallsBroken]. */
  @type('uint16') wallsBroken = 0;
  /** Health left in the next wall. */
  @type('float64') wallHp: number = WALLS[0]?.hp ?? 0;
  /** Bit (stage - 1) per stage whose Wins were claimed this run (a float64 mask: fifty stages). */
  @type('float64') claimed = 0;
  /** Highest stage ever completed: how far the Worlds menu reaches. */
  @type('uint8') bestStage = 0;
  /** Walls broken, ever. */
  @type('float64') totalWalls = 0;

  // ---- the PvP arena
  @type('float64') health: number = PVP.baseHealth;
  @type('float64') maxHealth: number = PVP.baseHealth;
  /** True while the server has the player inside the arena. */
  @type('boolean') inPvp = false;
  /** Players knocked out in the arena, ever. */
  @type('uint32') pvpKos = 0;

  @type('float64') playSeconds = 0;

  /** True once the server has simulated at least one input for this player. */
  @type('boolean') ready = false;
}
