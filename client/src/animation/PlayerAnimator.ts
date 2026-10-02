import type { Group } from 'three';
import { AIRBORNE, ATTACKS, FLEX, IDLE, LANDING, LOCOMOTION, TRANSITIONS } from '../config/animationConfig.js';
import type { AnimationInput } from './AnimationInput.js';
import { EmotePlayer } from './Emotes.js';
import { LocomotionCycle } from './LocomotionCycle.js';
import { PoseBuffer } from './PoseBuffer.js';
import type { PlayerRig } from './rig/PlayerRig.js';
import { BONE_INDEX, type BoneName } from './rig/boneNames.js';

/** The body's state. The punch is a LAYER over it, not a state. */
export type AnimationState = 'idle' | 'run' | 'airborne' | 'landing';

const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);
const ease = (t: number): number => t * t * (3 - 2 * t);

/** The bones the punch layer owns while it plays. */
const UPPER: readonly BoneName[] = ['ArmL1', 'ArmL2', 'ArmR1', 'ArmR2', 'Spine1', 'Spine2', 'Neck1'];
const LEGS: readonly BoneName[] = ['LegL1', 'LegL2', 'LegR1', 'LegR2'];

/**
 * Writes ONLY to bones (via `PlayerRig`) and to the visual node's position and
 * rotation. It never touches the physics root.
 *
 * The body runs, idles, jumps and lands; the PUNCH layer (a punch, or the
 * fighting guard held just after one) overrides the arms and torso on top of
 * that, so a player can punch on the run. Standing still long enough strikes
 * the FLEX - a front double biceps, squeezed every couple of seconds.
 */
export class PlayerAnimator {
  private readonly locomotion = new LocomotionCycle();
  private readonly target = new PoseBuffer();
  private readonly from = new PoseBuffer();
  private readonly output = new PoseBuffer();
  private readonly layer = new PoseBuffer();
  private readonly layerB = new PoseBuffer();
  /** The Bloxity emote this body is playing, if any (blended over everything else). */
  private readonly emote = new EmotePlayer();

  private state: AnimationState = 'idle';
  private stateTime = 0;
  private blendTime = 0;
  private blendDuration = 0;
  private idleTime = 0;
  /** Seconds standing still without punching: the flex comes after FLEX.after. */
  private stillFor = 0;
  private flex = 0;
  private wasGrounded = true;
  private bank = 0;
  private lean = 0;
  /** 0..1 weight of the guard, eased. */
  private guard = 0;

  constructor(
    private rig: PlayerRig,
    private readonly visual: Group,
  ) {}

  get currentState(): AnimationState {
    return this.state;
  }

  /** 0..1: how far into the flex the body is. */
  get flexWeight(): number {
    return this.flex;
  }

  setRig(rig: PlayerRig): void {
    this.rig = rig;
  }

  reset(): void {
    this.state = 'idle';
    this.stateTime = 0;
    this.blendDuration = 0;
    this.wasGrounded = true;
    this.bank = 0;
    this.lean = 0;
    this.guard = 0;
    this.stillFor = 0;
    this.flex = 0;
    this.target.reset();
    this.from.reset();
    this.output.reset();
    this.rig.resetToBindPose();
    this.visual.position.set(0, 0, 0);
    this.visual.rotation.set(0, 0, 0);
  }

  /** Hold the flex at once (a statue on its pedestal). */
  /** Play a Bloxity emote by catalogue id; false (and nothing happens) for an unknown one. */
  playEmote(id: string): boolean {
    return this.emote.play(id);
  }

  stopEmote(): void {
    this.emote.stop();
  }

  /** The emote playing ('' for none, or one fading out). */
  get emoteId(): string {
    return this.emote.currentId;
  }

  crouchNow(): void {
    this.stillFor = FLEX.after + FLEX.settle;
    this.flex = 1;
  }

  update(delta: number, input: AnimationInput): void {
    const dt = Math.max(0, delta);
    this.stateTime += dt;
    this.resolveState(input);
    this.trackStillness(dt, input);
    this.writePose(dt, input);
    this.blend(dt);
    this.applyPunchLayer(dt, input);
    this.applyEmote(dt, input);
    this.rig.applyPose(this.output);
    this.applyVisual(dt, input);
  }

  private resolveState(input: AnimationInput): void {
    if (input.landed || (input.grounded && !this.wasGrounded)) {
      this.wasGrounded = true;
      this.setState('landing', TRANSITIONS.toLanding);
      return;
    }
    this.wasGrounded = input.grounded;
    if (!input.grounded) {
      this.setState('airborne', TRANSITIONS.toAirborne);
      return;
    }
    if (this.state === 'landing' && this.stateTime < LANDING.duration) return;
    const speed = Math.max(input.horizontalSpeed, input.treadmillSpeed);
    this.setState(speed < LOCOMOTION.idleSpeed ? 'idle' : 'run', TRANSITIONS.toLocomotion);
  }

  private setState(next: AnimationState, duration: number): void {
    if (next === this.state) return;
    this.from.copyFrom(this.output);
    this.state = next;
    this.stateTime = 0;
    this.blendTime = 0;
    this.blendDuration = duration;
  }

  /** Stillness builds the flex; any move, jump or punch drops it at once. */
  private trackStillness(dt: number, input: AnimationInput): void {
    const punching = input.punchTime >= 0 || input.guard;
    if (this.state === 'idle' && !punching) this.stillFor += dt;
    else this.stillFor = 0;
    const want = ease(clamp((this.stillFor - FLEX.after) / FLEX.settle, 0, 1));
    const rate = want > this.flex ? 10 : 18;
    this.flex += (want - this.flex) * (1 - Math.exp(-rate * dt));
    if (this.flex < 1e-3) this.flex = 0;
  }

  private writePose(dt: number, input: AnimationInput): void {
    switch (this.state) {
      case 'idle': {
        this.locomotion.settleTowardNeutral(dt);
        this.idleTime += dt;
        const breath = Math.sin(this.idleTime * IDLE.breathFrequency * Math.PI * 2);
        this.target.applyDefinition(IDLE.basePose);
        if (this.flex > 0) {
          this.layerB.applyDefinition(FLEX.pose);
          // The squeeze: the elbows crunch in and the chest lifts, then relax.
          const phase = (this.stillFor % FLEX.squeezePeriod) / FLEX.squeezePeriod;
          const squeeze = Math.sin(clamp(phase * 3, 0, 1) * Math.PI) * FLEX.squeeze;
          this.layerB.add('ArmL2', 0, 0, squeeze);
          this.layerB.add('ArmR2', 0, 0, -squeeze);
          this.layerB.add('Spine1', -squeeze * 0.3);
          this.target.lerpBetween(this.target, this.layerB, this.flex);
        }
        this.target.add('Spine1', breath * IDLE.breathAmount);
        this.target.add('Neck1', -breath * IDLE.breathAmount * 0.6);
        this.target.bobY = breath * IDLE.breathBob;
        break;
      }
      case 'run': {
        const speed = Math.max(input.horizontalSpeed, input.treadmillSpeed);
        this.locomotion.advance(dt, speed, 1, false);
        this.locomotion.writePose(this.target, speed, 1);
        break;
      }
      case 'airborne': {
        const rising = clamp(input.verticalVelocity / AIRBORNE.velocityReference, -1, 1);
        this.target.applyDefinition(AIRBORNE.fall);
        this.layerB.applyDefinition(AIRBORNE.rise);
        this.target.lerpBetween(this.target, this.layerB, clamp(0.5 + rising * 0.5, 0, 1));
        this.target.bobY = 0;
        break;
      }
      case 'landing': {
        const depth = 1 - ease(clamp(this.stateTime / LANDING.duration, 0, 1));
        this.target.applyDefinition(LANDING.pose, depth);
        this.target.bobY = LANDING.bobY * depth;
        break;
      }
    }
  }

  private blend(dt: number): void {
    if (this.blendDuration > 0) {
      this.blendTime += dt;
      const t = clamp(this.blendTime / this.blendDuration, 0, 1);
      this.output.lerpBetween(this.from, this.target, ease(t));
      if (t >= 1) this.blendDuration = 0;
    } else {
      this.output.copyFrom(this.target);
    }
  }

  /**
   * THE PUNCH LAYER: the punch while it plays, else the guard (eased), else
   * nothing - the relaxed run, idle or flex shows through.
   */
  private applyPunchLayer(dt: number, input: AnimationInput): void {
    this.guard += ((input.guard ? 1 : 0) - this.guard) * (1 - Math.exp(-10 * dt));
    const anim = ATTACKS[input.style] ?? ATTACKS.punch;
    const punching = input.punchTime >= 0 && input.punchTime < anim.duration;

    if (punching) {
      const variant = anim.variants[input.punchVariant % anim.variants.length]!;
      const t = input.punchTime / anim.duration;
      if (t < anim.windEnd) {
        this.layerB.applyDefinition(anim.stance);
        this.layer.applyDefinition(variant.wind);
        this.layer.lerpBetween(this.layerB, this.layer, ease(t / anim.windEnd));
      } else if (t < anim.hitEnd) {
        // The strike snaps: quick in, no easing out.
        const k = (t - anim.windEnd) / (anim.hitEnd - anim.windEnd);
        this.layerB.applyDefinition(variant.wind);
        this.layer.applyDefinition(variant.hit);
        this.layer.lerpBetween(this.layerB, this.layer, 1 - (1 - k) * (1 - k) * (1 - k));
      } else {
        const k = (t - anim.hitEnd) / (1 - anim.hitEnd);
        this.layerB.applyDefinition(variant.hit);
        this.layer.applyDefinition(anim.stance);
        this.layer.lerpBetween(this.layerB, this.layer, ease(k));
      }
      this.overrideBones(this.layer, 1, UPPER);
      if (anim.legs && this.state === 'idle') this.overrideBones(this.layer, Math.sin(Math.PI * clamp(t, 0, 1)), LEGS);
      return;
    }
    if (this.guard > 0.01) {
      this.layer.applyDefinition(anim.stance);
      this.overrideBones(this.layer, this.guard * (1 - this.flex), UPPER);
    }
  }

  /**
   * The emote layer, last, over the whole body. Moving, jumping, running on a
   * treadmill, lifting or a blow ends it at once (fading out), so it never
   * fights another animation. Cosmetic: nothing in here may break a frame.
   */
  private applyEmote(dt: number, input: AnimationInput): void {
    try {
      const busy = input.horizontalSpeed > 1.5 || !input.grounded || input.treadmillSpeed > 0 || input.punchTime >= 0;
      if (busy) this.emote.stop();
      this.emote.apply(dt, this.output, this.layerB);
      // No flex builds up underneath an emote (it would snap in the moment the emote ends).
      if (this.emote.active) this.stillFor = 0;
    } catch {
      this.emote.stop();
    }
  }

  private overrideBones(layer: PoseBuffer, weight: number, bones: readonly BoneName[]): void {
    const out = this.output.rotations;
    const src = layer.rotations;
    for (const bone of bones) {
      const at = boneIndex(bone);
      for (let k = 0; k < 3; k += 1) {
        const a = out[at + k] ?? 0;
        const b = src[at + k] ?? 0;
        out[at + k] = a + (b - a) * weight;
      }
    }
  }

  private applyVisual(dt: number, input: AnimationInput): void {
    const anim = ATTACKS[input.style] ?? ATTACKS.punch;
    const punching = input.punchTime >= 0 && input.punchTime < anim.duration;
    // The whole body leans into the strike, peaking on impact.
    const t = punching ? clamp(input.punchTime / anim.duration, 0, 1) : 0;
    const wantLean = punching ? anim.lean * Math.sin(Math.PI * clamp((t - anim.windEnd * 0.5) / (1 - anim.windEnd * 0.5), 0, 1)) : 0;
    this.lean += (wantLean - this.lean) * (1 - Math.exp(-22 * dt));
    const wantBank = this.state === 'run' ? -input.turn * LOCOMOTION.bankAngle * 0.6 : 0;
    this.bank += (wantBank - this.bank) * (1 - Math.exp(-LOCOMOTION.bankRate * dt));
    this.visual.rotation.set(this.lean, 0, this.bank);
    this.visual.position.y = this.output.bobY;
  }
}

const boneIndex = (bone: BoneName): number => BONE_INDEX[bone] * 3;
