import { DataTexture, NearestFilter, RedFormat, type Texture } from 'three';

let gradient: Texture | null = null;

/**
 * THE CEL-SHADING RAMP every fighter is lit through: three flat bands (shadow,
 * mid, light) instead of a smooth falloff - the hard-edged shading of anime,
 * on the same painted atlas. One tiny texture, shared.
 */
export const toonGradient = (): Texture => {
  if (!gradient) {
    const data = new Uint8Array([90, 170, 255]);
    const texture = new DataTexture(data, data.length, 1, RedFormat);
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    gradient = texture;
  }
  return gradient;
};
