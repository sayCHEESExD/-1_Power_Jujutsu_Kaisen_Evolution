import { BAG_SIZE, BAG_TIERS, type BagPlacement, type BagTier } from '@jjk/shared';
import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  type Material,
  type Texture,
} from 'three';
import { fxTexture, type FxTexture } from '../combat/fxTextures.js';
import { PartBuilder } from '../render/PartBuilder.js';

/**
 * THE TRAINING BAGS, six kinds, each burning with more cursed energy than the
 * one before:
 *
 *   Bronze  plain tan leather - the bag every sorcerer starts on
 *   Green   a green glow round its base, a few motes rising
 *   Red     red wisps licking up its sides
 *   Pink    a pink shell of energy and sparkles
 *   Gold    a golden radiance, stars circling it, a gilded frame
 *   Lava    black rock split with glowing magma, flames pouring off it
 *
 * Every bag hangs from a gallows post behind it, over a glowing mat in its
 * tier's colour where the trainee stands; a punch (anybody's) swings it on its
 * chain. Built in a LOCAL frame with the mat toward +X; the placement's
 * `facing` turns it. Leather is a small canvas per tier, shared.
 */

const S = BAG_SIZE;
const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** The crest stitched on each tier's bag. */
const CREST = ['力', '気', '呪', '術', '金', '炎'] as const;

const leathers = new Map<number, Texture>();
const glows = new Map<number, Texture>();

/** One tier's leather: stitched panels, darker straps top and bottom, a white crest with its kanji. */
const leatherTexture = (tier: BagTier): Texture => {
  const cached = leathers.get(tier.tier);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const lava = tier.tier === 5;
  ctx.fillStyle = css(tier.color);
  ctx.fillRect(0, 0, 256, 256);
  // Panels: a subtle light-dark gradient across each, seams between.
  for (let x = 0; x < 256; x += 64) {
    const g = ctx.createLinearGradient(x, 0, x + 64, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.18)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 64, 256);
    ctx.strokeStyle = css(tier.trim);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 2, 0);
    ctx.lineTo(x + 2, 256);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (lava) {
    // Black rock, split with magma.
    ctx.fillStyle = 'rgba(20,8,6,0.75)';
    ctx.fillRect(0, 0, 256, 256);
    ctx.lineCap = 'round';
    for (let i = 0; i < 16; i += 1) {
      ctx.strokeStyle = i % 3 ? '#ff6a1c' : '#ffd23a';
      ctx.lineWidth = 3 + (i % 4);
      ctx.beginPath();
      let x = (i * 53) % 256;
      let y = (i * 97) % 256;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k += 1) {
        x += Math.sin(i * 3 + k) * 34;
        y += Math.cos(i * 2 + k * 1.7) * 34;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  // The straps.
  for (const y of [0, 226]) {
    ctx.fillStyle = css(tier.trim);
    ctx.fillRect(0, y, 256, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, y + 4, 256, 4);
  }
  // The crest, twice round the bag so it reads from any side.
  for (const cx of [64, 192]) {
    ctx.fillStyle = lava ? '#2a0a04' : '#f8f4ea';
    ctx.beginPath();
    ctx.arc(cx, 128, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = css(tier.trim);
    ctx.stroke();
    ctx.fillStyle = lava ? '#ffb03a' : css(tier.tier === 0 ? 0x6a3a14 : tier.color);
    ctx.font = '700 46px "Yu Gothic", "Hiragino Sans", "Noto Sans CJK JP", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CREST[tier.tier] ?? '力', cx, 131);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  leathers.set(tier.tier, texture);
  return texture;
};

/** The Lava bag's light: only its magma cracks shine. */
const lavaGlow = (tier: BagTier): Texture => {
  const cached = glows.get(tier.tier);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 256, 256);
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i += 1) {
    ctx.strokeStyle = i % 3 ? '#ff6a1c' : '#ffd23a';
    ctx.lineWidth = 3 + (i % 4);
    ctx.beginPath();
    let x = (i * 53) % 256;
    let y = (i * 97) % 256;
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k += 1) {
      x += Math.sin(i * 3 + k) * 34;
      y += Math.cos(i * 2 + k * 1.7) * 34;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  glows.set(tier.tier, texture);
  return texture;
};

const bagMaterials = new Map<number, MeshLambertMaterial>();
const bagMaterial = (tier: BagTier): MeshLambertMaterial => {
  let material = bagMaterials.get(tier.tier);
  if (!material) {
    const lava = tier.tier === 5;
    material = new MeshLambertMaterial({
      map: leatherTexture(tier),
      emissive: lava ? 0xffffff : tier.tier >= 3 ? tier.glow : 0x000000,
      emissiveMap: lava ? lavaGlow(tier) : null,
      emissiveIntensity: lava ? 1.3 : tier.tier >= 3 ? 0.12 : 0,
    });
    bagMaterials.set(tier.tier, material);
  }
  return material;
};

const bagBody = new CylinderGeometry(S.radius, S.radius, S.length, 18, 1, true);
const bagCap = new SphereGeometry(S.radius, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const matRing = new RingGeometry(0.72, 1, 32);

interface Mote {
  readonly sprite: Sprite;
  readonly material: SpriteMaterial;
  phase: number;
  readonly angle: number;
  readonly orbit: boolean;
}

/** One bag in the world: its frame (static), the swinging bag and its energy. */
export class BagVisual {
  readonly root = new Group();
  private readonly swing = new Group();
  private readonly motes: Mote[] = [];
  private readonly materials: Material[] = [];
  private readonly shell: Sprite | null = null;
  private readonly matGlow: Mesh;
  private time = Math.random() * 10;
  private sway = 0;
  private swayVelocity = 0;
  private flare = 0;

  constructor(readonly placement: BagPlacement) {
    const tier = BAG_TIERS[placement.tier]!;
    const t = tier.tier;
    this.root.position.set(placement.x, placement.floor, placement.z);
    // Local +X is the mat side: turn so it faces `facing`.
    this.root.rotation.y = placement.facing === 1 ? 0 : Math.PI;

    const frame = new PartBuilder();
    const post = t >= 4 ? (t === 5 ? 0x2a1410 : 0xd8a830) : 0x4a3a2a;
    const postKind = t >= 4 ? 'smooth' : 'stud';
    // The gallows: a post behind the bag, an arm over it, a base plate.
    frame.box(0.5, S.top + 0.9, 0.5, post, postKind, { x: -1.6, y: (S.top + 0.9) / 2 });
    frame.box(1.95, 0.4, 0.4, post, postKind, { x: -0.72, y: S.top + 0.75 });
    frame.box(1.4, 0.2, 1.4, 0x2a2a30, 'smooth', { x: -1.6, y: 0.1 });
    frame.add(new CylinderGeometry(0.05, 0.05, 0.5, 6), 0x9aa0ac, 'smooth', { y: S.top + 0.3 });
    if (t >= 2) frame.box(0.56, 0.18, 0.56, tier.glow, 'glow', { x: -1.6, y: S.top + 1.0 });
    if (t >= 4) {
      // A gilded (or molten) crown on the post, and talisman strips hanging from the arm.
      frame.add(new SphereGeometry(0.34, 10, 8), tier.glow, 'glow', { x: -1.6, y: S.top + 1.3 });
    }
    for (const dz of t >= 1 ? [-0.3, 0.3] : []) frame.box(0.14, 0.9, 0.02, 0xf4ecd8, 'smooth', { x: -1.1, y: S.top + 0.15, z: dz });
    const frameMesh = frame.build(`bag-frame-${t}`, true);
    this.root.add(frameMesh);

    // The mat: a dark pad ringed in the tier's colour.
    const matCentre = (S.matNear + S.matFar) / 2;
    const pad = new PartBuilder();
    pad.box(S.matFar - S.matNear + 0.4, 0.05, S.matHalf * 2, 0x1c1c26, 'smooth', { x: matCentre, y: 0.06 });
    pad.box(S.matFar - S.matNear + 0.4, 0.06, 0.16, tier.glow, 'glow', { x: matCentre, y: 0.07, z: S.matHalf });
    pad.box(S.matFar - S.matNear + 0.4, 0.06, 0.16, tier.glow, 'glow', { x: matCentre, y: 0.07, z: -S.matHalf });
    this.root.add(pad.build(`bag-mat-${t}`, false));
    const glowMaterial = this.track(new MeshBasicMaterial({ color: tier.glow, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    this.matGlow = new Mesh(matRing, glowMaterial);
    this.matGlow.rotation.x = -Math.PI / 2;
    this.matGlow.position.set(matCentre, 0.12, 0);
    this.matGlow.scale.setScalar(1.3);
    this.root.add(this.matGlow);

    // The bag, swinging from its hook.
    this.swing.position.y = S.top;
    this.root.add(this.swing);
    const material = bagMaterial(tier);
    const body = new Mesh(bagBody, material);
    body.position.y = -S.length / 2 - 0.15;
    body.castShadow = true;
    this.swing.add(body);
    const top = new Mesh(bagCap, material);
    top.position.y = -0.15;
    this.swing.add(top);
    const bottom = new Mesh(bagCap, material);
    bottom.rotation.x = Math.PI;
    bottom.position.y = -S.length - 0.15;
    this.swing.add(bottom);
    if (t >= 3) {
      const band = new Mesh(new TorusGeometry(S.radius + 0.03, 0.06, 6, 24), this.track(new MeshBasicMaterial({ color: tier.glow })));
      band.rotation.x = Math.PI / 2;
      band.position.y = -S.length * 0.5 - 0.15;
      this.swing.add(band);
    }

    // The energy: nothing on Bronze, more on every tier after it.
    const energy: readonly [FxTexture, number, boolean][] =
      t === 1 ? [['flash', 3, false]]
      : t === 2 ? [['flame', 4, false]]
      : t === 3 ? [['star', 4, true], ['flame', 3, false]]
      : t === 4 ? [['star', 6, true], ['flame', 4, false]]
      : t === 5 ? [['flame', 8, false], ['flash', 4, false]]
      : [];
    for (const [texture, count, orbit] of energy) {
      for (let i = 0; i < count; i += 1) {
        const m = this.track(new SpriteMaterial({ map: fxTexture(texture), color: texture === 'flash' && t === 5 ? 0xffd23a : tier.glow, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 }));
        const sprite = new Sprite(m);
        this.root.add(sprite);
        this.motes.push({ sprite, material: m, phase: i / count, angle: (i / count) * Math.PI * 2, orbit });
      }
    }
    if (t >= 3) {
      const m = this.track(new SpriteMaterial({ map: fxTexture('aura'), color: tier.glow, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.4 }));
      this.shell = new Sprite(m);
      this.shell.position.y = S.top - S.length / 2;
      this.shell.scale.set(2.6, 4.6, 1);
      this.root.add(this.shell);
    }
  }

  private track<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  /** A punch landed: the bag swings back off it and the energy flares. */
  hit(strength = 1): void {
    this.swayVelocity -= 2.2 * strength;
    this.flare = 1;
  }

  update(delta: number): void {
    const dt = Math.min(0.1, Math.max(0, delta));
    this.time += dt;
    // A damped pendulum on its chain.
    this.swayVelocity += (-this.sway * 26 - this.swayVelocity * 3.2) * dt;
    this.sway += this.swayVelocity * dt;
    this.swing.rotation.z = this.sway * 0.35;
    this.flare = Math.max(0, this.flare - dt * 2.5);
    const level = 0.45 + this.flare * 0.55;
    (this.matGlow.material as MeshBasicMaterial).opacity = 0.25 + this.flare * 0.5 + Math.sin(this.time * 3) * 0.06;
    this.matGlow.rotation.z = this.time * 0.6;
    if (this.shell) {
      const flicker = 1 + Math.sin(this.time * 13) * 0.05;
      this.shell.scale.set(2.6 * flicker * (1 + this.flare * 0.2), 4.6 * (2 - flicker), 1);
      (this.shell.material as SpriteMaterial).opacity = 0.3 + this.flare * 0.5;
    }
    const centreY = S.top - S.length / 2 - 0.15;
    for (const mote of this.motes) {
      mote.phase = (mote.phase + dt * (mote.orbit ? 0.25 : 0.7)) % 1;
      const p = mote.phase;
      if (mote.orbit) {
        const a = mote.angle + this.time * 1.4;
        mote.sprite.position.set(Math.cos(a) * 1.4, centreY + Math.sin(a * 2) * 1.2, Math.sin(a) * 1.4);
        mote.sprite.scale.setScalar(0.42);
        mote.material.opacity = level;
      } else {
        const a = mote.angle + this.time * 0.5;
        mote.sprite.position.set(Math.cos(a) * 0.95, centreY - S.length / 2 + p * (S.length + 1.2), Math.sin(a) * 0.95);
        mote.sprite.scale.set(0.5, 0.75, 1);
        mote.material.opacity = level * Math.sin(p * Math.PI);
      }
    }
  }

  dispose(): void {
    for (const material of this.materials) material.dispose();
    this.root.removeFromParent();
  }
}

/** The CSS colour of a tier, for the HUD chip and the labels. */
export const tierCss = (tier: number): string => css(BAG_TIERS[tier]?.glow ?? 0xffffff);

/** Every bag on screen, by its id in BAGS, so a punch can swing the right one. */
const registry = new Map<number, BagVisual>();
export const bagVisuals = {
  add(visual: BagVisual): void {
    registry.set(visual.placement.id, visual);
  },
  remove(visual: BagVisual): void {
    if (registry.get(visual.placement.id) === visual) registry.delete(visual.placement.id);
  },
  hit(id: number, strength = 1): void {
    registry.get(id)?.hit(strength);
  },
};
