import type { PoseDefinition } from '../animation/PoseBuffer.js';

const deg = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Procedural animation tuning. Every number the animator uses lives here.
 * All rotations are in CHARACTER space (see `PlayerRig`): +X pitch swings a
 * limb BACKWARD, so a raised arm is a large negative X.
 */

/** The walk/run cycle: ONE cycle at three depths. */
export const LOCOMOTION = {
  minFrequency: 0.7,
  maxFrequency: 3.6,
  strideDistance: 5.2,
  idleSpeed: 0.6,
  walkSpeed: 4,
  runSpeed: 14,
  sprintSpeed: 30,

  hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
  kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
  armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
  elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
  torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
  torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
  headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
  torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
  bob: { walk: 0.05, run: 0.11, sprint: 0.15 },
  bankAngle: deg(9),
  bankRate: 8,
} as const;

/** The idle: standing loose and breathing, fists relaxed by the thighs. */
export const IDLE = {
  breathFrequency: 0.35,
  breathAmount: deg(1.8),
  breathBob: 0.012,
  basePose: {
    ArmL1: { x: deg(-6), z: deg(5) },
    ArmL2: { x: deg(-22) },
    ArmR1: { x: deg(-4), z: deg(-5) },
    ArmR2: { x: deg(-18) },
    LegL1: { x: deg(-3) },
    LegR1: { x: deg(3) },
  } satisfies PoseDefinition,
} as const;

/** In the air: knees tucked on the way up, legs reaching on the way down. */
export const AIRBORNE = {
  rise: {
    LegL1: { x: deg(-38) },
    LegR1: { x: deg(8) },
    LegL2: { x: deg(62) },
    LegR2: { x: deg(40) },
    ArmL1: { x: deg(-40), z: deg(34) },
    ArmR1: { x: deg(-30), z: deg(-34) },
    ArmL2: { x: deg(30) },
    ArmR2: { x: deg(30) },
    Spine1: { x: deg(6) },
  } satisfies PoseDefinition,
  fall: {
    LegL1: { x: deg(-14) },
    LegR1: { x: deg(10) },
    LegL2: { x: deg(22) },
    LegR2: { x: deg(18) },
    ArmL1: { x: deg(-70), z: deg(40) },
    ArmR1: { x: deg(-60), z: deg(-40) },
    ArmL2: { x: deg(20) },
    ArmR2: { x: deg(20) },
    Spine1: { x: deg(-4) },
  } satisfies PoseDefinition,
  velocityReference: 20,
} as const;

/** The landing crouch: knees give, arms out for balance. */
export const LANDING = {
  duration: 0.16,
  pose: {
    LegL1: { x: deg(-34) },
    LegR1: { x: deg(-34) },
    LegL2: { x: deg(58) },
    LegR2: { x: deg(58) },
    ArmL1: { x: deg(-30), z: deg(34) },
    ArmR1: { x: deg(-36), z: deg(-14) },
    Spine1: { x: deg(18) },
  } satisfies PoseDefinition,
  bobY: -0.42,
} as const;


/** Seconds a pose change takes to blend in. */
export const TRANSITIONS = {
  toLocomotion: 0.14,
  toAirborne: 0.12,
  toLanding: 0.06,
} as const;

/**
 * THE STANCE: after a few seconds standing still without punching, the body
 * drops into a sorcerer's fighting stance - feet wide, knees bent, the lead
 * fist up by the chin and the rear one chambered at the hip - and the aura
 * flares with it, pulsing every couple of seconds. Any move, jump or punch
 * drops it at once.
 */
export const FLEX = {
  /** Seconds of stillness before the stance, and how long it takes to settle. */
  after: 3.2,
  settle: 0.4,
  /** Seconds between two pulses, and how far a pulse tightens the guard. */
  squeezePeriod: 2.2,
  squeeze: deg(6),
  pose: {
    ArmL1: { x: deg(-62), z: deg(22) },
    ArmL2: { x: deg(-100) },
    ArmR1: { x: deg(-24), z: deg(-30) },
    ArmR2: { x: deg(-118) },
    Spine1: { x: deg(10), y: deg(-18) },
    Spine2: { y: deg(-6) },
    Neck1: { x: deg(-8), y: deg(18) },
    LegL1: { x: deg(-26), z: deg(10) },
    LegR1: { x: deg(18), z: deg(-10) },
    LegL2: { x: deg(30) },
    LegR2: { x: deg(26) },
  } satisfies PoseDefinition,
} as const;

// ------------------------------------------------------------------ punches

/**
 * A PUNCH in three beats over `duration` seconds: WIND (the fist chambered
 * back, the torso coiled), HIT (the arm snapped straight at the target, the
 * shoulders turned into it, a small lunge) and RECOVER back to the guard.
 * Variants alternate fists - a jab, then a cross. Layered over whatever the
 * legs are doing, so a player can punch on the run.
 */
export interface AttackAnimation {
  readonly duration: number;
  readonly windEnd: number;
  readonly hitEnd: number;
  readonly legs: boolean;
  readonly lean: number;
  readonly stance: PoseDefinition;
  readonly variants: readonly { readonly wind: PoseDefinition; readonly hit: PoseDefinition }[];
}

export type AttackStyle = 'punch' | 'train';

/** The fighting guard: both fists up in front of the chin, elbows in. */
const GUARD: PoseDefinition = {
  ArmR1: { x: deg(-52), z: deg(-12) },
  ArmR2: { x: deg(-104) },
  ArmL1: { x: deg(-58), z: deg(12) },
  ArmL2: { x: deg(-108) },
  Spine1: { x: deg(4) },
};

/** The training guard: tighter and lower than the fighting one, ready to work a bag. */
const BAG_GUARD: PoseDefinition = {
  ArmR1: { x: deg(-46), z: deg(-14) },
  ArmR2: { x: deg(-112) },
  ArmL1: { x: deg(-50), z: deg(14) },
  ArmL2: { x: deg(-114) },
  Spine1: { x: deg(8) },
  LegL1: { x: deg(-12) },
  LegR1: { x: deg(10) },
};

const merge = (base: PoseDefinition, over: PoseDefinition): PoseDefinition => ({ ...base, ...over });

const attack = (
  duration: number,
  stance: PoseDefinition,
  variants: readonly { wind: PoseDefinition; hit: PoseDefinition }[],
  options: { legs?: boolean; lean?: number; windEnd?: number; hitEnd?: number } = {},
): AttackAnimation => ({
  duration,
  windEnd: options.windEnd ?? 0.3,
  hitEnd: options.hitEnd ?? 0.58,
  legs: options.legs ?? false,
  lean: options.lean ?? deg(6),
  stance,
  variants: variants.map((v) => ({ wind: merge(stance, v.wind), hit: merge(stance, v.hit) })),
});

export const ATTACKS: Readonly<Record<AttackStyle, AttackAnimation>> = {
  /** The player: a snapping jab, then a cross with the shoulders behind it. */
  punch: attack(0.3, GUARD, [
    {
      wind: { ArmR1: { x: deg(-40), z: deg(-18) }, ArmR2: { x: deg(-125) }, Spine1: { y: deg(-18) }, Spine2: { y: deg(-8) }, Neck1: { y: deg(10) } },
      hit: { ArmR1: { x: deg(-92), z: deg(6) }, ArmR2: { x: deg(-4) }, Spine1: { y: deg(24) }, Spine2: { y: deg(12) }, Neck1: { y: deg(-14) }, LegR1: { x: deg(10) }, LegL1: { x: deg(-18) }, LegL2: { x: deg(14) } },
    },
    {
      wind: { ArmL1: { x: deg(-40), z: deg(18) }, ArmL2: { x: deg(-125) }, Spine1: { y: deg(18) }, Spine2: { y: deg(8) }, Neck1: { y: deg(-10) } },
      hit: { ArmL1: { x: deg(-92), z: deg(-6) }, ArmL2: { x: deg(-4) }, Spine1: { y: deg(-24) }, Spine2: { y: deg(-12) }, Neck1: { y: deg(14) }, LegL1: { x: deg(10) }, LegR1: { x: deg(-18) }, LegR2: { x: deg(14) } },
    },
  ], { windEnd: 0.22, hitEnd: 0.46, legs: true, lean: deg(9) }),
  /**
   * TRAINING: a fast three-punch combination on the bag (or the air) - a
   * snapping jab, a straight cross, a rising hook - quicker and tighter than
   * a full blow. Upper body only, so it plays on the move.
   */
  train: attack(0.26, BAG_GUARD, [
    {
      wind: { ArmL1: { x: deg(-44), z: deg(18) }, ArmL2: { x: deg(-122) }, Spine1: { y: deg(10) } },
      hit: { ArmL1: { x: deg(-88), z: deg(-4) }, ArmL2: { x: deg(-6) }, Spine1: { y: deg(-16) }, Spine2: { y: deg(-8) }, Neck1: { y: deg(10) } },
    },
    {
      wind: { ArmR1: { x: deg(-38), z: deg(-20) }, ArmR2: { x: deg(-128) }, Spine1: { y: deg(-14) }, Spine2: { y: deg(-6) } },
      hit: { ArmR1: { x: deg(-90), z: deg(4) }, ArmR2: { x: deg(-4) }, Spine1: { y: deg(22) }, Spine2: { y: deg(12) }, Neck1: { y: deg(-12) } },
    },
    {
      wind: { ArmL1: { x: deg(-30), z: deg(36) }, ArmL2: { x: deg(-96) }, Spine1: { y: deg(16), x: deg(10) } },
      hit: { ArmL1: { x: deg(-104), z: deg(-28) }, ArmL2: { x: deg(-86) }, Spine1: { y: deg(-26), x: deg(-4) }, Spine2: { y: deg(-10) }, Neck1: { y: deg(14) } },
    },
  ], { windEnd: 0.2, hitEnd: 0.46, legs: false, lean: deg(6) }),
};

/** Seconds from the start of an action to its impact frame (the blow lands, or the plates reach the top). */
export const impactSeconds = (style: AttackStyle): number => {
  const anim = ATTACKS[style];
  return anim.duration * (anim.windEnd + (anim.hitEnd - anim.windEnd) * 0.5);
};
