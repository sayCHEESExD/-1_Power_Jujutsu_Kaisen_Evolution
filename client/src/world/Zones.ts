import { CORRIDOR, type StageDef } from '@jjk/shared';
import { CircleGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Mesh, MeshLambertMaterial, PlaneGeometry, SphereGeometry, TorusGeometry, type Group } from 'three';
import type { PartBuilder } from '../render/PartBuilder.js';
import {
  PAPER,
  PLASTER,
  ROOF,
  STONE,
  VERMILION,
  WOOD,
  WOOD_DARK,
  bamboo,
  bars,
  bed,
  bigScreen,
  bonePile,
  brazier,
  building,
  car,
  container,
  crystal,
  deadTree,
  desk,
  eye,
  eyeCube,
  fence,
  flame,
  giantHand,
  grave,
  groundRing,
  pagoda,
  paperLantern,
  pillar,
  pine,
  rails,
  rock,
  rubble,
  ruin,
  seeded,
  shade,
  shrineHall,
  skullShrine,
  smokestack,
  sotoba,
  stoneLantern,
  stoneWall,
  streetLamp,
  talisman,
  torii,
  trainCar,
  tree,
  vendingMachine,
  wheel,
} from './JjkProps.js';

/**
 * THE FIFTY STAGES, DRESSED. Every stage is the same corridor - a lane 32
 * wide, walls across it every 3.4 - but each is BUILT as a place of its own
 * around it, by its theme and variant: a dojo of paper screens, a Tokyo street
 * at dusk, a school courtyard, Jujutsu High's temple grounds, a concrete
 * underpass, a haunted classroom, a forest, a graveyard, a subway, a rooftop
 * over the city, a ruined city, a volcano, a flood, a realm of shadow, a road
 * of a thousand torii, Mahito's hands, Sukuna's shrine, the Unlimited Void,
 * the Throne of the Strongest ...
 *
 * Only the corridor's solids are real (`@jjk/shared`): everything here is
 * scenery outside the lane or marks on its floor, so dressing a stage never
 * changes how it plays. All of it is merged into the stage's few batched
 * meshes (`PartBuilder`); a few things that need their own material (water)
 * go into `extras`.
 */
export interface ZoneContext {
  readonly def: StageDef;
  readonly b: PartBuilder;
  readonly extras: Group;
  readonly rnd: () => number;
  readonly z0: number;
  readonly z1: number;
  readonly len: number;
  readonly zc: number;
}

const HW = CORRIDOR.halfWidth;
const H = CORRIDOR.height;

/** Call `fn` along both sides of the lane every `step` (jittered), from z0 to z1. */
const alongSides = (c: ZoneContext, step: number, fn: (side: number, z: number) => void, jitter = 0.4): void => {
  for (const side of [-1, 1]) {
    for (let z = c.z0 + step * 0.5; z < c.z1; z += step) fn(side, z + (c.rnd() - 0.5) * step * jitter);
  }
};

/** The lane's floor: one slab in the stage's colour, a lighter strip down the middle. */
const laneFloor = (c: ZoneContext, color: number, kind: 'stud' | 'smooth' | 'flat' = 'stud', centre = true): void => {
  c.b.box(HW * 2, 0.4, c.len, color, kind, { y: -0.2, z: c.zc });
  if (centre) c.b.box(HW * 0.9, 0.02, c.len, shade(color, 1.1), 'flat', { y: 0.011, z: c.zc });
};

/** Ground out to the horizon either side of the lane (outdoor stages). */
const outerGround = (c: ZoneContext, color: number, width = 90, kind: 'stud' | 'flat' = 'stud', y = -0.25): void => {
  for (const side of [-1, 1]) c.b.box(width, 0.5, c.len, color, kind, { x: side * (HW + width / 2), y, z: c.zc });
};

/** Indoor walls either side and a ceiling, with light panels. */
const room = (c: ZoneContext, side: number, ceiling: number, lights = 0xfffbe8, lightStep = 10): void => {
  for (const s of [-1, 1]) {
    for (let course = 0; course < 4; course += 1) {
      const h = H / 4;
      c.b.box(1, h, c.len, course % 2 ? shade(side, 0.94) : side, 'stud', { x: s * (HW + 0.5), y: h * course + h / 2, z: c.zc });
    }
    c.b.box(0.3, 0.8, c.len, shade(side, 0.7), 'flat', { x: s * (HW - 0.05), y: 0.4, z: c.zc });
  }
  c.b.box(HW * 2 + 2, 0.6, c.len, ceiling, 'smooth', { y: H + 0.3, z: c.zc });
  if (lights >= 0) for (let z = c.z0 + 6; z < c.z1 - 2; z += lightStep) c.b.box(6, 0.1, 2.4, lights, 'glow', { y: H - 0.06, z });
};

/** A low barrier along the lane's edges (outdoor stages): rails, fences, hedges, walls. */
const edge = (c: ZoneContext, kind: 'rail' | 'fence' | 'hedge' | 'stone' | 'parapet' | 'none', color: number): void => {
  for (const s of [-1, 1]) {
    const x = s * (HW + 0.3);
    switch (kind) {
      case 'rail':
        for (let z = c.z0 + 1; z < c.z1; z += 4) c.b.box(0.2, 1.1, 0.2, shade(color, 0.8), 'smooth', { x, y: 0.55, z });
        c.b.box(0.15, 0.35, c.len, color, 'smooth', { x, y: 0.95, z: c.zc });
        break;
      case 'fence':
        fence(c.b, x, c.z0 + 1, c.z1 - 1, 2.2, color);
        break;
      case 'hedge':
        c.b.box(1.2, 1.6, c.len, color, 'flat', { x: x + s * 0.3, y: 0.8, z: c.zc });
        break;
      case 'stone':
        stoneWall(c.b, x + s * 0.3, c.z0, c.z1, 1.6, color);
        break;
      case 'parapet':
        c.b.box(0.8, 1.3, c.len, color, 'stud', { x: x + s * 0.2, y: 0.65, z: c.zc });
        c.b.box(1.0, 0.15, c.len, shade(color, 1.15), 'smooth', { x: x + s * 0.2, y: 1.35, z: c.zc });
        break;
      case 'none':
        break;
    }
  }
};

/** A flat sheet of water, its own translucent material. */
const water = (c: ZoneContext, color: number, y: number, width: number, centre = false): void => {
  const material = new MeshLambertMaterial({ color, transparent: true, opacity: 0.78, emissive: color, emissiveIntensity: 0.18 });
  const sides = centre ? [0] : [-1, 1];
  for (const side of sides) {
    const mesh = new Mesh(new PlaneGeometry(width, c.len), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(side * (HW + width / 2), y, c.zc);
    if (centre) mesh.position.x = 0;
    mesh.receiveShadow = true;
    c.extras.add(mesh);
  }
};

/** Floating motes of light scattered through the air (wisps, embers, stars). */
const motes = (c: ZoneContext, count: number, color: number, spread = 60, low = 2, high = 18, size = 0.25): void => {
  for (let i = 0; i < count; i += 1) {
    const side = c.rnd() < 0.5 ? -1 : 1;
    c.b.add(new SphereGeometry(size * (0.6 + c.rnd() * 0.8), 6, 4), color, 'glow', {
      x: side * (HW + 2 + c.rnd() * spread),
      y: low + c.rnd() * (high - low),
      z: c.z0 + c.rnd() * c.len,
    });
  }
};

// ================================================================== themes

const dojo = (c: ZoneContext): void => {
  const p = c.def.palette;
  // Plank floor, tatami runners either side.
  for (let i = 0; i < 8; i += 1) c.b.box(4, 0.4, c.len, i % 2 ? p.floor : shade(p.floor, 0.9), 'smooth', { x: -HW + 2 + i * 4, y: -0.2, z: c.zc });
  for (const s of [-1, 1]) c.b.box(4, 0.03, c.len, 0xd9cf8f, 'flat', { x: s * (HW - 2.5), y: 0.015, z: c.zc });
  room(c, p.side, WOOD_DARK, -1);
  for (const s of [-1, 1]) {
    // Shoji screens: paper panes in a wooden grid, pillars between bays.
    for (let z = c.z0 + 4; z < c.z1; z += 8) {
      c.b.box(0.6, H, 0.6, WOOD_DARK, 'smooth', { x: s * (HW - 0.1), y: H / 2, z });
      for (let y = 2; y < H - 2; y += 3) c.b.box(0.1, 0.14, 7.4, WOOD, 'smooth', { x: s * (HW - 0.12), y, z: z + 4 });
      talisman(c.b, s * (HW - 0.18), 7 + c.rnd() * 3, z + 2 + c.rnd() * 4, s > 0 ? -Math.PI / 2 : Math.PI / 2, 1.4);
    }
    // Banners of the school's crest.
    for (let z = c.z0 + 12; z < c.z1; z += 24) c.b.box(0.1, 6, 2.4, p.accent, 'smooth', { x: s * (HW - 0.2), y: 9, z });
  }
  // Ceiling beams and paper lanterns down the lane.
  for (let z = c.z0 + 4; z < c.z1; z += 8) c.b.box(HW * 2, 0.8, 0.6, WOOD_DARK, 'smooth', { y: H - 0.6, z });
  for (let z = c.z0 + 8; z < c.z1; z += 10) for (const s of [-1, 1]) paperLantern(c.b, s * 8, H - 3, z, 0xffc766, 1.3);
};

const street = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  laneFloor(c, p.floor, 'stud', false);
  // Lane markings and crossings.
  for (let z = c.z0 + 3; z < c.z1; z += 6) c.b.box(0.3, 0.02, 3, 0xf4f4f4, 'flat', { y: 0.012, z });
  for (let z = c.z0 + 30; z < c.z1; z += 60) for (let x = -HW + 2; x < HW; x += 3) c.b.box(1.6, 0.02, 4, 0xf4f4f4, 'flat', { x, y: 0.013, z });
  outerGround(c, shade(p.floor, 1.15), 18, 'stud', -0.1);
  edge(c, v === 'alley' ? 'none' : 'rail', 0xc8ccd8);
  const near = v === 'alley' ? HW + 3 : HW + 8;
  const lit = v === 'neon' || v === 'market' ? 0.75 : v === 'alley' ? 0.25 : 0.55;
  const windowColor = v === 'neon' ? 0xff9aff : 0xfff2a8;
  // Blocks along both sides, tallest at the back.
  for (const s of [-1, 1]) {
    for (let z = c.z0; z < c.z1; ) {
      const d = 8 + c.rnd() * 8;
      const w = 10 + c.rnd() * 8;
      const h = (v === 'alley' ? 18 : 12) + c.rnd() * (v === 'neon' ? 34 : 24);
      const tone = shade(p.side, 0.7 + c.rnd() * 0.5);
      building(c.b, s * (near + w / 2), z + d / 2, w, d, h, tone, -s, windowColor, lit, c.rnd);
      if (c.rnd() < 0.4) building(c.b, s * (near + w + 10), z + d / 2, 14, d, h + 15 + c.rnd() * 20, shade(tone, 0.8), -s, windowColor, lit * 0.8, c.rnd);
      z += d + 0.8;
    }
  }
  if (v !== 'alley') {
    for (let z = c.z0 + 6; z < c.z1; z += 14) for (const s of [-1, 1]) streetLamp(c.b, s * (HW + 2), z, 7, -s);
    for (let z = c.z0 + 10; z < c.z1; z += 22) vendingMachine(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 5), z, c.rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2, [0xe8303a, 0x2a6ae8, 0xf4f4f4][Math.floor(c.rnd() * 3)]!);
    for (let z = c.z0 + 16; z < c.z1; z += 26) car(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 4.5), z, [0xe8e8f0, 0x2a2a34, 0xc8202c, 0x3a6ae8][Math.floor(c.rnd() * 4)]!);
  } else {
    // The alley: fire escapes, dumpsters, a red lamp here and there.
    for (let z = c.z0 + 6; z < c.z1; z += 12) {
      const s = c.rnd() < 0.5 ? -1 : 1;
      c.b.box(2.4, 1.4, 1.6, 0x2a5a3a, 'smooth', { x: s * (HW + 1.6), y: 0.7, z });
      c.b.box(0.6, 0.6, 0.6, 0xff3a3a, 'glow', { x: s * (HW + 2.6), y: 6 + c.rnd() * 4, z: z + 3 });
      for (let y = 5; y < 18; y += 4) c.b.box(1.6, 0.15, 4, 0x3a3a40, 'smooth', { x: s * (HW + 2.2), y, z: z + 1 });
    }
  }
  if (v === 'neon') {
    for (let z = c.z0 + 20; z < c.z1; z += 34) bigScreen(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 7), z, 9, 10, [0xff5ae8, 0x3ad8ff, 0xffd23a][Math.floor(c.rnd() * 3)]!, 0);
    for (let z = c.z0 + 4; z < c.z1; z += 6) for (const s of [-1, 1]) c.b.box(0.2, 0.2, 4, c.rnd() < 0.5 ? 0xff5ae8 : 0x3ad8ff, 'glow', { x: s * (HW + 7.6), y: 4 + c.rnd() * 10, z });
  }
  if (v === 'market') {
    // Stalls with red awnings and strings of lanterns over the lane.
    for (let z = c.z0 + 5; z < c.z1; z += 7) {
      for (const s of [-1, 1]) {
        c.b.box(4, 2.4, 5, WOOD, 'smooth', { x: s * (HW + 3), y: 1.2, z });
        c.b.box(5, 0.2, 6, c.rnd() < 0.5 ? 0xc8202c : 0xf4f4f4, 'smooth', { x: s * (HW + 3), y: 3.4, z, rz: s * 0.2 });
      }
      for (let x = -HW + 2; x < HW; x += 4) paperLantern(c.b, x, 9 + Math.sin(x * 0.3) * 0.6, z, c.rnd() < 0.5 ? 0xff7a2a : 0xffc766, 0.8);
    }
  }
};

const school = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  if (v === 'modern') {
    laneFloor(c, p.floor, 'stud');
    outerGround(c, 0x6abf4a, 90, 'stud');
    edge(c, 'fence', 0x9aa0ac);
    // The school building on one side, the gym on the other.
    const s = 1;
    c.b.box(16, 18, c.len * 0.9, PLASTER, 'stud', { x: s * (HW + 20), y: 9, z: c.zc });
    for (let y = 3; y < 17; y += 5) for (let z = c.z0 + 4; z < c.z1 - 4; z += 4) c.b.box(0.1, 2.2, 2.6, 0x8ac8ff, 'glow', { x: s * (HW + 11.95), y, z });
    c.b.box(4, 26, 4, PLASTER, 'stud', { x: s * (HW + 14), y: 13, z: c.zc });
    c.b.add(new CylinderGeometry(1.6, 1.6, 0.3, 18), 0xffffff, 'glow', { x: s * (HW + 11.8), y: 22, z: c.zc, rz: Math.PI / 2 });
    c.b.box(20, 12, c.len * 0.6, 0x8a9ab8, 'stud', { x: -s * (HW + 22), y: 6, z: c.zc });
    c.b.add(new CylinderGeometry(10, 10, c.len * 0.6, 12, 1, false, 0, Math.PI), 0x6a7a98, 'smooth', { x: -s * (HW + 22), y: 12, z: c.zc, rx: Math.PI / 2, rz: Math.PI / 2 });
    for (let z = c.z0 + 8; z < c.z1; z += 14) tree(c.b, -s * (HW + 6), z, 9, 0xff9fd0, 0x7a4a2a);
  } else {
    // Jujutsu High (Tokyo or Kyoto): a stone path through temple grounds.
    laneFloor(c, p.floor, 'stud', false);
    for (let z = c.z0 + 1.5; z < c.z1; z += 3) c.b.box(8, 0.03, 2.6, shade(p.floor, 1.12), 'flat', { y: 0.014, z });
    outerGround(c, v === 'kyoto' ? 0x7aa05a : 0x5aa83a, 90, 'stud');
    edge(c, 'stone', STONE);
    for (let z = c.z0 + 10; z < c.z1; z += 30) for (const s of [-1, 1]) shrineHall(c.b, s * (HW + 16), z + 6, 12, 9, 6, 0, v === 'kyoto' ? 0x3a2a5a : ROOF, v === 'kyoto' ? 0x3a6ad8 : VERMILION);
    for (let z = c.z0 + 5; z < c.z1; z += 10) for (const s of [-1, 1]) stoneLantern(c.b, s * (HW + 2.5), z, 1.2);
    for (let z = c.z0 + 4; z < c.z1; z += 9) for (const s of [-1, 1]) pine(c.b, s * (HW + 6 + c.rnd() * 4), z, 10 + c.rnd() * 6);
    if (v === 'kyoto') pagoda(c.b, -(HW + 30), c.zc, 2.2, 0x2a2a3a, 0x3a6ad8);
    else pagoda(c.b, HW + 34, c.zc, 2, ROOF, VERMILION);
    torii(c.b, 0, c.z0 + 17, HW * 2 - 2, 15, p.accent);
  }
};

const tunnel = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  laneFloor(c, p.floor, 'stud', v !== 'subway');
  room(c, p.side, shade(p.side, 0.6), v === 'passage' ? 0xfff2c8 : 0xe8f4ff, v === 'passage' ? 16 : 8);
  if (v === 'passage') {
    // Pipes, caged lamps and puddles.
    for (const s of [-1, 1]) {
      for (const y of [11, 12.2]) c.b.add(new CylinderGeometry(0.35, 0.35, c.len, 8), 0x6a7078, 'smooth', { x: s * (HW - 0.6), y, z: c.zc, rx: Math.PI / 2 });
      for (let z = c.z0 + 6; z < c.z1; z += 12) {
        c.b.box(0.6, 0.8, 0.8, 0xffd27a, 'glow', { x: s * (HW - 0.4), y: 8, z });
        c.b.box(0.06, 3, 2, p.accent, 'smooth', { x: s * (HW - 0.06), y: 4, z: z + 3 });
      }
    }
    for (let i = 0; i < 6; i += 1) c.b.add(new CircleGeometry(1 + c.rnd() * 1.5, 12), 0x3a4a5a, 'smooth', { x: (c.rnd() - 0.5) * 24, y: 0.02, z: c.z0 + c.rnd() * c.len, rx: -Math.PI / 2 });
  } else {
    // Tiles, a yellow platform edge, a train standing on the far track.
    for (const s of [-1, 1]) {
      c.b.box(0.06, 0.6, c.len, p.accent, 'glow', { x: s * (HW - 0.04), y: 5, z: c.zc });
      for (let z = c.z0 + 8; z < c.z1; z += 16) {
        c.b.box(0.1, 1.6, 4, 0x1a1a22, 'smooth', { x: s * (HW - 0.06), y: 7.5, z });
        c.b.box(0.06, 1.2, 3.6, v === 'station' ? 0xffd23a : 0x3ad8ff, 'glow', { x: s * (HW - 0.1), y: 7.5, z });
      }
    }
    c.b.box(0.6, 0.03, c.len, 0xffd23a, 'flat', { x: -HW + 5, y: 0.015, z: c.zc });
    rails(c.b, -HW + 2.4, c.z0, c.z1);
    if (v === 'station') {
      for (let z = c.z0 + 8; z < c.z1; z += 16) pillar(c.b, HW - 5, z, H, shade(p.side, 0.9), p.accent);
    }
    for (let z = c.z0 + 18; z < c.z1 - 10; z += 36) trainCar(c.b, -HW - 4, z, 16, 0xd8dce4, p.accent);
  }
};

const interior = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  laneFloor(c, p.floor, v === 'classroom' ? 'smooth' : 'stud', false);
  room(c, p.side, shade(p.side, 0.55), v === 'cursed' ? 0x8a5aff : v === 'prison' ? 0xff4a4a : 0xf4fff4, v === 'cursed' ? 18 : 10);
  if (v === 'classroom') {
    for (let z = c.z0 + 1; z < c.z1; z += 1.5) c.b.box(HW * 2, 0.02, 0.06, shade(p.floor, 0.8), 'flat', { y: 0.012, z });
    for (const s of [-1, 1]) {
      for (let z = c.z0 + 8; z < c.z1; z += 18) {
        c.b.box(0.1, 4, 10, 0x2f5a3a, 'smooth', { x: s * (HW - 0.06), y: 6, z });
        c.b.box(0.12, 0.3, 10.4, WOOD, 'smooth', { x: s * (HW - 0.08), y: 3.9, z });
      }
      for (let z = c.z0 + 3; z < c.z1; z += 9) c.b.box(0.06, 3.4, 4, 0x1a2a4a, 'glow', { x: s * (HW - 0.04), y: 11, z });
      for (let z = c.z0 + 2; z < c.z1; z += 1.2) c.b.box(0.5, 3.2, 1.1, 0x5a7a9a, 'smooth', { x: s * (HW - 0.3), y: 1.6, z });
    }
    // Desks shoved against the walls, a few knocked over.
    for (let i = 0; i < 10; i += 1) {
      const s = c.rnd() < 0.5 ? -1 : 1;
      desk(c.b, s * (HW - 2.2 - c.rnd() * 1.5), c.z0 + c.rnd() * c.len, c.rnd() * 3, c.rnd() < 0.3);
    }
  } else if (v === 'cursed') {
    // Stains, eyes on the walls, talismans everywhere.
    for (let i = 0; i < 18; i += 1) {
      const s = c.rnd() < 0.5 ? -1 : 1;
      c.b.add(new CircleGeometry(0.8 + c.rnd() * 2.2, 10), 0x2a0a2a, 'smooth', { x: s * (HW - 0.05), y: 2 + c.rnd() * 12, z: c.z0 + c.rnd() * c.len, ry: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
    for (let z = c.z0 + 10; z < c.z1; z += 16) {
      const s = c.rnd() < 0.5 ? -1 : 1;
      eye(c.b, s * (HW - 0.6), 6 + c.rnd() * 6, z, 0.9 + c.rnd() * 0.8, p.accent, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
    for (let z = c.z0 + 4; z < c.z1; z += 3.5) for (const s of [-1, 1]) talisman(c.b, s * (HW - 0.12), 3 + c.rnd() * 10, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, 1.2);
  } else if (v === 'hospital') {
    for (let z = c.z0 + 1; z < c.z1; z += 2) for (let x = -HW + 1; x < HW; x += 2) c.b.box(1.9, 0.02, 1.9, (x + z) % 4 === 0 ? 0xc8d8c8 : 0xb0c4b0, 'flat', { x, y: 0.012, z });
    for (const s of [-1, 1]) {
      for (let z = c.z0 + 6; z < c.z1; z += 9) {
        bed(c.b, s * (HW - 2), z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
        c.b.box(0.05, 6, 3, 0xd8e8f0, 'smooth', { x: s * (HW - 4.2), y: 3.6, z: z + 2.4 });
      }
      for (let z = c.z0 + 12; z < c.z1; z += 24) {
        c.b.box(0.08, 2.4, 0.8, 0xff3a3a, 'glow', { x: s * (HW - 0.05), y: 10, z });
        c.b.box(0.08, 0.8, 2.4, 0xff3a3a, 'glow', { x: s * (HW - 0.05), y: 10, z });
      }
    }
  } else if (v === 'prison') {
    for (const s of [-1, 1]) {
      for (let z = c.z0 + 2; z < c.z1 - 6; z += 8) {
        bars(c.b, s * (HW - 0.4), z, z + 6, 7);
        c.b.box(0.4, 7.4, 0.4, 0x3a3a42, 'smooth', { x: s * (HW - 0.4), y: 3.7, z: z + 7 });
      }
      for (let z = c.z0 + 10; z < c.z1; z += 20) c.b.box(0.4, 0.4, 0.4, 0xff2a2a, 'glow', { x: s * (HW - 0.3), y: 11, z });
    }
  }
};

const forest = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  laneFloor(c, p.floor, 'stud', false);
  // A dirt path down the middle.
  c.b.box(10, 0.02, c.len, shade(p.floor, v === 'cursed' ? 0.75 : 0.65), 'flat', { y: 0.012, z: c.zc });
  outerGround(c, p.floor, 100, 'stud');
  edge(c, v === 'bamboo' ? 'fence' : 'hedge', v === 'bamboo' ? 0x8a6a3a : shade(p.side, 1.1));
  if (v === 'bamboo') {
    for (let i = 0; i < 70; i += 1) {
      const s = c.rnd() < 0.5 ? -1 : 1;
      bamboo(c.b, s * (HW + 3 + c.rnd() * 40), c.z0 + c.rnd() * c.len, 14 + c.rnd() * 10, c.rnd, i % 3 ? 0x7ccf45 : 0x9ad85a);
    }
    for (let z = c.z0 + 6; z < c.z1; z += 12) for (const s of [-1, 1]) stoneLantern(c.b, s * (HW + 2), z, 1.1);
    return;
  }
  for (let i = 0; i < 60; i += 1) {
    const s = c.rnd() < 0.5 ? -1 : 1;
    const x = s * (HW + 4 + c.rnd() * 55);
    const z = c.z0 + c.rnd() * c.len;
    const h = 10 + c.rnd() * 12;
    if (v === 'cursed') {
      if (c.rnd() < 0.55) deadTree(c.b, x, z, h, 0x2a1a24, c.rnd);
      else pine(c.b, x, z, h, 0x1a3a2a);
    } else if (c.rnd() < 0.5) tree(c.b, x, z, h, [0x3fae4a, 0x5ac83a, 0x2f9e4f][Math.floor(c.rnd() * 3)]!);
    else pine(c.b, x, z, h);
  }
  for (let i = 0; i < 14; i += 1) rock(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 2 + c.rnd() * 30), c.z0 + c.rnd() * c.len, 0.8 + c.rnd() * 2, v === 'cursed' ? 0x3a3a44 : 0x8a8a90);
  if (v === 'cursed') {
    motes(c, 40, p.accent, 40, 1, 12, 0.22);
    for (let z = c.z0 + 20; z < c.z1; z += 40) eye(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 14), 9 + c.rnd() * 5, z, 2.2, p.accent);
  } else {
    // Flowers in the grass.
    for (let i = 0; i < 40; i += 1) c.b.add(new SphereGeometry(0.25, 5, 4), [0xffd23a, 0xff8ab8, 0xffffff][i % 3]!, 'flat', { x: (c.rnd() < 0.5 ? -1 : 1) * (HW + 1 + c.rnd() * 12), y: 0.2, z: c.z0 + c.rnd() * c.len });
  }
};

const cemetery = (c: ZoneContext): void => {
  const p = c.def.palette;
  laneFloor(c, shade(p.floor, 0.8), 'stud', false);
  c.b.box(8, 0.02, c.len, 0x6a6a62, 'flat', { y: 0.012, z: c.zc });
  outerGround(c, p.floor, 100, 'stud');
  edge(c, 'stone', 0x8a8a92);
  for (const s of [-1, 1]) {
    for (let row = 0; row < 5; row += 1) {
      for (let z = c.z0 + 3; z < c.z1; z += 3.6) {
        if (c.rnd() < 0.15) continue;
        const x = s * (HW + 3 + row * 4.2);
        if (c.rnd() < 0.7) grave(c.b, x, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, shade(0x9a9aa2, 0.85 + c.rnd() * 0.3));
        else for (let k = 0; k < 3; k += 1) sotoba(c.b, x + (k - 1) * 0.3, z, 2 + c.rnd());
      }
    }
    for (let z = c.z0 + 10; z < c.z1; z += 20) stoneLantern(c.b, s * (HW + 1.6), z, 1.2, 0x7affd8);
  }
  for (let i = 0; i < 10; i += 1) deadTree(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 25 + c.rnd() * 20), c.z0 + c.rnd() * c.len, 12 + c.rnd() * 8, 0x2a2420, c.rnd);
  motes(c, 30, 0x7affd8, 30, 1, 6, 0.3);
  torii(c.b, 0, c.z0 + 17, HW * 2 - 2, 14, 0x5a5a62);
};

const industrial = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  laneFloor(c, p.floor, 'stud', false);
  for (let i = 0; i < 8; i += 1) c.b.add(new CircleGeometry(1 + c.rnd() * 2, 10), 0x2a2a2e, 'smooth', { x: (c.rnd() - 0.5) * 26, y: 0.015, z: c.z0 + c.rnd() * c.len, rx: -Math.PI / 2 });
  outerGround(c, shade(p.floor, 0.9), 100, 'stud');
  edge(c, 'fence', 0x9aa0ac);
  if (v === 'trains') {
    for (const s of [-1, 1]) for (let t = 0; t < 4; t += 1) {
      const x = s * (HW + 4 + t * 5);
      rails(c.b, x, c.z0, c.z1);
      for (let z = c.z0 + 6 + c.rnd() * 20; z < c.z1 - 10; z += 30 + c.rnd() * 20) trainCar(c.b, x, z, 14, [0x8a4a2a, 0x3a5a8a, 0xd8dce4, 0x5a6a3a][Math.floor(c.rnd() * 4)]!, 0xffc23a);
    }
    for (let z = c.z0 + 10; z < c.z1; z += 30) for (const s of [-1, 1]) {
      c.b.box(0.3, 6, 0.3, 0x3a3a40, 'smooth', { x: s * (HW + 2), y: 3, z });
      c.b.box(0.6, 1.4, 0.6, 0x1a1a1a, 'smooth', { x: s * (HW + 2), y: 6.4, z });
      c.b.box(0.3, 0.3, 0.3, c.rnd() < 0.5 ? 0xff3a3a : 0x3aff6a, 'glow', { x: s * (HW + 2), y: 6.6, z: z + 0.35 });
    }
    return;
  }
  for (const s of [-1, 1]) {
    for (let z = c.z0 + 4; z < c.z1; z += 8) {
      if (c.rnd() < 0.3) continue;
      const color = [0xc8202c, 0x2a6ae8, 0x3aa04a, 0xe8a83a, 0x8a8a90][Math.floor(c.rnd() * 5)]!;
      container(c.b, s * (HW + 4 + c.rnd() * 3), z, color);
      if (c.rnd() < 0.5) container(c.b, s * (HW + 4.5 + c.rnd() * 2), z, shade(color, 0.8), 0, 2.6);
    }
    for (let z = c.z0 + 20; z < c.z1; z += 40) smokestack(c.b, s * (HW + 30 + c.rnd() * 20), z, 30 + c.rnd() * 20);
    c.b.box(24, 16, c.len * 0.8, shade(p.side, 0.9), 'stud', { x: s * (HW + 22), y: 8, z: c.zc });
    for (const y of [4, 9, 14]) c.b.add(new CylinderGeometry(0.6, 0.6, c.len, 8), 0x8a8e98, 'smooth', { x: s * (HW + 9.6), y, z: c.zc, rx: Math.PI / 2 });
  }
};

const rooftop = (c: ZoneContext): void => {
  const p = c.def.palette;
  laneFloor(c, p.floor, 'stud', false);
  for (let z = c.z0 + 2; z < c.z1; z += 4) c.b.box(HW * 2, 0.03, 0.12, shade(p.floor, 0.85), 'flat', { y: 0.015, z });
  edge(c, 'parapet', p.side);
  // The city far below and around: the tops of towers, a few rising past the roof.
  for (let i = 0; i < 36; i += 1) {
    const s = c.rnd() < 0.5 ? -1 : 1;
    const w = 10 + c.rnd() * 12;
    const top = -30 + c.rnd() * 60;
    const x = s * (HW + 10 + c.rnd() * 70);
    const z = c.z0 + c.rnd() * c.len;
    const tone = shade(p.side, 0.6 + c.rnd() * 0.5);
    c.b.box(w, 60, w, tone, 'stud', { x, y: top - 30, z });
    c.b.box(w + 0.4, 0.5, w + 0.4, shade(tone, 0.7), 'smooth', { x, y: top + 0.25, z });
    for (let y = top - 3; y > top - 30; y -= 3) {
      if (c.rnd() < 0.5) c.b.box(0.06, 1.3, w * 0.8, 0xfff2a8, 'glow', { x: x - s * (w / 2 + 0.02), y, z });
    }
  }
  // Rooftop clutter: water tanks, AC units, an antenna mast.
  for (let z = c.z0 + 8; z < c.z1; z += 14) {
    const s = c.rnd() < 0.5 ? -1 : 1;
    c.b.add(new CylinderGeometry(1.4, 1.4, 2.6, 12), 0x8aa0b8, 'smooth', { x: s * (HW + 3), y: 3.4, z });
    for (const dz of [-1.2, 1.2]) c.b.box(0.2, 2.2, 0.2, 0x3a3e48, 'smooth', { x: s * (HW + 3), y: 1.1, z: z + dz });
    c.b.box(2, 1.4, 1.4, 0xd8dce4, 'smooth', { x: -s * (HW + 2), y: 0.7, z: z + 5 });
  }
  c.b.add(new CylinderGeometry(0.15, 0.25, 22, 6), 0x9aa0ac, 'smooth', { x: HW + 6, y: 11, z: c.zc });
  c.b.add(new SphereGeometry(0.4, 8, 6), 0xff3a3a, 'glow', { x: HW + 6, y: 22.2, z: c.zc });
};

const ruins = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  laneFloor(c, p.floor, 'stud', false);
  // Cracks across the road.
  for (let i = 0; i < 14; i += 1) c.b.box(0.25, 0.02, 3 + c.rnd() * 6, 0x1a1a1e, 'flat', { x: (c.rnd() - 0.5) * 28, y: 0.013, z: c.z0 + c.rnd() * c.len, ry: c.rnd() * 3 });
  outerGround(c, shade(p.floor, 0.9), 100, 'stud');
  edge(c, 'none', 0);
  const wallColor = v === 'heian' ? 0x8a6a4a : p.side;
  for (let i = 0; i < 16; i += 1) {
    const s = c.rnd() < 0.5 ? -1 : 1;
    if (v === 'heian') shrineHall(c.b, s * (HW + 14 + c.rnd() * 30), c.z0 + c.rnd() * c.len, 8, 6, 4, c.rnd() * 0.3, 0x2a2420, 0x5a3a2a);
    else ruin(c.b, s * (HW + 12 + c.rnd() * 40), c.z0 + c.rnd() * c.len, 10 + c.rnd() * 10, 8 + c.rnd() * 8, 10 + c.rnd() * 30, shade(wallColor, 0.7 + c.rnd() * 0.5), c.rnd);
  }
  for (let i = 0; i < 18; i += 1) rubble(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 1.5 + c.rnd() * 10), c.z0 + c.rnd() * c.len, 2 + c.rnd() * 2.5, p.wall, c.rnd);
  for (let z = c.z0 + 12; z < c.z1; z += 22) {
    const s = c.rnd() < 0.5 ? -1 : 1;
    if (v !== 'heian') car(c.b, s * (HW + 4), z, [0x8a3a2a, 0x3a3a44, 0x6a6a72][Math.floor(c.rnd() * 3)]!, c.rnd() * 3, true);
    flame(c.b, s * (HW + 6 + c.rnd() * 8), 0, z + 6, 1.2 + c.rnd(), v === 'cursed' ? 0xff3ad8 : 0xff6a1c, v === 'cursed' ? 0xffb8f4 : 0xffd23a);
  }
  if (v === 'cursed') {
    for (let z = c.z0 + 16; z < c.z1; z += 26) eye(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 20), 14 + c.rnd() * 10, z, 3, p.accent);
    motes(c, 40, p.accent, 50, 2, 20, 0.3);
  } else if (v === 'colony') {
    // The colony's barrier: a vast dome on the horizon, and floating screens with the scores.
    const dome = new Mesh(new SphereGeometry(320, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new MeshLambertMaterial({ color: 0x3a3a5a, transparent: true, opacity: 0.18, side: DoubleSide, emissive: 0x1a1a3a, depthWrite: false }));
    dome.position.set(0, -20, c.zc);
    c.extras.add(dome);
    for (let z = c.z0 + 20; z < c.z1; z += 40) c.b.box(0.3, 4, 7, p.accent, 'glow', { x: (c.rnd() < 0.5 ? -1 : 1) * (HW + 8), y: 14, z });
  } else if (v === 'heian') {
    for (let z = c.z0 + 6; z < c.z1; z += 12) for (const s of [-1, 1]) {
      c.b.box(0.15, 8, 0.15, 0x3a2a1a, 'smooth', { x: s * (HW + 2), y: 4, z });
      c.b.box(0.05, 4, 1.6, c.rnd() < 0.5 ? 0xc8202c : 0xf4ecd8, 'smooth', { x: s * (HW + 2.1), y: 5.6, z: z + 0.8 });
    }
    motes(c, 40, 0xff9a3a, 40, 1, 14, 0.15);
  } else {
    motes(c, 24, 0xffb06a, 40, 1, 14, 0.15);
  }
};

const volcano = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  laneFloor(c, p.floor, 'flat', false);
  for (let i = 0; i < 16; i += 1) c.b.box(0.4, 0.03, 2 + c.rnd() * 5, 0xff6a1c, 'glow', { x: (c.rnd() - 0.5) * 28, y: 0.014, z: c.z0 + c.rnd() * c.len, ry: c.rnd() * 3 });
  // A sea of lava either side, glowing, below the basalt road.
  for (const s of [-1, 1]) c.b.box(120, 0.3, c.len, 0xff5a1a, 'glow', { x: s * (HW + 60), y: -1.4, z: c.zc });
  for (const s of [-1, 1]) c.b.box(2, 1.6, c.len, 0x2a1410, 'flat', { x: s * (HW + 1), y: -0.6, z: c.zc });
  for (let i = 0; i < 26; i += 1) rock(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 4 + c.rnd() * 50), c.z0 + c.rnd() * c.len, 1.5 + c.rnd() * 4, 0x2a1a18, -1.2);
  // Volcanic cones on the horizon, their craters alight.
  for (let z = c.z0 + 20; z < c.z1; z += 45) {
    for (const s of [-1, 1]) {
      const x = s * (HW + 50 + c.rnd() * 30);
      const h = 40 + c.rnd() * 30;
      c.b.add(new ConeGeometry(h * 0.6, h, 10), 0x3a2018, 'flat', { x, y: h / 2 - 2, z });
      c.b.add(new CylinderGeometry(h * 0.12, h * 0.16, 1, 10), 0xffd23a, 'glow', { x, y: h - 2.3, z });
    }
  }
  for (let z = c.z0 + 8; z < c.z1; z += 14) flame(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 3 + c.rnd() * 6), -0.8, z, 1.5 + c.rnd() * 1.5);
  motes(c, 50, 0xff8a2a, 50, 0, 20, 0.18);
  if (v === 'coffin') {
    // Jogo's domain: the volcano closes in - walls of rock rising either side, spilling magma.
    for (const s of [-1, 1]) {
      c.b.box(10, 60, c.len, 0x3a1810, 'flat', { x: s * (HW + 24), y: 28, z: c.zc });
      for (let z = c.z0 + 8; z < c.z1; z += 16) c.b.box(1, 50, 3, 0xff6a1c, 'glow', { x: s * (HW + 18.8), y: 25, z });
    }
  }
};

const flooded = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  if (v === 'beach') {
    laneFloor(c, p.floor, 'stud', false);
    for (const s of [-1, 1]) c.b.box(14, 0.4, c.len, shade(p.floor, 1.05), 'stud', { x: s * (HW + 7), y: -0.3, z: c.zc });
    water(c, 0x2ab8e8, -0.6, 160);
    for (let z = c.z0 + 6; z < c.z1; z += 10) {
      const s = c.rnd() < 0.5 ? -1 : 1;
      const x = s * (HW + 3 + c.rnd() * 8);
      c.b.add(new CylinderGeometry(0.25, 0.35, 9, 6), 0x8a6a3a, 'flat', { x, y: 4.5, z, rz: s * 0.2 });
      for (let k = 0; k < 5; k += 1) c.b.add(new ConeGeometry(0.6, 4, 4), 0x3aa04a, 'flat', { x: x + s * 0.9 + Math.cos(k) * 1.2, y: 8.6, z: z + Math.sin(k) * 1.2, rz: Math.cos(k) * 1.3, rx: Math.sin(k) * 1.3 });
    }
    // Dagon's shikigami fish breaching the shallows.
    for (let z = c.z0 + 20; z < c.z1; z += 30) {
      const s = c.rnd() < 0.5 ? -1 : 1;
      c.b.add(new SphereGeometry(2.5, 10, 8), 0x5a8aaa, 'smooth', { x: s * (HW + 30 + c.rnd() * 20), y: 1, z, sz: 2.2 });
      c.b.add(new ConeGeometry(1.6, 3, 4), 0x4a7a9a, 'smooth', { x: s * (HW + 30), y: 3.2, z: z - 3, rx: -0.4 });
    }
    return;
  }
  // The flooded city: a sunken street, water lapping the lane, wrecks in it.
  laneFloor(c, p.floor, 'stud', false);
  for (let i = 0; i < 10; i += 1) c.b.add(new CircleGeometry(1 + c.rnd() * 2.5, 12), 0x2a5a7a, 'smooth', { x: (c.rnd() - 0.5) * 26, y: 0.02, z: c.z0 + c.rnd() * c.len, rx: -Math.PI / 2 });
  water(c, 0x2a6a8a, -0.2, 150);
  edge(c, 'rail', 0x8a9aa8);
  for (let i = 0; i < 18; i += 1) {
    const s = c.rnd() < 0.5 ? -1 : 1;
    building(c.b, s * (HW + 14 + c.rnd() * 45), c.z0 + c.rnd() * c.len, 10 + c.rnd() * 8, 10, 14 + c.rnd() * 22, shade(p.side, 0.7 + c.rnd() * 0.4), -s, 0x3affd8, 0.3, c.rnd);
  }
  for (let z = c.z0 + 8; z < c.z1; z += 18) car(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 5 + c.rnd() * 5), z, 0x6a7a8a, c.rnd() * 3, true);
  for (let i = 0; i < 20; i += 1) crystal(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 3 + c.rnd() * 10), c.z0 + c.rnd() * c.len, 2 + c.rnd() * 2, p.accent, (c.rnd() - 0.5) * 0.6);
};

const shadow = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  laneFloor(c, p.floor, 'smooth', false);
  c.b.box(HW * 2, 0.02, c.len, shade(p.accent, 0.25), 'flat', { y: 0.012, z: c.zc });
  outerGround(c, 0x07070c, 120, 'flat');
  for (let i = 0; i < 26; i += 1) {
    const r = 2 + c.rnd() * 5;
    const x = (c.rnd() < 0.5 ? -1 : 1) * (HW + 3 + c.rnd() * 40);
    const z = c.z0 + c.rnd() * c.len;
    c.b.add(new CircleGeometry(r, 14), 0x020204, 'smooth', { x, y: 0.02, z, rx: -Math.PI / 2 });
    if (i % 2 === 0) groundRing(c.b, x, z, r, p.accent, 0.18);
  }
  // A glowing rim keeps the lane readable against the dark.
  for (const s of [-1, 1]) c.b.box(0.25, 0.08, c.len, p.accent, 'glow', { x: s * (HW - 0.2), y: 0.05, z: c.zc });
  for (let z = c.z0 + 10; z < c.z1; z += 20) for (const s of [-1, 1]) crystal(c.b, s * (HW + 4), z, 4, p.accent, s * 0.15);
  // Tendrils of shadow rising, and shikigami eyes watching from the dark.
  for (let i = 0; i < 40; i += 1) {
    const s = c.rnd() < 0.5 ? -1 : 1;
    const h = 4 + c.rnd() * 14;
    c.b.add(new ConeGeometry(0.4 + c.rnd() * 0.6, h, 5), shade(p.accent, 0.3), 'flat', { x: s * (HW + 3 + c.rnd() * 30), y: h / 2, z: c.z0 + c.rnd() * c.len, rz: (c.rnd() - 0.5) * 0.4 });
  }
  for (let i = 0; i < 16; i += 1) {
    const s = c.rnd() < 0.5 ? -1 : 1;
    const x = s * (HW + 6 + c.rnd() * 30);
    const y = 1 + c.rnd() * 8;
    const z = c.z0 + c.rnd() * c.len;
    for (const dx of [-0.35, 0.35]) c.b.box(0.4, 0.14, 0.1, 0xf2f2ff, 'glow', { x: x + dx, y, z, ry: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  if (v === 'garden') {
    for (let i = 0; i < 18; i += 1) deadTree(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 6 + c.rnd() * 30), c.z0 + c.rnd() * c.len, 10 + c.rnd() * 8, 0x0a0a14, c.rnd);
    for (let z = c.z0 + 20; z < c.z1; z += 40) giantHand(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 16), z, 3, 0x0e0e18);
  }
  motes(c, 40, p.accent, 40, 1, 14, 0.2);
};

const shrine = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  laneFloor(c, p.floor, 'stud', false);
  for (let z = c.z0 + 1.5; z < c.z1; z += 3) c.b.box(10, 0.03, 2.6, shade(p.floor, 1.1), 'flat', { y: 0.014, z });
  const grass = v === 'cursed' ? 0x2a1414 : v === 'barrier' ? 0x1a1a2a : v === 'sakura' ? 0x7ac05a : v === 'arena' ? 0xb8a888 : v === 'wheel' ? 0xd8d0c0 : 0x5aa83a;
  outerGround(c, grass, 100, 'stud');
  if (v === 'shrine' || v === 'sakura') {
    // The road of a thousand torii: a tunnel of gates down the lane.
    for (let z = c.z0 + 4; z < c.z1; z += 9) if (Math.abs(z - c.def.bagZ) > 4) torii(c.b, 0, z, HW * 2 - 1, 17, v === 'sakura' ? 0xe8505a : VERMILION);
    for (let z = c.z0 + 10; z < c.z1; z += 22) for (const s of [-1, 1]) stoneLantern(c.b, s * (HW + 3), z, 1.4);
    for (let i = 0; i < 24; i += 1) {
      const s = c.rnd() < 0.5 ? -1 : 1;
      if (v === 'sakura') tree(c.b, s * (HW + 6 + c.rnd() * 30), c.z0 + c.rnd() * c.len, 10 + c.rnd() * 6, c.rnd() < 0.5 ? 0xff9fd0 : 0xffb8dc);
      else pine(c.b, s * (HW + 6 + c.rnd() * 30), c.z0 + c.rnd() * c.len, 10 + c.rnd() * 8);
    }
    shrineHall(c.b, HW + 26, c.zc, 14, 10, 7);
    if (v === 'sakura') {
      pagoda(c.b, -(HW + 28), c.zc, 2.3, ROOF, 0xe8505a);
      for (let i = 0; i < 60; i += 1) c.b.box(0.3, 0.02, 0.3, 0xffb8dc, 'flat', { x: (c.rnd() - 0.5) * 30, y: 0.02, z: c.z0 + c.rnd() * c.len, ry: c.rnd() * 3 });
    }
    return;
  }
  if (v === 'barrier') {
    // The domain's entrance: floating talismans, a barrier curtain, braziers.
    edge(c, 'stone', 0x3a3a5a);
    for (let z = c.z0 + 6; z < c.z1; z += 10) for (const s of [-1, 1]) brazier(c.b, s * (HW + 2.6), z, p.accent);
    for (let i = 0; i < 50; i += 1) talisman(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 2 + c.rnd() * 20), 4 + c.rnd() * 12, c.z0 + c.rnd() * c.len, c.rnd() * 3, 1.6, true);
    for (const s of [-1, 1]) c.b.box(0.2, 40, c.len, p.accent, 'glow', { x: s * (HW + 26), y: 20, z: c.zc });
    torii(c.b, 0, c.z0 + 17, HW * 2 - 1, 15, 0x2a2a3a);
    return;
  }
  if (v === 'arena') {
    // A colosseum: tiers of stone seats rising either side.
    for (const s of [-1, 1]) for (let t = 0; t < 6; t += 1) c.b.box(4, 2 + t * 2, c.len, shade(p.side, 0.9 + t * 0.04), 'stud', { x: s * (HW + 3 + t * 4), y: 1 + t, z: c.zc });
    for (let z = c.z0 + 8; z < c.z1; z += 16) for (const s of [-1, 1]) {
      c.b.box(0.3, 12, 0.3, 0x5a4a3a, 'smooth', { x: s * (HW + 26), y: 18, z });
      c.b.box(0.06, 5, 2.6, p.accent, 'smooth', { x: s * (HW + 26.1), y: 21, z: z + 1.4 });
    }
    groundRing(c.b, 0, c.zc, 12, p.accent, 0.2);
    return;
  }
  if (v === 'cursed') {
    edge(c, 'none', 0);
    skullShrine(c.b, HW + 22, c.zc, 1.8, c.rnd);
    skullShrine(c.b, -(HW + 22), c.zc + 30, 1.4, c.rnd);
    for (let i = 0; i < 20; i += 1) bonePile(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 3 + c.rnd() * 20), c.z0 + c.rnd() * c.len, 1 + c.rnd(), c.rnd);
    for (let z = c.z0 + 6; z < c.z1; z += 12) for (const s of [-1, 1]) brazier(c.b, s * (HW + 2), z, 0xff2a3a);
    return;
  }
  // 'wheel': Mahoraga's shrine - white stone, gold, and the great wheel overhead.
  edge(c, 'stone', 0xe8e0d0);
  for (let z = c.z0 + 8; z < c.z1; z += 16) for (const s of [-1, 1]) pillar(c.b, s * (HW + 4), z, 14, 0xf4f0e8, 0xffd23a);
  wheel(c.b, 0, 34, c.zc, 14, 0xffd23a, 8);
  motes(c, 30, 0xfff2a8, 40, 4, 26, 0.25);
};

const domain = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  laneFloor(c, p.floor, 'smooth', false);
  outerGround(c, shade(p.floor, 0.8), 120, 'flat');
  groundRing(c.b, 0, c.zc, HW - 1, p.accent, 0.18);
  if (v === 'hands') {
    for (let i = 0; i < 26; i += 1) giantHand(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 5 + c.rnd() * 40), c.z0 + c.rnd() * c.len, 2 + c.rnd() * 4, shade(p.side, 1.2 + c.rnd() * 0.5), c.rnd() * 3);
    for (let z = c.z0 + 20; z < c.z1; z += 40) eye(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 30), 20, z, 4, p.accent);
  } else if (v === 'clash') {
    for (let i = 0; i < 30; i += 1) crystal(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 4 + c.rnd() * 40), c.z0 + c.rnd() * c.len, 6 + c.rnd() * 14, c.rnd() < 0.5 ? p.accent : p.wall, (c.rnd() - 0.5) * 0.5);
    for (let z = c.z0 + 30; z < c.z1; z += 50) c.b.add(new TorusGeometry(10, 0.4, 6, 40), p.accent, 'glow', { x: 0, y: 30, z, rx: Math.PI / 2 + (c.rnd() - 0.5) * 0.6 });
  } else if (v === 'eye') {
    for (let i = 0; i < 18; i += 1) eyeCube(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 8 + c.rnd() * 30), 6 + c.rnd() * 20, c.z0 + c.rnd() * c.len, 3 + c.rnd() * 4);
    for (let i = 0; i < 20; i += 1) eye(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 4 + c.rnd() * 30), 1 + c.rnd() * 3, c.z0 + c.rnd() * c.len, 0.8 + c.rnd(), p.accent);
  } else if (v === 'womb') {
    for (let i = 0; i < 30; i += 1) {
      const s = c.rnd() < 0.5 ? -1 : 1;
      const h = 8 + c.rnd() * 20;
      c.b.add(new CylinderGeometry(0.6 + c.rnd(), 1.4 + c.rnd() * 2, h, 7), shade(p.side, 1.2 + c.rnd() * 0.6), 'flat', { x: s * (HW + 4 + c.rnd() * 36), y: h / 2, z: c.z0 + c.rnd() * c.len, rz: (c.rnd() - 0.5) * 0.5 });
    }
    motes(c, 40, p.accent, 40, 1, 20, 0.3);
  } else if (v === 'shrine') {
    // MALEVOLENT SHRINE: a lake of blood, a towering shrine of mouths, bones heaped all round.
    c.b.box(HW * 2, 0.02, c.len, 0x5a0408, 'glow', { y: 0.012, z: c.zc });
    skullShrine(c.b, 0, c.z1 - 20, 3.2, c.rnd);
    for (let i = 0; i < 40; i += 1) bonePile(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 2 + c.rnd() * 36), c.z0 + c.rnd() * c.len, 1 + c.rnd() * 1.5, c.rnd);
    for (let z = c.z0 + 30; z < c.z1; z += 30) for (const s of [-1, 1]) torii(c.b, s * (HW + 18), z, 10, 18, 0x3a0a0a, Math.PI / 2);
  } else if (v === 'throne') {
    // The throne of curses on a dais of obsidian, flames burning before it.
    for (const s of [-1, 1]) for (let i = 0; i < 12; i += 1) crystal(c.b, s * (HW + 4 + c.rnd() * 30), c.z0 + c.rnd() * c.len, 8 + c.rnd() * 16, 0x2a0a10, (c.rnd() - 0.5) * 0.4);
    c.b.box(16, 4, 10, 0x1a0a0e, 'flat', { x: HW + 26, y: 2, z: c.zc });
    c.b.box(6, 14, 2, 0x2a0a10, 'flat', { x: HW + 26, y: 11, z: c.zc + 4 });
    c.b.box(8, 2, 6, 0x2a0a10, 'flat', { x: HW + 26, y: 5, z: c.zc });
    for (let z = c.z0 + 6; z < c.z1; z += 10) for (const s of [-1, 1]) flame(c.b, s * (HW + 2.5), 0, z, 1.8, 0xff2a1a, 0xffa83a);
    motes(c, 50, 0xff3a1a, 50, 1, 24, 0.2);
  }
};

const voidZone = (c: ZoneContext): void => {
  const p = c.def.palette;
  const v = c.def.variant;
  // A floor of light, gridded.
  laneFloor(c, p.floor, 'smooth', false);
  for (let z = c.z0; z < c.z1; z += 4) c.b.box(HW * 2, 0.02, 0.08, p.accent, 'glow', { y: 0.013, z });
  for (let x = -HW; x <= HW; x += 4) c.b.box(0.08, 0.02, c.len, p.accent, 'glow', { x, y: 0.013, z: c.zc });
  if (v === 'heaven') {
    // The Throne of the Strongest: golden clouds, white columns, rings of light.
    for (let i = 0; i < 40; i += 1) c.b.add(new SphereGeometry(3 + c.rnd() * 5, 8, 6), c.rnd() < 0.5 ? 0xfff4d8 : 0xffe8a8, 'flat', { x: (c.rnd() < 0.5 ? -1 : 1) * (HW + 6 + c.rnd() * 50), y: -2 + c.rnd() * 6, z: c.z0 + c.rnd() * c.len, sy: 0.5 });
    for (let z = c.z0 + 8; z < c.z1; z += 16) for (const s of [-1, 1]) pillar(c.b, s * (HW + 3), z, 20, 0xffffff, 0xffd23a);
    for (let z = c.z0 + 20; z < c.z1; z += 40) wheel(c.b, 0, 36, z, 16, 0xffd23a, 12);
    c.b.add(new CylinderGeometry(6, 6, 200, 16, 1, true), 0xfff8e0, 'glow', { x: HW + 40, y: 100, z: c.zc });
    return;
  }
  // The void: stars everywhere, a galaxy turning far off, cubes of light adrift.
  for (let i = 0; i < 160; i += 1) {
    const s = c.rnd() < 0.5 ? -1 : 1;
    c.b.add(new SphereGeometry(0.15 + c.rnd() * 0.3, 4, 3), c.rnd() < 0.2 ? p.accent : 0xffffff, 'glow', { x: s * (HW + 4 + c.rnd() * 120), y: -10 + c.rnd() * 80, z: c.z0 + c.rnd() * c.len });
  }
  for (let i = 0; i < 16; i += 1) c.b.box(2 + c.rnd() * 3, 2 + c.rnd() * 3, 2 + c.rnd() * 3, v === 'purple' ? 0x8a3aff : 0x2a3a8a, 'glow', { x: (c.rnd() < 0.5 ? -1 : 1) * (HW + 10 + c.rnd() * 40), y: 4 + c.rnd() * 20, z: c.z0 + c.rnd() * c.len, rx: c.rnd() * 3, ry: c.rnd() * 3 });
  for (let z = c.z0 + 30; z < c.z1; z += 60) {
    const color = v === 'purple' ? 0xff5aff : 0x8ae8ff;
    for (let k = 0; k < 3; k += 1) c.b.add(new TorusGeometry(24 + k * 8, 0.6, 6, 60), k % 2 ? 0xffffff : color, 'glow', { x: HW + 60, y: 30, z, rx: 1.2 + k * 0.1, ry: 0.4 });
  }
  if (v === 'purple') for (let i = 0; i < 20; i += 1) crystal(c.b, (c.rnd() < 0.5 ? -1 : 1) * (HW + 4 + c.rnd() * 30), c.z0 + c.rnd() * c.len, 4 + c.rnd() * 8, 0xb83aff, (c.rnd() - 0.5) * 0.6);
};

const BUILDERS: Readonly<Record<StageDef['theme'], (c: ZoneContext) => void>> = {
  dojo,
  street,
  school,
  tunnel,
  interior,
  forest,
  cemetery,
  industrial,
  rooftop,
  ruins,
  volcano,
  flooded,
  shadow,
  shrine,
  domain,
  void: voidZone,
};

/** Dress one stage. */
export const buildZone = (def: StageDef, b: PartBuilder, extras: Group): void => {
  const z0 = def.startZ;
  const z1 = def.endZ;
  const context: ZoneContext = { def, b, extras, rnd: seeded(def.index * 977 + 13), z0, z1, len: z1 - z0, zc: (z0 + z1) / 2 };
  BUILDERS[def.theme](context);
};

export { PAPER, PLASTER };
