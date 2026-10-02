import type { StageDef, WallMaterial } from '@jjk/shared';
import { CanvasTexture, MeshLambertMaterial, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/**
 * THE WALLS' MATERIALS, painted on small canvases at load: paper screens
 * sealed with talismans, shop shutters, brick, planks, concrete, chalkboard,
 * cursed flesh full of eyes, bark, grave stone, tiles, braced steel, rubble,
 * magma, coral, living shadow, a domain's hex barrier, carved stone, bone,
 * crystal, the void, gold, obsidian and bamboo. No image files ship: every
 * texture is a little 2D canvas, cached per stage (its palette tints it).
 *
 * And the CRACKS: four overlays of the same fracture, deepening, laid over
 * the wall as its health falls.
 */

const SIZE = 256;

type Painter = (ctx: CanvasRenderingContext2D, s: StageDef) => void;

const css = (color: number, lighten = 0): string => {
  const r = Math.min(255, Math.max(0, ((color >> 16) & 255) + lighten));
  const g = Math.min(255, Math.max(0, ((color >> 8) & 255) + lighten));
  const b = Math.min(255, Math.max(0, (color & 255) + lighten));
  return `rgb(${r},${g},${b})`;
};

/** A deterministic random stream, so every load paints the same wall. */
const rand = (seed: number): (() => number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const speckle = (ctx: CanvasRenderingContext2D, r: () => number, count: number, color: string, size = 2): void => {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) ctx.fillRect(r() * SIZE, r() * SIZE, size, size);
};

const KANJI_FONT = '"Yu Gothic", "Hiragino Sans", "Noto Sans CJK JP", "Microsoft YaHei", sans-serif';

/** A paper talisman with a red seal and a line of brush strokes. */
const drawTalisman = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, glyph = '封'): void => {
  ctx.fillStyle = '#fff4d6';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#c8101c';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  ctx.fillStyle = '#c8101c';
  ctx.font = `700 ${Math.floor(w * 0.7)}px ${KANJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, x + w / 2, y + h * 0.3);
  ctx.fillStyle = '#1a1a1a';
  for (let i = 0; i < 4; i += 1) ctx.fillRect(x + w * 0.42, y + h * (0.52 + i * 0.1), w * 0.16, h * 0.05);
};

const PAINTERS: Readonly<Record<WallMaterial, Painter>> = {
  talisman: (ctx, s) => {
    // A shoji screen: paper panes in a wooden grid, sealed with talismans.
    ctx.fillStyle = css(s.palette.wall);
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#7a5434';
    for (let i = 0; i <= 4; i += 1) {
      ctx.fillRect(i * 64 - 4, 0, 8, SIZE);
      ctx.fillRect(0, i * 64 - 4, SIZE, 8);
    }
    drawTalisman(ctx, 40, 70, 44, 110);
    drawTalisman(ctx, 168, 60, 44, 110, '呪');
  },
  shutter: (ctx, s) => {
    // A rolled-down shop shutter with a graffiti tag.
    for (let y = 0; y < SIZE; y += 12) {
      ctx.fillStyle = css(s.palette.wall, (y / 12) % 2 ? -10 : 12);
      ctx.fillRect(0, y, SIZE, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y + 10, SIZE, 2);
    }
    ctx.strokeStyle = css(s.palette.accent);
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(40, 160);
    ctx.bezierCurveTo(80, 90, 120, 200, 160, 120);
    ctx.bezierCurveTo(180, 90, 210, 140, 220, 110);
    ctx.stroke();
  },
  brick: (ctx, s) => {
    ctx.fillStyle = '#d8d0c4';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const r = rand(7);
    for (let row = 0; row < 8; row += 1) {
      const offset = row % 2 ? 32 : 0;
      for (let col = -1; col < 4; col += 1) {
        ctx.fillStyle = css(s.palette.wall, Math.floor((r() - 0.5) * 30));
        ctx.fillRect(col * 64 + offset + 3, row * 32 + 3, 58, 26);
      }
    }
  },
  wood: (ctx, s) => {
    const r = rand(6);
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = css(s.palette.wall, (i % 2) * 14 - 6);
      ctx.fillRect(0, i * 64, SIZE, 64);
      ctx.strokeStyle = css(s.palette.wall, -36);
      ctx.lineWidth = 2;
      for (let k = 0; k < 5; k += 1) {
        const y = i * 64 + 8 + r() * 48;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(80, y + (r() - 0.5) * 10, 170, y + (r() - 0.5) * 10, SIZE, y);
        ctx.stroke();
      }
      ctx.fillStyle = css(s.palette.wall, -60);
      ctx.fillRect(0, i * 64 + 62, SIZE, 3);
    }
    // A gold-ringed crest.
    ctx.strokeStyle = '#f2c14e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(128, 128, 30, 0, Math.PI * 2);
    ctx.stroke();
  },
  concrete: (ctx, s) => {
    ctx.fillStyle = css(s.palette.wall);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const r = rand(8);
    speckle(ctx, r, 1400, css(s.palette.wall, -22), 2);
    speckle(ctx, r, 600, css(s.palette.wall, 18), 2);
    ctx.fillStyle = css(s.palette.wall, -40);
    ctx.fillRect(0, 126, SIZE, 4);
    ctx.fillRect(126, 0, 4, SIZE);
    // Hazard stripes along the foot.
    for (let x = -32; x < SIZE; x += 32) {
      ctx.fillStyle = '#ffc23a';
      ctx.beginPath();
      ctx.moveTo(x, SIZE);
      ctx.lineTo(x + 16, SIZE);
      ctx.lineTo(x + 32, SIZE - 22);
      ctx.lineTo(x + 16, SIZE - 22);
      ctx.fill();
    }
  },
  board: (ctx, s) => {
    // A chalkboard: dark green, a wooden frame, chalk scrawl.
    ctx.fillStyle = '#7a5434';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = css(s.palette.wall);
    ctx.fillRect(12, 12, SIZE - 24, SIZE - 24);
    ctx.strokeStyle = 'rgba(240,240,230,0.75)';
    ctx.lineWidth = 3;
    ctx.font = `700 34px ${KANJI_FONT}`;
    ctx.fillStyle = 'rgba(240,240,230,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText('呪術', 128, 90);
    ctx.beginPath();
    ctx.moveTo(40, 150);
    ctx.lineTo(210, 150);
    ctx.moveTo(40, 180);
    ctx.lineTo(160, 180);
    ctx.stroke();
  },
  flesh: (ctx, s) => {
    // Cursed flesh: a mottled hide, stitched, with eyes staring out of it.
    ctx.fillStyle = css(s.palette.wall);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const r = rand(31);
    for (let i = 0; i < 40; i += 1) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + r() * 0.12})`;
      ctx.beginPath();
      ctx.arc(r() * SIZE, r() * SIZE, 8 + r() * 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(20,10,20,0.8)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i += 1) {
      const y = 40 + i * 80;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SIZE, y + 20);
      ctx.stroke();
      for (let x = 8; x < SIZE; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, y + (x / SIZE) * 20 - 6);
        ctx.lineTo(x + 4, y + (x / SIZE) * 20 + 6);
        ctx.stroke();
      }
    }
    for (const [x, y] of [[70, 90], [190, 170], [150, 60]] as const) {
      ctx.fillStyle = '#f4f0e0';
      ctx.beginPath();
      ctx.ellipse(x, y, 18, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(s.palette.accent);
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  bark: (ctx, s) => {
    ctx.fillStyle = css(s.palette.wall);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const r = rand(41);
    ctx.strokeStyle = css(s.palette.wall, -40);
    ctx.lineWidth = 4;
    for (let i = 0; i < 18; i += 1) {
      const x = r() * SIZE;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (r() - 0.5) * 30, 80, x + (r() - 0.5) * 30, 170, x + (r() - 0.5) * 20, SIZE);
      ctx.stroke();
    }
    // Moss, or cursed growth in the dark forest.
    speckle(ctx, r, 300, css(s.palette.accent, -30), 3);
  },
  grave: (ctx, s) => {
    // Stacked grave stone, engraved.
    ctx.fillStyle = css(s.palette.wall, -40);
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        ctx.fillStyle = css(s.palette.wall, ((row + col) % 2) * 12);
        ctx.fillRect(col * 128 + 4, row * 64 + 4, 120, 56);
      }
    }
    ctx.fillStyle = 'rgba(30,30,40,0.6)';
    ctx.font = `700 40px ${KANJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('霊', 64, 98);
    ctx.fillText('墓', 192, 162);
  },
  tile: (ctx, s) => {
    ctx.fillStyle = css(s.palette.wall, -50);
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 32) {
      for (let x = 0; x < SIZE; x += 32) {
        ctx.fillStyle = css(s.palette.wall, ((x + y) / 32) % 3 === 0 ? -12 : 6);
        ctx.fillRect(x + 2, y + 2, 28, 28);
      }
    }
    ctx.fillStyle = css(s.palette.accent);
    ctx.fillRect(0, 150, SIZE, 14);
  },
  steel: (ctx, s) => {
    ctx.fillStyle = css(s.palette.wall);
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 3) {
      ctx.fillStyle = `rgba(255,255,255,${(y % 9) / 60})`;
      ctx.fillRect(0, y, SIZE, 1);
    }
    ctx.strokeStyle = css(s.palette.wall, -50);
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(SIZE, SIZE);
    ctx.moveTo(SIZE, 0);
    ctx.lineTo(0, SIZE);
    ctx.stroke();
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, SIZE - 10, SIZE - 10);
    ctx.fillStyle = css(s.palette.wall, 50);
    for (const [x, y] of [[16, 16], [240, 16], [16, 240], [240, 240]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  rubble: (ctx, s) => {
    ctx.fillStyle = css(s.palette.wall, -20);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const r = rand(53);
    for (let i = 0; i < 45; i += 1) {
      ctx.fillStyle = css(s.palette.wall, Math.floor((r() - 0.4) * 50));
      ctx.beginPath();
      const x = r() * SIZE;
      const y = r() * SIZE;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 10 + r() * 40, y + r() * 20);
      ctx.lineTo(x + r() * 30, y + 14 + r() * 30);
      ctx.lineTo(x - r() * 20, y + r() * 25);
      ctx.fill();
    }
    // Rebar.
    ctx.strokeStyle = '#6a4a3a';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(r() * SIZE, r() * SIZE);
      ctx.lineTo(r() * SIZE, r() * SIZE);
      ctx.stroke();
    }
  },
  magma: (ctx, s) => {
    ctx.fillStyle = css(s.palette.wall);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const r = rand(19);
    ctx.lineCap = 'round';
    for (let i = 0; i < 14; i += 1) {
      ctx.strokeStyle = i % 3 ? '#ff6a1c' : '#ffd23a';
      ctx.lineWidth = 3 + r() * 5;
      ctx.beginPath();
      let x = r() * SIZE;
      let y = r() * SIZE;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k += 1) {
        x += (r() - 0.5) * 70;
        y += (r() - 0.5) * 70;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  },
  coral: (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, SIZE);
    g.addColorStop(0, css(s.palette.wall, 30));
    g.addColorStop(1, css(s.palette.wall, -30));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const r = rand(61);
    for (let i = 0; i < 26; i += 1) {
      ctx.strokeStyle = r() < 0.5 ? css(s.palette.accent) : '#ff8a6a';
      ctx.lineWidth = 4 + r() * 6;
      ctx.lineCap = 'round';
      let x = r() * SIZE;
      let y = SIZE;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k += 1) {
        x += (r() - 0.5) * 40;
        y -= 20 + r() * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    speckle(ctx, r, 160, 'rgba(255,255,255,0.5)', 3);
  },
  shadow: (ctx, s) => {
    // Living shadow: black ink pooling, purple light bleeding through, eyes in it.
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const r = rand(71);
    for (let i = 0; i < 18; i += 1) {
      const g = ctx.createRadialGradient(r() * SIZE, r() * SIZE, 0, r() * SIZE, r() * SIZE, 40 + r() * 50);
      g.addColorStop(0, css(s.palette.accent, -60));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
    for (const [x, y] of [[60, 100], [180, 70], [140, 190]] as const) {
      ctx.fillStyle = '#f2f2ff';
      ctx.beginPath();
      ctx.ellipse(x, y, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  barrier: (ctx, s) => {
    // A domain's barrier: glowing hexagons.
    ctx.fillStyle = css(s.palette.wall, -50);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const h = 32;
    const w = h * Math.sqrt(3);
    for (let row = -1; row < 10; row += 1) {
      for (let col = -1; col < 6; col += 1) {
        const cx = col * w + (row % 2 ? w / 2 : 0);
        const cy = row * h * 0.87 * 1.0;
        ctx.strokeStyle = css(s.palette.accent);
        ctx.lineWidth = 3;
        ctx.fillStyle = css(s.palette.wall, ((row + col) % 3) * 10);
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const px = cx + Math.cos(a) * (h * 0.52);
          const py = cy + Math.sin(a) * (h * 0.52);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  },
  stone: (ctx, s) => {
    ctx.fillStyle = css(s.palette.wall, -30);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const r = rand(83);
    for (let row = 0; row < 5; row += 1) {
      let x = -r() * 40;
      while (x < SIZE) {
        const w = 40 + r() * 50;
        ctx.fillStyle = css(s.palette.wall, Math.floor((r() - 0.5) * 30));
        ctx.fillRect(x + 3, row * 52 + 3, w - 6, 46);
        x += w;
      }
    }
    // A carved seal.
    ctx.strokeStyle = css(s.palette.accent);
    ctx.lineWidth = 4;
    ctx.strokeRect(96, 96, 64, 64);
    ctx.beginPath();
    ctx.moveTo(96, 96);
    ctx.lineTo(160, 160);
    ctx.moveTo(160, 96);
    ctx.lineTo(96, 160);
    ctx.stroke();
  },
  bone: (ctx, s) => {
    // Packed bone: ribs and skulls mortared together.
    ctx.fillStyle = '#3a1414';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const r = rand(91);
    for (let i = 0; i < 30; i += 1) {
      ctx.strokeStyle = css(s.palette.wall, Math.floor((r() - 0.5) * 30));
      ctx.lineWidth = 8 + r() * 6;
      ctx.lineCap = 'round';
      const x = r() * SIZE;
      const y = r() * SIZE;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 80, y + (r() - 0.5) * 30);
      ctx.stroke();
    }
    for (const [x, y] of [[64, 64], [192, 150]] as const) {
      ctx.fillStyle = css(s.palette.wall, 10);
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a0606';
      for (const dx of [-10, 10]) {
        ctx.beginPath();
        ctx.arc(x + dx, y - 2, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  crystal: (ctx, s) => facets(ctx, s, 16, [css(s.palette.wall, 40), css(s.palette.wall), css(s.palette.accent), '#ffffff']),
  void: (ctx, s) => {
    const grad = ctx.createRadialGradient(SIZE * 0.4, SIZE * 0.45, 10, SIZE / 2, SIZE / 2, SIZE * 0.7);
    grad.addColorStop(0, css(s.palette.accent));
    grad.addColorStop(0.35, css(s.palette.wall, 40));
    grad.addColorStop(1, '#02020a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const r = rand(20);
    for (let i = 0; i < 110; i += 1) {
      ctx.fillStyle = r() < 0.2 ? '#8ae8ff' : '#ffffff';
      const size = r() < 0.1 ? 3 : 1.5;
      ctx.fillRect(r() * SIZE, r() * SIZE, size, size);
    }
  },
  gold: (ctx, s) => {
    ctx.fillStyle = css(s.palette.wall, -40);
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let row = 0; row < 6; row += 1) {
      const offset = row % 2 ? 32 : 0;
      for (let col = -1; col < 4; col += 1) {
        const x = col * 64 + offset + 4;
        const y = row * 43 + 4;
        const grad = ctx.createLinearGradient(x, y, x, y + 36);
        grad.addColorStop(0, '#fff2a8');
        grad.addColorStop(0.5, css(s.palette.wall));
        grad.addColorStop(1, '#b88a10');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, 56, 36);
      }
    }
  },
  obsidian: (ctx, s) => {
    ctx.fillStyle = css(s.palette.wall);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const r = rand(15);
    for (let i = 0; i < 30; i += 1) {
      ctx.fillStyle = r() < 0.3 ? 'rgba(255,40,30,0.35)' : css(s.palette.wall, Math.floor(r() * 30) - 10);
      ctx.beginPath();
      const x = r() * SIZE;
      const y = r() * SIZE;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.3) * 80, y + r() * 60);
      ctx.lineTo(x + (r() - 0.7) * 80, y + r() * 80);
      ctx.fill();
    }
  },
  bamboo: (ctx, s) => {
    for (let x = 0; x < SIZE; x += 32) {
      const g = ctx.createLinearGradient(x, 0, x + 32, 0);
      g.addColorStop(0, css(s.palette.wall, -30));
      g.addColorStop(0.5, css(s.palette.wall, 20));
      g.addColorStop(1, css(s.palette.wall, -30));
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 32, SIZE);
      ctx.fillStyle = css(s.palette.wall, -50);
      for (let y = (x * 7) % 64; y < SIZE; y += 64) ctx.fillRect(x + 2, y, 28, 5);
    }
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(0, 60, SIZE, 10);
    ctx.fillRect(0, 186, SIZE, 10);
  },
};

function facets(ctx: CanvasRenderingContext2D, s: StageDef, seed: number, colors: readonly string[]): void {
  ctx.fillStyle = css(s.palette.wall);
  ctx.fillRect(0, 0, SIZE, SIZE);
  const r = rand(seed);
  const step = 64;
  for (let y = 0; y < SIZE; y += step) {
    for (let x = 0; x < SIZE; x += step) {
      const cx = x + step / 2 + (r() - 0.5) * 20;
      const cy = y + step / 2 + (r() - 0.5) * 20;
      const corners = [[x, y], [x + step, y], [x + step, y + step], [x, y + step]] as const;
      for (let k = 0; k < 4; k += 1) {
        const a = corners[k]!;
        const b = corners[(k + 1) % 4]!;
        ctx.fillStyle = colors[Math.floor(r() * colors.length)]!;
        ctx.globalAlpha = 0.55 + r() * 0.45;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

const materials = new Map<number, MeshLambertMaterial>();

const paint = (stage: StageDef): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  PAINTERS[stage.material](canvas.getContext('2d')!, stage);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
};

/** Materials that glow from within: lit by themselves, so they read in any light. */
const GLOWING: Partial<Record<WallMaterial, number>> = { magma: 0.9, void: 0.7, crystal: 0.3, barrier: 0.45, gold: 0.12, shadow: 0.25 };

/** A stage's wall material, shared by every wall of that stage. Built when the stage is first built. */
export const wallMaterial = (stage: StageDef): MeshLambertMaterial => {
  const cached = materials.get(stage.index);
  if (cached) return cached;
  const map = paint(stage);
  const glow = GLOWING[stage.material] ?? 0;
  const material = new MeshLambertMaterial({
    map,
    emissive: glow > 0 ? 0xffffff : 0x000000,
    emissiveMap: glow > 0 ? map : null,
    emissiveIntensity: glow,
  });
  materials.set(stage.index, material);
  return material;
};

// ------------------------------------------------------------------ cracks

/** Crack overlays: 0 = none, 1..4 deepening. */
export const CRACK_LEVELS = 4;
const crackTextures: Texture[] = [];

/**
 * The fracture: one set of crack paths from the middle out, drawn further and
 * thicker at each level, so a wall visibly gives way as its health falls. The
 * cracks bleed cursed-violet light.
 */
export const crackTexture = (level: number): Texture | null => {
  if (level <= 0) return null;
  const index = Math.min(CRACK_LEVELS, level) - 1;
  if (crackTextures.length === 0) {
    const r = rand(99);
    const branches: { x: number; y: number; steps: { dx: number; dy: number }[] }[] = [];
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2 + r() * 0.5;
      const steps: { dx: number; dy: number }[] = [];
      let a = angle;
      for (let k = 0; k < 7; k += 1) {
        a += (r() - 0.5) * 0.9;
        const len = 16 + r() * 18;
        steps.push({ dx: Math.cos(a) * len, dy: Math.sin(a) * len });
      }
      branches.push({ x: SIZE / 2 + (r() - 0.5) * 20, y: SIZE / 2 + (r() - 0.5) * 20, steps });
    }
    for (let level = 1; level <= CRACK_LEVELS; level += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d')!;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const reach = Math.ceil((level / CRACK_LEVELS) * 7);
      const shown = Math.min(branches.length, 3 + level * 2);
      for (const pass of [0, 1]) {
        ctx.strokeStyle = pass === 0 ? 'rgba(170,120,255,0.55)' : 'rgba(20,16,24,0.92)';
        ctx.lineWidth = (pass === 0 ? 6 : 2.6) + level * 0.55;
        for (let i = 0; i < shown; i += 1) {
          const branch = branches[i]!;
          ctx.beginPath();
          let x = branch.x;
          let y = branch.y;
          ctx.moveTo(x, y);
          for (let k = 0; k < reach; k += 1) {
            const step = branch.steps[k]!;
            x += step.dx;
            y += step.dy;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(20,16,24,0.75)';
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, 6 + level * 5, 0, Math.PI * 2);
      ctx.fill();
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      crackTextures.push(texture);
    }
  }
  return crackTextures[index] ?? null;
};

/** The crack level a wall shows at a health fraction: none when whole, the deepest just before it falls. */
export const crackLevelFor = (fraction: number): number => {
  if (fraction >= 0.999) return 0;
  return Math.min(CRACK_LEVELS, 1 + Math.floor((1 - Math.max(0, fraction)) * CRACK_LEVELS));
};
