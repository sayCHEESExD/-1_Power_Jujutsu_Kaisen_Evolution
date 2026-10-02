import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { PartBuilder, PartKind } from '../render/PartBuilder.js';

/**
 * THE JUJUTSU PROP KIT: every piece of scenery in the hall and the fifty
 * stages is one of these, merged into its area's few batched meshes - torii,
 * shrines, stone and paper lanterns, talismans, Tokyo blocks with lit windows,
 * vending machines, trains, trees of five kinds, graves, rubble, crystals,
 * bones, cursed hands and eyes. Built from primitives on the fly: no model
 * files, so fifty stages cost code, not megabytes.
 *
 * Each takes the builder, a position on the floor and a size or colour;
 * `ry` turns a piece about its own centre where facing matters.
 */
type B = PartBuilder;

/** A deterministic random stream, so every load builds the same stage. */
export const seeded = (seed: number): (() => number) => {
  let t = (seed * 2654435761) >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

export const shade = (color: number, k: number): number => {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * k));
  const b = Math.min(255, Math.round((color & 255) * k));
  return (r << 16) | (g << 8) | b;
};

export const VERMILION = 0xe0342b;
export const VERMILION_DARK = 0xa81f1c;
export const ROOF = 0x2b3448;
export const PLASTER = 0xf4efe3;
export const WOOD = 0x8a5a33;
export const WOOD_DARK = 0x5e3b20;
export const STONE = 0xb9bcc4;
export const PAPER = 0xfff1c9;

/** Rotate a local offset (dx, dz) by `ry` about the vertical. */
const turn = (dx: number, dz: number, ry: number): [number, number] => [dx * Math.cos(ry) + dz * Math.sin(ry), -dx * Math.sin(ry) + dz * Math.cos(ry)];

// --------------------------------------------------------------- shrines

/** A torii gate across x (width between the pillars `w`), `h` tall. */
export const torii = (b: B, x: number, z: number, w: number, h: number, color = VERMILION, ry = 0): void => {
  for (const side of [-1, 1]) {
    const [dx, dz] = turn(side * w / 2, 0, ry);
    b.add(new CylinderGeometry(w * 0.045, w * 0.055, h, 10), color, 'smooth', { x: x + dx, y: h / 2, z: z + dz });
    b.add(new CylinderGeometry(w * 0.07, w * 0.07, h * 0.06, 10), 0x1a1a1a, 'smooth', { x: x + dx, y: h * 0.03, z: z + dz });
  }
  // The kasagi: a black-topped beam, its ends upturned.
  b.box(w * 1.3, h * 0.07, w * 0.12, color, 'smooth', { x, y: h * 0.93, z, ry });
  b.box(w * 1.36, h * 0.04, w * 0.14, 0x1a1a1a, 'smooth', { x, y: h * 0.985, z, ry });
  for (const side of [-1, 1]) {
    const [dx, dz] = turn(side * w * 0.66, 0, ry);
    b.box(w * 0.16, h * 0.05, w * 0.14, 0x1a1a1a, 'smooth', { x: x + dx, y: h * 1.0, z: z + dz, ry, rz: side * 0.25 });
  }
  // The nuki and its tablet.
  b.box(w * 1.12, h * 0.05, w * 0.08, color, 'smooth', { x, y: h * 0.78, z, ry });
  b.box(w * 0.08, h * 0.13, w * 0.1, color, 'smooth', { x, y: h * 0.86, z, ry });
};

/** A stone lantern, `s` tall-ish, its light box glowing. */
export const stoneLantern = (b: B, x: number, z: number, s = 1, glow = 0xffc766): void => {
  b.add(new CylinderGeometry(0.5 * s, 0.6 * s, 0.25 * s, 6), STONE, 'flat', { x, y: 0.12 * s, z });
  b.add(new CylinderGeometry(0.16 * s, 0.2 * s, 1.1 * s, 6), STONE, 'flat', { x, y: 0.8 * s, z });
  b.box(0.7 * s, 0.14 * s, 0.7 * s, STONE, 'flat', { x, y: 1.4 * s, z });
  b.box(0.48 * s, 0.5 * s, 0.48 * s, glow, 'glow', { x, y: 1.72 * s, z });
  b.add(new ConeGeometry(0.62 * s, 0.5 * s, 4), STONE, 'flat', { x, y: 2.2 * s, z, ry: Math.PI / 4 });
  b.add(new SphereGeometry(0.1 * s, 6, 4), STONE, 'flat', { x, y: 2.5 * s, z });
};

/** A hanging paper lantern. */
export const paperLantern = (b: B, x: number, y: number, z: number, color = 0xffc766, s = 1): void => {
  b.add(new SphereGeometry(0.42 * s, 10, 8), color, 'glow', { x, y, z, sy: 1.25 });
  b.add(new CylinderGeometry(0.22 * s, 0.22 * s, 0.1 * s, 8), 0x1a1a1a, 'smooth', { x, y: y + 0.52 * s, z });
  b.add(new CylinderGeometry(0.22 * s, 0.22 * s, 0.1 * s, 8), 0x1a1a1a, 'smooth', { x, y: y - 0.52 * s, z });
};

/** A paper talisman: a white strip with a red seal stripe. */
export const talisman = (b: B, x: number, y: number, z: number, ry = 0, s = 1, glow = false): void => {
  b.box(0.3 * s, 0.9 * s, 0.02, PAPER, glow ? 'glow' : 'smooth', { x, y, z, ry });
  const [dx, dz] = turn(0, 0.012, ry);
  b.box(0.08 * s, 0.7 * s, 0.02, 0xc8101c, 'glow', { x: x + dx, y, z: z + dz, ry });
};

/** A shrine hall: a raised floor, posts, plaster walls and a sweeping two-tier roof. */
export const shrineHall = (b: B, x: number, z: number, w: number, d: number, h: number, ry = 0, roof = ROOF, pillar = VERMILION): void => {
  b.box(w + 1, 0.8, d + 1, STONE, 'stud', { x, y: 0.4, z, ry });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [dx, dz] = turn(sx * w / 2, sz * d / 2, ry);
      b.box(0.5, h, 0.5, pillar, 'smooth', { x: x + dx, y: 0.8 + h / 2, z: z + dz, ry });
    }
  }
  b.box(w * 0.94, h * 0.8, d * 0.94, PLASTER, 'smooth', { x, y: 0.8 + h * 0.42, z, ry });
  b.box(w + 0.6, 0.3, d + 0.6, WOOD_DARK, 'smooth', { x, y: 0.8 + h, z, ry });
  for (const tier of [0, 1]) {
    const tw = w * (1.45 - tier * 0.35);
    const td = d * (1.45 - tier * 0.35);
    const ty = 0.8 + h + 0.2 + tier * h * 0.45;
    b.add(new ConeGeometry(Math.hypot(tw, td) * 0.55, h * 0.5, 4), roof, 'flat', { x, y: ty + h * 0.2, z, ry: ry + Math.PI / 4, sz: td / tw });
  }
  b.box(w * 0.6, 0.18, 0.18, 0xf2c14e, 'smooth', { x, y: 0.8 + h * 1.95, z, ry });
};

/** A five-storey pagoda. */
export const pagoda = (b: B, x: number, z: number, s = 1, roof = ROOF, wall = VERMILION): void => {
  for (let i = 0; i < 5; i += 1) {
    const w = (4 - i * 0.55) * s;
    const y = i * 2.4 * s;
    b.box(w * 0.75, 1.6 * s, w * 0.75, wall, 'smooth', { x, y: y + 0.8 * s, z });
    b.add(new ConeGeometry(w * 0.95, 1.0 * s, 4), roof, 'flat', { x, y: y + 2.0 * s, z, ry: Math.PI / 4 });
  }
  b.add(new CylinderGeometry(0.08 * s, 0.08 * s, 3 * s, 6), 0xf2c14e, 'smooth', { x, y: 12.5 * s, z });
};

// --------------------------------------------------------------- the city

/**
 * A city block: a box of a building with rows of windows on the face toward
 * the lane (`face` +1: toward +x, -1: toward -x), lit or dark, a roof rim and
 * now and then a sign.
 */
export const building = (
  b: B,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  color: number,
  face: number,
  windowColor = 0xfff2a8,
  lit = 0.55,
  rnd: () => number = Math.random,
  kind: PartKind = 'stud',
): void => {
  b.box(w, h, d, color, kind, { x, y: h / 2, z });
  b.box(w + 0.4, 0.5, d + 0.4, shade(color, 0.7), 'smooth', { x, y: h + 0.25, z });
  const fx = x + face * (w / 2 + 0.02);
  const rows = Math.max(1, Math.floor((h - 2) / 2.6));
  const cols = Math.max(1, Math.floor(d / 2.6));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const on = rnd() < lit;
      const wz = z - d / 2 + (c + 0.5) * (d / cols);
      b.box(0.06, 1.3, 1.4, on ? windowColor : shade(color, 0.45), on ? 'glow' : 'smooth', { x: fx, y: 2.2 + r * 2.6, z: wz });
    }
  }
  if (rnd() < 0.35) {
    b.box(0.2, 2.2, d * 0.5, rnd() < 0.5 ? 0xff4a8a : 0x3ad8ff, 'glow', { x: fx + face * 0.12, y: Math.min(h - 2, 5 + rnd() * 6), z });
  }
};

/** A street lamp, its head over the lane side (`face` the way it leans). */
export const streetLamp = (b: B, x: number, z: number, h = 6, face = 1, glow = 0xfff2c8): void => {
  b.add(new CylinderGeometry(0.1, 0.14, h, 6), 0x3a3e48, 'smooth', { x, y: h / 2, z });
  b.box(1.4, 0.14, 0.2, 0x3a3e48, 'smooth', { x: x + face * 0.6, y: h, z });
  b.box(0.6, 0.18, 0.4, glow, 'glow', { x: x + face * 1.2, y: h - 0.12, z });
};

/** A drinks vending machine, lit from within. */
export const vendingMachine = (b: B, x: number, z: number, ry = 0, color = 0xe8303a): void => {
  b.box(1.4, 2.6, 1.1, color, 'smooth', { x, y: 1.3, z, ry });
  const [dx, dz] = turn(0, 0.56, ry);
  b.box(1.1, 1.3, 0.04, 0xe8f4ff, 'glow', { x: x + dx, y: 1.75, z: z + dz, ry });
  b.box(1.0, 0.3, 0.04, 0x1a1a22, 'smooth', { x: x + dx, y: 0.5, z: z + dz, ry });
};

/** A car, nose along `ry`. */
export const car = (b: B, x: number, z: number, color: number, ry = 0, wrecked = false): void => {
  b.box(1.9, 0.8, 4.2, color, 'smooth', { x, y: 0.7, z, ry, rz: wrecked ? 0.25 : 0 });
  b.box(1.7, 0.7, 2.2, shade(color, 0.85), 'smooth', { x, y: 1.4, z, ry, rz: wrecked ? 0.25 : 0 });
  b.box(1.72, 0.5, 2.0, 0x2a3a4a, 'smooth', { x, y: 1.42, z, ry, rz: wrecked ? 0.25 : 0 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [dx, dz] = turn(sx * 0.95, sz * 1.35, ry);
      b.add(new CylinderGeometry(0.38, 0.38, 0.3, 10), 0x16161c, 'smooth', { x: x + dx, y: 0.38, z: z + dz, rz: Math.PI / 2, ry });
    }
  }
};

/** A train car along z. */
export const trainCar = (b: B, x: number, z: number, len: number, color = 0xd8dce4, stripe = 0x3ad84a): void => {
  b.box(3, 3.4, len, color, 'smooth', { x, y: 2.1, z });
  b.box(3.04, 0.4, len, stripe, 'smooth', { x, y: 1.6, z });
  for (let i = 0; i < Math.floor(len / 2.6); i += 1) {
    for (const side of [-1, 1]) b.box(0.04, 1.1, 1.6, 0xbfe8ff, 'glow', { x: x + side * 1.52, y: 2.8, z: z - len / 2 + 1.4 + i * 2.6 });
  }
  b.box(3.1, 0.2, len + 0.1, shade(color, 0.7), 'smooth', { x, y: 3.9, z });
};

/** Rails along z, from z0 to z1. */
export const rails = (b: B, x: number, z0: number, z1: number): void => {
  const len = z1 - z0;
  for (const side of [-0.75, 0.75]) b.box(0.14, 0.18, len, 0x8a8e98, 'smooth', { x: x + side, y: 0.1, z: (z0 + z1) / 2 });
  for (let z = z0; z < z1; z += 1.2) b.box(2.2, 0.08, 0.36, 0x5a3a24, 'smooth', { x, y: 0.03, z });
};

/** A shipping container. */
export const container = (b: B, x: number, z: number, color: number, ry = 0, y = 0): void => {
  b.box(2.6, 2.6, 6, color, 'smooth', { x, y: y + 1.3, z, ry });
  for (let i = -2; i <= 2; i += 1) {
    const [dx, dz] = turn(1.32, i * 1.1, ry);
    b.box(0.06, 2.4, 0.18, shade(color, 0.75), 'smooth', { x: x + dx, y: y + 1.3, z: z + dz, ry });
  }
};

/** A smokestack. */
export const smokestack = (b: B, x: number, z: number, h: number): void => {
  b.add(new CylinderGeometry(1.2, 1.6, h, 12), 0x8a6a5a, 'stud', { x, y: h / 2, z });
  b.add(new CylinderGeometry(1.25, 1.25, 0.6, 12), 0xd8d8d8, 'smooth', { x, y: h * 0.82, z });
  for (let i = 0; i < 3; i += 1) b.add(new SphereGeometry(1.4 + i * 0.5, 8, 6), 0x9a9aa0, 'flat', { x: x + i * 0.6, y: h + 1 + i * 1.4, z });
};

// --------------------------------------------------------------- nature

/** A round-crowned tree. */
export const tree = (b: B, x: number, z: number, h: number, leaf = 0x3fae4a, trunk = 0x7a4a2a): void => {
  b.add(new CylinderGeometry(0.25 * h * 0.12, 0.35 * h * 0.12, h * 0.5, 7), trunk, 'flat', { x, y: h * 0.25, z });
  b.add(new IcosahedronGeometry(h * 0.3, 0), leaf, 'flat', { x, y: h * 0.62, z });
  b.add(new IcosahedronGeometry(h * 0.22, 0), shade(leaf, 1.15), 'flat', { x: x + h * 0.12, y: h * 0.8, z: z - h * 0.06 });
};

/** A pine: stacked cones. */
export const pine = (b: B, x: number, z: number, h: number, leaf = 0x2f9e4f): void => {
  b.add(new CylinderGeometry(0.2, 0.3, h * 0.3, 6), 0x6a4024, 'flat', { x, y: h * 0.15, z });
  for (let i = 0; i < 3; i += 1) b.add(new ConeGeometry(h * (0.3 - i * 0.07), h * 0.38, 7), i % 2 ? shade(leaf, 1.12) : leaf, 'flat', { x, y: h * (0.4 + i * 0.2), z });
};

/** A dead, twisted tree. */
export const deadTree = (b: B, x: number, z: number, h: number, color = 0x3a2a24, rnd: () => number = Math.random): void => {
  b.add(new CylinderGeometry(0.18, 0.4, h * 0.7, 6), color, 'flat', { x, y: h * 0.35, z, rz: (rnd() - 0.5) * 0.2 });
  for (let i = 0; i < 4; i += 1) {
    const a = rnd() * Math.PI * 2;
    b.add(new CylinderGeometry(0.05, 0.14, h * 0.4, 5), color, 'flat', { x: x + Math.cos(a) * h * 0.12, y: h * (0.55 + i * 0.08), z: z + Math.sin(a) * h * 0.12, rz: Math.cos(a) * 0.9, rx: Math.sin(a) * 0.9 });
  }
};

/** A cluster of bamboo stalks. */
export const bamboo = (b: B, x: number, z: number, h: number, rnd: () => number = Math.random, color = 0x7ccf45): void => {
  for (let i = 0; i < 4; i += 1) {
    const px = x + (rnd() - 0.5) * 1.6;
    const pz = z + (rnd() - 0.5) * 1.6;
    const ph = h * (0.8 + rnd() * 0.3);
    b.add(new CylinderGeometry(0.14, 0.16, ph, 6), i % 2 ? color : shade(color, 0.85), 'smooth', { x: px, y: ph / 2, z: pz, rz: (rnd() - 0.5) * 0.08 });
    for (let k = 1; k < 5; k += 1) b.add(new CylinderGeometry(0.17, 0.17, 0.08, 6), shade(color, 0.7), 'smooth', { x: px, y: (ph * k) / 5, z: pz });
    b.add(new ConeGeometry(0.6, 1.2, 4), shade(color, 1.15), 'flat', { x: px, y: ph + 0.3, z: pz, rx: 0.4 });
  }
};

/** A rock. */
export const rock = (b: B, x: number, z: number, s: number, color = 0x8a8a90, y = 0): void => {
  b.add(new DodecahedronGeometry(s, 0), color, 'flat', { x, y: y + s * 0.6, z, sy: 0.75, ry: x * 0.3 + z * 0.7 });
};

/** A crystal spike, glowing. */
export const crystal = (b: B, x: number, z: number, h: number, color: number, tilt = 0): void => {
  b.add(new OctahedronGeometry(h * 0.3, 0), color, 'glow', { x, y: h * 0.45, z, sy: 1.9, rz: tilt });
};

// ------------------------------------------------------------- the macabre

/** A gravestone with a little offering bowl. */
export const grave = (b: B, x: number, z: number, ry = 0, color = 0x9a9aa2): void => {
  b.box(1.4, 0.3, 1.2, shade(color, 0.85), 'flat', { x, y: 0.15, z, ry });
  b.box(0.9, 1.9, 0.4, color, 'flat', { x, y: 1.25, z, ry });
  b.box(0.95, 0.18, 0.45, shade(color, 1.1), 'flat', { x, y: 2.25, z, ry });
  const [dx, dz] = turn(0, 0.5, ry);
  b.add(new CylinderGeometry(0.16, 0.1, 0.16, 8), 0x5a5a62, 'smooth', { x: x + dx, y: 0.38, z: z + dz });
};

/** A wooden sotoba marker. */
export const sotoba = (b: B, x: number, z: number, h = 2.4): void => {
  b.box(0.2, h, 0.06, 0xc8b08a, 'smooth', { x, y: h / 2, z, rz: 0.06 });
};

/** Rubble: a heap of tilted slabs and blocks. */
export const rubble = (b: B, x: number, z: number, s: number, color: number, rnd: () => number = Math.random): void => {
  for (let i = 0; i < 6; i += 1) {
    b.box(s * (0.4 + rnd() * 0.6), s * (0.2 + rnd() * 0.35), s * (0.4 + rnd() * 0.6), shade(color, 0.8 + rnd() * 0.35), 'flat', {
      x: x + (rnd() - 0.5) * s,
      y: s * 0.15 + rnd() * s * 0.3,
      z: z + (rnd() - 0.5) * s,
      rx: (rnd() - 0.5) * 0.8,
      ry: rnd() * 3,
      rz: (rnd() - 0.5) * 0.8,
    });
  }
};

/** A broken building: a shell with a jagged top, girders poking out. */
export const ruin = (b: B, x: number, z: number, w: number, d: number, h: number, color: number, rnd: () => number = Math.random): void => {
  const slices = 5;
  for (let i = 0; i < slices; i += 1) {
    const sh = h * (0.45 + rnd() * 0.55);
    b.box(w / slices, sh, d, shade(color, 0.85 + rnd() * 0.25), 'stud', { x: x - w / 2 + (i + 0.5) * (w / slices), y: sh / 2, z });
  }
  for (let i = 0; i < 3; i += 1) b.box(0.25, 0.25, d * 0.6, 0x5a4a44, 'smooth', { x: x + (rnd() - 0.5) * w, y: h * (0.5 + rnd() * 0.4), z, rx: (rnd() - 0.5) * 0.6 });
};

/** Bones: a skull on a pile of long bones. */
export const bonePile = (b: B, x: number, z: number, s: number, rnd: () => number = Math.random, color = 0xe8e0c8): void => {
  for (let i = 0; i < 5; i += 1) b.add(new CylinderGeometry(0.12 * s, 0.12 * s, 1.6 * s, 6), color, 'smooth', { x: x + (rnd() - 0.5) * s, y: 0.2 * s + i * 0.08 * s, z: z + (rnd() - 0.5) * s, rz: Math.PI / 2, ry: rnd() * 3 });
  b.add(new SphereGeometry(0.42 * s, 8, 6), color, 'smooth', { x, y: 0.7 * s, z });
  for (const side of [-1, 1]) b.add(new SphereGeometry(0.1 * s, 6, 4), 0x1a0a0a, 'smooth', { x: x + side * 0.15 * s, y: 0.75 * s, z: z + 0.36 * s });
};

/** A giant cursed hand rising from the ground, `s` scales it (Mahito's domain). */
export const giantHand = (b: B, x: number, z: number, s: number, color: number, ry = 0): void => {
  b.box(1.6 * s, 2.8 * s, 0.6 * s, color, 'smooth', { x, y: 1.4 * s, z, ry });
  for (let i = 0; i < 4; i += 1) {
    const [dx, dz] = turn((i - 1.5) * 0.4 * s, 0, ry);
    b.box(0.3 * s, (1.4 + (i === 1 || i === 2 ? 0.4 : 0)) * s, 0.4 * s, color, 'smooth', { x: x + dx, y: (3.3 + (i === 1 || i === 2 ? 0.2 : 0)) * s, z: z + dz, ry });
  }
  const [tx, tz] = turn(-1.0 * s, 0, ry);
  b.box(0.36 * s, 1.1 * s, 0.4 * s, color, 'smooth', { x: x + tx, y: 2.3 * s, z: z + tz, ry, rz: 0.6 });
  // The stitch across the palm.
  b.box(1.2 * s, 0.08 * s, 0.02, 0x2a2a3a, 'smooth', { x, y: 1.6 * s, z: z + 0.32 * s, ry });
};

/** An eye: a white ball with a glowing iris, looking along +z (turned by `ry`). */
export const eye = (b: B, x: number, y: number, z: number, s: number, iris = 0xffd23a, ry = 0): void => {
  b.add(new SphereGeometry(s, 12, 10), 0xf4f0e8, 'smooth', { x, y, z });
  const [dx, dz] = turn(0, s * 0.82, ry);
  b.add(new SphereGeometry(s * 0.42, 10, 8), iris, 'glow', { x: x + dx, y, z: z + dz });
  const [px, pz] = turn(0, s * 1.05, ry);
  b.add(new SphereGeometry(s * 0.18, 8, 6), 0x0a0a0a, 'smooth', { x: x + px, y, z: z + pz });
};

/** A tongue of flame: stacked glowing cones. */
export const flame = (b: B, x: number, y: number, z: number, s: number, color = 0xff6a1c, core = 0xffd23a): void => {
  b.add(new ConeGeometry(0.5 * s, 1.6 * s, 6), color, 'glow', { x, y: y + 0.8 * s, z });
  b.add(new ConeGeometry(0.28 * s, 1.0 * s, 6), core, 'glow', { x, y: y + 0.55 * s, z });
};

/** A brazier: a bowl on legs with a flame. */
export const brazier = (b: B, x: number, z: number, color = 0x9a5aff, s = 1): void => {
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    b.box(0.12 * s, 1.4 * s, 0.12 * s, 0x2a2a30, 'smooth', { x: x + Math.cos(a) * 0.4 * s, y: 0.7 * s, z: z + Math.sin(a) * 0.4 * s, rz: Math.cos(a) * 0.2, rx: -Math.sin(a) * 0.2 });
  }
  b.add(new CylinderGeometry(0.7 * s, 0.4 * s, 0.4 * s, 10), 0x3a3a42, 'smooth', { x, y: 1.5 * s, z });
  flame(b, x, 1.6 * s, z, 0.9 * s, color, 0xffffff);
};

/** A ring torus lying flat (glow), e.g. a seal on the ground. */
export const groundRing = (b: B, x: number, z: number, r: number, color: number, thickness = 0.12): void => {
  b.add(new TorusGeometry(r, thickness, 4, 48), color, 'glow', { x, y: 0.05, z, rx: Math.PI / 2 });
};

// ------------------------------------------------------------- interiors

/** A school desk and chair. */
export const desk = (b: B, x: number, z: number, ry = 0, tipped = false): void => {
  const rz = tipped ? 1.2 : 0;
  b.box(1.4, 0.1, 1.0, 0xc8a070, 'smooth', { x, y: 1.2, z, ry, rz });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [dx, dz] = turn(sx * 0.6, sz * 0.4, ry);
    b.box(0.08, 1.2, 0.08, 0x5a5e68, 'smooth', { x: x + dx, y: 0.6, z: z + dz, ry, rz });
  }
};

/** A hospital bed. */
export const bed = (b: B, x: number, z: number, ry = 0): void => {
  b.box(1.4, 0.6, 2.8, 0xd8dce0, 'smooth', { x, y: 0.9, z, ry });
  b.box(1.3, 0.25, 2.6, 0xf4f4f8, 'smooth', { x, y: 1.3, z, ry });
  const [dx, dz] = turn(0, 1.3, ry);
  b.box(1.4, 1.2, 0.1, 0x8a9aa8, 'smooth', { x: x + dx, y: 1.5, z: z + dz, ry });
};

/** Prison bars across a gap along z. */
export const bars = (b: B, x: number, z0: number, z1: number, h: number, color = 0x5a5e68): void => {
  for (let z = z0; z <= z1; z += 0.5) b.add(new CylinderGeometry(0.05, 0.05, h, 6), color, 'smooth', { x, y: h / 2, z });
  b.box(0.15, 0.15, z1 - z0, color, 'smooth', { x, y: h, z: (z0 + z1) / 2 });
};

/** A tall pillar with a capital. */
export const pillar = (b: B, x: number, z: number, h: number, color: number, cap = color): void => {
  b.box(1.4, h, 1.4, color, 'stud', { x, y: h / 2, z });
  b.box(1.8, 0.5, 1.8, cap, 'smooth', { x, y: h - 0.25, z });
  b.box(1.8, 0.5, 1.8, cap, 'smooth', { x, y: 0.25, z });
};

/** A fence of posts and two rails along z. */
export const fence = (b: B, x: number, z0: number, z1: number, h: number, color: number): void => {
  for (let z = z0; z <= z1; z += 2) b.box(0.2, h, 0.2, color, 'smooth', { x, y: h / 2, z });
  for (const y of [h * 0.4, h * 0.85]) b.box(0.12, 0.14, z1 - z0, color, 'smooth', { x, y, z: (z0 + z1) / 2 });
};

/** A low stone wall along z. */
export const stoneWall = (b: B, x: number, z0: number, z1: number, h: number, color: number): void => {
  for (let z = z0; z < z1; z += 2.2) b.box(1, h * (0.9 + ((z * 7) % 3) * 0.05), 2.1, shade(color, 0.9 + ((z * 13) % 5) * 0.04), 'flat', { x, y: h / 2, z: z + 1.05 });
};

/** A big floating ring (a domain's halo, Mahoraga's wheel). */
export const wheel = (b: B, x: number, y: number, z: number, r: number, color: number, spokes = 8): void => {
  b.add(new TorusGeometry(r, r * 0.06, 6, 40), color, 'glow', { x, y, z });
  for (let i = 0; i < spokes; i += 1) {
    const a = (i / spokes) * Math.PI * 2;
    b.box(0.2, r, 0.2, color, 'smooth', { x: x + Math.sin(a) * r * 0.5, y: y + Math.cos(a) * r * 0.5, z, rz: -a });
    b.add(new SphereGeometry(r * 0.12, 8, 6), color, 'glow', { x: x + Math.sin(a) * r * 1.12, y: y + Math.cos(a) * r * 1.12, z });
  }
};

/** A shrine of skulls and ribs: Sukuna's domain in miniature. */
export const skullShrine = (b: B, x: number, z: number, s: number, rnd: () => number = Math.random): void => {
  shrineHall(b, x, z, 6 * s, 4 * s, 3.4 * s, 0, 0x2a0a0a, 0x6a0a10);
  for (let i = 0; i < 6; i += 1) bonePile(b, x + (rnd() - 0.5) * 9 * s, z + (rnd() - 0.5) * 7 * s, 0.8 + rnd() * 0.5, rnd);
  // Mouths along the eaves, open.
  for (const side of [-1, 1]) {
    b.box(1.6 * s, 0.7 * s, 0.3 * s, 0x5a0a10, 'smooth', { x: x + side * 1.6 * s, y: 4.6 * s, z: z + 2.3 * s });
    for (let t = 0; t < 4; t += 1) b.add(new ConeGeometry(0.1 * s, 0.3 * s, 4), 0xf4f0e8, 'smooth', { x: x + side * 1.6 * s + (t - 1.5) * 0.35 * s, y: 4.85 * s, z: z + 2.45 * s, rx: Math.PI });
  }
};

/** A billboard screen on a pole, glowing. */
export const bigScreen = (b: B, x: number, z: number, h: number, w: number, color: number, face: number): void => {
  b.box(0.5, h, 0.5, 0x3a3e48, 'smooth', { x, y: h / 2, z });
  b.box(0.4, w * 0.56, w, 0x1a1a22, 'smooth', { x, y: h + w * 0.28, z });
  b.box(0.1, w * 0.48, w * 0.92, color, 'glow', { x: x + face * 0.22, y: h + w * 0.28, z });
};

/** A cube of eyes on its side: the Prison Realm. */
export const eyeCube = (b: B, x: number, y: number, z: number, s: number): void => {
  b.box(s, s, s, 0x3a2430, 'smooth', { x, y, z, rx: 0.3, ry: 0.6 });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    b.add(new SphereGeometry(s * 0.12, 8, 6), 0xfff2c8, 'glow', { x: x + Math.cos(a) * s * 0.36, y: y + Math.sin(a) * s * 0.36, z: z + s * 0.52 });
  }
};
