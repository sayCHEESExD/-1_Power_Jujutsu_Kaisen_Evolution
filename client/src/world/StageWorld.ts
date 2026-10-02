import {
  BAGS,
  CORRIDOR,
  CORRIDOR_END_Z,
  STAGES,
  STAGE_COUNT,
  WALLS,
  WALL_THICKNESS,
  formatAmount,
  formatWins,
  isClaimed,
  stageComplete,
  type StageDef,
} from '@jjk/shared';
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Scene,
  type Vector3,
} from 'three';
import { PartBuilder, meshesFor, type PartKind } from '../render/PartBuilder.js';
import { BagVisual, bagVisuals } from './Bags.js';
import { CanvasSign } from './CanvasSign.js';
import { eye, flame, shade, talisman, torii } from './JjkProps.js';
import { LabelSprite, trophyIcon } from './LabelSprite.js';
import { CRACK_LEVELS, crackLevelFor, crackTexture, wallMaterial } from './WallMaterials.js';
import { WallDebris } from './WallDebris.js';
import { buildZone } from './Zones.js';

const HW = CORRIDOR.halfWidth;
const H = CORRIDOR.height;
/** Stages whose centre is nearer the player than this are built; further than DROP_RANGE, taken down. */
const BUILD_RANGE = 240;
const DROP_RANGE = 420;
/** A claim label hides while the camera is closer to it than this. */
const LABEL_CLEARANCE = 9;
/** How many walls are ever drawn: the next standing one hides everything behind it. */
const WALL_SLOTS = 3;

const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** One stage, built: its scenery, signs, bags and Win Area. */
interface BuiltStage {
  readonly def: StageDef;
  readonly root: Group;
  readonly signs: CanvasSign[];
  readonly labels: LabelSprite[];
  readonly bags: BagVisual[];
  readonly claimLabel: LabelSprite;
  readonly claimGlow: Mesh;
  readonly spinners: Mesh[];
  readonly materials: Material[];
}

interface WallSlot {
  readonly group: Group;
  readonly slab: Mesh;
  deco: Group | null;
  wall: number;
}

/** A stage's walls grow more imposing as the course goes on. */
const ornamentTier = (stage: number): number => (stage <= 10 ? 0 : stage <= 25 ? 1 : stage <= 40 ? 2 : 3);

const decorations = new Map<string, Partial<Record<PartKind, BufferGeometry>>>();

/**
 * The ornament on a wall of a stage: posts at its ends from the start;
 * chains and talismans from stage 11; a glowing seal and spikes from 26; a
 * hex-lit frame and watching eyes from 41. A BOSS wall carries a bound curse:
 * horns, burning eyes and a mouth full of teeth, chains across it. Built once
 * per stage and kind, shared by every wall that wears it.
 */
const wallDecoration = (def: StageDef, boss: boolean): Partial<Record<PartKind, BufferGeometry>> => {
  const key = `${def.index}:${boss ? 1 : 0}`;
  const cached = decorations.get(key);
  if (cached) return cached;
  const b = new PartBuilder();
  const p = def.palette;
  const tier = ornamentTier(def.index);
  const front = -WALL_THICKNESS / 2 - 0.05;
  const frame = shade(p.wall, 0.55);
  // Posts at both ends and a lintel: every wall is a gate to break through.
  for (const s of [-1, 1]) {
    b.box(1.2, H, WALL_THICKNESS + 0.6, frame, 'stud', { x: s * (HW - 0.6), y: H / 2 });
    b.box(0.25, H - 1, 0.1, p.accent, 'glow', { x: s * (HW - 1.3), y: H / 2, z: front });
  }
  b.box(HW * 2, 1, WALL_THICKNESS + 0.6, frame, 'stud', { y: H - 0.5 });
  if (tier >= 1 || boss) {
    // Chains crossing the wall, talismans pinned over them.
    for (const dir of [-1, 1]) {
      for (let i = 0; i < 12; i += 1) {
        const t = i / 11;
        b.add(new TorusGeometry(0.35, 0.09, 4, 8), 0x8a8e98, 'smooth', { x: dir * (-HW + 2 + t * (HW * 2 - 4)), y: 2 + t * (H - 5), z: front - 0.1, ry: (i % 2) * (Math.PI / 2), rz: dir * 0.7 });
      }
    }
    for (const [x, y] of [[-6, 10], [6, 10], [0, 5], [-10, 4], [10, 4]] as const) talisman(b, x, y, front - 0.12, Math.PI, 2.2);
  }
  if (tier >= 2 || boss) {
    // A glowing seal, and spikes along the top.
    b.add(new TorusGeometry(4.2, 0.18, 6, 48), p.accent, 'glow', { y: 8, z: front - 0.15 });
    b.add(new TorusGeometry(3.2, 0.1, 6, 48), p.accent, 'glow', { y: 8, z: front - 0.15 });
    for (let x = -HW + 1; x <= HW - 1; x += 2) b.add(new ConeGeometry(0.4, 1.6, 4), frame, 'flat', { x, y: H + 0.8 });
  }
  if (tier >= 3 && !boss) {
    for (const [x, y] of [[-11, 12], [11, 12]] as const) eye(b, x, y, front - 0.6, 0.9, p.accent, Math.PI);
    b.box(HW * 2 - 2, 0.3, 0.1, p.accent, 'glow', { y: 1.2, z: front });
  }
  if (boss) {
    // THE BOUND CURSE: a face in the wall, staring the player down.
    const face = shade(p.wall, 0.4);
    b.box(10, 7.6, 0.8, face, 'flat', { y: 6.9, z: front - 0.4 });
    for (const side of [-1, 1]) {
      eye(b, side * 2.6, 8.3, front - 0.9, 1.2, 0xff2a3a, Math.PI);
      b.add(new ConeGeometry(0.9, 3.6, 6), 0x2a1a1a, 'flat', { x: side * 4.6, y: 11.6, z: front - 0.5, rz: -side * 0.5 });
    }
    b.box(7, 1.4, 0.4, 0x1a0408, 'smooth', { y: 4.6, z: front - 0.9 });
    for (let i = 0; i < 7; i += 1) {
      b.add(new ConeGeometry(0.28, 0.8, 4), 0xf4f0e8, 'smooth', { x: -3 + i, y: 5.1, z: front - 1.05, rx: Math.PI });
      b.add(new ConeGeometry(0.28, 0.8, 4), 0xf4f0e8, 'smooth', { x: -3 + i, y: 4.1, z: front - 1.05 });
    }
    for (const side of [-1, 1]) flame(b, side * (HW - 2.4), 0, front - 1.2, 1.6, p.accent, 0xffffff);
  }
  const geometries = b.geometries();
  decorations.set(key, geometries);
  return geometries;
};

/**
 * THE WALL CORRIDOR: fifty stages, each a place of its own (`Zones`).
 *
 *   entrance   a gate with the stage's name (STAGE 7 - CURSED BUILDING)
 *   nook       two Bronze bags against the side walls, and the stage's board
 *   walls      the stage's walls in its own material, numbered down the whole
 *              course ("Level" 1, 2, 3 ...); the local player's NEXT wall
 *              carries its number and health bar, cracks deeper as it falls,
 *              wobbles at every blow and bursts into chunks when it breaks.
 *              The last is a BOSS - a curse bound into the wall.
 *   win area   past the boss, alternately right and left: the claim pad, its
 *              reward in big letters, grander every stage
 *
 * Stages are BUILT as the player nears them and taken down far behind, so
 * fifty stages cost what two or three do. Every player breaks their OWN walls
 * (the server's run per player), so the walls shown are the LOCAL player's -
 * and only the next few are drawn at all, from a small pool.
 */
export class StageWorld {
  readonly root = new Group();

  private readonly built = new Map<number, BuiltStage>();
  private readonly debris: WallDebris;
  private readonly crack: Mesh;
  private readonly crackMaterial: MeshBasicMaterial;
  private readonly panel: WallPanel;
  private readonly slots: WallSlot[] = [];
  private readonly slabGeometry: BoxGeometry;
  private readonly endSign: CanvasSign;
  private readonly endRoot = new Group();
  private wallsBroken = -1;
  private wallHp = 0;
  private shownHp = 0;
  private claimed = -1;
  private crackLevel = -1;
  /** Seconds left on the current wall's wobble, and its strength. */
  private wobble = 0;
  private wobbleStrength = 0;
  private time = 0;
  private claimSignature = '';

  constructor(scene: Scene) {
    this.root.name = 'corridor';
    this.slabGeometry = new BoxGeometry(HW * 2, H, WALL_THICKNESS);
    // The material textures tile at about 8 units: four across the corridor, two up.
    const uv = this.slabGeometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2);
    for (let i = 0; i < WALL_SLOTS; i += 1) {
      const group = new Group();
      const slab = new Mesh(this.slabGeometry);
      slab.position.y = H / 2;
      slab.receiveShadow = true;
      group.add(slab);
      group.visible = false;
      this.root.add(group);
      this.slots.push({ group, slab, deco: null, wall: -1 });
    }

    const end = new PartBuilder();
    end.box(HW * 2, H * 2, 1, 0x2a1a5a, 'stud', { y: H, z: CORRIDOR_END_Z + 0.5 });
    torii(end, 0, CORRIDOR_END_Z - 4, HW * 2 - 2, 15, 0xffd23a);
    this.endRoot.add(end.build('corridor-end', false));
    this.endSign = new CanvasSign(HW * 1.5, 5, [
      { text: 'THE STRONGEST', size: 1, fill: '#ffd23a', stroke: '#141822', strokeWidth: 0.16 },
      { text: 'You broke every wall. Rebirth and climb again!', size: 0.5, fill: '#ffffff', stroke: '#141822', strokeWidth: 0.16 },
    ]);
    this.endSign.mesh.position.set(0, 9, CORRIDOR_END_Z - 0.05);
    this.endSign.mesh.rotation.y = Math.PI;
    this.endRoot.add(this.endSign.mesh);
    this.endRoot.visible = false;
    this.root.add(this.endRoot);

    this.crackMaterial = new MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.crack = new Mesh(new PlaneGeometry(HW * 2, H), this.crackMaterial);
    this.crack.rotation.y = Math.PI;
    this.crack.visible = false;
    this.root.add(this.crack);
    this.panel = new WallPanel();
    this.root.add(this.panel.mesh);
    this.debris = new WallDebris(scene);
  }

  // ---------------------------------------------------------------- building

  private build(def: StageDef): BuiltStage {
    const root = new Group();
    root.name = `stage-${def.index}`;
    const b = new PartBuilder();
    const extras = new Group();
    const signs: CanvasSign[] = [];
    const labels: LabelSprite[] = [];
    const materials: Material[] = [];
    const spinners: Mesh[] = [];
    const p = def.palette;
    const z0 = def.startZ;
    const sign = (width: number, height: number, lines: ConstructorParameters<typeof CanvasSign>[2], x: number, y: number, z: number, ry: number, background?: string): void => {
      const s = new CanvasSign(width, height, lines, background);
      s.mesh.position.set(x, y, z);
      s.mesh.rotation.y = ry;
      root.add(s.mesh);
      signs.push(s);
    };

    buildZone(def, b, extras);
    extras.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material)) materials.push(mesh.material as Material);
    });

    // The entrance gate, and the stage's name on its beam.
    for (const side of [-1, 1]) b.box(1.2, H, 1.6, p.accent, 'stud', { x: side * (HW - 0.4), y: H / 2, z: z0 + 0.8 });
    b.box(HW * 2, 2.6, 1.6, shade(p.accent, 0.8), 'stud', { y: H - 1.3, z: z0 + 0.8 });
    sign(HW * 1.6, 2.2, [
      { text: `STAGE ${def.index}`, size: 1, fill: '#ffffff', stroke: '#141822', strokeWidth: 0.16 },
      { text: def.name.toUpperCase(), size: 0.8, fill: css(p.accent), stroke: '#141822', strokeWidth: 0.16 },
    ], 0, H - 1.3, z0 - 0.02, Math.PI);

    // The nook: its two Bronze bags, and the board high on the wall.
    const bags: BagVisual[] = [];
    for (const placement of BAGS) {
      if (placement.stage !== def.index) continue;
      const visual = new BagVisual(placement);
      root.add(visual.root);
      bags.push(visual);
      bagVisuals.add(visual);
    }
    const first = def.firstWall + 1;
    sign(10, 5, [
      { text: `STAGE ${def.index} - ${def.name.toUpperCase()}`, size: 0.7, fill: '#ffffff', stroke: '#141822', strokeWidth: 0.16 },
      { text: `Levels ${first}-${first + def.wallCount - 1}  -  Boss ${formatAmount(def.bossHp)} HP`, size: 0.7, fill: '#ffd23a', stroke: '#141822', strokeWidth: 0.16 },
      { text: `Break them all: +${formatWins(def.reward)} Wins`, size: 0.75, fill: '#7dff6a', stroke: '#141822', strokeWidth: 0.16 },
      { text: 'Train here: Bronze bags', size: 0.6, fill: '#bfe6ff', stroke: '#141822', strokeWidth: 0.16 },
    ], HW - 0.06, 9, def.bagZ + 8.5, -Math.PI / 2, 'rgba(10,8,24,0.82)');

    this.buildWinArea(def, b, root, sign, labels, materials, spinners);

    root.add(b.build(`stage-${def.index}-static`, false));
    root.add(extras);
    this.root.add(root);
    const claimLabel = labels[0]!;
    const claimGlow = spinners[0]!;
    return { def, root, signs, labels, bags, claimLabel, claimGlow, spinners, materials };
  }

  /**
   * THE WIN AREA: a gold pad in a gilded bay beside the lane, its reward in big
   * letters over it - and grander every stage: a trophy on a plinth and flames
   * from Stage 6, a torii over the pad from 16, a pillar of light and turning
   * rings from 31.
   */
  private buildWinArea(
    def: StageDef,
    b: PartBuilder,
    root: Group,
    sign: (width: number, height: number, lines: ConstructorParameters<typeof CanvasSign>[2], x: number, y: number, z: number, ry: number, background?: string) => void,
    labels: LabelSprite[],
    materials: Material[],
    spinners: Mesh[],
  ): void {
    const s = Math.sign(def.claimX) || -1;
    const pad = 3.4;
    const last = def.wallZ[def.wallZ.length - 1]!;
    const winZ0 = last + 2.5;
    const winZ1 = def.endZ - 1.5;
    const inner = def.claimX - s * (pad + 2.2);
    const bayW = Math.abs(s * HW - inner);
    const bayX = (s * HW + inner) / 2;
    b.box(bayW, 0.03, winZ1 - winZ0, 0x3a2a10, 'flat', { x: bayX, y: 0.016, z: (winZ0 + winZ1) / 2 });
    for (const z of [winZ0, winZ1]) b.box(bayW, 0.06, 0.4, 0xffc21e, 'glow', { x: bayX, y: 0.03, z });
    b.box(0.4, 0.06, winZ1 - winZ0, 0xffc21e, 'glow', { x: inner, y: 0.03, z: (winZ0 + winZ1) / 2 });
    b.add(new CylinderGeometry(pad + 0.6, pad + 0.8, 0.12, 32), 0x8a6a1a, 'smooth', { x: def.claimX, y: 0.06, z: def.claimZ });
    b.add(new CylinderGeometry(pad, pad, 0.16, 32), 0xffc21e, 'glow', { x: def.claimX, y: 0.1, z: def.claimZ });
    // A gilded arch on the side wall over the bay.
    for (const dz of [-4.5, 4.5]) b.box(0.8, 9, 0.8, 0xffc21e, 'smooth', { x: s * (HW - 0.4), y: 4.5, z: def.claimZ + dz });
    b.box(0.8, 0.8, 9.8, 0xffc21e, 'smooth', { x: s * (HW - 0.4), y: 9.4, z: def.claimZ });
    sign(8.2, 4.2, [
      { text: 'WIN AREA', size: 1, fill: '#ffd23a', stroke: '#141822', strokeWidth: 0.16 },
      { text: `Level ${def.firstWall + def.wallCount}: +${formatWins(def.reward)} Wins`, size: 0.75, fill: '#ffffff', stroke: '#141822', strokeWidth: 0.16 },
      { text: 'step on the pad', size: 0.55, fill: '#bfe6ff', stroke: '#141822', strokeWidth: 0.16 },
    ], s * (HW - 0.85), 6.7, def.claimZ, s > 0 ? -Math.PI / 2 : Math.PI / 2, 'rgba(10,8,24,0.82)');

    if (def.index >= 6) {
      // A trophy on a plinth beside the pad, flames either side.
      const tx = def.claimX + s * 1;
      const tz = def.claimZ + pad + 1.6;
      b.box(2, 1.4, 2, 0x2a2a34, 'stud', { x: tx, y: 0.7, z: tz });
      b.add(new CylinderGeometry(0.8, 0.3, 1.4, 14), 0xffc21e, 'smooth', { x: tx, y: 2.5, z: tz });
      b.add(new CylinderGeometry(0.2, 0.2, 0.6, 8), 0xffc21e, 'smooth', { x: tx, y: 1.6, z: tz });
      for (const side of [-1, 1]) b.add(new TorusGeometry(0.35, 0.08, 6, 12), 0xffc21e, 'smooth', { x: tx + side * 0.8, y: 2.7, z: tz });
      for (const dz of [-pad - 1, pad + 1]) flame(b, def.claimX - s * pad, 0, def.claimZ + dz, 1.3, 0xffb03a, 0xfff27a);
    }
    if (def.index >= 16) torii(b, def.claimX, def.claimZ, pad * 2 + 1, 9, def.index >= 31 ? 0xffd23a : 0xe0342b, Math.PI / 2);
    if (def.index >= 31) {
      const beamMaterial = new MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
      materials.push(beamMaterial);
      const beam = new Mesh(new CylinderGeometry(pad * 0.85, pad * 0.85, 60, 24, 1, true), beamMaterial);
      beam.position.set(def.claimX, 30, def.claimZ);
      root.add(beam);
      for (let k = 0; k < 2; k += 1) {
        const ringMaterial = new MeshBasicMaterial({ color: k ? 0xffffff : 0xffd23a, transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false });
        materials.push(ringMaterial);
        const ring = new Mesh(new TorusGeometry(pad + 1 + k * 1.2, 0.08, 4, 40), ringMaterial);
        ring.position.set(def.claimX, 5 + k * 3, def.claimZ);
        ring.rotation.x = Math.PI / 2;
        root.add(ring);
        spinners.push(ring);
      }
    }

    const glowMaterial = new MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    materials.push(glowMaterial);
    const claimGlow = new Mesh(new RingGeometry(pad * 0.55, pad * 0.95, 32), glowMaterial);
    claimGlow.rotation.x = -Math.PI / 2;
    claimGlow.position.set(def.claimX, 0.2, def.claimZ);
    root.add(claimGlow);
    spinners.unshift(claimGlow);
    const claimLabel = new LabelSprite(6.4, 2.8, 320);
    claimLabel.sprite.position.set(def.claimX, 3.2, def.claimZ);
    root.add(claimLabel.sprite);
    labels.unshift(claimLabel);
  }

  private unbuild(stage: BuiltStage): void {
    // Bags first: their leather and mats are shared by every bag of a tier.
    for (const bag of stage.bags) {
      bagVisuals.remove(bag);
      bag.dispose();
    }
    for (const sign of stage.signs) sign.dispose();
    for (const label of stage.labels) label.dispose();
    // Everything left under the stage is its own: the merged scenery, the water, the beams.
    stage.root.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const material of stage.materials) material.dispose();
    stage.root.removeFromParent();
  }

  /** Build what is near, take down what is far; at most one new stage a frame (the nearest first). */
  private stream(playerZ: number): void {
    let nearest: StageDef | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const def of STAGES) {
      const centre = (def.startZ + def.endZ) / 2;
      const distance = Math.max(0, Math.abs(centre - playerZ) - (def.endZ - def.startZ) / 2);
      const stage = this.built.get(def.index);
      if (stage && distance > DROP_RANGE) {
        this.unbuild(stage);
        this.built.delete(def.index);
      } else if (!stage && distance < BUILD_RANGE && distance < nearestDistance) {
        nearest = def;
        nearestDistance = distance;
      }
    }
    if (nearest) {
      this.built.set(nearest.index, this.build(nearest));
      this.claimSignature = '';
    }
    const last = STAGES[STAGE_COUNT - 1]!;
    this.endRoot.visible = Math.abs(last.endZ - playerZ) < BUILD_RANGE;
  }

  // ------------------------------------------------------------------ walls

  /**
   * The local player's run: which walls are down, the next wall's health,
   * which claims are banked. The wall pool moves onto the next walls; the
   * next wall gets the panel and its cracks; the claim pads say what they do.
   */
  setRun(wallsBroken: number, wallHp: number, claimed: number): void {
    if (wallsBroken !== this.wallsBroken) {
      const jumped = this.wallsBroken < 0 || Math.abs(wallsBroken - this.wallsBroken) > 1;
      this.wallsBroken = wallsBroken;
      this.wallHp = wallHp;
      // A new wall starts whole; a run reset snaps rather than counting down.
      this.shownHp = jumped ? wallHp : (WALLS[wallsBroken]?.hp ?? 0);
      this.crackLevel = -1;
      this.placeWalls();
    }
    if (wallHp !== this.wallHp) this.wallHp = wallHp;
    if (claimed !== this.claimed) this.claimed = claimed;
    this.relabelClaims();
  }

  /** Put the pool's slabs on the next standing walls, each in its stage's material and ornament. */
  private placeWalls(): void {
    this.slots.forEach((slot, i) => {
      const wall = WALLS[this.wallsBroken + i];
      if (!wall) {
        slot.group.visible = false;
        slot.wall = -1;
        return;
      }
      const def = STAGES[wall.stage - 1]!;
      if (slot.wall !== wall.id) {
        slot.wall = wall.id;
        slot.slab.material = wallMaterial(def);
        slot.deco?.removeFromParent();
        slot.deco = meshesFor(wallDecoration(def, wall.boss), `wall-deco-${def.index}-${wall.boss ? 'boss' : 'wall'}`, false);
        slot.group.add(slot.deco);
      }
      slot.group.position.set(0, 0, wall.z);
      slot.group.visible = true;
    });
    const wall = WALLS[this.wallsBroken];
    if (!wall) {
      this.panel.mesh.visible = false;
      this.crack.visible = false;
      return;
    }
    const face = wall.z - WALL_THICKNESS / 2 - 0.03;
    // At eye level over the player's head, as the reference has it; a boss's readout rides over its face.
    this.panel.mesh.position.set(0, wall.boss ? 12.9 : 8.2, face - 0.02);
    this.panel.mesh.visible = true;
    this.crack.position.set(0, H / 2, face);
  }

  private relabelClaims(): void {
    const trophy = trophyIcon(() => {
      this.claimSignature = '';
      this.relabelClaims();
    });
    const signature = `${this.wallsBroken}|${this.claimed}|${trophy ? 1 : 0}|${this.built.size}`;
    if (signature === this.claimSignature) return;
    this.claimSignature = signature;
    for (const stage of this.built.values()) {
      const done = stageComplete(this.wallsBroken, stage.def.index);
      const banked = isClaimed(this.claimed, stage.def.index);
      stage.claimLabel.set([
        { text: `+${formatWins(stage.def.reward)} Wins`, color: '#ffd23a', size: 1.2, icon: trophy },
        banked
          ? { text: 'CLAIMED!', color: '#7dff6a', size: 0.85 }
          : done
            ? { text: 'STEP HERE TO CLAIM', color: '#ffffff', size: 0.85 }
            : { text: `Break Level ${stage.def.firstWall + stage.def.wallCount} first`, color: '#ff9a9a', size: 0.75 },
      ]);
      (stage.claimGlow.material as MeshBasicMaterial).opacity = banked ? 0.15 : done ? 0.85 : 0.35;
    }
  }

  /** A blow landed on the next wall: it shudders. */
  hitWall(strength: number): void {
    this.wobble = 0.28;
    this.wobbleStrength = Math.min(0.35, 0.12 + strength * 0.25);
  }

  /** A wall fell: its chunks burst away from the player. */
  breakWall(id: number, x: number): void {
    const wall = WALLS[id];
    const stage = wall ? STAGES[wall.stage - 1] : undefined;
    if (!wall || !stage) return;
    this.debris.burst(wall.z, HW, H, stage.palette.wall, stage.palette.accent, x);
    const slot = this.slots.find((s) => s.wall === id);
    if (slot) slot.group.visible = false;
  }

  update(delta: number, playerZ: number, camera: Vector3): void {
    this.time += delta;
    this.stream(playerZ);
    for (const stage of this.built.values()) {
      for (const spinner of stage.spinners) spinner.rotation.z += delta * 0.8;
      for (const bag of stage.bags) bag.update(delta);
      // A label the camera is inside fills the screen: hide it until the camera backs off.
      const label = stage.claimLabel.sprite;
      label.position.y = 3.2 + Math.sin(this.time * 2 + stage.def.index) * 0.2;
      const clear = camera.distanceToSquared(label.position) > LABEL_CLEARANCE * LABEL_CLEARANCE;
      if (label.visible !== clear) label.visible = clear;
    }
    this.debris.update(delta);

    // The next wall: its health counts down smoothly; its cracks deepen; it wobbles.
    const wall = WALLS[this.wallsBroken];
    if (!wall) return;
    const k = 1 - Math.exp(-12 * delta);
    this.shownHp += (this.wallHp - this.shownHp) * k;
    if (Math.abs(this.shownHp - this.wallHp) < wall.hp * 0.001) this.shownHp = this.wallHp;
    const fraction = wall.hp > 0 ? this.wallHp / wall.hp : 1;
    const level = crackLevelFor(fraction);
    if (level !== this.crackLevel) {
      this.crackLevel = level;
      this.crackMaterial.map = crackTexture(level);
      this.crackMaterial.needsUpdate = true;
      this.crack.visible = level > 0 && level <= CRACK_LEVELS;
    }
    this.panel.draw(wall.id + 1, STAGES[wall.stage - 1]!, wall.boss, this.shownHp, wall.hp);
    const slot = this.slots.find((s) => s.wall === wall.id);
    if (slot) {
      if (this.wobble > 0) {
        this.wobble = Math.max(0, this.wobble - delta);
        const t = this.wobble / 0.28;
        const shake = Math.sin(this.time * 70) * this.wobbleStrength * t;
        slot.group.position.x = shake;
        slot.group.position.z = wall.z + Math.abs(shake) * 0.6;
        this.crack.position.x = shake;
      } else if (slot.group.position.x !== 0) {
        slot.group.position.x = 0;
        slot.group.position.z = wall.z;
        this.crack.position.x = 0;
      }
    }
  }

  dispose(): void {
    for (const stage of this.built.values()) this.unbuild(stage);
    this.built.clear();
    this.endSign.dispose();
    this.panel.dispose();
    this.debris.dispose();
    this.crackMaterial.dispose();
    this.slabGeometry.dispose();
    this.root.removeFromParent();
  }
}

/**
 * The next wall's own readout, painted on its face as the reference does: the
 * wall's LEVEL number big, and a health bar with "376 / 376" - a red BOSS tag
 * on a stage's last wall. Redrawn only when the shown figure changes.
 */
class WallPanel {
  readonly mesh: Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private signature = '';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.mesh = new Mesh(new PlaneGeometry(13, 6.5), new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.mesh.rotation.y = Math.PI;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
  }

  draw(level: number, def: StageDef, boss: boolean, hp: number, max: number): void {
    const shown = Math.max(0, Math.ceil(hp));
    const signature = `${level}|${shown}|${boss ? 1 : 0}`;
    if (signature === this.signature) return;
    this.signature = signature;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const w = this.canvas.width;
    ctx.clearRect(0, 0, w, this.canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const text = (value: string, y: number, size: number, fill: string, italic = false): void => {
      ctx.font = `${italic ? 'italic ' : ''}800 ${size}px "Fredoka", "Baloo 2", "Nunito", system-ui, sans-serif`;
      ctx.lineWidth = size * 0.2;
      ctx.strokeStyle = '#141822';
      ctx.strokeText(value, w / 2, y);
      ctx.fillStyle = fill;
      ctx.fillText(value, w / 2, y);
    };
    if (boss) {
      text(`BOSS  ${level}`, 62, 78, '#ff4a5a');
      text(def.name, 120, 30, '#ffd8d8', true);
    } else {
      text(String(level), 66, 96, '#ffffff');
    }
    // The bar: green for what is left, red for what is gone, like the reference.
    const bx = 56;
    const by = 160;
    const bw = w - 112;
    const bh = 52;
    const fraction = max > 0 ? Math.min(1, Math.max(0, hp / max)) : 0;
    ctx.fillStyle = '#141822';
    roundRect(ctx, bx - 5, by - 5, bw + 10, bh + 10, 16);
    ctx.fill();
    ctx.fillStyle = '#e8303a';
    roundRect(ctx, bx, by, bw, bh, 12);
    ctx.fill();
    if (fraction > 0) {
      ctx.fillStyle = boss ? '#ff7a2a' : '#4ae84a';
      roundRect(ctx, bx, by, Math.max(24, bw * fraction), bh, 12);
      ctx.fill();
    }
    text(`${formatAmount(shown)}/${formatAmount(max)}`, by + bh / 2 + 2, 38, '#ffffff');
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.mesh.geometry.dispose();
  }
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

