import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderTarget,
  type Object3D,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { createAnimationInput } from '../animation/AnimationInput.js';
import { PlayerAnimator } from '../animation/PlayerAnimator.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { characterLook } from '../characters/JjkCharacters.js';
import { createPaintedBody } from '../suits/SuitBody.js';

const SIZE = 192;

/**
 * PORTRAITS OF THE REAL MODELS for the menus: each character rendered once,
 * on demand, in its fighting stance, through the game's own renderer into a
 * small offscreen target and kept as an image URL. The menus show exactly the
 * body a player turns into, with no image files shipped.
 */
export class ModelPortraits {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 50);
  private readonly target = new WebGLRenderTarget(SIZE, SIZE);
  private readonly cache = new Map<string, string>();
  private readonly holder = new Group();

  constructor(private readonly renderer: WebGLRenderer) {
    this.target.texture.colorSpace = SRGBColorSpace;
    this.scene.add(new HemisphereLight(0xffffff, 0xd8c8b0, 1.4));
    this.scene.add(new AmbientLight(0xffffff, 0.6));
    const key = new DirectionalLight(0xffffff, 1.8);
    key.position.set(2, 4, 5);
    this.scene.add(key);
    this.scene.add(this.holder);
  }

  /** A character, three-quarters on, in the stance it holds on its pedestal. */
  character(id: number): string {
    return this.get(`char:${id}`, () => {
      const model = createPaintedBody(`char-${id}`, characterLook(id));
      const visual = new Group();
      visual.add(model);
      const animator = new PlayerAnimator(new PlayerRig(model, model), visual);
      animator.crouchNow();
      const input = createAnimationInput();
      for (let i = 0; i < 12; i += 1) animator.update(0.1, input);
      visual.rotation.y = -0.4;
      this.frame(visual, 1.1);
      return visual;
    });
  }

  /** Point the camera so an object fills the portrait, whatever its size. */
  private frame(object: Object3D, fill = 1.7): void {
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.2) * 0.5;
    const distance = (radius * fill) / Math.tan((this.camera.fov * Math.PI) / 360);
    this.camera.position.set(centre.x, centre.y + radius * 0.25, centre.z + distance);
    this.camera.lookAt(centre);
  }

  private get(key: string, build: () => Object3D): string {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    let url = '';
    try {
      const object = build();
      this.holder.add(object);
      this.camera.aspect = 1;
      this.camera.updateProjectionMatrix();
      const previousTarget = this.renderer.getRenderTarget();
      const previousColor = new Color();
      this.renderer.getClearColor(previousColor);
      const previousAlpha = this.renderer.getClearAlpha();
      this.renderer.setRenderTarget(this.target);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, this.camera);
      const pixels = new Uint8Array(SIZE * SIZE * 4);
      this.renderer.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, pixels);
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.setClearColor(previousColor, previousAlpha);
      this.holder.remove(object);

      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d')!;
      const image = ctx.createImageData(SIZE, SIZE);
      // The target is bottom-up; the canvas is top-down.
      for (let y = 0; y < SIZE; y += 1) {
        image.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
      }
      ctx.putImageData(image, 0, 0);
      url = canvas.toDataURL('image/png');
    } catch {
      url = '';
    }
    this.cache.set(key, url);
    return url;
  }

  dispose(): void {
    this.target.dispose();
    this.cache.clear();
  }
}
