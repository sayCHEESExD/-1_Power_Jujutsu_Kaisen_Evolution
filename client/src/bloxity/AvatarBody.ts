import { PLAYER_HEIGHT, type AvatarAppearance, type AvatarProportions } from '@jjk/shared';
import {
  Box3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  SkinnedMesh,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Bone,
  type BufferAttribute,
  type BufferGeometry,
  type Object3D,
  type Texture,
} from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { boltOn, type PartBoxes } from '../suits/SuitBody.js';
import type { BodyPart } from '../suits/SuitPainter.js';
import { logger } from '../util/logger.js';
import {
  ACCESSORY_ORIGINS,
  BLOXITY_MODEL_HEIGHT,
  DEFAULT_SKIN_URL,
  PART_TARGETS,
  PLAYER_GLB_URL,
  assetUrl,
  compositeSkinUrl,
  describeItem,
  type AccessorySlot,
  type BloxityItem,
} from './bloxityAssets.js';

const SCOPE = 'bloxity/avatar';

/**
 * A PLAYER'S OWN BLOXITY AVATAR AS A PLAYABLE BODY - what everybody is when
 * they join, and whenever they choose "My Avatar" over a character's look.
 *
 * Built the way Bloxity's renderer builds it: their `player.glb` body, with
 * each equipped body PART swapped onto its skeleton (a part's bone indices
 * re-mapped by bone name), the SKIN as its texture (composed with the worn
 * face, shirt and pants), the HAT, HAIR, MASK and BACK item hung on real
 * bones, the NECK, CHEST, WAIST, HAND and SHOES accessories placed where
 * Bloxity places them - and bound to the bone they ride, so they move with the
 * body - and the PROPORTIONS as bone scales and offsets. Every asset path comes
 * from Bloxity's catalogue (`bloxityAssets`), never from a pattern spelled out
 * here.
 *
 * It needs NOTHING new to move: the GLB's skeleton carries the twelve bone
 * names `PlayerRig` binds - the supplied `player.fbx` is the same rig - so the
 * run, the jump, every punch and every emote drive it unchanged.
 *
 * Asynchronous by nature (a CDN), so it never blocks: the character shows the
 * bundled body in its own texture at once and swaps this in when it lands. A
 * blocked or failed CDN simply leaves that body in place - the avatar degrades
 * to "a plain character", never to nothing.
 */
export interface AvatarBodyRequest {
  readonly appearance: AvatarAppearance;
  readonly proportions: AvatarProportions;
}

/** Bloxity's own figures for items on their rig (their renderer hangs a hat 0.8 up the head bone). */
const HAT_LIFT = 0.8;
/** Bone-space units the legs move apart per unit of `legOffsetX`. */
const LEG_SPREAD = 0.12;

/** The GLB's body meshes, by the part of ours they stand for. The arms are matched to a side by their bone. */
const BODY_MESHES: Readonly<Record<'head' | 'torso', string>> = { head: 'default_head', torso: 'default_torso' };
const LIMB_MESHES = { arm: ['default_arm_L', 'default_arm_R'], leg: ['default_leg_L', 'default_leg_R'] } as const;

/** The bone each body accessory rides; hands and shoes are pairs (left, right). */
const ACCESSORY_BONES: Readonly<Record<AccessorySlot, readonly [string, string?]>> = {
  neck: ['Spine2'],
  chest: ['Spine2'],
  waist: ['Spine1'],
  hand: ['ArmL2', 'ArmR2'],
  shoes: ['LegL2', 'LegR2'],
};

class AvatarBodyFactory {
  private prototype: Promise<Object3D | null> | null = null;
  private readonly parts = new Map<string, Promise<BufferGeometry | null>>();
  private readonly textures = new Map<string, Promise<Texture | null>>();
  private readonly items = new Map<string, Promise<{ object: Object3D; material: MeshStandardMaterial } | null>>();
  private loaderModule: Promise<typeof import('three/examples/jsm/loaders/GLTFLoader.js')> | null = null;
  private readonly textureLoader = new TextureLoader();
  private readonly objLoader = new OBJLoader();

  /** The glTF parser, fetched only when an avatar is first wanted (it is off the critical path). */
  private async gltfLoader(): Promise<InstanceType<(typeof import('three/examples/jsm/loaders/GLTFLoader.js'))['GLTFLoader']>> {
    this.loaderModule ??= import('three/examples/jsm/loaders/GLTFLoader.js');
    const mod = await this.loaderModule;
    return new mod.GLTFLoader();
  }

  /** The base body, loaded once and cloned per player, sized to this game's player. */
  private loadPrototype(): Promise<Object3D | null> {
    this.prototype ??= this.gltfLoader()
      .then((loader) => loader.loadAsync(PLAYER_GLB_URL))
      .then((gltf) => {
        const root = gltf.scene;
        root.scale.setScalar(PLAYER_HEIGHT / BLOXITY_MODEL_HEIGHT);
        root.updateMatrixWorld(true);
        return root;
      })
      .catch((error: unknown) => {
        logger.warn(SCOPE, `base avatar failed to load: ${String(error)}`);
        // Not cached as a failure: a later player (or a later rejoin) may find the CDN back.
        this.prototype = null;
        return null;
      });
    return this.prototype;
  }

  /** Build a playable avatar body wearing `request`, or null if the Bloxity body cannot be had right now. */
  async build(request: AvatarBodyRequest): Promise<Object3D | null> {
    const prototype = await this.loadPrototype();
    if (!prototype) return null;
    const model = cloneSkeleton(prototype);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.updateMatrixWorld(true);

    // One material for the whole body: the skin is a single atlas over every part.
    const material = new MeshStandardMaterial({ metalness: 0, roughness: 1 });
    const skinned: SkinnedMesh[] = [];
    model.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = material;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      if (child instanceof SkinnedMesh) skinned.push(child);
    });
    model.userData['bloxityBody'] = true;

    const { appearance, proportions } = request;
    const [skin] = await Promise.all([this.skinFor(appearance), this.wearParts(appearance, skinned)]);
    material.map = skin;
    material.needsUpdate = true;

    const bones = bonesOf(model);
    // Hair and masks are worn exactly like a hat (the head bone, 0.8 up), and alongside one.
    await Promise.all([
      this.hang(bones, 'hat', appearance.hatId),
      this.hang(bones, 'hat', appearance.hairId),
      this.hang(bones, 'hat', appearance.maskId),
      this.hang(bones, 'back', appearance.backId),
      this.accessory(model, bones, 'neck', appearance.neckId),
      this.accessory(model, bones, 'chest', appearance.chestId),
      this.accessory(model, bones, 'waist', appearance.waistId),
      this.accessory(model, bones, 'hand', appearance.handId),
      this.accessory(model, bones, 'shoes', appearance.shoesId),
    ]);
    // Measured in the bind pose, BEFORE the proportions stretch it: the fist markers sit on the stock body.
    const boxes = measureAvatar(model, bones);
    this.applyProportions(model, bones, proportions);
    return boltOn(model, 'avatar', null, boxes, 'bloxity');
  }

  /**
   * The skin the player wears: the composite with their face, shirt and pants
   * painted on when they wear any, else the skin item itself, else Bloxity's
   * default (a Bloxity body with no texture renders white).
   */
  private async skinFor(appearance: AvatarAppearance): Promise<Texture | null> {
    const composite = compositeSkinUrl(appearance);
    if (composite) {
      // glTF convention: the UV origin is top-left, so no flip. Pixel art: nearest filtering.
      const texture = await this.texture(composite, false);
      if (texture) return texture;
    }
    let url = DEFAULT_SKIN_URL;
    if (appearance.skinId) {
      const path = (await describeItem(appearance.skinId))?.assetPaths?.texture;
      if (path) url = assetUrl(path);
    }
    return this.texture(url, false);
  }

  private texture(url: string, flipY: boolean): Promise<Texture | null> {
    const key = `${url}|${flipY ? 1 : 0}`;
    let cached = this.textures.get(key);
    if (!cached) {
      cached = this.textureLoader
        .loadAsync(url)
        .then((texture) => {
          texture.colorSpace = SRGBColorSpace;
          texture.flipY = flipY;
          texture.magFilter = NearestFilter;
          texture.minFilter = NearestFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;
          return texture;
        })
        .catch(() => {
          logger.warn(SCOPE, `texture ${url} failed to load`);
          this.textures.delete(key);
          return null;
        });
      this.textures.set(key, cached);
    }
    return cached;
  }

  /** Swap in every equipped body part. Arms and legs are one item carrying two meshes. */
  private async wearParts(appearance: AvatarAppearance, skinned: readonly SkinnedMesh[]): Promise<void> {
    const wanted: { id: string; slot: NonNullable<BloxityItem['partSlot']> }[] = [];
    if (appearance.headId) wanted.push({ id: appearance.headId, slot: 'head' });
    if (appearance.torsoId) wanted.push({ id: appearance.torsoId, slot: 'torso' });
    if (appearance.armLId) wanted.push({ id: appearance.armLId, slot: 'arms' });
    if (appearance.legLId) wanted.push({ id: appearance.legLId, slot: 'legs' });
    await Promise.all(
      wanted.map(async ({ id, slot }) => {
        const item = await describeItem(id);
        if (!item?.assetPaths) return;
        await Promise.all(
          PART_TARGETS[slot].map(async (target) => {
            const path = item.assetPaths?.[target.path];
            const mesh = skinned.find((candidate) => candidate.name === target.mesh);
            if (!path || !mesh) return;
            const geometry = await this.part(assetUrl(path), mesh);
            if (geometry) mesh.geometry = geometry;
          }),
        );
      }),
    );
  }

  /** One part, its skinning re-mapped onto the body's skeleton by bone name (the files order joints differently). */
  private part(url: string, target: SkinnedMesh): Promise<BufferGeometry | null> {
    let cached = this.parts.get(url);
    if (!cached) {
      cached = this.gltfLoader()
        .then((loader) => loader.loadAsync(url))
        .then((gltf) => {
          let source: SkinnedMesh | null = null;
          gltf.scene.traverse((child) => {
            if (!source && child instanceof SkinnedMesh) source = child;
          });
          return source ? retarget(source, target) : null;
        })
        .catch((error: unknown) => {
          logger.warn(SCOPE, `part ${url} failed to load: ${String(error)}`);
          return null;
        });
      this.parts.set(url, cached);
    }
    return cached;
  }

  /** A hat (or hair, or mask) on the head bone, a back item on the upper spine - to BONES, so they move with the body. */
  private async hang(bones: ReadonlyMap<string, Bone>, slot: 'hat' | 'back', id: string): Promise<void> {
    if (!id) return;
    const anchor = bones.get(slot === 'hat' ? 'Neck1' : 'Spine2');
    if (!anchor) return;
    const object = await this.itemObject(id, slot);
    if (!object) return;
    if (slot === 'hat') object.position.set(0, HAT_LIFT, 0);
    anchor.add(object);
  }

  /**
   * A body accessory where Bloxity puts it - its mesh is authored in the
   * model's own space, at `ACCESSORY_ORIGINS[slot]` - then re-parented under
   * the bone it rides with that exact placement kept, so it moves with the
   * body. Hands and shoes come as the LEFT one only: the right is its mirror
   * across x, on the other bone.
   */
  private async accessory(model: Object3D, bones: ReadonlyMap<string, Bone>, slot: AccessorySlot, id: string): Promise<void> {
    if (!id) return;
    const object = await this.itemObject(id, slot);
    if (!object) return;
    const [x, y, z] = ACCESSORY_ORIGINS[slot];
    const [first, second] = ACCESSORY_BONES[slot];
    model.updateMatrixWorld(true);
    const place = (item: Object3D, mirror: boolean, boneName: string | undefined): void => {
      const bone = boneName ? bones.get(boneName) : undefined;
      // Where the item belongs in the world, in the bind pose: the model's frame, at its origin.
      const want = model.matrixWorld.clone().multiply(new Matrix4().makeTranslation(x, y, z));
      if (mirror) want.multiply(new Matrix4().makeScale(-1, 1, 1));
      const parent = bone ?? model;
      parent.updateMatrixWorld(true);
      const local = parent.matrixWorld.clone().invert().multiply(want);
      local.decompose(item.position, item.quaternion, item.scale);
      parent.add(item);
    };
    if (!second) {
      place(object, false, first);
      return;
    }
    // A pair: the authored mesh rides whichever bone of the pair it sits nearer; its mirror rides the other.
    const centre = new Box3().setFromObject(object).getCenter(new Vector3()).add(new Vector3(x, y, z));
    const toBone = (name: string): number => {
      const bone = bones.get(name);
      if (!bone) return Number.POSITIVE_INFINITY;
      const at = bone.getWorldPosition(new Vector3());
      // The bone in the model's own units, to compare with the authored centre.
      return model.worldToLocal(at).distanceTo(centre);
    };
    const [near, far] = toBone(first) <= toBone(second) ? [first, second] : [second, first];
    place(object, false, near);
    place(object.clone(), true, far);
  }

  /** One catalogue item's mesh, textured, as a fresh clone (the loaded original is shared). */
  private async itemObject(id: string, slot: string): Promise<Object3D | null> {
    let cached = this.items.get(id);
    if (!cached) {
      cached = describeItem(id).then(async (item) => {
        const meshPath = item?.assetPaths?.mesh;
        const texturePath = item?.assetPaths?.texture;
        if (!meshPath || !texturePath) return null;
        try {
          const object = await this.objLoader.loadAsync(assetUrl(meshPath));
          // OBJ is bottom-left UV origin, three.js's default: NO flip (unlike the skin).
          const texture = await this.texture(assetUrl(texturePath), true);
          const material = new MeshStandardMaterial({ map: texture, roughness: 0.85 });
          return { object, material };
        } catch {
          logger.warn(SCOPE, `${slot} ${id} failed to load`);
          return null;
        }
      });
      this.items.set(id, cached);
    }
    const loaded = await cached;
    if (!loaded) return null;
    const object = loaded.object.clone();
    object.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = loaded.material;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    });
    return object;
  }

  /**
   * The account's proportions, as bone scales and offsets - never rotations,
   * which `PlayerRig` owns and rewrites every frame. The head is left to the
   * character (the rig sets the neck when it binds); it reads `headScale` here.
   */
  private applyProportions(model: Object3D, bones: ReadonlyMap<string, Bone>, p: AvatarProportions): void {
    model.scale.multiplyScalar(p.height);
    const spine1 = bones.get('Spine1');
    if (spine1) spine1.scale.x = p.torsoScaleX;
    const spine2 = bones.get('Spine2');
    if (spine2) spine2.scale.x = p.shoulderWidth;
    for (const name of ['ArmL1', 'ArmR1']) {
      const bone = bones.get(name);
      if (bone) bone.scale.y = p.armLength;
    }
    for (const [name, side] of [['LegL1', 1], ['LegR1', -1]] as const) {
      const bone = bones.get(name);
      if (bone) bone.position.x += side * (p.legOffsetX - 1) * LEG_SPREAD;
    }
    model.userData['headScale'] = p.headScale;
  }
}

/** Rewrite a part's bone indices to match the body it is worn on. */
const retarget = (source: SkinnedMesh, target: SkinnedMesh): BufferGeometry => {
  const geometry = source.geometry.clone();
  const attribute = geometry.getAttribute('skinIndex') as BufferAttribute | undefined;
  if (!attribute) return geometry;
  const byName = new Map<string, number>();
  target.skeleton.bones.forEach((bone, index) => {
    if (!byName.has(bone.name)) byName.set(bone.name, index);
  });
  const translation = new Map<number, number>();
  source.skeleton.bones.forEach((bone, index) => {
    const mapped = byName.get(bone.name);
    if (mapped !== undefined) translation.set(index, mapped);
  });
  const array = attribute.array as unknown as { length: number; [index: number]: number };
  for (let i = 0; i < array.length; i += 1) {
    const mapped = translation.get(array[i] as number);
    if (mapped !== undefined) array[i] = mapped;
  }
  attribute.needsUpdate = true;
  return geometry;
};

/** The rig's bones, by name (the first of each name, as `PlayerRig` binds). */
const bonesOf = (model: Object3D): Map<string, Bone> => {
  const found = new Map<string, Bone>();
  model.traverse((child) => {
    const bone = child as Bone;
    if (bone.isBone && !found.has(bone.name)) found.set(bone.name, bone);
  });
  return found;
};

/**
 * The avatar's part boxes, in model space with the body at the origin in its
 * bind pose - the same frame `boltOn` works in. Head and torso by mesh name;
 * each arm and leg is assigned its SIDE by which of the matching bones it sits
 * nearer, so nothing depends on which way the GLB names its left.
 */
const measureAvatar = (model: Object3D, bones: ReadonlyMap<string, Bone>): PartBoxes => {
  const parent = model.parent;
  const position = model.position.clone();
  const rotation = model.rotation.clone();
  model.removeFromParent();
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  model.updateMatrixWorld(true);

  const boxOfMesh = (name: string): Box3 | null => {
    let found: Box3 | null = null;
    model.traverse((child) => {
      if (found || child.name !== name || !(child as Mesh).isMesh) return;
      const mesh = child as SkinnedMesh;
      const box = new Box3();
      const v = new Vector3();
      const count = mesh.geometry.getAttribute('position').count;
      // Skinned: the vertices where the skeleton actually puts them.
      for (let i = 0; i < count; i += 1) {
        if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, v);
        else v.fromBufferAttribute(mesh.geometry.getAttribute('position') as BufferAttribute, i);
        box.expandByPoint(v.applyMatrix4(mesh.matrixWorld));
      }
      found = box;
    });
    return found;
  };

  const boxes = new Map<BodyPart, Box3>();
  const head = boxOfMesh(BODY_MESHES.head);
  const torso = boxOfMesh(BODY_MESHES.torso);
  if (head) boxes.set('head', head);
  if (torso) boxes.set('torso', torso);
  const bonePos = (name: string): Vector3 | null => bones.get(name)?.getWorldPosition(new Vector3()) ?? null;
  const sided = (names: readonly string[], rightBone: string, right: BodyPart, left: BodyPart): void => {
    const target = bonePos(rightBone);
    const found = names.map((name) => boxOfMesh(name)).filter((box): box is Box3 => box !== null);
    if (found.length < 2 || !target) return;
    const distance = (box: Box3): number => box.getCenter(new Vector3()).distanceTo(target);
    const [a, b] = distance(found[0]!) <= distance(found[1]!) ? [found[0]!, found[1]!] : [found[1]!, found[0]!];
    boxes.set(right, a);
    boxes.set(left, b);
  };
  sided(LIMB_MESHES.arm, 'ArmR2', 'armR', 'armL');
  sided(LIMB_MESHES.leg, 'LegR2', 'legR', 'legL');

  model.position.copy(position);
  model.rotation.copy(rotation);
  if (parent) parent.add(model);

  return (part) => {
    const box = boxes.get(part);
    return box ? { min: box.min.clone(), max: box.max.clone() } : null;
  };
};

/** One factory for the whole client, so its caches are shared by every player. */
export const avatarBodies = new AvatarBodyFactory();
