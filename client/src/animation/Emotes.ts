import { Euler, Quaternion } from 'three';
import { logger } from '../util/logger.js';
import type { PoseBuffer } from './PoseBuffer.js';
import type { BoneName } from './rig/boneNames.js';

const SCOPE = 'emotes';

/** Bloxity's emote catalogue: fetched once, grown without a game release. */
const CATALOGUE_URL = 'https://api.bloxity.io/v1/avatar/emotes';

/** Seconds to blend into (and out of) an emote rather than snapping to its pose. */
export const EMOTE_BLEND = 0.1;

/**
 * BLOXITY EMOTES, played on THIS game's own rig.
 *
 * The catalogue's clips are authored for Bloxity's `player.glb`: per bone,
 * keys of `[t, x, y, z]` DEGREES, deltas over the bind pose, XYZ euler order,
 * right-multiplied onto the bone's bind quaternion (`bind * D`), eased between
 * keys with smoothstep. This game's sculpted bodies ride a 12-bone rig with the
 * same names but different bind orientations and no `_Offset` bones, so the
 * clips cannot be applied raw.
 *
 * They are converted instead, exactly: a local delta `D` on a bone whose bind
 * orientation in the model is `W` is the character-space rotation
 * `C = W * D * W^-1`, and `PlayerRig` poses every bone as a character-space
 * rotation relative to its parent - which composes down a chain the same way
 * `player.glb`'s locals do. `ArmX_Offset` and `ArmX1` both turn the shoulder,
 * so their rotations are composed (parent first) onto this rig's `ArmX1`.
 *
 * `W` per bone is `player.glb`'s bind orientation relative to its scene root,
 * read off the live model (facing +Z, left +X - the same frame as the sculpted
 * bodies). Tracks for any other bone are ignored.
 */
const BIND: Readonly<Record<string, readonly [number, number, number, number]>> = {
  Spine1: [0, 0, 0, 1],
  Spine2: [0, 0, 0, 1],
  Neck1: [0, 0, 0, 1],
  ArmR_Offset: [0, 0, 0, 1],
  ArmR1: [0.70711, 0, -0.70711, 0],
  ArmR2: [-0.12218, 0, 0.99251, 0],
  ArmL_Offset: [0, 0, 0, 1],
  ArmL1: [-0.70711, 0, 0.70711, 0],
  ArmL2: [0.12218, 0, 0.99251, 0],
  LegR1: [-0.70711, 0, 0.70711, 0],
  LegR2: [-0.70711, 0, 0.70711, 0],
  LegL1: [-0.70711, 0, 0.70711, 0],
  LegL2: [-0.70711, 0, 0.70711, 0],
};

/** Which bone of this rig each Bloxity bone drives. Listed parent first where two share one. */
const TARGETS: readonly (readonly [string, BoneName])[] = [
  ['Spine1', 'Spine1'],
  ['Spine2', 'Spine2'],
  ['Neck1', 'Neck1'],
  ['ArmR_Offset', 'ArmR1'],
  ['ArmR1', 'ArmR1'],
  ['ArmR2', 'ArmR2'],
  ['ArmL_Offset', 'ArmL1'],
  ['ArmL1', 'ArmL1'],
  ['ArmL2', 'ArmL2'],
  ['LegR1', 'LegR1'],
  ['LegR2', 'LegR2'],
  ['LegL1', 'LegL1'],
  ['LegL2', 'LegL2'],
];

type Key = readonly [number, number, number, number];

interface Track {
  readonly source: string;
  readonly target: BoneName;
  readonly keys: readonly Key[];
  /** Bind orientation and its inverse. */
  readonly w: Quaternion;
  readonly wi: Quaternion;
}

export interface Emote {
  readonly id: string;
  readonly name: string;
  readonly len: number;
  readonly loop: boolean;
  readonly tracks: readonly Track[];
}

/** Catalogue ids: 24 hex characters. Anything else is ignored before it reaches a lookup. */
export const isEmoteId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id);

const emotes = new Map<string, Emote>();
let loading: Promise<void> | null = null;

const parseClip = (raw: unknown): Emote | null => {
  const entry = raw as { id?: unknown; name?: unknown; clip?: { len?: unknown; loop?: unknown; tracks?: unknown } };
  if (!isEmoteId(entry?.id) || !entry.clip || typeof entry.clip !== 'object') return null;
  const len = Number(entry.clip.len);
  if (!Number.isFinite(len) || len <= 0) return null;
  const tracksRaw = (entry.clip.tracks ?? {}) as Record<string, unknown>;
  const tracks: Track[] = [];
  for (const [source, target] of TARGETS) {
    const keysRaw = tracksRaw[source];
    const bind = BIND[source];
    if (!Array.isArray(keysRaw) || !bind) continue;
    const keys = keysRaw
      .filter((key): key is number[] => Array.isArray(key) && key.length >= 4 && key.slice(0, 4).every((v) => Number.isFinite(v)))
      .map((key) => [key[0]!, key[1]!, key[2]!, key[3]!] as const)
      .sort((a, b) => a[0] - b[0]);
    if (keys.length === 0) continue;
    const w = new Quaternion(bind[0], bind[1], bind[2], bind[3]).normalize();
    tracks.push({ source, target, keys, w, wi: w.clone().invert() });
  }
  return { id: entry.id.toLowerCase(), name: typeof entry.name === 'string' ? entry.name : entry.id, len, loop: entry.clip.loop !== false, tracks };
};

/** Fetch the catalogue once (at startup). Failure leaves emotes unavailable; nothing throws. */
export const loadEmotes = (): Promise<void> => {
  loading ??= fetch(CATALOGUE_URL)
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { emotes?: unknown[] };
      for (const raw of body.emotes ?? []) {
        const emote = parseClip(raw);
        if (emote) emotes.set(emote.id, emote);
      }
      logger.info(SCOPE, `${emotes.size} emotes loaded`);
    })
    .catch((error: unknown) => {
      logger.warn(SCOPE, `emote catalogue unavailable: ${String(error)}`);
      loading = null;
    });
  return loading;
};

export const emoteById = (id: string): Emote | undefined => emotes.get(id.toLowerCase());

const EULER = new Euler();
const D = new Quaternion();
const C = new Quaternion();
const composed = new Map<BoneName, Quaternion>();
const DEG = Math.PI / 180;

/** One track's degrees at time t: clamped outside the keys, smoothstep between them. */
const sample = (keys: readonly Key[], t: number, out: [number, number, number]): void => {
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  if (t <= first[0]) {
    out[0] = first[1];
    out[1] = first[2];
    out[2] = first[3];
    return;
  }
  if (t >= last[0]) {
    out[0] = last[1];
    out[1] = last[2];
    out[2] = last[3];
    return;
  }
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]![0] <= t) i += 1;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  let s = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
  s = s * s * (3 - 2 * s);
  out[0] = a[1] + (b[1] - a[1]) * s;
  out[1] = a[2] + (b[2] - a[2]) * s;
  out[2] = a[3] + (b[3] - a[3]) * s;
};

const DEGREES: [number, number, number] = [0, 0, 0];

/** Write an emote's pose at `time` into a pose buffer (only the bones it drives). */
export const writeEmotePose = (emote: Emote, time: number, pose: PoseBuffer): void => {
  const t = emote.loop ? ((time % emote.len) + emote.len) % emote.len : Math.min(time, emote.len);
  composed.clear();
  for (const track of emote.tracks) {
    sample(track.keys, t, DEGREES);
    EULER.set(DEGREES[0] * DEG, DEGREES[1] * DEG, DEGREES[2] * DEG, 'XYZ');
    D.setFromEuler(EULER);
    // The local delta as a character-space rotation: W * D * W^-1.
    C.copy(track.w).multiply(D).multiply(track.wi);
    const existing = composed.get(track.target);
    if (existing) existing.multiply(C);
    else composed.set(track.target, C.clone());
  }
  for (const [bone, q] of composed) {
    // PlayerRig applies Rz * Ry * Rx about the character axes: the ZYX euler of the rotation.
    EULER.setFromQuaternion(q, 'ZYX');
    pose.set(bone, EULER.x, EULER.y, EULER.z);
  }
};

/**
 * One character's emote: which one, how far in, and how strongly it holds the
 * body (blended in and out over `EMOTE_BLEND`). Stopped by the owner the
 * moment the character moves, so it never fights the walk cycle.
 */
export class EmotePlayer {
  private emote: Emote | null = null;
  private time = 0;
  private weight = 0;
  private stopping = false;

  get active(): boolean {
    return this.emote !== null && this.weight > 0;
  }

  get currentId(): string {
    return this.stopping ? '' : (this.emote?.id ?? '');
  }

  /** Start an emote by catalogue id. An unknown id is ignored silently. */
  play(id: string): boolean {
    const emote = emoteById(id);
    if (!emote) return false;
    if (this.emote?.id === id && !this.stopping) return true;
    this.emote = emote;
    this.time = 0;
    this.stopping = false;
    return true;
  }

  stop(): void {
    if (this.emote) this.stopping = true;
  }

  /** Advance, and blend the emote over `pose` (the body's own animation) by its weight. */
  apply(dt: number, pose: PoseBuffer, scratch: PoseBuffer): void {
    const emote = this.emote;
    if (!emote) return;
    this.time += dt;
    const rate = dt / EMOTE_BLEND;
    this.weight = this.stopping ? Math.max(0, this.weight - rate) : Math.min(1, this.weight + rate);
    if (this.stopping && this.weight <= 0) {
      this.emote = null;
      this.stopping = false;
      return;
    }
    // The clips are deltas over the BIND pose: the whole body blends toward bind + clip, so a bone
    // the clip leaves alone rests (rather than holding a flex or a guard from underneath).
    scratch.reset();
    writeEmotePose(emote, this.time, scratch);
    pose.lerpBetween(pose, scratch, this.weight);
  }
}
