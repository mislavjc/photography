import { encode as blurhashEncode } from 'blurhash';
import { Effect } from 'effect';
import { FastAverageColor } from 'fast-average-color';
import sharp from 'sharp';

// ----------------------- Color Utilities -----------------------
const fac = new FastAverageColor();

export const toHex = (r: number, g: number, b: number) =>
  `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

// ----------------------- Dominant Colors -----------------------
export const extractDominantColors = (file: string, maxColors = 5) =>
  Effect.tryPromise({
    try: async () => {
      const { data, info } = await sharp(file)
        .resize({
          width: 200,
          height: 200,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const rgba = new Uint8ClampedArray(
        data.buffer,
        data.byteOffset,
        data.byteLength,
      );
      const [r, g, b] = fac.getColorFromArray4(rgba, {
        width: info.width,
        height: info.height,
        algorithm: 'dominant',
      });
      const hex = toHex(r, g, b);
      return [
        {
          hex,
          rgb: { r, g, b },
          percentage: 100,
        },
      ].slice(0, maxColors);
    },
    catch: (error) => {
      console.error(`Error extracting dominant colors from ${file}:`, error);
      return [];
    },
  });

// Extract from buffer instead of file
export const extractDominantColorsFromBuffer = (
  buffer: Buffer,
  maxColors = 5,
) =>
  Effect.tryPromise({
    try: async () => {
      const { data, info } = await sharp(buffer)
        .resize({
          width: 200,
          height: 200,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const rgba = new Uint8ClampedArray(
        data.buffer,
        data.byteOffset,
        data.byteLength,
      );
      const [r, g, b] = fac.getColorFromArray4(rgba, {
        width: info.width,
        height: info.height,
        algorithm: 'dominant',
      });
      const hex = toHex(r, g, b);
      return [
        {
          hex,
          rgb: { r, g, b },
          percentage: 100,
        },
      ].slice(0, maxColors);
    },
    catch: (error) => {
      console.error(`Error extracting dominant colors from buffer:`, error);
      return [];
    },
  });

// ----------------------- Image Dimensions -----------------------
export const getImageDimensions = (file: string) =>
  Effect.tryPromise({
    try: async () => {
      const img = sharp(file);
      const meta = await img.metadata();
      const rawWidth = meta.width || 0;
      const rawHeight = meta.height || 0;
      const exifOrientation = meta.orientation || 1;

      let correctedWidth = rawWidth;
      let correctedHeight = rawHeight;
      if (exifOrientation === 8 || exifOrientation === 6) {
        correctedWidth = rawHeight;
        correctedHeight = rawWidth;
      }

      return { w: correctedWidth, h: correctedHeight };
    },
    catch: () => ({ w: 0, h: 0 }),
  });

// ----------------------- Blurhash -----------------------
export const makeBlurhash = (file: string, maxDim: number = 64) =>
  Effect.tryPromise({
    try: async () => {
      const img = sharp(file);
      const meta = await img.metadata();
      const rawWidth = meta.width || 0;
      const rawHeight = meta.height || 0;
      const exifOrientation = meta.orientation || 1;

      let correctedWidth = rawWidth;
      let correctedHeight = rawHeight;
      if (exifOrientation === 8 || exifOrientation === 6) {
        correctedWidth = rawHeight;
        correctedHeight = rawWidth;
      }

      const { data, info } = await img
        .clone()
        .resize({
          width: maxDim,
          height: maxDim,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixels = new Uint8ClampedArray(data);
      const hash = blurhashEncode(pixels, info.width, info.height, 4, 3);

      return {
        blurhash: hash,
        w: correctedWidth,
        h: correctedHeight,
      };
    },
    catch: () => ({ blurhash: '', w: 0, h: 0 }),
  });

// Generate blurhash from buffer
export const makeBlurhashFromBuffer = (buffer: Buffer, maxDim: number = 64) =>
  Effect.tryPromise({
    try: async () => {
      const img = sharp(buffer);
      const meta = await img.metadata();
      const rawWidth = meta.width || 0;
      const rawHeight = meta.height || 0;
      const exifOrientation = meta.orientation || 1;

      let correctedWidth = rawWidth;
      let correctedHeight = rawHeight;
      if (exifOrientation === 8 || exifOrientation === 6) {
        correctedWidth = rawHeight;
        correctedHeight = rawWidth;
      }

      const { data, info } = await img
        .clone()
        .resize({
          width: maxDim,
          height: maxDim,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixels = new Uint8ClampedArray(data);
      const hash = blurhashEncode(pixels, info.width, info.height, 4, 3);

      return {
        blurhash: hash,
        w: correctedWidth,
        h: correctedHeight,
      };
    },
    catch: () => ({ blurhash: '', w: 0, h: 0 }),
  });
