/**
 * THE WALL STAGES, down the corridor through the STAGES portal ahead of the
 * spawn: fifty themed areas from the training grounds to the Throne of the
 * Strongest.
 *
 * Walls are numbered down the whole corridor - wall 1, 2, 3 ... - and that
 * number is what the game calls a LEVEL of the course ("Level 10 -> +1 Win").
 * Every stage is one stretch of corridor:
 *
 *   - a training NOOK at its entrance (two Bronze bags and the stage's board);
 *   - its WALLS, one after another across the corridor: 10 in the first stage,
 *     15 in the second, 20 in the third and 25 in every stage after - the last
 *     of them a BOSS, a cursed spirit bound into the wall (more health, and the
 *     Boss Damage upgrade hits it harder);
 *   - past the boss, its WIN AREA: the claim pad, alternately on the right and
 *     the left, which banks the stage's Wins. The first three pay at Level 10
 *     (+1), Level 25 (+5) and Level 45 (+25); every stage after pays twice the
 *     one before.
 *
 *   - A wall is broken by the player standing at it: every blow takes the
 *     player's whole Cursed Energy off its health (`damageOfEnergy`). Walls
 *     fall in order: the next one is only reachable once the one before it is
 *     down, and each wall is SOLID until broken (shared collision).
 *   - A RUN begins whenever the player is placed at the spawn (join, a
 *     respawn, a teleport home, a rebirth, a knockout, a claim): every wall
 *     stands again and every claim is open again. A teleport to a later stage
 *     starts a run there, the stages before it counted as claimed.
 *
 * Every figure is the SERVER's: it holds the wall's health, decides each blow
 * and pays each claim. `verify:progression` pins the economy.
 */

/** How a stage is BUILT around the corridor (the client's `world/zones`). */
export type StageTheme =
  | 'dojo'
  | 'street'
  | 'school'
  | 'tunnel'
  | 'interior'
  | 'forest'
  | 'cemetery'
  | 'industrial'
  | 'rooftop'
  | 'ruins'
  | 'volcano'
  | 'flooded'
  | 'shadow'
  | 'shrine'
  | 'domain'
  | 'void';

/** What its walls are made of (the client's `world/WallMaterials.ts`). */
export type WallMaterial =
  | 'talisman'
  | 'shutter'
  | 'brick'
  | 'wood'
  | 'concrete'
  | 'board'
  | 'flesh'
  | 'bark'
  | 'grave'
  | 'tile'
  | 'steel'
  | 'rubble'
  | 'magma'
  | 'coral'
  | 'shadow'
  | 'barrier'
  | 'stone'
  | 'bone'
  | 'crystal'
  | 'void'
  | 'gold'
  | 'obsidian'
  | 'bamboo';

/** A stage's colours (0xRRGGBB): its walls, floor, side walls, accent, sky and fog. */
export interface StagePalette {
  readonly wall: number;
  readonly floor: number;
  readonly side: number;
  readonly accent: number;
  readonly sky: number;
  readonly fog: number;
}

export interface StageDef {
  readonly index: number;
  readonly name: string;
  readonly theme: StageTheme;
  /** A flavour of its theme (a neon street, a bamboo forest, Sukuna's shrine ...). */
  readonly variant: string;
  readonly material: WallMaterial;
  /** Open sky (true) or a roof overhead. */
  readonly outdoor: boolean;
  /** Health of each wall, the boss last. */
  readonly wallHp: readonly number[];
  readonly bossHp: number;
  readonly wallCount: number;
  /** Wins its claim pays. */
  readonly reward: number;
  /** Global id of its first wall (walls are numbered down the whole corridor). */
  readonly firstWall: number;
  readonly startZ: number;
  readonly endZ: number;
  /** Centre z of each wall. */
  readonly wallZ: readonly number[];
  /** Centre of its claim pad: beside the lane, so a player can walk past it and push on. */
  readonly claimX: number;
  readonly claimZ: number;
  /** Centre z of its two nook bags. */
  readonly bagZ: number;
  readonly palette: StagePalette;
}

export interface WallDef {
  /** Global id: the index into WALLS, and the order walls fall in. The LEVEL shown is id + 1. */
  readonly id: number;
  readonly stage: number;
  /** 0-based position within its stage. */
  readonly layer: number;
  readonly z: number;
  readonly hp: number;
  /** The stage's last wall: its boss. */
  readonly boss: boolean;
}

/** The corridor every stage lies along (+Z), starting at the back of the spawn hall's front wall. */
export const CORRIDOR = {
  halfWidth: 16,
  height: 16,
  startZ: 44,
  /** Thickness of the side walls (beyond the half width). */
  sideDepth: 6,
} as const;

/** A wall's thickness, and the distance between two walls' centres. */
export const WALL_THICKNESS = 1.2;
export const WALL_GAP = 3.4;
/** Length of a stage's entrance nook (its bags and board), before its first wall. */
const NOOK = 24;
/** From the boss to the claim pad, and to the end of the stage: a roomy win area. */
const CLAIM_OFFSET = 9;
const STAGE_TAIL = 18;
/** The claim pad's half size. */
export const CLAIM_PAD_HALF = 3.4;
/** How far from the centre line the claim pad stands, clear of the lane down the middle. */
export const CLAIM_PAD_OFFSET = CORRIDOR.halfWidth - CLAIM_PAD_HALF - 2.6;

interface Plan {
  readonly name: string;
  readonly theme: StageTheme;
  readonly variant: string;
  readonly material: WallMaterial;
  readonly outdoor: boolean;
  /** wall, floor, side, accent, sky, fog */
  readonly c: readonly [number, number, number, number, number, number];
}

const PLANS: readonly Plan[] = [
  { name: 'Cursed Energy Training Grounds', theme: 'dojo', variant: 'dojo', material: 'talisman', outdoor: false, c: [0xf4ecd8, 0xb8875a, 0xe8dcc0, 0x8a6aff, 0x1a1430, 0x2a2040] },
  { name: 'Tokyo Street', theme: 'street', variant: 'city', material: 'shutter', outdoor: true, c: [0x9aa0b0, 0x3a3d48, 0x8a8ea0, 0xff4a8a, 0x2a3a7a, 0x4a5a8a] },
  { name: 'School Courtyard', theme: 'school', variant: 'modern', material: 'brick', outdoor: true, c: [0xb8442e, 0xc8b89a, 0xe8e4dc, 0x3aa04a, 0x8ac8ff, 0xb8dcff] },
  { name: 'Jujutsu High', theme: 'school', variant: 'temple', material: 'wood', outdoor: true, c: [0x8a5a3a, 0x8a8a8a, 0xc8b8a0, 0xc8202c, 0x9ac0e8, 0xc8d8e8] },
  { name: 'Underground Passage', theme: 'tunnel', variant: 'passage', material: 'concrete', outdoor: false, c: [0x9a9ea8, 0x5a5e68, 0x8a8e98, 0xffc23a, 0x101418, 0x1a2028] },
  { name: 'Abandoned Classroom', theme: 'interior', variant: 'classroom', material: 'board', outdoor: false, c: [0x2f5a3a, 0x8a6a4a, 0xb8c8b0, 0x5aff8a, 0x1a1a14, 0x2a2a20] },
  { name: 'Cursed Building', theme: 'interior', variant: 'cursed', material: 'flesh', outdoor: false, c: [0x6a4a6a, 0x4a4448, 0x6a5a60, 0xb83aff, 0x140c14, 0x201820] },
  { name: 'Dark Alley', theme: 'street', variant: 'alley', material: 'brick', outdoor: true, c: [0x7a3a2e, 0x2a2a30, 0x4a3a3a, 0xff3a3a, 0x0a0a14, 0x14141e] },
  { name: 'Forest', theme: 'forest', variant: 'green', material: 'bark', outdoor: true, c: [0x6a4a2a, 0x4a8a3a, 0x3a6a2a, 0xffd23a, 0x9ad8ff, 0xb8e0c8] },
  { name: 'Cursed Forest', theme: 'forest', variant: 'cursed', material: 'bark', outdoor: true, c: [0x3a2a1a, 0x2a3a24, 0x1a2a14, 0xb83aff, 0x1a1028, 0x2a1a3a] },
  { name: 'Cemetery', theme: 'cemetery', variant: 'night', material: 'grave', outdoor: true, c: [0x8a8a92, 0x4a5a3a, 0x6a6a70, 0x7affd8, 0x141a2a, 0x2a3040] },
  { name: 'Subway', theme: 'tunnel', variant: 'subway', material: 'tile', outdoor: false, c: [0xc8d0d8, 0x6a6a72, 0xd8e0e8, 0x3ad8ff, 0x101418, 0x1a2028] },
  { name: 'Underground Station', theme: 'tunnel', variant: 'station', material: 'steel', outdoor: false, c: [0x6a7a8e, 0x8a8a90, 0xb8b0a0, 0xffd23a, 0x14161a, 0x202428] },
  { name: 'Industrial District', theme: 'industrial', variant: 'factory', material: 'steel', outdoor: true, c: [0x6a6e78, 0x5a5a5a, 0x7a6a5a, 0xff8a3a, 0x8a7a6a, 0x9a8a7a] },
  { name: 'Abandoned Hospital', theme: 'interior', variant: 'hospital', material: 'tile', outdoor: false, c: [0xb8c8b8, 0xa8b0a0, 0xc8d8c8, 0xff3a3a, 0x101814, 0x1a2420] },
  { name: 'Rooftop District', theme: 'rooftop', variant: 'sunset', material: 'concrete', outdoor: true, c: [0x9a9ea8, 0x8a8a90, 0x6a6a7a, 0xff9a3a, 0xff9a6a, 0xffb88a] },
  { name: 'Shibuya Streets', theme: 'street', variant: 'neon', material: 'shutter', outdoor: true, c: [0x4a4a5a, 0x2a2a34, 0x5a5a6a, 0xff5ae8, 0x0a0a1e, 0x1a1430] },
  { name: 'Destroyed City', theme: 'ruins', variant: 'city', material: 'rubble', outdoor: true, c: [0x8a847a, 0x6a6460, 0x5a5450, 0xff6a1c, 0x5a4a4a, 0x6a5a58] },
  { name: 'Cursed City', theme: 'ruins', variant: 'cursed', material: 'flesh', outdoor: true, c: [0x5a3a5a, 0x3a2a3a, 0x4a3a4a, 0xff3ad8, 0x2a0a2a, 0x3a1a3a] },
  { name: 'Disaster Zone', theme: 'ruins', variant: 'storm', material: 'rubble', outdoor: true, c: [0x5a524a, 0x4a4440, 0x3a3430, 0xffd23a, 0x2a2a30, 0x3a3a40] },
  { name: 'Volcano Fire Zone', theme: 'volcano', variant: 'volcano', material: 'magma', outdoor: true, c: [0x3a1410, 0x2a1a18, 0x3a2420, 0xff6a1c, 0x3a0a04, 0x5a1a0a] },
  { name: 'Flooded Cursed Zone', theme: 'flooded', variant: 'cursed', material: 'coral', outdoor: true, c: [0x3a7a8a, 0x2a5a7a, 0x2a4a5a, 0x3affd8, 0x1a3a5a, 0x2a5a7a] },
  { name: 'Shadow Domain', theme: 'shadow', variant: 'shadow', material: 'shadow', outdoor: true, c: [0x1a1a2a, 0x0e0e14, 0x16161e, 0x6a5aff, 0x05050a, 0x0a0a14] },
  { name: "Mahito's Soul Zone", theme: 'domain', variant: 'hands', material: 'flesh', outdoor: true, c: [0x8aa0b8, 0x6a7a8a, 0x4a5a6a, 0x7affd8, 0x1a2a3a, 0x2a3a4a] },
  { name: 'Domain Entrance', theme: 'shrine', variant: 'barrier', material: 'barrier', outdoor: true, c: [0x5a4aaa, 0x2a2a3a, 0x3a3a5a, 0x9a7aff, 0x0a0a1a, 0x1a1a3a] },
  { name: 'Heavenly Restriction Arena', theme: 'shrine', variant: 'arena', material: 'stone', outdoor: true, c: [0x9a8a7a, 0xb8a888, 0x8a7a6a, 0x6aff9a, 0x7aa0c8, 0xa8b8c8] },
  { name: 'Ancient Shrine', theme: 'shrine', variant: 'shrine', material: 'wood', outdoor: true, c: [0xb8202c, 0x9a9a92, 0x5a3a2a, 0xff3a2a, 0xffb8a8, 0xffd0c0] },
  { name: 'Giant Cursed Shrine', theme: 'shrine', variant: 'cursed', material: 'bone', outdoor: true, c: [0xe8e0c8, 0x3a2a2a, 0x2a1a1a, 0xff2a3a, 0x2a0a0a, 0x3a1414] },
  { name: 'Domain Battlefield', theme: 'domain', variant: 'clash', material: 'crystal', outdoor: true, c: [0x8a5aff, 0x2a2a4a, 0x1a1a3a, 0xff5ae8, 0x14082a, 0x24143a] },
  { name: 'Infinite Void', theme: 'void', variant: 'blue', material: 'void', outdoor: true, c: [0x1a2a5a, 0xe8f4ff, 0x0a1428, 0x8ae8ff, 0x020410, 0x0a1428] },
  { name: 'Sakura Temple', theme: 'shrine', variant: 'sakura', material: 'wood', outdoor: true, c: [0xc89a7a, 0xd8c8b8, 0x8a5a4a, 0xff8ab8, 0xffd8e8, 0xffe0ee] },
  { name: 'Kyoto Jujutsu High', theme: 'school', variant: 'kyoto', material: 'wood', outdoor: true, c: [0x6a4a2a, 0x9a9088, 0xd8c8a8, 0x3a6ad8, 0xc8b8e8, 0xd8d0f0] },
  { name: 'Bamboo Grove', theme: 'forest', variant: 'bamboo', material: 'bamboo', outdoor: true, c: [0x7aa04a, 0x6a8a4a, 0x4a7a3a, 0xd8ff6a, 0xc8e8b8, 0xd8f0d0] },
  { name: 'Night Market', theme: 'street', variant: 'market', material: 'wood', outdoor: true, c: [0x8a5a3a, 0x4a3a34, 0x6a4a3a, 0xff9a2a, 0x14102a, 0x2a1a30] },
  { name: 'Train Yard', theme: 'industrial', variant: 'trains', material: 'steel', outdoor: true, c: [0x7a6a5a, 0x5a4a40, 0x6a5a50, 0xffc23a, 0xd88a5a, 0xc89a7a] },
  { name: 'Detention Center', theme: 'interior', variant: 'prison', material: 'steel', outdoor: false, c: [0x6a6a72, 0x5a5a5e, 0x7a7a80, 0xff3a3a, 0x0e0e12, 0x1a1a1e] },
  { name: 'Culling Game Colony', theme: 'ruins', variant: 'colony', material: 'concrete', outdoor: true, c: [0x7a746a, 0x5a5450, 0x4a4440, 0x3ad8ff, 0x3a4a6a, 0x4a5a7a] },
  { name: 'Prison Realm', theme: 'domain', variant: 'eye', material: 'flesh', outdoor: true, c: [0x4a2a3a, 0x2a1a24, 0x3a2430, 0xffd23a, 0x0a0408, 0x1a0a14] },
  { name: "Mahoraga's Wheel", theme: 'shrine', variant: 'wheel', material: 'gold', outdoor: true, c: [0xe8d8a8, 0xd8d0c0, 0xb8b0a0, 0xffd23a, 0x8aa8d8, 0xb8c8e8] },
  { name: 'Coffin of the Iron Mountain', theme: 'volcano', variant: 'coffin', material: 'magma', outdoor: true, c: [0x4a1a0a, 0x1a0a08, 0x2a1410, 0xffd23a, 0x5a1404, 0x7a2a0a] },
  { name: 'Horizon of Skandha', theme: 'flooded', variant: 'beach', material: 'coral', outdoor: true, c: [0xff8a6a, 0xe8d8a8, 0x3a8aaa, 0x5affff, 0x5ad8ff, 0x9ae8ff] },
  { name: 'Chimera Shadow Garden', theme: 'shadow', variant: 'garden', material: 'shadow', outdoor: true, c: [0x14141e, 0x0a0a10, 0x12121c, 0x9a7aff, 0x020206, 0x08080e] },
  { name: 'Self-Embodiment of Perfection', theme: 'domain', variant: 'hands', material: 'flesh', outdoor: true, c: [0x5a6a8a, 0x3a4a5a, 0x2a3a4a, 0x7affd8, 0x0a1420, 0x1a2430] },
  { name: 'Cursed Womb Depths', theme: 'domain', variant: 'womb', material: 'flesh', outdoor: true, c: [0x6a1a24, 0x4a141a, 0x3a0a10, 0xff4a5a, 0x1a0004, 0x2a0408] },
  { name: 'Malevolent Shrine', theme: 'domain', variant: 'shrine', material: 'bone', outdoor: true, c: [0xe0d8c0, 0x3a0a0a, 0x2a0a0a, 0xff1a2a, 0x1a0000, 0x3a0404] },
  { name: 'Unlimited Void', theme: 'void', variant: 'galaxy', material: 'void', outdoor: true, c: [0x2a2a6a, 0xc8f0ff, 0x0a0a2a, 0xffffff, 0x000008, 0x060618] },
  { name: 'Hollow Purple Rift', theme: 'void', variant: 'purple', material: 'crystal', outdoor: true, c: [0x8a3aff, 0x2a0a3a, 0x1a0a2a, 0xff5aff, 0x0a0014, 0x1a0a2a] },
  { name: 'Heian Battlefield', theme: 'ruins', variant: 'heian', material: 'stone', outdoor: true, c: [0x8a7a6a, 0x6a5a4a, 0x5a4a3a, 0xffb03a, 0xc87a4a, 0xd8a07a] },
  { name: 'Throne of Curses', theme: 'domain', variant: 'throne', material: 'obsidian', outdoor: true, c: [0x2a1418, 0x1a0a0a, 0x140808, 0xff2a1a, 0x0a0000, 0x1a0404] },
  { name: 'Throne of the Strongest', theme: 'void', variant: 'heaven', material: 'gold', outdoor: true, c: [0xffe8a8, 0xf0e8d8, 0xd8c8a0, 0xffd23a, 0xfff4d8, 0xfff0e0] },
];

/** Two significant figures, so every health and reward reads cleanly: 3.1K, 92K, 2.8M. */
const nice = (value: number): number => {
  if (value < 100) return Math.max(1, Math.round(value));
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
};

/** Walls per stage: Level 10, 25 and 45 end the first three; 25 a stage after that. */
const WALLS_FIXED = [10, 15, 20];
const WALLS_LATER = 25;
/** Wins per stage: +1, +5, +25, then twice the stage before. */
const REWARD_FIXED = [1, 5, 25];
const REWARD_GROWTH = 1.42;
/**
 * THE WALL CURVE: the Cursed Energy a wall takes, by its Level (its 1-based
 * number down the corridor, the HUD's "Level N").
 *
 * It passes EXACTLY through the reference game's requirements at the start of
 * the first four stages - Level 1: 50, Level 11: 376, Level 26: 4.1K, Level 46:
 * 70.3K - as a smooth exponential: ln(HP) is a monotone cubic (Hermite) through
 * those four points, so between them every wall is a steady 14-22% tougher than
 * the last. Past Level 46 the per-wall growth eases from that 14% toward
 * `TAIL_GROWTH` over `TAIL_EASE` walls: still exponential (HP keeps
 * multiplying, faster in absolute terms every stage), but slow enough that the
 * very last wall stays within what characters x auras x bags x rebirths can
 * reach. `verify:progression` pins the resulting pacing.
 *
 * Every wall is strictly tougher than the one before it, bosses included: a
 * stage's boss is simply its last and hardest wall (Boss Damage applies to it).
 */
const CURVE_ANCHORS: readonly (readonly [number, number])[] = [
  [1, 50],
  [11, 376],
  [26, 4_100],
  [46, 70_300],
];
/** Per-wall growth (in ln) the tail eases toward, and over how many walls. */
const TAIL_GROWTH = 0.012;
const TAIL_EASE = 110;

const lnHpAt = (() => {
  const knots = CURVE_ANCHORS.map(([level, hp]) => [level, Math.log(hp)] as const);
  const secants: number[] = [];
  for (let i = 1; i < knots.length; i += 1) secants.push((knots[i]![1] - knots[i - 1]![1]) / (knots[i]![0] - knots[i - 1]![0]));
  // Knot slopes: the outer secants at the ends, the mean of the neighbours inside.
  const slopes = knots.map((_, i) => (i === 0 ? secants[0]! : i === knots.length - 1 ? secants[i - 1]! : (secants[i - 1]! + secants[i]!) / 2));
  const [lastLevel, lastLn] = knots[knots.length - 1]!;
  const lastSlope = slopes[slopes.length - 1]!;
  return (level: number): number => {
    if (level >= lastLevel) {
      const x = level - lastLevel;
      return lastLn + TAIL_GROWTH * x + (lastSlope - TAIL_GROWTH) * TAIL_EASE * (1 - Math.exp(-x / TAIL_EASE));
    }
    let i = 0;
    while (level > knots[i + 1]![0]) i += 1;
    const [x0, y0] = knots[i]!;
    const [x1, y1] = knots[i + 1]!;
    const h = x1 - x0;
    const t = (level - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * slopes[i]! + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * slopes[i + 1]!;
  };
})();

/**
 * Whole numbers below 1K, four significant figures above (376, 4,100, 70,300,
 * 1.234M) - fine enough that rounding never eats the late 1.2% steps - and
 * always more than the wall before.
 */
const wallHpCurve = (count: number): number[] => {
  const list: number[] = [];
  for (let level = 1; level <= count; level += 1) {
    const raw = Math.exp(lnHpAt(level));
    const step = raw < 1000 ? 1 : 10 ** (Math.floor(Math.log10(raw)) - 3);
    let hp = Math.round(raw / step) * step;
    const previous = list[list.length - 1] ?? 0;
    if (hp <= previous) hp = previous + (previous < 1000 ? 1 : 10 ** (Math.floor(Math.log10(previous)) - 3));
    list.push(hp);
  }
  return list;
};

const build = (): { stages: StageDef[]; walls: WallDef[] } => {
  const stages: StageDef[] = [];
  const walls: WallDef[] = [];
  let z: number = CORRIDOR.startZ;
  const total = PLANS.reduce((sum, _, i) => sum + (WALLS_FIXED[i] ?? WALLS_LATER), 0);
  const curve = wallHpCurve(total);
  PLANS.forEach((plan, i) => {
    const index = i + 1;
    const wallCount = WALLS_FIXED[i] ?? WALLS_LATER;
    const reward = i < REWARD_FIXED.length ? REWARD_FIXED[i]! : nice(REWARD_FIXED[REWARD_FIXED.length - 1]! * REWARD_GROWTH ** (i - REWARD_FIXED.length + 1));
    const wallHp = curve.slice(walls.length, walls.length + wallCount);
    const bossHp = wallHp[wallHp.length - 1]!;

    const startZ = z;
    const wallZ: number[] = [];
    for (let layer = 0; layer < wallCount; layer += 1) {
      const wz = startZ + NOOK + layer * WALL_GAP;
      wallZ.push(wz);
      walls.push({ id: walls.length, stage: index, layer, z: wz, hp: wallHp[layer]!, boss: layer === wallCount - 1 });
    }
    const last = wallZ[wallZ.length - 1]!;
    const endZ = last + STAGE_TAIL;
    const [wall, floor, side, accent, sky, fog] = plan.c;
    stages.push({
      index,
      name: plan.name,
      theme: plan.theme,
      variant: plan.variant,
      material: plan.material,
      outdoor: plan.outdoor,
      wallHp,
      bossHp,
      wallCount,
      reward,
      firstWall: walls.length - wallCount,
      startZ,
      endZ,
      wallZ,
      // Odd stages pay on the right (-X), even ones on the left: the course weaves.
      claimX: index % 2 === 1 ? -CLAIM_PAD_OFFSET : CLAIM_PAD_OFFSET,
      claimZ: last + CLAIM_OFFSET,
      bagZ: startZ + 9,
      palette: { wall, floor, side, accent, sky, fog },
    });
    z = endZ;
  });
  return { stages, walls };
};

const BUILT = build();

export const STAGES: readonly StageDef[] = BUILT.stages;
export const WALLS: readonly WallDef[] = BUILT.walls;
export const STAGE_COUNT = STAGES.length;
export const TOTAL_WALLS = WALLS.length;
/** Where the corridor ends: the back of the last stage. */
export const CORRIDOR_END_Z = STAGES[STAGES.length - 1]!.endZ;

export const stageByIndex = (index: number): StageDef | undefined => STAGES[Math.floor(index) - 1];
export const wallById = (id: number): WallDef | undefined => WALLS[Math.floor(id)];

/** Which stage a point of the corridor is in, or 0 outside it. Binary search: fifty stages. */
export const stageAt = (z: number): number => {
  if (z < CORRIDOR.startZ || z >= CORRIDOR_END_Z) return 0;
  let lo = 0;
  let hi = STAGES.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (STAGES[mid]!.startZ <= z) lo = mid;
    else hi = mid - 1;
  }
  return STAGES[lo]!.index;
};

/** True once `wallsBroken` (walls down this run, in order) includes every wall of the stage. */
export const stageComplete = (wallsBroken: number, stage: number): boolean => {
  const def = stageByIndex(stage);
  return !!def && wallsBroken >= def.firstWall + def.wallCount;
};

/** The stage whose wall is next to fall, or 0 when every wall is down. */
export const currentWallStage = (wallsBroken: number): number => wallById(wallsBroken)?.stage ?? 0;

/** Damage one blow at a wall deals: the player's whole Cursed Energy (at least 1). */
export const damageOfEnergy = (energy: number): number => Math.max(1, Math.floor(Number.isFinite(energy) ? energy : 1));

/**
 * The run's CLAIMED stages, as a bit mask in a float64 (bit `stage - 1`):
 * exact for every one of the fifty stages, where a uint32 would stop at 32.
 */
const bitOf = (stage: number): number => 2 ** (Math.floor(stage) - 1);
export const isClaimed = (mask: number, stage: number): boolean => {
  if (stage < 1 || stage > STAGE_COUNT) return false;
  const m = Number.isFinite(mask) ? Math.max(0, Math.floor(mask)) : 0;
  return Math.floor(m / bitOf(stage)) % 2 === 1;
};
export const withClaimed = (mask: number, stage: number): number => (isClaimed(mask, stage) ? mask : Math.floor(Math.max(0, mask)) + bitOf(stage));
/** Every stage before `stage` marked claimed (a run started at that stage). */
export const claimedBefore = (stage: number): number => bitOf(Math.max(1, Math.min(STAGE_COUNT + 1, Math.floor(stage)))) - 1;
