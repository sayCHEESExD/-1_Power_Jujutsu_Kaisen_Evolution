/**
 * A player's Bloxity appearance, as it crosses the wire.
 *
 * COSMETIC ONLY, and that is the whole reason this is allowed to come from a
 * client at all. Every other field on `PlayerState` is written by the server
 * from its own simulation, because every other field decides something. These
 * ids decide nothing: they choose which mesh and which texture a renderer
 * fetches from Bloxity's public catalogue, and a player who forged one would
 * succeed only in wearing a hat.
 *
 * What is deliberately NOT here: the account id, the username, the email, the
 * token - none of which any renderer needs, and all of which would be private
 * data broadcast to every player in the room. The ids below are already public
 * catalogue keys; they are the minimum that lets a remote client draw someone.
 */
export interface AvatarAppearance {
  /** Texture on the body. */
  skinId: string;
  /** Body-part meshes, swapped onto the shared skeleton. */
  headId: string;
  torsoId: string;
  armLId: string;
  armRId: string;
  legLId: string;
  legRId: string;
  /** Accessories, hung off a bone. */
  hatId: string;
  backId: string;
  /** Hair and masks: worn on the head like a hat, alongside one. */
  hairId: string;
  maskId: string;
  /** Painted onto the skin: the composite skin texture carries them (`skin-texture` route). */
  faceId: string;
  shirtId: string;
  pantsId: string;
  /** Body accessories: neck and chest (upper torso), waist, hands and shoes (worn as pairs). */
  neckId: string;
  chestId: string;
  waistId: string;
  handId: string;
  shoesId: string;
}

/**
 * Body proportions. Every value is a MULTIPLIER whose neutral is 1.
 *
 * Replicated alongside the ids because a proportion is as much a part of how
 * somebody looks as the parts they wear - a tall player who reads as
 * short-and-wide to everyone else is not "seeing their actual appearance".
 * They are floats rather than ids, so they are clamped rather than pattern
 * matched.
 */
export interface AvatarProportions {
  height: number;
  shoulderWidth: number;
  armLength: number;
  legOffsetX: number;
  torsoScaleX: number;
  neckHeight: number;
  headScale: number;
}

export interface AvatarLook {
  readonly appearance: AvatarAppearance;
  readonly proportions: AvatarProportions;
}

/** Nothing equipped: the bundled default character. */
export const DEFAULT_APPEARANCE: AvatarAppearance = {
  skinId: '',
  headId: '',
  torsoId: '',
  armLId: '',
  armRId: '',
  legLId: '',
  legRId: '',
  hatId: '',
  backId: '',
  hairId: '',
  maskId: '',
  faceId: '',
  shirtId: '',
  pantsId: '',
  neckId: '',
  chestId: '',
  waistId: '',
  handId: '',
  shoesId: '',
};

/** Neutral proportions. */
export const DEFAULT_PROPORTIONS: AvatarProportions = {
  height: 1,
  shoulderWidth: 1,
  armLength: 1,
  legOffsetX: 1,
  torsoScaleX: 1,
  neckHeight: 1,
  headScale: 1,
};

/** The slots, in one list, so nothing iterates a hand-written copy of them. */
export const AVATAR_SLOTS = [
  'skinId',
  'headId',
  'torsoId',
  'armLId',
  'armRId',
  'legLId',
  'legRId',
  'hatId',
  'backId',
  'hairId',
  'maskId',
  'faceId',
  'shirtId',
  'pantsId',
  'neckId',
  'chestId',
  'waistId',
  'handId',
  'shoesId',
] as const satisfies readonly (keyof AvatarAppearance)[];

export const PROPORTION_KEYS = [
  'height',
  'shoulderWidth',
  'armLength',
  'legOffsetX',
  'torsoScaleX',
  'neckHeight',
  'headScale',
] as const satisfies readonly (keyof AvatarProportions)[];

/**
 * Bloxity spells "nothing equipped" several ways.
 *
 * The SDK's own catalogue code tests for `'-1'`, and null, empty and the
 * string `'undefined'` all turn up in practice. One predicate, so a slot that
 * means "none" cannot be read as an id by one side and a blank by the other.
 */
const isNone = (id: string): boolean =>
  id === '' || id === '-1' || id === 'undefined' || id === 'null';

/**
 * A catalogue id, or the empty string.
 *
 * Bloxity ids are 24-character hex object ids, but the built-in items use
 * short numeric ones, so the shape is deliberately permissive and the LENGTH
 * is what is really being bounded: this string is replicated to every client
 * and pasted into a URL, so a client that sent a kilobyte of anything must not
 * be able to make everyone else fetch it.
 */
const cleanId = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (isNone(trimmed)) return '';
  if (trimmed.length > 32) return '';
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : '';
};

/**
 * The range Bloxity's customiser allows for each proportion (its own figures).
 * Anything outside one came from somewhere other than the customiser.
 */
export const PROPORTION_RANGES: Readonly<Record<keyof AvatarProportions, readonly [number, number]>> = {
  height: [0.5, 1.6],
  shoulderWidth: [0.5, 1.5],
  armLength: [0.05, 3],
  legOffsetX: [-0.7, 5],
  torsoScaleX: [0.3, 2],
  neckHeight: [0.94, 1.2],
  headScale: [0.3, 2.6],
};

/**
 * Clamp one proportion into Bloxity's range for it: a NaN would poison a
 * matrix, and an unbounded value is a player who can make themselves a mile
 * tall on everybody else's screen.
 */
const cleanProportion = (key: keyof AvatarProportions, raw: unknown): number => {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_PROPORTIONS[key];
  const [min, max] = PROPORTION_RANGES[key];
  return Math.min(Math.max(value, min), max);
};

/** Everything a client sends about its own appearance passes through here. */
export const sanitizeAppearance = (raw: unknown): AvatarAppearance => {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_APPEARANCE };
  for (const slot of AVATAR_SLOTS) out[slot] = cleanId(source[slot]);
  return out;
};

export const sanitizeProportions = (raw: unknown): AvatarProportions => {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PROPORTIONS };
  for (const key of PROPORTION_KEYS) out[key] = cleanProportion(key, source[key]);
  return out;
};

/** True when two looks would draw identically, so nothing is rebuilt for free. */
export const sameAppearance = (a: AvatarAppearance, b: AvatarAppearance): boolean =>
  AVATAR_SLOTS.every((slot) => a[slot] === b[slot]);

export const sameProportions = (a: AvatarProportions, b: AvatarProportions): boolean =>
  PROPORTION_KEYS.every((key) => a[key] === b[key]);

/** Nothing equipped at all - the player is signed out, or wearing defaults. */
export const isDefaultAppearance = (a: AvatarAppearance): boolean =>
  AVATAR_SLOTS.every((slot) => a[slot] === '');
