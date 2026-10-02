import {
  AdditiveBlending,
  Color,
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Scene,
  type Texture,
} from 'three';

/**
 * WHAT A PUNCH LOOKS LIKE WHEN IT LANDS: a white-hot comic flash at the point
 * of impact, a shockwave ring punched outward, and sparks flying off it. A
 * knockout blow is bigger, brighter and throws twice the sparks. Everything
 * is pooled - a player punching three times a second never allocates.
 */
interface Flash {
  sprite: Sprite;
  life: number;
  max: number;
  size: number;
}

interface Ring {
  mesh: Mesh;
  life: number;
  max: number;
  size: number;
}

interface Spark {
  sprite: Sprite;
  velocity: Vector3;
  life: number;
  max: number;
}

const starTexture = (): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.3, 'rgba(255,240,170,0.9)');
  glow.addColorStop(1, 'rgba(255,200,60,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  for (let i = 0; i < 20; i += 1) {
    const a = (i / 20) * Math.PI * 2;
    const r = i % 2 === 0 ? 62 : 26;
    ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

const dotTexture = (): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 32, 32);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

const WHITE = new Color(0xffffff);

export class PunchEffects {
  private readonly flashes: Flash[] = [];
  private readonly rings: Ring[] = [];
  private readonly sparks: Spark[] = [];
  private readonly star = starTexture();
  private readonly dot = dotTexture();
  private readonly ringGeometry = new RingGeometry(0.7, 1, 28);

  constructor(private readonly scene: Scene) {}

  /**
   * A punch lands at `at`, thrown from `from`. `power` 0..1 scales it (a
   * training bag thump is small, a boss blow large); `kill` makes it a knockout.
   * `energy` is the colour of the cursed energy behind it: the flash, the
   * shockwave and half the sparks burn in it.
   */
  hit(from: Vector3, at: Vector3, power = 0.5, kill = false, energy = 0xffe68a): void {
    const k = kill ? 1.6 : 0.7 + power * 0.6;
    this.flash(at, 1.3 * k, energy);
    this.ring(from, at, 1.1 * k, energy);
    const count = kill ? 14 : 7;
    for (let i = 0; i < count; i += 1) this.spark(from, at, k, kill ? 0xffd23a : i % 2 ? 0xffffff : energy);
  }

  private flash(at: Vector3, size: number, color: number): void {
    let flash = this.flashes.find((f) => f.life >= f.max);
    if (!flash) {
      const sprite = new Sprite(new SpriteMaterial({ map: this.star, transparent: true, blending: AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
      sprite.renderOrder = 10;
      this.scene.add(sprite);
      flash = { sprite, life: 0, max: 0.18, size };
      this.flashes.push(flash);
    }
    flash.life = 0;
    flash.size = size;
    flash.sprite.position.copy(at);
    flash.sprite.material.rotation = Math.random() * Math.PI;
    flash.sprite.material.color.setHex(color).lerp(WHITE, 0.45);
    flash.sprite.visible = true;
  }

  private ring(from: Vector3, at: Vector3, size: number, color: number): void {
    let ring = this.rings.find((r) => r.life >= r.max);
    if (!ring) {
      const mesh = new Mesh(
        this.ringGeometry,
        new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }),
      );
      this.scene.add(mesh);
      ring = { mesh, life: 0, max: 0.26, size };
      this.rings.push(ring);
    }
    ring.life = 0;
    ring.size = size;
    ring.mesh.position.copy(at);
    (ring.mesh.material as MeshBasicMaterial).color.setHex(color);
    // Facing along the punch: the shockwave spreads across the line of the blow.
    ring.mesh.lookAt(from.x, at.y, from.z);
    ring.mesh.visible = true;
  }

  private spark(from: Vector3, at: Vector3, k: number, color: number): void {
    let spark = this.sparks.find((s) => s.life >= s.max);
    if (!spark) {
      const sprite = new Sprite(new SpriteMaterial({ map: this.dot, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
      this.scene.add(sprite);
      spark = { sprite, velocity: new Vector3(), life: 0, max: 0.4 };
      this.sparks.push(spark);
    }
    spark.life = 0;
    spark.max = 0.3 + Math.random() * 0.25;
    spark.sprite.material.color.setHex(color);
    spark.sprite.position.copy(at);
    // Mostly onward along the blow, scattered.
    const dx = at.x - from.x;
    const dz = at.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    spark.velocity.set((dx / len) * 5 + (Math.random() - 0.5) * 10, 2 + Math.random() * 7, (dz / len) * 5 + (Math.random() - 0.5) * 10).multiplyScalar(k);
    spark.sprite.visible = true;
  }

  update(delta: number): void {
    const dt = Math.max(0, delta);
    for (const f of this.flashes) {
      if (f.life >= f.max) continue;
      f.life += dt;
      const t = Math.min(1, f.life / f.max);
      f.sprite.scale.setScalar(f.size * (0.6 + t * 0.8));
      f.sprite.material.opacity = 1 - t * t;
      if (f.life >= f.max) f.sprite.visible = false;
    }
    for (const r of this.rings) {
      if (r.life >= r.max) continue;
      r.life += dt;
      const t = Math.min(1, r.life / r.max);
      r.mesh.scale.setScalar(r.size * (0.3 + t * 1.4));
      (r.mesh.material as MeshBasicMaterial).opacity = 0.9 * (1 - t);
      if (r.life >= r.max) r.mesh.visible = false;
    }
    for (const s of this.sparks) {
      if (s.life >= s.max) continue;
      s.life += dt;
      s.velocity.y -= 24 * dt;
      s.sprite.position.addScaledVector(s.velocity, dt);
      const t = Math.min(1, s.life / s.max);
      s.sprite.scale.setScalar(0.28 * (1 - t) + 0.04);
      if (s.life >= s.max) s.sprite.visible = false;
    }
  }

  dispose(): void {
    for (const f of this.flashes) {
      f.sprite.material.dispose();
      f.sprite.removeFromParent();
    }
    for (const r of this.rings) {
      (r.mesh.material as MeshBasicMaterial).dispose();
      r.mesh.removeFromParent();
    }
    for (const s of this.sparks) {
      s.sprite.material.dispose();
      s.sprite.removeFromParent();
    }
    this.ringGeometry.dispose();
    this.star.dispose();
    this.dot.dispose();
  }
}
