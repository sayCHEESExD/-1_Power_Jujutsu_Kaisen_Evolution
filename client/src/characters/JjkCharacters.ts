import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three';
import type { PartBuilder } from '../render/PartBuilder.js';
import type { SuitPainter } from '../suits/SuitPainter.js';
import {
  INK,
  SKIN,
  SKIN_PALE,
  SKIN_TAN,
  backKatana,
  cap,
  ellipse,
  frac,
  hairHead,
  isArm,
  isBack,
  isFront,
  isHand,
  isLeg,
  isSide,
  isTop,
  mix,
  rect,
  spike,
  spikyCrown,
  within,
  type AccessoryContext,
  type AccessoryMaker,
  type FaceStyle,
} from './paintKit.js';

export type { AccessoryContext, AccessoryMaker } from './paintKit.js';

/**
 * THE SORCERERS, drawn: every character is the supplied blocky body with its
 * atlas repainted texel by texel (`SuitPainter`), an optional GLOW painter for
 * what shines (Black Flash's red lightning, Jogo's magma), and a handful of
 * merged primitives on its bones - hair, hoods, Nobara's hammer, Maki's
 * glaive, Jogo's volcano. Nothing here is an image file: each costs a few
 * lines of code and no download.
 *
 * Ids match `@jjk/shared`'s CHARACTERS (1 Yuji ... 12 Toji). The statues in
 * the hall (Gojo, Sukuna) are painted the same way, with names of their own.
 */
export type AuraStyle = 'flame' | 'lightning' | 'sparkle' | 'dark';

export interface LookDef {
  readonly paint: SuitPainter;
  /** What glows, and in what colour (0 = nothing). */
  readonly glow?: SuitPainter;
  readonly head?: AccessoryMaker;
  readonly back?: AccessoryMaker;
  readonly backLow?: AccessoryMaker;
  readonly chest?: AccessoryMaker;
  readonly belt?: AccessoryMaker;
  readonly handR?: AccessoryMaker;
  readonly handL?: AccessoryMaker;
  /** Hand makers that are HELD items, turned out of the fist. */
  readonly grip?: 'R' | 'LR';
  /** Drawn size (Todo and Panda stand taller). */
  readonly scale?: number;
  /** A character's own signature energy, flickering round them (the strongest only). */
  readonly signature?: { readonly color: number; readonly style: AuraStyle };
}

const noop = 0;

/** The Tokyo Jujutsu High uniform: a dark navy high-collared jacket with gold buttons. */
const UNIFORM = 0x1b1f33;
const UNIFORM_DARK = 0x12152a;
const GOLD = 0xe8c050;

/** The uniform's torso: high collar, the button line, and the hem. */
const uniformTorso = (p: Parameters<SuitPainter>[0], body = UNIFORM): number => {
  if (p.v > 0.86) return UNIFORM_DARK;
  if (isFront(p) && Math.abs(p.u - 0.5) < 0.016) return 0x2a3050;
  if (isFront(p) && within(p.u, 0.53, 0.58)) {
    for (const v of [0.72, 0.52, 0.32]) if (ellipse(p, 0.555, v, 0.025, 0.03)) return GOLD;
  }
  if (p.v < 0.08) return UNIFORM_DARK;
  return body;
};

// ================================================================== painters

/** YUJI ITADORI: pink spikes over a dark undercut, the marks under his eyes, the uniform with its red hood. */
const yuji: SuitPainter = (p) => {
  if (p.part === 'head') {
    if (isBack(p) || isSide(p)) {
      if (p.v > 0.62) return 0xf07aa8;
      if (p.v > 0.3) return 0x4a2632;
      return SKIN;
    }
    const c = hairHead(p, 0xf07aa8, { skin: SKIN, iris: 0x8a4a2a, grin: false }, 0.8);
    if (isFront(p) && within(p.v, 0.33, 0.36) && (within(p.u, 0.22, 0.38) || within(p.u, 0.62, 0.78))) return 0x7a1a1a;
    return c;
  }
  if (p.part === 'torso') {
    if (p.v > 0.84) return 0xd02a2a;
    return uniformTorso(p);
  }
  if (isArm(p)) return isHand(p) ? SKIN : UNIFORM;
  if (isLeg(p)) return p.ny < 0.12 ? (p.ny < 0.04 ? 0xffffff : 0xc82a2a) : UNIFORM;
  return UNIFORM;
};

/** NOBARA KUGISAKI: a copper bob, brown eyes, the uniform jacket and skirt, black tights. */
const nobara: SuitPainter = (p) => {
  const hair = 0xc8743a;
  if (p.part === 'head') {
    const face: FaceStyle = { skin: SKIN, iris: 0x7a4a1a, fierce: true, blush: false };
    if (isSide(p)) return p.v > 0.22 ? hair : SKIN;
    if (isBack(p)) return hair;
    if (isFront(p) && p.v > 0.74 && !(within(p.u, 0.4, 0.62) && p.v < 0.84)) return hair;
    if (isFront(p) && (p.u < 0.1 || p.u > 0.9) && p.v > 0.25) return hair;
    return hairHead(p, hair, face, 0.8);
  }
  if (p.part === 'torso') {
    if (within(p.v, 0.06, 0.12)) return 0x6a4020;
    return uniformTorso(p);
  }
  if (isArm(p)) return isHand(p) ? SKIN : UNIFORM;
  if (isLeg(p)) {
    if (p.ny > 0.66) return within(p.ny, 0.66, 0.7) ? UNIFORM_DARK : UNIFORM;
    if (p.ny < 0.08) return 0x4a2a14;
    return 0x16141c;
  }
  return UNIFORM;
};

/** MEGUMI FUSHIGURO: wild black spikes, deep blue eyes, the plain high-collared uniform. */
const megumi: SuitPainter = (p) => {
  if (p.part === 'head') return hairHead(p, 0x12121a, { skin: SKIN_PALE, iris: 0x2a3a8a, frown: true }, 0.78, 0.5);
  if (p.part === 'torso') {
    if (p.v > 0.8) return UNIFORM_DARK;
    return uniformTorso(p, 0x1a1c2c);
  }
  if (isArm(p)) return isHand(p) ? SKIN_PALE : 0x1a1c2c;
  if (isLeg(p)) return p.ny < 0.08 ? 0x0c0c12 : 0x1a1c2c;
  return 0x1a1c2c;
};

/** MAKI ZEN'IN: dark green hair tied back, glasses, a sorcerer's gear jacket and dark trousers. */
const maki: SuitPainter = (p) => {
  const hair = 0x1f4a32;
  if (p.part === 'head') {
    if (isFront(p) && within(p.v, 0.42, 0.58)) {
      // The glasses' frames.
      for (const cu of [0.3, 0.7]) {
        if (ellipse(p, cu, 0.5, 0.15, 0.09) && !ellipse(p, cu, 0.5, 0.12, 0.065)) return INK;
      }
      if (within(p.u, 0.44, 0.56) && within(p.v, 0.5, 0.53)) return INK;
    }
    return hairHead(p, hair, { skin: SKIN, iris: 0x8a6a2a, fierce: true, frown: true }, 0.82, 0.55);
  }
  if (p.part === 'torso') {
    if (p.v > 0.84) return 0x1a1a22;
    if (isFront(p) && Math.abs(p.u - 0.5) < 0.12 && p.v > 0.45) return 0x2a2a34;
    if (within(p.v, 0.08, 0.14)) return 0x5a3a20;
    return 0x24263a;
  }
  if (isArm(p)) return isHand(p) ? 0x2a2a30 : 0x24263a;
  if (isLeg(p)) return p.ny < 0.1 ? 0x101014 : 0x1a1a22;
  return 0x24263a;
};

/** TOGE INUMAKI: pale lilac hair, violet eyes, the collar zipped over his cursed mouth. */
const toge: SuitPainter = (p) => {
  const hair = 0xe2dcf2;
  if (p.part === 'head') {
    if (isFront(p) && p.v < 0.4) return within(p.v, 0.36, 0.4) ? 0x2a3050 : UNIFORM;
    if ((isSide(p) || isBack(p)) && p.v < 0.36) return UNIFORM;
    return hairHead(p, hair, { skin: SKIN_PALE, iris: 0x8a4ad8, eyeV: 0.55 }, 0.82, 0.5);
  }
  if (p.part === 'torso') return uniformTorso(p);
  if (isArm(p)) return isHand(p) ? SKIN_PALE : UNIFORM;
  if (isLeg(p)) return p.ny < 0.08 ? 0x0c0c12 : UNIFORM;
  return UNIFORM;
};

/** PANDA: white fur, black patches round the eyes, black arms and legs. */
const panda: SuitPainter = (p) => {
  const white = 0xf4f4f0;
  const black = 0x18181e;
  if (p.part === 'head') {
    if (isFront(p)) {
      for (const cu of [0.28, 0.72]) {
        if (ellipse(p, cu, 0.52, 0.17, 0.15)) return ellipse(p, cu + (cu < 0.5 ? 0.03 : -0.03), 0.54, 0.05, 0.05) ? 0xffffff : black;
      }
      if (ellipse(p, 0.5, 0.3, 0.09, 0.06)) return black;
      if (rect(p, 0.42, 0.58, 0.16, 0.19)) return 0x5a3a3a;
    }
    return white;
  }
  if (p.part === 'torso') {
    // The black band over the shoulders and round the chest.
    if (p.v > 0.68) return black;
    return white;
  }
  if (isArm(p)) return black;
  if (isLeg(p)) return black;
  return white;
};

/** KENTO NANAMI: neat blond hair, tinted goggles, a cream suit, a blue shirt and a leopard tie. */
const nanami: SuitPainter = (p) => {
  const suit = 0xe8dcb8;
  const suitShade = 0xd8caa0;
  if (p.part === 'head') {
    if (isFront(p) && within(p.v, 0.44, 0.6) && within(p.u, 0.12, 0.88)) return within(p.v, 0.46, 0.58) ? 0x3a6a5a : 0x2a2a2a;
    if (isSide(p) && within(p.v, 0.5, 0.56)) return 0x2a2a2a;
    return hairHead(p, 0xf0d898, { skin: SKIN, iris: 0x2a2a2a, frown: true }, 0.82, 0.55);
  }
  if (p.part === 'torso') {
    if (isFront(p) && Math.abs(p.u - 0.5) < 0.16 && p.v > 0.3) {
      if (Math.abs(p.u - 0.5) < 0.05) {
        // The leopard tie.
        const spot = frac(p.u * 40 + p.v * 13) < 0.3 && frac(p.v * 22) < 0.4;
        return spot ? 0x3a2410 : 0xe8a83a;
      }
      return 0x5a7ac8;
    }
    if (within(p.v, 0.08, 0.12)) return 0x6a4a2a;
    return isSide(p) ? suitShade : suit;
  }
  if (isArm(p)) return isHand(p) ? SKIN : suit;
  if (isLeg(p)) return p.ny < 0.08 ? 0x3a2a1a : suitShade;
  return suit;
};

/** AOI TODO: a black topknot, a scar through his brow, a tan, the uniform open on a bare chest. */
const todo: SuitPainter = (p) => {
  if (p.part === 'head') {
    if (isFront(p) && within(p.u, 0.22, 0.26) && within(p.v, 0.36, 0.72)) return 0x8a4a3a;
    return hairHead(p, 0x14141a, { skin: SKIN_TAN, iris: 0x2a1a10, fierce: true, frown: true }, 0.86, 0.6);
  }
  if (p.part === 'torso') {
    if (isFront(p) && Math.abs(p.u - 0.5) < 0.18 && p.v > 0.12) {
      // The bare chest and its muscle lines.
      if (Math.abs(p.u - 0.5) < 0.008 && p.v < 0.7) return mix(SKIN_TAN, INK, 0.25);
      if (within(p.v, 0.6, 0.62)) return mix(SKIN_TAN, INK, 0.2);
      return SKIN_TAN;
    }
    return uniformTorso(p, 0x1a2036);
  }
  if (isArm(p)) return p.ny < 0.45 ? SKIN_TAN : 0x1a2036;
  if (isLeg(p)) return p.ny < 0.08 ? 0x0c0c12 : 0x1a2036;
  return 0x1a2036;
};

/** BLACK FLASH YUJI: Yuji mid-Black Flash - eyes red, the uniform cracked with black-red lightning. */
const blackFlash = (p: Parameters<SuitPainter>[0]): boolean =>
  (isArm(p) || p.part === 'torso' || isLeg(p)) && Math.abs(frac(p.nx * 1.7 + p.ny * 2.3 + Math.sin(p.ny * 11 + p.u * 7) * 0.18) - 0.5) < 0.04;
const blackFlashYuji: SuitPainter = (p) => {
  if (p.part === 'head') {
    if (isBack(p) || isSide(p)) return p.v > 0.6 ? 0xf07aa8 : p.v > 0.3 ? 0x2a0a14 : SKIN;
    const c = hairHead(p, 0xf07aa8, { skin: SKIN, iris: 0xff2a3a, fierce: true, sharp: true }, 0.8);
    if (isFront(p) && within(p.v, 0.33, 0.36) && (within(p.u, 0.22, 0.38) || within(p.u, 0.62, 0.78))) return 0x7a1a1a;
    return c;
  }
  if (blackFlash(p)) return 0xff2a3a;
  if (p.part === 'torso') return p.v > 0.84 ? 0x8a0a14 : uniformTorso(p, 0x0e0e16);
  if (isArm(p)) return isHand(p) ? 0x1a0a0e : 0x0e0e16;
  if (isLeg(p)) return p.ny < 0.12 ? 0x2a0a10 : 0x0e0e16;
  return 0x0e0e16;
};
const blackFlashGlow: SuitPainter = (p) => (blackFlash(p) ? 0xc0101c : isHand(p) ? 0x5a0408 : noop);

/** MAHITO: stitched grey-blue hair and face, mismatched eyes, a patched shirt and trousers. */
const mahitoStitch = (p: Parameters<SuitPainter>[0]): boolean =>
  (frac(p.u * 2.2 + p.v * 1.1) < 0.025 || frac(p.v * 1.8 - p.u * 0.6) < 0.025) && frac(p.u * 18) < 0.5;
const mahito: SuitPainter = (p) => {
  const skin = 0xd8d8e8;
  const hair = 0x8aa0c8;
  if (p.part === 'head') {
    if (isFront(p) && p.v < 0.78) {
      // Heterochromia: one eye grey-blue, the other pale.
      const left = ellipse(p, 0.3, 0.5, 0.12, 0.13);
      const right = ellipse(p, 0.7, 0.5, 0.12, 0.13);
      if (left || right) {
        if (ellipse(p, left ? 0.3 : 0.7, 0.49, 0.05, 0.06)) return INK;
        if (ellipse(p, left ? 0.3 : 0.7, 0.49, 0.08, 0.1)) return left ? 0x5a8ac8 : 0xc8d8e8;
        return 0xffffff;
      }
      if (rect(p, 0.32, 0.68, 0.2, 0.25)) return within(p.v, 0.215, 0.235) ? INK : 0xf0f0f8;
      if (mahitoStitch(p)) return 0x3a3a5a;
      return skin;
    }
    if (isTop(p) || isBack(p)) return hair;
    if (isSide(p)) return p.v > 0.2 ? hair : skin;
    return hair;
  }
  if (p.part === 'torso') {
    if (isFront(p) && p.v > 0.6 && Math.abs(p.u - 0.5) < (p.v - 0.6) * 0.6) return skin;
    if (mahitoStitch(p)) return 0x14141e;
    return frac(p.u * 2 + p.v) < 0.5 ? 0x3a3a5a : 0x44466a;
  }
  if (isArm(p)) return isHand(p) ? skin : mahitoStitch(p) ? 0x2a2a3a : 0x5a6a8a;
  if (isLeg(p)) return p.ny < 0.08 ? 0x14141a : mahitoStitch(p) ? 0x14141e : 0x2a2a3a;
  return 0x3a3a5a;
};

/** JOGO: a pale cyclops-browed face under a volcano, a cream robe with a black sash. */
const jogo: SuitPainter = (p) => {
  const skin = 0xe8e0c8;
  const robe = 0xf0e8d0;
  if (p.part === 'head') {
    if (isFront(p)) {
      for (const cu of [0.32, 0.68]) if (ellipse(p, cu, 0.5, 0.06, 0.06)) return INK;
      if (rect(p, 0.28, 0.72, 0.22, 0.3)) return within(p.v, 0.25, 0.27) ? 0x1a1a1a : 0xf8f8f0;
      if (within(p.v, 0.2, 0.22) && within(p.u, 0.28, 0.72)) return INK;
    }
    return skin;
  }
  if (p.part === 'torso') {
    if (within(p.v, 0.1, 0.22)) return 0x14141a;
    if (isFront(p) && p.v > 0.5 && Math.abs(Math.abs(p.u - 0.5) - (p.v - 0.5) * 0.45) < 0.035) return 0xc8b88a;
    return robe;
  }
  if (isArm(p)) return isHand(p) ? skin : robe;
  if (isLeg(p)) return p.ny < 0.08 ? 0x2a1a10 : 0xe0d4b4;
  return robe;
};
const jogoGlow: SuitPainter = (p) => (p.part === 'torso' && within(p.v, 0.12, 0.14) ? 0x8a2a04 : noop);

/** TOJI FUSHIGURO: messy black hair, the scar at his mouth, a tight black shirt and pale baggy trousers. */
const toji: SuitPainter = (p) => {
  if (p.part === 'head') {
    if (isFront(p) && within(p.u, 0.36, 0.4) && within(p.v, 0.16, 0.3)) return 0x8a4a4a;
    return hairHead(p, 0x101016, { skin: SKIN, iris: 0x3a8a5a, sharp: true, frown: true }, 0.8, 0.5);
  }
  if (p.part === 'torso') {
    if (within(p.v, 0.0, 0.08)) return 0xd8d8e0;
    // The shirt clings: muscle lines in a darker black.
    if (isFront(p) && (Math.abs(p.u - 0.5) < 0.006 || within(p.v, 0.56, 0.58))) return 0x050508;
    return 0x16161c;
  }
  if (isArm(p)) return p.ny < 0.55 ? SKIN : 0x16161c;
  if (isLeg(p)) return p.ny < 0.08 ? 0x16161c : frac(p.u * 3) < 0.08 ? 0xb8b8c4 : 0xd8d8e0;
  return 0x16161c;
};

/** SATORU GOJO (a statue): white hair, the blindfold, the black uniform. */
const gojo: SuitPainter = (p) => {
  const black = 0x14161f;
  if (p.part === 'head') {
    if (!isTop(p) && within(p.v, 0.44, 0.66)) return 0x0c0c10;
    if (isTop(p)) return 0xf4f6ff;
    if (isBack(p)) return p.v > 0.3 ? 0xf4f6ff : SKIN_PALE;
    if (isSide(p)) return p.v > 0.66 ? 0xf4f6ff : SKIN_PALE;
    if (p.v > 0.82) return 0xf4f6ff;
    if (rect(p, 0.44, 0.56, 0.22, 0.25)) return 0x9a4a3a;
    return SKIN_PALE;
  }
  if (p.part === 'torso') {
    if (p.v > 0.86) return 0x0a0b12;
    if (isFront(p) && Math.abs(p.u - 0.5) < 0.012) return 0x2a2d3a;
    return black;
  }
  if (isArm(p)) return isHand(p) ? SKIN_PALE : black;
  if (isLeg(p)) return p.ny < 0.1 ? 0x08080c : black;
  return black;
};

/** RYOMEN SUKUNA (a statue): the King of Curses - black markings, four red eyes, a white kimono. */
const sukuna: SuitPainter = (p) => {
  const kimono = 0xf4f2ea;
  if (p.part === 'head') {
    const face: FaceStyle = { skin: SKIN, iris: 0xd01a24, sharp: true, fierce: true, grin: true };
    if (isFront(p)) {
      for (const cu of [0.3, 0.7]) if (ellipse(p, cu, 0.36, 0.07, 0.035)) return 0xd01a24;
      if (within(p.v, 0.72, 0.75) && within(p.u, 0.3, 0.7)) return INK;
      if (within(p.u, 0.08, 0.11) && within(p.v, 0.3, 0.6)) return INK;
      if (within(p.u, 0.89, 0.92) && within(p.v, 0.3, 0.6)) return INK;
    }
    if (isBack(p) || isSide(p)) return p.v > 0.5 ? 0xf07aa8 : SKIN;
    return hairHead(p, 0xf07aa8, face, 0.84);
  }
  if (p.part === 'torso') {
    if (within(p.v, 0.06, 0.2)) return 0x14151c;
    if (isFront(p) && p.v > 0.5 && Math.abs(p.u - 0.5) < (p.v - 0.5) * 0.45) return SKIN;
    if (isFront(p) && p.v > 0.5 && Math.abs(Math.abs(p.u - 0.5) - (p.v - 0.5) * 0.45) < 0.04) return 0x14151c;
    return kimono;
  }
  if (isArm(p)) {
    if (p.ny < 0.28) return within(p.ny, 0.16, 0.19) || within(p.ny, 0.22, 0.25) ? INK : SKIN;
    return kimono;
  }
  if (isLeg(p)) return p.ny < 0.08 ? 0x14151c : 0xe8e4d8;
  return kimono;
};

// ================================================================= accessories

const hood = (b: PartBuilder, c: AccessoryContext, color: number): void => {
  b.add(new BoxGeometry(c.torsoW * 0.9, c.torsoH * 0.36, c.torsoD * 0.5), color, 'smooth', { y: 0.05, z: -c.torsoD * 0.25 });
};

const yujiHair = (b: PartBuilder, c: AccessoryContext): void => {
  cap(b, c, 0xf07aa8, 0.3);
  spikyCrown(b, c, 0xf07aa8, 0.42, 9, 0.52, 0.8);
  spike(b, c, 0x4a2632, 0, 0.62, 0.35, 0.36, 0.16, 1.2, 0);
};

/** A hammer held in the fist, head forward (Nobara's Straw Doll hammer). */
const hammer = (b: PartBuilder): void => {
  b.add(new CylinderGeometry(0.06, 0.07, 1.0, 8), 0x6a4a2a, 'smooth', { y: 0.4 });
  b.box(0.3, 0.3, 0.6, 0x5a5e6a, 'smooth', { y: 0.95 });
  b.box(0.32, 0.12, 0.12, 0x8a8e9a, 'smooth', { y: 0.95, z: 0.32 });
};

/** A long polearm held in the fist (Maki's glaive / Toji's Inverted Spear). */
const glaive = (b: PartBuilder, shaft: number, blade: number, length = 3.4): void => {
  b.add(new CylinderGeometry(0.06, 0.06, length, 8), shaft, 'smooth', { y: length * 0.35 });
  b.add(new ConeGeometry(0.16, 0.9, 4), blade, 'smooth', { y: length * 0.85 + 0.45, sz: 0.4 });
  b.add(new CylinderGeometry(0.1, 0.1, 0.12, 8), GOLD, 'smooth', { y: length * 0.85 - 0.02 });
};

const LOOKS: Readonly<Record<number, LookDef>> = {
  1: {
    paint: yuji,
    head: yujiHair,
    back: (b, c) => hood(b, c, 0xd02a2a),
  },
  2: {
    paint: nobara,
    grip: 'R',
    head: (b, c) => {
      const h = c.head;
      cap(b, c, 0xc8743a, 0.7);
      // The bob: panels down the sides, a fringe swept to one side.
      for (const side of [-1, 1]) b.add(new BoxGeometry(h * 0.16, h * 0.78, h * 0.9), 0xc8743a, 'smooth', { x: side * h * 0.55, y: h * 0.06, z: -h * 0.02 });
      b.add(new BoxGeometry(h * 0.62, h * 0.18, h * 0.14), 0xc8743a, 'smooth', { x: -h * 0.16, y: h * 0.38, z: h * 0.52, rz: 0.18 });
      b.add(new SphereGeometry(h * 0.06, 6, 4), 0xe8e8f0, 'smooth', { x: h * 0.6, y: -h * 0.16 });
    },
    handR: (b) => hammer(b),
    belt: (b, c) => {
      // A pouch of nails at her hip.
      b.box(0.26, 0.3, 0.16, 0x5a3a1a, 'smooth', { x: c.torsoW * 0.42, y: -0.1, z: 0.04 });
      for (let i = 0; i < 4; i += 1) b.add(new CylinderGeometry(0.015, 0.015, 0.22, 4), 0xc8ccd8, 'smooth', { x: c.torsoW * 0.36 + i * 0.04, y: 0.12, z: 0.04 });
    },
  },
  3: {
    paint: megumi,
    head: (b, c) => {
      cap(b, c, 0x12121a, 0.62);
      // Upswept, untamed spikes.
      for (let i = 0; i < 13; i += 1) {
        const a = (i / 13) * Math.PI * 2;
        const front = Math.cos(a) > 0.4;
        spike(b, c, i % 2 ? 0x12121a : 0x1c1c28, Math.sin(a) * 0.36, 0.52, Math.cos(a) * 0.32, front ? 0.42 : 0.78, 0.2, Math.cos(a) * 0.5 - 0.12, -Math.sin(a) * 0.55);
      }
    },
    back: (b, c) => {
      // A shadow hound's head peering over his shoulder: the Ten Shadows.
      const h = c.head;
      b.box(h * 0.5, h * 0.42, h * 0.62, 0x14141e, 'smooth', { x: c.torsoW * 0.42, y: c.torsoH * 0.32, z: -c.torsoD * 0.4 });
      for (const side of [-1, 1]) b.add(new ConeGeometry(h * 0.1, h * 0.3, 4), 0x14141e, 'smooth', { x: c.torsoW * 0.42 + side * h * 0.16, y: c.torsoH * 0.32 + h * 0.32, z: -c.torsoD * 0.45 });
      for (const side of [-1, 1]) b.box(h * 0.08, h * 0.05, h * 0.02, 0xf2f2ff, 'glow', { x: c.torsoW * 0.42 + side * h * 0.12, y: c.torsoH * 0.36, z: -c.torsoD * 0.4 + h * 0.31 });
    },
  },
  4: {
    paint: maki,
    grip: 'R',
    head: (b, c) => {
      const h = c.head;
      cap(b, c, 0x1f4a32, 0.66);
      // The high ponytail.
      b.add(new SphereGeometry(h * 0.16, 8, 6), 0x1f4a32, 'smooth', { y: h * 0.42, z: -h * 0.5 });
      b.add(new ConeGeometry(h * 0.18, h * 0.9, 6), 0x1f4a32, 'smooth', { y: h * 0.0, z: -h * 0.7, rx: 0.25 + Math.PI });
      b.add(new BoxGeometry(h * 0.55, h * 0.16, h * 0.12), 0x1f4a32, 'smooth', { x: h * 0.16, y: h * 0.36, z: h * 0.52, rz: -0.2 });
    },
    handR: (b) => glaive(b, 0x2a2a30, 0xd8dee8, 3.4),
  },
  5: {
    paint: toge,
    head: (b, c) => {
      cap(b, c, 0xe2dcf2, 0.6);
      spikyCrown(b, c, 0xe2dcf2, 0.32, 10, 0.5, 0.9);
      // The tall collar, zipped to the nose.
      const h = c.head;
      b.add(new CylinderGeometry(h * 0.62, h * 0.58, h * 0.42, 12), UNIFORM, 'smooth', { y: -h * 0.36 });
    },
  },
  6: {
    paint: panda,
    scale: 1.14,
    head: (b, c) => {
      const h = c.head;
      for (const side of [-1, 1]) {
        b.add(new SphereGeometry(h * 0.2, 8, 6), 0x18181e, 'smooth', { x: side * h * 0.4, y: h * 0.56, z: -h * 0.05 });
      }
      // The snout.
      b.box(h * 0.44, h * 0.28, h * 0.16, 0xf4f4f0, 'smooth', { y: -h * 0.18, z: h * 0.56 });
      b.box(h * 0.16, h * 0.1, h * 0.04, 0x18181e, 'smooth', { y: -h * 0.1, z: h * 0.65 });
    },
    back: (b, c) => {
      // A round panda back and stubby tail.
      b.add(new SphereGeometry(c.torsoW * 0.55, 10, 8), 0xf4f4f0, 'smooth', { y: -c.torsoH * 0.4, z: -c.torsoD * 0.2, sx: 1, sy: 0.9, sz: 0.5 });
      b.add(new SphereGeometry(0.16, 6, 5), 0x18181e, 'smooth', { y: -c.torsoH * 0.85, z: -c.torsoD * 0.5 });
    },
  },
  7: {
    paint: nanami,
    grip: 'R',
    head: (b, c) => {
      const h = c.head;
      cap(b, c, 0xf0d898, 0.6);
      b.add(new BoxGeometry(h * 0.7, h * 0.2, h * 0.16), 0xf0d898, 'smooth', { x: h * 0.1, y: h * 0.4, z: h * 0.5, rz: -0.12 });
      // The goggles' strap.
      b.add(new TorusGeometry(h * 0.56, h * 0.025, 4, 18), 0x2a2a2a, 'smooth', { y: h * 0.02, rx: Math.PI / 2 });
    },
    handR: (b) => {
      // The blunt blade wrapped in a patterned cloth.
      b.box(0.1, 0.5, 0.1, 0x3a2a1a, 'smooth', { y: 0.1 });
      b.box(0.07, 1.9, 0.34, 0xc8c8d0, 'smooth', { y: 1.25 });
      for (let i = 0; i < 4; i += 1) b.box(0.1, 0.22, 0.38, i % 2 ? 0x2a2a60 : 0xe8d8a0, 'smooth', { y: 0.55 + i * 0.4 });
    },
  },
  8: {
    paint: todo,
    scale: 1.12,
    head: (b, c) => {
      const h = c.head;
      cap(b, c, 0x14141a, 0.55);
      // The topknot.
      b.add(new SphereGeometry(h * 0.22, 8, 6), 0x14141a, 'smooth', { y: h * 0.72, z: -h * 0.18 });
      b.add(new CylinderGeometry(h * 0.06, h * 0.06, h * 0.12, 6), 0xd02a2a, 'smooth', { y: h * 0.56, z: -h * 0.18 });
    },
    back: (b, c) => {
      // Shoulders like a wall.
      for (const side of [-1, 1]) b.add(new SphereGeometry(c.limb * 0.7, 8, 6), 0x1a2036, 'smooth', { x: side * (c.torsoW * 0.5 + c.limb * 0.2), y: -0.05, z: c.torsoD * 0.5 });
    },
  },
  9: {
    paint: blackFlashYuji,
    glow: blackFlashGlow,
    signature: { color: 0xff2a3a, style: 'lightning' },
    head: (b, c) => {
      yujiHair(b, c);
      spike(b, c, 0xff2a3a, 0.2, 0.7, 0.1, 0.3, 0.06, 0.2, -0.6, 'glow');
    },
    back: (b, c) => hood(b, c, 0x8a0a14),
    handR: (b) => {
      // Black-red sparks crackling off the fist.
      for (let i = 0; i < 5; i += 1) b.add(new ConeGeometry(0.05, 0.4, 4), i % 2 ? 0xff2a3a : 0x14080c, 'glow', { x: Math.cos(i * 1.3) * 0.22, y: -0.1 + (i % 3) * 0.08, z: Math.sin(i * 1.3) * 0.22, rz: i, rx: i * 0.7 });
    },
  },
  10: {
    paint: mahito,
    signature: { color: 0x7affd8, style: 'dark' },
    head: (b, c) => {
      const h = c.head;
      cap(b, c, 0x8aa0c8, 0.9);
      // Long patchwork locks to the shoulders, in two tones.
      for (const side of [-1, 1]) b.add(new BoxGeometry(h * 0.18, h * 1.0, h * 0.8), side < 0 ? 0x8aa0c8 : 0x6a7aa0, 'smooth', { x: side * h * 0.56, y: -h * 0.1, z: -h * 0.05 });
      b.add(new BoxGeometry(h * 1.0, h * 0.9, h * 0.16), 0x7a8ab0, 'smooth', { y: -h * 0.12, z: -h * 0.58 });
      b.add(new BoxGeometry(h * 0.5, h * 0.22, h * 0.14), 0x6a7aa0, 'smooth', { x: -h * 0.2, y: h * 0.38, z: h * 0.52, rz: 0.3 });
    },
  },
  11: {
    paint: jogo,
    glow: jogoGlow,
    signature: { color: 0xff6a1c, style: 'flame' },
    head: (b, c) => {
      const h = c.head;
      // The volcano: a broad cone of grey rock, a crater of glowing magma, a plume of smoke.
      b.add(new CylinderGeometry(h * 0.28, h * 0.62, h * 0.7, 12), 0x5a5a5e, 'smooth', { y: h * 0.78 });
      b.add(new CylinderGeometry(h * 0.24, h * 0.24, h * 0.05, 12), 0xff6a1c, 'glow', { y: h * 1.14 });
      b.add(new CylinderGeometry(h * 0.16, h * 0.16, h * 0.06, 10), 0xffd23a, 'glow', { y: h * 1.16 });
      for (let i = 0; i < 4; i += 1) b.add(new SphereGeometry(h * (0.14 + i * 0.04), 7, 5), 0x8a8a90, 'smooth', { x: Math.sin(i * 2.1) * h * 0.1, y: h * (1.3 + i * 0.22), z: Math.cos(i * 2.1) * h * 0.1 });
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        b.box(h * 0.06, h * 0.4, h * 0.03, 0xff5a1a, 'glow', { x: Math.sin(a) * h * 0.44, y: h * 0.72, z: Math.cos(a) * h * 0.44, ry: a, rz: 0.4 });
      }
    },
  },
  12: {
    paint: toji,
    signature: { color: 0xe8ecff, style: 'sparkle' },
    head: (b, c) => {
      cap(b, c, 0x101016, 0.5);
      spikyCrown(b, c, 0x101016, 0.34, 11, 0.5, 1.15);
    },
    back: (b, c) => {
      // The weapon-storage curse, coiled over his shoulders, and the Inverted Spear on his back.
      for (let i = 0; i < 7; i += 1) {
        const a = -Math.PI * 0.6 + (i / 6) * Math.PI * 1.2;
        b.add(new SphereGeometry(0.22 - i * 0.012, 8, 6), 0x8a6aa8, 'smooth', { x: Math.sin(a) * c.torsoW * 0.6, y: c.torsoH * 0.22 + Math.cos(a) * 0.12, z: -c.torsoD * 0.3 + Math.cos(a) * c.torsoD * 0.4 });
      }
      b.add(new SphereGeometry(0.06, 6, 4), 0xffd23a, 'glow', { x: -c.torsoW * 0.62, y: c.torsoH * 0.3, z: c.torsoD * 0.1 });
      backKatana(b, c, 0x2a2a30, 0x3a3a44, 0xb8b8c4, -0.9);
    },
  },
};

/** The hall's statues and anything else painted that is not a playable character. */
export const STATUE_LOOKS: Readonly<Record<'gojo' | 'sukuna', LookDef>> = {
  gojo: {
    paint: gojo,
    signature: { color: 0x7ac8ff, style: 'sparkle' },
    head: (b, c) => {
      cap(b, c, 0xf4f6ff, 0.3);
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2;
        spike(b, c, i % 2 ? 0xf4f6ff : 0xe2e8f6, Math.sin(a) * 0.3, 0.52, Math.cos(a) * 0.3, 0.72, 0.22, Math.cos(a) * 0.4 - 0.35, -Math.sin(a) * 0.45);
      }
    },
  },
  sukuna: {
    paint: sukuna,
    signature: { color: 0xff1a3a, style: 'dark' },
    head: (b, c) => {
      cap(b, c, 0xf07aa8, 0.46);
      for (let i = 0; i < 9; i += 1) {
        const t = i / 8 - 0.5;
        spike(b, c, i % 2 ? 0xf07aa8 : 0xd8608e, t * 0.9, 0.52, -0.1, 0.6, 0.2, -1.2, -t * 0.6);
      }
    },
    chest: (b, c) => {
      b.add(new BoxGeometry(c.torsoW * 0.9, 0.22, c.torsoD * 1.15), 0x14151c, 'smooth', { y: c.torsoH * 0.28, z: -c.torsoD * 0.55 });
    },
  },
};

/** The look of a character id; an unknown id falls back to Yuji. */
export const characterLook = (id: number): LookDef => LOOKS[id] ?? LOOKS[1]!;
