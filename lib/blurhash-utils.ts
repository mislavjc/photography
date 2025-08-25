// blurhash-utils.ts
// -----------------------------------------------------------------------------
// Shared utility for generating blurhashes with proper EXIF orientation handling

import { encode as blurhashEncode } from 'blurhash';
import { Effect } from 'effect';
import sharp from 'sharp';

/**
 * Generate a blurhash for an image file with proper EXIF orientation handling
 * @param file - Path to the image file
 * @param maxDim - Maximum dimension for the blurhash thumbnail (default: 64)
 * @returns Object containing blurhash, width, and height
 */
export const makeBlurhash = (file: string, maxDim: number = 64) =>
  Effect.tryPromise({
    try: async () => {
      // Load image with EXIF orientation auto-correction
      const image = sharp(file);

      // Get original metadata BEFORE rotation to see raw EXIF
      const rawMetadata = await image.metadata();
      const rawWidth = rawMetadata.width || 0;
      const rawHeight = rawMetadata.height || 0;
      const exifOrientation = rawMetadata.orientation || 1; // 1 = normal

      // Manually handle EXIF orientation by swapping dimensions if needed
      let correctedWidth = rawWidth;
      let correctedHeight = rawHeight;

      // EXIF orientation 8 = 90° clockwise = swap width and height
      if (exifOrientation === 8) {
        correctedWidth = rawHeight;
        correctedHeight = rawWidth;
      } else if (exifOrientation === 6) {
        // EXIF orientation 6 = 270° clockwise = swap width and height
        correctedWidth = rawHeight;
        correctedHeight = rawWidth;
      }
      // EXIF orientation 3 = 180° = dimensions stay the same

      // Use corrected dimensions for manifest
      const originalWidth = correctedWidth;
      const originalHeight = correctedHeight;

      if (exifOrientation !== 1) {
        console.log(
          `📐 EXIF correction: ${file} - Raw: ${rawWidth}x${rawHeight}, Corrected: ${correctedWidth}x${correctedHeight}, Orientation: ${exifOrientation}`,
        );
      }

      const { data, info } = await image
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
        w: originalWidth,
        h: originalHeight,
      };
    },
    catch: () => ({ blurhash: '', w: 0, h: 0 }),
  });
