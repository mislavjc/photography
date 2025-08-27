// manifest.ts
// -----------------------------------------------------------------------------
// Generate r2-manifest.json with blurhashes for images in ./images/
// Uploads manifest directly to R2 (remote only)

import path from 'node:path';

import { config } from 'dotenv';
import { Console, Effect, pipe } from 'effect';
import { exiftool, Tags } from 'exiftool-vendored';
import { FastAverageColor } from 'fast-average-color';
import fg from 'fast-glob';

import { makeBlurhash } from '../lib/blurhash-utils';

// Type for EXIF metadata
interface ExifMetadata {
  camera: string | null;
  lens: string | null;
  focalLength: string | null;
  aperture: string | null;
  shutterSpeed: string | null;
  iso: string | null;
  location: {
    latitude: number;
    longitude: number;
    altitude?: number;
  } | null;
  dateTime: string | null;
  dominantColors?: Array<{
    hex: string;
    rgb: { r: number; g: number; b: number };
    percentage: number;
  }>;
}

config({ path: '.env.local' });

// ----------------------- Config & Env -----------------------
const getConfig = Effect.gen(function* () {
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET = process.env.R2_BUCKET;
  const R2_PREFIX = process.env.R2_PREFIX || 'originals';
  const R2_VARIANTS_PREFIX = process.env.R2_VARIANTS_PREFIX || 'variants';
  const VERBOSE = (process.env.VERBOSE || 'false') === 'true';
  const BLURHASH_MAX = parseInt(process.env.BLURHASH_MAX || '64', 10);

  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET
  ) {
    return yield* Effect.fail(
      new Error(
        'Missing env vars. Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET',
      ),
    );
  }

  return {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PREFIX,
    R2_VARIANTS_PREFIX,
    VERBOSE,
    BLURHASH_MAX,
  };
});

// ----------------------- Helpers -----------------------
const cleanPrefix = (p: string) => p.replace(/^\/+|\/+$/g, '');

// ----------------------- BlurHash -----------------------
// Note: makeBlurhash is now imported from shared utility

// ----------------------- EXIF (exiftool) -----------------------
const formatAperture = (f?: number | string | null) =>
  f != null
    ? `f/${typeof f === 'number' ? f.toFixed(1).replace(/\.0$/, '') : f}`
    : null;

const formatShutter = (t?: string | number | null) => {
  if (t == null) return null;
  if (typeof t === 'string') return t; // exiftool often gives "1/500"
  if (t === 0) return '0s';
  if (t < 1) return `1/${Math.round(1 / t)}s`;
  return `${t}s`;
};

const formatFocal = (f?: number | string | null) =>
  f != null ? `${f} mm` : null;

const toNumber = (v: unknown) =>
  typeof v === 'number' ? v : v == null ? undefined : Number(v);

const readExif = (filePath: string) =>
  Effect.tryPromise<ExifMetadata, Error>({
    try: async () => {
      const t: Tags = await exiftool.read(filePath);
      const camera = [t.Make, t.Model].filter(Boolean).join(' ').trim() || null;

      const lens =
        (t.LensModel as string | undefined) ??
        (t.Lens as string | undefined) ??
        null;

      const focalLength = formatFocal(
        (t.FocalLength as number | string | undefined) ?? null,
      );

      const aperture = formatAperture(
        (t.FNumber as number | string | undefined) ?? null,
      );

      const shutterSpeed = formatShutter(
        (t.ShutterSpeed as string | undefined) ??
          (t.ExposureTime as number | undefined) ??
          null,
      );
      const iso = (t.ISO as number | string | undefined)?.toString() ?? null;

      const dateTime =
        t.DateTimeOriginal?.toString?.() ??
        t.CreateDate?.toString?.() ??
        t.ModifyDate?.toString?.() ??
        null;

      const lat = toNumber(t.GPSLatitude);
      const lon = toNumber(t.GPSLongitude);
      const alt = toNumber(t.GPSAltitude);

      const location =
        lat != null && lon != null
          ? { latitude: lat, longitude: lon, altitude: alt }
          : null;

      const exif: ExifMetadata = {
        camera,
        lens,
        focalLength,
        aperture,
        shutterSpeed,
        iso,
        location,
        dateTime,
        // dominantColors is appended later
      };

      return exif;
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

// Ensure exiftool child exits when program ends
const shutdownExiftool = Effect.tryPromise({
  try: async () => {
    await exiftool.end();
  },
  catch: () => undefined,
}).pipe(Effect.ignore);

// ----------------------- Dominant Colors -----------------------
const fac = new FastAverageColor();

const toHex = (r: number, g: number, b: number) =>
  `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

const extractDominantColors = (file: string, maxColors = 5) =>
  Effect.tryPromise({
    try: async () => {
      const sharp = (await import('sharp')).default;

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

      // data is already RGBA bytes
      const rgba = new Uint8ClampedArray(
        data.buffer,
        data.byteOffset,
        data.byteLength,
      );

      const [r, g, b] = fac.getColorFromArray4(rgba, {
        width: info.width,
        height: info.height,
        algorithm: 'dominant', // or 'sqrt' / 'simple'
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

// ----------------------- R2 Upload (for manifest only) -----------------------
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const putObject = (
  s3: S3Client,
  Bucket: string,
  Key: string,
  Body: Buffer,
  ContentType: string,
  Metadata?: Record<string, string>,
) =>
  Effect.tryPromise({
    try: () =>
      s3.send(
        new PutObjectCommand({
          Bucket,
          Key,
          Body,
          ContentType,
          CacheControl: 'public, max-age=31536000, immutable',
          Metadata,
        }),
      ),
    catch: (e) => new Error(`putObject failed for ${Key}: ${e}`),
  });

// ----------------------- Process single file -----------------------
const processFile = (
  file: string,
  manifest: Record<
    string,
    { blurhash: string; w: number; h: number; exif: ExifMetadata }
  >,
  maxDim: number,
  verbose: boolean,
) =>
  Effect.gen(function* () {
    const rel = path.relative('./images', file).split(path.sep).join('/');

    if (verbose) {
      yield* Console.log(`📸 Processing: ${rel}`);
    }

    // Generate blurhash
    const bh = yield* makeBlurhash(file, maxDim);

    // Read EXIF (exiftool)
    const exif = yield* readExif(file);

    // Dominant colors
    const dominantColors = yield* extractDominantColors(file, 5);

    if (bh.blurhash) {
      manifest[rel] = {
        blurhash: bh.blurhash,
        w: bh.w,
        h: bh.h,
        exif: {
          ...exif,
          dominantColors,
        },
      };
      if (verbose) {
        yield* Console.log(`  🎨 blurhash: ${bh.w}x${bh.h}`);
        if (dominantColors && dominantColors.length > 0) {
          yield* Console.log(`  🌈 dominant color: ${dominantColors[0].hex}`);
        }
      }
    } else {
      if (verbose) {
        yield* Console.log(`  ❌ Failed to generate blurhash for: ${rel}`);
      }
    }
  });

// ----------------------- Discover & Run -----------------------
const discoverFiles = Effect.gen(function* () {
  const SRC_DIR = './images';
  const exts = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff'];
  const patterns = exts.flatMap((e) => [
    `${SRC_DIR}/**/*.${e}`,
    `${SRC_DIR}/**/*.${e.toUpperCase()}`,
  ]);
  const files = yield* Effect.tryPromise({
    try: () => fg(patterns, { dot: false }),
    catch: (e) => new Error(`glob failed: ${e}`),
  });
  if (!files.length)
    return yield* Effect.fail(
      new Error(
        `No images found under ${SRC_DIR}. Supported: ${exts.join(', ')}`,
      ),
    );

  // For testing with one image, uncomment the line below
  // return [files[0]]; // Test with first image only

  return files;
});

const program = Effect.gen(function* () {
  const cfg = yield* getConfig;
  const files = yield* discoverFiles;

  yield* Console.log(
    `📁 Found ${files.length} files in ./images to process for manifest`,
  );

  if (cfg.VERBOSE) {
    yield* Console.log(`🔧 Configuration:`);
    yield* Console.log(`   BlurHash max dimension: ${cfg.BLURHASH_MAX}`);
  }

  const manifest: Record<
    string,
    {
      blurhash: string;
      w: number;
      h: number;
      exif: ExifMetadata;
      dominantColors?: Array<{
        hex: string;
        rgb: { r: number; g: number; b: number };
        percentage: number;
      }>;
    }
  > = {};

  // Process each file
  yield* Effect.all(
    files.map((f) => processFile(f, manifest, cfg.BLURHASH_MAX, cfg.VERBOSE)),
    { concurrency: 4 },
  );

  // Prepare manifest content
  const manifestContent = JSON.stringify(manifest, null, 2);

  // Upload manifest to R2 (remote only)
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.R2_ACCESS_KEY_ID,
      secretAccessKey: cfg.R2_SECRET_ACCESS_KEY,
    },
  });

  const manifestKey = `${cleanPrefix(cfg.R2_VARIANTS_PREFIX)}/r2-manifest.json`;
  yield* putObject(
    s3,
    cfg.R2_BUCKET,
    manifestKey,
    Buffer.from(manifestContent),
    'application/json',
  );

  yield* Console.log('');
  yield* Console.log(`✅ Manifest generation complete!`);
  yield* Console.log(`📁 Files processed: ${files.length}`);
  yield* Console.log(`📄 Manifest entries: ${Object.keys(manifest).length}`);
  yield* Console.log(`☁️  R2: ${cfg.R2_BUCKET}/${manifestKey}`);

  if (cfg.VERBOSE) {
    const sampleEntries = Object.entries(manifest).slice(0, 3);
    yield* Console.log(`📋 Sample entries:`);
    for (const [filename, data] of sampleEntries) {
      yield* Console.log(
        `   ${filename}: ${data.blurhash.substring(0, 20)}... (${data.w}x${data.h})`,
      );
      if (data.exif.dominantColors && data.exif.dominantColors.length > 0) {
        yield* Console.log(
          `   🌈 Colors: ${data.exif.dominantColors.map((c) => c.hex).join(', ')}`,
        );
      }
    }
  }
});

pipe(
  program.pipe(Effect.ensuring(shutdownExiftool)),
  Effect.catchAll((e) =>
    Effect.gen(function* () {
      const msg = e instanceof Error ? e.message : String(e);
      yield* Console.error(`Error: ${msg}`);
      yield* Effect.sync(() => process.exit(1));
    }),
  ),
).pipe(Effect.runPromise);
