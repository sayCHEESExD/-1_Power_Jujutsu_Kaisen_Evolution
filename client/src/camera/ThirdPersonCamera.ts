import { CAMERA } from '@jjk/shared';
import { PerspectiveCamera, Vector3 } from 'three';

/**
 * Extra distance the camera starts a respawn from, in world units.
 *
 * A DELIBERATE effect, and not the artefact it replaces. Easing the follow
 * point across a respawn gap drags the camera through every position between
 * where the player died and where they came back; this moves only the DISTANCE
 * along the camera's own axis, so the shot is framed correctly throughout and
 * simply pulls in. Set to 0 to remove it.
 */
const RESPAWN_ZOOM_DISTANCE = 10;

/** How fast that extra distance is given up. Higher is snappier. */
const RESPAWN_ZOOM_RATE = 6.5;

const FORWARD = new Vector3();
const LOOK_TARGET = new Vector3();
const OFFSET = new Vector3();

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Third-person chase camera.
 *
 * The camera owns its OWN yaw and pitch, supplied by the mouse, and the mount
 * supplies only a position to orbit. That separation is the whole point: a
 * camera that trails the character's facing means pressing A turns the robot,
 * which turns the camera, which redefines what "forward" means - the classic
 * feedback loop where the movement keys end up steering the view.
 *
 * The simulation rotates its stick input by `yaw`, so the camera is the single
 * source of "which way is forward" and the robot's facing follows where it is
 * actually going.
 *
 * At speed it pulls back and widens. Late game runs at hundreds of units a
 * second, and a fixed camera makes the next gap arrive with no warning - the
 * dynamic framing is what buys the reaction time the obby needs.
 */
/** The room the camera must stay inside, around the point it follows. */
export interface CameraRoom {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export class ThirdPersonCamera {
  readonly camera: PerspectiveCamera;
  /**
   * The room around the followed point, or null for open air. Indoors the
   * camera's arm is SHORTENED to stay inside it, so it never looks through a
   * ceiling, a side wall or a wall the player has not broken yet.
   */
  room: ((x: number, y: number, z: number) => CameraRoom | null) | null = null;

  private readonly target = new Vector3();
  /** Smoothed point the camera orbits. The only thing that is smoothed. */
  private readonly followed = new Vector3();

  private orbitYaw = 0;
  private orbitPitch = 0.2;
  private initialised = false;

  /** Extra distance still to be given up by the respawn dolly. */
  private zoomOffset = 0;

  /**
   * The player's wheel zoom: what they asked for, and where it has eased to.
   *
   * Distinct from `zoomOffset` above, which is the respawn dolly and decays to
   * nothing. This one is a PREFERENCE and persists - across deaths, rebirths
   * and stages - because a player who chose their framing has not asked to
   * choose it again every time they respawn.
   */
  private zoomTarget = 0;
  private zoomEased = 0;

  /** Eased 0..1 speed factor driving the dynamic distance and FOV. */
  private rush = 0;

  private aspect = 1;

  constructor() {
    this.camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    this.camera.position.set(0, CAMERA.height, -CAMERA.distance);
  }

  /** Called by RendererManager whenever the drawing buffer changes size. */
  setViewport(width: number, height: number): void {
    this.aspect = width / Math.max(height, 1);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  /** The direction the camera faces. This is what "forward" means. */
  get yaw(): number {
    return this.orbitYaw;
  }

  /** Follow this position. The camera's own angles are unchanged. */
  setTarget(position: Vector3): void {
    this.target.copy(position);
  }

  private trauma = 0;
  private framing = 1;
  private framingTarget = 1;

  /**
   * Arrive at a position instead of easing to it. Used for a PLACEMENT.
   *
   * The smoothing exists to absorb a player who MOVED; a respawn or a server
   * correction is a player who was PLACED, and easing across that gap is what
   * produces a camera sitting a whole stage behind a player who has already
   * arrived.
   *
   * @param zoomIn play the respawn dolly. TRUE only for a respawn; a network
   *               correction must arrive invisibly, not announce itself.
   */
  snapTo(position: Vector3, zoomIn = false): void {
    this.target.copy(position);
    this.followed.copy(position);
    this.initialised = true;
    this.zoomOffset = zoomIn ? RESPAWN_ZOOM_DISTANCE : 0;
  }

  /**
   * A jolt: a punch landing, a knockout. Adds TRAUMA that decays fast; the
   * camera shakes by its square, so small hits nudge and big ones rattle.
   */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  /**
   * How tall the body being followed is: the framing grows with it, so a
   * Giga Chad fills the shot the way a couch potato does.
   */
  setSubjectHeight(height: number): void {
    this.framingTarget = clamp(height / 3.3, 1, 1.45);
  }

  /** Aim the orbit. Called every frame from the look source. */
  setOrbit(yaw: number, pitch: number): void {
    this.orbitYaw = yaw;
    this.orbitPitch = pitch;
  }

  /**
   * Push the camera out or pull it in, as an offset on the resting distance.
   *
   * Takes the input layer's ALREADY-CLAMPED accumulator, so the limits live in
   * one place. Called every frame like `setOrbit`; the easing below is what
   * turns a discrete wheel notch into a glide.
   */
  setZoom(offset: number): void {
    this.zoomTarget = offset;
  }

  /** Pull the camera in along its arm until it is inside the room. */
  private keepInside(): void {
    const room = this.room?.(this.followed.x, this.followed.y, this.followed.z);
    if (!room) return;
    const p = this.camera.position;
    const f = this.followed;
    const pivotY = f.y + CAMERA.lookAtHeight * this.framing;
    let t = 1;
    const limit = (from: number, to: number, min: number, max: number): void => {
      const d = to - from;
      if (to > max && d > 1e-6) t = Math.min(t, Math.max(0, (max - from) / d));
      if (to < min && d < -1e-6) t = Math.min(t, Math.max(0, (min - from) / d));
    };
    limit(f.x, p.x, room.minX, room.maxX);
    limit(pivotY, p.y, room.minY, room.maxY);
    limit(f.z, p.z, room.minZ, room.maxZ);
    if (t >= 1) return;
    p.set(f.x + (p.x - f.x) * t, pivotY + (p.y - pivotY) * t, f.z + (p.z - f.z) * t);
  }

  /**
   * @param speed the mount's horizontal speed, for the dynamic framing.
   */
  update(delta: number, speed: number): void {
    // ONE smoothing stage, applied to the point the camera follows.
    //
    // Smoothing the camera POSITION while taking the look target raw makes the
    // two disagree every frame, which is exactly what reads as vibration
    // however gentle the smoothing is. Deriving both from one smoothed point
    // means they cannot disagree.
    if (!this.initialised) {
      this.followed.copy(this.target);
      this.initialised = true;
    } else {
      // Frame-rate independent exponential smoothing.
      this.followed.lerp(this.target, 1 - Math.exp(-CAMERA.followLerp * delta));
    }

    if (this.zoomOffset > 0) {
      this.zoomOffset *= Math.exp(-RESPAWN_ZOOM_RATE * delta);
      if (this.zoomOffset < 0.01) this.zoomOffset = 0;
    }

    // The rush factor is eased hard: pulling back has to lag the speed change
    // or every landing would punch the camera in and out.
    const targetRush = clamp(speed / CAMERA.speedReference, 0, 1);
    this.rush += (targetRush - this.rush) * (1 - Math.exp(-CAMERA.speedEase * delta));

    // The player's zoom eases the same frame-rate independent way the follow
    // point does, so a notch glides rather than snapping.
    this.zoomEased +=
      (this.zoomTarget - this.zoomEased) * (1 - Math.exp(-CAMERA.zoomEase * delta));

    // Never let the sum reach the mount: the limits already guarantee it, and
    // this is what keeps that true if the framing is ever retuned.
    this.framing += (this.framingTarget - this.framing) * (1 - Math.exp(-2 * delta));
    const distance = Math.max(
      1,
      CAMERA.distance * this.framing + this.zoomEased + this.zoomOffset + CAMERA.speedDistance * this.rush,
    );
    const fov = CAMERA.fov + CAMERA.speedFov * this.rush;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Where the camera sits: back along its own yaw, lifted by its pitch. The
    // pitch shortens the horizontal reach as it rises, so the camera swings
    // over the mount rather than sliding away from it.
    const cosPitch = Math.cos(this.orbitPitch);
    const sinPitch = Math.sin(this.orbitPitch);

    FORWARD.set(
      Math.sin(this.orbitYaw) * cosPitch,
      0,
      Math.cos(this.orbitYaw) * cosPitch,
    );

    // Applied directly, not lerped again: the look angles must never lag the
    // mouse, and the follow point is already smooth.
    this.camera.position
      .copy(this.followed)
      .addScaledVector(FORWARD, -distance)
      .add(OFFSET.set(0, CAMERA.height * this.framing + sinPitch * distance, 0));

    this.keepInside();

    LOOK_TARGET.copy(this.followed).add(OFFSET.set(0, CAMERA.lookAtHeight * this.framing, 0));

    this.camera.lookAt(LOOK_TARGET);

    // The shake, on top of everything, never fed back into the follow.
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - delta * 2.6);
      const k = this.trauma * this.trauma * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
      this.camera.rotation.z += (Math.random() - 0.5) * k * 0.08;
    }
  }
}
