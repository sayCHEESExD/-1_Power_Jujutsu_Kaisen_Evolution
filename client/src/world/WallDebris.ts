import { BoxGeometry, Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, type Scene } from 'three';

/** Chunks one wall throws when it falls. */
const PER_BURST = 36;
/** Bursts that may be in the air at once (a strong player breaks walls in quick succession). */
const POOL = 3;
const LIFE = 1.5;
const GRAVITY = 32;

interface Chunk {
  life: number;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly spin: Vector3;
  readonly rotation: Euler;
  size: number;
}

const MATRIX = new Matrix4();
const QUAT = new Quaternion();
const SCALE = new Vector3();
const COLOR = new Color();

/**
 * A WALL COMING DOWN: chunks of it burst forward off the face the player hit,
 * tumble, bounce once on the floor and shrink away. One instanced mesh for
 * every chunk of every burst - a single draw call, no allocation after load -
 * so breaking walls as fast as Strength allows costs the GPU nothing extra.
 */
export class WallDebris {
  private readonly mesh: InstancedMesh;
  private readonly chunks: Chunk[] = [];
  private next = 0;
  private live = 0;

  constructor(scene: Scene) {
    const count = PER_BURST * POOL;
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color: 0xffffff }), count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.name = 'wall-debris';
    for (let i = 0; i < count; i += 1) {
      this.chunks.push({ life: 0, position: new Vector3(), velocity: new Vector3(), spin: new Vector3(), rotation: new Euler(), size: 1 });
      this.mesh.setMatrixAt(i, MATRIX.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, COLOR.set(0xffffff));
    }
    this.mesh.count = count;
    scene.add(this.mesh);
  }

  /**
   * Burst a wall of `color` at `z` (its face), spanning the corridor, thrown
   * toward +Z (away from the player). `centreX` is where the blow landed.
   */
  burst(z: number, halfWidth: number, height: number, color: number, accent: number, centreX: number): void {
    const start = this.next * PER_BURST;
    this.next = (this.next + 1) % POOL;
    for (let i = 0; i < PER_BURST; i += 1) {
      const chunk = this.chunks[start + i]!;
      const x = (Math.random() * 2 - 1) * halfWidth * 0.95;
      const y = 0.6 + Math.random() * height * 0.85;
      chunk.position.set(x, y, z + Math.random() * 0.8);
      // Thrown away from the blow and the player, faster near where it landed.
      const near = 1 - Math.min(1, Math.abs(x - centreX) / halfWidth);
      chunk.velocity.set((x - centreX) * 0.9 + (Math.random() - 0.5) * 4, 3 + Math.random() * 7, 6 + near * 14 + Math.random() * 6);
      chunk.spin.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      chunk.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      chunk.size = 0.5 + Math.random() * 1.3;
      chunk.life = LIFE * (0.75 + Math.random() * 0.25);
      this.mesh.setColorAt(start + i, COLOR.set(Math.random() < 0.2 ? accent : color).multiplyScalar(0.85 + Math.random() * 0.3));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.live = Math.max(this.live, LIFE);
  }

  update(delta: number): void {
    if (this.live <= 0) return;
    this.live -= delta;
    for (let i = 0; i < this.chunks.length; i += 1) {
      const chunk = this.chunks[i]!;
      if (chunk.life <= 0) continue;
      chunk.life -= delta;
      if (chunk.life <= 0) {
        this.mesh.setMatrixAt(i, MATRIX.makeScale(0, 0, 0));
        continue;
      }
      chunk.velocity.y -= GRAVITY * delta;
      chunk.position.addScaledVector(chunk.velocity, delta);
      const floor = chunk.size * 0.3;
      if (chunk.position.y < floor) {
        chunk.position.y = floor;
        chunk.velocity.y = Math.abs(chunk.velocity.y) * 0.3;
        chunk.velocity.x *= 0.6;
        chunk.velocity.z *= 0.6;
        chunk.spin.multiplyScalar(0.5);
      }
      chunk.rotation.x += chunk.spin.x * delta;
      chunk.rotation.y += chunk.spin.y * delta;
      chunk.rotation.z += chunk.spin.z * delta;
      const fade = Math.min(1, chunk.life / 0.4);
      QUAT.setFromEuler(chunk.rotation);
      SCALE.setScalar(chunk.size * fade);
      this.mesh.setMatrixAt(i, MATRIX.compose(chunk.position, QUAT, SCALE));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshLambertMaterial).dispose();
  }
}
