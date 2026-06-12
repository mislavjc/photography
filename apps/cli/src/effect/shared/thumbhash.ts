import { Effect } from 'effect';
import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';
import { FastAverageColor } from 'fast-average-color';

// ----------------------- Color Utilities -----------------------
const fac = new FastAverageColor();

const toHex = (r: number, g: number, b: number) =>
  `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

// EXIF orientations 6/8 are 90° rotations: displayed dimensions are swapped
const orientationCorrectedDims = (meta: sharp.Metadata) => {
  const rawWidth = meta.width || 0;
  const rawHeight = meta.height || 0;
  const orientation = meta.orientation || 1;
  return orientation === 6 || orientation === 8
    ? { w: rawHeight, h: rawWidth }
    : { w: rawWidth, h: rawHeight };
};

// ----------------------- Dominant Colors -----------------------
export const extractDominantColors = (input: string | Buffer, maxColors = 5) =>
  Effect.tryPromise({
    try: async () => {
      const { data, info } = await sharp(input)
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
      console.error(`Error extracting dominant colors:`, error);
      return [];
    },
  });

// ----------------------- Image Dimensions -----------------------
export const getImageDimensions = (file: string) =>
  Effect.tryPromise({
    try: async () => {
      const meta = await sharp(file).metadata();
      return orientationCorrectedDims(meta);
    },
    catch: () => ({ w: 0, h: 0 }),
  });

// ----------------------- ThumbHash -----------------------
// ThumbHash requires the input image to be at most 100x100
const THUMBHASH_DIM_LIMIT = 100;

const encodeThumbhash = async (input: string | Buffer, maxDim: number) => {
  const img = sharp(input);
  const meta = await img.metadata();
  const { w, h } = orientationCorrectedDims(meta);

  const dim = Math.min(maxDim, THUMBHASH_DIM_LIMIT);
  const { data, info } = await img
    .clone()
    .rotate() // bake EXIF orientation so the hash matches the displayed image
    .resize({
      width: dim,
      height: dim,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const hash = rgbaToThumbHash(info.width, info.height, data);

  return {
    thumbhash: Buffer.from(hash).toString('base64'),
    w,
    h,
  };
};

export const makeThumbhash = (input: string | Buffer, maxDim: number = 100) =>
  Effect.tryPromise({
    try: () => encodeThumbhash(input, maxDim),
    catch: () => ({ thumbhash: '', w: 0, h: 0 }),
  });
