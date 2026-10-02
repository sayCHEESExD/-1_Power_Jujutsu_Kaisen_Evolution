import type { AvatarAppearance, AvatarProportions } from './avatar.js';

/**
 * Client -> server input (MessageType.Move).
 *
 * INPUT ONLY. No position, velocity or target: the server simulates movement
 * (runs and jumps) from intent and owns the result.
 */
export interface MoveMessage {
  /** Monotonically increasing input sequence number. */
  seq: number;
  /** Seconds this input covers. Clamped and rate-limited server-side. */
  dt: number;
  /** -1..1, camera-relative. */
  moveX: number;
  /** -1..1, camera-relative. */
  moveZ: number;
  /** The jump control, held. Only a fresh press, on the ground, jumps. */
  jump: boolean;
  /** Yaw the camera faced: movement is camera-relative. */
  cameraYaw: number;
}

/** Server -> client: a training punch was accepted. */
export interface TrainedMessage {
  /** Cursed Energy (and XP) the punch paid. */
  gain: number;
  /** The bag multiplier it was paid at (1 away from a bag). */
  bag: number;
  /** True when the punch rolled LUCKY (it paid `LUCKY_MULTIPLIER` times). */
  lucky?: boolean;
  /** True for a punch the bag threw on its own (no click): the client plays the swing for it. */
  auto?: boolean;
}

/** Client -> server: one blow at a wall. `wall` is a HINT (the global wall id). */
export interface SmashMessage {
  wall: number;
}

/** Server -> client: a blow at a wall landed. */
export interface SmashedMessage {
  wall: number;
  damage: number;
  /** The wall's health after the blow (0 = broken). */
  hp: number;
  broken: boolean;
  /** True when it was a stage's boss wall (Boss Damage applied). */
  boss?: boolean;
}

/** Client -> server: one blow at another player. `target` is a HINT (their session id). */
export interface PunchMessage {
  target: string;
}

/** Server -> client (the attacker): a blow landed. */
export interface PunchedMessage {
  target: string;
  damage: number;
  knockedOut: boolean;
}

/** Why a player was placed. */
export type RespawnReason = 'manual' | 'join' | 'teleport' | 'rebirth' | 'defeated' | 'claimed';

/** Server -> client authoritative placement (MessageType.Respawn). */
export interface RespawnMessage {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  reason: RespawnReason;
}

export interface TeleportMessage {
  /** A `TeleportId`: spawn, characters, training, pvp, or stageN. */
  to: string;
}

/** Client -> server: "I am on this stage's claim pad." A request, never a grant. */
export interface ClaimStageMessage {
  stage: number;
}

/** Server -> client: a stage's Wins landed. Presentation only. */
export interface StageAwardedMessage {
  stage: number;
  wins: number;
  total: number;
  /** A character the new lifetime total unlocked (and equipped), or 0. */
  unlocked: number;
}

/** Server -> client: this player just broke a stage's last wall. */
export interface StageClearedMessage {
  stage: number;
  /** True on the first time this player has ever completed it. */
  firstClear: boolean;
}

/** Client -> server: equip a character. */
export interface EquipCharacterMessage {
  id: number;
}

/** Client -> server: wear the equipped character (true) or the player's own avatar (false). */
export interface SetMorphMessage {
  morph: boolean;
}

/** Client -> server: buy the next level of an upgrade. */
export interface BuyUpgradeMessage {
  id: string;
}

/** Client -> server: buy an aura, or equip an owned one (0 = none). */
export interface AuraMessage {
  id: number;
}

/** Server -> client: what happened to a request, so the UI can say so. */
export interface NoticeMessage {
  kind: 'bought' | 'equipped' | 'refused' | 'rebirth' | 'locked' | 'info';
  text: string;
}

/**
 * Client -> server: the player chose a Bloxity emote in the portal's picker.
 * COSMETIC: only its shape is checked (Bloxity only sends emotes the player
 * owns, and nothing in the game depends on which one plays).
 */
export interface EmoteMessage {
  id: string;
}

/** A Bloxity emote catalogue id: 24 hex characters. */
export const isEmoteId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id);

export interface SetAvatarMessage {
  appearance: AvatarAppearance;
  proportions: AvatarProportions;
}

export interface SetIdentityMessage {
  displayName: string;
  avatarUrl: string;
}

/** Client -> server: the portal's game TOKEN, or null when signed out. */
export interface SetAuthMessage {
  token: string | null;
}

export type AuthStatus = 'account' | 'guest' | 'unavailable';

export interface AuthStateMessage {
  status: AuthStatus;
  note?: string;
}
