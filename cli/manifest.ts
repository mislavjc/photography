// manifest.ts
// -----------------------------------------------------------------------------
// Generate r2-manifest.json with blurhashes for images in ./images/
// Uploads manifest directly to R2 (remote only)

import path from 'node:path';

import { config } from 'dotenv';
import { Console, Effect, pipe } from 'effect';
import fg from 'fast-glob';

import { makeBlurhash } from '../lib/blurhash-utils';

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
  manifest: Record<string, { blurhash: string; w: number; h: number }>,
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
    if (bh.blurhash) {
      manifest[rel] = { blurhash: bh.blurhash, w: bh.w, h: bh.h };
      if (verbose) {
        yield* Console.log(`  🎨 blurhash: ${bh.w}x${bh.h}`);
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

  const manifest: Record<string, { blurhash: string; w: number; h: number }> =
    {};

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
    }
  }
});

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
