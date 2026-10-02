import {
  MessageType,
  ROOM_NAME,
  type AuthStateMessage,
  type ClaimStageMessage,
  type EmoteMessage,
  type AuraMessage,
  type BuyUpgradeMessage,
  type EquipCharacterMessage,
  type MoveMessage,
  type NoticeMessage,
  type PunchMessage,
  type PunchedMessage,
  type RespawnMessage,
  type SetAuthMessage,
  type SetAvatarMessage,
  type SetIdentityMessage,
  type SmashMessage,
  type SmashedMessage,
  type StageAwardedMessage,
  type StageClearedMessage,
  type SetMorphMessage,
  type TeleportMessage,
  type TrainedMessage,
} from '@jjk/shared';
import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import { clientConfig } from '../config/clientConfig.js';
import { logger } from '../util/logger.js';
import { takeDeepLinkRoom } from './deepLink.js';
import type { ConnectionStatus, LeaderboardSnapshot, NetGameState, NetLeaderEntry, NetPlayerState } from './netTypes.js';

const SCOPE = 'NetworkClient';

/** Key under which this browser's stable player id is kept. */
const PLAYER_ID_KEY = 'jjkevolution.playerId';

/** Backoff between join attempts, in milliseconds. A cold host takes a while. */
const JOIN_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;

/**
 * The server's "storage unavailable" refusal. Not a failure of THIS join but
 * of the database behind it, so the retry does not give up: it keeps asking
 * at the longest backoff until the server can read profiles again.
 */
const STORAGE_UNAVAILABLE = 4105;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const resolvePlayerId = (): string => {
  const fresh = `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    const existing = window.localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    window.localStorage.setItem(PLAYER_ID_KEY, fresh);
  } catch {
    return fresh;
  }
  return fresh;
};

export interface NetworkHandlers {
  onStatusChange?(status: ConnectionStatus, detail?: string): void;
  onSelfJoined?(sessionId: string): void;
  onPlayerAdded?(sessionId: string, player: NetPlayerState): void;
  onPlayerChanged?(sessionId: string, player: NetPlayerState): void;
  onPlayerRemoved?(sessionId: string): void;
  onRespawn?(message: RespawnMessage): void;
  onStageAwarded?(message: StageAwardedMessage): void;
  onStageCleared?(message: StageClearedMessage): void;
  onTrained?(message: TrainedMessage): void;
  onSmashed?(message: SmashedMessage): void;
  onPunched?(message: PunchedMessage): void;
  onNotice?(message: NoticeMessage): void;
  onAuthState?(message: AuthStateMessage): void;
  /** The connection dropped unexpectedly; a rejoin is under way. Every other player is gone from view. */
  onConnectionLost?(): void;
}

/** Seconds between rejoin attempts after a dropped connection. */
const REJOIN_DELAY_MS = 2500;

/**
 * Thin wrapper over colyseus.js. The rest of the client never imports
 * colyseus.js directly.
 */
export class NetworkClient {
  private readonly handlers: NetworkHandlers;
  private client: Client | null = null;
  private room: Room<NetGameState> | null = null;
  private status: ConnectionStatus = 'idle';
  /** The portal's game token, asked for at join and on every login change. */
  private token: (() => string | null) | null = null;
  /** The last token the server was told about, so an unchanged one is not resent. */
  private sentToken: string | null | undefined = undefined;
  private look: (() => SetAvatarMessage | null) | null = null;
  private identityOf: (() => SetIdentityMessage) | null = null;
  /** True once `disconnect` was asked for: a deliberate leave is never rejoined. */
  private leaving = false;
  private rejoining = false;

  constructor(handlers: NetworkHandlers = {}) {
    this.handlers = handlers;
  }

  setLookProvider(provider: () => SetAvatarMessage | null): void {
    this.look = provider;
  }

  sendAvatar(message: SetAvatarMessage): void {
    this.room?.send(MessageType.SetAvatar, message);
  }

  sendIdentity(message: SetIdentityMessage): void {
    this.room?.send(MessageType.SetIdentity, message);
  }

  /**
   * Where the portal's TOKEN comes from. The token is the only thing about
   * the login that is ever sent: the server asks Bloxity whose it is. An
   * account id from the browser would be a claim, and claims are not trusted.
   */
  setTokenProvider(provider: () => string | null): void {
    this.token = provider;
  }

  /**
   * Tell the server the login changed (sign-in, sign-out, account switch).
   * The live session switches profile; there is no reconnect. Deduped: an
   * unchanged token is not resent.
   */
  sendAuth(token: string | null): void {
    if (!this.room) return;
    if (token === this.sentToken) return;
    this.sentToken = token;
    const message: SetAuthMessage = { token };
    this.room.send(MessageType.SetAuth, message);
  }

  setDisplayProvider(provider: () => SetIdentityMessage): void {
    this.identityOf = provider;
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get roomId(): string {
    return this.room?.roomId ?? '';
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  /** The server's clock, in seconds. */
  get elapsed(): number {
    return this.room?.state?.elapsed ?? 0;
  }

  /** Every player in the room, as the server has them (the local one included). */
  get players(): ReadonlyMap<string, NetPlayerState> | null {
    return (this.room?.state?.players as ReadonlyMap<string, NetPlayerState> | undefined) ?? null;
  }

  async connect(): Promise<void> {
    if (!clientConfig.serverUrl) {
      this.setStatus('error');
      throw new Error(
        'No game server is configured. Set VITE_SERVER_URL to the Colyseus ' +
          'endpoint (for example wss://your-server-host) and rebuild.',
      );
    }

    this.setStatus('connecting');
    logger.info(SCOPE, `joining "${ROOM_NAME}" at ${clientConfig.serverUrl}`);

    this.client ??= new Client(clientConfig.serverUrl);
    const playerId = resolvePlayerId();
    const attempts = JOIN_BACKOFF_MS.length + 1;
    let joinedWith: string | null = null;

    // An invite link or the store page's Join button names a room: try it first, once.
    const linked = takeDeepLinkRoom();
    if (linked) {
      try {
        const token = this.token?.() ?? null;
        this.room = await this.client.joinById<NetGameState>(linked, {
          playerId,
          token,
          avatar: this.look?.() ?? undefined,
          identity: this.identityOf?.() ?? undefined,
        });
        joinedWith = token;
        logger.info(SCOPE, `joined the linked room ${linked}`);
      } catch (error) {
        // Gone, full, or held by another pod: the ordinary join below still gets them in.
        logger.warn(SCOPE, `linked room ${linked} could not be joined (${error instanceof Error ? error.message : String(error)}); joining any room`);
      }
    }

    for (let attempt = 1; !this.room; attempt += 1) {
      const token = this.token?.() ?? null;
      try {
        this.room = await this.client.joinOrCreate<NetGameState>(ROOM_NAME, {
          playerId,
          token,
          avatar: this.look?.() ?? undefined,
          identity: this.identityOf?.() ?? undefined,
        });
        joinedWith = token;
        break;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const code = (error as { code?: unknown }).code;
        const storageDown = code === STORAGE_UNAVAILABLE;
        logger.warn(SCOPE, `join attempt ${attempt}${storageDown ? '' : `/${attempts}`} failed: ${detail}`);
        if (!storageDown && attempt >= attempts) {
          this.setStatus('error', detail);
          throw error;
        }
        const wait = JOIN_BACKOFF_MS[Math.min(attempt, JOIN_BACKOFF_MS.length) - 1] ?? 0;
        this.setStatus('connecting', storageDown ? 'the server is waiting for its database' : `attempt ${attempt + 1}/${attempts}`);
        await sleep(wait);
      }
    }

    if (!this.room) throw new Error('join produced no room');

    this.sentToken = joinedWith;
    this.bindRoom(this.room);
    this.setStatus('connected');
    logger.info(SCOPE, `joined roomId=${this.room.roomId} sessionId=${this.room.sessionId}`);
    this.handlers.onSelfJoined?.(this.room.sessionId);
    // A login that changed while the join was in flight is sent now.
    this.sendAuth(this.token?.() ?? null);
  }

  /** Report one simulated input. Deliberately NOT rate limited. */
  sendInput(message: MoveMessage): void {
    this.room?.send(MessageType.Move, message);
  }

  /** One training punch. Carries nothing: the server decides what it pays. */
  train(): void {
    this.room?.send(MessageType.Train, {});
  }

  /** One blow at a wall, naming it - a hint the server checks. */
  smash(wall: number): void {
    const message: SmashMessage = { wall };
    this.room?.send(MessageType.Smash, message);
  }

  /** One blow at another player in the arena, naming them - a hint the server checks. */
  punch(target: string): void {
    const message: PunchMessage = { target };
    this.room?.send(MessageType.Punch, message);
  }

  claimStage(stage: number): void {
    const message: ClaimStageMessage = { stage };
    this.room?.send(MessageType.ClaimStage, message);
  }

  /** A Bloxity emote started on the local body: replicated to everyone through the server. */
  emote(id: string): void {
    const message: EmoteMessage = { id };
    this.room?.send(MessageType.Emote, message);
  }

  /** Equip a character (and wear its look). The server checks the Wins it needs. */
  equipCharacter(id: number): void {
    const message: EquipCharacterMessage = { id };
    this.room?.send(MessageType.EquipCharacter, message);
  }

  /** Wear the equipped character's look (true) or the player's own avatar (false). */
  setMorph(morph: boolean): void {
    const message: SetMorphMessage = { morph };
    this.room?.send(MessageType.SetMorph, message);
  }

  /** Buy the next level of an upgrade. The server checks the price. */
  buyUpgrade(id: string): void {
    const message: BuyUpgradeMessage = { id };
    this.room?.send(MessageType.BuyUpgrade, message);
  }

  buyAura(id: number): void {
    const message: AuraMessage = { id };
    this.room?.send(MessageType.BuyAura, message);
  }

  /** Equip an owned aura (0 takes it off). */
  equipAura(id: number): void {
    const message: AuraMessage = { id };
    this.room?.send(MessageType.EquipAura, message);
  }

  teleport(to: string): void {
    const message: TeleportMessage = { to };
    this.room?.send(MessageType.Teleport, message);
  }

  requestRebirth(): void {
    this.room?.send(MessageType.Rebirth, {});
  }

  requestRespawn(): void {
    this.room?.send(MessageType.RequestRespawn, {});
  }

  /** The four leaderboards, COPIED out of the schema as plain arrays. */
  get leaderboard(): LeaderboardSnapshot | null {
    const board = this.room?.state?.leaderboard;
    if (!board) return null;
    const copy = (rows: ArrayLike<NetLeaderEntry>): NetLeaderEntry[] => {
      const out: NetLeaderEntry[] = [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (row) out.push({ handle: row.handle, name: row.name, avatarUrl: row.avatarUrl, value: row.value });
      }
      return out;
    };
    return { energy: copy(board.energy), rebirths: copy(board.rebirths), wins: copy(board.wins), playtime: copy(board.playtime) };
  }

  async disconnect(): Promise<void> {
    this.leaving = true;
    await this.room?.leave(true);
    this.room = null;
    this.sentToken = undefined;
    this.setStatus('disconnected');
  }

  private bindRoom(room: Room<NetGameState>): void {
    const $ = getStateCallbacks(room);

    $(room.state).players.onAdd((player, sessionId) => {
      this.handlers.onPlayerAdded?.(sessionId, player);
      $(player).onChange(() => {
        this.handlers.onPlayerChanged?.(sessionId, player);
      });
      // A NESTED schema's changes do not bubble to its parent.
      $(player.avatar).onChange(() => {
        this.handlers.onPlayerChanged?.(sessionId, player);
      });
      $(player.upgrades).onChange(() => {
        this.handlers.onPlayerChanged?.(sessionId, player);
      });
    });

    $(room.state).players.onRemove((_player, sessionId) => {
      this.handlers.onPlayerRemoved?.(sessionId);
    });

    room.onMessage<RespawnMessage>(MessageType.Respawn, (message) => {
      this.handlers.onRespawn?.(message);
    });

    room.onMessage<StageAwardedMessage>(MessageType.StageAwarded, (message) => {
      this.handlers.onStageAwarded?.(message);
    });

    room.onMessage<StageClearedMessage>(MessageType.StageCleared, (message) => {
      this.handlers.onStageCleared?.(message);
    });

    room.onMessage<TrainedMessage>(MessageType.Trained, (message) => {
      this.handlers.onTrained?.(message);
    });

    room.onMessage<SmashedMessage>(MessageType.Smashed, (message) => {
      this.handlers.onSmashed?.(message);
    });

    room.onMessage<PunchedMessage>(MessageType.Punched, (message) => {
      this.handlers.onPunched?.(message);
    });

    room.onMessage<NoticeMessage>(MessageType.Notice, (message) => {
      this.handlers.onNotice?.(message);
    });

    room.onMessage<AuthStateMessage>(MessageType.AuthState, (message) => {
      logger.info(SCOPE, `playing as ${message.status}${message.note ? ` (${message.note})` : ''}`);
      this.handlers.onAuthState?.(message);
    });

    room.onError((code, message) => {
      logger.error(SCOPE, `room error ${code}: ${message ?? ''}`);
      this.setStatus('error', message);
    });

    room.onLeave((code) => {
      logger.warn(SCOPE, `left room (code ${code})`);
      if (this.room !== room) return;
      // A dead room is never written to again: every send would throw into the console, every frame.
      this.room = null;
      this.setStatus('disconnected', `code ${code}`);
      if (!this.leaving) void this.rejoin();
    });
  }

  /**
   * REJOIN after a dropped connection (a server restart, a network blip, a
   * phone waking up). The server saved the profile when the session left, so
   * joining again restores every figure; the run starts afresh, as any join
   * does. Retried until it works or the game leaves.
   */
  private async rejoin(): Promise<void> {
    if (this.rejoining) return;
    this.rejoining = true;
    this.handlers.onConnectionLost?.();
    try {
      while (!this.leaving && !this.room) {
        this.setStatus('reconnecting');
        await sleep(REJOIN_DELAY_MS);
        if (this.leaving) break;
        try {
          await this.connect();
        } catch (error) {
          logger.warn(SCOPE, `rejoin failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      this.rejoining = false;
    }
  }

  private setStatus(status: ConnectionStatus, detail?: string): void {
    this.status = status;
    this.handlers.onStatusChange?.(status, detail);
  }
}
