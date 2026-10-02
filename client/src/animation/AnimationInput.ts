import type { AttackStyle } from '../config/animationConfig.js';

/**
 * The gameplay signals the animator consumes each frame. It reads these and
 * never writes back. The local player fills it from its prediction and every
 * remote from replicated state, so both run the exact same animation code.
 */
export interface AnimationInput {
  grounded: boolean;
  /** Horizontal speed in world units per second. */
  horizontalSpeed: number;
  verticalVelocity: number;
  /** -1..1 steering, for the lean. */
  turn: number;
  landed: boolean;
  /** Seconds since the current action (a blow or a training punch) began, or -1. */
  punchTime: number;
  /** Which fist punches (alternates: 0 right, 1 left). */
  punchVariant: number;
  /** True while the fighting guard holds (just after a blow). */
  guard: boolean;
  /** Which action plays: a blow (at a wall or a player), or a training punch. */
  style: AttackStyle;
  /**
   * Running in place on a treadmill: the legs run the cycle at this speed
   * while the body stays where it is. 0 off a treadmill.
   */
  treadmillSpeed: number;
}

export const createAnimationInput = (): AnimationInput => ({
  grounded: true,
  horizontalSpeed: 0,
  verticalVelocity: 0,
  turn: 0,
  landed: false,
  punchTime: -1,
  punchVariant: 0,
  guard: false,
  style: 'punch',
  treadmillSpeed: 0,
});
