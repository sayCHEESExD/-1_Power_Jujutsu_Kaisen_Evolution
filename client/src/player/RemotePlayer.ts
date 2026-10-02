import { BAGS, formatAmount, formatCount, stageAt } from '@jjk/shared';
import { createAnimationInput, type AnimationInput } from '../animation/AnimationInput.js';
import { ATTACKS, type AttackStyle } from '../config/animationConfig.js';
import type { NetPlayerState } from '../net/netTypes.js';
import { lookOf } from './look.js';
import { NamePlate } from './NamePlate.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const FOLLOW_RATE = 14;
const SNAP_DISTANCE = 14;
const FACE_SECONDS = 0.35;
const GUARD_SECONDS = 1.1;

const shortestAngle = (from: number, to: number): number => {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
};

/**
 * Another player, rendered from replicated state ONLY.
 *
 * The transform is smoothed toward the replicated one. Every action is
 * derived from a replicated COUNTER - `punchCount` (a training punch),
 * `attackCount` (a blow, toward the replicated attack point), `hurtCount` (a
 * flinch) - as a difference against the count first seen, never a replay of
 * somebody's whole session. At a bag (`bag`) the body faces it.
 */
export class RemotePlayer {
  readonly character: PlayerCharacter;

  private readonly plate = new NamePlate();
  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;
  private targetYaw = 0;
  private readonly input: AnimationInput = createAnimationInput();
  private placed = false;
  private lastPunchCount = -1;
  private lastAttackCount = -1;
  private lastHurtCount = -1;
  private lastEmoteCount = -1;
  private actionTime = -1;
  private variant = 1;
  private style: AttackStyle = 'train';
  private guardFor = 0;
  private faceYaw = 0;
  private faceFor = 0;
  private bag = -1;
  private wasGrounded = true;
  /** Set when a new blow arrived, until the game has played its impact. */
  attacked = false;
  /** What the last blow hit (1 a wall, 2 a player), and where. */
  attackKind = 0;
  readonly punchedAt = { x: 0, y: 0, z: 0 };

  get position(): { readonly x: number; readonly y: number; readonly z: number } {
    return { x: this.targetX, y: this.targetY, z: this.targetZ };
  }

  constructor(state: NetPlayerState) {
    this.character = new PlayerCharacter(lookOf(state));
    this.character.root.add(this.plate.sprite);
    this.apply(state);
    this.character.setPosition(this.targetX, this.targetY, this.targetZ);
    this.character.setYaw(this.targetYaw);
    this.placed = true;
  }

  apply(state: NetPlayerState): void {
    this.targetX = state.x;
    this.targetY = state.y;
    this.targetZ = state.z;
    this.targetYaw = state.rotationY;
    // What everyone can read off another player: their level and the stage they are
    // breaking - or, in the arena, their health.
    const stage = stageAt(state.z);
    const tag = state.inPvp
      ? `PvP  ${formatAmount(Math.ceil(state.health))} HP`
      : `Level ${formatCount(state.level)}${stage > 0 ? `  -  Stage ${stage}` : `  -  Rebirth ${formatCount(state.rebirths)}`}`;
    this.plate.set(state.displayName, state.avatarUrl, this.character.height, tag, state.inPvp ? '#ff6a7a' : '#ffd23a');

    this.input.grounded = state.grounded;
    this.input.horizontalSpeed = state.speed;
    this.input.verticalVelocity = state.verticalVelocity;
    this.bag = state.bag;
    this.character.setLook(lookOf(state));
    this.character.setAura(state.aura);
    // 0 health is the server's knockout state: the body topples until the respawn.
    this.character.setDead(state.health <= 0);

    if (this.lastPunchCount >= 0 && state.punchCount > this.lastPunchCount) {
      this.style = 'train';
      this.actionTime = 0;
      this.variant = (this.variant + 1) % 6;
      this.guardFor = 0.6;
      this.character.pulseAura(0.5);
    }
    this.lastPunchCount = state.punchCount;

    if (this.lastAttackCount >= 0 && state.attackCount > this.lastAttackCount) {
      this.style = 'punch';
      this.actionTime = 0;
      this.variant = (this.variant + 1) % 6;
      this.guardFor = GUARD_SECONDS;
      this.character.pulseAura(1);
      this.punchedAt.x = state.attackX;
      this.punchedAt.y = state.attackY;
      this.punchedAt.z = state.attackZ;
      this.attackKind = state.attackKind;
      this.faceYaw = Math.atan2(state.attackX - state.x, state.attackZ - state.z);
      this.faceFor = FACE_SECONDS;
      this.attacked = true;
    }
    this.lastAttackCount = state.attackCount;

    if (this.lastHurtCount >= 0 && state.hurtCount !== this.lastHurtCount) this.character.flinch();
    this.lastHurtCount = state.hurtCount;

    // Emotes: a new one starts when the count moves (or on first sight); a cleared one stops.
    if (state.emote && state.emoteCount !== this.lastEmoteCount) this.character.playEmote(state.emote);
    else if (!state.emote && this.character.emoteId) this.character.stopEmote();
    this.lastEmoteCount = state.emoteCount;
  }

  update(delta: number): void {
    const dt = Math.max(0, delta);
    const position = this.character.root.position;
    const gap = Math.hypot(this.targetX - position.x, this.targetY - position.y, this.targetZ - position.z);
    const bag = this.bag >= 0 && this.input.horizontalSpeed < 1.5 ? BAGS[this.bag] : undefined;
    if (!this.placed || gap > SNAP_DISTANCE) {
      position.set(this.targetX, this.targetY, this.targetZ);
      this.character.setYaw(this.targetYaw);
      this.placed = true;
    } else {
      const alpha = 1 - Math.exp(-FOLLOW_RATE * dt);
      position.x += (this.targetX - position.x) * alpha;
      position.y += (this.targetY - position.y) * alpha;
      position.z += (this.targetZ - position.z) * alpha;
      const yaw = this.character.root.rotation.y;
      const want = this.faceFor > 0 && this.input.horizontalSpeed < 6 ? this.faceYaw : bag ? -bag.facing * (Math.PI / 2) : this.targetYaw;
      this.character.setYaw(yaw + shortestAngle(yaw, want) * Math.min(1, alpha * 1.5));
    }

    if (this.actionTime >= 0) {
      this.actionTime += dt;
      if (this.actionTime >= ATTACKS[this.style].duration) this.actionTime = -1;
    }
    this.guardFor = Math.max(0, this.guardFor - dt);
    this.faceFor = Math.max(0, this.faceFor - dt);

    this.input.landed = this.input.grounded && !this.wasGrounded;
    this.wasGrounded = this.input.grounded;
    this.input.punchTime = this.actionTime;
    this.input.punchVariant = this.variant;
    this.input.guard = this.guardFor > 0;
    this.input.style = this.style;
    this.input.treadmillSpeed = 0;
    this.character.update(dt, this.input);
  }

  dispose(): void {
    this.plate.dispose();
    this.character.dispose();
  }
}
