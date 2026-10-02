import { Client, Room, ServerError } from '@colyseus/core';
import {
  BAGS,
  BAG_AUTO_PUNCH_SECONDS,
  MAX_PLAYERS_PER_ROOM,
  MessageType,
  PVP,
  SPAWN,
  STAGE_COUNT,
  TELEPORTS,
  accountKeyFor,
  bagTier,
  canEnterPvp,
  canUseBag,
  formatAmount,
  formatCount,
  formatWins,
  inPvpZone,
  isEmoteId,
  isAccountKey,
  isValidGuestId,
  rebirthMultiplier,
  sanitizeAppearance,
  sanitizeIdentity,
  sanitizeProportions,
  stageEntry,
  type AuraMessage,
  type AuthStateMessage,
  type AuthStatus,
  type BuyUpgradeMessage,
  type ClaimStageMessage,
  type EmoteMessage,
  type EquipCharacterMessage,
  type MoveMessage,
  type NoticeMessage,
  type Placement,
  type PunchMessage,
  type PunchedMessage,
  type RespawnMessage,
  type RespawnReason,
  type SetAuthMessage,
  type SetAvatarMessage,
  type SetIdentityMessage,
  type SetMorphMessage,
  type SmashMessage,
  type SmashedMessage,
  type StageAwardedMessage,
  type StageClearedMessage,
  type TeleportMessage,
  type TrainedMessage,
} from '@jjk/shared';
import { tokenHash, verifyGameToken } from '../auth/BloxityAuth.js';
import { reportIdentityOf, statRegistry, statValuesOf, type StatRow } from '../bloxity/statReporter.js';
import { serverConfig } from '../config/serverConfig.js';
import { MovementService } from '../movement/MovementService.js';
import { hasProgress, progressOf, type ProfileFields, type StoredProfile } from '../persistence/index.js';
import { ActionLimiter } from '../progression/ActionLimiter.js';
import { AuraService } from '../progression/AuraService.js';
import { buxGrants } from '../progression/BuxGrants.js';
import { CharacterService } from '../progression/CharacterService.js';
import { leaderboardService } from '../progression/LeaderboardService.js';
import { profileStore } from '../progression/ProfileStore.js';
import { ProgressionService } from '../progression/ProgressionService.js';
import { PvpService } from '../progression/PvpService.js';
import { RebirthService } from '../progression/RebirthService.js';
import { UpgradeService } from '../progression/UpgradeService.js';
import { WallService } from '../progression/WallService.js';
import { wallet } from '../progression/Wallet.js';
import { logger } from '../util/logger.js';
import { GameState } from './state/GameState.js';
import { PlayerState } from './state/PlayerState.js';

const SCOPE = 'GameRoom';

/** Seconds between autosaves of every connected player. */
const AUTOSAVE_SECONDS = 15;
/** Milliseconds between looks for purchases waiting on an account. */
const GRANT_POLL_MS = 15_000;
/** Re-verification backoff for a token Bloxity could not be asked about. */
const REVERIFY_FIRST_MS = 15_000;
const REVERIFY_MAX_MS = 120_000;
/** How long a mid-session switch waits for the leaving profile to land before staying put. */
const SWITCH_SAVE_TIMEOUT_MS = 8000;
/** How long a leave or a dispose waits for its save to land before moving on. */
const LEAVE_SAVE_TIMEOUT_MS = 5000;
/** Longest token accepted. Bloxity's are a few hundred bytes. */
const MAX_TOKEN_LENGTH = 4096;
/** How long after a successful claim the player is sent home (the celebration plays meanwhile). */
const CLAIM_HOME_DELAY_MS = 1600;
/** Milliseconds between two "locked" notices to one player. */
const NOTICE_GAP_MS = 2000;

/** Join refusals. The client's retry/backoff recognises STORAGE_UNAVAILABLE. */
export const JOIN_ERROR = {
  ROOM_FULL: 4103,
  BAD_PLAYER_ID: 4104,
  STORAGE_UNAVAILABLE: 4105,
} as const;

interface JoinOptions {
  /** The browser's own guest id. NEVER an account id; the prefix is refused. */
  playerId?: string;
  /** The portal's game token, or nothing. Verified with Bloxity, never trusted. */
  token?: string | null;
  avatar?: SetAvatarMessage;
  identity?: SetIdentityMessage;
}

/** What `onAuth` resolves and hands to `onJoin`. */
interface ResolvedProfile {
  readonly key: string;
  readonly guestKey: string;
  readonly accountKey: string | null;
  /** The verified Bloxity username ('' for a guest). */
  readonly username: string;
  readonly token: string | null;
  readonly tokenHash: string;
  readonly status: AuthStatus;
  readonly profile: StoredProfile | null;
  readonly migrated: boolean;
}

/** Per-session bookkeeping the replicated state must not carry. */
interface Session {
  key: string;
  guestKey: string;
  accountKey: string | null;
  token: string | null;
  tokenHash: string;
  status: AuthStatus;
  /** True while a login change is being applied: autosaves and grants hold off. */
  switching: boolean;
  queued: SetAuthMessage | null;
  granting: boolean;
  reverifyAt: number;
  reverifyDelay: number;
  grantPollAt: number;
  lastNoticeAt: number;
}

/**
 * The authoritative room.
 *
 * Composition only: every rule lives in a service, and this decides the order
 * they run in. The one hard rule: nothing a client sends is ever copied into
 * state. A Move is simulated; a training punch, a blow at a wall and a blow at
 * a player are rate limited and resolved against the position the server
 * simulated and the Cursed Energy it holds; a claim, an equip, an upgrade, an
 * aura and a rebirth are checked against the server's own run, Wins and level
 * - and each produces a result the server writes itself.
 *
 * WHOSE PROGRESS A SESSION PLAYS ON is decided here too: the client sends its
 * browser id and the portal's TOKEN, Bloxity is asked whose token it is, and
 * the profile is READ FROM STORAGE in `onAuth`. A read that fails refuses the
 * join - a player is never seated on an empty profile that would autosave
 * over their real one.
 */
export class GameRoom extends Room<GameState> {
  override maxClients = MAX_PLAYERS_PER_ROOM;
  override autoDispose = true;

  private readonly movement = new MovementService();
  private readonly progression = new ProgressionService();
  private readonly walls = new WallService();
  private readonly characters = new CharacterService();
  private readonly upgrades = new UpgradeService();
  private readonly auras = new AuraService();
  private readonly pvp = new PvpService();
  private readonly rebirths = new RebirthService();
  private readonly limiter = new ActionLimiter();

  /** Session id -> the profile key it currently plays on. The boards read it. */
  private readonly playerIds = new Map<string, string>();
  private readonly sessions = new Map<string, Session>();

  /** Players knocked out in the arena, lying in the knockout state, and when the server sends them home. */
  private readonly dying = new Map<string, number>();

  /** Players who just claimed a stage, and when the server sends them home (a new run). */
  private readonly goingHome = new Map<string, number>();

  /** Seconds each player has stood at a usable bag since its last automatic punch. */
  private readonly bagTimers = new Map<string, number>();

  private autosaveTimer = 0;
  private removeStatSource: (() => void) | null = null;

  override onCreate(): void {
    this.state = new GameState();
    this.setPatchRate(serverConfig.patchRateMs);

    this.onMessage(MessageType.Move, (client, message: MoveMessage) => this.onMove(client, message));
    this.onMessage(MessageType.Train, (client) => this.onTrain(client));
    this.onMessage(MessageType.Smash, (client, message: SmashMessage) => this.onSmash(client, message));
    this.onMessage(MessageType.Punch, (client, message: PunchMessage) => this.onPunch(client, message));
    this.onMessage(MessageType.ClaimStage, (client, message: ClaimStageMessage) => this.onClaimStage(client, message));
    this.onMessage(MessageType.EquipCharacter, (client, message: EquipCharacterMessage) => this.onEquip(client, message));
    this.onMessage(MessageType.SetMorph, (client, message: SetMorphMessage) => this.onSetMorph(client, message));
    this.onMessage(MessageType.BuyUpgrade, (client, message: BuyUpgradeMessage) => this.onBuyUpgrade(client, message));
    this.onMessage(MessageType.BuyAura, (client, message: AuraMessage) => this.onBuyAura(client, message));
    this.onMessage(MessageType.EquipAura, (client, message: AuraMessage) => this.onEquipAura(client, message));
    this.onMessage(MessageType.Rebirth, (client) => this.onRebirth(client));
    this.onMessage(MessageType.Emote, (client, message: EmoteMessage) => this.onEmote(client, message));
    this.onMessage(MessageType.Teleport, (client, message: TeleportMessage) => this.onTeleport(client, message));
    this.onMessage(MessageType.RequestRespawn, (client) => {
      if (!this.dying.has(client.sessionId)) this.placeAt(client, SPAWN, 'manual');
    });
    this.onMessage(MessageType.SetIdentity, (client, message: SetIdentityMessage) => this.onSetIdentity(client, message));
    this.onMessage(MessageType.SetAvatar, (client, message: SetAvatarMessage) => this.onSetAvatar(client, message));
    this.onMessage(MessageType.SetAuth, (client, message: SetAuthMessage) => {
      void this.switchAuth(client, message, false);
    });

    // Bloxity profile stats: this room's signed-in players, read from their server state at flush time.
    this.removeStatSource = statRegistry.addSource(() => this.statRows());
    this.setSimulationInterval((deltaMs) => this.tick(deltaMs / 1000), serverConfig.patchRateMs);
    logger.info(SCOPE, `room ${this.roomId} created (capacity ${MAX_PLAYERS_PER_ROOM})`);
  }

  override async onAuth(client: Client, options: JoinOptions = {}): Promise<ResolvedProfile> {
    if (this.clients.length >= MAX_PLAYERS_PER_ROOM) {
      logger.warn(SCOPE, `refused a join: room ${this.roomId} is full (${this.clients.length}/${MAX_PLAYERS_PER_ROOM})`);
      throw new ServerError(JOIN_ERROR.ROOM_FULL, 'room is full');
    }
    const guestKey = readGuestKey(options.playerId);
    const token = readToken(options.token);
    try {
      return await this.resolveProfile(guestKey, token, null);
    } catch (error) {
      logger.error(SCOPE, `refused a join: storage unreachable for ${client.sessionId}:`, error);
      throw new ServerError(JOIN_ERROR.STORAGE_UNAVAILABLE, 'storage unavailable, try again shortly');
    }
  }

  override onJoin(client: Client, options: JoinOptions = {}, auth?: ResolvedProfile): void {
    const resolved: ResolvedProfile = auth ?? {
      key: '',
      guestKey: '',
      accountKey: null,
      username: '',
      token: null,
      tokenHash: '',
      status: 'guest',
      profile: null,
      migrated: false,
    };

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    const now = Date.now();
    this.sessions.set(client.sessionId, {
      key: resolved.key,
      guestKey: resolved.guestKey,
      accountKey: resolved.accountKey,
      token: resolved.token,
      tokenHash: resolved.tokenHash,
      status: resolved.status,
      switching: false,
      queued: null,
      granting: false,
      reverifyAt: now + REVERIFY_FIRST_MS,
      reverifyDelay: REVERIFY_FIRST_MS,
      grantPollAt: now + GRANT_POLL_MS,
      lastNoticeAt: 0,
    });
    if (resolved.key) this.playerIds.set(client.sessionId, resolved.key);

    // Restore BEFORE any service initialises: everything derived is derived from it.
    profileStore.applyTo(player, resolved.profile);
    player.username = resolved.username;
    this.state.players.set(client.sessionId, player);
    this.initialiseServices(client.sessionId, player);

    if (options.avatar) this.writeAvatar(player, options.avatar);
    if (options.identity) {
      const identity = sanitizeIdentity(options.identity);
      if (identity.displayName) {
        player.displayName = identity.displayName;
        player.avatarUrl = identity.avatarUrl;
      }
    }

    this.placeAt(client, SPAWN, 'join');
    this.sendAuthState(client, resolved.status);
    if (resolved.accountKey) void this.applyGrants(client.sessionId);

    logger.info(
      SCOPE,
      `join ${client.sessionId} as ${describe(resolved)} (${resolved.profile ? 'restored' : 'new'}) ` +
        `level=${player.level} energy=${player.energy} wins=${player.wins} character=${player.character} rebirths=${player.rebirths}`,
    );
  }

  override async onLeave(client: Client): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    const key = this.sessions.get(client.sessionId)?.key;
    // Their last figures go out with the next stat report.
    if (player) statRegistry.depart(reportIdentityOf(this.sessions.get(client.sessionId)?.accountKey), statValuesOf(player));

    this.state.players.delete(client.sessionId);
    this.dying.delete(client.sessionId);
    this.goingHome.delete(client.sessionId);
    this.movement.forget(client.sessionId);
    this.forgetServices(client.sessionId);
    this.sessions.delete(client.sessionId);
    this.playerIds.delete(client.sessionId);

    logger.info(SCOPE, `leave ${client.sessionId}`);
    if (player && key) await this.saveBounded(key, player);
  }

  override async onDispose(): Promise<void> {
    for (const [sessionId, player] of this.state.players) {
      statRegistry.depart(reportIdentityOf(this.sessions.get(sessionId)?.accountKey), statValuesOf(player));
    }
    this.removeStatSource?.();
    this.removeStatSource = null;
    const saves: Promise<void>[] = [];
    for (const [sessionId, player] of this.state.players) {
      const key = this.sessions.get(sessionId)?.key;
      if (key) saves.push(this.saveBounded(key, player));
    }
    await Promise.all(saves);
    logger.info(SCOPE, `room ${this.roomId} disposed`);
  }

  // ------------------------------------------------------------- identity

  /**
   * WHOSE PROFILE, and the profile itself, read from storage now.
   *
   * With a token, Bloxity is asked. Verified -> the account key; the
   * account's own profile always wins. If the account has none and this
   * browser's guest has real progress, the guest's progress becomes the
   * account's - insert-only, so two pods racing for the same first login
   * create one profile - and the guest is then retired.
   *
   * Rejected -> a guest. Unavailable -> a guest FOR NOW, re-asked on a backoff.
   * Throws when storage cannot be read. Callers refuse or stay put.
   */
  private async resolveProfile(guestKey: string, token: string | null, live: ProfileFields | null): Promise<ResolvedProfile> {
    let status: AuthStatus = 'guest';
    let accountKey: string | null = null;
    let username = '';
    const hash = token ? tokenHash(token) : '';
    if (token) {
      const outcome = await verifyGameToken(token);
      if (outcome.status === 'verified') {
        accountKey = accountKeyFor(outcome.accountId);
        username = outcome.username;
        status = 'account';
      } else if (outcome.status === 'unavailable') {
        status = 'unavailable';
      }
    }

    if (accountKey) {
      let profile = await profileStore.load(accountKey);
      let migrated = false;
      if (!profile && guestKey) {
        const guest = await profileStore.load(guestKey);
        const retired = Boolean(guest?.migratedTo);
        const source: ProfileFields | null =
          live ??
          (guest
            ? { ...progressOf(guest), displayName: guest.displayName, avatarUrl: guest.avatarUrl, updatedAt: guest.updatedAt }
            : null);
        if (!retired && source && hasProgress(source)) {
          const created = { ...source, updatedAt: Date.now(), migratedFrom: guestKey };
          if (await profileStore.insertIfAbsent(accountKey, created)) {
            // Only AFTER the account holds it is the guest copy retired.
            await profileStore.retireGuest(guestKey, accountKey, progressOf(source), {
              displayName: source.displayName,
              avatarUrl: source.avatarUrl,
            });
            profile = created;
            migrated = true;
            logger.info(SCOPE, `migrated guest ${guestKey} into ${accountKey} (wins=${source.wins})`);
          } else {
            logger.info(SCOPE, `lost the first-login race for ${accountKey}; loading the winner`);
            profile = await profileStore.load(accountKey);
          }
        }
      }
      return { key: accountKey, guestKey, accountKey, username, token, tokenHash: hash, status, profile, migrated };
    }

    const profile = guestKey ? await profileStore.load(guestKey) : null;
    return { key: guestKey, guestKey, accountKey: null, username: '', token, tokenHash: hash, status, profile, migrated: false };
  }

  /**
   * A LOGIN CHANGE ON THE LIVE SESSION: sign-in, sign-out, account switch, or
   * a re-ask about a token Bloxity was unavailable for. Save the profile being
   * left, resolve the new one, apply it exactly as a join does. Only the
   * newest login counts.
   */
  private async switchAuth(client: Client, message: SetAuthMessage, reverify: boolean): Promise<void> {
    const session = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!session || !player) return;

    const token = readToken(message?.token);
    if (session.switching) {
      session.queued = { token };
      return;
    }
    const hash = token ? tokenHash(token) : '';
    if (!reverify && hash === session.tokenHash) return;

    session.switching = true;
    try {
      const leavingKey = session.key;
      const wasGuest = session.accountKey === null;
      const live = profileStore.snapshot(player);

      if (leavingKey) {
        const landed = await withTimeout(profileStore.save(leavingKey, player), SWITCH_SAVE_TIMEOUT_MS);
        if (!landed) {
          logger.warn(SCOPE, `${client.sessionId}: storage did not take the leaving save; staying on ${leavingKey}`);
          this.sendAuthState(client, session.status, 'storage unavailable; staying on the current profile');
          return;
        }
      }

      let target: ResolvedProfile;
      try {
        target = await this.resolveProfile(session.guestKey, token, wasGuest ? live : null);
      } catch (error) {
        logger.warn(SCOPE, `${client.sessionId}: storage unreachable during a login change; staying put:`, error);
        this.sendAuthState(client, session.status, 'storage unavailable; staying on the current profile');
        return;
      }

      session.token = target.token;
      session.tokenHash = target.tokenHash;
      if (target.status === 'unavailable') {
        session.reverifyDelay = Math.min(REVERIFY_MAX_MS, session.reverifyDelay * 2);
        session.reverifyAt = Date.now() + session.reverifyDelay;
      } else {
        session.reverifyDelay = REVERIFY_FIRST_MS;
      }

      player.username = target.username;
      if (target.key === session.key) {
        session.status = target.status;
        this.sendAuthState(client, target.status);
        return;
      }

      // The account being left is reported one last time with what it held.
      statRegistry.depart(reportIdentityOf(session.accountKey), statValuesOf(player));
      profileStore.applyTo(player, target.profile, true);
      session.key = target.key;
      session.accountKey = target.accountKey;
      session.status = target.status;
      if (target.key) this.playerIds.set(client.sessionId, target.key);
      else this.playerIds.delete(client.sessionId);

      this.forgetServices(client.sessionId);
      this.initialiseServices(client.sessionId, player);
      this.placeAt(client, SPAWN, 'join');

      if (target.key) await this.saveBounded(target.key, player);
      this.sendAuthState(client, target.status);
      leaderboardService.rebuild(this.state.leaderboard, this.state.players, this.playerIds);
      logger.info(
        SCOPE,
        `${client.sessionId} switched ${leavingKey || '(none)'} -> ${describe(target)}` +
          `${target.migrated ? ' [migrated]' : ''} level=${player.level} wins=${player.wins}`,
      );
    } finally {
      session.switching = false;
      const queued = session.queued;
      session.queued = null;
      if (queued) void this.switchAuth(client, queued, false);
      else if (session.accountKey) void this.applyGrants(client.sessionId);
    }
  }

  private initialiseServices(sessionId: string, player: PlayerState): void {
    if (!this.movement.has(sessionId)) this.movement.initialise(player);
    this.characters.normalise(player);
    this.walls.resetRun(player);
    this.progression.initialise(player);
  }

  /** Everything but movement, whose simulation state belongs to the connection. */
  private forgetServices(sessionId: string): void {
    this.progression.forget(sessionId);
    this.limiter.forget(sessionId);
    this.bagTimers.delete(sessionId);
  }

  private sendAuthState(client: Client, status: AuthStatus, note?: string): void {
    const message: AuthStateMessage = note ? { status, note } : { status };
    client.send(MessageType.AuthState, message);
  }


  // ---------------------------------------------------------------- input

  private onMove(client: Client, message: MoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    // A knocked-out player lies still: their input still advances the clock, but moves nothing.
    const dead = player.health <= 0;
    if (dead && message) message = { ...message, moveX: 0, moveZ: 0, jump: false };
    this.movement.applyInput(client.sessionId, player, message);
    // Moving ends an emote for everybody (the client also stops it locally at once).
    if (player.emote && player.speed > 1.5) player.emote = '';
  }

  /** A Bloxity emote: cosmetic, so only its shape is checked. Replicated to every client. */
  private onEmote(client: Client, message: EmoteMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0 || !isEmoteId(message?.id)) return;
    player.emote = message.id.toLowerCase();
    player.emoteCount = (player.emoteCount + 1) % 65536;
  }

  /** ONE TRAINING PUNCH: rate limited, then paid by the progression service where the server has the player. */
  private onTrain(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0 || !this.limiter.take(client.sessionId, player.upgrades.punchRate)) return;
    if (player.emote) player.emote = '';
    const result = this.progression.creditPunch(player);
    if (result.lockedTier > 0) {
      const tier = bagTier(result.lockedTier)!;
      this.notifyOnce(client, { kind: 'locked', text: `${tier.name} needs Rebirth ${tier.rebirthsRequired} - training at 1x` });
    }
    const message: TrainedMessage = { gain: result.gain, bag: result.bag, lucky: result.lucky };
    client.send(MessageType.Trained, message);
  }

  /**
   * BAG TRAINING: standing at a bag the player can use punches it for them
   * every `BAG_AUTO_PUNCH_SECONDS`, paid by the same `creditPunch` as a click
   * (where the SERVER has them). Server-timed, so it needs no rate limit and
   * leaves the click bucket alone. Stepping off (or being knocked out, or
   * heading home after a claim) restarts the count.
   */
  private trainAtBag(delta: number, sessionId: string, player: PlayerState): void {
    const placed = player.bag >= 0 ? BAGS[player.bag] : undefined;
    const training =
      placed !== undefined && player.ready && player.health > 0 && !this.goingHome.has(sessionId) &&
      canUseBag(placed.tier, player.rebirths);
    if (!training) {
      this.bagTimers.delete(sessionId);
      return;
    }
    const elapsed = (this.bagTimers.get(sessionId) ?? 0) + delta;
    if (elapsed < BAG_AUTO_PUNCH_SECONDS) {
      this.bagTimers.set(sessionId, elapsed);
      return;
    }
    this.bagTimers.set(sessionId, elapsed - BAG_AUTO_PUNCH_SECONDS);
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (!client) return;
    if (player.emote) player.emote = '';
    const result = this.progression.creditPunch(player);
    const message: TrainedMessage = { gain: result.gain, bag: result.bag, lucky: result.lucky, auto: true };
    client.send(MessageType.Trained, message);
  }

  /** ONE BLOW AT A WALL: rate limited, then validated and resolved by the wall service. */
  private onSmash(client: Client, message: SmashMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0 || !this.limiter.take(client.sessionId, player.upgrades.punchRate)) return;
    const outcome = this.walls.smash(player, Number(message?.wall));
    if (!outcome.ok) return;
    const reply: SmashedMessage = { wall: outcome.wall, damage: outcome.damage, hp: outcome.hp, broken: outcome.broken, boss: outcome.boss };
    client.send(MessageType.Smashed, reply);
    if (outcome.completed > 0) {
      const cleared: StageClearedMessage = { stage: outcome.completed, firstClear: outcome.firstClear };
      client.send(MessageType.StageCleared, cleared);
      this.persist(client.sessionId, player);
      logger.info(SCOPE, `stage ${outcome.completed} completed by ${client.sessionId}${outcome.firstClear ? ' (first time)' : ''}`);
    }
  }

  /** ONE BLOW AT A PLAYER: rate limited, both in the arena, within reach - then damage and knockback. */
  private onPunch(client: Client, message: PunchMessage): void {
    const attacker = this.state.players.get(client.sessionId);
    if (!attacker || attacker.health <= 0 || !this.limiter.take(client.sessionId, attacker.upgrades.punchRate)) return;
    const targetId = typeof message?.target === 'string' ? message.target : '';
    const victim = targetId ? this.state.players.get(targetId) : undefined;
    const outcome = this.pvp.punch(attacker, victim, this.progression);
    if (!outcome.ok || !victim) return;
    this.movement.impulse(targetId, victim, outcome.dirX, outcome.dirZ, PVP.knockback, PVP.knockup);
    const reply: PunchedMessage = { target: targetId, damage: outcome.damage, knockedOut: outcome.knockedOut };
    client.send(MessageType.Punched, reply);
    if (!outcome.knockedOut) return;
    this.dying.set(targetId, Date.now() + PVP.deathSeconds * 1000);
    this.movement.halt(targetId, victim);
    const victimClient = this.clients.find((c) => c.sessionId === targetId);
    const attackerName = attacker.displayName || 'another player';
    const victimName = victim.displayName || 'your opponent';
    if (victimClient) this.notify(victimClient, { kind: 'refused', text: `Knocked out by ${attackerName}! Train more Cursed Energy and come back.` });
    this.notify(client, { kind: 'info', text: `KO! You knocked out ${victimName}!` });
    this.persist(client.sessionId, attacker);
    logger.info(SCOPE, `${client.sessionId} knocked out ${targetId} in the arena`);
  }

  /** Claims whose celebration has played: home to the spawn (a new run). */
  private sendClaimersHome(): void {
    if (this.goingHome.size === 0) return;
    const now = Date.now();
    for (const [sessionId, at] of this.goingHome) {
      if (now < at) continue;
      this.goingHome.delete(sessionId);
      const client = this.clients.find((c) => c.sessionId === sessionId);
      if (client) this.placeAt(client, SPAWN, 'claimed');
    }
  }

  /**
   * Players knocked out in the arena: they lie where they fell at 0 health
   * (no moving or acting, and every client plays the knockout) for
   * `PVP.deathSeconds`, then go home at full health.
   */
  private handleKnockouts(): void {
    if (this.dying.size === 0) return;
    const now = Date.now();
    for (const [sessionId, at] of this.dying) {
      if (now < at) continue;
      this.dying.delete(sessionId);
      const client = this.clients.find((c) => c.sessionId === sessionId);
      const player = this.state.players.get(sessionId);
      if (!client || !player) continue;
      this.progression.heal(player);
      this.placeAt(client, SPAWN, 'defeated');
    }
  }

  private onClaimStage(client: Client, message: ClaimStageMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;
    const earnedBefore = player.lifetimeWins;
    const award = this.walls.claim(player, message?.stage);
    if (!award.granted || !award.stage) return;
    const unlocked = this.characters.upgradeAfterWins(player, earnedBefore, this.progression);
    this.progression.syncDerived(player);
    const payload: StageAwardedMessage = { stage: award.stage.index, wins: award.wins, total: player.wins, unlocked };
    client.send(MessageType.StageAwarded, payload);
    // The Wins are banked and the run is over: after the celebration the server sends
    // the player home, where every wall stands again for the next run.
    this.goingHome.set(client.sessionId, Date.now() + CLAIM_HOME_DELAY_MS);
    this.persist(client.sessionId, player);
    leaderboardService.rebuild(this.state.leaderboard, this.state.players, this.playerIds);
    logger.info(SCOPE, `stage ${award.stage.index} claimed by ${client.sessionId} (+${award.wins}, total ${player.wins})`);
  }

  private onEquip(client: Client, message: EquipCharacterMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const result = this.characters.equip(player, message?.id, this.progression);
    if (!result.ok) {
      if (result.reason === 'locked' && result.character) {
        this.notifyOnce(client, { kind: 'locked', text: `${result.character.name} needs ${formatWins(result.character.winsRequired)} Wins earned` });
      }
      return;
    }
    this.persist(client.sessionId, player);
    this.notify(client, { kind: 'equipped', text: `You are ${result.character.name}: +${formatAmount(result.character.power)} Cursed Energy per punch` });
    logger.info(SCOPE, `${client.sessionId} equipped character ${result.character.id}`);
  }

  /** Wear the character's look or the player's own avatar: cosmetic, the power stays. */
  private onSetMorph(client: Client, message: SetMorphMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !this.characters.setMorph(player, message?.morph)) return;
    this.persist(client.sessionId, player);
  }

  private onBuyUpgrade(client: Client, message: BuyUpgradeMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const result = this.upgrades.buy(player, message?.id, this.progression);
    if (!result.ok) {
      if (result.reason === 'poor' && result.upgrade) {
        this.notifyOnce(client, { kind: 'refused', text: `${result.upgrade.name} costs ${formatWins(result.cost ?? 0)} Wins - you have ${formatWins(player.wins)}` });
      } else if (result.reason === 'maxed' && result.upgrade) {
        this.notifyOnce(client, { kind: 'info', text: `${result.upgrade.name} is maxed out!` });
      }
      return;
    }
    this.persist(client.sessionId, player);
    this.notify(client, { kind: 'bought', text: `${result.upgrade.name} upgraded to level ${formatCount(result.level)}!` });
  }

  private onBuyAura(client: Client, message: AuraMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const result = this.auras.buy(player, message?.id, this.progression);
    if (!result.ok) {
      if (result.reason === 'poor' && result.aura) {
        this.notifyOnce(client, { kind: 'refused', text: `${result.aura.name} costs ${formatWins(result.aura.cost)} Wins - you have ${formatWins(player.wins)}` });
      }
      return;
    }
    this.persist(client.sessionId, player);
    if (result.aura) this.notify(client, { kind: 'bought', text: `${result.aura.name} aura unlocked: ${result.aura.multiplier}x Cursed Energy!` });
    logger.info(SCOPE, `${client.sessionId} bought aura ${result.aura?.id ?? 0}`);
  }

  private onEquipAura(client: Client, message: AuraMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const result = this.auras.equip(player, message?.id, this.progression);
    if (!result.ok) return;
    this.persist(client.sessionId, player);
    this.notify(client, { kind: 'equipped', text: result.aura ? `Equipped ${result.aura.name}: ${result.aura.multiplier}x Cursed Energy` : 'Aura removed' });
  }

  private onRebirth(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const result = this.rebirths.rebirth(player, this.progression);
    if (!result.ok) return;
    this.afterRebirth(client, player, result.rebirths);
  }

  /** A rebirth landed: home to the spawn, saved, announced. */
  private afterRebirth(client: Client, player: PlayerState, rebirths: number): void {
    // Back at the spawn: a new run, every wall standing again.
    this.placeAt(client, SPAWN, 'rebirth');
    this.persist(client.sessionId, player);
    this.notify(client, { kind: 'rebirth', text: `Rebirth ${formatCount(rebirths)}! Every punch now pays ${rebirthMultiplier(rebirths)}x Cursed Energy` });
    leaderboardService.rebuild(this.state.leaderboard, this.state.players, this.playerIds);
    logger.info(SCOPE, `${client.sessionId} rebirthed to ${rebirths}`);
  }

  /**
   * A teleport is to a NAMED place the server knows, or to a stage this player
   * has reached before (up to one past their best completed stage). A stage
   * teleport starts a new run there: the stages before it count as broken
   * and claimed, so it can never pay a stage twice.
   */
  private onTeleport(client: Client, message: TeleportMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;
    const to = String(message?.to ?? '');
    const match = /^stage(\d{1,3})$/.exec(to);
    if (match) {
      const stage = Number(match[1]);
      if (stage < 1 || stage > STAGE_COUNT) return;
      if (stage > player.bestStage + 1) {
        this.notify(client, { kind: 'locked', text: `Complete Stage ${stage - 1} to unlock Stage ${stage}` });
        return;
      }
      this.placeAt(client, stageEntry(stage), 'teleport');
      this.walls.startRunAt(player, stage);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(TELEPORTS, to)) this.placeAt(client, TELEPORTS[to as keyof typeof TELEPORTS], 'teleport');
  }

  private onSetAvatar(client: Client, message: SetAvatarMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.writeAvatar(player, message);
  }

  private onSetIdentity(client: Client, message: SetIdentityMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const identity = sanitizeIdentity(message);
    if (player.displayName === identity.displayName && player.avatarUrl === identity.avatarUrl) return;
    player.displayName = identity.displayName;
    player.avatarUrl = identity.avatarUrl;
    this.persist(client.sessionId, player);
    leaderboardService.rebuild(this.state.leaderboard, this.state.players, this.playerIds);
  }

  private writeAvatar(player: PlayerState, message: SetAvatarMessage): void {
    player.avatar.apply(sanitizeAppearance(message?.appearance), sanitizeProportions(message?.proportions));
  }

  private notify(client: Client, notice: NoticeMessage): void {
    client.send(MessageType.Notice, notice);
  }

  /** A notice that may be triggered every click: at most one per NOTICE_GAP_MS. */
  private notifyOnce(client: Client, notice: NoticeMessage): void {
    const session = this.sessions.get(client.sessionId);
    const now = Date.now();
    if (session) {
      if (now - session.lastNoticeAt < NOTICE_GAP_MS) return;
      session.lastNoticeAt = now;
    }
    this.notify(client, notice);
  }

  /** Bloxity stat rows for every signed-in player here (guests have no Bloxity identity). */
  private *statRows(): Iterable<StatRow> {
    for (const [sessionId, player] of this.state.players) {
      const session = this.sessions.get(sessionId);
      if (!session || session.switching) continue;
      const userId = reportIdentityOf(session.accountKey);
      if (userId) yield { userId, values: statValuesOf(player) };
    }
  }

  // ----------------------------------------------------------------- clock

  private tick(delta: number): void {
    this.state.elapsed += delta;
    leaderboardService.update(delta, this.state.leaderboard, this.state.players, this.playerIds);
    this.tickSessions();
    this.handleKnockouts();
    this.sendClaimersHome();

    for (const [sessionId, player] of this.state.players) {
      if (player.ready) player.playSeconds += delta;
      this.progression.tick(delta, player);
      this.trainAtBag(delta, sessionId, player);
      // The arena's gate is shared collision, so nobody below its rebirths can be in
      // there; should anyone ever be (a stale save, a bug), they are sent home.
      if (player.inPvp && !canEnterPvp(player.rebirths) && inPvpZone(player.x, player.z)) {
        const client = this.clients.find((c) => c.sessionId === sessionId);
        if (client) this.placeAt(client, SPAWN, 'manual');
      }
    }

    this.autosaveTimer += delta;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      for (const [sessionId, player] of this.state.players) this.persist(sessionId, player);
    }
  }

  /** Re-asks about tokens Bloxity was unavailable for, and polls for purchases. */
  private tickSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (session.switching) continue;
      if (session.status === 'unavailable' && session.token && now >= session.reverifyAt) {
        session.reverifyAt = now + session.reverifyDelay;
        const client = this.clients.find((c) => c.sessionId === sessionId);
        if (client) void this.switchAuth(client, { token: session.token }, true);
      }
      if (session.accountKey && now >= session.grantPollAt) {
        session.grantPollAt = now + GRANT_POLL_MS;
        void this.applyGrants(sessionId);
      }
    }
  }

  // ---------------------------------------------------------------- grants

  /**
   * Pay out what the webhook recorded for this account: CLAIM (atomic per
   * grant, so no other pod pays the same one), add the Wins, SAVE the profile,
   * and only then mark the grants applied.
   */
  private async applyGrants(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (!session || !player || !session.accountKey || session.switching || session.granting) return;
    const accountKey = session.accountKey;
    session.granting = true;
    try {
      const grants = await buxGrants.claim(accountKey);
      if (grants.length === 0) return;
      if (this.sessions.get(sessionId) !== session || session.accountKey !== accountKey || session.switching) {
        logger.warn(SCOPE, `left ${grants.length} claimed grant(s) for ${accountKey} to a later session`);
        return;
      }
      for (const grant of grants) {
        if (grant.wins > 0) {
          const earnedBefore = player.lifetimeWins;
          wallet.add(player, grant.wins);
          this.characters.upgradeAfterWins(player, earnedBefore, this.progression);
        }
        logger.info(SCOPE, `granted ${grant.sku} to ${sessionId} (+${grant.wins} wins) [${grant.transactionId}]`);
      }
      this.progression.syncDerived(player);
      await profileStore.save(accountKey, player);
      await buxGrants.settle(grants.map((grant) => grant.transactionId));
      leaderboardService.rebuild(this.state.leaderboard, this.state.players, this.playerIds);
    } catch (error) {
      logger.warn(SCOPE, `could not pay grants for ${accountKey}: ${String(error)}`);
    } finally {
      session.granting = false;
    }
  }

  // ------------------------------------------------------------- placement

  /** THE one way a player is placed. */
  private placeAt(client: Client, placement: Placement, reason: RespawnReason): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.dying.delete(client.sessionId);
    this.goingHome.delete(client.sessionId);
    this.movement.teleport(client.sessionId, player, placement.x, placement.y, placement.z, placement.yaw);
    player.emote = '';
    // Back at the spawn, for whatever reason: the run is over and a new one begins -
    // every wall standing again, every stage's claim open again.
    if (placement.x === SPAWN.x && placement.z === SPAWN.z) this.walls.resetRun(player);
    this.progression.syncDerived(player);
    const message: RespawnMessage = { x: placement.x, y: placement.y, z: placement.z, rotationY: placement.yaw, reason };
    client.send(MessageType.Respawn, message);
    if (reason !== 'join') logger.info(SCOPE, `place ${client.sessionId} (${reason}) -> ${placement.x}, ${placement.z}`);
  }

  // ----------------------------------------------------------------- saves

  /** A routine save. Held while the session is changing login. */
  private persist(sessionId: string, player: PlayerState): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.key || session.switching) return;
    void this.saveQuietly(session.key, player);
  }

  private async saveQuietly(key: string, player: PlayerState): Promise<void> {
    try {
      await profileStore.save(key, player);
    } catch (error) {
      logger.error(SCOPE, `save of ${key} failed:`, error);
    }
  }

  /** A save that is waited for only so long; it stays queued and retried regardless. */
  private async saveBounded(key: string, player: PlayerState): Promise<void> {
    const landed = await withTimeout(this.saveQuietly(key, player), LEAVE_SAVE_TIMEOUT_MS);
    if (!landed) logger.warn(SCOPE, `save of ${key} is queued; it lands when storage is back`);
  }
}

/** A guest key from a join option: valid, or empty when none was sent. Refuses the account prefix. */
const readGuestKey = (raw: unknown): string => {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw === 'string' && isAccountKey(raw)) {
    logger.warn(SCOPE, `refused a join: browser id carries the account prefix`);
    throw new ServerError(JOIN_ERROR.BAD_PLAYER_ID, 'invalid player id');
  }
  if (!isValidGuestId(raw)) {
    logger.warn(SCOPE, `refused a join: malformed browser id`);
    throw new ServerError(JOIN_ERROR.BAD_PLAYER_ID, 'invalid player id');
  }
  return raw;
};

const readToken = (raw: unknown): string | null =>
  typeof raw === 'string' && raw.length > 0 && raw.length <= MAX_TOKEN_LENGTH ? raw : null;

const describe = (resolved: ResolvedProfile): string => {
  if (resolved.accountKey) return `account ${resolved.accountKey}`;
  const key = resolved.guestKey || '(no id)';
  return resolved.status === 'unavailable' ? `guest ${key} (bloxity unavailable, will re-ask)` : `guest ${key}`;
};

/** True if the promise settled within the deadline; it keeps running either way. */
const withTimeout = (promise: Promise<unknown>, ms: number): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
