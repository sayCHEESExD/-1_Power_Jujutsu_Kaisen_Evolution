import type { Aabb } from '../types/math.js';
import { BAG_SIZE } from './bags.js';
import { CHARACTER_COUNT } from './characters.js';
import { CORRIDOR, CORRIDOR_END_Z, STAGES, WALLS, WALL_THICKNESS } from './stages.js';

/**
 * THE MAP, as pure data. Every coordinate in the game lives here; collision
 * (shared, both sides) and the client's visuals both read it, so the thing a
 * player walks on and the thing they see cannot drift apart.
 *
 * The spawn faces +Z, so the camera's RIGHT at the spawn is world -X and its
 * LEFT is world +X:
 *
 *   - the CHARACTER ROW is LEFT of the spawn (+X): twelve sorcerers on their
 *     pedestals along a low dais, Yuji to Toji, as the reference's morph row;
 *   - the CURSED ENERGY TRAINING ZONE is RIGHT of it (-X): six kinds of
 *     training bag, two of each, the stronger ones on a raised dojo floor;
 *   - the SCOREBOARDS and the PVP gate are BEHIND it (-Z), the arena beyond
 *     the back wall;
 *   - the STAGES portal is straight ahead (+Z), into the wall corridor, with
 *     the UPGRADER and the AURA SHRINE either side of it.
 */

export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Facing, radians: 0 faces +Z, -PI/2 faces -X. */
  readonly yaw: number;
}

export const SPAWN: Placement = { x: 0, y: 0, z: 0, yaw: 0 };

/** The spawn hall: the walkable rectangle inside its walls. */
export const HUB = { minX: -64, maxX: 64, minZ: -40, maxZ: 40, height: 34 } as const;
/** Front and back walls' depth. */
export const HUB_WALL_DEPTH = 4;

/** The stage portal through the front wall: exactly the corridor's width. */
export const PORTAL = { halfWidth: CORRIDOR.halfWidth, height: 14 } as const;

const aabb = (minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): Aabb => ({ minX, maxX, minY, maxY, minZ, maxZ });

/** A dais a player steps onto without jumping (under `MOVEMENT.stepHeight`). */
export const DAIS_HEIGHT = 0.9;

// ------------------------------------------------------------ characters

/**
 * THE CHARACTER ROW, left of the spawn: one long dais against the hall's +X
 * wall, twelve pedestals along it facing the spawn. Standing on a pedestal
 * equips its character (a request the server checks).
 */
export const CHARACTER_STAND = {
  minX: 48,
  maxX: HUB.maxX,
  minZ: -34,
  maxZ: 34,
  top: DAIS_HEIGHT,
  padX: 55,
  /** Standing within this of a pedestal's centre equips its character. */
  padRadius: 2.1,
  spacing: 5.5,
} as const;

export interface CharacterPad {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Yuji at the back end ... Toji nearest the portal: seen from the hall, the row reads left to right. */
export const CHARACTER_PADS: readonly CharacterPad[] = (() => {
  const pads: CharacterPad[] = [];
  const s = CHARACTER_STAND;
  const first = -((CHARACTER_COUNT - 1) * s.spacing) / 2;
  for (let id = 1; id <= CHARACTER_COUNT; id += 1) {
    pads.push({ id, x: s.padX, y: s.top, z: first + (id - 1) * s.spacing });
  }
  return pads;
})();

// ------------------------------------------------------------ training

/**
 * THE CURSED ENERGY TRAINING ZONE, right of the spawn: the front row of bags
 * on the hall floor, the back row on a raised dojo floor (a step up).
 */
export const TRAINING_ZONE = {
  minX: HUB.minX,
  maxX: -26,
  minZ: -34,
  maxZ: 34,
  frontX: -36,
  backX: -56,
  /** The raised dojo floor under the back row. */
  dojo: { minX: HUB.minX, maxX: -46, top: DAIS_HEIGHT },
} as const;

export interface BagPlacement {
  /** Index into BAGS: replicated as the bag a player trains at. */
  readonly id: number;
  readonly tier: number;
  /** Centre of the bag. */
  readonly x: number;
  readonly z: number;
  /** Height of the floor it hangs over. */
  readonly floor: number;
  /** Which way its mat lies from it: +1 = toward +X, -1 = toward -X. */
  readonly facing: -1 | 1;
  /** The stage whose nook it stands in, or 0 for the spawn hall. */
  readonly stage: number;
}

/** [tier, back row?, z] of the hall's twelve bags: each kind a pair, side by side. */
const HUB_BAGS: readonly (readonly [number, boolean, number])[] = [
  [0, false, 25],
  [0, false, 15],
  [1, false, 5],
  [1, false, -5],
  [2, false, -15],
  [2, false, -25],
  [3, true, 25],
  [3, true, 15],
  [4, true, 5],
  [4, true, -5],
  [5, true, -15],
  [5, true, -25],
];

/** The nook bags hang against the side walls, their mats toward the lane. */
const NOOK_BAG_X = CORRIDOR.halfWidth - 2.4;

export const BAGS: readonly BagPlacement[] = (() => {
  const list: BagPlacement[] = [];
  for (const [tier, back, z] of HUB_BAGS) {
    list.push({ id: list.length, tier, x: back ? TRAINING_ZONE.backX : TRAINING_ZONE.frontX, z, floor: back ? DAIS_HEIGHT : 0, facing: 1, stage: 0 });
  }
  for (const stage of STAGES) {
    for (const side of [-1, 1] as const) {
      list.push({ id: list.length, tier: 0, x: side * NOOK_BAG_X, z: stage.bagZ, floor: 0, facing: side === 1 ? -1 : 1, stage: stage.index });
    }
  }
  return list;
})();

/** A bag's solid: the bag and the post it hangs from, behind it. */
export const bagSolid = (b: BagPlacement): Aabb => {
  const h = BAG_SIZE.half;
  const back = b.x - b.facing * 1.6;
  return aabb(Math.min(b.x - h, back), Math.max(b.x + h, back), b.floor, b.floor + BAG_SIZE.top + 0.6, b.z - h, b.z + h);
};

/** The bag whose mat a player stands on, or -1. */
export const bagAt = (x: number, y: number, z: number): number => {
  const s = BAG_SIZE;
  for (const b of BAGS) {
    if (Math.abs(z - b.z) > s.matHalf) continue;
    const d = (x - b.x) * b.facing;
    if (d < s.matNear || d > s.matFar) continue;
    if (Math.abs(y - b.floor) > 0.35) continue;
    return b.id;
  }
  return -1;
};

export const bagTierOf = (id: number): number => BAGS[id]?.tier ?? -1;

// --------------------------------------------------------------- booths

/**
 * Two booths flanking the portal: the UPGRADER (right) and the AURA SHRINE
 * (left). Walking into one opens its menu - a convenience, the same menus the
 * HUD buttons open. Each is open toward the spawn (-Z).
 */
export type BoothKind = 'upgrader' | 'auras';
export const BOOTHS: readonly { readonly kind: BoothKind; readonly x: number; readonly z: number }[] = [
  { kind: 'upgrader', x: -24, z: 31 },
  { kind: 'auras', x: 24, z: 31 },
];
export const BOOTH_HALF = 3;

/** The booth whose floor a player stands on, or null. */
export const boothAt = (x: number, z: number): BoothKind | null => {
  for (const booth of BOOTHS) {
    if (Math.abs(x - booth.x) <= BOOTH_HALF - 0.6 && z >= booth.z - BOOTH_HALF && z <= booth.z + BOOTH_HALF - 0.6) return booth.kind;
  }
  return null;
};

// ------------------------------------------------------------- the back

/** THE PVP ARENA, beyond the hall's back wall, through its gate. */
export const PVP_ARENA = { minX: -36, maxX: 36, minZ: -104, maxZ: HUB.minZ - HUB_WALL_DEPTH, height: 26 } as const;
/** The gate through the back wall into the arena: solid below the arena's rebirths. */
export const PVP_GATE = { halfWidth: 8, height: 12 } as const;

/** True inside the arena (past the gate). */
export const inPvpZone = (x: number, z: number): boolean =>
  x >= PVP_ARENA.minX && x <= PVP_ARENA.maxX && z >= PVP_ARENA.minZ && z <= PVP_ARENA.maxZ;

/** The gate's barrier: solid for anyone the arena is closed to. */
export const pvpGateBox = (): Aabb => aabb(-PVP_GATE.halfWidth, PVP_GATE.halfWidth, -2, PVP_GATE.height, HUB.minZ - 2.6, HUB.minZ - 1.4);

/** The four torii pillars at the corners of the arena's battle stage, solid. */
export const PVP_POSTS: readonly (readonly [number, number])[] = [
  [-26, -52],
  [26, -52],
  [-26, -96],
  [26, -96],
];
export const PVP_POST_HALF = 0.9;

/** The four scoreboards on the back wall, facing the spawn: two either side of the PvP gate. */
export type BoardCategory = 'energy' | 'rebirths' | 'wins' | 'playtime';
export const BOARDS = {
  z: HUB.minZ + 0.2,
  width: 18,
  height: 14,
  items: [
    { category: 'energy' as BoardCategory, x: -45, y: 12 },
    { category: 'rebirths' as BoardCategory, x: -21, y: 12 },
    { category: 'wins' as BoardCategory, x: 21, y: 12 },
    { category: 'playtime' as BoardCategory, x: 45, y: 12 },
  ],
} as const;

// ------------------------------------------------------------------ Solids

/**
 * Every STATIC solid in the world, as boxes. The walls of the stages and the
 * PvP gate are separate (`WALLS`, `pvpGateBox`): whether they are solid
 * depends on the player.
 */
export const buildStaticSolids = (): Aabb[] => {
  const boxes: Aabb[] = [];
  const box = (minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): void => {
    boxes.push({ minX, maxX, minY, maxY, minZ, maxZ });
  };
  const top = 60;
  const back0 = HUB.minZ - HUB_WALL_DEPTH;
  const front1 = HUB.maxZ + HUB_WALL_DEPTH;

  // The hall's side walls.
  box(HUB.minX - 30, HUB.minX, -2, top, back0, front1);
  box(HUB.maxX, HUB.maxX + 30, -2, top, back0, front1);
  // The front wall, with the portal through it.
  box(HUB.minX, -PORTAL.halfWidth, -2, top, HUB.maxZ, front1);
  box(PORTAL.halfWidth, HUB.maxX, -2, top, HUB.maxZ, front1);
  box(-PORTAL.halfWidth, PORTAL.halfWidth, PORTAL.height, top, HUB.maxZ, front1);
  // The back wall, with the PvP gate through it.
  box(HUB.minX, -PVP_GATE.halfWidth, -2, top, back0, HUB.minZ);
  box(PVP_GATE.halfWidth, HUB.maxX, -2, top, back0, HUB.minZ);
  box(-PVP_GATE.halfWidth, PVP_GATE.halfWidth, PVP_GATE.height, top, back0, HUB.minZ);

  // The character dais and the dojo floor: a step up, no stairs needed.
  const cs = CHARACTER_STAND;
  box(cs.minX, cs.maxX, -1, cs.top, cs.minZ, cs.maxZ);
  const dojo = TRAINING_ZONE.dojo;
  box(dojo.minX, dojo.maxX, -1, dojo.top, TRAINING_ZONE.minZ, TRAINING_ZONE.maxZ);
  for (const bag of BAGS) boxes.push(bagSolid(bag));

  // The booths: a back wall and two side walls each, open toward the spawn.
  for (const booth of BOOTHS) {
    const h = BOOTH_HALF;
    box(booth.x - h, booth.x + h, 0, 7, booth.z + h - 0.6, booth.z + h);
    box(booth.x - h, booth.x - h + 0.6, 0, 7, booth.z - h, booth.z + h);
    box(booth.x + h - 0.6, booth.x + h, 0, 7, booth.z - h, booth.z + h);
  }

  // The arena: its side and back walls, and the torii pillars.
  box(PVP_ARENA.minX - 20, PVP_ARENA.minX, -2, top, PVP_ARENA.minZ - 20, back0);
  box(PVP_ARENA.maxX, PVP_ARENA.maxX + 20, -2, top, PVP_ARENA.minZ - 20, back0);
  box(PVP_ARENA.minX, PVP_ARENA.maxX, -2, top, PVP_ARENA.minZ - 20, PVP_ARENA.minZ);
  for (const [x, z] of PVP_POSTS) box(x - PVP_POST_HALF, x + PVP_POST_HALF, 0, 9, z - PVP_POST_HALF, z + PVP_POST_HALF);

  // The corridor: both side walls and the end wall.
  const w = CORRIDOR.halfWidth;
  box(-w - CORRIDOR.sideDepth, -w, -2, top, front1, CORRIDOR_END_Z + 6);
  box(w, w + CORRIDOR.sideDepth, -2, top, front1, CORRIDOR_END_Z + 6);
  box(-w, w, -2, top, CORRIDOR_END_Z, CORRIDOR_END_Z + 6);
  return boxes;
};

/** One stage wall's solid, across the whole corridor. */
export const wallBox = (z: number): Aabb =>
  aabb(-CORRIDOR.halfWidth, CORRIDOR.halfWidth, -2, CORRIDOR.height + 4, z - WALL_THICKNESS / 2, z + WALL_THICKNESS / 2);

/** The whole walkable world, for a hard clamp that no displacement can tunnel. */
export const worldBounds = (): Aabb => ({ minX: HUB.minX, maxX: HUB.maxX, minY: -5, maxY: 200, minZ: PVP_ARENA.minZ, maxZ: CORRIDOR_END_Z });

/** The highest the head may ever be: under the corridor's ceiling, the arena's or the hall's. */
export const headCeilingAt = (z: number): number => (z > HUB.maxZ ? CORRIDOR.height - 0.4 : z < HUB.minZ ? PVP_ARENA.height : HUB.height - 4);

// --------------------------------------------------------------- Teleports

export type NamedTeleport = 'spawn' | 'characters' | 'training' | 'pvp';
export type TeleportId = NamedTeleport | `stage${number}`;

export const TELEPORTS: Readonly<Record<NamedTeleport, Placement>> = {
  spawn: SPAWN,
  characters: { x: 40, y: 0, z: 0, yaw: Math.PI / 2 },
  training: { x: -28, y: 0, z: 0, yaw: -Math.PI / 2 },
  pvp: { x: 0, y: 0, z: HUB.minZ + 8, yaw: Math.PI },
};

/** Where a stage teleport lands: just inside its nook. */
export const stageEntry = (stage: number): Placement => {
  const def = STAGES[Math.floor(stage) - 1];
  return { x: 0, y: 0, z: (def?.startZ ?? 0) + 3, yaw: 0 };
};

export const WALL_COUNT = WALLS.length;

export const inRect = (
  x: number,
  z: number,
  rect: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number },
): boolean => x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
