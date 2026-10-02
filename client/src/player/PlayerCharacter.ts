import { PLAYER_HEIGHT, PVP, neckScale } from '@jjk/shared';
import { Group, Vector3, type Material, type Mesh, type Object3D } from 'three';
import type { AnimationInput } from '../animation/AnimationInput.js';
import { PlayerAnimator, type AnimationState } from '../animation/PlayerAnimator.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { avatarBodies } from '../bloxity/AvatarBody.js';
import { AuraFx } from '../characters/AuraFx.js';
import { characterLook } from '../characters/JjkCharacters.js';
import { PLAYER_MODEL_YAW_OFFSET } from '../config/worldVisuals.js';
import { AVATAR_SLOT, createSuitBody, fistsOf, lookKey, type BodyLook } from '../suits/SuitBody.js';

/**
 * THE VISUAL HALF OF A PLAYER, arranged so animation can never move them.
 *
 *   root          physics transform (position + facing). Gameplay owns it.
 *     fall        the knockout topple, and the flinch of a blow taken
 *       visual    the bob and the lean of a punch
 *         model   the body on screen: the player's own avatar or a character
 *     aura        the equipped aura's energy, and a strong character's own
 *
 * WITHOUT A CHARACTER LOOK (`AVATAR_SLOT`) a player is their own Bloxity
 * avatar. That body comes over the network, so it is two-step: the bundled
 * body at once, then the Bloxity body swapped in when it lands - unless the
 * look moved on meanwhile. A player already in their Bloxity body keeps it on
 * screen while a changed one loads, so a new hat never flashes back to the
 * bundled body. Equipping a character swaps straight to its painted body.
 */
export class PlayerCharacter {
  readonly root = new Group();

  private readonly visual = new Group();
  private readonly fall = new Group();
  /** Seconds into the knockout, or -1 while standing. */
  private deathTime = -1;
  /** Seconds left of a flinch, and which way it throws the body. */
  private flinchTime = 0;
  private flinchSide = 1;
  private model: Object3D;
  private readonly animator: PlayerAnimator;
  private key = '';
  private look: BodyLook = { character: AVATAR_SLOT };
  private disposed = false;
  private aura: AuraFx | null = null;
  private auraId = -1;
  private signature: AuraFx | null = null;
  private signatureKey = '';

  constructor(look?: BodyLook) {
    this.root.add(this.fall);
    this.fall.add(this.visual);
    this.look = look ?? this.look;
    this.model = createSuitBody(this.look);
    this.key = lookKey(this.look);
    this.model.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.visual.add(this.model);
    this.animator = new PlayerAnimator(new PlayerRig(this.model, this.model), this.visual);
    this.refreshSignature();
    this.requestAvatar();
  }

  /** Height of the head above the ground: where name plates sit. */
  get height(): number {
    const scale = this.look.character === AVATAR_SLOT ? 1 : characterLook(this.look.character).scale ?? 1;
    return PLAYER_HEIGHT * scale;
  }

  /** True while the body on screen is the player's Bloxity avatar (not the bundled fallback). */
  get showsBloxityBody(): boolean {
    return this.model.userData['bloxityBody'] === true;
  }

  /** Wear a look: rebuilt only when it differs from the current one. */
  setLook(look: BodyLook): void {
    const key = lookKey(look);
    if (key === this.key) return;
    this.key = key;
    const wasAvatar = this.look.character === AVATAR_SLOT;
    this.look = look;
    // Avatar to avatar: the Bloxity body on screen stays until the changed one lands.
    const keepBloxity = look.character === AVATAR_SLOT && wasAvatar && this.showsBloxityBody;
    if (!keepBloxity) this.install(createSuitBody(look));
    this.refreshSignature();
    this.requestAvatar();
  }

  /** The equipped aura (0 for none): built, swapped or dropped. */
  setAura(id: number): void {
    if (id === this.auraId) return;
    this.auraId = id;
    this.aura?.dispose();
    this.aura = AuraFx.forAura(id, this.height);
    if (this.aura) this.root.add(this.aura.root);
  }

  /** The strongest characters burn with their own energy, aura or not. */
  private refreshSignature(): void {
    const def = this.look.character === AVATAR_SLOT ? undefined : characterLook(this.look.character).signature;
    const key = def ? `${this.look.character}` : '';
    if (key === this.signatureKey) return;
    this.signatureKey = key;
    this.signature?.dispose();
    this.signature = def ? AuraFx.forSignature(def.color, def.style, this.height) : null;
    if (this.signature) this.root.add(this.signature.root);
  }

  /** Flare the aura (a punch landed, a level up). */
  pulseAura(amount = 1): void {
    this.aura?.pulse(amount);
    this.signature?.pulse(amount * 0.7);
  }

  /** Show or hide the auras (far from the camera they are not worth drawing). */
  setAuraVisible(visible: boolean): void {
    if (this.aura) this.aura.root.visible = visible;
    if (this.signature) this.signature.root.visible = visible;
  }

  /** Without a character look, fetch the player's Bloxity body and swap it in if the look is still the same. */
  private requestAvatar(): void {
    const look = this.look;
    if (look.character !== AVATAR_SLOT || !look.avatar) return;
    const key = this.key;
    void avatarBodies.build(look.avatar).then((body) => {
      if (!body || this.disposed || this.key !== key) {
        if (body) disposeOwnMaterial(body);
        return;
      }
      this.install(body);
    });
  }

  /** Put a body on screen: the rig and animator follow it, and the old body's own material goes. */
  private install(model: Object3D): void {
    const old = this.model;
    old.removeFromParent();
    if (old !== model) disposeOwnMaterial(old);
    this.model = model;
    this.model.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.visual.add(this.model);
    const rig = new PlayerRig(this.model, this.model);
    rig.resetToBindPose();
    // The rig sets the neck's own head scale as it binds; an avatar's chosen head size multiplies it.
    const headScale = this.model.userData['headScale'] as number | undefined;
    if (headScale !== undefined) rig.getBone('Neck1')?.scale.setScalar(neckScale(headScale));
    this.animator.setRig(rig);
  }

  /** A fist in world space: 0 the right, 1 the left. */
  fist(side: number, out: Vector3): Vector3 {
    const marker = fistsOf(this.model)[side === 1 ? 1 : 0];
    if (!marker) return out.copy(this.root.position).setY(this.root.position.y + this.height * 0.6);
    return marker.getWorldPosition(out);
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setYaw(yaw: number): void {
    this.root.rotation.y = yaw;
  }

  /**
   * The knockout state, straight from the server's health: true starts the
   * knockout animation (once), false - the respawn - stands the body back up.
   */
  setDead(dead: boolean): void {
    if (dead && this.deathTime < 0) {
      this.deathTime = 0;
    } else if (!dead && this.deathTime >= 0) {
      this.deathTime = -1;
      this.fall.rotation.set(0, 0, 0);
      this.fall.position.set(0, 0, 0);
      this.fall.scale.setScalar(1);
    }
  }

  get dead(): boolean {
    return this.deathTime >= 0;
  }

  /** A blow taken in the arena: the body snaps back and to a side. */
  flinch(): void {
    this.flinchTime = FLINCH_SECONDS;
    this.flinchSide = Math.random() < 0.5 ? -1 : 1;
  }

  /**
   * THE KNOCKOUT: a stagger back, a topple onto the back with one small
   * bounce, a beat lying still, then the body shrinks away. Finishes before
   * the server's `PVP.deathSeconds`, so the respawn never cuts it.
   */
  private updateDeath(delta: number): void {
    if (this.deathTime < 0) {
      if (this.flinchTime > 0) {
        this.flinchTime = Math.max(0, this.flinchTime - delta);
        const k = Math.sin((this.flinchTime / FLINCH_SECONDS) * Math.PI);
        this.fall.rotation.set(-0.32 * k, 0, 0.14 * k * this.flinchSide);
        if (this.flinchTime === 0) this.fall.rotation.set(0, 0, 0);
      }
      return;
    }
    this.deathTime += delta;
    const t = this.deathTime;
    const toppled = Math.min(1, t / TOPPLE);
    let angle = toppled * toppled * (Math.PI / 2);
    if (t > TOPPLE) {
      const k = Math.min(1, (t - TOPPLE) / BOUNCE);
      angle -= Math.sin(k * Math.PI) * 0.16;
    }
    this.fall.rotation.x = -angle;
    const back = Math.min(1, t / TOPPLE);
    this.fall.position.set(0, Math.sin(angle) * 0.35, -back * 0.6);
    const gone = Math.min(1, Math.max(0, (t - VANISH_START) / (DEATH_ANIMATION_SECONDS - VANISH_START)));
    this.fall.scale.setScalar(Math.max(0.001, 1 - gone * gone));
  }

  update(delta: number, input: AnimationInput): void {
    const dt = Math.max(0, delta);
    this.updateDeath(dt);
    this.animator.update(dt, input);
    const stance = this.animator.flexWeight;
    if (this.aura?.root.visible) this.aura.update(dt, stance);
    if (this.signature?.root.visible) this.signature.update(dt, stance);
  }

  /** Play a Bloxity emote on this body (an unknown id does nothing). */
  playEmote(id: string): boolean {
    return this.animator.playEmote(id);
  }

  stopEmote(): void {
    this.animator.stopEmote();
  }

  /** The emote this body is playing ('' for none). */
  get emoteId(): string {
    return this.animator.emoteId;
  }

  /** Strike the power stance at once (a statue on its pedestal). */
  crouchNow(): void {
    this.animator.crouchNow();
  }

  get animationState(): AnimationState {
    return this.animator.currentState;
  }

  resetAnimation(): void {
    this.animator.reset();
  }

  dispose(): void {
    this.disposed = true;
    this.aura?.dispose();
    this.signature?.dispose();
    disposeOwnMaterial(this.model);
    this.root.removeFromParent();
  }
}

/** The knockout's beats, seconds. It ends well inside the server's knockout state. */
const DEATH_ANIMATION_SECONDS = Math.min(1.7, PVP.deathSeconds - 0.25);
const TOPPLE = 0.45;
const BOUNCE = 0.25;
const VANISH_START = 1.15;
const FLINCH_SECONDS = 0.28;

/** A Bloxity body owns its material (textures and geometry are shared caches); a painted body owns nothing. */
const disposeOwnMaterial = (model: Object3D): void => {
  if (model.userData['bloxityBody'] !== true) return;
  const seen = new Set<Material>();
  model.traverse((child) => {
    const mesh = child as Mesh & { isSkinnedMesh?: boolean };
    const material = mesh.material as Material | undefined;
    if (material && !Array.isArray(material) && !seen.has(material) && mesh.isMesh && mesh.isSkinnedMesh && child.userData['suitGear'] !== true) {
      seen.add(material);
      material.dispose();
    }
  });
};
