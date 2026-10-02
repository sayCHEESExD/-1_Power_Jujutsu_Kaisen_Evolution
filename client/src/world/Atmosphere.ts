import { HUB, stageAt, stageByIndex } from '@jjk/shared';
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, type Fog, type Vector3 } from 'three';
import type { SceneManager } from '../rendering/SceneManager.js';

/**
 * THE MOOD OF WHERE THE PLAYER IS: the hall's cool blue light, the arena's
 * red gloom, and every stage's own sky, fog and sun - a dusk over Tokyo, the
 * green light of a forest, a starry night over the graveyard, the red sky of
 * Sukuna's shrine, the void's black. Outdoors a gradient sky dome (with stars
 * at night) follows the camera; indoors the walls and ceiling close in and the
 * fog comes near.
 *
 * Everything EASES toward the area's target, so walking from one stage into
 * the next slides the light across rather than switching it.
 */
interface Mood {
  background: Color;
  fog: Color;
  near: number;
  far: number;
  hemiSky: Color;
  hemiGround: Color;
  hemi: number;
  ambient: number;
  sun: number;
  sunColor: Color;
  skyTop: Color;
  skyHorizon: Color;
  stars: number;
  dome: number;
}

const luminance = (c: Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

const blank = (): Mood => ({
  background: new Color(),
  fog: new Color(),
  near: 100,
  far: 400,
  hemiSky: new Color(),
  hemiGround: new Color(),
  hemi: 1,
  ambient: 0.6,
  sun: 2,
  sunColor: new Color(),
  skyTop: new Color(),
  skyHorizon: new Color(),
  stars: 0,
  dome: 0,
});

const HALL = ((): Mood => {
  const m = blank();
  m.background.setHex(0x1c2233);
  m.fog.setHex(0x1c2233);
  m.near = 140;
  m.far = 420;
  m.hemiSky.setHex(0xe8f0ff);
  m.hemiGround.setHex(0x8a90b8);
  m.hemi = 1.25;
  m.ambient = 0.65;
  m.sun = 1.6;
  m.sunColor.setHex(0xfff6e4);
  return m;
})();

const ARENA = ((): Mood => {
  const m = blank();
  m.background.setHex(0x120408);
  m.fog.setHex(0x2a0a18);
  m.near = 70;
  m.far = 240;
  m.hemiSky.setHex(0xffd8f0);
  m.hemiGround.setHex(0x5a1a3a);
  m.hemi = 1.05;
  m.ambient = 0.55;
  m.sun = 1.2;
  m.sunColor.setHex(0xffb8d8);
  return m;
})();

const stageMoods = new Map<number, Mood>();
const moodOfStage = (index: number): Mood => {
  const cached = stageMoods.get(index);
  if (cached) return cached;
  const def = stageByIndex(index)!;
  const p = def.palette;
  const m = blank();
  const sky = new Color(p.sky);
  const fog = new Color(p.fog);
  const night = luminance(sky) < 0.18;
  if (def.outdoor) {
    m.background.copy(sky);
    m.fog.copy(fog);
    m.near = 70;
    m.far = 340;
    m.hemiSky.copy(sky).lerp(new Color(0xffffff), night ? 0.55 : 0.4);
    m.hemiGround.setHex(p.floor);
    m.hemi = night ? 1.0 : 1.3;
    m.ambient = night ? 0.55 : 0.6;
    m.sun = night ? 0.9 : 2.2;
    m.sunColor.copy(night ? new Color(p.accent).lerp(new Color(0xc8d8ff), 0.6) : new Color(0xfff2dc).lerp(sky, 0.15));
    m.skyTop.copy(sky).multiplyScalar(night ? 0.45 : 0.62);
    m.skyHorizon.copy(fog).lerp(sky, 0.35);
    m.stars = night ? 1 : 0;
    m.dome = 1;
  } else {
    m.background.copy(fog).multiplyScalar(0.7);
    m.fog.copy(fog);
    m.near = 40;
    m.far = 190;
    m.hemiSky.setHex(0xf4f0ff);
    m.hemiGround.setHex(p.floor);
    m.hemi = 1.15;
    m.ambient = 0.6;
    m.sun = 1.1;
    m.sunColor.setHex(0xfff2dc);
  }
  stageMoods.set(index, m);
  return m;
};

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform float stars;
uniform float opacity;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(horizon, top, smoothstep(-0.02, 0.55, h));
  vec3 cell = floor(d * 160.0);
  float n = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  c += vec3(step(0.9965, n) * stars * smoothstep(0.04, 0.35, h));
  gl_FragColor = vec4(c, opacity);
}`;

export class Atmosphere {
  private readonly mood = blank();
  private readonly dome: Mesh;
  private readonly domeMaterial: ShaderMaterial;
  private first = true;

  constructor(private readonly scene: SceneManager) {
    this.domeMaterial = new ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        top: { value: new Color() },
        horizon: { value: new Color() },
        stars: { value: 0 },
        opacity: { value: 0 },
      },
      side: BackSide,
      depthWrite: false,
      fog: false,
      transparent: true,
    });
    this.dome = new Mesh(new SphereGeometry(900, 24, 16), this.domeMaterial);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.scene.scene.add(this.dome);
  }

  /** Ease toward the mood of the area at (x, z); the dome follows the camera. */
  update(delta: number, z: number, camera: Vector3): void {
    const stage = z > HUB.maxZ ? stageAt(z) : 0;
    const target = stage > 0 ? moodOfStage(stage) : z < HUB.minZ - 2 ? ARENA : HALL;
    const k = this.first ? 1 : 1 - Math.exp(-2.2 * Math.max(0, delta));
    this.first = false;
    const m = this.mood;
    m.background.lerp(target.background, k);
    m.fog.lerp(target.fog, k);
    m.near += (target.near - m.near) * k;
    m.far += (target.far - m.far) * k;
    m.hemiSky.lerp(target.hemiSky, k);
    m.hemiGround.lerp(target.hemiGround, k);
    m.hemi += (target.hemi - m.hemi) * k;
    m.ambient += (target.ambient - m.ambient) * k;
    m.sun += (target.sun - m.sun) * k;
    m.sunColor.lerp(target.sunColor, k);
    m.skyTop.lerp(target.skyTop, k);
    m.skyHorizon.lerp(target.skyHorizon, k);
    m.stars += (target.stars - m.stars) * k;
    m.dome += (target.dome - m.dome) * k;

    const s = this.scene;
    (s.scene.background as Color).copy(m.background);
    const fog = s.scene.fog as Fog;
    fog.color.copy(m.fog);
    fog.near = m.near;
    fog.far = m.far;
    s.hemi.color.copy(m.hemiSky);
    s.hemi.groundColor.copy(m.hemiGround);
    s.hemi.intensity = m.hemi;
    s.ambient.intensity = m.ambient;
    s.sun.intensity = m.sun;
    s.sun.color.copy(m.sunColor);

    const u = this.domeMaterial.uniforms;
    (u['top']!.value as Color).copy(m.skyTop);
    (u['horizon']!.value as Color).copy(m.skyHorizon);
    u['stars']!.value = m.stars;
    u['opacity']!.value = m.dome;
    this.dome.visible = m.dome > 0.02;
    this.dome.position.copy(camera);
  }

  dispose(): void {
    this.domeMaterial.dispose();
    this.dome.geometry.dispose();
    this.dome.removeFromParent();
  }
}
