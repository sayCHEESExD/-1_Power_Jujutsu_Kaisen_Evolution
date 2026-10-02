import { AURAS } from '@jjk/shared';
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  type Blending,
  type Material,
} from 'three';
import { fxTexture, type FxTexture } from '../combat/fxTextures.js';
import type { AuraStyle } from './JjkCharacters.js';

/**
 * AURAS: the cursed technique a player wears as a shell of energy, built from
 * nothing but a few sprites and simple shapes - no texture files, no
 * particles systems, nothing allocated after it is built.
 *
 * Every aura is a RECIPE of parts:
 *
 *   shell    the flickering silhouette of energy behind the body
 *   motes    small sprites that rise or orbit and loop
 *   rings    tori spinning round the body (Limitless' infinity, the shrine's wheel)
 *   pool     a disc on the ground under the feet (shadows, blood, magma)
 *   orbs     glowing spheres circling (blood droplets, Hollow Purple's red and blue)
 *   bolts    lightning shards that flicker on and off (Black Flash, Heavenly Restriction)
 *   halo     Mahoraga's eight-spoked wheel over the head
 *
 * and each of the fifteen adds more of them, in stronger colours, than the one
 * before it. An aura burns faintly at rest, FLARES on every punch and in the
 * still power stance, and is hidden far from the camera by its owner.
 */

type Motion = 'rise' | 'orbit' | 'swirl' | 'burst';

interface MoteSpec {
  readonly count: number;
  readonly texture: FxTexture;
  readonly color: number;
  readonly size: number;
  readonly motion: Motion;
  readonly speed: number;
  readonly radius?: number;
  readonly dark?: boolean;
}

interface Recipe {
  readonly color: number;
  readonly shell: { readonly color: number; readonly scale: number; readonly dark?: boolean; readonly texture?: FxTexture } | null;
  readonly motes: readonly MoteSpec[];
  readonly rings?: readonly { readonly color: number; readonly radius: number; readonly tilt: number; readonly speed: number; readonly y: number }[];
  readonly pool?: { readonly color: number; readonly radius: number; readonly dark?: boolean };
  readonly orbs?: { readonly colors: readonly number[]; readonly count: number; readonly radius: number; readonly size: number; readonly speed: number; readonly y: number };
  readonly bolts?: { readonly color: number; readonly count: number; readonly size: number };
  readonly halo?: { readonly color: number };
  /** How strongly it burns at rest, 0..1. */
  readonly rest: number;
}

const RECIPES: Readonly<Record<number, Recipe>> = {
  // 1 CURSED ENERGY: a plain violet flicker - the first spark of power.
  1: {
    color: 0x8a6aff,
    rest: 0.32,
    shell: { color: 0x7a5aff, scale: 1 },
    motes: [{ count: 3, texture: 'flame', color: 0xa88aff, size: 0.6, motion: 'rise', speed: 0.9 }],
  },
  // 2 DIVERGENCE: blue energy that lands twice - two shells, one a beat behind.
  2: {
    color: 0x3a8aff,
    rest: 0.36,
    shell: { color: 0x3a8aff, scale: 1.05 },
    motes: [
      { count: 4, texture: 'flame', color: 0x6ab8ff, size: 0.62, motion: 'rise', speed: 1.1 },
      { count: 3, texture: 'ring', color: 0xb8e8ff, size: 0.9, motion: 'burst', speed: 1.2 },
    ],
  },
  // 3 TEN SHADOWS: a pool of shadow underfoot and dark wisps rising out of it.
  3: {
    color: 0x6a5aff,
    rest: 0.42,
    shell: { color: 0x14102a, scale: 1.05, dark: true, texture: 'smoke' },
    pool: { color: 0x05040a, radius: 1.8, dark: true },
    motes: [
      { count: 5, texture: 'smoke', color: 0x1a1430, size: 1.1, motion: 'rise', speed: 0.7, dark: true },
      { count: 2, texture: 'flash', color: 0x6a5aff, size: 0.35, motion: 'orbit', speed: 1.4, radius: 0.9 },
    ],
  },
  // 4 BLACK FLASH: red lightning cracking black round the body.
  4: {
    color: 0xff1a2a,
    rest: 0.45,
    shell: { color: 0xff1a2a, scale: 1.1 },
    bolts: { color: 0xff2a3a, count: 4, size: 0.9 },
    motes: [
      { count: 4, texture: 'shard', color: 0x14080c, size: 0.55, motion: 'swirl', speed: 2.4, dark: true },
      { count: 3, texture: 'star', color: 0xff5a5a, size: 0.5, motion: 'burst', speed: 1.8 },
    ],
  },
  // 5 BLOOD MANIPULATION: droplets of blood circling, a red pool, a crimson haze.
  5: {
    color: 0xd0101c,
    rest: 0.45,
    shell: { color: 0xc8101c, scale: 1.1 },
    pool: { color: 0x8a0a10, radius: 1.6 },
    orbs: { colors: [0xd0101c, 0xff3a4a], count: 6, radius: 1.15, size: 0.13, speed: 1.6, y: 1.5 },
    motes: [{ count: 4, texture: 'flame', color: 0xff3a4a, size: 0.55, motion: 'rise', speed: 1.1 }],
  },
  // 6 DISASTER FLAMES: Jogo's fire - a tall blaze, embers, a ring of fire at the feet.
  6: {
    color: 0xff5a1a,
    rest: 0.5,
    shell: { color: 0xff5a1a, scale: 1.25 },
    pool: { color: 0xff6a1c, radius: 1.5 },
    rings: [{ color: 0xffa83a, radius: 1.35, tilt: Math.PI / 2, speed: 1.2, y: 0.08 }],
    motes: [
      { count: 6, texture: 'flame', color: 0xffa83a, size: 0.85, motion: 'rise', speed: 1.4 },
      { count: 4, texture: 'flash', color: 0xffd23a, size: 0.3, motion: 'rise', speed: 2.2 },
    ],
  },
  // 7 TRUE BLACK FLASH: black-cored, red-rimmed, lightning everywhere and a shockwave that keeps landing.
  7: {
    color: 0xff2a3a,
    rest: 0.55,
    shell: { color: 0x2a0408, scale: 1.25, dark: true },
    bolts: { color: 0xff1a2a, count: 7, size: 1.2 },
    motes: [
      { count: 3, texture: 'ring', color: 0xff2a3a, size: 1.4, motion: 'burst', speed: 1.4 },
      { count: 5, texture: 'shard', color: 0x000000, size: 0.6, motion: 'swirl', speed: 3, dark: true },
      { count: 3, texture: 'lines', color: 0xff5a5a, size: 1.6, motion: 'burst', speed: 1.1 },
    ],
  },
  // 8 DIVINE GENERAL: Mahoraga's wheel turning over the head, a white-gold radiance.
  8: {
    color: 0xfff2c8,
    rest: 0.55,
    shell: { color: 0xfff2c8, scale: 1.2 },
    halo: { color: 0xffd23a },
    motes: [
      { count: 6, texture: 'star', color: 0xffffff, size: 0.45, motion: 'orbit', speed: 1.1, radius: 1.2 },
      { count: 3, texture: 'flame', color: 0xffe8a8, size: 0.7, motion: 'rise', speed: 1 },
    ],
  },
  // 9 DIVINE FLAME: Fuga's arrow of fire - a vortex of flame and a burning ring that tilts as it spins.
  9: {
    color: 0xff8a1a,
    rest: 0.6,
    shell: { color: 0xff7a1a, scale: 1.35 },
    rings: [
      { color: 0xffd23a, radius: 1.3, tilt: 1.2, speed: 2, y: 1.6 },
      { color: 0xff5a1a, radius: 1.6, tilt: Math.PI / 2, speed: -1.4, y: 0.1 },
    ],
    pool: { color: 0xff8a1a, radius: 1.9 },
    motes: [
      { count: 8, texture: 'flame', color: 0xffa83a, size: 0.95, motion: 'swirl', speed: 1.8 },
      { count: 4, texture: 'flash', color: 0xfff27a, size: 0.35, motion: 'rise', speed: 2.6 },
    ],
  },
  // 10 LIMITLESS: Infinity - three rings like a gyroscope, blue-white, stars caught in it.
  10: {
    color: 0x5ad8ff,
    rest: 0.6,
    shell: { color: 0x5ad8ff, scale: 1.3 },
    rings: [
      { color: 0x8ae8ff, radius: 1.4, tilt: 0.3, speed: 1.6, y: 1.6 },
      { color: 0xffffff, radius: 1.55, tilt: 1.3, speed: -1.2, y: 1.6 },
      { color: 0x3a8aff, radius: 1.7, tilt: Math.PI / 2, speed: 0.8, y: 1.6 },
    ],
    motes: [
      { count: 8, texture: 'star', color: 0xc8f4ff, size: 0.4, motion: 'orbit', speed: 1.3, radius: 1.5 },
      { count: 2, texture: 'swirl', color: 0x8ae8ff, size: 1.6, motion: 'burst', speed: 0.8 },
    ],
  },
  // 11 MALEVOLENT SHRINE: Sukuna's domain - a blood-red seal on the ground and slashes flying round.
  11: {
    color: 0xff1a2a,
    rest: 0.65,
    shell: { color: 0x3a0408, scale: 1.4, dark: true },
    pool: { color: 0xd0101c, radius: 2.4 },
    rings: [{ color: 0xff1a2a, radius: 2.1, tilt: Math.PI / 2, speed: 0.6, y: 0.06 }],
    motes: [
      { count: 7, texture: 'crescent', color: 0xff3a4a, size: 1.1, motion: 'swirl', speed: 2.6 },
      { count: 5, texture: 'flame', color: 0xd0101c, size: 0.9, motion: 'rise', speed: 1.3 },
    ],
    bolts: { color: 0xffffff, count: 3, size: 0.8 },
  },
  // 12 UNLIMITED VOID: a galaxy turning round the body, the void behind it.
  12: {
    color: 0x8ae8ff,
    rest: 0.7,
    shell: { color: 0x0a0a2a, scale: 1.45, dark: true },
    rings: [
      { color: 0x8ae8ff, radius: 2.0, tilt: 1.35, speed: 0.7, y: 1.6 },
      { color: 0xb88aff, radius: 2.3, tilt: 1.15, speed: -0.5, y: 1.6 },
    ],
    pool: { color: 0x2a0a5a, radius: 2.2 },
    motes: [
      { count: 12, texture: 'star', color: 0xffffff, size: 0.35, motion: 'orbit', speed: 0.9, radius: 2.1 },
      { count: 3, texture: 'swirl', color: 0x8ae8ff, size: 2.2, motion: 'burst', speed: 0.6 },
    ],
  },
  // 13 CHIMERA SHADOW: the garden of shadows - a wide black pool, tendrils and eyes in the dark.
  13: {
    color: 0x9a7aff,
    rest: 0.7,
    shell: { color: 0x0a0618, scale: 1.5, dark: true, texture: 'smoke' },
    pool: { color: 0x020104, radius: 2.8, dark: true },
    orbs: { colors: [0xf2f2ff, 0x9a7aff], count: 6, radius: 1.9, size: 0.08, speed: 0.5, y: 0.9 },
    motes: [
      { count: 8, texture: 'smoke', color: 0x120a24, size: 1.5, motion: 'rise', speed: 0.8, dark: true },
      { count: 4, texture: 'shard', color: 0x2a1a5a, size: 1.1, motion: 'rise', speed: 1.3, dark: true },
    ],
  },
  // 14 FLOW PURPLE: Hollow Purple - red and blue orbs circling and meeting in a purple core.
  14: {
    color: 0xb83aff,
    rest: 0.75,
    shell: { color: 0xb83aff, scale: 1.55 },
    orbs: { colors: [0xff2a3a, 0x3a8aff, 0xc85aff], count: 3, radius: 1.45, size: 0.32, speed: 2.2, y: 2.2 },
    rings: [
      { color: 0xff5ae8, radius: 1.8, tilt: 1.0, speed: 1.6, y: 1.8 },
      { color: 0x8a3aff, radius: 2.1, tilt: Math.PI / 2, speed: -1, y: 0.1 },
    ],
    motes: [
      { count: 8, texture: 'swirl', color: 0xd88aff, size: 0.8, motion: 'swirl', speed: 2 },
      { count: 3, texture: 'ring', color: 0xff5ae8, size: 2.2, motion: 'burst', speed: 0.9 },
    ],
  },
  // 15 HEAVENLY RESTRICTIONS: a body beyond cursed energy - white lightning, wind lines, the ground cracking.
  15: {
    color: 0xe8ffe8,
    rest: 0.8,
    shell: { color: 0xe8ffef, scale: 1.6 },
    bolts: { color: 0x9affc8, count: 9, size: 1.4 },
    pool: { color: 0x6aff9a, radius: 2.4 },
    rings: [
      { color: 0xffffff, radius: 1.6, tilt: Math.PI / 2, speed: 2.4, y: 0.1 },
      { color: 0x6aff9a, radius: 2.2, tilt: Math.PI / 2, speed: -1.8, y: 0.12 },
    ],
    motes: [
      { count: 6, texture: 'lines', color: 0xffffff, size: 2.4, motion: 'burst', speed: 1.4 },
      { count: 10, texture: 'star', color: 0xc8ffd8, size: 0.4, motion: 'swirl', speed: 2.6 },
    ],
  },
};

/** A character's own signature energy (the strongest four), lighter than any bought aura. */
const signatureRecipe = (color: number, style: AuraStyle): Recipe => ({
  color,
  rest: 0.3,
  shell: { color: style === 'dark' ? 0x0a1418 : color, scale: 1, dark: style === 'dark' },
  bolts: style === 'lightning' ? { color, count: 3, size: 0.7 } : undefined,
  motes: [
    {
      count: 3,
      texture: style === 'flame' ? 'flame' : style === 'lightning' ? 'shard' : style === 'dark' ? 'smoke' : 'star',
      color: style === 'dark' ? 0x14242a : color,
      size: style === 'flame' ? 0.8 : style === 'dark' ? 1.1 : 0.5,
      motion: style === 'sparkle' ? 'orbit' : 'rise',
      speed: 1,
      radius: 0.9,
      dark: style === 'dark',
    },
  ],
});

interface Mote {
  readonly sprite: Sprite;
  readonly material: SpriteMaterial;
  readonly spec: MoteSpec;
  phase: number;
  readonly angle: number;
}

interface Spinner {
  readonly mesh: Mesh;
  readonly speed: number;
}

const torus = new Map<number, TorusGeometry>();
const sphere = new SphereGeometry(1, 10, 8);
const disc = new CircleGeometry(1, 32);
const ringGeometry = new RingGeometry(0.62, 1, 40);

const blendOf = (dark: boolean | undefined): Blending => (dark ? NormalBlending : AdditiveBlending);

export class AuraFx {
  readonly root = new Group();
  private readonly recipe: Recipe;
  private readonly shell: Sprite | null = null;
  private readonly shellMaterial: SpriteMaterial | null = null;
  private readonly motes: Mote[] = [];
  private readonly spinners: Spinner[] = [];
  private readonly orbs: Mesh[] = [];
  private readonly bolts: Sprite[] = [];
  private readonly pool: Mesh | null = null;
  private readonly materials: Material[] = [];
  private readonly halo: Group | null = null;
  private time = Math.random() * 10;
  private flare = 0;
  private readonly base: Color;

  private constructor(recipe: Recipe, private readonly height: number) {
    this.recipe = recipe;
    this.base = new Color(recipe.color);
    if (recipe.shell) {
      this.shellMaterial = this.track(
        new SpriteMaterial({ map: fxTexture(recipe.shell.texture ?? 'aura'), color: recipe.shell.color, transparent: true, depthWrite: false, blending: blendOf(recipe.shell.dark), opacity: 0 }),
      );
      this.shell = new Sprite(this.shellMaterial);
      this.shell.position.y = height * 0.52;
      this.root.add(this.shell);
    }
    if (recipe.pool) {
      const material = this.track(new MeshBasicMaterial({ color: recipe.pool.color, transparent: true, depthWrite: false, opacity: 0, blending: blendOf(recipe.pool.dark), side: DoubleSide }));
      const pool = new Mesh(recipe.pool.dark ? disc : ringGeometry, material);
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.06;
      pool.scale.setScalar(recipe.pool.radius);
      pool.renderOrder = 1;
      this.root.add(pool);
      this.pool = pool;
    }
    for (const ring of recipe.rings ?? []) {
      let geometry = torus.get(ring.radius);
      if (!geometry) {
        geometry = new TorusGeometry(ring.radius, 0.035, 5, 48);
        torus.set(ring.radius, geometry);
      }
      const material = this.track(new MeshBasicMaterial({ color: ring.color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
      const holder = new Group();
      holder.position.y = ring.y;
      holder.rotation.x = ring.tilt;
      const mesh = new Mesh(geometry, material);
      holder.add(mesh);
      this.root.add(holder);
      this.spinners.push({ mesh, speed: ring.speed });
    }
    if (recipe.orbs) {
      for (let i = 0; i < recipe.orbs.count; i += 1) {
        const color = recipe.orbs.colors[i % recipe.orbs.colors.length]!;
        const material = this.track(new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
        const orb = new Mesh(sphere, material);
        orb.scale.setScalar(recipe.orbs.size);
        this.root.add(orb);
        this.orbs.push(orb);
      }
    }
    if (recipe.bolts) {
      for (let i = 0; i < recipe.bolts.count; i += 1) {
        const material = this.track(new SpriteMaterial({ map: fxTexture('shard'), color: recipe.bolts.color, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 }));
        const bolt = new Sprite(material);
        bolt.scale.set(recipe.bolts.size * 0.35, recipe.bolts.size, 1);
        this.root.add(bolt);
        this.bolts.push(bolt);
      }
    }
    if (recipe.halo) {
      // Mahoraga's wheel: a rim, eight spokes and their knobs, flat over the head.
      const halo = new Group();
      const material = this.track(new MeshBasicMaterial({ color: recipe.halo.color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
      const rim = new Mesh(new TorusGeometry(0.62, 0.05, 5, 32), material);
      rim.rotation.x = Math.PI / 2;
      halo.add(rim);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const spoke = new Mesh(sphere, material);
        spoke.scale.set(0.035, 0.035, 0.62);
        spoke.position.set(Math.sin(a) * 0.31, 0, Math.cos(a) * 0.31);
        spoke.rotation.y = a;
        halo.add(spoke);
        const knob = new Mesh(sphere, material);
        knob.scale.setScalar(0.1);
        knob.position.set(Math.sin(a) * 0.72, 0, Math.cos(a) * 0.72);
        halo.add(knob);
      }
      halo.position.y = height + 0.55;
      this.root.add(halo);
      this.halo = halo;
    }
    for (const spec of recipe.motes) {
      for (let i = 0; i < spec.count; i += 1) {
        const material = this.track(new SpriteMaterial({ map: fxTexture(spec.texture), color: spec.color, transparent: true, depthWrite: false, blending: blendOf(spec.dark), opacity: 0 }));
        const sprite = new Sprite(material);
        this.root.add(sprite);
        this.motes.push({ sprite, material, spec, phase: i / spec.count, angle: (i / spec.count) * Math.PI * 2 + Math.random() * 0.4 });
      }
    }
  }

  /** The aura of a bought aura id, or null for none. */
  static forAura(id: number, height: number): AuraFx | null {
    const recipe = RECIPES[id];
    return recipe ? new AuraFx(recipe, height) : null;
  }

  /** A character's own signature energy. */
  static forSignature(color: number, style: AuraStyle, height: number): AuraFx {
    return new AuraFx(signatureRecipe(color, style), height);
  }

  /** The colour an aura's energy shows in punch effects. */
  static colorOf(id: number): number {
    return RECIPES[id]?.color ?? AURAS[0]!.color;
  }

  private track<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  /** Flare the aura up (a punch, a level up); it eases back down by itself. */
  pulse(amount = 1): void {
    this.flare = Math.max(this.flare, amount);
  }

  update(delta: number, stance: number): void {
    this.time += delta;
    this.flare = Math.max(0, this.flare - delta * 1.6);
    const r = this.recipe;
    const level = Math.min(1, r.rest + Math.max(this.flare, stance) * (1 - r.rest));
    const h = this.height;
    const t = this.time;

    if (this.shell && this.shellMaterial && r.shell) {
      const flicker = 1 + Math.sin(t * 17) * 0.04 + Math.sin(t * 29) * 0.03;
      const s = r.shell.scale;
      this.shell.scale.set(h * 0.85 * s * flicker * (0.9 + level * 0.2), h * 1.3 * s * (0.95 + level * 0.15) * (2 - flicker), 1);
      this.shellMaterial.opacity = level * (r.shell.dark ? 0.6 : 0.75);
    }
    if (this.pool) {
      (this.pool.material as MeshBasicMaterial).opacity = level * (r.pool?.dark ? 0.75 : 0.45);
      this.pool.rotation.z = t * 0.4;
      const pulse = 1 + Math.sin(t * 3) * 0.04;
      this.pool.scale.setScalar((r.pool?.radius ?? 1) * pulse * (0.85 + level * 0.25));
    }
    for (const spinner of this.spinners) {
      spinner.mesh.rotation.z = t * spinner.speed;
      (spinner.mesh.material as MeshBasicMaterial).opacity = level * 0.85;
    }
    if (r.orbs) {
      this.orbs.forEach((orb, i) => {
        const o = r.orbs!;
        const a = t * o.speed + (i / this.orbs.length) * Math.PI * 2;
        // Hollow Purple's red and blue close in on the purple core as the aura flares.
        const radius = o.radius * (this.orbs.length === 3 && i < 2 ? 1 - level * 0.35 : 1);
        orb.position.set(Math.cos(a) * radius, o.y + Math.sin(t * 2 + i) * 0.15, Math.sin(a) * radius);
        if (this.orbs.length === 3 && i === 2) orb.position.set(0, o.y + 0.5, 0);
        (orb.material as MeshBasicMaterial).opacity = level;
        orb.scale.setScalar(o.size * (0.85 + level * 0.3) * (this.orbs.length === 3 && i === 2 ? 0.6 + level * 0.8 : 1));
      });
    }
    this.bolts.forEach((bolt, i) => {
      // Lightning: each bolt jumps to a new spot round the body every few frames, on for a flash.
      const slot = Math.floor(t * 9 + i * 1.7);
      const seed = Math.sin(slot * 12.9898 + i * 78.233) * 43758.5453;
      const rnd = seed - Math.floor(seed);
      const on = rnd > 0.45;
      const a = rnd * Math.PI * 2;
      bolt.position.set(Math.cos(a) * 0.75, 0.4 + rnd * h * 0.95, Math.sin(a) * 0.75);
      (bolt.material as SpriteMaterial).rotation = rnd * 6;
      (bolt.material as SpriteMaterial).opacity = on ? level : 0;
    });
    if (this.halo) {
      this.halo.rotation.y = t * 0.8;
      this.halo.position.y = h + 0.55 + Math.sin(t * 2) * 0.06;
      this.halo.traverse((child) => {
        const mesh = child as Mesh;
        if (mesh.isMesh) (mesh.material as MeshBasicMaterial).opacity = 0.35 + level * 0.65;
      });
    }
    for (const mote of this.motes) {
      const spec = mote.spec;
      mote.phase = (mote.phase + delta * spec.speed * 0.6) % 1;
      const p = mote.phase;
      const radius = spec.radius ?? 0.75;
      let size = spec.size;
      let alpha = Math.sin(p * Math.PI);
      switch (spec.motion) {
        case 'rise': {
          const a = mote.angle + t * 0.4;
          const rr = radius * (0.85 + Math.sin(mote.angle + t) * 0.15);
          mote.sprite.position.set(Math.cos(a) * rr, 0.2 + p * h * 1.05, Math.sin(a) * rr);
          break;
        }
        case 'orbit': {
          const a = mote.angle + t * spec.speed;
          mote.sprite.position.set(Math.cos(a) * radius, h * 0.55 + Math.sin(a * 2 + mote.angle) * h * 0.3, Math.sin(a) * radius);
          alpha = 0.8;
          break;
        }
        case 'swirl': {
          const a = mote.angle + p * Math.PI * 4;
          const rr = radius * (1.2 - p * 0.6);
          mote.sprite.position.set(Math.cos(a) * rr, 0.2 + p * h * 1.1, Math.sin(a) * rr);
          mote.material.rotation = a;
          break;
        }
        case 'burst': {
          // A ring of energy blooming outward from the chest, again and again.
          mote.sprite.position.set(0, h * 0.5, 0);
          size = spec.size * (0.3 + p * 1.5);
          alpha = (1 - p) * 0.9;
          mote.material.rotation = mote.angle;
          break;
        }
      }
      mote.sprite.scale.set(size, size * (spec.texture === 'flame' ? 1.4 : 1), 1);
      mote.material.opacity = level * alpha;
    }
  }

  dispose(): void {
    for (const material of this.materials) material.dispose();
    this.root.removeFromParent();
  }
}
