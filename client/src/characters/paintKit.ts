import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three';
import type { PartBuilder, PartKind } from '../render/PartBuilder.js';
import type { PaintPoint } from '../suits/SuitPainter.js';

/**
 * THE ANIME PAINT KIT: every character, companion, shopkeeper and enemy is
 * the supplied blocky body with its atlas repainted texel by texel
 * (`SuitPainter`) plus a handful of merged primitives on its bones. These are
 * the shared strokes - an anime face with big highlighted eyes, a hairline,
 * hair spikes, capes, katanas - so a new fighter costs a few lines and no
 * download.
 *
 * Painters answer "what colour is the body HERE" for a point given as part,
 * face and (u, v) across that face as its viewer sees it. Accessories are
 * authored in CHARACTER space (x = the wearer's left, y up, z forward)
 * around their mount, sized by the measured body (`AccessoryContext`).
 */
export interface AccessoryContext {
  /** Head box height; torso width / depth / height; arm box width. */
  readonly head: number;
  readonly torsoW: number;
  readonly torsoD: number;
  readonly torsoH: number;
  readonly limb: number;
}

export type AccessoryMaker = (b: PartBuilder, c: AccessoryContext) => void;

// ------------------------------------------------------------------ geometry of a point

export const frac = (x: number): number => x - Math.floor(x);
export const within = (value: number, min: number, max: number): boolean => value >= min && value <= max;
export const rect = (p: PaintPoint, u0: number, u1: number, v0: number, v1: number): boolean => within(p.u, u0, u1) && within(p.v, v0, v1);
export const ellipse = (p: PaintPoint, cu: number, cv: number, ru: number, rv: number): boolean => ((p.u - cu) / ru) ** 2 + ((p.v - cv) / rv) ** 2 <= 1;
export const isFront = (p: PaintPoint): boolean => p.face === 'front';
export const isBack = (p: PaintPoint): boolean => p.face === 'back';
export const isSide = (p: PaintPoint): boolean => p.face === 'left' || p.face === 'right';
export const isTop = (p: PaintPoint): boolean => p.face === 'top';
export const isArm = (p: PaintPoint): boolean => p.part === 'armL' || p.part === 'armR';
export const isLeg = (p: PaintPoint): boolean => p.part === 'legL' || p.part === 'legR';
export const checker = (p: PaintPoint, n: number): boolean => (Math.floor(p.u * n) + Math.floor(p.v * n)) % 2 === 0;
/** Hands are skin at the bottom of the arms. */
export const isHand = (p: PaintPoint): boolean => isArm(p) && p.ny < 0.16;
/** Distance from a point to a segment. */
export const seg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
};

export const mix = (a: number, b: number, t: number): number => {
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k);
  const g = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k);
  const bl = Math.round((a & 255) * (1 - k) + (b & 255) * k);
  return (r << 16) | (g << 8) | bl;
};

export const SKIN = 0xf6cfa8;
export const SKIN_TAN = 0xe0ab80;
export const SKIN_DARK = 0xb07a50;
export const SKIN_PALE = 0xf4e2d4;
export const INK = 0x16121a;

// ------------------------------------------------------------------ faces

export interface FaceStyle {
  readonly skin: number;
  readonly iris: number;
  /** Eye height on the face. */
  readonly eyeV?: number;
  /** Narrow, bored dot eyes (Saitama). */
  readonly dots?: boolean;
  /** Angry, slanted brows. */
  readonly fierce?: boolean;
  /** A wide open grin. */
  readonly grin?: boolean;
  /** A tight smirk / frown instead of the small mouth. */
  readonly frown?: boolean;
  /** Narrow, sharp eyes (rivals, villains). */
  readonly sharp?: boolean;
  /** Tomoe in the iris (the Sharingan). */
  readonly tomoe?: boolean;
  /** Shadowed eye sockets with bright pupils (All Might). */
  readonly shadowed?: boolean;
  /** Brow colour (defaults to ink). */
  readonly brow?: number;
  /** Cheek blush. */
  readonly blush?: boolean;
}

/**
 * AN ANIME FACE on the front of the head: big eyes with a dark rim, an iris,
 * a pupil and a white highlight, brows, a small mouth (or a grin). Returns
 * null off the face so callers can paint hair around it.
 */
export const animeFace = (p: PaintPoint, style: FaceStyle): number | null => {
  if (!isFront(p)) return null;
  const ev = style.eyeV ?? 0.5;
  const brow = style.brow ?? INK;
  for (const cu of [0.3, 0.7]) {
    if (style.dots) {
      if (ellipse(p, cu, ev, 0.05, 0.035)) return INK;
      if (within(p.u, cu - 0.1, cu + 0.1) && within(p.v, ev + 0.12, ev + 0.145)) return brow;
      continue;
    }
    if (style.shadowed) {
      if (ellipse(p, cu, ev, 0.13, 0.11)) return ellipse(p, cu, ev, 0.035, 0.04) ? 0x9ae8ff : 0x1a2a4a;
      if (within(p.u, cu - 0.14, cu + 0.14) && within(p.v, ev + 0.13, ev + 0.17)) return brow;
      continue;
    }
    const rv = style.sharp ? 0.085 : 0.14;
    // Sharp eyes slant up toward the temples.
    const slant = style.sharp ? (cu < 0.5 ? (cu - p.u) * 0.35 : (p.u - cu) * 0.35) : 0;
    const vv = ev + slant;
    if (((p.u - cu) / 0.125) ** 2 + ((p.v - vv) / rv) ** 2 <= 1) {
      const inner = ((p.u - cu) / 0.1) ** 2 + ((p.v - vv + 0.01) / (rv * 0.82)) ** 2 <= 1;
      if (!inner) return INK;
      if (ellipse(p, cu + 0.035, vv + rv * 0.35, 0.03, 0.03)) return 0xffffff;
      if (style.tomoe) {
        const du = p.u - cu;
        const dv = p.v - vv;
        const r = Math.hypot(du, dv);
        if (r < 0.022) return INK;
        for (let k = 0; k < 3; k += 1) {
          const a = (k / 3) * Math.PI * 2 + 0.4;
          if (Math.hypot(du - Math.cos(a) * 0.05, dv - Math.sin(a) * 0.05) < 0.018) return INK;
        }
        if (r < 0.085) return 0xd01a24;
        return 0xffffff;
      }
      if (ellipse(p, cu, vv - 0.02, 0.05, rv * 0.45)) return 0x0c0a10;
      if (ellipse(p, cu, vv - 0.02, 0.085, rv * 0.72)) return style.iris;
      return 0xffffff;
    }
    // Brows.
    const tilt = style.fierce ? (cu < 0.5 ? (p.u - cu) * 0.55 : (cu - p.u) * 0.55) : 0;
    if (within(p.u, cu - 0.13, cu + 0.13) && within(p.v, ev + 0.19 + tilt, ev + 0.235 + tilt)) return brow;
  }
  if (style.blush) {
    for (const cu of [0.2, 0.8]) if (ellipse(p, cu, 0.33, 0.07, 0.035)) return mix(style.skin, 0xff6a8a, 0.45);
  }
  if (style.grin) {
    if (ellipse(p, 0.5, 0.22, 0.17, 0.075) && p.v < 0.245) return within(p.v, 0.18, 0.245) ? 0xffffff : 0x8a2020;
  } else if (style.frown) {
    if (rect(p, 0.4, 0.6, 0.21, 0.235)) return 0x6a2a2a;
  } else if (rect(p, 0.43, 0.57, 0.22, 0.25)) {
    return 0x9a4a3a;
  }
  return style.skin;
};

/**
 * A head: hair on the top, back and upper sides and a fringe on the front,
 * the face below it.
 */
export const hairHead = (p: PaintPoint, hair: number, face: FaceStyle, fringe = 0.8, sideline = 0.45): number => {
  if (isTop(p)) return hair;
  if (isBack(p)) return p.v > 0.18 ? hair : face.skin;
  if (isSide(p)) return p.v > sideline ? hair : face.skin;
  if (p.v > fringe) return hair;
  return animeFace(p, face) ?? face.skin;
};

// ------------------------------------------------------------------ hair and gear

/** A hair cap over the top and back of the head. */
export const cap = (b: PartBuilder, c: AccessoryContext, color: number, back = 0.7, kind: PartKind = 'smooth'): void => {
  const h = c.head;
  b.add(new BoxGeometry(h * 1.12, h * 0.3, h * 1.12), color, kind, { y: h * 0.47 });
  b.add(new BoxGeometry(h * 1.12, h * back, h * 0.2), color, kind, { y: h * (0.62 - back / 2), z: -h * 0.5 });
};

/** One spike of hair: a four-sided cone from (x, y, z) in head units, tipped by rx (toward +z) and rz (toward -x). */
export const spike = (
  b: PartBuilder,
  c: AccessoryContext,
  color: number,
  x: number,
  y: number,
  z: number,
  length: number,
  radius: number,
  rx: number,
  rz: number,
  kind: PartKind = 'smooth',
): void => {
  const h = c.head;
  const half = h * length * 0.5;
  b.add(new ConeGeometry(h * radius, h * length, 4), color, kind, {
    x: h * x - Math.sin(rz) * half,
    y: h * y + Math.cos(rz) * Math.cos(rx) * half,
    z: h * z + Math.cos(rz) * Math.sin(rx) * half,
    rx,
    rz,
  });
};

/** A crown of spikes around the head. Front spikes lie flatter (a fringe); back ones stand up. */
export const spikyCrown = (b: PartBuilder, c: AccessoryContext, color: number, length: number, count: number, lift = 0.5, spread = 0.9, kind: PartKind = 'smooth'): void => {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    const front = cz > 0.3;
    spike(b, c, color, sx * 0.42, lift, cz * 0.42, front ? length * 0.6 : length, 0.2, cz * spread * (front ? 1.2 : 1), -sx * spread, kind);
  }
};

/** Upswept hair: spikes rising from the crown, fanned left-right (Super Saiyan, Vegeta). */
export const flameHair = (b: PartBuilder, c: AccessoryContext, color: number, length: number, count: number, fan = 0.55, kind: PartKind = 'smooth'): void => {
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const back = i % 2 === 0 ? -0.12 : 0.1;
    spike(b, c, color, t * 0.7, 0.45, back, length * (1 - Math.abs(t) * 0.5), 0.24, -0.15 + back * 0.6, -t * fan * 2, kind);
  }
};

/** A cape from the shoulders. */
export const cape = (b: PartBuilder, c: AccessoryContext, color: number, length = 1.9, lining?: number): void => {
  const h = c.torsoH * length;
  b.add(new BoxGeometry(c.torsoW * 1.18, h, 0.08), color, 'smooth', { y: -h / 2 + 0.1, z: -0.08, rx: 0.12 });
  if (lining !== undefined) b.add(new BoxGeometry(c.torsoW * 1.12, h * 0.96, 0.02), lining, 'smooth', { y: -h / 2 + 0.1, z: -0.03, rx: 0.12 });
  b.add(new BoxGeometry(c.torsoW * 1.22, 0.16, 0.26), color, 'smooth', { y: 0.08, z: 0.02 });
};

/** A long coat's tails, hanging below the torso from the back mount. */
export const coatTails = (b: PartBuilder, c: AccessoryContext, color: number, length = 1.4, flare = 0.14): void => {
  const h = c.torsoH * length;
  b.add(new BoxGeometry(c.torsoW * 1.1, h, 0.08), color, 'smooth', { y: -c.torsoH * 0.95 - h / 2 + 0.3, z: -0.04, rx: flare });
  for (const side of [-1, 1]) {
    b.add(new BoxGeometry(0.08, h * 0.9, c.torsoD * 0.9), color, 'smooth', { x: side * c.torsoW * 0.56, y: -c.torsoH * 0.95 - h * 0.45 + 0.3, z: c.torsoD * 0.42, rx: flare * 0.6 });
  }
};

/** A sheathed katana slung across the back (diagonal), hilt over the shoulder. */
export const backKatana = (b: PartBuilder, c: AccessoryContext, sheath: number, hilt: number, guard = 0xd4af37, tilt = 0.9): void => {
  const len = c.torsoH * 1.9;
  b.add(new BoxGeometry(0.12, len, 0.12), sheath, 'smooth', { y: -c.torsoH * 0.35, z: -c.torsoD * 0.25, rz: tilt });
  const hx = -Math.sin(tilt) * len * 0.52;
  const hy = -c.torsoH * 0.35 + Math.cos(tilt) * len * 0.52;
  b.add(new BoxGeometry(0.1, 0.5, 0.1), hilt, 'smooth', { x: hx * 1.05, y: hy * 1.05 + 0.1, z: -c.torsoD * 0.25, rz: tilt });
  b.add(new CylinderGeometry(0.14, 0.14, 0.05, 8), guard, 'smooth', { x: hx * 0.92, y: hy * 0.92 + 0.02, z: -c.torsoD * 0.25, rz: tilt });
};

/** A katana on the hip (worn at the belt, pointing back and down). */
export const hipKatana = (b: PartBuilder, c: AccessoryContext, sheath: number, hilt: number, side = 1, drop = 0): void => {
  const x = side * c.torsoW * 0.58;
  b.add(new BoxGeometry(0.1, 0.1, c.torsoH * 1.7), sheath, 'smooth', { x, y: -0.05 - drop, z: -0.2, rx: -0.35 });
  b.add(new BoxGeometry(0.09, 0.09, 0.42), hilt, 'smooth', { x, y: 0.26 - drop, z: 0.55, rx: -0.35 });
  b.add(new CylinderGeometry(0.1, 0.1, 0.04, 8), 0xd4af37, 'smooth', { x, y: 0.2 - drop, z: 0.35, rx: Math.PI / 2 - 0.35 });
};

/** A katana held in the fist (the blade along +Y). */
export const heldKatana = (b: PartBuilder, blade = 0xe8eef6, hilt = 0x1a1a22, length = 2.1, glow = false): void => {
  b.add(new BoxGeometry(0.09, 0.42, 0.09), hilt, 'smooth', { y: 0.02 });
  b.add(new CylinderGeometry(0.12, 0.12, 0.04, 8), 0xd4af37, 'smooth', { y: 0.25 });
  b.add(new BoxGeometry(0.05, length, 0.14), blade, glow ? 'glow' : 'smooth', { y: 0.27 + length / 2, z: 0.02 });
};

/** A pair of glowing ear studs or earrings. */
export const earrings = (b: PartBuilder, c: AccessoryContext, color: number, kind: PartKind = 'glow'): void => {
  const h = c.head;
  for (const side of [-1, 1]) b.add(new SphereGeometry(h * 0.05, 6, 5), color, kind, { x: side * h * 0.58, y: -h * 0.18 });
};

/** A halo-like ring floating over the head. */
export const halo = (b: PartBuilder, c: AccessoryContext, color: number, lift = 0.86): void => {
  b.add(new TorusGeometry(c.head * 0.5, c.head * 0.04, 6, 24), color, 'glow', { y: c.head * lift, rx: Math.PI / 2 });
};

/** Round puffs of cloud-like hair (Gear 5). */
export const puffs = (b: PartBuilder, c: AccessoryContext, color: number, count: number, lift = 0.5, spread = 0.46, size = 0.22, kind: PartKind = 'smooth'): void => {
  const h = c.head;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const y = lift + (i % 3) * 0.08;
    b.add(new SphereGeometry(h * size * (1 + (i % 2) * 0.25), 8, 6), color, kind, { x: Math.sin(a) * h * spread, y: h * y, z: Math.cos(a) * h * spread - h * 0.08 });
  }
};

/** A cylinder band (a headband, a belt, a wristband). */
export const band = (b: PartBuilder, radius: number, height: number, color: number, y = 0, kind: PartKind = 'smooth'): void => {
  b.add(new CylinderGeometry(radius, radius, height, 12), color, kind, { y });
};
