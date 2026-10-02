/**
 * Network-level constants. Must stay identical on client and server.
 */

/** Colyseus room registered by the server and joined by the client. */
export const ROOM_NAME = 'jjkevolution';

/**
 * Default server port. Override with the PORT env var on the server.
 *
 * Deliberately unique: the other games in this series occupy 2567-2760 on the
 * same machine, and sharing a port means whichever server starts first
 * silently serves both clients.
 */
export const DEFAULT_SERVER_PORT = 2790;

/**
 * Most players in ONE room.
 *
 * The matchmaker locks a room at this figure and opens another, so a
 * sixteenth player gets a new room rather than a refusal.
 */
export const MAX_PLAYERS_PER_ROOM = 15;

/**
 * How many OTHER players are drawn at once. A RENDERING limit only: every
 * player in the room is tracked and synchronised on every patch.
 */
export const VISIBLE_REMOTE_PLAYERS = 14;

/** Server simulation / state broadcast rate, in Hz. */
export const SERVER_TICK_RATE = 20;

/** Milliseconds between server ticks. */
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

/**
 * Client->server and server->client message identifiers.
 *
 * A const object rather than an enum so it survives `verbatimModuleSyntax`.
 */
export const MessageType = {
  /** Client -> server: one frame of INPUT. Never a transform. */
  Move: 'move',
  /** Client -> server: one training punch. Carries nothing: the server decides what it pays. */
  Train: 'train',
  /** Server -> client: a training punch was accepted and what it paid. */
  Trained: 'trained',
  /** Client -> server: one blow at a wall, naming the wall as a HINT. Never a figure. */
  Smash: 'smash',
  /** Server -> client: a blow at a wall landed: the damage and the wall's health after it. */
  Smashed: 'smashed',
  /** Client -> server: one blow at another player in the arena, naming them as a HINT. */
  Punch: 'punch',
  /** Server -> client (to the attacker): a blow landed on a player. */
  Punched: 'punched',
  /** Server -> client: authoritative placement. */
  Respawn: 'respawn',
  /** Client -> server: "put me back at the spawn". */
  RequestRespawn: 'requestRespawn',
  /** Client -> server: teleport to a named place, or to a stage this player has reached. */
  Teleport: 'teleport',
  /** Client -> server: "I am on this stage's claim pad." A request, never a grant. */
  ClaimStage: 'claimStage',
  /** Server -> client: a stage's Wins were banked. */
  StageAwarded: 'stageAwarded',
  /** Server -> client: this player just broke a stage's last wall. */
  StageCleared: 'stageCleared',
  /** Client -> server: equip a character (from its pedestal or the menu). */
  EquipCharacter: 'equipCharacter',
  /** Client -> server: show the equipped character (true) or the player's own avatar (false). */
  SetMorph: 'setMorph',
  /** Client -> server: buy one level of an upgrade. */
  BuyUpgrade: 'buyUpgrade',
  /** Client -> server: buy an aura (once), or equip an owned one (0 takes it off). */
  BuyAura: 'buyAura',
  EquipAura: 'equipAura',
  /** Client -> server: play a Bloxity emote (cosmetic; replicated through PlayerState.emote). */
  Emote: 'emote',
  /** Client -> server: "rebirth me". Carries nothing. */
  Rebirth: 'rebirth',
  /** Server -> client: the outcome of a request, for feedback. */
  Notice: 'notice',
  /** Client -> server: "this is what my Bloxity avatar looks like". */
  SetAvatar: 'setAvatar',
  /** Client -> server: the player's Bloxity DISPLAY NAME and portrait. */
  SetIdentity: 'setIdentity',
  /**
   * Client -> server: the portal's game TOKEN, or null when signed out. Never
   * an account id: the server asks Bloxity who the token belongs to.
   */
  SetAuth: 'setAuth',
  /** Server -> client: whose progress this session is now playing on. */
  AuthState: 'authState',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];
