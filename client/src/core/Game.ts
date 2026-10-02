import {
  ACTION,
  AURAS,
  BAGS,
  BAG_TIERS,
  CHARACTERS,
  CHARACTER_PADS,
  CHARACTER_STAND,
  CLAIM_PAD_HALF,
  CORRIDOR,
  CORRIDOR_END_Z,
  HUB,
  PORTAL,
  PVP,
  PVP_ARENA,
  PVP_GATE,
  SPAWN,
  STAGES,
  STAGE_COUNT,
  UPGRADES,
  WALLS,
  WALL_THICKNESS,
  WorldCollision,
  actionInterval,
  auraById,
  bestUnlockedCharacter,
  boothAt,
  canEnterPvp,
  canUseBag,
  characterById,
  characterUnlocked,
  formatAmount,
  formatCount,
  formatWins,
  inPvpZone,
  isClaimed,
  isEmoteId,
  levelCap,
  levelOf,
  ownsAura,
  pvpStrength,
  stageAt,
  stageByIndex,
  stageComplete,
  upgradeCost,
  type BoothKind,
  type NoticeMessage,
  type PunchedMessage,
  type RespawnMessage,
  type SmashedMessage,
  type StageAwardedMessage,
  type StageClearedMessage,
  type TrainedMessage,
  type UpgradeId,
} from '@jjk/shared';
import { Vector3 } from 'three';
import { loadEmotes } from '../animation/Emotes.js';
import { AudioManager } from '../audio/AudioManager.js';
import { PlayerAudio } from '../audio/PlayerAudio.js';
import { Bloxity } from '../bloxity/Bloxity.js';
import { lookFromLegion } from '../bloxity/avatarLook.js';
import { identityFromLegion } from '../bloxity/identity.js';
import { ThirdPersonCamera, type CameraRoom } from '../camera/ThirdPersonCamera.js';
import { AuraFx } from '../characters/AuraFx.js';
import { ClaimCelebration } from '../combat/ClaimCelebration.js';
import { DamagePopups } from '../combat/DamagePopups.js';
import { PunchEffects } from '../combat/PunchEffects.js';
import { impactSeconds } from '../config/animationConfig.js';
import { clientConfig } from '../config/clientConfig.js';
import { InputManager } from '../input/InputManager.js';
import { NetworkClient } from '../net/NetworkClient.js';
import type { ConnectionStatus, NetPlayerState } from '../net/netTypes.js';
import { LocalPlayer } from '../player/LocalPlayer.js';
import { lookOf } from '../player/look.js';
import { playerModelLoader, type PlayerModelReport } from '../player/PlayerModelLoader.js';
import { RemotePlayerManager } from '../player/RemotePlayerManager.js';
import { RendererManager } from '../rendering/RendererManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { BloxityPanel } from '../ui/BloxityPanel.js';
import { Hud, HudButton } from '../ui/Hud.js';
import { ICON } from '../ui/icons.js';
import { ModelPortraits } from '../ui/ModelPortraits.js';
import { anyPanelOpen } from '../ui/Panel.js';
import { AurasWindow, BoardsWindow, CharactersWindow, RebirthWindow, UpgradesWindow, WorldsWindow, anyWindowOpen } from '../ui/Windows.js';
import { logger } from '../util/logger.js';
import { Atmosphere } from '../world/Atmosphere.js';
import { bagVisuals, tierCss } from '../world/Bags.js';
import { HubWorld } from '../world/HubWorld.js';
import { StageWorld } from '../world/StageWorld.js';

const SCOPE = 'Game';
/** A player first seen within this long of our own join was already in the room (`playerInRoom`), not joining it. */
const ROOM_SETTLE_MS = 1500;
const AUTO_CLICK_KEY = 'jjkevolution.autoClick';

const shortcutOf = (event: KeyboardEvent): string => {
  const code = event.code;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3).toLowerCase();
  if (code) return code.toLowerCase();
  return (event.key || '').toLowerCase();
};

const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

const readAutoClick = (): boolean => {
  try {
    return window.localStorage.getItem(AUTO_CLICK_KEY) === '1';
  } catch {
    return false;
  }
};

const FIST = new Vector3();
const SCREEN = new Vector3();
const POINT = new Vector3();

/** An action started but not yet at its impact frame. */
interface PendingImpact {
  at: number;
  readonly kind: 'train' | 'wall' | 'boss' | 'player';
  readonly point: Vector3;
  readonly from: Vector3;
  readonly local: boolean;
  readonly bag: number;
  readonly energy: number;
}

/** What a click does where the player stands. */
type Action =
  | { kind: 'smash'; wall: number }
  | { kind: 'punch'; target: string; x: number; y: number; z: number }
  | { kind: 'train' };

type WindowName = 'rebirth' | 'upgrades' | 'auras' | 'characters' | 'worlds' | 'boards';

/**
 * Composition root. Owns every subsystem and the per-frame order - input,
 * prediction, actions, pads, camera, network, render - and no gameplay rules:
 * every point of Cursed Energy, every Win, every wall's health and every blow
 * is the server's.
 */
export class Game {
  private readonly renderer: RendererManager;
  private readonly sceneManager = new SceneManager();
  private readonly atmosphere: Atmosphere;
  private readonly camera = new ThirdPersonCamera();
  private readonly input = new InputManager();
  private readonly collision = new WorldCollision();
  private readonly remotePlayers: RemotePlayerManager;
  /** Built once the player model has loaded: its pedestals and statues wear it. */
  private hub!: HubWorld;
  private readonly stages: StageWorld;
  private readonly punches: PunchEffects;
  private readonly impacts: PendingImpact[] = [];
  private clock = 0;
  private readonly celebration: ClaimCelebration;
  private readonly damage: DamagePopups;
  private readonly hud: Hud;
  private readonly portraits: ModelPortraits;
  private readonly rebirthWindow: RebirthWindow;
  private readonly upgradesWindow: UpgradesWindow;
  private readonly aurasWindow: AurasWindow;
  private readonly charactersWindow: CharactersWindow;
  private readonly worldsWindow: WorldsWindow;
  private readonly boardsWindow: BoardsWindow;
  private readonly rebirthButton: HudButton;
  private readonly upgradesButton: HudButton;
  private readonly charactersButton: HudButton;
  private readonly worldsButton: HudButton;
  private readonly aurasButton: HudButton;
  private readonly boardsButton: HudButton;
  private readonly musicButton: HudButton;
  private readonly audio = new AudioManager();
  private readonly playerAudio: PlayerAudio;
  private readonly bloxity: Bloxity;
  /** Remote players already announced to the portal (by session), and when our own join settled. */
  private readonly announced = new Set<string>();
  private joinedAt = Number.POSITIVE_INFINITY;
  private readonly bloxityPanel: BloxityPanel;
  private readonly fpsReadout: HTMLDivElement;
  private readonly network: NetworkClient;
  private readonly container: HTMLElement;

  private fpsAccum = 0;
  private fpsFrames = 0;
  private localPlayer: LocalPlayer | null = null;
  private localSessionId: string | null = null;
  private local: NetPlayerState | null = null;
  private pendingRespawn: RespawnMessage | null = null;

  private autoClick = readAutoClick();
  private sinceAction = 99;
  private lastLevel = -1;
  private lastRebirths = -1;
  private lastHurt = -1;
  private lastBest = -1;
  /** Which side of the head the next "+N" rises from. */
  private popSide = 0;
  /** The pad the player last stood on, so each pad fires once per visit. */
  private onPad = '';
  private claimCooldown = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new RendererManager(container);
    this.atmosphere = new Atmosphere(this.sceneManager);
    this.remotePlayers = new RemotePlayerManager(this.sceneManager.scene);
    this.stages = new StageWorld(this.sceneManager.scene);
    this.punches = new PunchEffects(this.sceneManager.scene);
    this.celebration = new ClaimCelebration(this.sceneManager.scene);
    this.damage = new DamagePopups(container);
    this.hud = new Hud(container, () => this.toggleAutoClick());
    this.hud.setAutoClick(this.autoClick);
    this.portraits = new ModelPortraits(this.renderer.renderer);
    this.camera.room = (x, _y, z) => this.cameraRoom(x, z);

    this.rebirthWindow = new RebirthWindow(container, () => this.network.requestRebirth());
    this.upgradesWindow = new UpgradesWindow(container, (id) => this.network.buyUpgrade(id));
    this.aurasWindow = new AurasWindow(container, (id) => this.network.buyAura(id), (id) => this.network.equipAura(id));
    this.charactersWindow = new CharactersWindow(container, this.portraits, (id) => this.network.equipCharacter(id), (morph) => this.network.setMorph(morph));
    this.worldsWindow = new WorldsWindow(container, (to) => this.network.teleport(to));
    this.boardsWindow = new BoardsWindow(container);

    const grid = this.hud.grid;
    this.rebirthButton = new HudButton(grid, 'Rebirth', ICON.rebirth, 'R', 'rebirth', () => this.openOnly('rebirth'));
    this.upgradesButton = new HudButton(grid, 'Upgrades', ICON.upgrades, 'U', 'upgrades', () => this.openOnly('upgrades'));
    this.charactersButton = new HudButton(grid, 'Sorcerers', ICON.characters, 'B', 'characters', () => this.openOnly('characters'));
    this.worldsButton = new HudButton(grid, 'Worlds', ICON.worlds, 'T', 'worlds', () => this.openOnly('worlds'));
    this.aurasButton = new HudButton(grid, 'Auras', ICON.auras, 'Y', 'auras', () => this.openOnly('auras'));
    this.musicButton = new HudButton(this.hud.corner, 'Music', ICON.sound, 'M', 'music', () => {
      this.musicButton.setOff(this.audio.toggleMuted());
    });
    this.boardsButton = new HudButton(this.hud.corner, 'Boards', ICON.boards, 'L', 'boards', () => this.openOnly('boards'));
    new HudButton(this.hud.corner, 'Invite', ICON.invite, null, 'invite', () => {
      this.closeAll();
      void this.bloxityPanel.openFriends();
    });

    this.playerAudio = new PlayerAudio(this.audio);

    this.bloxity = new Bloxity({
      setMasterVolume: (level) => this.audio.setMasterVolume(level),
      setMusicVolume: (level) => this.audio.setMusicVolume(level),
      setGraphicsQuality: (level) => this.renderer.setQuality(level),
      setShowFps: (show) => {
        this.fpsReadout.hidden = !show;
      },
      setCameraSensitivity: (scale) => this.input.look.setSensitivityScale(scale),
      respawn: () => this.network.requestRespawn(),
      pointerLockChanged: (locked) => this.input.look.setCursorFree(!locked),
      // Everybody starts as their own avatar: a changed avatar re-dresses their body for everyone.
      avatarChanged: (equipped, proportions) => this.network.sendAvatar(lookFromLegion(equipped, proportions)),
      playEmote: (id) => this.playEmote(id),
    });
    // The emote catalogue, once, at startup (the clips arrive long before anyone picks one).
    void loadEmotes();

    this.fpsReadout = document.createElement('div');
    this.fpsReadout.className = 'aoe-fps aoe-font';
    this.fpsReadout.hidden = true;
    container.appendChild(this.fpsReadout);

    this.bloxityPanel = new BloxityPanel(container, this.bloxity);

    window.addEventListener('keydown', this.onHotkey);
    window.addEventListener('keydown', this.onGesture);
    window.addEventListener('mousedown', this.onGesture);
    window.addEventListener('touchstart', this.onGesture, { passive: true });

    this.renderer.onResize((width, height) => this.camera.setViewport(width, height));

    this.network = new NetworkClient({
      onStatusChange: (status) => this.onStatusChange(status),
      onSelfJoined: (sessionId) => {
        if (this.localSessionId && this.localSessionId !== sessionId) this.hud.toast('Reconnected!', 'good');
        this.localSessionId = sessionId;
        const roomId = this.network.roomId;
        this.bloxity.updateRoom(roomId);
        this.bloxityPanel.setRoom(roomId);
      },
      onPlayerAdded: (sessionId, player) => this.onPlayerAdded(sessionId, player),
      onPlayerChanged: (sessionId, player) => this.onPlayerChanged(sessionId, player),
      onPlayerRemoved: (sessionId) => {
        this.remotePlayers.remove(sessionId);
        this.announced.delete(sessionId);
      },
      onRespawn: (message) => {
        this.pendingRespawn = message;
        this.applyPendingRespawn();
      },
      onStageAwarded: (message) => this.onStageAwarded(message),
      onStageCleared: (message) => this.onStageCleared(message),
      onTrained: (message) => this.onTrained(message),
      onSmashed: (message) => this.onSmashed(message),
      onPunched: (message) => this.onPunched(message),
      onNotice: (message) => this.onNotice(message),
      onConnectionLost: () => {
        // The room is gone: so is everyone in it. The rejoin brings back whoever is there.
        this.remotePlayers.clear();
        this.hud.toast('Connection lost - reconnecting...', 'bad');
      },
    });

    this.network.setTokenProvider(() => this.bloxity.getToken());
    this.network.setLookProvider(() => lookFromLegion(this.bloxity.getEquipped(), this.bloxity.getProportions()));
    this.network.setDisplayProvider(() => identityFromLegion(this.bloxity.getUser(), this.bloxity.getGuest()));
    this.bloxity.onUserChanged((user) => {
      this.network.sendAuth(this.bloxity.getToken());
      this.network.sendIdentity(identityFromLegion(user, this.bloxity.getGuest()));
    });
  }

  private readonly onHotkey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.repeat) return;
    if (isTyping(event.target)) return;
    switch (shortcutOf(event)) {
      case 'r':
        this.rebirthButton.press();
        break;
      case 'u':
        this.upgradesButton.press();
        break;
      case 'b':
        this.charactersButton.press();
        break;
      case 't':
        this.worldsButton.press();
        break;
      case 'y':
        this.aurasButton.press();
        break;
      case 'l':
        this.boardsButton.press();
        break;
      case 'c':
        this.toggleAutoClick();
        break;
      case 'm':
        this.musicButton.press();
        break;
      case 'escape':
        this.closeAll();
        this.input.look.setCursorFree(true);
        this.bloxity.showPortalMenu(true);
        break;
      default:
        break;
    }
  };

  private readonly onGesture = (): void => {
    this.audio.resume();
  };

  private toggleAutoClick(): void {
    this.autoClick = !this.autoClick;
    this.hud.setAutoClick(this.autoClick);
    this.hud.toast(this.autoClick ? 'OP Auto Clicker ON - punching for you!' : 'OP Auto Clicker OFF', 'gold');
    try {
      window.localStorage.setItem(AUTO_CLICK_KEY, this.autoClick ? '1' : '0');
    } catch {
      /* private mode: the toggle still works for this session */
    }
  }

  private windows(): Record<WindowName, { setOpen(open: boolean): void; readonly isOpen: boolean; dispose(): void }> {
    return {
      rebirth: this.rebirthWindow,
      upgrades: this.upgradesWindow,
      auras: this.aurasWindow,
      characters: this.charactersWindow,
      worlds: this.worldsWindow,
      boards: this.boardsWindow,
    };
  }

  private closeAll(): void {
    for (const window of Object.values(this.windows())) window.setOpen(false);
  }

  private openOnly(which: WindowName): void {
    const target = this.windows()[which];
    const wasOpen = target.isOpen;
    this.closeAll();
    if (wasOpen) return;
    if (this.local) this.refreshWindows(this.local);
    target.setOpen(true);
    if (which === 'boards') this.boardsWindow.setBoard(this.network.leaderboard);
  }

  /**
   * A Bloxity emote, chosen in the portal's picker: played on the local body at
   * once and sent to the server, which replicates it to everyone. An unknown id
   * (or a catalogue that has not loaded) is ignored; never throws.
   */
  private playEmote(id: string): void {
    try {
      if (!isEmoteId(id) || !this.local) return;
      const character = this.localPlayer?.character;
      if (!character) return;
      const start = (): void => {
        if (character.playEmote(id.toLowerCase())) this.network.emote(id.toLowerCase());
      };
      void loadEmotes().then(start);
    } catch (error) {
      logger.warn(SCOPE, `emote ${id} failed: ${String(error)}`);
    }
  }

  startBloxity(): void {
    this.bloxity.start();
    document.body.classList.toggle('aoe-portal-embedded', this.bloxity.embedded);
  }

  loadingStep(text: string): void {
    this.bloxity.loadingStep(text);
  }

  async initialise(): Promise<PlayerModelReport> {
    const scene = this.sceneManager.scene;
    const report = await playerModelLoader.load();
    this.hub = new HubWorld();
    scene.add(this.hub.root, this.stages.root);

    this.localPlayer = new LocalPlayer(this.collision);
    scene.add(this.localPlayer.character.root);
    this.camera.snapTo(this.localPlayer.position);

    logger.info(SCOPE, 'world ready');
    return report;
  }

  async connect(): Promise<void> {
    await this.network.connect();
    this.joinedAt = performance.now();
  }

  start(): void {
    this.input.attach(this.renderer.renderer.domElement);
    this.bloxity.loadingEnd();
    this.bloxity.gameplayStart();
  }

  stop(): void {
    this.input.detach();
    this.bloxity.gameplayEnd();
    this.bloxity.updateRoom('');
    void this.network.disconnect();
  }

  // ---------------------------------------------------------------- frame

  update(delta: number, _now: number): void {
    // Windows own the screen; a claim celebration (then the trip home) or the knockout holds the player still.
    const dead = this.localPlayer?.character.dead ?? false;
    this.input.setSuppressed(anyWindowOpen() || anyPanelOpen() || dead || this.celebration.playing);
    const input = this.input.sample();
    const player = this.localPlayer;

    this.camera.setOrbit(this.input.look.yaw, this.input.look.pitch);
    this.camera.setZoom(this.input.look.zoom);

    if (player) {
      if (this.local) player.setParams(this.local.moveSpeed, this.local.jumpVelocity, this.local.wallsBroken, canEnterPvp(this.local.rebirths));
      player.update(delta, input, this.input.look.yaw);
      this.camera.setSubjectHeight(player.character.height);
      this.snapCameraIfPlaced();
      this.camera.setTarget(player.position);
      this.sceneManager.followShadow(player.position.x, player.position.y, player.position.z);
      this.flushInput();
      if (!dead) {
        this.updateActions(delta, input.attack || input.attackHeld, player);
        this.updatePads(delta, player);
      }
      this.playerAudio.update(delta, {
        horizontalSpeed: player.horizontalSpeed,
        isGrounded: player.isGrounded,
        jumpedEdge: player.jumpedEdge,
        landedEdge: player.landedEdge,
      });
      this.updateHud(player);
      if (this.input.touchActive && !dead) {
        const next = this.chooseAction(player).kind;
        this.input.setActionLabel(next === 'smash' ? 'SMASH' : next === 'punch' ? 'STRIKE' : 'PUNCH');
      }
    }

    this.tickFps(delta);
    this.hub.scoreboard.update(this.network.leaderboard);
    if (this.boardsWindow.isOpen) this.boardsWindow.setBoard(this.network.leaderboard);
    const pz = player?.position.z ?? SPAWN.z;
    this.atmosphere.update(delta, pz, this.camera.camera.position);
    this.hub.update(delta, this.camera.camera.position);
    this.stages.update(delta, pz, this.camera.camera.position);
    this.remotePlayers.advance(delta, player?.position ?? null);
    this.collectRemoteActions();
    this.clock += delta;
    this.landImpacts();
    this.punches.update(delta);
    this.celebration.update(delta);
    this.camera.update(delta, player?.horizontalSpeed ?? 0);
    this.damage.update(this.camera.camera, this.renderer.width, this.renderer.height);

    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);
  }

  /** The room the camera must stay inside: the corridor up to the next standing wall, the hall, or the arena. */
  private cameraRoom(x: number, z: number): CameraRoom {
    const margin = 0.45;
    if (z > HUB.maxZ) {
      const wall = this.local ? WALLS[this.local.wallsBroken] : WALLS[0];
      const face = wall ? wall.z - WALL_THICKNESS / 2 : CORRIDOR_END_Z;
      const maxZ = wall && face > z ? face - 0.35 : CORRIDOR_END_Z - margin;
      const nearPortal = z < HUB.maxZ + 14;
      return {
        minX: -CORRIDOR.halfWidth + margin,
        maxX: CORRIDOR.halfWidth - margin,
        minY: 0.3,
        maxY: (nearPortal ? PORTAL.height : CORRIDOR.height) - margin,
        minZ: HUB.minZ + margin,
        maxZ,
      };
    }
    if (z < HUB.minZ) {
      const nearGate = z > PVP_ARENA.minZ + 40;
      return {
        minX: PVP_ARENA.minX + margin,
        maxX: PVP_ARENA.maxX - margin,
        minY: 0.3,
        maxY: (nearGate ? PVP_GATE.height : PVP_ARENA.height) - margin,
        minZ: PVP_ARENA.minZ + margin,
        maxZ: HUB.maxZ - margin,
      };
    }
    return {
      minX: HUB.minX + margin,
      maxX: HUB.maxX - margin,
      minY: 0.3,
      maxY: HUB.height - 1.5,
      minZ: Math.abs(x) < PVP_GATE.halfWidth - 1 ? PVP_ARENA.minZ + margin : HUB.minZ + margin,
      maxZ: Math.abs(x) < PORTAL.halfWidth - 1 ? CORRIDOR_END_Z : HUB.maxZ - margin,
    };
  }

  // -------------------------------------------------------------- actions

  /** What a click does here: smash the next wall in reach, strike an opponent in the arena, or train. */
  private chooseAction(player: LocalPlayer): Action {
    const state = this.local;
    const p = player.position;
    if (!state) return { kind: 'train' };
    const wall = WALLS[state.wallsBroken];
    if (wall && Math.abs(p.x) < CORRIDOR.halfWidth && p.y < 4) {
      const face = wall.z - WALL_THICKNESS / 2;
      if (p.z <= face + 0.3 && p.z >= face - ACTION.wallReach) return { kind: 'smash', wall: wall.id };
    }
    if (canEnterPvp(state.rebirths) && inPvpZone(p.x, p.z)) {
      let best: Action | null = null;
      let bestDistance: number = PVP.reach;
      for (const [id, other] of this.network.players ?? []) {
        if (id === this.localSessionId || other.health <= 0 || !inPvpZone(other.x, other.z)) continue;
        const d = Math.hypot(other.x - p.x, other.z - p.z);
        if (d <= bestDistance && Math.abs(other.y - p.y) < PVP.verticalReach) {
          best = { kind: 'punch', target: id, x: other.x, y: other.y + 2, z: other.z };
          bestDistance = d;
        }
      }
      if (best) return best;
    }
    return { kind: 'train' };
  }

  /** The colour of the local player's cursed energy: their aura's, else their character's. */
  private energyColor(state: NetPlayerState | null = this.local): number {
    if (!state) return 0x9a7aff;
    if (state.aura > 0) return AuraFx.colorOf(state.aura);
    return characterById(state.character)?.energy ?? 0x9a7aff;
  }

  /**
   * ACTIONS. A click (or the PUNCH button, or holding either) is one punch
   * every `actionInterval` (the Punch Rate upgrade quickens it); the OP AUTO
   * CLICKER performs the very same action on its own. It plays at once for
   * feel and lands on the animation's impact frame; the server rate-limits it,
   * validates it and pays.
   */
  private updateActions(delta: number, wanted: boolean, player: LocalPlayer): void {
    this.sinceAction += delta;
    const state = this.local;
    const auto = this.autoClick && !!state && state.health > 0;
    if (!wanted && !auto) return;
    if (this.sinceAction < actionInterval(state?.upgrades.punchRate ?? 0) || anyWindowOpen()) return;
    this.sinceAction = 0;

    const action = this.chooseAction(player);
    const p = player.position;
    const energy = this.energyColor();
    if (action.kind === 'train') {
      player.train();
      const bag = player.onBag;
      const placement = bag >= 0 ? BAGS[bag] : undefined;
      const point = placement ? new Vector3(placement.x, placement.floor + 3.4, placement.z) : p.clone().add(new Vector3(Math.sin(player.yaw) * 1.4, 2.3, Math.cos(player.yaw) * 1.4));
      this.impacts.push({ at: this.clock + impactSeconds('train'), kind: 'train', point, from: p.clone(), local: true, bag, energy });
      this.network.train();
      return;
    }
    if (action.kind === 'smash') {
      const wall = WALLS[action.wall]!;
      player.punch(0);
      this.audio.play('whoosh', 0.8, 0.06);
      const point = new Vector3(Math.max(-CORRIDOR.halfWidth + 1, Math.min(CORRIDOR.halfWidth - 1, p.x)), p.y + 2.3, wall.z - WALL_THICKNESS / 2);
      this.impacts.push({ at: this.clock + impactSeconds('punch'), kind: wall.boss ? 'boss' : 'wall', point, from: p.clone(), local: true, bag: -1, energy });
      this.network.smash(action.wall);
      this.localPlayer?.character.pulseAura(0.8);
      return;
    }
    const yaw = Math.atan2(action.x - p.x, action.z - p.z);
    player.punch(yaw);
    this.audio.play('whoosh', 1, 0.06);
    this.impacts.push({ at: this.clock + impactSeconds('punch'), kind: 'player', point: new Vector3(action.x, action.y, action.z), from: p.clone(), local: true, bag: -1, energy });
    this.network.punch(action.target);
    this.localPlayer?.character.pulseAura(1);
  }

  /** Other players' actions: each blow they land plays for everybody, in their own energy's colour. */
  private collectRemoteActions(): void {
    this.remotePlayers.forEachVisible((remote, sessionId) => {
      if (!remote.attacked) return;
      remote.attacked = false;
      const at = remote.punchedAt;
      const from = remote.character.root.position.clone();
      const kind = remote.attackKind === 2 ? 'player' : remote.attackKind === 3 ? 'boss' : 'wall';
      const state = this.network.players?.get(sessionId) ?? null;
      this.impacts.push({ at: this.clock + impactSeconds('punch'), kind, point: new Vector3(at.x, at.y, at.z), from, local: false, bag: -1, energy: this.energyColor(state) });
    });
  }

  /** Actions reaching their impact frame: the thump of the bag, the flash and crack of a blow. */
  private landImpacts(): void {
    for (let i = this.impacts.length - 1; i >= 0; i -= 1) {
      const impact = this.impacts[i]!;
      if (impact.at > this.clock) continue;
      this.impacts.splice(i, 1);
      if (impact.kind === 'train') {
        if (impact.bag >= 0) {
          bagVisuals.hit(impact.bag, 1);
          this.punches.hit(impact.from, impact.point, 0.25, false, impact.energy);
        }
        if (impact.local) this.audio.play('train', impact.bag >= 0 ? 1 : 0.6);
        continue;
      }
      if (impact.local) {
        const side = this.localPlayer?.character;
        if (side) {
          side.fist(0, FIST);
          impact.from.set(FIST.x, impact.point.y, FIST.z);
        }
      }
      const wall = impact.kind === 'wall' || impact.kind === 'boss';
      this.punches.hit(impact.from, impact.point, wall ? (impact.kind === 'boss' ? 0.9 : 0.65) : 0.8, false, impact.energy);
      if (!impact.local) continue;
      if (wall) {
        this.stages.hitWall(impact.kind === 'boss' ? 0.9 : 0.6);
        this.audio.play('smash');
        if (impact.kind === 'boss') this.audio.play('boss');
        this.camera.shake(impact.kind === 'boss' ? 0.32 : 0.2);
      } else {
        this.audio.play('punch');
        this.camera.shake(0.24);
      }
    }
  }

  private screenOf(point: Vector3): { x: number; y: number } | null {
    SCREEN.copy(point).project(this.camera.camera);
    if (SCREEN.z > 1) return null;
    return { x: (SCREEN.x * 0.5 + 0.5) * this.renderer.width, y: (-SCREEN.y * 0.5 + 0.5) * this.renderer.height };
  }

  /**
   * A training punch the server paid: a big "+N" rises beside the head -
   * alternating sides - with the bag's multiplier when one paid it, and in
   * green with LUCKY! when the punch rolled lucky.
   */
  private onTrained(message: TrainedMessage): void {
    if (message.gain <= 0) return;
    const player = this.localPlayer;
    // A bag's automatic punch had no click to start the swing: play it now (unless a click's own is under way).
    if (message.auto && player && this.sinceAction >= actionInterval(this.local?.upgrades.punchRate ?? 0)) {
      player.train();
      const bag = player.onBag;
      const placement = bag >= 0 ? BAGS[bag] : undefined;
      const point = placement ? new Vector3(placement.x, placement.floor + 3.4, placement.z) : player.position.clone();
      this.impacts.push({ at: this.clock + impactSeconds('train'), kind: 'train', point, from: player.position.clone(), local: true, bag, energy: this.energyColor() });
    }
    player?.character.pulseAura(message.lucky ? 1 : 0.45);
    const w = this.renderer.width;
    const h = this.renderer.height;
    let x = w * 0.5;
    let y = h * 0.42;
    if (player) {
      this.popSide = 1 - this.popSide;
      const p = player.position;
      const at = this.screenOf(POINT.set(p.x, p.y + player.character.height + 0.4, p.z));
      if (at) {
        x = at.x + (this.popSide ? 1 : -1) * Math.min(120, w * 0.09);
        y = at.y;
      }
    }
    x = Math.min(w - 70, Math.max(70, x + (Math.random() - 0.5) * 50));
    y = Math.min(h - 180, Math.max(90, y + (Math.random() - 0.5) * 30));
    if (message.lucky) {
      this.audio.play('lucky');
      this.hud.pop(`+${formatAmount(message.gain)}`, 'lucky', x, y - 30, { text: 'LUCKY!', color: '#ffe23a' });
      return;
    }
    const extra = message.bag > 1 ? { text: `${message.bag}x`, color: '#ffd23a' } : undefined;
    this.hud.pop(`+${formatAmount(message.gain)}`, 'train', x, y, extra);
  }

  /** A blow at a wall the server resolved: the damage, and - if it fell - the burst. */
  private onSmashed(message: SmashedMessage): void {
    const wall = WALLS[message.wall];
    if (!wall) return;
    const x = this.localPlayer?.position.x ?? 0;
    this.damage.show(message.damage, x, 6.5 + Math.random() * 2, wall.z - WALL_THICKNESS / 2 - 0.5, message.broken);
    if (message.broken) {
      this.stages.breakWall(message.wall, x);
      this.audio.play('crumble');
      this.camera.shake(wall.boss ? 0.8 : 0.55);
      if (wall.boss) this.hud.toast('BOSS DEFEATED!', 'gold');
    } else {
      this.audio.play('crack', 0.7, 0.02);
    }
  }

  /** A blow at a player the server resolved. */
  private onPunched(message: PunchedMessage): void {
    const target = this.network.players?.get(message.target);
    if (target) this.damage.show(message.damage, target.x, target.y + 4, target.z, message.knockedOut);
    if (message.knockedOut) {
      this.audio.play('ko');
      this.camera.shake(0.5);
    }
  }

  // ----------------------------------------------------------------- pads

  /**
   * PADS: standing on one is a REQUEST, sent once per visit (a claim retries
   * on a short cooldown). A character's pedestal equips it; a stage's gold pad
   * claims its Wins once its walls are down; a booth opens its menu.
   */
  private updatePads(delta: number, player: LocalPlayer): void {
    const p = player.position;
    const state = this.local;
    this.claimCooldown = Math.max(0, this.claimCooldown - delta);
    let pad = '';

    if (state && p.x > CHARACTER_STAND.minX - 1) {
      for (const pedestal of CHARACTER_PADS) {
        if (Math.hypot(p.x - pedestal.x, p.z - pedestal.z) > CHARACTER_STAND.padRadius || Math.abs(p.y - pedestal.y) > 1.2) continue;
        pad = `character:${pedestal.id}`;
        if (this.onPad === pad) break;
        const def = characterById(pedestal.id)!;
        if (state.character === pedestal.id && state.morph) this.hud.toast(`You are ${def.name}`, 'gold');
        else if (characterUnlocked(pedestal.id, state.lifetimeWins)) this.network.equipCharacter(pedestal.id);
        else {
          this.audio.play('refuse');
          this.hud.toast(`${def.name} needs ${formatWins(def.winsRequired)} Wins earned - you have ${formatWins(state.lifetimeWins)}`, 'bad');
        }
        break;
      }
    }

    const booth: BoothKind | null = state && p.z > HUB.maxZ - 12 && p.z < HUB.maxZ ? boothAt(p.x, p.z) : null;
    if (booth) {
      pad = `booth:${booth}`;
      if (this.onPad !== pad) this.openOnly(booth === 'upgrader' ? 'upgrades' : 'auras');
    }

    const stage = stageAt(p.z);
    if (stage > 0 && state) {
      const def = stageByIndex(stage)!;
      if (Math.abs(p.x - def.claimX) <= CLAIM_PAD_HALF && Math.abs(p.z - def.claimZ) <= CLAIM_PAD_HALF && p.y < 2) {
        pad = `claim:${stage}`;
        const done = stageComplete(state.wallsBroken, stage);
        const banked = isClaimed(state.claimed, stage);
        if (done && !banked && this.claimCooldown <= 0) {
          this.claimCooldown = 0.6;
          this.network.claimStage(stage);
        } else if (!done && this.onPad !== pad) {
          this.hud.toast(`Break Level ${def.firstWall + def.wallCount} to claim this Win Area!`, 'bad');
        }
      }
    }
    this.onPad = pad;
  }

  // ------------------------------------------------------------------ HUD

  private updateHud(player: LocalPlayer): void {
    const state = this.local;
    if (!state) return;
    const p = player.position;

    const bag = player.onBag >= 0 ? BAGS[player.onBag] : undefined;
    if (bag) {
      const tier = BAG_TIERS[bag.tier]!;
      const open = canUseBag(tier.tier, state.rebirths);
      this.hud.setBag({ name: tier.name, multiplier: tier.multiplier, color: tierCss(tier.tier), locked: open ? '' : `needs Rebirth ${tier.rebirthsRequired} (1x)` });
    } else {
      this.hud.setBag(null);
    }

    if (inPvpZone(p.x, p.z)) {
      this.hud.setPanel({
        kind: 'pvp',
        title: `CULLING ARENA <i>${Math.round(PVP.strengthMultiplier * 100)}% Cursed Energy</i>`,
        value: state.health,
        max: state.maxHealth,
        barText: `HP ${formatAmount(Math.ceil(state.health))} / ${formatAmount(state.maxHealth)}`,
        meta: `Your PvP energy: <b>${formatAmount(pvpStrength(state.energy))}</b> &nbsp; KOs: <b>${formatCount(state.pvpKos)}</b>`,
      });
    } else {
      const stage = stageAt(p.z);
      const def = stage > 0 ? stageByIndex(stage) : undefined;
      if (def) {
        const done = stageComplete(state.wallsBroken, def.index);
        const banked = isClaimed(state.claimed, def.index);
        const wall = WALLS[state.wallsBroken];
        const last = def.firstWall + def.wallCount;
        if (!done && wall && wall.stage === def.index) {
          this.hud.setPanel({
            kind: wall.boss ? 'boss' : 'stage',
            title: `Stage ${def.index} <i>${def.name}</i>${wall.boss ? ' - BOSS' : ''}`,
            value: state.wallHp,
            max: wall.hp,
            barText: `Level ${wall.id + 1}: ${formatAmount(Math.ceil(state.wallHp))} / ${formatAmount(wall.hp)}`,
            meta: `Wall <b>${wall.layer + 1}/${def.wallCount}</b> &nbsp; Level ${last}: <b>+${formatWins(def.reward)} Wins</b>`,
            // Near the wall its own readout carries the bar.
            compact: p.z > wall.z - 24,
          });
        } else {
          this.hud.setPanel({
            kind: 'stage',
            title: `Stage ${def.index} <i>${def.name}</i> - ${done ? 'CLEARED!' : 'ahead'}`,
            value: 1,
            max: 1,
            barText: done ? 'Every wall down' : '',
            meta: banked
              ? `Claimed <b>+${formatWins(def.reward)} Wins</b>`
              : done
                ? `Claim <b>+${formatWins(def.reward)} Wins</b> in the Win Area on the ${def.claimX < 0 ? 'right' : 'left'}${def.index < STAGE_COUNT ? ' - or push on' : ''}`
                : `Level ${last}: <b>+${formatWins(def.reward)} Wins</b>`,
          });
        }
      } else {
        this.hud.setPanel(null);
      }
    }
    this.hud.setQuest(this.questFor(state));
    this.hud.setHint(anyWindowOpen() ? '' : this.hintFor(state, p));
  }

  /**
   * THE QUEST BANNER: three first steps, as the reference shows them ("Stage
   * (3/3): Unlock Nobara"), then always the next goal - the next sorcerer, the
   * next aura, the next stage. Derived from replicated state; nothing stored.
   */
  private questFor(state: NetPlayerState): string {
    if (state.totalWalls === 0 && state.lifetimeWins === 0 && state.energy < 20) return `Stage (1/3): Punch to gain Cursed Energy <b>${formatAmount(state.energy)}/20</b>`;
    if (state.totalWalls === 0 && state.lifetimeWins === 0) return 'Stage (2/3): Break <b>Wall 1</b> - through the STAGES portal';
    if (state.lifetimeWins < 1) return 'Stage (3/3): Unlock <b>Nobara</b> - claim the Win at Level 10';
    const next = CHARACTERS.find((def) => !characterUnlocked(def.id, state.lifetimeWins));
    const nextAura = AURAS.find((def) => !ownsAura(state.auraMask, def.id));
    if (next && (!nextAura || next.winsRequired <= nextAura.cost * 4)) return `Next: Unlock <b>${next.name}</b> (${formatWins(state.lifetimeWins)}/${formatWins(next.winsRequired)} Wins)`;
    if (nextAura) return `Next: Buy the <b>${nextAura.name}</b> aura (${formatWins(state.wins)}/${formatWins(nextAura.cost)} Wins)`;
    if (state.bestStage < STAGE_COUNT) return `Next: Clear <b>Stage ${state.bestStage + 1} - ${STAGES[state.bestStage]!.name}</b>`;
    return 'You conquered every stage - rebirth and climb again!';
  }

  private hintFor(state: NetPlayerState, p: Vector3): string {
    const touch = document.body.classList.contains('aoe-touch-mode');
    const wall = WALLS[state.wallsBroken];
    if (!canEnterPvp(state.rebirths) && p.z < HUB.minZ + 10 && Math.abs(p.x) < PVP_GATE.halfWidth + 4) return `The PvP Arena opens at Rebirth ${PVP.rebirthsRequired}`;
    if (wall && stageAt(p.z) === wall.stage) {
      const face = wall.z - WALL_THICKNESS / 2;
      const near = p.z >= face - ACTION.wallReach - 3;
      if (near && state.energy * 60 < wall.hp) return 'This wall is tough! Train more Cursed Energy on the bags first';
      if (near && p.z < face - ACTION.wallReach) return 'Walk up to the wall to punch it';
      if (near) return touch ? 'Tap SMASH to break the wall!' : 'Click to smash the wall!';
    }
    if (stageAt(p.z) > 0) return '';
    if (levelOf(state.xp, state.rebirths).maxed) return 'You can Rebirth! Open the Rebirth menu' + (touch ? '' : ' (R)');
    if (state.totalWalls === 0 && state.energy < 20) return touch ? 'Tap PUNCH to gain Cursed Energy!' : 'Click (or hold) to punch and gain Cursed Energy!';
    const best = bestUnlockedCharacter(state.lifetimeWins);
    if (best > state.character) return `${CHARACTERS[best - 1]!.name} is unlocked - equip them in Sorcerers` + (touch ? '' : ' (B)');
    return '';
  }

  private tickFps(delta: number): void {
    if (this.fpsReadout.hidden) return;
    this.fpsAccum += delta;
    this.fpsFrames += 1;
    if (this.fpsAccum < 0.5) return;
    this.fpsReadout.textContent = `${Math.round(this.fpsFrames / this.fpsAccum)} FPS`;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
  }

  private flushInput(): void {
    const player = this.localPlayer;
    if (!player) return;
    for (const message of player.drainOutgoing()) this.network.sendInput(message);
  }

  private applyPendingRespawn(): void {
    const player = this.localPlayer;
    const message = this.pendingRespawn;
    if (!player || !message) return;
    this.pendingRespawn = null;
    player.teleport(message.x, message.y, message.z, message.rotationY);
    this.input.look.setYaw(message.rotationY);
  }

  private snapCameraIfPlaced(): void {
    const player = this.localPlayer;
    if (!player) return;
    const placement = player.consumePlacement();
    if (placement === 'none') return;
    this.camera.snapTo(player.position, placement === 'respawn');
  }

  // ---------------------------------------------------------------- state

  private onPlayerAdded(sessionId: string, state: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalState(state);
      return;
    }
    this.remotePlayers.add(sessionId, state);
    this.announce(sessionId, state);
  }

  /**
   * Tell the portal about another player, by their Bloxity USERNAME (its friend-join
   * toasts match on it), once each: `playerInRoom` for those already here when we
   * joined, `playerJoined` for those who arrive after. Guests have no username and
   * are skipped; a username that is verified a moment after the join is announced then.
   */
  private announce(sessionId: string, state: NetPlayerState): void {
    if (!state.username || this.announced.has(sessionId)) return;
    this.announced.add(sessionId);
    if (performance.now() < this.joinedAt + ROOM_SETTLE_MS) this.bloxity.playerInRoom(state.username);
    else this.bloxity.playerJoined(state.username);
  }

  private onPlayerChanged(sessionId: string, state: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalState(state);
      return;
    }
    this.remotePlayers.update(sessionId, state);
    this.announce(sessionId, state);
  }

  private refreshWindows(state: NetPlayerState): void {
    this.charactersWindow.setState(state.lifetimeWins, state.character, state.morph);
    this.worldsWindow.setState(state.bestStage);
    this.rebirthWindow.setProgress(state.xp, state.rebirths);
    const u = state.upgrades;
    this.upgradesWindow.setState(state.wins, { speed: u.speed, trainingRate: u.trainingRate, luck: u.luck, bossDamage: u.bossDamage, punchRate: u.punchRate });
    this.aurasWindow.setState(state.wins, state.auraMask, state.aura);
  }

  /** Everything the server says about the local player. It derives none of it. */
  private applyLocalState(state: NetPlayerState): void {
    const player = this.localPlayer;
    if (!player) return;
    this.local = state;

    player.setParams(state.moveSpeed, state.jumpVelocity, state.wallsBroken, canEnterPvp(state.rebirths));
    player.setLook(lookOf(state));
    player.character.setAura(state.aura);
    // 0 health is the server's knockout state. The knockout sound plays once, as it begins.
    const dead = state.health <= 0;
    if (dead && !player.character.dead) this.audio.play('death');
    player.character.setDead(dead);
    const progress = levelOf(state.xp, state.rebirths);
    player.setDisplayName(state.displayName, state.avatarUrl, `Level ${formatCount(progress.level)}`);
    if (this.lastHurt >= 0 && state.hurtCount !== this.lastHurt) {
      player.character.flinch();
      this.audio.play('punch', 0.8);
      this.camera.shake(0.35);
    }
    this.lastHurt = state.hurtCount;

    if (state.ready) {
      player.reconcile({
        x: state.x,
        y: state.y,
        z: state.z,
        rotationY: state.rotationY,
        velocityX: state.velocityX,
        velocityY: state.velocityY,
        velocityZ: state.velocityZ,
        grounded: state.grounded,
        jumpLatched: state.jumpLatched,
        jumpCount: state.jumpCount,
        lastInputSeq: state.lastInputSeq,
      });
    }

    const character = characterById(state.character) ?? CHARACTERS[0]!;
    this.hud.setStatus({
      level: progress.level,
      fraction: progress.fraction,
      into: progress.into,
      need: progress.need,
      maxed: progress.maxed,
      energy: state.energy,
      wins: state.wins,
      gainPerPunch: state.gainPerPunch,
      multiplier: state.energyMultiplier,
      characterName: state.morph ? character.name : `${character.name} (avatar)`,
      characterPower: characterUnlocked(character.id, state.lifetimeWins) ? character.power : 1,
    });
    this.hub.setProgress(state.lifetimeWins, state.character, state.morph, state.rebirths);
    this.stages.setRun(state.wallsBroken, state.wallHp, state.claimed);

    if (this.lastLevel >= 0 && progress.level > this.lastLevel && state.rebirths === this.lastRebirths) {
      this.audio.play('level');
      this.hud.levelUp(this.lastLevel, progress.level);
      player.character.pulseAura(1);
      if (progress.maxed) this.hud.toast('MAX LEVEL - Rebirth to level up!', 'pink');
    }
    if (this.lastRebirths >= 0 && state.rebirths > this.lastRebirths) {
      this.audio.play('rebirth');
      this.hud.banner('REBIRTH!', `Rebirth ${formatCount(state.rebirths)} - ${formatCount(state.rebirths + 1)}x Cursed Energy, Level cap ${formatCount(levelCap(state.rebirths))}`, '#ff7ae8');
    }
    if (this.lastBest >= 0 && state.bestStage > this.lastBest) {
      const next = stageByIndex(state.bestStage + 1);
      if (next) this.hud.toast(`Stage ${next.index} - ${next.name} unlocked in Worlds!`, 'gold');
    }
    this.lastLevel = progress.level;
    this.lastRebirths = state.rebirths;
    this.lastBest = state.bestStage;

    this.refreshWindows(state);
    this.rebirthButton.setReady(this.rebirthWindow.isEligible);
    this.rebirthButton.setPercent(this.rebirthWindow.isEligible ? '' : `${Math.floor(this.rebirthWindow.progress * 100)}%`);
    this.charactersButton.setReady(bestUnlockedCharacter(state.lifetimeWins) > state.character || (!state.morph && state.totalWalls === 0 && state.lifetimeWins >= 1));
    this.upgradesButton.setReady(UPGRADES.some((def) => state.wins >= upgradeCost(def.id as UpgradeId, state.upgrades[def.id as UpgradeId])) && state.wins >= 1);
    const nextAura = AURAS.find((def) => !ownsAura(state.auraMask, def.id));
    this.aurasButton.setReady(!!nextAura && state.wins >= nextAura.cost);
  }

  private onNotice(message: NoticeMessage): void {
    switch (message.kind) {
      case 'bought':
        this.audio.play('unlock');
        this.hud.toast(message.text, 'good');
        break;
      case 'equipped':
        this.audio.play('buy');
        this.hud.toast(message.text, 'good');
        break;
      case 'rebirth':
        this.hud.toast(message.text, 'pink');
        break;
      case 'refused':
      case 'locked':
        this.audio.play('refuse');
        this.hud.toast(message.text, 'bad');
        break;
      case 'info':
        this.hud.toast(message.text, 'gold');
        break;
    }
  }

  private onStageCleared(message: StageClearedMessage): void {
    const def = stageByIndex(message.stage);
    this.audio.play('claim');
    this.hud.banner(
      'STAGE CLEARED!',
      `${def?.name ?? `Stage ${message.stage}`} broken! Claim +${formatWins(def?.reward ?? 0)} Wins in the Win Area - or push on`,
      '#ffd23a',
    );
  }

  /** A claim the SERVER granted (once per claim per run): the celebration, and any sorcerer it unlocked. */
  private onStageAwarded(message: StageAwardedMessage): void {
    if (this.localPlayer) this.celebration.play(this.localPlayer.position);
    this.audio.play('win');
    this.hud.toast(`+${formatWins(message.wins)} Win${message.wins === 1 ? '' : 's'}! Back to spawn...`, 'gold');
    if (message.unlocked > 0) {
      const def = characterById(message.unlocked);
      if (def) {
        this.audio.play('unlock', 1, 0.25);
        this.hud.banner('NEW SORCERER!', `${def.name} unlocked: +${formatAmount(def.power)} Cursed Energy per punch`, '#7ae8ff');
      }
    }
    const aura = auraById(AURAS.find((a) => !ownsAura(this.local?.auraMask ?? 0, a.id))?.id ?? 0);
    if (aura && this.local && this.local.wins + message.wins >= aura.cost && this.local.wins < aura.cost) this.hud.toast(`You can buy the ${aura.name} aura!`, 'pink');
    logger.info(SCOPE, `stage ${message.stage} claimed: +${message.wins} wins`);
  }

  private onStatusChange(status: ConnectionStatus): void {
    if (clientConfig.debug) logger.info(SCOPE, `connection: ${status}`);
  }

  dispose(): void {
    this.stop();
    this.hud.dispose();
    this.damage.dispose();
    this.punches.dispose();
    this.celebration.dispose();
    for (const window of Object.values(this.windows())) window.dispose();
    this.portraits.dispose();
    window.removeEventListener('keydown', this.onHotkey);
    window.removeEventListener('keydown', this.onGesture);
    window.removeEventListener('mousedown', this.onGesture);
    window.removeEventListener('touchstart', this.onGesture);
    this.bloxity.dispose();
    this.bloxityPanel.dispose();
    this.fpsReadout.remove();
    this.audio.dispose();
    this.remotePlayers.dispose();
    this.atmosphere.dispose();
    this.hub?.dispose();
    this.stages.dispose();
    this.renderer.dispose();
  }
}
