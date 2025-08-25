// blurhash-utils.ts
// -----------------------------------------------------------------------------
// Shared utility for generating blurhashes with proper EXIF orientation handling

import { encode as blurhashEncode } from 'blurhash';
import { Effect } from 'effect';
import sharp from 'sharp';

// Types for EXIF metadata extraction
interface SharpMetadata {
  width?: number;
  height?: number;
  orientation?: number;
  exif?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Extract comprehensive EXIF metadata from an image file
 * @param file - Path to the image file
 * @returns Object containing extracted EXIF metadata
 */
// Helper function to format shutter speed
const formatShutterSpeed = (exposureTime: number): string => {
  if (exposureTime >= 1) {
    return `${exposureTime}s`;
  } else if (exposureTime >= 0.1) {
    return `${(exposureTime * 10).toFixed(1)}s`;
  } else {
    const denominator = Math.round(1 / exposureTime);
    return `1/${denominator}s`;
  }
};

// Helper function to read EXIF rational values
const readRational = (buffer: Buffer, offset: number): number => {
  const numerator = buffer.readUInt32LE(offset);
  const denominator = buffer.readUInt32LE(offset + 4);
  return denominator > 0 ? numerator / denominator : 0;
};

// Helper function to parse EXIF IFD entry and get its value
const readExifTagValue = (
  buffer: Buffer,
  tagOffset: number,
  tiffOffset: number = 0,
): number | null => {
  try {
    // EXIF IFD entry format: Tag(2) + Type(2) + Count(4) + Value/Offset(4)
    const type = buffer.readUInt16LE(tagOffset + 2);
    const count = buffer.readUInt32LE(tagOffset + 4);
    const valueOffset = buffer.readUInt32LE(tagOffset + 8);

    // For rational values (type 5), the value is at the offset
    if (type === 5 && count === 1) {
      // Rational type
      const actualOffset = tiffOffset + valueOffset;
      if (actualOffset + 8 <= buffer.length) {
        return readRational(buffer, actualOffset);
      }
    }

    // For short values (type 3), value might be directly in the offset field
    if (type === 3 && count === 1 && valueOffset < 0x10000) {
      return valueOffset;
    }

    return null;
  } catch {
    return null;
  }
};

// Manual EXIF parser for key metadata fields
export const parseExifManually = (
  exifBuffer: Buffer,
): Partial<{
  make: string;
  model: string;
  lens: string;
  focalLength: number;
  fNumber: number;
  exposureTime: number;
  iso: number;
  dateTime: string;
  location: { latitude: number; longitude: number; altitude?: number };
}> => {
  const result: Record<string, unknown> = {};

  try {
    // Look for FUJIFILM camera data patterns in the buffer
    const fujifilmPattern = exifBuffer.indexOf(Buffer.from('FUJIFILM'));
    if (fujifilmPattern !== -1) {
      // Extract camera make (FUJIFILM)
      result.make = 'FUJIFILM';

      // Look for X100VI pattern
      const x100viPattern = exifBuffer.indexOf(Buffer.from('X100VI'));
      if (x100viPattern !== -1) {
        result.model = 'X100VI';
      }

      // Look for Digital Camera pattern
      const digitalCameraPattern = exifBuffer.indexOf(
        Buffer.from('Digital Camera'),
      );
      if (digitalCameraPattern !== -1) {
        // Extract the full camera model string
        const modelStart = digitalCameraPattern;
        const modelEnd = Math.min(modelStart + 50, exifBuffer.length);
        const modelData = exifBuffer.subarray(modelStart, modelEnd);
        const modelString = modelData
          .toString('ascii')
          .replace(/\0.*$/, '')
          .trim();
        if (modelString.includes('X100VI')) {
          result.model = 'X100VI';
        }
      }
    }

    // Look for date/time patterns (YYYY:MM:DD HH:MM:SS format)
    const datePattern = exifBuffer.indexOf(Buffer.from('2025:'));
    if (datePattern !== -1) {
      const dateStart = datePattern;
      const dateEnd = Math.min(dateStart + 30, exifBuffer.length);
      const dateData = exifBuffer.subarray(dateStart, dateEnd);
      const dateString = dateData.toString('ascii').replace(/\0.*$/, '').trim();
      if (dateString.match(/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/)) {
        // Convert EXIF date format to ISO format for JavaScript Date parsing
        // From: "2025:05:06 19:49:17" To: "2025-05-06T19:49:17"
        const parts = dateString.split(' ');
        const datePart = parts[0].replace(/:/g, '-');
        const timePart = parts[1];
        result.dateTime = `${datePart}T${timePart}`;
      }
    }

    // Look for focal length data (search for common focal lengths like 23, 35, 50, etc.)
    const focalLengths = [23, 35, 50, 85, 135];
    for (const fl of focalLengths) {
      const flPattern = exifBuffer.indexOf(Buffer.from(fl.toString()));
      if (flPattern !== -1) {
        // Check if this looks like focal length data (not part of other text)
        const contextStart = Math.max(0, flPattern - 10);
        const contextEnd = Math.min(flPattern + 15, exifBuffer.length);
        const context = exifBuffer
          .subarray(contextStart, contextEnd)
          .toString('ascii');

        // If it looks like focal length (followed by "mm" or in numeric context)
        if (context.includes('mm') || /^\d+$/.test(fl.toString())) {
          result.focalLength = fl;
          break;
        }
      }
    }

    // Look for ISO values (common ISO values like 100, 200, 400, 800, 1600, etc.)
    const isoValues = [100, 200, 400, 800, 1600, 3200, 6400];
    for (const iso of isoValues) {
      const isoPattern = exifBuffer.indexOf(Buffer.from(iso.toString()));
      if (isoPattern !== -1) {
        // Check context to make sure it's ISO data
        const contextStart = Math.max(0, isoPattern - 20);
        const contextEnd = Math.min(isoPattern + 20, exifBuffer.length);
        const context = exifBuffer
          .subarray(contextStart, contextEnd)
          .toString('ascii');

        // Look for ISO context clues
        if (
          context.includes('ISO') ||
          context.includes('iso') ||
          context.match(/[^\d]\d{3,4}[^\d]/)
        ) {
          result.iso = iso;
          break;
        }
      }
    }

    // Look for aperture values (F-numbers like f/2.8, f/4, f/5.6, etc.)
    const apertureValues = [1.4, 2.0, 2.8, 4.0, 5.6, 8.0, 11.0, 16.0];
    for (const aperture of apertureValues) {
      const aperturePattern = exifBuffer.indexOf(
        Buffer.from(aperture.toString()),
      );
      if (aperturePattern !== -1) {
        // Check for F-number context
        const contextStart = Math.max(0, aperturePattern - 15);
        const contextEnd = Math.min(aperturePattern + 15, exifBuffer.length);
        const context = exifBuffer
          .subarray(contextStart, contextEnd)
          .toString('ascii');

        if (
          context.includes('f/') ||
          context.includes('F/') ||
          context.match(/[^\d]\d+\.\d+[^\d]/)
        ) {
          result.fNumber = aperture;
          break;
        }
      }
    }

    // Look for shutter speed values (1/125, 1/250, etc.)
    const shutterSpeeds = [
      8000, 4000, 2000, 1000, 500, 250, 125, 60, 30, 15, 8, 4, 2, 1,
    ];
    for (const shutter of shutterSpeeds) {
      const shutterPattern = exifBuffer.indexOf(Buffer.from(`1/${shutter}`));
      if (shutterPattern !== -1) {
        result.exposureTime = 1.0 / shutter;
        break;
      }
    }

    // If no standard shutter speed found, look for other exposure time patterns
    if (!result.exposureTime) {
      // Look for patterns like "1/200" or "0.004" (4ms)
      const exposurePatterns = [
        exifBuffer.indexOf(Buffer.from('ExposureTime')),
        exifBuffer.indexOf(Buffer.from('ShutterSpeed')),
        exifBuffer.indexOf(Buffer.from('shutter')),
      ];

      for (const pattern of exposurePatterns) {
        if (pattern !== -1) {
          const searchStart = Math.max(0, pattern - 20);
          const searchEnd = Math.min(pattern + 50, exifBuffer.length);
          const exposureData = exifBuffer
            .subarray(searchStart, searchEnd)
            .toString('ascii');

          // Look for decimal exposure times like "0.004" or "1/125"
          const decimalMatch = exposureData.match(/(\d+\.?\d*)/);
          if (decimalMatch) {
            const exposureValue = parseFloat(decimalMatch[1]);
            if (exposureValue > 0 && exposureValue < 60) {
              // Reasonable exposure range
              result.exposureTime = exposureValue;
              break;
            }
          }

          // Look for fractional patterns like "1/125"
          const fractionMatch = exposureData.match(/(\d+)\/(\d+)/);
          if (fractionMatch) {
            const numerator = parseInt(fractionMatch[1]);
            const denominator = parseInt(fractionMatch[2]);
            if (numerator > 0 && denominator > 0) {
              result.exposureTime = numerator / denominator;
              break;
            }
          }
        }
      }
    }

    // Additional search for common shutter speeds in different formats
    if (!result.exposureTime) {
      // Look for exposure values around common GPS/exposure data areas
      const commonExposureValues = [
        0.0005, 0.001, 0.002, 0.004, 0.008, 0.0167, 0.0333, 0.0667, 0.125, 0.25,
        0.5, 1.0, 2.0, 4.0, 8.0,
      ];

      for (const exp of commonExposureValues) {
        const expPattern = exifBuffer.indexOf(Buffer.from(exp.toString()));
        if (expPattern !== -1) {
          // Verify this is actually an exposure time by checking context
          const contextStart = Math.max(0, expPattern - 15);
          const contextEnd = Math.min(expPattern + 20, exifBuffer.length);
          const context = exifBuffer
            .subarray(contextStart, contextEnd)
            .toString('ascii');

          // Look for exposure-related context clues
          if (
            context.includes('Exp') ||
            context.includes('exp') ||
            context.includes('sec') ||
            context.includes('time') ||
            context.match(/[^\d]\d+\.\d+[^\d]/)
          ) {
            result.exposureTime = exp;
            break;
          }
        }
      }
    }

    // Parse specific EXIF tags for shutter speed and aperture
    console.log('🔧 Parsing EXIF tags for shutter speed and aperture...');

    // Find TIFF header offset (usually 6 for little endian)
    const tiffHeaderOffset = exifBuffer.indexOf(
      Buffer.from([0x49, 0x49, 0x2a, 0x00]),
    );
    const tiffOffset = tiffHeaderOffset !== -1 ? tiffHeaderOffset : 0;

    // Parse ExposureTime tag (0x829A)
    const exposureTimeTag = exifBuffer.indexOf(Buffer.from([0x9a, 0x82]));
    if (exposureTimeTag !== -1) {
      const exposureValue = readExifTagValue(
        exifBuffer,
        exposureTimeTag,
        tiffOffset,
      );
      if (exposureValue !== null && exposureValue > 0) {
        result.exposureTime = exposureValue;
        console.log('✅ Found ExposureTime:', exposureValue);
      }
    }

    // Parse FNumber/Aperture tag (0x829D)
    const fNumberTag = exifBuffer.indexOf(Buffer.from([0x9d, 0x82]));
    if (fNumberTag !== -1) {
      const fNumberValue = readExifTagValue(exifBuffer, fNumberTag, tiffOffset);
      if (fNumberValue !== null && fNumberValue > 0) {
        result.fNumber = fNumberValue;
        console.log('✅ Found FNumber:', fNumberValue);
      }
    }

    // Parse ShutterSpeedValue tag (0x8827) as backup for exposure time
    const shutterSpeedTag = exifBuffer.indexOf(Buffer.from([0x27, 0x88]));
    if (shutterSpeedTag !== -1 && !result.exposureTime) {
      const shutterValue = readExifTagValue(
        exifBuffer,
        shutterSpeedTag,
        tiffOffset,
      );
      if (shutterValue !== null) {
        // ShutterSpeedValue is stored as APEX value, convert to exposure time
        result.exposureTime = Math.pow(2, -shutterValue);
        console.log(
          '✅ Found ShutterSpeedValue:',
          shutterValue,
          '-> Exposure:',
          result.exposureTime,
        );
      }
    }

    // Look for GPS coordinates (latitude and longitude)
    // GPS data in EXIF is stored as rational numbers, we need to parse the GPS IFD

    // First, try to find GPS data by looking for GPS tag patterns
    const gpsLatitudePattern = exifBuffer.indexOf(Buffer.from([0x02, 0x00])); // GPSLatitude tag
    const gpsLongitudePattern = exifBuffer.indexOf(Buffer.from([0x04, 0x00])); // GPSLongitude tag
    const gpsLatRefPattern = exifBuffer.indexOf(Buffer.from([0x01, 0x00])); // GPSLatitudeRef tag
    const gpsLongRefPattern = exifBuffer.indexOf(Buffer.from([0x03, 0x00])); // GPSLongitudeRef tag

    let latitude: number | null = null;
    let longitude: number | null = null;

    // Try to extract latitude
    if (gpsLatitudePattern !== -1) {
      // Look for the actual coordinate data near the GPS tag
      // GPS coordinates are stored as 3 rational numbers (degrees, minutes, seconds)
      const searchStart = Math.max(0, gpsLatitudePattern - 50);
      const searchEnd = Math.min(gpsLatitudePattern + 100, exifBuffer.length);

      // Look for patterns like degrees.minutes.seconds
      const latData = exifBuffer
        .subarray(searchStart, searchEnd)
        .toString('ascii');

      // Try to extract coordinate patterns like "40 42 15" or "40.7068"
      const coordMatch = latData.match(
        /(\d{1,3})[^\d]*(\d{1,2})[^\d]*(\d{1,2}(?:\.\d+)?)/,
      );
      if (coordMatch) {
        const degrees = parseInt(coordMatch[1]);
        const minutes = parseInt(coordMatch[2]);
        const seconds = parseFloat(coordMatch[3]);
        latitude = degrees + minutes / 60 + seconds / 3600;

        // Check latitude reference (N/S)
        if (gpsLatRefPattern !== -1) {
          const latRefStart = Math.max(0, gpsLatRefPattern + 10);
          const latRefData = exifBuffer
            .subarray(latRefStart, latRefStart + 5)
            .toString('ascii');
          if (latRefData.includes('S') || latRefData.includes('s')) {
            latitude = -latitude;
          }
        }
      }
    }

    // Try to extract longitude
    if (gpsLongitudePattern !== -1) {
      const searchStart = Math.max(0, gpsLongitudePattern - 50);
      const searchEnd = Math.min(gpsLongitudePattern + 100, exifBuffer.length);

      const longData = exifBuffer
        .subarray(searchStart, searchEnd)
        .toString('ascii');

      // Try to extract coordinate patterns
      const coordMatch = longData.match(
        /(\d{1,3})[^\d]*(\d{1,2})[^\d]*(\d{1,2}(?:\.\d+)?)/,
      );
      if (coordMatch) {
        const degrees = parseInt(coordMatch[1]);
        const minutes = parseInt(coordMatch[2]);
        const seconds = parseFloat(coordMatch[3]);
        longitude = degrees + minutes / 60 + seconds / 3600;

        // Check longitude reference (E/W)
        if (gpsLongRefPattern !== -1) {
          const longRefStart = Math.max(0, gpsLongRefPattern + 10);
          const longRefData = exifBuffer
            .subarray(longRefStart, longRefStart + 5)
            .toString('ascii');
          if (longRefData.includes('W') || longRefData.includes('w')) {
            longitude = -longitude;
          }
        }
      }
    }

    // If we have both coordinates, set the location
    if (
      latitude !== null &&
      longitude !== null &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      result.location = { latitude, longitude };
    }
  } catch (error) {
    console.log('Manual EXIF parsing error:', error);
  }

  return result;
};

export const extractExifMetadata = (file: string) =>
  Effect.tryPromise({
    try: async () => {
      const image = sharp(file);
      const rawMetadata = await image.metadata();
      const metadata = rawMetadata as unknown as SharpMetadata;

      let camera = null;
      let lens = null;
      let focalLength = null;
      let aperture = null;
      let shutterSpeed = null;
      let iso = null;
      let location = null;
      let dateTime = null;

      // Try manual EXIF parsing
      if (metadata.exif && Buffer.isBuffer(metadata.exif)) {
        const manualData = parseExifManually(metadata.exif);

        if (manualData.make && manualData.model) {
          camera = `${manualData.make} ${manualData.model}`;
        } else if (manualData.model) {
          camera = manualData.model;
        }

        lens = manualData.lens || null;
        focalLength = manualData.focalLength
          ? `${manualData.focalLength}mm`
          : null;
        aperture = manualData.fNumber ? `f/${manualData.fNumber}` : null;
        shutterSpeed = manualData.exposureTime
          ? formatShutterSpeed(manualData.exposureTime)
          : null;
        iso = manualData.iso ? `ISO ${manualData.iso}` : null;
        location = manualData.location || null;
        dateTime = manualData.dateTime || null;
      }

      return {
        camera,
        lens,
        focalLength,
        aperture,
        shutterSpeed,
        iso,
        location,
        dateTime,
      };
    },
    catch: (error) => {
      console.log(`Error extracting EXIF from ${file}:`, error);
      return {
        camera: null,
        lens: null,
        focalLength: null,
        aperture: null,
        shutterSpeed: null,
        iso: null,
        location: null,
        dateTime: null,
      };
    },
  });

/**
 * Generate a blurhash for an image file with proper EXIF orientation handling
 * @param file - Path to the image file
 * @param maxDim - Maximum dimension for the blurhash thumbnail (default: 64)
 * @returns Object containing blurhash, width, height, and EXIF metadata
 */
export const makeBlurhash = (file: string, maxDim: number = 64) =>
  Effect.tryPromise({
    try: async () => {
      // Load image with EXIF orientation auto-correction
      const image = sharp(file);

      // Get original metadata BEFORE rotation to see raw EXIF
      const rawMetadata = await image.metadata();
      const metadata = rawMetadata as unknown as SharpMetadata;
      const rawWidth = metadata.width || 0;
      const rawHeight = metadata.height || 0;
      const exifOrientation = metadata.orientation || 1; // 1 = normal

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

      // Extract EXIF metadata
      const exifMetadata = await extractExifMetadata(file).pipe(
        Effect.runPromise,
      );

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
        exif: exifMetadata,
      };
    },
    catch: () => ({ blurhash: '', w: 0, h: 0, exif: {} }),
  });
