import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { groq } from '@ai-sdk/groq';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { generateText } from 'ai';
import { encode as blurhashEncode } from 'blurhash';
import { config } from 'dotenv';
import { Console, Effect, pipe, Schedule } from 'effect';
import { exiftool, Tags } from 'exiftool-vendored';
import { FastAverageColor } from 'fast-average-color';
import fg from 'fast-glob';
import mime from 'mime-types';
import sharp from 'sharp';
import zlib from 'zlib';

// ----------------------- Types -----------------------
interface ExifLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
}
interface ExifMetadata {
  camera: string | null;
  lens: string | null;
  focalLength: string | null;
  aperture: string | null;
  shutterSpeed: string | null;
  iso: string | null;
  location: ExifLocation | null;
  dateTime: string | null;
  dominantColors?: Array<{
    hex: string;
    rgb: { r: number; g: number; b: number };
    percentage: number;
  }>;
}
type Formats = 'avif' | 'webp' | 'jpeg';
type ProfileName = 'grid' | 'large';

// ----------------------- Env -----------------------
config({ path: '.env.local' });

const getConfig = Effect.gen(function* () {
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET = process.env.R2_BUCKET;
  const R2_PREFIX = process.env.R2_PREFIX || 'originals';
  const R2_VARIANTS_PREFIX = process.env.R2_VARIANTS_PREFIX || 'variants';
  const CONCURRENCY = parseInt(process.env.CONCURRENCY || '4', 10);
  const FORMATS = (process.env.FORMATS || 'avif,webp,jpeg')
    .split(',')
    .map((s) => s.trim().toLowerCase() as Formats);
  const Q_AVIF = parseInt(process.env.Q_AVIF || '50', 10);
  const Q_WEBP = parseInt(process.env.Q_WEBP || '78', 10);
  const Q_JPEG = parseInt(process.env.Q_JPEG || '78', 10);
  const PRESERVE_METADATA =
    (process.env.PRESERVE_METADATA || 'true') === 'true';
  const GEN_BLURHASH = (process.env.GEN_BLURHASH || 'true') === 'true';
  const BLURHASH_MAX = parseInt(process.env.BLURHASH_MAX || '64', 10);
  const GEN_AI_DESCRIPTIONS =
    (process.env.GEN_AI_DESCRIPTIONS || 'false') === 'true';
  const VERBOSE = (process.env.VERBOSE || 'false') === 'true';

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

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  // Variant profiles
  const GRID_WIDTHS = [160, 240, 320, 480, 640, 800, 960] as const;
  const LARGE_WIDTHS = [
    256, 384, 512, 768, 1024, 1280, 1536, 1920, 2560,
  ] as const;

  const PROFILES: { name: ProfileName; widths: readonly number[] }[] = [
    { name: 'grid', widths: GRID_WIDTHS },
    { name: 'large', widths: LARGE_WIDTHS },
  ];

  return {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PREFIX,
    R2_VARIANTS_PREFIX,
    CONCURRENCY,
    FORMATS,
    Q_AVIF,
    Q_WEBP,
    Q_JPEG,
    PRESERVE_METADATA,
    GEN_BLURHASH,
    BLURHASH_MAX,
    GEN_AI_DESCRIPTIONS,
    VERBOSE,
    s3,
    PROFILES,
  };
});

// ----------------------- Helpers -----------------------
const cleanPrefix = (p: string) => p.replace(/^\/+|\/+$/g, '');

const sha256File = (file: string) =>
  Effect.tryPromise<string, Error>({
    try: () =>
      new Promise<string>((resolve, reject) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(file)
          .on('data', (d) => h.update(d))
          .on('end', () => resolve(h.digest('hex')))
          .on('error', reject);
      }),
    catch: (e) => new Error(`SHA256 failed for ${file}: ${e}`),
  });

const statFile = (file: string) =>
  Effect.tryPromise<fs.Stats, Error>({
    try: () => fs.promises.stat(file),
    catch: (e) => new Error(`stat failed for ${file}: ${e}`),
  });

const headObject = (s3: S3Client, Bucket: string, Key: string) =>
  Effect.tryPromise({
    try: () => s3.send(new HeadObjectCommand({ Bucket, Key })),
    catch: () => new Error('notfound'),
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

const putObject = (
  s3: S3Client,
  Bucket: string,
  Key: string,
  Body: Buffer | fs.ReadStream,
  ContentType: string,
  Metadata?: Record<string, string>,
  options?: { contentEncoding?: string; cacheControl?: string },
) =>
  Effect.tryPromise({
    try: () =>
      s3.send(
        new PutObjectCommand({
          Bucket,
          Key,
          Body,
          ContentType,
          CacheControl:
            options?.cacheControl || 'public, max-age=31536000, immutable',
          Metadata,
          ...(options?.contentEncoding && {
            ContentEncoding: options.contentEncoding,
          }),
        }),
      ),
    catch: (e) => new Error(`putObject failed for ${Key}: ${e}`),
  });

const putSentinel = (s3: S3Client, Bucket: string, hash: string, key: string) =>
  putObject(s3, Bucket, `dedup/${hash}`, Buffer.from(''), 'text/plain', {
    sha256: hash,
    key,
  });

/** Determine extension (preserve original). Defaults to .jpg if missing. */
const getExt = (file: string) =>
  ((path.extname(file) || '').toLowerCase() || '.jpg') as string;

/** Build a deterministic UUIDv7 from (timestampMs, sha256). */
function uuidv7FromHash(tsMs: number, hash: Buffer): string {
  const h =
    hash.length >= 16
      ? hash
      : crypto.createHash('sha256').update(hash).digest();
  const ts =
    BigInt(Math.max(0, Math.floor(tsMs))) &
    (BigInt(1) << (BigInt(48) - BigInt(1))); // 48-bit
  const bytes = Buffer.alloc(16);

  // timestamp (ms) big-endian
  bytes[0] = Number((ts >> BigInt(40)) & BigInt(0xff));
  bytes[1] = Number((ts >> BigInt(32)) & BigInt(0xff));
  bytes[2] = Number((ts >> BigInt(24)) & BigInt(0xff));
  bytes[3] = Number((ts >> BigInt(16)) & BigInt(0xff));
  bytes[4] = Number((ts >> BigInt(8)) & BigInt(0xff));
  bytes[5] = Number(ts & BigInt(0xff));

  // version 7 + 12 bits rand
  const randA = ((h[0] << 8) | h[1]) & 0x0fff;
  bytes[6] = 0x70 | ((randA >> 8) & 0x0f);
  bytes[7] = randA & 0xff;

  // variant + 62 bits rand
  const rb = Buffer.from(h.slice(2, 10)); // 8 bytes
  bytes[8] = (rb[0] & 0x3f) | 0x80; // 10xxxxxx
  bytes[9] = rb[1];
  bytes[10] = rb[2];
  bytes[11] = rb[3];
  bytes[12] = rb[4];
  bytes[13] = rb[5];
  bytes[14] = rb[6];
  bytes[15] = rb[7];

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const fileTimestampMs = (st: fs.Stats, exifDate?: string | null) => {
  // Prefer EXIF (DateTimeOriginal/CreateDate/ModifyDate) if parseable
  if (exifDate) {
    const d = new Date(exifDate);
    const t = d.getTime();
    if (!Number.isNaN(t) && t > 0) return t;
  }
  return Math.floor(st.mtimeMs || Date.now());
};

// ----------------------- EXIF (exiftool) -----------------------
const formatAperture = (f?: number | string | null) =>
  f != null
    ? `f/${typeof f === 'number' ? f.toFixed(1).replace(/\.0$/, '') : f}`
    : null;

const formatShutter = (t?: string | number | null) => {
  if (t == null) return null;
  if (typeof t === 'string') return t;
  if (t === 0) return '0s';
  if (t < 1) return `1/${Math.round(1 / t)}s`;
  return `${t}s`;
};

const formatFocal = (f?: number | string | null) => {
  if (f == null) return null;
  const str = String(f).trim();
  // If it already contains 'mm', return as-is
  if (str.toLowerCase().includes('mm')) return str;
  // Otherwise add 'mm'
  return `${str} mm`;
};

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

// ----------------------- Blurhash + Dominant Color -----------------------
const fac = new FastAverageColor();

const toHex = (r: number, g: number, b: number) =>
  `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

const extractDominantColors = (file: string, maxColors = 5) =>
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

const makeBlurhash = (file: string, maxDim: number = 64) =>
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

// ----------------------- Compression helpers -----------------------
const compressManifest = (buf: Buffer) =>
  Effect.tryPromise<{ compressed: Buffer; encoding: 'br' | 'gzip' }, Error>({
    try: async () => {
      const tryBr = () =>
        new Promise<Buffer>((res, rej) =>
          zlib.brotliCompress(
            buf,
            {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
                [zlib.constants.BROTLI_PARAM_MODE]:
                  zlib.constants.BROTLI_MODE_TEXT,
              },
            },
            (e, out) => (e ? rej(e) : res(out)),
          ),
        );

      const doGzip = () =>
        new Promise<Buffer>((res, rej) =>
          zlib.gzip(
            buf,
            { level: zlib.constants.Z_BEST_COMPRESSION },
            (e, out) => (e ? rej(e) : res(out)),
          ),
        );

      // Prefer brotli, fallback to gzip
      try {
        return { compressed: await tryBr(), encoding: 'br' as const };
      } catch {
        return { compressed: await doGzip(), encoding: 'gzip' as const };
      }
    },
    catch: (e) => new Error(`Compression failed: ${e}`),
  });

// ----------------------- AI helpers -----------------------
const readBuffer = (p: string) =>
  Effect.tryPromise<Buffer, Error>({
    try: async () => await fsp.readFile(p),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

const makePreviewJpeg = (buf: Buffer) =>
  Effect.tryPromise<Buffer, Error>({
    try: async () =>
      await sharp(buf)
        .rotate()
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer(),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

const buildPromptFromManifest = (
  entry:
    | {
        blurhash: string;
        w: number;
        h: number;
        exif: ExifMetadata;
        description?: string;
      }
    | undefined,
  tags: Tags,
) => {
  const exif: ExifMetadata = entry?.exif || {
    camera: null,
    lens: null,
    focalLength: null,
    aperture: null,
    shutterSpeed: null,
    iso: null,
    location: null,
    dateTime: null,
  };

  return `
You are a professional photographer and photo critic. Write a rich, detailed description of this photograph as if you're describing it for a gallery exhibition or photography portfolio.

Focus on:
- What you see in the image (subjects, setting, composition)
- The mood and atmosphere
- Lighting and technical qualities
- Your artistic interpretation

Write 2-4 sentences that paint a vivid picture. Start with "A photo of..." and make it evocative and descriptive.

${
  exif.location?.latitude && exif.location?.longitude
    ? `Location: Approximate coordinates available.`
    : 'Location: Unknown.'
}
Technical: ${JSON.stringify(
    {
      Camera:
        exif.camera ??
        (tags as unknown as { Model: string; Make: string }).Model ??
        (tags as unknown as { LensModel: string; Lens: string }).LensModel,
      Lens:
        exif.lens ??
        (tags as unknown as { LensModel: string; Lens: string }).LensModel ??
        (tags as unknown as { Lens: string }).Lens,
      FNumber:
        exif.aperture ?? (tags as unknown as { FNumber: string }).FNumber,
      ISO: exif.iso ?? (tags as unknown as { ISO: string }).ISO,
      Shutter:
        exif.shutterSpeed ??
        (tags as unknown as { ShutterSpeed: string }).ShutterSpeed ??
        tags.ExposureTime,
      DateTime:
        exif.dateTime ??
        (tags as unknown as { DateTimeOriginal: string }).DateTimeOriginal ??
        tags.CreateDate ??
        tags.ModifyDate,
    },
    null,
    2,
  )}`;
};

const analyzeWithAI = (imageBuf: Buffer, prompt: string) =>
  Effect.retry(
    Effect.tryPromise<{ text: string }, Error>({
      try: async () =>
        await generateText({
          model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', image: imageBuf, mediaType: 'image/jpeg' },
                { type: 'text', text: prompt },
              ],
            },
          ],
        }),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }),
    Schedule.recurs(2), // 3 total attempts
  );

// ----------------------- Variants -----------------------
const buildVariants = (
  file: string,
  widths: number[],
  fmts: Formats[],
  q: { Q_AVIF: number; Q_WEBP: number; Q_JPEG: number },
  preserveMetadata: boolean,
) =>
  Effect.tryPromise<Record<string, Buffer>, Error>({
    try: async () => {
      const res: Record<string, Buffer> = {};
      const base = sharp(file).rotate();

      for (const w of widths) {
        const resized = base
          .clone()
          .resize({ width: w, withoutEnlargement: true });
        if (preserveMetadata) resized.withMetadata();

        for (const f of fmts) {
          if (f === 'avif')
            res[`avif:${w}`] = await resized
              .clone()
              .avif({ quality: q.Q_AVIF })
              .toBuffer();
          else if (f === 'webp')
            res[`webp:${w}`] = await resized
              .clone()
              .webp({ quality: q.Q_WEBP })
              .toBuffer();
          else
            res[`jpeg:${w}`] = await resized
              .clone()
              .jpeg({ quality: q.Q_JPEG, mozjpeg: true })
              .toBuffer();
        }
      }
      return res;
    },
    catch: (e) => new Error(`buildVariants failed for ${file}: ${e}`),
  });

// ----------------------- Keys -----------------------
const toOrigKeyUsingUuid = (uuid: string, ext: string, prefix: string) => {
  const pr = cleanPrefix(prefix);
  const name = `${uuid}${ext}`;
  return pr ? `${pr}/${name}` : name;
};

const toVariantKey = (
  uuidBase: string,
  variantsPrefix: string,
  profile: ProfileName,
  fmt: string,
  w: number,
  extForFmt: string,
) => {
  const pr = cleanPrefix(variantsPrefix);
  return `${pr}/${profile}/${fmt}/${w}/${uuidBase}${extForFmt}`;
};

// ----------------------- Discover -----------------------
const discoverFiles = Effect.gen(function* () {
  const SRC_DIR = (process.argv[2] || './images').replace(/\/$/, '');
  const isManifestOnly =
    process.argv.includes('--manifest-only') ||
    process.argv.includes('--regenerate-manifest');
  const exts = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff'];
  const patterns = exts.flatMap((e) => [
    `${SRC_DIR}/**/*.${e}`,
    `${SRC_DIR}/**/*.${e.toUpperCase()}`,
  ]);
  const allFiles = yield* Effect.tryPromise({
    try: () => fg(patterns, { dot: false }),
    catch: (e) => new Error(`glob failed: ${e}`),
  });
  if (!allFiles.length)
    return yield* Effect.fail(
      new Error(`No images found. Supported: ${exts.join(', ')}`),
    );

  return { SRC_DIR, files: allFiles, isManifestOnly };
});

// ----------------------- Progress -----------------------
const createProgressTracker = (total: number) => {
  let completed = 0;
  const update = () => {
    completed++;
    const pct = Math.round((completed / total) * 100);
    const bar =
      '█'.repeat(Math.floor(pct / 2)) + '░'.repeat(50 - Math.floor(pct / 2));
    process.stdout.write('\r');
    process.stdout.write(`Progress: [${bar}] ${completed}/${total} (${pct}%)`);
    if (completed === total) process.stdout.write('\n');
  };
  return { update, getCompleted: () => completed };
};

// ----------------------- Main pipeline per file -----------------------
const program = Effect.gen(function* () {
  const cfg = yield* getConfig;
  const { SRC_DIR, files, isManifestOnly } = yield* discoverFiles;

  const modeMessage = isManifestOnly ? 'Manifest regeneration' : 'Upload';
  yield* Console.log(
    `${modeMessage} from ${SRC_DIR} → s3://${cfg.R2_BUCKET}/{${cfg.R2_PREFIX}, ${cfg.R2_VARIANTS_PREFIX}}`,
  );
  yield* Console.log(
    `Found ${files.length} files | concurrency ${cfg.CONCURRENCY}`,
  );

  if (isManifestOnly) {
    yield* Console.log(
      `📋 Manifest-only mode: will verify ALL originals AND variants exist in R2 before regenerating`,
    );
  }

  if (cfg.VERBOSE) {
    yield* Console.log(`🔧 Config:`);
    yield* Console.log(`   Formats: ${cfg.FORMATS.join(', ')}`);
    yield* Console.log(
      `   Q (AVIF/WebP/JPEG): ${cfg.Q_AVIF}/${cfg.Q_WEBP}/${cfg.Q_JPEG}`,
    );
    yield* Console.log(
      `   Preserve metadata on variants: ${cfg.PRESERVE_METADATA ? 'yes' : 'no'}`,
    );
    yield* Console.log(
      `   BlurHash: ${cfg.GEN_BLURHASH ? 'enabled' : 'disabled'} (max ${cfg.BLURHASH_MAX})`,
    );
    yield* Console.log(
      `   AI Descriptions: ${cfg.GEN_AI_DESCRIPTIONS ? 'enabled' : 'disabled'}`,
    );
  }

  const progress = createProgressTracker(files.length);

  // Manifest keyed by uuidv7 filename (with extension!)
  const manifest: Record<
    string,
    {
      blurhash: string;
      w: number;
      h: number;
      exif: ExifMetadata;
      description?: string;
    }
  > = {};

  const t0 = Date.now();

  yield* Effect.all(
    files.map((file) =>
      Effect.gen(function* () {
        const ext = getExt(file);

        // Read EXIF early to get timestamp preference
        const exif = yield* readExif(file).pipe(
          Effect.catchAll(() =>
            Effect.succeed<ExifMetadata>({
              camera: null,
              lens: null,
              focalLength: null,
              aperture: null,
              shutterSpeed: null,
              iso: null,
              location: null,
              dateTime: null,
            }),
          ),
        );

        const st = yield* statFile(file);
        const hashHex = yield* sha256File(file);
        const hashBuf = Buffer.from(hashHex, 'hex');

        const tsMs = fileTimestampMs(st, exif.dateTime);
        const uuid = uuidv7FromHash(tsMs, hashBuf);
        const uuidBase = uuid;

        // Dedupe sentinel on content hash
        const sentinel = yield* headObject(
          cfg.s3,
          cfg.R2_BUCKET,
          `dedup/${hashHex}`,
        );
        const origKey = toOrigKeyUsingUuid(uuid, ext, cfg.R2_PREFIX);

        if (isManifestOnly) {
          // In manifest-only mode, verify original exists in R2
          const head = yield* headObject(cfg.s3, cfg.R2_BUCKET, origKey);
          if (!head) {
            yield* Effect.fail(
              new Error(
                `Original image missing in R2: ${origKey} (file: ${file})`,
              ),
            );
          }
          if (cfg.VERBOSE) {
            yield* Console.log(`✓ verified: ${origKey}`);
          }
        } else {
          // Original upload logic (only in upload mode)
          if (!sentinel) {
            // Upload original if not present (or size differs)
            const head = yield* headObject(cfg.s3, cfg.R2_BUCKET, origKey);
            if (head && Number(head?.ContentLength) === st.size) {
              // already there
            } else {
              const ContentType =
                mime.lookup(file) || 'application/octet-stream';
              yield* Effect.tryPromise({
                try: () => {
                  const up = new Upload({
                    client: cfg.s3,
                    params: {
                      Bucket: cfg.R2_BUCKET,
                      Key: origKey,
                      Body: fs.createReadStream(file),
                      ContentType,
                      CacheControl: 'public, max-age=31536000, immutable',
                      Metadata: { sha256: hashHex },
                    },
                    queueSize: 4,
                    partSize: 8 * 1024 * 1024,
                    leavePartsOnError: false,
                  });
                  return up.done();
                },
                catch: (e) => new Error(`upload failed for ${file}: ${e}`),
              });
            }
            yield* putSentinel(cfg.s3, cfg.R2_BUCKET, hashHex, origKey);
            if (cfg.VERBOSE) yield* Console.log(`+ original: ${origKey}`);
          } else if (cfg.VERBOSE) {
            yield* Console.log(
              `= duplicate: ${file} (hash ${hashHex.slice(0, 8)}...)`,
            );
          }
        }

        // Variants: probe everything needed
        type Need = {
          profile: ProfileName;
          fmt: Formats;
          w: number;
          key: string;
        };
        const needed: Need[] = [];
        for (const { name: profile, widths } of cfg.PROFILES) {
          for (const w of widths) {
            for (const fmt of cfg.FORMATS) {
              const key = toVariantKey(
                uuidBase,
                cfg.R2_VARIANTS_PREFIX,
                profile,
                fmt,
                w,
                `.${fmt}`,
              );
              const exists = yield* headObject(cfg.s3, cfg.R2_BUCKET, key);
              if (!exists) needed.push({ profile, fmt, w, key });
            }
          }
        }

        if (!isManifestOnly && needed.length) {
          // Only generate variants in upload mode
          const uniqueWidths = Array.from(new Set(needed.map((n) => n.w))).sort(
            (a, b) => a - b,
          );
          const buffers = yield* buildVariants(
            file,
            uniqueWidths,
            cfg.FORMATS,
            { Q_AVIF: cfg.Q_AVIF, Q_WEBP: cfg.Q_WEBP, Q_JPEG: cfg.Q_JPEG },
            cfg.PRESERVE_METADATA,
          );
          for (const { fmt, w, key } of needed) {
            const buf = buffers[`${fmt}:${w}`];
            const ct = mime.lookup(key) || 'application/octet-stream';
            yield* putObject(cfg.s3, cfg.R2_BUCKET, key, buf, ct);
            if (cfg.VERBOSE)
              yield* Console.log(`  ↳ ${fmt}@${w}: ${key} (${buf.length} B)`);
          }
        } else if (isManifestOnly && needed.length > 0) {
          // In manifest-only mode, fail if any variants are missing
          const missingVariants = needed
            .map((n) => `${n.fmt}@${n.w}`)
            .join(', ');
          yield* Effect.fail(
            new Error(
              `Missing variants for ${file}: ${missingVariants} (${needed.length} total missing)`,
            ),
          );
        } else if (isManifestOnly && cfg.VERBOSE) {
          // All variants verified successfully
          yield* Console.log(`✓ all variants verified`);
        }

        // Manifest entry (UUID filename as key) - always do this
        if (cfg.GEN_BLURHASH) {
          const bh = yield* makeBlurhash(file, cfg.BLURHASH_MAX);
          const dominantColors = yield* extractDominantColors(file, 5);
          const exifForManifest: ExifMetadata = { ...exif, dominantColors };
          manifest[`${uuid}${ext}`] = {
            blurhash: bh.blurhash,
            w: bh.w,
            h: bh.h,
            exif: exifForManifest,
          };
          if (cfg.VERBOSE) {
            yield* Console.log(`  🎨 blurhash: ${bh.w}x${bh.h}`);
            if (dominantColors?.[0]) {
              yield* Console.log(`  🌈 color: ${dominantColors[0].hex}`);
            }
          }
        }

        progress.update();
      }),
    ),
    { concurrency: cfg.CONCURRENCY },
  );

  // Generate AI descriptions if enabled
  if (cfg.GEN_AI_DESCRIPTIONS && cfg.GEN_BLURHASH) {
    yield* Console.log(`\n🤖 Generating AI descriptions...`);

    // Process files for AI descriptions (reuse files array and EXIF data)
    const aiProgress = createProgressTracker(Object.keys(manifest).length);
    let aiProcessed = 0;

    yield* Effect.all(
      files.map((file) =>
        Effect.gen(function* () {
          const ext = getExt(file);

          // Recompute UUID to match manifest key
          const st = yield* statFile(file);
          const exif = yield* readExif(file).pipe(
            Effect.catchAll(() =>
              Effect.succeed<ExifMetadata>({
                camera: null,
                lens: null,
                focalLength: null,
                aperture: null,
                shutterSpeed: null,
                iso: null,
                location: null,
                dateTime: null,
              }),
            ),
          );
          const hashHex = yield* sha256File(file);
          const hashBuf = Buffer.from(hashHex, 'hex');
          const tsMs = fileTimestampMs(st, exif.dateTime);
          const uuid = uuidv7FromHash(tsMs, hashBuf);
          const key = `${uuid}${ext}`;

          const entry = manifest[key];
          if (!entry || entry.description) {
            // Skip if no entry or already has description
            aiProgress.update();
            return;
          }

          try {
            // Generate AI description
            const tags = yield* Effect.tryPromise<Tags, Error>({
              try: () => exiftool.read(file),
              catch: (e) => (e instanceof Error ? e : new Error(String(e))),
            }).pipe(Effect.catchAll(() => Effect.succeed({} as Tags)));

            const buf = yield* readBuffer(file);
            const preview = yield* makePreviewJpeg(buf);
            const prompt = buildPromptFromManifest(entry, tags);
            const { text } = yield* analyzeWithAI(preview, prompt);
            const description = text.trim();

            // Update manifest entry with description
            entry.description = description;

            if (cfg.VERBOSE) {
              yield* Console.log(
                `\n— ${path.basename(file)} → ${key}\n${description}\n`,
              );
            }
          } catch (error) {
            if (cfg.VERBOSE) {
              yield* Console.log(
                `⚠️  Failed to generate description for ${path.basename(file)}: ${error}`,
              );
            }
          }

          aiProgress.update();
          aiProcessed++;
        }),
      ),
      { concurrency: Math.min(cfg.CONCURRENCY, 2) }, // Lower concurrency for AI to avoid rate limits
    );

    yield* Console.log(
      `\n🤖 AI descriptions generated: ${aiProcessed} files processed`,
    );
  }

  // Upload manifest (compressed)
  if (cfg.GEN_BLURHASH) {
    const manifestContent = JSON.stringify(manifest, null, 2);
    const manifestBuffer = Buffer.from(manifestContent);
    const manifestKey = `${cleanPrefix(cfg.R2_VARIANTS_PREFIX)}/r2-manifest.json`;

    // Compress manifest
    const { compressed: compressedManifest, encoding } =
      yield* compressManifest(manifestBuffer);
    const originalSizeKB = (manifestBuffer.length / 1024).toFixed(1);
    const compressedSizeKB = (compressedManifest.length / 1024).toFixed(1);
    const compressionRatio = (
      (compressedManifest.length / manifestBuffer.length) *
      100
    ).toFixed(1);

    // Upload compressed manifest
    yield* putObject(
      cfg.s3,
      cfg.R2_BUCKET,
      manifestKey,
      compressedManifest,
      'application/json',
      {
        'original-size': manifestBuffer.length.toString(),
        'compressed-size': compressedManifest.length.toString(),
        'compression-encoding': encoding,
      },
      {
        contentEncoding: encoding,
        cacheControl: 'public, max-age=300, s-maxage=300', // 5 minutes for manifest
      },
    );

    // Also upload uncompressed version for reference
    const uncompressedKey = `${cleanPrefix(cfg.R2_VARIANTS_PREFIX)}/r2-manifest-original.json`;
    yield* putObject(
      cfg.s3,
      cfg.R2_BUCKET,
      uncompressedKey,
      manifestBuffer,
      'application/json',
      {
        'original-size': manifestBuffer.length.toString(),
        note: 'uncompressed-reference',
      },
      {
        cacheControl: 'public, max-age=300, s-maxage=300', // 5 minutes for manifest
      },
    );

    const action = isManifestOnly ? 'regenerated' : 'uploaded';
    yield* Console.log(
      `\n📄 Manifest ${action}: s3://${cfg.R2_BUCKET}/${manifestKey}`,
    );
    yield* Console.log(`   Entries: ${Object.keys(manifest).length}`);
    yield* Console.log(
      `   Compression: ${originalSizeKB} KB → ${compressedSizeKB} KB (${encoding}, ${compressionRatio}%)`,
    );
  }

  const dt = Date.now() - t0;
  const completionMode = isManifestOnly ? 'Manifest regeneration' : 'Upload';
  yield* Console.log(`✅ ${completionMode} done in ${(dt / 1000).toFixed(2)}s`);
}).pipe(Effect.ensuring(shutdownExiftool));

pipe(
  program,
  Effect.catchAll((e) =>
    Effect.gen(function* () {
      const msg = e instanceof Error ? e.message : String(e);
      yield* Console.error(`Error: ${msg}`);
      yield* Effect.sync(() => process.exit(1));
    }),
  ),
).pipe(Effect.runPromise);
