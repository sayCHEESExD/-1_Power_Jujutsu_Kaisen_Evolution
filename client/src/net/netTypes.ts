import type { AvatarAppearance, AvatarProportions } from '@jjk/shared';
import type { MapSchema } from '@colyseus/schema';

/**
 * Client-side TYPE mirror of the server's Colyseus schema.
 *
 * Types only - colyseus.js builds the concrete schema instances at runtime
 * from the handshake reflection.
 */
export interface NetPlayerState {
  sessionId: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  speed: number;
  verticalVelocity: number;
  grounded: boolean;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  lastInputSeq: number;
  jumpLatched: boolean;
  jumpCount: number;

  punchCount: number;
  attackCount: number;
  /** 1 a wall, 2 a player, 3 a boss wall. */
  attackKind: number;
  attackX: number;
  attackY: number;
  attackZ: number;
  hurtCount: number;
  /** The Bloxity emote playing (empty for none), and how many have started. */
  emote: string;
  emoteCount: number;

  avatar: AvatarAppearance & AvatarProportions;
  displayName: string;
  /** The VERIFIED Bloxity username ('' for guests), set by the server from Bloxity's answer. */
  username: string;
  avatarUrl: string;

  xp: number;
  level: number;
  energy: number;
  bestEnergy: number;
  rebirths: number;
  wins: number;
  lifetimeWins: number;
  character: number;
  morph: boolean;
  aura: number;
  auraMask: number;
  upgrades: NetUpgrades;
  gainPerPunch: number;
  energyMultiplier: number;
  /** The bag the player trains at (an index into BAGS), or -1. */
  bag: number;
  moveSpeed: number;
  jumpVelocity: number;

  wallsBroken: number;
  wallHp: number;
  claimed: number;
  bestStage: number;
  totalWalls: number;

  health: number;
  maxHealth: number;
  inPvp: boolean;
  pvpKos: number;

  playSeconds: number;
  ready: boolean;
}

export interface NetUpgrades {
  speed: number;
  trainingRate: number;
  luck: number;
  bossDamage: number;
  punchRate: number;
}

export interface NetLeaderEntry {
  handle: string;
  name: string;
  avatarUrl: string;
  value: number;
}

export interface NetLeaderboardState {
  energy: ArrayLike<NetLeaderEntry>;
  rebirths: ArrayLike<NetLeaderEntry>;
  wins: ArrayLike<NetLeaderEntry>;
  playtime: ArrayLike<NetLeaderEntry>;
}

export interface NetGameState {
  players: MapSchema<NetPlayerState>;
  elapsed: number;
  leaderboard: NetLeaderboardState;
}

/** A leaderboard flattened into plain data, ready to draw. */
export interface LeaderboardSnapshot {
  energy: readonly NetLeaderEntry[];
  rebirths: readonly NetLeaderEntry[];
  wins: readonly NetLeaderEntry[];
  playtime: readonly NetLeaderEntry[];
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
