import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

/**
 * THE EFFECT TEXTURES, drawn once on small canvases: white shapes on
 * transparent, tinted per use by the material colour. Eleven of them draw
 * every slash, blast, beam cap, flame, spark and shockwave in the game - no
 * image file ships for any effect.
 */
export type FxTexture =
  | 'flash'
  | 'ring'
  | 'crescent'
  | 'star'
  | 'lines'
  | 'smoke'
  | 'swirl'
  | 'flame'
  | 'fist'
  | 'shard'
  | 'disc'
  | 'aura';

const cache = new Map<FxTexture, Texture>();

const canvas = (size: number, w = size): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = size;
  return [c, c.getContext('2d')!];
};

const draw: Readonly<Record<FxTexture, () => HTMLCanvasElement>> = {
  flash: () => {
    const [c, ctx] = canvas(64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return c;
  },
  ring: () => {
    const [c, ctx] = canvas(128);
    const g = ctx.createRadialGradient(64, 64, 40, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,1)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return c;
  },
  crescent: () => {
    // A sword arc: a thick crescent, bright on its outer edge, fading toward its tips.
    const [c, ctx] = canvas(128);
    ctx.translate(64, 64);
    for (let i = 0; i < 18; i += 1) {
      const t = i / 17;
      const a0 = -Math.PI * 0.85 + t * 0.05;
      const a1 = -Math.PI * 0.15 - t * 0.05;
      ctx.beginPath();
      ctx.arc(0, 18, 54 - t * 16, a0, a1);
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + (1 - t) * 0.5})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 18, 54, -Math.PI * 0.88, -Math.PI * 0.12);
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 6;
    ctx.stroke();
    return c;
  },
  star: () => {
    // An impact star: four long spikes and four short, on a bright core.
    const [c, ctx] = canvas(128);
    ctx.translate(64, 64);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i += 1) {
      const long = i % 2 === 0 ? 62 : 34;
      ctx.save();
      ctx.rotate((i / 8) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(0, -long);
      ctx.lineTo(7, 0);
      ctx.lineTo(0, long * 0.2);
      ctx.lineTo(-7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    return c;
  },
  lines: () => {
    // Anime impact lines: thin wedges bursting from an empty centre.
    const [c, ctx] = canvas(128);
    ctx.translate(64, 64);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 22; i += 1) {
      const a = (i / 22) * Math.PI * 2 + (i % 3) * 0.07;
      const inner = 24 + (i % 4) * 5;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-1.6, inner);
      ctx.lineTo(1.6, inner);
      ctx.lineTo(0, 63);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    return c;
  },
  smoke: () => {
    const [c, ctx] = canvas(64);
    for (let i = 0; i < 6; i += 1) {
      const x = 32 + Math.cos(i * 1.7) * 10;
      const y = 32 + Math.sin(i * 2.3) * 9;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 20);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    return c;
  },
  swirl: () => {
    // The Rasengan: spiral arms round a bright core.
    const [c, ctx] = canvas(128);
    ctx.translate(64, 64);
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 4; arm += 1) {
      ctx.beginPath();
      for (let t = 0; t <= 1; t += 0.04) {
        const a = arm * (Math.PI / 2) + t * Math.PI * 1.6;
        const r = 8 + t * 52;
        if (t === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    return c;
  },
  flame: () => {
    // One tongue of flame, pointing up, bright at its root.
    const [c, ctx] = canvas(128, 64);
    const g = ctx.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(32, 4);
    ctx.bezierCurveTo(52, 44, 62, 70, 54, 100);
    ctx.bezierCurveTo(48, 122, 16, 122, 10, 100);
    ctx.bezierCurveTo(2, 70, 14, 50, 32, 4);
    ctx.fill();
    return c;
  },
  fist: () => {
    // A cartoon fist, knuckles forward: Gear 5's giant punch.
    const [c, ctx] = canvas(128);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(40,30,60,0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(22, 34, 84, 70, 22);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(34 + i * 20, 40, 11, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(30, 72);
    ctx.quadraticCurveTo(60, 64, 76, 80);
    ctx.stroke();
    return c;
  },
  shard: () => {
    const [c, ctx] = canvas(64);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(32, 2);
    ctx.lineTo(44, 32);
    ctx.lineTo(32, 62);
    ctx.lineTo(20, 32);
    ctx.closePath();
    ctx.fill();
    return c;
  },
  disc: () => {
    // A spinning energy disc, seen edge-on-ish: a bright ellipse with a hard rim.
    const [c, ctx] = canvas(64, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(64, 32, 60, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.stroke();
    return c;
  },
  aura: () => {
    // A body aura: licking flames round an oval, hollow toward the middle.
    const [c, ctx] = canvas(128, 96);
    for (let i = 0; i < 9; i += 1) {
      const x = 12 + i * 9;
      const top = 6 + Math.abs(i - 4) * 9 + (i % 2) * 6;
      const g = ctx.createLinearGradient(0, 126, 0, top);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.28)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, 126);
      ctx.quadraticCurveTo(x - 6, 60, x + 5, top);
      ctx.quadraticCurveTo(x + 16, 60, x + 12, 126);
      ctx.fill();
    }
    return c;
  },
};

/** One effect texture, drawn on first use. */
export const fxTexture = (name: FxTexture): Texture => {
  let texture = cache.get(name);
  if (!texture) {
    texture = new CanvasTexture(draw[name]());
    texture.colorSpace = SRGBColorSpace;
    cache.set(name, texture);
  }
  return texture;
};
