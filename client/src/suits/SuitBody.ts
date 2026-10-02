import { neckScale, type AvatarAppearance, type AvatarProportions } from '@jjk/shared';
import { Color, Group, Matrix4, Mesh, MeshToonMaterial, Object3D, Quaternion, Vector3, type Bone, type BufferGeometry } from 'three';
import { attachToMount } from '../animation/rig/BoneMounts.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import type { BoneName } from '../animation/rig/boneNames.js';
import { characterLook, type AccessoryContext, type AccessoryMaker, type LookDef } from '../characters/JjkCharacters.js';
import { toonGradient } from '../characters/toon.js';
import { playerModelLoader } from '../player/PlayerModelLoader.js';
import { meshesFor, PartBuilder, type PartKind } from '../render/PartBuilder.js';
import { measureBody, paintSuit, partBox, type BodyPart } from './SuitPainter.js';

/** The look slot that is no character at all: the player's own Bloxity avatar. */
export const AVATAR_SLOT = 0;

/** A player's Bloxity avatar: the equipped ids and the body proportions, as replicated. */
export interface AvatarLook {
  readonly appearance: AvatarAppearance;
  readonly proportions: AvatarProportions;
}

/**
 * What a body wears: a character (1..12), or AVATAR_SLOT - the player's own
 * Bloxity avatar, whose look then travels with it.
 */
export interface BodyLook {
  readonly character: number;
  readonly avatar?: AvatarLook;
}

/** What makes two avatars draw the same: every equipped id and every proportion. */
export const avatarKey = (avatar: AvatarLook | undefined): string => {
  if (!avatar) return '-';
  const a = avatar.appearance;
  const p = avatar.proportions;
  return [
    a.hatId, a.backId, a.skinId, a.headId, a.torsoId, a.armLId, a.armRId, a.legLId, a.legRId,
    a.hairId, a.maskId, a.faceId, a.shirtId, a.pantsId, a.neckId, a.chestId, a.waistId, a.handId, a.shoesId,
    ...[p.height, p.shoulderWidth, p.armLength, p.legOffsetX, p.torsoScaleX, p.neckHeight, p.headScale].map((n) => n.toFixed(3)),
  ].join('|');
};

export const lookKey = (look: BodyLook): string => (look.character === AVATAR_SLOT ? `avatar|${avatarKey(look.avatar)}` : `char|${look.character}`);

/** A body's measured part boxes, in model space with the body at the origin in its bind pose. */
export type PartBoxes = (part: BodyPart) => { min: Vector3; max: Vector3 } | null;

export type MountPoint = 'head' | 'back' | 'backLow' | 'chest' | 'belt' | 'handR' | 'handL';
const MOUNTS: readonly MountPoint[] = ['head', 'back', 'backLow', 'chest', 'belt', 'handR', 'handL'];

const MOUNT_BONE: Readonly<Record<MountPoint, BoneName>> = {
  head: 'Neck1',
  back: 'Spine1',
  backLow: 'Spine1',
  chest: 'Spine1',
  belt: 'Spine1',
  handR: 'ArmR2',
  handL: 'ArmL2',
};

const centreOf = (boxes: PartBoxes, part: BodyPart): Vector3 => {
  const box = boxes(part);
  return box ? box.min.clone().add(box.max).multiplyScalar(0.5) : new Vector3();
};

/** Where each mount sits on the measured body, in model space at the origin. */
const mountPoint = (boxes: PartBoxes, mount: MountPoint): Vector3 => {
  const torso = boxes('torso');
  const midX = torso ? (torso.min.x + torso.max.x) / 2 : 0;
  switch (mount) {
    case 'head':
      return centreOf(boxes, 'head');
    case 'back':
      return torso ? new Vector3(midX, torso.max.y - 0.12, torso.min.z - 0.02) : new Vector3();
    case 'backLow':
      return torso ? new Vector3(midX, torso.min.y + 0.3, torso.min.z - 0.02) : new Vector3();
    case 'chest':
      return torso ? new Vector3(midX, torso.min.y + (torso.max.y - torso.min.y) * 0.66, torso.max.z + 0.01) : new Vector3();
    case 'belt':
      return torso ? new Vector3(midX, torso.min.y + 0.14, torso.max.z + 0.01) : new Vector3();
    case 'handR':
    case 'handL': {
      const arm = boxes(mount === 'handR' ? 'armR' : 'armL');
      return arm ? new Vector3((arm.min.x + arm.max.x) / 2, arm.min.y + 0.14, (arm.min.z + arm.max.z) / 2) : new Vector3();
    }
  }
};

/**
 * Where a mount's accessory goes, in model space. The bundled body is measured
 * BEFORE the rig enlarges its head on the neck bone, so head pieces are grown
 * by the same factor about the same pivot - otherwise hair sits a size too
 * small, inside the head, and fights the face texture for its pixels.
 */
const frameOf = (boxes: PartBoxes, mount: MountPoint, bone: Bone): Matrix4 => {
  const at = mountPoint(boxes, mount);
  if (mount !== 'head') return new Matrix4().makeTranslation(at.x, at.y, at.z);
  const k = neckScale();
  const pivot = bone.getWorldPosition(new Vector3());
  const centre = at.sub(pivot).multiplyScalar(k).add(pivot);
  return new Matrix4().compose(centre, new Quaternion(), new Vector3(k, k, k));
};

/** The body's proportions, for sizing what the makers build. */
const contextOf = (boxes: PartBoxes): AccessoryContext => {
  const head = boxes('head');
  const torso = boxes('torso');
  const arm = boxes('armR');
  return {
    head: head ? head.max.y - head.min.y : 0.9,
    torsoW: torso ? torso.max.x - torso.min.x : 1.1,
    torsoD: torso ? torso.max.z - torso.min.z : 0.55,
    torsoH: torso ? torso.max.y - torso.min.y : 1.1,
    limb: arm ? arm.max.x - arm.min.x : 0.55,
  };
};

const materials = new Map<string, MeshToonMaterial>();
const geometryCache = new Map<string, Partial<Record<PartKind, BufferGeometry>>>();

/** One cel-shaded material per look, shared by every body wearing it. */
const materialFor = (key: string, def: LookDef, model: Object3D): MeshToonMaterial => {
  let material = materials.get(key);
  if (!material) {
    material = new MeshToonMaterial({ map: paintSuit(key, model, def.paint), gradientMap: toonGradient() });
    if (def.glow) {
      material.emissiveMap = paintSuit(`${key}-glow`, model, def.glow);
      material.emissive = new Color(0xffffff);
      material.emissiveIntensity = 1.4;
    }
    materials.set(key, material);
  }
  return material;
};

/** Geometry for one maker, built once and shared by every body that wears it. */
const geometryFor = (key: string, make: AccessoryMaker, context: AccessoryContext): Partial<Record<PartKind, BufferGeometry>> => {
  let geometries = geometryCache.get(key);
  if (!geometries) {
    const builder = new PartBuilder();
    make(builder, context);
    geometries = builder.geometries();
    geometryCache.set(key, geometries);
  }
  return geometries;
};

/**
 * A held item's turn in the fist: hand makers are authored along +Y from the
 * fist, which in the bind pose (arms down) runs back up the forearm. Rolled
 * 150 degrees about the arm's side axis, the item points down and forward out
 * of the grip - so a raised arm carries its blade forward and up.
 */
const GRIP = new Matrix4().makeRotationX((150 * Math.PI) / 180);

/**
 * Bolt a look's accessories (hair, hoods, weapons) to a body's bones, and mark
 * the fists where blows land. Works on the painted body and on a Bloxity
 * avatar's own measured body alike; `kind` keys the geometry cache.
 */
export const boltOn = (model: Object3D, key: string, def: LookDef | null, boxes: PartBoxes, kind: string): Object3D => {
  const root = new Group();
  const wasParent = model.parent;
  model.rotation.set(0, 0, 0);
  root.add(model);
  const rig = new PlayerRig(model, model);
  rig.resetToBindPose();
  root.updateMatrixWorld(true);
  const context = contextOf(boxes);
  if (def) {
    for (const mount of MOUNTS) {
      const make = def[mount];
      const bone = rig.getBone(MOUNT_BONE[mount]);
      if (!make || !bone) continue;
      const geometryKey = `${kind}:${key}:${mount}`;
      const group = meshesFor(geometryFor(geometryKey, make, context), geometryKey, true);
      group.userData['suitGear'] = true;
      const held = (mount === 'handR' && !!def.grip) || (mount === 'handL' && def.grip === 'LR');
      const frame = frameOf(boxes, mount, bone);
      attachToMount(group, { bone, frame: held ? frame.multiply(GRIP) : frame }, root);
    }
  }
  model.userData['fists'] = fistMarkers(rig, boxes, root);
  model.removeFromParent();
  if (wasParent) wasParent.add(model);
  return model;
};

/** Two empty markers at the fists, where blows land: [right, left]. */
const fistMarkers = (rig: PlayerRig, boxes: PartBoxes, root: Object3D): Object3D[] => {
  const hands: Object3D[] = [];
  for (const mount of ['handR', 'handL'] as const) {
    const bone = rig.getBone(MOUNT_BONE[mount]);
    const marker = new Object3D();
    marker.name = mount === 'handR' ? 'fistR' : 'fistL';
    if (bone) {
      const at = mountPoint(boxes, mount);
      attachToMount(marker, { bone, frame: new Matrix4().makeTranslation(at.x, at.y - 0.05, at.z + 0.1) }, root);
    }
    hands.push(marker);
  }
  return hands;
};

/**
 * A painted body: the supplied player model with its atlas painted by `def`
 * (cel-shaded, glow optional) and `def`'s accessories on its bones. Every copy
 * of one look shares one material and one set of accessory geometry. Used for
 * the twelve characters and for the statues and NPCs of the world.
 */
export const createPaintedBody = (key: string, def: LookDef): Object3D => {
  const model = playerModelLoader.createInstance();
  measureBody(model);
  const material = materialFor(key, def, model);
  model.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = material;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
  });
  const body = boltOn(model, key, def, partBox, 'fbx');
  if (def.scale && def.scale !== 1) body.scale.multiplyScalar(def.scale);
  return body;
};

/**
 * A playable body for a look, built at once.
 *
 * A CHARACTER is the painted body. The AVATAR is the same model in its own
 * supplied texture - the body shown until the player's Bloxity avatar has
 * loaded (and for good if it cannot be, `AvatarBody`).
 */
export const createSuitBody = (look: BodyLook): Object3D => {
  if (look.character !== AVATAR_SLOT) return createPaintedBody(`char-${look.character}`, characterLook(look.character));
  const model = playerModelLoader.createInstance();
  measureBody(model);
  model.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
  });
  return boltOn(model, 'avatar', null, partBox, 'fbx');
};

/** The fist markers of a body: [right, left]. */
export const fistsOf = (model: Object3D): readonly Object3D[] => (model.userData['fists'] as Object3D[] | undefined) ?? [];
