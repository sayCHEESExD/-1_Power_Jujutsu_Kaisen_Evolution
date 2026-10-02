import {
  BAGS,
  BAG_TIERS,
  BOOTHS,
  BOOTH_HALF,
  CHARACTERS,
  CHARACTER_PADS,
  CHARACTER_STAND,
  HUB,
  HUB_WALL_DEPTH,
  PORTAL,
  PVP,
  PVP_ARENA,
  PVP_GATE,
  PVP_POSTS,
  SPAWN,
  TRAINING_ZONE,
  canEnterPvp,
  canUseBag,
  characterUnlocked,
  formatAmount,
  formatWins,
} from '@jjk/shared';
import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  type Material,
  type Object3D,
  type Vector3,
} from 'three';
import { createAnimationInput } from '../animation/AnimationInput.js';
import { PlayerAnimator } from '../animation/PlayerAnimator.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { AuraFx } from '../characters/AuraFx.js';
import { STATUE_LOOKS, characterLook } from '../characters/JjkCharacters.js';
import { PartBuilder } from '../render/PartBuilder.js';
import { createPaintedBody } from '../suits/SuitBody.js';
import { BagVisual, bagVisuals, tierCss } from './Bags.js';
import { CanvasSign } from './CanvasSign.js';
import { brazier, groundRing, paperLantern, shade, talisman, torii } from './JjkProps.js';
import { LabelSprite, rebirthIcon, trophyIcon } from './LabelSprite.js';
import { Scoreboard } from './Scoreboard.js';
import { worldTextures } from './WorldTextures.js';

/** The hall's palette: the reference's blue-grey studded hall, lit by cyan neon. */
const FLOOR = 0xa9b3cc;
const FLOOR_LINE = 0x95a0bc;
const BRICK_A = 0x9aa4bf;
const BRICK_B = 0x8c97b4;
const BRICK_DARK = 0x6f7a98;
const TRIM = 0x5a6482;
const NEON = 0x5ae8ff;
const NEON_PINK = 0xff5ad8;
const CURSED = 0x8a5aff;

const PAD_COLORS = { locked: 0xe8303a, unlocked: 0x4aff6a, equipped: 0x7ae8ff } as const;
/** What the statues and pedestal characters are doing: standing still, so they hold their stance. */
const STILL = createAnimationInput();
/** A label hides while the camera is closer to it than this. */
const LABEL_CLEARANCE = 7;

interface PadVisual {
  readonly id: number;
  readonly material: MeshBasicMaterial;
  readonly label: LabelSprite;
}

interface Statue {
  readonly model: Object3D;
  readonly animator: PlayerAnimator;
  readonly aura: AuraFx | null;
}

interface BagLabel {
  readonly tier: number;
  readonly label: LabelSprite;
}

/**
 * THE SPAWN HALL - the reference's bright neon hall, made a jujutsu school's:
 *
 *   spawn (centre)       a cursed-energy seal on the floor, violet and turning
 *   SORCERERS (left)     a dais of twelve pedestals, each character standing on
 *                        its own: red locked, green unlocked, blue equipped,
 *                        "+N/Click" and the Wins it needs over it
 *   TRAINING (right)     the Cursed Energy Training Zone behind a torii: six
 *                        kinds of bag, the strongest on a raised dojo floor
 *   STAGES (ahead)       the portal into the wall corridor under a great torii,
 *                        Gojo and Sukuna standing guard either side, the
 *                        UPGRADER and the AURA SHRINE beside it
 *   BACK                 the four boards and the PvP gate - a barrier below
 *                        its rebirths - into the shrine battle arena
 *
 * Every solid drawn here is a solid in `@jjk/shared`'s map.
 */
export class HubWorld {
  readonly root = new Group();
  readonly scoreboard = new Scoreboard();

  private readonly materials: Material[] = [];
  private readonly signs: CanvasSign[] = [];
  private readonly labels: LabelSprite[] = [];
  private readonly pads: PadVisual[] = [];
  private readonly bagLabels: BagLabel[] = [];
  private readonly bags: BagVisual[] = [];
  private readonly statues: Statue[] = [];
  private readonly field: Mesh;
  private readonly fieldMaterial: MeshBasicMaterial;
  private readonly gateLabel: LabelSprite;
  private readonly seal: Mesh;
  private readonly boothGlows: Mesh[] = [];
  private time = 0;
  private padSignature = '';
  private bagSignature = '';
  private pvpOpen: boolean | null = null;

  constructor() {
    this.root.name = 'hall';
    const shell = new PartBuilder();
    const props = new PartBuilder();
    this.buildFloor(shell);
    this.buildWalls(shell);
    this.buildPortal(shell, props);
    this.buildCharacterRow(props);
    this.buildTrainingZone(shell, props);
    this.buildBooths(props);
    this.buildBack(shell, props);
    this.buildArena(shell, props);
    // The shell (floor, walls, ceiling) casts no shadow: under a roof the sun would black everything out.
    this.root.add(shell.build('hall-shell', false));
    this.root.add(props.build('hall-props'));
    this.root.add(this.scoreboard.root);

    // The spawn's seal: a turning ring of runes in cursed violet.
    const sealMaterial = this.mat(new MeshBasicMaterial({ map: worldTextures.runeCircle('#b89aff'), transparent: true, depthWrite: false, blending: AdditiveBlending }));
    this.seal = new Mesh(new PlaneGeometry(11, 11), sealMaterial);
    this.seal.rotation.x = -Math.PI / 2;
    this.seal.position.set(SPAWN.x, 0.06, SPAWN.z);
    this.root.add(this.seal);

    this.fieldMaterial = this.mat(new MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.4, side: DoubleSide, depthWrite: false, blending: AdditiveBlending }));
    this.field = new Mesh(new PlaneGeometry(PVP_GATE.halfWidth * 2, PVP_GATE.height), this.fieldMaterial);
    this.field.position.set(0, PVP_GATE.height / 2, HUB.minZ - 2);
    this.root.add(this.field);
    this.gateLabel = this.label(12, 3.3, 0, 8, HUB.minZ + 1.6);
    this.buildStatues();
    this.setProgress(0, 1, false, 0);
  }

  // ---------------------------------------------------------------- helpers

  private mat<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private sign(width: number, height: number, lines: ConstructorParameters<typeof CanvasSign>[2], x: number, y: number, z: number, ry: number, background?: string): CanvasSign {
    const sign = new CanvasSign(width, height, lines, background);
    sign.mesh.position.set(x, y, z);
    sign.mesh.rotation.y = ry;
    this.root.add(sign.mesh);
    this.signs.push(sign);
    return sign;
  }

  private label(width: number, height: number, x: number, y: number, z: number): LabelSprite {
    const label = new LabelSprite(width, height, 320);
    label.sprite.position.set(x, y, z);
    this.root.add(label.sprite);
    this.labels.push(label);
    return label;
  }

  /** A neon-framed sign box like the reference's "Morphs" boxes, on a wall facing `ry`. */
  private neonSign(b: PartBuilder, text: string, x: number, y: number, z: number, ry: number, width: number, color: number, sub?: string): void {
    const along = Math.abs(Math.sin(ry)) > 0.5 ? 'z' : 'x';
    const w = width;
    const h = sub ? 5.2 : 4;
    const depth = 0.4;
    b.box(along === 'x' ? w + 0.8 : depth, h + 0.8, along === 'z' ? w + 0.8 : depth, color, 'glow', { x, y, z });
    b.box(along === 'x' ? w : depth + 0.05, h, along === 'z' ? w : depth + 0.05, 0x14183a, 'smooth', { x: x + Math.sin(ry) * 0.06, y, z: z + Math.cos(ry) * 0.06 });
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    this.sign(w * 0.94, h * 0.9, sub
      ? [
          { text, size: 1, fill: '#ffffff', stroke: hex, strokeWidth: 0.12 },
          { text: sub, size: 0.5, fill: hex, stroke: '#0a0a1a', strokeWidth: 0.12 },
        ]
      : [{ text, size: 1, fill: '#ffffff', stroke: hex, strokeWidth: 0.12 }], x + Math.sin(ry) * 0.3, y, z + Math.cos(ry) * 0.3, ry);
  }

  // ----------------------------------------------------------------- shell

  private buildFloor(b: PartBuilder): void {
    const w = HUB.maxX - HUB.minX;
    const d = HUB.maxZ - HUB.minZ;
    b.box(w, 0.4, d + HUB_WALL_DEPTH * 2, FLOOR, 'stud', { y: -0.2, z: (HUB.minZ + HUB.maxZ) / 2 });
    for (let x = HUB.minX + 16; x < HUB.maxX; x += 16) b.box(0.25, 0.02, d, FLOOR_LINE, 'flat', { x, y: 0.011, z: 0 });
    for (let z = HUB.minZ + 16; z < HUB.maxZ; z += 16) b.box(w, 0.02, 0.25, FLOOR_LINE, 'flat', { y: 0.012, z });
    // The lane from the spawn to the portal, edged in neon.
    b.box(PORTAL.halfWidth * 2 - 4, 0.03, HUB.maxZ - 6, 0xbcc6de, 'flat', { y: 0.014, z: (HUB.maxZ + 6) / 2 });
    for (const side of [-1, 1]) b.box(0.3, 0.05, HUB.maxZ - 8, NEON, 'glow', { x: side * (PORTAL.halfWidth - 2), y: 0.02, z: (HUB.maxZ + 8) / 2 });
    // The back of the hall is the arena's approach: red and black.
    for (let x = -PVP_GATE.halfWidth - 4; x < PVP_GATE.halfWidth + 4; x += 4) {
      for (let z = HUB.minZ; z < HUB.minZ + 12; z += 4) {
        b.box(4, 0.03, 4, (Math.floor(x / 4) + Math.floor(z / 4)) % 2 ? 0x2a1a20 : 0xb8202c, 'flat', { x: x + 2, y: 0.016, z: z + 2 });
      }
    }
    // The spawn plate: a dark stone disc under the seal.
    b.add(new CylinderGeometry(6.4, 6.6, 0.1, 40), 0x2a2440, 'smooth', { x: SPAWN.x, y: 0.05, z: SPAWN.z });
    groundRing(b, SPAWN.x, SPAWN.z, 6.2, CURSED, 0.14);
  }

  /** A run of wall in big studded bricks, laid in courses with offset joints. */
  private brickWall(b: PartBuilder, axis: 'x' | 'z', fixed: number, from: number, to: number, y0: number, y1: number, depth: number): void {
    const course = 3;
    const brick = 8;
    for (let y = y0, row = 0; y < y1 - 0.01; y += course, row += 1) {
      const h = Math.min(course, y1 - y);
      let start = from - (row % 2 ? brick / 2 : 0);
      for (let i = 0; start < to - 0.01; i += 1) {
        const a = Math.max(from, start);
        const e = Math.min(to, start + brick);
        if (e - a > 0.05) {
          const color = (i + row) % 3 === 0 ? BRICK_B : BRICK_A;
          const centre = (a + e) / 2;
          const len = e - a - 0.12;
          if (axis === 'x') b.box(len, h - 0.12, depth, color, 'stud', { x: centre, y: y + h / 2, z: fixed });
          else b.box(depth, h - 0.12, len, color, 'stud', { x: fixed, y: y + h / 2, z: centre });
        }
        start += brick;
      }
    }
    const span = to - from;
    if (axis === 'x') b.box(span, y1 - y0, depth * 0.6, BRICK_DARK, 'flat', { x: (from + to) / 2, y: (y0 + y1) / 2, z: fixed + (fixed > 0 ? 0.3 : -0.3) });
    else b.box(depth * 0.6, y1 - y0, span, BRICK_DARK, 'flat', { x: fixed + (fixed > 0 ? 0.3 : -0.3), y: (y0 + y1) / 2, z: (from + to) / 2 });
  }

  private buildWalls(b: PartBuilder): void {
    const top = HUB.height;
    this.brickWall(b, 'z', HUB.maxX + 0.5, HUB.minZ - HUB_WALL_DEPTH, HUB.maxZ + HUB_WALL_DEPTH, 0, top, 1);
    this.brickWall(b, 'z', HUB.minX - 0.5, HUB.minZ - HUB_WALL_DEPTH, HUB.maxZ + HUB_WALL_DEPTH, 0, top, 1);
    this.brickWall(b, 'x', HUB.maxZ + 0.5, HUB.minX, -PORTAL.halfWidth, 0, top, 1);
    this.brickWall(b, 'x', HUB.maxZ + 0.5, PORTAL.halfWidth, HUB.maxX, 0, top, 1);
    this.brickWall(b, 'x', HUB.maxZ + 0.5, -PORTAL.halfWidth, PORTAL.halfWidth, PORTAL.height, top, 1);
    this.brickWall(b, 'x', HUB.minZ - 0.5, HUB.minX, -PVP_GATE.halfWidth, 0, top, 1);
    this.brickWall(b, 'x', HUB.minZ - 0.5, PVP_GATE.halfWidth, HUB.maxX, 0, top, 1);
    this.brickWall(b, 'x', HUB.minZ - 0.5, -PVP_GATE.halfWidth, PVP_GATE.halfWidth, PVP_GATE.height, top, 1);
    // Neon bands round the hall, as the reference's cyan light strips.
    for (const side of [-1, 1]) {
      b.box(0.3, 0.35, HUB.maxZ - HUB.minZ, NEON, 'glow', { x: side * (HUB.maxX - 0.1), y: 10, z: 0 });
      b.box(0.3, 0.35, HUB.maxZ - HUB.minZ, NEON, 'glow', { x: side * (HUB.maxX - 0.1), y: 22, z: 0 });
      b.box(0.4, 1, HUB.maxZ - HUB.minZ, TRIM, 'flat', { x: side * (HUB.maxX - 0.2), y: 0.5, z: 0 });
    }
    for (const z of [HUB.minZ + 0.1, HUB.maxZ - 0.1]) {
      for (const side of [-1, 1]) b.box(HUB.maxX - (z > 0 ? PORTAL.halfWidth : PVP_GATE.halfWidth) - 1, 0.35, 0.3, NEON, 'glow', { x: side * ((HUB.maxX + (z > 0 ? PORTAL.halfWidth : PVP_GATE.halfWidth)) / 2), y: 22, z });
    }
    // Talisman banners hung down the side walls.
    for (const side of [-1, 1]) {
      for (let z = HUB.minZ + 6; z < HUB.maxZ - 4; z += 9) talisman(b, side * (HUB.maxX - 0.3), 28, z, side > 0 ? -Math.PI / 2 : Math.PI / 2, 3);
    }
    // The ceiling: a grid of beams and light panels.
    b.box(HUB.maxX - HUB.minX + 4, 1, HUB.maxZ - HUB.minZ + 8, 0x7a84a0, 'smooth', { y: top + 0.5, z: 0 });
    for (let x = HUB.minX + 16; x < HUB.maxX; x += 16) b.box(1, 1.4, HUB.maxZ - HUB.minZ, TRIM, 'smooth', { x, y: top - 0.6, z: 0 });
    for (let x = HUB.minX + 8; x < HUB.maxX; x += 16) {
      for (let z = HUB.minZ + 8; z < HUB.maxZ; z += 16) b.box(7, 0.12, 3.2, 0xfffbe8, 'glow', { x, y: top - 0.08, z });
    }
  }

  /** THE STAGES PORTAL: a glowing frame into the corridor under a great torii, its name in pink neon. */
  private buildPortal(shell: PartBuilder, props: PartBuilder): void {
    const z = HUB.maxZ - 0.6;
    const hw = PORTAL.halfWidth;
    const h = PORTAL.height;
    for (const side of [-1, 1]) {
      shell.box(2.6, h + 2.6, 1.8, 0xf4f4ff, 'smooth', { x: side * (hw + 1.3), y: (h + 2.6) / 2, z });
      shell.box(0.5, h, HUB_WALL_DEPTH, 0xd8c8ff, 'glow', { x: side * (hw - 0.25), y: h / 2, z: HUB.maxZ + HUB_WALL_DEPTH / 2 });
    }
    shell.box(hw * 2 + 5.2, 2.6, 1.8, 0xf4f4ff, 'smooth', { y: h + 1.3, z });
    shell.box(hw * 2, 0.5, HUB_WALL_DEPTH, 0xd8c8ff, 'glow', { y: h - 0.25, z: HUB.maxZ + HUB_WALL_DEPTH / 2 });
    torii(props, 0, HUB.maxZ - 4, hw * 2 + 4, 24, 0xe0342b);
    this.neonSign(shell, 'STAGES', 0, h + 6.4, HUB.maxZ - 0.3, Math.PI, 20, NEON_PINK, 'Break every wall - claim the Wins!');
  }

  /** The guardians either side of the portal: Gojo and Sukuna, giant, on ledges of the front wall. */
  private buildStatues(): void {
    const ledges = new PartBuilder();
    for (const [key, x] of [['gojo', 32], ['sukuna', -32]] as const) {
      ledges.box(9, 1, 5, 0x3a3a52, 'stud', { x, y: 11.5, z: HUB.maxZ - 2.5 });
      ledges.box(9.4, 0.3, 5.4, 0xffd23a, 'glow', { x, y: 12.1, z: HUB.maxZ - 2.5 });
      const look = STATUE_LOOKS[key];
      const model = createPaintedBody(`statue-${key}`, { ...look, scale: 2.6 });
      const visual = new Group();
      visual.add(model);
      visual.position.set(x, 12.25, HUB.maxZ - 2.6);
      visual.rotation.y = Math.PI;
      const animator = new PlayerAnimator(new PlayerRig(model, model), new Group());
      animator.crouchNow();
      this.root.add(visual);
      const sig = look.signature;
      const aura = sig ? AuraFx.forSignature(sig.color, sig.style, 3.2 * 2.6) : null;
      if (aura) {
        aura.root.position.copy(visual.position);
        this.root.add(aura.root);
      }
      this.statues.push({ model, animator, aura });
      this.neonSign(ledges, key === 'gojo' ? 'SATORU GOJO' : 'RYOMEN SUKUNA', x, 23.5, HUB.maxZ - 0.3, Math.PI, 11, key === 'gojo' ? NEON : 0xff2a3a);
    }
    this.root.add(ledges.build('statue-ledges', false));
  }

  // ------------------------------------------------------------- characters

  private buildCharacterRow(b: PartBuilder): void {
    const s = CHARACTER_STAND;
    b.box(s.maxX - s.minX, s.top + 1, s.maxZ - s.minZ, 0x3a3e5a, 'stud', { x: (s.minX + s.maxX) / 2, y: s.top - (s.top + 1) / 2, z: (s.minZ + s.maxZ) / 2 });
    b.box(0.4, 0.12, s.maxZ - s.minZ, NEON, 'glow', { x: s.minX + 0.2, y: s.top + 0.06, z: 0 });
    for (const pad of CHARACTER_PADS) {
      const def = CHARACTERS[pad.id - 1]!;
      b.add(new CylinderGeometry(2.1, 2.3, 0.2, 6), 0x2a2e3a, 'smooth', { x: pad.x, y: pad.y + 0.1, z: pad.z });
      const material = this.mat(new MeshBasicMaterial({ color: PAD_COLORS.locked }));
      const disc = new Mesh(new CylinderGeometry(1.75, 1.75, 0.06, 6), material);
      disc.position.set(pad.x, pad.y + 0.22, pad.z);
      this.root.add(disc);
      // The character itself, standing on its pedestal, facing the spawn.
      const model = createPaintedBody(`char-${def.id}`, characterLook(def.id));
      model.position.set(pad.x + 0.6, pad.y + 0.25, pad.z);
      model.rotation.y = -Math.PI / 2;
      this.root.add(model);
      const animator = new PlayerAnimator(new PlayerRig(model, model), new Group());
      animator.crouchNow();
      this.statues.push({ model, animator, aura: null });
      const scale = characterLook(def.id).scale ?? 1;
      const label = this.label(5, 3, pad.x - 0.4, pad.y + 3.2 * scale + 2.4, pad.z);
      this.pads.push({ id: pad.id, material, label });
    }
    this.neonSign(b, 'SORCERERS', HUB.maxX - 0.3, 17, 0, -Math.PI / 2, 26, NEON, 'Step on a pedestal to become them');
  }

  // --------------------------------------------------------------- training

  /**
   * The floors go in `floor` (the shell: receives shadows, casts none) and are
   * stacked with clear gaps - hall floor lines (top 0.022) < dark mats (top 0.05)
   * < bag mats (top 0.085, `Bags.ts`); dais top 0.9 < tatami (top 0.93) < bag
   * mats (0.985) - so no two layers z-fight or shadow-acne each other.
   */
  private buildTrainingZone(floor: PartBuilder, b: PartBuilder): void {
    const zone = TRAINING_ZONE;
    const dojo = zone.dojo;
    // The raised dojo floor: tatami in rows, a wooden edge.
    floor.box(dojo.maxX - dojo.minX, dojo.top + 1, zone.maxZ - zone.minZ, 0x6a4a2a, 'smooth', { x: (dojo.minX + dojo.maxX) / 2, y: dojo.top - (dojo.top + 1) / 2, z: 0 });
    for (let z = zone.minZ + 2; z < zone.maxZ; z += 4) {
      for (let x = dojo.minX + 2; x < dojo.maxX; x += 6) floor.box(5.8, 0.03, 3.8, 0xd9cf8f, 'flat', { x: x + 1, y: dojo.top + 0.015, z });
    }
    floor.box(0.4, 0.14, zone.maxZ - zone.minZ, CURSED, 'glow', { x: dojo.maxX - 0.2, y: dojo.top + 0.07, z: 0 });
    // The zone's floor in front: dark training mats, over the hall's floor lines.
    floor.box(zone.maxX - dojo.maxX - 2, 0.04, zone.maxZ - zone.minZ, 0x3a3e58, 'flat', { x: (dojo.maxX + zone.maxX) / 2, y: 0.03, z: 0 });
    // Its gate, and lanterns and braziers of cursed fire.
    torii(b, zone.maxX - 1, 0, 20, 16, 0x2a2a3a, Math.PI / 2);
    for (const z of [zone.minZ + 1, zone.maxZ - 1]) brazier(b, zone.maxX - 1, z, CURSED, 1.2);
    for (let z = zone.minZ + 4; z < zone.maxZ; z += 10) paperLantern(b, -50, 14, z, 0xb89aff, 1.6);
    for (let z = zone.minZ + 3; z < zone.maxZ; z += 6) talisman(b, HUB.minX + 0.4, 6 + (z % 3), z, Math.PI / 2, 2);

    const pairs = new Map<number, { x: number; y: number; z: number; n: number }>();
    for (const placement of BAGS) {
      if (placement.stage !== 0) continue;
      const visual = new BagVisual(placement);
      this.root.add(visual.root);
      this.bags.push(visual);
      bagVisuals.add(visual);
      const pair = pairs.get(placement.tier) ?? { x: 0, y: 0, z: 0, n: 0 };
      pair.x += placement.x;
      pair.y = placement.floor;
      pair.z += placement.z;
      pair.n += 1;
      pairs.set(placement.tier, pair);
    }
    for (const [tier, pair] of pairs) {
      // The back row's labels ride higher, so they read over the front row's.
      const label = this.label(6, 3, pair.x / pair.n, pair.y + (pair.y > 0 ? 12.4 : 8.6), pair.z / pair.n);
      this.bagLabels.push({ tier, label });
    }
    // The reference's pink neon TRAINING boxes over the bags.
    for (const z of [-20, 0, 20]) this.neonSign(b, 'TRAINING', HUB.minX + 0.3, 20, z, Math.PI / 2, 14, NEON_PINK);
    this.sign(22, 4, [
      { text: 'CURSED ENERGY TRAINING ZONE', size: 1, fill: '#e8dcff', stroke: '#2a0a5a', strokeWidth: 0.14 },
      { text: 'Stand on a mat and punch - stronger bags need rebirths', size: 0.55, fill: '#ffd23a', stroke: '#2a0a5a', strokeWidth: 0.14 },
    ], zone.maxX - 1, 18.5, 0, Math.PI / 2, 'rgba(20,10,40,0.85)');
  }

  // ----------------------------------------------------------------- booths

  /** The UPGRADER (right of the portal) and the AURA SHRINE (left): walk in to open their menus. */
  private buildBooths(b: PartBuilder): void {
    for (const booth of BOOTHS) {
      const h = BOOTH_HALF;
      const upgrader = booth.kind === 'upgrader';
      const color = upgrader ? 0x2a6ae8 : 0x5a2a8a;
      const glow = upgrader ? NEON : 0xc88aff;
      b.box(h * 2, 7, 0.6, color, 'stud', { x: booth.x, y: 3.5, z: booth.z + h - 0.3 });
      for (const side of [-1, 1]) b.box(0.6, 7, h * 2, shade(color, 0.85), 'stud', { x: booth.x + side * (h - 0.3), y: 3.5, z: booth.z });
      b.box(h * 2 + 1, 0.6, h * 2 + 1, shade(color, 0.6), 'smooth', { x: booth.x, y: 7.3, z: booth.z });
      b.box(h * 2 - 1.4, 3, 0.1, glow, 'glow', { x: booth.x, y: 4, z: booth.z + h - 0.65 });
      b.box(h * 2 - 1.4, 0.06, h * 2 - 1.4, glow, 'glow', { x: booth.x, y: 0.04, z: booth.z });
      if (upgrader) {
        // Gears and arrows: the machine that makes you stronger.
        for (const dx of [-1.2, 1.2]) b.add(new CylinderGeometry(0.9, 0.9, 0.3, 8), 0x7dff6a, 'smooth', { x: booth.x + dx, y: 5.5, z: booth.z + h - 0.75, rx: Math.PI / 2 });
      } else {
        brazier(b, booth.x - 1.6, booth.z + 1, 0xb83aff, 0.9);
        brazier(b, booth.x + 1.6, booth.z + 1, 0xb83aff, 0.9);
      }
      this.neonSign(b, upgrader ? 'UPGRADER' : 'AURAS', booth.x, 10.5, booth.z + h - 0.1, Math.PI, 9, glow);
      const ring = new Mesh(new RingGeometry(1.6, 2.2, 32), this.mat(new MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(booth.x, 0.08, booth.z);
      this.root.add(ring);
      this.boothGlows.push(ring);
    }
  }

  // ------------------------------------------------------------------ back

  private buildBack(shell: PartBuilder, props: PartBuilder): void {
    const z = HUB.minZ;
    const hw = PVP_GATE.halfWidth;
    for (const side of [-1, 1]) {
      shell.box(1.6, PVP_GATE.height + 1.6, 1.6, 0x1a1a24, 'smooth', { x: side * (hw + 0.8), y: (PVP_GATE.height + 1.6) / 2, z: z + 0.2 });
      for (let i = 0; i < 6; i += 1) props.box(1.64, 0.9, 1.64, 0xe8202c, 'flat', { x: side * (hw + 0.8), y: 1 + i * 2, z: z + 0.2 });
    }
    shell.box(hw * 2 + 3.2, 1.6, 1.6, 0x1a1a24, 'smooth', { y: PVP_GATE.height + 0.8, z: z + 0.2 });
    shell.box(hw * 2, 0.3, 0.3, 0xff2a3a, 'glow', { y: PVP_GATE.height - 0.15, z: z + 0.6 });
    const toriiZ = z + 4;
    const toriiWidth = hw * 2 + 4;
    const toriiHeight = 17;
    torii(props, 0, toriiZ, toriiWidth, toriiHeight, 0x1a1a24);
    // The sign is the torii's plaque: on its FRONT (clear of the kasagi, which is 0.12 x the width deep),
    // between the nuki and the kasagi, so no beam can ever stand between it and the player.
    this.sign(15.5, 3.2, [
      { text: 'CULLING ARENA', size: 1, fill: '#ffe83a', stroke: '#1a0004', strokeWidth: 0.16 },
      { text: `PvP - requires ${PVP.rebirthsRequired} Rebirths - fight at ${Math.round(PVP.strengthMultiplier * 100)}% Cursed Energy`, size: 0.5, fill: '#ffffff', stroke: '#1a0004', strokeWidth: 0.16 },
    ], 0, toriiHeight * 0.855, toriiZ + toriiWidth * 0.06 + 0.25, 0, '#2a0a10');
  }

  /** THE ARENA: a shrine battle stage under torii pillars, braziers of cursed fire - nothing like the bright hall. */
  private buildArena(shell: PartBuilder, props: PartBuilder): void {
    const a = PVP_ARENA;
    const w = a.maxX - a.minX;
    const d = a.maxZ - a.minZ;
    const zc = (a.minZ + a.maxZ) / 2;
    shell.box(w, 0.4, d, 0x2a2a34, 'stud', { y: -0.2, z: zc });
    const ringZ = (PVP_POSTS[0]![1] + PVP_POSTS[2]![1]) / 2;
    const ringW = Math.abs(PVP_POSTS[1]![0] - PVP_POSTS[0]![0]);
    const ringD = Math.abs(PVP_POSTS[0]![1] - PVP_POSTS[2]![1]);
    // The battle stage: pale stone slabs, a domain seal glowing at its heart.
    for (let x = -ringW / 2 + 2; x < ringW / 2; x += 4) {
      for (let z = ringZ - ringD / 2 + 2; z < ringZ + ringD / 2; z += 4) shell.box(3.9, 0.05, 3.9, ((x + z) / 4) % 2 ? 0x8a8a94 : 0x9a9aa4, 'flat', { x, y: 0.025, z });
    }
    shell.box(ringW + 1.2, 0.03, ringD + 1.2, 0x5a0a14, 'flat', { y: 0.015, z: ringZ });
    groundRing(shell, 0, ringZ, 9, 0xff2a5a, 0.2);
    groundRing(shell, 0, ringZ, 6, 0x8a5aff, 0.12);
    for (const side of [-1, 1]) {
      shell.box(1, a.height, d, 0x24242e, 'stud', { x: side * (a.maxX + 0.5), y: a.height / 2, z: zc });
      shell.box(0.3, 0.4, d, 0xff2a5a, 'glow', { x: side * (a.maxX - 0.1), y: 6, z: zc });
      shell.box(0.3, 0.4, d, 0x8a5aff, 'glow', { x: side * (a.maxX - 0.1), y: 12, z: zc });
      for (let z = a.minZ + 6; z < a.maxZ - 2; z += 8) {
        brazier(props, side * (a.maxX - 3), z, side > 0 ? 0xff2a5a : 0x8a5aff, 1.2);
        props.box(0.08, 8, 2.6, z % 16 ? 0x1a1a24 : 0x8a0a14, 'smooth', { x: side * (a.maxX - 0.15), y: 16, z: z + 4 });
      }
    }
    shell.box(w, a.height, 1, 0x24242e, 'stud', { y: a.height / 2, z: a.minZ - 0.5 });
    shell.box(w + 2, 1, d + 2, 0x1a1a22, 'smooth', { y: a.height + 0.5, z: zc });
    for (let z = a.minZ + 8; z < a.maxZ; z += 14) shell.box(5, 0.1, 2, 0xffd8e8, 'glow', { y: a.height - 0.06, z });
    // Torii pillars at the stage's corners (the solid posts), a beam across each pair.
    for (const [x, z] of PVP_POSTS) {
      props.add(new CylinderGeometry(0.85, 0.95, 9, 12), 0xc8202c, 'smooth', { x, y: 4.5, z });
      props.add(new CylinderGeometry(1.1, 1.1, 0.6, 12), 0x1a1a1a, 'smooth', { x, y: 0.3, z });
    }
    for (const z of [PVP_POSTS[0]![1], PVP_POSTS[2]![1]]) {
      props.box(ringW + 4, 0.8, 1.2, 0xc8202c, 'smooth', { y: 8.6, z });
      props.box(ringW + 5, 0.5, 1.4, 0x1a1a1a, 'smooth', { y: 9.2, z });
    }
    this.sign(26, 5, [
      { text: 'CULLING ARENA', size: 1, fill: '#ff3a5a', stroke: '#000000', strokeWidth: 0.12 },
      { text: 'Last sorcerer standing', size: 0.45, fill: '#ffffff', stroke: '#000000', strokeWidth: 0.12 },
    ], 0, 16, a.minZ + 0.05, 0, '#120408');
  }

  // ------------------------------------------------------------------ state

  /**
   * The local player's progress: which pedestals are locked, unlocked or
   * equipped; which bags they may use; whether the arena is open.
   */
  setProgress(lifetimeWins: number, equipped: number, morph: boolean, rebirths: number): void {
    const trophy = trophyIcon(() => {
      this.padSignature = '';
      this.setProgress(lifetimeWins, equipped, morph, rebirths);
    });
    const padSignature = `${Math.floor(lifetimeWins)}|${equipped}|${morph ? 1 : 0}|${trophy ? 1 : 0}`;
    if (padSignature !== this.padSignature) {
      this.padSignature = padSignature;
      for (const pad of this.pads) {
        const def = CHARACTERS[pad.id - 1]!;
        const open = characterUnlocked(pad.id, lifetimeWins);
        const state = equipped === pad.id ? 'equipped' : open ? 'unlocked' : 'locked';
        pad.material.color.setHex(PAD_COLORS[state]);
        pad.label.set([
          { text: def.name, color: '#ffffff', size: 1 },
          { text: `+${formatAmount(def.power)}/Click`, color: '#ffffff', size: 0.95 },
          state === 'equipped'
            ? { text: morph ? 'EQUIPPED' : 'EQUIPPED (avatar look)', color: '#7ae8ff', size: 0.85 }
            : state === 'unlocked'
              ? { text: 'Step on to equip', color: '#7dff6a', size: 0.85 }
              : { text: def.winsRequired === 0 ? 'FREE' : `${formatWins(def.winsRequired)} Wins Required`, color: '#ffd23a', size: 0.85, icon: trophy },
        ]);
      }
    }
    const reborn = rebirthIcon(() => {
      this.bagSignature = '';
      this.setProgress(lifetimeWins, equipped, morph, rebirths);
    });
    const bagSignature = `${Math.floor(rebirths)}|${reborn ? 1 : 0}`;
    if (bagSignature !== this.bagSignature) {
      this.bagSignature = bagSignature;
      for (const entry of this.bagLabels) {
        const tier = BAG_TIERS[entry.tier]!;
        const open = canUseBag(entry.tier, rebirths);
        entry.label.set([
          { text: tier.name, color: '#ffffff', size: 0.95 },
          { text: `${tier.multiplier}x Energy`, color: tierCss(entry.tier), size: 1.1 },
          open
            ? { text: tier.rebirthsRequired === 0 ? 'Open to all' : 'Unlocked!', color: '#7dff6a', size: 0.8 }
            : { text: `${tier.rebirthsRequired} Rebirth${tier.rebirthsRequired === 1 ? '' : 's'}`, color: '#ff7ae8', size: 0.85, icon: reborn },
        ]);
      }
    }
    const open = canEnterPvp(rebirths);
    if (open !== this.pvpOpen) {
      this.pvpOpen = open;
      this.fieldMaterial.color.setHex(open ? 0x3aff6a : 0xff2a3a);
      this.fieldMaterial.opacity = open ? 0.14 : 0.42;
      this.gateLabel.set(
        open
          ? [{ text: 'ENTER THE ARENA', color: '#7dff6a', size: 1 }, { text: `${Math.round(PVP.strengthMultiplier * 100)}% Cursed Energy inside`, color: '#ffffff', size: 0.7 }]
          : [{ text: 'LOCKED', color: '#ff4a5a', size: 1 }, { text: `Reach Rebirth ${PVP.rebirthsRequired} to fight`, color: '#ffffff', size: 0.7 }],
      );
    }
  }

  update(delta: number, camera: Vector3): void {
    this.time += delta;
    for (const label of this.labels) {
      const clear = camera.distanceToSquared(label.sprite.position) > LABEL_CLEARANCE * LABEL_CLEARANCE;
      if (label.sprite.visible !== clear) label.sprite.visible = clear;
    }
    this.seal.rotation.z = this.time * 0.25;
    for (const ring of this.boothGlows) ring.rotation.z = -this.time * 0.6;
    for (const statue of this.statues) {
      statue.animator.update(delta, STILL);
      statue.aura?.update(delta, 1);
    }
    for (const bag of this.bags) bag.update(delta);
    if (!this.pvpOpen) this.fieldMaterial.opacity = 0.34 + Math.sin(this.time * 4) * 0.1;
  }

  dispose(): void {
    this.scoreboard.dispose();
    for (const sign of this.signs) sign.dispose();
    for (const label of this.labels) label.dispose();
    for (const material of this.materials) material.dispose();
    for (const bag of this.bags) {
      bagVisuals.remove(bag);
      bag.dispose();
    }
    for (const statue of this.statues) statue.aura?.dispose();
    this.root.removeFromParent();
  }
}
